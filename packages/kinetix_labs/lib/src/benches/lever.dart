import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../core/bench.dart';

/// A metre rule on a knife edge at 50 cm, with a weight hung on each side.
class LeverBench extends LabBench {
  const LeverBench();

  static const masses = [50, 100, 150, 200];

  @override
  String get kind => 'lever';

  @override
  LabParams get defaults => {'m1': 100, 'd1': 30.0, 'm2': 150, 'd2': 20.0};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('m1', tr('Left weight'), [for (final m in masses) (m, '$m g')]),
        LabSlider('d1', tr('Left distance'), 5, 45, divisions: 40, unit: ' cm'),
        LabChoice('m2', tr('Right weight'), [for (final m in masses) (m, '$m g')]),
        LabSlider('d2', tr('Right distance'), 5, 45, divisions: 40, unit: ' cm'),
      ];

  /// Anticlockwise (left) and clockwise (right) moments in g cm.
  static (double, double) moments(LabParams p) =>
      (pNum(p, 'm1', 100) * pNum(p, 'd1', 30).roundToDouble(), pNum(p, 'm2', 150) * pNum(p, 'd2', 20).roundToDouble());

  /// Level within 2 % (a real rule settles within that).
  static bool balanced(LabParams p) {
    final (l, r) = moments(p);
    return (l - r).abs() <= 0.02 * math.max(l, r);
  }

  /// Tilt in radians: positive turns clockwise (right side down).
  static double tilt(LabParams p) {
    if (balanced(p)) return 0;
    final (l, r) = moments(p);
    return ((r - l) / math.max(l, r)).clamp(-1.0, 1.0) * 12 * math.pi / 180;
  }

  @override
  List<LabColumn> get columns => [
        LabColumn(tr('m₁ (g)'), 0),
        LabColumn(tr('d₁ (cm)'), 0),
        LabColumn(tr('m₁ × d₁ (g cm)'), 0),
        LabColumn(tr('m₂ (g)'), 0),
        LabColumn(tr('d₂ (cm)'), 0),
        LabColumn(tr('m₂ × d₂ (g cm)'), 0),
      ];

  @override
  LabReading read(LabParams p) {
    if (!balanced(p)) return LabReading.not(tr('The rule is not level yet: move a weight until it balances.'));
    final (l, r) = moments(p);
    return LabReading.row([pInt(p, 'm1', 100), pNum(p, 'd1', 30).round(), l.round(), pInt(p, 'm2', 150), pNum(p, 'd2', 20).round(), r.round()]);
  }

  @override
  List<String> live(LabParams p) {
    final (l, r) = moments(p);
    return [
      tr('Anticlockwise moment: {x} g cm', {'x': l.round()}),
      tr('Clockwise moment: {x} g cm', {'x': r.round()}),
      if (balanced(p)) tr('Balanced') else if (l > r) tr('Turns anticlockwise (left side down)') else tr('Turns clockwise (right side down)'),
    ];
  }

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    var worst = 0.0;
    for (final r in rows) {
      final a = (r[2] as num).toDouble(), c = (r[5] as num).toDouble();
      worst = math.max(worst, (a - c).abs() / math.max(a, c) * 100);
    }
    return trn(rows.length, 'In the balanced reading the anticlockwise moment equals the clockwise moment (within {e}%): the principle of moments.',
        'In all {n} balanced readings the anticlockwise moment equals the clockwise moment (within {e}%): the principle of moments.',
        {'e': worst.toStringAsFixed(1)});
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final pivot = Offset(w / 2, h * 0.4);
    final half = w * 0.42; // 50 cm either side
    final perCm = half / 50;
    final a = tilt(p);
    final dir = Offset(math.cos(a), math.sin(a));
    final normal = Offset(-math.sin(a), math.cos(a));

    // Stand and knife edge.
    canvas.drawRect(Rect.fromLTRB(w / 2 - 70, h * 0.9, w / 2 + 70, h * 0.9 + 12), fill(LabInk.wire));
    canvas.drawRect(Rect.fromLTRB(w / 2 - 5, pivot.dy + 12, w / 2 + 5, h * 0.9), fill(LabInk.wire));
    final knife = Path()
      ..moveTo(pivot.dx, pivot.dy + 4)
      ..lineTo(pivot.dx - 14, pivot.dy + 24)
      ..lineTo(pivot.dx + 14, pivot.dy + 24)
      ..close();
    canvas.drawPath(knife, fill(LabInk.accent));

    // The metre rule with its marks.
    final left = pivot - dir * half, right = pivot + dir * half;
    final bar = Path()
      ..moveTo((left - normal * 6).dx, (left - normal * 6).dy)
      ..lineTo((right - normal * 6).dx, (right - normal * 6).dy)
      ..lineTo((right + normal * 6).dx, (right + normal * 6).dy)
      ..lineTo((left + normal * 6).dx, (left + normal * 6).dy)
      ..close();
    canvas.drawPath(bar, fill(const Color(0xFFF1D9A6)));
    canvas.drawPath(bar, stroke(LabInk.ink, 1.2));
    for (var cm = 0; cm <= 100; cm += 5) {
      final at = left + dir * (cm * perCm);
      canvas.drawLine(at - normal * 6, at - normal * (cm % 10 == 0 ? 0 : 3), stroke(LabInk.ink, 1));
      if (cm % 10 == 0 && w > 500) label(canvas, '$cm', at - normal * 16, size: 10, color: LabInk.muted);
    }

    // A weight on a thread at [d] cm from the pivot (negative: left).
    void weight(double d, int grams, Color colour) {
      final at = pivot + dir * (d * perCm);
      final bottom = at + const Offset(0, 70);
      canvas.drawLine(at, bottom, stroke(LabInk.ink, 1.4));
      final hgt = 14.0 + grams / 10;
      final box = Rect.fromCenter(center: bottom + Offset(0, hgt / 2), width: 30 + grams / 20, height: hgt);
      canvas.drawRRect(RRect.fromRectAndRadius(box, const Radius.circular(4)), fill(colour));
      canvas.drawRRect(RRect.fromRectAndRadius(box, const Radius.circular(4)), stroke(LabInk.ink, 1.2));
      label(canvas, '$grams g', box.center, size: 12, bold: true, color: Colors.white);
      // Distance bracket under the rule.
      final y = pivot.dy + 34;
      canvas.drawLine(Offset(pivot.dx, y), Offset(at.dx, y), stroke(LabInk.blue, 1.4));
      label(canvas, '${d.abs().round()} cm', Offset((pivot.dx + at.dx) / 2, y + 12), size: 12, bold: true, color: LabInk.blue, halo: LabInk.paper);
    }

    weight(-pNum(p, 'd1', 30), pInt(p, 'm1', 100), LabInk.red);
    weight(pNum(p, 'd2', 20), pInt(p, 'm2', 150), LabInk.blue);

    final ok = balanced(p);
    label(canvas, ok ? tr('Level: balanced') : tr('Not level'), Offset(w / 2, h * 0.08), size: 16, bold: true, color: ok ? LabInk.green : LabInk.red);
  }
}
