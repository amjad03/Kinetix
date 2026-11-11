import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'em_kit.dart';
import 'kit.dart';

/// Electromagnetic induction (2nd PUC ch. 6): Faraday's law with a magnet and a coil, Lenz's
/// law, motional emf on rails, self-inductance (an RL circuit), the inductance of a solenoid
/// and the AC generator. The flux of the magnet through the coil is the exact on-axis flux of
/// a dipole through a loop, Φ = μ₀ m a² / 2(a² + d²)^3/2.
final inductionSpec = InstrumentSpec(
  id: 'induction',
  chapter: '2nd PUC Physics · Electromagnetic induction',
  modes: {'faraday': _faraday, 'collapse': _collapse, 'lenz': _lenz, 'fall': _fall, 'rod': _rod, 'rl': _rl, 'inductance': _inductance, 'generator': _generator},
);

const _mu0 = 4e-7 * math.pi;
const _mag = 2.0, _a = 0.03; // magnet moment (A m²), coil radius (m)

double _phi1(double d) => _mu0 * _mag * _a * _a / (2 * math.pow(_a * _a + d * d, 1.5));
double _dphi1(double d) => -1.5 * _mu0 * _mag * _a * _a * d / math.pow(_a * _a + d * d, 2.5);

/// Side view: a coil on the right of [o] (axis horizontal) wired to a galvanometer below.
void _coilAndMeter(Canvas c, Offset o, int turns, double needle, {String? face}) {
  const h = 70.0, len = 170.0;
  EM.coil(c, Offset(o.dx, o.dy), Offset(o.dx + len, o.dy), h, turns.clamp(4, 22), w: 4.5);
  final g = Offset(o.dx + len / 2, o.dy + 190);
  Draw.line(c, [Offset(o.dx, o.dy + h), Offset(o.dx, g.dy), Offset(g.dx - 46, g.dy)]);
  Draw.line(c, [Offset(o.dx + len, o.dy + h), Offset(o.dx + len, g.dy), Offset(g.dx + 46, g.dy)]);
  Draw.meter(c, g, 'G', r: 46, needle: needle);
  if (face != null) Draw.tag(c, face, Offset(o.dx - 10, o.dy - h - 40), color: face.startsWith('N') ? EM.north : EM.south);
}

// ── Faraday: magnet moving to and fro ──

final _faraday = ModeSpec(
  title: 'Move a magnet near a coil',
  formula: 'ε = −N dΦ/dt',
  values: {'w': 2, 'N': 100},
  animate: true,
  controls: (v) => const [Sl('w', 'Speed of the to-and-fro motion ω', 0.5, 4, unit: 'rad/s', div: 14), Sl('N', 'Turns in the coil N', 50, 500, div: 45, dp: 0)],
  presets: {'Slow': {'w': 0.5}, 'Fast': {'w': 4}, 'More turns': {'N': 400}},
  readouts: (v) {
    final w = v['w']!, n = v['N']!;
    var peak = 0.0;
    for (var k = 0; k < 400; k++) {
      final ph = k / 400 * 2 * math.pi;
      peak = math.max(peak, (n * _dphi1(0.09 + 0.05 * math.sin(ph)) * 0.05 * w * math.cos(ph)).abs());
    }
    return [Readout('Peak emf', fx(peak * 1e3, 2), 'mV', IX.accent), Readout('Largest flux NΦ', fx(n * _phi1(0.04) * 1e6, 1), 'µWb'), Readout('Emf with the magnet still', '0', 'V', IX.green)];
  },
  paint: (c, s, v, t) {
    final w = v['w']!, n = v['N']!;
    final (top, bot) = Lay.stack(s, 0.55);
    final co = Offset(top.center.dx + 60, top.center.dy - 60);
    const ppm = 2400.0;
    final d = 0.09 + 0.05 * math.sin(w * t);
    final emf = -n * _dphi1(d) * 0.05 * w * math.cos(w * t);
    final mx = co.dx - d * ppm;
    EM.magnet(c, Rect.fromCenter(center: Offset(mx - 30, co.dy), width: 200, height: 50));
    IxPaint.dashed(c, Offset(top.left + 40, co.dy), Offset(top.right - 40, co.dy), Draw.stroke(IX.muted, 1.4));
    var peak = 1e-9;
    for (var k = 0; k < 200; k++) {
      final ph = k / 200 * 2 * math.pi;
      peak = math.max(peak, (n * _dphi1(0.09 + 0.05 * math.sin(ph)) * 0.05 * w * math.cos(ph)).abs());
    }
    _coilAndMeter(c, co, (n / 25).round(), emf / peak);
    final vel = 0.05 * w * math.cos(w * t);
    if (vel.abs() > 0.004) Draw.force(c, Offset(mx - 30, co.dy - 60), Offset(mx - 30 + vel.sign * 80, co.dy - 60), IX.accent, vel > 0 ? 'towards' : 'away');
    Draw.caption(c, 'The needle moves only while the flux is changing, and swings the other way on the way back.');
    final tt = t % 12;
    final p = Plot(bot, 0, 12, -peak * 1.2e3, peak * 1.2e3, xl: 't (s)', yl: 'ε (mV)', title: 'Emf against time');
    p.frame(c);
    p.hline(c, 0, IX.muted);
    p.fn(c, (x) => -n * _dphi1(0.09 + 0.05 * math.sin(w * x)) * 0.05 * w * math.cos(w * x) * 1e3, IX.accent, w: 3.5, b: tt);
    p.dot(c, tt, emf * 1e3, IX.accent);
  },
);

