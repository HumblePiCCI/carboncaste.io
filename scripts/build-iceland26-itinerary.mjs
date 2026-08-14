#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function parseArgs(argv) {
  let outputPath = resolve('iceland26/itinerary.json');
  let sourcePath = null;
  let usedPositionalOutput = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--source') {
      sourcePath = resolve(argv[++index]);
    } else if (argument === '--output') {
      outputPath = resolve(argv[++index]);
    } else if (!argument.startsWith('-') && !usedPositionalOutput) {
      outputPath = resolve(argument);
      usedPositionalOutput = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return { outputPath, sourcePath };
}

const args = parseArgs(process.argv.slice(2));
const outputPath = args.outputPath;
const originalText = args.sourcePath
  ? await readFile(args.sourcePath, 'utf8')
  : execFileSync('git', ['show', 'HEAD:iceland26/itinerary.json'], { encoding: 'utf8' });
const original = JSON.parse(originalText);
const SOURCE_DOCUMENT_SHA256 = 'f961d86b89d5a546f7d5d988f74c729a67c51139ab6ef151a2a2ce19d5702953';
const localMap = JSON.parse(await readFile(resolve('iceland26/map-data.json'), 'utf8'));
if (localMap.sourceDocumentSha256 !== SOURCE_DOCUMENT_SHA256) {
  throw new Error('Local map snapshot is not pinned to the current planning document.');
}
const localOsrmAttribution = (localMap.attribution || [])
  .find((entry) => entry.name === 'OSRM');
const localGeofabrikAttribution = (localMap.attribution || [])
  .find((entry) => /Geofabrik/i.test(entry.name));
if (!localOsrmAttribution || !localGeofabrikAttribution) {
  throw new Error('Local map snapshot is missing OSRM/Geofabrik provenance.');
}

const localCoreRoutesByDay = new Map();
for (const route of localMap.routes || []) {
  if (route.state === 'branch') continue;
  for (const routeDayId of route.dayIds || []) {
    if (localCoreRoutesByDay.has(routeDayId)) {
      throw new Error(`Local map has multiple core routes for ${routeDayId}.`);
    }
    localCoreRoutesByDay.set(routeDayId, route);
  }
}

const conservativeCamperMinutes = (baseMinutes) => (
  baseMinutes === 0 ? 0 : Math.ceil((baseMinutes * 1.35) / 5) * 5
);

function localCoreRouteForDate(date) {
  const routeDayId = `day-${date}`;
  if (date === '2026-08-08') {
    return { distanceKm: 0, baseMinutes: 0, camperMinutes: 0, progress: 0 };
  }
  const localRoute = localCoreRoutesByDay.get(routeDayId);
  const progress = localMap.dayProgress?.[routeDayId];
  if (!localRoute || !Number.isFinite(localRoute.distanceKm)
      || !Number.isFinite(localRoute.durationMinutes) || !Number.isFinite(progress)) {
    throw new Error(`Local map is missing a complete core route ledger for ${routeDayId}.`);
  }
  return {
    distanceKm: localRoute.distanceKm,
    baseMinutes: localRoute.durationMinutes,
    camperMinutes: conservativeCamperMinutes(localRoute.durationMinutes),
    progress,
  };
}

const dayId = (date) => `day-${date}`;
const source = (label, url, type = 'official') => ({ label, url, type });
const map = (lat, lng, labelOffset = [14, -11]) => ({ lat, lng, labelOffset });
const family = (fit, stroller, carrier, hazards = [], notes = '') => ({
  fit,
  stroller,
  carrier,
  hazards,
  notes,
});
const booking = (required, notes, url = '', phone = '', label = 'Official page ↗') => ({
  required,
  notes,
  ...(url ? { url, label } : {}),
  ...(phone ? { phone } : {}),
});

const COMMON_FAMILY = family(
  'Possible for the whole group when the day’s drive and weather still leave enough margin.',
  'Check the exact surface at the stop.',
  'Useful for uneven ground.',
  [],
  'Two young travellers set the pace; live conditions can turn an easy stop into the wrong stop.',
);

