import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'kit.dart';

/// Oscillations (1st PUC ch. 13): periodic motion, SHM as the shadow of circular motion, a
/// mass on a spring with x, v, a and energy, and the simple pendulum (solved exactly).
final oscillatorSpec = InstrumentSpec(
  id: 'oscillator',
  chapter: '1st PUC Physics · Oscillations',
  modes: {'periodic': _periodic, 'reference': _reference, 'spring': _spring, 'energy': _energy, 'pendulum': _pendulum},
);

/// Waves (1st PUC ch. 14) and the Doppler effect (ch. 16).
final wavesSpec = InstrumentSpec(
  id: 'waves',
  chapter: '1st PUC Physics · Waves',
  modes: {'types': _types, 'travelling': _travelling, 'string': _stringSpeed, 'standing': _standing, 'beats': _beats, 'doppler': _doppler},
);

// ───────────────────────────── oscillations ─────────────────────────────

const _motions = ['Going round', 'Swing', 'Bouncing ball', 'Dying swing'];

final _periodic = ModeSpec(
  title: 'Which motions repeat?',
  formula: 'ν = 1/T,  ω = 2π/T',
  values: {'mo': 1, 'T': 2, 'b': 0.3},
  animate: true,
  controls: (v) => const [Seg('mo', 'Motion', _motions), Sl('T', 'Period T', 0.5, 5, unit: 's', div: 45), Sl('b', 'Harmonic strength b', 0, 1, div: 20)],
  presets: {'Swing': {'mo': 1}, 'Going round': {'mo': 0}, 'Bouncing ball': {'mo': 2}, 'Dying swing': {'mo': 3}},
  readouts: (v) {
    final mo = v['mo']!.round();
    return [
      Readout('Frequency 1/T', fx(1 / v['T']!), 'Hz', IX.accent),
      Readout('Angular frequency', fx(2 * math.pi / v['T']!), 'rad/s'),
      Readout('Periodic?', mo == 3 ? 'No: it never repeats exactly' : 'Yes', ''),
      Readout('Oscillatory?', mo == 0 ? 'No (goes round)' : (mo == 2 ? 'Repeats, not SHM' : 'Yes'), ''),
    ];
  },
  paint: (c, s, v, t) {
    final mo = v['mo']!.round(), tp = v['T']!, b = v['b']!;
    final top = Rect.fromLTWH(0, 0, s.width, s.height * 0.44);
    final ph = t / tp;
    final cx = top.center.dx, cy = top.center.dy + 10;
    switch (mo) {
      case 0:
        c.drawCircle(Offset(cx, cy), 120, Draw.stroke(IX.rule, 2));
        Draw.ball(c, Offset(cx, cy) + Offset(math.cos(2 * math.pi * ph), -math.sin(2 * math.pi * ph)) * 120, 18, IX.accent);
      case 1 || 3:
        final amp = mo == 1 ? 0.5 : 0.5 * math.exp(-0.35 * ph);
        final a = amp * math.sin(2 * math.pi * ph);
        final piv = Offset(cx, 40);
        c.drawLine(piv - const Offset(80, 0), piv + const Offset(80, 0), Draw.stroke(IX.inkSoft, 4));
        final bob = piv + Offset(math.sin(a), math.cos(a)) * 250;
        c.drawLine(piv, bob, Draw.stroke(IX.inkSoft, 2.5));
        Draw.ball(c, bob, 20, IX.accent);
      default:
        final h = 1 - math.pow(2 * (ph % 1) - 1, 2).toDouble();
        Draw.ground(c, Offset(cx - 160, top.bottom - 20), Offset(cx + 160, top.bottom - 20));
        Draw.ball(c, Offset(cx, top.bottom - 42 - h * 230), 22, IX.positive);
    }
    final p = Plot(Rect.fromLTRB(26, top.bottom, s.width - 26, s.height - 22), 0, 10, -1.6, 1.6, xl: 't (s)', yl: 'x', title: mo == 1 ? 'x = sin(2πt/T) + b sin(4πt/T): same period, new shape' : 'Displacement against time');
    p.frame(c);
    double f(double x) {
      final q = x / tp;
      return switch (mo) {
        0 => math.cos(2 * math.pi * q),
        1 => math.sin(2 * math.pi * q) + b * math.sin(4 * math.pi * q),
        2 => 1.5 * (1 - math.pow(2 * (q % 1) - 1, 2).toDouble()),
        _ => math.exp(-0.35 * q) * math.sin(2 * math.pi * q),
      };
    }
    p.fn(c, f, IX.accent, w: 4);
    if (mo != 3) {
      p.vline(c, tp, IX.muted, label: 'T');
      p.vline(c, 2 * tp, IX.muted, label: '2T');
    }
    p.vline(c, t % 10, IX.positive);
  },
);

