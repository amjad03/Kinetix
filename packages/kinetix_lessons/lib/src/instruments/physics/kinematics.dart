import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'kit.dart';

/// Motion in a straight line (1st PUC ch. 2) and relative velocity (ch. 15): a car on a
/// graduated road above its x–t and v–t graphs.
///
/// Modes: route (displacement vs distance), tangent (average → instantaneous velocity),
/// uniform (v = u + at, area = displacement), stopping (reaction + braking distance),
/// vertical (ball thrown up), relative (two cars, ground or car-A frame).
final kinematicsSpec = InstrumentSpec(
  id: 'kinematics',
  chapter: '1st PUC Physics · Motion in a straight line',
  modes: {
    'route': _route,
    'tangent': _tangent,
    'uniform': _uniform,
    'stopping': _stopping,
    'vertical': _vertical,
    'relative': _relative,
  },
);

// ── route: x = 10t − (5/6)t², out to +30 m at t = 6 s and back past the start ──

double _xr(double t) => 10 * t - 5 / 6 * t * t;
double _pathLen(double a, double b) {
  if (b < a) (a, b) = (b, a);
  if (b <= 6 || a >= 6) return (_xr(b) - _xr(a)).abs();
  return (_xr(6) - _xr(a)) + (_xr(6) - _xr(b));
}

final _route = ModeSpec(
  title: 'Displacement or distance?',
  formula: 'v̄ = Δx / Δt',
  values: {'ta': 2, 'tb': 10},
  controls: (v) => const [Sl('ta', 'First time t₁', 0, 14, unit: 's', div: 28), Sl('tb', 'Second time t₂', 0, 14, unit: 's', div: 28)],
  presets: {
    'Out only (0–6 s)': {'ta': 0, 'tb': 6},
    'Out and back (2–10 s)': {'ta': 2, 'tb': 10},
    'Back to start (0–12 s)': {'ta': 0, 'tb': 12},
  },
  readouts: (v) {
    final a = math.min(v['ta']!, v['tb']!), b = math.max(v['ta']!, v['tb']!);
    final disp = _xr(b) - _xr(a), dist = _pathLen(a, b), dt = b - a;
    return [
      Readout('Displacement', sg(disp, 1), 'm', IX.accent),
      Readout('Distance', fx(dist, 1), 'm', IX.positive),
      Readout('Average velocity', dt > 0 ? sg(disp / dt) : '—', 'm/s', IX.accent),
      Readout('Average speed', dt > 0 ? fx(dist / dt) : '—', 'm/s', IX.positive),
    ];
  },
  paint: (c, s, v, t) {
    final a = math.min(v['ta']!, v['tb']!), b = math.max(v['ta']!, v['tb']!);
    final ppm = (s.width - 120) / 80, o = 60 + 40 * ppm; // −40 … +40 m
    final ry = 150.0;
    Draw.caption(c, 'The car drives out to +30 m, turns at t = 6 s, and comes back past the start.');
    Draw.road(c, 40, s.width - 40, ry, origin: o, ppm: ppm, every: 10);
    // The path actually driven, out and back, as a thin track above the road.
    final out = Offset(o + _xr(a) * ppm, ry - 70);
    final turn = b > 6 && a < 6;
    c.drawLine(out, Offset(o + _xr(turn ? 6 : b) * ppm, ry - 70), Draw.stroke(IX.positive.withValues(alpha: 0.75), 5));
    if (turn) {
      c.drawLine(Offset(o + 30 * ppm, ry - 56), Offset(o + _xr(b) * ppm, ry - 56), Draw.stroke(IX.positive.withValues(alpha: 0.75), 5));
      c.drawArc(Rect.fromCircle(center: Offset(o + 30 * ppm, ry - 63), radius: 7), -math.pi / 2, math.pi, false, Draw.stroke(IX.positive.withValues(alpha: 0.75), 5));
    }
    Draw.text(c, 'distance ${fx(_pathLen(a, b), 1)} m', Offset(o + _xr(a) * ppm, ry - 96), size: 17, color: IX.positive, align: Alignment.centerLeft);
    Draw.car(c, Offset(o + _xr(a) * ppm, ry + 10), IX.steel, w: 90, dir: a < 6 ? 1 : -1, label: 't₁');
    Draw.car(c, Offset(o + _xr(b) * ppm, ry + 10), IX.accent, w: 90, dir: b < 6 ? 1 : -1, label: 't₂');
    IxPaint.arrow(c, Offset(o + _xr(a) * ppm, ry + 92), Offset(o + _xr(b) * ppm, ry + 92), IX.accent, width: 5, head: 18);
    Draw.text(c, 'displacement ${sg(_xr(b) - _xr(a), 1)} m', Offset((o + (_xr(a) + _xr(b)) / 2 * ppm), ry + 118), size: 17, color: IX.accent, halo: true);
    final p = Plot(Rect.fromLTRB(26, 300, s.width - 26, s.height - 22), 0, 14, -30, 40, xl: 't (s)', yl: 'x (m)', title: 'Position–time graph');
    p.frame(c);
    p.fn(c, _xr, IX.ink, w: 4);
    c.drawLine(p.p(a, _xr(a)), p.p(b, _xr(b)), Draw.stroke(IX.positive, 3.5));
    Draw.text(c, 'chord: slope = average velocity', Offset.lerp(p.p(a, _xr(a)), p.p(b, _xr(b)), 0.5)! + const Offset(0, -26), size: 16, color: IX.positive, halo: true);
    p.dot(c, a, _xr(a), IX.steel, label: 't₁');
    p.dot(c, b, _xr(b), IX.accent, label: 't₂');
    p.vline(c, 6, IX.muted, label: 'turns round');
  },
);

