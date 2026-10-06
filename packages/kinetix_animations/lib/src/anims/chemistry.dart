import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../draw.dart';
import '../model.dart';

// States of matter, atomic structure, and electrolysis.

final statesOfMatter = KxAnimation(
  id: 'states-of-matter',
  title: const Tr('States of matter', 'पदार्थ की अवस्थाएँ', 'ದ್ರವ್ಯದ ಸ್ಥಿತಿಗಳು'),
  subject: 'Chemistry',
  topic: 'Matter',
  levels: const ['Class 6', 'Class 8', 'Class 9'],
  keywords: const ['states of matter', 'solid', 'liquid', 'gas', 'particles', 'melting', 'boiling', 'evaporation', 'heating curve', 'latent heat', 'kinetic theory', 'change of state'],
  seconds: 22,
  thumbT: 0.45,
  steps: const [
    AnimStep(0, Tr('Solid (ice)', 'ठोस (बर्फ़)', 'ಘನ (ಮಂಜುಗಡ್ಡೆ)'),
        Tr('In a solid the particles are packed tightly in fixed places. They only vibrate.', 'ठोस में कण अपनी निश्चित जगहों पर कसकर जमे होते हैं। वे केवल कंपन करते हैं।', 'ಘನದಲ್ಲಿ ಕಣಗಳು ನಿಗದಿತ ಸ್ಥಳಗಳಲ್ಲಿ ಬಿಗಿಯಾಗಿ ಜೋಡಿಸಿರುತ್ತವೆ. ಅವು ಕೇವಲ ಕಂಪಿಸುತ್ತವೆ.')),
    AnimStep(0.2, Tr('Melting', 'पिघलना', 'ಕರಗುವಿಕೆ'),
        Tr('Heat gives the particles energy to break free of their places. The temperature stays at 0 °C until all the ice melts.', 'ऊष्मा कणों को अपनी जगह छोड़ने की ऊर्जा देती है। सारी बर्फ़ पिघलने तक तापमान 0 °C पर रहता है।', 'ಶಾಖ ಕಣಗಳಿಗೆ ತಮ್ಮ ಸ್ಥಳ ಬಿಡುವ ಶಕ್ತಿ ಕೊಡುತ್ತದೆ. ಎಲ್ಲ ಮಂಜು ಕರಗುವವರೆಗೆ ತಾಪ 0 °C ನಲ್ಲೇ ಇರುತ್ತದೆ.')),
    AnimStep(0.36, Tr('Liquid (water)', 'द्रव (पानी)', 'ದ್ರವ (ನೀರು)'),
        Tr('In a liquid the particles are still close but slide past each other, so a liquid flows and takes the shape of its container.', 'द्रव में कण पास-पास रहते हैं पर एक-दूसरे पर फिसलते हैं, इसलिए द्रव बहता है और बर्तन का आकार ले लेता है।', 'ದ್ರವದಲ್ಲಿ ಕಣಗಳು ಹತ್ತಿರವಿದ್ದರೂ ಒಂದರ ಮೇಲೊಂದು ಜಾರುತ್ತವೆ; ದ್ರವ ಹರಿಯುತ್ತದೆ ಮತ್ತು ಪಾತ್ರೆಯ ಆಕಾರ ಪಡೆಯುತ್ತದೆ.')),
    AnimStep(0.56, Tr('Boiling', 'उबलना', 'ಕುದಿಯುವಿಕೆ'),
        Tr('At 100 °C the particles have enough energy to escape completely and become steam.', '100 °C पर कणों के पास पूरी तरह बच निकलने की ऊर्जा होती है और वे भाप बन जाते हैं।', '100 °C ನಲ್ಲಿ ಕಣಗಳಿಗೆ ಸಂಪೂರ್ಣ ತಪ್ಪಿಸಿಕೊಳ್ಳುವ ಶಕ್ತಿ ಬರುತ್ತದೆ; ಅವು ಹಬೆಯಾಗುತ್ತವೆ.')),
    AnimStep(0.72, Tr('Gas (steam)', 'गैस (भाप)', 'ಅನಿಲ (ಹಬೆ)'),
        Tr('In a gas the particles are far apart and move fast in all directions, filling the whole container.', 'गैस में कण दूर-दूर होते हैं और सब दिशाओं में तेज़ी से चलते हुए पूरा बर्तन भर देते हैं।', 'ಅನಿಲದಲ್ಲಿ ಕಣಗಳು ದೂರ ದೂರವಿದ್ದು ಎಲ್ಲ ದಿಕ್ಕುಗಳಲ್ಲಿ ವೇಗವಾಗಿ ಚಲಿಸುತ್ತಾ ಇಡೀ ಪಾತ್ರೆಯನ್ನು ತುಂಬುತ್ತವೆ.')),
  ],
  painter: _States.new,
);

