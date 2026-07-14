# Carbon Caste immersive ASCII system

## Sequence

The interface is discovered in three beats:

1. **Signal** - black field, chromatic ASCII Mobius, `We found you.` Nothing
   else may compete with these objects on first load.
2. **Dive** - activating the phrase accelerates into the loop, swaps the scene
   below the apparent surface, and settles inside a much larger ASCII field.
3. **Relief** - the directory and company statement exist as 3D text geometry
   in that field. They are not HTML cards, navigation bars, or a page laid over
   the scene.

The ambiguity is intentional. Conventional legal and contact pages remain
plain once someone chooses those routes.

## Geometry and material

The central form follows `mobcon`: an ellipsoid twisted once around a circular
path. It is materially closer to a continuous, dimensional Mobius object than
the original flat strip while retaining the original site's optical premise.
The loop and all visible portal text share `MeshNormalMaterial`, so their color
describes orientation rather than decoration.

## ASCII rendering

The source WebGL frame is sampled into a DOM character field. Color is reduced
to twelve fixed hue classes plus neutral, keeping the output vivid while
remaining compatible with the production Content Security Policy. Never add
inline `style` attributes or `.style` mutations to `CspAsciiEffect`.

## Controls

The scene itself is the control surface. OrbitControls provides mouse, touch,
pan, wheel, and pinch behavior. Raycasting targets the real text meshes; there
are no drifting transparent hit boxes. Keyboard input covers pause, speed,
selection, activation, and escape. Do not add a visible toolbar to the intro.

## Extension rules

- Add portal destinations as short lowercase text meshes in the directory.
- Keep prose in the semantic document and reduce visible scene copy to relief
  statements that remain legible in ASCII.
- Maintain real routes for legal, privacy, contact, and product support.
- Preserve black as the field; color must come from geometry orientation.
- Verify 1440x900 and 390x844 after geometry, camera, font, or copy changes.
- A first-load screenshot containing a header, footer, card, instruction, or
  debug control is a regression.
