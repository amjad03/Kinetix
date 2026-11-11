import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'kit.dart';

/// Laws of motion (1st PUC ch. 4, collisions from ch. 5): a block, carts and ramps with their
/// free-body forces, and the graph or bar chart that goes with each law.
///
/// Modes: push (a vector, ch. 1), galileo (two ramps), impulse (F = dp/dt), recoil (carts
/// pushed apart), collide (any e), friction (static → kinetic), incline (angle of repose).
final forcesSpec = InstrumentSpec(
  id: 'forces',
  chapter: '1st PUC Physics · Laws of motion',
  modes: {
    'push': _push,
    'galileo': _galileo,
    'impulse': _impulse,
    'recoil': _recoil,
    'collide': _collide,
    'friction': _friction,
    'incline': _incline,
  },
);

const _g = 9.8;

// ── a push is a vector ──

final _push = ModeSpec(
  title: 'Same push, different direction',
  chapter: '1st PUC Physics · Units and measurement',
  formula: 'vector = size + direction',
  values: {'F': 10, 'dir': 0},
  controls: (v) => const [Sl('F', 'Size of the push', 5, 20, unit: 'N', div: 15), Seg('dir', 'Direction', ['Push right →', '← Push left'])],
  presets: {'10 N right': {'F': 10, 'dir': 0}, '10 N left': {'F': 10, 'dir': 1}},
  readouts: (v) {
    final x = 0.5 * v['F']! / 5 * 4 * (v['dir'] == 1 ? -1 : 1);
    return [
      Readout('Size of the push', fx(v['F']!, 0), 'N', IX.accent),
      Readout('Box moved (+ right)', sg(x, 1), 'm', IX.positive),
      Readout('Scalar or vector?', 'Vector: size and direction', ''),
    ];
  },
  paint: (c, s, v, t) {
    final f = v['F']!, d = v['dir'] == 1 ? -1.0 : 1.0;
    final x = 0.5 * f / 5 * 4 * d; // 5 kg box, smooth floor, pushed for 2 s
    final cx = s.width / 2, gy = s.height * 0.56, ppm = (s.width - 160) / 20;
    Draw.caption(c, 'A 5 kg box on a smooth floor, pushed for 2 s. Same size of push; only the direction differs.');
    Draw.ground(c, Offset(40, gy), Offset(s.width - 40, gy));
    for (var m = -10; m <= 10; m += 2) {
      Draw.text(c, '$m m', Offset(cx + m * ppm, gy + 40), size: 15, color: IX.inkSoft, w: FontWeight.w500);
    }
    final start = Rect.fromCenter(center: Offset(cx, gy - 60), width: 120, height: 120);
    c.drawRRect(RRect.fromRectAndRadius(start, const Radius.circular(8)), Draw.stroke(IX.muted, 2)..strokeWidth = 2);
    Draw.text(c, 'start', start.center, size: 17, color: IX.muted);
    final box = start.shift(Offset(x * ppm, 0));
    Draw.block(c, box, PX.wood, label: '5 kg');
    final from = d > 0 ? box.centerLeft - const Offset(14, 0) : box.centerRight + const Offset(14, 0);
    Draw.force(c, from - Offset(d * f * 12, 0), from, IX.accent, '', w: 7);
    Draw.text(c, '${fx(f, 0)} N', from - Offset(d * f * 6, 30), size: 22, color: IX.accent);
    IxPaint.arrow(c, Offset(cx, gy + 90), Offset(cx + x * ppm, gy + 90), IX.positive, width: 5, head: 18);
    Draw.text(c, 'moved ${sg(x, 1)} m', Offset(cx + x * ppm / 2, gy + 118), size: 19, color: IX.positive, halo: true);
    Draw.tag(c, 'A scalar (mass 5 kg, time 2 s) needs only a number.  A vector (force, displacement) also needs a direction.', Offset(cx, s.height - 60), size: 18);
  },
);

// ── Galileo's ramps ──

