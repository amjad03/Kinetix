import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../draw.dart';

/// Diffusion and osmosis. First a crystal of potassium permanganate dissolving in a beaker of
/// water, its particles spreading out, and the concentration profile flattening (σ grows as
/// √t). Then a thistle-funnel osmometer: sugar solution behind a semi-permeable membrane in a
/// beaker of water, water crossing the membrane and the level in the stem rising.
class OsmosisPlate extends AnimPainter {
  OsmosisPlate(super.f);

  static const dye = Color(0xFF7D3C78);
  static const sugarCol = Color(0xFFC79A3E);

  bool get osmosisPhase => t >= 0.5;

  /// The spread of the dye, as a fraction of the box's length.
  double get sigma => 0.04 + 1.0 * math.pow(seg(t, 0.02, 0.44), 1.15);

  /// The rise of the solution in the stem (0..1).
  double get rise => (1 - math.exp(-3.2 * seg(t, 0.68, 0.98))) / (1 - math.exp(-3.2));

  @override
  void draw() {
    final k = easeS(seg(t, 0.48, 0.53));
    if (k < 1) {
      _fade(1 - k, () {
        _diffusionApparatus();
        _diffusionParticles(const Rect.fromLTWH(436, 52, 540, 300));
        _profile(const Rect.fromLTWH(436, 368, 540, 176));
      });
    }
    if (k > 0) {
      _fade(k, () {
        _osmometer();
        _membraneView(const Rect.fromLTWH(436, 52, 540, 300));
        _riseGraph(const Rect.fromLTWH(436, 368, 540, 176));
      });
    }
  }

  void _fade(double k, void Function() body) {
    if (k >= 1) return body();
    c.saveLayer(const Rect.fromLTWH(0, 0, 1000, 600), Paint()..color = Colors.black.withValues(alpha: k));
    body();
    c.restore();
  }

  // ---- diffusion ----

  void _diffusionApparatus() {
    const bk = Rect.fromLTRB(90, 196, 370, 476);
    const crystal = Offset(140, 462);
    // The dye cloud: concentrated near the crystal at first, evenly spread at the end.
    final s = seg(t, 0.02, 0.46);
    final even = easeS(seg(t, 0.3, 0.48));
    final inner = Rect.fromLTRB(bk.left + 2, bk.bottom - (bk.height - 2) * 0.86, bk.right - 2, bk.bottom - 2);
    beaker(bk, level: 0.86, liquid: TP.water);
    c.save();
    c.clipRRect(RRect.fromRectAndRadius(inner, const Radius.circular(9)));
    final rad = 30 + 330 * math.sqrt(s);
    c.drawCircle(crystal, rad, Paint()..shader = RadialGradient(colors: [dye.withValues(alpha: 0.75 * (1 - even) + 0.1), dye.withValues(alpha: 0.35 * (1 - even) + 0.1), dye.withValues(alpha: 0.1 * even)], stops: const [0, 0.45, 1]).createShader(Rect.fromCircle(center: crystal, radius: rad)));
    c.drawRect(inner, Paint()..color = dye.withValues(alpha: 0.18 * even));
    c.restore();
    // The crystal shrinks as it dissolves.
    final cs = 9 * (1 - 0.8 * s);
    if (cs > 1) {
      c.drawPath(
          Path()
            ..moveTo(crystal.dx - cs, crystal.dy + cs * 0.4)
            ..lineTo(crystal.dx - cs * 0.3, crystal.dy - cs * 0.7)
            ..lineTo(crystal.dx + cs, crystal.dy - cs * 0.2)
            ..lineTo(crystal.dx + cs * 0.5, crystal.dy + cs * 0.6)
            ..close(),
          Paint()..color = const Color(0xFF3E1C3C));
    }
    callout('Potassium permanganate crystal|पोटैशियम परमैंगनेट का क्रिस्टल|ಪೊಟ್ಯಾಸಿಯಮ್ ಪರ್ಮಾಂಗನೇಟ್ ಹರಳು', crystal, const Offset(176, 530), maxWidth: 240);
    callout('Water|पानी|ನೀರು', const Offset(320, 260), const Offset(392, 236));
  }

  /// Position (0..1 of the box) of dye particle [i]: a fixed normal sample scaled by σ, folded
  /// back at the walls.
  double _dyeX(int i) {
    final u1 = math.max(1e-6, rnd(i, 1)), u2 = rnd(i, 2);
    final g = math.sqrt(-2 * math.log(u1)) * math.cos(tau * u2);
    var x = (g * sigma).abs();
    x = x % 2;
    return x > 1 ? 2 - x : x;
  }

