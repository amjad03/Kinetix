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
| ear | Human ear at true size: pinna, and the inner ear (cochlea, vestibule, semicircular canals) | Pinna: BodyParts3D file FJ2811 (right ear). Inner ear: micro-CT surface of specimen F07 (`F07/uCT/F07_uCT_SURF.ply` in `F07.zip`), "Human Bony Labyrinth: Co-Registered CT and micro-CT Images, Surface Models and Anatomical Landmarks", https://doi.org/10.5281/zenodo.3355272 (Data in Brief 27:104782). Ear canal, eardrum, ossicles, middle ear cavity, Eustachian tube and nerve built in code (simplified; caption says so) | DBCLS; W. Wimmer, L. Anschuetz, S. Weder, F. Wagner, H. Delingette, M. Caversaccio | CC BY 4.0 (both) |
| kidney | Kidney cut open: cortex, medulla (pyramids), calyces and pelvis, renal artery and vein with branches, ureter, one nephron drawn larger | BodyParts3D FJ3147 (right kidney), FJ2038 and FJ3576 (renal artery), FJ3577 and FJ3578 (renal vein), FJ3146 (ureter); the inside built in code to textbook proportions (simplified; caption says so) | DBCLS; KINETIX | CC BY 4.0 |
| dna ("every atom" version) | B-DNA dodecamer CGCGAATTCGCG, every atom as balls and sticks, bases coloured, sugar-phosphate backbones, hydrogen bonds | RCSB PDB entry 1BNA, https://files.rcsb.org/download/1BNA.pdb | H. R. Drew, R. M. Wing, T. Takano, C. Broka, S. Tanaka, K. Itakura, R. E. Dickerson (1981) | CC0 (PDB data) |
| microscope | Compound microscope (Omax binocular) | Poly Pizza, https://poly.pizza/m/dcuaH6bEkwn (`https://static.poly.pizza/97dca3fe-24d1-495a-996b-7b5e472afcad.glb`), from the Google Poly archive | 3Donimus | CC BY 3.0 |

## Downloaded on demand (not bundled)

Cached to the app's model cache on first use; progress, an offline notice and Try again are
shown (en/hi/kn). Viewer models (processed by tool/models into `packages/kinetix_3d/remote_models/`)
are fetched from, in order: the board's own model server (Board settings → 3D model downloads), the
institution's (ERP Settings → Smartboard, `boardModelsBase`, or the API's `MODELS_BASE_URL`), the
KINETIX API's `/assets/models` (services/api serves `MODELS_DIR`, by default this folder), and last
the copy on GitHub (`RemoteModels.defaultBase`). A school server only needs the same files under
the same names. They open in the three.js viewer with labels, cuts, take-apart and
notes. NASA's files are viewer models too: a part made of pieces with different pictures keeps one
primitive per picture in its node (lib/importer.mjs `joinTextures`), which the viewer joins again.

