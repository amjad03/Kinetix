import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'kit.dart';

/// Motion in a plane (1st PUC ch. 3): projectiles and motion under constant acceleration.
final projectileSpec = InstrumentSpec(
  id: 'projectile',
  chapter: '1st PUC Physics · Motion in a plane',
  modes: {'launch': _launch, 'plane': _plane},
);

/// Circular motion (ch. 3), the banked road (ch. 4) and v = ω × r on a rigid body (ch. 6).
final circularSpec = InstrumentSpec(
  id: 'circular',
  chapter: '1st PUC Physics · Motion in a plane',
  modes: {'whirl': _whirl, 'banked': _banked, 'plate': _plate},
);

// ── projectile ──

final _launch = ModeSpec(
  title: 'Launch a projectile',
  formula: 'R = u² sin 2θ / g',
  values: {'u': 20, 'th': 30, 'g': 9.8, 'comp': 1, 'tt': 1},
  controls: (v) => const [Sl('u', 'Launch speed u', 5, 30, unit: 'm/s', div: 25), Sl('th', 'Angle θ', 5, 85, unit: '°', div: 80), Sl('g', 'Gravity g', 1.6, 25, unit: 'm/s²', dp: 1), Sl('tt', 'Time t', 0, 6, unit: 's', div: 60), Seg('comp', 'Compare 90° − θ', ['Off', 'On'])],
  presets: {'θ = 45° (longest)': {'th': 45}, '30° and 60°': {'th': 30, 'comp': 1}, 'Steep 75°': {'th': 75}, 'On the Moon': {'g': 1.6, 'u': 10, 'th': 45}},
  readouts: (v) {
    final u = v['u']!, th = rad(v['th']!), g = v['g']!;
    return [
      Readout('Range R', fx(u * u * math.sin(2 * th) / g, 1), 'm', IX.accent),
      Readout('Greatest height H', fx(u * u * math.pow(math.sin(th), 2) / (2 * g), 1), 'm', IX.positive),
      Readout('Time of flight', fx(2 * u * math.sin(th) / g), 's', IX.green),
      Readout('H / R = tan θ / 4', fx(math.tan(th) / 4, 3), ''),
    ];
  },
  paint: (c, s, v, t) {
    final u = v['u']!, th = rad(v['th']!), g = v['g']!;
    final range = u * u * math.sin(2 * th) / g, h = u * u * math.pow(math.sin(th), 2) / (2 * g);
    final xmax = math.max(20.0, niceStep(u * u / g, 4) * ((u * u / g * 1.08) / niceStep(u * u / g, 4)).ceil());
    final ymax = xmax * (s.height - 110) / (s.width - 130);
    final p = Plot(Rect.fromLTRB(20, 20, s.width - 20, s.height - 16), 0, xmax, 0, ymax, xl: 'x (m)', yl: 'y (m)');
    p.frame(c, card: false);
    double y(double x, double a) => x * math.tan(a) - g * x * x / (2 * u * u * math.pow(math.cos(a), 2));
    if (v['comp'] == 1 && (v['th']! - 45).abs() > 0.5) {
      p.fn(c, (x) => y(x, math.pi / 2 - th), IX.green, w: 3.5, dash: true, b: range, label: '90° − θ', labelAt: range * 0.5);
    }
    p.fn(c, (x) => y(x, th), IX.accent, w: 4.5, b: range);
    // The ball at time t with its velocity components.
    final tf = 2 * u * math.sin(th) / g;
    final tt = math.min(v['tt']!, tf);
    final bx = u * math.cos(th) * tt, by = u * math.sin(th) * tt - g * tt * tt / 2;
    final bp = p.p(bx, by);
    final k = 5.0;
    final vx = u * math.cos(th), vy = u * math.sin(th) - g * tt;
    IxPaint.arrow(c, bp, bp + Offset(vx * k, 0), IX.accent, width: 4, head: 16);
    IxPaint.arrow(c, bp, bp + Offset(0, -vy * k), IX.positive, width: 4, head: 16);
    Draw.text(c, 'vₓ', bp + Offset(vx * k + 22, 0), size: 18, color: IX.accent, halo: true);
    Draw.text(c, 'vᵧ', bp + Offset(0, -vy * k + (vy > 0 ? -20 : 20)), size: 18, color: IX.positive, halo: true);
    Draw.ball(c, bp, 13, IX.ink);
    p.dot(c, range / 2, h, IX.positive, label: 'H = ${fx(h, 1)} m');
    p.dot(c, range, 0, IX.accent, label: 'R = ${fx(range, 1)} m', off: const Offset(-12, -22));
    Draw.angle(c, p.p(0, 0), -th, 0, 60, '${fx(v['th']!, 0)}°');
    Draw.tag(c, 't = ${fx(tt, 2)} s:  vₓ = ${fx(vx, 1)} m/s stays the same, vᵧ = ${fx(vy, 1)} m/s', Offset(s.width - 40, 46), align: Alignment.centerRight);
  },
);

