import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'bench.dart';
import 'kit.dart';

/// Biomolecules: optical rotation of sugars (mutarotation, inversion of cane sugar), the charge on
/// an amino acid against pH, enzyme saturation (Michaelis–Menten) and Chargaff's rule.

/// Specific rotation of the sugar mixture for system [sys] at fraction [x].
double _rot(int sys, double x) => sys == 0 ? 112 * (1 - x) + 18.7 * x : 66.5 * (1 - x) + x * (360 / 342) * (52.7 - 92.4) / 2;

void _polarimeter(Canvas c, Rect r, double angle, Color liquid) {
  final y = r.center.dy;
  c.drawLine(Offset(r.left + 40, y), Offset(r.right - 40, y), stroke(const Color(0xFFE8C531), 5));
  c.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: Offset(r.left + 40, y), width: 70, height: 60), const Radius.circular(10)), fill(const Color(0xFF2B3042)));
  final tube = Rect.fromLTRB(r.left + 130, y - 30, r.right - 150, y + 30);
  c.drawRRect(RRect.fromRectAndRadius(tube, const Radius.circular(30)), fill(liquid));
  c.drawRRect(RRect.fromRectAndRadius(tube, const Radius.circular(30)), stroke(IX.glassEdge, 2.5));
  final dc = Offset(r.right - 80, y);
  c.drawCircle(dc, 56, fill(IX.paper));
  c.drawCircle(dc, 56, stroke(IX.inkSoft, 3));
  final d = Offset(math.sin(angle * math.pi / 180), -math.cos(angle * math.pi / 180)) * 48;
  c.drawLine(dc - d, dc + d, stroke(IX.accent, 5));
  IxPaint.dashed(c, dc + const Offset(0, -50), dc + const Offset(0, 50), Paint()..color = IX.muted..strokeWidth = 1.5);
  lbl(c, '${angle >= 0 ? '+' : '−'}${angle.abs().toStringAsFixed(1)}°', dc + const Offset(0, 80), size: 20, color: IX.accent, w: FontWeight.w700);
  lbl(c, 'polarimeter tube', Offset(tube.center.dx, tube.bottom + 22), size: 15, color: IX.muted);
}

