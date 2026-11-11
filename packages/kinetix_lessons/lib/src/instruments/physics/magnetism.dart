import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'em_kit.dart';
import 'kit.dart';

/// Moving charges and magnetism (2nd PUC ch. 4): the Lorentz force, circular orbits, the
/// Biot–Savart field of a loop and a solenoid, Ampère's law, parallel currents and the
/// moving-coil galvanometer. Fields are computed, never sketched: loop and solenoid lines are
/// traced through a numerical Biot–Savart sum.
final magneticSpec = InstrumentSpec(
  id: 'magnetic',
  chapter: '2nd PUC Physics · Moving charges and magnetism',
  modes: {'selector': _selector, 'lorentz': _lorentz, 'orbit': _orbit, 'loop': _loop, 'solenoid': _solenoid, 'wire': _wire, 'parallel': _parallel, 'galvo': _galvo, 'torque': _torque},
);

const _e = 1.602e-19, _mp = 1.673e-27, _me = 9.109e-31, _mu0 = 4e-7 * math.pi;

// ── velocity selector ──

const _selParticles = ['Proton', 'Alpha particle'];

List<Offset> _selPath(V v) {
  final z = v['pt'] == 1 ? 2.0 : 1.0, a = v['pt'] == 1 ? 4.0 : 1.0;
  final qm = z * _e / (a * _mp);
  final fl = v['fl']!.round();
  final ef = fl == 1 ? 0.0 : v['E']! * 1e3, bf = fl == 0 ? 0.0 : v['B']! * 1e-3;
  var x = -0.02, y = 0.0, vx = v['v']! * 1e5, vy = 0.0;
  final pts = <Offset>[Offset(x, y)];
  final dt = 0.17 / vx / 900;
  for (var i = 0; i < 1400 && x < 0.15; i++) {
    final inside = x >= 0 && x <= 0.10;
    final ax = inside ? qm * (-bf * vy) : 0.0, ay = inside ? qm * (-ef + bf * vx) : 0.0;
    vx += ax * dt;
    vy += ay * dt;
    x += vx * dt;
    y += vy * dt;
    if (i % 3 == 0) pts.add(Offset(x, y));
    if (inside && y.abs() >= 0.025) break;
    if (y.abs() > 0.06) break;
  }
  pts.add(Offset(x, y));
  return pts;
}

final _selector = ModeSpec(
  title: 'A velocity selector: E and B together',
  formula: 'F = q(E + v × B),  straight through when v = E/B',
  values: {'v': 10, 'E': 50, 'B': 50, 'pt': 0, 'fl': 2},
  animate: true,
  controls: (v) => const [
    Sl('v', 'Speed v', 2, 20, unit: '× 10⁵ m/s', div: 18),
    Sl('E', 'Electric field E', 10, 100, unit: 'kV/m', div: 18),
    Sl('B', 'Magnetic field B', 10, 100, unit: 'mT', div: 18),
    Seg('pt', 'Particle', _selParticles),
    Seg('fl', 'Fields on', ['E only', 'B only', 'E and B']),
  ],
  presets: {'Balanced (v = E/B)': {'v': 10, 'E': 50, 'B': 50}, 'Too fast': {'v': 16}, 'Too slow': {'v': 5}, 'Alpha, balanced': {'pt': 1, 'v': 10}},
  readouts: (v) {
    final z = v['pt'] == 1 ? 2.0 : 1.0;
    final fl = v['fl']!.round();
    final fe = fl == 1 ? 0.0 : 0.1602 * z * v['E']!, fb = fl == 0 ? 0.0 : 0.01602 * z * v['v']! * v['B']!;
    return [
      Readout('Speed that goes straight E/B', fx(10 * v['E']! / v['B']!, 1), '× 10⁵ m/s', IX.accent),
      Readout('Electric force qE (down)', fx(fe, 2), 'fN', IX.positive),
      Readout('Magnetic force qvB (up)', fx(fb, 2), 'fN', EM.field),
      Readout('Net force (up +)', sg(fb - fe, 2), 'fN'),
    ];
  },
  paint: (c, s, v, t) {
    final fl = v['fl']!.round();
    final z = v['pt'] == 1 ? 2.0 : 1.0;
    final fe = fl == 1 ? 0.0 : 0.1602 * z * v['E']!, fb = fl == 0 ? 0.0 : 0.01602 * z * v['v']! * v['B']!;
    final app = Rect.fromLTWH(0, 0, s.width * 0.68, s.height);
    final ppm = (app.width - 100) / 0.17;
    final ox = app.left + 50 + 0.02 * ppm, oy = app.center.dy + 20;
    Offset P(Offset m) => Offset(ox + m.dx * ppm, oy - m.dy * ppm);
    final gap = 0.025 * ppm;
    final field = Rect.fromLTRB(P(Offset.zero).dx, oy - gap, P(const Offset(0.10, 0)).dx, oy + gap);
    if (fl != 0) EM.sheet(c, field.deflate(4), gap: 46, rad: 8);
    if (fl != 1) {
      for (var x = field.left + 70; x < field.right - 20; x += 140) {
        IxPaint.arrow(c, Offset(x, field.top + 18), Offset(x, field.bottom - 18), IX.positive.withValues(alpha: 0.55), width: 2.5, head: 12);
      }
      Draw.text(c, 'E', Offset(field.right - 34, field.top + 40), size: 20, color: IX.positive, halo: true);
    }
    Draw.block(c, Rect.fromLTRB(field.left, field.top - 22, field.right, field.top), fl == 1 ? IX.steel : IX.positive, label: fl == 1 ? '' : '+ + + + + + + + + +', radius: 4);
    Draw.block(c, Rect.fromLTRB(field.left, field.bottom, field.right, field.bottom + 22), fl == 1 ? IX.steel : IX.negative, label: fl == 1 ? '' : '−  −  −  −  −  −  −  −  −  −', radius: 4);
    if (fl != 0) Draw.text(c, 'B into the screen', Offset(field.center.dx, field.bottom + 52), size: 18, color: EM.field);
    // Exit screen with a slit on the axis.
    final sx = P(const Offset(0.135, 0)).dx;
    c.drawRect(Rect.fromLTRB(sx - 6, oy - 0.055 * ppm, sx + 6, oy - 0.004 * ppm), Draw.fill(IX.inkSoft));
    c.drawRect(Rect.fromLTRB(sx - 6, oy + 0.004 * ppm, sx + 6, oy + 0.055 * ppm), Draw.fill(IX.inkSoft));
    Draw.text(c, 'slit', Offset(sx, oy + 0.055 * ppm + 22), size: 17, color: IX.inkSoft);
    // Source.
    Draw.block(c, Rect.fromCenter(center: Offset(app.left + 40, oy), width: 46, height: 60), IX.steel, radius: 6);
    final vs = 10 * v['E']! / v['B']!;
    final path = _selPath(v);
    final pp = [for (final q in path) P(q)];
    final trail = Path()..moveTo(pp[0].dx, pp[0].dy);
    for (final q in pp.skip(1)) {
      trail.lineTo(q.dx, q.dy);
    }
    c.drawPath(trail, Draw.stroke(IX.accent.withValues(alpha: 0.75), 3));
    final last = path.last;
    final through = last.dx >= 0.134 && last.dy.abs() < 0.004;
    final f = ((t % 2.6) / 2.2).clamp(0.0, 1.0);
    final at = pp[(f * (pp.length - 1)).round()];
    Draw.ball(c, at, v['pt'] == 1 ? 13 : 10, IX.positive);
    Draw.text(c, '+', at, size: 15, color: Colors.white);
    // Force arrows on the particle as it enters the plates.
    final ent = pp[path.indexWhere((q) => q.dx >= 0.012).clamp(0, pp.length - 1)];
    final fmax = math.max(fe, fb).clamp(1e-9, double.infinity);
    if (fe > 0) Draw.force(c, ent + const Offset(-16, 12), ent + Offset(-16, 12 + 80 * fe / fmax), IX.positive, 'qE');
    if (fb > 0) Draw.force(c, ent + const Offset(16, -12), ent + Offset(16, -12 - 80 * fb / fmax), EM.field, 'qvB');
    c.drawCircle(ent, 9, Draw.stroke(IX.positive.withValues(alpha: 0.6), 2));
    final msg = fl != 2
        ? (fl == 0 ? 'Electric field alone: every particle bends down.' : 'Magnetic field alone: the path curves up.')
        : (through ? 'v = E/B: the forces cancel and the particle goes straight through the slit.' : (v['v']! > vs ? 'v > E/B: qvB wins, so the particle bends up and misses the slit.' : 'v < E/B: qE wins, so the particle bends down and misses the slit.'));
    Draw.caption(c, msg);
    Draw.bars(c, Rect.fromLTRB(app.right + 10, 70, s.width - 26, s.height * 0.62), [('qE down', fe, IX.positive), ('qvB up', fb, EM.field)], unit: 'fN', title: 'Forces at entry', dp: 2);
    // Speed gauge: where v sits against E/B.
    final g = Rect.fromLTRB(app.right + 10, s.height * 0.62 + 20, s.width - 26, s.height - 30);
    c.drawRRect(RRect.fromRectAndRadius(g, const Radius.circular(16)), Draw.fill(const Color(0xFFFAFBFE)));
    c.drawRRect(RRect.fromRectAndRadius(g, const Radius.circular(16)), Draw.stroke(IX.rule, 1.5));
    Draw.text(c, 'Speed against E/B', Offset(g.left + 20, g.top + 16), size: 18, align: Alignment.topLeft);
    final gx0 = g.left + 40, gx1 = g.right - 40, gy = g.center.dy + 24;
    double gx(double sp) => gx0 + (sp.clamp(0, 40) / 40) * (gx1 - gx0);
    c.drawLine(Offset(gx0, gy), Offset(gx1, gy), Draw.stroke(IX.inkSoft, 2.5));
    for (var k = 0; k <= 40; k += 10) {
      c.drawLine(Offset(gx(k.toDouble()), gy - 6), Offset(gx(k.toDouble()), gy + 6), Draw.stroke(IX.inkSoft, 2));
      Draw.text(c, '$k', Offset(gx(k.toDouble()), gy + 24), size: 15, color: IX.inkSoft, w: FontWeight.w500);
    }
    Draw.text(c, '× 10⁵ m/s', Offset(gx1, gy + 50), size: 15, color: IX.muted, w: FontWeight.w500, align: Alignment.centerRight);
    c.drawLine(Offset(gx(vs), gy - 30), Offset(gx(vs), gy + 8), Draw.stroke(IX.green, 4));
    Draw.text(c, 'E/B', Offset(gx(vs), gy - 44), size: 17, color: IX.green);
    c.drawCircle(Offset(gx(v['v']!), gy), 10, Draw.fill(IX.accent));
  },
);