const details = {
  'arrival-bjarkalundur': {
    location: 'Keflavík → Borgarnes → Bjarkalundur',
    status: 'booked',
    documentStatus: 'Flights, two motorhomes and the Bjarkalundur base are recorded as booked. The licence plates still need to be added and the “August 9–12 / four nights” wording needs confirmation.',
    dayIds: [dayId('2026-08-09')], map: map(65.556306, -22.103905, [14, 18]),
    visit: { duration: 'Full arrival day', walk: 'Short service stops', difficulty: 'High-load travel day' },
    family: family('Manageable only if pickup, groceries and the drive remain the day’s real priorities.', 'Yes at service stops', 'Not normally needed', ['Jet lag', 'Long first drive', 'Gravel and wind near the Westfjords'], 'Skip optional attractions if pickup or provisioning runs late.'),
    amenities: ['Nettó groceries in Borgarnes', 'Fuel and toilets in service towns', 'Bjarkalundur toilets/showers', 'Electricity', 'Restaurant/shop', 'Playground'],
    booking: booking(true, 'Reservation recorded in the source. Confirm exact checkout morning and add both vehicle plates; private confirmation details stay off this board.', 'https://www.hotelbjarkalundur.is/campsite', '+354 562 1900', 'Bjarkalundur campsite ↗'),
    pros: ['Preserves the one genuinely booked Iceland sleeping base.', 'Groceries before the remote-road section.', 'Short waterfall walks can be cut without breaking the day.'],
    drawbacks: ['The direct core is 255.5 km / 3h46 car baseline before pickup, groceries or visits; the conservative camper plan is 5 hours.', 'Eiríksstaðir is not realistic after a normal pickup and the optional waterfall branch.', 'The booking dates conflict with the efficient Westfjords sequence.'],
  },
  'borgarfjordur-waterfalls': {
    location: 'West Iceland · Deildartunguhver and Hraunfossar', status: 'conditional',
    documentStatus: 'Planned arrival-day stops; not booked and first to cut if pickup runs late. The locked arrival route now bypasses this branch.',
    planningContext: 'From the Borgarnes provision stop, the measured waterfall branch via Deildartunguhver and Hraunfossar to Bjarkalundur is 218.0 km / 3h10 car baseline. That is the branch total, not an incremental delta from the direct route.',
    logistics: ['Optional branch after Borgarnes', '218.0 km / 3h10 car baseline from provision stop', 'Visits and camper/weather margin excluded'],
    dayIds: [dayId('2026-08-09')], map: map(64.702799, -20.977717),
    visit: { duration: '1h20–2h combined', walk: 'About 1 km at the falls', difficulty: 'Easy marked paths' },
    family: family('Strong short-stop introduction if everyone still has energy.', 'Main viewpoints only', 'Not needed on the main paths', ['Near-boiling water and steam at Deildartunguhver', 'Fast river and cliff edges at Barnafoss'], 'Direct adult supervision matters at both sites.'),
    amenities: ['Parking', 'Toilets/restaurant at Hraunfossar', 'Nearby food/toilets at Krauma (separate business)'],
    booking: booking(false, 'The nature stops do not require advance booking.'),
    pros: ['Two distinctive landscapes with little walking.', 'Easy to shorten or drop.', 'Hraunfossar is a gentle first waterfall stop.'],
    drawbacks: ['Adds time to an already long arrival day.', 'Deildartunguhver is a serious scald hazard, not a soak.', 'Every minute here delays the slowest road section.'],
    extraSources: [source('Official West Iceland · Deildartunguhver', 'https://www.west.is/en/destinations/nature-1/deildartunguhver-thermal-spring')],
  },
  'hellulaug-coast': {
    location: 'Southern Westfjords · Hellulaug/Flókalundur', status: 'working',
    documentStatus: 'A candidate on the southern-Westfjords day. The source also names an unverified Barðastrandarsandur pin; that beach remains scenery-only until legal parking is confirmed.',
    dayIds: [dayId('2026-08-10')], map: map(65.577156, -23.159701),
    visit: { duration: '30–60m soak', walk: 'Short uneven access', difficulty: 'Easy but slippery' },
    family: family('A memorable reset with constant hands-on child supervision.', 'No', 'Helpful for the approach', ['Unstaffed hot pool', 'Slippery rock', 'Roadside parking capacity'], 'No lifeguard, changing room or verified onsite toilet; Flókalundur is 0.7 km away.'),
    amenities: ['Small parking area', 'Flókalundur toilets/showers nearby', 'Flókalundur fuel/restaurant/minimarket'],
    booking: booking(false, 'Hellulaug is free and unbooked. Phone Flókalundur before relying on eclipse-week camping.', 'https://www.westfjords.is/is/stadur/hellulaug'),
    pros: ['Sea-edge setting and naturally warm water.', 'Fits the road sequence to Patreksfjörður.', 'Nearby Flókalundur supplies the missing services.'],
    drawbacks: ['Tiny, unstaffed and potentially busy.', 'No changing facilities.', 'Does not make the full Látrabjarg loop realistic.'],
    extraSources: [source('Flókalundur services', 'https://www.westfjords.is/en/service/hotel-flokalundur')],
  },
  dynjandi: {
    location: 'Arnarfjörður · Road 60', status: 'open',
    documentStatus: 'The document asks “Dynjandi or Látrabjarg.” Dynjandi is not booked and works best as a forward-moving day, not a Bjarkalundur round trip.',
    dayIds: [dayId('2026-08-11')], map: map(65.736568, -23.209067),
    visit: { duration: '60–90m', walk: 'Lower paved access; upper cascade trail', difficulty: 'Easy low view / steep uneven upper path' },
    family: family('Excellent family payoff because the lower falls are worthwhile even if the upper path is too much.', 'Lower Hrísvaðsfoss route only', 'Useful above the lower view', ['Wet rock', 'Steep upper path', 'Fast water'], 'Turn around wherever the youngest pace says; the full climb is not required.'),
    amenities: ['Toilets', 'Water', 'Motorhome parking', 'Accessible parking', 'Picnic/cooking area', 'Charging', 'No overnighting'],
    booking: booking(false, 'No attraction reservation. Pay the current parking/service fee and do not overnight.', 'https://www.ust.is/english/visiting-iceland/protected-areas/westfjords/dynjandi-in-arnarfjordur/access-and-services/', '+354 575 8400', 'Official access and services ↗'),
    pros: ['The strongest repeat “Westfjords highlight” signal in the research.', 'Layered waterfalls reward even a partial walk.', 'Moves the route clockwise instead of creating another southern detour.'],
    drawbacks: ['Road 60 is slow and substantially gravel in this corridor.', 'Returning to Bjarkalundur adds roughly 141 km and 2 hours of car baseline.', 'Upper trail is steep, wet and not stroller-friendly.'],
  },
  'latrabjarg-raudasandur': {
    title: 'Látrabjarg bird cliffs', shortTitle: 'Látrabjarg',
    location: 'Far southwest Westfjords · Road 612', status: 'conditional',
    documentStatus: 'The source pairs this with Rauðasandur. This card isolates Látrabjarg so the group can rank the two slow-road commitments independently.',
    dayIds: [dayId('2026-08-10')], map: map(65.502433, -24.529652, [-118, -12]),
    visit: { duration: '2–3h with access', walk: 'Flexible cliff-top path', difficulty: 'Slow gravel road + unguarded terrain' },
    family: family('Only as a deliberate, closely supervised cliff destination with a southern overnight.', 'No', 'Useful', ['Loose unprotected fatal cliff edge', 'Narrow gravel Road 612', 'High wind', 'Limited cell/service'], 'Keep children hand-held and well back from the edge; the turf can undercut. Do not promise late-season puffins.'),
    amenities: ['Very limited at the cliffs', 'No confirmed onsite toilet', 'Services in Patreksfjörður'],
    booking: booking(false, 'No nature-site booking. Recheck Road 612 and reserve a southern sleep before committing.'),
    pros: ['Extraordinary cliff scale and ocean views.', 'World-class bird habitat even when puffin numbers are lower.', 'Flexible walking once safely parked.'],
    drawbacks: ['The slow remote approach is most of the commitment.', 'Late-season puffins are uncertain.', 'The loose unguarded edge demands constant supervision.'],
  },
  'eclipse-patreksfjordur': {
    location: 'Patreksfjörður designated gathering site', status: 'open',
    documentStatus: 'August 12 and the eclipse are fixed; Patreksfjörður is one open viewing/sleep candidate, not a booking.',
    dayIds: [dayId('2026-08-12')], map: map(65.591283, -23.974097, [-124, 22]),
    visit: { duration: 'Stage early; remain well after 18:45', walk: 'Town gathering-site dependent', difficulty: 'Crowd/traffic logistics day' },
    family: family('The service-rich family default if nearby sleep is confirmed.', 'Designated-site dependent', 'Not normally needed', ['Eye injury without ISO 12312-2 glasses', 'Crowds', 'Cold/wind', 'One-way roads', 'No shoulder stopping'], 'Partial begins 16:43, totality is about 17:44–17:46, partial ends 18:45. Pick a primary and backup; do not site-hop.'),
    amenities: ['Designated parking/toilets', 'Town food and fuel', 'Pool and emergency support nearby'],
    booking: booking('Site choice and nearby sleep must be settled; normal attraction booking is not the gate.', 'Roads 612/614 become controlled one-way corridors. Arrive early, stay late and never park on a road or shoulder.', 'https://www.westfjords.is/en/experiences/solar-eclipse-2026', '+354 450 8060', 'Official eclipse plan ↗'),
    pros: ['Patreksfjörður provides about 2m04s totality with real services.', 'A designated gathering site reduces improvisation.', 'Once staged, this can be a slow outdoor day.'],
    drawbacks: ['Creates a major southbound/backtrack commitment from the working northbound route.', 'Immediate return to Bjarkalundur conflicts with official stay-late guidance.', 'The campsite/sleep plan is not booked.'],
  },
  'hvitserkur-skagafjordur': {
    location: 'Northwest transition · Hvítserkur to Varmahlíð', status: 'working',
    documentStatus: 'The document’s northbound Option 1; no campsite is booked.',
    dayIds: [dayId('2026-08-13')], map: map(65.607127, -20.625727),
    visit: { duration: '45–75m at Hvítserkur', walk: 'Short upper viewpoint', difficulty: 'Gravel detour; steep beach descent optional' },
    family: family('Use the upper viewpoint and treat Varmahlíð as the service/overnight goal.', 'Upper area only if conditions allow', 'Useful for rough access', ['Steep beach path', 'Tide', 'Long gravel approach'], 'The 334 km Arngerðareyri–Hvítserkur–Varmahlíð line is already a full camper day.'),
    amenities: ['Varmahlíð toilets/showers', 'Kitchen/lounge', 'Laundry/electricity', 'Nearby food/fuel/grocery'],
    booking: booking('Confirm Varmahlíð capacity; the nature stop is unbooked.', 'No reliable toilet is confirmed at the Hvítserkur lot.', 'https://www.northiceland.is/en/service/varmahlid-camping-ground', '+354 899 3231', 'Varmahlíð campsite ↗'),
    pros: ['Breaks the west-to-north transfer into a defensible day.', 'Distinctive sea stack and possible seals.', 'Ends at a useful family service base.'],
    drawbacks: ['Road 711 is a slow washboard/pothole detour.', 'No wildlife guarantee.', 'Little capacity remains for Akureyri or Mývatn that day.'],
  },
  'hauganes-whales': {
    location: 'Eyjafjörður · north of Akureyri', status: 'conditional',
    documentStatus: 'Explicitly questioned as out of the way. It is a separate 68.5 km return detour, not an eastbound stop.',
    dayIds: [dayId('2026-08-14')], map: map(65.923266, -18.299683, [14, -14]),
    visit: { duration: '3.5–4h with check-in', walk: 'Harbour boarding', difficulty: 'Cold open-water tour' },
    family: family('Operator handles families well, but cold, duration and motion sickness are real variables.', 'Harbour dependent', 'Not applicable aboard', ['Cold/wet exposure', 'Seasickness', 'No sighting guarantee'], 'Only keep it by giving up another north/east commitment.'),
    amenities: ['Harbour facilities', 'Village restaurant/hot tubs/camp', 'Safety clothing from operator'],
    booking: booking(true, 'Published 13:30 departure runs only when minimums/conditions are met; reserve and reconfirm.', 'https://whales.is/', '+354 867 0000', 'Whale Watching Hauganes ↗'),
    pros: ['Excellent review signal with many trip-highlight reports.', 'Small-village harbour experience.', 'Family reports praise crew handling.'],
    drawbacks: ['Consumes roughly four hours plus an out-and-back drive.', 'Wildlife and sea state are never guaranteed.', 'Crowding/cold appear in recent drawbacks.'],
  },
  godafoss: {
    location: 'Route 1 · east of Akureyri', status: 'working',
    documentStatus: 'Listed in the north chapter; not booked.',
    dayIds: [dayId('2026-08-14')], map: map(65.682821, -17.54958),
    visit: { duration: '45–60m', walk: 'Short marked viewpoints', difficulty: 'Easy' },
    family: family('A high-payoff, low-complexity family stop directly on the eastbound line.', 'Some main areas', 'Not needed', ['Fast water', 'Wet paths'], 'Use the easiest bank/viewpoints the weather supports.'),
    amenities: ['Parking', 'Summer café/shop', 'Restrooms'],
    booking: booking(false, 'No attraction reservation.'),
    pros: ['Directly on route.', 'Several views with little walking.', 'Easy to time-box.'],
    drawbacks: ['Can be busy.', 'Mist and edges need supervision.', 'Do not let a simple stop grow into a schedule delay.'],
    extraSources: [source('Official North Iceland', 'https://www.northiceland.is/en/destinations/nature/scenic-nature/godafoss-waterfall')],
  },
  'hverir-hverfjall': {
    title: 'Hverir geothermal area', shortTitle: 'Hverir',
    location: 'Námaskarð · Lake Mývatn', status: 'open',
    documentStatus: 'Named separately in the source. The legacy combined ID remains attached to Hverir so existing rankings and notes survive; Hverfjall now has its own card.',
    planningContext: 'This is the short geothermal stop. Rank the longer crater hike independently instead of treating both as one commitment.',
    logistics: ['30–60 minutes', 'Stay on marked paths', 'Paid parking/current access to recheck'],
    dayIds: [dayId('2026-08-14'), dayId('2026-08-15')], map: map(65.641143, -16.809182, [14, 20]),
    visit: { duration: '30–60m', walk: 'Short marked geothermal paths', difficulty: 'Easy walking / severe off-path hazard' },
    family: family('A short, vivid whole-family stop only with strict path discipline.', 'No', 'Usually unnecessary', ['Severe geothermal burns', 'Fragile crust', 'Sulfur steam'], 'Never leave marked paths or approach vents and boiling mud.'),
    amenities: ['Parking', 'Use Reykjahlíð services for food, fuel and toilets'],
    booking: booking(false, 'No attraction reservation. Recheck parking and live access signs.', 'https://www.hverir.com/en', '', 'Official Hverir page ↗'),
    pros: ['Intense volcanic colour and steam in a short stop.', 'Easy to time-box on either north day.', 'Very different sensory experience from the waterfalls.'],
    drawbacks: ['Requires constant child control.', 'Sulfur smell and steam can overwhelm some visitors.', 'Wind and crowding reduce the payoff.'],
    sourceOverride: [
      source('Hverir official site', 'https://www.hverir.com/en'),
      source('June 2026 Mývatn travel guide', 'https://www.funiceland.is/blog/lake-myvatn-travel-guide/', 'travel writing'),
    ],
  },
  'earth-lagoon': {
    location: 'Lake Mývatn', status: 'conditional',
    documentStatus: 'The former Mývatn Nature Baths reopened as Earth Lagoon in July 2026. It is open, but hours should be confirmed against the booked slot.',
    dayIds: [dayId('2026-08-14')], map: map(65.630741, -16.84748),
    visit: { duration: 'About 2h', walk: 'Facility access', difficulty: 'Easy' },
    family: family('Whole-family recovery option; children five and under are free with an adult.', 'Ask operator', 'Not needed', ['Hot water', 'Slippery surfaces'], 'Maintain arm’s-reach supervision.'),
    amenities: ['Changing rooms', 'Showers', 'Food/drink', 'Parking'],
    booking: booking(true, 'Reserve in summer. Published hours conflict; trust the live slot and phone confirmation.', 'https://booking.earthlagoon.is/', '+354 464 4411', 'Earth Lagoon booking ↗'),
    pros: ['Useful recovery after the long north transition.', 'New facility and live booking system.', 'Works across a range of weather.'],
    drawbacks: ['Older reviews describe a different facility.', 'Early post-rebuild value/temperature feedback is mixed.', 'A fixed slot reduces route flexibility.'],
  },
  'dettifoss-selfoss': {
    location: 'Vatnajökull National Park · paved west bank', status: 'open',
    documentStatus: 'Listed in the document; use Road 862 west bank, not gravel Road 864.',
    dayIds: [dayId('2026-08-15')], map: map(65.814339, -16.384431, [-102, -12]),
    visit: { duration: '1.5–2h', walk: '2.5 km Dettifoss–Selfoss circuit', difficulty: 'Uneven, wet and exposed' },
    family: family('Possible with a careful pace, but it makes an already long east-transition day demanding.', 'No', 'Useful', ['Spray-slippery rock', 'Cliff/river edges', 'Closed former viewpoint'], 'Fosshvamm is permanently closed after cracking/landslide changes; obey the relocated route.'),
    amenities: ['Parking', 'Toilets', 'No food or fuel'],
    booking: booking(false, 'No attraction reservation. Check road and park notices the same morning.', 'https://www.vatnajokulsthjodgardur.is/en/areas/jokulsargljufur/dettifossvegur-akstursleid', '+354 575 8400', 'Official west-bank access ↗'),
    pros: ['One of the route’s most powerful landscapes.', 'Paved west-bank access fits these campers.', 'Selfoss adds value to the same stop.'],
    drawbacks: ['Long stop on a 257 km transition day.', 'Wet rough trail is not stroller-friendly.', 'Older articles may describe a now-closed viewpoint.'],
  },
  studlagil: {
    location: 'Jökuldalur · Grund west viewpoint', status: 'open',
    documentStatus: 'The source leaves the side unresolved. The working family/camper plan uses the serviced west viewpoint; the east canyon floor is a separate half-day.',
    dayIds: [dayId('2026-08-15')], map: map(65.162327, -15.308125),
    visit: { duration: 'West 30–60m; east 3–4h', walk: 'Railed platform / 5 km each way east', difficulty: 'Easy west; demanding east' },
    family: family('Choose the west/Grund side for this itinerary.', 'West approach/platform', 'Not needed west; useful east', ['Freezing fast river', 'Slippery canyon descent', 'Rough east access road'], 'No swimming. East lots lack toilets and consume the half-day.'),
    amenities: ['West-side toilets', 'Paid parking', 'Nearby camp showers/kitchen/electricity', 'Market/food truck'],
    booking: booking(false, 'No attraction booking. Parking fee may apply; confirm campsite if sleeping nearby.', 'https://www.east.is/en/blog/studlagil-canyon-hike', '+354 866 0046', 'Current route guide ↗'),
    pros: ['Extraordinary basalt geometry.', 'West platform is fast, railed and serviced.', 'Fits the route when treated honestly as the quick version.'],
    drawbacks: ['West and east are not equivalent experiences.', 'East side would displace another major stop.', 'Reservoir flow can alter water level and colour.'],
  },
  'borgarfjordur-eystri': {
    location: 'Hafnarhólmi · separate Egilsstaðir spoke', status: 'backup',
    documentStatus: 'A late-puffin hedge in the source; not on the through-road south and not additive with Seyðisfjörður.',
    dayIds: [dayId('2026-08-15')], map: map(65.542075, -13.754811, [14, -14]),
    visit: { duration: 'Half-day return detour', walk: 'Boardwalk/viewing shelter', difficulty: 'Easy at site; long detour' },
    family: family('The viewing structure is child-friendly; the route cost and late season are the real issues.', 'Partial/boardwalk dependent', 'Not normally needed', ['Wind', 'Wildlife proximity'], 'August 15 is at the edge of the official season; make the village/fjord, not guaranteed puffins, the reason.'),
    amenities: ['Café', 'Campsite toilets/showers', 'Cooking/waste service'],
    booking: booking(false, 'No puffin-view booking. Confirm camp/services if this replaces the main route.'),
    pros: ['Excellent viewing infrastructure.', 'Beautiful fjord/village even with few birds.', 'Strong earlier-season wildlife experience.'],
    drawbacks: ['About 152 km return from Egilsstaðir.', 'Late-season sightings range from many to a few stragglers.', 'Competes directly with Seyðisfjörður and forward progress.'],
    extraSources: [source('Official Hafnarhólmi', 'https://www.east.is/en/place/hafnarholmi')],
  },
  'djupivogur-stokksnes': {
    title: 'Stokksnes and Vestrahorn', shortTitle: 'Stokksnes',
    location: 'Stokksnes · Vestrahorn', status: 'working',
    documentStatus: 'Named in the source after Djúpivogur. The legacy combined ID remains attached to Stokksnes so existing rankings and notes survive; Djúpivogur now has its own card.',
    planningContext: 'The adjacent Djúpivogur–Stokksnes road segment is about 99 km, not four hours. The full Egilsstaðir coastal day remains substantial and must stay on Route 1 rather than Öxi/939.',
    logistics: ['60–90 minutes', 'Paid private access', 'Stay on Route 1; no Öxi/939'],
    dayIds: [dayId('2026-08-16')], map: map(64.25507, -14.994049, [14, 18]),
    visit: { duration: '60–90m', walk: 'Flexible beach/dune viewpoints', difficulty: 'Easy terrain; exposed weather' },
    family: family('A flexible landscape stop if wind and the long coastal drive leave margin.', 'No on dunes/beach', 'Useful on beach terrain', ['Wind', 'Black-sand waterline', 'Unsafe unfinished film-set buildings'], 'Use only the paid access road and signed areas; do not enter unsafe structures.'),
    amenities: ['Viking Café', 'Toilets/camping at Viking Café', 'Fuel and full resupply in Höfn'],
    booking: booking(false, 'Stokksnes normally uses paid entry through Viking Café; no general reservation.', 'https://www.vestrahorn.is/viking-cafe-guesthouse', '+354 478 2577', 'Viking Café / Stokksnes ↗'),
    pros: ['Vestrahorn is a high-impact landscape.', 'Flexible walking and photography.', 'Natural end point before Höfn/ice country.'],
    drawbacks: ['Private gravel access can have ruts.', 'Wind and cloud can hide the mountain.', 'Crowding and value reviews are mixed.'],
    sourceOverride: [
      source('Viking Café / Stokksnes', 'https://www.vestrahorn.is/viking-cafe-guesthouse'),
      source('Stokksnes guide', 'https://guidetoiceland.is/travel-iceland/drive/stokksnes', 'guide'),
      source('Current motorhome discussion', 'https://www.reddit.com/r/VisitingIceland/comments/1v3i5sp/can_you_access_vestrahornstokksnes_with_a_smaller/', 'travel post'),
    ],
  },
  'jokulsarlon-boat': {
    location: 'Jökulsárlón and Diamond Beach', status: 'open',
    documentStatus: 'The lagoon is a priority; boat type remains undecided and unbooked.',
    dayIds: [dayId('2026-08-17')], map: map(64.048122, -16.179867, [14, 18]),
    visit: { duration: '90–150m without boat; add tour/check-in', walk: 'Short lagoon/beach paths', difficulty: 'Easy shores; cold/wind exposure' },
    planningContext: 'Use Jökulsárlón Boat Tours at icelagoon.is as the selected operator. Its Amphibian is suitable for all ages. Its exact child FAQ sets a 130 cm Zodiac threshold; its 2026 price table lists Zodiac child tickets for ages 10–12, so confirm any edge case directly before paying.',
    logistics: ['Amphibian 30–40m · check in 20m early', 'Zodiac 1h15 · check in 30m early', 'Selected operator: icelagoon.is'],
    family: family('The selected operator’s Amphibian is the all-ages family option. Zodiac requires children to be at least 130 cm.', 'Main service areas', 'Not normally needed', ['Cold water', 'Moving ice', 'Road crossing to beach', 'Wind'], 'Keep the beach and lagoon as the anchor even if weather cancels a boat.'),
    amenities: ['Paid service-area parking', 'Toilets', 'Food', 'Tour check-in'],
    booking: booking(true, 'Reserve a summer boat. Check in 20 minutes before Amphibian or 30 minutes before Zodiac.', 'https://icelagoon.is/booking/', '+354 478 2222', 'Official lagoon booking ↗'),
    pros: ['One of the trip’s clearest best-of-area experiences.', 'Amphibian keeps the group together.', 'Recent reports show Zodiac can sell out same day.'],
    drawbacks: ['The Zodiac height gate likely splits the group.', 'Weather and ice change operations.', 'A booked time constrains an already long Aug 17.'],
    reviewSignal: 'Recent reviews of the selected operator’s Amphibian praise knowledgeable guides and a safe close-up view of the icebergs. Zodiac reports favour greater immersion, but the Amphibian is the current whole-group fit.',
    sourceOverride: [
      source('Selected operator · official 2026 booking', 'https://icelagoon.is/booking/'),
      source('Selected operator · exact child FAQ', 'https://icelagoon.is/faq/is-it-possible-to-take-children-on-board-of-the-boats/'),
      source('Selected operator · tour durations', 'https://icelagoon.is/tours/'),
      source('Selected operator · Amphibian reviews', 'https://www.tripadvisor.com/Attraction_Review-g12344476-d17644313-Reviews-Amphibian_Boat_Tour-Jokulsarlon_East_Region.html', 'reviews'),
    ],
  },
  'glacier-hike': {
    location: 'Skaftafell', status: 'conditional',
    documentStatus: '“Glacier hike” is only an idea until a named operator and child/boot/medical rules are selected.',
    dayIds: [dayId('2026-08-17')], map: map(64.016672, -16.966326),
    visit: { duration: 'S1 view 1–1.5h; guided ice activity varies', walk: 'S1 is 4.1 km loop', difficulty: 'Easy glacier view / operator-defined ice hike' },
    family: family('Use the official S1 glacier-view trail as the safe whole-family default.', 'No for full loop', 'Useful', ['Never walk onto glacier ice without a guide', 'Rapid weather change'], 'A guided ice activity needs a deliberate adult/child plan and must replace other Aug 17 commitments.'),
    amenities: ['Visitor centre', 'Motorhome camping', 'Toilets', 'Seasonal food'],
    booking: booking('Required only for a selected guided glacier operator.', 'No operator has been chosen. The S1 self-guided glacier-view trail needs no guide.', 'https://www.vatnajokulsthjodgardur.is/en/areas/skaftafell/skaftafellsjokull-s1', '', 'Official S1 trail ↗'),
    pros: ['S1 gives a real glacier view without age-gated ice travel.', 'Skaftafell is a strong service base.', 'Guided option can be exceptional for eligible participants.'],
    drawbacks: ['Generic “glacier hike” is not bookable logistics.', 'On-ice activities split the family.', 'Time competes with Jökulsárlón and the South Coast transfer.'],
  },
  'fjadrargljufur-eldhraun': {
    location: 'South Coast · Fjaðrárgljúfur then Eldhraun', status: 'working',
    documentStatus: 'Both are in the document; Eldhraun is corrected to appear before Vík/Reynisfjara westbound.',
    dayIds: [dayId('2026-08-17')], map: map(63.771198, -18.171443),
    visit: { duration: 'Canyon 60–90m; lava pull-out 15–20m', walk: 'East-rim path/platform', difficulty: 'Moderate slopes and edges' },
    family: family('Good if Aug 17 has not already become a full glacier day.', 'Limited main area', 'Useful', ['Canyon edges', 'Fragile moss', 'No roadside stopping'], 'Use only signed parking/pull-outs; never walk on the moss.'),
    amenities: ['Main canyon parking', 'Check current toilet/Parka status', 'Services in Kirkjubæjarklaustur/Vík'],
    booking: booking(false, 'No attraction reservation; check closures/parking state.'),
    pros: ['Canyon has a strong payoff in a controlled block.', 'Eldhraun is naturally in the road sequence.', 'Easy to shorten if the glacier chapter runs late.'],
    drawbacks: ['Jökulsárlón to Vík via all stops is a very full day.', 'Edges require close supervision.', 'Lava-field pull-outs are limited and moss is fragile.'],
    extraSources: [source('Official Visit South · Fjaðrárgljúfur', 'https://www.south.is/en/destinations/nature/geopark/fjadrargljufur-canyon')],
  },
  reynisfjara: {
    location: 'South Coast · designated viewpoint', status: 'conditional',
    documentStatus: 'The source proposes a beach stop. At the August 8 research snapshot, SafeTravel permits viewpoint-only access; recheck for August 18.',
    dayIds: [dayId('2026-08-18')], map: map(63.404344, -19.045269, [14, 18]),
    visit: { duration: '20–30m viewpoint-only while current gate remains', walk: 'Designated access only', difficulty: 'Safety-gated' },
    family: family('Only as a short, directly supervised viewpoint stop when official lights/barriers permit.', 'Viewpoint dependent', 'Not needed', ['Sneaker waves', 'Rockfall', 'Coastal erosion'], 'Never turn away from the sea. The live SafeTravel state—not a review—makes the decision.'),
    amenities: ['Parking/service area', 'Nearby food/toilets (operating state varies)'],
    booking: booking(false, 'No attraction booking. Recheck the live black-beach page immediately before arrival.', 'https://safetravel.is/travel-conditions/blackbeach-safety/', '', 'Live SafeTravel beach state ↗'),
    pros: ['Dramatic geology visible from the controlled area.', 'Directly on the South Coast sequence.', 'Can be kept short.'],
    drawbacks: ['Viewpoint-only at the current snapshot.', 'A famous reputation does not reduce lethal wave risk.', 'Conditions can close access entirely.'],
  },
  dyrholaey: {
    location: 'South Coast · lower viewpoint', status: 'working',
    documentStatus: 'Listed in the source; use lower parking with these large motorhomes.',
    dayIds: [dayId('2026-08-18')], map: map(63.404034, -19.129046, [14, -12]),
    visit: { duration: '30–45m', walk: 'Short viewpoint paths', difficulty: 'Easy lower area; exposed wind' },
    family: family('Lower viewpoint is the family/camper fit.', 'Some lower surfaces', 'Helpful', ['Severe gusts', 'Cliff edges'], 'Do not take large campers up the steep, narrow upper road.'),
    amenities: ['Lower parking', 'Summer toilets', 'Paid Parka parking'],
    booking: booking(false, 'No attraction reservation; pay/check current parking rules.'),
    pros: ['Wide coastal panorama.', 'Short flexible stop.', 'Possible late puffins, never guaranteed.'],
    drawbacks: ['Very exposed to wind.', 'Upper road is unsuitable for these rigs.', 'Late-season bird signal is weak.'],
  },
  'skogafoss-waterfall-way': {
    location: 'Skógafoss · Waterfall Way taster', status: 'open',
    documentStatus: 'The document’s “3 km / 10 waterfalls” omits the return and 428-step climb. The working plan is a 60–90m taster.',
    dayIds: [dayId('2026-08-18')], map: map(63.531806, -19.511996),
    visit: { duration: '60–90m taster; 2–3h for ~6 km return', walk: '428 steps then out-and-back trail', difficulty: 'Strenuous stairs; flexible turnaround' },
    family: family('Base view is easy; climb only as far as the group enjoys.', 'Base only', 'Useful above base', ['Soaking mist', 'Many stairs', 'Trail edges'], 'Define the turnaround before starting; the route continues to other waterfalls.'),
    amenities: ['Parking', 'Nearby food/toilets', 'Base viewpoint'],
    booking: booking(false, 'No waterfall reservation. Do not rely on an unverified Skógar campsite reopening.'),
    pros: ['Even the first upper stretch sheds crowds and adds falls.', 'Easy to scale.', 'Base waterfall is immediate.'],
    drawbacks: ['The source distance understates the return.', 'Stairs can consume family energy.', 'Mist makes surfaces wet.'],
  },
  'seljalandsfoss-gljufrabui': {
    location: 'Seljalandsfoss · same-stop walk north to Gljúfrabúi', status: 'working',
    documentStatus: 'Both are planned. Gljúfrabúi is 300–500 m north from the same parking stop, not across the road; the source’s Svartifoss link is discarded.',
    dayIds: [dayId('2026-08-18')], map: map(63.615457, -19.988169, [14, 18]),
    visit: { duration: '60–90m combined', walk: 'Short wet paths', difficulty: 'Easy exterior; slippery/wading interior' },
    family: family('Excellent whole-family exterior views; Gljúfrabúi interior is optional.', 'Exterior/main areas only', 'Helpful', ['Slippery path behind falls', 'Shallow-stream wading', 'Falling water/rock'], 'Skip behind/interior routes when flow, footwear or child confidence says no.'),
    amenities: ['Parking', 'Café/service', 'Toilets'],
    booking: booking(false, 'No attraction booking. August service is reported 09:00–22:00; verify live.', 'https://www.south.is/en/travel-info/newsblog/best-waterfalls-in-south-iceland', '', 'Official waterfall guide ↗'),
    pros: ['Two distinctive falls in one parking stop.', 'Exterior views need little walking.', 'Natural final stop before Landeyjahöfn.'],
    drawbacks: ['Everyone will get wet.', 'Gljúfrabúi interior is not stroller-friendly.', 'Crowds and slippery surfaces can slow the stop.'],
  },
  'heimaey-puffin-volcano': {
    location: 'Heimaey · foot-passenger day trip', status: 'open',
    documentStatus: 'The document records strong enthusiasm, not a ferry/tour booking. This card preserves the researched Eldfell/puffin vehicle tour; the source-authored Dalfjall hike now has its own card.',
    planningContext: 'This local vehicle tour is the researched Eldfell and Stórhöfði option, not a substitute for Dalfjall. The working logistics leave both campers at Landeyjahöfn.',
    dayIds: [dayId('2026-08-19')], map: map(63.4323, -20.2556),
    visit: { duration: 'Full island day; tour 1.5–2h', walk: 'Tour-dependent / Eldfell 1.7 km route', difficulty: 'Easy tour; moderate exposed volcano walk' },
    family: family('A booked local vehicle tour is the cleanest way to reach Stórhöfði and Eldfell without ferrying the rigs.', 'Tour dependent', 'Useful on Eldfell', ['Wind', 'Volcanic slopes', 'Late-season wildlife uncertainty'], 'Stórhöfði is not a sensible young-child walk from the harbour.'),
    amenities: ['Ferry terminals', 'Town food/toilets', 'Free mainland passenger parking', 'Island taxis/tours'],
    booking: booking(true, 'Reserve ferry foot passengers and a current island tour. Use an 18:00 or 20:00 return for margin.', 'https://www.eyjatours.com/puffin-and-volcano-tour', '', 'Puffin & Volcano Tour ↗'),
    pros: ['Exceptional review record.', 'Best late-season puffin hedge on the route.', 'Local transport solves the large-camper problem.'],
    drawbacks: ['Puffins are not guaranteed on August 19.', 'Ferry disruption can change ports.', 'Vehicle ferrying requires exact camper dimensions and scarce inventory.'],
    extraSources: [source('Official Herjólfur schedule', 'https://herjolfur.is/en/schedule/'), source('Official Herjólfur FAQ · 35-minute crossing', 'https://herjolfur.is/en/frequently-asked-questions/')],
  },
  'beluga-sanctuary': {
    location: 'Heimaey harbour', status: 'conditional',
    documentStatus: 'Recommended in the source. In summer 2026 this is a conservation visitor centre—not guaranteed bay viewing.',
    dayIds: [dayId('2026-08-19')], map: map(63.442875, -20.269044, [14, 18]),
    visit: { duration: '45–75m', walk: '5–10m from harbour', difficulty: 'Easy indoor visit' },
    family: family('Accessible, weather-proof and educational.', 'Yes', 'Not needed', ['Manage expectations: whales will not move to the bay in summer 2026'], 'Good fallback or complement, but do not sell it as a guaranteed whale encounter.'),
    amenities: ['Accessible toilet', 'Baby change', 'Level access', 'Visitor centre'],
    booking: booking(true, 'Advance online purchase must be at least two days ahead. Open 10:00–16:00 on August 19.', 'https://belugasanctuary.sealifetrust.org/en/tickets/', '+354 620 2724', 'Official tickets ↗'),
    pros: ['Strong conservation mission.', 'Harbour-adjacent and weather-proof.', 'Includes puffin-rescue context.'],
    drawbacks: ['No 2026 move into Klettsvík Bay.', 'Some reviews find static displays under-labelled.', 'Competes with an already full island day.'],
    extraSources: [source('2026 welfare update', 'https://belugasanctuary.sealifetrust.org/en/about-us/news/putting-animal-welfare-first/')],
  },
  'golden-circle-core': {
    title: 'Geysir geothermal area', shortTitle: 'Geysir / Strokkur',
    location: 'Haukadalur · Geysir and Strokkur', status: 'working',
    documentStatus: 'Named in the source. The legacy Golden Circle ID remains attached to Geysir so existing rankings and notes survive; Gullfoss and Þingvellir now have their own cards.',
    planningContext: 'Geysir itself is usually dormant; Strokkur is the repeating eruption people come to see. On this westbound day the road order is Gullfoss → Geysir → Þingvellir.',
    logistics: ['45–60 minutes', 'Stay on marked geothermal paths', 'Expect peak-hour crowds'],
    dayIds: [dayId('2026-08-20')], map: map(64.309511, -20.300735),
    visit: { duration: '45–60m', walk: 'Short marked geothermal paths', difficulty: 'Easy main path / severe off-path hazard' },
    family: family('A short, dramatic family stop when everyone stays behind barriers.', 'Main path conditions vary', 'Usually unnecessary', ['Scalding geothermal water', 'Unstable crust', 'Crowd pressure near Strokkur'], 'Keep children beside an adult and never step off the marked path.'),
    amenities: ['Food', 'Fuel', 'Toilets', 'Shop/hotel/campsite nearby'],
    booking: booking(false, 'No attraction reservation. Pay any current parking fee and follow live access signs.', 'https://www.ust.is/english/visiting-iceland/protected-areas/south/geysir-area/about-the-area/', '', 'Official Geysir area ↗'),
    pros: ['Repeated Strokkur eruptions deliver a clear payoff.', 'Compact, serviced stop.', 'Naturally between Gullfoss and Þingvellir westbound.'],
    drawbacks: ['Often the day’s most crowded stop.', 'Geysir itself is generally dormant.', 'Geothermal hazards require strict path discipline.'],
    reviewSignal: 'Recent visitors value Strokkur’s repeated eruptions and easy access; crowding, paid parking and confusion between dormant Geysir and active Strokkur drive the weaker reports.',
    sourceOverride: [
      source('Official Geysir area', 'https://www.ust.is/english/visiting-iceland/protected-areas/south/geysir-area/about-the-area/'),
      source('2026 Geysir reviews', 'https://www.tripadvisor.co.uk/Attraction_Review-g8342555-d14861044-Reviews-Site_de_Geysir-Haukadalur_South_Region.html', 'reviews'),
      source('June 2026 traveller report', 'https://www.reddit.com/r/VisitingIceland/comments/1ubuqcp/trip_report_june_613_2026/', 'travel post'),
    ],
  },
  'silfra-split': {
    location: 'Þingvellir', status: 'conditional',
    documentStatus: 'Only a deliberate adult/eligible-participant split; not a whole-family stop.',
    dayIds: [dayId('2026-08-20')], map: map(64.25541, -21.128043, [14, -12]),
    visit: { duration: '2.5–3h with check-in', walk: 'Operator route', difficulty: 'Cold-water activity' },
    family: family('Not a whole-family activity for this party.', 'No', 'No', ['Cold water', 'Age/medical/size rules'], 'A responsible adult split must leave enough caregivers and must not derail the core route.'),
    amenities: ['Visitor-centre area', 'Operator equipment'],
    booking: booking(true, 'Operator minimum age and health/size rules are strict; verify each participant before paying.', 'https://www.dive.is/faq/what-is-the-minimum-age-to-snorkel-silfra', '', 'Current operator rules ↗'),
    pros: ['Singular between-continents experience for eligible participants.'],
    drawbacks: ['Splits the group.', 'Consumes a large block on the Golden Circle day.', 'Strict cold-water eligibility and cancellation rules.'],
  },
  reykjadalur: {
    location: 'Hveragerði · Reykjadalur', status: 'open',
    documentStatus: 'The source calls it a 3 km hike. Official route is about 3.5 km each way—roughly 7 km return.',
    dayIds: [dayId('2026-08-21')], map: map(64.021156, -21.21116),
    visit: { duration: '3.5–4h with bathing', walk: 'About 7 km return', difficulty: 'Sustained, front-loaded climb' },
    family: family('Memorable but demanding for young legs; decide after seeing the group’s real hiking pace.', 'No', 'Useful', ['Boiling pools', 'Slippery boardwalk', 'No river changing room', 'Weather exposure'], 'Leave early, carry swimwear/towels, and keep children away from boiling water.'),
    amenities: ['Trailhead parking/service businesses', 'No changing room at river'],
    booking: booking(false, 'No activity reservation. Recheck trail closure and parking state.'),
    pros: ['Natural bathing reached under your own power.', 'Strong standout signal.', 'Creates a memorable transition into Reykjavík.'],
    drawbacks: ['Twice the distance stated in the source.', 'Front-loaded climb can be strenuous for families.', 'Weather and crowding materially change the experience.'],
    extraSources: [source('Official South Iceland · 3.5 km approach', 'https://www.south.is/en/travel-info/travel-blog/dive-into-the-local-life-of-icelanders')],
  },
  'weather-buffer': {
    location: 'Reykjavík / route-wide', status: 'working',
    documentStatus: 'August 22 is blank in the source. The working plan protects it rather than filling it in advance.',
    dayIds: [dayId('2026-08-22')], map: map(64.145228, -21.874213, [14, 18]),
    visit: { duration: 'Whole day of slack', walk: 'Whatever recovery supports', difficulty: 'Easy by design' },
    family: family('The strongest family-accessibility tool in the itinerary is a day that can absorb fatigue, weather or ferry disruption.', 'Yes where chosen', 'Optional', [], 'Do not spend this buffer before the trip unless the group explicitly agrees.'),
    amenities: ['City groceries/fuel/pharmacy', 'Pools', 'Laundry/camp services'],
    booking: booking(false, 'No booking. Keep cancellable backup ideas only.'),
    pros: ['Absorbs accumulated delay.', 'Protects the final days from becoming a forced march.', 'Can become a favourite city/pool day if unused.'],
    drawbacks: ['Tempting to overfill in advance.', 'Does not solve an August 19 ferry booking failure by itself.'],
    extraSources: [source('Umferðin live road conditions', 'https://umferdin.is/en'), source('Icelandic Met Office', 'https://en.vedur.is/')],
  },
  perlan: {
    location: 'Reykjavík', status: 'open',
    documentStatus: 'A question in the source; unbooked but a strong whole-family weather option.',
    dayIds: [dayId('2026-08-23')], map: map(64.129246, -21.919028),
    visit: { duration: '2.5–3.5h', walk: 'Indoor museum', difficulty: 'Easy' },
    family: family('One of the best whole-family Reykjavík anchors.', 'Yes/lifts', 'Not needed', ['Timed exhibit waits'], 'Choose planetarium/show times before arrival if the group cares about them.'),
    amenities: ['Lifts', 'Toilets', 'Food', 'Free parking', 'Indoor exhibits'],
    booking: booking(true, 'Advance timed tickets reduce exhibit waits.', 'https://perlan.is/visit', '+354 566 9000', 'Perlan visit ↗'),
    pros: ['Consistently strong adult-and-child reviews.', 'Makes the geology seen on the road cohere.', 'Reliable bad-weather choice.'],
    drawbacks: ['Timed elements can still involve waits.', 'Indoor time competes with a final city walk.'],
  },
  'sky-lagoon': {
    location: 'Kópavogur · Reykjavík area', status: 'conditional',
    documentStatus: 'Not 15 minutes from KEF and not a whole-family stop: under-12s are prohibited.',
    dayIds: [dayId('2026-08-23')], map: map(64.116465, -21.946435, [14, 18]),
    visit: { duration: '1.5–2h plus changing', walk: 'Facility access', difficulty: 'Easy adult spa' },
    family: family('Adult split only; under-12s cannot enter and ages 12–14 require an adult.', 'Ask operator', 'Not applicable', ['Hot water', 'Slippery surfaces'], 'Only book after agreeing who stays with the young travellers.'),
    amenities: ['Changing/showers', 'Food/drink', 'Parking'],
    booking: booking(true, 'Reserve a timed slot. August hours are 09:00–22:00; it is about 45 minutes from KEF.', 'https://www.skylagoon.com/visit/', '+354 527 6800', 'Sky Lagoon visit ↗'),
    pros: ['Ocean view and ritual receive strong reviews.', 'Weather-proof adult recovery.'],
    drawbacks: ['Necessarily splits the group.', 'Crowding/value reviews vary.', 'Not an airport-adjacent final-morning activity.'],
  },
  'reykjavik-pools': {
    location: 'Reykjavík', status: 'open',
    documentStatus: 'A flexible researched addition, not a source-document booking.',
    dayIds: [dayId('2026-08-22'), dayId('2026-08-23')], map: map(64.1466, -21.9426, [-102, -12]),
    visit: { duration: '1–2h', walk: 'Facility access', difficulty: 'Easy' },
    family: family('Low-friction whole-family recovery.', 'Pool dependent', 'Not needed', ['Pool supervision and shower rules'], 'Choose the nearest open neighbourhood pool on the day.'),
    amenities: ['Changing/showers', 'Hot tubs', 'Family pools vary'],
    booking: booking(false, 'Most city pools are drop-in; verify opening hours.'),
    pros: ['Local, flexible and inexpensive compared with destination spas.', 'Works in poor weather.', 'Keeps everyone together.'],
    drawbacks: ['Less “bucket list” framing.', 'Amenities and child features vary by pool.'],
  },
  departure: {
    location: 'Reykjavík → camper return → KEF', status: 'fixed',
    documentStatus: 'Campers are due by 13:00. The source gives both 17:05 and 17:10 for flight departure; live airline truth must resolve it.',
    dayIds: [dayId('2026-08-24')], map: map(63.985, -22.6056, [14, 18]),
    visit: { duration: 'No sightseeing', walk: 'Return/terminal only', difficulty: 'Deadline day' },
    family: family('Stress-free only if packing, waste and fuel are finished the previous evening.', 'Terminal/facility dependent', 'Useful for luggage only', ['Missed return/flight buffer'], 'Leave Reykjavík around 10:30–11:00 and target terminal entry around 14:00 after return processing.'),
    amenities: ['Reykjavík services', 'Rental return', 'KEF terminal'],
    booking: booking(true, 'Use the live rental contract for return address/fuel/cleaning/waste rules and the airline itinerary for departure time.', 'https://www.motorhomeiceland.com/contact-us', '+354 539 5677', 'Rental contact ↗'),
    pros: ['A protected no-sightseeing morning makes the fixed deadlines realistic.'],
    drawbacks: ['Flight time conflict remains unresolved.', 'Return processing for two campers is not part of the 47-minute road baseline.'],
    extraSources: [source('KEF first-time guide', 'https://www.kefairport.com/news/first-time-in-iceland')],
  },
};