(double, double, double) _galileoRun(V v) {
  // Returns (height reached on ramp 2, distance along ramp 2, speed at the bottom).
  final h0 = v['h0']!, th1 = rad(30), th2 = rad(v['th2']!), mu = v['fric'] == 1 ? 0.1 : 0.0;
  final e = _g * h0 * (1 - mu / math.tan(th1)); // per unit mass at the bottom
  final vb = math.sqrt(math.max(0, 2 * e));
  if (th2 < 1e-3) return (0, mu == 0 ? double.infinity : e / (mu * _g), vb);
  final h2 = e / (_g * (1 + mu / math.tan(th2)));
  return (h2, h2 / math.sin(th2), vb);
}

final _galileo = ModeSpec(
  title: "Galileo's two ramps",
  formula: 'no friction → same height',
  values: {'h0': 1.5, 'th2': 30, 'fric': 0},
  controls: (v) => const [Sl('h0', 'Starting height', 0.5, 2, unit: 'm'), Sl('th2', 'Second ramp angle', 0, 60, unit: '°', div: 12), Seg('fric', 'Friction', ['None', 'μ = 0.1'])],
  presets: {'Steep second ramp': {'th2': 45}, 'Gentle ramp': {'th2': 10}, 'Flat: it never stops': {'th2': 0}, 'With friction': {'th2': 20, 'fric': 1}},
  readouts: (v) {
    final (h2, d2, vb) = _galileoRun(v);
    return [
      Readout('Height reached', v['th2']! < 1e-3 ? '—' : fx(h2), 'm', IX.accent),
      Readout('Distance on ramp 2', d2.isInfinite ? '∞ (never stops)' : fx(d2), d2.isInfinite ? '' : 'm', IX.positive),
      Readout('Speed at the bottom', fx(vb), 'm/s'),
      Readout('Starting height', fx(v['h0']!), 'm'),
    ];
  },
  paint: (c, s, v, t) {
    final h0 = v['h0']!, th2 = rad(v['th2']!);
    final (h2, d2, _) = _galileoRun(v);
    final th1 = rad(30);
    final l1 = h0 / math.tan(th1);
    final run2 = th2 < 1e-3 ? 3.0 : math.max(1.0, 2.2 / math.tan(th2));
    final ppm = math.min((s.height - 260) / 2.2, (s.width - 200) / (l1 + math.min(run2, 6)));
    final gy = s.height - 110, mid = 100 + l1 * ppm;
    // Ramp 1 (30°) down to the joint at mid; ramp 2 up at th2.
    final p1 = Offset(mid - l1 * ppm, gy - h0 * ppm);
    final path = Path()..moveTo(40, gy)..lineTo(p1.dx - 30, gy)..lineTo(p1.dx - 30, p1.dy)..lineTo(p1.dx, p1.dy)..lineTo(mid, gy);
    final far = th2 < 1e-3 ? Offset(s.width - 40, gy) : Offset(math.min(s.width - 40, mid + 2.4 / math.tan(th2) * ppm), gy - math.min(2.4, (s.width - 40 - mid) / ppm * math.tan(th2)) * ppm);
    path..lineTo(far.dx, far.dy)..lineTo(far.dx, gy)..lineTo(s.width - 40, gy);
    c.drawPath(Path.from(path)..close(), Draw.fill(const Color(0xFFE6EAF1)));
    c.drawLine(p1, Offset(mid, gy), Draw.stroke(IX.inkSoft, 3));
    c.drawLine(Offset(mid, gy), far, Draw.stroke(IX.inkSoft, 3));
    Draw.ground(c, Offset(40, gy), Offset(s.width - 40, gy));
    // Start height line.
    IxPaint.dashed(c, Offset(40, p1.dy), Offset(s.width - 40, p1.dy), Draw.stroke(IX.accent.withValues(alpha: 0.6), 2));
    Draw.text(c, 'starting height ${fx(h0)} m', Offset(p1.dx + 20, p1.dy - 22), size: 17, color: IX.accent, align: Alignment.centerLeft, halo: true);
    Draw.ball(c, p1 + const Offset(-8, -16), 16, IX.steel);
    Draw.angle(c, Offset(mid, gy), math.pi, math.pi + th1, 60, '30°');
    // Where it ends up.
    Offset end;
    if (th2 < 1e-3) {
      end = d2.isInfinite ? Offset(s.width - 80, gy) : Offset(math.min(s.width - 80, mid + d2 * ppm), gy);
      if (d2.isInfinite) {
        for (var i = 0; i < 4; i++) {
          IxPaint.arrow(c, Offset(mid + 120 + i * 150, gy - 60), Offset(mid + 200 + i * 150, gy - 60), IX.green, width: 3, head: 12);
        }
        Draw.text(c, 'keeps going at constant speed', Offset((mid + s.width) / 2, gy - 96), size: 19, color: IX.green, halo: true);
      }
    } else {
      end = Offset(mid, gy) + Offset(math.cos(th2), -math.sin(th2)) * d2 * ppm;
      Draw.angle(c, Offset(mid, gy), -th2, 0, 70, '${fx(v['th2']!, 0)}°');
      if (h2 > 0) Draw.dim(c, Offset(end.dx + 50, gy), Offset(end.dx + 50, end.dy), '${fx(h2)} m', color: IX.positive, off: end.dx > s.width - 160 ? 44 : -44);
    }
    final u = th2 < 1e-3 ? const Offset(0, -1) : Offset(-math.sin(th2), -math.cos(th2));
    Draw.ball(c, end + u * 16, 16, IX.accent);
    Draw.caption(c, v['fric'] == 1 ? 'Friction takes energy away: the ball stops short of its starting height.' : 'Smooth ramps: the ball always climbs back to its starting height.');
  },
);

