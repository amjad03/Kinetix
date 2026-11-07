import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

import 'class_logic.dart';
import 'paper.dart';

/// Printing and sharing the Class tools' PDFs (tests replace both).
abstract final class ClassToolsOut {
  /// Opens the system's print dialog with [pdf].
  static Future<void> Function(Uint8List pdf, String name) print = (pdf, name) => Printing.layoutPdf(onLayout: (_) async => pdf, name: name);

  /// Opens the share sheet (save, send) with [pdf].
  static Future<void> Function(Uint8List pdf, String name) share = (pdf, name) => Printing.sharePdf(bytes: pdf, filename: name);
}

pw.ThemeData? _theme;

/// The board's own fonts for PDFs (Inter, with Noto Sans Math for symbols), so ×, ⁻¹⁹, μ and ε
/// print. Falls back to the PDF's built-in Helvetica when the fonts cannot be read.
Future<pw.ThemeData> pdfTheme({AssetBundle? bundle}) async {
  if (_theme != null) return _theme!;
  final b = bundle ?? rootBundle;
  try {
    Future<pw.Font> font(String f) async => pw.Font.ttf(await b.load('packages/kinetix_ui/fonts/$f.ttf'));
    final math = await font('NotoSansMath-400');
    _theme = pw.ThemeData.withFont(base: await font('Inter-400'), bold: await font('Inter-700'), fontFallback: [math]);
  } catch (e) {
    debugPrint('PDF fonts not found, using Helvetica: $e');
    _theme = pw.ThemeData.base();
  }
  return _theme!;
}

const _navy = PdfColor.fromInt(0xFF13165A);
const _muted = PdfColor.fromInt(0xFF475569);
const _line = PdfColor.fromInt(0xFFD5DDE9);

/// A paper as PDF: [copies] copies (each bench's alternate copy in its own order when [sets]
/// has two papers), then the answer key on its own page(s) when [withKey].
Future<Uint8List> paperPdf(List<Paper> sets, {int copies = 1, bool withKey = true, pw.ThemeData? theme}) async {
  assert(sets.isNotEmpty);
  final doc = pw.Document(theme: theme ?? await pdfTheme(), title: sets.first.title, author: sets.first.college);
  for (var c = 0; c < copies; c++) {
    _paperPages(doc, sets[c % sets.length]);
  }
  if (withKey) {
    for (final p in sets) {
      _keyPages(doc, p);
    }
  }
  return doc.save();
}

void _paperPages(pw.Document doc, Paper p) {
  int? first;
  doc.addPage(
    pw.MultiPage(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.fromLTRB(48, 44, 48, 36),
      header: (ctx) {
        first ??= ctx.pageNumber;
        return pw.SizedBox();
      },
      footer: (ctx) => pw.Row(
        mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
        children: [
          pw.Text(p.set.isEmpty ? '' : 'Set ${p.set}', style: const pw.TextStyle(fontSize: 9, color: _muted)),
          pw.Text('Page ${ctx.pageNumber - (first ?? 1) + 1}', style: const pw.TextStyle(fontSize: 9, color: _muted)),
        ],
      ),
      build: (ctx) => [
        ..._header(p),
        for (final (si, s) in p.sections.indexed) ...[
          pw.SizedBox(height: si == 0 ? 4 : 12),
          pw.Text(
            p.sections.length == 1 && s.part.label == 'A' && p.minutes == 0 ? s.part.title : 'Part ${s.part.label} — ${s.part.title} ${s.marksLine}',
            style: pw.TextStyle(fontSize: 11, fontWeight: pw.FontWeight.bold, color: _navy),
          ),
          pw.SizedBox(height: 4),
          for (final i in s.items) _item(p, i),
        ],
      ],
    ),
  );
}

int _numberOf(Paper p, PaperItem i) => p.items.indexOf(i) + 1;

