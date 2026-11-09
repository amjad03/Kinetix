import 'dart:typed_data';

import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import '../class_tools/paper_pdf.dart' show pdfTheme;
import '../l10n/ce_strings.dart';
import '../ui/ce_pdf_text.dart';
import 'ce_help.dart';

/// The one-page quick start (Help → Print the quick-start sheet): every how-to in short, for the
/// staff room wall, in [lang] ('kn': Kannada drawn through [CePdfText]).
Future<Uint8List> quickStartPdf({String lang = 'en', String college = '', pw.ThemeData? theme, CePdfText? pdfText}) async {
  final was = CeLang.code;
  CeLang.code = lang;
  try {
    final topics = helpTopics;
    final px = pdfText ?? CePdfText();
    const navy = PdfColor.fromInt(0xFF13165A);
    const boxW = 156.0;
    final title = ceIn(lang, 'Zynetix Classroom quick start');
    final line = ceIn(lang, 'Works offline. Teaching needs no PIN; Settings ask for the school PIN.');
    await px.prepare([title], size: 20, bold: true, color: navy);
    await px.prepare([line, college], size: 10, color: PdfColors.grey800);
    for (final t in topics) {
      await px.prepare([t.title], size: 12, bold: true, color: navy, maxWidth: boxW);
      await px.prepare([for (final (i, s) in t.steps.indexed) '${i + 1}. ${s.text}'], size: 8.5, maxWidth: boxW);
    }
    final doc = pw.Document(title: title, theme: theme ?? await pdfTheme());
    doc.addPage(
      pw.Page(
        pageFormat: PdfPageFormat.a4,
        margin: const pw.EdgeInsets.fromLTRB(28, 26, 28, 24),
        build: (_) => pw.Column(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            px.text(title, size: 20, bold: true, color: navy),
            if (college.isNotEmpty) px.text(college, size: 10, color: PdfColors.grey800),
            px.text(line, size: 10, color: PdfColors.grey800),
            pw.SizedBox(height: 10),
            pw.Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                for (final t in topics)
                  pw.Container(
                    width: boxW + 12,
                    padding: const pw.EdgeInsets.all(6),
                    decoration: pw.BoxDecoration(border: pw.Border.all(color: PdfColors.grey500, width: 0.8), borderRadius: const pw.BorderRadius.all(pw.Radius.circular(6))),
                    child: pw.Column(
                      crossAxisAlignment: pw.CrossAxisAlignment.start,
                      children: [
                        px.text(t.title, size: 12, bold: true, color: navy, maxWidth: boxW),
                        pw.SizedBox(height: 3),
                        for (final (i, s) in t.steps.indexed) pw.Padding(padding: const pw.EdgeInsets.only(bottom: 2), child: px.text('${i + 1}. ${s.text}', size: 8.5, maxWidth: boxW)),
                      ],
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
    return await doc.save();
  } finally {
    CeLang.code = was;
  }
}
