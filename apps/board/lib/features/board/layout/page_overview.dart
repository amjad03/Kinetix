import 'dart:convert';
import 'dart:io' show ZLibCodec;
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:share_plus/share_plus.dart';

import '../../../l10n/l10n.dart';
import '../chrome.dart';
import '../whiteboard_dialogs.dart' show confirmClearBoard;
import 'layout_strings.dart';
import 'ui_strings.dart';

/// The page overview (screen 9): every page as a 16:9 thumbnail of what is on it, in a grid
/// that scrolls, with an "add page" tile of the same size; hold a page and drag it onto another
/// to move it there. Duplicate, delete, clear, clear all and export as PDF, and zoom, underneath.
class PageOverview extends StatefulWidget {
  const PageOverview({super.key, required this.wb, required this.canvas, required this.onClose, this.width = 880});

  final WhiteboardController wb;

  /// The board's size on screen (the PDF's pages show at least this much).
  final Size canvas;
  final VoidCallback onClose;

  /// The sheet's widest; it takes less where there is less room.
  final double width;

  @override
  State<PageOverview> createState() => _PageOverviewState();
}

class _PageOverviewState extends State<PageOverview> {
  final _images = BoardImages();
  final _grid = ScrollController();

  @override
  void dispose() {
    _images.dispose();
    _grid.dispose();
    super.dispose();
  }

  Future<void> _export() async {
    final s = LayoutStrings.of(context);
    final l = context.l10n;
    try {
      final pdf = await boardPdf(widget.wb, widget.canvas);
      final name = 'KINETIX board ${DateFormat('yyyy-MM-dd HH.mm').format(DateTime.now())}.pdf';
      await sharePdf(name, pdf);
      if (mounted) showBoardMessage(context, s.exportedPdf);
    } catch (e) {
      if (mounted) showBoardMessage(context, l.couldNotShare('$e'));
    }
  }