List<pw.Widget> _header(Paper p) => [
  if (p.college.isNotEmpty)
    pw.Center(
      child: pw.Text(
        p.college,
        style: pw.TextStyle(fontSize: 15, fontWeight: pw.FontWeight.bold, color: _navy),
      ),
    ),
  pw.SizedBox(height: 3),
  pw.Center(child: pw.Text([p.className, p.subject, p.title].where((s) => s.isNotEmpty).join(' · '), style: const pw.TextStyle(fontSize: 11))),
  if (p.chapters.isNotEmpty) ...[
    pw.SizedBox(height: 2),
    pw.Center(
      child: pw.Text(
        p.chapters.join(', '),
        textAlign: pw.TextAlign.center,
        style: pw.TextStyle(fontSize: 11, fontWeight: pw.FontWeight.bold),
      ),
    ),
  ],
  pw.SizedBox(height: 12),
  pw.Row(
    children: [
      pw.Expanded(child: pw.Text(p.minutes > 0 ? 'Time: ${fmtMinutes(p.minutes)}' : 'Date: ____________', style: const pw.TextStyle(fontSize: 9.5))),
      pw.Expanded(
        child: pw.Center(
          child: pw.Text('Roll No. ____________', style: pw.TextStyle(fontSize: 10, fontWeight: pw.FontWeight.bold)),
        ),
      ),
      pw.Expanded(
        child: pw.Align(
          alignment: pw.Alignment.centerRight,
          child: pw.Text('Max. marks: ${fmtMarks(p.maxMarks)}', style: const pw.TextStyle(fontSize: 9.5)),
        ),
      ),
    ],
  ),
  if (p.note.isNotEmpty) ...[pw.SizedBox(height: 4), pw.Text(p.note, style: const pw.TextStyle(fontSize: 9, color: _muted))],
  pw.SizedBox(height: 6),
  pw.Divider(color: _line, thickness: 0.8),
];

pw.Widget _item(Paper p, PaperItem i) {
  final n = _numberOf(p, i);
  final showMarks = i.kind != ItemKind.mcq || i.marks != 1;
  return pw.Padding(
    padding: const pw.EdgeInsets.only(top: 5),
    child: pw.Row(
      crossAxisAlignment: pw.CrossAxisAlignment.start,
      children: [
        pw.SizedBox(
          width: 24,
          child: pw.Text('$n.', style: pw.TextStyle(fontSize: 10.5, fontWeight: pw.FontWeight.bold)),
        ),
        pw.Expanded(
          child: pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
              pw.Text(i.text, style: const pw.TextStyle(fontSize: 10.5, lineSpacing: 1.5)),
              if (i.options.isNotEmpty) ...[
                pw.SizedBox(height: 3),
                pw.Wrap(
                  spacing: 10,
                  runSpacing: 2,
                  children: [
                    for (final (k, o) in i.options.indexed)
                      pw.SizedBox(
                        width: i.options.every((o) => o.length < 34) ? 212 : 440,
                        child: pw.Text('(${String.fromCharCode(97 + k)}) $o', style: const pw.TextStyle(fontSize: 10)),
                      ),
                  ],
                ),
              ],
            ],
          ),
        ),
        pw.SizedBox(
          width: 24,
          child: pw.Align(
            alignment: pw.Alignment.topRight,
            child: pw.Text(showMarks ? fmtMarks(i.marks) : '', style: const pw.TextStyle(fontSize: 10, color: _muted)),
          ),
        ),
      ],
    ),
  );
}

