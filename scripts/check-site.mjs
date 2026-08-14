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
  'iceland26/map-data.json',
  'iceland26/bonus-stores.json',
  'iceland26/camping-card-sites.json',
  'iceland26/access.html',
  'iceland26/access.css',
  'iceland26/access.js',
  'iceland26/media/hellulaug.webp',
  'iceland26/media/hraunfossar.webp',
  'iceland26/media/raudasandur.webp',
  'iceland26/media/latrabjarg.webp',
  'iceland26/media/dynjandi.webp',
  'iceland26/media/hverir.webp',
  'iceland26/media/hverfjall.webp',
  'iceland26/media/studlagil.webp',
  'iceland26/media/seydisfjordur.webp',
  'iceland26/media/stokksnes.webp',
  'iceland26/media/jokulsarlon.webp',
  'iceland26/media/eldhraun.webp',
  'iceland26/media/reynisfjara.webp',
  'iceland26/media/dyrholaey.webp',
  'iceland26/media/skogafoss.webp',
  'server/iceland26-store.mjs',
  'docs/iceland26-route-methodology.md',
  'docs/iceland26-bonus-store-census.md',
  'docs/iceland26-camping-card-census.md',
  'docs/root-interaction-gate-diagnosis-2026-08-09.md',
  'scripts/build-iceland26-itinerary.mjs',
  'scripts/build-iceland26-map-data.mjs',
  'scripts/iceland26-route-data-test.mjs',
  'scripts/a6-owned-cleanup.mjs',
  'scripts/a6-owned-cleanup-test.mjs',
  'scripts/a6-locked-run.mjs',
  'scripts/a6-locked-run-test.mjs',
  'scripts/a6-owned-write.mjs',
  'scripts/a6-owned-write-test.mjs',
  'scripts/deploy-a6.sh',
  'scripts/release-tree-test.mjs',
  'scripts/rollback-a6.sh',
  'scripts/verify-release-tree.mjs',
  'deploy/a6-promote-release.sh',
  '.github/workflows/release-custody.yml',
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
  '4381 Highway 504, Apsley, ON K0L 1A0, Canada',
  'Federal corporation 1030840-4',
  'D-U-N-S 240388612',
  'https://rezonance.carboncaste.io',
  'id="ascii-stage"',
  'id="ascii-scene"',
  'id="loop-loader"',
  'id="loop-load-progress"',
  'id="portal-enter"',
  'class="portal-enter-label sr-only"',
  'id="surface-site"',
  'id="return-signal"',
  'id="work"',
  'id="company"',
  'id="contact"',
  'styles.css?v=load-gate-20260728',
  'dist/portal.js?v=load-gate-20260728',
  'privacy.html',
  'terms.html',
  'contact.html',
]) {
  if (!index.includes(value)) failures.push(`index.html is missing ${value}`);
}

if (/id="surface-site"[^>]*\shidden(?:\s|>)/.test(index)) {
  failures.push('index.html must expose the corporate site to public review without a splash-screen gate');
}
if (index.includes('class="organization-profile"')) {
  failures.push('index.html must not add a splash-screen organization profile');
}
if (index.includes('id="ascii-matte"')) {
  failures.push('index.html must not replace the final renderer frame with a synthetic matte');
}

for (const file of ['privacy.html', 'terms.html', 'contact.html']) {
  const content = await readFile(file, 'utf8');
  if (!content.includes('Carbon Caste Inc.')) failures.push(`${file} is missing the legal entity name`);
  if (!content.includes('admin@carboncaste.io')) failures.push(`${file} is missing the company email`);
  if (!content.includes('APSLEY / ONTARIO / CANADA')) failures.push(`${file} is missing the legal-location footer`);
  if (!content.includes('class="legal-page"')) failures.push(`${file} is missing the shared ASCII page shell`);
}

