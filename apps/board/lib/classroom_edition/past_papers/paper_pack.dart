import 'dart:convert';

import 'package:archive/archive.dart';
import 'package:flutter/foundation.dart';

import 'exam_rules.dart';
import 'paper_model.dart';

/// A paper pack: a zip with `manifest.json`, the papers' PDFs, their answer keys, question
/// sets (`questions.json`) and the questions' pictures. The format is in README.md.
const packFormat = 'zynetix-paper-pack';

/// The newest pack version this board reads.
const packVersion = 1;

/// One paper as a pack's manifest lists it, with its files read from the zip.
@immutable
class PackPaper {
  const PackPaper({
    required this.id,
    required this.exam,
    required this.year,
    this.session = '',
    this.subjects = const [],
    this.language = 'English',
    this.source = '',
    required this.pdf,
    this.key,
    this.questions,
    this.images = const {},
  });

  final String id;
  final Exam exam;
  final int year;
  final String session;
  final List<String> subjects;
  final String language;
  final String source;
  final Uint8List pdf;
  final Uint8List? key;

  /// The question set, image paths as in the zip.
  final QuestionSet? questions;

  /// The question pictures, by their path in the zip.
  final Map<String, Uint8List> images;
}

/// A pack read from a zip.
@immutable
class PaperPack {
  const PaperPack({required this.id, required this.title, this.publisher = '', required this.version, required this.papers, this.problems = const []});

  final String id;
  final String title;
  final String publisher;
  final int version;
  final List<PackPaper> papers;

  /// Papers left out and why ("neet-2024: its answer key is not a PDF").
  final List<String> problems;
}

/// Reads a paper pack. Throws [FormatException] (plain words, for the teacher) when the zip is
/// not a pack this board can read; a paper with a problem is left out and named in
/// [PaperPack.problems], the rest still come in.
PaperPack readPaperPack(Uint8List zip) {
  final Archive archive;
  try {
    archive = ZipDecoder().decodeBytes(zip);
  } catch (_) {
    throw const FormatException('This file is not a paper pack (it is not a zip file).');
  }
  Uint8List? file(String path) {
    if (!safePackPath(path)) return null;
    final f = archive.findFile(path);
    return f == null || !f.isFile ? null : f.content;
  }

  final raw = file('manifest.json');
  if (raw == null) throw const FormatException('This zip is not a paper pack: it has no manifest.json.');
  final Object? m;
  try {
    m = jsonDecode(utf8.decode(raw));
  } catch (_) {
    throw const FormatException('The pack\'s manifest.json cannot be read.');
  }
  if (m is! Map || m['format'] != packFormat) throw const FormatException('This zip is not a Zynetix paper pack.');
  final version = (m['version'] as num?)?.toInt() ?? 0;
  if (version < 1) throw const FormatException('The paper pack has no version.');
  if (version > packVersion) throw const FormatException('This paper pack is for a newer Zynetix Board. Ask your IT person to update the board.');
  final list = m['papers'];
  if (list is! List || list.isEmpty) throw const FormatException('The paper pack has no papers in it.');

  final papers = <PackPaper>[];
  final problems = <String>[];
  for (final (i, e) in list.indexed) {
    final name = e is Map && e['id'] != null ? '${e['id']}' : 'paper ${i + 1}';
    try {
      if (e is! Map) throw const FormatException('it is not an object');
      papers.add(_paper(e.cast<String, dynamic>(), name, file));
    } on FormatException catch (x) {
      problems.add('$name: ${x.message}');
    }
  }
  return PaperPack(
    id: '${m['id'] ?? ''}'.trim(),
    title: '${m['title'] ?? 'Paper pack'}',
    publisher: '${m['publisher'] ?? ''}',
    version: version,
    papers: papers,
    problems: problems,
  );
}

