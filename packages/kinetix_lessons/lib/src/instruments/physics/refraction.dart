import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'kit.dart';

/// Ray optics beyond the lens and mirror bench (2nd PUC ch. 9): Snell's law, the glass slab,
/// total internal reflection, the prism's deviation curve and the astronomical telescope.
final refractionSpec = InstrumentSpec(
  id: 'refraction',
  chapter: '2nd PUC Physics · Ray optics and optical instruments',
  modes: {'snell': _snell, 'slab': _slab, 'tir': _tir, 'prism': _prism, 'telescope': _telescope},
);

const _ray = Color(0xFFD97706);
const _glass = Color(0xFFDCEAF6);

void _ray3(Canvas c, Offset a, Offset b, {double alpha = 1, double w = 4}) {
  IxPaint.arrow(c, a, Offset.lerp(a, b, 0.55)!, _ray.withValues(alpha: alpha), width: w, head: 16);
  c.drawLine(a, b, Draw.stroke(_ray.withValues(alpha: alpha), w));
}

// ── Snell's law ──

final _snell = ModeSpec(
  title: "Refraction: Snell's law",
  formula: 'n₁ sin i = n₂ sin r',
  values: {'i': 60, 'n1': 1, 'n2': 1.5},
  controls: (v) => const [Sl('i', 'Angle of incidence i', 0, 89, unit: '°', div: 89), Sl('n1', 'n₁ (first medium)', 1, 2.5, div: 30), Sl('n2', 'n₂ (second medium)', 1, 2.5, div: 30)],
  presets: {'Air to glass': {'n1': 1, 'n2': 1.5}, 'Air to water': {'n1': 1, 'n2': 1.33}, 'Glass to air': {'n1': 1.5, 'n2': 1, 'i': 30}},
  readouts: (v) {
    final sr = v['n1']! * math.sin(rad(v['i']!)) / v['n2']!;
    return [Readout('Angle of refraction r', sr > 1 ? 'none (TIR)' : fx(deg(math.asin(sr)), 1), sr > 1 ? '' : '°', IX.accent), Readout('n₁ sin i', fx(v['n1']! * math.sin(rad(v['i']!)), 3), ''), Readout('Speed in medium 2', fx(3 / v['n2']!, 2), '× 10⁸ m/s')];
  },
  paint: (c, s, v, t) {
    final (left, right) = Lay.split(s, 0.5);
    final o = Offset(left.center.dx, left.center.dy + 20);
    final n1 = v['n1']!, n2 = v['n2']!, i = rad(v['i']!);
    c.drawRect(Rect.fromLTRB(left.left + 20, o.dy, left.right - 10, left.bottom - 20), Draw.fill(Color.lerp(Colors.white, _glass, (n2 - 1) / 1.5)!));
    c.drawRect(Rect.fromLTRB(left.left + 20, 70, left.right - 10, o.dy), Draw.fill(Color.lerp(Colors.white, _glass, (n1 - 1) / 1.5)!));
    Draw.text(c, 'n₁ = ${fx(n1, 2)}', Offset(left.left + 90, 110), size: 19);
    Draw.text(c, 'n₂ = ${fx(n2, 2)}', Offset(left.left + 90, left.bottom - 50), size: 19);
    IxPaint.dashed(c, Offset(o.dx, 80), Offset(o.dx, left.bottom - 30), Draw.stroke(IX.muted, 2));
    const l = 300.0;
    final a = o + Offset(-math.sin(i), -math.cos(i)) * l;
    _ray3(c, a, o);
    final sr = n1 * math.sin(i) / n2;
    final refl = sr > 1 ? 1.0 : math.pow((n1 - n2) / (n1 + n2), 2).toDouble() + 0.1;
    _ray3(c, o, o + Offset(math.sin(i), -math.cos(i)) * l, alpha: refl.clamp(0.15, 1));
    Draw.angle(c, o, -math.pi / 2 - i, -math.pi / 2, 70, 'i', color: _ray);
    if (sr <= 1) {
      final r = math.asin(sr);
      _ray3(c, o, o + Offset(math.sin(r), math.cos(r)) * l);
      Draw.angle(c, o, math.pi / 2 - r, math.pi / 2, 70, 'r', color: _ray);
    } else {
      Draw.tag(c, 'Total internal reflection', o + const Offset(0, 80), color: IX.positive);
    }
    Draw.caption(c, n2 > n1 ? 'Into a denser medium the ray bends towards the normal.' : 'Into a rarer medium the ray bends away from the normal.');
    final p = Plot(right, 0, 90, 0, 90, xl: 'i (°)', yl: 'r (°)', title: 'r against i');
    p.frame(c);
    p.fn(c, (x) => (n1 * math.sin(rad(x)) / n2).abs() <= 1 ? deg(math.asin(n1 * math.sin(rad(x)) / n2)) : double.nan, IX.accent, w: 4);
    p.fn(c, (x) => x, IX.muted, w: 2, dash: true, label: 'r = i', labelAt: 80);
    if (sr <= 1) p.dot(c, v['i']!, deg(math.asin(sr)), IX.accent);
    if (n1 > n2) p.vline(c, deg(math.asin(n2 / n1)), IX.positive, label: 'critical');
  },
);

