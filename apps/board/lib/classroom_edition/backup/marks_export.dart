import 'dart:convert';
import 'dart:typed_data';

import 'package:intl/intl.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import '../class_tools/class_records.dart';
import '../class_tools/paper_pdf.dart' show pdfTheme;
import '../local/classroom_store.dart';

final _day = DateFormat('d MMM yyyy');
final _fileDay = DateFormat('yyyy-MM-dd');

/// One test of a class whose marks can be exported: a mock test, or a day's class quiz (marks:
/// questions right of the questions asked that day).
class MarksTest {
  const MarksTest({required this.id, required this.title, required this.at, required this.outOf, required this.marks});

  final String id;
  final String title;
  final DateTime at;
  final double outOf;

  /// By roll number; a roll number missing was absent or not marked.
  final Map<int, double> marks;

  double? get average => marks.isEmpty ? null : marks.values.reduce((a, b) => a + b) / marks.length;
  double? get highest => marks.isEmpty ? null : marks.values.reduce((a, b) => a > b ? a : b);
}

/// The tests of a class, oldest first: its mock tests and its class quizzes, one per day.
List<MarksTest> marksTests(ClassRecords r) {
  final out = <MarksTest>[
    for (final m in r.mocks) MarksTest(id: 'mock-${m.id}', title: m.title, at: m.at, outOf: m.maxMarks, marks: m.marks),
  ];
  final byDay = <String, List<QuizRecord>>{};
  for (final q in r.quizzes) {
    (byDay[_fileDay.format(q.at)] ??= []).add(q);
  }
  for (final e in byDay.entries) {
    final qs = e.value;
    final marks = <int, double>{};
    for (final q in qs) {
      for (final roll in {...q.right, ...q.wrong}) {
        marks[roll] = (marks[roll] ?? 0) + (q.right.contains(roll) ? 1 : 0);
      }
    }
    out.add(MarksTest(id: 'quiz-${e.key}', title: 'Class quiz', at: qs.first.at, outOf: qs.length.toDouble(), marks: marks));
  }
  return out..sort((a, b) => a.at.compareTo(b.at));
}

String _n(double v) => v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(1);

String _csvField(String s) => RegExp(r'[",\n\r]').hasMatch(s) ? '"${s.replaceAll('"', '""')}"' : s;

String _csvRow(List<Object?> cells) => cells.map((c) => _csvField(c == null ? '' : '$c')).join(',');

/// A test's marks as CSV for a spreadsheet: a heading block, then one row per roll number of
/// the class (absent or not marked: empty marks). Roll numbers only, never a name.
String marksCsv({required String college, required CeClass cls, required String subject, required MarksTest test}) {
  final b = StringBuffer();
  b.writeln(_csvRow(['College', college]));
  b.writeln(_csvRow(['Class', cls.name]));
  if (subject.isNotEmpty) b.writeln(_csvRow(['Subject', subject]));
  b.writeln(_csvRow(['Test', test.title]));
  b.writeln(_csvRow(['Date', _day.format(test.at)]));
  b.writeln(_csvRow(['Out of', _n(test.outOf)]));
  b.writeln();
  b.writeln(_csvRow(['Roll No.', 'Marks', 'Out of', 'Percent']));
  for (final roll in cls.rolls) {
    final m = test.marks[roll];
    b.writeln(_csvRow([roll, m == null ? 'Absent' : _n(m), _n(test.outOf), m == null || test.outOf <= 0 ? '' : (100 * m / test.outOf).toStringAsFixed(0)]));
  }
  return b.toString();
}

/// Every test of a class in one sheet: a row per roll number, a column per test.
String allMarksCsv({required String college, required CeClass cls, required String subject, required List<MarksTest> tests}) {
  final b = StringBuffer();
  b.writeln(_csvRow(['College', college]));
  b.writeln(_csvRow(['Class', cls.name]));
  if (subject.isNotEmpty) b.writeln(_csvRow(['Subject', subject]));
  b.writeln();
  b.writeln(_csvRow(['Roll No.', for (final t in tests) '${t.title} (${_day.format(t.at)}, out of ${_n(t.outOf)})']));
  for (final roll in cls.rolls) {
    b.writeln(_csvRow([roll, for (final t in tests) t.marks[roll] == null ? 'Absent' : _n(t.marks[roll]!)]));
  }
  return b.toString();
}

