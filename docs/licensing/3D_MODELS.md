# 3D models: sources and licences

All models are shown by the three.js viewer (`packages/kinetix_3d/assets/viewer3d`), built by
`packages/kinetix_3d/tool/models` from the recipes in `tool/models/recipes/`. Each model's
credit line is in its manifest and appears under the model and in "About this model"; the
full licence texts are in `packages/kinetix_3d/NOTICE` and `assets/viewer3d/CREDITS.txt`.
Source files are downloaded by the build (each recipe's `sources`) into `tool/models/sources/`,
which is not kept in git. Add every new model here before adding it to the catalogue.

## Bundled models made from other people's work

| id | Model | Source (URL) | Author | Licence |
|---|---|---|---|---|
| heart, brain, digestive, lungs, eye, excretory, skeleton | Human anatomy | BodyParts3D, https://dbarchive.biosciencedbc.jp/en/bodyparts3d/ | The Database Center for Life Science (DBCLS) | CC BY 4.0 |
| skull | Human skull, bone by bone (frontal, parietal, temporal, occipital, sphenoid, ethmoid, nasal, zygomatic, maxilla, lacrimal, palatine, vomer, conchae, mandible, teeth) | BodyParts3D, `isa_BP3D_4.0_obj_99.zip`, files FJ3199-FJ3395, FJ1254-FJ1281 | DBCLS | CC BY 4.0 |
| teeth | Permanent teeth by kind in see-through jaws | BodyParts3D, files FJ1254-FJ1281 (teeth), FJ3269, FJ3375 (maxilla), FJ3289 (mandible) | DBCLS | CC BY 4.0 |
| virus | SARS-CoV-2 virion (envelope, open and closed spike proteins) | NIH 3D, "SARS-CoV-2 Virion (PathogenAR Version)", 3DPX-014820, https://3d.nih.gov/entries/3DPX-014820 (`OpenClosedSpikesColored_NIH3D.glb`) | NIAID (NIH) | CC BY 4.0 |
| globe | Globe (Earth pictures) | NASA Earth Observatory, Blue Marble: Next Generation, topography and bathymetry, December 2004, https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x5400x2700.jpg | NASA (Reto Stöckli) | Public domain (NASA) |
| landforms | Mountain (Kangchenjunga), valley (Kali Gandaki gorge), plateau (Meghalaya plateau), delta (Ganga-Brahmaputra) | Heights: Terrain Tiles on AWS (Terrarium), https://registry.opendata.aws/terrain-tiles/ , containing SRTM and GMTED2010 (USGS/NASA) and ETOPO1 (NOAA). Delta picture: NASA Worldview/GIBS, MODIS Aqua Corrected Reflectance True Color, 15 January 2020 | USGS, NASA, NOAA; tiles by Mapzen | Public domain sources; attribution given |
| microscope | Compound microscope (Omax binocular) | Poly Pizza, https://poly.pizza/m/dcuaH6bEkwn (`https://static.poly.pizza/97dca3fe-24d1-495a-996b-7b5e472afcad.glb`), from the Google Poly archive | 3Donimus | CC BY 3.0 |

## Downloaded on demand (not bundled)

Cached to the app's model cache on first use; progress, an offline notice and Try again are
shown (en/hi/kn). Viewer models (processed by tool/models into `packages/kinetix_3d/remote_models/`,
served from `RemoteModels.defaultBase`) open in the three.js viewer with labels, cuts and notes;
NASA's own files open in the Dart renderer.

| id | Model | Source (URL) | Author | Licence | Size |
|---|---|---|---|---|---|
| woolly_mammoth | Woolly mammoth skeleton | Smithsonian 3D, https://3d.si.edu (`woolly-mammoth-150k-1024-low.glb`, package 341c96cd-f967-4540-8ed1-d3fc56d31f12) | Smithsonian National Museum of Natural History | CC0 | 0.52 MB |
| cosmic_buddha | Cosmic Buddha (limestone, China, 550-577 CE) | Smithsonian 3D (`cosmic-buddha-laser-scan-150k-1024-low.glb`, package d8c62be8-4ebc-11ea-b77f-2e728ce88125) | National Museum of Asian Art | CC0 | 0.92 MB |
| apollo11_command_module | Apollo 11 command module "Columbia" | Smithsonian 3D (`multi-mesh2-100k-2048_std_draco.glb`, package d8c6457e-4ebc-11ea-b77f-2e728ce88125) | National Air and Space Museum | CC0 | 1.12 MB |
| saturn_v | Saturn V rocket | NASA 3D Resources, `3D Models/Saturn V/Saturn V.glb`, https://github.com/nasa/NASA-3D-Resources | NASA | Public domain | 0.93 MB |
| apollo_lunar_module | Apollo Lunar Module | NASA 3D Resources, `3D Models/Apollo Lunar Module/` | NASA | Public domain | 0.72 MB |
| hubble_telescope | Hubble Space Telescope (A) | NASA 3D Resources, `3D Models/Hubble Space Telescope (A)/` | NASA | Public domain | 1.69 MB |

## Built in code by KINETIX (no third-party files)

Made with three.js geometry in the recipes; original work, same licence as the app.

| id | Model | Notes |
|---|---|---|
| engine | Four-stroke petrol engine, cut away | Runs: piston, rod, crank, valves and spark move over the 720° cycle (viewer "drive" animation); tour of the four strokes. Simplified, says so in its credit. |
| gears | Gear train (12, 24, 12 teeth) | True involute teeth (module 4 mm, 20°), turns at 2:1. |
| lens_bench | Convex and concave lens on an optical bench | Image placed by the lens formula (f = 10 cm, u = -30 cm), the textbook rays. |
| lab_apparatus | Burette on a retort stand, conical flask, measuring cylinder, test tubes in a rack, beaker on tripod over a Bunsen burner | Glassware as solids of revolution at standard sizes. |
| taj_mahal, qutub_minar, india_gate, konark | Indian monuments | Simplified models drawn from published measurements (credit says "Simplified model"). No open, downloadable model was found: searches of Poly Pizza, Wikimedia Commons, Smithsonian 3D, NIH 3D and GitHub found none (one GitHub Taj Mahal is GPL OpenSCAD traced from a Sketchfab model); Sketchfab downloads need a login; 3D Warehouse models are not under an open licence; OpenStreetMap has building parts only for the Taj Mahal (the Qutub Minar is a plain 72.5 m cylinder there). |
| cells, neuron, atoms, molecules, orbitals, solar system, earth layers, volcano, circuits, machines, ear, nephron, flower, DNA, prism, magnet | Earlier models | Built in code (see tool/models/recipes). |

Sources checked and not used: Sketchfab (download needs a login), 3D Warehouse (General Model
Licence, not open), KhronosGroup glTF-Sample-Models 2CylinderEngine and GearboxAssy (no licence
stated; dropped from the newer sample set), EOX Sentinel-2 cloudless imagery (current licence is
non-commercial), Poly Pizza glassware (a few hundred triangles each, too basic), the Smithsonian
Triceratops (mounted in a fighting pose that reads badly on its own).

The older Dart-drawn versions (`packages/kinetix_3d/lib/src/procedural_library.dart`) remain only
as the fallback where there is no WebView; the old ids (`proc.*`) open the viewer models above.