// ── Collapsing field ──

final _collapse = ModeSpec(
  title: 'Emf from a field switched off',
  formula: 'ε_avg = NBA / Δt',
  values: {'N': 100, 'A': 100, 'B': 0.5, 'dt': 0.1},
  controls: (v) => const [Sl('N', 'Turns N', 10, 500, div: 49, dp: 0), Sl('A', 'Coil area A', 10, 200, unit: 'cm²', div: 19), Sl('B', 'Initial field B', 0.1, 1, unit: 'T', div: 18), Sl('dt', 'Time to switch off Δt', 0.01, 1, unit: 's', div: 99)],
  presets: {'Slow switch-off (1 s)': {'dt': 1}, 'Fast (10 ms)': {'dt': 0.01}},
  readouts: (v) {
    final nba = v['N']! * v['B']! * v['A']! * 1e-4;
    return [Readout('Average emf', fx(nba / v['dt']!, 2), 'V', IX.accent), Readout('Flux change NΔΦ', fx(nba, 3), 'Wb'), Readout('Emf × Δt (fixed)', fx(nba, 3), 'V s', IX.green)];
  },
  paint: (c, s, v, t) {
    final (left, right) = Lay.split(s, 0.46);
    final side = 120 + v['A']! * 1.2;
    final o = Offset(left.center.dx, left.center.dy + 30);
    final fld = Rect.fromCenter(center: o, width: left.width - 80, height: left.height - 220);
    EM.sheet(c, fld, gap: 50, rad: 8, alpha: 0.2 + 0.5 * v['B']!);
    final sq = Rect.fromCenter(center: o, width: side, height: side);
    for (var k = 0; k < 4; k++) {
      c.drawRect(sq.deflate(k * 3.0), Draw.stroke(PX.copper, 2.5));
    }
    Draw.text(c, 'N = ${fx(v['N']!, 0)} turns, A = ${fx(v['A']!, 0)} cm²', Offset(o.dx, sq.bottom + 30), size: 18, halo: true);
    Draw.caption(c, 'B into the screen falls to zero in Δt. The same flux change in less time gives more emf.');
    final nba = v['N']! * v['B']! * v['A']! * 1e-4;
    final p = Plot(right, 0, 1, 0, math.max(1.0, nba / 0.05) * 1.1, xl: 'Δt (s)', yl: 'ε (V)', title: 'ε = NBA/Δt');
    p.frame(c);
    p.fn(c, (x) => nba / math.max(x, 1e-3), IX.accent, w: 4, a: 0.01);
    p.dot(c, v['dt']!, nba / v['dt']!, IX.accent, label: '${fx(nba / v['dt']!, 2)} V');
  },
);

// ── Lenz's law ──

