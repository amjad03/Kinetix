import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../draw.dart';
import '../model.dart';

// Cellular respiration, the heart and double circulation, breathing, and digestion.

final respiration = KxAnimation(
  id: 'cellular-respiration',
  title: const Tr('Cellular respiration', 'कोशिकीय श्वसन', 'ಜೀವಕೋಶೀಯ ಉಸಿರಾಟ'),
  subject: 'Biology',
  topic: 'Life processes',
  levels: const ['Class 10', 'Class 11'],
  keywords: const ['respiration', 'mitochondria', 'glycolysis', 'krebs', 'atp', 'energy', 'glucose', 'pyruvate', 'electron transport', 'aerobic'],
  seconds: 20,
  thumbT: 0.66,
  steps: const [
    AnimStep(0, Tr('Glucose enters', 'ग्लूकोज़ का प्रवेश', 'ಗ್ಲೂಕೋಸ್ ಪ್ರವೇಶ'),
        Tr('Glucose from digested food enters the cell and stays in the cytoplasm.', 'पचे हुए भोजन से ग्लूकोज़ कोशिका में आता है और कोशिकाद्रव्य में रहता है।', 'ಜೀರ್ಣವಾದ ಆಹಾರದ ಗ್ಲೂಕೋಸ್ ಜೀವಕೋಶವನ್ನು ಪ್ರವೇಶಿಸಿ ಕೋಶದ್ರವ್ಯದಲ್ಲಿ ಇರುತ್ತದೆ.')),
    AnimStep(0.2, Tr('Glycolysis', 'ग्लाइकोलाइसिस', 'ಗ್ಲೈಕಾಲಿಸಿಸ್'),
        Tr('In the cytoplasm, one glucose (6 carbons) breaks into two pyruvate (3 carbons) and a little ATP.', 'कोशिकाद्रव्य में एक ग्लूकोज़ (6 कार्बन) टूटकर दो पाइरुवेट (3 कार्बन) और थोड़ा ATP बनाता है।', 'ಕೋಶದ್ರವ್ಯದಲ್ಲಿ ಒಂದು ಗ್ಲೂಕೋಸ್ (6 ಇಂಗಾಲ) ಎರಡು ಪೈರುವೇಟ್ (3 ಇಂಗಾಲ) ಆಗಿ ಒಡೆದು ಸ್ವಲ್ಪ ATP ಕೊಡುತ್ತದೆ.')),
    AnimStep(0.4, Tr('Krebs cycle', 'क्रेब्स चक्र', 'ಕ್ರೆಬ್ಸ್ ಚಕ್ರ'),
        Tr('With oxygen, pyruvate enters the mitochondrion. In the matrix the Krebs cycle releases carbon dioxide.', 'ऑक्सीजन होने पर पाइरुवेट माइटोकॉन्ड्रिया में जाता है। मैट्रिक्स में क्रेब्स चक्र कार्बन डाइऑक्साइड छोड़ता है।', 'ಆಮ್ಲಜನಕ ಇದ್ದಾಗ ಪೈರುವೇಟ್ ಮೈಟೊಕಾಂಡ್ರಿಯಾವನ್ನು ಸೇರುತ್ತದೆ. ಮ್ಯಾಟ್ರಿಕ್ಸ್‌ನಲ್ಲಿ ಕ್ರೆಬ್ಸ್ ಚಕ್ರ ಇಂಗಾಲದ ಡೈಆಕ್ಸೈಡ್ ಬಿಡುತ್ತದೆ.')),
    AnimStep(0.6, Tr('Electron transport', 'इलेक्ट्रॉन परिवहन', 'ಇಲೆಕ್ಟ್ರಾನ್ ಸಾಗಣೆ'),
        Tr('On the folded inner membrane (cristae), electrons pass along a chain. Oxygen takes them and forms water; most ATP is made here.', 'मुड़ी हुई भीतरी झिल्ली (क्रिस्टी) पर इलेक्ट्रॉन एक शृंखला में चलते हैं। ऑक्सीजन उन्हें लेकर जल बनाती है; अधिकतर ATP यहीं बनता है।', 'ಮಡಿಚಿದ ಒಳಪೊರೆಯ (ಕ್ರಿಸ್ಟೇ) ಮೇಲೆ ಇಲೆಕ್ಟ್ರಾನ್‌ಗಳು ಸರಪಳಿಯಲ್ಲಿ ಸಾಗುತ್ತವೆ. ಆಮ್ಲಜನಕ ಅವನ್ನು ಪಡೆದು ನೀರಾಗುತ್ತದೆ; ಹೆಚ್ಚಿನ ATP ಇಲ್ಲೇ ಉಂಟಾಗುತ್ತದೆ.')),
    AnimStep(0.8, Tr('Energy released', 'ऊर्जा मुक्त', 'ಶಕ್ತಿ ಬಿಡುಗಡೆ'),
        Tr('Overall: glucose + oxygen → carbon dioxide + water + energy stored in ATP for the cell to use.', 'कुल मिलाकर: ग्लूकोज़ + ऑक्सीजन → कार्बन डाइऑक्साइड + जल + ATP में संचित ऊर्जा, जिसे कोशिका उपयोग करती है।', 'ಒಟ್ಟಾರೆ: ಗ್ಲೂಕೋಸ್ + ಆಮ್ಲಜನಕ → ಇಂಗಾಲದ ಡೈಆಕ್ಸೈಡ್ + ನೀರು + ಜೀವಕೋಶ ಬಳಸುವ ATP ಯಲ್ಲಿನ ಶಕ್ತಿ.')),
  ],
  painter: _Respiration.new,
);

class _Respiration extends AnimPainter {
  _Respiration(super.f);

  static const mito = Offset(650, 270);

  Path _inner() {
    final p = Path();
    for (var i = 0; i <= 240; i++) {
      final a = i / 240 * tau;
      final fold = math.pow(math.max(0, math.sin(a * 9)), 4).toDouble();
      final rx = 230 * (1 - 0.32 * fold), ry = 112 * (1 - 0.55 * fold);
      final o = mito + Offset(math.cos(a) * rx, math.sin(a) * ry);
      i == 0 ? p.moveTo(o.dx, o.dy) : p.lineTo(o.dx, o.dy);
    }
    return p..close();
  }

