# Carbon Caste ASCII design system

## Premise

The interface should feel discovered rather than decorated: a live signal from
a small, deliberate system. ASCII is the image language, not a novelty layer.
Every surface should still be legible, fast, and useful when animation or
JavaScript is unavailable.

## Core grammar

- Use square brackets for actions and state: `[RUN]`, `[LIVE]`, `[PRIVACY]`.
- Use shell paths for navigation: `./work`, `./company`, `./contact`.
- Use slashes, periods, tildes, and arrows as semantic texture rather than
  arbitrary ornament.
- Use compact rails to identify section number, state, and object ID.
- Use character fields for imagery. Do not introduce stock photography,
  decorative SVGs, or gradient artwork.
- Keep legal and support content plain and readable inside the same system.

## Color roles

- Bone `#f1f1e8`: primary type and the lit Mobius surface.
- Near-black `#050505`: primary field.
- Signal green `#c8ff3d`: actions, online state, and orientation.
- Coral `#ff735c`: transmission and contact surfaces.
- Cyan `#76e6dc`: Rezonance visual telemetry.

The palette is functional. Colors identify state or surface; they do not form
decorative gradients.

## Motion

The Mobius is the sole persistent ambient motion. Pointer position introduces a
small rotational bias without making the scene dependent on pointer input.
`prefers-reduced-motion` produces a stable rendered frame and disables the
cursor and marquee animations. The static ASCII Mobius is the no-script
fallback.

## Technical constraints

- The production `style-src` CSP excludes `unsafe-inline`.
- The ASCII renderer must not emit style attributes or mutate `.style`.
- The renderer's source canvas remains offscreen; the public visual is real DOM
  text so it remains crisp and inspectable.
- Text and controls must fit at 390 px and 1440 px without horizontal overflow.
- New public pages use `legal-page`, the shared header, and the shared footer.
- Product-specific policies remain linked from their product surface.

Run `npm run check` and `npm run smoke` after every structural or renderer
change, then visually inspect desktop and mobile screenshots.
