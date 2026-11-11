import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'kit.dart';

/// Work, energy and power (1st PUC ch. 5): a box pulled at an angle, the work–energy theorem,
/// a ball in a bowl, a block on a spring, and a lift motor.
final energySpec = InstrumentSpec(
  id: 'energy',
  chapter: '1st PUC Physics · Work, energy and power',
  modes: {'work': _work, 'theorem': _theorem, 'bowl': _bowl, 'spring': _spring, 'power': _power},
);

const _g = 9.8;

final _work = ModeSpec(
  title: 'Work done by a force at an angle',
  formula: 'W = F d cos θ',
  values: {'F': 20, 'th': 30, 'd': 6},
  controls: (v) => const [Sl('F', 'Force F', 1, 50, unit: 'N', div: 49), Sl('th', 'Angle with displacement θ', 0, 180, unit: '°', div: 36), Sl('d', 'Displacement d', 1, 10, unit: 'm', div: 18)],
  presets: {'Along the motion': {'th': 0}, 'At 60°': {'th': 60}, 'At right angles': {'th': 90}, 'Backwards (braking)': {'th': 150}},
  readouts: (v) {
    final th = rad(v['th']!);
    return [
      Readout('Work W', sg(v['F']! * v['d']! * math.cos(th), 1), 'J', IX.accent),
      Readout('F cos θ (along d)', sg(v['F']! * math.cos(th), 1), 'N', IX.positive),
      Readout('F sin θ (across d)', fx(v['F']! * math.sin(th), 1), 'N'),
    ];
  },
  paint: (c, s, v, t) {
    final f = v['F']!, th = rad(v['th']!), d = v['d']!;
    final left = Rect.fromLTWH(0, 0, s.width * 0.5, s.height);
    final gy = s.height * 0.62, ppm = (left.width - 220) / 10;
    Draw.ground(c, Offset(40, gy), Offset(left.right - 10, gy));
    final x0 = 80.0;
    final start = Rect.fromLTWH(x0, gy - 90, 110, 90);
    c.drawRRect(RRect.fromRectAndRadius(start, const Radius.circular(8)), Draw.stroke(IX.muted, 2));
    final box = start.shift(Offset(d * ppm, 0));
    Draw.block(c, box, PX.wood);
    final k = 4.0;
    final dir = Offset(math.cos(th), -math.sin(th));
    final o = box.center;
    Draw.force(c, o, o + dir * f * k, IX.accent, 'F', w: 5);
    if (v['th']! > 2 && v['th']! < 178) {
      IxPaint.dashed(c, o + dir * f * k, Offset(o.dx + f * k * math.cos(th), o.dy), Draw.stroke(IX.muted, 2));
      Draw.force(c, o, Offset(o.dx + f * k * math.cos(th), o.dy), IX.positive, 'F cos θ', w: 4, off: const Offset(0, 22));
      Draw.angle(c, o, -th, 0, 46, 'θ');
    }
    IxPaint.arrow(c, Offset(start.left + 55, gy + 44), Offset(box.left + 55, gy + 44), IX.ink, width: 4, head: 16);
    Draw.text(c, 'd = ${fx(d, 1)} m', Offset((start.left + box.left) / 2 + 55, gy + 70), size: 18, halo: true);
    final p = Plot(Rect.fromLTRB(left.right, 26, s.width - 26, s.height - 26), 0, 180, -500, 500, xl: 'θ (°)', yl: 'W (J)', title: 'Work against the angle');
    p.frame(c);
    p.fn(c, (x) => f * d * math.cos(rad(x)), IX.accent, w: 4);
    p.dot(c, v['th']!, f * d * math.cos(th), IX.accent, label: '${fx(f * d * math.cos(th), 0)} J');
    p.vline(c, 90, IX.muted, label: 'no work');
  },
);

