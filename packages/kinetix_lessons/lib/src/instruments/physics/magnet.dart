import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'em_kit.dart';
import 'kit.dart';

/// Magnetism and matter (2nd PUC ch. 5): a bar magnet's field mapped with a compass, a
/// magnetic needle swinging in a field, dipole energy and torque, Gauss's law for magnetism,
/// magnetising a core (H, M, B) and Curie's law.
final magnetSpec = InstrumentSpec(
  id: 'magnet',
  chapter: '2nd PUC Physics · Magnetism and matter',
  modes: {'barmagnet': _bar, 'needle': _needle, 'dipole': _dipole, 'gauss': _gauss, 'core': _core, 'curie': _curie},
);

const _mu0 = 4e-7 * math.pi;

// ── bar magnet and compass ──

const _hl = 0.04; // half the magnetic length, m

/// Field (T) of a bar magnet of moment m along +x (N at +x), modelled as two poles, plus an
/// optional uniform Earth field along +x.
Offset _barB(Offset p, double m, double earth) {
  final qm = m / (2 * _hl);
  Offset pole(Offset at, double s) {
    final d = p - at;
    final r2 = d.distanceSquared;
    if (r2 < 1e-8) return Offset.zero;
    return d / math.sqrt(r2) * (1e-7 * s * qm / r2);
  }

  return pole(const Offset(_hl, 0), 1) + pole(const Offset(-_hl, 0), -1) + Offset(earth, 0);
}