// ── impulse ──

final _impulse = ModeSpec(
  title: 'Force, time and momentum',
  formula: 'F = Δp / Δt',
  values: {'scene': 0, 'F': 4, 'm': 2, 'tau': 2, 'mb': 0.15, 'vb': 20, 'dt': 0.1},
  controls: (v) => v['scene'] == 0
      ? const [Seg('scene', 'Situation', ['Push a cart', 'Stop a ball']), Sl('F', 'Force F', 1, 10, unit: 'N', div: 18), Sl('m', 'Mass m', 1, 10, unit: 'kg', div: 18), Sl('tau', 'Push time τ', 0.5, 4, unit: 's', div: 14)]
      : const [Seg('scene', 'Situation', ['Push a cart', 'Stop a ball']), Sl('mb', 'Mass of ball', 0.05, 1, unit: 'kg'), Sl('vb', 'Speed of ball', 1, 40, unit: 'm/s', div: 39), Sl('dt', 'Stopping time Δt', 0.01, 1, unit: 's', dp: 2)],
  presets: {'Gentle long push': {'F': 2, 'tau': 4}, 'Hard short push': {'F': 8, 'tau': 1}, 'Catch: hands back': {'scene': 1, 'dt': 0.4}, 'Catch: stiff hands': {'scene': 1, 'dt': 0.02}},
  readouts: (v) {
    if (v['scene'] == 1) {
      final dp = v['mb']! * v['vb']!;
      return [Readout('Change in momentum Δp', fx(dp), 'kg m/s', IX.accent), Readout('Average force Δp/Δt', fx(dp / v['dt']!, 1), 'N', IX.positive), Readout('Stopping time', fx(v['dt']!), 's')];
    }
    final imp = v['F']! * v['tau']!;
    return [
      Readout('Acceleration F/m', fx(v['F']! / v['m']!), 'm/s²'),
      Readout('Impulse F τ', fx(imp, 1), 'N s', IX.amber),
      Readout('Final momentum', fx(imp, 1), 'kg m/s', IX.accent),
      Readout('Final speed', fx(imp / v['m']!), 'm/s', IX.green),
    ];
  },
  paint: (c, s, v, t) {
    if (v['scene'] == 1) {
      final mb = v['mb']!, vb = v['vb']!, dt = v['dt']!;
      final dp = mb * vb;
      final left = Rect.fromLTWH(0, 0, s.width * 0.42, s.height);
      Draw.caption(c, 'A ball is caught: its momentum mv falls to zero in Δt.');
      final hand = Offset(left.width * 0.72, s.height * 0.45);
      // Glove / hand moving back over the stopping distance.
      final back = math.min(160.0, dt * 400);
      c.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: hand + Offset(back / 2, 0), width: back + 30, height: 8), const Radius.circular(4)), Draw.fill(IX.amber.withValues(alpha: 0.3)));
      c.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: hand + Offset(back + 34, 0), width: 56, height: 110), const Radius.circular(26)), Draw.fill(PX.wood));
      Draw.ball(c, hand + Offset(back - 6, 0), 26, PX.rose);
      Draw.force(c, hand + const Offset(-200, 0), hand + const Offset(-60, 0), IX.accent, 'v = ${fx(vb, 0)} m/s', w: 5);
      Draw.text(c, 'hands move back ${fx(vb * dt / 2, 2)} m', hand + Offset(back / 2, 80), size: 17, color: IX.amber);
      final p = Plot(Rect.fromLTRB(left.right, 26, s.width - 26, s.height - 26), 0, 1, 0, math.max(20.0, dp / 0.05), xl: 'Δt (s)', yl: 'F (N)', title: 'Average force F = Δp/Δt');
      p.frame(c);
      p.fn(c, (x) => dp / x, IX.ink, w: 4, a: 0.005);
      p.dot(c, dt, dp / dt, IX.positive, label: '${fx(dp / dt, 0)} N');
      return;
    }
    final f = v['F']!, m = v['m']!, tau = v['tau']!;
    final pf = f * tau;
    Draw.caption(c, 'A steady force F acts for τ on a smooth track, then the cart coasts.');
    const ty = 170.0;
    Draw.ground(c, Offset(40, ty + 30), Offset(s.width - 40, ty + 30));
    final body = Rect.fromLTWH(s.width * 0.42, ty - 40, 150, 56);
    Draw.cart(c, body, IX.accent, label: '${fx(m, 0)} kg');
    Draw.force(c, body.centerLeft + Offset(-30 - f * 12, -10), body.centerLeft + const Offset(-6, -10), IX.positive, 'F = ${fx(f, 0)} N', off: const Offset(0, -26));
    Draw.force(c, body.topCenter + const Offset(0, -24), body.topCenter + Offset(pf / m * 14 + 10, -24), IX.green, 'v = ${fx(pf / m)} m/s', w: 4);
    final (l, r) = (Rect.fromLTRB(26, 300, s.width / 2 - 8, s.height - 22), Rect.fromLTRB(s.width / 2 + 8, 300, s.width - 26, s.height - 22));
    final pfp = Plot(l, 0, 6, 0, 12, xl: 't (s)', yl: 'F (N)', title: 'Force–time: area = impulse');
    pfp.frame(c);
    pfp.area(c, (x) => f, 0, tau, IX.amber);
    pfp.fn(c, (x) => x <= tau ? f : 0, IX.positive, w: 4);
    Draw.text(c, 'F τ = ${fx(pf, 1)} N s', pfp.p(tau / 2, f / 2), size: 18, color: IX.amber, halo: true);
    final pp = Plot(r, 0, 6, 0, 40, xl: 't (s)', yl: 'p (kg m/s)', title: 'Momentum: slope = F');
    pp.frame(c);
    pp.fn(c, (x) => x <= tau ? f * x : pf, IX.accent, w: 4);
    pp.dot(c, tau, pf, IX.accent, label: 'p = F τ');
  },
);

