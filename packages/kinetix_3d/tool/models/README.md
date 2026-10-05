# 3D models and viewer

The app shows 3D models with `assets/viewer3d/` (a three.js page bundled
into one offline file) inside a WebView. This folder builds both.

```bash
cd tools/models
npm install                      # three.js, esbuild, glTF-Transform, meshoptimizer
node build_viewer.mjs            # src/*.js  ->  assets/viewer3d/viewer.js
BP3D=/path/to/bodyparts3d node build_models.mjs [id ...]
                                 # recipes/*.mjs  ->  assets/viewer3d/models/<id>.glb + <id>.json + index.json
node dev_server.mjs              # the viewer on http://127.0.0.1:3681/index.html?model=heart
                                 # and /__thumbs: the library's pictures -> assets/viewer3d/thumbs/<id>.jpg
node make_land_mask.mjs ne_50m_land.geojson
                                 # Natural Earth coastlines -> data/land_mask.txt (already in the repo)
```

Rebuild the pictures (open `/__thumbs` with the dev server running) after
changing what a model looks like at its first view.

`BP3D` is a folder with `isa_BP3D_4.0_obj_99.zip` and
`partof_BP3D_4.0_obj_99.zip` from
https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html
(BodyParts3D, CC BY 4.0; credit in `assets/viewer3d/CREDITS.txt`).

## A recipe (recipes/heart.mjs)
- **parts**: BodyParts3D element files (`FJ…`) merged into one part each,
  with a colour, a group, and a name and a note in English, Hindi and
  Kannada. `cuts` trims a part with a plane (vessels cut short),
  `attachedTo` drops pieces left floating, `hidden` parts (blood in the
  chambers) start hidden, `minor` parts are left out of "All labels".
- **splits**: one closed surface shared between parts by the nearest
  reference surface (the ventricle wall into left, right and septum).
- **views**, **slices** (ready-made cuts) and **animations**: `beat`
  (groups that squeeze in turn) and `flow` (steps with text and particle
  paths; path points are part ids, `part@top|bottom|left|right|front|back`,
  or `file:FJ…`).

## Models built in code (recipes/volcano.mjs, recipes/seasons.mjs…)
`build(THREE)` returns each part's geometry (or a list of pieces), made
with three.js and `lib/shapes.mjs` (tubes, blobs, rods, solids of
revolution, thin sheets for petals), `lib/cell.mjs` (organelles) and
`lib/earth.mjs` (a globe split into land and sea). A cut shows the inside
of closed solids, so layers are hollow shells a hair apart (the Earth's
layers, the volcano's ash and lava). Also available:

- per part: `inside` (the colour of its cut face), `matte`, `glow`,
  `opacity`, `explode` (take-apart direction), `spin` (for `orbit`
  animations), `hinge` (a solid's net), `variant`, `labelAt`, and
  `detail`/`error` to simplify a large part;
- per model: `variants` (versions: each element, each solid, the helix and
  the ladder), `light` (lit only by a sun at this point: day and night
  sides), `matte`, `edges`, `caps: 'flat'`, `thumb` (the version the
  library's picture shows);
- per cut: `normal2` (a second plane: a wedge taken out) and `anchors`
  (where each part's label goes while that cut is on; null for none);
- path points may also be `[x, y, z]` in the recipe's own coordinates.

The build centres the model, simplifies each part, and writes label
anchors, take-apart directions and flow paths into the manifest.
`test/model3d_test.dart` checks every manifest (three languages, every
path resolved); `integration_test/model3d_test.dart` runs the real viewer
on an Android emulator.
