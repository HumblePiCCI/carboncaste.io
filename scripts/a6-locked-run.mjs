import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  constants,
  lstat,
  mkdir,
  open,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function lockError(message) {
  const error = new Error(`A6 deployment lock refused: ${message}`);
  error.code = 'E_LOCK_CUSTODY';
  return error;
}

function identity(stats) {
  return `${stats.dev}:${stats.ino}`;
}

function mode(stats) {
  return Number(stats.mode & 0o777n);
}

function requireLinuxLocking() {
  if (process.platform !== 'linux' || !constants.O_NOFOLLOW) {
    throw lockError('Linux O_NOFOLLOW is required');
  }
}

function loadedSourceSha() {
  const prefix = 'data:text/javascript;base64,';
  if (!import.meta.url.startsWith(prefix)) return '';
  return createHash('sha256')
    .update(Buffer.from(import.meta.url.slice(prefix.length), 'base64'))
    .digest('hex');
}

export async function openDeploymentLock(serviceRoot, options = {}) {
  requireLinuxLocking();
  const root = resolve(String(serviceRoot || ''));
  const expectedRoot = '/home/humble/services/carboncaste-web';
  if (root !== expectedRoot && options.allowTestRoot !== true) {
    throw lockError('service root is outside the exact deployment boundary');
  }

  const lockPath = join(root, 'deploy.lock');
  const releasesPath = join(root, 'releases');
  let rootHandle;
  let releasesHandle;
  let handle;
  try {
    rootHandle = await open(
      root,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    const pinnedRoot = await rootHandle.stat({ bigint: true });
    const pathnameRoot = await lstat(root, { bigint: true });
    if (!pinnedRoot.isDirectory()
        || !pathnameRoot.isDirectory()
        || pathnameRoot.isSymbolicLink()
        || identity(pathnameRoot) !== identity(pinnedRoot)) {
      throw lockError('service root is not an exact real directory');
    }
    const anchoredReleasesPath = `/proc/${process.pid}/fd/${rootHandle.fd}/releases`;
    try {
      await mkdir(anchoredReleasesPath, { mode: 0o700 });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    releasesHandle = await open(
      anchoredReleasesPath,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    const pinnedReleases = await releasesHandle.stat({ bigint: true });
    const pathnameReleases = await lstat(releasesPath, { bigint: true });
    if (!pinnedReleases.isDirectory()
        || pinnedReleases.dev !== pinnedRoot.dev
        || mode(pinnedReleases) !== 0o700
        || !pathnameReleases.isDirectory()
        || pathnameReleases.isSymbolicLink()
        || identity(pathnameReleases) !== identity(pinnedReleases)) {
      throw lockError('releases root is not an exact mode-0700 directory on the service filesystem');
    }
    const anchoredLockPath = `/proc/${process.pid}/fd/${rootHandle.fd}/deploy.lock`;
    try {
      handle = await open(
        anchoredLockPath,
        constants.O_RDWR
          | constants.O_CREAT
          | constants.O_EXCL
          | constants.O_NOFOLLOW,
        0o600,
      );
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      handle = await open(
        anchoredLockPath,
        constants.O_RDWR | constants.O_NOFOLLOW,
      );
    }
  } catch (error) {
    await handle?.close();
    await releasesHandle?.close();
    await rootHandle?.close();
    throw error;
  }

  try {
    const pinned = await handle.stat({ bigint: true });
    const pathname = await lstat(lockPath, { bigint: true });
    const lockIdentity = identity(pinned);
    if (!pinned.isFile()
        || pinned.nlink !== 1n
        || mode(pinned) !== 0o600
        || !pathname.isFile()
        || pathname.isSymbolicLink()
        || identity(pathname) !== lockIdentity) {
      throw lockError('lock is not an exact mode-0600 single-link regular file');
    }
    return {
      handle,
      identity: lockIdentity,
      path: lockPath,
      releasesHandle,
      releasesIdentity: identity(await releasesHandle.stat({ bigint: true })),
      rootHandle,
      rootIdentity: identity(await rootHandle.stat({ bigint: true })),
    };
  } catch (error) {
    await handle?.close();
    await releasesHandle?.close();
    await rootHandle?.close();
    throw error;
  }
}

export async function runLockedBash(serviceRoot, args, options = {}) {
  const lock = await openDeploymentLock(serviceRoot, {
    allowTestRoot: options.allowTestRoot === true,
  });
  const command = options.command || '/bin/bash';
  const commandArgs = options.commandArgs || ['-s', '--', ...args];
  const childStdio = [
    ...(options.stdio || ['inherit', 'inherit', 'inherit']),
    lock.handle.fd,
    lock.releasesHandle.fd,
    lock.rootHandle.fd,
  ];
  let child;
  let forceKillTimer;
  let requestedSignal = '';
  let signalStartedAt = 0;
  const signalGraceMs = options.allowTestRoot === true
      && Number.isInteger(options.signalGraceMs)
    ? Math.max(100, Math.min(options.signalGraceMs, 5_000))
    : 90_000;
  const signalExitCode = {
    SIGHUP: 129,
    SIGINT: 130,
    SIGTERM: 143,
  };
  const terminateChildGroup = (signal) => {
    if (!child?.pid) return;
    try {
      process.kill(-child.pid, signal);
    } catch (error) {
      if (error.code !== 'ESRCH') {
        console.error(`A6 deployment lock could not signal child group: ${error.message}`);
      }
    }
    clearTimeout(forceKillTimer);
    forceKillTimer = setTimeout(() => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch (error) {
        if (error.code !== 'ESRCH') {
          console.error(`A6 deployment lock could not kill child group: ${error.message}`);
        }
      }
    }, Math.max(0, signalStartedAt + signalGraceMs - Date.now()));
  };
  const forwardSignal = (signal) => {
    if (requestedSignal) return;
    requestedSignal = signal;
    signalStartedAt = Date.now();
    terminateChildGroup(signal);
  };
  const signalHandlers = Object.fromEntries(
    Object.keys(signalExitCode).map((signal) => [
      signal,
      () => forwardSignal(signal),
    ]),
  );
  try {
    for (const [signal, handler] of Object.entries(signalHandlers)) {
      process.on(signal, handler);
    }
    child = spawn(command, commandArgs, {
      detached: true,
      env: {
        ...process.env,
        A6_DEPLOY_LOCK_IDENTITY: lock.identity,
        A6_DEPLOY_LOCK_HELPER_SHA: loadedSourceSha(),
        A6_DEPLOY_RELEASES_IDENTITY: lock.releasesIdentity,
        A6_DEPLOY_ROOT_IDENTITY: lock.rootIdentity,
      },
      stdio: childStdio,
    });
    if (requestedSignal) terminateChildGroup(requestedSignal);
    const result = await new Promise((resolvePromise, rejectPromise) => {
      child.once('error', rejectPromise);
      child.once('exit', (code, signal) => resolvePromise({ code, signal }));
    });
    if (requestedSignal) {
      const groupDeadline = signalStartedAt + signalGraceMs + 5_000;
      while (Date.now() < groupDeadline) {
        try {
          process.kill(-child.pid, 0);
        } catch (error) {
          if (error.code === 'ESRCH') break;
          throw error;
        }
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
      }
      try {
        process.kill(-child.pid, 0);
        process.kill(-child.pid, 'SIGKILL');
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
        process.kill(-child.pid, 0);
        throw lockError('signaled child process group survived SIGKILL');
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
    if (result.signal) {
      if (requestedSignal) return signalExitCode[requestedSignal];
      throw lockError(`locked child exited on signal ${result.signal}`);
    }
    if (requestedSignal) return signalExitCode[requestedSignal];
    return result.code ?? 1;
  } finally {
    clearTimeout(forceKillTimer);
    for (const [signal, handler] of Object.entries(signalHandlers)) {
      process.removeListener(signal, handler);
    }
    await lock.handle.close();
    await lock.releasesHandle.close();
    await lock.rootHandle.close();
  }
}

export async function runCli(args, options = {}) {
  const [serviceRoot, ...bashArgs] = args;
  const status = await runLockedBash(serviceRoot, bashArgs, {
    allowTestRoot: options.allowTestRoot === true,
    signalGraceMs: options.signalGraceMs,
  });
  process.exitCode = status;
}

const direct = import.meta.url.startsWith('file:')
  && process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  try {
    await runCli(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 74;
  }
}