final Map<String, Mode> bioModes = {
  'rotation': Mode(
    title: 'Optical rotation of sugars',
    subtitle: 'Biomolecules · Carbohydrates',
    formula: 'mutarotation: [α] = 112(1 − b) + 18.7 b     inversion: sucrose (+66.5°) → glucose + fructose',
    titleOf: (v) => v.i('sys') == 0 ? 'Mutarotation of D-glucose' : 'Inversion of cane sugar',
    defaults: {'sys': 0, 'x': 0.64},
    knobsOf: (v) => [
      const Pick('sys', 'Process', ['Mutarotation', 'Inversion of sucrose'], ids: ['mutarotation', 'inversion']),
      Slide('x', v.i('sys') == 0 ? 'Fraction in the β form, b' : 'Fraction of sucrose hydrolysed, f', 0, 1, digits: 2, step: 0.01),
      Note(v.i('sys') == 0 ? 'α (+112°) and β (+18.7°) interconvert through the open chain until 36 % α : 64 % β, [α] = +52.7°.' : 'Fructose (−92.4°) outweighs glucose (+52.7°), so the sign flips from + to −: "invert sugar".'),
    ],
    readouts: (v) {
      final sys = v.i('sys'), x = v.g('x', 0.64);
      final a = _rot(sys, x);
      final cross = sys == 1 ? 66.5 / (66.5 + 20.9) : double.nan;
      return [Readout('Specific rotation', '${a >= 0 ? '+' : '−'}${a.abs().toStringAsFixed(1)}', '°', IX.accent), Readout(sys == 0 ? 'Equilibrium' : 'Sign changes at', sys == 0 ? '+52.7° (b = 0.64)' : 'f = ${cross.toStringAsFixed(2)}', '', IX.green), Readout(sys == 0 ? 'α : β' : 'Sucrose left', sys == 0 ? '${(100 * (1 - x)).round()} : ${(100 * x).round()}' : '${(100 * (1 - x)).round()} %')];
    },
    paint: (c, s, v) {
      final sys = v.i('sys'), x = v.g('x', 0.64);
      _polarimeter(c, Rect.fromLTWH(60, 50, s.width - 120, 180), _rot(sys, x), const Color(0xFFEFF5FB));
      final pr = Rect.fromLTWH(130, 330, s.width - 240, s.height - 440);
      final pl = Plot(pr, 0, 1, sys == 0 ? 0 : -40, sys == 0 ? 130 : 80);
      pl.axes(c, x: sys == 0 ? 'Fraction β, b' : 'Fraction hydrolysed, f', y: '[α] (degrees)', dx: 0.2, dy: 20);
      pl.curve(c, (t) => _rot(sys, t), IX.accent, w: 5);
      if (sys == 0) pl.dot(c, 0.64, 52.7, IX.green, label: 'equilibrium +52.7°', align: Alignment.bottomLeft);
      pl.dot(c, x, _rot(sys, x), IX.positive, label: '${_rot(sys, x).toStringAsFixed(1)}°');
    },
    presets: {'Pure α-glucose': {'sys': 0, 'x': 0}, 'Equilibrium mixture': {'sys': 0, 'x': 0.64}, 'Sucrose, 30 % hydrolysed': {'sys': 1, 'x': 0.3}, 'Invert sugar': {'sys': 1, 'x': 1}},
  ),
  'aminoacid': Mode(
    title: 'Amino acids: charge and pH',
    subtitle: 'Biomolecules · Proteins',
    formula: 'charge = 1/(1 + 10^(pH − pKa₁)) − 1/(1 + 10^(pKa₂ − pH))     pI = (pKa₁ + pKa₂)/2',
    defaults: {'a': 2.34, 'b': 9.6, 'pH': 6},
    knobs: [
      const Slide('pH', 'pH', 0, 14, digits: 1, step: 0.1),
      const Slide('a', 'pKa₁ (–COOH)', 1.5, 3.5, digits: 2, step: 0.01),
      const Slide('b', 'pKa₂ (–NH₃⁺)', 8.5, 11, digits: 2, step: 0.01),
    ],
    readouts: (v) {
      final q = _q(v, v.g('pH', 6));
      return [Readout('Net charge', q.abs() < 0.005 ? '0.00' : nf(q, 2), '', IX.accent), Readout('pI', ((v.g('a', 2.34) + v.g('b', 9.6)) / 2).toStringAsFixed(2), '', IX.green), Readout('Main form', q > 0.5 ? 'cation' : q < -0.5 ? 'anion' : 'zwitterion', '', IX.positive), Readout('In a field it moves', q > 0.05 ? 'to the cathode (−)' : q < -0.05 ? 'to the anode (+)' : 'nowhere')];
    },
    paint: (c, s, v) {
      final ph = v.g('pH', 6), q = _q(v, ph);
      final form = q > 0.5 ? 'H₃N⁺–CH₂–COOH' : q < -0.5 ? 'H₂N–CH₂–COO⁻' : 'H₃N⁺–CH₂–COO⁻';
      lbl(c, form, Offset(s.width / 2, 70), size: 40, color: IX.ink, w: FontWeight.w700);
      final strip = Rect.fromLTWH(140, 140, s.width - 280, 70);
      c.drawRRect(RRect.fromRectAndRadius(strip, const Radius.circular(10)), fill(const Color(0xFFEFF2F7)));
      tag(c, '− cathode', strip.centerLeft + const Offset(-10, 0), IX.accent, solid: true, align: Alignment.centerRight);
      tag(c, 'anode +', strip.centerRight + const Offset(10, 0), IX.positive, solid: true, align: Alignment.centerLeft);
      final bx = strip.center.dx - q * strip.width * 0.42;
      c.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: Offset(bx, strip.center.dy), width: 26, height: 56), const Radius.circular(6)), fill(CX.purple));
      IxPaint.dashed(c, Offset(strip.center.dx, strip.top - 8), Offset(strip.center.dx, strip.bottom + 8), Paint()..color = IX.muted..strokeWidth = 1.5);
      final pr = Rect.fromLTWH(130, 300, s.width - 240, s.height - 410);
      final pl = Plot(pr, 0, 14, -1.1, 1.1);
      pl.axes(c, x: 'pH', y: 'Net charge', dx: 1, dy: 0.5);
      pl.curve(c, (x) => _q(v, x), IX.accent, w: 5);
      final pi = (v.g('a', 2.34) + v.g('b', 9.6)) / 2;
      pl.vline(c, pi, IX.green, label: 'pI ${pi.toStringAsFixed(2)}');
      pl.dot(c, ph, q, IX.positive, label: q.abs() < 0.005 ? '0.00' : nf(q, 2));
    },
    presets: {'Glycine, acid (pH 1)': {'pH': 1}, 'Glycine at pI': {'pH': 5.97}, 'Glycine, alkali (pH 12)': {'pH': 12}},
  ),
  'enzyme': Mode(
    title: 'Enzymes get saturated',
    subtitle: 'Biomolecules · Enzymes',
    formula: 'rate = Vmax [S] / (Km + [S])',
    defaults: {'v': 8, 'k': 5, 's': 5},
    knobs: [
      const Slide('s', 'Substrate [S]', 0, 50, unit: 'mmol/L', digits: 1, step: 0.5),
      const Slide('v', 'Vmax', 2, 10, unit: 'µmol/min', digits: 1, step: 0.1),
      const Slide('k', 'Km', 1, 20, unit: 'mmol/L', digits: 1, step: 0.5),
    ],
    readouts: (v) {
      final sv = v.g('s', 5), f = sv / (v.g('k', 5) + sv);
      return [Readout('Rate', (v.g('v', 8) * f).toStringAsFixed(2), 'µmol/min', IX.accent), Readout('Sites busy', (100 * f).toStringAsFixed(0), '%', IX.positive), Readout('At [S] = Km', 'rate = Vmax/2', '', IX.green)];
    },
    paint: (c, s, v) {
      final sv = v.g('s', 5), km = v.g('k', 5), vm = v.g('v', 8), f = sv / (km + sv);
      for (var i = 0; i < 10; i++) {
        final at = Offset(120 + i * (s.width - 240) / 9, 110);
        c.drawArc(Rect.fromCircle(center: at, radius: 40), 0.5, 2 * math.pi - 1.0, true, fill(IX.green));
        if (rnd(i, 77) < f) ball(c, at + const Offset(28, 0), 16, IX.amber);
      }
      lbl(c, 'enzyme molecules (green) with substrate bound (amber)', Offset(s.width / 2, 185), size: 17, color: IX.muted);
      final pr = Rect.fromLTWH(130, 260, s.width - 240, s.height - 370);
      final pl = Plot(pr, 0, 50, 0, 11);
      pl.axes(c, x: '[S] (mmol/L)', y: 'Rate (µmol/min)', dx: 10, dy: 2);
      pl.hline(c, vm, IX.muted, label: 'Vmax');
      pl.curve(c, (x) => vm * x / (km + x), IX.accent, w: 5);
      pl.dot(c, km, vm / 2, IX.green, label: 'Km: half of Vmax', align: Alignment.bottomLeft);
      pl.dot(c, sv, vm * f, IX.positive, label: (vm * f).toStringAsFixed(2));
    },
    presets: {'Low [S]': {'s': 1}, '[S] = Km': {'s': 5}, 'Saturated': {'s': 50}},
  ),
  'chargaff': Mode(
    title: "Chargaff's rule",
    subtitle: 'Biomolecules · Nucleic acids',
    formula: '%A = %T,  %G = %C,  %G = 50 − %A',
    defaults: {'a': 30},
    knobs: [const Slide('a', 'Adenine', 10, 40, unit: '%', digits: 0, step: 1), const Note('A pairs with T by two hydrogen bonds; G pairs with C by three.')],
    readouts: (v) {
      final a = v.g('a', 30);
      return [Readout('%T', a.toStringAsFixed(0), '%', IX.positive), Readout('%G', (50 - a).toStringAsFixed(0), '%', IX.green), Readout('%C', (50 - a).toStringAsFixed(0), '%', CX.purple), Readout('(A + G) / (T + C)', '1.00', '', IX.accent)];
    },
    paint: (c, s, v) {
      final a = v.g('a', 30);
      const n = 20;
      for (var i = 0; i < n; i++) {
        final y = 70 + i * (s.height - 140) / (n - 1);
        final ph = i * 0.6;
        final xl = s.width * 0.28 + math.sin(ph) * 130, xr = s.width * 0.28 - math.sin(ph) * 130;
        final at = rnd(i, 55) * 100 < 2 * a;
        final top = rnd(i, 56) < 0.5;
        final p = at ? (top ? ('A', 'T') : ('T', 'A')) : (top ? ('G', 'C') : ('C', 'G'));
        c.drawLine(Offset(xl, y), Offset(xr, y), stroke(at ? IX.positive : IX.green, 5));
        for (final (x, t) in [(xl, p.$1), (xr, p.$2)]) {
          ball(c, Offset(x, y), 16, const Color(0xFF5468A8));
          lbl(c, t, Offset(x, y), size: 15, color: Colors.white, w: FontWeight.w700);
        }
      }
      final br = Rect.fromLTWH(s.width * 0.55, 90, s.width * 0.4, s.height - 220);
      bars(c, br, [('A', a, IX.positive), ('T', a, IX.positive), ('G', 50 - a, IX.green), ('C', 50 - a, IX.green)], max: 50, yLabel: 'Base content (%)', dy: 10, fmt: (x) => '${x.toStringAsFixed(0)} %');
    },
    presets: {'Human (A 30 %)': {'a': 30}, 'G·C rich (A 20 %)': {'a': 20}, 'Equal (A 25 %)': {'a': 25}},
  ),
};

double _q(V v, double ph) => 1 / (1 + math.pow(10, ph - v.g('a', 2.34))) - 1 / (1 + math.pow(10, v.g('b', 9.6) - ph));