  @override
  void draw() {
    rect(const Rect.fromLTWH(16, 40, 968, 440), AC.cell, line: AC.membrane, w: 5, radius: 46);
    // Mitochondrion.
    oval(Rect.fromCenter(center: mito, width: 520, height: 280), const Color(0xFFFBD3C0), line: const Color(0xFFB4532A), w: 4);
    fillPath(_inner(), const Color(0xFFFFE9DC), line: const Color(0xFFD9774B), w: 3);

    // Glucose arrives, then splits.
    final inK = ease(seg(t, 0, 0.15));
    final split = ease(seg(t, 0.22, 0.36));
    final glu = lerpO(const Offset(-40, 260), const Offset(130, 260), inK);
    if (split < 1) chip('C₆H₁₂O₆', glu, AC.glucose, size: 17, opacity: 1 - split);
    if (t >= 0.22) {
      for (var i = 0; i < 2; i++) {
        final dest = Offset(270, 215 + i * 90.0);
        final into = ease(seg(t, 0.4, 0.5));
        final p = lerpO(lerpO(glu, dest, split), mito + Offset(-60, -20 + i * 40.0), into);
        if (into < 1) chip(tr('Pyruvate|पाइरुवेट|ಪೈರುವೇಟ್'), p, AC.purple, size: 14);
      }
      final pop = seg(t, 0.28, 0.34);
      chip('2 ATP', const Offset(190, 380) + Offset(0, -20 * pop), AC.energy, size: 14, opacity: pop);
      if (split > 0 && split < 1) arrow(const Offset(165, 260), const Offset(230, 260), AC.muted, w: 3);
    }

    // Krebs cycle in the matrix.
    const krebs = Offset(560, 270);
    final on = t >= 0.4;
    for (var i = 0; i < 3; i++) {
      final a0 = (on ? t * 28 : 0) + i * tau / 3;
      arrowPath(Path()..addArc(Rect.fromCircle(center: krebs, radius: 48), a0, tau / 3 - 0.4), on ? const Color(0xFFB4532A) : AC.grey, w: 4, head: 11);
    }
    if (on) {
      for (var i = 0; i < 2; i++) {
        final k = fr(t * 4 + i / 2);
        chip('CO₂', lerpO(krebs + Offset(-10 + i * 30.0, -40), Offset(520 + i * 70.0, 10), k), AC.co2, size: 14, opacity: 1 - seg(k, 0.8, 1));
      }
      chip('NADH', krebs + Offset(80 * seg(fr(t * 4), 0, 1), 60), AC.purple, size: 12, opacity: 1 - seg(fr(t * 4), 0.8, 1));
    }

    // Electron transport chain on the cristae.
    final etc = t >= 0.6;
    final chain = [const Offset(700, 175), const Offset(760, 190), const Offset(815, 215), const Offset(850, 260), const Offset(835, 315)];
    for (final p in chain) {
      rect(Rect.fromCenter(center: p, width: 26, height: 34), etc ? AC.purple : AC.grey, radius: 8);
    }
    if (etc) {
      for (var i = 0; i < 3; i++) {
        final k = fr(t * 6 + i / 3) * (chain.length - 1);
        final j = k.floor();
        final p = lerpO(chain[j], chain[math.min(j + 1, chain.length - 1)], k - j);
        circle(p + const Offset(0, -24), 9, AC.electron, line: Colors.white);
        text('e⁻', p + const Offset(0, -24), size: 11, color: Colors.white, weight: FontWeight.w700);
      }
      final k = fr(t * 4);
      chip('O₂', lerpO(const Offset(960, 90), const Offset(850, 310), k), AC.o2, size: 14, opacity: 1 - seg(k, 0.85, 1));
      chip('H₂O', lerpO(const Offset(820, 340), const Offset(940, 440), k), AC.water, size: 14, opacity: seg(k, 0, 0.1));
      for (var i = 0; i < 5; i++) {
        final kk = fr(t * 3 + i / 5);
        chip('ATP', Offset(660 + i * 34.0, 380 - 60 * kk), AC.energy, size: 12, opacity: 1 - kk);
      }
    }

    // The equation.
    final sum = t >= 0.8;
    rect(const Rect.fromLTWH(120, 500, 760, 80), Colors.white, line: sum ? AC.accent : AC.line, w: sum ? 3 : 2, radius: 14);
    var x = 150.0;
    for (final (s, col) in <(String, Color)>[('C₆H₁₂O₆', AC.glucose), ('+', AC.ink), ('6O₂', AC.o2), ('→', AC.ink), ('6CO₂', AC.co2), ('+', AC.ink), ('6H₂O', AC.water), ('+', AC.ink), ('ATP', AC.energy)]) {
      x += text(s, Offset(x, 540), size: 24, color: col, weight: FontWeight.w700, align: -1).width + 16;
    }
    text(tr('energy|ऊर्जा|ಶಕ್ತಿ'), Offset(x + 30, 540), size: 18, color: AC.energy, weight: FontWeight.w700);

    label('Cytoplasm|कोशिकाद्रव्य|ಕೋಶದ್ರವ್ಯ', const Offset(130, 150));
    label('Cell membrane|कोशिका झिल्ली|ಜೀವಕೋಶ ಪೊರೆ', const Offset(160, 70), to: const Offset(250, 42));
    label('Mitochondrion|माइटोकॉन्ड्रिया|ಮೈಟೊಕಾಂಡ್ರಿಯಾ', const Offset(650, 105), to: const Offset(650, 132));
    label('Matrix|मैट्रिक्स|ಮ್ಯಾಟ್ರಿಕ್ಸ್', const Offset(470, 330), to: const Offset(540, 310), size: 15);
    label('Cristae|क्रिस्टी|ಕ್ರಿಸ್ಟೇ', const Offset(900, 380), to: const Offset(860, 340), size: 15);
    label('Krebs cycle|क्रेब्स चक्र|ಕ್ರೆಬ್ಸ್ ಚಕ್ರ', krebs, size: 13, opacity: on ? 1 : 0.6);
    label('Glycolysis|ग्लाइकोलाइसिस|ಗ್ಲೈಕಾಲಿಸಿಸ್', const Offset(200, 320), size: 15, opacity: seg(t, 0.2, 0.25));
  }
}

