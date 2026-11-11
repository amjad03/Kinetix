import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'kit.dart';

/// Vectors (1st PUC ch. 3, products from ch. 6, the river crossing from ch. 15): two vectors on
/// a grid with their resultant, components, and the dot and cross products.
final vectorsSpec = InstrumentSpec(
  id: 'vectors',
  chapter: '1st PUC Physics · Motion in a plane',
  modes: {'add': _add, 'components': _components, 'angle': _angle, 'products': _products, 'river': _river},
);

/// A grid of 1-unit squares centred in [r] with [u] px per unit; returns the origin.
Offset _grid(Canvas c, Rect r, double u, {Offset? origin}) {
  final o = origin ?? r.center;
  final minor = Draw.stroke(IX.grid, 1.2);
  for (var x = o.dx - ((o.dx - r.left) / u).floor() * u; x <= r.right; x += u) {
    c.drawLine(Offset(x, r.top), Offset(x, r.bottom), minor);
  }
  for (var y = o.dy - ((o.dy - r.top) / u).floor() * u; y <= r.bottom; y += u) {
    c.drawLine(Offset(r.left, y), Offset(r.right, y), minor);
  }
  final ax = Draw.stroke(IX.inkSoft, 2);
  c.drawLine(Offset(r.left, o.dy), Offset(r.right, o.dy), ax);
  c.drawLine(Offset(o.dx, r.top), Offset(o.dx, r.bottom), ax);
  Draw.text(c, 'x', Offset(r.right - 14, o.dy - 18), size: 18, color: IX.inkSoft);
  Draw.text(c, 'y', Offset(o.dx + 16, r.top + 14), size: 18, color: IX.inkSoft);
  return o;
}

void _vec(Canvas c, Offset from, Offset to, Color col, String label, {double w = 6}) {
  IxPaint.arrow(c, from, to, col, width: w, head: 24);
  final d = to - from;
  if (d.distance < 1) return;
  final n = Offset(-d.dy, d.dx) / d.distance;
  Draw.text(c, label, Offset.lerp(from, to, 0.55)! + n * 24, size: 22, color: col, halo: true);
}

String _ang(double a) => '${fx((deg(a) % 360 + 360) % 360, 1)}°';

// ── add by dragging ──

final _add = ModeSpec(
  title: 'Add two vectors',
  formula: 'R = A + kB',
  values: {'ax': 6, 'ay': 2, 'bx': 2, 'by': 5, 'k': 1, 'para': 1},
  controls: (v) => const [Sl('k', 'Multiply B by k', -1.5, 1.5, div: 12), Sl('ax', 'Aₓ', -10, 10, div: 20), Sl('ay', 'Aᵧ', -10, 10, div: 20), Sl('bx', 'Bₓ', -10, 10, div: 20), Sl('by', 'Bᵧ', -10, 10, div: 20), Seg('para', 'Parallelogram', ['Hidden', 'Shown'])],
  presets: {'A + B': {'k': 1}, 'A − B': {'k': -1}, 'Perpendicular': {'ax': 6, 'ay': 0, 'bx': 0, 'by': 5}, 'Opposite': {'ax': 6, 'ay': 0, 'bx': -3, 'by': 0}},
  readouts: (v) {
    final k = v['k']!;
    final rx = v['ax']! + k * v['bx']!, ry = v['ay']! + k * v['by']!;
    return [
      Readout('|R|', fx(math.sqrt(rx * rx + ry * ry)), '', IX.positive),
      Readout('Direction of R', _ang(math.atan2(ry, rx)), ''),
      Readout('|A| + |kB|', fx(math.sqrt(v['ax']! * v['ax']! + v['ay']! * v['ay']!) + k.abs() * math.sqrt(v['bx']! * v['bx']! + v['by']! * v['by']!))),
      Readout('R components', '(${fx(rx, 1)}, ${fx(ry, 1)})', ''),
    ];
  },
  drag: (v, p, s, start) {
    final u = s.height / 24, o = s.center(Offset.zero) + Offset(-u * 4, u * 3);
    Offset px(double x, double y) => o + Offset(x, -y) * u;
    final k = v['k']!;
    final i = pick(v, p, start, [px(v['ax']!, v['ay']!), px(v['ax']! + k * v['bx']!, v['ay']! + k * v['by']!)]);
    if (i == null) return false;
    final q = (p - o) / u;
    if (i == 0) {
      v['ax'] = q.dx.roundToDouble().clamp(-10, 10);
      v['ay'] = (-q.dy).roundToDouble().clamp(-10, 10);
    } else if (k.abs() > 0.05) {
      v['bx'] = ((q.dx - v['ax']!) / k).roundToDouble().clamp(-10, 10);
      v['by'] = ((-q.dy - v['ay']!) / k).roundToDouble().clamp(-10, 10);
    }
    return true;
  },
  paint: (c, s, v, t) {
    final u = s.height / 24;
    final o = _grid(c, Offset.zero & s, u, origin: s.center(Offset.zero) + Offset(-u * 4, u * 3));
    Offset px(double x, double y) => o + Offset(x, -y) * u;
    final k = v['k']!;
    final a = px(v['ax']!, v['ay']!), kb = Offset(k * v['bx']!, k * v['by']!), r = px(v['ax']! + kb.dx, v['ay']! + kb.dy);
    final kbEnd = px(kb.dx, kb.dy);
    if (v['para'] == 1) {
      final pa = Path()..moveTo(o.dx, o.dy)..lineTo(a.dx, a.dy)..lineTo(r.dx, r.dy)..lineTo(kbEnd.dx, kbEnd.dy)..close();
      c.drawPath(pa, Draw.fill(IX.accent.withValues(alpha: 0.05)));
      _vec(c, o, kbEnd, IX.green.withValues(alpha: 0.45), '', w: 3);
      IxPaint.dashed(c, kbEnd, r, Draw.stroke(IX.accent.withValues(alpha: 0.5), 2));
    }
    _vec(c, o, a, IX.accent, 'A');
    _vec(c, a, r, IX.green, k == 1 ? 'B' : '${fx(k, 2)} B');
    _vec(c, o, r, IX.positive, 'R', w: 7);
    IxPaint.handle(c, a, IX.accent, r: 15, active: v['_drag'] == 0);
    IxPaint.handle(c, r, IX.green, r: 15, active: v['_drag'] == 1);
    Draw.caption(c, 'Drag the heads of A and B. Triangle law: B starts where A ends.');
  },
);

