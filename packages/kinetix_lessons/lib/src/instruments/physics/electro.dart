import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import 'kit.dart';

/// Electric charges, Coulomb's law, field and potential of a point charge, dipoles and Gauss's
/// law (2nd PUC ch. 1 and 2). Field-line maps of several charges are the efield instrument.
final chargesSpec = InstrumentSpec(
  id: 'charges',
  chapter: '2nd PUC Physics · Electric charges and fields',
  modes: {'rub': _rub, 'coulomb': _coulomb, 'field': _field, 'dipole': _dipole, 'shell': _shell, 'potential': _potential, 'energy': _energy},
);

/// Capacitors (2nd PUC ch. 2) and the displacement current (ch. 8).
final capacitorSpec = InstrumentSpec(
  id: 'capacitor',
  chapter: '2nd PUC Physics · Electrostatic potential and capacitance',
  modes: {'dielectric': _dielectric, 'slab': _slab, 'rc': _rc, 'network': _network, 'displacement': _displacement},
);

const _e0 = 8.854e-12;

void _charge(Canvas c, Offset p, double q, {double r = 26, String? label}) {
  final col = q >= 0 ? IX.positive : IX.negative;
  IxPaint.handle(c, p, col, r: r);
  final sp = Paint()..color = Colors.white..strokeWidth = 4..strokeCap = StrokeCap.round;
  c.drawLine(p - const Offset(9, 0), p + const Offset(9, 0), sp);
  if (q >= 0) c.drawLine(p - const Offset(0, 9), p + const Offset(0, 9), sp);
  if (label != null) Draw.text(c, label, p + Offset(0, r + 22), size: 18, color: col, halo: true);
}

String _q(double q, String unit) => '${q > 0 ? '+' : (q < 0 ? '−' : '')}${fx(q.abs(), 1)} $unit';

// ── charging by rubbing ──

final _rub = ModeSpec(
  title: 'Rub a glass rod with silk',
  formula: 'q = ne,  total charge conserved',
  values: {'n': 25},
  controls: (v) => const [Sl('n', 'Electrons moved (× 10¹²)', 0, 100, div: 100, dp: 0)],
  presets: {'A few': {'n': 5}, 'Many': {'n': 60}},
  readouts: (v) {
    final n = v['n']!;
    return [Readout('Charge on glass rod', sg(0.1602 * n, 2), 'µC', IX.positive), Readout('Charge on silk', sg(-0.1602 * n, 2), 'µC', IX.negative), Readout('Total charge', '0', 'µC'), Readout('Mass gained by silk', fx(0.911 * n, 1), '× 10⁻¹⁸ kg')];
  },
  paint: (c, s, v, t) {
    final n = v['n']!.round();
    final cy = s.height * 0.42;
    // Glass rod (left) and silk cloth (right), each with its charges as dots.
    final rod = Rect.fromLTWH(80, cy - 50, s.width * 0.42, 100);
    c.drawRRect(RRect.fromRectAndRadius(rod, const Radius.circular(50)), Paint()..shader = ui.Gradient.linear(rod.topCenter, rod.bottomCenter, [const Color(0xFFF4F9FD), IX.glass, const Color(0xFFC9DCEB)], [0, 0.5, 1]));
    c.drawRRect(RRect.fromRectAndRadius(rod, const Radius.circular(50)), Draw.stroke(IX.glassEdge, 2));
    final silk = Path()..moveTo(s.width * 0.58, cy - 80)..cubicTo(s.width * 0.7, cy - 110, s.width * 0.8, cy - 40, s.width - 70, cy - 80)..lineTo(s.width - 90, cy + 90)..cubicTo(s.width * 0.8, cy + 120, s.width * 0.68, cy + 60, s.width * 0.6, cy + 95)..close();
    c.drawPath(silk, Draw.fill(const Color(0xFFF1E4F4)));
    c.drawPath(silk, Draw.stroke(const Color(0xFFB79CC2), 2));
    final shown = (n / 4).ceil();
    final rnd = math.Random(5);
    for (var i = 0; i < shown; i++) {
      final p = Offset(rod.left + 40 + rnd.nextDouble() * (rod.width - 80), rod.top + 20 + rnd.nextDouble() * 60);
      Draw.text(c, '+', p, size: 22, color: IX.positive);
    }
    for (var i = 0; i < shown; i++) {
      final p = Offset(s.width * 0.64 + rnd.nextDouble() * (s.width * 0.3), cy - 50 + rnd.nextDouble() * 110);
      c.drawCircle(p, 6, Draw.fill(IX.negative));
    }
    Draw.text(c, 'glass rod', rod.bottomCenter + const Offset(0, 30), size: 19);
    Draw.text(c, 'silk', Offset(s.width * 0.78, cy + 130), size: 19);
    IxPaint.arrow(c, Offset(rod.right - 40, cy - 110), Offset(s.width * 0.66, cy - 110), IX.negative, width: 4, head: 16);
    Draw.text(c, 'electrons move to the silk', Offset((rod.right + s.width * 0.66) / 2 - 20, cy - 140), size: 18, color: IX.negative);
    Draw.text(c, 'each symbol stands for 4 × 10¹² electrons', Offset(s.width / 2, s.height - 140), size: 16, color: IX.inkSoft);
    Draw.tag(c, 'Rod +${fx(0.1602 * n, 2)} µC   +   silk −${fx(0.1602 * n, 2)} µC   =   0', Offset(s.width / 2, s.height - 80), size: 22);
  },
);

// ── Coulomb's law ──