final _bar = ModeSpec(
  title: 'Field of a bar magnet, mapped with a compass',
  formula: 'B_axial = μ₀2m/4πr³,  B_equatorial = μ₀m/4πr³',
  values: {'m': 2, 'earth': 0, 'r': 20, 'cx': 0.12, 'cy': 0.09},
  controls: (v) => const [Sl('m', 'Magnetic moment m', 0.1, 5, unit: 'A m²', div: 49), Sl('r', 'Distance r (graph)', 5, 50, unit: 'cm', div: 45), Seg('earth', "Earth's field (40 µT →)", ['Off', 'On'])],
  presets: {'Magnet alone': {'earth': 0}, "With the Earth's field": {'earth': 1, 'm': 2}, 'Weak magnet, 20 cm': {'m': 0.4, 'r': 20}},
  readouts: (v) {
    final b = _barB(Offset(v['cx']!, v['cy']!), v['m']!, v['earth'] == 1 ? 40e-6 : 0);
    final r = v['r']! / 100;
    return [
      Readout('B at the compass', fx(b.distance * 1e6, 1), 'µT', IX.accent),
      Readout('B on the axis at r', fx(1e-7 * 2 * v['m']! / (r * r * r) * 1e6, 1), 'µT', EM.north),
      Readout('B on the equator at r', fx(1e-7 * v['m']! / (r * r * r) * 1e6, 1), 'µT', EM.south),
    ];
  },
  drag: (v, p, s, start) {
    final (left, _) = Lay.split(s, 0.58);
    final ppm = left.width / 0.5;
    final o = Offset(left.center.dx, left.center.dy + 10);
    final cp = o + Offset(v['cx']!, -v['cy']!) * ppm;
    if (pick(v, p, start, [cp]) != 0) return false;
    v['cx'] = ((p.dx - o.dx) / ppm).clamp(-0.24, 0.24);
    v['cy'] = (-(p.dy - o.dy) / ppm).clamp(-0.26, 0.26);
    return true;
  },
  paint: (c, s, v, t) {
    final (left, right) = Lay.split(s, 0.58);
    final ppm = left.width / 0.5;
    final o = Offset(left.center.dx, left.center.dy + 10);
    Offset P(Offset q) => o + Offset(q.dx, -q.dy) * ppm;
    final m = v['m']!, earth = v['earth'] == 1 ? 40e-6 : 0.0;
    Offset f(Offset q) => _barB(q, m, earth);
    final box = Rect.fromLTRB(-0.25, -(left.bottom - o.dy) / ppm, 0.25, (o.dy - 60) / ppm);
    final sPole = const Offset(-_hl, 0);
    void trace(Offset start, double dir) {
      final pts = <Offset>[start];
      var p = start;
      for (var i = 0; i < 900; i++) {
        Offset d(Offset q) {
          final b = f(q);
          return b.distance < 1e-14 ? Offset.zero : b / b.distance * dir;
        }

        final k1 = d(p), k2 = d(p + k1 * 0.0015), k3 = d(p + k2 * 0.0015), k4 = d(p + k3 * 0.003);
        p += (k1 + k2 * 2 + k3 * 2 + k4) / 6 * 0.003;
        pts.add(p);
        if (!box.contains(p) || (p - sPole).distance < 0.006 || (dir < 0 && (p - const Offset(_hl, 0)).distance < 0.006)) break;
      }
      final px = [for (final q in pts) P(q)];
      if (dir < 0) {
        EM.flowLine(c, px.reversed.toList(), EM.field.withValues(alpha: 0.6), every: 140, w: 2);
      } else {
        EM.flowLine(c, px, EM.field.withValues(alpha: 0.6), every: 140, w: 2);
      }
    }

    c.save();
    c.clipRect(left);
    const n = 18;
    for (var i = 0; i < n; i++) {
      final a = 2 * math.pi * (i + 0.5) / n;
      trace(const Offset(_hl, 0) + Offset(math.cos(a), math.sin(a)) * 0.007, 1);
    }
    if (earth > 0) {
      // Lines that start from the left edge (the Earth's field) and do not pass the poles.
      for (var y = box.top + 0.02; y < box.bottom; y += 0.045) {
        trace(Offset(box.left + 0.001, y), 1);
      }
      // Neutral points on the equatorial line, where the magnet's field cancels the Earth's.
      final rn = math.pow(1e-7 * m / earth, 1 / 3).toDouble();
      for (final sy in [1.0, -1.0]) {
        final q = P(Offset(0, sy * rn));
        c.drawCircle(q, 11, Draw.stroke(IX.green, 3));
        Draw.text(c, 'neutral point', q + const Offset(0, 26), size: 16, color: IX.green, halo: true);
      }
    }
    c.restore();
    EM.magnet(c, Rect.fromCenter(center: o, width: 0.10 * ppm * 1.2, height: 34));
    // Compass: the needle lines up with B.
    final cp = P(Offset(v['cx']!, v['cy']!));
    final b = f(Offset(v['cx']!, v['cy']!));
    final ang = math.atan2(-b.dy, b.dx);
    c.drawCircle(cp, 36, Draw.fill(Colors.white));
    c.drawCircle(cp, 36, Draw.stroke(IX.inkSoft, 3));
    final u = Offset(math.cos(ang), math.sin(ang));
    final nrm = Offset(-u.dy, u.dx);
    final tipN = cp + u * 28, tipS = cp - u * 28;
    c.drawPath(Path()..moveTo(tipN.dx, tipN.dy)..lineTo((cp + nrm * 6).dx, (cp + nrm * 6).dy)..lineTo((cp - nrm * 6).dx, (cp - nrm * 6).dy)..close(), Draw.fill(EM.north));
    c.drawPath(Path()..moveTo(tipS.dx, tipS.dy)..lineTo((cp + nrm * 6).dx, (cp + nrm * 6).dy)..lineTo((cp - nrm * 6).dx, (cp - nrm * 6).dy)..close(), Draw.fill(EM.south));
    c.drawCircle(cp, 4, Draw.fill(IX.ink));
    Draw.caption(c, 'Drag the compass: its red end points along B, from N round to S.');
    final r = v['r']!;
    final ymax = 1e-7 * 2 * m / math.pow(0.05, 3) * 1e6;
    final p = Plot(right, 5, 50, 0, math.min(ymax, 1e-7 * 2 * m / math.pow(r / 100, 3) * 1e6 * 3.0).clamp(1, double.infinity), xl: 'r (cm)', yl: 'B (µT)', title: 'Axial field is twice the equatorial');
    p.frame(c);
    p.fn(c, (x) => 1e-7 * 2 * m / math.pow(x / 100, 3) * 1e6, EM.north, w: 4, label: 'axial', labelAt: r + 6);
    p.fn(c, (x) => 1e-7 * m / math.pow(x / 100, 3) * 1e6, EM.south, w: 4, label: 'equatorial', labelAt: r + 12);
    if (earth > 0) p.hline(c, 40, IX.green, label: 'Earth 40 µT');
    p.dot(c, r, 1e-7 * 2 * m / math.pow(r / 100, 3) * 1e6, EM.north);
    p.dot(c, r, 1e-7 * m / math.pow(r / 100, 3) * 1e6, EM.south);
  },
);

