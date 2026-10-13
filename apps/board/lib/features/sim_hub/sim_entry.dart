import 'sim_text.dart';

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

  /// The title in [lang] ('en', 'hi' or 'kn'); product names stay as they are.
  String titleIn(String lang) => simTitles[id]?[lang] ?? title;

  /// What the sim does, in one line, in [lang].
  String descriptionIn(String lang) => simDescriptions[id]?[lang] ?? simDescriptions[id]?['en'] ?? '';

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

  /// The PhET picture shown on the tile, if this is a PhET sim.
  String? get thumb => source == 'PhET' && asset != null ? 'assets/phet/thumbs/${id.substring(5)}.jpg' : null;

  /// Redistribution is not allowed, so the sim is only opened online from its own site.
  bool get online => kind == SimKindOf.online;

  bool coversGrade(int g) => g >= gradeMin && g <= gradeMax;
}

/// Subjects in the order the hub lists them.
const simSubjects = ['physics', 'chemistry', 'biology', 'earth', 'maths', 'electronics', 'cs', 'economics', 'psychology', 'geography', 'history', 'language', 'general'];

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

SimEntry _bundled(String id, String title, String subject, int lo, int hi, String asset, String source, String licence, List<String> tags, {String? note}) => SimEntry(
  id: id,
  title: title,
  subject: subject,
  gradeMin: lo,
  gradeMax: hi,
  kind: SimKindOf.bundled,
  asset: asset,
  source: source,
  licence: licence,
  tags: tags,
  note: note,
);

