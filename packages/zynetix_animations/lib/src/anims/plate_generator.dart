import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../draw.dart';

/// The AC generator: a rectangular coil turned between the poles of a magnet, slip rings and
/// brushes, a centre-zero galvanometer and a lamp; beside it the induced EMF against time and a
/// view from above giving the angle θ between the coil's normal and the field.
///
/// The coil starts face-on to the viewer, its plane along the field (θ = 90°, no flux through
/// it); it turns with angle α from there, so θ = α + 90° and ε = NBAω sin θ = NBAω cos α.
class GeneratorPlate extends AnimPainter {
  GeneratorPlate(super.f);

  static const cx = 310.0, cy = 262.0, a = 100.0, b = 84.0, elev = 0.27;
  static const period = 5.0; // seconds per turn at full speed
  static const runSeconds = 20.0;

  /// Seconds since the coil started turning.
  double uAt(double tt) => math.max(0, (tt - 0.2) * runSeconds);

  /// The speed as a fraction of full speed (it eases up over the first 2 s).
  double speedAt(double tt) {
    final u = uAt(tt);
    return u >= 2 ? 1 : easeS(u / 2);
  }

  /// The angle turned, α (radians).
  double alphaAt(double tt) {
    final u = uAt(tt);
    final w = tau / period;
    return u >= 2 ? w * (1 + (u - 2)) : w * (u / 2 - math.sin(math.pi * u / 2) / math.pi);
  }

  /// The induced EMF as a fraction of its peak.
  double emfAt(double tt) => speedAt(tt) * math.cos(alphaAt(tt));

  double get alpha => alphaAt(t);
  double get emf => emfAt(t);

  /// A point of the coil's space on the canvas: seen from a little above, in perspective.
  Offset proj(double x, double y, double z) {
    final depth = z * math.cos(elev) + y * math.sin(elev);
    final s = 760 / (760 - depth);
    return Offset(cx + x * s, cy + (-y * math.cos(elev) + z * math.sin(elev)) * s);
  }

  @override
  void draw() {
    _magnet();
    _coilAndRings();
    _external();
    _graph(const Rect.fromLTWH(626, 52, 352, 278));
    _topView(const Rect.fromLTWH(626, 346, 352, 196));
    _labels();
  }

  void _magnet() {
    // Two pole pieces with concave faces, and the field running N → S between them.
    Path pole(double x0, double x1, bool left) {
      final face = left ? x1 : x0;
      final back = left ? x0 : x1;
      final bulge = left ? -18.0 : 18.0;
      return Path()
        ..moveTo(back, 140)
        ..lineTo(face, 140)
        ..quadraticBezierTo(face + bulge, 262, face, 384)
        ..lineTo(back, 384)
        ..close();
    }

    final n = pole(58, 176, true), s = pole(444, 562, false);
    c.drawPath(n, hGrad(const Rect.fromLTRB(58, 140, 176, 384), [tone(TP.red, -0.15), tone(TP.red, 0.25), TP.red]));
    c.drawPath(n, linePaint(tone(TP.red, -0.5), LW.line));
    c.drawPath(s, hGrad(const Rect.fromLTRB(444, 140, 562, 384), [TP.blue, tone(TP.blue, 0.25), tone(TP.blue, -0.15)]));
    c.drawPath(s, linePaint(tone(TP.blue, -0.5), LW.line));
    note('N', const Offset(108, 262), size: 40, color: Colors.white.withValues(alpha: 0.92), align: 0, halo: false, weight: FontWeight.w600);
    note('S', const Offset(512, 262), size: 40, color: Colors.white.withValues(alpha: 0.92), align: 0, halo: false, weight: FontWeight.w600);
    for (var i = 0; i < 7; i++) {
      final y = 168 + i * 31.0;
      final x0 = 176 - 18 * (1 - math.pow((y - 262) / 122, 2)) * 1.0 + 4;
      final x1 = 444 + 18 * (1 - math.pow((y - 262) / 122, 2)) * 1.0 - 4;
      c.drawLine(Offset(x0, y), Offset(x1, y), linePaint(TP.hair, LW.hair));
      dart(Offset(x0 + 40, y), 0, TP.ink2, len: 7);
      dart(Offset(x1 - 26, y), 0, TP.ink2, len: 7);
    }
  }