// ── force on a moving charge ──

final _lorentz = ModeSpec(
  title: 'Force on a moving proton',
  formula: 'F = qvB sin θ',
  values: {'v': 2, 'B': 0.5, 'th': 90},
  controls: (v) => const [Sl('v', 'Speed v', 1, 10, unit: '× 10⁶ m/s', div: 18), Sl('B', 'Field B', 0.1, 2, unit: 'T', div: 19), Sl('th', 'Angle θ between v and B', 0, 180, unit: '°', div: 36)],
  presets: {'Across the field (90°)': {'th': 90}, 'Along the field (0°)': {'th': 0}, 'At 30°': {'th': 30}},
  readouts: (v) {
    final f = 1.602 * v['v']! * v['B']! * math.sin(rad(v['th']!));
    return [Readout('Force F', fx(f, 2), '× 10⁻¹³ N', IX.accent), Readout('Largest force (90°)', fx(1.602 * v['v']! * v['B']!, 2), '× 10⁻¹³ N'), Readout('Work done by F', '0', 'J', IX.green)];
  },
  paint: (c, s, v, t) {
    final (left, right) = Lay.split(s, 0.5);
    final th = rad(v['th']!);
    final o = Offset(left.center.dx, left.center.dy + 30);
    for (var y = 120.0; y < left.bottom - 40; y += 90) {
      EM.flowLine(c, [Offset(left.left + 40, y), Offset(left.right - 20, y)], EM.field.withValues(alpha: 0.45), every: 260);
    }
    Draw.text(c, 'B', Offset(left.right - 40, 90), size: 24, color: EM.field);
    final vlen = 70 + v['v']! * 16;
    final tip = o + Offset(math.cos(th), -math.sin(th)) * vlen;
    IxPaint.dashed(c, o, Offset(o.dx + vlen * math.cos(th), o.dy), Draw.stroke(IX.muted, 2));
    IxPaint.dashed(c, tip, Offset(o.dx + vlen * math.cos(th), o.dy), Draw.stroke(IX.muted, 2));
    Draw.force(c, o, tip, IX.accent, 'v');
    if (v['th']! > 4 && v['th']! < 176) Draw.angle(c, o, -th, 0, 54, 'θ');
    Draw.ball(c, o, 16, IX.positive);
    Draw.text(c, '+', o, size: 18, color: Colors.white);
    final f = math.sin(th);
    if (f > 0.03) {
      final fo = o + const Offset(-170, -150);
      EM.outOf(c, fo, 16 + 26 * f, IX.green);
      Draw.text(c, 'F out of the screen', fo + Offset(0, 50 + 26 * f), size: 18, color: IX.green, halo: true);
    } else {
      Draw.text(c, 'v along B: no force', o + const Offset(0, 70), size: 19, color: IX.green, halo: true);
    }
    Draw.caption(c, 'Only v sin θ, the part of v across B, feels a force. F is at right angles to v, so it does no work.');
    final fm = 1.602 * v['v']! * v['B']!;
    final p = Plot(right, 0, 180, 0, math.max(1.0, fm) * 1.2, xl: 'θ (°)', yl: 'F (× 10⁻¹³ N)', title: 'F = qvB sin θ, largest at 90°');
    p.frame(c);
    p.fn(c, (x) => fm * math.sin(rad(x)), IX.accent, w: 4);
    p.dot(c, v['th']!, fm * f, IX.accent, label: fx(fm * f, 2));
  },
);

