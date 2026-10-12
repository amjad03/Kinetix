# 3D models: sources and licences

Bundled models (packages/kinetix_3d/assets/viewer3d): see packages/kinetix_3d/NOTICE and assets/viewer3d/CREDITS.txt. Anatomy models are from BodyParts3D (CC BY 4.0, DBCLS); the rest are made procedurally by KINETIX.

## Downloaded on demand (not bundled)

Cached to the app's model cache on first use; offline notice and progress shown. Defined in `RemoteModels.all`.

| id | Model | Source | Licence | Size |
|---|---|---|---|---|
| saturn_v | Saturn V rocket | NASA 3D Resources, `3D Models/Saturn V/Saturn V.glb` | Public domain (NASA media usage guidelines) | 0.93 MB |
| apollo_lunar_module | Apollo Lunar Module | NASA 3D Resources, `3D Models/Apollo Lunar Module/` | Public domain | 0.72 MB |
| hubble_telescope | Hubble Space Telescope (A) | NASA 3D Resources, `3D Models/Hubble Space Telescope (A)/` | Public domain | 1.69 MB |

Source repository: https://github.com/nasa/NASA-3D-Resources. Add every new model here before adding it to the catalogue.

## Procedural models (made by KINETIX, no third-party files)

Drawn in code by `packages/kinetix_3d/lib/src/procedural_library.dart`, original work, same licence as the app. Nothing to attribute. The monuments, skull and teeth are simplified shapes and say so in their captions; no third-party file was sourced for them (BodyParts3D, NIH 3D and Smithsonian files were not converted).

| id | Model | Subject |
|---|---|---|
| proc.gears | Gears and gear train (animated, 2:1 ratio) | Engineering |
| proc.engine | Four-stroke engine (animated, cut away) | Engineering |
| proc.optics-convex, proc.optics-concave | Lens bench with ray paths and image | Physics |
| proc.lab-apparatus | Beaker, conical flask, test tube, burette, Bunsen burner, retort stand | Chemistry |
| proc.globe | Globe with tilted axis, equator, tropic (uses the app's own generated land map, not NASA Blue Marble) | Geography |
| proc.landforms | Mountain, valley, plateau, delta on height maps | Geography |
| proc.virus | Coronavirus-like particle | Biology |
| proc.teeth | Adult upper jaw teeth by kind | Biology |
| proc.skull | Simplified skull | Biology |
| proc.taj-mahal, proc.qutub-minar, proc.india-gate, proc.konark | Simplified Indian monuments | History |
