import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'bench.dart';
import 'kit.dart';

/// Chemical equilibrium: approach to equilibrium from either side, evaporation in a closed jar,
/// Le Chatelier's principle, Kp and Kc, the extent of H₂ + I₂ ⇌ 2HI, solubility product with the
/// common-ion effect, and the chromate–dichromate equilibrium.

const _aCol = IX.accent, _bCol = IX.positive;

void _box(Canvas c, Rect r, double fa, int n, {String? title}) {
  c.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(18)), fill(const Color(0xFFF5F8FC)));
  c.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(18)), stroke(IX.glassEdge, 2.5));
  final na = (n * fa).round();
  for (var i = 0; i < n; i++) {
    final p = Offset(r.left + 22 + rnd(i, 61) * (r.width - 44), r.top + 22 + rnd(i, 62) * (r.height - 44));
    ball(c, p, 10, i < na ? _aCol : _bCol);
  }
  if (title != null) lbl(c, title, r.topCenter + const Offset(0, -22), size: 18, color: IX.ink, w: FontWeight.w600);
}

/// [A](t) for A ⇌ B, first order both ways.
double _conA(double a0, double total, double kf, double kb, double t) {
  final aeq = total * kb / (kf + kb);
  return aeq + (a0 - aeq) * math.exp(-(kf + kb) * t);
}

