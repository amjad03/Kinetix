import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../draw.dart';

/// The rock cycle as a geological cross-section: a granite mountain over the pluton that fed it,
/// a river carrying sediment to the sea, strata building up on the sea floor, a metamorphic zone
/// under heat and pressure, and the magma chamber beneath; beside it the cycle as a diagram with
/// a specimen of each rock type.
class RockCyclePlate extends AnimPainter {
  RockCyclePlate(super.f);

  static const sea = 250.0;
  static const granite = Color(0xFFB9ABA2), basalt = Color(0xFF55575A), sandstone = Color(0xFFD7BF8F);
  static const magmaHot = Color(0xFFC9673E), magmaDeep = Color(0xFF7A3226);

  int get step => t < 0.2 ? 0 : (t < 0.4 ? 1 : (t < 0.6 ? 2 : (t < 0.8 ? 3 : 4)));

  /// The surface: the mountain on the left, a lowland, the coast, and the sea floor.
  Path get _surface => smooth(const [Offset(0, 268), Offset(70, 170), Offset(150, 104), Offset(222, 176), Offset(300, 244), Offset(380, 254), Offset(420, 262), Offset(520, 300), Offset(640, 326)], k: 0.7);

  @override
  void draw() {
    c.save();
    c.clipRect(const Rect.fromLTWH(0, 0, 600, 600));
    _section();
    c.restore();
    c.drawLine(const Offset(600, 0), const Offset(600, 600), linePaint(TP.ink2, LW.fine));
    _diagram(const Rect.fromLTWH(616, 52, 360, 492));
    _labels();
  }

  void _section() {
    // Sky.
    const sky = Rect.fromLTWH(0, 0, 640, 300);
    c.drawRect(sky, vGrad(sky, [const Color(0xFFE3ECF0), const Color(0xFFF4F6F3)]));
    // Crust under the surface.
    final crust = Path.from(_surface)
      ..lineTo(640, 600)
      ..lineTo(0, 600)
      ..close();
    c.drawPath(crust, vGrad(const Rect.fromLTWH(0, 100, 640, 500), [const Color(0xFF9D9087), const Color(0xFF7D716A)]));
    // Sea.
    final water = Path()
      ..moveTo(392, sea)
      ..lineTo(640, sea)
      ..lineTo(640, 330)
      ..lineTo(392, 330)
      ..close();
    c.save();
    c.clipPath(Path.combine(PathOperation.difference, water, crust));
    c.drawPath(water, vGrad(const Rect.fromLTWH(392, sea, 248, 80), [const Color(0xFF9DBACB), const Color(0xFF6E93AA)]));
    c.restore();
    _strata();
    _metamorphic();
    _magma();
    _pluton();
    _weathering();
    // The surface line over everything.
    c.drawPath(_surface, linePaint(const Color(0xFF5B5049), LW.line));
    c.drawLine(const Offset(392, sea), const Offset(640, sea), linePaint(const Color(0xFF55798F), LW.fine));
  }

