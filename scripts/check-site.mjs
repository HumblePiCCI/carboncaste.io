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
  'id="semantic-content"',
  'styles.css?v=mobcon-20260714',
  'dist/portal.js?v=mobcon-20260714',
  'privacy.html',
  'terms.html',
  'contact.html',
]) {
  if (!index.includes(value)) failures.push(`index.html is missing ${value}`);
}

for (const forbidden of ['class="site-header"', 'class="surface-content"', 'class="control-dock"']) {
  if (index.includes(forbidden)) failures.push(`index.html must keep first load immersive; found ${forbidden}`);
}

for (const file of ['privacy.html', 'terms.html', 'contact.html']) {
  const content = await readFile(file, 'utf8');
  if (!content.includes('Carbon Caste Inc.')) failures.push(`${file} is missing the legal entity name`);
  if (!content.includes('admin@carboncaste.io')) failures.push(`${file} is missing the company email`);
  if (!content.includes('class="legal-page"')) failures.push(`${file} is missing the shared ASCII page shell`);
  if (!content.includes('styles.css?v=mobcon-20260714')) failures.push(`${file} is missing the current stylesheet version`);
}

const effect = await readFile('src/CspAsciiEffect.js', 'utf8');
if (/style\s*=/.test(effect) || /\.style\./.test(effect)) {
  failures.push('CspAsciiEffect.js must not emit inline styles blocked by the production CSP');
}
for (const value of ['class="${nextClass}"', 'colorClass(red, green, blue)', "table.innerHTML"]) {
  if (!effect.includes(value)) failures.push(`CspAsciiEffect.js is missing ${value}`);
}

const portal = await readFile('src/portal.js', 'utf8');
for (const value of [
  'OrbitControls',
  'TextGeometry',
  'createToroidalMobius',
  "makeText('We found you.'",
  "startTransition('enter')",
  "mode === 'directory'",
  "event.code === 'Space'",
  "event.key === '['",
  "addEventListener('dblclick'",
  'raycaster.intersectObjects',
]) {
  if (!portal.includes(value)) failures.push(`src/portal.js is missing interaction contract ${value}`);
}

const styles = await readFile('styles.css', 'utf8');
for (const value of ['#ascii-stage', '#ascii table', '.ac-0', '.sr-only', '.legal-aside::before']) {
  if (!styles.includes(value)) failures.push(`styles.css is missing ${value}`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`Site structure and interaction contracts OK (${requiredFiles.length} required public files).`);
