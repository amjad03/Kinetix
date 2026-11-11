import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import 'kit.dart';

/// Strokes shared by the electromagnetism, modern-physics and electronics instruments.
abstract final class EM {
  static const north = Color(0xFFB91C1C);
  static const south = Color(0xFF1E40AF);
  static const field = Color(0xFF6D28D9); // B lines and B symbols
  static const efield = IX.positive; // E lines
  static const current = IX.amber;
  static const core = Color(0xFF8B93A6);

  /// ⊗ (into the screen).
  static void into(Canvas c, Offset at, double r, [Color col = field]) {
    c.drawCircle(at, r, Draw.stroke(col, 2));
    final d = r * 0.6;
    c.drawLine(at + Offset(-d, -d), at + Offset(d, d), Draw.stroke(col, 2));
    c.drawLine(at + Offset(-d, d), at + Offset(d, -d), Draw.stroke(col, 2));
  }

  /// ⊙ (out of the screen).
  static void outOf(Canvas c, Offset at, double r, [Color col = field]) {
    c.drawCircle(at, r, Draw.stroke(col, 2));
    c.drawCircle(at, r * 0.28, Draw.fill(col));
  }

  /// A uniform field of ⊗ or ⊙ marks filling [r].
  static void sheet(Canvas c, Rect r, {bool into = true, double gap = 56, double rad = 9, Color col = field, double alpha = 0.55}) {
    final cc = col.withValues(alpha: alpha);
    for (var y = r.top + gap / 2; y < r.bottom; y += gap) {
      for (var x = r.left + gap / 2; x < r.right; x += gap) {
        into ? EM.into(c, Offset(x, y), rad, cc) : outOf(c, Offset(x, y), rad, cc);
      }
    }
  }

  /// A bar magnet in [r], N at the end [nAt] (-1 left/top, +1 right/bottom).
  static void magnet(Canvas c, Rect r, {int nAt = 1, bool vertical = false}) {
    final halves = vertical
        ? [Rect.fromLTRB(r.left, r.top, r.right, r.center.dy), Rect.fromLTRB(r.left, r.center.dy, r.right, r.bottom)]
        : [Rect.fromLTRB(r.left, r.top, r.center.dx, r.bottom), Rect.fromLTRB(r.center.dx, r.top, r.right, r.bottom)];
    final cols = nAt > 0 ? [south, north] : [north, south];
    final labels = nAt > 0 ? ['S', 'N'] : ['N', 'S'];
    final rr = RRect.fromRectAndRadius(r, const Radius.circular(6));
    Draw.shadow(c, rr);
    for (var i = 0; i < 2; i++) {
      final h = halves[i];
      c.save();
      c.clipRRect(rr);
      c.drawRect(h, Paint()..shader = ui.Gradient.linear(vertical ? h.centerLeft : h.topCenter, vertical ? h.centerRight : h.bottomCenter, [Color.lerp(cols[i], Colors.white, 0.3)!, cols[i], Color.lerp(cols[i], Colors.black, 0.2)!], [0, 0.5, 1]));
      c.restore();
      Draw.text(c, labels[i], h.center, size: math.min(26, math.min(h.width, h.height) * 0.6), color: Colors.white, w: FontWeight.w700);
    }
    c.drawRRect(rr, Draw.stroke(const Color(0x5513165A), 1.5));
  }

  /// A side view of a helical coil from a to b (horizontal), radius [h] (half-height).
  static void coil(Canvas c, Offset a, Offset b, double h, int turns, {Color col = PX.copper, double w = 4, bool back = true}) {
    final len = b.dx - a.dx;
    final pitch = len / turns;
    if (back) {
      final pb = Draw.stroke(Color.lerp(col, Colors.white, 0.45)!, w * 0.8);
      for (var i = 0; i < turns; i++) {
        final x = a.dx + pitch * i;
        c.drawLine(Offset(x + pitch * 0.5, a.dy - h), Offset(x, a.dy + h), pb);
      }
    }
    final pf = Draw.stroke(col, w);
    for (var i = 0; i < turns; i++) {
      final x = a.dx + pitch * i;
      c.drawLine(Offset(x, a.dy + h), Offset(x + pitch * 0.5, a.dy - h), pf);
      if (i < turns - 1) c.drawLine(Offset(x + pitch * 0.5, a.dy - h), Offset(x + pitch, a.dy + h), Draw.stroke(Color.lerp(col, Colors.white, 0.45)!, w * 0.8));
    }
  }