PackPaper _paper(Map<String, dynamic> e, String id, Uint8List? Function(String) file) {
  final exam = Exam.parse(e['exam']);
  if (exam == null) throw FormatException('the exam "${e['exam']}" is not one this board knows');
  final year = (e['year'] as num?)?.toInt();
  if (year == null || year < 1980 || year > 2100) throw const FormatException('it has no year');
  final paperPath = '${e['paper'] ?? ''}';
  final pdf = file(paperPath);
  if (pdf == null) throw FormatException('its paper "$paperPath" is not in the zip');
  if (!looksLikePdf(pdf)) throw const FormatException('its paper is not a PDF');
  Uint8List? key;
  final keyPath = e['answerKey'];
  if (keyPath != null) {
    key = file('$keyPath');
    if (key == null) throw FormatException('its answer key "$keyPath" is not in the zip');
    if (!looksLikePdf(key)) throw const FormatException('its answer key is not a PDF');
  }
  QuestionSet? questions;
  final images = <String, Uint8List>{};
  final qPath = e['questions'];
  if (qPath != null) {
    final raw = file('$qPath');
    if (raw == null) throw FormatException('its questions "$qPath" are not in the zip');
    try {
      questions = QuestionSet.fromJson(jsonDecode(utf8.decode(raw)));
    } on FormatException catch (x) {
      throw FormatException('its questions cannot be used (${x.message})');
    }
    for (final q in questions.questions) {
      final img = q.image;
      if (img == null) continue;
      final bytes = file(img);
      if (bytes == null || !_looksLikePicture(bytes)) throw FormatException('the picture of question ${q.number} ("$img") is missing or not a PNG or JPEG');
      images[img] = bytes;
    }
  }
  return PackPaper(
    id: id,
    exam: exam,
    year: year,
    session: '${e['session'] ?? ''}',
    subjects: [for (final s in (e['subjects'] as List?) ?? const []) '$s'],
    language: '${e['language'] ?? 'English'}',
    source: '${e['source'] ?? ''}',
    pdf: pdf,
    key: key,
    questions: questions,
    images: images,
  );
}

/// A path inside a pack: relative, no `..`, no backslashes.
bool safePackPath(String p) => p.isNotEmpty && !p.startsWith('/') && !p.contains('\\') && !p.split('/').contains('..');

/// A PDF starts with `%PDF-` and ends with `%%EOF` (some writers add a few bytes after it).
bool looksLikePdf(Uint8List b) {
  if (b.length < 32 || latin1.decode(b.sublist(0, 5)) != '%PDF-') return false;
  final tail = latin1.decode(b.sublist(b.length > 1024 ? b.length - 1024 : 0), allowInvalid: true);
  return tail.contains('%%EOF');
}

bool _looksLikePicture(Uint8List b) => b.length > 8 && ((b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4E && b[3] == 0x47) || (b[0] == 0xFF && b[1] == 0xD8));

/// The pages of a PDF by its page objects (a first guess; the viewer knows for sure).
int countPdfPages(Uint8List pdf) => RegExp(r'/Type\s*/Page(?![a-zA-Z])').allMatches(latin1.decode(pdf, allowInvalid: true)).length;

/// Writes a paper pack (tests, and a college sharing papers it made itself). [papers]: the
/// manifest's entries with `paper`, `answerKey`, `questions` naming files in [files].
Uint8List writePaperPack({required String id, required String title, String publisher = '', required List<Map<String, dynamic>> papers, required Map<String, List<int>> files}) {
  final a = Archive()
    ..add(
      ArchiveFile.string(
        'manifest.json',
        const JsonEncoder.withIndent('  ').convert({'format': packFormat, 'version': packVersion, 'id': id, 'title': title, if (publisher.isNotEmpty) 'publisher': publisher, 'papers': papers}),
      ),
    );
  for (final e in files.entries) {
    a.add(ArchiveFile.bytes(e.key, e.value));
  }
  return ZipEncoder().encodeBytes(a);
}