final _lenz = ModeSpec(
  title: "Lenz's law: the coil fights back",
  formula: 'induced current opposes the change in flux',
  values: {'sp': 4, 'N': 200, 'inw': 1},
  animate: true,
  controls: (v) => const [Sl('sp', 'Speed of the magnet', 1, 8, unit: 'cm/s', div: 14), Sl('N', 'Turns', 50, 500, div: 45, dp: 0), Seg('inw', 'Motion', ['Pull out', 'Push in'])],
  presets: {'Push N pole in': {'inw': 1}, 'Pull N pole out': {'inw': 0}, 'Push in fast': {'inw': 1, 'sp': 8}},
  readouts: (v) {
    final sp = v['sp']! / 100;
    var peak = 0.0;
    for (var d = 0.04; d < 0.16; d += 0.001) {
      peak = math.max(peak, (v['N']! * _dphi1(d) * sp).abs());
    }
    final inw = v['inw'] == 1;
    return [Readout('Near face of the coil', inw ? 'N (repels)' : 'S (attracts)', '', inw ? EM.north : EM.south), Readout('Largest emf', fx(peak * 1e3, 3), 'mV', IX.accent), Readout('Current seen from the magnet', inw ? 'anticlockwise' : 'clockwise', '')];
  },
  paint: (c, s, v, t) {
    final sp = v['sp']! / 100, inw = v['inw'] == 1, n = v['N']!;
    final (top, bot) = Lay.stack(s, 0.55);
    final co = Offset(top.center.dx + 80, top.center.dy - 60);
    const ppm = 2400.0;
    final span = 0.12 / sp; // seconds for one pass
    final tt = t % (span + 1.2);
    final f = (tt / span).clamp(0.0, 1.0);
    final d = inw ? 0.16 - 0.12 * f : 0.04 + 0.12 * f;
    final moving = tt < span;
    final emf = moving ? n * _dphi1(d) * sp * (inw ? -1 : 1) * -1 : 0.0;
    var peak = 1e-12;
    for (var x = 0.04; x < 0.16; x += 0.002) {
      peak = math.max(peak, (n * _dphi1(x) * sp).abs());
    }
    final mx = co.dx - d * ppm;
    EM.magnet(c, Rect.fromCenter(center: Offset(mx - 30, co.dy), width: 200, height: 50));
    IxPaint.dashed(c, Offset(top.left + 40, co.dy), Offset(top.right - 40, co.dy), Draw.stroke(IX.muted, 1.4));
    _coilAndMeter(c, co, (n / 25).round(), moving ? (inw ? 1 : -1) * (emf.abs() / peak) : 0, face: moving ? (inw ? 'N: pushes the magnet back' : 'S: pulls the magnet back') : null);
    if (moving) {
      // Induced current on the coil's near face, and the force on the magnet.
      final fo = Offset(co.dx, co.dy);
      final r = Rect.fromCenter(center: fo, width: 40, height: 140);
      c.drawArc(r, inw ? -math.pi / 2 - 0.9 : -math.pi / 2 + 0.9, inw ? 1.8 : -1.8, false, Draw.stroke(IX.amber, 4));
      Draw.force(c, Offset(mx + 50, co.dy + 60), Offset(mx + 50 + (inw ? -90 : 90), co.dy + 60), IX.green, 'force on magnet');
      Draw.force(c, Offset(mx - 30, co.dy - 60), Offset(mx - 30 + (inw ? 80 : -80), co.dy - 60), IX.accent, 'motion');
    }
    Draw.caption(c, inw ? 'Push the N pole in: the near face becomes N and repels it. You do work against it.' : 'Pull the N pole out: the near face becomes S and attracts it back.');
    final p = Plot(bot, 0, span, -peak * 1.2e3, peak * 1.2e3, xl: 't (s)', yl: 'ε (mV)', title: 'Emf during one pass');
    p.frame(c);
    p.hline(c, 0, IX.muted);
    double e(double x) {
      final ff = x / span;
      final dd = inw ? 0.16 - 0.12 * ff : 0.04 + 0.12 * ff;
      return n * _dphi1(dd) * sp * (inw ? 1 : -1) * 1e3;
    }

    p.fn(c, e, IX.accent, w: 3.5);
    if (moving) p.dot(c, tt, e(tt), IX.accent);
  },
);

// ── A magnet falling through a coil ──

