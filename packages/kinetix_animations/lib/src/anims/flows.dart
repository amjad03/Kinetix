import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../draw.dart';
import '../model.dart';

// The circular flow of income, and packet switching.

final circularFlow = KxAnimation(
  id: 'circular-flow-of-income',
  title: const Tr('Circular flow of income', 'आय का चक्रीय प्रवाह', 'ಆದಾಯದ ಚಕ್ರೀಯ ಹರಿವು'),
  subject: 'Economics',
  topic: 'National income',
  levels: const ['Class 11', 'Class 12'],
  alsoSubjects: const ['Commerce', 'Social Science', 'Business Studies'],
  keywords: const ['circular flow', 'income', 'households', 'firms', 'factors of production', 'wages', 'rent', 'interest', 'profit', 'goods and services', 'expenditure', 'macroeconomics', 'national income'],
  seconds: 20,
  thumbT: 0.7,
  steps: const [
    AnimStep(0, Tr('Two sectors', 'दो क्षेत्र', 'ಎರಡು ವಲಯಗಳು'),
        Tr('A simple economy has households, who own land, labour and capital, and firms, who produce goods and services.', 'सरल अर्थव्यवस्था में परिवार (भूमि, श्रम और पूँजी के स्वामी) और फ़र्में (वस्तुएँ और सेवाएँ बनाने वाली) होते हैं।', 'ಸರಳ ಅರ್ಥವ್ಯವಸ್ಥೆಯಲ್ಲಿ ಕುಟುಂಬಗಳು (ಭೂಮಿ, ಶ್ರಮ, ಬಂಡವಾಳದ ಮಾಲೀಕರು) ಮತ್ತು ಉದ್ದಿಮೆಗಳು (ಸರಕು-ಸೇವೆ ಉತ್ಪಾದಕರು) ಇರುತ್ತವೆ.')),
    AnimStep(0.2, Tr('Factor services', 'साधन सेवाएँ', 'ಸಾಧನ ಸೇವೆಗಳು'),
        Tr('Households supply factors of production to firms in the factor market.', 'परिवार साधन बाज़ार में फ़र्मों को उत्पादन के साधन देते हैं।', 'ಕುಟುಂಬಗಳು ಸಾಧನ ಮಾರುಕಟ್ಟೆಯಲ್ಲಿ ಉದ್ದಿಮೆಗಳಿಗೆ ಉತ್ಪಾದನಾ ಸಾಧನಗಳನ್ನು ಒದಗಿಸುತ್ತವೆ.')),
    AnimStep(0.4, Tr('Factor incomes', 'साधन आय', 'ಸಾಧನ ಆದಾಯ'),
        Tr('Firms pay rent, wages, interest and profit: these are the households’ incomes.', 'फ़र्में लगान, मज़दूरी, ब्याज और लाभ देती हैं: यही परिवारों की आय है।', 'ಉದ್ದಿಮೆಗಳು ಗೇಣಿ, ಕೂಲಿ, ಬಡ್ಡಿ ಮತ್ತು ಲಾಭ ಪಾವತಿಸುತ್ತವೆ: ಇವೇ ಕುಟುಂಬಗಳ ಆದಾಯ.')),
    AnimStep(0.6, Tr('Goods and services', 'वस्तुएँ और सेवाएँ', 'ಸರಕು ಮತ್ತು ಸೇವೆಗಳು'),
        Tr('Firms sell the goods and services they produce to households in the product market.', 'फ़र्में अपनी बनाई वस्तुएँ और सेवाएँ उत्पाद बाज़ार में परिवारों को बेचती हैं।', 'ಉದ್ದಿಮೆಗಳು ತಾವು ಉತ್ಪಾದಿಸಿದ ಸರಕು-ಸೇವೆಗಳನ್ನು ಉತ್ಪನ್ನ ಮಾರುಕಟ್ಟೆಯಲ್ಲಿ ಕುಟುಂಬಗಳಿಗೆ ಮಾರುತ್ತವೆ.')),
    AnimStep(0.8, Tr('Spending', 'व्यय', 'ವೆಚ್ಚ'),
        Tr('Households spend their income on them, which becomes the firms’ revenue. Real goods flow one way, money the other, in a circle.', 'परिवार अपनी आय इन पर ख़र्च करते हैं, जो फ़र्मों का राजस्व बनती है। वास्तविक प्रवाह एक ओर, मुद्रा प्रवाह दूसरी ओर, एक चक्र में।', 'ಕುಟುಂಬಗಳು ತಮ್ಮ ಆದಾಯವನ್ನು ಅವುಗಳ ಮೇಲೆ ಖರ್ಚು ಮಾಡುತ್ತವೆ; ಅದು ಉದ್ದಿಮೆಗಳ ಆದಾಯ. ವಾಸ್ತವ ಹರಿವು ಒಂದು ಕಡೆ, ಹಣದ ಹರಿವು ಇನ್ನೊಂದು ಕಡೆ, ಚಕ್ರದಲ್ಲಿ.')),
  ],
  painter: _CircularFlow.new,
);