final _reference = ModeSpec(
  title: 'SHM is a shadow of circular motion',
  formula: 'x = A cos(ωt + φ)',
  values: {'A': 3, 'T': 4, 'phi': 0, 'circ': 1},
  animate: true,
  controls: (v) => const [Sl('A', 'Amplitude A', 0.5, 4, unit: 'cm', div: 35), Sl('T', 'Period T', 1, 6, unit: 's', div: 50), Sl('phi', 'Phase constant φ', 0, 360, unit: '°', div: 24), Seg('circ', 'Reference circle', ['Hidden', 'Shown'])],
  presets: {'φ = 0': {'phi': 0}, 'φ = 90°': {'phi': 90}, 'Fast (T = 1.5 s)': {'T': 1.5}},
  readouts: (v) {
    final w = 2 * math.pi / v['T']!;
    return [Readout('ω = 2π/T', fx(w), 'rad/s', IX.accent), Readout('Frequency', fx(1 / v['T']!), 'Hz'), Readout('x(0) = A cos φ', fx(v['A']! * math.cos(rad(v['phi']!))), 'cm', IX.positive), Readout('Maximum speed Aω', fx(v['A']! * w), 'cm/s')];
  },
  paint: (c, s, v, t) {
    final a = v['A']!, w = 2 * math.pi / v['T']!, phi = rad(v['phi']!);
    final left = Rect.fromLTWH(0, 0, s.width * 0.4, s.height);
    final o = Offset(left.center.dx, left.center.dy - 40), r = a * 60;
    final th = w * t + phi;
    final pt = o + Offset(math.cos(th), -math.sin(th)) * r;
    if (v['circ'] == 1) {
      c.drawCircle(o, r, Draw.stroke(IX.rule, 2.5));
      c.drawLine(o, pt, Draw.stroke(IX.inkSoft, 2));
      Draw.ball(c, pt, 12, IX.inkSoft);
    }
    // Shadow on the horizontal diameter (x = A cos θ) drawn on a track below.
    final ty = o.dy + r + 80;
    c.drawLine(Offset(o.dx - r - 30, ty), Offset(o.dx + r + 30, ty), Draw.stroke(IX.rule, 6));
    IxPaint.dashed(c, pt, Offset(pt.dx, ty), Draw.stroke(IX.muted, 2));
    Draw.ball(c, Offset(pt.dx, ty), 16, IX.accent);
    Draw.text(c, 'x = ${fx(a * math.cos(th), 2)} cm', Offset(o.dx, ty + 40), size: 19, color: IX.accent);
    final p = Plot(Rect.fromLTRB(left.right, 26, s.width - 26, s.height - 26), 0, 12, -4.5, 4.5, xl: 't (s)', yl: 'x (cm)', title: 'x(t) = A cos(ωt + φ)');
    p.frame(c);
    p.fn(c, (x) => a * math.cos(w * x + phi), IX.accent, w: 4);
    p.dot(c, t % 12, a * math.cos(w * (t % 12) + phi), IX.accent);
  },
);

final _spring = ModeSpec(
  title: 'Restoring force of a spring',
  formula: 'F = −kx,  ω = √(k/m)',
  values: {'k': 40, 'm': 1, 'A': 0.2},
  animate: true,
  controls: (v) => const [Sl('k', 'Spring constant k', 10, 500, unit: 'N/m', div: 49), Sl('m', 'Mass m', 0.1, 5, unit: 'kg', div: 49), Sl('A', 'Amplitude A', 0.02, 0.3, unit: 'm', div: 28)],
  presets: {'Soft spring': {'k': 20, 'm': 1}, 'Stiff spring': {'k': 400, 'm': 1}, 'Heavy block': {'k': 40, 'm': 5}},
  readouts: (v) {
    final w = math.sqrt(v['k']! / v['m']!);
    return [Readout('ω = √(k/m)', fx(w), 'rad/s', IX.accent), Readout('Period 2π√(m/k)', fx(2 * math.pi / w), 's'), Readout('Maximum speed Aω', fx(v['A']! * w), 'm/s', IX.green), Readout('Maximum acceleration Aω²', fx(v['A']! * w * w), 'm/s²', IX.positive)];
  },
  paint: (c, s, v, t) {
    final k = v['k']!, m = v['m']!, a = v['A']!;
    final w = math.sqrt(k / m);
    final x = a * math.cos(w * t), vel = -a * w * math.sin(w * t);
    const wall = 70.0, gy = 230.0, ppm = 900.0;
    final eq = wall + 420;
    Draw.ground(c, Offset(wall, gy), Offset(s.width - 40, gy));
    Draw.ground(c, Offset(wall, gy), Offset(wall, gy - 150), n: const Offset(-1, 0));
    final bx = eq + x * ppm;
    Draw.spring(c, Offset(wall, gy - 50), Offset(bx - 60, gy - 50), coils: 14, width: 30);
    Draw.block(c, Rect.fromCenter(center: Offset(bx, gy - 50), width: 120, height: 100), IX.accent, label: '${fx(m, 1)} kg');
    IxPaint.dashed(c, Offset(eq, gy - 140), Offset(eq, gy + 10), Draw.stroke(IX.muted, 2));
    Draw.text(c, 'x = 0', Offset(eq, gy + 30), size: 16, color: IX.inkSoft);
    if (vel.abs() > 0.01) Draw.force(c, Offset(bx, gy - 125), Offset(bx + vel * 120, gy - 125), IX.green, 'v', w: 4);
    if (x.abs() > 0.002) Draw.force(c, Offset(bx, gy - 50), Offset(bx - x * k * 2.2, gy - 50), IX.positive, 'F = −kx', w: 4);
    final tp = 2 * math.pi / w;
    final p = Plot(Rect.fromLTRB(26, 300, s.width - 26, s.height - 22), 0, 3 * tp, -1.15, 1.15, xl: 't (s)', yl: 'x, v, a (scaled)', title: 'x, v and a: v leads x by 90°, a is opposite to x');
    p.frame(c);
    p.fn(c, (q) => math.cos(w * q), IX.accent, w: 4);
    p.fn(c, (q) => -math.sin(w * q), IX.green, w: 3.5);
    p.fn(c, (q) => -math.cos(w * q), IX.positive, w: 3, dash: true);
    p.legend(c, [('x / A', IX.accent), ('v / Aω', IX.green), ('a / Aω²', IX.positive)]);
    p.vline(c, t % (3 * tp), IX.muted);
  },
);

