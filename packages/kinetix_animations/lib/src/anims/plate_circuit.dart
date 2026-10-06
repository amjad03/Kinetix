import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../draw.dart';

/// Electric current in a circuit: a dry cell, a torch bulb in its holder, an ammeter and a
/// knife switch, wired in series; beside it the circuit diagram in standard symbols and the
/// reading. Electrons drift from − round to +; conventional current is drawn + to −.
class CircuitPlate extends AnimPainter {
  CircuitPlate(super.f);

  // The wiring loop.
  static const cTL = Offset(110, 175), cTR = Offset(590, 175), cBR = Offset(590, 470), cBL = Offset(110, 470);
  static const cellTop = Offset(110, 246), cellBottom = Offset(110, 376);
  static const holderL = Offset(312, 175), holderR = Offset(388, 175);
  static const ammTop = Offset(590, 268), ammBottom = Offset(590, 372);
  static const hinge = Offset(300, 470), clip = Offset(408, 470);

  /// The electrons' route, from the − terminal round to the + terminal.
  static final List<Offset> route = [cellBottom, cBL, hinge, clip, cBR, ammBottom, ammTop, cTR, holderR, holderL, cTL, cellTop];

  double get closed => easeS(seg(t, 0.2, 0.26));
  bool get on => t >= 0.25;

  /// The current as a fraction of its steady value (a meter needle's settle).
  double get current => on ? settle(seg(t, 0.25, 0.4) * 1.6).clamp(0.0, 1.25) : 0.0;

  @override
  void draw() {
    _bench();
    _wires();
    _inset(const Offset(306, 338), 78);
    _electrons();
    _cell();
    _holderAndBulb();
    _ammeter();
    _switch();
    _currentArrows();
    _diagram(const Rect.fromLTWH(668, 64, 308, 262));
    _readout(const Rect.fromLTWH(668, 342, 308, 196));
    _labels();
  }

  void _bench() {
    // A faint baseboard under the apparatus.
    final r = RRect.fromRectAndRadius(const Rect.fromLTWH(46, 82, 600, 470), const Radius.circular(10));
    c.drawRRect(r, Paint()..color = TP.paper2);
    c.drawRRect(r, linePaint(TP.rule, LW.hair));
  }

  void _wires() {
    wire(wireRun([cellTop, cTL, holderL]));
    wire(wireRun([holderR, cTR, ammTop]));
    wire(wireRun([ammBottom, cBR, clip]));
    wire(wireRun([hinge, cBL, cellBottom]));
  }

  /// Is [p] hidden inside a component (where the wire runs inside it)?
  bool _inside(Offset p) =>
      (p.dx > holderL.dx - 2 && p.dx < holderR.dx + 2 && (p.dy - 175).abs() < 4) ||
      (p.dy > ammTop.dy - 2 && p.dy < ammBottom.dy + 2 && (p.dx - 590).abs() < 4) ||
      (p.dx > hinge.dx - 4 && p.dx < clip.dx + 4 && (p.dy - 470).abs() < 4) ||
      (p.dy > cellTop.dy - 6 && p.dy < cellBottom.dy + 6 && (p.dx - 110).abs() < 4);

  void _electrons() {
    final path = Path()..moveTo(route[0].dx, route[0].dy);
    for (final p in route.skip(1)) {
      path.lineTo(p.dx, p.dy);
    }
    final m = path.computeMetrics().first;
    const n = 64;
    // Drift: the electrons creep round once the circuit closes (≈ 0.05 of the loop a second).
    final drift = on ? (t - 0.25) * 18 * 0.05 * current.clamp(0.0, 1.0) : 0.0;
    final step = t >= 0.36 && t < 0.56;
    final alpha = t < 0.36 ? 0.75 : (step ? 1.0 : (t < 0.78 ? 0.35 : 0.55));
    for (var i = 0; i < n; i++) {
      final k = fr(i / n + drift);
      var p = m.getTangentForOffset(m.length * k)!.position;
      if (_inside(p)) continue;
      // Random thermal jiggle, always present.
      p += Offset(math.sin(t * 90 + i * 1.7), math.cos(t * 77 + i * 2.3)) * 1.1;
      sphere(p, 3.3, TP.blue, opacity: alpha);
    }
  }