class _CircularFlow extends AnimPainter {
  _CircularFlow(super.f);

  static const real = Color(0xFF3A5BC7), money = Color(0xFF188038);

  @override
  void draw() {
    final step = circularFlow.stepAt(t);
    // Households (left) and firms (right).
    const hh = Rect.fromLTWH(60, 220, 220, 160), firms = Rect.fromLTWH(720, 220, 220, 160);
    rect(hh, const Color(0xFFFFF3E0), line: step == 0 ? AC.accent : AC.line, w: step == 0 ? 4 : 2, radius: 22);
    rect(firms, const Color(0xFFE3F2FD), line: step == 0 ? AC.accent : AC.line, w: step == 0 ? 4 : 2, radius: 22);
    // A house and a factory.
    fillPath(Path()..moveTo(130, 290)..lineTo(170, 250)..lineTo(210, 290)..close(), AC.red);
    rect(const Rect.fromLTWH(140, 290, 60, 40), Colors.white, line: AC.ink);
    mill(const Offset(830, 335), 0.7);
    text(tr('Households|परिवार|ಕುಟುಂಬಗಳು'), Offset(hh.center.dx, hh.bottom - 22), size: 20, weight: FontWeight.w700);
    text(tr('Firms|फ़र्में|ಉದ್ದಿಮೆಗಳು'), Offset(firms.center.dx, firms.bottom - 22), size: 20, weight: FontWeight.w700);
    // Markets.
    rect(const Rect.fromLTWH(390, 40, 220, 56), Colors.white, line: AC.line, radius: 28);
    text(tr('Product market|उत्पाद बाज़ार|ಉತ್ಪನ್ನ ಮಾರುಕಟ್ಟೆ'), const Offset(500, 68), size: 17, weight: FontWeight.w600);
    rect(const Rect.fromLTWH(390, 504, 220, 56), Colors.white, line: AC.line, radius: 28);
    text(tr('Factor market|साधन बाज़ार|ಸಾಧನ ಮಾರುಕಟ್ಟೆ'), const Offset(500, 532), size: 17, weight: FontWeight.w600);

    // The four flows: inner loop real (blue), outer loop money (green).
    final factors = Path()..moveTo(200, 390)..quadraticBezierTo(240, 500, 390, 520)..moveTo(610, 520)..quadraticBezierTo(760, 500, 800, 390);
    final incomes = Path()..moveTo(860, 390)..quadraticBezierTo(860, 590, 500, 590)..quadraticBezierTo(140, 590, 140, 390);
    final goods = Path()..moveTo(800, 210)..quadraticBezierTo(760, 100, 610, 80)..moveTo(390, 80)..quadraticBezierTo(240, 100, 200, 210);
    final spending = Path()..moveTo(140, 210)..quadraticBezierTo(140, 10, 500, 10)..quadraticBezierTo(860, 10, 860, 210);
    _flowWith(factors, real, step == 1, coins: false);
    _flowWith(incomes, money, step == 2, coins: true);
    _flowWith(goods, real, step == 3, coins: false);
    _flowWith(spending, money, step == 4, coins: true);

    label('Land, labour, capital|भूमि, श्रम, पूँजी|ಭೂಮಿ, ಶ್ರಮ, ಬಂಡವಾಳ', const Offset(500, 470), color: real, opacity: step == 1 ? 1 : 0.5);
    label('Rent, wages, interest, profit|लगान, मज़दूरी, ब्याज, लाभ|ಗೇಣಿ, ಕೂಲಿ, ಬಡ್ಡಿ, ಲಾಭ', const Offset(820, 560), color: money, opacity: step == 2 ? 1 : 0.5, size: 15);
    label('Goods and services|वस्तुएँ और सेवाएँ|ಸರಕು ಮತ್ತು ಸೇವೆಗಳು', const Offset(500, 130), color: real, opacity: step == 3 ? 1 : 0.5);
    label('Spending (₹)|व्यय (₹)|ವೆಚ್ಚ (₹)', const Offset(180, 30), color: money, opacity: step == 4 ? 1 : 0.5);
    label('Real flow|वास्तविक प्रवाह|ವಾಸ್ತವ ಹರಿವು', const Offset(500, 300), color: real, size: 16);
    label('Money flow|मुद्रा प्रवाह|ಹಣದ ಹರಿವು', const Offset(500, 335), color: money, size: 16);
  }