final _energy = ModeSpec(
  title: 'Energy in simple harmonic motion',
  formula: 'K + U = ½kA²',
  values: {'k': 100, 'A': 0.1, 'm': 1, 'damp': 0},
  animate: true,
  controls: (v) => const [Sl('k', 'Spring constant k', 10, 500, unit: 'N/m', div: 49), Sl('A', 'Amplitude A', 0.05, 0.3, unit: 'm', div: 25), Sl('m', 'Mass m', 0.5, 5, unit: 'kg', div: 9), Seg('damp', 'Damping', ['Off', 'On'])],
  presets: {'Undamped': {'damp': 0}, 'Damped': {'damp': 1}},
  readouts: (v) {
    final e0 = 0.5 * v['k']! * v['A']! * v['A']!;
    return [Readout('Total ½kA²', fx(e0, 3), 'J'), Readout('Greatest speed', fx(v['A']! * math.sqrt(v['k']! / v['m']!), 2), 'm/s', IX.green), Readout('Period', fx(2 * math.pi * math.sqrt(v['m']! / v['k']!), 2), 's')];
  },
  paint: (c, s, v, t) {
    final k = v['k']!, a0 = v['A']!, m = v['m']!;
    final w = math.sqrt(k / m);
    final tm = v['damp'] == 1 ? t % 20 : t;
    final a = v['damp'] == 1 ? a0 * math.exp(-0.12 * tm) : a0;
    final x = a * math.cos(w * tm);
    final e = 0.5 * k * a * a, u = 0.5 * k * x * x;
    final left = Rect.fromLTWH(0, 0, s.width * 0.62, s.height);
    final p = Plot(Rect.fromLTRB(26, 26, left.right, s.height - 26), -0.32, 0.32, 0, 0.5 * k * 0.3 * 0.3 * 0.75, xl: 'x (m)', yl: 'energy (J)', title: 'U = ½kx² and K = E − U');
    p.frame(c);
    p.fn(c, (q) => 0.5 * k * q * q, PX.waterEdge, w: 4, label: 'U', labelAt: -0.26);
    p.hline(c, e, IX.ink, label: 'total');
    c.drawLine(p.p(x, u), p.p(x, e), Draw.stroke(IX.green, 8));
    c.drawLine(p.p(x, 0), p.p(x, u), Draw.stroke(PX.waterEdge, 8));
    p.dot(c, x, u, IX.ink);
    Draw.bars(c, Rect.fromLTRB(left.right + 16, 26, s.width - 26, s.height - 26), [('U', u, PX.waterEdge), ('K', e - u, IX.green), ('total', e, IX.ink)], title: 'Energy now (J)', max: 0.5 * k * a0 * a0, dp: 3);
  },
);

/// Exact pendulum angle by RK4 integration of θ'' = −(g/L) sin θ (and optional drag).
double _pendAngle(double l, double th0, double tt, {double g = 9.8, bool damp = false}) {
  var th = th0, om = 0.0;
  const h = 0.004;
  final n = (tt / h).round();
  double acc(double a, double w) => -(g / l) * math.sin(a) - (damp ? 0.25 * w : 0);
  for (var i = 0; i < n; i++) {
    final k1a = om, k1w = acc(th, om);
    final k2a = om + k1w * h / 2, k2w = acc(th + k1a * h / 2, om + k1w * h / 2);
    final k3a = om + k2w * h / 2, k3w = acc(th + k2a * h / 2, om + k2w * h / 2);
    final k4a = om + k3w * h, k4w = acc(th + k3a * h, om + k3w * h);
    th += (k1a + 2 * k2a + 2 * k3a + k4a) * h / 6;
    om += (k1w + 2 * k2w + 2 * k3w + k4w) * h / 6;
  }
  return th;
}