// ── needle oscillating in a field ──

double _needleT(V v) => 2 * math.pi * math.sqrt(v['I']! * 1e-6 / (v['m']! * v['B']! * 1e-6));

final _needle = ModeSpec(
  title: 'A magnetic needle swinging in a field',
  formula: 'T = 2π √(I / mB)',
  values: {'B': 50, 'm': 0.5, 'I': 5, 'th0': 30, 'dmp': 0},
  animate: true,
  controls: (v) => const [Sl('B', 'Field B', 10, 100, unit: 'µT', div: 18), Sl('m', 'Magnetic moment m', 0.1, 1, unit: 'A m²', div: 18), Sl('I', 'Moment of inertia I', 1, 10, unit: '× 10⁻⁶ kg m²', div: 18), Sl('th0', 'Start angle', 5, 90, unit: '°', div: 17), Seg('dmp', 'Air damping', ['Off', 'On'])],
  presets: {"Earth's field (50 µT)": {'B': 50}, 'Four times the field': {'B': 100, 'm': 1}, 'Damped': {'dmp': 1}},
  readouts: (v) {
    final tp = _needleT(v);
    return [Readout('Period T', fx(tp, 2), 's', IX.accent), Readout('Frequency', fx(1 / tp, 3), 'Hz'), Readout('Largest torque mB sin θ₀', fx(v['m']! * v['B']! * math.sin(rad(v['th0']!)), 2), '× 10⁻⁶ N m')];
  },
  paint: (c, s, v, t) {
    final tp = _needleT(v);
    final g = v['dmp'] == 1 ? 0.12 : 0.0;
    double th(double tt) => v['th0']! * math.cos(2 * math.pi * tt / tp) * math.exp(-g * tt);
    final (top, bot) = Lay.stack(s, 0.5);
    final o = Offset(top.center.dx, top.center.dy + 14);
    for (var y = top.top + 70; y < top.bottom; y += 70) {
      EM.flowLine(c, [Offset(top.left + 60, y), Offset(top.right - 60, y)], EM.field.withValues(alpha: 0.3), every: 400);
    }
    Draw.text(c, 'B', Offset(top.right - 46, top.top + 50), size: 24, color: EM.field);
    final tt = t % 30;
    final a = rad(th(tt));
    final u = Offset(math.cos(a), -math.sin(a));
    final nrm = Offset(-u.dy, u.dx);
    const len = 170.0;
    c.drawCircle(o, len + 20, Draw.stroke(IX.rule, 2));
    for (var d = -90; d <= 90; d += 15) {
      final q = o + Offset(math.cos(rad(d.toDouble())), -math.sin(rad(d.toDouble()))) * (len + 20);
      c.drawLine(q, q + (q - o) / (len + 20) * (d % 45 == 0 ? 16 : 8), Draw.stroke(IX.inkSoft, 2));
    }
    c.drawPath(Path()..moveTo((o + u * len).dx, (o + u * len).dy)..lineTo((o + nrm * 14).dx, (o + nrm * 14).dy)..lineTo((o - nrm * 14).dx, (o - nrm * 14).dy)..close(), Draw.fill(EM.north));
    c.drawPath(Path()..moveTo((o - u * len).dx, (o - u * len).dy)..lineTo((o + nrm * 14).dx, (o + nrm * 14).dy)..lineTo((o - nrm * 14).dx, (o - nrm * 14).dy)..close(), Draw.fill(EM.south));
    c.drawCircle(o, 8, Draw.fill(IX.ink));
    Draw.tag(c, 'θ = ${fx(th(tt), 1)}°', o + const Offset(0, -len - 64), color: IX.accent);
    Draw.caption(c, 'The torque −mB sin θ pulls the needle back towards B, so it swings like a pendulum.');
    final p = Plot(bot, 0, 30, -95, 95, xl: 't (s)', yl: 'θ (°)', title: 'Angle against time: period ${fx(tp, 2)} s');
    p.frame(c);
    p.hline(c, 0, IX.muted);
    p.fn(c, th, IX.accent, w: 3.5);
    p.dot(c, tt, th(tt), IX.accent);
  },
);

