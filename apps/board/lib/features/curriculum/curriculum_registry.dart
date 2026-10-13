import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart' show BoardBackground;

import '../../core/models.dart';
import '../board/kit/subjects.dart';

/// The class and subject the board is set up for: every level from Class 1 to 12, the college
/// programmes (MBA, B.E./B.Tech branches) and the postgraduate ones (M.Tech), each with its
/// subjects, and for each subject what the board brings: the drawer tools pinned first, the two
/// tools on the panel's toolbar, the paper of a new page, the kits, labs, sims and 3D models
/// worth suggesting, and the accent colour.
///
/// **Extending it.** A subject lists its features as `kind:ref` ids:
///
/// * `tool:<id>` a Tools drawer tile (board_screen.dart `_drawerTools`, lib/features/extras),
/// * `kit:<KitTab>` a tab of the subject kit (kit/subjects.dart),
/// * `lab:<id>` a lab (packages/kinetix_labs `LabCatalogue`),
/// * `model:<id>` a 3D model (packages/kinetix_3d `ModelCatalogue`),
/// * `phet:<id>` a PhET sim (assets/phet/catalogue.json), `sim:<SimKind>` a built-in sim,
/// * `soon:<id>` a kit that is not built yet: it shows as a tile marked for a later update.
///
/// To ship a `soon:` kit, build it as a drawer tool (or kit tab), then change its id here from
/// `soon:x` to `tool:x` (or `kit:x`) and drop it from [CurriculumRegistry.upcoming] and from
/// `upcomingTitle` (curriculum_picker.dart). test/curriculum_registry_test.dart checks that every
/// id resolves to a real feature or to an upcoming one.
enum CurriculumStage { school, college, postgrad }

enum FeatureKind { tool, kit, lab, model, phet, sim, upcoming }

/// One feature a subject brings, resolved from its `kind:ref` id.
class CurriculumFeature {
  const CurriculumFeature(this.id, this.kind, this.ref);

  final String id;
  final FeatureKind kind;
  final String ref;

  bool get available => kind != FeatureKind.upcoming;

  KitTab? get kitTab => kind == FeatureKind.kit ? KitTab.values.asNameMap()[ref] : null;

  IconData get icon => switch (kind) {
    FeatureKind.tool => Icons.handyman_outlined,
    FeatureKind.kit => Icons.backpack_outlined,
    FeatureKind.lab => Icons.science_outlined,
    FeatureKind.model => Icons.view_in_ar_outlined,
    FeatureKind.phet || FeatureKind.sim => Icons.science,
    FeatureKind.upcoming => CurriculumRegistry.upcoming[ref] ?? Icons.construction_outlined,
  };
}

/// A subject of a level: Science in Class 7, Structural Analysis in B.E. Civil semester 5.
class CurriculumSubject {
  const CurriculumSubject(this.id, this.name, this.base, {this.semester, this.features = const [], this.paper, this.localised = false});

  final String id;

  /// As the timetable and syllabus name it ("Structural Analysis"). Subject names are not
  /// translated (docs/i18n/board.md), except the general ones in [localised].
  final String name;

  /// The board subject it is taught like: its kit, AI order, ink and tool profile.
  final Subject base;
  final int? semester;

  /// `kind:ref` ids, best first (see the library comment).
  final List<String> features;

  /// The paper of a new page; the subject's own ([SubjectStyle.paper]) when null.
  final BoardBackground? paper;

  /// Whether [name] is the board subject's own name, shown in the board's language.
  final bool localised;
}

/// A class (Class 7) or a programme (B.E. Civil) and its subjects.
class CurriculumLevel {
  const CurriculumLevel({required this.id, required this.stage, required this.subjects, this.grade, this.name, this.accent, this.keywords = const []});

  final String id;
  final CurriculumStage stage;
  final List<CurriculumSubject> subjects;

  /// 1..12 for a school class.
  final int? grade;

  /// The programme's name ("B.E. Civil"); school classes are named by [grade].
  final String? name;

  /// The programme's colour (tone 40: white text on it, readable on white). School classes use
  /// the subject's own.
  final Color? accent;

  /// Words that start words of a timetable's section and subject names and, all together, mean
  /// this programme (lower case): `mech` finds "B.E. Mechanical Sem 5".
  final List<String> keywords;

  CurriculumSubject? subject(String id) => subjects.where((s) => s.id == id).firstOrNull;
}

/// A level and one of its subjects: what the board is set up for.
class CurriculumChoice {
  const CurriculumChoice(this.level, this.subject);

  final CurriculumLevel level;
  final CurriculumSubject subject;

  /// `class-7/science`, saved on the board.
  String get id => '${level.id}/${subject.id}';

  SubjectStyle get baseStyle => subjectStyles[subject.base]!;

  BoardBackground get paper => subject.paper ?? baseStyle.paper;
  Color get accent => level.accent ?? baseStyle.accent;

  List<CurriculumFeature> get features => [for (final f in subject.features) CurriculumRegistry.resolve(f)];

  /// Drawer tools pinned first in Tools.
  List<String> get quickTools => [for (final f in features) if (f.kind == FeatureKind.tool) f.ref];

  /// The two tools that join a panel's toolbar (where the laser and redo sit by default).
  List<String> get toolbar => quickTools.take(2).toList();

  List<KitTab> get kitTabs => [for (final f in features) ?f.kitTab];
  Set<String> get sims => {for (final f in features) if (f.kind == FeatureKind.sim) f.ref};
  List<String> get labs => [for (final f in features) if (f.kind == FeatureKind.lab) f.ref];
  List<String> get models => [for (final f in features) if (f.kind == FeatureKind.model) f.ref];
  List<String> get phet => [for (final f in features) if (f.kind == FeatureKind.phet) f.ref];

