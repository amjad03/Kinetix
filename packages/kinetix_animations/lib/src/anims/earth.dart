import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../draw.dart';
import '../model.dart';
import 'plate_rocks.dart';

// The water cycle, the rock cycle, plates and earthquakes, volcanoes, day and night and the
// seasons, the phases of the Moon, and eclipses.

const _geo = ['Science', 'Geography', 'Social Science', 'EVS'];

final waterCycle = KxAnimation(
  id: 'water-cycle',
  title: const Tr('The water cycle', 'जल चक्र', 'ಜಲಚಕ್ರ'),
  subject: 'Earth Science',
  topic: 'Water and weather',
  levels: const ['Class 6', 'Class 7', 'Class 9'],
  alsoSubjects: _geo,
  keywords: const ['water cycle', 'evaporation', 'condensation', 'precipitation', 'rain', 'clouds', 'transpiration', 'groundwater', 'runoff', 'hydrological cycle'],
  seconds: 20,
  thumbT: 0.5,
  steps: const [
    AnimStep(0, Tr('Evaporation', 'वाष्पीकरण', 'ಆವಿಯಾಗುವಿಕೆ'),
        Tr('The Sun heats water in seas, lakes and rivers. It turns into water vapour and rises.', 'सूर्य समुद्रों, झीलों और नदियों के पानी को गर्म करता है। पानी जलवाष्प बनकर ऊपर उठता है।', 'ಸೂರ್ಯ ಸಮುದ್ರ, ಸರೋವರ, ನದಿಗಳ ನೀರನ್ನು ಬಿಸಿ ಮಾಡುತ್ತಾನೆ. ನೀರು ಆವಿಯಾಗಿ ಮೇಲೇರುತ್ತದೆ.')),
    AnimStep(0.2, Tr('Transpiration', 'वाष्पोत्सर्जन', 'ಬಾಷ್ಪವಿಸರ್ಜನೆ'),
        Tr('Plants also give off water vapour from their leaves.', 'पौधे भी अपनी पत्तियों से जलवाष्प छोड़ते हैं।', 'ಸಸ್ಯಗಳೂ ತಮ್ಮ ಎಲೆಗಳಿಂದ ನೀರಾವಿಯನ್ನು ಬಿಡುತ್ತವೆ.')),
    AnimStep(0.36, Tr('Condensation', 'संघनन', 'ಸಾಂದ್ರೀಕರಣ'),
        Tr('High up, the vapour cools and condenses into tiny droplets that form clouds.', 'ऊँचाई पर वाष्प ठंडी होकर छोटी बूँदों में संघनित होती है, जिनसे बादल बनते हैं।', 'ಎತ್ತರದಲ್ಲಿ ಆವಿ ತಣ್ಣಗಾಗಿ ಸಣ್ಣ ಹನಿಗಳಾಗಿ ಸಾಂದ್ರೀಕರಿಸಿ ಮೋಡಗಳಾಗುತ್ತದೆ.')),
    AnimStep(0.56, Tr('Precipitation', 'वर्षण', 'ಅವಕ್ಷೇಪನ'),
        Tr('The droplets join and grow heavy, and fall as rain, or as snow and hail where it is cold.', 'बूँदें मिलकर भारी हो जाती हैं और वर्षा के रूप में, या ठंडी जगहों पर हिम और ओलों के रूप में गिरती हैं।', 'ಹನಿಗಳು ಸೇರಿ ಭಾರವಾಗಿ ಮಳೆಯಾಗಿ, ಚಳಿ ಇರುವಲ್ಲಿ ಹಿಮ ಮತ್ತು ಆಲಿಕಲ್ಲಾಗಿ ಬೀಳುತ್ತವೆ.')),
    AnimStep(0.76, Tr('Collection', 'संग्रहण', 'ಸಂಗ್ರಹಣೆ'),
        Tr('Water runs off into rivers and soaks into the ground, and flows back to the sea. The cycle repeats.', 'पानी बहकर नदियों में जाता है और ज़मीन में रिसता है, फिर समुद्र में लौटता है। चक्र दोहराता है।', 'ನೀರು ಹರಿದು ನದಿಗಳನ್ನು ಸೇರುತ್ತದೆ, ನೆಲದೊಳಗೆ ಇಂಗುತ್ತದೆ ಮತ್ತು ಸಮುದ್ರಕ್ಕೆ ಮರಳುತ್ತದೆ. ಚಕ್ರ ಪುನರಾವರ್ತನೆಯಾಗುತ್ತದೆ.')),
  ],
  painter: _WaterCycle.new,
);

class _WaterCycle extends AnimPainter {
  _WaterCycle(super.f);

  @override
  void draw() {
    final step = waterCycle.stepAt(t);
    c.drawRect(const Rect.fromLTWH(0, 0, 1000, 600), Paint()..shader = const LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [AC.sky, Colors.white]).createShader(const Rect.fromLTWH(0, 0, 1000, 600)));
    sun(const Offset(80, 80), 40);
    // Land with a mountain; ground water below.
    final land = Path()
      ..moveTo(400, 600)
      ..lineTo(400, 430)
      ..quadraticBezierTo(520, 420, 600, 360)
      ..lineTo(790, 170)
      ..lineTo(900, 300)
      ..quadraticBezierTo(950, 340, 1000, 340)
      ..lineTo(1000, 600)
      ..close();
    fillPath(land, const Color(0xFF8BC34A), line: const Color(0xFF558B2F));
    fillPath(Path()..moveTo(745, 215)..lineTo(790, 170)..lineTo(838, 227)..lineTo(810, 220)..lineTo(790, 235)..lineTo(770, 220)..close(), Colors.white);
    rect(const Rect.fromLTWH(400, 500, 600, 100), const Color(0xFFA1887F));
    // Sea.
    final sea = Path()..moveTo(0, 430);
    for (var x = 0.0; x <= 420; x += 20) {
      sea.lineTo(x, 430 + 5 * math.sin(x / 30 + t * 30));
    }
    sea
      ..lineTo(420, 600)
      ..lineTo(0, 600)
      ..close();
    fillPath(sea, const Color(0xFF42A5F5));
    // River from the mountain to the sea.
    final river = Path()..moveTo(780, 240)..quadraticBezierTo(700, 330, 620, 380)..quadraticBezierTo(520, 440, 420, 440);
    path(river, const Color(0xFF1E88E5), 10);
    tree(const Offset(560, 410), 0.55);
    tree(const Offset(640, 352), 0.5);

    // Evaporation and transpiration: vapour rising.
    for (var i = 0; i < 6; i++) {
      final k = fr(t * 4 + i / 6);
      final x = 70 + i * 60.0;
      if (step == 0 || step == 2) _vapour(Offset(x, 420 - 260 * k), 1 - k);
      if (step == 1 || step == 2) _vapour(Offset(540 + (i % 3) * 50.0, 330 - 180 * k), (1 - k) * 0.9);
    }
    // Clouds: they grow as vapour condenses and drift over the mountain.
    final grow = 0.6 + 0.5 * seg(t, 0.36, 0.56);
    final drift = 500 * ease(seg(t, 0.45, 0.6));
    final dark = seg(t, 0.5, 0.58) * (1 - seg(t, 0.9, 1));
    for (final o in [const Offset(260, 110), const Offset(360, 140)]) {
      cloud(o + Offset(drift * (o.dx < 300 ? 1 : 0.9), 0), grow, col: Color.lerp(Colors.white, const Color(0xFFB0BEC5), dark)!, edge: const Color(0xFFCFD8DC));
    }
    // Rain and snow.
    if (step == 3) {
      for (var i = 0; i < 24; i++) {
        final k = fr(t * 8 + rnd(i));
        final x = 680 + rnd(i, 1) * 260;
        final y = 170 + k * 200;
        x < 820 && x > 760 && y < 230 ? circle(Offset(x, y), 4, Colors.white, line: AC.water, w: 1) : line(Offset(x, y), Offset(x - 4, y + 14), AC.water, 3);
      }
    }
    // Collection: water flows down the river and into the ground.
    if (step == 4) {
      for (var i = 0; i < 6; i++) {
        circle(along(river, fr(t * 5 + i / 6)), 6, Colors.white, line: AC.water, w: 2);
        final k = fr(t * 3 + i / 6);
        circle(Offset(620 + i * 60.0, 440 + 100 * k), 5, AC.water.withValues(alpha: 1 - k));
      }
    }

