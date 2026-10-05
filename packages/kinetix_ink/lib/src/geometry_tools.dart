import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'ink_models.dart';
import 'whiteboard_controller.dart';

/// The ruler and protractor that lie on the board. Both are in board units, so they zoom with
/// the board, and both read in centimetres and degrees like the real ones. Drag one to move
/// it; twist with two fingers (or drag the round handle) to turn it.

const _scaleInk = Color(0xFF3A4048);

TextPainter _label(String text, double size, Color color, {bool bold = false}) => TextPainter(
  text: TextSpan(
    text: text,
    style: TextStyle(fontSize: size, color: color, fontWeight: bold ? FontWeight.w700 : FontWeight.w500, fontFamily: KxFonts.board),
  ),
  textDirection: TextDirection.ltr,
)..layout();

/// Snaps an angle to 15° steps (0°, 45°, 90°…) when it is within 2° of one.
double _snapAngle(double a) {
  const step = math.pi / 12;
  final nearest = (a / step).roundToDouble() * step;
  return (a - nearest).abs() < 2 * math.pi / 180 ? nearest : a;
}

/// The on-screen ruler. Pen lines that start on its edge run straight along it (see
/// [RulerState.snapEdge]); its body moves and turns.
class RulerOverlay extends StatefulWidget {
  const RulerOverlay({super.key, required this.controller, this.closeLabel = 'Hide ruler', this.turnLabel = 'Turn'});

  final WhiteboardController controller;
  final String closeLabel;
  final String turnLabel;

  @override
  State<RulerOverlay> createState() => _RulerOverlayState();
}

class _RulerOverlayState extends State<RulerOverlay> {
  double _startAngle = 0;