final heart = KxAnimation(
  id: 'heart-circulation',
  title: const Tr('Heart and double circulation', 'हृदय और दोहरा परिसंचरण', 'ಹೃದಯ ಮತ್ತು ದ್ವಿ ಪರಿಚಲನೆ'),
  subject: 'Biology',
  topic: 'Life processes',
  levels: const ['Class 10', 'Class 11'],
  keywords: const ['heart', 'blood', 'circulation', 'double circulation', 'atrium', 'ventricle', 'aorta', 'pulmonary', 'vena cava', 'transportation', 'arteries', 'veins'],
  seconds: 20,
  thumbT: 0.5,
  steps: const [
    AnimStep(0, Tr('Right atrium', 'दायाँ आलिंद', 'ಬಲ ಹೃತ್ಕರ್ಣ'),
        Tr('Deoxygenated blood from the body returns through the vena cava into the right atrium.', 'शरीर से ऑक्सीजन रहित रक्त महाशिरा द्वारा दाएँ आलिंद में लौटता है।', 'ದೇಹದಿಂದ ಆಮ್ಲಜನಕರಹಿತ ರಕ್ತ ಮಹಾಸಿರೆಯ ಮೂಲಕ ಬಲ ಹೃತ್ಕರ್ಣಕ್ಕೆ ಮರಳುತ್ತದೆ.')),
    AnimStep(0.2, Tr('To the lungs', 'फेफड़ों की ओर', 'ಶ್ವಾಸಕೋಶಗಳತ್ತ'),
        Tr('The right ventricle contracts and pumps it through the pulmonary artery to the lungs.', 'दायाँ निलय सिकुड़कर इसे फुफ्फुसीय धमनी द्वारा फेफड़ों में भेजता है।', 'ಬಲ ಹೃತ್ಕುಕ್ಷಿ ಸಂಕುಚಿಸಿ ಅದನ್ನು ಶ್ವಾಸಕೋಶದ ಅಪಧಮನಿಯ ಮೂಲಕ ಶ್ವಾಸಕೋಶಗಳಿಗೆ ತಳ್ಳುತ್ತದೆ.')),
    AnimStep(0.4, Tr('Gas exchange', 'गैसों का विनिमय', 'ಅನಿಲ ವಿನಿಮಯ'),
        Tr('In the lung capillaries the blood gives up carbon dioxide and picks up oxygen.', 'फेफड़ों की केशिकाओं में रक्त कार्बन डाइऑक्साइड छोड़ता है और ऑक्सीजन लेता है।', 'ಶ್ವಾಸಕೋಶದ ಲೋಮನಾಳಗಳಲ್ಲಿ ರಕ್ತ ಇಂಗಾಲದ ಡೈಆಕ್ಸೈಡ್ ಬಿಟ್ಟು ಆಮ್ಲಜನಕ ಪಡೆಯುತ್ತದೆ.')),
    AnimStep(0.6, Tr('Left side', 'बायाँ भाग', 'ಎಡ ಭಾಗ'),
        Tr('Oxygenated blood returns by the pulmonary veins to the left atrium, then into the left ventricle.', 'ऑक्सीजन युक्त रक्त फुफ्फुसीय शिराओं से बाएँ आलिंद में, फिर बाएँ निलय में आता है।', 'ಆಮ್ಲಜನಕಯುಕ್ತ ರಕ್ತ ಶ್ವಾಸಕೋಶದ ಸಿರೆಗಳ ಮೂಲಕ ಎಡ ಹೃತ್ಕರ್ಣಕ್ಕೆ, ನಂತರ ಎಡ ಹೃತ್ಕುಕ್ಷಿಗೆ ಬರುತ್ತದೆ.')),
    AnimStep(0.8, Tr('To the body', 'शरीर की ओर', 'ದೇಹದತ್ತ'),
        Tr('The thick left ventricle pumps it through the aorta to the body. Blood passes the heart twice in one round: double circulation.', 'मोटी दीवार वाला बायाँ निलय इसे महाधमनी से शरीर में भेजता है। एक चक्कर में रक्त हृदय से दो बार गुज़रता है: दोहरा परिसंचरण।', 'ದಪ್ಪ ಗೋಡೆಯ ಎಡ ಹೃತ್ಕುಕ್ಷಿ ಅದನ್ನು ಮಹಾಪಧಮನಿಯ ಮೂಲಕ ದೇಹಕ್ಕೆ ತಳ್ಳುತ್ತದೆ. ಒಂದು ಸುತ್ತಿನಲ್ಲಿ ರಕ್ತ ಹೃದಯವನ್ನು ಎರಡು ಬಾರಿ ಹಾದುಹೋಗುತ್ತದೆ: ದ್ವಿ ಪರಿಚಲನೆ.')),
  ],
  painter: _Heart.new,
);

class _Heart extends AnimPainter {
  _Heart(super.f);

  static const deoxy = Color(0xFF3F5BD0), oxy = Color(0xFFD93025);

  // Vena cava (body → RA → RV), pulmonary artery (RV → lungs), pulmonary vein (lungs → LA → LV),
  // aorta (LV → body).
  static final List<Path> vessels = [
    Path()..moveTo(500, 545)..lineTo(250, 545)..lineTo(250, 200)..lineTo(330, 200)..quadraticBezierTo(440, 200, 445, 270)..lineTo(445, 370),
    Path()..moveTo(445, 370)..quadraticBezierTo(380, 330, 375, 250)..lineTo(375, 85)..lineTo(500, 85),
    Path()..moveTo(500, 85)..lineTo(625, 85)..lineTo(625, 200)..quadraticBezierTo(560, 210, 557, 270)..lineTo(557, 375),
    Path()..moveTo(557, 375)..quadraticBezierTo(620, 330, 690, 230)..lineTo(750, 230)..lineTo(750, 545)..lineTo(500, 545),
  ];

