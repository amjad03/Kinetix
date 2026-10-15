import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../core/bench.dart';

/// A spring balance lowers an object into an overflow can; the water
/// pushed out runs into a measuring cylinder.
class BuoyancyBench extends LabBench {
  const BuoyancyBench();

  /// Volume (cm³), density (g/cm³) and colour of each object.
  static const objects = {
    'iron': (20.0, 7.9, Color(0xFF6E757D)),
    'aluminium': (40.0, 2.7, Color(0xFFB8C0C8)),
    'stone': (50.0, 2.6, Color(0xFF8D8272)),
    'glass': (40.0, 2.5, Color(0xFF9FD3D6)),
    'wood': (60.0, 0.6, Color(0xFFB07A45)),
    'wax': (50.0, 0.9, Color(0xFFF3E6B8)),
  };

  static const liquids = {'water': 1.0, 'salt': 1.1};

  @override
  String get kind => 'buoyancy';

  @override
  LabParams get defaults => {'object': 'stone', 'liquid': 'water', 'depth': 0.0};

  @override
  LabParams get preview => {...defaults, 'depth': 1.0};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('object', tr('Object'), [for (final o in objects.keys) (o, objectName(o))]),
        LabChoice('liquid', tr('Liquid'), [('water', tr('Water')), ('salt', tr('Salt water'))]),
        LabSlider('depth', tr('Lower the object'), 0, 1, divisions: 20, decimals: 2),
      ];

  static String objectName(String id) => switch (id) {
        'iron' => tr('Iron'),
        'aluminium' => tr('Aluminium'),
        'glass' => tr('Glass'),
        'wood' => tr('Wood'),
        'wax' => tr('Wax'),
        _ => tr('Stone'),
      };

  static String liquidName(String id) => id == 'salt' ? tr('Salt water') : tr('Water');

  /// Weight in air, balance reading, liquid displaced (all in gram-weight),
  /// the part under the liquid, and whether it floats.
  static ({double air, double reading, double displaced, double under, bool floats}) state(LabParams p) {
    final (vol, rho, _) = objects[pStr(p, 'object', 'stone')] ?? objects['stone']!;
    final rl = liquids[pStr(p, 'liquid', 'water')] ?? 1.0;
    final depth = pNum(p, 'depth', 0).clamp(0.0, 1.0);
    final air = vol * rho;
    final floats = rho < rl;
    // A floating object sinks only until it displaces its own weight.
    final under = floats ? math.min(depth, rho / rl) : depth;
    final displaced = under * vol * rl;
    return (air: air, reading: math.max(0.0, air - displaced), displaced: displaced, under: under, floats: floats);
  }

  @override
  List<LabColumn> get columns => [
        LabColumn(tr('Object')),
        LabColumn(tr('Liquid')),
        LabColumn(tr('Weight in air (gf)'), 1),
        LabColumn(tr('Weight in liquid (gf)'), 1),
        LabColumn(tr('Loss of weight (gf)'), 1),
        LabColumn(tr('Liquid displaced (gf)'), 1),
        LabColumn(tr('Floats?')),
      ];

  @override
  LabReading read(LabParams p) {
    if (pNum(p, 'depth', 0) < 0.999) return LabReading.not(tr('Lower the object all the way first.'));
    final s = state(p);
    double r1(double v) => (v * 10).round() / 10;
    return LabReading.row([
      objectName(pStr(p, 'object', 'stone')),
      liquidName(pStr(p, 'liquid', 'water')),
      r1(s.air),
      r1(s.reading),
      r1(s.air - s.reading),
      r1(s.displaced),
      s.floats ? tr('Yes') : tr('No'),
    ]);
  }

  @override
  List<String> live(LabParams p) {
    final s = state(p);
    return [
      tr('Balance: {x} gf', {'x': s.reading.toStringAsFixed(1)}),
      tr('Water collected: {x} mL', {'x': (s.displaced / (liquids[pStr(p, 'liquid', 'water')] ?? 1)).toStringAsFixed(1)}),
      if (s.floats && pNum(p, 'depth', 0) >= s.under - 1e-9 && s.under < 1) tr('It floats: the thread is slack'),
    ];
  }

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final sinkers = [for (final r in rows) if (r[6] == tr('No') && (r[4] as num) > 0) r];
    final rd = [for (final r in sinkers) if (r[1] == tr('Water')) '${r[0]} ${((r[2] as num) / (r[4] as num)).toStringAsFixed(1)}'];
    final equal = rows.every((r) => ((r[4] as num) - (r[5] as num)).abs() < 0.2);
    return [
      if (equal) tr('In every reading the loss of weight equals the weight of liquid displaced.'),
      if (rd.isNotEmpty) tr('Relative density (weight in air ÷ loss of weight in water): {list}.', {'list': rd.join(', ')}),
    ].join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final s = state(p);
    final id = pStr(p, 'object', 'stone');
    final (vol, _, colour) = objects[id] ?? objects['stone']!;
    final salt = pStr(p, 'liquid', 'water') == 'salt';
    final liquid = salt ? const Color(0x668FB7D8) : LabInk.water;

    // Overflow can and its spout; the water level stays at the spout.
    final can = Rect.fromLTWH(w * 0.2, h * 0.52, w * 0.3, h * 0.4);
    final level = can.top + can.height * 0.18;
    canvas.drawRect(Rect.fromLTRB(can.left, level, can.right, can.bottom), fill(liquid));
    canvas.drawLine(can.topLeft, can.bottomLeft, stroke(LabInk.ink, 3));
    canvas.drawLine(can.bottomLeft, can.bottomRight, stroke(LabInk.ink, 3));
    canvas.drawLine(can.bottomRight, Offset(can.right, level - 4), stroke(LabInk.ink, 3));
    final spoutEnd = Offset(can.right + w * 0.07, level + 22);
    canvas.drawLine(Offset(can.right, level - 4), spoutEnd - const Offset(0, 8), stroke(LabInk.ink, 3));
    canvas.drawLine(Offset(can.right, level + 6), spoutEnd, stroke(LabInk.ink, 3));
    label(canvas, tr('Overflow can'), Offset(can.center.dx, can.bottom + 16), size: 12, color: LabInk.muted);

    // Measuring cylinder under the spout (0–100 mL).
    final cyl = Rect.fromLTWH(spoutEnd.dx - 14, h * 0.62, 34, h * 0.3);
    final ml = s.displaced / (liquids[pStr(p, 'liquid', 'water')] ?? 1);
    final fillH = cyl.height * (ml / 100).clamp(0.0, 1.0);
    canvas.drawRect(Rect.fromLTRB(cyl.left, cyl.bottom - fillH, cyl.right, cyl.bottom), fill(liquid));
    canvas.drawRect(cyl, stroke(LabInk.ink, 2));
    for (var k = 1; k < 10; k++) {
      final y = cyl.bottom - cyl.height * k / 10;
      canvas.drawLine(Offset(cyl.left, y), Offset(cyl.left + (k.isEven ? 12 : 7), y), stroke(LabInk.muted, 1));
      if (k.isEven) label(canvas, '${k * 10}', Offset(cyl.right + 16, y), size: 10, color: LabInk.muted);
    }
    label(canvas, '${ml.toStringAsFixed(1)} mL', Offset(cyl.center.dx, cyl.top - 14), size: 14, bold: true, halo: LabInk.paper);
    if (s.displaced > 0.05) {
      // Drips from the spout.
      final dy = (t * 120) % 40;
      canvas.drawCircle(spoutEnd + Offset(4, 6 + dy), 2.5, fill(LabInk.blue.withValues(alpha: 0.6)));
    }

    // Spring balance hanging from a support; the spring stretches with the reading.
    final hook = Offset(can.center.dx, h * 0.05);
    canvas.drawLine(Offset(hook.dx - 60, hook.dy), Offset(hook.dx + 60, hook.dy), stroke(LabInk.wire, 5));
    final body = Rect.fromCenter(center: hook + Offset(0, h * 0.13), width: 46, height: h * 0.2);
    canvas.drawRRect(RRect.fromRectAndRadius(body, const Radius.circular(8)), fill(const Color(0xFFE9E4D6)));
    canvas.drawRRect(RRect.fromRectAndRadius(body, const Radius.circular(8)), stroke(LabInk.ink, 2));
    canvas.drawLine(hook, Offset(hook.dx, body.top), stroke(LabInk.ink, 2));
    const full = 200.0; // gf
    for (var k = 0; k <= 10; k++) {
      final y = body.top + 10 + (body.height - 20) * k / 10;
      canvas.drawLine(Offset(body.left + 4, y), Offset(body.left + (k.isEven ? 16 : 10), y), stroke(LabInk.muted, 1));
      if (k.isEven) label(canvas, '${(full * k / 10).round()}', Offset(body.right + 18, y), size: 10, color: LabInk.muted);
    }
    final pointerY = body.top + 10 + (body.height - 20) * (s.reading / full).clamp(0.0, 1.0);
    canvas.drawLine(Offset(body.left + 4, pointerY), Offset(body.right - 4, pointerY), stroke(LabInk.red, 3));
    label(canvas, '${s.reading.toStringAsFixed(1)} gf', Offset(body.left - 44, pointerY), size: 15, bold: true, halo: LabInk.paper);

    // The object on its thread: its bottom goes from above the water to the bottom.
    final side = math.pow(vol, 1 / 3).toDouble() * math.min(w, h) / 42;
    // Depth 0: the object just touches the water; 1: all of it is under.
    final objTop = level - side + (side + (s.floats ? 0 : 24)) * s.under;
    final obj = Rect.fromLTWH(can.center.dx - side / 2, objTop, side, side);
    final slack = s.floats && pNum(p, 'depth', 0) > s.under + 0.01;
    final threadEnd = Offset(obj.center.dx, obj.top);
    final hookBottom = Offset(hook.dx, body.bottom);
    if (slack) {
      // The thread hangs loose above a floating object.
      final path = Path()..moveTo(hookBottom.dx, hookBottom.dy);
      path.quadraticBezierTo(hookBottom.dx + 26, (hookBottom.dy + threadEnd.dy) / 2, threadEnd.dx, threadEnd.dy);
      canvas.drawPath(path, stroke(LabInk.ink, 1.5));
    } else {
      canvas.drawLine(hookBottom, threadEnd, stroke(LabInk.ink, 1.5));
    }
    canvas.drawRect(obj, fill(colour));
    canvas.drawRect(obj, stroke(LabInk.ink, 1.5));
    // Water in front of the submerged part.
    final wet = Rect.fromLTRB(obj.left, math.max(obj.top, level), obj.right, obj.bottom);
    if (wet.height > 0) canvas.drawRect(wet, fill(liquid.withValues(alpha: 0.35)));
    label(canvas, objectName(id), Offset(obj.center.dx + side / 2 + 40, obj.center.dy), size: 13, bold: true, halo: LabInk.paper);
    label(canvas, salt ? tr('Salt water') : tr('Water'), Offset(can.left + 40, can.bottom - 18), size: 12, color: LabInk.blue);
  }
}
