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
  'iceland26/index.html',
  'iceland26/styles.css',
  'iceland26/app.js',
  'iceland26/itinerary.json',
  'iceland26/access.html',
  'iceland26/access.css',
  'iceland26/access.js',
  'server/iceland26-store.mjs',
  'scripts/deploy-a6.sh',
  'scripts/rollback-a6.sh',
  'deploy/a6-promote-release.sh',
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
  'id="portal-enter"',
  'class="portal-enter-label sr-only"',
  'id="surface-site"',
  'id="return-signal"',
  'id="work"',
  'id="company"',
  'id="contact"',
  'styles.css?v=signal-mesh-20260717',
  'dist/portal.js?v=ascii-link-20260717',
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

const icelandIndex = await readFile('iceland26/index.html', 'utf8');
for (const value of [
  'Iceland 2026 — Our shared route',
  'id="participant-select"',
  'id="leg-picker"',
  'id="option-list"',
  'id="consensus"',
  'id="idea-dialog"',
  '/iceland26/styles.css?v=20260726',
  '/iceland26/app.js?v=20260726',
  'noindex, nofollow',
]) {
  if (!icelandIndex.includes(value)) failures.push(`iceland26/index.html is missing ${value}`);
}

const icelandAccess = await readFile('iceland26/access.html', 'utf8');
for (const value of [
  'Enter the Iceland 2026 board',
  'id="access-form"',
  'id="trip-code"',
  '/iceland26/access.css?v=20260726',
  '/iceland26/access.js?v=20260726',
  'noindex, nofollow',
]) {
  if (!icelandAccess.includes(value)) failures.push(`iceland26/access.html is missing ${value}`);
}

const itineraryText = await readFile('iceland26/itinerary.json', 'utf8');
let itinerary;
try {
  itinerary = JSON.parse(itineraryText);
} catch (error) {
  failures.push(`iceland26/itinerary.json is invalid JSON: ${error.message}`);
}
if (itinerary) {
  const options = itinerary.legs?.flatMap((leg) => leg.options || []) || [];
  const ids = options.map((option) => option.id);
  if (itinerary.schemaVersion !== 1) failures.push('Iceland itinerary schemaVersion must be 1');
  if (itinerary.legs?.length < 7) failures.push('Iceland itinerary must cover all seven route chapters');
  if (options.length < 28) failures.push('Iceland itinerary must retain a full route-wide option set');
  if (options.filter((option) => option.standout).length < 8) {
    failures.push('Iceland itinerary must identify the strongest research-backed experiences');
  }
  if (new Set(ids).size !== ids.length) failures.push('Iceland itinerary option IDs must be unique');
  for (const option of options) {
    if (!option.id || !option.title || !option.hook || !Array.isArray(option.sources)) {
      failures.push(`Iceland itinerary option is incomplete: ${option.id || '(missing id)'}`);
    }
    for (const source of option.sources || []) {
      try {
        if (new URL(source.url).protocol !== 'https:') throw new Error('not https');
      } catch {
        failures.push(`Iceland source must be a valid HTTPS URL: ${source.url}`);
      }
    }
    if (option.standout && !option.sources.some((source) => (
      ['guide', 'reviews', 'specialist', 'travel blog', 'travel post', 'travel writing']
        .includes(source.type)
    ))) {
      failures.push(`Research standout lacks independent experience evidence: ${option.id}`);
    }
  }
}

const icelandClient = await readFile('iceland26/app.js', 'utf8');
for (const value of [
  "'/api/iceland26/preference'",
  "'/api/iceland26/comment'",
  "'/api/iceland26/suggestion'",
  'textContent',
  'localStorage',
  'positivePreferences',
  'all four are in',
]) {
  if (!icelandClient.includes(value)) failures.push(`iceland26/app.js is missing ${value}`);
}
if (icelandClient.includes('.innerHTML')) {
  failures.push('Iceland client must not render shared user content with innerHTML');
}

const icelandServer = await readFile('server/static-server.mjs', 'utf8');
for (const value of [
  'ICELAND26_ACCESS_HASH',
  'ICELAND26_SESSION_SECRET',
  "'HttpOnly'",
  "'SameSite=Strict'",
  "'/api/iceland26/login'",
  "'/api/iceland26/logout'",
  'timingSafeEqual',
  'isPublicStaticPath',
  'publicRootFiles',
  'publicIcelandFiles',
]) {
  if (!icelandServer.includes(value)) failures.push(`Iceland server access gate is missing ${value}`);
}

