import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../draw.dart';
import '../model.dart';

// Diffusion and osmosis, the nitrogen cycle and the carbon cycle.

final osmosis = KxAnimation(
  id: 'osmosis-diffusion',
  title: const Tr('Diffusion and osmosis', 'विसरण और परासरण', 'ವಿಸರಣ ಮತ್ತು ಆಸ್ಮೋಸಿಸ್'),
  subject: 'Biology',
  topic: 'The cell',
  levels: const ['Class 8', 'Class 9', 'Class 11'],
  keywords: const ['osmosis', 'diffusion', 'semi-permeable membrane', 'concentration', 'water', 'solution', 'transport', 'cell membrane', 'turgid'],
  seconds: 18,
  thumbT: 0.8,
  steps: const [
    AnimStep(0, Tr('Diffusion', 'विसरण', 'ವಿಸರಣ'),
        Tr('Particles move on their own from where they are crowded (high concentration) to where they are few (low concentration).', 'कण अपने-आप भीड़ वाली जगह (उच्च सांद्रता) से कम कणों वाली जगह (निम्न सांद्रता) की ओर जाते हैं।', 'ಕಣಗಳು ತಾವಾಗಿಯೇ ದಟ್ಟವಾಗಿರುವ ಕಡೆಯಿಂದ (ಹೆಚ್ಚು ಸಾರತೆ) ಕಡಿಮೆ ಇರುವ ಕಡೆಗೆ (ಕಡಿಮೆ ಸಾರತೆ) ಚಲಿಸುತ್ತವೆ.')),
    AnimStep(0.3, Tr('Evenly spread', 'समान रूप से फैले', 'ಸಮವಾಗಿ ಹರಡಿದೆ'),
        Tr('In the end they are spread evenly. They keep moving, but there is no more overall flow.', 'अंत में वे समान रूप से फैल जाते हैं। वे चलते रहते हैं, पर कुल प्रवाह रुक जाता है।', 'ಕೊನೆಗೆ ಅವು ಸಮವಾಗಿ ಹರಡುತ್ತವೆ. ಚಲನೆ ಮುಂದುವರಿದರೂ ಒಟ್ಟು ಹರಿವು ನಿಲ್ಲುತ್ತದೆ.')),
    AnimStep(0.5, Tr('A membrane', 'एक झिल्ली', 'ಒಂದು ಪೊರೆ'),
        Tr('A semi-permeable membrane lets small water molecules through but not the bigger sugar molecules.', 'अर्धपारगम्य झिल्ली पानी के छोटे अणुओं को जाने देती है, पर शक्कर के बड़े अणुओं को नहीं।', 'ಅರೆಪಾರಕ ಪೊರೆ ನೀರಿನ ಸಣ್ಣ ಅಣುಗಳನ್ನು ಬಿಡುತ್ತದೆ, ಸಕ್ಕರೆಯ ದೊಡ್ಡ ಅಣುಗಳನ್ನು ಬಿಡುವುದಿಲ್ಲ.')),
    AnimStep(0.68, Tr('Osmosis', 'परासरण', 'ಆಸ್ಮೋಸಿಸ್'),
        Tr('Water moves through the membrane from the dilute side into the concentrated sugar solution, so its level rises.', 'पानी झिल्ली से होकर तनु ओर से सांद्र शक्कर के घोल में जाता है, इसलिए उसका स्तर बढ़ता है।', 'ನೀರು ಪೊರೆಯ ಮೂಲಕ ದುರ್ಬಲ ದ್ರಾವಣದಿಂದ ಸಾರವಾದ ಸಕ್ಕರೆ ದ್ರಾವಣಕ್ಕೆ ಹೋಗುತ್ತದೆ; ಅದರ ಮಟ್ಟ ಏರುತ್ತದೆ.')),
  ],
  painter: _Osmosis.new,
);

class _Osmosis extends AnimPainter {
  _Osmosis(super.f);

