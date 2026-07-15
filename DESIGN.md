# Carbon Caste sampled-surface design system

## Premise

The conventional website is not a separate layer pasted over the Mobius. The
visitor enters the object, the renderer samples the destination, and the same
character and material hue become the substrate on which the company site is
displayed. The result combines mystery before entry with clarity after entry.

## Sequence

1. **Signal** - black field, chromatic ASCII Mobius, `We found you.` No header,
   footer, instruction panel, or corporate copy is visible.
2. **Dive** - activating the phrase raycasts the visible loop, freezes its
   orientation, and moves the camera into the selected surface point.
3. **Sample** - the final deep render yields one ASCII character and one of the
   CSP-safe normal-material hue classes.
4. **Site** - the sampled character repeats as a fixed matte; its hue controls
   the background, accents, focus rings, and status readout. The full corporate
   information architecture becomes scrollable above it.

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
- The camera must end on a raycast intersection with the live Mobius whenever
  one is visible; fallback coordinates are only for pathological orientations.
- `CspAsciiEffect.sampleAt()` owns surface sampling and nearest-lit-pixel
  fallback.
- Dynamic theming must use fixed body classes. Do not add inline `style`
  attributes or `.style` mutations.
- The sampled matte must preserve exactly one rendered character.
- Stop WebGL/ASCII rendering while the corporate site is active.
- Restore the exact initial camera, target, loop orientation, and interaction
  model on return.
- Verify 1440x900 and 390x844 after geometry, camera, copy, or layout changes.
