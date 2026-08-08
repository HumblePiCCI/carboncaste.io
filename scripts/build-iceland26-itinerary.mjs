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
        if (option.id === 'godafoss') return [enriched, husavikWhaleWatching];
        if (option.id === 'hverir-hverfjall') return [enriched, hverfjall];
        if (option.id === 'dettifoss-selfoss') return [asbyrgi, enriched];
        if (option.id === 'studlagil') return [enriched, seydisfjordur];
        if (option.id === 'djupivogur-stokksnes') return [djupivogur, enriched];
        if (option.id === 'heimaey-puffin-volcano') return [enriched, dalfjallHike, herjolfsdalurCamping];
        if (option.id === 'golden-circle-core') return [gullfoss, enriched, thingvellir];
        return [enriched];
      }),
  ];

  return {
    ...leg,
    dates: datesFromOptions(options),
    ...(leg.id === 'westfjords' ? {
      summary: 'The first drive and campsite dates are source-document assertions; the exact checkout morning remains unresolved. The eclipse date is fixed, while the viewing site and Westfjords pace remain open.',
    } : {}),
    ...(leg.id === 'east' ? { title: 'Eastfjords & the family birthday' } : {}),
    options,
  };
});

const days = [
  ['2026-08-08', 'Saturday', 1, 'Overnight flight', 'locked', 'The trip begins with the booked overnight flight. Sleep and a clean handoff matter more than adding activity.', 'In flight', 0, 0, 0, 'high', 'No Iceland road travel.', ['outbound-flight'], null, 0],
  ['2026-08-09', 'Sunday', 2, 'Arrival to the Westfjords', 'locked', 'Pick up the two campers, provision at Nettó in Borgarnes and follow the direct core to the booked base. The waterfall pair is a separate conditional branch, not part of the locked route.', 'Bjarkalundur · booked assertion', 255.5, 226, 300, 'measured', 'Direct KEF → Borgarnes → Bjarkalundur core only; the conservative camper plan excludes pickup, groceries, visits and the waterfall branch.', ['arrival-bjarkalundur', 'borgarfjordur-waterfalls'], 'The source’s optional chain is too long after an overnight flight. Eiríksstaðir is cut. From the Borgarnes provision stop, the Deildartunguhver → Hraunfossar → Bjarkalundur branch is 218.0 km / 3h10 car baseline and is excluded from the core.', 0.1321],
  ['2026-08-10', 'Monday', 3, 'South to Patreksfjörður', 'open', 'Move from Bjarkalundur through Hellulaug/Flókalundur to Patreksfjörður, then choose at most one remote beach/cliff branch.', 'Patreksfjörður · needs decision', 171.8, 148, 225, 'measured', 'Branch mileage is excluded.', ['hellulaug-coast', 'raudasandur', 'latrabjarg-raudasandur'], 'The source simultaneously says Bjarkalundur is booked and hopes for a new campsite. Rauðasandur and Látrabjarg are separate branches; attempting both plus a Bjarkalundur return is not child-realistic.', 0.2005],
  ['2026-08-11', 'Tuesday', 4, 'Dynjandi and the clockwise handoff', 'open', 'Use Dynjandi as a forward-moving Westfjords anchor, then continue toward the northern corridor.', 'Arngerðareyri corridor · open', 210.5, 196, 300, 'measured', 'Road 60 gravel/wind margin included only in camper plan.', ['dynjandi'], 'The document says “Dynjandi or Látrabjarg.” Returning from Dynjandi to Bjarkalundur is a 141 km backtrack; the map shows it as a branch, not the working route.', 0.2843],
  ['2026-08-12', 'Wednesday', 5, 'Totality day', 'open', 'No site chasing. Choose Patreksfjörður or Arngerðareyri, then stage with food, water, warm layers, full fuel and certified glasses.', 'Selected eclipse site · open', 0, 0, 0, 'site-dependent', 'Partial 16:43–18:45; remain after totality.', ['eclipse-patreksfjordur', 'eclipse-arngerdareyri'], 'The stationary working line is Arngerðareyri; Patreksfjörður is the explicit southbound branch. An immediate post-totality return conflicts with official stay-late guidance.', 0.2843],
  ['2026-08-13', 'Thursday', 6, 'Westfjords to Varmahlíð', 'working', 'A real transfer day: Arngerðareyri corridor to Hvítserkur, then stop at the Varmahlíð service base.', 'Varmahlíð · confirm capacity', 334.3, 301, 435, 'measured', 'Attraction and comfort stops excluded.', ['hvitserkur-skagafjordur'], 'The document’s version reaches toward Akureyri, Goðafoss and Mývatn on the same day. This working day stops at Varmahlíð.', 0.4173],
  ['2026-08-14', 'Friday', 7, 'Akureyri to Mývatn', 'working', 'Resupply in Akureyri, continue to Goðafoss, then choose between the Húsavík whale branch and a Mývatn-scale experience. Hauganes is a separate out-and-back alternative.', 'Mývatn area · open', 181.2, 168, 240, 'measured', 'Hauganes and Húsavík branches, tours and attraction time are excluded.', ['hauganes-whales', 'godafoss', 'husavik-whale-watching', 'hverir-hverfjall', 'hverfjall', 'earth-lagoon'], 'The source lists Seyðisfjörður before Námaskarð, Hauganes and Dettifoss. Actual clockwise order is Akureyri/Hauganes → Goðafoss → optional Húsavík → Mývatn/Hverir/Hverfjall → Dettifoss → East Iceland. The measured Húsavík alternative is 101.8 km / 1h32 before its three-hour tour.', 0.4895],
  ['2026-08-15', 'Saturday', 8, 'Volcanic north to East Iceland', 'working', 'A family birthday transfer through the volcanic north. Keep the direct Hverir → Dettifoss → Stuðlagil line, or substitute the Ásbyrgi branch; then pick zero or one Eastfjords spoke.', 'Egilsstaðir area · open', 257, 257, 360, 'measured', 'Direct working line only; stops and the 114.0 km / 1h38 Ásbyrgi alternative are excluded.', ['hverir-hverfjall', 'asbyrgi', 'dettifoss-selfoss', 'studlagil', 'seydisfjordur', 'borgarfjordur-eystri'], 'On the Ásbyrgi alternative, actual order is Reykjahlíð → Ásbyrgi → Dettifoss. Seyðisfjörður and Borgarfjörður Eystri are separate Egilsstaðir out-and-backs, neither is “on the way” south, and the east Stuðlagil hike cannot share this schedule.', 0.5918],
  ['2026-08-16', 'Sunday', 9, 'Eastfjords to Stokksnes', 'working', 'Stay on coastal Route 1, use Djúpivogur as a separate service/reset stop and end at Stokksnes/Höfn.', 'Stokksnes/Höfn area · open', 243.5, 220, 330, 'measured', 'Geometry is forced through Breiðdalsvík to exclude Öxi.', ['djupivogur', 'djupivogur-stokksnes'], 'The source calls Djúpivogur → Stokksnes four hours. That adjacent leg is about 99 km; today’s real 244 km total begins at Egilsstaðir and must remain on Route 1, not gravel Route 939/Öxi.', 0.6887],
  ['2026-08-17', 'Monday', 10, 'Ice country to Vík', 'open', 'Jökulsárlón is the anchor. Choose a whole-family boat or glacier-view trail, then protect the South Coast transfer.', 'Vík area · open', 277.5, 244, 320, 'measured', 'Activities are excluded; this day needs a hard choice.', ['jokulsarlon-boat', 'glacier-hike', 'fjadrargljufur-eldhraun'], 'Westbound geography is Jökulsárlón → Skaftafell → Fjaðrárgljúfur → Eldhraun → Vík. The document places Eldhraun after Reynisfjara.', 0.8045],
  ['2026-08-18', 'Tuesday', 11, 'South Coast to Landeyjahöfn', 'working', 'Use current-safe viewpoints, take only a short Waterfall Way taster and finish near the ferry.', 'Hvolsvöllur/Landey area · open', 103.5, 111, 150, 'measured', 'Visit time excluded.', ['reynisfjara', 'dyrholaey', 'skogafoss-waterfall-way', 'seljalandsfoss-gljufrabui'], 'Gljúfrabúi is a short walk north from the Seljalandsfoss stop—not across the road. The Skógafoss “3 km” note omits the return and 428 steps.', 0.8457],
  ['2026-08-19', 'Wednesday', 12, 'Heimaey day', 'open', 'Default to an early 35-minute foot-passenger ferry with both campers left at Landeyjahöfn, then use local transport. Dalfjall is its own hike; camping in Herjólfsdalur is a conflicting overnight branch that first requires a different transport and sleep plan.', 'Mainland or Herjólfsdalur · decide with ferry', 25.6, 70, 120, 'scheduled', 'Two 35-minute sailings and mainland driving only; the 3.5 km / 8m Herjólfsdalur island loop requires island transport and is excluded.', ['beluga-sanctuary', 'heimaey-puffin-volcano', 'dalfjall-hike', 'herjolfsdalur-camping'], 'The source says 50 minutes and leaves camper logistics unresolved. Current scheduled sailing is 35 minutes. Herjólfsdalur camping cannot coexist with leaving the campers on the mainland unless separate island accommodation and equipment are booked.', 0.8559],
  ['2026-08-20', 'Thursday', 13, 'Golden Circle in road order', 'working', 'Travel from the Landey/Hella corridor through three independently rankable stops and camp at Þingvellir.', 'Þingvellir · open/bookable', 196.7, 181, 250, 'measured', 'Visits excluded.', ['gullfoss', 'golden-circle-core', 'thingvellir', 'silfra-split'], 'The source interleaves the sites. Correct westbound order is Gullfoss → Geysir/Strokkur → Þingvellir; Silfra is a separate eligibility-gated activity at Þingvellir.', 0.9342],
  ['2026-08-21', 'Friday', 14, 'Hot river to Reykjavík', 'open', 'Make a real 7 km Reykjadalur decision, then move into Reykjavík.', 'Reykjavík Eco · open', 109.1, 110, 145, 'measured', 'Hike/bathing excluded.', ['reykjadalur'], 'The source says “3 km.” Reykjadalur is about 3.5 km each way—roughly 7 km return—and needs 3.5–4 hours with bathing.', 0.9776],
  ['2026-08-22', 'Saturday', 15, 'Protected buffer', 'open', 'Keep the blank source-document day available for weather, fatigue, ferry recovery, laundry or a neighbourhood pool.', 'Reykjavík area · flexible', 0, 0, 0, 'deliberate-buffer', 'No committed road route.', ['weather-buffer', 'reykjavik-pools'], null, 0.9776],
  ['2026-08-23', 'Sunday', 16, 'Reykjavík soft landing', 'open', 'Choose one whole-family city anchor. Sky Lagoon only happens through an explicit adult split.', 'Reykjavík Eco · open', 9.4, 18, 30, 'measured', 'Sky Lagoon branch excluded.', ['perlan', 'sky-lagoon', 'reykjavik-pools'], 'Sky Lagoon is about 45 minutes from KEF and prohibits under-12s; it is not “15 minutes from the airport” or a whole-family stop.', 0.9813],
  ['2026-08-24', 'Monday', 17, 'Camper return and flight home', 'locked', 'No sightseeing. Leave Reykjavík with enough margin to return two campers by 13:00 and reach the terminal around 14:00.', 'Homebound', 46.9, 47, 65, 'measured', 'Return processing and airport transfer excluded.', ['departure'], 'The source contains both 17:05 and 17:10 departure times. Check the live airline itinerary; do not normalize the discrepancy silently.', 1],
].map(([date, weekday, dayNumber, title, state, summary, overnight, distanceKm, baseMinutes, camperMinutes, confidence, note, stopIds, orderCheck, progress]) => ({
  id: dayId(date), date, weekday, dayNumber, title, state, summary, overnight,
  route: { distanceKm, baseMinutes, camperMinutes, confidence, note },
  stopIds, orderCheck, progress,
}));