// ── energy and torque of a dipole ──

final _dipole = ModeSpec(
  title: 'Energy and torque of a magnetic dipole',
  formula: 'U = −mB cos θ,  τ = mB sin θ',
  values: {'m': 0.5, 'B': 0.4, 'th': 60},
  controls: (v) => const [Sl('m', 'Magnetic moment m', 0.1, 2, unit: 'A m²', div: 19), Sl('B', 'Field B', 0.05, 0.5, unit: 'T', div: 9), Sl('th', 'Angle θ', 0, 360, unit: '°', div: 72)],
  presets: {'Stable (0°)': {'th': 0}, 'Largest torque (90°)': {'th': 90}, 'Unstable (180°)': {'th': 180}},
  readouts: (v) {
    final mb = v['m']! * v['B']!;
    final th = rad(v['th']!);
    return [Readout('Potential energy U', fx(-mb * math.cos(th), 3), 'J', IX.accent), Readout('Torque τ', fx(mb * math.sin(th), 3), 'N m', IX.positive), Readout('Work to turn 0° → 180°', fx(2 * mb, 3), 'J')];
  },
  paint: (c, s, v, t) {
    final (left, right) = Lay.split(s, 0.42);
    final mb = v['m']! * v['B']!;
    final th = rad(v['th']!);
    final o = Offset(left.center.dx, left.center.dy + 20);
    for (var y = 120.0; y < left.bottom - 20; y += 70) {
      EM.flowLine(c, [Offset(left.left + 30, y), Offset(left.right - 20, y)], EM.field.withValues(alpha: 0.3), every: 300);
    }
    Draw.text(c, 'B', Offset(left.right - 40, 90), size: 24, color: EM.field);
    c.save();
    c.translate(o.dx, o.dy);
    c.rotate(-th);
    EM.magnet(c, Rect.fromCenter(center: Offset.zero, width: 230, height: 40));
    c.restore();
    Draw.force(c, o, o + Offset(math.cos(th), -math.sin(th)) * 150, IX.accent, 'm');
    if (v['th']! > 3 && v['th']! < 357) Draw.angle(c, o, -th, 0, 70, 'θ', color: IX.accent);
    Draw.caption(c, 'm points from S to N. U is lowest when m lines up with B.');
    final p = Plot(right, 0, 360, -mb * 1.25, mb * 1.25, xl: 'θ (°)', yl: 'U (J), τ (N m)', title: 'U = −mB cos θ and τ = mB sin θ');
    p.frame(c);
    p.hline(c, 0, IX.muted);
    p.fn(c, (x) => -mb * math.cos(rad(x)), IX.accent, w: 4, label: 'U', labelAt: 60);
    p.fn(c, (x) => mb * math.sin(rad(x)), IX.positive, w: 3, label: 'τ', labelAt: 120);
    p.dot(c, v['th']!, -mb * math.cos(th), IX.accent);
    p.dot(c, v['th']!, mb * math.sin(th), IX.positive);
  },
);

