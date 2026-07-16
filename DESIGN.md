# Carbon Caste sampled-surface design system

## Premise

The conventional website is not a separate environment pasted over the
Mobius. The visitor enters the object, its motion eases to rest, and that exact
final renderer frame becomes the substrate on which the company site is
displayed. The result combines mystery before entry with clarity after entry,
without a visual substitution between them.

## Sequence

1. **Signal** - a chromatic ASCII twisted elliptical torus centered at 110% of
   viewport height and `We found you.` centered in its void. The form rotates only around the
   world-Y diameter that crosses opposite half-twist regions. No header,
   footer, instruction panel, or corporate copy is visible.
2. **Dive** - activating the phrase raycasts the deepest visible loop region,
   freezes its orientation, and flies the camera along a cubic path from its
   current state into the selected surface normal. Position, quaternion, and
   exponential zoom all use zero-velocity-endpoint easing.
3. **Hold** - the final deep render stops. Its existing characters, positions,
   colors, and density remain byte-for-byte unchanged in the fixed renderer
   DOM. One pixel sample selects a CSP-safe interface hue class only.
4. **Site** - the full corporate information architecture becomes scrollable
   above the held renderer frame. A translucent readability veil and section
   surfaces preserve contrast without replacing the ASCII field.

## Surface site

The post-entry site restores standard navigation ergonomics without abandoning
the source material. It includes:

- persistent wordmark, sampled-surface readout, and section navigation;
- brand hero with a visible hint of the next section;
- Rezonance description and product/support/privacy links;
- Carbon Caste statement and operating principles;
- direct company and product-support contact paths;
- corporate privacy, terms, contact, and support footer links;
- an explicit return to the original signal state.

Sections are full-width surfaces, not floating cards. Text remains high
contrast over every possible sampled hue. Rainbow material chroma persists in
the spectrum rail and secondary accents without using gradients.

## Technical constraints

- Never expose corporate chrome before the dive completes.
- Preserve the existing twisted elliptical torus mesh, including its elliptical
  cross-section and volume. Never substitute a flat Mobius strip.
- The camera must end on a raycast intersection with the live Mobius whenever
  one is visible; fallback coordinates are only for pathological orientations.
- `CspAsciiEffect.sampleAt()` owns surface sampling and nearest-lit-pixel
  fallback.
- Dynamic theming must use fixed body classes. Do not add inline `style`
  attributes or `.style` mutations.
- The intro Mobius diameter must be 110% of viewport height and its world
  position must remain centered.
- Default motion may change only `mobius.rotation.y`; X and Z define the
  straight vertical spin axis and must remain fixed.
- `We found you.` must be centered in the loop, use shallow unbevelled block
  geometry, and remain visually separate from the strip.
- Entry must derive from the current camera state, follow a curved path, align
  with the chosen surface normal, and ease position, orientation, and zoom to
  rest without a discontinuity.
- The final renderer DOM must remain unchanged while the site is active,
  including during scroll and navigation.
- Never synthesize a replacement matte or repeat a sampled character.
- Stop WebGL/ASCII rendering while the corporate site is active.
- Restore the exact initial camera, target, loop orientation, and interaction
  model on return.
- Verify 1440x900 and 390x844 after geometry, camera, copy, or layout changes.
