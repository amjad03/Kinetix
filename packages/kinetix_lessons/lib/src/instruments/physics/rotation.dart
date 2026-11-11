import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'kit.dart';

/// System of particles and rotational motion (1st PUC ch. 6): centre of mass, moments,
/// torque, rolling, moment of inertia and conservation of angular momentum.
final rotationSpec = InstrumentSpec(
  id: 'rotation',
  chapter: '1st PUC Physics · System of particles and rotational motion',
  modes: {'com': _com, 'line': _line, 'seesaw': _seesaw, 'spanner': _spanner, 'rolling': _rolling, 'inertia': _inertia, 'skater': _skater},
);

const _g = 9.8;

// ── centre of mass of three particles ──

final _com = ModeSpec(
  title: 'Find the centre of mass',
  formula: 'X = Σmx / Σm',
  values: {'m1': 2, 'm2': 4, 'm3': 6, 'x1': -4, 'y1': -2, 'x2': 3, 'y2': -3, 'x3': 1, 'y3': 3, 'lines': 1},
  controls: (v) => const [Sl('m1', 'Mass A', 1, 10, unit: 'kg', div: 9), Sl('m2', 'Mass B', 1, 10, unit: 'kg', div: 9), Sl('m3', 'Mass C', 1, 10, unit: 'kg', div: 9), Seg('lines', 'Lines to the particles', ['Hidden', 'Shown'])],
  presets: {'Equal masses': {'m1': 4, 'm2': 4, 'm3': 4}, 'One heavy': {'m1': 1, 'm2': 1, 'm3': 10}, 'In a line': {'x1': -5, 'y1': 0, 'x2': 0, 'y2': 0, 'x3': 5, 'y3': 0}},
  drag: (v, p, s, start) {
    final u = s.height / 12, o = s.center(Offset.zero);
    final i = pick(v, p, start, [for (var k = 1; k <= 3; k++) o + Offset(v['x$k']!, -v['y$k']!) * u]);
    if (i == null) return false;
    final q = (p - o) / u;
    v['x${i + 1}'] = (q.dx * 2).roundToDouble() / 2;
    v['y${i + 1}'] = (-q.dy * 2).roundToDouble() / 2;
    return true;
  },
  readouts: (v) {
    final (x, y, m) = _cm(v);
    return [Readout('X of centre of mass', fx(x), 'm', IX.positive), Readout('Y of centre of mass', fx(y), 'm', IX.positive), Readout('Total mass', fx(m, 0), 'kg')];
  },
  paint: (c, s, v, t) {
    final u = s.height / 12, o = s.center(Offset.zero);
    IxPaint.grid(c, s, step: u / 2);
    c.drawLine(Offset(0, o.dy), Offset(s.width, o.dy), Draw.stroke(IX.rule, 2));
    c.drawLine(Offset(o.dx, 0), Offset(o.dx, s.height), Draw.stroke(IX.rule, 2));
    final (x, y, _) = _cm(v);
    final cm = o + Offset(x, -y) * u;
    const cols = [IX.accent, IX.green, PX.violet];
    for (var k = 1; k <= 3; k++) {
      final p = o + Offset(v['x$k']!, -v['y$k']!) * u;
      if (v['lines'] == 1) IxPaint.dashed(c, cm, p, Draw.stroke(IX.muted, 2));
    }
    for (var k = 1; k <= 3; k++) {
      final p = o + Offset(v['x$k']!, -v['y$k']!) * u;
      final r = 14 + v['m$k']! * 2.4;
      IxPaint.handle(c, p, cols[k - 1], r: r, active: v['_drag'] == k - 1);
      Draw.text(c, '${'ABC'[k - 1]}  ${fx(v['m$k']!, 0)} kg', p + Offset(0, r + 20), size: 18, color: cols[k - 1], halo: true);
    }
    // Centre of mass: the quartered disc symbol.
    c.drawCircle(cm, 16, Draw.fill(Colors.white));
    c.drawArc(Rect.fromCircle(center: cm, radius: 16), 0, math.pi / 2, true, Draw.fill(IX.positive));
    c.drawArc(Rect.fromCircle(center: cm, radius: 16), math.pi, math.pi / 2, true, Draw.fill(IX.positive));
    c.drawCircle(cm, 16, Draw.stroke(IX.positive, 2.5));
    Draw.text(c, 'centre of mass', cm + const Offset(0, -32), size: 18, color: IX.positive, halo: true);
    Draw.caption(c, 'Drag the particles. Grid squares are 0.5 m.');
  },
);

