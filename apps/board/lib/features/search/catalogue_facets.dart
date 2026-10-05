import 'package:kinetix_3d/kinetix_3d.dart';
import 'package:kinetix_labs/kinetix_labs.dart';

import 'fuzzy.dart';
import 'search_strings.dart';

/// Subject, topic and class for the 3D models and the virtual labs, so a teacher can go
/// Physics → Light and optics → Class 10 in the browsers and find things by name in any of
/// the board's languages.

enum CatalogueKind { model3d, lab }

/// The board's languages, for titles.
const searchLanguages = ['en', 'hi', 'kn'];

class CatalogueItem {
  CatalogueItem({
    required this.id,
    required this.kind,
    required this.titles,
    required this.subject,
    required this.category,
    required this.levels,
    this.keywords = const [],
  }) : target = SearchTarget([
          for (final t in titles.values) SearchField(t),
          for (final k in keywords) SearchField(k, 0.7),
          for (final lang in searchLanguages) ...[
            SearchField(SearchStrings(lang).subjectName(subject), 0.4),
            SearchField(SearchStrings(lang).categoryName(category), 0.5),
          ],
        ]);

  final String id;
  final CatalogueKind kind;

  /// Titles by language code; English is always there.
  final Map<String, String> titles;

  /// A key of [catalogueSubjects] and one of its [catalogueCategories].
  final String subject, category;

  /// Level codes: '1'…'12', 'lkg', 'ukg', 'ug', 'pg', in order.
  final List<String> levels;
  final List<String> keywords;
  final SearchTarget target;

  String titleIn(String lang) => titles[lang] ?? titles['en']!;
}

/// Subjects in the order the dropdown lists them.
const catalogueSubjects = ['physics', 'chemistry', 'biology', 'maths', 'electronics', 'geography', 'space', 'forensics'];

