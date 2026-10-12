# Benchmark interactive panel: parity with KINETIX

Sources: Benchmark Technomate / Benchmark Displays listings and the vendor site (benchmarkdisplays.com). Public pages only name the content categories: built-in teaching software, 3D content, virtual labs and apps. No page lists individual titles, so the "Benchmark" column is the category as marketed, not a verified title list. Ask a dealer for the datasheet of the exact model (Maxpro 11, Galaxy 11, Alpha 13) to confirm the title list.

| Item | Benchmark | KINETIX status |
|---|---|---|
| Whiteboard / teaching software | Yes (bundled) | Done (board) |
| 3D content: human anatomy (heart, brain, lungs, eye, ear, digestive, excretory, skeleton, neuron, nephron) | Yes (category) | Done, 10 bundled GLBs, en/hi/kn labels, take-apart, cut planes |
| 3D: cells, flower, DNA | Yes | Done (animal cell, plant cell, flower, DNA) |
| 3D: skull, teeth, virus | Yes | Follow-up (skull is part of the skeleton model; separate models need sourcing: BodyParts3D, NIH 3D) |
| 3D: physics (motor, generator, transformer, magnet, circuit, prism, simple machines, atoms) | Yes | Done, bundled |
| 3D: lenses / optics bench | Yes | Follow-up as 3D; ray-optics simulation exists |
| 3D: chemistry (molecules, orbitals, hybridisation, crystal lattices) | Yes | Done; lab apparatus models are a follow-up |
| 3D: geography (earth layers, volcano, seasons, solar system) | Yes | Done; globe with landforms is a follow-up |
| 3D: maths solids with nets and cross-sections | Yes | Done |
| 3D: engineering (gears, engines) | Yes | Follow-up (no CC0/CC-BY model verified yet) |
| 3D: monuments (Indian) | Yes | Follow-up (Smithsonian / Sketchfab CC-BY candidates to be vetted) |
| Downloadable models with cache, progress, offline notice | Not stated | Done: `RemoteModels` + `ModelCache` (3 NASA public-domain models: Saturn V, Apollo Lunar Module, Hubble) |
| Part labels in en/hi/kn, explode/assemble, cross-section | Not stated | Done in viewer; downloadable models get hotspot labels and an Explode slider |
| Virtual labs | Yes (category) | Done (labs, PhET, simulations) |
| Animations / concept videos | Yes | Done (concept videos) |
| Tools: ruler, protractor, compass, calculator, timer | Yes | Done |

Follow-ups: source and optimise skull, teeth, virus, lens bench, gears, engines, lab apparatus, globe/landforms and Indian monuments to GLB under 2 MB each (draco/meshopt via gltf-transform), then add them to `RemoteModels.all` with hotspots and a row in `docs/licensing/3D_MODELS.md`.
