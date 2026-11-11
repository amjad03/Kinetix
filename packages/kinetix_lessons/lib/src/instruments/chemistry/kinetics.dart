import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'bench.dart';
import 'kit.dart';

/// Chemical kinetics: average and instantaneous rate, rate laws and order, integrated rate
/// equations, half-life, the effect of temperature (Arrhenius) and the energy profile with a
/// catalyst.

const _r = 8.314;

/// A reaction flask whose colour fades as the coloured reactant is used up.
void _fadingFlask(Canvas c, Rect r, double frac, String label) {
  final col = Color.lerp(const Color(0xFFF4F7FB), const Color(0xFFB45309), frac.clamp(0.0, 1.0) * 0.85)!;
  beaker(c, r, 0.72, col, label: label);
}

final Map<String, Mode> kineticsModes = {
  'rate': Mode(
    title: 'Average and instantaneous rate',
    subtitle: 'Chemical kinetics · Rate of a reaction',
    formula: 'rate = −Δ[R]/Δt     instantaneous: −d[R]/dt',
    defaults: {'R0': 1.0, 'k': 0.3, 't': 3, 'dt': 4},
    knobs: [
      const Slide('R0', 'Initial concentration [R]₀', 0.2, 2, unit: 'mol/L', digits: 2, step: 0.05),
      const Slide('k', 'Rate constant k', 0.05, 1, unit: 's⁻¹', digits: 2, step: 0.01),
      const Slide('t', 'Moment t₁', 0, 15, unit: 's', digits: 1, step: 0.1),
      const Slide('dt', 'Interval Δt for the average', 0.2, 8, unit: 's', digits: 1, step: 0.1),
      const Note('As Δt shrinks, the secant (average rate) turns into the tangent (instantaneous rate).'),
    ],
    readouts: (v) {
      final r0 = v.g('R0', 1), k = v.g('k', 0.3), t = v.g('t', 3), t2 = t + v.g('dt', 4);
      double cc(double x) => r0 * math.exp(-k * x);
      return [Readout('[R] at t₁', cc(t).toStringAsFixed(3), 'mol/L', IX.accent), Readout('Instantaneous rate', (k * cc(t)).toStringAsFixed(4), 'mol L⁻¹ s⁻¹', IX.positive), Readout('Average rate (t₁ → t₂)', ((cc(t) - cc(t2)) / (t2 - t)).toStringAsFixed(4), 'mol L⁻¹ s⁻¹', IX.green), Readout('t₂', t2.toStringAsFixed(1), 's')];
    },
    paint: (c, s, v) {
      final r0 = v.g('R0', 1), k = v.g('k', 0.3), t = v.g('t', 3), t2 = t + v.g('dt', 4);
      double cc(double x) => r0 * math.exp(-k * x);
      _fadingFlask(c, Rect.fromLTWH(60, 200, s.width * 0.2, s.height * 0.5), cc(t) / 2, 'at t₁ = ${t.toStringAsFixed(1)} s');
      lbl(c, 'Coloured reactant fades', Offset(60 + s.width * 0.1, 160), size: 17, color: IX.inkSoft, w: FontWeight.w600);
      final pr = Rect.fromLTWH(s.width * 0.34, 80, s.width * 0.6, s.height - 210);
      final pl = Plot(pr, 0, 20, 0, 2.1);
      pl.axes(c, x: 'Time t (s)', y: '[R]  (mol/L)', dx: 2, dy: 0.5);
      pl.area(c, cc, t, t2, IX.green);
      pl.curve(c, cc, IX.accent, w: 5);
      final slope = -k * cc(t);
      pl.curve(c, (x) => cc(t) + slope * (x - t), IX.positive, w: 3, from: math.max(0, t - 4), to: t + 5);
      pl.line(c, [Offset(t, cc(t)), Offset(t2, cc(t2))], IX.green, w: 3);
      pl.dot(c, t, cc(t), IX.positive, label: 'tangent: slope −${(k * cc(t)).toStringAsFixed(3)}');
      pl.dot(c, t2, cc(t2), IX.green, label: 'secant to t₂', align: Alignment.bottomLeft);
      pl.legend(c, [('[R] = [R]₀ e^(−kt)', IX.accent), ('tangent → instantaneous rate', IX.positive), ('secant → average rate', IX.green)], right: true);
    },
    presets: {'Early, wide Δt': {'t': 1, 'dt': 6}, 'Narrow Δt': {'t': 3, 'dt': 0.4}, 'Late in the reaction': {'t': 10, 'dt': 3}, 'Fast reaction': {'k': 0.8, 't': 1, 'dt': 2}},
  ),
  'order': Mode(
    title: 'Rate law and order of reaction',
    subtitle: 'Chemical kinetics · rate = k[A]ᵐ[B]ⁿ',
    formula: 'rate = k [A]ᵐ [B]ⁿ     order = m + n',
    titleOf: (v) => 'rate = k[A]${v.i('m', 1) == 1 ? '' : sup(v.i('m', 1))}[B]${v.i('nB') == 1 ? '' : sup(v.i('nB'))}  ·  overall order ${v.i('m', 1) + v.i('nB')}',
    defaults: {'k': 1, 'm': 1, 'nB': 0, 'A': 0.2, 'B': 0.2, 'f': 2},
    knobs: [
      const Slide('m', 'Order in A, m', 0, 3, digits: 0, step: 1),
      const Slide('nB', 'Order in B, n', 0, 2, digits: 0, step: 1),
      const Slide('A', '[A]', 0.1, 1, unit: 'mol/L', digits: 2, step: 0.05),
      const Slide('B', '[B]', 0.1, 1, unit: 'mol/L', digits: 2, step: 0.05),
      const Slide('f', 'Raise [A] by a factor f', 1, 5, digits: 1, step: 0.5),
      const Slide('k', 'Rate constant k', 0.1, 2, digits: 2, step: 0.05),
    ],
    readouts: (v) {
      final k = v.g('k', 1), m = v.i('m', 1), n = v.i('nB'), a = v.g('A', 0.2), b = v.g('B', 0.2), f = v.g('f', 2);
      final rate = k * math.pow(a, m) * math.pow(b, n);
      final ord = m + n;
      final unit = ord == 0 ? 'mol L⁻¹ s⁻¹' : ord == 1 ? 's⁻¹' : 'mol${sup(1 - ord)} L${ord == 2 ? '' : sup(ord - 1)} s⁻¹';
      return [Readout('Rate', sx(rate.toDouble()), 'mol L⁻¹ s⁻¹', IX.accent), Readout('Rate × f${sup(m)}', (math.pow(f, m)).toStringAsFixed(2), '× faster', IX.positive), Readout('Overall order', '$ord'), Readout('Units of k', unit, '', IX.green)];
    },
    paint: (c, s, v) {
      final k = v.g('k', 1), m = v.i('m', 1), n = v.i('nB'), a = v.g('A', 0.2), b = v.g('B', 0.2), f = v.g('f', 2);
      final bf = math.pow(b, n).toDouble();
      final pr = Rect.fromLTWH(110, 80, s.width * 0.48, s.height - 210);
      final top = math.max(0.3, k * bf * 1.1);
      final pl = Plot(pr, 0, 1, 0, top);
      pl.axes(c, x: '[A]  (mol/L)', y: 'Rate (mol L⁻¹ s⁻¹)', dx: 0.2, title: 'Rate against [A] for each order');
      for (var o = 0; o <= 3; o++) {
        final sel = o == m;
        pl.curve(c, (x) => k * math.pow(x, o) * bf, sel ? CX.series[o] : CX.series[o].withValues(alpha: 0.28), w: sel ? 5 : 2.5);
      }
      pl.legend(c, [for (var o = 0; o <= 3; o++) ('order $o', CX.series[o])]);
      final r1 = k * math.pow(a, m) * bf;
      pl.dot(c, a, r1, IX.ink, label: '[A]');
      if (a * f <= 1) pl.dot(c, a * f, k * math.pow(a * f, m) * bf, CX.series[m], label: '${f.toStringAsFixed(1)} × [A]');
      // Table of initial rates.
      final tr = Rect.fromLTWH(s.width * 0.66, 90, s.width * 0.3, 360);
      panel(c, tr, 'Initial-rate experiments');
      final rows = [(a, b), (a * 2, b), (a, b * 2)];
      final cols = [tr.left + 40, tr.left + tr.width * 0.36, tr.left + tr.width * 0.66];
      for (final (j, h) in ['[A]', '[B]', 'rate'].indexed) {
        lbl(c, h, Offset(cols[j], tr.top + 74), size: 18, color: IX.muted, w: FontWeight.w600, align: Alignment.centerLeft);
      }
      for (final (i, (aa, bb)) in rows.indexed) {
        final y = tr.top + 124 + i * 64.0;
        final rr = k * math.pow(aa, m) * math.pow(bb, n);
        lbl(c, aa.toStringAsFixed(2), Offset(cols[0], y), size: 21, color: i == 1 ? IX.positive : IX.ink, w: FontWeight.w600, align: Alignment.centerLeft);
        lbl(c, bb.toStringAsFixed(2), Offset(cols[1], y), size: 21, color: i == 2 ? IX.positive : IX.ink, w: FontWeight.w600, align: Alignment.centerLeft);
        lbl(c, sx(rr.toDouble()), Offset(cols[2], y), size: 21, color: IX.ink, w: FontWeight.w600, align: Alignment.centerLeft);
      }
      para(c, 'Doubling [A] multiplies the rate by 2${sup(m)} = ${math.pow(2, m)}; doubling [B] by 2${sup(n)} = ${math.pow(2, n)}. Orders come from experiment, not from the balanced equation.', Offset(tr.left, tr.bottom + 24), tr.width, size: 18, color: IX.inkSoft);
    },
    presets: {'Zero order': {'m': 0, 'nB': 0}, 'First order': {'m': 1, 'nB': 0}, 'Second order': {'m': 2, 'nB': 0}, 'rate = k[A][B]': {'m': 1, 'nB': 1}},
  ),
  'integrated': Mode(
    title: 'Zero and first order: straight-line plots',
    subtitle: 'Chemical kinetics · Integrated rate equations',
    formula: 'zero: [R] = [R]₀ − kt     first: ln[R] = ln[R]₀ − kt',
    defaults: {'R0': 1, 'k': 0.1, 'view': 0},
    knobs: [
      const Pick('view', 'Plot', ['[R] against t', 'ln[R] against t'], ids: ['conc', 'log']),
      const Slide('R0', 'Initial concentration [R]₀', 0.2, 2, unit: 'mol/L', digits: 2, step: 0.05),
      const Slide('k', 'Rate constant k', 0.01, 0.5, unit: 'per min', digits: 2, step: 0.01),
      const Note('Units of k: mol L⁻¹ min⁻¹ for zero order, min⁻¹ for first order.'),
    ],
    readouts: (v) {
      final r0 = v.g('R0', 1), k = v.g('k', 0.1);
      return [Readout('Zero-order t½ = [R]₀/2k', (r0 / (2 * k)).toStringAsFixed(1), 'min', IX.positive), Readout('First-order t½ = 0.693/k', (0.693 / k).toStringAsFixed(1), 'min', IX.accent), Readout('Zero order ends at', (r0 / k).toStringAsFixed(1), 'min', IX.positive), Readout('Slope of straight line', '−k = −${k.toStringAsFixed(2)}', '', IX.ink)];
    },
    paint: (c, s, v) {
      final r0 = v.g('R0', 1), k = v.g('k', 0.1), log = v.i('view') == 1;
      final tEnd = math.max(r0 / k * 1.5, 3 / k);
      final pr = Rect.fromLTWH(120, 80, s.width * 0.82, s.height - 210);
      if (!log) {
        final pl = Plot(pr, 0, tEnd, 0, r0 * 1.12);
        pl.axes(c, x: 'Time t (min)', y: '[R]  (mol/L)');
        pl.curve(c, (t) => math.max(0, r0 - k * t), IX.positive, w: 5);
        pl.curve(c, (t) => r0 * math.exp(-k * t), IX.accent, w: 5);
        pl.dot(c, r0 / k, 0, IX.positive, label: 'zero order: all used at ${(r0 / k).toStringAsFixed(1)} min', align: Alignment.topLeft);
        pl.hline(c, r0 / 2, IX.muted, label: '[R]₀ / 2');
        pl.dot(c, r0 / (2 * k), r0 / 2, IX.positive);
        pl.dot(c, 0.693 / k, r0 / 2, IX.accent);
      } else {
        final lo = math.log(r0) - k * tEnd;
        final pl = Plot(pr, 0, tEnd, lo - 0.3, math.log(r0) + 0.5);
        pl.axes(c, x: 'Time t (min)', y: 'ln[R]');
        pl.curve(c, (t) => math.log(r0) - k * t, IX.accent, w: 5);
        pl.curve(c, (t) => r0 - k * t > 0.001 ? math.log(r0 - k * t) : double.nan, IX.positive, w: 4);
        pl.dot(c, 0, math.log(r0), IX.accent, label: 'intercept ln[R]₀ = ${math.log(r0).toStringAsFixed(2)}');
        lbl(c, 'first order: a straight line, slope −k', pl.p(tEnd * 0.55, math.log(r0) - k * tEnd * 0.55) + const Offset(16, -26), size: 17, color: IX.accent, w: FontWeight.w600, align: Alignment.centerLeft, halo: true);
      }
    },
    presets: {'[R] against t': {'view': 0}, 'ln[R] against t': {'view': 1}, 'Fast: k = 0.4': {'k': 0.4}, 'High [R]₀': {'R0': 2, 'k': 0.1}},
  ),
  'halflife': Mode(
    title: 'Half-life of a first-order reaction',
    subtitle: 'Chemical kinetics · Half-life',
    formula: 't½ = 0.693 / k     [R]/[R]₀ = (½)^(t / t½)',
    defaults: {'h': 30, 't': 60},
    knobs: [
      const Slide('h', 'Half-life t½', 1, 60, unit: 'min', digits: 1, step: 0.5),
      const Slide('t', 'Time t', 0, 240, unit: 'min', digits: 0, step: 1),
      Act('Run', (v) {
        v['t'] = 0;
        v['_run'] = 1;
      }),
      const Note('The half-life does not depend on how much you start with. After n half-lives, (½)ⁿ is left.'),
    ],
    tick: (v, dt) {
      v['t'] = math.min(240, v.g('t') + dt * v.g('h', 30) / 2.5);
      if (v.g('t') >= 240 || v.g('t') > v.g('h', 30) * 7) v['_run'] = 0;
    },
    readouts: (v) {
      final h = v.g('h', 30), t = v.g('t', 60), f = math.pow(0.5, t / h).toDouble();
      return [Readout('Fraction left', (100 * f).toStringAsFixed(1), '%', IX.accent), Readout('Half-lives passed', (t / h).toStringAsFixed(2)), Readout('k = 0.693 / t½', (0.693 / h).toStringAsFixed(4), 'min⁻¹', IX.positive), Readout('Time to 99 % done', (6.644 * h).toStringAsFixed(0), 'min', IX.green)];
    },
    paint: (c, s, v) {
      final h = v.g('h', 30), t = v.g('t', 60), f = math.pow(0.5, t / h).toDouble();
      final grid = Rect.fromLTWH(70, 110, s.width * 0.34, s.width * 0.34);
      panel(c, grid.inflate(22), '100 molecules');
      const n = 10;
      final cell = grid.width / n;
      for (var i = 0; i < n * n; i++) {
        final reacted = rnd(i, 901) > f;
        final at = grid.topLeft + Offset((i % n + 0.5) * cell, (i ~/ n + 0.5) * cell + 16);
        if (reacted) {
          c.drawCircle(at, cell * 0.28, fill(const Color(0xFFE3E7EF)));
          c.drawCircle(at, cell * 0.28, stroke(IX.steel, 1.4));
        } else {
          ball(c, at, cell * 0.32, IX.accent);
        }
      }
      lbl(c, '${(100 * f).round()} left of 100', Offset(grid.center.dx, grid.bottom + 60), size: 21, color: IX.accent, w: FontWeight.w700);
      final pr = Rect.fromLTWH(s.width * 0.5, 80, s.width * 0.45, s.height - 210);
      final tEnd = math.max(h * 5, 30.0);
      final pl = Plot(pr, 0, tEnd, 0, 105);
      pl.axes(c, x: 'Time (min)', y: 'Reactant left (%)', dy: 25);
      pl.curve(c, (x) => 100 * math.pow(0.5, x / h).toDouble(), IX.accent, w: 5);
      for (var j = 1; j <= 4; j++) {
        final q = 100 / math.pow(2, j);
        pl.line(c, [Offset(0, q), Offset(h * j, q), Offset(h * j, 0)], IX.muted, w: 1.4);
        lbl(c, '${j}t½', pl.p(h * j, 0) + const Offset(0, -14), size: 14, color: IX.muted, halo: true);
      }
      pl.dot(c, t.clamp(0, tEnd), 100 * f, IX.positive, label: '${(100 * f).toStringAsFixed(1)} %');
    },
    presets: {'t½ = 30 min': {'h': 30, 't': 60}, 'One half-life': {'h': 10, 't': 10}, 'Three half-lives': {'h': 10, 't': 30}, 'Benzenediazonium, 10 min': {'h': 13.9, 't': 10}},
  ),
  'arrhenius': Mode(
    title: 'Temperature, activation energy and rate',
    subtitle: 'Chemical kinetics · Arrhenius equation',
    formula: 'k = A e^(−Ea/RT)     log(k₂/k₁) = Ea/(2.303R) · (1/T₁ − 1/T₂)',
    defaults: {'T': 310, 'Ea': 53.6},
    knobs: [
      const Slide('T', 'Temperature T', 250, 500, unit: 'K', digits: 0, step: 1),
      const Slide('Ea', 'Activation energy Ea', 5, 150, unit: 'kJ/mol', digits: 1, step: 0.1),
      const Note('Ea ≈ 53.6 kJ/mol doubles the rate between 300 K and 310 K: the familiar "rate doubles for 10 °C" rule.'),
    ],
    readouts: (v) {
      final t = v.g('T', 310), ea = v.g('Ea', 53.6) * 1000;
      return [Readout('Fraction with E ≥ Ea', sx(math.exp(-ea / (_r * t))), '', IX.positive), Readout('k(T) / k(300 K)', sx(math.exp(ea / _r * (1 / 300 - 1 / t))), '× faster', IX.accent), Readout('RT', (_r * t / 1000).toStringAsFixed(2), 'kJ/mol'), Readout('Slope of ln k vs 1/T', '−${(ea / _r).toStringAsFixed(0)}', 'K', IX.green)];
    },
    paint: (c, s, v) {
      final t = v.g('T', 310), ea = v.g('Ea', 53.6);
      final rt = _r * t / 1000;
      double mb(double e, double rtt) => 2 / math.sqrt(math.pi) * math.pow(1 / rtt, 1.5) * math.sqrt(e) * math.exp(-e / rtt);
      final pr = Rect.fromLTWH(110, 80, s.width * 0.5, s.height - 210);
      final xMax = math.max(ea * 1.25, 12 * rt);
      final pl = Plot(pr, 0, xMax, 0, mb(rt / 2, _r * 250 / 1000) * 1.1);
      pl.axes(c, x: 'Kinetic energy E (kJ/mol)', y: 'Fraction of molecules', fy: (_) => '', title: 'Energy distribution of molecules');
      pl.area(c, (e) => mb(e, rt), ea, xMax, IX.positive);
      pl.curve(c, (e) => mb(e, _r * 300 / 1000), IX.muted, w: 2.5, dash: true, from: 0.01);
      pl.curve(c, (e) => mb(e, rt), IX.accent, w: 5, from: 0.01);
      pl.vline(c, ea, IX.positive, label: 'Ea = ${ea.toStringAsFixed(1)}');
      pl.legend(c, [('T = ${t.toStringAsFixed(0)} K', IX.accent), ('300 K', IX.muted)], right: true);
      lbl(c, 'shaded: molecules that can react', pl.p(ea, 0) + const Offset(12, -24), size: 16, color: IX.positive, w: FontWeight.w600, align: Alignment.centerLeft, halo: true);
      // Arrhenius plot.
      final ar = Rect.fromLTWH(s.width * 0.7, 80, s.width * 0.26, s.height * 0.5);
      final pa = Plot(ar, 2.0, 4.0, -60, 0);
      pa.axes(c, x: '1000 / T  (K⁻¹)', y: 'ln (k / A)', dx: 0.5, dy: 20, title: 'Arrhenius plot');
      pa.curve(c, (x) => -ea * 1000 / _r * x / 1000, IX.accent, w: 4);
      pa.dot(c, 1000 / t, -ea * 1000 / (_r * t), IX.accent);
      para(c, 'A straight line of slope −Ea/R. A steeper line means a reaction more sensitive to temperature.', Offset(ar.left, ar.bottom + 70), ar.width, size: 17, color: IX.inkSoft);
    },
    presets: {'Rate doubles 300 → 310 K': {'T': 310, 'Ea': 53.6}, 'Small Ea, 15 kJ/mol': {'T': 300, 'Ea': 15}, 'Hot: 400 K': {'T': 400, 'Ea': 53.6}, 'Large Ea, 100 kJ/mol': {'T': 350, 'Ea': 100}},
  ),
  'profile': Mode(
    title: 'Energy profile and a catalyst',
    subtitle: 'Chemical kinetics · Activation energy and catalysis',
    formula: 'k_cat / k = e^(ΔEa / RT)',
    defaults: {'Ea': 100, 'dH': -50, 'drop': 30, 'T': 300},
    knobs: [
      const Slide('Ea', 'Activation energy Ea', 40, 150, unit: 'kJ/mol', digits: 0, step: 1),
      const Slide('dH', 'Reaction enthalpy ΔH', -100, 100, unit: 'kJ/mol', digits: 0, step: 1),
      const Slide('drop', 'Catalyst lowers Ea by', 0, 60, unit: 'kJ/mol', digits: 0, step: 1),
      const Slide('T', 'Temperature T', 250, 500, unit: 'K', digits: 0, step: 1),
      const Note('A catalyst gives a new path with a lower hill. ΔH and the equilibrium constant do not change; both directions speed up equally.'),
    ],
    readouts: (v) {
      final ea = v.g('Ea', 100), dh = v.g('dH', -50), d = math.min(v.g('drop', 30), ea - 1), t = v.g('T', 300);
      final ratio = math.exp(d * 1000 / (_r * t));
      return [Readout('Ea (forward)', ea.toStringAsFixed(0), 'kJ/mol', IX.positive), Readout('Ea reverse', (ea - dh).toStringAsFixed(0), 'kJ/mol'), Readout('Ea with catalyst', (ea - d).toStringAsFixed(0), 'kJ/mol', IX.green), Readout('Speed-up', sx(ratio), '×', IX.accent), Readout('log₁₀ speed-up', (d * 1000 / (2.303 * _r * t)).toStringAsFixed(2))];
    },
    paint: (c, s, v) {
      final ea = v.g('Ea', 100), dh = v.g('dH', -50), d = math.min(v.g('drop', 30), ea - 1);
      final pr = Rect.fromLTWH(120, 90, s.width * 0.8, s.height - 220);
      final lo = math.min(0.0, dh) - 30, hi = math.max(ea, dh) + 40;
      final pl = Plot(pr, 0, 1, lo, hi);
      // Reactant plateau → smooth rise to the peak at the middle → smooth fall to the product plateau.
      double sm(double u) => (1 - math.cos(math.pi * u.clamp(0.0, 1.0))) / 2;
      double path(double x, double peak) => x < 0.5 ? peak * sm((x - 0.15) / 0.35) : peak + (dh - peak) * sm((x - 0.5) / 0.35);
      final g = Paint()..color = IX.grid..strokeWidth = 1;
      for (var y = (lo / 25).ceil() * 25.0; y <= hi; y += 25) {
        c.drawLine(pl.p(0, y), pl.p(1, y), g);
        lbl(c, y.toStringAsFixed(0), pl.p(0, y) - const Offset(10, 0), size: 15, align: Alignment.centerRight);
      }
      c.drawRect(pr, stroke(IX.rule, 1.5));
      c.save();
      c.translate(pr.left - 62, pr.center.dy);
      c.rotate(-math.pi / 2);
      lbl(c, 'Potential energy (kJ/mol)', Offset.zero, size: 17);
      c.restore();
      lbl(c, 'Reaction coordinate →', pr.bottomCenter + const Offset(0, 30), size: 17);
      double fwd(double x) => path(x, ea);
      double cat(double x) => path(x, ea - d);
      pl.curve(c, fwd, IX.ink, w: 5);
      if (d > 0) pl.curve(c, cat, IX.green, w: 4, dash: true);
      final xr = pl.px(0.08), xp = pl.px(0.92), xm = pl.px(0.5);
      // Ea arrow.
      IxPaint.arrow(c, Offset(xm - 40, pl.py(0)), Offset(xm - 40, pl.py(ea)), IX.positive, width: 3);
      lbl(c, 'Ea = ${ea.toStringAsFixed(0)}', Offset(xm - 52, pl.py(ea / 2)), size: 18, color: IX.positive, w: FontWeight.w700, align: Alignment.centerRight, halo: true);
      if (d > 0) {
        IxPaint.arrow(c, Offset(xm + 40, pl.py(0)), Offset(xm + 40, pl.py(ea - d)), IX.green, width: 3);
        lbl(c, 'with catalyst ${(ea - d).toStringAsFixed(0)}', Offset(xm + 52, pl.py((ea - d) / 2)), size: 18, color: IX.green, w: FontWeight.w700, align: Alignment.centerLeft, halo: true);
      }
      IxPaint.dashed(c, Offset(xr, pl.py(0)), Offset(xp + 40, pl.py(0)), Paint()..color = IX.muted..strokeWidth = 1.5);
      IxPaint.arrow(c, Offset(xp + 30, pl.py(0)), Offset(xp + 30, pl.py(dh)), IX.accent, width: 3);
      lbl(c, 'ΔH = ${nf(dh, 0)}', Offset(xp + 42, pl.py(dh / 2)), size: 18, color: IX.accent, w: FontWeight.w700, align: Alignment.centerLeft, halo: true);
      lbl(c, 'Reactants', Offset(xr + 20, pl.py(0) + 24), size: 18, color: IX.ink, w: FontWeight.w600);
      lbl(c, 'Products', Offset(xp - 20, pl.py(dh) + 24), size: 18, color: IX.ink, w: FontWeight.w600);
      lbl(c, 'activated complex', Offset(xm, pl.py(ea) - 26), size: 17, color: IX.inkSoft, w: FontWeight.w600, halo: true);
      lbl(c, dh < 0 ? 'Exothermic' : dh > 0 ? 'Endothermic' : 'Thermoneutral', pr.topRight + const Offset(-20, 28), size: 20, color: dh < 0 ? IX.positive : IX.accent, w: FontWeight.w700, align: Alignment.centerRight);
    },
    presets: {'Exothermic with catalyst': {'Ea': 100, 'dH': -50, 'drop': 30}, 'Endothermic': {'Ea': 120, 'dH': 60, 'drop': 30}, 'No catalyst': {'drop': 0}, 'Enzyme-like drop of 50': {'Ea': 110, 'dH': -40, 'drop': 50, 'T': 310}},
  ),
};