  /// The name the libraries, catalogues and AI filter by: the school subject's own name, or in
  /// college the board subject it is taught like ("Structural Analysis" finds physics content).
  String get filterName => level.stage == CurriculumStage.school ? subject.name : _baseNames[subject.base]!;

  /// The board's look for this choice: the base subject's style with this level's accent, the
  /// subject's paper and its kit tabs.
  SubjectStyle get style => SubjectStyle(
    subject: subject.base,
    icon: baseStyle.icon,
    accent: accent,
    paper: paper,
    tools: baseStyle.tools,
    aiFirst: baseStyle.aiFirst,
    tabs: [...baseStyle.tabs, ...kitTabs.where((t) => !baseStyle.tabs.contains(t))],
  );
}

const _baseNames = <Subject, String>{
  Subject.maths: 'Mathematics', Subject.physics: 'Physics', Subject.chemistry: 'Chemistry', Subject.biology: 'Biology', Subject.science: 'Science', //
  Subject.evs: 'EVS', Subject.geography: 'Geography', Subject.history: 'History', Subject.civics: 'Civics', Subject.commerce: 'Commerce',
  Subject.management: 'Management', Subject.law: 'Law', Subject.statistics: 'Statistics', Subject.english: 'English', Subject.languages: 'Languages',
  Subject.computer: 'Computer Science', Subject.art: 'Art', Subject.general: 'General',
};

abstract final class CurriculumRegistry {
  /// Kits not built yet, shown as tiles marked for a later update. Their names are
  /// `upcomingTitle` (curriculum_picker.dart).
  static const upcoming = <String, IconData>{};

  static CurriculumFeature resolve(String id) {
    final i = id.indexOf(':');
    final kind = i < 0 ? null : _kinds[id.substring(0, i)];
    return CurriculumFeature(id, kind ?? FeatureKind.upcoming, i < 0 ? id : id.substring(i + 1));
  }

  static const _kinds = {'tool': FeatureKind.tool, 'kit': FeatureKind.kit, 'lab': FeatureKind.lab, 'model': FeatureKind.model, 'phet': FeatureKind.phet, 'sim': FeatureKind.sim, 'soon': FeatureKind.upcoming};

  static final List<CurriculumLevel> levels = [for (var g = 1; g <= 12; g++) _school(g), ..._college, ..._postgrad];

  static List<CurriculumLevel> of(CurriculumStage s) => [for (final l in levels) if (l.stage == s) l];

  static CurriculumLevel? level(String id) => levels.where((l) => l.id == id).firstOrNull;

  /// The choice saved as [id] (`level/subject`), or null when this board does not know it.
  static CurriculumChoice? choice(String? id) {
    final parts = (id ?? '').split('/');
    if (parts.length != 2) return null;
    final l = level(parts[0]);
    final s = l?.subject(parts[1]);
    return l == null || s == null ? null : CurriculumChoice(l, s);
  }

  /// The choice the timetabled class means: "Class 7 A" with "Mathematics", "II PUC" with
  /// "Physics", "B.E. Civil Sem 5" with "Structural Analysis". Null when the level or subject is
  /// not one of these.
  static CurriculumChoice? match(SessionContext? s) {
    if (s == null || (s.subjectName ?? '').trim().isEmpty) return null;
    final section = (s.sectionName ?? '').toLowerCase();
    final subjectName = s.subjectName!.toLowerCase();
    CurriculumLevel? lvl;
    final schoolish = s.programLevel == null || s.programLevel == 'k12' || s.programLevel == 'pu';
    if (schoolish) {
      final g = s.classTerm ?? int.tryParse(RegExp(r'(?:class|grade|std\.?|standard)\s*(\d{1,2})').firstMatch(section)?[1] ?? '');
      final pu = RegExp(r'\b(i{1,2})\s*puc?\b').firstMatch(section)?[1];
      final grade = pu != null ? 10 + pu.length : g;
      if (grade != null && grade >= 1 && grade <= 12) lvl = level('class-$grade');
    }
    if (lvl == null) {
      final hay = '$section $subjectName';
      for (final l in levels.where((l) => l.stage != CurriculumStage.school)) {
        if (l.keywords.isNotEmpty && l.keywords.every((k) => RegExp('\\b${RegExp.escape(k)}').hasMatch(hay))) {
          lvl = l;
          break;
        }
      }
    }
    if (lvl == null) return null;
    final base = subjectOf(s.subjectName);
    final sub = lvl.subjects.where((x) => x.name.toLowerCase() == subjectName).firstOrNull ??
        lvl.subjects.where((x) => subjectName.contains(x.name.toLowerCase()) || x.name.toLowerCase().contains(subjectName)).firstOrNull ??
        (lvl.stage == CurriculumStage.school ? lvl.subjects.where((x) => x.base == base).firstOrNull : null);
    return sub == null ? null : CurriculumChoice(lvl, sub);
  }
}

// --- School: Class 1 to 12 ---------------------------------------------------------------

const _english = 'english', _hindi = 'hindi', _kannada = 'kannada';

