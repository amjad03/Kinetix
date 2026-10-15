import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../draw.dart';
import '../model.dart';

// The nerve impulse, mitosis, meiosis, DNA replication and protein synthesis.

final nerveImpulse = KxAnimation(
  id: 'nerve-impulse',
  title: const Tr('Nerve impulse and synapse', 'तंत्रिका आवेग और सिनैप्स', 'ನರ ಆವೇಗ ಮತ್ತು ಸಿನಾಪ್ಸ್'),
  subject: 'Biology',
  topic: 'Control and coordination',
  levels: const ['Class 10', 'Class 11'],
  keywords: const ['neuron', 'nerve', 'impulse', 'synapse', 'axon', 'dendrite', 'myelin', 'neurotransmitter', 'nervous system', 'reflex'],
  seconds: 16,
  thumbT: 0.7,
  steps: const [
    AnimStep(0, Tr('Stimulus', 'उद्दीपन', 'ಪ್ರಚೋದನೆ'),
        Tr('The dendrites pick up a stimulus and pass it to the cell body.', 'द्रुमिकाएँ (डेंड्राइट) उद्दीपन ग्रहण करके उसे कोशिका काय तक पहुँचाती हैं।', 'ಡೆಂಡ್ರೈಟ್‌ಗಳು ಪ್ರಚೋದನೆಯನ್ನು ಗ್ರಹಿಸಿ ಜೀವಕೋಶ ಕಾಯಕ್ಕೆ ತಲುಪಿಸುತ್ತವೆ.')),
    AnimStep(0.2, Tr('Impulse along the axon', 'तंत्रिकाक्ष में आवेग', 'ಆಕ್ಸಾನ್‌ನಲ್ಲಿ ಆವೇಗ'),
        Tr('An electrical impulse runs along the axon: the charge across the membrane flips as it passes, jumping between the gaps in the myelin sheath.', 'एक विद्युत आवेग तंत्रिकाक्ष में चलता है: गुज़रते समय झिल्ली के आर-पार आवेश उलट जाता है, और यह माइलिन आवरण के खाँचों के बीच कूदता है।', 'ವಿದ್ಯುತ್ ಆವೇಗ ಆಕ್ಸಾನ್‌ನಲ್ಲಿ ಸಾಗುತ್ತದೆ: ಅದು ಹಾದುಹೋದಂತೆ ಪೊರೆಯ ಆಚೀಚಿನ ಆವೇಶ ತಿರುಗುತ್ತದೆ, ಮೈಲಿನ್ ಕವಚದ ಅಂತರಗಳ ನಡುವೆ ಜಿಗಿಯುತ್ತದೆ.')),
    AnimStep(0.5, Tr('Axon terminal', 'तंत्रिकाक्ष छोर', 'ಆಕ್ಸಾನ್ ತುದಿ'),
        Tr('At the axon ending, the impulse makes vesicles full of chemical messengers move to the membrane.', 'तंत्रिकाक्ष के छोर पर आवेग के कारण रासायनिक संदेशवाहकों से भरी पुटिकाएँ झिल्ली की ओर जाती हैं।', 'ಆಕ್ಸಾನ್ ತುದಿಯಲ್ಲಿ ಆವೇಗವು ರಾಸಾಯನಿಕ ಸಂದೇಶವಾಹಕಗಳಿಂದ ತುಂಬಿದ ಕೋಶಕಗಳನ್ನು ಪೊರೆಯತ್ತ ಸರಿಸುತ್ತದೆ.')),
    AnimStep(0.65, Tr('Synapse', 'सिनैप्स', 'ಸಿನಾಪ್ಸ್'),
        Tr('Neurotransmitters are released into the synaptic gap and diffuse across it.', 'तंत्रिका संचारक (न्यूरोट्रांसमीटर) सिनैप्टिक दरार में छोड़े जाते हैं और उसके पार फैलते हैं।', 'ನರಪ್ರೇಷಕಗಳು ಸಿನಾಪ್ಟಿಕ್ ಅಂತರಕ್ಕೆ ಬಿಡುಗಡೆಯಾಗಿ ಅದರಾಚೆ ವಿಸರಣಗೊಳ್ಳುತ್ತವೆ.')),
    AnimStep(0.82, Tr('Next neuron', 'अगला न्यूरॉन', 'ಮುಂದಿನ ನರಕೋಶ'),
        Tr('They bind to receptors on the next neuron and start a new impulse there.', 'वे अगले न्यूरॉन के ग्राहियों से जुड़कर वहाँ नया आवेग शुरू करते हैं।', 'ಅವು ಮುಂದಿನ ನರಕೋಶದ ಗ್ರಾಹಕಗಳಿಗೆ ಅಂಟಿಕೊಂಡು ಅಲ್ಲಿ ಹೊಸ ಆವೇಗ ಆರಂಭಿಸುತ್ತವೆ.')),
  ],
  painter: _Neuron.new,
);

class _Neuron extends AnimPainter {
  _Neuron(super.f);

  static const body = Offset(130, 250);
  static const nerve = Color(0xFFF3C7A0), nerveEdge = Color(0xFFB9763B), myelin = Color(0xFFFFF3B0);

