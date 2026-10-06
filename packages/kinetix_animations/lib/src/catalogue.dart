import 'anims/cells.dart';
import 'anims/cycles.dart';
import 'anims/earth.dart';
import 'anims/life_processes.dart';
import 'anims/photosynthesis.dart';
import 'model.dart';

/// Every animation, in the order the panel lists them.
final List<KxAnimation> animationCatalogue = List.unmodifiable(<KxAnimation>[
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
]);

/// The animation with [id], if any.
KxAnimation? animationById(String id) => animationCatalogue.where((a) => a.id == id).firstOrNull;
