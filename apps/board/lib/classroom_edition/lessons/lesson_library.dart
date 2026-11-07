import 'dart:convert';
import 'dart:io' show gzip;

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:kinetix_lessons/kinetix_lessons.dart';

/// The PUC lessons bundled with the Classroom edition (assets/lessons/puc, built by
/// packages/kinetix_lessons/tool/bundle_puc.py from the Zynetix chapter packs): a catalogue of
/// levels, subjects, chapters and topics, and one gzipped file per chapter with its lessons and
/// questions. All offline.
///
/// When the build put the Zynetix School parts in assets/private/lessons (explainers, concept
/// videos, formula sheets, imported exam questions; never committed), each chapter's overlay is
/// merged in; without it the lessons are our own blocks only.
class LessonLibrary {
  LessonLibrary({AssetBundle? bundle, this.school = true}) : bundle = bundle ?? rootBundle;

  /// Merges the School parts when the build has them.
  final bool school;

  /// The board's library (the panel and the start screen's "Next lesson" line share it).
  static LessonLibrary instance = LessonLibrary();

  final AssetBundle bundle;
  static const root = 'assets/lessons/puc';
  static const privateRoot = 'assets/private/lessons';

  LessonCatalogue? _catalogue;
  Future<LessonCatalogue>? _loading;
  final _chapters = <String, InstalledPack>{};

  /// The catalogue once loaded (null before [catalogue] completes).
  LessonCatalogue? get loaded => _catalogue;

  Future<LessonCatalogue> catalogue() => _loading ??= () async {
    final text = await bundle.loadString('$root/catalogue.json', cache: false);
    return _catalogue = LessonCatalogue.fromJson(jsonDecode(text) as Map<String, dynamic>);
  }();

  /// A chapter's lessons and questions (cached; the last few chapters stay in memory).
  Future<InstalledPack> chapter(String chapterId) async {
    final hit = _chapters.remove(chapterId);
    if (hit != null) return _chapters[chapterId] = hit;
    final data = await bundle.load('$root/$chapterId.json.gz');
    final j = jsonDecode(utf8.decode(gzip.decode(data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes)))) as Map<String, dynamic>;
    Map<String, dynamic>? overlay;
    if (school) {
      try {
        final o = await bundle.load('$privateRoot/$chapterId.json.gz');
        overlay = jsonDecode(utf8.decode(gzip.decode(o.buffer.asUint8List(o.offsetInBytes, o.lengthInBytes)))) as Map<String, dynamic>;
      } catch (_) {
        // No School parts in this build (or none for this chapter).
      }
    }
    final pack = packFromJson(j, overlay: overlay);
    _chapters[chapterId] = pack;
    while (_chapters.length > 6) {
      _chapters.remove(_chapters.keys.first);
    }
    return pack;
  }

  /// A chapter bundle as an [InstalledPack]; [overlay] (the School parts) merged when given.
  @visibleForTesting
  static InstalledPack packFromJson(Map<String, dynamic> j, {Map<String, dynamic>? overlay}) {
    final chapter = Chapter.fromJson(j['chapter'] as Map<String, dynamic>);
    final questions = <String, Question>{
      for (final q in (j['questions'] as List? ?? const [])) (q as Map<String, dynamic>)['id'] as String: Question.fromJson(q),
      for (final q in (overlay?['questions'] as List? ?? const [])) (q as Map<String, dynamic>)['id'] as String: Question.fromJson(q),
    };
    final lessons = <String, Lesson>{};
    final ov = (overlay?['lessons'] as Map?)?.cast<String, dynamic>() ?? const {};
    for (final l in (j['lessons'] as List)) {
      final lj = Map<String, dynamic>.of(l as Map<String, dynamic>);
      final o = ov[lj['topicId']] as Map<String, dynamic>?;
      if (o != null) lj['blocks'] = mergeBlocks(lj['blocks'] as List, o);
      final lesson = Lesson.fromJson(lj);
      lessons[lesson.topicId] = lesson;
    }
    return InstalledPack(id: chapter.id, version: '${j['version'] ?? 1}', chapter: chapter, lessons: lessons, questions: questions, mediaDir: '', formulas: SheetFormula.sheet(overlay?['formulas']));
  }

  /// Our blocks with a School overlay: its blocks put back in their places ([order]) and the
  /// quiz blocks' full question lists.
  static List<dynamic> mergeBlocks(List<dynamic> blocks, Map<String, dynamic> o) {
    final ours = {for (final b in blocks) (b as Map)['id'] as String: Map<String, dynamic>.of(b.cast<String, dynamic>())};
    final theirs = (o['blocks'] as Map?)?.cast<String, dynamic>() ?? const {};
    final ids = (o['questionIds'] as Map?)?.cast<String, dynamic>() ?? const {};
    for (final e in ids.entries) {
      ours[e.key]?.addAll((e.value as Map).cast<String, dynamic>());
    }
    final order = [for (final i in (o['order'] as List? ?? const [])) i as String];
    if (order.isEmpty) return blocks;
    return [
      for (final id in order) ?(ours[id] ?? theirs[id]),
      // Anything of ours the overlay does not know (a newer bundle) goes at the end.
      for (final e in ours.entries)
        if (!order.contains(e.key)) e.value,
    ];
  }
}

