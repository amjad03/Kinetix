import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../core/bench.dart';

/// Four jars of moong seeds, each missing one thing (or nothing), watched
/// day by day: only the seeds with water, air and warmth sprout.
class GerminationBench extends LabBench {
  const GerminationBench();

  /// A: dry cotton. B: moist cotton. C: under boiled water with oil on top.
  /// D: moist cotton in a refrigerator.
  static const jars = ['A', 'B', 'C', 'D'];

  @override
  String get kind => 'germination';

  @override
  LabParams get defaults => {'jar': 'B', 'days': 0.0};

  @override
  LabParams get preview => {'jar': 'B', 'days': 5.0};

  @override
  List<LabControl> controls(LabParams p) => [
        LabSlider('days', tr('Days'), 0, 7, divisions: 7),
        LabChoice('jar', tr('Jar to record'), [for (final j in jars) (j, jarName(j))]),
      ];

  static String jarName(String j) => tr('Jar {j}', {'j': j});

  /// What the jar lacks.
  static String lacks(String j) => switch (j) {
        'A' => tr('No water'),
        'C' => tr('No air'),
        'D' => tr('No warmth'),
        _ => tr('Nothing'),
      };

  static String setup(String j) => switch (j) {
        'A' => tr('Dry cotton'),
        'C' => tr('Under boiled water, oil on top'),
        'D' => tr('Moist cotton, in a refrigerator'),
        _ => tr('Moist cotton, in the room'),
      };

  /// Length of the sprout in mm after [days] (0: not germinated).
  static double sprout(String j, double days) => j == 'B' ? math.max(0, math.min(45, (days - 1.5) * 9)) : 0;

  /// Seeds with water swell in the first day, sprouting or not.
  static double swell(String j, double days) => j == 'A' ? 1 : 1 + 0.25 * math.min(1, days);

  @override
  List<LabColumn> get columns => [LabColumn(tr('Jar')), LabColumn(tr('What it lacks')), LabColumn(tr('Days'), 0), LabColumn(tr('Germinated?')), LabColumn(tr('Sprout length (mm)'), 0)];

  @override
  LabReading read(LabParams p) {
    final d = pNum(p, 'days', 0);
    if (d < 3) return LabReading.not(tr('Wait at least three days before deciding.'));
    final j = pStr(p, 'jar', 'B');
    final s = sprout(j, d);
    return LabReading.row([jarName(j), lacks(j), d.round(), s > 0 ? tr('Yes') : tr('No'), s.round()]);
  }

  @override
  List<String> live(LabParams p) {
    final d = pNum(p, 'days', 0), j = pStr(p, 'jar', 'B');
    return [tr('Day {n}', {'n': d.round()}), '${jarName(j)}: ${setup(j)}', if (sprout(j, d) > 0) tr('Sprout {x} mm', {'x': sprout(j, d).round()})];
  }

