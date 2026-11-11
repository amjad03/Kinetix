import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../design.dart';
import 'bench.dart';
import 'kit.dart';

/// Measurement and stoichiometry: temperature scales, accuracy and precision, the laws of
/// chemical combination, the mole, limiting reagents, reaction masses from a balanced equation,
/// redox titre calculations and Liebig's combustion analysis.

const _am = {'H': 1.008, 'C': 12.01, 'N': 14.01, 'O': 16.00, 'Na': 22.99, 'Cl': 35.45, 'Ca': 40.08, 'S': 32.06};
const _elCol = {'H': Color(0xFF9AA3B5), 'C': Color(0xFF3C4250), 'N': Color(0xFF2F5BB7), 'O': Color(0xFFC63B2A), 'Na': Color(0xFF8A63C2), 'Cl': Color(0xFF3F9A55), 'Ca': Color(0xFFB59A6E), 'S': Color(0xFFD7A62C)};

class _Sub {
  const _Sub(this.f, this.name, this.comp, {this.gas = false});
  final String f, name;
  final Map<String, int> comp;
  final bool gas;
  double get m => comp.entries.fold(0.0, (a, e) => a + _am[e.key]! * e.value);
}

const _subs = [
  _Sub('H₂O', 'Water', {'H': 2, 'O': 1}),
  _Sub('CO₂', 'Carbon dioxide', {'C': 1, 'O': 2}, gas: true),
  _Sub('NH₃', 'Ammonia', {'N': 1, 'H': 3}, gas: true),
  _Sub('CH₄', 'Methane', {'C': 1, 'H': 4}, gas: true),
  _Sub('NaCl', 'Sodium chloride', {'Na': 1, 'Cl': 1}),
  _Sub('C₆H₁₂O₆', 'Glucose', {'C': 6, 'H': 12, 'O': 6}),
  _Sub('CaCO₃', 'Calcium carbonate', {'Ca': 1, 'C': 1, 'O': 3}),
];

class _Sp {
  const _Sp(this.f, this.coef, this.m, {this.product = false});
  final String f;
  final int coef;
  final double m;
  final bool product;
}

class _Rx {
  const _Rx(this.id, this.label, this.given);
  final String id, label;
  final String given; // name of the slider quantity
}

const _rxs = [
  _Rx('carbide', 'CaC₂ + water', 'Mass of CaC₂'),
  _Rx('propene', 'Hydration of propene', 'Mass of propene'),
  _Rx('alkene', 'Alkene + Br₂ / H₂', 'Mass of alkene'),
  _Rx('tollens', "Tollens' silver mirror", 'Mass of ethanal'),
  _Rx('hoffmann', 'Hoffmann bromamide', 'Mass of ethanamide'),
  _Rx('aniline', 'Bromination of aniline', 'Mass of aniline'),
  _Rx('water', 'Hydrogen + oxygen', 'Mass of H₂'),
];

/// The balanced equation and its species for reaction [i] (alkenes use n carbons).
(String, List<_Sp>) _rx(int i, int n) => switch (_rxs[i.clamp(0, _rxs.length - 1)].id) {
  'carbide' => ('CaC₂ + 2H₂O → C₂H₂ + Ca(OH)₂', const [_Sp('CaC₂', 1, 64.10), _Sp('H₂O', 2, 18.02), _Sp('C₂H₂', 1, 26.04, product: true), _Sp('Ca(OH)₂', 1, 74.09, product: true)]),
  'propene' => ('CH₃CH=CH₂ + H₂O → CH₃CH(OH)CH₃', const [_Sp('C₃H₆', 1, 42.08), _Sp('H₂O', 1, 18.02), _Sp('C₃H₇OH', 1, 60.10, product: true)]),
  'alkene' => ('C${sub(n)}H${sub(2 * n)} + Br₂ → C${sub(n)}H${sub(2 * n)}Br₂   (or + H₂ → C${sub(n)}H${sub(2 * n + 2)})', [_Sp('C${sub(n)}H${sub(2 * n)}', 1, 14.027 * n), const _Sp('Br₂', 1, 159.81), const _Sp('H₂', 1, 2.016), _Sp('C${sub(n)}H${sub(2 * n)}Br₂', 1, 14.027 * n + 159.81, product: true)]),
  'tollens' => ('CH₃CHO + 2[Ag(NH₃)₂]⁺ + 3OH⁻ → CH₃COO⁻ + 2Ag↓ + 4NH₃ + 2H₂O', const [_Sp('CH₃CHO', 1, 44.05), _Sp('Ag', 2, 107.87, product: true)]),
  'hoffmann' => ('CH₃CONH₂ + Br₂ + 4NaOH → CH₃NH₂ + Na₂CO₃ + 2NaBr + 2H₂O', const [_Sp('CH₃CONH₂', 1, 59.07), _Sp('Br₂', 1, 159.81), _Sp('NaOH', 4, 40.00), _Sp('CH₃NH₂', 1, 31.06, product: true)]),
  'aniline' => ('C₆H₅NH₂ + 3Br₂ → C₆H₂Br₃NH₂ + 3HBr', const [_Sp('C₆H₅NH₂', 1, 93.13), _Sp('Br₂', 3, 159.81), _Sp('C₆H₂Br₃NH₂', 1, 329.8, product: true), _Sp('HBr', 3, 80.91, product: true)]),
  _ => ('2H₂ + O₂ → 2H₂O', const [_Sp('H₂', 2, 2.016), _Sp('O₂', 1, 32.00), _Sp('H₂O', 2, 18.02, product: true)]),
};

