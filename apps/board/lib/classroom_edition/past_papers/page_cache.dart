import 'dart:async';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../ui/ce_style.dart';
import 'pdf_pages.dart';

/// An open PDF and the pages drawn from it so far (a few big pages and the strip's
/// thumbnails), so turning back a page is instant and a long paper never fills the memory.
class OpenPdf {
  OpenPdf._(this.doc);

  final PdfPagesDoc doc;
  final _big = <(int, int), ui.Image>{};
  final _thumbs = <int, ui.Image>{};
  final _pending = <(int, int), Future<ui.Image?>>{};
  bool _disposed = false;

  static const maxBig = 6;
  static const thumbWidth = 160;

  /// Opens [bytes] (null when it cannot be read).
  static Future<OpenPdf?> open(Uint8List bytes) async {
    try {
      return OpenPdf._(await PdfPages.instance.open(bytes));
    } catch (e) {
      debugPrint('PDF not opened: $e');
      return null;
    }
  }

  int get pageCount => doc.pageCount;
  Size pageSize(int i) => doc.pageSize(i);
  double aspect(int i) {
    final s = pageSize(i);
    return s.height <= 0 ? 1.414 : s.height / s.width;
  }

  static int _step(int width) => width <= thumbWidth ? thumbWidth : ((width + 199) ~/ 200) * 200;

  ui.Image? _hit(int page, int w) => w <= thumbWidth ? _thumbs[page] : _big[(page, w)];

  /// A handle on the page if it is drawn already (the caller disposes it).
  ui.Image? cached(int page, int width) => _hit(page, _step(width))?.clone();

  /// Page [page] drawn [width] pixels wide (rounded up to a step of 200, so resizing does not
  /// redraw it at every size). The caller owns the handle it gets and disposes it; the cache
  /// keeps its own.
  Future<ui.Image?> page(int page, int width) async {
    final img = await _draw(page, _step(width));
    if (img == null || _disposed) return null;
    try {
      return img.clone();
    } catch (_) {
      return null; // let go of in the meantime
    }
  }

  Future<ui.Image?> _draw(int page, int w) {
    if (_disposed) return Future.value();
    final hit = _hit(page, w);
    if (hit != null) return Future.value(hit);
    final key = (page, w);
    return _pending[key] ??= () async {
      try {
        final img = await doc.render(page, width: w.toDouble());
        if (img == null) return null;
        if (_disposed) {
          img.dispose();
          return null;
        }
        if (w <= thumbWidth) {
          _thumbs[page] = img;
        } else {
          _big[key] = img;
          while (_big.length > maxBig) {
            _big.remove(_big.keys.first)?.dispose();
          }
        }
        return img;
      } catch (e) {
        debugPrint('Page ${page + 1} not drawn: $e');
        return null;
      } finally {
        _pending.remove(key);
      }
    }();
  }

  /// A part of a page as PNG ([crop] 0…1 of the page), [width] pixels wide: Put on board.
  Future<Uint8List?> png(int page, {required int width, Rect? crop}) async {
    final img = await doc.render(page, width: width.toDouble(), crop: crop);
    if (img == null) return null;
    try {
      return await pngOf(img);
    } finally {
      img.dispose();
    }
  }

  Future<void> dispose() async {
    _disposed = true;
    for (final i in [..._big.values, ..._thumbs.values]) {
      i.dispose();
    }
    _big.clear();
    _thumbs.clear();
    await doc.dispose();
  }
}

/// One page of [pdf], drawn to fill its box (the page's shape), white with a soft shadow.
class PdfPageImage extends StatefulWidget {
  const PdfPageImage({super.key, required this.pdf, required this.page, this.thumb = false});

  final OpenPdf pdf;
  final int page;

  /// Drawn small (the page strip).
  final bool thumb;

  @override
  State<PdfPageImage> createState() => _PdfPageImageState();
}

class _PdfPageImageState extends State<PdfPageImage> {
  ui.Image? image;
  int _want = 0;

  /// The widget keeps its own handle ([OpenPdf.page] gives one): the cache may let a page go
  /// while it is still on screen.
  void _set(ui.Image img) {
    final old = image;
    image = img;
    old?.dispose();
  }

  void _load(int width) {
    if (width == _want) return;
    _want = width;
    final hit = widget.pdf.cached(widget.page, width);
    if (hit != null) {
      _set(hit);
      return;
    }
    unawaited(
      widget.pdf.page(widget.page, width).then((img) {
        if (img == null) return;
        if (mounted && _want == width) {
          setState(() => _set(img));
        } else {
          img.dispose();
        }
      }),
    );
  }

  @override
  void didUpdateWidget(PdfPageImage old) {
    super.didUpdateWidget(old);
    if (old.page != widget.page || old.pdf != widget.pdf) {
      _want = 0;
      image?.dispose();
      image = null;
    }
  }

  @override
  void dispose() {
    image?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) {
      final dpr = MediaQuery.maybeDevicePixelRatioOf(context) ?? 1;
      // Drawn at twice the box, so pinch zoom stays sharp; capped for the board's memory.
      final px = widget.thumb ? OpenPdf.thumbWidth : (box.maxWidth * dpr * 2).clamp(400, 2600).round();
      _load(px);
      final img = image;
      return Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(widget.thumb ? 4 : 6),
          boxShadow: const [BoxShadow(color: Color(0x22000000), blurRadius: 14, offset: Offset(0, 4))],
        ),
        clipBehavior: Clip.antiAlias,
        child: img == null
            ? Center(
                child: widget.thumb
                    ? Text('${widget.page + 1}', style: ceText(16, c: CeC.muted))
                    : const SizedBox(width: 48, height: 48, child: CircularProgressIndicator(strokeWidth: 4)),
              )
            : RawImage(image: img, fit: BoxFit.fill, filterQuality: FilterQuality.medium),
      );
    },
  );
}
