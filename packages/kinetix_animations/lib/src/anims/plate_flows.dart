import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../draw.dart';

/// The circular flow of income in a two-sector economy, drawn as in a macroeconomics text: the
/// real flows (factor services, goods and services) on the inner loop, the money flows (factor
/// payments, consumption spending) on the outer one, the two markets between; beside it the
/// factor incomes and the identity income = expenditure = output.
class CircularFlowPlate extends AnimPainter {
  CircularFlowPlate(super.f);

  static const real = TP.blue, money = Color(0xFF9A7424);
  static const hh = Rect.fromLTWH(56, 236, 178, 128), firms = Rect.fromLTWH(446, 236, 178, 128);
  static const product = Rect.fromLTWH(250, 64, 180, 44), factor = Rect.fromLTWH(250, 492, 180, 44);

  int get step => t < 0.2 ? 0 : (t < 0.4 ? 1 : (t < 0.6 ? 2 : (t < 0.8 ? 3 : 4)));

  @override
  void draw() {
    // Paths: inner (real) and outer (money) loops.
    final services = wireRun([Offset(hh.left + 120, hh.bottom), Offset(hh.left + 120, factor.center.dy), Offset(factor.left, factor.center.dy)], radius: 16);
    final services2 = wireRun([Offset(factor.right, factor.center.dy), Offset(firms.left + 58, factor.center.dy), Offset(firms.left + 58, firms.bottom)], radius: 16);
    final goods = wireRun([Offset(firms.left + 58, firms.top), Offset(firms.left + 58, product.center.dy), Offset(product.right, product.center.dy)], radius: 16);
    final goods2 = wireRun([Offset(product.left, product.center.dy), Offset(hh.left + 120, product.center.dy), Offset(hh.left + 120, hh.top)], radius: 16);
    final payments = wireRun([Offset(firms.right - 30, firms.bottom), Offset(firms.right - 30, 572), Offset(hh.left + 30, 572), Offset(hh.left + 30, hh.bottom)], radius: 20);
    final spending = wireRun([Offset(hh.left + 30, hh.top), Offset(hh.left + 30, 30), Offset(firms.right - 30, 30), Offset(firms.right - 30, firms.top)], radius: 20);
    _flow([services, services2], real, step == 1, false);
    _flow([goods, goods2], real, step == 3, false);
    _flow([payments], money, step == 2, true);
    _flow([spending], money, step == 4, true);
    _sector(hh, 'Households|परिवार|ಕುಟುಂಬಗಳು', 'own land, labour, capital and enterprise|भूमि, श्रम, पूँजी और उद्यम के स्वामी|ಭೂಮಿ, ಶ್ರಮ, ಬಂಡವಾಳ, ಉದ್ಯಮದ ಒಡೆಯರು', step == 0);
    _sector(firms, 'Firms|फ़र्में|ಉದ್ದಿಮೆಗಳು', 'hire factors and produce goods and services|साधन लेकर वस्तुएँ व सेवाएँ बनाती हैं|ಸಾಧನ ಬಳಸಿ ಸರಕು-ಸೇವೆ ಉತ್ಪಾದಿಸುತ್ತವೆ', step == 0);
    _market(product, 'Product market|उत्पाद बाज़ार|ಉತ್ಪನ್ನ ಮಾರುಕಟ್ಟೆ');
    _market(factor, 'Factor market|साधन बाज़ार|ಸಾಧನ ಮಾರುಕಟ್ಟೆ');
    // Flow names.
    final op = [1.0, 1.0, 1.0, 1.0, 1.0];
    tag('Factor services|साधन सेवाएँ|ಸಾಧನ ಸೇವೆಗಳು', Offset(hh.left + 130, 430), size: 13, color: real, align: -1, opacity: step == 1 ? 1 : 0.6, weight: step == 1 ? FontWeight.w600 : FontWeight.w500);
    tag('Goods and services|वस्तुएँ और सेवाएँ|ಸರಕು ಮತ್ತು ಸೇವೆಗಳು', Offset(firms.left + 48, 170), size: 13, color: real, align: 1, opacity: step == 3 ? 1 : 0.6, weight: step == 3 ? FontWeight.w600 : FontWeight.w500);
    tag('Factor payments: rent, wages, interest, profit|साधन भुगतान: लगान, मज़दूरी, ब्याज, लाभ|ಸಾಧನ ಪಾವತಿ: ಗೇಣಿ, ಕೂಲಿ, ಬಡ್ಡಿ, ಲಾಭ', const Offset(340, 556), size: 13, color: money, opacity: step == 2 ? op[2] : 0.6, weight: step == 2 ? FontWeight.w600 : FontWeight.w500, maxWidth: 420);
    tag('Consumption spending|उपभोग व्यय|ಬಳಕೆಯ ವೆಚ್ಚ', const Offset(340, 46), size: 13, color: money, opacity: step == 4 ? 1 : 0.6, weight: step == 4 ? FontWeight.w600 : FontWeight.w500);
    _exchange();
    _side(const Rect.fromLTWH(652, 52, 324, 492));
  }

