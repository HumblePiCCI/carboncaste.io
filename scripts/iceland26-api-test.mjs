import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const port = Number(process.env.ICELAND26_TEST_PORT || 18126);
const baseUrl = `http://127.0.0.1:${port}`;
const testAccessCode = 'test-only-iceland-code';
const testAccessHash = createHash('sha256').update(testAccessCode).digest('hex');
const testInstanceNonce = randomUUID();
const failures = [];
let temporaryDirectory = null;
let statePath = null;
let child = null;
let sessionCookie = '';
let cleanupPromise = null;

function fail(message) {
  failures.push(message);
}

async function waitForServer(process, timeout = 8_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (process.exitCode !== null) throw new Error(`Server exited with ${process.exitCode}.`);
    try {
      const response = await fetch(`${baseUrl}/api/iceland26/health`);
      const health = await response.json();
      if (response.ok
          && health.ready === true
          && health.instance === testInstanceNonce
          && process.exitCode === null) return;
    } catch {
      // The task-owned listener is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error('Timed out waiting for the Iceland coordination test server.');
}

async function startServer() {
  child = spawn(process.execPath, ['server/static-server.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CARBONCASTE_WEB_HOST: '127.0.0.1',
      CARBONCASTE_WEB_PORT: String(port),
      CARBONCASTE_WEB_ROOT: process.cwd(),
      ICELAND26_DATA_PATH: statePath,
      ICELAND26_ACCESS_HASH: testAccessHash,
      ICELAND26_SESSION_SECRET: 'test-session-secret-that-is-longer-than-thirty-two-characters',
      ICELAND26_COOKIE_SECURE: 'true',
      ICELAND26_INSTANCE_NONCE: testInstanceNonce,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  child.testOutput = () => output;
  await waitForServer(child);
}

async function waitForExit(serverProcess, timeout) {
  if (serverProcess.exitCode !== null) return true;
  return new Promise((resolve) => {
    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      serverProcess.removeListener('exit', onExit);
      resolve(false);
    }, timeout);
    serverProcess.once('exit', onExit);
  });
}

async function stopServer(serverProcess) {
  if (!serverProcess || serverProcess.exitCode !== null) return;
  serverProcess.kill('SIGTERM');
  if (await waitForExit(serverProcess, 3_000)) return;
  serverProcess.kill('SIGKILL');
  if (!await waitForExit(serverProcess, 3_000)) {
    throw new Error(`Server process ${serverProcess.pid} survived SIGTERM and SIGKILL.`);
  }
}

async function cleanupResources() {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    const ownedChild = child;
    child = null;
    const cleanupErrors = [];
    try {
      await stopServer(ownedChild);
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (temporaryDirectory) {
      try {
        await rm(temporaryDirectory, { recursive: true, force: true });
      } catch (error) {
        cleanupErrors.push(error);
      }
      temporaryDirectory = null;
    }
    if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'API test cleanup failed.');
  })();
  return cleanupPromise;
}

async function exitAfterCleanup(code) {
  try {
    await cleanupResources();
  } finally {
    process.exit(code);
  }
}

process.once('SIGINT', () => { void exitAfterCleanup(130); });
process.once('SIGTERM', () => { void exitAfterCleanup(143); });
process.once('SIGHUP', () => { void exitAfterCleanup(129); });