  @override
  void draw() {
    // Diffusion box.
    const box = Rect.fromLTWH(40, 120, 400, 360);
    rect(box, const Color(0xFFF3F8FD), line: AC.ink, w: 3, radius: 12);
    final spread = ease(seg(t, 0.02, 0.32));
    for (var i = 0; i < 46; i++) {
      final start = Offset(box.left + 20 + rnd(i) * 90, box.top + 20 + rnd(i, 1) * 320);
      final end = Offset(box.left + 20 + rnd(i, 2) * 360, box.top + 20 + rnd(i, 3) * 320);
      final j = Offset(math.sin(t * 50 + i * 1.3), math.cos(t * 43 + i * 2.1)) * 6;
      circle(lerpO(start, end, spread) + j, 8, AC.purple, line: Colors.white, w: 1.5);
    }
    if (t < 0.3) arrow(Offset(box.left + 120, box.bottom + 40), Offset(box.left + 300, box.bottom + 40), AC.accent, w: 5);
    label('High concentration|उच्च सांद्रता|ಹೆಚ್ಚು ಸಾರತೆ', Offset(box.left + 100, box.top - 26), opacity: 1 - spread);
    label('Low|निम्न|ಕಡಿಮೆ', Offset(box.right - 60, box.top - 26), opacity: 1 - spread);
    label('Diffusion|विसरण|ವಿಸರಣ', Offset(box.center.dx, 60), size: 22);

    // Osmosis tank.
    const tank = Rect.fromLTWH(540, 120, 420, 370);
    final k = ease(seg(t, 0.7, 0.97));
    final lvL = 260 + 70 * k, lvR = 260 - 70 * k;
    rect(Rect.fromLTRB(tank.left, lvL, tank.center.dx, tank.bottom), AC.waterLight);
    rect(Rect.fromLTRB(tank.center.dx, lvR, tank.right, tank.bottom), const Color(0xFFFFE9C7));
    path(Path()..moveTo(tank.left, tank.top)..lineTo(tank.left, tank.bottom)..lineTo(tank.right, tank.bottom)..lineTo(tank.right, tank.top), AC.ink, 3);
    final mem = seg(t, 0.5, 0.55);
    for (var y = tank.top + 20; y < tank.bottom; y += 18) {
      line(Offset(tank.center.dx, y), Offset(tank.center.dx, y + 10), AC.accent.withValues(alpha: 0.3 + 0.7 * mem), 4);
    }
    // Sugar stays on the right.
    for (var i = 0; i < 10; i++) {
      final p = Offset(tank.center.dx + 40 + rnd(i, 5) * 150, lvR + 30 + rnd(i, 6) * (tank.bottom - lvR - 50)) + Offset(math.sin(t * 20 + i), math.cos(t * 17 + i)) * 4;
      circle(p, 15, AC.glucose, line: Colors.white, w: 2);
    }
    // Water molecules: more cross left to right.
    for (var i = 0; i < 26; i++) {
      final right = i % 4 == 0;
      final y = math.max(lvL, lvR) + 15 + rnd(i, 7) * (tank.bottom - math.max(lvL, lvR) - 30);
      double x;
      if (t >= 0.68) {
        final u = fr(t * 4 + rnd(i, 8));
        x = right ? tank.right - 20 - u * 380 : tank.left + 20 + u * 380;
      } else {
        x = right ? tank.center.dx + 20 + rnd(i, 9) * 180 : tank.left + 20 + rnd(i, 9) * 180;
        x += math.sin(t * 40 + i) * 6;
      }
      circle(Offset(x, y), 6, AC.water);
    }
    if (t >= 0.68) arrow(Offset(tank.center.dx - 70, tank.bottom + 25), Offset(tank.center.dx + 70, tank.bottom + 25), AC.water, w: 5);
    if (k > 0) {
      dashed(Offset(tank.left, 260), Offset(tank.right, 260), AC.muted);
      arrow(Offset(tank.right + 20, 260), Offset(tank.right + 20, lvR), AC.ink, w: 3, head: 10);
    }
    label('Osmosis|परासरण|ಆಸ್ಮೋಸಿಸ್', Offset(tank.center.dx, 60), size: 22);
    label('Water|जल|ನೀರು', Offset(tank.left + 100, tank.top + 20));
    label('Sugar solution|शक्कर का घोल|ಸಕ್ಕರೆ ದ್ರಾವಣ', Offset(tank.right - 100, tank.top + 20));
    label('Semi-permeable membrane|अर्धपारगम्य झिल्ली|ಅರೆಪಾರಕ ಪೊರೆ', Offset(tank.center.dx, tank.bottom + 70), to: Offset(tank.center.dx, tank.bottom - 10), opacity: mem);
  }
}

