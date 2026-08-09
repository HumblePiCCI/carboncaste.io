import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const port = Number(process.env.ICELAND26_INTERACTION_PORT || 18127);
const baseUrl = `http://127.0.0.1:${port}`;
const testAccessCode = 'test-only-iceland-code';
const testAccessHash = createHash('sha256').update(testAccessCode).digest('hex');
const testInstanceNonce = randomUUID();
const screenshotDirectory = 'output/playwright/iceland26';
const chromePaths = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];
const executablePath = chromePaths.find(existsSync);
const privateLeakPatterns = [
  /\b\d{3}-\d{3}-\d{5}-\d{6}\b/,
  /drive\.google\.com/i,
  /docs\.google\.com/i,
  /\b(?:reservation|confirmation)\s+(?:id\b|number\b|#)\s*[:#]?\s*[A-Z0-9][A-Z0-9-]{5,}\b/i,
];

// Never mix this run's QA evidence with screenshots from an older planner.
rmSync(screenshotDirectory, { recursive: true, force: true });
mkdirSync(screenshotDirectory, { recursive: true });

const failures = [];
const ownedPages = new Set();
const ownedContexts = new Set();
const ownedProcesses = new Map();
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

function recordProcess(child, label) {
  if (child?.pid) ownedProcesses.set(child.pid, { child, label });
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

async function waitForExit(child, timeout) {
  if (!child || child.exitCode !== null || !processIsAlive(child.pid)) return true;
  return new Promise((resolve) => {
    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      child.removeListener('exit', onExit);
      resolve(!processIsAlive(child.pid));
    }, timeout);
    child.once('exit', onExit);
  });
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
  recordProcess(serverProcess, 'Iceland interaction server');
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
      // The task-owned listener is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(`Timed out waiting for server.\n${output}`);
}

async function stopServer(child) {
  if (!child || child.exitCode !== null || !processIsAlive(child.pid)) return;
  child.kill('SIGTERM');
  if (await waitForExit(child, 3_000)) return;
  child.kill('SIGKILL');
  if (!await waitForExit(child, 3_000)) {
    throw new Error(`UI test server process ${child.pid} survived SIGTERM and SIGKILL.`);
  }
}

async function stopBrowserServer(server) {
  if (!server) return;
  const child = server.process();
  const closed = await settleWithin(server.close(), 3_000);
  if (!closed && processIsAlive(child?.pid)) await server.kill();
  if (child && !await waitForExit(child, 3_000)) {
    await server.kill();
    if (!await waitForExit(child, 3_000)) {
      throw new Error(`UI test browser process ${child.pid} survived close and kill.`);
    }
  }
}

async function taskListenerIsAlive() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 250);
  try {
    const response = await fetch(`${baseUrl}/api/iceland26/health`, { signal: controller.signal });
    const health = await response.json();
    return response.ok && health.instance === testInstanceNonce;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function verifyOwnedResourcesReleased() {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const survivingProcess = [...ownedProcesses.entries()]
      .find(([pid]) => processIsAlive(pid));
    if (!survivingProcess && !await taskListenerIsAlive()) break;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }

  const survivors = [...ownedProcesses.entries()]
    .filter(([pid]) => processIsAlive(pid))
    .map(([pid, record]) => `${record.label} pid ${pid}`);
  if (survivors.length) {
    throw new Error(`Task-owned processes survived teardown: ${survivors.join(', ')}.`);
  }
  if (await taskListenerIsAlive()) {
    throw new Error(`Task-owned listener survived teardown on 127.0.0.1:${port}.`);
  }
  if (ownedPages.size || ownedContexts.size) {
    throw new Error(`Task-owned browser resources survived teardown (${ownedPages.size} pages, ${ownedContexts.size} contexts).`);
  }
}