final Map<String, Mode> equilibriumModes = {
  'approach': Mode(
    title: 'Approach to equilibrium',
    subtitle: 'Equilibrium · Dynamic equilibrium',
    formula: 'A ⇌ B,   Kc = [B]/[A] = k_f / k_b',
    defaults: {'kf': 0.3, 'kb': 0.1, 'from': 0, 't': 0},
    tick: (v, dt) {
      v['t'] = v.g('t') + dt * 3;
      if (v.g('t') >= 30) v['_run'] = 0;
    },
    autoRun: true,
    knobs: [
      const Slide('kf', 'Forward rate constant k_f', 0.02, 1, unit: 's⁻¹', digits: 2, step: 0.01),
      const Slide('kb', 'Backward rate constant k_b', 0.02, 1, unit: 's⁻¹', digits: 2, step: 0.01),
      const Pick('from', 'Start with', ['Pure A', 'Pure B'], ids: ['A', 'B']),
      const Slide('t', 'Time', 0, 30, unit: 's', digits: 1),
      Act('Run', (v) {
        v['t'] = 0;
        v['_run'] = 1;
      }),
    ],
    readouts: (v) {
      final kf = v.g('kf', 0.3), kb = v.g('kb', 0.1), t = v.g('t');
      final a = _conA(v.i('from') == 0 ? 1 : 0, 1, kf, kb, t), b = 1 - a;
      return [Readout('[A]', a.toStringAsFixed(3), 'mol/L', _aCol), Readout('[B]', b.toStringAsFixed(3), 'mol/L', _bCol), Readout('Q = [B]/[A]', a < 1e-4 ? '∞' : (b / a).toStringAsFixed(2), '', IX.amber), Readout('Kc = k_f/k_b', (kf / kb).toStringAsFixed(2), '', IX.green)];
    },
    paint: (c, s, v) {
      final kf = v.g('kf', 0.3), kb = v.g('kb', 0.1), t = v.g('t');
      final a0 = v.i('from') == 0 ? 1.0 : 0.0;
      final a = _conA(a0, 1, kf, kb, t);
      _box(c, Rect.fromLTWH(50, 80, s.width * 0.3, s.height * 0.55), a, 40, title: 't = ${t.toStringAsFixed(1)} s');
      ball(c, Offset(70, s.height * 0.55 + 130), 10, _aCol);
      lbl(c, 'A', Offset(90, s.height * 0.55 + 130), size: 18, align: Alignment.centerLeft);
      ball(c, Offset(150, s.height * 0.55 + 130), 10, _bCol);
      lbl(c, 'B', Offset(170, s.height * 0.55 + 130), size: 18, align: Alignment.centerLeft);
      lbl(c, 'forward rate ${(kf * a).toStringAsFixed(3)}   backward rate ${(kb * (1 - a)).toStringAsFixed(3)} mol L⁻¹ s⁻¹', Offset(50, s.height * 0.55 + 180), size: 17, color: IX.inkSoft, align: Alignment.centerLeft);
      final pr = Rect.fromLTWH(s.width * 0.43, 70, s.width * 0.52, s.height - 180);
      final pl = Plot(pr, 0, 30, 0, 1.05);
      pl.axes(c, x: 'Time (s)', y: 'Concentration (mol/L)', dx: 5, dy: 0.25);
      pl.curve(c, (x) => _conA(a0, 1, kf, kb, x), _aCol, faint: true);
      pl.curve(c, (x) => 1 - _conA(a0, 1, kf, kb, x), _bCol, faint: true);
      pl.curve(c, (x) => _conA(a0, 1, kf, kb, x), _aCol, to: t);
      pl.curve(c, (x) => 1 - _conA(a0, 1, kf, kb, x), _bCol, to: t);
      pl.hline(c, kb / (kf + kb), _aCol, label: '[A]eq');
      pl.hline(c, kf / (kf + kb), _bCol, label: '[B]eq');
      pl.dot(c, t, a, _aCol);
      pl.dot(c, t, 1 - a, _bCol);
      pl.legend(c, [('[A]', _aCol), ('[B]', _bCol)], right: true, at: pr.topRight + const Offset(0, 60));
    },
    presets: {'From pure A': {'kf': 0.3, 'kb': 0.1, 'from': 0, 't': 30}, 'From pure B': {'kf': 0.3, 'kb': 0.1, 'from': 1, 't': 30}, 'K = 1': {'kf': 0.2, 'kb': 0.2, 't': 30}},
  ),
  'evaporation': Mode(
    title: 'Evaporation in a closed jar',
    subtitle: 'Equilibrium · Physical equilibrium',
    formula: 'H₂O(l) ⇌ H₂O(g)',
    defaults: {'t': 0, 'T': 1},
    autoRun: true,
    tick: (v, dt) {
      v['t'] = v.g('t') + dt * 2;
      if (v.g('t') >= 20) v['_run'] = 0;
    },
    knobs: [
      const Pick('T', 'Temperature', ['20 °C', '30 °C', '40 °C'], ids: ['20', '30', '40']),
      const Slide('t', 'Time', 0, 20, unit: 'min', digits: 1),
      Act('Start again', (v) {
        v['t'] = 0;
        v['_run'] = 1;
      }, icon: Icons.replay_rounded),
    ],
    readouts: (v) {
      final peq = const [2.34, 4.25, 7.38][v.i('T', 1).clamp(0, 2)];
      final p = peq * (1 - math.exp(-v.g('t') / 4));
      return [Readout('Vapour pressure', p.toStringAsFixed(2), 'kPa', IX.accent), Readout('Equilibrium value', peq.toStringAsFixed(2), 'kPa', IX.green), Readout('Condensation / evaporation', (p / peq).toStringAsFixed(2), '', IX.amber), Readout('State', p / peq > 0.98 ? 'Equilibrium' : 'Not yet')];
    },
    paint: (c, s, v) {
      final peq = const [2.34, 4.25, 7.38][v.i('T', 1).clamp(0, 2)];
      final f = 1 - math.exp(-v.g('t') / 4);
      final jar = Rect.fromLTWH(70, 70, s.width * 0.3, s.height - 150);
      final liq = beaker(c, jar, 0.32, CX.water, marks: false);
      c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(jar.left - 14, jar.top - 22, jar.width + 28, 24), const Radius.circular(8)), fill(const Color(0xFF5B6478)));
      lbl(c, 'lid: closed system', Offset(jar.center.dx, jar.top - 44), size: 16, color: IX.inkSoft);
      final n = (f * peq * 9).round();
      for (var i = 0; i < n; i++) {
        final p = Offset(jar.left + 22 + rnd(i, 71) * (jar.width - 44), jar.top + 30 + rnd(i, 72) * (liq.top - jar.top - 50));
        ball(c, p, 7, IX.accent);
      }
      for (var k = 0; k < 4; k++) {
        final x = jar.left + jar.width * (0.2 + k * 0.2);
        IxPaint.arrow(c, Offset(x, liq.top - 6), Offset(x, liq.top - 46), IX.positive, width: 3, head: 12);
        if (k < (4 * f).round()) IxPaint.arrow(c, Offset(x + 18, liq.top - 50), Offset(x + 18, liq.top - 10), IX.accent, width: 3, head: 12);
      }
      final pr = Rect.fromLTWH(s.width * 0.48, 70, s.width * 0.47, s.height - 180);
      final pl = Plot(pr, 0, 20, 0, 1.2);
      pl.axes(c, x: 'Time (min)', y: 'Rate (relative)', dx: 4, dy: 0.25);
      pl.curve(c, (x) => 1, IX.positive);
      pl.curve(c, (x) => 1 - math.exp(-x / 4), IX.accent);
      pl.vline(c, v.g('t'), IX.muted);
      pl.legend(c, [('rate of evaporation', IX.positive), ('rate of condensation', IX.accent)], right: true, at: pr.topRight + const Offset(0, 120));
      lbl(c, 'equal rates: dynamic equilibrium', pl.p(16, 1.0) + const Offset(0, -24), size: 16, color: IX.green, w: FontWeight.w600, halo: true);
    },
    presets: {'At the start': {'t': 0.5}, 'At equilibrium': {'t': 20}, 'Warmer, 40 °C': {'t': 20, 'T': 2}},
  ),
  'lechatelier': Mode(
    title: "Le Chatelier's principle",
    subtitle: 'Equilibrium · Factors affecting equilibrium',
    formula: 'A ⇌ B   ΔH < 0 (forward exothermic)',
    defaults: {'K': 2, 'a0': 1 / 3, 'b0': 2 / 3, 'a1': 1 / 3, 'b1': 2 / 3, 'tt': 10},
    tick: (v, dt) {
      v['tt'] = v.g('tt') + dt * 2.5;
      if (v.g('tt') >= 10) v['_run'] = 0;
    },
    knobs: [
      Act('Add A', (v) => _disturb(v, da: 0.5)),
      Act('Add B', (v) => _disturb(v, db: 0.5)),
      Act('Heat', (v) => _disturb(v, dk: 0.5), icon: Icons.local_fire_department_outlined),
      Act('Cool', (v) => _disturb(v, dk: 2), icon: Icons.ac_unit_rounded),
      const Note('The system uses up part of what you add until Q = K again. Heating an exothermic reaction lowers K, so the equilibrium shifts back to A.'),
    ],
    readouts: (v) {
      final (ae, be) = _eq(v);
      final t = v.g('tt').clamp(0, 10);
      final a = ae + (v.g('a1') - ae) * math.exp(-t * 0.7), b = be + (v.g('b1') - be) * math.exp(-t * 0.7);
      return [Readout('[A]', a.toStringAsFixed(3), 'mol/L', _aCol), Readout('[B]', b.toStringAsFixed(3), 'mol/L', _bCol), Readout('Q', (b / a).toStringAsFixed(2), '', IX.amber), Readout('K', v.g('K', 2).toStringAsFixed(2), '', IX.green), Readout('Shift', (b / a - v.g('K', 2)).abs() < 0.02 ? 'At equilibrium' : b / a < v.g('K', 2) ? 'Forward →' : '← Backward')];
    },
    paint: (c, s, v) {
      final (ae, be) = _eq(v);
      final t = v.g('tt').clamp(0.0, 10.0);
      double fa(double x) => x < 0 ? v.g('a0') : ae + (v.g('a1') - ae) * math.exp(-x * 0.7);
      double fb(double x) => x < 0 ? v.g('b0') : be + (v.g('b1') - be) * math.exp(-x * 0.7);
      final a = fa(t), b = fb(t);
      _box(c, Rect.fromLTWH(50, 80, s.width * 0.28, s.height * 0.55), a / (a + b), ((a + b) * 30).round().clamp(10, 90), title: 'Reaction mixture');
      final pr = Rect.fromLTWH(s.width * 0.42, 70, s.width * 0.53, s.height - 180);
      final top = math.max(1.4, math.max(v.g('a1'), v.g('b1')) * 1.15);
      final pl = Plot(pr, -3, 10, 0, top);
      pl.axes(c, x: 'Time after the change', y: 'Concentration (mol/L)', dx: 1, fx: (_) => '', dy: 0.25);
      pl.vline(c, 0, IX.muted, label: 'change');
      pl.curve(c, fa, _aCol, faint: true, from: 0);
      pl.curve(c, fb, _bCol, faint: true, from: 0);
      pl.curve(c, fa, _aCol, to: -0.001);
      pl.curve(c, fb, _bCol, to: -0.001);
      pl.curve(c, fa, _aCol, from: 0, to: t);
      pl.curve(c, fb, _bCol, from: 0, to: t);
      pl.dot(c, t, a, _aCol, label: 'A');
      pl.dot(c, t, b, _bCol, label: 'B');
      final q = b / a, k = v.g('K', 2);
      lbl(c, 'Q = ${q.toStringAsFixed(2)}  ${(q - k).abs() < 0.02 ? '=' : q < k ? '<' : '>'}  K = ${k.toStringAsFixed(2)}', Offset(50, s.height * 0.55 + 140), size: 26, color: IX.ink, w: FontWeight.w600, align: Alignment.centerLeft);
    },
    presets: {'At equilibrium': {'K': 2}, 'After adding A': {'K': 2, 'a0': 1 / 3, 'b0': 2 / 3, 'a1': 5 / 6, 'b1': 2 / 3, 'tt': 10}},
  ),
  'kp': Mode(
    title: 'From Kc to Kp',
    subtitle: 'Equilibrium · Equilibrium constants',
    formula: 'Kp = Kc (RT)^Δn,   R = 0.0831 L bar K⁻¹ mol⁻¹',
    defaults: {'lk': -2.33, 'dn': 1, 'T': 500},
    knobs: const [
      Slide('lk', 'log Kc', -6, 6, digits: 2, step: 0.01),
      Slide('dn', 'Δn (gas moles: products − reactants)', -2, 2, step: 1, digits: 0),
      Slide('T', 'Temperature', 200, 1000, unit: 'K', digits: 0, step: 5),
    ],
    readouts: (v) {
      final kc = math.pow(10, v.g('lk', -2.33)).toDouble();
      final kp = kc * math.pow(0.0831 * v.g('T', 500), v.g('dn', 1));
      return [Readout('Kc', sx(kc), '', IX.accent), Readout('Kp', sx(kp), '', IX.positive), Readout('RT', (0.0831 * v.g('T', 500)).toStringAsFixed(2), 'L bar/mol'), Readout('log Kp', (math.log(kp) / math.ln10).toStringAsFixed(2), '', IX.amber)];
    },
    paint: (c, s, v) {
      final dn = v.i('dn', 1), t = v.g('T', 500);
      final kc = math.pow(10, v.g('lk', -2.33)).toDouble();
      final kp = kc * math.pow(0.0831 * t, dn);
      final ex = const {-2: 'N₂(g) + 3H₂(g) ⇌ 2NH₃(g)', -1: '2SO₂(g) + O₂(g) ⇌ 2SO₃(g)', 0: 'H₂(g) + I₂(g) ⇌ 2HI(g)', 1: 'PCl₅(g) ⇌ PCl₃(g) + Cl₂(g)', 2: '2NH₃(g) ⇌ N₂(g) + 3H₂(g)'}[dn]!;
      final card = Rect.fromLTWH(60, 50, s.width - 120, 170);
      panel(c, card, 'Example with Δn = ${dn >= 0 ? dn : '−${-dn}'}');
      lbl(c, ex, card.center + const Offset(0, 14), size: 36, color: IX.ink, w: FontWeight.w600);
      final lines = ['Kp = Kc × (RT)^Δn', '= ${sx(kc)} × (0.0831 × ${t.toStringAsFixed(0)})^${dn >= 0 ? dn : '(−${-dn})'}', '= ${sx(kp)}'];
      var y = 300.0;
      for (final (i, l) in lines.indexed) {
        lbl(c, l, Offset(s.width * 0.08, y), size: i == 2 ? 40 : 30, color: i == 2 ? IX.positive : IX.ink, w: FontWeight.w600, align: Alignment.centerLeft);
        y += 66;
      }
      // log scale comparison.
      final pr = Rect.fromLTWH(s.width * 0.08, s.height - 170, s.width * 0.84, 10);
      final pl = Plot(pr, -10, 10, 0, 1);
      c.drawLine(pl.p(-10, 0), pl.p(10, 0), stroke(IX.ink, 3));
      for (var x = -10; x <= 10; x += 2) {
        c.drawLine(pl.p(x.toDouble(), 0) + const Offset(0, -8), pl.p(x.toDouble(), 0) + const Offset(0, 8), stroke(IX.ink, 2));
        lbl(c, x == 0 ? '1' : '10${sup(x)}', pl.p(x.toDouble(), 0) + const Offset(0, 30), size: 16);
      }
      final lkp = math.log(kp) / math.ln10;
      for (final (val, name, col, dy) in [(v.g('lk', -2.33), 'Kc', IX.accent, -30.0), (lkp, 'Kp', IX.positive, -70.0)]) {
        final p = pl.p(val.clamp(-10, 10), 0);
        c.drawLine(p, p + Offset(0, dy), stroke(col, 3));
        ball(c, p + Offset(0, dy), 9, col);
        lbl(c, name, p + Offset(16, dy), size: 20, color: col, w: FontWeight.w700, align: Alignment.centerLeft);
      }
      lbl(c, 'Δn = 0: Kp = Kc', Offset(pr.right, pr.top - 110), size: 16, color: IX.muted, align: Alignment.centerRight);
    },
    presets: {'PCl₅ at 500 K': {'lk': -2.33, 'dn': 1, 'T': 500}, 'NH₃ synthesis': {'lk': 1.78, 'dn': -2, 'T': 500}, 'H₂ + I₂ (Δn = 0)': {'lk': 1.71, 'dn': 0, 'T': 731}},
  ),
  'hi': Mode(
    title: 'How far does H₂ + I₂ ⇌ 2HI go?',
    subtitle: 'Equilibrium · Calculating equilibrium concentrations',
    formula: 'K = [HI]² / [H₂][I₂] = (2x)² / (a − x)²',
    defaults: {'K': 54.8, 'a': 0.5},
    knobs: const [Slide('K', 'Equilibrium constant K', 0.5, 100, digits: 1, step: 0.1), Slide('a', 'Starting [H₂] = [I₂] = a', 0.1, 1, unit: 'mol/L', digits: 2, step: 0.01)],
    readouts: (v) {
      final k = v.g('K', 54.8), a = v.g('a', 0.5);
      final f = math.sqrt(k) / (2 + math.sqrt(k));
      return [Readout('Fraction converted', (f * 100).toStringAsFixed(1), '%', IX.accent), Readout('[H₂] = [I₂]', (a * (1 - f)).toStringAsFixed(3), 'mol/L', CX.purple), Readout('[HI]', (2 * a * f).toStringAsFixed(3), 'mol/L', IX.green), Readout('x', (a * f).toStringAsFixed(3), 'mol/L')];
    },
    paint: (c, s, v) {
      final k = v.g('K', 54.8), a = v.g('a', 0.5);
      final f = math.sqrt(k) / (2 + math.sqrt(k));
      final pr = Rect.fromLTWH(140, 70, s.width * 0.48, s.height - 180);
      final pl = Plot(pr, 0, 100, 0, 1);
      pl.axes(c, x: 'K', y: 'Fraction of H₂ converted', dx: 20, dy: 0.25);
      pl.curve(c, (x) => math.sqrt(x) / (2 + math.sqrt(x)), IX.accent);
      pl.dot(c, k, f, IX.amber, label: '${(f * 100).toStringAsFixed(0)} %');
      final br = Rect.fromLTWH(s.width * 0.72, 90, s.width * 0.25, s.height - 220);
      bars(c, br, [('H₂', a * (1 - f), const Color(0xFF9AA3B5)), ('I₂', a * (1 - f), CX.purple), ('HI', 2 * a * f, IX.green)], max: 2.05, dy: 0.5, fmt: (x) => x.toStringAsFixed(3), title: 'At equilibrium (mol/L)');
    },
    presets: {'K = 54.8 (699 K)': {'K': 54.8}, 'K = 4': {'K': 4}, 'K = 1': {'K': 1}},
  ),
  'ksp': Mode(
    title: 'Ksp and the common ion effect',
    subtitle: 'Equilibrium · Solubility equilibria',
    formula: 'AgCl(s) ⇌ Ag⁺ + Cl⁻,  Ksp = [Ag⁺][Cl⁻]',
    titleOf: (v) => 'Solubility of ${_salts[v.i('salt').clamp(0, 2)].$1}',
    defaults: {'salt': 0, 'c': 0},
    knobs: [Pick('salt', 'Salt', [for (final x in _salts) x.$1], ids: const ['AgCl', 'BaSO4', 'AgBr']), const Slide('c', 'Common ion already present', 0, 5, unit: '× 10⁻⁵ mol/L', digits: 2, step: 0.05)],
    readouts: (v) {
      final ksp = _salts[v.i('salt').clamp(0, 2)].$2, c0 = v.g('c') * 1e-5;
      final sol = (-c0 + math.sqrt(c0 * c0 + 4 * ksp)) / 2;
      return [Readout('Ksp', sx(ksp), '', IX.inkSoft), Readout('Solubility S', sx(sol), 'mol/L', IX.accent), Readout('In pure water', sx(math.sqrt(ksp)), 'mol/L', IX.green), Readout('Fall in S', '${((1 - sol / math.sqrt(ksp)) * 100).toStringAsFixed(0)} %', '', IX.amber)];
    },
    paint: (c, s, v) {
      final x = _salts[v.i('salt').clamp(0, 2)];
      final ksp = x.$2, c0 = v.g('c') * 1e-5;
      final sol = (-c0 + math.sqrt(c0 * c0 + 4 * ksp)) / 2;
      final b = Rect.fromLTWH(80, 120, s.width * 0.3, s.height - 220);
      final liq = beaker(c, b, 0.8, const Color(0xFFEFF5FB), label: 'saturated ${x.$1}');
      for (var i = 0; i < 26; i++) {
        final p = Offset(liq.left + 40 + rnd(i, 81) * (liq.width - 80), liq.bottom - 10 - rnd(i, 82) * 22);
        c.drawRect(Rect.fromCenter(center: p, width: 14, height: 10), fill(const Color(0xFFDCDCE2)));
        c.drawRect(Rect.fromCenter(center: p, width: 14, height: 10), stroke(const Color(0xFFA8AAB6), 1));
      }
      final nm = (sol / math.sqrt(ksp) * 12).round(), nc = (c0 / 1e-5 * 6).round();
      for (var i = 0; i < nm; i++) {
        tag(c, x.$3, Offset(liq.left + 40 + rnd(i, 83) * (liq.width - 80), liq.top + 30 + rnd(i, 84) * (liq.height - 110)), IX.accent, size: 14);
      }
      for (var i = 0; i < nm + nc; i++) {
        tag(c, x.$4, Offset(liq.left + 40 + rnd(i, 85) * (liq.width - 80), liq.top + 30 + rnd(i, 86) * (liq.height - 110)), IX.green, size: 14);
      }
      final pr = Rect.fromLTWH(s.width * 0.48, 70, s.width * 0.47, s.height - 180);
      final s0 = math.sqrt(ksp) / 1e-5;
      final pl = Plot(pr, 0, 5, 0, math.max(1.6, s0 * 1.2));
      pl.axes(c, x: 'Common ion added (× 10⁻⁵ mol/L)', y: 'Solubility S (× 10⁻⁵ mol/L)', dx: 1);
      pl.curve(c, (q) => (-q * 1e-5 + math.sqrt(q * q * 1e-10 + 4 * ksp)) / 2 / 1e-5, IX.accent);
      pl.dot(c, v.g('c'), sol / 1e-5, IX.amber, label: sx(sol));
    },
    presets: {'AgCl in water': {'salt': 0, 'c': 0}, 'AgCl in 2 × 10⁻⁵ M NaCl': {'salt': 0, 'c': 2}, 'BaSO₄': {'salt': 1, 'c': 1}},
  ),
  'chromate': Mode(
    title: 'Chromate and dichromate',
    subtitle: 'd- and f-block elements · Potassium dichromate',
    formula: '2CrO₄²⁻ + 2H⁺ ⇌ Cr₂O₇²⁻ + H₂O',
    defaults: {'pH': 7},
    knobs: [
      const Slide('pH', 'pH', 3, 11, digits: 1, step: 0.1),
      Act('Add acid', (v) => v['pH'] = (v.g('pH', 7) - 1).clamp(3, 11), icon: Icons.arrow_downward_rounded),
      Act('Add alkali', (v) => v['pH'] = (v.g('pH', 7) + 1).clamp(3, 11), icon: Icons.arrow_upward_rounded),
      const Note('Acid supplies H⁺ and drives the equilibrium right (orange dichromate). Alkali removes H⁺ and pulls it back to yellow chromate. Cr stays +6 throughout.'),
    ],
    readouts: (v) {
      final (cr, di) = _chrom(v.g('pH', 7));
      final f = 2 * di / 0.1;
      return [Readout('[CrO₄²⁻]', cr.toStringAsFixed(4), 'mol/L', const Color(0xFFD9A400)), Readout('[Cr₂O₇²⁻]', di.toStringAsFixed(4), 'mol/L', const Color(0xFFE0661A)), Readout('Cr as dichromate', (f * 100).toStringAsFixed(0), '%'), Readout('Oxidation state of Cr', '+6')];
    },
    paint: (c, s, v) {
      final (_, di) = _chrom(v.g('pH', 7));
      final f = 2 * di / 0.1;
      final col = Color.lerp(const Color(0xFFF3CB2B), const Color(0xFFE5631C), f)!;
      beaker(c, Rect.fromLTWH(100, 110, s.width * 0.3, s.height - 220), 0.72, col, label: 'Cr(VI), 0.1 M in total');
      final pr = Rect.fromLTWH(s.width * 0.5, 70, s.width * 0.45, s.height - 180);
      final pl = Plot(pr, 3, 11, 0, 100);
      pl.axes(c, x: 'pH', y: 'Per cent of Cr', dx: 1, dy: 25);
      pl.curve(c, (p) => 200 * _chrom(p).$2 / 0.1, const Color(0xFFE0661A));
      pl.curve(c, (p) => 100 * _chrom(p).$1 / 0.1, const Color(0xFFD9A400));
      pl.vline(c, v.g('pH', 7), IX.muted);
      pl.legend(c, [('dichromate (orange)', const Color(0xFFE0661A)), ('chromate (yellow)', const Color(0xFFD9A400))], right: true, at: pr.topRight + const Offset(0, 140));
    },
    presets: {'Neutral': {'pH': 7}, 'Acidified': {'pH': 4}, 'Alkaline': {'pH': 10}},
  ),
};

