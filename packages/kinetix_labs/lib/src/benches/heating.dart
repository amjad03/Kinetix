import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../core/bench.dart';

/// A beaker of crushed ice heated steadily, with a thermometer in it.
class HeatingBench extends LabBench {
  const HeatingBench();

  static const meltMinutes = 6.0; // time for all the ice to melt
  static const rate = 10.0; // °C per minute once it is all water

  @override
  String get kind => 'heating';

  @override
  bool get animated => true;

  @override
  LabParams get defaults => {'minutes': 0.0, 'salt': false};

  @override
  LabParams get preview => {'minutes': 20.0, 'salt': false};

  @override
  List<LabControl> controls(LabParams p) => [
        LabSlider('minutes', tr('Time heating'), 0, 30, divisions: 30, unit: ' min'),
        LabToggle('salt', tr('Salt in the ice')),
      ];

  static double meltingPoint(LabParams p) => pBool(p, 'salt') ? -2 : 0;
  static double boilingPoint(LabParams p) => pBool(p, 'salt') ? 101 : 100;

  /// Temperature (°C) after [minutes] of heating.
  static double temperature(LabParams p) {
    final m = pNum(p, 'minutes', 0);
    final mp = meltingPoint(p), bp = boilingPoint(p);
    if (m <= meltMinutes) return mp;
    return math.min(bp, mp + (m - meltMinutes) * rate);
  }

  /// 0: melting, 1: water warming, 2: boiling.
  static int phase(LabParams p) {
    final m = pNum(p, 'minutes', 0);
    if (m < meltMinutes) return 0;
    return temperature(p) >= boilingPoint(p) ? 2 : 1;
  }

  static String stateName(int phase) => switch (phase) {
        0 => tr('Ice melting (solid + liquid)'),
        1 => tr('Water (liquid)'),
        _ => tr('Water boiling (liquid + gas)'),
      };

  @override
  List<LabColumn> get columns => [LabColumn(tr('Time (min)'), 0), LabColumn(tr('Temperature (°C)'), 0), LabColumn(tr('State'))];

  @override
  LabReading read(LabParams p) => LabReading.row([pNum(p, 'minutes', 0).round(), temperature(p).round(), stateName(phase(p))]);

  @override
  List<String> live(LabParams p) => ['${temperature(p).round()} °C', stateName(phase(p))];

  @override
  LabGraph graph(LabParams p) => const LabGraph(0, 1);

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final melt = {for (final r in rows) if (r[2] == stateName(0)) r[1]};
    final boil = {for (final r in rows) if (r[2] == stateName(2)) r[1]};
    return [
      if (melt.length == 1) tr('While the ice melted the thermometer stayed at {t} °C: the melting point.', {'t': melt.first}),
      if (boil.length == 1) tr('While the water boiled it stayed at {t} °C: the boiling point.', {'t': boil.first}),
      if (melt.isNotEmpty || boil.isNotEmpty) tr('The temperature does not change while the state changes.'),
    ].join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final m = pNum(p, 'minutes', 0);
    final temp = temperature(p);
    final ph = phase(p);

    // Tripod, gauze and burner.
    final beaker = Rect.fromLTWH(w * 0.3, h * 0.24, w * 0.26, h * 0.42);
    final gauzeY = beaker.bottom + 4;
    canvas.drawLine(Offset(beaker.left - 20, gauzeY), Offset(beaker.right + 20, gauzeY), stroke(LabInk.wire, 5));
    for (final x in [beaker.left - 10, beaker.right + 10]) {
      canvas.drawLine(Offset(x, gauzeY), Offset(x + (x < beaker.center.dx ? -20 : 20), h * 0.94), stroke(LabInk.wire, 4));
    }
    final burner = Rect.fromCenter(center: Offset(beaker.center.dx, h * 0.86), width: 30, height: h * 0.14);
    canvas.drawRect(burner, fill(const Color(0xFF8C939B)));
    {
      final flame = 1 + 0.08 * math.sin(t * 11);
      final top = Offset(beaker.center.dx, burner.top - (burner.top - gauzeY) * 0.85 * flame);
      final path = Path()
        ..moveTo(beaker.center.dx - 12, burner.top)
        ..quadraticBezierTo(beaker.center.dx - 14, (burner.top + top.dy) / 2, top.dx, top.dy)
        ..quadraticBezierTo(beaker.center.dx + 14, (burner.top + top.dy) / 2, beaker.center.dx + 12, burner.top)
        ..close();
      canvas.drawPath(path, fill(const Color(0xCC4A7BE0)));
    }

