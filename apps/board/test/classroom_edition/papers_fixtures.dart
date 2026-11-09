// Invented fixtures for the Past papers tests: PDFs made here with the pdf package and a tiny
// paper pack. None of it is from a real exam paper.
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/painting.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/classroom_edition/past_papers/paper_pack.dart';
import 'package:kinetix_board/classroom_edition/past_papers/pdf_pages.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:pdfrx/pdfrx.dart';

/// A made-up paper: a title page and [pages] − 1 pages of invented questions.
Future<Uint8List> fixturePdf(String title, {int pages = 3, bool key = false}) async {
  final doc = pw.Document(title: title);
  for (var p = 1; p <= pages; p++) {
    doc.addPage(
      pw.Page(
        pageFormat: PdfPageFormat.a4,
        build: (c) => pw.Column(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            pw.Text(title, style: pw.TextStyle(fontSize: 22, fontWeight: pw.FontWeight.bold)),
            pw.Text('Sample paper made up for tests - not a real exam. Page $p of $pages', style: const pw.TextStyle(fontSize: 11, color: PdfColors.grey700)),
            pw.Divider(),
            pw.SizedBox(height: 10),
            if (key)
              for (var q = 1; q <= 12; q++) pw.Padding(padding: const pw.EdgeInsets.only(bottom: 8), child: pw.Text('Q${(p - 1) * 12 + q}.  ${'ABCD'[(q * 7 + p) % 4]}', style: const pw.TextStyle(fontSize: 16)))
            else
              for (var q = 1; q <= 5; q++)
                pw.Padding(
                  padding: const pw.EdgeInsets.only(bottom: 18),
                  child: pw.Column(
                    crossAxisAlignment: pw.CrossAxisAlignment.start,
                    children: [
                      pw.Text('${(p - 1) * 5 + q}. A made-up question number ${(p - 1) * 5 + q} about an imaginary ball rolling on an imaginary floor. Which value is right?', style: const pw.TextStyle(fontSize: 14)),
                      pw.SizedBox(height: 6),
                      pw.Row(
                        children: [for (final o in ['(1) 2 m', '(2) 4 m', '(3) 6 m', '(4) 8 m']) pw.Expanded(child: pw.Text(o, style: const pw.TextStyle(fontSize: 13)))],
                      ),
                    ],
                  ),
                ),
          ],
        ),
      ),
    );
  }
  return doc.save();
}

/// A 1 × 1 PNG.
final tinyPng = base64Decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');

/// The sample pack's question sets (invented).
Map<String, dynamic> neetQuestions() => {
  'version': 1,
  'questions': [
    {
      'n': 1,
      'section': 'A',
      'subject': 'Physics',
      'chapter': 'Motion',
      'stem': 'A made-up ball rolls 2 m every second. How far does it go in 3 seconds?',
      'options': ['2 m', '4 m', '6 m', '8 m'],
      'answer': 'C',
    },
    {
      'n': 2,
      'section': 'A',
      'subject': 'Physics',
      'chapter': 'Light',
      'stem': 'Which colour does an imaginary prism bend most?',
      'options': ['Red', 'Green', 'Violet', 'Yellow'],
      'answer': 'C',
    },
    {
      'n': 3,
      'section': 'B',
      'subject': 'Chemistry',
      'chapter': 'Atoms',
      'image': 'neet/q3.png',
      'options': ['One', 'Two', 'Three', 'Four'],
      'answer': 'B',
    },
    {
      'n': 4,
      'section': 'B',
      'subject': 'Physics',
      'chapter': 'Motion',
      'crop': {
        'page': 1,
        'rect': [0.05, 0.12, 0.9, 0.2],
      },
      'options': ['2 m', '4 m', '6 m', '8 m'],
      'answer': 'B',
    },
  ],
};

Map<String, dynamic> jeeQuestions() => {
  'version': 1,
  'questions': [
    {'n': 1, 'subject': 'Mathematics', 'chapter': 'Numbers', 'stem': 'Pick every made-up even number.', 'options': ['2', '3', '4', '5'], 'answer': ['A', 'C']},
    {'n': 2, 'subject': 'Mathematics', 'chapter': 'Numbers', 'stem': 'Half of an imaginary 25?', 'answer': '12.5'},
    {'n': 3, 'subject': 'Physics', 'chapter': 'Motion', 'stem': 'A toy car goes 10 m in 5 s. Its speed?', 'options': ['1 m/s', '2 m/s', '5 m/s', '50 m/s'], 'answer': 'B', 'marks': 3, 'negative': 1},
  ],
};