  void _flowWith(Path p, Color col, bool on, {required bool coins}) {
    for (final m in p.computeMetrics()) {
      final sub = m.extractPath(0, m.length);
      arrowPath(sub, on ? col : col.withValues(alpha: 0.35), w: on ? 6 : 4, head: on ? 18 : 14);
      if (!on) continue;
      for (var i = 0; i < 3; i++) {
        final at = m.getTangentForOffset(m.length * fr(t * 5 + i / 3) * 0.9)!.position;
        if (coins) {
          circle(at, 14, const Color(0xFFFFD54F), line: const Color(0xFFB8860B), w: 2);
          text('₹', at, size: 15, weight: FontWeight.w700, color: const Color(0xFF6D4C00));
        } else {
          rect(Rect.fromCenter(center: at, width: 24, height: 24), col, line: Colors.white, w: 2, radius: 6);
        }
      }
    }
  }
}

final packetSwitching = KxAnimation(
  id: 'packet-switching',
  title: const Tr('Packet switching', 'पैकेट स्विचिंग', 'ಪ್ಯಾಕೆಟ್ ಸ್ವಿಚಿಂಗ್'),
  subject: 'Computer Science',
  topic: 'Computer networks',
  levels: const ['Class 11', 'Class 12'],
  alsoSubjects: const ['Informatics Practices', 'Computer Applications'],
  keywords: const ['packet switching', 'packets', 'router', 'network', 'internet', 'ip address', 'routing', 'data transmission', 'header', 'networking'],
  seconds: 20,
  thumbT: 0.5,
  steps: const [
    AnimStep(0, Tr('Split into packets', 'पैकेटों में बाँटना', 'ಪ್ಯಾಕೆಟ್‌ಗಳಾಗಿ ವಿಭಜನೆ'),
        Tr('A message is split into small numbered packets. Each has a header with the sender’s and receiver’s addresses.', 'संदेश को छोटे क्रमांकित पैकेटों में बाँटा जाता है। हर पैकेट के हेडर में भेजने और पाने वाले के पते होते हैं।', 'ಸಂದೇಶವನ್ನು ಸಂಖ್ಯೆ ಹಾಕಿದ ಸಣ್ಣ ಪ್ಯಾಕೆಟ್‌ಗಳಾಗಿ ವಿಭಜಿಸಲಾಗುತ್ತದೆ. ಪ್ರತಿ ಹೆಡರ್‌ನಲ್ಲಿ ಕಳುಹಿಸುವವರ ಮತ್ತು ಸ್ವೀಕರಿಸುವವರ ವಿಳಾಸಗಳಿರುತ್ತವೆ.')),
    AnimStep(0.2, Tr('Routers forward', 'राउटर आगे भेजते हैं', 'ರೌಟರ್‌ಗಳು ಮುಂದೆ ಕಳುಹಿಸುತ್ತವೆ'),
        Tr('Each router reads a packet’s address and sends it on along the best free link at that moment.', 'हर राउटर पैकेट का पता पढ़कर उसे उस समय की सबसे अच्छी खाली कड़ी से आगे भेजता है।', 'ಪ್ರತಿ ರೌಟರ್ ಪ್ಯಾಕೆಟ್ ವಿಳಾಸ ಓದಿ ಆ ಕ್ಷಣದ ಅತ್ಯುತ್ತಮ ಖಾಲಿ ಕೊಂಡಿಯಲ್ಲಿ ಮುಂದೆ ಕಳುಹಿಸುತ್ತದೆ.')),
    AnimStep(0.45, Tr('Different routes', 'अलग-अलग रास्ते', 'ಬೇರೆ ಬೇರೆ ದಾರಿಗಳು'),
        Tr('Packets of the same message may take different routes. If a link is busy or broken, they go round it.', 'एक ही संदेश के पैकेट अलग रास्ते ले सकते हैं। कोई कड़ी व्यस्त या टूटी हो, तो वे उसके चारों ओर से जाते हैं।', 'ಒಂದೇ ಸಂದೇಶದ ಪ್ಯಾಕೆಟ್‌ಗಳು ಬೇರೆ ದಾರಿ ಹಿಡಿಯಬಹುದು. ಕೊಂಡಿ ಕಾರ್ಯನಿರತ ಅಥವಾ ಮುರಿದಿದ್ದರೆ ಸುತ್ತಿ ಹೋಗುತ್ತವೆ.')),
    AnimStep(0.75, Tr('Reassembled', 'फिर से जोड़ना', 'ಮರುಜೋಡಣೆ'),
        Tr('Packets can arrive out of order. The receiver puts them back in order by their numbers to rebuild the message.', 'पैकेट क्रम से बाहर पहुँच सकते हैं। प्राप्तकर्ता उनके क्रमांक से उन्हें क्रम में लगाकर संदेश फिर बनाता है।', 'ಪ್ಯಾಕೆಟ್‌ಗಳು ಕ್ರಮ ತಪ್ಪಿ ತಲುಪಬಹುದು. ಸ್ವೀಕರಿಸುವವರು ಸಂಖ್ಯೆಗಳ ಪ್ರಕಾರ ಕ್ರಮಗೊಳಿಸಿ ಸಂದೇಶವನ್ನು ಮರುರಚಿಸುತ್ತಾರೆ.')),
  ],
  painter: _Packets.new,
);