// ── tangent: chord over Δt shrinking to the tangent ──

double _xc(V v, double t) => v['curve'] == 1 ? v['p']! * t * t : 0.2 * t * t * t - 2 * t * t + 6 * t + 2;
double _vc(V v, double t) => v['curve'] == 1 ? 2 * v['p']! * t : 0.6 * t * t - 4 * t + 6;

final _tangent = ModeSpec(
  title: 'From average to instantaneous velocity',
  formula: 'v = lim Δx/Δt = dx/dt',
  values: {'curve': 0, 'p': 0.5, 't0': 2, 'dt': 1.5, 'tangent': 1},
  controls: (v) => [
    const Seg('curve', 'Motion', ['x = 0.2t³ − 2t² + 6t + 2', 'x = p t²']),
    if (v['curve'] == 1) const Sl('p', 'p in x = p t²', 0.1, 1, unit: 'm/s²'),
    const Sl('t0', 'Instant t', 0, 6, unit: 's', div: 24),
    const Sl('dt', 'Interval Δt', 0.05, 2, unit: 's', dp: 2),
    const Seg('tangent', 'Tangent line', ['Hidden', 'Shown']),
  ],
  presets: {
    'Wide chord': {'t0': 2, 'dt': 1.5},
    'Narrow chord': {'t0': 2, 'dt': 0.1},
    'x = p t²': {'curve': 1, 'p': 0.5, 't0': 2, 'dt': 1},
  },
  readouts: (v) {
    final t0 = v['t0']!, dt = v['dt']!;
    final avg = (_xc(v, t0 + dt) - _xc(v, t0)) / dt, inst = _vc(v, t0);
    return [
      Readout('Average velocity Δx/Δt', sg(avg), 'm/s', IX.positive),
      Readout('Instantaneous dx/dt', sg(inst), 'm/s', IX.accent),
      Readout('Difference', sg(avg - inst, 3), 'm/s'),
      Readout('Position x(t)', fx(_xc(v, t0)), 'm'),
    ];
  },
  paint: (c, s, v, t) {
    final t0 = v['t0']!, dt = v['dt']!, t1 = t0 + dt;
    final ymax = v['curve'] == 1 ? math.max(10.0, _xc(v, 8) + 2) : 12.0;
    final p = Plot(Rect.fromLTRB(26, 26, s.width - 26, s.height - 22), 0, 8, v['curve'] == 1 ? 0 : -2, ymax, xl: 't (s)', yl: 'x (m)', title: v['curve'] == 1 ? 'x = p t²' : 'x = 0.2t³ − 2t² + 6t + 2');
    p.frame(c);
    p.fn(c, (x) => _xc(v, x), IX.ink, w: 4.5);
    // Rise and run of the chord.
    final a = p.p(t0, _xc(v, t0)), b = p.p(t1, _xc(v, t1));
    final paint = Draw.stroke(IX.positive.withValues(alpha: 0.6), 2);
    IxPaint.dashed(c, a, Offset(b.dx, a.dy), paint, dash: 7, gap: 5);
    IxPaint.dashed(c, Offset(b.dx, a.dy), b, paint, dash: 7, gap: 5);
    Draw.text(c, 'Δt', Offset((a.dx + b.dx) / 2, a.dy + (b.dy > a.dy ? -18 : 20)), size: 17, color: IX.positive, halo: true);
    Draw.text(c, 'Δx', Offset(b.dx + 26, (a.dy + b.dy) / 2), size: 17, color: IX.positive, halo: true);
    final m = (_xc(v, t1) - _xc(v, t0)) / dt;
    p.fn(c, (x) => _xc(v, t0) + m * (x - t0), IX.positive, w: 3.5, a: t0 - 1.5, b: t1 + 1.5);
    if (v['tangent'] == 1) p.fn(c, (x) => _xc(v, t0) + _vc(v, t0) * (x - t0), IX.accent, w: 3, a: t0 - 2, b: t0 + 2, dash: true);
    p.dot(c, t0, _xc(v, t0), IX.accent, label: 't');
    p.dot(c, t1, _xc(v, t1), IX.positive, label: 't + Δt');
    p.legend(c, [('chord (average)', IX.positive), if (v['tangent'] == 1) ('tangent (instantaneous)', IX.accent)]);
  },
);