// ── circular orbit ──

const _orbParticles = ['Proton', 'Deuteron', 'Alpha', 'Electron'];

(double q, double m) _qm(V v) => switch (v['pt']!.round()) {
  1 => (_e, 2.014 * 1.6605e-27),
  2 => (2 * _e, 6.645e-27),
  3 => (-_e, _me),
  _ => (_e, _mp),
};

(double, String) _lenUnit(double m) => m < 0.02 ? (1e3, 'mm') : (m < 3 ? (100, 'cm') : (1, 'm'));

String _len(double m) {
  final (k, u) = _lenUnit(m);
  return '${fx(m * k, m * k < 10 ? 2 : 1)} $u';
}

final _orbit = ModeSpec(
  title: 'A charge circling in a magnetic field',
  formula: 'r = mv / qB,  T = 2πm / qB',
  values: {'pt': 0, 'v': 5, 'B': 500},
  animate: true,
  controls: (v) => const [Seg('pt', 'Particle', _orbParticles), Sl('v', 'Speed v', 1, 100, unit: '× 10⁵ m/s', div: 99), Sl('B', 'Field B', 1, 1000, unit: 'mT', div: 999, dp: 0)],
  presets: {'Proton, 0.5 T': {'pt': 0, 'v': 5, 'B': 500}, 'Alpha, 0.5 T': {'pt': 2, 'v': 5, 'B': 500}, 'Electron, 2 mT': {'pt': 3, 'v': 100, 'B': 2}},
  readouts: (v) {
    final (q, m) = _qm(v);
    final b = v['B']! * 1e-3, sp = v['v']! * 1e5;
    final r = m * sp / (q.abs() * b), tp = 2 * math.pi * m / (q.abs() * b);
    return [
      Readout('Radius r', _len(r), '', IX.accent),
      Readout('Period T', tp < 1e-6 ? fx(tp * 1e9, 1) : fx(tp * 1e6, 3), tp < 1e-6 ? 'ns' : 'µs'),
      Readout('Frequency', fx(1 / tp / 1e6, 2), 'MHz'),
      Readout('Kinetic energy', fx(0.5 * m * sp * sp / _e / 1000, 3), 'keV', IX.green),
    ];
  },
  paint: (c, s, v, t) {
    final (q, m) = _qm(v);
    final b = v['B']! * 1e-3, sp = v['v']! * 1e5;
    final r = m * sp / (q.abs() * b);
    final (left, right) = Lay.split(s, 0.52);
    EM.sheet(c, Rect.fromLTRB(left.left + 20, 64, left.right - 20, left.bottom - 70), gap: 72, rad: 7, alpha: 0.22);
    Draw.text(c, 'B into the screen', Offset(left.center.dx, left.bottom - 34), size: 18, color: EM.field, halo: true);
    // Scale: a nice bar about the size of r, so the circle changes size in steps you can read.
    final side = math.min(left.width, left.height) - 140;
    final bar = niceStep(2 * r, 2);
    final ppm = side * 0.36 / bar;
    final o = Offset(left.center.dx, left.center.dy - 10);
    final rp = r * ppm;
    c.drawCircle(o, rp, Draw.stroke(IX.accent.withValues(alpha: 0.5), 2.5));
    c.drawCircle(o, 4, Draw.fill(IX.inkSoft));
    final dir = q > 0 ? 1.0 : -1.0; // + anticlockwise on screen
    final a = -math.pi / 2 + dir * t * 2 * math.pi / 3;
    final pos = o + Offset(math.cos(a), -math.sin(a)) * rp;
    final tan = Offset(-math.sin(a), -math.cos(a)) * dir;
    Draw.force(c, pos, pos + tan * 80, IX.accent, 'v');
    Draw.force(c, pos, pos + (o - pos) / rp * 60, IX.green, 'F', off: const Offset(0, 0));
    Draw.ball(c, pos, q > 0 ? 13 : 9, q > 0 ? IX.positive : IX.negative);
    Draw.text(c, q > 0 ? '+' : '−', pos, size: 15, color: Colors.white);
    Draw.dim(c, o, o + Offset(rp, 0), 'r', color: IX.inkSoft);
    final (k, u) = _lenUnit(bar);
    final y = left.bottom - 80;
    c.drawLine(Offset(left.left + 40, y), Offset(left.left + 40 + bar * ppm, y), Draw.stroke(IX.ink, 4));
    for (final x in [left.left + 40, left.left + 40 + bar * ppm]) {
      c.drawLine(Offset(x, y - 8), Offset(x, y + 8), Draw.stroke(IX.ink, 3));
    }
    Draw.text(c, '${fx(bar * k, bar * k < 1 ? 1 : 0)} $u', Offset(left.left + 40 + bar * ppm / 2, y - 24), size: 17, halo: true);
    Draw.caption(c, q > 0 ? 'A positive charge goes round anticlockwise; the speed never changes.' : 'An electron goes round clockwise; the speed never changes.');
    final (ku, uu) = _lenUnit(m * 100e5 / (q.abs() * b));
    final rmax = m * 100e5 / (q.abs() * b) * ku;
    final p = Plot(right, 0, 100, 0, rmax * 1.08, xl: 'v (× 10⁵ m/s)', yl: 'r ($uu)', title: 'r grows with v; T = 2πm/qB does not');
    p.frame(c);
    p.fn(c, (x) => m * x * 1e5 / (q.abs() * b) * ku, IX.accent, w: 4);
    p.dot(c, v['v']!, r * ku, IX.accent, label: _len(r));
  },
);

// ── Biot–Savart: field of a circular loop ──

