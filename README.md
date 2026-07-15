# carboncaste.io

The public company surface for Carbon Caste Inc. The home route combines the
original ASCII Mobius experiment, the later `mobcon` direct-manipulation model,
and a complete corporate information surface.

First load intentionally exposes only the live toroidal Mobius and
`We found you.` Activating the text raycasts a visible point on the loop, moves
the orthographic camera to that point, and zooms until the rendered surface
fills the viewport. The final frame is sampled for its character and quantized
normal-material hue. Those values become the fixed ASCII matte and color theme
behind the company site.

## Experience states

1. **Signal** - interactive Mobius plus `We found you.` and nothing else.
2. **Dive** - the loop stops rotating and the camera enters a real visible
   surface intersection.
3. **Surface site** - a scrollable corporate site appears over the sampled
   character and chroma, with product, company, contact, legal, and support
   destinations.
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
the production Content Security Policy. The matte is a real DOM character
field, while the corporate site uses ordinary semantic HTML and links.

## Public routes

- `/` - interactive entrance and sampled corporate surface
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

`npm run interaction` launches system Chrome at 1440x900 and 390x844. It
checks first-load isolation, chromatic ASCII output, intro controls, live
surface zoom, sampled character and theme persistence, complete corporate
information architecture, scrolling, section navigation, return, and console
errors. Screenshots are written to ignored `output/playwright/`.

## A6 deployment

Production files live at `/home/humble/services/carboncaste-web/current` on
`ssh humble`. `carboncaste-web.service` serves `127.0.0.1:8126`; Cloudflare
Tunnel maps `carboncaste.io` and `www.carboncaste.io` to that origin. Build
`dist/portal.js` before synchronizing the tracked tree.