  @override
  void draw() {
    final step = t < 0.2 ? 0 : t < 0.4 ? 1 : t < 0.6 ? 2 : t < 0.8 ? 3 : 4;
    final beat = fr(t * 14);
    final atria = 1 - 0.07 * tri(seg(beat, 0, 0.3));
    final vent = 1 - 0.09 * tri(seg(beat, 0.3, 0.65));

    // Lungs and body capillary beds.
    rect(const Rect.fromLTWH(330, 30, 340, 110), const Color(0xFFFDE7EC), line: step == 2 ? AC.accent : AC.line, w: step == 2 ? 4 : 2, radius: 24);
    rect(const Rect.fromLTWH(220, 500, 560, 90), const Color(0xFFFFF3E0), line: step == 0 || step == 4 ? AC.accent : AC.line, w: step == 0 || step == 4 ? 4 : 2, radius: 24);
    for (final y in [85.0, 545.0]) {
      final p = Path()..moveTo(y < 100 ? 380 : 270, y);
      for (var x = 0; x < 16; x++) {
        p.relativeQuadraticBezierTo(y < 100 ? 7 : 12, x.isEven ? -22 : 22, y < 100 ? 15 : 28, 0);
      }
      path(p, AC.muted.withValues(alpha: 0.4), 2);
    }

    // Vessels.
    final active = switch (step) { 0 => 0, 1 => 1, 2 => 1, 3 => 2, _ => 3 };
    for (var i = 0; i < 4; i++) {
      final col = i < 2 ? deoxy : oxy;
      if (i == active) path(vessels[i], AC.sun.withValues(alpha: 0.45), 28);
      path(vessels[i], col.withValues(alpha: 0.25), 20);
      path(vessels[i], col, 3);
    }

    // The heart: four chambers, the septum between the two sides.
    final heart = Path()
      ..moveTo(500, 215)
      ..cubicTo(420, 180, 360, 250, 380, 330)
      ..cubicTo(395, 400, 470, 440, 505, 470)
      ..cubicTo(545, 440, 625, 400, 628, 320)
      ..cubicTo(632, 245, 575, 185, 500, 215)
      ..close();
    fillPath(heart, const Color(0xFFF8D7D3), line: const Color(0xFF8E2B22), w: 3);
    void chamber(Rect r, double s, Color col, bool hi) {
      final rr = Rect.fromCenter(center: r.center, width: r.width * s, height: r.height * s);
      rect(rr, col, line: hi ? AC.ink : const Color(0xFF8E2B22), w: hi ? 3 : 1.5, radius: 22);
    }

    chamber(const Rect.fromLTWH(405, 228, 82, 70), atria, const Color(0xFFB9C3F0), step == 0);
    chamber(const Rect.fromLTWH(400, 308, 90, 120), vent, const Color(0xFF9FAEEB), step == 1);
    chamber(const Rect.fromLTWH(515, 228, 82, 70), atria, const Color(0xFFF4B4AE), step == 3);
    chamber(const Rect.fromLTWH(512, 308, 100, 125), vent, const Color(0xFFEE8D84), step == 3 || step == 4);
    line(const Offset(500, 225), const Offset(503, 450), const Color(0xFF8E2B22), 6);
    // Valves.
    for (final x in [445.0, 557.0]) {
      final open = beat < 0.3 ? 1.0 : 0.0;
      line(Offset(x - 22, 303), Offset(x - 6, 303 + 8 * open), Colors.white, 4);
      line(Offset(x + 22, 303), Offset(x + 6, 303 + 8 * open), Colors.white, 4);
    }

    // Blood cells going round.
    const n = 36;
    for (var i = 0; i < n; i++) {
      final u = fr(t * 3 + i / n) * 4;
      final v = u.floor();
      final k = u - v;
      final col = v < 2 ? deoxy : oxy;
      circle(along(vessels[v], k), 6.5, col, line: Colors.white, w: 1.5);
    }
    if (step == 2) {
      for (var i = 0; i < 3; i++) {
        final k = fr(t * 5 + i / 3);
        chip('O₂', Offset(420 + i * 60.0, 30 + 40 * k), AC.o2, size: 12, opacity: 1 - k);
        chip('CO₂', Offset(450 + i * 60.0, 80 - 40 * k), AC.co2, size: 12, opacity: 1 - k);
      }
    }

    label('Lungs|फेफड़े|ಶ್ವಾಸಕೋಶಗಳು', const Offset(745, 60), to: const Offset(670, 70));
    label('Body|शरीर|ದೇಹ', const Offset(860, 560), to: const Offset(780, 560));
    label('Right atrium|दायाँ आलिंद|ಬಲ ಹೃತ್ಕರ್ಣ', const Offset(150, 300), to: const Offset(420, 262));
    label('Right ventricle|दायाँ निलय|ಬಲ ಹೃತ್ಕುಕ್ಷಿ', const Offset(150, 400), to: const Offset(415, 380));
    label('Left atrium|बायाँ आलिंद|ಎಡ ಹೃತ್ಕರ್ಣ', const Offset(880, 300), to: const Offset(590, 262));
    label('Left ventricle|बायाँ निलय|ಎಡ ಹೃತ್ಕುಕ್ಷಿ', const Offset(880, 400), to: const Offset(600, 390));
    label('Vena cava|महाशिरा|ಮಹಾಸಿರೆ', const Offset(150, 200), to: const Offset(250, 230), size: 15);
    label('Aorta|महाधमनी|ಮಹಾಪಧಮನಿ', const Offset(860, 230), to: const Offset(750, 260), size: 15);
    label('Pulmonary artery|फुफ्फुसीय धमनी|ಶ್ವಾಸಕೋಶದ ಅಪಧಮನಿ', const Offset(200, 120), to: const Offset(375, 150), size: 15);
    label('Pulmonary vein|फुफ्फुसीय शिरा|ಶ್ವಾಸಕೋಶದ ಸಿರೆ', const Offset(820, 150), to: const Offset(625, 150), size: 15);
  }
}