CurriculumLevel _school(int g) {
  final primary = g <= 5, senior = g >= 11;
  CurriculumSubject lang(String id, String name, BoardBackground paper) => CurriculumSubject(
    id,
    name,
    id == _english ? Subject.english : Subject.languages,
    localised: id == _english,
    paper: g <= 2 && id == _english ? BoardBackground.fourLine : paper,
    features: [if (primary) 'tool:phonics', 'tool:language-kit', 'tool:vocab-cards', 'tool:grammar-tables', 'tool:dictionary', 'tool:organisers'],
  );
  final languages = [
    lang(_english, 'English', BoardBackground.ruled),
    if (!senior) lang(_hindi, 'Hindi', BoardBackground.hindiLines),
    if (!senior) lang(_kannada, 'Kannada', BoardBackground.kannadaLines),
  ];
  final List<CurriculumSubject> subjects;
  if (primary) {
    subjects = [
      ...languages,
      CurriculumSubject('maths', 'Maths', Subject.maths, localised: true, paper: BoardBackground.grid, features: [
        'tool:number-line', 'tool:counting', 'tool:teaching-clock', 'tool:shapes-colours', if (g >= 3) 'tool:ruler', //
        if (g >= 3) 'sim:fractions', 'phet:number-play', 'phet:make-a-ten', if (g >= 3) 'phet:fractions-intro', if (g >= 4) 'phet:area-builder',
      ]),
      CurriculumSubject('evs', 'EVS', Subject.evs, localised: true, features: [
        'tool:models3d', 'tool:organisers', 'tool:labs', 'lab:germination', 'lab:shadows', 'lab:magnets', //
        'model:flower', 'model:plant_cell', 'model:solar_system', 'model:seasons', 'model:teeth', 'phet:states-of-matter-basics',
      ]),
    ];
  } else if (!senior) {
    subjects = [
      ...languages,
      CurriculumSubject('maths', 'Maths', Subject.maths, localised: true, paper: g >= 9 ? BoardBackground.graph : BoardBackground.grid, features: [
        'tool:ruler', 'tool:protractor', 'tool:compass', 'tool:graph-plotter', 'tool:equation', if (g >= 9) 'tool:formulas', //
        'sim:fractions', 'sim:pythagoras', 'lab:triangle-angles', if (g >= 7) 'lab:pythagoras', if (g >= 8) 'lab:circle-pi', if (g >= 9) 'lab:probability',
        'model:solid.cube', 'model:solid.cylinder', if (g >= 9) 'model:solid.cone', 'phet:area-model-algebra', if (g >= 8) 'phet:graphing-lines', if (g >= 10) 'phet:trig-tour',
      ]),
      CurriculumSubject('science', 'Science', Subject.science, localised: true, features: [
        'tool:labs', 'tool:models3d', 'tool:circuit', if (g >= 8) 'tool:periodic-table', 'tool:physics-formulas', //
        'sim:pendulum', 'lab:magnets', 'lab:indicators', 'lab:microscope', if (g >= 8) 'lab:ohms-law', if (g >= 10) 'lab:glass-slab', if (g >= 10) 'lab:prism',
        'model:animal_cell', 'model:plant_cell', 'model:heart', if (g >= 10) 'model:eye', if (g >= 9) 'model:atoms',
        'phet:states-of-matter-basics', if (g >= 9) 'phet:build-an-atom', if (g >= 10) 'phet:bending-light', if (g >= 8) 'phet:circuit-construction-kit-dc',
      ]),
      const CurriculumSubject('social-science', 'Social Science', Subject.history, features: [
        'tool:timeline', 'tool:organisers', 'tool:models3d', 'model:globe', 'model:earth_layers', 'model:landforms', 'model:volcano', 'model:taj_mahal', 'model:qutub_minar', 'phet:greenhouse-effect',
      ]),
      CurriculumSubject('computer', 'Computer', Subject.computer, localised: true, features: [
        'tool:code-lab', 'tool:flowchart', 'tool:binary', if (g >= 8) 'tool:logic', if (g >= 9) 'tool:logic-gates', if (g >= 9) 'tool:algorithms',
      ]),
    ];
  } else {
    subjects = [
      CurriculumSubject('physics', 'Physics', Subject.physics, localised: true, paper: BoardBackground.graph, features: [
        'tool:physics-formulas', 'tool:circuit', 'tool:constants', 'tool:graph-plotter', 'tool:labs', 'tool:fbd', //
        'sim:projectile', 'sim:wave', 'sim:pendulum', 'lab:kirchhoff-laws', 'lab:meter-bridge', 'lab:pn-junction-diode', if (g == 12) 'lab:logic-gates', 'lab:youngs-modulus',
        'model:electric_circuit', 'model:transformer', 'model:lens_bench', 'phet:projectile-motion', 'phet:circuit-construction-kit-dc', 'phet:wave-interference',
        if (g == 12) ...['tool:phasor', 'tool:waveform-gen', 'tool:logic-gates', 'lab:lcr-resonance', 'model:ac_generator', 'model:transformer_1ph'],
      ]),
      const CurriculumSubject('chemistry', 'Chemistry', Subject.chemistry, localised: true, features: [
        'tool:periodic-table', 'tool:chem-equation', 'tool:atom', 'tool:labs', //
        'lab:titration-hcl-naoh', 'lab:salt-analysis', 'lab:flame-test', 'model:orbitals', 'model:hybridisation', 'model:crystal_lattices', 'model:molecules',
        'phet:molecule-shapes', 'phet:ph-scale', 'phet:balancing-chemical-equations',
      ]),
      const CurriculumSubject('maths', 'Mathematics', Subject.maths, paper: BoardBackground.graph, features: [
        'tool:graph-plotter', 'tool:equation', 'tool:formulas', 'tool:stats', 'tool:calculator', 'tool:ml-playground', //
        'sim:grapher', 'phet:calculus-grapher', 'phet:graphing-quadratics', 'phet:trig-tour', 'phet:vector-addition', 'model:solid.frustum',
      ]),
      const CurriculumSubject('biology', 'Biology', Subject.biology, localised: true, features: [
        'tool:models3d', 'tool:labs', 'tool:flowchart', //
        'lab:mitosis-onion-root', 'lab:monohybrid-cross', 'lab:gel-electrophoresis', 'lab:enzyme-amylase', 'model:dna', 'model:neuron', 'model:nephron', 'model:heart',
        'phet:natural-selection', 'phet:gene-expression-essentials',
      ]),
      const CurriculumSubject('computer-science', 'Computer Science', Subject.computer, features: [
        'tool:code-lab', 'tool:algorithms', 'tool:cs-labs', 'tool:logic-gates', 'tool:binary', 'kit:diagrams', 'tool:ml-playground', 'tool:ai-box-demo', 'tool:nn-builder',
      ]),
      const CurriculumSubject('accountancy', 'Accountancy', Subject.commerce, paper: BoardBackground.journal, features: [
        'tool:accounts', 'tool:spreadsheet', 'tool:finance', 'tool:calculator', 'tool:formulas',
      ]),
      const CurriculumSubject('business-studies', 'Business Studies', Subject.management, features: [
        'tool:organisers', 'kit:management', 'tool:timeline', 'tool:spreadsheet', 'tool:chart-pad',
      ]),
      const CurriculumSubject('economics', 'Economics', Subject.commerce, paper: BoardBackground.graph, features: [
        'tool:graphs', 'tool:stats', 'tool:chart-pad', 'tool:spreadsheet', 'lab:lab.break-even', 'lab:lab.graph-plotter',
      ]),
      ...languages,
    ];
  }
  return CurriculumLevel(id: 'class-$g', stage: CurriculumStage.school, grade: g, subjects: subjects);
}