// ── components ──

final _components = ModeSpec(
  title: 'Components do the adding',
  formula: 'Rₓ = Aₓ + Bₓ,  Rᵧ = Aᵧ + Bᵧ',
  values: {'Am': 6, 'ta': 30, 'Bm': 4, 'tb': 120, 'comps': 1},
  controls: (v) => const [Sl('Am', '|A|', 1, 8, div: 14), Sl('ta', 'Angle of A', 0, 360, unit: '°', div: 72), Sl('Bm', '|B|', 1, 8, div: 14), Sl('tb', 'Angle of B', 0, 360, unit: '°', div: 72), Seg('comps', 'Components', ['Hidden', 'Shown'])],
  presets: {'30° and 120°': {'ta': 30, 'tb': 120}, 'Same direction': {'ta': 45, 'tb': 45}, 'Opposite': {'ta': 0, 'tb': 180}},
  readouts: (v) {
    final ax = v['Am']! * math.cos(rad(v['ta']!)), ay = v['Am']! * math.sin(rad(v['ta']!));
    final bx = v['Bm']! * math.cos(rad(v['tb']!)), by = v['Bm']! * math.sin(rad(v['tb']!));
    final rx = ax + bx, ry = ay + by;
    return [
      Readout('Rₓ = Aₓ + Bₓ', sg(rx), '', IX.accent),
      Readout('Rᵧ = Aᵧ + Bᵧ', sg(ry), '', IX.green),
      Readout('|R| = √(Rₓ² + Rᵧ²)', fx(math.sqrt(rx * rx + ry * ry)), '', IX.positive),
      Readout('Direction α', _ang(math.atan2(ry, rx)), ''),
    ];
  },
  paint: (c, s, v, t) {
    final u = s.height / 22;
    final o = _grid(c, Offset.zero & s, u);
    Offset px(double x, double y) => o + Offset(x, -y) * u;
    final ax = v['Am']! * math.cos(rad(v['ta']!)), ay = v['Am']! * math.sin(rad(v['ta']!));
    final bx = v['Bm']! * math.cos(rad(v['tb']!)), by = v['Bm']! * math.sin(rad(v['tb']!));
    if (v['comps'] == 1) {
      for (final (x, y, col, n) in [(ax, ay, IX.accent, 'A'), (bx, by, IX.green, 'B')]) {
        final p = Draw.stroke(col.withValues(alpha: 0.7), 2);
        IxPaint.dashed(c, px(x, y), px(x, 0), p);
        IxPaint.dashed(c, px(x, y), px(0, y), p);
        IxPaint.arrow(c, o, px(x, 0), col.withValues(alpha: 0.75), width: 4, head: 14);
        IxPaint.arrow(c, o, px(0, y), col.withValues(alpha: 0.75), width: 4, head: 14);
        Draw.text(c, '$nₓ = ${fx(x, 1)}', px(x, 0) + Offset(0, y >= 0 ? 22 : -22), size: 16, color: col, halo: true);
        Draw.text(c, '$nᵧ = ${fx(y, 1)}', px(0, y) + Offset(x >= 0 ? -16 : 16, 0), size: 16, color: col, align: x >= 0 ? Alignment.centerRight : Alignment.centerLeft, halo: true);
      }
    }
    _vec(c, o, px(ax, ay), IX.accent, 'A');
    _vec(c, o, px(bx, by), IX.green, 'B');
    _vec(c, o, px(ax + bx, ay + by), IX.positive, 'R', w: 7);
    IxPaint.dashed(c, px(ax, ay), px(ax + bx, ay + by), Draw.stroke(IX.muted, 2));
    IxPaint.dashed(c, px(bx, by), px(ax + bx, ay + by), Draw.stroke(IX.muted, 2));
  },
);