final breathing = KxAnimation(
  id: 'breathing',
  title: const Tr('Breathing mechanism', 'श्वासोच्छ्वास की क्रियाविधि', 'ಉಸಿರಾಟದ ಕ್ರಿಯಾವಿಧಾನ'),
  subject: 'Biology',
  topic: 'Life processes',
  levels: const ['Class 7', 'Class 10', 'Class 11'],
  keywords: const ['breathing', 'inhalation', 'exhalation', 'diaphragm', 'ribs', 'lungs', 'alveoli', 'respiration', 'trachea', 'gas exchange'],
  seconds: 16,
  thumbT: 0.3,
  steps: const [
    AnimStep(0, Tr('Diaphragm contracts', 'डायाफ्राम सिकुड़ता है', 'ವಪೆ ಸಂಕುಚಿಸುತ್ತದೆ'),
        Tr('To breathe in, the dome-shaped diaphragm contracts and flattens, and the rib muscles lift the ribs up and out.', 'साँस लेने के लिए गुंबद जैसा डायाफ्राम सिकुड़कर चपटा होता है और पसलियों की मांसपेशियाँ पसलियों को ऊपर-बाहर उठाती हैं।', 'ಉಸಿರು ಒಳಗೆಳೆಯಲು ಗುಮ್ಮಟಾಕಾರದ ವಪೆ ಸಂಕುಚಿಸಿ ಚಪ್ಪಟೆಯಾಗುತ್ತದೆ; ಪಕ್ಕೆಲುಬಿನ ಸ್ನಾಯುಗಳು ಪಕ್ಕೆಲುಬುಗಳನ್ನು ಮೇಲೆ ಮತ್ತು ಹೊರಗೆ ಎತ್ತುತ್ತವೆ.')),
    AnimStep(0.22, Tr('Air rushes in', 'हवा अंदर आती है', 'ಗಾಳಿ ಒಳನುಗ್ಗುತ್ತದೆ'),
        Tr('The chest gets bigger, so pressure in the lungs falls and air rushes in through the nose and trachea.', 'छाती का आयतन बढ़ता है, फेफड़ों में दाब घटता है और हवा नाक व श्वासनली से अंदर आती है।', 'ಎದೆಯ ಗಾತ್ರ ಹೆಚ್ಚುತ್ತದೆ, ಶ್ವಾಸಕೋಶದ ಒತ್ತಡ ಕುಸಿಯುತ್ತದೆ ಮತ್ತು ಗಾಳಿ ಮೂಗು ಹಾಗೂ ಶ್ವಾಸನಾಳದ ಮೂಲಕ ಒಳಗೆ ಬರುತ್ತದೆ.')),
    AnimStep(0.45, Tr('Diaphragm relaxes', 'डायाफ्राम शिथिल होता है', 'ವಪೆ ಸಡಿಲಗೊಳ್ಳುತ್ತದೆ'),
        Tr('To breathe out, the diaphragm relaxes back into a dome and the ribs move down and in.', 'साँस छोड़ने के लिए डायाफ्राम फिर गुंबद बनता है और पसलियाँ नीचे-अंदर आती हैं।', 'ಉಸಿರು ಬಿಡಲು ವಪೆ ಸಡಿಲಗೊಂಡು ಮತ್ತೆ ಗುಮ್ಮಟವಾಗುತ್ತದೆ; ಪಕ್ಕೆಲುಬುಗಳು ಕೆಳಗೆ ಮತ್ತು ಒಳಗೆ ಸರಿಯುತ್ತವೆ.')),
    AnimStep(0.64, Tr('Air pushed out', 'हवा बाहर निकलती है', 'ಗಾಳಿ ಹೊರಹೋಗುತ್ತದೆ'),
        Tr('The chest gets smaller, pressure rises and air carrying carbon dioxide is pushed out.', 'छाती छोटी होती है, दाब बढ़ता है और कार्बन डाइऑक्साइड वाली हवा बाहर निकलती है।', 'ಎದೆ ಕಿರಿದಾಗುತ್ತದೆ, ಒತ್ತಡ ಹೆಚ್ಚುತ್ತದೆ ಮತ್ತು ಇಂಗಾಲದ ಡೈಆಕ್ಸೈಡ್ ಹೊತ್ತ ಗಾಳಿ ಹೊರತಳ್ಳಲ್ಪಡುತ್ತದೆ.')),
    AnimStep(0.82, Tr('Gas exchange', 'गैसों का विनिमय', 'ಅನಿಲ ವಿನಿಮಯ'),
        Tr('In the alveoli, oxygen diffuses into the blood in the capillaries and carbon dioxide diffuses out.', 'वायुकोशों (एल्वियोलाई) में ऑक्सीजन केशिकाओं के रक्त में जाती है और कार्बन डाइऑक्साइड बाहर आती है।', 'ವಾಯುಕೋಶಗಳಲ್ಲಿ (ಆಲ್ವಿಯೋಲೈ) ಆಮ್ಲಜನಕ ಲೋಮನಾಳಗಳ ರಕ್ತಕ್ಕೆ ವಿಸರಣಗೊಳ್ಳುತ್ತದೆ, ಇಂಗಾಲದ ಡೈಆಕ್ಸೈಡ್ ಹೊರಬರುತ್ತದೆ.')),
  ],
  painter: _Breathing.new,
);

class _Breathing extends AnimPainter {
  _Breathing(super.f);

  double get e => t < 0.45 ? ease(seg(t, 0, 0.4)) : (t < 0.82 ? 1 - ease(seg(t, 0.45, 0.78)) : 0);

