import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../core/bench.dart';

/// A ray through an equilateral glass prism; with white light, a spectrum.
class PrismBench extends LabBench {
  const PrismBench();

  static const angleA = 60.0;
  static const n = 1.5;

  /// The colours of the spectrum with slightly different refractive indices.
  static const colours = [
    (Color(0xFFE53935), 1.513),
    (Color(0xFFFB8C00), 1.515),
    (Color(0xFFFDD835), 1.517),
    (Color(0xFF43A047), 1.520),
    (Color(0xFF1E88E5), 1.524),
    (Color(0xFF3949AB), 1.527),
    (Color(0xFF8E24AA), 1.531),
  ];

  @override
  String get kind => 'prism';

  @override
  LabParams get defaults => {'i': 45.0, 'white': false};

  @override
  LabParams get preview => {'i': 48.0, 'white': true};

  @override
  List<LabControl> controls(LabParams p) => [
        LabSlider('i', tr('Angle of incidence'), 20, 80, divisions: 60, unit: '°'),
        LabToggle('white', tr('White light')),
      ];

  /// Angles in degrees for refractive index [mu]: r1, r2, e and the
  /// deviation D; null when the ray cannot leave the second face.
  static ({double r1, double r2, double e, double d})? path(double i, [double mu = n]) {
    final ir = i * math.pi / 180;
    final r1 = math.asin(math.sin(ir) / mu);
    final r2 = angleA * math.pi / 180 - r1;
    final s = mu * math.sin(r2);
    if (s.abs() >= 1) return null;
    final e = math.asin(s);
    const deg = 180 / math.pi;
    return (r1: r1 * deg, r2: r2 * deg, e: e * deg, d: i + e * deg - angleA);
  }

  @override
  List<LabColumn> get columns => [LabColumn(tr('∠i (degree)'), 0), LabColumn(tr('∠e (degree)'), 1), LabColumn(tr('∠D (degree)'), 1)];

  @override
  LabReading read(LabParams p) {
    final i = pNum(p, 'i', 45);
    final r = path(i);
    if (r == null) return LabReading.not(tr('At this angle the ray cannot come out of the second face. Use a bigger angle.'));
    double half(double v) => (v * 2).round() / 2;
    return LabReading.row([i.round(), half(r.e), half(r.d)]);
  }

  @override
  List<String> live(LabParams p) {
    final r = path(pNum(p, 'i', 45));
    if (r == null) return [tr('The ray does not come out')];
    return ['∠i = ${pNum(p, 'i', 45).round()}°', '∠e = ${r.e.toStringAsFixed(1)}°', '∠D = ${r.d.toStringAsFixed(1)}°'];
  }