const decisions = [
  { id: 'decision-booked-base', priority: '1 · unblock first', title: 'Confirm the booked-base dates', why: '“August 9–12” and “four nights” do not describe the same checkout morning, and the plates are still missing.', deadline: 'On arrival · Aug 9', status: 'open', dayIds: [dayId('2026-08-09')], optionIds: ['arrival-bjarkalundur'] },
  { id: 'decision-eclipse-sleep', priority: '2 · safety critical', title: 'Choose eclipse site + sleep together', why: 'Patreksfjörður is the service-rich family default; Arngerðareyri preserves northbound pace but has fewer verified services. Immediate site-hopping is out.', deadline: 'Aug 9–10', status: 'open', dayIds: [dayId('2026-08-12')], optionIds: ['eclipse-patreksfjordur', 'eclipse-arngerdareyri'] },
  { id: 'decision-westfjords-branch', priority: '3 · route shaping', title: 'Pick the Westfjords branch', why: 'Dynjandi, Rauðasandur and Látrabjarg are not one reasonable camper day. Choose what earns the gravel and what gets dropped.', deadline: 'Before Aug 10 departure', status: 'open', dayIds: [dayId('2026-08-10'), dayId('2026-08-11')], optionIds: ['dynjandi', 'raudasandur', 'latrabjarg-raudasandur'] },
  { id: 'decision-north-sleeps', priority: '4 · route shaping', title: 'Choose north branches + every sleep', why: 'Varmahlíð, Mývatn/Egilsstaðir and the Eastfjords need real camper stops. Hauganes, Húsavík, Hverfjall and Ásbyrgi are competing time commitments, not a stackable list.', deadline: 'By Aug 11', status: 'open', dayIds: [dayId('2026-08-13'), dayId('2026-08-14'), dayId('2026-08-15')], optionIds: ['hvitserkur-skagafjordur', 'hauganes-whales', 'husavik-whale-watching', 'hverir-hverfjall', 'hverfjall', 'asbyrgi', 'earth-lagoon'] },
  { id: 'decision-ice-country', priority: '5 · book ahead', title: 'Choose the ice-country anchor', why: 'Book the all-ages Amphibian, accept a Zodiac/adult split, or keep the safe Skaftafell view. The day cannot support every version.', deadline: 'As soon as route survives', status: 'open', dayIds: [dayId('2026-08-17')], optionIds: ['jokulsarlon-boat', 'glacier-hike'] },
  { id: 'decision-heimaey', priority: '6 · book ahead', title: 'Choose the Heimaey day + sleep model', why: 'Default to foot passengers with campers at Landeyjahöfn. Dalfjall needs local transport; Herjólfsdalur camping conflicts with that default and requires either exact-dimension vehicle space or separately booked island sleeping equipment/lodging.', deadline: 'At least several days ahead', status: 'open', dayIds: [dayId('2026-08-19')], optionIds: ['beluga-sanctuary', 'heimaey-puffin-volcano', 'dalfjall-hike', 'herjolfsdalur-camping'] },
  { id: 'decision-adult-splits', priority: '7 · group logistics', title: 'Approve or reject adult splits', why: 'Silfra, a guided glacier experience and Sky Lagoon change who is caring for the young travellers. Treat that as logistics, not a footnote.', deadline: 'Before any non-refundable booking', status: 'open', dayIds: [dayId('2026-08-17'), dayId('2026-08-20'), dayId('2026-08-23')], optionIds: ['glacier-hike', 'silfra-split', 'sky-lagoon'] },
  { id: 'decision-departure-truth', priority: '8 · confirm', title: 'Resolve flight + camper-return truth', why: 'Check 17:05 versus 17:10 against Icelandair and confirm the contract-specific return address, fuel, waste and cleaning rules.', deadline: 'By Aug 20', status: 'open', dayIds: [dayId('2026-08-24')], optionIds: ['departure'] },
];

