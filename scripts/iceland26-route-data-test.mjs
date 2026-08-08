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

function routePointsFor(mapData, dayId) {
  return mapData.routes
    .filter((route) => route.state !== 'branch' && route.dayIds.includes(dayId))
    .flatMap((route) => route.points);
}

function assertWaypointOrder(mapData, dayId, namedTargets) {
  const points = routePointsFor(mapData, dayId);
  if (!points.length) {
    fail(`${dayId} has no working route geometry.`);
    return;
  }
  const indices = namedTargets.map(([name, target]) => {
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    points.forEach((point, index) => {
      const candidate = distanceSquared(point, target);
      if (candidate < bestDistance) {
        bestDistance = candidate;
        bestIndex = index;
      }
    });
    // OSRM snaps supplied planning pins to the routable carriageway; 0.035°
    // accommodates large parking areas without accepting a different region.
    if (bestDistance > 0.035 ** 2) {
      fail(`${dayId} geometry does not pass close enough to ${name}.`);
    }
    return bestIndex;
  });
  for (let index = 1; index < indices.length; index += 1) {
    if (indices[index] <= indices[index - 1]) {
      fail(`${dayId} route is not in geographic order at ${namedTargets[index][0]}.`);
      break;
    }
  }
}

function assertRouteWaypointOrder(mapData, routeId, namedTargets) {
  const route = mapData.routes.find((candidate) => candidate.id === routeId);
  if (!route) {
    fail(`${routeId} is missing.`);
    return;
  }
  const indices = namedTargets.map(([name, target]) => {
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    route.points.forEach((point, index) => {
      const candidate = distanceSquared(point, target);
      if (candidate < bestDistance) {
        bestDistance = candidate;
        bestIndex = index;
      }
    });
    if (bestDistance > 0.035 ** 2) {
      fail(`${routeId} geometry does not pass close enough to ${name}.`);
    }
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
const itinerary = JSON.parse(itineraryText);
const mapData = JSON.parse(mapText);

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

const options = itinerary.legs.flatMap((leg) => leg.options);
const optionIds = new Set(options.map((option) => option.id));
const dayIds = new Set(itinerary.days.map((day) => day.id));

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
  if (!Number.isFinite(day.progress) || Math.abs(day.progress - recomputed) > 1e-11) {
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

for (const stableId of [
  'arrival-bjarkalundur',
  'dynjandi',
  'raudasandur',
  'eclipse-patreksfjordur',
  'eclipse-arngerdareyri',
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
  if (!optionIds.has(stableId)) fail(`Stable state key was removed: ${stableId}.`);
}

const westfjordBranches = itinerary.days.find((day) => day.id === 'day-2026-08-10')?.stopIds || [];
if (!westfjordBranches.includes('raudasandur')
    || !westfjordBranches.includes('latrabjarg-raudasandur')) {
  fail('Rauðasandur and Látrabjarg must remain independently rankable August 10 branches.');
}
const eclipseChoices = itinerary.days.find((day) => day.id === 'day-2026-08-12')?.stopIds || [];
if (!eclipseChoices.includes('eclipse-patreksfjordur')
    || !eclipseChoices.includes('eclipse-arngerdareyri')) {
  fail('Patreksfjörður and Arngerðareyri must remain independently rankable eclipse sites.');
}


for (const [dayId, requiredIds] of [
  ['day-2026-08-14', ['husavik-whale-watching', 'hverir-hverfjall', 'hverfjall']],
  ['day-2026-08-15', ['asbyrgi']],
  ['day-2026-08-16', ['djupivogur-stokksnes', 'djupivogur']],
  ['day-2026-08-19', ['dalfjall-hike', 'herjolfsdalur-camping']],
  ['day-2026-08-20', ['golden-circle-core', 'gullfoss', 'thingvellir']],
]) {
  const stopIds = itinerary.days.find((day) => day.id === dayId)?.stopIds || [];
  for (const requiredId of requiredIds) {
    if (!stopIds.includes(requiredId)) {
      fail(`${dayId} does not expose active source choice ${requiredId} as an independent rank/comment target.`);
    }
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

assertRouteWaypointOrder(mapData, 'route-2026-08-09', [
  ['Keflavík', [-22.6056, 63.985]],
  ['Borgarnes', [-21.911829, 64.543145]],
  ['Bjarkalundur', [-22.103905, 65.556306]],
]);

assertRouteWaypointOrder(mapData, 'branch-2026-08-09-waterfalls', [
  ['Borgarnes', [-21.911829, 64.543145]],
  ['Deildartunguhver', [-21.410615, 64.663593]],
  ['Hraunfossar', [-20.977717, 64.702799]],
  ['Bjarkalundur', [-22.103905, 65.556306]],
]);

assertWaypointOrder(mapData, 'day-2026-08-15', [
  ['Hverir', [-16.809182, 65.641143]],
  ['Dettifoss west', [-16.3994, 65.8122]],
  ['Stuðlagil west', [-15.308125, 65.162327]],
  ['Egilsstaðir', [-14.3948, 65.2669]],
]);

assertRouteWaypointOrder(mapData, 'branch-2026-08-14-husavik', [
  ['Goðafoss', [-17.54958, 65.682821]],
  ['Húsavík harbour', [-17.3434773, 66.0450541]],
  ['Reykjahlíð', [-16.914, 65.64]],
]);

assertRouteWaypointOrder(mapData, 'branch-2026-08-15-asbyrgi', [
  ['Reykjahlíð', [-16.914, 65.64]],
  ['Ásbyrgi visitor centre', [-16.4871638, 66.0284991]],
  ['Dettifoss west', [-16.3994, 65.8122]],
]);

assertWaypointOrder(mapData, 'day-2026-08-17', [
  ['Fjaðrárgljúfur', [-18.171443, 63.771198]],
  ['Eldhraun roadside viewpoint', [-18.161295, 63.746608]],
  ['Vík', [-18.998, 63.418]],
]);

assertWaypointOrder(mapData, 'day-2026-08-20', [
  ['Gullfoss', [-20.130594, 64.325235]],
  ['Geysir', [-20.300735, 64.309511]],
  ['Þingvellir', [-21.128043, 64.25541]],
]);

const arrivalRoute = mapData.routes.find((route) => (
  route.state === 'locked' && route.dayIds.includes('day-2026-08-09')
));
if (!arrivalRoute) fail('Arrival-day route is not marked locked.');
const arrivalDay = itinerary.days.find((day) => day.id === 'day-2026-08-09');
if (arrivalRoute && Math.abs(arrivalRoute.distanceKm - arrivalDay?.route?.distanceKm) > 0.2) {
  fail(`Arrival-day core distance disagrees between map (${arrivalRoute.distanceKm} km) and itinerary (${arrivalDay?.route?.distanceKm} km).`);
}
const arrivalBranch = mapData.routes.find((route) => route.id === 'branch-2026-08-09-waterfalls');
if (!arrivalBranch || arrivalBranch.state !== 'branch') {
  fail('The conditional arrival waterfalls are not isolated in an explicit branch route.');
}

for (const [routeId, distanceKm, durationMinutes] of [
  ['route-2026-08-09', 255.5, 226],
  ['branch-2026-08-09-waterfalls', 218, 190],
  ['branch-2026-08-14-husavik', 101.8, 92],
  ['branch-2026-08-15-asbyrgi', 114, 98],
  ['branch-2026-08-19-herjolfsdalur', 3.5, 8],
]) {
  const route = mapData.routes.find((candidate) => candidate.id === routeId);
  if (!route
      || Math.abs(route.distanceKm - distanceKm) > 0.1
      || route.durationMinutes !== durationMinutes) {
    fail(`${routeId} no longer matches its frozen OSRM route cost (${distanceKm} km / ${durationMinutes} min).`);
  }
}
if (arrivalRoute?.points.some((point) => (
  distanceSquared(point, [-21.410615, 64.663593]) < 0.02 ** 2
  || distanceSquared(point, [-20.977717, 64.702799]) < 0.02 ** 2
))) {
  fail('The locked arrival core still passes through a conditional waterfall detour.');
}

const ferryRoutes = mapData.routes.filter((route) => /ferry/i.test(route.id));
if (ferryRoutes.length !== 2
    || ferryRoutes.some((route) => route.durationMinutes !== 35 || /50[- ]minute/i.test(route.source))) {
  fail('Herjólfur geometry must use the verified 35-minute scheduled crossing in both directions.');
}

const branchDayIds = new Set(mapData.routes
  .filter((route) => route.state === 'branch')
  .flatMap((route) => route.dayIds));
for (const requiredBranchDay of [
  'day-2026-08-09',
  'day-2026-08-10',
  'day-2026-08-11',
  'day-2026-08-14',
  'day-2026-08-15',
  'day-2026-08-19',
  'day-2026-08-23',
]) {
  if (!branchDayIds.has(requiredBranchDay)) {
    fail(`${requiredBranchDay} is missing its explicit alternative branch.`);
  }
}

for (const requiredOrderCheck of ['day-2026-08-14', 'day-2026-08-17', 'day-2026-08-20']) {
  if (!itinerary.days.find((day) => day.id === requiredOrderCheck)?.orderCheck) {
    fail(`${requiredOrderCheck} must surface its document/geography order check.`);
  }
}

const sourceSha = '523d988f965ef24cbfef2141d284f460c8361f4d137e4f0be1fbdf73d1f116aa';
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

console.log('Iceland route data passed stable-ID, date, privacy, bounds, branch, distance, and geographic-order checks.');