class _Packets extends AnimPainter {
  _Packets(super.f);

  static const nodes = [Offset(330, 150), Offset(330, 450), Offset(500, 300), Offset(670, 150), Offset(670, 450)];
  static const links = [(0, 2), (1, 2), (0, 3), (1, 4), (2, 3), (2, 4), (3, 4), (0, 1)];
  static const send = Offset(110, 300), recv = Offset(890, 300);
  static const cols = [Color(0xFFE53935), Color(0xFFFB8C00), Color(0xFF43A047), Color(0xFF1E88E5), Color(0xFF8E24AA)];
  static const word = 'HELLO';
  // Each packet's route (router indices), and when it leaves (0..1 of the travel time).
  static const routes = [
    [0, 3],
    [1, 4],
    [0, 2, 4],
    [1, 2, 4],
    [0, 1, 4],
  ];
  static const departs = [0.0, 0.08, 0.16, 0.24, 0.32];
  static const speeds = [1.0, 0.7, 0.8, 0.6, 0.9];

  @override
  void draw() {
    final broken = t >= 0.45;
    for (final (a, b) in links) {
      final busy = broken && a == 2 && b == 3;
      line(nodes[a], nodes[b], busy ? AC.red.withValues(alpha: 0.6) : AC.line, 6);
      if (busy) {
        final m = (nodes[a] + nodes[b]) / 2;
        line(m + const Offset(-12, -12), m + const Offset(12, 12), AC.red, 5);
        line(m + const Offset(12, -12), m + const Offset(-12, 12), AC.red, 5);
      }
    }
    for (final n in [0, 1]) {
      line(send, nodes[n], AC.line, 6);
      line(recv, nodes[n + 3], AC.line, 6);
    }
    for (final n in nodes) {
      circle(n, 30, const Color(0xFF455A64), line: Colors.white, w: 3);
      for (var k = 0; k < 4; k++) {
        arrow(polar(n, 6, k * math.pi / 2), polar(n, 20, k * math.pi / 2), Colors.white, w: 2, head: 7);
      }
    }
    _computer(send, tr('Sender|प्रेषक|ಕಳುಹಿಸುವವರು'));
    _computer(recv, tr('Receiver|प्राप्तकर्ता|ಸ್ವೀಕರಿಸುವವರು'));

    // The message, split.
    final split = ease(seg(t, 0.03, 0.18));
    final travel = seg(t, 0.2, 0.8);
    final arrived = <int>[];
    for (var i = 0; i < 5; i++) {
      final home = Offset(60 + i * 26.0, 200) + Offset(0, -20 * split) + Offset(i * 12.0 * split, 0);
      final route = [send, for (final r in routes[i]) nodes[r], recv];
      final k = ((travel - departs[i]) / (0.6 * speeds[i])).clamp(0.0, 1.0);
      Offset p;
      if (k <= 0) {
        p = home;
      } else {
        final legs = route.length - 1;
        final u = k * legs;
        final j = math.min(legs - 1, u.floor());
        p = lerpO(route[j], route[j + 1], u - j);
        if (k >= 1) arrived.add(i);
      }
      if (k < 1 && (split >= 0.5 || k > 0)) _packet(p, i, true);
    }
    // Arrival order, then sorted.
    final order = [...arrived]..sort((a, b) => (departs[a] + 0.6 * speeds[a]).compareTo(departs[b] + 0.6 * speeds[b]));
    final sorted = ease(seg(t, 0.82, 0.92));
    for (var j = 0; j < order.length; j++) {
      final i = order[j];
      final from = Offset(820 + j * 34.0, 420);
      final to = Offset(820 + i * 34.0, 420);
      _packet(lerpO(from, to, sorted) - Offset(0, 20 * math.sin(sorted * math.pi) * (i.isEven ? 1 : -1)), i, true);
    }
    if (t >= 0.92) text(word, const Offset(890, 480), size: 30, weight: FontWeight.w700, color: AC.accent);
    if (split < 0.5) text(word, const Offset(120, 200), size: 30, weight: FontWeight.w700);
    label('Router|राउटर|ರೌಟರ್', nodes[2] + const Offset(0, -52), size: 15);
    label('Link busy|कड़ी व्यस्त|ಕೊಂಡಿ ಕಾರ್ಯನಿರತ', (nodes[2] + nodes[3]) / 2 + const Offset(60, 30), size: 14, color: AC.red, opacity: broken ? 1 : 0);
    label('Header: to, from, number|हेडर: किसे, किससे, क्रमांक|ಹೆಡರ್: ಯಾರಿಗೆ, ಯಾರಿಂದ, ಸಂಖ್ಯೆ', const Offset(160, 110), size: 14, opacity: split);
    label('Arrived out of order|क्रम से बाहर पहुँचे|ಕ್ರಮ ತಪ್ಪಿ ತಲುಪಿದವು', const Offset(860, 375), size: 14, opacity: order.length > 1 && sorted < 0.5 ? 1 : 0);
  }

  void _packet(Offset p, int i, bool numbered) {
    rect(Rect.fromCenter(center: p, width: 30, height: 30), cols[i], line: Colors.white, w: 2, radius: 6);
    text(word[i], p + const Offset(0, 2), size: 14, color: Colors.white, weight: FontWeight.w700);
    if (numbered) {
      circle(p + const Offset(13, -13), 9, AC.ink);
      text('${i + 1}', p + const Offset(13, -13), size: 10, color: Colors.white, weight: FontWeight.w700);
    }
  }

  void _computer(Offset o, String name) {
    rect(Rect.fromCenter(center: o, width: 110, height: 76), const Color(0xFF263238), radius: 8);
    rect(Rect.fromCenter(center: o, width: 96, height: 62), const Color(0xFF80DEEA), radius: 4);
    rect(Rect.fromCenter(center: o + const Offset(0, 50), width: 50, height: 10), const Color(0xFF263238), radius: 3);
    text(name, o + const Offset(0, 74), size: 16, weight: FontWeight.w700);
  }
}