const statusMap = { planned: 'working', priority: 'open' };
const dedupeSources = (sources) => [...new Map(
  sources.filter((item) => item?.url).map((item) => [item.url, item]),
).values()];

function enrichOption(option) {
  const override = details[option.id] || {};
  const { extraSources = [], sourceOverride = null, ...fields } = override;
  return {
    ...option,
    status: fields.status || statusMap[option.status] || option.status || 'open',
    documentStatus: fields.documentStatus || 'Preserved from the planning document; not booked unless explicitly marked.',
    location: fields.location || option.title,
    dayIds: fields.dayIds || [],
    map: fields.map || null,
    visit: fields.visit || { duration: 'Flexible', walk: 'To verify', difficulty: 'To verify' },
    family: { ...COMMON_FAMILY, ...(fields.family || {}) },
    amenities: fields.amenities || ['Verify current local services before relying on this stop'],
    booking: fields.booking || booking(false, 'No booking state is established; use the linked current source.'),
    pros: fields.pros || [option.hook],
    drawbacks: fields.drawbacks || ['Needs a current route, weather and family-energy check.'],
    ...fields,
    sources: dedupeSources([...(sourceOverride || option.sources || []), ...extraSources]),
  };
}

// The August 13 planning revision removed a small set of previously rankable
// ideas. Keep their stable IDs in the catalog so persisted preferences and
// sticky notes remain readable, but take them out of every active day and map
// surface. "Removed" is source history, never a fabricated group rejection.
const removedFromLatestPlan = new Map([
  ['latrabjarg-raudasandur', 'Látrabjarg is no longer in the latest dated plan.'],
  ['raudasandur', 'Rauðasandur is no longer in the latest dated plan.'],
  ['eclipse-patreksfjordur', 'The latest source records the eclipse at Flókalundur without retaining this earlier site choice.'],
  ['eclipse-arngerdareyri', 'The latest source records the eclipse at Flókalundur without retaining this earlier site choice.'],
  ['hvitserkur-skagafjordur', 'The latest northbound transfer uses Kolugljúfur and Hamrar instead of the earlier Hvítserkur/Varmahlíð line.'],
  ['hauganes-whales', 'The latest north plan no longer contains the Hauganes detour.'],
  ['husavik-whale-watching', 'The latest source considers only a Húsavík harbourfront or café stop; it does not propose a whale tour.'],
]);