// ── recoil ──

final _recoil = ModeSpec(
  title: 'Two carts push apart',
  formula: 'm₁v₁ + m₂v₂ = 0',
  values: {'m1': 4, 'm2': 2, 'E': 30},
  controls: (v) => const [Sl('m1', 'Left cart mass m₁', 1, 10, unit: 'kg', div: 18), Sl('m2', 'Right cart mass m₂', 1, 10, unit: 'kg', div: 18), Sl('E', 'Spring energy', 5, 100, unit: 'J', div: 19)],
  presets: {'Equal carts': {'m1': 3, 'm2': 3}, 'Heavy left': {'m1': 8, 'm2': 2}, 'Gun and bullet': {'m1': 10, 'm2': 1, 'E': 80}},
  readouts: (v) {
    final m1 = v['m1']!, m2 = v['m2']!, e = v['E']!;
    final v2 = math.sqrt(2 * e * m1 / (m2 * (m1 + m2))), v1 = -m2 * v2 / m1;
    return [
      Readout('Momentum of left cart', sg(m1 * v1), 'kg m/s', IX.accent),
      Readout('Momentum of right cart', sg(m2 * v2), 'kg m/s', IX.positive),
      Readout('Total momentum', fx(0, 2), 'kg m/s'),
      Readout('KE right ÷ KE left', fx(m1 / m2), '', IX.green),
    ];
  },
  paint: (c, s, v, t) {
    final m1 = v['m1']!, m2 = v['m2']!, e = v['E']!;
    final v2 = math.sqrt(2 * e * m1 / (m2 * (m1 + m2))), v1 = -m2 * v2 / m1;
    final cx = s.width / 2;
    Draw.caption(c, 'Before: at rest, spring compressed.   After 1 s: equal and opposite momenta.');
    for (final (row, after) in [(160.0, false), (390.0, true)]) {
      Draw.ground(c, Offset(40, row + 30), Offset(s.width - 40, row + 30));
      final w1 = 80 + m1 * 8, w2 = 80 + m2 * 8;
      final off1 = after ? v1 * 1 * 40 : 0.0, off2 = after ? v2 * 40 : 0.0;
      final b1 = Rect.fromLTWH(cx - 34 - w1 + off1, row - 40, w1, 56), b2 = Rect.fromLTWH(cx + 34 + off2, row - 40, w2, 56);
      if (!after) Draw.spring(c, b1.centerRight + const Offset(0, -10), b2.centerLeft + const Offset(0, -10), coils: 8, width: 26);
      Draw.cart(c, b1, IX.accent, label: '${fx(m1, 0)} kg');
      Draw.cart(c, b2, IX.positive, label: '${fx(m2, 0)} kg');
      if (after) {
        Draw.force(c, b1.topCenter + const Offset(0, -26), b1.topCenter + Offset(v1 * 22, -26), IX.accent, '${fx(v1.abs())} m/s', w: 4);
        Draw.force(c, b2.topCenter + const Offset(0, -26), b2.topCenter + Offset(v2 * 22, -26), IX.positive, '${fx(v2)} m/s', w: 4);
      }
      Draw.text(c, after ? 'after' : 'before', Offset(60, row - 60), size: 18, color: IX.muted, align: Alignment.centerLeft);
    }
    Draw.bars(c, Rect.fromLTRB(26, 520, s.width / 2 - 8, s.height - 22), [('p₁', m1 * v1, IX.accent), ('p₂', m2 * v2, IX.positive), ('total', 0, IX.ink)], unit: '', title: 'Momentum (kg m/s)');
    Draw.bars(c, Rect.fromLTRB(s.width / 2 + 8, 520, s.width - 26, s.height - 22), [('K₁', 0.5 * m1 * v1 * v1, IX.accent), ('K₂', 0.5 * m2 * v2 * v2, IX.positive), ('spring', e, IX.amber)], title: 'Energy (J)');
  },
);

