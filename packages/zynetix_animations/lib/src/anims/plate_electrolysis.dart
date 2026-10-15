import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../draw.dart';

/// Electrolysis of water (NCERT activity): graphite electrodes through rubber bungs in the base
/// of a beaker of acidified water, inverted test tubes over them, a battery and a plug key. Gas
/// is given off at both electrodes once current flows, hydrogen at twice the volume of oxygen.
/// Beside it, the ions at the electrodes with their half-equations, and the volumes against time.
class ElectrolysisPlate extends AnimPainter {
  ElectrolysisPlate(super.f);

  static const cathX = 250.0, anodeX = 390.0;
  static const bk = Rect.fromLTRB(160, 236, 480, 472);
  static const tubeTop = 132.0, tubeBottom = 420.0, tubeHalf = 21.0;

  bool get on => t >= 0.2;

  /// Gas collected so far, as a length of tube (hydrogen; oxygen is half).
  double get hydrogen => 168 * seg(t, 0.24, 1);

  @override
  void draw() {
    _circuit();
    _beaker();
    for (final (x, h, isH) in [(cathX, hydrogen, true), (anodeX, hydrogen / 2, false)]) {
      _tube(x, h, isH);
    }
    _ions(const Rect.fromLTWH(600, 52, 376, 252));
    _graph(const Rect.fromLTWH(600, 320, 376, 224));
    _labels();
  }

  void _beaker() {
    beaker(bk, level: 0.9, liquid: const Color(0xFFD5E5EC), marks: false);
    // Rubber bungs in the base.
    for (final x in [cathX, anodeX]) {
      final r = Rect.fromLTRB(x - 13, bk.bottom - 6, x + 13, bk.bottom + 12);
      c.drawPath(
          Path()
            ..moveTo(r.left, r.top)
            ..lineTo(r.right, r.top)
            ..lineTo(r.right - 3, r.bottom)
            ..lineTo(r.left + 3, r.bottom)
            ..close(),
          vGrad(r, [const Color(0xFF5B4A40), const Color(0xFF3A2E28)]));
    }
  }

  void _electrode(double x, bool cathode) {
    // A graphite rod from the bung up into the tube, with its terminal below.
    cylinderV(Rect.fromLTRB(x - 5, 352, x + 5, bk.bottom + 16), TP.graphite, radius: 4);
    c.drawLine(Offset(x, bk.bottom + 16), Offset(x, bk.bottom + 26), linePaint(TP.copperDark, 2));
    note(cathode ? '−' : '+', Offset(x + (cathode ? -16 : 16), bk.bottom + 30), size: 15, color: cathode ? TP.blue : TP.red, align: 0, weight: FontWeight.w700);
  }

  void _tube(double x, double gas, bool isH) {
    final tube = RRect.fromRectAndCorners(Rect.fromLTRB(x - tubeHalf, tubeTop, x + tubeHalf, tubeBottom), topLeft: const Radius.circular(tubeHalf), topRight: const Radius.circular(tubeHalf));
    final inner = Rect.fromLTRB(x - tubeHalf + 2, tubeTop + 2, x + tubeHalf - 2, tubeBottom);
    // Water inside the tube, below the gas; the part above the beaker's surface is still full.
    final surface = tubeTop + 4 + gas;
    c.save();
    c.clipRRect(tube);
    c.drawRect(Rect.fromLTRB(inner.left, surface, inner.right, inner.bottom), hGrad(inner, [const Color(0xFFC9DCE4), const Color(0xFFE2EEF2), const Color(0xFFC9DCE4)]));
    if (gas > 0) {
      c.drawRect(Rect.fromLTRB(inner.left, inner.top, inner.right, surface), Paint()..color = Colors.white.withValues(alpha: 0.85));
      c.drawLine(Offset(inner.left, surface), Offset(inner.right, surface), linePaint(TP.waterEdge, LW.fine));
    }
    c.restore();
    _electrode(x, isH);
    // Bubbles rising from the rod's tip to the gas.
    if (on && t >= 0.24) {
      final n = isH ? 16 : 8;
      for (var i = 0; i < n; i++) {
        final ph = fr(rnd(i, isH ? 1 : 2) + t * (isH ? 7 : 5));
        final y = 352 - ph * (352 - surface - 4);
        if (y < surface + 3) continue;
        final bx = x + (rnd(i, 3) - 0.5) * 16 + math.sin(ph * 12 + i) * 1.5;
        final r = (isH ? 1.6 : 2.4) + ph * (isH ? 1.4 : 2);
        c.drawCircle(Offset(bx, y), r, Paint()..color = Colors.white.withValues(alpha: 0.85));
        c.drawCircle(Offset(bx, y), r, linePaint(TP.waterEdge.withValues(alpha: 0.8), 0.7));
      }
    }
    // Glass, highlight and graduations.
    c.drawLine(Offset(x - tubeHalf + 5, tubeTop + 16), Offset(x - tubeHalf + 5, tubeBottom - 10), linePaint(Colors.white.withValues(alpha: 0.8), 2.2));
    for (var k = 1; k <= 8; k++) {
      final y = tubeTop + 4 + k * 21.0;
      c.drawLine(Offset(x + tubeHalf - 1, y), Offset(x + tubeHalf - (k.isEven ? 9 : 5), y), linePaint(TP.glassEdge, LW.hair));
    }
    c.drawRRect(tube, linePaint(TP.glassEdge, LW.line));
    if (gas > 22) note(isH ? 'H₂' : 'O₂', Offset(x, tubeTop + 4 + gas / 2), size: 13, color: isH ? TP.blue : TP.teal, align: 0, weight: FontWeight.w600, halo: false);
  }