const currentOptionOverrides = {
  'outbound-flight': { dayIds: [dayId('2026-08-08')], status: 'historical' },
  'arrival-bjarkalundur': { dayIds: [dayId('2026-08-09')], status: 'historical' },
  'borgarfjordur-waterfalls': {
    dayIds: [dayId('2026-08-09')],
    status: 'historical',
    documentStatus: 'Preserved from the August 9 source plan. The current traveller update does not establish whether this optional branch was visited.',
  },
  'hellulaug-coast': {
    dayIds: [dayId('2026-08-10'), dayId('2026-08-12')],
    status: 'historical',
    documentStatus: 'Preserved as the Flókalundur/Hellulaug source record for August 10 and the Flókalundur eclipse base on August 12. No optional hot-pool visit is inferred.',
  },
  dynjandi: {
    dayIds: [dayId('2026-08-11')],
    status: 'historical',
    documentStatus: 'Preserved from the August 11 source plan. The current traveller update does not establish whether the optional stop was completed.',
  },
  godafoss: {
    dayIds: [dayId('2026-08-14')],
    status: 'working',
    documentStatus: 'Retained as the first named Diamond Circle stop on August 14; no attraction booking is required.',
  },
  asbyrgi: {
    dayIds: [dayId('2026-08-14')],
    status: 'working',
    documentStatus: 'Retained as the August 14 canyon visit. The separate asbyrgi-campsite card carries the still-open two-electric-pitch decision.',
    planningContext: 'Ásbyrgi is the last major August 14 destination. Use the short Botnstjörn version as the default, then handle the two-electric-pitch sleep decision on its separate campsite card.',
    logistics: ['A1 Botnstjörn · about 1 km / 30m', 'Visitor centre', 'Separate campsite decision'],
  },
  'dettifoss-selfoss': { dayIds: [dayId('2026-08-15')], status: 'working' },
  'hverir-hverfjall': { dayIds: [dayId('2026-08-15')], status: 'working' },
  'earth-lagoon': {
    dayIds: [dayId('2026-08-15')],
    status: 'conditional',
    documentStatus: 'The latest source proposes an optional late Mývatn soak after camp. No reservation or final lagoon choice is recorded.',
  },
  hverfjall: { dayIds: [dayId('2026-08-16')], status: 'working' },
  studlagil: { dayIds: [dayId('2026-08-17')], status: 'working' },
  'borgarfjordur-eystri': {
    dayIds: [dayId('2026-08-17'), dayId('2026-08-18')],
    status: 'conditional',
    documentStatus: 'A live-puffin-gated branch on August 17. If used, it consumes the separate August 18 transfer back through Egilsstaðir.',
    planningContext: 'Check the live camera or ask locally in Egilsstaðir. Take this branch only if same-day evidence supports the wildlife goal and the group accepts the required return through Egilsstaðir on August 18.',
    logistics: ['Live puffin evidence required', 'Separate Egilsstaðir spoke', 'Using it creates the August 18 backtrack'],
  },
  seydisfjordur: {
    dayIds: [dayId('2026-08-17'), dayId('2026-08-18')],
    status: 'working',
    documentStatus: 'The direct August 17 destination when the puffin branch is skipped; otherwise reached on August 18 after the necessary backtrack.',
    planningContext: 'This is the working August 17 destination. If Borgarfjörður Eystri is chosen instead, Seyðisfjörður moves to August 18 and remains a separate Egilsstaðir spoke.',
    logistics: ['Direct destination when puffin branch is skipped', 'Conditional August 18 arrival otherwise', 'Road 93 weather gate'],
  },
  djupivogur: { dayIds: [dayId('2026-08-19')], status: 'working' },
  'djupivogur-stokksnes': {
    dayIds: [dayId('2026-08-19')],
    status: 'working',
    planningContext: 'The adjacent Djúpivogur–Stokksnes segment is not the whole day. The working transfer begins in Seyðisfjörður, follows coastal Route 1 through the Eastfjords and ends around Stokksnes/Höfn; Öxi/939 is excluded.',
  },
  'jokulsarlon-boat': { dayIds: [dayId('2026-08-20')], status: 'open' },
  'glacier-hike': { dayIds: [dayId('2026-08-20')], status: 'conditional' },
  'fjadrargljufur-eldhraun': { dayIds: [dayId('2026-08-20')], status: 'working' },
  reynisfjara: {
    dayIds: [dayId('2026-08-20'), dayId('2026-08-21')],
    status: 'conditional',
    documentStatus: 'Preserved from the overloaded August 19 source list as a conditional South Coast branch; it is not part of the feasible core.',
  },
  dyrholaey: {
    dayIds: [dayId('2026-08-20'), dayId('2026-08-21')],
    status: 'conditional',
    documentStatus: 'Preserved from the overloaded August 19 source list as a conditional South Coast branch; it must displace another stop.',
  },
  'skogafoss-waterfall-way': {
    dayIds: [dayId('2026-08-21')],
    status: 'working',
    documentStatus: 'Skógafoss is the single South Coast core stop on the August 21 working line; any longer Waterfall Way walk remains an open energy decision.',
  },
  'seljalandsfoss-gljufrabui': {
    dayIds: [dayId('2026-08-21')],
    status: 'conditional',
    documentStatus: 'Preserved as an August 21 replacement branch. Adding it to the Golden Circle core would overload the day.',
    planningContext: 'The latest source includes both waterfalls inside its overloaded South Coast list. They share one stop; the linked Svartifoss page is incorrect. Use this only as part of the replacement branch, not as an add-on to the Golden Circle core.',
  },
  'heimaey-puffin-volcano': {
    dayIds: [dayId('2026-08-21')],
    status: 'conditional',
    documentStatus: 'Preserved from the latest source as a replacement branch from the South Coast, not an additive stop; no ferry or tour is recorded as booked.',
  },
  'dalfjall-hike': {
    dayIds: [dayId('2026-08-21')],
    status: 'conditional',
    documentStatus: 'Preserved inside the replacement-only Heimaey branch; it is not part of the August 21 Golden Circle core.',
  },
  'herjolfsdalur-camping': {
    dayIds: [dayId('2026-08-21')],
    status: 'conditional',
    documentStatus: 'Preserved inside the replacement-only Heimaey branch. An island overnight would consume the protected August 22 buffer and requires a different ferry/sleep plan.',
  },
  'beluga-sanctuary': {
    dayIds: [dayId('2026-08-21')],
    status: 'conditional',
    documentStatus: 'Preserved inside the replacement-only Heimaey branch; no ticket is recorded as booked.',
  },
  gullfoss: { dayIds: [dayId('2026-08-21')], status: 'working' },
  'golden-circle-core': { dayIds: [dayId('2026-08-21')], status: 'working' },
  thingvellir: { dayIds: [dayId('2026-08-21')], status: 'working' },
  'silfra-split': { dayIds: [dayId('2026-08-21')], status: 'conditional' },
  'weather-buffer': {
    dayIds: [dayId('2026-08-22')],
    status: 'working',
    location: 'Þingvellir / route-wide',
    map: map(64.25541, -21.128043, [14, 18]),
    documentStatus: 'August 22 remains blank in the latest source. The working route protects it at the Þingvellir overnight instead of spending it in advance.',
  },
  reykjadalur: { dayIds: [dayId('2026-08-23')], status: 'working' },
  perlan: { dayIds: [dayId('2026-08-23')], status: 'open' },
  'sky-lagoon': { dayIds: [dayId('2026-08-23')], status: 'conditional' },
  'reykjavik-pools': { dayIds: [dayId('2026-08-22'), dayId('2026-08-23')], status: 'open' },
  departure: { dayIds: [dayId('2026-08-24')], status: 'fixed' },
};

function finalizeOption(option) {
  const removalNote = removedFromLatestPlan.get(option.id);
  if (removalNote) {
    return {
      ...option,
      active: false,
      status: 'historical',
      dayIds: [],
      map: null,
      documentStatus: `${removalNote} This preserves the earlier option and any shared state without implying that the group rejected or completed it.`,
    };
  }
  return {
    ...option,
    active: true,
    ...(currentOptionOverrides[option.id] || {}),
  };
}

const outboundFlight = {
  id: 'outbound-flight', title: 'Overnight flight to Keflavík', shortTitle: 'Fly to Iceland',
  location: 'Toronto → Keflavík', status: 'booked', documentStatus: 'Outbound flight is recorded as booked for 23:10 on August 8; arrival is 08:45 local on August 9.',
  standout: false, reviewSignal: '',
  hook: 'Protect sleep and arrive ready for the camper handoff rather than planning another “Day 1” activity.',
  planningContext: 'Home-airport transport is recorded as confirmed and paid; private confirmation and cost stay off this board.',
  tags: ['fixed', 'family'], logistics: ['Aug 8 · 23:10', 'Overnight flight', 'Arrival 08:45 local'],
  dayIds: [dayId('2026-08-08')], map: map(63.985, -22.6056),
  visit: { duration: '5h35 stated flight time', walk: 'Airport only', difficulty: 'Overnight travel' },
  family: family('Sleep and a simple arrival are the whole plan.', 'Airport dependent', 'Useful for luggage', ['Overnight fatigue'], 'Keep arrival snacks, layers and sleep kit accessible.'),
  amenities: ['Airport and onboard services'],
  booking: booking(true, 'Flight is recorded as booked. Use the live airline itinerary for terminal and timing.', 'https://www.icelandair.com/'),
  pros: ['Fixed departure and confirmed ground transport.'], drawbacks: ['Overnight fatigue feeds directly into a long camper day.'],
  sources: [source('Icelandair', 'https://www.icelandair.com/')],
};

const raudasandur = {
  id: 'raudasandur', title: 'Rauðasandur red-sand beach', shortTitle: 'Rauðasandur',
  location: 'Southern Westfjords · Road 614', status: 'conditional',
  documentStatus: 'Named in the source alongside Látrabjarg. It is now a separate group choice because Road 614, tide and an overnight are their own commitment.',
  standout: true,
  reviewSignal: 'A conditions-aligned standout: families praise the scale, quiet and beach discoveries at low tide; poor weather, high tide and the steep access road explain the sharply less enthusiastic reports.',
  hook: 'A vast colour-shifting beach that can become a favourite—when tide, visibility and driver confidence all agree.',
  planningContext: 'Choose this or Látrabjarg, not both casually. Beach amenities are not assumed; Melanes campsite is a separate pin roughly 3 km away.',
  tags: ['family', 'weather-flex'],
  logistics: ['Road 614 branch', '2–4h including access', 'Low-tide/weather gate'],
  dayIds: [dayId('2026-08-10')], map: map(65.474415, -23.960064, [14, 18]),
  visit: { duration: '2–4h including access', walk: 'About 15–20m each way to open sand; flexible beyond', difficulty: 'Easy beach / difficult camper approach' },
  family: family('Excellent flexible nature stop if tide and road conditions cooperate; possible seals are a bonus, never a promise.', 'No on wet or soft sand', 'Useful', ['Steep narrow gravel switchbacks', 'No guardrails', 'Fog/high wind', 'Fast-changing tide and wet access', 'Remote services'], 'Road 614 is the real commitment. Keep at least 100 m from seals and never use a drone near them.'),
  amenities: ['Melanes campsite about 3 km away: small kitchen', 'Five toilets and two showers at Melanes', 'Washer and limited electric pitches at Melanes', 'Seasonal café cannot be relied on without a live check'],
  booking: booking('Confirm eclipse-week capacity if using Melanes; the beach itself is unbooked.', 'Do not conflate campsite services with the beach pin. Check Road 614 and the 2026 tide table before departure.', 'https://www.melanes.com/campsite', '+354 783 6600', 'Melanes campsite ↗'),
  pros: ['Extraordinary scale, colour and tranquillity.', 'Child-led beach exploration with flexible distance.', 'Possible seals and a nearby overnight option.'],
  drawbacks: ['Steep Road 614 can be stressful in two large campers.', 'High tide or poor visibility can erase much of the payoff.', 'It cannot be combined casually with Látrabjarg.'],
  sources: [
    source('Official Visit Westfjords beach guide', 'https://www.westfjords.is/en/place/raudasandur'),
    source('Melanes campsite', 'https://www.melanes.com/campsite'),
    source('Umferðin · Road 614', 'https://umferdin.is/kafli/90521'),
    source('Official 2026 tide tables', 'https://www.lhg.is/wp-content/uploads/2025/11/Sjavarfallatoflur_2026_vefutgafa.pdf'),
    source('Family travel report', 'https://fullsuitcase.com/raudisandur-iceland/', 'travel blog'),
    source('Balanced traveller reviews', 'https://www.tripadvisor.com/Attraction_Review-g2242596-d7187391-Reviews-Raudasandur_Beach-Latrabjarg_Westfjords_Region.html', 'reviews'),
  ],
};

const eclipseArngerdareyri = {
  id: 'eclipse-arngerdareyri', title: 'Total eclipse from Arngerðareyri', shortTitle: 'Arngerðareyri eclipse site',
  location: 'Official gathering site near the airstrip', status: 'open',
  documentStatus: 'The eclipse date is fixed; this designated northbound site is an open alternative to Patreksfjörður, not a booked overnight.',
  standout: false, reviewSignal: '',
  hook: 'The route-efficient eclipse choice: no hike and no southern backtrack, but a much thinner comfort and service layer.',
  planningContext: 'Parking is verified onsite. Toilets, food, fuel, shelter, camping and accessibility are not; Hotel Reykjanes is a separate 38 km drive.',
  tags: ['family', 'weather-flex'],
  logistics: ['Official designated gathering site', 'Arrive early and stay late', 'Sleep/toilet plan still required'],
  dayIds: [dayId('2026-08-12')], map: map(65.90575, -22.36156, [14, -12]),
  visit: { duration: 'Stage early; remain well after 18:45', walk: 'Low-effort gravel staging', difficulty: 'Easy terrain / high logistics' },
  family: family('Low-effort viewing, high-logistics staging: workable with children only with stocked campers and a confirmed toilet/sleep plan.', 'Firm/gravel staging only; accessibility unverified', 'Normally unnecessary', ['Solar-eye injury during partial phases', 'Exposed cold/wind', 'Vehicle and crowd movement', 'Finite parking', 'Long delays', 'Limited phone/services'], 'Use ISO 12312-2 glasses during every partial phase. No roadside stopping, and no site-hopping.'),
  amenities: ['Designated gravel parking for cars and buses', 'No other onsite amenity is currently verified', 'Hotel Reykjanes camping/pool/restaurant is a separate 38 km drive'],
  booking: booking('Choose the site and confirm a sleep/toilet fallback; the gathering site has no attraction ticket.', 'Bring food, water, warm layers and full fuel. Arrive early and stay late.', 'https://www.westfjords.is/en/experiences/solar-eclipse-2026', '+354 450 8060', 'Official eclipse plan ↗'),
  pros: ['Official designated viewing site.', 'Avoids the Patreksfjörður backtrack.', 'Preserves northbound route progress and prevents site-chasing.'],
  drawbacks: ['Far thinner service/comfort layer than Patreksfjörður.', 'No onsite camping or toilets are confirmed.', 'Finite parking, remote communications and possible long delays.'],
  sources: [
    source('Official Westfjords eclipse plan', 'https://www.westfjords.is/en/experiences/solar-eclipse-2026'),
    source('Government eclipse guidance', 'https://island.is/en/p/total-solar-eclipse-2026/the-westfjords-and-latrabjarg'),
    source('Official gathering-site map pin', 'https://maps.app.goo.gl/JQwMyq9ms4K1uqMH8'),
    source('Nearby Hotel Reykjanes camping', 'https://reykjaneswestfjords.is/camping/'),
  ],
};

const seydisfjordur = {
  id: 'seydisfjordur', title: 'Seyðisfjörður as a deliberate spoke', shortTitle: 'Seyðisfjörður',
  location: 'Road 93 from Egilsstaðir', status: 'conditional',
  documentStatus: 'The source lists Seyðisfjörður before northern stops. Geographically it is a separate Egilsstaðir out-and-back after Stuðlagil, not a through-road south.',
  standout: false, reviewSignal: 'Travellers value the fjord arrival and compact town; 2026 campsite reports disagree on crowding/cleanliness, so arrival time matters.',
  hook: 'A beautiful fjord town worth choosing deliberately—not a free stop between the north and South Coast.',
  planningContext: 'Only add it by dropping another east detour or accepting a later camp; Road 93 is exposed in fog and wind.',
  tags: ['family', 'weather-flex'], logistics: ['54.5 km return from Egilsstaðir', '2–4h or overnight', 'First-come campsite'],
  dayIds: [dayId('2026-08-15')], map: map(65.260598, -14.012072, [14, 18]),
  visit: { duration: '2–4h or overnight', walk: 'Compact town', difficulty: 'Easy town / exposed mountain road' },
  family: family('Town and campsite are child-friendly when Road 93 conditions are good.', 'Town dependent', 'Not normally needed', ['Fog/high wind on Fjarðarheiði'], 'Do not treat it as a through-road south.'),
  amenities: ['Camp showers', 'Kitchen/common room', 'Laundry', 'Waste/electricity', 'Adjacent grocery', 'Nearby pool/food/fuel'],
  booking: booking(false, 'Campsite is first-come; bookings are not possible.', 'https://seydisfjordurcampsite.com/', '+354 792 0070', 'Official campsite ↗'),
  pros: ['Memorable fjord descent and walkable town.', 'Excellent full-service camp.'],
  drawbacks: ['Separate 54.5 km return spoke.', 'First-come camp can crowd.', 'Exposed road requires a live weather call.'],
  sources: [source('Official East Iceland destination', 'https://www.east.is/en/destinations/communities/seydisfjordur'), source('Official campsite', 'https://seydisfjordurcampsite.com/')],
};

const husavikWhaleWatching = {
  id: 'husavik-whale-watching', title: 'Húsavík Original Whale Watching', shortTitle: 'Húsavík whales',
  location: 'Húsavík harbour · Skjálfandi Bay', status: 'conditional',
  documentStatus: 'Ásbyrgi / Húsavík is preserved from the source’s north-Iceland list. No whale tour is booked.',
  standout: true,
  reviewSignal: 'Thousands of tour reviews repeatedly praise the crew, wildlife interpretation and memorable sightings. The consistent drawbacks are cold, seasickness and wildlife variability—no departure can guarantee whales.',
  hook: 'A three-hour traditional-oak-boat search for whales in the place most associated with the experience.',
  planningContext: 'This uses North Sailing’s Original tour as the researched operator. The measured Goðafoss → Húsavík → Reykjahlíð alternative is 101.8 km / 1h32 car baseline, excluding check-in and the three-hour tour; it is not part of the working route.',
  tags: ['family', 'standout', 'book-ahead'],
  logistics: ['101.8 km / 1h32 branch baseline', 'Tour about 3h', 'Book a few days ahead'],
  dayIds: [dayId('2026-08-14')], map: map(66.0450541, -17.3434773, [14, -14]),
  visit: { duration: 'About 3h plus check-in', walk: 'Harbour boarding', difficulty: 'Cold open-water tour' },
  family: family('North Sailing welcomes children of all ages and allows strollers aboard; cold and duration still need an honest family check.', 'Allowed aboard by operator', 'Not applicable aboard', ['Cold/wet exposure', 'Seasickness', 'No sighting guarantee'], 'Dress children very warmly even when the land weather feels mild.'),
  amenities: ['Warm overalls and raincoats if needed', 'Hot chocolate and cinnamon cookie', 'Harbour food and ticket office', 'Whale Museum discount with boarding card'],
  booking: booking(true, 'Reserve a dated departure a few days ahead and reconfirm sea conditions when travelling a long distance.', 'https://www.northsailing.is/tour/husavik-original-whale-watching/', '+354 464 7272', 'North Sailing Original tour ↗'),
  pros: ['One of North Iceland’s clearest review-backed experiences.', 'All-ages operator policy keeps the group together.', 'Professional guide and traditional oak boat add context beyond a sighting checklist.'],
  drawbacks: ['Adds a booked three-hour activity to an already active north day.', 'Cold and seasickness can be significant.', 'Wild whales are never guaranteed.'],
  sources: [
    source('North Sailing Original tour', 'https://www.northsailing.is/tour/husavik-original-whale-watching/'),
    source('North Sailing family and weather FAQ', 'https://www.northsailing.is/whale-watching/frequently-asked-questions/'),
    source('Original-tour traveller reviews', 'https://www.tripadvisor.com/AttractionProductReview-g189963-d11462056-Traditional_Oak_Ship_Whale_Watching_Tour_From_Husavik-Husavik_Northeast_Region.html', 'reviews'),
  ],
};

