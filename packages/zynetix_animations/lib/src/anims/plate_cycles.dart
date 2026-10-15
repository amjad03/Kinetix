import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../draw.dart';

/// The nitrogen cycle as a cross-section: the air's N₂ above, a legume with root nodules (and a
/// magnified nodule with Rhizobium), lightning, the soil's ammonium, nitrite and nitrate pools
/// with the bacteria that convert them, a crop taking up nitrate, a grazing animal, leaf litter
/// decomposing, and denitrification back to the air.
class NitrogenPlate extends AnimPainter {
  NitrogenPlate(super.f);

  static const ground = 290.0;
  static const nh4 = Offset(430, 432), no2 = Offset(600, 526), no3 = Offset(772, 432);

  int get step => t < 0.16 ? 0 : (t < 0.33 ? 1 : (t < 0.5 ? 2 : (t < 0.67 ? 3 : (t < 0.84 ? 4 : 5))));

  @override
  void draw() {
    landscape(ground);
    _air();
    _lightning(step == 1);
    legume(const Offset(290, ground + 2), 1.05);
    herb(const Offset(830, ground + 2), 1.05);
    cow(const Offset(636, ground - 46), 0.78);
    _litter(const Offset(500, ground + 1));
    _nodule(const Offset(118, 476), 70);
    // Processes.
    final s = step;
    process(Path()..moveTo(236, 96)..cubicTo(214, 170, 232, 300, 268, 356), on: s == 1, col: TP.teal, token: 'N₂');
    process(Path()..moveTo(316, 384)..quadraticBezierTo(340, 432, nh4.dx - 64, nh4.dy), on: s == 1, col: TP.teal, token: 'NH₄⁺', n: 2);
    process(Path()..moveTo(nh4.dx + 20, nh4.dy + 24)..quadraticBezierTo(nh4.dx + 40, no2.dy, no2.dx - 64, no2.dy), on: s == 2, col: const Color(0xFF7B6A2E), token: 'NO₂⁻', n: 2);
    process(Path()..moveTo(no2.dx + 64, no2.dy)..quadraticBezierTo(no3.dx - 30, no2.dy, no3.dx - 20, no3.dy + 24), on: s == 2, col: const Color(0xFF7B6A2E), token: 'NO₃⁻', n: 2);
    process(Path()..moveTo(no3.dx + 26, no3.dy - 24)..quadraticBezierTo(no3.dx + 40, 380, 826, 336), on: s == 3, col: TP.green, token: 'NO₃⁻', n: 2);
    process(Path()..moveTo(784, 214)..quadraticBezierTo(760, 238, 712, 252), on: s == 3, col: TP.green, n: 2);
    process(Path()..moveTo(500, 300)..quadraticBezierTo(480, 380, nh4.dx + 6, nh4.dy - 24), on: s == 4, col: const Color(0xFF8A6A48), token: 'NH₄⁺', n: 2);
    process(Path()..moveTo(no3.dx + 64, no3.dy + 6)..cubicTo(980, 430, 968, 220, 930, 84), on: s == 5, col: TP.blue, token: 'N₂', n: 3);
    // Pools.
    pool(nh4, 'ammonium|अमोनियम|ಅಮೋನಿಯಂ', formula: 'NH₄⁺', on: s == 1 || s == 2 || s == 4, col: TP.teal);
    pool(no2, 'nitrite|नाइट्राइट|ನೈಟ್ರೈಟ್', formula: 'NO₂⁻', on: s == 2, col: const Color(0xFF7B6A2E));
    pool(no3, 'nitrate|नाइट्रेट|ನೈಟ್ರೇಟ್', formula: 'NO₃⁻', on: s == 2 || s == 3 || s == 5, col: TP.green);
    _processNames(s);
  }

