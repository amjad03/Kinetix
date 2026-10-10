/// How a hub entry runs.
enum SimKindOf {
  /// An HTML5 sim shipped in assets/simhub and served from the board's loopback server (works offline).
  bundled,

  /// A web page loaded from its own site (needs internet).
  online,

  /// A Flutter widget in the app (works offline unless [SimEntry.needsNet]).
  native,
}

/// One simulation in the Simulations hub. The fields subject, gradeMin, gradeMax, tags and
/// offline are what a subject-context registry filters on.
class SimEntry {
  const SimEntry({
    required this.id,
    required this.title,
    required this.subject,
    required this.gradeMin,
    required this.gradeMax,
    required this.kind,
    required this.source,
    required this.licence,
    this.tags = const [],
    this.url,
    this.asset,
    this.needsNet = false,
    this.note,
  });

  final String id, title, subject, source, licence;

  /// Classes 1 to 12; 13 stands for college.
  final int gradeMin, gradeMax;
  final List<String> tags;
  final SimKindOf kind;

  /// The page for [SimKindOf.online]; for bundled, the file under assets/simhub/.
  final String? url, asset;

  /// A native sim that also calls a web service (LanguageTool, map tiles).
  final bool needsNet;

  /// A licence or availability note shown under the sim.
  final String? note;

  /// Works with no internet.
  bool get offline => kind != SimKindOf.online && !needsNet;

  /// Whether the sim needs internet to run at all (online pages, LanguageTool).
  bool get requiresNet => kind == SimKindOf.online || (kind == SimKindOf.native && needsNet && id != 'map-lab');

  Map<String, Object?> toJson() => {
    'id': id,
    'title': title,
    'subject': subject,
    'gradeMin': gradeMin,
    'gradeMax': gradeMax,
    'tags': tags,
    'offline': offline,
    'source': source,
    'licence': licence,
  };

  bool coversGrade(int g) => g >= gradeMin && g <= gradeMax;
}

/// Subjects in the order the hub lists them.
const simSubjects = ['physics', 'chemistry', 'biology', 'maths', 'electronics', 'cs', 'economics', 'psychology', 'geography', 'history', 'language', 'general'];

const _phetCredit = 'PhET Interactive Simulations, University of Colorado Boulder, CC BY 4.0';

SimEntry _phet(String id, String title, String subject, int lo, int hi, List<String> tags) => SimEntry(
  id: 'phet-$id',
  title: 'PhET: $title',
  subject: subject,
  gradeMin: lo,
  gradeMax: hi,
  kind: SimKindOf.bundled,
  asset: 'phet/$id.html',
  source: 'PhET',
  licence: 'CC BY 4.0',
  tags: ['phet', ...tags],
  note: _phetCredit,
);

SimEntry _web(String id, String title, String subject, int lo, int hi, String url, String source, String licence, List<String> tags, {String? note}) => SimEntry(
  id: id,
  title: title,
  subject: subject,
  gradeMin: lo,
  gradeMax: hi,
  kind: SimKindOf.online,
  url: url,
  source: source,
  licence: licence,
  tags: tags,
  note: note,
);

SimEntry _native(String id, String title, String subject, int lo, int hi, String source, String licence, List<String> tags, {bool needsNet = false, String? note}) => SimEntry(
  id: id,
  title: title,
  subject: subject,
  gradeMin: lo,
  gradeMax: hi,
  kind: SimKindOf.native,
  source: source,
  licence: licence,
  tags: tags,
  needsNet: needsNet,
  note: note,
);

