import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  link,
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  openDeploymentLock,
  runLockedBash,
} from './a6-locked-run.mjs';

if (process.platform !== 'linux') {
  console.log('A6 deployment-lock production-path checks are delegated to the required Linux CI lane.');
  process.exit(0);
}

const root = await mkdtemp(join(tmpdir(), 'carboncaste-deploy-lock-test-'));

async function expectRejected(label, action) {
  let rejected = false;
  try {
    await action();
  } catch (error) {
    rejected = error.code === 'E_LOCK_CUSTODY'
      || ['EEXIST', 'ELOOP', 'ENOTDIR'].includes(error.code);
  }
  if (!rejected) throw new Error(`Deployment lock accepted ${label}.`);
}

async function waitFor(check, timeout = 8_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  return false;
}

async function waitForExit(child, timeout = 8_000) {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise((resolvePromise) => {
    const timer = setTimeout(() => resolvePromise(false), timeout);
    child.once('exit', () => {
      clearTimeout(timer);
      resolvePromise(true);
    });
  });
}

try {
  const helperSource = await readFile(new URL('./a6-locked-run.mjs', import.meta.url));
  const helperSha = createHash('sha256').update(helperSource).digest('hex');
  const helperEval = [
    `await import('data:text/javascript;base64,${helperSource.toString('base64')}')`,
    '.then((module) => module.runCli(process.argv.slice(1), { allowTestRoot: true, signalGraceMs: 1000 }))',
  ].join('');
  const cliRun = spawnSync(process.execPath, [
    '--input-type=module',
    '-e',
    helperEval,
    '--',
    root,
  ], {
    input: [
      'set -euo pipefail',
      'test "$A6_DEPLOY_LOCK_HELPER_SHA" = "$EXPECTED_LOCK_HELPER_SHA"',
      'test -f /proc/$BASHPID/fd/3',
      'test -d /proc/$BASHPID/fd/4',
      'test -d /proc/$BASHPID/fd/5',
      'flock -n 3',
    ].join('\n'),
    encoding: 'utf8',
    env: {
      ...process.env,
      EXPECTED_LOCK_HELPER_SHA: helperSha,
    },
  });
  if (cliRun.status !== 0) {
    throw new Error(`Data-URL deployment-lock CLI failed: ${cliRun.stderr}`);
  }

  const first = await openDeploymentLock(root, { allowTestRoot: true });
  const firstIdentity = first.identity;
  await first.handle.close();
  await first.releasesHandle.close();
  await first.rootHandle.close();
  const lockPath = join(root, 'deploy.lock');
  const lockStats = await lstat(lockPath, { bigint: true });
  if (`${lockStats.dev}:${lockStats.ino}` !== firstIdentity
      || Number(lockStats.mode & 0o777n) !== 0o600) {
    throw new Error('Deployment lock was not created with exact identity and mode.');
  }

  const inheritedStatus = await runLockedBash(root, [], {
    allowTestRoot: true,
    command: '/bin/bash',
    commandArgs: [
      '-c',
      'test -f /proc/$BASHPID/fd/3 && test -d /proc/$BASHPID/fd/4 && test -d /proc/$BASHPID/fd/5 && flock -n 3 && test "$(stat -Lc \'%d:%i\' /proc/$BASHPID/fd/3)" = "$A6_DEPLOY_LOCK_IDENTITY" && test "$(stat -Lc \'%d:%i\' /proc/$BASHPID/fd/4)" = "$A6_DEPLOY_RELEASES_IDENTITY" && test "$(stat -Lc \'%d:%i\' /proc/$BASHPID/fd/5)" = "$A6_DEPLOY_ROOT_IDENTITY"',
    ],
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (inheritedStatus !== 0) {
    throw new Error('Deployment lock descriptor was not inherited and lockable.');
  }

  await rm(lockPath);
  const victim = join(root, 'victim');
  await writeFile(victim, 'preserve me\n', { mode: 0o600 });
  await symlink(victim, lockPath);
  await expectRejected(
    'a symlink to an existing victim',
    () => openDeploymentLock(root, { allowTestRoot: true }),
  );
  if ((await readFile(victim, 'utf8')) !== 'preserve me\n') {
    throw new Error('Existing lock symlink victim was modified.');
  }

  await rm(lockPath);
  const danglingVictim = join(root, 'missing-victim');
  await symlink(danglingVictim, lockPath);
  await expectRejected(
    'a dangling symlink',
    () => openDeploymentLock(root, { allowTestRoot: true }),
  );
  try {
    await lstat(danglingVictim);
    throw new Error('Dangling lock symlink victim was created.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const signalRoot = join(root, 'signal-root');
  const childPidPath = join(signalRoot, 'child.pid');
  await mkdir(signalRoot, { mode: 0o700 });
  const broker = spawn(process.execPath, [
    '--input-type=module',
    '-e',
    helperEval,
    '--',
    signalRoot,
  ], {
    env: {
      ...process.env,
      CHILD_PID_PATH: childPidPath,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  broker.stdin.end([
    'set -euo pipefail',
    "trap 'exit 143' TERM HUP INT",
    'flock -n 3',
    "(trap '' TERM HUP INT; while :; do sleep 1 || true; done) &",
    'descendant_pid="$!"',
    'printf \'%s %s\\n\' "$$" "$descendant_pid" > "$CHILD_PID_PATH"',
    'wait "$descendant_pid"',
  ].join('\n'));
  const childStarted = await waitFor(async () => {
    try {
      return /^[0-9]+ [0-9]+\n$/.test(await readFile(childPidPath, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  });
  if (!childStarted) {
    broker.kill('SIGKILL');
    throw new Error('Interrupted broker child did not start.');
  }
  const childPids = (await readFile(childPidPath, 'utf8'))
    .trim()
    .split(' ')
    .map(Number);
  broker.kill('SIGTERM');
  if (!await waitForExit(broker)) {
    broker.kill('SIGKILL');
    throw new Error('Interrupted deployment-lock broker did not exit.');
  }
  const survivingPids = [];
  for (const childPid of childPids) {
    try {
      process.kill(childPid, 0);
      survivingPids.push(childPid);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
  if (survivingPids.length || broker.exitCode !== 143) {
    throw new Error(
      `Broker interruption left children=${survivingPids.join(',')} or exit=${broker.exitCode}.`,
    );
  }
  const lockReleasedStatus = await runLockedBash(signalRoot, [], {
    allowTestRoot: true,
    command: '/bin/bash',
    commandArgs: ['-c', 'flock -n 3'],
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (lockReleasedStatus !== 0) {
    throw new Error('Interrupted broker did not release the deployment lock.');
  }

  const recoveryRoot = join(root, 'recovery-root');
  const recoveryReadyPath = join(recoveryRoot, 'ready');
  const recoveryReceiptPath = join(recoveryRoot, 'restored');
  await mkdir(recoveryRoot, { mode: 0o700 });
  const recoveryBroker = spawn(process.execPath, [
    '--input-type=module',
    '-e',
    helperEval,
    '--',
    recoveryRoot,
  ], {
    env: {
      ...process.env,
      RECOVERY_READY_PATH: recoveryReadyPath,
      RECOVERY_RECEIPT_PATH: recoveryReceiptPath,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  recoveryBroker.stdin.end([
    'set -euo pipefail',
    "trap 'sleep 0.3; printf \"restored\\n\" > \"$RECOVERY_RECEIPT_PATH\"; exit 143' TERM HUP INT",
    'flock -n 3',
    'printf "ready\\n" > "$RECOVERY_READY_PATH"',
    'while :; do sleep 1; done',
  ].join('\n'));
  if (!await waitFor(async () => {
    try {
      return (await readFile(recoveryReadyPath, 'utf8')) === 'ready\n';
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  })) {
    recoveryBroker.kill('SIGKILL');
    throw new Error('Recovery-grace broker child did not start.');
  }
  recoveryBroker.kill('SIGTERM');
  if (!await waitForExit(recoveryBroker)
      || recoveryBroker.exitCode !== 143
      || (await readFile(recoveryReceiptPath, 'utf8')) !== 'restored\n') {
    recoveryBroker.kill('SIGKILL');
    throw new Error('Broker grace did not allow the bounded recovery trap to finish.');
  }

  await rm(lockPath);
  await writeFile(lockPath, '', { mode: 0o600 });
  const secondLink = join(root, 'deploy.lock.hardlink');
  await link(lockPath, secondLink);
  await expectRejected(
    'a multiply linked lock',
    () => openDeploymentLock(root, { allowTestRoot: true }),
  );

  const alternateRoot = join(root, 'alternate-root');
  const releasesVictim = join(root, 'releases-victim');
  await mkdir(alternateRoot, { mode: 0o700 });
  await mkdir(releasesVictim, { mode: 0o700 });
  await writeFile(join(releasesVictim, 'sentinel'), 'preserve me\n');
  await symlink(releasesVictim, join(alternateRoot, 'releases'));
  await expectRejected(
    'a planted releases-root symlink',
    () => openDeploymentLock(alternateRoot, { allowTestRoot: true }),
  );
  if ((await readFile(join(releasesVictim, 'sentinel'), 'utf8')) !== 'preserve me\n') {
    throw new Error('Planted releases-root symlink victim was modified.');
  }

  console.log(
    'A6 deployment lock passed data-URL CLI/source hash, no-follow create/open, exact root/releases/lock identity, inherited flock, bounded recovery grace, broker-interruption descendant cleanup, symlink, dangling-symlink, and hardlink checks with production Linux primitives.',
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