/// Field of a unit loop (μ0 I / 4π = 1) of radius R in the plane x = 0 at (x, y) in its
/// meridian plane. Returns (Bx, By). Current at the top of the loop (0, R) points out of the
/// screen, so the field on the axis points along +x.
Offset _loopB(double x, double y, double rr, {int n = 48}) {
  var bx = 0.0, by = 0.0;
  for (var i = 0; i < n; i++) {
    final ph = (i + 0.5) / n * 2 * math.pi;
    final cp = math.cos(ph), sp = math.sin(ph);
    final py = rr * cp, pz = rr * sp;
    final dly = -rr * sp * 2 * math.pi / n, dlz = rr * cp * 2 * math.pi / n;
    final rx = x, ry = y - py, rz = -pz;
    final d3 = math.pow(rx * rx + ry * ry + rz * rz, 1.5).toDouble();
    if (d3 < 1e-18) continue;
    // dl × r with dl = (0, dly, dlz)
    bx += (dly * rz - dlz * ry) / d3;
    by += (dlz * rx) / d3;
  }
  return Offset(bx, by);
}

/// Traces a field line (in metres) from [start] through [f], both ways until it leaves [box],
/// closes on itself, or hits a wire within [stop] of one of [sinks].
List<Offset> _trace(Offset Function(Offset) f, Offset start, Rect box, double h, {List<Offset> sinks = const [], double stop = 0, int maxSteps = 1600}) {
  final out = <Offset>[];
  for (final sgn in [1.0, -1.0]) {
    final pts = <Offset>[];
    var p = start;
    for (var i = 0; i < maxSteps; i++) {
      Offset dir(Offset q) {
        final b = f(q);
        final l = b.distance;
        return l < 1e-30 ? Offset.zero : b / l * sgn;
      }

      final k1 = dir(p), k2 = dir(p + k1 * h / 2), k3 = dir(p + k2 * h / 2), k4 = dir(p + k3 * h);
      final step = (k1 + k2 * 2 + k3 * 2 + k4) / 6;
      if (step.distance < 1e-9) break;
      p += step * h;
      pts.add(p);
      if (!box.contains(p)) break;
      if (sinks.any((w) => (w - p).distance < stop)) break;
      if (i > 20 && (p - start).distance < h * 0.8) {
        pts.add(start);
        break;
      }
    }
    if (sgn > 0) {
      out.addAll(pts);
      if (pts.isNotEmpty && pts.last == start) return out;
    } else {
      out.insertAll(0, pts.reversed);
    }
  }
  return out;
}

final _loop = ModeSpec(
  title: 'Magnetic field of a current loop',
  formula: 'B(x) = μ₀NIR² / 2(R² + x²)^3/2',
  values: {'I': 5, 'R': 10, 'N': 10, 'rev': 0, 'x': 0},
  controls: (v) => const [Sl('I', 'Current I', 0.5, 10, unit: 'A', div: 19), Sl('R', 'Loop radius R', 2, 20, unit: 'cm', div: 18), Sl('N', 'Turns N', 1, 100, div: 99, dp: 0), Sl('x', 'Probe on the axis x', -30, 30, unit: 'cm', div: 60), Seg('rev', 'Current', ['Anticlockwise', 'Clockwise'])],
  presets: {'At the centre': {'x': 0}, '10 cm along': {'x': 10}, 'Reverse the current': {'rev': 1}},
  readouts: (v) {
    final r = v['R']! / 100, x = v['x']! / 100;
    final b = _mu0 * v['N']! * v['I']! * r * r / (2 * math.pow(r * r + x * x, 1.5));
    return [
      Readout('B at the probe', fx(b * 1e6, 1), 'µT', IX.accent),
      Readout('B at the centre μ₀NI/2R', fx(_mu0 * v['N']! * v['I']! / (2 * r) * 1e6, 1), 'µT'),
      Readout('Direction on the axis', v['rev'] == 1 ? '← (−x)' : '→ (+x)', ''),
    ];
  },
  drag: (v, p, s, start) {
    final (left, _) = Lay.split(s, 0.5);
    final ppm = (left.width - 60) / 0.66;
    final cx = left.center.dx, cy = left.center.dy + 20;
    final probe = Offset(cx + v['x']! / 100 * ppm, cy);
    if (pick(v, p, start, [probe]) != 0) return false;
    v['x'] = ((p.dx - cx) / ppm * 100).clamp(-30, 30).roundToDouble();
    return true;
  },
  paint: (c, s, v, t) {
    final (left, right) = Lay.split(s, 0.5);
    final rr = v['R']! / 100, sgnI = v['rev'] == 1 ? -1.0 : 1.0;
    final ppm = (left.width - 60) / 0.66;
    final cx = left.center.dx, cy = left.center.dy + 20;
    Offset P(Offset m) => Offset(cx + m.dx * ppm, cy - m.dy * ppm);
    final box = Rect.fromLTRB(-0.33, -(cy - 70) / ppm, 0.33, (left.bottom - cy - 20) / ppm);
    Offset fb(Offset q) => _loopB(q.dx, q.dy, rr, n: 40) * sgnI;
    // Field lines in the plane of the screen (the loop is seen edge-on as two wire ends).
    final wires = [Offset(0, rr), Offset(0, -rr)];
    for (final f in [0.0, 0.25, 0.5, 0.72, 0.9]) {
      for (final sy in f == 0 ? [1.0] : [1.0, -1.0]) {
        final line = _trace(fb, Offset(0, sy * f * rr), box, 0.004, sinks: wires, stop: 0.006);
        EM.flowLine(c, [for (final q in line) P(q)], EM.field.withValues(alpha: 0.7), every: 150);
      }
    }
    for (final f in [1.12, 1.35]) {
      for (final sy in [1.0, -1.0]) {
        final line = _trace(fb, Offset(0, sy * f * rr), box, 0.004, sinks: wires, stop: 0.006);
        EM.flowLine(c, [for (final q in line) P(q)], EM.field.withValues(alpha: 0.4), every: 150);
      }
    }
    // The loop in perspective, behind the field lines' plane.
    final ell = Rect.fromCenter(center: Offset(cx, cy), width: rr * ppm * 0.7, height: 2 * rr * ppm);
    c.drawOval(ell, Draw.stroke(PX.copper, 6));
    c.drawOval(ell.deflate(3), Draw.stroke(const Color(0xFFE2B48A), 1.5));
    final topW = P(Offset(0, rr)), botW = P(Offset(0, -rr));
    c.drawCircle(topW, 14, Draw.fill(Colors.white));
    c.drawCircle(botW, 14, Draw.fill(Colors.white));
    sgnI > 0 ? EM.outOf(c, topW, 13, PX.copper) : EM.into(c, topW, 13, PX.copper);
    sgnI > 0 ? EM.into(c, botW, 13, PX.copper) : EM.outOf(c, botW, 13, PX.copper);
    c.drawLine(Offset(left.left + 30, cy), Offset(left.right - 20, cy), Draw.stroke(IX.muted, 1.5));
    Draw.text(c, 'axis', Offset(left.right - 44, cy + 22), size: 16, color: IX.muted);
    final probe = P(Offset(v['x']! / 100, 0));
    IxPaint.handle(c, probe, IX.accent, r: 16);
    final b0 = _mu0 * v['N']! * v['I']! / (2 * rr);
    final x = v['x']! / 100;
    final b = b0 * math.pow(rr * rr / (rr * rr + x * x), 1.5);
    Draw.tag(c, '${fx(b * 1e6, 1)} µT', probe + const Offset(0, -46), color: IX.accent);
    Draw.caption(c, 'Section through the axis. Drag the blue probe along the axis.');
    final p = Plot(right, -30, 30, 0, b0 * 1e6 * 1.15, xl: 'x (cm)', yl: 'B (µT)', title: 'B on the axis: largest at the centre');
    p.frame(c);
    p.fn(c, (xx) => b0 * 1e6 * math.pow(rr * rr / (rr * rr + xx * xx / 1e4), 1.5), IX.accent, w: 4);
    p.hline(c, b0 * 1e6, IX.muted, label: 'μ₀NI/2R');
    p.dot(c, v['x']!, b * 1e6, IX.accent);
  },
);