final _plane = ModeSpec(
  title: 'Velocity and acceleration in a plane',
  formula: 'r = v₀t + ½at²',
  values: {'vx0': 4, 'vy0': 5, 'ax': 0, 'ay': -2, 'tt': 3},
  controls: (v) => const [Sl('vx0', 'Starting vₓ', -5, 10, unit: 'm/s', div: 30), Sl('vy0', 'Starting vᵧ', -5, 5, unit: 'm/s', div: 20), Sl('ax', 'Acceleration aₓ', -4, 4, unit: 'm/s²', div: 16), Sl('ay', 'Acceleration aᵧ', -4, 4, unit: 'm/s²', div: 16), Sl('tt', 'Time t', 0, 10, unit: 's', div: 40)],
  presets: {'Parabola': {'vx0': 4, 'vy0': 5, 'ax': 0, 'ay': -2}, 'v₀ along x, a at an angle': {'vx0': 5, 'vy0': 0, 'ax': 3, 'ay': 2, 'tt': 6}, 'Straight line (v₀ ∥ a)': {'vx0': 2, 'vy0': 2, 'ax': 1, 'ay': 1}},
  readouts: (v) {
    final t = v['tt']!;
    final vx = v['vx0']! + v['ax']! * t, vy = v['vy0']! + v['ay']! * t;
    return [
      Readout('x(t)', fx(v['vx0']! * t + v['ax']! * t * t / 2, 1), 'm', IX.accent),
      Readout('y(t)', fx(v['vy0']! * t + v['ay']! * t * t / 2, 1), 'm', IX.green),
      Readout('Speed |v|', fx(math.sqrt(vx * vx + vy * vy)), 'm/s', IX.positive),
      Readout('Angle of v', '${fx(deg(math.atan2(vy, vx)), 1)}°', ''),
    ];
  },
  paint: (c, s, v, t) {
    final vx0 = v['vx0']!, vy0 = v['vy0']!, ax = v['ax']!, ay = v['ay']!, tt = v['tt']!;
    double xt(double q) => vx0 * q + ax * q * q / 2;
    double yt(double q) => vy0 * q + ay * q * q / 2;
    // Fit the path to 0..10 s.
    var x0 = 0.0, x1 = 0.0, y0 = 0.0, y1 = 0.0;
    for (var i = 0; i <= 100; i++) {
      final q = i / 10;
      x0 = math.min(x0, xt(q));
      x1 = math.max(x1, xt(q));
      y0 = math.min(y0, yt(q));
      y1 = math.max(y1, yt(q));
    }
    final left = Rect.fromLTWH(0, 0, s.width * 0.58, s.height);
    final span = math.max(x1 - x0, (y1 - y0) * left.width / left.height) * 1.1 + 1;
    final cxm = (x0 + x1) / 2, cym = (y0 + y1) / 2;
    final hy = span * left.height / left.width / 2;
    final p = Plot(left.deflate(8), cxm - span / 2, cxm + span / 2, cym - hy, cym + hy, xl: 'x (m)', yl: 'y (m)', title: 'Path in the x–y plane');
    p.frame(c);
    p.fn(c, (q) => 0, Colors.transparent);
    c.save();
    c.clipRect(p.r);
    final path = Path();
    for (var i = 0; i <= 200; i++) {
      final q = 10 * i / 200;
      final pt = p.p(xt(q), yt(q));
      i == 0 ? path.moveTo(pt.dx, pt.dy) : path.lineTo(pt.dx, pt.dy);
    }
    c.drawPath(path, Draw.stroke(IX.ink, 4));
    c.restore();
    final bp = p.p(xt(tt), yt(tt));
    final vx = vx0 + ax * tt, vy = vy0 + ay * tt;
    final k = 12.0;
    Draw.force(c, bp, bp + Offset(vx, -vy) * k, IX.accent, 'v', w: 4);
    Draw.force(c, bp, bp + Offset(ax, -ay) * k * 2, IX.positive, 'a', w: 4);
    Draw.ball(c, bp, 12, IX.ink);
    final pr = Rect.fromLTRB(left.right + 10, 26, s.width - 26, s.height - 26);
    final q = Plot(pr, 0, 10, math.min(-10, math.min(y0, x0)), math.max(10, math.max(x1, y1)), xl: 't (s)', yl: 'm', title: 'x(t) and y(t) are independent');
    q.frame(c);
    q.fn(c, xt, IX.accent, w: 4, label: 'x(t)', labelAt: 8.5);
    q.fn(c, yt, IX.green, w: 4, label: 'y(t)', labelAt: 6);
    q.vline(c, tt, IX.muted);
  },
);