  @override
  void draw() {
    // Dendrites.
    for (var i = 0; i < 7; i++) {
      final a = math.pi * 0.55 + i * 0.32;
      final tip = polar(body, 110, a);
      path(Path()..moveTo(body.dx, body.dy)..quadraticBezierTo(polar(body, 70, a + 0.2).dx, polar(body, 70, a + 0.2).dy, tip.dx, tip.dy), nerveEdge, 7);
      path(Path()..moveTo(tip.dx, tip.dy)..lineTo(polar(tip, 26, a - 0.5).dx, polar(tip, 26, a - 0.5).dy), nerveEdge, 4);
      final pulse = seg(t, 0, 0.18);
      if (t < 0.2) circle(lerpO(tip, body, pulse), 7, AC.sun.withValues(alpha: 1 - pulse * 0.5));
    }
    // Axon with myelin sheath and nodes.
    line(body, const Offset(690, 250), nerveEdge, 14);
    line(body, const Offset(690, 250), nerve, 9);
    for (var i = 0; i < 6; i++) {
      rect(Rect.fromLTWH(225 + i * 76.0, 232, 62, 36), myelin, line: const Color(0xFFD8B44A), radius: 18);
    }
    // Axon terminals.
    for (final d in [-40.0, 0.0, 40.0]) {
      final end = Offset(760, 250 + d * 1.6);
      path(Path()..moveTo(690, 250)..quadraticBezierTo(720, 250 + d, end.dx, end.dy), nerveEdge, 6);
      circle(end, 13, nerve, line: nerveEdge, w: 3);
    }
    circle(body, 58, nerve, line: nerveEdge, w: 4);
    circle(body, 22, const Color(0xFF9575CD), line: AC.purple);

    // The impulse: a band where the charge flips.
    final x = 160 + 540 * seg(t, 0.2, 0.5);
    if (t >= 0.18 && t < 0.55) {
      c.drawCircle(Offset(x, 250), 34, Paint()..shader = RadialGradient(colors: [AC.sun, AC.sun.withValues(alpha: 0)]).createShader(Rect.fromCircle(center: Offset(x, 250), radius: 34)));
    }
    for (var i = 0; i < 12; i++) {
      final px = 205 + i * 40.0;
      final flipped = (px - x).abs() < 40 && t >= 0.18 && t < 0.55;
      text(flipped ? '−' : '+', Offset(px, 212), size: 16, color: flipped ? AC.blue : AC.red, weight: FontWeight.w700);
      text(flipped ? '+' : '−', Offset(px, 288), size: 16, color: flipped ? AC.red : AC.blue, weight: FontWeight.w700);
    }

    // Synapse close-up.
    const sc = Offset(830, 330);
    dashed(const Offset(773, 314), sc + const Offset(-110, -110), AC.muted);
    circle(sc, 155, Colors.white, line: t >= 0.5 ? AC.accent : AC.line, w: t >= 0.5 ? 4 : 2);
    c.save();
    c.clipPath(Path()..addOval(Rect.fromCircle(center: sc, radius: 153)));
    // Pre-synaptic knob (top) and post-synaptic membrane (bottom).
    oval(Rect.fromCenter(center: sc + const Offset(0, -90), width: 250, height: 170), nerve, line: nerveEdge, w: 4);
    rect(Rect.fromLTWH(sc.dx - 160, sc.dy + 40, 320, 140), const Color(0xFFE1C9F2), line: AC.purple, w: 4, radius: 10);
    for (var i = 0; i < 5; i++) {
      final rx = sc.dx - 100 + i * 50.0;
      final bound = t >= 0.82;
      rect(Rect.fromCenter(center: Offset(rx, sc.dy + 42), width: 22, height: 14), bound ? AC.accent : AC.purple, radius: 4);
    }
    final move = ease(seg(t, 0.5, 0.65));
    for (var i = 0; i < 5; i++) {
      final home = sc + Offset(-80 + i * 40.0, -110 + (i.isEven ? 0 : 25));
      final at = lerpO(home, Offset(home.dx, sc.dy - 18), move);
      final open = seg(t, 0.65, 0.7);
      circle(at, 17 * (1 - open * 0.6), Colors.white, line: nerveEdge, w: 2);
      for (var j = 0; j < 4; j++) {
        final out = t >= 0.65 ? fr(t * 3 + j / 4 + i * 0.13) : 0.0;
        final d = polar(at, 7, j * 1.6) + Offset(0, out * 60) + Offset(math.sin((out + i) * 9) * 10, 0);
        circle(t >= 0.82 && out > 0.7 ? Offset(sc.dx - 100 + ((i + j) % 5) * 50.0, sc.dy + 34) : d, 4.5, AC.glucose);
      }
    }
    if (t >= 0.85) {
      final k = seg(t, 0.85, 1);
      for (var i = 0; i < 3; i++) {
        final p = Offset(sc.dx - 150 + 300 * fr(k + i / 3), sc.dy + 110);
        c.drawCircle(p, 20, Paint()..shader = RadialGradient(colors: [AC.sun, AC.sun.withValues(alpha: 0)]).createShader(Rect.fromCircle(center: p, radius: 20)));
      }
    }
    c.restore();

    label('Dendrites|द्रुमिकाएँ|ಡೆಂಡ್ರೈಟ್‌ಗಳು', const Offset(90, 70), to: polar(body, 100, math.pi * 1.4));
    label('Cell body|कोशिका काय|ಜೀವಕೋಶ ಕಾಯ', const Offset(130, 400), to: body + const Offset(0, 50));
    label('Nucleus|केंद्रक|ಕೋಶಕೇಂದ್ರ', const Offset(250, 380), to: body + const Offset(10, 15), size: 15);
    label('Axon|तंत्रिकाक्ष|ಆಕ್ಸಾನ್', const Offset(420, 160), to: const Offset(420, 236));
    label('Myelin sheath|माइलिन आवरण|ಮೈಲಿನ್ ಕವಚ', const Offset(330, 345), to: const Offset(330, 266));
    label('Axon terminal|तंत्रिकाक्ष छोर|ಆಕ್ಸಾನ್ ತುದಿ', const Offset(700, 70), to: const Offset(760, 186));
    label('Vesicles|पुटिकाएँ|ಕೋಶಕಗಳು', sc + const Offset(-170, -10), to: sc + const Offset(-80, -90), size: 14);
    label('Synaptic gap|सिनैप्टिक दरार|ಸಿನಾಪ್ಟಿಕ್ ಅಂತರ', sc + const Offset(0, 15), size: 14);
    label('Receptors|ग्राही|ಗ್ರಾಹಕಗಳು', sc + const Offset(0, 100), to: sc + const Offset(0, 50), size: 14);
  }
}

/// A chromatid: a rounded bar at [o], turned by [angle] from vertical, with an optional tip in
/// another colour (after crossing over).
void _chromatid(AnimPainter p, Offset o, double angle, double len, Color col, {Color? tip}) {
  p.c.save();
  p.c.translate(o.dx, o.dy);
  p.c.rotate(angle);
  final r = Rect.fromCenter(center: Offset.zero, width: 15, height: len);
  p.rect(r, col, line: Colors.white, w: 1.5, radius: 7.5);
  if (tip != null) p.rect(Rect.fromLTWH(r.left, r.top, r.width, len * 0.3), tip, radius: 7.5);
  p.c.restore();
}

/// A replicated chromosome: two sister chromatids joined at the centromere ([spread] 0 = an X).
void _chromosome(AnimPainter p, Offset o, double len, Color col, {double spread = 0, double turn = 0, Color? tipA, Color? tipB}) {
  final a = Offset(math.cos(turn), math.sin(turn)) * spread;
  _chromatid(p, o - a, turn - 0.32 * (1 - math.min(1, spread / 30)), len, col, tip: tipA);
  _chromatid(p, o + a, turn + 0.32 * (1 - math.min(1, spread / 30)), len, col, tip: tipB);
  if (spread < 4) p.circle(o, 6, AC.ink);
}

/// Loose chromatin threads inside a nucleus (interphase).
void _chromatin(AnimPainter p, Offset c, double r, double seed) {
  for (var i = 0; i < 4; i++) {
    final path = Path();
    for (var k = 0; k <= 30; k++) {
      final a = seed + i * 1.7 + k * 0.35;
      final rr = r * (0.25 + 0.55 * (0.5 + 0.5 * math.sin(k * 0.7 + i)));
      final q = polar(c, rr, a);
      k == 0 ? path.moveTo(q.dx, q.dy) : path.lineTo(q.dx, q.dy);
    }
    p.path(path, i.isEven ? AC.red.withValues(alpha: 0.7) : AC.blue.withValues(alpha: 0.7), 2.5);
  }
}