// --- College ------------------------------------------------------------------------------

/// The first year every B.E./B.Tech branch shares.
const _firstYear = <CurriculumSubject>[
  CurriculumSubject('eng-maths', 'Engineering Mathematics', Subject.maths, semester: 1, paper: BoardBackground.graph, features: [
    'tool:graph-plotter', 'tool:equation', 'tool:formulas', 'phet:calculus-grapher', 'phet:fourier-making-waves',
  ]),
  CurriculumSubject('eng-physics', 'Engineering Physics', Subject.physics, semester: 1, paper: BoardBackground.graph, features: [
    'tool:physics-formulas', 'tool:constants', 'lab:diffraction-grating', 'lab:newtons-rings', 'lab:photoelectric-effect', 'phet:quantum-wave-interference',
  ]),
  CurriculumSubject('eng-graphics', 'Engineering Graphics', Subject.art, semester: 1, paper: BoardBackground.isometric, features: [
    'tool:eng-drawing', 'tool:set-square-45', 'tool:set-square-3060', 'tool:compass', 'tool:ruler', 'model:solid.square-pyramid', 'model:solid.triangular-prism',
  ]),
  CurriculumSubject('basic-electrical', 'Basic Electrical Engineering', Subject.physics, semester: 2, paper: BoardBackground.graph, features: [
    'tool:circuit', 'tool:phasor', 'tool:waveform-gen', 'tool:eee-kit', 'lab:kirchhoff-laws', 'lab:ohms-law', 'model:transformer_1ph', 'model:dc_machine', 'model:induction_motor', 'phet:circuit-construction-kit-ac',
  ]),
  CurriculumSubject('c-programming', 'Programming in C', Subject.computer, semester: 2, features: ['tool:code-lab', 'tool:flowchart', 'tool:algorithms']),
];

CurriculumLevel _branch(String id, String name, Color accent, List<String> keywords, List<CurriculumSubject> core) =>
    CurriculumLevel(id: id, stage: CurriculumStage.college, name: name, accent: accent, keywords: keywords, subjects: [..._firstYear, ...core]);