void _keyPages(pw.Document doc, Paper p) {
  doc.addPage(
    pw.MultiPage(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.fromLTRB(48, 44, 48, 36),
      build: (ctx) => [
        pw.Text(
          'Answer key${p.set.isEmpty ? '' : ' · Set ${p.set}'}',
          style: pw.TextStyle(fontSize: 16, fontWeight: pw.FontWeight.bold, color: _navy),
        ),
        pw.SizedBox(height: 2),
        pw.Text('${[p.className, p.subject, p.title].where((s) => s.isNotEmpty).join(' · ')} — for the teacher, not for students', style: const pw.TextStyle(fontSize: 10, color: _muted)),
        pw.SizedBox(height: 8),
        pw.Divider(color: _line, thickness: 0.8),
        for (final s in p.sections) ...[
          pw.SizedBox(height: 6),
          pw.Text(
            'Part ${s.part.label}',
            style: pw.TextStyle(fontSize: 11, fontWeight: pw.FontWeight.bold, color: _navy),
          ),
          for (final i in s.items)
            pw.Padding(
              padding: const pw.EdgeInsets.only(top: 4),
              child: pw.Row(
                crossAxisAlignment: pw.CrossAxisAlignment.start,
                children: [
                  pw.SizedBox(
                    width: 24,
                    child: pw.Text('${_numberOf(p, i)}.', style: pw.TextStyle(fontSize: 10, fontWeight: pw.FontWeight.bold)),
                  ),
                  pw.Expanded(
                    child: pw.Column(
                      crossAxisAlignment: pw.CrossAxisAlignment.start,
                      children: [
                        pw.Text(
                          i.kind == ItemKind.mcq
                              ? i.answer.replaceFirstMapped(RegExp('^([A-Z])\\.'), (m) => '(${m[1]!.toLowerCase()})')
                              : (i.kind == ItemKind.problem
                                    ? 'Answer: ${i.answer}'
                                    : i.answer.isEmpty
                                    ? 'See the lesson.'
                                    : 'Look for: ${i.answer}'),
                          style: pw.TextStyle(fontSize: 10, fontWeight: i.kind == ItemKind.long || i.kind == ItemKind.short ? pw.FontWeight.normal : pw.FontWeight.bold),
                        ),
                        if (i.kind == ItemKind.problem)
                          for (final st in i.steps) pw.Text(st, style: const pw.TextStyle(fontSize: 9.5, color: _muted)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
        ],
      ],
    ),
  );
}

/// The mastery map as a printable table (landscape A4): topics × roll numbers, each cell the
/// band's letter, and the class's score.
Future<Uint8List> masteryPdf(MasteryMap map, {required String title, String subtitle = '', pw.ThemeData? theme}) async {
  final doc = pw.Document(theme: theme ?? await pdfTheme(), title: title);
  const colours = {
    MasteryLevel.none: PdfColors.white,
    MasteryLevel.notYet: PdfColor.fromInt(0xFFFBE3EC),
    MasteryLevel.gettingThere: PdfColor.fromInt(0xFFFFF4CC),
    MasteryLevel.secure: PdfColor.fromInt(0xFFCFEBDC),
    MasteryLevel.mastered: PdfColor.fromInt(0xFF80C99F),
  };
  const chunk = 40;
  for (var start = 0; start < map.rolls.length || start == 0; start += chunk) {
    final rolls = map.rolls.skip(start).take(chunk).toList();
    doc.addPage(
      pw.Page(
        pageFormat: PdfPageFormat.a4.landscape,
        margin: const pw.EdgeInsets.all(28),
        build: (ctx) => pw.Column(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            pw.Text(
              title,
              style: pw.TextStyle(fontSize: 16, fontWeight: pw.FontWeight.bold, color: _navy),
            ),
            if (subtitle.isNotEmpty) pw.Text(subtitle, style: const pw.TextStyle(fontSize: 9.5, color: _muted)),
            pw.SizedBox(height: 10),
            pw.Table(
              columnWidths: {0: const pw.FixedColumnWidth(150), for (var i = 1; i <= rolls.length; i++) i: const pw.FlexColumnWidth(), rolls.length + 1: const pw.FixedColumnWidth(36)},
              children: [
                pw.TableRow(
                  children: [
                    pw.Text('Roll number', style: pw.TextStyle(fontSize: 7.5, fontWeight: pw.FontWeight.bold)),
                    for (final r in rolls) pw.Center(child: pw.Text(rollLabel(r), style: const pw.TextStyle(fontSize: 6.5))),
                    pw.Align(
                      alignment: pw.Alignment.centerRight,
                      child: pw.Text('Class', style: pw.TextStyle(fontSize: 7.5, fontWeight: pw.FontWeight.bold)),
                    ),
                  ],
                ),
                for (final row in map.rows)
                  pw.TableRow(
                    verticalAlignment: pw.TableCellVerticalAlignment.middle,
                    children: [
                      pw.Padding(
                        padding: const pw.EdgeInsets.symmetric(vertical: 3),
                        child: pw.Text(row.title, style: const pw.TextStyle(fontSize: 8), maxLines: 2),
                      ),
                      for (final r in rolls)
                        pw.Container(
                          height: 16,
                          margin: const pw.EdgeInsets.all(0.8),
                          decoration: pw.BoxDecoration(
                            color: colours[levelOf(row.scores[r])],
                            border: pw.Border.all(color: _line, width: 0.3),
                          ),
                        ),
                      pw.Align(
                        alignment: pw.Alignment.centerRight,
                        child: pw.Text(row.classScore == null ? '–' : '${(row.classScore! * 100).round()}%', style: pw.TextStyle(fontSize: 8.5, fontWeight: pw.FontWeight.bold)),
                      ),
                    ],
                  ),
              ],
            ),
            pw.SizedBox(height: 10),
            pw.Row(
              children: [
                for (final (l, name) in const [
                  (MasteryLevel.notYet, 'Not yet'),
                  (MasteryLevel.gettingThere, 'Getting there'),
                  (MasteryLevel.secure, 'Secure'),
                  (MasteryLevel.mastered, 'Mastered'),
                ]) ...[pw.Container(width: 10, height: 10, color: colours[l]), pw.SizedBox(width: 4), pw.Text(name, style: const pw.TextStyle(fontSize: 8)), pw.SizedBox(width: 14)],
              ],
            ),
            pw.Spacer(),
            pw.Text('Only roll numbers are shown.', style: const pw.TextStyle(fontSize: 8, color: _muted)),
          ],
        ),
      ),
    );
    if (map.rolls.length <= chunk) break;
  }
  return doc.save();
}
