import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../draw.dart';

/// States of matter: ice heated in a beaker over a Bunsen burner (tripod, gauze, a thermometer
/// held by a clamp), a magnified view of the water molecules, and the heating curve with its
/// two flat steps at 0 °C and 100 °C.
class StatesPlate extends AnimPainter {
  StatesPlate(super.f);

  /// Temperature (°C) at time [x]: it rises, stays at 0 °C while the ice melts, rises again, and
  /// stays at 100 °C while the water boils away.
  static double temp(double x) {
    if (x < 0.2) return -20 + 20 * x / 0.2;
    if (x < 0.36) return 0;
    if (x < 0.56) return 100 * (x - 0.36) / 0.2;
    return 100;
  }

  double get melt => seg(t, 0.2, 0.36);
  double get boil => seg(t, 0.56, 0.72);
  double get gas => seg(t, 0.72, 1);

  @override
  void draw() {
    _apparatus();
    _molecules(const Offset(492, 270), 132);
    _curve(const Rect.fromLTWH(652, 52, 324, 492));
    _labels();
  }

  // ---- apparatus ----

  void _apparatus() {
    const bk = Rect.fromLTRB(110, 250, 250, 400);
    // Retort stand: base, rod, clamp holding the thermometer.
    block(const Rect.fromLTRB(26, 560, 120, 572), TP.steelDark, radius: 2);
    cylinderV(const Rect.fromLTRB(46, 96, 54, 562), TP.steel);
    block(const Rect.fromLTRB(50, 128, 200, 136), TP.steel, radius: 2);
    block(const Rect.fromLTRB(194, 120, 212, 144), TP.graphite, radius: 3);
    // Burner, tripod and gauze.
    _burner(const Offset(180, 560));
    for (final x in [124.0, 236.0]) {
      c.drawLine(Offset(x, 408), Offset(x + (x < 180 ? -14 : 14), 568), linePaint(TP.graphite, 3.2));
    }
    c.drawLine(const Offset(100, 408), const Offset(260, 408), linePaint(TP.graphite, 4));
    // Wire gauze.
    c.drawLine(const Offset(96, 403), const Offset(264, 403), linePaint(TP.steelDark, 2.4));
    for (var x = 100.0; x < 262; x += 6) {
      c.drawLine(Offset(x, 400), Offset(x + 3, 406), linePaint(TP.steel, 0.7));
    }
    // Contents.
    final level = _waterLevel();
    beaker(bk, level: level, liquid: TP.water);
    _ice(bk);
    _bubbles(bk, level);
    _steam(bk, level);
    // Thermometer: through the clamp into the beaker.
    _thermometer(const Offset(203, 120), 360);
  }

  double _waterLevel() {
    if (t < 0.2) return 0.06;
    if (t < 0.36) return 0.06 + 0.36 * melt;
    if (t < 0.56) return 0.42;
    if (t < 0.72) return 0.42 - 0.06 * boil;
    return 0.36 - 0.22 * gas;
  }