// ── whirling stone ──

final _whirl = ModeSpec(
  title: 'Uniform circular motion',
  formula: 'a = v²/r = ω²r',
  values: {'r': 3, 'w': 1.5, 'cut': 0},
  controls: (v) => const [Sl('r', 'Radius r', 1, 5, unit: 'm', div: 16), Sl('w', 'Angular speed ω', 0.5, 3, unit: 'rad/s', div: 25), Seg('cut', 'String', ['Whirling', 'Cut'])],
  presets: {'Slow, wide': {'r': 4, 'w': 1}, 'Fast, tight': {'r': 1.5, 'w': 3}, 'Cut the string': {'cut': 1}},
  animate: true,
  readouts: (v) {
    final r = v['r']!, w = v['w']!;
    return [
      Readout('Speed v = ωr', fx(w * r), 'm/s', IX.accent),
      Readout('Centripetal a = ω²r', fx(w * w * r), 'm/s²', IX.positive),
      Readout('Period 2π/ω', fx(2 * math.pi / w), 's'),
      Readout('Frequency', fx(w / (2 * math.pi)), 'Hz'),
    ];
  },
  paint: (c, s, v, t) {
    final r = v['r']!, w = v['w']!;
    final left = Rect.fromLTWH(0, 0, s.width * 0.55, s.height);
    final o = left.center, ppm = (left.height - 140) / 10;
    c.drawCircle(o, r * ppm, Draw.stroke(IX.rule, 2));
    IxPaint.dashed(c, o + Offset(-r * ppm, 0), o + Offset(r * ppm, 0), Draw.stroke(IX.grid, 1));
    final cut = v['cut'] == 1;
    const tc = 1.2; // the string is cut at angle 1.2 rad
    final period = 2 * math.pi / w;
    final tm = t % (cut ? period * 0.9 : period);
    double ang = w * tm;
    Offset pos;
    Offset vel = Offset(-math.sin(ang), -math.cos(ang)) * w * r;
    if (cut && ang > tc) {
      final p0 = o + Offset(math.cos(tc), -math.sin(tc)) * r * ppm;
      final v0 = Offset(-math.sin(tc), -math.cos(tc)) * w * r;
      pos = p0 + v0 * ((ang - tc) / w) * ppm;
      vel = v0;
      IxPaint.dashed(c, p0, p0 + v0 / v0.distance * 600, Draw.stroke(IX.positive.withValues(alpha: 0.6), 2));
      Draw.text(c, 'flies off along the tangent', p0 + v0 / v0.distance * 200 + const Offset(20, -20), size: 18, color: IX.positive, align: Alignment.centerLeft, halo: true);
    } else {
      pos = o + Offset(math.cos(ang), -math.sin(ang)) * r * ppm;
      c.drawLine(o, pos, Draw.stroke(IX.inkSoft, 2.5));
      Draw.force(c, pos, Offset.lerp(pos, o, math.min(0.6, 0.12 * w * w))!, IX.positive, 'a', w: 4);
    }
    c.drawCircle(o, 7, Draw.fill(IX.ink));
    Draw.force(c, pos, pos + vel * 22, IX.accent, 'v', w: 4);
    Draw.ball(c, pos, 16, IX.steel);
    final p = Plot(Rect.fromLTRB(left.right, 26, s.width - 26, s.height - 26), 0, 15, 0, 50, xl: 'v (m/s)', yl: 'a (m/s²)', title: 'a = v²/r for this radius');
    p.frame(c);
    p.fn(c, (x) => x * x / r, IX.positive, w: 4);
    p.dot(c, w * r, w * w * r, IX.positive, label: '${fx(w * w * r, 1)} m/s²');
  },
);

