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
let browser;
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
  await expect(page, () => window.__carbonPortal?.snapshot().signalSettled, `${label}: viewport signal did not settle into alignment`, 3000);

  const introVisual = await page.evaluate(() => {
    const spans = [...document.querySelectorAll('#ascii span')];
    const rects = spans.map((node) => node.getBoundingClientRect()).filter((rect) => rect.width > 0 && rect.height > 0);
    const bounds = {
      left: Math.min(...rects.map((rect) => rect.left)),
      right: Math.max(...rects.map((rect) => rect.right)),
      top: Math.min(...rects.map((rect) => rect.top)),
      bottom: Math.max(...rects.map((rect) => rect.bottom)),
    };
    return {
      spans: spans.length,
      colors: new Set(spans.map((node) => node.className)).size,
      coverageWidth: (bounds.right - bounds.left) / window.innerWidth,
      coverageHeight: (bounds.bottom - bounds.top) / window.innerHeight,
      surfaceHidden: document.querySelector('#surface-site').hidden,
      hasReplacementMatte: Boolean(document.querySelector('#ascii-matte')),
      visibleChrome: [...document.body.children].filter((node) => {
        if (['SCRIPT', 'NOSCRIPT', 'MAIN'].includes(node.tagName) || node.classList.contains('sr-only')) return false;
        const style = getComputedStyle(node);
        return style.display !== 'none' && style.visibility !== 'hidden';
      }).length,
    };
  });
  if (introVisual.spans < 20) failures.push(`${label}: ASCII scene has too few colored runs (${introVisual.spans})`);
  if (introVisual.colors < 5) failures.push(`${label}: ASCII scene has too little color variation (${introVisual.colors})`);
  if (!introVisual.surfaceHidden) failures.push(`${label}: corporate surface leaks into first load`);
  if (introVisual.hasReplacementMatte) failures.push(`${label}: obsolete replacement matte remains in the document`);
  if (introVisual.visibleChrome !== 0) failures.push(`${label}: first load exposes non-scene interface chrome`);

  const layout = await page.evaluate(() => ({
    portal: window.__carbonPortal.snapshot(),
    enter: window.__carbonPortal.targets().enter,
    signal: (() => {
      const button = document.querySelector('#portal-enter');
      const label = button.querySelector('.portal-enter-label');
      const buttonStyle = getComputedStyle(button);
      const labelStyle = getComputedStyle(label);
      const labelRect = label.getBoundingClientRect();
      return {
        position: buttonStyle.position,
        perspective: buttonStyle.perspective,
        labelTransform: labelStyle.transform,
        depthTransforms: /matrix3d|translateZ|rotate[XY]/.test(labelStyle.transform),
        labelWidth: labelRect.width,
        labelHeight: labelRect.height,
      };
    })(),
  }));
  const expectedScale = ((10 / 1.25) / layout.portal.mobiusBaseHeight) * 1.1;
  if (Math.abs(layout.portal.mobiusScale - expectedScale) > 0.02) failures.push(`${label}: Mobius is not scaled to 110% of viewport height`);
  if (layout.portal.mobiusPosition.some((value) => Math.abs(value) > 0.001)) failures.push(`${label}: Mobius is not centered at the world origin`);
  if (Math.abs(layout.enter.x - viewport.width / 2) > viewport.width * 0.035 || Math.abs(layout.enter.y - viewport.height / 2) > viewport.height * 0.035) failures.push(`${label}: We found you is not centered inside the loop`);
  if (layout.signal.position !== 'fixed' || layout.signal.perspective !== 'none') failures.push(`${label}: We found you is not locked to the viewport plane`);
  if (layout.signal.depthTransforms || layout.signal.labelTransform.startsWith('matrix3d')) failures.push(`${label}: We found you retains a 3D transform`);
  if (layout.signal.labelWidth > 1.5 || layout.signal.labelHeight > 1.5) failures.push(`${label}: a visible HTML phrase still replaces the ASCII mesh`);
  if (layout.portal.signalGeometryDepth === null || layout.portal.signalGeometryDepth > 0.031) failures.push(`${label}: transient text extrusion is too deep (${layout.portal.signalGeometryDepth})`);
  if (layout.portal.signalState !== 'locked' || Math.abs(layout.portal.signalAngle) > 0.001) failures.push(`${label}: ASCII phrase did not stop at viewer alignment`);
  if (!['following', 'easing', 'locked'].every((state) => layout.portal.signalStatesVisited.includes(state))) failures.push(`${label}: ASCII phrase did not follow, ease, and lock in sequence`);
  if (layout.portal.signalMaxFollowError > 0.000001) failures.push(`${label}: ASCII phrase did not initially share the loop's angular phase`);
  if (layout.portal.signalLockTransformError === null || layout.portal.signalLockTransformError > 0.000001) failures.push(`${label}: camera lock changed the ASCII phrase transform`);
  if (!layout.portal.signalMeshVisible || layout.portal.signalParent !== 'camera') failures.push(`${label}: settled ASCII phrase is not the persistent camera-locked link`);
  if (layout.portal.textMode !== 'ascii-3d-camera-locked') failures.push(`${label}: text was replaced instead of preserving its ASCII 3D mesh`);
  if (Math.abs(layout.portal.signalStartAngle + Math.PI / 4) > 0.001) failures.push(`${label}: ASCII phrase does not begin 45 degrees askew in X-Z`);
  if (Math.abs(layout.portal.signalScreenScale - 1.25) > 0.02) failures.push(`${label}: camera-locked signal has the wrong initial screen scale`);
  if (layout.portal.sweep?.centerline !== 'circle' || layout.portal.sweep?.crossSection !== 'ellipse') failures.push(`${label}: Mobius sweep contract is not an ellipse on a circular centerline`);
  if (Math.abs(layout.portal.sweep?.majorAxis - 1) > 0.001 || Math.abs(layout.portal.sweep?.minorAxis - 0.125) > 0.001 || Math.abs(layout.portal.sweep?.pathRadius - 2) > 0.001) failures.push(`${label}: Mobius sweep dimensions changed`);
  if (Math.abs(layout.portal.sweep?.twistRadians - Math.PI) > 0.001 || layout.portal.sweep?.maxCenterlineError > 0.00001) failures.push(`${label}: Mobius centerline is not a measured perfect circle`);
  if (layout.portal.spinAxisLocal.some((value, index) => Math.abs(value - [1, 0, 0][index]) > 0.001)) failures.push(`${label}: authored first-to-fourth ellipse axis is not local X`);
  if (layout.portal.spinAxisWorld.some((value, index) => Math.abs(value - [0, 1, 0][index]) > 0.001)) failures.push(`${label}: authored ellipse axis is not aligned to vertical world Y`);
  if (Math.abs(layout.portal.axisFrameRotation[2] - Math.PI / 2) > 0.001) failures.push(`${label}: ellipse axis frame does not preserve the authored quarter-turn alignment`);
  if (layout.portal.mobiusGeometryRotation.some((value) => Math.abs(value) > 0.001)) failures.push(`${label}: torus geometry was rotated instead of its authored centerline pivot`);
  const rotationBeforeCoverage = layout.portal.mobiusRotation;

  for (let sampleIndex = 0; sampleIndex < 3; sampleIndex += 1) {
    await page.waitForTimeout(500);
    const coverage = await page.evaluate(() => {
      const rects = [...document.querySelectorAll('#ascii span')]
        .map((node) => node.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0);
      const left = Math.min(...rects.map((rect) => rect.left));
      const right = Math.max(...rects.map((rect) => rect.right));
      const top = Math.min(...rects.map((rect) => rect.top));
      const bottom = Math.max(...rects.map((rect) => rect.bottom));
      return {
        width: (right - left) / window.innerWidth,
        height: (bottom - top) / window.innerHeight,
        centerX: (left + right) / (2 * window.innerWidth),
        centerY: (top + bottom) / (2 * window.innerHeight),
      };
    });
    if (coverage.height < 0.94) failures.push(`${label}: rotating Mobius stopped reaching the vertical viewport edges (${coverage.height.toFixed(2)})`);
  }

  const afterCoverage = await page.evaluate(() => window.__carbonPortal.snapshot());
  const rotationAfterCoverage = afterCoverage.mobiusRotation;
  if (Math.abs(rotationAfterCoverage[1] - rotationBeforeCoverage[1]) > 0.001 || Math.abs(rotationAfterCoverage[2] - rotationBeforeCoverage[2]) > 0.001) failures.push(`${label}: Mobius rotated away from its authored ellipse-center axis`);
  if (Math.abs(rotationAfterCoverage[0] - rotationBeforeCoverage[0]) < 0.05) failures.push(`${label}: Mobius did not spin around the first-to-fourth ellipse centerline`);
  if (!afterCoverage.signalMeshVisible || afterCoverage.signalParent !== 'camera' || Math.abs(afterCoverage.signalAngle) > 0.001) failures.push(`${label}: rotating the loop disturbed the locked ASCII link`);
  const enterAfterRotation = await page.evaluate(() => window.__carbonPortal.targets().enter);
  if (Math.abs(enterAfterRotation.x - layout.enter.x) > 0.5 || Math.abs(enterAfterRotation.y - layout.enter.y) > 0.5) failures.push(`${label}: rotating the loop moved the viewport-locked text`);

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
  const zoomResult = await page.evaluate(() => ({
    zoom: window.__carbonPortal.snapshot().zoom,
    enter: window.__carbonPortal.targets().enter,
    signalScreenScale: window.__carbonPortal.snapshot().signalScreenScale,
  }));
  const zoomed = zoomResult.zoom;
  if (zoomed <= beforePause.zoom) failures.push(`${label}: wheel did not zoom the scene`);
  if (Math.abs(zoomResult.enter.x - layout.enter.x) > 0.5 || Math.abs(zoomResult.enter.y - layout.enter.y) > 0.5) failures.push(`${label}: zooming the loop moved the viewport-locked text`);
  if (Math.abs(zoomResult.signalScreenScale - layout.portal.signalScreenScale) > 0.02) failures.push(`${label}: zooming the loop resized the locked ASCII link`);
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
  const signalDuringDive = await page.evaluate(() => window.__carbonPortal.snapshot().signalMeshVisible);
  if (signalDuringDive) failures.push(`${label}: ASCII link remained visible after activation`);
  const swoopFrames = [];
  for (let frameIndex = 0; frameIndex < 18; frameIndex += 1) {
    await page.waitForTimeout(300);
    const frame = await page.evaluate(() => window.__carbonPortal.snapshot());
    swoopFrames.push(frame);
    if (frame.mode === 'site') break;
  }
  const transitionFrames = swoopFrames.filter((frame) => frame.mode === 'transition');
  if (transitionFrames.length < 8) failures.push(`${label}: surface flight was not gradual enough (${transitionFrames.length} sampled frames)`);
  if (!swoopFrames.some((frame) => frame.mode === 'site')) failures.push(`${label}: sampled corporate surface did not appear after the flight`);
  if (transitionFrames[0]?.transitionDuration < 3400) failures.push(`${label}: surface flight duration is too abrupt`);
  const zoomFrames = [resetZoom, ...swoopFrames.map((frame) => frame.zoom)];
  if (zoomFrames.some((zoom, index) => index > 0 && zoom + 0.001 < zoomFrames[index - 1])) failures.push(`${label}: surface flight reversed zoom direction`);
  if (zoomFrames.some((zoom, index) => index > 0 && zoom / Math.max(0.01, zoomFrames[index - 1]) > 1.8)) failures.push(`${label}: surface flight contains an abrupt zoom step`);
  if (Math.max(...zoomFrames) <= 10) failures.push(`${label}: surface flight never reached the Mobius surface`);
  await expect(page, () => window.__carbonPortal.snapshot().mode === 'site', `${label}: sampled corporate surface did not settle`, 1000);
  await expect(page, () => document.body.classList.contains('is-surface-site'), `${label}: site reveal class was not applied`);
  await expect(page, () => {
    const stage = getComputedStyle(document.querySelector('#ascii-stage'));
    const site = getComputedStyle(document.querySelector('#surface-site'));
    return Number(stage.opacity) === 1 && Number(site.opacity) === 1;
  }, `${label}: frozen ASCII frame did not remain visible beneath the site`, 2000);

  await page.evaluate(() => {
    window.__frozenAsciiFrameForTest = document.querySelector('#ascii').innerHTML;
  });
  await page.waitForTimeout(700);

  const surface = await page.evaluate(() => {
    const portal = window.__carbonPortal.snapshot();
    const site = document.querySelector('#surface-site');
    const stageStyle = getComputedStyle(document.querySelector('#ascii-stage'));
    return {
      portal,
      siteHidden: site.hidden,
      siteAria: site.getAttribute('aria-hidden'),
      frozenFrameStable: document.querySelector('#ascii').innerHTML === window.__frozenAsciiFrameForTest,
      frozenRunCount: document.querySelectorAll('#ascii span').length,
      frozenDensity: (() => {
        const text = document.querySelector('#ascii table').innerText;
        const cells = text.replace(/\n/g, '');
        return cells.length ? cells.replace(/\s/g, '').length / cells.length : 0;
      })(),
      stageOpacity: Number(stageStyle.opacity),
      stagePosition: stageStyle.position,
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
  if (!surface.frozenFrameStable) failures.push(`${label}: final ASCII frame changed after the dive stopped`);
  if (surface.frozenRunCount < 5 || surface.frozenDensity < 0.85) failures.push(`${label}: frozen substrate does not fill the view (${surface.frozenDensity.toFixed(2)} density)`);
  if (surface.stageOpacity !== 1 || surface.stagePosition !== 'fixed') failures.push(`${label}: final ASCII renderer frame is not the fixed visible substrate`);
  if (!surface.portal.surface) failures.push(`${label}: final surface sample is unavailable to the interface theme`);
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
  const frozenAfterScroll = await page.evaluate(() => document.querySelector('#ascii').innerHTML === window.__frozenAsciiFrameForTest);
  if (!frozenAfterScroll) failures.push(`${label}: final ASCII frame changed while the corporate site scrolled`);
  await page.screenshot({ path: `output/playwright/${label}-surface-company.png` });

  await page.locator('#return-signal').click();
  await expect(page, () => window.__carbonPortal.snapshot().mode === 'intro', `${label}: return-to-signal did not restore intro`, 3000);
  await expect(page, () => window.__carbonPortal.snapshot().signalSettled, `${label}: returned viewport signal did not settle`, 3000);
  const restored = await page.evaluate(() => ({
    surfaceHidden: document.querySelector('#surface-site').hidden,
    surfaceClass: document.body.classList.contains('is-surface-site'),
    portal: window.__carbonPortal.snapshot(),
  }));
  if (!restored.surfaceHidden || restored.surfaceClass) failures.push(`${label}: sampled site remained visible after return`);
  if (Math.abs(restored.portal.zoom - 1.25) > 0.02) failures.push(`${label}: intro camera was not restored`);
  if (!restored.portal.signalMeshVisible || restored.portal.signalParent !== 'camera') failures.push(`${label}: return did not restore the same ASCII link mesh`);
  await page.screenshot({ path: `output/playwright/${label}-intro.png` });

  if (consoleErrors.length) failures.push(`${label}: console errors: ${consoleErrors.join(' | ')}`);
  await page.close();
}

try {
  browser = await chromium.launch({ headless: true, executablePath });
  await run({ width: 1440, height: 900 }, 'desktop');
  await run({ width: 390, height: 844 }, 'mobile');
} finally {
  await browser?.close();
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`Frozen-surface continuity smoke passed at desktop and mobile viewports for ${baseUrl}.`);
