import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../core/bench.dart';

/// Round objects rolled one full turn along a scale: the distance is the
/// circumference, and C ÷ d comes out near 3.14 (π) for every one.
class CircleBench extends LabBench {
  const CircleBench();

  /// Diameter of each object (cm).
  static const objects = {'coin': 2.5, 'cap': 3.0, 'bangle': 6.4, 'cd': 12.0, 'plate': 24.0};

  @override
  String get kind => 'circle';

  @override
  LabParams get defaults => {'object': 'bangle', 'roll': 0.0};

  @override
  LabParams get preview => {'object': 'bangle', 'roll': 0.625};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('object', tr('Object'), [for (final o in objects.keys) (o, objectName(o))]),
        LabSlider('roll', tr('Turns'), 0, 1, divisions: 8, decimals: 3),
      ];

  @override
  LabParams act(String action, LabParams p) => action == 'set:object' ? {...p, 'roll': 0.0} : p;

  static String objectName(String o) => switch (o) {
        'coin' => tr('Coin'),
        'cap' => tr('Bottle cap'),
        'cd' => tr('CD'),
        'plate' => tr('Steel plate'),
        _ => tr('Bangle'),
      };

  static double diameter(LabParams p) => objects[pStr(p, 'object', 'bangle')] ?? 6.4;

  /// The circumference as read off the scale, to the nearest millimetre.
  static double measured(LabParams p) => (math.pi * diameter(p) * 10).round() / 10;

  @override
  List<LabColumn> get columns => [LabColumn(tr('Object')), LabColumn(tr('Diameter d (cm)'), 1), LabColumn(tr('Circumference C (cm)'), 1), LabColumn(tr('C ÷ d'), 2)];

  @override
  LabReading read(LabParams p) {
    if (pNum(p, 'roll', 0) < 1) return LabReading.not(tr('Roll the object one full turn first.'));
    final d = diameter(p), c = measured(p);
    return LabReading.row([objectName(pStr(p, 'object', 'bangle')), d, c, c / d]);
  }

  @override
  List<String> live(LabParams p) => [
        'd = ${diameter(p).toStringAsFixed(1)} cm',
        if (pNum(p, 'roll', 0) >= 1) 'C = ${measured(p).toStringAsFixed(1)} cm' else tr('Rolled {x} cm', {'x': (math.pi * diameter(p) * pNum(p, 'roll', 0)).toStringAsFixed(1)}),
      ];

  @override
  LabGraph graph(LabParams p) => const LabGraph(1, 2, throughOrigin: true);

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final ratios = [for (final r in rows) (r[3] as num).toDouble()];
    final avg = ratios.reduce((a, b) => a + b) / ratios.length;
    final k = LabGraph.slope(const LabGraph(1, 2).points(rows));
    return tr('Average C ÷ d = {k} from {n} readings; slope of the C–d graph = {s}. This number is π (about 3.14), the same for every circle.',
        {'k': avg.toStringAsFixed(2), 'n': rows.length, 's': (k ?? avg).toStringAsFixed(2)});
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final o = pStr(p, 'object', 'bangle');
    final d = diameter(p), roll = pNum(p, 'roll', 0).clamp(0.0, 1.0);
    final c = math.pi * d;
    final s = math.min(w * 0.8 / (c + d), h * 0.5 / d);
    final x0 = w * 0.08, rulerY = h * 0.72;
    final r = d / 2 * s;

    // The scale along the table.
    final ruler = Rect.fromLTWH(x0 - 12, rulerY, (c + d * 0.6) * s + 24, 34);
    canvas.drawRect(ruler, fill(const Color(0xFFF3E3A6)));
    canvas.drawRect(ruler, stroke(LabInk.ink, 1.5));
    final step = s >= 28 ? 1 : (s >= 10 ? 2 : 5);
    for (var cm = 0; cm * s <= ruler.width - 24; cm++) {
      final x = x0 + cm * s;
      final major = cm % step == 0;
      canvas.drawLine(Offset(x, rulerY), Offset(x, rulerY + (major ? 12 : 6)), stroke(LabInk.ink, 1));
      if (major) label(canvas, '$cm', Offset(x, rulerY + 22), size: 10);
    }
    label(canvas, 'cm', Offset(ruler.right - 16, rulerY + 22), size: 10, color: LabInk.muted);

    // The path of the red mark: it starts on the scale at 0 and lands again at C.
    final th = roll * 2 * math.pi;
    final centre = Offset(x0 + roll * c * s, rulerY - r);
    final trace = Path()..moveTo(x0, rulerY);
    for (var k = 1; k <= 60; k++) {
      final a = th * k / 60;
      trace.lineTo(x0 + (a - math.sin(a)) * r, rulerY - (1 - math.cos(a)) * r);
    }
    canvas.drawPath(trace, stroke(LabInk.red.withValues(alpha: 0.5), 1.5));
    canvas.drawCircle(Offset(x0, rulerY), 4, fill(LabInk.red));

    _object(canvas, o, centre, r, th);
    final mark = centre + Offset(-math.sin(th), math.cos(th)) * r;
    canvas.drawCircle(mark, 6, fill(LabInk.red));
    canvas.drawCircle(mark, 6, stroke(Colors.white, 1.5));
    // The diameter across the object.
    final dl = centre - Offset(r, 0), dr = centre + Offset(r, 0);
    final pen = stroke(LabInk.blue, 2);
    canvas.drawLine(dl, dr, pen);
    arrowHead(canvas, dl, dl - dr, pen, size: 8);
    arrowHead(canvas, dr, dr - dl, pen, size: 8);
    label(canvas, 'd = ${d.toStringAsFixed(1)} cm', centre - Offset(0, r + 18), size: 15, bold: true, color: LabInk.blue, halo: LabInk.paper);

    if (roll >= 1) {
      // One full turn: the distance rolled is the circumference.
      final end = Offset(x0 + c * s, rulerY);
      canvas.drawCircle(end, 4, fill(LabInk.red));
      final y = rulerY + 52;
      final a = Offset(x0, y), b = Offset(end.dx, y);
      final redPen = stroke(LabInk.red, 2);
      canvas.drawLine(a, b, redPen);
      arrowHead(canvas, a, a - b, redPen, size: 9);
      arrowHead(canvas, b, b - a, redPen, size: 9);
      label(canvas, 'C = ${measured(p).toStringAsFixed(1)} cm', Offset((a.dx + b.dx) / 2, y + 18), size: 16, bold: true, color: LabInk.red, halo: LabInk.paper);
      label(canvas, 'C ÷ d = ${(measured(p) / d).toStringAsFixed(2)}', Offset(w * 0.5, h * 0.08), size: 20, bold: true, color: LabInk.green);
    } else {
      label(canvas, objectName(o), Offset(w * 0.5, h * 0.08), size: 18, bold: true, color: LabInk.blue);
    }
  }

  void _object(Canvas canvas, String o, Offset c, double r, double turn) {
    canvas.save();
    canvas.translate(c.dx, c.dy);
    canvas.rotate(turn);
    switch (o) {
      case 'bangle':
        canvas.drawCircle(Offset.zero, r - r * 0.07, stroke(const Color(0xFFD4A21F), r * 0.14));
        canvas.drawCircle(Offset.zero, r - r * 0.07, stroke(const Color(0x66FFFFFF), 1.5));
      case 'cd':
        canvas.drawCircle(Offset.zero, r, fill(const Color(0xFFD9DEE3)));
        canvas.drawCircle(Offset.zero, r * 0.8, stroke(const Color(0x5588C0E8), r * 0.2));
        canvas.drawCircle(Offset.zero, r * 0.62, stroke(const Color(0x44E8A3D0), r * 0.1));
        canvas.drawCircle(Offset.zero, r * 0.12, fill(LabInk.paper));
        canvas.drawCircle(Offset.zero, r, stroke(LabInk.muted, 1.5));
      case 'plate':
        canvas.drawCircle(Offset.zero, r, fill(const Color(0xFFC3CAD1)));
        canvas.drawCircle(Offset.zero, r * 0.78, fill(const Color(0xFFD5DADF)));
        canvas.drawCircle(Offset.zero, r, stroke(LabInk.muted, 1.5));
      case 'cap':
        canvas.drawCircle(Offset.zero, r, fill(const Color(0xFFD64541)));
        for (var k = 0; k < 24; k++) {
          final a = k * math.pi / 12;
          canvas.drawLine(Offset(math.cos(a), math.sin(a)) * r * 0.86, Offset(math.cos(a), math.sin(a)) * r, stroke(const Color(0xFF9E2A26), 1.5));
        }
      default:
        canvas.drawCircle(Offset.zero, r, fill(const Color(0xFFD9C37A)));
        canvas.drawCircle(Offset.zero, r, stroke(const Color(0xFF8C7A2E), 2));
        label(canvas, '₹', Offset.zero, size: r * 0.9, bold: true, color: const Color(0xFF6B5A1E));
    }
    canvas.restore();
  }
}
