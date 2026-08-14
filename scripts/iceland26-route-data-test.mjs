import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const failures = [];

function fail(message) {
  failures.push(message);
}

function distanceSquared([lng, lat], target) {
  return ((lng - target[0]) ** 2) + ((lat - target[1]) ** 2);
}

function haversineKm([lngA, latA], [lngB, latB]) {
  const radians = (value) => (value * Math.PI) / 180;
  const latitudeDelta = radians(latB - latA);
  const longitudeDelta = radians(lngB - lngA);
  const value = (Math.sin(latitudeDelta / 2) ** 2)
    + (Math.cos(radians(latA)) * Math.cos(radians(latB))
      * (Math.sin(longitudeDelta / 2) ** 2));
  return 2 * 6371 * Math.asin(Math.sqrt(value));
}

function assertRouteWaypointOrder(mapData, routeId, namedTargets) {
  const route = mapData.routes.find((candidate) => candidate.id === routeId);
  if (!route) {
    fail(`${routeId} is missing.`);
    return;
  }
  let searchStart = 0;
  const indices = namedTargets.map(([name, target]) => {
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    route.points.slice(searchStart).forEach((point, relativeIndex) => {
      const index = searchStart + relativeIndex;
      const candidate = distanceSquared(point, target);
      if (candidate < bestDistance) {
        bestDistance = candidate;
        bestIndex = index;
      }
    });
    if (bestDistance > 0.035 ** 2) {
      fail(`${routeId} geometry does not pass close enough to ${name}.`);
    }
    searchStart = Math.min(bestIndex + 1, route.points.length);
    return bestIndex;
  });
  for (let index = 1; index < indices.length; index += 1) {
    if (indices[index] <= indices[index - 1]) {
      fail(`${routeId} is not in geographic order at ${namedTargets[index][0]}.`);
      break;
    }
  }
}

function expectedLegDateLabel(leg) {
  const dayNumbers = leg.options
    .flatMap((option) => option.dayIds || [])
    .map((id) => Number(id.slice(-2)))
    .filter(Number.isFinite);
  if (!dayNumbers.length) return '';
  const first = Math.min(...dayNumbers);
  const last = Math.max(...dayNumbers);
  return first === last ? `Aug ${first}` : `Aug ${first}–${last}`;
}