/// A cell outline that can pinch into two: ellipses centred [d] either side of [o] along [axis].
void _cells(AnimPainter p, Offset o, double rx, double ry, double d, {Offset axis = const Offset(1, 0), Color fillC = AC.cell}) {
  final a = Rect.fromCenter(center: o - axis * d, width: rx * 2, height: ry * 2);
  final b = Rect.fromCenter(center: o + axis * d, width: rx * 2, height: ry * 2);
  final u = Path.combine(PathOperation.union, Path()..addOval(a), Path()..addOval(b));
  p.fillPath(u, fillC, line: AC.membrane, w: 4);
}

final mitosis = KxAnimation(
  id: 'mitosis',
  title: const Tr('Mitosis', 'समसूत्री विभाजन', 'ಸಮಸೂತ್ರ ವಿಭಜನೆ'),
  subject: 'Biology',
  topic: 'Cell division',
  levels: const ['Class 9', 'Class 11'],
  keywords: const ['mitosis', 'cell division', 'prophase', 'metaphase', 'anaphase', 'telophase', 'cytokinesis', 'chromosome', 'spindle', 'growth'],
  seconds: 22,
  thumbT: 0.4,
  steps: const [
    AnimStep(0, Tr('Interphase', 'अंतरावस्था', 'ಅಂತರಾವಸ್ಥೆ'),
        Tr('The cell grows and copies its DNA. The chromosomes are long, thin threads in the nucleus.', 'कोशिका बढ़ती है और अपने DNA की प्रतिलिपि बनाती है। गुणसूत्र केंद्रक में लंबे, पतले धागों जैसे होते हैं।', 'ಜೀವಕೋಶ ಬೆಳೆದು ತನ್ನ DNA ನಕಲು ಮಾಡುತ್ತದೆ. ವರ್ಣತಂತುಗಳು ಕೋಶಕೇಂದ್ರದಲ್ಲಿ ಉದ್ದ, ತೆಳು ಎಳೆಗಳಾಗಿರುತ್ತವೆ.')),
    AnimStep(0.15, Tr('Prophase', 'पूर्वावस्था', 'ಪೂರ್ವಾವಸ್ಥೆ'),
        Tr('Chromosomes coil up and become visible as two sister chromatids. The nuclear membrane breaks down.', 'गुणसूत्र कुंडलित होकर दो संतति क्रोमैटिड के रूप में दिखते हैं। केंद्रक झिल्ली टूट जाती है।', 'ವರ್ಣತಂತುಗಳು ಸುರುಳಿಯಾಗಿ ಎರಡು ಸಹೋದರ ಕ್ರೊಮ್ಯಾಟಿಡ್‌ಗಳಾಗಿ ಕಾಣುತ್ತವೆ. ಕೋಶಕೇಂದ್ರ ಪೊರೆ ಒಡೆಯುತ್ತದೆ.')),
    AnimStep(0.32, Tr('Metaphase', 'मध्यावस्था', 'ಮಧ್ಯಾವಸ್ಥೆ'),
        Tr('Spindle fibres line the chromosomes up along the middle of the cell (the equator).', 'तर्कु तंतु गुणसूत्रों को कोशिका के बीच (विषुवत रेखा) पर एक पंक्ति में लगाते हैं।', 'ತರ್ಕು ತಂತುಗಳು ವರ್ಣತಂತುಗಳನ್ನು ಜೀವಕೋಶದ ಮಧ್ಯದಲ್ಲಿ (ಸಮಭಾಜಕ) ಸಾಲಾಗಿ ನಿಲ್ಲಿಸುತ್ತವೆ.')),
    AnimStep(0.5, Tr('Anaphase', 'पश्चावस्था', 'ಪಶ್ಚಾವಸ್ಥೆ'),
        Tr('The sister chromatids are pulled apart to opposite poles of the cell.', 'संतति क्रोमैटिड अलग होकर कोशिका के विपरीत ध्रुवों की ओर खिंचते हैं।', 'ಸಹೋದರ ಕ್ರೊಮ್ಯಾಟಿಡ್‌ಗಳು ಬೇರ್ಪಟ್ಟು ಜೀವಕೋಶದ ವಿರುದ್ಧ ಧ್ರುವಗಳತ್ತ ಎಳೆಯಲ್ಪಡುತ್ತವೆ.')),
    AnimStep(0.67, Tr('Telophase', 'अंत्यावस्था', 'ಅಂತ್ಯಾವಸ್ಥೆ'),
        Tr('A nuclear membrane forms around each set: there are now two nuclei.', 'हर समूह के चारों ओर केंद्रक झिल्ली बनती है: अब दो केंद्रक हैं।', 'ಪ್ರತಿ ಗುಂಪಿನ ಸುತ್ತ ಕೋಶಕೇಂದ್ರ ಪೊರೆ ರೂಪುಗೊಳ್ಳುತ್ತದೆ: ಈಗ ಎರಡು ಕೋಶಕೇಂದ್ರಗಳು.')),
    AnimStep(0.84, Tr('Cytokinesis', 'कोशिकाद्रव्य विभाजन', 'ಕೋಶದ್ರವ್ಯ ವಿಭಜನೆ'),
        Tr('The cytoplasm divides. Two identical daughter cells, each with the same chromosomes as the parent.', 'कोशिकाद्रव्य बँटता है। दो एक जैसी संतति कोशिकाएँ बनती हैं, जिनमें जनक जितने ही गुणसूत्र होते हैं।', 'ಕೋಶದ್ರವ್ಯ ವಿಭಜನೆಯಾಗುತ್ತದೆ. ಪೋಷಕದಷ್ಟೇ ವರ್ಣತಂತುಗಳಿರುವ ಎರಡು ಒಂದೇ ರೀತಿಯ ಮರಿ ಜೀವಕೋಶಗಳು.')),
  ],
  painter: _Mitosis.new,
);

class _Mitosis extends AnimPainter {
  _Mitosis(super.f);

  static const o = Offset(500, 290);
  static const chroms = [(90.0, AC.red), (90.0, AC.blue), (55.0, AC.red), (55.0, AC.blue)];
  static const scattered = [Offset(-60, -50), Offset(50, -30), Offset(-30, 50), Offset(60, 55)];

  @override
  void draw() {
    final split = ease(seg(t, 0.72, 0.95));
    _cells(this, o, 280 - 130 * split, 190 - 30 * split, 160 * split);
    // Nuclear membrane: whole, fading in prophase, back as two in telophase.
    final nuc = 1 - seg(t, 0.17, 0.3);
    if (nuc > 0) {
      circle(o, 120, const Color(0xFFEDE3F6).withValues(alpha: nuc), line: AC.purple.withValues(alpha: nuc), w: 3);
      if (t < 0.15) _chromatin(this, o, 110, t * 4);
    }
    final reform = seg(t, 0.72, 0.84);
    if (reform > 0) {
      for (final s in [-1.0, 1.0]) {
        circle(o + Offset(s * _nucX, 0), 85, const Color(0xFFEDE3F6).withValues(alpha: reform * 0.8), line: AC.purple.withValues(alpha: reform), w: 3);
      }
    }
    // Spindle.
    final sp = seg(t, 0.28, 0.36) * (1 - seg(t, 0.7, 0.78));
    if (sp > 0) {
      for (final s in [-1.0, 1.0]) {
        final pole = o + Offset(s * 240, 0);
        circle(pole, 9, AC.ink.withValues(alpha: sp));
        for (var i = 0; i < 4; i++) {
          final target = t < 0.5 ? o + Offset(0, -105 + i * 70.0) : _pos(i, s);
          line(pole, target, AC.muted.withValues(alpha: 0.6 * sp), 1.5);
        }
      }
    }
    if (t < 0.15) {
      _labels();
      return;
    }
    // Chromosomes.
    final cond = seg(t, 0.15, 0.25);
    for (var i = 0; i < 4; i++) {
      final (len, col) = chroms[i];
      if (t < 0.5) {
        final p = lerpO(o + scattered[i], o + Offset(0, -105 + i * 70.0), ease(seg(t, 0.3, 0.42)));
        _chromosome(this, p, len * (0.4 + 0.6 * cond), col.withValues(alpha: 0.4 + 0.6 * cond));
      } else {
        for (final s in [-1.0, 1.0]) {
          _chromatid(this, _pos(i, s), s * math.pi / 2 * ease(seg(t, 0.5, 0.56)), len, col);
        }
      }
    }
    _labels();
  }