final _pendulum = ModeSpec(
  title: 'The simple pendulum',
  formula: 'T = 2π√(L/g)',
  values: {'L': 1.5, 'th0': 30, 'g': 9.8, 'damp': 0, 'tt': 0.6},
  controls: (v) => const [Sl('L', 'Length L', 0.1, 3, unit: 'm', div: 29), Sl('th0', 'Release angle θ₀', 5, 80, unit: '°', div: 15), Sl('g', 'Gravity g', 1.6, 25, unit: 'm/s²', dp: 1), Sl('tt', 'Time t', 0, 6, unit: 's', div: 120), Seg('damp', 'Air resistance', ['Off', 'On'])],
  presets: {'Small swing': {'th0': 10}, 'Large swing (80°)': {'th0': 80}, 'On the Moon': {'g': 1.6}, 'Seconds pendulum': {'L': 0.993, 'g': 9.8}},
  readouts: (v) {
    final t0 = 2 * math.pi * math.sqrt(v['L']! / v['g']!);
    final th0 = rad(v['th0']!);
    // Large-amplitude correction: T ≈ T₀(1 + θ₀²/16 + 11θ₀⁴/3072).
    final tl = t0 * (1 + th0 * th0 / 16 + 11 * math.pow(th0, 4) / 3072);
    return [Readout('Period (small angle)', fx(t0), 's', IX.accent), Readout('Period at this amplitude', fx(tl), 's', IX.positive), Readout('Frequency', fx(1 / t0), 'Hz'), Readout('Seconds pendulum g/π²', fx(v['g']! / (math.pi * math.pi), 3), 'm')];
  },
  paint: (c, s, v, t) {
    final l = v['L']!, th0 = rad(v['th0']!), g = v['g']!, tt = v['tt']!;
    final th = _pendAngle(l, th0, tt, g: g, damp: v['damp'] == 1);
    final left = Rect.fromLTWH(0, 0, s.width * 0.45, s.height);
    final piv = Offset(left.center.dx, 70);
    final lpx = (s.height - 200) * (0.35 + 0.65 * l / 3);
    c.drawLine(piv - const Offset(100, 0), piv + const Offset(100, 0), Draw.stroke(IX.inkSoft, 5));
    // Small-angle ghost.
    final gth = th0 * math.cos(math.sqrt(g / l) * tt);
    final ghost = piv + Offset(math.sin(gth), math.cos(gth)) * lpx;
    c.drawLine(piv, ghost, Draw.stroke(IX.muted.withValues(alpha: 0.5), 2));
    c.drawCircle(ghost, 20, Draw.fill(IX.muted.withValues(alpha: 0.25)));
    final bob = piv + Offset(math.sin(th), math.cos(th)) * lpx;
    c.drawArc(Rect.fromCircle(center: piv, radius: lpx), math.pi / 2 - th0, 2 * th0, false, Draw.stroke(IX.rule, 2));
    IxPaint.dashed(c, piv, piv + Offset(0, lpx + 30), Draw.stroke(IX.muted, 1.5));
    c.drawLine(piv, bob, Draw.stroke(IX.ink, 2.5));
    Draw.ball(c, bob, 22, IX.accent);
    Draw.force(c, bob, bob + Offset(-math.cos(th), math.sin(th)) * math.sin(th) * 140, IX.positive, 'mg sin θ', w: 4);
    Draw.text(c, 'θ = ${fx(deg(th), 1)}°', piv + const Offset(0, -30), size: 19);
    Draw.text(c, 'ghost: small-angle formula', Offset(left.center.dx, s.height - 40), size: 16, color: IX.muted);
    final p = Plot(Rect.fromLTRB(left.right, 26, s.width - 26, s.height - 26), 0, 3, 0, 4, xl: 'L (m)', yl: 'T (s)', title: 'T = 2π√(L/g)');
    p.frame(c);
    p.fn(c, (x) => 2 * math.pi * math.sqrt(x / 9.8), PX.waterEdge, w: 3, label: 'Earth', labelAt: 2.6);
    if ((g - 9.8).abs() > 0.05) p.fn(c, (x) => 2 * math.pi * math.sqrt(x / g), IX.amber, w: 4, label: 'g = ${fx(g, 1)}', labelAt: 0.8);
    p.dot(c, l, 2 * math.pi * math.sqrt(l / g), IX.accent);
  },
);

// ───────────────────────────── waves ─────────────────────────────

