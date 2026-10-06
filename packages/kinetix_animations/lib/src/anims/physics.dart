import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../draw.dart';
import '../model.dart';

// Current in a circuit, the generator, waves, and refraction.

final circuit = KxAnimation(
  id: 'electric-circuit',
  title: const Tr('Electric current in a circuit', 'परिपथ में विद्युत धारा', 'ಮಂಡಲದಲ್ಲಿ ವಿದ್ಯುತ್ ಪ್ರವಾಹ'),
  subject: 'Physics',
  topic: 'Electricity',
  levels: const ['Class 6', 'Class 7', 'Class 10'],
  keywords: const ['electric current', 'circuit', 'electrons', 'battery', 'cell', 'switch', 'bulb', 'conventional current', 'conductor', 'electricity'],
  seconds: 18,
  thumbT: 0.75,
  steps: const [
    AnimStep(0, Tr('An open circuit', 'खुला परिपथ', 'ತೆರೆದ ಮಂಡಲ'),
        Tr('A cell, a switch, a bulb and wires. With the switch open, the path is broken and no current flows.', 'एक सेल, स्विच, बल्ब और तार। स्विच खुला होने पर रास्ता टूटा है और धारा नहीं बहती।', 'ಒಂದು ಕೋಶ, ಸ್ವಿಚ್, ಬಲ್ಬ್ ಮತ್ತು ತಂತಿಗಳು. ಸ್ವಿಚ್ ತೆರೆದಿದ್ದರೆ ದಾರಿ ಮುರಿದಿದೆ, ಪ್ರವಾಹ ಹರಿಯದು.')),
    AnimStep(0.2, Tr('Switch closed', 'स्विच बंद', 'ಸ್ವಿಚ್ ಮುಚ್ಚಿದೆ'),
        Tr('Closing the switch completes the path: now it is a closed circuit.', 'स्विच बंद करने से रास्ता पूरा होता है: अब यह बंद परिपथ है।', 'ಸ್ವಿಚ್ ಮುಚ್ಚಿದಾಗ ದಾರಿ ಪೂರ್ಣವಾಗುತ್ತದೆ: ಈಗ ಇದು ಮುಚ್ಚಿದ ಮಂಡಲ.')),
    AnimStep(0.36, Tr('Electrons flow', 'इलेक्ट्रॉन बहते हैं', 'ಇಲೆಕ್ಟ್ರಾನ್‌ಗಳ ಹರಿವು'),
        Tr('The cell pushes electrons out of its negative terminal, round the wires, and back into its positive terminal.', 'सेल इलेक्ट्रॉनों को ऋण सिरे से बाहर धकेलता है; वे तारों में घूमकर धन सिरे पर लौटते हैं।', 'ಕೋಶವು ಇಲೆಕ್ಟ್ರಾನ್‌ಗಳನ್ನು ಋಣ ತುದಿಯಿಂದ ಹೊರತಳ್ಳುತ್ತದೆ; ಅವು ತಂತಿಗಳಲ್ಲಿ ಸುತ್ತಿ ಧನ ತುದಿಗೆ ಮರಳುತ್ತವೆ.')),
    AnimStep(0.56, Tr('Conventional current', 'परंपरागत धारा', 'ಸಾಂಪ್ರದಾಯಿಕ ಪ್ರವಾಹ'),
        Tr('By convention, current is shown flowing the other way: from + to −, opposite to the electrons.', 'परंपरा से धारा उलटी दिशा में दिखाई जाती है: + से − की ओर, इलेक्ट्रॉनों के विपरीत।', 'ಸಂಪ್ರದಾಯದಂತೆ ಪ್ರವಾಹವನ್ನು ವಿರುದ್ಧ ದಿಕ್ಕಿನಲ್ಲಿ ತೋರಿಸಲಾಗುತ್ತದೆ: + ನಿಂದ − ಕಡೆಗೆ, ಇಲೆಕ್ಟ್ರಾನ್‌ಗಳಿಗೆ ವಿರುದ್ಧ.')),
    AnimStep(0.78, Tr('Energy in the bulb', 'बल्ब में ऊर्जा', 'ಬಲ್ಬ್‌ನಲ್ಲಿ ಶಕ್ತಿ'),
        Tr('In the thin filament the electrical energy becomes heat and light, so the bulb glows.', 'पतले तंतु में विद्युत ऊर्जा ऊष्मा और प्रकाश में बदलती है, इसलिए बल्ब चमकता है।', 'ತೆಳು ತಂತುವಿನಲ್ಲಿ ವಿದ್ಯುತ್ ಶಕ್ತಿ ಶಾಖ ಮತ್ತು ಬೆಳಕಾಗುತ್ತದೆ; ಬಲ್ಬ್ ಬೆಳಗುತ್ತದೆ.')),
  ],
  painter: _Circuit.new,
);

class _Circuit extends AnimPainter {
  _Circuit(super.f);

