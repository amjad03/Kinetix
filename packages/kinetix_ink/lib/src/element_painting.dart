import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'board_background.dart';
import 'graph_expr.dart';
import 'ink_canvas.dart';
import 'ink_models.dart';

/// Words painted on the board by the ink engine itself. Apps set them in the teacher's
/// language (the board does when its language changes).
class InkLabels {
  InkLabels._();

  /// On a covered answer note.
  static String answerCover = 'Tap to show the answer';
}

/// Decoded pictures, shared by every painter. Notifies when a picture has been decoded, so
/// painters that listen repaint with it.
class BoardImages extends ChangeNotifier {
  final _images = Expando<ui.Image>('boardImage');
  final _pending = Expando<bool>('boardImagePending');
  final _all = <ui.Image>[];
  bool _disposed = false;

  /// The decoded picture for [bytes], or null while it is being decoded (or cannot be).
  ui.Image? operator [](Uint8List bytes) {
    final img = _images[bytes];
    if (img == null && _pending[bytes] != true && bytes.isNotEmpty) _decode(bytes);
    return img;
  }

  /// Decodes every picture among [elements] (before painting off screen).
  Future<void> preload(Iterable<BoardElement> elements) async {
    for (final e in elements) {
      if (e is ImageElement && _images[e.bytes] == null && e.bytes.isNotEmpty) await _decode(e.bytes);
    }
  }

  Future<void> _decode(Uint8List bytes) async {
    _pending[bytes] = true;
    try {
      final codec = await ui.instantiateImageCodec(bytes);
      final frame = await codec.getNextFrame();
      if (_disposed) {
        frame.image.dispose();
        return;
      }
      _images[bytes] = frame.image;
      _all.add(frame.image);
      notifyListeners();
    } catch (_) {
      // Undecodable: the painter keeps drawing the placeholder.
    }
  }

  @override
  void dispose() {
    _disposed = true;
    for (final i in _all) {
      i.dispose();
    }
    super.dispose();
  }
}

/// The font family for board text in [font].
String boardFontFamily(BoardFont font) => switch (font) {
  BoardFont.inter => KxFonts.board,
  BoardFont.andika => KxFonts.primary,
};

TextStyle boardTextStyle({required double fontSize, required Color color, bool bold = false, BoardFont font = BoardFont.inter}) => TextStyle(
  fontSize: fontSize,
  color: color,
  height: 1.25,
  fontWeight: bold ? FontWeight.w700 : FontWeight.w400,
  fontFamily: boardFontFamily(font),
  fontFamilyFallback: KxFonts.fallback,
);

/// Lays out board text as the board paints it (lines are kept as typed; very long lines wrap
/// at 40 ems).
TextPainter layoutBoardText(String text, double fontSize, Color color, {bool bold = false, BoardFont font = BoardFont.inter}) =>
    TextPainter(
      text: TextSpan(text: text.isEmpty ? ' ' : text, style: boardTextStyle(fontSize: fontSize, color: color, bold: bold, font: font)),
      textDirection: TextDirection.ltr,
    )..layout(maxWidth: fontSize * 40);

/// The size board text takes, for a new [TextElement].
Size measureBoardText(String text, double fontSize, {bool bold = false, BoardFont font = BoardFont.inter}) {
  final tp = layoutBoardText(text, fontSize, const Color(0xFF000000), bold: bold, font: font);
  final size = tp.size;
  tp.dispose();
  return size;
}

/// Laid-out text per element and paper darkness (near-black text turns chalk white on the
/// chalkboard).
final _textCache = Expando<(bool, TextPainter)>('boardText');
final _noteCache = Expando<TextPainter>('boardNote');

