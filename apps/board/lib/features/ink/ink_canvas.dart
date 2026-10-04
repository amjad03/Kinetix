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
          // Strokes being drawn repaint on every move.
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

void paintStroke(Canvas canvas, Stroke s, BoardBackground bg) {
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
  // Quadratic curves through the midpoints give smooth ink without lagging behind the pen.
  final path = Path()..moveTo(pts.first.x, pts.first.y);
  for (var i = 1; i < pts.length - 1; i++) {
    final mid = Offset((pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
    path.quadraticBezierTo(pts[i].x, pts[i].y, mid.dx, mid.dy);
  }
  path.lineTo(pts.last.x, pts.last.y);
  canvas.drawPath(path, paint);
}

class _CommittedPainter extends CustomPainter {
  _CommittedPainter(this.controller, this.background) : super(repaint: controller.committed);

  final InkController controller;
  final BoardBackground background;

  @override
  void paint(Canvas canvas, Size size) {
    for (final s in controller.strokes) {
      paintStroke(canvas, s, background);
    }
  }

  @override
  bool shouldRepaint(_CommittedPainter old) => old.controller != controller || old.background != background;
}

class _ActivePainter extends CustomPainter {
  _ActivePainter(this.controller, this.background) : super(repaint: controller);

  final InkController controller;
  final BoardBackground background;

  @override
  void paint(Canvas canvas, Size size) {
    for (final s in controller.activeStrokes) {
      paintStroke(canvas, s, background);
    }
  }

  @override
  bool shouldRepaint(_ActivePainter old) => old.background != background;
}