  void _coilAndRings() {
    final al = alpha;
    final ca = math.cos(al), sa = math.sin(al);
    // Side A (x = +a cos α, z = +a sin α) is in front when sin α > 0.
    final aFront = sa >= 0;
    final k = (t >= 0.42 ? 1.0 : 0.0) * emf;
    final copper = TP.copper;
    // Several turns, offset along the coil's normal (−sin α, 0, cos α).
    void loop(double off, bool front) {
      final nx = -sa * off, nz = ca * off;
      Offset p(double sx, double y) => proj(sx * a * ca + nx, y, sx * a * sa + nz);
      final aTop = p(1, b), aBot = p(1, -b), bTop = p(-1, b), bBot = p(-1, -b);
      final w = front ? LW.wire : LW.wire * 0.8;
      final col = front ? copper : tone(copper, 0.35);
      // Top and bottom edges run from side to side; each side is front or back.
      final sideA = [aTop, aBot], sideB = [bTop, bBot];
      if (front) {
        final s = aFront ? sideA : sideB;
        c.drawLine(s[0], s[1], linePaint(tone(col, -0.3), w + 1.2));
        c.drawLine(s[0], s[1], linePaint(col, w));
        c.drawLine(aTop, bTop, linePaint(col, w));
        c.drawLine(aBot, bBot, linePaint(col, w));
      } else {
        final s = aFront ? sideB : sideA;
        c.drawLine(s[0], s[1], linePaint(col, w));
      }
    }

    for (final o in [-6.0, -2.0, 2.0, 6.0]) {
      loop(o, false);
    }
    // Axle (behind the front of the coil).
    final top = proj(0, b, 0), bottom = proj(0, -b, 0);
    cylinderV(Rect.fromLTRB(cx - 4, 108, cx + 4, top.dy), TP.steel);
    cylinderV(Rect.fromLTRB(cx - 4, bottom.dy, cx + 4, 470), TP.steel);
    for (final o in [-6.0, -2.0, 2.0, 6.0]) {
      loop(o, true);
    }
    // Induced current on the two long sides: up side A, down side B (for ε > 0).
    if (k.abs() > 0.08) {
      final op = (k.abs() - 0.08).clamp(0.0, 1.0);
      final sgn = k > 0 ? 1.0 : -1.0;
      for (final side in [1.0, -1.0]) {
        final dir = side * sgn; // +1: current upward
        final x = side * a * ca, z = side * a * sa;
        final from = proj(x, -26 * dir, z) + Offset(side * ca >= 0 ? 14 : -14, 0);
        final to = proj(x, 26 * dir, z) + Offset(side * ca >= 0 ? 14 : -14, 0);
        arrowTo(from, to, TP.red, w: LW.bold, len: 10, opacity: op);
      }
    }
    // Crank on top, with the turning arrow.
    final crank = proj(26 * math.cos(al + math.pi / 2), 0, 26 * math.sin(al + math.pi / 2)) - Offset(0, cy - 108);
    c.drawLine(const Offset(cx, 108), crank, linePaint(TP.steelDark, 3.4));
    cylinderV(Rect.fromCenter(center: crank - const Offset(0, 9), width: 8, height: 18), TP.wood, radius: 3);
    if (t >= 0.2) {
      final arc = Path()..addArc(Rect.fromCenter(center: const Offset(cx, 108), width: 92, height: 92 * math.sin(elev) * 1.6), 0.2, 2.2);
      c.drawPath(arc, linePaint(TP.ink2, LW.fine));
      pathHeads(arc, TP.ink2, [1.0], len: 9);
    }
    // Slip rings (each joined to one end of the coil) and carbon brushes.
    for (final y in [418.0, 446.0]) {
      final r = Rect.fromCenter(center: Offset(cx, y), width: 50, height: 14);
      c.drawRRect(
        RRect.fromRectAndRadius(Rect.fromLTRB(r.left, y - 6, r.right, y + 6), const Radius.circular(3)),
        hGrad(r, [tone(TP.copper, -0.2), TP.copperLight, TP.copper, tone(TP.copper, -0.4)], const [0, 0.35, 0.65, 1]),
      );
      c.drawOval(Rect.fromCenter(center: Offset(cx, y - 6), width: 50, height: 10), Paint()..color = TP.copperLight);
      c.drawOval(Rect.fromCenter(center: Offset(cx, y - 6), width: 50, height: 10), linePaint(TP.copperDark, LW.hair));
      c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTRB(r.left, y - 6, r.right, y + 6), const Radius.circular(3)), linePaint(TP.copperDark, LW.hair));
    }
    // Leads from the coil down the axle to the rings.
    c.drawLine(bottom + const Offset(-6, 0), const Offset(cx - 6, 412), linePaint(TP.copperDark, 1.2));
    c.drawLine(bottom + const Offset(6, 0), const Offset(cx + 6, 440), linePaint(TP.copperDark, 1.2));
    block(const Rect.fromLTRB(cx - 52, 410, cx - 25, 426), TP.graphite, radius: 2);
    block(const Rect.fromLTRB(cx + 25, 438, cx + 52, 454), TP.graphite, radius: 2);
  }

  void _external() {
    final k = t >= 0.42 ? emf : 0.0;
    wire(wireRun([const Offset(cx - 52, 418), const Offset(180, 418), const Offset(180, 540), const Offset(226, 540)]));
    wire(wireRun([const Offset(294, 540), const Offset(392, 540)]));
    wire(wireRun([const Offset(448, 540), const Offset(500, 540), const Offset(500, 446), const Offset(cx + 52, 446)]));
    // Centre-zero galvanometer.
    const g = Offset(260, 540);
    c.drawCircle(g, 34, vGrad(Rect.fromCircle(center: g, radius: 34), [tone(TP.graphite, 0.2), TP.graphite]));
    c.drawCircle(g, 28, Paint()..color = const Color(0xFFF8F5EC));
    c.drawCircle(g, 28, linePaint(TP.ink2, LW.hair));
    final pv = g + const Offset(0, 16);
    for (var i = -4; i <= 4; i++) {
      final an = -math.pi / 2 + i * 0.16;
      c.drawLine(polar(pv, 34, an), polar(pv, i == 0 ? 26 : 30, an), linePaint(TP.ink, LW.hair));
    }
    note('G', g + const Offset(-14, 8), size: 10.5, color: TP.ink2, align: 0, halo: false, weight: FontWeight.w700);
    c.drawLine(pv, polar(pv, 32, -math.pi / 2 + k * 0.6), linePaint(TP.red, 1.1));
    c.drawCircle(pv, 2.4, Paint()..color = TP.ink);
    // Lamp.
    const l = Offset(420, 540);
    glow(l, 46, const Color(0xFFF4C66A), k.abs());
    c.drawCircle(
      l,
      20,
      Paint()
        ..shader = RadialGradient(
          center: const Alignment(-0.3, -0.4),
          colors: [Colors.white, Color.lerp(TP.glass, const Color(0xFFFBE3A6), k.abs())!],
        ).createShader(Rect.fromCircle(center: l, radius: 20)),
    );
    c.drawCircle(l, 20, linePaint(TP.glassEdge, LW.line));
    final fil = Path()..moveTo(l.dx - 28, l.dy);
    fil.lineTo(l.dx - 10, l.dy);
    for (var i = 0; i <= 12; i++) {
      fil.lineTo(l.dx - 10 + 20 * i / 12, l.dy + (i.isEven ? -4 : 4));
    }
    fil.lineTo(l.dx + 28, l.dy);
    c.drawPath(fil, linePaint(Color.lerp(TP.graphite, const Color(0xFFE0962E), k.abs())!, 1.1));
  }

  void _graph(Rect r) {
    panel(r, title: 'Induced EMF against time|प्रेरित विद्युत वाहक बल बनाम समय|ಪ್ರೇರಿತ ವಿ.ಚಾ.ಬ ಮತ್ತು ಸಮಯ');
    final plotR = Rect.fromLTRB(r.left + 40, r.top + 50, r.right - 22, r.bottom - 40);
    final o = Offset(plotR.left, plotR.center.dy);
    // Grid: quarter-turn lines.
    final full = tau / period;
    final tEnd = 1.0;
    double xOf(double tt) => plotR.left + (tt - 0.2) / (tEnd - 0.2) * plotR.width;
    // Times when α passes multiples of π/2 (at full speed after 2 s): α = ω(u − 1).
    for (var q = 1; q < 40; q++) {
      final u = q * (math.pi / 2) / full + 1;
      final tt = 0.2 + u / runSeconds;
      if (tt > tEnd) break;
      final x = xOf(tt);
      c.drawLine(Offset(x, plotR.top), Offset(x, plotR.bottom), linePaint(TP.grid, LW.hair));
    }
    final peak = plotR.height / 2 - 8;
    c.drawLine(Offset(plotR.left, o.dy - peak), Offset(plotR.right, o.dy - peak), linePaint(TP.grid, LW.hair));
    c.drawLine(Offset(plotR.left, o.dy + peak), Offset(plotR.right, o.dy + peak), linePaint(TP.grid, LW.hair));
    axes(Rect.fromLTRB(plotR.left, plotR.top - 6, plotR.right + 6, plotR.bottom), origin: o, x: 't|t|t', y: 'ε|ε|ε');
    note('+ε₀', Offset(plotR.left - 6, o.dy - peak), size: 11.5, color: TP.ink2, align: 1, halo: false);
    note('−ε₀', Offset(plotR.left - 6, o.dy + peak), size: 11.5, color: TP.ink2, align: 1, halo: false);
    note(tr('One grid line every quarter turn|हर चौथाई चक्कर पर एक रेखा|ಪ್ರತಿ ಕಾಲು ಸುತ್ತಿಗೆ ಒಂದು ಗೆರೆ'), Offset(r.left + 14, r.bottom - 16), size: 11, color: TP.ink2, halo: false);
    if (t > 0.2) {
      final p = Path();
      const n = 240;
      final upto = math.min(t, tEnd);
      for (var i = 0; i <= n; i++) {
        final tt = 0.2 + (upto - 0.2) * i / n;
        final q = Offset(xOf(tt), o.dy - peak * emfAt(tt));
        i == 0 ? p.moveTo(q.dx, q.dy) : p.lineTo(q.dx, q.dy);
      }
      c.drawPath(p, linePaint(TP.red, LW.bold));
      final now = Offset(xOf(upto), o.dy - peak * emfAt(upto));
      c.drawLine(Offset(now.dx, plotR.top), Offset(now.dx, plotR.bottom), linePaint(TP.ink2.withValues(alpha: 0.5), LW.hair));
      sphere(now, 4.2, TP.red);
    }
    // One period, marked once the trace has two peaks.
    final mark = seg(t, 0.66, 0.7);
    if (mark > 0) {
      final tp1 = 0.2 + (2 * math.pi / full + 1) / runSeconds; // α = 2π: a peak
      final tp2 = 0.2 + (4 * math.pi / full + 1) / runSeconds;
      dimension(Offset(xOf(tp1), plotR.top + 4), Offset(xOf(tp2), plotR.top + 4), 'T (one turn)|T (एक चक्कर)|T (ಒಂದು ಸುತ್ತು)', labelOffset: const Offset(0, -11), opacity: mark, size: 12);
    }
  }

  void _topView(Rect r) {
    panel(r, title: 'Seen from above|ऊपर से|ಮೇಲಿನಿಂದ');
    final o = Offset(r.left + 100, r.top + 112);
    // Pole faces and field.
    c.drawRect(Rect.fromLTRB(o.dx - 88, o.dy - 46, o.dx - 70, o.dy + 46), Paint()..color = TP.red);
    c.drawRect(Rect.fromLTRB(o.dx + 70, o.dy - 46, o.dx + 88, o.dy + 46), Paint()..color = TP.blue);
    note('N', Offset(o.dx - 79, o.dy), size: 12, color: Colors.white, align: 0, halo: false, weight: FontWeight.w700);
    note('S', Offset(o.dx + 79, o.dy), size: 12, color: Colors.white, align: 0, halo: false, weight: FontWeight.w700);
    for (final y in [-30.0, 0.0, 30.0]) {
      c.drawLine(Offset(o.dx - 66, o.dy + y), Offset(o.dx + 66, o.dy + y), linePaint(TP.hair, LW.hair));
      dart(Offset(o.dx + 60, o.dy + y), 0, TP.ink2, len: 6);
    }
    note('B', Offset(o.dx + 46, o.dy - 40), size: 13, color: TP.ink2, align: 0, italic: true, weight: FontWeight.w600);
    // The coil (edge-on from above) and its normal.
    final al = alpha;
    final dir = Offset(math.cos(al), math.sin(al));
    final nrm = Offset(-math.sin(al), math.cos(al));
    c.drawLine(o - dir * 44, o + dir * 44, linePaint(TP.copper, 4));
    arrowTo(o, o + nrm * 46, TP.plum, w: LW.fine, len: 8);
    note('n', o + nrm * 56, size: 13, color: TP.plum, align: 0, italic: true, weight: FontWeight.w600);
    // θ from B (+x) to n.
    final th = math.atan2(nrm.dy, nrm.dx);
    final sweep = ((th % tau) + tau) % tau;
    c.drawArc(Rect.fromCircle(center: o, radius: 20), 0, sweep, false, linePaint(TP.plum, LW.fine));
    // Readout.
    final thetaDeg = ((sweep * 180 / math.pi).round()) % 360;
    final tx = r.left + 212;
    note('θ = $thetaDeg°', Offset(tx, r.top + 62), size: 17, color: TP.ink, weight: FontWeight.w600, halo: false);
    note('Φ = NBA cos θ', Offset(tx, r.top + 98), size: 14, color: TP.ink, halo: false);
    note('ε = NBAω sin θ', Offset(tx, r.top + 124), size: 14, color: TP.ink, halo: false);
    final cs = math.cos(sweep).abs();
    final hint = cs < 0.2 ? 'Φ ≈ 0: ε largest|Φ ≈ 0: ε अधिकतम|Φ ≈ 0: ε ಗರಿಷ್ಠ' : (cs > 0.98 ? 'Φ largest: ε ≈ 0|Φ अधिकतम: ε ≈ 0|Φ ಗರಿಷ್ಠ: ε ≈ 0' : '');
    if (hint.isNotEmpty) note(tr(hint), Offset(tx, r.top + 158), size: 12.5, color: TP.red, halo: false, weight: FontWeight.w600);
  }

  void _labels() {
    callout('Coil (armature)|कुंडली (आर्मेचर)|ಸುರುಳಿ (ಆರ್ಮೇಚರ್)', proj(-a * math.cos(alpha) * 0.5, b, -a * math.sin(alpha) * 0.5) + const Offset(0, -2), const Offset(196, 112), side: -1, size: 13.5);
    callout('Magnetic field lines|चुंबकीय क्षेत्र रेखाएँ|ಕಾಂತೀಯ ಕ್ಷೇತ್ರ ರೇಖೆಗಳು', const Offset(420, 168), const Offset(470, 112), size: 13.5);
    callout('Slip rings|सर्पी वलय|ಜಾರು ಉಂಗುರಗಳು', const Offset(cx + 20, 422), const Offset(400, 398), size: 13.5);
    callout('Carbon brushes|कार्बन ब्रश|ಕಾರ್ಬನ್ ಕುಂಚಗಳು', const Offset(cx - 46, 418), const Offset(196, 392), side: -1, size: 13.5);
    callout('Galvanometer|गैल्वेनोमीटर|ಗ್ಯಾಲ್ವನೋಮೀಟರ್', const Offset(236, 516), const Offset(150, 500), side: -1, size: 13.5);
    callout('Axle|धुरा|ಅಕ್ಷ', const Offset(cx + 4, 130), const Offset(360, 86), size: 13.5);
    if (t >= 0.42 && t < 0.66) {
      tag('I|I|I', proj(a * math.cos(alpha), 0, a * math.sin(alpha)) + Offset(math.cos(alpha) >= 0 ? 32 : -32, 0), size: 15, color: TP.red, weight: FontWeight.w600);
    }
  }
}