/// Paints one element. Strokes keep their look on the chalkboard ([inkColorFor]); pictures
/// are drawn once [images] has decoded them. Equations are typeset by a widget layer
/// ([MathLayer]); with [paintMath] they are drawn here as their source, for page pictures.
void paintElement(
  Canvas canvas,
  BoardElement e,
  BoardBackground background, {
  BoardImages? images,
  bool lengths = false,
  bool angles = false,
  bool paintMath = false,
}) {
  final rot = e.rotation;
  if (rot != 0) {
    // A turned box: drawn upright in a canvas turned about its centre.
    final c = e.frame.center;
    canvas
      ..save()
      ..translate(c.dx, c.dy)
      ..rotate(rot)
      ..translate(-c.dx, -c.dy);
  }
  switch (e) {
    case Stroke():
      paintStroke(canvas, e, background, lengths: lengths, angles: angles);
    case TextElement():
      _cachedText(e, background, () => layoutBoardText(e.text, e.fontSize, inkColorFor(e.color, background), bold: e.bold, font: e.font))
          .paint(canvas, e.position);
    case ImageElement():
      final img = images?[e.bytes];
      if (img == null) {
        canvas.drawRRect(RRect.fromRectAndRadius(e.rect, const Radius.circular(8)), Paint()..color = const Color(0x14000000));
      } else {
        paintImage(canvas: canvas, rect: e.rect, image: img, fit: BoxFit.fill, filterQuality: FilterQuality.medium);
      }
      if (e.link != null) _paintLinkBadge(canvas, e);
    case MathElement():
      if (paintMath) {
        final tp = _cachedText(e, background, () => layoutBoardText(readableLatex(e.latex), e.fontSize * 0.8, inkColorFor(e.color, background)));
        tp.paint(canvas, e.position + Offset(0, (e.size.height - tp.height) / 2));
      }
    case GraphElement():
      paintGraph(canvas, e);
    case PolygonElement():
      final path = Path()..addPolygon(e.points, e.closed);
      if (e.fill != null) canvas.drawPath(path, Paint()..color = e.fill!);
      canvas.drawPath(
        path,
        Paint()
          ..color = inkColorFor(e.color, background)
          ..style = PaintingStyle.stroke
          ..strokeWidth = e.width
          ..strokeJoin = StrokeJoin.round
          ..strokeCap = StrokeCap.round,
      );
    case NoteElement():
      paintNote(canvas, e);
  }
  if (rot != 0) canvas.restore();
}

TextPainter _cachedText(BoardElement e, BoardBackground background, TextPainter Function() layout) {
  final cached = _textCache[e];
  if (cached != null && cached.$1 == background.isDark) return cached.$2;
  final tp = layout();
  _textCache[e] = (background.isDark, tp);
  return tp;
}

/// LaTeX made readable as plain text, for places that cannot typeset it.
String readableLatex(String tex) => tex
    .replaceAllMapped(RegExp(r'\\frac\{([^{}]*)\}\{([^{}]*)\}'), (m) => '(${m[1]})/(${m[2]})')
    .replaceAllMapped(RegExp(r'\\sqrt\{([^{}]*)\}'), (m) => '√(${m[1]})')
    .replaceAll(r'\times', '×')
    .replaceAll(r'\div', '÷')
    .replaceAll(r'\pm', '±')
    .replaceAll(r'\cdot', '·')
    .replaceAll(r'\pi', 'π')
    .replaceAll(r'\theta', 'θ')
    .replaceAll(r'\alpha', 'α')
    .replaceAll(r'\beta', 'β')
    .replaceAll(r'\angle', '∠')
    .replaceAll(r'\leq', '≤')
    .replaceAll(r'\geq', '≥')
    .replaceAll(r'\neq', '≠')
    .replaceAll(r'^\circ', '°')
    .replaceAll(RegExp(r'\\(left|right|quad|,|;|!|text|mathrm)'), ' ')
    .replaceAll(RegExp(r'[{}]'), '')
    .replaceAll(RegExp(r'\s+'), ' ')
    .trim();

void _paintLinkBadge(Canvas canvas, ImageElement e) {
  // A small "open" mark in the corner: tapping the picture opens the model or lab again.
  final c = e.rect.topRight + const Offset(-22, 22);
  canvas.drawCircle(c, 16, Paint()..color = const Color(0xE6FFFFFF));
  final icon = e.link!.kind == EmbedLink.lab ? Icons.science_outlined : Icons.view_in_ar_outlined;
  final tp = TextPainter(
    text: TextSpan(
      text: String.fromCharCode(icon.codePoint),
      style: TextStyle(fontSize: 20, fontFamily: icon.fontFamily, package: icon.fontPackage, color: KxColor.accent),
    ),
    textDirection: TextDirection.ltr,
  )..layout();
  tp.paint(canvas, c - Offset(tp.width / 2, tp.height / 2));
}