  /// A magnified view of the top wire: copper ions in a lattice, free electrons among them.
  void _inset(Offset o, double r) {
    const src = Offset(232, 175);
    // The magnifier's cone from the wire to the view.
    final d = (o - src);
    final ang = d.direction;
    final spread = math.asin((r / d.distance).clamp(0.0, 1.0));
    for (final s in [-1.0, 1.0]) {
      c.drawLine(src, src + Offset.fromDirection(ang + s * spread, math.sqrt(d.distanceSquared - r * r)), linePaint(TP.hair.withValues(alpha: 0.6), LW.hair));
    }
    c.drawCircle(src, 6, linePaint(TP.ink2, LW.hair));
    c.save();
    c.clipPath(Path()..addOval(Rect.fromCircle(center: o, radius: r)));
    c.drawCircle(o, r, Paint()..shader = RadialGradient(colors: [const Color(0xFFF7EBDD), const Color(0xFFEBD6BF)]).createShader(Rect.fromCircle(center: o, radius: r)));
    const sp = 30.0;
    for (var i = -4; i <= 4; i++) {
      for (var j = -4; j <= 4; j++) {
        final p = o + Offset(i * sp + (j.isOdd ? sp / 2 : 0), j * sp * 0.87) + Offset(math.sin(t * 160 + i * 3 + j), math.cos(t * 140 + j * 5 + i)) * 0.9;
        sphere(p, 9, const Color(0xFFC88A55));
        note('+', p, size: 9, color: Colors.white.withValues(alpha: 0.9), align: 0, halo: false, weight: FontWeight.w700);
      }
    }
    // Free electrons: random thermal motion, plus a slow drift to the left once current flows.
    final drift = on ? (t - 0.25) * 18 * 9 * current.clamp(0.0, 1.0) : 0.0;
    for (var i = 0; i < 30; i++) {
      final x = fr(rnd(i) - drift / (2 * r + 40)) * (2 * r + 40) - r - 20;
      final y = (rnd(i, 1) - 0.5) * 2 * r;
      final p = o + Offset(x, y) + Offset(math.sin(t * 70 * (1 + rnd(i, 2)) + i), math.cos(t * 63 * (1 + rnd(i, 3)) + i * 2)) * 8;
      sphere(p, 4.2, TP.blue, opacity: t >= 0.56 && t < 0.78 ? 0.55 : 1);
    }
    c.restore();
    c.drawCircle(o, r, linePaint(TP.ink2, LW.line));
    if (on && t >= 0.36) {
      arrowTo(o + Offset(r + 60, 44), o + Offset(r + 24, 44), TP.blue, w: LW.fine, len: 9);
      tag('drift|विस्थापन|ಚಲನೆ', o + Offset(r + 68, 44), size: 12.5, color: TP.blue, align: -1);
    }
    tag(
      'Inside the wire: copper ions and free electrons|तार के अंदर: ताँबे के आयन और मुक्त इलेक्ट्रॉन|ತಂತಿಯ ಒಳಗೆ: ತಾಮ್ರದ ಅಯಾನುಗಳು ಮತ್ತು ಮುಕ್ತ ಇಲೆಕ್ಟ್ರಾನ್‌ಗಳು',
      o + Offset(r + 18, -6),
      maxWidth: 128,
      size: 12.5,
      align: -1,
      color: TP.ink2,
    );
  }