/// CSV bytes as spreadsheets on the board's computers open them (UTF-8 with a byte-order mark).
Uint8List csvBytes(String csv) => Uint8List.fromList([0xEF, 0xBB, 0xBF, ...utf8.encode(csv)]);

/// "1st-PUC-A_mock-test-2_2026-11-09.csv".
String marksFileName(CeClass cls, MarksTest? test, String ext) {
  String slug(String s) => s.trim().replaceAll(RegExp(r'[^A-Za-z0-9]+'), '-').replaceAll(RegExp(r'^-|-$'), '');
  final stem = [slug(cls.name), if (test == null) 'all-tests' else slug(test.title).toLowerCase(), if (test != null) _fileDay.format(test.at)].join('_');
  return '$stem.$ext';
}

/// A test's marks as a printable PDF: the college, class and test, average and highest, then
/// a table of roll numbers and marks.
Future<Uint8List> marksPdf({required String college, required CeClass cls, required String subject, required MarksTest test, pw.ThemeData? theme}) async {
  final doc = pw.Document(title: '${cls.name} · ${test.title}', theme: theme ?? await pdfTheme());
  const navy = PdfColor.fromInt(0xFF13165A);
  final rows = [
    for (final roll in cls.rolls)
      [
        '$roll',
        test.marks[roll] == null ? 'Absent' : _n(test.marks[roll]!),
        test.marks[roll] == null || test.outOf <= 0 ? '' : '${(100 * test.marks[roll]! / test.outOf).toStringAsFixed(0)}%',
      ],
  ];
  doc.addPage(
    pw.MultiPage(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.fromLTRB(40, 36, 40, 36),
      header: (_) => pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          if (college.isNotEmpty) pw.Text(college, style: const pw.TextStyle(fontSize: 11, color: PdfColors.grey700)),
          pw.Text('${cls.name}${subject.isEmpty ? '' : ' · $subject'}', style: pw.TextStyle(fontSize: 18, fontWeight: pw.FontWeight.bold, color: navy)),
          pw.Text('${test.title} · ${_day.format(test.at)} · out of ${_n(test.outOf)}', style: const pw.TextStyle(fontSize: 12)),
          pw.SizedBox(height: 6),
          pw.Text(
            [
              '${test.marks.length} of ${cls.rollCount} marked',
              if (test.average != null) 'average ${_n(test.average!)}',
              if (test.highest != null) 'highest ${_n(test.highest!)}',
            ].join(' · '),
            style: const pw.TextStyle(fontSize: 10, color: PdfColors.grey700),
          ),
          pw.SizedBox(height: 12),
        ],
      ),
      footer: (c) => pw.Align(alignment: pw.Alignment.centerRight, child: pw.Text('Page ${c.pageNumber} of ${c.pagesCount}', style: const pw.TextStyle(fontSize: 9, color: PdfColors.grey600))),
      build: (_) => [
        pw.TableHelper.fromTextArray(
          headers: const ['Roll No.', 'Marks', 'Percent'],
          data: rows,
          headerStyle: pw.TextStyle(fontWeight: pw.FontWeight.bold, color: PdfColors.white, fontSize: 11),
          headerDecoration: const pw.BoxDecoration(color: navy),
          cellStyle: const pw.TextStyle(fontSize: 11),
          cellAlignments: const {0: pw.Alignment.center, 1: pw.Alignment.center, 2: pw.Alignment.center},
          oddRowDecoration: const pw.BoxDecoration(color: PdfColor.fromInt(0xFFF3F6FB)),
          cellHeight: 20,
        ),
      ],
    ),
  );
  return doc.save();
}