final _coulomb = ModeSpec(
  title: "Coulomb's law: force against distance",
  formula: 'F = k q₁q₂ / r²',
  values: {'q1': 1, 'q2': 1, 'r': 10},
  controls: (v) => const [Sl('q1', 'Charge q₁', -5, 5, unit: 'µC', div: 20), Sl('q2', 'Charge q₂', -5, 5, unit: 'µC', div: 20), Sl('r', 'Separation r', 1, 20, unit: 'cm', div: 38)],
  presets: {'Like charges': {'q1': 2, 'q2': 2}, 'Unlike charges': {'q1': 2, 'q2': -2}, 'Halve the distance': {'r': 5}},
  readouts: (v) {
    final f = 90 * v['q1']! * v['q2']! / (v['r']! * v['r']!);
    return [Readout('Force F', sg(f), 'N', f >= 0 ? IX.positive : IX.negative), Readout('Kind', f >= 0 ? 'Repulsion' : 'Attraction', ''), Readout('At 2r', sg(f / 4), 'N'), Readout('At r/2', sg(f * 4), 'N')];
  },
  paint: (c, s, v, t) {
    final q1 = v['q1']!, q2 = v['q2']!, r = v['r']!;
    final f = 90 * q1 * q2 / (r * r);
    final top = Rect.fromLTWH(0, 0, s.width, s.height * 0.38);
    final ppc = (top.width - 260) / 20, x1 = 130.0, y = top.center.dy + 10;
    final x2 = x1 + r * ppc;
    final len = (20 + 30 * math.log(1 + f.abs())).clamp(0.0, 150.0);
    final dir = f >= 0 ? -1.0 : 1.0;
    if (f.abs() > 1e-6) {
      Draw.force(c, Offset(x1 + dir * 34, y), Offset(x1 + dir * (34 + len), y), IX.ink, 'F', w: 5);
      Draw.force(c, Offset(x2 - dir * 34, y), Offset(x2 - dir * (34 + len), y), IX.ink, 'F', w: 5);
    }
    _charge(c, Offset(x1, y), q1, label: 'q₁ = ${_q(q1, 'µC')}');
    _charge(c, Offset(x2, y), q2, label: 'q₂ = ${_q(q2, 'µC')}');
    Draw.dim(c, Offset(x1, y - 70), Offset(x2, y - 70), 'r = ${fx(r, 1)} cm');
    final fm = math.max(1.0, 90 * 25 / 4);
    final p = Plot(Rect.fromLTRB(26, top.bottom, s.width - 26, s.height - 22), 0, 20, f >= 0 ? 0 : -math.min(fm, 90 * (q1 * q2).abs() / 4 + 1), f >= 0 ? math.min(fm, 90 * (q1 * q2).abs() / 4 + 1) : 0, xl: 'r (cm)', yl: 'F (N)', title: 'F = 90 q₁q₂ / r²  (q in µC, r in cm): positive = repulsion');
    p.frame(c);
    p.fn(c, (x) => 90 * q1 * q2 / (x * x), f >= 0 ? IX.positive : IX.negative, w: 4, a: 0.5);
    p.dot(c, r, f, IX.ink, label: '${fx(f, 2)} N');
    if (2 * r <= 20) p.dot(c, 2 * r, f / 4, IX.muted, label: '2r: F/4');
  },
);

// ── field of a point charge ──

final _field = ModeSpec(
  title: 'Field of a point charge',
  formula: 'E = kQ / r²',
  values: {'Q': 5, 'r': 30},
  controls: (v) => const [Sl('Q', 'Charge Q', -10, 10, unit: 'nC', div: 20), Sl('r', 'Distance r', 5, 50, unit: 'cm', div: 45)],
  presets: {'Q = 5 nC, 30 cm': {'Q': 5, 'r': 30}, 'Closer (15 cm)': {'Q': 5, 'r': 15}, 'Negative charge': {'Q': -5, 'r': 20}},
  readouts: (v) {
    final e = 90000 * v['Q']! / (v['r']! * v['r']!);
    return [Readout('E at r', fx(e.abs(), 1), 'N/C', IX.accent), Readout('Direction', v['Q']! >= 0 ? 'away from Q' : 'towards Q', ''), Readout('E at 2r', fx(e.abs() / 4, 1), 'N/C'), Readout('Force on 1 nC', fx(e.abs() * 1e-3, 3), 'µN', IX.green)];
  },
  paint: (c, s, v, t) {
    final q = v['Q']!, r = v['r']!;
    final left = Rect.fromLTWH(0, 0, s.width * 0.48, s.height);
    final o = Offset(left.width * 0.28, left.center.dy), ppc = (left.width - 140) / 55;
    // Radial field vectors on rings, length ∝ E (clamped).
    for (final rr in [8.0, 16.0, 24.0, 32.0, 40.0]) {
      for (var i = 0; i < 12; i++) {
        final a = i * math.pi / 6;
        final u = Offset(math.cos(a), math.sin(a));
        final p = o + u * rr * ppc;
        if (p.dx < 10 || p.dx > left.right - 10 || p.dy < 10 || p.dy > s.height - 10) continue;
        final len = (90000 * q.abs() / (rr * rr) / 60).clamp(6.0, 46.0);
        final d = q >= 0 ? u : -u;
        IxPaint.arrow(c, p - d * len / 2, p + d * len / 2, IX.ink.withValues(alpha: 0.45), width: 2.5, head: 10);
      }
    }
    _charge(c, o, q, r: 24, label: 'Q = ${_q(q, 'nC')}');
    final probe = o + Offset(r * ppc, 0);
    final e = 90000 * q / (r * r);
    Draw.force(c, probe, probe + Offset((q >= 0 ? 1 : -1) * (30 + 40 * math.log(1 + e.abs() / 200)), 0), IX.accent, 'E', w: 5);
    IxPaint.handle(c, probe, IX.amber, r: 12);
    Draw.dim(c, o + const Offset(0, 80), probe + const Offset(0, 80), 'r = ${fx(r, 0)} cm', off: 24);
    final p = Plot(Rect.fromLTRB(left.right, 26, s.width - 26, s.height - 26), 0, 50, 0, 90000 * q.abs() / 25 + 1, xl: 'r (cm)', yl: 'E (N/C)', title: 'Inverse square: E = 9 × 10⁴ Q / r²');
    p.frame(c);
    p.fn(c, (x) => 90000 * q.abs() / (x * x), IX.accent, w: 4, a: 1);
    p.dot(c, r, e.abs(), IX.accent, label: '${fx(e.abs(), 0)} N/C');
  },
);

