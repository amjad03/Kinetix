import '../kit/subjects.dart';

/// Whether the drawer, Insert menu and simulation picker open showing every tool. Off on a device; the
/// older widget tests, which tap tiles of any subject, turn it on (test/flutter_test_config.dart).
bool showAllToolsByDefault = false;

/// The age band of a class, from its grade (LKG..12) or, in college, its programme.
enum GradeBand { early, primary, middle, secondary, seniorSecondary, college }

/// Where the board learnt what is being taught: the timetable, the live session, or the teacher's own pick on the top bar.
enum ContextSource { timetable, live, teacher }

/// The band for [grade] (1..12; 0 or less is LKG/UKG) and the programme [level] (`k12`, `ug`, `pg`, `diploma`, `phd`).
GradeBand gradeBandOf({int? grade, String? level}) {
  if (level != null && level != 'k12') return GradeBand.college;
  final g = grade;
  if (g == null) return GradeBand.middle;
  if (g <= 0) return GradeBand.early;
  if (g <= 5) return GradeBand.primary;
  if (g <= 8) return GradeBand.middle;
  if (g <= 10) return GradeBand.secondary;
  if (g <= 12) return GradeBand.seniorSecondary;
  return GradeBand.college;
}

/// What the board is teaching right now. Everything on the board that has a choice of tools asks this.
class ClassContext {
  const ClassContext({required this.subject, required this.band, this.grade, this.sectionName, this.source = ContextSource.timetable});

  final Subject subject;
  final GradeBand band;
  final int? grade;
  final String? sectionName;
  final ContextSource source;

  ClassContext copyWith({Subject? subject, int? grade, ContextSource? source}) => ClassContext(
    subject: subject ?? this.subject,
    band: grade == null ? band : gradeBandOf(grade: grade),
    grade: grade ?? this.grade,
    sectionName: sectionName,
    source: source ?? this.source,
  );

  ToolProfile get profile => toolProfileFor(subject, band);
}

/// What shows for one subject at one grade band; everything else sits behind "Show all tools".
class ToolProfile {
  const ToolProfile({required this.tools, required this.insert, required this.sims, required this.models, required this.templates, required this.keyDates, required this.dictionaryFirst});

  /// Drawer tool ids (the class-management tools in [alwaysTools] are added to these).
  final Set<String> tools;

  /// Ids of the Insert menu's entries (`insert-graph`, `insert-model3d`, ...).
  final Set<String> insert;

  /// Names of the built-in simulations (`SimKind.name`) and PhET topics worth offering.
  final Set<String> sims;

  /// Topics of the 3D models (`cell`, `solar`, `geometry`, ...).
  final Set<String> models;

  /// Organisers and graph templates (`graphs`, `organisers`, `flowchart`, `mindmap`, ...).
  final Set<String> templates;

  /// What the key dates browser opens on: a topic (`science`, `politics`, ...) or empty for everything.
  final String keyDates;

  /// Whether the dictionary leads the subject kit (languages, English, EVS).
  final bool dictionaryFirst;
}

/// Class-management tools that every subject keeps: the timer, quiz, attendance, the screen tools.
const alwaysTools = <String>{
  'toolkit-timer', 'toolkit-stopwatch', 'toolkit-picker', 'toolkit-dice', 'toolkit-spinner', 'toolkit-noise', 'toolkit-curtain', 'toolkit-spotlight', //
  'badges', 'quick-quiz', 'ask-class', 'attendance', 'todays-plan', 'read-aloud', 'second-board', 'laser', 'move', 'eye-comfort', 'screenshot', 'touch-lock', //
  'demo-classes', 'this-class', 'doc-camera', 'safe-web', 'live-captions', 'magnifier', 'seating-chart', 'group-maker', 'teacher-notes', 'scoreboard', 'buzzer', //
  'zones', 'diagnostics', 'exam-clock', 'exam-room', 'exit-ticket', 'concept-videos', 'mindmap', 'dictionary', 'worksheet', 'voice-commands',
};