  void _strata() {
    // Sedimentary layers under the sea floor; the top one builds up during step 3.
    final build = seg(t, 0.4, 0.58);
    const colors = [Color(0xFFCDB487), Color(0xFFB9A585), Color(0xFFD9C79F), Color(0xFFA89474), Color(0xFFC9B48C)];
    double floorAt(double x) => 262 + math.max(0, x - 400) * 0.27;
    double thick(double x) => ((x - 360) / 130).clamp(0.0, 1.0);
    for (var i = 0; i < 5; i++) {
      final p = Path();
      for (var x = 360.0; x <= 640; x += 10) {
        final y = floorAt(x) + i * 22 * thick(x) + math.sin(x / 50 + i) * 1.5 * thick(x);
        x == 360 ? p.moveTo(x, y) : p.lineTo(x, y);
      }
      for (var x = 640.0; x >= 360; x -= 10) {
        p.lineTo(x, floorAt(x) + (i + 1) * 22 * thick(x) + math.sin(x / 50 + i + 1) * 1.5 * thick(x));
      }
      p.close();
      c.drawPath(p, Paint()..color = colors[i]);
      c.drawPath(p, linePaint(tone(colors[i], -0.25), LW.hair));
    }
    // The newest layer (and grains settling into it).
    if (build > 0) {
      final p = Path()..moveTo(400, 262);
      for (var x = 400.0; x <= 640; x += 20) {
        p.lineTo(x, 262 + (x - 400) * 0.27 - 6 * build);
      }
      p.lineTo(640, 262 + 240 * 0.27);
      for (var x = 640.0; x >= 400; x -= 20) {
        p.lineTo(x, 262 + (x - 400) * 0.27);
      }
      p.close();
      c.drawPath(p, Paint()..color = const Color(0xFFE2D1AA));
    }
    if (step == 2) {
      for (var i = 0; i < 18; i++) {
        final ph = fr(rnd(i, 100) + t * 3);
        final x = 420 + rnd(i, 101) * 210;
        final floor = 262 + (x - 400) * 0.27;
        c.drawCircle(Offset(x, sea + 6 + ph * (floor - sea - 8)), 1.6, Paint()..color = const Color(0xFF8C7650));
      }
      for (final x in [470.0, 560.0]) {
        arrowTo(Offset(x, 360), Offset(x, 392), TP.ink2, w: LW.fine, len: 8);
      }
    }
    // Specks of grain in the layers.
    for (var i = 0; i < 120; i++) {
      final x = 380 + rnd(i, 102) * 260;
      final y = 264 + (x - 400).clamp(0, 400) * 0.27 + rnd(i, 103) * 106 * ((x - 360) / 130).clamp(0.0, 1.0);
      c.drawCircle(Offset(x, y), 0.9, Paint()..color = const Color(0x55705A3A));
    }
  }

  /// The metamorphic band: a lens thinning out to the left.
  Path get _band {
    double lens(double x) => math.sqrt(((x - 270) / 90).clamp(0.0, 1.0));
    final band = Path()..moveTo(270, 450);
    for (var x = 270.0; x <= 640; x += 10) {
      band.lineTo(x, 450 - 38 * lens(x) + math.sin(x / 40) * 4 * lens(x));
    }
    for (var x = 640.0; x >= 270; x -= 10) {
      band.lineTo(x, 450 + 36 * lens(x) + math.sin(x / 50) * 5 * lens(x));
    }
    return band..close();
  }

  void _metamorphic() {
    // A band of foliated rock under the strata: the bands tighten under heat and pressure.
    final k = 0.35 + 0.65 * seg(t, 0.6, 0.75);
    final band = _band;
    c.drawPath(band, vGrad(const Rect.fromLTWH(280, 410, 360, 80), [const Color(0xFF8E8A92), const Color(0xFF6F6874)]));
    c.save();
    c.clipPath(band);
    for (var i = 0; i < 12; i++) {
      final p = Path();
      for (var x = 280.0; x <= 640; x += 8) {
        final y = 414 + i * 6.5 + math.sin(x / (18 + 12 * (1 - k)) + i * 0.8) * (2 + 3 * k);
        x == 280 ? p.moveTo(x, y) : p.lineTo(x, y);
      }
      c.drawPath(p, linePaint((i.isEven ? const Color(0xFFE2DDE4) : const Color(0xFF4B4552)).withValues(alpha: 0.35 + 0.4 * k), 1.6));
    }
    c.restore();
    if (step == 3) {
      // Pressure from above and the sides, heat from below.
      for (final x in [380.0, 520.0]) {
        arrowTo(Offset(x, 382), Offset(x, 404), TP.ink, w: LW.line, len: 9);
      }
      arrowTo(const Offset(250, 450), const Offset(274, 450), TP.ink, w: LW.line, len: 9);
      for (var i = 0; i < 4; i++) {
        final x = 320 + i * 80.0;
        final ph = fr(t * 4 + i * 0.25);
        final p = Path()..moveTo(x, 520 - ph * 20);
        for (var s = 1; s <= 6; s++) {
          p.lineTo(x + math.sin(s * 1.6) * 4, 520 - ph * 20 - s * 5);
        }
        c.drawPath(p, linePaint(magmaHot.withValues(alpha: 1 - ph), 1.6));
      }
    }
  }