async function jsonRequest(path, { method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(sessionCookie ? { Cookie: sessionCookie } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, body: await response.json() };
}

try {
  temporaryDirectory = mkdtempSync(join(tmpdir(), 'carboncaste-iceland26-test-'));
  statePath = join(temporaryDirectory, 'state', 'iceland26.json');
  await mkdir(join(temporaryDirectory, 'state'), { recursive: true });
  await writeFile(statePath, `${JSON.stringify({
    schemaVersion: 1,
    revision: 1,
    updatedAt: '2026-08-08T00:00:00.000Z',
    preferences: { 'arrival-bjarkalundur': { ben: 'love' } },
    comments: [],
    suggestions: [],
    activity: [],
  }, null, 2)}\n`, 'utf8');
  await startServer();

  const health = await jsonRequest('/api/iceland26/health');
  if (health.response.status !== 200
      || health.body.ready !== true
      || health.body.instance !== testInstanceNonce) {
    fail('Configured coordination service did not report ready.');
  }

  const unauthorized = await jsonRequest('/api/iceland26');
  if (unauthorized.response.status !== 401) {
    fail('Shared coordination state was readable without a trip session.');
  }

  const badLogin = await jsonRequest('/api/iceland26/login', {
    method: 'POST',
    body: { code: 'not-the-code' },
  });
  if (badLogin.response.status !== 401) fail('An invalid trip code was not rejected.');

  const login = await jsonRequest('/api/iceland26/login', {
    method: 'POST',
    body: { code: testAccessCode },
  });
  const setCookie = login.response.headers.get('set-cookie') || '';
  sessionCookie = setCookie.split(';', 1)[0];
  if (login.response.status !== 200
      || !login.body.authenticated
      || !sessionCookie.startsWith('iceland26_session=')
      || !setCookie.includes('HttpOnly')
      || !setCookie.includes('Secure')
      || !setCookie.includes('SameSite=Strict')) {
    fail('A valid trip code did not establish a hardened session cookie.');
  }

  const initial = await jsonRequest('/api/iceland26');
  if (initial.response.status !== 200
      || !initial.body.available
      || initial.body.revision !== 1
      || initial.body.preferences?.['arrival-bjarkalundur']?.ben !== 'love') {
    fail('Existing production-shaped revision 1 state was not preserved at startup.');
  }

  const noIndex = initial.response.headers.get('x-robots-tag') || '';
  if (!noIndex.includes('noindex')) fail('API responses must be marked noindex.');
  if (initial.response.headers.get('cache-control') !== 'no-store') {
    fail('API responses must disable caching.');
  }
  if (!initial.response.headers.get('vary')?.toLowerCase().includes('cookie')) {
    fail('API responses must vary by session cookie.');
  }

  const privateAsset = await fetch(`${baseUrl}/iceland26/itinerary.json`, {
    headers: { Cookie: sessionCookie },
  });
  if (privateAsset.status !== 200
      || privateAsset.headers.get('cache-control') !== 'private, no-store'
      || !privateAsset.headers.get('vary')?.toLowerCase().includes('cookie')) {
    fail('Authenticated trip assets must be private, uncached, and cookie-varying.');
  }

  const privateMapAsset = await fetch(`${baseUrl}/iceland26/map-data.json`, {
    headers: { Cookie: sessionCookie },
  });
  if (privateMapAsset.status !== 200
      || privateMapAsset.headers.get('cache-control') !== 'private, no-store'
      || !privateMapAsset.headers.get('vary')?.toLowerCase().includes('cookie')) {
    fail('Authenticated route geometry must be private, uncached, and cookie-varying.');
  }

  const lockedMapAsset = await fetch(`${baseUrl}/iceland26/map-data.json`, {
    redirect: 'manual',
  });
  if (lockedMapAsset.status !== 302
      || !lockedMapAsset.headers.get('location')?.startsWith('/iceland26/access.html')) {
    fail('Route geometry bypassed the private Iceland route gate.');
  }

  const lockedMediaAsset = await fetch(`${baseUrl}/iceland26/media/dynjandi.webp`, {
    redirect: 'manual',
  });
  if (lockedMediaAsset.status !== 302
      || !lockedMediaAsset.headers.get('location')?.startsWith('/iceland26/access.html')) {
    fail('Planning-document media bypassed the private Iceland route gate.');
  }

  const privateMediaAsset = await fetch(`${baseUrl}/iceland26/media/dynjandi.webp`, {
    headers: { Cookie: sessionCookie },
  });
  if (privateMediaAsset.status !== 200
      || privateMediaAsset.headers.get('content-type') !== 'image/webp'
      || privateMediaAsset.headers.get('cache-control') !== 'private, no-store'
      || !privateMediaAsset.headers.get('vary')?.toLowerCase().includes('cookie')
      || !privateMediaAsset.headers.get('x-robots-tag')?.includes('noindex')
      || Number(privateMediaAsset.headers.get('content-length') || 0) < 1_000) {
    fail('Authenticated planning-document media must be a private, uncached, non-indexed WebP asset.');
  }

  const privateTraversal = await fetch(`${baseUrl}/dist/..%2ficeland26/itinerary.json`, {
    redirect: 'manual',
  });
  if (privateTraversal.status !== 302
      || !privateTraversal.headers.get('location')?.startsWith('/iceland26/access.html')) {
    fail('Encoded-path traversal bypassed the private Iceland route gate.');
  }

  const sourceTraversal = await fetch(`${baseUrl}/dist/..%2fserver/static-server.mjs`, {
    redirect: 'manual',
  });
  if (sourceTraversal.status !== 404) {
    fail('Encoded-path traversal exposed non-public server source.');
  }

  const crossSite = await jsonRequest('/api/iceland26/preference', {
    method: 'POST',
    headers: {
      Origin: 'https://example.net',
      'Sec-Fetch-Site': 'cross-site',
    },
    body: {
      participant: 'ben',
      optionId: 'placeholder',
      preference: 'love',
    },
  });
  if (crossSite.response.status !== 403) fail('Cross-site mutation was not rejected.');

  const unknownOption = await jsonRequest('/api/iceland26/preference', {
    method: 'POST',
    body: {
      participant: 'ben',
      optionId: 'not-an-option',
      preference: 'love',
    },
  });
  if (unknownOption.response.status !== 400) fail('Unknown option mutation was not rejected.');

  const suggestion = await jsonRequest('/api/iceland26/suggestion', {
    method: 'POST',
    body: {
      participant: 'laura',
      title: 'A quiet local pool',
      location: 'Reykjavík',
      details: 'An uncrowded backup idea for a weather-flex day.',
    },
  });
  const suggestionId = suggestion.body.result?.id;
  if (suggestion.response.status !== 200 || !suggestionId?.startsWith('custom-')) {
    fail('A valid shared suggestion was not saved.');
  }

  const preference = await jsonRequest('/api/iceland26/preference', {
    method: 'POST',
    body: {
      participant: 'brad',
      optionId: suggestionId,
      preference: 'love',
    },
  });
  if (preference.response.status !== 200
      || preference.body.state?.preferences?.[suggestionId]?.brad !== 'love') {
    fail('A valid preference was not saved.');
  }

  const comment = await jsonRequest('/api/iceland26/comment', {
    method: 'POST',
    body: {
      participant: 'mary',
      optionId: suggestionId,
      text: 'Perfect for the evening.',
    },
  });
  if (comment.response.status !== 200 || comment.body.result?.text !== 'Perfect for the evening.') {
    fail('A valid comment was not saved.');
  }

  const concurrentVotes = await Promise.all(
    ['ben', 'mary', 'laura', 'brad'].map((participant) => jsonRequest('/api/iceland26/preference', {
      method: 'POST',
      body: {
        participant,
        optionId: 'dynjandi',
        preference: participant === 'brad' ? 'interested' : 'love',
      },
    })),
  );
  if (concurrentVotes.some(({ response }) => response.status !== 200)) {
    fail('Concurrent granular preferences were not serialized successfully.');
  }

  const stored = JSON.parse(await readFile(statePath, 'utf8'));
  const previous = JSON.parse(await readFile(`${statePath}.previous`, 'utf8'));
  if (stored.revision !== 8
      || stored.comments.length !== 1
      || stored.suggestions.length !== 1
      || Object.keys(stored.preferences.dynjandi || {}).length !== 4
      || stored.preferences?.['arrival-bjarkalundur']?.ben !== 'love') {
    fail('Atomic state file does not preserve the production-shaped preference plus all seven serialized mutations.');
  }
  if (previous.revision !== 7
      || Object.keys(previous.preferences.dynjandi || {}).length !== 3) {
    fail('Previous-state checkpoint does not contain the last valid revision.');
  }

  await stopServer(child);
  child = null;
  await startServer();
  const restored = await jsonRequest('/api/iceland26');
  if (restored.body.revision !== 8
      || restored.body.preferences?.[suggestionId]?.brad !== 'love'
      || restored.body.preferences?.['arrival-bjarkalundur']?.ben !== 'love'
      || restored.body.suggestions?.[0]?.title !== 'A quiet local pool'
      || Object.keys(restored.body.preferences?.dynjandi || {}).length !== 4) {
    fail('Coordination state did not survive a server restart.');
  }

  const wrongMethod = await jsonRequest('/api/iceland26/comment', { method: 'GET' });
  if (wrongMethod.response.status !== 405) fail('Mutation route did not reject GET.');

  const crossSiteLogout = await jsonRequest('/api/iceland26/logout', {
    method: 'POST',
    headers: {
      Origin: 'https://example.net',
      'Sec-Fetch-Site': 'cross-site',
    },
  });
  if (crossSiteLogout.response.status !== 403) fail('Cross-site logout was not rejected.');

  const logout = await jsonRequest('/api/iceland26/logout', { method: 'POST' });
  if (logout.response.status !== 200
      || !logout.response.headers.get('set-cookie')?.includes('Max-Age=0')) {
    fail('Logout did not expire the trip session.');
  }
  sessionCookie = '';
  const lockedAgain = await jsonRequest('/api/iceland26');
  if (lockedAgain.response.status !== 401) fail('State remained readable after logout.');
} catch (error) {
  fail(`${error.message}${child?.testOutput?.() ? `\n${child.testOutput()}` : ''}`);
} finally {
  try {
    await cleanupResources();
  } catch (error) {
    fail(error.message);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Iceland coordination API passed access control, validation, CSRF, atomic persistence, concurrency, logout, and restart checks.');