// ── solenoid ──

const _solL = 0.30, _solA = 0.04;

double _solAxis(double x, double nI) {
  double g(double u) => u / math.sqrt(u * u + _solA * _solA);
  return _mu0 * nI / 2 * (g(x + _solL / 2) - g(x - _solL / 2));
}

final _solenoid = ModeSpec(
  title: 'Inside a solenoid',
  formula: 'B = μ₀ n I  (long solenoid)',
  values: {'n': 10, 'I': 2, 'amp': 0, 'x': 0},
  controls: (v) => const [Sl('n', 'Turns per cm n', 5, 50, div: 45, dp: 0), Sl('I', 'Current I', 0.5, 5, unit: 'A', div: 18), Sl('x', 'Probe on the axis x', -25, 25, unit: 'cm', div: 50), Seg('amp', 'Ampère loop', ['Hidden', 'Shown'])],
  presets: {'Probe in the middle': {'x': 0}, 'Probe at the end': {'x': 15}, 'Ampère loop': {'amp': 1, 'x': 0}},
  readouts: (v) {
    final nI = v['n']! * 100 * v['I']!;
    return [Readout('B at the probe', fx(_solAxis(v['x']! / 100, nI) * 1e3, 3), 'mT', IX.accent), Readout('μ₀nI (ideal)', fx(_mu0 * nI * 1e3, 3), 'mT'), Readout('n (per metre)', fx(v['n']! * 100, 0), 'turns/m')];
  },
  drag: (v, p, s, start) {
    final (top, _) = Lay.stack(s, 0.56);
    final ppm = (top.width - 120) / 0.56;
    final probe = Offset(top.center.dx + v['x']! / 100 * ppm, top.center.dy + 14);
    if (pick(v, p, start, [probe]) != 0) return false;
    v['x'] = ((p.dx - top.center.dx) / ppm * 100).clamp(-25, 25).roundToDouble();
    return true;
  },
  paint: (c, s, v, t) {
    final (top, bot) = Lay.stack(s, 0.56);
    final ppm = (top.width - 120) / 0.56;
    final cx = top.center.dx, cy = top.center.dy + 14;
    Offset P(Offset m) => Offset(cx + m.dx * ppm, cy - m.dy * ppm);
    final nI = v['n']! * 100 * v['I']!;
    // Field of the finite solenoid as a stack of loops (for the line shapes).
    const nl = 24;
    Offset fb(Offset q) {
      var b = Offset.zero;
      for (var i = 0; i < nl; i++) {
        final x0 = -_solL / 2 + _solL * (i + 0.5) / nl;
        b += _loopB(q.dx - x0, q.dy, _solA, n: 24);
      }
      return b;
    }

    final box = Rect.fromLTRB(-0.29, -(top.bottom - cy - 6) / ppm, 0.29, (cy - top.top - 50) / ppm);
    final wires = <Offset>[for (var i = 0; i < nl; i++) for (final sy in [1.0, -1.0]) Offset(-_solL / 2 + _solL * (i + 0.5) / nl, sy * _solA)];
    for (final f in [0.0, 0.35, -0.35, 0.7, -0.7]) {
      final line = _trace(fb, Offset(0, f * _solA), box, 0.004, sinks: wires, stop: 0.004, maxSteps: 900);
      EM.flowLine(c, [for (final q in line) P(q)], EM.field.withValues(alpha: f == 0 ? 0.8 : 0.6), every: 200);
    }
    // Turns in section: dots on top (out), crosses below (in).
    final turns = (v['n']! * 1.5).round().clamp(8, 30);
    for (var i = 0; i < turns; i++) {
      final x = -_solL / 2 + _solL * (i + 0.5) / turns;
      EM.outOf(c, P(Offset(x, _solA)), 9, PX.copper);
      EM.into(c, P(Offset(x, -_solA)), 9, PX.copper);
    }
    if (v['amp'] == 1) {
      final r = Rect.fromPoints(P(const Offset(-0.08, 0.015)), P(const Offset(0.08, 0.075)));
      final dp = Draw.stroke(IX.green, 2.5);
      for (final (a, b) in [(r.topLeft, r.topRight), (r.topRight, r.bottomRight), (r.bottomRight, r.bottomLeft), (r.bottomLeft, r.topLeft)]) {
        IxPaint.dashed(c, a, b, dp);
      }
      Draw.text(c, 'Ampère loop: B·h inside = μ₀(nh)I, outside ≈ 0', Offset(r.center.dx, r.top - 22), size: 17, color: IX.green, halo: true);
    }
    final probe = P(Offset(v['x']! / 100, 0));
    IxPaint.handle(c, probe, IX.accent, r: 15);
    Draw.tag(c, '${fx(_solAxis(v['x']! / 100, nI) * 1e3, 3)} mT', probe + const Offset(0, 44), color: IX.accent);
    Draw.caption(c, 'A 30 cm solenoid, radius 4 cm, in section. Drag the probe along the axis.');
    final b0 = _mu0 * nI * 1e3;
    final p = Plot(bot, -25, 25, 0, b0 * 1.18, xl: 'x (cm)', yl: 'B (mT)', title: 'Uniform inside, about half at each end, nearly zero outside');
    p.frame(c);
    p.fn(c, (x) => _solAxis(x / 100, nI) * 1e3, IX.accent, w: 4);
    p.hline(c, b0, IX.muted, label: 'μ₀nI');
    p.vline(c, -15, IX.muted, label: 'end');
    p.vline(c, 15, IX.muted, label: 'end');
    p.dot(c, v['x']!, _solAxis(v['x']! / 100, nI) * 1e3, IX.accent);
  },
);