(double, double, double) _cm(V v) {
  var m = 0.0, x = 0.0, y = 0.0;
  for (var k = 1; k <= 3; k++) {
    m += v['m$k']!;
    x += v['m$k']! * v['x$k']!;
    y += v['m$k']! * v['y$k']!;
  }
  return (x / m, y / m, m);
}

// ── two masses on a line ──

final _line = ModeSpec(
  title: 'Centre of mass of two particles',
  formula: 'X = m₂x₂ / (m₁ + m₂)',
  values: {'m1': 2, 'm2': 6, 'x2': 4},
  controls: (v) => const [Sl('m1', 'Mass m₁ (at 0)', 0.5, 10, unit: 'kg', div: 19), Sl('m2', 'Mass m₂', 0.5, 10, unit: 'kg', div: 19), Sl('x2', 'Position x₂', 1, 10, unit: 'm', div: 18)],
  presets: {'Equal': {'m1': 4, 'm2': 4}, 'Earth–Moon like': {'m1': 10, 'm2': 0.5, 'x2': 10}},
  readouts: (v) {
    final m1 = v['m1']!, m2 = v['m2']!, x2 = v['x2']!;
    return [Readout('Total mass', fx(m1 + m2, 1), 'kg'), Readout('X from m₁', fx(m2 * x2 / (m1 + m2)), 'm', IX.positive), Readout('Distance from m₂', fx(m1 * x2 / (m1 + m2)), 'm')];
  },
  paint: (c, s, v, t) {
    final m1 = v['m1']!, m2 = v['m2']!, x2 = v['x2']!;
    final ppm = (s.width - 200) / 10, x0 = 100.0, y = s.height * 0.5;
    c.drawLine(Offset(x0 - 20, y), Offset(x0 + 10 * ppm + 20, y), Draw.stroke(IX.steel, 8));
    for (var m = 0; m <= 10; m++) {
      c.drawLine(Offset(x0 + m * ppm, y + 14), Offset(x0 + m * ppm, y + 26), Draw.stroke(IX.inkSoft, 2));
      Draw.text(c, '$m m', Offset(x0 + m * ppm, y + 44), size: 15, color: IX.inkSoft, w: FontWeight.w500);
    }
    final xc = m2 * x2 / (m1 + m2);
    Draw.ball(c, Offset(x0, y), 16 + m1 * 3, IX.accent);
    Draw.ball(c, Offset(x0 + x2 * ppm, y), 16 + m2 * 3, IX.green);
    Draw.text(c, 'm₁ = ${fx(m1, 1)} kg', Offset(x0, y - 70), size: 19, color: IX.accent);
    Draw.text(c, 'm₂ = ${fx(m2, 1)} kg', Offset(x0 + x2 * ppm, y - 70), size: 19, color: IX.green);
    final cp = Offset(x0 + xc * ppm, y + 80);
    final tri = Path()..moveTo(cp.dx, cp.dy - 30)..lineTo(cp.dx - 22, cp.dy + 8)..lineTo(cp.dx + 22, cp.dy + 8)..close();
    c.drawPath(tri, Draw.fill(IX.positive));
    Draw.text(c, 'centre of mass X = ${fx(xc)} m: the rod balances here', cp + const Offset(0, 34), size: 19, color: IX.positive, halo: true);
    Draw.caption(c, 'The heavier mass pulls the balance point towards itself: m₁d₁ = m₂d₂.');
  },
);

// ── see-saw ──

