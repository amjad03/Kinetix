import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import 'kit.dart';

/// Mechanical properties of solids (1st PUC ch. 8): stress and strain, the stress–strain
/// curve, Hooke's law, Searle's wire, shear and bulk moduli, and the loaded beam.
final elasticitySpec = InstrumentSpec(
  id: 'elasticity',
  chapter: '1st PUC Physics · Mechanical properties of solids',
  modes: {'stress': _stress, 'curve': _curve, 'hooke': _hooke, 'wire': _wire, 'shear': _shear, 'bulk': _bulk, 'beam': _beam},
);

/// Mechanical properties of fluids (1st PUC ch. 9): Pascal's law, pressure with depth,
/// continuity, Torricelli's jet, terminal velocity and capillary rise.
final fluidsSpec = InstrumentSpec(
  id: 'fluids',
  chapter: '1st PUC Physics · Mechanical properties of fluids',
  modes: {'hydraulic': _hydraulic, 'pressure': _pressure, 'continuity': _continuity, 'torricelli': _torricelli, 'stokes': _stokes, 'capillary': _capillary},
);

const _g = 9.8;

/// A block drawn as a slightly 3-D box.
void _box(Canvas c, Rect r, Color col, {Offset skew = Offset.zero, double depth = 26}) {
  final d = Offset(depth, -depth * 0.6);
  final top = Path()..moveTo(r.left + skew.dx, r.top)..lineTo(r.right + skew.dx, r.top)..lineTo(r.right + skew.dx + d.dx, r.top + d.dy)..lineTo(r.left + skew.dx + d.dx, r.top + d.dy)..close();
  final side = Path()..moveTo(r.right + skew.dx, r.top)..lineTo(r.right, r.bottom)..lineTo(r.right + d.dx, r.bottom + d.dy)..lineTo(r.right + skew.dx + d.dx, r.top + d.dy)..close();
  final front = Path()..moveTo(r.left + skew.dx, r.top)..lineTo(r.right + skew.dx, r.top)..lineTo(r.right, r.bottom)..lineTo(r.left, r.bottom)..close();
  c.drawPath(side, Draw.fill(Color.lerp(col, Colors.black, 0.2)!));
  c.drawPath(top, Draw.fill(Color.lerp(col, Colors.white, 0.3)!));
  c.drawPath(front, Paint()..shader = ui.Gradient.linear(r.topLeft, r.bottomRight, [Color.lerp(col, Colors.white, 0.15)!, col]));
  for (final p in [front, top, side]) {
    c.drawPath(p, Draw.stroke(Color.lerp(col, Colors.black, 0.35)!, 1.5));
  }
}

// ── three kinds of stress ──

const _kinds = ['Tensile', 'Shearing', 'Hydraulic'];
const _alMod = [70.0, 25.0, 72.0]; // GPa: Y, G, B for aluminium

final _stress = ModeSpec(
  title: 'Three ways to stress a block',
  formula: 'stress = F/A,  modulus = stress/strain',
  values: {'kind': 0, 'F': 50, 'A': 20},
  controls: (v) => const [Seg('kind', 'Kind of stress', _kinds), Sl('F', 'Force F', 0, 100, unit: 'kN', div: 20), Sl('A', 'Area A', 10, 40, unit: 'cm²', div: 30)],
  presets: {'Tensile': {'kind': 0}, 'Shearing': {'kind': 1}, 'Hydraulic': {'kind': 2}},
  readouts: (v) {
    final k = v['kind']!.round();
    final st = v['F']! * 1e3 / (v['A']! * 1e-4);
    return [
      Readout(k == 2 ? 'Pressure p = F/A' : 'Stress F/A', fx(st / 1e6, 1), 'MPa', IX.accent),
      Readout(['Longitudinal strain', 'Shear strain', 'Volume strain'][k], fx(st / (_alMod[k] * 1e9) * 1e3, 3), '× 10⁻³', IX.positive),
      Readout(['Young’s modulus Y', 'Shear modulus G', 'Bulk modulus B'][k], fx(_alMod[k], 0), 'GPa'),
    ];
  },
  paint: (c, s, v, t) {
    final k = v['kind']!.round();
    final st = v['F']! * 1e3 / (v['A']! * 1e-4);
    final strain = st / (_alMod[k] * 1e9) * 100; // drawn 100 times larger
    final cx = s.width / 2, cy = s.height / 2 + 30;
    const w0 = 240.0, h0 = 240.0;
    Draw.caption(c, 'Aluminium block; the change in shape is drawn 100 times larger. Dashed: the unstressed block.');
    final ghost = Rect.fromCenter(center: Offset(cx, cy), width: w0, height: h0);
    if (k == 0) {
      final r = Rect.fromCenter(center: Offset(cx, cy), width: w0, height: h0 * (1 + strain));
      _box(c, r, const Color(0xFFB9C2D0));
      Draw.force(c, r.topCenter + const Offset(0, -30), r.topCenter + Offset(0, -60 - v['F']!), IX.accent, 'F');
      Draw.force(c, r.bottomCenter + const Offset(0, 10), r.bottomCenter + Offset(0, 40 + v['F']!), IX.accent, 'F');
      Draw.dim(c, Offset(r.left - 60, ghost.top), Offset(r.left - 60, r.top), 'ΔL', color: IX.positive, off: -30);
    } else if (k == 1) {
      final dx = strain * h0;
      final r = Rect.fromCenter(center: Offset(cx, cy), width: w0, height: h0);
      _box(c, r, const Color(0xFFB9C2D0), skew: Offset(dx, 0));
      Draw.ground(c, Offset(cx - 220, r.bottom), Offset(cx + 240, r.bottom));
      Draw.force(c, r.topLeft + Offset(dx - 110 - v['F']!, -14), r.topLeft + Offset(dx - 10, -14), IX.accent, 'F', off: const Offset(0, -24));
      Draw.angle(c, r.bottomLeft, -math.pi / 2, -math.pi / 2 + math.atan(dx / h0), 120, 'θ');
    } else {
      final f = 1 - strain / 3;
      final r = Rect.fromCenter(center: Offset(cx, cy), width: w0 * f, height: h0 * f);
      c.drawRRect(RRect.fromRectAndRadius(ghost.inflate(110), const Radius.circular(18)), Draw.fill(PX.water.withValues(alpha: 0.5)));
      _box(c, r, const Color(0xFFB9C2D0));
      for (var i = 0; i < 4; i++) {
        final a = i * math.pi / 2;
        final u = Offset(math.cos(a), math.sin(a));
        Draw.force(c, Offset(cx, cy) + u * (w0 / 2 + 100), Offset(cx, cy) + u * (w0 / 2 + 30), IX.accent, i == 0 ? 'p' : '', w: 4);
      }
    }
    final p = Paint()..color = IX.muted..strokeWidth = 2..style = PaintingStyle.stroke;
    for (final (a, b) in [(ghost.topLeft, ghost.topRight), (ghost.topRight, ghost.bottomRight), (ghost.bottomRight, ghost.bottomLeft), (ghost.bottomLeft, ghost.topLeft)]) {
      IxPaint.dashed(c, a, b, p, dash: 8, gap: 6);
    }
  },
);

