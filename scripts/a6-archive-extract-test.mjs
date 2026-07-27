import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const temporaryDirectory = mkdtempSync(join(tmpdir(), 'carboncaste-a6-archive-test-'));
const archivePath = join(temporaryDirectory, 'release.tar');
const deploymentScript = readFileSync('scripts/deploy-a6.sh', 'utf8');
const expectedExtraction =
  'tar --extract --file=- --keep-old-files --no-same-owner';
const isGnuTar = execFileSync('tar', ['--version'], { encoding: 'utf8' })
  .includes('GNU tar');

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

try {
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
  const exactRoot = join(temporaryDirectory, 'exact');
  mkdirSync(exactRoot);
  writeFileSync(join(exactRoot, '.staging-owner'), 'owner\n');
  if (readdirSync(exactRoot).length !== 1) {
    throw new Error('Archive extraction fixture is not owner-only.');
  }
  extract(exactRoot);
  const expectedReadme = git('show', 'HEAD:README.md');
  const extractedReadme = readFileSync(join(exactRoot, 'README.md'));
  if (!extractedReadme.equals(expectedReadme)) {
    throw new Error('Compatible extraction did not reproduce the tracked README.');
  }

  const collisionRoot = join(temporaryDirectory, 'collision');
  mkdirSync(collisionRoot);
  writeFileSync(join(collisionRoot, '.staging-owner'), 'owner\n');
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

  console.log(
    'A6 archive extraction passed compatible flags, owner-only preflight, exact content, and no-replace collision checks.',
  );
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
