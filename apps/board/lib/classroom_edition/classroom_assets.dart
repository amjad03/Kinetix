/// What of the board's bundled sims and 3D models the Classroom edition's APK carries.
///
/// Zynetix Classroom ships only what its PUC lessons use: the PhET sims and the 3D viewer models
/// that some lesson step shows (assets/lessons/puc, plus the School overlays in
/// assets/private/lessons when they are built). JupyterLite (Python in a browser page) is left
/// out: no lesson opens it, and the CS lessons run Python in the board's own code lab
/// (kinetix_cs). The KINETIX Board carries everything, unchanged.
///
/// The lists between the markers are written by
/// `CLASSROOM_ASSETS_WRITE=1 flutter test test/classroom_edition/classroom_assets_test.dart`,
/// which also fails when a lesson starts using something not listed here.
/// android/app/build.gradle.kts reads the same lists and leaves the rest out of the
/// Classroom APK (copyFlutterAssets* excludes); the app hides what is left out (the Sims hub's
/// entries, the 3D library's models), see [classroomHasSim] and main.dart.
library;

// classroom-assets:phet:begin
/// The PhET sims the lessons use (`assets/simhub/phet/<id>.html`).
const classroomPhetSims = <String>{
  'balloons-and-static-electricity',
  'charges-and-fields',
  'faradays-law',
  'geometric-optics',
  'graphing-lines',
  'graphing-quadratics',
  'least-squares-regression',
  'magnet-and-compass',
  'molarity',
  'molecule-shapes',
  'neuron',
  'ph-scale',
  'plinko-probability',
  'projectile-motion',
  'vector-addition',
  'wave-on-a-string',
};
// classroom-assets:phet:end

// classroom-assets:models:begin
/// The 3D viewer models the lessons use (kinetix_3d `assets/viewer3d/models/<id>.glb` and `.json`).
const classroomViewerModels = <String>{
  'ac_generator',
  'animal_cell',
  'atoms',
  'bar_magnet',
  'brain',
  'crystal_lattices',
  'digestive',
  'dna',
  'ear',
  'earth_layers',
  'electric_circuit',
  'electric_motor',
  'engine',
  'excretory',
  'eye',
  'flower',
  'gears',
  'globe',
  'heart',
  'hybridisation',
  'kidney',
  'lab_apparatus',
  'lens_bench',
  'lungs',
  'microscope',
  'molecules',
  'nephron',
  'neuron',
  'orbitals',
  'plant_cell',
  'prism',
  'seasons',
  'simple_machines',
  'skeleton',
  'skull',
  'solar_system',
  'solids',
  'transformer',
  'virus',
};
// classroom-assets:models:end

// classroom-assets:dropped:begin
/// Bundled sims the Classroom edition leaves out whole (`assets/simhub/<dir>/`).
const classroomDroppedSimDirs = <String>{
  'jupyterlite',
};
// classroom-assets:dropped:end

/// Whether the Classroom APK carries a Sims hub entry's bundled page ([asset] as in
/// `SimEntry.asset`: "phet/ohms-law.html", "jupyterlite/repl/index.html?…"). Online and native
/// entries carry nothing, so they are always there.
bool classroomHasSim(String? asset) {
  if (asset == null) return true;
  final dir = asset.split('/').first;
  if (classroomDroppedSimDirs.contains(dir)) return false;
  if (dir == 'phet') return classroomPhetSims.contains(asset.substring(5).split('.html').first);
  return true;
}
