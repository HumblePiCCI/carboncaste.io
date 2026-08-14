# Iceland 2026 route-room methodology

This note explains how `/iceland26/` turns the family planning document, traveller updates and current official evidence into a dated, map-first logistics tool without silently rewriting anyone’s work.

## Source custody

- Current source: `Iceland Summer 2026 (1).docx`
- Source SHA-256: `f961d86b89d5a546f7d5d988f74c729a67c51139ab6ef151a2a2ce19d5702953`
- Source modified: 2026-08-13T20:12:12Z
- Research refresh: 2026-08-14
- Trip dates: 2026-08-08 through 2026-08-24

The Word document remains untouched. The site distinguishes source order, the geographically feasible working route and traveller-confirmed reality. A conflict is shown as an **Order check**; it is never silently normalized.

Private reservation identifiers, prices, payment splits, opaque Drive links, child identities or measurements, identity-document logistics and personal packing remain outside client assets. Public operator contacts and safety links may be included when verified.

## Current-state authority

The latest traveller update is authoritative over an earlier proposed route:

- as of 2026-08-13;
- both campers reached Camping Hamrar in Akureyri;
- the current state is **checked in at Camping Hamrar**;
- `trip.currentState.currentPlaceIsCampingCardSite` is explicitly `false`, so clients do not infer pass coverage from a campsite ID;
- the source route for that date is Flókalundur → Kolugljúfur → Hamrar;
- Hamrar arrival does not prove that the optional Kolugljúfur visit happened;
- Hamrar is not in the official 30-site 2026 Camping Card roster.

Because the calendar has rolled to August 14, the interface calls Hamrar the **last confirmed** position. It must not move the campers forward until another traveller update arrives.

The travellers report that passes were ordered for the two campers. That is not represented as universal campsite access: the Camping Card layer separately exposes official roster membership, season dates, one-unit-per-card limits, nightly lodging tax, possible amenity fees and the fact that a card does not create capacity priority.

## Five kinds of truth

1. **Locked** — explicitly booked, fixed or traveller-confirmed.
2. **Working** — the geographically coherent current route; still not a booking.
3. **Open** — a choice requiring group assent, availability or a live-condition check.
4. **Conditional** — a mutually exclusive branch or a choice that displaces another day.
5. **Historical** — earlier source work preserved without claiming completion, rejection or current relevance.

Informal enthusiasm in the Word document is context, not a board vote. A site-level **group yes** still requires Ben, Mary, Laura and Brad all to select either Love or Interested. Stable option identifiers are preserved so preferences and comments survive each itinerary refresh.

## Stable-state migration

The previous itinerary contained 44 option IDs. All 44 remain in the generated catalog.

Seven earlier ideas no longer present in the latest active plan are retained with `active: false`, `status: historical`, empty `dayIds` and no map marker:

- `latrabjarg-raudasandur`
- `raudasandur`
- `eclipse-patreksfjordur`
- `eclipse-arngerdareyri`
- `hvitserkur-skagafjordur`
- `hauganes-whales`
- `husavik-whale-watching`

They also appear in the read-only source-history archive. Their existing shared state is not deleted. Removal from the latest document is not described as a group pass, cancellation or completed visit.

The directly struck-through Snæfellsnes block remains a separate **ruled out** archive record. It has no active date, route, marker, rank control or comment thread.

Thirteen exact current-plan IDs were added:

- `hamrar-campsite`
- `kolugljufur`
- `husavik-town-stop`
- `asbyrgi-campsite`
- `hljodaklettar`
- `myvatn-camp`
- `dimmuborgir`
- `grjotagja`
- `krafla-viti`
- `krafla-leirhnjukur`
- `hofdi-kalfastrond`
- `skutustadagigar`
- `gufufoss`

Each has an independent map marker, date, practical record and stable ranking/comment key. The Húsavík town-stop ID deliberately does not reuse the archived whale-tour ID.

## Reconciled route by date