void _thermo(Canvas c, Rect r, double frac, String title, String value, Color col, List<(double, String)> marks) {
  final bulb = Offset(r.center.dx, r.bottom - 34);
  final tube = Rect.fromLTRB(r.center.dx - 16, r.top, r.center.dx + 16, bulb.dy);
  c.drawRRect(RRect.fromRectAndRadius(tube.inflate(6), const Radius.circular(22)), fill(IX.paper));
  c.drawRRect(RRect.fromRectAndRadius(tube.inflate(6), const Radius.circular(22)), stroke(IX.glassEdge, 2.5));
  c.drawCircle(bulb, 34, fill(IX.paper));
  c.drawCircle(bulb, 34, stroke(IX.glassEdge, 2.5));
  final top = tube.bottom - (tube.height - 20) * frac.clamp(0, 1);
  final liq = Rect.fromLTRB(tube.left + 6, top, tube.right - 6, bulb.dy);
  c.drawRect(liq, Paint()..shader = ui.Gradient.linear(liq.centerLeft, liq.centerRight, [Color.lerp(col, Colors.white, 0.3)!, col, Color.lerp(col, Colors.black, 0.2)!], [0, 0.5, 1]));
  c.drawCircle(bulb, 26, Paint()..shader = ui.Gradient.radial(bulb - const Offset(8, 8), 30, [Color.lerp(col, Colors.white, 0.4)!, col]));
  for (final (f, t) in marks) {
    final y = tube.bottom - (tube.height - 20) * f;
    c.drawLine(Offset(tube.right + 8, y), Offset(tube.right + 26, y), stroke(IX.inkSoft, 2));
    lbl(c, t, Offset(tube.right + 34, y), size: 16, color: IX.inkSoft, align: Alignment.centerLeft);
  }
  c.drawLine(Offset(tube.left - 30, top), Offset(tube.left - 8, top), stroke(col, 3));
  lbl(c, value, Offset(tube.left - 38, top), size: 22, color: IX.ink, w: FontWeight.w700, align: Alignment.centerRight, halo: true);
  lbl(c, title, Offset(r.center.dx, r.top - 34), size: 22, color: IX.ink, w: FontWeight.w600);
}

/// A small 2-D molecule glyph.
void _glyph(Canvas c, Offset o, String kind, {double k = 1}) {
  switch (kind) {
    case 'N2':
      ball(c, o - Offset(8 * k, 0), 11 * k, elementColor['N']!);
      ball(c, o + Offset(8 * k, 0), 11 * k, elementColor['N']!);
    case 'H2':
      ball(c, o - Offset(6 * k, 0), 8 * k, const Color(0xFFDDE2EA), outline: true);
      ball(c, o + Offset(6 * k, 0), 8 * k, const Color(0xFFDDE2EA), outline: true);
    case 'O2':
      ball(c, o - Offset(8 * k, 0), 11 * k, elementColor['O']!);
      ball(c, o + Offset(8 * k, 0), 11 * k, elementColor['O']!);
    case 'H2O':
      ball(c, o + Offset(-11 * k, 8 * k), 7 * k, const Color(0xFFDDE2EA), outline: true);
      ball(c, o + Offset(11 * k, 8 * k), 7 * k, const Color(0xFFDDE2EA), outline: true);
      ball(c, o, 12 * k, elementColor['O']!);
    default: // NH3
      for (final a in [-2.2, -0.95, 0.3]) {
        ball(c, o + Offset(math.cos(a + 1.6) * 14 * k, math.sin(a + 1.6) * 14 * k), 7 * k, const Color(0xFFDDE2EA), outline: true);
      }
      ball(c, o, 12 * k, elementColor['N']!);
  }
}

void _vessel(Canvas c, Rect r, Map<String, int> counts, String title) {
  c.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(18)), fill(const Color(0xFFF5F8FC)));
  c.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(18)), stroke(IX.glassEdge, 2.5));
  lbl(c, title, r.topCenter + const Offset(0, -24), size: 19, color: IX.ink, w: FontWeight.w600);
  var i = 0;
  for (final e in counts.entries) {
    for (var k = 0; k < e.value; k++) {
      final p = Offset(r.left + 30 + rnd(i, 11) * (r.width - 60), r.top + 30 + rnd(i, 12) * (r.height - 60));
      _glyph(c, p, e.key, k: 1.15);
      i++;
    }
  }
}