// ── glass slab ──

final _slab = ModeSpec(
  title: 'Refraction through a glass slab',
  formula: 'lateral shift d = t sin(i − r) / cos r',
  values: {'i': 40, 'ts': 6, 'n': 1.5},
  controls: (v) => const [Sl('i', 'Angle of incidence i', 0, 80, unit: '°', div: 80), Sl('ts', 'Slab thickness t', 2, 10, unit: 'cm', div: 16), Sl('n', 'Refractive index n', 1.3, 1.9, div: 12)],
  presets: {'40° on glass': {'i': 40}, 'Grazing (80°)': {'i': 80}, 'Thick slab': {'ts': 10}},
  readouts: (v) {
    final i = rad(v['i']!), r = math.asin(math.sin(i) / v['n']!);
    return [Readout('Angle inside r', fx(deg(r), 1), '°', IX.accent), Readout('Emergent angle', fx(v['i']!, 1), '° (= i)', IX.green), Readout('Lateral shift d', fx(v['ts']! * math.sin(i - r) / math.cos(r), 2), 'cm', IX.positive)];
  },
  paint: (c, s, v, t) {
    const ppc = 50.0;
    final i = rad(v['i']!), r = math.asin(math.sin(i) / v['n']!);
    final th = v['ts']! * ppc;
    final cx = s.width * 0.42, y0 = s.height / 2 - th / 2, y1 = y0 + th;
    c.drawRect(Rect.fromLTRB(60, y0, s.width - 60, y1), Draw.fill(_glass));
    c.drawRect(Rect.fromLTRB(60, y0, s.width - 60, y1), Draw.stroke(IX.glassEdge, 2));
    final a = Offset(cx, y0), b = Offset(cx + th * math.tan(r), y1);
    final start = a - Offset(math.sin(i), math.cos(i)) * 260;
    _ray3(c, start, a);
    _ray3(c, a, b);
    final end = b + Offset(math.sin(i), math.cos(i)) * 260;
    _ray3(c, b, end);
    // Undeviated path, dashed, and the shift between them.
    final ghost = a + Offset(math.sin(i), math.cos(i)) * (th / math.cos(i) + 260);
    IxPaint.dashed(c, a, ghost, Draw.stroke(IX.muted, 2.5));
    for (final p in [a, b]) {
      IxPaint.dashed(c, p + const Offset(0, -110), p + const Offset(0, 110), Draw.stroke(IX.muted, 1.6));
    }
    Draw.angle(c, a, -math.pi / 2 - i, -math.pi / 2, 60, 'i', color: _ray);
    Draw.angle(c, a, math.pi / 2 - r, math.pi / 2, 60, 'r', color: _ray);
    final d = v['ts']! * math.sin(i - r) / math.cos(r) * ppc;
    final nrm = Offset(math.cos(i), -math.sin(i));
    final foot = b + Offset(math.sin(i), math.cos(i)) * 120;
    Draw.dim(c, foot, foot + nrm * d, 'd', color: IX.positive);
    Draw.text(c, 'n = ${fx(v['n']!, 2)}, t = ${fx(v['ts']!, 0)} cm', Offset(s.width - 200, y1 - 26), size: 18, color: IX.inkSoft);
    Draw.caption(c, 'The ray leaves parallel to the way it came in, shifted sideways by d.');
  },
);

// ── total internal reflection ──

