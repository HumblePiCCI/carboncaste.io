import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const port = Number(process.env.ICELAND26_TEST_PORT || 18126);
const baseUrl = `http://127.0.0.1:${port}`;
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'carboncaste-iceland26-test-'));
const statePath = join(temporaryDirectory, 'state', 'iceland26.json');
const testAccessCode = 'test-only-iceland-code';
const testAccessHash = createHash('sha256').update(testAccessCode).digest('hex');
const failures = [];
let child = null;
let sessionCookie = '';

function fail(message) {
  failures.push(message);
}

async function waitForServer(process, timeout = 8_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (process.exitCode !== null) throw new Error(`Server exited with ${process.exitCode}.`);
    try {
      const response = await fetch(`${baseUrl}/`);
      if (response.ok) return;
    } catch {
      // The task-owned listener is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error('Timed out waiting for the Iceland coordination test server.');
}

async function startServer() {
  const serverProcess = spawn(process.execPath, ['server/static-server.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CARBONCASTE_WEB_HOST: '127.0.0.1',
      CARBONCASTE_WEB_PORT: String(port),
      CARBONCASTE_WEB_ROOT: process.cwd(),
      ICELAND26_DATA_PATH: statePath,
      ICELAND26_ACCESS_HASH: testAccessHash,
      ICELAND26_SESSION_SECRET: 'test-session-secret-that-is-longer-than-thirty-two-characters',
      ICELAND26_COOKIE_SECURE: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  serverProcess.stdout.on('data', (chunk) => { output += chunk; });
  serverProcess.stderr.on('data', (chunk) => { output += chunk; });
  serverProcess.testOutput = () => output;
  await waitForServer(serverProcess);
  return serverProcess;
}

async function stopServer(serverProcess) {
  if (!serverProcess || serverProcess.exitCode !== null) return;
  serverProcess.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => serverProcess.once('exit', resolve)),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Server did not stop.')), 3_000)),
  ]);
}

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
  child = await startServer();

  const health = await jsonRequest('/api/iceland26/health');
  if (health.response.status !== 200 || health.body.ready !== true) {
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
      || !setCookie.includes('SameSite=Strict')) {
    fail('A valid trip code did not establish a hardened session cookie.');
  }

  const initial = await jsonRequest('/api/iceland26');
  if (initial.response.status !== 200 || !initial.body.available || initial.body.revision !== 0) {
    fail('Initial API state was not available at revision 0.');
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
  if (stored.revision !== 7
      || stored.comments.length !== 1
      || stored.suggestions.length !== 1
      || Object.keys(stored.preferences.dynjandi || {}).length !== 4) {
    fail('Atomic state file does not contain all seven serialized mutations.');
  }
  if (previous.revision !== 6
      || Object.keys(previous.preferences.dynjandi || {}).length !== 3) {
    fail('Previous-state checkpoint does not contain the last valid revision.');
  }

  await stopServer(child);
  child = null;
  child = await startServer();
  const restored = await jsonRequest('/api/iceland26');
  if (restored.body.revision !== 7
      || restored.body.preferences?.[suggestionId]?.brad !== 'love'
      || restored.body.suggestions?.[0]?.title !== 'A quiet local pool'
      || Object.keys(restored.body.preferences?.dynjandi || {}).length !== 4) {
    fail('Coordination state did not survive a server restart.');
  }

  const wrongMethod = await jsonRequest('/api/iceland26/comment', { method: 'GET' });
  if (wrongMethod.response.status !== 405) fail('Mutation route did not reject GET.');

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
    await stopServer(child);
  } catch (error) {
    fail(error.message);
  }
  await rm(temporaryDirectory, { recursive: true, force: true });
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Iceland coordination API passed access control, validation, CSRF, atomic persistence, concurrency, logout, and restart checks.');