  // Electron route: out of − (bottom of the cell), round, into + (top).
  static final route = Path()
    ..moveTo(200, 340)
    ..lineTo(200, 460)
    ..lineTo(800, 460)
    ..lineTo(800, 140)
    ..lineTo(200, 140)
    ..lineTo(200, 260);

  @override
  void draw() {
    final closed = ease(seg(t, 0.2, 0.26));
    final on = t >= 0.24;
    // Wires (gap at the switch until it closes).
    path(Path()..moveTo(200, 340)..lineTo(200, 460)..lineTo(450, 460), AC.copper, 7);
    path(Path()..moveTo(560, 460)..lineTo(800, 460)..lineTo(800, 140)..lineTo(200, 140)..lineTo(200, 260), AC.copper, 7);
    // Switch: a lever from 450 to 560.
    final ang = -0.6 * (1 - closed);
    final tip = const Offset(450, 460) + Offset(math.cos(ang), math.sin(ang)) * 110;
    line(const Offset(450, 460), tip, AC.ink, 7);
    circle(const Offset(450, 460), 9, Colors.white, line: AC.ink, w: 3);
    circle(const Offset(560, 460), 9, Colors.white, line: AC.ink, w: 3);
    // Cell: long + plate on top, short − plate below.
    rect(const Rect.fromLTWH(150, 255, 100, 90), AC.paper);
    line(const Offset(140, 280), const Offset(260, 280), AC.ink, 6);
    line(const Offset(170, 320), const Offset(230, 320), AC.ink, 12);
    text('+', const Offset(280, 270), size: 30, color: AC.red, weight: FontWeight.w700);
    text('−', const Offset(280, 330), size: 30, color: AC.blue, weight: FontWeight.w700);
    // Bulb.
    final glow = on ? 0.3 + 0.7 * seg(t, 0.25, 0.4) : 0.0;
    if (glow > 0) {
      c.drawCircle(const Offset(500, 110), 110, Paint()..shader = RadialGradient(colors: [const Color(0xFFFFF59D).withValues(alpha: glow), const Color(0x00FFF59D)]).createShader(Rect.fromCircle(center: const Offset(500, 110), radius: 110)));
    }
    rect(const Rect.fromLTWH(470, 128, 60, 24), const Color(0xFF9E9E9E), radius: 4);
    circle(const Offset(500, 90), 46, Color.lerp(Colors.white, const Color(0xFFFFF176), glow)!, line: AC.ink, w: 3);
    final fil = Path()..moveTo(482, 128)..lineTo(482, 95);
    for (var i = 0; i < 6; i++) {
      fil.lineTo(485 + i * 6.0, i.isEven ? 85 : 100);
    }
    fil.lineTo(518, 95);
    fil.lineTo(518, 128);
    path(fil, Color.lerp(AC.ink, const Color(0xFFFF8F00), glow)!, 2.5);
    if (t >= 0.78) {
      for (var i = 0; i < 8; i++) {
        final a = i / 8 * tau;
        final k = fr(t * 4 + i / 8);
        line(polar(const Offset(500, 90), 58 + 14 * k, a), polar(const Offset(500, 90), 70 + 14 * k, a), AC.sun.withValues(alpha: 1 - k), 4);
      }
    }
    // Electrons: drift around when the circuit is closed; jiggle in place when open.
    final drift = on ? seg(t, 0.24, 1) * 3 : 0.0;
    for (var i = 0; i < 30; i++) {
      final k = fr(i / 30 + drift);
      var p = along(route, k);
      if (!on) p += Offset(math.sin(t * 80 + i), math.cos(t * 70 + i * 2)) * 3;
      circle(p, 7, AC.electron.withValues(alpha: t >= 0.56 && t < 0.78 ? 0.45 : 1), line: Colors.white, w: 1.5);
      if (f.labels && i % 6 == 0) text('−', p, size: 11, color: Colors.white, weight: FontWeight.w700);
    }
    // Conventional current arrows.
    if (t >= 0.56) {
      final o = t < 0.78 ? 1.0 : 0.5;
      arrow(const Offset(280, 140), const Offset(380, 140), AC.red, w: 5, opacity: o);
      arrow(const Offset(800, 220), const Offset(800, 340), AC.red, w: 5, opacity: o);
      arrow(const Offset(720, 460), const Offset(620, 460), AC.red, w: 5, opacity: o);
      arrow(const Offset(200, 430), const Offset(200, 370), AC.red, w: 5, opacity: o);
    }
    if (t >= 0.36 && t < 0.56) {
      arrow(const Offset(380, 160), const Offset(280, 160), AC.electron, w: 4);
      arrow(const Offset(620, 440), const Offset(720, 440), AC.electron, w: 4);
    }
    label('Cell|सेल|ಕೋಶ', const Offset(90, 300));
    label('Bulb|बल्ब|ಬಲ್ಬ್', const Offset(640, 70), to: const Offset(540, 90));
    label(closed > 0.5 ? 'Switch (closed)|स्विच (बंद)|ಸ್ವಿಚ್ (ಮುಚ್ಚಿದೆ)' : 'Switch (open)|स्विच (खुला)|ಸ್ವಿಚ್ (ತೆರೆದಿದೆ)', const Offset(505, 520));
    label('Electrons|इलेक्ट्रॉन|ಇಲೆಕ್ಟ್ರಾನ್‌ಗಳು', const Offset(880, 300), color: AC.electron, opacity: t >= 0.36 ? 1 : 0.6);
    label('Current (+ to −)|धारा (+ से −)|ಪ್ರವಾಹ (+ ನಿಂದ −)', const Offset(880, 380), color: AC.red, opacity: t >= 0.56 ? 1 : 0);
    label('Connecting wire|संयोजी तार|ಸಂಪರ್ಕ ತಂತಿ', const Offset(330, 100), to: const Offset(330, 136), size: 15);
  }
}