// ── collisions ──

(double, double) _after(V v) {
  final m1 = v['m1']!, m2 = v['m2']!, u1 = v['u1']!, u2 = v['u2']!, e = v['e']!;
  final p = m1 * u1 + m2 * u2;
  return ((p - m2 * e * (u1 - u2)) / (m1 + m2), (p + m1 * e * (u1 - u2)) / (m1 + m2));
}

final _collide = ModeSpec(
  title: 'Collisions on a track',
  chapter: '1st PUC Physics · Work, energy and power',
  formula: 'e = (v₂ − v₁)/(u₁ − u₂)',
  values: {'m1': 2, 'm2': 3, 'u1': 4, 'u2': -2, 'e': 1},
  controls: (v) => const [Sl('m1', 'Mass of blue cart m₁', 0.5, 10, unit: 'kg', div: 19), Sl('m2', 'Mass of orange cart m₂', 0.5, 10, unit: 'kg', div: 19), Sl('u1', 'Blue velocity u₁', -10, 10, unit: 'm/s', div: 40), Sl('u2', 'Orange velocity u₂', -10, 10, unit: 'm/s', div: 40), Sl('e', 'Restitution e', 0, 1, div: 20)],
  presets: {
    'Elastic': {'e': 1},
    'Inelastic (e = 0.5)': {'e': 0.5},
    'Stick together': {'e': 0, 'm1': 2, 'm2': 1, 'u1': 6, 'u2': 0},
    'Equal masses, one at rest': {'m1': 2, 'm2': 2, 'u1': 6, 'u2': 0, 'e': 1},
  },
  readouts: (v) {
    final (v1, v2) = _after(v);
    final m1 = v['m1']!, m2 = v['m2']!, u1 = v['u1']!, u2 = v['u2']!;
    final kb = 0.5 * m1 * u1 * u1 + 0.5 * m2 * u2 * u2, ka = 0.5 * m1 * v1 * v1 + 0.5 * m2 * v2 * v2;
    return [
      Readout('Blue after v₁', sg(v1), 'm/s', IX.accent),
      Readout('Orange after v₂', sg(v2), 'm/s', IX.positive),
      Readout('Momentum (both)', sg(m1 * u1 + m2 * u2), 'kg m/s'),
      Readout('KE lost', fx(kb - ka, 1), 'J', IX.amber),
    ];
  },
  paint: (c, s, v, t) {
    final (v1, v2) = _after(v);
    final m1 = v['m1']!, m2 = v['m2']!, u1 = v['u1']!, u2 = v['u2']!;
    final cx = s.width / 2;
    final rel = u1 - u2;
    Draw.caption(c, rel <= 0 ? 'These carts are moving apart: they will not collide.' : 'Before and after a head-on collision.');
    for (final (row, after) in [(150.0, false), (360.0, true)]) {
      Draw.ground(c, Offset(40, row + 30), Offset(s.width - 40, row + 30));
      final w1 = 70 + m1 * 8, w2 = 70 + m2 * 8;
      final b1 = Rect.fromLTWH(cx - w1 - (after ? 70 : 140), row - 40, w1, 56), b2 = Rect.fromLTWH(cx + (after ? (v['e']! < 0.01 ? -70 : 70) : 140), row - 40, w2, 56);
      Draw.cart(c, b1, IX.accent, label: '${fx(m1, 1)} kg');
      Draw.cart(c, b2, IX.positive, label: '${fx(m2, 1)} kg');
      final a = after ? v1 : u1, b = after ? v2 : u2;
      if (after && v['e']! < 0.01) {
        if (a.abs() > 0.05) Draw.force(c, Offset(cx, row - 66), Offset(cx + a * 16, row - 66), IX.ink, 'together ${sg(a, 1)}', w: 4);
        continue;
      }
      if (a.abs() > 0.05) Draw.force(c, b1.topCenter + const Offset(0, -26), b1.topCenter + Offset(a * 16, -26), IX.accent, sg(a, 1), w: 4);
      if (b.abs() > 0.05) Draw.force(c, b2.topCenter + const Offset(0, -26), b2.topCenter + Offset(b * 16, -26), IX.positive, sg(b, 1), w: 4);
      Draw.text(c, after ? 'after' : 'before', Offset(60, row - 64), size: 18, color: IX.muted, align: Alignment.centerLeft);
    }
    final kb = 0.5 * m1 * u1 * u1 + 0.5 * m2 * u2 * u2, ka = 0.5 * m1 * v1 * v1 + 0.5 * m2 * v2 * v2;
    Draw.bars(c, Rect.fromLTRB(26, 480, s.width / 2 - 8, s.height - 22), [('before', m1 * u1 + m2 * u2, IX.accent), ('after', m1 * v1 + m2 * v2, IX.accent)], title: 'Total momentum (kg m/s)');
    Draw.bars(c, Rect.fromLTRB(s.width / 2 + 8, 480, s.width - 26, s.height - 22), [('before', kb, IX.green), ('after', ka, IX.green), ('lost', kb - ka, IX.amber)], title: 'Kinetic energy (J)');
  },
);

