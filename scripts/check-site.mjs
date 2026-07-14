import { readFile } from 'node:fs/promises';

const requiredFiles = [
  'index.html',
  'privacy.html',
  'terms.html',
  'contact.html',
  '404.html',
  'robots.txt',
  'sitemap.xml',
  '.well-known/security.txt',
];

const failures = [];

for (const file of requiredFiles) {
  try {
    const content = await readFile(file, 'utf8');
    if (!content.trim()) failures.push(`${file} is empty`);
  } catch {
    failures.push(`${file} is missing`);
  }
}

const index = await readFile('index.html', 'utf8');
for (const value of [
  'Carbon Caste Inc.',
  'CARBON_CASTE.INC',
  'https://carboncaste.io',
  'admin@carboncaste.io',
  'https://rezonance.carboncaste.io',
  'id="ascii-scene"',
  'class="mobius-fallback"',
  'class="ascii-window product-visual"',
  'styles.css?v=ascii-20260714',
  'main.js?v=ascii-20260714',
  'privacy.html',
  'terms.html',
  'contact.html',
]) {
  if (!index.includes(value)) failures.push(`index.html is missing ${value}`);
}

for (const file of ['privacy.html', 'terms.html', 'contact.html']) {
  const content = await readFile(file, 'utf8');
  if (!content.includes('Carbon Caste Inc.')) failures.push(`${file} is missing the legal entity name`);
  if (!content.includes('admin@carboncaste.io')) failures.push(`${file} is missing the company email`);
  if (!content.includes('class="legal-page"')) failures.push(`${file} is missing the shared ASCII page shell`);
  if (!content.includes('styles.css?v=ascii-20260714')) failures.push(`${file} is missing the versioned stylesheet`);
}

const asciiEffect = await readFile('3jsReqs/AsciiEffect.js', 'utf8');
if (/style\s*=/.test(asciiEffect) || /\.style\./.test(asciiEffect)) {
  failures.push('AsciiEffect.js must not emit inline styles blocked by the production CSP');
}

const styles = await readFile('styles.css', 'utf8');
for (const value of ['#ascii-scene', '#ascii table', '.ascii-window', '.legal-aside::before']) {
  if (!styles.includes(value)) failures.push(`styles.css is missing ${value}`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`Site structure OK (${requiredFiles.length} required public files).`);