final generator = KxAnimation(
  id: 'em-induction-generator',
  title: const Tr('Electromagnetic induction: the generator', 'विद्युत चुंबकीय प्रेरण: जनित्र', 'ವಿದ್ಯುತ್ಕಾಂತೀಯ ಪ್ರೇರಣೆ: ಜನಕ'),
  subject: 'Physics',
  topic: 'Magnetism',
  levels: const ['Class 10', 'Class 12'],
  keywords: const ['electromagnetic induction', 'generator', 'dynamo', 'faraday', 'coil', 'magnetic field', 'flux', 'alternating current', 'ac', 'slip rings', 'magnetic effects of current'],
  seconds: 20,
  thumbT: 0.5,
  steps: const [
    AnimStep(0, Tr('Coil in a magnetic field', 'चुंबकीय क्षेत्र में कुंडली', 'ಕಾಂತಕ್ಷೇತ್ರದಲ್ಲಿ ಸುರುಳಿ'),
        Tr('A coil of wire sits between the north and south poles of a magnet, where field lines run from N to S.', 'तार की एक कुंडली चुंबक के उत्तर और दक्षिण ध्रुवों के बीच है, जहाँ क्षेत्र रेखाएँ N से S की ओर जाती हैं।', 'ತಂತಿಯ ಸುರುಳಿ ಕಾಂತದ ಉತ್ತರ ಮತ್ತು ದಕ್ಷಿಣ ಧ್ರುವಗಳ ನಡುವೆ ಇದೆ; ಅಲ್ಲಿ ಕ್ಷೇತ್ರ ರೇಖೆಗಳು N ನಿಂದ S ಕಡೆಗೆ ಸಾಗುತ್ತವೆ.')),
    AnimStep(0.2, Tr('Turning the coil', 'कुंडली घुमाना', 'ಸುರುಳಿ ತಿರುಗಿಸುವುದು'),
        Tr('As the coil turns, the amount of magnetic field passing through it keeps changing.', 'कुंडली घूमती है तो उससे गुज़रने वाले चुंबकीय क्षेत्र की मात्रा बदलती रहती है।', 'ಸುರುಳಿ ತಿರುಗಿದಂತೆ ಅದರ ಮೂಲಕ ಹಾದುಹೋಗುವ ಕಾಂತಕ್ಷೇತ್ರದ ಪ್ರಮಾಣ ಬದಲಾಗುತ್ತಲೇ ಇರುತ್ತದೆ.')),
    AnimStep(0.42, Tr('Induced current', 'प्रेरित धारा', 'ಪ್ರೇರಿತ ಪ್ರವಾಹ'),
        Tr('A changing field induces a current in the coil. The meter’s needle moves and the bulb lights.', 'बदलता क्षेत्र कुंडली में धारा प्रेरित करता है। मीटर की सुई हिलती है और बल्ब जलता है।', 'ಬದಲಾಗುವ ಕ್ಷೇತ್ರ ಸುರುಳಿಯಲ್ಲಿ ಪ್ರವಾಹ ಪ್ರೇರಿಸುತ್ತದೆ. ಮೀಟರ್ ಮುಳ್ಳು ಚಲಿಸುತ್ತದೆ, ಬಲ್ಬ್ ಬೆಳಗುತ್ತದೆ.')),
    AnimStep(0.66, Tr('Alternating current', 'प्रत्यावर्ती धारा', 'ಪರ್ಯಾಯ ಪ್ರವಾಹ'),
        Tr('Every half turn the current reverses: this is alternating current (AC), a sine wave.', 'हर आधे चक्कर में धारा उलट जाती है: यह प्रत्यावर्ती धारा (AC) है, एक ज्या तरंग।', 'ಪ್ರತಿ ಅರ್ಧ ಸುತ್ತಿಗೆ ಪ್ರವಾಹ ದಿಕ್ಕು ಬದಲಿಸುತ್ತದೆ: ಇದು ಪರ್ಯಾಯ ಪ್ರವಾಹ (AC), ಒಂದು ಸೈನ್ ಅಲೆ.')),
  ],
  painter: _Generator.new,
);