// ── two vectors at angle θ ──

final _angle = ModeSpec(
  title: 'Resultant of two vectors at an angle',
  formula: 'R² = A² + B² + 2AB cos θ',
  values: {'A': 3, 'B': 4, 'th': 60},
  controls: (v) => const [Sl('A', 'Magnitude A', 0, 10, div: 20), Sl('B', 'Magnitude B', 0, 10, div: 20), Sl('th', 'Angle θ between them', 0, 180, unit: '°', div: 36)],
  presets: {'θ = 0°': {'th': 0}, 'θ = 90° (3-4-5)': {'th': 90, 'A': 3, 'B': 4}, 'θ = 120°': {'th': 120, 'A': 4, 'B': 4}, 'θ = 180°': {'th': 180}},
  readouts: (v) {
    final a = v['A']!, b = v['B']!, th = rad(v['th']!);
    final r = math.sqrt(math.max(0, a * a + b * b + 2 * a * b * math.cos(th)));
    return [
      Readout('Rₓ = A + B cos θ', fx(a + b * math.cos(th)), '', IX.accent),
      Readout('Rᵧ = B sin θ', fx(b * math.sin(th)), '', IX.green),
      Readout('R (law of cosines)', fx(r), '', IX.positive),
      Readout('Angle of R with A', fx(deg(math.atan2(b * math.sin(th), a + b * math.cos(th))), 1), '°'),
    ];
  },
  paint: (c, s, v, t) {
    final left = Rect.fromLTWH(0, 0, s.width * 0.55, s.height);
    final u = left.height / 22;
    final o = _grid(c, left, u, origin: Offset(left.width * 0.42, left.height * 0.68));
    Offset px(double x, double y) => o + Offset(x, -y) * u;
    final a = v['A']!, b = v['B']!, th = rad(v['th']!);
    final bx = b * math.cos(th), by = b * math.sin(th);
    _vec(c, o, px(a, 0), IX.accent, 'A');
    _vec(c, o, px(bx, by), IX.green, 'B');
    IxPaint.dashed(c, px(a, 0), px(a + bx, by), Draw.stroke(IX.green.withValues(alpha: 0.6), 2.5));
    IxPaint.dashed(c, px(bx, by), px(a + bx, by), Draw.stroke(IX.accent.withValues(alpha: 0.6), 2.5));
    _vec(c, o, px(a + bx, by), IX.positive, 'R', w: 7);
    if (v['th']! > 3) Draw.angle(c, o, -th, 0, 56, 'θ');
    final p = Plot(Rect.fromLTRB(left.right + 10, 26, s.width - 26, s.height - 26), 0, 180, 0, 20, xl: 'θ (°)', yl: 'R', title: 'R falls from A + B to |A − B|');
    p.frame(c);
    p.fn(c, (x) => math.sqrt(math.max(0, a * a + b * b + 2 * a * b * math.cos(rad(x)))), IX.positive, w: 4);
    p.hline(c, a + b, IX.muted, label: 'A + B');
    p.hline(c, (a - b).abs(), IX.muted, label: '|A − B|');
    p.dot(c, v['th']!, math.sqrt(math.max(0, a * a + b * b + 2 * a * b * math.cos(th))), IX.positive);
  },
);