final _seesaw = ModeSpec(
  title: 'Balance the see-saw',
  formula: 'm₁g d₁ = m₂g d₂',
  values: {'m1': 30, 'm2': 40, 'd1': 2, 'd2': 1.5},
  controls: (v) => const [Sl('m1', 'Blue child m₁', 5, 80, unit: 'kg', div: 15), Sl('d1', 'Blue distance d₁', 0.25, 3, unit: 'm', div: 11), Sl('m2', 'Orange child m₂', 5, 80, unit: 'kg', div: 15), Sl('d2', 'Orange distance d₂', 0.25, 3, unit: 'm', div: 11)],
  presets: {'Balanced (30 × 2 = 40 × 1.5)': {'m1': 30, 'd1': 2, 'm2': 40, 'd2': 1.5}, 'Equal children': {'m1': 35, 'm2': 35, 'd1': 2, 'd2': 2}, 'Unbalanced': {'m1': 30, 'm2': 50, 'd1': 2, 'd2': 2}},
  drag: (v, p, s, start) {
    final ppm = (s.width - 200) / 6.6, cx = s.width / 2, py = s.height * 0.55;
    final i = pick(v, p, start, [Offset(cx - v['d1']! * ppm, py - 60), Offset(cx + v['d2']! * ppm, py - 60)], reach: 90);
    if (i == null) return false;
    final d = (((p.dx - cx).abs() / ppm) * 4).roundToDouble() / 4;
    v[i == 0 ? 'd1' : 'd2'] = d.clamp(0.25, 3);
    return true;
  },
  readouts: (v) {
    final t1 = v['m1']! * _g * v['d1']!, t2 = v['m2']! * _g * v['d2']!;
    return [
      Readout('Anticlockwise (blue)', fx(t1, 0), 'N m', IX.accent),
      Readout('Clockwise (orange)', fx(t2, 0), 'N m', IX.positive),
      Readout('Net torque', sg(t1 - t2, 0), 'N m'),
      Readout('Plank', (t1 - t2).abs() < 1 ? 'Balanced' : (t1 > t2 ? 'Tips left' : 'Tips right'), ''),
    ];
  },
  paint: (c, s, v, t) {
    final t1 = v['m1']! * _g * v['d1']!, t2 = v['m2']! * _g * v['d2']!;
    final net = t1 - t2;
    final tilt = (net / 2000).clamp(-0.14, 0.14); // radians, anticlockwise positive
    final ppm = (s.width - 200) / 6.6, cx = s.width / 2, py = s.height * 0.55;
    final gy = py + 120;
    Draw.ground(c, Offset(40, gy), Offset(s.width - 40, gy));
    final tri = Path()..moveTo(cx, py)..lineTo(cx - 70, gy)..lineTo(cx + 70, gy)..close();
    c.drawPath(tri, Draw.fill(IX.steel));
    c.drawPath(tri, Draw.stroke(IX.inkSoft, 2));
    c.save();
    c.translate(cx, py);
    c.rotate(-tilt);
    Draw.block(c, Rect.fromLTRB(-3.3 * ppm, -18, 3.3 * ppm, 0), PX.wood, radius: 4);
    for (var m = -3; m <= 3; m++) {
      c.drawLine(Offset(m * ppm, -18), Offset(m * ppm, -8), Draw.stroke(PX.woodDark, 2));
    }
    for (final (k, sign, col) in [(1, -1.0, IX.accent), (2, 1.0, IX.positive)]) {
      final x = sign * v['d$k']! * ppm;
      final sz = 36 + v['m$k']! * 0.5;
      Draw.block(c, Rect.fromCenter(center: Offset(x, -18 - sz / 2), width: sz, height: sz), col, label: fx(v['m$k']!, 0), radius: 8);
      IxPaint.arrow(c, Offset(x, -18 - sz - 4 + sz + 10), Offset(x, 40 + v['m$k']!), col.withValues(alpha: 0.8), width: 3.5, head: 14);
      Draw.dim(c, const Offset(0, -140), Offset(x, -140), '${fx(v['d$k']!, 2)} m', color: col);
    }
    c.restore();
    Draw.text(c, 'blue: anticlockwise ${fx(t1, 0)} N m', Offset(60, 60), size: 20, color: IX.accent, align: Alignment.centerLeft);
    Draw.text(c, 'orange: clockwise ${fx(t2, 0)} N m', Offset(s.width - 60, 60), size: 20, color: IX.positive, align: Alignment.centerRight);
    Draw.tag(c, net.abs() < 1 ? 'Balanced: m₁d₁ = m₂d₂' : (net > 0 ? 'Net anticlockwise torque: tips left' : 'Net clockwise torque: tips right'), Offset(cx, s.height - 50), color: net.abs() < 1 ? IX.green : IX.ink);
    Draw.caption(c, 'Drag the children along the plank.', at: Offset(28, s.height - 110));
  },
);

