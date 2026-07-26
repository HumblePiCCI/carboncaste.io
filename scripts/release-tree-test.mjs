import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  linkSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const temporaryDirectory = mkdtempSync(join(tmpdir(), 'carboncaste-release-tree-test-'));
const archivePath = join(temporaryDirectory, 'release.tar');
const manifestPath = join(temporaryDirectory, 'manifest');

function git(...args) {
  return execFileSync('git', args, { cwd: process.cwd() });
}

function extractRelease(name) {
  const root = join(temporaryDirectory, name);
  mkdirSync(root);
  execFileSync('tar', ['-xf', archivePath, '-C', root]);
  return root;
}

function verify(root, manifest = manifestPath) {
  execFileSync(process.execPath, [
    'scripts/verify-release-tree.mjs',
    root,
    commit,
    tree,
    manifest,
  ], { cwd: process.cwd(), stdio: 'pipe' });
}

function expectRejected(label, mutate, manifest = manifestPath) {
  const root = extractRelease(label);
  mutate(root);
  let rejected = false;
  try {
    verify(root, manifest);
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error(`Release verifier accepted ${label}.`);
}

let commit;
let tree;

try {
  commit = git('rev-parse', 'HEAD').toString('utf8').trim();
  tree = git('rev-parse', 'HEAD^{tree}').toString('utf8').trim();
  writeFileSync(archivePath, git('archive', '--format=tar', commit));
  writeFileSync(manifestPath, git('ls-tree', '-r', '-z', '--full-tree', commit));

  const exactRoot = extractRelease('exact');
  verify(exactRoot);

  expectRejected('content-tamper', (root) => {
    appendFileSync(join(root, 'README.md'), '\nrelease-tree tamper probe\n');
  });
  expectRejected('unexpected-file', (root) => {
    writeFileSync(join(root, 'unexpected.txt'), 'not tracked\n');
  });
  expectRejected('missing-file', (root) => {
    rmSync(join(root, 'README.md'));
  });
  expectRejected('mode-tamper', (root) => {
    chmodSync(join(root, 'README.md'), 0o755);
  });
  expectRejected('hardlink-tamper', (root) => {
    const source = join(temporaryDirectory, 'hardlink-source');
    copyFileSync(join(root, 'README.md'), source);
    rmSync(join(root, 'README.md'));
    linkSync(source, join(root, 'README.md'));
  });

  const symlinkRoot = join(temporaryDirectory, 'symlink-root');
  symlinkSync(exactRoot, symlinkRoot, 'dir');
  let symlinkRejected = false;
  try {
    verify(symlinkRoot);
  } catch {
    symlinkRejected = true;
  }
  if (!symlinkRejected) throw new Error('Release verifier accepted a symlink root.');

  const tamperedManifest = join(temporaryDirectory, 'tampered-manifest');
  copyFileSync(manifestPath, tamperedManifest);
  appendFileSync(tamperedManifest, 'manifest-tamper');
  expectRejected('manifest-tamper', () => {}, tamperedManifest);

  console.log(
    `Release tree verification passed exact, content, path, mode, hardlink, root, and manifest checks at ${commit}.`,
  );
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