class _Generator extends AnimPainter {
  _Generator(super.f);

  @override
  void draw() {
    final turning = t >= 0.2;
    final theta = turning ? (t - 0.2) * tau * 5 : 0.0;
    final emf = math.sin(theta);
    // Magnets.
    rect(const Rect.fromLTWH(40, 150, 130, 200), AC.red, radius: 10);
    rect(const Rect.fromLTWH(630, 150, 130, 200), AC.blue, radius: 10);
    text('N', const Offset(105, 250), size: 56, color: Colors.white, weight: FontWeight.w700);
    text('S', const Offset(695, 250), size: 56, color: Colors.white, weight: FontWeight.w700);
    for (var i = 0; i < 5; i++) {
      final y = 175 + i * 37.5;
      dashed(Offset(175, y), Offset(625, y), AC.muted.withValues(alpha: 0.6));
      arrow(Offset(390 + 20 * fr(t * 3), y), Offset(420 + 20 * fr(t * 3), y), AC.muted.withValues(alpha: 0.7), w: 2, head: 9);
    }
    // The coil, seen at an angle: a rectangle whose width follows cos θ.
    const cx = 400.0;
    final half = 120 * math.cos(theta);
    final front = math.sin(theta) >= 0;
    final coil = Rect.fromLTRB(cx - half.abs(), 170, cx + half.abs(), 330);
    final current = turning && t >= 0.42 ? emf : 0.0;
    final wire = Color.lerp(AC.copper, const Color(0xFFFF6F00), current.abs())!;
    rect(coil, Colors.transparent, line: wire, w: 8);
    if (current.abs() > 0.15) {
      final dir = current > 0 ? 1.0 : -1.0;
      final sideA = (front ? 1 : -1) * dir;
      arrow(Offset(coil.left, 250 + 30 * sideA), Offset(coil.left, 250 - 30 * sideA), const Color(0xFFFF6F00), w: 4, head: 12);
      arrow(Offset(coil.right, 250 - 30 * sideA), Offset(coil.right, 250 + 30 * sideA), const Color(0xFFFF6F00), w: 4, head: 12);
    }
    // Axle, slip rings and brushes.
    line(const Offset(cx, 330), const Offset(cx, 430), AC.ink, 6);
    line(const Offset(cx, 120), const Offset(cx, 170), AC.ink, 6);
    for (final y in [395.0, 420.0]) {
      oval(Rect.fromCenter(center: Offset(cx, y), width: 60, height: 16), AC.copper, line: AC.ink, w: 1.5);
    }
    rect(const Rect.fromLTWH(cx + 32, 388, 22, 14), AC.ink, radius: 3);
    rect(const Rect.fromLTWH(cx - 54, 413, 22, 14), AC.ink, radius: 3);
    // Handle.
    final h = Offset(cx, 115) + Offset(math.cos(theta) * 40, 0);
    line(const Offset(cx, 115), h, AC.ink, 6);
    circle(h, 8, AC.glucose);
    if (turning) arrowPath(Path()..addArc(Rect.fromCenter(center: const Offset(cx, 115), width: 120, height: 40), 0.3, 2.4), AC.accent, w: 3);
    // External circuit: a meter and a bulb.
    path(Path()..moveTo(cx + 54, 395)..lineTo(560, 395)..lineTo(560, 470), AC.ink, 3);
    path(Path()..moveTo(cx - 54, 420)..lineTo(250, 420)..lineTo(250, 470), AC.ink, 3);
    const meter = Offset(330, 520);
    circle(meter, 46, Colors.white, line: AC.ink, w: 3);
    line(meter, polar(meter, 36, -math.pi / 2 + current * 0.9), AC.red, 3);
    text('G', meter + const Offset(0, 22), size: 16, weight: FontWeight.w700);
    path(Path()..moveTo(250, 470)..lineTo(250, 520)..lineTo(284, 520), AC.ink, 3);
    path(Path()..moveTo(376, 520)..lineTo(470, 520), AC.ink, 3);
    final g = current.abs();
    if (g > 0.05) {
      c.drawCircle(const Offset(500, 520), 50, Paint()..shader = RadialGradient(colors: [const Color(0xFFFFF59D).withValues(alpha: g), const Color(0x00FFF59D)]).createShader(Rect.fromCircle(center: const Offset(500, 520), radius: 50)));
    }
    circle(const Offset(500, 520), 26, Color.lerp(Colors.white, const Color(0xFFFFF176), g)!, line: AC.ink, w: 2);
    path(Path()..moveTo(526, 520)..lineTo(560, 520)..lineTo(560, 470), AC.ink, 3);

    // Output graph.
    const gr = Rect.fromLTWH(800, 180, 180, 260);
    rect(gr, Colors.white, line: AC.line, radius: 12);
    line(Offset(gr.left + 10, gr.center.dy), Offset(gr.right - 10, gr.center.dy), AC.muted, 1.5);
    if (t >= 0.42) {
      final p = Path();
      final span = seg(t, 0.42, 1);
      for (var i = 0; i <= 100; i++) {
        final k = i / 100 * span;
        final th = (0.42 + k * 0.58 - 0.2) * tau * 5;
        final q = Offset(gr.left + 10 + (gr.width - 20) * k / 1, gr.center.dy - 90 * math.sin(th));
        i == 0 ? p.moveTo(q.dx, q.dy) : p.lineTo(q.dx, q.dy);
      }
      path(p, const Color(0xFFFF6F00), 3);
    }
    text(tr('Current|धारा|ಪ್ರವಾಹ'), Offset(gr.center.dx, gr.top + 18), size: 15, color: AC.muted);
    text(tr('time →|समय →|ಸಮಯ →'), Offset(gr.center.dx, gr.bottom - 16), size: 13, color: AC.muted);

    label('Coil|कुंडली|ಸುರುಳಿ', const Offset(560, 110), to: Offset(coil.right, 190));
    label('Field lines|क्षेत्र रेखाएँ|ಕ್ಷೇತ್ರ ರೇಖೆಗಳು', const Offset(250, 370), to: const Offset(250, 325), size: 15);
    label('Slip rings and brushes|सर्पी वलय और ब्रश|ಜಾರು ಉಂಗುರ ಮತ್ತು ಕುಂಚ', const Offset(140, 470), to: const Offset(cx - 30, 420), size: 14);
    label('Galvanometer|गैल्वेनोमीटर|ಗ್ಯಾಲ್ವನೋಮೀಟರ್', meter + const Offset(-150, 0), size: 14);
    label('AC output|AC निर्गत|AC ಉತ್ಪತ್ತಿ', Offset(gr.center.dx, gr.bottom + 20), size: 15, opacity: t >= 0.66 ? 1 : 0.4);
  }
}

