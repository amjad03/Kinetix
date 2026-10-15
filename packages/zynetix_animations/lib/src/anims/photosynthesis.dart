import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../draw.dart';
import '../model.dart';

final photosynthesis = KxAnimation(
  id: 'photosynthesis',
  title: const Tr('Photosynthesis', 'प्रकाश संश्लेषण', 'ದ್ಯುತಿಸಂಶ್ಲೇಷಣೆ'),
  subject: 'Biology',
  topic: 'Life processes',
  levels: const ['Class 7', 'Class 10', 'Class 11'],
  keywords: const ['photosynthesis', 'chloroplast', 'chlorophyll', 'leaf', 'plant', 'glucose', 'oxygen', 'carbon dioxide', 'light reaction', 'calvin cycle', 'stomata', 'nutrition'],
  seconds: 24,
  thumbT: 0.74,
  steps: const [
    AnimStep(0, Tr('Sunlight', 'सूर्य का प्रकाश', 'ಸೂರ್ಯನ ಬೆಳಕು'),
        Tr('Sunlight falls on the leaf. The green pigment chlorophyll in the chloroplasts absorbs its energy.', 'सूर्य का प्रकाश पत्ती पर पड़ता है। हरितलवक में मौजूद हरा वर्णक क्लोरोफिल इसकी ऊर्जा सोख लेता है।', 'ಸೂರ್ಯನ ಬೆಳಕು ಎಲೆಯ ಮೇಲೆ ಬೀಳುತ್ತದೆ. ಹರಿತ್ತಿನಲ್ಲಿರುವ ಹಸಿರು ವರ್ಣಕ ಪತ್ರಹರಿತ್ತು ಅದರ ಶಕ್ತಿಯನ್ನು ಹೀರುತ್ತದೆ.')),
    AnimStep(0.17, Tr('Water', 'जल', 'ನೀರು'),
        Tr('Roots absorb water from the soil. It rises through the xylem of the stem to the leaf.', 'जड़ें मिट्टी से जल सोखती हैं। यह तने के जाइलम से होकर पत्ती तक पहुँचता है।', 'ಬೇರುಗಳು ಮಣ್ಣಿನಿಂದ ನೀರನ್ನು ಹೀರುತ್ತವೆ. ಅದು ಕಾಂಡದ ಕ್ಸೈಲಂ ಮೂಲಕ ಎಲೆಗೆ ಏರುತ್ತದೆ.')),
    AnimStep(0.33, Tr('Carbon dioxide', 'कार्बन डाइऑक्साइड', 'ಇಂಗಾಲದ ಡೈಆಕ್ಸೈಡ್'),
        Tr('Carbon dioxide from the air enters the leaf through tiny pores called stomata.', 'हवा की कार्बन डाइऑक्साइड रंध्र नामक छोटे छिद्रों से पत्ती में प्रवेश करती है।', 'ಗಾಳಿಯ ಇಂಗಾಲದ ಡೈಆಕ್ಸೈಡ್ ಪತ್ರರಂಧ್ರಗಳೆಂಬ ಸಣ್ಣ ರಂಧ್ರಗಳ ಮೂಲಕ ಎಲೆಯನ್ನು ಪ್ರವೇಶಿಸುತ್ತದೆ.')),
    AnimStep(0.5, Tr('Light reaction', 'प्रकाश अभिक्रिया', 'ಬೆಳಕಿನ ಕ್ರಿಯೆ'),
        Tr('In the thylakoids (grana), light energy splits water. Oxygen is set free and ATP and NADPH are made.', 'थाइलेकॉइड (ग्रेना) में प्रकाश ऊर्जा जल को तोड़ती है। ऑक्सीजन मुक्त होती है और ATP व NADPH बनते हैं।', 'ಥೈಲಕಾಯ್ಡ್‌ಗಳಲ್ಲಿ (ಗ್ರಾನಾ) ಬೆಳಕಿನ ಶಕ್ತಿ ನೀರನ್ನು ವಿಭಜಿಸುತ್ತದೆ. ಆಮ್ಲಜನಕ ಬಿಡುಗಡೆಯಾಗಿ ATP ಮತ್ತು NADPH ಉಂಟಾಗುತ್ತವೆ.')),
    AnimStep(0.68, Tr('Calvin cycle', 'केल्विन चक्र', 'ಕ್ಯಾಲ್ವಿನ್ ಚಕ್ರ'),
        Tr('In the stroma, ATP and NADPH are used to fix carbon dioxide into glucose (the dark reaction).', 'स्ट्रोमा में ATP और NADPH की मदद से कार्बन डाइऑक्साइड ग्लूकोज़ में बदलती है (अप्रकाश अभिक्रिया)।', 'ಸ್ಟ್ರೋಮಾದಲ್ಲಿ ATP ಮತ್ತು NADPH ಬಳಸಿ ಇಂಗಾಲದ ಡೈಆಕ್ಸೈಡ್ ಗ್ಲೂಕೋಸ್ ಆಗಿ ಸ್ಥಿರಗೊಳ್ಳುತ್ತದೆ (ಕತ್ತಲೆ ಕ್ರಿಯೆ).')),
    AnimStep(0.85, Tr('Products', 'उत्पाद', 'ಉತ್ಪನ್ನಗಳು'),
        Tr('Glucose feeds the plant and is stored as starch. Oxygen leaves through the stomata into the air.', 'ग्लूकोज़ पौधे का भोजन है और स्टार्च के रूप में जमा होता है। ऑक्सीजन रंध्रों से हवा में निकलती है।', 'ಗ್ಲೂಕೋಸ್ ಸಸ್ಯದ ಆಹಾರ; ಅದು ಪಿಷ್ಟವಾಗಿ ಸಂಗ್ರಹವಾಗುತ್ತದೆ. ಆಮ್ಲಜನಕ ಪತ್ರರಂಧ್ರಗಳ ಮೂಲಕ ಗಾಳಿಗೆ ಹೋಗುತ್ತದೆ.')),
  ],
  painter: _Photo.new,
);