  void _cell() {
    // A dry cell standing on its − end: zinc base, labelled jacket, carbon cap with a brass nub.
    const body = Rect.fromLTRB(84, 258, 136, 370);
    cylinderV(body, const Color(0xFF3C5A6B));
    cylinderV(const Rect.fromLTRB(84, 300, 136, 336), const Color(0xFFD9D2C0), edge: const Color(0xFF6A6355));
    note('1.5 V', const Offset(110, 318), size: 11.5, color: TP.ink, align: 0, halo: false, weight: FontWeight.w600);
    cylinderV(const Rect.fromLTRB(86, 366, 134, 377), TP.steel, radius: 2);
    cylinderV(const Rect.fromLTRB(100, 246, 120, 259), TP.brass, radius: 3);
    note('+', const Offset(146, 266), size: 18, color: TP.red, align: 0, weight: FontWeight.w600);
    note('−', const Offset(146, 364), size: 18, color: TP.blue, align: 0, weight: FontWeight.w600);
  }

  void _holderAndBulb() {
    const cx = 350.0;
    final k = current.clamp(0.0, 1.0);
    final hot = Color.lerp(TP.graphite, const Color(0xFFF2B44A), k)!;
    // Glow behind the glass.
    glow(const Offset(cx, 86), 120 * (0.7 + 0.3 * k), const Color(0xFFF4C66A), k);
    // Holder: a bakelite block on the wire with two terminal screws.
    block(const Rect.fromLTRB(308, 160, 392, 192), TP.bakelite, radius: 4);
    terminal(holderL + const Offset(8, 0));
    terminal(holderR - const Offset(8, 0));
    // Screw base (brass, threaded).
    cylinderV(const Rect.fromLTRB(334, 128, 366, 162), TP.brass, radius: 2);
    for (var y = 133.0; y < 160; y += 6) {
      c.drawLine(Offset(334, y), Offset(366, y + 2), linePaint(tone(TP.brass, -0.4), LW.hair));
    }
    // Glass envelope: a pear shape.
    final glass = Path()
      ..moveTo(337, 130)
      ..cubicTo(330, 116, 306, 102, 306, 74)
      ..cubicTo(306, 44, 326, 26, 350, 26)
      ..cubicTo(374, 26, 394, 44, 394, 74)
      ..cubicTo(394, 102, 370, 116, 363, 130)
      ..close();
    c.drawPath(
      glass,
      Paint()
        ..shader = RadialGradient(
          center: const Alignment(-0.35, -0.4),
          colors: [Colors.white, Color.lerp(TP.glass, const Color(0xFFFFF1CC), k)!, Color.lerp(const Color(0xFFC8D9DF), const Color(0xFFF6D88F), k)!],
        ).createShader(const Rect.fromLTRB(306, 26, 394, 130)),
    );
    c.drawPath(glass, linePaint(TP.glassEdge, LW.line));
    c.drawArc(const Rect.fromLTRB(314, 34, 386, 112), math.pi * 1.05, 0.55, false, linePaint(Colors.white.withValues(alpha: 0.9), 2.4));
    // Lead-in wires, a glass support, and the coiled filament.
    final l1 = Path()
      ..moveTo(344, 130)
      ..lineTo(342, 98)
      ..lineTo(334, 72);
    final l2 = Path()
      ..moveTo(356, 130)
      ..lineTo(358, 98)
      ..lineTo(366, 72);
    c.drawPath(l1, linePaint(TP.steelDark, LW.fine));
    c.drawPath(l2, linePaint(TP.steelDark, LW.fine));
    c.drawLine(const Offset(350, 128), const Offset(350, 92), linePaint(TP.glassEdge.withValues(alpha: 0.7), 3));
    final fil = Path()..moveTo(334, 72);
    for (var i = 0; i <= 48; i++) {
      final x = 334 + 32 * i / 48;
      final y = 72 - 5 * math.sin(i / 48 * math.pi) * 1.2 + 3.2 * math.sin(i / 48 * tau * 7);
      fil.lineTo(x, y);
    }
    if (k > 0) c.drawPath(fil, linePaint(const Color(0xFFFFE2A0).withValues(alpha: 0.7 * k), 4.5));
    c.drawPath(fil, linePaint(hot, 1.2));
  }