// ── spanner ──

final _spanner = ModeSpec(
  title: 'Torque on a spanner',
  formula: 'τ = rF sin θ',
  values: {'F': 50, 'r': 0.25, 'th': 90},
  controls: (v) => const [Sl('F', 'Force F', 0, 100, unit: 'N', div: 20), Sl('r', 'Spanner length r', 0.05, 0.5, unit: 'm', div: 9), Sl('th', 'Angle θ', 0, 180, unit: '°', div: 36)],
  presets: {'Square pull': {'th': 90}, 'At 30°': {'th': 30}, 'Along the handle': {'th': 0}, 'Long spanner': {'r': 0.5, 'th': 90}},
  readouts: (v) {
    final r = v['r']!, f = v['F']!, th = rad(v['th']!);
    return [
      Readout('Torque τ', fx(r * f * math.sin(th), 1), 'N m', IX.accent),
      Readout('Lever arm r sin θ', fx(r * math.sin(th), 3), 'm', IX.positive),
      Readout('Force for 10 N m', math.sin(th) < 1e-3 ? '∞' : fx(10 / (r * math.sin(th)), 1), 'N'),
    ];
  },
  paint: (c, s, v, t) {
    final r = v['r']!, f = v['F']!, th = rad(v['th']!);
    final left = Rect.fromLTWH(0, 0, s.width * 0.5, s.height);
    final nut = Offset(140, left.center.dy + 40);
    final ppm = (left.width - 240) / 0.5;
    final end = nut + Offset(r * ppm, 0);
    // Nut (hexagon) and spanner.
    final hex = Path();
    for (var i = 0; i < 6; i++) {
      final a = i * math.pi / 3;
      final p = nut + Offset(math.cos(a), math.sin(a)) * 34;
      i == 0 ? hex.moveTo(p.dx, p.dy) : hex.lineTo(p.dx, p.dy);
    }
    hex.close();
    c.drawPath(hex, Draw.fill(IX.steel));
    c.drawPath(hex, Draw.stroke(IX.inkSoft, 2));
    c.drawCircle(nut, 12, Draw.fill(IX.inkSoft));
    Draw.block(c, Rect.fromLTRB(nut.dx + 30, nut.dy - 14, end.dx + 14, nut.dy + 14), PX.iron, radius: 14);
    final dir = Offset(math.cos(th), -math.sin(th));
    Draw.force(c, end, end + dir * f * 2.6, IX.accent, 'F', w: 5);
    if (v['th']! > 2 && v['th']! < 178) Draw.angle(c, end, -th, 0, 48, 'θ');
    // Lever arm: perpendicular from the nut to the line of action.
    final foot = end + dir * ((nut - end).dx * dir.dx + (nut - end).dy * dir.dy);
    IxPaint.dashed(c, end - dir * 300, end + dir * 300, Draw.stroke(IX.accent.withValues(alpha: 0.35), 2));
    if (math.sin(th) > 0.02) {
      c.drawLine(nut, foot, Draw.stroke(IX.positive, 3.5));
      Draw.text(c, 'r sin θ', Offset.lerp(nut, foot, 0.5)! + const Offset(-36, 0), size: 18, color: IX.positive, halo: true);
    }
    Draw.dim(c, nut + const Offset(0, 60), end + const Offset(0, 60), 'r = ${fx(r, 2)} m', off: 22);
    final p = Plot(Rect.fromLTRB(left.right, 26, s.width - 26, s.height - 26), 0, 180, 0, 50, xl: 'θ (°)', yl: 'τ (N m)', title: 'τ = rF sin θ');
    p.frame(c);
    p.fn(c, (x) => r * f * math.sin(rad(x)), IX.accent, w: 4);
    p.dot(c, v['th']!, r * f * math.sin(th), IX.accent, label: '${fx(r * f * math.sin(th), 1)} N m');
  },
);

