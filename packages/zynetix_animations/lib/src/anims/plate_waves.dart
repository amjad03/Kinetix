import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../draw.dart';

/// Transverse and longitudinal waves: beads on a string driven up and down at one end, and air
/// in front of a loudspeaker, with its pressure graph lined up beneath. Both waves have the same
/// wavelength (λ = 300 units) and frequency (0.75 Hz), so they travel at the same speed; each
/// starts from its source and advances at that speed.
class WavesPlate extends AnimPainter {
  WavesPlate(super.f);

  static const lambda = 300.0, freq = 0.75, seconds = 16.0;
  static const speed = lambda * freq; // units per second
  static const x0 = 90.0; // the string's driven end and the speaker's diaphragm

  /// Seconds since the start.
  double get sec => t * seconds;

  /// The phase of a wave from its source at [x]: zero ahead of the wavefront.
  double wave(double x, double startSec) {
    final s = sec - startSec - (x - x0) / speed;
    return s <= 0 ? 0 : math.sin(tau * freq * s);
  }

  /// The pressure (−∂s/∂x, scaled to ±1) of the longitudinal wave at [x].
  double pressure(double x, double startSec) {
    final s = sec - startSec - (x - x0) / speed;
    return s <= 0 ? 0 : math.cos(tau * freq * s);
  }

  @override
  void draw() {
    final topOn = t < 0.5;
    _fade(const Rect.fromLTWH(0, 0, 1000, 296), topOn ? 1 : 0.4, _transverse);
    c.drawLine(const Offset(30, 300), const Offset(970, 300), linePaint(TP.rule, LW.hair));
    _fade(const Rect.fromLTWH(0, 302, 1000, 298), topOn ? 0.4 : 1, _longitudinal);
  }

  void _fade(Rect r, double k, void Function() body) {
    if (k >= 1) {
      body();
      return;
    }
    c.saveLayer(r, Paint()..color = Colors.black.withValues(alpha: k));
    body();
    c.restore();
  }

  // ---- transverse ----