// ── dipole in a uniform field ──

final _dipole = ModeSpec(
  title: 'An electric dipole in a uniform field',
  formula: 'τ = pE sin θ,  U = −pE cos θ',
  values: {'q': 4, 'd': 4, 'E': 5, 'th': 60},
  controls: (v) => const [Sl('q', 'Charge q', 1, 10, unit: 'nC', div: 9), Sl('d', 'Separation 2a', 1, 10, unit: 'cm', div: 9), Sl('E', 'Field E (× 10⁴ N/C)', 1, 10, div: 9), Sl('th', 'Angle θ with E', 0, 180, unit: '°', div: 36)],
  presets: {'Aligned (stable)': {'th': 0}, 'At 90° (largest τ)': {'th': 90}, 'Opposed (unstable)': {'th': 180}},
  readouts: (v) {
    final p = v['q']! * 1e-9 * v['d']! / 100, e = v['E']! * 1e4, th = rad(v['th']!);
    return [Readout('Dipole moment p', fx(p * 1e11, 2), '× 10⁻¹¹ C m'), Readout('Torque τ = pE sin θ', fx(p * e * math.sin(th) * 1e6, 3), 'µN m', IX.accent), Readout('Energy U = −pE cos θ', sg(-p * e * math.cos(th) * 1e6, 3), 'µJ', IX.positive), Readout('Net force', '0', 'N')];
  },
  paint: (c, s, v, t) {
    final th = rad(v['th']!), e = v['E']!;
    final left = Rect.fromLTWH(0, 0, s.width * 0.5, s.height);
    for (var y = 70.0; y < s.height - 40; y += 80) {
      IxPaint.arrow(c, Offset(40, y), Offset(left.right - 30, y), IX.ink.withValues(alpha: 0.18 + e * 0.03), width: 2.5, head: 14);
    }
    Draw.text(c, 'E', Offset(left.right - 50, 46), size: 22, color: IX.inkSoft);
    final o = left.center, half = 40 + v['d']! * 12;
    final u = Offset(math.cos(th), -math.sin(th));
    final pp = o + u * half, pn = o - u * half;
    c.drawLine(pn, pp, Draw.stroke(IX.inkSoft, 5));
    Draw.force(c, pp, pp + Offset(40 + e * 8, 0), IX.positive, '+qE', w: 4);
    Draw.force(c, pn, pn - Offset(40 + e * 8, 0), IX.negative, '−qE', w: 4);
    _charge(c, pp, 1, r: 20);
    _charge(c, pn, -1, r: 20);
    IxPaint.arrow(c, o - u * 30, o + u * 60, PX.violet, width: 4, head: 16);
    Draw.text(c, 'p', o + u * 80 + const Offset(0, -10), size: 20, color: PX.violet, halo: true);
    if (v['th']! > 3) Draw.angle(c, o, -th, 0, 70, 'θ');
    final p = Plot(Rect.fromLTRB(left.right, 26, s.width - 26, s.height - 26), 0, 180, -1.1, 1.1, xl: 'θ (°)', yl: 'τ, U (÷ pE)', title: 'Torque and potential energy');
    p.frame(c);
    p.fn(c, (x) => math.sin(rad(x)), IX.accent, w: 4, label: 'τ', labelAt: 90);
    p.fn(c, (x) => -math.cos(rad(x)), IX.positive, w: 4, label: 'U', labelAt: 150);
    p.vline(c, v['th']!, IX.muted);
    p.dot(c, v['th']!, math.sin(th), IX.accent);
    p.dot(c, v['th']!, -math.cos(th), IX.positive);
  },
);

// ── charged spherical shell ──

final _shell = ModeSpec(
  title: "Gauss's law: a charged shell",
  formula: 'Φ = q/ε₀;  E = 0 inside, kq/r² outside',
  values: {'q': 10, 'R': 10, 'r': 15},
  controls: (v) => const [Sl('q', 'Charge q', 1, 20, unit: 'nC', div: 19), Sl('R', 'Shell radius R', 5, 20, unit: 'cm', div: 15), Sl('r', 'Gaussian sphere radius r', 1, 40, unit: 'cm', div: 39)],
  presets: {'Gaussian sphere inside': {'r': 6}, 'Just outside': {'r': 11}, 'Far away': {'r': 35}},
  readouts: (v) {
    final q = v['q']!, rr = v['R']!, r = v['r']!;
    final inside = r < rr;
    return [Readout('Charge enclosed', inside ? '0' : fx(q, 0), 'nC', IX.amber), Readout('Flux Φ = q/ε₀', fx(inside ? 0 : 112.94 * q, 0), 'N m²/C'), Readout('E at r', fx(inside ? 0 : 90000 * q / (r * r), 0), 'N/C', IX.accent), Readout('Flux through a cube face', fx(112.94 * q / 6, 1), 'N m²/C')];
  },
  paint: (c, s, v, t) {
    final q = v['q']!, rr = v['R']!, r = v['r']!;
    final left = Rect.fromLTWH(0, 0, s.width * 0.45, s.height);
    final o = left.center, ppc = (left.height - 100) / 2 / 40;
    c.drawCircle(o, rr * ppc, Draw.fill(IX.positive.withValues(alpha: 0.06)));
    c.drawCircle(o, rr * ppc, Draw.stroke(IX.positive, 5));
    for (var i = 0; i < 16; i++) {
      final a = i * math.pi / 8;
      Draw.text(c, '+', o + Offset(math.cos(a), math.sin(a)) * rr * ppc, size: 18, color: Colors.white);
    }
    for (var i = 0; i < 16; i++) {
      final a = i * math.pi / 8 + math.pi / 16;
      final u = Offset(math.cos(a), math.sin(a));
      IxPaint.arrow(c, o + u * (rr * ppc + 10), o + u * math.min(left.width / 2 - 10, rr * ppc + 120), IX.ink.withValues(alpha: 0.35), width: 2, head: 9);
    }
    final dp = Paint()..color = IX.amber..strokeWidth = 3.5..style = PaintingStyle.stroke;
    for (var a = 0.0; a < 2 * math.pi; a += 0.12) {
      c.drawArc(Rect.fromCircle(center: o, radius: r * ppc), a, 0.07, false, dp);
    }
    Draw.text(c, r < rr ? 'no charge inside: Φ = 0, E = 0' : 'encloses q: Φ = q/ε₀', o + Offset(0, -r * ppc - 22), size: 18, color: IX.amber, halo: true);
    final p = Plot(Rect.fromLTRB(left.right, 26, s.width - 26, s.height - 26), 0, 40, 0, 90000 * q / (rr * rr) * 1.15, xl: 'r (cm)', yl: 'E (N/C)', title: 'E is zero inside and falls as 1/r² outside');
    p.frame(c);
    p.fn(c, (x) => x < rr ? 0 : 90000 * q / (x * x), IX.accent, w: 4);
    p.vline(c, rr, IX.positive, label: 'shell');
    p.dot(c, r, r < rr ? 0 : 90000 * q / (r * r), IX.amber);
  },
);