  void _ammeter() {
    const o = Offset(590, 320);
    // Case and dial.
    block(Rect.fromCenter(center: o, width: 96, height: 104), const Color(0xFF4A4F55), radius: 8);
    final face = Rect.fromCenter(center: o + const Offset(0, -4), width: 80, height: 70);
    c.drawRRect(RRect.fromRectAndRadius(face, const Radius.circular(4)), Paint()..color = const Color(0xFFF8F5EC));
    c.drawRRect(RRect.fromRectAndRadius(face, const Radius.circular(4)), linePaint(TP.ink2, LW.hair));
    final pivot = o + const Offset(0, 24);
    const a0 = -math.pi * 0.76, a1 = -math.pi * 0.24, r = 40.0;
    c.drawArc(Rect.fromCircle(center: pivot, radius: r), a0, a1 - a0, false, linePaint(TP.ink, LW.hair));
    for (var i = 0; i <= 10; i++) {
      final a = a0 + (a1 - a0) * i / 10;
      final major = i % 5 == 0;
      c.drawLine(polar(pivot, r, a), polar(pivot, r - (major ? 7 : 4), a), linePaint(TP.ink, LW.hair));
      if (major) note(['0', '0.5', '1'][i ~/ 5], polar(pivot, r + 8, a), size: 8, color: TP.ink2, align: 0, halo: false);
    }
    note('A', pivot + const Offset(-24, -6), size: 12, color: TP.ink, align: 0, halo: false, weight: FontWeight.w700);
    final reading = 0.3 * current;
    final na = a0 + (a1 - a0) * reading;
    c.drawLine(pivot, polar(pivot, r - 2, na), linePaint(TP.red, 1.1));
    c.drawCircle(pivot, 2.6, Paint()..color = TP.ink);
    terminal(ammTop + const Offset(0, 6), r: 5);
    terminal(ammBottom - const Offset(0, 6), r: 5);
    note('+', ammTop + const Offset(-12, -4), size: 14, color: TP.red, align: 0, weight: FontWeight.w600);
    note('−', ammBottom + const Offset(-12, 4), size: 14, color: TP.blue, align: 0, weight: FontWeight.w600);
  }

  void _switch() {
    // A knife switch on an insulating base: hinge post on the left, spring clip on the right.
    block(const Rect.fromLTRB(284, 476, 424, 498), TP.wood, radius: 3);
    block(const Rect.fromLTRB(292, 458, 308, 478), TP.brass, radius: 2);
    block(const Rect.fromLTRB(398, 458, 404, 478), TP.brass, radius: 1);
    block(const Rect.fromLTRB(412, 458, 418, 478), TP.brass, radius: 1);
    final ang = -0.62 * (1 - closed);
    const pivot = Offset(300, 466);
    final tip = pivot + Offset.fromDirection(ang, 116);
    c.drawLine(pivot, tip, linePaint(tone(TP.copper, -0.3), 5.2));
    c.drawLine(pivot, tip, linePaint(TP.copperLight, 1.6));
    // An insulated handle at the blade's end.
    final hDir = Offset.fromDirection(ang, 1);
    final hn = Offset.fromDirection(ang - math.pi / 2, 1);
    final h0 = tip + hDir * 2, h1 = tip + hDir * 22;
    c.drawPath(Path()..addPolygon([h0 + hn * 4, h1 + hn * 5, h1 - hn * 5, h0 - hn * 4], true), Paint()..color = TP.bakelite);
    sphere(pivot, 3.4, TP.steel);
  }