class _Photo extends AnimPainter {
  _Photo(super.f);

  static const stem = Offset(240, 470);
  static const stoma = Offset(372, 268);
  static const cc = Offset(750, 262);

  Path get _leaf => Path()
    ..moveTo(240, 300)
    ..cubicTo(270, 200, 380, 160, 460, 180)
    ..cubicTo(440, 250, 360, 310, 240, 300)
    ..close();

  Path get _leaf2 => Path()
    ..moveTo(240, 360)
    ..cubicTo(200, 300, 130, 300, 80, 320)
    ..cubicTo(120, 370, 190, 380, 240, 360)
    ..close();

  @override
  void draw() {
    // Sky and soil.
    c.drawRect(const Rect.fromLTWH(0, 0, 1000, 470), Paint()..shader = const LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [AC.sky, Colors.white]).createShader(const Rect.fromLTWH(0, 0, 1000, 470)));
    rect(const Rect.fromLTWH(0, 470, 1000, 130), AC.soilLight);
    line(const Offset(0, 470), const Offset(1000, 470), AC.soil, 3);

    final light = seg(t, 0, 0.1);
    sun(const Offset(80, 80), 40);
    for (var i = 0; i < 3; i++) {
      final a = Offset(120 + i * 18.0, 110 + i * 22.0);
      final b = Offset(310 + i * 30.0, 200 + i * 20.0);
      if (light > 0) ray(a, lerpO(a, b, light), AC.sun, phase: t * 12, amp: 5, waves: 6);
    }

    // Roots, stem and leaves.
    for (final r in const [Offset(190, 560), Offset(240, 585), Offset(295, 555), Offset(160, 520), Offset(320, 515)]) {
      final p = Path()
        ..moveTo(stem.dx, stem.dy)
        ..quadraticBezierTo((stem.dx + r.dx) / 2 + 10, (stem.dy + r.dy) / 2 - 10, r.dx, r.dy);
      path(p, AC.soil, 4);
    }
    line(stem, const Offset(240, 250), AC.leafDark, 10);
    final glow = 0.5 + 0.5 * light;
    fillPath(_leaf2, Color.lerp(AC.leafLight, AC.leaf, glow)!, line: AC.leafDark);
    fillPath(_leaf, Color.lerp(AC.leafLight, AC.leaf, glow)!, line: AC.leafDark);
    path(Path()..moveTo(240, 300)..quadraticBezierTo(350, 230, 460, 180), AC.leafDark, 2);

