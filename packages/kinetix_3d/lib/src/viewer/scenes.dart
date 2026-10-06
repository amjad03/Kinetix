import 'manifest.dart';

part 'scene_catalogue_data.dart';

/// One step of a narrated process scene: the camera flies to a framing, parts light up
/// and are named, and [caption] tells what is happening (read aloud when asked).
class ProcessSceneStep {
  const ProcessSceneStep({
    required this.id,
    required this.stage,
    required this.seconds,
    required this.title,
    required this.caption,
    this.highlight = const [],
    this.labels = const [],
  });

  final String id;

  /// Where in the scene the step is (the leaf, the cell, the chloroplast…); moving to
  /// another stage dips the picture between them.
  final String stage;

  /// How long the step plays at 1× speed.
  final double seconds;
  final LocalText title;
  final LocalText caption;

  /// The parts that light up.
  final List<String> highlight;

  /// The parts named on screen.
  final List<String> labels;

  /// The title and caption together, for reading aloud.
  String spoken(String lang) => '${title.of(lang)}. ${caption.of(lang)}';
}

/// A narrated 3D process animation (photosynthesis, the heart's cycle, the water cycle…)
/// in the three.js viewer: a timeline of [steps] with captions in English, Hindi and
/// Kannada. Open one with `Model3dViewer(sceneId: id)`. Ids are stable (the animations
/// catalogue and lessons refer to them).
///
/// The scenes are written in tool/models/src/scenes/*.js; tool/models/write_scenes.mjs
/// writes this catalogue from them (scene_catalogue_data.dart).
class ProcessScene {
  const ProcessScene({
    required this.id,
    required this.subject,
    required this.title,
    required this.summary,
    required this.groups,
    required this.parts,
    required this.steps,
    this.classes = const [],
    this.keywords = const [],
  });

  final String id;

  /// Biology, Geography or Space.
  final String subject;
  final LocalText title;
  final LocalText summary;
  final List<int> classes;
  final List<String> keywords;
  final List<ViewerGroup> groups;

  /// What can be tapped, named, pointed at and written on.
  final List<ViewerPart> parts;
  final List<ProcessSceneStep> steps;

  /// Every scene, in the order they were made.
  static List<ProcessScene> get all => processScenes;

  /// The scene with [id], if any.
  static ProcessScene? byId(String? id) => id == null ? null : processScenes.where((s) => s.id == id).firstOrNull;

  /// The whole timeline at 1× speed, in seconds.
  double get seconds => steps.fold(0, (t, s) => t + s.seconds);

  /// When step [i] begins, in seconds from the start.
  double startOf(int i) {
    var t = 0.0;
    for (var k = 0; k < i.clamp(0, steps.length); k++) {
      t += steps[k].seconds;
    }
    return t;
  }

  /// The step playing at [seconds] from the start.
  int stepAt(double seconds) {
    var t = 0.0;
    for (var i = 0; i < steps.length; i++) {
      t += steps[i].seconds;
      if (seconds < t) return i;
    }
    return steps.length - 1;
  }

  /// The library picture.
  String get thumbAsset => 'packages/kinetix_3d/$viewerAssets/thumbs/scene_$id.jpg';

  /// The scene as the viewer's controls see a model: its parts and groups (no ready-made
  /// cuts, views or take-apart; the timeline replaces the model's animations).
  ViewerManifest toManifest() => ViewerManifest(
    id: id,
    subject: subject,
    title: title,
    summary: summary,
    credit: 'Scene built by KINETIX',
    size: 1,
    groups: groups,
    parts: parts,
    views: const [],
    slices: const [],
    animations: const [],
    canTakeApart: false,
  );

  bool matches(String query) {
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return true;
    final hay = [...title.byLang.values, subject, ...keywords].join(' ').toLowerCase();
    return q.split(RegExp(r'\s+')).every(hay.contains);
  }
}