  void _diffusionParticles(Rect r) {
    panel(r, title: 'Particles of dye in water (magnified)|पानी में रंजक के कण (आवर्धित)|ನೀರಿನಲ್ಲಿ ಬಣ್ಣದ ಕಣಗಳು (ವರ್ಧಿತ)');
    final box = Rect.fromLTRB(r.left + 20, r.top + 40, r.right - 20, r.bottom - 44);
    c.drawRect(box, Paint()..color = const Color(0xFFE4EEF2));
    c.save();
    c.clipRect(box);
    // Water molecules, small and pale, jostling.
    for (var i = 0; i < 140; i++) {
      final p = Offset(box.left + rnd(i, 7) * box.width, box.top + rnd(i, 8) * box.height) + Offset(math.sin(t * 90 + i), math.cos(t * 80 + i * 1.3)) * 3;
      c.drawCircle(p, 2.6, Paint()..color = const Color(0xFFB4C9D3));
    }
    for (var i = 0; i < 70; i++) {
      final x = box.left + 6 + _dyeX(i) * (box.width - 12);
      final y = box.top + 6 + rnd(i, 3) * (box.height - 12);
      final p = Offset(x, y) + Offset(math.sin(t * 70 + i * 2.1), math.cos(t * 64 + i * 1.7)) * 4;
      sphere(p, 4.6, dye);
    }
    c.restore();
    c.drawRect(box, linePaint(TP.glassEdge, LW.fine));
    final even = t >= 0.3;
    note(tr(even ? 'evenly spread: particles still move, but there is no net flow|समान रूप से फैले: कण चलते हैं, पर कुल प्रवाह नहीं|ಸಮವಾಗಿ ಹರಡಿದೆ: ಕಣಗಳು ಚಲಿಸುತ್ತವೆ, ಒಟ್ಟು ಹರಿವಿಲ್ಲ' : 'net movement from high to low concentration|उच्च से निम्न सांद्रता की ओर कुल गति|ಹೆಚ್ಚು ಸಾರತೆಯಿಂದ ಕಡಿಮೆ ಸಾರತೆಗೆ ಒಟ್ಟು ಚಲನೆ'), Offset(r.left + 20, r.bottom - 22), size: 12.5, color: TP.ink2, halo: false, maxWidth: r.width - 40);
    if (!even) arrowTo(Offset(r.right - 150, r.bottom - 22), Offset(r.right - 30, r.bottom - 22), dye, w: LW.line, len: 10);
  }

  void _profile(Rect r) {
    panel(r, title: 'Concentration along the box|बॉक्स के अनुदिश सांद्रता|ಪೆಟ್ಟಿಗೆಯ ಉದ್ದಕ್ಕೂ ಸಾರತೆ');
    final g = Rect.fromLTRB(r.left + 40, r.top + 40, r.right - 24, r.bottom - 28);
    axes(Rect.fromLTRB(g.left, g.top - 4, g.right + 4, g.bottom), origin: g.bottomLeft);
    note(tr('distance →|दूरी →|ದೂರ →'), Offset(g.right, g.bottom + 14), size: 11, color: TP.ink2, align: 1, italic: true, halo: false);
    note('c', Offset(g.left - 14, g.top + 4), size: 13, color: TP.ink2, align: 0, italic: true, halo: false);
    double conc(double x, double sg) {
      double gs(double d) => math.exp(-d * d / (2 * sg * sg));
      final v = gs(x) + gs(2 - x) + gs(2 + x) + gs(x + 4) + gs(4 - x);
      return v / (sg * math.sqrt(math.pi / 2));
    }

    Path curve(double sg) => plot(g, (x) => math.min(4.0, conc(x, sg)), 0, 1, 0, 4.2, n: 120);
    // Earlier profiles faintly, the present one in ink.
    for (final sg in [0.08, 0.2, 0.45]) {
      if (sg < sigma) c.drawPath(curve(sg), linePaint(dye.withValues(alpha: 0.22), LW.fine));
    }
    c.drawPath(curve(sigma), linePaint(dye, LW.bold));
    final uniform = g.bottom - g.height / 4.2;
    dash(Offset(g.left, uniform), Offset(g.right, uniform), TP.hair);
    note(tr('even|समान|ಸಮ'), Offset(g.right - 4, uniform - 10), size: 11, color: TP.ink2, align: 1, halo: false);
  }

  // ---- osmosis ----