  @override
  LabGraph graph(LabParams p) => const LabGraph(0, 2, fromZero: false);

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final best = rows.reduce((a, b) => (a[2] as num) <= (b[2] as num) ? a : b);
    final dm = (best[2] as num).toDouble();
    final mu = math.sin((angleA + dm) / 2 * math.pi / 180) / math.sin(angleA / 2 * math.pi / 180);
    return tr('Smallest deviation in your readings: {d}° at ∠i = {i}°. Refractive index = sin((A + Dm) ÷ 2) ÷ sin(A ÷ 2) ≈ {n}.', {'d': dm.toStringAsFixed(1), 'i': best[0], 'n': mu.toStringAsFixed(2)});
  }

  static Offset _rot(Offset v, double deg) {
    final a = deg * math.pi / 180;
    return Offset(v.dx * math.cos(a) - v.dy * math.sin(a), v.dx * math.sin(a) + v.dy * math.cos(a));
  }

  /// Where the ray from [o] along [d] crosses the segment [a]–[b].
  static Offset? _hit(Offset o, Offset d, Offset a, Offset b) {
    final e = b - a;
    final den = d.dx * e.dy - d.dy * e.dx;
    if (den.abs() < 1e-9) return null;
    final t = ((a.dx - o.dx) * e.dy - (a.dy - o.dy) * e.dx) / den;
    final u = ((a.dx - o.dx) * d.dy - (a.dy - o.dy) * d.dx) / den;
    return t > 0 && u >= 0 && u <= 1 ? o + d * t : null;
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final i = pNum(p, 'i', 45);
    final white = pBool(p, 'white');
    if (white) canvas.drawRect(Offset.zero & size, fill(const Color(0xFF22252B)));
    final ink = white ? Colors.white : LabInk.ink;

    // Equilateral prism, apex up.
    final side = math.min(w * 0.36, h * 0.72);
    final apex = Offset(w * 0.42, h * 0.5 - side * math.sqrt(3) / 3);
    final b1 = apex + Offset(-side / 2, side * math.sqrt(3) / 2), b2 = apex + Offset(side / 2, side * math.sqrt(3) / 2);
    final prism = Path()..addPolygon([apex, b1, b2], true);
    canvas.drawPath(prism, fill(white ? const Color(0x3378B7E0) : LabInk.glass));
    canvas.drawPath(prism, stroke(white ? const Color(0xFF9FC8E8) : LabInk.ink, 2));
    label(canvas, 'A = 60°', apex - const Offset(0, 16), size: 13, bold: true, color: ink);

    // The ray meets the left face at 45% of its height.
    final h1 = Offset.lerp(b1, apex, 0.45)!;
    const nIn = Offset(0.8660254, 0.5); // inward normal of the left face
    const nOut2 = Offset(0.8660254, -0.5); // outward normal of the right face
    final dIn = _rot(nIn, -i);
    final src = h1 - dIn * (w * 0.32);
    final normalPaint = stroke((white ? Colors.white : LabInk.muted).withValues(alpha: 0.6), 1.2);
    dashed(canvas, h1 - nIn * 60, h1 + nIn * 50, normalPaint);

    final beam = stroke(white ? Colors.white : LabInk.red, 3);
    canvas.drawLine(src, h1, beam);
    arrowHead(canvas, Offset.lerp(src, h1, 0.55)!, dIn, beam);

    // The real spread of colours is only a degree or two; the picture widens
    // it (as textbook diagrams do) so the class can see the spectrum.
    final rays = white ? [for (final (c, mu) in colours) (c, 1.5 + (mu - 1.522) * 9)] : [(LabInk.red, n)];
    final screenX = w * 0.93;
    final band = <(Color, double)>[];
    Offset? lastExit;
    for (final (colour, mu) in rays) {
      final r = path(i, mu);
      final d1 = _rot(nIn, -math.asin(math.sin(i * math.pi / 180) / mu) * 180 / math.pi);
      final h2 = _hit(h1, d1, apex, b2) ?? _hit(h1, d1, b1, b2);
      if (h2 == null) continue;
      final paint = stroke(colour.withValues(alpha: white ? 0.9 : 1), white ? 2 : 3);
      canvas.drawLine(h1, h2, paint);
      if (r == null) continue;
      final dOut = _rot(nOut2, r.e);
      final out = white ? h2 + dOut * ((screenX - h2.dx) / dOut.dx) : h2 + dOut * (w * 0.34);
      if (white) band.add((colour, out.dy));
      canvas.drawLine(h2, out, paint);
      if (!white) arrowHead(canvas, Offset.lerp(h2, out, 0.6)!, dOut, paint);
      lastExit = h2;
      if (!white) {
        dashed(canvas, h2 - nOut2 * 50, h2 + nOut2 * 60, normalPaint);
        // The incident ray carried straight on, and the angle between it and the emergent ray.
        final straight = h1 + dIn * (w * 0.4);
        dashed(canvas, h1, straight, stroke(LabInk.red.withValues(alpha: 0.35), 1.5));
        label(canvas, 'D = ${r.d.toStringAsFixed(1)}°', Offset(w * 0.8, h * 0.2), size: 18, bold: true, color: LabInk.blue, halo: LabInk.paper);
        label(canvas, 'e = ${r.e.toStringAsFixed(1)}°', h2 + const Offset(46, -34), size: 14, bold: true, color: LabInk.blue, halo: LabInk.paper);
      }
    }
    label(canvas, 'i = ${i.round()}°', h1 + const Offset(-70, -40), size: 14, bold: true, color: white ? Colors.white : LabInk.blue, halo: white ? const Color(0xFF22252B) : LabInk.paper);
    if (lastExit == null) {
      label(canvas, tr('The ray does not come out'), Offset(w * 0.75, h * 0.2), size: 17, bold: true, color: LabInk.red, halo: LabInk.paper);
    }
    if (white && lastExit != null) {
      // A screen catching the spectrum: a band of colour where the rays land.
      canvas.drawLine(Offset(screenX, h * 0.1), Offset(screenX, h * 0.95), stroke(Colors.white.withValues(alpha: 0.85), 4));
      for (var k = 0; k < band.length; k++) {
        final y0 = k == 0 ? band[k].$2 - 6 : (band[k - 1].$2 + band[k].$2) / 2;
        final y1 = k == band.length - 1 ? band[k].$2 + 6 : (band[k].$2 + band[k + 1].$2) / 2;
        canvas.drawRect(Rect.fromLTRB(screenX - 3, y0, screenX + 9, y1), fill(band[k].$1));
      }
      label(canvas, tr('Spectrum'), Offset(screenX - 40, h * 0.06), size: 14, bold: true, color: Colors.white);
      if (band.isNotEmpty) {
        label(canvas, tr('Red'), Offset(screenX - 34, band.first.$2), size: 12, bold: true, color: Colors.white);
        label(canvas, tr('Violet'), Offset(screenX - 40, band.last.$2), size: 12, bold: true, color: Colors.white);
      }
    }
  }
}