  /// A chromatid's place after anaphase starts ([s]: which pole).
  Offset _pos(int i, double s) {
    final k = ease(seg(t, 0.5, 0.67));
    final y = -105 + i * 70.0;
    return o + lerpO(Offset(s * 10, y), Offset(s * _nucX, y * 0.75), k);
  }

  /// How far each daughter nucleus sits from the middle.
  double get _nucX => 190 - 30 * ease(seg(t, 0.72, 0.95));

  void _labels() {
    label('Cell membrane|कोशिका झिल्ली|ಜೀವಕೋಶ ಪೊರೆ', const Offset(140, 80), to: const Offset(330, 140));
    label('Nucleus|केंद्रक|ಕೋಶಕೇಂದ್ರ', const Offset(820, 80), to: o + const Offset(80, -90), opacity: 1 - seg(t, 0.17, 0.3));
    label('Chromosome|गुणसूत्र|ವರ್ಣತಂತು', const Offset(170, 500), to: o + const Offset(-10, 40), opacity: seg(t, 0.2, 0.25) * (1 - seg(t, 0.48, 0.5)));
    label('Spindle fibres|तर्कु तंतु|ತರ್ಕು ತಂತುಗಳು', const Offset(820, 520), to: o + const Offset(150, 40), opacity: seg(t, 0.3, 0.36) * (1 - seg(t, 0.68, 0.72)));
    label('Equator|विषुवत रेखा|ಸಮಭಾಜಕ', const Offset(500, 545), to: o + const Offset(0, 160), opacity: seg(t, 0.32, 0.36) * (1 - seg(t, 0.48, 0.5)));
    label('Two daughter cells|दो संतति कोशिकाएँ|ಎರಡು ಮರಿ ಜೀವಕೋಶಗಳು', const Offset(500, 545), opacity: seg(t, 0.86, 0.9));
    if (t >= 0.32 && t < 0.5) dashed(o + const Offset(0, -170), o + const Offset(0, 160), AC.muted);
  }
}

final meiosis = KxAnimation(
  id: 'meiosis',
  title: const Tr('Meiosis', 'अर्धसूत्री विभाजन', 'ಅರ್ಧಸೂತ್ರ ವಿಭಜನೆ'),
  subject: 'Biology',
  topic: 'Cell division',
  levels: const ['Class 10', 'Class 11', 'Class 12'],
  keywords: const ['meiosis', 'cell division', 'gametes', 'crossing over', 'homologous', 'haploid', 'diploid', 'reproduction', 'variation', 'heredity'],
  seconds: 24,
  thumbT: 0.36,
  steps: const [
    AnimStep(0, Tr('Interphase', 'अंतरावस्था', 'ಅಂತರಾವಸ್ಥೆ'),
        Tr('The DNA is copied. This cell has two pairs of chromosomes: one of each pair from each parent (red and blue).', 'DNA की प्रतिलिपि बनती है। इस कोशिका में गुणसूत्रों के दो जोड़े हैं: हर जोड़े का एक-एक माता और पिता से (लाल और नीला)।', 'DNA ನಕಲಾಗುತ್ತದೆ. ಈ ಜೀವಕೋಶದಲ್ಲಿ ಎರಡು ಜೊತೆ ವರ್ಣತಂತುಗಳಿವೆ: ಪ್ರತಿ ಜೊತೆಯಲ್ಲಿ ಒಂದೊಂದು ತಾಯಿ ಮತ್ತು ತಂದೆಯಿಂದ (ಕೆಂಪು, ನೀಲಿ).')),
    AnimStep(0.15, Tr('Crossing over', 'जीन विनिमय', 'ಅಡ್ಡ ಹಾಯುವಿಕೆ'),
        Tr('In prophase I, matching chromosomes pair up and swap pieces. This mixes the parents’ genes.', 'पूर्वावस्था I में समजात गुणसूत्र जोड़ा बनाते हैं और टुकड़ों की अदला-बदली करते हैं। इससे माता-पिता के जीन मिल जाते हैं।', 'ಪೂರ್ವಾವಸ್ಥೆ I ರಲ್ಲಿ ಸಮರೂಪ ವರ್ಣತಂತುಗಳು ಜೊತೆಯಾಗಿ ತುಂಡುಗಳನ್ನು ವಿನಿಮಯ ಮಾಡುತ್ತವೆ. ಇದರಿಂದ ಪೋಷಕರ ಜೀನ್‌ಗಳು ಬೆರೆಯುತ್ತವೆ.')),
    AnimStep(0.32, Tr('Metaphase I', 'मध्यावस्था I', 'ಮಧ್ಯಾವಸ್ಥೆ I'),
        Tr('The pairs line up at the equator. Which side each one faces is a matter of chance.', 'जोड़े विषुवत रेखा पर पंक्ति में लगते हैं। कौन किस ओर रहेगा, यह संयोग से तय होता है।', 'ಜೊತೆಗಳು ಸಮಭಾಜಕದಲ್ಲಿ ಸಾಲಾಗುತ್ತವೆ. ಯಾವುದು ಯಾವ ಕಡೆ ಎಂಬುದು ಆಕಸ್ಮಿಕ.')),
    AnimStep(0.45, Tr('Meiosis I', 'अर्धसूत्री I', 'ಅರ್ಧಸೂತ್ರ I'),
        Tr('The pairs separate and the cell divides. Each new cell has only one chromosome of each pair.', 'जोड़े अलग होते हैं और कोशिका बँटती है। हर नई कोशिका में हर जोड़े का केवल एक गुणसूत्र होता है।', 'ಜೊತೆಗಳು ಬೇರ್ಪಟ್ಟು ಜೀವಕೋಶ ವಿಭಜಿಸುತ್ತದೆ. ಪ್ರತಿ ಹೊಸ ಜೀವಕೋಶದಲ್ಲಿ ಪ್ರತಿ ಜೊತೆಯ ಒಂದೇ ವರ್ಣತಂತು.')),
    AnimStep(0.66, Tr('Meiosis II', 'अर्धसूत्री II', 'ಅರ್ಧಸೂತ್ರ II'),
        Tr('In each cell the sister chromatids separate, as in mitosis, and the cells divide again.', 'हर कोशिका में संतति क्रोमैटिड समसूत्री की तरह अलग होते हैं और कोशिकाएँ फिर से बँटती हैं।', 'ಪ್ರತಿ ಜೀವಕೋಶದಲ್ಲಿ ಸಹೋದರ ಕ್ರೊಮ್ಯಾಟಿಡ್‌ಗಳು ಸಮಸೂತ್ರದಂತೆ ಬೇರ್ಪಟ್ಟು, ಜೀವಕೋಶಗಳು ಮತ್ತೆ ವಿಭಜಿಸುತ್ತವೆ.')),
    AnimStep(0.86, Tr('Four gametes', 'चार युग्मक', 'ನಾಲ್ಕು ಲಿಂಗಾಣುಗಳು'),
        Tr('Four haploid cells, each with half the chromosomes and a different mix of genes.', 'चार अगुणित कोशिकाएँ, हर एक में आधे गुणसूत्र और जीनों का अलग मेल।', 'ನಾಲ್ಕು ಏಕಗುಣಿತ ಜೀವಕೋಶಗಳು; ಪ್ರತಿಯೊಂದರಲ್ಲಿ ಅರ್ಧ ವರ್ಣತಂತುಗಳು ಮತ್ತು ಜೀನ್‌ಗಳ ಬೇರೆ ಮಿಶ್ರಣ.')),
  ],
  painter: _Meiosis.new,
);