  void _osmometer() {
    const bk = Rect.fromLTRB(70, 340, 390, 556);
    // Stand and clamp.
    block(const Rect.fromLTRB(20, 562, 140, 574), TP.steelDark, radius: 2);
    cylinderV(const Rect.fromLTRB(34, 60, 42, 564), TP.steel);
    block(const Rect.fromLTRB(38, 120, 226, 127), TP.steel, radius: 2);
    beaker(bk, level: 0.8, liquid: TP.water, marks: false);
    const cx = 230.0, mouthY = 476.0, neckY = 404.0, stemTop = 64.0;
    final level = 300 - 150 * rise;
    // The funnel bulb (inverted, mouth down) full of sugar solution.
    final bulb = Path()
      ..moveTo(cx - 66, mouthY)
      ..cubicTo(cx - 72, 446, cx - 40, 414, cx - 6, neckY)
      ..lineTo(cx + 6, neckY)
      ..cubicTo(cx + 40, 414, cx + 72, 446, cx + 66, mouthY)
      ..close();
    c.drawPath(bulb, vGrad(const Rect.fromLTRB(cx - 66, neckY, cx + 66, mouthY), [const Color(0xFFF1E3BC), const Color(0xFFE6D19A)]));
    // Stem with the solution up to its level.
    const stem = Rect.fromLTRB(cx - 6, stemTop, cx + 6, neckY + 2);
    c.drawRect(Rect.fromLTRB(stem.left + 1.5, level, stem.right - 1.5, stem.bottom), Paint()..color = const Color(0xFFE6D19A));
    c.drawLine(Offset(stem.left + 1.5, level), Offset(stem.right - 1.5, level), linePaint(sugarCol, 1.4));
    c.drawRRect(RRect.fromRectAndRadius(stem, const Radius.circular(3)), linePaint(TP.glassEdge, LW.line));
    c.drawLine(Offset(stem.left + 3, stemTop + 10), Offset(stem.left + 3, neckY - 10), linePaint(Colors.white.withValues(alpha: 0.8), 1.4));
    c.drawPath(bulb, linePaint(TP.glassEdge, LW.line));
    // Scale beside the stem, and the starting level.
    for (var y = 100.0; y <= 380; y += 10) {
      final major = (y % 50) == 0;
      c.drawLine(Offset(cx + 10, y), Offset(cx + (major ? 20 : 15), y), linePaint(TP.ink2, LW.hair));
    }
    c.drawLine(const Offset(cx - 22, 300), const Offset(cx - 9, 300), linePaint(TP.ink, LW.fine));
    if (rise > 0.02) {
      dimension(Offset(cx - 30, 300), Offset(cx - 30, level), '', opacity: 1, tick: 4);
      note(tr('rise|वृद्धि|ಏರಿಕೆ'), Offset(cx - 38, (300 + level) / 2), size: 12, color: TP.ink2, align: 1);
    }
    // The membrane tied across the mouth, its pores shown as gaps.
    for (var x = cx - 66.0; x < cx + 66; x += 9) {
      c.drawLine(Offset(x, mouthY), Offset(math.min(x + 6, cx + 66), mouthY), linePaint(const Color(0xFF6E5A3A), 2.2, cap: StrokeCap.butt));
    }
    c.drawLine(const Offset(cx - 70, mouthY - 6), const Offset(cx - 64, mouthY + 2), linePaint(TP.ink2, 1.4));
    c.drawLine(const Offset(cx + 70, mouthY - 6), const Offset(cx + 64, mouthY + 2), linePaint(TP.ink2, 1.4));
    // Water entering through the membrane.
    if (t >= 0.68) {
      for (var i = 0; i < 5; i++) {
        final x = cx - 44 + i * 22.0;
        final k = fr(t * 6 + i * 0.2);
        arrowTo(Offset(x, mouthY + 26 - 10 * k), Offset(x, mouthY + 6 - 10 * k), TP.blue.withValues(alpha: 0.8 * math.sin(math.pi * k)), w: LW.fine, len: 7);
      }
    }
    callout('Thistle funnel|थिसल कीप|ಥಿಸಲ್ ಆಲಿಕೆ', const Offset(cx + 6, 230), const Offset(300, 210));
    callout('Sugar solution|शक्कर का घोल|ಸಕ್ಕರೆ ದ್ರಾವಣ', const Offset(cx + 30, 440), const Offset(320, 300));
    callout('Semi-permeable membrane|अर्धपारगम्य झिल्ली|ಅರೆಪಾರಕ ಪೊರೆ', const Offset(cx + 50, mouthY), const Offset(300, 520), maxWidth: 130);
    callout('Pure water|शुद्ध जल|ಶುದ್ಧ ನೀರು', const Offset(110, 520), const Offset(60, 586), side: 1);
  }