class _States extends AnimPainter {
  _States(super.f);

  static const box = Rect.fromLTWH(80, 110, 400, 380);

  /// Temperature (°C) at time [x] along the heating curve.
  static double temp(double x) {
    if (x < 0.2) return -20 + 20 * x / 0.2;
    if (x < 0.36) return 0;
    if (x < 0.56) return 100 * (x - 0.36) / 0.2;
    if (x < 0.72) return 100;
    return 100 + 30 * (x - 0.72) / 0.28;
  }

  @override
  void draw() {
    final melt = seg(t, 0.2, 0.36), boil = seg(t, 0.56, 0.72);
    // Container, heater.
    path(Path()..moveTo(box.left, box.top)..lineTo(box.left, box.bottom)..lineTo(box.right, box.bottom)..lineTo(box.right, box.top), AC.ink, 4);
    rect(Rect.fromLTRB(box.left + 2, box.top + 2, box.right - 2, box.bottom - 2), const Color(0xFFF1F8FD));
    for (var i = 0; i < 5; i++) {
      final x = box.left + 60 + i * 70.0;
      final h = 26 + 10 * math.sin(t * 90 + i);
      fillPath(Path()..moveTo(x - 14, 540)..quadraticBezierTo(x - 10, 540 - h * 0.6, x, 540 - h)..quadraticBezierTo(x + 10, 540 - h * 0.6, x + 14, 540)..close(), const Color(0xFFFF7043));
    }
    rect(Rect.fromLTWH(box.left, 540, box.width, 16), const Color(0xFF616161), radius: 4);
    // Particles.
    for (var i = 0; i < 30; i++) {
      final col = i % 6, row = i ~/ 6;
      final solid = Offset(box.left + 60 + col * 56.0, box.bottom - 30 - row * 44.0) + Offset(math.sin(t * 160 + i), math.cos(t * 150 + i * 2)) * 3;
      final liquid = Offset(box.left + 40 + rnd(i, 1) * 320, box.bottom - 30 - rnd(i, 2) * 170) + Offset(math.sin(t * 30 + i * 1.7), math.cos(t * 26 + i)) * 16;
      final gas = Offset(box.left + 20 + 360 * tri(fr(rnd(i, 3) + t * (2 + rnd(i, 4) * 2))), box.top + 20 + 340 * tri(fr(rnd(i, 5) + t * (2 + rnd(i, 6) * 2))));
      final m = ((melt - rnd(i, 9) * 0.7) * 3).clamp(0.0, 1.0);
      final b = ((boil - rnd(i, 10) * 0.7) * 3).clamp(0.0, 1.0);
      final p = lerpO(lerpO(solid, liquid, m), gas, b);
      circle(p, 15, Color.lerp(Color.lerp(const Color(0xFF90CAF9), AC.water, m)!, const Color(0xFFB0BEC5), b)!, line: Colors.white, w: 2);
    }
    // Thermometer.
    const th = Rect.fromLTWH(505, 130, 18, 330);
    rect(th, Colors.white, line: AC.ink, w: 2, radius: 9);
    final level = (temp(t) + 30) / 170;
    rect(Rect.fromLTRB(th.left + 4, th.bottom - (th.height - 10) * level, th.right - 4, th.bottom - 4), AC.red, radius: 5);
    circle(Offset(th.center.dx, th.bottom + 10), 16, AC.red);
    text('${temp(t).round()} °C', Offset(th.center.dx, th.top - 20), size: 18, weight: FontWeight.w700);

    // Heating curve.
    const g = Rect.fromLTWH(590, 110, 380, 360);
    line(Offset(g.left, g.bottom), Offset(g.right, g.bottom), AC.ink, 2);
    line(Offset(g.left, g.bottom), Offset(g.left, g.top), AC.ink, 2);
    Offset pt(double x) => Offset(g.left + x * g.width, g.bottom - (temp(x) + 30) / 170 * g.height);
    final curve = Path()..moveTo(pt(0).dx, pt(0).dy);
    for (var x = 0.0; x <= 1.0; x += 0.01) {
      curve.lineTo(pt(x).dx, pt(x).dy);
    }
    path(curve, AC.line, 4);
    final done = Path()..moveTo(pt(0).dx, pt(0).dy);
    for (var x = 0.0; x <= t; x += 0.01) {
      done.lineTo(pt(x).dx, pt(x).dy);
    }
    path(done, AC.red, 4);
    circle(pt(t), 9, AC.red, line: Colors.white, w: 2);
    for (final (y, name) in [(0.0, '0 °C'), (100.0, '100 °C')]) {
      final yy = g.bottom - (y + 30) / 170 * g.height;
      dashed(Offset(g.left, yy), Offset(g.right, yy), AC.muted.withValues(alpha: 0.5), w: 1);
      text(name, Offset(g.left - 8, yy), size: 13, color: AC.muted, align: 1);
    }
    text(tr('Temperature|तापमान|ತಾಪಮಾನ'), Offset(g.left + 10, g.top - 14), size: 14, color: AC.muted, align: -1);
    text(tr('Heat added →|दी गई ऊष्मा →|ನೀಡಿದ ಶಾಖ →'), Offset(g.right, g.bottom + 18), size: 14, color: AC.muted, align: 1);
    label('Melting point|गलनांक|ದ್ರವನ ಬಿಂದು', pt(0.28) + const Offset(0, 28), size: 14);
    label('Boiling point|क्वथनांक|ಕುದಿಯುವ ಬಿಂದು', pt(0.64) + const Offset(0, 28), size: 14);
    final state = t < 0.2 ? 'Solid|ठोस|ಘನ' : t < 0.36 ? 'Solid + liquid|ठोस + द्रव|ಘನ + ದ್ರವ' : t < 0.56 ? 'Liquid|द्रव|ದ್ರವ' : t < 0.72 ? 'Liquid + gas|द्रव + गैस|ದ್ರವ + ಅನಿಲ' : 'Gas|गैस|ಅನಿಲ';
    label(state, Offset(box.center.dx, 70), size: 22);
  }
}