  void _circuit() {
    // Battery (6 V) and a plug key; wires from the terminals below the beaker.
    const batt = Rect.fromLTRB(270, 528, 370, 568);
    wire(wireRun([const Offset(cathX, 498), const Offset(cathX, 548), Offset(batt.left, 548)]));
    wire(wireRun([const Offset(anodeX, 498), const Offset(anodeX, 512), const Offset(440, 512)]));
    wire(wireRun([const Offset(486, 512), const Offset(516, 512), const Offset(516, 548), Offset(batt.right, 548)]));
    block(batt, const Color(0xFF3F4A52), radius: 4);
    for (var i = 1; i < 4; i++) {
      c.drawLine(Offset(batt.left + i * 25, batt.top + 4), Offset(batt.left + i * 25, batt.bottom - 4), linePaint(tone(const Color(0xFF3F4A52), 0.25), LW.hair));
    }
    note('6 V', batt.center, size: 12, color: Colors.white.withValues(alpha: 0.9), align: 0, halo: false, weight: FontWeight.w600);
    note('−', Offset(batt.left + 10, batt.top - 10), size: 14, color: TP.blue, align: 0, weight: FontWeight.w700);
    note('+', Offset(batt.right - 10, batt.top - 10), size: 14, color: TP.red, align: 0, weight: FontWeight.w700);
    // Plug key: two brass blocks on a base; the plug drops in when the current is switched on.
    block(const Rect.fromLTRB(436, 516, 490, 528), TP.wood, radius: 2);
    block(const Rect.fromLTRB(440, 500, 458, 516), TP.brass, radius: 2);
    block(const Rect.fromLTRB(468, 500, 486, 516), TP.brass, radius: 2);
    final drop = 22 * (1 - easeS(seg(t, 0.18, 0.22)));
    block(Rect.fromLTRB(458, 486 - drop, 468, 512 - drop), TP.brass, radius: 2);
    block(Rect.fromLTRB(454, 476 - drop, 472, 488 - drop), TP.bakelite, radius: 3);
    // Electrons in the wires: from − to the cathode, and from the anode back to +.
    if (on) {
      final p1 = Path()
        ..moveTo(batt.left, 548)
        ..lineTo(cathX, 548)
        ..lineTo(cathX, 498);
      final p2 = Path()
        ..moveTo(anodeX, 498)
        ..lineTo(anodeX, 512)
        ..lineTo(516, 512)
        ..lineTo(516, 548)
        ..lineTo(batt.right, 548);
      for (final p in [p1, p2]) {
        final m = p.computeMetrics().first;
        for (var i = 0; i < 6; i++) {
          final q = m.getTangentForOffset(m.length * fr(i / 6 + t * 3))!.position;
          if (q.dx > 438 && q.dx < 488 && (q.dy - 512).abs() < 3) continue;
          sphere(q, 2.8, TP.blue);
        }
      }
    }
  }