  void _air() {
    // N₂ molecules drifting: two nitrogen atoms joined by a triple bond.
    for (var i = 0; i < 22; i++) {
      final x = fr(rnd(i, 70) + t * (0.04 + rnd(i, 71) * 0.04)) * 1000;
      final y = 74 + rnd(i, 72) * 130 + math.sin(t * 20 + i) * 4;
      final a = rnd(i, 73) * tau + t * 6 * (rnd(i, 74) - 0.5);
      final d = Offset.fromDirection(a, 5);
      sphere(Offset(x, y) - d, 5, const Color(0xFF6F8FB0), opacity: 0.85);
      sphere(Offset(x, y) + d, 5, const Color(0xFF6F8FB0), opacity: 0.85);
    }
    pool(const Offset(520, 36), 'nitrogen gas in the air: 78 %|हवा में नाइट्रोजन गैस: 78 %|ಗಾಳಿಯಲ್ಲಿ ಸಾರಜನಕ ಅನಿಲ: 78 %', formula: 'N₂', on: step == 0 || step == 5, col: TP.blue, w: 260);
  }

  void _lightning(bool on) {
    cumulus(const Offset(118, 110), 0.95, base: const Color(0xFFB9C2C9));
    if (!on) return;
    final flash = (fr(t * 7) < 0.35) ? 1.0 : 0.25;
    final p = Path()..moveTo(124, 136);
    for (final q in const [Offset(112, 170), Offset(130, 182), Offset(110, 222), Offset(126, 232), Offset(112, 280)]) {
      p.lineTo(q.dx, q.dy);
    }
    c.drawPath(p, linePaint(const Color(0xFFF6E7A6).withValues(alpha: 0.5 * flash), 7));
    c.drawPath(p, linePaint(Colors.white.withValues(alpha: flash), 2));
  }

  void _litter(Offset o) {
    // Fallen leaves and a twig: dead remains on the surface.
    for (var i = 0; i < 9; i++) {
      final p = o + Offset((rnd(i, 80) - 0.5) * 70, -2 - rnd(i, 81) * 6);
      c.save();
      c.translate(p.dx, p.dy);
      c.rotate((rnd(i, 82) - 0.5) * 1.2);
      final col = Color.lerp(const Color(0xFF9C7A45), const Color(0xFF6E5233), rnd(i, 83))!;
      c.drawOval(Rect.fromCenter(center: Offset.zero, width: 16, height: 6), Paint()..color = col);
      c.drawLine(const Offset(-8, 0), const Offset(8, 0), linePaint(tone(col, -0.35), 0.6));
      c.restore();
    }
    c.drawLine(o + const Offset(-30, -4), o + const Offset(22, -9), linePaint(const Color(0xFF5E4734), 2.6));
    c.drawLine(o + const Offset(4, -7), o + const Offset(14, -16), linePaint(const Color(0xFF5E4734), 1.6));
  }

  void _nodule(Offset o, double r) {
    // Magnified root nodule: plant cells packed with Rhizobium bacteria.
    c.save();
    c.clipPath(Path()..addOval(Rect.fromCircle(center: o, radius: r)));
    c.drawCircle(o, r, Paint()..color = const Color(0xFFF1DCD2));
    for (var i = -4; i <= 4; i++) {
      for (var j = -4; j <= 4; j++) {
        final cen = o + Offset(i * 22.0 + (j.isOdd ? 11 : 0), j * 19.0);
        final cell = RRect.fromRectAndRadius(Rect.fromCenter(center: cen, width: 20, height: 17), const Radius.circular(5));
        final infected = (i + j * 3) % 4 != 0;
        c.drawRRect(cell, Paint()..color = infected ? const Color(0xFFE5BFB1) : const Color(0xFFF4E6DD));
        c.drawRRect(cell, linePaint(const Color(0xFFB48A7A), 0.7));
        if (infected) {
          for (var k = 0; k < 4; k++) {
            final b = cen + Offset((rnd(i * 9 + j, k) - 0.5) * 12, (rnd(i * 9 + j, k + 4) - 0.5) * 9);
            final a = rnd(i * 9 + j, k + 8) * math.pi;
            c.drawLine(b - Offset.fromDirection(a, 2.6), b + Offset.fromDirection(a, 2.6), linePaint(const Color(0xFF8B4F5A), 1.8));
          }
        }
      }
    }
    c.restore();
    c.drawCircle(o, r, linePaint(TP.ink2, LW.line));
    // Magnifier cone from the nodules.
    const src = Offset(276, 352);
    final d = o - src;
    final spread = math.asin((r / d.distance).clamp(0.0, 1.0));
    for (final sg in [-1.0, 1.0]) {
      c.drawLine(src, src + Offset.fromDirection(d.direction + sg * spread, math.sqrt(d.distanceSquared - r * r)), linePaint(TP.ink2.withValues(alpha: 0.5), LW.hair));
    }
    tag('Root nodule (magnified): Rhizobium bacteria in its cells|जड़ ग्रंथिका (आवर्धित): कोशिकाओं में राइज़ोबियम जीवाणु|ಬೇರುಗಂಟು (ವರ್ಧಿತ): ಕೋಶಗಳಲ್ಲಿ ರೈಜೋಬಿಯಂ ಬ್ಯಾಕ್ಟೀರಿಯಾ', o + Offset(0, r + 26), size: 11.5, color: TP.ink, maxWidth: 210);
  }

