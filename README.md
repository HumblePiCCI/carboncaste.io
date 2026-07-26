# carboncaste.io

The public company surface for Carbon Caste Inc. The home route combines the
original ASCII Mobius experiment, the later `mobcon` direct-manipulation model,
and a complete corporate information surface.

First load intentionally exposes only the centered twisted elliptical torus
and `We found you.` The phrase is one persistent modest-depth mesh inside the
ASCII renderer. It begins 45 degrees askew in X-Z, follows the loop's angular
phase, then decelerates into viewer alignment and attaches to the camera without
changing its world transform. An invisible semantic hit target makes that same
ASCII phrase the link. Activating it raycasts a visible point on the form, moves
the orthographic camera along a curved flight path into that surface, and
smoothly aligns the view with its normal. The final ASCII renderer frame is not
replaced or redrawn: it stops in place and remains fixed behind the company
site. A final pixel sample chooses the interface accent theme without changing
any of the visible characters.

## Experience states

1. **Signal** - interactive twisted elliptical torus plus `We found you.` and
   nothing else. The authored local-X line through the first ellipse, shared
   offset origin, and perpendicular opposite ellipse is mapped to vertical
   world Y. A dedicated pivot spins only around that line. The phrase initially
   shares that spin, eases to rest at the viewer, and remains the same visible
   ASCII mesh while the torus moves around it.
2. **Dive** - the loop stops rotating and the camera follows a cubic path from
   its current position, orientation, pan, and zoom into a real visible surface
   intersection.
3. **Surface site** - the exact final character field remains fixed while a
   scrollable corporate site appears over it, with product, company, contact,
   legal, and support destinations.
4. **Return** - the wordmark or Escape restores the original camera, loop,
   controls, and first-load isolation.

## Intro controls

- Drag or one-finger move: orbit the scene.
- Wheel or pinch: zoom.
- Click or tap empty space, or press Space: pause/resume motion.
- Double-click or double-tap: reset the camera.
- `[` / `-` and `]` / `=`: decrease/increase rotation speed.
- Enter: enter the surface.

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
the Node service.

The board:

- separates booked/fixed anchors from open and conditional experiences;
- highlights research-backed standouts with direct official, review, and travel
  post links;
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
```

The first command covers the existing portal, static contract, access/session
gate, schema validation, cross-site rejection, concurrent granular updates,
atomic persistence, restart recovery, and logout. The interaction run opens a
task-owned local server and headless Chrome, exercises access, preferences,
discussion, and suggestions at desktop/mobile sizes, records screenshots, and
tears down its browser, listener, temporary state, and child process through
signal-aware `finally` paths with force-stop fallbacks.

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
`scripts/deploy-a6.sh <full-sha>` resolves and verifies the live A6 revision,
acquires the host deployment lock, and passes both exact identities into
promotion. The first directory-to-release migration upgrades its prior short
marker to that resolved full SHA. `scripts/rollback-a6.sh <full-sha>` accepts
only an exact release SHA, verifies its `REVISION`, takes the same host lock,
and repeats the Iceland readiness and authentication gates after switching.
Persistent Iceland state belongs under
`/home/humble/services/carboncaste-web/state/`, and the access hash/session
secret belong in the mode-0600
`/home/humble/services/carboncaste-web/config/iceland26.env`. Roll back code by
switching the release symlink; never roll back the coordination state unless a
separately verified data restore is explicitly intended.