// ── stress–strain curve ──

/// A ductile-metal curve in relative units: O–A straight, B yield, D ultimate, E fracture.
double _sig(double e) {
  if (e <= 2) return 20 * e;
  if (e <= 3) return 40 + 6 * (e - 2) - 2 * (e - 2) * (e - 2);
  if (e <= 4) return 44 - 2 * (e - 3);
  if (e <= 14) return 42 + 18 * math.sin((e - 4) / 10 * math.pi / 2);
  return 60 - 10 * math.pow((e - 14) / 4, 2).toDouble();
}

final _curve = ModeSpec(
  title: 'Walk along the stress–strain curve',
  formula: 'Hooke: stress ∝ strain (up to A)',
  values: {'eps': 3, 'unload': 1},
  controls: (v) => const [Sl('eps', 'Strain (not to scale)', 0, 18, div: 72), Seg('unload', 'Show unloading', ['Off', 'On'])],
  presets: {'Elastic (O–A)': {'eps': 1.5}, 'Yield point B': {'eps': 3}, 'Plastic (C–D)': {'eps': 9}, 'Near fracture': {'eps': 17}},
  readouts: (v) {
    final e = v['eps']!;
    final set = e <= 2.2 ? 0.0 : e - _sig(e) / 20;
    final region = e <= 2 ? 'Proportional (Hooke)' : (e <= 3 ? 'Elastic, past A' : (e <= 14 ? 'Plastic' : 'Necking → fracture'));
    return [Readout('Stress (relative)', fx(_sig(e), 1), '', IX.accent), Readout('Permanent set', fx(set, 2), '', IX.positive), Readout('Region', region, '')];
  },
  paint: (c, s, v, t) {
    final e = v['eps']!;
    final left = Rect.fromLTWH(0, 0, s.width * 0.3, s.height);
    // The wire specimen, stretched and necking past D.
    final cx = left.center.dx, top = 80.0, len = 420 + e * 14;
    c.drawRect(Rect.fromCenter(center: Offset(cx, top - 16), width: 120, height: 32), Draw.fill(PX.iron));
    final neck = e > 14 ? (e - 14) / 4 : 0.0;
    final path = Path()..moveTo(cx - 14, top);
    path.lineTo(cx - 14, top + len * 0.45);
    path.quadraticBezierTo(cx - 14 + 10 * neck, top + len * 0.5, cx - 14, top + len * 0.55);
    path
      ..lineTo(cx - 14, top + len)
      ..lineTo(cx + 14, top + len)
      ..lineTo(cx + 14, top + len * 0.55);
    path.quadraticBezierTo(cx + 14 - 10 * neck, top + len * 0.5, cx + 14, top + len * 0.45);
    path..lineTo(cx + 14, top)..close();
    c.drawPath(path, Paint()..shader = ui.Gradient.linear(Offset(cx - 14, 0), Offset(cx + 14, 0), [IX.steel, const Color(0xFFE5E8EE), IX.steel], [0, 0.5, 1]));
    Draw.force(c, Offset(cx, top + len + 10), Offset(cx, top + len + 30 + _sig(e) * 1.6), IX.accent, 'F');
    final p = Plot(Rect.fromLTRB(left.right, 26, s.width - 26, s.height - 26), 0, 19, 0, 70, xl: 'strain', yl: 'stress', title: 'Stress–strain curve of a ductile metal');
    p.frame(c);
    p.fn(c, _sig, IX.ink, w: 4, b: 18);
    for (final (n, x) in [('A', 2.0), ('B', 3.0), ('C', 4.0), ('D', 14.0), ('E', 18.0)]) {
      p.dot(c, x, _sig(x), IX.inkSoft, label: n, rr: 5, off: const Offset(10, -20));
    }
    Draw.text(c, 'elastic', p.p(1.4, 8), size: 16, color: IX.green, halo: true);
    Draw.text(c, 'plastic', p.p(9, 30), size: 16, color: IX.amber, halo: true);
    p.vline(c, 3, IX.green.withValues(alpha: 0.6));
    if (v['unload'] == 1 && e > 2.2) {
      final set = e - _sig(e) / 20;
      p.poly(c, [Offset(e, _sig(e)), Offset(set, 0)], IX.positive, w: 3);
      p.dot(c, set, 0, IX.positive, label: 'permanent set', off: const Offset(10, -20));
    }
    p.dot(c, e, _sig(e), IX.accent);
  },
);

// ── Hooke's law for a spring ──

final _hooke = ModeSpec(
  title: "Hooke's law for a spring",
  formula: 'F = kx,  U = ½kx²',
  values: {'k': 200, 'x': 0.05},
  controls: (v) => const [Sl('k', 'Spring constant k', 50, 500, unit: 'N/m', div: 45), Sl('x', 'Extension x', 0, 0.2, unit: 'm', div: 40)],
  presets: {'Soft spring': {'k': 80, 'x': 0.15}, 'Stiff spring': {'k': 450, 'x': 0.05}},
  readouts: (v) => [Readout('Restoring force kx', fx(v['k']! * v['x']!, 1), 'N', IX.accent), Readout('Stored energy ½kx²', fx(0.5 * v['k']! * v['x']! * v['x']!, 2), 'J', IX.green), Readout('Load that gives this x', fx(v['k']! * v['x']! / _g, 2), 'kg')],
  paint: (c, s, v, t) {
    final k = v['k']!, x = v['x']!;
    final left = Rect.fromLTWH(0, 0, s.width * 0.34, s.height);
    final cx = left.center.dx;
    const top = 70.0, natural = 300.0, ppm = 2200.0;
    Draw.ground(c, Offset(cx - 120, top), Offset(cx + 120, top), n: const Offset(0, -1));
    final end = top + natural + x * ppm;
    Draw.spring(c, Offset(cx, top), Offset(cx, end), coils: 16, width: 34 + 2000 / k);
    final m = k * x / _g;
    Draw.block(c, Rect.fromCenter(center: Offset(cx, end + 40), width: 100, height: 80), IX.accent, label: '${fx(m, 2)} kg');
    // A ruler beside it.
    final rx = cx + 110;
    c.drawRect(Rect.fromLTRB(rx, top + natural - 20, rx + 40, top + natural + 0.2 * ppm + 20), Draw.fill(const Color(0xFFF7EBD5)));
    for (var i = 0; i <= 20; i++) {
      final y = top + natural + i * 0.01 * ppm;
      c.drawLine(Offset(rx, y), Offset(rx + (i % 5 == 0 ? 18 : 10), y), Draw.stroke(IX.inkSoft, 1.5));
      if (i % 5 == 0) Draw.text(c, '$i cm', Offset(rx + 46, y), size: 14, color: IX.inkSoft, align: Alignment.centerLeft);
    }
    c.drawLine(Offset(cx - 60, end), Offset(rx + 40, end), Draw.stroke(IX.positive, 2));
    final p = Plot(Rect.fromLTRB(left.right, 26, s.width - 26, s.height - 26), 0, 0.2, 0, 100, xl: 'x (m)', yl: 'F (N)', title: 'F = kx: slope k, area ½kx²');
    p.frame(c);
    p.area(c, (q) => k * q, 0, x, IX.green);
    p.fn(c, (q) => k * q, IX.accent, w: 4);
    p.dot(c, x, k * x, IX.accent, label: '${fx(k * x, 1)} N');
    Draw.text(c, '½kx² = ${fx(0.5 * k * x * x, 2)} J', p.p(x * 0.66, k * x * 0.25), size: 17, color: IX.green, halo: true);
  },
);

