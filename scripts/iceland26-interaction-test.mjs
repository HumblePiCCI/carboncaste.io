import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const port = Number(process.env.ICELAND26_INTERACTION_PORT || 18127);
const baseUrl = `http://127.0.0.1:${port}`;
const testAccessCode = 'test-only-iceland-code';
const testAccessHash = createHash('sha256').update(testAccessCode).digest('hex');
const testInstanceNonce = randomUUID();
const chromePaths = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];
const executablePath = chromePaths.find(existsSync);

mkdirSync('output/playwright/iceland26', { recursive: true });
const failures = [];
let temporaryDirectory = null;
let statePath = null;
let serverProcess = null;
let browser = null;
let browserServer = null;
let browserLaunchPromise = null;
let cleanupPromise = null;
let requestedSignalCode = null;

function fail(message) {
  failures.push(message);
}

async function startServer() {
  serverProcess = spawn(process.execPath, ['server/static-server.mjs'], {
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
      ICELAND26_INSTANCE_NONCE: testInstanceNonce,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  serverProcess.stdout.on('data', (chunk) => { output += chunk; });
  serverProcess.stderr.on('data', (chunk) => { output += chunk; });
  serverProcess.testOutput = () => output;

  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`Server exited with ${serverProcess.exitCode}.\n${output}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/iceland26/health`);
      const health = await response.json();
      if (response.ok
          && health.ready === true
          && health.instance === testInstanceNonce
          && serverProcess.exitCode === null) return;
    } catch {
      // Listener is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(`Timed out waiting for server.\n${output}`);
}

async function waitForExit(child, timeout) {
  if (child.exitCode !== null) return true;
  return new Promise((resolve) => {
    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      child.removeListener('exit', onExit);
      resolve(false);
    }, timeout);
    child.once('exit', onExit);
  });
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  if (await waitForExit(child, 3_000)) return;
  child.kill('SIGKILL');
  if (!await waitForExit(child, 3_000)) {
    throw new Error(`UI test server process ${child.pid} survived SIGTERM and SIGKILL.`);
  }
}