  void _processNames(int s) {
    void name(String l3, Offset at, bool on, {double align = 0, String? bug}) {
      tag(l3, at, size: 13, color: on ? TP.ink : TP.ink2, align: align, weight: on ? FontWeight.w600 : FontWeight.w500, opacity: on ? 1 : 0.7, maxWidth: 170);
      if (bug != null) tag(bug, at + const Offset(0, 17), size: 11.5, color: TP.ink2, align: align, italic: true, opacity: on ? 1 : 0.6, maxWidth: 170);
    }

    name('Nitrogen fixation|नाइट्रोजन स्थिरीकरण|ಸಾರಜನಕ ಸ್ಥಿರೀಕರಣ', const Offset(222, 140), s == 1, align: 1, bug: 'Rhizobium|राइज़ोबियम|ರೈಜೋಬಿಯಂ');
    name('Lightning|तड़ित|ಮಿಂಚು', const Offset(60, 190), s == 1);
    name('Nitrification|नाइट्रीकरण|ನೈಟ್ರೀಕರಣ', const Offset(600, 452), s == 2, bug: 'Nitrosomonas, Nitrobacter|नाइट्रोसोमोनास, नाइट्रोबैक्टर|ನೈಟ್ರೋಸೋಮೊನಾಸ್, ನೈಟ್ರೋಬ್ಯಾಕ್ಟರ್');
    name('Assimilation|स्वांगीकरण|ಸ್ವಾಂಗೀಕರಣ', const Offset(892, 384), s == 3, bug: 'roots take up nitrate|जड़ें नाइट्रेट लेती हैं|ಬೇರುಗಳು ನೈಟ್ರೇಟ್ ಹೀರುತ್ತವೆ');
    name('Eaten by animals|जंतुओं द्वारा भक्षण|ಪ್ರಾಣಿಗಳ ಆಹಾರ', const Offset(742, 182), s == 3);
    name('Ammonification|अमोनीकरण|ಅಮೋನೀಕರಣ', const Offset(520, 340), s == 4, align: -1, bug: 'decomposers|अपघटक|ವಿಘಟಕಗಳು');
    name('Denitrification|विनाइट्रीकरण|ವಿನೈಟ್ರೀಕರಣ', const Offset(958, 156), s == 5, align: 1, bug: 'denitrifying bacteria|विनाइट्रीकारी जीवाणु|ವಿನೈಟ್ರೀಕಾರಕ ಬ್ಯಾಕ್ಟೀರಿಯಾ');
    callout('Legume|दलहनी पौधा|ದ್ವಿದಳ ಸಸ್ಯ', const Offset(310, 210), const Offset(346, 170), size: 12.5);
    callout('Dead remains and wastes|मृत अवशेष और अपशिष्ट|ಸತ್ತ ಅವಶೇಷ ಮತ್ತು ತ್ಯಾಜ್ಯ', const Offset(492, 286), const Offset(548, 236), side: -1, size: 12.5, maxWidth: 170);
  }
}

/// The carbon cycle as a cross-section: CO₂ in the air, the sun, a tree and a grazing animal
/// (photosynthesis, food chain, respiration), decomposers in the soil, coal and oil in the rock
/// beneath, a power station burning fuel, and the ocean exchanging CO₂ with the air.
class CarbonPlate extends AnimPainter {
  CarbonPlate(super.f);

