# Iceland 2026 route-room methodology

This note explains how `/iceland26/` turns the family planning document into a dated, map-first logistics tool without silently rewriting its work.

## Source custody

- Revised source: `Iceland Summer 2026-2.docx`
- Source SHA-256: `523d988f965ef24cbfef2141d284f460c8361f4d137e4f0be1fbdf73d1f116aa`
- Research refresh: 2026-08-08
- Trip dates: 2026-08-08 through 2026-08-24

The source document remains untouched. The site stores the source sequence and the proposed road sequence as different concepts. A source-order conflict appears as an **Order check** in the interface; it is never silently normalized.

Direct strike-through is treated as an authored decision, not as missing data. The revised document's complete Snæfellsnes backup block is preserved in a read-only **Ruled out in the revised source** archive. It has no date, route, map pin, ranking or sticky-note thread, so an earlier idea cannot quietly return to the active plan.

Private reservation numbers, prices, payment splits, opaque Drive links, child heights, personal packing details and identity-document logistics are deliberately excluded from client assets. Public operator contacts and safety links may be included when verified.

## Four kinds of truth

1. **Locked** — explicitly booked or fixed in the source, such as flights, the two motorhomes, the clockwise direction, the campsite assertion and camper return deadline.
2. **Working** — the geographically coherent current route. It is a planning proposal, not a booking.
3. **Open** — a choice still requiring group assent, availability or a live-condition gate.
4. **Branch** — a real alternative that cannot honestly be drawn as part of the main route at the same time.

Informal enthusiasm in the Word document is preserved as context, not converted into a board vote. A site-level **group yes** requires Ben, Mary, Laura and Brad all to select either Love or Interested. Existing option identifiers remain stable so persisted preferences and comments survive the redesign.

## Route and drive-time method

The map is self-contained at runtime. It uses:

- a Natural Earth public-domain coastline snapshot;
- OpenStreetMap road data routed through the OSRM route service;
- explicit non-road geometry for the Herjólfur ferry;
- no third-party map tiles, tracking scripts or browser geolocation.

The dated camper positions are generated from the endpoint of each non-branch
route after applying the same projection and consecutive-point deduplication as
the browser. Validation recomputes all 17 positions independently, and the
browser interaction suite checks that the midpoint of the two visually offset
campers lands on every dated endpoint. When two or more 44-pixel map targets
overlap, pointer and touch activation opens an explicit place chooser; keyboard
activation continues to select the focused marker directly.

OSRM is a road baseline, not a motorhome promise. Each dated day therefore separates:

- routed kilometres and base duration;
- a motorhome planning duration that accounts for slower acceleration, gravel, exposed roads, single-lane bridges and ordinary comfort margin;
- attraction, grocery, fuel, toilet, weather, roadwork, ferry and eclipse-traffic time, which remains outside the drive figure unless a card says otherwise.