// ── Searle's wire ──

const _mats = ['Steel', 'Copper', 'Aluminium'];
const _ys = [200.0, 120.0, 70.0];

double _ext(V v, double m) => m * _g * v['L']! / (math.pi * math.pow(v['d']! / 2000, 2) * _ys[v['mat']!.round()] * 1e9);

final _wire = ModeSpec(
  title: "Load a wire, measure Young's modulus",
  formula: 'Y = FL / (AΔL)',
  values: {'mat': 0, 'L': 2, 'd': 1, 'M': 4},
  controls: (v) => const [Seg('mat', 'Material', _mats), Sl('L', 'Wire length L', 0.5, 3, unit: 'm', div: 25), Sl('d', 'Wire diameter d', 0.4, 3, unit: 'mm', div: 26), Sl('M', 'Load M', 0, 10, unit: 'kg', div: 10)],
  presets: {'Steel, 1 mm': {'mat': 0, 'd': 1}, 'Copper': {'mat': 1}, 'Thick wire': {'d': 2}, 'Short wire': {'L': 1}},
  readouts: (v) {
    final a = math.pi * math.pow(v['d']! / 2000, 2);
    final st = v['M']! * _g / a, ex = _ext(v, v['M']!);
    return [
      Readout('Stress F/A', fx(st / 1e6, 1), 'MPa', IX.accent),
      Readout('Extension ΔL', fx(ex * 1000, 3), 'mm', IX.positive),
      Readout('Strain ΔL/L', fx(ex / v['L']! * 1e4, 2), '× 10⁻⁴'),
      Readout('Stress ÷ strain = Y', fx(_ys[v['mat']!.round()], 0), 'GPa', IX.green),
    ];
  },
  paint: (c, s, v, t) {
    final m = v['M']!;
    final left = Rect.fromLTWH(0, 0, s.width * 0.36, s.height);
    final cx = left.center.dx;
    Draw.ground(c, Offset(cx - 150, 60), Offset(cx + 150, 60), n: const Offset(0, -1));
    final exPx = _ext(v, m) * 1000 * 60; // 1 mm drawn as 60 px
    final bottom = 560 + exPx;
    c.drawLine(Offset(cx - 60, 60), Offset(cx - 60, 560), Draw.stroke(IX.steel, 3)); // reference wire
    c.drawLine(Offset(cx + 30, 60), Offset(cx + 30, bottom), Draw.stroke([IX.inkSoft, PX.copper, IX.steel][v['mat']!.round()], 2 + v['d']!));
    // Main scale on the reference, vernier on the test wire.
    final ms = Rect.fromLTWH(cx - 70, 520, 30, 90);
    c.drawRect(ms, Draw.fill(const Color(0xFFF7EBD5)));
    final vs = Rect.fromLTWH(cx + 18, 520 + exPx, 26, 60);
    c.drawRect(vs, Draw.fill(const Color(0xFFE7EEF8)));
    for (var i = 0; i <= 9; i++) {
      c.drawLine(Offset(ms.left, ms.top + i * 10), Offset(ms.left + 14, ms.top + i * 10), Draw.stroke(IX.inkSoft, 1.2));
    }
    Draw.text(c, 'reference', Offset(cx - 60, 40 - 0), size: 15, color: IX.inkSoft);
    Draw.text(c, 'test wire', Offset(cx + 30, 40), size: 15, color: IX.inkSoft);
    // Hanger with slotted masses.
    final hy = bottom + 70;
    c.drawLine(Offset(cx + 30, bottom + 60), Offset(cx + 30, hy), Draw.stroke(IX.inkSoft, 3));
    for (var i = 0; i < m.round(); i++) {
      Draw.block(c, Rect.fromCenter(center: Offset(cx + 30, hy + 12 + i * 20), width: 110, height: 18), PX.iron, radius: 4);
    }
    Draw.text(c, '${fx(m, 0)} kg', Offset(cx + 110, hy + 12 + math.max(0, m - 1) * 10), size: 18, align: Alignment.centerLeft);
    Draw.text(c, 'ΔL drawn 60 px per mm', Offset(cx, s.height - 30), size: 15, color: IX.inkSoft, w: FontWeight.w500);
    final emax = math.max(0.5, _ext(v, 10) * 1000 * 1.15);
    final p = Plot(Rect.fromLTRB(left.right, 26, s.width - 26, s.height - 26), 0, 10, 0, emax, xl: 'load M (kg)', yl: 'ΔL (mm)', title: 'Extension against load: a straight line');
    p.frame(c);
    p.fn(c, (q) => _ext(v, q) * 1000, IX.accent.withValues(alpha: 0.4), w: 2.5);
    for (var i = 1; i <= m.round(); i++) {
      p.dot(c, i.toDouble(), _ext(v, i.toDouble()) * 1000, IX.accent, rr: 6);
    }
  },
);

// ── shear and bulk ──

const _smats = ['Steel', 'Aluminium', 'Glass'];
const _gs = [84.0, 25.0, 23.0], _bs = [160.0, 72.0, 37.0];

