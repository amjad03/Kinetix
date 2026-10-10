import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:pdfrx/pdfrx.dart';

import '../../l10n/l10n.dart';
import '../board/chrome.dart';
import 'device_files.dart';
import 'pptx_render.dart';
import 'presentation_pane.dart';

/// What kind of document a file is, from its first bytes (and its name for the old .ppt).
enum DocKind { pdf, pptx, ppt, other }

DocKind docKindOf(Uint8List bytes, String name) {
  bool starts(List<int> magic) => bytes.length >= magic.length && [for (var i = 0; i < magic.length; i++) bytes[i] == magic[i]].every((b) => b);
  if (starts(const [0x25, 0x50, 0x44, 0x46])) return DocKind.pdf; // %PDF
  if (starts(const [0x50, 0x4B, 0x03, 0x04])) return name.toLowerCase().endsWith('.pdf') ? DocKind.other : DocKind.pptx; // a zip
  if (starts(const [0xD0, 0xCF, 0x11, 0xE0])) return DocKind.ppt; // an Office 97–2003 file
  return DocKind.other;
}

/// One page of an imported document, drawn as a picture.
class ImportedPage {
  const ImportedPage(this.png, this.size);
  final Uint8List png;

  /// The picture's size in pixels.
  final Size size;
}

/// The most pages one import adds (each is a picture the board keeps in memory).
const maxImportPages = 60;

/// How wide imported pages are drawn, in pixels (and in board units).
const importPageWidth = 1600.0;

/// Draws a PDF's or a PowerPoint's pages as pictures, on the board: nothing is uploaded.
abstract class PageRenderer {
  /// Draws the pages of [bytes]. [onPage] reports progress. Throws [FormatException] when the
  /// file cannot be read.
  Future<List<ImportedPage>> render(Uint8List bytes, DocKind kind, {void Function(int done, int total)? onPage});

  static PageRenderer instance = const OnDeviceRenderer();
}

class OnDeviceRenderer implements PageRenderer {
  const OnDeviceRenderer();

  @override
  Future<List<ImportedPage>> render(Uint8List bytes, DocKind kind, {void Function(int done, int total)? onPage}) => switch (kind) {
    DocKind.pdf => _pdf(bytes, onPage),
    DocKind.pptx => _pptx(bytes, onPage),
    _ => throw const FormatException('not a PDF or PowerPoint'),
  };

  static Future<List<ImportedPage>> _pdf(Uint8List bytes, void Function(int, int)? onPage) async {
    await pdfrxFlutterInitialize();
    final PdfDocument doc;
    try {
      doc = await PdfDocument.openData(bytes);
    } catch (_) {
      throw const FormatException('cannot open the PDF');
    }
    try {
      final pages = doc.pages.take(maxImportPages).toList();
      final out = <ImportedPage>[];
      for (final (i, page) in pages.indexed) {
        final w = importPageWidth;
        final h = w * page.height / math.max(1, page.width);
        final img = await page.render(fullWidth: w, fullHeight: h, backgroundColor: 0xFFFFFFFF);
        if (img == null) continue;
        try {
          final image = await img.createImage();
          try {
            final data = await image.toByteData(format: ui.ImageByteFormat.png);
            out.add(ImportedPage(data!.buffer.asUint8List(), Size(image.width.toDouble(), image.height.toDouble())));
          } finally {
            image.dispose();
          }
        } finally {
          img.dispose();
        }
        onPage?.call(i + 1, pages.length);
      }
      return out;
    } finally {
      await doc.dispose();
    }
  }

  static Future<List<ImportedPage>> _pptx(Uint8List bytes, void Function(int, int)? onPage) async {
    final deck = parsePptx(bytes, maxSlides: maxImportPages);
    final out = <ImportedPage>[];
    for (final (i, slide) in deck.slides.indexed) {
      final png = await renderPptxSlide(slide, deck.size, width: importPageWidth);
      out.add(ImportedPage(png, Size(importPageWidth, (importPageWidth * deck.size.height / deck.size.width).roundToDouble())));
      onPage?.call(i + 1, deck.slides.length);
      // Let the progress show between slides.
      await Future<void>.delayed(Duration.zero);
    }
    return out;
  }
}

/// Board pages for [pages]: each page's picture as the backdrop of a page of its own, at the
/// top left, [importPageWidth] board units wide.
List<List<BoardElement>> backdropPages(List<ImportedPage> pages) => [
  for (final p in pages)
    [
      ImageElement(
        id: newElementId(),
        rect: Rect.fromLTWH(0, 0, importPageWidth, importPageWidth * p.size.height / math.max(1, p.size.width)),
        bytes: p.png,
        backdrop: true,
      ),
    ],
];

/// Picks a PDF or PowerPoint, draws its pages and adds them after the open page. Messages go
/// to the board's snack bar.
Future<void> importDocument(BuildContext context, WhiteboardController wb) async {
  final l = context.l10n;
  final file = await DeviceFiles.instance.pickDocument();
  if (file == null || !context.mounted) return;
  final kind = docKindOf(file.bytes, file.name);
  if (kind == DocKind.ppt) {
    showBoardMessage(context, l.importOldPpt);
    return;
  }
  if (kind == DocKind.other) {
    showBoardMessage(context, l.importNotSupported);
    return;
  }
  final progress = ValueNotifier<(int, int)>((0, 0));
  final dialog = showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (_) => BoardChromeTheme(child: _ImportProgress(name: file.name, progress: progress)),
  );
  List<ImportedPage>? pages;
  try {
    pages = await PageRenderer.instance.render(file.bytes, kind, onPage: (done, total) => progress.value = (done, total));
  } catch (e) {
    debugPrint('Import failed: $e');
  } finally {
    if (context.mounted) Navigator.of(context, rootNavigator: true).pop();
    await dialog;
    progress.dispose();
  }
  if (!context.mounted) return;
  if (pages == null || pages.isEmpty) {
    showBoardMessage(context, kind == DocKind.pdf ? l.importPdfFailed : l.importPptxFailed);
    return;
  }
  final host = presentationHost;
  if (host != null) {
    // A PDF or PPT opens beside the writing, on the side the intelligent split picks (spec §28).
    host(Presentation(name: file.name, bytes: file.bytes, pages: pages, left: presentationGoesLeft(wb.elements), isPdf: kind == DocKind.pdf));
    return;
  }
  wb.addPages(backdropPages(pages));
  showBoardMessage(context, l.importedPages(pages.length));
}

class _ImportProgress extends StatelessWidget {
  const _ImportProgress({required this.name, required this.progress});
  final String name;
  final ValueNotifier<(int, int)> progress;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return AlertDialog(
      scrollable: true,
      key: const Key('import-progress'),
      title: Text(l.importingFile(name)),
      content: SizedBox(
        width: 420,
        child: ValueListenableBuilder(
          valueListenable: progress,
          builder: (context, p, _) => Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              LinearProgressIndicator(value: p.$2 == 0 ? null : p.$1 / p.$2),
              const SizedBox(height: Kx.s12),
              Text(p.$2 == 0 ? l.importReading : l.importPageOf(p.$1, p.$2)),
            ],
          ),
        ),
      ),
    );
  }
}