final _types = ModeSpec(
  title: 'Transverse and longitudinal waves',
  formula: 'v = fλ',
  values: {'typ': 0, 'A': 0.2, 'lam': 4, 'f': 0.5},
  animate: true,
  controls: (v) => const [Seg('typ', 'Wave', ['Transverse', 'Longitudinal']), Sl('A', 'Amplitude', 0.05, 0.3, unit: 'm', div: 25), Sl('lam', 'Wavelength λ', 2, 8, unit: 'm', div: 12), Sl('f', 'Frequency f', 0.2, 2, unit: 'Hz', div: 18)],
  presets: {'Transverse (string)': {'typ': 0}, 'Longitudinal (sound)': {'typ': 1}},
  readouts: (v) => [Readout('Wave speed v = fλ', fx(v['f']! * v['lam']!), 'm/s', IX.accent), Readout('Period T = 1/f', fx(1 / v['f']!), 's'), Readout('Particles move', v['typ'] == 0 ? 'across the travel' : 'along the travel', '')],
  paint: (c, s, v, t) {
    final lam = v['lam']!, f = v['f']!, a = v['A']!;
    final trans = v['typ'] == 0;
    const xm = 16.0;
    final ppm = (s.width - 120) / xm, x0 = 60.0, cy = s.height * 0.45;
    Draw.caption(c, trans ? 'Each dot is a particle: it moves up and down while the wave moves right.' : 'Particles move back and forth: compressions and rarefactions travel right.');
    for (var row = 0; row < (trans ? 1 : 7); row++) {
      for (var i = 0; i <= 64; i++) {
        final xe = i * xm / 64;
        final d = a * math.sin(2 * math.pi * (xe / lam - f * t));
        final p = trans ? Offset(x0 + xe * ppm, cy - d * 600) : Offset(x0 + (xe - d * 1.6) * ppm, cy - 150 + row * 50);
        final mark = i == 16;
        c.drawCircle(p, mark ? 10 : 7, Draw.fill(mark ? IX.positive : IX.accent.withValues(alpha: 0.75)));
      }
    }
    // λ marker.
    final y = trans ? cy + 240 : cy + 240;
    Draw.dim(c, Offset(x0 + ppm * 2, y), Offset(x0 + ppm * (2 + lam), y), 'λ = ${fx(lam, 1)} m', color: IX.accent, off: 26);
    IxPaint.arrow(c, Offset(s.width - 260, cy + 300), Offset(s.width - 80, cy + 300), IX.ink, width: 4, head: 18);
    Draw.text(c, 'wave travels', Offset(s.width - 170, cy + 326), size: 17, color: IX.inkSoft);
  },
);

final _travelling = ModeSpec(
  title: 'A progressive wave',
  formula: 'y = A sin(kx − ωt + φ)',
  values: {'A': 1.5, 'lam': 6, 'T': 2, 'phi': 0, 'dir': 0, 'tt': 0, 'xp': 1},
  controls: (v) => const [Sl('A', 'Amplitude A', 0.5, 3, unit: 'cm', div: 25), Sl('lam', 'Wavelength λ', 1, 10, unit: 'm', div: 18), Sl('T', 'Period T', 0.5, 4, unit: 's', div: 14), Sl('phi', 'Phase constant φ', 0, 360, unit: '°', div: 24), Sl('tt', 'Time t', 0, 8, unit: 's', div: 80), Seg('dir', 'Travels towards', ['+x (kx − ωt)', '−x (kx + ωt)'])],
  presets: {'t = 0': {'tt': 0}, 't = T/4': {'tt': 0.5}, 't = T/2': {'tt': 1}, 'Moving left': {'dir': 1}},
  drag: (v, p, s, start) {
    final pl = Plot(Rect.fromLTRB(26, 26, s.width - 26, s.height - 26), 0, 16, -3.5, 3.5);
    if (start && (p.dy < pl.r.top || p.dy > pl.r.bottom)) return false;
    v['xp'] = pl.xAt(p.dx).clamp(0, 16);
    return true;
  },
  readouts: (v) {
    final k = 2 * math.pi / v['lam']!, w = 2 * math.pi / v['T']!;
    final sgn = v['dir'] == 1 ? -1 : 1;
    final y = v['A']! * math.sin(k * v['xp']! - sgn * w * v['tt']! + rad(v['phi']!));
    return [Readout('k = 2π/λ', fx(k, 3), 'rad/m', IX.accent), Readout('ω = 2π/T', fx(w, 3), 'rad/s'), Readout('Wave speed ω/k', fx(w / k), 'm/s', IX.green), Readout('y at marker (x = ${fx(v['xp']!, 1)} m)', sg(y), 'cm', IX.positive)];
  },
  paint: (c, s, v, t) {
    final k = 2 * math.pi / v['lam']!, w = 2 * math.pi / v['T']!, a = v['A']!, phi = rad(v['phi']!), tt = v['tt']!;
    final sgn = v['dir'] == 1 ? -1 : 1;
    final p = Plot(Rect.fromLTRB(26, 26, s.width - 26, s.height - 26), 0, 16, -3.5, 3.5, xl: 'x (m)', yl: 'y (cm)', title: 'Snapshot of the string at t = ${fx(tt, 2)} s (faint: t = 0)');
    p.frame(c);
    p.fn(c, (x) => a * math.sin(k * x + phi), IX.muted.withValues(alpha: 0.5), w: 2.5);
    p.fn(c, (x) => a * math.sin(k * x - sgn * w * tt + phi), IX.accent, w: 4.5);
    final xp = v['xp']!;
    p.vline(c, xp, IX.positive);
    p.dot(c, xp, a * math.sin(k * xp - sgn * w * tt + phi), IX.positive, label: 'marker (drag)');
    // Where a crest has moved to.
    final crest0 = ((math.pi / 2 - phi) / k) % v['lam']!;
    final crest = crest0 + sgn * w / k * tt;
    if (crest >= 0 && crest <= 16) p.dot(c, crest, a, IX.green, label: 'crest moves at ${fx(w / k)} m/s', rr: 6);
  },
);