  /// What passes between the sectors at this step, with its direction, in the middle.
  void _exchange() {
    if (step == 0) return;
    const o = Offset(340, 300);
    final toFirms = step == 1 || step == 4;
    final col = step == 1 || step == 3 ? real : money;
    final what = switch (step) {
      1 => 'land, labour, capital, enterprise|भूमि, श्रम, पूँजी, उद्यम|ಭೂಮಿ, ಶ್ರಮ, ಬಂಡವಾಳ, ಉದ್ಯಮ',
      2 => 'rent, wages, interest, profit|लगान, मज़दूरी, ब्याज, लाभ|ಗೇಣಿ, ಕೂಲಿ, ಬಡ್ಡಿ, ಲಾಭ',
      3 => 'goods and services|वस्तुएँ और सेवाएँ|ಸರಕು ಮತ್ತು ಸೇವೆಗಳು',
      _ => 'payment for goods and services|वस्तुओं और सेवाओं का भुगतान|ಸರಕು-ಸೇವೆಗಳ ಪಾವತಿ',
    };
    final k = easeS(seg(t, [0.2, 0.4, 0.6, 0.8][step - 1], [0.2, 0.4, 0.6, 0.8][step - 1] + 0.03));
    final a = o + Offset(toFirms ? -80 : 80, 0), b = o + Offset(toFirms ? 80 : -80, 0);
    arrowTo(a, lerpO(a, b, k), col, w: LW.bold, len: 12);
    note(tr(what), o + const Offset(0, -22), size: 13, color: col, align: 0, weight: FontWeight.w600, maxWidth: 200, opacity: k);
  }

  void _sector(Rect r, String name, String what, bool on) {
    final rr = RRect.fromRectAndRadius(r, const Radius.circular(6));
    c.drawRRect(rr, vGrad(r, [TP.paper, TP.paper2]));
    c.drawRRect(rr, linePaint(on ? TP.ink : TP.ink2, on ? LW.line * 1.4 : LW.fine));
    note(tr(name), Offset(r.center.dx, r.top + 40), size: 19, color: TP.ink, align: 0, weight: FontWeight.w600, halo: false);
    note(tr(what), Offset(r.center.dx, r.top + 82), size: 11.5, color: TP.ink2, align: 0, halo: false, maxWidth: r.width - 24);
  }

  void _market(Rect r, String name) {
    final rr = RRect.fromRectAndRadius(r, Radius.circular(r.height / 2));
    c.drawRRect(rr, Paint()..color = TP.paper);
    c.drawRRect(rr, linePaint(TP.ink2, LW.fine));
    note(tr(name), r.center, size: 13.5, color: TP.ink, align: 0, weight: FontWeight.w600, halo: false);
  }

