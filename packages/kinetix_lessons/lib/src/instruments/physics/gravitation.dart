import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import 'kit.dart';

/// Gravitation (1st PUC ch. 7): Kepler orbits, Newton's law, g with height and depth, escape
/// speed and satellite orbits. Orbits are exact conics, not step-by-step guesses.
final gravitationSpec = InstrumentSpec(
  id: 'gravitation',
  chapter: '1st PUC Physics · Gravitation',
  modes: {'kepler': _kepler, 'force': _force, 'gvar': _gvar, 'escape': _escape, 'satellite': _satellite},
);

const _planets = ['Earth', 'Moon', 'Mars'];
const _g0 = [9.8, 1.62, 3.71];
const _rKm = [6400.0, 1737.0, 3390.0];

void _planetDisc(Canvas c, Offset o, double r, int which) {
  final cols = [const Color(0xFF3B6EA8), const Color(0xFF9CA3AF), const Color(0xFFB45A3C)];
  final col = cols[which.clamp(0, 2)];
  c.drawCircle(o, r, Paint()..shader = ui.Gradient.radial(o - Offset(r * 0.35, r * 0.35), r * 1.3, [Color.lerp(col, Colors.white, 0.35)!, col, Color.lerp(col, Colors.black, 0.35)!], [0, 0.6, 1]));
}

void _sun(Canvas c, Offset o, double r) => Draw.lamp(c, o, const Color(0xFFE0A526), r: r);

// ── Kepler ──

/// Position on an ellipse (a, e) at mean anomaly M: returns (x, y) from the focus, in AU.
Offset _kep(double a, double e, double m) {
  var ea = m;
  for (var i = 0; i < 30; i++) {
    ea -= (ea - e * math.sin(ea) - m) / (1 - e * math.cos(ea));
  }
  return Offset(a * (math.cos(ea) - e), a * math.sqrt(1 - e * e) * math.sin(ea));
}

final _kepler = ModeSpec(
  title: "Kepler's laws: a planet on an elliptical orbit",
  formula: 'T² ∝ a³  (T = a^1.5 yr, a in AU)',
  values: {'a': 1, 'ecc': 0.5, 'areas': 1},
  controls: (v) => const [Sl('a', 'Semi-major axis a', 0.6, 2, unit: 'AU', div: 14), Sl('ecc', 'Eccentricity e', 0, 0.75, div: 15), Seg('areas', 'Equal areas in equal times', ['Hidden', 'Shown'])],
  presets: {'Nearly circular (Earth)': {'a': 1, 'ecc': 0.02}, 'Elongated': {'a': 1.5, 'ecc': 0.7}, 'Mars-like': {'a': 1.52, 'ecc': 0.09}},
  animate: true,
  readouts: (v) {
    final a = v['a']!, e = v['ecc']!;
    return [
      Readout('Period T = a^1.5', fx(math.pow(a, 1.5).toDouble()), 'years', IX.accent),
      Readout('Closest / farthest', '${fx(a * (1 - e))} / ${fx(a * (1 + e))}', 'AU'),
      Readout('Fastest ÷ slowest speed', fx((1 + e) / (1 - e)), '', IX.positive),
      Readout('Mean speed 29.8/√a', fx(29.8 / math.sqrt(a), 1), 'km/s'),
    ];
  },
  paint: (c, s, v, t) {
    final a = v['a']!, e = v['ecc']!;
    final left = Rect.fromLTWH(0, 0, s.width * 0.62, s.height);
    final scale = math.min((left.width - 80) / 4.0, (left.height - 80) / 4.0);
    // Centre the ellipse in the panel; the Sun sits at a focus.
    final ctr = Offset(left.center.dx, left.center.dy);
    final focus = ctr + Offset(a * e * scale, 0);
    Offset px(Offset au) => focus + Offset(au.dx, -au.dy) * scale;
    final period = math.pow(a, 1.5).toDouble();
    const secs = 12;
    if (v['areas'] == 1) {
      for (var k = 0; k < secs; k += 3) {
        final path = Path()..moveTo(focus.dx, focus.dy);
        for (var i = 0; i <= 20; i++) {
          final q = px(_kep(a, e, 2 * math.pi * (k + i / 20) / secs));
          path.lineTo(q.dx, q.dy);
        }
        path.close();
        c.drawPath(path, Draw.fill(IX.accent.withValues(alpha: 0.12)));
        c.drawPath(path, Draw.stroke(IX.accent.withValues(alpha: 0.4), 1.5));
      }
      Draw.text(c, 'each shaded sector: 1/12 of a year-orbit, equal areas', Offset(ctr.dx, left.bottom - 30), size: 17, color: IX.accent);
    }
    c.drawOval(Rect.fromCenter(center: ctr, width: 2 * a * scale, height: 2 * a * math.sqrt(1 - e * e) * scale), Draw.stroke(IX.inkSoft, 2.5));
    _sun(c, focus, 22);
    Draw.text(c, 'Sun', focus + const Offset(0, 40), size: 17, color: IX.amber);
    final m = 2 * math.pi * ((t / 2.5) / period % 1);
    final p = px(_kep(a, e, m));
    c.drawLine(focus, p, Draw.stroke(IX.inkSoft.withValues(alpha: 0.6), 1.5));
    _planetDisc(c, p, 12, 0);
    Draw.text(c, 'perihelion', px(Offset(a * (1 - e), 0)) + const Offset(0, 26), size: 16, color: IX.inkSoft);
    Draw.text(c, 'aphelion', px(Offset(-a * (1 + e), 0)) + const Offset(0, 26), size: 16, color: IX.inkSoft);
    final pl = Plot(Rect.fromLTRB(left.right + 10, 26, s.width - 26, s.height - 26), 0, 40, 0, 260, xl: 'a (AU)', yl: 'T (years)', title: 'Third law T = a^1.5');
    pl.frame(c);
    pl.fn(c, (x) => math.pow(x, 1.5).toDouble(), IX.accent, w: 4);
    for (final (n, aa) in [('Earth', 1.0), ('Jupiter', 5.2), ('Saturn', 9.58), ('Uranus', 19.2), ('Neptune', 30.1)]) {
      pl.dot(c, aa, math.pow(aa, 1.5).toDouble(), IX.ink, label: n, rr: 5);
    }
  },
);