// ── Gauss's law for magnetism ──

final _gauss = ModeSpec(
  title: 'Flux through a closed surface',
  formula: '∮ B · dA = 0',
  values: {'B': 0.5, 'A': 50, 'th': 30},
  controls: (v) => const [Sl('B', 'Field B', 0.1, 1, unit: 'T', div: 18), Sl('A', 'Area of the flat face', 10, 100, unit: 'cm²', div: 18), Sl('th', 'Angle of the face normal to B', 0, 180, unit: '°', div: 36)],
  presets: {'Face across B': {'th': 0}, 'Tilted 60°': {'th': 60}, 'Face along B': {'th': 90}},
  readouts: (v) {
    final phi = v['B']! * v['A']! * 1e-4 * math.cos(rad(v['th']!));
    return [Readout('Flux in through the flat face', fx(phi.abs() * 1e3, 3), 'mWb', IX.accent), Readout('Flux out through the cap', fx(phi.abs() * 1e3, 3), 'mWb', IX.positive), Readout('Net flux', '0', 'Wb', IX.green)];
  },
  paint: (c, s, v, t) {
    final (left, right) = Lay.split(s, 0.56);
    final o = Offset(left.center.dx, left.center.dy + 20);
    final th = rad(v['th']!);
    final rp = 110 + v['A']! * 1.2;
    for (var y = 110.0; y < left.bottom - 20; y += 52) {
      EM.flowLine(c, [Offset(left.left + 30, y), Offset(left.right - 20, y)], EM.field.withValues(alpha: 0.45), every: 330);
    }
    // Section of the closed surface: a flat face (chord) and a dome over it. The flat face's
    // outward normal makes angle θ with B.
    c.save();
    c.translate(o.dx, o.dy);
    c.rotate(-th);
    final dome = Path()
      ..moveTo(-rp * 0.12, -rp)
      ..arcToPoint(Offset(-rp * 0.12, rp), radius: Radius.circular(rp), clockwise: true, largeArc: false)
      ..close();
    // The dome bulges to +x (away from the flat face, whose outward normal is −x).
    c.drawPath(dome, Draw.fill(IX.amber.withValues(alpha: 0.12)));
    c.drawPath(dome, Draw.stroke(IX.amber, 3));
    c.drawLine(Offset(-rp * 0.12, -rp), Offset(-rp * 0.12, rp), Draw.stroke(IX.accent, 6));
    c.restore();
    final nrm = Offset(-math.cos(th), math.sin(th));
    final fc = o + Offset(-rp * 0.12 * math.cos(th), rp * 0.12 * math.sin(th));
    Draw.force(c, fc, fc + nrm * 90, IX.accent, 'n (out)');
    Draw.text(c, 'flat face', fc + Offset(-nrm.dy, nrm.dx) * (rp * 0.6) + const Offset(0, 0), size: 17, color: IX.accent, halo: true);
    Draw.text(c, 'curved cap', o + Offset(math.cos(th), -math.sin(th)) * rp * 0.95 + const Offset(0, -24), size: 17, color: IX.amber, halo: true);
    Draw.caption(c, 'Every B line that enters the surface also leaves it. There are no magnetic charges.');
    final phi = v['B']! * v['A']! * 1e-4 * math.cos(th) * 1e3;
    Draw.bars(c, right, [('flat face', -phi, IX.accent), ('curved cap', phi, IX.positive), ('total', 0, IX.green)], unit: 'mWb', title: 'Outward flux through each part', dp: 3, max: 10);
  },
);

// ── magnetising a core ──

const _mats = ['Air', 'Aluminium', 'Bismuth', 'Soft iron'];
const _chi = [0.0, 2.3e-5, -1.66e-4, 399.0];