final _college = <CurriculumLevel>[
  const CurriculumLevel(
    id: 'mba',
    stage: CurriculumStage.college,
    name: 'MBA',
    accent: Color(0xFF7D3A8C),
    keywords: ['mba'],
    subjects: [
      CurriculumSubject('managerial-economics', 'Managerial Economics', Subject.commerce, semester: 1, paper: BoardBackground.graph, features: ['tool:graphs', 'tool:chart-pad', 'tool:stats', 'kit:finance', 'lab:lab.break-even', 'lab:lab.graph-plotter']),
      CurriculumSubject('accounting-managers', 'Accounting for Managers', Subject.commerce, semester: 1, paper: BoardBackground.journal, features: ['tool:accounts', 'tool:finance', 'tool:spreadsheet', 'tool:calculator']),
      CurriculumSubject('organisational-behaviour', 'Organisational Behaviour', Subject.management, semester: 1, features: ['tool:organisers', 'kit:management', 'tool:mindmap']),
      CurriculumSubject('financial-management', 'Financial Management', Subject.commerce, semester: 2, features: ['tool:finance', 'tool:spreadsheet', 'tool:chart-pad', 'tool:calculator', 'tool:formulas']),
      CurriculumSubject('marketing-management', 'Marketing Management', Subject.management, semester: 2, features: ['tool:organisers', 'kit:management', 'tool:chart-pad', 'lab:lab.break-even']),
      CurriculumSubject('business-research', 'Business Research Methods', Subject.statistics, semester: 2, features: ['tool:stats', 'tool:spreadsheet', 'tool:chart-pad', 'tool:graphs', 'phet:least-squares-regression']),
      CurriculumSubject('operations-management', 'Operations Management', Subject.management, semester: 3, features: ['tool:flowchart', 'kit:management', 'tool:spreadsheet', 'tool:stats', 'kit:finance']),
      CurriculumSubject('strategic-management', 'Strategic Management', Subject.management, semester: 3, features: ['tool:organisers', 'kit:management', 'tool:chart-pad', 'tool:mindmap']),
      CurriculumSubject('entrepreneurship', 'Entrepreneurship', Subject.management, semester: 4, features: ['tool:organisers', 'kit:management', 'tool:finance', 'tool:chart-pad']),
    ],
  ),
  _branch('be-civil', 'B.E. Civil', const Color(0xFF8A4B00), ['civil'], const [
    CurriculumSubject('strength-materials', 'Strength of Materials', Subject.physics, semester: 3, paper: BoardBackground.graph, features: ['tool:beam-solver', 'tool:graph-plotter', 'tool:fbd', 'tool:is-codes', 'lab:youngs-modulus', 'lab:hookes-law']),
    CurriculumSubject('surveying', 'Surveying', Subject.maths, semester: 3, paper: BoardBackground.graph, features: ['tool:survey-pad', 'tool:protractor-360', 'tool:compass', 'tool:calculator', 'tool:eng-drawing']),
    CurriculumSubject('fluid-mechanics', 'Fluid Mechanics', Subject.physics, semester: 4, features: ['tool:physics-formulas', 'tool:graph-plotter', 'lab:stokes-viscosity', 'phet:fluid-pressure-and-flow', 'phet:under-pressure']),
    CurriculumSubject('structural-analysis', 'Structural Analysis', Subject.physics, semester: 5, paper: BoardBackground.graph, features: ['tool:beam-solver', 'tool:truss-solver', 'tool:fbd', 'tool:equation', 'tool:spreadsheet', 'tool:calculator', 'model:truss_bridge', 'model:arch_bridge']),
    CurriculumSubject('geotechnical', 'Geotechnical Engineering', Subject.physics, semester: 5, paper: BoardBackground.graph, features: ['tool:graphs', 'tool:spreadsheet', 'tool:is-codes', 'model:footings', 'model:earth_layers']),
    CurriculumSubject('rc-design', 'Design of RC Structures', Subject.physics, semester: 6, paper: BoardBackground.graph, features: ['tool:is-codes', 'tool:beam-solver', 'tool:eng-drawing', 'tool:calculator', 'tool:spreadsheet', 'model:rcc_frame', 'model:footings']),
    CurriculumSubject('steel-design', 'Design of Steel Structures', Subject.physics, semester: 7, paper: BoardBackground.graph, features: ['tool:is-codes', 'tool:truss-solver', 'tool:beam-solver', 'tool:eng-drawing', 'tool:calculator', 'model:truss_bridge']),
    CurriculumSubject('transportation', 'Transportation Engineering', Subject.physics, semester: 7, features: ['tool:survey-pad', 'tool:eng-drawing', 'tool:graphs', 'tool:calculator', 'model:suspension_bridge', 'model:cable_stayed_bridge']),
  ]),
  _branch('be-mech', 'B.E. Mechanical', const Color(0xFF8C2F2F), ['mech'], const [
    CurriculumSubject('eng-mechanics', 'Engineering Mechanics', Subject.physics, semester: 3, paper: BoardBackground.graph, features: ['tool:fbd', 'tool:beam-solver', 'tool:truss-solver', 'tool:graph-plotter', 'phet:vector-addition', 'model:simple_machines']),
    CurriculumSubject('thermodynamics', 'Engineering Thermodynamics', Subject.physics, semester: 3, paper: BoardBackground.graph, features: ['tool:pv-ts-charts', 'tool:physics-formulas', 'phet:gas-properties', 'model:engine', 'model:proc.engine']),
    CurriculumSubject('mechanics-materials', 'Mechanics of Materials', Subject.physics, semester: 3, paper: BoardBackground.graph, features: ['tool:beam-solver', 'tool:fbd', 'lab:youngs-modulus']),
    CurriculumSubject('machine-drawing', 'Machine Drawing', Subject.art, semester: 4, paper: BoardBackground.isometric, features: ['tool:eng-drawing', 'tool:set-square-45', 'tool:set-square-3060', 'tool:compass', 'model:gears', 'model:gear_types', 'model:engine']),
    CurriculumSubject('kinematics', 'Kinematics of Machines', Subject.physics, semester: 4, features: ['tool:eng-drawing', 'tool:protractor', 'model:gears', 'model:cam_follower', 'model:gear_types', 'model:simple_machines', 'model:proc.gears']),
    CurriculumSubject('theory-machines', 'Theory of Machines', Subject.physics, semester: 5, features: ['tool:fbd', 'tool:eng-drawing', 'tool:protractor', 'model:cam_follower', 'model:gear_types', 'model:gears', 'model:engine']),
    CurriculumSubject('fluid-machinery', 'Fluid Mechanics and Machinery', Subject.physics, semester: 5, features: ['tool:physics-formulas', 'lab:stokes-viscosity', 'phet:fluid-pressure-and-flow']),
    CurriculumSubject('machine-design', 'Design of Machine Elements', Subject.physics, semester: 5, paper: BoardBackground.graph, features: ['tool:fbd', 'tool:eng-drawing', 'tool:calculator', 'model:gears', 'model:gear_types']),
    CurriculumSubject('ic-engines', 'IC Engines', Subject.physics, semester: 6, paper: BoardBackground.graph, features: ['tool:pv-ts-charts', 'model:engine', 'model:cam_follower', 'model:proc.engine', 'tool:physics-formulas', 'tool:calculator']),
    CurriculumSubject('heat-transfer', 'Heat Transfer', Subject.physics, semester: 6, paper: BoardBackground.graph, features: ['tool:pv-ts-charts', 'tool:graph-plotter', 'lab:newtons-law-cooling', 'phet:energy-forms-and-changes']),
  ]),
  _branch('be-eee', 'B.E. Electrical & Electronics (EEE)', const Color(0xFF6D3FB5), ['eee'], const [
    CurriculumSubject('circuit-analysis', 'Electric Circuit Analysis', Subject.physics, semester: 3, paper: BoardBackground.graph, features: ['tool:circuit', 'tool:phasor', 'tool:waveform-gen', 'lab:kirchhoff-laws', 'lab:lcr-resonance', 'lab:rc-time-constant', 'phet:circuit-construction-kit-ac']),
    CurriculumSubject('network-analysis', 'Network Analysis and Synthesis', Subject.physics, semester: 3, paper: BoardBackground.graph, features: ['tool:phasor', 'tool:circuit', 'tool:graph-plotter', 'tool:equation', 'lab:lcr-resonance', 'lab:kirchhoff-laws']),
    CurriculumSubject('analog-electronics', 'Analog Electronics', Subject.physics, semester: 3, paper: BoardBackground.graph, features: ['tool:circuit', 'tool:waveform-gen', 'lab:transistor-ce', 'lab:half-wave-rectifier', 'lab:opamp-inverting', 'lab:zener-diode']),
    CurriculumSubject('electrical-machines-1', 'Electrical Machines I', Subject.physics, semester: 4, features: ['tool:phasor', 'tool:circuit', 'tool:eee-kit', 'model:dc_machine', 'model:transformer_1ph', 'model:transformer_3ph', 'model:electric_motor', 'phet:generator']),
    CurriculumSubject('measurements', 'Electrical and Electronic Measurements', Subject.physics, semester: 4, paper: BoardBackground.graph, features: ['tool:circuit', 'tool:waveform-gen', 'tool:phasor', 'lab:meter-bridge', 'lab:ohms-law', 'tool:calculator']),
    CurriculumSubject('electrical-machines-2', 'Electrical Machines II', Subject.physics, semester: 5, features: ['tool:phasor', 'tool:eee-kit', 'tool:circuit', 'model:induction_motor', 'model:alternator', 'model:ac_generator', 'model:transformer_3ph']),
    CurriculumSubject('power-systems', 'Power Systems I', Subject.physics, semester: 5, features: ['tool:single-line-diagram', 'tool:phasor', 'tool:calculator', 'model:alternator', 'model:transformer_3ph']),
    CurriculumSubject('control-systems', 'Control Systems', Subject.physics, semester: 5, paper: BoardBackground.graph, features: ['tool:bode-plot', 'tool:signal-plotter', 'tool:graph-plotter', 'tool:flowchart', 'tool:equation']),
    CurriculumSubject('power-systems-2', 'Power Systems II', Subject.physics, semester: 6, features: ['tool:single-line-diagram', 'tool:phasor', 'tool:waveform-gen', 'tool:spreadsheet', 'tool:calculator', 'model:transformer_3ph']),
    CurriculumSubject('power-electronics', 'Power Electronics', Subject.physics, semester: 6, paper: BoardBackground.graph, features: ['tool:waveform-gen', 'tool:circuit', 'tool:phasor', 'lab:bridge-rectifier', 'lab:full-wave-rectifier', 'model:dc_machine']),
  ]),
  _branch('be-ece', 'B.E. Electronics & Communication (ECE)', const Color(0xFF00658E), ['ece'], const [
    CurriculumSubject('digital-electronics', 'Digital Electronics', Subject.computer, semester: 3, features: ['tool:logic-gates', 'tool:timing-diagram', 'tool:ece-kit', 'tool:logic', 'tool:binary', 'lab:logic-gates', 'lab:astable-555', 'tool:code-lab']),
    CurriculumSubject('network-analysis', 'Network Analysis', Subject.physics, semester: 3, paper: BoardBackground.graph, features: ['tool:circuit', 'tool:phasor', 'tool:bode-plot', 'lab:kirchhoff-laws', 'lab:lcr-resonance']),
    CurriculumSubject('signals-systems', 'Signals and Systems', Subject.maths, semester: 4, paper: BoardBackground.graph, features: ['tool:signal-plotter', 'tool:bode-plot', 'tool:waveform-gen', 'tool:graph-plotter', 'phet:fourier-making-waves']),
    CurriculumSubject('microcontrollers', 'Microcontrollers', Subject.computer, semester: 5, features: ['tool:mcu-pins', 'tool:timing-diagram', 'tool:code-lab', 'tool:binary', 'tool:logic-gates']),
    CurriculumSubject('analog-communication', 'Analog Communication', Subject.physics, semester: 5, paper: BoardBackground.graph, features: ['tool:signal-plotter', 'tool:waveform-gen', 'tool:bode-plot', 'phet:wave-on-a-string', 'phet:waves-intro']),
    CurriculumSubject('control-systems', 'Control Systems', Subject.maths, semester: 5, paper: BoardBackground.graph, features: ['tool:bode-plot', 'tool:signal-plotter', 'tool:graph-plotter', 'tool:flowchart', 'tool:equation']),
    CurriculumSubject('dsp', 'Digital Signal Processing', Subject.maths, semester: 6, paper: BoardBackground.graph, features: ['tool:signal-plotter', 'tool:bode-plot', 'tool:code-lab', 'tool:graph-plotter', 'phet:fourier-making-waves']),
    CurriculumSubject('digital-communication', 'Digital Communication', Subject.physics, semester: 6, paper: BoardBackground.graph, features: ['tool:signal-plotter', 'tool:timing-diagram', 'tool:waveform-gen', 'tool:binary']),
    CurriculumSubject('embedded-systems', 'Embedded Systems', Subject.computer, semester: 7, features: ['tool:mcu-pins', 'tool:timing-diagram', 'tool:code-lab', 'tool:logic-gates']),
    CurriculumSubject('vlsi', 'VLSI Design', Subject.computer, semester: 7, features: ['tool:logic-gates', 'tool:timing-diagram', 'tool:ece-kit', 'tool:code-lab']),
  ]),
  _branch('be-cse', 'B.E. Computer Science / Information Science', const Color(0xFF006879), ['cse'], const [
    CurriculumSubject('data-structures', 'Data Structures', Subject.computer, semester: 3, features: ['tool:algorithms', 'tool:code-lab', 'tool:flowchart']),
    CurriculumSubject('oop-java', 'Object Oriented Programming with Java', Subject.computer, semester: 3, features: ['tool:code-lab', 'kit:diagrams', 'tool:flowchart']),
    CurriculumSubject('digital-logic', 'Digital Logic Design', Subject.computer, semester: 3, features: ['tool:logic-gates', 'tool:timing-diagram', 'tool:logic', 'tool:binary']),
    CurriculumSubject('algorithms', 'Design and Analysis of Algorithms', Subject.computer, semester: 4, features: ['tool:algorithms', 'tool:code-lab', 'tool:graph-plotter']),
    CurriculumSubject('dbms', 'Database Management Systems', Subject.computer, semester: 4, features: ['tool:code-lab', 'tool:cs-labs', 'kit:diagrams', 'tool:spreadsheet']),
    CurriculumSubject('software-engineering', 'Software Engineering', Subject.computer, semester: 5, features: ['tool:flowchart', 'kit:diagrams', 'tool:organisers']),
    CurriculumSubject('computer-networks', 'Computer Networks', Subject.computer, semester: 5, features: ['tool:cs-labs', 'tool:binary', 'tool:flowchart', 'tool:code-lab', 'tool:algorithms']),
    CurriculumSubject('operating-systems', 'Operating Systems', Subject.computer, semester: 5, features: ['tool:cs-labs', 'tool:algorithms', 'tool:code-lab']),
    CurriculumSubject('theory-of-computation', 'Theory of Computation', Subject.computer, semester: 5, features: ['kit:diagrams', 'tool:code-lab', 'tool:logic']),
  ]),
  _branch('be-aiml', 'B.E. AI & Machine Learning', const Color(0xFF4A5A9C), ['aiml'], const [
    CurriculumSubject('python', 'Python Programming', Subject.computer, semester: 3, features: ['tool:code-lab', 'tool:flowchart', 'tool:algorithms']),
    CurriculumSubject('probability-statistics', 'Probability and Statistics', Subject.statistics, semester: 3, paper: BoardBackground.graph, features: ['tool:stats', 'tool:graphs', 'tool:ml-playground', 'phet:plinko-probability', 'phet:least-squares-regression']),
    CurriculumSubject('oop-java', 'Object Oriented Programming with Java', Subject.computer, semester: 3, features: ['tool:code-lab', 'kit:diagrams']),
    CurriculumSubject('aiml-data-structures', 'Data Structures', Subject.computer, semester: 4, features: ['tool:algorithms', 'tool:code-lab']),
    CurriculumSubject('dbms', 'Database Management Systems', Subject.computer, semester: 4, features: ['tool:code-lab', 'tool:cs-labs', 'kit:diagrams', 'tool:spreadsheet']),
    CurriculumSubject('intro-ai', 'Introduction to Artificial Intelligence', Subject.computer, semester: 4, features: ['tool:ai-box-demo', 'tool:nn-builder', 'tool:ml-playground', 'tool:algorithms', 'tool:flowchart', 'tool:code-lab']),
    CurriculumSubject('machine-learning', 'Machine Learning', Subject.computer, semester: 5, paper: BoardBackground.graph, features: ['tool:ml-playground', 'tool:nn-builder', 'tool:stats', 'tool:graph-plotter', 'phet:curve-fitting', 'tool:code-lab']),
    CurriculumSubject('data-science', 'Data Science with Python', Subject.statistics, semester: 5, paper: BoardBackground.graph, features: ['tool:ml-playground', 'tool:code-lab', 'tool:stats', 'tool:chart-pad', 'tool:spreadsheet', 'phet:least-squares-regression']),
    CurriculumSubject('deep-learning', 'Deep Learning', Subject.computer, semester: 6, features: ['tool:nn-builder', 'tool:ml-playground', 'tool:ai-box-demo', 'tool:code-lab', 'tool:graph-plotter']),
    CurriculumSubject('computer-vision', 'Computer Vision', Subject.computer, semester: 7, features: ['tool:ai-box-demo', 'tool:nn-builder', 'tool:code-lab']),
    CurriculumSubject('nlp', 'Natural Language Processing', Subject.computer, semester: 7, features: ['tool:nn-builder', 'tool:ai-box-demo', 'tool:code-lab']),
  ]),
  _branch('be-chem', 'B.E. Chemical', const Color(0xFF006B58), ['chemical'], const [
    CurriculumSubject('process-calculations', 'Process Calculations', Subject.chemistry, semester: 3, features: ['tool:pfd-kit', 'tool:unit-ops', 'tool:calculator', 'tool:spreadsheet', 'tool:chem-equation', 'model:molecules', 'model:organic_molecules']),
    CurriculumSubject('chem-thermodynamics', 'Chemical Engineering Thermodynamics', Subject.chemistry, semester: 3, paper: BoardBackground.graph, features: ['tool:pv-ts-charts', 'phet:gas-properties', 'tool:graph-plotter']),
    CurriculumSubject('chem-fluid-mechanics', 'Fluid Mechanics', Subject.physics, semester: 4, features: ['tool:pfd-kit', 'model:pfr_reactor', 'tool:physics-formulas', 'lab:stokes-viscosity', 'lab:ostwald-viscosity', 'phet:fluid-pressure-and-flow']),
    CurriculumSubject('heat-transfer', 'Heat Transfer', Subject.physics, semester: 4, paper: BoardBackground.graph, features: ['tool:unit-ops', 'tool:pfd-kit', 'model:shell_tube_hx', 'tool:graph-plotter']),
    CurriculumSubject('mass-transfer', 'Mass Transfer', Subject.chemistry, semester: 4, paper: BoardBackground.graph, features: ['tool:unit-ops', 'tool:pfd-kit', 'model:distillation_column', 'tool:graph-plotter', 'phet:diffusion']),
    CurriculumSubject('reaction-engineering', 'Chemical Reaction Engineering', Subject.chemistry, semester: 5, paper: BoardBackground.graph, features: ['tool:unit-ops', 'model:cstr_reactor', 'model:pfr_reactor', 'model:packed_bed_reactor', 'tool:chem-equation', 'tool:graph-plotter', 'lab:reaction-rate-thiosulphate', 'phet:reactants-products-and-leftovers']),
    CurriculumSubject('process-control', 'Process Control', Subject.chemistry, semester: 6, features: ['tool:pfd-kit', 'tool:signal-plotter', 'tool:flowchart', 'model:cstr_reactor']),
    CurriculumSubject('plant-design', 'Plant Design and Economics', Subject.chemistry, semester: 7, features: ['tool:pfd-kit', 'tool:unit-ops', 'tool:spreadsheet', 'model:distillation_column', 'model:shell_tube_hx', 'model:cstr_reactor']),
  ]),
];