final waves = KxAnimation(
  id: 'waves',
  title: const Tr('Transverse and longitudinal waves', 'अनुप्रस्थ और अनुदैर्ध्य तरंगें', 'ಅಡ್ಡ ಮತ್ತು ಉದ್ದ ಅಲೆಗಳು'),
  subject: 'Physics',
  topic: 'Waves, sound and light',
  levels: const ['Class 8', 'Class 9', 'Class 11'],
  keywords: const ['waves', 'transverse', 'longitudinal', 'wavelength', 'amplitude', 'crest', 'trough', 'compression', 'rarefaction', 'sound', 'frequency'],
  seconds: 16,
  thumbT: 0.6,
  steps: const [
    AnimStep(0, Tr('Transverse wave', 'अनुप्रस्थ तरंग', 'ಅಡ್ಡ ಅಲೆ'),
        Tr('The particles move up and down while the wave travels along: like a wave on a rope, or light.', 'कण ऊपर-नीचे चलते हैं जबकि तरंग आगे बढ़ती है: जैसे रस्सी पर तरंग, या प्रकाश।', 'ಕಣಗಳು ಮೇಲೆ-ಕೆಳಗೆ ಚಲಿಸುತ್ತವೆ, ಅಲೆ ಮುಂದೆ ಸಾಗುತ್ತದೆ: ಹಗ್ಗದ ಮೇಲಿನ ಅಲೆ ಅಥವಾ ಬೆಳಕಿನಂತೆ.')),
    AnimStep(0.25, Tr('Crest and trough', 'शृंग और गर्त', 'ಶೃಂಗ ಮತ್ತು ತಗ್ಗು'),
        Tr('High points are crests, low points troughs. The wavelength is the distance from one crest to the next; the amplitude is the height.', 'ऊँचे बिंदु शृंग और नीचे के गर्त हैं। एक शृंग से अगले तक की दूरी तरंगदैर्ध्य है; ऊँचाई आयाम है।', 'ಎತ್ತರದ ಬಿಂದುಗಳು ಶೃಂಗ, ಕೆಳಗಿನವು ತಗ್ಗು. ಒಂದು ಶೃಂಗದಿಂದ ಮುಂದಿನದಕ್ಕೆ ದೂರ ತರಂಗಾಂತರ; ಎತ್ತರ ಕಂಪನಾಂಕ.')),
    AnimStep(0.5, Tr('Longitudinal wave', 'अनुदैर्ध्य तरंग', 'ಉದ್ದ ಅಲೆ'),
        Tr('Here the particles move back and forth along the direction of the wave: like sound in air, or a pushed spring.', 'यहाँ कण तरंग की दिशा में आगे-पीछे चलते हैं: जैसे हवा में ध्वनि, या धकेली गई स्प्रिंग।', 'ಇಲ್ಲಿ ಕಣಗಳು ಅಲೆಯ ದಿಕ್ಕಿನಲ್ಲೇ ಮುಂದೆ-ಹಿಂದೆ ಚಲಿಸುತ್ತವೆ: ಗಾಳಿಯಲ್ಲಿ ಶಬ್ದ ಅಥವಾ ತಳ್ಳಿದ ಸ್ಪ್ರಿಂಗ್‌ನಂತೆ.')),
    AnimStep(0.75, Tr('Compressions', 'संपीडन', 'ಸಂಪೀಡನ'),
        Tr('Crowded regions are compressions and spread-out regions are rarefactions. Each particle only wobbles about its place.', 'घनी जगहें संपीडन और विरल जगहें विरलन हैं। हर कण अपनी जगह के आसपास ही डोलता है।', 'ದಟ್ಟ ಭಾಗಗಳು ಸಂಪೀಡನ, ವಿರಳ ಭಾಗಗಳು ವಿರಳನ. ಪ್ರತಿ ಕಣ ತನ್ನ ಸ್ಥಳದ ಸುತ್ತ ಮಾತ್ರ ಕಂಪಿಸುತ್ತದೆ.')),
  ],
  painter: _Waves.new,
);

