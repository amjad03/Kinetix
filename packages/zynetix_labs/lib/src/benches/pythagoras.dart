import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../core/bench.dart';

/// A triangle with squares drawn on its sides, counted in unit squares:
/// a² + b² = c² exactly when the angle between a and b is a right angle.
class PythagorasBench extends LabBench {
  const PythagorasBench();

  static const colA = Color(0xFF1F5FD6), colB = Color(0xFFD64541), colC = Color(0xFF1E8C4E);

  @override
  String get kind => 'pythagoras';

  @override
  LabParams get defaults => {'a': 4.0, 'b': 3.0, 'C': 90.0};

  @override
  List<LabControl> controls(LabParams p) => [
        LabSlider('a', tr('Side a'), 3, 12, divisions: 9),
        LabSlider('b', tr('Side b'), 3, 12, divisions: 9),
        LabSlider('C', tr('Angle C between them'), 60, 120, divisions: 12, unit: '°'),
      ];

  /// c² by the cosine rule (the bench measures it; the class compares).
  static double cSquared(LabParams p) {
    final a = pNum(p, 'a', 4), b = pNum(p, 'b', 3), c = pNum(p, 'C', 90) * math.pi / 180;
    return a * a + b * b - 2 * a * b * math.cos(c);
  }

  @override
  List<LabColumn> get columns => [LabColumn('a', 0), LabColumn('b', 0), LabColumn(tr('∠C (degree)'), 0), LabColumn('a² + b²', 0), LabColumn('c²', 1)];

  @override
  LabReading read(LabParams p) {
    final a = pNum(p, 'a', 4).round(), b = pNum(p, 'b', 3).round();
    return LabReading.row([a, b, pNum(p, 'C', 90).round(), a * a + b * b, (cSquared(p) * 10).round() / 10]);
  }

  @override
  List<String> live(LabParams p) {
    final a = pNum(p, 'a', 4).round(), b = pNum(p, 'b', 3).round();
    return ['a² + b² = ${a * a + b * b}', 'c² = ${cSquared(p).toStringAsFixed(1)}'];
  }

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    double sum(List<Object> r) => (r[3] as num).toDouble();
    double c2(List<Object> r) => (r[4] as num).toDouble();
    final right = [for (final r in rows) if (r[2] == 90) r];
    final acute = [for (final r in rows) if ((r[2] as num) < 90) r];
    final obtuse = [for (final r in rows) if ((r[2] as num) > 90) r];
    final triplets = <String>{
      for (final r in right)
        if ((math.sqrt(c2(r)) - math.sqrt(c2(r)).round()).abs() < 1e-6)
          tr('{a}, {b}, {c} is a Pythagorean triplet.', {'a': math.min(r[0] as int, r[1] as int), 'b': math.max(r[0] as int, r[1] as int), 'c': math.sqrt(c2(r)).round()}),
    };
    return [
      if (right.isNotEmpty && right.every((r) => (sum(r) - c2(r)).abs() < 0.05)) tr('When ∠C = 90°, a² + b² = c² (in {n} readings).', {'n': right.length}),
      if (acute.isNotEmpty && acute.every((r) => c2(r) < sum(r))) tr('When ∠C is less than 90°, c² is less than a² + b².'),
      if (obtuse.isNotEmpty && obtuse.every((r) => c2(r) > sum(r))) tr('When ∠C is more than 90°, c² is more than a² + b².'),
      ...triplets,
    ].join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final a = pNum(p, 'a', 4).roundToDouble(), b = pNum(p, 'b', 3).roundToDouble();
    final angle = pNum(p, 'C', 90);
    final ca = angle * math.pi / 180;
    // Units, y up: C at the origin, B along the x axis, A at angle C.
    const pc = Offset.zero;
    final pb = Offset(a, 0), pa = Offset(b * math.cos(ca), b * math.sin(ca));
    // Each square: a corner, the side along the triangle, and the outward side.
    Offset unit(Offset v) => v / v.distance;
    (Offset, Offset, Offset) square(Offset from, Offset to, Offset away) {
      final e1 = to - from;
      var n = Offset(-e1.dy, e1.dx);
      if ((away - from).dx * n.dx + (away - from).dy * n.dy > 0) n = -n;
      return (from, e1, unit(n) * e1.distance);
    }