final atomicStructure = KxAnimation(
  id: 'atomic-structure',
  title: const Tr('Structure of the atom', 'परमाणु की संरचना', 'ಪರಮಾಣುವಿನ ರಚನೆ'),
  subject: 'Chemistry',
  topic: 'Structure of the atom',
  levels: const ['Class 9', 'Class 11'],
  keywords: const ['atom', 'atomic structure', 'electron', 'proton', 'neutron', 'nucleus', 'shells', 'bohr model', 'electronic configuration', 'valence', 'atomic number'],
  seconds: 24,
  thumbT: 0.3,
  steps: const [
    AnimStep(0, Tr('The nucleus', 'नाभिक', 'ನ್ಯೂಕ್ಲಿಯಸ್'),
        Tr('At the centre is a tiny nucleus of protons (positive) and neutrons (no charge). A sodium atom has 11 protons.', 'केंद्र में प्रोटॉन (धनावेशित) और न्यूट्रॉन (अनावेशित) का छोटा नाभिक है। सोडियम परमाणु में 11 प्रोटॉन होते हैं।', 'ಕೇಂದ್ರದಲ್ಲಿ ಪ್ರೋಟಾನ್ (ಧನ) ಮತ್ತು ನ್ಯೂಟ್ರಾನ್ (ಆವೇಶರಹಿತ) ಗಳ ಸಣ್ಣ ನ್ಯೂಕ್ಲಿಯಸ್ ಇದೆ. ಸೋಡಿಯಂ ಪರಮಾಣುವಿನಲ್ಲಿ 11 ಪ್ರೋಟಾನ್‌ಗಳಿವೆ.')),
    AnimStep(0.2, Tr('Electron shells', 'इलेक्ट्रॉन कोश', 'ಇಲೆಕ್ಟ್ರಾನ್ ಕವಚಗಳು'),
        Tr('Electrons (negative) move round the nucleus in shells: K, L, M… An atom has as many electrons as protons.', 'इलेक्ट्रॉन (ऋणावेशित) नाभिक के चारों ओर कोशों में घूमते हैं: K, L, M… परमाणु में जितने प्रोटॉन, उतने ही इलेक्ट्रॉन।', 'ಇಲೆಕ್ಟ್ರಾನ್‌ಗಳು (ಋಣ) ನ್ಯೂಕ್ಲಿಯಸ್ ಸುತ್ತ ಕವಚಗಳಲ್ಲಿ ಸುತ್ತುತ್ತವೆ: K, L, M… ಪ್ರೋಟಾನ್‌ಗಳಷ್ಟೇ ಇಲೆಕ್ಟ್ರಾನ್‌ಗಳಿರುತ್ತವೆ.')),
    AnimStep(0.36, Tr('Filling the shells', 'कोशों का भरना', 'ಕವಚಗಳ ಭರ್ತಿ'),
        Tr('The K shell holds 2 electrons, the L shell 8; the outermost shell holds at most 8. Sodium is 2, 8, 1.', 'K कोश में 2 इलेक्ट्रॉन, L में 8 आते हैं; सबसे बाहरी कोश में अधिकतम 8। सोडियम: 2, 8, 1।', 'K ಕವಚದಲ್ಲಿ 2, L ನಲ್ಲಿ 8 ಇಲೆಕ್ಟ್ರಾನ್; ಹೊರಗಿನ ಕವಚದಲ್ಲಿ ಗರಿಷ್ಠ 8. ಸೋಡಿಯಂ: 2, 8, 1.')),
    AnimStep(0.5, Tr('Building atoms', 'परमाणुओं का निर्माण', 'ಪರಮಾಣುಗಳ ರಚನೆ'),
        Tr('From hydrogen to argon, each element has one more proton and one more electron than the one before.', 'हाइड्रोजन से आर्गन तक, हर तत्व में पिछले से एक प्रोटॉन और एक इलेक्ट्रॉन अधिक होता है।', 'ಹೈಡ್ರೋಜನ್‌ನಿಂದ ಆರ್ಗಾನ್‌ವರೆಗೆ ಪ್ರತಿ ಧಾತುವಿನಲ್ಲಿ ಹಿಂದಿನದಕ್ಕಿಂತ ಒಂದು ಪ್ರೋಟಾನ್ ಮತ್ತು ಒಂದು ಇಲೆಕ್ಟ್ರಾನ್ ಹೆಚ್ಚು.')),
    AnimStep(0.86, Tr('Valence electrons', 'संयोजकता इलेक्ट्रॉन', 'ವೇಲೆನ್ಸಿ ಇಲೆಕ್ಟ್ರಾನ್‌ಗಳು'),
        Tr('The electrons in the outermost shell decide how an atom reacts. Sodium easily gives away its single outer electron.', 'सबसे बाहरी कोश के इलेक्ट्रॉन तय करते हैं कि परमाणु कैसे अभिक्रिया करेगा। सोडियम अपना एक बाहरी इलेक्ट्रॉन आसानी से दे देता है।', 'ಹೊರಗಿನ ಕವಚದ ಇಲೆಕ್ಟ್ರಾನ್‌ಗಳು ಪರಮಾಣು ಹೇಗೆ ಪ್ರತಿಕ್ರಿಯಿಸುತ್ತದೆ ಎಂದು ನಿರ್ಧರಿಸುತ್ತವೆ. ಸೋಡಿಯಂ ತನ್ನ ಒಂದು ಹೊರ ಇಲೆಕ್ಟ್ರಾನ್ ಅನ್ನು ಸುಲಭವಾಗಿ ಬಿಡುತ್ತದೆ.')),
  ],
  painter: _Atom.new,
);