final _shear = ModeSpec(
  title: 'Shearing a cube, squeezing it in the deep sea',
  formula: 'θ = F/(AG),  ΔV/V = p/B',
  values: {'F': 200, 'h': 4, 'mat': 1},
  controls: (v) => const [Seg('mat', 'Material', _smats), Sl('F', 'Sideways force F', 0, 500, unit: 'kN', div: 50), Sl('h', 'Depth in the ocean', 0, 11, unit: 'km', div: 22)],
  presets: {'Aluminium': {'mat': 1}, 'Steel': {'mat': 0}, 'Mariana Trench (11 km)': {'h': 11}},
  readouts: (v) {
    final m = v['mat']!.round();
    final gm = v['F']! * 1e3 / 0.01 / (_gs[m] * 1e9), p = 1025 * _g * v['h']! * 1000;
    return [
      Readout('Shear strain θ', fx(gm * 1e3, 3), '× 10⁻³', IX.accent),
      Readout('Pressure ρgh', fx(p / 1e6, 1), 'MPa'),
      Readout('Volume strain ΔV/V', fx(p / (_bs[m] * 1e9) * 1e3, 3), '× 10⁻³', IX.positive),
      Readout('G / B', '${fx(_gs[m], 0)} / ${fx(_bs[m], 0)}', 'GPa'),
    ];
  },
  paint: (c, s, v, t) {
    final m = v['mat']!.round();
    final gm = v['F']! * 1e3 / 0.01 / (_gs[m] * 1e9), p = 1025 * _g * v['h']! * 1000;
    final dv = p / (_bs[m] * 1e9);
    final half = s.width / 2;
    Draw.caption(c, '10 cm cube; changes drawn 200 times larger.');
    // Left: shear.
    const side = 240.0;
    final r = Rect.fromCenter(center: Offset(half / 2, s.height / 2 + 40), width: side, height: side);
    final dx = gm * 200 * side;
    _box(c, r, const Color(0xFFB9C2D0), skew: Offset(dx, 0));
    Draw.ground(c, Offset(r.left - 60, r.bottom), Offset(r.right + 80, r.bottom));
    Draw.force(c, r.topLeft + Offset(dx - 60 - v['F']! * 0.3, -14), r.topLeft + Offset(dx - 6, -14), IX.accent, 'F', off: const Offset(0, -24));
    Draw.angle(c, r.bottomLeft, -math.pi / 2, -math.pi / 2 + math.atan(dx / side), 130, 'θ');
    Draw.text(c, 'Shear', Offset(half / 2, s.height - 50), size: 20);
    // Right: in the sea.
    final sea = Rect.fromLTRB(half + 20, 90, s.width - 30, s.height - 90);
    c.drawRRect(RRect.fromRectAndRadius(sea, const Radius.circular(14)), Paint()..shader = ui.Gradient.linear(sea.topCenter, sea.bottomCenter, [PX.water, const Color(0xFF5A86B5)]));
    final f = 1 - dv * 200 / 3;
    final cube = Rect.fromCenter(center: sea.center, width: side * f, height: side * f);
    _box(c, cube, const Color(0xFFB9C2D0));
    final ghost = Rect.fromCenter(center: sea.center, width: side, height: side);
    IxPaint.dashed(c, ghost.topLeft, ghost.topRight, Draw.stroke(Colors.white, 2));
    IxPaint.dashed(c, ghost.topRight, ghost.bottomRight, Draw.stroke(Colors.white, 2));
    IxPaint.dashed(c, ghost.bottomRight, ghost.bottomLeft, Draw.stroke(Colors.white, 2));
    IxPaint.dashed(c, ghost.bottomLeft, ghost.topLeft, Draw.stroke(Colors.white, 2));
    Draw.text(c, 'depth ${fx(v['h']!, 1)} km,  p = ${fx(p / 1e6, 0)} MPa', Offset(sea.center.dx, sea.top + 30), size: 18, color: Colors.white);
    Draw.text(c, 'Bulk (hydraulic) compression', Offset(sea.center.dx, s.height - 50), size: 20);
  },
);

// ── compressing a liquid ──

final _bulk = ModeSpec(
  title: 'How much does a liquid compress?',
  formula: 'ΔV/V = p/B',
  values: {'B': 2.2, 'p': 100},
  controls: (v) => const [Sl('B', 'Bulk modulus B', 0.5, 200, unit: 'GPa', dp: 1), Sl('p', 'Extra pressure p', 1, 1000, unit: 'atm', div: 999)],
  presets: {'Water (2.2 GPa)': {'B': 2.2}, 'Glycerine (4.76 GPa)': {'B': 4.76}, 'Mercury (25 GPa)': {'B': 25}, 'Steel (160 GPa)': {'B': 160}},
  readouts: (v) => [Readout('ΔV/V', fx(v['p']! * 101325 / (v['B']! * 1e9) * 100, 3), '%', IX.accent), Readout('Compressibility 1/B', fx(1 / v['B']!, 3), 'per GPa'), Readout('Extra pressure', fx(v['p']! * 0.101325, 1), 'MPa')],
  paint: (c, s, v, t) {
    final frac = v['p']! * 101325 / (v['B']! * 1e9);
    final left = Rect.fromLTWH(0, 0, s.width * 0.36, s.height);
    final cyl = Rect.fromLTWH(left.center.dx - 90, 160, 180, s.height - 260);
    final drop = frac * cyl.height * 20; // drawn 20 times larger
    c.drawRect(Rect.fromLTRB(cyl.left, cyl.top + drop, cyl.right, cyl.bottom), Draw.fill(PX.water));
    c.drawRect(cyl, Draw.stroke(PX.glassFill.withValues(alpha: 1), 0));
    c.drawLine(cyl.topLeft - const Offset(0, 40), cyl.bottomLeft, Draw.stroke(IX.glassEdge, 4));
    c.drawLine(cyl.topRight - const Offset(0, 40), cyl.bottomRight, Draw.stroke(IX.glassEdge, 4));
    c.drawLine(cyl.bottomLeft, cyl.bottomRight, Draw.stroke(IX.glassEdge, 4));
    Draw.block(c, Rect.fromLTRB(cyl.left + 3, cyl.top + drop - 30, cyl.right - 3, cyl.top + drop), PX.iron, radius: 3);
    c.drawRect(Rect.fromLTRB(left.center.dx - 10, 60, left.center.dx + 10, cyl.top + drop - 30), Draw.fill(IX.steel));
    Draw.force(c, Offset(left.center.dx, 20), Offset(left.center.dx, 56), IX.accent, '', w: 5);
    IxPaint.dashed(c, Offset(cyl.left - 30, cyl.top), Offset(cyl.right + 30, cyl.top), Draw.stroke(IX.muted, 2));
    Draw.text(c, 'drawn 20 × larger', Offset(left.center.dx, s.height - 60), size: 16, color: IX.inkSoft, w: FontWeight.w500);
    final p = Plot(Rect.fromLTRB(left.right, 26, s.width - 26, s.height - 26), 0, 1000, 0, math.max(0.05, 1000 * 101325 / (v['B']! * 1e9) * 100 * 1.1), xl: 'p (atm)', yl: 'ΔV/V (%)', title: 'Volume change grows in step with pressure');
    p.frame(c);
    p.fn(c, (q) => q * 101325 / (v['B']! * 1e9) * 100, IX.accent, w: 4);
    p.dot(c, v['p']!, frac * 100, IX.accent, label: '${fx(frac * 100, 3)} %');
  },
);

// ── beam ──

const _bmats = ['Steel', 'Aluminium', 'Wood'];
const _bys = [200.0, 70.0, 10.0];

double _sag(V v, double depthCm, {bool turned = false}) {
  final b = (turned ? depthCm : v['b']!) / 100, d = (turned ? v['b']! : depthCm) / 100;
  return v['W']! * math.pow(v['l']!, 3) / (4 * b * d * d * d * _bys[v['mat']!.round()] * 1e9);
}

