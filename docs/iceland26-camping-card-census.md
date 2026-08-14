# Iceland 2026 Camping Card campsite census

## Result

The revised planning document names [Útilegukortið](https://utilegukortid.is/?lang=en) and the **Camping Card**. The controlling [official 2026 membership page](https://utilegukortid.is/camping-card-2026/?lang=en) currently lists **exactly 30 participating campsites**:

- 4 in West Iceland
- 6 in the Westfjords
- 9 in North Iceland
- 4 in East Iceland
- 7 in South Iceland

All 30 are retained in `iceland26/camping-card-sites.json`; none are silently excluded. The route layer must render all 30 when its `All pass camps` mode is selected. The route-fit split is **7 direct**, **8 conditional** and **15 behind-current-route/not practical for the remaining plan**.

The travellers reported checking into **Camping Hamrar in Akureyri on August 13**. Hamrar is **not** one of the 30 current Camping Card campsites. That is a present-trip anchor, not a pass-site omission.

Membership/details snapshot time: **2026-08-13T20:21:48Z**. Official directions destinations were independently rechecked through **2026-08-14T07:50:02Z**.

## What the pass covers

The current [Camping Card 2026 page](https://utilegukortid.is/camping-card-2026/?lang=en), [FAQ](https://utilegukortid.is/camping-card-qa/?lang=en) and [terms](https://utilegukortid.is/about-us/terms-of-use/?lang=en) support these operational rules:

- One card holds 28 nights.
- One card covers one camping unit: a tent, campervan, motorhome, caravan or camping trailer.
- One card covers at most two adults and four children under 16.
- At most four consecutive nights may be used at one campsite.
- The card expires September 15, even if a campsite remains open later.
- The ISK 400 lodging tax per camping unit per night is not included.
- Electricity, showers, washing machines and other charged amenities are not included merely because a campsite offers them.
- Booking is normally unnecessary: arrive and register if required. Call ahead when weather or capacity could concentrate demand.
- The card is not a capacity reservation and provides no priority when a campsite is full.
- The card and personal identification must be presented on arrival.

The travellers report that two passes were ordered ahead of time for the two camper units. Because one card covers one unit, both cards must be valid; which traveller holds each card is not recorded here.

The terms page still says “2025” in clauses 4 and 8. That language is stale as of this 2026 snapshot. The current 2026 product page and the terms’ year-independent September 15 rule control this census.

## Reproducible method

1. Resolve the pass from the revised DOCX before web research. Its OOXML hyperlink targets contain `https://utilegukortid.is/?lang=en`, and its Campgrounds section calls it “Camping card.”
2. Freeze the 30 names and region membership from the official 2026 product page, not from generic “around 40” marketing copy.
3. Resolve each name to its official campsite detail page. Copy the page URL, listed phone, published WordPress modification date and service icons/text. Follow the page's own Guidance or Navigation link and use that directions destination for the marker; never use an embedded map camera center as though it were the campsite pin.
4. Use the [official February 12, 2026 opening-date article](https://utilegukortid.is/opening-dates-of-camping-sites-this-year-4/?lang=en) for the 27 campsites it names.
5. The opening article omits Hlöður, Ólafsfjörður and Kiðagils. Use the current official detail page for those three seasons and record that fallback explicitly.
6. Classify each campsite against the revised clockwise itinerary as of the August 13 Hamrar check-in. Classification is planning judgment, not an official Camping Card fact.
7. Preserve every campsite even when it is behind the group or outside the remaining corridor. `routeFit` controls filtering and emphasis, never membership.

Coordinates are the official campsite page’s Guidance or Navigation destination, rounded for display. They are appropriate directions targets, not surveyed coordinates. Siglufjörður's marker represents the page's one Guidance target even though the page describes three valid camping areas. Ólafsfjörður and Seyðisfjörður have small page-address versus Guidance-address differences; Kiðagils has a postal-code discrepancy. Those ambiguities are retained in the machine-readable caveats instead of silently normalized. Amenity flags mean the official page displays or mentions the service; they do not promise availability or inclusion in the card.

## Current-route shortlist

### Direct: 7

| Campsite | Remaining segment | Why it is direct |
| --- | --- | --- |
| Stuðlagil Canyon | Aug 17 · Mývatn → Stuðlagil | Exact stop in the revised plan. |
| Seyðisfjörður | Aug 17 · Egilsstaðir → Seyðisfjörður | Exact central-campground overnight on the direct plan; Aug 18 is the puffin-branch recovery day. |
| Bragðavellir | Aug 19 · Seyðisfjörður → Djúpivogur | Immediately beside the Djúpivogur corridor. |
| Kleifarmörk | Aug 20 · Ring Road/Fjaðrárgljúfur | Beside the Ring Road outside Kirkjubæjarklaustur. |
| Laugarvatn | Aug 21 · Golden Circle | On the Golden Circle corridor. |
| Skjól | Aug 21 · Geysir/Gullfoss | Between Geysir and Gullfoss. |
| At Faxi | Aug 21 · Golden Circle | On the Geysir/Gullfoss side of the loop. |

### Conditional: 8

| Campsite | Remaining segment | Trade-off |
| --- | --- | --- |
| Húsavík | Aug 14 · optional Goðafoss → Húsavík → Ásbyrgi branch | Useful if the group takes the town/café branch; it is not on the direct Goðafoss → Ásbyrgi working route. |
| Kópasker | Aug 14 · Ásbyrgi decision | Viable alternative east of Ásbyrgi; not the direct next-day Dettifoss progression. |
| Möðrudalur – Fjalladýrð | Aug 17 · Mývatn → Stuðlagil | Practical Road 901 pass-campsite alternative. |
| Kiðagils | Aug 14 · Goðafoss/Diamond Circle start | South/east detour from Goðafoss, not the direct Húsavík leg. |
| Svartiskógur | Aug 17 · East Iceland branch | Plausible with the northeast/Borgarfjörður branch, not the direct Seyðisfjörður spur. |
| Stokkseyri | Aug 21 · South Coast handoff | Modest coastal detour toward Selfoss. |
| Þorlákshöfn | Aug 23 · Reykjadalur → Reykjavík | South-coast alternative below the direct Reykjavík route. |
| Sandgerði | Aug 23 · final night before KEF return | Useful airport-area alternative to the planned Reykjavík overnight before the fixed Aug 24 camper return. |

The remaining 15 sites stay visible under `All pass camps`. Ten are in West Iceland/the Westfjords and are behind the group. Ólafsfjörður, Siglufjörður and Skagaströnd are west or northwest of the current Akureyri position. Bakkafjörður and Þórshöfn are ahead in longitude but are remote Langanes-side spurs outside the remaining corridor; their `behind-current-route` enum means “not practical for the remaining plan,” as the JSON definition states.

## Complete audited census

Amenity abbreviations: **E** electricity, **S** shower, **T** toilets, **D** motorhome waste disposal, **K** cooking facilities, **W** washing machine, **P** playground and **A** wheelchair-accessible.

| Official campsite | Region | 2026 season | Phone | Coordinates | Amenities | Route fit | Official page |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Akranes | West | May 5–Sep 15 | +354 790 2266 | 64.326061, -22.067545 | E S T P | Behind | [Official](https://utilegukortid.is/akranes/?lang=en) |
| Grundarfjörður | West | May 1–Sep 15 | +354 831 7242 | 64.920589, -23.258159 | E S T D | Behind | [Official](https://utilegukortid.is/grundarfjordur/?lang=en) |
| Tjaldsvæðið Búðardalur | West | May 1–Sep 30 | +354 767 2100 | 65.108302, -21.763642 | E S T D K W P | Behind | [Official](https://utilegukortid.is/tjaldsvaedid-budardal/?lang=en) |
| Tjaldsvæði að Hlöðum | West | May 23–Aug 31 | +354 433 8980 | 64.410428, -21.611374 | E S T P | Behind | [Official](https://utilegukortid.is/tjaldsvaedi-ad-hlodum/?lang=en) |
| Bolungarvík | Westfjords | May 15–Sep 30 | +354 456 7381 | 66.155117, -23.255979 | E S T D K W P | Behind | [Official](https://utilegukortid.is/bolungarvik/?lang=en) |
| Drangsnes | Westfjords | May 1–Sep 30 | +354 762 8455 | 65.691525, -21.443023 | E S T D K W P | Behind | [Official](https://utilegukortid.is/drangsnes/?lang=en) |
| Grettislaug á Reykhólum | Westfjords | Jun 1–Sep 30 | +354 434 7738 | 65.446246, -22.201693 | E S T D P | Behind | [Official](https://utilegukortid.is/grettislaug-a-reykholum/?lang=en) |
| Patreksfjörður | Westfjords | May 15–Sep 30 | +354 456 5006 | 65.591763, -23.974315 | E S T D K W | Behind | [Official](https://utilegukortid.is/patreksfjordur/?lang=en) |
| Tálknafjörður | Westfjords | May 1–Oct 15 | +354 823 9987 | 65.629354, -23.846725 | E S T D K W P | Behind | [Official](https://utilegukortid.is/talknafjordur/?lang=en) |
| Tungudalur | Westfjords | May 15–Sep 30 | +354 781 7585 | 66.060511, -23.203908 | E S T D W P A | Behind | [Official](https://utilegukortid.is/tungudalur/?lang=en) |
| Bakkafjörður | North | May 15–Oct 1 | +354 611 0345 | 66.036896, -14.802932 | E S T D P | Behind/not practical | [Official](https://utilegukortid.is/bakkafjordur/?lang=en) |
| Húsavík | North | May 15–Sep 30 | +354 792 0160 | 66.051757, -17.346502 | E T W P | Conditional | [Official](https://utilegukortid.is/husavik/?lang=en) |
| Kópasker | North | Jun 1–Sep 1 | +354 465 2180 | 66.301227, -16.443351 | E S T P | Conditional | [Official](https://utilegukortid.is/kopasker/?lang=en) |
| Möðrudalur – Fjalladýrð | North | May 20–Sep 10 | +354 894 0758 | 65.372708, -15.881777 | E S T D K P | Conditional | [Official](https://utilegukortid.is/modrudalur-fjalladyrd/?lang=en) |
| Ólafsfjörður | North | May 15–Oct 15 | +354 867 0251 | 66.071186, -18.648932 | E S T D W P | Behind | [Official](https://utilegukortid.is/olafsfjordur/?lang=en) |
| Siglufjörður | North | May 15–Sep 15 | +354 888 0349 | 66.148314, -18.905401 | E S T D W P A | Behind | [Official](https://utilegukortid.is/siglufjordur/?lang=en) |
| Skagaströnd | North | May 1–Sep 15 | +354 776 0040 | 65.825853, -20.292896 | E S T D K W P | Behind | [Official](https://utilegukortid.is/skagastrond/?lang=en) |
| Tjaldsvæði Kiðagils | North | Jun 1–Sep 15 | +354 464 3290 | 65.502181, -17.455945 | E S T P | Conditional | [Official](https://utilegukortid.is/tjaldsvaedi-kidagils/?lang=en) |
| Þórshöfn | North | Jun 1–Aug 31 | +354 468 1515 | 66.198613, -15.328385 | E S T D W | Behind/not practical | [Official](https://utilegukortid.is/thorshofn/?lang=en) |
| Seyðisfjörður | East | Apr 1–Oct 31 | +354 792 0070 | 65.260459, -14.011155 | E S T D W P | Direct | [Official](https://utilegukortid.is/seydisfjordur/?lang=en) |
| Stuðlagil Canyon | East | May 1–Sep 30 | +354 866 0046 | 65.165083, -15.315332 | E S T D | Direct | [Official](https://utilegukortid.is/studlagil-canyon/?lang=en) |
| Svartiskógur | East | May 16–Sep 12 | +354 471 1030 | 65.513964, -14.566936 | S T | Conditional | [Official](https://utilegukortid.is/svartiskogur/?lang=en) |
| Tjaldvæðið Bragðavöllum | East | May 1–Sep 15 | +354 866 1735 | 64.644051, -14.516581 | S T | Direct | [Official](https://utilegukortid.is/tjaldvaedid-bragdavollum/?lang=en) |
| Kleifarmörk | South | Jun 1–Aug 31 | +354 487 4675 / 861 7546 / 863 7546 | 63.801083, -18.057217 | T | Direct | [Official](https://utilegukortid.is/kleifarmork/?lang=en) |
| Laugarvatn | South | Jun 1–Oct 1 | +354 888 8890 | 64.222074, -20.733095 | E S T P A | Direct | [Official](https://utilegukortid.is/laugarvatn/?lang=en) |
| Sandgerði | South | All year | +354 854 8424 | 64.039340, -22.699848 | E S T D W P | Conditional | [Official](https://utilegukortid.is/sandgerdi/?lang=en) |
| Skjól | South | May 21–Sep 15 | +354 899 4541 | 64.311176, -20.233818 | E S T P A | Direct | [Official](https://utilegukortid.is/skjol/?lang=en) |
| Stokkseyri | South | May 1–Sep 15 | +354 896 2144 | 63.836329, -21.054397 | E S T D W P A | Conditional | [Official](https://utilegukortid.is/stokkseyri/?lang=en) |
| At Faxi | South | Jun 1–Sep 30 | +354 774 7440 | 64.226405, -20.339621 | E S T D | Direct | [Official](https://utilegukortid.is/at-faxi/?lang=en) |
| Þorlákshöfn | South | May 15–Sep 15 | +354 888 2021 | 63.852577, -21.379929 | E T D P | Conditional | [Official](https://utilegukortid.is/thorlakshofn/?lang=en) |

## Site-specific card notices

- Akranes: not valid during Írskir dagar, July 2–5.
- Drangsnes: not valid during Bryggjuhátíðinn, July 17–19, or on eclipse day, August 12.
- Húsavík: not valid during Mærudagar, July 23–26.
- Siglufjörður: advance Camping Card booking is available through Parka; direct arrival is also possible subject to space and consultation with the camp guard. The card was not valid July 30–August 3.
- Sandgerði: not valid August 11–13, 2026. That published blackout ended before August 14; use from August 14 remains subject to capacity and any newer site notice.
- Kiðagils: shower access is available for purchase.
- Stuðlagil: the official page states a shower price of ISK 400.
- Kleifarmörk: the membership is current, but its detail record was last modified June 16, 2021. Call before relying on its minimal amenity listing.

## Evidence receipt

Planning attachment:

- File: `Iceland Summer 2026 (1).docx`
- Size: 16,306,016 bytes
- Modified: 2026-08-13T20:12:12Z
- SHA-256: `f961d86b89d5a546f7d5d988f74c729a67c51139ab6ef151a2a2ce19d5702953`

Official response snapshots, retrieved 2026-08-13T20:21:48Z:

| Snapshot | SHA-256 |
| --- | --- |
| Current campsite detail records | `45d224b207b4f4e0042e7d656db657716be62b5cd6a1112fa2e5b5de03927022` |
| Camping Card 2026 product and membership list | `311b00e9da9da8355ad60706fd0dafe6c60e3639f7068340ac5a75cd8e1856b3` |
| 2026 opening-date article | `7581a753c22316572c47cabb04afe894d2c5ce1d43b89ca7e32bdfd13e607967` |
| Terms | `2f76fd00f117e2d8ab989c6cde0570b023710d5291007cf084aea4a51a394333` |
| FAQ | `30d13d9302334b0b03ceddc0e1b5e195917bfa8493e9cd1938e92479911c08d1` |

This census is static planning evidence, not a guarantee of same-day availability, weather, road access, service operation or space.
