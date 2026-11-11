import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'kit.dart';

/// Wave optics (2nd PUC ch. 10): Huygens' construction, refraction by wavelets, Young's double
/// slit, single-slit diffraction and polarisation (Malus's law, Brewster's angle).
final waveOpticsSpec = InstrumentSpec(
  id: 'waveoptics',
  chapter: '2nd PUC Physics · Wave optics',
  modes: {'huygens': _huygens, 'wavelets': _wavelets, 'young': _young, 'single': _single, 'polar': _polar},
);

// ── Huygens ──

final _huygens = ModeSpec(
  title: "Huygens' construction",
  formula: 'each point is a source of wavelets of radius vt',
  values: {'v': 3, 'k': 7, 'R': 10},
  animate: true,
  controls: (v) => const [Sl('v', 'Wave speed v', 1, 5, unit: 'cm/s', div: 8), Sl('k', 'Number of wavelets', 3, 9, div: 6, dp: 0), Sl('R', 'Distance from source R', 5, 100, unit: 'cm', div: 95)],
  presets: {'Near the source': {'R': 5}, 'Far away (almost plane)': {'R': 100}},
  readouts: (v) {
    final r = v['R']!;
    final sag = r - math.sqrt(math.max(0, r * r - 25));
    return [Readout('Wavelet radius after 2 s', fx(v['v']! * 2, 1), 'cm', IX.accent), Readout('Bulge of a 10 cm piece', fx(sag * 10, 2), 'mm', IX.positive), Readout('New wavefront radius', fx(r + v['v']! * 2, 1), 'cm')];
  },
  paint: (c, s, v, t) {
    const ppc = 40.0;
    final r = v['R']!, k = v['k']!.round();
    final o = Offset(260 - r * ppc, s.height / 2);
    final grow = (t % 4) / 2 * v['v']! * ppc; // radius after up to 2 s
    final half = math.min(5.0, r) * ppc * 1.6;
    final angMax = math.asin((half / (r * ppc)).clamp(0, 1));
    final front = Path();
    final next = Path();
    for (var i = 0; i <= 60; i++) {
      final a = -angMax + 2 * angMax * i / 60;
      final p0 = o + Offset(math.cos(a), math.sin(a)) * r * ppc;
      final p1 = o + Offset(math.cos(a), math.sin(a)) * (r * ppc + grow);
      i == 0 ? front.moveTo(p0.dx, p0.dy) : front.lineTo(p0.dx, p0.dy);
      i == 0 ? next.moveTo(p1.dx, p1.dy) : next.lineTo(p1.dx, p1.dy);
    }
    c.drawPath(front, Draw.stroke(IX.accent, 4));
    for (var i = 0; i < k; i++) {
      final a = -angMax + 2 * angMax * (i + 0.5) / k;
      final p0 = o + Offset(math.cos(a), math.sin(a)) * r * ppc;
      c.drawCircle(p0, 6, Draw.fill(IX.accent));
      c.drawCircle(p0, grow, Draw.stroke(IX.accent.withValues(alpha: 0.35), 2));
    }
    c.drawPath(next, Draw.stroke(IX.positive, 4));
    Draw.text(c, 'old wavefront', o + Offset(r * ppc - 70, -half - 30), size: 17, color: IX.accent);
    Draw.text(c, 'new wavefront: the envelope', o + Offset(r * ppc + grow + 70, half + 30), size: 17, color: IX.positive);
    if (o.dx > 0) Draw.ball(c, o, 9, IX.amber);
    Draw.caption(c, 'Far from the source a spherical wavefront is almost flat.');
  },
);

// ── refraction by wavelets ──