    // Water up the xylem.
    if (t >= 0.17) {
      final xylem = Path()
        ..moveTo(240, 580)
        ..lineTo(240, 470)
        ..lineTo(240, 300)
        ..quadraticBezierTo(300, 262, stoma.dx - 40, stoma.dy - 30);
      for (var i = 0; i < 6; i++) {
        final k = fr(t * 4 + i / 6);
        circle(along(xylem, k), 6, AC.water, line: Colors.white, w: 1.5);
      }
    }

    // Carbon dioxide in, oxygen out, through a stoma.
    circle(stoma, 7, AC.leafDark);
    oval(Rect.fromCenter(center: stoma, width: 18, height: 8), Colors.white);
    if (t >= 0.33) {
      for (var i = 0; i < 3; i++) {
        final k = fr(t * 3 + i / 3);
        chip('CO₂', lerpO(const Offset(470, 420), stoma + const Offset(6, 6), k), AC.co2, size: 13, opacity: 1 - seg(k, 0.85, 1));
      }
    }
    if (t >= 0.5) {
      for (var i = 0; i < 2; i++) {
        final k = fr(t * 3 + i / 2);
        chip('O₂', lerpO(stoma + const Offset(-6, 4), const Offset(330, 430), k), AC.o2, size: 13, opacity: 1 - seg(k, 0.85, 1));
      }
    }
    if (t >= 0.85) {
      final k = fr(t * 4);
      chip('C₆H₁₂O₆', lerpO(const Offset(300, 270), const Offset(240, 420), k), AC.glucose, size: 12);
    }

    // Zoom into a chloroplast.
    final z = ease(seg(t, 0.4, 0.5));
    if (z > 0) _chloroplast(z);
    _equation();