// ── potential of a point charge ──

final _potential = ModeSpec(
  title: 'Potential around a point charge',
  chapter: '2nd PUC Physics · Electrostatic potential and capacitance',
  formula: 'V = kq/r,  E = kq/r²',
  values: {'q': 2, 'r': 10, 'q0': 1},
  controls: (v) => const [Sl('q', 'Charge q', -10, 10, unit: 'nC', div: 20), Sl('r', 'Distance of P', 2, 50, unit: 'cm', div: 48), Sl('q0', 'Test charge q₀', 1, 5, unit: 'nC', div: 4)],
  presets: {'q = +2 nC': {'q': 2}, 'q = −2 nC': {'q': -2}, 'q = 5 nC at 10 cm': {'q': 5, 'r': 10}},
  readouts: (v) {
    final vp = 900 * v['q']! / v['r']!, ep = 90000 * v['q']! / (v['r']! * v['r']!);
    return [Readout('Potential V at P', sg(vp, 1), 'V', IX.accent), Readout('Field E at P', fx(ep.abs(), 0), 'V/m', IX.positive), Readout('Work to bring q₀ from ∞', sg(v['q0']! * vp, 1), 'nJ'), Readout('V at 2r', sg(vp / 2, 1), 'V')];
  },
  paint: (c, s, v, t) {
    final q = v['q']!, r = v['r']!;
    final left = Rect.fromLTWH(0, 0, s.width * 0.45, s.height);
    final o = Offset(left.width * 0.32, left.center.dy), ppc = (left.width - 120) / 55;
    for (final lv in [300.0, 600.0, 1200.0, 2400.0]) {
      final rr = 900 * q.abs() / lv;
      if (rr * ppc < 30) continue;
      final pa = Paint()..color = (q >= 0 ? IX.positive : IX.negative).withValues(alpha: 0.5)..strokeWidth = 2..style = PaintingStyle.stroke;
      for (var a = 0.0; a < 2 * math.pi; a += 0.1) {
        c.drawArc(Rect.fromCircle(center: o, radius: rr * ppc), a, 0.06, false, pa);
      }
      Draw.text(c, '${q >= 0 ? '' : '−'}${fx(lv, 0)} V', o + Offset(0, -rr * ppc - 12), size: 14, color: q >= 0 ? IX.positive : IX.negative, halo: true);
    }
    _charge(c, o, q, r: 22);
    final pp = o + Offset(r * ppc * math.cos(0.5), -r * ppc * math.sin(0.5));
    final ep = 90000 * q / (r * r);
    final u = (pp - o) / (pp - o).distance;
    Draw.force(c, pp, pp + u * (q >= 0 ? 1 : -1) * (30 + 30 * math.log(1 + ep.abs() / 300)), IX.accent, 'E', w: 4);
    IxPaint.handle(c, pp, IX.amber, r: 12);
    Draw.text(c, 'P', pp + const Offset(16, 16), size: 19);
    final p = Plot(Rect.fromLTRB(left.right, 26, s.width - 26, s.height - 26), 0, 50, 0, 1, xl: 'r (cm)', yl: 'relative to value at 2 cm', title: 'V falls as 1/r, E faster as 1/r²');
    p.frame(c);
    p.fn(c, (x) => 2 / x, IX.accent, w: 4, a: 2, label: 'V', labelAt: 12);
    p.fn(c, (x) => 4 / (x * x), IX.positive, w: 4, a: 2, label: 'E', labelAt: 6);
    p.vline(c, r, IX.muted);
  },
);

// ── energy of two charges ──

