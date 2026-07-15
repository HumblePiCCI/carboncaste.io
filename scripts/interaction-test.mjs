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

async function expect(page, condition, message, timeout = 5000) {
  try {
    await page.waitForFunction(condition, undefined, { timeout });
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

  const introVisual = await page.evaluate(() => ({
    spans: document.querySelectorAll('#ascii span').length,
    colors: new Set([...document.querySelectorAll('#ascii span')].map((node) => node.className)).size,
    surfaceHidden: document.querySelector('#surface-site').hidden,
    matteHidden: document.querySelector('#ascii-matte').hidden,
    visibleChrome: [...document.body.children].filter((node) => {
      if (['SCRIPT', 'NOSCRIPT', 'MAIN'].includes(node.tagName) || node.classList.contains('sr-only')) return false;
      const style = getComputedStyle(node);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }).length,
  }));
  if (introVisual.spans < 20) failures.push(`${label}: ASCII scene has too few colored runs (${introVisual.spans})`);
  if (introVisual.colors < 5) failures.push(`${label}: ASCII scene has too little color variation (${introVisual.colors})`);
  if (!introVisual.surfaceHidden || !introVisual.matteHidden) failures.push(`${label}: corporate surface leaks into first load`);
  if (introVisual.visibleChrome !== 0) failures.push(`${label}: first load exposes non-scene interface chrome`);

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
  if (Math.abs(resetZoom - 1.25) > 0.02) failures.push(`${label}: double activation did not reset zoom`);

  const enterPoint = await page.evaluate(() => window.__carbonPortal.targets().enter);
  if (label === 'mobile') await page.touchscreen.tap(enterPoint.x, enterPoint.y);
  else await page.mouse.click(enterPoint.x, enterPoint.y);
  await expect(page, () => window.__carbonPortal.snapshot().mode === 'transition', `${label}: surface dive did not start`);
  await expect(page, () => window.__carbonPortal.snapshot().zoom > 10, `${label}: dive never reached the Mobius surface`, 4000);
  await expect(page, () => window.__carbonPortal.snapshot().mode === 'site', `${label}: sampled corporate surface did not appear`, 5000);
  await expect(page, () => document.body.classList.contains('is-surface-site'), `${label}: site reveal class was not applied`);
  await expect(page, () => {
    const stage = getComputedStyle(document.querySelector('#ascii-stage'));
    const site = getComputedStyle(document.querySelector('#surface-site'));
    return Number(stage.opacity) === 0 && Number(site.opacity) === 1;
  }, `${label}: sampled site did not settle above the Mobius transition`, 2000);

  const surface = await page.evaluate(() => {
    const portal = window.__carbonPortal.snapshot();
    const site = document.querySelector('#surface-site');
    const matte = document.querySelector('#ascii-matte');
    const glyphs = new Set(matte.textContent.replace(/\n/g, ''));
    return {
      portal,
      siteHidden: site.hidden,
      siteAria: site.getAttribute('aria-hidden'),
      matteHidden: matte.hidden,
      matteLength: matte.textContent.length,
      matteGlyphs: [...glyphs],
      theme: [...document.body.classList].find((name) => name.startsWith('surface-theme-')),
      sections: document.querySelectorAll('#surface-main section').length,
      productLinks: document.querySelectorAll('.product-links a').length,
      footerLinks: document.querySelectorAll('.site-footer a').length,
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      bodyPosition: getComputedStyle(document.body).position,
    };
  });
  if (surface.siteHidden || surface.siteAria !== 'false') failures.push(`${label}: corporate site is not exposed after the dive`);
  if (surface.matteHidden || surface.matteLength < 20000) failures.push(`${label}: sampled ASCII matte was not built`);
  if (surface.matteGlyphs.length !== 1) failures.push(`${label}: matte does not preserve one sampled character`);
  if (!surface.portal.matte || surface.matteGlyphs[0] !== surface.portal.matte.character) failures.push(`${label}: matte character does not match the sampled surface`);
  if (!surface.theme?.startsWith('surface-theme-ac-')) failures.push(`${label}: sampled chroma theme was not applied`);
  if (surface.sections < 4 || surface.productLinks !== 3 || surface.footerLinks !== 4) failures.push(`${label}: corporate information architecture is incomplete`);
  if (surface.scrollHeight <= surface.viewportHeight * 2) failures.push(`${label}: corporate site is not a scrollable full site`);
  if (surface.bodyPosition !== 'static') failures.push(`${label}: body remained trapped in fixed portal mode`);

  await page.screenshot({ path: `output/playwright/${label}-surface-top.png` });
  await page.locator('.site-nav a[href="#company"]').click();
  await page.waitForTimeout(500);
  const companyTop = await page.evaluate(() => document.querySelector('#company').getBoundingClientRect().top);
  if (Math.abs(companyTop - 58) > 100) failures.push(`${label}: company navigation did not move to the section`);
  const header = await page.evaluate(() => {
    const rect = document.querySelector('.site-header').getBoundingClientRect();
    return { top: rect.top, position: getComputedStyle(document.querySelector('.site-header')).position };
  });
  if (header.position !== 'fixed' || Math.abs(header.top) > 2) failures.push(`${label}: surface header did not remain fixed after navigation`);
  await page.screenshot({ path: `output/playwright/${label}-surface-company.png` });

  await page.locator('#return-signal').click();
  await expect(page, () => window.__carbonPortal.snapshot().mode === 'intro', `${label}: return-to-signal did not restore intro`, 3000);
  const restored = await page.evaluate(() => ({
    surfaceHidden: document.querySelector('#surface-site').hidden,
    matteHidden: document.querySelector('#ascii-matte').hidden,
    surfaceClass: document.body.classList.contains('is-surface-site'),
    zoom: window.__carbonPortal.snapshot().zoom,
  }));
  if (!restored.surfaceHidden || !restored.matteHidden || restored.surfaceClass) failures.push(`${label}: sampled site remained visible after return`);
  if (Math.abs(restored.zoom - 1.25) > 0.02) failures.push(`${label}: intro camera was not restored`);
  await page.screenshot({ path: `output/playwright/${label}-intro.png` });

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

console.log(`Sampled-surface interaction smoke passed at desktop and mobile viewports for ${baseUrl}.`);