  void _currentArrows() {
    if (t < 0.36) return;
    final conv = t >= 0.56;
    if (!conv) {
      // Electron flow: − round to +.
      for (final s in [(cBL, hinge), (ammTop, cTR), (cTR, holderR), (holderL, cTL), (cellBottom, cBL)]) {
        final off = s.$1.dy == s.$2.dy ? const Offset(0, 12) : const Offset(12, 0);
        arrowTo(lerpO(s.$1, s.$2, 0.35) + off, lerpO(s.$1, s.$2, 0.65) + off, TP.blue, w: LW.fine, len: 9);
      }
      return;
    }
    final k = t < 0.78 ? 1.0 : 0.75;
    // Conventional current: out of +, round, into −.
    void mark(Offset a, Offset b, Offset lab) {
      final off = a.dy == b.dy ? const Offset(0, -9) : const Offset(-9, 0);
      arrowTo(lerpO(a, b, 0.32) + off, lerpO(a, b, 0.68) + off, TP.red, w: LW.bold, len: 11, opacity: k);
      note('I', lerpO(a, b, 0.5) + lab, size: 15, color: TP.red, align: 0, weight: FontWeight.w600, opacity: k);
    }

    mark(cTL, holderL, const Offset(0, -24));
    mark(holderR, cTR, const Offset(0, -24));
    mark(ammBottom, cBR, const Offset(-24, 0));
    mark(cBR, clip, const Offset(0, -24));
    mark(hinge, cBL, const Offset(0, -24));
    mark(cBL, cellBottom, const Offset(-24, 0));
  }

  void _diagram(Rect r) {
    panel(r, title: 'Circuit diagram|परिपथ आरेख|ಮಂಡಲ ರೇಖಾಚಿತ್ರ');
    final a = r.topLeft + const Offset(46, 70), b = r.topLeft + Offset(r.width - 46, 70);
    final d = r.topLeft + Offset(46, r.height - 40), e = r.topLeft + Offset(r.width - 46, r.height - 40);
    final midY = (a.dy + d.dy) / 2, midX = (a.dx + b.dx) / 2;
    final p = linePaint(TP.ink, LW.fine);
    // Cell on the left: long (+) plate above, short (−) plate below.
    c.drawLine(a, Offset(a.dx, midY - 6), p);
    c.drawLine(Offset(a.dx, midY + 6), d, p);
    c.drawLine(Offset(a.dx - 16, midY - 6), Offset(a.dx + 16, midY - 6), linePaint(TP.ink, LW.fine));
    c.drawLine(Offset(a.dx - 8, midY + 6), Offset(a.dx + 8, midY + 6), linePaint(TP.ink, 3.2, cap: StrokeCap.butt));
    note('+', Offset(a.dx - 22, midY - 12), size: 12, color: TP.ink2, align: 0, halo: false);
    note('−', Offset(a.dx - 22, midY + 12), size: 12, color: TP.ink2, align: 0, halo: false);
    // Bulb on top: a circle with a cross.
    final bulb = Offset(midX, a.dy);
    c.drawLine(a, bulb - const Offset(13, 0), p);
    c.drawLine(bulb + const Offset(13, 0), b, p);
    c.drawCircle(bulb, 13, linePaint(TP.ink, LW.fine));
    c.drawLine(bulb + Offset.fromDirection(math.pi / 4, 13), bulb - Offset.fromDirection(math.pi / 4, 13), p);
    c.drawLine(bulb + Offset.fromDirection(-math.pi / 4, 13), bulb - Offset.fromDirection(-math.pi / 4, 13), p);
    glow(bulb, 30, const Color(0xFFF4C66A), current.clamp(0.0, 1.0) * 0.8);
    // Ammeter on the right.
    final amm = Offset(b.dx, midY);
    c.drawLine(b, amm - const Offset(0, 14), p);
    c.drawLine(amm + const Offset(0, 14), e, p);
    c.drawCircle(amm, 14, Paint()..color = r.isEmpty ? TP.paper : TP.paper2);
    c.drawCircle(amm, 14, linePaint(TP.ink, LW.fine));
    note('A', amm, size: 13, color: TP.ink, align: 0, halo: false, weight: FontWeight.w600);
    // Key at the bottom: two contacts and a lever.
    final k0 = Offset(midX - 22, d.dy), k1 = Offset(midX + 22, d.dy);
    c.drawLine(d, k0, p);
    c.drawLine(k1, e, p);
    c.drawCircle(k0, 3, linePaint(TP.ink, LW.fine));
    c.drawCircle(k1, 3, linePaint(TP.ink, LW.fine));
    c.drawLine(k0, k0 + Offset.fromDirection(-0.5 * (1 - closed), 44), p);
    // Conventional current arrows.
    if (t >= 0.56) {
      midArrow(a, bulb, TP.red, k: 0.45);
      midArrow(b, amm, TP.red, k: 0.5);
      midArrow(e, k1, TP.red, k: 0.4);
      midArrow(d, Offset(a.dx, midY + 6), TP.red, k: 0.5);
    }
  }