final _tir = ModeSpec(
  title: 'Total internal reflection',
  formula: 'sin C = n₂ / n₁',
  values: {'i': 30, 'n1': 1.5, 'n2': 1},
  controls: (v) => const [Sl('i', 'Angle in the denser medium i', 0, 89, unit: '°', div: 89), Sl('n1', 'n₁ (denser)', 1.4, 2.5, div: 22), Sl('n2', 'n₂ (rarer)', 1, 1.4, div: 8)],
  presets: {'Glass, below C': {'i': 30}, 'Glass, at C': {'i': 41.8}, 'Glass, beyond C': {'i': 60}, 'Diamond': {'n1': 2.42, 'i': 30}},
  readouts: (v) {
    final cA = deg(math.asin(v['n2']! / v['n1']!));
    final sr = v['n1']! * math.sin(rad(v['i']!)) / v['n2']!;
    return [Readout('Critical angle C', fx(cA, 1), '°', IX.positive), Readout('Refracted angle', sr >= 1 ? 'none' : fx(deg(math.asin(sr)), 1), sr >= 1 ? '' : '°', IX.accent), Readout('What happens', sr >= 1 ? 'all reflected' : 'partly out', '')];
  },
  paint: (c, s, v, t) {
    final (left, right) = Lay.split(s, 0.55);
    final n1 = v['n1']!, n2 = v['n2']!, i = rad(v['i']!);
    final o = Offset(left.center.dx, left.center.dy - 60);
    // Semicircular block (flat face up); the ray enters radially through the curved face.
    const rr = 300.0;
    final block = Path()..addArc(Rect.fromCircle(center: o, radius: rr), 0, math.pi);
    c.drawPath(block, Draw.fill(_glass));
    c.drawPath(block..close(), Draw.stroke(IX.glassEdge, 2.5));
    IxPaint.dashed(c, o + const Offset(0, -220), o + const Offset(0, rr), Draw.stroke(IX.muted, 2));
    final a = o + Offset(-math.sin(i), math.cos(i)) * (rr + 60);
    _ray3(c, a, o);
    final sr = n1 * math.sin(i) / n2;
    final rc = math.pow((n1 - n2) / (n1 + n2), 2).toDouble();
    _ray3(c, o, o + Offset(math.sin(i), math.cos(i)) * rr, alpha: sr >= 1 ? 1 : (0.2 + rc + 0.6 * math.pow(sr, 8)).clamp(0.2, 0.95));
    if (sr < 1) {
      final r = math.asin(sr);
      _ray3(c, o, o + Offset(math.sin(r), -math.cos(r)) * 240, alpha: (1 - math.pow(sr, 8)).clamp(0.25, 1).toDouble());
    } else {
      Draw.tag(c, 'All the light is reflected', o + const Offset(0, -120), color: IX.positive);
    }
    Draw.angle(c, o, math.pi / 2, math.pi / 2 + i, 70, 'i', color: _ray);
    Draw.text(c, 'n₁ = ${fx(n1, 2)}', o + const Offset(-180, 120), size: 19);
    Draw.text(c, 'n₂ = ${fx(n2, 2)}', o + const Offset(-180, -80), size: 19);
    Draw.caption(c, 'Beyond the critical angle no light gets out: the basis of optical fibres and diamond sparkle.');
    final p = Plot(right, 1.4, 2.5, 20, 90, xl: 'n₁ (with n₂ = ${fx(n2, 2)})', yl: 'C (°)', title: 'Critical angle falls as n₁ rises');
    p.frame(c);
    p.fn(c, (x) => n2 / x < 1 ? deg(math.asin(n2 / x)) : 90, IX.positive, w: 4);
    p.dot(c, n1, deg(math.asin(n2 / n1)), IX.positive);
  },
);

// ── prism ──

(double, double?, double?) _prismTrace(double a, double n, double i) {
  final r1 = math.asin(math.sin(i) / n);
  final r2 = a - r1;
  final se = n * math.sin(r2);
  if (se.abs() > 1) return (r1, r2, null);
  final e = math.asin(se);
  return (r1, r2, e);
}