// ── Newton's law ──

final _force = ModeSpec(
  title: 'Gravity between two bodies',
  formula: 'F = G m₁m₂ / r²',
  values: {'sc': 0, 'm1': 6, 'm2': 7.5, 'r': 3.84, 'b1': 100, 'b2': 100, 'rb': 1},
  controls: (v) => v['sc'] == 0
      ? const [Seg('sc', 'Bodies', ['Earth and Moon', 'Two lead balls']), Sl('m1', 'Mass 1 (× 10²⁴ kg)', 0.5, 10, div: 19), Sl('m2', 'Mass 2 (× 10²² kg)', 1, 20, div: 19), Sl('r', 'Distance r (× 10⁸ m)', 1, 8, div: 28)]
      : const [Seg('sc', 'Bodies', ['Earth and Moon', 'Two lead balls']), Sl('b1', 'Mass m₁', 10, 1000, unit: 'kg', div: 99), Sl('b2', 'Mass m₂', 10, 1000, unit: 'kg', div: 99), Sl('rb', 'Distance r', 0.2, 5, unit: 'm', div: 48)],
  presets: {'Earth–Moon': {'sc': 0}, 'Double the distance': {'sc': 0, 'r': 7.68}, 'Lead balls 1 m apart': {'sc': 1, 'b1': 100, 'b2': 100, 'rb': 1}},
  readouts: (v) {
    if (v['sc'] == 1) {
      final f = 6.674e-11 * v['b1']! * v['b2']! / (v['rb']! * v['rb']!);
      return [Readout('Force on each', fx(f * 1e6, 3), 'µN', IX.accent), Readout('Force at 2r', fx(f * 1e6 / 4, 3), 'µN'), Readout('Weight of m₁ on Earth', fx(v['b1']! * 9.8, 0), 'N')];
    }
    final f = 6.674e-11 * v['m1']! * 1e24 * v['m2']! * 1e22 / math.pow(v['r']! * 1e8, 2);
    return [Readout('Force on each body', sc(f), 'N', IX.accent), Readout('Force at 2r', sc(f / 4), 'N'), Readout('Pull per kg on body 2', sc(f / (v['m2']! * 1e22)), 'N/kg')];
  },
  paint: (c, s, v, t) {
    final lead = v['sc'] == 1;
    final r = lead ? v['rb']! : v['r']!, rmax = lead ? 5.0 : 8.0;
    final k = lead ? 6.674e-11 * v['b1']! * v['b2']! * 1e6 : 6.674e-11 * v['m1']! * 1e24 * v['m2']! * 1e22 / 1e16 / 1e20;
    // k / r² gives µN (lead) or 10²⁰ N (Earth–Moon, r in 10⁸ m).
    final f = k / (r * r);
    final top = Rect.fromLTWH(0, 0, s.width, s.height * 0.42);
    final ppm = (top.width - 260) / rmax, x1 = 130.0, y = top.center.dy + 10;
    final x2 = x1 + r * ppm;
    if (lead) {
      Draw.ball(c, Offset(x1, y), 30 + v['b1']! / 40, PX.iron);
      Draw.ball(c, Offset(x2, y), 30 + v['b2']! / 40, PX.iron);
    } else {
      _planetDisc(c, Offset(x1, y), 60, 0);
      _planetDisc(c, Offset(x2, y), 22, 1);
    }
    final len = (30 + 40 * math.log(1 + f / (k / 25))).clamp(30.0, 160.0);
    Draw.force(c, Offset(x1 + 70, y), Offset(x1 + 70 + len, y), IX.accent, 'F', w: 5);
    Draw.force(c, Offset(x2 - 36, y), Offset(x2 - 36 - len, y), IX.accent, 'F', w: 5);
    Draw.dim(c, Offset(x1, y + 90), Offset(x2, y + 90), lead ? 'r = ${fx(r, 2)} m' : 'r = ${fx(r, 2)} × 10⁸ m', off: 24);
    Draw.caption(c, 'Equal and opposite: each body pulls the other with the same F.');
    final p = Plot(Rect.fromLTRB(26, top.bottom, s.width - 26, s.height - 22), 0, rmax, 0, lead ? 4 * k : k, xl: lead ? 'r (m)' : 'r (× 10⁸ m)', yl: lead ? 'F (µN)' : 'F (× 10²⁰ N)', title: 'Inverse square: double r, quarter F');
    p.frame(c);
    p.fn(c, (x) => k / (x * x), IX.accent, w: 4, a: rmax * 0.02);
    p.dot(c, r, f, IX.accent, label: lead ? '${fx(f, 3)} µN' : '${fx(f, 2)} × 10²⁰ N');
    if (2 * r <= rmax) p.dot(c, 2 * r, f / 4, IX.muted, label: '2r: F/4');
  },
);

