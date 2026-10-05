import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../core/bench.dart';

/// A simple pendulum on a stand with a stopwatch that times 20 swings.
class PendulumBench extends LabBench {
  const PendulumBench();

  static const g = 9.8;
  static const bobs = {'steel': (Color(0xFF8C939B), 50), 'brass': (Color(0xFFC9A248), 60), 'wood': (Color(0xFF9C6B3F), 10)};

  @override
  String get kind => 'pendulum';

  @override
  bool get animated => true;

  @override
  LabParams get defaults => {'length': 100.0, 'bob': 'steel', 'amp': 10.0};

  @override
  List<LabControl> controls(LabParams p) => [
        LabSlider('length', tr('Length L'), 20, 150, divisions: 26, unit: ' cm'),
        LabChoice('bob', tr('Bob'), [('steel', tr('Steel')), ('brass', tr('Brass')), ('wood', tr('Wood'))]),
        LabSlider('amp', tr('Start angle'), 5, 20, divisions: 15, unit: '°'),
      ];

  /// Time period in seconds (small swings).
  static double period(LabParams p) => 2 * math.pi * math.sqrt(pNum(p, 'length', 100) / 100 / g);

  static String bobName(String id) => switch (id) { 'brass' => tr('Brass'), 'wood' => tr('Wood'), _ => tr('Steel') };

  @override
  List<LabColumn> get columns => [
        LabColumn(tr('L (cm)'), 0),
        LabColumn(tr('Bob')),
        LabColumn(tr('Time for 20 swings (s)'), 1),
        LabColumn(tr('T (s)'), 3),
        LabColumn(tr('T² (s²)'), 3),
      ];

  @override
  LabReading read(LabParams p) {
    final t20 = (20 * period(p) * 10).round() / 10;
    final t = t20 / 20;
    return LabReading.row([pNum(p, 'length', 100).round(), bobName(pStr(p, 'bob', 'steel')), t20, (t * 1000).round() / 1000, (t * t * 1000).round() / 1000]);
  }

  @override
  List<String> live(LabParams p) => [
        'L = ${pNum(p, 'length', 100).round()} cm',
        'T = ${period(p).toStringAsFixed(2)} s',
        tr('20 swings take {x} s', {'x': (20 * period(p)).toStringAsFixed(1)}),
      ];

  @override
  LabGraph graph(LabParams p) => const LabGraph(0, 4, throughOrigin: true);