final Map<String, Mode> stoichModes = {
  'temperature': Mode(
    title: 'Celsius, kelvin and Fahrenheit',
    subtitle: 'Basic concepts · Measurement of temperature',
    formula: 'K = °C + 273.15     °F = 9/5 °C + 32',
    defaults: {'c': 37},
    knobs: const [Slide('c', 'Temperature', -50, 150, unit: '°C', digits: 0, step: 1), Note('The kelvin scale starts at absolute zero (−273.15 °C), so it is never negative. −40 °C = −40 °F.')],
    readouts: (v) => [Readout('Celsius', v.g('c', 37).toStringAsFixed(0), '°C', IX.accent), Readout('Kelvin', (v.g('c', 37) + 273.15).toStringAsFixed(2), 'K', IX.green), Readout('Fahrenheit', (v.g('c', 37) * 9 / 5 + 32).toStringAsFixed(1), '°F', IX.amber)],
    paint: (c, s, v) {
      final t = v.g('c', 37);
      final f = (t + 50) / 200;
      final w = s.width / 3;
      final top = 100.0, bot = s.height - 70;
      List<(double, String)> marks(double Function(double) conv) => [for (final double x in const [-40.0, 0.0, 37.0, 100.0, 150.0]) ((x + 50) / 200, conv(x).toStringAsFixed(conv(x) == conv(x).roundToDouble() ? 0 : 2))];
      _thermo(c, Rect.fromLTRB(w * 0.5 - 60, top, w * 0.5 + 60, bot), f, 'Celsius', '${t.toStringAsFixed(0)} °C', IX.accent, marks((x) => x));
      _thermo(c, Rect.fromLTRB(w * 1.5 - 60, top, w * 1.5 + 60, bot), f, 'Kelvin', '${(t + 273.15).toStringAsFixed(2)} K', IX.green, marks((x) => x + 273.15));
      _thermo(c, Rect.fromLTRB(w * 2.5 - 60, top, w * 2.5 + 60, bot), f, 'Fahrenheit', '${(t * 9 / 5 + 32).toStringAsFixed(1)} °F', IX.amber, marks((x) => x * 9 / 5 + 32));
      for (final (x, name) in [(0.0, 'ice melts'), (100.0, 'water boils'), (37.0, 'body')]) {
        final y = bot - 34 - (bot - 34 - top - 20) * (x + 50) / 200;
        IxPaint.dashed(c, Offset(40, y), Offset(s.width - 40, y), stroke(IX.rule, 1.2));
        lbl(c, name, Offset(s.width - 40, y - 12), size: 14, color: IX.muted, align: Alignment.centerRight);
      }
    },
    presets: {'Body 37 °C': {'c': 37}, 'Boiling 100 °C': {'c': 100}, 'Freezing 0 °C': {'c': 0}, '−40°': {'c': -40}},
  ),
  'precision': Mode(
    title: 'Accuracy and precision',
    subtitle: 'Basic concepts · Uncertainty in measurement',
    formula: 'accuracy: near true value · precision: near each other',
    defaults: {'bias': 0.0, 'spread': 0.02, 'T': 2.00},
    knobs: const [Slide('bias', 'Systematic error', -0.2, 0.2, unit: 'g', digits: 2, step: 0.01), Slide('spread', 'Random error', 0, 0.15, unit: 'g', digits: 2, step: 0.01), Note('A systematic error shifts every reading the same way and spoils accuracy; a random error scatters them and spoils precision.')],
    readouts: (v) {
      final xs = _readings(v);
      final mean = xs.reduce((a, b) => a + b) / xs.length;
      final dev = xs.map((x) => (x - mean).abs()).reduce((a, b) => a + b) / xs.length;
      final err = (mean - v.g('T', 2)).abs();
      return [Readout('Mean', mean.toStringAsFixed(3), 'g', IX.accent), Readout('Mean deviation', dev.toStringAsFixed(3), 'g', IX.amber), Readout('Error of mean', err.toStringAsFixed(3), 'g', IX.positive), Readout('Verdict', '${err < 0.03 ? 'Accurate' : 'Inaccurate'}, ${dev < 0.03 ? 'precise' : 'imprecise'}', '', IX.green)];
    },
    paint: (c, s, v) {
      final xs = _readings(v), t = v.g('T', 2);
      final mean = xs.reduce((a, b) => a + b) / xs.length;
      // Target.
      final o = Offset(s.width * 0.25, s.height * 0.48);
      const rr = 260.0;
      for (var k = 5; k >= 1; k--) {
        c.drawCircle(o, rr * k / 5, fill(k.isOdd ? const Color(0xFFF1F4FA) : IX.paper));
        c.drawCircle(o, rr * k / 5, stroke(IX.rule, 2));
      }
      c.drawCircle(o, 10, fill(IX.positive));
      for (var i = 0; i < xs.length; i++) {
        final d = (xs[i] - t) / 0.25 * rr;
        final a = rnd(i, 21) * 2 * math.pi;
        final p = o + Offset(d, (rnd(i, 22) - 0.5) * v.g('spread', 0.02) / 0.25 * rr * 1.2) + Offset(0, math.sin(a) * 0);
        ball(c, p, 11, IX.accent);
      }
      lbl(c, 'true value at the centre', o + const Offset(0, rr + 30), size: 16, color: IX.muted);
      // Number line.
      final pr = Rect.fromLTWH(s.width * 0.56, s.height * 0.42, s.width * 0.4, 10);
      final pl = Plot(pr, t - 0.3, t + 0.3, 0, 1);
      c.drawLine(pl.p(t - 0.3, 0), pl.p(t + 0.3, 0), stroke(IX.ink, 3));
      for (var k = -3; k <= 3; k++) {
        final x = t + k * 0.1;
        c.drawLine(pl.p(x, 0) + const Offset(0, -8), pl.p(x, 0) + const Offset(0, 8), stroke(IX.ink, 2));
        lbl(c, x.toStringAsFixed(1), pl.p(x, 0) + const Offset(0, 30), size: 16);
      }
      lbl(c, 'Mass (g)', pl.p(t, 0) + const Offset(0, 62), size: 17);
      for (var i = 0; i < xs.length; i++) {
        ball(c, pl.p(xs[i].clamp(t - 0.3, t + 0.3), 0) + Offset(0, -26 - (i % 5) * 20.0), 9, IX.accent);
      }
      c.drawLine(pl.p(t, 0) + const Offset(0, -150), pl.p(t, 0) + const Offset(0, 10), stroke(IX.positive, 3));
      lbl(c, 'true ${t.toStringAsFixed(2)} g', pl.p(t, 0) + const Offset(-8, -150), size: 17, color: IX.positive, w: FontWeight.w600, align: Alignment.centerRight);
      IxPaint.dashed(c, pl.p(mean.clamp(t - 0.3, t + 0.3), 0) + const Offset(0, -140), pl.p(mean.clamp(t - 0.3, t + 0.3), 0) + const Offset(0, 10), stroke(IX.amber, 2.5));
      lbl(c, 'mean', pl.p(mean.clamp(t - 0.3, t + 0.3), 0) + const Offset(8, -130), size: 17, color: IX.amber, w: FontWeight.w600, align: Alignment.centerLeft);
      lbl(c, 'Ten weighings of a ${t.toStringAsFixed(2)} g sample', Offset(pr.center.dx, 80), size: 22, color: IX.ink, w: FontWeight.w600);
      var y = s.height * 0.68;
      for (var row = 0; row < 2; row++) {
        lbl(c, [for (var i = row * 5; i < row * 5 + 5; i++) xs[i].toStringAsFixed(2)].join('    '), Offset(pr.center.dx, y), size: 20, color: IX.inkSoft);
        y += 34;
      }
    },
    presets: {'Accurate and precise': {'bias': 0, 'spread': 0.01}, 'Precise, not accurate': {'bias': 0.15, 'spread': 0.01}, 'Accurate, not precise': {'bias': 0, 'spread': 0.12}, 'Neither': {'bias': -0.15, 'spread': 0.1}},
  ),
  'combination': Mode(
    title: 'Conservation of mass and fixed proportions',
    subtitle: 'Basic concepts · Laws of chemical combination',
    formula: 'H : O = 1 : 8 in water,  1 : 16 in H₂O₂',
    defaults: {'h': 2, 'o': 12},
    knobs: const [Slide('h', 'Hydrogen taken', 0, 4, unit: 'g', digits: 1, step: 0.1), Slide('o', 'Oxygen taken', 0, 32, unit: 'g', digits: 1, step: 0.5), Note('Whatever you mix, water forms in the ratio 1 : 8 and the left-over gas stays. Total mass never changes.')],
    readouts: (v) {
      final h = v.g('h', 2), o = v.g('o', 12);
      final usedH = math.min(h, o / 8);
      return [Readout('Water formed', (usedH * 9).toStringAsFixed(2), 'g', IX.accent), Readout('Left over', h - usedH > 1e-6 ? '${(h - usedH).toStringAsFixed(2)} g H₂' : '${(o - usedH * 8).toStringAsFixed(2)} g O₂', '', IX.amber), Readout('Mass before', (h + o).toStringAsFixed(2), 'g'), Readout('Mass after', (h + o).toStringAsFixed(2), 'g', IX.green)];
    },
    paint: (c, s, v) {
      final h = v.g('h', 2), o = v.g('o', 12);
      final usedH = math.min(h, o / 8);
      final w = (usedH * 9);
      // Balance with before and after pans.
      final cx = s.width * 0.3, by = 360.0;
      c.drawLine(Offset(cx, by), Offset(cx, by + 300), stroke(IX.steel, 10));
      c.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: Offset(cx, by + 310), width: 220, height: 24), const Radius.circular(8)), fill(const Color(0xFF4B5367)));
      c.drawLine(Offset(cx - 230, by), Offset(cx + 230, by), stroke(const Color(0xFF4B5367), 8));
      c.drawCircle(Offset(cx, by), 12, fill(const Color(0xFF4B5367)));
      for (final (side, title, parts) in [(-1.0, 'Before', [('H₂', h, const Color(0xFFB8C2D3)), ('O₂', o, elementColor['O']!)]), (1.0, 'After spark', [('H₂O', w, CX.water), ('H₂ left', h - usedH, const Color(0xFFB8C2D3)), ('O₂ left', o - usedH * 8, elementColor['O']!)])]) {
        final px = cx + side * 230;
        c.drawLine(Offset(px, by), Offset(px, by - 16), stroke(const Color(0xFF4B5367), 6));
        c.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: Offset(px, by - 20), width: 190, height: 10), const Radius.circular(5)), fill(const Color(0xFF4B5367)));
        lbl(c, title, Offset(px, by + 50), size: 19, color: IX.ink, w: FontWeight.w600);
        var yy = by + 82;
        for (final (name, m, col) in parts) {
          if (m < 0.005) continue;
          c.drawCircle(Offset(px - 60, yy), 8, fill(col));
          lbl(c, '$name  ${m.toStringAsFixed(2)} g', Offset(px - 44, yy), size: 17, align: Alignment.centerLeft);
          yy += 28;
        }
        // Jar above the pan.
        final jar = Rect.fromCenter(center: Offset(px, by - 115), width: 150, height: 180);
        c.drawRRect(RRect.fromRectAndRadius(jar, const Radius.circular(18)), fill(const Color(0xFFF5F8FC)));
        c.drawRRect(RRect.fromRectAndRadius(jar, const Radius.circular(18)), stroke(IX.glassEdge, 2.5));
        var k = 0;
        for (final (name, m, _) in parts) {
          final kind = name.startsWith('H₂O') ? 'H2O' : name.startsWith('H') ? 'H2' : 'O2';
          final n = (m / (kind == 'H2' ? 0.25 : kind == 'O2' ? 4 : 2.25)).round().clamp(0, 14);
          for (var i = 0; i < n; i++) {
            _glyph(c, Offset(jar.left + 22 + rnd(k, 31) * (jar.width - 44), jar.top + 22 + rnd(k, 32) * (jar.height - 44)), kind, k: 0.75);
            k++;
          }
        }
      }
      lbl(c, '${(h + o).toStringAsFixed(2)} g  =  ${(h + o).toStringAsFixed(2)} g', Offset(cx, by - 250), size: 24, color: IX.green, w: FontWeight.w700);
      // Law of multiple proportions.
      final pr = Rect.fromLTWH(s.width * 0.62, 90, s.width * 0.34, s.height - 210);
      final pl = Plot(pr, 0, 4, 0, 64);
      pl.axes(c, x: 'Mass of hydrogen (g)', y: 'Mass of oxygen combined (g)', dx: 1, dy: 16, title: 'Multiple proportions');
      pl.curve(c, (x) => 8 * x, IX.accent);
      pl.curve(c, (x) => 16 * x, CX.purple);
      pl.legend(c, [('water H₂O (1 : 8)', IX.accent), ('hydrogen peroxide H₂O₂ (1 : 16)', CX.purple)]);
      pl.dot(c, h, 8 * h, IX.accent);
      pl.dot(c, h, 16 * h, CX.purple, label: '2 : 1', align: Alignment.centerRight);
    },
    presets: {'Exact 1 : 8': {'h': 2, 'o': 16}, 'Excess oxygen': {'h': 1, 'o': 20}, 'Excess hydrogen': {'h': 3, 'o': 8}},
  ),
  'mole': Mode(
    title: 'Mass, moles and particles',
    subtitle: 'Basic concepts · The mole concept',
    formula: 'n = m / M,   N = n × 6.022 × 10²³',
    titleOf: (v) => 'Moles in ${v.g('m', 18).toStringAsFixed(1)} g of ${_subs[v.i('sub').clamp(0, _subs.length - 1)].name.toLowerCase()}',
    defaults: {'sub': 0, 'm': 18},
    knobs: [Pick('sub', 'Substance', [for (final x in _subs) x.f], ids: [for (final x in _subs) ascii(x.f)], chips: true), const Slide('m', 'Mass of sample', 1, 200, unit: 'g', digits: 1, step: 0.5)],
    readouts: (v) {
      final x = _subs[v.i('sub').clamp(0, _subs.length - 1)];
      final n = v.g('m', 18) / x.m;
      return [
        Readout('Molar mass', x.m.toStringAsFixed(2), 'g/mol'),
        Readout('Amount', n.toStringAsFixed(3), 'mol', IX.accent),
        Readout('Formula units', sx(n * 6.022e23), '', IX.amber),
        Readout(x.gas ? 'Volume at STP' : 'Atoms in sample', x.gas ? (n * 22.7).toStringAsFixed(2) : sx(n * 6.022e23 * x.comp.values.reduce((a, b) => a + b)), x.gas ? 'L' : '', IX.green),
      ];
    },
    paint: (c, s, v) {
      final x = _subs[v.i('sub').clamp(0, _subs.length - 1)];
      final n = v.g('m', 18) / x.m;
      // Chain: mass → moles → particles.
      final y = 200.0;
      final boxes = [('Mass', '${v.g('m', 18).toStringAsFixed(1)} g', IX.ink), ('Amount', '${n.toStringAsFixed(3)} mol', IX.accent), ('Particles', sx(n * 6.022e23), IX.amber)];
      final bw = (s.width - 200) / 3;
      for (var i = 0; i < 3; i++) {
        final r = Rect.fromLTWH(60 + i * (bw + 40), y - 80, bw, 160);
        c.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(18)), fill(IX.paper));
        c.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(18)), stroke(boxes[i].$3, 2.5));
        lbl(c, boxes[i].$1.toUpperCase(), r.topCenter + const Offset(0, 26), size: 15, color: IX.muted, w: FontWeight.w600);
        lbl(c, boxes[i].$2, r.center + const Offset(0, 14), size: 38, color: boxes[i].$3, w: FontWeight.w700);
        if (i < 2) {
          IxPaint.arrow(c, Offset(r.right + 4, y), Offset(r.right + 36, y), IX.muted, width: 3);
          lbl(c, i == 0 ? '÷ ${x.m.toStringAsFixed(2)} g/mol' : '× 6.022 × 10²³', Offset(r.right + 20, y + 100), size: 17, color: IX.inkSoft, w: FontWeight.w600);
        }
      }
      // Percentage composition.
      final pr = Rect.fromLTWH(160, 420, s.width - 260, s.height - 520);
      bars(c, pr, [for (final e in x.comp.entries) ('${e.key}  (${e.value} × ${_am[e.key]!.toStringAsFixed(2)})', 100 * e.value * _am[e.key]! / x.m, _elCol[e.key]!)], max: 100, dy: 25, yLabel: 'Mass per cent', title: 'Percentage composition of ${x.f}', fmt: (p) => '${p.toStringAsFixed(1)} %');
    },
    presets: {'18 g water': {'sub': 0, 'm': 18}, '44 g CO₂': {'sub': 1, 'm': 44}, '58.5 g NaCl': {'sub': 4, 'm': 58.5}, '180 g glucose': {'sub': 5, 'm': 180}, '100 g CaCO₃': {'sub': 6, 'm': 100}},
  ),
  'limiting': Mode(
    title: 'Limiting reagent',
    subtitle: 'Basic concepts · Reaction stoichiometry',
    formula: 'N₂ + 3H₂ → 2NH₃',
    defaults: {'n2': 2, 'h2': 3, 'x': 1},
    autoRun: false,
    tick: (v, dt) {
      v['x'] = math.min(1, v.g('x') + dt * 0.6);
      if (v.g('x') >= 1) v['_run'] = 0;
    },
    knobs: [
      const Slide('n2', 'Nitrogen, N₂', 0, 5, unit: 'mol', digits: 1, step: 0.5),
      const Slide('h2', 'Hydrogen, H₂', 0, 12, unit: 'mol', digits: 1, step: 0.5),
      Act('React', (v) {
        v['x'] = 0;
        v['_run'] = 1;
      }, icon: Icons.bolt_rounded),
      Act('Reset', (v) {
        v['x'] = 0;
        v['_run'] = 0;
      }, icon: Icons.replay_rounded),
    ],
    readouts: (v) {
      final n2 = v.g('n2', 2), h2 = v.g('h2', 3);
      final ext = math.min(n2, h2 / 3);
      return [
        Readout('Limiting reagent', n2 == 0 && h2 == 0 ? '—' : n2 < h2 / 3 ? 'N₂' : h2 / 3 < n2 ? 'H₂' : 'neither', '', IX.positive),
        Readout('NH₃ formed', (2 * ext).toStringAsFixed(2), 'mol', IX.accent),
        Readout('N₂ left', (n2 - ext).toStringAsFixed(2), 'mol'),
        Readout('H₂ left', (h2 - 3 * ext).toStringAsFixed(2), 'mol'),
      ];
    },
    paint: (c, s, v) {
      final n2 = v.g('n2', 2), h2 = v.g('h2', 3), x = v.g('x', 1);
      final ext = math.min(n2, h2 / 3) * x;
      const k = 4; // molecules drawn per mole
      final r = Rect.fromLTWH(60, 80, s.width * 0.42, s.height - 170);
      _vessel(c, r, {'N2': ((n2 - ext) * k).round(), 'H2': ((h2 - 3 * ext) * k).round(), 'NH3': (2 * ext * k).round()}, x >= 1 ? 'After reaction' : x <= 0 ? 'Before reaction' : 'Reacting…');
      var lx = r.left;
      for (final (kind, t) in [('N2', 'N₂'), ('H2', 'H₂'), ('NH3', 'NH₃')]) {
        _glyph(c, Offset(lx + 20, r.bottom + 34), kind, k: 0.8);
        lbl(c, t, Offset(lx + 44, r.bottom + 34), size: 17, align: Alignment.centerLeft);
        lx += 130;
      }
      lbl(c, 'four molecules drawn per mole', Offset(r.right, r.bottom + 34), size: 15, color: IX.muted, align: Alignment.centerRight);
      final full = math.min(n2, h2 / 3);
      final br = Rect.fromLTWH(s.width * 0.56, 100, s.width * 0.4, s.height - 220);
      bars(c, br, [('N₂\nstart', n2, elementColor['N']!), ('H₂\nstart', h2, IX.steel), ('N₂\nleft', n2 - full, elementColor['N']!), ('H₂\nleft', h2 - 3 * full, IX.steel), ('NH₃\nformed', 2 * full, IX.accent)], max: math.max(2, math.max(h2, math.max(n2, 2 * full))) * 1.2, yLabel: 'Amount (mol)', fmt: (q) => q.toStringAsFixed(1), title: 'Before and after');
    },
    presets: {'1 : 3 exactly': {'n2': 2, 'h2': 6}, 'H₂ limiting': {'n2': 2, 'h2': 3}, 'N₂ limiting': {'n2': 1, 'h2': 9}},
  ),
  'reaction': Mode(
    title: 'Masses from a balanced equation',
    subtitle: 'Basic concepts · Reaction stoichiometry',
    formula: 'moles react in the ratio of the coefficients',
    titleOf: (v) => _rxs[v.i('rx').clamp(0, _rxs.length - 1)].label,
    defaults: {'rx': 0, 'm': 6.4, 'n': 2},
    knobsOf: (v) => [
      Pick('rx', 'Reaction', [for (final r in _rxs) r.label], ids: [for (final r in _rxs) r.id], chips: true),
      Slide('m', _rxs[v.i('rx').clamp(0, _rxs.length - 1)].given, 0.5, 50, unit: 'g', digits: 1, step: 0.1),
      if (_rxs[v.i('rx').clamp(0, _rxs.length - 1)].id == 'alkene') const Slide('n', 'Carbons in the alkene, n', 2, 8, step: 1, digits: 0),
    ],
    readouts: (v) {
      final (_, sp) = _rx(v.i('rx'), v.i('n', 2));
      final mol = v.g('m', 6.4) / sp[0].m;
      return [
        Readout('Moles of ${sp[0].f}', mol.toStringAsFixed(4), 'mol', IX.accent),
        for (final x in sp.skip(1)) Readout(x.product ? '${x.f} formed' : '${x.f} needed', (mol * x.coef / sp[0].coef * x.m).toStringAsFixed(2), 'g', x.product ? IX.green : IX.amber),
      ];
    },
    paint: (c, s, v) {
      final (eq, sp) = _rx(v.i('rx'), v.i('n', 2));
      final mol = v.g('m', 6.4) / sp[0].m;
      final banner = Rect.fromLTWH(40, 34, s.width - 80, 96);
      c.drawRRect(RRect.fromRectAndRadius(banner, const Radius.circular(18)), fill(IX.accentSoft.withValues(alpha: 0.5)));
      final fs = math.min(34.0, 34 * (banner.width - 40) / textW(eq, 34, w: FontWeight.w600));
      lbl(c, eq, banner.center, size: fs, color: IX.ink, w: FontWeight.w600);
      final n = sp.length;
      final cw = (s.width - 80 - (n - 1) * 24) / n;
      double maxMass = 0;
      for (final x in sp) {
        maxMass = math.max(maxMass, mol * x.coef / sp[0].coef * x.m);
      }
      for (var i = 0; i < n; i++) {
        final x = sp[i];
        final r = Rect.fromLTWH(40 + i * (cw + 24), 170, cw, s.height - 210);
        final col = i == 0 ? IX.accent : x.product ? IX.green : IX.amber;
        c.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(18)), fill(IX.paper));
        c.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(18)), stroke(col.withValues(alpha: 0.6), 2));
        lbl(c, x.f, r.topCenter + const Offset(0, 40), size: math.min(32, 32 * (cw - 30) / textW(x.f, 32, w: FontWeight.w700)), color: IX.ink, w: FontWeight.w700);
        lbl(c, i == 0 ? 'given' : x.product ? 'product' : 'reactant', r.topCenter + const Offset(0, 78), size: 15, color: col, w: FontWeight.w600);
        final m = mol * x.coef / sp[0].coef * x.m;
        final rows = [('coefficient', '${x.coef}'), ('M (g/mol)', x.m.toStringAsFixed(2)), ('moles', (mol * x.coef / sp[0].coef).toStringAsFixed(4))];
        var y = r.top + 120;
        for (final (k, val) in rows) {
          lbl(c, k, Offset(r.left + 20, y), size: 16, color: IX.inkSoft, align: Alignment.centerLeft);
          lbl(c, val, Offset(r.right - 20, y), size: 19, color: IX.ink, w: FontWeight.w600, align: Alignment.centerRight);
          y += 36;
        }
        final bt = y + 20, bb = r.bottom - 70;
        final h = (bb - bt) * (m / maxMass);
        final bar = Rect.fromLTRB(r.center.dx - cw * 0.22, bb - h, r.center.dx + cw * 0.22, bb);
        c.drawRRect(RRect.fromRectAndCorners(bar, topLeft: const Radius.circular(8), topRight: const Radius.circular(8)), fill(col.withValues(alpha: 0.85)));
        c.drawLine(Offset(r.left + 16, bb), Offset(r.right - 16, bb), stroke(IX.rule, 2));
        lbl(c, '${m.toStringAsFixed(2)} g', Offset(r.center.dx, r.bottom - 38), size: 26, color: col, w: FontWeight.w700);
      }
    },
    presets: {'64 g CaC₂': {'rx': 0, 'm': 64}, '21 g propene': {'rx': 1, 'm': 21}, '4.4 g ethanal': {'rx': 3, 'm': 4.4}, '9.3 g aniline': {'rx': 5, 'm': 9.3}},
  ),
  'titre': Mode(
    title: 'Permanganate – oxalic acid titration',
    subtitle: 'Redox reactions · Redox titration',
    formula: '2MnO₄⁻ + 5C₂O₄²⁻ + 16H⁺ → 2Mn²⁺ + 10CO₂ + 8H₂O',
    defaults: {'Mox': 0.05, 'Vox': 20, 'V': 16},
    knobs: const [
      Slide('Mox', 'Oxalic acid molarity', 0.01, 0.1, unit: 'M', digits: 3, step: 0.001),
      Slide('Vox', 'Oxalic acid taken', 5, 25, unit: 'mL', digits: 1, step: 0.5),
      Slide('V', 'Burette reading of KMnO₄', 1, 40, unit: 'mL', digits: 1, step: 0.1),
      Note('KMnO₄ is its own indicator: the first permanent pale pink marks the end point.'),
    ],
    readouts: (v) {
      final nOx = v.g('Mox', 0.05) * v.g('Vox', 20) / 1000;
      final nMn = nOx * 2 / 5;
      final m = nMn / (v.g('V', 16) / 1000);
      return [Readout('Oxalate taken', (nOx * 1000).toStringAsFixed(3), 'mmol', IX.accent), Readout('MnO₄⁻ used', (nMn * 1000).toStringAsFixed(3), 'mmol', CX.purple), Readout('Molarity of KMnO₄', m.toStringAsFixed(4), 'M', IX.green), Readout('Strength', (m * 158.03).toStringAsFixed(2), 'g/L')];
    },
    paint: (c, s, v) {
      final vb = v.g('V', 16);
      final cx = s.width * 0.25;
      // Burette.
      final top = 40.0, bot = s.height * 0.55;
      final tube = Rect.fromLTRB(cx - 18, top, cx + 18, bot);
      final lvl = top + 30 + (bot - top - 60) * vb / 50;
      c.drawRect(Rect.fromLTRB(tube.left + 3, lvl, tube.right - 3, tube.bottom), fill(const Color(0xFF7A2F86)));
      c.drawRRect(RRect.fromRectAndRadius(tube, const Radius.circular(4)), stroke(IX.glassEdge, 2));
      for (var ml = 0; ml <= 50; ml += 5) {
        final y = top + 30 + (bot - top - 60) * ml / 50;
        c.drawLine(Offset(tube.right - 12, y), Offset(tube.right, y), stroke(IX.ink, 1.4));
        if (ml % 10 == 0) lbl(c, '$ml', Offset(tube.right + 10, y), size: 14, align: Alignment.centerLeft);
      }
      lbl(c, '${vb.toStringAsFixed(1)} mL', Offset(tube.left - 14, lvl), size: 18, color: IX.accent, w: FontWeight.w600, align: Alignment.centerRight, halo: true);
      lbl(c, 'KMnO₄', Offset(tube.left - 14, top + 20), size: 17, color: CX.purple, w: FontWeight.w600, align: Alignment.centerRight);
      c.drawLine(Offset(cx, bot), Offset(cx, bot + 50), stroke(IX.glassEdge, 6));
      // Flask, pale pink at the end point.
      final fb = s.height - 40.0, ft = bot + 70;
      final flask = Path()..moveTo(cx - 24, ft)..lineTo(cx - 24, ft + 50)..lineTo(cx - 120, fb)..lineTo(cx + 120, fb)..lineTo(cx + 24, ft + 50)..lineTo(cx + 24, ft)..close();
      c.save();
      c.clipPath(flask);
      c.drawRect(Rect.fromLTRB(cx - 130, fb - 110, cx + 130, fb), fill(const Color(0xFFF7DDEB)));
      c.restore();
      c.drawPath(flask, stroke(IX.glassEdge, 2.5));
      lbl(c, 'H₂C₂O₄ + dil. H₂SO₄, warm', Offset(cx, fb + 22), size: 15, color: IX.inkSoft);
      // Working.
      final nOx = v.g('Mox', 0.05) * v.g('Vox', 20) / 1000;
      final m = nOx * 2 / 5 / (vb / 1000);
      final wr = Rect.fromLTWH(s.width * 0.5, 60, s.width * 0.46, s.height - 120);
      panel(c, wr, 'Working');
      final lines = [
        'Moles of oxalate = M × V',
        '= ${v.g('Mox', 0.05).toStringAsFixed(3)} × ${v.g('Vox', 20).toStringAsFixed(1)} mL = ${(nOx * 1000).toStringAsFixed(3)} mmol',
        'MnO₄⁻ : C₂O₄²⁻ = 2 : 5',
        'Moles of MnO₄⁻ = ⅖ × ${(nOx * 1000).toStringAsFixed(3)} = ${(nOx * 400).toStringAsFixed(3)} mmol',
        'Molarity = ${(nOx * 400).toStringAsFixed(3)} mmol ÷ ${vb.toStringAsFixed(1)} mL',
        '= ${m.toStringAsFixed(4)} M',
      ];
      var y = wr.top + 70;
      for (final (i, t) in lines.indexed) {
        lbl(c, t, Offset(wr.left + 28, y), size: i == lines.length - 1 ? 30 : 21, color: i == lines.length - 1 ? IX.green : i.isOdd ? IX.ink : IX.inkSoft, w: i.isOdd || i == lines.length - 1 ? FontWeight.w600 : FontWeight.w500, align: Alignment.centerLeft);
        y += i.isOdd ? 66 : 40;
      }
      lbl(c, 'Using M₁V₁/n₁ = M₂V₂/n₂ with n(MnO₄⁻) = 2, n(C₂O₄²⁻) = 5', Offset(wr.left + 28, wr.bottom - 36), size: 16, color: IX.muted, align: Alignment.centerLeft);
    },
    presets: {'20 mL of 0.05 M': {'Mox': 0.05, 'Vox': 20, 'V': 16}, '10 mL of 0.1 M': {'Mox': 0.1, 'Vox': 10, 'V': 20}},
  ),
  'combustion': Mode(
    title: "Liebig's combustion analysis",
    subtitle: 'Organic chemistry · Quantitative analysis',
    formula: '%C = 12/44 × m(CO₂)/m × 100,  %H = 2/18 × m(H₂O)/m × 100',
    defaults: {'m': 0.230, 'co2': 0.440, 'h2o': 0.270},
    knobs: const [
      Slide('m', 'Mass of compound', 0.1, 1.0, unit: 'g', digits: 3, step: 0.001),
      Slide('co2', 'Mass of CO₂ collected', 0, 2, unit: 'g', digits: 3, step: 0.001),
      Slide('h2o', 'Mass of H₂O collected', 0, 1, unit: 'g', digits: 4, step: 0.0005),
    ],
    readouts: (v) {
      final (pc, ph, po) = _cho(v);
      return [Readout('Carbon', pc.toStringAsFixed(2), '%', IX.ink), Readout('Hydrogen', ph.toStringAsFixed(2), '%', IX.steel), Readout('Oxygen (by difference)', po.toStringAsFixed(2), '%', IX.positive), Readout('Empirical formula', po < -0.5 ? 'check masses' : _empirical(pc, ph, math.max(po, 0)), '', IX.accent)];
    },
    paint: (c, s, v) {
      final (pc, ph, po) = _cho(v);
      // Apparatus: O₂ in, combustion tube with CuO, CaCl₂ tube (water), KOH bulbs (CO₂).
      final y = 200.0;
      final tube = Rect.fromLTWH(80, y - 32, s.width * 0.42, 64);
      c.drawRRect(RRect.fromRectAndRadius(tube, const Radius.circular(32)), fill(const Color(0xFFF5F8FC)));
      c.drawRect(Rect.fromLTWH(tube.left + tube.width * 0.45, tube.top + 8, tube.width * 0.45, tube.height - 16), fill(const Color(0xFF2B2F38)));
      lbl(c, 'CuO', Offset(tube.left + tube.width * 0.675, y), size: 17, color: Colors.white, w: FontWeight.w600);
      c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(tube.left + tube.width * 0.12, tube.top + 18, 70, 28), const Radius.circular(6)), fill(const Color(0xFFE7D6A8)));
      lbl(c, 'sample', Offset(tube.left + tube.width * 0.12 + 35, y + 60), size: 16, color: IX.inkSoft);
      c.drawRRect(RRect.fromRectAndRadius(tube, const Radius.circular(32)), stroke(IX.glassEdge, 2.5));
      for (var i = 0; i < 9; i++) {
        final fx = tube.left + 40 + i * tube.width / 9;
        final p = Path()..moveTo(fx - 12, tube.bottom + 54)..quadraticBezierTo(fx - 16, tube.bottom + 24, fx, tube.bottom + 10)..quadraticBezierTo(fx + 16, tube.bottom + 24, fx + 12, tube.bottom + 54)..close();
        c.drawPath(p, fill(const Color(0xFF6C8FD6).withValues(alpha: 0.55)));
      }
      IxPaint.arrow(c, Offset(20, y), Offset(tube.left - 4, y), IX.muted, width: 3);
      lbl(c, 'O₂', const Offset(30, 170), size: 18, color: IX.inkSoft, w: FontWeight.w600);
      final u1 = Rect.fromLTWH(tube.right + 50, y - 60, 120, 160), u2 = Rect.fromLTWH(tube.right + 230, y - 60, 140, 160);
      c.drawLine(Offset(tube.right, y), Offset(u1.left, y), stroke(IX.glassEdge, 6));
      c.drawLine(Offset(u1.right, y), Offset(u2.left, y), stroke(IX.glassEdge, 6));
      for (final (r, name, sub2, m) in [(u1, 'anhyd. CaCl₂', 'absorbs H₂O', v.g('h2o', 0.270)), (u2, 'KOH', 'absorbs CO₂', v.g('co2', 0.440))]) {
        c.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(22)), fill(const Color(0xFFF1F4FA)));
        c.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(22)), stroke(IX.glassEdge, 2.5));
        lbl(c, name, r.center + const Offset(0, -14), size: 17, color: IX.ink, w: FontWeight.w600);
        lbl(c, sub2, r.center + const Offset(0, 12), size: 14, color: IX.inkSoft);
        lbl(c, '+${m.toStringAsFixed(4)} g', r.bottomCenter + const Offset(0, 22), size: 18, color: IX.accent, w: FontWeight.w700);
      }
      final br = Rect.fromLTWH(160, 420, s.width - 260, s.height - 520);
      bars(c, br, [('Carbon', pc, IX.ink), ('Hydrogen', ph, IX.steel), ('Oxygen', math.max(po, 0), IX.positive)], max: 100, dy: 25, yLabel: 'Mass per cent', fmt: (p) => '${p.toStringAsFixed(2)} %', title: 'Composition by mass');
    },
    presets: {'Ethanol': {'m': 0.230, 'co2': 0.440, 'h2o': 0.270}, 'Acetic acid': {'m': 0.300, 'co2': 0.440, 'h2o': 0.180}, 'Glucose': {'m': 0.180, 'co2': 0.264, 'h2o': 0.108}},
  ),
};

