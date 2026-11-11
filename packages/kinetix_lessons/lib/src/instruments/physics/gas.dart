import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'kit.dart';

/// Kinetic theory (1st PUC ch. 12): molecules in a box, the gas laws, P = ⅓ρv², rms speed,
/// degrees of freedom and the mean free path. Molecules bounce on exact straight paths.
final gasSpec = InstrumentSpec(
  id: 'gas',
  chapter: '1st PUC Physics · Kinetic theory',
  modes: {'box': _box, 'isotherms': _isotherms, 'density': _density, 'speeds': _speeds, 'dof': _dof, 'mfp': _mfp},
);

const _r = 8.314, _kb = 1.380649e-23;

/// Reflects a coordinate into [0, 1] (a triangle wave): exact elastic bouncing off walls.
double _tri(double x) {
  final m = x % 2;
  return m < 1 ? m : 2 - m;
}

/// Draws [n] molecules bouncing in [r]; [speed] in box-widths per second.
void _molecules(Canvas c, Rect r, int n, double speed, double t, {Color col = IX.accent, double rad = 6, int seed = 7, int track = -1}) {
  final rnd = math.Random(seed);
  for (var i = 0; i < n; i++) {
    final x0 = rnd.nextDouble(), y0 = rnd.nextDouble();
    final a = rnd.nextDouble() * 2 * math.pi;
    // A spread of speeds about the mean (a rough Maxwell spread).
    final sp = speed * (0.45 + rnd.nextDouble() * 1.1);
    final x = _tri(x0 + math.cos(a) * sp * t * r.height / r.width), y = _tri(y0 + math.sin(a) * sp * t);
    final p = Offset(r.left + rad + x * (r.width - 2 * rad), r.top + rad + y * (r.height - 2 * rad));
    c.drawCircle(p, rad, Draw.fill(i == track ? IX.green : col.withValues(alpha: 0.8)));
  }
}

void _boxWalls(Canvas c, Rect r, {double? piston}) {
  c.drawRect(r, Draw.fill(const Color(0xFFF4F7FC)));
  c.drawPath(Path()..moveTo(r.right, r.top)..lineTo(r.left, r.top)..lineTo(r.left, r.bottom)..lineTo(r.right, r.bottom), Draw.stroke(IX.inkSoft, 5));
  if (piston != null) {
    Draw.block(c, Rect.fromLTWH(r.right, r.top - 4, 24, r.height + 8), PX.iron, radius: 3);
    c.drawRect(Rect.fromLTWH(r.right + 24, r.center.dy - 7, 120, 14), Draw.fill(IX.steel));
  }
}

// ── molecules in a box: PV = nRT ──

final _box = ModeSpec(
  title: 'Squeeze, heat and fill a gas',
  formula: 'PV = nRT',
  values: {'V': 2, 'T': 300, 'n': 0.08},
  animate: true,
  controls: (v) => const [Sl('V', 'Volume V', 1, 4, unit: 'L', div: 30), Sl('T', 'Temperature T', 100, 600, unit: 'K', div: 50), Sl('n', 'Amount of gas n', 0.02, 0.2, unit: 'mol', div: 18)],
  presets: {'Start': {'V': 2, 'T': 300, 'n': 0.08}, 'Halve the volume': {'V': 1}, 'Double the temperature': {'T': 600}, 'More gas': {'n': 0.16}},
  readouts: (v) {
    final p = v['n']! * _r * v['T']! / (v['V']! / 1000) / 1000;
    return [Readout('Pressure P', fx(p, 1), 'kPa', IX.accent), Readout('PV', fx(p * v['V']!, 1), 'J'), Readout('PV / T', fx(p * v['V']! / v['T']!, 3), 'J/K'), Readout('PV/T ÷ n = R', fx(p * v['V']! / v['T']! / v['n']!, 3), 'J/mol K', IX.green)];
  },
  paint: (c, s, v, t) {
    final left = Rect.fromLTWH(0, 0, s.width * 0.5, s.height);
    final full = left.width - 220;
    final box = Rect.fromLTWH(50, 140, full * v['V']! / 4, s.height - 300);
    _boxWalls(c, box, piston: 1);
    _molecules(c, box, (v['n']! * 300).round(), 0.18 * math.sqrt(v['T']! / 300), t);
    Draw.text(c, 'V = ${fx(v['V']!, 2)} L,  T = ${fx(v['T']!, 0)} K', Offset(50, 100), size: 20, align: Alignment.centerLeft);
    final p = v['n']! * _r * v['T']! / (v['V']! / 1000) / 1000;
    final pl = Plot(Rect.fromLTRB(left.right, 26, s.width - 26, s.height - 26), 0, 4.2, 0, 1000, xl: 'V (L)', yl: 'P (kPa)', title: 'Isotherms: P = nRT/V');
    pl.frame(c);
    for (final tk in [150.0, 300.0, 450.0, 600.0]) {
      pl.fn(c, (x) => v['n']! * _r * tk / (x / 1000) / 1000, tk == v['T']! ? IX.accent : IX.muted.withValues(alpha: 0.6), w: tk == v['T']! ? 4 : 2, a: 0.3, label: '${fx(tk, 0)} K', labelAt: 3.6);
    }
    pl.fn(c, (x) => v['n']! * _r * v['T']! / (x / 1000) / 1000, IX.accent, w: 4, a: 0.3);
    pl.dot(c, v['V']!, p, IX.accent);
  },
);

