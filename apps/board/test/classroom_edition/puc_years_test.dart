// Year labels: every Physics, Chemistry, Mathematics and Biology chapter on the board must be
// filed under the right PUC year. Karnataka's 1st PUC follows the NCERT Class 11 books and 2nd
// PUC the Class 12 books (the rationalised lists below), plus a few chapters the packs keep
// from the earlier NCERT syllabus, each under the class whose book had it. A chapter that is
// not in these lists fails too, so a new one is audited before it ships. Checked: the
// committed lessons catalogue and chapter files, the private Class tools bank when it is
// built, how the board reads a year, and the sample timetable the designs and screenshots use.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/classroom_edition/lessons/lesson_library.dart';
import 'package:kinetix_board/classroom_edition/local/classroom_store.dart';

import 'ce_support.dart';

/// (NCERT Class 11 → 1, Class 12 → 2) by subject, chapter title as the board shows it.
const _syllabus = <String, Map<String, int>>{
  'physics': {
    // Class 11, Part I and II (rationalised).
    'Units and Measurement': 1,
    'Motion in a Straight Line': 1,
    'Motion in a Plane': 1,
    'Laws of Motion': 1,
    'Work, Energy and Power': 1,
    'System of Particles and Rotational Motion': 1,
    'Gravitation': 1,
    'Mechanical Properties of Solids': 1,
    'Mechanical Properties of Fluids': 1,
    'Thermal Properties of Matter': 1,
    'Thermodynamics': 1,
    'Kinetic Theory': 1,
    'Oscillations': 1,
    'Waves': 1,
    // Class 11 topics from before rationalisation, kept as chapters of their own.
    'Relative Velocity': 1,
    'Doppler Effect in Sound': 1,
    'Accuracy, Precision and Errors in Measurement': 1,
    // Class 12, Part I and II (rationalised).
    'Electric Charges and Fields': 2,
    'Electrostatic Potential and Capacitance': 2,
    'Current Electricity': 2,
    'Moving Charges and Magnetism': 2,
    'Magnetism and Matter': 2,
    'Electromagnetic Induction': 2,
    'Alternating Current': 2,
    'Electromagnetic Waves': 2,
    'Ray Optics and Optical Instruments': 2,
    'Wave Optics': 2,
    'Dual Nature of Radiation and Matter': 2,
    'Atoms': 2,
    'Nuclei': 2,
    'Semiconductor Electronics: Materials, Devices and Simple Circuits': 2,
    // Class 12 topics from before rationalisation.
    'Metre Bridge and Potentiometer': 2,
    'Radioactivity': 2,
    'Zener Diode and Optoelectronic Devices': 2,
    'Digital Electronics and Logic Gates': 2,
  },
  'chemistry': {
    'Some Basic Concepts of Chemistry': 1,
    'Structure of Atom': 1,
    'Classification of Elements and Periodicity in Properties': 1,
    'Chemical Bonding and Molecular Structure': 1,
    'Thermodynamics': 1,
    'Equilibrium': 1,
    'Redox Reactions': 1,
    'Organic Chemistry: Some Basic Principles and Techniques': 1,
    'Hydrocarbons': 1,
    'Solutions': 2,
    'Electrochemistry': 2,
    'Chemical Kinetics': 2,
    'The d- and f-Block Elements': 2,
    'Coordination Compounds': 2,
    'Haloalkanes and Haloarenes': 2,
    'Alcohols, Phenols and Ethers': 2,
    'Aldehydes, Ketones and Carboxylic Acids': 2,
    'Amines': 2,
    'Biomolecules': 2,
  },
  'maths': {
    'Sets': 1,
    'Relations and Functions': 0, // in both books: Class 11 chapter 2 and Class 12 chapter 1
    'Trigonometric Functions': 1,
    'Complex Numbers and Quadratic Equations': 1,
    'Linear Inequalities': 1,
    'Permutations and Combinations': 1,
    'Binomial Theorem': 1,
    'Sequences and Series': 1,
    'Straight Lines': 1,
    'Conic Sections': 1,
    'Introduction to Three Dimensional Geometry': 1,
    'Limits and Derivatives': 1,
    'Statistics': 1,
    'Probability': 0, // Class 11 chapter 14 and Class 12 chapter 13
    // Class 11 before rationalisation (Mathematics), and Class 11 Statistics for Economics.
    'Mathematical Reasoning': 1,
    'Principle of Mathematical Induction': 1,
    'Correlation Analysis': 1,
    'Index Numbers and Moving Averages': 1,
    'Inverse Trigonometric Functions': 2,
    'Matrices': 2,
    'Determinants': 2,
    'Continuity and Differentiability': 2,
    'Application of Derivatives': 2,
    'Integrals': 2,
    'Application of Integrals': 2,
    'Differential Equations': 2,
    'Vector Algebra': 2,
    'Three Dimensional Geometry': 2,
    'Linear Programming': 2,
    // Class 12 applied topics (calculus in commerce, regression) kept by the packs.
    'Application of Calculus in Commerce and Economics': 2,
    'Linear Regression': 2,
  },
  'biology': {
    'The Living World': 1,
    'Biological Classification': 1,
    'Plant Kingdom': 1,
    'Animal Kingdom': 1,
    'Morphology of Flowering Plants': 1,
    'Anatomy of Flowering Plants': 1,
    'Structural Organisation in Animals': 1,
    'Cell: The Unit of Life': 1,
    'Biomolecules': 1,
    'Cell Cycle and Cell Division': 1,
    'Photosynthesis in Higher Plants': 1,
    'Respiration in Plants': 1,
    'Plant Growth and Development': 1,
    'Breathing and Exchange of Gases': 1,
    'Body Fluids and Circulation': 1,
    'Excretory Products and their Elimination': 1,
    'Locomotion and Movement': 1,
    'Neural Control and Coordination': 1,
    'Chemical Coordination and Integration': 1,
    // Class 11 before rationalisation.
    'Transport in Plants': 1,
    'Mineral Nutrition': 1,
    'Digestion and Absorption': 1,
    'Sexual Reproduction in Flowering Plants': 2,
    'Human Reproduction': 2,
    'Reproductive Health': 2,
    'Principles of Inheritance and Variation': 2,
    'Molecular Basis of Inheritance': 2,
    'Evolution': 2,
    'Human Health and Disease': 2,
    'Microbes in Human Welfare': 2,
    'Biotechnology: Principles and Processes': 2,
    'Biotechnology and its Applications': 2,
    'Organisms and Populations': 2,
    'Ecosystem': 2,
    'Biodiversity and Conservation': 2,
    // Class 12 before rationalisation.
    'Strategies for Enhancement in Food Production': 2,
  },
};