final _theorem = ModeSpec(
  title: 'Work changes kinetic energy',
  formula: 'W = ½mv² − ½mu²',
  values: {'m': 2, 'u': 3, 'F': 6, 's': 5},
  controls: (v) => const [Sl('m', 'Mass m', 1, 20, unit: 'kg', div: 19), Sl('u', 'Starting speed u', 0, 15, unit: 'm/s', div: 30), Sl('F', 'Net force F (− brakes)', -20, 20, unit: 'N', div: 40), Sl('s', 'Distance the force acts', 1, 10, unit: 'm', div: 18)],
  presets: {'Speeding up': {'F': 6}, 'Braking': {'F': -4}, 'Braking to rest': {'m': 2, 'u': 6, 'F': -7.2, 's': 5}},
  readouts: (v) {
    final w = v['F']! * v['s']!, k0 = 0.5 * v['m']! * v['u']! * v['u']!;
    final k1 = math.max(0.0, k0 + w);
    return [
      Readout('Work done W = Fs', sg(w, 1), 'J', IX.amber),
      Readout('Initial K', fx(k0, 1), 'J', IX.accent),
      Readout('Final K', fx(k1, 1), 'J', IX.green),
      Readout('Final speed', fx(math.sqrt(2 * k1 / v['m']!)), 'm/s'),
    ];
  },
  paint: (c, s, v, t) {
    final m = v['m']!, u = v['u']!, f = v['F']!, d = v['s']!;
    final k0 = 0.5 * m * u * u, w = f * d, k1 = math.max(0.0, k0 + w);
    final v1 = math.sqrt(2 * k1 / m);
    const gy = 230.0;
    final ppm = (s.width - 300) / 10;
    Draw.ground(c, Offset(40, gy), Offset(s.width - 40, gy));
    final b0 = Rect.fromLTWH(80, gy - 80, 100, 80), b1 = b0.shift(Offset(d * ppm, 0));
    c.drawRRect(RRect.fromRectAndRadius(b0, const Radius.circular(8)), Draw.stroke(IX.muted, 2));
    Draw.block(c, b1, PX.wood, label: '${fx(m, 0)} kg');
    c.drawRect(Rect.fromLTRB(b0.center.dx, gy + 6, b1.center.dx, gy + 16), Draw.fill(IX.amber.withValues(alpha: 0.4)));
    Draw.text(c, 'force acts over s = ${fx(d, 1)} m', Offset((b0.center.dx + b1.center.dx) / 2, gy + 38), size: 17, color: IX.amber);
    Draw.force(c, b0.topCenter + const Offset(0, -24), b0.topCenter + Offset(u * 12 + 1, -24), IX.accent, 'u = ${fx(u, 1)} m/s', w: 4);
    Draw.force(c, b1.topCenter + const Offset(0, -24), b1.topCenter + Offset(v1 * 12 + 1, -24), IX.green, 'v = ${fx(v1, 1)} m/s', w: 4);
    Draw.force(c, b1.centerRight, b1.centerRight + Offset(f * 6, 0), IX.positive, 'F', w: 4);
    final (l, r) = (Rect.fromLTRB(26, 320, s.width * 0.42, s.height - 22), Rect.fromLTRB(s.width * 0.42 + 16, 320, s.width - 26, s.height - 22));
    Draw.bars(c, l, [('K start', k0, IX.accent), ('W', w, IX.amber), ('K end', k1, IX.green)], title: 'Energy (J)');
    final vmax = math.max(15.0, v1 * 1.2);
    final p = Plot(r, 0, vmax, 0, 0.5 * m * vmax * vmax, xl: 'speed (m/s)', yl: 'K (J)', title: 'K = ½mv²');
    p.frame(c);
    p.fn(c, (x) => 0.5 * m * x * x, IX.ink, w: 4);
    p.dot(c, u, k0, IX.accent, label: 'u');
    p.dot(c, v1, k1, IX.green, label: 'v');
  },
);

