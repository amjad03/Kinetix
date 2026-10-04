import 'dart:math' as math;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';

import 'board_background.dart';
import 'ink_controller.dart';
import 'ink_models.dart';

/// A writing surface. Uses a raw [Listener] rather than gesture detectors so that every
/// pointer is delivered independently: ten fingers make ten strokes.
class InkCanvas extends StatelessWidget {
  const InkCanvas({super.key, required this.controller, this.background = BoardBackground.plain});

  final InkController controller;
  final BoardBackground background;

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
          RepaintBoundary(child: CustomPaint(painter: BackgroundPainter(background))),
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

void paintStroke(Canvas canvas, Stroke s, BoardBackground bg, {bool lengths = false, bool angles = false}) {
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
  final path = Path()..moveTo(pts.first.x, pts.first.y);
  if (s.shape != null) {
    // Shapes are exact geometry: straight segments, no smoothing.
    for (final p in pts.skip(1)) {
      path.lineTo(p.x, p.y);
    }
  } else {
    // Quadratic curves through the midpoints give smooth ink without lagging behind the pen.
    for (var i = 1; i < pts.length - 1; i++) {
      final mid = Offset((pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
      path.quadraticBezierTo(pts[i].x, pts[i].y, mid.dx, mid.dy);
    }
    path.lineTo(pts.last.x, pts.last.y);
  }
  canvas.drawPath(path, paint);

  final shape = s.shape;
  if (shape == null) return;
  if (shape == ShapeKind.arrow || shape == ShapeKind.doubleArrow) {
    _arrowHead(canvas, pts.first.offset, pts.last.offset, paint);
    if (shape == ShapeKind.doubleArrow) _arrowHead(canvas, pts.last.offset, pts.first.offset, paint);
  }
  if (lengths || angles) _paintMeasurements(canvas, s, color, lengths: lengths, angles: angles);
}

void _arrowHead(Canvas canvas, Offset from, Offset tip, Paint paint) {
  final d = tip - from;
  if (d.distance < 1) return;
  final a = math.atan2(d.dy, d.dx);
  final len = 10 + paint.strokeWidth * 2.5;
  final path = Path()
    ..moveTo(tip.dx - len * math.cos(a - 0.45), tip.dy - len * math.sin(a - 0.45))
    ..lineTo(tip.dx, tip.dy)
    ..lineTo(tip.dx - len * math.cos(a + 0.45), tip.dy - len * math.sin(a + 0.45));
  canvas.drawPath(path, paint);
}

String cm(double px) => '${(px / pxPerCm).toStringAsFixed(1)} cm';

/// Whole degrees when exact, else one decimal, so a triangle's labels add up to 180°
/// instead of showing 59° + 60° + 60°.
String degrees(double d) {
  final r = d.roundToDouble();
  return (d - r).abs() < 0.05 ? '${r.toInt()}°' : '${d.toStringAsFixed(1)}°';
}

void _paintMeasurements(Canvas canvas, Stroke s, Color color, {required bool lengths, required bool angles}) {
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

  final shape = s.shape!;
  if (shape == ShapeKind.circle) {
    final b = s.bounds.deflate(s.style.width / 2);
    if (lengths) label('r = ${cm(b.width / 2)}', b.center);
    return;
  }
  if (shape == ShapeKind.ellipse) {
    final b = s.bounds.deflate(s.style.width / 2);
    if (lengths) label('${cm(b.width)} × ${cm(b.height)}', b.center);
    return;
  }
  final v = s.vertices;
  final closed = shape.isPolygon;
  final centroid = v.fold(Offset.zero, (a, b) => a + b) / v.length.toDouble();
  if (lengths) {
    final edges = closed ? v.length : v.length - 1;
    for (var i = 0; i < edges; i++) {
      final a = v[i], b = v[(i + 1) % v.length];
      final mid = (a + b) / 2;
      // Push the label outward, away from the middle of the shape.
      final out = closed ? mid - centroid : Offset(-(b - a).dy, (b - a).dx);
      final n = out.distance == 0 ? Offset.zero : out / out.distance;
      label(cm((b - a).distance), mid + n * 18);
    }
  }
  if (angles && closed) {
    for (var i = 0; i < v.length; i++) {
      final prev = v[(i - 1 + v.length) % v.length], at = v[i], next = v[(i + 1) % v.length];
      final inward = centroid - at;
      final n = inward.distance == 0 ? Offset.zero : inward / inward.distance;
      label(degrees(angleAt(prev, at, next)), at + n * 30);
    }
  }
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