final _wavelets = ModeSpec(
  title: 'Refraction explained by wavelets',
  formula: 'sin i / sin r = v₁/v₂ = n₂/n₁',
  values: {'i': 40, 'n1': 1, 'n2': 1.5, 'lam': 600},
  controls: (v) => const [Sl('i', 'Angle of incidence i', 10, 80, unit: '°', div: 70), Sl('n1', 'n₁', 1, 2, div: 20), Sl('n2', 'n₂', 1, 2.5, div: 30), Sl('lam', 'Vacuum wavelength λ₀', 400, 700, unit: 'nm', div: 30)],
  presets: {'Air to glass': {'n1': 1, 'n2': 1.5}, 'Air to water': {'n2': 1.33}},
  readouts: (v) {
    final sr = v['n1']! * math.sin(rad(v['i']!)) / v['n2']!;
    return [Readout('Angle of refraction r', sr > 1 ? 'TIR' : fx(deg(math.asin(sr)), 1), '°', IX.accent), Readout('λ in medium 2', fx(v['lam']! / v['n2']!, 0), 'nm', IX.positive), Readout('Speed in medium 2', fx(3 / v['n2']!, 2), '× 10⁸ m/s'), Readout('Frequency', 'unchanged', '')];
  },
  paint: (c, s, v, t) {
    final i = rad(v['i']!), n1 = v['n1']!, n2 = v['n2']!;
    final sr = n1 * math.sin(i) / n2;
    final y0 = s.height * 0.55;
    c.drawRect(Rect.fromLTRB(0, y0, s.width, s.height), Draw.fill(const Color(0xFFDCEAF6)));
    c.drawLine(Offset(0, y0), Offset(s.width, y0), Draw.stroke(IX.glassEdge, 2));
    final a = Offset(s.width * 0.3, y0);
    const ab = 400.0;
    final b = a + const Offset(ab, 0);
    // Incident wavefront AC (C still in medium 1), perpendicular to the ray direction.
    final dir = Offset(math.sin(i), math.cos(i));
    final cpt = b - dir * (ab * math.sin(i));
    c.drawLine(a, cpt, Draw.stroke(IX.accent, 4));
    Draw.text(c, 'A', a + const Offset(-18, -18), size: 20);
    Draw.text(c, 'C', cpt + const Offset(-14, -20), size: 20);
    Draw.text(c, 'B', b + const Offset(14, -18), size: 20);
    IxPaint.arrow(c, cpt, b, IX.amber, width: 3, head: 14);
    Draw.text(c, 'v₁τ', Offset.lerp(cpt, b, 0.5)! + const Offset(28, -10), size: 18, color: IX.amber, halo: true);
    for (final p in [a, cpt]) {
      IxPaint.arrow(c, p - dir * 200, p, IX.amber.withValues(alpha: 0.6), width: 2.5, head: 12);
    }
    if (sr < 1) {
      final r = math.asin(sr);
      final rad2 = ab * math.sin(i) * n1 / n2;
      c.drawArc(Rect.fromCircle(center: a, radius: rad2), 0, math.pi, false, Draw.stroke(IX.positive.withValues(alpha: 0.6), 2.5));
      final e = a + Offset(math.sin(r), math.cos(r)) * rad2;
      c.drawLine(e, b, Draw.stroke(IX.positive, 4));
      Draw.text(c, 'E', e + const Offset(-20, 10), size: 20);
      IxPaint.arrow(c, a, e, IX.amber, width: 3, head: 14);
      Draw.text(c, 'v₂τ', Offset.lerp(a, e, 0.5)! + const Offset(-30, 0), size: 18, color: IX.amber, halo: true);
      Draw.text(c, 'refracted wavefront EB', Offset.lerp(e, b, 0.5)! + const Offset(40, 30), size: 17, color: IX.positive, halo: true);
    }
    Draw.text(c, 'n₁ = ${fx(n1, 2)}', Offset(80, y0 - 30), size: 19);
    Draw.text(c, 'n₂ = ${fx(n2, 2)}', Offset(80, y0 + 30), size: 19);
    Draw.caption(c, 'While C travels to B, the wavelet from A grows only v₂τ in the slower medium.');
  },
);

// ── Young ──

final _young = ModeSpec(
  title: "Young's double-slit fringes",
  formula: 'β = λD/d,  I = 4I₀ cos²(πyd/λD)',
  values: {'lam': 600, 'd': 0.5, 'D': 1, 'one': 0},
  controls: (v) => const [Sl('lam', 'Wavelength λ', 400, 700, unit: 'nm', div: 30), Sl('d', 'Slit separation d', 0.1, 1, unit: 'mm', div: 18), Sl('D', 'Screen distance D', 0.5, 2, unit: 'm', div: 15), Seg('one', 'Slits', ['Both open', 'Cover one'])],
  presets: {'Red light': {'lam': 650}, 'Blue light': {'lam': 450}, 'Slits closer': {'d': 0.2}},
  readouts: (v) {
    final beta = v['lam']! * 1e-9 * v['D']! / (v['d']! * 1e-3);
    return [Readout('Fringe width β', fx(beta * 1e3, 2), 'mm', IX.accent), Readout('Angular width λ/d', fx(v['lam']! * 1e-9 / (v['d']! * 1e-3) * 1e3, 2), 'mrad'), Readout('Bright fringes in 10 mm', fx(10 / (beta * 1e3), 1), '')];
  },
  paint: (c, s, v, t) {
    final lam = v['lam']! * 1e-9, d = v['d']! * 1e-3, dd = v['D']!;
    final one = v['one'] == 1;
    final beta = lam * dd / d;
    final col = Draw.spectral(v['lam']!);
    double inten(double ymm) => one ? 1 : 4 * math.pow(math.cos(math.pi * ymm * 1e-3 * d / (lam * dd)), 2).toDouble();
    // Screen strip across the top, ±10 mm.
    final strip = Rect.fromLTRB(60, 70, s.width - 60, 230);
    for (var x = strip.left; x < strip.right; x += 2) {
      final ymm = (x - strip.center.dx) / strip.width * 20;
      c.drawRect(Rect.fromLTWH(x, strip.top, 2.2, strip.height), Draw.fill(Color.lerp(const Color(0xFF14161F), col, inten(ymm) / 4)!));
    }
    Draw.text(c, 'screen (± 10 mm)', Offset(strip.center.dx, strip.bottom + 22), size: 17, color: IX.inkSoft);
    if (!one) Draw.dim(c, Offset(strip.center.dx, strip.top - 14), Offset(strip.center.dx + beta * 1e3 / 20 * strip.width, strip.top - 14), 'β', color: IX.accent);
    final p = Plot(Rect.fromLTRB(26, 280, s.width - 26, s.height - 22), -10, 10, 0, 4.4, xl: 'y on the screen (mm)', yl: 'I / I₀', title: one ? 'One slit: an even glow (I₀), no fringes' : 'Two coherent slits: 4I₀ at bright fringes, 0 at dark');
    p.frame(c);
    p.fn(c, inten, col, w: 4);
    p.hline(c, 1, IX.muted, label: 'one slit I₀');
  },
);