    label('Evaporation|वाष्पीकरण|ಆವಿಯಾಗುವಿಕೆ', const Offset(230, 250), opacity: step == 0 || step == 2 ? 1 : 0.35);
    label('Transpiration|वाष्पोत्सर्जन|ಬಾಷ್ಪವಿಸರ್ಜನೆ', const Offset(560, 180), opacity: step == 1 ? 1 : 0.35);
    label('Condensation|संघनन|ಸಾಂದ್ರೀಕರಣ', Offset(330 + drift * 0.9, 50), opacity: step == 2 ? 1 : 0.35);
    label('Precipitation|वर्षण|ಅವಕ್ಷೇಪನ', const Offset(920, 230), opacity: step == 3 ? 1 : 0.35);
    label('Surface runoff|सतही अपवाह|ಮೇಲ್ಮೈ ಹರಿವು', const Offset(560, 470), to: const Offset(600, 395), opacity: step == 4 ? 1 : 0.35);
    label('Groundwater|भूजल|ಅಂತರ್ಜಲ', const Offset(820, 560), opacity: step == 4 ? 1 : 0.35);
    label('Sea|समुद्र|ಸಮುದ್ರ', const Offset(200, 520));
  }

  void _vapour(Offset at, double opacity) {
    final p = Path()..moveTo(at.dx, at.dy);
    for (var i = 1; i <= 8; i++) {
      p.lineTo(at.dx + 6 * math.sin(i * 1.2), at.dy - i * 5.0);
    }
    path(p, Colors.white.withValues(alpha: opacity * 0.9), 6);
    path(p, AC.water.withValues(alpha: opacity * 0.5), 2);
  }
}

final rockCycle = KxAnimation(
  id: 'rock-cycle',
  title: const Tr('The rock cycle', 'शैल चक्र', 'ಶಿಲಾ ಚಕ್ರ'),
  subject: 'Earth Science',
  topic: 'The Earth',
  levels: const ['Class 7', 'Class 11'],
  alsoSubjects: _geo,
  keywords: const ['rock cycle', 'igneous', 'sedimentary', 'metamorphic', 'magma', 'weathering', 'erosion', 'rocks', 'minerals', 'lithosphere'],
  seconds: 22,
  thumbT: 0.5,
  steps: const [
    AnimStep(0, Tr('Igneous rock', 'आग्नेय शैल', 'ಅಗ್ನಿಶಿಲೆ'),
        Tr('Hot molten magma cools and hardens into igneous rock, such as granite and basalt.', 'गर्म पिघला मैग्मा ठंडा होकर कठोर आग्नेय शैल बनाता है, जैसे ग्रेनाइट और बेसाल्ट।', 'ಬಿಸಿ ಕರಗಿದ ಶಿಲಾಪಾಕ ತಣಿದು ಗಟ್ಟಿಯಾಗಿ ಗ್ರಾನೈಟ್, ಬಸಾಲ್ಟ್‌ನಂತಹ ಅಗ್ನಿಶಿಲೆಯಾಗುತ್ತದೆ.')),
    AnimStep(0.2, Tr('Weathering and erosion', 'अपक्षय और अपरदन', 'ಶಿಥಿಲೀಕರಣ ಮತ್ತು ಸವೆತ'),
        Tr('Wind, water and ice break rocks into small pieces (sediments) and carry them away.', 'हवा, पानी और बर्फ़ शैलों को छोटे टुकड़ों (अवसाद) में तोड़कर बहा ले जाते हैं।', 'ಗಾಳಿ, ನೀರು, ಮಂಜುಗಡ್ಡೆ ಶಿಲೆಗಳನ್ನು ಸಣ್ಣ ತುಂಡುಗಳಾಗಿ (ಸಂಚಯಗಳು) ಒಡೆದು ಕೊಂಡೊಯ್ಯುತ್ತವೆ.')),
    AnimStep(0.4, Tr('Sedimentary rock', 'अवसादी शैल', 'ಸಂಚಯ ಶಿಲೆ'),
        Tr('Sediments settle in layers. Over a long time they are pressed and cemented into sedimentary rock, like sandstone.', 'अवसाद परतों में जमते हैं। लंबे समय में वे दबकर और जुड़कर अवसादी शैल बनते हैं, जैसे बलुआ पत्थर।', 'ಸಂಚಯಗಳು ಪದರಗಳಾಗಿ ಕೂರುತ್ತವೆ. ದೀರ್ಘಕಾಲದಲ್ಲಿ ಒತ್ತಲ್ಪಟ್ಟು ಬೆಸೆದು ಮರಳುಗಲ್ಲಿನಂತಹ ಸಂಚಯ ಶಿಲೆಯಾಗುತ್ತವೆ.')),
    AnimStep(0.6, Tr('Metamorphic rock', 'कायांतरित शैल', 'ರೂಪಾಂತರ ಶಿಲೆ'),
        Tr('Deep underground, heat and pressure change rocks into metamorphic rock: limestone becomes marble.', 'गहराई में ताप और दाब शैलों को कायांतरित शैल में बदल देते हैं: चूना पत्थर संगमरमर बन जाता है।', 'ಆಳದಲ್ಲಿ ಶಾಖ ಮತ್ತು ಒತ್ತಡ ಶಿಲೆಗಳನ್ನು ರೂಪಾಂತರ ಶಿಲೆಯಾಗಿಸುತ್ತವೆ: ಸುಣ್ಣದಕಲ್ಲು ಅಮೃತಶಿಲೆಯಾಗುತ್ತದೆ.')),
    AnimStep(0.8, Tr('Melting', 'पिघलना', 'ಕರಗುವಿಕೆ'),
        Tr('Pushed deeper still, rocks melt back into magma, and the cycle begins again.', 'और गहराई में जाकर शैल फिर पिघलकर मैग्मा बन जाते हैं, और चक्र फिर शुरू होता है।', 'ಇನ್ನೂ ಆಳಕ್ಕೆ ತಳ್ಳಲ್ಪಟ್ಟು ಶಿಲೆಗಳು ಮತ್ತೆ ಶಿಲಾಪಾಕವಾಗಿ ಕರಗುತ್ತವೆ; ಚಕ್ರ ಮತ್ತೆ ಆರಂಭ.')),
  ],
  painter: RockCyclePlate.new,
);