final _stringSpeed = ModeSpec(
  title: 'Speed of a wave on a string',
  formula: 'v = √(T/μ),  f₁ = v/2L',
  values: {'Ten': 60, 'mu': 5, 'L': 0.7, 'f': 1, 'A': 1},
  animate: true,
  controls: (v) => const [Sl('Ten', 'Tension T', 1, 200, unit: 'N', div: 199), Sl('mu', 'Mass per length μ', 0.5, 20, unit: 'g/m', div: 39), Sl('L', 'Length L', 0.2, 2, unit: 'm', div: 18)],
  presets: {'Guitar string': {'Ten': 70, 'mu': 0.5, 'L': 0.65}, 'Heavy rope': {'Ten': 100, 'mu': 20, 'L': 2}, 'Slack string': {'Ten': 5}},
  readouts: (v) {
    final sp = math.sqrt(v['Ten']! / (v['mu']! / 1000));
    return [Readout('Wave speed √(T/μ)', fx(sp, 1), 'm/s', IX.accent), Readout('Fundamental v/2L', fx(sp / (2 * v['L']!), 1), 'Hz', IX.positive), Readout('Wavelength of f₁ = 2L', fx(2 * v['L']!), 'm')];
  },
  paint: (c, s, v, t) {
    final sp = math.sqrt(v['Ten']! / (v['mu']! / 1000));
    final top = Rect.fromLTWH(0, 0, s.width, s.height * 0.42);
    // A pulse travelling along a string over a pulley with a hanging mass (tension).
    final y = top.center.dy, x0 = 60.0, x1 = top.width - 160;
    c.drawCircle(Offset(x1 + 24, y + 24), 24, Draw.stroke(IX.inkSoft, 4));
    final m = v['Ten']! / 9.8;
    c.drawLine(Offset(x1 + 48, y + 24), Offset(x1 + 48, y + 120), Draw.stroke(IX.ink, 2));
    Draw.block(c, Rect.fromCenter(center: Offset(x1 + 48, y + 150), width: 60 + math.min(60, m * 2), height: 56), PX.iron, label: '${fx(m, 1)} kg');
    Draw.ground(c, Offset(x0, y - 60), Offset(x0, y + 60), n: const Offset(-1, 0));
    final pos = x0 + ((t * sp * 12) % (x1 - x0));
    final path = Path()..moveTo(x0, y);
    for (var x = x0; x <= x1; x += 3) {
      path.lineTo(x, y - 50 * math.exp(-math.pow((x - pos) / 40, 2)));
    }
    c.drawPath(path, Draw.stroke(IX.ink, 3 + v['mu']! / 6));
    Draw.text(c, 'pulse at ${fx(sp, 0)} m/s (slowed)', Offset((x0 + x1) / 2, y - 90), size: 18, color: IX.accent);
    final p = Plot(Rect.fromLTRB(26, top.bottom, s.width - 26, s.height - 22), 0, 200, 0, 400, xl: 'tension T (N)', yl: 'v (m/s)', title: 'v = √(T/μ) for μ = ${fx(v['mu']!, 1)} g/m');
    p.frame(c);
    p.fn(c, (x) => math.sqrt(x / (v['mu']! / 1000)), IX.accent, w: 4);
    p.dot(c, v['Ten']!, sp, IX.accent);
  },
);