/// Chapters the rationalised NCERT books have in both classes, with the class's chapter number.
const _both = {
  ('maths', 'Relations and Functions'): {1: 2, 2: 1},
  ('maths', 'Probability'): {1: 14, 2: 13},
};

String _norm(String s) => s.toLowerCase().replaceAll(RegExp('[^a-z0-9]+'), ' ').trim();

/// The year a [subject] chapter titled [title] numbered [number] belongs to, or null when it is
/// not in the lists.
int? _expected(String subject, String title, int number) {
  final list = _syllabus[subject]!;
  final key = list.keys.where((k) => _norm(k) == _norm(title)).firstOrNull;
  if (key == null) return null;
  final y = list[key]!;
  if (y != 0) return y;
  final both = _both[(subject, key)]!;
  return both.entries.where((e) => e.value == number).firstOrNull?.key;
}

final _catalogue = jsonDecode(File('assets/lessons/puc/catalogue.json').readAsStringSync()) as Map<String, dynamic>;

void main() {
  test('every chapter of Physics, Chemistry, Mathematics and Biology is in its NCERT year', () {
    final wrong = <String>[];
    final seen = <String, Set<String>>{};
    for (final c in (_catalogue['chapters'] as List).cast<Map<String, dynamic>>()) {
      final subject = c['subject'] as String;
      if (!_syllabus.containsKey(subject)) continue;
      final title = (c['title'] as Map)['en'] as String;
      final ch = CatChapter.fromJson(c);
      final want = _expected(subject, title, c['number'] as int);
      if (want == null) {
        wrong.add('$subject "$title" (${c['id']}) is not in the audited lists');
        continue;
      }
      (seen[subject] ??= {}).add(_norm(title));
      if (ch.year != want) wrong.add('$subject "$title" shows as ${ch.year == 2 ? '2nd' : '1st'} PUC; NCERT Class ${want + 10} is ${want == 2 ? '2nd' : '1st'} PUC');
      if (c['year'] != 'puc$want' || !(c['id'] as String).startsWith('puc$want-')) wrong.add('$subject "$title": catalogue year ${c['year']}, id ${c['id']}');
      // The chapter's own file says the same.
      final f = File('assets/lessons/puc/${c['id']}.json.gz');
      final own = (jsonDecode(utf8.decode(gzip.decode(f.readAsBytesSync()))) as Map)['chapter'] as Map;
      if (own['year'] != 'puc$want') wrong.add('$subject "$title": its chapter file says ${own['year']}');
    }
    expect(wrong, isEmpty);
    // And nothing in the rationalised books is missing.
    for (final e in _syllabus.entries) {
      for (final t in e.value.keys) {
        expect(seen[e.key], contains(_norm(t)), reason: '${e.key} "$t" is not on the board');
      }
    }
    final eleven = CatChapter.fromJson((_catalogue['chapters'] as List).cast<Map<String, dynamic>>().firstWhere((c) => c['id'] == 'puc2-physics-01-electric-charges-and-fields'));
    expect(eleven.year, 2, reason: 'Electric Charges and Fields is 2nd PUC');
  });

  test('the Class tools bank, when built, files each chapter under the same year', () {
    final index = File('assets/private/class_tools/index.json');
    if (!index.existsSync()) return markTestSkipped('the private bank is not built');
    final wrong = <String>[];
    for (final s in ((jsonDecode(index.readAsStringSync()) as Map)['subjects'] as List).cast<Map>()) {
      final subject = s['subject'] as String;
      for (final c in (s['chapters'] as List).cast<Map>()) {
        if (!(c['id'] as String).startsWith('puc${s['year']}-')) wrong.add('${c['id']} under year ${s['year']}');
        if (!_syllabus.containsKey(subject)) continue;
        final want = _expected(subject, c['t'] as String, c['n'] as int);
        if (want != s['year']) wrong.add('$subject "${c['t']}": bank year ${s['year']}, NCERT ${want == null ? 'not listed' : 'Class ${want + 10}'}');
      }
    }
    expect(wrong, isEmpty);
  });

  test('a year is read from the chapter id first, and from any way of writing it', () {
    CatChapter chapter(String id, Object? year) => CatChapter.fromJson({'id': id, 'year': year, 'subject': 'physics', 'number': 1, 'title': {'en': 'X'}, 'topics': []});
    expect(chapter('puc2-physics-01-electric-charges-and-fields', 'puc2').year, 2);
    expect(chapter('puc2-physics-01-electric-charges-and-fields', null).year, 2);
    expect(chapter('puc2-physics-01-electric-charges-and-fields', 'puc1').year, 2, reason: 'the id is what the files are filed under');
    expect(chapter('x', 2).year, 2);
    expect(chapter('x', 'PUC2').year, 2);
    expect(chapter('x', 'II PUC').year, 2);
    expect(chapter('x', null).year, 0, reason: 'unknown is neither year, never 1st PUC by default');
    for (final (name, year) in const [
      ('2nd PUC A', 2),
      ('II PUC Science A', 2),
      ('Second PUC B', 2),
      ('Class XII', 2),
      ('12 A', 2),
      ('1st PUC A', 1),
      ('I PUC Commerce', 1),
      ('First PUC', 1),
      ('Class 11', 1),
      ('BCom Sem 3 A', null),
    ]) {
      expect(pucYearOfName(name), year, reason: name);
    }
  });

  test('the sample timetable (designs, screenshots) gives each class a chapter of its own year', () {
    final s = sampleCollege();
    final titles = {
      for (final c in (_catalogue['chapters'] as List).cast<Map<String, dynamic>>()) _norm((c['title'] as Map)['en'] as String): CatChapter.fromJson(c),
    };
    for (final slot in s.slots.where((x) => x.topic.isNotEmpty)) {
      final ch = titles[_norm(slot.topic)];
      if (ch == null) continue; // "Revision: electrostatics", "Practical: …"
      final cls = s.classes.firstWhere((c) => c.id == slot.classId);
      expect(ch.year, cls.year, reason: '${cls.name} · ${slot.subject} on "${slot.topic}" (${ch.year == 2 ? '2nd' : '1st'} PUC)');
    }
  });
}
