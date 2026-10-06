import 'anims/cells.dart';
import 'anims/chemistry.dart';
import 'anims/cycles.dart';
import 'anims/earth.dart';
import 'anims/flows.dart';
import 'anims/life_processes.dart';
import 'anims/photosynthesis.dart';
import 'anims/physics.dart';
import 'model.dart';

/// The animations shown as narrated 3D scenes: animation id → scene id (a kinetix_3d
/// ProcessScene). The panel opens these in the 3D viewer when the app gives it a
/// [SceneOpener]; the 2D drawing stays as the fallback.
const scene3dIds = <String, String>{
  'photosynthesis': 'photosynthesis',
};

/// Every animation, in the order the panel lists them.
final List<KxAnimation> animationCatalogue = List.unmodifiable(<KxAnimation>[
  for (final a in _drawn) scene3dIds[a.id] == null ? a : a.asScene(scene3dIds[a.id]!),
]);

final _drawn = <KxAnimation>[
  photosynthesis,
  respiration,
  heart,
  breathing,
  digestion,
  nerveImpulse,
  mitosis,
  meiosis,
  dnaReplication,
  proteinSynthesis,
  osmosis,
  nitrogenCycle,
  carbonCycle,
  waterCycle,
  rockCycle,
  earthquake,
  volcano,
  dayNightSeasons,
  moonPhases,
  eclipses,
  circuit,
  generator,
  waves,
  refraction,
  statesOfMatter,
  atomicStructure,
  electrolysis,
  circularFlow,
  packetSwitching,
];

/// The animation with [id], if any.
KxAnimation? animationById(String id) => animationCatalogue.where((a) => a.id == id).firstOrNull;