async function settleWithin(promise, timeout) {
  let timer;
  try {
    return await Promise.race([
      promise.then(() => true, () => false),
      new Promise((resolve) => { timer = setTimeout(() => resolve(false), timeout); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function cleanupResources() {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    const ownedBrowser = browser;
    const ownedBrowserServer = browserServer;
    const ownedServer = serverProcess;
    browser = null;
    browserServer = null;
    serverProcess = null;
    const cleanupErrors = [];

    try {
      if (ownedBrowser) await settleWithin(ownedBrowser.close(), 3_000);
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      if (ownedBrowserServer) {
        const closed = await settleWithin(ownedBrowserServer.close(), 3_000);
        if (!closed) await ownedBrowserServer.kill();
      }
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      await stopServer(ownedServer);
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
    if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'UI test cleanup failed.');
  })();
  return cleanupPromise;
}

async function exitAfterCleanup(code) {
  requestedSignalCode = code;
  try {
    if (browserLaunchPromise) {
      try {
        browserServer ||= await browserLaunchPromise;
      } catch {
        // A failed launch owns no live browser process.
      }
    }
    await cleanupResources();
  } finally {
    process.exit(code);
  }
}

process.once('SIGINT', () => { void exitAfterCleanup(130); });
process.once('SIGTERM', () => { void exitAfterCleanup(143); });
process.once('SIGHUP', () => { void exitAfterCleanup(129); });

async function runViewport(viewport, label, mutate = false) {
  const page = await browser.newPage({
    viewport,
    hasTouch: label === 'mobile',
  });
  const errors = [];
  let expectedLogoutFailure = false;
  page.on('console', (message) => {
    if (message.type() === 'error'
        && !(expectedLogoutFailure && message.text().includes('status of 503'))) {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));

  try {
    const accessResponse = await page.goto(`${baseUrl}/iceland26/`, { waitUntil: 'networkidle' });
    if (!page.url().includes('/iceland26/access.html')) {
      fail(`${label}: protected trip route did not redirect to the access page.`);
    }
    if (accessResponse?.status() !== 200) {
      fail(`${label}: Iceland access page returned ${accessResponse?.status()}.`);
    }
    await page.screenshot({
      path: `output/playwright/iceland26/${label}-access.png`,
      fullPage: false,
    });
    await page.locator('#trip-code').focus();
    const accessFocus = await page.locator('#trip-code').evaluate((input) => {
      const style = getComputedStyle(input);
      return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
    });
    if (accessFocus.outlineStyle === 'none' || accessFocus.outlineWidth === '0px') {
      fail(`${label}: trip-code input has no visible keyboard focus indicator.`);
    }
    await page.locator('#trip-code').fill(testAccessCode);
    await page.getByRole('button', { name: /Enter/ }).click();
    await page.waitForURL((url) => (
      url.origin === new URL(baseUrl).origin && /^\/iceland26\/?$/.test(url.pathname)
    ));
    const response = await page.reload({ waitUntil: 'networkidle' });
    if (response?.status() !== 200) fail(`${label}: authenticated Iceland page returned ${response?.status()}.`);
    if (!response?.headers()['x-robots-tag']?.includes('noindex')) {
      fail(`${label}: Iceland page is not marked noindex.`);
    }

    await page.locator('#sync-status').getByText(/Shared board live/).waitFor();
    await page.locator('#count-options').waitFor();
    const optionCount = Number(await page.locator('#count-options').textContent());
    if (!Number.isFinite(optionCount) || optionCount < 32) {
      fail(`${label}: route-wide option count is incomplete (${optionCount}).`);
    }
    await page.locator('.option-card').first().waitFor();

    const geometry = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      optionHeadings: document.querySelectorAll('.option-card h3').length,
      sourceTargets: [...document.querySelectorAll('.source-links a')].every((link) => (
        link.target === '_blank' && link.rel.includes('noopener')
      )),
      visibleText: document.body.innerText,
    }));
    if (geometry.scrollWidth > geometry.clientWidth + 2) {
      fail(`${label}: page has horizontal overflow (${geometry.scrollWidth}/${geometry.clientWidth}).`);
    }
    if (geometry.optionHeadings < 5) fail(`${label}: first route chapter is missing options.`);
    if (!geometry.sourceTargets) fail(`${label}: source links are not safely opened.`);
    if (/\b\d{3}-\d{3}-\d{5}-\d{6}\b/.test(geometry.visibleText)) {
      fail(`${label}: public UI leaks a campsite reservation identifier.`);
    }
    const voteAccessibility = await page.locator('.vote-avatar').evaluateAll((avatars) => (
      avatars.every((avatar) => (
        avatar.getAttribute('role') === 'listitem' && Boolean(avatar.getAttribute('aria-label'))
      ))
    ));
    if (!voteAccessibility) fail(`${label}: individual vote states lack accessible labels.`);

    const firstTab = page.locator('[role="tab"]').first();
    await firstTab.focus();
    await page.keyboard.press('ArrowRight');
    const secondTab = page.locator('[role="tab"]').nth(1);
    if (await secondTab.getAttribute('aria-selected') !== 'true'
        || await secondTab.getAttribute('tabindex') !== '0'
        || await page.locator('#route-panel').getAttribute('aria-labelledby')
          !== await secondTab.getAttribute('id')) {
      fail(`${label}: route tabs do not provide roving keyboard/tabpanel semantics.`);
    }
    await page.keyboard.press('ArrowLeft');
    await secondTab.click();
    if (await page.evaluate(() => document.activeElement?.dataset.legId) !== 'north') {
      fail(`${label}: clicking a route tab lost keyboard focus after the route rerender.`);
    }
    await firstTab.click();
    if (await page.evaluate(() => document.activeElement?.dataset.legId) !== 'westfjords') {
      fail(`${label}: returning to a route tab lost keyboard focus after the route rerender.`);
    }

    await page.screenshot({
      path: `output/playwright/iceland26/${label}-hero.png`,
      fullPage: false,
    });

    if (mutate) {
      await page.locator('#participant-select').selectOption('mary');
      const dynjandi = page.locator('.option-card', { hasText: 'Dynjandi' });
      let releaseStalePoll;
      let markStalePollCaptured;
      let markStalePollFinished;
      const stalePollCaptured = new Promise((resolve) => {
        markStalePollCaptured = resolve;
      });
      const stalePollRelease = new Promise((resolve) => {
        releaseStalePoll = resolve;
      });
      const stalePollFinished = new Promise((resolve) => {
        markStalePollFinished = resolve;
      });
      const stalePollHandler = async (route) => {
        const requestUrl = new URL(route.request().url());
        if (route.request().method() !== 'GET' || requestUrl.pathname !== '/api/iceland26') {
          await route.continue();
          return;
        }
        const upstream = await route.fetch();
        const body = await upstream.body();
        markStalePollCaptured();
        try {
          await stalePollRelease;
          await route.fulfill({ response: upstream, body });
        } finally {
          markStalePollFinished();
        }
      };
      await page.route('**/api/iceland26', stalePollHandler);
      try {
        await page.evaluate(() => {
          window.__iceland26StaleRefreshProcessed = new Promise((resolve) => {
            document.addEventListener('iceland26:state-refresh-complete', resolve, { once: true });
          });
        });
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        await stalePollCaptured;
        await dynjandi.getByRole('button', { name: /Love it/ }).click();
        await page.locator('#sync-status').getByText(/revision 1/).waitFor();
        releaseStalePoll();
        await stalePollFinished;
        await page.evaluate(async () => {
          await window.__iceland26StaleRefreshProcessed;
          delete window.__iceland26StaleRefreshProcessed;
        });
        if (!await page.locator('#sync-status').getByText(/revision 1/).count()
            || await dynjandi.getByRole('button', { name: /Love it/ }).getAttribute('aria-pressed')
              !== 'true') {
          fail('desktop: an older polling response regressed newer mutation state.');
        }
        const focusedPreference = await page.evaluate(() => ({
          action: document.activeElement?.dataset.action,
          optionId: document.activeElement?.dataset.optionId,
          preference: document.activeElement?.dataset.preference,
        }));
        if (focusedPreference.action !== 'preference'
            || focusedPreference.optionId !== 'dynjandi'
            || focusedPreference.preference !== 'love') {
          fail('desktop: a successful preference save lost keyboard focus.');
        }
      } finally {
        releaseStalePoll();
        await page.evaluate(() => {
          delete window.__iceland26StaleRefreshProcessed;
        });
        await page.unroute('**/api/iceland26', stalePollHandler);
      }

      await dynjandi.getByRole('button', { name: /Open discussion/ }).click();
      const dynjandiComment = dynjandi.getByLabel(/Comment on Dynjandi/);
      await dynjandiComment.fill('This feels like the Westfjords anchor.');
      await page.evaluate(async () => {
        const response = await fetch('/api/iceland26/preference', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            participant: 'ben',
            optionId: 'eclipse-patreksfjordur',
            preference: 'interested',
          }),
        });
        if (!response.ok) throw new Error(`Background preference failed: ${response.status}`);
      });
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await page.locator('#sync-status').getByText(/revision 2/).waitFor();
      if (await dynjandiComment.inputValue() !== 'This feels like the Westfjords anchor.') {
        fail('desktop: a background group refresh erased the in-progress comment draft.');
      }
      await dynjandi.getByRole('button', { name: 'Post' }).click();
      await dynjandi.getByText('This feels like the Westfjords anchor.').waitFor();

      await page.getByRole('button', { name: '★ Standouts' }).click();
      await page.locator('#open-idea-dialog').click();
      await page.locator('#idea-form [name="title"]').fill('A bakery morning');
      await page.locator('#idea-form [name="location"]').fill('Reykjavík');
      await page.locator('#idea-form [name="details"]').fill('Leave room for a slow local breakfast before the flight.');
      await page.locator('#idea-form').getByRole('button', { name: 'Add to the board' }).click();
      await page.getByRole('tab', { name: /Ideas from the group/ }).waitFor();
      await page.getByRole('heading', { name: 'A bakery morning' }).waitFor();
      if (await page.getByRole('button', { name: 'All', exact: true }).getAttribute('aria-pressed')
          !== 'true') {
        fail('desktop: adding an idea under a restrictive filter hid the new shared idea.');
      }

      const state = await page.evaluate(async () => (await fetch('/api/iceland26')).json());
      if (state.revision !== 4
          || state.preferences?.dynjandi?.mary !== 'love'
          || state.preferences?.['eclipse-patreksfjordur']?.ben !== 'interested'
          || state.comments?.[0]?.text !== 'This feels like the Westfjords anchor.'
          || state.suggestions?.[0]?.title !== 'A bakery morning') {
        fail(`desktop: live UI mutations were not persisted exactly: ${JSON.stringify({
          revision: state.revision,
          dynjandi: state.preferences?.dynjandi,
          comments: state.comments,
          suggestions: state.suggestions,
        })}`);
      }

      await page.getByRole('heading', { name: 'A bakery morning' }).scrollIntoViewIfNeeded();
      await page.screenshot({
        path: 'output/playwright/iceland26/desktop-shared-idea.png',
        fullPage: false,
      });

      await page.evaluate(async () => {
        const votes = [
          ['ben', 'love'],
          ['mary', 'love'],
          ['laura', 'interested'],
          ['brad', 'pass'],
        ];
        const responses = await Promise.all(votes.map(([participant, preference]) => (
          fetch('/api/iceland26/preference', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              participant,
              optionId: 'latrabjarg-raudasandur',
              preference,
            }),
          })
        )));
        if (responses.some((response) => !response.ok)) {
          throw new Error('Split-consensus background preferences failed.');
        }
      });
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await page.locator('#sync-status').getByText(/revision 8/).waitFor();
      await page.locator('[role="tab"][data-leg-id="westfjords"]').click();
      const latrabjarg = page.locator('.option-card', { hasText: 'Látrabjarg' });
      await latrabjarg.getByText('Worth a conversation · preferences differ').waitFor();
      if (await latrabjarg.getByText('Promising · one voice left').count()) {
        fail('desktop: three positive votes plus one pass was mislabeled as one undecided voice.');
      }
    } else {
      const standoutFilter = page.getByRole('button', { name: '★ Standouts' });
      await standoutFilter.click();
      if (await standoutFilter.getAttribute('aria-pressed') !== 'true'
          || await page.getByRole('button', { name: 'All', exact: true }).getAttribute('aria-pressed')
            !== 'false') {
        fail('mobile: selected experience filter is not exposed to assistive technology.');
      }
      const visibleCards = page.locator('.option-card');
      const count = await visibleCards.count();
      for (let index = 0; index < count; index += 1) {
        if (!await visibleCards.nth(index).getByText('★ Research standout').count()) {
          fail(`${label}: standout filter left a non-standout card visible.`);
        }
      }
      await visibleCards.first().scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, -130));
      await page.screenshot({
        path: 'output/playwright/iceland26/mobile-route.png',
        fullPage: false,
      });

      const lockButton = page.locator('#logout-button');
      if (!await lockButton.isVisible()) fail('mobile: Lock control is not available.');
      expectedLogoutFailure = true;
      await page.route('**/api/iceland26/logout', (route) => route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"error":"simulated failure"}',
      }));
      await lockButton.click();
      await page.locator('#toast').getByText(/still signed in/).waitFor();
      if (page.url().includes('/access.html')) {
        fail('mobile: failed logout presented a false locked state.');
      }
      await page.unroute('**/api/iceland26/logout');
      expectedLogoutFailure = false;
      await lockButton.click();
      await page.waitForURL(/\/iceland26\/access\.html$/);
      if (await page.evaluate(() => localStorage.getItem('iceland26-participant')) !== null) {
        fail('mobile: successful logout retained the remembered participant identity.');
      }
    }

    if (errors.length) fail(`${label}: browser errors: ${errors.join(' | ')}`);
  } finally {
    await page.close();
  }
}

try {
  if (!executablePath) throw new Error('Chrome or Chromium is required for Iceland interaction tests.');
  temporaryDirectory = mkdtempSync(join(tmpdir(), 'carboncaste-iceland26-ui-'));
  statePath = join(temporaryDirectory, 'state.json');
  await startServer();
  browserLaunchPromise = chromium.launchServer({
    headless: true,
    executablePath,
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
  });
  browserServer = await browserLaunchPromise;
  browserLaunchPromise = null;
  if (requestedSignalCode !== null) await exitAfterCleanup(requestedSignalCode);
  browser = await chromium.connect(browserServer.wsEndpoint());
  await runViewport({ width: 1440, height: 900 }, 'desktop', true);
  await runViewport({ width: 390, height: 844 }, 'mobile', false);
} catch (error) {
  fail(`${error.message}${serverProcess?.testOutput?.() ? `\n${serverProcess.testOutput()}` : ''}`);
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

console.log('Iceland coordination UI passed desktop/mobile rendering, source, privacy, sync, discussion, suggestion, and persistence checks.');
