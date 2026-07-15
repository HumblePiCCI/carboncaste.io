import { access, readFile } from 'node:fs/promises';

const requiredFiles = [
  'index.html',
  'privacy.html',
  'terms.html',
  'contact.html',
  '404.html',
  'robots.txt',
  'sitemap.xml',
  '.well-known/security.txt',
  'fonts/helvetiker_regular.typeface.json',
  'dist/portal.js',
];

const failures = [];

for (const file of requiredFiles) {
  try {
    await access(file);
    const content = await readFile(file);
    if (!content.length) failures.push(`${file} is empty`);
  } catch {
    failures.push(`${file} is missing`);
  }
}

const index = await readFile('index.html', 'utf8');
for (const value of [
  'Carbon Caste Inc.',
  'We found you.',
  'https://carboncaste.io',
  'admin@carboncaste.io',
  'https://rezonance.carboncaste.io',
  'id="ascii-stage"',
  'id="ascii-scene"',
  'id="surface-site"',
  'id="return-signal"',
  'id="work"',
  'id="company"',
  'id="contact"',
  'styles.css?v=continuity-20260715',
  'dist/portal.js?v=continuity-20260715',
  'privacy.html',
  'terms.html',
  'contact.html',
]) {
  if (!index.includes(value)) failures.push(`index.html is missing ${value}`);
}

if (!/id="surface-site"[^>]*hidden/.test(index)) {
  failures.push('index.html must keep the corporate site hidden on first load');
}
if (index.includes('id="ascii-matte"')) {
  failures.push('index.html must not replace the final renderer frame with a synthetic matte');
}

for (const file of ['privacy.html', 'terms.html', 'contact.html']) {
  const content = await readFile(file, 'utf8');
  if (!content.includes('Carbon Caste Inc.')) failures.push(`${file} is missing the legal entity name`);
  if (!content.includes('admin@carboncaste.io')) failures.push(`${file} is missing the company email`);
  if (!content.includes('class="legal-page"')) failures.push(`${file} is missing the shared ASCII page shell`);
}

const effect = await readFile('src/CspAsciiEffect.js', 'utf8');
if (/style\s*=/.test(effect) || /\.style\./.test(effect)) {
  failures.push('CspAsciiEffect.js must not emit inline styles blocked by the production CSP');
}
for (const value of ['this.sampleAt', 'class="${nextClass}"', 'colorClass(red, green, blue)', 'latestPixels']) {
  if (!effect.includes(value)) failures.push(`CspAsciiEffect.js is missing ${value}`);
}

const portal = await readFile('src/portal.js', 'utf8');
for (const value of [
  'OrbitControls',
  'TextGeometry',
  'createToroidalMobius',
  "makeText('We found you.'",
  'pickDiveTarget',
  'effect.sampleAt(0.5, 0.5)',
  'applySurfaceTheme',
  'Math.max(baseViewWidth, baseViewHeight)',
  "mode = 'site'",
  'restoreIntro',
  "event.code === 'Space'",
  "event.key === '['",
  "addEventListener('dblclick'",
  'raycaster.intersectObject',
]) {
  if (!portal.includes(value)) failures.push(`src/portal.js is missing interaction contract ${value}`);
}

const styles = await readFile('styles.css', 'utf8');
for (const value of [
  '#ascii-stage',
  '#ascii table',
  '.is-surface-site #ascii-stage',
  '.surface-theme-ac-0',
  '.is-surface-site',
  '.surface-hero',
  '.section-work',
  '.section-company',
  '.surface-spectrum',
  '.legal-aside::before',
]) {
  if (!styles.includes(value)) failures.push(`styles.css is missing ${value}`);
}

if (portal.includes('buildMatte') || styles.includes('#ascii-matte')) {
  failures.push('The frozen renderer frame must be the only post-entry ASCII substrate');
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`Site structure and frozen-surface continuity contracts OK (${requiredFiles.length} required public files).`);
