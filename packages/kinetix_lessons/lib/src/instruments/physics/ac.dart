import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'em_kit.dart';
import 'kit.dart';

/// Alternating current (2nd PUC ch. 7): phasors and rms in a resistor, reactance of L and C,
/// series LCR resonance, power factor and the ideal transformer.
final acSpec = InstrumentSpec(
  id: 'ac',
  chapter: '2nd PUC Physics · Alternating current',
  modes: {'resistor': _resistor, 'reactive': _reactive, 'lcr': _lcr, 'power': _power, 'transformer': _transformer},
);

/// Phasor circle on the left of [left] and the matching waveforms below it.
void _phasorPanel(Canvas c, Rect left, double wt, List<(double phase, double amp, Color col, String label)> items) {
  final o = Offset(left.center.dx, left.top + 250);
  EM.phasors(c, o, 170, [for (final (ph, a, col, lab) in items) (wt + ph, a, col, lab)]);
  Draw.text(c, 'ωt = ${fx(deg(wt) % 360, 0)}°', Offset(o.dx, o.dy + 210), size: 17, color: IX.inkSoft);
}

// ── resistor ──

final _resistor = ModeSpec(
  title: 'AC through a resistor: phasors and rms',
  formula: 'V_rms = V_m/√2,  P_avg = V_rms²/R',
  values: {'Vm': 310, 'R': 50, 'f': 50, 'pw': 0},
  animate: true,
  controls: (v) => const [Sl('Vm', 'Peak voltage V_m', 50, 350, unit: 'V', div: 30), Sl('R', 'Resistance R', 10, 1000, unit: 'Ω', div: 99), Sl('f', 'Frequency f', 25, 100, unit: 'Hz', div: 15), Seg('pw', 'Graph', ['v and i', 'Power p = v²/R'])],
  presets: {'Mains 230 V rms': {'Vm': 325}, 'Power curve': {'pw': 1}},
  readouts: (v) {
    final vm = v['Vm']!, r = v['R']!;
    return [Readout('V_rms', fx(vm / math.sqrt2, 1), 'V', IX.accent), Readout('I_rms', fx(vm / r / math.sqrt2, 3), 'A', IX.positive), Readout('Average power', fx(vm * vm / (2 * r), 1), 'W', IX.amber), Readout('Peak power', fx(vm * vm / r, 1), 'W')];
  },
  paint: (c, s, v, t) {
    final vm = v['Vm']!, r = v['R']!, f = v['f']!;
    final (left, right) = Lay.split(s, 0.4);
    final wt = 2 * math.pi * 0.25 * t; // shown slowed: a quarter turn a second
    _phasorPanel(c, left, wt, [(0, 0.95, IX.accent, 'V'), (0, 0.6, IX.positive, 'I')]);
    Draw.caption(c, 'In a resistor v and i are in phase: the phasors point the same way.');
    final tp = 1000 / f;
    if (v['pw'] == 1) {
      final pm = vm * vm / r;
      final p = Plot(right, 0, 2 * tp, 0, pm * 1.15, xl: 't (ms)', yl: 'p (W)', title: 'Power pulses at 2f; its average is half the peak');
      p.frame(c);
      p.area(c, (x) => pm * math.pow(math.sin(2 * math.pi * x / tp), 2), 0, 2 * tp, IX.amber);
      p.fn(c, (x) => pm * math.pow(math.sin(2 * math.pi * x / tp), 2), IX.amber, w: 4);
      p.hline(c, pm / 2, IX.inkSoft, label: 'P_avg = ${fx(pm / 2, 0)} W');
    } else {
      final p = Plot(right, 0, 2 * tp, -vm * 1.15, vm * 1.15, xl: 't (ms)', yl: 'v (V), i (scaled)', title: 'v and i rise and fall together');
      p.frame(c);
      p.hline(c, 0, IX.muted);
      p.fn(c, (x) => vm * math.sin(2 * math.pi * x / tp), IX.accent, w: 4, label: 'v', labelAt: tp * 0.25);
      p.fn(c, (x) => 0.6 * vm * math.sin(2 * math.pi * x / tp), IX.positive, w: 3, label: 'i', labelAt: tp * 1.2);
      p.hline(c, vm / math.sqrt2, IX.green, label: 'V_rms = ${fx(vm / math.sqrt2, 0)} V');
    }
  },
);

// ── inductor and capacitor ──