// ── friction ──

final _friction = ModeSpec(
  title: 'Pull a block against friction',
  formula: 'f ≤ μs N,  f_k = μk N',
  values: {'F': 15, 'm': 4, 'mus': 0.5, 'muk': 0.4},
  controls: (v) => const [Sl('F', 'Pull F', 0, 60, unit: 'N', div: 60), Sl('m', 'Mass m', 1, 10, unit: 'kg', div: 18), Sl('mus', 'μs (static)', 0.1, 0.8, div: 14), Sl('muk', 'μk (kinetic)', 0.05, 0.7, div: 13)],
  presets: {'Gentle pull': {'F': 10}, 'Just at the limit': {'F': 19.6}, 'Sliding': {'F': 30}},
  readouts: (v) {
    final n = v['m']! * _g, fs = v['mus']! * n, fk = math.min(v['muk']!, v['mus']!) * n, f = v['F']!;
    final slide = f > fs;
    return [
      Readout('Friction now', fx(slide ? fk : f, 1), 'N', IX.positive),
      Readout('Limiting friction μs N', fx(fs, 1), 'N'),
      Readout('Acceleration', fx(slide ? (f - fk) / v['m']! : 0), 'm/s²', IX.accent),
      Readout('Block', slide ? 'Sliding' : 'At rest', ''),
    ];
  },
  paint: (c, s, v, t) {
    final m = v['m']!, n = m * _g, fs = v['mus']! * n, fk = math.min(v['muk']!, v['mus']!) * n, f = v['F']!;
    final slide = f > fs, fr = slide ? fk : f;
    final left = Rect.fromLTWH(0, 0, s.width * 0.48, s.height);
    final gy = s.height * 0.6;
    Draw.ground(c, Offset(40, gy), Offset(left.right - 20, gy));
    final box = Rect.fromCenter(center: Offset(left.center.dx - 20, gy - 70), width: 140 + m * 4, height: 140);
    Draw.block(c, box, PX.wood, label: '${fx(m, 0)} kg');
    const k = 3.2; // px per N
    Draw.force(c, box.centerRight, box.centerRight + Offset(f * k, 0), IX.accent, 'F', off: const Offset(0, -24));
    Draw.force(c, Offset(box.center.dx, box.bottom - 4), Offset(box.center.dx - fr * k, box.bottom - 4), IX.positive, 'f', off: const Offset(0, 24));
    Draw.force(c, box.center, box.center + Offset(0, n * 2), IX.inkSoft, 'mg', w: 4);
    Draw.force(c, box.topCenter, box.topCenter + Offset(0, -n * 2), IX.green, 'N', w: 4);
    if (slide) Draw.text(c, 'sliding →', Offset(box.center.dx, gy + 44), size: 20, color: IX.accent);
    final p = Plot(Rect.fromLTRB(left.right, 26, s.width - 26, s.height - 26), 0, 60, 0, math.max(40.0, fs * 1.4), xl: 'applied force F (N)', yl: 'friction f (N)', title: 'Friction against the pull');
    p.frame(c);
    p.fn(c, (x) => x <= fs ? x : fk, IX.positive, w: 4);
    p.vline(c, fs, IX.muted, label: 'μs N');
    p.dot(c, f, fr, IX.accent, label: slide ? 'kinetic' : 'static');
  },
);

