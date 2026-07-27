#!/usr/bin/env node
import { createHash } from 'node:crypto';
import {
  constants,
  lstat,
  open,
  readdir,
  readlink,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';

const [
  rootArgument,
  expectedCommit,
  expectedTree,
  manifestPath,
] = process.argv.slice(2);

const receiptFiles = new Set([
  '.staging-owner',
  'EXPECTED_NEW_TREE_MANIFEST',
  'EXPECTED_PREVIOUS_TREE_MANIFEST',
  'RELEASE_TREE',
  'RELEASE_TREE_MANIFEST',
  'REVISION',
]);

function fail(message) {
  throw new Error(`Release tree verification failed: ${message}`);
}

function gitObjectHash(type, body) {
  return createHash('sha1')
    .update(Buffer.from(`${type} ${body.length}\0`))
    .update(body)
    .digest('hex');
}

function sameSnapshot(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

async function readRegularFileSafely(path, label) {
  if (!constants.O_NOFOLLOW) fail('runtime does not provide O_NOFOLLOW');
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = await handle.stat({ bigint: true });
    if (!before.isFile()) fail(`${label} is not a regular file`);
    if (before.nlink !== 1n) fail(`${label} must have exactly one hard link`);
    const body = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    const pathnameAfter = await lstat(path, { bigint: true });
    if (!sameSnapshot(before, after)
        || pathnameAfter.dev !== after.dev
        || pathnameAfter.ino !== after.ino
        || !pathnameAfter.isFile()) {
      fail(`${label} changed while it was read`);
    }
    return { body, stats: after };
  } finally {
    await handle?.close();
  }
}

async function readSymbolicLinkSafely(path, label) {
  const before = await lstat(path, { bigint: true });
  if (!before.isSymbolicLink()) fail(`${label} is not a symbolic link`);
  if (before.nlink !== 1n) fail(`${label} must have exactly one hard link`);
  const body = await readlink(path, { encoding: 'buffer' });
  const after = await lstat(path, { bigint: true });
  if (!sameSnapshot(before, after) || !after.isSymbolicLink()) {
    fail(`${label} changed while it was read`);
  }
  return { body, stats: after };
}

function parseManifest(buffer) {
  if (!buffer.length || buffer.at(-1) !== 0) fail('manifest must use NUL-terminated records');
  const entries = [];
  const seen = new Set();
  let offset = 0;
  while (offset < buffer.length) {
    const end = buffer.indexOf(0, offset);
    if (end < 0) fail('manifest record is unterminated');
    if (end === offset) {
      offset += 1;
      continue;
    }
    const record = buffer.subarray(offset, end);
    const tab = record.indexOf(9);
    if (tab < 0) fail('manifest record has no path separator');
    const metadata = record.subarray(0, tab).toString('ascii');
    const match = /^(100644|100755|120000) blob ([0-9a-f]{40})$/.exec(metadata);
    if (!match) fail(`unsupported manifest metadata: ${metadata}`);
    const pathBuffer = record.subarray(tab + 1);
    const path = pathBuffer.toString('utf8');
    if (!Buffer.from(path, 'utf8').equals(pathBuffer)
        || !path
        || path.startsWith('/')
        || path.split('/').some((part) => !part || part === '.' || part === '..')) {
      fail('manifest contains an unsafe or non-UTF-8 path');
    }
    if (seen.has(path)) fail(`manifest repeats ${path}`);
    seen.add(path);
    entries.push({ mode: match[1], sha: match[2], path });
    offset = end + 1;
  }
  return entries;
}

function treeFromManifest(entries) {
  const root = { children: new Map() };
  for (const entry of entries) {
    const parts = entry.path.split('/');
    let node = root;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const name = parts[index];
      const existing = node.children.get(name);
      if (existing?.kind === 'blob') fail(`${entry.path} conflicts with a file path`);
      if (!existing) {
        node.children.set(name, { kind: 'tree', node: { children: new Map() } });
      }
      node = node.children.get(name).node;
    }
    const name = parts.at(-1);
    if (node.children.has(name)) fail(`${entry.path} conflicts with another manifest entry`);
    node.children.set(name, { kind: 'blob', entry });
  }
  return root;
}

