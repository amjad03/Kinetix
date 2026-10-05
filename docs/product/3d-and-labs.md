# 3D models and virtual labs

Two Flutter packages that the Board shows in the split-screen side panel (and full screen).
Both work fully offline on Android and Windows. The labs and the solids are drawn with
`CustomPainter`; the teaching models (anatomy, cells, physics, chemistry, geography, space)
are shown by a three.js viewer in a WebView (see "three.js viewer" below), with the pure-Dart
renderer as the fallback wherever there is no WebView (tests, Linux, the web).

| Package | What it has |
|---|---|
| `packages/kinetix_3d` | The three.js viewer and 31 teaching models with labels in en/hi/kn, a laser pointer and snapshots; a small software 3D engine, 10 solids with live measurements, procedural science models, a minimal glTF binary (`.glb`) loader |
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

**3D, drawn in Dart:** `solid.cube`, `solid.cuboid`, `solid.sphere`, `solid.hemisphere`,
`solid.cylinder`, `solid.cone`, `solid.frustum`, `solid.square-pyramid`,
`solid.triangular-prism`, `solid.tetrahedron`. The older `chem.water`, `chem.methane`,
`chem.co2`, `chem.nacl`, `astro.solar-system` and `astro.earth` still resolve (lessons link
them): they open the viewer's `molecules` (h2o, ch4, co2), `crystal_lattices` (nacl),
`solar_system` and `seasons`, or the Dart model where there is no WebView. They are no longer
listed separately.

**3D, three.js viewer** (the prototype's ids, kept): `heart`, `brain`, `digestive`, `lungs`,
`eye`, `excretory`, `skeleton`, `neuron`, `animal_cell`, `plant_cell`, `flower`, `dna`,
`electric_motor`, `prism`, `bar_magnet`, `atoms` (20 elements), `molecules` (16),
`earth_layers`, `volcano`, `solar_system`, `seasons`, `solids` (7 solids that unfold into
nets); new for higher classes: `orbitals` (1s, 2s, px/py/pz, all p, five d), `hybridisation`
(sp, sp², sp³, sp³d, sp³d²), `crystal_lattices` (sc, bcc, fcc, NaCl), `electric_circuit`,
`ac_generator`, `transformer` (step-up, step-down), `simple_machines` (lever, pulley,
inclined plane), `ear`, `nephron`.

**Labs:** `lab.ohms-law` (presets `series`, `parallel`), `lab.lens-mirror` (`convex-lens`,
`concave-lens`, `concave-mirror`, `convex-mirror`, `lens`, `mirror`), `lab.pendulum` (`earth`,
`moon`, `mars`, `jupiter`), `lab.break-even`, `lab.graph-plotter` (`linear`, `quadratic`,
`sine`, `cosine`, `custom`).

## three.js viewer

`Model3dViewer(modelId: 'heart')` (or `ModelView(id: …)`, which picks the right viewer for any
catalogue id). The page (`assets/viewer3d`, three.js r180 bundled into one offline file) runs
in `webview_flutter` on Android and `webview_windows` (Edge WebView2) on Windows, loaded from a
small HTTP server on 127.0.0.1 inside the app. GLBs are meshopt-compressed (about 12 MB with
the pictures). The app drives it with JSON commands (`kx.cmd`, listed in
`ViewerCommands`) and hears events back (`ViewerEvent`).

- **Labels**: tap a part to name it (with a note card), or "Show all labels": two tidy columns
  with leader lines, dimmed when the part is behind another. Names, notes, groups, views,
  cuts and animation steps are in English, Hindi and Kannada (first drafts: native review
  pending, as for the rest of the app).
- **Controls**: parts list (show/hide, show only this), ready-made and free cuts with flat
  caps, take apart (solids unfold into nets), animations (heartbeat, breathing, flows with
  step cards, tours, orbits), views and slow turning, versions (each element, molecule,
  solid, orbital, lattice).
- **Laser pointer** (red button): one finger draws a fading red trail like the board laser;
  the part under the tip glows and is named, and stays correct as the model turns (the page
  re-checks the tip every few frames). Two fingers (or the right mouse button, or the wheel)
  turn and zoom the model without leaving laser mode.
- **Put on board**: `onSnapshot` (or a `Model3dScope` above) receives a `Model3dSnapshot`:
  PNG bytes of the view with labels drawn in, the model id, its title and credit. A
  `Model3dViewerController` can take one too. Opening a model full screen:
  `openModel3d(context, id)`; choosing one: `pickModel3d(context)` / `Model3dLibrary`.
- **Students' screen**: `mirror: Model3dMirror(wanted:, send:)` gets JPEG pictures of the view
  (labels and laser trail drawn in) while someone watches. The board does not wire this yet:
  its live view streams ink events, not pictures.
- **Credits**: a credit line under every model and an "About this model" box. Anatomy is from
  BodyParts3D (DBCLS, CC BY 4.0); the viewer is three.js (MIT). Full text in
  `packages/kinetix_3d/NOTICE`.
- Rebuilding the viewer or the models: `packages/kinetix_3d/tool/models/README.md`.

## Dart renderer

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

- Placing a snapshot on the board's canvas (waits for the canvas rewrite; the API is ready) and
  mirroring the 3D view to the live view.
- More models, proposed: d-orbital splitting in an octahedral field, hcp packing and voids,
  a DC generator (split ring) beside the AC one, a compound pulley block and the three classes
  of lever, the human tongue and nose, the female and male reproductive systems (only from
  licensed anatomy), the sectional view of a dicot stem and root, a dry cell and a lead-acid
  battery, a periscope and a telescope ray model, and plate tectonics.
- More labs (refraction through a glass slab, acids and bases, titration).
- Recording lab state into lesson recordings, and student-device versions of the labs.