final nitrogenCycle = KxAnimation(
  id: 'nitrogen-cycle',
  title: const Tr('The nitrogen cycle', 'नाइट्रोजन चक्र', 'ಸಾರಜನಕ ಚಕ್ರ'),
  subject: 'Biology',
  topic: 'Natural resources and cycles',
  levels: const ['Class 8', 'Class 9', 'Class 12'],
  keywords: const ['nitrogen cycle', 'nitrogen fixation', 'rhizobium', 'root nodules', 'nitrification', 'denitrification', 'ammonification', 'biogeochemical cycle', 'ecosystem', 'lightning'],
  seconds: 24,
  thumbT: 0.2,
  steps: const [
    AnimStep(0, Tr('Nitrogen in the air', 'हवा में नाइट्रोजन', 'ಗಾಳಿಯಲ್ಲಿ ಸಾರಜನಕ'),
        Tr('Air is 78% nitrogen gas (N₂), but plants and animals cannot use it directly.', 'हवा में 78% नाइट्रोजन गैस (N₂) है, पर पौधे और जंतु इसे सीधे उपयोग नहीं कर सकते।', 'ಗಾಳಿಯಲ್ಲಿ 78% ಸಾರಜನಕ ಅನಿಲ (N₂) ಇದೆ, ಆದರೆ ಸಸ್ಯ ಮತ್ತು ಪ್ರಾಣಿಗಳು ಅದನ್ನು ನೇರವಾಗಿ ಬಳಸಲಾರವು.')),
    AnimStep(0.16, Tr('Nitrogen fixation', 'नाइट्रोजन स्थिरीकरण', 'ಸಾರಜನಕ ಸ್ಥಿರೀಕರಣ'),
        Tr('Rhizobium bacteria in the root nodules of legumes, and lightning, turn N₂ into compounds plants can use.', 'दलहनी पौधों की जड़ ग्रंथिकाओं में राइज़ोबियम जीवाणु और तड़ित N₂ को पौधों के उपयोगी यौगिकों में बदलते हैं।', 'ದ್ವಿದಳ ಸಸ್ಯಗಳ ಬೇರುಗಂಟುಗಳಲ್ಲಿನ ರೈಜೋಬಿಯಂ ಬ್ಯಾಕ್ಟೀರಿಯಾ ಮತ್ತು ಮಿಂಚು N₂ ಅನ್ನು ಸಸ್ಯಗಳು ಬಳಸಬಲ್ಲ ಸಂಯುಕ್ತಗಳಾಗಿ ಬದಲಿಸುತ್ತವೆ.')),
    AnimStep(0.33, Tr('Nitrification', 'नाइट्रीकरण', 'ನೈಟ್ರೀಕರಣ'),
        Tr('Bacteria in the soil turn ammonia into nitrites and then into nitrates.', 'मिट्टी के जीवाणु अमोनिया को नाइट्राइट और फिर नाइट्रेट में बदलते हैं।', 'ಮಣ್ಣಿನ ಬ್ಯಾಕ್ಟೀರಿಯಾ ಅಮೋನಿಯಾವನ್ನು ನೈಟ್ರೈಟ್ ಮತ್ತು ನಂತರ ನೈಟ್ರೇಟ್ ಆಗಿ ಬದಲಿಸುತ್ತವೆ.')),
    AnimStep(0.5, Tr('Assimilation', 'स्वांगीकरण', 'ಸ್ವಾಂಗೀಕರಣ'),
        Tr('Plants absorb nitrates through their roots to make proteins. Animals get nitrogen by eating plants.', 'पौधे जड़ों से नाइट्रेट सोखकर प्रोटीन बनाते हैं। जंतु पौधे खाकर नाइट्रोजन पाते हैं।', 'ಸಸ್ಯಗಳು ಬೇರುಗಳಿಂದ ನೈಟ್ರೇಟ್ ಹೀರಿ ಪ್ರೋಟೀನ್ ತಯಾರಿಸುತ್ತವೆ. ಪ್ರಾಣಿಗಳು ಸಸ್ಯ ತಿಂದು ಸಾರಜನಕ ಪಡೆಯುತ್ತವೆ.')),
    AnimStep(0.67, Tr('Ammonification', 'अमोनीकरण', 'ಅಮೋನೀಕರಣ'),
        Tr('When plants and animals die or excrete, decomposers turn the nitrogen in them back into ammonia.', 'जब पौधे और जंतु मरते हैं या उत्सर्जन करते हैं, तो अपघटक उनकी नाइट्रोजन को फिर अमोनिया में बदलते हैं।', 'ಸಸ್ಯ ಮತ್ತು ಪ್ರಾಣಿಗಳು ಸತ್ತಾಗ ಅಥವಾ ವಿಸರ್ಜಿಸಿದಾಗ, ವಿಘಟಕಗಳು ಅವುಗಳಲ್ಲಿನ ಸಾರಜನಕವನ್ನು ಮತ್ತೆ ಅಮೋನಿಯಾ ಆಗಿಸುತ್ತವೆ.')),
    AnimStep(0.84, Tr('Denitrification', 'विनाइट्रीकरण', 'ವಿನೈಟ್ರೀಕರಣ'),
        Tr('Denitrifying bacteria turn nitrates back into nitrogen gas, which returns to the air.', 'विनाइट्रीकारी जीवाणु नाइट्रेट को फिर नाइट्रोजन गैस में बदलते हैं, जो हवा में लौट जाती है।', 'ವಿನೈಟ್ರೀಕಾರಕ ಬ್ಯಾಕ್ಟೀರಿಯಾ ನೈಟ್ರೇಟ್ ಅನ್ನು ಮತ್ತೆ ಸಾರಜನಕ ಅನಿಲವಾಗಿಸುತ್ತವೆ; ಅದು ಗಾಳಿಗೆ ಮರಳುತ್ತದೆ.')),
  ],
  painter: _Nitrogen.new,
);