function hashTree(node) {
  const children = [...node.children.entries()].sort(([leftName, left], [rightName, right]) => (
    Buffer.compare(
      Buffer.from(`${leftName}${left.kind === 'tree' ? '/' : '\0'}`),
      Buffer.from(`${rightName}${right.kind === 'tree' ? '/' : '\0'}`),
    )
  ));
  const body = [];
  for (const [name, child] of children) {
    const mode = child.kind === 'tree' ? '40000' : child.entry.mode;
    const sha = child.kind === 'tree' ? hashTree(child.node) : child.entry.sha;
    body.push(Buffer.from(`${mode} ${name}\0`), Buffer.from(sha, 'hex'));
  }
  return gitObjectHash('tree', Buffer.concat(body));
}

async function listReleaseFiles(root, relative = '') {
  const directoryPath = join(root, relative);
  const before = await lstat(directoryPath, { bigint: true });
  if (!before.isDirectory() || before.isSymbolicLink()) {
    fail(`${relative || 'release root'} is not a real directory`);
  }
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    const childStats = await lstat(join(root, child), { bigint: true });
    if (!relative
        && receiptFiles.has(entry.name)
        && childStats.isFile()
        && !childStats.isSymbolicLink()) {
      continue;
    }
    if (childStats.isDirectory() && !childStats.isSymbolicLink()) {
      paths.push(`${child}/`);
      paths.push(...await listReleaseFiles(root, child));
    } else {
      paths.push(child);
    }
  }
  const after = await lstat(directoryPath, { bigint: true });
  if (!sameSnapshot(before, after) || !after.isDirectory()) {
    fail(`${relative || 'release root'} changed while it was enumerated`);
  }
  return paths;
}

if (!rootArgument
    || !/^[0-9a-f]{40}$/.test(expectedCommit || '')
    || !/^[0-9a-f]{40}$/.test(expectedTree || '')
    || !manifestPath) {
  fail('usage: verify-release-tree <root> <commit-sha> <tree-sha> <manifest>');
}

const root = resolve(rootArgument);
const rootBefore = await lstat(root, { bigint: true });
if (!rootBefore.isDirectory() || rootBefore.isSymbolicLink()) {
  fail('release root must be a real directory, not a symbolic link');
}
const { body: manifestBody } = await readRegularFileSafely(manifestPath, 'manifest');
const manifestEntries = parseManifest(manifestBody);
const manifestTree = hashTree(treeFromManifest(manifestEntries));
if (manifestTree !== expectedTree) {
  fail(`manifest tree ${manifestTree} does not match expected Git tree ${expectedTree}`);
}

const expectedPaths = new Set();
for (const entry of manifestEntries) {
  expectedPaths.add(entry.path);
  const parts = entry.path.split('/');
  for (let index = 1; index < parts.length; index += 1) {
    expectedPaths.add(`${parts.slice(0, index).join('/')}/`);
  }
}
const actualPaths = new Set(await listReleaseFiles(root));
for (const path of expectedPaths) {
  if (!actualPaths.has(path)) fail(`missing tracked path ${path}`);
}
for (const path of actualPaths) {
  if (!expectedPaths.has(path)) fail(`unexpected release path ${path}`);
}

for (const entry of manifestEntries) {
  const path = join(root, entry.path);
  let mode;
  let body;
  const initialStats = await lstat(path, { bigint: true });
  if (initialStats.isSymbolicLink()) {
    const result = await readSymbolicLinkSafely(path, entry.path);
    mode = '120000';
    body = result.body;
  } else if (initialStats.isFile()) {
    const result = await readRegularFileSafely(path, entry.path);
    mode = result.stats.mode & 0o111n ? '100755' : '100644';
    body = result.body;
  } else {
    fail(`unsupported tracked object at ${entry.path}`);
  }
  if (mode !== entry.mode) {
    fail(`${entry.path} mode ${mode} does not match ${entry.mode}`);
  }
  const sha = gitObjectHash('blob', body);
  if (sha !== entry.sha) {
    fail(`${entry.path} blob ${sha} does not match ${entry.sha}`);
  }
}

const rootAfter = await lstat(root, { bigint: true });
if (!sameSnapshot(rootBefore, rootAfter) || !rootAfter.isDirectory()) {
  fail('release root changed while it was verified');
}

console.log(
  `Verified release tree: commit=${expectedCommit} tree=${expectedTree} files=${manifestEntries.length}`,
);