  void _magma() {
    final pulse = step == 4 ? 0.5 + 0.5 * math.sin(t * 60) : 0.3;
    const chamber = Rect.fromLTRB(80, 512, 600, 640);
    c.drawOval(chamber, Paint()..shader = RadialGradient(center: const Alignment(0, -0.2), colors: [Color.lerp(magmaHot, const Color(0xFFE29A62), pulse)!, magmaDeep], stops: const [0.2, 1]).createShader(chamber));
    c.drawOval(chamber, linePaint(const Color(0xFF6E2418), LW.fine));
    // Melting: the base of the metamorphic band glows into the chamber.
    final melt = seg(t, 0.8, 0.95);
    if (melt > 0) {
      c.save();
      c.clipPath(_band);
      c.drawRect(const Rect.fromLTRB(270, 430, 640, 492), Paint()..shader = LinearGradient(begin: Alignment.bottomCenter, end: Alignment.topCenter, colors: [magmaHot.withValues(alpha: 0.9 * melt), magmaHot.withValues(alpha: 0)]).createShader(const Rect.fromLTRB(270, 430, 640, 492)));
      c.restore();
      for (var i = 0; i < 6; i++) {
        final ph = fr(rnd(i, 110) + t * 2);
        c.drawCircle(Offset(320 + i * 50.0, 500 + ph * 26), 3 + 2 * ph, Paint()..color = magmaHot.withValues(alpha: 1 - ph));
      }
    }
  }

  void _pluton() {
    // A dyke from the chamber up into a granite pluton under the mountain; it glows while the
    // magma is still molten, then cools to speckled granite.
    final cool = seg(t, 0.04, 0.18);
    final dyke = Path()
      ..moveTo(204, 522)
      ..lineTo(198, 470)
      ..lineTo(206, 426)
      ..lineTo(194, 382)
      ..lineTo(198, 336)
      ..lineTo(191, 336)
      ..lineTo(187, 384)
      ..lineTo(199, 428)
      ..lineTo(191, 470)
      ..lineTo(197, 522)
      ..close();
    final pluton = smooth(const [Offset(70, 300), Offset(84, 262), Offset(122, 244), Offset(160, 252), Offset(196, 236), Offset(238, 252), Offset(262, 290), Offset(244, 330), Offset(196, 342), Offset(150, 336), Offset(104, 344), Offset(76, 328)], closed: true);
    final hot = Color.lerp(magmaHot, granite, cool)!;
    c.drawPath(dyke, Paint()..color = Color.lerp(magmaHot, const Color(0xFF5E5650), cool)!);
    c.drawPath(pluton, Paint()..shader = RadialGradient(colors: [tone(hot, 0.15), hot]).createShader(const Rect.fromLTRB(70, 236, 262, 344)));
    if (cool > 0.3) {
      c.save();
      c.clipPath(pluton);
      for (var i = 0; i < 160; i++) {
        final p = Offset(70 + rnd(i, 120) * 192, 236 + rnd(i, 121) * 108);
        final col = i % 3 == 0 ? const Color(0xFF2E2A28) : (i % 3 == 1 ? const Color(0xFFE9DFD8) : const Color(0xFFC79A8A));
        c.drawRect(Rect.fromCenter(center: p, width: 2.6, height: 2.2), Paint()..color = col.withValues(alpha: (cool - 0.3) / 0.7));
      }
      c.restore();
    }
    c.drawPath(pluton, linePaint(const Color(0xFF6F625B), LW.fine));
  }

  void _weathering() {
    final on = step == 1;
    // Rain on the mountain.
    if (on) {
      for (var i = 0; i < 26; i++) {
        final ph = fr(rnd(i, 130) + t * 6);
        final x = 40 + rnd(i, 131) * 200;
        final y = 70 + ph * 100;
        c.drawLine(Offset(x, y), Offset(x - 2, y + 7), linePaint(const Color(0xFF7FA0B5).withValues(alpha: 0.8), 1));
      }
      cumulus(const Offset(150, 58), 0.8, base: const Color(0xFFB9C2C9));
    }
    // A river from the mountain to the sea, carrying grains.
    final river = smooth(const [Offset(214, 170), Offset(260, 222), Offset(320, 246), Offset(392, 252)], k: 0.6);
    c.drawPath(river, linePaint(const Color(0xFF7FA6BC), 4));
    if (on || step == 2) {
      final m = river.computeMetrics().first;
      for (var i = 0; i < 10; i++) {
        final q = m.getTangentForOffset(m.length * fr(i / 10 + t * 4))!.position;
        c.drawCircle(q, 1.8, Paint()..color = const Color(0xFF8C7650));
      }
      for (var i = 0; i < 8; i++) {
        final ph = fr(rnd(i, 132) + t * 2.5);
        final p = lerpO(Offset(110 + i * 12.0, 128 + i * 4), Offset(220 + i * 6.0, 196 + i * 6), ph);
        c.drawRect(Rect.fromCenter(center: p, width: 3, height: 2.4), Paint()..color = const Color(0xFF6F625B).withValues(alpha: 1 - ph * 0.5));
      }
    }
  }

