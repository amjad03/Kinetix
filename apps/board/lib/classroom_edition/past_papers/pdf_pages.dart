import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/painting.dart';
import 'package:pdfrx/pdfrx.dart';

/// An open PDF whose pages can be drawn: on the board with PDFium ([PdfrxPages], the same
/// renderer as the board's PDF import), offline.
abstract class PdfPagesDoc {
  int get pageCount;

  /// Page [i]'s size in points (0-based).
  Size pageSize(int i);

  /// Draws page [i] (0-based) as a picture [width] pixels wide, white behind it. With [crop]
  /// (0…1 of the page) only that part is drawn, and the part is [width] pixels wide.
  Future<ui.Image?> render(int i, {required double width, Rect? crop});

  Future<void> dispose();
}

/// Opens PDFs for [PdfPagesDoc]. Tests swap [instance].
abstract class PdfPages {
  /// Throws [FormatException] when [bytes] cannot be opened.
  Future<PdfPagesDoc> open(Uint8List bytes);

  static PdfPages instance = const PdfrxPages();
}

class PdfrxPages implements PdfPages {
  const PdfrxPages();

  @override
  Future<PdfPagesDoc> open(Uint8List bytes) async {
    await pdfrxFlutterInitialize();
    try {
      return _PdfrxDoc(await PdfDocument.openData(bytes));
    } catch (_) {
      throw const FormatException('cannot open the PDF');
    }
  }
}

class _PdfrxDoc implements PdfPagesDoc {
  _PdfrxDoc(this.doc);
  final PdfDocument doc;

  @override
  int get pageCount => doc.pages.length;

  @override
  Size pageSize(int i) => Size(doc.pages[i].width, doc.pages[i].height);

  @override
  Future<ui.Image?> render(int i, {required double width, Rect? crop}) async {
    final page = doc.pages[i];
    final c = crop ?? const Rect.fromLTWH(0, 0, 1, 1);
    // [width] is the width of the part drawn: the whole page is scaled to match.
    final fullW = width / c.width;
    final fullH = fullW * page.height / (page.width <= 0 ? 1 : page.width);
    final img = await page.render(
      x: (c.left * fullW).round(),
      y: (c.top * fullH).round(),
      width: (c.width * fullW).round(),
      height: (c.height * fullH).round(),
      fullWidth: fullW,
      fullHeight: fullH,
      backgroundColor: 0xFFFFFFFF,
    );
    if (img == null) return null;
    try {
      return await img.createImage();
    } finally {
      img.dispose();
    }
  }

  @override
  Future<void> dispose() => doc.dispose();
}

/// PNG bytes of [image].
Future<Uint8List> pngOf(ui.Image image) async => (await image.toByteData(format: ui.ImageByteFormat.png))!.buffer.asUint8List();