  void _flow(List<Path> parts, Color col, bool on, bool isMoney) {
    for (final p in parts) {
      c.drawPath(p, linePaint(col.withValues(alpha: on ? 1 : 0.45), on ? LW.bold * 1.3 : LW.line));
      pathHeads(p, col.withValues(alpha: on ? 1 : 0.55), [0.55], len: 12);
      if (!on) continue;
      final m = p.computeMetrics().first;
      for (var i = 0; i < 4; i++) {
        final k = fr(t * 4 + i / 4);
        final q = m.getTangentForOffset(m.length * k)!.position;
        if (isMoney) {
          sphere(q, 8, const Color(0xFFD7B35C));
          note('₹', q + const Offset(0, 0.5), size: 9.5, color: const Color(0xFF5E4614), align: 0, halo: false, weight: FontWeight.w700);
        } else {
          final r = Rect.fromCenter(center: q, width: 14, height: 14);
          c.drawRect(r, vGrad(r, [tone(col, 0.35), col]));
          c.drawRect(r, linePaint(tone(col, -0.4), 0.8));
        }
      }
    }
  }

  void _side(Rect r) {
    panel(r, title: 'A two-sector economy|दो-क्षेत्रीय अर्थव्यवस्था|ಎರಡು ವಲಯದ ಅರ್ಥವ್ಯವಸ್ಥೆ');
    // Legend.
    final x = r.left + 18;
    c.drawLine(Offset(x, r.top + 52), Offset(x + 36, r.top + 52), linePaint(real, LW.bold));
    note(tr('Real flow (goods, services, factors)|वास्तविक प्रवाह (वस्तुएँ, सेवाएँ, साधन)|ವಾಸ್ತವ ಹರಿವು (ಸರಕು, ಸೇವೆ, ಸಾಧನ)'), Offset(x + 46, r.top + 52), size: 12, color: TP.ink, halo: false, maxWidth: 240);
    c.drawLine(Offset(x, r.top + 78), Offset(x + 36, r.top + 78), linePaint(money, LW.bold));
    note(tr('Money flow (₹)|मुद्रा प्रवाह (₹)|ಹಣದ ಹರಿವು (₹)'), Offset(x + 46, r.top + 78), size: 12, color: TP.ink, halo: false);
    // Factor incomes as a stacked bar (₹ crore a year, an example).
    final shown = seg(t, 0.4, 0.5);
    note(tr('Factor incomes, ₹ crore a year (example)|साधन आय, ₹ करोड़ प्रति वर्ष (उदाहरण)|ಸಾಧನ ಆದಾಯ, ₹ ಕೋಟಿ ವರ್ಷಕ್ಕೆ (ಉದಾಹರಣೆ)'), Offset(x, r.top + 122), size: 12, color: TP.ink2, weight: FontWeight.w600, halo: false, maxWidth: 290);
    const parts = [(60.0, 'Wages|मज़दूरी|ಕೂಲಿ'), (10.0, 'Rent|लगान|ಗೇಣಿ'), (10.0, 'Interest|ब्याज|ಬಡ್ಡಿ'), (20.0, 'Profit|लाभ|ಲಾಭ')];
    final bar = Rect.fromLTWH(x, r.top + 142, r.width - 36, 26);
    var bx = bar.left;
    for (var i = 0; i < parts.length; i++) {
      final (v, name) = parts[i];
      final w = bar.width * v / 100 * shown;
      final seg2 = Rect.fromLTWH(bx, bar.top, w, bar.height);
      final col = Color.lerp(tone(money, 0.55), tone(money, -0.1), i / 3)!;
      if (w > 0) {
        c.drawRect(seg2, Paint()..color = col);
        c.drawRect(seg2, linePaint(TP.paper, 1));
      }
      if (shown >= 1) {
        note('${v.round()}', seg2.center, size: 11, color: i >= 2 ? Colors.white : TP.ink, align: 0, halo: false, weight: FontWeight.w600);
        final ly = bar.bottom + 16 + (i.isOdd ? 16 : 0);
        c.drawLine(Offset(seg2.center.dx, bar.bottom), Offset(seg2.center.dx, ly - 6), linePaint(TP.ink2, LW.hair));
        note(tr(name), Offset(seg2.center.dx, ly), size: 11, color: TP.ink2, align: 0, halo: false);
      }
      bx += w;
    }
    c.drawRect(bar, linePaint(TP.rule, LW.hair));
    // The identity.
    final id = seg(t, 0.82, 0.9);
    final y0 = r.top + 250;
    note(tr('In each period:|हर अवधि में:|ಪ್ರತಿ ಅವಧಿಯಲ್ಲಿ:'), Offset(x, y0), size: 12, color: TP.ink2, weight: FontWeight.w600, halo: false);
    final rows = [
      ('Factor incomes|साधन आय|ಸಾಧನ ಆದಾಯ', step >= 2),
      ('Consumption spending|उपभोग व्यय|ಬಳಕೆಯ ವೆಚ್ಚ', step >= 4),
      ('Value of output|उत्पादन का मूल्य|ಉತ್ಪಾದನೆಯ ಮೌಲ್ಯ', step >= 3),
    ];
    for (var i = 0; i < rows.length; i++) {
      final y = y0 + 32 + i * 30.0;
      final (name, on) = rows[i];
      note(tr(name), Offset(x, y), size: 14, color: on ? TP.ink : TP.ink2, halo: false, opacity: on ? 1 : 0.5);
      note('₹ 100', Offset(r.right - 18, y), size: 14, color: on ? TP.ink : TP.ink2, align: 1, weight: FontWeight.w600, halo: false, opacity: on ? 1 : 0.5);
      if (i < 2) note('=', Offset(r.right - 80, y + 15), size: 13, color: TP.ink2, align: 0, halo: false, opacity: id);
    }
    c.drawLine(Offset(x, y0 + 126), Offset(r.right - 18, y0 + 126), linePaint(TP.rule, LW.hair));
    note(tr('Income = Expenditure = Output: the money flow equals the real flow in value.|आय = व्यय = उत्पादन: मुद्रा प्रवाह मूल्य में वास्तविक प्रवाह के बराबर है।|ಆದಾಯ = ವೆಚ್ಚ = ಉತ್ಪಾದನೆ: ಮೌಲ್ಯದಲ್ಲಿ ಹಣದ ಹರಿವು ವಾಸ್ತವ ಹರಿವಿಗೆ ಸಮ.'), Offset(x, y0 + 162), size: 13, color: TP.ink, weight: FontWeight.w600, halo: false, maxWidth: r.width - 36, opacity: 0.3 + 0.7 * id);
  }
}