final _fall = ModeSpec(
  title: 'A magnet falling through a coil',
  formula: 'ε = −dΦ/dt',
  values: {'v': 1},
  animate: true,
  controls: (v) => const [Sl('v', 'Speed of the magnet', 0.5, 3, div: 25)],
  presets: {'Slow': {'v': 0.5}, 'Fast': {'v': 3}},
  readouts: (v) {
    final sp = v['v']!;
    final peak = 3 * sp * sp * 0.5 / math.pow(1.25, 2.5) * sp / sp;
    return [Readout('Peak emf (arb.)', fx(peak, 2), '', IX.accent), Readout('Time between peaks', fx(1 / sp, 2), 'arb.'), Readout('Area under each pulse', 'same', '', IX.green)];
  },
  paint: (c, s, v, t) {
    final sp = v['v']!;
    final (left, right) = Lay.split(s, 0.34);
    double phi(double x) => 1 / math.pow(1 + sp * sp * x * x, 1.5);
    double emf(double x) => 3 * sp * sp * x / math.pow(1 + sp * sp * x * x, 2.5);
    final tt = (t % 6) - 3;
    final cx = left.center.dx, cy = left.center.dy + 30;
    // Vertical coil and a falling magnet (time 0 = magnet at the centre).
    c.drawRect(Rect.fromCenter(center: Offset(cx, cy), width: 120, height: left.height - 140), Draw.fill(PX.glassFill));
    for (var k = -6; k <= 6; k++) {
      final y = cy + k * 9.0;
      c.drawLine(Offset(cx - 80, y), Offset(cx + 80, y + 5), Draw.stroke(PX.copper, 4));
    }
    final my = cy + tt * sp * 110;
    EM.magnet(c, Rect.fromCenter(center: Offset(cx, my), width: 40, height: 110), vertical: true, nAt: 1);
    Draw.text(c, 'coil', Offset(cx + 120, cy), size: 18, color: PX.copper);
    Draw.caption(c, 'Faster fall: taller, narrower pulses.');
    final p = Plot(right, -3, 3, -2.2, 2.2, xl: 't (arb.), 0 = magnet at the centre', yl: 'Φ, ε (arb.)', title: 'Flux rises then falls; the emf flips sign at the centre');
    p.frame(c);
    p.hline(c, 0, IX.muted);
    p.fn(c, phi, EM.field, w: 3.5, label: 'Φ', labelAt: 0.25);
    p.fn(c, emf, IX.accent, w: 3.5, label: 'ε', labelAt: -1.6);
    p.vline(c, tt, IX.muted);
  },
);

// ── Rod on rails ──

const _rodMass = 0.2; // kg