  static const ground = 300.0;

  int get step => t < 0.17 ? 0 : (t < 0.33 ? 1 : (t < 0.5 ? 2 : (t < 0.67 ? 3 : (t < 0.84 ? 4 : 5))));

  @override
  void draw() {
    landscape(ground);
    _ocean(const Rect.fromLTRB(760, ground + 16, 1000, 600));
    sunDisc(const Offset(70, 70), 26);
    _strata();
    broadleaf(const Offset(220, ground + 2), 1.1);
    cow(const Offset(420, ground - 46), 0.8);
    _litter(const Offset(310, ground + 1));
    _station(const Offset(620, ground + 2));
    final s = step;
    // CO₂ molecules in the air (O=C=O), more of them when combustion adds to the air.
    _co2(s);
    pool(const Offset(470, 40), 'carbon dioxide in the air|हवा में कार्बन डाइऑक्साइड|ಗಾಳಿಯಲ್ಲಿ ಇಂಗಾಲದ ಡೈಆಕ್ಸೈಡ್', formula: 'CO₂', on: s == 0, col: TP.ink2, w: 240);
    // Processes.
    process(Path()..moveTo(330, 64)..quadraticBezierTo(250, 70, 238, 120), on: s == 1, col: TP.green, token: 'CO₂');
    process(Path()..moveTo(274, 172)..quadraticBezierTo(330, 196, 380, 238), on: s == 2, col: const Color(0xFF8A6A48), n: 3);
    process(Path()..moveTo(176, 136)..quadraticBezierTo(150, 92, 352, 50), on: s == 3, col: TP.red, token: 'CO₂', n: 2);
    process(Path()..moveTo(470, 232)..quadraticBezierTo(500, 150, 420, 64), on: s == 3, col: TP.red, token: 'CO₂', n: 2);
    process(Path()..moveTo(310, 330)..quadraticBezierTo(290, 220, 360, 62), on: s == 4, col: const Color(0xFF8A6A48), token: 'CO₂', n: 2);
    process(Path()..moveTo(330, 350)..quadraticBezierTo(380, 420, 420, 470), on: s == 4, col: TP.graphite, n: 2);
    process(Path()..moveTo(470, 520)..quadraticBezierTo(600, 500, 612, 330), on: s == 5, col: TP.graphite, n: 2);
    process(Path()..moveTo(640, 150)..quadraticBezierTo(620, 90, 560, 60), on: s == 5, col: TP.red, token: 'CO₂', n: 3);
    process(Path()..moveTo(860, 300)..quadraticBezierTo(870, 160, 600, 46), on: s == 0, col: TP.blue, token: 'CO₂', n: 2);
    process(Path()..moveTo(590, 30)..quadraticBezierTo(930, 40, 920, 296), on: s == 0, col: TP.blue, token: 'CO₂', n: 2);
    _names(s);
  }

  void _co2(int s) {
    final n = s == 5 ? 26 : 18;
    for (var i = 0; i < n; i++) {
      final x = 330 + fr(rnd(i, 90) + t * 0.05 * (1 + rnd(i, 91))) * 650;
      final y = 80 + rnd(i, 92) * 110 + math.sin(t * 18 + i) * 4;
      final a = rnd(i, 93) * tau + t * 4;
      final d = Offset.fromDirection(a, 6.5);
      sphere(Offset(x, y) - d, 3.6, const Color(0xFFC0594B), opacity: 0.8);
      sphere(Offset(x, y) + d, 3.6, const Color(0xFFC0594B), opacity: 0.8);
      sphere(Offset(x, y), 4.2, const Color(0xFF4E5358), opacity: 0.85);
    }
  }