final _bowl = ModeSpec(
  title: 'Skating in a bowl',
  formula: 'mgh + ½mv² = constant',
  values: {'h0': 3, 'm': 2, 'fric': 0, 'pos': -0.5},
  controls: (v) => const [Sl('h0', 'Release height h', 0.5, 4, unit: 'm'), Sl('m', 'Mass m', 1, 10, unit: 'kg', div: 18), Sl('pos', 'Position across the bowl', -1, 1, div: 40), Seg('fric', 'Friction', ['None', 'Some (energy lost)'])],
  presets: {'At the release point': {'pos': -1}, 'At the bottom': {'pos': 0}, 'Climbing the far side': {'pos': 0.6}, 'With friction': {'pos': 0.6, 'fric': 1}},
  readouts: (v) {
    final (pe, ke, tot) = _bowlE(v);
    return [
      Readout('Potential energy', fx(pe, 1), 'J', IX.accent),
      Readout('Kinetic energy', fx(ke, 1), 'J', IX.green),
      Readout('Total', fx(tot, 1), 'J'),
      Readout('Speed', fx(math.sqrt(2 * ke / v['m']!)), 'm/s', IX.positive),
    ];
  },
  paint: (c, s, v, t) {
    final h0 = v['h0']!;
    final (pe, ke, tot) = _bowlE(v);
    final left = Rect.fromLTWH(0, 0, s.width * 0.62, s.height);
    // Bowl: y = H x² over x in [−1, 1] with H = 4.4 m at the rim.
    const rim = 4.4;
    final cx = left.center.dx, by = s.height - 120, hw = left.width / 2 - 70, ppm = (s.height - 240) / rim;
    Offset at(double x) => Offset(cx + x * hw, by - rim * x * x * ppm);
    final path = Path()..moveTo(at(-1).dx, at(-1).dy);
    for (var i = -50; i <= 50; i++) {
      path.lineTo(at(i / 50).dx, at(i / 50).dy);
    }
    final fillp = Path.from(path)..lineTo(at(1).dx, by + 30)..lineTo(at(-1).dx, by + 30)..close();
    c.drawPath(fillp, Draw.fill(const Color(0xFFE6EAF1)));
    c.drawPath(path, Draw.stroke(IX.inkSoft, 4));
    final x0 = -math.sqrt(h0 / rim);
    IxPaint.dashed(c, Offset(at(-1).dx, at(x0).dy), Offset(at(1).dx, at(x0).dy), Draw.stroke(IX.accent.withValues(alpha: 0.6), 2));
    Draw.text(c, 'release height ${fx(h0, 1)} m', Offset(at(1).dx, at(x0).dy - 18), size: 17, color: IX.accent, align: Alignment.centerRight, halo: true);
    Draw.ball(c, at(x0) + const Offset(0, -18), 18, IX.steel);
    final xb = _bowlX(v);
    final p = at(xb);
    final slope = 2 * rim * xb * ppm / hw;
    final n = Offset(slope, -1) / math.sqrt(1 + slope * slope);
    Draw.ball(c, p + n * 18, 18, IX.accent);
    Draw.bars(c, Rect.fromLTRB(left.right + 10, 26, s.width - 26, s.height - 26), [('PE', pe, IX.accent), ('KE', ke, IX.green), ('total', tot, IX.ink), if (v['fric'] == 1) ('heat', _bowlLoss(v), IX.amber)], title: 'Energy (J)', max: v['m']! * _g * h0);
  },
);

double _bowlX(V v) {
  final pos = v['pos']!, xr = math.sqrt(v['h0']! / 4.4);
  // pos −1 = release point, +1 = the far turning point (lower with friction).
  final far = v['fric'] == 1 ? xr * math.sqrt(0.75) : xr;
  return pos < 0 ? pos * xr : pos * far;
}

double _bowlLoss(V v) => v['fric'] == 1 ? v['m']! * _g * v['h0']! * 0.25 * ((v['pos']! + 1) / 2) : 0;