const icelandIndex = await readFile('iceland26/index.html', 'utf8');
for (const value of [
  'Iceland 2026 — Route room',
  'id="participant-select"',
  'id="day-scrubber"',
  'id="date-track"',
  'id="route-map-svg"',
  'id="place-panel"',
  'id="map-story-card"',
  'id="map-story-content"',
  'id="decisions"',
  'id="trip-ops"',
  'id="idea-dialog"',
  '/iceland26/styles.css?v=20260814-camping-card-current-trip',
  '/iceland26/app.js?v=20260814-camping-card-current-trip',
  'id="bonus-layer-toggle"',
  'id="camping-card-layer-toggle"',
  'id="camping-card-scope"',
  'id="current-trip-state"',
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
  if (itinerary.schemaVersion !== 2) failures.push('Iceland itinerary schemaVersion must be 2');
  if (itinerary.days?.length !== 17) failures.push('Iceland itinerary must expose all 17 dated trip days');
  const expectedDates = Array.from({ length: 17 }, (_, index) => (
    `2026-08-${String(index + 8).padStart(2, '0')}`
  ));
  if (itinerary.days?.some((day, index) => day.date !== expectedDates[index])) {
    failures.push('Iceland itinerary days must run in exact date order from August 8 through 24');
  }
  if (itinerary.days?.some((day, index, days) => (
    !day.id || !day.title || !day.state || !Array.isArray(day.stopIds)
      || !Number.isFinite(day.progress) || !day.route
      || (index > 0 && day.progress < days[index - 1].progress)
  ))) {
    failures.push('Iceland itinerary dated route records are incomplete or non-monotonic');
  }
  if (itinerary.legs?.length < 7) failures.push('Iceland itinerary must cover all seven route chapters');
  if (options.length < 28) failures.push('Iceland itinerary must retain a full route-wide option set');
  if (options.filter((option) => option.standout).length < 8) {
    failures.push('Iceland itinerary must identify the strongest research-backed experiences');
  }
  if (new Set(ids).size !== ids.length) failures.push('Iceland itinerary option IDs must be unique');
  for (const option of options) {
    if (!option.id || !option.title || !option.hook || !option.status
        || !Array.isArray(option.sources) || option.sources.length === 0
        || !Array.isArray(option.dayIds)
        || !option.visit || !option.family || !Array.isArray(option.pros)
        || !Array.isArray(option.drawbacks)) {
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
  for (const preservedId of [
    'arrival-bjarkalundur',
    'dynjandi',
    'eclipse-patreksfjordur',
    'studlagil',
    'jokulsarlon-boat',
    'heimaey-puffin-volcano',
    'departure',
    'asbyrgi',
    'husavik-whale-watching',
    'dalfjall-hike',
    'herjolfsdalur-camping',
    'hverfjall',
    'djupivogur',
    'gullfoss',
    'thingvellir',
  ]) {
    if (!ids.includes(preservedId)) failures.push(`Iceland itinerary lost stable option ID: ${preservedId}`);
  }
  const archivedSnaefellsnes = itinerary.archivedSourceDecisions?.find(
    (record) => record.id === 'snaefellsnes-ruled-out',
  );
  if (!archivedSnaefellsnes
      || archivedSnaefellsnes.status !== 'ruled-out'
      || !Array.isArray(archivedSnaefellsnes.items)
      || archivedSnaefellsnes.items.length < 7
      || !archivedSnaefellsnes.items.some((item) => /advance-booking inquiry was sent by email/i.test(item))
      || ids.includes(archivedSnaefellsnes.id)
      || itinerary.days?.some((day) => day.stopIds.includes(archivedSnaefellsnes.id))) {
    failures.push('Iceland itinerary must preserve struck-through Snæfellsnes as a complete read-only source decision');
  }
  if (itineraryText.includes('icelagoon.com')
      || !itineraryText.includes('https://icelagoon.is/faq/is-it-possible-to-take-children-on-board-of-the-boats/')) {
    failures.push('Iceland itinerary must use the selected Jökulsárlón operator\'s own child-policy evidence');
  }
  if (!Array.isArray(itinerary.decisions) || itinerary.decisions.length < 6) {
    failures.push('Iceland itinerary must expose the ordered logistics decision queue');
  }
  if (!Array.isArray(itinerary.operations) || itinerary.operations.length < 5) {
    failures.push('Iceland itinerary must preserve practical trip operations');
  }
  const currentState = itinerary.trip?.currentState;
  const currentDay = itinerary.days?.find((day) => day.id === currentState?.dayId);
  if (currentState?.asOf !== '2026-08-13'
      || currentState?.status !== 'checked-in'
      || currentState?.currentPlaceId !== 'hamrar-campsite'
      || currentState?.currentPlaceIsCampingCardSite !== false
      || !currentDay?.stopIds?.includes('hamrar-campsite')) {
    failures.push('Iceland itinerary must open on the traveller-confirmed August 13 Hamrar check-in');
  }
  if (itinerary.methodology?.sourceDocumentSha256
      !== 'f961d86b89d5a546f7d5d988f74c729a67c51139ab6ef151a2a2ce19d5702953') {
    failures.push('Iceland itinerary is not pinned to the revised source document');
  }
}

const mapDataText = await readFile('iceland26/map-data.json', 'utf8');
let mapData;
try {
  mapData = JSON.parse(mapDataText);
} catch (error) {
  failures.push(`iceland26/map-data.json is invalid JSON: ${error.message}`);
}

const bonusStoresText = await readFile('iceland26/bonus-stores.json', 'utf8');
const campingCardText = await readFile('iceland26/camping-card-sites.json', 'utf8');
let campingCardData;
try {
  campingCardData = JSON.parse(campingCardText);
} catch (error) {
  failures.push(`iceland26/camping-card-sites.json is invalid JSON: ${error.message}`);
}
if (campingCardData) {
  const sites = campingCardData.sites || [];
  const ids = sites.map((site) => site.id);
  if (campingCardData.schemaVersion !== 1) failures.push('Camping Card census schemaVersion must be 1');
  if (campingCardData.officialInventory?.siteCount !== 30 || sites.length !== 30) {
    failures.push('Camping Card census must preserve the exact official 30-site 2026 roster');
  }
  if (new Set(ids).size !== sites.length || sites.some((site) => !site.id?.startsWith('camping-card-'))) {
    failures.push('Camping Card census IDs must be unique and namespaced');
  }
  if (sites.filter((site) => site.routeFit === 'direct').length !== 7
      || sites.filter((site) => site.routeFit === 'conditional').length !== 8
      || sites.filter((site) => site.routeFit === 'behind-current-route').length !== 15) {
    failures.push('Camping Card route fit must remain 7 direct, 8 conditional, and 15 outside the current route');
  }
  if (sites.some((site) => /hamrar/i.test(site.name))) {
    failures.push('Hamrar must not be misrepresented as a Camping Card campsite');
  }
  if (campingCardData.passStatus?.orderedAhead !== true
      || campingCardData.passStatus?.source !== 'Traveller update'
      || campingCardData.passStatus?.cardCountRecorded !== 2) {
    failures.push('Camping Card order status must preserve the traveller-reported two-pass order');
  }
  if (campingCardData.officialInventory?.coordinateAudit?.verifiedSites !== 30
      || campingCardData.officialInventory?.coordinateAudit?.materialCorrectionsOver250m !== 20
      || campingCardData.officialInventory?.coordinateAudit?.toleranceMeters !== 250
      || !/Guidance or Navigation destination/.test(
        campingCardData.officialInventory?.coordinateMethod || '',
      )) {
    failures.push('Camping Card coordinates must retain the complete official Guidance-destination audit');
  }
  for (const site of sites) {
    if (!site.included || !site.rendered || !site.name || !site.officialUrl?.startsWith('https://')
        || !Number.isFinite(site.map?.lat) || !Number.isFinite(site.map?.lng)
        || !site.nearestDayId || !site.nearestSegment || !site.routeRelation
        || !Array.isArray(site.amenities) || !Array.isArray(site.phones)) {
      failures.push(`Camping Card site is incomplete: ${site.id || '(missing id)'}`);
    }
  }
}
if (mapData) {
  if (mapData.schemaVersion !== 1) failures.push('Iceland map data schemaVersion must be 1');
  if (mapData.sourceDocumentSha256
      !== 'f961d86b89d5a546f7d5d988f74c729a67c51139ab6ef151a2a2ce19d5702953') {
    failures.push('Iceland map data is not pinned to the revised source document');
  }
  if (!Array.isArray(mapData.boundary) || !mapData.boundary.length) {
    failures.push('Iceland map data must include a local coastline');
  }
  if (!Array.isArray(mapData.routes) || mapData.routes.length < 12) {
    failures.push('Iceland map data must include route-wide daily geometry');
  }
  for (const route of mapData.routes || []) {
    if (!route.id || !['locked', 'working', 'conditional', 'historical', 'branch'].includes(route.state)
        || !Array.isArray(route.dayIds) || !Array.isArray(route.points)
        || route.points.length < 2) {
      failures.push(`Iceland map route is incomplete: ${route.id || '(missing id)'}`);
      continue;
    }
    for (const point of route.points) {
      if (!Array.isArray(point) || point.length !== 2
          || !Number.isFinite(point[0]) || !Number.isFinite(point[1])
          || point[0] < -25.5 || point[0] > -12.5
          || point[1] < 63 || point[1] > 67.5) {
        failures.push(`Iceland map route has an invalid coordinate: ${route.id}`);
        break;
      }
    }
  }
}

const icelandClient = await readFile('iceland26/app.js', 'utf8');
for (const value of [
  "'/api/iceland26/preference'",
  "'/api/iceland26/comment'",
  "'/api/iceland26/suggestion'",
  "'/iceland26/map-data.json'",
  "'/iceland26/bonus-stores.json'",
  "'/iceland26/camping-card-sites.json'",
  'textContent',
  'localStorage',
  'all four are in',
  'createElementNS',
  'requestAnimationFrame',
  'prefers-reduced-motion',
  'commentDrafts',
  'pendingPreferenceOptions',
  'archivedSourceDecisions',
  'map-marker__touch',
  'placeMediaByOption',
  'renderMapStory',
  "'/iceland26/media/hellulaug.webp'",
  "'/iceland26/media/dynjandi.webp'",
  'Planning-document image · not a live conditions view.',
  'noreferrer noopener',
]) {
  if (!icelandClient.includes(value)) failures.push(`iceland26/app.js is missing ${value}`);
}
if (icelandClient.includes('.innerHTML')) {
  failures.push('Iceland client must not render shared user content with innerHTML');
}
if (icelandClient.includes("option.id === 'hamrar-campsite'")) {
  failures.push('Iceland client must derive current-place presentation from currentState, not a Hamrar ID special case');
}
if (/parseDate\(currentState\.asOf\)\?\.toLocaleDateString\([\s\S]{0,180}timeZone/.test(icelandClient)) {
  failures.push('Iceland current-state date must remain a browser-local date-only value without cross-zone rollover');
}

const mapGenerator = await readFile('scripts/build-iceland26-map-data.mjs', 'utf8');
if (!/redirect:\s*["']error["']/.test(mapGenerator)
    || !/response\.url[\s\S]*?new URL\(url\)\.origin/.test(mapGenerator)
    || /loopbackHosts\s*=\s*new Set\([^)]*["']localhost["']/.test(mapGenerator)) {
  failures.push('Iceland route generator must reject redirects, verify response origin, and use literal loopback hosts only');
}

const icelandServer = await readFile('server/static-server.mjs', 'utf8');
for (const value of [
  'ICELAND26_ACCESS_HASH',
  'ICELAND26_SESSION_SECRET',
  'ICELAND26_INSTANCE_NONCE',
  "'HttpOnly'",
  "'SameSite=Strict'",
  "'/api/iceland26/login'",
  "'/api/iceland26/logout'",
  'timingSafeEqual',
  'isPublicStaticPath',
  'publicRootFiles',
  'publicIcelandFiles',
  "'/iceland26/bonus-stores.json'",
  "'/iceland26/camping-card-sites.json'",
  "['.webp', 'image/webp']",
  "path.startsWith('/iceland26/media/') && path.endsWith('.webp')",
  'leg.options.filter((option) => option.active !== false)',
]) {
  if (!icelandServer.includes(value)) failures.push(`Iceland server access gate is missing ${value}`);
}

const icelandPublicText = `${icelandIndex}\n${itineraryText}\n${mapDataText}\n${bonusStoresText}\n${campingCardText}\n${icelandClient}`;
for (const [label, pattern] of [
  ['campsite-style reservation identifier', /\b\d{3}-\d{3}-\d{5}-\d{6}\b/],
  ['named reservation or confirmation identifier', /\b(?:reservation|confirmation)\s+(?:id\b|number\b|#)\s*[:#]?\s*[A-Z0-9][A-Z0-9-]{5,}\b/i],
  ['private Google Drive URL', /https?:\/\/(?:drive|docs)\.google\.com\//i],
  ['local user filesystem path', /\/Users\/[A-Za-z0-9._-]+\//],
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
  'expected_verifier_sha',
  'expected_cleanup_helper_sha',
  'expected_write_helper_sha',
  'expected_lock_helper_sha',
  'exact_line_file',
  'create_exact_line_no_replace',
  'cleanup_internal_directory',
  'cleanup_helper_proc="/proc/${BASHPID}/fd/$cleanup_helper_fd"',
  '"$node_bin" --input-type=module -',
  'cleanup_helper_source="$(cat "$cleanup_helper_proc")"',
  'write_helper_proc="/proc/${BASHPID}/fd/$write_helper_fd"',
  'write_helper_eval=',
  'verifier_eval=',
  'deploy_lock_is_exact',
  'deployment_roots_are_exact',
  'flock -n 3',
  'wait_for_runtime',
  'local deadline=$((SECONDS + 10))',
  'systemctl_bounded',
  'timeout --signal=TERM --kill-after=1s 6s',
  'previous_has_iceland',
  'assert_incoming_owned',
  'verify_release_tree',
  'verify_release_receipts',
  'assert_release_read_only',
  'verify_current_release',
  'task-owned promotion artifacts could not be fully cleaned',
  'task-owned migration artifacts could not be fully cleaned',
  'ICELAND26_INSTANCE_NONCE="$owner_token"',
  'exit 71',
  'test "$(readlink "$current")" = "releases/$commit"',
]) {
  if (!promotionScript.includes(value)) failures.push(`A6 promotion is missing ${value}`);
}
if (/exec\s+9[<>]/.test(promotionScript)) {
  failures.push('A6 promotion must receive, not pathname-open, its no-follow deployment lock');
}
if (!/rm -f --[\s\S]{0,700}"\$previous_candidate\/REVISION"/.test(promotionScript)) {
  failures.push('A6 first migration must remove the copied legacy REVISION before its no-clobber receipt write');
}

const packageManifest = JSON.parse(await readFile('package.json', 'utf8'));
const releaseCustodyWorkflow = await readFile(
  '.github/workflows/release-custody.yml',
  'utf8',
);
const releaseCustodyCommand = packageManifest.scripts?.['test:release-custody'] || '';
for (const command of [
  'bash -n scripts/deploy-a6.sh',
  'bash -n deploy/a6-promote-release.sh',
  'bash -n scripts/rollback-a6.sh',
]) {
  if (!releaseCustodyCommand.includes(command)) {
    failures.push(`Release custody test must parse ${command.replace('bash -n ', '')} directly`);
  }
}

const deploymentScript = await readFile('scripts/deploy-a6.sh', 'utf8');
const ownedCleanupScript = await readFile('scripts/a6-owned-cleanup.mjs', 'utf8');
const lockedRunScript = await readFile('scripts/a6-locked-run.mjs', 'utf8');
const ownedWriteScript = await readFile('scripts/a6-owned-write.mjs', 'utf8');
if (!releaseCustodyCommand.includes('node scripts/a6-owned-cleanup-test.mjs')) {
  failures.push('Release custody test must run deterministic owned-cleanup race checks');
}
if (!releaseCustodyCommand.includes('node scripts/a6-owned-write-test.mjs')) {
  failures.push('Release custody test must run executable exclusive-write race checks');
}
if (!releaseCustodyCommand.includes('node scripts/a6-locked-run-test.mjs')) {
  failures.push('Release custody test must run executable no-follow lock and root checks');
}
if (!releaseCustodyWorkflow.includes('runs-on: ubuntu-24.04')
    || !releaseCustodyWorkflow.includes('node-version: 22.22.2')
    || !releaseCustodyWorkflow.includes('npm run check')
    || !releaseCustodyWorkflow.includes('npm run test:release-custody')
    || /uses:\s+actions\/(?:checkout|setup-node)@v[0-9]/.test(releaseCustodyWorkflow)) {
  failures.push('Release custody must have a guaranteed GNU/Linux CI lane');
}
if (!deploymentScript.includes('git show "$commit:scripts/a6-owned-cleanup.mjs"')
    || !deploymentScript.includes('cleanup_helper_b64')
    || !deploymentScript.includes('| base64 -d')) {
  failures.push('A6 deployment cleanup must stream the exact committed owned-cleanup helper');
}
if (!deploymentScript.includes("printf '%s\\n' '$owner_token' | cmp -s - .staging-owner")) {
  failures.push('A6 deployment must byte-compare staging ownership receipts');
}
if (deploymentScript.includes('$(cat .staging-owner)')
    || deploymentScript.includes("$(cat '$remote_incoming/.staging-owner')")) {
  failures.push('A6 deployment must not normalize staging ownership receipts through command substitution');
}
for (const [label, pattern] of [
  ['pathname owner-receipt write', /printf[^\n]*>\s*["']?\$?[^ \n]*\.staging-owner/],
  ['pathname manifest upload', /cat\s*>\s*["']?(?:EXPECTED_NEW_TREE_MANIFEST|EXPECTED_PREVIOUS_TREE_MANIFEST)/],
  ['post-create mode mutation', /chmod\s+0600/],
  ['remote recursive create-failure cleanup', /cleanup_created[\s\S]{0,300}rm -rf/],
]) {
  if (pattern.test(deploymentScript)) {
    failures.push(`A6 deployment retains unsafe ${label}`);
  }
}
for (const value of [
  "git show \"$commit:scripts/a6-owned-write.mjs\"",
  'write_helper_eval',
  'remote_owner_identity',
  'new_manifest_sha',
  'previous_manifest_sha',
  "git show \"$commit:scripts/a6-locked-run.mjs\"",
  'lock_helper_eval',
  '"$remote_receipt" =~ ^([0-9]+:[0-9]+)\\ ([0-9]+:[0-9]+)$',
  '--keep-old-files',
]) {
  if (!deploymentScript.includes(value)) {
    failures.push(`A6 deployment exclusive-write custody is missing ${value}`);
  }
}
for (const value of [
  'constants.O_NOFOLLOW',
  'constants.O_DIRECTORY',
  'A6_DEPLOY_LOCK_IDENTITY',
  'A6_DEPLOY_RELEASES_IDENTITY',
  'A6_DEPLOY_ROOT_IDENTITY',
  'runLockedBash',
  'detached: true',
  "process.kill(-child.pid, 'SIGKILL')",
  'process.on(signal, handler)',
  ': 90_000',
]) {
  if (!lockedRunScript.includes(value)) {
    failures.push(`A6 no-follow lock broker is missing ${value}`);
  }
}
for (const value of [
  'quarantinedHandle,',
  'beforeAnchoredDelete',
  "['release', 'candidate', 'legacy']",
  'internal cleanup requires an exact identity',
]) {
  if (!ownedCleanupScript.includes(value)) {
    failures.push(`A6 owned cleanup is missing ${value}`);
  }
}
for (const value of [
  'constants.O_EXCL',
  'constants.O_NOFOLLOW',
  'createOwnedDirectory',
  'writeOwnedFile',
  'afterTargetWrite',
]) {
  if (!ownedWriteScript.includes(value)) {
    failures.push(`A6 owned writer is missing ${value}`);
  }
}

const rollbackScript = await readFile('scripts/rollback-a6.sh', 'utf8');
for (const value of [
  '^[0-9a-f]{40}$',
  'exact_line_file',
  'remote_owner_identity',
  'upload_owned_file',
  'write_helper_eval',
  'lock_helper_eval',
  '"$remote_receipt" =~ ^([0-9]+:[0-9]+)\\ ([0-9]+:[0-9]+)$',
  'deploy_lock_is_exact',
  'deployment_roots_are_exact',
  'flock -n 3',
  'wait_for_runtime',
  'local deadline=$((SECONDS + 10))',
  'systemctl_bounded',
  'timeout --signal=TERM --kill-after=1s 6s',
  'target_has_iceland',
  'current_has_iceland',
  'verify_release "$previous_release"',
  'verify_release "$target"',
  'expected_verifier_sha',
  'CRITICAL: rollback target failed',
  '/api/iceland26/health',
]) {
  if (!rollbackScript.includes(value)) failures.push(`A6 rollback is missing ${value}`);
}
if (/exec\s+9[<>]/.test(rollbackScript)) {
  failures.push('A6 rollback must receive, not pathname-open, its no-follow deployment lock');
}
if (!rollbackScript.includes('git show "$head_commit:scripts/a6-owned-cleanup.mjs"')
    || !rollbackScript.includes('cleanup_helper_b64')
    || !rollbackScript.includes('| base64 -d')) {
  failures.push('A6 rollback cleanup must stream the exact committed owned-cleanup helper');
}
for (const [label, pattern] of [
  ['pathname owner-receipt write', /printf[^\n]*>\s*["']?\$?[^ \n]*\.rollback-owner/],
  ['pathname verifier or manifest upload', /cat\s*>\s*["']?(?:verify-release-tree\.mjs|target\.manifest|current\.manifest)/],
  ['post-create mode mutation', /chmod\s+0(?:400|500|600)/],
  ['inner recursive verification cleanup', /cleanup_verification|chmod -R\s+u\+w/],
]) {
  if (pattern.test(rollbackScript)) {
    failures.push(`A6 rollback retains unsafe ${label}`);
  }
}
if (promotionScript.includes('quarantine_owned_directory')
    || promotionScript.includes('rm -rf')) {
  failures.push('A6 promotion must use only the pinned Node helper for recursive owned cleanup');
}
for (const script of [promotionScript, rollbackScript]) {
  if (/\$\(cat "\$(?:root|current)\/(?:REVISION|RELEASE_TREE)"\)/.test(script)) {
    failures.push('A6 release receipts must be byte-compared rather than normalized through command substitution');
  }
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
  '.loop-loader',
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
