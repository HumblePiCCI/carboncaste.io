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

assertWaypointOrder(mapData, 'day-2026-08-09', [
  ['Keflavík', [-22.6056, 63.985]],
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
if (arrivalRoute && (arrivalRoute.distanceKm < 325 || arrivalRoute.distanceKm > 355)) {
  fail(`Arrival-day routed distance ${arrivalRoute.distanceKm} km is outside the researched range.`);
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
