import {
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { quarantineOwnedDirectory } from './a6-owned-cleanup.mjs';

const ownerToken = '0123456789abcdef0123456789abcdef';
const temporaryRoot = await mkdtemp(join(tmpdir(), 'carboncaste-owned-cleanup-test-'));

async function createOwned(kind, suffix = '') {
  const name = kind === 'staging'
    ? `incoming-${'a'.repeat(40)}-20260726T120000Z-${ownerToken}${suffix}`
    : `rollback-verify-${ownerToken}${suffix}`;
  const path = join(temporaryRoot, name);
  await mkdir(path, { mode: 0o700 });
  const marker = kind === 'staging' ? '.staging-owner' : '.rollback-owner';
  await writeFile(join(path, marker), `${ownerToken}\n`, { mode: 0o600 });
  const stats = await lstat(path, { bigint: true });
  const markerStats = await lstat(join(path, marker), { bigint: true });
  return {
    path,
    identity: `${stats.dev}:${stats.ino}`,
    markerIdentity: `${markerStats.dev}:${markerStats.ino}`,
  };
}

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function portableMoveNoReplace(source, destination) {
  if (await exists(destination)) return;
  await rename(source, destination);
}

async function portableDeleteContentsAnchored(_handle, { quarantinedPath }) {
  for (const entry of await readdir(quarantinedPath)) {
    await rm(join(quarantinedPath, entry), { recursive: true, force: false });
  }
}

async function portableListContentsAnchored(_handle, { quarantinedPath }) {
  return readdir(quarantinedPath);
}

const portableHooks = {
  moveNoReplace: portableMoveNoReplace,
  makeWritableAnchored: async () => {},
  deleteContentsAnchored: portableDeleteContentsAnchored,
  listContentsAnchored: portableListContentsAnchored,
};
const runtimeHooks = process.platform === 'linux' ? {} : portableHooks;

try {
  const exact = await createOwned('staging');
  await quarantineOwnedDirectory({
    kind: 'staging',
    path: exact.path,
    expectedIdentity: exact.identity,
    expectedMarkerIdentity: exact.markerIdentity,
    ownerToken,
    serviceRoot: temporaryRoot,
  }, runtimeHooks);
  if (await exists(exact.path)) throw new Error('Exact owned staging directory survived cleanup.');

  const wrongMarker = await createOwned('staging');
  let rejected = false;
  try {
    await quarantineOwnedDirectory({
      kind: 'staging',
      path: wrongMarker.path,
      expectedIdentity: wrongMarker.identity,
      expectedMarkerIdentity: '1:2',
      ownerToken,
      serviceRoot: temporaryRoot,
    }, runtimeHooks);
  } catch (error) {
    rejected = error.code === 'E_CLEANUP_INTERFERENCE';
  }
  if (!rejected || !await exists(wrongMarker.path)) {
    throw new Error('Cleanup accepted a replaced owner-receipt identity.');
  }
  await rm(wrongMarker.path, { recursive: true, force: false });

  const fallback = await createOwned('rollback');
  await quarantineOwnedDirectory({
    kind: 'rollback',
    path: fallback.path,
    expectedIdentity: '',
    ownerToken,
    serviceRoot: temporaryRoot,
  }, runtimeHooks);
  if (await exists(fallback.path)) {
    throw new Error('Receipt-owned rollback directory survived identity-readback fallback cleanup.');
  }

  const raced = await createOwned('staging');
  const originalAway = join(temporaryRoot, 'original-owned-away');
  rejected = false;
  try {
    await quarantineOwnedDirectory({
      kind: 'staging',
      path: raced.path,
      expectedIdentity: raced.identity,
      ownerToken,
      serviceRoot: temporaryRoot,
    }, {
      ...runtimeHooks,
      afterInitialValidation: async () => {
        await rename(raced.path, originalAway);
        await mkdir(raced.path, { mode: 0o700 });
        await writeFile(join(raced.path, '.staging-owner'), `${ownerToken}\n`, { mode: 0o600 });
        await writeFile(join(raced.path, 'replacement-sentinel'), 'preserve me\n');
      },
    });
  } catch (error) {
    rejected = error.code === 'E_CLEANUP_INTERFERENCE';
  }
  if (!rejected || !await exists(originalAway)) {
    throw new Error('Replacement race was not rejected while preserving the original owned directory.');
  }
  const quarantines = (await readdir(temporaryRoot))
    .filter((name) => name.startsWith(`.cleanup-${ownerToken}-`));
  if (quarantines.length !== 1
      || !await exists(join(temporaryRoot, quarantines[0], 'owned', 'replacement-sentinel'))) {
    throw new Error('Replacement directory was deleted instead of being preserved in quarantine.');
  }

  const destinationCollision = await createOwned('rollback');
  let insertedDestination = '';
  rejected = false;
  try {
    await quarantineOwnedDirectory({
      kind: 'rollback',
      path: destinationCollision.path,
      expectedIdentity: destinationCollision.identity,
      ownerToken,
      serviceRoot: temporaryRoot,
    }, {
      ...runtimeHooks,
      beforeMove: async ({ quarantinedPath }) => {
        insertedDestination = quarantinedPath;
        await mkdir(quarantinedPath, { mode: 0o700 });
        await writeFile(join(quarantinedPath, 'inserted-destination'), 'preserve me\n');
      },
    });
  } catch (error) {
    rejected = error.code === 'E_CLEANUP_INTERFERENCE';
  }
  if (!rejected
      || !await exists(destinationCollision.path)
      || !await exists(join(insertedDestination, 'inserted-destination'))) {
    throw new Error('Inserted quarantine destination was replaced or deleted.');
  }
  await rm(destinationCollision.path, { recursive: true, force: false });
  await rm(dirname(insertedDestination), { recursive: true, force: false });

  const finalRace = await createOwned('staging');
  const finalOwnedAway = join(temporaryRoot, 'final-owned-away');
  let replacementContainer = '';
  rejected = false;
  try {
    await quarantineOwnedDirectory({
      kind: 'staging',
      path: finalRace.path,
      expectedIdentity: finalRace.identity,
      ownerToken,
      serviceRoot: temporaryRoot,
    }, {
      ...runtimeHooks,
      afterFinalValidation: async ({ cleanupContainer }) => {
        replacementContainer = cleanupContainer;
        await rename(cleanupContainer, finalOwnedAway);
        await mkdir(cleanupContainer, { mode: 0o700 });
        await mkdir(join(cleanupContainer, 'owned'), { mode: 0o700 });
        await writeFile(
          join(cleanupContainer, 'owned', '.staging-owner'),
          `${ownerToken}\n`,
          { mode: 0o600 },
        );
        await writeFile(
          join(cleanupContainer, 'owned', 'post-validation-replacement'),
          'preserve me\n',
        );
      },
    });
  } catch (error) {
    rejected = error.code === 'E_CLEANUP_INTERFERENCE';
  }
  if (!rejected
      || !await exists(join(finalOwnedAway, 'owned'))
      || !await exists(join(
        replacementContainer,
        'owned',
        'post-validation-replacement',
      ))) {
    throw new Error('Post-validation replacement was deleted instead of being preserved.');
  }

  const childRace = await createOwned('rollback');
  const childOwnedAway = join(temporaryRoot, 'child-owned-away');
  let childReplacement = '';
  rejected = false;
  try {
    await quarantineOwnedDirectory({
      kind: 'rollback',
      path: childRace.path,
      expectedIdentity: childRace.identity,
      ownerToken,
      serviceRoot: temporaryRoot,
    }, {
      ...runtimeHooks,
      ...(process.platform === 'linux' ? {} : {
        deleteContentsAnchored: async () => {
          for (const entry of await readdir(childOwnedAway)) {
            await rm(join(childOwnedAway, entry), { recursive: true, force: false });
          }
        },
        listContentsAnchored: async () => readdir(childOwnedAway),
      }),
      beforeAnchoredDelete: async ({ quarantinedPath }) => {
        childReplacement = quarantinedPath;
        await rename(quarantinedPath, childOwnedAway);
        await mkdir(quarantinedPath, { mode: 0o700 });
        await writeFile(
          join(quarantinedPath, '.rollback-owner'),
          `${ownerToken}\n`,
          { mode: 0o600 },
        );
        await writeFile(
          join(quarantinedPath, 'post-check-replacement'),
          'preserve me\n',
        );
      },
    });
  } catch (error) {
    rejected = error.code === 'E_CLEANUP_INTERFERENCE';
  }
  if (!rejected
      || !await exists(join(
        childReplacement,
        'post-check-replacement',
      ))
      || await exists(join(childOwnedAway, '.rollback-owner'))) {
    throw new Error('Pinned deletion did not preserve the post-check pathname replacement.');
  }

  const releasesRoot = join(temporaryRoot, 'releases');
  await mkdir(releasesRoot, { mode: 0o700 });
  const internalPath = join(releasesRoot, 'b'.repeat(40));
  await mkdir(internalPath, { mode: 0o700 });
  await writeFile(join(internalPath, 'release-file'), 'owned release\n');
  const internalStats = await lstat(internalPath, { bigint: true });
  await quarantineOwnedDirectory({
    kind: 'release',
    path: internalPath,
    expectedIdentity: `${internalStats.dev}:${internalStats.ino}`,
    ownerToken,
    serviceRoot: temporaryRoot,
  }, runtimeHooks);
  if (await exists(internalPath)) {
    throw new Error('Exact internal release directory survived cleanup.');
  }

  const blankIdentityPath = join(releasesRoot, 'c'.repeat(40));
  await mkdir(blankIdentityPath, { mode: 0o700 });
  rejected = false;
  try {
    await quarantineOwnedDirectory({
      kind: 'release',
      path: blankIdentityPath,
      expectedIdentity: '',
      ownerToken,
      serviceRoot: temporaryRoot,
    }, runtimeHooks);
  } catch (error) {
    rejected = error.code === 'E_CLEANUP_INTERFERENCE';
  }
  if (!rejected || !await exists(blankIdentityPath)) {
    throw new Error('Internal cleanup accepted a blank identity.');
  }

  const outsidePath = join(temporaryRoot, 'd'.repeat(40));
  await mkdir(outsidePath, { mode: 0o700 });
  const outsideStats = await lstat(outsidePath, { bigint: true });
  rejected = false;
  try {
    await quarantineOwnedDirectory({
      kind: 'release',
      path: outsidePath,
      expectedIdentity: `${outsideStats.dev}:${outsideStats.ino}`,
      ownerToken,
      serviceRoot: temporaryRoot,
    }, runtimeHooks);
  } catch (error) {
    rejected = error.code === 'E_CLEANUP_INTERFERENCE';
  }
  if (!rejected || !await exists(outsidePath)) {
    throw new Error('Internal cleanup accepted an out-of-scope path.');
  }

  const helperSource = await readFile(new URL('./a6-owned-cleanup.mjs', import.meta.url));
  const streamedCli = spawnSync(process.execPath, [
    '--input-type=module',
    '-',
      'unsupported',
      outsidePath,
      `${outsideStats.dev}:${outsideStats.ino}`,
      ownerToken,
      temporaryRoot,
  ], {
    input: helperSource,
    encoding: 'utf8',
  });
  if (streamedCli.status !== 71
      || !streamedCli.stderr.includes('cleanup kind is unsupported')) {
    throw new Error('Pinned-source helper stream skipped its CLI cleanup gate.');
  }

  console.log(
    `A6 owned cleanup passed receipts, covered pre-rmdir interference, descriptor-anchored content deletion, internal scope, streamed CLI, and ${process.platform === 'linux' ? 'production GNU/Linux primitives' : 'portable non-Linux hooks'} checks; final empty-directory rmdir remains within the documented same-humble-account namespace-quiescence boundary.`,
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
