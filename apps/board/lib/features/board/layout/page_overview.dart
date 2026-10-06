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

/// The page overview (screen 9): every page as a thumbnail, drag to reorder, and duplicate,
/// delete, clear, clear all and export as PDF; zoom underneath.
class PageOverview extends StatefulWidget {
  const PageOverview({super.key, required this.wb, required this.canvas, required this.onClose, this.width = 640});

  final WhiteboardController wb;

  /// The board's size on screen: a page's thumbnail shows at least this much of it.
  final Size canvas;
  final VoidCallback onClose;
  final double width;

  @override
  State<PageOverview> createState() => _PageOverviewState();
}

class _PageOverviewState extends State<PageOverview> {
  final _images = BoardImages();

  @override
  void dispose() {
    _images.dispose();
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

  @override
  Widget build(BuildContext context) {
    final s = LayoutStrings.of(context);
    final l = context.l10n;
    final wb = widget.wb;
    return ListenableBuilder(
      listenable: Listenable.merge([wb, wb.view, _images]),
      builder: (context, _) {
        final pages = wb.pages;
        return PopoverCard(
          key: const Key('page-overview'),
          title: s.pageOverview,
          width: widget.width,
          trailing: Text(s.dragToReorder, style: context.text.labelSmall?.copyWith(color: context.colors.onSurfaceVariant)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(
                height: 132,
                child: ReorderableListView.builder(
                  key: const Key('page-thumbnails'),
                  scrollDirection: Axis.horizontal,
                  buildDefaultDragHandles: false,
                  itemCount: pages.length,
                  onReorderItem: wb.movePage,
                  footer: Padding(
                    padding: const EdgeInsets.all(Kx.s4),
                    child: SizedBox(
                      width: 72,
                      child: IconButton.outlined(key: const Key('overview-add-page'), tooltip: s.addPage, onPressed: wb.addPage, icon: const Icon(Icons.add)),
                    ),
                  ),
                  itemBuilder: (context, i) => ReorderableDelayedDragStartListener(
                    key: ValueKey(pages[i].id),
                    index: i,
                    child: Padding(
                      padding: const EdgeInsets.all(Kx.s4),
                      child: _Thumb(
                        key: Key('page-thumb-$i'),
                        page: pages[i],
                        number: i + 1,
                        open: i == wb.pageIndex,
                        canvas: widget.canvas,
                        images: _images,
                        onTap: () => wb.goToPage(i),
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: Kx.s8),
              Wrap(
                spacing: Kx.s8,
                runSpacing: Kx.s8,
                children: [
                  OutlinedButton.icon(key: const Key('overview-duplicate'), onPressed: () => wb.duplicatePage(wb.pageIndex), icon: const Icon(Icons.copy_all_outlined), label: Text(s.duplicate)),
                  OutlinedButton.icon(
                    key: const Key('overview-delete'),
                    onPressed: wb.pageCount > 1 || wb.elements.isNotEmpty ? () => wb.deletePage(wb.pageIndex) : null,
                    icon: const Icon(Icons.delete_outline),
                    label: Text(s.delete),
                  ),
                  OutlinedButton.icon(
                    key: const Key('overview-clear'),
                    onPressed: wb.canClearPage ? wb.clearPage : null,
                    icon: const Icon(Icons.layers_clear_outlined),
                    label: Text(l.clearPage),
                  ),
                  OutlinedButton.icon(
                    key: const Key('overview-clear-all'),
                    onPressed: wb.canClearAllPages ? () => confirmClearBoard(context, wb) : null,
                    icon: const Icon(Icons.delete_sweep_outlined),
                    label: Text(l.clearAllPages),
                  ),
                  FilledButton.tonalIcon(key: const Key('overview-export'), onPressed: _export, icon: const Icon(Icons.picture_as_pdf_outlined), label: Text(s.exportPdf)),
                ],
              ),
              const SizedBox(height: Kx.s8),
              Row(
                children: [
                  Text(s.zoom, style: context.text.labelLarge),
                  const Spacer(),
                  IconButton(key: const Key('zoom-out'), tooltip: l.zoomOut, onPressed: () => wb.zoomBy(1 / 1.25), icon: const Icon(Icons.remove)),
                  TextButton(key: const Key('zoom-reset'), onPressed: wb.resetZoom, child: Text('${(wb.view.value.scale * 100).round()}%')),
                  IconButton(key: const Key('zoom-in'), tooltip: l.zoomIn, onPressed: () => wb.zoomBy(1.25), icon: const Icon(Icons.add)),
                  IconButton(key: const Key('zoom-fit'), tooltip: l.zoomFit, onPressed: wb.fitContent, icon: const Icon(Icons.fit_screen_outlined)),
                ],
              ),
            ],
          ),
        );
      },
    );
  }
}

class _Thumb extends StatelessWidget {
  const _Thumb({super.key, required this.page, required this.number, required this.open, required this.canvas, required this.images, required this.onTap});

  final WhiteboardPage page;
  final int number;
  final bool open;
  final Size canvas;
  final BoardImages images;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(Kx.rMd),
      child: Column(
        children: [
          Container(
            width: 144,
            height: 96,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(Kx.rMd),
              border: Border.all(color: open ? c.primary : c.outlineVariant, width: open ? 3 : 1),
            ),
            clipBehavior: Clip.antiAlias,
            child: RepaintBoundary(child: CustomPaint(painter: _ThumbPainter(page.elements, page.background, pageArea(page.elements, canvas), images))),
          ),
          const SizedBox(height: 2),
          Text('$number', style: context.text.labelMedium?.copyWith(fontWeight: open ? FontWeight.w700 : null)),
        ],
      ),
    );
  }
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