  WhiteboardController get b => widget.controller;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Listenable.merge([b.ruler, b.view]),
      builder: (context, _) {
        final r = b.ruler.value;
        final v = b.view.value;
        final c = v.toScreen(r.center);
        final w = r.length * v.scale, h = RulerState.thickness * v.scale;
        return Stack(
          children: [
            Positioned(
              left: c.dx - w / 2,
              top: c.dy - h / 2,
              width: w,
              height: h,
              child: Transform.rotate(
                angle: r.angle,
                child: GestureDetector(
                  key: const Key('ruler'),
                  behavior: HitTestBehavior.opaque,
                  onScaleStart: (_) => _startAngle = b.ruler.value.angle,
                  onScaleUpdate: (d) {
                    final cur = b.ruler.value;
                    b.ruler.value = cur.copyWith(
                      center: cur.center + d.focalPointDelta / v.scale,
                      angle: d.pointerCount > 1 ? _snapAngle(_startAngle + d.rotation) : cur.angle,
                    );
                  },
                  child: Stack(
                    children: [
                      Positioned.fill(child: CustomPaint(painter: _RulerPainter(r, v.scale))),
                      Positioned(
                        right: 6,
                        top: h / 2 - 20,
                        child: Tooltip(
                          message: widget.turnLabel,
                          child: GestureDetector(
                            behavior: HitTestBehavior.opaque,
                            onPanUpdate: (d) {
                              final cur = b.ruler.value;
                              b.ruler.value = cur.copyWith(angle: _snapAngle(cur.angle + d.delta.dy / (w / 2)));
                            },
                            child: const _Knob(),
                          ),
                        ),
                      ),
                      Positioned(
                        left: 6,
                        top: h / 2 - 20,
                        child: IconButton(
                          key: const Key('ruler-close'),
                          tooltip: widget.closeLabel,
                          onPressed: b.toggleRuler,
                          icon: const Icon(Icons.close, size: 20),
                          style: IconButton.styleFrom(backgroundColor: const Color(0x14000000), minimumSize: const Size(36, 36)),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _Knob extends StatelessWidget {
  const _Knob();

  @override
  Widget build(BuildContext context) => Container(
    width: 40,
    height: 40,
    decoration: BoxDecoration(color: KxColor.inverse.withValues(alpha: 0.85), shape: BoxShape.circle),
    child: const Icon(Icons.rotate_right, color: Colors.white, size: 22),
  );
}

class _RulerPainter extends CustomPainter {
  _RulerPainter(this.r, this.scale);

  final RulerState r;
  final double scale;

  @override
  void paint(Canvas canvas, Size size) {
    final body = RRect.fromRectAndRadius(Offset.zero & size, const Radius.circular(6));
    canvas.drawRRect(body, Paint()..color = const Color(0xE6FFFFFF));
    canvas.drawRRect(
      body,
      Paint()
        ..color = const Color(0x55000000)
        ..style = PaintingStyle.stroke,
    );
    final tick = Paint()
      ..color = _scaleInk
      ..strokeWidth = 1;
    // Millimetres, as on a real ruler (1 cm = pxPerCm board units).
    final mm = pxPerCm / 10 * scale;
    final showMm = mm >= 4;
    final count = (r.length / (pxPerCm / 10)).floor();
    for (var i = 0; i <= count; i++) {
      final x = i * mm;
      final cm = i % 10 == 0, half = i % 5 == 0;
      if (!cm && !half && !showMm) continue;
      final len = cm ? size.height * 0.32 : (half ? size.height * 0.22 : size.height * 0.13);
      canvas.drawLine(Offset(x, 0), Offset(x, len), tick);
      canvas.drawLine(Offset(x, size.height), Offset(x, size.height - len), tick);
      if (cm && i > 0 && x < size.width - 10) {
        final tp = _label('${i ~/ 10}', math.max(9, math.min(14, size.height * 0.2)), _scaleInk);
        tp.paint(canvas, Offset(x - tp.width / 2, size.height * 0.34));
      }
    }
    var deg = (r.angle * 180 / math.pi) % 180;
    if (deg < 0) deg += 180;
    final label = _label('${deg.round()}°', math.max(11, math.min(18, size.height * 0.26)), KxColor.accent, bold: true);
    label.paint(canvas, Offset(size.width / 2 - label.width / 2, size.height / 2 - label.height / 2 + size.height * 0.08));
  }

  @override
  bool shouldRepaint(_RulerPainter old) => old.r != r || old.scale != scale;
}

/// The on-screen protractor: a half circle with degree scales both ways, like a real one.
class ProtractorOverlay extends StatefulWidget {
  const ProtractorOverlay({super.key, required this.controller, this.closeLabel = 'Hide protractor', this.turnLabel = 'Turn'});

  final WhiteboardController controller;
  final String closeLabel;
  final String turnLabel;

  @override
  State<ProtractorOverlay> createState() => _ProtractorOverlayState();
}

class _ProtractorOverlayState extends State<ProtractorOverlay> {
  double _startAngle = 0;

  WhiteboardController get b => widget.controller;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Listenable.merge([b.protractor, b.view]),
      builder: (context, _) {
        final p = b.protractor.value;
        final v = b.view.value;
        final c = v.toScreen(p.center);
        final r = ProtractorState.radius * v.scale;
        const foot = 34.0;
        return Stack(
          children: [
            Positioned(
              left: c.dx - r,
              top: c.dy - r,
              width: 2 * r,
              height: r + foot,
              child: Transform(
                transform: Matrix4.rotationZ(p.angle),
                origin: Offset(r, r),
                child: GestureDetector(
                  key: const Key('protractor'),
                  behavior: HitTestBehavior.translucent,
                  onScaleStart: (_) => _startAngle = b.protractor.value.angle,
                  onScaleUpdate: (d) {
                    final cur = b.protractor.value;
                    b.protractor.value = cur.copyWith(
                      center: cur.center + d.focalPointDelta / v.scale,
                      angle: d.pointerCount > 1 ? _snapAngle(_startAngle + d.rotation) : cur.angle,
                    );
                  },
                  child: Stack(
                    children: [
                      Positioned.fill(child: CustomPaint(painter: _ProtractorPainter(r, p.angle))),
                      Positioned(
                        right: 0,
                        top: r - 6,
                        child: Tooltip(
                          message: widget.turnLabel,
                          child: GestureDetector(
                            behavior: HitTestBehavior.opaque,
                            onPanUpdate: (d) {
                              final cur = b.protractor.value;
                              b.protractor.value = cur.copyWith(angle: _snapAngle(cur.angle + d.delta.dy / r));
                            },
                            child: const _Knob(),
                          ),
                        ),
                      ),
                      Positioned(
                        left: 0,
                        top: r - 6,
                        child: IconButton(
                          key: const Key('protractor-close'),
                          tooltip: widget.closeLabel,
                          onPressed: b.toggleProtractor,
                          icon: const Icon(Icons.close, size: 18),
                          style: IconButton.styleFrom(backgroundColor: const Color(0x22000000), minimumSize: const Size(36, 36)),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _ProtractorPainter extends CustomPainter {
  _ProtractorPainter(this.r, this.angle);

  final double r;
  final double angle;

  @override
  void paint(Canvas canvas, Size size) {
    final c = Offset(r, r);
    final body = Path()
      ..moveTo(0, r)
      ..arcTo(Rect.fromCircle(center: c, radius: r), math.pi, math.pi, false)
      ..lineTo(2 * r, r + 26)
      ..lineTo(0, r + 26)
      ..close();
    canvas.drawPath(body, Paint()..color = const Color(0xD9FFFFFF));
    canvas.drawPath(
      body,
      Paint()
        ..color = const Color(0x66000000)
        ..style = PaintingStyle.stroke,
    );
    final tick = Paint()
      ..color = _scaleInk
      ..strokeWidth = 1;
    final fs = math.max(8.0, math.min(13.0, r * 0.055));
    for (var d = 0; d <= 180; d++) {
      if (d % 5 != 0 && r < 140) continue;
      final a = math.pi + d * math.pi / 180;
      final dir = Offset(math.cos(a), math.sin(a));
      final len = d % 10 == 0 ? r * 0.12 : (d % 5 == 0 ? r * 0.08 : r * 0.045);
      canvas.drawLine(c + dir * r, c + dir * (r - len), tick);
      if (d % 10 == 0) {
        final outer = _label('$d', fs, _scaleInk);
        outer.paint(canvas, c + dir * (r - len - fs * 1.1) - Offset(outer.width / 2, outer.height / 2));
        final inner = _label('${180 - d}', fs * 0.85, const Color(0xFFD7263D));
        inner.paint(canvas, c + dir * (r - len - fs * 2.6) - Offset(inner.width / 2, inner.height / 2));
      }
    }
    canvas.drawLine(
      Offset(0, r),
      Offset(2 * r, r),
      Paint()
        ..color = _scaleInk
        ..strokeWidth = 1.5,
    );
    canvas.drawLine(
      c - const Offset(0, 14),
      c,
      Paint()
        ..color = KxColor.accent
        ..strokeWidth = 2,
    );
    canvas.drawCircle(c, 4, Paint()..color = KxColor.accent);
    var deg = (angle * 180 / math.pi) % 360;
    if (deg < 0) deg += 360;
    final label = _label('${deg.round()}°', fs * 1.2, KxColor.accent, bold: true);
    label.paint(canvas, c + Offset(-label.width / 2, 6));
  }

  /// Only the half circle and its base strip catch touches.
  @override
  bool? hitTest(Offset position) => position.dy > r ? position.dy < r + 26 : (position - Offset(r, r)).distance <= r;

  @override
  bool shouldRepaint(_ProtractorPainter old) => old.r != r || old.angle != angle;
}