// ── banked road ──

final _banked = ModeSpec(
  title: 'Taking a banked curve',
  chapter: '1st PUC Physics · Laws of motion',
  formula: 'v₀ = √(rg tan θ)',
  values: {'v': 60, 'r': 100, 'th': 15, 'mu': 0.2},
  controls: (v) => const [Sl('v', 'Speed', 20, 150, unit: 'km/h', div: 26), Sl('r', 'Radius of curve', 10, 500, unit: 'm', div: 49), Sl('th', 'Banking angle θ', 0, 40, unit: '°', div: 40), Sl('mu', 'Friction μ', 0, 0.8, div: 16)],
  presets: {'Level road': {'th': 0}, 'Optimum speed': {'v': 52.4, 'r': 100, 'th': 12, 'mu': 0.2}, 'Too fast': {'v': 120}},
  readouts: (v) {
    final (vmax, v0, vmin) = _bank(v);
    final vm = v['v']! / 3.6;
    return [
      Readout('Maximum safe speed', vmax.isInfinite ? 'no limit' : fx(vmax * 3.6, 0), vmax.isInfinite ? '' : 'km/h', IX.positive),
      Readout('Optimum (no friction)', fx(v0 * 3.6, 0), 'km/h', IX.green),
      Readout('Minimum speed', fx(vmin * 3.6, 0), 'km/h'),
      Readout('v²/r needed', fx(vm * vm / v['r']!), 'm/s²', IX.accent),
    ];
  },
  paint: (c, s, v, t) {
    final th = rad(v['th']!), vm = v['v']! / 3.6, r = v['r']!;
    final (vmax, v0, vmin) = _bank(v);
    final left = Rect.fromLTWH(0, 0, s.width * 0.5, s.height);
    // Cross-section of the banked road, the centre of the curve off to the left.
    final c0 = Offset(left.center.dx, s.height * 0.58);
    final half = 230.0;
    final u = Offset(math.cos(th), -math.sin(th));
    final a = c0 - u * half, b = c0 + u * half;
    final road = Path()..moveTo(a.dx, a.dy)..lineTo(b.dx, b.dy)..lineTo(b.dx, c0.dy + 80)..lineTo(a.dx, c0.dy + 80)..close();
    c.drawPath(road, Draw.fill(const Color(0xFFDCE1EA)));
    c.drawLine(a, b, Draw.stroke(const Color(0xFF4B5068), 10));
    Draw.angle(c, a, -th, 0, 90, '${fx(v['th']!, 0)}°');
    Draw.text(c, '← centre of the curve', Offset(left.left + 40, 50), size: 18, color: IX.inkSoft, align: Alignment.centerLeft);
    // Car seen from behind.
    final n = Offset(-math.sin(th), -math.cos(th));
    final cc = c0 + n * 46;
    c.save();
    c.translate(cc.dx, cc.dy);
    c.rotate(-th);
    Draw.block(c, const Rect.fromLTWH(-70, -34, 140, 60), IX.accent, radius: 14);
    c.drawRRect(RRect.fromRectAndRadius(const Rect.fromLTWH(-46, -62, 92, 32), const Radius.circular(10)), Draw.fill(Color.lerp(IX.accent, Colors.white, 0.2)!));
    for (final x in [-52.0, 52.0]) {
      c.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: Offset(x, 32), width: 26, height: 24), const Radius.circular(5)), Draw.fill(const Color(0xFF2E3250)));
    }
    c.restore();
    // Forces per unit mass: mg down, N along the normal, friction along the slope.
    const k = 14.0;
    final need = vm * vm / r;
    // Solve N and f (per unit mass) with f along −u (down-slope positive inward)…
    final nn = 9.8 * math.cos(th) + need * math.sin(th);
    final f = need * math.cos(th) - 9.8 * math.sin(th); // + means friction acts down the slope (inward)
    Draw.force(c, cc, cc + const Offset(0, 9.8 * k), IX.inkSoft, 'mg', w: 4);
    Draw.force(c, cc, cc + n * nn * k, IX.green, 'N', w: 4);
    if (f.abs() > 0.2) Draw.force(c, c0, c0 - u * f * k, IX.positive, 'f', w: 4, off: const Offset(0, 24));
    Draw.force(c, cc + const Offset(0, -120), cc + Offset(-need * k, -120), IX.accent, 'mv²/r needed', w: 4);
    final st = vm > vmax ? 'Skids outwards' : (vm < vmin ? 'Slides down the bank' : (f.abs() < 0.2 ? 'No friction needed' : 'Safe: friction helps'));
    Draw.tag(c, st, Offset(left.center.dx, s.height - 60), color: (vm > vmax || vm < vmin) ? IX.positive : IX.green);
    final mu = v['mu']!;
    final p = Plot(Rect.fromLTRB(left.right, 26, s.width - 26, s.height - 26), 10, 500, 0, 80, xl: 'r (m)', yl: 'v (m/s)', title: 'Maximum safe speed against radius');
    p.frame(c);
    p.fn(c, (x) => math.sqrt(mu * x * 9.8), IX.green, w: 4, label: 'level road', labelAt: 420);
    final den = 1 - mu * math.tan(th);
    if (den > 0) p.fn(c, (x) => math.sqrt(x * 9.8 * (mu + math.tan(th)) / den), IX.accent, w: 4, label: 'banked ${fx(v['th']!, 0)}°', labelAt: 300);
    p.dot(c, r, vm, IX.positive, label: 'you: ${fx(vm, 1)} m/s');
  },
);