final earthquake = KxAnimation(
  id: 'plate-tectonics-earthquake',
  title: const Tr('Plate tectonics and earthquakes', 'प्लेट विवर्तनिकी और भूकंप', 'ಫಲಕ ಚಲನೆ ಮತ್ತು ಭೂಕಂಪ'),
  subject: 'Earth Science',
  topic: 'The Earth',
  levels: const ['Class 7', 'Class 8', 'Class 9', 'Class 11'],
  alsoSubjects: _geo,
  keywords: const ['earthquake', 'plate tectonics', 'plates', 'fault', 'focus', 'epicentre', 'seismic waves', 'seismograph', 'mantle', 'convection', 'disaster'],
  seconds: 20,
  thumbT: 0.62,
  steps: const [
    AnimStep(0, Tr('Moving plates', 'गतिशील प्लेटें', 'ಚಲಿಸುವ ಫಲಕಗಳು'),
        Tr('The Earth’s crust is broken into huge plates. Slow currents in the hot mantle below move them a few centimetres a year.', 'पृथ्वी की पर्पटी विशाल प्लेटों में बँटी है। नीचे गर्म मेंटल की धीमी धाराएँ इन्हें साल में कुछ सेंटीमीटर खिसकाती हैं।', 'ಭೂಮಿಯ ಹೊರಪದರ ದೊಡ್ಡ ಫಲಕಗಳಾಗಿ ಒಡೆದಿದೆ. ಕೆಳಗಿನ ಬಿಸಿ ಕವಚದ ನಿಧಾನ ಪ್ರವಾಹಗಳು ಅವನ್ನು ವರ್ಷಕ್ಕೆ ಕೆಲವು ಸೆಂ.ಮೀ. ಸರಿಸುತ್ತವೆ.')),
    AnimStep(0.22, Tr('Stress builds', 'तनाव बढ़ता है', 'ಒತ್ತಡ ಹೆಚ್ಚುತ್ತದೆ'),
        Tr('Where two plates meet at a fault they get stuck. The rocks bend as stress builds up over years.', 'जहाँ दो प्लेटें भ्रंश पर मिलती हैं, वे अटक जाती हैं। वर्षों तक तनाव बढ़ने से शैल मुड़ते हैं।', 'ಎರಡು ಫಲಕಗಳು ಭ್ರಂಶದಲ್ಲಿ ಸೇರುವಲ್ಲಿ ಸಿಕ್ಕಿಕೊಳ್ಳುತ್ತವೆ. ವರ್ಷಗಳ ಕಾಲ ಒತ್ತಡ ಹೆಚ್ಚಿ ಶಿಲೆಗಳು ಬಾಗುತ್ತವೆ.')),
    AnimStep(0.44, Tr('Sudden slip', 'अचानक खिसकना', 'ಹಠಾತ್ ಜಾರುವಿಕೆ'),
        Tr('The rocks suddenly slip at the focus, deep underground, releasing a huge amount of energy.', 'गहराई में उद्गम केंद्र पर शैल अचानक खिसकते हैं और भारी ऊर्जा मुक्त होती है।', 'ಆಳದಲ್ಲಿನ ಕೇಂದ್ರಬಿಂದುವಿನಲ್ಲಿ ಶಿಲೆಗಳು ಹಠಾತ್ ಜಾರಿ ಅಪಾರ ಶಕ್ತಿ ಬಿಡುಗಡೆಯಾಗುತ್ತದೆ.')),
    AnimStep(0.56, Tr('Seismic waves', 'भूकंपीय तरंगें', 'ಭೂಕಂಪನ ಅಲೆಗಳು'),
        Tr('Seismic waves spread out from the focus. The ground shakes most at the epicentre, the point right above it.', 'भूकंपीय तरंगें उद्गम केंद्र से फैलती हैं। उसके ठीक ऊपर के बिंदु, अधिकेंद्र, पर धरती सबसे ज़्यादा हिलती है।', 'ಭೂಕಂಪನ ಅಲೆಗಳು ಕೇಂದ್ರಬಿಂದುವಿನಿಂದ ಹರಡುತ್ತವೆ. ಅದರ ನೇರ ಮೇಲಿನ ಬಿಂದು ಅಧಿಕೇಂದ್ರದಲ್ಲಿ ನೆಲ ಹೆಚ್ಚು ಅಲುಗಾಡುತ್ತದೆ.')),
    AnimStep(0.8, Tr('Seismograph', 'भूकंपलेखी', 'ಭೂಕಂಪನಮಾಪಕ'),
        Tr('A seismograph records the shaking. Its strength is given on the Richter scale.', 'भूकंपलेखी कंपन को दर्ज करता है। इसकी तीव्रता रिक्टर पैमाने पर बताई जाती है।', 'ಭೂಕಂಪನಮಾಪಕ ಅಲುಗಾಟವನ್ನು ದಾಖಲಿಸುತ್ತದೆ. ಅದರ ತೀವ್ರತೆಯನ್ನು ರಿಕ್ಟರ್ ಮಾಪಕದಲ್ಲಿ ಹೇಳಲಾಗುತ್ತದೆ.')),
  ],
  painter: _Quake.new,
);

class _Quake extends AnimPainter {
  _Quake(super.f);

  static const focus = Offset(480, 330);

  @override
  void draw() {
    final strain = seg(t, 0.22, 0.44);
    final slip = ease(seg(t, 0.44, 0.48));
    final shake = t >= 0.46 && t < 0.85 ? math.sin(t * 600) * 6 * (1 - seg(t, 0.5, 0.85)) : 0.0;
    c.drawRect(const Rect.fromLTWH(0, 0, 1000, 180), Paint()..color = AC.sky);
    // Mantle with convection currents.
    rect(const Rect.fromLTWH(0, 420, 1000, 180), const Color(0xFFFFAB91));
    for (final cx in [250.0, 750.0]) {
      for (var i = 0; i < 2; i++) {
        final a0 = (cx < 500 ? -1 : 1) * t * 8 + i * math.pi;
        arrowPath(Path()..addArc(Rect.fromCenter(center: Offset(cx, 510), width: 300, height: 120), a0, 2.4), const Color(0xFFD84315), w: 4);
      }
    }
    // The two plates; the fault between them slants.
    final drift = 30 * seg(t, 0, 0.22);
    final slide = 34 * slip;
    for (final left in [true, false]) {
      final p = Path();
      if (left) {
        p
          ..moveTo(0, 180)
          ..lineTo(500, 180)
          ..lineTo(460, 420)
          ..lineTo(0, 420)
          ..close();
      } else {
        p
          ..moveTo(500, 180)
          ..lineTo(1000, 180)
          ..lineTo(1000, 420)
          ..lineTo(460, 420)
          ..close();
      }
      c.save();
      c.translate(shake, 0);
      fillPath(p, left ? const Color(0xFFBCAAA4) : const Color(0xFFA1887F), line: const Color(0xFF5D4037), w: 3);
      // Rock layers that bend under stress, then snap back offset.
      c.clipPath(p);
      for (var i = 0; i < 4; i++) {
        final y = 220.0 + i * 55;
        final q = Path();
        for (var x = left ? 0.0 : 460.0; x <= (left ? 500 : 1000); x += 10) {
          final near = math.exp(-math.pow((x - 480) / 120, 2));
          final bend = (left ? -1 : 1) * 30 * strain * (1 - slip) * near;
          final off = left ? 0 : -slide;
          x == (left ? 0.0 : 460.0) ? q.moveTo(x, y + bend + off) : q.lineTo(x, y + bend + off);
        }
        path(q, const Color(0xFF6D4C41), 3);
      }
      c.restore();
      // Plate motion arrows.
      if (t < 0.44) arrow(Offset(left ? 150 + drift : 850 - drift, 300), Offset(left ? 230 + drift : 770 - drift, 300), AC.ink, w: 5);
    }
    // Houses on the surface.
    for (final x in [200.0, 420.0, 600.0, 820.0]) {
      final tilt = (shake / 6) * 0.08 * (1 - (x - 480).abs() / 600);
      c.save();
      c.translate(x + shake, 180);
      c.rotate(tilt);
      rect(const Rect.fromLTWH(-30, -50, 60, 50), const Color(0xFFFFF3E0), line: AC.ink, w: 2);
      fillPath(Path()..moveTo(-38, -50)..lineTo(0, -80)..lineTo(38, -50)..close(), AC.red);
      c.restore();
    }
    // Seismic waves from the focus.
    if (t >= 0.46) {
      c.save();
      c.clipRect(const Rect.fromLTWH(0, 180, 1000, 240));
      for (var i = 0; i < 4; i++) {
        final r = fr(t * 4 + i / 4) * 520;
        ring(focus, r, AC.red.withValues(alpha: (1 - r / 520) * 0.8), 3);
      }
      c.restore();
      _star(focus, 18, AC.red);
      dashed(focus, Offset(focus.dx + 2, 180), AC.red);
      circle(const Offset(482, 180), 8, AC.red);
    }
    // Seismograph.
    const g = Rect.fromLTWH(640, 20, 340, 120);
    rect(g, Colors.white, line: AC.line, radius: 12);
    final trace = Path()..moveTo(g.left + 10, g.center.dy);
    final upto = (g.width - 20) * t;
    for (var x = 0.0; x <= upto; x += 2) {
      final tt = x / (g.width - 20);
      final amp = tt < 0.47 ? 1.5 : 40 * math.exp(-(tt - 0.47) * 6);
      trace.lineTo(g.left + 10 + x, g.center.dy + amp * math.sin(x * 0.9) * (0.6 + 0.4 * math.sin(x * 0.13)));
    }
    path(trace, AC.ink, 2);
    label('Seismograph|भूकंपलेखी|ಭೂಕಂಪನಮಾಪಕ', Offset(g.center.dx, g.bottom + 18), size: 15);
    label('Crust (plates)|पर्पटी (प्लेटें)|ಹೊರಪದರ (ಫಲಕಗಳು)', const Offset(120, 395), size: 15);
    label('Mantle|मेंटल|ಕವಚ', const Offset(500, 570));
    label('Fault|भ्रंश|ಭ್ರಂಶ', const Offset(560, 400), to: const Offset(468, 380), size: 15);
    label('Focus|उद्गम केंद्र|ಕೇಂದ್ರಬಿಂದು', focus + const Offset(-110, 30), to: focus, opacity: t >= 0.46 ? 1 : 0);
    label('Epicentre|अधिकेंद्र|ಅಧಿಕೇಂದ್ರ', const Offset(330, 120), to: const Offset(478, 178), opacity: t >= 0.56 ? 1 : 0);
  }

