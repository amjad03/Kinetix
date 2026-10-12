# 3D models and viewer

The app shows 3D models with `packages/kinetix_3d/assets/viewer3d/` (a
three.js page bundled into one offline file) inside a WebView: webview_flutter
on Android, webview_windows (WebView2) on Windows. This folder builds both.

```bash
cd tools/models
npm install                      # three.js, esbuild, glTF-Transform, meshoptimizer
node build_viewer.mjs            # src/*.js  ->  assets/viewer3d/viewer.js
BP3D=/path/to/bodyparts3d node build_models.mjs [id ...]
                                 # recipes/*.mjs  ->  assets/viewer3d/models/<id>.glb + <id>.json + index.json
                                 #                    and lib/src/viewer/catalogue_data.dart (the app's list)
node dev_server.mjs              # the viewer on http://127.0.0.1:3681/index.html?model=heart
                                 # and /__thumbs: the library's pictures -> assets/viewer3d/thumbs/<id>.jpg
                                 # and /__shots?ids=a,b&views=front&labels=all&variant=v&anim=run&thumb=1:
                                 #   pictures for checking by eye -> $SNAP_DIR/<id>-<view>.png (open it in
                                 #   headless Chrome; &thumb=1 also writes the library picture)
node inspect_source.mjs file.glb # what is inside a source model (pieces, triangles, materials)
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

Models built in code need no BP3D: `node build_models.mjs orbitals ear`.

## The app's side

`lib/src/viewer/protocol.dart` lists every command the app sends
(`ViewerCommands`, kept in step with `commands` in `src/viewer.js` by
`test/viewer_protocol_test.dart`). Besides the prototype's commands there are
`laser` (trail points from the app, 0..1 across the view; the part under the
tip is lit and named, and reported as a `laser` event), `orbit` (turn and zoom
without touching the page) and `partAt` (for tests), `cut` (half, wedge, slab, depth
sweep and peel, each with its own settings; every closed part gets a stencil
cap on each cut plane) and `annotate` (notes pinned to parts, strokes on the
surface and ink over the view; every change comes back as an `annotations`
event in the JSON that `Model3dAnnotations` reads). `test/viewer_catalogue_test.dart`
checks every manifest (three languages, files present, references resolved).

## Models built in code (recipes/volcano.mjs, recipes/seasons.mjs…)
`build(THREE)` returns each part's geometry (or a list of pieces), made
with three.js and `lib/shapes.mjs` (tubes, blobs, rods, solids of
revolution, thin sheets for petals), `lib/cell.mjs` (organelles),
`lib/earth.mjs` (a globe split into land and sea) and `lib/teaching.mjs`
(arrows, orbital lobes as polar plots, arcs, coils, rings, straight wires). A cut shows the inside
of closed solids, so layers are hollow shells a hair apart (the Earth's
layers, the volcano's ash and lava). Also available:

- per part: `inside` (the colour of its cut face), `capWith` (the part it
  makes one solid with for the cut face, like the crust's land, sea and
  underside), `cap: false` (no cut face), `matte`, `glow`,
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

## Models made from other people's files (recipes/virus.mjs, recipes/skull.mjs…)
A recipe with `sources: {name: {file, url}}` downloads each file once into
`sources/` (or `$SOURCES`, not kept in git) and `import(k)` returns each
part as a mesh made with `lib/importer.mjs` (`k.readSource`, `worldPrimitives`,
`pick`, `join`, `place`, `splitByColour`, `clipRich`, `piecesRich`,
`simplifyRich`, `fromThree`). GLB/glTF (with Draco or meshopt), STL and OBJ
are read. A part keeps its texture (made at most `maxTexture`, 1024 by
default, pixels across) or vertex colours, and its manifest says
`material: 'file'` so the viewer draws it with them; plain parts are painted
in the recipe's colour as before. `size` sets the model's longest side in
metres. Record every source in docs/licensing/3D_MODELS.md and the credits.

- `lib/terrain.mjs`: real landforms from the open Terrain Tiles (heights,
  SRTM/GMTED2010) as a block with rock layers round the sides.
- `lib/architecture.mjs`: arched wall panels, onion domes, chhatris, fluted
  storeys, spoked wheels and stepped roofs for the (simplified) monuments.
- `crease` (degrees, per recipe or part): parts made in code keep their hard
  edges instead of being smoothed. `metal: true` draws a part as metal.
- `drive` (per part) moves a machine with the crank of an `orbit` animation
  (its `speed` in degrees a second): `spin`, `slider` (a piston), `rod` (the
  connecting rod), `valve` (opens over a part of the 720° cycle) and `glow`.
- `remote: true` (with `topic` and `license`): the model is written to
  `remote_models/` instead of the app's assets and downloaded on first use
  (`RemoteModels`, lib/src/viewer/remote_catalogue_data.dart, written by
  write_catalogue.mjs); its library picture stays in the app.