| id | Model | Source (URL) | Author | Licence | Size |
|---|---|---|---|---|---|
| woolly_mammoth | Woolly mammoth skeleton | Smithsonian 3D, https://3d.si.edu (`woolly-mammoth-150k-1024-low.glb`, package 341c96cd-f967-4540-8ed1-d3fc56d31f12) | Smithsonian National Museum of Natural History | CC0 | 0.52 MB |
| cosmic_buddha | Cosmic Buddha (limestone, China, 550-577 CE) | Smithsonian 3D (`cosmic-buddha-laser-scan-150k-1024-low.glb`, package d8c62be8-4ebc-11ea-b77f-2e728ce88125) | National Museum of Asian Art | CC0 | 0.92 MB |
| apollo11_command_module | Apollo 11 command module "Columbia" | Smithsonian 3D (`multi-mesh2-100k-2048_std_draco.glb`, package d8c6457e-4ebc-11ea-b77f-2e728ce88125) | National Air and Space Museum | CC0 | 1.12 MB |
| saturn_v | Saturn V rocket in nine parts (F-1 engines and fins, three stages, instrument unit, lunar module adapter, service and command modules, escape tower), with its four decal pictures (the first stage's "USA" band repainted white, as flown) | NASA 3D Resources, `3D Models/Saturn V/Saturn V.glb`, https://github.com/nasa/NASA-3D-Resources | NASA | Public domain | 0.28 MB |
| apollo_lunar_module | Apollo Lunar Module in five parts (ascent stage, descent stage, descent engine, legs, footpads) with its pictures | NASA 3D Resources, `3D Models/Apollo Lunar Module/` | NASA | Public domain | 0.45 MB |
| hubble_telescope | Hubble Space Telescope in five parts (aperture door, light shield and tube, solar panels, equipment section, aft shroud), each keeping its five pictures | NASA 3D Resources, `3D Models/Hubble Space Telescope (A)/` | NASA | Public domain | 0.46 MB |
| liver | Liver and gallbladder: right, left, caudate lobes and segment IV with the quadrate lobe, gallbladder, bile ducts, portal vein, hepatic artery, hepatic veins, vena cava | BodyParts3D Couinaud segments FJ2816, FJ2818-FJ2824, FJ2409; FJ2817, FJ3079, FJ3080, FJ3096, FJ3123, FJ1853, FJ3078, FJ3081, FJ2414-FJ2416, FJ3441 | DBCLS | CC BY 4.0 | 0.43 MB |
| stomach | Stomach (fundus, body, pyloric part) with its muscle coat and folded lining, oesophagus end, duodenum start, cardiac and pyloric sphincters | BodyParts3D FJ2564, FJ2563, FJ2573; wall layers and sphincters built in code (simplified; caption says so) | DBCLS; KINETIX | CC BY 4.0 | 0.28 MB |
| tooth | Molar cut in half: enamel, dentine, pulp, nerve, blood vessels, cementum, periodontal ligament, gum, jaw bone | Built in code by KINETIX from textbook measurements (simplified; caption says so) | KINETIX | Same as the app | 0.17 MB |
| skin | Block of skin: epidermis, dermis, fat layer and cells, hairs and follicles, oil gland, hair muscle, sweat gland and pore, artery and capillaries, vein, nerve, touch and pressure receptors | Built in code by KINETIX (simplified; caption says so) | KINETIX | Same as the app | 0.36 MB |
| bacteria | Rod-shaped bacterium: capsule, cell wall, membrane, cytoplasm, nucleoid, plasmids, ribosomes, pili, flagellum | Built in code by KINETIX (simplified; caption says so) | KINETIX | Same as the app | 0.32 MB |
| mitochondrion | Mitochondrion: outer and inner membranes, cristae, matrix, mitochondrial DNA, ribosomes | Built in code by KINETIX (simplified; caption says so) | KINETIX | Same as the app | 0.17 MB |

## Built in code by KINETIX (no third-party files)

Made with three.js geometry in the recipes; original work, same licence as the app.

| id | Model | Notes |
|---|---|---|
| engine | Four-stroke petrol engine, cut away | Runs: piston, rod, crank, valves and spark move over the 720° cycle (viewer "drive" animation); tour of the four strokes. Simplified, says so in its credit. |
| gears | Gear train (12, 24, 12 teeth) | True involute teeth (module 4 mm, 20°), turns at 2:1. |
| gear_types | Helical pair (14/21 teeth, 20° helix, opposite hands) and straight bevel pair (16/24 teeth, 90°) | Involute profiles lofted along the face (helical) or towards the cone apex (bevel teeth simplified, not on the back cone). Turn animation at the tooth ratios. |
| cam_follower | Disc cam with a radial knife-edge follower | Profile worked out from the follower motion (rise and return y = h sin θ over 180°, dwell 180°) so the viewer's valve drive moves the follower exactly on the profile. |
| dc_machine | Four-pole DC machine, cut away: yoke, poles and shoes, field coils, slotted armature and winding, commutator, brushes | Run animation turns the armature; quarter cutaway and cross-section slices. Proportions simplified, credit says so. |
| induction_motor | Three-phase squirrel-cage induction motor, cut away: finned frame, slotted stator with R, Y, B windings, skewed rotor bars, end rings | The rotating field turns at synchronous speed and the rotor 5 % slower (slip). Simplified, credit says so. |
| transformer_1ph, transformer_3ph | Single-phase and three-phase core-type transformers: stepped (cruciform) core, concentric LV and HV windings, bushings | Flux path and how-it-works tour on the single-phase one; HV windings in the phase colours on the three-phase one. Simplified, credit says so. |
| organic_molecules | Methanol, ethanol, acetic acid and β-D-glucose (chair, OH equatorial) as ball-and-stick models | Positions worked out from bond lengths and angles; CPK colours as molecules. |
| cstr_reactor, pfr_reactor, packed_bed_reactor | Jacketed CSTR with baffles, Rushton and pitched-blade impellers (run animation turns the agitator); jacketed tubular reactor with coloured plugs feed → product; catalytic packed bed with distributor, inert balls and support grid | Cutaway slices. Simplified, credit says so. |
| shell_tube_hx, distillation_column | 1-1 shell-and-tube exchanger (tube bundle, tube sheets, segmental baffles, bonnets, nozzles); sieve-tray column with downcomers, feed, condenser, reflux drum and kettle reboiler | Cut-in-half slices. Simplified, credit says so. |
| ev_battery_pack, pmsm_motor, ev_drivetrain | EV battery pack (96 cylindrical cells in four modules, busbars, BMS, cooling plate, contactor box) to take apart; four-pole surface-magnet PMSM with U, V, W windings (run animation, no slip); rear-drive EV layout (battery, inverter, motor, reduction gear, OBC, DC-DC, 12 V battery) with turning wheels | Simplified, credit says so. |
| alternator | Salient-pole alternator: stator with three-phase windings, four-pole rotor with field coils, slip rings and brushes | Run animation at synchronous speed. Simplified, credit says so. |
| rcc_frame | RCC frame building, 2 × 2 bays, 3 storeys, 1:50 | Footings, columns, beams, slabs, starter bars; load-path tour. Simplified, credit says so. |
| truss_bridge, arch_bridge, suspension_bridge, cable_stayed_bridge | Pratt through-truss, open-spandrel parabolic arch, suspension and semi-fan cable-stayed bridges | Proportions from textbook rules (arch rise L/5, cable sag L/8); simplified, credit says so. |
| footings | Isolated, combined, strip, raft and pile foundations in a soil block | Simplified, 1:50. |
| lens_bench | Convex and concave lens on an optical bench | Image placed by the lens formula (f = 10 cm, u = -30 cm), the textbook rays. |
| lab_apparatus | Burette on a retort stand, conical flask, measuring cylinder, test tubes in a rack, beaker on tripod over a Bunsen burner | Glassware as solids of revolution at standard sizes. |
| taj_mahal, qutub_minar, india_gate, konark | Indian monuments | Simplified models drawn from published measurements (credit says "Simplified model"). No open, downloadable model was found: searches of Poly Pizza, Wikimedia Commons, Smithsonian 3D, NIH 3D and GitHub found none (one GitHub Taj Mahal is GPL OpenSCAD traced from a Sketchfab model); Sketchfab downloads need a login; 3D Warehouse models are not under an open licence; OpenStreetMap has building parts only for the Taj Mahal (the Qutub Minar is a plain 72.5 m cylinder there). |
| animal_cell, plant_cell, neuron, flower | Cells with organelles, neuron, flower | Built in code; no open, downloadable model with named parts was found (searches of NIH 3D, Smithsonian 3D, Poly Pizza, Wikimedia Commons and GitHub). Captions say "Simplified model". |
| atoms, molecules, orbitals, solar system, earth layers, volcano, circuits, machines, nephron, DNA (helix and ladder), prism, magnet | Earlier models | Built in code (see tool/models/recipes). |

Sources checked and not used: Sketchfab (download needs a login), 3D Warehouse (General Model
Licence, not open), KhronosGroup glTF-Sample-Models 2CylinderEngine and GearboxAssy (no licence
stated; dropped from the newer sample set), EOX Sentinel-2 cloudless imagery (current licence is
non-commercial), Poly Pizza glassware (a few hundred triangles each, too basic), the Smithsonian
Triceratops (mounted in a fighting pose that reads badly on its own), NIH 3D "Cochlea and
vestibular system" 3DPX-002432 (CC BY, from MRI: the cochlea's turns are not resolved; the micro-CT
labyrinth replaced it), Z-Anatomy (CC BY-SA; its inner ear and kidney were adapted from
"Anatomy of the Inner Ear" (CC BY-NC-SA) and "Kidney" by Lissie Cowley (CC BY-NC), so not used),
Tactiles.eu animal cell (no licence stated), MakerWorld plant cell (CC BY-NC-SA).

The older Dart-drawn versions (`packages/kinetix_3d/lib/src/procedural_library.dart`) remain only
as the fallback where there is no WebView; the old ids (`proc.*`) open the viewer models above.