  void _star(Offset o, double r, Color col) {
    final p = Path();
    for (var i = 0; i < 10; i++) {
      final q = polar(o, i.isEven ? r : r * 0.45, -math.pi / 2 + i * math.pi / 5);
      i == 0 ? p.moveTo(q.dx, q.dy) : p.lineTo(q.dx, q.dy);
    }
    fillPath(p..close(), col, line: Colors.white);
  }
}

final volcano = KxAnimation(
  id: 'volcano',
  title: const Tr('A volcano erupts', 'ज्वालामुखी विस्फोट', 'ಜ್ವಾಲಾಮುಖಿ ಸ್ಫೋಟ'),
  subject: 'Earth Science',
  topic: 'The Earth',
  levels: const ['Class 7', 'Class 9', 'Class 11'],
  alsoSubjects: _geo,
  keywords: const ['volcano', 'eruption', 'magma', 'lava', 'crater', 'vent', 'ash', 'magma chamber', 'landforms', 'disaster'],
  seconds: 18,
  thumbT: 0.6,
  steps: const [
    AnimStep(0, Tr('Magma chamber', 'मैग्मा कक्ष', 'ಶಿಲಾಪಾಕ ಕೋಣೆ'),
        Tr('Deep under the volcano, molten rock called magma collects in a magma chamber.', 'ज्वालामुखी के नीचे गहराई में मैग्मा नामक पिघला शैल मैग्मा कक्ष में जमा होता है।', 'ಜ್ವಾಲಾಮುಖಿಯ ಕೆಳಗೆ ಆಳದಲ್ಲಿ ಶಿಲಾಪಾಕ ಎಂಬ ಕರಗಿದ ಶಿಲೆ ಶಿಲಾಪಾಕ ಕೋಣೆಯಲ್ಲಿ ಸಂಗ್ರಹವಾಗುತ್ತದೆ.')),
    AnimStep(0.22, Tr('Pressure builds', 'दाब बढ़ता है', 'ಒತ್ತಡ ಹೆಚ್ಚುತ್ತದೆ'),
        Tr('Gases in the magma form bubbles. The pressure rises and pushes magma up the vent.', 'मैग्मा की गैसें बुलबुले बनाती हैं। दाब बढ़ता है और मैग्मा को निकास नली में ऊपर धकेलता है।', 'ಶಿಲಾಪಾಕದ ಅನಿಲಗಳು ಗುಳ್ಳೆಗಳಾಗುತ್ತವೆ. ಒತ್ತಡ ಹೆಚ್ಚಿ ಶಿಲಾಪಾಕವನ್ನು ನಾಳದಲ್ಲಿ ಮೇಲೆ ತಳ್ಳುತ್ತದೆ.')),
    AnimStep(0.45, Tr('Eruption', 'उद्गार', 'ಸ್ಫೋಟ'),
        Tr('Magma bursts out of the crater as lava, with ash, rocks and gases.', 'मैग्मा लावा के रूप में राख, पत्थरों और गैसों के साथ क्रेटर से फूट पड़ता है।', 'ಶಿಲಾಪಾಕ ಲಾವಾ ಆಗಿ ಬೂದಿ, ಕಲ್ಲು ಮತ್ತು ಅನಿಲಗಳೊಂದಿಗೆ ಕುಳಿಯಿಂದ ಹೊರಸಿಡಿಯುತ್ತದೆ.')),
    AnimStep(0.7, Tr('Lava flows', 'लावा का बहना', 'ಲಾವಾ ಹರಿವು'),
        Tr('Lava flows down the slopes, cools and hardens into new rock. Layer by layer, the cone grows.', 'लावा ढलानों पर बहता है, ठंडा होकर नया शैल बनता है। परत-दर-परत शंकु बढ़ता है।', 'ಲಾವಾ ಇಳಿಜಾರಿನಲ್ಲಿ ಹರಿದು ತಣಿದು ಹೊಸ ಶಿಲೆಯಾಗುತ್ತದೆ. ಪದರ ಪದರವಾಗಿ ಶಂಕು ಬೆಳೆಯುತ್ತದೆ.')),
  ],
  painter: _Volcano.new,
);

class _Volcano extends AnimPainter {
  _Volcano(super.f);

  @override
  void draw() {
    final erupt = seg(t, 0.45, 0.5) * (1 - seg(t, 0.9, 1));
    final flowK = seg(t, 0.5, 0.95);
    c.drawRect(const Rect.fromLTWH(0, 0, 1000, 600), Paint()..shader = const LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [AC.sky, Color(0xFFFFF8E1)]).createShader(const Rect.fromLTWH(0, 0, 1000, 600)));
    rect(const Rect.fromLTWH(0, 440, 1000, 160), const Color(0xFF8D6E63));
    // Cone, in layers.
    for (var i = 0; i < 4; i++) {
      final s = 1 - i * 0.12;
      final cone = Path()
        ..moveTo(500 - 330 * s, 440)
        ..lineTo(462, 170 + (1 - s) * 120)
        ..lineTo(538, 170 + (1 - s) * 120)
        ..lineTo(500 + 330 * s, 440)
        ..close();
      fillPath(cone, [const Color(0xFF795548), const Color(0xFF8D6E63), const Color(0xFF6D4C41), const Color(0xFF7B5E57)][i]);
    }
    // Magma chamber and vent.
    final heat = seg(t, 0.2, 0.45);
    final chamber = Rect.fromCenter(center: const Offset(500, 530), width: 320 + 20 * heat, height: 100 + 10 * heat);
    oval(chamber, Color.lerp(const Color(0xFFE64A19), const Color(0xFFFF7043), heat)!, line: const Color(0xFFBF360C), w: 3);
    final rise = ease(seg(t, 0.22, 0.47));
    rect(Rect.fromLTRB(486, 440 - 270 * rise, 514, 495), AC.magma);
    rect(const Rect.fromLTRB(486, 170, 514, 440), Colors.transparent, line: const Color(0xFF4E342E), w: 2);
    for (var i = 0; i < 10; i++) {
      final k = fr(t * 3 + rnd(i));
      final b = Offset(380 + rnd(i, 1) * 240, 550 - 30 * k);
      if (t >= 0.2) circle(b, 3 + 5 * k, const Color(0xFFFFF59D).withValues(alpha: 1 - k));
    }
    // Eruption: lava fountain, bombs, ash cloud.
    if (erupt > 0) {
      for (var i = 0; i < 26; i++) {
        final k = fr(t * 3 + rnd(i, 2));
        final vx = (rnd(i, 3) - 0.5) * 380;
        final p = Offset(500 + vx * k, 170 - 330 * k + 380 * k * k);
        circle(p, 5 + 4 * rnd(i, 4), Color.lerp(const Color(0xFFFFEB3B), AC.magma, k)!.withValues(alpha: erupt));
      }
      for (var i = 0; i < 7; i++) {
        final k = seg(t, 0.45 + i * 0.02, 0.9);
        circle(Offset(500 + (i - 3) * 40.0 * k + 30 * math.sin(i * 2.0), 150 - 120 * k - i * 8), 30 + 50 * k, const Color(0xFF616161).withValues(alpha: 0.6 * erupt));
      }
    }
    // Lava flows down both sides.
    if (flowK > 0) {
      for (final s in [-1.0, 1.0]) {
        final p = Path()
          ..moveTo(500 + s * 30, 174)
          ..lineTo(500 + s * 322, 436);
        final m = p.computeMetrics().first;
        c.drawPath(m.extractPath(0, m.length * flowK), stroke(Color.lerp(const Color(0xFFFF6D00), const Color(0xFF4E342E), seg(t, 0.85, 1))!, 16));
      }
    }
    label('Magma chamber|मैग्मा कक्ष|ಶಿಲಾಪಾಕ ಕೋಣೆ', const Offset(830, 540), to: Offset(chamber.right - 10, chamber.center.dy));
    label('Vent|निकास नली|ನಾಳ', const Offset(700, 330), to: const Offset(514, 330));
    label('Crater|क्रेटर|ಕುಳಿ', const Offset(700, 160), to: const Offset(538, 172));
    label('Lava|लावा|ಲಾವಾ', const Offset(180, 330), to: const Offset(370, 310), opacity: flowK > 0.2 ? 1 : 0);
    label('Ash and gases|राख और गैसें|ಬೂದಿ ಮತ್ತು ಅನಿಲಗಳು', const Offset(220, 60), opacity: erupt);
    label('Layers of old lava|पुराने लावा की परतें|ಹಳೆಯ ಲಾವಾ ಪದರಗಳು', const Offset(140, 470), to: const Offset(260, 420), size: 15);
  }
}

