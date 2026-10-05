import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/bench.dart';

/// Laboratory glassware drawn the way a practical record shows it.
abstract final class Glass {
  /// A burette from [top] down, [height] tall, holding liquid of [colour]
  /// after [usedMl] of its [capacity] mL have run out.
  static void burette(Canvas canvas, Offset top, double height, double usedMl, {double capacity = 50, Color colour = const Color(0x5578B7E0)}) {
    final w = height * 0.06;
    final tube = Rect.fromLTWH(top.dx - w / 2, top.dy, w, height);
    final level = top.dy + height * (usedMl / capacity).clamp(0.0, 1.0);
    canvas.drawRect(Rect.fromLTRB(tube.left, level, tube.right, tube.bottom), fill(colour));
    canvas.drawRect(tube, stroke(LabInk.ink, 1.5));
    for (var ml = 0; ml <= capacity; ml += 5) {
      final y = top.dy + height * ml / capacity;
      canvas.drawLine(Offset(tube.right, y), Offset(tube.right + (ml % 10 == 0 ? 10 : 6), y), stroke(LabInk.ink, 1));
      if (ml % 10 == 0) label(canvas, '$ml', Offset(tube.right + 22, y), size: 10, color: LabInk.muted);
    }
    // Stopcock and jet.
    canvas.drawRect(Rect.fromCenter(center: Offset(top.dx, tube.bottom + 8), width: w * 2.4, height: 6), fill(LabInk.muted));
    canvas.drawLine(Offset(top.dx, tube.bottom), Offset(top.dx, tube.bottom + 26), stroke(LabInk.ink, 2));
  }

  /// A conical (titration) flask with its bottom centre at [base].
  static void conicalFlask(Canvas canvas, Offset base, double size, Color liquid, {double fillFraction = 0.45}) {
    final w = size, h = size * 1.1, neck = size * 0.22;
    final path = Path()
      ..moveTo(base.dx - neck / 2, base.dy - h)
      ..lineTo(base.dx - neck / 2, base.dy - h * 0.7)
      ..lineTo(base.dx - w / 2, base.dy)
      ..lineTo(base.dx + w / 2, base.dy)
      ..lineTo(base.dx + neck / 2, base.dy - h * 0.7)
      ..lineTo(base.dx + neck / 2, base.dy - h);
    canvas.save();
    canvas.clipPath(Path.from(path)..close());
    canvas.drawRect(Rect.fromLTRB(base.dx - w, base.dy - h * 0.7 * fillFraction, base.dx + w, base.dy), fill(liquid));
    canvas.restore();
    canvas.drawPath(path, stroke(LabInk.ink, 2));
  }

  /// A beaker with its bottom centre at [base].
  static void beaker(Canvas canvas, Offset base, double width, double height, Color liquid, {double fillFraction = 0.6}) {
    final r = Rect.fromLTWH(base.dx - width / 2, base.dy - height, width, height);
    canvas.drawRect(Rect.fromLTRB(r.left, r.bottom - height * fillFraction, r.right, r.bottom), fill(liquid));
    final path = Path()
      ..moveTo(r.left - 4, r.top)
      ..lineTo(r.left, r.top + 6)
      ..lineTo(r.left, r.bottom)
      ..lineTo(r.right, r.bottom)
      ..lineTo(r.right, r.top);
    canvas.drawPath(path, stroke(LabInk.ink, 2));
  }

  /// A test tube with its bottom at [base], holding [liquid]; an optional
  /// [solid] (a precipitate) settles at the bottom.
  static void testTube(Canvas canvas, Offset base, double height, Color liquid, {Color? solid, double fillFraction = 0.5}) {
    final w = height * 0.22;
    final body = RRect.fromRectAndCorners(Rect.fromLTWH(base.dx - w / 2, base.dy - height, w, height), bottomLeft: Radius.circular(w / 2), bottomRight: Radius.circular(w / 2));
    canvas.save();
    canvas.clipRRect(body);
    canvas.drawRect(Rect.fromLTRB(body.left, base.dy - height * fillFraction, body.right, base.dy), fill(liquid));
    if (solid != null) {
      final rnd = math.Random(5);
      for (var k = 0; k < 40; k++) {
        canvas.drawCircle(Offset(body.left + rnd.nextDouble() * w, base.dy - rnd.nextDouble() * height * 0.12), 2.2, fill(solid));
      }
    }
    canvas.restore();
    canvas.drawRRect(body, stroke(LabInk.ink, 2));
  }

  /// A Bunsen burner with its flame tinted [flame] (null: the blue
  /// non-luminous flame).
  static void bunsen(Canvas canvas, Offset base, double size, {Color? flame, double t = 0}) {
    canvas.drawRect(Rect.fromCenter(center: base - Offset(0, size * 0.04), width: size * 0.5, height: size * 0.08), fill(LabInk.muted));
    canvas.drawRect(Rect.fromLTWH(base.dx - size * 0.06, base.dy - size * 0.55, size * 0.12, size * 0.5), fill(const Color(0xFF8A9199)));
    final tip = base - Offset(0, size * 0.55);
    final flick = math.sin(t * 9) * size * 0.02;
    final outer = Path()
      ..moveTo(tip.dx - size * 0.09, tip.dy)
      ..quadraticBezierTo(tip.dx - size * 0.14, tip.dy - size * 0.35, tip.dx + flick, tip.dy - size * 0.65)
      ..quadraticBezierTo(tip.dx + size * 0.14, tip.dy - size * 0.35, tip.dx + size * 0.09, tip.dy)
      ..close();
    canvas.drawPath(outer, Paint()
      ..color = (flame ?? const Color(0xFF64B5F6)).withValues(alpha: flame == null ? 0.45 : 0.85)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4));
    final inner = Path()
      ..moveTo(tip.dx - size * 0.05, tip.dy)
      ..quadraticBezierTo(tip.dx, tip.dy - size * 0.3, tip.dx + size * 0.05, tip.dy)
      ..close();
    canvas.drawPath(inner, fill(const Color(0xFF1E88E5).withValues(alpha: 0.7)));
  }

  /// A digital meter readout (pH meter, conductivity meter, colorimeter).
  static void readout(Canvas canvas, Rect r, String value, String caption) {
    canvas.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(10)), fill(const Color(0xFF2E343C)));
    label(canvas, value, r.center, size: r.height * 0.36, bold: true, color: const Color(0xFF9FD8B9));
    label(canvas, caption, Offset(r.center.dx, r.bottom + 14), size: 13, color: LabInk.muted);
  }
}