final _beam = ModeSpec(
  title: 'Why beams are deep, not wide',
  formula: 'δ = Wl³ / (4bd³Y)',
  values: {'W': 1000, 'l': 2, 'b': 5, 'd': 10, 'mat': 0, 'side': 0},
  controls: (v) => const [Seg('mat', 'Material', _bmats), Sl('W', 'Load W at the middle', 100, 5000, unit: 'N', div: 49), Sl('l', 'Length l', 1, 5, unit: 'm', div: 8), Sl('b', 'Breadth b', 4, 30, unit: 'cm', div: 26), Sl('d', 'Depth d', 4, 20, unit: 'cm', div: 16), Seg('side', 'Orientation', ['Standing on edge', 'Lying flat'])],
  presets: {'Steel 5 × 10 cm': {'mat': 0, 'b': 5, 'd': 10}, 'Same beam, flat': {'mat': 0, 'b': 5, 'd': 10, 'side': 1}, 'Wooden plank': {'mat': 2, 'b': 10, 'd': 10, 'W': 1000}},
  readouts: (v) {
    final flat = v['side'] == 1;
    final sg0 = flat ? _sag(v, v['d']!, turned: true) : _sag(v, v['d']!);
    return [
      Readout('Sag δ', fx(sg0 * 1000, 3), 'mm', IX.accent),
      Readout(flat ? 'Sag standing on edge' : 'Sag lying flat', fx((flat ? _sag(v, v['d']!) : _sag(v, v['d']!, turned: true)) * 1000, 3), 'mm'),
      Readout('Stiffer by (d/b)²', fx(math.pow(v['d']! / v['b']!, 2).toDouble(), 1), '×', IX.green),
    ];
  },
  paint: (c, s, v, t) {
    final flat = v['side'] == 1;
    final sag = flat ? _sag(v, v['d']!, turned: true) : _sag(v, v['d']!);
    final top = Rect.fromLTWH(0, 0, s.width, s.height * 0.5);
    final x0 = 120.0, x1 = top.width - 260, y = 150.0;
    final depthPx = (flat ? v['b']! : v['d']!) * 3.2;
    final sagPx = math.min(140.0, sag * 1000 * 12); // about 12 px per mm
    final path = Path()..moveTo(x0, y);
    final path2 = Path()..moveTo(x0, y + depthPx);
    for (var i = 0; i <= 40; i++) {
      final f = i / 40, dy = sagPx * (3 * f - 4 * f * f * f).clamp(0, 1) * (f <= 0.5 ? 1 : 0) + (f > 0.5 ? sagPx * (3 * (1 - f) - 4 * math.pow(1 - f, 3)) : 0);
      path.lineTo(x0 + (x1 - x0) * f, y + dy);
      path2.lineTo(x0 + (x1 - x0) * f, y + depthPx + dy);
    }
    final shape = Path.from(path);
    for (var i = 40; i >= 0; i--) {
      final f = i / 40, dy = (f <= 0.5 ? sagPx * (3 * f - 4 * f * f * f) : sagPx * (3 * (1 - f) - 4 * math.pow(1 - f, 3)));
      shape.lineTo(x0 + (x1 - x0) * f, y + depthPx + dy);
    }
    shape.close();
    c.drawPath(shape, Draw.fill([IX.steel, const Color(0xFFCBD2DC), PX.wood][v['mat']!.round()]));
    c.drawPath(shape, Draw.stroke(IX.inkSoft, 2));
    for (final x in [x0 + 10, x1 - 10]) {
      final tri = Path()..moveTo(x, y + depthPx)..lineTo(x - 24, y + depthPx + 40)..lineTo(x + 24, y + depthPx + 40)..close();
      c.drawPath(tri, Draw.fill(IX.inkSoft));
    }
    final mid = (x0 + x1) / 2;
    Draw.force(c, Offset(mid, y - 90), Offset(mid, y - 8 + sagPx * 0), IX.accent, '', w: 6);
    Draw.text(c, 'W = ${fx(v['W']!, 0)} N', Offset(mid + 20, y - 70), size: 19, color: IX.accent, align: Alignment.centerLeft);
    Draw.text(c, 'sag drawn about 12 px per mm', Offset(mid, y + depthPx + 80), size: 15, color: IX.inkSoft, w: FontWeight.w500);
    // Cross-section.
    final cs = Rect.fromCenter(center: Offset(top.width - 130, y + 40), width: (flat ? v['d']! : v['b']!) * 4, height: (flat ? v['b']! : v['d']!) * 4);
    Draw.block(c, cs, [IX.steel, const Color(0xFFCBD2DC), PX.wood][v['mat']!.round()], radius: 2);
    Draw.text(c, 'cross-section', Offset(cs.center.dx, cs.bottom + 22), size: 15, color: IX.inkSoft);
    final p = Plot(Rect.fromLTRB(26, top.bottom, s.width - 26, s.height - 22), 4, 20, 0, math.max(1.0, _sag(v, 4) * 1000 * 0.4), xl: 'depth d (cm)', yl: 'sag (mm)', title: 'Sag falls as 1/d³');
    p.frame(c);
    p.fn(c, (q) => _sag(v, q) * 1000, IX.accent, w: 4);
    if (!flat) p.dot(c, v['d']!, sag * 1000, IX.accent, label: '${fx(sag * 1000, 2)} mm');
  },
);

// ───────────────────────────── fluids ─────────────────────────────

void _liquid(Canvas c, Rect r, Color col) => c.drawRect(r, Paint()..shader = ui.Gradient.linear(r.topCenter, r.bottomCenter, [Color.lerp(col, Colors.white, 0.3)!, col]));

final _hydraulic = ModeSpec(
  title: 'Hydraulic lift',
  formula: 'F₁/A₁ = F₂/A₂',
  values: {'F1': 100, 'A1': 10, 'A2': 500},
  controls: (v) => const [Sl('F1', 'Push on small piston F₁', 50, 500, unit: 'N', div: 45), Sl('A1', 'Small piston area A₁', 5, 25, unit: 'cm²', div: 20), Sl('A2', 'Big piston area A₂', 100, 1000, unit: 'cm²', div: 18)],
  presets: {'Car lift': {'F1': 200, 'A1': 10, 'A2': 600}, 'Equal pistons': {'A1': 20, 'A2': 100}},
  readouts: (v) {
    final p = v['F1']! / (v['A1']! * 1e-4), f2 = p * v['A2']! * 1e-4;
    return [Readout('Pressure in the liquid', fx(p / 1000, 1), 'kPa', IX.accent), Readout('Force on big piston F₂', fx(f2, 0), 'N', IX.positive), Readout('Mass it can lift', fx(f2 / _g, 0), 'kg'), Readout('Big piston rises (small down 10 cm)', fx(10 * v['A1']! / v['A2']!, 2), 'cm')];
  },
  paint: (c, s, v, t) {
    final a1 = v['A1']!, a2 = v['A2']!;
    final w1 = 40 + a1 * 2.4, w2 = 120 + a2 * 0.32;
    final base = s.height - 120;
    final x1 = s.width * 0.25, x2 = s.width * 0.62;
    final liq = PX.water;
    final lvl1 = 380.0, lvl2 = 420.0 - 10 * a1 / a2;
    _liquid(c, Rect.fromLTRB(x1 - w1 / 2, lvl1, x1 + w1 / 2, base), liq);
    _liquid(c, Rect.fromLTRB(x2 - w2 / 2, lvl2, x2 + w2 / 2, base), liq);
    _liquid(c, Rect.fromLTRB(x1 - w1 / 2, base - 70, x2 + w2 / 2, base), liq);
    final wall = Draw.stroke(IX.inkSoft, 4);
    c.drawPath(Path()..moveTo(x1 - w1 / 2, 240)..lineTo(x1 - w1 / 2, base)..lineTo(x2 + w2 / 2, base)..lineTo(x2 + w2 / 2, 240), wall);
    c.drawPath(Path()..moveTo(x1 + w1 / 2, 240)..lineTo(x1 + w1 / 2, base - 70)..lineTo(x2 - w2 / 2, base - 70)..lineTo(x2 - w2 / 2, 240), wall);
    Draw.block(c, Rect.fromLTRB(x1 - w1 / 2 + 3, lvl1 - 26, x1 + w1 / 2 - 3, lvl1), PX.iron, radius: 3);
    Draw.block(c, Rect.fromLTRB(x2 - w2 / 2 + 3, lvl2 - 26, x2 + w2 / 2 - 3, lvl2), PX.iron, radius: 3);
    Draw.car(c, Offset(x2, lvl2 - 26), IX.accent, w: math.min(w2 - 10, 200));
    Draw.force(c, Offset(x1, lvl1 - 140), Offset(x1, lvl1 - 32), IX.accent, '', w: 5);
    Draw.text(c, 'F₁ = ${fx(v['F1']!, 0)} N', Offset(x1, lvl1 - 160), size: 19, color: IX.accent);
    final f2 = v['F1']! * a2 / a1;
    Draw.text(c, 'F₂ = ${fx(f2, 0)} N', Offset(x2, lvl2 - 140), size: 19, color: IX.positive);
    Draw.text(c, 'A₁ = ${fx(a1, 0)} cm²', Offset(x1, base + 30), size: 17, color: IX.inkSoft);
    Draw.text(c, 'A₂ = ${fx(a2, 0)} cm²', Offset(x2, base + 30), size: 17, color: IX.inkSoft);
    Draw.tag(c, 'Same pressure everywhere: ${fx(v['F1']! / (a1 * 1e-4) / 1000, 0)} kPa', Offset((x1 + x2) / 2, base - 35), color: IX.accent);
  },
);