final _energy = ModeSpec(
  title: 'Potential energy of two charges',
  chapter: '2nd PUC Physics · Electrostatic potential and capacitance',
  formula: 'U = k q₁q₂ / r',
  values: {'q1': 3, 'q2': -2, 'r': 18},
  controls: (v) => const [Sl('q1', 'Charge q₁', -10, 10, unit: 'µC', div: 20), Sl('q2', 'Charge q₂', -10, 10, unit: 'µC', div: 20), Sl('r', 'Separation r', 2, 50, unit: 'cm', div: 48)],
  presets: {'Unlike (bound)': {'q1': 3, 'q2': -2}, 'Like (pushed together)': {'q1': 3, 'q2': 2}, 'Halve r': {'r': 9}},
  readouts: (v) {
    final u = 0.9 * v['q1']! * v['q2']! / v['r']!;
    return [Readout('Potential energy U', sg(u, 3), 'J', u >= 0 ? IX.positive : IX.negative), Readout('Work to separate to ∞', sg(-u, 3), 'J'), Readout('Force', sg(90 * v['q1']! * v['q2']! / (v['r']! * v['r']!), 2), 'N'), Readout('U at r/2', sg(2 * u, 3), 'J')];
  },
  paint: (c, s, v, t) {
    final q1 = v['q1']!, q2 = v['q2']!, r = v['r']!;
    final u = 0.9 * q1 * q2 / r;
    final top = Rect.fromLTWH(0, 0, s.width, s.height * 0.36);
    final ppc = (top.width - 260) / 50, x1 = 130.0, y = top.center.dy + 10;
    _charge(c, Offset(x1, y), q1, label: 'q₁ = ${_q(q1, 'µC')}');
    _charge(c, Offset(x1 + r * ppc, y), q2, label: 'q₂ = ${_q(q2, 'µC')}');
    Draw.dim(c, Offset(x1, y - 70), Offset(x1 + r * ppc, y - 70), 'r = ${fx(r, 0)} cm');
    final um = (0.9 * q1 * q2 / 2).abs() * 0.6 + 0.1;
    final p = Plot(Rect.fromLTRB(26, top.bottom, s.width - 26, s.height - 22), 0, 50, q1 * q2 >= 0 ? 0 : -um, q1 * q2 >= 0 ? um : 0, xl: 'r (cm)', yl: 'U (J)', title: u >= 0 ? 'Like charges: U > 0, rises as they come closer' : 'Unlike charges: U < 0, the pair is bound');
    p.frame(c);
    p.fn(c, (x) => 0.9 * q1 * q2 / x, u >= 0 ? IX.positive : IX.negative, w: 4, a: 1);
    p.dot(c, r, u, IX.ink, label: '${fx(u, 3)} J');
  },
);

// ───────────────────────────── capacitor ─────────────────────────────

/// Parallel plates with optional dielectric slab of [k] filling [fill] of the gap.
void _plates(Canvas c, Rect gap, double qFrac, {double k = 1, double fill = 0, double eFrac = 1}) {
  final pl = Draw.fill(PX.iron);
  c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(gap.left - 18, gap.top - 20, 18, gap.height + 40), const Radius.circular(3)), pl);
  c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(gap.right, gap.top - 20, 18, gap.height + 40), const Radius.circular(3)), pl);
  if (fill > 0) {
    final w = gap.width * fill;
    final slab = Rect.fromLTWH(gap.center.dx - w / 2, gap.top - 4, w, gap.height + 8);
    c.drawRect(slab, Draw.fill(const Color(0xFFE6E0F3)));
    c.drawRect(slab, Draw.stroke(PX.violet.withValues(alpha: 0.5), 2));
    Draw.text(c, 'K = ${fx(k, 1)}', slab.center + const Offset(0, -0), size: 18, color: PX.violet, halo: true);
    // Bound charges on the slab faces.
    final nb = (8 * qFrac * (1 - 1 / k)).round();
    for (var i = 0; i < nb; i++) {
      final yy = gap.top + 20 + i * (gap.height - 40) / math.max(1, nb - 1);
      Draw.text(c, '−', Offset(slab.left + 10, yy), size: 18, color: IX.negative);
      Draw.text(c, '+', Offset(slab.right - 10, yy), size: 18, color: IX.positive);
    }
  }
  final n = (10 * qFrac).round().clamp(0, 16);
  for (var i = 0; i < n; i++) {
    final yy = gap.top + 10 + i * (gap.height - 20) / math.max(1, n - 1);
    Draw.text(c, '+', Offset(gap.left - 9, yy), size: 18, color: Colors.white);
    Draw.text(c, '−', Offset(gap.right + 9, yy), size: 18, color: Colors.white);
  }
  // Field lines across the gap, sparser where E is weaker.
  final lines = (8 * eFrac).round().clamp(1, 12);
  for (var i = 0; i < lines; i++) {
    final yy = gap.top + (i + 0.5) * gap.height / lines;
    IxPaint.arrow(c, Offset(gap.left + 8, yy), Offset(gap.right - 8, yy), IX.accent.withValues(alpha: 0.55), width: 2, head: 10);
  }
}

final _dielectric = ModeSpec(
  title: 'A dielectric in a capacitor',
  formula: 'C = K C₀',
  values: {'K': 4, 'V0': 6, 'slab': 1, 'bat': 1},
  controls: (v) => const [Sl('K', 'Dielectric constant K', 1, 10, div: 18), Sl('V0', 'Battery voltage', 2, 12, unit: 'V', div: 10), Seg('slab', 'Slab', ['Out', 'Inserted']), Seg('bat', 'Battery', ['Removed first (Q fixed)', 'Kept connected (V fixed)'])],
  presets: {'Battery connected': {'bat': 1, 'slab': 1}, 'Battery removed': {'bat': 0, 'slab': 1}, 'No slab': {'slab': 0}},
  readouts: (v) {
    final (cc, q, vv, e) = _diel(v);
    return [Readout('Capacitance', fx(cc * 1e12, 1), 'pF', IX.accent), Readout('Charge Q', fx(q * 1e9, 3), 'nC', IX.positive), Readout('Voltage V', fx(vv, 2), 'V'), Readout('Field in the gap', fx(e / 1000, 2), 'kV/m')];
  },
  paint: (c, s, v, t) {
    final (_, q, _, e) = _diel(v);
    final k = v['K']!, on = v['slab'] == 1;
    final left = Rect.fromLTWH(0, 0, s.width * 0.5, s.height);
    final gap = Rect.fromCenter(center: Offset(left.center.dx, left.center.dy - 30), width: 260, height: 360);
    final q0 = _e0 * 0.01 / 1e-3 * v['V0']!;
    _plates(c, gap, q / q0 / 1.0 * 0.5, k: k, fill: on ? 0.7 : 0, eFrac: e / (v['V0']! / 1e-3));
    if (v['bat'] == 1) {
      Draw.line(c, [gap.centerLeft - const Offset(18, 0), Offset(gap.left - 90, gap.center.dy), Offset(gap.left - 90, gap.bottom + 110), Offset(gap.center.dx - 40, gap.bottom + 110)]);
      Draw.cell(c, Offset(gap.center.dx - 40, gap.bottom + 110), Offset(gap.center.dx + 40, gap.bottom + 110), label: '${fx(v['V0']!, 0)} V', labelOff: const Offset(0, 40));
      Draw.line(c, [Offset(gap.center.dx + 40, gap.bottom + 110), Offset(gap.right + 90, gap.bottom + 110), Offset(gap.right + 90, gap.center.dy), gap.centerRight + const Offset(18, 0)]);
    }
    Draw.text(c, 'plates 0.01 m², 1 mm apart (gap drawn wide)', Offset(left.center.dx, 40), size: 16, color: IX.inkSoft);
    final kk = v['K']!;
    final p = Plot(Rect.fromLTRB(left.right, 26, s.width - 26, s.height - 26), 1, 10, 0, 1.05, xl: 'K', yl: 'E / E₀', title: v['bat'] == 1 ? 'V fixed: Q grows K times, E unchanged' : 'Q fixed: E and V fall to 1/K');
    p.frame(c);
    p.fn(c, (x) => v['bat'] == 1 ? 1 : 1 / x, IX.accent, w: 4, label: 'E/E₀', labelAt: 8);
    p.fn(c, (x) => 1 - 1 / x, PX.violet, w: 3, dash: true, label: 'bound / free charge', labelAt: 6);
    p.dot(c, kk, on ? (v['bat'] == 1 ? 1 : 1 / kk) : 1, IX.accent);
  },
);

