import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../draw.dart';

/// Refraction through a rectangular glass slab (n = 1.50), drawn as in a ray-diagram
/// practical: a ray box, the incident ray AO, refracted ray OO′ and emergent ray O′B, the
/// normals NN′ and MM′, angles i, r and e, and the lateral displacement d. Wavefronts crowd in
/// the glass (λ/n). In the last step i is varied and sin i / sin r stays 1.50, plotted beside.
class RefractionPlate extends AnimPainter {
  RefractionPlate(super.f);

  static const n = 1.5;
  static const top = 232.0, bottom = 402.0, left = 70.0, right = 590.0;
  static const ox = 250.0; // where the ray meets the slab
  static const depth = Offset(22, -16); // the slab's receding faces

  /// The angle of incidence, in degrees: 50°, then swept in the last step.
  double get iDeg {
    if (t < 0.78) return 50;
    if (t < 0.86) return 50 - 20 * easeS(seg(t, 0.78, 0.86));
    if (t < 0.95) return 30 + 35 * easeS(seg(t, 0.86, 0.95));
    return 65 - 15 * easeS(seg(t, 0.95, 1));
  }

  double get i => iDeg * math.pi / 180;
  double get r => math.asin(math.sin(i) / n);

  Offset get o1 => const Offset(ox, top);
  Offset get o2 => Offset(ox + (bottom - top) * math.tan(r), bottom);
  Offset get dir => Offset(math.sin(i), math.cos(i)); // down and to the right
  Offset get start => o1 - dir * 175;
  Offset get end => o2 + dir * 175;

  @override
  void draw() {
    _slab();
    _normals();
    _rays();
    _angles();
    _snell(const Rect.fromLTWH(636, 52, 340, 214));
    _graph(const Rect.fromLTWH(636, 282, 340, 262));
    _labels();
  }

  void _slab() {
    const front = Rect.fromLTRB(left, top, right, bottom);
    // Receding top and right faces.
    final topFace = Path()
      ..moveTo(left, top)
      ..lineTo(left + depth.dx, top + depth.dy)
      ..lineTo(right + depth.dx, top + depth.dy)
      ..lineTo(right, top)
      ..close();
    final side = Path()
      ..moveTo(right, top)
      ..lineTo(right + depth.dx, top + depth.dy)
      ..lineTo(right + depth.dx, bottom + depth.dy)
      ..lineTo(right, bottom)
      ..close();
    c.drawPath(topFace, Paint()..color = tone(TP.glass, 0.35));
    c.drawPath(side, Paint()..color = tone(TP.glass, -0.08));
    c.drawRect(front, vGrad(front, [tone(TP.glass, 0.2), TP.glass, tone(TP.glass, -0.04)]));
    // A faint reflection band across the front face.
    c.drawPath(
      Path()
        ..moveTo(left + 120, top)
        ..lineTo(left + 170, top)
        ..lineTo(left + 90, bottom)
        ..lineTo(left + 40, bottom)
        ..close(),
      Paint()..color = Colors.white.withValues(alpha: 0.35),
    );
    final edge = linePaint(TP.glassEdge, LW.line);
    c.drawPath(topFace, edge);
    c.drawPath(side, edge);
    c.drawRect(front, edge);
    note(tr('Air|वायु|ಗಾಳಿ'), const Offset(560, 196), size: 13, color: TP.ink2, align: 1, italic: true);
    note(tr('Glass (n = 1.50)|काँच (n = 1.50)|ಗಾಜು (n = 1.50)'), const Offset(576, 252), size: 13, color: tone(TP.glassEdge, -0.4), align: 1, italic: true, halo: false);
    note(tr('Air|वायु|ಗಾಳಿ'), const Offset(560, 430), size: 13, color: TP.ink2, align: 1, italic: true);
  }

  void _normals() {
    for (final p in [o1, o2]) {
      dash(p - const Offset(0, 104), p + const Offset(0, 104), TP.hair, on: 6, off: 4);
    }
  }