// ── single slit ──

final _single = ModeSpec(
  title: 'Diffraction at a single slit',
  formula: 'minima at a sin θ = nλ,  y = nλD/a',
  values: {'a': 0.2, 'lam': 600, 'D': 1, 'mins': 1},
  controls: (v) => const [Sl('a', 'Slit width a', 0.05, 0.5, unit: 'mm', div: 45), Sl('lam', 'Wavelength λ', 400, 700, unit: 'nm', div: 30), Sl('D', 'Screen distance D', 0.5, 2, unit: 'm', div: 15), Seg('mins', 'Minima', ['Hidden', 'Marked'])],
  presets: {'Narrow slit': {'a': 0.1}, 'Wide slit': {'a': 0.5}, 'Blue light': {'lam': 450}},
  readouts: (v) {
    final y1 = v['lam']! * 1e-9 * v['D']! / (v['a']! * 1e-3);
    return [Readout('First minimum y₁', fx(y1 * 1e3, 2), 'mm', IX.accent), Readout('Central maximum width', fx(2 * y1 * 1e3, 2), 'mm', IX.positive), Readout('First side maximum', '4.5', '% of centre')];
  },
  paint: (c, s, v, t) {
    final lam = v['lam']! * 1e-9, a = v['a']! * 1e-3, dd = v['D']!;
    final col = Draw.spectral(v['lam']!);
    final range = math.max(10.0, 3.5 * lam * dd / a * 1e3);
    double inten(double ymm) {
      final b = math.pi * a * ymm * 1e-3 / (lam * dd);
      return b.abs() < 1e-9 ? 1 : math.pow(math.sin(b) / b, 2).toDouble();
    }

    final strip = Rect.fromLTRB(60, 70, s.width - 60, 230);
    for (var x = strip.left; x < strip.right; x += 2) {
      final ymm = (x - strip.center.dx) / strip.width * 2 * range;
      c.drawRect(Rect.fromLTWH(x, strip.top, 2.2, strip.height), Draw.fill(Color.lerp(const Color(0xFF14161F), col, math.pow(inten(ymm), 0.45).toDouble())!));
    }
    Draw.text(c, 'screen (± ${fx(range, 0)} mm, brightness boosted to show the side maxima)', Offset(strip.center.dx, strip.bottom + 22), size: 17, color: IX.inkSoft);
    final p = Plot(Rect.fromLTRB(26, 280, s.width - 26, s.height - 22), -range, range, 0, 1.1, xl: 'y on the screen (mm)', yl: 'I / I₀', title: 'I = I₀ (sin β / β)²,  β = πay/λD');
    p.frame(c);
    p.fn(c, inten, col, w: 4);
    if (v['mins'] == 1) {
      final y1 = lam * dd / a * 1e3;
      for (var n = -3; n <= 3; n++) {
        if (n != 0) p.vline(c, n * y1, IX.muted, label: n.abs() == 1 ? (n > 0 ? 'n = 1' : 'n = −1') : null);
      }
    }
  },
);

// ── polarisation ──