Live road and weather truth always overrides the snapshot. Check [Umferðin](https://umferdin.is/en), [SafeTravel](https://safetravel.is/) and [Icelandic Met Office](https://en.vedur.is/) before exposed travel and again on the morning of travel.

## Material geographic corrections

- The locked August 9 line contains only the airport handoff, Borgarnes provisioning and the booked-base assertion. Deildartunguhver and Hraunfossar are a conditional branch with their own route cost; they never render as booked.
- The address in the document at Borgarbraut 58–60 is Nettó, not Bónus.
- Returning to Bjarkalundur after every southern-Westfjords outing creates large backtracks. The booked-night assertion and an efficient clockwise route are shown as a conflict pending a group decision.
- Rauðasandur and Látrabjarg are separate selectable, rankable slow-road commitments. The full Bjarkalundur–south-coast loop is not represented as a child-realistic day.
- Eclipse-day Patreksfjörður and Arngerðareyri are separate selectable gathering-site/sleep decisions. Roads 612 and 614 have one-way controls and no shoulder viewing; immediate departure after totality is not assumed.
- Clockwise north-to-east order is Akureyri/Hauganes → Goðafoss → Mývatn/Hverir → Dettifoss → Stuðlagil → Egilsstaðir. Seyðisfjörður does not precede those northern stops.
- Ásbyrgi and Húsavík remain active source-document candidates, but each is a separate Diamond Circle branch with a visible road cost. Neither is silently folded into the working eastbound line.
- Hverir and Hverfjall are separate energy and safety decisions, not one combined vote. Djúpivogur and Stokksnes likewise have separate pins and discussion threads.
- Seyðisfjörður and Borgarfjörður Eystri are separate Egilsstaðir spokes. Neither is treated as a through-stop on the coastal road south.
- Large motorhomes stay on Route 1 through the Eastfjords; Route 939/Öxi is not part of the working geometry.
- Eldhraun belongs between Fjaðrárgljúfur and Vík/Reynisfjara when travelling west.
- Gljúfrabúi is a short walk north of Seljalandsfoss from the same stop, not across the road. The source hyperlink to Svartifoss is discarded.
- Herjólfur is a scheduled 35-minute crossing. A day trip defaults to leaving the campers at Landeyjahöfn; taking them requires exact length/height inventory.
- Dalfjall, Eldfell, the sanctuary and Herjólfsdalur camping are preserved as distinct island choices. Camping conflicts with the current foot-passenger day-trip assumption until camper-ferry logistics are explicitly changed.
- Westbound Golden Circle order is Gullfoss → Geysir → Þingvellir, and each core stop has its own ranking and sticky-note thread.
- Reykjadalur is about 3.5 km each way, not a 3 km total hike.
- Sky Lagoon is a Reykjavík-area adult split, not an airport-adjacent whole-family stop.

## Safety-sensitive presentation

The planner treats safety as a gate, not a review score:

- Reynisfjara follows the current SafeTravel access state. At the 2026-08-08 research snapshot it was viewpoint-only; it must be rechecked for the travel date.
- Látrabjarg is a loose, unguarded cliff edge approached by a narrow gravel road.
- Hverir and Deildartunguhver have severe burn hazards; marked paths and direct child supervision are non-negotiable.
- Dettifoss uses the paved west-bank approach. The old Fosshvamm viewpoint is permanently closed after cracking/landslide changes.
- Stuðlagil defaults to the serviced west/Grund viewpoint. The east river-level experience is a separate half-day with rougher access, no toilets and dangerous water.
- Wildlife sightings are never represented as guaranteed.

Independent travel posts and reviews are used only to summarize likely experience positives and drawbacks. Official/local sources control access, safety, booking, schedules and operating details.

## Update procedure

1. Hash and visually render any new planning document.
2. Record authored changes, direct-format strike-through semantics and privacy exclusions.
3. Preserve stable option IDs and the persisted state file. If a previously combined option is split, verify the live state has no ambiguous vote/comment before assigning the legacy ID to either child option.
4. Revalidate future-state facts: roads, ferry, eclipse controls, attraction status, campsite policies, operator contacts and flight/rental contract details.
5. Regenerate the deterministic itinerary and prove byte-exact idempotence. Refresh route geometry only when waypoint order changes; store the source-document SHA, snapshot date and attribution.
6. Run static/privacy checks, API/state migration tests and the desktop/mobile interaction suite.
7. Confirm the production state revision and known preferences before and after deployment.

## Known unresolved gates

- Confirm what “August 9–12, four nights” means on the live Bjarkalundur reservation and add both licence plates.
- Select an eclipse gathering site and nearby sleep plan; do not count on a post-totality cross-fjord return.
- Choose a northern pace and post-August-12 campsites.
- Select a named glacier operator or use the safe Skaftafell glacier-view trail.
- Reserve Herjólfur and decide foot passengers versus two measured campers.
- Confirm the rental return location/preparation rules from the contract.
- Resolve the return-flight `17:05` versus `17:10` discrepancy from the live airline itinerary.