  /// A small arrowhead in the middle of segment a→b (for field lines and currents).
  static void midArrow(Canvas c, Offset a, Offset b, Color col, {double size = 11}) {
    final d = b - a;
    if (d.distance < 1) return;
    final u = d / d.distance, n = Offset(-u.dy, u.dx);
    final m = Offset.lerp(a, b, 0.5)! + u * size * 0.5;
    final p = Path()
      ..moveTo(m.dx, m.dy)
      ..lineTo((m - u * size + n * size * 0.5).dx, (m - u * size + n * size * 0.5).dy)
      ..lineTo((m - u * size - n * size * 0.5).dx, (m - u * size - n * size * 0.5).dy)
      ..close();
    c.drawPath(p, Draw.fill(col));
  }

  /// A polyline with arrowheads every [every] px.
  static void flowLine(Canvas c, List<Offset> pts, Color col, {double w = 2.2, double every = 170, double size = 11}) {
    if (pts.length < 2) return;
    final path = Path()..moveTo(pts[0].dx, pts[0].dy);
    for (final q in pts.skip(1)) {
      path.lineTo(q.dx, q.dy);
    }
    c.drawPath(path, Draw.stroke(col, w));
    var acc = every * 0.5;
    for (var i = 1; i < pts.length; i++) {
      acc += (pts[i] - pts[i - 1]).distance;
      if (acc >= every) {
        acc = 0;
        midArrow(c, pts[i - 1], pts[i], col, size: size);
      }
    }
  }

  /// A phasor diagram: circle of radius [r] at [o], arrows at the given angles (radians,
  /// anticlockwise from +x) with lengths as fractions of r.
  static void phasors(Canvas c, Offset o, double r, List<(double angle, double len, Color col, String label)> items) {
    c.drawCircle(o, r, Draw.stroke(IX.rule, 2));
    c.drawLine(o - Offset(r + 16, 0), o + Offset(r + 16, 0), Draw.stroke(IX.muted, 1.5));
    c.drawLine(o - Offset(0, r + 16), o + Offset(0, r + 16), Draw.stroke(IX.muted, 1.5));
    for (final (a, l, col, lab) in items) {
      final tip = o + Offset(math.cos(a), -math.sin(a)) * r * l;
      IxPaint.arrow(c, o, tip, col, width: 5, head: 18);
      IxPaint.dashed(c, tip, Offset(o.dx + r + 30, tip.dy), Draw.stroke(col.withValues(alpha: 0.5), 1.6), dash: 6, gap: 5);
      Draw.text(c, lab, tip + Offset(math.cos(a), -math.sin(a)) * 22, size: 19, color: col, halo: true);
    }
  }

  /// A labelled energy-level ladder line from x0 to x1 at y.
  static void level(Canvas c, double x0, double x1, double y, String left, String right, {Color col = IX.ink, double w = 3}) {
    c.drawLine(Offset(x0, y), Offset(x1, y), Draw.stroke(col, w));
    Draw.text(c, left, Offset(x0 - 12, y), size: 17, color: col, align: Alignment.centerRight);
    Draw.text(c, right, Offset(x1 + 12, y), size: 17, color: IX.inkSoft, w: FontWeight.w500, align: Alignment.centerLeft);
  }

  /// A wavy photon arrow from a to b.
  static void photon(Canvas c, Offset a, Offset b, Color col, {double amp = 7, double lambda = 22, double w = 2.6}) {
    final d = b - a, len = d.distance;
    if (len < 10) return;
    final u = d / len, n = Offset(-u.dy, u.dx);
    final p = Path()..moveTo(a.dx, a.dy);
    for (var s = 0.0; s <= len - 16; s += 2) {
      final q = a + u * s + n * amp * math.sin(2 * math.pi * s / lambda);
      p.lineTo(q.dx, q.dy);
    }
    c.drawPath(p, Draw.stroke(col, w));
    IxPaint.arrow(c, a + u * (len - 18), b, col, width: w, head: 14);
  }

  /// Colour for a glowing light source of [nm] (gentle, for washes).
  static Color glow(double nm, [double a = 0.35]) => Draw.spectral(nm).withValues(alpha: a);
}