// ── g with height and depth ──

final _gvar = ModeSpec(
  title: 'How g changes above and below the surface',
  formula: 'g = g₀R²/r² outside,  g₀ r/R inside',
  values: {'p': 0, 'rr': 1.5, 'approx': 0},
  controls: (v) => const [Seg('p', 'Planet', _planets), Sl('rr', 'Distance from centre r/R', 0, 4, div: 80), Seg('approx', 'Small-height line 1 − 2h/R', ['Hidden', 'Shown'])],
  presets: {'At the surface': {'rr': 1}, 'Half way down': {'rr': 0.5}, 'h = 320 km (5 % of R)': {'rr': 1.05, 'approx': 1}, 'Two radii out': {'rr': 2}},
  readouts: (v) {
    final p = v['p']!.round(), rr = v['rr']!;
    final g = _g0[p] * (rr <= 1 ? rr : 1 / (rr * rr));
    return [
      Readout('g here', fx(g), 'm/s²', IX.accent),
      Readout(rr >= 1 ? 'Height above surface' : 'Depth below surface', fx((rr - 1).abs() * _rKm[p], 0), 'km'),
      Readout('Weight of a 60 kg person', fx(60 * g, 0), 'N', IX.positive),
      if (rr > 1 && v['approx'] == 1) Readout('1 − 2h/R estimate', fx(_g0[p] * (1 - 2 * (rr - 1))), 'm/s²'),
    ];
  },
  paint: (c, s, v, t) {
    final p = v['p']!.round(), rr = v['rr']!;
    final left = Rect.fromLTWH(0, 0, s.width * 0.42, s.height);
    final o = Offset(left.left + 70, left.center.dy), rpx = (left.width - 110) / 4;
    for (var k = 2; k <= 4; k++) {
      c.drawArc(Rect.fromCircle(center: o, radius: k * rpx), -math.pi / 2, math.pi, false, Draw.stroke(IX.grid, 1.5));
    }
    c.save();
    c.clipRect(Rect.fromLTRB(o.dx, 0, s.width, s.height));
    _planetDisc(c, o, rpx, p);
    c.restore();
    c.drawLine(Offset(o.dx, 30), Offset(o.dx, s.height - 30), Draw.stroke(IX.rule, 2));
    final probe = o + Offset(rr * rpx, 0);
    c.drawLine(o, probe, Draw.stroke(IX.ink, 2));
    final g = _g0[p] * (rr <= 1 ? rr : 1 / (rr * rr));
    Draw.force(c, probe, probe - Offset(g / _g0[p] * 120, 0), IX.accent, 'g', w: 5, off: const Offset(0, -26));
    IxPaint.handle(c, probe, IX.positive, r: 12);
    for (var k = 1; k <= 4; k++) {
      Draw.text(c, '${k}R', o + Offset(k * rpx, 30), size: 16, color: IX.inkSoft);
    }
    final pl = Plot(Rect.fromLTRB(left.right, 26, s.width - 26, s.height - 26), 0, 4, 0, _g0[p] * 1.15, xl: 'r / R', yl: 'g (m/s²)', title: 'g against distance from the centre (${_planets[p]})');
    pl.frame(c);
    pl.fn(c, (x) => _g0[p] * (x <= 1 ? x : 1 / (x * x)), IX.accent, w: 4);
    if (v['approx'] == 1) pl.fn(c, (x) => _g0[p] * (1 - 2 * (x - 1)), IX.amber, w: 3, a: 1, b: 1.5, dash: true, label: '1 − 2h/R', labelAt: 1.3);
    pl.vline(c, 1, IX.muted, label: 'surface');
    pl.dot(c, rr, g, IX.accent, label: '${fx(g)} m/s²');
  },
);

