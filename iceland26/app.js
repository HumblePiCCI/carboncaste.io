const participantNames = {
  ben: 'Ben',
  mary: 'Mary',
  laura: 'Laura',
  brad: 'Brad',
};
const participantInitials = {
  ben: 'BE',
  mary: 'MA',
  laura: 'LA',
  brad: 'BR',
};
const participantIds = Object.keys(participantNames);
const positivePreferences = new Set(['love', 'interested']);

const elements = {
  participant: document.querySelector('#participant-select'),
  syncDot: document.querySelector('#sync-dot'),
  syncStatus: document.querySelector('#sync-status'),
  baseline: document.querySelector('#baseline-list'),
  date: document.querySelector('#trip-date'),
  countLegs: document.querySelector('#count-legs'),
  countOptions: document.querySelector('#count-options'),
  countStandouts: document.querySelector('#count-standouts'),
  countAgreements: document.querySelector('#count-agreements'),
  legPicker: document.querySelector('#leg-picker'),
  routePanel: document.querySelector('#route-panel'),
  legHeader: document.querySelector('#leg-header'),
  optionList: document.querySelector('#option-list'),
  pulseSummary: document.querySelector('#pulse-summary'),
  topAlignment: document.querySelector('#top-alignment'),
  notesGrid: document.querySelector('#notes-grid'),
  ideaDialog: document.querySelector('#idea-dialog'),
  ideaForm: document.querySelector('#idea-form'),
  toast: document.querySelector('#toast'),
};

let itinerary = null;
let sharedState = {
  available: false,
  revision: 0,
  preferences: {},
  comments: [],
  suggestions: [],
  activity: [],
};
let activeLegId = null;
let activeFilter = 'all';
const expandedComments = new Set();
const commentDrafts = new Map();
let toastTimer = null;
let refreshTimer = null;

function createElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function setSync(mode, text) {
  elements.syncDot.classList.toggle('is-live', mode === 'live');
  elements.syncDot.classList.toggle('is-error', mode === 'error');
  elements.syncStatus.textContent = text;
}

function showToast(message, isError = false) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle('is-error', isError);
  elements.toast.classList.add('is-visible');
  toastTimer = setTimeout(() => elements.toast.classList.remove('is-visible'), 3600);
}

function currentParticipant() {
  return participantIds.includes(elements.participant.value)
    ? elements.participant.value
    : null;
}

function requireParticipant() {
  const participant = currentParticipant();
  if (participant) return participant;
  elements.participant.focus();
  showToast('Choose your name first so the board knows whose preference this is.', true);
  return null;
}

function communityLeg() {
  if (!sharedState.suggestions?.length) return null;
  return {
    id: 'shared-ideas',
    number: String(itinerary.legs.length + 1).padStart(2, '0'),
    title: 'Ideas from the group',
    dates: 'Any open chapter',
    route: 'Added live by Ben, Mary, Laura or Brad',
    summary: 'Fresh suggestions begin as open possibilities. They become a group yes by the same four-person rule as every researched option.',
    options: sharedState.suggestions.map((suggestion) => ({
      ...suggestion,
      status: 'community',
      standout: false,
      hook: suggestion.details,
      planningContext: `Added by ${participantNames[suggestion.createdBy] || 'the group'}.`,
      tags: ['community', 'weather-flex'],
      logistics: [suggestion.location, 'Shared idea'],
      sources: [],
    })),
  };
}

function allLegs() {
  const extra = communityLeg();
  return extra ? [...itinerary.legs, extra] : itinerary.legs;
}

function allOptions() {
  return allLegs().flatMap((leg) => leg.options.map((option) => ({
    ...option,
    legId: leg.id,
    legTitle: leg.title,
  })));
}

function votesFor(optionId) {
  return sharedState.preferences?.[optionId] || {};
}

