#!/usr/bin/env node

/**
 * Build the self-contained Iceland 2026 map snapshot.
 *
 * Road geometry and car-baseline measurements come from OSRM's public demo
 * server over OpenStreetMap data. The island outline comes from Natural Earth
 * 1:50m Admin 0 Countries. Both inputs are reduced to the precision needed by
 * the trip-board SVG before being written to iceland26/map-data.json.
 *
 * Refresh road geometry while reusing the committed coastline:
 *   node scripts/build-iceland26-map-data.mjs
 *
 * Refresh from a newer Natural Earth source:
 *   node scripts/build-iceland26-map-data.mjs \
 *     --boundary /path/to/ne_50m_admin_0_countries_lakes.geojson
 *
 * Validation without network access:
 *   node scripts/build-iceland26-map-data.mjs --validate-only
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_OUTPUT_PATH = path.join(REPO_ROOT, "iceland26", "map-data.json");
const DEFAULT_BOUNDARY_PATH = DEFAULT_OUTPUT_PATH;
const OSRM_BASE = "https://router.project-osrm.org";
const SNAPSHOT_DATE = "2026-08-08";
const SOURCE_DOCUMENT_SHA256 = "523d988f965ef24cbfef2141d284f460c8361f4d137e4f0be1fbdf73d1f116aa";
const MAP_BOUNDS = Object.freeze({
  minLng: -25,
  maxLng: -13,
  minLat: 63.2,
  maxLat: 66.7,
});

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
  // Official 2026 eclipse gathering-site pin beside the airstrip.
  arngerdareyri: [-22.36156, 65.90575],
  hvitserkur: [-20.625727, 65.607127],
  varmahlid: [-19.464418, 65.555644],
  akureyri: [-18.112176, 65.683904],
  godafoss: [-17.54958, 65.682821],
  reykjahlid: [-16.910007, 65.641561],
  hauganes: [-18.299683, 65.923266],
  hverir: [-16.809182, 65.641143],
  dettifossWest: [-16.3994, 65.8122],
  studlagilWest: [-15.308125, 65.162327],
  egilsstadir: [-14.3948, 65.2669],
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
  gullfoss: [-20.130594, 64.325235],
  geysir: [-20.300735, 64.309511],
  thingvellirP1: [-21.128043, 64.25541],
  reykjadalurTrailhead: [-21.21116, 64.021156],
  reykjavikEco: [-21.874213, 64.145228],
  perlan: [-21.919028, 64.129246],
  skyLagoon: [-21.946435, 64.116465],
});

const road = (id, day, state, locations) => ({
  id,
  dayIds: [day],
  state,
  locations,
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
    "deildartunguhver",
    "hraunfossar",
    "bjarkalundur",
  ]),
  road("route-2026-08-10", "day-2026-08-10", "working", [
    "bjarkalundur",
    "hellulaug",
    "flokalundur",
    "patreksfjordurCamp",
  ]),
  road("branch-2026-08-10-raudasandur", "day-2026-08-10", "branch", [
    "patreksfjordurCamp",
    "raudasandur",
  ]),
  road("branch-2026-08-10-latrabjarg", "day-2026-08-10", "branch", [
    "patreksfjordurCamp",
    "latrabjarg",
  ]),
  road("route-2026-08-11", "day-2026-08-11", "working", [
    "patreksfjordurCamp",
    "flokalundur",
    "dynjandi",
    "arngerdareyri",
  ]),
  road("branch-2026-08-11-booked-base-backtrack", "day-2026-08-11", "branch", [
    "dynjandi",
    "bjarkalundur",
  ]),
  manual(
    "route-2026-08-12",
    "day-2026-08-12",
    "working",
    [LOCATIONS.arngerdareyri, LOCATIONS.arngerdareyri],
    0,
    "Stationary working plan at Arngerdareyri; no eclipse-day site chasing.",
  ),
  road("branch-2026-08-12-patreksfjordur-eclipse", "day-2026-08-12", "branch", [
    "arngerdareyri",
    "patreksfjordurCamp",
  ]),
  road("route-2026-08-13", "day-2026-08-13", "working", [
    "arngerdareyri",
    "hvitserkur",
    "varmahlid",
  ]),
  road("route-2026-08-14", "day-2026-08-14", "working", [
    "varmahlid",
    "akureyri",
    "godafoss",
    "reykjahlid",
  ]),
  road("branch-2026-08-14-hauganes", "day-2026-08-14", "branch", [
    "akureyri",
    "hauganes",
    "akureyri",
  ]),
  road("route-2026-08-15", "day-2026-08-15", "working", [
    "reykjahlid",
    "hverir",
    "dettifossWest",
    "studlagilWest",
    "egilsstadir",
  ]),
  road("branch-2026-08-15-seydisfjordur", "day-2026-08-15", "branch", [
    "egilsstadir",
    "seydisfjordurCamp",
    "egilsstadir",
  ]),
  road("branch-2026-08-15-hafnarholmi", "day-2026-08-15", "branch", [
    "egilsstadir",
    "hafnarholmi",
    "egilsstadir",
  ]),
  road("route-2026-08-16", "day-2026-08-16", "working", [
    "egilsstadir",
    "breiddalsvikCoastVia",
    "djupivogurCamp",
    "stokksnesGate",
  ]),
  road("route-2026-08-17", "day-2026-08-17", "working", [
    "stokksnesGate",
    "jokulsarlon",
    "skaftafell",
    "fjadrargljufur",
    "eldhraun",
    "vik",
  ]),
  road("route-2026-08-18", "day-2026-08-18", "working", [
    "vik",
    "reynisfjara",
    "dyrholaeyLower",
    "skogafoss",
    "seljalandsfoss",
    "landeyjahofn",
  ]),
  manual(
    "route-2026-08-19-ferry-outbound",
    "day-2026-08-19",
    "working",
    [LOCATIONS.landeyjahofn, LOCATIONS.heimaeyHarbor],
    35,
    "Manual ferry line; official FAQ states a 35-minute sailing: https://herjolfur.is/en/frequently-asked-questions/ ; departure times: https://herjolfur.is/en/schedule/ (snapshot 2026-08-08).",
  ),
  road("branch-2026-08-19-heimaey-loop", "day-2026-08-19", "branch", [
    "heimaeyHarbor",
    "belugaSanctuary",
    "eldfellParking",
    "storhofdi",
    "heimaeyHarbor",
  ]),
  manual(
    "route-2026-08-19-ferry-return",
    "day-2026-08-19",
    "working",
    [LOCATIONS.heimaeyHarbor, LOCATIONS.landeyjahofn],
    35,
    "Manual ferry line; official FAQ states a 35-minute sailing: https://herjolfur.is/en/frequently-asked-questions/ ; departure times: https://herjolfur.is/en/schedule/ (snapshot 2026-08-08).",
  ),
  road("route-2026-08-20", "day-2026-08-20", "working", [
    "landeyjahofn",
    "gullfoss",
    "geysir",
    "thingvellirP1",
  ]),
  road("route-2026-08-21", "day-2026-08-21", "working", [
    "thingvellirP1",
    "reykjadalurTrailhead",
    "reykjavikEco",
  ]),
  manual(
    "route-2026-08-22",
    "day-2026-08-22",
    "working",
    [LOCATIONS.reykjavikEco, LOCATIONS.reykjavikEco],
    0,
    "Stationary Reykjavik weather and recovery buffer.",
  ),
  road("route-2026-08-23", "day-2026-08-23", "working", [
    "reykjavikEco",
    "perlan",
    "reykjavikEco",
  ]),
  road("branch-2026-08-23-sky-lagoon", "day-2026-08-23", "branch", [
    "perlan",
    "skyLagoon",
    "reykjavikEco",
  ]),
  road("route-2026-08-24", "day-2026-08-24", "working", ["reykjavikEco", "kef"]),
]);

function parseArgs(argv) {
  const parsed = {
    boundaryPath: DEFAULT_BOUNDARY_PATH,
    outputPath: DEFAULT_OUTPUT_PATH,
    validateOnly: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--boundary") {
      parsed.boundaryPath = path.resolve(argv[++index]);
    } else if (argument === "--output") {
      parsed.outputPath = path.resolve(argv[++index]);
    } else if (argument === "--validate-only") {
      parsed.validateOnly = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
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

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchJsonWithRetry(url, attempts = 4) {
  let finalError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "carboncaste-iceland26-route-snapshot/1.0" },
        signal: AbortSignal.timeout(45_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      finalError = error;
      if (attempt < attempts) await wait(500 * attempt);
    }
  }
  throw new Error(`OSRM request failed after ${attempts} attempts: ${finalError.message}`);
}

async function buildRoadRoute(config) {
  const requestedPoints = config.locations.map((name) => {
    const point = LOCATIONS[name];
    if (!point) throw new Error(`Unknown location ${name} in ${config.id}`);
    return point;
  });
  const coordinates = requestedPoints.map((point) => point.join(",")).join(";");
  const url = new URL(`/route/v1/driving/${coordinates}`, OSRM_BASE);
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
    source: `${OSRM_BASE}; OpenStreetMap road graph; fastest driving route through ordered waypoints; car baseline; snapshot ${SNAPSHOT_DATE}.`,
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

  const seenIds = new Set();
  for (const route of snapshot.routes) {
    if (seenIds.has(route.id)) throw new Error(`Duplicate route id: ${route.id}`);
    seenIds.add(route.id);
    if (!new Set(["locked", "working", "branch"]).has(route.state)) {
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
  if (!arrival || arrival.state !== "locked" || arrival.distanceKm < 325 || arrival.distanceKm > 355) {
    throw new Error("Locked August 9 road baseline must be between 325 and 355 km.");
  }
  const ferryRoutes = snapshot.routes.filter((route) => /ferry/i.test(route.id));
  if (
    ferryRoutes.length !== 2 ||
    ferryRoutes.some(
      (route) =>
        route.durationMinutes !== 35 ||
        !route.source.includes("https://herjolfur.is/en/frequently-asked-questions/"),
    )
  ) {
    throw new Error("Both ferry lines must use Herjolfur's official 35-minute schedule.");
  }
  const eastfjordsRoute = snapshot.routes.find((route) => route.id === "route-2026-08-16");
  if (
    !eastfjordsRoute ||
    !eastfjordsRoute.points.some(
      (point) => haversineKm(point, LOCATIONS.breiddalsvikCoastVia) < 2,
    )
  ) {
    throw new Error("The August 16 route must pass Breiddalsvik and avoid Oxi/939.");
  }
  for (const date of ["10", "11", "14", "15", "19", "23"]) {
    const day = `day-2026-08-${date}`;
    if (!snapshot.routes.some((route) => route.state === "branch" && route.dayIds.includes(day))) {
      throw new Error(`Expected branch geometry for ${day}.`);
    }
  }
  if (snapshot.routes.some((route) => /bardastrandar|barðastrandar/i.test(route.id))) {
    throw new Error("Bardastrandarsandur must remain unplaced and unrouted.");
  }
  return snapshot;
}

async function buildSnapshot(boundaryPath) {
  const boundary = await readBoundary(boundaryPath);
  const routes = [];
  for (const config of ROUTE_CONFIGS) {
    const route =
      config.kind === "road" ? await buildRoadRoute(config) : buildManualRoute(config);
    routes.push(route);
    process.stderr.write(
      `${route.id}: ${route.distanceKm.toFixed(1)} km / ${route.durationMinutes} min\n`,
    );
    if (config.kind === "road") await wait(250);
  }

  const snapshot = {
    schemaVersion: 1,
    sourceDocumentSha256: SOURCE_DOCUMENT_SHA256,
    generatedAt: new Date().toISOString(),
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
        name: "Natural Earth",
        url: "https://www.naturalearthdata.com/about/terms-of-use/",
        license: "Public domain",
        usage: "1:50m Iceland coastline",
        snapshotDate: SNAPSHOT_DATE,
      },
    ],
    bounds: calculateBounds(boundary, routes),
    boundary,
    routes,
  };
  return validateSnapshot(snapshot);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.validateOnly) {
    const snapshot = JSON.parse(await readFile(args.outputPath, "utf8"));
    validateSnapshot(snapshot);
    process.stdout.write(
      `Validated ${snapshot.routes.length} routes and ${snapshot.boundary.length} boundary polygon(s).\n`,
    );
    return;
  }

  const snapshot = await buildSnapshot(args.boundaryPath);
  await writeFile(args.outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  process.stdout.write(
    `Wrote ${args.outputPath} with ${snapshot.routes.length} routes and ${snapshot.boundary.length} boundary polygon(s).\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