// ── uniform acceleration: v = u + at ──

final _uniform = ModeSpec(
  title: 'Uniformly accelerated motion',
  formula: 'v = u + at,  s = ut + ½at²',
  values: {'u': 10, 'a': -2, 't1': 5},
  controls: (v) => const [Sl('u', 'Initial velocity u', -10, 20, unit: 'm/s', div: 30), Sl('a', 'Acceleration a', -5, 5, unit: 'm/s²', div: 20), Sl('t1', 'Time t', 0, 10, unit: 's', div: 20)],
  presets: {
    'Braking (u = 10, a = −2)': {'u': 10, 'a': -2, 't1': 5},
    'Speeding up': {'u': 2, 'a': 2, 't1': 4},
    'Turns back': {'u': 10, 'a': -2, 't1': 8},
    'From rest': {'u': 0, 'a': 2, 't1': 3},
  },
  readouts: (v) {
    final u = v['u']!, a = v['a']!, t1 = v['t1']!;
    final vel = u + a * t1, sdisp = u * t1 + a * t1 * t1 / 2;
    final nth = t1 >= 1 ? u + a * (2 * t1.round() - 1) / 2 : double.nan;
    return [
      Readout('Velocity v', sg(vel), 'm/s', IX.accent),
      Readout('Displacement s', sg(sdisp, 1), 'm', IX.green),
      Readout('Average velocity', sg(u + a * t1 / 2), 'm/s'),
      Readout('s in ${t1.round()}th second', t1 >= 1 ? sg(nth) : '—', 'm'),
      Readout('Motion', vel.abs() < 0.01 ? 'Momentarily at rest' : (a == 0 ? 'Steady speed' : (vel * a > 0 ? 'Speeding up' : 'Slowing down')), ''),
    ];
  },
  paint: (c, s, v, t) {
    final u = v['u']!, a = v['a']!, t1 = v['t1']!;
    double sx(double tt) => u * tt + a * tt * tt / 2;
    double vx(double tt) => u + a * tt;
    final ppm = (s.width - 160) / 200, o = 80 + 60 * ppm; // −60 … 140 m
    const ry = 120.0;
    Draw.road(c, 40, s.width - 40, ry, origin: o, ppm: ppm, every: 20);
    final xcar = o + sx(t1).clamp(-65, 145) * ppm;
    Draw.car(c, Offset(xcar, ry + 10), IX.accent, w: 96, dir: vx(t1) >= 0 ? 1 : -1);
    if (vx(t1).abs() > 0.05) Draw.force(c, Offset(xcar, ry - 62), Offset(xcar + vx(t1) * 7, ry - 62), IX.accent, 'v', w: 5);
    if (a != 0) Draw.force(c, Offset(xcar, ry - 90), Offset(xcar + a * 18, ry - 90), IX.positive, 'a', w: 4);
    final (l, r) = (Rect.fromLTRB(26, 240, s.width / 2 - 8, s.height - 22), Rect.fromLTRB(s.width / 2 + 8, 240, s.width - 26, s.height - 22));
    final pv = Plot(l, 0, 10, -30, 40, xl: 't (s)', yl: 'v (m/s)', title: 'v–t: slope a, area s');
    pv.frame(c);
    pv.area(c, (x) => math.max(0, vx(x)), 0, t1, IX.accent);
    pv.area(c, (x) => math.min(0, vx(x)), 0, t1, IX.positive);
    pv.fn(c, vx, IX.ink, w: 4);
    pv.dot(c, t1, vx(t1), IX.accent, label: 'v = ${sg(vx(t1), 1)}');
    final ps = Plot(r, 0, 10, -60, 200, xl: 't (s)', yl: 's (m)', title: 's–t: slope v');
    ps.frame(c);
    ps.fn(c, sx, IX.ink, w: 4);
    ps.fn(c, (x) => sx(t1) + vx(t1) * (x - t1), IX.accent, a: t1 - 1.5, b: t1 + 1.5, w: 3);
    ps.dot(c, t1, sx(t1), IX.green, label: 's = ${sg(sx(t1), 1)}');
  },
);