final dayNightSeasons = KxAnimation(
  id: 'day-night-seasons',
  title: const Tr('Day and night, and the seasons', 'दिन-रात और ऋतुएँ', 'ಹಗಲು-ರಾತ್ರಿ ಮತ್ತು ಋತುಗಳು'),
  subject: 'Earth Science',
  topic: 'Earth and space',
  levels: const ['Class 6', 'Class 8', 'Class 11'],
  alsoSubjects: _geo,
  keywords: const ['day and night', 'seasons', 'rotation', 'revolution', 'axis', 'tilt', 'orbit', 'solstice', 'equinox', 'earth', 'sun', 'motions of the earth'],
  seconds: 24,
  thumbT: 0.75,
  steps: const [
    AnimStep(0, Tr('Rotation', 'घूर्णन', 'ಆವರ್ತನೆ'),
        Tr('The Earth spins on its tilted axis from west to east, once every 24 hours.', 'पृथ्वी अपने झुके हुए अक्ष पर पश्चिम से पूर्व की ओर हर 24 घंटे में एक बार घूमती है।', 'ಭೂಮಿ ತನ್ನ ಓರೆಯಾದ ಅಕ್ಷದ ಮೇಲೆ ಪಶ್ಚಿಮದಿಂದ ಪೂರ್ವಕ್ಕೆ 24 ಗಂಟೆಗೆ ಒಮ್ಮೆ ತಿರುಗುತ್ತದೆ.')),
    AnimStep(0.2, Tr('Day and night', 'दिन और रात', 'ಹಗಲು ಮತ್ತು ರಾತ್ರಿ'),
        Tr('The half facing the Sun has day; the other half has night. As the Earth turns, places move from day into night.', 'सूर्य की ओर वाले आधे भाग में दिन और दूसरे आधे में रात होती है। पृथ्वी घूमती है तो जगहें दिन से रात में जाती हैं।', 'ಸೂರ್ಯನತ್ತ ಇರುವ ಅರ್ಧ ಭಾಗದಲ್ಲಿ ಹಗಲು, ಇನ್ನರ್ಧದಲ್ಲಿ ರಾತ್ರಿ. ಭೂಮಿ ತಿರುಗಿದಂತೆ ಸ್ಥಳಗಳು ಹಗಲಿನಿಂದ ರಾತ್ರಿಗೆ ಸಾಗುತ್ತವೆ.')),
    AnimStep(0.42, Tr('Revolution', 'परिक्रमण', 'ಪರಿಭ್ರಮಣೆ'),
        Tr('The Earth also goes round the Sun once a year, its axis always tilted at 23½° the same way.', 'पृथ्वी साल में एक बार सूर्य की परिक्रमा भी करती है; उसका अक्ष सदा एक ही दिशा में 23½° झुका रहता है।', 'ಭೂಮಿ ವರ್ಷಕ್ಕೊಮ್ಮೆ ಸೂರ್ಯನನ್ನು ಸುತ್ತುತ್ತದೆ; ಅದರ ಅಕ್ಷ ಸದಾ ಒಂದೇ ದಿಕ್ಕಿನಲ್ಲಿ 23½° ಓರೆಯಾಗಿರುತ್ತದೆ.')),
    AnimStep(0.6, Tr('June: summer in the north', 'जून: उत्तर में ग्रीष्म', 'ಜೂನ್: ಉತ್ತರದಲ್ಲಿ ಬೇಸಿಗೆ'),
        Tr('In June the northern half leans towards the Sun: long days and direct rays bring summer to India.', 'जून में उत्तरी गोलार्ध सूर्य की ओर झुका होता है: लंबे दिन और सीधी किरणें भारत में गर्मी लाती हैं।', 'ಜೂನ್‌ನಲ್ಲಿ ಉತ್ತರಾರ್ಧ ಗೋಳ ಸೂರ್ಯನತ್ತ ಬಾಗಿರುತ್ತದೆ: ದೀರ್ಘ ಹಗಲು ಮತ್ತು ನೇರ ಕಿರಣಗಳು ಭಾರತಕ್ಕೆ ಬೇಸಿಗೆ ತರುತ್ತವೆ.')),
    AnimStep(0.8, Tr('December: winter in the north', 'दिसंबर: उत्तर में शीत', 'ಡಿಸೆಂಬರ್: ಉತ್ತರದಲ್ಲಿ ಚಳಿಗಾಲ'),
        Tr('In December the northern half leans away: short days and slanting rays bring winter, while it is summer in the south.', 'दिसंबर में उत्तरी गोलार्ध सूर्य से दूर झुका होता है: छोटे दिन और तिरछी किरणें सर्दी लाती हैं, जबकि दक्षिण में गर्मी होती है।', 'ಡಿಸೆಂಬರ್‌ನಲ್ಲಿ ಉತ್ತರಾರ್ಧ ಸೂರ್ಯನಿಂದ ದೂರ ಬಾಗಿರುತ್ತದೆ: ಕಿರು ಹಗಲು, ಓರೆ ಕಿರಣಗಳು ಚಳಿ ತರುತ್ತವೆ; ದಕ್ಷಿಣದಲ್ಲಿ ಬೇಸಿಗೆ.')),
  ],
  painter: _Seasons.new,
);

class _Seasons extends AnimPainter {
  _Seasons(super.f);

  @override
  Color get background => AC.space;

  static const tilt = 23.5 * math.pi / 180;

  @override
  void draw() {
    for (var i = 0; i < 60; i++) {
      circle(Offset(rnd(i) * 1000, rnd(i, 1) * 600), 1 + rnd(i, 2) * 1.5, Colors.white.withValues(alpha: 0.5));
    }
    final orbitView = seg(t, 0.4, 0.46);
    if (orbitView < 1) {
      c.saveLayer(null, Paint()..color = Colors.white.withValues(alpha: 1 - orbitView));
      _spin();
      c.restore();
    }
    if (orbitView > 0) {
      c.saveLayer(null, Paint()..color = Colors.white.withValues(alpha: orbitView));
      _orbit();
      c.restore();
    }
  }

  /// A globe at [o] with its axis tilted [axisTilt] (radians, + leans the north pole right),
  /// spun to [spin], lit from the direction [sunDir] (radians).
  void _globe(Offset o, double r, double spin, double sunDir, {double axisTilt = -tilt, bool marker = false}) {
    c.save();
    c.translate(o.dx, o.dy);
    c.rotate(axisTilt);
    circle(Offset.zero, r, const Color(0xFF1E88E5));
    c.save();
    c.clipPath(Path()..addOval(Rect.fromCircle(center: Offset.zero, radius: r)));
    // Continents: blobs on lines of longitude, projected onto the disc.
    const lands = [(0.0, -0.4, 0.5), (1.4, 0.2, 0.6), (2.6, -0.2, 0.45), (3.9, 0.5, 0.4), (5.0, -0.1, 0.55)];
    for (final (lon, lat, size) in lands) {
      final a = lon + spin;
      final z = math.cos(a);
      if (z < -0.1) continue;
      final x = math.sin(a) * r * math.cos(lat);
      final y = math.sin(lat) * r;
      oval(Rect.fromCenter(center: Offset(x, y), width: size * r * (0.3 + 0.7 * z), height: size * r * 0.8), const Color(0xFF66BB6A));
    }
    if (marker) {
      final a = 1.4 + spin;
      if (math.cos(a) > 0) circle(Offset(math.sin(a) * r * math.cos(0.2), math.sin(0.2) * r * 0.9), 7, AC.red, line: Colors.white);
    }
    c.restore();
    line(Offset(0, -r - 30), Offset(0, r + 30), Colors.white, 3);
    c.restore();
    // Night side.
    c.save();
    c.translate(o.dx, o.dy);
    c.clipPath(Path()..addOval(Rect.fromCircle(center: Offset.zero, radius: r + 1)));
    c.rotate(sunDir);
    c.drawRect(Rect.fromLTWH(-r * 2, -r * 2, r * 2, r * 4), Paint()..color = const Color(0xAA000814));
    c.restore();
  }