/// Each subject's topics, in order, with the words that put a model or a lab in them. The
/// first that fits wins; nothing fitting means 'other'.
const catalogueCategories = <String, List<(String, List<String>)>>{
  'physics': [
    ('optics', ['light', 'lens', 'mirror', 'refraction', 'reflection', 'prism', 'optic', 'dispersion', 'spectrum', 'focal', 'glass slab', 'telescope', 'microscope', 'total internal']),
    ('magnetism', ['magnet', 'motor', 'generator', 'induction', 'transformer', 'solenoid', 'flux', 'compass']),
    ('electricity', ['electric', 'current', 'resist', 'ohm', 'circuit', 'voltage', 'potential', 'battery', 'capacitor', 'wheatstone', 'meter bridge', 'potentiometer', 'galvanometer', 'joule']),
    ('waves', ['sound', 'wave', 'resonance', 'sonometer', 'echo', 'tuning fork']),
    ('heat', ['heat', 'temperature', 'thermal', 'calorimet', 'specific heat', 'cooling', 'boiling', 'melting']),
    ('modern', ['photoelectric', 'radioactiv', 'nucleus', 'semiconductor', 'diode', 'transistor', 'logic gate']),
    ('mechanics', ['force', 'motion', 'pendulum', 'friction', 'gravit', 'machine', 'lever', 'pulley', 'momentum', 'velocity', 'acceleration', 'projectile', 'density', 'pressure', 'buoyan', 'archimedes', 'spring', 'hooke', 'elastic', 'collision', 'inclined', 'vernier', 'screw gauge', 'viscosity', 'surface tension', 'oscillation', 'mass', 'weight']),
  ],
  'chemistry': [
    ('reactions', ['reaction', 'combustion', 'displacement', 'oxidation', 'reduction', 'redox', 'rate', 'catalyst', 'decomposition', 'precipitat', 'electrolysis', 'corrosion', 'enthalpy', 'kinetics']),
    ('acids', ['acid', 'base', 'indicator', 'titration', 'salt', 'neutralis', 'neutraliz', 'alkali']),
    ('organic', ['carbon compound', 'organic', 'ester', 'soap', 'detergent', 'ethanol', 'hydrocarbon', 'polymer']),
    ('atoms', ['atom', 'molecule', 'orbital', 'bond', 'hybrid', 'lattice', 'crystal', 'element', 'periodic', 'isotope', 'electron']),
    ('mixtures', ['separation', 'filtration', 'distillation', 'chromatograph', 'mixture', 'solution', 'solubility', 'crystallis', 'evaporat', 'sublimation', 'colloid', 'suspension', 'melting', 'boiling', 'viscosity']),
  ],
  'biology': [
    ('humanBody', ['heart', 'brain', 'lung', 'digest', 'excret', 'skeleton', 'ear', 'eye', 'kidney', 'nephron', 'blood', 'nervous', 'respirat', 'circulat', 'human', 'muscle', 'pulse', 'teeth', 'tooth']),
    ('plants', ['plant', 'flower', 'leaf', 'photosynthesis', 'stomata', 'seed', 'germinat', 'root', 'transpiration', 'pollen', 'chlorophyll']),
    ('cells', ['cell', 'dna', 'microscope', 'mitosis', 'meiosis', 'genetic', 'chromosome', 'gene', 'heredity', 'neuron', 'tissue', 'osmosis']),
    ('ecology', ['ecosystem', 'environment', 'microb', 'food chain', 'pollution', 'adaptation', 'bacteria', 'fung', 'soil', 'water']),
  ],
  'electronics': [
    ('digital', ['logic', 'gate', 'binary', 'flip', 'counter', 'adder', 'boolean', 'digital']),
    ('components', ['resistor', 'capacitor', 'diode', 'transistor', 'led', 'zener', 'rectifier', 'amplifier']),
    ('circuits', ['circuit', 'oscillator', 'filter', 'multimeter', 'oscilloscope', 'meter']),
  ],
  'forensics': [
    ('tests', ['blood', 'toxic', 'ink', 'chromatograph', 'drug', 'chemical', 'test']),
    ('evidence', ['fingerprint', 'footprint', 'hair', 'fibre', 'fiber', 'ballistic', 'glass', 'document', 'evidence']),
  ],
  'maths': [
    ('trigonometry', ['trigonometr', 'sine', 'cosine', 'tangent', 'heights and distances']),
    ('statistics', ['probability', 'statistic', 'mean', 'median', 'data', 'chance', 'dice', 'coin']),
    ('algebra', ['graph', 'equation', 'polynomial', 'linear', 'quadratic', 'function', 'algebra', 'plot']),
    ('geometry', ['solid', 'shape', 'cube', 'cuboid', 'sphere', 'cone', 'cylinder', 'pyramid', 'prism', 'hemisphere', 'frustum', 'tetrahedron', 'net', 'area', 'volume', 'triangle', 'circle', 'angle', 'pythagoras', 'mensuration', 'geometr']),
  ],
  'geography': [
    ('earth', ['earth', 'layer', 'volcano', 'plate', 'rock', 'earthquake', 'mountain']),
  ],
  'space': [
    ('solarSystem', ['solar', 'planet', 'sun', 'moon', 'season', 'orbit', 'eclipse', 'star']),
  ],
};

/// The topic a model or lab with this [title] (and [more] words: keywords, its id) is in,
/// within [subject]: the title decides when it can.
String categoryFor(String subject, String title, [Iterable<String> more = const []]) {
  for (final text in [' ${normalizeSearch(title)} ', ' ${[title, ...more].map(normalizeSearch).join(' ')} ']) {
    for (final (key, hints) in catalogueCategories[subject] ?? const <(String, List<String>)>[]) {
      if (hints.any((h) => text.contains(' $h'))) return key;
    }
  }
  return 'other';
}