// ── dot and cross products ──

final _products = ModeSpec(
  title: 'Scalar and vector products',
  chapter: '1st PUC Physics · System of particles and rotational motion',
  formula: 'A·B = AB cos θ,  |A×B| = AB sin θ',
  values: {'A': 4, 'B': 3, 'th': 60},
  controls: (v) => const [Sl('A', 'Magnitude A', 0, 10, div: 20), Sl('B', 'Magnitude B', 0, 10, div: 20), Sl('th', 'Angle θ', 0, 180, unit: '°', div: 36)],
  presets: {'Parallel': {'th': 0}, 'θ = 45°': {'th': 45}, 'Perpendicular': {'th': 90}, 'Antiparallel': {'th': 180}},
  readouts: (v) {
    final a = v['A']!, b = v['B']!, th = rad(v['th']!);
    return [
      Readout('A · B = AB cos θ', sg(a * b * math.cos(th)), '', IX.accent),
      Readout('|A × B| = AB sin θ', fx(a * b * math.sin(th)), '', IX.positive),
      Readout('A × B points', math.sin(th) < 1e-6 ? '— (zero)' : 'out of the page ⊙', ''),
    ];
  },
  paint: (c, s, v, t) {
    final left = Rect.fromLTWH(0, 0, s.width * 0.5, s.height);
    final u = left.height / 20;
    final o = _grid(c, left, u, origin: Offset(left.width * 0.35, left.height * 0.65));
    Offset px(double x, double y) => o + Offset(x, -y) * u;
    final a = v['A']!, b = v['B']!, th = rad(v['th']!);
    final bx = b * math.cos(th), by = b * math.sin(th);
    final par = Path()..moveTo(o.dx, o.dy)..lineTo(px(a, 0).dx, px(a, 0).dy)..lineTo(px(a + bx, by).dx, px(a + bx, by).dy)..lineTo(px(bx, by).dx, px(bx, by).dy)..close();
    c.drawPath(par, Draw.fill(IX.positive.withValues(alpha: 0.12)));
    Draw.text(c, 'area = |A × B|', Offset.lerp(o, px(a + bx, by), 0.5)!, size: 17, color: IX.positive, halo: true);
    IxPaint.dashed(c, px(bx, by), px(bx, 0), Draw.stroke(IX.accent.withValues(alpha: 0.7), 2));
    c.drawLine(o, px(bx, 0), Draw.stroke(IX.accent.withValues(alpha: 0.5), 8));
    Draw.text(c, 'B cos θ', px(bx / 2, 0) + const Offset(0, 24), size: 16, color: IX.accent, halo: true);
    _vec(c, o, px(a, 0), IX.ink, 'A');
    _vec(c, o, px(bx, by), IX.green, 'B');
    if (v['th']! > 3) Draw.angle(c, o, -th, 0, 50, 'θ');
    if (math.sin(th) > 1e-6) {
      c.drawCircle(o, 16, Draw.stroke(IX.positive, 3));
      c.drawCircle(o, 5, Draw.fill(IX.positive));
      Draw.text(c, 'A × B (out of page)', o + const Offset(-24, 30), size: 16, color: IX.positive, align: Alignment.centerRight, halo: true);
    }
    final p = Plot(Rect.fromLTRB(left.right + 10, 26, s.width - 26, s.height - 26), 0, 180, -100, 100, xl: 'θ (°)', yl: 'product', title: 'Against the angle between them');
    p.frame(c);
    p.fn(c, (x) => a * b * math.cos(rad(x)), IX.accent, w: 4, label: 'A · B', labelAt: 25);
    p.fn(c, (x) => a * b * math.sin(rad(x)), IX.positive, w: 4, label: '|A × B|', labelAt: 90);
    p.vline(c, v['th']!, IX.muted);
  },
);

// ── river crossing ──