/// Packet switching: a message split into numbered packets, forwarded router by router along
/// different routes (one link goes down), arriving out of order and reassembled; beside it the
/// fields of a packet and the receiver's buffer.
class PacketsPlate extends AnimPainter {
  PacketsPlate(super.f);

  static const routers = [Offset(230, 168), Offset(230, 432), Offset(380, 300), Offset(530, 168), Offset(530, 432)];
  static const links = [(0, 2), (1, 2), (0, 3), (1, 4), (2, 3), (2, 4), (3, 4), (0, 1)];
  static const send = Offset(84, 300), recv = Offset(660, 300);
  static const word = 'HELLO';
  static const routes = [
    [0, 3],
    [1, 4],
    [0, 2, 4],
    [1, 2, 4],
    [0, 1, 4],
  ];
  static const departs = [0.0, 0.08, 0.16, 0.24, 0.32];
  static const speeds = [1.0, 0.7, 0.8, 0.6, 0.9];

  /// How far packet [i] has gone along its route (0 at the sender, 1 at the receiver).
  double progress(int i) => ((seg(t, 0.2, 0.8) - departs[i]) / (0.6 * speeds[i])).clamp(0.0, 1.0);

  List<Offset> route(int i) => [send, for (final r in routes[i]) routers[r], recv];

