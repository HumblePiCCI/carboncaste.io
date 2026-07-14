import { existsSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const baseUrl = (process.env.BASE_URL || 'http://127.0.0.1:8126').replace(/\/$/, '');
const chromePaths = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];
const executablePath = chromePaths.find(existsSync);
if (!executablePath) throw new Error('Chrome or Chromium is required for interaction tests.');

mkdirSync('output/playwright', { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath });
const failures = [];

async function expect(page, condition, message) {
  try {
    await page.waitForFunction(condition, undefined, { timeout: 5000 });
  } catch {
    failures.push(message);
  }
}

async function run(viewport, label) {
  const page = await browser.newPage({ viewport, hasTouch: label === 'mobile' });
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await expect(page, () => document.documentElement.classList.contains('ascii-ready'), `${label}: ASCII scene did not become ready`);
  await expect(page, () => window.__carbonPortal?.snapshot().mode === 'intro', `${label}: portal did not begin in intro mode`);

  const visual = await page.evaluate(() => ({
    spans: document.querySelectorAll('#ascii span').length,
    colors: new Set([...document.querySelectorAll('#ascii span')].map((node) => node.className)).size,
    visibleChrome: [...document.body.children].filter((node) => {
      if (['SCRIPT', 'NOSCRIPT', 'MAIN'].includes(node.tagName) || node.classList.contains('sr-only')) return false;
      const style = getComputedStyle(node);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }).length,
  }));
  if (visual.spans < 20) failures.push(`${label}: ASCII scene has too few colored runs (${visual.spans})`);
  if (visual.colors < 5) failures.push(`${label}: ASCII scene has too little color variation (${visual.colors})`);
  if (visual.visibleChrome !== 0) failures.push(`${label}: first load exposes non-scene interface chrome`);

  const beforePause = await page.evaluate(() => window.__carbonPortal.snapshot());
  await page.keyboard.press('Space');
  await page.waitForTimeout(120);
  const paused = await page.evaluate(() => window.__carbonPortal.snapshot());
  if (!paused.paused) failures.push(`${label}: Space did not pause motion`);
  await page.keyboard.press(']');
  const faster = await page.evaluate(() => window.__carbonPortal.snapshot());
  if (faster.rotationSpeed <= beforePause.rotationSpeed) failures.push(`${label}: speed-up control did not increase motion`);
  await page.keyboard.press('Space');

  await page.mouse.wheel(0, -500);
  await page.waitForTimeout(180);
  const zoomed = await page.evaluate(() => window.__carbonPortal.snapshot().zoom);
  if (zoomed <= beforePause.zoom) failures.push(`${label}: wheel did not zoom the scene`);
  if (label === 'mobile') {
    await page.touchscreen.tap(viewport.width - 30, viewport.height - 30);
    await page.waitForTimeout(90);
    await page.touchscreen.tap(viewport.width - 30, viewport.height - 30);
  } else {
    await page.mouse.dblclick(viewport.width - 30, viewport.height - 30);
  }
  await page.waitForTimeout(220);
  const resetZoom = await page.evaluate(() => window.__carbonPortal.snapshot().zoom);
  if (Math.abs(resetZoom - 1.25) > 0.02) failures.push(`${label}: double-click did not reset zoom`);

  const enterPoint = await page.evaluate(() => window.__carbonPortal.targets().enter);
  if (label === 'mobile') await page.touchscreen.tap(enterPoint.x, enterPoint.y);
  else await page.mouse.click(enterPoint.x, enterPoint.y);
  await expect(page, () => window.__carbonPortal.snapshot().mode === 'directory', `${label}: entry transition did not reveal directory`);
  const companyPoint = await page.evaluate(() => window.__carbonPortal.targets().company);
  if (label === 'mobile') await page.touchscreen.tap(companyPoint.x, companyPoint.y);
  else await page.mouse.click(companyPoint.x, companyPoint.y);
  await expect(page, () => window.__carbonPortal.snapshot().mode === 'company', `${label}: company relief did not open`);
  await page.screenshot({ path: `output/playwright/${label}-company.png`, fullPage: true });
  await page.keyboard.press('Escape');
  await expect(page, () => window.__carbonPortal.snapshot().mode === 'directory', `${label}: company relief did not return to directory`);
  await page.screenshot({ path: `output/playwright/${label}-directory.png`, fullPage: true });
  await page.keyboard.press('Escape');
  await expect(page, () => window.__carbonPortal.snapshot().mode === 'intro', `${label}: directory did not return to intro`);
  await page.screenshot({ path: `output/playwright/${label}-intro.png`, fullPage: true });

  if (consoleErrors.length) failures.push(`${label}: console errors: ${consoleErrors.join(' | ')}`);
  await page.close();
}

await run({ width: 1440, height: 900 }, 'desktop');
await run({ width: 390, height: 844 }, 'mobile');
await browser.close();

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`Interaction smoke passed at desktop and mobile viewports for ${baseUrl}.`);