async function cleanupResources() {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    const pages = [...ownedPages];
    const contexts = [...ownedContexts];
    const ownedBrowser = browser;
    const ownedBrowserServer = browserServer;
    const ownedServer = serverProcess;
    browser = null;
    browserServer = null;
    serverProcess = null;
    const cleanupErrors = [];

    for (const page of pages) {
      try {
        await settleWithin(page.close({ runBeforeUnload: false }), 2_000);
      } catch (error) {
        cleanupErrors.push(error);
      } finally {
        ownedPages.delete(page);
      }
    }
    for (const context of contexts) {
      try {
        await settleWithin(context.close(), 2_000);
      } catch (error) {
        cleanupErrors.push(error);
      } finally {
        ownedContexts.delete(context);
      }
    }
    try {
      if (ownedBrowser) await settleWithin(ownedBrowser.close(), 3_000);
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      await stopBrowserServer(ownedBrowserServer);
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      await stopServer(ownedServer);
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      await verifyOwnedResourcesReleased();
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (temporaryDirectory) {
      const directory = temporaryDirectory;
      try {
        await rm(directory, { recursive: true, force: true });
        if (existsSync(directory)) throw new Error(`Temporary test directory survived teardown: ${directory}`);
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
        recordProcess(browserServer.process(), 'Iceland interaction browser');
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

async function responseHeaders(response) {
  return response ? await response.headers() : {};
}

function assertNoPrivateLeak(text, label) {
  const match = privateLeakPatterns.find((pattern) => pattern.test(text));
  if (match) fail(`${label}: shared trip content contains private reservation material matching ${match}.`);
  if (/\b(?:anxiety|anxious|overwhelmed)\b/i.test(text)) {
    fail(`${label}: interface copy exposes the private emotional context that must stay out of the planner.`);
  }
}

async function assertLockedAsset(context, path, label) {
  const response = await context.request.get(`${baseUrl}${path}`, { maxRedirects: 0 });
  const headers = await responseHeaders(response);
  if (response.status() !== 302
      || !headers.location?.startsWith('/iceland26/access.html')) {
    fail(`${label}: private asset was not redirected to the trip-code gate (${response.status()}).`);
  }
}

async function assertPrivateAsset(context, path, label, inspectText = false) {
  const response = await context.request.get(`${baseUrl}${path}`);
  const headers = await responseHeaders(response);
  if (response.status() !== 200
      || headers['cache-control'] !== 'private, no-store'
      || !headers.vary?.toLowerCase().includes('cookie')
      || !headers['x-robots-tag']?.includes('noindex')) {
    fail(`${label}: authenticated private asset lacks status/cache/vary/noindex protection.`);
  }
  const text = await response.text();
  if (inspectText) assertNoPrivateLeak(text, label);
  return text;
}

async function waitForStateRefresh(page) {
  await page.evaluate(() => new Promise((resolve) => {
    document.addEventListener('iceland26:state-refresh-complete', resolve, { once: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }));
}

async function assertExternalLinkSafety(page, label) {
  const unsafe = await page.locator('a[href^="http://"], a[href^="https://"]').evaluateAll((links) => (
    links.filter((link) => (
      link.target !== '_blank'
      || !link.relList.contains('noopener')
      || !link.relList.contains('noreferrer')
    )).map((link) => link.href)
  ));
  if (unsafe.length) fail(`${label}: external links are missing safe target/rel behavior: ${unsafe.join(', ')}`);
}

async function assertNoHorizontalOverflow(page, label) {
  const geometry = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
  if (geometry.scrollWidth > geometry.clientWidth + 2
      || geometry.bodyScrollWidth > geometry.clientWidth + 2) {
    fail(`${label}: page has horizontal overflow (${JSON.stringify(geometry)}).`);
  }
}

async function login(page, context, label) {
  const accessResponse = await page.goto(`${baseUrl}/iceland26/`, { waitUntil: 'networkidle' });
  if (!page.url().includes('/iceland26/access.html')) {
    fail(`${label}: protected trip route did not redirect to the access page.`);
  }
  if (accessResponse?.status() !== 200) {
    fail(`${label}: Iceland access page returned ${accessResponse?.status()}.`);
  }
  const accessHeaders = await responseHeaders(accessResponse);
  if (!accessHeaders['x-robots-tag']?.includes('noindex')) {
    fail(`${label}: access page is not marked noindex.`);
  }
  await assertLockedAsset(context, '/iceland26/itinerary.json', `${label} itinerary gate`);
  await assertLockedAsset(context, '/iceland26/map-data.json', `${label} map gate`);
  await assertLockedAsset(context, '/iceland26/bonus-stores.json', `${label} Bónus census gate`);

  const codeInput = page.locator('#trip-code');
  await page.screenshot({ path: join(screenshotDirectory, `${label}-access.png`) });
  await codeInput.focus();
  const accessFocus = await codeInput.evaluate((input) => {
    const style = getComputedStyle(input);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  if (accessFocus.outlineStyle === 'none' || accessFocus.outlineWidth === '0px') {
    fail(`${label}: trip-code input has no visible keyboard focus indicator.`);
  }
  await codeInput.fill(testAccessCode);
  await page.getByRole('button', { name: /Enter/ }).click();
  await page.waitForURL((url) => (
    url.origin === new URL(baseUrl).origin && /^\/iceland26\/?$/.test(url.pathname)
  ));
  await page.waitForLoadState('networkidle');

  const response = await page.reload({ waitUntil: 'networkidle' });
  const mainHeaders = await responseHeaders(response);
  if (response?.status() !== 200) fail(`${label}: authenticated Iceland page returned ${response?.status()}.`);
  if (!mainHeaders['x-robots-tag']?.includes('noindex')
      || mainHeaders['cache-control'] !== 'private, no-store'
      || !mainHeaders.vary?.toLowerCase().includes('cookie')) {
    fail(`${label}: authenticated planner lacks private noindex/cache/vary headers.`);
  }

  const itineraryText = await assertPrivateAsset(
    context,
    '/iceland26/itinerary.json',
    `${label} itinerary`,
    true,
  );
  const mapText = await assertPrivateAsset(context, '/iceland26/map-data.json', `${label} map`);
  const bonusText = await assertPrivateAsset(
    context,
    '/iceland26/bonus-stores.json',
    `${label} Bónus census`,
  );
  try {
    const itinerary = JSON.parse(itineraryText);
    const map = JSON.parse(mapText);
    const bonus = JSON.parse(bonusText);
    if (itinerary.days?.length !== 17) fail(`${label}: private itinerary does not contain exactly 17 dated days.`);
    if ((map.routes?.length || 0) < 12) fail(`${label}: private route snapshot contains fewer than 12 route paths.`);
    if (bonus.stores?.length !== 33 || bonus.stores.filter((store) => store.included).length !== 30) {
      fail(`${label}: private Bónus census is incomplete.`);
    }
  } catch (error) {
    fail(`${label}: private trip assets are not valid JSON (${error.message}).`);
  }

  await page.locator('#sync-status').getByText(/Shared board live/).waitFor();
  await page.locator('.map-marker').first().waitFor();
  await page.screenshot({ path: join(screenshotDirectory, `${label}-hero.png`) });
}

async function assertBoardStructure(page, label) {
  const countDays = Number(await page.locator('#count-days').textContent());
  const countOptions = Number(await page.locator('#count-options').textContent());
  if (countDays !== 17) fail(`${label}: summary reports ${countDays} days instead of 17.`);
  if (!Number.isFinite(countOptions) || countOptions < 44) {
    fail(`${label}: mapped place count is incomplete (${countOptions}).`);
  }

  const structure = await page.evaluate(() => ({
    coastlinePaths: [...document.querySelectorAll('.map-land')]
      .filter((path) => Boolean(path.getAttribute('d'))).length,
    routePaths: [...document.querySelectorAll('.route-path')]
      .filter((path) => Boolean(path.getAttribute('d'))).length,
    markerCount: document.querySelectorAll('.map-marker').length,
    accessibleMarkerCount: document.querySelectorAll(
      '.map-marker[role="button"][tabindex="0"][aria-hidden="false"][aria-label]',
    ).length,
    mapRole: document.querySelector('#route-map-svg')?.getAttribute('role'),
    camperCount: document.querySelectorAll('.camper[role="img"][aria-label]').length,
    dateCount: document.querySelectorAll('#date-track button[data-day-index]').length,
    tabbableDateCount: document.querySelectorAll('#date-track button[data-day-index][tabindex="0"]').length,
    range: {
      min: document.querySelector('#day-scrubber')?.min,
      max: document.querySelector('#day-scrubber')?.max,
      step: document.querySelector('#day-scrubber')?.step,
    },
    firstDate: document.querySelector('#date-track button')?.getAttribute('aria-label'),
    lastDate: document.querySelector('#date-track li:last-child button')?.getAttribute('aria-label'),
    visibleText: document.body.innerText,
  }));
  if (structure.coastlinePaths < 1) fail(`${label}: Iceland coastline path is missing.`);
  if (structure.routePaths < 12) fail(`${label}: only ${structure.routePaths} route paths were rendered.`);
  if (structure.markerCount < 44 || structure.accessibleMarkerCount < 44) {
    fail(`${label}: map markers are incomplete or not keyboard accessible (${JSON.stringify({
      total: structure.markerCount,
      accessible: structure.accessibleMarkerCount,
    })}).`);
  }
  if (structure.mapRole !== 'group'
      || await page.locator('#route-map-svg').getByRole('button').count() < 44) {
    fail(`${label}: interactive map markers are hidden from the browser accessibility tree.`);
  }
  if (structure.camperCount !== 2) fail(`${label}: expected two accessible camper groups, found ${structure.camperCount}.`);
  if (structure.dateCount !== 17
      || structure.tabbableDateCount !== 1
      || structure.range.min !== '0'
      || structure.range.max !== '16'
      || structure.range.step !== '1'
      || !/Aug(?:ust)? 8/i.test(structure.firstDate || '')
      || !/Aug(?:ust)? 24/i.test(structure.lastDate || '')) {
    fail(`${label}: dated timeline/range is incomplete (${JSON.stringify(structure.range)}; ${structure.dateCount} dates).`);
  }
  assertNoPrivateLeak(structure.visibleText, `${label} visible UI`);
  await assertNoHorizontalOverflow(page, label);
  await assertExternalLinkSafety(page, label);
}

async function assertBonusLayer(page, label) {
  const toggle = page.locator('#bonus-layer-toggle');
  const stores = page.locator('.map-marker--bonus');
  if (await toggle.getAttribute('aria-pressed') !== 'true'
      || await stores.count() !== 30
      || await page.locator('.map-marker--bonus[aria-hidden="false"][tabindex="0"]').count() !== 30) {
    fail(`${label}: the default-enabled Bónus layer does not expose exactly 30 accessible stores.`);
  }
  if (label === 'mobile' && (await toggle.boundingBox())?.height < 44) {
    fail('mobile: the Bónus layer toggle is smaller than the 44px touch-target floor.');
  }

  await toggle.click();
  if (await toggle.getAttribute('aria-pressed') !== 'false'
      || await page.locator('.map-marker--bonus[aria-hidden="true"][tabindex="-1"]').count() !== 30) {
    fail(`${label}: the Bónus layer toggle did not remove every store from interaction.`);
  }
  await toggle.click();

  await activateMarker(page, 'bonus-digranesgata');
  const panel = page.locator('#place-panel');
  const text = await panel.innerText();
  const detailChecks = {
    name: text.includes('Bónus Digranesgata'),
    address: text.toLocaleLowerCase().includes('digranesgata, 310 borgarnesi'),
    coordinates: text.includes('64.541141, -21.909299'),
    segment: text.includes('Aug 9 · explicit Borgarnes provisioning town'),
    official: Boolean(await panel.getByRole('link', { name: /Official Bónus locator/i }).count()),
    directions: Boolean(await panel.getByRole('link', { name: /Directions to Bónus Digranesgata/i }).count()),
  };
  if (Object.values(detailChecks).some((value) => !value)) {
    fail(`${label}: Bónus details omit identity, address, coordinates, route fit, or source links (${JSON.stringify(detailChecks)}; ${JSON.stringify(text)}).`);
  }
  if (await page.locator('#selected-place-voting button[data-action="preference"]').count()
      || await page.locator('#selected-place-comments form').count()
      || !await page.locator('#selected-place-voting').getByText(/never write to shared trip state/i).count()) {
    fail(`${label}: a grocery reference exposed traveler-owned voting or comment writes.`);
  }

  const first = page.locator('.map-marker[data-option-id="bonus-kauptun"] .map-marker__store');
  const second = page.locator('.map-marker[data-option-id="bonus-midhraun"] .map-marker__store');
  await first.scrollIntoViewIfNeeded();
  await page.waitForTimeout(120);
  const [firstBox, secondBox] = await Promise.all([first.boundingBox(), second.boundingBox()]);
  if (!firstBox || !secondBox) {
    fail(`${label}: overlapping Garðabær grocery markers are not rendered.`);
  } else {
    const x = ((firstBox.x + (firstBox.width / 2)) + (secondBox.x + (secondBox.width / 2))) / 2;
    const y = ((firstBox.y + (firstBox.height / 2)) + (secondBox.y + (secondBox.height / 2))) / 2;
    if (label === 'mobile') await page.touchscreen.tap(x, y);
    else await page.mouse.click(x, y);
    const chooser = page.locator('.map-choice-menu');
    await chooser.waitFor();
    if (!await chooser.getByRole('button', { name: /Bónus Kauptún/i }).count()
        || !await chooser.getByRole('button', { name: /Bónus Miðhraun/i }).count()) {
      fail(`${label}: overlapping metro stores are not independently reachable in the chooser.`);
    }
    await page.keyboard.press('Escape');
  }

  await activateMarker(page, 'bonus-midhraun');
  if (!await panel.getByRole('heading', { name: 'Bónus Miðhraun' }).count()) {
    fail(`${label}: keyboard selection cannot independently reach a clustered Bónus store.`);
  }
  await assertNoHorizontalOverflow(page, `${label} Bónus details`);
  await assertExternalLinkSafety(page, `${label} Bónus details`);
}

async function assertAllCamperDayEndpoints(page, label, scrubber) {
  const expectedDays = await page.evaluate(async () => {
    const [mapResponse, itineraryResponse] = await Promise.all([
      fetch('/iceland26/map-data.json'),
      fetch('/iceland26/itinerary.json'),
    ]);
    if (!mapResponse.ok || !itineraryResponse.ok) {
      throw new Error(`route fixtures unavailable (${mapResponse.status}/${itineraryResponse.status})`);
    }
    const [mapSnapshot, itinerarySnapshot] = await Promise.all([
      mapResponse.json(),
      itineraryResponse.json(),
    ]);
    const { bounds } = mapSnapshot;
    const project = ([lng, lat]) => ({
      x: 55 + (((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 890),
      y: 45 + (((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * 610),
    });
    const projected = [];
    const endpointByDay = new Map();
    mapSnapshot.routes.filter((route) => route.state !== 'branch').forEach((route) => {
      route.points.forEach((coordinate) => {
        const point = project(coordinate);
        const previous = projected[projected.length - 1];
        if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) > 0.5) {
          projected.push(point);
        }
      });
      route.dayIds.forEach((dayId) => endpointByDay.set(dayId, projected[projected.length - 1]));
    });
    return itinerarySnapshot.days.map((day, index) => ({
      id: day.id,
      index,
      endpoint: index === 0 ? projected[0] : endpointByDay.get(day.id),
    }));
  });

  for (const day of expectedDays) {
    if (!day.endpoint) {
      fail(`${label}: ${day.id} has no independently derived map endpoint.`);
      continue;
    }
    await scrubber.evaluate((input, index) => {
      input.value = String(index);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, day.index);
    await page.waitForFunction((index) => (
      document.querySelector(`#date-track button[data-day-index="${index}"]`)
        ?.getAttribute('aria-current') === 'date'
    ), day.index);
    const midpoint = await page.locator('.camper').evaluateAll((campers) => {
      const points = campers.map((camper) => {
        const matrix = camper.transform.baseVal.consolidate()?.matrix;
        return matrix ? { x: matrix.e, y: matrix.f } : null;
      });
      if (!points.every(Boolean)) return null;
      return {
        x: (points[0].x + points[1].x) / 2,
        y: (points[0].y + points[1].y) / 2,
      };
    });
    const error = midpoint
      ? Math.hypot(midpoint.x - day.endpoint.x, midpoint.y - day.endpoint.y)
      : Number.POSITIVE_INFINITY;
    if (error > 0.75) {
      fail(`${label}: ${day.id} campers miss the dated route endpoint by ${error.toFixed(3)} map units.`);
    }
  }
}

async function exerciseTimeline(page, label, captureMap = false) {
  const dateButtons = page.locator('#date-track button[data-day-index]');
  const firstDate = dateButtons.first();
  const secondDate = dateButtons.nth(1);
  const lastDate = dateButtons.last();

  await firstDate.focus();
  await page.keyboard.press('End');
  if (await lastDate.getAttribute('aria-current') !== 'date'
      || await page.evaluate(() => document.activeElement?.dataset.dayIndex) !== '16') {
    fail(`${label}: End did not move the timeline to/focus Aug 24.`);
  }
  await page.waitForTimeout(720);
  const finalCamperSeparation = await page.locator('.camper').evaluateAll((campers) => {
    const points = campers.map((camper) => {
      const matrix = camper.transform.baseVal.consolidate()?.matrix;
      return matrix ? { x: matrix.e, y: matrix.f } : null;
    });
    return points.every(Boolean) ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : null;
  });
  if (!Number.isFinite(finalCamperSeparation) || finalCamperSeparation > 15) {
    fail(`${label}: both campers did not reach the final route endpoint together (${finalCamperSeparation}).`);
  }
  await page.keyboard.press('Home');
  if (await firstDate.getAttribute('aria-current') !== 'date'
      || await page.evaluate(() => document.activeElement?.dataset.dayIndex) !== '0') {
    fail(`${label}: Home did not move the timeline to/focus Aug 8.`);
  }
  await page.keyboard.press('ArrowRight');
  if (await secondDate.getAttribute('aria-current') !== 'date'
      || await page.evaluate(() => document.activeElement?.dataset.dayIndex) !== '1') {
    fail(`${label}: ArrowRight did not provide roving date navigation.`);
  }
  const lockedHighlightPattern = await page.locator(
    '.route-day-highlight[data-route-state="locked"]',
  ).first().evaluate((path) => getComputedStyle(path).strokeDasharray);
  await firstDate.focus();
  await page.keyboard.press('Home');
  await page.waitForTimeout(720);
  const camperBefore = await page.locator('.camper').evaluateAll((campers) => (
    campers.map((camper) => camper.getAttribute('transform'))
  ));

  const scrubber = page.locator('#day-scrubber');
  await scrubber.evaluate((input) => {
    input.value = '11';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('#selected-day-date').getByText(/Aug 19/i).waitFor();
  const highlightStyles = await page.locator('.route-day-highlight').evaluateAll((paths) => (
    paths.map((path) => ({
      state: path.dataset.routeState,
      dash: getComputedStyle(path).strokeDasharray,
    }))
  ));
  const workingHighlight = highlightStyles.find((entry) => entry.state === 'working');
  const branchHighlight = highlightStyles.find((entry) => entry.state === 'branch');
  if (!workingHighlight || !branchHighlight
      || workingHighlight.dash === lockedHighlightPattern
      || branchHighlight.dash === workingHighlight.dash) {
    fail(`${label}: selected-day locked, working and branch routes are not visually distinct (${JSON.stringify({ lockedHighlightPattern, highlightStyles })}).`);
  }

  await scrubber.evaluate((input) => {
    input.value = '12';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('#selected-day-date').getByText(/Aug 20/i).waitFor();
  await page.locator('#order-check:not([hidden])').waitFor();
  await page.waitForFunction((before) => {
    const current = [...document.querySelectorAll('.camper')]
      .map((camper) => camper.getAttribute('transform'));
    return current.length === 2 && current.some((value, index) => value !== before[index]);
  }, camperBefore);
  await page.waitForTimeout(720);

  const timelineState = await page.evaluate(() => ({
    date: document.querySelector('#selected-day-date')?.textContent,
    title: document.querySelector('#day-rail-title')?.textContent,
    order: document.querySelector('#order-check')?.textContent,
    rangeValue: document.querySelector('#day-scrubber')?.value,
    rangeText: document.querySelector('#day-scrubber')?.getAttribute('aria-valuetext'),
    campers: [...document.querySelectorAll('.camper')]
      .map((camper) => camper.getAttribute('transform')),
  }));
  const order = timelineState.order || '';
  const geographicOrder = ['Gullfoss', 'Geysir', 'Þingvellir'].map((place) => order.indexOf(place));
  if (!/Aug 20/i.test(timelineState.date || '')
      || !/Golden Circle/i.test(`${timelineState.title} ${order}`)
      || geographicOrder.some((index) => index < 0)
      || !(geographicOrder[0] < geographicOrder[1] && geographicOrder[1] < geographicOrder[2])
      || timelineState.rangeValue !== '12'
      || !/Day 13 of 17/i.test(timelineState.rangeText || '')) {
    fail(`${label}: Aug 20 Golden Circle order check is missing or not in geographic order (${JSON.stringify(timelineState)}).`);
  }
  if (timelineState.campers.every((value, index) => value === camperBefore[index])) {
    fail(`${label}: moving the date scrubber did not move the two campers.`);
  }

  if (captureMap) {
    await page.locator('#close-place-panel').click();
    await page.locator('#place-panel.is-closed').waitFor({ state: 'hidden' });
    await page.waitForTimeout(220);
    await page.locator('.planner-shell').screenshot({
      path: join(screenshotDirectory, 'desktop-map.png'),
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await assertAllCamperDayEndpoints(page, label, scrubber);
    await scrubber.evaluate((input) => {
      input.value = '16';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const reducedImmediately = await page.locator('.camper').evaluateAll((campers) => (
      campers.map((camper) => camper.getAttribute('transform'))
    ));
    await page.waitForTimeout(80);
    const reducedAfter = await page.locator('.camper').evaluateAll((campers) => (
      campers.map((camper) => camper.getAttribute('transform'))
    ));
    if (JSON.stringify(reducedImmediately) !== JSON.stringify(reducedAfter)) {
      fail(`${label}: reduced-motion mode still animated the campers.`);
    }
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  }
}

async function exerciseMapControls(page, label) {
  const totalMarkers = await page.locator('.map-marker').count();
  for (const filter of ['locked', 'standout', 'open']) {
    const button = page.locator(`[data-map-filter="${filter}"]`);
    await button.click();
    const visible = await page.locator('.map-marker[aria-hidden="false"][tabindex="0"]').count();
    if (await button.getAttribute('aria-pressed') !== 'true'
        || visible < 1
        || visible >= totalMarkers
        || await page.locator('.map-marker[aria-hidden="true"]:not([tabindex="-1"])').count()) {
      fail(`${label}: ${filter} map filter does not expose a valid accessible subset (${visible}/${totalMarkers}).`);
    }
  }
  const all = page.locator('[data-map-filter="all"]');
  await all.click();
  if (await all.getAttribute('aria-pressed') !== 'true'
      || await page.locator('.map-marker[aria-hidden="false"][tabindex="0"]').count() !== totalMarkers) {
    fail(`${label}: All map filter did not restore every marker.`);
  }

  const viewport = page.locator('#map-viewport');
  await page.locator('#zoom-in').click();
  if (await viewport.evaluate((node) => node.style.transform) !== 'scale(1.2)'
      || await page.locator('#zoom-out').isDisabled()) {
    fail(`${label}: map zoom-in did not update the view and controls.`);
  }
  const reset = page.locator('#zoom-reset');
  if (await reset.isVisible()) await reset.click();
  else await page.locator('#zoom-out').click();
  if (await viewport.evaluate((node) => node.style.transform) !== 'scale(1)'
      || !await reset.isDisabled()) {
    fail(`${label}: map reset did not restore the canonical view.`);
  }
}

async function exercisePointerMarkerCollisions(page, label) {
  const collisionGroups = [
    ['outbound-flight', 'departure'],
    ['thingvellir', 'silfra-split'],
  ];
  const closePanel = async () => {
    if (await page.locator('#place-panel').getAttribute('aria-hidden') === 'false') {
      await page.locator('#close-place-panel').click();
      await page.locator('#place-panel.is-closed').waitFor({ state: 'hidden' });
    }
  };
  const activatePoint = async ({ x, y }) => {
    if (label === 'mobile') await page.touchscreen.tap(x, y);
    else await page.mouse.click(x, y);
  };
  const positionDotForPointer = async (dot) => {
    await dot.scrollIntoViewIfNeeded();
    await dot.evaluate((node) => {
      const root = document.documentElement;
      const previousScrollBehavior = root.style.scrollBehavior;
      root.style.scrollBehavior = 'auto';
      const box = node.getBoundingClientRect();
      const stickyBottom = Math.max(
        0,
        document.querySelector('.trip-header')?.getBoundingClientRect().bottom || 0,
        document.querySelector('.timeline-section')?.getBoundingClientRect().bottom || 0,
      );
      if (box.top < stickyBottom + 16) {
        window.scrollBy({ top: box.top - stickyBottom - 16, behavior: 'auto' });
      } else if (box.bottom > innerHeight - 16) {
        window.scrollBy({ top: box.bottom - innerHeight + 16, behavior: 'auto' });
      }
      root.style.scrollBehavior = previousScrollBehavior;
    });
  };

  for (const group of collisionGroups) {
    for (const optionId of group) {
      await closePanel();
      const anchorId = group[group.length - 1];
      const anchorDot = page.locator(
        `.map-marker[data-option-id="${anchorId}"] .map-marker__dot`,
      );
      await positionDotForPointer(anchorDot);
      const centre = await anchorDot.evaluate((dot) => {
        const box = dot.getBoundingClientRect();
        return { x: box.left + (box.width / 2), y: box.top + (box.height / 2) };
      });
      await activatePoint(centre);
      const chooser = page.locator('.map-choice-menu[role="dialog"]');
      try {
        await chooser.waitFor({ timeout: 3_000 });
      } catch {
        const diagnostic = await page.evaluate(({ x, y }) => ({
          hitStack: document.elementsFromPoint(x, y).slice(0, 8).map((node) => ({
            tag: node.tagName,
            className: typeof node.className === 'object' ? node.className.baseVal : node.className,
            optionId: node.closest?.('[data-option-id]')?.dataset.optionId || null,
          })),
          selectedTitle: document.querySelector('#place-title')?.textContent || null,
          selectedOpen: document.querySelector('#place-panel')?.getAttribute('aria-hidden'),
          mapFilter: document.querySelector('[data-map-filter][aria-pressed="true"]')?.dataset.mapFilter,
        }), centre);
        fail(`${label}: pointer at the ${group.join('/')} collision did not open the chooser (${JSON.stringify(diagnostic)}).`);
        continue;
      }
      if (label === 'desktop' && group[0] === 'outbound-flight' && optionId === 'outbound-flight') {
        await page.locator('.map-frame').screenshot({
          path: join(screenshotDirectory, 'desktop-map-chooser.png'),
        });
      }
      for (const expectedId of group) {
        if (await chooser.locator(`button[data-option-id="${expectedId}"]`).count() !== 1) {
          fail(`${label}: overlapping map chooser omitted ${expectedId}.`);
        }
      }
      await chooser.locator(`button[data-option-id="${optionId}"]`).click();
      await page.locator('#place-panel[aria-hidden="false"]').waitFor();
      if (await page.locator(
        `#selected-place-voting button[data-option-id="${optionId}"][data-action="preference"]`,
      ).count() !== 3) {
        fail(`${label}: pointer chooser did not activate the colliding option ${optionId}.`);
      }
    }
  }

  await closePanel();
  const escapeDot = page.locator(
    '.map-marker[data-option-id="departure"] .map-marker__dot',
  );
  await positionDotForPointer(escapeDot);
  const escapeCentre = await escapeDot.evaluate((dot) => {
    const box = dot.getBoundingClientRect();
    return { x: box.left + (box.width / 2), y: box.top + (box.height / 2) };
  });
  await activatePoint(escapeCentre);
  await page.locator('.map-choice-menu').waitFor();
  await page.keyboard.press('Escape');
  if (await page.locator('.map-choice-menu').count()
      || !await page.locator('.map-marker:focus').count()) {
    fail(`${label}: Escape did not close the overlapping-place chooser and restore map focus.`);
  }
}

async function activateMarker(page, optionId, key = 'Enter') {
  const marker = page.locator(`.map-marker[data-option-id="${optionId}"]`);
  await marker.focus();
  await marker.press(key);
  await page.locator('#place-panel[aria-hidden="false"]').waitFor();
  return marker;
}

async function assertReynisfjaraTruth(page, label) {
  await activateMarker(page, 'reynisfjara');
  const panel = page.locator('#place-panel');
  const panelText = await panel.innerText();
  if (!/viewpoint[\s\-–—‑]*only/i.test(panelText)) {
    fail(`${label}: Reynisfjara does not expose the current viewpoint-only access state.`);
  }
  const evidence = panel.locator('details', { hasText: /Evidence and source links/i });
  await evidence.locator('summary').click();
  const safeTravelSource = evidence.locator('a[href*="safetravel.is"]');
  if (!await safeTravelSource.count()) {
    fail(`${label}: Reynisfjara viewpoint-only guidance lacks its current SafeTravel source.`);
  }
  await assertExternalLinkSafety(page, `${label} Reynisfjara evidence`);
}

async function assertRailPlaceDetailAndMapStory(page, label) {
  await activateMarker(page, 'dynjandi');
  const panel = page.locator('#place-panel');
  const story = page.locator('#map-story-card');
  await panel.getByRole('heading', { name: /Dynjandi/i }).waitFor();
  await story.locator('img').waitFor();
  await page.waitForFunction(() => {
    const image = document.querySelector('#map-story-card img');
    return image?.complete && image.naturalWidth > 0;
  });
  const detailState = await page.evaluate(() => ({
    activeId: document.activeElement?.id,
    panelHidden: document.querySelector('#place-panel')?.getAttribute('aria-hidden'),
    panel: document.querySelector('#place-panel')?.getBoundingClientRect().toJSON(),
    map: document.querySelector('#map-frame')?.getBoundingClientRect().toJSON(),
    panelPosition: getComputedStyle(document.querySelector('#place-panel')).position,
    panelParent: document.querySelector('#place-panel')?.parentElement?.className,
    storyParent: document.querySelector('#map-story-card')?.parentElement?.id,
    storyHidden: document.querySelector('#map-story-card')?.getAttribute('aria-hidden'),
    storyInert: document.querySelector('#map-story-card')?.inert,
    storyOptionId: document.querySelector('#map-story-card')?.dataset.optionId,
    story: document.querySelector('#map-story-card')?.getBoundingClientRect().toJSON(),
    storyOpacity: getComputedStyle(document.querySelector('#map-story-card')).opacity,
    storyBackground: getComputedStyle(document.querySelector('#map-story-card')).backgroundColor,
    storyBackdrop: getComputedStyle(document.querySelector('#map-story-card')).backdropFilter,
    storyBackgroundAlpha: (() => {
      const value = getComputedStyle(document.querySelector('#map-story-card')).backgroundColor;
      const match = value.match(/rgba?\(([^)]+)\)/);
      if (!match) return null;
      const parts = match[1].split(',').map((part) => Number.parseFloat(part.trim()));
      return parts.length === 4 ? parts[3] : 1;
    })(),
    panelMapOverlap: (() => {
      const left = document.querySelector('#place-panel')?.getBoundingClientRect();
      const right = document.querySelector('#map-frame')?.getBoundingClientRect();
      if (!left || !right) return null;
      return Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left))
        * Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
    })(),
    storyFootprint: (() => {
      const card = document.querySelector('#map-story-card')?.getBoundingClientRect();
      const map = document.querySelector('#map-frame')?.getBoundingClientRect();
      return card && map ? (card.width * card.height) / (map.width * map.height) : null;
    })(),
    storyInsideMap: (() => {
      const card = document.querySelector('#map-story-card')?.getBoundingClientRect();
      const map = document.querySelector('#map-frame')?.getBoundingClientRect();
      return Boolean(card && map
        && card.left >= map.left - 1 && card.right <= map.right + 1
        && card.top >= map.top - 1 && card.bottom <= map.bottom + 1);
    })(),
    mapCenterIsClear: (() => {
      const map = document.querySelector('#map-frame')?.getBoundingClientRect();
      if (!map) return false;
      const stack = document.elementsFromPoint(map.left + (map.width / 2), map.top + (map.height / 2));
      return !stack.some((node) => node.closest?.('#place-panel, #map-story-card'));
    })(),
    panelCloseHit: (() => {
      const close = document.querySelector('#close-place-panel');
      const box = close?.getBoundingClientRect();
      if (!box) return null;
      return document.elementFromPoint(box.x + (box.width / 2), box.y + (box.height / 2))?.id;
    })(),
    storyCloseHit: (() => {
      const close = document.querySelector('#close-map-story');
      const box = close?.getBoundingClientRect();
      if (!box) return null;
      return document.elementFromPoint(box.x + (box.width / 2), box.y + (box.height / 2))?.id;
    })(),
    legacyStandoutInPanel: document.querySelectorAll('#place-panel .place-standout').length,
  }));
  if (detailState.activeId !== 'place-panel'
      || detailState.panelHidden !== 'false'
      || detailState.panelPosition === 'absolute'
      || detailState.panelParent !== 'planner-shell'
      || detailState.panelMapOverlap !== 0
      || detailState.panel.right > detailState.map.left + 1
      || detailState.panelCloseHit !== 'close-place-panel'
      || detailState.storyParent !== 'map-frame'
      || detailState.storyHidden !== 'false'
      || detailState.storyInert
      || detailState.storyOptionId !== 'dynjandi'
      || detailState.storyCloseHit !== 'close-map-story'
      || !detailState.storyInsideMap
      || !detailState.mapCenterIsClear
      || detailState.storyOpacity !== '1'
      || !Number.isFinite(detailState.storyBackgroundAlpha)
      || detailState.storyBackgroundAlpha < 0.55
      || detailState.storyBackgroundAlpha > 0.9
      || !detailState.storyBackdrop
      || detailState.storyBackdrop === 'none'
      || !Number.isFinite(detailState.storyFootprint)
      || detailState.storyFootprint > 0.15
      || detailState.legacyStandoutInPanel !== 0) {
    fail(`${label}: keyboard marker activation did not open a separate practical rail and compact translucent map story (${JSON.stringify(detailState)}).`);
  }

  for (const heading of [
    'At a glance',
    'Planning state',
    'Family fit',
    'Amenities',
    'Booking and contact',
    'Why it earns time',
    'What could break it',
  ]) {
    if (!await panel.getByRole('heading', { name: heading, exact: true }).count()) {
      fail(`${label}: Dynjandi practical rail is missing the ${heading} section.`);
    }
  }
  for (const metric of ['Time', 'Walk', 'Difficulty']) {
    if (!await panel.locator('.metric-grid').getByText(metric, { exact: true }).count()) {
      fail(`${label}: Dynjandi practical rail is missing the ${metric} metric.`);
    }
  }

  const mediaState = await story.locator('img').evaluate((image) => ({
    path: new URL(image.currentSrc || image.src).pathname,
    alt: image.alt,
    widthAttribute: image.getAttribute('width'),
    heightAttribute: image.getAttribute('height'),
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
    loading: image.loading,
    decoding: image.decoding,
    caption: image.closest('figure')?.querySelector('figcaption')?.textContent?.trim(),
  }));
  if (mediaState.path !== '/iceland26/media/dynjandi.webp'
      || mediaState.alt.length < 20
      || mediaState.widthAttribute !== '960'
      || mediaState.heightAttribute !== '600'
      || mediaState.naturalWidth !== 960
      || mediaState.naturalHeight !== 600
      || mediaState.loading !== 'lazy'
      || mediaState.decoding !== 'async'
      || mediaState.caption !== 'Image carried forward from the revised planning document · not a live conditions view.') {
    fail(`${label}: Dynjandi story does not expose the expected local planning-document image metadata (${JSON.stringify(mediaState)}).`);
  }
  const travellerSource = story.locator('a[data-source-type]');
  const sourceState = await travellerSource.count() === 1
    ? await travellerSource.evaluate((link) => ({
      type: link.dataset.sourceType,
      href: link.href,
      target: link.target,
      rel: link.rel,
    }))
    : null;
  if (!sourceState
      || !['reviews', 'travel post', 'traveller review', 'trip report', 'guide'].includes(sourceState.type)
      || !/^https:\/\//.test(sourceState.href)
      || sourceState.target !== '_blank'
      || !sourceState.rel.split(/\s+/).includes('noopener')
      || !sourceState.rel.split(/\s+/).includes('noreferrer')
      || !await story.locator('[data-review-signal]').count()) {
    fail(`${label}: Dynjandi story is missing its safe traveller signal/source (${JSON.stringify(sourceState)}).`);
  }

  const evidence = panel.locator('details', { hasText: /Evidence and source links/i });
  if (!await evidence.count()) fail(`${label}: Dynjandi detail has no expandable evidence section.`);
  else {
    await evidence.locator('summary').click();
    if (!await evidence.locator('a[href^="http"]').count()) {
      fail(`${label}: Dynjandi evidence dropdown contains no source links.`);
    }
  }
  await panel.evaluate((node) => { node.scrollTop = node.scrollHeight; });
  await activateMarker(page, 'reynisfjara');
  if (await panel.evaluate((node) => node.scrollTop) !== 0) {
    fail(`${label}: choosing another place retained the prior card's scroll position.`);
  }
  await activateMarker(page, 'dynjandi');
  await assertExternalLinkSafety(page, `${label} Dynjandi detail`);
  await page.locator('.planner-shell').screenshot({
    path: join(screenshotDirectory, 'desktop-place.png'),
  });

  const pointerCandidate = await page.evaluate((candidateIds) => {
    const storyBox = document.querySelector('#map-story-card')?.getBoundingClientRect();
    const touchTargets = [...document.querySelectorAll('.map-marker[aria-hidden="false"] .map-marker__touch')];
    const contains = (box, x, y) => Boolean(box
      && x >= box.left && x <= box.right && y >= box.top && y <= box.bottom);
    for (const optionId of candidateIds) {
      const marker = document.querySelector(`.map-marker[data-option-id="${optionId}"]`);
      const dot = marker?.querySelector('.map-marker__dot')?.getBoundingClientRect();
      if (!marker || !dot?.width || !dot?.height) continue;
      const x = dot.left + (dot.width / 2);
      const y = dot.top + (dot.height / 2);
      if (x < 1 || x >= innerWidth - 1 || y < 1 || y >= innerHeight - 1 || contains(storyBox, x, y)) continue;
      const collisions = touchTargets.filter((target) => {
        const box = target.getBoundingClientRect();
        const radiusX = box.width / 2;
        const radiusY = box.height / 2;
        if (!radiusX || !radiusY) return false;
        const deltaX = (x - (box.left + radiusX)) / radiusX;
        const deltaY = (y - (box.top + radiusY)) / radiusY;
        return (deltaX ** 2) + (deltaY ** 2) <= 1.01;
      });
      const hitOptionId = document.elementFromPoint(x, y)?.closest?.('.map-marker')?.dataset.optionId;
      if (collisions.length === 1 && hitOptionId === optionId) return { optionId, x, y };
    }
    return null;
  }, ['seydisfjordur', 'studlagil', 'skogafoss-waterfall-way', 'jokulsarlon-boat', 'raudasandur']);
  if (!pointerCandidate) {
    fail(`${label}: no unobscured, non-colliding reviewed marker was available for a real pointer-selection check.`);
  } else {
    await page.mouse.click(pointerCandidate.x, pointerCandidate.y);
    await page.locator(
      `#selected-place-voting button[data-option-id="${pointerCandidate.optionId}"][data-action="preference"]`,
    ).first().waitFor();
    await page.locator(`#map-story-card[data-option-id="${pointerCandidate.optionId}"][aria-hidden="false"]`).waitFor();
    if (/Dynjandi/i.test(await page.locator('#place-title').innerText())) {
      fail(`${label}: clicking the unobscured ${pointerCandidate.optionId} marker did not replace the Dynjandi selection.`);
    }
  }

  await activateMarker(page, 'outbound-flight');
  const noStoryState = await page.evaluate(() => {
    const card = document.querySelector('#map-story-card');
    return {
      hidden: card?.getAttribute('aria-hidden'),
      inert: card?.inert,
      classHidden: card?.classList.contains('is-hidden'),
      optionId: card?.dataset.optionId || null,
      childCount: document.querySelector('#map-story-content')?.childElementCount,
      panelHidden: document.querySelector('#place-panel')?.getAttribute('aria-hidden'),
    };
  });
  if (noStoryState.hidden !== 'true'
      || !noStoryState.inert
      || !noStoryState.classHidden
      || noStoryState.optionId !== null
      || noStoryState.childCount !== 0
      || noStoryState.panelHidden !== 'false') {
    fail(`${label}: a stop with no image/review left stale or focusable map-story content (${JSON.stringify(noStoryState)}).`);
  }

  await activateMarker(page, 'dynjandi');
  await page.locator('#close-map-story').focus();
  await page.keyboard.press('Escape');
  const firstEscapeState = await page.evaluate(() => ({
    storyHidden: document.querySelector('#map-story-card')?.getAttribute('aria-hidden'),
    storyInert: document.querySelector('#map-story-card')?.inert,
    panelHidden: document.querySelector('#place-panel')?.getAttribute('aria-hidden'),
    focusedOption: document.activeElement?.dataset.optionId,
  }));
  if (firstEscapeState.storyHidden !== 'true'
      || !firstEscapeState.storyInert
      || firstEscapeState.panelHidden !== 'false'
      || firstEscapeState.focusedOption !== 'dynjandi') {
    fail(`${label}: Escape from inside the map story did not close only that card and restore selected-place focus (${JSON.stringify(firstEscapeState)}).`);
  }
  await activateMarker(page, 'dynjandi');
  await page.keyboard.press('Escape');
  const panelEscapeState = await page.evaluate(() => ({
    storyHidden: document.querySelector('#map-story-card')?.getAttribute('aria-hidden'),
    panelHidden: document.querySelector('#place-panel')?.getAttribute('aria-hidden'),
    focusedOption: document.activeElement?.dataset.optionId,
  }));
  if (panelEscapeState.storyHidden !== 'true'
      || panelEscapeState.panelHidden !== 'true'
      || panelEscapeState.focusedOption !== 'dynjandi') {
    fail(`${label}: Escape from the practical rail did not collapse both surfaces and retain selected-place focus (${JSON.stringify(panelEscapeState)}).`);
  }

  await activateMarker(page, 'dynjandi');
  await page.locator('#close-map-story').click();
  const storyCloseState = await page.evaluate(() => ({
    storyHidden: document.querySelector('#map-story-card')?.getAttribute('aria-hidden'),
    panelHidden: document.querySelector('#place-panel')?.getAttribute('aria-hidden'),
    focusedOption: document.activeElement?.dataset.optionId,
  }));
  if (storyCloseState.storyHidden !== 'true'
      || storyCloseState.panelHidden !== 'false'
      || storyCloseState.focusedOption !== 'dynjandi') {
    fail(`${label}: map-story close did not leave the practical rail open and restore selected-place focus (${JSON.stringify(storyCloseState)}).`);
  }
  await activateMarker(page, 'dynjandi');
  await page.locator('#close-place-panel').click();
  const railCloseState = await page.evaluate(() => ({
    storyHidden: document.querySelector('#map-story-card')?.getAttribute('aria-hidden'),
    panelHidden: document.querySelector('#place-panel')?.getAttribute('aria-hidden'),
    focusedOption: document.activeElement?.dataset.optionId,
  }));
  if (railCloseState.storyHidden !== 'true'
      || railCloseState.panelHidden !== 'true'
      || railCloseState.focusedOption !== 'dynjandi') {
    fail(`${label}: practical-rail close did not close both surfaces and restore selected-place focus (${JSON.stringify(railCloseState)}).`);
  }
  await activateMarker(page, 'dynjandi');
}

async function assertSourceChoiceIndependence(page, label) {
  const independentIds = [
    'asbyrgi',
    'husavik-whale-watching',
    'dalfjall-hike',
    'herjolfsdalur-camping',
    'hverir-hverfjall',
    'hverfjall',
    'djupivogur-stokksnes',
    'djupivogur',
    'golden-circle-core',
    'gullfoss',
    'thingvellir',
  ];
  for (const optionId of independentIds) {
    await activateMarker(page, optionId);
    const preferenceTargets = page.locator(
      `#selected-place-voting button[data-option-id="${optionId}"][data-action="preference"]`,
    );
    const preferenceGroup = page.locator(
      `#selected-place-voting .preference-grid[data-option-id="${optionId}"][role="group"][aria-labelledby]`,
    );
    const commentForm = page.locator(
      `#selected-place-comments form[data-comment-form][data-option-id="${optionId}"]`,
    );
    const groupLabelId = await preferenceGroup.getAttribute('aria-labelledby');
    if (await preferenceTargets.count() !== 3
        || await preferenceGroup.count() !== 1
        || !groupLabelId
        || await page.locator(`#${groupLabelId}`).count() !== 1
        || await commentForm.count() !== 1) {
      fail(`${label}: ${optionId} is not an independent ranking and sticky-note target.`);
    }
  }

  await activateMarker(page, 'jokulsarlon-boat');
  const exactLagoonFaq = page.locator(
    '#place-panel a[href="https://icelagoon.is/faq/is-it-possible-to-take-children-on-board-of-the-boats/"]',
  );
  if (await exactLagoonFaq.count() !== 1
      || await page.locator('#place-panel a[href*="icelagoon.com"]').count()) {
    fail(`${label}: Jökulsárlón evidence does not stay with the selected operator.`);
  }

  const archive = await page.evaluate(() => ({
    text: document.querySelector('#method-details')?.textContent || '',
    marker: Boolean(document.querySelector('.map-marker[data-option-id="snaefellsnes-ruled-out"]')),
    preference: Boolean(document.querySelector('[data-action="preference"][data-option-id="snaefellsnes-ruled-out"]')),
    comment: Boolean(document.querySelector('form[data-comment-form][data-option-id="snaefellsnes-ruled-out"]')),
  }));
  if (!/Snæfellsnes/i.test(archive.text)
      || !/ruled out|struck through/i.test(archive.text)
      || !/Búðir/i.test(archive.text)
      || !/Arnarstapi/i.test(archive.text)
      || !/Djúpalónssandur/i.test(archive.text)
      || !/Lýsuhólslaug/i.test(archive.text)
      || !/Snæfellsjökull/i.test(archive.text)
      || !/advance-booking inquiry was sent by email/i.test(archive.text)
      || archive.marker || archive.preference || archive.comment) {
    fail(`${label}: the struck-through Snæfellsnes set is not visible as a complete read-only source decision (${JSON.stringify(archive)}).`);
  }
}

async function mutateDesktop(page) {
  await page.locator('#participant-select').selectOption('mary');
  await activateMarker(page, 'dynjandi');
  const vote = page.locator(
    '#selected-place-voting button[data-option-id="dynjandi"][data-preference="love"]',
  );

  let releaseStalePoll;
  let markStalePollCaptured;
  let markStalePollFinished;
  const stalePollCaptured = new Promise((resolve) => { markStalePollCaptured = resolve; });
  const stalePollRelease = new Promise((resolve) => { releaseStalePoll = resolve; });
  const stalePollFinished = new Promise((resolve) => { markStalePollFinished = resolve; });
  let releasePreference;
  let markPreferenceCaptured;
  let preferenceRequestCount = 0;
  const preferenceCaptured = new Promise((resolve) => { markPreferenceCaptured = resolve; });
  const preferenceRelease = new Promise((resolve) => { releasePreference = resolve; });
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

  const delayedPreferenceHandler = async (route) => {
    const requestUrl = new URL(route.request().url());
    if (route.request().method() !== 'POST' || requestUrl.pathname !== '/api/iceland26/preference') {
      await route.continue();
      return;
    }
    preferenceRequestCount += 1;
    markPreferenceCaptured();
    await preferenceRelease;
    await route.continue();
  };

  await page.route('**/api/iceland26', stalePollHandler);
  await page.route('**/api/iceland26/preference', delayedPreferenceHandler);
  try {
    await page.evaluate(() => {
      window.__iceland26StaleRefreshProcessed = new Promise((resolve) => {
        document.addEventListener('iceland26:state-refresh-complete', resolve, { once: true });
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await Promise.race([
      stalePollCaptured,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Stale polling request was not captured.')), 5_000)),
    ]);
    const voteClick = vote.click();
    await Promise.race([
      preferenceCaptured,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Preference request was not captured.')), 5_000)),
    ]);
    const pendingPreferenceState = await page.evaluate(() => ({
      busy: document.querySelector('.preference-grid[data-option-id="dynjandi"]')?.getAttribute('aria-busy'),
      total: document.querySelectorAll('.preference-grid[data-option-id="dynjandi"] button[data-action="preference"]').length,
      locked: document.querySelectorAll('.preference-grid[data-option-id="dynjandi"] button[data-action="preference"][aria-disabled="true"]').length,
    }));
    await page.locator(
      '#selected-place-voting button[data-option-id="dynjandi"][data-preference="interested"]',
    ).evaluate((button) => button.click());
    await page.waitForTimeout(60);
    if (pendingPreferenceState.busy !== 'true'
        || pendingPreferenceState.total !== 3
        || pendingPreferenceState.locked !== 3
        || preferenceRequestCount !== 1) {
      fail(`desktop: an in-flight ranking did not lock the full place preference group (${JSON.stringify({ pendingPreferenceState, preferenceRequestCount })}).`);
    }
    releasePreference();
    await voteClick;
    await page.locator('#sync-status').getByText(/revision 1/).waitFor();
    await page.locator('.preference-grid[data-option-id="dynjandi"][aria-busy="false"]').waitFor();
    releaseStalePoll();
    await stalePollFinished;
    await page.evaluate(async () => {
      await window.__iceland26StaleRefreshProcessed;
      delete window.__iceland26StaleRefreshProcessed;
    });
    if (!await page.locator('#sync-status').getByText(/revision 1/).count()
        || await vote.getAttribute('aria-pressed') !== 'true') {
      fail('desktop: an older polling response regressed Mary’s newer Dynjandi ranking.');
    }
    const focus = await page.evaluate(() => ({
      action: document.activeElement?.dataset.action,
      optionId: document.activeElement?.dataset.optionId,
      preference: document.activeElement?.dataset.preference,
    }));
    if (focus.action !== 'preference'
        || focus.optionId !== 'dynjandi'
        || focus.preference !== 'love') {
      fail(`desktop: preference save lost keyboard focus (${JSON.stringify(focus)}).`);
    }
  } finally {
    releaseStalePoll?.();
    releasePreference?.();
    await page.evaluate(() => { delete window.__iceland26StaleRefreshProcessed; }).catch(() => {});
    await page.unroute('**/api/iceland26', stalePollHandler).catch(() => {});
    await page.unroute('**/api/iceland26/preference', delayedPreferenceHandler).catch(() => {});
  }

  const noteText = 'This feels like the Westfjords anchor.';
  const dynjandiComment = page.locator('#selected-place-comments textarea[aria-label*="Dynjandi"]');
  await dynjandiComment.fill(noteText);
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
  await waitForStateRefresh(page);
  await page.locator('#sync-status').getByText(/revision 2/).waitFor();
  if (await dynjandiComment.inputValue() !== noteText) {
    fail('desktop: a background preference refresh erased the in-progress sticky-note draft.');
  }
  const nextDraft = 'A second note typed while the first is saving.';
  let releaseComment;
  let captureComment;
  const commentCaptured = new Promise((resolve) => { captureComment = resolve; });
  const commentRelease = new Promise((resolve) => { releaseComment = resolve; });
  const delayedCommentHandler = async (route) => {
    const requestUrl = new URL(route.request().url());
    if (route.request().method() !== 'POST' || requestUrl.pathname !== '/api/iceland26/comment') {
      await route.continue();
      return;
    }
    captureComment();
    await commentRelease;
    await route.continue();
  };
  await page.route('**/api/iceland26/comment', delayedCommentHandler);
  try {
    await page.locator('#selected-place-comments').getByRole('button', { name: 'Pin note' }).click();
    await Promise.race([
      commentCaptured,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Comment request was not captured.')), 5_000)),
    ]);
    await dynjandiComment.fill(nextDraft);
    releaseComment();
    await page.locator('#selected-place-comments').getByText(noteText).waitFor();
    await page.locator('#sync-status').getByText(/revision 3/).waitFor();
    if (await dynjandiComment.inputValue() !== nextDraft) {
      fail('desktop: a completed sticky-note save erased text entered for the next note.');
    }
  } finally {
    releaseComment?.();
    await page.unroute('**/api/iceland26/comment', delayedCommentHandler).catch(() => {});
  }

  await page.locator('#open-idea-dialog').click();
  if (!await page.getByRole('dialog', { name: 'Add something to the road' }).count()) {
    fail('desktop: the open shared-idea dialog has no accessible name.');
  }
  const ideaForm = page.locator('#idea-form');
  const stageOption = ideaForm.locator('#idea-location option', { hasText: /Aug 20/i }).first();
  const stageValue = await stageOption.getAttribute('value');
  if (!stageValue) throw new Error('Aug 20 route-stage option is missing from the shared idea form.');
  await ideaForm.locator('[name="title"]').fill('A bakery morning');
  await ideaForm.locator('#idea-location').selectOption(stageValue);
  await ideaForm.locator('[name="details"]').fill('Leave room for a slow local breakfast before the flight.');
  await ideaForm.getByRole('button', { name: 'Add to the board' }).click();
  await page.locator('#sync-status').getByText(/revision 4/).waitFor();
  await page.locator('.decision-card').getByRole('heading', { name: 'A bakery morning' }).waitFor();

  const state = await page.evaluate(async () => (await fetch('/api/iceland26')).json());
  const suggestion = state.suggestions?.[0];
  const exactState = {
    revision: state.revision,
    dynjandi: state.preferences?.dynjandi,
    eclipse: state.preferences?.['eclipse-patreksfjordur'],
    commentCount: state.comments?.length,
    comment: state.comments?.[0] && {
      participant: state.comments[0].participant,
      optionId: state.comments[0].optionId,
      text: state.comments[0].text,
    },
    suggestionCount: state.suggestions?.length,
    suggestion: suggestion && {
      title: suggestion.title,
      location: suggestion.location,
      details: suggestion.details,
      createdBy: suggestion.createdBy,
    },
    suggestionPreference: suggestion && state.preferences?.[suggestion.id],
    activity: state.activity?.map((entry) => entry.type),
  };
  const expectedState = {
    revision: 4,
    dynjandi: { mary: 'love' },
    eclipse: { ben: 'interested' },
    commentCount: 1,
    comment: { participant: 'mary', optionId: 'dynjandi', text: noteText },
    suggestionCount: 1,
    suggestion: {
      title: 'A bakery morning',
      location: stageValue,
      details: 'Leave room for a slow local breakfast before the flight.',
      createdBy: 'mary',
    },
    suggestionPreference: { mary: 'interested' },
    activity: ['preference', 'preference', 'comment', 'suggestion'],
  };
  if (JSON.stringify(exactState) !== JSON.stringify(expectedState)
      || !suggestion?.id?.startsWith('custom-')) {
    fail(`desktop: collaborative state did not persist at the exact expected revision: ${JSON.stringify(exactState)}`);
  }

  await page.locator('.planner-shell').screenshot({
    path: join(screenshotDirectory, 'desktop-idea.png'),
  });

  const unavailableHandler = async (route) => {
    const requestUrl = new URL(route.request().url());
    if (route.request().method() === 'GET' && requestUrl.pathname === '/api/iceland26') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"available":false,"error":"simulated state repair"}',
      });
      return;
    }
    await route.continue();
  };
  await page.route('**/api/iceland26', unavailableHandler);
  await waitForStateRefresh(page);
  const readOnlyVote = page.locator(
    '#selected-place-voting button[data-action="preference"]',
  ).first();
  if (!await readOnlyVote.isDisabled()
      || !await page.locator('#sync-status').getByText(/temporarily read-only/i).count()) {
    fail('desktop: a live-to-unavailable state transition left write controls enabled.');
  }
  await page.unroute('**/api/iceland26', unavailableHandler);
  await waitForStateRefresh(page);
  await page.locator('#sync-status').getByText(/revision 4/).waitFor();
  if (await readOnlyVote.isDisabled()) {
    fail('desktop: write controls did not recover when state availability returned.');
  }

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
        body: JSON.stringify({ participant, optionId: 'latrabjarg-raudasandur', preference }),
      })
    )));
    if (responses.some((response) => !response.ok)) {
      throw new Error('Split-consensus background preferences failed.');
    }
  });
  await waitForStateRefresh(page);
  await page.locator('#sync-status').getByText(/revision 8/).waitFor();
  await activateMarker(page, 'latrabjarg-raudasandur');
  const signal = page.locator('#selected-place-voting .group-signal');
  await signal.getByText(/Worth a conversation · preferences differ/i).waitFor();
  if (await signal.evaluate((node) => node.classList.contains('group-signal--yes'))
      || /group yes/i.test(await signal.innerText())
      || Number(await page.locator('#count-agreements').textContent()) !== 0) {
    fail('desktop: three positive votes plus one pass was mislabeled as group agreement.');
  }
}

async function assertMobileLayout(page) {
  await activateMarker(page, 'dynjandi');
  await page.locator('#map-story-card[aria-hidden="false"] img').waitFor();
  await page.locator('#place-panel').scrollIntoViewIfNeeded();
  await page.waitForTimeout(120);
  await page.screenshot({
    path: join(screenshotDirectory, 'mobile-place.png'),
  });
  const layout = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const timeline = document.querySelector('.timeline-section');
    const map = document.querySelector('#map-frame')?.getBoundingClientRect();
    const day = document.querySelector('.day-rail')?.getBoundingClientRect();
    const panel = document.querySelector('#place-panel')?.getBoundingClientRect();
    const group = document.querySelector('.group-rail')?.getBoundingClientRect();
    const story = document.querySelector('#map-story-card')?.getBoundingClientRect();
    const planner = getComputedStyle(document.querySelector('.planner-shell'));
    const activeLabel = document.querySelector('.map-marker.is-active .map-marker__label');
    const touchTargets = [
      '#logout-button',
      '.date-track button[tabindex="0"]',
      '.map-filter button',
      '.map-zoom button',
      '.day-stop-list button',
      '.preference-button',
      '.sticky-form .mini-button',
      '.alignment-item[role="button"]',
      '#close-place-panel',
      '#close-map-story',
      '.map-story-card__source',
    ].map((selector) => document.querySelector(selector)?.getBoundingClientRect().height || 0);
    return {
      viewportWidth,
      timelineClientWidth: timeline?.clientWidth,
      timelineScrollWidth: timeline?.scrollWidth,
      map: map?.toJSON(),
      day: day?.toJSON(),
      panel: panel?.toJSON(),
      group: group?.toJSON(),
      story: story?.toJSON(),
      plannerDisplay: planner.display,
      panelPosition: getComputedStyle(document.querySelector('#place-panel')).position,
      panelParent: document.querySelector('#place-panel')?.parentElement?.className,
      storyParent: document.querySelector('#map-story-card')?.parentElement?.id,
      storyHidden: document.querySelector('#map-story-card')?.getAttribute('aria-hidden'),
      storyInert: document.querySelector('#map-story-card')?.inert,
      storyOptionId: document.querySelector('#map-story-card')?.dataset.optionId,
      storyFootprint: story && map ? (story.width * story.height) / (map.width * map.height) : null,
      activeLabelDisplay: activeLabel ? getComputedStyle(activeLabel).display : null,
      markerHitRadius: Number(document.querySelector('.map-marker.is-active .map-marker__touch')?.getAttribute('r')),
      touchTargets,
    };
  });
  if (layout.timelineScrollWidth <= layout.timelineClientWidth
      || layout.map.width > layout.viewportWidth + 2
      || layout.panel.left < 0
      || layout.panel.right > layout.viewportWidth + 1
      || layout.panel.width < layout.viewportWidth - 2
      || layout.plannerDisplay !== 'flex'
      || layout.panelPosition === 'absolute'
      || layout.panelParent !== 'planner-shell'
      || layout.storyParent !== 'map-frame'
      || layout.storyHidden !== 'false'
      || layout.storyInert
      || layout.storyOptionId !== 'dynjandi'
      || !Number.isFinite(layout.storyFootprint)
      || layout.storyFootprint > 0.2
      || !(layout.day.top < layout.map.top
        && layout.map.top < layout.panel.top
        && layout.panel.top < layout.group.top)
      || layout.activeLabelDisplay === 'none'
      || layout.markerHitRadius < 22
      || layout.touchTargets.some((height) => height < 43.5)) {
    fail(`mobile: map/day/practical/group order or compact-story layout is invalid (${JSON.stringify(layout)}).`);
  }

  await page.locator('#map-frame').evaluate((node) => {
    const root = document.documentElement;
    const previousScrollBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    node.scrollIntoView({ block: 'end', behavior: 'auto' });
    root.style.scrollBehavior = previousScrollBehavior;
  });
  await page.waitForTimeout(120);
  const mapUsability = await page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect();
    const story = rect('#map-story-card');
    const toolbar = rect('.map-toolbar');
    const camperKey = rect('.camper-key');
    const attribution = rect('.map-attribution');
    const activeTouch = rect('.map-marker.is-active .map-marker__touch');
    const overlaps = (first, second) => Boolean(first && second
      && first.left < second.right && first.right > second.left
      && first.top < second.bottom && first.bottom > second.top);
    const hit = (selector, closestSelector = selector) => {
      const node = document.querySelector(selector);
      const box = node?.getBoundingClientRect();
      if (!node || !box?.width || !box?.height) return false;
      const target = document.elementFromPoint(box.left + (box.width / 2), box.top + (box.height / 2));
      return target === node || target?.closest?.(closestSelector) === node;
    };
    const activeMarker = document.querySelector('.map-marker.is-active');
    const activeDot = activeMarker?.querySelector('.map-marker__dot')?.getBoundingClientRect();
    const activeHit = activeDot
      ? document.elementFromPoint(
        activeDot.left + (activeDot.width / 2),
        activeDot.top + (activeDot.height / 2),
      )?.closest?.('.map-marker')?.dataset.optionId
      : null;
    const storyStyle = getComputedStyle(document.querySelector('#map-story-card'));
    const alphaMatch = storyStyle.backgroundColor.match(/rgba?\(([^)]+)\)/);
    const alphaParts = alphaMatch
      ? alphaMatch[1].split(',').map((part) => Number.parseFloat(part.trim()))
      : [];
    return {
      storyToolbarOverlap: overlaps(story, toolbar),
      storyKeyOverlap: overlaps(story, camperKey),
      storyAttributionOverlap: overlaps(story, attribution),
      storyActiveMarkerOverlap: overlaps(story, activeTouch),
      keyAttributionOverlap: overlaps(camperKey, attribution),
      activeHit,
      filterHit: hit('.map-filter button[aria-pressed="true"]'),
      zoomHit: hit('#zoom-in'),
      keyHit: hit('.camper-key'),
      attributionHit: hit('.map-attribution a'),
      storyPointerEvents: storyStyle.pointerEvents,
      storyOpacity: storyStyle.opacity,
      storyBackgroundAlpha: alphaParts.length === 4 ? alphaParts[3] : (alphaParts.length ? 1 : null),
      storyBackdrop: storyStyle.backdropFilter,
      closeHeight: rect('#close-map-story')?.height,
      sourceHeight: rect('.map-story-card__source')?.height,
    };
  });
  if (mapUsability.storyToolbarOverlap
      || mapUsability.storyKeyOverlap
      || mapUsability.storyAttributionOverlap
      || mapUsability.storyActiveMarkerOverlap
      || mapUsability.keyAttributionOverlap
      || mapUsability.activeHit !== 'dynjandi'
      || !mapUsability.filterHit
      || !mapUsability.zoomHit
      || !mapUsability.keyHit
      || !mapUsability.attributionHit
      || mapUsability.storyPointerEvents !== 'none'
      || mapUsability.storyOpacity !== '1'
      || !Number.isFinite(mapUsability.storyBackgroundAlpha)
      || mapUsability.storyBackgroundAlpha <= 0
      || mapUsability.storyBackgroundAlpha >= 1
      || !mapUsability.storyBackdrop
      || mapUsability.storyBackdrop === 'none'
      || mapUsability.closeHeight < 43.5
      || mapUsability.sourceHeight < 43.5) {
    fail(`mobile: compact story blocks map markers/controls/key/attribution or is not independently interactive (${JSON.stringify(mapUsability)}).`);
  }
  await page.locator('#map-frame').screenshot({
    path: join(screenshotDirectory, 'mobile-map-story.png'),
  });
  await assertNoHorizontalOverflow(page, 'mobile responsive layout');
  await page.locator('#close-place-panel').click();
  await page.locator('#place-panel.is-closed').waitFor({ state: 'hidden' });
  await page.waitForTimeout(220);
  await page.locator('#map-frame').screenshot({
    path: join(screenshotDirectory, 'mobile-map.png'),
  });
}

async function exerciseLogout(page, label, setExpectedLogoutFailure) {
  await page.locator('#participant-select').selectOption('laura');
  const lockButton = page.locator('#logout-button');
  if (!await lockButton.isVisible()) {
    fail(`${label}: Lock control is not available on the phone layout.`);
  }
  setExpectedLogoutFailure(true);
  await page.route('**/api/iceland26/logout', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: '{"error":"simulated failure"}',
  }));
  await lockButton.click();
  await page.locator('#toast').getByText(/still signed in/i).waitFor();
  const stillAuthenticated = await page.evaluate(async () => (await fetch('/api/iceland26')).status);
  if (page.url().includes('/access.html') || stillAuthenticated !== 200
      || await page.evaluate(() => localStorage.getItem('iceland26-participant')) !== 'laura') {
    fail(`${label}: failed logout presented a false locked state or cleared identity/session.`);
  }
  await page.unroute('**/api/iceland26/logout');
  setExpectedLogoutFailure(false);

  await lockButton.click();
  await page.waitForURL(/\/iceland26\/access\.html$/);
  if (await page.evaluate(() => localStorage.getItem('iceland26-participant')) !== null) {
    fail(`${label}: successful logout retained the remembered participant identity.`);
  }
  const lockedState = await page.context().request.get(`${baseUrl}/api/iceland26`);
  if (lockedState.status() !== 401) {
    fail(`${label}: successful logout left coordination state readable (${lockedState.status()}).`);
  }
}

async function runViewport(viewport, label, mutate = false) {
  const context = await browser.newContext({
    viewport,
    hasTouch: label === 'mobile',
  });
  ownedContexts.add(context);
  const page = await context.newPage();
  ownedPages.add(page);
  const errors = [];
  let expectedLogoutFailure = false;
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (expectedLogoutFailure && /503|failed to load resource/i.test(text)) return;
    errors.push(`console: ${text}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

  try {
    await login(page, context, label);
    await assertBoardStructure(page, label);
    await assertBonusLayer(page, label);
    await exerciseTimeline(page, label, label === 'desktop');
    await exerciseMapControls(page, label);
    await exercisePointerMarkerCollisions(page, label);
    await assertReynisfjaraTruth(page, label);

    if (mutate) {
      await assertRailPlaceDetailAndMapStory(page, label);
      await assertSourceChoiceIndependence(page, label);
      await mutateDesktop(page);
    } else {
      await assertMobileLayout(page);
      await exerciseLogout(page, label, (expected) => { expectedLogoutFailure = expected; });
    }

    if (errors.length) fail(`${label}: browser errors: ${errors.join(' | ')}`);
  } finally {
    try {
      await page.close({ runBeforeUnload: false });
    } finally {
      ownedPages.delete(page);
    }
    try {
      await context.close();
    } finally {
      ownedContexts.delete(context);
    }
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
  recordProcess(browserServer.process(), 'Iceland interaction browser');
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
    const details = error instanceof AggregateError
      ? error.errors.map((entry) => entry.message).join(' | ')
      : error.message;
    fail(`Cleanup verification failed: ${details}`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Iceland map-first coordination UI passed protected access, route/map truth, desktop/mobile accessibility, timeline/camper animation, ranking, sticky-note, suggestion, consensus, logout, persistence, error, and verified teardown checks.');
