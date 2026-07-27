import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import {
  constants,
  lstat,
  mkdtemp,
  open,
  readdir,
  rmdir,
} from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function cleanupError(message) {
  const error = new Error(`A6 owned cleanup refused: ${message}`);
  error.code = 'E_CLEANUP_INTERFERENCE';
  return error;
}

async function missing(path) {
  try {
    await lstat(path);
    return false;
  } catch (error) {
    if (error.code === 'ENOENT') return true;
    throw error;
  }
}

function identity(stats) {
  return `${stats.dev}:${stats.ino}`;
}

async function exactLine(path, expected, expectedIdentity = '') {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = await handle.stat({ bigint: true });
    if (!before.isFile()
        || before.nlink !== 1n
        || (before.mode & 0o777n) !== 0o600n) return false;
    const body = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    const pathnameAfter = await lstat(path, { bigint: true });
    const actualIdentity = identity(pathnameAfter);
    return (!expectedIdentity || expectedIdentity === actualIdentity)
      && before.dev === after.dev
      && before.ino === after.ino
      && after.nlink === 1n
      && after.dev === pathnameAfter.dev
      && after.ino === pathnameAfter.ino
      && pathnameAfter.isFile()
      && pathnameAfter.nlink === 1n
      && (pathnameAfter.mode & 0o777n) === 0o600n
      && body.equals(Buffer.from(`${expected}\n`));
  } catch (error) {
    if (['ENOENT', 'ELOOP'].includes(error.code)) return false;
    throw error;
  } finally {
    await handle?.close();
  }
}

function validateScope({ kind, path, ownerToken, serviceRoot, expectedIdentity }) {
  if (!/^[0-9a-f]{32}$/.test(ownerToken)) {
    throw cleanupError('owner token is not exact');
  }
  if (!['staging', 'rollback', 'release', 'candidate', 'legacy'].includes(kind)) {
    throw cleanupError('cleanup kind is unsupported');
  }
  if (['release', 'candidate', 'legacy'].includes(kind)
      && !/^[0-9]+:[0-9]+$/.test(expectedIdentity)) {
    throw cleanupError('internal cleanup requires an exact identity');
  }
  const releasesRoot = join(serviceRoot, 'releases');
  const expectedParent = ['release', 'candidate'].includes(kind)
    ? releasesRoot
    : serviceRoot;
  if (dirname(path) !== expectedParent) {
    throw cleanupError('owned path is outside its cleanup boundary');
  }
  const expectedName = {
    staging: new RegExp(`^incoming-[0-9a-f]{40}-[0-9]{8}T[0-9]{6}Z-${ownerToken}$`),
    rollback: new RegExp(`^rollback-verify-${ownerToken}$`),
    release: /^[0-9a-f]{40}$/,
    candidate: new RegExp(`^\\.previous-[0-9a-f]{40}-${ownerToken}$`),
    legacy: new RegExp(`^\\.legacy-current-[0-9a-f]{40}-${ownerToken}$`),
  }[kind];
  if (!expectedName.test(basename(path))) {
    throw cleanupError('owned path name does not match its receipt');
  }
  return {
    markerName: kind === 'staging'
      ? '.staging-owner'
      : kind === 'rollback'
        ? '.rollback-owner'
        : '',
  };
}

async function moveNoReplace(source, destination) {
  try {
    await execFileAsync('/usr/bin/mv', ['-T', '-n', '--', source, destination]);
  } catch {
    throw cleanupError('no-replace quarantine move failed');
  }
}

async function makeWritableAnchored(directoryHandle) {
  await execFileAsync('/usr/bin/find', [
    '-H',
    `/proc/${process.pid}/fd/${directoryHandle.fd}/`,
    '-depth',
    '-type',
    'd',
    '-exec',
    '/usr/bin/chmod',
    'u+rwx',
    '--',
    '{}',
    '+',
  ]);
}

async function deleteContentsAnchored(directoryHandle) {
  await execFileAsync('/usr/bin/find', [
    '-H',
    `/proc/${process.pid}/fd/${directoryHandle.fd}/`,
    '-mindepth',
    '1',
    '-depth',
    '-delete',
  ]);
}

