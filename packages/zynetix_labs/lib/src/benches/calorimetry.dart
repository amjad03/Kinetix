import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../core/bench.dart';

/// A metal block in boiling water, and a calorimeter of cold water with a
/// thermometer: the block goes in and both settle at one temperature.
class CalorimetryBench extends LabBench {
  const CalorimetryBench();

  /// Specific heat capacities (J/g °C) from the tables.
  static const specificHeat = {'copper': 0.39, 'iron': 0.45, 'aluminium': 0.90};
  static const water = 4.2;
  static const metalColours = {'copper': Color(0xFFC46B3C), 'iron': Color(0xFF7D858E), 'aluminium': Color(0xFFC9CFD6)};

  @override
  String get kind => 'calorimetry';

  @override
  LabParams get defaults => {'metal': 'copper', 'mass': 100.0, 'water': 100.0, 'start': 25.0, 'dropped': false};

  @override
  LabParams get preview => {...defaults, 'dropped': true};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('metal', tr('Metal'), [('copper', tr('Copper')), ('iron', tr('Iron')), ('aluminium', tr('Aluminium'))]),
        LabSlider('mass', tr('Mass of the block'), 50, 200, divisions: 6, unit: ' g'),
        LabSlider('water', tr('Mass of water'), 50, 200, divisions: 6, unit: ' g'),
        LabSlider('start', tr('Water starts at'), 20, 35, divisions: 15, unit: ' °C'),
        if (pBool(p, 'dropped')) LabAction('reset', tr('Take it out'), Icons.undo) else LabAction('drop', tr('Drop the hot block in'), Icons.south, primary: true),
      ];

  static String metalName(String id) => switch (id) { 'iron' => tr('Iron'), 'aluminium' => tr('Aluminium'), _ => tr('Copper') };

  /// Final temperature: heat lost by the metal (from 100 °C) = heat gained
  /// by the water.
  static double finalTemperature(LabParams p) {
    final c = specificHeat[pStr(p, 'metal', 'copper')] ?? 0.39;
    final m = pNum(p, 'mass', 100), mw = pNum(p, 'water', 100), t = pNum(p, 'start', 25);
    return (m * c * 100 + mw * water * t) / (m * c + mw * water);
  }

  /// The specific heat worked out from a thermometer read to 0.1 °C.
  static double measured(LabParams p) {
    final theta = (finalTemperature(p) * 10).round() / 10;
    final m = pNum(p, 'mass', 100), mw = pNum(p, 'water', 100), t = pNum(p, 'start', 25);
    return mw * water * (theta - t) / (m * (100 - theta));
  }

  @override
  List<LabColumn> get columns => [
        LabColumn(tr('Metal')),
        LabColumn(tr('m (g)'), 0),
        LabColumn(tr('Water (g)'), 0),
        LabColumn(tr('t (°C)'), 0),
        LabColumn(tr('θ (°C)'), 1),
        LabColumn(tr('c (J/g °C)'), 2),
      ];

  @override
  LabReading read(LabParams p) {
    if (!pBool(p, 'dropped')) return LabReading.not(tr('Drop the hot block into the water first.'));
    return LabReading.row([
      metalName(pStr(p, 'metal', 'copper')),
      pNum(p, 'mass', 100).round(),
      pNum(p, 'water', 100).round(),
      pNum(p, 'start', 25).round(),
      (finalTemperature(p) * 10).round() / 10,
      (measured(p) * 100).round() / 100,
    ]);
  }

  @override
  List<String> live(LabParams p) => [
        tr('Block at 100 °C, water at {t} °C', {'t': pNum(p, 'start', 25).round()}),
        if (pBool(p, 'dropped')) tr('Both settle at {x} °C', {'x': finalTemperature(p).toStringAsFixed(1)}) else tr('The block is heating in boiling water'),
      ];

  @override
  LabParams act(String action, LabParams p) => switch (action) {
        'drop' => {...p, 'dropped': true},
        'reset' => {...p, 'dropped': false},
        'set:metal' => {...p, 'dropped': false},
        _ => p,
      };

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final by = <String, List<double>>{};
    for (final r in rows) {
      (by[r[0] as String] ??= []).add((r[5] as num).toDouble());
    }
    return [
      for (final e in by.entries)
        tr('{metal}: c ≈ {c} J/g °C from {n} readings (tables: {ref}).', {
          'metal': e.key,
          'c': (e.value.reduce((a, b) => a + b) / e.value.length).toStringAsFixed(2),
          'n': e.value.length,
          'ref': specificHeat.entries.firstWhere((x) => metalName(x.key) == e.key, orElse: () => specificHeat.entries.first).value.toStringAsFixed(2),
        }),
      tr("Heat lost by the metal = heat gained by the water. Water's specific heat (4.2) is far larger."),
    ].join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final dropped = pBool(p, 'dropped');
    final metal = pStr(p, 'metal', 'copper');
    final colour = metalColours[metal] ?? metalColours['copper']!;
    final blockSide = 22 + pNum(p, 'mass', 100) / 10;

    // Boiling water on a burner (left).
    final beaker = Rect.fromLTWH(w * 0.08, h * 0.38, w * 0.24, h * 0.36);
    canvas.drawRect(Rect.fromLTRB(beaker.left, beaker.top + beaker.height * 0.25, beaker.right, beaker.bottom), fill(LabInk.water));
    canvas.drawRect(beaker, stroke(LabInk.ink, 2));
    for (var i = 0; i < 6; i++) {
      final phase = (t * 0.9 + i * 0.37) % 1.0;
      final x = beaker.left + beaker.width * (0.15 + 0.7 * ((i * 0.53) % 1));
      final y = beaker.bottom - 6 - phase * beaker.height * 0.7;
      canvas.drawCircle(Offset(x, y), 3 + 2 * phase, stroke(Colors.white, 1.4));
    }
    final flame = Path()
      ..moveTo(beaker.center.dx - 16, beaker.bottom + 34)
      ..quadraticBezierTo(beaker.center.dx, beaker.bottom + 4 - 4 * math.sin(t * 6), beaker.center.dx + 16, beaker.bottom + 34)
      ..close();
    canvas.drawPath(flame, fill(LabInk.accent));
    label(canvas, '100 °C', beaker.topCenter - const Offset(0, 14), size: 13, bold: true, color: LabInk.red);

    // Calorimeter in its jacket (right).
    final jacket = Rect.fromLTWH(w * 0.52, h * 0.3, w * 0.3, h * 0.5);
    canvas.drawRRect(RRect.fromRectAndRadius(jacket, const Radius.circular(10)), fill(const Color(0xFFE9E3D5)));
    canvas.drawRRect(RRect.fromRectAndRadius(jacket, const Radius.circular(10)), stroke(LabInk.ink, 1.5));
    final cup = jacket.deflate(14);
    final level = cup.bottom - cup.height * (0.35 + pNum(p, 'water', 100) / 200 * 0.45);
    canvas.drawRect(Rect.fromLTRB(cup.left, level, cup.right, cup.bottom), fill(LabInk.water));
    canvas.drawRect(cup, stroke(const Color(0xFFC46B3C), 2.5));

    // The block: hanging in the boiling water, or at the bottom of the cup.
    final blockCentre = dropped ? Offset(cup.center.dx - cup.width * 0.2, cup.bottom - blockSide / 2 - 4) : Offset(beaker.center.dx, beaker.bottom - blockSide / 2 - 10);
    canvas.drawLine(blockCentre - Offset(0, blockSide / 2), Offset(blockCentre.dx, (dropped ? jacket.top : beaker.top) - 30), stroke(LabInk.ink, 1.2));
    final block = Rect.fromCenter(center: blockCentre, width: blockSide, height: blockSide);
    canvas.drawRect(block, fill(colour));
    canvas.drawRect(block, stroke(LabInk.ink, 1.2));

    // Thermometer in the calorimeter.
    final temp = dropped ? finalTemperature(p) : pNum(p, 'start', 25);
    final tx = cup.center.dx + cup.width * 0.25;
    final tTop = jacket.top - h * 0.2, tBottom = cup.bottom - 10;
    canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTRB(tx - 5, tTop, tx + 5, tBottom), const Radius.circular(5)), fill(Colors.white));
    canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTRB(tx - 5, tTop, tx + 5, tBottom), const Radius.circular(5)), stroke(LabInk.ink, 1.2));
    final mercury = tBottom - (tBottom - tTop) * ((temp - 10) / 50).clamp(0.02, 1.0);
    canvas.drawRect(Rect.fromLTRB(tx - 2, mercury, tx + 2, tBottom), fill(LabInk.red));
    canvas.drawCircle(Offset(tx, tBottom), 7, fill(LabInk.red));
    label(canvas, '${temp.toStringAsFixed(1)} °C', Offset(tx + 44, mercury), size: 15, bold: true, halo: LabInk.paper);
    final metalLabel = '${metalName(metal)} · ${pNum(p, 'mass', 100).round()} g';
    if (dropped) {
      label(canvas, '$metalLabel + ${tr('Water {m} g', {'m': pNum(p, 'water', 100).round()})}', Offset(cup.center.dx, jacket.bottom + 18), size: 13, color: LabInk.muted);
    } else {
      label(canvas, metalLabel, Offset(beaker.center.dx, beaker.top - 36), size: 13, color: LabInk.muted);
      label(canvas, tr('Water {m} g', {'m': pNum(p, 'water', 100).round()}), Offset(cup.center.dx, jacket.bottom + 18), size: 13, color: LabInk.muted);
    }
  }
}