  void _spin() {
    // Sunlight from the right.
    for (var i = 0; i < 6; i++) {
      final y = 120 + i * 72.0;
      arrow(Offset(980, y), Offset(800, y), AC.sun, w: 3);
    }
    _globe(const Offset(450, 300), 190, t * tau * 3, 0, marker: true);
    final step = dayNightSeasons.stepAt(t);
    label('Axis (23½°)|अक्ष (23½°)|ಅಕ್ಷ (23½°)', const Offset(290, 70), to: const Offset(360, 110), color: AC.ink);
    label('Sunlight|सूर्य का प्रकाश|ಸೂರ್ಯನ ಬೆಳಕು', const Offset(890, 70));
    label('Day|दिन|ಹಗಲು', const Offset(560, 520), opacity: step >= 1 ? 1 : 0);
    label('Night|रात|ರಾತ್ರಿ', const Offset(330, 520), opacity: step >= 1 ? 1 : 0);
    // The direction of spin.
    arrowPath(Path()..addArc(Rect.fromCenter(center: const Offset(450, 300), width: 460, height: 120), 0.3, 2.2), Colors.white, w: 3);
    label('West → East|पश्चिम → पूर्व|ಪಶ್ಚಿಮ → ಪೂರ್ವ', const Offset(450, 395));
  }

  void _orbit() {
    const sunAt = Offset(500, 300);
    final step = dayNightSeasons.stepAt(t);
    // Orbit; months at four points.
    oval(Rect.fromCenter(center: sunAt, width: 760, height: 330), Colors.transparent, line: Colors.white38, w: 2);
    sun(sunAt, 55);
    // Earth's place: June at the left, December at the right (north pole leans right, so in
    // June, left of the Sun, it leans towards it).
    double a;
    if (step == 3) {
      a = math.pi;
    } else if (step == 4) {
      a = 0;
    } else {
      a = math.pi * 0.5 + seg(t, 0.42, 0.6) * tau;
    }
    final at = sunAt + Offset(math.cos(a) * 380, math.sin(a) * 165);
    final sunDir = math.atan2(sunAt.dy - at.dy, sunAt.dx - at.dx);
    final big = step >= 3;
    _globe(at, big ? 90 : 46, t * tau * 6, sunDir, axisTilt: tilt);
    for (final (m, p) in [('June|जून|ಜೂನ್', sunAt + const Offset(-380, 0)), ('December|दिसंबर|ಡಿಸೆಂಬರ್', sunAt + const Offset(380, 0)), ('March|मार्च|ಮಾರ್ಚ್', sunAt + const Offset(0, 165)), ('September|सितंबर|ಸೆಪ್ಟೆಂಬರ್', sunAt + const Offset(0, -165))]) {
      label(m, p + Offset(0, p.dy < 200 ? -36 : (p.dy > 400 ? 36 : 120)), size: 15);
    }
    if (big) {
      final northLit = step == 3;
      label(northLit ? 'North: summer|उत्तर: ग्रीष्म|ಉತ್ತರ: ಬೇಸಿಗೆ' : 'North: winter|उत्तर: शीत|ಉತ್ತರ: ಚಳಿಗಾಲ', at + const Offset(0, -130), color: northLit ? AC.red : AC.blue);
      label(northLit ? 'South: winter|दक्षिण: शीत|ದಕ್ಷಿಣ: ಚಳಿಗಾಲ' : 'South: summer|दक्षिण: ग्रीष्म|ದಕ್ಷಿಣ: ಬೇಸಿಗೆ', at + const Offset(0, 130), color: northLit ? AC.blue : AC.red);
    }
  }
}

final moonPhases = KxAnimation(
  id: 'moon-phases',
  title: const Tr('Phases of the Moon', 'चंद्रमा की कलाएँ', 'ಚಂದ್ರನ ಕಲೆಗಳು'),
  subject: 'Earth Science',
  topic: 'Earth and space',
  levels: const ['Class 6', 'Class 8'],
  alsoSubjects: _geo,
  keywords: const ['moon', 'phases', 'new moon', 'full moon', 'crescent', 'gibbous', 'quarter', 'lunar month', 'amavasya', 'purnima', 'satellite'],
  seconds: 24,
  thumbT: 0.32,
  steps: const [
    AnimStep(0, Tr('New moon', 'अमावस्या', 'ಅಮಾವಾಸ್ಯೆ'),
        Tr('The Sun always lights half the Moon. At new moon the lit half faces away from us, so we see nothing.', 'सूर्य सदा चंद्रमा का आधा भाग प्रकाशित करता है। अमावस्या पर प्रकाशित भाग हमसे दूर होता है, इसलिए कुछ नहीं दिखता।', 'ಸೂರ್ಯ ಯಾವಾಗಲೂ ಚಂದ್ರನ ಅರ್ಧ ಭಾಗವನ್ನು ಬೆಳಗುತ್ತಾನೆ. ಅಮಾವಾಸ್ಯೆಯಂದು ಬೆಳಗಿದ ಭಾಗ ನಮ್ಮಿಂದ ದೂರ ಇರುವುದರಿಂದ ಏನೂ ಕಾಣದು.')),
    AnimStep(0.06, Tr('Waxing crescent', 'बढ़ता अर्धचंद्र', 'ಬೆಳೆಯುವ ಬಿದಿಗೆ ಚಂದ್ರ'),
        Tr('As the Moon moves round the Earth we see more of its lit half each night: the Moon waxes.', 'चंद्रमा पृथ्वी के चारों ओर चलता है, तो हर रात उसका प्रकाशित भाग अधिक दिखता है: चंद्रमा बढ़ता है (शुक्ल पक्ष)।', 'ಚಂದ್ರ ಭೂಮಿಯನ್ನು ಸುತ್ತಿದಂತೆ ಪ್ರತಿ ರಾತ್ರಿ ಬೆಳಗಿದ ಭಾಗ ಹೆಚ್ಚು ಕಾಣುತ್ತದೆ: ಚಂದ್ರ ಬೆಳೆಯುತ್ತಾನೆ (ಶುಕ್ಲ ಪಕ್ಷ).')),
    AnimStep(0.22, Tr('First quarter', 'प्रथम चतुर्थांश', 'ಮೊದಲ ಚತುರ್ಥ'),
        Tr('About a week later we see half of the Moon’s face lit.', 'लगभग एक सप्ताह बाद चंद्रमा का आधा चेहरा प्रकाशित दिखता है।', 'ಸುಮಾರು ಒಂದು ವಾರದ ನಂತರ ಚಂದ್ರನ ಅರ್ಧ ಮುಖ ಬೆಳಗಿದಂತೆ ಕಾಣುತ್ತದೆ.')),
    AnimStep(0.44, Tr('Full moon', 'पूर्णिमा', 'ಹುಣ್ಣಿಮೆ'),
        Tr('When the Earth is between the Sun and the Moon, we see the whole lit half: a full moon.', 'जब पृथ्वी सूर्य और चंद्रमा के बीच होती है, तब पूरा प्रकाशित भाग दिखता है: पूर्णिमा।', 'ಭೂಮಿ ಸೂರ್ಯ ಮತ್ತು ಚಂದ್ರನ ನಡುವೆ ಇದ್ದಾಗ ಸಂಪೂರ್ಣ ಬೆಳಗಿದ ಭಾಗ ಕಾಣುತ್ತದೆ: ಹುಣ್ಣಿಮೆ.')),
    AnimStep(0.56, Tr('Waning', 'घटता चंद्रमा', 'ಕ್ಷೀಣಿಸುವ ಚಂದ್ರ'),
        Tr('After full moon we see less of the lit half each night: the Moon wanes.', 'पूर्णिमा के बाद हर रात प्रकाशित भाग कम दिखता है: चंद्रमा घटता है (कृष्ण पक्ष)।', 'ಹುಣ್ಣಿಮೆಯ ನಂತರ ಪ್ರತಿ ರಾತ್ರಿ ಬೆಳಗಿದ ಭಾಗ ಕಡಿಮೆ ಕಾಣುತ್ತದೆ: ಚಂದ್ರ ಕ್ಷೀಣಿಸುತ್ತಾನೆ (ಕೃಷ್ಣ ಪಕ್ಷ).')),
    AnimStep(0.72, Tr('Last quarter', 'अंतिम चतुर्थांश', 'ಕೊನೆಯ ಚತುರ್ಥ'),
        Tr('The other half of the face is lit. About a week later it is new moon again: the cycle takes about 29½ days.', 'चेहरे का दूसरा आधा भाग प्रकाशित है। लगभग एक सप्ताह बाद फिर अमावस्या: पूरा चक्र लगभग 29½ दिन का है।', 'ಮುಖದ ಇನ್ನೊಂದು ಅರ್ಧ ಬೆಳಗಿದೆ. ಸುಮಾರು ಒಂದು ವಾರದಲ್ಲಿ ಮತ್ತೆ ಅಮಾವಾಸ್ಯೆ: ಚಕ್ರಕ್ಕೆ ಸುಮಾರು 29½ ದಿನ.')),
  ],
  painter: _Moon.new,
);