| Date | State | Feasible core | Separately represented choices |
| --- | --- | --- | --- |
| Aug 8–12 | Historical / fixed records | Flight, westbound source sequence, Flókalundur eclipse base | Optional earlier stops remain unconfirmed; removed site alternatives are archived |
| Aug 13 | Last confirmed | Flókalundur → Kolugljúfur → Camping Hamrar | Kolugljúfur visit is not marked complete |
| Aug 14 | Working | Hamrar → Goðafoss → Ásbyrgi | Short Húsavík harbour/café branch; decide and book two Ásbyrgi electrical pitches |
| Aug 15 | Working | Ásbyrgi → Hljóðaklettar → Dettifoss/Selfoss → Hverir → Mývatn | Choose the Mývatn camp; Earth/Forest Lagoon only if energy and bookings agree |
| Aug 16 | Working local loop | Mývatn camp → Hverfjall → Dimmuborgir → Grjótagjá → same camp | Choose Víti **or** Leirhnjúkur; then Höfði/Kálfaströnd **or** Skútustaðagígar **or neither** |
| Aug 17 | Working with live gate | Mývatn → Stuðlagil west viewpoint → Egilsstaðir → Gufufoss → Seyðisfjörður | Borgarfjörður Eystri only if live puffin evidence earns the branch |
| Aug 18 | Conditional | Stationary Seyðisfjörður when the direct route was used | If the puffin branch was used: Borgarfjörður → Egilsstaðir → Gufufoss → Seyðisfjörður |
| Aug 19 | Working | Seyðisfjörður → Djúpivogur → Stokksnes/Höfn via coastal Route 1 | No Öxi/939 shortcut for the large campers |
| Aug 20 | Working | Stokksnes/Höfn → Jökulsárlón/Skaftafell → Fjaðrárgljúfur → Eldhraun → Vík | Boat/glacier choice; Reynisfjara and Dyrhólaey are conditional branches |
| Aug 21 | Working | Vík → Skógafoss → Gullfoss → Geysir → Þingvellir | Longer South Coast and Heimaey are replacement branches, not additions |
| Aug 22 | Protected | Stationary weather/fatigue/recovery buffer at Þingvellir | A delayed South Coast or island overnight consumes this buffer |
| Aug 23 | Working | Þingvellir → Reykjadalur → Reykjavík | Perlan whole-family branch; Sky Lagoon adult split |
| Aug 24 | Locked | Camper return by 13:00 → KEF | No sightseeing; live itinerary must resolve 17:05 versus 17:10 |

## Material geographic corrections

- The August 13 current route uses Kolugljúfur and ends at Hamrar; the older Hvítserkur/Varmahlíð line is historical.
- The latest Húsavík question is a short harbour/café choice. The earlier whale tour and Hauganes detour are not silently carried into the day.
- Goðafoss → optional Húsavík → Ásbyrgi is the only honest northbound order. Sleeping at Ásbyrgi is what makes Hljóðaklettar → Dettifoss → Hverir → Mývatn coherent the next day.
- Hverir belongs on August 15. Hverfjall, Dimmuborgir, Grjótagjá and the Krafla/lake choices form the local August 16 plan.
- Víti and Leirhnjúkur are alternatives, not a combined Krafla stop. Höfði/Kálfaströnd and Skútustaðagígar are also alternatives.
- Borgarfjörður Eystri and Seyðisfjörður are different spokes from Egilsstaðir. Choosing puffins necessarily creates the August 18 backtrack.
- Gufufoss belongs on the Seyðisfjörður descent on either the direct or branch-return route.
- The Eastfjords road stays on coastal Route 1 through Breiðdalsvík. Route 939/Öxi is excluded.
- The source overloads August 19 with Eastfjords, ice country, the South Coast and Heimaey. Those are split across August 19–21.
- Westbound order is Jökulsárlón → Skaftafell → Fjaðrárgljúfur → Eldhraun → Vík.
- The feasible August 21 core uses one South Coast anchor, then Gullfoss → Geysir → Þingvellir. Reynisfjara, Dyrhólaey, Seljalandsfoss/Gljúfrabúi and Heimaey are replacement choices.
- Gljúfrabúi is a short walk north of Seljalandsfoss from the same stop, not across the road. The source hyperlink to Svartifoss is discarded.
- Herjólfur is a scheduled 35-minute crossing. A day trip defaults to leaving the campers at Landeyjahöfn; taking them requires exact length/height inventory. Herjólfsdalur camping consumes the protected buffer unless the whole downstream plan changes.
- Reykjadalur is about 3.5 km each way, not 3 km total.
- Perlan and Sky Lagoon move off the fixed return day. Sky Lagoon remains an adult split, not an airport-adjacent whole-family stop.

## Route and drive-time method

The map is self-contained at runtime. It uses:

- a Natural Earth public-domain coastline snapshot;
- a committed local OSRM snapshot built from the Geofabrik Iceland OpenStreetMap extract dated 2026-08-13;
- explicit non-road geometry for the Herjólfur ferry;
- no public routing request, third-party map tiles, tracking scripts or browser geolocation.