// ── thick wire (Ampère's law) ──

double _wireB(double r, double a, double i) => r < a ? 2e-7 * i * r / (a * a) : 2e-7 * i / r;

final _wire = ModeSpec(
  title: "Field inside and outside a thick wire",
  formula: '∮B·dl = μ₀ I_enclosed',
  values: {'I': 10, 'a': 2, 'r': 4},
  controls: (v) => const [Sl('I', 'Current I', 1, 20, unit: 'A', div: 19), Sl('a', 'Wire radius a', 1, 5, unit: 'mm', div: 8), Sl('r', 'Loop radius r', 0.2, 15, unit: 'mm', div: 74)],
  presets: {'Inside the wire': {'r': 1}, 'At the surface': {'r': 2}, 'Outside': {'r': 8}},
  readouts: (v) {
    final a = v['a']! / 1000, r = v['r']! / 1000, i = v['I']!;
    final enc = r < a ? i * r * r / (a * a) : i;
    return [Readout('B at r', fx(_wireB(r, a, i) * 1e6, 0), 'µT', IX.accent), Readout('Current enclosed', fx(enc, 2), 'A', IX.amber), Readout('B at the surface', fx(_wireB(a, a, i) * 1e6, 0), 'µT')];
  },
  paint: (c, s, v, t) {
    final (left, right) = Lay.split(s, 0.48);
    final o = Offset(left.center.dx, left.center.dy + 10);
    final ppmm = (math.min(left.width, left.height) - 120) / 32;
    final a = v['a']!, r = v['r']!;
    for (final rr in [4.0, 7.0, 10.0, 13.0]) {
      final rad = rr * ppmm;
      c.drawCircle(o, rad, Draw.stroke(EM.field.withValues(alpha: 0.4), 2));
      EM.midArrow(c, o + Offset(rad, 6), o + Offset(rad, -6), EM.field.withValues(alpha: 0.7), size: 14);
    }
    c.drawCircle(o, a * ppmm, Draw.fill(const Color(0xFFF3DCC8)));
    c.drawCircle(o, a * ppmm, Draw.stroke(PX.copper, 3));
    for (var y = -a; y <= a; y += 0.8) {
      for (var x = -a; x <= a; x += 0.8) {
        if (x * x + y * y < a * a * 0.8) EM.outOf(c, o + Offset(x, y) * ppmm, 4, PX.copper.withValues(alpha: 0.8));
      }
    }
    final rp = r * ppmm;
    final dp = Draw.stroke(IX.green, 3);
    for (var k = 0.0; k < 2 * math.pi; k += 0.16) {
      c.drawArc(Rect.fromCircle(center: o, radius: rp), k, 0.09, false, dp);
    }
    if (r < a) c.drawCircle(o, rp, Draw.fill(IX.amber.withValues(alpha: 0.18)));
    Draw.text(c, 'Amperian loop r = ${fx(r, 1)} mm', o + Offset(0, -rp - 24), size: 17, color: IX.green, halo: true);
    Draw.caption(c, 'Current out of the screen, spread evenly over the wire. B circles anticlockwise.');
    final ymax = _wireB(a / 1000, a / 1000, v['I']!) * 1e6 * 1.2;
    final p = Plot(right, 0, 15, 0, ymax, xl: 'r (mm)', yl: 'B (µT)', title: 'B ∝ r inside, B ∝ 1/r outside');
    p.frame(c);
    p.fn(c, (x) => _wireB(math.max(x, 1e-4) / 1000, a / 1000, v['I']!) * 1e6, IX.accent, w: 4);
    p.vline(c, a, PX.copper, label: 'r = a');
    p.dot(c, r, _wireB(r / 1000, a / 1000, v['I']!) * 1e6, IX.accent);
  },
);

// ── parallel currents ──

final _parallel = ModeSpec(
  title: 'Two parallel currents',
  formula: 'f = μ₀ I₁ I₂ / 2πd  (per metre)',
  values: {'I1': 5, 'I2': 5, 'd': 5, 'fld': 1},
  controls: (v) => const [Sl('I1', 'Current I₁ (up +)', -10, 10, unit: 'A', div: 20), Sl('I2', 'Current I₂ (up +)', -10, 10, unit: 'A', div: 20), Sl('d', 'Separation d', 1, 20, unit: 'cm', div: 19), Seg('fld', 'Field of wire 1', ['Hidden', 'Shown'])],
  presets: {'Same way: attract': {'I1': 5, 'I2': 5}, 'Opposite: repel': {'I1': 5, 'I2': -5}, 'Definition of the ampere (1 A, 1 m)': {'I1': 1, 'I2': 1, 'd': 20}},
  readouts: (v) {
    final f = 2e-7 * v['I1']! * v['I2']! / (v['d']! / 100);
    return [Readout('Force per metre', fx(f.abs() * 1e6, 1), 'µN/m', IX.accent), Readout('Field of wire 1 at wire 2', fx(2e-7 * v['I1']!.abs() / (v['d']! / 100) * 1e6, 1), 'µT', EM.field), Readout('Nature', f > 0 ? 'Attract' : (f < 0 ? 'Repel' : 'No force'), '')];
  },
  paint: (c, s, v, t) {
    final (left, right) = Lay.split(s, 0.5);
    final i1 = v['I1']!, i2 = v['I2']!, d = v['d']!;
    final ppcm = (left.width - 140) / 22;
    final x1 = left.center.dx - d * ppcm / 2, x2 = left.center.dx + d * ppcm / 2;
    final y0 = 110.0, y1 = left.bottom - 60;
    if (v['fld'] == 1 && i1 != 0) {
      for (var x = left.left + 30; x < left.right - 10; x += 40) {
        if ((x - x1).abs() < 26) continue;
        final dist = (x - x1).abs() / ppcm;
        final sz = (14 / math.sqrt(dist)).clamp(5.5, 13.0);
        final into = (x > x1) == (i1 > 0);
        for (var y = y0 + 40; y < y1 - 20; y += 90) {
          into ? EM.into(c, Offset(x, y), sz, EM.field.withValues(alpha: 0.6)) : EM.outOf(c, Offset(x, y), sz, EM.field.withValues(alpha: 0.6));
        }
      }
    }
    for (final (x, i, lab) in [(x1, i1, 'I₁'), (x2, i2, 'I₂')]) {
      c.drawLine(Offset(x, y0), Offset(x, y1), Draw.stroke(PX.copper, 7));
      if (i != 0) {
        for (final y in [y0 + 80, (y0 + y1) / 2, y1 - 80]) {
          EM.midArrow(c, Offset(x, y + 10 * i.sign), Offset(x, y - 10 * i.sign), IX.amber, size: 20);
        }
      }
      Draw.text(c, '$lab = ${fx(i.abs(), 0)} A ${i > 0 ? '↑' : (i < 0 ? '↓' : '')}', Offset(x, y0 - 30), size: 19, color: IX.amber);
    }
    final f = 2e-7 * i1 * i2 / (d / 100);
    if (f != 0) {
      final len = (20 + 90 * (f.abs() / 4e-4).clamp(0.0, 1.0));
      final ym = (y0 + y1) / 2 + 60;
      final dir = f > 0 ? 1.0 : -1.0;
      IxPaint.arrow(c, Offset(x1, ym), Offset(x1 + dir * len, ym), IX.green, width: 5, head: 20);
      IxPaint.arrow(c, Offset(x2, ym), Offset(x2 - dir * len, ym), IX.green, width: 5, head: 20);
      Draw.text(c, 'F', Offset(x1 - 26, ym), size: 20, color: IX.green, halo: true);
      Draw.text(c, 'F', Offset(x2 + 26, ym), size: 20, color: IX.green, halo: true);
    }
    Draw.dim(c, Offset(x1, y1 + 26), Offset(x2, y1 + 26), 'd = ${fx(d, 0)} cm', off: 24);
    Draw.caption(c, f > 0 ? 'Currents the same way attract.' : (f < 0 ? 'Opposite currents repel.' : 'No current, no force.'));
    final fmax = math.max(10.0, 2e-7 * (i1 * i2).abs() / 0.01 * 1e6);
    final p = Plot(right, 1, 20, -fmax * 1.05, fmax * 1.05, xl: 'd (cm)', yl: 'f (µN/m), + attract', title: 'Force per metre falls as 1/d');
    p.frame(c);
    p.hline(c, 0, IX.muted);
    p.fn(c, (x) => 2e-7 * i1 * i2 / (x / 100) * 1e6, IX.accent, w: 4);
    p.dot(c, d, f * 1e6, IX.accent, label: '${fx(f * 1e6, 1)} µN/m');
  },
);