const hverfjall = {
  id: 'hverfjall', title: 'Hverfjall crater hike', shortTitle: 'Hverfjall',
  location: 'Lake Mývatn · northwest crater trail', status: 'conditional',
  documentStatus: 'Named as its own hike in the source. It is now independently rankable instead of being bundled with Hverir.',
  standout: true,
  reviewSignal: 'Traveller reports consistently value the crater-scale view and short ascent; the recurring cautions are the steep loose surface, exposed wind, current parking fee and rough summer access road.',
  hook: 'Climb the black tephra rim for a volcanic panorama over Lake Mývatn.',
  planningContext: 'The official northwest route climbs about 600 m to the rim in 10–25 minutes; the full rim is about 3.2 km / one hour before descent. Treat it as the day’s hike, not an automatic add-on to Hverir.',
  tags: ['standout', 'hike', 'weather-flex'],
  logistics: ['600 m ascent trail to rim', '3.2 km rim circuit', 'Rough summer approach and wind gate'],
  dayIds: [dayId('2026-08-14')], map: map(65.606098, -16.875055, [14, 18]),
  visit: { duration: '45–75m summit return; 1.5–2h with rim', walk: '600 m to rim; 3.2 km rim circuit', difficulty: 'Short, steep and exposed' },
  family: family('A higher-energy hiking choice, not the default whole-family stop.', 'No', 'Only for a confident adult in low wind', ['Loose tephra', '20–25° slopes', 'Exposed crater rim', 'Strong wind'], 'Turn back below the rim if footing, wind or energy is wrong; the south trail toward Dimmuborgir is the steep difficult route.'),
  amenities: ['Northwest parking area', 'No reliable food or full service at the trailhead', 'Use Reykjahlíð/Dimmuborgir for services'],
  booking: booking(false, 'No attraction reservation. Read current parking signs and confirm the approach is suitable for both rigs.', 'https://www.ust.is/english/visiting-iceland/protected-areas/north-east/hverfjall/', '', 'Official Hverfjall guidance ↗'),
  pros: ['True crater-scale experience in a compact hike.', 'Panoramic Mývatn view.', 'Summit-only turnaround scales the effort.'],
  drawbacks: ['Exposed rim and loose footing are not stroller-friendly.', 'Poor approach road needs a live camper check.', 'Combining a rim walk with every Mývatn stop overloads the day.'],
  sources: [
    source('Official Hverfjall access and trail lengths', 'https://www.ust.is/english/visiting-iceland/protected-areas/north-east/hverfjall/'),
    source('Official North Iceland destination', 'https://www.northiceland.is/en/destinations/family-friendly/hverfjall'),
    source('Detailed camper trip report', 'https://www.reddit.com/r/VisitingIceland/comments/1ex4u9l/julyaug_2024_17_days_campervan_around_iceland/', 'travel post'),
  ],
};

const asbyrgi = {
  id: 'asbyrgi', title: 'Ásbyrgi canyon and Botnstjörn', shortTitle: 'Ásbyrgi',
  location: 'Jökulsárgljúfur · north of Dettifoss', status: 'conditional',
  documentStatus: 'Preserved from the source’s “Ásbyrgi / Húsavík” north-Iceland idea. It is not booked and is not on the working Mývatn → Dettifoss line.',
  standout: false,
  reviewSignal: 'The easy pond-and-forest walk draws strong family and tranquillity reports; other travellers rank the canyon floor below Iceland’s more dramatic stops or report rougher footing on optional rim trails.',
  hook: 'Trade volcanic barrenness for a sheltered horseshoe canyon, birch forest and a quiet pond.',
  planningContext: 'The measured Reykjahlíð → Ásbyrgi → Dettifoss alternative is 114.0 km / 1h38 car baseline, excluding the visit. On August 15 it only fits by dropping another long stop or changing the overnight target.',
  tags: ['family', 'weather-flex'],
  logistics: ['114.0 km / 1h38 branch baseline', 'A1 Botnstjörn 1 km / 30m', 'Visitor centre and campground'],
  dayIds: [dayId('2026-08-15')], map: map(66.0284991, -16.4871638, [14, -14]),
  visit: { duration: '45–90m for the easy canyon-floor version', walk: 'A1 Botnstjörn · 1 km / about 30m', difficulty: 'Easy; official limited-mobility route' },
  family: family('The A1 pond trail is the whole-family version; skip exposed rim routes on this schedule.', 'A1 is designated for limited mobility; verify surface onsite', 'Not normally needed on A1', ['Pond edge', 'Cliffs on optional routes', 'Long route detour'], 'Use Gljúfrastofa staff to confirm the simplest open trail and do not drift onto a longer rim hike.'),
  amenities: ['Gljúfrastofa visitor centre', 'Campground washrooms and showers', 'Cooking facilities and drinking water', 'Laundry and electric pitches at campground'],
  booking: booking('Only if sleeping at Ásbyrgi', 'No day-visit ticket. The park advises booking the popular campground, especially for electricity.', 'https://www.vatnajokulsthjodgardur.is/en/areas/jokulsargljufur/tjaldsvaedid-i-asbyrgi', '+354 470 7100', 'Official Ásbyrgi campground ↗'),
  pros: ['A gentle forest-and-pond contrast to the volcanic north.', 'Official short limited-mobility trail.', 'Visitor centre and strong campsite services.'],
  drawbacks: ['The branch competes directly with Dettifoss, Stuðlagil and reaching Egilsstaðir.', 'Some reviews find the easy canyon-floor view modest after other Iceland highlights.', 'Longer rim trails introduce cliff and footing risk.'],
  sources: [
    source('Official Ásbyrgi trails', 'https://www.vatnajokulsthjodgardur.is/en/areas/jokulsargljufur/asbyrgi'),
    source('Official Ásbyrgi campground', 'https://www.vatnajokulsthjodgardur.is/en/areas/jokulsargljufur/tjaldsvaedid-i-asbyrgi'),
    source('Current traveller reviews', 'https://www.tripadvisor.com/Attraction_Review-g7892530-d523242-Reviews-Asbyrgi_Shelter_of_the_Gods-Asbyrgi_Northeast_Region.html', 'reviews'),
    source('Family trip report', 'https://www.reddit.com/r/VisitingIceland/comments/w9gzz0/', 'travel post'),
  ],
};

const djupivogur = {
  id: 'djupivogur', title: 'Djúpivogur slow-town break', shortTitle: 'Djúpivogur',
  location: 'Eastfjords · Route 1', status: 'working',
  documentStatus: 'The source calls Djúpivogur a “happy little town on the way to Stokksnes.” It now has its own ranking and notes.',
  standout: false,
  reviewSignal: 'Travellers value the quiet waterfront, services and unusual Eggs of Merry Bay; weaker reviews treat the eggs as a brief photo stop rather than a destination.',
  hook: 'A deliberately unhurried harbour, useful services and 34 oversized bird eggs beside the water.',
  planningContext: 'Use this as the flexible service and movement break before Stokksnes, not as part of a fictional four-hour adjacent leg.',
  tags: ['family', 'services', 'weather-flex'],
  logistics: ['30–60 minutes', 'Directly on paved Route 1', 'Food, fuel, pool and campsite nearby'],
  dayIds: [dayId('2026-08-16')], map: map(64.656158, -14.280251, [14, 18]),
  visit: { duration: '30–60m', walk: 'Short town/waterfront stroll', difficulty: 'Easy' },
  family: family('A low-pressure movement and resupply stop for the whole group.', 'Town and waterfront surfaces vary', 'Usually unnecessary', ['Harbour edge', 'Road crossings', 'Wind'], 'Let the youngest pace decide whether this is eggs, food, pool or simply a reset.'),
  amenities: ['Campsite with basic services within 500 m of town amenities', 'Swimming pool with hot tubs and small children’s pool', 'Food/café', 'Fuel and groceries'],
  booking: booking(false, 'No attraction reservation. Check live hours if relying on the pool, Langabúð or campsite.', 'https://www.east.is/en/destinations/communities/djupivogur', '', 'Official East Iceland guide ↗'),
  pros: ['Directly on the correct coastal Route 1 line.', 'Useful family services and resupply.', 'Easy to shorten without losing the route.'],
  drawbacks: ['Not a major standalone landscape.', 'Waterfront art gets mixed reviews.', 'A long lunch here reduces Stokksnes margin.'],
  sources: [
    source('Official East Iceland destination and services', 'https://www.east.is/en/destinations/communities/djupivogur'),
    source('Current Djúpivogur attraction reviews', 'https://www.tripadvisor.com/Attractions-g315846-Activities-Djupivogur_East_Region.html', 'reviews'),
  ],
};

const dalfjallHike = {
  id: 'dalfjall-hike', title: 'Dalfjall and Eggjar ridge hike', shortTitle: 'Dalfjall hike',
  location: 'Heimaey · Herjólfsdalur', status: 'conditional',
  documentStatus: 'Explicitly requested in the source. It is now separate from the researched Eldfell tour and has not been booked.',
  standout: false,
  reviewSignal: 'Traveller posts praise the ridge and ocean views, while local guidance makes the exposure plain: it is self-responsibility terrain, wind changes the decision and the full ridge is not a casual young-child walk.',
  hook: 'Climb from the green valley onto a narrow island ridge with sea views in every direction.',
  planningContext: 'The municipality lists about 2.3 km, one hour and 220 m ascent, ending near Sprangan with a 15-minute walk back to Herjólfsdalur. With campers left on the mainland, reach the trailhead by local transport or a long walk—Eldfell is a separate option, not a substitute.',
  tags: ['hike', 'weather-flex'],
  logistics: ['About 2.3 km / 1h', 'About 220 m ascent', 'Local transport needed from harbour'],
  dayIds: [dayId('2026-08-19')], map: map(63.4448, -20.2942, [14, -14]),
  visit: { duration: '1–1.5h plus local transfer', walk: 'About 2.3 km point-to-point/ridge route', difficulty: 'Steep and exposed' },
  family: family('An adult/strong-hiker split unless live conditions and the group’s demonstrated hiking pace clearly support it.', 'No', 'Not recommended on the exposed ridge', ['Steep slopes', 'Exposed ridge', 'Strong wind', 'Route-finding'], 'Local guidance says hikers proceed at their own risk; do not force this into the whole-family day.'),
  amenities: ['Herjólfsdalur campsite services near trail start', 'No services on the ridge', 'Town services before/after'],
  booking: booking(false, 'No hike reservation. Arrange local transport and use the municipal route description plus live wind before committing.', 'https://www.vestmannaeyjar.is/menning-mannlif/heilsuraekt-og-utivist/gonguleidir', '', 'Official municipal hiking routes ↗'),
  pros: ['Preserves a source-authored island priority.', 'Large views from a compact route.', 'Starts beside Herjólfsdalur.'],
  drawbacks: ['Not the safe whole-family default.', 'Wind or wet ground can erase the option.', 'Competes with the puffin tour, sanctuary and ferry schedule.'],
  sources: [
    source('Official municipal Dalfjall and Eggjar route', 'https://www.vestmannaeyjar.is/menning-mannlif/heilsuraekt-og-utivist/gonguleidir'),
    source('Current traveller discussion', 'https://www.reddit.com/r/VisitingIceland/comments/1d29fbz/hiking_dalfjjall_on_the_westman_islands/', 'travel post'),
    source('Family day-trip perspective', 'https://www.reddit.com/r/VisitingIceland/comments/1skm0dl/westman_islands_day_trip/', 'travel post'),
  ],
};

const herjolfsdalurCamping = {
  id: 'herjolfsdalur-camping', title: 'Camp in Herjólfsdalur', shortTitle: 'Herjólfsdalur camp',
  location: 'Heimaey · Herjólfsdalur valley', status: 'conditional',
  documentStatus: 'The source says “camping at base of hike—figure this out.” No pitch, glamping unit or vehicle ferry is booked.',
  standout: false,
  reviewSignal: 'Verified-stay listings rate the valley location exceptionally highly and praise the setting and shared facilities; some campsite reviews warn that toilets can feel too limited at peak occupancy.',
  hook: 'Sleep beneath the island cliffs at the Dalfjall trailhead instead of racing back to the mainland.',
  planningContext: 'This conflicts with the current foot-passenger plan that leaves both campers at Landeyjahöfn. Sleeping here in the rented campers requires two vehicle-ferry spaces using exact rig dimensions; otherwise the group needs separately booked tents/glamping or other island lodging. The measured harbour → camp → harbour road loop is 3.5 km / 8 minutes only after transport is on the island.',
  tags: ['camping', 'book-ahead', 'branch'],
  logistics: ['Conflicts with leave-campers-mainland plan', '3.5 km / 8m island road loop', 'Contact camp and ferry before assent'],
  dayIds: [dayId('2026-08-19')], map: map(63.4424937, -20.2982342, [-132, 18]),
  visit: { duration: 'Overnight alternative', walk: 'At Dalfjall trail base', difficulty: 'Transport and booking decision' },
  family: family('Potentially excellent family setting only after sleep equipment, toilets and transport are genuinely solved.', 'Camp-dependent', 'Optional', ['Peak-site crowding', 'Cliff/ridge surroundings', 'Ferry disruption'], 'Do not turn a scenic campsite into an unplanned night without the actual sleeping setup.'),
  amenities: ['Service centre', 'Restrooms and showers', 'Cooking facilities with dining area', 'Cleaning facilities'],
  booking: booking('Camp contact plus island transport required', 'Ask the current operator about two pitches or alternative lodging; separately confirm vehicle-ferry inventory if taking either camper.', 'https://www.vestmannaeyjar.is/frettir/tjaldsvaedi-i-vestmannaeyjum-1', '+354 860 9073', 'Official municipal camp contact ↗'),
  pros: ['Exceptional valley setting and trailhead access.', 'Removes same-day ferry return pressure.', 'Strong location and facility review signal.'],
  drawbacks: ['Directly conflicts with the working foot-passenger plan.', 'Ferrying two large rigs requires exact dimensions and scarce inventory.', 'Peak-time toilet capacity draws complaints.'],
  sources: [
    source('Official municipal campsite contact', 'https://www.vestmannaeyjar.is/frettir/tjaldsvaedi-i-vestmannaeyjum-1'),
    source('Official Iceland campground directory', 'https://tjalda.is/en/campsite/vestmannaeyjar'),
    source('Current verified-stay reviews', 'https://www.booking.com/hotel/is/glamping-amp-camping.en-gb.html', 'reviews'),
    source('Balanced campsite reviews', 'https://www.tripadvisor.co.uk/Hotel_Review-g189977-d10440443-Reviews-Glamping_Camping-Vestmannaeyjar_Heimaey_Island_Westmann_Islands_South_Region.html', 'reviews'),
  ],
};

const gullfoss = {
  id: 'gullfoss', title: 'Gullfoss waterfall', shortTitle: 'Gullfoss',
  location: 'Golden Circle · Hvítá river', status: 'working',
  documentStatus: 'Named in the source, which calls it the country’s busiest waterfall. It now has its own ranking and note target.',
  standout: true,
  reviewSignal: 'A 2026 Travellers’ Choice attraction with 4.7/5 across more than 12,000 reviews at the research snapshot. Visitors praise the scale, power and clear viewpoints; crowds, spray, wind and slippery stairs are the repeated drawbacks.',
  hook: 'A two-stage glacial waterfall that still delivers scale after a waterfall-heavy circuit.',
  planningContext: 'First stop in the corrected westbound Golden Circle order: Gullfoss → Geysir → Þingvellir.',
  tags: ['family', 'standout', 'weather-flex'],
  logistics: ['45–60 minutes', 'Upper and lower viewpoints', 'Go early for the best crowd margin'],
  dayIds: [dayId('2026-08-20')], map: map(64.325235, -20.130594, [14, -14]),
  visit: { duration: '45–60m', walk: 'Short signed viewpoints; stairs to lower views', difficulty: 'Easy upper view / wet stairs and path below' },
  family: family('Strong whole-family payoff from the main viewpoints.', 'Upper area dependent', 'Helpful for lower path only', ['Wet/slippery paths', 'Waterfall edge', 'Cold spray and wind'], 'Use the upper view if stairs, spray or crowding make the lower path the wrong choice.'),
  amenities: ['Parking', 'Food/café', 'Toilets', 'Shop'],
  booking: booking(false, 'No attraction reservation. Check current path closures and live parking signs.', 'https://www.ust.is/english/visiting-iceland/protected-areas/south/gullfoss/', '', 'Official Gullfoss page ↗'),
  pros: ['Exceptional current review signal.', 'Large payoff with little walking.', 'Directly first in the correct road order.'],
  drawbacks: ['Peak-hour crowds can dominate the stop.', 'Spray and wind make surfaces cold and slippery.', 'The group will already have seen many waterfalls.'],
  sources: [
    source('Official Gullfoss protected-area page', 'https://www.ust.is/english/visiting-iceland/protected-areas/south/gullfoss/'),
    source('2026 Gullfoss traveller reviews', 'https://www.tripadvisor.co.uk/Attraction_Review-g7940590-d1740559-Reviews-Gullfoss_Falls-Blaskogabyggd_South_Region.html', 'reviews'),
    source('June 2026 reverse-order trip report', 'https://www.reddit.com/r/VisitingIceland/comments/1ubuqcp/trip_report_june_613_2026/', 'travel post'),
  ],
};

const thingvellir = {
  id: 'thingvellir', title: 'Þingvellir National Park', shortTitle: 'Þingvellir',
  location: 'Golden Circle · rift and Alþingi landscape', status: 'working',
  documentStatus: 'Named in the source and the working overnight. It now has its own ranking and note target, separate from Silfra.',
  standout: true,
  reviewSignal: 'A 2026 Travellers’ Choice attraction with more than 4,000 reviews at the research snapshot. Travellers value the history, rift landscape and marked walks; crowding, dispersed parking and underestimating the walking time drive weaker reports.',
  hook: 'End the Golden Circle where Iceland’s parliament and a visible continental rift share one landscape.',
  planningContext: 'Final stop and working sleep in the corrected westbound order. Rank the national park separately from the age/eligibility-gated Silfra activity.',
  tags: ['family', 'standout', 'camping'],
  logistics: ['1–2 hours for a core walk', 'Bookable motorhome campsite', 'Hidden fissure supervision'],
  dayIds: [dayId('2026-08-20')], map: map(64.25541, -21.128043, [-122, -14]),
  visit: { duration: '1–2h core visit; longer if desired', walk: 'Flexible marked rift/history paths', difficulty: 'Easy to moderate; dispersed site' },
  family: family('A flexible whole-family stop when the route is kept short and adults actively supervise fissures.', 'Main visitor areas vary', 'Useful for longer paths', ['Hidden fissures and cracks', 'Wet paths', 'Road and parking crossings'], 'Official camp rules explicitly require careful child supervision because fissures can be hidden.'),
  amenities: ['Visitor centre and toilets', 'Leirar campsite showers', 'Laundry', 'Motorhome electricity at Nyrðri/Syðri-Leirar', 'Chemical-toilet disposal at Syðri-Leirar'],
  booking: booking('Attraction no; campsite optional', 'Advance camping is not required but can be booked. Use a motorhome-capable Leirar area, not the tent-only fields.', 'https://www.thingvellir.is/en/service/camping/', '+354 488 1800', 'Official Þingvellir camping ↗'),
  pros: ['National history and rift geology in one stop.', 'Core walk can scale to family energy.', 'A serviced overnight prevents westbound backtracking.'],
  drawbacks: ['Large, dispersed site is easy to underestimate.', 'Crowds and multiple parking areas complicate a short visit.', 'Hidden fissures require active supervision.'],
  sources: [
    source('Official Þingvellir visitor centre', 'https://www.thingvellir.is/en/things-to-do/visitor-centre/'),
    source('Official Þingvellir camping and safety rules', 'https://www.thingvellir.is/en/service/camping/'),
    source('2026 Þingvellir traveller reviews', 'https://www.tripadvisor.com/Attraction_Review-g315853-d276576-Reviews-Thingvellir_National_Park-Thingvellir_South_Region.html', 'reviews'),
  ],
};

