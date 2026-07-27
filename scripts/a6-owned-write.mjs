import { createHash } from 'node:crypto';
import {
  constants,
  lstat,
  mkdir,
  open,
  readdir,
} from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_PAYLOAD_BYTES = 16 * 1024 * 1024;

function custodyError(message) {
  const error = new Error(`A6 owned write refused: ${message}`);
  error.code = 'E_WRITE_CUSTODY';
  return error;
}

function identity(stats) {
  return `${stats.dev}:${stats.ino}`;
}

function mode(stats) {
  return Number(stats.mode & 0o777n);
}

function hash(body) {
  return createHash('sha256').update(body).digest('hex');
}

function scopeFor({ kind, path, ownerToken, serviceRoot, targetName = '' }) {
  if (!/^[0-9a-f]{32}$/.test(ownerToken)) {
    throw custodyError('owner token is not exact');
  }
  const root = resolve(serviceRoot);
  const ownedPath = resolve(path);
  const name = basename(ownedPath);
  let markerName = '';
  let allowedTargets = [];
  if (kind === 'staging') {
    if (dirname(ownedPath) !== root
        || !new RegExp(
          `^incoming-[0-9a-f]{40}-[0-9]{8}T[0-9]{6}Z-${ownerToken}$`,
        ).test(name)) {
      throw custodyError('staging path is outside its exact boundary');
    }
    markerName = '.staging-owner';
    allowedTargets = [
      'EXPECTED_NEW_TREE_MANIFEST',
      'EXPECTED_PREVIOUS_TREE_MANIFEST',
    ];
  } else if (kind === 'rollback') {
    if (dirname(ownedPath) !== root || name !== `rollback-verify-${ownerToken}`) {
      throw custodyError('rollback path is outside its exact boundary');
    }
    markerName = '.rollback-owner';
    allowedTargets = [
      'verify-release-tree.mjs',
      'target.manifest',
      'current.manifest',
    ];
  } else if (kind === 'promotion') {
    const stagingName = new RegExp(
      `^incoming-[0-9a-f]{40}-[0-9]{8}T[0-9]{6}Z-${ownerToken}$`,
    );
    const candidateName = new RegExp(
      `^\\.previous-[0-9a-f]{40}-${ownerToken}$`,
    );
    const isStaging = dirname(ownedPath) === root && stagingName.test(name);
    const isCandidate = dirname(ownedPath) === join(root, 'releases')
      && candidateName.test(name);
    if (!isStaging && !isCandidate) {
      throw custodyError('promotion path is outside its exact boundary');
    }
    markerName = isStaging ? '.staging-owner' : '';
    allowedTargets = ['RELEASE_TREE_MANIFEST', 'RELEASE_TREE', 'REVISION'];
  } else {
    throw custodyError('write kind is unsupported');
  }
  if (targetName && !allowedTargets.includes(targetName)) {
    throw custodyError('target name is not allowed for this boundary');
  }
  return {
    markerName,
    ownedPath,
    root,
  };
}

function requireLinuxDescriptors() {
  if (process.platform !== 'linux'
      || !constants.O_DIRECTORY
      || !constants.O_NOFOLLOW) {
    throw custodyError('Linux O_DIRECTORY and O_NOFOLLOW are required');
  }
}

async function readHandleAtStart(handle, expectedSize) {
  if (expectedSize > MAX_PAYLOAD_BYTES) {
    throw custodyError('payload exceeds the exact size limit');
  }
  const body = Buffer.alloc(expectedSize);
  let offset = 0;
  while (offset < body.length) {
    const { bytesRead } = await handle.read(
      body,
      offset,
      body.length - offset,
      offset,
    );
    if (!bytesRead) throw custodyError('created file ended before its recorded size');
    offset += bytesRead;
  }
  return body;
}

async function readInput(stream) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    const body = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += body.length;
    if (size > MAX_PAYLOAD_BYTES) throw custodyError('input exceeds the exact size limit');
    chunks.push(body);
  }
  return Buffer.concat(chunks);
}