// ── isotherms for μ moles ──

final _isotherms = ModeSpec(
  title: 'Isotherms of an ideal gas',
  formula: 'P = μRT / V',
  values: {'mu': 1, 'T': 300, 'V': 22.4},
  controls: (v) => const [Sl('mu', 'Moles μ', 0.1, 3, unit: 'mol', div: 29), Sl('T', 'Temperature T', 100, 600, unit: 'K', div: 50), Sl('V', 'Volume V', 1, 50, unit: 'L', dp: 1)],
  presets: {'1 mol at STP': {'mu': 1, 'T': 273, 'V': 22.4}, 'Hot': {'T': 600}, 'Squeezed': {'V': 5}},
  readouts: (v) => [Readout('Pressure P', fx(v['mu']! * _r * v['T']! / v['V']!, 1), 'kPa', IX.accent), Readout('Molecules N', fx(v['mu']! * 6.022, 3), '× 10²³'), Readout('PV/T', fx(v['mu']! * _r, 3), 'J/K')],
  paint: (c, s, v, t) {
    final pl = Plot(Rect.fromLTRB(26, 26, s.width - 26, s.height - 26), 0, 50, 0, 600, xl: 'V (L)', yl: 'P (kPa)', title: 'Boyle’s law at each temperature (μ = ${fx(v['mu']!, 1)} mol)');
    pl.frame(c);
    for (final (i, tk) in [100.0, 200.0, 300.0, 400.0, 500.0, 600.0].indexed) {
      pl.fn(c, (x) => v['mu']! * _r * tk / x, Color.lerp(PX.waterEdge, IX.positive, i / 5)!.withValues(alpha: 0.7), w: 2.5, a: 0.5, label: '${fx(tk, 0)} K', labelAt: 44 - i * 3.0);
    }
    pl.fn(c, (x) => v['mu']! * _r * v['T']! / x, IX.ink, w: 4.5, a: 0.5);
    pl.dot(c, v['V']!, v['mu']! * _r * v['T']! / v['V']!, IX.accent, label: '${fx(v['mu']! * _r * v['T']! / v['V']!, 0)} kPa');
  },
);

// ── P = ⅓ρv² ──