function consensusFor(optionId) {
  const votes = votesFor(optionId);
  const values = participantIds.map((participant) => votes[participant] || 'undecided');
  const love = values.filter((value) => value === 'love').length;
  const interested = values.filter((value) => value === 'interested').length;
  const pass = values.filter((value) => value === 'pass').length;
  const decided = love + interested + pass;
  const positive = love + interested;
  const agreement = positive === participantIds.length;
  const split = pass > 0 && positive > 0;
  const promising = positive === 3 && pass === 0 && decided === 3;
  const score = (love * 3) + (interested * 2) - (pass * 2);
  return { love, interested, pass, decided, positive, agreement, split, promising, score };
}

function consensusText(consensus) {
  if (consensus.agreement) return 'Group yes · all four are in';
  if (consensus.split) return 'Worth a conversation · preferences differ';
  if (consensus.promising) return 'Promising · one voice left';
  if (consensus.decided === 0) return 'Open · nobody has weighed in yet';
  return `${consensus.decided}/4 planners have weighed in`;
}

function renderBaseline() {
  elements.date.textContent = `${itinerary.trip.dateLabel} · 17 days · clockwise`;
  elements.baseline.replaceChildren();
  itinerary.trip.baseline.forEach((item, index) => {
    const li = createElement('li');
    li.append(
      createElement('span', null, String(index + 1).padStart(2, '0')),
      document.createTextNode(item),
    );
    elements.baseline.append(li);
  });
}

function renderCounts() {
  const options = allOptions();
  const agreements = options.filter((option) => consensusFor(option.id).agreement).length;
  elements.countLegs.textContent = String(itinerary.legs.length);
  elements.countOptions.textContent = String(options.length);
  elements.countStandouts.textContent = String(options.filter((option) => option.standout).length);
  elements.countAgreements.textContent = String(agreements);
}

function renderLegPicker() {
  const legs = allLegs();
  if (!legs.some((leg) => leg.id === activeLegId)) activeLegId = legs[0]?.id || null;
  elements.legPicker.replaceChildren();
  legs.forEach((leg) => {
    const button = createElement('button', 'leg-tab');
    button.type = 'button';
    button.role = 'tab';
    button.id = `leg-tab-${leg.id}`;
    button.dataset.legId = leg.id;
    button.setAttribute('aria-controls', 'route-panel');
    button.setAttribute('aria-selected', String(leg.id === activeLegId));
    button.tabIndex = leg.id === activeLegId ? 0 : -1;
    button.classList.toggle('is-active', leg.id === activeLegId);
    button.append(
      createElement('strong', null, leg.title),
      createElement('span', null, leg.dates),
    );
    elements.legPicker.append(button);
  });
}

function renderLegHeader(leg) {
  elements.legHeader.replaceChildren();
  const number = createElement('span', 'leg-number', leg.number);
  const copy = createElement('div');
  copy.append(
    createElement('h3', null, leg.title),
    createElement('p', null, leg.summary),
  );
  const meta = createElement('div', 'leg-meta');
  meta.append(
    createElement('span', null, leg.dates),
    createElement('span', null, leg.route),
  );
  copy.append(meta);
  elements.legHeader.append(number, copy);
}

function renderBadges(option) {
  const wrap = createElement('div', 'option-card__meta');
  if (option.standout) wrap.append(createElement('span', 'badge badge--standout', '★ Research standout'));
  if (option.status && option.status !== 'open') {
    const labels = {
      booked: 'Booked anchor',
      fixed: 'Fixed date',
      planned: 'In the current plan',
      priority: 'Research priority',
      conditional: 'Conditional',
      community: 'Group suggestion',
    };
    const badge = createElement('span', 'badge', labels[option.status] || option.status);
    if (option.status === 'booked') badge.classList.add('badge--booked');
    if (option.status === 'fixed') badge.classList.add('badge--fixed');
    wrap.append(badge);
  }
  return wrap;
}

function safeSourceLink(source) {
  try {
    const url = new URL(source.url);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    const link = createElement('a', null, `${source.label} ↗`);
    link.href = url.href;
    link.target = '_blank';
    link.rel = 'noreferrer noopener';
    if (source.type) link.title = `${source.type} source`;
    return link;
  } catch {
    return null;
  }
}