  void _membraneView(Rect r) {
    panel(r, title: 'At the membrane (magnified)|झिल्ली पर (आवर्धित)|ಪೊರೆಯ ಬಳಿ (ವರ್ಧಿತ)');
    final box = Rect.fromLTRB(r.left + 20, r.top + 40, r.right - 20, r.bottom - 44);
    final mx = box.center.dx;
    c.drawRect(Rect.fromLTRB(box.left, box.top, mx, box.bottom), Paint()..color = const Color(0xFFE4EEF2));
    c.drawRect(Rect.fromLTRB(mx, box.top, box.right, box.bottom), Paint()..color = const Color(0xFFF1E9D6));
    c.save();
    c.clipRect(box);
    final net = t >= 0.68;
    // Water: crosses the membrane through the pores; more cross into the sugar side.
    for (var i = 0; i < 60; i++) {
      final speed = 0.6 + rnd(i, 4) * 0.8;
      final y = box.top + 8 + rnd(i, 5) * (box.height - 16);
      double x;
      if (net && i % 3 == 0) {
        // Drifting across into the solution, then wandering there.
        final k = fr(rnd(i, 6) + t * speed * 0.8);
        x = box.left + 10 + k * (box.width - 20);
      } else {
        final ph = fr(rnd(i, 7) + t * speed);
        x = box.left + 10 + tri(ph) * (box.width - 20);
      }
      sphere(Offset(x, y + math.sin(t * 60 + i) * 3), 3.6, const Color(0xFF6F98B3));
    }
    // Sugar: too big for the pores, so it stays on its side.
    for (var i = 0; i < 16; i++) {
      final ph = fr(rnd(i, 9) + t * (0.4 + rnd(i, 10) * 0.4));
      final x = mx + 18 + tri(ph) * (box.right - mx - 32);
      final y = box.top + 14 + rnd(i, 11) * (box.height - 28) + math.cos(t * 40 + i) * 3;
      sphere(Offset(x, y), 8.5, sugarCol);
    }
    c.restore();
    // The membrane: a wall with pores.
    for (var y = box.top; y < box.bottom; y += 22) {
      c.drawRect(Rect.fromLTRB(mx - 3, y, mx + 3, math.min(y + 14, box.bottom)), Paint()..color = const Color(0xFF6E5A3A));
    }
    c.drawRect(box, linePaint(TP.glassEdge, LW.fine));
    note(tr('Water (dilute side)|पानी (तनु ओर)|ನೀರು (ದುರ್ಬಲ ಭಾಗ)'), Offset(box.left + 8, box.top - 12 + 0), size: 11.5, color: TP.ink2, halo: false);
    note(tr('Sugar solution (concentrated side)|शक्कर का घोल (सांद्र ओर)|ಸಕ್ಕರೆ ದ್ರಾವಣ (ಸಾರ ಭಾಗ)'), Offset(box.right - 8, box.top - 12), size: 11.5, color: TP.ink2, align: 1, halo: false);
    sphere(Offset(r.left + 28, r.bottom - 22), 3.6, const Color(0xFF6F98B3));
    note(tr('water molecule|पानी का अणु|ನೀರಿನ ಅಣು'), Offset(r.left + 38, r.bottom - 22), size: 12, color: TP.ink, halo: false);
    sphere(Offset(r.left + 168, r.bottom - 22), 7, sugarCol);
    note(tr('sugar molecule|शक्कर का अणु|ಸಕ್ಕರೆ ಅಣು'), Offset(r.left + 180, r.bottom - 22), size: 12, color: TP.ink, halo: false);
    if (net) {
      arrowTo(Offset(r.right - 150, r.bottom - 22), Offset(r.right - 30, r.bottom - 22), TP.blue, w: LW.bold, len: 11);
      note(tr('net flow of water|पानी का कुल प्रवाह|ನೀರಿನ ಒಟ್ಟು ಹರಿವು'), Offset(r.right - 156, r.bottom - 22), size: 12, color: TP.blue, align: 1, weight: FontWeight.w600, halo: false);
    }
  }

  void _riseGraph(Rect r) {
    panel(r, title: 'Rise of the solution in the stem|नली में घोल का चढ़ना|ಕೊಳವೆಯಲ್ಲಿ ದ್ರಾವಣದ ಏರಿಕೆ');
    final g = Rect.fromLTRB(r.left + 40, r.top + 40, r.right - 24, r.bottom - 28);
    axes(Rect.fromLTRB(g.left, g.top - 4, g.right + 4, g.bottom), origin: g.bottomLeft);
    note(tr('time →|समय →|ಸಮಯ →'), Offset(g.right, g.bottom + 14), size: 11, color: TP.ink2, align: 1, italic: true, halo: false);
    note('h', Offset(g.left - 14, g.top + 4), size: 13, color: TP.ink2, align: 0, italic: true, halo: false);
    // Fast at first, slowing as the solution becomes more dilute and the column heavier.
    double h(double tt) => (1 - math.exp(-3.2 * seg(tt, 0.68, 0.98))) / (1 - math.exp(-3.2));
    if (t > 0.68) {
      final p = plot(g, (tt) => h(tt), 0.5, 1, 0, 1.1, upto: (t - 0.5) / 0.5);
      c.drawPath(p, linePaint(TP.blue, LW.bold));
    }
  }
}