(double, double, double) _bowlE(V v) {
  final m = v['m']!, x = _bowlX(v);
  final pe = m * _g * 4.4 * x * x;
  final tot = m * _g * v['h0']! - _bowlLoss(v);
  return (pe, math.max(0, tot - pe), tot);
}

final _spring = ModeSpec(
  title: 'Energy of a block on a spring',
  formula: '½kx² + ½mv² = ½kxₘ²',
  values: {'k': 200, 'xm': 0.3, 'm': 1, 'x': 0.15},
  controls: (v) => [const Sl('k', 'Spring constant k', 10, 500, unit: 'N/m', div: 49), const Sl('xm', 'Amplitude xₘ', 0.05, 0.5, unit: 'm'), const Sl('m', 'Mass m', 0.1, 5, unit: 'kg'), Sl('x', 'Position x', -0.5, 0.5, unit: 'm')],
  presets: {'At the end': {'x': 0.3}, 'Half way': {'x': 0.15}, 'At the centre': {'x': 0}},
  readouts: (v) {
    final k = v['k']!, xm = v['xm']!, x = v['x']!.clamp(-xm, xm);
    return [
      Readout('Spring energy ½kx²', fx(0.5 * k * x * x), 'J', IX.amber),
      Readout('Kinetic energy', fx(0.5 * k * (xm * xm - x * x)), 'J', IX.green),
      Readout('Total ½kxₘ²', fx(0.5 * k * xm * xm), 'J'),
      Readout('Greatest speed', fx(xm * math.sqrt(k / v['m']!)), 'm/s', IX.accent),
    ];
  },
  paint: (c, s, v, t) {
    final k = v['k']!, xm = v['xm']!, x = v['x']!.clamp(-xm, xm);
    final wall = 80.0, gy = 230.0, ppm = 600.0, eq = 80 + 0.6 * ppm;
    Draw.ground(c, Offset(wall, gy), Offset(s.width - 40, gy));
    Draw.ground(c, Offset(wall, gy), Offset(wall, gy - 150), n: const Offset(-1, 0));
    final bx = eq + x * ppm;
    Draw.spring(c, Offset(wall, gy - 50), Offset(bx - 55, gy - 50), coils: 14, width: 30);
    Draw.block(c, Rect.fromCenter(center: Offset(bx, gy - 50), width: 110, height: 100), IX.accent, label: '${fx(v['m']!, 1)} kg');
    IxPaint.dashed(c, Offset(eq, gy - 130), Offset(eq, gy + 20), Draw.stroke(IX.muted, 2));
    Draw.text(c, 'x = 0', Offset(eq, gy + 38), size: 16, color: IX.inkSoft);
    for (final e in [-xm, xm]) {
      c.drawLine(Offset(eq + e * ppm, gy + 4), Offset(eq + e * ppm, gy + 18), Draw.stroke(IX.positive, 3));
    }
    Draw.text(c, '±xₘ', Offset(eq + xm * ppm, gy + 38), size: 16, color: IX.positive);
    final p = Plot(Rect.fromLTRB(26, 300, s.width - 26, s.height - 22), -xm * 1.15, xm * 1.15, 0, 0.5 * k * xm * xm * 1.25, xl: 'x (m)', yl: 'E (J)', title: 'Spring energy and kinetic energy at each position');
    p.frame(c);
    p.fn(c, (q) => 0.5 * k * q * q, IX.amber, w: 4, label: 'U = ½kx²', labelAt: -xm * 0.9);
    p.fn(c, (q) => 0.5 * k * (xm * xm - q * q), IX.green, w: 4, a: -xm, b: xm, label: 'K', labelAt: 0);
    p.hline(c, 0.5 * k * xm * xm, IX.ink, label: 'total');
    p.vline(c, x, IX.accent);
    p.dot(c, x, 0.5 * k * x * x, IX.amber);
    p.dot(c, x, 0.5 * k * (xm * xm - x * x), IX.green);
  },
);