The committed route ledger is `iceland26/map-data.json`, generated locally on
2026-08-14T07:44:55.739Z. Its Geofabrik provenance records Iceland PBF
timestamp 2026-08-13T20:21:01Z and verified MD5
`97525792b54cad1392ed8df6f4f9338b`. The itinerary generator reads that local
artifact directly and fails if its planning-document hash or OSRM/Geofabrik
attribution is missing.

Every optional road path is a separate branch route. It never contributes to the working camper animation unless the itinerary is explicitly changed. Stationary days use zero-length dated route records so the scrubber does not teleport either camper.

Local OSRM output is a static car-road baseline, not a motorhome promise or a
live-traffic feed. Each dated day separates:

- routed kilometres and car-baseline duration;
- a conservative motorhome planning duration: baseline plus 35%, rounded up to the next five minutes;
- attraction, grocery, fuel, toilet, weather, roadwork and ferry time, which remains outside the drive figure unless explicitly stated.

Every dated core distance, base duration and route-progress value is copied
deterministically from the committed local ledger. Validation compares all 17
days exactly. Branch distances stay on their separate map routes and never
inflate the core day readout. A stale or invented drive time is not accepted.

Live road and weather truth always overrides the snapshot. Check [Umferðin](https://umferdin.is/en), [SafeTravel](https://safetravel.is/) and the [Icelandic Met Office](https://en.vedur.is/) before exposed travel and again on the morning of travel.

## Safety-sensitive presentation

Safety is a gate, not a review score:

- Reynisfjara uses the current SafeTravel access state and remains conditional.
- Hverir, Krafla and Grjótagjá require strict marked-route discipline around hot water, steam and fragile ground.
- Dettifoss uses the paved west-bank approach.
- Stuðlagil defaults to the serviced west/Grund viewpoint. The east river-level experience is a separate long hike and never a casual camper add-on.
- Waterfall, canyon, crater and harbour edges require direct supervision.
- Wildlife sightings are never represented as guaranteed. Borgarfjörður is gated by same-day live evidence.

Independent travel posts and reviews may summarize likely positives and drawbacks. Official/local sources control access, safety, booking, schedules and operating details.

## Map and information layout

The route remains the primary visual surface. Selecting a stop opens its full practical record—status, route cost, family fit, amenities, booking details, pros, drawbacks and evidence—in the information rail to the left of the map on desktop.

A small translucent map card may contain the selected place’s image/review signal. Planning-document images are context, never evidence of current terrain, weather, accessibility or safety.

Camping Card campsites use a visually separate marker namespace and independent layer toggle. Their reference panels are read-only: choosing a pass campsite does not create an itinerary vote, preference or comment record until that campsite is deliberately promoted into the trip plan.

## Deterministic update procedure

1. Hash and visually render each new planning document.
2. Record authored changes, direct strike-through semantics and privacy exclusions.
3. Apply traveller-confirmed current state before reconciling proposed route text.
4. Preserve stable IDs and persisted shared state. Removed ideas become inactive read-only history; they are never deleted or reinterpreted as group decisions.
5. Revalidate roads, ferry, wildlife gate, campsite policy, operator contact and Camping Card coverage.
6. Refresh the committed local OSRM/Geofabrik geometry only through the authorized offline workflow when waypoint order changes; the itinerary generator then imports its verified measurements and day progress.
7. Generate from both repository `HEAD` and the previous output, proving byte-exact idempotence.
8. Run static/privacy checks, route/data validation, API/state migration tests and desktop/mobile interaction tests.
9. Confirm production revision and shared-state custody before and after deployment.

## Current unresolved gates

- Decide immediately whether to reserve two electrical sites at Ásbyrgi.
- Select and confirm a Lake Mývatn campsite, preferably for both August 15 and 16.
- At Goðafoss, decide whether a short Húsavík town stop still leaves enough Ásbyrgi margin.
- Choose one Krafla experience and one-or-zero quiet-lake stop.
- Use live puffin evidence in Egilsstaðir before taking the Borgarfjörður branch.
- Select the Jökulsárlón/Skaftafell ice-country anchor.
- Keep the feasible South Coast/Golden Circle core or explicitly replace it with the longer South Coast/Heimaey branch.
- Preserve August 22 unless the group deliberately spends it.
- Confirm the contract-specific camper return procedure and resolve the return-flight time discrepancy.
