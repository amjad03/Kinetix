import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'astronomy.dart';
import 'chemistry.dart';
import 'model.dart';
import 'model_viewer.dart';
import 'solid_explorer.dart';
import 'solids.dart';
import 'viewer/annotations.dart';
import 'viewer/catalogue_info.dart';
import 'viewer/engine.dart';
import 'viewer/manifest.dart';
import 'viewer/snapshot.dart';
import 'viewer/strings.dart';
import 'viewer/viewer.dart';

/// One entry in the model catalogue. Ids are stable: the content library links topics to
/// them (TopicResource kind 'model3d') and imported lessons refer to them.
///
/// Two kinds: models drawn by the pure-Dart renderer here (the solids with their live
/// measurements, a few molecules, the Solar System), and models shown by the three.js
/// viewer ([viewerId]: anatomy, cells, physics, chemistry…). An entry can be both: then
/// the viewer shows it where there is a WebView and the Dart renderer everywhere else.
class ModelEntry {
  const ModelEntry({
    required this.id,
    required this.title,
    required this.subjects,
    required this.levels,
    this.solid,
    this.build,
    this.titles,
    this.classes = const [],
    this.keywords = const [],
    this.viewerId,
    this.variant,
    this.listed = true,
  });

  /// A three.js viewer model, under its own id.
  factory ModelEntry.viewer(ViewerModelInfo m) => ModelEntry(
    id: m.id,
    title: m.title.en,
    titles: m.title,
    subjects: [m.subject],
    levels: [for (final c in m.classes) 'Class $c'],
    classes: m.classes,
    keywords: m.keywords,
    viewerId: m.id,
  );

  final String id;

  /// The English title (see [titleIn] for Hindi and Kannada).
  final String title;
  final List<String> subjects;

  /// Class or course tags, e.g. 'CBSE 10', 'Class 9'.
  final List<String> levels;

  /// Set for solids: shown with dimension sliders and measurements.
  final SolidKind? solid;

  /// Builds the model for the Dart renderer.
  final Model3D Function()? build;

  /// The title in en, hi and kn, where known.
  final LocalText? titles;

  /// The classes (school years) it is used in.
  final List<int> classes;
  final List<String> keywords;

  /// The three.js viewer model that shows this entry, and the version to start on.
  final String? viewerId;
  final String? variant;

  /// Whether pickers list it. Unlisted entries are older ids kept working for links.
  final bool listed;

  bool get usesViewer => viewerId != null;

  /// Whether the Dart renderer can draw it (no WebView needed).
  bool get native => solid != null || build != null;

  String titleIn(String lang) => titles?.of(lang) ?? title;

  Model3D buildModel() => solid != null ? Solid(solid!).toModel() : build!();

  /// The viewer model's details (summary, keywords, picture), if it has one.
  ViewerModelInfo? get info => viewerId == null ? null : ViewerModelInfo.byId(viewerId!);
}

/// Every built-in model: solids drawn here, and the three.js viewer's models (no downloads).
abstract final class ModelCatalogue {
  static final List<ModelEntry> all = [
    for (final k in SolidKind.values)
      ModelEntry(
        id: k.id,
        title: k.title,
        subjects: const ['Maths'],
        levels: k == SolidKind.triangularPrism || k == SolidKind.squarePyramid || k == SolidKind.tetrahedron
            ? const ['Class 8', 'Class 10']
            : const ['CBSE 9', 'CBSE 10'],
        classes: k == SolidKind.triangularPrism || k == SolidKind.squarePyramid || k == SolidKind.tetrahedron ? const [8, 10] : const [9, 10],
        solid: k,
      ),
    for (final m in ViewerModelInfo.all) ModelEntry.viewer(m),
    // The first catalogue's ids, kept for the lessons that link them: the viewer shows the
    // same thing in more detail where it can, the Dart renderer everywhere else.
    const ModelEntry(id: 'chem.water', title: 'Water molecule (H₂O)', subjects: ['Chemistry'], levels: ['Class 9', 'CBSE 10'], build: ChemistryModels.water, viewerId: 'molecules', variant: 'h2o', listed: false),
    const ModelEntry(id: 'chem.methane', title: 'Methane (CH₄)', subjects: ['Chemistry'], levels: ['CBSE 10'], build: ChemistryModels.methane, viewerId: 'molecules', variant: 'ch4', listed: false),
    const ModelEntry(id: 'chem.co2', title: 'Carbon dioxide (CO₂)', subjects: ['Chemistry'], levels: ['CBSE 10'], build: ChemistryModels.carbonDioxide, viewerId: 'molecules', variant: 'co2', listed: false),
    const ModelEntry(id: 'chem.nacl', title: 'Sodium chloride lattice (NaCl)', subjects: ['Chemistry'], levels: ['CBSE 10'], build: ChemistryModels.sodiumChloride, viewerId: 'crystal_lattices', variant: 'nacl', listed: false),
    const ModelEntry(id: 'astro.solar-system', title: 'The Solar System', subjects: ['Science', 'Geography'], levels: ['Class 6', 'Class 8'], build: AstronomyModels.solarSystem, viewerId: 'solar_system', listed: false),
    const ModelEntry(id: 'astro.earth', title: 'The Earth: tilt, day and night', subjects: ['Geography', 'Science'], levels: ['Class 6', 'Class 9'], build: AstronomyModels.earth, viewerId: 'seasons', listed: false),
  ];

