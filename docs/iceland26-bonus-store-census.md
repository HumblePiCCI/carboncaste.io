# Iceland 2026 Bónus store census

## Result

The route map includes **30 of 33** current official Bónus locations: **14 on route** and **16 practical short provisioning detours**. Three nearby-but-off-route locations are explicitly excluded. This is a static planning snapshot, not a claim about August 2026 opening hours, stock, or road conditions.

Source access date: **2026-08-09**.

Primary inventory sources:

- [Bónus English store locator](https://bonus.is/english/) — declares 33 locations and supplies the canonical store labels, postal localities, and embedded coordinates.
- [Bónus Icelandic store locator](https://bonus.is/finna-verslun/) — native-language cross-check for the same official inventory.
- [OpenStreetMap copyright and contributor attribution](https://www.openstreetmap.org/copyright) — road-network source underlying the route geometry.
- [Project route methodology](./iceland26-route-methodology.md) — custody and construction of the dated OSRM/OpenStreetMap route snapshot in `iceland26/map-data.json`.

The official locator does not expose stable store-specific permalinks. Each map detail therefore links honestly to the common official locator and separately provides a coordinate-specific Google Maps directions URL. No hours were copied: current locator hours are volatile and are not promises for the trip dates.

## Reproducible method

1. Enumerate every `.store` record in the official English locator and copy its visible name/locality plus embedded `data-lat` and `data-lng` values. The declared count and parsed count must both equal 33.
2. Compare every official coordinate with every core and branch vertex in the board's complete dated route snapshot (`iceland26/map-data.json`) using minimum Haversine distance.
3. Treat that result only as an audit proximity, never as driving distance. Classify a store as `on-route` when the stored geometry passes directly through its local corridor; classify it as `short-detour` only when its town/metro position is a practical provisioning path on the identified dated segment.
4. Keep every ambiguous nearby location in the census. An exclusion requires a concrete stored-geometry offset and geographic/route rationale.
5. Preserve the complete machine-readable census, including exclusions, in `iceland26/bonus-stores.json`. Only records with `included: true` render on the map.

## Audited census

The offset column is minimum great-circle proximity to the stored core/branch polyline, rounded to two decimals. It is **not road distance**.

| Official store | Decision | Nearest route segment | Offset | Rationale |
| --- | --- | --- | ---: | --- |
| Bjarkarholt 7-9, 270 Mosfellsbær | On route | Aug 9 arrival northbound | 0.26 km | Northbound arrival corridor toward Borgarnes. |
| Fiskislóð, 101 Reykjavík | Short detour | Aug 21–23 Reykjavík stay | 2.96 km | Practical west-side city provisioning. |
| Garðatorg, 210 Garðabær | On route | Aug 24 camper return/KEF | 0.44 km | Metropolitan airport-return corridor. |
| Helluhraun, 220 Hafnarfirði | On route | Aug 9/24 airport corridor | 0.43 km | Reykjavík–Reykjanes corridor. |
| Holtagarðar, 104 Reykjavík | On route | Aug 21 Reykjavík arrival | 0.27 km | East-side arrival/city circulation path. |
| Hraunbær, 110 Reykjavík | Short detour | Aug 21 arrival/stay | 0.78 km | Short east-Reykjavík detour. |
| Kauptún, 210 Garðabær | On route | Aug 9/24 airport corridor | 0.47 km | Metropolitan Reykjavík–KEF corridor. |
| Kjörgarður/Laugavegur, 101 Reykjavík | Short detour | Aug 23 city loop | 1.46 km | Central-city provisioning during the stay. |
| Kringlan, 103 Reykjavík | On route | Aug 23 local loop | 0.19 km | Stored Reykjavík local-loop geometry. |
| Lóuhólar, 111 Reykjavík | Short detour | Aug 21–23 city stay | 1.44 km | Short south-east Reykjavík detour. |
| Miðhraun, 210 Garðabær | On route | Aug 9/24 airport corridor | 0.42 km | Metropolitan Reykjavík–KEF corridor. |
| Norðlingabraut, 110 Reykjavík | On route | Aug 21 Hveragerði–Reykjavík | 0.45 km | Eastern Reykjavík arrival corridor. |
| Nýbýlavegur, 200 Kópavogur | On route | Aug 24 departure/Sky Lagoon branch | 0.05 km | Departure-side route and optional branch. |
| Ögurhvarf, 203 Kópavogi | Short detour | Aug 21 arrival/stay | 1.69 km | Short Kópavogur detour. |
| Skeifan 11a, 108 Reykjavík | Short detour | Aug 21–23 city stay | 1.08 km | Central-east city provisioning. |
| Skipholt, 105 Reykjavík | Short detour | Aug 23 city loop | 0.73 km | Central Reykjavík provisioning. |
| Skútuvogur, 104 Reykjavík | Short detour | Aug 21–23 city stay | 0.87 km | Short east-Reykjavík detour. |
| Smáratorg, 201 Kópavogi | On route | Aug 9/24 airport corridor | 0.29 km | Metropolitan Reykjavík–KEF corridor. |
| Spöngin, 112 Reykjavík | Short detour | Aug 21–23 metro stay | 1.90 km | Practical Grafarvogur provisioning. |
| Tjarnarvellir, 221 Hafnarfirði | Short detour | Aug 24 departure | 1.43 km | Short airport-corridor detour. |
| Borgarbraut, 340 Stykkishólmur | **Excluded** | Aug 9 Borgarnes–Bjarkalundur | 44.65 km | Separate Snæfellsnes peninsula; the revised plan expressly rules out the Snæfellsnes block. |
| Digranesgata, 310 Borgarnesi | On route | Aug 9 Borgarnes | 0.25 km | Explicit provisioning town on the route. |
| Fitjar, 260 Reykjanesbæ | On route | Aug 9 pickup / Aug 24 return | 0.17 km | KEF-side arrival/return path. |
| Langholt, 603 Akureyri | Short detour | Aug 14 Akureyri | 0.54 km | Short city resupply detour. |
| Larsenstræti, 800 Selfossi | Short detour | Aug 20 Golden Circle transfer | 2.79 km | Practical South Coast service-town path. |
| Miðstræti 20, 900 Vestmannaeyjar | On route | Aug 19 Heimaey branch | 0.18 km | On the planned foot-passenger island day. |
| Miðvangur, 700 Egilsstöðum | On route | Aug 15/16 Egilsstaðir | 0.25 km | Route arrival and departure through town. |
| Naustahverfi, 600 Akureyri | Short detour | Aug 14 Akureyri | 1.20 km | Short city resupply detour. |
| Norðurtorg, 603 Akureyri | Short detour | Aug 14 Akureyri/Hauganes | 0.50 km | Beside the optional northbound branch. |
| Skeiði, 400 Ísafjörður | **Excluded** | Aug 11 Dynjandi–Arngerðareyri | 34.21 km | Substantial westward side trip from the stored route, not a short detour. |
| Smiðjuvellir, 300 Akranesi | **Excluded** | Aug 9 Reykjavík–Borgarnes | 7.31 km | Separate Route 1 peninsula exit; explicit on-line provisioning is directly ahead in Borgarnes. |
| Sunnumörk, 810 Hveragerði | Short detour | Aug 21 Reykjadalur | 0.57 km | Short town detour beside the planned stop. |
| Túngata, 230 Reykjanesbær | Short detour | Aug 9 arrival / Aug 24 departure | 2.80 km | Practical KEF-side provisioning detour. |

## Product and state boundary

The grocery layer is enabled by default but independently togglable. Grocery records are reference data, not itinerary options: selecting one never creates or changes preferences, comments, suggestions, consensus, authentication state, or the shared trip code. Directions URLs contain only the public store coordinate.