// ── stopping distance ──

final _stopping = ModeSpec(
  title: 'Stopping distance of a car',
  formula: 'd = u tᵣ + u²/2a',
  values: {'u': 60, 'tr': 1, 'a': 6, 'wet': 0},
  controls: (v) => const [Sl('u', 'Speed', 20, 100, unit: 'km/h', div: 16), Sl('tr', 'Reaction time', 0.2, 2, unit: 's', div: 18), Sl('a', 'Braking deceleration', 4, 9, unit: 'm/s²', div: 10), Seg('wet', 'Road', ['Dry', 'Wet (60 % grip)'])],
  presets: {
    'Town, 50 km/h': {'u': 50, 'tr': 1, 'a': 7},
    'Highway, 100 km/h': {'u': 100, 'tr': 1, 'a': 7},
    'Tired driver': {'u': 60, 'tr': 2, 'a': 7},
    'Wet road': {'u': 60, 'tr': 1, 'a': 7, 'wet': 1},
  },
  readouts: (v) {
    final u = v['u']! / 3.6, ae = v['a']! * (v['wet'] == 1 ? 0.6 : 1);
    final dr = u * v['tr']!, db = u * u / (2 * ae);
    return [
      Readout('Reaction distance', fx(dr, 1), 'm', IX.amber),
      Readout('Braking distance', fx(db, 1), 'm', IX.positive),
      Readout('Stopping distance', fx(dr + db, 1), 'm', IX.ink),
      Readout('Time to stop', fx(v['tr']! + u / ae), 's'),
    ];
  },
  paint: (c, s, v, t) {
    final u = v['u']! / 3.6, ae = v['a']! * (v['wet'] == 1 ? 0.6 : 1), tr = v['tr']!;
    final dr = u * tr, db = u * u / (2 * ae);
    final ppm = (s.width - 200) / 150, o = 100.0;
    const ry = 170.0;
    Draw.caption(c, 'The driver sees the hazard at 0 m. ${v['wet'] == 1 ? 'Wet road: braking grip cut to 60 %.' : 'Dry road.'}');
    Draw.road(c, 40, s.width - 40, ry, origin: o, ppm: ppm, every: 10);
    // Reaction and braking bands.
    final band = Rect.fromLTWH(o, ry - 92, dr * ppm, 20);
    c.drawRRect(RRect.fromRectAndRadius(band, const Radius.circular(4)), Draw.fill(IX.amber.withValues(alpha: 0.85)));
    final band2 = Rect.fromLTWH(o + dr * ppm, ry - 92, db * ppm, 20);
    c.drawRRect(RRect.fromRectAndRadius(band2, const Radius.circular(4)), Draw.fill(IX.positive.withValues(alpha: 0.85)));
    Draw.text(c, 'reaction ${fx(dr, 1)} m', Offset(band.center.dx, ry - 112), size: 17, color: IX.amber);
    Draw.text(c, 'braking ${fx(db, 1)} m', Offset(band2.center.dx, ry - 112), size: 17, color: IX.positive);
    Draw.car(c, Offset(o - 40, ry + 10), IX.steel, w: 80);
    Draw.car(c, Offset(math.min(o + (dr + db) * ppm - 40, s.width - 60), ry + 10), IX.accent, w: 80);
    c.drawLine(Offset(o, ry - 100), Offset(o, ry + 34), Draw.stroke(IX.amber, 2));
    final stop = o + (dr + db) * ppm;
    c.drawLine(Offset(stop, ry - 100), Offset(stop, ry + 34), Draw.stroke(IX.positive, 2));
    final (l, r) = (Rect.fromLTRB(26, 290, s.width * 0.55 - 8, s.height - 22), Rect.fromLTRB(s.width * 0.55 + 8, 290, s.width - 26, s.height - 22));
    final ts = tr + u / ae;
    double vt(double x) => x < tr ? u : math.max(0, u - ae * (x - tr));
    final pv = Plot(l, 0, 8, 0, 30, xl: 't (s)', yl: 'v (m/s)', title: 'v–t: area = distance');
    pv.frame(c);
    pv.area(c, vt, 0, tr, IX.amber);
    pv.area(c, vt, tr, ts, IX.positive);
    pv.fn(c, vt, IX.ink, w: 4, b: math.min(8, ts + 0.5));
    final pd = Plot(r, 20, 100, 0, 160, xl: 'u (km/h)', yl: 'd (m)', title: 'Stopping distance vs speed');
    pd.frame(c);
    pd.fn(c, (k) => k / 3.6 * tr + math.pow(k / 3.6, 2) / (2 * ae), IX.ink, w: 4);
    pd.fn(c, (k) => math.pow(k / 3.6, 2) / (2 * ae), IX.positive, w: 2.5, dash: true, label: 'braking only', labelAt: 85);
    pd.dot(c, v['u']!, dr + db, IX.accent, label: '${fx(dr + db, 0)} m');
  },
);