final _reactive = ModeSpec(
  title: 'Current and voltage in an inductor and a capacitor',
  formula: 'X_L = ωL,  X_C = 1/ωC',
  values: {'el': 0, 'f': 50, 'Lm': 100, 'Cu': 100, 'Vr': 220},
  animate: true,
  controls: (v) => const [Seg('el', 'Element', ['Inductor', 'Capacitor']), Sl('f', 'Frequency f', 1, 500, unit: 'Hz', div: 499, dp: 0), Sl('Lm', 'Inductance L', 10, 500, unit: 'mH', div: 49), Sl('Cu', 'Capacitance C', 10, 500, unit: 'µF', div: 49), Sl('Vr', 'rms voltage', 50, 250, unit: 'V', div: 20)],
  presets: {'Inductor at 50 Hz': {'el': 0}, 'Capacitor at 50 Hz': {'el': 1}, 'Where X_L = X_C': {'Lm': 44, 'Cu': 60, 'f': 98}},
  readouts: (v) {
    final w = 2 * math.pi * v['f']!;
    final xl = w * v['Lm']! / 1000, xc = 1 / (w * v['Cu']! * 1e-6);
    final x = v['el'] == 0 ? xl : xc;
    return [Readout('X_L = ωL', fx(xl, 1), 'Ω', IX.accent), Readout('X_C = 1/ωC', fx(xc, 1), 'Ω', IX.positive), Readout('I_rms = V/X', fx(v['Vr']! / x, 3), 'A', IX.amber), Readout('Average power', '0', 'W', IX.green)];
  },
  paint: (c, s, v, t) {
    final ind = v['el'] == 0;
    final (left, right) = Lay.split(s, 0.4);
    final wt = 2 * math.pi * 0.25 * t;
    _phasorPanel(c, left, wt, [(0, 0.95, IX.accent, 'V'), (ind ? -math.pi / 2 : math.pi / 2, 0.6, IX.amber, 'I')]);
    Draw.caption(c, ind ? 'Inductor: I lags V by 90°.' : 'Capacitor: I leads V by 90°.');
    final (r1, r2) = (Rect.fromLTRB(right.left, right.top, right.right, right.center.dy - 6), Rect.fromLTRB(right.left, right.center.dy + 6, right.right, right.bottom));
    final p = Plot(r1, 0, 2, -1.2, 1.2, xl: 't (periods)', yl: 'scaled', title: ind ? 'v (blue) and i (amber): i peaks a quarter period later' : 'i peaks a quarter period before v');
    p.frame(c);
    p.hline(c, 0, IX.muted);
    p.fn(c, (x) => math.sin(2 * math.pi * x), IX.accent, w: 3.5);
    p.fn(c, (x) => 0.6 * math.sin(2 * math.pi * x + (ind ? -math.pi / 2 : math.pi / 2)), IX.amber, w: 3.5);
    final l = v['Lm']! / 1000, cc = v['Cu']! * 1e-6;
    final q = Plot(r2, 0, 500, 0, 200, xl: 'f (Hz)', yl: 'X (Ω)', title: 'X_L rises with f, X_C falls');
    q.frame(c);
    q.fn(c, (x) => 2 * math.pi * x * l, IX.accent, w: 3.5, label: 'X_L', labelAt: 420);
    q.fn(c, (x) => 1 / (2 * math.pi * math.max(x, 0.5) * cc), IX.positive, w: 3.5, label: 'X_C', labelAt: 60, a: 1);
    q.vline(c, v['f']!, IX.muted);
  },
);

// ── LCR resonance ──

double _lcrI(double f, double l, double c, double r, double vr) {
  final w = 2 * math.pi * f;
  return vr / math.sqrt(r * r + math.pow(w * l - 1 / (w * c), 2));
}