function renderOptionCopy(option) {
  const copy = createElement('div', 'option-card__copy');
  copy.append(
    renderBadges(option),
    createElement('h3', null, option.title),
    createElement('p', 'option-card__hook', option.hook),
  );
  if (option.reviewSignal) {
    copy.append(createElement('p', 'signal-quote', option.reviewSignal));
  }
  if (option.planningContext) {
    const context = createElement('p', 'option-card__hook');
    const label = createElement('strong', null, 'Planning state: ');
    context.append(label, document.createTextNode(option.planningContext));
    copy.append(context);
  }
  if (option.logistics?.length) {
    const list = createElement('ul', 'logistics');
    option.logistics.forEach((item) => list.append(createElement('li', null, item)));
    copy.append(list);
  }
  if (option.sources?.length) {
    const links = createElement('div', 'source-links');
    option.sources.map(safeSourceLink).filter(Boolean).forEach((link) => links.append(link));
    copy.append(links);
  }
  return copy;
}

function renderChoicePanel(option) {
  const panel = createElement('aside', 'choice-panel');
  const participant = currentParticipant();
  panel.append(createElement(
    'p',
    'choice-panel__label',
    participant ? `What does ${participantNames[participant]} think?` : 'Choose your name, then weigh in',
  ));

  const current = participant ? votesFor(option.id)[participant] : null;
  const buttons = createElement('div', 'choice-buttons');
  [
    ['love', 'Love it', '♥'],
    ['interested', 'Interested', '+'],
    ['pass', 'Not for me', '−'],
  ].forEach(([value, label, symbol]) => {
    const button = createElement('button', 'choice');
    button.type = 'button';
    button.dataset.action = 'preference';
    button.dataset.optionId = option.id;
    button.dataset.preference = value;
    button.classList.toggle('is-selected', current === value);
    button.setAttribute('aria-pressed', String(current === value));
    button.append(createElement('span', null, label), createElement('span', null, symbol));
    buttons.append(button);
  });
  panel.append(buttons);

  const avatars = createElement('div', 'group-votes');
  avatars.setAttribute('aria-label', 'Group preferences');
  avatars.setAttribute('role', 'list');
  participantIds.forEach((id) => {
    const value = votesFor(option.id)[id] || 'undecided';
    const avatar = createElement('span', 'vote-avatar', participantInitials[id]);
    avatar.dataset.value = value;
    const preferenceLabel = {
      love: 'Love it',
      interested: 'Interested',
      pass: 'Not for me',
      undecided: 'Undecided',
    }[value];
    avatar.title = `${participantNames[id]}: ${preferenceLabel}`;
    avatar.setAttribute('role', 'listitem');
    avatar.setAttribute('aria-label', `${participantNames[id]}: ${preferenceLabel}`);
    avatars.append(avatar);
  });
  panel.append(avatars);

  const consensus = consensusFor(option.id);
  panel.append(createElement('p', 'consensus-label', consensusText(consensus)));

  const comments = sharedState.comments?.filter((comment) => comment.optionId === option.id) || [];
  const toggle = createElement(
    'button',
    'comment-toggle',
    `${expandedComments.has(option.id) ? 'Hide' : 'Open'} discussion · ${comments.length}`,
  );
  toggle.type = 'button';
  toggle.dataset.action = 'toggle-comments';
  toggle.dataset.optionId = option.id;
  panel.append(toggle);
  return panel;
}

function renderComments(option) {
  const wrap = createElement('section', 'comments');
  wrap.hidden = !expandedComments.has(option.id);
  wrap.id = `comments-${option.id}`;
  const comments = sharedState.comments?.filter((comment) => comment.optionId === option.id) || [];
  if (!comments.length) wrap.append(createElement('p', 'comment', 'No notes yet. Start the conversation.'));
  comments.forEach((comment) => {
    const item = createElement('p', 'comment');
    item.append(
      createElement('strong', null, participantNames[comment.participant] || comment.participant),
      document.createTextNode(comment.text),
    );
    const time = createElement('time', null, new Date(comment.createdAt).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }));
    time.dateTime = comment.createdAt;
    item.append(time);
    wrap.append(item);
  });
  const form = createElement('form', 'comment-form');
  form.dataset.optionId = option.id;
  const input = createElement('input');
  input.name = 'comment';
  input.maxLength = 600;
  input.required = true;
  input.value = commentDrafts.get(option.id) || '';
  input.placeholder = 'Add a practical note or question';
  input.setAttribute('aria-label', `Comment on ${option.title}`);
  const button = createElement('button', null, 'Post');
  button.type = 'submit';
  form.append(input, button);
  wrap.append(form);
  return wrap;
}