  @override
  void draw() {
    const cx = 320.0;
    final x = e;
    // Chest wall.
    final chest = Path()
      ..moveTo(cx - 60, 120)
      ..cubicTo(cx - 170 - 18 * x, 160, cx - 190 - 22 * x, 330, cx - 175 - 18 * x, 470)
      ..lineTo(cx + 175 + 18 * x, 470)
      ..cubicTo(cx + 190 + 22 * x, 330, cx + 170 + 18 * x, 160, cx + 60, 120)
      ..close();
    fillPath(chest, const Color(0xFFFFF1EA), line: AC.flesh, w: 6);
    line(const Offset(cx, 140), const Offset(cx, 400), const Color(0xFFD9CBB5), 14);
    // Trachea, bronchi and lungs.
    path(Path()..moveTo(cx, 20)..lineTo(cx, 200), const Color(0xFFB0BEC5), 22);
    for (final s in [-1.0, 1.0]) {
      path(Path()..moveTo(cx, 195)..quadraticBezierTo(cx + s * 30, 220, cx + s * 70, 250), const Color(0xFFB0BEC5), 14);
      final lung = Rect.fromCenter(center: Offset(cx + s * (95 + 10 * x), 300 + 8 * x), width: 118 + 26 * x, height: 205 + 40 * x);
      c.drawRRect(RRect.fromRectAndCorners(lung, topLeft: const Radius.circular(70), topRight: const Radius.circular(70), bottomLeft: Radius.circular(s < 0 ? 30 : 60), bottomRight: Radius.circular(s < 0 ? 60 : 30)), fill(const Color(0xFFF7A9B6)));
      c.drawRRect(RRect.fromRectAndCorners(lung, topLeft: const Radius.circular(70), topRight: const Radius.circular(70), bottomLeft: Radius.circular(s < 0 ? 30 : 60), bottomRight: Radius.circular(s < 0 ? 60 : 30)), stroke(const Color(0xFFC2185B), 2.5));
    }
    // Ribs: they swing up as the chest expands.
    for (var i = 0; i < 6; i++) {
      final y = 175.0 + i * 46;
      for (final s in [-1.0, 1.0]) {
        final a = Offset(cx + s * 12, y - 10 * x);
        final b = Offset(cx + s * (150 + 18 * x + i * 4), y + 30 - 22 * x);
        path(Path()..moveTo(a.dx, a.dy)..quadraticBezierTo((a.dx + b.dx) / 2, y - 20 - 12 * x, b.dx, b.dy), const Color(0xCCD9CBB5), 9);
      }
    }
    // Diaphragm: a dome that flattens when it contracts.
    final dy = 330 + 110 * x;
    final dia = Path()
      ..moveTo(cx - 185 - 18 * x, 470)
      ..quadraticBezierTo(cx, dy - 40, cx + 185 + 18 * x, 470);
    path(dia, const Color(0xFFC0504D), 12);

    // Air in or out.
    final inhaling = t < 0.45;
    if (t < 0.82) {
      for (var i = 0; i < 3; i++) {
        final k = fr(t * 6 + i / 3);
        final a = inhaling ? Offset(cx, 0 + 160 * k) : Offset(cx, 160 - 160 * k);
        arrow(a, a + Offset(0, inhaling ? 24 : -24), inhaling ? AC.o2 : AC.co2, w: 4, head: 12, opacity: 1 - seg(k, 0.8, 1));
      }
    }
    // Arrows on the diaphragm and ribs.
    final move = inhaling ? 1.0 : -1.0;
    if (t < 0.82) {
      arrow(Offset(cx, dy - 50), Offset(cx, dy - 50 + 34 * move), AC.ink, w: 4);
      arrow(Offset(cx - 210, 300), Offset(cx - 210 - 26 * move, 300 - 14 * move), AC.ink, w: 3);
      arrow(Offset(cx + 210, 300), Offset(cx + 210 + 26 * move, 300 - 14 * move), AC.ink, w: 3);
    }

    // Alveolus close-up.
    const al = Offset(780, 300);
    final hi = t >= 0.82;
    circle(al, 175, Colors.white, line: hi ? AC.accent : AC.line, w: hi ? 4 : 2);
    circle(al, 95 + 6 * x, const Color(0xFFFCE4EC), line: const Color(0xFFC2185B), w: 3);
    final cap = Path()..addArc(Rect.fromCircle(center: al, radius: 125), -2.6, 4.2);
    path(cap, const Color(0xFFC62828).withValues(alpha: 0.3), 30);
    for (var i = 0; i < 10; i++) {
      final k = fr(t * 2 + i / 10);
      final p = along(cap, k);
      circle(p, 8, Color.lerp(_Heart.deoxy, _Heart.oxy, k)!, line: Colors.white, w: 1.5);
    }
    for (var i = 0; i < 4; i++) {
      final a = -2.2 + i * 1.0;
      final k = fr(t * 3 + i / 4);
      chip('O₂', polar(al, 60 + 70 * k, a), AC.o2, size: 13, opacity: 1 - seg(k, 0.8, 1));
      chip('CO₂', polar(al, 130 - 70 * k, a + 0.45), AC.co2, size: 13, opacity: 1 - seg(k, 0.8, 1));
    }
    label('Alveolus|वायुकोश|ವಾಯುಕೋಶ', al + const Offset(0, -20), size: 16);
    label('Capillary|केशिका|ಲೋಮನಾಳ', const Offset(790, 530), to: polar(al, 125, 1.4));

    label('Trachea|श्वासनली|ಶ್ವಾಸನಾಳ', const Offset(450, 60), to: const Offset(cx + 11, 80));
    label('Lungs|फेफड़े|ಶ್ವಾಸಕೋಶಗಳು', const Offset(90, 200), to: Offset(cx - 130, 260));
    label('Ribs|पसलियाँ|ಪಕ್ಕೆಲುಬುಗಳು', const Offset(560, 160), to: Offset(cx + 150, 210 - 20 * x));
    label('Diaphragm|डायाफ्राम|ವಪೆ', const Offset(560, 500), to: Offset(cx + 100, (470 + dy - 40) / 2 + 10));
    label(inhaling ? 'Breathing in|साँस लेना|ಉಸಿರು ಒಳಗೆ' : 'Breathing out|साँस छोड़ना|ಉಸಿರು ಹೊರಗೆ', const Offset(90, 40), size: 20, opacity: t < 0.82 ? 1 : 0);
  }
}

final digestion = KxAnimation(
  id: 'digestion',
  title: const Tr('Digestion in humans', 'मनुष्य में पाचन', 'ಮಾನವನಲ್ಲಿ ಜೀರ್ಣಕ್ರಿಯೆ'),
  subject: 'Biology',
  topic: 'Life processes',
  levels: const ['Class 7', 'Class 10', 'Class 11'],
  keywords: const ['digestion', 'alimentary canal', 'stomach', 'intestine', 'enzymes', 'saliva', 'villi', 'absorption', 'liver', 'nutrition', 'peristalsis'],
  seconds: 24,
  thumbT: 0.6,
  steps: const [
    AnimStep(0, Tr('Mouth', 'मुख', 'ಬಾಯಿ'),
        Tr('Teeth chew the food. Saliva’s enzyme amylase starts breaking starch into sugar.', 'दाँत भोजन चबाते हैं। लार का एंजाइम एमाइलेज़ स्टार्च को शर्करा में तोड़ना शुरू करता है।', 'ಹಲ್ಲುಗಳು ಆಹಾರವನ್ನು ಅಗಿಯುತ್ತವೆ. ಲಾಲಾರಸದ ಕಿಣ್ವ ಅಮೈಲೇಸ್ ಪಿಷ್ಟವನ್ನು ಸಕ್ಕರೆಯಾಗಿ ಒಡೆಯಲು ಆರಂಭಿಸುತ್ತದೆ.')),
    AnimStep(0.15, Tr('Oesophagus', 'ग्रासनली', 'ಅನ್ನನಾಳ'),
        Tr('Waves of muscle contraction (peristalsis) push the food down the oesophagus.', 'मांसपेशियों के संकुचन की लहरें (क्रमाकुंचन) भोजन को ग्रासनली में नीचे धकेलती हैं।', 'ಸ್ನಾಯು ಸಂಕೋಚನದ ಅಲೆಗಳು (ಪೆರಿಸ್ಟಾಲ್ಸಿಸ್) ಆಹಾರವನ್ನು ಅನ್ನನಾಳದಲ್ಲಿ ಕೆಳಗೆ ತಳ್ಳುತ್ತವೆ.')),
    AnimStep(0.3, Tr('Stomach', 'आमाशय', 'ಜಠರ'),
        Tr('The stomach churns food with hydrochloric acid and pepsin, which begins to digest proteins.', 'आमाशय भोजन को हाइड्रोक्लोरिक अम्ल और पेप्सिन के साथ मथता है; पेप्सिन प्रोटीन का पाचन शुरू करता है।', 'ಜಠರ ಆಹಾರವನ್ನು ಹೈಡ್ರೋಕ್ಲೋರಿಕ್ ಆಮ್ಲ ಮತ್ತು ಪೆಪ್ಸಿನ್ ಜೊತೆ ಕಲಕುತ್ತದೆ; ಪೆಪ್ಸಿನ್ ಪ್ರೋಟೀನ್ ಜೀರ್ಣ ಆರಂಭಿಸುತ್ತದೆ.')),
    AnimStep(0.48, Tr('Small intestine', 'छोटी आँत', 'ಸಣ್ಣ ಕರುಳು'),
        Tr('Bile from the liver and pancreatic juice finish digestion. Villi absorb the nutrients into the blood.', 'यकृत का पित्त और अग्न्याशयी रस पाचन पूरा करते हैं। रसांकुर (विलाई) पोषक तत्वों को रक्त में सोखते हैं।', 'ಯಕೃತ್ತಿನ ಪಿತ್ತರಸ ಮತ್ತು ಮೇದೋಜೀರಕ ರಸ ಜೀರ್ಣವನ್ನು ಮುಗಿಸುತ್ತವೆ. ವಿಲ್ಲೈಗಳು ಪೋಷಕಾಂಶಗಳನ್ನು ರಕ್ತಕ್ಕೆ ಹೀರುತ್ತವೆ.')),
    AnimStep(0.72, Tr('Large intestine', 'बड़ी आँत', 'ದೊಡ್ಡ ಕರುಳು'),
        Tr('The large intestine absorbs water from the undigested food.', 'बड़ी आँत बिना पचे भोजन से जल सोख लेती है।', 'ದೊಡ್ಡ ಕರುಳು ಜೀರ್ಣವಾಗದ ಆಹಾರದಿಂದ ನೀರನ್ನು ಹೀರುತ್ತದೆ.')),
    AnimStep(0.88, Tr('Egestion', 'मल त्याग', 'ಮಲವಿಸರ್ಜನೆ'),
        Tr('The waste is stored in the rectum and passed out through the anus.', 'अपशिष्ट मलाशय में जमा होता है और गुदा से बाहर निकलता है।', 'ತ್ಯಾಜ್ಯ ಗುದನಾಳದಲ್ಲಿ ಸಂಗ್ರಹವಾಗಿ ಗುದದ್ವಾರದ ಮೂಲಕ ಹೊರಹೋಗುತ್ತದೆ.')),
  ],
  painter: _Digestion.new,
);