class _Atom extends AnimPainter {
  _Atom(super.f);

  static const o = Offset(330, 300);
  static const symbols = ['H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne', 'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar'];
  static const names = [
    'Hydrogen|हाइड्रोजन|ಹೈಡ್ರೋಜನ್', 'Helium|हीलियम|ಹೀಲಿಯಂ', 'Lithium|लिथियम|ಲಿಥಿಯಂ', 'Beryllium|बेरिलियम|ಬೆರಿಲಿಯಂ', 'Boron|बोरॉन|ಬೋರಾನ್', 'Carbon|कार्बन|ಇಂಗಾಲ',
    'Nitrogen|नाइट्रोजन|ಸಾರಜನಕ', 'Oxygen|ऑक्सीजन|ಆಮ್ಲಜನಕ', 'Fluorine|फ्लुओरीन|ಫ್ಲೋರಿನ್', 'Neon|नियॉन|ನಿಯಾನ್', 'Sodium|सोडियम|ಸೋಡಿಯಂ', 'Magnesium|मैग्नीशियम|ಮೆಗ್ನೀಸಿಯಂ',
    'Aluminium|ऐलुमिनियम|ಅಲ್ಯೂಮಿನಿಯಂ', 'Silicon|सिलिकॉन|ಸಿಲಿಕಾನ್', 'Phosphorus|फ़ॉस्फ़ोरस|ರಂಜಕ', 'Sulphur|सल्फ़र|ಗಂಧಕ', 'Chlorine|क्लोरीन|ಕ್ಲೋರಿನ್', 'Argon|आर्गन|ಆರ್ಗಾನ್',
  ];
  static const neutrons = [0, 2, 4, 5, 6, 6, 7, 8, 10, 10, 12, 12, 14, 14, 16, 16, 18, 22];

