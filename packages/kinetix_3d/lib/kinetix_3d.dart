/// KINETIX 3D: the three.js viewer for the teaching models (anatomy, cells, physics,
/// chemistry, geography, space, solids with nets) in a WebView on Android and Windows,
/// with labels in English, Hindi and Kannada, a laser pointer and snapshots for the
/// board; and a small pure-Dart software 3D engine (solids with live measurements,
/// procedural science models, a minimal glTF binary loader) for everywhere else.
library;

export 'src/astronomy.dart' show AstronomyModels;
export 'src/catalogue.dart';
export 'src/chemistry.dart';
export 'src/earth_map.dart' show isLand, earthColor;
export 'src/glb.dart';
export 'src/math3d.dart';
export 'src/mesh.dart';
export 'src/model.dart';
export 'src/model_viewer.dart';
export 'src/primitives.dart';
export 'src/renderer.dart';
export 'src/solid_explorer.dart';
export 'src/solids.dart';
export 'src/viewer/catalogue_info.dart';
export 'src/viewer/credits.dart';
export 'src/viewer/engine.dart';
export 'src/viewer/laser.dart';
export 'src/viewer/library.dart';
export 'src/viewer/manifest.dart';
export 'src/viewer/protocol.dart';
export 'src/viewer/snapshot.dart';
export 'src/viewer/strings.dart';
export 'src/viewer/viewer.dart';
