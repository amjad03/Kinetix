import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../design.dart';
import 'bench.dart';
import 'kit.dart';

/// Thermodynamics: the first law in a piston, reversible and irreversible expansion work,
/// Hess's law, the Born–Haber cycle, reaction enthalpy from bond enthalpies, and ΔG = ΔH − TΔS.

void _cylinder(Canvas c, Rect r, double fill01, {double heat = 0, double work = 0}) {
  // Gas cylinder with a piston at height fill01 (0–1 of the bore).
  final wall = Paint()..color = const Color(0xFF5B6478);
  final bore = r.deflate(14);
  final py = bore.bottom - bore.height * fill01.clamp(0.15, 0.95);
  final gas = Rect.fromLTRB(bore.left, py, bore.right, bore.bottom);
  final warm = (heat / 500).clamp(-1.0, 1.0);
  final gc = warm >= 0 ? Color.lerp(const Color(0xFFE6EEF9), const Color(0xFFF7D9C4), warm)! : Color.lerp(const Color(0xFFE6EEF9), const Color(0xFFCFE0F7), -warm)!;
  c.drawRect(gas, fill(gc));
  for (var i = 0; i < 26; i++) {
    final p = Offset(gas.left + 14 + rnd(i, 51) * (gas.width - 28), gas.top + 14 + rnd(i, 52) * math.max(gas.height - 28, 1));
    ball(c, p, 7, IX.accent.withValues(alpha: 0.8));
  }
  c.drawRect(Rect.fromLTRB(r.left, r.top, bore.left, r.bottom), wall);
  c.drawRect(Rect.fromLTRB(bore.right, r.top, r.right, r.bottom), wall);
  c.drawRect(Rect.fromLTRB(r.left, bore.bottom, r.right, r.bottom), wall);
  final piston = Rect.fromLTRB(bore.left, py - 30, bore.right, py);
  c.drawRect(piston, Paint()..shader = ui.Gradient.linear(piston.topCenter, piston.bottomCenter, [const Color(0xFFB8C0CE), const Color(0xFF7D8596)]));
  c.drawRect(Rect.fromCenter(center: Offset(r.center.dx, py - 90), width: 22, height: 120), fill(const Color(0xFF9AA3B5)));
  if (work.abs() > 1) {
    final down = work > 0;
    IxPaint.arrow(c, Offset(r.center.dx + 70, down ? py - 150 : py - 40), Offset(r.center.dx + 70, down ? py - 40 : py - 150), IX.green, width: 5, head: 20);
    lbl(c, down ? 'work done on gas' : 'gas does work', Offset(r.center.dx + 92, py - 96), size: 17, color: IX.green, w: FontWeight.w600, align: Alignment.centerLeft);
  }
  if (heat.abs() > 1) {
    final inn = heat > 0;
    for (var k = 0; k < 3; k++) {
      final x = r.left + r.width * (0.25 + k * 0.25);
      IxPaint.arrow(c, Offset(x, inn ? r.bottom + 70 : r.bottom + 10), Offset(x, inn ? r.bottom + 10 : r.bottom + 70), IX.positive, width: 5, head: 18);
    }
    lbl(c, inn ? 'heat in' : 'heat out', Offset(r.right + 16, r.bottom + 40), size: 17, color: IX.positive, w: FontWeight.w600, align: Alignment.centerLeft);
  }
}

/// An enthalpy ladder arrow between two levels with its ΔH written beside it.
void _step(Canvas c, double x, double y0, double y1, String text, Color col, {bool left = false}) {
  IxPaint.arrow(c, Offset(x, y0), Offset(x, y1), col, width: 4, head: 18);
  lbl(c, text, Offset(x + (left ? -14 : 14), (y0 + y1) / 2), size: 18, color: col, w: FontWeight.w600, align: left ? Alignment.centerRight : Alignment.centerLeft, halo: true);
}