  void _transverse() {
    plateTitle('Transverse wave: a wave on a string|अनुप्रस्थ तरंग: डोरी पर तरंग|ಅಡ್ಡ ಅಲೆ: ದಾರದ ಮೇಲಿನ ಅಲೆ', const Offset(30, 30), width: 420);
    const y0 = 170.0, amp = 62.0;
    double y(double x) => y0 - amp * wave(x, 0);
    // Equilibrium line.
    dash(const Offset(x0, y0), const Offset(960, y0), TP.hair, on: 6, off: 5);
    // The driver: a clamp riding on a vertical guide.
    cylinderV(const Rect.fromLTRB(54, y0 - amp - 30, 62, y0 + amp + 30), TP.steel);
    block(Rect.fromCenter(center: Offset(68, y(x0)), width: 30, height: 18), TP.graphite, radius: 3);
    // The string.
    final p = Path();
    for (var x = x0; x <= 960; x += 3) {
      x == x0 ? p.moveTo(x, y(x)) : p.lineTo(x, y(x));
    }
    c.drawPath(p, linePaint(TP.ink2, LW.fine));
    const marked = 10;
    for (var i = 0; i <= 39; i++) {
      final x = x0 + i * 22.0;
      if (x > 960) break;
      sphere(Offset(x, y(x)), i == marked ? 5.4 : 3.6, i == marked ? TP.red : TP.steelDark);
    }
    // The marked bead's path: straight up and down, across the direction of travel.
    const mx = x0 + marked * 22.0;
    c.drawLine(const Offset(mx + 16, y0 - amp), const Offset(mx + 16, y0 + amp), linePaint(TP.red.withValues(alpha: 0.6), LW.hair));
    dart(const Offset(mx + 16, y0 - amp - 2), -math.pi / 2, TP.red, len: 7);
    dart(const Offset(mx + 16, y0 + amp + 2), math.pi / 2, TP.red, len: 7);
    // Direction of travel.
    final front = math.min(960.0, x0 + speed * sec);
    _travel(30);
    if (front < 958) c.drawLine(Offset(front, y0 - 14), Offset(front, y0 + 14), linePaint(TP.ink2, LW.hair));
    callout('Particle moves up and down|कण ऊपर-नीचे चलता है|ಕಣ ಮೇಲೆ-ಕೆಳಗೆ ಚಲಿಸುತ್ತದೆ', const Offset(mx + 16, y0 + amp - 14), const Offset(mx + 64, 262), size: 13);
    // Crest, trough, wavelength and amplitude (from step 2).
    final mark = seg(t, 0.25, 0.29);
    if (mark > 0 && front > 700) {
      // Crests are where the phase is a quarter period: x = x0 + speed·(sec − 1/(4f)) − n·λ.
      final base = x0 + speed * (sec - 0.25 / freq);
      final crests = <double>[];
      for (var n = 0; n < 6; n++) {
        final x = base - n * lambda;
        if (x >= 300 && x <= 950) crests.add(x);
      }
      crests.sort();
      if (crests.length >= 2) {
        final a = crests[0], b = crests[1];
        dash(Offset(a, y0 - amp), Offset(a, y0 - amp - 34), TP.hair);
        dash(Offset(b, y0 - amp), Offset(b, y0 - amp - 34), TP.hair);
        dimension(Offset(a, y0 - amp - 28), Offset(b, y0 - amp - 28), 'Wavelength λ|तरंगदैर्ध्य λ|ತರಂಗಾಂತರ λ', labelOffset: const Offset(0, -12), opacity: mark, size: 13);
        callout('Crest|शृंग|ಶೃಂಗ', Offset(a, y0 - amp), Offset(a - 52, y0 - amp + 10), side: -1, opacity: mark, size: 13);
        final tr0 = a + lambda / 2;
        callout('Trough|गर्त|ತಗ್ಗು', Offset(tr0, y0 + amp), Offset(tr0 + 46, y0 + amp + 14), opacity: mark, size: 13);
        dimension(Offset(b, y0), Offset(b, y0 - amp + 6), '', opacity: mark);
        tag('Amplitude A|आयाम A|ಕಂಪನಾಂಕ A', Offset(b, y0 + 16), size: 13, opacity: mark);
      }
    }
  }

  /// The direction of travel, at the right of a panel's title line.
  void _travel(double y, {double opacity = 1}) {
    if (opacity <= 0) return;
    arrowTo(Offset(860, y), Offset(960, y), TP.ink, w: LW.line, len: 10, opacity: opacity);
    note(tr('direction of travel|गति की दिशा|ಸಾಗುವ ದಿಕ್ಕು'), Offset(850, y), size: 12.5, color: TP.ink2, align: 1, opacity: opacity);
  }

  // ---- longitudinal ----