const _salts = [('AgCl', 1.8e-10, 'Ag⁺', 'Cl⁻'), ('BaSO₄', 1.1e-10, 'Ba²⁺', 'SO₄²⁻'), ('AgBr', 5.0e-13, 'Ag⁺', 'Br⁻')];

(double, double) _chrom(double ph) {
  const k = 4.2e14, ctot = 0.1;
  final h = math.pow(10, -ph).toDouble();
  final a = 2 * k * h * h;
  final x = a < 1e-12 ? ctot : (-1 + math.sqrt(1 + 4 * a * ctot)) / (2 * a);
  return (x, (ctot - x) / 2);
}

(double, double) _eq(V v) {
  final tot = v.g('a1') + v.g('b1'), k = v.g('K', 2);
  return (tot / (1 + k), tot * k / (1 + k));
}

void _disturb(V v, {double da = 0, double db = 0, double dk = 1}) {
  // Freeze the present state as "before", then apply the change.
  final (ae, be) = _eq(v);
  final t = v.g('tt').clamp(0.0, 10.0);
  final a = ae + (v.g('a1') - ae) * math.exp(-t * 0.7), b = be + (v.g('b1') - be) * math.exp(-t * 0.7);
  v['a0'] = a;
  v['b0'] = b;
  v['a1'] = a + da;
  v['b1'] = b + db;
  v['K'] = (v.g('K', 2) * dk).clamp(0.1, 20);
  v['tt'] = 0;
  v['_run'] = 1;
}
