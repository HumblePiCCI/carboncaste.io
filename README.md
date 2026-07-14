# carboncaste.io

The public company surface for Carbon Caste Inc. The home route is an
interactive, ASCII-rendered Three.js world derived from the original Carbon
Caste Mobius experiment and the later `mobcon` interaction model.

First load intentionally exposes only two scene objects: the toroidal Mobius
and `We found you.` Activating the text dives through the surface and reveals a
directory made from the same 3D text geometry and normal material. There is no
conventional landing-page shell over the experience.

## Interaction model

- Drag or one-finger move: orbit the scene.
- Wheel or pinch: zoom.
- Click or tap empty space, or press Space: pause/resume motion.
- Double-click or double-tap: reset the camera.
- `[` / `-` and `]` / `=`: decrease/increase rotation speed.
- Tab and Shift+Tab: move through active scene links.
- Enter: activate the selected link or enter from the opening scene.
- Escape: company relief -> directory -> opening scene.

Visible links are real `TextGeometry` meshes selected by Three.js raycasting.
The off-screen semantic directory preserves the company copy and destinations
for assistive technology. The custom ASCII renderer quantizes surface color to
CSS classes, avoiding the inline styles emitted by Three's stock color effect.

## Public routes

- `/` - interactive company portal and product directory
- `/privacy.html` - corporate website privacy policy
- `/terms.html` - corporate website terms
- `/contact.html` - company and Rezonance support contacts
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
npm audit
```

`npm run interaction` launches system Chrome headlessly at 1440x900 and
390x844. It checks first-load isolation, chromatic ASCII output, pause/speed,
zoom/reset, mouse and touch raycasting, the dive, company relief, return path,
and console errors. Screenshots are written to ignored `output/playwright/`.

## A6 deployment

Production files live at `/home/humble/services/carboncaste-web/current` on
`ssh humble`. `carboncaste-web.service` serves `127.0.0.1:8126`; Cloudflare
Tunnel maps `carboncaste.io` and `www.carboncaste.io` to that origin. Build
`dist/portal.js` before synchronizing the tracked tree.