const icelandPublicText = `${icelandIndex}\n${itineraryText}\n${icelandClient}`;
for (const [label, pattern] of [
  ['campsite-style reservation identifier', /\b\d{3}-\d{3}-\d{5}-\d{6}\b/],
  ['private Google Drive URL', /https?:\/\/(?:drive|docs)\.google\.com\//i],
  ['motorhome terms document', /Motorhome Iceland Terms & Conditions/i],
]) {
  if (pattern.test(icelandPublicText)) {
    failures.push(`Iceland public client leaks private planning data: ${label}`);
  }
}

const robots = await readFile('robots.txt', 'utf8');
for (const value of ['Disallow: /iceland26/', 'Disallow: /api/iceland26']) {
  if (!robots.includes(value)) failures.push(`robots.txt is missing ${value}`);
}

const promotionScript = await readFile('deploy/a6-promote-release.sh', 'utf8');
for (const value of [
  'expected_previous',
  'flock -n 9',
  'verify_current_release',
  'test "$(readlink "$current")" = "releases/$commit"',
]) {
  if (!promotionScript.includes(value)) failures.push(`A6 promotion is missing ${value}`);
}

const rollbackScript = await readFile('scripts/rollback-a6.sh', 'utf8');
for (const value of [
  '^[0-9a-f]{40}$',
  'flock -n 9',
  'test "$(cat "$target/REVISION")" = "$target_name"',
  '/api/iceland26/health',
]) {
  if (!rollbackScript.includes(value)) failures.push(`A6 rollback is missing ${value}`);
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
  'FontLoader',
  'TextGeometry',
  'createToroidalMobius',
  'const majorAxis = 1',
  'const minorAxis = 0.125',
  'const pathRadius = 2',
  "document.querySelector('#portal-enter')",
  "new TextGeometry('We found you.'",
  'height: 0.03',
  'const signalStartAngle = -Math.PI / 4',
  'const signalEaseStartAngle = -Math.PI / 6',
  'hermiteEaseToZero',
  'camera.attach(introMesh)',
  'syncLockedSignalScale',
  "'ascii-3d-camera-locked'",
  'geometry.userData.sweep',
  "centerline: 'circle'",
  'twistRadians: Math.PI',
  'maxCenterlineError',
  'const mobiusAxisLocal = new THREE.Vector3(1, 0, 0)',
  'mobiusAxisFrame.rotation.z = Math.PI / 2',
  'mobiusSpinPivot.rotation.x = rotationPhase',
  "portalEnter.addEventListener('click', startDive)",
  'startSignalOrbit',
  'lockSignalToCamera',
  'pickDiveTarget',
  'effect.sampleAt(0.5, 0.5)',
  'applySurfaceTheme',
  '(baseViewHeight / mobiusBaseHeight) * 1.1',
  'side: THREE.DoubleSide',
  'THREE.CubicBezierCurve3',
  'camera.quaternion.slerpQuaternions',
  'value ** 3 * (value * (value * 6 - 15) + 10)',
  "mode = 'site'",
  'restoreIntro',
  "event.code === 'Space'",
  "event.key === '['",
  "addEventListener('dblclick'",
  'raycaster.intersectObject',
]) {
  if (!portal.includes(value)) failures.push(`src/portal.js is missing interaction contract ${value}`);
}

if (portal.includes('makeText(') || portal.includes('signalHandoff')) {
  failures.push('We found you must remain the same ASCII 3D mesh after it becomes the link');
}

if (/mobiusSpinPivot\.rotation\.(?:y|z)\s*=/.test(portal)) {
  failures.push('The Mobius animation must rotate only around the authored local-X ellipse centerline');
}

const styles = await readFile('styles.css', 'utf8');
for (const value of [
  '#ascii-stage',
  '#ascii table',
  '.portal-enter',
  '.portal-enter-label',
  '.is-signal-ready .portal-enter',
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

if (/translateZ|rotateX|rotateY|perspective\s*:/.test(styles)) {
  failures.push('The viewport-locked text must not use CSS depth or 3D transforms');
}

if (portal.includes('buildMatte') || styles.includes('#ascii-matte')) {
  failures.push('The frozen renderer frame must be the only post-entry ASCII substrate');
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`Site structure and frozen-surface continuity contracts OK (${requiredFiles.length} required public files).`);