  /// The models pickers list, in library order.
  static List<ModelEntry> get entries => [for (final e in all) if (e.listed) e];

  /// Any model by id, listed or not.
  static ModelEntry? byId(String id) => all.where((e) => e.id == id).firstOrNull;

  static List<String> get ids => [for (final e in entries) e.id];

  /// The ids the Dart renderer draws (no WebView needed).
  static List<String> get nativeIds => [for (final e in all) if (e.native) e.id];

  /// The best listed model for a topic or question, if any fits.
  static ModelEntry? bestFor(String text) {
    final m = ViewerModelInfo.bestFor(text);
    return m == null ? null : byId(m.id);
  }
}

/// The catalogue's listed models (the board's "open model" list).
List<ModelEntry> get modelCatalogue => ModelCatalogue.entries;

/// Shows a catalogue model by id: a [SolidExplorer] for solids, the three.js
/// [Model3dViewer] for viewer models, and the Dart [ModelViewer] where there is no WebView.
class ModelView extends StatefulWidget {
  const ModelView({super.key, required this.id, this.onSnapshot, this.mirror, this.lang, this.showTitle = false, this.annotations, this.onAnnotationsChanged});
  final String id;

  /// "Put on board" (falls back to a [Model3dScope] above).
  final ValueChanged<Model3dSnapshot>? onSnapshot;
  final Model3dMirror? mirror;
  final String? lang;

  /// Whether the viewer shows the title (the board's split panel already does).
  final bool showTitle;

  /// Notes and drawing to put on a viewer model, and where changes to them go
  /// ([Model3dViewer.annotations], [Model3dViewer.onAnnotationsChanged]).
  final Model3dAnnotations? annotations;
  final ValueChanged<Model3dAnnotations>? onAnnotationsChanged;

  @override
  State<ModelView> createState() => _ModelViewState();
}

class _ModelViewState extends State<ModelView> {
  Model3D? _model;
  String? _builtFor;

  @override
  Widget build(BuildContext context) {
    final entry = ModelCatalogue.byId(widget.id);
    if (entry == null) {
      return KxEmptyState(icon: Icons.view_in_ar_outlined, message: Viewer3dStrings(widget.lang ?? viewerLangOf(context)).unknownModel(widget.id));
    }
    if (entry.solid != null) return SolidExplorer(kind: entry.solid!);
    if (entry.usesViewer && (Viewer3dEngine.available || !entry.native)) {
      return Model3dViewer(
        key: ValueKey('${entry.viewerId}/${entry.variant}'),
        modelId: entry.viewerId!,
        variant: entry.variant,
        lang: widget.lang,
        onSnapshot: widget.onSnapshot,
        mirror: widget.mirror,
        showTitle: widget.showTitle,
        annotations: widget.annotations,
        onAnnotationsChanged: widget.onAnnotationsChanged,
      );
    }
    if (_builtFor != entry.id) {
      _model = entry.buildModel();
      _builtFor = entry.id;
    }
    return ModelViewer(model: _model!);
  }
}