/// The sample pack: NEET 2024 (key, four questions), JEE Main 2024 Shift 1 (three questions),
/// KCET 2023 Physics (key).
Future<Uint8List> fixturePack({String id = 'sample-pack'}) async {
  final files = <String, List<int>>{
    'neet/paper.pdf': await fixturePdf('Sample NEET-style paper', pages: 4),
    'neet/key.pdf': await fixturePdf('Sample answer key', pages: 2, key: true),
    'neet/questions.json': utf8.encode(jsonEncode(neetQuestions())),
    'neet/q3.png': tinyPng,
    'jee/paper.pdf': await fixturePdf('Sample JEE-style paper', pages: 2),
    'jee/questions.json': utf8.encode(jsonEncode(jeeQuestions())),
    'kcet/paper.pdf': await fixturePdf('Sample KCET-style physics paper', pages: 2),
    'kcet/key.pdf': await fixturePdf('Sample KCET answer key', pages: 1, key: true),
  };
  return writePaperPack(
    id: id,
    title: 'Sample papers (made up)',
    publisher: 'Tests',
    papers: [
      {'id': 'neet', 'exam': 'neet', 'year': 2024, 'subjects': ['Physics', 'Chemistry', 'Biology'], 'source': 'Sample pack (made up)', 'paper': 'neet/paper.pdf', 'answerKey': 'neet/key.pdf', 'questions': 'neet/questions.json'},
      {'id': 'jee', 'exam': 'jee-main', 'year': 2024, 'session': 'Shift 1', 'subjects': ['Physics', 'Chemistry', 'Mathematics'], 'source': 'Sample pack (made up)', 'paper': 'jee/paper.pdf', 'questions': 'jee/questions.json'},
      {'id': 'kcet', 'exam': 'kcet', 'year': 2023, 'subjects': ['Physics'], 'source': 'Sample pack (made up)', 'paper': 'kcet/paper.pdf', 'answerKey': 'kcet/key.pdf'},
    ],
    files: files,
  );
}

/// Real PDFium for the tests when this checkout has built it (build/native_assets), else
/// [FakePdfPages]. True when the pages are really drawn.
bool usePdfium() {
  final lib = File('build/native_assets/linux/libpdfium.so');
  if (!Platform.isLinux || !lib.existsSync()) {
    PdfPages.instance = FakePdfPages();
    return false;
  }
  Pdfrx.pdfiumModulePath = lib.absolute.path;
  final tmp = Directory.systemTemp.createTempSync('papers-pdfrx');
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(const MethodChannel('plugins.flutter.io/path_provider'), (c) async => tmp.path);
  PdfPages.instance = const PdfrxPages();
  return true;
}

/// Pages drawn as plain white A4 sheets with their number (no PDFium).
class FakePdfPages implements PdfPages {
  @override
  Future<PdfPagesDoc> open(Uint8List bytes) async {
    if (!looksLikePdf(bytes)) throw const FormatException('not a PDF');
    return _FakeDoc(countPdfPages(bytes));
  }
}

class _FakeDoc implements PdfPagesDoc {
  _FakeDoc(this.pageCount);

  @override
  final int pageCount;

  @override
  Size pageSize(int i) => const Size(595, 842);

  @override
  Future<ui.Image?> render(int i, {required double width, Rect? crop}) async {
    final c = crop ?? const Rect.fromLTWH(0, 0, 1, 1);
    final w = width.round(), h = (width * 842 / 595 * c.height / c.width).round();
    final rec = ui.PictureRecorder();
    final canvas = Canvas(rec)..drawRect(Rect.fromLTWH(0, 0, w.toDouble(), h.toDouble()), Paint()..color = const Color(0xFFFFFFFF));
    canvas.drawRect(Rect.fromLTWH(w * 0.1, h * 0.1, w * 0.8, h * 0.05), Paint()..color = const Color(0xFF13165A));
    return rec.endRecording().toImage(w, h);
  }

  @override
  Future<void> dispose() async {}
}