/// Sky, ground and soil for the cycles.
void _land(AnimPainter p, {double ground = 330}) {
  p.c.drawRect(Rect.fromLTWH(0, 0, 1000, ground), Paint()..shader = LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [AC.sky, Colors.white]).createShader(Rect.fromLTWH(0, 0, 1000, ground)));
  p.rect(Rect.fromLTWH(0, ground, 1000, 600 - ground), AC.soilLight);
  p.rect(Rect.fromLTWH(0, ground - 8, 1000, 14), AC.leaf);
}

class _Nitrogen extends AnimPainter {
  _Nitrogen(super.f);

  @override
  void draw() {
    _land(this);
    final step = nitrogenCycle.stepAt(t);
    // Air.
    for (var i = 0; i < 7; i++) {
      final x = 60 + i * 130.0 + 20 * math.sin(t * 8 + i);
      chip('N₂', Offset(x, 40 + 14 * math.cos(t * 6 + i * 2)), step == 0 ? AC.blue : const Color(0xFF7986CB), size: 15);
    }
    cloud(const Offset(520, 110), 0.9, col: const Color(0xFFCFD8DC));
    lightning(const Offset(520, 140), const Offset(560, 300), opacity: step == 1 ? (fr(t * 20) < 0.5 ? 1 : 0.2) : 0.15);

    // Legume with root nodules, animal, and a dead leaf with decomposers.
    const plant = Offset(210, 322);
    line(plant, plant + const Offset(0, -150), AC.leafDark, 8);
    for (var i = 0; i < 4; i++) {
      final y = plant.dy - 40 - i * 32.0;
      for (final s in [-1.0, 1.0]) {
        oval(Rect.fromCenter(center: Offset(plant.dx + s * 30, y), width: 52, height: 22), AC.leaf, line: AC.leafDark, w: 1.5);
      }
    }
    for (final r in const [Offset(150, 470), Offset(210, 500), Offset(270, 465)]) {
      path(Path()..moveTo(plant.dx, plant.dy)..quadraticBezierTo((plant.dx + r.dx) / 2, plant.dy + 50, r.dx, r.dy), AC.soil, 4);
      circle(lerpO(plant, r, 0.7) + const Offset(0, 12), 10, const Color(0xFFF48FB1), line: const Color(0xFFAD1457));
    }
    animal(const Offset(470, 268), 0.9);
    oval(const Rect.fromLTWH(720, 312, 90, 22), const Color(0xFFA1887F));
    for (var i = 0; i < 5; i++) {
      circle(Offset(730 + i * 18.0, 345 + 6 * math.sin(t * 30 + i)), 4, AC.purple);
    }

    // Soil compounds.
    const nh = Offset(780, 440), no2 = Offset(600, 520), no3 = Offset(400, 440);
    chip('NH₃ / NH₄⁺', nh, step == 2 || step == 4 ? AC.purple : AC.muted, size: 16);
    chip('NO₂⁻', no2, step == 2 ? AC.purple : AC.muted, size: 16);
    chip('NO₃⁻', no3, step >= 2 && step != 4 ? AC.purple : AC.muted, size: 16);

    // The cycle's arrows.
    flow(Path()..moveTo(80, 70)..quadraticBezierTo(60, 300, 180, 430), on: step == 1, chipText: 'N₂');
    flow(Path()..moveTo(560, 310)..quadraticBezierTo(600, 380, 720, 430), on: step == 1);
    flow(Path()..moveTo(250, 440)..quadraticBezierTo(330, 420, 360, 435), on: step == 1);
    flow(Path()..moveTo(740, 465)..quadraticBezierTo(700, 520, 640, 520), on: step == 2);
    flow(Path()..moveTo(560, 520)..quadraticBezierTo(470, 520, 420, 465), on: step == 2);
    flow(Path()..moveTo(370, 425)..quadraticBezierTo(300, 380, 240, 360), on: step == 3);
    flow(Path()..moveTo(260, 180)..quadraticBezierTo(330, 160, 390, 220), on: step == 3);
    flow(Path()..moveTo(560, 300)..quadraticBezierTo(700, 300, 740, 330), on: step == 4);
    flow(Path()..moveTo(765, 360)..lineTo(778, 418), on: step == 4);
    flow(Path()..moveTo(430, 425)..cubicTo(900, 420, 960, 250, 900, 70), on: step == 5, chipText: 'N₂');

    label('Nitrogen gas in air|हवा में नाइट्रोजन गैस|ಗಾಳಿಯಲ್ಲಿ ಸಾರಜನಕ ಅನಿಲ', const Offset(330, 90));
    label('Lightning|तड़ित|ಮಿಂಚು', const Offset(640, 200), opacity: step == 1 ? 1 : 0.6);
    label('Root nodules (Rhizobium)|जड़ ग्रंथिकाएँ (राइज़ोबियम)|ಬೇರುಗಂಟುಗಳು (ರೈಜೋಬಿಯಂ)', const Offset(150, 560), to: const Offset(180, 465));
    label('Nitrifying bacteria|नाइट्रीकारी जीवाणु|ನೈಟ್ರೀಕಾರಕ ಬ್ಯಾಕ್ಟೀರಿಯಾ', const Offset(560, 575), opacity: step == 2 ? 1 : 0);
    label('Plants take up nitrates|पौधे नाइट्रेट लेते हैं|ಸಸ್ಯಗಳು ನೈಟ್ರೇಟ್ ಹೀರುತ್ತವೆ', const Offset(330, 140), opacity: step == 3 ? 1 : 0);
    label('Decomposers|अपघटक|ವಿಘಟಕಗಳು', const Offset(880, 380), to: const Offset(800, 348), opacity: step == 4 ? 1 : 0.7);
    label('Denitrifying bacteria|विनाइट्रीकारी जीवाणु|ವಿನೈಟ್ರೀಕಾರಕ ಬ್ಯಾಕ್ಟೀರಿಯಾ', const Offset(860, 230), opacity: step == 5 ? 1 : 0);
  }
}