  void _longitudinal() {
    plateTitle('Longitudinal wave: sound in air|अनुदैर्ध्य तरंग: हवा में ध्वनि|ಉದ್ದ ಅಲೆ: ಗಾಳಿಯಲ್ಲಿ ಶಬ್ದ', const Offset(30, 326), width: 420);
    const start = 0.0;
    const top = 366.0, bottom = 472.0;
    const ampL = 20.0;
    // Loudspeaker in section: magnet, frame and a cone whose diaphragm moves with s(x0).
    final d = ampL * wave(x0, start);
    block(const Rect.fromLTRB(30, 392, 52, 430), TP.graphite, radius: 2);
    final cone = Path()
      ..moveTo(52, 400)
      ..lineTo(x0 - 6 + d, top + 6)
      ..lineTo(x0 - 6 + d, bottom - 6)
      ..lineTo(52, 422)
      ..close();
    c.drawPath(cone, hGrad(const Rect.fromLTRB(52, top, 90, bottom), [tone(TP.stone, -0.2), tone(TP.stone, 0.4)]));
    c.drawPath(cone, linePaint(TP.ink2, LW.fine));
    c.drawLine(Offset(x0 - 6 + d, top + 4), Offset(x0 - 6 + d, bottom - 4), linePaint(TP.ink, 2.4));
    // Air particles: each oscillates along the line of travel about its own place.
    const cols = 78, rows = 8;
    const marked = 18, markedRow = 4;
    for (var j = 0; j < rows; j++) {
      for (var i = 0; i < cols; i++) {
        final bx = x0 + 12 + i * 11.0 + (rnd(i, j) - 0.5) * 4;
        if (bx > 965) continue;
        final by = top + 6 + j * (bottom - top - 12) / (rows - 1) + (rnd(j, i + 7) - 0.5) * 5;
        final x = bx + ampL * wave(bx, start);
        final hit = i == marked && j == markedRow;
        sphere(Offset(x, by), hit ? 4.6 : 2.7, hit ? TP.red : TP.blue, outline: hit);
      }
    }
    final mx = x0 + 12 + marked * 11.0 + (rnd(marked, markedRow) - 0.5) * 4;
    c.drawLine(Offset(mx - ampL, bottom + 8), Offset(mx + ampL, bottom + 8), linePaint(TP.red.withValues(alpha: 0.7), LW.hair));
    dart(Offset(mx - ampL - 2, bottom + 8), math.pi, TP.red, len: 6);
    dart(Offset(mx + ampL + 2, bottom + 8), 0, TP.red, len: 6);
    final mark = seg(t, 0.75, 0.79);
    _travel(326, opacity: 1 - mark);
    // Pressure graph lined up with the particles.
    const g = Rect.fromLTRB(x0, 500, 960, 584);
    final o = Offset(g.left, g.center.dy);
    axes(g, origin: o, x: 'x|x|x');
    note(tr('pressure|दाब|ಒತ್ತಡ'), Offset(g.left - 8, g.top + 6), size: 13, color: TP.ink2, align: 1, italic: true);
    final pp = plot(Rect.fromLTRB(g.left, g.top + 8, g.right - 6, g.bottom - 8), (x) => pressure(x, start), g.left, g.right - 6, -1, 1, n: 300);
    c.drawPath(pp, linePaint(TP.blue, LW.bold));
    callout('Particle moves to and fro|कण आगे-पीछे चलता है|ಕಣ ಮುಂದೆ-ಹಿಂದೆ ಚಲಿಸುತ್ತದೆ', Offset(mx, bottom + 8), Offset(mx + 70, bottom + 22), size: 13);
    callout('Loudspeaker|लाउडस्पीकर|ಧ್ವನಿವರ್ಧಕ', const Offset(44, 430), const Offset(64, 486), size: 13);
    // Compressions and rarefactions (from step 4): where the pressure peaks and dips.
    if (mark > 0) {
      // Pressure peaks where tau·f·(sec − (x − x0)/v) = 2πn → x = x0 + v·(sec − n/f).
      for (var n = 0; n < 12; n++) {
        final xc = x0 + speed * (sec - n / freq);
        final xr = xc - lambda / 2;
        for (final (x, isC) in [(xc, true), (xr, false)]) {
          if (x < x0 + 40 || x > 940) continue;
          final col = isC ? TP.red : TP.blue;
          c.drawRect(Rect.fromLTRB(x - 30, top - 4, x + 30, bottom + 2), Paint()..color = col.withValues(alpha: 0.07 * mark));
          note(isC ? 'C' : 'R', Offset(x, top - 10), size: 14, color: col, align: 0, weight: FontWeight.w700, opacity: mark);
        }
      }
      tag(
        'C = compression (high pressure)    R = rarefaction (low pressure)|C = संपीडन (उच्च दाब)    R = विरलन (निम्न दाब)|C = ಸಂಪೀಡನ (ಹೆಚ್ಚು ಒತ್ತಡ)    R = ವಿರಳನ (ಕಡಿಮೆ ಒತ್ತಡ)',
        const Offset(960, 326),
        size: 12.5,
        color: TP.ink2,
        align: 1,
        opacity: mark,
        maxWidth: 520,
      );
    }
  }
}