/// The bundled catalogue: subjects (in the board's order) and chapters with their topics.
class LessonCatalogue {
  LessonCatalogue({required this.subjects, required this.chapters});
  final List<String> subjects;
  final List<CatChapter> chapters;

  factory LessonCatalogue.fromJson(Map<String, dynamic> j) =>
      LessonCatalogue(subjects: [for (final s in j['subjects'] as List) s as String], chapters: [for (final c in j['chapters'] as List) CatChapter.fromJson(c as Map<String, dynamic>)]);

  /// The chapters of 1st PUC ([year] 1) or 2nd PUC (2) in [subject], in order.
  List<CatChapter> chaptersOf(int year, String subject) => [
    for (final c in chapters)
      if (c.year == year && c.subject == subject) c,
  ];

  /// Subjects with chapters in [year].
  List<String> subjectsOf(int year) => [
    for (final s in subjects)
      if (chapters.any((c) => c.year == year && c.subject == s)) s,
  ];

  CatChapter? chapterOfTopic(String topicId) {
    final id = topicId.split('.').first;
    return chapters.where((c) => c.id == id).firstOrNull;
  }

  CatTopic? topic(String topicId) => chapterOfTopic(topicId)?.topics.where((t) => t.id == topicId).firstOrNull;
}

class CatChapter {
  CatChapter({required this.id, required this.year, required this.subject, required this.number, required this.title, required this.topics, required this.diagrams});
  final String id, subject;
  final int year, number, diagrams;
  final L10n title;
  final List<CatTopic> topics;

  factory CatChapter.fromJson(Map<String, dynamic> j) => CatChapter(
    id: j['id'] as String,
    year: j['year'] == 'puc2' ? 2 : 1,
    subject: j['subject'] as String,
    number: j['number'] as int,
    title: L10n.of(j['title']),
    diagrams: j['diagrams'] as int? ?? 0,
    topics: [for (final t in j['topics'] as List) CatTopic.fromJson(t as Map<String, dynamic>)],
  );
}

class CatTopic {
  CatTopic({required this.id, required this.title, required this.steps, required this.minutes, required this.kannada});
  final String id;
  final L10n title;
  final int steps, minutes;

  /// Some of the lesson is in Kannada.
  final bool kannada;

  factory CatTopic.fromJson(Map<String, dynamic> j) =>
      CatTopic(id: j['id'] as String, title: L10n.of(j['title']), steps: j['steps'] as int? ?? 1, minutes: j['minutes'] as int? ?? 40, kannada: j['kn'] == true);
}

/// The subject names the Classroom edition shows, and how a timetable's subject ("Maths",
/// "Mathematics", "Comp. Science") finds its lessons.
const subjectNamesEn = <String, String>{
  'physics': 'Physics',
  'chemistry': 'Chemistry',
  'maths': 'Maths',
  'biology': 'Biology',
  'computer_science': 'Computer Science',
  'electronics': 'Electronics',
  'statistics': 'Statistics',
  'accountancy': 'Accountancy',
  'business_studies': 'Business Studies',
  'economics': 'Economics',
  'commerce': 'Commerce',
  'english': 'English',
};

String subjectName(String id) => subjectNamesEn[id] ?? id;

/// The catalogue subject for a timetable subject name, or null.
String? subjectIdFor(String? name) {
  if (name == null) return null;
  final n = name.toLowerCase().replaceAll(RegExp(r'[^a-z]'), '');
  if (n.isEmpty) return null;
  if (n.startsWith('phy')) return 'physics';
  if (n.startsWith('chem')) return 'chemistry';
  if (n.startsWith('math')) return 'maths';
  if (n.startsWith('bio') || n == 'botany' || n == 'zoology') return 'biology';
  if (n.startsWith('comp') || n == 'cs') return 'computer_science';
  if (n.startsWith('elec')) return 'electronics';
  if (n.startsWith('stat')) return 'statistics';
  if (n.startsWith('acc')) return 'accountancy';
  if (n.startsWith('bus')) return 'business_studies';
  if (n.startsWith('eco')) return 'economics';
  if (n.startsWith('comm')) return 'commerce';
  if (n.startsWith('eng')) return 'english';
  return null;
}