final _density = ModeSpec(
  title: 'Pressure from molecular speed',
  formula: 'P = ⅓ρv²_rms',
  values: {'rho': 1.2, 'vr': 500, 'track': 0},
  animate: true,
  controls: (v) => const [Sl('rho', 'Density ρ', 0.1, 5, unit: 'kg/m³', div: 49), Sl('vr', 'rms speed', 200, 1000, unit: 'm/s', div: 40), Seg('track', 'Follow one molecule', ['Off', 'On'])],
  presets: {'Air at room temperature': {'rho': 1.2, 'vr': 500}, 'Thin, fast gas': {'rho': 0.3, 'vr': 900}, 'Dense, slow gas': {'rho': 4, 'vr': 300}},
  readouts: (v) {
    final p = v['rho']! * v['vr']! * v['vr']! / 3;
    return [Readout('Pressure ⅓ρv²', fx(p / 1000, 1), 'kPa', IX.accent), Readout('Temperature if N₂', fx(v['vr']! * v['vr']! * 0.028 / (3 * _r), 0), 'K'), Readout('KE per m³ = 3P/2', fx(1.5 * p / 1000, 1), 'kJ/m³', IX.amber)];
  },
  paint: (c, s, v, t) {
    final left = Rect.fromLTWH(0, 0, s.width * 0.48, s.height);
    final box = Rect.fromLTWH(60, 110, left.width - 120, s.height - 240);
    _boxWalls(c, box);
    _molecules(c, box, (v['rho']! * 40).round().clamp(4, 200), 0.3 * v['vr']! / 500, t, track: v['track'] == 1 ? 0 : -1);
    Draw.text(c, 'ρ = ${fx(v['rho']!, 2)} kg/m³', Offset(left.center.dx, 70), size: 20);
    final p0 = v['rho']! * v['vr']! * v['vr']! / 3;
    final pl = Plot(Rect.fromLTRB(left.right, 26, s.width - 26, s.height - 26), 0.1, 5, 0, 2000, xl: 'ρ (kg/m³)', yl: 'v_rms (m/s)', title: 'v_rms = √(3P/ρ) at this pressure');
    pl.frame(c);
    pl.fn(c, (x) => math.sqrt(3 * p0 / x), IX.accent, w: 4);
    pl.dot(c, v['rho']!, v['vr']!, IX.accent, label: '${fx(p0 / 1000, 0)} kPa');
  },
);

// ── rms speed and temperature ──

const _gases = ['He', 'N₂', 'O₂', 'CO₂'];
const _mm = [4.0, 28.0, 32.0, 44.0];

final _speeds = ModeSpec(
  title: 'Molecules and temperature',
  formula: 'v_rms = √(3RT/M),  KE = 3/2 kT',
  values: {'T': 300, 'gas': 1},
  animate: true,
  controls: (v) => const [Seg('gas', 'Gas', _gases), Sl('T', 'Temperature T', 50, 1000, unit: 'K', div: 95)],
  presets: {'N₂ at 300 K': {'gas': 1, 'T': 300}, 'Helium at 300 K': {'gas': 0, 'T': 300}, 'Hot CO₂': {'gas': 3, 'T': 900}},
  readouts: (v) {
    final m = _mm[v['gas']!.round()] / 1000;
    return [Readout('rms speed', fx(math.sqrt(3 * _r * v['T']! / m), 0), 'm/s', IX.accent), Readout('Mean KE of a molecule', fx(1.5 * _kb * v['T']! * 1e21, 2), '× 10⁻²¹ J', IX.amber), Readout('Molar mass', fx(m * 1000, 0), 'g/mol')];
  },
  paint: (c, s, v, t) {
    final gi = v['gas']!.round();
    final m = _mm[gi] / 1000;
    final vr = math.sqrt(3 * _r * v['T']! / m);
    final left = Rect.fromLTWH(0, 0, s.width * 0.45, s.height);
    final box = Rect.fromLTWH(50, 110, left.width - 100, s.height - 230);
    _boxWalls(c, box);
    _molecules(c, box, 40, 0.25 * vr / 500, t, rad: 4 + math.sqrt(_mm[gi]), col: [IX.amber, IX.accent, PX.teal, IX.inkSoft][gi]);
    Draw.text(c, '${_gases[gi]} at ${fx(v['T']!, 0)} K', Offset(left.center.dx, 70), size: 21);
    final pl = Plot(Rect.fromLTRB(left.right, 26, s.width - 26, s.height - 26), 0, 1000, 0, 2600, xl: 'T (K)', yl: 'v_rms (m/s)', title: 'Lighter molecules move faster at the same T');
    pl.frame(c);
    for (var i = 0; i < 4; i++) {
      pl.fn(c, (x) => math.sqrt(3 * _r * x / (_mm[i] / 1000)), [IX.amber, IX.accent, PX.teal, IX.inkSoft][i], w: i == gi ? 4.5 : 2.5, label: _gases[i], labelAt: i == 0 ? 400 : 900);
    }
    pl.dot(c, v['T']!, vr, IX.accent, label: '${fx(vr, 0)} m/s');
  },
);