  // ---- the cycle diagram ----

  void _diagram(Rect r) {
    panel(r, title: 'The rock cycle|शैल चक्र|ಶಿಲಾ ಚಕ್ರ');
    final ig = Offset(r.left + 76, r.top + 96), sed = Offset(r.right - 76, r.top + 96);
    final sedm = Offset(r.right - 76, r.top + 246), meta = Offset(r.right - 76, r.top + 396), mag = Offset(r.left + 76, r.top + 396);
    final s = step;
    // Arrows.
    void arrow(Offset a, Offset b, String l3, bool on, Offset labelAt, {double align = 0}) {
      final col = on ? TP.red : TP.ink2.withValues(alpha: 0.5);
      arrowTo(a, b, col, w: on ? LW.bold : LW.line, len: 11);
      note(tr(l3), labelAt, size: 11, color: on ? TP.ink : TP.ink2, align: align, weight: on ? FontWeight.w600 : FontWeight.w500, maxWidth: 150, halo: false);
    }

    arrow(mag + const Offset(0, -34), ig + const Offset(0, 34), 'cooling and solidifying|ठंडा होकर जमना|ತಣಿದು ಘನೀಭವನ', s == 0, Offset(ig.dx + 10, r.top + 246), align: -1);
    arrow(ig + const Offset(63, 0), sed + const Offset(-63, 0), 'weathering and erosion|अपक्षय और अपरदन|ಶಿಥಿಲೀಕರಣ, ಸವೆತ', s == 1, Offset(r.center.dx, r.top + 48));
    arrow(sed + const Offset(0, 34), sedm + const Offset(0, -34), 'compaction and cementation|संघनन और सीमेंटन|ಸಂಕುಚನ, ಸಿಮೆಂಟೀಕರಣ', s == 2, Offset(sed.dx - 10, r.top + 171), align: 1);
    arrow(sedm + const Offset(0, 34), meta + const Offset(0, -34), 'heat and pressure|ताप और दाब|ಶಾಖ ಮತ್ತು ಒತ್ತಡ', s == 3, Offset(sed.dx - 10, r.top + 321), align: 1);
    arrow(meta + const Offset(-63, 0), mag + const Offset(63, 0), 'melting|पिघलना|ಕರಗುವಿಕೆ', s == 4, Offset(r.center.dx, mag.dy - 16));
    // Nodes, each with a swatch of the rock.
    _node(ig, 'Igneous rock|आग्नेय शैल|ಅಗ್ನಿಶಿಲೆ', 'granite|ग्रेनाइट|ಗ್ರಾನೈಟ್', s == 0, _swatchGranite);
    _node(sed, 'Sediments|अवसाद|ಸಂಚಯಗಳು', 'sand, silt, clay|रेत, गाद, मृत्तिका|ಮರಳು, ಹೂಳು, ಜೇಡಿ', s == 1, _swatchSediment);
    _node(sedm, 'Sedimentary rock|अवसादी शैल|ಸಂಚಯ ಶಿಲೆ', 'sandstone|बलुआ पत्थर|ಮರಳುಗಲ್ಲು', s == 2, _swatchSandstone);
    _node(meta, 'Metamorphic rock|कायांतरित शैल|ರೂಪಾಂತರ ಶಿಲೆ', 'marble, gneiss|संगमरमर, नाइस|ಅಮೃತಶಿಲೆ, ನೈಸ್', s == 3, _swatchGneiss);
    _node(mag, 'Magma|मैग्मा|ಶಿಲಾಪಾಕ', 'molten rock|पिघली शैल|ಕರಗಿದ ಶಿಲೆ', s == 4, _swatchMagma);
  }