    label('Sunlight|सूर्य का प्रकाश|ಸೂರ್ಯನ ಬೆಳಕು', const Offset(90, 160), opacity: light);
    label('Leaf|पत्ती|ಎಲೆ', const Offset(430, 130), to: const Offset(420, 190));
    label('Stomata|रंध्र|ಪತ್ರರಂಧ್ರ', const Offset(430, 330), to: stoma, opacity: seg(t, 0.3, 0.35));
    label('Xylem (water)|जाइलम (जल)|ಕ್ಸೈಲಂ (ನೀರು)', const Offset(120, 430), to: const Offset(240, 420), opacity: seg(t, 0.15, 0.2));
    label('Roots|जड़ें|ಬೇರುಗಳು', const Offset(380, 560), to: const Offset(300, 550));
  }

  void _chloroplast(double z) {
    // Zoom lines from the leaf to the inset.
    final from = const Offset(340, 240);
    ring(from, 16, AC.ink.withValues(alpha: z), 2);
    dashed(from + const Offset(0, -16), cc + const Offset(0, -200), AC.muted.withValues(alpha: z));
    dashed(from + const Offset(0, 16), cc + const Offset(0, 200), AC.muted.withValues(alpha: z));
    c.save();
    c.translate(cc.dx, cc.dy);
    c.scale(0.3 + 0.7 * z);
    c.translate(-cc.dx, -cc.dy);
    circle(cc, 200, Colors.white, line: AC.line, w: 2);
    final body = Rect.fromCenter(center: cc, width: 360, height: 230);
    oval(body.inflate(8), AC.leafLight, line: AC.leafDark, w: 3);
    oval(body, const Color(0xFFE6F5DF), line: AC.leaf, w: 2);

    // Grana: stacks of thylakoids.
    final lightOn = t >= 0.5 && t < 0.85 ? 1.0 : 0.4;
    for (final g in const [Offset(655, 240), Offset(725, 300), Offset(665, 340)]) {
      for (var i = 0; i < 5; i++) {
        final r = Rect.fromCenter(center: g + Offset(0, (i - 2) * 13.0), width: 58, height: 11);
        final pulse = t >= 0.5 && t < 0.68 ? 0.5 + 0.5 * math.sin(t * 120 + i) : 0.0;
        rect(r, Color.lerp(AC.leaf, const Color(0xFF7BD389), pulse * lightOn)!, line: AC.leafDark, w: 1.2, radius: 5);
      }
    }
    // Calvin cycle in the stroma.
    const cyc = Offset(850, 262);
    final spin = t >= 0.68 ? t * 30 : 0.0;
    for (var i = 0; i < 3; i++) {
      final a0 = spin + i * tau / 3;
      final p = Path()..addArc(Rect.fromCircle(center: cyc, radius: 46), a0, tau / 3 - 0.35);
      arrowPath(p, t >= 0.68 ? AC.accent : AC.muted, w: 4, head: 11);
    }

    if (t >= 0.5) {
      final k = fr(t * 5);
      chip('H₂O', lerpO(const Offset(590, 400), const Offset(650, 300), k), AC.water, size: 13);
      chip('O₂', lerpO(const Offset(660, 230), const Offset(640, 130), k), AC.o2, size: 13);
      if (t >= 0.55) {
        chip('ATP', lerpO(const Offset(740, 290), const Offset(820, 300), fr(k + 0.3)), AC.energy, size: 12);
        chip('NADPH', lerpO(const Offset(740, 320), const Offset(830, 320), fr(k + 0.7)), AC.purple, size: 12);
      }
    }
    if (t >= 0.68) {
      final k = fr(t * 5);
      chip('CO₂', lerpO(const Offset(930, 140), const Offset(870, 230), k), AC.co2, size: 13);
      chip('C₆H₁₂O₆', lerpO(cyc + const Offset(0, 30), const Offset(860, 400), k), AC.glucose, size: 13);
    }
    if (t >= 0.5) {
      final on = 0.5 + 0.5 * math.sin(t * 60);
      ray(const Offset(560, 110), const Offset(640, 205), AC.sun.withValues(alpha: 0.6 + 0.4 * on), phase: t * 14, amp: 4);
    }
    c.restore();
    label('Chloroplast|हरितलवक|ಹರಿತ್ತು', cc + const Offset(0, -175), opacity: z);
    label('Granum (thylakoids)|ग्रेनम (थाइलेकॉइड)|ಗ್ರಾನಮ್ (ಥೈಲಕಾಯ್ಡ್)', const Offset(620, 430), to: const Offset(665, 360), opacity: z);
    label('Stroma|स्ट्रोमा|ಸ್ಟ್ರೋಮಾ', const Offset(930, 400), to: const Offset(880, 340), opacity: z);
    label('Calvin cycle|केल्विन चक्र|ಕ್ಯಾಲ್ವಿನ್ ಚಕ್ರ', const Offset(850, 262), size: 14, opacity: z * seg(t, 0.66, 0.7));
  }

  void _equation() {
    final box = const Rect.fromLTWH(470, 490, 510, 92);
    rect(box, Colors.white, line: AC.line, radius: 14);
    final parts = <(String, Color, bool)>[
      ('6CO₂', AC.co2, t >= 0.33 && t < 0.5 || t >= 0.68 && t < 0.85),
      ('+', AC.ink, false),
      ('6H₂O', AC.water, t >= 0.17 && t < 0.33 || t >= 0.5 && t < 0.68),
      ('→', AC.ink, t < 0.17),
      ('C₆H₁₂O₆', AC.glucose, t >= 0.68),
      ('+', AC.ink, false),
      ('6O₂', AC.o2, t >= 0.5 && t < 0.68 || t >= 0.85),
    ];
    var x = box.left + 22;
    for (final (s, col, on) in parts) {
      final sz = text(s, Offset(x, box.center.dy + 12), size: 22, color: on ? Colors.white : col, weight: FontWeight.w700, align: -1, bg: on ? col : null);
      x += sz.width + 14;
    }
    text(tr('light, chlorophyll|प्रकाश, क्लोरोफिल|ಬೆಳಕು, ಪತ್ರಹರಿತ್ತು'), Offset(box.left + 200, box.top + 22), size: 14, color: AC.leafDark);
  }
}