const _liqs = ['Water', 'Sea water', 'Oil', 'Mercury'];
const _rhos = [1000.0, 1030.0, 800.0, 13600.0];

final _pressure = ModeSpec(
  title: 'Pressure under a liquid',
  formula: 'P = Pₐ + ρgh',
  values: {'liq': 0, 'h': 10},
  controls: (v) => const [Seg('liq', 'Liquid', _liqs), Sl('h', 'Depth h', 0, 30, unit: 'm', div: 60)],
  presets: {'10 m of water': {'liq': 0, 'h': 10}, '76 cm of mercury': {'liq': 3, 'h': 0.76}, 'Diver at 30 m': {'liq': 1, 'h': 30}},
  readouts: (v) {
    final rho = _rhos[v['liq']!.round()], h = v['h']!;
    return [Readout('Gauge pressure ρgh', fx(rho * _g * h / 1e5, 3), '× 10⁵ Pa', IX.accent), Readout('Absolute pressure', fx((101325 + rho * _g * h) / 1e5, 3), '× 10⁵ Pa', IX.positive), Readout('In atmospheres', fx((101325 + rho * _g * h) / 101325, 2), 'atm')];
  },
  paint: (c, s, v, t) {
    final rho = _rhos[v['liq']!.round()], h = v['h']!;
    final left = Rect.fromLTWH(0, 0, s.width * 0.4, s.height);
    final tank = Rect.fromLTRB(60, 90, left.right - 30, s.height - 60);
    final col = [PX.water, const Color(0xFF8FB8D8), const Color(0xFFE8D27A), const Color(0xFFBFC4CC)][v['liq']!.round()];
    _liquid(c, tank, col);
    c.drawPath(Path()..moveTo(tank.left, tank.top - 20)..lineTo(tank.left, tank.bottom)..lineTo(tank.right, tank.bottom)..lineTo(tank.right, tank.top - 20), Draw.stroke(IX.inkSoft, 4));
    final ppm = tank.height / 30;
    for (var m = 0; m <= 30; m += 5) {
      c.drawLine(Offset(tank.left, tank.top + m * ppm), Offset(tank.left + 16, tank.top + m * ppm), Draw.stroke(IX.ink, 2));
      Draw.text(c, '$m m', Offset(tank.left - 8, tank.top + m * ppm), size: 15, color: IX.inkSoft, align: Alignment.centerRight);
    }
    final probe = Offset(tank.center.dx, tank.top + h * ppm);
    for (var i = 0; i < 8; i++) {
      final a = i * math.pi / 4;
      final u = Offset(math.cos(a), math.sin(a));
      IxPaint.arrow(c, probe + u * (34 + 20 + h * 1.2), probe + u * 22, IX.accent, width: 3, head: 12);
    }
    c.drawCircle(probe, 16, Draw.fill(Colors.white));
    c.drawCircle(probe, 16, Draw.stroke(IX.ink, 3));
    Draw.text(c, 'equal in all directions', Offset(probe.dx, math.min(probe.dy + 90, tank.bottom - 20)), size: 16, color: IX.accent, halo: true);
    final pmax = (101325 + 13600 * _g * 30) / 1e5;
    final p = Plot(Rect.fromLTRB(left.right, 26, s.width - 26, s.height - 26), 0, 30, 0, rho > 5000 ? pmax : 5, xl: 'h (m)', yl: 'P (× 10⁵ Pa)', title: 'Absolute pressure grows linearly with depth');
    p.frame(c);
    p.fn(c, (x) => (101325 + rho * _g * x) / 1e5, IX.accent, w: 4);
    p.hline(c, 1.013, IX.muted, label: 'atmosphere Pₐ');
    p.dot(c, h, (101325 + rho * _g * h) / 1e5, IX.accent);
  },
);