const activePlace = ({
  id, title, shortTitle = title, location, status = 'open', documentStatus,
  hook, planningContext, tags = ['family'], logistics = [], dayIds, map: placeMap,
  visit, family: familyDetails = COMMON_FAMILY, amenities = [], booking: bookingDetails,
  pros = [], drawbacks = [], reviewSignal = '', standout = false, sources = [],
}) => ({
  id, title, shortTitle, location, status, active: true, documentStatus,
  standout, reviewSignal, hook, planningContext, tags, logistics, dayIds,
  map: placeMap, visit, family: familyDetails, amenities,
  booking: bookingDetails || booking(false, 'No booking is recorded. Recheck live access before relying on this stop.'),
  pros, drawbacks, sources,
});

const hamrarCampsite = activePlace({
  id: 'hamrar-campsite',
  title: 'Camping Hamrar · Aug 13 last confirmed',
  shortTitle: 'Camping Hamrar',
  location: 'Hamrar 1 · Akureyri',
  status: 'checked-in',
  documentStatus: 'Traveller-confirmed check-in on August 13. Hamrar is the latest confirmed position; it is not in the official 30-site Camping Card roster.',
  hook: 'Use the Aug 13 Hamrar check-in as the last confirmed Akureyri anchor for settling the next two sleeps and beginning the Diamond Circle.',
  planningContext: 'This is the real last-confirmed location, not an inferred completion record for optional stops earlier in the day. The latest source places Hamrar about 5 km from central Akureyri.',
  tags: ['locked', 'camping', 'services', 'current'],
  logistics: ['Checked in · traveller update', 'Akureyri service base', 'Camping Card does not cover this site'],
  dayIds: [dayId('2026-08-13')],
  map: map(65.648381, -18.103282, [14, 18]),
  visit: { duration: 'Aug 13 confirmed check-in', walk: 'Camp and Akureyri dependent', difficulty: 'Easy base day' },
  family: family('A practical full-service reset after the long Westfjords transfer.', 'Camp-dependent', 'Optional', ['Campground vehicle movements', 'Playground supervision'], 'At the Aug 13 check-in, the next logistics tasks were food, groceries and the two-pitch Ásbyrgi decision.'),
  amenities: ['Toilets and showers', 'Electric hookups', 'Kitchen and laundry services', 'Playground and walking paths', 'Akureyri food, fuel and groceries nearby'],
  booking: booking(true, 'Checked in according to the traveller update. Use the live reception record for pitch, payment and departure details.', 'https://www.hamrar.is/home', '', 'Camping Hamrar official site ↗'),
  pros: ['Traveller-confirmed Aug 13 check-in.', 'Strong family and camper service layer.', 'Good place to settle the next nights before adding attractions.'],
  drawbacks: ['Not a Camping Card site.', 'The next electrical-pitch decision is still open.'],
  sources: [source('Camping Hamrar official site', 'https://www.hamrar.is/home')],
});

const kolugljufur = activePlace({
  id: 'kolugljufur', title: 'Kolugljúfur canyon and waterfall', shortTitle: 'Kolugljúfur',
  location: 'Víðidalur · northbound transfer', status: 'working',
  documentStatus: 'Named as the halfway stop on the latest August 13 route. Hamrar arrival is confirmed; a completed canyon visit is not assumed.',
  hook: 'A compact canyon-and-waterfall break on the otherwise long transfer to Akureyri.',
  planningContext: 'The route passes the canyon between Flókalundur and Hamrar. Keep it as a time-boxed stop, not evidence that the optional visit happened.',
  tags: ['family', 'waterfall', 'current-route'], logistics: ['Halfway transfer stop', 'Short viewpoint visit', 'No completion inferred'],
  dayIds: [dayId('2026-08-13')], map: map(65.335107, -20.572708, [14, -14]),
  visit: { duration: '30–45m', walk: 'Short uneven viewpoints', difficulty: 'Easy to moderate' },
  family: family('A useful movement break with close supervision at the canyon.', 'No', 'Helpful', ['Unprotected canyon edges', 'Wet or uneven ground'], 'Use only the safest viewpoint the conditions support.'),
  amenities: ['Small parking area', 'No full service layer assumed'],
  pros: ['Breaks the long drive.', 'Large landscape payoff in a short stop.'],
  drawbacks: ['Edge exposure requires active supervision.', 'No optional visit is marked complete.'],
  sources: [source('Official North Iceland destination guide', 'https://www.northiceland.is/en/place/kolugljufur')],
});

const husavikTownStop = activePlace({
  id: 'husavik-town-stop', title: 'Húsavík harbourfront or café stop', shortTitle: 'Húsavík town stop',
  location: 'Húsavík · Diamond Circle', status: 'open',
  documentStatus: 'The latest source asks whether the town is worth a short harbourfront, bite or coffee stop. It does not propose whale watching.',
  hook: 'A colourful harbour and food reset if the group wants a town pause between Goðafoss and Ásbyrgi.',
  planningContext: 'This is a short town branch, not a three-hour wildlife tour. It adds road time and must not erode the Ásbyrgi arrival/electrical-pitch plan.',
  tags: ['food', 'town', 'branch'], logistics: ['Optional Goðafoss → Húsavík → Ásbyrgi branch', '30–60m town stop', 'Live café hours required'],
  dayIds: [dayId('2026-08-14')], map: map(66.045054, -17.343477, [14, 18]),
  visit: { duration: '30–60m', walk: 'Short harbourfront stroll', difficulty: 'Easy' },
  family: family('A low-effort food and harbour break if everyone wants it.', 'Town-dependent', 'Usually unnecessary', ['Harbour edge', 'Traffic'], 'Keep the stop short enough to protect Ásbyrgi.'),
  amenities: ['Cafés and restaurants', 'Fuel and town services', 'Public facilities vary by live hours'],
  pros: ['Pleasant service break.', 'Lets the group see Húsavík without committing to a tour.'],
  drawbacks: ['Adds a detour to an already full day.', 'Café hours and crowding need a live check.'],
  sources: [source('Official North Iceland · Húsavík', 'https://www.northiceland.is/en/destinations/communities/husavik')],
});

const asbyrgiCampsite = activePlace({
  id: 'asbyrgi-campsite', title: 'Ásbyrgi campsite · two electric pitches', shortTitle: 'Ásbyrgi campsite',
  location: 'Vatnajökull National Park · Ásbyrgi', status: 'open',
  documentStatus: 'The latest source says to decide whether to sleep here and, if yes, book two electrical sites. No booking is recorded.',
  hook: 'Sleeping inside the canyon makes Hljóðaklettar and Dettifoss the logical next morning instead of another Akureyri out-and-back.',
  planningContext: 'This is the highest-priority current logistics choice. Confirm two motorhome electrical pitches together; the day visit remains a separate card.',
  tags: ['camping', 'book-ahead', 'decision'], logistics: ['Two electrical sites needed', 'Book if staying', 'Natural start for August 15'],
  dayIds: [dayId('2026-08-14')], map: map(66.02466, -16.49658, [-132, 18]),
  visit: { duration: 'Overnight decision', walk: 'Campground dependent', difficulty: 'Booking/logistics gate' },
  family: family('A strong serviced family base that reduces next-day driving.', 'Camp-dependent', 'Optional', ['Campground traffic', 'Canyon terrain away from camp'], 'Do not assume adjacent electrical pitches until confirmed.'),
  amenities: ['Washrooms and showers', 'Cooking facilities and drinking water', 'Laundry', 'Electrical pitches', 'Visitor centre nearby'],
  booking: booking(true, 'The park recommends advance booking for electricity. Confirm two suitable motorhome pitches before relying on this sleep.', 'https://www.vatnajokulsthjodgardur.is/en/areas/jokulsargljufur/tjaldsvaedid-i-asbyrgi', '+354 470 7100', 'Official campsite booking ↗'),
  pros: ['Sets up the August 15 sequence cleanly.', 'Strong service layer.', 'Avoids an Akureyri return.'],
  drawbacks: ['Two electrical pitches are not yet confirmed.', 'Commits the group to the Diamond Circle pace.'],
  sources: [source('Official Ásbyrgi campground', 'https://www.vatnajokulsthjodgardur.is/en/areas/jokulsargljufur/tjaldsvaedid-i-asbyrgi')],
});

const hljodaklettar = activePlace({
  id: 'hljodaklettar', title: 'Hljóðaklettar · Sound Rocks', shortTitle: 'Hljóðaklettar',
  location: 'Jökulsárgljúfur · south of Ásbyrgi', status: 'working',
  documentStatus: 'First named August 15 stop in the latest source.',
  hook: 'Climb among echoing basalt formations before the much larger Dettifoss landscape.',
  planningContext: 'Use the roughly 1.2 km Tröllið/Hljóðaklettar version as the default; the 3 km circuit is an energy-dependent extension.',
  tags: ['family', 'hike', 'volcanic'], logistics: ['About 15m from Ásbyrgi camp', '1.2 km default route', 'Longer 3 km circuit optional'],
  dayIds: [dayId('2026-08-15')], map: map(65.93898, -16.532606, [14, -14]),
  visit: { duration: '45–90m', walk: 'About 1.2 km default; 3 km longer circuit', difficulty: 'Uneven lava terrain' },
  family: family('The short route can be a playful whole-family scramble at the youngest pace.', 'No', 'Helpful on uneven ground', ['Uneven basalt', 'Slips and short scrambles', 'Weather exposure'], 'Choose the short loop unless the group has abundant energy.'),
  amenities: ['Parking', 'Seasonal toilets/services require live confirmation', 'Ásbyrgi services nearby'],
  pros: ['Unusual tactile geology.', 'Short version fits the birthday day.', 'Directly on the planned route.'],
  drawbacks: ['Uneven terrain can take longer than the distance suggests.', 'The longer circuit would compress Dettifoss and Mývatn.'],
  sources: [source('Vatnajökull National Park · Jökulsárgljúfur', 'https://www.vatnajokulsthjodgardur.is/en/areas/jokulsargljufur')],
});

const myvatnCamp = activePlace({
  id: 'myvatn-camp', title: 'Lake Mývatn campsite decision', shortTitle: 'Mývatn camp',
  location: 'Lake Mývatn area', status: 'open',
  documentStatus: 'The latest source requires an August 15–16 Mývatn sleep but lists several candidate campgrounds without selecting one.',
  hook: 'Choose one two-night base so August 16 can stay local instead of becoming another packing-and-driving day.',
  planningContext: 'Hlíð, Vogar, Grjótagjá and Dimmuborgir are source-listed ideas, not a booking. Confirm two camper pitches, electricity, showers, waste service and late-arrival policy.',
  tags: ['camping', 'decision', 'two-night-base'], logistics: ['Camp August 15', 'Prefer same base August 16', 'Two campers and services to confirm'],
  dayIds: [dayId('2026-08-15'), dayId('2026-08-16')], map: map(65.62378, -16.91754, [14, 18]),
  visit: { duration: 'One or two nights', walk: 'Chosen campsite dependent', difficulty: 'Logistics decision' },
  family: family('A settled two-night base is the lowest-stress family option.', 'Camp-dependent', 'Optional', ['Midges', 'Campground vehicle movement'], 'Bring nets and choose services before scenery.'),
  amenities: ['Electricity to verify', 'Showers/toilets to verify', 'Waste and water service to verify', 'Food/fuel available around Reykjahlíð'],
  booking: booking('Select and confirm', 'No campground is recorded as chosen or booked. Compare the official directory and contact the selected site directly.', 'https://tjalda.is/en/', '', 'Official campground directory ↗'),
  pros: ['Turns August 16 into a genuine local day.', 'Reduces packing and decision fatigue.'],
  drawbacks: ['No site is selected yet.', 'Popular services/electricity may fill.'],
  sources: [source('Official Iceland campground directory', 'https://tjalda.is/en/')],
});

const dimmuborgir = activePlace({
  id: 'dimmuborgir', title: 'Dimmuborgir lava formations', shortTitle: 'Dimmuborgir',
  location: 'Lake Mývatn', status: 'working', documentStatus: 'Named as the second August 16 stop in the latest source.',
  hook: 'Walk through arches, caves and lava towers on a loop that can shrink with the group’s energy.',
  planningContext: 'Choose the roughly 30-minute small circle or the approximately 2.4 km Church Circle; do not assume both.',
  tags: ['family', 'hike', 'volcanic'], logistics: ['30m short loop', 'About 2.4 km / 1h Church Circle', 'Directly after Hverfjall'],
  dayIds: [dayId('2026-08-16')], map: map(65.591545, -16.9127, [14, 18]),
  visit: { duration: '30–75m', walk: 'Short loop or 2.4 km Church Circle', difficulty: 'Easy to moderate uneven paths' },
  family: family('Strong whole-family option because the route length is easy to scale.', 'Limited', 'Helpful', ['Uneven lava', 'Slippery rock'], 'Pick one loop and preserve energy for the rest of Mývatn.'),
  amenities: ['Parking', 'Seasonal café/toilets nearby; verify live hours'],
  pros: ['Distinctive formations.', 'Scalable loop lengths.', 'Logical local route.'], drawbacks: ['Can be busy.', 'Uneven ground limits stroller usefulness.'],
  sources: [source('Official protected-area guidance', 'https://www.ust.is/english/visiting-iceland/protected-areas/north-east/dimmuborgir/')],
});

const grjotagja = activePlace({
  id: 'grjotagja', title: 'Grjótagjá lava cave', shortTitle: 'Grjótagjá', location: 'Lake Mývatn', status: 'working',
  documentStatus: 'Named as a brief August 16 stop in the latest source.',
  hook: 'A quick look into a geothermal fissure and lava cave between the longer Mývatn walks.',
  planningContext: 'Treat this as a 20–30 minute geology stop. Bathing is not part of the plan; obey live barriers and private-land rules.',
  tags: ['geology', 'short-stop'], logistics: ['20–30m', 'Brief cave/fissure view', 'No bathing assumed'],
  dayIds: [dayId('2026-08-16')], map: map(65.627161, -16.881681, [14, -14]),
  visit: { duration: '20–30m', walk: 'Very short rough approach', difficulty: 'Uneven, confined cave access' },
  family: family('A short stop only if the cave entrance and supervision feel comfortable.', 'No', 'Not useful in cave', ['Slippery rock', 'Confined space', 'Hot water', 'Private-land restrictions'], 'View only from permitted areas and never enter the water.'),
  amenities: ['Small parking area', 'No services assumed'],
  pros: ['Fast geological contrast.', 'Fits between larger stops.'], drawbacks: ['Confined and slippery.', 'Limited payoff if crowded.'],
  sources: [source('Official North Iceland destination guide', 'https://www.northiceland.is/en/place/grjotagja')],
});

const kraflaViti = activePlace({
  id: 'krafla-viti', title: 'Krafla option · Víti crater', shortTitle: 'Krafla · Víti', location: 'Krafla volcanic area', status: 'open',
  documentStatus: 'One of two mutually exclusive Krafla options in the latest source.',
  hook: 'Choose the compact crater-lake version of Krafla when the day needs a shorter volcanic stop.',
  planningContext: 'This is the approximately 45–60 minute Krafla choice. Rank it against Leirhnjúkur rather than stacking both.',
  tags: ['branch', 'volcanic', 'weather-flex'], logistics: ['Choose one Krafla option', '45–60m', 'Shorter than Leirhnjúkur'],
  dayIds: [dayId('2026-08-16')], map: map(65.71766, -16.75655, [14, 18]),
  visit: { duration: '45–60m', walk: 'Short crater viewpoints/loop dependent on conditions', difficulty: 'Easy to moderate' },
  family: family('The more manageable Krafla choice for the whole group.', 'No', 'Helpful', ['Exposed wind', 'Crater slopes', 'Geothermal terrain'], 'Stay on marked routes and turn back in poor wind.'),
  amenities: ['Parking', 'No full service layer assumed'],
  pros: ['High volcanic payoff for less time.', 'Clear alternative to a longer hike.'], drawbacks: ['Exposed weather.', 'Less immersive than Leirhnjúkur.'],
  sources: [source('Official North Iceland · Krafla', 'https://www.northiceland.is/en/place/krafla')],
});

const kraflaLeirhnjukur = activePlace({
  id: 'krafla-leirhnjukur', title: 'Krafla option · Leirhnjúkur', shortTitle: 'Krafla · Leirhnjúkur', location: 'Krafla volcanic area', status: 'open',
  documentStatus: 'One of two mutually exclusive Krafla options in the latest source.',
  hook: 'Take the more substantial route through steaming terrain and young lava when the group still has real hiking energy.',
  planningContext: 'Official estimates vary with route length; plan one to three hours. Choose this instead of Víti when immersion earns the extra time.',
  tags: ['branch', 'hike', 'volcanic'], logistics: ['Choose one Krafla option', '1–3h depending on turnaround', 'Geothermal path discipline'],
  dayIds: [dayId('2026-08-16')], map: map(65.713162, -16.774608, [-130, -14]),
  visit: { duration: '1–3h', walk: 'Variable marked volcanic trail', difficulty: 'Moderate, exposed and uneven' },
  family: family('A higher-energy choice whose turnaround must follow the youngest pace.', 'No', 'Helpful', ['Hot ground/steam', 'Uneven lava', 'Wind and exposure'], 'Stay on marked paths; do not chase the longest loop by default.'),
  amenities: ['Parking', 'No full service layer assumed'],
  pros: ['Most immersive Krafla option.', 'Steam and recent lava feel genuinely distinct.'], drawbacks: ['Consumes much more of the day.', 'Uneven geothermal terrain raises supervision needs.'],
  sources: [source('Official North Iceland · Krafla', 'https://www.northiceland.is/en/place/krafla')],
});

const hofdiKalfastrond = activePlace({
  id: 'hofdi-kalfastrond', title: 'Quiet lake option · Höfði/Kálfaströnd', shortTitle: 'Höfði/Kálfaströnd', location: 'South Lake Mývatn', status: 'open',
  documentStatus: 'One of two optional quiet-lake choices in the latest source.',
  hook: 'Trade another volcanic headline for trees, water and offshore lava pillars.',
  planningContext: 'Choose this, Skútustaðagígar or neither after the Krafla decision; it is not part of the core local loop.',
  tags: ['branch', 'quiet', 'family'], logistics: ['Optional quiet-lake branch', 'Choose one or none', 'Flexible short walk'],
  dayIds: [dayId('2026-08-16')], map: map(65.587745, -16.947768, [14, 18]),
  visit: { duration: '30–60m', walk: 'Flexible lakeside paths', difficulty: 'Easy to moderate' },
  family: family('A gentler scenery reset if everyone still wants another stop.', 'Path-dependent', 'Optional', ['Lake edge', 'Midges', 'Uneven paths'], 'Keep it genuinely optional.'),
  amenities: ['Parking', 'No full service layer assumed'],
  pros: ['Quiet contrast.', 'Flexible duration.'], drawbacks: ['Lower headline payoff.', 'May be the sensible stop to skip.'],
  sources: [source('Official North Iceland · Lake Mývatn', 'https://www.northiceland.is/en/destinations/nature/lakes-and-rivers/lake-myvatn')],
});