// ── rolling race ──

const _shapes = ['Ring', 'Hollow sphere', 'Disc', 'Solid sphere'];
const _kk = [1.0, 2 / 3, 0.5, 0.4];

final _rolling = ModeSpec(
  title: 'Rolling race down a slope',
  formula: 'a = g sin θ / (1 + k)',
  values: {'th': 20, 'L': 4, 'A': 0, 'B': 3, 'tt': 1.0},
  controls: (v) => const [Sl('th', 'Slope angle θ', 5, 40, unit: '°', div: 35), Sl('L', 'Length of slope', 2, 6, unit: 'm', div: 8), Seg('A', 'Body A', _shapes), Seg('B', 'Body B', _shapes), Sl('tt', 'Time t', 0, 3, unit: 's', div: 60)],
  presets: {'Ring vs solid sphere': {'A': 0, 'B': 3}, 'Disc vs ring': {'A': 2, 'B': 0}, 'Hollow vs solid sphere': {'A': 1, 'B': 3}},
  readouts: (v) {
    final th = rad(v['th']!), l = v['L']!;
    double a(String k) => _g * math.sin(th) / (1 + _kk[v[k]!.round()]);
    return [
      Readout('Time for A', fx(math.sqrt(2 * l / a('A'))), 's', IX.accent),
      Readout('Time for B', fx(math.sqrt(2 * l / a('B'))), 's', IX.positive),
      Readout('Speed of A at bottom', fx(math.sqrt(2 * a('A') * l)), 'm/s'),
      Readout('Speed of B at bottom', fx(math.sqrt(2 * a('B') * l)), 'm/s'),
    ];
  },
  paint: (c, s, v, t) {
    final th = rad(v['th']!), l = v['L']!, tt = v['tt']!;
    final base = s.width - 200;
    final ppm = math.min(base / (l * math.cos(th)), (s.height - 300) / (l * math.sin(th)));
    final bl = Offset(100 + base - l * math.cos(th) * ppm, s.height - 90);
    // Slope descends to the right: top-left to bottom-right.
    final top = Offset(100, bl.dy - l * math.sin(th) * ppm);
    final bot = Offset(100 + l * math.cos(th) * ppm, bl.dy);
    final tri = Path()..moveTo(top.dx, top.dy)..lineTo(bot.dx, bot.dy)..lineTo(top.dx, bot.dy)..close();
    c.drawPath(tri, Draw.fill(const Color(0xFFE6EAF1)));
    c.drawPath(tri, Draw.stroke(IX.inkSoft, 2.5));
    Draw.ground(c, Offset(60, bot.dy), Offset(s.width - 40, bot.dy));
    Draw.angle(c, bot, math.pi, math.pi + th, 70, '${fx(v['th']!, 0)}°');
    final u = (bot - top) / (bot - top).distance, n = Offset(u.dy, -u.dx);
    for (final (key, col, lane) in [('A', IX.accent, 0.0), ('B', IX.positive, 1.0)]) {
      final k = _kk[v[key]!.round()];
      final a = _g * math.sin(th) / (1 + k);
      final d = math.min(l, 0.5 * a * tt * tt);
      const r = 28.0;
      final p = top + u * (d * ppm + 30) + n * r + Offset(0, lane * 0);
      final ang = d * ppm / r;
      // Draw the body: ring, shell, disc or ball, with a spoke to show the turning.
      switch (v[key]!.round()) {
        case 0:
          c.drawCircle(p, r - 4, Draw.stroke(col, 8));
        case 1:
          Draw.ball(c, p, r, Color.lerp(col, Colors.white, 0.35)!);
          c.drawCircle(p, r - 2, Draw.stroke(col, 4));
        case 2:
          c.drawCircle(p, r, Draw.fill(col.withValues(alpha: 0.85)));
          c.drawCircle(p, r, Draw.stroke(Color.lerp(col, Colors.black, 0.3)!, 2));
        default:
          Draw.ball(c, p, r, col);
      }
      c.drawLine(p, p + Offset(math.cos(ang), math.sin(ang)) * (r - 6), Draw.stroke(Colors.white, 3));
      Draw.text(c, '$key: ${_shapes[v[key]!.round()]}  (k = ${k == 2 / 3 ? '2/3' : fx(k, k == 0.4 ? 1 : 1)})', p + n * 56 + const Offset(0, -10), size: 18, color: col, halo: true);
    }
    Draw.caption(c, 'Both released together at t = 0; picture at t = ${fx(tt, 2)} s. Mass and radius do not matter, only k = I/MR².');
  },
);