final _power = ModeSpec(
  title: 'How powerful a lift motor?',
  formula: 'P = W/t = Fv',
  values: {'m': 500, 'h': 10, 'Pk': 5, 'eff': 0, 'f': 0},
  controls: (v) => const [Sl('m', 'Mass of lift + load', 50, 3000, unit: 'kg', div: 59), Sl('h', 'Height', 2, 30, unit: 'm', div: 28), Sl('Pk', 'Motor power', 1, 60, unit: 'kW', div: 59), Sl('f', 'Friction f', 0, 8000, unit: 'N', div: 40), Seg('eff', 'Motor', ['Ideal', 'Real (70 % efficient)'])],
  presets: {'Small goods lift': {'m': 500, 'h': 10, 'Pk': 5, 'f': 0}, 'Passenger lift (NCERT)': {'m': 1800, 'h': 20, 'Pk': 60, 'f': 4000}, 'Real motor': {'eff': 1}},
  readouts: (v) {
    final eta = v['eff'] == 1 ? 0.7 : 1.0;
    final force = v['m']! * _g + v['f']!;
    final speed = eta * v['Pk']! * 1000 / force;
    return [
      Readout('Force needed mg + f', sc(force), 'N'),
      Readout('Lifting speed', fx(speed), 'm/s', IX.accent),
      Readout('Time to lift', fx(v['h']! / speed, 1), 's', IX.green),
      Readout('Motor power', fx(v['Pk']! / 0.746, 1), 'hp'),
    ];
  },
  paint: (c, s, v, t) {
    final eta = v['eff'] == 1 ? 0.7 : 1.0;
    final force = v['m']! * _g + v['f']!;
    final speed = eta * v['Pk']! * 1000 / force;
    final left = Rect.fromLTWH(0, 0, s.width * 0.4, s.height);
    final shaft = Rect.fromLTWH(left.center.dx - 90, 90, 180, s.height - 160);
    c.drawRect(shaft, Draw.fill(const Color(0xFFF1F4F9)));
    c.drawRect(shaft, Draw.stroke(IX.rule, 2));
    final motor = Rect.fromCenter(center: Offset(shaft.center.dx, 60), width: 150, height: 56);
    Draw.block(c, motor, PX.iron, label: '${fx(v['Pk']!, 0)} kW');
    final ppm = (shaft.height - 120) / 30;
    final carTop = shaft.bottom - 110 - v['h']! * ppm;
    c.drawLine(Offset(shaft.center.dx, motor.bottom), Offset(shaft.center.dx, carTop), Draw.stroke(IX.inkSoft, 3));
    final cab = Rect.fromLTWH(shaft.left + 20, carTop, shaft.width - 40, 110);
    Draw.block(c, cab, IX.accent, label: '${fx(v['m']!, 0)} kg', radius: 6);
    Draw.dim(c, Offset(shaft.right + 30, shaft.bottom), Offset(shaft.right + 30, carTop + 110), 'h = ${fx(v['h']!, 0)} m', off: 46);
    Draw.force(c, cab.topCenter + const Offset(40, 0), cab.topCenter + Offset(40, -30 - speed * 20), IX.green, 'v', w: 4);
    final p = Plot(Rect.fromLTRB(left.right, 26, s.width - 26, s.height - 26), 0, 5, 0, math.max(force * 5 / 1000, 10), xl: 'v (m/s)', yl: 'P (kW)', title: 'Power needed P = (mg + f)v');
    p.frame(c);
    p.fn(c, (x) => force * x / 1000, IX.ink, w: 4);
    p.hline(c, v['Pk']! * eta, IX.accent, label: 'useful motor power');
    p.dot(c, speed, v['Pk']! * eta, IX.accent, label: '${fx(speed)} m/s');
  },
);