// ── degrees of freedom ──

const _dofs = ['Monatomic (He)', 'Diatomic (O₂)', 'Diatomic, vibrating'];
const _fv = [3, 5, 7];

final _dof = ModeSpec(
  title: 'Sharing energy among degrees of freedom',
  formula: 'Cv = (f/2)R,  γ = 1 + 2/f',
  values: {'f': 1, 'T': 300},
  controls: (v) => const [Seg('f', 'Gas', _dofs), Sl('T', 'Temperature T', 100, 1000, unit: 'K', div: 90)],
  presets: {'Monatomic': {'f': 0}, 'Diatomic': {'f': 1}, 'Vibrating': {'f': 2}},
  readouts: (v) {
    final f = _fv[v['f']!.round()];
    return [Readout('Cv = (f/2)R', fx(f / 2 * _r, 2), 'J/mol K', IX.accent), Readout('Cp = Cv + R', fx((f / 2 + 1) * _r, 2), 'J/mol K', IX.positive), Readout('γ = Cp/Cv', fx(1 + 2 / f, 3), '', IX.green), Readout('U of one mole', fx(f / 2 * _r * v['T']! / 1000, 2), 'kJ')];
  },
  paint: (c, s, v, t) {
    final fi = v['f']!.round(), f = _fv[fi];
    final left = Rect.fromLTWH(0, 0, s.width * 0.55, s.height);
    final o = Offset(left.width * 0.32, left.center.dy - 20);
    // The molecule and its ways of moving.
    if (fi == 0) {
      Draw.ball(c, o, 40, IX.amber);
    } else {
      final a = o - const Offset(60, 0), b = o + const Offset(60, 0);
      if (fi == 2) {
        Draw.spring(c, a, b, coils: 6, width: 18, color: IX.inkSoft, w: 3);
      } else {
        c.drawLine(a, b, Draw.stroke(IX.inkSoft, 8));
      }
      Draw.ball(c, a, 34, PX.rose);
      Draw.ball(c, b, 34, PX.rose);
      for (final (ang, lab) in [(0.0, 'rotation'), (math.pi / 2, 'rotation')]) {
        c.drawArc(Rect.fromCenter(center: o, width: 230, height: ang == 0 ? 70 : 230), ang == 0 ? 0.2 : 1.8, 2.0, false, Draw.stroke(IX.green, 3));
        if (ang == 0) Draw.text(c, lab, o + const Offset(0, 60), size: 16, color: IX.green);
      }
    }
    for (final (u, lab) in [(const Offset(1, 0), 'x'), (const Offset(0, -1), 'y'), (const Offset(0.7, 0.7), 'z')]) {
      IxPaint.arrow(c, o + u * 90, o + u * 150, IX.accent, width: 3, head: 12);
      Draw.text(c, lab, o + u * 170, size: 16, color: IX.accent);
    }
    // f shares of ½kT.
    final rowY = s.height - 150;
    Draw.text(c, 'f = $f shares of ½kT each', Offset(40, rowY - 40), size: 20, align: Alignment.centerLeft);
    for (var i = 0; i < 7; i++) {
      final r = Rect.fromLTWH(40 + i * 92.0, rowY, 80, 60);
      final on = i < f;
      final col = i < 3 ? IX.accent : (i < 5 ? IX.green : IX.amber);
      c.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(10)), Draw.fill(on ? col.withValues(alpha: 0.85) : IX.grid));
      Draw.text(c, i < 3 ? 'trans' : (i < 5 ? 'rot' : 'vib'), r.center, size: 16, color: on ? Colors.white : IX.muted);
    }
    Draw.bars(c, Rect.fromLTRB(left.right + 10, 26, s.width - 26, s.height - 26), [('Cv/R', f / 2, IX.accent), ('Cp/R', f / 2 + 1, IX.positive), ('γ', 1 + 2 / f, IX.green)], title: 'Specific heats', dp: 2, max: 4.5);
  },
);