final carbonCycle = KxAnimation(
  id: 'carbon-cycle',
  title: const Tr('The carbon cycle', 'कार्बन चक्र', 'ಇಂಗಾಲದ ಚಕ್ರ'),
  subject: 'Biology',
  topic: 'Natural resources and cycles',
  levels: const ['Class 8', 'Class 9', 'Class 12'],
  keywords: const ['carbon cycle', 'carbon dioxide', 'photosynthesis', 'respiration', 'combustion', 'fossil fuels', 'decomposition', 'global warming', 'biogeochemical cycle', 'ocean'],
  seconds: 22,
  thumbT: 0.55,
  steps: const [
    AnimStep(0, Tr('Carbon dioxide in air', 'हवा में कार्बन डाइऑक्साइड', 'ಗಾಳಿಯಲ್ಲಿ ಇಂಗಾಲದ ಡೈಆಕ್ಸೈಡ್'),
        Tr('Carbon is in the air as carbon dioxide (CO₂), and the oceans dissolve some of it.', 'कार्बन हवा में कार्बन डाइऑक्साइड (CO₂) के रूप में है, और समुद्र इसका कुछ भाग घोल लेते हैं।', 'ಇಂಗಾಲ ಗಾಳಿಯಲ್ಲಿ ಇಂಗಾಲದ ಡೈಆಕ್ಸೈಡ್ (CO₂) ಆಗಿದೆ; ಸಾಗರಗಳು ಅದರ ಸ್ವಲ್ಪ ಭಾಗವನ್ನು ಕರಗಿಸುತ್ತವೆ.')),
    AnimStep(0.17, Tr('Photosynthesis', 'प्रकाश संश्लेषण', 'ದ್ಯುತಿಸಂಶ್ಲೇಷಣೆ'),
        Tr('Green plants take in CO₂ and use sunlight to make food (glucose): carbon enters living things.', 'हरे पौधे CO₂ लेकर सूर्य के प्रकाश से भोजन (ग्लूकोज़) बनाते हैं: कार्बन सजीवों में आता है।', 'ಹಸಿರು ಸಸ್ಯಗಳು CO₂ ತೆಗೆದುಕೊಂಡು ಸೂರ್ಯನ ಬೆಳಕಿನಿಂದ ಆಹಾರ (ಗ್ಲೂಕೋಸ್) ತಯಾರಿಸುತ್ತವೆ: ಇಂಗಾಲ ಜೀವಿಗಳನ್ನು ಸೇರುತ್ತದೆ.')),
    AnimStep(0.33, Tr('Food chains', 'आहार शृंखला', 'ಆಹಾರ ಸರಪಳಿ'),
        Tr('Animals eat plants, and the carbon in the food passes along the food chain.', 'जंतु पौधे खाते हैं और भोजन का कार्बन आहार शृंखला में आगे बढ़ता है।', 'ಪ್ರಾಣಿಗಳು ಸಸ್ಯಗಳನ್ನು ತಿನ್ನುತ್ತವೆ; ಆಹಾರದ ಇಂಗಾಲ ಆಹಾರ ಸರಪಳಿಯಲ್ಲಿ ಮುಂದೆ ಸಾಗುತ್ತದೆ.')),
    AnimStep(0.5, Tr('Respiration', 'श्वसन', 'ಉಸಿರಾಟ'),
        Tr('Plants and animals respire: they break down food for energy and give CO₂ back to the air.', 'पौधे और जंतु श्वसन करते हैं: ऊर्जा के लिए भोजन तोड़ते हैं और CO₂ हवा में लौटाते हैं।', 'ಸಸ್ಯ ಮತ್ತು ಪ್ರಾಣಿಗಳು ಉಸಿರಾಡುತ್ತವೆ: ಶಕ್ತಿಗಾಗಿ ಆಹಾರ ಒಡೆದು CO₂ ಅನ್ನು ಗಾಳಿಗೆ ಮರಳಿಸುತ್ತವೆ.')),
    AnimStep(0.67, Tr('Decay and fossils', 'अपघटन और जीवाश्म', 'ಕೊಳೆಯುವಿಕೆ ಮತ್ತು ಪಳೆಯುಳಿಕೆ'),
        Tr('Decomposers break down dead things and release CO₂. Remains buried for millions of years become coal, oil and gas.', 'अपघटक मृत जीवों को तोड़कर CO₂ छोड़ते हैं। लाखों वर्षों तक दबे अवशेष कोयला, तेल और गैस बन जाते हैं।', 'ವಿಘಟಕಗಳು ಸತ್ತ ಜೀವಿಗಳನ್ನು ಒಡೆದು CO₂ ಬಿಡುತ್ತವೆ. ಲಕ್ಷಾಂತರ ವರ್ಷ ಹೂತ ಅವಶೇಷಗಳು ಕಲ್ಲಿದ್ದಲು, ತೈಲ ಮತ್ತು ಅನಿಲವಾಗುತ್ತವೆ.')),
    AnimStep(0.84, Tr('Combustion', 'दहन', 'ದಹನ'),
        Tr('Burning fuels releases their stored carbon as CO₂. Too much of it warms the Earth.', 'ईंधन जलाने से उनमें जमा कार्बन CO₂ बनकर निकलता है। इसकी अधिकता पृथ्वी को गर्म करती है।', 'ಇಂಧನ ಸುಡುವುದರಿಂದ ಅವುಗಳಲ್ಲಿನ ಇಂಗಾಲ CO₂ ಆಗಿ ಬಿಡುಗಡೆಯಾಗುತ್ತದೆ. ಅದರ ಅತಿಯು ಭೂಮಿಯನ್ನು ಬಿಸಿ ಮಾಡುತ್ತದೆ.')),
  ],
  painter: _Carbon.new,
);