const operations = [
  { id: 'ops-arrival', icon: '01', title: 'Airport → campers', body: 'At arrivals, use the green EUROPCAR–HOLDUR desk and the Motorhomes and Campers priority ticket.', items: ['Pickup is recorded for 10:00 on Aug 9.', 'Two child seats are required.', 'Photograph each camper and verify equipment before departure.', 'Confirm the contract road-use charge and return rules without copying private terms here.'], links: [{ label: 'Rental public contact', url: 'https://www.motorhomeiceland.com/contact-us' }] },
  { id: 'ops-eclipse', icon: '02', title: 'Eclipse protocol', body: 'Partial 16:43–18:45; totality about 17:44–17:46. Use one designated site and one backup.', items: ['ISO 12312-2 glasses for every partial phase.', 'Food, water, medication, warm/waterproof layers and full fuel.', 'No road or shoulder stopping.', 'Roads 612/614 have one-way controls; arrive early and stay late.'], links: [{ label: 'Official Westfjords eclipse plan', url: 'https://www.westfjords.is/en/experiences/solar-eclipse-2026' }] },
  { id: 'ops-camping', icon: '03', title: 'Sleep before sightseeing', body: 'The first base is recorded as booked; later campsites are not. Name the sleep before adding the attraction.', items: ['Confirm every post-Aug-12 night.', 'Check two-motorhome capacity, electricity, waste and arrival policy.', 'Wild camping is not the plan.', 'Keep the August 22 buffer uncommitted.'], links: [{ label: 'Official campground directory', url: 'https://tjalda.is/en/' }] },
  { id: 'ops-ferry', icon: '04', title: 'Herjólfur day', body: 'The current scheduled Landeyjahöfn crossing is 35 minutes. A cancellation does not automatically move the booking to the next sailing.', items: ['Reserve foot passengers and island transport.', 'Arrive at least 30 minutes early.', 'Check port and sailing the prior evening and morning.', 'Only ferry campers after measuring exact length and height.'], links: [{ label: 'Official schedule', url: 'https://herjolfur.is/en/schedule/' }, { label: 'Official crossing FAQ', url: 'https://herjolfur.is/en/frequently-asked-questions/' }] },
  { id: 'ops-live', icon: '05', title: 'Live-condition gate', body: 'The map is a dated planning snapshot, not permission to drive or enter.', items: ['Road/wind check before every exposed departure.', 'SafeTravel check for Reynisfjara and closures.', 'Weather check the night before and morning of.', 'Call Road Administration traffic service 1777 when uncertain.'], links: [{ label: 'Umferðin road conditions', url: 'https://umferdin.is/en' }, { label: 'SafeTravel', url: 'https://safetravel.is/' }, { label: 'Weather', url: 'https://en.vedur.is/' }] },
  { id: 'ops-shared-kit', icon: '06', title: 'Shared road kit', body: 'Keep the useful shared list without exposing personal packing.', items: ['Eclipse glasses', 'Waterproof layers, warm hats/gloves', 'Swimsuits and wet bags', 'Eye masks and clothes pegs', 'Walkie-talkies, chargers and headlamps', 'Arrival snacks, water and electrolytes'] },
  { id: 'ops-fuel', icon: '07', title: 'Fuel + services rhythm', body: 'Refuel before remote roads and treat a half tank as the Eastfjords floor.', items: ['Nettó—not Bónus—at Borgarbraut 58–60.', 'Provision before the Westfjords.', 'Use Akureyri/Reykjahlíð and Djúpivogur/Höfn as deliberate service anchors.', 'Do not rely on food, toilets or cell service at remote viewpoints.'] },
  { id: 'ops-departure', icon: '08', title: 'Finish the night before', body: 'Pack, empty waste and complete fuel/cleaning work on Aug 23.', items: ['Leave Reykjavík around 10:30–11:00.', 'Return both campers by 13:00.', 'Target terminal entry around 14:00.', 'No sightseeing on Aug 24.', 'Check 17:05 versus 17:10 in the live itinerary.'], links: [{ label: 'KEF traveller guide', url: 'https://www.kefairport.com/news/first-time-in-iceland' }] },
];