  void _ocean(Rect r) {
    final surf = Path()..moveTo(r.left - 30, r.top + 40);
    surf.quadraticBezierTo(r.left - 6, r.top - 2, r.left + 10, r.top);
    surf.lineTo(r.right, r.top);
    surf.lineTo(r.right, r.bottom);
    surf.lineTo(r.left - 30, r.bottom);
    surf.close();
    c.drawPath(surf, vGrad(r, [const Color(0xFF8DB0C4), const Color(0xFF4E7690)]));
    for (var i = 0; i < 8; i++) {
      final y = r.top + 4 + i * 3.0;
      c.drawLine(Offset(r.left + 20 + i * 18 + math.sin(t * 20 + i) * 6, y), Offset(r.left + 60 + i * 18 + math.sin(t * 20 + i) * 6, y), linePaint(Colors.white.withValues(alpha: 0.35), 1));
    }
    note(tr('Ocean: dissolves CO₂|महासागर: CO₂ घोलता है|ಸಾಗರ: CO₂ ಕರಗಿಸುತ್ತದೆ'), Offset(r.center.dx + 6, r.top + 60), size: 12.5, color: Colors.white, align: 0, halo: false, weight: FontWeight.w600, maxWidth: 200);
  }

  void _strata() {
    // Rock layers below the soil, with a coal seam and an oil reservoir.
    const top = ground + 150;
    final rock = Rect.fromLTRB(0, top, 760, 600);
    c.drawRect(rock, vGrad(rock, [const Color(0xFFB5A58B), const Color(0xFF9E8E75)]));
    for (var i = 0; i < 4; i++) {
      final y = top + 30 + i * 34.0;
      final p = Path()..moveTo(0, y);
      for (var x = 0.0; x <= 760; x += 40) {
        p.lineTo(x, y + math.sin(x / 120 + i) * 4);
      }
      c.drawPath(p, linePaint(const Color(0xFF8A7A62), LW.hair));
    }
    final coal = Path()..moveTo(30, top + 52);
    for (var x = 30.0; x <= 330; x += 30) {
      coal.lineTo(x, top + 52 + math.sin(x / 90) * 3);
    }
    for (var x = 330.0; x >= 30; x -= 30) {
      coal.lineTo(x, top + 70 + math.sin(x / 90) * 3);
    }
    coal.close();
    c.drawPath(coal, Paint()..color = const Color(0xFF2F2C2A));
    final oil = Path()
      ..moveTo(400, top + 120)
      ..quadraticBezierTo(470, top + 70, 540, top + 120)
      ..quadraticBezierTo(470, top + 136, 400, top + 120)
      ..close();
    c.drawPath(oil, vGrad(Rect.fromLTRB(400, top + 80, 540, top + 130), [const Color(0xFF4A3B2A), const Color(0xFF1E1913)]));
    note(tr('Coal|कोयला|ಕಲ್ಲಿದ್ದಲು'), const Offset(180, top + 61), size: 12, color: Colors.white, align: 0, halo: false, weight: FontWeight.w600);
    note(tr('Oil and gas|तेल और गैस|ತೈಲ ಮತ್ತು ಅನಿಲ'), const Offset(470, top + 112), size: 11.5, color: Colors.white, align: 0, halo: false, weight: FontWeight.w600);
    note(tr('Fossil fuels: carbon stored for millions of years|जीवाश्म ईंधन: लाखों वर्षों से संचित कार्बन|ಪಳೆಯುಳಿಕೆ ಇಂಧನ: ಲಕ್ಷಾಂತರ ವರ್ಷ ಸಂಗ್ರಹಿಸಿದ ಇಂಗಾಲ'), const Offset(20, 584), size: 12, color: TP.ink, halo: true, weight: FontWeight.w600, maxWidth: 520);
  }

  void _litter(Offset o) {
    for (var i = 0; i < 9; i++) {
      final p = o + Offset((rnd(i, 80) - 0.5) * 60, -2 - rnd(i, 81) * 5);
      c.save();
      c.translate(p.dx, p.dy);
      c.rotate((rnd(i, 82) - 0.5) * 1.2);
      final col = Color.lerp(const Color(0xFF9C7A45), const Color(0xFF6E5233), rnd(i, 83))!;
      c.drawOval(Rect.fromCenter(center: Offset.zero, width: 15, height: 6), Paint()..color = col);
      c.restore();
    }
    // Fungi: small caps on stalks.
    for (final dx in [-16.0, 8.0]) {
      final b = o + Offset(dx, -2);
      c.drawLine(b, b + const Offset(0, -9), linePaint(const Color(0xFFE9DFCB), 2));
      c.drawArc(Rect.fromCenter(center: b + const Offset(0, -9), width: 14, height: 10), math.pi, math.pi, true, Paint()..color = const Color(0xFFB98D5E));
    }
  }