final _lcr = ModeSpec(
  title: 'Tune an LCR circuit to resonance',
  formula: 'Z = √(R² + (X_L − X_C)²),  f₀ = 1/2π√(LC)',
  values: {'Lm': 200, 'Cu': 20, 'R': 20, 'f': 60, 'Vr': 220},
  controls: (v) => const [Sl('f', 'Supply frequency f', 5, 200, unit: 'Hz', div: 195, dp: 0), Sl('Lm', 'Inductance L', 10, 500, unit: 'mH', div: 49), Sl('Cu', 'Capacitance C', 1, 100, unit: 'µF', div: 99), Sl('R', 'Resistance R', 5, 100, unit: 'Ω', div: 19)],
  presets: {'At resonance': {'f': 80}, 'Sharp (R = 5 Ω)': {'R': 5}, 'Broad (R = 100 Ω)': {'R': 100}},
  drag: (v, p, s, start) {
    final (_, right) = Lay.split(s, 0.4);
    final plot = Plot(right, 5, 200, 0, 1);
    if (!plot.r.inflate(30).contains(p)) return false;
    v['f'] = plot.xAt(p.dx).clamp(5, 200).roundToDouble();
    return true;
  },
  readouts: (v) {
    final l = v['Lm']! / 1000, cc = v['Cu']! * 1e-6, r = v['R']!;
    final f0 = 1 / (2 * math.pi * math.sqrt(l * cc));
    final i = _lcrI(v['f']!, l, cc, r, v['Vr']!);
    return [Readout('Resonant f₀', fx(f0, 1), 'Hz', IX.green), Readout('Current I_rms', fx(i, 2), 'A', IX.accent), Readout('Impedance Z', fx(v['Vr']! / i, 1), 'Ω'), Readout('Quality factor Q', fx(2 * math.pi * f0 * l / r, 1), '')];
  },
  paint: (c, s, v, t) {
    final l = v['Lm']! / 1000, cc = v['Cu']! * 1e-6, r = v['R']!, f = v['f']!;
    final w = 2 * math.pi * f;
    final xl = w * l, xc = 1 / (w * cc);
    final (left, right) = Lay.split(s, 0.4);
    // Impedance triangle as phasors: V_R along I, V_L up, V_C down.
    final i = _lcrI(f, l, cc, r, v['Vr']!);
    final o = Offset(left.left + 140, left.center.dy);
    final sc = 260 / math.max(r, math.max(xl, xc)).clamp(1, double.infinity);
    Draw.force(c, o, o + Offset(r * sc, 0), IX.inkSoft, 'R');
    Draw.force(c, o + Offset(r * sc, 0), o + Offset(r * sc, -xl * sc), IX.accent, 'X_L');
    Draw.force(c, o + Offset(r * sc + 34, -xl * sc), o + Offset(r * sc + 34, -(xl - xc) * sc), IX.positive, 'X_C');
    IxPaint.arrow(c, o, o + Offset(r * sc, -(xl - xc) * sc), IX.green, width: 5, head: 18);
    Draw.text(c, 'Z', Offset.lerp(o, o + Offset(r * sc, -(xl - xc) * sc), 0.5)! + const Offset(-24, -10), size: 20, color: IX.green, halo: true);
    Draw.text(c, 'phase φ = ${fx(deg(math.atan2(xl - xc, r)), 1)}°', Offset(left.center.dx, left.bottom - 60), size: 19, color: IX.green);
    Draw.caption(c, 'Drag along the graph to tune. At f₀, X_L = X_C and Z = R.');
    final f0 = 1 / (2 * math.pi * math.sqrt(l * cc));
    final imax = v['Vr']! / r;
    final p = Plot(right, 5, 200, 0, imax * 1.12, xl: 'f (Hz)', yl: 'I (A)', title: 'Resonance curve, 220 V rms supply');
    p.frame(c);
    p.fn(c, (x) => _lcrI(x, l, cc, r, v['Vr']!), IX.accent, w: 4);
    p.vline(c, f0, IX.green, label: 'f₀');
    p.dot(c, f, i, IX.amber, rr: 11);
  },
);

// ── power factor ──

final _power = ModeSpec(
  title: 'Power factor: where the power goes',
  formula: 'P = V_rms I_rms cos φ',
  values: {'phi': 60, 'Vr': 220, 'Ir': 5},
  controls: (v) => const [Sl('phi', 'Phase difference φ', -90, 90, unit: '°', div: 36), Sl('Vr', 'rms voltage', 50, 250, unit: 'V', div: 20), Sl('Ir', 'rms current', 0.5, 10, unit: 'A', div: 19)],
  presets: {'Resistor (φ = 0)': {'phi': 0}, 'φ = 60°': {'phi': 60}, 'Pure L (φ = 90°)': {'phi': 90}},
  readouts: (v) {
    final cf = math.cos(rad(v['phi']!));
    return [Readout('Power factor cos φ', fx(cf, 3), '', IX.green), Readout('Average power', fx(v['Vr']! * v['Ir']! * cf, 0), 'W', IX.amber), Readout('Apparent power V I', fx(v['Vr']! * v['Ir']!, 0), 'V A')];
  },
  paint: (c, s, v, t) {
    final ph = rad(v['phi']!);
    final vm = v['Vr']! * math.sqrt2, im = v['Ir']! * math.sqrt2;
    final (left, right) = Lay.split(s, 0.36);
    final o = Offset(left.center.dx, left.top + 280);
    EM.phasors(c, o, 160, [(math.pi / 3, 0.95, IX.accent, 'V'), (math.pi / 3 - ph, 0.65, IX.positive, 'I')]);
    Draw.caption(c, 'Positive φ: current lags. The shaded parts below zero go back to the source.');
    final pm = vm * im;
    final p = Plot(right, 0, 2, -pm * 0.75, pm * 1.1, xl: 't (periods)', yl: 'p = vi (W)', title: 'Instantaneous power and its average');
    p.frame(c);
    p.hline(c, 0, IX.muted);
    double pw(double x) => vm * math.sin(2 * math.pi * x) * im * math.sin(2 * math.pi * x - ph);
    p.area(c, pw, 0, 2, IX.amber);
    p.fn(c, (x) => vm * math.sin(2 * math.pi * x) * pm * 0.45 / vm, IX.accent, w: 2.5, dash: true, label: 'v', labelAt: 0.22);
    p.fn(c, (x) => im * math.sin(2 * math.pi * x - ph) * pm * 0.3 / im, IX.positive, w: 2.5, dash: true, label: 'i', labelAt: 0.75);
    p.fn(c, pw, IX.amber, w: 4);
    p.hline(c, v['Vr']! * v['Ir']! * math.cos(ph), IX.green, label: 'P_avg');
  },
);