  @override
  void draw() {
    final broken = t >= 0.45;
    // Links.
    for (final (a, b) in links) {
      final down = broken && a == 2 && b == 3;
      final p = routers[a], q = routers[b];
      if (down) {
        dash(p, q, TP.red.withValues(alpha: 0.7), w: LW.line, on: 7, off: 5);
        final m = (p + q) / 2;
        c.drawLine(m + const Offset(-8, -8), m + const Offset(8, 8), linePaint(TP.red, 2.2));
        c.drawLine(m + const Offset(8, -8), m + const Offset(-8, 8), linePaint(TP.red, 2.2));
      } else {
        c.drawLine(p, q, linePaint(TP.steel, 2.6));
      }
    }
    for (final n in [0, 1]) {
      c.drawLine(send + const Offset(30, 0), routers[n], linePaint(TP.steel, 2.6));
      c.drawLine(recv - const Offset(30, 0), routers[n + 3], linePaint(TP.steel, 2.6));
    }
    // Routes in use (faint) while packets travel.
    if (t >= 0.2 && t < 0.82) {
      for (var i = 0; i < 5; i++) {
        final k = progress(i);
        if (k <= 0 || k >= 1) continue;
        final pts = route(i);
        final p = Path()..moveTo(pts[0].dx, pts[0].dy);
        for (final q in pts.skip(1)) {
          p.lineTo(q.dx, q.dy);
        }
        c.drawPath(p, linePaint(TP.blue.withValues(alpha: 0.18), 6));
      }
    }
    for (var i = 0; i < routers.length; i++) {
      _router(routers[i], 'R${i + 1}');
    }
    _host(send, 'Sender|प्रेषक|ಕಳುಹಿಸುವವರು', '192.168.1.5');
    _host(recv, 'Receiver|प्राप्तकर्ता|ಸ್ವೀಕರಿಸುವವರು', '203.0.113.7');
    // The message, then its packets.
    final split = easeS(seg(t, 0.03, 0.17));
    if (split < 1) note(word, const Offset(106, 214), size: 24, color: TP.ink.withValues(alpha: 1 - split), align: 0, weight: FontWeight.w600, spacing: 3);
    for (var i = 0; i < 5; i++) {
      final k = progress(i);
      if (k >= 1) continue;
      Offset p;
      if (k <= 0) {
        p = Offset(112 + (i - 2) * 44.0 * split, 214 + 22 * split);
        if (split <= 0) continue;
      } else {
        final pts = route(i);
        final legs = pts.length - 1;
        final u = easeS(k) * legs;
        final j = math.min(legs - 1, u.floor());
        p = lerpO(pts[j], pts[j + 1], u - j) + const Offset(0, -16);
      }
      _packet(p, i, opacity: k <= 0 ? split : 1);
    }
    _anatomy(const Rect.fromLTWH(722, 52, 254, 228));
    _buffer(const Rect.fromLTWH(722, 296, 254, 248));
    callout('Router|राउटर|ರೌಟರ್', routers[2] + const Offset(0, 12), routers[2] + const Offset(40, 70));
    tag('Each router stores a packet for a moment, reads its destination address and sends it on along the best free link.|हर राउटर पैकेट को क्षण भर रखता है, उसका गंतव्य पता पढ़ता है और सबसे अच्छी खाली कड़ी से आगे भेजता है।|ಪ್ರತಿ ರೌಟರ್ ಪ್ಯಾಕೆಟ್ ಅನ್ನು ಕ್ಷಣ ಇಟ್ಟುಕೊಂಡು, ಗಮ್ಯ ವಿಳಾಸ ಓದಿ, ಉತ್ತಮ ಖಾಲಿ ಕೊಂಡಿಯಲ್ಲಿ ಮುಂದೆ ಕಳುಹಿಸುತ್ತದೆ.', const Offset(40, 540), size: 12.5, color: TP.ink2, align: -1, maxWidth: 620);
    callout('Link down|कड़ी बंद|ಕೊಂಡಿ ಸ್ಥಗಿತ', (routers[2] + routers[3]) / 2 + const Offset(6, 4), (routers[2] + routers[3]) / 2 + const Offset(70, 34), color: TP.red, opacity: broken ? 1 : 0);
  }