function optionMatchesFilter(option) {
  if (activeFilter === 'all') return true;
  if (activeFilter === 'standout') return Boolean(option.standout);
  return option.tags?.includes(activeFilter);
}

function renderOptions(leg) {
  elements.optionList.replaceChildren();
  const options = leg.options.filter(optionMatchesFilter);
  if (!options.length) {
    elements.optionList.append(createElement(
      'p',
      'empty-state',
      'Nothing in this chapter matches that filter yet.',
    ));
    return;
  }
  options.forEach((option) => {
    const card = createElement('article', 'option-card');
    card.dataset.optionId = option.id;
    card.append(
      renderOptionCopy(option),
      renderChoicePanel(option),
      renderComments(option),
    );
    elements.optionList.append(card);
  });
}

function renderPulse() {
  const options = allOptions();
  const ranked = options
    .map((option) => ({ option, consensus: consensusFor(option.id) }))
    .sort((left, right) => {
      if (right.consensus.score !== left.consensus.score) {
        return right.consensus.score - left.consensus.score;
      }
      return Number(right.option.standout) - Number(left.option.standout);
    });
  const agreements = ranked.filter(({ consensus }) => consensus.agreement).length;
  const promising = ranked.filter(({ consensus }) => consensus.promising).length;
  const voices = sharedState.activity?.filter((entry) => entry.type === 'preference').length || 0;
  const open = ranked.filter(({ consensus }) => consensus.decided === 0).length;

  elements.pulseSummary.replaceChildren();
  [
    [agreements, 'Group yes'],
    [promising, 'Nearly there'],
    [voices, 'Preference updates'],
    [open, 'Untouched ideas'],
  ].forEach(([value, label]) => {
    const metric = createElement('div', 'pulse-metric');
    metric.append(createElement('strong', null, String(value)), createElement('span', null, label));
    elements.pulseSummary.append(metric);
  });

  const voted = ranked.filter(({ consensus }) => consensus.decided > 0);
  const shortlist = (voted.length ? voted : ranked.filter(({ option }) => option.standout)).slice(0, 5);
  elements.topAlignment.replaceChildren();
  shortlist.forEach(({ option, consensus }, index) => {
    const item = createElement('div', 'alignment-item');
    const copy = createElement('div');
    copy.append(
      createElement('strong', null, option.title),
      createElement(
        'span',
        null,
        consensus.decided ? consensusText(consensus) : `Research standout · ${option.legTitle}`,
      ),
    );
    item.append(
      createElement('span', 'alignment-item__rank', String(index + 1).padStart(2, '0')),
      copy,
      createElement('strong', 'alignment-item__score', consensus.decided ? `${consensus.score}pt` : '★'),
    );
    elements.topAlignment.append(item);
  });
}

function renderFieldNotes() {
  elements.notesGrid.replaceChildren();
  itinerary.fieldNotes.forEach((note, index) => {
    const card = createElement('article', 'note-card');
    card.append(
      createElement('span', 'note-card__index', String(index + 1).padStart(2, '0')),
      createElement('h3', null, note.title),
      createElement('p', null, note.body),
    );
    elements.notesGrid.append(card);
  });
}

function render() {
  if (!itinerary) return;
  const focusedComment = document.activeElement?.matches('.comment-form input')
    ? {
      optionId: document.activeElement.closest('.comment-form')?.dataset.optionId,
      selectionStart: document.activeElement.selectionStart,
      selectionEnd: document.activeElement.selectionEnd,
    }
    : null;
  renderBaseline();
  renderCounts();
  renderLegPicker();
  const leg = allLegs().find((candidate) => candidate.id === activeLegId) || allLegs()[0];
  if (leg) {
    activeLegId = leg.id;
    elements.routePanel.setAttribute('aria-labelledby', `leg-tab-${leg.id}`);
    renderLegHeader(leg);
    renderOptions(leg);
  }
  renderPulse();
  renderFieldNotes();
  if (focusedComment?.optionId) {
    const input = [...elements.optionList.querySelectorAll('.comment-form')]
      .find((form) => form.dataset.optionId === focusedComment.optionId)
      ?.elements.comment;
    if (input) {
      input.focus({ preventScroll: true });
      input.setSelectionRange(focusedComment.selectionStart, focusedComment.selectionEnd);
    }
  }
}