const _languageTools = {'language-kit', 'phonics', 'grammar-tables', 'vocab-cards', 'live-captions'};
const _primaryTools = {'tracing', 'counting', 'shapes-colours', 'matching-game', 'rhymes', 'star-wall'};
const _geometryKit = {'ruler', 'protractor', 'protractor-360', 'set-square-45', 'set-square-3060', 'compass', 'calibrate'};
/// Insert entries that depend on the subject; every other entry (text, notes, pictures, documents) always shows.
const _gatedInsert = {'insert-equation', 'insert-graph', 'insert-model3d', 'insert-lab', 'insert-simulation', 'insert-code', 'insert-cat-geometry', 'insert-cat-flowchart', 'insert-cat-table'};

/// The one mapping of subject x grade band to what the board offers. Edit here to change what a class sees.
ToolProfile toolProfileFor(Subject s, GradeBand b) {
  final little = b == GradeBand.early || b == GradeBand.primary;
  final college = b == GradeBand.college;
  Set<String> tools = {};
  Set<String> insert = {};
  Set<String> sims = {};
  Set<String> models = {};
  Set<String> templates = {'organisers'};
  var keyDates = '';
  var dictFirst = false;

  switch (s) {
    case Subject.maths:
      tools = {..._geometryKit, 'graphs', 'graph-plotter', 'equation', 'number-line', 'calculator', 'formulas', 'binary', 'teaching-clock', 'sims', 'organisers', 'flowchart'};
      if (little) tools = {'ruler', 'protractor', 'compass', 'number-line', 'teaching-clock', 'calculator', 'sims', 'organisers', 'binary'};
      if (b == GradeBand.middle) tools.add('models3d');
      if (b == GradeBand.secondary || b == GradeBand.seniorSecondary || college) tools.addAll({'models3d', 'stats', 'spreadsheet', 'phet'});
      insert = {'insert-equation', 'insert-graph', 'insert-model3d', 'insert-simulation', 'insert-cat-geometry', 'insert-cat-table'};
      if (little) insert = {'insert-simulation', 'insert-cat-geometry'};
      sims = {'grapher', 'fractions', 'pythagoras'};
      models = {'geometry'};
      templates = {'graphs', 'organisers', 'flowchart'};
    case Subject.statistics:
      tools = {'stats', 'spreadsheet', 'graphs', 'graph-plotter', 'calculator', 'formulas', 'equation', 'organisers'};
      insert = {'insert-equation', 'insert-graph', 'insert-cat-table'};
      sims = {'grapher'};
      templates = {'graphs', 'organisers'};
    case Subject.physics:
      tools = {'physics-formulas', 'constants', 'sims', 'phet', 'labs', 'circuit', 'equation', 'graphs', 'graph-plotter', 'calculator', 'models3d', 'ruler', 'protractor'};
      if (b == GradeBand.middle) tools.removeAll({'equation', 'graph-plotter'});
      if (b == GradeBand.seniorSecondary || college) tools.add('logic-gates');
      insert = {'insert-equation', 'insert-graph', 'insert-model3d', 'insert-lab', 'insert-simulation', 'insert-cat-geometry'};
      sims = {'pendulum', 'projectile', 'wave', 'grapher'};
      models = {'physics'};
      templates = {'graphs', 'organisers'};
    case Subject.chemistry:
      tools = {'periodic-table', 'chem-equation', 'atom', 'labs', 'models3d', 'constants', 'calculator', 'formulas', 'phet'};
      insert = {'insert-model3d', 'insert-lab', 'insert-simulation', 'insert-cat-flowchart'};
      sims = {};
      models = {'atom', 'molecule'};
      templates = {'organisers', 'flowchart'};
    case Subject.biology:
      tools = {'models3d', 'labs', 'flowchart', 'phet', 'organisers'};
      insert = {'insert-model3d', 'insert-lab', 'insert-cat-flowchart'};
      models = {'cell', 'human', 'plant'};
      templates = {'organisers', 'flowchart'};
    case Subject.science:
      tools = {'sims', 'phet', 'labs', 'models3d', 'circuit', 'atom', 'periodic-table', 'physics-formulas', 'calculator', 'organisers', 'flowchart'};
      if (little) tools = {'sims', 'labs', 'models3d', 'organisers'};
      insert = {'insert-model3d', 'insert-lab', 'insert-simulation'};
      sims = {'pendulum', 'wave', 'projectile'};
      models = {'cell', 'solar', 'human', 'plant'};
      templates = {'organisers', 'flowchart'};
    case Subject.evs:
      tools = {'models3d', 'labs', 'organisers', 'timeline', 'teaching-clock'};
      insert = {'insert-model3d'};
      models = {'plant', 'solar', 'human'};
      keyDates = 'science';
      dictFirst = true;
    case Subject.geography:
      tools = {'timeline', 'graphs', 'models3d', 'organisers', 'phet', 'spreadsheet'};
      insert = {'insert-model3d', 'insert-graph'};
      models = {'solar', 'earth'};
      keyDates = 'world';
      templates = {'graphs', 'organisers'};
    case Subject.history:
      tools = {'timeline', 'organisers', 'models3d'};
      insert = {'insert-model3d'};
      models = {'monument'};
      keyDates = 'history';
      templates = {'organisers'};
    case Subject.civics:
      tools = {'timeline', 'organisers'};
      keyDates = 'politics';
      templates = {'organisers'};
    case Subject.commerce:
      tools = {'spreadsheet', 'accounts', 'finance', 'formulas', 'stats', 'calculator', 'graphs', 'organisers'};
      insert = {'insert-graph', 'insert-equation', 'insert-cat-table'};
      templates = {'graphs', 'organisers'};
    case Subject.management:
    case Subject.law:
      tools = {'spreadsheet', 'accounts', 'finance', 'stats', 'organisers', 'timeline'};
      insert = {'insert-graph', 'insert-cat-table'};
      keyDates = 'politics';
      templates = {'organisers'};
    case Subject.english:
    case Subject.languages:
      tools = {'organisers', 'timeline'};
      dictFirst = true;
      templates = {'organisers'};
    case Subject.computer:
      tools = {'code-lab', 'code', 'flowchart', 'algorithms', 'cs-labs', 'logic', 'logic-gates', 'binary', 'organisers', 'spreadsheet'};
      if (little) tools = {'code', 'flowchart', 'binary', 'organisers'};
      insert = {'insert-equation', 'insert-code', 'insert-cat-flowchart', 'insert-cat-table'};
      templates = {'flowchart', 'organisers'};
    case Subject.art:
      tools = {'ruler', 'compass', 'models3d', 'organisers'};
      insert = {'insert-model3d'};
      models = {'monument'};
    case Subject.general:
      // No subject known: nothing is hidden.
      return const ToolProfile(tools: {}, insert: {}, sims: {}, models: {}, templates: {}, keyDates: '', dictionaryFirst: false);
  }
  if (s == Subject.english || s == Subject.languages || s == Subject.evs) tools = {...tools, ..._languageTools};
  if (little) tools = {...tools, ..._primaryTools, 'phonics', 'vocab-cards'};
  if (b == GradeBand.early) {
    tools = {...tools.where(const {'teaching-clock', 'number-line', 'models3d', 'organisers', 'dictionary', 'phonics', 'vocab-cards', 'timeline', ..._primaryTools}.contains), 'teaching-clock'};
  }
  return ToolProfile(
    tools: {...tools, ...alwaysTools},
    insert: insert,
    sims: sims,
    models: models,
    templates: templates,
    keyDates: keyDates,
    dictionaryFirst: dictFirst,
  );
}

/// Whether the profile hides nothing (an unknown subject).
bool showsEverything(ToolProfile p) => p.tools.isEmpty;

/// Whether drawer tool [id] belongs to [p]; always true for a profile that hides nothing.
bool toolRelevant(ToolProfile p, String id) => showsEverything(p) || p.tools.contains(id);

/// Whether the Insert menu entry [id] belongs to [p].
bool insertRelevant(ToolProfile p, String id) => showsEverything(p) || !_gatedInsert.contains(id) || p.insert.contains(id);

/// Whether the built-in simulation named [name] (`SimKind.name`) belongs to [p].
bool simRelevant(ToolProfile p, String name) => showsEverything(p) || p.sims.isEmpty || p.sims.contains(name);