const _mwCredit = 'Molecular Workbench Next-Generation, Concord Consortium (Lab framework, MIT). Activities: CC BY';

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
  _phet('faradays-law', "Faraday's Law", 'physics', 9, 13, ['magnetism', 'induction']),
  _phet('magnet-and-compass', 'Magnet and Compass', 'physics', 6, 10, ['magnetism']),
  _phet('balloons-and-static-electricity', 'Balloons and Static Electricity', 'physics', 5, 9, ['static', 'charge']),
  _phet('john-travoltage', 'John Travoltage', 'physics', 6, 10, ['static', 'charge']),
  _phet('charges-and-fields', 'Charges and Fields', 'physics', 10, 13, ['electric-field']),
  _phet('ohms-law', "Ohm's Law", 'physics', 8, 12, ['circuits', 'ohm']),
  _phet('energy-forms-and-changes', 'Energy Forms and Changes', 'physics', 6, 10, ['energy', 'heat']),
  _phet('friction', 'Friction', 'physics', 6, 10, ['force', 'heat']),
  _phet('hookes-law', "Hooke's Law", 'physics', 8, 12, ['springs', 'force']),
  _phet('masses-and-springs', 'Masses and Springs', 'physics', 9, 13, ['springs', 'oscillation']),
  _phet('gravity-force-lab', 'Gravity Force Lab', 'physics', 8, 12, ['gravity']),
  _phet('collision-lab', 'Collision Lab', 'physics', 10, 13, ['momentum', 'collisions']),
  _phet('vector-addition', 'Vector Addition', 'physics', 9, 13, ['vectors']),
  _phet('bending-light', 'Bending Light', 'physics', 8, 12, ['optics', 'refraction']),
  _phet('geometric-optics', 'Geometric Optics', 'physics', 9, 13, ['optics', 'lens']),
  _phet('color-vision', 'Color Vision', 'physics', 7, 12, ['light', 'colour']),
  _phet('waves-intro', 'Waves Intro', 'physics', 6, 10, ['waves', 'sound', 'light']),
  _phet('sound-waves', 'Sound Waves', 'physics', 8, 12, ['sound', 'waves']),
  _phet('blackbody-spectrum', 'Blackbody Spectrum', 'physics', 11, 13, ['radiation']),
  _phet('greenhouse-effect', 'Greenhouse Effect', 'earth', 8, 13, ['climate', 'earth']),
  _phet('plinko-probability', 'Plinko Probability', 'maths', 9, 13, ['probability', 'statistics']),
  _phet('reactants-products-and-leftovers', 'Reactants, Products and Leftovers', 'chemistry', 9, 12, ['stoichiometry']),
  _phet('molarity', 'Molarity', 'chemistry', 10, 13, ['solutions']),
  _phet('acid-base-solutions', 'Acid-Base Solutions', 'chemistry', 9, 13, ['acid', 'base']),
  _phet('isotopes-and-atomic-mass', 'Isotopes and Atomic Mass', 'chemistry', 9, 13, ['isotope', 'atom']),
  _phet('molecule-shapes', 'Molecule Shapes', 'chemistry', 10, 13, ['bonding', 'vsepr']),
  _phet('area-builder', 'Area Builder', 'maths', 3, 7, ['area']),
  _phet('graphing-lines', 'Graphing Lines', 'maths', 7, 10, ['algebra', 'graphs']),
  _phet('graphing-quadratics', 'Graphing Quadratics', 'maths', 9, 12, ['algebra', 'graphs']),
  _phet('equality-explorer', 'Equality Explorer', 'maths', 5, 9, ['algebra', 'equations']),
  _phet('function-builder', 'Function Builder', 'maths', 6, 10, ['functions']),
  _phet('arithmetic', 'Arithmetic', 'maths', 2, 6, ['multiplication']),
  _phet('build-a-fraction', 'Build a Fraction', 'maths', 3, 7, ['fractions']),
  _phet('least-squares-regression', 'Least-Squares Regression', 'maths', 9, 13, ['statistics', 'regression']),
  _phet('gene-expression-essentials', 'Gene Expression Essentials', 'biology', 10, 13, ['dna', 'genetics']),
  _phet('neuron', 'Neuron', 'biology', 9, 13, ['nerves']),
  // Bundled web sims, served from the loopback server like PhET (docs/licensing/SIMULATIONS.md).
  _bundled('mw-gas-pressure', 'Molecular Workbench: volume and pressure of a gas', 'chemistry', 8, 13, 'mw/index.html#interactives/sam/gas-laws/3-volume-pressure-relationship.json', 'Concord Consortium', 'MIT (framework), CC BY (activity)', ['molecules', 'gas', 'pressure'], note: _mwCredit),
  _bundled('mw-gas-temperature', 'Molecular Workbench: temperature and volume of a gas', 'chemistry', 8, 13, 'mw/index.html#interactives/sam/gas-laws/4-temperature-volume-relationship.json', 'Concord Consortium', 'MIT (framework), CC BY (activity)', ['molecules', 'gas', 'temperature'], note: _mwCredit),
  _bundled('mw-phase-change', 'Molecular Workbench: phase change', 'chemistry', 8, 13, 'mw/index.html#interactives/sam/phase-change/6-phase-changes-caused-by-energy-input.json', 'Concord Consortium', 'MIT (framework), CC BY (activity)', ['molecules', 'energy', 'states'], note: _mwCredit),
  _bundled('mw-diffusion', 'Molecular Workbench: diffusion of a drop', 'biology', 8, 13, 'mw/index.html#interactives/sam/diffusion/1-dropping-dye-on-click.json', 'Concord Consortium', 'MIT (framework), CC BY (activity)', ['molecules', 'diffusion'], note: _mwCredit),
  _bundled('mw-membrane', 'Molecular Workbench: diffusion across a membrane', 'biology', 9, 13, 'mw/index.html#interactives/sam/diffusion/4-semipermeable.json', 'Concord Consortium', 'MIT (framework), CC BY (activity)', ['molecules', 'membrane', 'osmosis'], note: _mwCredit),
  _bundled('mw-oil-water', 'Molecular Workbench: oil and water', 'chemistry', 9, 13, 'mw/index.html#interactives/sam/intermolecular-attractions/3-1-oil-and-water.json', 'Concord Consortium', 'MIT (framework), CC BY (activity)', ['molecules', 'polarity'], note: _mwCredit),
  _bundled('circuitjs', 'CircuitJS (Falstad circuit simulator)', 'electronics', 9, 13, 'circuitjs/index.html', 'Paul Falstad', 'GPL-2.0-or-later (separate program)', ['circuits', 'analog'], note: 'CircuitJS1 by Paul Falstad, GPL-2.0-or-later. Shipped as a separate program; source: https://github.com/pfalstad/circuitjs1'),
  _bundled('circuitverse', 'CircuitVerse (digital logic simulator)', 'electronics', 9, 13, 'circuitverse/index.html', 'CircuitVerse', 'MIT', ['logic', 'digital'], note: 'CircuitVerse, MIT licence.'),
  _bundled('jupyterlite', 'JupyterLite (Python in the board)', 'cs', 9, 13, 'jupyterlite/repl/index.html?kernel=python&toolbar=1', 'JupyterLite, Pyodide', 'BSD-3-Clause; Pyodide MPL-2.0', ['python', 'console'], note: 'JupyterLite (BSD-3) with Pyodide (MPL-2.0). Extra Python packages need internet.'),
  _bundled('timelinejs', 'TimelineJS (timelines)', 'history', 6, 13, 'timelinejs/index.html', 'Knight Lab', 'MPL-2.0', ['timeline'], note: 'TimelineJS, Knight Lab, MPL-2.0.'),
  _bundled('jsxgraph-geometry', 'JSXGraph: dynamic geometry (open alternative to GeoGebra)', 'maths', 6, 13, 'jsxgraph/index.html#geometry', 'JSXGraph', 'MIT / LGPL-3.0', ['geometry', 'triangle', 'construction'], note: 'JSXGraph 1.9.2, MIT or LGPL-3.0.'),
  _bundled('jsxgraph-graph', 'JSXGraph: function graphs with sliders (open alternative to GeoGebra)', 'maths', 8, 13, 'jsxgraph/index.html#graph', 'JSXGraph', 'MIT / LGPL-3.0', ['graphing', 'algebra', 'functions'], note: 'JSXGraph 1.9.2, MIT or LGPL-3.0.'),
  // Online physics, chemistry, maths and electronics.
  _web('phet-all', 'PhET: all simulations (online catalogue)', 'physics', 1, 13, 'https://phet.colorado.edu/en/simulations/filter?type=html', 'PhET', 'CC BY 4.0', ['phet', 'catalogue'], note: _phetCredit),
  _web('osp', 'Open Source Physics (EJS web sims) [online, non-commercial licence]', 'physics', 9, 13, 'https://www.compadre.org/osp/EJSS/', 'Open Source Physics / ComPADRE', 'Per item, mostly CC BY-NC-SA', ['osp', 'ejs'], note: 'Non-commercial licences: not bundled. Opened online and kept for offline use after the first visit.'),
  _web('labxchange', 'LabXchange [online, not redistributable]', 'biology', 9, 13, 'https://www.labxchange.org/', 'LabXchange (Harvard)', 'Per item, mostly CC BY', ['lab', 'virtual']),
  _web('chemcollective', 'ChemCollective virtual lab [online, non-commercial licence]', 'chemistry', 9, 13, 'https://chemcollective.org/vlabs', 'ChemCollective (Carnegie Mellon)', 'CC BY-NC-SA', ['titration', 'virtual-lab']),
  _web('geogebra', 'GeoGebra [online, non-commercial licence]', 'maths', 1, 13, 'https://www.geogebra.org/classic', 'GeoGebra', 'Non-commercial only', ['geometry', 'graphing', 'algebra'], note: 'Free for non-commercial use. Commercial use needs a GeoGebra licence. Not bundled.'),
  _web('polypad', 'Mathigon Polypad [online, not redistributable]', 'maths', 1, 12, 'https://mathigon.org/polypad', 'Mathigon', 'Free to use online', ['manipulatives', 'tiles']),
  _web('wokwi', 'Wokwi (Arduino and ESP32) [online, not redistributable]', 'electronics', 8, 13, 'https://wokwi.com/', 'Wokwi', 'Free tier', ['arduino', 'microcontroller']),
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
  _native('timeline', 'Timeline from key dates', 'history', 6, 12, 'KINETIX key-dates data', 'See assets/history/CREDITS.txt', ['timeline', 'dates']),
  _native('grammar', 'Grammar check (LanguageTool)', 'language', 6, 13, 'LanguageTool public API', 'LGPL-2.1 (service)', ['grammar', 'spelling'], needsNet: true, note: 'Needs internet: the text is sent to api.languagetool.org.'),
  _web('learningapps', 'LearningApps', 'general', 1, 12, 'https://learningapps.org/', 'LearningApps.org', 'Per app, mostly CC BY-SA', ['quiz', 'games']),
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
/// The search word matches the title and description in English, Hindi or Kannada, the tags
/// and the source.
List<SimEntry> filterSims({String? subject, int? grade, String query = '', bool offlineOnly = false, List<SimEntry>? from}) {
  final q = query.trim().toLowerCase();
  bool hit(SimEntry e) =>
      e.title.toLowerCase().contains(q) ||
      e.tags.any((t) => t.contains(q)) ||
      e.source.toLowerCase().contains(q) ||
      [for (final l in ['en', 'hi', 'kn']) ...[?simTitles[e.id]?[l], ?simDescriptions[e.id]?[l]]].any((t) => t.toLowerCase().contains(q));
  return [
    for (final e in from ?? simCatalogue)
      if ((subject == null || e.subject == subject) && (grade == null || e.coversGrade(grade)) && (!offlineOnly || e.offline) && (q.isEmpty || hit(e))) e,
  ];
}

SimEntry? simById(String id) {
  for (final e in simCatalogue) {
    if (e.id == id) return e;
  }
  return null;
}
