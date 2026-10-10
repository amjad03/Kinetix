# Simulations hub: sources, licences, attribution

Board code: `apps/board/lib/features/sim_hub/`. Catalogue: `sim_entry.dart` (`simCatalogue`; each entry exposes
`subject`, `gradeMin`, `gradeMax`, `tags`, `offline` for a subject-context registry via `filterSims`).
Bundled files live in `apps/board/assets/simhub/` (51 MB raw, about 19 MB compressed in the APK) and are
served from a loopback-only server (`sim_server.dart`). URLs were checked with `curl -I` on 2026-10-10.

| Source | How | Licence | URL checked |
|---|---|---|---|
| PhET (15 sims: projectile-motion, pendulum-lab, circuit-construction-kit-dc, wave-on-a-string, forces-and-motion-basics, energy-skate-park-basics, gravity-and-orbits, density, states-of-matter, build-an-atom, ph-scale, balancing-chemical-equations, molecule-polarity, natural-selection, fractions-intro) | Bundled, English `_en.html` | CC BY 4.0, PhET Interactive Simulations, University of Colorado Boulder. Attribution shown under every open sim and on every board picture. | https://phet.colorado.edu/sims/html/<id>/latest/<id>_en.html 200; catalogue https://phet.colorado.edu/en/simulations/filter?type=html (online entry). The rest of PhET: existing Sims tab (download on demand). |
| Blockly | Bundled (blockly 11.2.2 from npm) | Apache-2.0, Google LLC | npm package |
| Open Source Physics (EJS web sims) | Online | Per item, mostly CC BY-NC-SA | https://www.compadre.org/osp/EJSS/ 200 |
| Molecular Workbench Next-Gen | Online | Concord Consortium, per activity mostly CC BY | https://mw.concord.org/nextgen/ 200 |
| LabXchange | Online | Per item, mostly CC BY | https://www.labxchange.org/ 200 |
| ChemCollective virtual lab | Online | CC BY-NC-SA | https://chemcollective.org/vlabs 200 |
| GeoGebra | Online only, not bundled | Non-commercial only; commercial use needs a GeoGebra licence (shown in the panel) | https://www.geogebra.org/classic 200 |
| Mathigon Polypad | Online | Free to use online | https://mathigon.org/polypad 200 |
| CircuitJS (Falstad) | Online, loaded from falstad.com, not bundled | GPL-2.0 | https://falstad.com/circuit/circuitjs.html 200 |
| CircuitVerse | Online | MIT | https://circuitverse.org/simulator 200 |
| Wokwi | Online | Free tier | https://wokwi.com/ 200 |
| Mol* 3D molecules | Online | MIT; PDB data CC0 | https://molstar.org/viewer/ 200 |
| 3D biology models | Native: opens the board's existing 3D viewer (`kinetix_3d`) | Open models, credits in the 3D viewer | n/a |
| EconGraphs | Online | CC BY-NC-SA | https://www.econgraphs.org/ 200 |
| Money and banking macro model | Native, original (money multiplier, deposit rounds) | KINETIX | n/a |
| PsychoJS / Pavlovia | Online | Per experiment; PsychoJS GPL-3.0 | https://pavlovia.org/explore 200 |
| Stroop, reaction time, memory span | Native, classic tests (PEBL is desktop-only; no PEBL code used) | KINETIX | n/a |
| Map lab (QGIS-style: base layers, markers, measure) | Native, `flutter_map` | flutter_map BSD-3; map data OpenStreetMap contributors (ODbL), attribution shown on the map; tiles need internet | https://tile.openstreetmap.org/2/1/1.png 200 |
| Geography map quiz | Native; labels-free basemap from CARTO (OSM data) | ODbL; attribution on the map | https://a.basemaps.cartocdn.com/light_nolabels/2/1/1.png 200 |
| TimelineJS | Online | MPL-2.0 | https://timeline.knightlab.com/ 200 |
| Timeline from key dates | Native, `assets/history/key_dates.tsv` | See `assets/history/CREDITS.txt` | n/a |
| LanguageTool grammar check | Native UI, public API; the text is sent to the service (panel says so) | LGPL-2.1 (service) | https://api.languagetool.org/v2/languages 200 |
| LearningApps | Online | Per app, mostly CC BY-SA | https://learningapps.org/ 200 |
| JupyterLite | Online | BSD-3 | https://jupyterlite.github.io/demo/lab/index.html 200 |

## Not included (could not be verified)
- EconPlayground (https://econplayground.mathforeconomists.org): connection fails; EconGraphs and the native macro model cover economics. OpenMacro has no web version we could find, so the native macro model is used.
- BizSim (bizsim.com 502, bizsim.in unreachable), The Slingshot (Cloudflare challenge blocks non-browser requests, 403), OpenLabs (no site with simulations found; openlabs.org says "Coming Soon"). Add them to `simCatalogue` once a working URL is confirmed.

## Offline behaviour
Bundled and native sims work with no internet (map tiles excepted). An online sim first checks reachability and, with
no internet, shows a plain message instead of a blank page; the list shows an Offline or Online badge and a
"Works offline" filter. Pins are stored per board page (`simhub.pins` in shared preferences).