// --- Postgraduate -----------------------------------------------------------------------------

const _postgrad = <CurriculumLevel>[
  CurriculumLevel(
    id: 'mtech-structural',
    stage: CurriculumStage.postgrad,
    name: 'M.Tech Structural Design',
    accent: Color(0xFF8A4B00),
    keywords: ['m.tech', 'structural'],
    subjects: [
      CurriculumSubject('adv-structural-analysis', 'Advanced Structural Analysis', Subject.physics, semester: 1, paper: BoardBackground.graph, features: ['tool:beam-solver', 'tool:truss-solver', 'tool:fbd', 'tool:spreadsheet', 'tool:equation']),
      CurriculumSubject('adv-concrete', 'Advanced Design of Concrete Structures', Subject.physics, semester: 1, paper: BoardBackground.graph, features: ['tool:is-codes', 'tool:beam-solver', 'tool:spreadsheet', 'tool:calculator']),
      CurriculumSubject('fem', 'Finite Element Method', Subject.maths, semester: 1, paper: BoardBackground.graph, features: ['tool:equation', 'tool:graph-plotter', 'tool:spreadsheet', 'tool:code-lab']),
      CurriculumSubject('earthquake-design', 'Earthquake Resistant Design', Subject.physics, semester: 2, paper: BoardBackground.graph, features: ['tool:signal-plotter', 'tool:is-codes', 'sim:wave', 'phet:normal-modes', 'tool:graph-plotter']),
      CurriculumSubject('steel-structures', 'Design of Steel Structures', Subject.physics, semester: 2, paper: BoardBackground.graph, features: ['tool:is-codes', 'tool:truss-solver', 'tool:beam-solver', 'tool:eng-drawing', 'tool:calculator']),
    ],
  ),
  CurriculumLevel(
    id: 'mtech-power',
    stage: CurriculumStage.postgrad,
    name: 'M.Tech Power Systems',
    accent: Color(0xFF6D3FB5),
    keywords: ['m.tech', 'power'],
    subjects: [
      CurriculumSubject('power-system-analysis', 'Power System Analysis', Subject.physics, semester: 1, features: ['tool:single-line-diagram', 'tool:phasor', 'tool:spreadsheet', 'tool:calculator', 'model:alternator', 'model:transformer_3ph']),
      CurriculumSubject('protection', 'Power System Protection', Subject.physics, semester: 1, features: ['tool:single-line-diagram', 'tool:waveform-gen', 'tool:circuit', 'tool:phasor']),
      CurriculumSubject('stability', 'Power System Stability', Subject.physics, semester: 2, paper: BoardBackground.graph, features: ['tool:signal-plotter', 'tool:phasor', 'tool:graph-plotter', 'tool:equation', 'model:alternator']),
      CurriculumSubject('renewables', 'Renewable Energy Systems', Subject.physics, semester: 2, features: ['tool:graphs', 'tool:waveform-gen', 'tool:single-line-diagram', 'phet:energy-forms-and-changes', 'model:ac_generator', 'model:induction_motor', 'phet:greenhouse-effect']),
    ],
  ),
  CurriculumLevel(
    id: 'mtech-ev',
    stage: CurriculumStage.postgrad,
    name: 'M.Tech / PG EV Technology',
    accent: Color(0xFF006E20),
    keywords: ['ev tech'],
    subjects: [
      CurriculumSubject('ev-architecture', 'EV Architecture', Subject.physics, semester: 1, features: ['tool:ev-power-flow', 'tool:ev-charging', 'model:ev_drivetrain', 'model:ev_battery_pack', 'model:pmsm_motor', 'tool:flowchart', 'model:electric_motor']),
      CurriculumSubject('bms', 'Battery Management Systems', Subject.physics, semester: 1, paper: BoardBackground.graph, features: ['tool:ev-charging', 'model:ev_battery_pack', 'tool:spreadsheet', 'tool:graph-plotter', 'tool:circuit']),
      CurriculumSubject('electric-drives', 'Electric Drives and Control', Subject.physics, semester: 2, features: ['tool:ev-power-flow', 'model:pmsm_motor', 'tool:phasor', 'tool:waveform-gen', 'model:induction_motor', 'model:dc_machine', 'model:electric_motor', 'tool:circuit']),
      CurriculumSubject('charging', 'Charging Infrastructure', Subject.physics, semester: 2, features: ['tool:ev-charging', 'tool:single-line-diagram', 'tool:calculator', 'model:ev_battery_pack']),
    ],
  ),
];