class _Meiosis extends AnimPainter {
  _Meiosis(super.f);

  static const o = Offset(500, 300);

  @override
  void draw() {
    final div1 = ease(seg(t, 0.52, 0.64));
    final div2 = ease(seg(t, 0.74, 0.86));
    if (div1 < 1) {
      _cells(this, o, 270 - 80 * div1, 200 - 40 * div1, 200 * div1);
    } else {
      for (final s in [-1.0, 1.0]) {
        _cells(this, o + Offset(s * 200, 0), 190 - 70 * div2, 160 - 55 * div2, 125 * div2, axis: const Offset(0, 1));
      }
    }
    if (t < 0.15) {
      circle(o, 120, const Color(0xFFEDE3F6), line: AC.purple, w: 3);
      _chromatin(this, o, 110, t * 4);
    }
    // Chromosomes: (length, colour, row, Metaphase I side).
    const chroms = [(84.0, AC.red, -1.0, -1.0), (84.0, AC.blue, -1.0, 1.0), (50.0, AC.red, 1.0, 1.0), (50.0, AC.blue, 1.0, -1.0)];
    final cross = seg(t, 0.22, 0.28);
    for (final (len, col, row, side) in chroms) {
      final other = col == AC.red ? AC.blue : AC.red;
      final tipB = cross > 0.5 ? other : null;
      final grow = seg(t, 0.15, 0.22);
      if (t < 0.15) continue;
      final pair = o + Offset(side * 16, row * 75);
      final meta = o + Offset(side * 22, row * 75);
      final cellX = o.dx + side * 200;
      if (t < 0.45) {
        final p = lerpO(pair, meta, seg(t, 0.32, 0.4));
        _chromosome(this, p, len * (0.5 + 0.5 * grow), col, tipB: tipB);
      } else if (t < 0.66) {
        final p = lerpO(meta, Offset(cellX + (row < 0 ? -40 : 40), o.dy), ease(seg(t, 0.45, 0.56)));
        _chromosome(this, p, len, col, tipB: tipB);
      } else {
        // Meiosis II: the sisters part, up and down.
        final k = ease(seg(t, 0.68, 0.8));
        final base = Offset(cellX + (row < 0 ? -40 : 40), o.dy);
        _chromatid(this, base + Offset(0, -120 * k), 0, len, col);
        _chromatid(this, base + Offset(0, 120 * k), 0, len, col, tip: tipB);
      }
    }
    // Spindle in Metaphase I.
    final sp = seg(t, 0.32, 0.36) * (1 - seg(t, 0.5, 0.54));
    if (sp > 0) {
      for (final s in [-1.0, 1.0]) {
        circle(o + Offset(s * 250, 0), 8, AC.ink.withValues(alpha: sp));
        for (final r in [-75.0, 75.0]) {
          line(o + Offset(s * 250, 0), o + Offset(s * 22, r), AC.muted.withValues(alpha: 0.6 * sp), 1.5);
        }
      }
      dashed(o + const Offset(0, -190), o + const Offset(0, 190), AC.muted.withValues(alpha: sp));
    }

    label('Homologous pair|समजात जोड़ा|ಸಮರೂಪ ಜೊತೆ', const Offset(820, 90), to: o + const Offset(20, -110), opacity: seg(t, 0.15, 0.2) * (1 - seg(t, 0.43, 0.45)));
    label('Crossing over|जीन विनिमय|ಅಡ್ಡ ಹಾಯುವಿಕೆ', const Offset(180, 90), to: o + const Offset(-10, -100), opacity: seg(t, 0.22, 0.26) * (1 - seg(t, 0.43, 0.45)));
    label('Diploid (2n)|द्विगुणित (2n)|ದ್ವಿಗುಣಿತ (2n)', const Offset(500, 560), opacity: 1 - seg(t, 0.5, 0.52));
    label('Haploid (n)|अगुणित (n)|ಏಕಗುಣಿತ (n)', const Offset(500, 560), opacity: seg(t, 0.6, 0.64));
    if (t >= 0.86) {
      for (final s in [-1.0, 1.0]) {
        for (final v in [-1.0, 1.0]) {
          label('Gamete|युग्मक|ಲಿಂಗಾಣು', o + Offset(s * 200 + s * 150, v * 150), size: 15);
        }
      }
    }
  }
}