const skutustadagigar = activePlace({
  id: 'skutustadagigar', title: 'Quiet lake option · Skútustaðagígar', shortTitle: 'Skútustaðagígar', location: 'South Lake Mývatn', status: 'open',
  documentStatus: 'One of two optional quiet-lake choices in the latest source.',
  hook: 'Finish with easy pseudocrater walking and broad lake views if the day still has margin.',
  planningContext: 'Choose the roughly 20–30 minute short loop, the approximately one-hour longer route, or skip it. It competes with Höfði/Kálfaströnd.',
  tags: ['branch', 'family', 'easy-walk'], logistics: ['Optional quiet-lake branch', '20–30m short loop', 'About 1h longer route'],
  dayIds: [dayId('2026-08-16')], map: map(65.570851, -17.034903, [-126, -14]),
  visit: { duration: '20–60m', walk: 'Short or longer pseudocrater loop', difficulty: 'Easy' },
  family: family('The easiest late-day walking choice if the group wants one more stop.', 'Main loop dependent', 'Usually unnecessary', ['Lake edge', 'Midges', 'Wind'], 'Choose the short loop by default.'),
  amenities: ['Parking', 'Nearby seasonal services; verify live hours'],
  pros: ['Easy scalable walk.', 'Good broad lake views.'], drawbacks: ['Adds another stop to a full local day.', 'Midges and wind can reduce the payoff.'],
  sources: [source('Official North Iceland · Skútustaðagígar', 'https://www.northiceland.is/en/place/skutustadagigar')],
});

const gufufoss = activePlace({
  id: 'gufufoss', title: 'Gufufoss on the Seyðisfjörður descent', shortTitle: 'Gufufoss', location: 'Fjarðarheiði · above Seyðisfjörður', status: 'working',
  documentStatus: 'The latest source explicitly adds Gufufoss while descending to Seyðisfjörður.',
  hook: 'A short waterfall pause on the mountain-pass descent before reaching the fjord town.',
  planningContext: 'It belongs on either the direct August 17 route or the conditional August 18 backtrack from Borgarfjörður Eystri.',
  tags: ['waterfall', 'short-stop', 'current-route'], logistics: ['On the Seyðisfjörður descent', 'Short stop', 'Weather/pass gate'],
  dayIds: [dayId('2026-08-17'), dayId('2026-08-18')], map: map(65.239973, -14.05688, [14, -14]),
  visit: { duration: '20–30m', walk: 'Short viewpoint approach', difficulty: 'Easy to moderate' },
  family: family('A compact whole-family stop if wind, visibility and parking are comfortable.', 'No', 'Optional', ['Wet rock', 'Waterfall edge', 'Mountain-pass weather'], 'Skip it if the pass needs everyone’s attention.'),
  amenities: ['Roadside parking', 'Use Seyðisfjörður for services'],
  pros: ['Directly on the descent.', 'Large payoff for little time.'], drawbacks: ['Weather and parking can make a short stop unwise.', 'Not worth delaying a late camp arrival.'],
  sources: [source('Official East Iceland destination guide', 'https://www.east.is/en/place/gufufoss')],
});

const generatedOptionIds = new Set([
  'outbound-flight',
  'raudasandur',
  'eclipse-arngerdareyri',
  'seydisfjordur',
  'husavik-whale-watching',
  'hverfjall',
  'asbyrgi',
  'djupivogur',
  'dalfjall-hike',
  'herjolfsdalur-camping',
  'gullfoss',
  'thingvellir',
  'hamrar-campsite',
  'kolugljufur',
  'husavik-town-stop',
  'asbyrgi-campsite',
  'hljodaklettar',
  'myvatn-camp',
  'dimmuborgir',
  'grjotagja',
  'krafla-viti',
  'krafla-leirhnjukur',
  'hofdi-kalfastrond',
  'skutustadagigar',
  'gufufoss',
]);

function datesFromOptions(options) {
  const calendarDays = options
    .flatMap((option) => option.dayIds || [])
    .map((id) => /^day-2026-08-(\d{2})$/.exec(id))
    .filter(Boolean)
    .map((match) => Number(match[1]));
  if (!calendarDays.length) throw new Error('Every itinerary leg must contain at least one August 2026 day ID.');
  const first = Math.min(...calendarDays);
  const last = Math.max(...calendarDays);
  return first === last ? `Aug ${first}` : `Aug ${first}–${last}`;
}

const legs = original.legs.map((leg, index) => {
  const options = [
    ...(index === 0 ? [outboundFlight] : []),
    ...leg.options
      .filter((option) => !generatedOptionIds.has(option.id))
      .flatMap((option) => {
        const enriched = enrichOption(option);
        if (option.id === 'latrabjarg-raudasandur') return [enriched, raudasandur];
        if (option.id === 'eclipse-patreksfjordur') return [enriched, eclipseArngerdareyri];
        if (option.id === 'godafoss') {
          return [kolugljufur, hamrarCampsite, enriched, husavikWhaleWatching, husavikTownStop];
        }
        if (option.id === 'hverir-hverfjall') return [enriched, hverfjall];
        if (option.id === 'dettifoss-selfoss') {
          return [asbyrgi, asbyrgiCampsite, hljodaklettar, enriched, myvatnCamp,
            dimmuborgir, grjotagja, kraflaViti, kraflaLeirhnjukur,
            hofdiKalfastrond, skutustadagigar];
        }
        if (option.id === 'studlagil') return [enriched, gufufoss, seydisfjordur];
        if (option.id === 'djupivogur-stokksnes') return [djupivogur, enriched];
        if (option.id === 'heimaey-puffin-volcano') return [enriched, dalfjallHike, herjolfsdalurCamping];
        if (option.id === 'golden-circle-core') return [gullfoss, enriched, thingvellir];
        return [enriched];
      }),
  ].map(finalizeOption);

  return {
    ...leg,
    dates: datesFromOptions(options),
    ...(leg.id === 'westfjords' ? {
      summary: 'Historical August 8–12 source record. Optional stops are not marked completed; removed earlier-plan ideas remain in the read-only archive.',
    } : {}),
    ...(leg.id === 'north' ? {
      title: 'Current position, Diamond Circle & Mývatn',
      summary: 'Hamrar is the latest confirmed position. The next live gates are two Ásbyrgi electrical pitches, a Mývatn base and the pace of each Diamond Circle day.',
    } : {}),
    ...(leg.id === 'east' ? {
      title: 'East Iceland & the puffin-gated fork',
      summary: 'Use live puffin evidence at Egilsstaðir to choose the Borgarfjörður Eystri branch or the direct route to Seyðisfjörður; never draw both as one through-road.',
    } : {}),
    options,
  };
});

const days = [
  ['2026-08-08', 'Saturday', 1, 'Overnight flight', 'locked', 'The trip begins with the booked overnight flight. Sleep and a clean handoff matter more than adding activity.', 'In flight', 'high', 'No Iceland road travel.', ['outbound-flight'], null],
  ['2026-08-09', 'Sunday', 2, 'Arrival to Bjarkalundur', 'historical', 'Historical source record: camper pickup, Borgarnes provisioning and the booked Bjarkalundur base. Optional waterfalls are preserved without claiming that they happened.', 'Bjarkalundur · source-booked', 'local-snapshot-historical', 'Direct core only; pickup, groceries and optional visits excluded.', ['arrival-bjarkalundur', 'borgarfjordur-waterfalls'], 'The optional waterfall pair was never part of the locked direct road baseline.'],
  ['2026-08-10', 'Monday', 3, 'Flókalundur and Hellulaug', 'historical', 'Historical source record. Hellulaug and the Flókalundur corridor remain visible; no optional visit is marked complete.', 'Bjarkalundur / Flókalundur · historical source', 'local-snapshot-historical', 'Current traveller state does not establish which optional stop occurred.', ['hellulaug-coast'], null],
  ['2026-08-11', 'Tuesday', 4, 'Dynjandi day', 'historical', 'Historical source record. Dynjandi remains a source-authored idea; completion is not inferred.', 'Westfjords · historical source', 'local-snapshot-historical', 'Optional-stop completion is intentionally unknown.', ['dynjandi'], null],
  ['2026-08-12', 'Wednesday', 5, 'Eclipse at Flókalundur', 'historical', 'The latest source places the eclipse day at Flókalundur. Earlier Patreksfjörður and Arngerðareyri choices are archived, not treated as rejected.', 'Flókalundur · source record', 'local-snapshot-stationary-historical', 'No road movement asserted in the current route ledger.', ['hellulaug-coast'], 'Earlier site alternatives were removed from the latest dated plan.'],
  ['2026-08-13', 'Thursday', 6, 'Flókalundur to Camping Hamrar', 'locked', 'Latest confirmed travel state: the campers reached Camping Hamrar after the northbound transfer. Kolugljúfur remains the source-listed halfway stop; a visit is not marked complete.', 'Camping Hamrar · checked in', 'local-snapshot-traveller-confirmed', 'Route is Flókalundur → Kolugljúfur → Hamrar. Attractions and comfort stops are excluded from drive time.', ['kolugljufur', 'hamrar-campsite'], null],
  ['2026-08-14', 'Friday', 7, 'Goðafoss to Ásbyrgi', 'working', 'Leave Hamrar around 08:00, stop at Goðafoss, optionally use Húsavík for harbourfront/coffee, then visit and potentially camp at Ásbyrgi.', 'Ásbyrgi · two electrical pitches open', 'local-snapshot', 'The core excludes the optional Húsavík town branch and all visit time.', ['godafoss', 'husavik-town-stop', 'asbyrgi', 'asbyrgi-campsite'], 'Geographic order is Hamrar → Goðafoss → optional Húsavík → Ásbyrgi. The earlier whale-tour/Hauganes ideas are no longer active.'],
  ['2026-08-15', 'Saturday', 8, 'Sound Rocks, waterfalls and Mývatn', 'working', 'From Ásbyrgi, use the short Hljóðaklettar route, Dettifoss/Selfoss west bank and Hverir before settling at a chosen Lake Mývatn camp. Earth or Forest Lagoon is optional evening recovery.', 'Lake Mývatn campsite · choose and confirm', 'local-snapshot', 'Stops, hikes, meals and lagoon time are excluded.', ['hljodaklettar', 'dettifoss-selfoss', 'hverir-hverfjall', 'myvatn-camp', 'earth-lagoon'], 'This sequence is geographically coherent only from an Ásbyrgi sleep. Name the Mývatn campsite before adding the evening soak.'],
  ['2026-08-16', 'Sunday', 9, 'Lake Mývatn local day', 'working', 'Stay at the same camp if possible. Use Hverfjall, Dimmuborgir and Grjótagjá as the core, choose one Krafla experience, then choose one quiet-lake stop or none.', 'Same Lake Mývatn campsite · preferred', 'local-snapshot', 'Krafla and quiet-lake options are separate branches; walks and stops are excluded.', ['myvatn-camp', 'hverfjall', 'dimmuborgir', 'grjotagja', 'krafla-viti', 'krafla-leirhnjukur', 'hofdi-kalfastrond', 'skutustadagigar'], 'Do not stack both Krafla options or both quiet-lake choices. Their source order is a decision list, not one required route.'],
  ['2026-08-17', 'Monday', 10, 'Mývatn to East Iceland', 'working', 'Drive to Stuðlagil, use the serviced west viewpoint by default, then ask in Egilsstaðir whether puffins are still present. Continue direct to Seyðisfjörður unless live evidence earns the Borgarfjörður Eystri branch.', 'Seyðisfjörður direct · Borgarfjörður branch if live puffins', 'local-snapshot', 'Direct core ends in Seyðisfjörður; the Borgarfjörður branch is excluded.', ['studlagil', 'borgarfjordur-eystri', 'gufufoss', 'seydisfjordur'], 'Borgarfjörður Eystri and Seyðisfjörður are separate spokes from Egilsstaðir. Visiting Borgarfjörður necessarily creates the August 18 backtrack.'],
  ['2026-08-18', 'Tuesday', 11, 'Conditional Eastfjords branch day', 'conditional', 'Skip this separate transfer day when the direct August 17 route is used. If the puffin branch was chosen, return through Egilsstaðir, stop at Gufufoss if conditions allow and descend to Seyðisfjörður.', 'Seyðisfjörður', 'local-snapshot-branch-dependent', 'Zero road distance on the direct plan; the Borgarfjörður → Seyðisfjörður branch remains separate.', ['borgarfjordur-eystri', 'gufufoss', 'seydisfjordur'], 'This day exists only because the two fjords sit on different spokes. It is not additive to the direct August 17 plan.'],
  ['2026-08-19', 'Wednesday', 12, 'Seyðisfjörður to Stokksnes', 'working', 'Follow Route 1 through the Eastfjords, use Djúpivogur as the service/scenic break and end around Stokksnes or Höfn.', 'Stokksnes / Höfn area · open', 'local-snapshot', 'Route is forced through the coastal road; visits excluded.', ['djupivogur', 'djupivogur-stokksnes'], 'The source compresses Eastfjords, ice country, South Coast and Heimaey into one date. The working route gives this day only to Seyðisfjörður → Djúpivogur → Stokksnes/Höfn and avoids Öxi/939.'],
  ['2026-08-20', 'Thursday', 13, 'Ice country to Vík', 'working', 'Use Jökulsárlón/Skaftafell as the ice-country anchor, continue to Fjaðrárgljúfur and Eldhraun, then finish in Vík. Reynisfjara and Dyrhólaey remain conditional branches.', 'Vík area · open', 'local-snapshot', 'Activities and South Coast branches excluded.', ['jokulsarlon-boat', 'glacier-hike', 'fjadrargljufur-eldhraun', 'reynisfjara', 'dyrholaey'], 'Westbound order is Jökulsárlón → Skaftafell → Fjaðrárgljúfur → Eldhraun → Vík. The source overload cannot fit in one day.'],
  ['2026-08-21', 'Friday', 14, 'Skógafoss and Golden Circle', 'working', 'Use Skógafoss as the one South Coast core stop, then continue Gullfoss → Geysir → Þingvellir. The longer South Coast/Heimaey path is a replacement branch, not an add-on.', 'Þingvellir · working sleep', 'local-snapshot', 'Core visits excluded; South Coast and ferry branches remain separate.', ['reynisfjara', 'dyrholaey', 'skogafoss-waterfall-way', 'seljalandsfoss-gljufrabui', 'heimaey-puffin-volcano', 'dalfjall-hike', 'herjolfsdalur-camping', 'beluga-sanctuary', 'gullfoss', 'golden-circle-core', 'thingvellir', 'silfra-split'], 'The feasible core is Vík → Skógafoss → Gullfoss → Geysir → Þingvellir. Reynisfjara/Dyrhólaey/Seljalandsfoss and Heimaey compete with that core and with the August 22 buffer.'],
  ['2026-08-22', 'Saturday', 15, 'Protected buffer at Þingvellir', 'working', 'Keep this source-blank day for weather, fatigue, laundry or recovery. Do not spend it in advance unless the group explicitly chooses a replacement branch.', 'Þingvellir · flexible', 'local-snapshot-deliberate-buffer', 'No committed road route.', ['weather-buffer', 'reykjavik-pools'], 'An island overnight or delayed South Coast branch consumes this buffer; it is not free extra capacity.'],
  ['2026-08-23', 'Sunday', 16, 'Reykjadalur to Reykjavík', 'working', 'Move from Þingvellir to the Reykjadalur trail decision, then finish in Reykjavík. Perlan is the whole-family branch; Sky Lagoon requires an adult split.', 'Reykjavík · final night', 'local-snapshot', 'Hike, city branches and bathing excluded.', ['reykjadalur', 'perlan', 'sky-lagoon', 'reykjavik-pools'], 'The source places Sky Lagoon and Perlan on the fixed return day. They move to August 23 because August 24 has no safe sightseeing margin.'],
  ['2026-08-24', 'Monday', 17, 'Camper return and flight home', 'locked', 'No sightseeing. Finish fuel, waste, cleaning and packing the prior evening; return both campers by 13:00 and protect airport margin.', 'Homebound', 'local-snapshot-fixed-deadline', 'Return processing and airport transfer excluded.', ['departure'], 'The source contains both 17:05 and 17:10 departure times. Check the live airline itinerary; do not normalize the discrepancy silently.'],
].map(([date, weekday, dayNumber, title, state, summary, overnight, confidence, note, stopIds, orderCheck]) => {
  const localRoute = localCoreRouteForDate(date);
  return {
    id: dayId(date), date, weekday, dayNumber, title, state, summary, overnight,
    route: {
      distanceKm: localRoute.distanceKm,
      baseMinutes: localRoute.baseMinutes,
      camperMinutes: localRoute.camperMinutes,
      confidence,
      note,
    },
    stopIds,
    orderCheck,
    progress: localRoute.progress,
  };
});