  void _node(Offset o, String name, String eg, bool on, void Function(Rect) swatch) {
    final box = Rect.fromCenter(center: o, width: 126, height: 68);
    final rr = RRect.fromRectAndRadius(box, const Radius.circular(6));
    c.drawRRect(rr, Paint()..color = on ? const Color(0xFFF7E9DF) : TP.paper);
    c.drawRRect(rr, linePaint(on ? TP.red : TP.ink2, on ? LW.line * 1.3 : LW.fine));
    swatch(Rect.fromLTWH(box.left + 7, box.top + 7, 26, 26));
    note(tr(name), Offset(box.left + 39, box.top + 20), size: 11, color: TP.ink, weight: FontWeight.w600, halo: false, maxWidth: 84);
    note(tr(eg), Offset(box.left + 8, box.bottom - 14), size: 10.5, color: TP.ink2, halo: false, italic: true, maxWidth: 104);
  }

  void _swatchGranite(Rect r) {
    c.drawRect(r, Paint()..color = granite);
    for (var i = 0; i < 40; i++) {
      final p = Offset(r.left + rnd(i, 140) * r.width, r.top + rnd(i, 141) * r.height);
      c.drawRect(Rect.fromCenter(center: p, width: 2.4, height: 2), Paint()..color = i % 3 == 0 ? const Color(0xFF2E2A28) : (i % 3 == 1 ? Colors.white : const Color(0xFFC79A8A)));
    }
    c.drawRect(r, linePaint(TP.ink2, LW.hair));
  }

  void _swatchSediment(Rect r) {
    c.drawRect(r, Paint()..color = const Color(0xFFE8DCC2));
    for (var i = 0; i < 46; i++) {
      final p = Offset(r.left + rnd(i, 142) * r.width, r.top + rnd(i, 143) * r.height);
      c.drawCircle(p, 0.8 + rnd(i, 144) * 1.6, Paint()..color = const Color(0xFF9C845F));
    }
    c.drawRect(r, linePaint(TP.ink2, LW.hair));
  }

  void _swatchSandstone(Rect r) {
    for (var i = 0; i < 5; i++) {
      c.drawRect(Rect.fromLTWH(r.left, r.top + i * r.height / 5, r.width, r.height / 5), Paint()..color = Color.lerp(sandstone, const Color(0xFFB9976A), (i % 2) * 0.5)!);
    }
    c.drawRect(r, linePaint(TP.ink2, LW.hair));
  }

  void _swatchGneiss(Rect r) {
    c.drawRect(r, Paint()..color = const Color(0xFF8E8A92));
    c.save();
    c.clipRect(r);
    for (var i = 0; i < 7; i++) {
      final p = Path();
      for (var x = r.left; x <= r.right; x += 3) {
        final y = r.top + 2 + i * 4.6 + math.sin((x - r.left) / 5 + i) * 1.6;
        x == r.left ? p.moveTo(x, y) : p.lineTo(x, y);
      }
      c.drawPath(p, linePaint(i.isEven ? const Color(0xFFE6E1E8) : const Color(0xFF3F3946), 1.6));
    }
    c.restore();
    c.drawRect(r, linePaint(TP.ink2, LW.hair));
  }

  void _swatchMagma(Rect r) {
    c.drawRect(r, Paint()..shader = RadialGradient(colors: [const Color(0xFFF2A15A), magmaDeep]).createShader(r));
    c.drawRect(r, linePaint(TP.ink2, LW.hair));
  }

  void _labels() {
    callout('Granite (igneous, intrusive)|ग्रेनाइट (आग्नेय, अंतर्वेधी)|ಗ್ರಾನೈಟ್ (ಅಗ್ನಿಶಿಲೆ, ಅಂತರ್ವೇಧಿ)', const Offset(170, 292), const Offset(272, 330), size: 12, maxWidth: 170);
    callout('Magma chamber|मैग्मा कक्ष|ಶಿಲಾಪಾಕ ಕೋಣೆ', const Offset(250, 560), const Offset(40, 516), size: 12);
    callout('River carries sediment|नदी अवसाद बहाती है|ನದಿ ಸಂಚಯ ಒಯ್ಯುತ್ತದೆ', const Offset(300, 240), const Offset(330, 196), size: 12);
    callout('Sea|समुद्र|ಸಮುದ್ರ', const Offset(560, 262), const Offset(560, 222), side: -1, size: 12);
    callout('Sedimentary strata|अवसादी परतें|ಸಂಚಯ ಪದರಗಳು', const Offset(560, 340), const Offset(470, 380), side: -1, size: 12);
    callout('Metamorphic rock|कायांतरित शैल|ರೂಪಾಂತರ ಶಿಲೆ', const Offset(560, 450), const Offset(470, 500), side: -1, size: 12);
  }
}
