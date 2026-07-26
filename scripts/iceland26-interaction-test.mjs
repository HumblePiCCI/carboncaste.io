import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const port = Number(process.env.ICELAND26_INTERACTION_PORT || 18127);
const baseUrl = `http://127.0.0.1:${port}`;
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'carboncaste-iceland26-ui-'));
const statePath = join(temporaryDirectory, 'state.json');
const testAccessCode = 'test-only-iceland-code';
const testAccessHash = createHash('sha256').update(testAccessCode).digest('hex');
const chromePaths = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];
const executablePath = chromePaths.find(existsSync);
if (!executablePath) throw new Error('Chrome or Chromium is required for Iceland interaction tests.');

mkdirSync('output/playwright/iceland26', { recursive: true });
const failures = [];
let serverProcess = null;
let browser = null;

function fail(message) {
  failures.push(message);
}

async function startServer() {
  const child = spawn(process.execPath, ['server/static-server.mjs'], {
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
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  child.testOutput = () => output;

  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Server exited with ${child.exitCode}.\n${output}`);
    try {
      if ((await fetch(`${baseUrl}/`)).ok) return child;
    } catch {
      // Listener is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(`Timed out waiting for server.\n${output}`);
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((_, reject) => setTimeout(() => reject(new Error('UI test server did not stop.')), 3_000)),
  ]);
}

async function runViewport(viewport, label, mutate = false) {
  const page = await browser.newPage({
    viewport,
    hasTouch: label === 'mobile',
  });
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
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

    await page.screenshot({
      path: `output/playwright/iceland26/${label}-hero.png`,
      fullPage: false,
    });

    if (mutate) {
      await page.locator('#participant-select').selectOption('mary');
      const dynjandi = page.locator('.option-card', { hasText: 'Dynjandi' });
      await dynjandi.getByRole('button', { name: /Love it/ }).click();
      await page.locator('#sync-status').getByText(/revision 1/).waitFor();

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

      await page.locator('#open-idea-dialog').click();
      await page.locator('#idea-form [name="title"]').fill('A bakery morning');
      await page.locator('#idea-form [name="location"]').fill('Reykjavík');
      await page.locator('#idea-form [name="details"]').fill('Leave room for a slow local breakfast before the flight.');
      await page.locator('#idea-form').getByRole('button', { name: 'Add to the board' }).click();
      await page.getByRole('tab', { name: /Ideas from the group/ }).waitFor();
      await page.getByRole('heading', { name: 'A bakery morning' }).waitFor();

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
    } else {
      await page.getByRole('button', { name: '★ Standouts' }).click();
      const visibleCards = page.locator('.option-card');
      const count = await visibleCards.count();
      for (let index = 0; index < count; index += 1) {
        if (!await visibleCards.nth(index).getByText('★ Review standout').count()) {
          fail(`${label}: standout filter left a non-standout card visible.`);
        }
      }
      await visibleCards.first().scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, -130));
      await page.screenshot({
        path: 'output/playwright/iceland26/mobile-route.png',
        fullPage: false,
      });
    }

    if (errors.length) fail(`${label}: browser errors: ${errors.join(' | ')}`);
  } finally {
    await page.close();
  }
}

try {
  serverProcess = await startServer();
  browser = await chromium.launch({ headless: true, executablePath });
  await runViewport({ width: 1440, height: 900 }, 'desktop', true);
  await runViewport({ width: 390, height: 844 }, 'mobile', false);
} catch (error) {
  fail(`${error.message}${serverProcess?.testOutput?.() ? `\n${serverProcess.testOutput()}` : ''}`);
} finally {
  await browser?.close();
  try {
    await stopServer(serverProcess);
  } catch (error) {
    fail(error.message);
  }
  await rm(temporaryDirectory, { recursive: true, force: true });
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Iceland coordination UI passed desktop/mobile rendering, source, privacy, sync, discussion, suggestion, and persistence checks.');