  void _ions(Rect r) {
    panel(r, title: 'At the electrodes|इलेक्ट्रोडों पर|ಇಲೆಕ್ಟ್ರೋಡ್‌ಗಳಲ್ಲಿ');
    final box = Rect.fromLTRB(r.left + 40, r.top + 40, r.right - 40, r.top + 168);
    c.drawRect(box, Paint()..color = const Color(0xFFDCE9EF));
    // Electrode plates.
    c.drawRect(Rect.fromLTRB(box.left - 10, box.top - 6, box.left, box.bottom + 6), Paint()..color = TP.graphite);
    c.drawRect(Rect.fromLTRB(box.right, box.top - 6, box.right + 10, box.bottom + 6), Paint()..color = TP.graphite);
    note('−', Offset(box.left - 22, box.center.dy), size: 18, color: TP.blue, align: 0, weight: FontWeight.w700, halo: false);
    note('+', Offset(box.right + 22, box.center.dy), size: 18, color: TP.red, align: 0, weight: FontWeight.w700, halo: false);
    c.save();
    c.clipRect(box);
    // Water molecules in the background, barely moving.
    for (var i = 0; i < 26; i++) {
      final p = Offset(box.left + rnd(i, 21) * box.width, box.top + rnd(i, 22) * box.height) + Offset(math.sin(t * 40 + i), math.cos(t * 37 + i)) * 2;
      c.drawCircle(p, 3.2, Paint()..color = const Color(0xFFB9CDD6));
    }
    // H⁺ drift to the cathode, SO₄²⁻ to the anode (only while current flows).
    final drift = on ? (t - 0.2) * 3 : 0.0;
    for (var i = 0; i < 9; i++) {
      final y = box.top + 14 + (i % 5) * 25.0 + rnd(i, 30) * 6;
      final kH = fr(rnd(i, 31) - drift);
      final pH = Offset(box.left + 8 + kH * (box.width - 16), y) + Offset(math.sin(t * 50 + i) * 2, math.cos(t * 45 + i) * 2);
      sphere(pH, 5, const Color(0xFFC0594B));
      note('+', pH, size: 7.5, color: Colors.white, align: 0, halo: false, weight: FontWeight.w700);
      if (i < 5) {
        final kS = fr(rnd(i, 33) + drift * 0.5);
        final pS = Offset(box.left + 8 + kS * (box.width - 16), box.top + 26 + (i % 4) * 28.0) + Offset(math.cos(t * 41 + i) * 2, math.sin(t * 43 + i) * 2);
        sphere(pS, 8, const Color(0xFFC9A646));
        note('2−', pS, size: 7, color: TP.ink, align: 0, halo: false, weight: FontWeight.w700);
      }
    }
    // Bubbles leaving each plate.
    if (on) {
      for (var i = 0; i < 6; i++) {
        final ph = fr(rnd(i, 40) + t * 4);
        c.drawCircle(Offset(box.left + 10 + rnd(i, 41) * 8, box.bottom - ph * box.height), 3 + ph * 2, linePaint(TP.waterEdge, 0.8));
        if (i < 3) c.drawCircle(Offset(box.right - 12 - rnd(i, 42) * 8, box.bottom - fr(rnd(i, 43) + t * 3) * box.height), 4 + ph * 2, linePaint(TP.waterEdge, 0.8));
      }
    }
    c.restore();
    c.drawRect(box, linePaint(TP.glassEdge, LW.hair));
    if (on) {
      arrowTo(Offset(box.left + 70, box.bottom + 15), Offset(box.left + 10, box.bottom + 15), const Color(0xFFC0594B), w: LW.fine, len: 8);
      note('H⁺', Offset(box.left + 76, box.bottom + 15), size: 12, color: const Color(0xFF9A4538), align: -1, weight: FontWeight.w600, halo: false);
      arrowTo(Offset(box.right - 70, box.bottom + 15), Offset(box.right - 10, box.bottom + 15), const Color(0xFFA6852F), w: LW.fine, len: 8);
      note('SO₄²⁻', Offset(box.right - 76, box.bottom + 15), size: 12, color: const Color(0xFF8A6D22), align: 1, weight: FontWeight.w600, halo: false);
    }
    // Half-equations.
    final y = r.bottom - 52;
    note(tr('Cathode (−):|कैथोड (−):|ಕ್ಯಾಥೋಡ್ (−):'), Offset(r.left + 16, y), size: 12, color: TP.ink2, halo: false);
    note('2H⁺ + 2e⁻ → H₂', Offset(r.left + 128, y), size: 14, color: TP.ink, weight: FontWeight.w600, halo: false, opacity: t >= 0.4 ? 1 : 0.3);
    note(tr('Anode (+):|ऐनोड (+):|ಆನೋಡ್ (+):'), Offset(r.left + 16, y + 26), size: 12, color: TP.ink2, halo: false);
    note('2H₂O → O₂ + 4H⁺ + 4e⁻', Offset(r.left + 128, y + 26), size: 14, color: TP.ink, weight: FontWeight.w600, halo: false, opacity: t >= 0.6 ? 1 : 0.3);
  }

