import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  link,
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createOwnedDirectory,
  writeOwnedFile,
} from './a6-owned-write.mjs';

if (process.platform !== 'linux') {
  console.log('A6 owned write production-path checks are delegated to the required Linux CI lane.');
  process.exit(0);
}

const root = await mkdtemp(join(tmpdir(), 'carboncaste-owned-write-test-'));
const ownerToken = '0123456789abcdef0123456789abcdef';
let sequence = 0;

function digest(body) {
  return createHash('sha256').update(body).digest('hex');
}

async function createStaging() {
  sequence += 1;
  const path = join(
    root,
    `incoming-${sequence.toString(16).padStart(40, '0')}-20260726T120000Z-${ownerToken}`,
  );
  const receipt = await createOwnedDirectory({
    kind: 'staging',
    path,
    ownerToken,
    serviceRoot: root,
  });
  return { path, ...receipt };
}

async function expectRejected(label, action) {
  let rejected = false;
  try {
    await action();
  } catch (error) {
    rejected = error.code === 'E_WRITE_CUSTODY'
      || ['EEXIST', 'ELOOP'].includes(error.code);
  }
  if (!rejected) throw new Error(`Owned writer accepted ${label}.`);
}

try {
  const helperSource = await readFile(new URL('./a6-owned-write.mjs', import.meta.url));
  const helperEval = [
    `await import('data:text/javascript;base64,${helperSource.toString('base64')}')`,
    '.then((module) => module.runCli(process.argv.slice(1)))',
  ].join('');
  const cliPath = join(
    root,
    `incoming-${'e'.repeat(40)}-20260726T120000Z-${ownerToken}`,
  );
  const cliCreate = spawnSync(process.execPath, [
    '--input-type=module',
    '-e',
    helperEval,
    '--',
    'create',
    'staging',
    cliPath,
    ownerToken,
    root,
  ], { encoding: 'utf8' });
  const cliReceipt = cliCreate.stdout.trim().split(/\s+/);
  if (cliCreate.status !== 0
      || cliReceipt.length !== 2
      || !cliReceipt.every((value) => /^[0-9]+:[0-9]+$/.test(value))) {
    throw new Error(`Data-URL create CLI failed: ${cliCreate.stderr}`);
  }
  const cliPayload = Buffer.from('data URL CLI payload\n');
  const cliWrite = spawnSync(process.execPath, [
    '--input-type=module',
    '-e',
    helperEval,
    '--',
    'write',
    'staging',
    cliPath,
    cliReceipt[0],
    cliReceipt[1],
    ownerToken,
    'EXPECTED_NEW_TREE_MANIFEST',
    digest(cliPayload),
    root,
  ], {
    input: cliPayload,
    encoding: 'utf8',
  });
  if (cliWrite.status !== 0
      || !(await readFile(join(cliPath, 'EXPECTED_NEW_TREE_MANIFEST'))).equals(cliPayload)) {
    throw new Error(`Data-URL write CLI failed: ${cliWrite.stderr}`);
  }

  const exact = await createStaging();
  const payload = Buffer.from('exact manifest payload\n');
  await writeOwnedFile({
    kind: 'staging',
    path: exact.path,
    expectedDirectoryIdentity: exact.directoryIdentity,
    expectedMarkerIdentity: exact.markerIdentity,
    ownerToken,
    targetName: 'EXPECTED_NEW_TREE_MANIFEST',
    expectedSha: digest(payload),
    serviceRoot: root,
  }, payload);
  if (!(await readFile(join(exact.path, 'EXPECTED_NEW_TREE_MANIFEST'))).equals(payload)
      || (Number((await lstat(join(
        exact.path,
        'EXPECTED_NEW_TREE_MANIFEST',
      ), { bigint: true })).mode & 0o777n)) !== 0o600) {
    throw new Error('Exact owned write did not preserve payload and mode.');
  }

  await expectRejected('an existing owned directory', async () => {
    await createOwnedDirectory({
      kind: 'staging',
      path: exact.path,
      ownerToken,
      serviceRoot: root,
    });
  });

  const regular = await createStaging();
  const regularTarget = join(regular.path, 'EXPECTED_NEW_TREE_MANIFEST');
  await writeFile(regularTarget, 'victim\n', { mode: 0o600 });
  await expectRejected('an existing regular target', () => writeOwnedFile({
    kind: 'staging',
    path: regular.path,
    expectedDirectoryIdentity: regular.directoryIdentity,
    expectedMarkerIdentity: regular.markerIdentity,
    ownerToken,
    targetName: 'EXPECTED_NEW_TREE_MANIFEST',
    expectedSha: digest(payload),
    serviceRoot: root,
  }, payload));
  if ((await readFile(regularTarget, 'utf8')) !== 'victim\n') {
    throw new Error('Existing regular target was modified.');
  }

  const dangling = await createStaging();
  const danglingTarget = join(dangling.path, 'EXPECTED_NEW_TREE_MANIFEST');
  const missingVictim = join(root, 'missing-victim');
  await symlink(missingVictim, danglingTarget);
  await expectRejected('a dangling symlink target', () => writeOwnedFile({
    kind: 'staging',
    path: dangling.path,
    expectedDirectoryIdentity: dangling.directoryIdentity,
    expectedMarkerIdentity: dangling.markerIdentity,
    ownerToken,
    targetName: 'EXPECTED_NEW_TREE_MANIFEST',
    expectedSha: digest(payload),
    serviceRoot: root,
  }, payload));
  try {
    await lstat(missingVictim);
    throw new Error('Dangling symlink victim was created.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const directory = await createStaging();
  await mkdir(join(directory.path, 'EXPECTED_NEW_TREE_MANIFEST'));
  await expectRejected('an existing directory target', () => writeOwnedFile({
    kind: 'staging',
    path: directory.path,
    expectedDirectoryIdentity: directory.directoryIdentity,
    expectedMarkerIdentity: directory.markerIdentity,
    ownerToken,
    targetName: 'EXPECTED_NEW_TREE_MANIFEST',
    expectedSha: digest(payload),
    serviceRoot: root,
  }, payload));

  const hardlink = await createStaging();
  const hardlinkCopy = join(hardlink.path, 'inserted-hardlink');
  await expectRejected('a post-create hardlink', () => writeOwnedFile({
    kind: 'staging',
    path: hardlink.path,
    expectedDirectoryIdentity: hardlink.directoryIdentity,
    expectedMarkerIdentity: hardlink.markerIdentity,
    ownerToken,
    targetName: 'EXPECTED_NEW_TREE_MANIFEST',
    expectedSha: digest(payload),
    serviceRoot: root,
  }, payload, {
    afterTargetWrite: async ({ publicTarget }) => {
      await link(publicTarget, hardlinkCopy);
    },
  }));
  if (!(await readFile(hardlinkCopy)).equals(payload)) {
    throw new Error('Hardlink race evidence was not preserved.');
  }

  const replaced = await createStaging();
  const replacedTarget = join(replaced.path, 'EXPECTED_NEW_TREE_MANIFEST');
  const originalAway = join(replaced.path, 'original-away');
  await expectRejected('a post-write pathname replacement', () => writeOwnedFile({
    kind: 'staging',
    path: replaced.path,
    expectedDirectoryIdentity: replaced.directoryIdentity,
    expectedMarkerIdentity: replaced.markerIdentity,
    ownerToken,
    targetName: 'EXPECTED_NEW_TREE_MANIFEST',
    expectedSha: digest(payload),
    serviceRoot: root,
  }, payload, {
    afterTargetWrite: async ({ publicTarget }) => {
      await rename(publicTarget, originalAway);
      await writeFile(publicTarget, 'replacement victim\n', { mode: 0o600 });
    },
  }));
  if ((await readFile(replacedTarget, 'utf8')) !== 'replacement victim\n'
      || !(await readFile(originalAway)).equals(payload)) {
    throw new Error('Post-write pathname replacement was not preserved.');
  }

  const markerRacePath = join(
    root,
    `incoming-${'f'.repeat(40)}-20260726T120000Z-${ownerToken}`,
  );
  const markerVictim = join(root, 'marker-victim');
  await expectRejected('a marker symlink insertion', () => createOwnedDirectory({
    kind: 'staging',
    path: markerRacePath,
    ownerToken,
    serviceRoot: root,
  }, {
    beforeMarkerOpen: async ({ markerPath }) => {
      await symlink(markerVictim, markerPath);
    },
  }));
  try {
    await lstat(markerVictim);
    throw new Error('Marker symlink victim was created.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  console.log(
    'A6 owned write passed data-URL CLI, exclusive create, mode/hash, regular, symlink, directory, hardlink, marker, and replacement checks with production Linux primitives.',
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