  @override
  String? result(List<List<Object>> rows) {
    final pts = [for (final r in rows) Offset((r[0] as num).toDouble(), (r[4] as num).toDouble())];
    final k = LabGraph.slope(pts);
    if (k == null) return null;
    final lengths = {for (final r in rows) r[0]};
    final gg = 4 * math.pi * math.pi / (k * 100);
    final same = <String>[];
    for (final l in lengths) {
      final bobsAtL = {for (final r in rows) if (r[0] == l) r[1]};
      final ts = {for (final r in rows) if (r[0] == l) r[2]};
      if (bobsAtL.length > 1 && ts.length == 1) same.add('$l');
    }
    return tr('Slope of the T²–L graph = {k} s² per cm, so g = 4π² ÷ slope ≈ {g} m/s².', {'k': k.toStringAsFixed(4), 'g': gg.toStringAsFixed(2)}) +
        (same.isEmpty ? '' : ' ${tr('Different bobs at the same length gave the same time: the mass does not matter.')}');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final len = pNum(p, 'length', 100);
    final amp = pNum(p, 'amp', 10) * math.pi / 180;
    final tp = period(p);
    final theta = amp * math.cos(2 * math.pi * t / tp);
    final (colour, grams) = bobs[pStr(p, 'bob', 'steel')] ?? bobs['steel']!;

    // Stand: base, rod and clamp arm.
    final pivot = Offset(w * 0.42, h * 0.1);
    final scale = h * 0.72 / 150; // px per cm
    final baseY = h * 0.94;
    canvas.drawRect(Rect.fromLTRB(w * 0.08, baseY, w * 0.34, baseY + 12), fill(LabInk.wire));
    canvas.drawRect(Rect.fromLTRB(w * 0.12, h * 0.05, w * 0.12 + 8, baseY), fill(LabInk.wire));
    canvas.drawRect(Rect.fromLTRB(w * 0.12, pivot.dy - 6, pivot.dx + 14, pivot.dy + 4), fill(LabInk.wire));
    canvas.drawRect(Rect.fromCenter(center: pivot, width: 18, height: 16), fill(const Color(0xFFC9A248)));

    // Mean position and the extreme positions.
    final lpx = len * scale;
    dashed(canvas, pivot, pivot + Offset(0, lpx + 30), stroke(LabInk.faint, 1.5));
    for (final s in [-1.0, 1.0]) {
      dashed(canvas, pivot, pivot + Offset(math.sin(s * amp), math.cos(amp)) * lpx, stroke(LabInk.faint, 1));
    }
    canvas.drawArc(Rect.fromCircle(center: pivot, radius: lpx), math.pi / 2 - amp, 2 * amp, false, stroke(LabInk.faint, 1.5));

    // Thread and bob.
    final bob = pivot + Offset(math.sin(theta), math.cos(theta)) * lpx;
    canvas.drawLine(pivot, bob, stroke(LabInk.ink, 1.6));
    final br = 10 + grams / 8;
    canvas.drawCircle(bob, br, fill(colour));
    canvas.drawCircle(bob, br, stroke(LabInk.ink, 1.5));
    canvas.drawCircle(bob - Offset(br * 0.35, br * 0.35), br * 0.25, fill(Colors.white.withValues(alpha: 0.5)));

    // Length bracket.
    final bx = pivot.dx - 40;
    canvas.drawLine(Offset(bx, pivot.dy), Offset(bx, pivot.dy + lpx), stroke(LabInk.blue, 1.5));
    arrowHead(canvas, Offset(bx, pivot.dy), const Offset(0, -1), stroke(LabInk.blue, 1.5), size: 8);
    arrowHead(canvas, Offset(bx, pivot.dy + lpx), const Offset(0, 1), stroke(LabInk.blue, 1.5), size: 8);
    label(canvas, 'L = ${len.round()} cm', Offset(bx - 50, pivot.dy + lpx / 2), size: 14, bold: true, color: LabInk.blue, halo: LabInk.paper);

    // Stopwatch: counts 20 swings, holds the time for 2 s, starts again.
    final cycle = 20 * tp + 2;
    final inCycle = t % cycle;
    final running = inCycle < 20 * tp;
    final shown = running ? inCycle : 20 * tp;
    final count = running ? (inCycle / tp).floor() : 20;
    final sw = Offset(w * 0.8, h * 0.4);
    final sr = math.min(w, h) * 0.13;
    canvas.drawCircle(sw, sr, fill(Colors.white));
    canvas.drawCircle(sw, sr, stroke(LabInk.ink, 3));
    canvas.drawRect(Rect.fromCenter(center: sw - Offset(0, sr + 8), width: 18, height: 14), fill(LabInk.ink));
    final hand = -math.pi / 2 + 2 * math.pi * (shown % 60) / 60;
    canvas.drawLine(sw, sw + Offset(math.cos(hand), math.sin(hand)) * sr * 0.8, stroke(running ? LabInk.red : LabInk.green, 2.5));
    label(canvas, '${shown.toStringAsFixed(1)} s', sw + Offset(0, sr * 0.45), size: 18, bold: true);
    label(canvas, tr('Swings: {n}', {'n': count}), sw + Offset(0, sr + 22), size: 15, bold: true, color: running ? LabInk.ink : LabInk.green);
    label(canvas, '${bobName(pStr(p, 'bob', 'steel'))} · $grams g', bob + Offset(0, br + 16), size: 12, color: LabInk.muted);
  }
}