  void _ice(Rect bk) {
    if (melt >= 1) return;
    const cubes = [Offset(130, 378), Offset(162, 380), Offset(196, 377), Offset(228, 381), Offset(146, 352), Offset(180, 354), Offset(213, 351), Offset(162, 326), Offset(198, 327)];
    for (var i = 0; i < cubes.length; i++) {
      final k = (1 - ((melt - (i / cubes.length) * 0.5) * 2).clamp(0.0, 1.0));
      if (k <= 0) continue;
      final s = 28 * (0.35 + 0.65 * k);
      final o = cubes[i] + Offset(0, 14 * (1 - k));
      final r = RRect.fromRectAndRadius(Rect.fromCenter(center: o, width: s, height: s * 0.92), Radius.circular(3 + 5 * (1 - k)));
      c.save();
      c.translate(o.dx, o.dy);
      c.rotate((rnd(i) - 0.5) * 0.3);
      c.translate(-o.dx, -o.dy);
      c.drawRRect(
        r,
        Paint()..shader = LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Colors.white, const Color(0xFFE4F0F5), const Color(0xFFC6DCE6)]).createShader(r.outerRect),
      );
      c.drawRRect(r, linePaint(const Color(0xFF8FB2C2), LW.fine));
      c.drawLine(r.outerRect.topLeft + Offset(s * 0.2, s * 0.18), r.outerRect.topLeft + Offset(s * 0.55, s * 0.18), linePaint(Colors.white, 1.6));
      c.restore();
    }
  }

  void _bubbles(Rect bk, double level) {
    final k = t < 0.5 ? 0.0 : (t < 0.56 ? seg(t, 0.5, 0.56) * 0.3 : 1.0);
    if (k <= 0) return;
    final surface = bk.bottom - (bk.height - 1.5) * level;
    for (var i = 0; i < 22; i++) {
      if (rnd(i, 3) > k) continue;
      final ph = fr(rnd(i) + t * (5 + rnd(i, 1) * 3));
      final x = bk.left + 16 + rnd(i, 2) * (bk.width - 32) + math.sin(ph * 9 + i) * 2;
      final y = bk.bottom - 6 - ph * (bk.bottom - 6 - surface);
      final r = 1.5 + ph * 4;
      c.drawCircle(Offset(x, y), r, Paint()..color = Colors.white.withValues(alpha: 0.7));
      c.drawCircle(Offset(x, y), r, linePaint(TP.waterEdge.withValues(alpha: 0.7), 0.7));
    }
  }

  void _steam(Rect bk, double level) {
    final k = t < 0.45 ? 0.0 : (t < 0.56 ? seg(t, 0.45, 0.56) * 0.35 : 0.35 + 0.65 * boil);
    if (k <= 0) return;
    // Wisps of condensing vapour rising and fading above the beaker.
    for (var i = 0; i < 9; i++) {
      final ph = fr(rnd(i, 4) + t * 2.6);
      final x0 = bk.left + 14 + rnd(i, 5) * (bk.width - 28);
      final pts = <Offset>[];
      for (var s = 0; s <= 6; s++) {
        final y = bk.top + 4 - ph * 40 - s * 13.0;
        pts.add(Offset(x0 + math.sin(s * 0.9 + t * 24 + i * 2) * (2 + s * 1.6), y));
      }
      c.drawPath(smooth(pts), linePaint(const Color(0xFFB9C3C9).withValues(alpha: k * math.sin(math.pi * ph) * 0.55), 3 + ph * 3));
    }
  }

  void _burner(Offset base) {
    // Base, barrel with its air hole, and a steady flame (pale outer, blue inner cone).
    final flick = math.sin(t * 140) * 1.5;
    final outer = Path()
      ..moveTo(base.dx - 11, 466)
      ..quadraticBezierTo(base.dx - 16, 440, base.dx + flick, 414)
      ..quadraticBezierTo(base.dx + 16, 440, base.dx + 11, 466)
      ..close();
    c.drawPath(outer, vGrad(const Rect.fromLTRB(160, 414, 200, 466), [const Color(0x00C9D8F0), const Color(0xAAC9D8F0), const Color(0xCC9DB6E2)]));
    final inner = Path()
      ..moveTo(base.dx - 6, 466)
      ..quadraticBezierTo(base.dx - 6, 448, base.dx + flick * 0.5, 436)
      ..quadraticBezierTo(base.dx + 6, 448, base.dx + 6, 466)
      ..close();
    c.drawPath(inner, Paint()..color = const Color(0xFF4F74B8).withValues(alpha: 0.85));
    cylinderV(Rect.fromLTRB(base.dx - 9, 466, base.dx + 9, base.dy - 10), TP.steel, radius: 1);
    c.drawCircle(Offset(base.dx, 528), 3, Paint()..color = TP.graphite);
    final foot = Path()
      ..moveTo(base.dx - 34, base.dy)
      ..lineTo(base.dx - 22, base.dy - 12)
      ..lineTo(base.dx + 22, base.dy - 12)
      ..lineTo(base.dx + 34, base.dy)
      ..close();
    c.drawPath(foot, vGrad(Rect.fromLTRB(base.dx - 34, base.dy - 12, base.dx + 34, base.dy), [TP.steel, TP.steelDark]));
    c.drawPath(foot, linePaint(TP.steelDark, LW.fine));
    c.drawLine(Offset(base.dx + 34, base.dy - 4), Offset(base.dx + 70, base.dy - 2), linePaint(const Color(0xFF8C6A3E), 3));
  }

  void _thermometer(Offset top, double bottomY) {
    final tube = Rect.fromLTRB(top.dx - 4, top.dy - 30, top.dx + 4, bottomY);
    c.drawRRect(RRect.fromRectAndRadius(tube, const Radius.circular(4)), hGrad(tube, [const Color(0xFFE9F0F2), Colors.white, const Color(0xFFD5E0E4)]));
    c.drawRRect(RRect.fromRectAndRadius(tube, const Radius.circular(4)), linePaint(TP.glassEdge, LW.fine));
    final bulb = Offset(top.dx, bottomY + 4);
    // Scale from −20 °C to 110 °C along the stem.
    final y0 = bottomY - 14, y1 = top.dy + 10;
    double yOf(double tc) => y0 + (y1 - y0) * (tc + 20) / 130;
    for (var tc = -20; tc <= 110; tc += 10) {
      final y = yOf(tc.toDouble());
      c.drawLine(Offset(top.dx + 4, y), Offset(top.dx + (tc % 50 == 0 ? 10 : 7), y), linePaint(TP.ink2, LW.hair));
    }
    final yt = yOf(temp(t));
    c.drawLine(Offset(top.dx, bottomY), Offset(top.dx, yt), linePaint(TP.red, 2.4, cap: StrokeCap.butt));
    sphere(bulb, 6, TP.red);
  }

  // ---- molecules ----

  void _molecules(Offset o, double r) {
    final rect = Rect.fromCircle(center: o, radius: r);
    c.save();
    c.clipPath(Path()..addOval(rect));
    final bg = Color.lerp(Color.lerp(const Color(0xFFEFF4F7), const Color(0xFFE3EEF4), melt)!, const Color(0xFFF8F8F5), boil)!;
    c.drawCircle(o, r, Paint()..color = bg);
    const n = 42;
    final shake = 1.2 + 2.4 * seg(t, 0.12, 0.2) * (1 - melt);
    for (var i = 0; i < n; i++) {
      final row = i ~/ 7, col = i % 7;
      // Ice: a fixed lattice; each molecule only vibrates about its place.
      final lattice = o + Offset((col - 3) * 32.0 + (row.isOdd ? 16 : 0) - 8, (row - 2.5) * 30.0) + Offset(math.sin(t * 220 + i * 1.3), math.cos(t * 205 + i * 2.1)) * shake;
      // Water: close together but jumbled, wandering slowly past one another.
      final liquid =
          o +
          Offset((col - 3) * 31.0 + (rnd(i, 1) - 0.5) * 14, (row - 2.5) * 30.0 + (rnd(i, 2) - 0.5) * 14 + 14) +
          Offset(math.sin(t * 24 * (1 + rnd(i, 3)) + i * 2.3), math.cos(t * 21 * (1 + rnd(i, 4)) + i)) * 8;
      // Steam: a few molecules, far apart, flying straight and bouncing off the walls.
      final span = r * 0.66;
      Offset gasAt(double tt) => o + Offset((tri(fr(rnd(i, 5) + tt * (3.5 + rnd(i, 6) * 3))) * 2 - 1) * span, (tri(fr(rnd(i, 7) + tt * (3 + rnd(i, 8) * 3))) * 2 - 1) * span);
      final m = ((melt - rnd(i, 9) * 0.6) * 2.5).clamp(0.0, 1.0);
      final b = ((0.35 * boil + 0.65 * gas - rnd(i, 10) * 0.75) * 4).clamp(0.0, 1.0);
      final stays = i % 4 == 0; // one in four is still in view as steam
      var p = lerpO(lattice, liquid, easeS(m));
      final g = gasAt(t);
      if (b > 0) p = lerpO(p, stays ? g : p + Offset((rnd(i, 11) - 0.5) * 2, -1) * 400, easeS(b));
      final spin = rnd(i, 12) * tau + (m * t * 30 * (rnd(i, 13) - 0.5)) + b * t * 90 * (rnd(i, 14) - 0.5);
      if (stays && b > 0.6) {
        final tail = gasAt(t - 0.006);
        c.drawLine(tail, p, linePaint(TP.ink2.withValues(alpha: 0.25 * b), 1.2));
      }
      _water(p, spin);
    }
    c.restore();
    c.drawCircle(o, r, linePaint(TP.ink2, LW.line));
    // The magnifier's cone from the beaker.
    const src = Offset(232, 330);
    final d = o - src;
    final spread = math.asin((r / d.distance).clamp(0.0, 1.0));
    for (final s in [-1.0, 1.0]) {
      c.drawLine(src, src + Offset.fromDirection(d.direction + s * spread, math.sqrt(d.distanceSquared - r * r)), linePaint(TP.hair.withValues(alpha: 0.55), LW.hair));
    }
    c.drawCircle(src, 7, linePaint(TP.ink2, LW.hair));
    // State, under the view.
    final (name, how) = t < 0.2
        ? ('Solid|ठोस|ಘನ', 'fixed places; particles only vibrate|निश्चित स्थान; कण केवल कंपन करते हैं|ನಿಗದಿತ ಸ್ಥಳ; ಕಣಗಳು ಕಂಪಿಸುತ್ತವೆ ಅಷ್ಟೇ')
        : t < 0.36
        ? ('Melting|पिघलना|ಕರಗುವಿಕೆ', 'particles break free of their places|कण अपनी जगह छोड़ते हैं|ಕಣಗಳು ಸ್ಥಳ ಬಿಡುತ್ತವೆ')
        : t < 0.56
        ? ('Liquid|द्रव|ದ್ರವ', 'close together, sliding past each other|पास-पास, एक-दूसरे पर फिसलते|ಹತ್ತಿರ ಹತ್ತಿರ, ಒಂದರ ಮೇಲೊಂದು ಜಾರುತ್ತವೆ')
        : t < 0.72
        ? ('Boiling|उबलना|ಕುದಿಯುವಿಕೆ', 'particles escape as steam|कण भाप बनकर निकलते हैं|ಕಣಗಳು ಹಬೆಯಾಗಿ ಹೊರಹೋಗುತ್ತವೆ')
        : ('Gas|गैस|ಅನಿಲ', 'far apart, moving fast in all directions|दूर-दूर, सब दिशाओं में तेज़|ದೂರ ದೂರ, ಎಲ್ಲ ದಿಕ್ಕುಗಳಲ್ಲಿ ವೇಗವಾಗಿ');
    note(tr(name), o + Offset(0, r + 26), size: 20, weight: FontWeight.w600, align: 0);
    note(tr(how), o + Offset(0, r + 52), size: 13, color: TP.ink2, align: 0, maxWidth: 280);
  }

  /// A water molecule: an oxygen atom with two hydrogens at 104.5°.
  void _water(Offset p, double spin) {
    const half = 104.5 / 2 * math.pi / 180;
    for (final s in [-1.0, 1.0]) {
      sphere(p + Offset.fromDirection(spin + s * half, 7.6), 4.4, const Color(0xFFE9ECEE));
    }
    sphere(p, 7.4, const Color(0xFFC0594B));
  }

  // ---- heating curve ----

  void _curve(Rect r) {
    panel(r, title: 'Heating curve of water|पानी का तापन वक्र|ನೀರಿನ ತಾಪನ ವಕ್ರ');
    final g = Rect.fromLTRB(r.left + 56, r.top + 74, r.right - 22, r.bottom - 70);
    double yOf(double tc) => g.bottom - (tc + 30) / 150 * g.height;
    double xOf(double x) => g.left + x * g.width;
    for (final tc in [-20.0, 0.0, 20.0, 40.0, 60.0, 80.0, 100.0]) {
      final y = yOf(tc);
      c.drawLine(Offset(g.left, y), Offset(g.right, y), linePaint(tc == 0 || tc == 100 ? TP.rule : TP.grid, LW.hair));
      note('${tc.round()}', Offset(g.left - 8, y), size: 11, color: TP.ink2, align: 1, halo: false);
    }
    axes(Rect.fromLTRB(g.left, g.top - 10, g.right + 6, g.bottom), origin: Offset(g.left, g.bottom));
    note(tr('Temperature (°C)|तापमान (°C)|ತಾಪಮಾನ (°C)'), Offset(g.left - 40, g.top - 22), size: 12.5, color: TP.ink2, italic: true);
    note(tr('Time of heating →|गर्म करने का समय →|ಕಾಯಿಸಿದ ಸಮಯ →'), Offset(g.right, g.bottom + 18), size: 12.5, color: TP.ink2, align: 1, italic: true);
    // The whole curve faint, the part so far in ink, and the present point.
    final all = Path(), done = Path();
    for (var i = 0; i <= 200; i++) {
      final x = i / 200;
      final q = Offset(xOf(x), yOf(temp(x)));
      i == 0 ? all.moveTo(q.dx, q.dy) : all.lineTo(q.dx, q.dy);
      if (x <= t) i == 0 ? done.moveTo(q.dx, q.dy) : done.lineTo(q.dx, q.dy);
    }
    c.drawPath(all, linePaint(TP.rule, LW.bold));
    c.drawPath(done, linePaint(TP.red, LW.bold));
    final now = Offset(xOf(t), yOf(temp(t)));
    c.drawLine(Offset(now.dx, g.top), Offset(now.dx, g.bottom), linePaint(TP.ink2.withValues(alpha: 0.4), LW.hair));
    sphere(now, 4.6, TP.red);
    // Segment names under the curve.
    void seg2(double a, double b, String l3, double tc, {double dy = 22}) {
      final active = t >= a && t < b;
      note(
        tr(l3),
        Offset(xOf((a + b) / 2), yOf(tc) + dy),
        size: 11.5,
        color: active ? TP.ink : TP.ink2,
        align: 0,
        weight: active ? FontWeight.w600 : FontWeight.w500,
        maxWidth: 90,
        opacity: active ? 1 : 0.75,
      );
    }

    seg2(0, 0.2, 'solid|ठोस|ಘನ', -10, dy: 20);
    seg2(0.2, 0.36, 'solid + liquid|ठोस + द्रव|ಘನ + ದ್ರವ', 0, dy: 26);
    seg2(0.36, 0.56, 'liquid|द्रव|ದ್ರವ', 50, dy: 28);
    seg2(0.56, 1, 'liquid + gas|द्रव + गैस|ದ್ರವ + ಅನಿಲ', 100, dy: 22);
    note(tr('Melting point 0 °C|गलनांक 0 °C|ದ್ರವನ ಬಿಂದು 0 °C'), Offset(xOf(0.28), yOf(0) - 14), size: 12, color: TP.blue, align: 0, weight: FontWeight.w600);
    note(tr('Boiling point 100 °C|क्वथनांक 100 °C|ಕುದಿಯುವ ಬಿಂದು 100 °C'), Offset(xOf(0.78), yOf(100) - 14), size: 12, color: TP.red, align: 0, weight: FontWeight.w600);
    // The reading.
    note('${temp(t).round()} °C', Offset(r.left + 16, r.bottom - 26), size: 20, color: TP.ink, weight: FontWeight.w600, halo: false);
    final latent = (t >= 0.2 && t < 0.36) || t >= 0.56;
    note(
      tr(
        latent
            ? 'heat goes into changing the state; temperature stays the same|ऊष्मा अवस्था बदलने में लगती है; तापमान वही रहता है|ಶಾಖ ಸ್ಥಿತಿ ಬದಲಿಸಲು ಬಳಕೆಯಾಗುತ್ತದೆ; ತಾಪಮಾನ ಬದಲಾಗದು'
            : 'heat raises the temperature|ऊष्मा तापमान बढ़ाती है|ಶಾಖ ತಾಪಮಾನ ಏರಿಸುತ್ತದೆ',
      ),
      Offset(r.left + 96, r.bottom - 26),
      size: 11.5,
      color: TP.ink2,
      halo: false,
      maxWidth: r.width - 110,
    );
  }

  void _labels() {
    callout('Thermometer|तापमापी|ಉಷ್ಣಮಾಪಕ', const Offset(203, 200), const Offset(262, 186), size: 13);
    callout(t < 0.36 ? 'Ice|बर्फ़|ಮಂಜುಗಡ್ಡೆ' : 'Water|पानी|ನೀರು', const Offset(140, 372), const Offset(84, 300), side: -1, size: 13);
    callout('Wire gauze on a tripod|तिपाई पर तार की जाली|ಮುಕ್ಕಾಲಿಯ ಮೇಲೆ ತಂತಿ ಜಾಲರಿ', const Offset(250, 404), const Offset(292, 430), size: 13, maxWidth: 120);
    callout('Bunsen burner|बुन्सन बर्नर|ಬುನ್ಸೆನ್ ಬರ್ನರ್', const Offset(190, 500), const Offset(250, 512), size: 13);
    if (t >= 0.5) callout('Steam|भाप|ಹಬೆ', const Offset(150, 214), const Offset(96, 196), side: -1, size: 13, opacity: seg(t, 0.5, 0.56));
  }
}
