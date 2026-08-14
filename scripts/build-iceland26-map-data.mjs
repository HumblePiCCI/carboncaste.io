#!/usr/bin/env node

/**
 * Build the self-contained Iceland 2026 map snapshot.
 *
 * Road geometry and car-baseline measurements come from a loopback-only OSRM
 * instance over a verified Geofabrik OpenStreetMap extract. The island outline
 * comes from Natural Earth 1:50m Admin 0 Countries. Both inputs are reduced to
 * the precision needed by the trip-board SVG before being written to
 * iceland26/map-data.json. The generator rejects non-loopback routing hosts so
 * private itinerary waypoints cannot be sent to an external router by mistake.
 *
 * Refresh road geometry while reusing the committed coastline:
 *   node scripts/build-iceland26-map-data.mjs \
 *     --osrm-base http://127.0.0.1:18129
 *
 * Refresh from a newer Natural Earth source:
 *   node scripts/build-iceland26-map-data.mjs \
 *     --boundary /path/to/ne_50m_admin_0_countries_lakes.geojson
 *
 * Validation without network access:
 *   node scripts/build-iceland26-map-data.mjs --validate-only
 *
 * Validate the authored route graph without reading or writing map data:
 *   node scripts/build-iceland26-map-data.mjs --config-only
 *
 * Recompute only the deterministic day-progress ledger without network access:
 *   node scripts/build-iceland26-map-data.mjs --progress-only
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_OUTPUT_PATH = path.join(REPO_ROOT, "iceland26", "map-data.json");
const DEFAULT_BOUNDARY_PATH = DEFAULT_OUTPUT_PATH;
const DEFAULT_OSRM_BASE = "http://127.0.0.1:18129";
const SNAPSHOT_DATE = "2026-08-13";
const SOURCE_DOCUMENT_SHA256 = "f961d86b89d5a546f7d5d988f74c729a67c51139ab6ef151a2a2ce19d5702953";
const ROUTING_SNAPSHOT = Object.freeze({
  engine: "OSRM",
  engineVersion: "v5.26.0",
  execution: "local-private",
  imageDigest: "sha256:af5d4a83fb90086a43b1ae2ca22872e6768766ad5fcbb07a29ff90ec644ee409",
  dataProvider: "Geofabrik",
  dataSet: "Iceland OpenStreetMap PBF",
  dataTimestamp: "2026-08-13T20:21:01Z",
  dataMd5: "97525792b54cad1392ed8df6f4f9338b",
});
const MAP_BOUNDS = Object.freeze({
  minLng: -25,
  maxLng: -13,
  minLat: 63.2,
  maxLat: 66.7,
});
const TRIP_DAY_IDS = Object.freeze(
  Array.from({ length: 17 }, (_, index) =>
    `day-2026-08-${String(index + 8).padStart(2, "0")}`,
  ),
);
const ROUTE_PROJECTION = Object.freeze({ x: 55, y: 45, width: 890, height: 610 });

const LOCATIONS = Object.freeze({
  kef: [-22.6056, 63.985],
  nettoBorgarnes: [-21.911829, 64.543145],
  deildartunguhver: [-21.410615, 64.663593],
  hraunfossar: [-20.977717, 64.702799],
  bjarkalundur: [-22.103905, 65.556306],
  hellulaug: [-23.159701, 65.577156],
  flokalundur: [-23.168478, 65.576334],
  patreksfjordurCamp: [-23.974097, 65.591283],
  raudasandur: [-23.960064, 65.474415],
  latrabjarg: [-24.529652, 65.502433],
  dynjandi: [-23.209067, 65.736568],
  kolugljufur: [-20.572708, 65.335107],
  hamrarCamp: [-18.103282, 65.648381],
  godafoss: [-17.54958, 65.682821],
  husavikTown: [-17.343477, 66.045054],
  asbyrgiCamp: [-16.49658, 66.02466],
  hljodaklettar: [-16.532606, 65.93898],
  myvatnCamp: [-16.91754, 65.62378],
  hverir: [-16.809182, 65.641143],
  asbyrgiVisitorCentre: [-16.4871638, 66.0284991],
  dettifossWest: [-16.3994, 65.8122],
  hverfjall: [-16.875055, 65.606098],
  dimmuborgir: [-16.9127, 65.591545],
  grjotagja: [-16.881681, 65.627161],
  kraflaViti: [-16.75655, 65.71766],
  kraflaLeirhnjukur: [-16.774608, 65.713162],
  hofdi: [-16.947768, 65.587745],
  skutustadagigar: [-17.034903, 65.570851],
  studlagilWest: [-15.308125, 65.162327],
  egilsstadir: [-14.3948, 65.2669],
  gufufoss: [-14.05688, 65.239973],
  seydisfjordurCamp: [-14.012072, 65.260598],
  hafnarholmi: [-13.754811, 65.542075],
  // This OSM village point forces the coast road via Breiddalsvik, preventing
  // the router from substituting the Oxi/939 shortcut on the Eastfjords day.
  breiddalsvikCoastVia: [-14.0063726, 64.792906],
  djupivogurCamp: [-14.280251, 64.656158],
  stokksnesGate: [-14.994049, 64.25507],
  jokulsarlon: [-16.179867, 64.048122],
  skaftafell: [-16.966326, 64.016672],
  fjadrargljufur: [-18.171443, 63.771198],
  // Roadside Eldhraun/Skaftareldahraun viewpoint on Route 1. The lava field
  // itself is broad; use the drivable stop instead of its off-road centroid.
  eldhraun: [-18.161295, 63.746608],
  vik: [-18.998, 63.418],
  reynisfjara: [-19.045269, 63.404344],
  dyrholaeyLower: [-19.129046, 63.404034],
  skogafoss: [-19.511996, 63.531806],
  seljalandsfoss: [-19.988169, 63.615457],
  landeyjahofn: [-20.117473, 63.530769],
  heimaeyHarbor: [-20.273, 63.439],
  belugaSanctuary: [-20.269044, 63.442875],
  eldfellParking: [-20.2556, 63.4323],
  storhofdi: [-20.288457, 63.399596],
  herjolfsdalurCamp: [-20.2982342, 63.4424937],
  gullfoss: [-20.130594, 64.325235],
  geysir: [-20.300735, 64.309511],
  thingvellirP1: [-21.128043, 64.25541],
  reykjadalurTrailhead: [-21.21116, 64.021156],
  reykjavikEco: [-21.874213, 64.145228],
  perlan: [-21.919028, 64.129246],
  skyLagoon: [-21.946435, 64.116465],
});

const road = (id, day, state, locations, sourceNote = "") => ({
  id,
  dayIds: [day],
  state,
  locations,
  sourceNote,
  kind: "road",
});

const manual = (id, day, state, points, durationMinutes, source) => ({
  id,
  dayIds: [day],
  state,
  points,
  durationMinutes,
  source,
  kind: "manual",
});

// Non-branch routes are deliberately chronological: the map client uses this
// order for the two-camper whole-trip animation. Alternatives remain separate
// so a possible side trip never masquerades as an agreed route.
const ROUTE_CONFIGS = Object.freeze([
  road("route-2026-08-09", "day-2026-08-09", "locked", [
    "kef",
    "nettoBorgarnes",
    "bjarkalundur",
  ]),
  road(
    "branch-2026-08-09-waterfalls",
    "day-2026-08-09",
    "branch",
    ["nettoBorgarnes", "deildartunguhver", "hraunfossar", "bjarkalundur"],
    "Optional alternative segment from Borgarnes Nettó through Deildartunguhver and Hraunfossar to Bjarkalundur; not part of the locked core.",
  ),
  road("route-2026-08-10", "day-2026-08-10", "historical", [
    "bjarkalundur",
    "hellulaug",
    "flokalundur",
    "bjarkalundur",
  ]),
  road("route-2026-08-11", "day-2026-08-11", "historical", [
    "bjarkalundur",
    "dynjandi",
    "flokalundur",
  ]),
  manual(
    "route-2026-08-12",
    "day-2026-08-12",
    "historical",
    [LOCATIONS.flokalundur, LOCATIONS.flokalundur],
    0,
    "Stationary historical ledger at Flókalundur; superseded eclipse-site alternatives are excluded from the active route.",
  ),
  road("route-2026-08-13", "day-2026-08-13", "locked", [
    "flokalundur",
    "kolugljufur",
    "hamrarCamp",
  ]),
  road("route-2026-08-14", "day-2026-08-14", "working", [
    "hamrarCamp",
    "godafoss",
    "asbyrgiCamp",
  ]),
  road(
    "branch-2026-08-14-husavik-town",
    "day-2026-08-14",
    "branch",
    ["godafoss", "husavikTown", "asbyrgiCamp"],
    "Optional Húsavík harbourfront/café path between Goðafoss and Ásbyrgi; no whale tour is implied.",
  ),
  road("route-2026-08-15", "day-2026-08-15", "working", [
    "asbyrgiCamp",
    "hljodaklettar",
    "dettifossWest",
    "hverir",
    "myvatnCamp",
  ]),
  road("route-2026-08-16", "day-2026-08-16", "working", [
    "myvatnCamp",
    "hverfjall",
    "dimmuborgir",
    "grjotagja",
    "myvatnCamp",
  ]),
  road("branch-2026-08-16-krafla-viti", "day-2026-08-16", "branch", [
    "grjotagja",
    "kraflaViti",
    "myvatnCamp",
  ]),
  road("branch-2026-08-16-krafla-leirhnjukur", "day-2026-08-16", "branch", [
    "grjotagja",
    "kraflaLeirhnjukur",
    "myvatnCamp",
  ]),
  road("branch-2026-08-16-hofdi-kalfastrond", "day-2026-08-16", "branch", [
    "myvatnCamp",
    "hofdi",
    "myvatnCamp",
  ]),
  road("branch-2026-08-16-skutustadagigar", "day-2026-08-16", "branch", [
    "myvatnCamp",
    "skutustadagigar",
    "myvatnCamp",
  ]),
  road("route-2026-08-17", "day-2026-08-17", "working", [
    "myvatnCamp",
    "studlagilWest",
    "egilsstadir",
    "gufufoss",
    "seydisfjordurCamp",
  ]),
  road("branch-2026-08-17-borgarfjordur-puffins", "day-2026-08-17", "branch", [
    "egilsstadir",
    "hafnarholmi",
  ]),
  manual(
    "route-2026-08-18",
    "day-2026-08-18",
    "conditional",
    [LOCATIONS.seydisfjordurCamp, LOCATIONS.seydisfjordurCamp],
    0,
    "Stationary conditional Eastfjords day in Seyðisfjörður when the August 17 direct branch is used.",
  ),
  road("branch-2026-08-18-borgarfjordur-to-seydisfjordur", "day-2026-08-18", "branch", [
    "hafnarholmi",
    "egilsstadir",
    "gufufoss",
    "seydisfjordurCamp",
  ]),
  road("route-2026-08-19", "day-2026-08-19", "working", [
    "seydisfjordurCamp",
    "gufufoss",
    "egilsstadir",
    "breiddalsvikCoastVia",
    "djupivogurCamp",
    "stokksnesGate",
  ]),
  road("route-2026-08-20", "day-2026-08-20", "working", [
    "stokksnesGate",
    "jokulsarlon",
    "skaftafell",
    "fjadrargljufur",
    "eldhraun",
    "vik",
  ]),
  road("route-2026-08-21", "day-2026-08-21", "working", [
    "vik",
    "skogafoss",
    "gullfoss",
    "geysir",
    "thingvellirP1",
  ]),
  road("branch-2026-08-21-south-coast", "day-2026-08-21", "branch", [
    "vik",
    "reynisfjara",
    "dyrholaeyLower",
    "skogafoss",
    "seljalandsfoss",
    "landeyjahofn",
  ]),
  manual(
    "branch-2026-08-21-ferry-outbound",
    "day-2026-08-21",
    "branch",
    [LOCATIONS.landeyjahofn, LOCATIONS.heimaeyHarbor],
    35,
    "Replacement branch only. Manual ferry line; official FAQ states a 35-minute sailing: https://herjolfur.is/en/frequently-asked-questions/ ; departure times: https://herjolfur.is/en/schedule/ (snapshot 2026-08-13).",
  ),
  road("branch-2026-08-21-heimaey-loop", "day-2026-08-21", "branch", [
    "heimaeyHarbor",
    "belugaSanctuary",
    "eldfellParking",
    "storhofdi",
    "heimaeyHarbor",
  ]),
  road(
    "branch-2026-08-21-herjolfsdalur",
    "day-2026-08-21",
    "branch",
    ["heimaeyHarbor", "herjolfsdalurCamp", "heimaeyHarbor"],
    "Replacement-only local transfer. Camping would consume the August 22 buffer and requires a different ferry/sleep plan.",
  ),
  manual(
    "branch-2026-08-21-ferry-return",
    "day-2026-08-21",
    "branch",
    [LOCATIONS.heimaeyHarbor, LOCATIONS.landeyjahofn],
    35,
    "Replacement branch only. Manual ferry line; official FAQ states a 35-minute sailing: https://herjolfur.is/en/frequently-asked-questions/ ; departure times: https://herjolfur.is/en/schedule/ (snapshot 2026-08-13).",
  ),
  manual(
    "route-2026-08-22",
    "day-2026-08-22",
    "working",
    [LOCATIONS.thingvellirP1, LOCATIONS.thingvellirP1],
    0,
    "Stationary protected weather, fatigue, and recovery buffer at the working Þingvellir overnight.",
  ),
  road("route-2026-08-23", "day-2026-08-23", "working", [
    "thingvellirP1",
    "reykjadalurTrailhead",
    "reykjavikEco",
  ]),
  road("branch-2026-08-23-perlan", "day-2026-08-23", "branch", [
    "reykjavikEco",
    "perlan",
    "reykjavikEco",
  ]),
  road("branch-2026-08-23-sky-lagoon", "day-2026-08-23", "branch", [
    "reykjavikEco",
    "skyLagoon",
    "reykjavikEco",
  ]),
  road("route-2026-08-24", "day-2026-08-24", "locked", ["reykjavikEco", "kef"]),
]);

function normalizeOsrmBase(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid OSRM base URL: ${value}`);
  }
  if (!new Set(["http:", "https:"]).has(parsed.protocol)) {
    throw new Error("OSRM base URL must use http or https.");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("OSRM base URL must not include credentials, a query, or a fragment.");
  }
  // Use literal loopback addresses only. `localhost` is intentionally rejected
  // because its resolver behavior is environmental rather than a URL-level
  // guarantee that itinerary coordinates remain on this machine.
  const loopbackHosts = new Set(["127.0.0.1", "[::1]"]);
  if (!loopbackHosts.has(parsed.hostname)) {
    throw new Error("OSRM base URL must use loopback; external routing hosts are not permitted.");
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  return parsed.toString().replace(/\/$/, "");
}

function parseArgs(argv) {
  const parsed = {
    boundaryPath: DEFAULT_BOUNDARY_PATH,
    outputPath: DEFAULT_OUTPUT_PATH,
    osrmBase: normalizeOsrmBase(process.env.ICELAND26_OSRM_BASE || DEFAULT_OSRM_BASE),
    validateOnly: false,
    progressOnly: false,
    configOnly: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--boundary") {
      parsed.boundaryPath = path.resolve(argv[++index]);
    } else if (argument === "--output") {
      parsed.outputPath = path.resolve(argv[++index]);
    } else if (argument === "--osrm-base") {
      parsed.osrmBase = normalizeOsrmBase(argv[++index]);
    } else if (argument === "--validate-only") {
      parsed.validateOnly = true;
    } else if (argument === "--progress-only") {
      parsed.progressOnly = true;
    } else if (argument === "--config-only") {
      parsed.configOnly = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if ([parsed.validateOnly, parsed.progressOnly, parsed.configOnly].filter(Boolean).length > 1) {
    throw new Error("Use only one of --validate-only, --progress-only, or --config-only.");
  }
  return parsed;
}

function coordinateIsValid(point) {
  return (
    Array.isArray(point) &&
    point.length === 2 &&
    Number.isFinite(point[0]) &&
    Number.isFinite(point[1]) &&
    point[0] >= -25.1 &&
    point[0] <= -13.3 &&
    point[1] >= 63.2 &&
    point[1] <= 66.7
  );
}

function roundCoordinate(point) {
  return point.map((value) => Number(value.toFixed(6)));
}

function squaredSegmentDistance(point, start, end) {
  let x = start[0];
  let y = start[1];
  let dx = end[0] - x;
  let dy = end[1] - y;

  if (dx !== 0 || dy !== 0) {
    const t = ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = end[0];
      y = end[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }

  dx = point[0] - x;
  dy = point[1] - y;
  return dx * dx + dy * dy;
}

function simplifyDouglasPeucker(points, tolerance) {
  if (points.length <= 2) return points;
  const threshold = tolerance * tolerance;
  const markers = new Uint8Array(points.length);
  const stack = [[0, points.length - 1]];
  markers[0] = 1;
  markers[points.length - 1] = 1;

  while (stack.length > 0) {
    const [first, last] = stack.pop();
    let maxDistance = threshold;
    let splitIndex = 0;
    for (let index = first + 1; index < last; index += 1) {
      const distance = squaredSegmentDistance(points[index], points[first], points[last]);
      if (distance > maxDistance) {
        splitIndex = index;
        maxDistance = distance;
      }
    }
    if (splitIndex > 0) {
      markers[splitIndex] = 1;
      stack.push([first, splitIndex], [splitIndex, last]);
    }
  }

  return points.filter((_, index) => markers[index] === 1);
}

function simplifyClosedRing(ring, tolerance) {
  const openRing = ring.slice(0, -1);
  let westIndex = 0;
  let eastIndex = 0;
  for (let index = 1; index < openRing.length; index += 1) {
    if (openRing[index][0] < openRing[westIndex][0]) westIndex = index;
    if (openRing[index][0] > openRing[eastIndex][0]) eastIndex = index;
  }
  const firstIndex = Math.min(westIndex, eastIndex);
  const secondIndex = Math.max(westIndex, eastIndex);
  const firstArc = openRing.slice(firstIndex, secondIndex + 1);
  const secondArc = openRing
    .slice(secondIndex)
    .concat(openRing.slice(0, firstIndex + 1));
  const simplified = simplifyDouglasPeucker(firstArc, tolerance)
    .concat(simplifyDouglasPeucker(secondArc, tolerance).slice(1))
    .map(roundCoordinate);
  if (simplified.length < 4) throw new Error("Boundary simplification removed too many points.");
  if (
    simplified[0][0] !== simplified.at(-1)[0] ||
    simplified[0][1] !== simplified.at(-1)[1]
  ) {
    simplified.push([...simplified[0]]);
  }
  return simplified;
}

function haversineKm(start, end) {
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371.0088;
  const lat1 = radians(start[1]);
  const lat2 = radians(end[1]);
  const deltaLat = radians(end[1] - start[1]);
  const deltaLng = radians(end[0] - start[0]);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function manualDistanceKm(points) {
  let distance = 0;
  for (let index = 1; index < points.length; index += 1) {
    distance += haversineKm(points[index - 1], points[index]);
  }
  return distance;
}

function validateRouteConfigs() {
  const validStates = new Set(["locked", "working", "conditional", "historical", "branch"]);
  const seenRouteIds = new Set();
  const mainRoutesByDay = new Map();

  const resolvedPoints = ROUTE_CONFIGS.map((config) => {
    if (seenRouteIds.has(config.id)) throw new Error(`Duplicate route config id: ${config.id}`);
    seenRouteIds.add(config.id);
    if (!validStates.has(config.state)) throw new Error(`Invalid route config state: ${config.id}`);
    if (
      config.dayIds.length !== 1 ||
      !/^day-2026-08-(0[9]|1\d|2[0-4])$/.test(config.dayIds[0])
    ) {
      throw new Error(`Invalid route config day: ${config.id}`);
    }

    const points = config.kind === "road"
      ? config.locations.map((name) => {
        const point = LOCATIONS[name];
        if (!point) throw new Error(`Unknown location ${name} in ${config.id}`);
        return point;
      })
      : config.points;
    if (!Array.isArray(points) || points.length < 2 || !points.every(coordinateIsValid)) {
      throw new Error(`Invalid route config coordinates: ${config.id}`);
    }

    if (config.state !== "branch") {
      const day = config.dayIds[0];
      if (mainRoutesByDay.has(day)) throw new Error(`Multiple main routes configured for ${day}`);
      mainRoutesByDay.set(day, config.id);
    }
    return { config, points };
  });

  for (const dayId of TRIP_DAY_IDS.slice(1)) {
    if (!mainRoutesByDay.has(dayId)) throw new Error(`Missing chronological route for ${dayId}`);
  }

  const chronological = resolvedPoints.filter(({ config }) => config.state !== "branch");
  for (let index = 1; index < chronological.length; index += 1) {
    const previous = chronological[index - 1];
    const current = chronological[index];
    const gapKm = haversineKm(previous.points.at(-1), current.points[0]);
    if (gapKm > 0.25) {
      throw new Error(
        `Route config discontinuity between ${previous.config.id} and ${current.config.id}: ${gapKm.toFixed(1)} km.`,
      );
    }
  }

  return {
    routeCount: ROUTE_CONFIGS.length,
    branchCount: ROUTE_CONFIGS.filter((config) => config.state === "branch").length,
    chronologicalCount: chronological.length,
  };
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchJsonWithRetry(url, attempts = 4) {
  let finalError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "carboncaste-iceland26-route-snapshot/1.0" },
        redirect: "error",
        signal: AbortSignal.timeout(45_000),
      });
      if (!response.url || new URL(response.url).origin !== new URL(url).origin) {
        throw new Error("OSRM response origin changed; refusing to disclose route coordinates.");
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      finalError = error;
      if (attempt < attempts) await wait(500 * attempt);
    }
  }
  throw new Error(`OSRM request failed after ${attempts} attempts: ${finalError.message}`);
}

async function buildRoadRoute(config, osrmBase) {
  const requestedPoints = config.locations.map((name) => {
    const point = LOCATIONS[name];
    if (!point) throw new Error(`Unknown location ${name} in ${config.id}`);
    return point;
  });
  const coordinates = requestedPoints.map((point) => point.join(",")).join(";");
  const url = new URL(`/route/v1/driving/${coordinates}`, `${osrmBase}/`);
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("steps", "false");
  const payload = await fetchJsonWithRetry(url);
  if (payload.code !== "Ok" || !payload.routes?.[0]?.geometry?.coordinates?.length) {
    throw new Error(`OSRM returned no route for ${config.id}: ${payload.code ?? "unknown"}`);
  }

  const route = payload.routes[0];
  const points = simplifyDouglasPeucker(route.geometry.coordinates, 0.00125).map(
    roundCoordinate,
  );
  return {
    id: config.id,
    dayIds: config.dayIds,
    state: config.state,
    distanceKm: Number((route.distance / 1000).toFixed(1)),
    durationMinutes: Math.round(route.duration / 60),
    points,
    source: `${ROUTING_SNAPSHOT.engine} ${ROUTING_SNAPSHOT.engineVersion}; local/private route build; ${ROUTING_SNAPSHOT.dataProvider} ${ROUTING_SNAPSHOT.dataSet} timestamp ${ROUTING_SNAPSHOT.dataTimestamp}, MD5 ${ROUTING_SNAPSHOT.dataMd5}; fastest driving route through ordered waypoints; car baseline.${config.sourceNote ? ` ${config.sourceNote}` : ""}`,
  };
}

function buildManualRoute(config) {
  const points = config.points.map(roundCoordinate);
  return {
    id: config.id,
    dayIds: config.dayIds,
    state: config.state,
    distanceKm: Number(manualDistanceKm(points).toFixed(1)),
    durationMinutes: config.durationMinutes,
    points,
    source: config.source,
  };
}

async function readBoundary(boundaryPath) {
  const collection = JSON.parse(await readFile(boundaryPath, "utf8"));
  if (Array.isArray(collection.boundary) && collection.boundary.length) {
    return collection.boundary.map((ring) => ring.map(roundCoordinate));
  }
  const iceland = collection.features?.find(
    (feature) =>
      feature.properties?.ISO_A3 === "ISL" || feature.properties?.ADMIN === "Iceland",
  );
  if (!iceland || iceland.geometry?.type !== "Polygon") {
    throw new Error("Natural Earth snapshot does not contain Iceland as a Polygon.");
  }
  return iceland.geometry.coordinates.map((ring) => simplifyClosedRing(ring, 0.0035));
}

function calculateBounds(boundary, routes) {
  const points = [...boundary.flat(), ...routes.flatMap((route) => route.points)];
  if (
    points.some(
      (point) =>
        point[0] < MAP_BOUNDS.minLng ||
        point[0] > MAP_BOUNDS.maxLng ||
        point[1] < MAP_BOUNDS.minLat ||
        point[1] > MAP_BOUNDS.maxLat,
    )
  ) {
    throw new Error("A map point falls outside the deliberately padded Iceland bounds.");
  }
  return { ...MAP_BOUNDS };
}

function projectRouteCoordinate(coordinate, bounds) {
  const lng = Number(coordinate[0]);
  const lat = Number(coordinate[1]);
  return {
    x:
      ROUTE_PROJECTION.x +
      ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) *
        ROUTE_PROJECTION.width,
    y:
      ROUTE_PROJECTION.y +
      ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) *
        ROUTE_PROJECTION.height,
  };
}

function computeDayProgress(routes, bounds) {
  if (
    !bounds ||
    ![bounds.minLng, bounds.maxLng, bounds.minLat, bounds.maxLat].every(Number.isFinite) ||
    bounds.maxLng <= bounds.minLng ||
    bounds.maxLat <= bounds.minLat
  ) {
    throw new Error("Valid map bounds are required to derive day progress.");
  }

  const projected = [];
  const dayEndIndex = new Map();
  for (const route of routes) {
    if (route.state === "branch") continue;
    for (const coordinate of route.points) {
      if (
        !Array.isArray(coordinate) ||
        coordinate.length < 2 ||
        !Number.isFinite(Number(coordinate[0])) ||
        !Number.isFinite(Number(coordinate[1]))
      ) {
        continue;
      }
      const point = projectRouteCoordinate(coordinate, bounds);
      const previous = projected.at(-1);
      if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) > 0.5) {
        projected.push(point);
      }
    }
    for (const dayId of route.dayIds) dayEndIndex.set(dayId, projected.length - 1);
  }

  if (projected.length < 2) throw new Error("At least two projected route points are required.");
  const cumulative = [0];
  for (let index = 1; index < projected.length; index += 1) {
    cumulative.push(
      cumulative[index - 1] +
        Math.hypot(
          projected[index].x - projected[index - 1].x,
          projected[index].y - projected[index - 1].y,
        ),
    );
  }
  const total = cumulative.at(-1);
  if (!(total > 0)) throw new Error("Projected route length must be positive.");

  const progress = {};
  for (const [index, dayId] of TRIP_DAY_IDS.entries()) {
    if (index === 0) {
      progress[dayId] = 0;
      continue;
    }
    const endIndex = dayEndIndex.get(dayId);
    if (!Number.isInteger(endIndex) || endIndex < 0) {
      throw new Error(`${dayId} has no non-branch route endpoint.`);
    }
    const fraction = cumulative[endIndex] / total;
    progress[dayId] = index === TRIP_DAY_IDS.length - 1
      ? 1
      : Number(fraction.toFixed(12));
  }
  return progress;
}

function attachDayProgress(snapshot) {
  const dayProgress = computeDayProgress(snapshot.routes, snapshot.bounds);
  const refreshed = {};
  for (const [key, value] of Object.entries(snapshot)) {
    if (key === "dayProgress") continue;
    refreshed[key] = value;
    if (key === "bounds") refreshed.dayProgress = dayProgress;
  }
  if (!("dayProgress" in refreshed)) refreshed.dayProgress = dayProgress;
  return refreshed;
}

function validateWaypointOrder(route, config) {
  const waypoints = config.kind === "road"
    ? config.locations.map((name) => LOCATIONS[name])
    : config.points;
  if (
    haversineKm(route.points[0], waypoints[0]) > 2 ||
    haversineKm(route.points.at(-1), waypoints.at(-1)) > 2
  ) {
    throw new Error(`${route.id} does not begin and end at its authored endpoints.`);
  }

  let cursor = 0;
  for (const waypoint of waypoints.slice(1, -1)) {
    const relativeIndex = route.points
      .slice(cursor)
      .findIndex((point) => haversineKm(point, waypoint) < 2);
    if (relativeIndex < 0) {
      throw new Error(`${route.id} does not traverse its authored waypoints in order.`);
    }
    cursor += relativeIndex + 1;
  }
}

function validateSnapshot(snapshot) {
  if (snapshot.schemaVersion !== 1) throw new Error("schemaVersion must equal 1.");
  if (snapshot.sourceDocumentSha256 !== SOURCE_DOCUMENT_SHA256) {
    throw new Error("Route snapshot is not bound to the revised planning document.");
  }
  if (!Array.isArray(snapshot.boundary) || snapshot.boundary.length === 0) {
    throw new Error("At least one boundary polygon is required.");
  }
  if (!Array.isArray(snapshot.routes) || snapshot.routes.length === 0) {
    throw new Error("At least one route is required.");
  }
  const routingSnapshot = snapshot.routingSnapshot;
  if (
    routingSnapshot?.engine !== ROUTING_SNAPSHOT.engine ||
    routingSnapshot?.engineVersion !== ROUTING_SNAPSHOT.engineVersion ||
    routingSnapshot?.execution !== ROUTING_SNAPSHOT.execution ||
    routingSnapshot?.imageDigest !== ROUTING_SNAPSHOT.imageDigest ||
    routingSnapshot?.dataProvider !== ROUTING_SNAPSHOT.dataProvider ||
    routingSnapshot?.dataSet !== ROUTING_SNAPSHOT.dataSet ||
    routingSnapshot?.dataTimestamp !== ROUTING_SNAPSHOT.dataTimestamp ||
    routingSnapshot?.dataMd5 !== ROUTING_SNAPSHOT.dataMd5 ||
    routingSnapshot?.endpoint !== "http://127.0.0.1:18129"
  ) {
    throw new Error("Route snapshot is missing the exact local/private OSRM build provenance.");
  }
  const expectedRouteIds = ROUTE_CONFIGS.map((config) => config.id);
  if (
    snapshot.routes.length !== expectedRouteIds.length ||
    snapshot.routes.some((route, index) => route.id !== expectedRouteIds[index])
  ) {
    throw new Error("Route snapshot topology/order does not match the authored route graph.");
  }

  const seenIds = new Set();
  for (const [index, route] of snapshot.routes.entries()) {
    const config = ROUTE_CONFIGS[index];
    if (seenIds.has(route.id)) throw new Error(`Duplicate route id: ${route.id}`);
    seenIds.add(route.id);
    if (
      route.state !== config.state ||
      route.dayIds.length !== config.dayIds.length ||
      route.dayIds.some((dayId, dayIndex) => dayId !== config.dayIds[dayIndex])
    ) {
      throw new Error(`Route state/day contract drifted on ${route.id}.`);
    }
    if (!new Set(["locked", "working", "conditional", "historical", "branch"]).has(route.state)) {
      throw new Error(`Invalid state on ${route.id}.`);
    }
    if (!route.dayIds?.every((day) => /^day-2026-08-(0[9]|1\d|2[0-4])$/.test(day))) {
      throw new Error(`Invalid day id on ${route.id}.`);
    }
    if (!Array.isArray(route.points) || route.points.length < 2) {
      throw new Error(`Route ${route.id} needs at least two points.`);
    }
    if (!route.points.every(coordinateIsValid)) {
      throw new Error(`Route ${route.id} has a point outside the Iceland envelope.`);
    }
    if (!Number.isFinite(route.distanceKm) || route.distanceKm < 0) {
      throw new Error(`Route ${route.id} has invalid distance.`);
    }
    if (!Number.isFinite(route.durationMinutes) || route.durationMinutes < 0) {
      throw new Error(`Route ${route.id} has invalid duration.`);
    }
    validateWaypointOrder(route, config);
    if (
      config.kind === "road" &&
      (!route.source.includes(ROUTING_SNAPSHOT.dataTimestamp) ||
        !route.source.includes(ROUTING_SNAPSHOT.dataMd5))
    ) {
      throw new Error(`${route.id} is missing routed-source provenance.`);
    }
    for (const point of route.points) {
      if (
        point[0] < snapshot.bounds.minLng ||
        point[0] > snapshot.bounds.maxLng ||
        point[1] < snapshot.bounds.minLat ||
        point[1] > snapshot.bounds.maxLat
      ) {
        throw new Error(`Bounds do not contain every point (${route.id}).`);
      }
    }
  }

  const arrival = snapshot.routes.find((route) => route.id === "route-2026-08-09");
  if (!arrival || arrival.state !== "locked" || arrival.distanceKm < 245 || arrival.distanceKm > 265) {
    throw new Error("Locked August 9 core road baseline must be between 245 and 265 km.");
  }
  if (
    [LOCATIONS.deildartunguhver, LOCATIONS.hraunfossar].some((optionalStop) =>
      arrival.points.some((point) => haversineKm(point, optionalStop) < 5),
    )
  ) {
    throw new Error("The locked August 9 core must not traverse the optional waterfalls.");
  }
  const requiredBranches = [
    ["branch-2026-08-09-waterfalls", LOCATIONS.hraunfossar],
    ["branch-2026-08-14-husavik-town", LOCATIONS.husavikTown],
    ["branch-2026-08-16-krafla-viti", LOCATIONS.kraflaViti],
    ["branch-2026-08-16-krafla-leirhnjukur", LOCATIONS.kraflaLeirhnjukur],
    ["branch-2026-08-16-hofdi-kalfastrond", LOCATIONS.hofdi],
    ["branch-2026-08-16-skutustadagigar", LOCATIONS.skutustadagigar],
    ["branch-2026-08-17-borgarfjordur-puffins", LOCATIONS.hafnarholmi],
    ["branch-2026-08-18-borgarfjordur-to-seydisfjordur", LOCATIONS.gufufoss],
    ["branch-2026-08-21-south-coast", LOCATIONS.landeyjahofn],
    ["branch-2026-08-21-heimaey-loop", LOCATIONS.storhofdi],
    ["branch-2026-08-21-herjolfsdalur", LOCATIONS.herjolfsdalurCamp],
    ["branch-2026-08-23-perlan", LOCATIONS.perlan],
    ["branch-2026-08-23-sky-lagoon", LOCATIONS.skyLagoon],
  ];
  for (const [routeId, destination] of requiredBranches) {
    const route = snapshot.routes.find((candidate) => candidate.id === routeId);
    if (
      !route ||
      route.state !== "branch" ||
      route.distanceKm <= 0 ||
      route.durationMinutes <= 0 ||
      !route.points.some((point) => haversineKm(point, destination) < 2)
    ) {
      throw new Error(`${routeId} is missing accurate optional-branch geometry.`);
    }
  }
  const waterfallBranch = snapshot.routes.find(
    (route) => route.id === "branch-2026-08-09-waterfalls",
  );
  if (
    [LOCATIONS.deildartunguhver, LOCATIONS.hraunfossar].some(
      (stop) => !waterfallBranch.points.some((point) => haversineKm(point, stop) < 2),
    )
  ) {
    throw new Error("The waterfall branch must pass both researched waterfall stops.");
  }
  const currentDayRoute = snapshot.routes.find((route) => route.id === "route-2026-08-13");
  if (
    !currentDayRoute ||
    currentDayRoute.state !== "locked" ||
    !currentDayRoute.points.some((point) => haversineKm(point, LOCATIONS.kolugljufur) < 2) ||
    haversineKm(currentDayRoute.points.at(-1), LOCATIONS.hamrarCamp) > 2
  ) {
    throw new Error("The locked August 13 route must pass Kolugljúfur and finish at Hamrar.");
  }
  const ferryRoutes = snapshot.routes.filter((route) => /ferry/i.test(route.id));
  if (
    ferryRoutes.length !== 2 ||
    ferryRoutes.some(
      (route) =>
        route.state !== "branch" ||
        route.durationMinutes !== 35 ||
        !route.source.includes("https://herjolfur.is/en/frequently-asked-questions/"),
    )
  ) {
    throw new Error("Both ferry lines must use Herjolfur's official 35-minute schedule.");
  }
  const eastfjordsRoute = snapshot.routes.find((route) => route.id === "route-2026-08-19");
  if (
    !eastfjordsRoute ||
    !eastfjordsRoute.points.some(
      (point) => haversineKm(point, LOCATIONS.breiddalsvikCoastVia) < 2,
    )
  ) {
    throw new Error("The August 19 route must pass Breiðdalsvík and avoid Öxi/939.");
  }
  for (const date of ["09", "14", "16", "17", "18", "21", "23"]) {
    const day = `day-2026-08-${date}`;
    if (!snapshot.routes.some((route) => route.state === "branch" && route.dayIds.includes(day))) {
      throw new Error(`Expected branch geometry for ${day}.`);
    }
  }
  if (snapshot.routes.some((route) => /bardastrandar|barðastrandar/i.test(route.id))) {
    throw new Error("Bardastrandarsandur must remain unplaced and unrouted.");
  }
  const chronologicalRoutes = snapshot.routes.filter((route) => route.state !== "branch");
  for (let index = 1; index < chronologicalRoutes.length; index += 1) {
    const previous = chronologicalRoutes[index - 1];
    const current = chronologicalRoutes[index];
    const gapKm = haversineKm(previous.points.at(-1), current.points[0]);
    if (gapKm > 2) {
      throw new Error(
        `Chronological route discontinuity between ${previous.id} and ${current.id}: ${gapKm.toFixed(1)} km.`,
      );
    }
  }
  const expectedDayProgress = computeDayProgress(snapshot.routes, snapshot.bounds);
  const actualDayIds = Object.keys(snapshot.dayProgress ?? {});
  if (
    actualDayIds.length !== TRIP_DAY_IDS.length ||
    actualDayIds.some((dayId, index) => dayId !== TRIP_DAY_IDS[index])
  ) {
    throw new Error("dayProgress must contain every August 8–24 day in order.");
  }
  let previousProgress = -1;
  for (const dayId of TRIP_DAY_IDS) {
    const actual = snapshot.dayProgress[dayId];
    const expected = expectedDayProgress[dayId];
    if (!Number.isFinite(actual) || Math.abs(actual - expected) > 1e-12) {
      throw new Error(`${dayId} dayProgress does not match the projected route ledger.`);
    }
    if (actual < previousProgress) {
      throw new Error(`${dayId} dayProgress is not monotonic.`);
    }
    previousProgress = actual;
  }
  if (snapshot.dayProgress[TRIP_DAY_IDS[0]] !== 0 || snapshot.dayProgress[TRIP_DAY_IDS.at(-1)] !== 1) {
    throw new Error("dayProgress must begin at 0 and end at 1.");
  }
  return snapshot;
}

async function buildSnapshot(boundaryPath, osrmBase) {
  const boundary = await readBoundary(boundaryPath);
  const routes = [];
  for (const config of ROUTE_CONFIGS) {
    const route =
      config.kind === "road" ? await buildRoadRoute(config, osrmBase) : buildManualRoute(config);
    routes.push(route);
    process.stderr.write(
      `${route.id}: ${route.distanceKm.toFixed(1)} km / ${route.durationMinutes} min\n`,
    );
    if (config.kind === "road") await wait(250);
  }
  const bounds = calculateBounds(boundary, routes);

  const snapshot = {
    schemaVersion: 1,
    sourceDocumentSha256: SOURCE_DOCUMENT_SHA256,
    generatedAt: new Date().toISOString(),
    routingSnapshot: {
      ...ROUTING_SNAPSHOT,
      endpoint: osrmBase,
    },
    attribution: [
      {
        name: "© OpenStreetMap contributors",
        url: "https://www.openstreetmap.org/copyright",
        license: "ODbL 1.0",
        usage: "Road graph underlying the routed geometry and measurements",
        snapshotDate: SNAPSHOT_DATE,
      },
      {
        name: "OSRM",
        url: "https://project-osrm.org/",
        license: "BSD-2-Clause software; OpenStreetMap data remains ODbL",
        usage: "Fastest-route geometry, distance, and unbuffered car duration",
        snapshotDate: SNAPSHOT_DATE,
      },
      {
        name: "Geofabrik Download Server",
        url: "https://download.geofabrik.de/europe/iceland.html",
        license: "OpenStreetMap data is ODbL 1.0",
        usage: `Iceland PBF timestamp ${ROUTING_SNAPSHOT.dataTimestamp}; verified MD5 ${ROUTING_SNAPSHOT.dataMd5}`,
        snapshotDate: SNAPSHOT_DATE,
      },
      {
        name: "Natural Earth",
        url: "https://www.naturalearthdata.com/about/terms-of-use/",
        license: "Public domain",
        usage: "1:50m Iceland coastline",
        snapshotDate: SNAPSHOT_DATE,
      },
    ],
    bounds,
    dayProgress: computeDayProgress(routes, bounds),
    boundary,
    routes,
  };
  return validateSnapshot(snapshot);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const configSummary = validateRouteConfigs();
  if (args.configOnly) {
    process.stdout.write(
      `Validated ${configSummary.routeCount} route configs: ${configSummary.chronologicalCount} chronological and ${configSummary.branchCount} branch routes.\n`,
    );
    return;
  }
  if (args.progressOnly) {
    const snapshot = JSON.parse(await readFile(args.outputPath, "utf8"));
    const refreshed = attachDayProgress(snapshot);
    validateSnapshot(refreshed);
    await writeFile(args.outputPath, `${JSON.stringify(refreshed, null, 2)}\n`, "utf8");
    process.stdout.write(
      `Refreshed ${TRIP_DAY_IDS.length} day-progress entries in ${args.outputPath} without routing calls.\n`,
    );
    return;
  }
  if (args.validateOnly) {
    const snapshot = JSON.parse(await readFile(args.outputPath, "utf8"));
    validateSnapshot(snapshot);
    process.stdout.write(
      `Validated ${snapshot.routes.length} routes and ${snapshot.boundary.length} boundary polygon(s).\n`,
    );
    return;
  }

  const snapshot = await buildSnapshot(args.boundaryPath, args.osrmBase);
  await writeFile(args.outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  process.stdout.write(
    `Wrote ${args.outputPath} with ${snapshot.routes.length} routes and ${snapshot.boundary.length} boundary polygon(s).\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