final _core = ModeSpec(
  title: 'Magnetising a core: H, M and B',
  formula: 'H = nI,  M = χH,  B = μ₀(H + M) = μ₀μᵣH',
  values: {'n': 10, 'I': 2, 'mat': 3},
  controls: (v) => const [Sl('n', 'Turns per cm n', 1, 20, div: 19, dp: 0), Sl('I', 'Current I', 0, 5, unit: 'A', div: 20), Seg('mat', 'Core', _mats)],
  presets: {'Soft iron (μᵣ = 400)': {'mat': 3}, 'Aluminium (para)': {'mat': 1}, 'Bismuth (dia)': {'mat': 2}, 'Air': {'mat': 0}},
  readouts: (v) {
    final h = v['n']! * 100 * v['I']!, chi = _chi[v['mat']!.round()];
    return [Readout('H = nI', fx(h, 0), 'A/m'), Readout('M = χH', chi.abs() < 1 ? sc(chi * h) : fx(chi * h, 0), 'A/m', IX.positive), Readout('B = μ₀(H + M)', fx(_mu0 * (h + chi * h) * 1e3, 3), 'mT', IX.accent), Readout('μᵣ = 1 + χ', chi.abs() < 1 ? fx(1 + chi, 6) : fx(1 + chi, 0), '')];
  },
  paint: (c, s, v, t) {
    final (top, bot) = Lay.stack(s, 0.5);
    final i = v['mat']!.round();
    final chi = _chi[i];
    final h = v['n']! * 100 * v['I']!;
    final y = top.center.dy + 20;
    final x0 = top.left + 160, x1 = top.right - 160;
    final coreCol = [const Color(0xFFF5F7FB), const Color(0xFFD5DAE3), const Color(0xFFE9D8E6), const Color(0xFF8D96A8)][i];
    final core = Rect.fromLTRB(x0 - 40, y - 52, x1 + 40, y + 52);
    if (i > 0) {
      Draw.block(c, core, coreCol, radius: 10);
    } else {
      c.drawRRect(RRect.fromRectAndRadius(core, const Radius.circular(10)), Draw.stroke(IX.rule, 2));
    }
    // Domains or atomic moments inside: aligned along H, reversed for a diamagnet.
    final align = i == 3 ? 1.0 : (i == 1 ? 0.25 : (i == 2 ? -0.25 : 0.0));
    final rnd = math.Random(7);
    if (i > 0) {
      for (var x = core.left + 30; x < core.right - 20; x += 52) {
        for (final dy in [-24.0, 24.0]) {
          final r0 = rnd.nextDouble() * 2 - 1;
          final a = v['I']! > 0 ? (align < 0 ? math.pi : 0.0) + r0 * math.pi * (1 - align.abs()) : r0 * math.pi;
          final u = Offset(math.cos(a), math.sin(a)) * 16;
          IxPaint.arrow(c, Offset(x, y + dy) - u, Offset(x, y + dy) + u, i == 3 ? Colors.white : IX.inkSoft, width: 2.5, head: 9);
        }
      }
    }
    EM.coil(c, Offset(x0, y), Offset(x1, y), 70, (v['n']! * 1.2).round().clamp(6, 24), w: 5);
    final hlen = h <= 0 ? 0.0 : 60 + (h / 10000 * 220).clamp(0.0, 220.0);
    if (hlen > 4) Draw.force(c, Offset(top.center.dx - hlen / 2, top.top + 64), Offset(top.center.dx + hlen / 2, top.top + 64), IX.green, 'H');
    Draw.caption(c, [
      'Air: no magnetisation, B = μ₀H.',
      'Aluminium: paramagnetic, χ = +2.3 × 10⁻⁵, M slightly along H.',
      'Bismuth: diamagnetic, χ = −1.7 × 10⁻⁴, M slightly against H.',
      'Soft iron: ferromagnetic, the domains line up and B is hundreds of times larger.',
    ][i]);
    final b0 = _mu0 * h * 1e3, b = _mu0 * h * (1 + chi) * 1e3;
    final p = Plot(bot, 0, 5, 0, math.max(1.0, _mu0 * v['n']! * 100 * 5 * (1 + math.max(chi, 0)) * 1e3) * 1.08, xl: 'I (A)', yl: 'B (mT)', title: 'B = μ₀μᵣ nI: the core multiplies the coil\'s field');
    p.frame(c);
    p.fn(c, (x) => _mu0 * v['n']! * 100 * x * (1 + chi) * 1e3, IX.accent, w: 4, label: _mats[i], labelAt: 4.2);
    if (i == 3) p.fn(c, (x) => _mu0 * v['n']! * 100 * x * 1e3, IX.muted, w: 2.5, dash: true, label: 'air', labelAt: 4.5);
    p.dot(c, v['I']!, b, IX.accent, label: '${fx(b, 3)} mT');
    if (i != 3) Draw.text(c, 'B − μ₀H = ${sc(b - b0)} mT', Offset(bot.right - 30, bot.top + 30), size: 17, color: IX.positive, align: Alignment.centerRight, halo: true);
  },
);