final dnaReplication = KxAnimation(
  id: 'dna-replication',
  title: const Tr('DNA replication', 'DNA प्रतिकृतीयन', 'DNA ಪ್ರತಿಕೃತಿ'),
  subject: 'Biology',
  topic: 'Heredity and genetics',
  levels: const ['Class 10', 'Class 12'],
  keywords: const ['dna', 'replication', 'helicase', 'polymerase', 'base pairing', 'semi-conservative', 'nucleotides', 'double helix', 'genetics', 'molecular basis of inheritance'],
  seconds: 20,
  thumbT: 0.6,
  steps: const [
    AnimStep(0, Tr('Double helix', 'द्विकुंडली', 'ದ್ವಿಸುರುಳಿ'),
        Tr('DNA is two strands twisted together. Their bases pair up: A with T, G with C.', 'DNA दो लड़ियों की एक कुंडली है। इनके क्षार जोड़ी बनाते हैं: A के साथ T, G के साथ C।', 'DNA ಎರಡು ಎಳೆಗಳು ಸುರುಳಿಯಾಗಿ ಹೆಣೆದ ರಚನೆ. ಅವುಗಳ ಪ್ರತ್ಯಾಮ್ಲಗಳು ಜೊತೆಯಾಗುತ್ತವೆ: A ಜೊತೆ T, G ಜೊತೆ C.')),
    AnimStep(0.2, Tr('Unzipping', 'खुलना', 'ಬಿಚ್ಚಿಕೊಳ್ಳುವಿಕೆ'),
        Tr('The enzyme helicase unwinds the helix and breaks the bonds between the bases, opening a fork.', 'हेलिकेज़ एंजाइम कुंडली खोलता है और क्षारों के बीच के बंध तोड़ता है, जिससे एक फोर्क खुलता है।', 'ಹೆಲಿಕೇಸ್ ಕಿಣ್ವ ಸುರುಳಿಯನ್ನು ಬಿಚ್ಚಿ ಪ್ರತ್ಯಾಮ್ಲಗಳ ನಡುವಿನ ಬಂಧ ಮುರಿಯುತ್ತದೆ; ಒಂದು ಕವಲು ತೆರೆಯುತ್ತದೆ.')),
    AnimStep(0.45, Tr('Base pairing', 'क्षार युग्मन', 'ಪ್ರತ್ಯಾಮ್ಲ ಜೋಡಣೆ'),
        Tr('DNA polymerase brings free nucleotides that match each exposed base and joins them into new strands.', 'DNA पॉलीमरेज़ हर खुले क्षार से मेल खाते मुक्त न्यूक्लियोटाइड लाकर नई लड़ियाँ जोड़ता है।', 'DNA ಪಾಲಿಮರೇಸ್ ತೆರೆದ ಪ್ರತಿ ಪ್ರತ್ಯಾಮ್ಲಕ್ಕೆ ಹೊಂದುವ ಮುಕ್ತ ನ್ಯೂಕ್ಲಿಯೋಟೈಡ್‌ಗಳನ್ನು ತಂದು ಹೊಸ ಎಳೆಗಳನ್ನು ಜೋಡಿಸುತ್ತದೆ.')),
    AnimStep(0.75, Tr('Two copies', 'दो प्रतियाँ', 'ಎರಡು ಪ್ರತಿಗಳು'),
        Tr('Two identical DNA molecules, each with one old strand and one new strand (semi-conservative).', 'दो एक जैसे DNA अणु, हर एक में एक पुरानी और एक नई लड़ी (अर्धसंरक्षी)।', 'ಎರಡು ಒಂದೇ DNA ಅಣುಗಳು; ಪ್ರತಿಯೊಂದರಲ್ಲಿ ಒಂದು ಹಳೆಯ ಮತ್ತು ಒಂದು ಹೊಸ ಎಳೆ (ಅರ್ಧಸಂರಕ್ಷಕ).')),
  ],
  painter: _Dna.new,
);

const _seq = 'ATGCGTACCATGGCTAAGTCGA';
Color _baseColor(String b) => switch (b) {
      'A' => const Color(0xFFE53935),
      'T' => const Color(0xFFFBC02D),
      'G' => const Color(0xFF43A047),
      'U' => const Color(0xFF8E24AA),
      _ => const Color(0xFF1E88E5),
    };
String _pair(String b) => switch (b) { 'A' => 'T', 'T' => 'A', 'G' => 'C', _ => 'G' };

class _Dna extends AnimPainter {
  _Dna(super.f);

  static const old = Color(0xFF455A64), fresh = AC.accent;

  @override
  void draw() {
    const x0 = 70.0, dx = 40.0;
    final fork = x0 - 30 + (_seq.length * dx + 60) * ease(seg(t, 0.2, 0.92));
    final spin = t * 10;
    for (var i = 0; i < _seq.length; i++) {
      final x = x0 + i * dx;
      final b = _seq[i], p = _pair(b);
      if (x > fork) {
        // Still a helix: rungs foreshortened by the twist.
        final ph = i * 0.6 + spin;
        final yA = 300 - 70 * math.cos(ph), yB = 300 + 70 * math.cos(ph);
        line(Offset(x, yA), Offset(x, 300), _baseColor(b), 9);
        line(Offset(x, 300), Offset(x, yB), _baseColor(p), 9);
        if (math.cos(ph).abs() > 0.5 && f.labels) {
          text(b, Offset(x, (yA + 300) / 2), size: 12, color: Colors.white, weight: FontWeight.w700);
          text(p, Offset(x, (yB + 300) / 2), size: 12, color: Colors.white, weight: FontWeight.w700);
        }
      } else {
        // Opened: old strands out to the top and bottom; new partners join behind the fork.
        final open = seg(fork - x, 0, 80);
        final yTop = 300 - 70 - 90 * open, yBot = 300 + 70 + 90 * open;
        _base(Offset(x, yTop), 1, b);
        _base(Offset(x, yBot), -1, p);
        final built = seg(fork - x, 90, 150);
        if (built > 0) {
          _base(Offset(x, yTop + 90 - 30 * (1 - built)), -1, p, opacity: built);
          _base(Offset(x, yBot - 90 + 30 * (1 - built)), 1, b, opacity: built);
        }
      }
    }
    // Backbones.
    final top = Path(), bot = Path(), nTop = Path(), nBot = Path();
    for (var k = 0; k <= 200; k++) {
      final x = x0 - 20 + k * (_seq.length * dx) / 200;
      final open = seg(fork - x, 0, 80);
      final ph = (x - x0) / dx * 0.6 + spin;
      final yA = x > fork ? 300 - 70 * math.cos(ph) : 300 - 70 - 90 * open;
      final yB = x > fork ? 300 + 70 * math.cos(ph) : 300 + 70 + 90 * open;
      k == 0 ? top.moveTo(x, yA) : top.lineTo(x, yA);
      k == 0 ? bot.moveTo(x, yB) : bot.lineTo(x, yB);
      if (fork - x > 90) {
        nTop.moveTo(x, yA + 90);
        nTop.lineTo(x + (_seq.length * dx) / 200, yA + 90);
        nBot.moveTo(x, yB - 90);
        nBot.lineTo(x + (_seq.length * dx) / 200, yB - 90);
      }
    }
    path(top, old, 6);
    path(bot, old, 6);
    path(nTop, fresh, 6);
    path(nBot, fresh, 6);

    // Helicase at the fork, polymerase behind it, free nucleotides about.
    if (t >= 0.2 && fork < x0 + _seq.length * dx) {
      oval(Rect.fromCenter(center: Offset(fork, 300), width: 60, height: 90), AC.purple.withValues(alpha: 0.85), line: Colors.white);
      if (t >= 0.4) {
        for (final s in [-1.0, 1.0]) {
          circle(Offset(fork - 110, 300 + s * 100), 26, AC.glucose.withValues(alpha: 0.85), line: Colors.white);
        }
      }
    }
    if (t >= 0.35) {
      for (var i = 0; i < 8; i++) {
        final k = fr(t * 2 + i / 8);
        final b = 'ATGC'[i % 4];
        final p = Offset(80 + i * 115.0 + 30 * math.sin(k * tau), i.isEven ? 60 + 20 * math.cos(k * tau) : 540 - 20 * math.cos(k * tau));
        _base(p, i.isEven ? 1 : -1, b, opacity: 0.8);
      }
    }
    label('Helicase|हेलिकेज़|ಹೆಲಿಕೇಸ್', Offset(fork, 190), opacity: t >= 0.2 && fork < 900 ? 1 : 0);
    label('DNA polymerase|DNA पॉलीमरेज़|DNA ಪಾಲಿಮರೇಸ್', Offset(fork - 110, 440), to: Offset(fork - 110, 400), opacity: t >= 0.4 && fork < 1000 ? 1 : 0);
    label('Old strand|पुरानी लड़ी|ಹಳೆಯ ಎಳೆ', const Offset(140, 95), to: const Offset(140, 125), opacity: seg(t, 0.45, 0.5));
    label('New strand|नई लड़ी|ಹೊಸ ಎಳೆ', const Offset(250, 300), to: const Offset(220, 230), opacity: seg(t, 0.5, 0.55));
    label('Free nucleotides|मुक्त न्यूक्लियोटाइड|ಮುಕ್ತ ನ್ಯೂಕ್ಲಿಯೋಟೈಡ್‌ಗಳು', const Offset(880, 30), opacity: seg(t, 0.35, 0.4));
    if (t < 0.2) {
      label('A – T   G – C', const Offset(500, 520), size: 22);
    }
  }

