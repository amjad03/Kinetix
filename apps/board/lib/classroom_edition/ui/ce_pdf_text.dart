import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/painting.dart';
import 'package:kinetix_ui/kinetix_ui.dart' show KxFonts;
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

/// Kannada in the Classroom edition's PDFs (marks, the recovery code, the quick-start sheet).
///
/// The `pdf` package draws a font's glyphs one after another with no Indic shaping, so Kannada
/// vowel signs and conjuncts (ಕ್ಷ, ಪ್ರ, ತ್ತ) come out broken. Text with Kannada in it is laid out
/// by Flutter's own text engine instead (HarfBuzz, with the Noto Sans Kannada already bundled in
/// kinetix_ui under the SIL Open Font License: no new font) and placed in the PDF as a sharp
/// picture at [CePdfText.scale]× the point size. Latin text stays real PDF text.
///
/// Pictures are made ahead with [prepare] (it is asynchronous); [text] then gives the widget.
class CePdfText {
  CePdfText();

  /// Pixels per PDF point in the pictures (4: 288 dpi, sharp in print).
  static const scale = 4.0;

  final _done = <String, ({pw.MemoryImage image, double width, double height})>{};

  /// Whether [s] has any Kannada letter.
  static bool hasKannada(String s) => RegExp('[ಀ-೿]').hasMatch(s);

  static String _key(String text, double size, bool bold, PdfColor color, double? maxWidth) => '$text|$size|$bold|${color.toInt()}|$maxWidth';

  /// Lays out each of [texts] that has Kannada, at [size] points (wrapped at [maxWidth]).
  Future<void> prepare(Iterable<String> texts, {required double size, bool bold = false, PdfColor color = PdfColors.black, double? maxWidth}) async {
    for (final t in texts) {
      if (!hasKannada(t)) continue;
      final k = _key(t, size, bold, color, maxWidth);
      if (_done.containsKey(k)) continue;
      _done[k] = await _render(t, size: size, bold: bold, color: color, maxWidth: maxWidth);
    }
  }

  /// [text] as a PDF widget: real text, or the picture [prepare] made for it.
  pw.Widget text(String text, {required double size, bool bold = false, PdfColor color = PdfColors.black, double? maxWidth, pw.TextAlign align = pw.TextAlign.left}) {
    final pic = _done[_key(text, size, bold, color, maxWidth)];
    if (pic == null) {
      return pw.Text(text, textAlign: align, style: pw.TextStyle(fontSize: size, fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal, color: color));
    }
    return pw.Image(pic.image, width: pic.width, height: pic.height);
  }

  /// How many pictures were made (tests check that Kannada went in as pictures).
  int get pictures => _done.length;

  static Future<({pw.MemoryImage image, double width, double height})> _render(String text, {required double size, required bool bold, required PdfColor color, double? maxWidth}) async {
    final style = TextStyle(
      fontFamily: KxFonts.family,
      fontFamilyFallback: KxFonts.fallback,
      fontSize: size * scale,
      fontWeight: bold ? FontWeight.w700 : FontWeight.w400,
      color: Color(color.toInt()),
      height: 1.3,
    );
    final painter = TextPainter(text: TextSpan(text: text, style: style), textDirection: TextDirection.ltr)
      ..layout(maxWidth: maxWidth == null ? double.infinity : maxWidth * scale);
    final w = painter.width.ceil().clamp(1, 20000), h = painter.height.ceil().clamp(1, 20000);
    final recorder = ui.PictureRecorder();
    painter.paint(Canvas(recorder), Offset.zero);
    final img = await recorder.endRecording().toImage(w, h);
    final png = (await img.toByteData(format: ui.ImageByteFormat.png))!.buffer.asUint8List();
    img.dispose();
    painter.dispose();
    return (image: pw.MemoryImage(Uint8List.fromList(png)), width: w / scale, height: h / scale);
  }
}