// ── vertical throw ──

final _vertical = ModeSpec(
  title: 'A ball thrown straight up',
  formula: 'y = h₀ + ut − ½gt²',
  values: {'h0': 20, 'u': 10, 'g': 9.8},
  controls: (v) => const [Sl('h0', 'Starting height h₀', 0, 50, unit: 'm', div: 50), Sl('u', 'Throw velocity u (+ up)', -20, 40, unit: 'm/s', div: 60), Sl('g', 'Gravity g', 1.6, 25, unit: 'm/s²', dp: 1)],
  presets: {
    'From a 20 m roof': {'h0': 20, 'u': 10, 'g': 9.8},
    'From the ground': {'h0': 0, 'u': 20, 'g': 9.8},
    'On the Moon': {'h0': 0, 'u': 20, 'g': 1.6},
    'Thrown down': {'h0': 40, 'u': -10, 'g': 9.8},
  },
  readouts: (v) {
    final h0 = v['h0']!, u = v['u']!, g = v['g']!;
    final tf = (u + math.sqrt(u * u + 2 * g * h0)) / g;
    return [
      Readout('Highest point', fx(h0 + math.max(u, 0) * math.max(u, 0) / (2 * g), 1), 'm', IX.accent),
      Readout('Time to the top', u > 0 ? fx(u / g) : '—', 's'),
      Readout('Time of flight', fx(tf), 's', IX.green),
      Readout('Landing speed', fx(math.sqrt(u * u + 2 * g * h0), 1), 'm/s', IX.positive),
    ];
  },
  paint: (c, s, v, t) {
    final h0 = v['h0']!, u = v['u']!, g = v['g']!;
    final tf = (u + math.sqrt(u * u + 2 * g * h0)) / g;
    final hmax = h0 + math.max(u, 0) * math.max(u, 0) / (2 * g);
    final top = math.max(10.0, niceStep(hmax, 4) * (hmax / niceStep(hmax, 4)).ceil());
    // Left: a tower and a stroboscopic picture of the ball every Δt.
    final left = Rect.fromLTWH(0, 0, s.width * 0.36, s.height);
    final gy = s.height - 70, ppm = (s.height - 170) / top;
    Draw.ground(c, Offset(30, gy), Offset(left.right - 10, gy));
    final tower = Rect.fromLTWH(70, gy - h0 * ppm, 90, h0 * ppm);
    if (h0 > 0) Draw.block(c, tower, const Color(0xFFB9C0D0), radius: 3);
    for (var m = 0.0; m <= top + 1e-6; m += niceStep(top, 5)) {
      c.drawLine(Offset(42, gy - m * ppm), Offset(52, gy - m * ppm), Draw.stroke(IX.inkSoft, 2));
      Draw.text(c, fx(m, 0), Offset(38, gy - m * ppm), size: 15, color: IX.inkSoft, w: FontWeight.w500, align: Alignment.centerRight);
    }
    Draw.text(c, 'm', const Offset(38, 30), size: 15, color: IX.inkSoft, align: Alignment.centerRight);
    final n = math.max(6, math.min(16, (tf / 0.25).round()));
    final dtf = tf / n;
    for (var i = 0; i <= n; i++) {
      final tt = i * dtf;
      final y = h0 + u * tt - g * tt * tt / 2;
      final vy = u - g * tt;
      final x = 250.0 + (vy > 0 ? 0 : 46);
      Draw.ball(c, Offset(x, gy - y * ppm - 13), 13, i == 0 ? IX.steel : Color.lerp(IX.accent, IX.positive, i / n)!);
    }
    Draw.text(c, 'up', Offset(250, 24), size: 16, color: IX.inkSoft);
    Draw.text(c, 'down', Offset(296, 24), size: 16, color: IX.inkSoft);
    Draw.text(c, 'one ball every ${fx(dtf)} s', Offset(left.center.dx + 30, gy + 40), size: 16, color: IX.inkSoft, w: FontWeight.w500);
    final pr = Rect.fromLTRB(left.right + 10, 22, s.width - 26, s.height / 2 - 6);
    final py = Plot(pr, 0, math.max(2.0, tf * 1.05), 0, top, xl: 't (s)', yl: 'y (m)', title: 'Height: a parabola');
    py.frame(c);
    py.fn(c, (x) => h0 + u * x - g * x * x / 2, IX.accent, w: 4, b: tf);
    if (u > 0) py.dot(c, u / g, hmax, IX.accent, label: 'top: v = 0');
    final vmax = math.max(u.abs(), math.sqrt(u * u + 2 * g * h0)) * 1.1;
    final pv = Plot(Rect.fromLTRB(pr.left, s.height / 2 + 6, pr.right, s.height - 22), 0, math.max(2.0, tf * 1.05), -vmax, vmax, xl: 't (s)', yl: 'v (m/s)', title: 'Velocity: a line of slope −g');
    pv.frame(c);
    pv.fn(c, (x) => u - g * x, IX.positive, w: 4, b: tf);
    if (u > 0) pv.dot(c, u / g, 0, IX.positive, label: 'a is still −g here');
  },
);