// ── incline ──

final _incline = ModeSpec(
  title: 'A block on an incline',
  formula: 'slides when tan θ > μs',
  values: {'th': 20, 'mu': 0.5},
  controls: (v) => const [Sl('th', 'Incline angle θ', 0, 80, unit: '°', div: 80), Sl('mu', 'Coefficient μs', 0.05, 1, div: 19)],
  presets: {'Holds (20°)': {'th': 20}, 'Angle of repose': {'th': 26.6}, 'Slides (40°)': {'th': 40}},
  readouts: (v) {
    final th = rad(v['th']!), mu = v['mu']!;
    final net = _g * (math.sin(th) - mu * math.cos(th));
    return [
      Readout('Angle of repose tan⁻¹μ', fx(deg(math.atan(mu)), 1), '°', IX.amber),
      Readout('g sin θ (down the slope)', fx(_g * math.sin(th)), 'm/s²', IX.accent),
      Readout('μ g cos θ (max friction)', fx(mu * _g * math.cos(th)), 'm/s²', IX.positive),
      Readout('Acceleration', net > 0 ? fx(net) : '0 (holds)', net > 0 ? 'm/s²' : ''),
    ];
  },
  paint: (c, s, v, t) {
    final th = rad(v['th']!), mu = v['mu']!;
    final left = Rect.fromLTWH(0, 0, s.width * 0.5, s.height);
    final base = left.width - 120;
    final bl = Offset(60, s.height - 120);
    final tanT = math.min(math.tan(th), (s.height - 240) / base);
    final thd = math.atan(tanT);
    final (a, top) = Draw.incline(c, bl, base, thd);
    Draw.ground(c, Offset(40, bl.dy), Offset(left.right - 20, bl.dy));
    final u = Offset(math.cos(thd), -math.sin(thd)), nrm = Offset(-math.sin(thd), -math.cos(thd));
    final mid = Offset.lerp(a, top, 0.55)!;
    const bw = 110.0, bh = 76.0;
    final centre = mid + nrm * (bh / 2);
    c.save();
    c.translate(centre.dx, centre.dy);
    c.rotate(-thd);
    Draw.block(c, Rect.fromCenter(center: Offset.zero, width: bw, height: bh), PX.wood, label: 'm');
    c.restore();
    const k = 14.0;
    final down = _g * math.sin(th), fmax = mu * _g * math.cos(th);
    final fr = math.min(down, fmax);
    Draw.force(c, centre, centre + const Offset(0, 1) * _g * k, IX.inkSoft, 'mg', w: 4);
    Draw.force(c, centre, centre + nrm * _g * math.cos(th) * k, IX.green, 'N', w: 4);
    Draw.force(c, centre - nrm * (bh / 2 - 6), centre - nrm * (bh / 2 - 6) + u * fr * k, IX.positive, 'f', w: 4);
    Draw.force(c, centre, centre - u * down * k, IX.accent, 'mg sin θ', w: 3);
    Draw.angle(c, a, -thd, 0, 80, '${fx(v['th']!, 0)}°');
    final slides = down > fmax;
    Draw.tag(c, slides ? 'Slides down' : 'Friction holds it', Offset(left.center.dx, 40), color: slides ? IX.positive : IX.green);
    final p = Plot(Rect.fromLTRB(left.right, 26, s.width - 26, s.height - 26), 0, 80, 0, 1.0, xl: 'θ (°)', yl: '÷ g', title: 'Pull down the slope vs greatest friction');
    p.frame(c);
    p.fn(c, (x) => math.sin(rad(x)), IX.accent, w: 4, label: 'sin θ', labelAt: 70);
    p.fn(c, (x) => mu * math.cos(rad(x)), IX.positive, w: 4, label: 'μ cos θ', labelAt: 12);
    final rep = deg(math.atan(mu));
    p.vline(c, rep, IX.amber, label: 'repose ${fx(rep, 1)}°');
    p.dot(c, v['th']!, math.sin(th), IX.accent);
  },
);