  int get z => t >= 0.5 && t < 0.86 ? 1 + (17 * seg(t, 0.52, 0.84)).round() : 11;

  static List<int> shells(int z) => [math.min(z, 2), (z - 2).clamp(0, 8), (z - 10).clamp(0, 8)];

  @override
  void draw() {
    final zz = z, n = neutrons[zz - 1];
    final sh = shells(zz);
    final showE = seg(t, 0.18, 0.24);
    // Shells.
    for (var s = 0; s < 3; s++) {
      final r = 95.0 + s * 70;
      final used = sh[s] > 0;
      ring(o, r, (used ? AC.muted : AC.line).withValues(alpha: 0.3 + 0.7 * showE), used ? 2.5 : 1.5);
      label(['K', 'L', 'M'][s], o + Offset(r * 0.71 + 12, -r * 0.71 - 12), size: 16, opacity: showE);
    }
    // Nucleus: protons and neutrons packed in a sunflower pattern.
    final total = zz + n;
    for (var k = 0; k < total; k++) {
      final r = 9.0 * math.sqrt(k + 0.5);
      final a = k * 2.39996;
      final isP = (k * zz / total).floor() != ((k + 1) * zz / total).floor() || total == zz;
      circle(o + Offset(math.cos(a), math.sin(a)) * r, 9, isP ? AC.red : const Color(0xFF9E9E9E), line: Colors.white, w: 1.5);
      if (isP && f.labels && total < 20) text('+', o + Offset(math.cos(a), math.sin(a)) * r, size: 11, color: Colors.white, weight: FontWeight.w700);
    }
    // Electrons.
    for (var s = 0; s < 3; s++) {
      final r = 95.0 + s * 70;
      for (var e = 0; e < sh[s]; e++) {
        final a = e / sh[s] * tau + t * tau * (3 - s) * 1.5;
        final valence = t >= 0.86 && s == (sh[2] > 0 ? 2 : (sh[1] > 0 ? 1 : 0));
        final p = polar(o, r, a);
        if (valence) c.drawCircle(p, 22, Paint()..shader = RadialGradient(colors: [AC.sun, AC.sun.withValues(alpha: 0)]).createShader(Rect.fromCircle(center: p, radius: 22)));
        circle(p, 10, AC.electron.withValues(alpha: showE), line: Colors.white, w: 2);
        if (f.labels) text('−', p, size: 12, color: Colors.white.withValues(alpha: showE), weight: FontWeight.w700);
      }
    }
    // Facts card.
    const card = Rect.fromLTWH(640, 60, 330, 300);
    rect(card, Colors.white, line: AC.line, radius: 18);
    text(symbols[zz - 1], Offset(card.left + 70, card.top + 75), size: 64, weight: FontWeight.w700, color: AC.accent);
    text('$zz', Offset(card.left + 30, card.top + 26), size: 18, weight: FontWeight.w700, color: AC.muted);
    text(tr(names[zz - 1]), Offset(card.left + 140, card.top + 75), size: 24, weight: FontWeight.w700, align: -1);
    text('${tr('Protons|प्रोटॉन|ಪ್ರೋಟಾನ್')}: $zz', Offset(card.left + 30, card.top + 150), size: 18, color: AC.red, align: -1);
    text('${tr('Neutrons|न्यूट्रॉन|ನ್ಯೂಟ್ರಾನ್')}: $n', Offset(card.left + 30, card.top + 182), size: 18, color: AC.muted, align: -1);
    text('${tr('Electrons|इलेक्ट्रॉन|ಇಲೆಕ್ಟ್ರಾನ್')}: $zz', Offset(card.left + 30, card.top + 214), size: 18, color: AC.electron, align: -1);
    text(sh.where((e) => e > 0).join(', '), Offset(card.left + 30, card.top + 258), size: 26, weight: FontWeight.w700, align: -1);
    // Shell capacities.
    if (t >= 0.36 && t < 0.5) {
      rect(const Rect.fromLTWH(640, 390, 330, 150), Colors.white, line: AC.accent, w: 3, radius: 18);
      for (var s = 0; s < 3; s++) {
        text('${['K', 'L', 'M'][s]}:  ${[2, 8, 8][s]}${s == 2 ? ' (${tr('outermost|सबसे बाहरी|ಹೊರಗಿನ')})' : ''}', Offset(670, 425 + s * 40.0), size: 20, align: -1);
      }
    }
    label('Nucleus|नाभिक|ನ್ಯೂಕ್ಲಿಯಸ್', const Offset(120, 560), to: o + const Offset(-20, 30));
    label('Proton (+)|प्रोटॉन (+)|ಪ್ರೋಟಾನ್ (+)', const Offset(110, 60), color: AC.red);
    label('Neutron|न्यूट्रॉन|ನ್ಯೂಟ್ರಾನ್', const Offset(110, 95), color: AC.muted);
    label('Electron (−)|इलेक्ट्रॉन (−)|ಇಲೆಕ್ಟ್ರಾನ್ (−)', const Offset(110, 130), color: AC.electron, opacity: showE);
    label('Valence electron|संयोजकता इलेक्ट्रॉन|ವೇಲೆನ್ಸಿ ಇಲೆಕ್ಟ್ರಾನ್', const Offset(800, 420), opacity: t >= 0.86 ? 1 : 0);
  }
}

