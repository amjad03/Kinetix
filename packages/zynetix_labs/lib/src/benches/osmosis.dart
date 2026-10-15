import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../core/bench.dart';

/// Ten raisins left in plain water or a strong sugar or salt solution and
/// weighed hour by hour: water crosses the skin towards the stronger
/// solution, so they swell (endosmosis) or shrink (exosmosis).
class OsmosisBench extends LabBench {
  const OsmosisBench();

  static const solutions = ['water', 'sugar', 'salt'];

  /// Mass of the ten raisins (g): dry, and fully swollen in water.
  static const dryG = 3.0, swollenG = 5.1;

  @override
  String get kind => 'osmosis';

  @override
  LabParams get defaults => {'solution': 'water', 'soaked': false, 'hours': 0.0};

  @override
  LabParams get preview => {'solution': 'water', 'soaked': false, 'hours': 6.0};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('solution', tr('Solution'), [for (final s in solutions) (s, solutionName(s))]),
        LabToggle('soaked', tr('Raisins soaked in water first')),
        LabSlider('hours', tr('Time'), 0, 8, divisions: 8, unit: ' h'),
      ];

  /// A new solution or new raisins start the clock again.
  @override
  LabParams act(String action, LabParams p) => action == 'set:solution' || action == 'set:soaked' ? {...p, 'hours': 0.0} : p;

  static String solutionName(String s) => switch (s) {
        'sugar' => tr('Strong sugar solution'),
        'salt' => tr('Strong salt solution'),
        _ => tr('Plain water'),
      };

  static double startMass(LabParams p) => pBool(p, 'soaked') ? swollenG : dryG;

  /// Where the mass settles in this solution.
  static double _target(LabParams p) => switch (pStr(p, 'solution', 'water')) {
        'sugar' => pBool(p, 'soaked') ? 3.4 : 2.9,
        'salt' => pBool(p, 'soaked') ? 3.3 : 2.8,
        _ => swollenG,
      };

  /// Mass of the ten raisins (g) after [hours].
  static double mass(LabParams p) {
    final s = startMass(p);
    return s + (_target(p) - s) * (1 - math.exp(-pNum(p, 'hours', 0) / 2));
  }

  /// Which way water is moving now: +1 into the raisins, -1 out, 0 hardly at all.
  static int flow(LabParams p) {
    final rate = (_target(p) - mass(p)) / 2;
    return rate > 0.05 ? 1 : (rate < -0.05 ? -1 : 0);
  }

  @override
  List<LabColumn> get columns => [
        LabColumn(tr('Raisins')),
        LabColumn(tr('Solution')),
        LabColumn(tr('Time (h)'), 0),
        LabColumn(tr('Mass at start (g)'), 1),
        LabColumn(tr('Mass now (g)'), 1),
        LabColumn(tr('Change (g)'), 1),
      ];

  @override
  LabReading read(LabParams p) {
    final hours = pNum(p, 'hours', 0);
    if (hours < 1) return LabReading.not(tr('Leave the raisins in the solution for at least an hour.'));
    final start = startMass(p), now = (mass(p) * 10).round() / 10;
    return LabReading.row([pBool(p, 'soaked') ? tr('Soaked') : tr('Dry'), solutionName(pStr(p, 'solution', 'water')), hours.round(), start, now, ((now - start) * 10).round() / 10]);
  }

  @override
  List<String> live(LabParams p) => [
        tr('Mass of 10 raisins: {x} g', {'x': mass(p).toStringAsFixed(1)}),
        switch (flow(p)) { 1 => tr('Water moves into the raisins'), -1 => tr('Water moves out of the raisins'), _ => tr('Hardly any water moves') },
      ];

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    double change(List<Object> r) => (r[5] as num).toDouble();
    final gained = rows.any((r) => change(r) >= 0.3), lost = rows.any((r) => change(r) <= -0.3);
    final little = rows.any((r) => r[0] == tr('Dry') && r[1] != solutionName('water') && change(r).abs() < 0.3);
    return [
      if (gained) tr('Raisins gained water in plain water and swelled (endosmosis).'),
      if (lost) tr('Swollen raisins lost water in the strong solution and shrank (exosmosis).'),
      if (little) tr('Dry raisins changed little in the strong solutions: inside and outside were about equally strong.'),
      if (gained || lost) tr('Water moves through the skin from the weaker solution to the stronger one.'),
    ].join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final s = pStr(p, 'solution', 'water');
    final m = mass(p);
    canvas.drawRect(Rect.fromLTWH(0, h * 0.86, w, h * 0.14), fill(const Color(0xFFE9D8B8)));
    final hours = pNum(p, 'hours', 0).round();
    label(canvas, trn(hours, 'After {n} hour', 'After {n} hours'), Offset(w * 0.3, h * 0.07), size: 19, bold: true, color: LabInk.blue);

    // The beaker of solution with the raisins in it.
    final b = Rect.fromLTWH(w * 0.08, h * 0.26, w * 0.42, h * 0.6);
    final liquid = switch (s) { 'sugar' => const Color(0x66E9D48A), 'salt' => const Color(0x55B8D4E6), _ => LabInk.water };
    canvas.drawRect(Rect.fromLTRB(b.left, b.top + b.height * 0.18, b.right, b.bottom), fill(liquid));
    final f = 0.75 + 0.55 * ((m - 2.8) / (swollenG - 2.8)).clamp(0.0, 1.0);
    final rnd = math.Random(12);
    for (var n = 0; n < 10; n++) {
      final c = Offset(b.left + b.width * (0.12 + 0.76 * rnd.nextDouble()), b.bottom - 14 - rnd.nextDouble() * b.height * 0.28);
      _raisin(canvas, c, 13 * f, 1 - ((m - 2.8) / (swollenG - 2.8)).clamp(0.0, 1.0), rnd.nextDouble() * math.pi);
    }
    final glass = stroke(LabInk.ink, 2.5);
    canvas.drawLine(b.topLeft, b.bottomLeft, glass);
    canvas.drawLine(b.bottomLeft, b.bottomRight, glass);
    canvas.drawLine(b.bottomRight, b.topRight, glass);
    label(canvas, solutionName(s), Offset(b.center.dx, b.top + b.height * 0.1), size: 14, bold: true, halo: LabInk.paper);

    // A close look at the skin: water particles crossing it.
    final zc = Offset(w * 0.77, h * 0.33), zr = math.min(w * 0.14, h * 0.24);
    canvas.drawCircle(zc, zr, fill(Colors.white));
    canvas.save();
    canvas.clipPath(Path()..addOval(Rect.fromCircle(center: zc, radius: zr)));
    canvas.drawRect(Rect.fromLTRB(zc.dx, zc.dy - zr, zc.dx + zr, zc.dy + zr), fill(const Color(0x33B5546F)));
    dashed(canvas, Offset(zc.dx, zc.dy - zr), Offset(zc.dx, zc.dy + zr), stroke(const Color(0xFF7A3A55), 3), dash: 10, gap: 4);
    final dots = math.Random(4);
    // Outside (left): water particles, plus sugar or salt in a strong solution.
    for (var n = 0; n < 16; n++) {
      final at = Offset(zc.dx - zr * (0.15 + 0.75 * dots.nextDouble()), zc.dy + zr * (dots.nextDouble() * 1.6 - 0.8));
      final solute = s != 'water' && n % 2 == 0;
      canvas.drawCircle(at, solute ? 6 : 3.5, fill(solute ? const Color(0xFFE8A33D) : LabInk.blue));
    }
    // Inside (right): the raisin's sugary sap.
    for (var n = 0; n < 16; n++) {
      final at = Offset(zc.dx + zr * (0.15 + 0.75 * dots.nextDouble()), zc.dy + zr * (dots.nextDouble() * 1.6 - 0.8));
      final solute = n % 2 == 0;
      canvas.drawCircle(at, solute ? 6 : 3.5, fill(solute ? const Color(0xFFE8A33D) : LabInk.blue));
    }
    canvas.restore();
    canvas.drawCircle(zc, zr, stroke(LabInk.ink, 2));
    final dir = flow(p);
    if (dir != 0) {
      final pen = stroke(LabInk.blue, 4);
      final a = zc + Offset(-zr * 0.45 * dir, zr + 22), c = zc + Offset(zr * 0.45 * dir, zr + 22);
      canvas.drawLine(a, c, pen);
      arrowHead(canvas, c, c - a, pen, size: 14);
    }
    label(canvas, tr('Outside'), zc + Offset(-zr * 0.5, -zr - 14), size: 12, bold: true);
    label(canvas, tr('Inside the raisin'), zc + Offset(zr * 0.5, -zr - 14), size: 12, bold: true);
    label(canvas, switch (dir) { 1 => tr('Water moves into the raisins'), -1 => tr('Water moves out of the raisins'), _ => tr('Hardly any water moves') },
        zc + Offset(0, zr + 46), size: 13, bold: true, color: LabInk.blue, halo: LabInk.paper);

    // The balance: the raisins are blotted dry and weighed.
    final pan = Rect.fromCenter(center: Offset(w * 0.77, h * 0.8), width: w * 0.2, height: h * 0.1);
    canvas.drawRRect(RRect.fromRectAndRadius(pan, const Radius.circular(8)), fill(const Color(0xFFD5DADF)));
    canvas.drawRRect(RRect.fromRectAndRadius(pan, const Radius.circular(8)), stroke(LabInk.ink, 1.5));
    final screen = Rect.fromCenter(center: pan.center + Offset(0, pan.height * 0.12), width: pan.width * 0.56, height: pan.height * 0.56);
    canvas.drawRRect(RRect.fromRectAndRadius(screen, const Radius.circular(4)), fill(const Color(0xFF203028)));
    label(canvas, '${m.toStringAsFixed(1)} g', screen.center, size: 16, bold: true, color: const Color(0xFF7CFFB2));
  }

  void _raisin(Canvas canvas, Offset c, double r, double wrinkled, double turn) {
    canvas.save();
    canvas.translate(c.dx, c.dy);
    canvas.rotate(turn);
    final body = Rect.fromCenter(center: Offset.zero, width: r * 2, height: r * 1.4);
    canvas.drawOval(body, fill(Color.lerp(const Color(0xFF8A4A63), const Color(0xFF4E2233), wrinkled)!));
    // Wrinkles on a dry raisin; a shine on a swollen one.
    for (var k = 0; k < (wrinkled * 4).round(); k++) {
      final y = -r * 0.4 + k * r * 0.28;
      canvas.drawArc(Rect.fromCenter(center: Offset(0, y), width: r * 1.4, height: r * 0.5), 0.3, 2.4, false, stroke(const Color(0xFF2E1320), 1.2));
    }
    if (wrinkled < 0.4) canvas.drawOval(Rect.fromCenter(center: Offset(-r * 0.35, -r * 0.25), width: r * 0.6, height: r * 0.3), fill(const Color(0x55FFFFFF)));
    canvas.restore();
  }
}
