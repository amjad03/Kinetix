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
]);

/// The animation with [id], if any.
KxAnimation? animationById(String id) => animationCatalogue.where((a) => a.id == id).firstOrNull;