    final sqA = square(pc, pb, pa), sqB = square(pc, pa, pb), sqC = square(pb, pa, pc);
    final corners = [
      for (final (o, e1, e2) in [sqA, sqB, sqC]) ...[o, o + e1, o + e2, o + e1 + e2],
    ];
    final minX = corners.map((q) => q.dx).reduce(math.min), maxX = corners.map((q) => q.dx).reduce(math.max);
    final minY = corners.map((q) => q.dy).reduce(math.min), maxY = corners.map((q) => q.dy).reduce(math.max);
    final area = Rect.fromLTRB(w * 0.03, h * 0.05, w * 0.64, h * 0.95);
    final s = math.min(area.width / (maxX - minX), area.height / (maxY - minY));
    final origin = Offset(area.center.dx - (minX + maxX) / 2 * s, area.center.dy + (minY + maxY) / 2 * s);
    Offset map(Offset q) => Offset(origin.dx + q.dx * s, origin.dy - q.dy * s);

    void drawSquare((Offset, Offset, Offset) sq, Color colour, String text) {
      final (o, e1, e2) = sq;
      final path = Path()..addPolygon([map(o), map(o + e1), map(o + e1 + e2), map(o + e2)], true);
      canvas.drawPath(path, fill(colour.withValues(alpha: 0.16)));
      // Unit squares: grid lines one unit apart.
      final len = e1.distance;
      final u1 = unit(e1), u2 = unit(e2);
      canvas.save();
      canvas.clipPath(path);
      for (var k = 1; k < len; k++) {
        canvas.drawLine(map(o + u1 * k.toDouble()), map(o + u1 * k.toDouble() + e2), stroke(colour.withValues(alpha: 0.45), 1));
        canvas.drawLine(map(o + u2 * k.toDouble()), map(o + u2 * k.toDouble() + e1), stroke(colour.withValues(alpha: 0.45), 1));
      }
      canvas.restore();
      canvas.drawPath(path, stroke(colour, 2));
      label(canvas, text, map(o + e1 / 2 + e2 / 2), size: 15, bold: true, color: colour, halo: const Color(0xDDFFFFFF));
    }

    drawSquare(sqA, colA, 'a² = ${(a * a).round()}');
    drawSquare(sqB, colB, 'b² = ${(b * b).round()}');
    drawSquare(sqC, colC, 'c² = ${cSquared(p).toStringAsFixed(1)}');

    final tri = Path()..addPolygon([map(pa), map(pb), map(pc)], true);
    canvas.drawPath(tri, fill(const Color(0xFFF7E6C4)));
    canvas.drawPath(tri, stroke(LabInk.ink, 2.5));
    final centre = map((pa + pb + pc) / 3);
    void vertex(Offset q, String name) {
      final at = map(q);
      label(canvas, name, at + unit(at - centre) * 16, size: 15, bold: true);
    }

    vertex(pa, 'A');
    vertex(pb, 'B');
    vertex(pc, 'C');
    // The angle at C: a small square when it is a right angle.
    final at = map(pc);
    final r = math.min(26.0, s * 0.8);
    if (angle.round() == 90) {
      final u = unit(map(pb) - at) * r, v = unit(map(pa) - at) * r;
      canvas.drawPath(Path()..addPolygon([at + u, at + u + v, at + v], false), stroke(LabInk.ink, 2));
    } else {
      final start = math.atan2(map(pb).dy - at.dy, map(pb).dx - at.dx);
      canvas.drawArc(Rect.fromCircle(center: at, radius: r), start, -ca, false, stroke(LabInk.ink, 2));
    }

    // The comparison, worked out.
    final x = w * 0.68;
    final sum = a * a + b * b, c2 = cSquared(p);
    label(canvas, '∠C = ${angle.round()}°', Offset(x, h * 0.2), size: 20, bold: true, centre: false);
    label(canvas, 'a² + b² = ${(a * a).round()} + ${(b * b).round()} = ${sum.round()}', Offset(x, h * 0.34), size: 17, bold: true, color: LabInk.ink, centre: false);
    label(canvas, 'c² = ${c2.toStringAsFixed(1)}', Offset(x, h * 0.44), size: 17, bold: true, color: colC, centre: false);
    final (sign, colour) = (c2 - sum).abs() < 0.05 ? ('=', LabInk.green) : (c2 < sum ? ('<', LabInk.red) : ('>', LabInk.red));
    label(canvas, 'c² $sign a² + b²', Offset(x, h * 0.58), size: 24, bold: true, color: colour, centre: false);
  }
}