  /// A nucleotide: a base sticking out from a strand ([dir] 1 = down, -1 = up).
  void _base(Offset at, double dir, String b, {double opacity = 1}) {
    final col = _baseColor(b).withValues(alpha: opacity);
    line(at, at + Offset(0, 38 * dir), col, 9);
    if (f.labels) text(b, at + Offset(0, 20 * dir), size: 12, color: Colors.white.withValues(alpha: opacity), weight: FontWeight.w700);
  }
}

final proteinSynthesis = KxAnimation(
  id: 'protein-synthesis',
  title: const Tr('Protein synthesis', 'प्रोटीन संश्लेषण', 'ಪ್ರೋಟೀನ್ ಸಂಶ್ಲೇಷಣೆ'),
  subject: 'Biology',
  topic: 'Heredity and genetics',
  levels: const ['Class 12'],
  keywords: const ['protein synthesis', 'transcription', 'translation', 'mrna', 'trna', 'ribosome', 'codon', 'anticodon', 'amino acids', 'gene expression', 'central dogma'],
  seconds: 24,
  thumbT: 0.75,
  steps: const [
    AnimStep(0, Tr('Transcription', 'अनुलेखन', 'ಪ್ರತಿಲೇಖನ'),
        Tr('In the nucleus, RNA polymerase reads a gene on the DNA and builds a matching messenger RNA (mRNA).', 'केंद्रक में RNA पॉलीमरेज़ DNA पर एक जीन पढ़कर उससे मेल खाता संदेशवाहक RNA (mRNA) बनाता है।', 'ಕೋಶಕೇಂದ್ರದಲ್ಲಿ RNA ಪಾಲಿಮರೇಸ್ DNA ಯ ಒಂದು ಜೀನ್ ಓದಿ ಅದಕ್ಕೆ ಹೊಂದುವ ಸಂದೇಶವಾಹಕ RNA (mRNA) ನಿರ್ಮಿಸುತ್ತದೆ.')),
    AnimStep(0.28, Tr('mRNA leaves', 'mRNA बाहर आता है', 'mRNA ಹೊರಬರುತ್ತದೆ'),
        Tr('The mRNA leaves the nucleus through a nuclear pore into the cytoplasm.', 'mRNA केंद्रक छिद्र से होकर कोशिकाद्रव्य में आता है।', 'mRNA ಕೋಶಕೇಂದ್ರದ ರಂಧ್ರದ ಮೂಲಕ ಕೋಶದ್ರವ್ಯಕ್ಕೆ ಬರುತ್ತದೆ.')),
    AnimStep(0.42, Tr('Ribosome', 'राइबोसोम', 'ರೈಬೋಸೋಮ್'),
        Tr('A ribosome clamps onto the mRNA and reads it three bases (one codon) at a time, starting at AUG.', 'एक राइबोसोम mRNA पर बैठकर उसे AUG से शुरू करके तीन-तीन क्षार (एक कोडॉन) पढ़ता है।', 'ರೈಬೋಸೋಮ್ mRNA ಮೇಲೆ ಕುಳಿತು AUG ಯಿಂದ ಆರಂಭಿಸಿ ಮೂರು ಮೂರು ಪ್ರತ್ಯಾಮ್ಲಗಳನ್ನು (ಒಂದು ಕೋಡಾನ್) ಓದುತ್ತದೆ.')),
    AnimStep(0.55, Tr('Translation', 'अनुवादन', 'ಭಾಷಾಂತರ'),
        Tr('Transfer RNAs (tRNA) with the matching anticodon bring the right amino acid for each codon.', 'मेल खाते प्रति-कोडॉन वाले स्थानांतरण RNA (tRNA) हर कोडॉन के लिए सही अमीनो अम्ल लाते हैं।', 'ಹೊಂದುವ ಪ್ರತಿ-ಕೋಡಾನ್ ಇರುವ ವರ್ಗಾವಣೆ RNA (tRNA) ಪ್ರತಿ ಕೋಡಾನ್‌ಗೆ ಸರಿಯಾದ ಅಮೈನೋ ಆಮ್ಲ ತರುತ್ತದೆ.')),
    AnimStep(0.82, Tr('Protein', 'प्रोटीन', 'ಪ್ರೋಟೀನ್'),
        Tr('Peptide bonds join the amino acids into a chain. At a stop codon the chain is released and folds into a protein.', 'पेप्टाइड बंध अमीनो अम्लों को एक शृंखला में जोड़ते हैं। समापन कोडॉन पर शृंखला मुक्त होकर प्रोटीन में मुड़ जाती है।', 'ಪೆಪ್ಟೈಡ್ ಬಂಧಗಳು ಅಮೈನೋ ಆಮ್ಲಗಳನ್ನು ಸರಪಳಿಯಾಗಿ ಜೋಡಿಸುತ್ತವೆ. ನಿಲುಗಡೆ ಕೋಡಾನ್‌ನಲ್ಲಿ ಸರಪಳಿ ಬಿಡುಗಡೆಯಾಗಿ ಪ್ರೋಟೀನ್ ಆಗಿ ಮಡಿಚುತ್ತದೆ.')),
  ],
  painter: _Protein.new,
);

class _Protein extends AnimPainter {
  _Protein(super.f);

  static const codons = ['AUG', 'UUC', 'GGA', 'GCU', 'AAA', 'UGA'];
  static const aminos = ['Met', 'Phe', 'Gly', 'Ala', 'Lys'];
  static const aaColors = [Color(0xFFEF6C00), Color(0xFF00897B), Color(0xFF5E35B1), Color(0xFFC2185B), Color(0xFF3949AB)];
  static String _anti(String c) => c.split('').map((b) => switch (b) { 'A' => 'U', 'U' => 'A', 'G' => 'C', _ => 'G' }).join();