(double, double, double, double) _diel(V v) {
  final c0 = _e0 * 0.01 / 1e-3;
  final k = v['slab'] == 1 ? v['K']! : 1.0;
  final cc = k * c0;
  if (v['bat'] == 1) {
    final q = cc * v['V0']!;
    return (cc, q, v['V0']!, v['V0']! / 1e-3);
  }
  final q = c0 * v['V0']!;
  final vv = q / cc;
  return (cc, q, vv, vv / 1e-3);
}

final _slab = ModeSpec(
  title: 'Capacitor with a dielectric slab',
  formula: 'C = ε₀A / (d − t + t/K)',
  values: {'A': 60, 'K': 4, 't': 1.5},
  controls: (v) => const [Sl('A', 'Plate area A', 10, 200, unit: 'cm²', div: 19), Sl('K', 'Dielectric constant K', 1, 10, div: 18), Sl('t', 'Slab thickness t', 0, 3, unit: 'mm', div: 30)],
  presets: {'No slab': {'t': 0}, 'Half filled': {'t': 1.5}, 'Filled': {'t': 3}},
  readouts: (v) {
    final a = v['A']!, k = v['K']!, th = v['t']!;
    return [Readout('C without slab', fx(0.8854 * a / 3, 2), 'pF'), Readout('C with the slab', fx(0.8854 * a / (3 - th + th / k), 2), 'pF', IX.accent), Readout('C, gap filled', fx(k * 0.8854 * a / 3, 2), 'pF')];
  },
  paint: (c, s, v, t) {
    final a = v['A']!, k = v['K']!, th = v['t']!;
    final left = Rect.fromLTWH(0, 0, s.width * 0.42, s.height);
    final gap = Rect.fromCenter(center: left.center, width: 300, height: 120 + a * 1.6);
    _plates(c, gap, 0.6, k: k, fill: th / 3, eFrac: 0.8);
    Draw.dim(c, gap.bottomLeft + const Offset(0, 60), gap.bottomRight + const Offset(0, 60), 'd = 3 mm (drawn 100 px per mm)', off: 24);
    final p = Plot(Rect.fromLTRB(left.right, 26, s.width - 26, s.height - 26), 0, 3, 0, k * 0.8854 * a / 3 * 1.1, xl: 't (mm)', yl: 'C (pF)', title: 'C rises as the slab fills the gap');
    p.frame(c);
    p.fn(c, (x) => 0.8854 * a / (3 - x + x / k), IX.accent, w: 4);
    p.dot(c, th, 0.8854 * a / (3 - th + th / k), IX.accent);
  },
);

