# Root interaction gate diagnosis — 2026-08-09

## Disposition

The four root-site failures were a **stale test expectation plus a nondeterministic harness URL**, not a painted product regression and not an Iceland/Bónus change.

Exact revisions compared:

- deployed base: `9951ddf8fe1eb25462d384964af2bf2bf4082b5e`
- Bónus feature head before this correction: `85bf01129b3100a76d0923ba84f336c50f5e382b`

`index.html`, `styles.css`, `src/portal.js`, `scripts/interaction-test.mjs`, `README.md`, and `DESIGN.md` are byte-identical between those revisions. Both produced the same four failures:

```text
desktop: corporate surface leaks into first load
desktop: first load exposes non-scene interface chrome
mobile: corporate surface leaks into first load
mobile: first load exposes non-scene interface chrome
```

An earlier invocation without a separately running server also failed with `net::ERR_CONNECTION_REFUSED` at `http://127.0.0.1:8126/?manual=1`; that startup failure is distinct and is retained in the task receipt.

## Root cause

Commit `91707b4321f1f84e14a7b5522fa37177809842af` deliberately changed the first-load contract from a click-gated splash to automatic entry:

- it removed `hidden` from `#surface-site` so the company surface remains present in initial/no-JavaScript HTML;
- it updated the README to say the site is the immediate public surface;
- it made automatic entry the production default;
- it changed the deep geometry/control harness to use `?manual=1`.

The same commit retained the older `surface.hidden === true` assertion. Its “visible chrome” query also checked only `display` and `visibility`, so it counted an element with computed `opacity: 0` beneath a higher-z-index ASCII stage as visibly painted.

The harness had a second deterministic fault: `?manual=1` existed only in the fallback URL. Running the documented `BASE_URL=http://127.0.0.1:8126 npm run interaction` discarded that query and raced intro assertions against the intended automatic dive.

## Frozen before-state evidence

The two revisions were served simultaneously from exact Git trees on ports 8127 and 8126. Each was sampled in fresh desktop (1440×900) and mobile (390×844) browser contexts after `networkidle`, `ascii-ready`, and signal settlement.

Runtime:

- macOS 26.3 (25D125), arm64
- Node.js 22.22.2
- npm 10.9.7
- Git 2.53.0
- Google Chrome 151.0.7922.77 / Playwright browser UA HeadlessChrome 151.0.0.0

Results were equivalent:

| Revision | Viewport | Network idle | ASCII ready | Signal settled | Surface | Painted non-scene chrome | Console/request failures |
| --- | --- | ---: | ---: | ---: | --- | --- | --- |
| base `9951ddf8` | desktop | 655 ms | 705 ms | 2470 ms | `display:block`, `visibility:visible`, `opacity:0`, `hidden:false` | none | none |
| base `9951ddf8` | mobile | 603 ms | 618 ms | 2298 ms | same | none | none |
| head `85bf0112` | desktop | 679 ms | 718 ms | 2361 ms | same | none | none |
| head `85bf0112` | mobile | 623 ms | 646 ms | 2314 ms | same | none | none |

The output directory `output/playwright/root-gate-diagnosis/` contains JSON network/timing snapshots, PNG screenshots, and Playwright traces. It is intentionally ignored test output. Evidence integrity hashes:

```text
c8f5be079ed50851570d5891f8bc9cb27ca0825bdf701ff3a6dbce73e753d2a8  base-9951ddf8-desktop-intro.png
fc88ee6b94956475022414177ad715e475db908723499caa6b5bd84a1b2ea6fc  base-9951ddf8-desktop-trace.zip
2108b9a313ceba4710c7ea432b111297a9322d45d611cb4aa350559c44591d40  base-9951ddf8-mobile-intro.png
a147768ec7b0f4671a6f0998b3f6f588fda3f6173d4fb0362eae5c958843a7a9  base-9951ddf8-mobile-trace.zip
a69129c41815d9a20245f820cfc7df1900b310a97d9777126d82477cf745cb9f  base-9951ddf8.json
1734b308b020e2187bb96077ec43a6a73453092bfb8dded965db7158cbe39a9d  head-85bf0112-desktop-intro.png
565519a1caa130f25c53efae35ff892b0ea2bb4ad050f003178582a4891955b2  head-85bf0112-desktop-trace.zip
2108b9a313ceba4710c7ea432b111297a9322d45d611cb4aa350559c44591d40  head-85bf0112-mobile-intro.png
63985ad0ec0b382ad36e58295577435aa792debb348add00778c5e36cc4e870e  head-85bf0112-mobile-trace.zip
a7007d92a1bf7968e14d97b06a31652b5a2baf60322390562d28fc6d3bb037a9  head-85bf0112.json
```

## Permanent correction

The interaction harness now:

1. parses any configured `BASE_URL` with `URL` and always sets `manual=1` for the existing deep intro/geometry/control/dive/return matrix;
2. verifies actual painted intro state: portal remains in intro, `#surface-site` opacity is zero, ASCII-stage opacity is one, the site reveal class is absent, and the stage is stacked above the surface;
3. counts non-scene chrome only when it has rendered bounds and nonzero opacity in addition to visible display/visibility;
4. opens a separate default URL without `manual=1` at desktop and mobile sizes and deterministically waits for automatic mode `site`, `is-surface-site`, and surface opacity one—proving the production no-click contract.

No production root markup, animation, timing, CSS, or interaction behavior changed. Assertions were made more exact; none were skipped and no arbitrary wait was added.