/// The Moon as seen from the Earth at phase [p] (0 new, 0.5 full), lit on the right while waxing.
void _phaseDisc(AnimPainter a, Offset o, double r, double p) {
  final lit = const Color(0xFFF5F5F0), dark = const Color(0xFF37474F);
  a.circle(o, r, dark);
  final waxing = p <= 0.5;
  final half = Path()..addArc(Rect.fromCircle(center: o, radius: r), waxing ? -math.pi / 2 : math.pi / 2, math.pi);
  a.c.drawPath(half, a.fill(lit));
  final w = r * math.cos(p * tau).abs();
  final gibbous = (p > 0.25 && p < 0.75);
  a.oval(Rect.fromCenter(center: o, width: w * 2, height: r * 2), gibbous ? lit : dark);
  a.ring(o, r, Colors.white24, 1.5);
}

class _Moon extends AnimPainter {
  _Moon(super.f);

  @override
  Color get background => AC.space;

  static const names = [
    'New moon|अमावस्या|ಅಮಾವಾಸ್ಯೆ',
    'Waxing crescent|बढ़ता अर्धचंद्र|ಬೆಳೆಯುವ ಬಿದಿಗೆ',
    'First quarter|प्रथम चतुर्थांश|ಮೊದಲ ಚತುರ್ಥ',
    'Waxing gibbous|बढ़ता उत्तल चंद्र|ಬೆಳೆಯುವ ಉಬ್ಬು ಚಂದ್ರ',
    'Full moon|पूर्णिमा|ಹುಣ್ಣಿಮೆ',
    'Waning gibbous|घटता उत्तल चंद्र|ಕ್ಷೀಣಿಸುವ ಉಬ್ಬು ಚಂದ್ರ',
    'Last quarter|अंतिम चतुर्थांश|ಕೊನೆಯ ಚತುರ್ಥ',
    'Waning crescent|घटता अर्धचंद्र|ಕ್ಷೀಣಿಸುವ ಬಿದಿಗೆ',
  ];

  @override
  void draw() {
    final p = fr(t * 0.98);
    const earth = Offset(360, 300);
    for (var i = 0; i < 6; i++) {
      final y = 70 + i * 92.0;
      arrow(Offset(40, y), Offset(110, y), AC.sun, w: 3);
    }
    ring(earth, 210, Colors.white24, 2);
    // Moons all round the orbit, faded; the real one bright.
    for (var i = 0; i < 8; i++) {
      _moonAt(earth, i / 8, 0.25);
    }
    _moonAt(earth, p, 1);
    circle(earth, 52, const Color(0xFF1E88E5));
    oval(Rect.fromCenter(center: earth + const Offset(-12, -10), width: 40, height: 30), const Color(0xFF66BB6A));
    c.drawPath(Path()..addArc(Rect.fromCircle(center: earth, radius: 52), -math.pi / 2, math.pi), fill(const Color(0x99000814)));
    // As seen from the Earth.
    const view = Offset(800, 260);
    circle(view, 140, const Color(0xFF0B1426), line: Colors.white24);
    _phaseDisc(this, view, 105, p);
    text(tr(names[((p * 8) + 0.5).floor() % 8]), view + const Offset(0, 175), size: 22, color: Colors.white, weight: FontWeight.w700);
    label('Sunlight|सूर्य का प्रकाश|ಸೂರ್ಯನ ಬೆಳಕು', const Offset(76, 30));
    label('Earth|पृथ्वी|ಭೂಮಿ', earth + const Offset(0, 80), size: 15);
    label('As seen from Earth|पृथ्वी से जैसा दिखता है|ಭೂಮಿಯಿಂದ ಕಾಣುವಂತೆ', const Offset(800, 85));
    text('${tr('Day|दिन|ದಿನ')} ${(p * 29.5).round()}', const Offset(800, 480), size: 18, color: Colors.white70);
  }

  /// The Moon on its orbit at phase [p]: lit on the side facing the Sun (left).
  void _moonAt(Offset earth, double p, double opacity) {
    final a = math.pi + p * tau;
    final o = earth + Offset(math.cos(a), -math.sin(a)) * 210;
    circle(o, 24, const Color(0xFF37474F).withValues(alpha: opacity));
    c.drawPath(Path()..addArc(Rect.fromCircle(center: o, radius: 24), math.pi / 2, math.pi), fill(const Color(0xFFF5F5F0).withValues(alpha: opacity)));
  }
}