class _Waves extends AnimPainter {
  _Waves(super.f);

  static const k = tau / 300; // wavelength 300

  @override
  void draw() {
    final ph = t * tau * 8;
    final topOn = t < 0.5;
    // Transverse: beads on a rope.
    const y0 = 170.0, amp = 70.0;
    final rope = Path();
    for (var x = 40.0; x <= 960; x += 6) {
      final y = y0 - amp * math.sin(k * x - ph);
      x == 40 ? rope.moveTo(x, y) : rope.lineTo(x, y);
    }
    path(rope, AC.muted.withValues(alpha: topOn ? 1 : 0.4), 2);
    for (var i = 0; i < 31; i++) {
      final x = 40 + i * 30.0;
      final y = y0 - amp * math.sin(k * x - ph);
      circle(Offset(x, y), i == 10 ? 10 : 7, i == 10 ? AC.red : AC.blue.withValues(alpha: topOn ? 1 : 0.4));
    }
    if (topOn) arrow(const Offset(760, 40), const Offset(900, 40), AC.accent, w: 4);
    final mark = seg(t, 0.25, 0.3) * (topOn ? 1 : 0.35);
    if (mark > 0) {
      // A crest and trough near the middle, the wavelength between two crests.
      final x0 = (ph / k) % 300 + 75;
      final xc = x0 < 340 ? x0 + 300 : x0;
      dashed(Offset(xc, y0 - amp), Offset(xc + 300, y0 - amp), AC.ink.withValues(alpha: mark));
      label('Wavelength (λ)|तरंगदैर्ध्य (λ)|ತರಂಗಾಂತರ (λ)', Offset(xc + 150, y0 - amp - 22), size: 15, opacity: mark);
      label('Crest|शृंग|ಶೃಂಗ', Offset(xc, y0 - amp - 22), size: 14, opacity: mark);
      label('Trough|गर्त|ತಗ್ಗು', Offset(xc + 150, y0 + amp + 24), size: 14, opacity: mark);
      arrow(Offset(100, y0), const Offset(100, y0 - amp), AC.purple.withValues(alpha: mark), w: 3, head: 10);
      label('Amplitude|आयाम|ಕಂಪನಾಂಕ', const Offset(100, y0 + 20), size: 13, opacity: mark);
    }
    label('Transverse|अनुप्रस्थ|ಅಡ್ಡ', const Offset(90, 40), size: 20, opacity: topOn ? 1 : 0.5);
    arrow(Offset(40 + 10 * 30.0 + 26, y0 - 26), Offset(40 + 10 * 30.0 + 26, y0 + 26), AC.red.withValues(alpha: topOn ? 0.8 : 0.3), w: 2, head: 8);
    arrow(Offset(40 + 10 * 30.0 + 26, y0 + 26), Offset(40 + 10 * 30.0 + 26, y0 - 26), AC.red.withValues(alpha: topOn ? 0.8 : 0.3), w: 2, head: 8);

    // Longitudinal: layers of particles bunching along the line.
    final botOn = t >= 0.5;
    const yb = 450.0;
    for (var i = 0; i < 46; i++) {
      final x0 = 40 + i * 20.0;
      final x = x0 + 16 * math.sin(k * x0 - ph);
      final col = i == 15 ? AC.red : AC.glucose.withValues(alpha: botOn ? 1 : 0.4);
      line(Offset(x, yb - 60), Offset(x, yb + 60), col, i == 15 ? 5 : 3);
    }
    if (botOn) arrow(const Offset(760, 340), const Offset(900, 340), AC.accent, w: 4);
    final mark2 = seg(t, 0.75, 0.8);
    if (mark2 > 0) {
      // Where layers bunch: sin derivative most negative → compression at k x − ph = π (mod 2π).
      final xc = ((ph + math.pi) / k) % 300 + 40;
      for (var x = xc; x < 960; x += 300) {
        label('C|C|C', Offset(x, yb + 85), size: 15, opacity: mark2, color: AC.red);
        label('R|R|R', Offset(x + 150 < 960 ? x + 150 : x - 150, yb + 85), size: 15, opacity: mark2, color: AC.blue);
      }
      label('C = compression, R = rarefaction|C = संपीडन, R = विरलन|C = ಸಂಪೀಡನ, R = ವಿರಳನ', const Offset(500, 580), size: 15, opacity: mark2);
    }
    label('Longitudinal|अनुदैर्ध्य|ಉದ್ದ', const Offset(100, 340), size: 20, opacity: botOn ? 1 : 0.5);
    label('Wave travels →|तरंग आगे बढ़ती है →|ಅಲೆ ಸಾಗುತ್ತದೆ →', const Offset(830, 300), size: 14, opacity: botOn ? 1 : 0);
  }
}