// ── moving-coil galvanometer ──

const _gA = 5e-4; // coil area, m²

double _galvoPhi(V v) {
  final tau0 = v['N']! * v['I']! * 1e-6 * _gA * v['B']!, k = v['k']! * 1e-6;
  if (v['radial'] == 1) return tau0 / k;
  // Uniform field: k φ = τ0 cos φ.
  var lo = -math.pi / 2, hi = math.pi / 2;
  for (var i = 0; i < 60; i++) {
    final m = (lo + hi) / 2;
    (k * m - tau0 * math.cos(m) > 0) ? hi = m : lo = m;
  }
  return (lo + hi) / 2;
}

final _galvo = ModeSpec(
  title: 'A moving-coil galvanometer',
  formula: 'NIAB = kφ  →  φ = (NAB/k) I',
  values: {'I': 30, 'N': 200, 'B': 0.5, 'k': 3, 'radial': 1},
  controls: (v) => const [Sl('I', 'Current I', -50, 50, unit: 'µA', div: 20), Sl('N', 'Turns N', 50, 500, div: 45, dp: 0), Sl('B', 'Field B', 0.1, 1, unit: 'T', div: 18), Sl('k', 'Spring constant k', 1, 10, unit: '× 10⁻⁶ N m/rad', div: 18), Seg('radial', 'Pole pieces', ['Flat (uniform B)', 'Curved (radial B)'])],
  presets: {'30 µA, radial field': {'I': 30, 'radial': 1}, 'Flat poles': {'radial': 0, 'I': 50}, 'More turns': {'N': 400}},
  readouts: (v) {
    final phi = _galvoPhi(v);
    final sens = v['N']! * _gA * v['B']! / (v['k']! * 1e-6) * 1e-6; // rad per µA
    return [Readout('Deflection φ', fx(deg(phi), 1), '°', IX.accent), Readout('Current sensitivity', fx(deg(sens), 2), '° per µA'), Readout('Torque NIAB', fx(v['N']! * v['I']! * _gA * v['B']!, 3), '× 10⁻⁶ N m')];
  },
  paint: (c, s, v, t) {
    final (left, right) = Lay.split(s, 0.52);
    final phi = _galvoPhi(v);
    final radial = v['radial'] == 1;
    final o = Offset(left.center.dx, left.center.dy + 90);
    const rc = 70.0, gap = 34.0;
    // Pole pieces.
    const pr = rc + gap;
    for (final side in [-1.0, 1.0]) {
      final path = Path();
      final outer = o.dx + side * (pr + 120);
      if (radial) {
        path.moveTo(outer, o.dy - 140);
        path.lineTo(o.dx + side * pr * math.cos(0.9), o.dy - 140);
        path.lineTo(o.dx + side * pr * math.cos(0.9), o.dy - pr * math.sin(0.9));
        path.arcToPoint(Offset(o.dx + side * pr * math.cos(0.9), o.dy + pr * math.sin(0.9)), radius: const Radius.circular(pr), clockwise: side < 0);
        path.lineTo(o.dx + side * pr * math.cos(0.9), o.dy + 140);
        path.lineTo(outer, o.dy + 140);
      } else {
        path.addRect(Rect.fromLTRB(math.min(outer, o.dx + side * pr), o.dy - 140, math.max(outer, o.dx + side * pr), o.dy + 140));
      }
      path.close();
      c.drawPath(path, Draw.fill(side < 0 ? EM.north : EM.south));
      Draw.text(c, side < 0 ? 'N' : 'S', Offset(o.dx + side * (pr + 80), o.dy), size: 30, color: Colors.white, w: FontWeight.w700);
    }
    // Field lines in the gap.
    for (var k = -3; k <= 3; k++) {
      if (radial) {
        final a = k * 0.24;
        for (final side in [-1.0, 1.0]) {
          final p0 = o + Offset(side * math.cos(a), math.sin(a)) * (pr - 2), p1 = o + Offset(side * math.cos(a), math.sin(a)) * (rc + 2);
          side < 0 ? EM.flowLine(c, [p0, p1], EM.field, every: 20, size: 9) : EM.flowLine(c, [p1, p0], EM.field, every: 20, size: 9);
        }
      } else {
        final y = o.dy + k * 34;
        EM.flowLine(c, [Offset(o.dx - pr, y), Offset(o.dx + pr, y)], EM.field.withValues(alpha: 0.6), every: 120, size: 9);
      }
    }
    if (radial) {
      Draw.ball(c, o, rc, const Color(0xFFB8BECB));
      Draw.text(c, 'soft iron', o + const Offset(0, 20), size: 15, color: IX.inkSoft);
    }
    // Coil edge-on, rotating with φ; its plane starts along the field.
    final u = Offset(math.cos(phi), math.sin(phi));
    final a = o - u * (rc + gap * 0.5), b = o + u * (rc + gap * 0.5);
    c.drawLine(a, b, Draw.stroke(PX.copper.withValues(alpha: 0.5), 3));
    final cur = v['I']!;
    for (final (p, out) in [(a, cur >= 0), (b, cur < 0)]) {
      c.drawCircle(p, 13, Draw.fill(const Color(0xFFF3DCC8)));
      out ? EM.outOf(c, p, 13, PX.copper) : EM.into(c, p, 13, PX.copper);
    }
    // Pointer and scale.
    final sc = Offset(o.dx, o.dy - 20);
    const rs = 290.0;
    for (var d = -60; d <= 60; d += 10) {
      final ang = rad(d - 90.0);
      final p0 = sc + Offset(math.cos(ang), math.sin(ang)) * rs, p1 = sc + Offset(math.cos(ang), math.sin(ang)) * (rs + (d % 30 == 0 ? 22 : 12));
      c.drawLine(p0, p1, Draw.stroke(IX.inkSoft, 2));
      if (d % 30 == 0) Draw.text(c, '$d°', sc + Offset(math.cos(ang), math.sin(ang)) * (rs + 44), size: 16, color: IX.inkSoft);
    }
    final pa = rad(deg(phi).clamp(-62.0, 62.0) - 90);
    c.drawLine(sc, sc + Offset(math.cos(pa), math.sin(pa)) * (rs - 4), Draw.stroke(IX.ink, 3.5));
    c.drawCircle(sc, 7, Draw.fill(IX.ink));
    if (deg(phi).abs() > 60) Draw.text(c, 'off scale', sc + const Offset(0, -rs - 70), size: 18, color: IX.positive);
    Draw.caption(c, radial ? 'Radial field: the torque NIAB is the same at every angle, so φ ∝ I.' : 'Flat poles: the torque falls as cos φ, so the scale is not linear.');
    final sens = v['N']! * _gA * v['B']! / (v['k']! * 1e-6) * 1e-6;
    final p = Plot(right, -50, 50, -70, 70, xl: 'I (µA)', yl: 'φ (°)', title: radial ? 'φ is proportional to I: an even scale' : 'Uniform field: the scale bunches up');
    p.frame(c);
    p.hline(c, 0, IX.muted);
    p.fn(c, (x) => deg(x * sens), IX.muted, w: 2, dash: true, label: 'radial', labelAt: 18);
    p.fn(c, (x) => deg(_galvoPhi({...v, 'I': x})), IX.accent, w: 4);
    p.dot(c, cur, deg(phi), IX.accent);
  },
);