  void _add() {
    widget.wb.addPage();
    // The new page comes into view.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_grid.hasClients) _grid.animateTo(_grid.position.maxScrollExtent, duration: Kx.fast, curve: Kx.emphasized);
    });
  }

  @override
  Widget build(BuildContext context) {
    final s = LayoutStrings.of(context);
    final l = context.l10n;
    final c = context.colors;
    final wb = widget.wb;
    final narrow = MediaQuery.sizeOf(context).width < 600;
    return ListenableBuilder(
      listenable: Listenable.merge([wb, wb.view, _images]),
      builder: (context, _) {
        final pages = wb.pages;
        Widget action(Key key, IconData icon, String label, VoidCallback? onTap) => OutlinedButton.icon(
          key: key,
          style: OutlinedButton.styleFrom(minimumSize: const Size(0, 44), padding: const EdgeInsets.symmetric(horizontal: Kx.s16), visualDensity: VisualDensity.compact),
          onPressed: onTap,
          icon: Icon(icon, size: 20),
          label: Text(label),
        );
        return ChromeSurface(
          key: const Key('page-overview-sheet'),
          radius: Kx.rXl,
          padding: EdgeInsets.zero,
          child: SizedBox(
            width: widget.width,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // The title, how many pages, and close.
                Padding(
                  padding: const EdgeInsets.fromLTRB(Kx.s20, Kx.s12, Kx.s8, Kx.s4),
                  child: Row(
                    children: [
                      Flexible(child: Text(s.pageOverview, style: context.text.titleMedium, maxLines: 1, overflow: TextOverflow.ellipsis)),
                      const SizedBox(width: Kx.s12),
                      Text(UiStrings.of(context).pages(pages.length), style: context.text.labelMedium?.copyWith(color: c.onSurfaceVariant)),
                      const Spacer(),
                      if (!narrow)
                        Padding(
                          padding: const EdgeInsets.only(right: Kx.s8),
                          child: Text(s.dragToReorder, style: context.text.labelSmall?.copyWith(color: c.onSurfaceVariant)),
                        ),
                      IconButton(key: const Key('overview-close'), tooltip: l.close, onPressed: widget.onClose, icon: const Icon(Icons.close)),
                    ],
                  ),
                ),
                Flexible(
                  child: LayoutBuilder(
                    builder: (context, box) {
                      // Each cell has half the gap around its tile, so a page dropped between
                      // two tiles still lands on one.
                      const gap = Kx.s12, pad = Kx.s20 - gap / 2;
                      final across = math.max(2, ((box.maxWidth - 2 * pad) / (narrow ? 160 : 212)).floor());
                      final tileW = (box.maxWidth - 2 * pad) / across - gap;
                      // A 16:9 picture and its number under it.
                      final tileH = tileW * 9 / 16 + 28;
                      return GridView.builder(
                        key: const Key('page-thumbnails'),
                        controller: _grid,
                        shrinkWrap: true,
                        padding: const EdgeInsets.fromLTRB(pad, Kx.s4, pad, Kx.s8),
                        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: across, mainAxisExtent: tileH + gap),
                        itemCount: pages.length + 1,
                        itemBuilder: (context, i) {
                          if (i == pages.length) {
                            return _Droppable(
                              onDrop: (from) => wb.movePage(from, pages.length - 1),
                              child: _AddTile(key: const Key('overview-add-page'), label: s.addPage, onTap: _add),
                            );
                          }
                          final thumb = _Thumb(
                            key: Key('page-thumb-$i'),
                            page: pages[i],
                            number: i + 1,
                            open: i == wb.pageIndex,
                            images: _images,
                            onTap: () => wb.goToPage(i),
                          );
                          return _Droppable(
                            onDrop: (from) => wb.movePage(from, i),
                            child: LongPressDraggable<int>(
                              data: i,
                              feedback: SizedBox(width: tileW, height: tileH, child: Opacity(opacity: 0.85, child: Material(type: MaterialType.transparency, child: thumb))),
                              childWhenDragging: Opacity(opacity: 0.3, child: thumb),
                              child: thumb,
                            ),
                          );
                        },
                      );
                    },
                  ),
                ),
                const Divider(height: 1),
                Padding(
                  padding: const EdgeInsets.fromLTRB(Kx.s20, Kx.s12, Kx.s20, Kx.s4),
                  child: Wrap(
                    spacing: Kx.s8,
                    runSpacing: Kx.s8,
                    children: [
                      action(const Key('overview-duplicate'), Icons.copy_all_outlined, s.duplicate, () => wb.duplicatePage(wb.pageIndex)),
                      action(const Key('overview-delete'), Icons.delete_outline, s.delete, wb.pageCount > 1 || wb.elements.isNotEmpty ? () => wb.deletePage(wb.pageIndex) : null),
                      action(const Key('overview-clear'), Icons.layers_clear_outlined, l.clearPage, wb.canClearPage ? wb.clearPage : null),
                      action(const Key('overview-clear-all'), Icons.delete_sweep_outlined, l.clearAllPages, wb.canClearAllPages ? () => confirmClearBoard(context, wb) : null),
                      FilledButton.tonalIcon(
                        key: const Key('overview-export'),
                        style: FilledButton.styleFrom(minimumSize: const Size(0, 44), padding: const EdgeInsets.symmetric(horizontal: Kx.s16), visualDensity: VisualDensity.compact),
                        onPressed: _export,
                        icon: const Icon(Icons.picture_as_pdf_outlined, size: 20),
                        label: Text(s.exportPdf),
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(Kx.s20, 0, Kx.s12, Kx.s8),
                  child: Row(
                    children: [
                      Text(s.zoom, style: context.text.labelLarge),
                      const Spacer(),
                      IconButton(key: const Key('zoom-out'), tooltip: l.zoomOut, onPressed: () => wb.zoomBy(1 / 1.25), icon: const Icon(Icons.remove)),
                      TextButton(key: const Key('zoom-reset'), onPressed: wb.resetZoom, child: Text('${(wb.view.value.scale * 100).round()}%')),
                      IconButton(key: const Key('zoom-in'), tooltip: l.zoomIn, onPressed: () => wb.zoomBy(1.25), icon: const Icon(Icons.add)),
                      IconButton(key: const Key('zoom-fit'), tooltip: l.zoomFit, onPressed: wb.fitContent, icon: const Icon(Icons.fit_screen_outlined)),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

/// A place in the grid a page can be dropped on (another page, or the add tile for the end).
class _Droppable extends StatelessWidget {
  const _Droppable({required this.onDrop, required this.child});

  final ValueChanged<int> onDrop;
  final Widget child;

  @override
  Widget build(BuildContext context) => DragTarget<int>(
    onAcceptWithDetails: (d) => onDrop(d.data),
    builder: (context, over, _) => Padding(
      padding: const EdgeInsets.all(Kx.s12 / 2),
      child: AnimatedScale(scale: over.isEmpty ? 1 : 1.04, duration: Kx.fast, child: child),
    ),
  );
}

/// The tile that adds a page: the size of a page's thumbnail.
class _AddTile extends StatelessWidget {
  const _AddTile({super.key, required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Semantics(
      button: true,
      label: label,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AspectRatio(
            aspectRatio: 16 / 9,
            child: Material(
              color: c.surfaceContainerHigh,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Kx.rMd), side: BorderSide(color: c.outlineVariant)),
              child: InkWell(
                borderRadius: BorderRadius.circular(Kx.rMd),
                onTap: onTap,
                child: Center(child: Icon(Icons.add, size: 32, color: c.primary)),
              ),
            ),
          ),
          const SizedBox(height: Kx.s4),
          Text(label, textAlign: TextAlign.center, maxLines: 1, overflow: TextOverflow.ellipsis, style: context.text.labelMedium?.copyWith(color: c.onSurfaceVariant)),
        ],
      ),
    );
  }
}

class _Thumb extends StatelessWidget {
  const _Thumb({super.key, required this.page, required this.number, required this.open, required this.images, required this.onTap});

  final WhiteboardPage page;
  final int number;
  final bool open;
  final BoardImages images;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AspectRatio(
          aspectRatio: 16 / 9,
          child: Material(
            color: page.background.paper,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(Kx.rMd),
              side: BorderSide(color: open ? c.primary : c.outlineVariant, width: open ? 3 : 1),
            ),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: onTap,
              child: RepaintBoundary(child: CustomPaint(painter: _ThumbPainter(page.elements, page.background, thumbArea(page.elements), images), size: Size.infinite)),
            ),
          ),
        ),
        const SizedBox(height: Kx.s4),
        Text(
          '$number',
          textAlign: TextAlign.center,
          style: context.text.labelMedium?.copyWith(fontWeight: open ? FontWeight.w700 : null, color: open ? c.primary : c.onSurfaceVariant),
        ),
      ],
    );
  }
}

/// What a page's thumbnail shows: what is written on it, with a margin, widened to 16:9 (a
/// 1920 × 1080 sheet for an empty page).
Rect thumbArea(List<BoardElement> elements) {
  if (elements.isEmpty) return Offset.zero & boardSheet;
  var r = contentBounds(elements).inflate(48);
  final w = math.max(r.width, math.max(480.0, r.height * 16 / 9));
  final h = w * 9 / 16;
  r = Rect.fromCenter(center: r.center, width: w, height: h);
  return r;
}

/// What a page's thumbnail and PDF page show: the screen's area and anything drawn beyond it.
Rect pageArea(List<BoardElement> elements, Size canvas) {
  final screen = Offset.zero & (canvas.isEmpty ? boardSheet : canvas);
  return elements.isEmpty ? screen : screen.expandToInclude(contentBounds(elements).inflate(24));
}

class _ThumbPainter extends CustomPainter {
  _ThumbPainter(this.elements, this.background, this.area, this.images) : super(repaint: images);

  final List<BoardElement> elements;
  final BoardBackground background;
  final Rect area;
  final BoardImages images;

  @override
  void paint(Canvas canvas, Size size) {
    final k = math.min(size.width / area.width, size.height / area.height);
    canvas
      ..drawRect(Offset.zero & size, Paint()..color = background.paper)
      ..scale(k)
      ..translate(-area.left, -area.top);
    paintBoardBackground(canvas, area, background, scale: k);
    for (final e in elements) {
      paintElement(canvas, e, background, images: images);
    }
  }

  @override
  bool shouldRepaint(_ThumbPainter old) => old.elements != elements || old.background != background || old.area != area;
}

/// Opens the share sheet with the PDF. Tests replace it.
Future<void> Function(String name, Uint8List pdf) sharePdf = (name, pdf) =>
    SharePlus.instance.share(ShareParams(files: [XFile.fromData(pdf, name: name, mimeType: 'application/pdf')], fileNameOverrides: [name]));

/// Every page of [wb] as a PDF: one picture per page, at most 1600 px wide.
Future<Uint8List> boardPdf(WhiteboardController wb, Size canvas) async {
  final pages = <(int, int, Uint8List)>[];
  for (final p in wb.pages) {
    final area = pageArea(p.elements, canvas);
    final k = area.width > 1600 ? 1600 / area.width : 1.0;
    final w = math.max(1, (area.width * k).round()), h = math.max(1, (area.height * k).round());
    final images = BoardImages();
    await images.preload(p.elements);
    final recorder = ui.PictureRecorder();
    final c = Canvas(recorder)
      ..scale(k)
      ..translate(-area.left, -area.top);
    paintBoardBackground(c, area, p.background);
    for (final e in p.elements) {
      paintElement(c, e, p.background, images: images, paintMath: true);
    }
    final image = await recorder.endRecording().toImage(w, h);
    final data = await image.toByteData(format: ui.ImageByteFormat.rawRgba);
    image.dispose();
    images.dispose();
    final rgba = data!.buffer.asUint8List();
    final rgb = Uint8List(w * h * 3);
    for (var i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
      rgb[j] = rgba[i];
      rgb[j + 1] = rgba[i + 1];
      rgb[j + 2] = rgba[i + 2];
    }
    pages.add((w, h, Uint8List.fromList(ZLibCodec().encode(rgb))));
  }
  return pdfOfImages(pages);
}

/// A minimal PDF: each page is one RGB picture (zlib-compressed) filling it, 72 dpi.
Uint8List pdfOfImages(List<(int, int, Uint8List)> pages) {
  final out = BytesBuilder();
  final offsets = <int>[];
  void add(String s) => out.add(latin1.encode(s));
  void obj(int n, String body, [Uint8List? stream]) {
    offsets.add(out.length);
    add('$n 0 obj\n$body\n');
    if (stream != null) {
      add('stream\n');
      out.add(stream);
      add('\nendstream\n');
    }
    add('endobj\n');
  }

  add('%PDF-1.4\n%âãÏÓ\n');
  final kids = [for (var i = 0; i < pages.length; i++) '${3 + i * 3} 0 R'].join(' ');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [$kids] /Count ${pages.length} >>');
  for (var i = 0; i < pages.length; i++) {
    final (w, h, data) = pages[i];
    final page = 3 + i * 3;
    final content = latin1.encode('q $w 0 0 $h 0 0 cm /Im0 Do Q');
    obj(page, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 $w $h] /Resources << /XObject << /Im0 ${page + 2} 0 R >> >> /Contents ${page + 1} 0 R >>');
    obj(page + 1, '<< /Length ${content.length} >>', Uint8List.fromList(content));
    obj(page + 2, '<< /Type /XObject /Subtype /Image /Width $w /Height $h /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${data.length} >>', data);
  }
  final xref = out.length;
  add('xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n');
  for (final o in offsets) {
    add('${o.toString().padLeft(10, '0')} 00000 n \n');
  }
  add('trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n$xref\n%%EOF\n');
  return out.toBytes();
}
