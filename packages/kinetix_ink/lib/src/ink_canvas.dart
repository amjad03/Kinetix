import 'dart:math' as math;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';

import 'board_background.dart';
import 'ink_controller.dart';
import 'ink_models.dart';
import 'shape_edit.dart';

/// A writing surface. Uses a raw [Listener] rather than gesture detectors so that every
/// pointer is delivered independently: ten fingers make ten strokes.
class InkCanvas extends StatelessWidget {
  const InkCanvas({super.key, required this.controller, this.background = BoardBackground.plain, this.transparent = false});

  final InkController controller;
  final BoardBackground background;

  /// No paper: ink over whatever is underneath (writing over a panel beside the board).
  final bool transparent;

  InkPoint _point(PointerEvent e) {
    // Mice and most fingers report pressure 0 or 1; only pens give a useful range.
    final pressure = e.kind == PointerDeviceKind.stylus && e.pressureMax > e.pressureMin
        ? ((e.pressure - e.pressureMin) / (e.pressureMax - e.pressureMin)).clamp(0.0, 1.0)
        : 0.5;
    return InkPoint(e.localPosition.dx, e.localPosition.dy, pressure);
  }

  @override
  Widget build(BuildContext context) {
    return Listener(
      behavior: HitTestBehavior.opaque,
      onPointerDown: (e) => controller.pointerDown(
        e.pointer,
        _point(e),
        contactRadius: e.kind == PointerDeviceKind.touch ? e.radiusMajor : 0,
        forceEraser: e.kind == PointerDeviceKind.invertedStylus,
      ),
      onPointerMove: (e) => controller.pointerMove(e.pointer, _point(e)),
      onPointerUp: (e) => controller.pointerUp(e.pointer),
      onPointerCancel: (e) => controller.pointerCancel(e.pointer),
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (!transparent) RepaintBoundary(child: CustomPaint(painter: BackgroundPainter(background))),
          // Finished strokes repaint only when they change.
          RepaintBoundary(child: CustomPaint(painter: _CommittedPainter(controller, background))),
          // Strokes being drawn, the selection and the marquee repaint on every move.
          RepaintBoundary(child: CustomPaint(painter: _ActivePainter(controller, background))),
        ],
      ),
    );
  }
}

/// Dark ink on a dark board is invisible, so near-black ink is shown as chalk white there.
Color inkColorFor(Color c, BoardBackground bg) {
  if (bg.isDark && c.computeLuminance() < 0.05) return const Color(0xFFF4F4EE);
  return c;
}