  void _station(Offset base) {
    // A thermal power station: a hall, a chimney with a plume.
    const wall = Color(0xFF9AA3AA);
    block(Rect.fromLTRB(base.dx - 60, base.dy - 56, base.dx + 30, base.dy), wall, radius: 1);
    for (var i = 0; i < 4; i++) {
      c.drawRect(Rect.fromLTWH(base.dx - 52 + i * 20, base.dy - 42, 12, 16), Paint()..color = const Color(0xFF6C767E));
    }
    final chim = Rect.fromLTRB(base.dx + 36, base.dy - 150, base.dx + 52, base.dy);
    c.drawPath(
        Path()
          ..moveTo(chim.left - 4, chim.bottom)
          ..lineTo(chim.left, chim.top)
          ..lineTo(chim.right, chim.top)
          ..lineTo(chim.right + 4, chim.bottom)
          ..close(),
        hGrad(chim, [tone(wall, -0.2), tone(wall, 0.2), tone(wall, -0.25)]));
    for (final y in [chim.top + 10, chim.top + 18]) {
      c.drawLine(Offset(chim.left, y), Offset(chim.right, y), linePaint(const Color(0xFFA0473B), 3));
    }
    // Plume, stronger during combustion.
    final k = step == 5 ? 1.0 : 0.45;
    for (var i = 0; i < 7; i++) {
      final ph = fr(rnd(i, 95) + t * 3);
      final p = Offset(chim.center.dx - ph * 40 + math.sin(ph * 6 + i) * 6, chim.top - 8 - ph * 90);
      c.drawCircle(p, 8 + ph * 18, Paint()..color = const Color(0xFF9EA4A8).withValues(alpha: (1 - ph) * 0.45 * k));
    }
  }

  void _names(int s) {
    void name(String l3, Offset at, bool on, {double align = 0}) => tag(l3, at, size: 13, color: on ? TP.ink : TP.ink2, align: align, weight: on ? FontWeight.w600 : FontWeight.w500, opacity: on ? 1 : 0.7, maxWidth: 170);
    name('Photosynthesis|प्रकाश संश्लेषण|ದ್ಯುತಿಸಂಶ್ಲೇಷಣೆ', const Offset(300, 100), s == 1, align: -1);
    name('Food chain: animals eat plants|आहार शृंखला: जंतु पौधे खाते हैं|ಆಹಾರ ಸರಪಳಿ: ಪ್ರಾಣಿಗಳು ಸಸ್ಯ ತಿನ್ನುತ್ತವೆ', const Offset(336, 180), s == 2, align: -1);
    name('Respiration|श्वसन|ಉಸಿರಾಟ', const Offset(150, 230), s == 3);
    name('Respiration|श्वसन|ಉಸಿರಾಟ', const Offset(520, 170), s == 3, align: -1);
    name('Decomposition|अपघटन|ವಿಘಟನೆ', const Offset(286, 252), s == 4, align: 1);
    name('Burial: fossil fuels form|दबना: जीवाश्म ईंधन बनते हैं|ಹೂಳುವಿಕೆ: ಪಳೆಯುಳಿಕೆ ಇಂಧನ', const Offset(432, 412), s == 4, align: -1);
    name('Combustion|दहन|ದಹನ', const Offset(680, 110), s == 5, align: -1);
    name('Fuel extracted|ईंधन निकालना|ಇಂಧನ ಹೊರತೆಗೆಯುವಿಕೆ', const Offset(616, 470), s == 5, align: -1);
    name('Exchange with the ocean|महासागर से आदान-प्रदान|ಸಾಗರದೊಂದಿಗೆ ವಿನಿಮಯ', const Offset(900, 210), s == 0, align: 1);
  }
}