final _prism = ModeSpec(
  title: 'Deviation by a prism',
  formula: 'δ = i + e − A,  n = sin((A + δm)/2) / sin(A/2)',
  values: {'A': 60, 'n': 1.5, 'i': 40},
  controls: (v) => const [Sl('A', 'Prism angle A', 30, 70, unit: '°', div: 40), Sl('n', 'Refractive index n', 1.3, 1.8, div: 25), Sl('i', 'Angle of incidence i', 20, 90, unit: '°', div: 70)],
  presets: {'i = 40°': {'i': 40}, 'Minimum deviation': {'i': 48.6}, 'Grazing': {'i': 85}},
  readouts: (v) {
    final a = rad(v['A']!), n = v['n']!, i = rad(v['i']!);
    final (_, _, e) = _prismTrace(a, n, i);
    final dm = 2 * math.asin(n * math.sin(a / 2)) - a;
    return [Readout('Deviation δ', e == null ? 'no exit' : fx(deg(i + e - a), 1), e == null ? '' : '°', IX.accent), Readout('Emergence e', e == null ? '—' : fx(deg(e), 1), '°'), Readout('Minimum deviation δm', fx(deg(dm), 1), '°', IX.green), Readout('i at minimum', fx(deg((a + dm) / 2), 1), '°')];
  },
  paint: (c, s, v, t) {
    final (left, right) = Lay.split(s, 0.5);
    final a = rad(v['A']!), n = v['n']!, i = rad(v['i']!);
    final apex = Offset(left.center.dx, left.top + 120);
    const side = 520.0;
    final pl = apex + Offset(-math.sin(a / 2), math.cos(a / 2)) * side, pr = apex + Offset(math.sin(a / 2), math.cos(a / 2)) * side;
    final tri = Path()..moveTo(apex.dx, apex.dy)..lineTo(pl.dx, pl.dy)..lineTo(pr.dx, pr.dy)..close();
    c.drawPath(tri, Draw.fill(_glass));
    c.drawPath(tri, Draw.stroke(IX.glassEdge, 2.5));
    final (r1, r2, e) = _prismTrace(a, n, i);
    // Entry point halfway down the left face; face normal points out-left.
    final p1 = Offset.lerp(apex, pl, 0.45)!;
    final nl = Offset(-math.cos(a / 2), -math.sin(a / 2)); // outward normal of the left face
    double ang(Offset u) => math.atan2(u.dy, u.dx);
    final inDir = Offset(math.cos(ang(-nl) - i), math.sin(ang(-nl) - i));
    _ray3(c, p1 - inDir * 260, p1);
    final midDir = Offset(math.cos(ang(-nl) - r1), math.sin(ang(-nl) - r1));
    // Intersect with the right face.
    final d = pr - apex;
    final den = midDir.dx * d.dy - midDir.dy * d.dx;
    final tt = ((apex.dx - p1.dx) * d.dy - (apex.dy - p1.dy) * d.dx) / den;
    final p2 = p1 + midDir * tt;
    _ray3(c, p1, p2);
    IxPaint.dashed(c, p1 - nl * 80, p1 + nl * 80, Draw.stroke(IX.muted, 1.6));
    if (e != null) {
      final nr = Offset(math.cos(a / 2), -math.sin(a / 2));
      final outDir = Offset(math.cos(ang(nr) + e), math.sin(ang(nr) + e));
      _ray3(c, p2, p2 + outDir * 280);
      IxPaint.dashed(c, p2 - nr * 80, p2 + nr * 80, Draw.stroke(IX.muted, 1.6));
      IxPaint.dashed(c, p1, p1 + inDir * 420, Draw.stroke(IX.muted, 2));
    } else {
      Draw.tag(c, 'Totally reflected at the second face', p2 + const Offset(0, 60), color: IX.positive);
    }
    Draw.text(c, 'A', apex + const Offset(0, -24), size: 20);
    Draw.caption(c, r2 == null ? '' : 'r₁ + r₂ = A. δ is smallest when the ray passes through symmetrically.');
    final p = Plot(right, 20, 90, 20, 80, xl: 'i (°)', yl: 'δ (°)', title: 'Deviation curve: a minimum at δm');
    p.frame(c);
    p.fn(c, (x) {
      final (_, _, ee) = _prismTrace(a, n, rad(x));
      return ee == null ? double.nan : deg(rad(x) + ee - a);
    }, IX.accent, w: 4);
    if (e != null) p.dot(c, v['i']!, deg(i + e - a), IX.accent);
    p.hline(c, deg(2 * math.asin(n * math.sin(a / 2)) - a), IX.green, label: 'δm');
  },
);

