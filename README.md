# carboncaste.io

The public company surface for Carbon Caste Inc. The home route combines the
original ASCII Mobius experiment, the later `mobcon` direct-manipulation model,
and a complete corporate information surface.

First load automatically carries the visitor from the centered twisted elliptical
torus into the corporate surface. `We found you.` remains one modest-depth mesh
inside the ASCII renderer, but it is no longer a click gate or splash screen.
The camera automatically follows a curved path into a visible point on the form,
then the company site becomes the immediate public surface. The final ASCII
renderer frame is not replaced or redrawn: it stops in place and remains fixed
behind the site. A final pixel sample chooses the interface accent theme without
changing any of the visible characters.

## Experience states

1. **Signal** - automatic twisted elliptical torus approach. The authored local-X line through the first ellipse, shared
   offset origin, and perpendicular opposite ellipse is mapped to vertical
   world Y. A dedicated pivot spins only around that line. The phrase initially
   shares that spin, eases to rest at the viewer, and remains the same visible
   ASCII mesh while the torus moves around it.
2. **Dive** - without a user action, the loop stops rotating and the camera follows a cubic path from
   its current position, orientation, pan, and zoom into a real visible surface
   intersection.
3. **Surface site** - the exact final character field remains fixed while a
    scrollable corporate site appears over it, with product, company, contact,
    legal, and support destinations.
4. **Return** - the Carbon Caste wordmark, or Escape, returns to the interactive
   loop. That return is deliberately manual; the centered signal can then be
   used to re-enter the surface.

The sampled theme uses fixed CSS classes rather than inline styles, preserving
the production Content Security Policy. The frozen substrate is the live
renderer's existing DOM character field, while the corporate site uses
ordinary semantic HTML and links.

## Public routes

- `/` - interactive entrance and sampled corporate surface
- `/privacy.html` - corporate website privacy policy
- `/terms.html` - corporate website terms
- `/contact.html` - company and Rezonance support contacts
- `/iceland26/` - private Iceland 2026 planning and four-person decision board
- `/.well-known/security.txt` - security contact

Rezonance keeps its product-specific support, privacy, and terms at
`https://rezonance.carboncaste.io`.

## Verification

```sh
npm install
npm test
npm run serve
BASE_URL=http://127.0.0.1:8126 npm run smoke
BASE_URL=http://127.0.0.1:8126 npm run interaction
npm run interaction:iceland26
npm audit
```

`npm run interaction` launches system Chrome at 1440x900 and 390x844. It
checks first-load isolation, 110% centered geometry, authored-axis-only motion,
single-mesh ASCII link lock, chromatic ASCII output, intro controls, gradual curved
surface flight, exact frozen-frame continuity, sampled theme persistence,
complete corporate information architecture, scrolling, section navigation,
return, and console errors. Screenshots are written to ignored
`output/playwright/`.

## Iceland 2026 coordination board

`/iceland26/` is a full-stack, same-origin planning surface for Ben, Mary,
Laura, and Brad. The editorial route is sourced from the shared planning
document, while preferences, notes, and new group suggestions are persisted by
the Node service. The August 2026 redesign is pinned to the revised document
SHA and keeps authored sequence separate from geographic road order. The full
evidence, drive-time, privacy, and update contract is documented in
[`docs/iceland26-route-methodology.md`](docs/iceland26-route-methodology.md).

The board:

- separates booked/fixed anchors from open and conditional experiences;
- exposes all 17 dated days through a timeline scrubber and moves two camper
  markers over a local, attributed road-geometry snapshot;
- draws locked travel, the current working route, and mutually exclusive
  branches differently so unresolved logistics never look booked;
- flags source-order/geography conflicts rather than silently rearranging the
  source document;
- gives materially different places their own pin, preference key, and
  sticky-note thread instead of hiding route choices inside bundled cards;
- preserves directly struck-through source ideas in a read-only ruled-out
  archive without returning them to the route or decision system;
- highlights research-backed standouts with direct official, review, and travel
  post links;
- shows motorhome planning time separately from the raw routing baseline;
- keeps family fit, amenities, booking contacts, experience positives,
  drawbacks, and freshness-sensitive safety gates on each mapped stop;
- records `Love`, `Interested`, and `Not for me` independently for each of the
  four adult planners;
- calls something a group yes only when all four planners are positive;
- stores discussion and group-added ideas without placing shared text into
  `innerHTML`;
- keeps private reservation numbers, costs, and Drive links out of the client;
- sends `noindex, nofollow` at both HTML and HTTP-header levels.

Trip content and the API are protected by a shared code. The server stores only
the code's SHA-256 digest and issues a signed, HttpOnly, SameSite session cookie.
Production requires:

```sh
ICELAND26_ACCESS_HASH=<sha256-hex>
ICELAND26_SESSION_SECRET=<at-least-32-random-characters>
ICELAND26_DATA_PATH=/absolute/persistent/path/iceland26-state.json
ICELAND26_COOKIE_SECURE=true
```

If either credential variable is missing or invalid, the trip data fails
closed while the corporate homepage stays available. Coordination state lives
outside release directories and is written through a serialized,
fsync-and-rename atomic publisher. Every successful mutation also checkpoints
the preceding valid revision beside the live file as
`iceland26-state.json.previous`; restoring it remains an explicit operator
action so a damaged live file is never silently substituted.

`GET /api/iceland26/health` exposes no trip data and returns 200 only when both
the access configuration and persistent state are usable. A6 promotion treats
that readiness result, a deliberately invalid-login response, and the protected
API response as separate acceptance gates.