final _rod = ModeSpec(
  title: 'A rod sliding on rails in a magnetic field',
  formula: 'ε = Blv,  I = ε/R,  F = BIl',
  values: {'B': 0.5, 'l': 0.5, 'v0': 4, 'R': 2, 'push': 1},
  animate: true,
  controls: (v) => const [Sl('B', 'Field B', 0.1, 2, unit: 'T', div: 19), Sl('l', 'Rod length l', 0.1, 1, unit: 'm', div: 18), Sl('v0', 'Speed v', 0, 20, unit: 'm/s', div: 40), Sl('R', 'Resistance R', 0.5, 10, unit: 'Ω', div: 19), Seg('push', 'Applied force', ['Let go', 'Keep pushing'])],
  presets: {'Keep pushing': {'push': 1}, 'Let go (rod slows)': {'push': 0}, 'Strong field': {'B': 2}},
  readouts: (v) {
    final b = v['B']!, l = v['l']!, r = v['R']!, sp = v['v0']!;
    final e = b * l * sp, i = e / r;
    return [Readout('Emf Blv', fx(e, 3), 'V', IX.accent), Readout('Current I', fx(i, 3), 'A', IX.amber), Readout('Magnetic drag BIl', fx(b * i * l, 3), 'N', IX.green), Readout('Power εI = Fv', fx(e * i, 3), 'W', IX.positive)];
  },
  paint: (c, s, v, t) {
    final b = v['B']!, l = v['l']!, r = v['R']!, v0 = v['v0']!;
    final tau = _rodMass * r / (b * b * l * l);
    final push = v['push'] == 1;
    final tt = t % 8;
    final sp = push ? v0 : v0 * math.exp(-tt / tau);
    final (left, right) = Lay.split(s, 0.55);
    final y0 = left.center.dy - l * 160, y1 = left.center.dy + l * 160 + 20;
    final x0 = left.left + 110, x1 = left.right - 30;
    EM.sheet(c, Rect.fromLTRB(x0, y0 - 40, x1, y1 + 40), gap: 56, rad: 7, alpha: 0.35);
    c.drawLine(Offset(x0, y0), Offset(x1, y0), Draw.stroke(IX.steel, 7));
    c.drawLine(Offset(x0, y1), Offset(x1, y1), Draw.stroke(IX.steel, 7));
    Draw.resistor(c, Offset(x0, y0), Offset(x0, y1), label: 'R', labelOff: const Offset(-34, 0));
    // Displayed motion is slowed so the rod stays on the rails.
    final xd = push ? ((tt * v0 * 0.045) % 1.0) : (v0 * tau * (1 - math.exp(-tt / tau)) * 0.045).clamp(0.0, 0.95);
    final xr = x0 + 90 + xd * (x1 - x0 - 140);
    c.drawLine(Offset(xr, y0 - 16), Offset(xr, y1 + 16), Draw.stroke(PX.copper, 10));
    final i = b * l * sp / r;
    if (i > 1e-4) {
      // Current flows up the rod (v to the right, B into the screen: v × B is up the screen).
      EM.midArrow(c, Offset(xr, y1 - 40), Offset(xr, y0 + 40), IX.amber, size: 18);
      EM.midArrow(c, Offset(xr - 40, y0), Offset(x0 + 40, y0), IX.amber, size: 16);
      EM.midArrow(c, Offset(x0 + 40, y1), Offset(xr - 40, y1), IX.amber, size: 16);
    }
    final fd = b * i * l;
    if (sp > 0.05) Draw.force(c, Offset(xr + 10, left.center.dy - 30), Offset(xr + 10 + 70, left.center.dy - 30), IX.accent, 'v');
    if (fd > 1e-4) Draw.force(c, Offset(xr - 10, left.center.dy + 40), Offset(xr - 10 - (30 + 60 * (fd / (b * b * l * l * 20 / r)).clamp(0.0, 1.0)), left.center.dy + 40), IX.green, 'BIl');
    Draw.dim(c, Offset(xr + 40, y0), Offset(xr + 40, y1), 'l = ${fx(l, 2)} m', off: 60);
    Draw.caption(c, push ? 'Your push balances the drag BIl and supplies the power εI.' : 'Let go: the drag slows the rod, v = v₀ e^(−t/τ), τ = mR/B²l² = ${fx(tau, 2)} s (m = 0.2 kg).');
    if (push) {
      final p = Plot(right, 0, 20, 0, b * b * l * l * 20 / r * 1.1 + 1e-3, xl: 'v (m/s)', yl: 'F (N)', title: 'Drag F = B²l²v/R grows with speed');
      p.frame(c);
      p.fn(c, (x) => b * b * l * l * x / r, IX.green, w: 4);
      p.dot(c, v0, b * b * l * l * v0 / r, IX.green, label: '${fx(fd, 3)} N');
    } else {
      final p = Plot(right, 0, 8, 0, math.max(1, v0) * 1.1, xl: 't (s)', yl: 'v (m/s)', title: 'Speed dies away exponentially');
      p.frame(c);
      p.fn(c, (x) => v0 * math.exp(-x / tau), IX.accent, w: 4);
      p.dot(c, tt, sp, IX.accent);
    }
  },
);

// ── RL circuit ──

