import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../core/bench.dart';

/// A metal strip hangs in a salt solution; with time a more reactive metal
/// takes the place of a less reactive one.
class DisplacementBench extends LabBench {
  const DisplacementBench();

  static const metals = ['al', 'zn', 'fe', 'cu'];
  static const rank = {'al': 4, 'zn': 3, 'fe': 2, 'cu': 1};

  /// The metal in each solution, and the solution's colour.
  static const solutions = {
    'al': Color(0x14FFFFFF),
    'zn': Color(0x14FFFFFF),
    'fe': Color(0x559BD58A),
    'cu': Color(0xAA2F7FE0),
  };

  static const metalColour = {'al': Color(0xFFD5DADF), 'zn': Color(0xFFA7B0B8), 'fe': Color(0xFF6E6A66), 'cu': Color(0xFFC0703C)};

  /// What forms on the strip when a metal comes out of solution.
  static const coating = {'zn': Color(0xFF6F767D), 'fe': Color(0xFF34302C), 'cu': Color(0xFF8E3B1E)};

  @override
  String get kind => 'displacement';

  @override
  LabParams get defaults => {'metal': 'zn', 'solution': 'cu', 'minutes': 0.0};

  @override
  LabParams get preview => {...defaults, 'minutes': 20.0};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('metal', tr('Metal strip'), [for (final m in metals) (m, metalName(m))]),
        LabChoice('solution', tr('Solution'), [for (final s in metals) (s, solutionName(s))]),
        LabSlider('minutes', tr('Time'), 0, 20, divisions: 4, unit: ' min'),
      ];

  @override
  LabParams act(String action, LabParams p) {
    // A fresh strip in a fresh solution starts the clock again.
    if (action == 'set:metal' || action == 'set:solution') return {...p, 'minutes': 0.0};
    return p;
  }

  static String metalName(String m) => switch (m) { 'al' => tr('Aluminium'), 'zn' => tr('Zinc'), 'fe' => tr('Iron'), _ => tr('Copper') };

  static String solutionName(String m) => switch (m) {
        'al' => tr('Aluminium sulphate'),
        'zn' => tr('Zinc sulphate'),
        'fe' => tr('Iron(II) sulphate'),
        _ => tr('Copper sulphate'),
      };

  static bool reacts(String metal, String sol) => (rank[metal] ?? 0) > (rank[sol] ?? 0);

  static String equation(String metal, String sol) {
    const f = {'al': 'Al₂(SO₄)₃', 'zn': 'ZnSO₄', 'fe': 'FeSO₄', 'cu': 'CuSO₄'};
    const sym = {'al': 'Al', 'zn': 'Zn', 'fe': 'Fe', 'cu': 'Cu'};
    if (metal == 'al') return '2Al + 3${f[sol]} → Al₂(SO₄)₃ + 3${sym[sol]}';
    return '${sym[metal]} + ${f[sol]} → ${f[metal]} + ${sym[sol]}';
  }

  /// What the class sees after the reaction has had time.
  static String observation(String metal, String sol) {
    if (metal == sol) return tr('Same metal as in the solution: nothing to displace.');
    if (!reacts(metal, sol)) return tr('No change.');
    return switch ((metal, sol)) {
      ('fe', 'cu') => tr('The blue solution turns pale green; a reddish-brown coat of copper forms on the iron.'),
      (_, 'cu') => tr('The blue colour fades; a reddish-brown coat of copper forms on the strip.'),
      (_, 'fe') => tr('The pale green colour fades; a dark grey coat of iron forms on the strip.'),
      _ => tr('A grey coat of zinc forms on the aluminium.'),
    };
  }

  static double progress(LabParams p) {
    final m = pStr(p, 'metal', 'zn'), s = pStr(p, 'solution', 'cu');
    return m != s && reacts(m, s) ? (pNum(p, 'minutes', 0) / 20).clamp(0.0, 1.0) : 0;
  }

  @override
  List<LabColumn> get columns => [LabColumn(tr('Metal')), LabColumn(tr('Solution')), LabColumn(tr('What we saw')), LabColumn(tr('Reaction?'))];

  @override
  LabReading read(LabParams p) {
    if (pNum(p, 'minutes', 0) < 5) return LabReading.not(tr('Wait a few minutes before recording.'));
    final m = pStr(p, 'metal', 'zn'), s = pStr(p, 'solution', 'cu');
    return LabReading.row([metalName(m), solutionName(s), observation(m, s), m != s && reacts(m, s) ? tr('Yes') : tr('No')]);
  }

  @override
  List<String> live(LabParams p) {
    final m = pStr(p, 'metal', 'zn'), s = pStr(p, 'solution', 'cu');
    final min = pNum(p, 'minutes', 0).round();
    return [
      tr('{n} minutes', {'n': min}),
      if (min > 0) observation(m, s) else tr('Just dipped: nothing to see yet.'),
      if (min > 0 && m != s && reacts(m, s)) equation(m, s),
    ];
  }

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final displaced = <String, Set<String>>{};
    for (final r in rows) {
      final metal = '${r[0]}';
      displaced.putIfAbsent(metal, () => {});
      if (r[3] == tr('Yes')) displaced[metal]!.add('${r[1]}');
    }
    final order = displaced.entries.toList()..sort((a, b) => b.value.length.compareTo(a.value.length));
    return tr('Solutions each metal changed: {list}. Most reactive first: {order}.', {
      'list': order.map((e) => '${e.key} ${e.value.length}').join(', '),
      'order': order.map((e) => e.key).join(' > '),
    });
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final m = pStr(p, 'metal', 'zn'), s = pStr(p, 'solution', 'cu');
    final k = progress(p);
    final start = solutions[s]!;
    final end = solutions[m] ?? start;
    final liquid = Color.lerp(start, end, k)!;

    // Beaker.
    final beaker = Rect.fromLTWH(w * 0.25, h * 0.3, w * 0.34, h * 0.56);
    final level = beaker.top + beaker.height * 0.2;
    canvas.drawRect(Rect.fromLTRB(beaker.left, level, beaker.right, beaker.bottom), fill(liquid.a < 0.1 ? const Color(0x1CA9D3EE) : liquid));
    canvas.drawLine(beaker.topLeft, beaker.bottomLeft, stroke(LabInk.ink, 3));
    canvas.drawLine(beaker.bottomLeft, beaker.bottomRight, stroke(LabInk.ink, 3));
    canvas.drawLine(beaker.bottomRight, beaker.topRight, stroke(LabInk.ink, 3));
    for (var q = 1; q < 5; q++) {
      final y = beaker.bottom - beaker.height * q / 5;
      canvas.drawLine(Offset(beaker.right - 18, y), Offset(beaker.right, y), stroke(LabInk.muted, 1));
    }
    label(canvas, solutionName(s), Offset(beaker.center.dx, beaker.bottom + 18), size: 14, bold: true);

    // Clamp and strip; the part under the liquid gets coated as k grows.
    // The strip hangs from above the rim, clear of the beaker wall.
    final strip = Rect.fromLTRB(beaker.center.dx - 13, beaker.top - beaker.height * 0.16, beaker.center.dx + 13, beaker.bottom - beaker.height * 0.1);
    canvas.drawRect(Rect.fromLTRB(w * 0.08, h * 0.08, w * 0.08 + 8, h * 0.92), fill(LabInk.wire));
    canvas.drawRect(Rect.fromLTRB(w * 0.08, strip.top - 14, strip.center.dx + 16, strip.top - 4), fill(LabInk.wire));
    canvas.drawRect(strip, fill(metalColour[m]!));
    final under = Rect.fromLTRB(strip.left, level, strip.right, strip.bottom);
    if (k > 0) {
      final c = coating[s] ?? metalColour[m]!;
      canvas.drawRect(under, fill(c.withValues(alpha: 0.2 + 0.8 * k)));
      // Rough, grainy look of a fresh deposit.
      final rnd = math.Random(7);
      for (var n = 0; n < (60 * k).round(); n++) {
        canvas.drawCircle(Offset(under.left + rnd.nextDouble() * under.width, under.top + rnd.nextDouble() * under.height), 1.5 + rnd.nextDouble() * 2, fill(c));
      }
    }
    canvas.drawRect(strip, stroke(LabInk.ink, 1.5));
    label(canvas, metalName(m), Offset(strip.right + 12, strip.top + 18), size: 14, bold: true, centre: false, halo: LabInk.paper);

    // A clock face for the minutes gone by.
    final clock = Offset(w * 0.8, h * 0.28);
    final r = math.min(w, h) * 0.1;
    canvas.drawCircle(clock, r, fill(Colors.white));
    canvas.drawCircle(clock, r, stroke(LabInk.ink, 2.5));
    final min = pNum(p, 'minutes', 0);
    canvas.drawArc(Rect.fromCircle(center: clock, radius: r * 0.8), -math.pi / 2, 2 * math.pi * min / 60, true, fill(LabInk.accent.withValues(alpha: 0.4)));
    final a = -math.pi / 2 + 2 * math.pi * min / 60;
    canvas.drawLine(clock, clock + Offset(math.cos(a), math.sin(a)) * r * 0.8, stroke(LabInk.ink, 2.5));
    label(canvas, tr('{n} minutes', {'n': min.round()}), clock + Offset(0, r + 18), size: 15, bold: true);

    if (k > 0.2) {
      label(canvas, equation(m, s), Offset(w * 0.5, h * 0.12), size: 18, bold: true, color: LabInk.blue, halo: LabInk.paper);
    }
  }
}