/// A note, a code block, a word card, or a covered answer.
void paintNote(Canvas canvas, NoteElement s) {
  final r = s.rect;
  final shadow = Paint()
    ..color = const Color(0x22000000)
    ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6);
  switch (s.kind) {
    case NoteKind.code:
      canvas.drawRRect(RRect.fromRectAndRadius(r.shift(const Offset(0, 4)), const Radius.circular(10)), shadow);
      canvas.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(10)), Paint()..color = const Color(0xFF1E2430));
      for (final (i, c) in const [Color(0xFFFF5F57), Color(0xFFFEBC2E), Color(0xFF28C840)].indexed) {
        canvas.drawCircle(r.topLeft + Offset(18.0 + i * 16, 16), 5, Paint()..color = c);
      }
      canvas
        ..save()
        ..clipRect(r.deflate(4));
      if (s.language != null) {
        final label = TextPainter(
          text: TextSpan(text: s.language, style: const TextStyle(fontSize: 12, color: Color(0xFF8A96A3), fontFamily: KxFonts.family)),
          textDirection: TextDirection.ltr,
        )..layout();
        label.paint(canvas, Offset(r.right - 14 - label.width, r.top + 16 - label.height / 2));
      }
      // Lines are never wrapped (code means what its lines say).
      final tp = _noteCache[s] ??= TextPainter(
        text: TextSpan(
          text: s.text.replaceAll('\t', '    '),
          style: TextStyle(fontFamily: KxFonts.code, fontFamilyFallback: KxFonts.fallback, fontSize: s.fontSize * 0.85, height: 1.35, color: const Color(0xFFD7E3F4)),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      tp.paint(canvas, r.topLeft + const Offset(16, 34));
      canvas.restore();
    case NoteKind.card:
      canvas.drawRRect(RRect.fromRectAndRadius(r.shift(const Offset(0, 4)), const Radius.circular(16)), shadow);
      canvas.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(16)), Paint()..color = Colors.white);
      canvas.drawRRect(
        RRect.fromRectAndRadius(r.deflate(2), const Radius.circular(14)),
        Paint()
          ..color = s.color.withValues(alpha: 1)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 4,
      );
      final tp = _noteCache[s] ??= TextPainter(
        text: TextSpan(
          text: s.text,
          style: TextStyle(
            fontSize: s.fontSize * 1.8,
            color: const Color(0xFF1B1F24),
            fontWeight: FontWeight.w700,
            fontFamily: KxFonts.board,
            fontFamilyFallback: KxFonts.fallback,
          ),
        ),
        textDirection: TextDirection.ltr,
        textAlign: TextAlign.center,
        maxLines: 3,
        ellipsis: '…',
      )..layout(maxWidth: math.max(0, r.width - 24));
      tp.paint(canvas, r.center - Offset(tp.width / 2, tp.height / 2));
    case NoteKind.answer:
      // Covered: a quiet striped card with no trace of the answer.
      final rr = RRect.fromRectAndRadius(r, const Radius.circular(14));
      canvas.drawRRect(rr, Paint()..color = const Color(0xFFE2ECE5));
      canvas
        ..save()
        ..clipRRect(rr);
      final stripe = Paint()
        ..color = const Color(0xFFD3E2D8)
        ..strokeWidth = 12;
      for (var x = r.left - r.height; x < r.right; x += 30) {
        canvas.drawLine(Offset(x, r.bottom), Offset(x + r.height, r.top), stripe);
      }
      canvas.restore();
      canvas.drawRRect(
        rr.deflate(0.75),
        Paint()
          ..color = const Color(0xFFB9CDBF)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.5,
      );
      final eye = TextPainter(
        text: TextSpan(
          text: String.fromCharCode(Icons.visibility_outlined.codePoint),
          style: TextStyle(fontSize: 22, fontFamily: Icons.visibility_outlined.fontFamily, package: Icons.visibility_outlined.fontPackage, color: KxColor.accent),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      eye.paint(canvas, Offset(r.left + 18, r.center.dy - eye.height / 2));
      final tp = TextPainter(
        text: TextSpan(
          text: InkLabels.answerCover,
          style: const TextStyle(fontFamily: KxFonts.family, fontFamilyFallback: KxFonts.fallback, fontSize: 18, color: KxColor.accent, fontWeight: FontWeight.w500),
        ),
        textDirection: TextDirection.ltr,
        maxLines: 1,
        ellipsis: '…',
      )..layout(maxWidth: math.max(0, r.width - 70));
      tp.paint(canvas, Offset(r.left + 50, r.center.dy - tp.height / 2));
    case NoteKind.note:
      canvas.drawRRect(RRect.fromRectAndRadius(r.shift(const Offset(0, 4)), const Radius.circular(6)), shadow);
      canvas.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(6)), Paint()..color = s.color);
      canvas.drawRRect(
        RRect.fromRectAndCorners(Rect.fromLTWH(r.left, r.top, r.width, 18), topLeft: const Radius.circular(6), topRight: const Radius.circular(6)),
        Paint()..color = const Color(0x14000000),
      );
      final tp = _noteCache[s] ??= TextPainter(
        text: TextSpan(
          text: s.text,
          style: TextStyle(fontSize: s.fontSize, color: const Color(0xFF1B1F24), height: 1.3, fontFamily: KxFonts.board, fontFamilyFallback: KxFonts.fallback),
        ),
        textDirection: TextDirection.ltr,
        ellipsis: '…',
        maxLines: math.max(1, ((r.height - 36) / (s.fontSize * 1.3)).floor()),
      )..layout(maxWidth: math.max(0, r.width - 28));
      tp.paint(canvas, r.topLeft + const Offset(14, 26));
  }
}