final electrolysis = KxAnimation(
  id: 'electrolysis',
  title: const Tr('Electrolysis of water', 'जल का विद्युत अपघटन', 'ನೀರಿನ ವಿದ್ಯುದ್ವಿಭಜನೆ'),
  subject: 'Chemistry',
  topic: 'Chemical reactions',
  levels: const ['Class 8', 'Class 10'],
  keywords: const ['electrolysis', 'water', 'hydrogen', 'oxygen', 'cathode', 'anode', 'electrodes', 'ions', 'decomposition reaction', 'chemical effects of current'],
  seconds: 20,
  thumbT: 0.85,
  steps: const [
    AnimStep(0, Tr('The set-up', 'उपकरण', 'ಸಲಕರಣೆ'),
        Tr('Two electrodes stand in water with a few drops of acid, joined to a battery. Test tubes full of water sit over them.', 'अम्ल की कुछ बूँदें मिले पानी में दो इलेक्ट्रोड हैं, जो बैटरी से जुड़े हैं। उन पर पानी से भरी परखनलियाँ उलटी रखी हैं।', 'ಕೆಲವು ಹನಿ ಆಮ್ಲ ಬೆರೆಸಿದ ನೀರಿನಲ್ಲಿ ಎರಡು ವಿದ್ಯುದ್ವಾರಗಳಿದ್ದು ಬ್ಯಾಟರಿಗೆ ಜೋಡಿಸಲಾಗಿದೆ. ಅವುಗಳ ಮೇಲೆ ನೀರು ತುಂಬಿದ ಪರೀಕ್ಷಾ ನಳಿಕೆಗಳಿವೆ.')),
    AnimStep(0.2, Tr('Ions move', 'आयन चलते हैं', 'ಅಯಾನುಗಳ ಚಲನೆ'),
        Tr('Current flows. Positive hydrogen ions move to the negative electrode (cathode); negative ions move to the positive electrode (anode).', 'धारा बहती है। धनावेशित हाइड्रोजन आयन ऋण इलेक्ट्रोड (कैथोड) की ओर, ऋणावेशित आयन धन इलेक्ट्रोड (ऐनोड) की ओर जाते हैं।', 'ಪ್ರವಾಹ ಹರಿಯುತ್ತದೆ. ಧನ ಹೈಡ್ರೋಜನ್ ಅಯಾನುಗಳು ಋಣ ವಿದ್ಯುದ್ವಾರ (ಕ್ಯಾಥೋಡ್) ಕಡೆಗೆ, ಋಣ ಅಯಾನುಗಳು ಧನ ವಿದ್ಯುದ್ವಾರ (ಆನೋಡ್) ಕಡೆಗೆ ಸಾಗುತ್ತವೆ.')),
    AnimStep(0.4, Tr('Hydrogen', 'हाइड्रोजन', 'ಹೈಡ್ರೋಜನ್'),
        Tr('At the cathode, hydrogen ions gain electrons and bubbles of hydrogen gas rise into the tube.', 'कैथोड पर हाइड्रोजन आयन इलेक्ट्रॉन लेते हैं और हाइड्रोजन गैस के बुलबुले नली में ऊपर उठते हैं।', 'ಕ್ಯಾಥೋಡ್‌ನಲ್ಲಿ ಹೈಡ್ರೋಜನ್ ಅಯಾನುಗಳು ಇಲೆಕ್ಟ್ರಾನ್ ಪಡೆದು ಹೈಡ್ರೋಜನ್ ಅನಿಲದ ಗುಳ್ಳೆಗಳು ನಳಿಕೆಯಲ್ಲಿ ಏರುತ್ತವೆ.')),
    AnimStep(0.6, Tr('Oxygen', 'ऑक्सीजन', 'ಆಮ್ಲಜನಕ'),
        Tr('At the anode, oxygen gas is given off.', 'ऐनोड पर ऑक्सीजन गैस निकलती है।', 'ಆನೋಡ್‌ನಲ್ಲಿ ಆಮ್ಲಜನಕ ಅನಿಲ ಬಿಡುಗಡೆಯಾಗುತ್ತದೆ.')),
    AnimStep(0.8, Tr('Two to one', 'दो और एक', 'ಎರಡು ಮತ್ತು ಒಂದು'),
        Tr('Twice as much hydrogen as oxygen collects: water is H₂O. 2H₂O → 2H₂ + O₂.', 'ऑक्सीजन से दोगुनी हाइड्रोजन जमा होती है: पानी H₂O है। 2H₂O → 2H₂ + O₂।', 'ಆಮ್ಲಜನಕಕ್ಕಿಂತ ಎರಡರಷ್ಟು ಹೈಡ್ರೋಜನ್ ಸಂಗ್ರಹವಾಗುತ್ತದೆ: ನೀರು H₂O. 2H₂O → 2H₂ + O₂.')),
  ],
  painter: _Electrolysis.new,
);