final _rl = ModeSpec(
  title: 'Self-inductance slows the current',
  formula: 'I = (E/R)(1 − e^(−Rt/L)),  τ = L/R',
  values: {'E': 6, 'R': 10, 'L': 1, 'sw': 1},
  animate: true,
  controls: (v) => const [Sl('E', 'Battery emf E', 2, 12, unit: 'V', div: 10), Sl('R', 'Resistance R', 1, 10, unit: 'Ω', div: 18), Sl('L', 'Inductance L', 0.1, 2, unit: 'H', div: 19), Seg('sw', 'Battery', ['Disconnected', 'Connected'])],
  presets: {'Switch on': {'sw': 1}, 'Switch off': {'sw': 0}, 'Big L (slow)': {'L': 2, 'R': 1}},
  readouts: (v) {
    final tau = v['L']! / v['R']!;
    return [Readout('Time constant L/R', fx(tau * 1000, 0), 'ms', IX.accent), Readout('Final current E/R', fx(v['E']! / v['R']!, 2), 'A', IX.amber), Readout('Current after one τ', fx((v['sw'] == 1 ? 0.632 : 0.368) * v['E']! / v['R']!, 2), 'A'), Readout('Energy ½LI² (full)', fx(0.5 * v['L']! * math.pow(v['E']! / v['R']!, 2), 3), 'J', IX.green)];
  },
  paint: (c, s, v, t) {
    final e = v['E']!, r = v['R']!, l = v['L']!, on = v['sw'] == 1;
    final tau = l / r, i0 = e / r;
    final frac = (t % 5) / 4; // the plot cursor sweeps 5τ in 4 s (slowed)
    final tc = math.min(frac, 1.0) * 5 * tau;
    double cur(double x) => on ? i0 * (1 - math.exp(-x / tau)) : i0 * math.exp(-x / tau);
    final i = cur(tc);
    final (left, right) = Lay.split(s, 0.44);
    final xa = left.left + 90, xb = left.right - 70, ya = 170.0, yb = left.bottom - 200;
    Draw.line(c, [Offset(xa, (ya + yb) / 2 + 50), Offset(xa, yb), Offset(xb, yb), Offset(xb, ya), Offset(xa + 230, ya)]);
    Draw.inductor(c, Offset(xb, ya), Offset(xb, yb), label: 'L', labelOff: const Offset(44, 0));
    Draw.resistor(c, Offset(xa + 230, ya), Offset(xa + 60, ya), label: 'R');
    Draw.line(c, [Offset(xa + 60, ya), Offset(xa, ya), Offset(xa, (ya + yb) / 2 - 50)]);
    // Battery on the left branch through the switch; a closing wire carries the decay.
    Draw.cell(c, Offset(xa, (ya + yb) / 2 - 50), Offset(xa, (ya + yb) / 2 + 50), label: '${fx(e, 0)} V', labelOff: const Offset(-56, 0));
    final sw = Offset(xa, (ya + yb) / 2 + 50);
    Draw.node(c, sw);
    if (!on) {
      c.drawLine(Offset(xa, yb), Offset(xa + 50, yb - 40), Draw.stroke(IX.ink, 4));
      Draw.line(c, [Offset(xa + 120, yb), Offset(xa + 120, (ya + yb) / 2), Offset(xa + 160, (ya + yb) / 2)], IX.inkSoft);
      Draw.text(c, 'battery out; L drives I through R', Offset((xa + xb) / 2, yb + 44), size: 17, color: IX.inkSoft);
    }
    if (i > 1e-3) {
      for (final (a, b) in [(Offset(xb, ya + 40), Offset(xb, ya + 80)), (Offset(xa + 200, yb), Offset(xa + 240, yb))]) {
        EM.midArrow(c, b, a, IX.amber, size: 16 + 10 * i / i0);
      }
    }
    Draw.tag(c, 'I = ${fx(i, 2)} A', Offset((xa + xb) / 2, yb - 70), color: IX.amber);
    Draw.tag(c, 'back emf L dI/dt = ${fx((on ? 1 : -1) * l * (on ? i0 - i : i) / tau, 2)} V', Offset((xa + xb) / 2, ya + 70), color: IX.accent);
    Draw.caption(c, on ? 'The coil opposes the rise of current.' : 'The coil opposes the fall of current.');
    final p = Plot(right, 0, 5 * tau * 1000, 0, i0 * 1.15, xl: 't (ms)', yl: 'I (A)', title: on ? 'Growth: 63% of E/R after one τ' : 'Decay: 37% left after one τ');
    p.frame(c);
    p.fn(c, (x) => cur(x / 1000), IX.amber, w: 4);
    p.vline(c, tau * 1000, IX.muted, label: 'τ');
    p.dot(c, tc * 1000, i, IX.amber);
  },
);

// ── inductance of a solenoid ──

