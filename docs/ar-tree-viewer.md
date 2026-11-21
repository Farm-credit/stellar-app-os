# AR tree viewer (Issue #1106)

`/trees/[id]/ar` shows a sponsor's tree at 20-year maturity using the device
camera as the AR background.

## What ships today

`components/organisms/ARTreeViewer/ARTreeViewer.tsx` owns the whole experience:

- **Camera background** — `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })`
  streamed into a `<video>` element. Permission, unsupported-browser and
  runtime-failure states all fall back to a studio preview so the page is
  never blank.
- **Anchored overlay** — a species-agnostic SVG silhouette scaled by
  `projection.scale` (height relative to the mature tree) and pinned to a
  ground plane. The overlay leans with `deviceorientation` for parallax.
- **20-year scrubber** — a range input from planting to maturity, with quick
  jumps (`Planting`, `+5 years`, `+10 years`, `Maturity`) plus a `Today`
  jump when the tree already has a planting date.
- **Measurements** — height, canopy width, annual and cumulative CO₂, and a
  scale comparison against a 1.75 m adult.
- **Capture** — draws the current video frame to a canvas and downloads a PNG.

All projection maths lives in `lib/ar/projection.ts`, which reads the shared
deterministic growth model in `lib/tree-growth/model.ts`. Keeping the maths
outside the component means the same numbers appear in the photo timeline
(`/trees/[id]/timeline`) and here.

## Swapping in a real 3D engine

The silhouette is deliberately dependency-free. To mount a real engine
(e.g. Three.js + WebXR or `<model-viewer>`):

1. Add the engine dependency and the species GLB/GLTF assets.
2. Replace the `TreeSilhouette` block with the engine canvas, keeping the
   existing wrapper element and `data-testid="ar-tree-overlay"` so the layout
   and tests keep working.
3. Drive the model transform from `activeYear.scale` (already normalised
   0–1 against the mature height) instead of setting a pixel height.
4. Keep `stopCamera()` wired into the unmount effect — the existing tests
   assert camera tracks are released when the viewer closes.

The projection contract (`TreeProjectionYear`) is the only interface between
the growth model and the renderer, so the engine swap does not touch
`lib/ar/projection.ts`.

## Testing without a device

Vitest/jsdom has no camera. The component tests stub `navigator.mediaDevices`
to cover granted, denied and unsupported paths, and assert that the overlay
and metrics still render in the studio preview. A physical device is only
needed for real camera frames and motion.