const _bh = [
  ('Na(s) + ½Cl₂(g)', 'start: the elements', 0.0),
  ('Na(g) + ½Cl₂(g)', 'Sublimation of Na', 108.4),
  ('Na⁺(g) + e⁻ + ½Cl₂(g)', 'Ionisation of Na', 496.0),
  ('Na⁺(g) + e⁻ + Cl(g)', '½ × Cl–Cl bond enthalpy', 121.0),
  ('Na⁺(g) + Cl⁻(g)', 'Electron gain by Cl', -348.6),
  ('NaCl(s)', 'Ions form the lattice', -788.0),
];

final Map<String, Mode> thermoModes = {
  'firstlaw': Mode(
    title: 'The first law: ΔU = q + w',
    subtitle: 'Thermodynamics · First law',
    formula: 'ΔU = q + w',
    defaults: {'q': 300, 'w': -100},
    knobs: const [
      Slide('q', 'Heat q (+ into the system)', -500, 500, unit: 'J', digits: 0, step: 10),
      Slide('w', 'Work w (+ done on the system)', -500, 500, unit: 'J', digits: 0, step: 10),
      Note('IUPAC sign convention: energy entering the system is positive, energy leaving is negative.'),
    ],
    readouts: (v) {
      final q = v.g('q', 300), w = v.g('w', -100), du = q + w;
      return [Readout('Heat q', sgn(q, 0), 'J', IX.positive), Readout('Work w', sgn(w, 0), 'J', IX.green), Readout('ΔU', sgn(du, 0), 'J', IX.accent), Readout('Internal energy', du > 0 ? 'rises' : du < 0 ? 'falls' : 'unchanged')];
    },
    paint: (c, s, v) {
      final q = v.g('q', 300), w = v.g('w', -100);
      _cylinder(c, Rect.fromLTWH(s.width * 0.12, 90, 300, s.height * 0.52), 0.55 - w / 1400, heat: q, work: w);
      // Number line of energies.
      final pr = Rect.fromLTWH(s.width * 0.55, s.height * 0.2, s.width * 0.38, 10);
      final pl = Plot(pr, -1000, 1000, 0, 1);
      c.drawLine(pl.p(-1000, 0), pl.p(1000, 0), stroke(IX.ink, 3));
      for (var x = -1000; x <= 1000; x += 250) {
        c.drawLine(pl.p(x.toDouble(), 0) + const Offset(0, -8), pl.p(x.toDouble(), 0) + const Offset(0, 8), stroke(IX.ink, 2));
        lbl(c, x == 0 ? '0' : nf(x.toDouble(), 0), pl.p(x.toDouble(), 0) + const Offset(0, 28), size: 15);
      }
      lbl(c, 'Energy (J)', pl.p(0, 0) + const Offset(0, 58), size: 16);
      for (final (val, name, col, dy) in [(q, 'q', IX.positive, -40.0), (w, 'w', IX.green, -90.0), (q + w, 'ΔU', IX.accent, -140.0)]) {
        IxPaint.arrow(c, pl.p(0, 0) + Offset(0, dy), pl.p(val, 0) + Offset(0, dy), col, width: 5, head: 16);
        lbl(c, '$name = ${sgn(val, 0)} J', pl.p(val, 0) + Offset(val >= 0 ? 12 : -12, dy), size: 18, color: col, w: FontWeight.w700, align: val >= 0 ? Alignment.centerLeft : Alignment.centerRight, halo: true);
      }
      final card = Rect.fromLTWH(s.width * 0.55, s.height * 0.5, s.width * 0.38, 220);
      panel(c, card, 'Bookkeeping');
      lbl(c, 'ΔU = q + w', Offset(card.center.dx, card.top + 80), size: 30, color: IX.ink, w: FontWeight.w600);
      lbl(c, '= (${sgn(q, 0)}) + (${sgn(w, 0)}) = ${sgn(q + w, 0)} J', Offset(card.center.dx, card.top + 140), size: 28, color: IX.accent, w: FontWeight.w700);
    },
    presets: {'Heat in, gas expands': {'q': 300, 'w': -100}, 'Adiabatic compression': {'q': 0, 'w': 250}, 'Isothermal: q = −w': {'q': 200, 'w': -200}, 'Cooling at fixed V': {'q': -300, 'w': 0}},
  ),
  'expansion': Mode(
    title: 'Work of expansion: reversible or not',
    subtitle: 'Thermodynamics · Work',
    formula: 'w_rev = −nRT ln(V₂/V₁)    w_irr = −p_ext(V₂ − V₁)',
    defaults: {'T': 300, 'V1': 2, 'V2': 10},
    knobs: const [
      Slide('T', 'Temperature T', 200, 600, unit: 'K', digits: 0, step: 10),
      Slide('V1', 'Initial volume V₁', 1, 10, unit: 'L', digits: 1, step: 0.5),
      Slide('V2', 'Final volume V₂', 1, 25, unit: 'L', digits: 1, step: 0.5),
      Note('One mole of ideal gas. The one-step expansion works against a constant p_ext equal to the final pressure, so it does less work.'),
    ],
    readouts: (v) {
      final t = v.g('T', 300), v1 = v.g('V1', 2), v2 = v.g('V2', 10);
      final wr = -8.314 * t * math.log(v2 / v1), p2 = 0.08314 * t / v2;
      final wi = -p2 * (v2 - v1) * 100;
      return [Readout('w reversible', nf(wr, 0), 'J', IX.accent), Readout('w one step', nf(wi, 0), 'J', IX.amber), Readout('Final pressure', p2.toStringAsFixed(2), 'bar'), Readout('|w_rev| − |w_irr|', (wr.abs() - wi.abs()).toStringAsFixed(0), 'J', IX.green)];
    },
    paint: (c, s, v) {
      final t = v.g('T', 300), v1 = v.g('V1', 2), v2 = v.g('V2', 10);
      double p(double x) => 0.08314 * t / x;
      final pr = Rect.fromLTWH(140, 70, s.width - 220, s.height - 180);
      final pl = Plot(pr, 0, 26, 0, math.max(p(math.min(v1, v2)) * 1.25, 2));
      pl.axes(c, x: 'Volume V (L)', y: 'Pressure p (bar)', dx: 2, title: 'Isotherm p = RT/V at ${t.toStringAsFixed(0)} K');
      final a = math.min(v1, v2), b = math.max(v1, v2);
      pl.area(c, p, a, b, IX.accent);
      final pext = p(v2);
      final rect = Rect.fromPoints(pl.p(a, 0), pl.p(b, pext));
      c.drawRect(rect, fill(IX.amber.withValues(alpha: 0.22)));
      c.drawRect(rect, stroke(IX.amber, 2.5));
      pl.curve(c, p, IX.accent, from: 0.6);
      pl.dot(c, v1, p(v1), IX.ink, label: 'start', align: Alignment.centerLeft);
      pl.dot(c, v2, p(v2), IX.ink, label: 'end', align: Alignment.centerLeft);
      pl.legend(c, [('reversible work: area under the curve', IX.accent), ('one step against p_ext = p₂', IX.amber)], right: true, at: pr.topRight + const Offset(-20, 22));
    },
    presets: {'2 → 10 L at 300 K': {'T': 300, 'V1': 2, 'V2': 10}, 'Small step': {'T': 300, 'V1': 5, 'V2': 6}, 'Hot gas': {'T': 600, 'V1': 2, 'V2': 20}},
  ),
  'hess': Mode(
    title: "Hess's law: closing the cycle",
    subtitle: 'Thermodynamics · Hess’s law',
    formula: 'ΔH = ΔH₁ + ΔH₂',
    defaults: {'find': 0},
    knobs: const [Pick('find', 'Treat as unknown', ['None', 'Step 1', 'Step 2', 'Total'], ids: ['none', 'step1', 'step2', 'total']), Note('C(graphite) + O₂ → CO₂ directly, or through CO. Enthalpy is a state function, so both routes give the same ΔH.')],
    readouts: (v) => [Readout('Step 1: C → CO', '−110.5', 'kJ/mol', IX.accent), Readout('Step 2: CO → CO₂', '−283.0', 'kJ/mol', CX.purple), Readout('Total: C → CO₂', '−393.5', 'kJ/mol', IX.positive), Readout('Check', '−110.5 − 283.0 = −393.5')],
    paint: (c, s, v) {
      final f = v.i('find');
      final top = 110.0, bot = s.height - 110;
      double y(double h) => top + (-h / 393.5) * (bot - top);
      final x0 = 160.0, x1 = s.width * 0.62;
      level(c, x0, x1, y(0), IX.ink, w: 5);
      level(c, x0 + 160, x1 - 120, y(-110.5), IX.ink, w: 5);
      level(c, x0, x1, y(-393.5), IX.ink, w: 5);
      lbl(c, 'C(graphite) + O₂(g)', Offset(x1 + 14, y(0)), size: 21, color: IX.ink, w: FontWeight.w600, align: Alignment.centerLeft);
      lbl(c, 'CO(g) + ½O₂(g)', Offset(x1 - 106, y(-110.5)), size: 21, color: IX.ink, w: FontWeight.w600, align: Alignment.centerLeft);
      lbl(c, 'CO₂(g)', Offset(x1 + 14, y(-393.5)), size: 21, color: IX.ink, w: FontWeight.w600, align: Alignment.centerLeft);
      String t(int k, String val) => f == k ? '? = $val (by Hess)' : val;
      _step(c, x0 + 60, y(0), y(-393.5), t(3, 'ΔH = −393.5 kJ/mol'), IX.positive);
      _step(c, x0 + 330, y(0), y(-110.5), t(1, 'ΔH₁ = −110.5'), IX.accent);
      _step(c, x0 + 330, y(-110.5), y(-393.5), t(2, 'ΔH₂ = −283.0'), CX.purple);
      lbl(c, 'Enthalpy', const Offset(60, 60), size: 17, color: IX.muted);
      IxPaint.arrow(c, Offset(70, bot), const Offset(70, 80), IX.muted, width: 2.5);
      final br = Rect.fromLTWH(s.width * 0.8, 120, s.width * 0.17, s.height - 240);
      bars(c, br, [('1', 110.5, IX.accent), ('2', 283.0, CX.purple), ('total', 393.5, IX.positive)], max: 450, dy: 100, fmt: (x) => x.toStringAsFixed(1), title: 'Heat released');
    },
    presets: {'Both routes': {'find': 0}, 'Find ΔH₁ (C → CO)': {'find': 1}, 'Find the total': {'find': 3}},
  ),
  'bornhaber': Mode(
    title: 'Born–Haber cycle for NaCl',
    subtitle: 'Thermodynamics · Lattice enthalpy',
    formula: 'ΔfH = ΔsubH + ΔiH + ½ΔbondH + ΔegH − ΔlatticeH',
    defaults: {'n': 5},
    knobs: [
      const Slide('n', 'Steps shown', 0, 5, step: 1, digits: 0),
      Act('Next step', (v) => v['n'] = (v.g('n') + 1).clamp(0, 5), icon: Icons.skip_next_rounded),
      Act('Start again', (v) => v['n'] = 0, icon: Icons.replay_rounded),
    ],
    readouts: (v) {
      final n = v.i('n', 5).clamp(0, 5);
      var h = 0.0;
      for (var i = 1; i <= n; i++) {
        h += _bh[i].$3;
      }
      return [
        Readout('Step', n == 0 ? 'Start' : _bh[n].$2, '', IX.accent),
        Readout('ΔH of step', n == 0 ? '—' : sgn(_bh[n].$3, 1), 'kJ/mol', n > 0 && _bh[n].$3 > 0 ? IX.positive : IX.accent),
        Readout('Running total', sgn(h, 1), 'kJ/mol'),
        Readout('Lattice enthalpy', '+788', 'kJ/mol', IX.green),
        Readout('ΔfH (NaCl)', '−411.2', 'kJ/mol', IX.amber),
      ];
    },
    paint: (c, s, v) {
      final n = v.i('n', 5).clamp(0, 5);
      final hs = <double>[0];
      for (var i = 1; i < _bh.length; i++) {
        hs.add(hs.last + _bh[i].$3);
      }
      final lo = -420.0, hi = 760.0;
      final top = 50.0, bot = s.height - 60;
      double y(double h) => bot - (h - lo) / (hi - lo) * (bot - top);
      final x0 = 120.0, w = s.width - 520;
      for (var i = 0; i <= n; i++) {
        final xl = x0 + i * w / 7;
        level(c, xl, xl + w * 0.42, y(hs[i]), i == n ? IX.ink : IX.inkSoft, w: i == n ? 5 : 3);
        lbl(c, _bh[i].$1, Offset(xl + w * 0.42 + 12, y(hs[i])), size: 19, color: IX.ink, w: i == n ? FontWeight.w700 : FontWeight.w500, align: Alignment.centerLeft);
        if (i > 0) {
          final ax = x0 + i * w / 7 + 24;
          _step(c, ax, y(hs[i - 1]), y(hs[i]), sgn(_bh[i].$3, 1), _bh[i].$3 > 0 ? IX.positive : IX.accent, left: false);
        }
      }
      if (n == 5) {
        level(c, x0, x0 + w * 0.42, y(-411.2), IX.amber, w: 3);
        _step(c, x0 - 30, y(0), y(-411.2), 'ΔfH −411.2', IX.amber, left: true);
      }
      lbl(c, 'Enthalpy (kJ/mol), endothermic up', const Offset(30, 24), size: 16, color: IX.muted, align: Alignment.centerLeft);
    },
    presets: {'Build from the start': {'n': 0}, 'Whole cycle': {'n': 5}},
  ),
  'bonds': Mode(
    title: 'Reaction enthalpy from bond enthalpies',
    subtitle: 'Thermodynamics · Bond enthalpy',
    formula: 'ΔrH = Σ bonds broken − Σ bonds formed',
    titleOf: (v) => 'H₂ + ${_halName(v)}₂ → 2H${_halName(v)}',
    defaults: {'hh': 436, 'xx': 242, 'hx': 431, 'X': 1},
    knobs: const [
      Slide('hh', 'H–H bond enthalpy', 300, 500, unit: 'kJ/mol', digits: 0, step: 1),
      Slide('xx', 'X–X bond enthalpy', 100, 300, unit: 'kJ/mol', digits: 0, step: 1),
      Slide('hx', 'H–X bond enthalpy', 250, 600, unit: 'kJ/mol', digits: 0, step: 1),
    ],
    readouts: (v) {
      final br = v.g('hh', 436) + v.g('xx', 242), mk = 2 * v.g('hx', 431);
      return [Readout('Bonds broken', br.toStringAsFixed(0), 'kJ/mol', IX.positive), Readout('Bonds formed', mk.toStringAsFixed(0), 'kJ/mol', IX.accent), Readout('ΔrH', sgn(br - mk, 0), 'kJ/mol', IX.amber), Readout('Reaction', br - mk < 0 ? 'Exothermic' : 'Endothermic')];
    },
    paint: (c, s, v) {
      final hh = v.g('hh', 436), xx = v.g('xx', 242), hx = v.g('hx', 431);
      final x = _halName(v);
      final top = 80.0, bot = s.height - 80;
      final hi = hh + xx, lo = math.min(0.0, hi - 2 * hx);
      double y(double h) => bot - (h - lo) / (hi - lo) * (bot - top);
      final x0 = 140.0, w = s.width - 300;
      level(c, x0, x0 + w * 0.3, y(0), IX.ink);
      level(c, x0 + w * 0.3, x0 + w * 0.7, y(hi), IX.ink);
      level(c, x0 + w * 0.7, x0 + w, y(hi - 2 * hx), IX.ink);
      // Species pictures on each level.
      void pair(Offset o, String a, String b, {bool bonded = true}) {
        if (bonded) c.drawLine(o - const Offset(22, 0), o + const Offset(22, 0), stroke(IX.steel, 8));
        ball(c, o - Offset(bonded ? 22 : 34, 0), a == 'H' ? 17 : 24, elementColor[a] ?? elementColor['Cl']!, outline: true);
        ball(c, o + Offset(bonded ? 22 : 34, 0), b == 'H' ? 17 : 24, elementColor[b] ?? elementColor['Cl']!, outline: true);
      }

      final xc = elementColor[x] == null ? 'Cl' : x;
      pair(Offset(x0 + w * 0.08, y(0) - 40), 'H', 'H');
      pair(Offset(x0 + w * 0.22, y(0) - 40), xc, xc);
      lbl(c, 'H₂ + $x₂', Offset(x0 + w * 0.15, y(0) + 26), size: 19, color: IX.ink, w: FontWeight.w600);
      pair(Offset(x0 + w * 0.40, y(hi) - 40), 'H', 'H', bonded: false);
      pair(Offset(x0 + w * 0.58, y(hi) - 40), xc, xc, bonded: false);
      lbl(c, '2H + 2$x (atoms)', Offset(x0 + w * 0.5, y(hi) + 26), size: 19, color: IX.ink, w: FontWeight.w600);
      pair(Offset(x0 + w * 0.78, y(hi - 2 * hx) - 40), 'H', xc);
      pair(Offset(x0 + w * 0.92, y(hi - 2 * hx) - 40), 'H', xc);
      lbl(c, '2H$x', Offset(x0 + w * 0.85, y(hi - 2 * hx) + 26), size: 19, color: IX.ink, w: FontWeight.w600);
      _step(c, x0 + w * 0.3, y(0), y(hi), 'break: +${hi.toStringAsFixed(0)}', IX.positive, left: true);
      _step(c, x0 + w * 0.7, y(hi), y(hi - 2 * hx), 'form: −${(2 * hx).toStringAsFixed(0)}', IX.accent);
      IxPaint.dashed(c, Offset(x0 + w * 0.3, y(0)), Offset(x0 + w + 40, y(0)), stroke(IX.muted, 1.5));
      _step(c, x0 + w + 30, y(0), y(hi - 2 * hx), 'ΔrH = ${sgn(hi - 2 * hx, 0)}', IX.amber, left: true);
    },
    presets: {'H₂ + Cl₂': {'hh': 436, 'xx': 242, 'hx': 431, 'X': 1}, 'H₂ + F₂': {'hh': 436, 'xx': 155, 'hx': 565, 'X': 0}, 'H₂ + Br₂': {'hh': 436, 'xx': 192, 'hx': 366, 'X': 2}, 'H₂ + I₂': {'hh': 436, 'xx': 151, 'hx': 299, 'X': 3}},
  ),
  'gibbs': Mode(
    title: 'Spontaneity: ΔG = ΔH − TΔS',
    subtitle: 'Thermodynamics · Gibbs energy',
    formula: 'ΔG = ΔH − TΔS',
    defaults: {'dh': 178, 'ds': 160, 'T': 298},
    knobs: const [
      Slide('dh', 'ΔH', -200, 200, unit: 'kJ/mol', digits: 0, step: 1),
      Slide('ds', 'ΔS', -300, 300, unit: 'J K⁻¹ mol⁻¹', digits: 0, step: 1),
      Slide('T', 'Temperature T', 0, 1500, unit: 'K', digits: 0, step: 5),
    ],
    readouts: (v) {
      final dh = v.g('dh', 178), ds = v.g('ds', 160), t = v.g('T', 298);
      final dg = dh - t * ds / 1000;
      final tc = ds == 0 ? double.nan : dh / ds * 1000;
      return [Readout('ΔG', sgn(dg, 1), 'kJ/mol', dg < 0 ? IX.green : IX.positive), Readout('Spontaneous?', dg < 0 ? 'Yes' : dg > 0 ? 'No' : 'At equilibrium', '', dg < 0 ? IX.green : IX.positive), Readout('Crossover T', tc.isNaN || tc < 0 ? 'none' : tc.toStringAsFixed(0), tc.isNaN || tc < 0 ? '' : 'K', IX.amber), Readout('TΔS', (t * ds / 1000).toStringAsFixed(1), 'kJ/mol')];
    },
    paint: (c, s, v) {
      final dh = v.g('dh', 178), ds = v.g('ds', 160), t = v.g('T', 298);
      final pr = Rect.fromLTWH(140, 70, s.width * 0.6, s.height - 180);
      final pl = Plot(pr, 0, 1500, -500, 500);
      c.drawRect(Rect.fromLTRB(pr.left, pl.py(0), pr.right, pr.bottom), fill(IX.green.withValues(alpha: 0.06)));
      pl.axes(c, x: 'Temperature T (K)', y: 'ΔG (kJ/mol)', dx: 250, dy: 100);
      lbl(c, 'spontaneous (ΔG < 0)', Offset(pr.right - 14, pr.bottom - 22), size: 16, color: IX.green, w: FontWeight.w600, align: Alignment.centerRight);
      lbl(c, 'non-spontaneous (ΔG > 0)', Offset(pr.right - 14, pr.top + 22), size: 16, color: IX.positive, w: FontWeight.w600, align: Alignment.centerRight);
      pl.curve(c, (x) => dh - x * ds / 1000, IX.accent);
      final tc = ds == 0 ? -1.0 : dh / ds * 1000;
      if (tc > 0 && tc < 1500) pl.vline(c, tc, IX.amber, label: 'T = ΔH/ΔS = ${tc.toStringAsFixed(0)} K');
      final dg = dh - t * ds / 1000;
      pl.dot(c, t, dg, dg < 0 ? IX.green : IX.positive, label: '${sgn(dg, 1)} kJ/mol');
      // The four cases.
      final tr = Rect.fromLTWH(s.width * 0.76, 70, s.width * 0.21, s.height - 180);
      panel(c, tr, 'Signs');
      final cases = [('ΔH −, ΔS +', 'always', dh < 0 && ds > 0), ('ΔH +, ΔS −', 'never', dh > 0 && ds < 0), ('ΔH −, ΔS −', 'at low T', dh < 0 && ds < 0), ('ΔH +, ΔS +', 'at high T', dh > 0 && ds > 0)];
      for (final (i, (a, b, on)) in cases.indexed) {
        final r = Rect.fromLTWH(tr.left + 16, tr.top + 56 + i * ((tr.height - 72) / 4), tr.width - 32, (tr.height - 72) / 4 - 12);
        c.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(12)), fill(on ? IX.accent : IX.paper));
        c.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(12)), stroke(on ? IX.accent : IX.rule, 1.5));
        lbl(c, a, r.center + const Offset(0, -14), size: 19, color: on ? Colors.white : IX.ink, w: FontWeight.w600);
        lbl(c, 'spontaneous $b', r.center + const Offset(0, 16), size: 15, color: on ? Colors.white70 : IX.inkSoft);
      }
    },
    presets: {'CaCO₃ decomposition': {'dh': 178, 'ds': 160, 'T': 298}, 'Same, at 1200 K': {'dh': 178, 'ds': 160, 'T': 1200}, 'Freezing water': {'dh': -6, 'ds': -22, 'T': 250}, 'Always spontaneous': {'dh': -100, 'ds': 100, 'T': 500}},
  ),
};

String _halName(V v) => const ['F', 'Cl', 'Br', 'I'][v.i('X', 1).clamp(0, 3)];