function projectedDayProgress(mapSnapshot, orderedDays) {
  const { bounds } = mapSnapshot;
  const project = ([lng, lat]) => ({
    x: 55 + (((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 890),
    y: 45 + (((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * 610),
  });
  const points = [];
  const endDistanceByDay = new Map();
  let total = 0;
  mapSnapshot.routes.filter((route) => route.state !== 'branch').forEach((route) => {
    route.points.forEach((coordinate) => {
      const point = project(coordinate);
      const previous = points[points.length - 1];
      if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) <= 0.5) return;
      if (previous) total += Math.hypot(point.x - previous.x, point.y - previous.y);
      points.push(point);
    });
    route.dayIds.forEach((dayId) => endDistanceByDay.set(dayId, total));
  });
  if (!total || !points.length) return {};
  return Object.fromEntries(orderedDays.map((day, index) => [
    day.id,
    index === 0 ? 0 : (endDistanceByDay.get(day.id) ?? 0) / total,
  ]));
}

const itineraryText = await readFile('iceland26/itinerary.json', 'utf8');
const mapText = await readFile('iceland26/map-data.json', 'utf8');
const bonusText = await readFile('iceland26/bonus-stores.json', 'utf8');
const campingCardText = await readFile('iceland26/camping-card-sites.json', 'utf8');
const mapGeneratorText = await readFile('scripts/build-iceland26-map-data.mjs', 'utf8');
const itinerary = JSON.parse(itineraryText);
const mapData = JSON.parse(mapText);
const bonusData = JSON.parse(bonusText);
const campingCardData = JSON.parse(campingCardText);

if (!/redirect:\s*["']error["']/.test(mapGeneratorText)
    || !/response\.url[\s\S]*?\.origin[\s\S]*?new URL\(url\)\.origin/.test(mapGeneratorText)) {
  fail('Map generation must reject redirects and verify that OSRM responses remain on the configured loopback origin.');
}
for (const rejectedBase of ['http://localhost:18129', 'https://router.project-osrm.org']) {
  let rejected = false;
  try {
    execFileSync(process.execPath, [
      'scripts/build-iceland26-map-data.mjs',
      '--config-only',
      '--osrm-base', rejectedBase,
    ], { stdio: 'pipe' });
  } catch {
    rejected = true;
  }
  if (!rejected) {
    fail(`Map generation accepted a non-literal-loopback routing base: ${rejectedBase}`);
  }
}

const regenerationDirectory = mkdtempSync(join(tmpdir(), 'iceland26-itinerary-regeneration-'));
try {
  const firstPath = join(regenerationDirectory, 'first.json');
  const secondPath = join(regenerationDirectory, 'second.json');
  execFileSync(process.execPath, [
    'scripts/build-iceland26-itinerary.mjs',
    '--source', 'iceland26/itinerary.json',
    '--output', firstPath,
  ], { stdio: 'pipe' });
  execFileSync(process.execPath, [
    'scripts/build-iceland26-itinerary.mjs',
    '--source', firstPath,
    '--output', secondPath,
  ], { stdio: 'pipe' });
  const first = await readFile(firstPath, 'utf8');
  const second = await readFile(secondPath, 'utf8');
  if (first !== itineraryText || second !== first) {
    fail('Itinerary generator is not an exact, idempotent regeneration of the v2 artifact.');
  }
} catch (error) {
  fail(`Itinerary regeneration failed: ${error.message}`);
} finally {
  await rm(regenerationDirectory, { recursive: true, force: true });
}

if (itinerary.schemaVersion !== 2) fail('Expected itinerary schemaVersion 2.');
if (mapData.schemaVersion !== 1) fail('Expected map-data schemaVersion 1.');
if (bonusData.schemaVersion !== 1) fail('Expected bonus-stores schemaVersion 1.');
if (campingCardData.schemaVersion !== 1) fail('Expected camping-card-sites schemaVersion 1.');

const expectedBonusStoreIds = [
  'bonus-bjarkarholt',
  'bonus-fiskislod',
  'bonus-gardatorg',
  'bonus-helluhraun',
  'bonus-holtagardar',
  'bonus-hraunbaer',
  'bonus-kauptun',
  'bonus-kjorgardur',
  'bonus-kringlan',
  'bonus-louholar',
  'bonus-midhraun',
  'bonus-nordlingabraut',
  'bonus-nybylavegur',
  'bonus-ogurhvarf',
  'bonus-skeifan',
  'bonus-skipholt',
  'bonus-skutuvogur',
  'bonus-smartorg',
  'bonus-spongin',
  'bonus-tjarnarvellir',
  'bonus-digranesgata',
  'bonus-fitjar',
  'bonus-langholt-akureyri',
  'bonus-larsenstraeti',
  'bonus-midstraeti-vestmannaeyjar',
  'bonus-midvangur-egilsstadir',
  'bonus-naustahverfi-akureyri',
  'bonus-nordurtorg-akureyri',
  'bonus-sunnumork',
  'bonus-tungata-reykjanesbaer',
].sort();
const includedBonusStores = bonusData.stores.filter((store) => store.included);
const excludedBonusStores = bonusData.stores.filter((store) => !store.included);
if (bonusData.officialInventory?.declaredStoreCount !== 33 || bonusData.stores.length !== 33) {
  fail('Bónus census must evaluate all 33 official locations.');
}
if (new Set(bonusData.stores.map((store) => store.id)).size !== bonusData.stores.length) {
  fail('Bónus census IDs must be unique.');
}
if (JSON.stringify(includedBonusStores.map((store) => store.id).sort())
    !== JSON.stringify(expectedBonusStoreIds)) {
  fail('The exact included Bónus store set changed without an audited census update.');
}
if (includedBonusStores.filter((store) => store.routeFit === 'on-route').length !== 14
    || includedBonusStores.filter((store) => store.routeFit === 'short-detour').length !== 16) {
  fail('Bónus inclusion classifications must remain 14 on-route and 16 short-detour.');
}
if (JSON.stringify(excludedBonusStores.map((store) => store.id).sort()) !== JSON.stringify([
  'bonus-borgarbraut-stykkisholmur',
  'bonus-skeidi-isafjordur',
  'bonus-smidjuvellir-akranes',
])) {
  fail('The three audited Bónus exclusions changed.');
}
for (const store of bonusData.stores) {
  if (!store.id?.startsWith('bonus-') || !store.name?.startsWith('Bónus ') || !store.address
      || !Number.isFinite(store.map?.lat) || !Number.isFinite(store.map?.lng)
      || !Number.isFinite(store.minimumRouteOffsetKm) || !store.routeRelation
      || !store.nearestDayId) {
    fail(`${store.id || 'Bónus store'} has incomplete census data.`);
  }
  if (!['on-route', 'short-detour', 'excluded'].includes(store.routeFit)) {
    fail(`${store.id} has an invalid route-fit classification.`);
  }
  if (!store.included && !/^Excluded:/.test(store.routeRelation)) {
    fail(`${store.id} is excluded without a concrete exclusion rationale.`);
  }
  const coordinate = [store.map.lng, store.map.lat];
  const recomputedOffset = Math.min(...mapData.routes
    .flatMap((route) => route.points)
    .map((point) => haversineKm(coordinate, point)));
  if (Math.abs(recomputedOffset - store.minimumRouteOffsetKm) >= 0.005) {
    fail(`${store.id} route offset is not the reproducible rounded Haversine vertex minimum.`);
  }
}

const options = itinerary.legs.flatMap((leg) => leg.options);
const optionIds = new Set(options.map((option) => option.id));
const dayIds = new Set(itinerary.days.map((day) => day.id));
const expectedDayIds = Array.from(
  { length: 17 },
  (_, index) => `day-2026-08-${String(index + 8).padStart(2, '0')}`,
);
if (JSON.stringify(itinerary.days.map((day) => day.id)) !== JSON.stringify(expectedDayIds)) {
  fail('Itinerary must preserve the exact chronological August 8–24 day ledger.');
}
const currentTripState = itinerary.trip?.currentState;
const currentTripDay = itinerary.days.find((day) => day.id === currentTripState?.dayId);
if (JSON.stringify(currentTripState) !== JSON.stringify({
  asOf: '2026-08-13',
  dayId: 'day-2026-08-13',
  currentPlaceId: 'hamrar-campsite',
  status: 'checked-in',
  label: 'Checked in at Camping Hamrar',
  provenance: 'Traveller update',
  currentPlaceIsCampingCardSite: false,
})
    || !currentTripDay?.stopIds?.includes('hamrar-campsite')
    || !currentTripDay.stopIds.includes('kolugljufur')) {
  fail('Traveller-confirmed August 13 current state must be checked in at Hamrar via Kolugljúfur.');
}

const campingCardSites = campingCardData.sites || [];
const expectedCampingCardSiteIds = [
  'camping-card-akranes',
  'camping-card-at-faxi',
  'camping-card-bakkafjordur',
  'camping-card-bolungarvik',
  'camping-card-drangsnes',
  'camping-card-grettislaug-reykholum',
  'camping-card-grundarfjordur',
  'camping-card-husavik',
  'camping-card-kleifarmork',
  'camping-card-kopasker',
  'camping-card-laugarvatn',
  'camping-card-modrudalur-fjalladyrd',
  'camping-card-olafsfjordur',
  'camping-card-patreksfjordur',
  'camping-card-sandgerdi',
  'camping-card-seydisfjordur',
  'camping-card-siglufjordur',
  'camping-card-skjol',
  'camping-card-skagastrond',
  'camping-card-stokkseyri',
  'camping-card-studlagil-canyon',
  'camping-card-svartiskogur',
  'camping-card-talknafjordur',
  'camping-card-thorlakshofn',
  'camping-card-thorshofn',
  'camping-card-tjaldsvaedi-ad-hlodum',
  'camping-card-tjaldsvaedi-kidagils',
  'camping-card-tjaldsvaedid-budardalur',
  'camping-card-tjaldvaedid-bragdavollum',
  'camping-card-tungudalur',
].sort();
if (campingCardData.officialInventory?.siteCount !== 30 || campingCardSites.length !== 30) {
  fail('Camping Card census must preserve the exact 30-site official 2026 roster.');
}
if (JSON.stringify(campingCardData.officialInventory?.coordinateAudit) !== JSON.stringify({
  verifiedSites: 30,
  materialCorrectionsOver250m: 20,
  toleranceMeters: 250,
})
    || !/Guidance or Navigation destination/.test(
      campingCardData.officialInventory?.coordinateMethod || '',
    )
    || !/Embedded map camera centers are deliberately ignored/.test(
      campingCardData.officialInventory?.coordinateMethod || '',
    )) {
  fail('Camping Card coordinates must retain the complete official-destination audit receipt.');
}
if (JSON.stringify(campingCardSites.map((site) => site.id).sort())
    !== JSON.stringify(expectedCampingCardSiteIds)) {
  fail('The exact official 2026 Camping Card site roster changed without a census update.');
}
if (new Set(campingCardSites.map((site) => site.id)).size !== campingCardSites.length
    || campingCardSites.some((site) => !site.id?.startsWith('camping-card-'))) {
  fail('Camping Card census IDs must be unique and use the camping-card namespace.');
}
if (campingCardSites.filter((site) => site.routeFit === 'direct').length !== 7
    || campingCardSites.filter((site) => site.routeFit === 'conditional').length !== 8
    || campingCardSites.filter((site) => site.routeFit === 'behind-current-route').length !== 15) {
  fail('Camping Card route fit must remain 7 direct, 8 conditional, and 15 outside the current route.');
}
if (campingCardSites.some((site) => /hamrar/i.test(site.name))) {
  fail('Hamrar is the current stay but is not in the official Camping Card roster.');
}
if (campingCardData.passRules?.maximumNightsPerCard !== 28
    || campingCardData.passRules?.campingUnitsPerCard !== 1
    || campingCardData.passRules?.lodgingTaxIskPerUnitNight !== 400
    || campingCardData.passRules?.taxIncluded !== false
    || campingCardData.passRules?.capacityPriority !== false) {
  fail('Camping Card coverage limits, nightly tax, and no-capacity-priority caveats drifted.');
}
if (campingCardData.passStatus?.orderedAhead !== true
    || campingCardData.passStatus?.asOfDate !== '2026-08-13'
    || campingCardData.passStatus?.source !== 'Traveller update'
    || campingCardData.passStatus?.cardCountRecorded !== 2) {
  fail('Camping Card status must preserve the traveller-reported two-pass advance order without inventing card assignment.');
}
for (const site of campingCardSites) {
  if (!site.included || !site.rendered || !site.name || !site.officialUrl?.startsWith('https://')
      || !Array.isArray(site.phones) || !site.phones.length
      || !Number.isFinite(site.map?.lat) || !Number.isFinite(site.map?.lng)
      || site.map.lng < mapData.bounds.minLng || site.map.lng > mapData.bounds.maxLng
      || site.map.lat < mapData.bounds.minLat || site.map.lat > mapData.bounds.maxLat
      || !dayIds.has(site.nearestDayId) || !site.nearestSegment || !site.routeRelation
      || !site.season2026?.opens || !site.season2026?.closes
      || !Array.isArray(site.amenities)) {
    fail(`${site.id || 'Camping Card site'} has incomplete or invalid audited data.`);
  }
}
for (const [siteId, routeFit, nearestDayId] of [
  ['camping-card-akranes', 'behind-current-route', 'day-2026-08-09'],
  ['camping-card-grundarfjordur', 'behind-current-route', 'day-2026-08-09'],
  ['camping-card-tjaldsvaedid-budardalur', 'behind-current-route', 'day-2026-08-09'],
  ['camping-card-tjaldsvaedi-ad-hlodum', 'behind-current-route', 'day-2026-08-09'],
  ['camping-card-bolungarvik', 'behind-current-route', 'day-2026-08-11'],
  ['camping-card-drangsnes', 'behind-current-route', 'day-2026-08-13'],
  ['camping-card-grettislaug-reykholum', 'behind-current-route', 'day-2026-08-12'],
  ['camping-card-patreksfjordur', 'behind-current-route', 'day-2026-08-10'],
  ['camping-card-talknafjordur', 'behind-current-route', 'day-2026-08-10'],
  ['camping-card-tungudalur', 'behind-current-route', 'day-2026-08-11'],
  ['camping-card-bakkafjordur', 'behind-current-route', 'day-2026-08-14'],
  ['camping-card-husavik', 'conditional', 'day-2026-08-14'],
  ['camping-card-kopasker', 'conditional', 'day-2026-08-14'],
  ['camping-card-modrudalur-fjalladyrd', 'conditional', 'day-2026-08-17'],
  ['camping-card-olafsfjordur', 'behind-current-route', 'day-2026-08-13'],
  ['camping-card-siglufjordur', 'behind-current-route', 'day-2026-08-13'],
  ['camping-card-skagastrond', 'behind-current-route', 'day-2026-08-13'],
  ['camping-card-tjaldsvaedi-kidagils', 'conditional', 'day-2026-08-14'],
  ['camping-card-thorshofn', 'behind-current-route', 'day-2026-08-14'],
  ['camping-card-seydisfjordur', 'direct', 'day-2026-08-17'],
  ['camping-card-studlagil-canyon', 'direct', 'day-2026-08-17'],
  ['camping-card-svartiskogur', 'conditional', 'day-2026-08-17'],
  ['camping-card-tjaldvaedid-bragdavollum', 'direct', 'day-2026-08-19'],
  ['camping-card-kleifarmork', 'direct', 'day-2026-08-20'],
  ['camping-card-laugarvatn', 'direct', 'day-2026-08-21'],
  ['camping-card-sandgerdi', 'conditional', 'day-2026-08-23'],
  ['camping-card-skjol', 'direct', 'day-2026-08-21'],
  ['camping-card-stokkseyri', 'conditional', 'day-2026-08-21'],
  ['camping-card-at-faxi', 'direct', 'day-2026-08-21'],
  ['camping-card-thorlakshofn', 'conditional', 'day-2026-08-23'],
]) {
  const site = campingCardSites.find((candidate) => candidate.id === siteId);
  if (!site || site.routeFit !== routeFit || site.nearestDayId !== nearestDayId) {
    fail(`${siteId} does not match the reconciled remaining-route day and route-fit classification.`);
  }
}
for (const [siteId, lat, lng] of [
  ['camping-card-akranes', 64.3260608, -22.0675448],
  ['camping-card-grundarfjordur', 64.9205891, -23.2581586],
  ['camping-card-drangsnes', 65.6915253, -21.4430231],
  ['camping-card-grettislaug-reykholum', 65.4462459, -22.2016929],
  ['camping-card-patreksfjordur', 65.5917625, -23.9743152],
  ['camping-card-talknafjordur', 65.6293544, -23.8467246],
  ['camping-card-tungudalur', 66.0605106, -23.2039081],
  ['camping-card-bakkafjordur', 66.0368958, -14.8029323],
  ['camping-card-kopasker', 66.301227, -16.4433511],
  ['camping-card-modrudalur-fjalladyrd', 65.3727079, -15.8817773],
  ['camping-card-olafsfjordur', 66.0711856, -18.6489324],
  ['camping-card-siglufjordur', 66.1483136, -18.9054009],
  ['camping-card-skagastrond', 65.8258532, -20.2928964],
  ['camping-card-tjaldsvaedi-kidagils', 65.5021807, -17.4559447],
  ['camping-card-thorshofn', 66.1986128, -15.3283848],
  ['camping-card-seydisfjordur', 65.2604585, -14.0111549],
  ['camping-card-kleifarmork', 63.8010833, -18.0572174],
  ['camping-card-skjol', 64.3111758, -20.233818],
  ['camping-card-stokkseyri', 63.8363287, -21.0543971],
  ['camping-card-thorlakshofn', 63.8525768, -21.3799288],
]) {
  const site = campingCardSites.find((candidate) => candidate.id === siteId);
  if (site?.map?.lat !== lat || site?.map?.lng !== lng) {
    fail(`${siteId} no longer uses its audited official Guidance destination.`);
  }
}
const allNamespaces = [
  ...options.map((option) => option.id),
  ...bonusData.stores.map((store) => store.id),
  ...campingCardSites.map((site) => site.id),
];
if (new Set(allNamespaces).size !== allNamespaces.length) {
  fail('Itinerary, Bónus, and Camping Card IDs must never collide.');
}

for (const store of bonusData.stores) {
  if (!dayIds.has(store.nearestDayId)) fail(`${store.id} names unknown day ${store.nearestDayId}.`);
}

for (const day of itinerary.days) {
  for (const stopId of day.stopIds) {
    if (!optionIds.has(stopId)) fail(`${day.id} names unknown stop ${stopId}.`);
  }
  if (Number.isFinite(day.route?.baseMinutes)
      && Number.isFinite(day.route?.camperMinutes)
      && day.route.camperMinutes < day.route.baseMinutes) {
    fail(`${day.id} motorhome plan is shorter than its road baseline.`);
  }
}

const recomputedDayProgress = projectedDayProgress(mapData, itinerary.days);
for (const day of itinerary.days) {
  const recomputed = recomputedDayProgress[day.id];
  const mapped = mapData.dayProgress?.[day.id];
  if (!Number.isFinite(mapped) || Math.abs(mapped - recomputed) > 1e-11) {
    fail(`${day.id} map progress does not match its projected non-branch route endpoint.`);
  }
  if (!Number.isFinite(day.progress) || day.progress !== mapped
      || Math.abs(day.progress - recomputed) > 1e-11) {
    fail(`${day.id} itinerary progress would place the campers away from the dated route endpoint.`);
  }
}

for (const option of options) {
  if (!Array.isArray(option.sources) || option.sources.length === 0) {
    fail(`${option.id} has no evidence source.`);
  }
  for (const dayId of option.dayIds) {
    if (!dayIds.has(dayId)) fail(`${option.id} names unknown day ${dayId}.`);
  }
  if (option.map) {
    if (!Number.isFinite(option.map.lng) || !Number.isFinite(option.map.lat)
        || option.map.lng < mapData.bounds.minLng || option.map.lng > mapData.bounds.maxLng
        || option.map.lat < mapData.bounds.minLat || option.map.lat > mapData.bounds.maxLat) {
      fail(`${option.id} has a map pin outside the declared bounds.`);
    }
  }
}

for (const leg of itinerary.legs) {
  const expectedDates = expectedLegDateLabel(leg);
  if (!expectedDates || leg.dates !== expectedDates) {
    fail(`${leg.id} date label ${JSON.stringify(leg.dates)} does not cover its option days; expected ${JSON.stringify(expectedDates)}.`);
  }
}

for (const route of mapData.routes) {
  for (const dayId of route.dayIds) {
    if (!dayIds.has(dayId)) fail(`${route.id} names unknown day ${dayId}.`);
  }
  if (route.points.length < 2) fail(`${route.id} has fewer than two route points.`);
  if (route.points.some((point) => (
    point[0] < mapData.bounds.minLng || point[0] > mapData.bounds.maxLng
      || point[1] < mapData.bounds.minLat || point[1] > mapData.bounds.maxLat
  ))) {
    fail(`${route.id} has geometry outside the declared bounds.`);
  }
}

const expectedActiveOptionIds = [
  'arrival-bjarkalundur',
  'asbyrgi',
  'asbyrgi-campsite',
  'beluga-sanctuary',
  'borgarfjordur-eystri',
  'borgarfjordur-waterfalls',
  'dalfjall-hike',
  'departure',
  'dettifoss-selfoss',
  'dimmuborgir',
  'djupivogur',
  'djupivogur-stokksnes',
  'dynjandi',
  'dyrholaey',
  'earth-lagoon',
  'fjadrargljufur-eldhraun',
  'glacier-hike',
  'godafoss',
  'golden-circle-core',
  'grjotagja',
  'gufufoss',
  'gullfoss',
  'hamrar-campsite',
  'heimaey-puffin-volcano',
  'hellulaug-coast',
  'herjolfsdalur-camping',
  'hljodaklettar',
  'hofdi-kalfastrond',
  'husavik-town-stop',
  'hverfjall',
  'hverir-hverfjall',
  'jokulsarlon-boat',
  'kolugljufur',
  'krafla-leirhnjukur',
  'krafla-viti',
  'myvatn-camp',
  'outbound-flight',
  'perlan',
  'reykjadalur',
  'reykjavik-pools',
  'reynisfjara',
  'seljalandsfoss-gljufrabui',
  'seydisfjordur',
  'silfra-split',
  'skogafoss-waterfall-way',
  'skutustadagigar',
  'sky-lagoon',
  'studlagil',
  'thingvellir',
  'weather-buffer',
].sort();
const removedFromLatestPlan = [
  'latrabjarg-raudasandur',
  'raudasandur',
  'eclipse-patreksfjordur',
  'eclipse-arngerdareyri',
  'hvitserkur-skagafjordur',
  'hauganes-whales',
  'husavik-whale-watching',
].sort();
const activeOptionIds = options.filter((option) => option.active !== false).map((option) => option.id).sort();
const inactiveOptionIds = options.filter((option) => option.active === false).map((option) => option.id).sort();
if (JSON.stringify(activeOptionIds) !== JSON.stringify(expectedActiveOptionIds)) {
  fail('The exact active itinerary option set changed without a source-plan reconciliation.');
}
if (JSON.stringify(inactiveOptionIds) !== JSON.stringify(removedFromLatestPlan)) {
  fail('The exact seven-item inactive source-history set changed.');
}
for (const removedId of removedFromLatestPlan) {
  const option = options.find((candidate) => candidate.id === removedId);
  if (!option || option.active !== false || option.status !== 'historical'
      || option.dayIds.length !== 0
      || itinerary.days.some((day) => day.stopIds.includes(removedId))) {
    fail(`${removedId} must preserve its stable key as inactive, read-only source history.`);
  }
}

for (const [dayId, expectedStopIds] of [
  ['day-2026-08-08', ['outbound-flight']],
  ['day-2026-08-09', ['arrival-bjarkalundur', 'borgarfjordur-waterfalls']],
  ['day-2026-08-10', ['hellulaug-coast']],
  ['day-2026-08-11', ['dynjandi']],
  ['day-2026-08-12', ['hellulaug-coast']],
  ['day-2026-08-13', ['kolugljufur', 'hamrar-campsite']],
  ['day-2026-08-14', ['godafoss', 'husavik-town-stop', 'asbyrgi', 'asbyrgi-campsite']],
  ['day-2026-08-15', ['hljodaklettar', 'dettifoss-selfoss', 'hverir-hverfjall', 'myvatn-camp', 'earth-lagoon']],
  ['day-2026-08-16', ['myvatn-camp', 'hverfjall', 'dimmuborgir', 'grjotagja', 'krafla-viti', 'krafla-leirhnjukur', 'hofdi-kalfastrond', 'skutustadagigar']],
  ['day-2026-08-17', ['studlagil', 'borgarfjordur-eystri', 'gufufoss', 'seydisfjordur']],
  ['day-2026-08-18', ['borgarfjordur-eystri', 'gufufoss', 'seydisfjordur']],
  ['day-2026-08-19', ['djupivogur', 'djupivogur-stokksnes']],
  ['day-2026-08-20', ['jokulsarlon-boat', 'glacier-hike', 'fjadrargljufur-eldhraun', 'reynisfjara', 'dyrholaey']],
  ['day-2026-08-21', ['reynisfjara', 'dyrholaey', 'skogafoss-waterfall-way', 'seljalandsfoss-gljufrabui', 'heimaey-puffin-volcano', 'dalfjall-hike', 'herjolfsdalur-camping', 'beluga-sanctuary', 'gullfoss', 'golden-circle-core', 'thingvellir', 'silfra-split']],
  ['day-2026-08-22', ['weather-buffer', 'reykjavik-pools']],
  ['day-2026-08-23', ['reykjadalur', 'perlan', 'sky-lagoon', 'reykjavik-pools']],
  ['day-2026-08-24', ['departure']],
]) {
  const stopIds = itinerary.days.find((day) => day.id === dayId)?.stopIds || [];
  if (JSON.stringify(stopIds) !== JSON.stringify(expectedStopIds)) {
    fail(`${dayId} does not expose the exact reconciled rank/comment targets in source order.`);
  }
}

for (const group of [
  ['hverir-hverfjall', 'hverfjall'],
  ['djupivogur-stokksnes', 'djupivogur'],
  ['golden-circle-core', 'gullfoss', 'thingvellir'],
]) {
  const records = group.map((id) => options.find((option) => option.id === id));
  if (records.some((option) => !option?.map)) {
    fail(`Independent place group is missing a map marker: ${group.join(', ')}.`);
    continue;
  }
  const coordinateKeys = records.map((option) => `${option.map.lat.toFixed(5)},${option.map.lng.toFixed(5)}`);
  if (new Set(coordinateKeys).size !== coordinateKeys.length) {
    fail(`Independent place group reuses a combined marker: ${group.join(', ')}.`);
  }
}

const archivedDecisions = itinerary.archivedSourceDecisions || [];
for (const removedId of removedFromLatestPlan) {
  const record = archivedDecisions.find((candidate) => (
    candidate.id === `${removedId}-removed-from-latest-plan`
  ));
  if (!record || record.status !== 'removed-from-latest-plan' || !record.documentStatus) {
    fail(`${removedId} is inactive without a matching read-only latest-plan archive record.`);
  }
}
const archivedSnaefellsnes = archivedDecisions.find((record) => record.id === 'snaefellsnes-ruled-out');
if (!archivedSnaefellsnes
    || archivedSnaefellsnes.status !== 'ruled-out'
    || !/struck through|ruled out/i.test(archivedSnaefellsnes.documentStatus || '')
    || !Array.isArray(archivedSnaefellsnes.items)
    || archivedSnaefellsnes.items.length < 7
    || !archivedSnaefellsnes.items.some((item) => /advance-booking inquiry was sent by email/i.test(item))) {
  fail('The revised source\'s struck-through Snæfellsnes decision is not preserved as a complete read-only archive record.');
}
if (optionIds.has('snaefellsnes-ruled-out')
    || itinerary.days.some((day) => day.stopIds.includes('snaefellsnes-ruled-out'))
    || archivedSnaefellsnes?.map) {
  fail('Ruled-out Snæfellsnes content must not become a rankable option, dated stop, or map marker.');
}

if (itineraryText.includes('icelagoon.com')) {
  fail('Jökulsárlón evidence crosses operators to icelagoon.com.');
}
const lagoonOption = options.find((option) => option.id === 'jokulsarlon-boat');
if (!lagoonOption?.sources?.some((entry) => (
  entry.url === 'https://icelagoon.is/faq/is-it-possible-to-take-children-on-board-of-the-boats/'
))) {
  fail('Jökulsárlón is missing the selected operator\'s exact children-on-boats FAQ.');
}

const routeLedger = [
  ['route-2026-08-09', 'locked', 'day-2026-08-09', 254.8, 225, [
    ['Keflavík', [-22.6056, 63.985]],
    ['Borgarnes Nettó', [-21.911829, 64.543145]],
    ['Bjarkalundur', [-22.103905, 65.556306]],
  ]],
  ['branch-2026-08-09-waterfalls', 'branch', 'day-2026-08-09', 217.3, 189, [
    ['Borgarnes Nettó', [-21.911829, 64.543145]],
    ['Deildartunguhver', [-21.410615, 64.663593]],
    ['Hraunfossar', [-20.977717, 64.702799]],
    ['Bjarkalundur', [-22.103905, 65.556306]],
  ]],
  ['route-2026-08-10', 'historical', 'day-2026-08-10', 222, 190, [
    ['Bjarkalundur', [-22.103905, 65.556306]],
    ['Hellulaug', [-23.159701, 65.577156]],
    ['Flókalundur', [-23.168478, 65.576334]],
    ['Bjarkalundur return', [-22.103905, 65.556306]],
  ]],
  ['route-2026-08-11', 'historical', 'day-2026-08-11', 170.1, 146, [
    ['Bjarkalundur', [-22.103905, 65.556306]],
    ['Dynjandi', [-23.209067, 65.736568]],
    ['Flókalundur', [-23.168478, 65.576334]],
  ]],
  ['route-2026-08-12', 'historical', 'day-2026-08-12', 0, 0, [
    ['Flókalundur start', [-23.168478, 65.576334]],
    ['Flókalundur end', [-23.168478, 65.576334]],
  ]],
  ['route-2026-08-13', 'locked', 'day-2026-08-13', 452, 409, [
    ['Flókalundur', [-23.168478, 65.576334]],
    ['Kolugljúfur', [-20.572708, 65.335107]],
    ['Camping Hamrar', [-18.103282, 65.648381]],
  ]],
  ['route-2026-08-14', 'working', 'day-2026-08-14', 145.3, 134, [
    ['Camping Hamrar', [-18.103282, 65.648381]],
    ['Goðafoss', [-17.54958, 65.682821]],
    ['Ásbyrgi campsite', [-16.49658, 66.02466]],
  ]],
  ['branch-2026-08-14-husavik-town', 'branch', 'day-2026-08-14', 108.4, 97, [
    ['Goðafoss', [-17.54958, 65.682821]],
    ['Húsavík harbourfront', [-17.343477, 66.045054]],
    ['Ásbyrgi campsite', [-16.49658, 66.02466]],
  ]],
  ['route-2026-08-15', 'working', 'day-2026-08-15', 90.8, 84, [
    ['Ásbyrgi campsite', [-16.49658, 66.02466]],
    ['Hljóðaklettar', [-16.532606, 65.93898]],
    ['Dettifoss west', [-16.3994, 65.8122]],
    ['Hverir', [-16.809182, 65.641143]],
    ['Mývatn campsite', [-16.91754, 65.62378]],
  ]],
  ['route-2026-08-16', 'working', 'day-2026-08-16', 21.3, 42, [
    ['Mývatn campsite', [-16.91754, 65.62378]],
    ['Hverfjall', [-16.875055, 65.606098]],
    ['Dimmuborgir', [-16.9127, 65.591545]],
    ['Grjótagjá', [-16.881681, 65.627161]],
    ['Mývatn campsite return', [-16.91754, 65.62378]],
  ]],
  ['branch-2026-08-16-krafla-viti', 'branch', 'day-2026-08-16', 31.4, 30, [
    ['Grjótagjá', [-16.881681, 65.627161]],
    ['Krafla Víti', [-16.75655, 65.71766]],
    ['Mývatn campsite', [-16.91754, 65.62378]],
  ]],
  ['branch-2026-08-16-krafla-leirhnjukur', 'branch', 'day-2026-08-16', 29.6, 29, [
    ['Grjótagjá', [-16.881681, 65.627161]],
    ['Leirhnjúkur', [-16.774608, 65.713162]],
    ['Mývatn campsite', [-16.91754, 65.62378]],
  ]],
  ['branch-2026-08-16-hofdi-kalfastrond', 'branch', 'day-2026-08-16', 10.8, 14, [
    ['Mývatn campsite', [-16.91754, 65.62378]],
    ['Höfði', [-16.947768, 65.587745]],
    ['Mývatn campsite return', [-16.91754, 65.62378]],
  ]],
  ['branch-2026-08-16-skutustadagigar', 'branch', 'day-2026-08-16', 26, 29, [
    ['Mývatn campsite', [-16.91754, 65.62378]],
    ['Skútustaðagígar', [-17.034903, 65.570851]],
    ['Mývatn campsite return', [-16.91754, 65.62378]],
  ]],
  ['route-2026-08-17', 'working', 'day-2026-08-17', 232.2, 215, [
    ['Mývatn campsite', [-16.91754, 65.62378]],
    ['Stuðlagil west', [-15.308125, 65.162327]],
    ['Egilsstaðir', [-14.3948, 65.2669]],
    ['Gufufoss', [-14.05688, 65.239973]],
    ['Seyðisfjörður campsite', [-14.012072, 65.260598]],
  ]],
  ['branch-2026-08-17-borgarfjordur-puffins', 'branch', 'day-2026-08-17', 75.7, 72, [
    ['Egilsstaðir', [-14.3948, 65.2669]],
    ['Hafnarhólmi', [-13.754811, 65.542075]],
  ]],
  ['route-2026-08-18', 'conditional', 'day-2026-08-18', 0, 0, [
    ['Seyðisfjörður start', [-14.012072, 65.260598]],
    ['Seyðisfjörður end', [-14.012072, 65.260598]],
  ]],
  ['branch-2026-08-18-borgarfjordur-to-seydisfjordur', 'branch', 'day-2026-08-18', 102.9, 98, [
    ['Hafnarhólmi', [-13.754811, 65.542075]],
    ['Egilsstaðir', [-14.3948, 65.2669]],
    ['Gufufoss', [-14.05688, 65.239973]],
    ['Seyðisfjörður campsite', [-14.012072, 65.260598]],
  ]],
  ['route-2026-08-19', 'working', 'day-2026-08-19', 270, 244, [
    ['Seyðisfjörður campsite', [-14.012072, 65.260598]],
    ['Gufufoss', [-14.05688, 65.239973]],
    ['Egilsstaðir', [-14.3948, 65.2669]],
    ['Breiðdalsvík coast', [-14.0063726, 64.792906]],
    ['Djúpivogur campsite', [-14.280251, 64.656158]],
    ['Stokksnes', [-14.994049, 64.25507]],
  ]],
  ['route-2026-08-20', 'working', 'day-2026-08-20', 276.7, 243, [
    ['Stokksnes', [-14.994049, 64.25507]],
    ['Jökulsárlón', [-16.179867, 64.048122]],
    ['Skaftafell', [-16.966326, 64.016672]],
    ['Fjaðrárgljúfur', [-18.171443, 63.771198]],
    ['Eldhraun roadside viewpoint', [-18.161295, 63.746608]],
    ['Vík', [-18.998, 63.418]],
  ]],
  ['route-2026-08-21', 'working', 'day-2026-08-21', 248.2, 229, [
    ['Vík', [-18.998, 63.418]],
    ['Skógafoss', [-19.511996, 63.531806]],
    ['Gullfoss', [-20.130594, 64.325235]],
    ['Geysir', [-20.300735, 64.309511]],
    ['Þingvellir', [-21.128043, 64.25541]],
  ]],
  ['branch-2026-08-21-south-coast', 'branch', 'day-2026-08-21', 103.2, 111, [
    ['Vík', [-18.998, 63.418]],
    ['Reynisfjara', [-19.045269, 63.404344]],
    ['Dyrhólaey lower', [-19.129046, 63.404034]],
    ['Skógafoss', [-19.511996, 63.531806]],
    ['Seljalandsfoss', [-19.988169, 63.615457]],
    ['Landeyjahöfn', [-20.117473, 63.530769]],
  ]],
  ['branch-2026-08-21-ferry-outbound', 'branch', 'day-2026-08-21', 12.8, 35, [
    ['Landeyjahöfn', [-20.117473, 63.530769]],
    ['Heimaey harbour', [-20.273, 63.439]],
  ]],
  ['branch-2026-08-21-heimaey-loop', 'branch', 'day-2026-08-21', 14.2, 20, [
    ['Heimaey harbour', [-20.273, 63.439]],
    ['Beluga sanctuary', [-20.269044, 63.442875]],
    ['Eldfell parking', [-20.2556, 63.4323]],
    ['Stórhöfði', [-20.288457, 63.399596]],
    ['Heimaey harbour return', [-20.273, 63.439]],
  ]],
  ['branch-2026-08-21-herjolfsdalur', 'branch', 'day-2026-08-21', 3.5, 7, [
    ['Heimaey harbour', [-20.273, 63.439]],
    ['Herjólfsdalur campsite', [-20.2982342, 63.4424937]],
    ['Heimaey harbour return', [-20.273, 63.439]],
  ]],
  ['branch-2026-08-21-ferry-return', 'branch', 'day-2026-08-21', 12.8, 35, [
    ['Heimaey harbour', [-20.273, 63.439]],
    ['Landeyjahöfn', [-20.117473, 63.530769]],
  ]],
  ['route-2026-08-22', 'working', 'day-2026-08-22', 0, 0, [
    ['Þingvellir start', [-21.128043, 64.25541]],
    ['Þingvellir end', [-21.128043, 64.25541]],
  ]],
  ['route-2026-08-23', 'working', 'day-2026-08-23', 108.8, 109, [
    ['Þingvellir', [-21.128043, 64.25541]],
    ['Reykjadalur trailhead', [-21.21116, 64.021156]],
    ['Reykjavík Eco campsite', [-21.874213, 64.145228]],
  ]],
  ['branch-2026-08-23-perlan', 'branch', 'day-2026-08-23', 9.4, 18, [
    ['Reykjavík Eco campsite', [-21.874213, 64.145228]],
    ['Perlan', [-21.919028, 64.129246]],
    ['Reykjavík Eco campsite return', [-21.874213, 64.145228]],
  ]],
  ['branch-2026-08-23-sky-lagoon', 'branch', 'day-2026-08-23', 14.6, 28, [
    ['Reykjavík Eco campsite', [-21.874213, 64.145228]],
    ['Sky Lagoon', [-21.946435, 64.116465]],
    ['Reykjavík Eco campsite return', [-21.874213, 64.145228]],
  ]],
  ['route-2026-08-24', 'locked', 'day-2026-08-24', 46.8, 46, [
    ['Reykjavík Eco campsite', [-21.874213, 64.145228]],
    ['Keflavík', [-22.6056, 63.985]],
  ]],
];

const expectedMainRouteIds = [
  'route-2026-08-09',
  'route-2026-08-10',
  'route-2026-08-11',
  'route-2026-08-12',
  'route-2026-08-13',
  'route-2026-08-14',
  'route-2026-08-15',
  'route-2026-08-16',
  'route-2026-08-17',
  'route-2026-08-18',
  'route-2026-08-19',
  'route-2026-08-20',
  'route-2026-08-21',
  'route-2026-08-22',
  'route-2026-08-23',
  'route-2026-08-24',
];
const expectedBranchRouteIds = [
  'branch-2026-08-09-waterfalls',
  'branch-2026-08-14-husavik-town',
  'branch-2026-08-16-krafla-viti',
  'branch-2026-08-16-krafla-leirhnjukur',
  'branch-2026-08-16-hofdi-kalfastrond',
  'branch-2026-08-16-skutustadagigar',
  'branch-2026-08-17-borgarfjordur-puffins',
  'branch-2026-08-18-borgarfjordur-to-seydisfjordur',
  'branch-2026-08-21-south-coast',
  'branch-2026-08-21-ferry-outbound',
  'branch-2026-08-21-heimaey-loop',
  'branch-2026-08-21-herjolfsdalur',
  'branch-2026-08-21-ferry-return',
  'branch-2026-08-23-perlan',
  'branch-2026-08-23-sky-lagoon',
];
if (mapData.routes.length !== 31
    || JSON.stringify(mapData.routes.map((route) => route.id))
      !== JSON.stringify(routeLedger.map(([routeId]) => routeId))) {
  fail('Map snapshot must preserve the exact chronological 31-route topology and ordering.');
}
if (JSON.stringify(mapData.routes.filter((route) => route.state !== 'branch').map((route) => route.id))
    !== JSON.stringify(expectedMainRouteIds)) {
  fail('The exact 16 chronological camper-animation routes changed.');
}
if (JSON.stringify(mapData.routes.filter((route) => route.state === 'branch').map((route) => route.id))
    !== JSON.stringify(expectedBranchRouteIds)) {
  fail('The exact 15 explicit alternative branch routes changed.');
}
for (const [routeId, state, dayId, distanceKm, durationMinutes, waypoints] of routeLedger) {
  const route = mapData.routes.find((candidate) => candidate.id === routeId);
  if (!route
      || route.state !== state
      || JSON.stringify(route.dayIds) !== JSON.stringify([dayId])
      || route.distanceKm !== distanceKm
      || route.durationMinutes !== durationMinutes) {
    fail(`${routeId} does not match its frozen local route ledger (${state}; ${dayId}; ${distanceKm} km / ${durationMinutes} min).`);
    continue;
  }
  assertRouteWaypointOrder(mapData, routeId, waypoints);
}

for (const route of mapData.routes.filter((candidate) => candidate.state !== 'branch')) {
  const day = itinerary.days.find((candidate) => candidate.id === route.dayIds[0]);
  const expectedCamperMinutes = route.durationMinutes === 0
    ? 0
    : Math.ceil((route.durationMinutes * 1.35) / 5) * 5;
  if (!day || day.route?.distanceKm !== route.distanceKm
      || day.route?.baseMinutes !== route.durationMinutes
      || day.route?.camperMinutes !== expectedCamperMinutes
      || !day.route?.confidence?.startsWith('local-snapshot')) {
    fail(`${route.id} exact distance/time ledger is not synchronized into ${route.dayIds[0]}.`);
  }
}

const arrivalRoute = mapData.routes.find((route) => route.id === 'route-2026-08-09');
if (arrivalRoute?.points.some((point) => (
  distanceSquared(point, [-21.410615, 64.663593]) < 0.02 ** 2
  || distanceSquared(point, [-20.977717, 64.702799]) < 0.02 ** 2
))) {
  fail('The locked arrival core still passes through a conditional waterfall detour.');
}

for (const stationaryRouteId of [
  'route-2026-08-12',
  'route-2026-08-18',
  'route-2026-08-22',
]) {
  const route = mapData.routes.find((candidate) => candidate.id === stationaryRouteId);
  if (!route || route.distanceKm !== 0 || route.durationMinutes !== 0
      || route.points.length !== 2
      || distanceSquared(route.points[0], route.points[1]) !== 0) {
    fail(`${stationaryRouteId} must remain an explicit zero-movement day.`);
  }
}

const ferryRoutes = mapData.routes.filter((route) => /ferry-(?:outbound|return)$/.test(route.id));
if (JSON.stringify(ferryRoutes.map((route) => route.id)) !== JSON.stringify([
  'branch-2026-08-21-ferry-outbound',
  'branch-2026-08-21-ferry-return',
]) || ferryRoutes.some((route) => (
  route.durationMinutes !== 35
  || route.distanceKm !== 12.8
  || /50[- ]minute/i.test(route.source)
  || !/official FAQ states a 35-minute sailing/i.test(route.source)
))) {
  fail('Herjólfur geometry must use the verified 35-minute scheduled crossing in both directions.');
}

const branchDayIds = [...new Set(mapData.routes
  .filter((route) => route.state === 'branch')
  .flatMap((route) => route.dayIds))];
if (JSON.stringify(branchDayIds) !== JSON.stringify([
  'day-2026-08-09',
  'day-2026-08-14',
  'day-2026-08-16',
  'day-2026-08-17',
  'day-2026-08-18',
  'day-2026-08-21',
  'day-2026-08-23',
])) {
  fail('Alternative geometry must remain isolated on the exact seven branch days.');
}

const expectedOrderCheckDayIds = [
  'day-2026-08-09',
  'day-2026-08-12',
  'day-2026-08-14',
  'day-2026-08-15',
  'day-2026-08-16',
  'day-2026-08-17',
  'day-2026-08-18',
  'day-2026-08-19',
  'day-2026-08-20',
  'day-2026-08-21',
  'day-2026-08-22',
  'day-2026-08-23',
  'day-2026-08-24',
];
if (JSON.stringify(itinerary.days.filter((day) => day.orderCheck).map((day) => day.id))
    !== JSON.stringify(expectedOrderCheckDayIds)) {
  fail('Document-versus-geography commentary must remain attached to the exact reconciled days.');
}

const expectedRoutingSnapshot = {
  engine: 'OSRM',
  engineVersion: 'v5.26.0',
  execution: 'local-private',
  imageDigest: 'sha256:af5d4a83fb90086a43b1ae2ca22872e6768766ad5fcbb07a29ff90ec644ee409',
  dataProvider: 'Geofabrik',
  dataSet: 'Iceland OpenStreetMap PBF',
  dataTimestamp: '2026-08-13T20:21:01Z',
  dataMd5: '97525792b54cad1392ed8df6f4f9338b',
};
for (const [key, value] of Object.entries(expectedRoutingSnapshot)) {
  if (mapData.routingSnapshot?.[key] !== value) {
    fail(`Local routing snapshot provenance drifted at ${key}.`);
  }
}
let routingEndpoint;
try {
  routingEndpoint = new URL(mapData.routingSnapshot?.endpoint);
} catch {
  fail('Routing snapshot does not record its loopback-only build endpoint.');
}
if (routingEndpoint && !['127.0.0.1', 'localhost', '[::1]'].includes(routingEndpoint.hostname)) {
  fail('Routing snapshot endpoint is not loopback-only.');
}
if (mapData.routes.filter((route) => route.distanceKm > 0 && !/ferry/i.test(route.id)).some((route) => (
  !/local\/private route build/.test(route.source)
  || !/car baseline/.test(route.source)
  || !/97525792b54cad1392ed8df6f4f9338b/.test(route.source)
))) {
  fail('A routed road leg is missing local OSRM, car-baseline, or verified Geofabrik provenance.');
}
if (!/Static local-OSRM car baselines/.test(itinerary.methodology?.driveMethod || '')
    || !/plus 35%/.test(itinerary.methodology?.driveMethod || '')
    || !/roadworks/i.test(itinerary.methodology?.driveMethod || '')
    || !/weather/i.test(itinerary.methodology?.driveMethod || '')
    || /live[- ]traffic/i.test(JSON.stringify(mapData.routingSnapshot))) {
  fail('Drive methodology must state the offline car baseline exclusions and must not imply live traffic.');
}

const sourceSha = 'f961d86b89d5a546f7d5d988f74c729a67c51139ab6ef151a2a2ce19d5702953';
if (itinerary.methodology?.sourceDocumentSha256 !== sourceSha) {
  fail('Itinerary is not pinned to the revised document SHA-256.');
}
if (mapData.sourceDocumentSha256 !== sourceSha) {
  fail('Route geometry is not pinned to the revised document SHA-256.');
}

for (const forbidden of [
  /50[- ]minute ferry/i,
  /Sky Lagoon[^.]{0,60}15 min(?:ute)?s? from (?:the )?airport/i,
]) {
  if (forbidden.test(itineraryText)) fail(`Itinerary retains a superseded claim: ${forbidden}`);
}

const reykjadalur = options.find((option) => option.id === 'reykjadalur');
if (!reykjadalur || !/7 km return/i.test(JSON.stringify(reykjadalur))) {
  fail('Reykjadalur must state the corrected roughly 7 km return commitment.');
}

const seljalandsfoss = options.find((option) => option.id === 'seljalandsfoss-gljufrabui');
if (!seljalandsfoss || !/north/i.test(JSON.stringify(seljalandsfoss))) {
  fail('Gljúfrabúi must be located north of Seljalandsfoss, not treated as an across-road stop.');
}

if (!/OpenStreetMap/i.test(JSON.stringify(mapData.attribution))
    || !/Natural Earth/i.test(JSON.stringify(mapData.attribution))) {
  fail('Map data is missing OpenStreetMap or Natural Earth attribution.');
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Iceland route data passed exact itinerary, local-route, Bónus, Camping Card, progress, and geographic-order checks.');