// ── Curie's law ──

final _curie = ModeSpec(
  title: "Curie's law for a paramagnet",
  formula: 'χ = C / T',
  values: {'C': 7, 'T': 300},
  controls: (v) => const [Sl('C', 'Curie constant C', 1, 20, unit: '× 10⁻³ K', div: 19), Sl('T', 'Temperature T', 50, 1000, unit: 'K', div: 95)],
  presets: {'Room temperature': {'T': 300}, 'Liquid nitrogen (77 K)': {'T': 77}, 'Hot (900 K)': {'T': 900}},
  readouts: (v) => [Readout('Susceptibility χ', fx(v['C']! / v['T']! * 100, 3), '× 10⁻⁵', IX.accent), Readout('Doubling T', 'halves χ', ''), Readout('1/χ', fx(v['T']! / v['C']! * 1000, 0), '')],
  paint: (c, s, v, t) {
    final (left, right) = Lay.split(s, 0.44);
    final tk = v['T']!;
    // Atomic moments in a field: alignment falls as thermal agitation grows (~ C/T).
    final box = Rect.fromLTRB(left.left + 40, 110, left.right - 30, left.bottom - 110);
    c.drawRRect(RRect.fromRectAndRadius(box, const Radius.circular(16)), Draw.fill(const Color(0xFFF1F3F8)));
    c.drawRRect(RRect.fromRectAndRadius(box, const Radius.circular(16)), Draw.stroke(IX.rule, 2));
    final rnd = math.Random(11);
    final spread = (math.pi * math.sqrt(tk / 1000)).clamp(0.2, math.pi);
    for (var y = box.top + 40; y < box.bottom - 20; y += 60) {
      for (var x = box.left + 40; x < box.right - 20; x += 60) {
        final a = (rnd.nextDouble() * 2 - 1) * spread;
        final u = Offset(math.cos(a), math.sin(a)) * 20;
        IxPaint.arrow(c, Offset(x, y) - u, Offset(x, y) + u, IX.inkSoft, width: 2.5, head: 10);
      }
    }
    Draw.force(c, Offset(box.left, box.bottom + 50), Offset(box.left + 140, box.bottom + 50), EM.field, 'B applied');
    Draw.text(c, '${fx(tk, 0)} K', Offset(box.right - 60, box.bottom + 50), size: 22, color: IX.positive);
    Draw.caption(c, 'Heat jostles the atomic magnets. The colder the sample, the better they line up.');
    final cc = v['C']!;
    final p = Plot(right, 0, 1000, 0, cc / 50 * 100 * 1.05, xl: 'T (K)', yl: 'χ (× 10⁻⁵)', title: 'χ falls as 1/T');
    p.frame(c);
    p.fn(c, (x) => cc / math.max(x, 1) * 100, IX.accent, w: 4, a: 50);
    p.dot(c, tk, cc / tk * 100, IX.accent, label: fx(cc / tk * 100, 3));
  },
);