/// The order levels are listed in.
const levelOrder = ['lkg', 'ukg', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', 'ug', 'pg'];

List<String> sortLevels(Iterable<String> codes) => {...codes}.toList()..sort((a, b) => levelOrder.indexOf(a).compareTo(levelOrder.indexOf(b)));

String _subjectKey(String s) => switch (s.toLowerCase()) {
  'mathematics' || 'math' || 'maths' => 'maths',
  final k => k,
};

/// Every listed 3D model, the solids with their names in Hindi and Kannada too.
final List<CatalogueItem> modelItems = [
  for (final e in ModelCatalogue.entries)
    () {
      final subject = _subjectKey(e.subjects.first);
      final solid = e.solid;
      final titles = solid != null
          ? {for (final lang in searchLanguages) lang: SearchStrings(lang).solidName(solid.name)}
          : {for (final lang in searchLanguages) lang: e.titleIn(lang)};
      final keywords = [...e.keywords, if (solid != null) ...['solid', '3d shape', 'mensuration', 'volume', 'surface area'], e.id.replaceAll(RegExp('[._-]'), ' ')];
      return CatalogueItem(
        id: e.id,
        kind: CatalogueKind.model3d,
        titles: titles,
        subject: subject,
        category: categoryFor(subject, e.title, keywords),
        levels: sortLevels(e.classes.isNotEmpty ? e.classes.map((c) => '$c') : e.levels.map((l) => RegExp(r'\d+').firstMatch(l)?[0] ?? '').where((c) => c.isNotEmpty)),
        keywords: keywords,
      );
    }(),
];

/// Every virtual lab.
final List<CatalogueItem> labItems = [
  for (final e in LabCatalogue.entries)
    () {
      final subject = _subjectKey(e.domain.name);
      final lab = e.lab;
      final titles = {for (final lang in LabLang.values) lang.name: e.titleIn(lang)};
      final keywords = [...?lab?.keywords, ...e.topics, if (lab != null) lab.summary.of(LabLang.en)];
      return CatalogueItem(
        id: e.id,
        kind: CatalogueKind.lab,
        titles: titles,
        subject: subject,
        category: categoryFor(subject, e.title, [...?lab?.keywords, ...e.topics, e.id.replaceAll('-', ' ')]),
        levels: sortLevels(e.labLevels.map((l) => l.code)),
        keywords: keywords,
      );
    }(),
];

/// What the dropdowns offer, given what is chosen so far: subjects with something in them,
/// topics of the chosen subject, classes of what is left.
List<String> subjectsIn(List<CatalogueItem> items) => [for (final s in catalogueSubjects) if (items.any((i) => i.subject == s)) s];

List<String> categoriesIn(List<CatalogueItem> items, String? subject) {
  final present = {for (final i in items) if (subject == null || i.subject == subject) i.category};
  final order = [
    for (final s in subject == null ? catalogueSubjects : [subject]) ...[for (final (k, _) in catalogueCategories[s] ?? const <(String, List<String>)>[]) k],
    'other',
  ];
  return [for (final k in {...order}) if (present.contains(k)) k];
}

List<String> levelsIn(List<CatalogueItem> items, {String? subject, String? category}) =>
    sortLevels([for (final i in items) if ((subject == null || i.subject == subject) && (category == null || i.category == category)) ...i.levels]);

/// The items in [subject], [category] and [level] (null: any) that match [query], best
/// match first; with no query, in catalogue order.
List<CatalogueItem> filterCatalogue(List<CatalogueItem> items, {String? subject, String? category, String? level, String query = ''}) {
  final kept = [
    for (final i in items)
      if ((subject == null || i.subject == subject) && (category == null || i.category == category) && (level == null || i.levels.contains(level))) i,
  ];
  if (normalizeSearch(query).isEmpty) return kept;
  final scored = [for (final i in kept) (i, i.target.score(query))].where((e) => e.$2 > 0).toList()..sort((a, b) => b.$2.compareTo(a.$2));
  return [for (final (i, _) in scored) i];
}