class _Carbon extends AnimPainter {
  _Carbon(super.f);

  @override
  void draw() {
    _land(this);
    final step = carbonCycle.stepAt(t);
    // Ocean on the right, fossil fuels deep down.
    rect(const Rect.fromLTWH(830, 315, 170, 285), const Color(0xFF64B5F6));
    for (var i = 0; i < 4; i++) {
      path(Path()..moveTo(830, 330.0 + i * 8)..relativeQuadraticBezierTo(20, -8 + 2 * math.sin(t * 20), 40, 0)..relativeQuadraticBezierTo(20, 8, 40, 0)..relativeQuadraticBezierTo(20, -8, 40, 0)..relativeQuadraticBezierTo(20, 8, 50, 0), Colors.white.withValues(alpha: 0.5), 2);
    }
    rect(const Rect.fromLTWH(0, 520, 830, 80), const Color(0xFF3E2723));
    for (var i = 0; i < 9; i++) {
      oval(Rect.fromCenter(center: Offset(60 + i * 90.0, 560), width: 70, height: 26), const Color(0xFF212121));
    }
    sun(const Offset(70, 70), 34);
    chip('CO₂', const Offset(480, 60), AC.co2, size: 22);
    for (var i = 0; i < 5; i++) {
      chip('CO₂', Offset(320 + i * 80.0 + 10 * math.sin(t * 7 + i), 105 + 8 * math.cos(t * 5 + i)), AC.co2.withValues(alpha: 0.7), size: 12);
    }

    tree(const Offset(200, 322), 1.1);
    animal(const Offset(460, 268), 0.9);
    mill(const Offset(680, 322), 1);
    // Smoke when burning.
    for (var i = 0; i < 4; i++) {
      final k = fr(t * 3 + i / 4);
      circle(Offset(733 + 20 * math.sin(k * 6), 160 - 100 * k), 12 + 14 * k, const Color(0xFF9E9E9E).withValues(alpha: (step == 5 ? 0.7 : 0.25) * (1 - k)));
    }
    // A fallen log with decomposers.
    rect(const Rect.fromLTWH(320, 340, 110, 26), const Color(0xFF795548), radius: 12);
    for (var i = 0; i < 4; i++) {
      circle(Offset(335 + i * 26.0, 382 + 4 * math.sin(t * 30 + i)), 6, const Color(0xFFFFCC80), line: const Color(0xFF8D6E63));
    }

    flow(Path()..moveTo(440, 75)..quadraticBezierTo(300, 80, 225, 140), on: step == 1, chipText: 'CO₂');
    flow(Path()..moveTo(290, 220)..quadraticBezierTo(360, 200, 400, 240), on: step == 2);
    flow(Path()..moveTo(170, 140)..quadraticBezierTo(220, 50, 440, 50), on: step == 3, chipText: 'CO₂', col: AC.glucose);
    flow(Path()..moveTo(520, 220)..quadraticBezierTo(540, 120, 515, 78), on: step == 3, chipText: 'CO₂', col: AC.glucose);
    flow(Path()..moveTo(470, 330)..quadraticBezierTo(460, 350, 440, 352), on: step == 4);
    flow(Path()..moveTo(380, 395)..quadraticBezierTo(390, 470, 420, 525), on: step == 4);
    flow(Path()..moveTo(330, 345)..quadraticBezierTo(280, 260, 420, 85), on: step == 4, chipText: 'CO₂', col: AC.glucose);
    flow(Path()..moveTo(560, 540)..quadraticBezierTo(640, 470, 660, 330), on: step == 5);
    flow(Path()..moveTo(733, 150)..quadraticBezierTo(700, 60, 530, 62), on: step == 5, chipText: 'CO₂', col: AC.red);
    flow(Path()..moveTo(540, 50)..quadraticBezierTo(880, 40, 900, 300), on: step == 0, chipText: 'CO₂', col: AC.water);

    label('Sunlight|सूर्य का प्रकाश|ಸೂರ್ಯನ ಬೆಳಕು', const Offset(70, 135), opacity: step == 1 ? 1 : 0.6);
    label('Photosynthesis|प्रकाश संश्लेषण|ದ್ಯುತಿಸಂಶ್ಲೇಷಣೆ', const Offset(240, 60), opacity: step == 1 ? 1 : 0);
    label('Respiration|श्वसन|ಉಸಿರಾಟ', const Offset(620, 140), opacity: step == 3 ? 1 : 0);
    label('Decomposers|अपघटक|ವಿಘಟಕಗಳು', const Offset(250, 400), to: const Offset(335, 384), opacity: step == 4 ? 1 : 0.7);
    label('Fossil fuels|जीवाश्म ईंधन|ಪಳೆಯುಳಿಕೆ ಇಂಧನ', const Offset(560, 575), size: 18);
    label('Combustion|दहन|ದಹನ', const Offset(820, 150), opacity: step == 5 ? 1 : 0);
    label('Ocean|समुद्र|ಸಾಗರ', const Offset(915, 450), size: 18);
  }
}