/// Paints [s]. [lengths] and [angles] label every shape (the board-wide switches) on top of
/// the shape's own [Stroke.measure], in [unit].
void paintStroke(Canvas canvas, Stroke s, BoardBackground bg, {bool lengths = false, bool angles = false, MeasureUnit unit = MeasureUnit.cm}) {
  final color = inkColorFor(s.style.color, bg);
  final highlighter = s.style.tool == InkTool.highlighter;
  final paint = Paint()
    ..color = highlighter ? color.withValues(alpha: 0.35) : color
    ..strokeWidth = s.style.width * (highlighter ? 4 : 1)
    ..strokeCap = highlighter ? StrokeCap.square : StrokeCap.round
    ..strokeJoin = StrokeJoin.round
    ..style = PaintingStyle.stroke
    ..isAntiAlias = true;

  final pts = s.points;
  if (pts.length == 1) {
    canvas.drawCircle(pts.first.offset, paint.strokeWidth / 2, paint..style = PaintingStyle.fill);
    return;
  }
  // Shapes may be dashed or dotted; the other pen types are for handwriting.
  final nib = highlighter
      ? PenNib.round
      : s.shape == null
      ? s.style.nib
      : (s.style.nib == PenNib.dashed || s.style.nib == PenNib.dotted ? s.style.nib : PenNib.round);
  if (nib == PenNib.calligraphy) {
    _paintCalligraphy(canvas, pts, s.style.width, paint.color);
    return;
  }
  if (s.style.pressure && s.shape == null && !highlighter && nib == PenNib.round) {
    _paintPressure(canvas, pts, s.style.width, paint);
    return;
  }
  var path = Path()..moveTo(pts.first.x, pts.first.y);
  if (s.shape != null) {
    // Shapes are exact geometry: straight segments, no smoothing.
    final v = s.vertices;
    if (s.corner > 0 && v.length >= 3) {
      path = roundedPolygon(v, s.corner);
    } else {
      for (final p in pts.skip(1)) {
        path.lineTo(p.x, p.y);
      }
    }
    if (s.fill != null && pts.length > 2) canvas.drawPath(path, Paint()..color = s.fill!);
  } else {
    // Quadratic curves through the midpoints give smooth ink without lagging behind the pen.
    for (var i = 1; i < pts.length - 1; i++) {
      final mid = Offset((pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
      path.quadraticBezierTo(pts[i].x, pts[i].y, mid.dx, mid.dy);
    }
    path.lineTo(pts.last.x, pts.last.y);
  }
  canvas.drawPath(
    switch (nib) {
      PenNib.dashed => _dashed(path, paint.strokeWidth),
      PenNib.dotted => _dashed(path, paint.strokeWidth, dot: true),
      _ => path,
    },
    paint,
  );
  if (nib == PenNib.arrow) {
    // The arrowhead follows the last stretch of the line, not its last jitter.
    final tip = pts.last.offset;
    var from = pts.first.offset;
    for (final p in pts.reversed) {
      if ((p.offset - tip).distance > 12 + paint.strokeWidth * 2) {
        from = p.offset;
        break;
      }
    }
    _arrowHead(canvas, from, tip, paint);
  }

  final shape = s.shape;
  if (shape == null) return;
  if (shape == ShapeKind.arrow || shape == ShapeKind.doubleArrow) {
    _arrowHead(canvas, pts.first.offset, pts.last.offset, paint, filled: s.filledHead);
    if (shape == ShapeKind.doubleArrow) _arrowHead(canvas, pts.last.offset, pts.first.offset, paint, filled: s.filledHead);
  }
  final m = s.measure | ShapeMeasure(lengths: lengths, angles: angles, radius: lengths);
  if (m.any) paintShapeMeasurements(canvas, s, color, m, unit);
}

/// A closed path through [v] with its corners rounded to [radius] (at most half of the
/// shorter side at each corner).
Path roundedPolygon(List<Offset> v, double radius) {
  final n = v.length;
  final path = Path();
  for (var i = 0; i < n; i++) {
    final prev = v[(i - 1 + n) % n], at = v[i], next = v[(i + 1) % n];
    final a = prev - at, b = next - at;
    final r = math.min(radius, math.min(a.distance, b.distance) / 2);
    final p1 = at + (a.distance == 0 ? Offset.zero : a / a.distance * r);
    final p2 = at + (b.distance == 0 ? Offset.zero : b / b.distance * r);
    if (i == 0) {
      path.moveTo(p1.dx, p1.dy);
    } else {
      path.lineTo(p1.dx, p1.dy);
    }
    path.quadraticBezierTo(at.dx, at.dy, p2.dx, p2.dy);
  }
  return path..close();
}

/// [path] cut into dashes about three line widths long (or dots, one width apart).
Path _dashed(Path path, double width, {bool dot = false}) {
  final dash = dot ? 0.01 : math.max(8.0, width * 3), gap = dot ? math.max(4.0, width * 2) : math.max(6.0, width * 2.2);
  final out = Path();
  for (final m in path.computeMetrics()) {
    for (var d = 0.0; d < m.length; d += dash + gap) {
      out.addPath(m.extractPath(d, math.min(d + dash, m.length)), Offset.zero);
    }
  }
  return out;
}

/// A broad nib held at 45°: thick going one way, thin the other.
void _paintCalligraphy(Canvas canvas, List<InkPoint> pts, double width, Color color) {
  final half = Offset(1, -1) * (width * 1.1 / math.sqrt2);
  final fill = Paint()
    ..color = color
    ..isAntiAlias = true;
  final path = Path();
  for (var i = 0; i < pts.length - 1; i++) {
    final a = pts[i].offset, b = pts[i + 1].offset;
    path.addPolygon([a - half, b - half, b + half, a + half], true);
  }
  canvas.drawPath(path, fill);
  canvas.drawLine(pts.first.offset - half, pts.first.offset + half, Paint()..color = color..strokeWidth = 1);
}

/// Each stretch as wide as the stylus pressed (0.5, a finger or a mouse, is the set width).
void _paintPressure(Canvas canvas, List<InkPoint> pts, double width, Paint paint) {
  for (var i = 0; i < pts.length - 1; i++) {
    final p = (pts[i].pressure + pts[i + 1].pressure) / 2;
    canvas.drawLine(pts[i].offset, pts[i + 1].offset, paint..strokeWidth = width * (0.35 + 1.3 * p));
  }
}

void _arrowHead(Canvas canvas, Offset from, Offset tip, Paint paint, {bool filled = false}) {
  final d = tip - from;
  if (d.distance < 1) return;
  final a = math.atan2(d.dy, d.dx);
  final len = 10 + paint.strokeWidth * 2.5;
  final path = Path()
    ..moveTo(tip.dx - len * math.cos(a - 0.45), tip.dy - len * math.sin(a - 0.45))
    ..lineTo(tip.dx, tip.dy)
    ..lineTo(tip.dx - len * math.cos(a + 0.45), tip.dy - len * math.sin(a + 0.45));
  if (filled) {
    canvas.drawPath(
      path..close(),
      Paint()
        ..color = paint.color
        ..style = PaintingStyle.fill,
    );
  }
  canvas.drawPath(path, Paint()..color = paint.color..strokeWidth = paint.strokeWidth..style = PaintingStyle.stroke..strokeJoin = StrokeJoin.round..strokeCap = StrokeCap.round);
}

String cm(double px) => '${(px / pxPerCm).toStringAsFixed(1)} cm';

/// Whole degrees when exact, else one decimal, so a triangle's labels add up to 180°
/// instead of showing 59° + 60° + 60°.
String degrees(double d) {
  final r = d.roundToDouble();
  return (d - r).abs() < 0.05 ? '${r.toInt()}°' : '${d.toStringAsFixed(1)}°';
}

/// Labels on a shape or figure: side lengths, corner angles, a circle's radius, the area; all
/// worked out from where its points are now, so they stay right after it is moved, resized,
/// turned or reshaped.
void paintShapeMeasurements(Canvas canvas, BoardElement e, Color color, ShapeMeasure m, MeasureUnit unit) {
  void label(String text, Offset at) {
    final tp = TextPainter(
      text: TextSpan(
        text: text,
        style: TextStyle(color: color, fontSize: 14, fontWeight: FontWeight.w500),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    final box = Rect.fromCenter(center: at, width: tp.width + 10, height: tp.height + 4);
    canvas.drawRRect(RRect.fromRectAndRadius(box, const Radius.circular(6)), Paint()..color = const Color(0xE6FFFFFF));
    tp.paint(canvas, box.topLeft + const Offset(5, 2));
  }

  final shape = e is Stroke ? e.shape : null;
  if (e is Stroke && shape != null && shape.isRound) {
    final ax = roundAxes(e);
    if (shape == ShapeKind.circle) {
      final r = (ax.major + ax.minor) / 2;
      if (m.radius || m.lengths) {
        // A radius drawn out to the first point, labelled half way along.
        final rim = e.points.first.offset;
        canvas.drawLine(
          ax.center,
          rim,
          Paint()
            ..color = color.withValues(alpha: 0.7)
            ..strokeWidth = 1.5,
        );
        canvas.drawCircle(ax.center, 3, Paint()..color = color);
        label('r = ${formatLength(r, unit)}', (ax.center + rim) / 2 - const Offset(0, 14));
      }
      if (m.area) label('A = ${formatArea(math.pi * r * r, unit)}', ax.center + const Offset(0, 18));
    } else {
      if (m.lengths) label('${formatLength(ax.major * 2, unit)} × ${formatLength(ax.minor * 2, unit)}', ax.center);
      if (m.area) label('A = ${formatArea(math.pi * ax.major * ax.minor, unit)}', ax.center + const Offset(0, 22));
    }
    return;
  }
  final v = switch (e) {
    Stroke() => e.vertices,
    PolygonElement(:final points) => points,
    _ => const <Offset>[],
  };
  if (v.length < 2) return;
  final closed = e is PolygonElement ? e.closed && v.length > 2 : (shape?.isPolygon ?? false);
  final centroid = v.fold(Offset.zero, (a, b) => a + b) / v.length.toDouble();
  if (m.lengths) {
    final edges = closed ? v.length : v.length - 1;
    for (var i = 0; i < edges; i++) {
      final a = v[i], b = v[(i + 1) % v.length];
      final mid = (a + b) / 2;
      // Push the label outward, away from the middle of the shape.
      final out = closed ? mid - centroid : Offset(-(b - a).dy, (b - a).dx);
      final n = out.distance == 0 ? Offset.zero : out / out.distance;
      label(formatLength((b - a).distance, unit), mid + n * 18);
    }
  }
  if (m.angles && closed) {
    for (var i = 0; i < v.length; i++) {
      final prev = v[(i - 1 + v.length) % v.length], at = v[i], next = v[(i + 1) % v.length];
      final inward = centroid - at;
      final n = inward.distance == 0 ? Offset.zero : inward / inward.distance;
      label(degrees(angleAt(prev, at, next)), at + n * 30);
    }
  }
  if (m.area && closed) label('A = ${formatArea(polygonArea(v), unit)}', centroid);
}

class _CommittedPainter extends CustomPainter {
  _CommittedPainter(this.controller, this.background) : super(repaint: controller.committed);

  final InkController controller;
  final BoardBackground background;

  @override
  void paint(Canvas canvas, Size size) {
    for (final s in controller.strokes) {
      paintStroke(canvas, s, background, lengths: controller.showLengths, angles: controller.showAngles);
    }
  }

  @override
  bool shouldRepaint(_CommittedPainter old) => old.controller != controller || old.background != background;
}

class _ActivePainter extends CustomPainter {
  _ActivePainter(this.controller, this.background) : super(repaint: controller);

  final InkController controller;
  final BoardBackground background;

  static const _accent = Color(0xFF0B57D0);

  @override
  void paint(Canvas canvas, Size size) {
    for (final s in controller.activeStrokes) {
      paintStroke(canvas, s, background, lengths: controller.showLengths, angles: controller.showAngles);
    }
    final marquee = controller.marquee;
    if (marquee != null) {
      canvas.drawRect(marquee, Paint()..color = _accent.withValues(alpha: 0.08));
      _dashedRect(canvas, marquee);
    }
    final sel = controller.selectionBounds;
    if (sel != null) {
      final r = sel.inflate(8);
      canvas.drawRRect(
        RRect.fromRectAndRadius(r, const Radius.circular(8)),
        Paint()
          ..color = _accent
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2,
      );
      for (final c in [r.topLeft, r.topRight, r.bottomLeft, r.bottomRight]) {
        canvas.drawCircle(c, 6, Paint()..color = Colors.white);
        canvas.drawCircle(
          c,
          6,
          Paint()
            ..color = _accent
            ..style = PaintingStyle.stroke
            ..strokeWidth = 2,
        );
      }
    }
  }

  void _dashedRect(Canvas canvas, Rect r) {
    final p = Paint()
      ..color = _accent
      ..strokeWidth = 1.5;
    void dashed(Offset a, Offset b) {
      final len = (b - a).distance;
      final dir = (b - a) / (len == 0 ? 1 : len);
      for (var d = 0.0; d < len; d += 10) {
        canvas.drawLine(a + dir * d, a + dir * math.min(d + 5, len), p);
      }
    }

    dashed(r.topLeft, r.topRight);
    dashed(r.topRight, r.bottomRight);
    dashed(r.bottomRight, r.bottomLeft);
    dashed(r.bottomLeft, r.topLeft);
  }

  @override
  bool shouldRepaint(_ActivePainter old) => old.background != background;
}