  void _rays() {
    final a = seg(t, 0.02, 0.22), b = seg(t, 0.25, 0.46), d = seg(t, 0.5, 0.68);
    // Ray box at the start: a dark housing with a slit, aimed along the ray.
    final ang = dir.direction;
    c.save();
    c.translate(start.dx, start.dy);
    c.rotate(ang);
    final box = RRect.fromRectAndRadius(const Rect.fromLTRB(-62, -13, -2, 13), const Radius.circular(3));
    c.drawRRect(box, vGrad(const Rect.fromLTRB(-62, -13, -2, 13), [tone(TP.graphite, 0.25), TP.graphite]));
    c.drawRect(const Rect.fromLTRB(-4, -2, 0, 2), Paint()..color = const Color(0xFFFFD9A0));
    c.restore();
    void beam(Offset p, Offset q, double k) {
      if (k <= 0) return;
      final e = lerpO(p, q, k);
      c.drawLine(p, e, linePaint(TP.red.withValues(alpha: 0.16), 6));
      c.drawLine(p, e, linePaint(TP.red, 1.7));
      if (k > 0.55) midArrow(p, q, TP.red, k: 0.5, len: 11);
    }

    // Wavefronts across the beam: λ in air, λ/n in glass, moving with the light.
    void fronts(Offset p, Offset q, double spacing, double k) {
      if (k <= 0) return;
      final u = (q - p) / (q - p).distance;
      final nrm = Offset(-u.dy, u.dx);
      final len = (q - p).distance * k;
      for (var s = fr(t * 9) * spacing; s < len; s += spacing) {
        final c0 = p + u * s;
        c.drawLine(c0 - nrm * 6, c0 + nrm * 6, linePaint(TP.red.withValues(alpha: 0.2), LW.hair));
      }
    }

    fronts(start, o1, 27, a);
    fronts(o1, o2, 18, b);
    fronts(o2, end, 27, d);
    beam(start, o1, a);
    beam(o1, o2, b);
    beam(o2, end, d);
    // The incident ray continued (dashed), and the lateral displacement d between it and the
    // emergent ray.
    final show = seg(t, 0.62, 0.68);
    if (show > 0) {
      final ext = o1 + dir * ((bottom + 80 - top) / math.cos(i));
      dashPath(
        Path()
          ..moveTo(o1.dx, o1.dy)
          ..lineTo(ext.dx, ext.dy),
        TP.red.withValues(alpha: 0.55 * show),
        w: LW.fine,
        on: 6,
        off: 5,
      );
      final q = o2 + dir * 70;
      final foot = o1 + dir * ((q - o1).dx * dir.dx + (q - o1).dy * dir.dy);
      dimension(foot, q, '', col: TP.ink, opacity: show, tick: 4);
      note('d', lerpO(foot, q, 0.5) + Offset(dir.dy, -dir.dx) * -12 + const Offset(6, 6), size: 15, color: TP.ink, italic: true, weight: FontWeight.w600, align: 0, opacity: show);
    }
  }

  void _angles() {
    final si = seg(t, 0.18, 0.24), sr = seg(t, 0.42, 0.48), se = seg(t, 0.64, 0.7);
    angleArc(o1, 46, -math.pi / 2 - i, i, 'i', opacity: si, labelR: 60);
    angleArc(o1, 52, math.pi / 2 - r, r, 'r', opacity: sr, labelR: 66);
    angleArc(o2, 46, math.pi / 2 - i, i, 'e', opacity: se, labelR: 60);
  }

  void _snell(Rect rc) {
    panel(rc, title: "Snell's law|स्नेल का नियम|ಸ್ನೆಲ್ ನಿಯಮ");
    final x = rc.left + 18;
    final showR = t >= 0.42;
    final showN = t >= 0.72;
    String f1(double v) => v.toStringAsFixed(1);
    String f3(double v) => v.toStringAsFixed(3);
    note('i = ${f1(iDeg)}°', Offset(x, rc.top + 52), size: 16, color: TP.ink, weight: FontWeight.w600, halo: false);
    note('sin i = ${f3(math.sin(i))}', Offset(x + 160, rc.top + 52), size: 14, color: TP.ink2, halo: false);
    note('r = ${f1(r * 180 / math.pi)}°', Offset(x, rc.top + 84), size: 16, color: TP.ink, weight: FontWeight.w600, halo: false, opacity: showR ? 1 : 0.25);
    note('sin r = ${f3(math.sin(r))}', Offset(x + 160, rc.top + 84), size: 14, color: TP.ink2, halo: false, opacity: showR ? 1 : 0.25);
    c.drawLine(Offset(x, rc.top + 108), Offset(rc.right - 18, rc.top + 108), linePaint(TP.rule, LW.hair));
    note('n = sin i ⁄ sin r = ${(math.sin(i) / math.sin(r)).toStringAsFixed(2)}', Offset(x, rc.top + 136), size: 18, color: TP.ink, weight: FontWeight.w600, halo: false, opacity: showN ? 1 : 0.25);
    note(
      tr('e = i: the emergent ray is parallel to the incident ray|e = i: निर्गत किरण आपतित किरण के समांतर है|e = i: ನಿರ್ಗಮ ಕಿರಣ ಪತನ ಕಿರಣಕ್ಕೆ ಸಮಾಂತರ'),
      Offset(x, rc.top + 178),
      size: 12.5,
      color: TP.ink2,
      halo: false,
      maxWidth: rc.width - 36,
      opacity: t >= 0.6 ? 1 : 0.25,
    );
  }