final refraction = KxAnimation(
  id: 'refraction',
  title: const Tr('Refraction of light', 'प्रकाश का अपवर्तन', 'ಬೆಳಕಿನ ವಕ್ರೀಭವನ'),
  subject: 'Physics',
  topic: 'Waves, sound and light',
  levels: const ['Class 8', 'Class 10', 'Class 12'],
  keywords: const ['refraction', 'light', 'glass slab', 'normal', 'angle of incidence', 'angle of refraction', 'snell', 'refractive index', 'lateral displacement', 'optics'],
  seconds: 18,
  thumbT: 0.85,
  steps: const [
    AnimStep(0, Tr('Light in air', 'हवा में प्रकाश', 'ಗಾಳಿಯಲ್ಲಿ ಬೆಳಕು'),
        Tr('A ray of light travels in a straight line through air towards a glass slab.', 'प्रकाश की किरण हवा में सीधी रेखा में काँच की पट्टी की ओर चलती है।', 'ಬೆಳಕಿನ ಕಿರಣ ಗಾಳಿಯಲ್ಲಿ ನೇರ ರೇಖೆಯಲ್ಲಿ ಗಾಜಿನ ಚಪ್ಪಡಿಯತ್ತ ಸಾಗುತ್ತದೆ.')),
    AnimStep(0.25, Tr('Into glass', 'काँच में प्रवेश', 'ಗಾಜಿನೊಳಗೆ'),
        Tr('Light slows down in glass, so it bends towards the normal: the angle of refraction r is smaller than the angle of incidence i.', 'काँच में प्रकाश धीमा होता है, इसलिए अभिलंब की ओर मुड़ता है: अपवर्तन कोण r आपतन कोण i से छोटा होता है।', 'ಗಾಜಿನಲ್ಲಿ ಬೆಳಕು ನಿಧಾನವಾಗುತ್ತದೆ, ಆದ್ದರಿಂದ ಲಂಬದತ್ತ ಬಾಗುತ್ತದೆ: ವಕ್ರೀಭವನ ಕೋನ r ಪತನ ಕೋನ i ಗಿಂತ ಚಿಕ್ಕದು.')),
    AnimStep(0.5, Tr('Out of glass', 'काँच से बाहर', 'ಗಾಜಿನಿಂದ ಹೊರಗೆ'),
        Tr('Leaving the glass it speeds up and bends away from the normal. It comes out parallel to the incident ray, shifted sideways.', 'काँच से निकलते समय यह तेज़ होकर अभिलंब से दूर मुड़ती है। यह आपतित किरण के समानांतर, कुछ खिसककर निकलती है।', 'ಗಾಜಿನಿಂದ ಹೊರಬರುವಾಗ ವೇಗ ಹೆಚ್ಚಿ ಲಂಬದಿಂದ ದೂರ ಬಾಗುತ್ತದೆ. ಅದು ಪತನ ಕಿರಣಕ್ಕೆ ಸಮಾಂತರವಾಗಿ, ಸ್ವಲ್ಪ ಪಕ್ಕಕ್ಕೆ ಸರಿದು ಹೊರಬರುತ್ತದೆ.')),
    AnimStep(0.75, Tr("Snell's law", 'स्नेल का नियम', 'ಸ್ನೆಲ್ ನಿಯಮ'),
        Tr('sin i ÷ sin r is constant for two media: the refractive index (about 1.5 for glass).', 'दो माध्यमों के लिए sin i ÷ sin r स्थिर रहता है: यही अपवर्तनांक है (काँच के लिए लगभग 1.5)।', 'ಎರಡು ಮಾಧ್ಯಮಗಳಿಗೆ sin i ÷ sin r ಸ್ಥಿರ: ಅದೇ ವಕ್ರೀಭವನ ಸೂಚ್ಯಂಕ (ಗಾಜಿಗೆ ಸುಮಾರು 1.5).')),
  ],
  painter: _Refraction.new,
);