final _river = ModeSpec(
  title: 'Steer a boat across a river',
  chapter: '1st PUC Physics · Relative velocity',
  formula: 'v_ground = v_boat + v_river',
  values: {'vb': 4, 'vr': 3, 'th': 0, 'w': 120},
  controls: (v) => const [Sl('vb', 'Boat speed in still water', 2, 6, unit: 'm/s', div: 8), Sl('vr', 'River speed', 0, 4, unit: 'm/s', div: 8), Sl('th', 'Heading upstream', 0, 60, unit: '°', div: 12), Sl('w', 'River width', 40, 200, unit: 'm', div: 16)],
  presets: {'Head straight across': {'th': 0}, 'Reach straight opposite': {'vb': 4, 'vr': 2, 'th': 30}, 'Strong current': {'vb': 3, 'vr': 4, 'th': 20}},
  readouts: (v) {
    final vb = v['vb']!, vr = v['vr']!, th = rad(v['th']!), w = v['w']!;
    final uy = vb * math.cos(th), ux = vr - vb * math.sin(th);
    final tt = w / uy;
    return [
      Readout('Crossing time', fx(tt, 1), 's', IX.accent),
      Readout('Drift downstream', sg(ux * tt, 1), 'm', IX.positive),
      Readout('Speed over ground', fx(math.sqrt(ux * ux + uy * uy)), 'm/s', IX.green),
      Readout('Heading for no drift', vb > vr ? '${fx(deg(math.asin(vr / vb)), 1)}°' : 'impossible', ''),
    ];
  },
  paint: (c, s, v, t) {
    final vb = v['vb']!, vr = v['vr']!, th = rad(v['th']!), w = v['w']!;
    final uy = vb * math.cos(th), ux = vr - vb * math.sin(th);
    final tt = w / uy, drift = ux * tt;
    final bank1 = s.height - 130, bank2 = 110.0, ppm = (bank1 - bank2) / w;
    c.drawRect(Rect.fromLTRB(0, bank2, s.width, bank1), Draw.fill(PX.water.withValues(alpha: 0.6)));
    for (final y in [bank2, bank1]) {
      c.drawRect(Rect.fromLTRB(0, y == bank2 ? 0 : y, s.width, y == bank2 ? y : s.height), Draw.fill(const Color(0xFFE9E3D3)));
      c.drawLine(Offset(0, y), Offset(s.width, y), Draw.stroke(const Color(0xFFB8AC8C), 3));
    }
    for (var i = 0; i < 6; i++) {
      final y = bank2 + (bank1 - bank2) * (i + 0.5) / 6;
      for (var x = 60.0 + (i.isOdd ? 90 : 0); x < s.width; x += 240) {
        IxPaint.arrow(c, Offset(x, y), Offset(x + 30 + vr * 14, y), PX.waterEdge.withValues(alpha: 0.7), width: 2.5, head: 10);
      }
    }
    final start = Offset(s.width * 0.35, bank1);
    final end = start + Offset(drift * ppm, -(bank1 - bank2));
    IxPaint.dashed(c, start, Offset(start.dx, bank2), Draw.stroke(IX.muted, 2));
    c.drawLine(start, end, Draw.stroke(IX.positive, 4));
    Draw.text(c, 'path over ground', Offset.lerp(start, end, 0.5)! + const Offset(70, 0), size: 17, color: IX.positive, halo: true);
    // Velocity triangle at the start.
    const k = 34.0;
    final hb = Offset(-vb * math.sin(th), -vb * math.cos(th)) * k;
    _vec(c, start, start + hb, IX.accent, 'v_boat', w: 5);
    _vec(c, start + hb, start + hb + Offset(vr * k, 0), PX.waterEdge, 'v_river', w: 5);
    _vec(c, start, start + hb + Offset(vr * k, 0), IX.positive, '', w: 5);
    // The boat, pointing along its heading, at the far bank.
    c.save();
    c.translate(end.dx, end.dy + 30);
    c.rotate(-th);
    final hull = Path()..moveTo(0, -30)..quadraticBezierTo(16, -6, 12, 26)..lineTo(-12, 26)..quadraticBezierTo(-16, -6, 0, -30)..close();
    c.drawPath(hull, Draw.fill(PX.wood));
    c.drawPath(hull, Draw.stroke(PX.woodDark, 2));
    c.restore();
    Draw.dim(c, Offset(start.dx, bank2 - 30), Offset(end.dx, bank2 - 30), 'drift ${fx(drift, 1)} m', color: IX.positive);
    Draw.text(c, 'width ${fx(w, 0)} m', Offset(start.dx - 16, (bank1 + bank2) / 2), size: 17, color: IX.inkSoft, align: Alignment.centerRight, halo: true);
  },
);
