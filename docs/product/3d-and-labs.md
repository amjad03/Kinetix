# 3D models and virtual labs

Two pure-Flutter packages that the Board will show in the split-screen side panel (and full
screen). Both work fully offline on Android, Windows and Linux: no WebView, no network, no
platform plugins, no native code. Everything is drawn with `CustomPainter`, so it also runs in
widget tests.

| Package | What it has |
|---|---|
| `packages/kinetix_3d` | A small software 3D engine, 10 solids with live measurements, procedural science models, a minimal glTF binary (`.glb`) loader |
| `packages/kinetix_labs` | Five interactive labs with controls, live readouts, an aim card and reset |

Both depend only on `kinetix_ui` (theme, `Kx` tokens). They look right on the dark board chrome
and on the light theme, and fill whatever space they get: side by side from about 860–900 px
wide, stacked and scrolling in a narrow pane (tested at 360–400 px).

## Embedding

```dart
ModelView(id: 'solid.cone')            // solids open with sliders and measurements
ModelView(id: 'chem.water')
LabView(id: 'lab.lens-mirror', preset: 'mirror')
```

Lower-level widgets: `ModelViewer(model: …)`, `SolidExplorer(kind: …)`, and each lab widget.
`ModelCatalogue.entries` and `LabCatalogue.entries` list everything with title, subject and
level tags, for the content library to link topics to.

## Catalogue ids (stable)

**3D:** `solid.cube`, `solid.cuboid`, `solid.sphere`, `solid.hemisphere`, `solid.cylinder`,
`solid.cone`, `solid.frustum`, `solid.square-pyramid`, `solid.triangular-prism`,
`solid.tetrahedron`, `chem.water`, `chem.methane`, `chem.co2`, `chem.nacl`,
`astro.solar-system`, `astro.earth`.

**Labs:** `lab.ohms-law` (presets `series`, `parallel`), `lab.lens-mirror` (`convex-lens`,
`concave-lens`, `concave-mirror`, `convex-mirror`, `lens`, `mirror`), `lab.pendulum` (`earth`,
`moon`, `mars`, `jupiter`), `lab.break-even`, `lab.graph-plotter` (`linear`, `quadratic`,
`sine`, `cosine`, `custom`).

## 3D viewer

- Drag to rotate, pinch or mouse wheel to zoom, double-tap to reset, tap a part to highlight it
  and show its name and a short note.
- Toolbar: reset view, labels, wireframe (x-ray), auto-rotate, and play/pause for animated models.
- Solids are drawn the way the textbook draws them: visible edges solid, hidden edges dashed,
  dimension lines with values (r, h, l…) on the model, and a 1 cm floor grid. The panel shows
  each measurement with its formula, the numbers substituted, and the value to 2 decimals with
  units. π can be taken as 3.14159… or 22/7, as NCERT exercises ask.
- Molecules use real geometry (H–O–H 104.5°, tetrahedral 109.5°, linear CO₂, rock-salt NaCl)
  and CPK colours. The Earth uses a drawn world map texture, a 23.5° tilt and a fixed Sun, so
  day and night stay put while the class turns the globe.

## Labs

| Lab | Syllabus | Shows |
|---|---|---|
| Ohm's law | CBSE 10 Electricity | Cell, plug key, ammeter, voltmeter, 1–3 resistors in series or parallel, moving charges, V–I graph built as the voltage changes, equivalent resistance |
| Lens and mirror ray diagrams | CBSE 10 Light | Four optics, draggable object (snaps to F and 2F/C), three principal rays, image position, nature, size and magnification with the New Cartesian sign convention |
| Simple pendulum | Physics practical | Length, g (Earth, Moon, Mars, Jupiter), amplitude; full-equation simulation; stopwatch that times 10 oscillations from the mean position; formula vs measured vs exact large-angle period |
| Break-even analysis | BU BCom Cost Accounting | Fixed cost, variable cost, price, sales; break-even chart with profit and loss areas, BEP in units and ₹, P/V ratio, margin of safety, Indian digit grouping (₹12,34,567.89) |
| Graph plotter | CBSE 9–10 Maths | Linear, quadratic, sine and cosine (degrees) with coefficient sliders, or a typed expression; roots, vertex, discriminant, y-intercept; pan and zoom |

## Loading licensed or in-house models

`GlbLoader.load(bytes, title: …)` reads a `.glb` file (embedded buffer only): positions,
optional normals, uint8/16/32 or no indices, triangle primitives, node hierarchy with TRS or
matrix transforms, and the material base colour. Textures, skins, morph targets, animation,
sparse accessors and external buffers are not supported yet. Keep models to a few thousand
triangles.

## Performance

The renderer transforms vertices into reused typed arrays, culls back faces, depth-sorts the
remaining triangles (painter's algorithm) and draws them in one `Canvas.drawVertices` call per
texture run. Per-frame CPU cost measured in tests (debug JIT, 1920×1080): 1–4 ms for the
largest models (Earth 4k triangles, NaCl 10k, Solar System 5.5k).

Known limits of the painter's algorithm: triangles that interpenetrate (a bond entering an atom)
can sort slightly wrong at some angles; meshes are not anti-aliased (outlines hide this on
solids).

## Not built yet

- Unfolding nets of the solids.
- More models (heart, Earth's layers, cells, the eye) and more labs (refraction through a glass
  slab, acids and bases, titration).
- Recording lab state into lesson recordings, and student-device versions of the labs.