final _continuity = ModeSpec(
  title: 'Flow through a narrowing pipe',
  formula: 'A₁v₁ = A₂v₂',
  values: {'A1': 30, 'A2': 10, 'v1': 0.5},
  controls: (v) => const [Sl('A1', 'Wide part area A₁', 10, 40, unit: 'cm²', div: 30), Sl('A2', 'Narrow part area A₂', 2, 40, unit: 'cm²', div: 38), Sl('v1', 'Speed in wide part v₁', 0.2, 2, unit: 'm/s', div: 18)],
  presets: {'3 : 1 narrowing': {'A1': 30, 'A2': 10}, 'Garden hose nozzle': {'A1': 20, 'A2': 2, 'v1': 0.5}, 'No narrowing': {'A1': 20, 'A2': 20}},
  animate: true,
  readouts: (v) {
    final v2 = v['v1']! * v['A1']! / v['A2']!;
    return [Readout('Speed in narrow part v₂', fx(v2), 'm/s', IX.positive), Readout('Flow A₁v₁', fx(0.1 * v['A1']! * v['v1']!, 2), 'L/s', IX.accent), Readout('Flow A₂v₂', fx(0.1 * v['A2']! * v2, 2), 'L/s', IX.accent)];
  },
  paint: (c, s, v, t) {
    final a1 = v['A1']!, a2 = v['A2']!, v1 = v['v1']!;
    final top = Rect.fromLTWH(0, 0, s.width, s.height * 0.5);
    final cy = top.center.dy + 10;
    double halfAt(double x) {
      final f = ((x - top.width * 0.4) / (top.width * 0.2)).clamp(0.0, 1.0);
      final sm = f * f * (3 - 2 * f);
      return math.sqrt(a1 + (a2 - a1) * sm) * 26;
    }
    final upper = Path(), lower = Path();
    for (var x = 30.0; x <= top.width - 30; x += 6) {
      x == 30 ? upper.moveTo(x, cy - halfAt(x)) : upper.lineTo(x, cy - halfAt(x));
      x == 30 ? lower.moveTo(x, cy + halfAt(x)) : lower.lineTo(x, cy + halfAt(x));
    }
    final body = Path.from(upper);
    for (var x = top.width - 30; x >= 30; x -= 6) {
      body.lineTo(x, cy + halfAt(x));
    }
    body.close();
    c.drawPath(body, Draw.fill(PX.water.withValues(alpha: 0.8)));
    c.drawPath(upper, Draw.stroke(IX.inkSoft, 5));
    c.drawPath(lower, Draw.stroke(IX.inkSoft, 5));
    // Tracer dots ride a volume coordinate: equal volumes pass each section per second, so a
    // dot covers ground faster where the pipe is narrow (speed ∝ 1/A).
    final xs = <double>[], cum = <double>[];
    var acc = 0.0;
    for (var x = 30.0; x <= top.width - 30; x += 4) {
      xs.add(x);
      cum.add(acc);
      acc += halfAt(x) * halfAt(x);
    }
    double xAtVol(double q) {
      final target = q * acc;
      var i = 0;
      while (i < cum.length - 1 && cum[i + 1] < target) {
        i++;
      }
      return xs[i];
    }
    for (var row = -2; row <= 2; row++) {
      for (var k = 0; k < 14; k++) {
        final x = xAtVol((k / 14 + t * v1 * 0.08 + row * 0.013) % 1.0);
        final h = halfAt(x);
        final y = cy + row / 2.6 * h;
        c.drawCircle(Offset(x, y), 5, Draw.fill(IX.accent.withValues(alpha: 0.75)));
      }
    }
    Draw.text(c, 'v₁ = ${fx(v1)} m/s', Offset(top.width * 0.2, cy - halfAt(0) - 30), size: 19, color: IX.accent);
    Draw.text(c, 'v₂ = ${fx(v1 * a1 / a2)} m/s', Offset(top.width * 0.8, cy - halfAt(top.width) - 30), size: 19, color: IX.positive);
    final p = Plot(Rect.fromLTRB(26, top.bottom, s.width - 26, s.height - 22), 2, 40, 0, math.max(2.0, v1 * a1 / 2 * 1.05), xl: 'narrow area A₂ (cm²)', yl: 'v₂ (m/s)', title: 'v₂ = A₁v₁ / A₂');
    p.frame(c);
    p.fn(c, (x) => v1 * a1 / x, IX.positive, w: 4);
    p.dot(c, a2, v1 * a1 / a2, IX.positive);
  },
);

final _torricelli = ModeSpec(
  title: 'Water jet from a tank',
  formula: 'v = √(2gh),  range = 2√(h(H − h))',
  values: {'H': 2, 'h': 1},
  controls: (v) => [const Sl('H', 'Water height H', 1, 10, unit: 'm', div: 18), Sl('h', 'Hole depth below surface h', 0, v['H']!, unit: 'm')],
  presets: {'Hole half way (longest jet)': {'H': 8, 'h': 4}, 'Near the top': {'H': 8, 'h': 1}, 'Near the bottom': {'H': 8, 'h': 7}},
  readouts: (v) {
    final hh = v['H']!, h = v['h']!.clamp(0.0, v['H']!);
    return [Readout('Speed of efflux √(2gh)', fx(math.sqrt(2 * _g * h)), 'm/s', IX.accent), Readout('Range on the ground', fx(2 * math.sqrt(h * (hh - h))), 'm', IX.positive), Readout('Hole height above ground', fx(hh - h), 'm')];
  },
  paint: (c, s, v, t) {
    final hh = v['H']!, h = v['h']!.clamp(0.0, v['H']!);
    final left = Rect.fromLTWH(0, 0, s.width * 0.55, s.height);
    final gy = s.height - 80, ppm = (gy - 100) / 10;
    final tank = Rect.fromLTRB(70, gy - hh * ppm - 30, 230, gy);
    Draw.ground(c, Offset(40, gy), Offset(left.right - 10, gy));
    _liquid(c, Rect.fromLTRB(tank.left, gy - hh * ppm, tank.right, gy), PX.water);
    c.drawPath(Path()..moveTo(tank.left, tank.top)..lineTo(tank.left, gy)..lineTo(tank.right, gy)..lineTo(tank.right, tank.top), Draw.stroke(IX.inkSoft, 4));
    final hole = Offset(tank.right, gy - (hh - h) * ppm);
    final vv = math.sqrt(2 * _g * h), y0 = hh - h;
    final tf = math.sqrt(2 * y0 / _g);
    final jet = Path()..moveTo(hole.dx, hole.dy);
    for (var i = 1; i <= 40; i++) {
      final tt = tf * i / 40;
      jet.lineTo(hole.dx + vv * tt * ppm, hole.dy + 0.5 * _g * tt * tt * ppm);
    }
    c.drawPath(jet, Draw.stroke(PX.waterEdge, 7));
    Draw.dim(c, Offset(tank.left - 26, gy - hh * ppm), Offset(tank.left - 26, hole.dy), 'h', color: IX.accent, off: -20);
    final range = 2 * math.sqrt(h * (hh - h));
    Draw.text(c, '${fx(range)} m', Offset(hole.dx + range * ppm, gy + 26), size: 18, color: IX.positive);
    final p = Plot(Rect.fromLTRB(left.right, 26, s.width - 26, s.height - 26), 0, hh, 0, hh * 1.1, xl: 'hole depth h (m)', yl: 'range (m)', title: 'Range against hole depth');
    p.frame(c);
    p.fn(c, (x) => 2 * math.sqrt(math.max(0, x * (hh - x))), IX.positive, w: 4);
    p.vline(c, hh / 2, IX.muted, label: 'h = H/2');
    p.dot(c, h, range, IX.positive);
  },
);

const _balls = ['Steel', 'Aluminium', 'Glass'];
const _bd = [7800.0, 2700.0, 2500.0];