  void _router(Offset o, String name) {
    // The usual network symbol: a short cylinder with four arrows on top.
    const rx = 28.0, ry = 9.0, h = 14.0;
    final body = Rect.fromLTRB(o.dx - rx, o.dy - h / 2, o.dx + rx, o.dy + h / 2);
    c.drawRect(body, hGrad(body, [const Color(0xFF3E5A73), const Color(0xFF6F8BA3), const Color(0xFF3E5A73)]));
    c.drawOval(Rect.fromCenter(center: o + const Offset(0, h / 2), width: rx * 2, height: ry * 2), Paint()..color = const Color(0xFF3E5A73));
    c.drawRect(body, Paint()..color = const Color(0x00000000));
    c.drawRect(Rect.fromLTRB(body.left, body.top, body.right, body.bottom), hGrad(body, [const Color(0xFF3E5A73), const Color(0xFF6F8BA3), const Color(0xFF3E5A73)]));
    final top = Rect.fromCenter(center: o - const Offset(0, h / 2), width: rx * 2, height: ry * 2);
    c.drawOval(top, Paint()..color = const Color(0xFF86A0B6));
    c.drawOval(top, linePaint(const Color(0xFF2E4458), LW.hair));
    c.drawLine(Offset(body.left, body.top), Offset(body.left, body.bottom), linePaint(const Color(0xFF2E4458), LW.hair));
    c.drawLine(Offset(body.right, body.top), Offset(body.right, body.bottom), linePaint(const Color(0xFF2E4458), LW.hair));
    final tc = o - const Offset(0, h / 2);
    for (final (a, b) in [(const Offset(-20, 0), const Offset(-6, 0)), (const Offset(6, 0), const Offset(20, 0)), (const Offset(0, -6.5), const Offset(0, -1.5)), (const Offset(0, 1.5), const Offset(0, 6.5))]) {
      final from = tc + Offset(a.dx, a.dy), to = tc + Offset(b.dx, b.dy);
      c.drawLine(from, to, linePaint(Colors.white, 1.2));
      dart(to, (to - from).direction, Colors.white, len: 4);
    }
    note(name, o + const Offset(0, 24), size: 11.5, color: TP.ink2, align: 0, weight: FontWeight.w600);
  }