const archivedSourceDecisions = [{
  id: 'snaefellsnes-ruled-out',
  title: 'Snæfellsnes peninsula',
  status: 'ruled-out',
  documentStatus: 'Ruled out in the revised source',
  items: [
    'Búðir · white beach',
    'Arnarstapi · coastal-cliff hike and birdlife',
    'Djúpalónssandur · basalt-pebble beach',
    'Lýsuhólslaug · thermal pools',
    'Snæfellsjökull glacier',
    'Ólafsvík-area camping research',
  ],
  sources: [
    source('Official Snæfellsjökull National Park', 'https://www.ust.is/english/visiting-iceland/snaefellsjokull-national-park/'),
    source('Source-authored Ólafsvík camping page', 'https://www.snb.is/is/mannlif/ferdathjonusta/tjaldsvaedi#camping-in-olafsvik'),
  ],
}];

const itinerary = {
  schemaVersion: 2,
  trip: {
    ...original.trip,
    title: 'Iceland, Summer 2026 · Route Room',
    dateLabel: 'August 8–24, 2026',
    direction: 'clockwise circuit',
    summary: 'A dated, geographically reconciled camper circuit for four adult planners and two young travellers.',
    baseline: ['Flights are recorded as booked', 'Two motorhomes are recorded as booked', 'Bjarkalundur is recorded as booked for August 9–12', 'Clockwise Ring Road direction', 'Home-airport transfer is recorded as confirmed and paid'],
  },
  days,
  legs,
  decisions,
  operations,
  archivedSourceDecisions,
  methodology: {
    sourceDocumentSha256: '523d988f965ef24cbfef2141d284f460c8361f4d137e4f0be1fbdf73d1f116aa',
    sourceDocumentModified: '2026-08-08T00:43:50-04:00',
    lastResearchRefresh: '2026-08-08',
    statusModel: 'Locked means explicitly booked/fixed in the source; working is the current geographic proposal; open needs group assent or a live gate; branch is a mutually exclusive alternative.',
    driveMethod: 'OSRM car baselines over OpenStreetMap are shown separately from motorhome planning time. Neither includes attractions, groceries, fuel, toilets, roadworks, weather, ferry disruption or eclipse traffic unless stated.',
    mapMethod: 'Self-contained Natural Earth coastline and an attributed OpenStreetMap/OSRM route snapshot; no runtime map tiles, tracking or geolocation.',
    freshness: 'Roads, weather, ferry, beach access, operator availability, campground capacity and flight/rental contract truth must be rechecked live.',
    privacy: 'Reservation identifiers, prices, payment splits, private links, exact child details, identity documents and personal packing remain outside client assets.',
    links: [
      { label: 'OpenStreetMap copyright', url: 'https://www.openstreetmap.org/copyright' },
      { label: 'OSRM API', url: 'https://project-osrm.org/docs/v5.24.0/api/' },
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
if (Object.keys(details).some((id) => !ids.includes(id))) {
  throw new Error('An option override no longer maps to the preserved catalog.');
}

for (const id of [
  'asbyrgi',
  'husavik-whale-watching',
  'dalfjall-hike',
  'herjolfsdalur-camping',
  'hverfjall',
  'djupivogur',
  'gullfoss',
  'thingvellir',
]) {
  if (!ids.includes(id)) throw new Error(`Generated itinerary is missing independent option ${id}.`);
}

for (const leg of itinerary.legs) {
  const dates = datesFromOptions(leg.options);
  if (leg.dates !== dates) throw new Error(`${leg.id} must cover its contained option day IDs (${dates}).`);
}

for (const [day, requiredIds] of [
  ['2026-08-14', ['husavik-whale-watching', 'hverir-hverfjall', 'hverfjall']],
  ['2026-08-15', ['asbyrgi']],
  ['2026-08-16', ['djupivogur', 'djupivogur-stokksnes']],
  ['2026-08-19', ['dalfjall-hike', 'herjolfsdalur-camping']],
  ['2026-08-20', ['gullfoss', 'golden-circle-core', 'thingvellir']],
]) {
  const stopIds = itinerary.days.find((candidate) => candidate.id === dayId(day))?.stopIds || [];
  for (const id of requiredIds) {
    if (!stopIds.includes(id)) throw new Error(`${day} must expose independent option ${id}.`);
  }
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
    || archivedSnaefellsnes.items.length < 6
    || ids.includes(archivedSnaefellsnes.id)
    || itinerary.days.some((day) => day.stopIds.includes(archivedSnaefellsnes.id))
    || 'map' in archivedSnaefellsnes) {
  throw new Error('Snæfellsnes must remain a complete, non-rankable source archive record.');
}

await writeFile(outputPath, `${JSON.stringify(itinerary, null, 2)}\n`, 'utf8');
process.stdout.write(`Wrote ${outputPath} with ${itinerary.days.length} days and ${ids.length} stable options.\n`);
