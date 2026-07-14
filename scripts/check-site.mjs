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
  'https://carboncaste.io',
  'admin@carboncaste.io',
  'https://rezonance.carboncaste.io',
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
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`Site structure OK (${requiredFiles.length} required public files).`);