  void _host(Offset o, String name, String ip) {
    // A desktop computer in outline: monitor, stand and base.
    final screen = Rect.fromCenter(center: o + const Offset(0, -6), width: 60, height: 42);
    c.drawRRect(RRect.fromRectAndRadius(screen.inflate(4), const Radius.circular(3)), Paint()..color = TP.graphite);
    c.drawRect(screen, vGrad(screen, [const Color(0xFFDCE6EC), const Color(0xFFB9C8D2)]));
    c.drawPath(
        Path()
          ..moveTo(o.dx - 6, screen.bottom + 4)
          ..lineTo(o.dx + 6, screen.bottom + 4)
          ..lineTo(o.dx + 8, screen.bottom + 14)
          ..lineTo(o.dx - 8, screen.bottom + 14)
          ..close(),
        Paint()..color = TP.graphite);
    c.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: Offset(o.dx, screen.bottom + 16), width: 34, height: 5), const Radius.circular(2)), Paint()..color = TP.graphite);
    note(tr(name), o + const Offset(0, 40), size: 13, color: TP.ink, align: 0, weight: FontWeight.w600);
    note(ip, o + const Offset(0, 58), size: 11, color: TP.ink2, align: 0);
  }

  void _packet(Offset p, int i, {double opacity = 1}) {
    // Header (number) and data (one letter).
    final r = Rect.fromCenter(center: p, width: 38, height: 20);
    final head = Rect.fromLTWH(r.left, r.top, 15, r.height);
    c.drawRect(r, Paint()..color = Colors.white.withValues(alpha: opacity));
    c.drawRect(head, Paint()..color = TP.blue.withValues(alpha: opacity));
    c.drawRect(r, linePaint(tone(TP.blue, -0.3).withValues(alpha: opacity), LW.fine));
    note('${i + 1}', head.center, size: 10.5, color: Colors.white.withValues(alpha: opacity), align: 0, halo: false, weight: FontWeight.w700);
    note(word[i], Offset(head.right + 11.5, r.center.dy), size: 12, color: TP.ink.withValues(alpha: opacity), align: 0, halo: false, weight: FontWeight.w600);
  }

  void _anatomy(Rect r) {
    panel(r, title: 'One packet|एक पैकेट|ಒಂದು ಪ್ಯಾಕೆಟ್');
    final fields = [
      ('Source address|स्रोत पता|ಮೂಲ ವಿಳಾಸ', '192.168.1.5'),
      ('Destination address|गंतव्य पता|ಗಮ್ಯ ವಿಳಾಸ', '203.0.113.7'),
      ('Sequence number|क्रम संख्या|ಅನುಕ್ರಮ ಸಂಖ್ಯೆ', '3 of 5'),
      ('Data|डेटा|ದತ್ತಾಂಶ', '“L”'),
    ];
    for (var i = 0; i < fields.length; i++) {
      final y = r.top + 44 + i * 42.0;
      final box = Rect.fromLTWH(r.left + 16, y, r.width - 32, 36);
      final isHead = i < 3;
      c.drawRect(box, Paint()..color = isHead ? tone(TP.blue, 0.82) : TP.paper);
      c.drawRect(box, linePaint(isHead ? tone(TP.blue, 0.2) : TP.rule, LW.fine));
      final (name, value) = fields[i];
      note(tr(name), Offset(box.left + 8, box.top + 11), size: 10.5, color: TP.ink2, halo: false);
      note(value, Offset(box.left + 8, box.top + 26), size: 13, color: TP.ink, weight: FontWeight.w600, halo: false);
    }
    final hy0 = r.top + 44, hy1 = r.top + 44 + 3 * 42 - 6;
    c.drawLine(Offset(r.right - 10, hy0), Offset(r.right - 10, hy1), linePaint(TP.blue, LW.fine));
    note(tr('header|हेडर|ಹೆಡರ್'), Offset(r.right - 14, hy0 - 10), size: 10.5, color: TP.blue, align: 1, halo: false, weight: FontWeight.w600);
  }

  void _buffer(Rect r) {
    panel(r, title: "Receiver's buffer|प्राप्तकर्ता का बफ़र|ಸ್ವೀಕರಿಸುವವರ ಬಫರ್");
    // Packets in the order they arrived, then sorted by number.
    final arrived = [for (var i = 0; i < 5; i++) if (progress(i) >= 1) i]..sort((a, b) => (departs[a] + 0.6 * speeds[a]).compareTo(departs[b] + 0.6 * speeds[b]));
    final sorted = easeS(seg(t, 0.82, 0.92));
    note(tr(sorted < 0.5 ? 'in order of arrival|पहुँचने के क्रम में|ತಲುಪಿದ ಕ್ರಮದಲ್ಲಿ' : 'sorted by sequence number|क्रम संख्या से क्रमबद्ध|ಅನುಕ್ರಮ ಸಂಖ್ಯೆಯಂತೆ ಜೋಡಿಸಲಾಗಿದೆ'), Offset(r.left + 16, r.top + 50), size: 12, color: TP.ink2, halo: false);
    for (var s = 0; s < 5; s++) {
      final slot = Rect.fromCenter(center: Offset(r.left + 40 + s * 44.0, r.top + 96), width: 40, height: 24);
      c.drawRect(slot, linePaint(TP.rule, LW.hair));
    }
    for (var j = 0; j < arrived.length; j++) {
      final i = arrived[j];
      final from = Offset(r.left + 40 + j * 44.0, r.top + 96), to = Offset(r.left + 40 + i * 44.0, r.top + 96);
      final arc = math.sin(sorted * math.pi) * 22 * (i > j ? -1 : 1);
      _packet(lerpO(from, to, sorted) + Offset(0, arc), i);
    }
    if (arrived.length > 1 && sorted <= 0) {
      final order = arrived.map((i) => '${i + 1}').join(', ');
      note(tr('arrived: $order|पहुँचे: $order|ತಲುಪಿದವು: $order'), Offset(r.left + 16, r.top + 136), size: 12, color: TP.red, halo: false);
    }
    final done = seg(t, 0.9, 0.95);
    note(tr('Message rebuilt|संदेश फिर से बना|ಸಂದೇಶ ಮರುರಚನೆ'), Offset(r.left + 16, r.top + 172), size: 12, color: TP.ink2, halo: false, opacity: done);
    note(word, Offset(r.left + 16, r.top + 206), size: 30, color: TP.ink, weight: FontWeight.w600, halo: false, spacing: 6, opacity: done);
  }
}