(double, double, double) _bank(V v) {
  final th = rad(v['th']!), r = v['r']!, mu = v['mu']!;
  final tn = math.tan(th);
  final den = 1 - mu * tn;
  final vmax = den <= 0 ? double.infinity : math.sqrt(r * 9.8 * (mu + tn) / den);
  final v0 = math.sqrt(r * 9.8 * tn);
  final vmin = tn > mu ? math.sqrt(r * 9.8 * (tn - mu) / (1 + mu * tn)) : 0.0;
  return (vmax, v0, vmin);
}

// ── spinning plate: v = ω × r ──

final _plate = ModeSpec(
  title: 'Velocity on a spinning plate',
  chapter: '1st PUC Physics · System of particles and rotational motion',
  formula: 'v = ω × r',
  values: {'w': 1, 'px': 2, 'py': 1},
  controls: (v) => const [Sl('w', 'Angular velocity ω', -3, 3, unit: 'rad/s', div: 24), Sl('px', 'Point P: x', -3, 3, unit: 'm', div: 24), Sl('py', 'Point P: y', -3, 3, unit: 'm', div: 24)],
  presets: {'Anticlockwise': {'w': 1}, 'Clockwise': {'w': -1.5}, 'Near the axis': {'px': 0.5, 'py': 0.5}, 'At the rim': {'px': 3, 'py': 0}},
  drag: (v, p, s, start) {
    final ppm = (s.height - 140) / 7, o = s.center(Offset.zero) - Offset(s.width * 0.12, 0);
    final i = pick(v, p, start, [o + Offset(v['px']!, -v['py']!) * ppm]);
    if (i == null) return false;
    final q = (p - o) / ppm;
    v['px'] = q.dx.clamp(-3, 3);
    v['py'] = (-q.dy).clamp(-3, 3);
    return true;
  },
  readouts: (v) {
    final r = math.sqrt(v['px']! * v['px']! + v['py']! * v['py']!);
    return [
      Readout('Distance r from axis', fx(r), 'm'),
      Readout('Speed v = ωr', fx(v['w']!.abs() * r), 'm/s', IX.accent),
      Readout('ω points', v['w']! >= 0 ? 'out of the screen ⊙' : 'into the screen ⊗', ''),
    ];
  },
  paint: (c, s, v, t) {
    final w = v['w']!, ppm = (s.height - 140) / 7, o = s.center(Offset.zero) - Offset(s.width * 0.12, 0);
    final rad3 = 3.2 * ppm;
    c.drawCircle(o + const Offset(0, 8), rad3, Paint()..color = const Color(0x2213165A)..maskFilter = const MaskFilter.blur(BlurStyle.normal, 10));
    c.drawCircle(o, rad3, Draw.fill(const Color(0xFFEFF2F8)));
    c.drawCircle(o, rad3, Draw.stroke(IX.steel, 4));
    for (var i = 0; i < 12; i++) {
      final a = i * math.pi / 6;
      c.drawLine(o + Offset(math.cos(a), math.sin(a)) * rad3 * 0.92, o + Offset(math.cos(a), math.sin(a)) * rad3, Draw.stroke(IX.steel, 2));
    }
    // Velocity field: a few arrows on rings, all ⟂ r.
    for (final rr in [1.0, 2.0, 3.0]) {
      for (var i = 0; i < 8; i++) {
        final a = i * math.pi / 4 + rr * 0.3;
        final p = o + Offset(math.cos(a), -math.sin(a)) * rr * ppm;
        final vel = Offset(-math.sin(a), -math.cos(a)) * w * rr;
        if (vel.distance > 0.05) IxPaint.arrow(c, p, p + Offset(vel.dx, vel.dy) * 18, IX.muted.withValues(alpha: 0.7), width: 2.5, head: 10);
      }
    }
    final pp = o + Offset(v['px']!, -v['py']!) * ppm;
    c.drawLine(o, pp, Draw.stroke(IX.ink, 3));
    Draw.text(c, 'r', Offset.lerp(o, pp, 0.5)! + const Offset(-14, -14), size: 20, halo: true);
    final vel = Offset(-v['py']!, -v['px']!) * w; // ω ẑ × (x, y) = (−ωy, ωx); screen y flipped
    Draw.force(c, pp, pp + vel * 34, IX.accent, 'v = ωr', w: 5);
    IxPaint.handle(c, pp, IX.positive, r: 15, active: v['_drag'] == 0);
    Draw.text(c, 'P', pp + const Offset(18, 18), size: 20, color: IX.positive);
    c.drawCircle(o, 14, Draw.stroke(PX.violet, 3));
    if (w >= 0) {
      c.drawCircle(o, 4, Draw.fill(PX.violet));
    } else {
      c.drawLine(o + const Offset(-7, -7), o + const Offset(7, 7), Draw.stroke(PX.violet, 3));
      c.drawLine(o + const Offset(-7, 7), o + const Offset(7, -7), Draw.stroke(PX.violet, 3));
    }
    Draw.text(c, 'ω (axis)', o + const Offset(0, -30), size: 17, color: PX.violet, halo: true);
    Draw.tag(c, w >= 0 ? 'Anticlockwise: ω out of the screen' : 'Clockwise: ω into the screen', Offset(s.width - 30, 40), align: Alignment.centerRight);
    Draw.caption(c, 'Drag P. Every point moves on a circle; v is perpendicular to r.', at: Offset(28, s.height - 44));
  },
);