final _standing = ModeSpec(
  title: 'Standing waves on a string',
  formula: 'fₙ = n v / 2L',
  values: {'n': 2, 'L': 1, 'Ten': 100, 'mu': 5, 'trav': 0},
  animate: true,
  controls: (v) => const [Sl('n', 'Mode number n', 1, 6, div: 5, dp: 0), Sl('L', 'String length L', 0.5, 2, unit: 'm', div: 15), Sl('Ten', 'Tension T', 10, 200, unit: 'N', div: 19), Sl('mu', 'Mass per length μ', 1, 10, unit: 'g/m', div: 9), Seg('trav', 'Show the two travelling waves', ['Off', 'On'])],
  presets: {'Fundamental': {'n': 1}, '2nd harmonic': {'n': 2}, '3rd harmonic': {'n': 3}, 'Travelling parts': {'n': 3, 'trav': 1}},
  readouts: (v) {
    final n = v['n']!.round(), sp = math.sqrt(v['Ten']! / (v['mu']! / 1000));
    return [Readout('Frequency fₙ', fx(n * sp / (2 * v['L']!), 1), 'Hz', IX.accent), Readout('Wavelength 2L/n', fx(2 * v['L']! / n), 'm'), Readout('Wave speed', fx(sp, 1), 'm/s'), Readout('Nodes (with ends)', '${n + 1}', '', IX.positive)];
  },
  paint: (c, s, v, t) {
    final n = v['n']!.round(), l = v['L']!;
    final cy = s.height * 0.5;
    final len = (s.width - 160) * l / 2;
    final x0 = (s.width - len) / 2, xe = x0 + len;
    final ph = t * 1.4 * math.pi;
    const amp = 110.0;
    Draw.caption(c, 'String fixed at both ends (slowed down). Nodes do not move; antinodes swing the most.');
    for (final x in [x0, xe]) {
      c.drawRect(Rect.fromCenter(center: Offset(x, cy), width: 16, height: 140), Draw.fill(IX.inkSoft));
    }
    // Envelope.
    for (final sgn in [-1.0, 1.0]) {
      final e = Path();
      for (var i = 0; i <= 200; i++) {
        final x = i / 200;
        final p = Offset(x0 + x * len, cy - sgn * amp * math.sin(n * math.pi * x));
        i == 0 ? e.moveTo(p.dx, p.dy) : e.lineTo(p.dx, p.dy);
      }
      c.drawPath(e, Draw.stroke(IX.muted.withValues(alpha: 0.5), 2));
    }
    if (v['trav'] == 1) {
      for (final (sgn, col) in [(1.0, IX.positive), (-1.0, IX.green)]) {
        final w = Path();
        for (var i = 0; i <= 200; i++) {
          final x = i / 200;
          final p = Offset(x0 + x * len, cy - amp / 2 * math.sin(n * math.pi * x - sgn * ph));
          i == 0 ? w.moveTo(p.dx, p.dy) : w.lineTo(p.dx, p.dy);
        }
        c.drawPath(w, Draw.stroke(col.withValues(alpha: 0.6), 2.5));
      }
    }
    final sw = Path();
    for (var i = 0; i <= 200; i++) {
      final x = i / 200;
      final p = Offset(x0 + x * len, cy - amp * math.sin(n * math.pi * x) * math.cos(ph));
      i == 0 ? sw.moveTo(p.dx, p.dy) : sw.lineTo(p.dx, p.dy);
    }
    c.drawPath(sw, Draw.stroke(IX.accent, 5));
    for (var k = 0; k <= n; k++) {
      final x = x0 + len * k / n;
      c.drawCircle(Offset(x, cy), 8, Draw.fill(IX.positive));
      if (k < n) Draw.text(c, 'A', Offset(x0 + len * (k + 0.5) / n, cy + amp + 30), size: 16, color: IX.inkSoft);
    }
    Draw.text(c, 'N = node, A = antinode', Offset(x0, cy + amp + 70), size: 16, color: IX.inkSoft, align: Alignment.centerLeft);
    Draw.dim(c, Offset(x0, cy - amp - 50), Offset(xe, cy - amp - 50), 'L = ${fx(l, 2)} m');
  },
);