// ── relative velocity ──

final _relative = ModeSpec(
  title: 'Two cars on a road',
  chapter: '1st PUC Physics · Relative velocity',
  formula: 'v_BA = v_B − v_A',
  values: {'vA': 20, 'vB': 10, 'd': 60, 'rel': 0, 'time': 3},
  controls: (v) => const [Sl('vA', 'Velocity of car A', 0, 25, unit: 'm/s', div: 25), Sl('vB', 'Velocity of car B', -15, 25, unit: 'm/s', div: 40), Sl('d', 'Starting gap', 0, 100, unit: 'm', div: 20), Sl('time', 'Time t', 0, 10, unit: 's', div: 20), Seg('rel', 'Frame', ['Ground', 'Seen from car A'])],
  presets: {
    'A catches B': {'vA': 20, 'vB': 10, 'd': 60, 'time': 3},
    'Head-on': {'vA': 15, 'vB': -10, 'd': 100, 'time': 2},
    'Same speed': {'vA': 15, 'vB': 15, 'd': 40, 'time': 5},
    'From car A': {'vA': 20, 'vB': 10, 'd': 60, 'time': 3, 'rel': 1},
  },
  readouts: (v) {
    final vr = v['vB']! - v['vA']!, gap = v['d']! + vr * v['time']!;
    final meet = vr < 0 ? v['d']! / -vr : double.nan;
    return [
      Readout('v_BA = v_B − v_A', sg(vr, 1), 'm/s', IX.accent),
      Readout('Gap now', sg(gap, 1), 'm'),
      Readout('They meet at', meet.isNaN ? 'never' : fx(meet, 1), meet.isNaN ? '' : 's', IX.positive),
      Readout('v_AB', sg(-vr, 1), 'm/s'),
    ];
  },
  paint: (c, s, v, t) {
    final vA = v['vA']!, vB = v['vB']!, d = v['d']!, tt = v['time']!, rel = v['rel'] == 1;
    final xa = rel ? 0.0 : vA * tt, xb = d + (rel ? (vB - vA) : vB) * tt;
    final ppm = (s.width - 160) / 340, o = 80 + 40 * ppm; // −40 … 300 m
    Draw.caption(c, rel ? 'Frame of car A: A stands still, B moves at v_B − v_A = ${sg(vB - vA, 1)} m/s.' : 'Ground frame at t = ${fx(tt, 1)} s.');
    Draw.road(c, 40, s.width - 40, 150, origin: o, ppm: ppm, every: 20);
    Draw.car(c, Offset(o + xa.clamp(-45, 305) * ppm, 160), IX.accent, w: 92, label: 'A');
    Draw.car(c, Offset(o + xb.clamp(-45, 305) * ppm, 160), IX.positive, w: 92, dir: (rel ? vB - vA : vB) >= 0 ? 1 : -1, label: 'B');
    final p = Plot(Rect.fromLTRB(26, 270, s.width - 26, s.height - 22), 0, 10, -40, 300, xl: 't (s)', yl: rel ? 'x relative to A (m)' : 'x (m)', title: rel ? 'Position of B as seen from A' : 'Position–time graphs: slopes are velocities');
    p.frame(c);
    if (rel) {
      p.fn(c, (x) => d + (vB - vA) * x, IX.positive, w: 4, label: 'B (from A)');
      p.hline(c, 0, IX.accent, label: 'A');
    } else {
      p.fn(c, (x) => vA * x, IX.accent, w: 4, label: 'A', labelAt: 9);
      p.fn(c, (x) => d + vB * x, IX.positive, w: 4, label: 'B', labelAt: 7);
    }
    p.vline(c, tt, IX.muted);
    if (vB < vA) {
      final tm = d / (vA - vB);
      p.dot(c, tm, rel ? 0 : vA * tm, IX.ink, label: 'meet at ${fx(tm, 1)} s');
    }
  },
);