// ── transformer ──

final _transformer = ModeSpec(
  title: 'An ideal transformer',
  formula: 'V_s/V_p = N_s/N_p,  V_p I_p = V_s I_s',
  values: {'Np': 500, 'Ns': 1000, 'Vp': 220, 'RL': 100},
  animate: true,
  controls: (v) => const [Sl('Np', 'Primary turns N_p', 100, 3000, div: 29, dp: 0), Sl('Ns', 'Secondary turns N_s', 10, 3000, div: 299, dp: 0), Sl('Vp', 'Primary voltage V_p', 50, 440, unit: 'V', div: 39), Sl('RL', 'Load R', 1, 200, unit: 'Ω', div: 199)],
  presets: {'Step up ×2': {'Np': 500, 'Ns': 1000}, 'Step down 230 → 11.5 V': {'Np': 3000, 'Ns': 150, 'Vp': 230, 'RL': 5.75}},
  readouts: (v) {
    final vs = v['Vp']! * v['Ns']! / v['Np']!, is_ = vs / v['RL']!;
    return [Readout('Secondary voltage V_s', fx(vs, 1), 'V', IX.accent), Readout('Secondary current I_s', fx(is_, 3), 'A', IX.positive), Readout('Primary current I_p', fx(vs * is_ / v['Vp']!, 3), 'A', IX.amber), Readout('Power', fx(vs * is_, 1), 'W', IX.green)];
  },
  paint: (c, s, v, t) {
    final (top, bot) = Lay.stack(s, 0.6);
    final o = Offset(top.center.dx, top.center.dy + 10);
    final core = Rect.fromCenter(center: o, width: 520, height: 360);
    c.drawRRect(RRect.fromRectAndRadius(core, const Radius.circular(10)), Draw.fill(EM.core));
    c.drawRRect(RRect.fromRectAndRadius(core.deflate(70), const Radius.circular(4)), Draw.fill(Colors.white));
    // Flux circulating in the core (animated dashes).
    final ph = (t * 60) % 40;
    final path = Path()..addRRect(RRect.fromRectAndRadius(core.deflate(35), const Radius.circular(20)));
    for (final m in path.computeMetrics()) {
      for (var d = ph; d < m.length; d += 40) {
        c.drawPath(m.extractPath(d, d + 18), Draw.stroke(EM.field, 4));
      }
    }
    void winding(double x, double n, String lab) {
      final k = (n / 150).round().clamp(3, 20);
      for (var i = 0; i < k; i++) {
        final y = core.top + 80 + i * (core.height - 160) / math.max(1, k - 1);
        c.drawLine(Offset(x - 50, y), Offset(x + 50, y + 8), Draw.stroke(PX.copper, 5));
      }
      Draw.text(c, lab, Offset(x, core.bottom + 30), size: 19, color: PX.copper);
    }

    winding(core.left + 35, v['Np']!, 'N_p = ${fx(v['Np']!, 0)}');
    winding(core.right - 35, v['Ns']!, 'N_s = ${fx(v['Ns']!, 0)}');
    final vs = v['Vp']! * v['Ns']! / v['Np']!;
    Draw.tag(c, 'V_p = ${fx(v['Vp']!, 0)} V', Offset(core.left - 120, o.dy), color: IX.accent);
    Draw.tag(c, 'V_s = ${fx(vs, 1)} V', Offset(core.right + 120, o.dy), color: IX.accent);
    Draw.caption(c, vs > v['Vp']! ? 'Step-up: more voltage, less current.' : 'Step-down: less voltage, more current.');
    final is_ = vs / v['RL']!, ip = vs * is_ / v['Vp']!;
    Draw.bars(c, bot, [('V_p', v['Vp']!, IX.accent), ('V_s', vs, IX.accent), ('I_p × 100', ip * 100, IX.amber), ('I_s × 100', is_ * 100, IX.amber)], title: 'Voltages (V) and currents (× 100 A)');
  },
);