List<double> _readings(V v) {
  final t = v.g('T', 2), b = v.g('bias'), sp = v.g('spread', 0.02);
  return [for (var i = 0; i < 10; i++) t + b + sp * ((rnd(i, 41) + rnd(i, 42) + rnd(i, 43)) / 1.5 - 1) * 1.7];
}

(double, double, double) _cho(V v) {
  final m = v.g('m', 0.230);
  final pc = 12.01 / 44.01 * v.g('co2', 0.440) / m * 100, ph = 2.016 / 18.02 * v.g('h2o', 0.270) / m * 100;
  return (pc, ph, 100 - pc - ph);
}

String _empirical(double pc, double ph, double po) {
  final r = [pc / 12.01, ph / 1.008, po / 16.00];
  final lo = r.where((x) => x > 0.01).fold(double.infinity, math.min);
  if (lo == double.infinity) return '—';
  for (var k = 1; k <= 6; k++) {
    final q = [for (final x in r) x / lo * k];
    if (q.every((x) => (x - x.round()).abs() < 0.12)) {
      final n = q.map((x) => x.round()).toList();
      String part(String e, int c) => c == 0 ? '' : c == 1 ? e : '$e${sub(c)}';
      return '${part('C', n[0])}${part('H', n[1])}${part('O', n[2])}';
    }
  }
  return 'C : H : O = ${r.map((x) => (x / lo).toStringAsFixed(2)).join(' : ')}';
}