async function fetchJson(path, options = {}) {
  const response = await fetch(path, {
    cache: 'no-store',
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`The server returned an unreadable response (${response.status}).`);
  }
  if (response.status === 401) {
    const next = `${window.location.pathname}${window.location.search}`;
    window.location.assign(`/iceland26/access.html?next=${encodeURIComponent(next)}`);
    throw new Error('Your trip session expired. Enter the shared code again.');
  }
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload;
}

async function mutate(path, body) {
  setSync('loading', 'Saving your update…');
  try {
    const payload = await fetchJson(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (!sharedState.available || payload.state.revision > sharedState.revision) {
      sharedState = payload.state;
      render();
    }
    setSync('live', `Shared board live · revision ${sharedState.revision}`);
    return payload.result;
  } catch (error) {
    setSync('error', 'Update failed · nothing was changed');
    showToast(error.message, true);
    throw error;
  }
}

async function refreshState({ quiet = false } = {}) {
  try {
    const incoming = await fetchJson('/api/iceland26');
    if (incoming.available
        && (!sharedState.available || incoming.revision > sharedState.revision)) {
      sharedState = incoming;
      render();
    } else if (!incoming.available && !sharedState.available) {
      sharedState = incoming;
    }
    if (incoming.available) {
      setSync('live', `Shared board live · revision ${sharedState.revision}`);
    } else {
      setSync('error', 'Board is temporarily read-only');
    }
  } catch (error) {
    setSync('error', 'Offline · showing the last loaded route');
    if (!quiet) showToast(error.message, true);
  }
}

async function load() {
  const rememberedParticipant = localStorage.getItem('iceland26-participant');
  if (participantIds.includes(rememberedParticipant)) elements.participant.value = rememberedParticipant;
  try {
    const [tripData, stateData] = await Promise.all([
      fetchJson('/iceland26/itinerary.json'),
      fetchJson('/api/iceland26'),
    ]);
    itinerary = tripData;
    sharedState = stateData;
    activeLegId = itinerary.legs[0]?.id || null;
    render();
    if (stateData.available) {
      setSync('live', `Shared board live · revision ${stateData.revision}`);
    } else {
      setSync('error', 'Board is temporarily read-only');
    }
  } catch (error) {
    setSync('error', 'The shared board could not load');
    showToast(error.message, true);
  }
  refreshTimer = setInterval(() => {
    if (document.visibilityState === 'visible') refreshState({ quiet: true });
  }, 30_000);
}

elements.participant.addEventListener('change', () => {
  const participant = currentParticipant();
  if (participant) {
    localStorage.setItem('iceland26-participant', participant);
    showToast(`You’re weighing in as ${participantNames[participant]}.`);
  } else {
    localStorage.removeItem('iceland26-participant');
  }
  render();
});

elements.legPicker.addEventListener('click', (event) => {
  const button = event.target.closest('[data-leg-id]');
  if (!button) return;
  activeLegId = button.dataset.legId;
  render();
  document.querySelector('#route-title').scrollIntoView({ block: 'start' });
});

elements.legPicker.addEventListener('keydown', (event) => {
  const current = event.target.closest('[role="tab"]');
  if (!current || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = [...elements.legPicker.querySelectorAll('[role="tab"]')];
  const currentIndex = tabs.indexOf(current);
  let nextIndex = currentIndex;
  if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
  if (event.key === 'Home') nextIndex = 0;
  if (event.key === 'End') nextIndex = tabs.length - 1;
  event.preventDefault();
  activeLegId = tabs[nextIndex].dataset.legId;
  render();
  [...elements.legPicker.querySelectorAll('[role="tab"]')]
    .find((tab) => tab.dataset.legId === activeLegId)
    ?.focus();
});

function setActiveFilter(filter) {
  activeFilter = filter;
  document.querySelectorAll('[data-filter]').forEach((candidate) => {
    const selected = candidate.dataset.filter === activeFilter;
    candidate.classList.toggle('is-active', selected);
    candidate.setAttribute('aria-pressed', String(selected));
  });
}

document.querySelector('.filter-picker').addEventListener('click', (event) => {
  const button = event.target.closest('[data-filter]');
  if (!button) return;
  setActiveFilter(button.dataset.filter);
  render();
});

elements.optionList.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const optionId = button.dataset.optionId;
  if (button.dataset.action === 'toggle-comments') {
    if (expandedComments.has(optionId)) expandedComments.delete(optionId);
    else expandedComments.add(optionId);
    render();
    return;
  }
  if (button.dataset.action === 'preference') {
    const participant = requireParticipant();
    if (!participant || !sharedState.available) return;
    const current = votesFor(optionId)[participant];
    const preference = current === button.dataset.preference ? 'undecided' : button.dataset.preference;
    button.disabled = true;
    try {
      await mutate('/api/iceland26/preference', { participant, optionId, preference });
      showToast(preference === 'undecided' ? 'Preference cleared.' : 'Preference saved for the group.');
    } catch {
      button.disabled = false;
    }
  }
});