  @override
  LabGraph graph(LabParams p) => LabGraph(2, 4, include: (r) => r[0] == jarName('B'));

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final grew = {for (final r in rows) if (r[3] == tr('Yes')) '${r[0]}'};
    final didNot = {for (final r in rows) if (r[3] == tr('No')) '${r[0]} (${r[1]})'};
    return [
      if (grew.isNotEmpty) tr('Germinated: {list}.', {'list': grew.join(', ')}),
      if (didNot.isNotEmpty) tr('Did not germinate: {list}.', {'list': didNot.join(', ')}),
      if (grew.contains(jarName('B')) && didNot.length == 3) tr('Seeds need water, air and warmth together to germinate.'),
    ].join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final days = pNum(p, 'days', 0);
    final chosen = pStr(p, 'jar', 'B');
    canvas.drawRect(Rect.fromLTWH(0, h * 0.84, w, h * 0.16), fill(const Color(0xFFE9D8B8)));
    label(canvas, tr('Day {n}', {'n': days.round()}), Offset(w / 2, h * 0.07), size: 20, bold: true, color: LabInk.blue);
    final slot = w / 4;
    for (var i = 0; i < 4; i++) {
      final j = jars[i];
      final cx = slot * (i + 0.5);
      final jar = Rect.fromCenter(center: Offset(cx, h * 0.56), width: math.min(slot * 0.62, h * 0.4), height: h * 0.5);
      if (j == chosen) {
        canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTRB(cx - slot * 0.48, h * 0.14, cx + slot * 0.48, h * 0.97), const Radius.circular(12)), fill(const Color(0x221F5FD6)));
      }
      if (j == 'D') {
        // The refrigerator around jar D.
        final fridge = jar.inflate(12).translate(0, -4);
        canvas.drawRRect(RRect.fromRectAndRadius(fridge, const Radius.circular(10)), fill(const Color(0x33A9D3EE)));
        canvas.drawRRect(RRect.fromRectAndRadius(fridge, const Radius.circular(10)), stroke(const Color(0xFF6FA8C8), 2));
        label(canvas, '4 °C', Offset(fridge.center.dx + 14, fridge.top - 14), size: 13, bold: true, color: const Color(0xFF2F6F98));
        _snowflake(canvas, Offset(fridge.center.dx - 22, fridge.top - 14), 8);
      }
      _jar(canvas, jar, j, days);
      label(canvas, jarName(j), Offset(cx, h * 0.2), size: 16, bold: true);
      label(canvas, lacks(j), Offset(cx, h * 0.9), size: 13, bold: true, color: j == 'B' ? LabInk.green : LabInk.red);
    }
  }

  void _snowflake(Canvas canvas, Offset c, double r) {
    for (var k = 0; k < 3; k++) {
      final a = k * math.pi / 3;
      final d = Offset(math.cos(a), math.sin(a)) * r;
      canvas.drawLine(c - d, c + d, stroke(const Color(0xFF6FA8C8), 1.6));
    }
  }

  void _jar(Canvas canvas, Rect jar, String j, double days) {
    final glass = RRect.fromRectAndCorners(jar, bottomLeft: const Radius.circular(10), bottomRight: const Radius.circular(10));
    canvas.drawRRect(glass, fill(const Color(0x1878B7E0)));
    // Cotton at the bottom: white when dry, greyish when wet.
    final cotton = Rect.fromLTRB(jar.left + 4, jar.bottom - jar.height * 0.2, jar.right - 4, jar.bottom - 4);
    if (j != 'C') {
      final c = j == 'A' ? Colors.white : const Color(0xFFD8DEE4);
      for (var k = 0; k < 7; k++) {
        canvas.drawCircle(Offset(cotton.left + cotton.width * (k + 0.5) / 7, cotton.top + 8), cotton.width / 9, fill(c));
      }
      canvas.drawRect(Rect.fromLTRB(cotton.left, cotton.top + 8, cotton.right, cotton.bottom), fill(c));
    }
    // Boiled water to the top with a film of oil keeping the air out.
    if (j == 'C') {
      final water = Rect.fromLTRB(jar.left, jar.top + jar.height * 0.12, jar.right, jar.bottom);
      canvas.drawRRect(RRect.fromRectAndCorners(water, bottomLeft: const Radius.circular(10), bottomRight: const Radius.circular(10)), fill(LabInk.water));
      canvas.drawRect(Rect.fromLTRB(jar.left, water.top, jar.right, water.top + 10), fill(const Color(0xCCE9B840)));
    }
    // Three seeds; in jar B they sprout.
    final seedY = j == 'C' ? jar.bottom - 10 : cotton.top + 2;
    final s = sprout(j, days), sw = swell(j, days);
    for (var k = 0; k < 3; k++) {
      final c = Offset(jar.left + jar.width * (0.25 + 0.25 * k), seedY);
      if (s > 0) {
        // The root grows down into the cotton, the shoot up towards the light.
        final len = s / 45 * jar.height * 0.55;
        final root = Path()
          ..moveTo(c.dx, c.dy)
          ..quadraticBezierTo(c.dx + 6, c.dy + 8, c.dx + 2, c.dy + math.min(len * 0.4, cotton.height - 6) + 4);
        canvas.drawPath(root, stroke(const Color(0xFFF3EFD9), 3));
        if (s > 8) {
          final tip = Offset(c.dx - 4 + k * 3, c.dy - len);
          final shoot = Path()
            ..moveTo(c.dx, c.dy)
            ..quadraticBezierTo(c.dx - 10, c.dy - len * 0.5, tip.dx, tip.dy);
          canvas.drawPath(shoot, stroke(const Color(0xFF7CB342), 3));
          if (s > 20) {
            for (final side in [-1.0, 1.0]) {
              canvas.save();
              canvas.translate(tip.dx, tip.dy);
              canvas.rotate(side * 0.7);
              canvas.drawOval(Rect.fromCenter(center: Offset(side * 8, -3), width: 16, height: 8), fill(const Color(0xFF558B2F)));
              canvas.restore();
            }
          }
        }
      }
      canvas.drawOval(Rect.fromCenter(center: c, width: 14 * sw, height: 9 * sw), fill(const Color(0xFF6B8E23)));
      canvas.drawOval(Rect.fromCenter(center: c, width: 14 * sw, height: 9 * sw), stroke(const Color(0xFF3F5A16), 1));
    }
    canvas.drawRRect(glass, stroke(LabInk.ink, 2.2));
    canvas.drawRect(Rect.fromLTRB(jar.left - 3, jar.top - 3, jar.right + 3, jar.top + 3), fill(LabInk.ink));
  }
}