class _Electrolysis extends AnimPainter {
  _Electrolysis(super.f);

  static const cath = 380.0, anode = 620.0;

  @override
  void draw() {
    final on = t >= 0.2;
    final gas = seg(t, 0.4, 1);
    // Beaker of water.
    const beaker = Rect.fromLTWH(230, 230, 540, 300);
    rect(Rect.fromLTRB(beaker.left, beaker.top + 30, beaker.right, beaker.bottom), AC.waterLight);
    path(Path()..moveTo(beaker.left, beaker.top)..lineTo(beaker.left, beaker.bottom)..lineTo(beaker.right, beaker.bottom)..lineTo(beaker.right, beaker.top), AC.ink, 4);
    // Ions drifting.
    if (on) {
      for (var i = 0; i < 12; i++) {
        final k = fr(t * 2 + rnd(i));
        final y = beaker.top + 60 + rnd(i, 1) * 200;
        final x0 = beaker.left + 40 + rnd(i, 2) * 460;
        final pos = i.isEven;
        final x = _lerp(x0, pos ? cath + 20 : anode - 20, k);
        circle(Offset(x, y), 9, pos ? AC.red : AC.purple, line: Colors.white, w: 1.5);
        if (f.labels) text(pos ? '+' : '−', Offset(x, y), size: 11, color: Colors.white, weight: FontWeight.w700);
      }
    }
    // Test tubes with gas gathering at the top: hydrogen twice oxygen.
    for (final (x, frac, name) in [(cath, 1.0, 'H₂'), (anode, 0.5, 'O₂')]) {
      final tube = Rect.fromLTWH(x - 40, 130, 80, 360);
      rect(tube, AC.waterLight, radius: 0);
      final h = 220 * gas * frac;
      rect(Rect.fromLTWH(tube.left + 3, tube.top + 3, tube.width - 6, h), const Color(0xFFFFFFFF), radius: 30);
      c.drawRRect(RRect.fromRectAndCorners(tube, topLeft: const Radius.circular(40), topRight: const Radius.circular(40)), stroke(AC.ink.withValues(alpha: 0.7), 3));
      if (h > 30) chip(name, Offset(x, tube.top + 30 + h / 4), name == 'H₂' ? AC.blue : AC.o2, size: 15);
      // Electrode.
      rect(Rect.fromLTWH(x - 9, 360, 18, 140), const Color(0xFF424242), radius: 4);
      // Bubbles.
      if (t >= 0.4) {
        for (var i = 0; i < (frac > 0.6 ? 10 : 5); i++) {
          final k = fr(t * 5 + rnd(i, 3 + x.toInt()));
          circle(Offset(x - 16 + rnd(i, 4) * 32, 470 - k * (300 - h)), 4 + 2 * rnd(i, 5), Colors.white, line: AC.water, w: 1.5);
        }
      }
    }
    // Battery and wires.
    rect(const Rect.fromLTWH(440, 40, 120, 50), const Color(0xFF455A64), radius: 6);
    text('−', const Offset(455, 65), size: 26, color: Colors.white, weight: FontWeight.w700);
    text('+', const Offset(545, 65), size: 26, color: Colors.white, weight: FontWeight.w700);
    path(Path()..moveTo(440, 65)..lineTo(130, 65)..lineTo(130, 560)..lineTo(cath, 560)..lineTo(cath, 500), AC.copper, 4);
    path(Path()..moveTo(560, 65)..lineTo(870, 65)..lineTo(870, 560)..lineTo(anode, 560)..lineTo(anode, 500), AC.copper, 4);
    if (on) {
      for (var i = 0; i < 6; i++) {
        final p = along(Path()..moveTo(440, 65)..lineTo(130, 65)..lineTo(130, 560)..lineTo(cath, 560), fr(t * 3 + i / 6));
        circle(p, 5, AC.electron);
        final q = along(Path()..moveTo(anode, 560)..lineTo(870, 560)..lineTo(870, 65)..lineTo(560, 65), fr(t * 3 + i / 6));
        circle(q, 5, AC.electron);
      }
    }
    label('Cathode (−)|कैथोड (−)|ಕ್ಯಾಥೋಡ್ (−)', const Offset(220, 470), to: const Offset(cath - 10, 470), color: AC.blue);
    label('Anode (+)|ऐनोड (+)|ಆನೋಡ್ (+)', const Offset(800, 470), to: const Offset(anode + 10, 470), color: AC.red);
    label('Hydrogen|हाइड्रोजन|ಹೈಡ್ರೋಜನ್', const Offset(cath, 110), opacity: seg(t, 0.4, 0.45));
    label('Oxygen|ऑक्सीजन|ಆಮ್ಲಜನಕ', const Offset(anode, 110), opacity: seg(t, 0.6, 0.65));
    label('Battery|बैटरी|ಬ್ಯಾಟರಿ', const Offset(500, 18));
    label('Acidified water|अम्लीय जल|ಆಮ್ಲೀಕೃತ ನೀರು', const Offset(500, 510));
    if (t >= 0.8) {
      rect(const Rect.fromLTWH(680, 140, 290, 70), Colors.white, line: AC.accent, w: 3, radius: 14);
      text('2H₂O → 2H₂ + O₂', const Offset(825, 175), size: 26, weight: FontWeight.w700);
      text('2 : 1', const Offset(500, 160), size: 30, weight: FontWeight.w700, color: AC.accent);
    }
  }
}

double _lerp(double a, double b, double k) => a + (b - a) * k;