class _Digestion extends AnimPainter {
  _Digestion(super.f);

  static final List<Path> route = [
    Path()..moveTo(300, 92)..lineTo(330, 100)..lineTo(330, 118),
    Path()..moveTo(330, 118)..lineTo(338, 228),
    Path()..moveTo(338, 228)..cubicTo(320, 270, 380, 320, 430, 300)..lineTo(462, 286),
    () {
      final p = Path()..moveTo(462, 286)..lineTo(468, 320)..lineTo(440, 385);
      var y = 385.0;
      for (var i = 0; i < 4; i++) {
        p.lineTo(i.isEven ? 290 : 440, y);
        y += 26;
        p.lineTo(i.isEven ? 290 : 440, y);
      }
      return p..lineTo(270, 480);
    }(),
    Path()..moveTo(270, 480)..lineTo(245, 480)..lineTo(245, 362)..lineTo(475, 362)..lineTo(475, 500)..lineTo(380, 515),
    Path()..moveTo(380, 515)..lineTo(362, 535)..lineTo(362, 598),
  ];

  @override
  void draw() {
    final steps = digestion.steps;
    final step = digestion.stepAt(t);
    // Body.
    circle(const Offset(330, 58), 46, AC.flesh, line: const Color(0xFFD9A58B), w: 3);
    rect(const Rect.fromLTWH(185, 112, 300, 500), const Color(0xFFFBE9DF), line: const Color(0xFFD9A58B), w: 3, radius: 60);
    rect(const Rect.fromLTWH(305, 98, 50, 30), AC.flesh);
    // Liver, gall bladder, pancreas.
    fillPath(Path()..moveTo(200, 210)..quadraticBezierTo(260, 170, 345, 205)..quadraticBezierTo(300, 270, 205, 270)..close(), const Color(0xFF9C4A3C), line: const Color(0xFF6D2E24));
    oval(const Rect.fromLTWH(275, 255, 26, 18), const Color(0xFF66BB6A));
    rect(const Rect.fromLTWH(370, 325, 100, 18), const Color(0xFFF9C784), line: const Color(0xFFC98B2F), radius: 9);
    // The canal.
    for (final p in route) {
      path(p, const Color(0xFFB85B62), 20);
    }
    fillPath(Path()..moveTo(338, 222)..cubicTo(300, 260, 360, 335, 440, 310)..lineTo(470, 292)..cubicTo(470, 260, 420, 250, 395, 240)..cubicTo(380, 220, 350, 210, 338, 222)..close(), const Color(0xFFF2A3A8), line: const Color(0xFFB85B62), w: 3);
    for (var i = 0; i < route.length; i++) {
      path(route[i], i == step ? const Color(0xFFFFD0D3) : const Color(0xFFF2A3A8), 14);
    }
    // Teeth.
    for (var i = 0; i < 5; i++) {
      rect(Rect.fromLTWH(303 + i * 10.0, 80, 8, 8 + 4 * math.sin(t * 90).abs() * (step == 0 ? 1 : 0)), Colors.white, line: AC.grey, w: 1, radius: 2);
    }

    // The food.
    final next = step + 1 < steps.length ? steps[step + 1].at : 1.0;
    final k = ease(seg(t, steps[step].at, next - 0.02));
    final pos = along(route[step], k);
    final squeeze = step == 1 ? math.sin(t * 160) * 2 : 0.0;
    circle(pos, 11 + squeeze - step * 0.6, step >= 4 ? const Color(0xFF8D6E4A) : AC.glucose, line: Colors.white, w: 2);

    // Close-up of what happens here.
    const box = Rect.fromLTWH(615, 40, 365, 450);
    rect(box, Colors.white, line: AC.line, radius: 24);
    text(steps[step].name.of(f.lang), Offset(box.center.dx, box.top + 34), size: 22, weight: FontWeight.w700);
    final m = seg(t, steps[step].at + 0.02, next - 0.03);
    final cx = box.center.dx, cy = box.center.dy + 20;
    switch (step) {
      case 0 || 2:
        // A long molecule cut into small pieces by an enzyme.
        final col = step == 0 ? AC.glucose : AC.purple;
        for (var i = 0; i < 8; i++) {
          final gap = (i - 3.5) * 18 * ease(m);
          final p = Offset(cx - 140 + i * 40 + gap, cy + (i.isEven ? -8 : 8) * ease(m));
          if (i < 7) line(p, Offset(cx - 100 + i * 40 + gap, cy), col.withValues(alpha: 1 - ease(m)), 4);
          step == 0 ? _hex(p, 16, col) : circle(p, 15, col, line: Colors.white);
        }
        final enz = lerpO(Offset(cx - 170, cy + 110), Offset(cx + 150, cy + 110), m);
        rect(Rect.fromCenter(center: enz, width: 70, height: 36), AC.accent, radius: 18);
        text(step == 0 ? tr('Amylase|एमाइलेज़|ಅಮೈಲೇಸ್') : tr('Pepsin|पेप्सिन|ಪೆಪ್ಸಿನ್'), enz, size: 13, color: Colors.white, weight: FontWeight.w700);
        text(step == 0 ? tr('Starch → sugar|स्टार्च → शर्करा|ಪಿಷ್ಟ → ಸಕ್ಕರೆ') : tr('Protein → peptides|प्रोटीन → पेप्टाइड|ಪ್ರೋಟೀನ್ → ಪೆಪ್ಟೈಡ್'), Offset(cx, cy - 90), size: 18, color: AC.muted);
        if (step == 2) {
          for (var i = 0; i < 6; i++) {
            chip('H⁺', Offset(cx - 150 + i * 60.0, box.bottom - 50 - 30 * fr(t * 8 + i / 6)), AC.red, size: 12);
          }
        }
      case 1:
        // Peristalsis: a squeeze running down a tube.
        final y = box.top + 90 + 290 * m;
        for (var i = 0; i < 30; i++) {
          final yy = box.top + 80 + i * 11.0;
          final pinch = math.exp(-math.pow((yy - y + 40) / 26, 2)) * 22;
          line(Offset(cx - 48 + pinch, yy), Offset(cx - 48 + pinch, yy + 11), const Color(0xFFB85B62), 6);
          line(Offset(cx + 48 - pinch, yy), Offset(cx + 48 - pinch, yy + 11), const Color(0xFFB85B62), 6);
        }
        circle(Offset(cx, y), 30, AC.glucose, line: Colors.white, w: 2);
        arrow(Offset(cx + 110, y - 60), Offset(cx + 110, y + 10), AC.ink, w: 3);
      case 3:
        // A villus: nutrients pass into its blood capillary.
        final v = Path()
          ..moveTo(cx - 70, box.bottom - 30)
          ..lineTo(cx - 70, cy - 60)
          ..arcToPoint(Offset(cx + 70, cy - 60), radius: const Radius.circular(70))
          ..lineTo(cx + 70, box.bottom - 30);
        fillPath(v, const Color(0xFFF8BBD0), line: const Color(0xFFB85B62), w: 3);
        path(Path()..moveTo(cx - 35, box.bottom - 30)..lineTo(cx - 35, cy - 50)..arcToPoint(Offset(cx + 35, cy - 50), radius: const Radius.circular(35))..lineTo(cx + 35, box.bottom - 30), AC.red, 5);
        for (var i = 0; i < 8; i++) {
          final kk = fr(t * 4 + i / 8);
          final a = -math.pi + i / 7 * math.pi;
          circle(lerpO(polar(Offset(cx, cy - 60), 150, a), polar(Offset(cx, cy - 60), 45, a), kk), 7, i.isEven ? AC.glucose : AC.purple, line: Colors.white, w: 1);
        }
        label('Villus|रसांकुर|ವಿಲ್ಲಸ್', Offset(cx + 140, box.bottom - 60), to: Offset(cx + 70, box.bottom - 80));
        label('Blood capillary|रक्त केशिका|ರಕ್ತ ಲೋಮನಾಳ', Offset(cx - 120, box.bottom - 40), to: Offset(cx - 35, box.bottom - 70), size: 14);
      default:
        // Water leaves the waste.
        rect(Rect.fromCenter(center: Offset(cx, cy), width: 300, height: 120), const Color(0xFFFFE0B2), line: const Color(0xFFB85B62), w: 3, radius: 60);
        circle(Offset(cx - 60 + 120 * m, cy), 34, const Color(0xFF8D6E4A));
        for (var i = 0; i < 6; i++) {
          final kk = fr(t * 4 + i / 6);
          circle(Offset(cx - 120 + i * 48.0, cy - 50 - 100 * kk), 7, AC.water.withValues(alpha: step == 4 ? 1 - kk : 0));
        }
        text(step == 4 ? tr('Water absorbed|जल अवशोषित|ನೀರು ಹೀರಿಕೆ') : tr('Waste out|अपशिष्ट बाहर|ತ್ಯಾಜ್ಯ ಹೊರಗೆ'), Offset(cx, cy + 110), size: 18, color: AC.muted);
    }

    label('Mouth|मुख|ಬಾಯಿ', const Offset(120, 70), to: const Offset(305, 88));
    label('Oesophagus|ग्रासनली|ಅನ್ನನಾಳ', const Offset(110, 140), to: const Offset(333, 160));
    label('Liver|यकृत|ಯಕೃತ್ತು', const Offset(110, 225), to: const Offset(240, 230));
    label('Stomach|आमाशय|ಜಠರ', const Offset(492, 225), to: const Offset(430, 270), align: -1);
    label('Pancreas|अग्न्याशय|ಮೇದೋಜೀರಕ ಗ್ರಂಥಿ', const Offset(492, 335), to: const Offset(470, 334), align: -1, size: 15);
    label('Small intestine|छोटी आँत|ಸಣ್ಣ ಕರುಳು', const Offset(492, 440), to: const Offset(440, 420), align: -1, size: 15);
    label('Large intestine|बड़ी आँत|ದೊಡ್ಡ ಕರುಳು', const Offset(110, 400), to: const Offset(245, 400), size: 15);
    label('Rectum|मलाशय|ಗುದನಾಳ', const Offset(110, 545), to: const Offset(362, 550), size: 15);
  }

  void _hex(Offset o, double r, Color col) {
    final p = Path();
    for (var i = 0; i < 6; i++) {
      final q = polar(o, r, i * tau / 6);
      i == 0 ? p.moveTo(q.dx, q.dy) : p.lineTo(q.dx, q.dy);
    }
    fillPath(p..close(), col, line: Colors.white);
  }
}