final _inductance = ModeSpec(
  title: 'Inductance of a solenoid',
  formula: 'L = μ₀N²A/l,  U = ½LI²',
  values: {'N': 500, 'r': 1.8, 'l': 50, 'I': 2},
  controls: (v) => const [Sl('N', 'Turns N', 100, 1000, div: 18, dp: 0), Sl('r', 'Radius r', 0.5, 3, unit: 'cm', div: 25), Sl('l', 'Length l', 10, 100, unit: 'cm', div: 18), Sl('I', 'Current I', 0, 5, unit: 'A', div: 20)],
  presets: {'Textbook coil': {'N': 500, 'r': 1.8, 'l': 50}, 'Double the turns': {'N': 1000}},
  readouts: (v) {
    final ll = _mu0 * v['N']! * v['N']! * math.pi * math.pow(v['r']! / 100, 2) / (v['l']! / 100);
    return [Readout('Inductance L', fx(ll * 1000, 3), 'mH', IX.accent), Readout('Energy ½LI²', fx(0.5 * ll * v['I']! * v['I']! * 1000, 3), 'mJ', IX.green), Readout('Flux linkage LI', fx(ll * v['I']! * 1000, 3), 'mWb')];
  },
  paint: (c, s, v, t) {
    final (top, bot) = Lay.stack(s, 0.46);
    final len = 220 + v['l']! * 8.5, rad = 30 + v['r']! * 30;
    final o = Offset(top.center.dx, top.center.dy + 20);
    EM.coil(c, Offset(o.dx - len / 2, o.dy), Offset(o.dx + len / 2, o.dy), rad, (v['N']! / 25).round().clamp(4, 40), w: 3.5);
    Draw.dim(c, Offset(o.dx - len / 2, o.dy + rad + 30), Offset(o.dx + len / 2, o.dy + rad + 30), 'l = ${fx(v['l']!, 0)} cm', off: 24);
    Draw.dim(c, Offset(o.dx + len / 2 + 40, o.dy - rad), Offset(o.dx + len / 2 + 40, o.dy), 'r', off: -22);
    Draw.caption(c, 'L grows as N² and as the area; it falls as the coil gets longer.');
    final ll = _mu0 * v['N']! * v['N']! * math.pi * math.pow(v['r']! / 100, 2) / (v['l']! / 100);
    final p = Plot(bot, 0, 5, 0, math.max(1e-3, 0.5 * ll * 25 * 1000) * 1.1, xl: 'I (A)', yl: 'U (mJ)', title: 'Energy stored U = ½LI²');
    p.frame(c);
    p.fn(c, (x) => 0.5 * ll * x * x * 1000, IX.green, w: 4);
    p.dot(c, v['I']!, 0.5 * ll * v['I']! * v['I']! * 1000, IX.green);
  },
);

// ── AC generator ──