const decisions = [
  { id: 'decision-asbyrgi-electric', priority: '1 · decide now', title: 'Book two Ásbyrgi electrical pitches—or choose another sleep', why: 'The August 15 route begins cleanly only from Ásbyrgi, and electricity is the capacity-sensitive part. No booking is recorded.', deadline: 'Before leaving Hamrar · Aug 14', status: 'open', dayIds: [dayId('2026-08-14')], optionIds: ['asbyrgi-campsite'] },
  { id: 'decision-myvatn-base', priority: '2 · next sleep', title: 'Choose the Lake Mývatn base', why: 'The source names several camps but selects none. A two-night base prevents August 16 from becoming another pack-and-move day.', deadline: 'Before Aug 15 departure', status: 'open', dayIds: [dayId('2026-08-15'), dayId('2026-08-16')], optionIds: ['myvatn-camp'] },
  { id: 'decision-husavik-town', priority: '3 · Aug 14 route pace', title: 'Húsavík town stop or direct to Ásbyrgi', why: 'A harbourfront/coffee stop is plausible; a whale tour is not in the latest plan. Protect the Ásbyrgi visit and campsite arrival.', deadline: 'At Goðafoss · Aug 14', status: 'open', dayIds: [dayId('2026-08-14')], optionIds: ['husavik-town-stop'] },
  { id: 'decision-myvatn-shape', priority: '4 · avoid stacking', title: 'Choose one Krafla and one-or-zero quiet-lake stop', why: 'Víti and Leirhnjúkur are alternatives. Höfði/Kálfaströnd and Skútustaðagígar are also alternatives. Ranking them separately prevents an impossible checklist.', deadline: 'Evening Aug 15 or morning Aug 16', status: 'open', dayIds: [dayId('2026-08-16')], optionIds: ['krafla-viti', 'krafla-leirhnjukur', 'hofdi-kalfastrond', 'skutustadagigar'] },
  { id: 'decision-puffin-fork', priority: '5 · live evidence only', title: 'Borgarfjörður Eystri or direct Seyðisfjörður', why: 'Check the official/live feed or ask locally in Egilsstaðir. The puffin branch creates a real August 18 backtrack; it is not a free add-on.', deadline: 'Egilsstaðir · Aug 17', status: 'open', dayIds: [dayId('2026-08-17'), dayId('2026-08-18')], optionIds: ['borgarfjordur-eystri', 'seydisfjordur', 'gufufoss'] },
  { id: 'decision-ice-country', priority: '6 · bookable choice', title: 'Choose the ice-country anchor', why: 'Use a whole-family lagoon boat, accept a guided adult/eligibility split, or keep the safe Skaftafell view. August 20 cannot support every version.', deadline: 'As soon as the east branch is settled', status: 'open', dayIds: [dayId('2026-08-20')], optionIds: ['jokulsarlon-boat', 'glacier-hike'] },
  { id: 'decision-south-versus-heimaey', priority: '7 · replacement decision', title: 'Keep the feasible core or replace it with South Coast/Heimaey', why: 'Reynisfjara, Dyrhólaey, Seljalandsfoss and Heimaey are preserved, but they compete with the Golden Circle and may consume the August 22 buffer.', deadline: 'Before any ferry or island booking', status: 'open', dayIds: [dayId('2026-08-20'), dayId('2026-08-21'), dayId('2026-08-22')], optionIds: ['reynisfjara', 'dyrholaey', 'seljalandsfoss-gljufrabui', 'heimaey-puffin-volcano', 'dalfjall-hike', 'herjolfsdalur-camping', 'beluga-sanctuary'] },
  { id: 'decision-departure-truth', priority: '8 · confirm', title: 'Resolve flight + camper-return truth', why: 'Check 17:05 versus 17:10 against the live airline itinerary and confirm the contract-specific return address, fuel, waste and cleaning rules.', deadline: 'By Aug 23', status: 'open', dayIds: [dayId('2026-08-24')], optionIds: ['departure'] },
];

const operations = [
  { id: 'ops-current', icon: '01', title: 'Latest confirmed position', body: 'Camping Hamrar on August 13 is the last traveller-confirmed state. The interface should call it “last confirmed” after the date rolls, not silently move the campers.', items: ['Hamrar is confirmed checked in.', 'Kolugljúfur remains a route waypoint; an optional visit is not marked complete.', 'Do not advance the current position without a traveller update.', 'Hamrar is not a Camping Card site.'], links: [{ label: 'Camping Hamrar', url: 'https://www.hamrar.is/home' }] },
  { id: 'ops-camping', icon: '02', title: 'Sleep before sightseeing', body: 'Name the next campsite before adding attractions. The Camping Card layer is a coverage reference, not proof of room or electricity.', items: ['Two campers require two suitable sites.', 'Confirm electricity separately.', 'Check waste, water, shower and arrival policy.', 'Keep August 22 protected.'], links: [{ label: 'Official campground directory', url: 'https://tjalda.is/en/' }] },
  { id: 'ops-day-pacing', icon: '03', title: 'One core, then branches', body: 'Each dated route distinguishes a feasible core from replacement branches.', items: ['Húsavík is a short town branch, not a whale tour.', 'Choose one Krafla experience.', 'Choose one quiet-lake stop or none.', 'Borgarfjörður and Heimaey consume time elsewhere.'] },
  { id: 'ops-ferry', icon: '04', title: 'Herjólfur day', body: 'The current scheduled Landeyjahöfn crossing is 35 minutes. A cancellation does not automatically move the booking to the next sailing.', items: ['Reserve foot passengers and island transport.', 'Arrive at least 30 minutes early.', 'Check port and sailing the prior evening and morning.', 'Only ferry campers after measuring exact length and height.'], links: [{ label: 'Official schedule', url: 'https://herjolfur.is/en/schedule/' }, { label: 'Official crossing FAQ', url: 'https://herjolfur.is/en/frequently-asked-questions/' }] },
  { id: 'ops-live', icon: '05', title: 'Live-condition gate', body: 'The map is a dated planning snapshot, not permission to drive or enter.', items: ['Road/wind check before every exposed departure.', 'SafeTravel check for Reynisfjara and closures.', 'Weather check the night before and morning of.', 'Call Road Administration traffic service 1777 when uncertain.'], links: [{ label: 'Umferðin road conditions', url: 'https://umferdin.is/en' }, { label: 'SafeTravel', url: 'https://safetravel.is/' }, { label: 'Weather', url: 'https://en.vedur.is/' }] },
  { id: 'ops-shared-kit', icon: '06', title: 'Shared road kit', body: 'Keep the useful shared list without exposing personal packing.', items: ['Eclipse glasses', 'Waterproof layers, warm hats/gloves', 'Swimsuits and wet bags', 'Eye masks and clothes pegs', 'Walkie-talkies, chargers and headlamps', 'Arrival snacks, water and electrolytes'] },
  { id: 'ops-fuel', icon: '07', title: 'Fuel + services rhythm', body: 'Refuel before remote roads and treat a half tank as the Eastfjords floor.', items: ['Use Akureyri before the Diamond Circle.', 'Use Reykjahlíð before the East Iceland transfer.', 'Use Egilsstaðir and Djúpivogur/Höfn as deliberate service anchors.', 'Do not rely on food, toilets or cell service at remote viewpoints.'] },
  { id: 'ops-departure', icon: '08', title: 'Finish the night before', body: 'Pack, empty waste and complete fuel/cleaning work on Aug 23.', items: ['Leave Reykjavík around 10:30–11:00.', 'Return both campers by 13:00.', 'Target terminal entry around 14:00.', 'No sightseeing on Aug 24.', 'Check 17:05 versus 17:10 in the live itinerary.'], links: [{ label: 'KEF traveller guide', url: 'https://www.kefairport.com/news/first-time-in-iceland' }] },
];

const archivedSourceDecisions = [
  {
    id: 'snaefellsnes-ruled-out',
    title: 'Snæfellsnes peninsula',
    status: 'ruled-out',
    documentStatus: 'Direct strike-through in the latest source preserves Snæfellsnes as ruled out.',
    items: [
      'Búðir · white beach',
      'Arnarstapi · coastal-cliff hike and birdlife',
      'Djúpalónssandur · basalt-pebble beach',
      'Lýsuhólslaug · thermal pools',
      'Snæfellsjökull glacier',
      'Ólafsvík-area camping research',
      'Source records that an advance-booking inquiry was sent by email',
    ],
    sources: [
      source('Official Snæfellsjökull National Park', 'https://www.ust.is/english/visiting-iceland/snaefellsjokull-national-park/'),
      source('Source-authored Ólafsvík camping page', 'https://www.snb.is/is/mannlif/ferdathjonusta/tjaldsvaedi#camping-in-olafsvik'),
    ],
  },
  ...[...removedFromLatestPlan.entries()].map(([optionId, removalNote]) => {
    const preserved = legs.flatMap((leg) => leg.options).find((option) => option.id === optionId);
    if (!preserved) throw new Error(`Removed source option ${optionId} is missing from the stable catalog.`);
    return {
      id: `${optionId}-removed-from-latest-plan`,
      optionId,
      title: preserved.title,
      status: 'removed-from-latest-plan',
      documentStatus: removalNote,
      items: [
        'Stable option ID and any existing group state are preserved.',
        'No current date, map marker, ranking control or sticky-note input is exposed.',
        'Removal from the latest source is not represented as group rejection, cancellation or completion.',
      ],
      sources: preserved.sources,
    };
  }),
];

const itinerary = {
  schemaVersion: 2,
  trip: {
    ...original.trip,
    title: 'Iceland, Summer 2026 · Route Room',
    dateLabel: 'August 8–24, 2026',
    direction: 'clockwise circuit',
    summary: 'A current-state, geographically reconciled camper circuit that preserves the planning document while making every remaining sleep and route branch explicit.',
    baseline: [
      'Flights are recorded as booked',
      'Two motorhomes are recorded as booked',
      'Clockwise Ring Road direction',
      'Camping Hamrar check-in is traveller-confirmed for August 13',
      'Two Camping Card passes were ordered; individual site coverage and capacity remain separate checks',
      'Camper return by 13:00 on August 24 is fixed',
    ],
    currentState: {
      asOf: '2026-08-13',
      dayId: 'day-2026-08-13',
      currentPlaceId: 'hamrar-campsite',
      status: 'checked-in',
      label: 'Checked in at Camping Hamrar',
      provenance: 'Traveller update',
      currentPlaceIsCampingCardSite: false,
    },
  },
  days,
  legs,
  decisions,
  operations,
  archivedSourceDecisions,
  methodology: {
    sourceDocument: 'Iceland Summer 2026 (1).docx',
    sourceDocumentSha256: SOURCE_DOCUMENT_SHA256,
    sourceDocumentModified: '2026-08-13T20:12:12Z',
    lastResearchRefresh: '2026-08-14',
    currentStateProvenance: 'Traveller update received August 13: checked in at Camping Hamrar. This outranks any conflicting proposed route in the planning document.',
    statusModel: 'Locked means explicitly booked/fixed or traveller-confirmed; working is the current geographic proposal; open needs group assent or a live gate; conditional is a mutually exclusive or capacity-dependent branch; historical preserves earlier source work without implying completion.',
    routeLedger: 'Committed iceland26/map-data.json, routed by local OSRM over the Geofabrik Iceland OpenStreetMap extract; no public routing request is required to generate this itinerary.',
    routeSnapshotGeneratedAt: localMap.generatedAt,
    routeDataSnapshotDate: localGeofabrikAttribution.snapshotDate,
    driveMethod: 'Static local-OSRM car baselines are shown separately from motorhome planning time. Camper time is the baseline plus 35%, rounded up to five minutes. Neither figure includes attractions, groceries, fuel, toilets, roadworks, weather, ferry disruption or eclipse traffic unless stated.',
    mapMethod: 'Self-contained Natural Earth coastline and committed local OSRM/Geofabrik route geometry; no runtime map tiles, tracking, geolocation or live-traffic feed.',
    freshness: 'Camping Hamrar on August 13 is the latest confirmed position. Roads, weather, ferry, beach access, wildlife, operator availability, campground capacity, Camping Card coverage and flight/rental contract truth must be rechecked live.',
    privacy: 'Reservation identifiers, prices, payment splits, private links, exact child details, identity documents and personal packing remain outside client assets.',
    links: [
      { label: 'OpenStreetMap copyright', url: 'https://www.openstreetmap.org/copyright' },
      { label: 'OSRM project', url: 'https://project-osrm.org/' },
      { label: 'Geofabrik Iceland extract', url: 'https://download.geofabrik.de/europe/iceland.html' },
      { label: 'Natural Earth terms', url: 'https://www.naturalearthdata.com/about/terms-of-use/' },
    ],
  },
};

const ids = itinerary.legs.flatMap((leg) => leg.options.map((option) => option.id));
if (new Set(ids).size !== ids.length) throw new Error('Duplicate option ID in generated itinerary.');
if (itinerary.days.length !== 17) throw new Error('Generated itinerary must contain 17 days.');
for (const day of itinerary.days) {
  for (const stopId of day.stopIds) {
    if (!ids.includes(stopId)) throw new Error(`${day.id} references unknown stop ${stopId}.`);
  }
}
for (const day of itinerary.days) {
  const localRoute = localCoreRouteForDate(day.date);
  if (day.route.distanceKm !== localRoute.distanceKm
      || day.route.baseMinutes !== localRoute.baseMinutes
      || day.route.camperMinutes !== localRoute.camperMinutes
      || day.progress !== localRoute.progress) {
    throw new Error(`${day.id} drifted from the committed local route ledger.`);
  }
}
if (Object.keys(details).some((id) => !ids.includes(id))) {
  throw new Error('An option override no longer maps to the preserved catalog.');
}

const originalStableIds = [
  'outbound-flight', 'arrival-bjarkalundur', 'borgarfjordur-waterfalls',
  'hellulaug-coast', 'dynjandi', 'latrabjarg-raudasandur', 'raudasandur',
  'eclipse-patreksfjordur', 'eclipse-arngerdareyri', 'hvitserkur-skagafjordur',
  'hauganes-whales', 'godafoss', 'husavik-whale-watching', 'hverir-hverfjall',
  'hverfjall', 'earth-lagoon', 'asbyrgi', 'dettifoss-selfoss', 'studlagil',
  'seydisfjordur', 'borgarfjordur-eystri', 'djupivogur', 'djupivogur-stokksnes',
  'jokulsarlon-boat', 'glacier-hike', 'fjadrargljufur-eldhraun', 'reynisfjara',
  'dyrholaey', 'skogafoss-waterfall-way', 'seljalandsfoss-gljufrabui',
  'heimaey-puffin-volcano', 'dalfjall-hike', 'herjolfsdalur-camping',
  'beluga-sanctuary', 'gullfoss', 'golden-circle-core', 'thingvellir',
  'silfra-split', 'reykjadalur', 'weather-buffer', 'perlan', 'sky-lagoon',
  'reykjavik-pools', 'departure',
];
const addedCurrentIds = [
  'hamrar-campsite', 'kolugljufur', 'husavik-town-stop', 'asbyrgi-campsite',
  'hljodaklettar', 'myvatn-camp', 'dimmuborgir', 'grjotagja', 'krafla-viti',
  'krafla-leirhnjukur', 'hofdi-kalfastrond', 'skutustadagigar', 'gufufoss',
];
for (const id of [...originalStableIds, ...addedCurrentIds]) {
  if (!ids.includes(id)) throw new Error(`Generated itinerary is missing stable option ${id}.`);
}
if (originalStableIds.length !== 44 || addedCurrentIds.length !== 13 || ids.length !== 57) {
  throw new Error('Itinerary must preserve 44 prior state keys and add exactly 13 current-plan options.');
}

for (const leg of itinerary.legs) {
  const dates = datesFromOptions(leg.options);
  if (leg.dates !== dates) throw new Error(`${leg.id} must cover its contained option day IDs (${dates}).`);
}

for (const [day, requiredIds] of [
  ['2026-08-13', ['kolugljufur', 'hamrar-campsite']],
  ['2026-08-14', ['godafoss', 'husavik-town-stop', 'asbyrgi', 'asbyrgi-campsite']],
  ['2026-08-15', ['hljodaklettar', 'dettifoss-selfoss', 'hverir-hverfjall', 'myvatn-camp']],
  ['2026-08-16', ['myvatn-camp', 'hverfjall', 'dimmuborgir', 'grjotagja', 'krafla-viti', 'krafla-leirhnjukur', 'hofdi-kalfastrond', 'skutustadagigar']],
  ['2026-08-17', ['studlagil', 'borgarfjordur-eystri', 'gufufoss', 'seydisfjordur']],
  ['2026-08-19', ['djupivogur', 'djupivogur-stokksnes']],
  ['2026-08-20', ['jokulsarlon-boat', 'glacier-hike', 'fjadrargljufur-eldhraun']],
  ['2026-08-21', ['skogafoss-waterfall-way', 'heimaey-puffin-volcano', 'gullfoss', 'golden-circle-core', 'thingvellir']],
  ['2026-08-23', ['reykjadalur', 'perlan', 'sky-lagoon']],
  ['2026-08-24', ['departure']],
]) {
  const stopIds = itinerary.days.find((candidate) => candidate.id === dayId(day))?.stopIds || [];
  for (const id of requiredIds) {
    if (!stopIds.includes(id)) throw new Error(`${day} must expose independent option ${id}.`);
  }
}

const currentState = itinerary.trip.currentState;
if (JSON.stringify(currentState) !== JSON.stringify({
  asOf: '2026-08-13',
  dayId: 'day-2026-08-13',
  currentPlaceId: 'hamrar-campsite',
  status: 'checked-in',
  label: 'Checked in at Camping Hamrar',
  provenance: 'Traveller update',
  currentPlaceIsCampingCardSite: false,
})) {
  throw new Error('The traveller-confirmed Hamrar current state drifted.');
}

const allOptions = itinerary.legs.flatMap((leg) => leg.options);
for (const [id, removalNote] of removedFromLatestPlan.entries()) {
  const option = allOptions.find((candidate) => candidate.id === id);
  const archived = itinerary.archivedSourceDecisions.find((record) => record.optionId === id);
  if (!option || option.active !== false || option.status !== 'historical'
      || option.dayIds.length !== 0 || option.map !== null
      || itinerary.days.some((day) => day.stopIds.includes(id))
      || !archived || archived.status !== 'removed-from-latest-plan'
      || !archived.documentStatus.includes(removalNote)) {
    throw new Error(`${id} must remain an inactive, read-only earlier-plan record.`);
  }
}

for (const id of addedCurrentIds) {
  const option = allOptions.find((candidate) => candidate.id === id);
  if (!option || option.active !== true || option.status === 'historical'
      || !option.map || !option.dayIds.length || !option.sources.length
      || !itinerary.days.some((day) => day.stopIds.includes(id))) {
    throw new Error(`${id} must be a sourced, mapped and dated current-plan option.`);
  }
}

if (itinerary.methodology.sourceDocumentSha256
    !== 'f961d86b89d5a546f7d5d988f74c729a67c51139ab6ef151a2a2ce19d5702953') {
  throw new Error('Itinerary is not pinned to the latest planning document.');
}

const lagoon = itinerary.legs.flatMap((leg) => leg.options)
  .find((option) => option.id === 'jokulsarlon-boat');
const selectedOperatorFaq = 'https://icelagoon.is/faq/is-it-possible-to-take-children-on-board-of-the-boats/';
if (!lagoon?.sources?.some((entry) => entry.url === selectedOperatorFaq)
    || lagoon.sources.some((entry) => entry.url.includes('icelagoon.com'))) {
  throw new Error('Jökulsárlón must use the selected operator and its exact child-policy FAQ.');
}

const archivedSnaefellsnes = itinerary.archivedSourceDecisions.find(
  (record) => record.id === 'snaefellsnes-ruled-out',
);
if (!archivedSnaefellsnes
    || archivedSnaefellsnes.status !== 'ruled-out'
    || archivedSnaefellsnes.items.length < 7
    || !archivedSnaefellsnes.items.some((item) => /advance-booking inquiry was sent by email/i.test(item))
    || ids.includes(archivedSnaefellsnes.id)
    || itinerary.days.some((day) => day.stopIds.includes(archivedSnaefellsnes.id))
    || 'map' in archivedSnaefellsnes) {
  throw new Error('Snæfellsnes must remain a complete, non-rankable source archive record.');
}

await writeFile(outputPath, `${JSON.stringify(itinerary, null, 2)}\n`, 'utf8');
process.stdout.write(`Wrote ${outputPath} with ${itinerary.days.length} days and ${ids.length} stable options.\n`);