final _graphCache = <String, double Function(double)?>{};

/// A plotted function on a white card with a light grid, axes and numbers.
void paintGraph(Canvas canvas, GraphElement g) {
  final r = g.rect;
  final card = RRect.fromRectAndRadius(r, const Radius.circular(10));
  canvas.drawRRect(card, Paint()..color = const Color(0xFFFFFFFF));
  canvas.drawRRect(
    card,
    Paint()
      ..color = const Color(0x33000000)
      ..style = PaintingStyle.stroke,
  );
  if (g.xMax <= g.xMin || g.yMax <= g.yMin) return;
  canvas
    ..save()
    ..clipRRect(card.deflate(1));
  Offset map(double x, double y) =>
      Offset(r.left + (x - g.xMin) / (g.xMax - g.xMin) * r.width, r.bottom - (y - g.yMin) / (g.yMax - g.yMin) * r.height);
  final grid = Paint()
    ..color = const Color(0x14000000)
    ..strokeWidth = 1;
  final gridStep = math.max(1, ((g.xMax - g.xMin) / 40).ceil());
  for (var x = (g.xMin / gridStep).ceil() * gridStep.toDouble(); x <= g.xMax; x += gridStep) {
    canvas.drawLine(map(x, g.yMin), map(x, g.yMax), grid);
  }
  for (var y = (g.yMin / gridStep).ceil() * gridStep.toDouble(); y <= g.yMax; y += gridStep) {
    canvas.drawLine(map(g.xMin, y), map(g.xMax, y), grid);
  }
  final axis = Paint()
    ..color = const Color(0xFF3A4048)
    ..strokeWidth = 1.6;
  canvas.drawLine(map(g.xMin, 0), map(g.xMax, 0), axis);
  canvas.drawLine(map(0, g.yMin), map(0, g.yMax), axis);
  final labelStep = math.max(1, ((g.xMax - g.xMin) / 10).ceil());
  void label(String t, Offset at, {bool below = true}) {
    final tp = TextPainter(
      text: TextSpan(text: t, style: const TextStyle(fontSize: 11, color: Color(0xFF6A7078), fontFamily: KxFonts.board)),
      textDirection: TextDirection.ltr,
    )..layout();
    tp.paint(canvas, below ? at + Offset(-tp.width / 2, 3) : at + Offset(4, -tp.height / 2));
  }

  for (var x = (g.xMin / labelStep).ceil() * labelStep; x <= g.xMax; x += labelStep) {
    if (x != 0) label('$x', map(x.toDouble(), 0));
  }
  for (var y = (g.yMin / labelStep).ceil() * labelStep; y <= g.yMax; y += labelStep) {
    if (y != 0) label('$y', map(0, y.toDouble()), below: false);
  }
  final f = _graphCache.putIfAbsent(g.expression, () => compileGraph(g.expression));
  if (f != null) {
    final path = Path();
    var pen = false;
    double? prevY;
    const n = 400;
    final span = g.yMax - g.yMin;
    for (var i = 0; i <= n; i++) {
      final x = g.xMin + (g.xMax - g.xMin) * i / n;
      final y = f(x);
      // Lift the pen at gaps and jumps (tan x, 1/x).
      if (!y.isFinite || (prevY != null && (y - prevY).abs() > span * 2)) {
        pen = false;
        prevY = y.isFinite ? y : null;
        continue;
      }
      final p = map(x, y.clamp(g.yMin - span, g.yMax + span));
      pen ? path.lineTo(p.dx, p.dy) : path.moveTo(p.dx, p.dy);
      pen = true;
      prevY = y;
    }
    canvas.drawPath(
      path,
      Paint()
        ..color = g.color
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );
  }
  canvas.restore();
  if (g.expression.isNotEmpty) {
    final tp = TextPainter(
      text: TextSpan(
        text: 'y = ${g.expression}',
        style: TextStyle(fontSize: 14, color: g.color, fontWeight: FontWeight.w700, fontFamily: KxFonts.board, fontFamilyFallback: KxFonts.fallback),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    tp.paint(canvas, r.topLeft + const Offset(10, 8));
  }
}