Verification is split intentionally:

```sh
npm test
npm run interaction:iceland26
node scripts/build-iceland26-itinerary.mjs
node scripts/build-iceland26-map-data.mjs --validate-only
```

The first command covers the existing portal, static contract, exact itinerary
regeneration/idempotence, access/session
gate, schema validation, cross-site rejection, concurrent granular updates,
production-shaped revision continuity, atomic persistence, restart recovery,
and logout. The interaction run opens a
task-owned local server and headless Chrome, exercises access, timeline and map
navigation, accessibility-tree markers and touch targets, reduced motion, keyboard place selection,
serialized preference intent, preference focus, sticky-note drafts (including edits during a save), live-to-read-only
transitions, discussion, suggestions, persistence and responsive layouts, records
screenshots, and tears down its browser, listener, temporary state, and child
process through signal-aware `finally` paths with force-stop fallbacks.
The itinerary builder is deterministic against either the original committed
catalog or its own v2 output; the route-data test requires byte-exact idempotence.
The last command checks the committed coastline, route states, day bindings,
coordinates, branches and measured arrival distance without making a network
request. Running the map builder without `--validate-only` refreshes OSRM road
geometry while reusing the committed Natural Earth coastline; pass a new
Natural Earth GeoJSON file with `--boundary` only when intentionally updating
the coastline source.

## Torus construction

The form sweeps an ellipse with semiaxes `1` and `0.125` around an exact circle
of radius `2`. The cross-section twist is `phi / 2`, producing exactly 180
degrees of twist over one revolution. Browser verification averages every
generated cross-section and fails if its center departs from that circle by more
than `0.00001` world units.

The broad appearance is not a noncircular path: the ellipse's semimajor axis is
half the path radius, so the radial body is intentionally substantial. The 110%
viewport framing and end-on views around the authored spin axis emphasize it.

## A6 deployment

Production files live at `/home/humble/services/carboncaste-web/current` on
`ssh humble`. `carboncaste-web.service` serves `127.0.0.1:8126`; Cloudflare
Tunnel maps `carboncaste.io` and `www.carboncaste.io` to that origin. Build
`dist/portal.js` before synchronizing the tracked tree.

Deployments should stage an immutable full-SHA release under
`/home/humble/services/carboncaste-web/releases/`, validate it on an alternate
loopback port and temporary state file, then atomically switch `current`.
`scripts/deploy-a6.sh <full-sha>` requires a clean, pushed branch; rejects
tracked release-metadata names; and sends independent NUL-delimited Git
manifests for both the candidate and active commits. The promotion program is
streamed from the trusted checkout rather than executed from the unverified
payload. Under a host-wide lock it verifies every tracked blob, executable bit,
symlink, path, directory boundary, and Git tree hash before the canary and again
immediately before switching. An exact committed Node broker opens the service
root, release root, and deployment lock with Linux `O_NOFOLLOW`, passes their
pinned descriptors into promotion, and the shell revalidates their identities
before and after acquiring `flock`. If the broker is interrupted, it forwards
the signal to the full detached promotion group, allows a 90-second bounded
recovery window, then force-kills and proves the group absent before releasing
the descriptors. Receipt creation is no-clobber and rejects
pre-existing files, links, or directories; the directory and created file stay
pinned by open descriptors until the final pathname identity, mode, link count,
and bytes or hash have been rechecked. Task-owned cleanup uses the exact
committed Node helper, moves only a matching device/inode into an unpredictable
no-replace quarantine, and removes contents through the already-opened owned
directory descriptor. A swapped non-empty pathname is preserved and reported
as critical rather than recursively traversed. Linux has no inode-conditional
`rmdir`; final removal of an already-proven empty directory is therefore inside
the existing same-`humble`-account trust boundary. A hostile same-account
process could replace that pathname with another empty directory immediately
before `rmdir`; the pinned link-count check detects and reports the interference,
but cannot restore the attacker-created empty inode. Promotion pins that same
helper by descriptor for its release, migration-copy, and legacy-current
cleanup. Published releases retain the immutable staging-owner and
candidate/previous Git manifests as custody receipts, plus exact `REVISION`,
`RELEASE_TREE`, and `RELEASE_TREE_MANIFEST` receipts and are made read-only. The first
directory-to-release migration creates and verifies a receipt-bearing copy of
the prior exact tree before moving `current`.

Immediately before archive extraction, deployment proves the staging root
contains only its exact owner receipt. Extraction uses tar's erroring
no-replace mode for any pre-existing file, and the independently captured Git
manifest then rejects missing, extra, changed, linked, or wrong-mode tracked
objects before the candidate can run.

`scripts/rollback-a6.sh <full-sha>` accepts only an exact locally available
commit from a clean, pushed branch. It supplies independently generated
manifests, verifies both the active and target release under the same host
lock, switches atomically, repeats health and authentication gates, and
re-verifies the target after service startup. A failed rollback must prove that
the prior link, unit, service, and health were restored or exits with an
explicit critical status. The read-only release modes prevent accidental
drift; because the service and deploy operator currently share the `humble`
account, they are not a separate-UID or filesystem-immutable security boundary.

Persistent Iceland state belongs under
`/home/humble/services/carboncaste-web/state/`, and the access hash/session
secret belong in the mode-0600
`/home/humble/services/carboncaste-web/config/iceland26.env`. Roll back code by
switching the release symlink; never roll back the coordination state unless a
separately verified data restore is explicitly intended.