// ── astronomical telescope ──

final _telescope = ModeSpec(
  title: 'An astronomical telescope',
  formula: 'm = f_o/f_e (normal),  m = (f_o/f_e)(1 + f_e/D) (near point)',
  values: {'fo': 100, 'fe': 5, 'al': 1, 'near': 0},
  controls: (v) => const [Sl('fo', 'Objective f_o', 50, 200, unit: 'cm', div: 30), Sl('fe', 'Eyepiece f_e', 1, 20, unit: 'cm', div: 19), Sl('al', 'Angle of the star', 0.5, 3, unit: '°', div: 25), Seg('near', 'Final image', ['At infinity', 'At 25 cm'])],
  presets: {'f_o 100, f_e 5': {'fo': 100, 'fe': 5}, 'Stronger eyepiece': {'fe': 2}, 'Near point': {'near': 1}},
  readouts: (v) {
    final fo = v['fo']!, fe = v['fe']!;
    final near = v['near'] == 1;
    final m = near ? fo / fe * (1 + fe / 25) : fo / fe;
    final ue = near ? 1 / (1 / fe + 1 / 25) : fe;
    return [Readout('Magnifying power', fx(m, 1), '×', IX.accent), Readout('Tube length', fx(fo + ue, 1), 'cm'), Readout('Image angle', fx(v['al']! * m, 1), '°', IX.green)];
  },
  paint: (c, s, v, t) {
    final fo = v['fo']!, fe = v['fe']!, near = v['near'] == 1;
    final ue = near ? 1 / (1 / fe + 1 / 25) : fe;
    final total = fo + ue;
    final ppc = (s.width - 260) / (total + 30);
    final y = s.height * 0.5;
    final xo = 120.0, xe = xo + total * ppc, xf = xo + fo * ppc;
    const ex = 3.0; // angles exaggerated for visibility
    final al = rad(v['al']!) * ex;
    c.drawLine(Offset(40, y), Offset(s.width - 40, y), Draw.stroke(IX.muted, 1.5));
    for (final (x, h, lab) in [(xo, 170.0, 'objective'), (xe, 150.0, 'eyepiece')]) {
      c.drawOval(Rect.fromCenter(center: Offset(x, y), width: 22, height: 2 * h), Draw.fill(_glass));
      c.drawOval(Rect.fromCenter(center: Offset(x, y), width: 22, height: 2 * h), Draw.stroke(IX.glassEdge, 2));
      Draw.text(c, lab, Offset(x, y + h + 26), size: 17, color: IX.inkSoft);
    }
    // Intermediate image at the objective's focus, height fo tan(al).
    final ih = fo * math.tan(al) * ppc;
    final img = Offset(xf, y + ih);
    c.drawLine(Offset(xf, y), img, Draw.stroke(IX.accent, 4));
    Draw.text(c, 'image at F_o', Offset(xf - 12, y + ih + 22), size: 16, color: IX.accent, align: Alignment.centerRight);
    for (final h in [-120.0, 0.0, 120.0]) {
      final hit = Offset(xo, y + h);
      final from = hit - Offset(math.cos(al), math.sin(al)) * 100;
      _ray3(c, from, hit, w: 3);
      c.drawLine(hit, img, Draw.stroke(_ray, 3));
      final dir = (img - hit) / (img - hit).distance;
      final k = (xe - img.dx) / dir.dx;
      final he = img + dir * k;
      {
        c.drawLine(img, he, Draw.stroke(_ray, 3));
        // After the eyepiece the rays leave parallel to the line from the image through its centre.
        final out = near ? he - Offset(xe - 25 * ppc, y + (img.dy - y) * 25 / ue) : (Offset(xe, y) - img);
        final u = out / out.distance;
        _ray3(c, he, he + u * 160, w: 3);
      }
    }
    Draw.text(c, 'f_o = ${fx(fo, 0)} cm', Offset((xo + xf) / 2, y - 200), size: 18);
    Draw.text(c, 'f_e = ${fx(fe, 0)} cm', Offset(xe - 20, y - 180), size: 18);
    Draw.caption(c, 'Drawn to scale along the axis; angles exaggerated ×3.');
  },
);