final _beats = ModeSpec(
  title: 'Beats',
  formula: 'f_beat = |f₁ − f₂|',
  values: {'f1': 10, 'f2': 12, 'sep': 1},
  controls: (v) => const [Sl('f1', 'Frequency f₁', 1, 20, unit: 'Hz', div: 38), Sl('f2', 'Frequency f₂', 1, 20, unit: 'Hz', div: 38), Seg('sep', 'Show the two waves', ['Off', 'On'])],
  presets: {'12 and 13 Hz': {'f1': 12, 'f2': 13}, '10 and 12 Hz': {'f1': 10, 'f2': 12}, 'Equal: no beats': {'f1': 10, 'f2': 10}},
  readouts: (v) {
    final d = (v['f1']! - v['f2']!).abs();
    return [Readout('Beat frequency', fx(d, 1), 'beats/s', IX.positive), Readout('Time between beats', d < 1e-6 ? '∞' : fx(1 / d), 's'), Readout('Frequency heard', fx((v['f1']! + v['f2']!) / 2, 1), 'Hz', IX.accent)];
  },
  paint: (c, s, v, t) {
    final f1 = v['f1']!, f2 = v['f2']!;
    final sep = v['sep'] == 1;
    final h = s.height;
    if (sep) {
      final p1 = Plot(Rect.fromLTRB(26, 26, s.width - 26, h * 0.27), 0, 2, -1.2, 1.2, xl: '', yl: 'f₁');
      p1.frame(c);
      p1.fn(c, (x) => math.sin(2 * math.pi * f1 * x), IX.accent, w: 2.5);
      final p2 = Plot(Rect.fromLTRB(26, h * 0.27, s.width - 26, h * 0.5), 0, 2, -1.2, 1.2, xl: '', yl: 'f₂');
      p2.frame(c);
      p2.fn(c, (x) => math.sin(2 * math.pi * f2 * x), IX.green, w: 2.5);
    }
    final p = Plot(Rect.fromLTRB(26, sep ? h * 0.5 : 26, s.width - 26, h - 22), 0, 2, -2.3, 2.3, xl: 't (s)', yl: 'sum', title: 'The sum swells and fades |f₁ − f₂| times a second');
    p.frame(c);
    final df = (f1 - f2) / 2;
    p.fn(c, (x) => 2 * math.cos(2 * math.pi * df * x).abs(), IX.positive, w: 2.5, dash: true);
    p.fn(c, (x) => -2 * math.cos(2 * math.pi * df * x).abs(), IX.positive, w: 2.5, dash: true);
    p.fn(c, (x) => math.sin(2 * math.pi * f1 * x) + math.sin(2 * math.pi * f2 * x), IX.ink, w: 3);
  },
);

final _doppler = ModeSpec(
  title: 'The Doppler effect',
  chapter: '1st PUC Physics · Doppler effect',
  formula: "f′ = f (v ± v_o)/(v ∓ v_s)",
  values: {'vs': 136, 'vo': 0, 'ds': 0, 'dl': 0, 'f0': 500},
  animate: true,
  controls: (v) => const [Sl('vs', 'Source speed v_s', 0, 300, unit: 'm/s', div: 60), Seg('ds', 'Source moves', ['Towards listener', 'Away']), Sl('vo', 'Listener speed v_o', 0, 100, unit: 'm/s', div: 20), Seg('dl', 'Listener moves', ['Towards source', 'Away']), Sl('f0', 'Source frequency f', 200, 1000, unit: 'Hz', div: 16)],
  presets: {'Source at 0.4 v': {'vs': 136, 'vo': 0}, 'Listener moving': {'vs': 0, 'vo': 34}, 'Both approach': {'vs': 34, 'vo': 34}, 'Near sound barrier': {'vs': 300}},
  readouts: (v) {
    final (fp, fb) = _dopp(v);
    return [Readout('Listener hears', fx(fp, 0), 'Hz', IX.positive), Readout('Ratio f′/f', fx(fp / v['f0']!, 3), ''), Readout('Heard behind the source', fx(fb, 0), 'Hz', IX.accent), Readout('v_s ÷ v (v = 340 m/s)', fx(v['vs']! / 340, 2), '')];
  },
  paint: (c, s, v, t) {
    final m = v['vs']! / 340;
    final dir = v['ds'] == 0 ? 1.0 : -1.0;
    // Source moves along +x toward a listener on the right (or away: moves −x).
    const ppsSound = 160.0; // px per second for sound
    final cy = s.height * 0.5;
    final period = 0.5; // one crest every 0.5 s (drawn), slowed
    final tm = (t + 4.5) % 6;
    final srcAt = Offset(s.width * 0.45 + dir * m * ppsSound * (tm - 3), cy);
    for (var k = 0; k < 14; k++) {
      final te = tm - k * period;
      if (te < 0) break;
      final emit = Offset(s.width * 0.45 + dir * m * ppsSound * (tm - 3 - te), cy);
      c.drawCircle(emit, ppsSound * te, Draw.stroke(IX.accent.withValues(alpha: (1 - k / 14) * 0.8), 2.5));
    }
    Draw.ball(c, srcAt, 16, IX.positive);
    Draw.text(c, 'source', srcAt + const Offset(0, 34), size: 17, color: IX.positive);
    final lis = Offset(s.width - 90, cy);
    c.drawCircle(lis, 18, Draw.fill(IX.green));
    Draw.text(c, 'listener', lis + const Offset(0, 36), size: 17, color: IX.green);
    final (fp, _) = _dopp(v);
    Draw.tag(c, 'hears ${fx(fp, 0)} Hz', lis + const Offset(-20, -60), color: IX.green, align: Alignment.centerRight);
    Draw.caption(c, 'Each circle is one crest. Ahead of a moving source the crests crowd together: higher pitch.');
  },
);

(double, double) _dopp(V v) {
  const c = 340.0;
  final vs = v['vs']! * (v['ds'] == 0 ? 1 : -1), vo = v['vo']! * (v['dl'] == 0 ? 1 : -1);
  final f = v['f0']!;
  return (f * (c + vo) / math.max(1, c - vs), f * c / (c + v['vs']!));
}