final _generator = ModeSpec(
  title: 'Inside an AC generator',
  formula: 'ε = NBAω sin ωt',
  values: {'N': 100, 'B': 0.5, 'A': 100, 'f': 1, 'nrm': 1},
  animate: true,
  controls: (v) => const [Sl('N', 'Turns N', 10, 500, div: 49, dp: 0), Sl('B', 'Field B', 0.1, 1, unit: 'T', div: 18), Sl('A', 'Coil area A', 20, 500, unit: 'cm²', div: 48), Sl('f', 'Rotation rate f', 0.25, 100, unit: 'rev/s'), Seg('nrm', "Coil's normal", ['Hidden', 'Shown'])],
  presets: {'Slow turn (1 rev/s)': {'f': 1}, 'Mains (50 Hz)': {'f': 50, 'B': 0.2, 'A': 200}},
  readouts: (v) {
    final w = 2 * math.pi * v['f']!;
    final e0 = v['N']! * v['B']! * v['A']! * 1e-4 * w;
    return [Readout('Peak emf NBAω', fx(e0, 2), 'V', IX.accent), Readout('rms emf', fx(e0 / math.sqrt2, 2), 'V'), Readout('ω = 2πf', fx(w, 2), 'rad/s'), Readout('Peak flux linkage NBA', fx(v['N']! * v['B']! * v['A']! * 1e-4, 3), 'Wb')];
  },
  paint: (c, s, v, t) {
    final f = v['f']!;
    final w = 2 * math.pi * f;
    final e0 = v['N']! * v['B']! * v['A']! * 1e-4 * w;
    final fs = f <= 1 ? f : 0.5; // shown rotation rate
    final th = 2 * math.pi * fs * t; // angle of the normal from B
    final (left, right) = Lay.split(s, 0.5);
    final o = Offset(left.center.dx, left.center.dy - 30);
    // Pole pieces.
    Draw.block(c, Rect.fromLTRB(left.left + 30, o.dy - 170, left.left + 130, o.dy + 170), EM.north, label: 'N', radius: 10);
    Draw.block(c, Rect.fromLTRB(left.right - 130, o.dy - 170, left.right - 30, o.dy + 170), EM.south, label: 'S', radius: 10);
    for (var k = -3; k <= 3; k++) {
      EM.flowLine(c, [Offset(left.left + 140, o.dy + k * 46), Offset(left.right - 140, o.dy + k * 46)], EM.field.withValues(alpha: 0.35), every: 250);
    }
    // Coil turning about a vertical axis; normal n = (cos θ, 0, sin θ).
    const wc = 200.0, hc = 230.0;
    final half = wc / 2 * math.sin(th);
    final front = math.cos(th) > 0;
    final rect = Rect.fromLTRB(o.dx - half.abs(), o.dy - hc / 2, o.dx + half.abs(), o.dy + hc / 2);
    c.drawRect(rect, Draw.fill(PX.copper.withValues(alpha: front ? 0.10 : 0.05)));
    c.drawRect(rect, Draw.stroke(PX.copper, 6));
    c.drawLine(Offset(o.dx, o.dy - hc / 2 - 40), Offset(o.dx, o.dy + hc / 2 + 40), Draw.stroke(IX.inkSoft, 3));
    if (v['nrm'] == 1) {
      final tip = o + Offset(math.cos(th) * 120 + math.sin(th) * 40, -math.sin(th) * 30);
      Draw.force(c, o, tip, IX.accent, 'n');
    }
    // Slip rings and brushes to a lamp.
    final ry = o.dy + hc / 2 + 70;
    for (final dy in [0.0, 30.0]) {
      c.drawOval(Rect.fromCenter(center: Offset(o.dx, ry + dy), width: 60, height: 18), Draw.stroke(IX.steel, 5));
    }
    final e = e0 * math.sin(th);
    Draw.line(c, [Offset(o.dx + 30, ry), Offset(o.dx + 150, ry), Offset(o.dx + 150, ry + 60)]);
    Draw.line(c, [Offset(o.dx - 30, ry + 30), Offset(o.dx - 150, ry + 30), Offset(o.dx - 150, ry + 60)]);
    Draw.meter(c, Offset(o.dx, ry + 110), 'V', r: 36, needle: e / e0);
    Draw.line(c, [Offset(o.dx - 150, ry + 60), Offset(o.dx - 150, ry + 110), Offset(o.dx - 36, ry + 110)]);
    Draw.line(c, [Offset(o.dx + 150, ry + 60), Offset(o.dx + 150, ry + 110), Offset(o.dx + 36, ry + 110)]);
    Draw.caption(c, f > 1 ? 'Rotation shown slowed. Emf peaks when the coil\'s plane is along B.' : 'Emf peaks when the coil\'s plane is along B: Φ = 0 but changing fastest.');
    final period = 1 / f;
    final unitMs = period < 0.5;
    final k = unitMs ? 1000.0 : 1.0;
    final p = Plot(right, 0, 2 * period * k, -e0 * 1.2, e0 * 1.2, xl: unitMs ? 't (ms)' : 't (s)', yl: 'ε (V)', title: 'ε = NBAω sin ωt, Φ = NBA cos ωt');
    p.frame(c);
    p.hline(c, 0, IX.muted);
    p.fn(c, (x) => e0 * math.cos(w * x / k), EM.field.withValues(alpha: 0.6), w: 2.5, dash: true, label: 'Φ (scaled)', labelAt: 0.05 * period * k);
    p.fn(c, (x) => e0 * math.sin(w * x / k), IX.accent, w: 4, label: 'ε', labelAt: 0.25 * period * k);
    final ph = (th / (2 * math.pi)) % 2;
    p.dot(c, ph * period * k, e, IX.accent);
  },
);