// ── moment of inertia ──

final _inertia = ModeSpec(
  title: 'Moment of inertia of a ring, disc and sphere',
  formula: 'I = kMR²',
  values: {'M': 2, 'R': 0.5, 'w': 10},
  controls: (v) => const [Sl('M', 'Mass M', 0.5, 10, unit: 'kg', div: 19), Sl('R', 'Radius R', 0.1, 1, unit: 'm', div: 18), Sl('w', 'Angular speed ω', 1, 50, unit: 'rad/s', div: 49)],
  presets: {'Small and light': {'M': 1, 'R': 0.2}, 'Large wheel': {'M': 8, 'R': 0.9, 'w': 5}},
  readouts: (v) {
    final m = v['M']!, r = v['R']!, w = v['w']!;
    return [
      Readout('I ring = MR²', fx(m * r * r, 3), 'kg m²', IX.amber),
      Readout('I disc = ½MR²', fx(m * r * r / 2, 3), 'kg m²', IX.green),
      Readout('I sphere = ⅖MR²', fx(0.4 * m * r * r, 3), 'kg m²', IX.positive),
      Readout('KE of ring ½Iω²', fx(m * r * r * w * w / 2, 1), 'J'),
    ];
  },
  paint: (c, s, v, t) {
    final m = v['M']!, rr = v['R']!;
    final left = Rect.fromLTWH(0, 0, s.width * 0.42, s.height);
    final rad0 = 50 + rr * 70;
    final items = [('Ring', IX.amber, 1.0), ('Disc', IX.green, 0.5), ('Sphere', IX.positive, 0.4)];
    for (final (i, (name, col, k)) in items.indexed) {
      final p = Offset(left.center.dx, 130 + i * (s.height - 200) / 2.2);
      switch (i) {
        case 0:
          c.drawCircle(p, rad0, Draw.stroke(col, 10));
        case 1:
          c.drawCircle(p, rad0, Draw.fill(col.withValues(alpha: 0.75)));
        default:
          Draw.ball(c, p, rad0, col);
      }
      c.drawCircle(p, 5, Draw.fill(IX.ink));
      Draw.text(c, '$name  I = ${k == 1 ? '' : (k == 0.5 ? '½' : '⅖')}MR² = ${fx(k * m * rr * rr, 3)}', Offset(p.dx + rad0 + 20, p.dy), size: 18, color: col, align: Alignment.centerLeft, halo: true);
    }
    final p = Plot(Rect.fromLTRB(left.right + 40, 26, s.width - 26, s.height - 26), 0, 1, 0, math.max(1.0, m * 1.05), xl: 'R (m)', yl: 'I (kg m²)', title: 'I grows as R²');
    p.frame(c);
    for (final (name, col, k) in items) {
      p.fn(c, (x) => k * m * x * x, col, w: 4, label: name.toLowerCase(), labelAt: 0.9);
    }
    p.vline(c, rr, IX.muted);
  },
);

// ── skater / turntable ──