final eclipses = KxAnimation(
  id: 'eclipses',
  title: const Tr('Solar and lunar eclipses', 'सूर्य और चंद्र ग्रहण', 'ಸೂರ್ಯ ಮತ್ತು ಚಂದ್ರ ಗ್ರಹಣ'),
  subject: 'Earth Science',
  topic: 'Earth and space',
  levels: const ['Class 6', 'Class 7', 'Class 10'],
  alsoSubjects: _geo,
  keywords: const ['eclipse', 'solar eclipse', 'lunar eclipse', 'shadow', 'umbra', 'penumbra', 'moon', 'sun', 'blood moon', 'grahan', 'light'],
  seconds: 22,
  thumbT: 0.3,
  steps: const [
    AnimStep(0, Tr('Shadows in space', 'अंतरिक्ष में छायाएँ', 'ಅಂತರಿಕ್ಷದಲ್ಲಿ ನೆರಳು'),
        Tr('The Sun lights the Earth and the Moon, and each casts a long shadow into space.', 'सूर्य पृथ्वी और चंद्रमा को प्रकाशित करता है, और दोनों अंतरिक्ष में लंबी छाया डालते हैं।', 'ಸೂರ್ಯ ಭೂಮಿ ಮತ್ತು ಚಂದ್ರನನ್ನು ಬೆಳಗುತ್ತಾನೆ; ಎರಡೂ ಅಂತರಿಕ್ಷದಲ್ಲಿ ಉದ್ದ ನೆರಳು ಬೀಳಿಸುತ್ತವೆ.')),
    AnimStep(0.16, Tr('Solar eclipse', 'सूर्य ग्रहण', 'ಸೂರ್ಯ ಗ್ರಹಣ'),
        Tr('At new moon, if the Moon passes exactly between the Sun and the Earth, its shadow falls on the Earth.', 'अमावस्या पर यदि चंद्रमा ठीक सूर्य और पृथ्वी के बीच से गुज़रे, तो उसकी छाया पृथ्वी पर पड़ती है।', 'ಅಮಾವಾಸ್ಯೆಯಂದು ಚಂದ್ರ ನಿಖರವಾಗಿ ಸೂರ್ಯ ಮತ್ತು ಭೂಮಿಯ ನಡುವೆ ಹಾದರೆ ಅದರ ನೆರಳು ಭೂಮಿಯ ಮೇಲೆ ಬೀಳುತ್ತದೆ.')),
    AnimStep(0.36, Tr('Total solar eclipse', 'पूर्ण सूर्य ग्रहण', 'ಖಗ್ರಾಸ ಸೂರ್ಯ ಗ್ರಹಣ'),
        Tr('Inside the dark umbra the Sun is fully covered and its glowing corona shows. Never look at the Sun directly.', 'प्रच्छाया (अंब्रा) के भीतर सूर्य पूरा ढक जाता है और उसका चमकता कोरोना दिखता है। सूर्य को सीधे कभी न देखें।', 'ಪ್ರಚ್ಛಾಯೆಯ (ಅಂಬ್ರಾ) ಒಳಗೆ ಸೂರ್ಯ ಪೂರ್ಣ ಮುಚ್ಚಿ ಅದರ ಹೊಳೆಯುವ ಕರೋನಾ ಕಾಣುತ್ತದೆ. ಸೂರ್ಯನನ್ನು ನೇರವಾಗಿ ನೋಡಬೇಡಿ.')),
    AnimStep(0.56, Tr('Lunar eclipse', 'चंद्र ग्रहण', 'ಚಂದ್ರ ಗ್ರಹಣ'),
        Tr('At full moon, if the Earth is exactly between the Sun and the Moon, the Moon moves into the Earth’s shadow.', 'पूर्णिमा पर यदि पृथ्वी ठीक सूर्य और चंद्रमा के बीच हो, तो चंद्रमा पृथ्वी की छाया में आ जाता है।', 'ಹುಣ್ಣಿಮೆಯಂದು ಭೂಮಿ ನಿಖರವಾಗಿ ಸೂರ್ಯ ಮತ್ತು ಚಂದ್ರನ ನಡುವೆ ಇದ್ದರೆ ಚಂದ್ರ ಭೂಮಿಯ ನೆರಳನ್ನು ಪ್ರವೇಶಿಸುತ್ತಾನೆ.')),
    AnimStep(0.78, Tr('Red moon', 'लाल चंद्रमा', 'ಕೆಂಪು ಚಂದ್ರ'),
        Tr('The Moon turns a dull red: a little sunlight bends through the Earth’s air and reaches it.', 'चंद्रमा धुँधला लाल हो जाता है: थोड़ा सूर्य प्रकाश पृथ्वी के वायुमंडल से मुड़कर उस तक पहुँचता है।', 'ಚಂದ್ರ ಮಸುಕು ಕೆಂಪಾಗುತ್ತಾನೆ: ಸ್ವಲ್ಪ ಸೂರ್ಯನ ಬೆಳಕು ಭೂಮಿಯ ವಾತಾವರಣದಲ್ಲಿ ಬಾಗಿ ಅವನನ್ನು ತಲುಪುತ್ತದೆ.')),
  ],
  painter: _Eclipse.new,
);

class _Eclipse extends AnimPainter {
  _Eclipse(super.f);

  @override
  Color get background => AC.space;

  @override
  void draw() {
    final lunar = t >= 0.56;
    const sunO = Offset(-60, 300), earth = Offset(560, 300);
    for (var i = 0; i < 50; i++) {
      circle(Offset(rnd(i) * 1000, rnd(i, 1) * 600), 1 + rnd(i, 2), Colors.white.withValues(alpha: 0.4));
    }
    sun(sunO, 170);
    // Earth's shadow, to the right.
    fillPath(Path()..moveTo(earth.dx, earth.dy - 60)..lineTo(1000, earth.dy - 34)..lineTo(1000, earth.dy + 34)..lineTo(earth.dx, earth.dy + 60)..close(), const Color(0x66000000));
    fillPath(Path()..moveTo(earth.dx, earth.dy - 60)..lineTo(1000, earth.dy - 100)..lineTo(1000, earth.dy + 100)..lineTo(earth.dx, earth.dy + 60)..close(), const Color(0x33000000));
    circle(earth, 60, const Color(0xFF1E88E5));
    oval(Rect.fromCenter(center: earth + const Offset(-10, -14), width: 50, height: 34), const Color(0xFF66BB6A));
    c.drawPath(Path()..addArc(Rect.fromCircle(center: earth, radius: 60), -math.pi / 2, math.pi), fill(const Color(0x99000814)));

    if (!lunar) {
      // The Moon crosses the Sun–Earth line.
      final m = Offset(360, 300 + 240 * (1 - ease(seg(t, 0.06, 0.34))) - 240 * ease(seg(t, 0.48, 0.56)));
      // Umbra and penumbra cones from the Moon to the Earth.
      if ((m.dy - 300).abs() < 60) {
        fillPath(Path()..moveTo(m.dx, m.dy - 40)..lineTo(earth.dx - 58, m.dy - 70 + (m.dy - 300) * 0.4)..lineTo(earth.dx - 58, m.dy + 70 + (m.dy - 300) * 0.4)..lineTo(m.dx, m.dy + 40)..close(), const Color(0x44000000));
        fillPath(Path()..moveTo(m.dx, m.dy - 18)..lineTo(earth.dx - 59, m.dy - 6 + (m.dy - 300) * 0.4)..lineTo(earth.dx - 59, m.dy + 6 + (m.dy - 300) * 0.4)..lineTo(m.dx, m.dy + 18)..close(), const Color(0xAA000000));
      }
      circle(m, 20, const Color(0xFFBDBDBD));
      c.drawPath(Path()..addArc(Rect.fromCircle(center: m, radius: 20), -math.pi / 2, math.pi), fill(const Color(0x99000814)));
      label('Moon|चंद्रमा|ಚಂದ್ರ', m + const Offset(0, -46), size: 15);
      // As seen from the Earth.
      _view((m.dy - 300) / 240, false);
      label('Umbra|प्रच्छाया|ಪ್ರಚ್ಛಾಯೆ', const Offset(450, 200), to: Offset(470, m.dy - 4), opacity: (m.dy - 300).abs() < 10 ? 1 : 0);
      label('Penumbra|उपच्छाया|ಉಪಚ್ಛಾಯೆ', const Offset(420, 420), to: Offset(470, m.dy + 30), opacity: (m.dy - 300).abs() < 10 ? 1 : 0);
    } else {
      final x = 680 + 240 * ease(seg(t, 0.56, 0.86));
      final m = Offset(x, 300 - 140 * (1 - ease(seg(t, 0.56, 0.8))));
      final inShadow = (1 - ((m.dy - 300).abs() / 60).clamp(0.0, 1.0));
      circle(m, 22, Color.lerp(const Color(0xFFF5F5F0), const Color(0xFFB0412E), inShadow)!);
      label('Moon|चंद्रमा|ಚಂದ್ರ', m + const Offset(0, -46), size: 15);
      label("Earth's shadow|पृथ्वी की छाया|ಭೂಮಿಯ ನೆರಳು", const Offset(800, 430), to: const Offset(800, 330));
      _view(inShadow, true);
    }
    label('Sun|सूर्य|ಸೂರ್ಯ', const Offset(60, 520));
    label('Earth|पृथ्वी|ಭೂಮಿ', earth + const Offset(0, 90), size: 15);
  }

  /// A round "view from Earth" window: the Sun with the Moon sliding over it ([k] -1..1, 0 = centred),
  /// or the Moon reddening ([k] 0..1).
  void _view(double k, bool lunar) {
    const o = Offset(860, 110);
    circle(o, 80, const Color(0xFF0B1426), line: Colors.white38, w: 2);
    c.save();
    c.clipPath(Path()..addOval(Rect.fromCircle(center: o, radius: 79)));
    if (!lunar) {
      final total = k.abs() < 0.04;
      if (total) {
        c.drawCircle(o, 70, Paint()..shader = RadialGradient(colors: [Colors.white, Colors.white.withValues(alpha: 0)], stops: const [0.6, 1]).createShader(Rect.fromCircle(center: o, radius: 70)));
      }
      circle(o, 44, const Color(0xFFFFD54F));
      circle(o + Offset(0, k * 110), 46, const Color(0xFF0B1426));
    } else {
      circle(o, 46, Color.lerp(const Color(0xFFF5F5F0), const Color(0xFFB0412E), k)!);
    }
    c.restore();
    label('As seen from Earth|पृथ्वी से|ಭೂಮಿಯಿಂದ', o + const Offset(0, 100), size: 14);
  }
}