class _Refraction extends AnimPainter {
  _Refraction(super.f);

  static const i = 50 * math.pi / 180;
  static final r = math.asin(math.sin(i) / 1.5);
  static const p1 = Offset(380, 230);
  static final p2 = Offset(380 + 190 * math.tan(r), 420);
  static final start = p1 - Offset(math.sin(i), math.cos(i)) * 260;
  static final end = p2 + Offset(math.sin(i), math.cos(i)) * 220;

  @override
  void draw() {
    rect(const Rect.fromLTWH(80, 230, 840, 190), const Color(0xFFD6EEF5), line: const Color(0xFF4FA3B8), w: 3);
    text(tr('Air|हवा|ಗಾಳಿ'), const Offset(880, 190), size: 18, color: AC.muted);
    text(tr('Glass|काँच|ಗಾಜು'), const Offset(860, 325), size: 18, color: const Color(0xFF2B7A8C));
    text(tr('Air|हवा|ಗಾಳಿ'), const Offset(880, 460), size: 18, color: AC.muted);
    // Normals.
    dashed(p1 + const Offset(0, -130), p1 + const Offset(0, 130), AC.muted);
    dashed(p2 + const Offset(0, -130), p2 + const Offset(0, 130), AC.muted);
    // The ray grows: the glass part takes longer (light is slower there).
    final a = seg(t, 0.02, 0.25), b = seg(t, 0.25, 0.5), d = seg(t, 0.5, 0.7);
    const ray = Color(0xFFE53935);
    if (a > 0) arrow(start, lerpO(start, p1, a), ray, w: 5);
    if (b > 0) arrow(p1, lerpO(p1, p2, b), ray, w: 5);
    if (d > 0) arrow(p2, lerpO(p2, end, d), ray, w: 5);
    // Wavefronts along the ray: closer together inside the glass.
    void fronts(Offset from, Offset to, double spacing, double k) {
      final dir = (to - from) / (to - from).distance;
      final n = Offset(-dir.dy, dir.dx);
      final len = (to - from).distance * k;
      for (var s = fr(t * 6) * spacing; s < len; s += spacing) {
        final p = from + dir * s;
        line(p - n * 14, p + n * 14, ray.withValues(alpha: 0.35), 2);
      }
    }

    fronts(start, p1, 36, a);
    fronts(p1, p2, 24, b);
    fronts(p2, end, 36, d);
    // Where the ray would have gone, and the sideways shift.
    if (t >= 0.55) {
      final ghost = p1 + Offset(math.sin(i), math.cos(i)) * 300;
      dashed(p1, ghost, ray.withValues(alpha: 0.4));
      label('Lateral shift|पार्श्व विस्थापन|ಪಾರ್ಶ್ವ ಸ್ಥಳಾಂತರ', const Offset(760, 445), to: Offset(p2.dx + 60, p2.dy + 40), size: 15);
    }
    // Angles.
    void angle(Offset o, double from, double sweep, String name, double show) {
      if (show <= 0) return;
      c.drawArc(Rect.fromCircle(center: o, radius: 56), from, sweep, false, stroke(AC.purple.withValues(alpha: show), 3));
      label(name, polar(o, 80, from + sweep / 2), size: 18, opacity: show, color: AC.purple);
    }

    angle(p1, -math.pi / 2 - i, i, 'i|i|i', seg(t, 0.2, 0.25));
    angle(p1, math.pi / 2 - r, r, 'r|r|r', seg(t, 0.45, 0.5));
    angle(p2, math.pi / 2 - i, i, 'e|e|e', seg(t, 0.65, 0.7));
    label('Normal|अभिलंब|ಲಂಬ', p1 + const Offset(0, -150), size: 15);
    label('Incident ray|आपतित किरण|ಪತನ ಕಿರಣ', start + const Offset(-10, 30), size: 15);
    label('Refracted ray|अपवर्तित किरण|ವಕ್ರೀಭವಿತ ಕಿರಣ', lerpO(p1, p2, 0.5) + const Offset(130, 0), size: 15, opacity: b);
    label('Emergent ray|निर्गत किरण|ನಿರ್ಗಮ ಕಿರಣ', end + const Offset(90, -20), size: 15, opacity: d);
    if (t >= 0.75) {
      rect(const Rect.fromLTWH(600, 40, 340, 110), Colors.white, line: AC.accent, w: 3, radius: 14);
      text('n = sin i / sin r', const Offset(770, 78), size: 26, weight: FontWeight.w700);
      text('sin 50° / sin ${(r * 180 / math.pi).toStringAsFixed(0)}° ≈ 1.5', const Offset(770, 118), size: 18, color: AC.muted);
    }
  }
}