elements.optionList.addEventListener('input', (event) => {
  const input = event.target.closest('.comment-form input[name="comment"]');
  if (!input) return;
  const optionId = input.closest('.comment-form')?.dataset.optionId;
  if (!optionId) return;
  if (input.value) commentDrafts.set(optionId, input.value);
  else commentDrafts.delete(optionId);
});

elements.optionList.addEventListener('submit', async (event) => {
  const form = event.target.closest('.comment-form');
  if (!form) return;
  event.preventDefault();
  const participant = requireParticipant();
  if (!participant || !sharedState.available) return;
  const input = form.elements.comment;
  const text = input.value.trim();
  if (!text) return;
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    await mutate('/api/iceland26/comment', {
      participant,
      optionId: form.dataset.optionId,
      text,
    });
    commentDrafts.delete(form.dataset.optionId);
    expandedComments.add(form.dataset.optionId);
    render();
    showToast('Note added to the discussion.');
  } catch {
    button.disabled = false;
  }
});

function openIdeaDialog() {
  if (!requireParticipant()) return;
  elements.ideaDialog.showModal();
  elements.ideaForm.elements.title.focus();
}

function closeIdeaDialog() {
  elements.ideaDialog.close();
}

document.querySelector('#open-idea-dialog').addEventListener('click', openIdeaDialog);
document.querySelector('#close-idea-dialog').addEventListener('click', closeIdeaDialog);
document.querySelector('#cancel-idea-dialog').addEventListener('click', closeIdeaDialog);
elements.ideaDialog.addEventListener('click', (event) => {
  if (event.target === elements.ideaDialog) closeIdeaDialog();
});

elements.ideaForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const participant = requireParticipant();
  if (!participant || !sharedState.available) return;
  const formData = new FormData(elements.ideaForm);
  const submit = elements.ideaForm.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    await mutate('/api/iceland26/suggestion', {
      participant,
      title: formData.get('title'),
      location: formData.get('location'),
      details: formData.get('details'),
    });
    elements.ideaForm.reset();
    closeIdeaDialog();
    activeLegId = 'shared-ideas';
    setActiveFilter('all');
    render();
    showToast('Shared idea added. The group can weigh in now.');
  } catch {
    submit.disabled = false;
  }
});

document.querySelector('#logout-button').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const response = await fetch('/api/iceland26/logout', {
      method: 'POST',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Lock request failed (${response.status}).`);
    localStorage.removeItem('iceland26-participant');
    window.location.assign('/iceland26/access.html');
  } catch {
    button.disabled = false;
    showToast('The board could not be locked. You are still signed in; try again.', true);
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && itinerary) refreshState({ quiet: true });
});

window.addEventListener('beforeunload', () => clearInterval(refreshTimer));

load();