    // Contents: ice cubes shrinking while melting, water level, bubbles.
    final water = Rect.fromLTRB(beaker.left, beaker.top + beaker.height * 0.3, beaker.right, beaker.bottom);
    canvas.drawRect(water, fill(pBool(p, 'salt') ? const Color(0x668FB7D8) : LabInk.water));
    if (ph == 0) {
      final left = 1 - m / meltMinutes;
      final rnd = math.Random(9);
      final cubes = (14 * left).ceil();
      for (var k = 0; k < cubes; k++) {
        final c = Offset(water.left + 14 + rnd.nextDouble() * (water.width - 28), water.top + 10 + rnd.nextDouble() * (water.height - 20));
        final s = 12 + 12 * left;
        canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: c, width: s, height: s), const Radius.circular(3)), fill(const Color(0xDDEFF7FB)));
        canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: c, width: s, height: s), const Radius.circular(3)), stroke(const Color(0xFF9FC8E8), 1));
      }
    }
    if (ph == 2 || (ph == 1 && temp > 80)) {
      final rnd = math.Random(4);
      final many = ph == 2 ? 26 : 6;
      for (var k = 0; k < many; k++) {
        final x = water.left + 10 + rnd.nextDouble() * (water.width - 20);
        final speed = 30 + rnd.nextDouble() * 40;
        final y = water.bottom - ((t * speed + rnd.nextDouble() * 200) % water.height);
        canvas.drawCircle(Offset(x, y), 2 + rnd.nextDouble() * 3, stroke(Colors.white.withValues(alpha: 0.8), 1.5));
      }
    }
    if (ph == 2) {
      // Steam above the beaker.
      for (var k = 0; k < 3; k++) {
        final x = beaker.left + beaker.width * (0.3 + 0.2 * k);
        final path = Path()..moveTo(x, beaker.top - 4);
        for (var j = 1; j <= 4; j++) {
          path.quadraticBezierTo(x + (j.isOdd ? 10 : -10), beaker.top - 4 - j * 12 + 6, x, beaker.top - 4 - j * 12 - ((t * 20) % 12));
        }
        canvas.drawPath(path, stroke(LabInk.muted.withValues(alpha: 0.5), 2));
      }
    }
    canvas.drawLine(beaker.topLeft, beaker.bottomLeft, stroke(LabInk.ink, 3));
    canvas.drawLine(beaker.bottomLeft, beaker.bottomRight, stroke(LabInk.ink, 3));
    canvas.drawLine(beaker.bottomRight, beaker.topRight, stroke(LabInk.ink, 3));

    // Thermometer: −10 °C to 110 °C, bulb in the middle of the beaker.
    final tx = beaker.center.dx + beaker.width * 0.18;
    final tTop = h * 0.06, tBottom = beaker.bottom - 22;
    canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTRB(tx - 6, tTop, tx + 6, tBottom), const Radius.circular(6)), fill(Colors.white));
    canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTRB(tx - 6, tTop, tx + 6, tBottom), const Radius.circular(6)), stroke(LabInk.ink, 1.5));
    canvas.drawCircle(Offset(tx, tBottom + 6), 9, fill(LabInk.red));
    double y(double c) => tBottom - (tBottom - tTop - 24) * (c + 10) / 120;
    canvas.drawRect(Rect.fromLTRB(tx - 2.5, y(temp), tx + 2.5, tBottom + 2), fill(LabInk.red));
    for (var c = -10; c <= 110; c += 10) {
      canvas.drawLine(Offset(tx + 6, y(c.toDouble())), Offset(tx + (c % 50 == 0 ? 16 : 11), y(c.toDouble())), stroke(LabInk.ink, 1));
      if (c % 50 == 0) label(canvas, '$c', Offset(tx + 32, y(c.toDouble())), size: 11, color: LabInk.muted);
    }
    // Clamp holding the thermometer, above the scale.
    canvas.drawRect(Rect.fromLTRB(tx - 30, tTop + 2, tx + 30, tTop + 12), fill(LabInk.wire));
    label(canvas, '${temp.round()} °C', Offset(tx + 96, y(temp)), size: 20, bold: true, color: LabInk.red, halo: LabInk.paper);

    // Clock and what is happening.
    final clock = Offset(w * 0.84, h * 0.28);
    final r = math.min(w, h) * 0.09;
    canvas.drawCircle(clock, r, fill(Colors.white));
    canvas.drawCircle(clock, r, stroke(LabInk.ink, 2.5));
    final a = -math.pi / 2 + 2 * math.pi * m / 60;
    canvas.drawArc(Rect.fromCircle(center: clock, radius: r * 0.8), -math.pi / 2, 2 * math.pi * m / 60, true, fill(LabInk.accent.withValues(alpha: 0.4)));
    canvas.drawLine(clock, clock + Offset(math.cos(a), math.sin(a)) * r * 0.8, stroke(LabInk.ink, 2.5));
    label(canvas, tr('{n} minutes', {'n': m.round()}), clock + Offset(0, r + 18), size: 15, bold: true);
    label(canvas, stateName(ph), Offset(w * 0.84, h * 0.62), size: 15, bold: true, color: LabInk.blue);
  }
}
