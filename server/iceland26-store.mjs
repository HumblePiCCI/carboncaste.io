import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
} from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

const PARTICIPANTS = new Set(['ben', 'mary', 'laura', 'brad']);
const PREFERENCES = new Set(['love', 'interested', 'pass', 'undecided']);
const MAX_ACTIVITY = 240;
const MAX_COMMENTS = 500;
const MAX_SUGGESTIONS = 100;

function cleanText(value, field, maxLength) {
  if (typeof value !== 'string') {
    throw new StoreValidationError(`${field} must be text.`);
  }
  const cleaned = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (!cleaned) throw new StoreValidationError(`${field} cannot be empty.`);
  if (cleaned.length > maxLength) {
    throw new StoreValidationError(`${field} must be ${maxLength} characters or fewer.`);
  }
  return cleaned;
}

function assertParticipant(value) {
  if (!PARTICIPANTS.has(value)) {
    throw new StoreValidationError('Choose Ben, Mary, Laura, or Brad.');
  }
  return value;
}

function defaultState() {
  return {
    schemaVersion: 1,
    revision: 0,
    updatedAt: null,
    preferences: {},
    comments: [],
    suggestions: [],
    activity: [],
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isStoredText(value, maxLength) {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function isTimestamp(value) {
  return typeof value === 'string'
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function validateStoredState(value) {
  if (!isPlainObject(value) || value.schemaVersion !== 1) {
    throw new Error('Unsupported Iceland coordination state schema.');
  }
  if (!Number.isSafeInteger(value.revision) || value.revision < 0) {
    throw new Error('Invalid Iceland coordination state revision.');
  }
  if (value.updatedAt !== null && !isTimestamp(value.updatedAt)) {
    throw new Error('Invalid Iceland coordination update timestamp.');
  }
  if (!isPlainObject(value.preferences)) {
    throw new Error('Invalid state field: preferences.');
  }
  for (const [optionId, votes] of Object.entries(value.preferences)) {
    if (!isStoredText(optionId, 120) || !isPlainObject(votes)) {
      throw new Error('Invalid stored preference record.');
    }
    for (const [participant, preference] of Object.entries(votes)) {
      if (!PARTICIPANTS.has(participant) || !PREFERENCES.has(preference) || preference === 'undecided') {
        throw new Error('Invalid stored participant preference.');
      }
    }
  }
  if (!Array.isArray(value.comments) || value.comments.length > MAX_COMMENTS) {
    throw new Error('Invalid state field: comments.');
  }
  for (const comment of value.comments) {
    if (!isPlainObject(comment)
        || !isStoredText(comment.id, 120)
        || !PARTICIPANTS.has(comment.participant)
        || !isStoredText(comment.optionId, 120)
        || !isStoredText(comment.text, 600)
        || !isTimestamp(comment.createdAt)) {
      throw new Error('Invalid stored comment.');
    }
  }
  if (!Array.isArray(value.suggestions) || value.suggestions.length > MAX_SUGGESTIONS) {
    throw new Error('Invalid state field: suggestions.');
  }
  for (const suggestion of value.suggestions) {
    if (!isPlainObject(suggestion)
        || !suggestion.id?.startsWith('custom-')
        || !isStoredText(suggestion.id, 120)
        || !isStoredText(suggestion.title, 90)
        || !isStoredText(suggestion.location, 70)
        || !isStoredText(suggestion.details, 500)
        || !PARTICIPANTS.has(suggestion.createdBy)
        || !isTimestamp(suggestion.createdAt)) {
      throw new Error('Invalid stored suggestion.');
    }
  }
  if (!Array.isArray(value.activity) || value.activity.length > MAX_ACTIVITY) {
    throw new Error('Invalid state field: activity.');
  }
  for (const entry of value.activity) {
    if (!isPlainObject(entry)
        || !isStoredText(entry.id, 120)
        || !isStoredText(entry.type, 40)
        || !PARTICIPANTS.has(entry.participant)
        || !isTimestamp(entry.at)) {
      throw new Error('Invalid stored activity entry.');
    }
  }
  return value;
}

async function syncDirectory(path) {
  let directoryHandle;
  try {
    directoryHandle = await open(path, 'r');
    await directoryHandle.sync();
  } finally {
    await directoryHandle?.close();
  }
}

async function writeJsonAtomically(path, value) {
  const parent = dirname(path);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  let temporaryHandle;
  try {
    temporaryHandle = await open(temporaryPath, 'wx', 0o600);
    await temporaryHandle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await temporaryHandle.sync();
    await temporaryHandle.close();
    temporaryHandle = null;
    await rename(temporaryPath, path);
    await syncDirectory(parent);
  } catch (error) {
    await temporaryHandle?.close();
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

function activityEntry(type, participant, details = {}) {
  return {
    id: randomUUID(),
    type,
    participant,
    at: new Date().toISOString(),
    ...details,
  };
}

export class StoreValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StoreValidationError';
  }
}

export async function createIceland26Store({ dataPath, catalogOptionIds }) {
  const catalogIds = new Set(catalogOptionIds);
  let currentState = defaultState();
  let loadError = null;
  let mutationQueue = Promise.resolve();

  try {
    currentState = validateStoredState(JSON.parse(await readFile(dataPath, 'utf8')));
  } catch (error) {
    if (error?.code !== 'ENOENT') loadError = error;
  }

  function ensureWritable() {
    if (loadError) {
      const error = new Error('The coordination state is unavailable until its data file is repaired.');
      error.cause = loadError;
      error.code = 'E_STATE_UNAVAILABLE';
      throw error;
    }
  }

  function knownOption(optionId, state = currentState) {
    return catalogIds.has(optionId) || state.suggestions.some((suggestion) => suggestion.id === optionId);
  }

  function snapshot() {
    if (loadError) {
      return {
        available: false,
        error: 'Coordination updates are temporarily unavailable.',
      };
    }
    return {
      available: true,
      ...structuredClone(currentState),
    };
  }

  function mutate(mutator) {
    const operation = mutationQueue.then(async () => {
      ensureWritable();
      const next = structuredClone(currentState);
      const result = mutator(next);
      next.revision += 1;
      next.updatedAt = new Date().toISOString();
      next.activity = next.activity.slice(-MAX_ACTIVITY);
      next.comments = next.comments.slice(-MAX_COMMENTS);
      await writeJsonAtomically(`${dataPath}.previous`, currentState);
      await writeJsonAtomically(dataPath, next);
      currentState = next;
      return { state: snapshot(), result };
    });
    mutationQueue = operation.catch(() => undefined);
    return operation;
  }

  return {
    snapshot,
    loadError: () => loadError,

    setPreference(input) {
      const participant = assertParticipant(input?.participant);
      const optionId = cleanText(input?.optionId, 'optionId', 120);
      if (!PREFERENCES.has(input?.preference)) {
        throw new StoreValidationError('Preference must be love, interested, pass, or undecided.');
      }
      return mutate((next) => {
        if (!knownOption(optionId, next)) throw new StoreValidationError('That itinerary option does not exist.');
        next.preferences[optionId] ||= {};
        if (input.preference === 'undecided') {
          delete next.preferences[optionId][participant];
          if (!Object.keys(next.preferences[optionId]).length) delete next.preferences[optionId];
        } else {
          next.preferences[optionId][participant] = input.preference;
        }
        next.activity.push(activityEntry('preference', participant, {
          optionId,
          preference: input.preference,
        }));
      });
    },

    addComment(input) {
      const participant = assertParticipant(input?.participant);
      const optionId = cleanText(input?.optionId, 'optionId', 120);
      const text = cleanText(input?.text, 'Comment', 600);
      return mutate((next) => {
        if (!knownOption(optionId, next)) throw new StoreValidationError('That itinerary option does not exist.');
        const comment = {
          id: randomUUID(),
          participant,
          optionId,
          text,
          createdAt: new Date().toISOString(),
        };
        next.comments.push(comment);
        next.activity.push(activityEntry('comment', participant, {
          optionId,
          commentId: comment.id,
        }));
        return comment;
      });
    },

    addSuggestion(input) {
      const participant = assertParticipant(input?.participant);
      const title = cleanText(input?.title, 'Title', 90);
      const location = cleanText(input?.location, 'Location', 70);
      const details = cleanText(input?.details, 'Details', 500);
      return mutate((next) => {
        if (next.suggestions.length >= MAX_SUGGESTIONS) {
          throw new StoreValidationError('The shared idea list is full.');
        }
        const suggestion = {
          id: `custom-${randomUUID()}`,
          title,
          location,
          details,
          createdBy: participant,
          createdAt: new Date().toISOString(),
        };
        next.suggestions.push(suggestion);
        next.preferences[suggestion.id] = { [participant]: 'interested' };
        next.activity.push(activityEntry('suggestion', participant, {
          optionId: suggestion.id,
          title,
        }));
        return suggestion;
      });
    },
  };
}