// ── escape ──

final _escape = ModeSpec(
  title: 'Launch fast enough to escape',
  formula: 'vₑ = √(2gR) = √(2GM/R)',
  values: {'p': 0, 'v': 8, 'Mp': 1, 'Rp': 1},
  controls: (v) => [
    const Seg('p', 'Planet', [..._planets, 'Custom']),
    if (v['p'] == 3) ...const [Sl('Mp', 'Planet mass M (× Earth)', 0.01, 400), Sl('Rp', 'Planet radius R (× Earth)', 0.1, 15)],
    const Sl('v', 'Launch speed', 1, 70, unit: 'km/s', div: 138),
  ],
  presets: {'Earth, 8 km/s': {'p': 0, 'v': 8}, 'Earth, 11.2 km/s': {'p': 0, 'v': 11.2}, 'Moon, 2 km/s': {'p': 1, 'v': 2}, 'Jupiter-like': {'p': 3, 'Mp': 318, 'Rp': 11.2, 'v': 40}},
  readouts: (v) {
    final (ve, rkm) = _ve(v);
    final u = v['v']!;
    final h = u >= ve ? double.infinity : rkm * u * u / (ve * ve - u * u);
    return [
      Readout('Escape speed', fx(ve, 1), 'km/s', IX.positive),
      Readout('Greatest height', h.isInfinite ? 'never returns' : sc(h), h.isInfinite ? '' : 'km', IX.accent),
      Readout('Surface gravity', fx(v['p'] == 3 ? 9.8 * v['Mp']! / (v['Rp']! * v['Rp']!) : _g0[v['p']!.round()]), 'm/s²'),
      Readout('Low-orbit speed vₑ/√2', fx(ve / math.sqrt2, 1), 'km/s'),
    ];
  },
  paint: (c, s, v, t) {
    final (ve, rkm) = _ve(v);
    final u = v['v']!;
    final hr = u >= ve ? double.infinity : u * u / (ve * ve - u * u); // in planet radii
    final left = Rect.fromLTWH(0, 0, s.width * 0.42, s.height);
    final rpx = 110.0, o = Offset(left.center.dx, s.height + rpx * 0.25);
    _planetDisc(c, o, rpx * 1.25, v['p']!.round().clamp(0, 2));
    // Height scale: r/R from 1 to 8 on a square-root ruler so low and high fit.
    final top = 60.0, base = o.dy - rpx * 1.25;
    double yAt(double rR) => base - (base - top) * math.sqrt((rR - 1) / 7).clamp(0.0, 1.0);
    for (final k in [1.5, 2, 3, 5, 8]) {
      c.drawLine(Offset(left.center.dx - 140, yAt(k.toDouble())), Offset(left.center.dx - 120, yAt(k.toDouble())), Draw.stroke(IX.inkSoft, 2));
      Draw.text(c, 'r = ${fx(k.toDouble(), k == 1.5 ? 1 : 0)}R', Offset(left.center.dx - 150, yAt(k.toDouble())), size: 15, color: IX.inkSoft, align: Alignment.centerRight);
    }
    final reach = hr.isInfinite ? top - 20 : yAt(1 + hr);
    c.drawLine(Offset(left.center.dx, base), Offset(left.center.dx, reach), Draw.stroke(IX.accent.withValues(alpha: 0.5), 3));
    final rocket = Path()..moveTo(left.center.dx, reach - 26)..lineTo(left.center.dx + 11, reach + 4)..lineTo(left.center.dx - 11, reach + 4)..close();
    c.drawPath(rocket, Draw.fill(IX.ink));
    Draw.text(c, hr.isInfinite ? 'escapes: never returns' : 'rises to ${fx(1 + hr, 2)} R, then falls back', Offset(left.center.dx + 24, math.max(reach, 90)), size: 18, color: IX.accent, align: Alignment.centerLeft, halo: true);
    final pl = Plot(Rect.fromLTRB(left.right, 26, s.width - 26, s.height - 26), 0, ve * 1.3, 0, 6, xl: 'launch speed (km/s)', yl: 'height reached (× R)', title: 'h = R v² / (vₑ² − v²)');
    pl.frame(c);
    pl.fn(c, (x) => x * x / (ve * ve - x * x), IX.accent, w: 4, b: ve * 0.999);
    pl.vline(c, ve, IX.positive, label: 'vₑ = ${fx(ve, 1)} km/s');
    if (!hr.isInfinite) pl.dot(c, u, hr, IX.accent);
    Draw.text(c, 'R = ${fx(rkm, 0)} km', Offset(left.center.dx, s.height - 24), size: 16, color: Colors.white);
  },
);