// ── mean free path ──

final _mfp = ModeSpec(
  title: 'How far between collisions?',
  formula: 'λ = kT / (√2 π d² P)',
  values: {'P': 101, 'd': 0.3, 'T': 300},
  controls: (v) => const [Sl('P', 'Pressure P', 1, 200, unit: 'kPa', div: 199), Sl('d', 'Molecular diameter d', 0.1, 0.5, unit: 'nm', div: 40), Sl('T', 'Temperature T', 100, 1000, unit: 'K', div: 90)],
  presets: {'Air at 1 atm': {'P': 101, 'd': 0.3, 'T': 300}, 'Half an atmosphere': {'P': 50}, 'Small molecules': {'d': 0.2}},
  readouts: (v) {
    final lam = _kb * v['T']! / (math.sqrt2 * math.pi * math.pow(v['d']! * 1e-9, 2) * v['P']! * 1000);
    final nd = v['P']! * 1000 / (_kb * v['T']!);
    return [Readout('Mean free path λ', fx(lam * 1e9, 1), 'nm', IX.accent), Readout('Molecules per m³', fx(nd / 1e25, 2), '× 10²⁵'), Readout('λ ÷ diameter', fx(lam / (v['d']! * 1e-9), 0), '')];
  },
  paint: (c, s, v, t) {
    final lam = _kb * v['T']! / (math.sqrt2 * math.pi * math.pow(v['d']! * 1e-9, 2) * v['P']! * 1000) * 1e9; // nm
    final left = Rect.fromLTWH(0, 0, s.width * 0.48, s.height);
    final box = Rect.fromLTWH(40, 80, left.width - 80, s.height - 180);
    IxPaint.grid(c, Size(box.right, box.bottom), step: 50);
    c.drawRect(box, Draw.stroke(IX.rule, 2));
    // A zig-zag path with exponentially distributed free paths of mean λ (50 px = 100 nm).
    final rnd = math.Random(11);
    var p = box.center;
    final path = Path()..moveTo(p.dx, p.dy);
    final pts = <Offset>[p];
    for (var i = 0; i < 14; i++) {
      final len = -math.log(1 - rnd.nextDouble() * 0.95) * lam / 2;
      final a = rnd.nextDouble() * 2 * math.pi;
      var q = p + Offset(math.cos(a), math.sin(a)) * len;
      q = Offset(q.dx.clamp(box.left + 10, box.right - 10), q.dy.clamp(box.top + 10, box.bottom - 10));
      path.lineTo(q.dx, q.dy);
      pts.add(q);
      p = q;
    }
    c.drawPath(path, Draw.stroke(IX.green, 3));
    for (final q in pts.skip(1)) {
      c.drawCircle(q, 7, Draw.fill(IX.inkSoft.withValues(alpha: 0.6)));
    }
    Draw.ball(c, pts.first, 9, IX.green);
    Draw.text(c, 'grid: 100 nm.  Mean free path ${fx(lam, 0)} nm', Offset(box.left, box.bottom + 30), size: 17, color: IX.inkSoft, align: Alignment.centerLeft);
    final pl = Plot(Rect.fromLTRB(left.right, 26, s.width - 26, s.height - 26), 1, 200, 0, 1000, xl: 'P (kPa)', yl: 'λ (nm)', title: 'λ falls as 1/P');
    pl.frame(c);
    pl.fn(c, (x) => _kb * v['T']! / (math.sqrt2 * math.pi * math.pow(v['d']! * 1e-9, 2) * x * 1000) * 1e9, IX.accent, w: 4);
    pl.dot(c, v['P']!, lam, IX.accent);
  },
);