async function openOwnedDirectory(path, expectedIdentity) {
  const handle = await open(
    path,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  const pinned = await handle.stat({ bigint: true });
  const pathname = await lstat(path, { bigint: true });
  if (!pinned.isDirectory()
      || identity(pinned) !== expectedIdentity
      || identity(pathname) !== expectedIdentity
      || !pathname.isDirectory()
      || pathname.isSymbolicLink()) {
    await handle.close();
    throw custodyError('owned directory identity changed');
  }
  return handle;
}

async function verifyMarker({
  directoryHandle,
  markerName,
  expectedIdentity,
  ownerToken,
}) {
  if (!markerName) {
    if (expectedIdentity) throw custodyError('marker identity is unexpected');
    return;
  }
  if (!/^[0-9]+:[0-9]+$/.test(expectedIdentity)) {
    throw custodyError('marker identity is not exact');
  }
  const markerPath = `/proc/${process.pid}/fd/${directoryHandle.fd}/${markerName}`;
  const markerHandle = await open(
    markerPath,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    const before = await markerHandle.stat({ bigint: true });
    const body = await markerHandle.readFile();
    const after = await markerHandle.stat({ bigint: true });
    const pathname = await lstat(markerPath, { bigint: true });
    if (!before.isFile()
        || before.nlink !== 1n
        || mode(before) !== 0o600
        || identity(before) !== expectedIdentity
        || identity(after) !== expectedIdentity
        || after.nlink !== 1n
        || identity(pathname) !== expectedIdentity
        || !body.equals(Buffer.from(`${ownerToken}\n`))) {
      throw custodyError('owner receipt changed');
    }
  } finally {
    await markerHandle.close();
  }
}

export async function createOwnedDirectory(options, hooks = {}) {
  requireLinuxDescriptors();
  const kind = String(options.kind || '');
  const ownerToken = String(options.ownerToken || '');
  const serviceRoot = resolve(String(options.serviceRoot || ''));
  const path = resolve(String(options.path || ''));
  const { markerName } = scopeFor({
    kind,
    path,
    ownerToken,
    serviceRoot,
  });
  await mkdir(path, { mode: 0o700 });
  const directoryHandle = await open(
    path,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  let markerHandle;
  try {
    const directoryStats = await directoryHandle.stat({ bigint: true });
    const directoryIdentity = identity(directoryStats);
    const publicStats = await lstat(path, { bigint: true });
    if (!directoryStats.isDirectory()
        || mode(directoryStats) !== 0o700
        || identity(publicStats) !== directoryIdentity
        || publicStats.isSymbolicLink()
        || (await readdir(`/proc/${process.pid}/fd/${directoryHandle.fd}`)).length) {
      throw custodyError('new owned directory is not exact and empty');
    }
    const markerPath = `/proc/${process.pid}/fd/${directoryHandle.fd}/${markerName}`;
    await hooks.beforeMarkerOpen?.({ markerPath, path });
    markerHandle = await open(
      markerPath,
      constants.O_WRONLY
        | constants.O_CREAT
        | constants.O_EXCL
        | constants.O_NOFOLLOW,
      0o600,
    );
    const markerBefore = await markerHandle.stat({ bigint: true });
    const markerIdentity = identity(markerBefore);
    if (!markerBefore.isFile()
        || markerBefore.nlink !== 1n
        || mode(markerBefore) !== 0o600) {
      throw custodyError('new owner receipt is not an exact regular file');
    }
    await markerHandle.writeFile(`${ownerToken}\n`);
    await markerHandle.sync();
    await hooks.afterMarkerWrite?.({
      markerPath,
      markerIdentity,
      path,
    });
    const markerAfter = await markerHandle.stat({ bigint: true });
    const markerPublic = await lstat(join(path, markerName), { bigint: true });
    const markerBody = await open(
      `/proc/${process.pid}/fd/${directoryHandle.fd}/${markerName}`,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      if (identity(markerAfter) !== markerIdentity
          || markerAfter.nlink !== 1n
          || mode(markerAfter) !== 0o600
          || identity(markerPublic) !== markerIdentity
          || !(await markerBody.readFile()).equals(Buffer.from(`${ownerToken}\n`))) {
        throw custodyError('owner receipt changed while it was created');
      }
    } finally {
      await markerBody.close();
    }
    const directoryAfter = await lstat(path, { bigint: true });
    const entries = await readdir(`/proc/${process.pid}/fd/${directoryHandle.fd}`);
    if (identity(directoryAfter) !== directoryIdentity
        || entries.length !== 1
        || entries[0] !== markerName) {
      throw custodyError('owned directory changed while its receipt was created');
    }
    return {
      directoryIdentity,
      markerIdentity,
    };
  } finally {
    await markerHandle?.close();
    await directoryHandle.close();
  }
}

export async function writeOwnedFile(options, payload, hooks = {}) {
  requireLinuxDescriptors();
  const kind = String(options.kind || '');
  const path = resolve(String(options.path || ''));
  const expectedDirectoryIdentity = String(options.expectedDirectoryIdentity || '');
  const expectedMarkerIdentity = String(options.expectedMarkerIdentity || '');
  const ownerToken = String(options.ownerToken || '');
  const targetName = String(options.targetName || '');
  const expectedSha = String(options.expectedSha || '');
  const serviceRoot = resolve(String(options.serviceRoot || ''));
  if (!/^[0-9]+:[0-9]+$/.test(expectedDirectoryIdentity)
      || !/^[0-9a-f]{64}$/.test(expectedSha)
      || hash(payload) !== expectedSha) {
    throw custodyError('directory identity or payload hash is not exact');
  }
  const { markerName } = scopeFor({
    kind,
    path,
    ownerToken,
    serviceRoot,
    targetName,
  });
  const directoryHandle = await openOwnedDirectory(path, expectedDirectoryIdentity);
  let targetHandle;
  try {
    await verifyMarker({
      directoryHandle,
      markerName,
      expectedIdentity: expectedMarkerIdentity,
      ownerToken,
    });
    const targetPath = `/proc/${process.pid}/fd/${directoryHandle.fd}/${targetName}`;
    await hooks.beforeTargetOpen?.({ targetPath, path });
    targetHandle = await open(
      targetPath,
      constants.O_RDWR
        | constants.O_CREAT
        | constants.O_EXCL
        | constants.O_NOFOLLOW,
      0o600,
    );
    const targetBefore = await targetHandle.stat({ bigint: true });
    const targetIdentity = identity(targetBefore);
    if (!targetBefore.isFile()
        || targetBefore.nlink !== 1n
        || mode(targetBefore) !== 0o600) {
      throw custodyError('new target is not an exact regular file');
    }
    await targetHandle.writeFile(payload);
    await targetHandle.sync();
    await hooks.afterTargetWrite?.({
      publicTarget: join(path, targetName),
      targetIdentity,
      targetPath,
    });
    const targetAfter = await targetHandle.stat({ bigint: true });
    const targetBody = await readHandleAtStart(targetHandle, Number(targetAfter.size));
    const targetPublic = await lstat(join(path, targetName), { bigint: true });
    const directoryAfter = await lstat(path, { bigint: true });
    if (identity(targetAfter) !== targetIdentity
        || targetAfter.nlink !== 1n
        || mode(targetAfter) !== 0o600
        || identity(targetPublic) !== targetIdentity
        || !targetPublic.isFile()
        || targetPublic.isSymbolicLink()
        || hash(targetBody) !== expectedSha
        || identity(directoryAfter) !== expectedDirectoryIdentity) {
      throw custodyError('target or owned directory changed while writing');
    }
    await verifyMarker({
      directoryHandle,
      markerName,
      expectedIdentity: expectedMarkerIdentity,
      ownerToken,
    });
    return { targetIdentity };
  } finally {
    await targetHandle?.close();
    await directoryHandle.close();
  }
}

export async function runCli(args, input = process.stdin) {
  const [command, ...values] = args;
  if (command === 'create') {
    const [kind, path, ownerToken, serviceRoot] = values;
    const receipt = await createOwnedDirectory({
      kind,
      path,
      ownerToken,
      serviceRoot,
    });
    process.stdout.write(`${receipt.directoryIdentity} ${receipt.markerIdentity}\n`);
    return;
  }
  if (command === 'write') {
    const [
      kind,
      path,
      expectedDirectoryIdentity,
      expectedMarkerIdentity,
      ownerToken,
      targetName,
      expectedSha,
      serviceRoot,
    ] = values;
    const payload = await readInput(input);
    await writeOwnedFile({
      kind,
      path,
      expectedDirectoryIdentity,
      expectedMarkerIdentity: expectedMarkerIdentity === '-' ? '' : expectedMarkerIdentity,
      ownerToken,
      targetName,
      expectedSha,
      serviceRoot,
    }, payload);
    return;
  }
  throw custodyError('CLI command is unsupported');
}

const direct = import.meta.url.startsWith('file:')
  && process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  try {
    await runCli(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 68;
  }
}