  @override
  void draw() {
    // Cytoplasm, nucleus and pore.
    rect(const Rect.fromLTWH(10, 20, 980, 560), AC.cell, line: AC.membrane, w: 4, radius: 40);
    circle(const Offset(190, 300), 170, const Color(0xFFEDE3F6), line: AC.purple, w: 4);
    rect(const Rect.fromLTWH(348, 282, 20, 36), AC.cell);
    // DNA in the nucleus.
    final gene = codons.join();
    final tx = seg(t, 0.02, 0.26);
    for (var i = 0; i < gene.length; i++) {
      final x = 60 + i * 14.0;
      final dnaB = gene[i] == 'U' ? 'T' : gene[i];
      final open = (x - (60 + tx * 252)).abs() < 40 && t < 0.28 ? 1.0 : 0.0;
      line(Offset(x, 230 - 10 * open), Offset(x, 248 - 10 * open), _baseColor(dnaB), 6);
      line(Offset(x, 252 + 10 * open), Offset(x, 270 + 10 * open), _baseColor(_pair(dnaB)), 6);
    }
    line(const Offset(52, 228), const Offset(318, 228), const Color(0xFF455A64), 4);
    line(const Offset(52, 272), const Offset(318, 272), const Color(0xFF455A64), 4);

    // mRNA: built under the DNA, then out through the pore to the cytoplasm.
    final out = ease(seg(t, 0.28, 0.42));
    const from = Offset(60, 330), to = Offset(450, 430);
    final route = Path()
      ..moveTo(from.dx, from.dy)
      ..lineTo(330, 330)
      ..lineTo(358, 300)
      ..lineTo(400, 300)
      ..quadraticBezierTo(450, 300, 450, 380)
      ..lineTo(to.dx, to.dy)
      ..lineTo(990, to.dy);
    final m = route.computeMetrics().first;
    final endD = m.length - (990 - to.dx);
    final shown = t < 0.28 ? (gene.length * tx).floor() : gene.length;
    Offset baseAt(int i) => m.getTangentForOffset(_routeD(from.dx, i * 14.0, endD + i * 82 / 3, out, m.length))!.position;
    for (var i = 0; i < shown; i++) {
      final p = baseAt(i);
      line(p, p + const Offset(0, -16), _baseColor(gene[i]), 6);
    }
    if (shown > 0) {
      final sp = Path();
      for (var i = 0; i < shown; i++) {
        final p = baseAt(i) - const Offset(0, -1);
        i == 0 ? sp.moveTo(p.dx - 6, p.dy) : sp.lineTo(p.dx, p.dy);
      }
      path(sp, const Color(0xFFFF8F00), 4);
    }
    if (t < 0.28) {
      oval(Rect.fromCenter(center: Offset(60 + tx * 252, 250), width: 70, height: 100), const Color(0x99FF8F00), line: Colors.white);
    } else if (out >= 1 && f.labels) {
      for (var k = 0; k < codons.length; k++) {
        text(codons[k], to + Offset(k * 82.0 + 41, 22), size: 15, weight: FontWeight.w700, color: k == 5 ? AC.red : AC.ink);
      }
    }

    // Ribosome and tRNAs.
    if (t >= 0.42) {
      final read = seg(t, 0.5, 0.92) * 5;
      final ci = math.min(5, read.floor());
      final rx = to.dx + 41 + 82 * math.min(5.0, read);
      oval(Rect.fromCenter(center: Offset(rx, to.dy + 28), width: 170, height: 56), const Color(0xFF90A4AE).withValues(alpha: 0.9), line: Colors.white, w: 2);
      oval(Rect.fromCenter(center: Offset(rx, to.dy - 52), width: 200, height: 110), const Color(0xFFB0BEC5).withValues(alpha: 0.75), line: Colors.white, w: 2);
      // The growing chain, leaving from the top of the ribosome.
      final made = math.min(5, ci + (read - ci > 0.6 ? 1 : 0));
      final released = seg(t, 0.94, 1);
      Offset bead(int k) {
        final n = made - 1 - k;
        return Offset(rx - 30 - n * 34, to.dy - 125 - n * 26 + (n.isOdd ? 12 : 0)) + Offset(-150 * released, -80 * released);
      }

      for (var k = 0; k < made; k++) {
        if (k > 0) line(bead(k), bead(k - 1), AC.ink, 3);
      }
      for (var k = 0; k < made; k++) {
        circle(bead(k), 20, aaColors[k], line: Colors.white, w: 2);
        if (f.labels) text(aminos[k], bead(k), size: 11, color: Colors.white, weight: FontWeight.w700);
      }
      // A tRNA arriving at the current codon.
      if (ci < 5 && t >= 0.5) {
        final arrive = ease(seg(read - ci, 0, 0.5));
        final tp = lerpO(Offset(rx + 160, 110), Offset(to.dx + 41 + 82 * ci, to.dy - 70), arrive);
        final trna = Path()
          ..moveTo(tp.dx - 30, tp.dy + 40)
          ..lineTo(tp.dx + 30, tp.dy + 40)
          ..lineTo(tp.dx + 18, tp.dy - 20)
          ..lineTo(tp.dx - 18, tp.dy - 20)
          ..close();
        fillPath(trna, const Color(0xFF81C784), line: AC.leafDark);
        if (f.labels) text(_anti(codons[ci]), tp + const Offset(0, 28), size: 13, weight: FontWeight.w700);
        if (read - ci < 0.6) circle(tp + const Offset(0, -34), 18, aaColors[ci], line: Colors.white, w: 2);
      }
      label('Ribosome|राइबोसोम|ರೈಬೋಸೋಮ್', Offset(rx - 120, to.dy + 80), to: Offset(rx - 50, to.dy + 40));
      label('tRNA|tRNA|tRNA', const Offset(920, 130), opacity: t >= 0.5 && ci < 5 ? 1 : 0);
      label('Polypeptide chain|पॉलीपेप्टाइड शृंखला|ಪಾಲಿಪೆಪ್ಟೈಡ್ ಸರಪಳಿ', const Offset(560, 110), opacity: seg(t, 0.6, 0.65));
    }
    label('Nucleus|केंद्रक|ಕೋಶಕೇಂದ್ರ', const Offset(190, 160));
    label('DNA (gene)|DNA (जीन)|DNA (ಜೀನ್)', const Offset(190, 200), size: 15);
    label('mRNA|mRNA|mRNA', t < 0.42 ? const Offset(120, 375) : const Offset(400, 480), size: 16);
    label('Nuclear pore|केंद्रक छिद्र|ಕೋಶಕೇಂದ್ರ ರಂಧ್ರ', const Offset(420, 220), to: const Offset(358, 290), size: 14);
    label('Cytoplasm|कोशिकाद्रव्य|ಕೋಶದ್ರವ್ಯ', const Offset(880, 60));
  }
}

/// The distance along the mRNA route for base [i]: from its place in the nucleus ([d0]) to its
/// place in the cytoplasm ([d1]) as [k] goes 0 → 1.
double _routeD(double x0, double d0, double d1, double k, double len) => (d0 + (d1 - d0) * k).clamp(0, len - 0.01);