final _stokes = ModeSpec(
  title: 'A ball sinking in glycerine',
  formula: 'vₜ = 2r²(ρ − σ)g / 9η',
  values: {'ball': 0, 'r': 1.5, 'eta': 0.85, 'sig': 1260, 'tt': 0.3},
  controls: (v) => const [Seg('ball', 'Ball', _balls), Sl('r', 'Radius r', 0.5, 4, unit: 'mm', div: 35), Sl('eta', 'Viscosity η', 0.1, 2, unit: 'Pa s', div: 38), Sl('sig', 'Liquid density σ', 800, 1500, unit: 'kg/m³', div: 14), Sl('tt', 'Time t', 0, 1, unit: 's', div: 50)],
  presets: {'Steel in glycerine': {'ball': 0, 'r': 1.5, 'eta': 0.85}, 'Double the radius': {'ball': 0, 'r': 3}, 'Glass bead': {'ball': 2, 'r': 1.5}},
  readouts: (v) {
    final (vt, tau) = _vt(v);
    final rr = v['r']! / 1000;
    return [Readout('Terminal velocity', fx(vt * 100, 2), 'cm/s', IX.accent), Readout('Time constant 2ρr²/9η', fx(tau * 1000, 1), 'ms'), Readout('Drag at vₜ', fx(4 / 3 * math.pi * rr * rr * rr * (_bd[v['ball']!.round()] - v['sig']!) * _g * 1000, 3), 'mN', IX.positive)];
  },
  paint: (c, s, v, t) {
    final (vt, tau) = _vt(v);
    final tt = v['tt']!;
    final vel = vt * (1 - math.exp(-tt / tau));
    final left = Rect.fromLTWH(0, 0, s.width * 0.36, s.height);
    final jar = Rect.fromLTRB(left.center.dx - 90, 70, left.center.dx + 90, s.height - 50);
    _liquid(c, jar, const Color(0xFFF2E6B8));
    c.drawPath(Path()..moveTo(jar.left, jar.top - 20)..lineTo(jar.left, jar.bottom)..lineTo(jar.right, jar.bottom)..lineTo(jar.right, jar.top - 20), Draw.stroke(IX.glassEdge, 4));
    final y = (jar.top + 40 + (vt * tt - vt * tau * (1 - math.exp(-tt / tau))) * 1500).clamp(jar.top + 40, jar.bottom - 40);
    final b = Offset(jar.center.dx, y);
    final rpx = 8 + v['r']! * 5;
    Draw.ball(c, b, rpx, [PX.iron, IX.steel, const Color(0xFF9FC5C0)][v['ball']!.round()]);
    final w = 1.0;
    final frac = vel / vt;
    Draw.force(c, b + Offset(0, rpx), b + Offset(0, rpx + 90 * w), IX.inkSoft, 'W', w: 4);
    Draw.force(c, b + Offset(-30, -rpx), b + Offset(-30, -rpx - 90 * v['sig']! / _bd[v['ball']!.round()]), IX.green, 'U', w: 4);
    Draw.force(c, b + Offset(30, -rpx), b + Offset(30, -rpx - 90 * (1 - v['sig']! / _bd[v['ball']!.round()]) * frac), IX.positive, '6πηrv', w: 4);
    final p = Plot(Rect.fromLTRB(left.right, 26, s.width - 26, s.height - 26), 0, 1, 0, math.max(1.0, vt * 100 * 1.25), xl: 't (s)', yl: 'v (cm/s)', title: 'Speed rises to the terminal velocity');
    p.frame(c);
    p.fn(c, (x) => vt * 100 * (1 - math.exp(-x / tau)), IX.accent, w: 4);
    p.hline(c, vt * 100, IX.positive, label: 'vₜ = ${fx(vt * 100, 2)} cm/s');
    p.dot(c, tt, vel * 100, IX.accent);
  },
);

(double, double) _vt(V v) {
  final r = v['r']! / 1000, rho = _bd[v['ball']!.round()], sig = v['sig']!, eta = v['eta']!;
  return (2 * r * r * (rho - sig) * _g / (9 * eta), 2 * rho * r * r / (9 * eta));
}

const _cliq = ['Water', 'Alcohol', 'Mercury'];
const _cS = [0.073, 0.022, 0.465], _cTh = [0.0, 0.0, 140.0], _cRho = [1000.0, 790.0, 13600.0];

double _rise(int l, double rmm) => 2 * _cS[l] * math.cos(rad(_cTh[l])) / (_cRho[l] * _g * rmm / 1000);

final _capillary = ModeSpec(
  title: 'Capillary rise',
  formula: 'h = 2S cos θ / (ρgr)',
  values: {'liq': 0, 'r': 0.25},
  controls: (v) => const [Seg('liq', 'Liquid', _cliq), Sl('r', 'Tube radius r', 0.1, 2, unit: 'mm', div: 38)],
  presets: {'Water, 0.25 mm': {'liq': 0, 'r': 0.25}, 'Wider tube': {'liq': 0, 'r': 0.5}, 'Mercury (falls)': {'liq': 2, 'r': 0.5}},
  readouts: (v) {
    final l = v['liq']!.round();
    return [Readout('Rise h (− = fall)', sg(_rise(l, v['r']!) * 100, 2), 'cm', IX.accent), Readout('Rise in tube of 2r', sg(_rise(l, 2 * v['r']!) * 100, 2), 'cm'), Readout('Surface tension S', fx(_cS[l], 3), 'N/m'), Readout('Contact angle θ', fx(_cTh[l], 0), '°')];
  },
  paint: (c, s, v, t) {
    final l = v['liq']!.round(), r = v['r']!;
    final left = Rect.fromLTWH(0, 0, s.width * 0.45, s.height);
    final surf = s.height * 0.62;
    final dish = Rect.fromLTRB(40, surf, left.right - 30, s.height - 60);
    final col = [PX.water, const Color(0xFFD9E9C8), const Color(0xFFBFC4CC)][l];
    _liquid(c, dish, col);
    c.drawPath(Path()..moveTo(dish.left, surf - 40)..lineTo(dish.left, dish.bottom)..lineTo(dish.right, dish.bottom)..lineTo(dish.right, surf - 40), Draw.stroke(IX.glassEdge, 4));
    const cmPx = 9.0; // 1 cm drawn as 9 px
    for (final (i, rr) in [(0, r), (1, 2 * r)]) {
      final x = left.width * (0.35 + i * 0.3);
      final h = _rise(l, rr) * 100 * cmPx;
      final w = 10 + rr * 18;
      _liquid(c, Rect.fromLTRB(x - w / 2, math.min(surf, surf - h), x + w / 2, surf + 120), col);
      if (h < 0) c.drawRect(Rect.fromLTRB(x - w / 2, surf, x + w / 2, surf - h), Draw.fill(Colors.white));
      c.drawLine(Offset(x - w / 2 - 3, 60), Offset(x - w / 2 - 3, surf + 120), Draw.stroke(IX.glassEdge, 3));
      c.drawLine(Offset(x + w / 2 + 3, 60), Offset(x + w / 2 + 3, surf + 120), Draw.stroke(IX.glassEdge, 3));
      // Meniscus: concave up for wetting liquids, convex for mercury.
      final my = surf - h;
      c.drawArc(Rect.fromCenter(center: Offset(x, my + (l == 2 ? 6 : -6)), width: w, height: 12), l == 2 ? math.pi : 0, math.pi, false, Draw.stroke(IX.inkSoft, 2));
      Draw.text(c, i == 0 ? 'r' : '2r', Offset(x, 40), size: 18, color: IX.inkSoft);
      Draw.text(c, '${sg(_rise(l, rr) * 100, 1)} cm', Offset(x + w / 2 + 12, my), size: 17, color: IX.accent, align: Alignment.centerLeft, halo: true);
    }
    final p = Plot(Rect.fromLTRB(left.right, 26, s.width - 26, s.height - 26), 0.1, 2, l == 2 ? -6 : 0, l == 2 ? 0 : 15, xl: 'r (mm)', yl: 'h (cm)', title: 'h ∝ 1/r');
    p.frame(c);
    p.fn(c, (x) => _rise(l, x) * 100, IX.accent, w: 4);
    p.dot(c, r, _rise(l, r) * 100, IX.accent);
    p.dot(c, 2 * r, _rise(l, 2 * r) * 100, IX.muted, label: '2r');
  },
);
