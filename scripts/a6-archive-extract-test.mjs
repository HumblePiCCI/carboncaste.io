import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const temporaryDirectory = mkdtempSync(join(tmpdir(), 'carboncaste-a6-archive-test-'));
const archivePath = join(temporaryDirectory, 'release.tar');
const manifestPath = join(temporaryDirectory, 'release.manifest');
const expectedExtraction =
  'tar --extract --file=- --keep-old-files --no-same-owner';
let deploymentScript = '';
let isGnuTar = false;

function git(...args) {
  return execFileSync('git', args, {
    cwd: process.cwd(),
    maxBuffer: 32 * 1024 * 1024,
  });
}

function extract(root) {
  execFileSync('tar', [
    '--extract',
    `--file=${archivePath}`,
    `--directory=${root}`,
    '--keep-old-files',
    '--no-same-owner',
  ], { stdio: 'pipe' });
}

function snapshot(path, follow = false) {
  const stats = follow ? statSync(path) : lstatSync(path);
  return {
    dev: stats.dev,
    ino: stats.ino,
    mode: stats.mode,
    nlink: stats.nlink,
    size: stats.size,
  };
}

function sameSnapshot(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.nlink === right.nlink
    && left.size === right.size;
}

function sameDirectoryIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode;
}

function expectGnuCollision(root, label) {
  let rejected = false;
  try {
    extract(root);
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error(`GNU tar accepted ${label}.`);
}

try {
  deploymentScript = readFileSync('scripts/deploy-a6.sh', 'utf8');
  isGnuTar = execFileSync('tar', ['--version'], { encoding: 'utf8' })
    .includes('GNU tar');
  if (!deploymentScript.includes(expectedExtraction)
      || deploymentScript.includes('--no-overwrite-dir')) {
    throw new Error('A6 deployment does not use the tested compatible extraction flags.');
  }
  if (!deploymentScript.includes(
    'find . -mindepth 1 -maxdepth 1 -printf x | wc -c',
  )) {
    throw new Error('A6 deployment does not require an owner-only staging root.');
  }

  writeFileSync(archivePath, git('archive', '--format=tar', 'HEAD'));
  writeFileSync(manifestPath, git('ls-tree', '-r', '-z', '--full-tree', 'HEAD'));
  const exactRoot = join(temporaryDirectory, 'exact');
  mkdirSync(exactRoot);
  const exactMarker = join(exactRoot, '.staging-owner');
  writeFileSync(exactMarker, 'owner\n', { mode: 0o600 });
  chmodSync(exactMarker, 0o600);
  const markerBefore = snapshot(exactMarker);
  if (readdirSync(exactRoot).length !== 1) {
    throw new Error('Archive extraction fixture is not owner-only.');
  }
  extract(exactRoot);
  if (!sameSnapshot(markerBefore, snapshot(exactMarker))
      || !readFileSync(exactMarker).equals(Buffer.from('owner\n'))) {
    throw new Error('Compatible extraction changed the staging-owner receipt.');
  }
  const expectedReadme = git('show', 'HEAD:README.md');
  const extractedReadme = readFileSync(join(exactRoot, 'README.md'));
  if (!extractedReadme.equals(expectedReadme)) {
    throw new Error('Compatible extraction did not reproduce the tracked README.');
  }

  const collisionRoot = join(temporaryDirectory, 'collision');
  mkdirSync(collisionRoot);
  writeFileSync(join(collisionRoot, '.staging-owner'), 'owner\n', { mode: 0o600 });
  const sentinel = Buffer.from('pre-existing collision sentinel\n');
  writeFileSync(join(collisionRoot, 'README.md'), sentinel);
  let collisionRejected = false;
  try {
    extract(collisionRoot);
  } catch {
    collisionRejected = true;
  }
  if ((isGnuTar && !collisionRejected)
      || !readFileSync(join(collisionRoot, 'README.md')).equals(sentinel)) {
    throw new Error('Compatible extraction replaced or accepted a pre-existing file.');
  }

  if (isGnuTar) {
    const externalFile = join(temporaryDirectory, 'external-file');
    writeFileSync(externalFile, sentinel);
    const symlinkRoot = join(temporaryDirectory, 'file-symlink');
    mkdirSync(symlinkRoot);
    writeFileSync(join(symlinkRoot, '.staging-owner'), 'owner\n', { mode: 0o600 });
    const fileSymlink = join(symlinkRoot, 'README.md');
    symlinkSync(externalFile, fileSymlink);
    const fileSymlinkBefore = snapshot(fileSymlink);
    expectGnuCollision(symlinkRoot, 'a pre-existing file symlink');
    if (!sameSnapshot(fileSymlinkBefore, snapshot(fileSymlink))
        || !readFileSync(externalFile).equals(sentinel)) {
      throw new Error('GNU tar changed a file symlink collision or its target.');
    }

    const externalDirectory = join(temporaryDirectory, 'external-directory');
    mkdirSync(externalDirectory);
    writeFileSync(join(externalDirectory, 'sentinel'), sentinel);
    const directorySymlinkRoot = join(temporaryDirectory, 'directory-symlink');
    mkdirSync(directorySymlinkRoot);
    writeFileSync(
      join(directorySymlinkRoot, '.staging-owner'),
      'owner\n',
      { mode: 0o600 },
    );
    const directorySymlink = join(directorySymlinkRoot, 'iceland26');
    symlinkSync(externalDirectory, directorySymlink);
    const directorySymlinkBefore = snapshot(directorySymlink);
    expectGnuCollision(directorySymlinkRoot, 'a pre-existing directory symlink');
    if (!sameSnapshot(directorySymlinkBefore, snapshot(directorySymlink))
        || readdirSync(externalDirectory).join('\0') !== 'sentinel'
        || !readFileSync(join(externalDirectory, 'sentinel')).equals(sentinel)) {
      throw new Error('GNU tar changed a directory symlink collision or its target.');
    }

    const hardlinkSource = join(temporaryDirectory, 'hardlink-source');
    writeFileSync(hardlinkSource, sentinel);
    const hardlinkRoot = join(temporaryDirectory, 'hardlink');
    mkdirSync(hardlinkRoot);
    writeFileSync(join(hardlinkRoot, '.staging-owner'), 'owner\n', { mode: 0o600 });
    const hardlinkCollision = join(hardlinkRoot, 'README.md');
    linkSync(hardlinkSource, hardlinkCollision);
    const hardlinkBefore = snapshot(hardlinkSource, true);
    expectGnuCollision(hardlinkRoot, 'a pre-existing hardlink');
    if (!sameSnapshot(hardlinkBefore, snapshot(hardlinkSource, true))
        || !sameSnapshot(hardlinkBefore, snapshot(hardlinkCollision, true))
        || !readFileSync(hardlinkSource).equals(sentinel)) {
      throw new Error('GNU tar changed a hardlink collision.');
    }

    const realDirectoryRoot = join(temporaryDirectory, 'real-directory');
    mkdirSync(realDirectoryRoot);
    writeFileSync(
      join(realDirectoryRoot, '.staging-owner'),
      'owner\n',
      { mode: 0o600 },
    );
    const existingDirectory = join(realDirectoryRoot, 'iceland26');
    mkdirSync(existingDirectory, { mode: 0o700 });
    chmodSync(existingDirectory, 0o700);
    writeFileSync(join(existingDirectory, 'sentinel'), sentinel);
    const directoryBefore = snapshot(existingDirectory);
    extract(realDirectoryRoot);
    // Extracting a tracked child directory legitimately changes the parent's
    // link count (and may change its allocated directory size). Preserve the
    // existing directory object and mode; the exact-tree verifier below still
    // rejects the sentinel and any other untracked entry.
    if (!sameDirectoryIdentity(directoryBefore, snapshot(existingDirectory))
        || !readFileSync(join(existingDirectory, 'sentinel')).equals(sentinel)
        || !readFileSync(join(existingDirectory, 'index.html')).length) {
      throw new Error('GNU tar changed an existing real directory or its sentinel.');
    }
    let verifierRejected = false;
    try {
      execFileSync(process.execPath, [
        'scripts/verify-release-tree.mjs',
        realDirectoryRoot,
        git('rev-parse', 'HEAD').toString('utf8').trim(),
        git('rev-parse', 'HEAD^{tree}').toString('utf8').trim(),
        manifestPath,
      ], { cwd: process.cwd(), stdio: 'pipe' });
    } catch {
      verifierRejected = true;
    }
    if (!verifierRejected) {
      throw new Error('Release verifier accepted an existing-directory sentinel.');
    }
  }

  if (isGnuTar) {
    console.log(
      'A6 archive extraction passed production GNU flags, owner-only preflight, marker custody, exact content, file/symlink/hardlink collisions, and real-directory verifier rejection.',
    );
  } else {
    console.log(
      'A6 archive extraction passed the portable marker and no-replace baseline; production GNU adversarial cases require the Linux custody lane.',
    );
  }
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
