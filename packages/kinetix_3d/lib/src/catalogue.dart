import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'astronomy.dart';
import 'chemistry.dart';
import 'model.dart';
import 'model_viewer.dart';
import 'procedural_library.dart';
import 'solid_explorer.dart';
import 'solids.dart';
import 'viewer/annotations.dart';
import 'viewer/catalogue_info.dart';
import 'viewer/engine.dart';
import 'viewer/manifest.dart';
import 'viewer/remote_models.dart';
import 'viewer/scenes.dart';
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
    this.buildLang,
    this.topic,
    this.remote,
    this.keywordsMore = const [],
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

  /// Builds the model with its labels in a language (en, hi, kn): the procedural library.
  final Model3D Function(String lang)? buildLang;

  /// The class-context model topic (`machine`, `optics`, `landform`...), see ToolProfile.models.
  final String? topic;

  /// Set for models that are downloaded on first use.
  final RemoteModelInfo? remote;
  final List<String> keywordsMore;

  /// A downloadable model.
  factory ModelEntry.downloadable(RemoteModelInfo m) => ModelEntry(
    id: 'dl.${m.id}',
    title: m.title.en,
    titles: m.title,
    subjects: [m.subject],
    levels: [for (final c in m.classes) 'Class $c'],
    classes: m.classes,
    keywords: m.keywords,
    topic: m.topic,
    remote: m,
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
  bool get native => solid != null || build != null || buildLang != null;

  String titleIn(String lang) => titles?.of(lang) ?? title;

  Model3D buildModel([String lang = 'en']) => solid != null ? Solid(solid!).toModel() : buildLang != null ? buildLang!(lang) : build!();

  /// The viewer model's details (summary, keywords, picture), if it has one.
  ViewerModelInfo? get info => viewerId == null ? null : ViewerModelInfo.byId(viewerId!);
}