/// The hub's catalogue. Every online URL was checked with `curl -I` (docs/licensing/SIMULATIONS.md).
final List<SimEntry> simCatalogue = List.unmodifiable([
  // Bundled PhET sims (offline).
  _phet('projectile-motion', 'Projectile Motion', 'physics', 9, 12, ['motion', 'kinematics']),
  _phet('pendulum-lab', 'Pendulum Lab', 'physics', 8, 12, ['oscillation', 'gravity']),
  _phet('circuit-construction-kit-dc', 'Circuit Construction Kit: DC', 'physics', 8, 12, ['circuits', 'current', 'ohm']),
  _phet('wave-on-a-string', 'Wave on a String', 'physics', 9, 12, ['waves']),
  _phet('forces-and-motion-basics', 'Forces and Motion: Basics', 'physics', 6, 9, ['force', 'newton']),
  _phet('energy-skate-park-basics', 'Energy Skate Park: Basics', 'physics', 6, 10, ['energy']),
  _phet('gravity-and-orbits', 'Gravity and Orbits', 'physics', 9, 12, ['gravity', 'astronomy']),
  _phet('density', 'Density', 'physics', 6, 9, ['matter']),
  _phet('states-of-matter', 'States of Matter', 'chemistry', 6, 10, ['matter', 'particles']),
  _phet('build-an-atom', 'Build an Atom', 'chemistry', 8, 11, ['atom', 'isotope']),
  _phet('ph-scale', 'pH Scale', 'chemistry', 9, 12, ['acid', 'base']),
  _phet('balancing-chemical-equations', 'Balancing Chemical Equations', 'chemistry', 9, 11, ['equations']),
  _phet('molecule-polarity', 'Molecule Polarity', 'chemistry', 11, 13, ['bonding']),
  _phet('natural-selection', 'Natural Selection', 'biology', 9, 12, ['evolution', 'genetics']),
  _phet('fractions-intro', 'Fractions: Intro', 'maths', 3, 7, ['fractions']),
  // Online physics, chemistry, maths and electronics.
  _web('phet-all', 'PhET: all simulations (online catalogue)', 'physics', 1, 13, 'https://phet.colorado.edu/en/simulations/filter?type=html', 'PhET', 'CC BY 4.0', ['phet', 'catalogue'], note: _phetCredit),
  _web('osp', 'Open Source Physics (EJS web sims)', 'physics', 9, 13, 'https://www.compadre.org/osp/EJSS/', 'Open Source Physics / ComPADRE', 'Per item, mostly CC BY-NC-SA', ['osp', 'ejs']),
  _web('mw-nextgen', 'Molecular Workbench (Next-Gen)', 'chemistry', 8, 13, 'https://mw.concord.org/nextgen/', 'Concord Consortium', 'Per activity, mostly CC BY', ['molecules', 'energy']),
  _web('labxchange', 'LabXchange', 'biology', 9, 13, 'https://www.labxchange.org/', 'LabXchange (Harvard)', 'Per item, mostly CC BY', ['lab', 'virtual']),
  _web('chemcollective', 'ChemCollective virtual lab', 'chemistry', 9, 13, 'https://chemcollective.org/vlabs', 'ChemCollective (Carnegie Mellon)', 'CC BY-NC-SA', ['titration', 'virtual-lab']),
  _web('geogebra', 'GeoGebra', 'maths', 1, 13, 'https://www.geogebra.org/classic', 'GeoGebra', 'Non-commercial only', ['geometry', 'graphing', 'algebra'], note: 'Free for non-commercial use. Commercial use needs a GeoGebra licence. Not bundled.'),
  _web('polypad', 'Mathigon Polypad', 'maths', 1, 12, 'https://mathigon.org/polypad', 'Mathigon', 'Free to use online', ['manipulatives', 'tiles']),
  _web('circuitjs', 'CircuitJS (Falstad)', 'electronics', 9, 13, 'https://falstad.com/circuit/circuitjs.html', 'Paul Falstad', 'GPL-2.0 (loaded from its site)', ['circuits', 'analog'], note: 'GPL software, loaded from falstad.com and not bundled.'),
  _web('circuitverse', 'CircuitVerse', 'electronics', 9, 13, 'https://circuitverse.org/simulator', 'CircuitVerse', 'MIT', ['logic', 'digital']),
  _web('wokwi', 'Wokwi (Arduino and ESP32)', 'electronics', 8, 13, 'https://wokwi.com/', 'Wokwi', 'Free tier', ['arduino', 'microcontroller']),
  _web('molstar', '3D molecules (Mol* viewer)', 'biology', 9, 13, 'https://molstar.org/viewer/', 'Mol* / RCSB PDB', 'MIT; PDB data CC0', ['3d', 'protein', 'molecules']),
  _native('model3d', '3D biology models (board 3D viewer)', 'biology', 5, 12, 'KINETIX 3D viewer', 'Open models, see 3D credits', ['3d', 'anatomy']),
  // Economics.
  _web('econgraphs', 'EconGraphs (interactive economics graphs)', 'economics', 11, 13, 'https://www.econgraphs.org/', 'EconGraphs', 'CC BY-NC-SA', ['demand', 'supply', 'graphs']),
  _native('macro-money', 'Money and banking macro model', 'economics', 11, 13, 'KINETIX (original)', 'KINETIX', ['money-multiplier', 'banking', 'macro']),
  // Psychology.
  _web('pavlovia', 'PsychoJS / Pavlovia experiments', 'psychology', 11, 13, 'https://pavlovia.org/explore', 'Pavlovia (PsychoPy)', 'Per experiment; PsychoJS GPL-3.0', ['experiments', 'psychopy']),
  _native('pebl-stroop', 'Stroop test', 'psychology', 9, 13, 'Classic test (PEBL-style), KINETIX', 'KINETIX', ['attention', 'pebl']),
  _native('pebl-reaction', 'Reaction time', 'psychology', 6, 13, 'Classic test (PEBL-style), KINETIX', 'KINETIX', ['reaction', 'pebl']),
  _native('pebl-span', 'Memory span', 'psychology', 6, 13, 'Classic test (PEBL-style), KINETIX', 'KINETIX', ['memory', 'pebl']),
  // Geography, history, language, CS and general.
  _native('map-lab', 'Map lab (layers, markers, measure)', 'geography', 6, 13, 'OpenStreetMap contributors (ODbL) via flutter_map', 'BSD-3 (flutter_map); ODbL map data', ['gis', 'qgis', 'maps'], needsNet: true, note: 'Map tiles are from OpenStreetMap contributors and need internet.'),
  _native('geo-quiz', 'Geography map quiz', 'geography', 5, 12, 'KINETIX', 'KINETIX', ['quiz', 'maps', 'capitals']),
  _web('timelinejs', 'TimelineJS', 'history', 6, 13, 'https://timeline.knightlab.com/', 'Knight Lab', 'MPL-2.0', ['timeline']),
  _native('timeline', 'Timeline from key dates', 'history', 6, 12, 'KINETIX key-dates data', 'See assets/history/CREDITS.txt', ['timeline', 'dates']),
  _native('grammar', 'Grammar check (LanguageTool)', 'language', 6, 13, 'LanguageTool public API', 'LGPL-2.1 (service)', ['grammar', 'spelling'], needsNet: true, note: 'Needs internet: the text is sent to api.languagetool.org.'),
  _web('learningapps', 'LearningApps', 'general', 1, 12, 'https://learningapps.org/', 'LearningApps.org', 'Per app, mostly CC BY-SA', ['quiz', 'games']),
  _web('jupyterlite', 'JupyterLite (Python in the browser)', 'cs', 9, 13, 'https://jupyterlite.github.io/demo/lab/index.html', 'JupyterLite', 'BSD-3', ['python', 'notebook']),
  const SimEntry(
    id: 'blockly',
    title: 'Blockly (block coding)',
    subject: 'cs',
    gradeMin: 4,
    gradeMax: 12,
    kind: SimKindOf.bundled,
    asset: 'blockly/index.html',
    source: 'Google Blockly',
    licence: 'Apache-2.0',
    tags: ['coding', 'blocks', 'javascript'],
    note: 'Blockly, Google LLC, Apache-2.0.',
  ),
]);

/// What a subject-context registry asks the catalogue: a subject, a class, a search word, offline only.
List<SimEntry> filterSims({String? subject, int? grade, String query = '', bool offlineOnly = false, List<SimEntry>? from}) {
  final q = query.trim().toLowerCase();
  return [
    for (final e in from ?? simCatalogue)
      if ((subject == null || e.subject == subject) &&
          (grade == null || e.coversGrade(grade)) &&
          (!offlineOnly || e.offline) &&
          (q.isEmpty || e.title.toLowerCase().contains(q) || e.tags.any((t) => t.contains(q)) || e.source.toLowerCase().contains(q)))
        e,
  ];
}

SimEntry? simById(String id) {
  for (final e in simCatalogue) {
    if (e.id == id) return e;
  }
  return null;
}