  void _graph(Rect r) {
    panel(r, title: 'Volume of gas collected|एकत्रित गैस का आयतन|ಸಂಗ್ರಹಿಸಿದ ಅನಿಲದ ಪರಿಮಾಣ');
    final g = Rect.fromLTRB(r.left + 48, r.top + 46, r.right - 150, r.bottom - 52);
    for (var k = 1; k <= 4; k++) {
      final y = g.bottom - g.height * k / 4;
      c.drawLine(Offset(g.left, y), Offset(g.right, y), linePaint(TP.grid, LW.hair));
      note('${k * 5}', Offset(g.left - 6, y), size: 10, color: TP.ink2, align: 1, halo: false);
    }
    axes(Rect.fromLTRB(g.left, g.top - 6, g.right + 6, g.bottom), origin: g.bottomLeft);
    note(tr('cm³|cm³|cm³'), Offset(g.left - 34, g.top - 12), size: 11, color: TP.ink2, italic: true, halo: false);
    note(tr('time →|समय →|ಸಮಯ →'), Offset(g.right, g.bottom + 16), size: 11.5, color: TP.ink2, align: 1, italic: true, halo: false);
    Offset at(double tt, double frac) => Offset(g.left + (tt - 0.2) / 0.8 * g.width, g.bottom - g.height * 0.95 * frac * seg(tt, 0.24, 1));
    if (t > 0.2) {
      for (final (frac, col, name) in [(1.0, TP.blue, 'H₂'), (0.5, TP.teal, 'O₂')]) {
        final p = Path();
        const n = 60;
        for (var i = 0; i <= n; i++) {
          final q = at(0.2 + (t - 0.2) * i / n, frac);
          i == 0 ? p.moveTo(q.dx, q.dy) : p.lineTo(q.dx, q.dy);
        }
        c.drawPath(p, linePaint(col, LW.bold));
        final now = at(t, frac);
        sphere(now, 4, col);
        note(name, now + const Offset(10, -2), size: 12.5, color: col, weight: FontWeight.w600, halo: false);
      }
    }
    // The ratio and the overall equation.
    final k = seg(t, 0.8, 0.85);
    final vh = 20 * 0.95 * seg(t, 0.24, 1), vo = vh / 2;
    final tx = r.right - 100;
    note('H₂: ${vh.toStringAsFixed(1)} cm³', Offset(tx, r.top + 64), size: 12.5, color: TP.blue, halo: false);
    note('O₂: ${vo.toStringAsFixed(1)} cm³', Offset(tx, r.top + 86), size: 12.5, color: TP.teal, halo: false);
    note('2 : 1', Offset(tx, r.top + 120), size: 22, color: TP.ink, weight: FontWeight.w600, halo: false, opacity: k);
    note('2H₂O(l) → 2H₂(g) + O₂(g)', Offset(r.left + 16, r.bottom - 20), size: 15, color: TP.ink, weight: FontWeight.w600, halo: false, opacity: 0.25 + 0.75 * k);
  }

  void _labels() {
    callout('Cathode (−)|कैथोड (−)|ಕ್ಯಾಥೋಡ್ (−)', const Offset(cathX - 5, 400), const Offset(110, 392), side: -1);
    callout('Anode (+)|ऐनोड (+)|ಆನೋಡ್ (+)', const Offset(anodeX + 5, 400), const Offset(530, 392));
    callout('Test tube|परखनली|ಪರೀಕ್ಷಾ ನಳಿಕೆ', const Offset(anodeX + tubeHalf, 190), const Offset(470, 170));
    callout('Acidified water|अम्लीय जल|ಆಮ್ಲೀಕೃತ ನೀರು', const Offset(200, 452), const Offset(110, 470), side: -1);
    callout('Rubber bung|रबर डाट|ರಬ್ಬರ್ ಬಿರಡೆ', Offset(cathX - 10, bk.bottom + 4), const Offset(110, 506), side: -1);
    callout('Plug key|प्लग कुंजी|ಪ್ಲಗ್ ಕೀಲಿ', const Offset(484, 506), const Offset(540, 530), opacity: 1);
    callout('Battery|बैटरी|ಬ್ಯಾಟರಿ', const Offset(276, 560), const Offset(160, 572), side: -1);
    callout('Hydrogen|हाइड्रोजन|ಹೈಡ್ರೋಜನ್', Offset(cathX - tubeHalf + 4, tubeTop + 30), const Offset(150, 140), side: -1, opacity: seg(t, 0.36, 0.42));
    callout('Oxygen|ऑक्सीजन|ಆಮ್ಲಜನಕ', Offset(anodeX + tubeHalf - 4, tubeTop + 16), const Offset(470, 118), opacity: seg(t, 0.56, 0.62));
  }
}