final _polar = ModeSpec(
  title: "Polaroids and Malus's law",
  formula: 'I = I₁ cos² θ,  tan θ_B = n',
  values: {'th': 30, 'ph': 45, 'mid': 0, 'n': 1.5},
  controls: (v) => const [Sl('th', 'Analyser angle θ', 0, 180, unit: '°', div: 36), Seg('mid', 'Middle polaroid', ['Out', 'In']), Sl('ph', 'Middle polaroid angle', 0, 90, unit: '°', div: 18), Sl('n', 'n (for Brewster)', 1, 2.5, div: 30)],
  presets: {'Crossed (90°)': {'th': 90, 'mid': 0}, 'Crossed with 45° in between': {'th': 90, 'mid': 1, 'ph': 45}, 'θ = 60°': {'th': 60}},
  readouts: (v) {
    final th = rad(v['th']!), ph = rad(v['ph']!);
    final f = v['mid'] == 1 ? 0.5 * math.pow(math.cos(ph), 2) * math.pow(math.cos(th - ph), 2) : 0.5 * math.pow(math.cos(th), 2);
    return [Readout('Light through, of I₀', fx(f * 100, 1), '%', IX.accent), Readout('After the first polaroid', '50.0', '%'), Readout("Brewster's angle", fx(deg(math.atan(v['n']!)), 1), '°', IX.green)];
  },
  paint: (c, s, v, t) {
    final (top, bot) = Lay.stack(s, 0.56);
    final mid = v['mid'] == 1;
    final angles = [0.0, if (mid) v['ph']!, v['th']!];
    final y = top.center.dy + 20;
    final xs = [for (var k = 0; k < angles.length; k++) top.left + 300 + k * (top.width - 500) / math.max(1, angles.length - 1)];
    var iNow = 1.0, prev = double.nan;
    var x0 = top.left + 40.0;
    for (var k = 0; k < angles.length; k++) {
      final a = angles[k];
      final next = prev.isNaN ? 0.5 : iNow * math.pow(math.cos(rad(a - prev)), 2);
      // Beam segment up to this polaroid.
      c.drawRect(Rect.fromLTRB(x0, y - 22, xs[k], y + 22), Draw.fill(IX.amber.withValues(alpha: 0.12 + 0.6 * iNow)));
      if (k == 0) {
        for (var q = 0; q < 4; q++) {
          final aa = q * math.pi / 4;
          c.drawLine(Offset(x0 + 100, y) + Offset(math.cos(aa), math.sin(aa)) * 30, Offset(x0 + 100, y) - Offset(math.cos(aa), math.sin(aa)) * 30, Draw.stroke(IX.amber, 2.5));
        }
        Draw.text(c, 'unpolarised I₀', Offset(x0 + 100, y - 60), size: 17, color: IX.amber);
      } else {
        final u = Offset(math.sin(rad(prev)), -math.cos(rad(prev)));
        c.drawLine(Offset((x0 + xs[k]) / 2, y) - u * 36 * math.sqrt(iNow * 2), Offset((x0 + xs[k]) / 2, y) + u * 36 * math.sqrt(iNow * 2), Draw.stroke(IX.amber, 3));
      }
      final disc = Rect.fromCenter(center: Offset(xs[k], y), width: 60, height: 230);
      c.drawOval(disc, Draw.fill(const Color(0xFF9AA3B5).withValues(alpha: 0.35)));
      c.drawOval(disc, Draw.stroke(IX.inkSoft, 2));
      final u = Offset(math.sin(rad(a)) * 0.26, -math.cos(rad(a)));
      c.drawLine(Offset(xs[k], y) - u * 100, Offset(xs[k], y) + u * 100, Draw.stroke(IX.ink, 3));
      Draw.text(c, k == 0 ? 'polariser 0°' : (k == angles.length - 1 ? 'analyser ${fx(a, 0)}°' : 'middle ${fx(a, 0)}°'), Offset(xs[k], y + 140), size: 17);
      iNow = next.toDouble();
      prev = a;
      x0 = xs[k];
    }
    c.drawRect(Rect.fromLTRB(x0, y - 22, top.right - 30, y + 22), Draw.fill(IX.amber.withValues(alpha: 0.12 + 0.6 * iNow)));
    Draw.tag(c, '${fx(iNow * 100, 1)}% of I₀', Offset(top.right - 130, y - 60), color: IX.accent);
    Draw.caption(c, mid ? 'A middle polaroid between crossed ones lets light through again.' : 'Turn the analyser: the light follows cos² θ.');
    final p = Plot(bot, 0, 180, 0, 55, xl: 'θ (°)', yl: 'I (% of I₀)', title: "Malus's law: I = (I₀/2) cos² θ");
    p.frame(c);
    p.fn(c, (x) => 50 * math.pow(math.cos(rad(x)), 2).toDouble(), IX.accent, w: 4);
    if (!mid) p.dot(c, v['th']!, 50 * math.pow(math.cos(rad(v['th']!)), 2).toDouble(), IX.accent);
  },
);