(double, double) _ve(V v) {
  final p = v['p']!.round();
  if (p == 3) return (11.2 * math.sqrt(v['Mp']! / v['Rp']!), 6400 * v['Rp']!);
  final r = _rKm[p];
  return (math.sqrt(2 * _g0[p] * r * 1000) / 1000, r);
}

// ── satellite ──

const _heights = [400.0, 20200.0, 35800.0];
const _gm = 3.98e14; // m³/s² (gR² with R = 6400 km gives 4.01 × 10¹⁴)

final _satellite = ModeSpec(
  title: 'Put a satellite in orbit',
  formula: 'v₀ = √(GM/r),  E = −GMm/2r',
  values: {'h': 0, 'k': 1, 'm': 1000},
  controls: (v) => const [Seg('h', 'Height', ['400 km\n(ISS)', '20200 km\n(GPS)', '35800 km\n(geostationary)']), Sl('k', 'Launch speed ÷ orbital speed', 0.8, 1.5, div: 70), Sl('m', 'Satellite mass', 100, 5000, unit: 'kg', div: 49)],
  presets: {'Circular': {'k': 1}, 'A little fast': {'k': 1.15}, 'Too slow': {'k': 0.9}, 'Escape (√2)': {'k': 1.42}},
  readouts: (v) {
    final r0 = (6400 + _heights[v['h']!.round()]) * 1000;
    final vc = math.sqrt(_gm / r0);
    final u = v['k']! * vc;
    final e = 0.5 * u * u - _gm / r0;
    return [
      Readout('Orbital speed v₀', fx(vc / 1000, 2), 'km/s', IX.accent),
      Readout('Period (circular)', fx(2 * math.pi * r0 / vc / 3600, 2), 'h'),
      Readout('Energy per kg', fx(e / 1e6, 1), 'MJ/kg', e < 0 ? IX.green : IX.positive),
      Readout('Orbit', v['k']! >= math.sqrt2 - 1e-3 ? 'Escapes' : (e < 0 ? 'Bound (E < 0)' : 'Escapes'), ''),
    ];
  },
  paint: (c, s, v, t) {
    final r0 = 6400 + _heights[v['h']!.round()];
    final k = v['k']!;
    final left = Rect.fromLTWH(0, 0, s.width * 0.58, s.height);
    final o = Offset(left.center.dx + 60, left.center.dy);
    final e0 = (k * k - 1).abs();
    final far = k >= 1 && e0 < 0.99 ? r0 * k * k / (1 - e0) : r0;
    final rmaxShown = (far * 1.08).clamp(r0 * 1.35, r0 * 3.0);
    final sc = (left.height / 2 - 40) / rmaxShown;
    _planetDisc(c, o, 6400 * sc, 0);
    c.drawCircle(o, r0 * sc, Draw.stroke(IX.accent.withValues(alpha: 0.35), 2));
    // Tangential launch at (−r0, 0) heading up: conic with e = |k² − 1|, p = r0 k².
    final e = (k * k - 1).abs(), p = r0 * k * k;
    final startPhi = k >= 1 ? 0.0 : math.pi; // launch point is perigee if fast, apogee if slow
    final path = Path();
    var crashed = false;
    for (var i = 0; i <= 720; i++) {
      final phi = startPhi + i * math.pi / 360;
      final den = 1 + e * math.cos(phi);
      if (den <= 0.02) break;
      final r = p / den;
      if (r < 6400) {
        crashed = true;
        break;
      }
      if (r > rmaxShown * 1.6) break;
      // Launch point at angle π (left of the Earth), motion anticlockwise on screen → upward.
      final ang = math.pi + (phi - startPhi);
      final q = o + Offset(math.cos(ang), -math.sin(ang)) * r * sc;
      i == 0 ? path.moveTo(q.dx, q.dy) : path.lineTo(q.dx, q.dy);
      if (i > 0 && (phi - startPhi) >= 2 * math.pi - 1e-6) break;
    }
    c.drawPath(path, Draw.stroke(IX.positive, 3.5));
    final launch = o + Offset(-r0 * sc, 0);
    c.drawCircle(launch, 9, Draw.fill(IX.ink));
    Draw.force(c, launch, launch + Offset(0, -60 * k), IX.accent, 'v = ${fx(k, 2)} v₀', w: 4);
    Draw.tag(c, crashed ? 'Falls back to Earth' : (k >= math.sqrt2 - 1e-3 ? 'Escapes: open orbit' : (e < 0.01 ? 'Circular orbit' : 'Elliptical orbit')), Offset(left.center.dx, 40), color: crashed ? IX.positive : IX.ink);
    final pl = Plot(Rect.fromLTRB(left.right, 26, s.width - 26, s.height - 26), 0, 40000, 0, 8, xl: 'height h (km)', yl: 'v (km/s)', title: 'Orbital speed against height');
    pl.frame(c);
    pl.fn(c, (h) => math.sqrt(401408 / (6400 + h)), IX.accent, w: 4);
    pl.fn(c, (h) => math.sqrt(2 * 401408 / (6400 + h)), IX.positive, w: 3, dash: true, label: 'escape √2 v₀', labelAt: 25000);
    pl.dot(c, _heights[v['h']!.round()], math.sqrt(401408 / r0), IX.accent);
  },
);