final _rc = ModeSpec(
  title: 'Charging and discharging a capacitor',
  formula: 'V = E(1 − e^(−t/RC)),  τ = RC',
  values: {'R': 5, 'C': 400, 'E': 6, 'charge': 1, 'tt': 2},
  controls: (v) => const [Sl('R', 'Resistance R', 1, 10, unit: 'kΩ', div: 9), Sl('C', 'Capacitance C', 100, 1000, unit: 'µF', div: 18), Sl('E', 'Battery E', 2, 12, unit: 'V', div: 10), Sl('tt', 'Time t', 0, 20, unit: 's', div: 80), Seg('charge', 'Switch', ['Discharging', 'Charging'])],
  presets: {'Charging, t = τ': {'charge': 1, 'tt': 2}, 'Charging, t = 3τ': {'charge': 1, 'tt': 6}, 'Discharging, t = τ': {'charge': 0, 'tt': 2}},
  readouts: (v) {
    final tau = v['R']! * 1e3 * v['C']! * 1e-6;
    final f = math.exp(-v['tt']! / tau);
    final vc = v['charge'] == 1 ? v['E']! * (1 - f) : v['E']! * f;
    return [Readout('Time constant RC', fx(tau, 2), 's', IX.amber), Readout('Capacitor voltage', fx(vc, 2), 'V', IX.accent), Readout('Current', fx(v['E']! / v['R']! * f, 3), 'mA', IX.positive), Readout('t / τ', fx(v['tt']! / tau, 2), '')];
  },
  paint: (c, s, v, t) {
    final tau = v['R']! * 1e3 * v['C']! * 1e-6;
    final e = v['E']!, ch = v['charge'] == 1, tt = v['tt']!;
    final f = math.exp(-tt / tau);
    final left = Rect.fromLTWH(0, 0, s.width * 0.4, s.height);
    // Circuit: battery — switch — R — C loop.
    final a = Offset(80, 140), b = Offset(left.right - 40, 140), cc = Offset(left.right - 40, s.height * 0.62), d = Offset(80, s.height * 0.62);
    Draw.resistor(c, a, b, label: 'R = ${fx(v['R']!, 0)} kΩ');
    Draw.line(c, [b, Offset(b.dx, (b.dy + cc.dy) / 2 - 40)]);
    Draw.capacitor(c, Offset(b.dx, (b.dy + cc.dy) / 2 - 40), Offset(b.dx, (b.dy + cc.dy) / 2 + 40), label: 'C', labelOff: const Offset(40, 0));
    Draw.line(c, [Offset(b.dx, (b.dy + cc.dy) / 2 + 40), cc, Offset(left.center.dx + 50, cc.dy)]);
    final sw = Offset(left.center.dx - 20, cc.dy);
    Draw.node(c, sw + const Offset(70, 0));
    Draw.node(c, sw);
    c.drawLine(sw, sw + Offset(66, ch ? 0 : -36), Draw.stroke(IX.ink, 4));
    Draw.line(c, [sw, d, Offset(d.dx, (a.dy + d.dy) / 2 + 40)]);
    if (ch) {
      Draw.cell(c, Offset(d.dx, (a.dy + d.dy) / 2 + 40), Offset(d.dx, (a.dy + d.dy) / 2 - 40), label: '${fx(e, 0)} V', labelOff: const Offset(-50, 0));
    } else {
      Draw.line(c, [Offset(d.dx, (a.dy + d.dy) / 2 + 40), Offset(d.dx, (a.dy + d.dy) / 2 - 40)]);
    }
    Draw.line(c, [Offset(d.dx, (a.dy + d.dy) / 2 - 40), a]);
    Draw.text(c, ch ? 'charging through R' : 'discharging through R', Offset(left.center.dx, s.height * 0.62 + 50), size: 18, color: IX.inkSoft);
    final pv = Plot(Rect.fromLTRB(left.right, 26, s.width - 26, s.height / 2 - 6), 0, 20, 0, 12.5, xl: 't (s)', yl: 'V_C (V)', title: ch ? 'Voltage rises 63 % of the way in one τ' : 'Voltage falls to 37 % in one τ');
    pv.frame(c);
    pv.fn(c, (x) => ch ? e * (1 - math.exp(-x / tau)) : e * math.exp(-x / tau), IX.accent, w: 4);
    pv.vline(c, tau, IX.amber, label: 'τ');
    pv.dot(c, tt, ch ? e * (1 - f) : e * f, IX.accent);
    final pi = Plot(Rect.fromLTRB(left.right, s.height / 2 + 6, s.width - 26, s.height - 26), 0, 20, 0, 12.5, xl: 't (s)', yl: 'I (mA)', title: 'Current is largest at the start');
    pi.frame(c);
    pi.fn(c, (x) => e / v['R']! * math.exp(-x / tau), IX.positive, w: 4);
    pi.dot(c, tt, e / v['R']! * f, IX.positive);
  },
);

final _network = ModeSpec(
  title: 'Capacitors in series and parallel',
  formula: '1/C = 1/C₁ + 1/C₂;  C = C₁ + C₂',
  values: {'C1': 6, 'C2': 3, 'V': 12, 'par': 0},
  controls: (v) => const [Seg('par', 'Connection', ['Series', 'Parallel']), Sl('C1', 'C₁', 1, 20, unit: 'µF', div: 19), Sl('C2', 'C₂', 1, 20, unit: 'µF', div: 19), Sl('V', 'Battery V', 1, 24, unit: 'V', div: 23)],
  presets: {'Series': {'par': 0}, 'Parallel': {'par': 1}, 'Equal capacitors': {'C1': 4, 'C2': 4}},
  readouts: (v) {
    final (ceq, q1, q2) = _net(v);
    return [Readout('Equivalent C', fx(ceq, 2), 'µF', IX.accent), Readout('Charge on C₁', fx(q1, 1), 'µC', IX.positive), Readout('Charge on C₂', fx(q2, 1), 'µC', IX.green), Readout('Energy ½CV²', fx(0.5 * ceq * v['V']! * v['V']!, 0), 'µJ', IX.amber)];
  },
  paint: (c, s, v, t) {
    final (ceq, q1, q2) = _net(v);
    final par = v['par'] == 1;
    final left = Rect.fromLTWH(0, 0, s.width * 0.48, s.height);
    final y0 = 120.0, y1 = s.height * 0.55;
    final xl = 90.0, xr = left.right - 60;
    if (par) {
      Draw.line(c, [Offset(xl, y1), Offset(xl, y0), Offset(xr, y0), Offset(xr, y1)]);
      final mx = (xl + xr) / 2;
      for (final (i, x) in [mx - 90, mx + 90].indexed) {
        Draw.node(c, Offset(x, y0));
        Draw.capacitor(c, Offset(x, y0), Offset(x, y1 - 120), label: 'C${i == 0 ? '₁' : '₂'} = ${fx(v['C${i + 1}']!, 0)} µF', labelOff: Offset(i == 0 ? -80 : 80, 0));
        Draw.line(c, [Offset(x, y1 - 120), Offset(x, y1 - 80)]);
        Draw.node(c, Offset(x, y1 - 80));
      }
      Draw.line(c, [Offset(mx - 90, y1 - 80), Offset(mx + 90, y1 - 80)]);
      Draw.line(c, [Offset(mx, y1 - 80), Offset(mx, y1), Offset(xr, y1)]);
      Draw.line(c, [Offset(xl, y1), Offset(mx - 120, y1)]);
      Draw.cell(c, Offset(mx - 120, y1), Offset(mx - 30, y1), label: '${fx(v['V']!, 0)} V', labelOff: const Offset(0, 40));
      Draw.line(c, [Offset(mx - 30, y1), Offset(mx, y1)]);
    } else {
      final xm = (xl + xr) / 2;
      Draw.capacitor(c, Offset(xl, y0), Offset(xm, y0), label: 'C₁ = ${fx(v['C1']!, 0)} µF', labelOff: const Offset(0, -40));
      Draw.capacitor(c, Offset(xm, y0), Offset(xr, y0), label: 'C₂ = ${fx(v['C2']!, 0)} µF', labelOff: const Offset(0, -40));
      Draw.line(c, [Offset(xr, y0), Offset(xr, y1), Offset(xm + 45, y1)]);
      Draw.cell(c, Offset(xm + 45, y1), Offset(xm - 45, y1), label: '${fx(v['V']!, 0)} V', labelOff: const Offset(0, 40));
      Draw.line(c, [Offset(xm - 45, y1), Offset(xl, y1), Offset(xl, y0)]);
      Draw.text(c, 'V₁ = ${fx(q1 / v['C1']!, 2)} V', Offset((xl + xm) / 2, y0 + 50), size: 17, color: IX.positive);
      Draw.text(c, 'V₂ = ${fx(q2 / v['C2']!, 2)} V', Offset((xm + xr) / 2, y0 + 50), size: 17, color: IX.green);
    }
    Draw.bars(c, Rect.fromLTRB(26, y1 + 70, left.right - 10, s.height - 22), [('Q₁', q1, IX.positive), ('Q₂', q2, IX.green), ('Q total', par ? q1 + q2 : q1, IX.accent)], title: 'Charge (µC)', dp: 1);
    final c1 = v['C1']!, c2 = v['C2']!;
    final p = Plot(Rect.fromLTRB(left.right + 10, 26, s.width - 26, s.height - 26), 0, 24, 0, 0.5 * (c1 + c2) * 24 * 24 * 1.05, xl: 'V (volt)', yl: 'U (µJ)', title: 'Energy stored against battery voltage');
    p.frame(c);
    p.fn(c, (x) => 0.5 * (c1 + c2) * x * x, IX.accent, w: par ? 4.5 : 2.5, label: 'parallel', labelAt: 20);
    p.fn(c, (x) => 0.5 * c1 * c2 / (c1 + c2) * x * x, IX.positive, w: par ? 2.5 : 4.5, label: 'series', labelAt: 22);
    p.dot(c, v['V']!, 0.5 * ceq * v['V']! * v['V']!, par ? IX.accent : IX.positive);
  },
);