/// Every built-in model: solids drawn here, and the three.js viewer's models (no downloads).
Model3D _convex(String lang) => ProceduralModels.optics(lang, convex: true);
Model3D _concave(String lang) => ProceduralModels.optics(lang, convex: false);

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
    // Procedural teaching models (KINETIX-made; see docs/licensing/3D_MODELS.md).
    ModelEntry(id: 'proc.gears', title: 'Gears and gear train', titles: LocalText({'en': 'Gears and gear train', 'hi': 'गियर और गियर-गाड़ी', 'kn': 'ಗೇರ್‌ಗಳು ಮತ್ತು ಗೇರ್ ಸರಣಿ'}), subjects: ['Engineering'], levels: ['Class 8', 'Class 11'], classes: [8, 9, 11], keywords: ['gear', 'gears', 'gear ratio', 'machines', 'speed ratio', 'torque'], topic: 'machine', buildLang: ProceduralModels.gears),
    ModelEntry(id: 'proc.engine', title: 'Four-stroke engine', titles: LocalText({'en': 'Four-stroke engine', 'hi': 'चार-स्ट्रोक इंजन', 'kn': 'ನಾಲ್ಕು-ಸ್ಟ್ರೋಕ್ ಎಂಜಿನ್'}), subjects: ['Engineering'], levels: ['Class 11', 'Class 12'], classes: [10, 11, 12], keywords: ['engine', 'petrol engine', 'piston', 'crankshaft', 'internal combustion', 'four stroke', 'valves'], topic: 'machine', buildLang: ProceduralModels.engine),
    ModelEntry(id: 'proc.optics-convex', title: 'Convex lens bench', titles: LocalText({'en': 'Convex lens bench', 'hi': 'उत्तल लेंस बेंच', 'kn': 'ಪೀನ ಮಸೂರ ಬೆಂಚ್'}), subjects: ['Physics'], levels: ['Class 10', 'Class 12'], classes: [10, 12], keywords: ['lens', 'convex lens', 'optics', 'ray diagram', 'image formation', 'focal length', 'light'], topic: 'optics', buildLang: _convex),
    ModelEntry(id: 'proc.optics-concave', title: 'Concave lens bench', titles: LocalText({'en': 'Concave lens bench', 'hi': 'अवतल लेंस बेंच', 'kn': 'ನಿಮ್ನ ಮಸೂರ ಬೆಂಚ್'}), subjects: ['Physics'], levels: ['Class 10', 'Class 12'], classes: [10, 12], keywords: ['lens', 'concave lens', 'optics', 'ray diagram', 'virtual image', 'light'], topic: 'optics', buildLang: _concave),
    ModelEntry(id: 'proc.lab-apparatus', title: 'Laboratory apparatus', titles: LocalText({'en': 'Laboratory apparatus', 'hi': 'प्रयोगशाला के उपकरण', 'kn': 'ಪ್ರಯೋಗಾಲಯದ ಉಪಕರಣಗಳು'}), subjects: ['Chemistry'], levels: ['Class 6', 'Class 9', 'Class 11'], classes: [6, 7, 8, 9, 11], keywords: ['beaker', 'flask', 'test tube', 'burette', 'bunsen burner', 'retort stand', 'lab equipment', 'titration', 'apparatus'], topic: 'lab', buildLang: ProceduralModels.labApparatus),
    ModelEntry(id: 'proc.globe', title: 'Globe', titles: LocalText({'en': 'Globe', 'hi': 'ग्लोब', 'kn': 'ಭೂಗೋಳ'}), subjects: ['Geography'], levels: ['Class 6', 'Class 7'], classes: [6, 7, 9], keywords: ['globe', 'equator', 'latitude', 'longitude', 'axis', 'poles', 'tropic of cancer', 'earth'], topic: 'earth', buildLang: ProceduralModels.globe),
    ModelEntry(id: 'proc.landforms', title: 'Landforms', titles: LocalText({'en': 'Landforms', 'hi': 'भू-आकृतियाँ', 'kn': 'ಭೂರೂಪಗಳು'}), subjects: ['Geography'], levels: ['Class 6', 'Class 7', 'Class 9'], classes: [6, 7, 9], keywords: ['landform', 'mountain', 'valley', 'plateau', 'delta', 'river', 'relief', 'physical features'], topic: 'earth', buildLang: ProceduralModels.landforms),
    ModelEntry(id: 'proc.virus', title: 'Virus', titles: LocalText({'en': 'Virus', 'hi': 'विषाणु', 'kn': 'ವೈರಸ್'}), subjects: ['Biology'], levels: ['Class 8', 'Class 9', 'Class 11'], classes: [8, 9, 11], keywords: ['virus', 'coronavirus', 'spike protein', 'microbes', 'disease', 'rna'], topic: 'cell', buildLang: ProceduralModels.virus),
    ModelEntry(id: 'proc.teeth', title: 'Teeth', titles: LocalText({'en': 'Teeth', 'hi': 'दाँत', 'kn': 'ಹಲ್ಲುಗಳು'}), subjects: ['Biology'], levels: ['Class 5', 'Class 7', 'Class 10'], classes: [5, 7, 10], keywords: ['teeth', 'tooth', 'incisor', 'canine', 'premolar', 'molar', 'digestion', 'dentition'], topic: 'human', buildLang: ProceduralModels.teeth),
    ModelEntry(id: 'proc.skull', title: 'Human skull', titles: LocalText({'en': 'Human skull', 'hi': 'मानव खोपड़ी', 'kn': 'ಮಾನವ ತಲೆಬುರುಡೆ'}), subjects: ['Biology'], levels: ['Class 7', 'Class 11'], classes: [7, 11], keywords: ['skull', 'cranium', 'jaw', 'mandible', 'skeleton', 'bones', 'head'], topic: 'human', buildLang: ProceduralModels.skull),
    ModelEntry(id: 'proc.taj-mahal', title: 'Taj Mahal', titles: LocalText({'en': 'Taj Mahal, Agra', 'hi': 'ताजमहल, आगरा', 'kn': 'ತಾಜ್ ಮಹಲ್, ಆಗ್ರಾ'}), subjects: ['History'], levels: ['Class 7', 'Class 12'], classes: [7, 12], keywords: ['taj mahal', 'mughal', 'shah jahan', 'monument', 'architecture', 'agra', 'tomb'], topic: 'monument', buildLang: ProceduralModels.tajMahal),
    ModelEntry(id: 'proc.qutub-minar', title: 'Qutub Minar', titles: LocalText({'en': 'Qutub Minar, Delhi', 'hi': 'क़ुतुब मीनार, दिल्ली', 'kn': 'ಕುತುಬ್ ಮಿನಾರ್, ದೆಹಲಿ'}), subjects: ['History'], levels: ['Class 7'], classes: [7], keywords: ['qutub minar', 'qutb', 'delhi sultanate', 'aibak', 'monument', 'minaret', 'architecture'], topic: 'monument', buildLang: ProceduralModels.qutubMinar),
    ModelEntry(id: 'proc.india-gate', title: 'India Gate', titles: LocalText({'en': 'India Gate, New Delhi', 'hi': 'इंडिया गेट, नई दिल्ली', 'kn': 'ಇಂಡಿಯಾ ಗೇಟ್, ನವದೆಹಲಿ'}), subjects: ['History'], levels: ['Class 8', 'Class 10'], classes: [8, 10], keywords: ['india gate', 'war memorial', 'world war', 'delhi', 'monument', 'amar jawan jyoti'], topic: 'monument', buildLang: ProceduralModels.indiaGate),
    ModelEntry(id: 'proc.konark', title: 'Konark Sun Temple', titles: LocalText({'en': 'Sun Temple, Konark', 'hi': 'सूर्य मंदिर, कोणार्क', 'kn': 'ಸೂರ್ಯ ದೇವಾಲಯ, ಕೋನಾರ್ಕ್'}), subjects: ['History'], levels: ['Class 6', 'Class 7'], classes: [6, 7], keywords: ['konark', 'sun temple', 'odisha', 'temple architecture', 'monument', 'chariot', 'sundial'], topic: 'monument', buildLang: ProceduralModels.konark),
    for (final m in RemoteModels.all) ModelEntry.downloadable(m),
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
    // A narrated scene ("scene:<id>", as its pictures on the board link back to it).
    final scene = ProcessScene.byId(Viewer3dEngine.sceneOf(widget.id));
    if (scene != null) {
      return Model3dViewer(
        key: ValueKey(widget.id),
        sceneId: scene.id,
        lang: widget.lang,
        onSnapshot: widget.onSnapshot,
        mirror: widget.mirror,
        showTitle: widget.showTitle,
        annotations: widget.annotations,
        onAnnotationsChanged: widget.onAnnotationsChanged,
      );
    }
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
    final remote = entry.remote;
    if (remote != null) {
      return RemoteModelView(key: ValueKey(entry.id), info: remote, cache: RemoteModels.cache, lang: widget.lang ?? viewerLangOf(context));
    }
    final lang = widget.lang ?? viewerLangOf(context);
    if (_builtFor != '${entry.id}/$lang') {
      _model = entry.buildModel(lang);
      _builtFor = '${entry.id}/$lang';
    }
    return ModelViewer(model: _model!);
  }
}