async function listContentsAnchored(directoryHandle) {
  return readdir(`/proc/${process.pid}/fd/${directoryHandle.fd}`);
}

export async function quarantineOwnedDirectory(options, hooks = {}) {
  const kind = String(options.kind || '');
  const path = resolve(String(options.path || ''));
  const serviceRoot = resolve(String(options.serviceRoot || ''));
  const ownerToken = String(options.ownerToken || '');
  const expectedIdentity = String(options.expectedIdentity || '');
  const expectedMarkerIdentity = String(options.expectedMarkerIdentity || '');
  const { markerName } = validateScope({
    kind,
    path,
    ownerToken,
    serviceRoot,
    expectedIdentity,
  });
  if (await missing(path)) return { status: 'absent' };

  const before = await lstat(path, { bigint: true });
  if (!before.isDirectory() || before.isSymbolicLink()) {
    throw cleanupError('owned path is not a real directory');
  }
  const actualIdentity = identity(before);
  if (expectedIdentity && expectedIdentity !== actualIdentity) {
    throw cleanupError('owned path identity changed');
  }
  if (markerName
      && !await exactLine(join(path, markerName), ownerToken, expectedMarkerIdentity)) {
    throw cleanupError('owner receipt changed');
  }

  await hooks.afterInitialValidation?.({ path, actualIdentity });

  const cleanupRootBefore = await lstat(serviceRoot, { bigint: true });
  if (!cleanupRootBefore.isDirectory()
      || cleanupRootBefore.isSymbolicLink()
      || cleanupRootBefore.dev !== before.dev) {
    throw cleanupError('cleanup root is not on the owned directory filesystem');
  }
  const cleanupContainer = await mkdtemp(join(
    serviceRoot,
    `.cleanup-${ownerToken}-${randomBytes(8).toString('hex')}-`,
  ));
  const quarantinedPath = join(cleanupContainer, 'owned');
  let containerHandle;
  let quarantinedHandle;
  try {
    containerHandle = await open(
      cleanupContainer,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    const containerBefore = await containerHandle.stat({ bigint: true });
    if (containerBefore.dev !== before.dev) {
      throw cleanupError(`cleanup quarantine crossed filesystems at ${cleanupContainer}; preserved`);
    }
    await hooks.beforeMove?.({ path, cleanupContainer, quarantinedPath, actualIdentity });
    await (hooks.moveNoReplace || moveNoReplace)(path, quarantinedPath);

    const moved = await lstat(quarantinedPath, { bigint: true });
    if (!moved.isDirectory()
        || moved.isSymbolicLink()
        || identity(moved) !== actualIdentity
        || (markerName
          && !await exactLine(
            join(quarantinedPath, markerName),
            ownerToken,
            expectedMarkerIdentity,
          ))
        || !await missing(path)) {
      throw cleanupError(`replacement captured at ${cleanupContainer}; preserved`);
    }
    quarantinedHandle = await open(
      quarantinedPath,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    const pinnedMoved = await quarantinedHandle.stat({ bigint: true });
    if (identity(pinnedMoved) !== actualIdentity) {
      throw cleanupError(`quarantine handle changed at ${cleanupContainer}; preserved`);
    }

    await hooks.beforeFinalValidation?.({
      path,
      cleanupContainer,
      quarantinedPath,
      actualIdentity,
    });

    const containerAfter = await lstat(cleanupContainer, { bigint: true });
    const finalMoved = await lstat(quarantinedPath, { bigint: true });
    if (identity(containerAfter) !== identity(containerBefore)
        || !containerAfter.isDirectory()
        || containerAfter.isSymbolicLink()
        || identity(finalMoved) !== actualIdentity
        || !finalMoved.isDirectory()
        || finalMoved.isSymbolicLink()
        || (markerName
          && !await exactLine(
            join(quarantinedPath, markerName),
            ownerToken,
            expectedMarkerIdentity,
          ))
        || !await missing(path)) {
      throw cleanupError(`quarantine changed at ${cleanupContainer}; preserved`);
    }

    await hooks.afterFinalValidation?.({
      path,
      cleanupContainer,
      quarantinedPath,
      actualIdentity,
    });

    const containerImmediatelyBeforeDelete = await lstat(cleanupContainer, { bigint: true });
    const movedImmediatelyBeforeDelete = await lstat(quarantinedPath, { bigint: true });
    if (identity(containerImmediatelyBeforeDelete) !== identity(containerBefore)
        || identity(movedImmediatelyBeforeDelete) !== actualIdentity
        || (markerName
          && !await exactLine(
            join(quarantinedPath, markerName),
            ownerToken,
            expectedMarkerIdentity,
          ))
        || !await missing(path)) {
      throw cleanupError(`final quarantine identity changed at ${cleanupContainer}; preserved`);
    }

    await hooks.beforeAnchoredDelete?.({
      path,
      cleanupContainer,
      quarantinedPath,
      actualIdentity,
    });

    const cleanupContext = { cleanupContainer, quarantinedPath };
    await (hooks.makeWritableAnchored || makeWritableAnchored)(
      quarantinedHandle,
      cleanupContext,
    );
    await (hooks.deleteContentsAnchored || deleteContentsAnchored)(
      quarantinedHandle,
      cleanupContext,
    );
    const remaining = await (hooks.listContentsAnchored || listContentsAnchored)(
      quarantinedHandle,
      cleanupContext,
    );
    if (remaining.length) {
      throw cleanupError(`anchored quarantine is not empty at ${cleanupContainer}; preserved`);
    }
    const emptiedPinned = await quarantinedHandle.stat({ bigint: true });
    const emptiedPath = await lstat(quarantinedPath, { bigint: true });
    if (identity(emptiedPinned) !== actualIdentity
        || identity(emptiedPath) !== actualIdentity
        || !emptiedPath.isDirectory()
        || emptiedPath.isSymbolicLink()) {
      throw cleanupError(`emptied quarantine path changed at ${cleanupContainer}; preserved`);
    }
    try {
      await rmdir(quarantinedPath);
    } catch {
      throw cleanupError(`emptied quarantine path changed at ${cleanupContainer}; preserved`);
    }
    const unlinkedPinned = await quarantinedHandle.stat({ bigint: true });
    if ((process.platform === 'linux' && unlinkedPinned.nlink !== 0n)
        || !await missing(quarantinedPath)) {
      throw cleanupError(`emptied quarantine could not be unlinked at ${cleanupContainer}`);
    }
    const emptyContainer = await lstat(cleanupContainer, { bigint: true });
    const containerContents = await readdir(cleanupContainer);
    if (identity(emptyContainer) !== identity(containerBefore) || containerContents.length) {
      throw cleanupError(`cleanup container changed at ${cleanupContainer}; preserved`);
    }
    await hooks.beforeContainerRmdir?.({
      path,
      cleanupContainer,
      quarantinedPath,
      actualIdentity,
    });
    const containerImmediatelyBeforeRmdir = await lstat(cleanupContainer, { bigint: true });
    if (identity(containerImmediatelyBeforeRmdir) !== identity(containerBefore)
        || (await readdir(cleanupContainer)).length) {
      throw cleanupError(`empty cleanup container changed at ${cleanupContainer}; preserved`);
    }
    try {
      await rmdir(cleanupContainer);
    } catch {
      throw cleanupError(`empty cleanup container changed at ${cleanupContainer}; preserved`);
    }
    const unlinkedContainer = await containerHandle.stat({ bigint: true });
    if ((process.platform === 'linux' && unlinkedContainer.nlink !== 0n)
        || !await missing(cleanupContainer)) {
      throw cleanupError(`empty cleanup container could not be unlinked at ${cleanupContainer}`);
    }
  } finally {
    await quarantinedHandle?.close();
    await containerHandle?.close();
  }

  return { status: 'removed' };
}

const isCli = process.argv[1] === '-'
  || (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url));

if (isCli) {
  const [
    kind,
    path,
    expectedIdentity,
    ownerToken,
    serviceRoot,
    expectedMarkerIdentity,
  ] = process.argv.slice(2);
  try {
    await quarantineOwnedDirectory({
      kind,
      path,
      expectedIdentity,
      ownerToken,
      serviceRoot,
      expectedMarkerIdentity,
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 71;
  }
}