  void _graph(Rect rc) {
    panel(rc, title: 'sin i against sin r|sin i बनाम sin r|sin i ಮತ್ತು sin r');
    final g = Rect.fromLTRB(rc.left + 56, rc.top + 46, rc.right - 30, rc.bottom - 40);
    for (var k = 1; k <= 4; k++) {
      final x = g.left + g.width * k / 4, y = g.bottom - g.height * k / 4;
      c.drawLine(Offset(x, g.top), Offset(x, g.bottom), linePaint(TP.grid, LW.hair));
      c.drawLine(Offset(g.left, y), Offset(g.right, y), linePaint(TP.grid, LW.hair));
      note((k / 4).toStringAsFixed(2), Offset(x, g.bottom + 12), size: 10, color: TP.ink2, align: 0, halo: false);
      note((k / 4).toStringAsFixed(2), Offset(g.left - 6, y), size: 10, color: TP.ink2, align: 1, halo: false);
    }
    axes(Rect.fromLTRB(g.left, g.top - 4, g.right + 6, g.bottom), origin: g.bottomLeft);
    note('sin r', Offset(g.right, g.bottom + 26), size: 12.5, color: TP.ink2, align: 1, italic: true);
    note('sin i', Offset(g.left - 8, g.top - 12), size: 12.5, color: TP.ink2, align: 1, italic: true);
    Offset at(double sr, double si) => Offset(g.left + g.width * sr, g.bottom - g.height * si);
    // The line sin i = n sin r.
    if (t >= 0.72) {
      final k = seg(t, 0.72, 0.78);
      c.drawLine(at(0, 0), lerpO(at(0, 0), at(1 / n, 1), k), linePaint(TP.plum.withValues(alpha: 0.7), LW.fine));
      if (k >= 1) note(tr('slope = n = 1.50|ढाल = n = 1.50|ಇಳಿಜಾರು = n = 1.50'), at(0.42, 0.78), size: 12.5, color: TP.plum, align: 1);
    }
    // Readings taken so far, and the present one.
    final readings = <double>[50];
    if (t >= 0.82) readings.add(40);
    if (t >= 0.86) readings.add(30);
    if (t >= 0.93) readings.add(60);
    for (final d in readings) {
      final ii = d * math.pi / 180;
      final p = at(math.sin(ii) / n, math.sin(ii));
      c.drawCircle(p, 3.2, Paint()..color = TP.paper2);
      c.drawCircle(p, 3.2, linePaint(TP.ink, LW.fine));
    }
    if (t >= 0.42) sphere(at(math.sin(r), math.sin(i)), 4.4, TP.red);
  }

  void _labels() {
    tag('N|N|N', o1 + const Offset(0, -116), size: 13, color: TP.ink2);
    tag('N′|N′|N′', o1 + const Offset(0, 116), size: 13, color: TP.ink2);
    tag('M|M|M', o2 + const Offset(0, -116), size: 13, color: TP.ink2);
    tag('M′|M′|M′', o2 + const Offset(0, 116), size: 13, color: TP.ink2);
    tag('O|O|O', o1 + const Offset(-12, -12), size: 13, weight: FontWeight.w600);
    if (t >= 0.25) tag('O′|O′|O′', o2 + const Offset(-14, 14), size: 13, weight: FontWeight.w600);
    callout('Ray box|किरण बॉक्स|ಕಿರಣ ಪೆಟ್ಟಿಗೆ', start - dir * 34, start - dir * 34 + const Offset(30, -30), size: 13);
    callout('Incident ray|आपतित किरण|ಪತನ ಕಿರಣ', lerpO(start, o1, 0.4), lerpO(start, o1, 0.4) + const Offset(-46, 14), side: -1, size: 13);
    callout('Refracted ray|अपवर्तित किरण|ವಕ್ರೀಭವಿತ ಕಿರಣ', lerpO(o1, o2, 0.7), const Offset(470, 290), size: 13, opacity: seg(t, 0.3, 0.36));
    callout('Emergent ray|निर्गत किरण|ನಿರ್ಗಮ ಕಿರಣ', lerpO(o2, end, 0.8), lerpO(o2, end, 0.8) + const Offset(40, 24), size: 13, opacity: seg(t, 0.6, 0.66));
    callout('Normal|अभिलंब|ಲಂಬ', o1 + const Offset(0, -78), o1 + const Offset(44, -92), size: 13);
    if (t >= 0.62) {
      final q = o2 + dir * 70;
      final foot = o1 + dir * ((q - o1).dx * dir.dx + (q - o1).dy * dir.dy);
      tag('d: lateral displacement|d: पार्श्व विस्थापन|d: ಪಾರ್ಶ್ವ ಸ್ಥಳಾಂತರ', foot + const Offset(14, 2), size: 12.5, color: TP.ink2, align: -1, opacity: seg(t, 0.62, 0.68));
    }
  }
}