(double, double, double) _net(V v) {
  final c1 = v['C1']!, c2 = v['C2']!, vv = v['V']!;
  if (v['par'] == 1) return (c1 + c2, c1 * vv, c2 * vv);
  final cs = c1 * c2 / (c1 + c2);
  return (cs, cs * vv, cs * vv);
}

final _displacement = ModeSpec(
  title: 'Displacement current in a capacitor',
  chapter: '2nd PUC Physics · Electromagnetic waves',
  formula: 'i_d = ε₀ dΦ_E/dt = i',
  values: {'R': 100, 'C': 10, 'tt': 0.5},
  controls: (v) => const [Sl('R', 'Resistance R', 10, 1000, unit: 'kΩ', div: 99), Sl('C', 'Capacitance C', 1, 50, unit: 'µF', div: 49), Sl('tt', 'Time t', 0, 5, unit: 's', div: 100)],
  presets: {'Just switched on': {'tt': 0.05}, 'After one τ': {'tt': 1}, 'Nearly charged': {'tt': 4}},
  readouts: (v) {
    final tau = v['R']! * 1e3 * v['C']! * 1e-6;
    final i = 10 / (v['R']! * 1e3) * math.exp(-v['tt']! / tau);
    return [Readout('Conduction current i', fx(i * 1e6, 2), 'µA', IX.accent), Readout('Displacement current i_d', fx(i * 1e6, 2), 'µA', PX.violet), Readout('Time constant RC', fx(tau, 2), 's')];
  },
  paint: (c, s, v, t) {
    final tau = v['R']! * 1e3 * v['C']! * 1e-6;
    final i0 = 10 / (v['R']! * 1e3) * 1e6;
    final frac = math.exp(-v['tt']! / tau);
    final left = Rect.fromLTWH(0, 0, s.width * 0.48, s.height);
    final gap = Rect.fromCenter(center: Offset(left.center.dx, s.height * 0.45), width: 120, height: 260);
    _plates(c, gap, (1 - frac) * 1.2, eFrac: (1 - frac).clamp(0.12, 1));
    // Changing E between the plates: the displacement current (violet band).
    c.drawRect(Rect.fromCenter(center: gap.center, width: gap.width - 20, height: 30 + 60 * frac), Draw.fill(PX.violet.withValues(alpha: 0.18)));
    Draw.text(c, 'i_d', gap.center + const Offset(0, -0), size: 22, color: PX.violet, halo: true);
    Draw.line(c, [gap.centerLeft - const Offset(18, 0), Offset(60, gap.center.dy)]);
    Draw.line(c, [gap.centerRight + const Offset(18, 0), Offset(left.right - 30, gap.center.dy)]);
    IxPaint.arrow(c, Offset(80, gap.center.dy - 26), Offset(80 + 40 + 60 * frac, gap.center.dy - 26), IX.accent, width: 4, head: 14);
    Draw.text(c, 'i', Offset(100, gap.center.dy - 50), size: 22, color: IX.accent);
    IxPaint.arrow(c, Offset(left.right - 150, gap.center.dy - 26), Offset(left.right - 110 + 60 * frac, gap.center.dy - 26), IX.accent, width: 4, head: 14);
    Draw.text(c, 'No charge crosses the gap, but the changing electric flux there carries the same current.', Offset(left.center.dx, s.height - 60), size: 16, color: IX.inkSoft);
    final p = Plot(Rect.fromLTRB(left.right, 26, s.width - 26, s.height - 26), 0, 5, 0, i0 * 1.1, xl: 't (s)', yl: 'current (µA)', title: 'i in the wires = i_d between the plates (10 V cell)');
    p.frame(c);
    p.fn(c, (x) => i0 * math.exp(-x / tau), IX.accent, w: 5);
    p.fn(c, (x) => i0 * math.exp(-x / tau), PX.violet, w: 2.5, dash: true);
    p.dot(c, v['tt']!, i0 * frac, PX.violet);
  },
);