  void _readout(Rect r) {
    panel(r, title: 'Reading|पाठ्यांक|ಓದು');
    final i = 0.3 * current;
    note('I = ${i.toStringAsFixed(2)} A', r.topLeft + const Offset(16, 52), size: 22, color: TP.ink, weight: FontWeight.w600, halo: false);
    note(
      tr(on ? 'closed circuit|बंद परिपथ|ಮುಚ್ಚಿದ ಮಂಡಲ' : 'open circuit: no current|खुला परिपथ: धारा नहीं|ತೆರೆದ ಮಂಡಲ: ಪ್ರವಾಹವಿಲ್ಲ'),
      r.topLeft + const Offset(16, 80),
      size: 13,
      color: TP.ink2,
      halo: false,
    );
    // Legend.
    final y1 = r.top + 118, y2 = r.top + 150;
    sphere(Offset(r.left + 24, y1), 4, TP.blue);
    sphere(Offset(r.left + 38, y1), 4, TP.blue);
    note(tr('Electron flow: − to +|इलेक्ट्रॉन प्रवाह: − से +|ಇಲೆಕ್ಟ್ರಾನ್ ಹರಿವು: − ನಿಂದ +'), Offset(r.left + 54, y1), size: 13, color: TP.ink, halo: false, opacity: t >= 0.36 ? 1 : 0.6);
    arrowTo(Offset(r.left + 18, y2), Offset(r.left + 46, y2), TP.red, w: LW.bold, len: 10, opacity: t >= 0.56 ? 1 : 0.35);
    note(tr('Conventional current: + to −|परंपरागत धारा: + से −|ಸಾಂಪ್ರದಾಯಿಕ ಪ್ರವಾಹ: + ನಿಂದ −'), Offset(r.left + 54, y2), size: 13, color: TP.ink, halo: false, opacity: t >= 0.56 ? 1 : 0.45);
  }

  void _labels() {
    callout('Dry cell|शुष्क सेल|ಶುಷ್ಕ ಕೋಶ', const Offset(90, 284), const Offset(62, 230), side: 1, size: 13.5);
    callout('Torch bulb|टॉर्च बल्ब|ಟಾರ್ಚ್ ಬಲ್ಬ್', const Offset(392, 70), const Offset(450, 58));
    callout('Ammeter|ऐमीटर|ಆಮ್ಮೀಟರ್', const Offset(560, 282), const Offset(520, 236), side: -1);
    callout(closed > 0.5 ? 'Switch (closed)|स्विच (बंद)|ಸ್ವಿಚ್ (ಮುಚ್ಚಿದೆ)' : 'Switch (open)|स्विच (खुला)|ಸ್ವಿಚ್ (ತೆರೆದಿದೆ)', const Offset(354, 494), const Offset(380, 528));
    callout('Connecting wire (copper)|संयोजी तार (ताँबा)|ಸಂಪರ್ಕ ತಂತಿ (ತಾಮ್ರ)', const Offset(160, 175), const Offset(190, 128), side: -1, size: 13.5);
    if (t >= 0.78) {
      callout(
        'Filament: electrical energy → heat and light|तंतु: विद्युत ऊर्जा → ऊष्मा और प्रकाश|ತಂತು: ವಿದ್ಯುತ್ ಶಕ್ತಿ → ಶಾಖ ಮತ್ತು ಬೆಳಕು',
        const Offset(362, 70),
        const Offset(450, 100),
        opacity: seg(t, 0.78, 0.82),
        maxWidth: 190,
      );
    }
  }
}
