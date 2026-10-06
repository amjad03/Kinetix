/// KINETIX animations: offline, procedurally drawn science animations for the Board's panel,
/// with stepped captions in English, Hindi and Kannada.
library;

export 'src/catalogue.dart' show animationCatalogue, animationById, scene3dIds;
export 'src/draw.dart' show AnimPainter;
export 'src/model.dart';
export 'src/panel.dart' show AnimationsPanel, SceneOpener;
export 'src/player.dart' show AnimationPlayer, renderAnimationPng;