// ── torque on a current loop ──

final _torque = ModeSpec(
  title: 'Torque on a current loop',
  formula: 'τ = m × B,  τ = NIAB sin θ',
  values: {'N': 100, 'I': 1, 'A': 50, 'B': 0.5, 'th': 90},
  controls: (v) => const [Sl('N', 'Turns N', 10, 200, div: 19, dp: 0), Sl('I', 'Current I', 0.1, 2, unit: 'A', div: 19), Sl('A', 'Loop area A', 10, 100, unit: 'cm²', div: 18), Sl('B', 'Field B', 0.1, 1, unit: 'T', div: 18), Sl('th', 'Angle θ between m and B', 0, 180, unit: '°', div: 36)],
  presets: {'θ = 90° (largest)': {'th': 90}, 'θ = 0° (stable)': {'th': 0}, 'θ = 180° (unstable)': {'th': 180}},
  readouts: (v) {
    final m = v['N']! * v['I']! * v['A']! * 1e-4;
    return [Readout('Torque τ', fx(m * v['B']! * math.sin(rad(v['th']!)), 3), 'N m', IX.accent), Readout('Magnetic moment m = NIA', fx(m, 3), 'A m²', IX.positive), Readout('Energy U = −mB cos θ', fx(-m * v['B']! * math.cos(rad(v['th']!)), 3), 'J')];
  },
  paint: (c, s, v, t) {
    final (left, right) = Lay.split(s, 0.5);
    final th = rad(v['th']!);
    final o = Offset(left.center.dx, left.center.dy + 20);
    for (var y = 110.0; y < left.bottom - 30; y += 80) {
      EM.flowLine(c, [Offset(left.left + 30, y), Offset(left.right - 20, y)], EM.field.withValues(alpha: 0.35), every: 300);
    }
    Draw.text(c, 'B', Offset(left.right - 40, 84), size: 24, color: EM.field);
    // Loop seen from above (edge-on): its plane is at right angles to m.
    final mdir = Offset(math.cos(th), -math.sin(th));
    final pl = Offset(-mdir.dy, mdir.dx);
    const half = 150.0;
    final a = o + pl * half, b = o - pl * half;
    c.drawLine(a, b, Draw.stroke(PX.copper, 7));
    c.drawCircle(a, 15, Draw.fill(const Color(0xFFF3DCC8)));
    c.drawCircle(b, 15, Draw.fill(const Color(0xFFF3DCC8)));
    EM.into(c, a, 15, PX.copper);
    EM.outOf(c, b, 15, PX.copper);
    Draw.force(c, o, o + mdir * 120, IX.positive, 'm');
    final f = 90.0;
    // Side b carries current out of the screen: I ẑ × B x̂ = +ŷ, up the screen; side a down.
    Draw.force(c, a, a + const Offset(0, 1) * f, IX.green, 'F');
    Draw.force(c, b, b + const Offset(0, -1) * f, IX.green, 'F');
    if (v['th']! > 3 && v['th']! < 177) Draw.angle(c, o, -th, 0, 60, 'θ', color: IX.positive);
    Draw.caption(c, 'Top view: the two long sides carry opposite currents and feel a couple.');
    final mm = v['N']! * v['I']! * v['A']! * 1e-4;
    final tm = mm * v['B']!;
    final p = Plot(right, 0, 180, 0, math.max(0.01, tm) * 1.2, xl: 'θ (°)', yl: 'τ (N m)', title: 'τ = NIAB sin θ');
    p.frame(c);
    p.fn(c, (x) => tm * math.sin(rad(x)), IX.accent, w: 4);
    p.dot(c, v['th']!, tm * math.sin(th), IX.accent, label: '${fx(tm * math.sin(th), 3)} N m');
  },
);