final _skater = ModeSpec(
  title: 'Spin faster by pulling in your arms',
  formula: 'I₁ω₁ = I₂ω₂',
  values: {'w0': 2, 'm': 3, 'arm': 0},
  controls: (v) => const [Sl('w0', 'Spin with arms out ω₁', 0.5, 4, unit: 'rad/s', div: 14), Sl('m', 'Each dumbbell', 1, 5, unit: 'kg', div: 8), Seg('arm', 'Dumbbells', ['Arms out (0.9 m)', 'Pulled in (0.2 m)'])],
  presets: {'Arms out': {'arm': 0}, 'Arms in': {'arm': 1}, 'Heavy dumbbells, in': {'m': 5, 'arm': 1}},
  animate: true,
  readouts: (v) {
    final (i1, i2) = _ii(v);
    final w = v['arm'] == 1 ? v['w0']! * i1 / i2 : v['w0']!;
    final ii = v['arm'] == 1 ? i2 : i1;
    return [
      Readout('Angular velocity ω', fx(w), 'rad/s', IX.accent),
      Readout('Moment of inertia I', fx(ii), 'kg m²'),
      Readout('Angular momentum L', fx(ii * w), 'kg m²/s', IX.green),
      Readout('Kinetic energy ½Iω²', fx(0.5 * ii * w * w, 1), 'J', IX.amber),
    ];
  },
  paint: (c, s, v, t) {
    final (i1, i2) = _ii(v);
    final inn = v['arm'] == 1;
    final w = inn ? v['w0']! * i1 / i2 : v['w0']!;
    final left = Rect.fromLTWH(0, 0, s.width * 0.55, s.height);
    final o = Offset(left.center.dx, left.center.dy + 20);
    // Top view of the turntable and the person.
    c.drawCircle(o, 230, Draw.fill(const Color(0xFFEFF2F8)));
    c.drawCircle(o, 230, Draw.stroke(IX.steel, 4));
    final ang = w * t * 0.5;
    final armR = (inn ? 0.2 : 0.9) * 220;
    final dir = Offset(math.cos(ang), math.sin(ang));
    c.drawLine(o - dir * armR, o + dir * armR, Draw.stroke(const Color(0xFFD6B48F), 18));
    c.drawOval(Rect.fromCenter(center: o, width: 120, height: 120), Draw.fill(IX.accent));
    c.drawCircle(o, 34, Draw.fill(const Color(0xFFD6B48F)));
    for (final sgn in [-1.0, 1.0]) {
      Draw.ball(c, o + dir * armR * sgn, 16 + v['m']! * 2.5, PX.iron);
    }
    c.drawArc(Rect.fromCircle(center: o, radius: 260), -0.6, 1.2, false, Draw.stroke(IX.positive, 4));
    IxPaint.arrow(c, o + Offset(math.cos(0.6), math.sin(0.6)) * 260 + const Offset(6, -8), o + Offset(math.cos(0.75), math.sin(0.75)) * 260, IX.positive, width: 4, head: 18);
    Draw.text(c, 'ω = ${fx(w)} rad/s', o + const Offset(300, 0), size: 20, color: IX.positive, align: Alignment.centerLeft);
    final p = Plot(Rect.fromLTRB(left.right + 10, 26, s.width - 26, s.height - 26), 0, i1 * 1.2, 0, v['w0']! * i1 / i2 * 1.2, xl: 'I (kg m²)', yl: 'ω (rad/s)', title: 'L = Iω fixed: ω = L / I');
    p.frame(c);
    p.fn(c, (x) => v['w0']! * i1 / x, IX.accent, w: 4, a: i2 * 0.6);
    p.dot(c, i1, v['w0']!, inn ? IX.muted : IX.accent, label: 'arms out');
    p.dot(c, i2, v['w0']! * i1 / i2, inn ? IX.accent : IX.muted, label: 'arms in');
  },
);

/// Person (2.4 kg m² about the axis, body) plus two dumbbells at 0.9 m or 0.2 m.
(double, double) _ii(V v) {
  const body = 2.4;
  final m = v['m']!;
  return (body + 2 * m * 0.81, body + 2 * m * 0.04);
}
