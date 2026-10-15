import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../core/bench.dart';

/// A triangle set by two of its angles; its corners can be torn off and
/// laid on a line, and one side extended to show the exterior angle.
class TriangleBench extends LabBench {
  const TriangleBench();

  static const colA = Color(0xFFD64541), colB = Color(0xFF1F5FD6), colC = Color(0xFF1E8C4E);

  @override
  String get kind => 'triangle';

  @override
  LabParams get defaults => {'a': 70.0, 'b': 50.0, 'tear': false, 'exterior': false};

  @override
  LabParams get preview => {'a': 70.0, 'b': 50.0, 'tear': true, 'exterior': true};

  @override
  List<LabControl> controls(LabParams p) => [
        LabSlider('a', '∠A', 15, 150, divisions: 27, unit: '°'),
        LabSlider('b', '∠B', 15, 150, divisions: 27, unit: '°'),
        LabToggle('tear', tr('Tear off the corners')),
        LabToggle('exterior', tr('Exterior angle at C')),
      ];

  /// Keeps ∠A + ∠B below 180° so there is always a triangle.
  @override
  LabParams act(String action, LabParams p) {
    final a = pNum(p, 'a', 70), b = pNum(p, 'b', 50);
    if (a + b <= 165) return p;
    if (action == 'set:a') return {...p, 'b': math.max(15.0, 165 - a)};
    if (action == 'set:b') return {...p, 'a': math.max(15.0, 165 - b)};
    return p;
  }

  static (double a, double b, double c) angles(LabParams p) {
    final a = pNum(p, 'a', 70), b = pNum(p, 'b', 50);
    return (a, b, 180 - a - b);
  }

  static String kindName(double a, double b, double c) {
    final big = [a, b, c].reduce(math.max);
    if ((big - 90).abs() < 0.5) return tr('Right-angled triangle');
    return big > 90 ? tr('Obtuse-angled triangle') : tr('Acute-angled triangle');
  }

  @override
  List<LabColumn> get columns => [
        const LabColumn('∠A', 0),
        const LabColumn('∠B', 0),
        const LabColumn('∠C', 0),
        LabColumn(tr('∠A + ∠B + ∠C'), 0),
        LabColumn(tr('Exterior angle at C'), 0),
        const LabColumn('∠A + ∠B', 0),
      ];

  @override
  LabReading read(LabParams p) {
    final (a, b, c) = angles(p);
    if (c < 1) return LabReading.not(tr('These two angles already make 180°: there is no triangle.'));
    return LabReading.row([a.round(), b.round(), c.round(), (a + b + c).round(), (180 - c).round(), (a + b).round()]);
  }

  @override
  List<String> live(LabParams p) {
    final (a, b, c) = angles(p);
    return ['∠A + ∠B + ∠C = ${a.round()}° + ${b.round()}° + ${c.round()}° = ${(a + b + c).round()}°', kindName(a, b, c)];
  }

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final all180 = rows.every((r) => r[3] == 180);
    final ext = rows.every((r) => r[4] == r[5]);
    return [
      if (all180) tr('In all {n} triangles the angles added up to 180°.', {'n': rows.length}),
      if (ext) tr('Each time the exterior angle at C equalled ∠A + ∠B.'),
    ].join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final (a, b, c) = angles(p);
    final tear = pBool(p, 'tear'), ext = pBool(p, 'exterior');
    if (c < 1) {
      label(canvas, tr('These two angles already make 180°: there is no triangle.'), Offset(w / 2, h / 2), size: 17, bold: true, color: LabInk.red);
      return;
    }
    final ar = a * math.pi / 180, br = b * math.pi / 180;
    // Base BC of length 1, A found from the angles at B and C (law of sines).
    final cr = c * math.pi / 180;
    final ab = math.sin(cr) / math.sin(ar); // side AB with BC = 1
    final apex = Offset(ab * math.cos(br), -ab * math.sin(br));
    final pts = [Offset.zero, const Offset(1, 0), apex];
    final minX = pts.map((q) => q.dx).reduce(math.min), maxX = pts.map((q) => q.dx).reduce(math.max) + (ext ? 0.45 : 0);
    final minY = pts.map((q) => q.dy).reduce(math.min);
    final area = Rect.fromLTWH(w * 0.08, h * 0.1, w * (tear ? 0.5 : 0.84), h * 0.7);
    final s = math.min(area.width / (maxX - minX), area.height / -minY);
    Offset map(Offset q) => Offset(area.left + (q.dx - minX) * s + (area.width - (maxX - minX) * s) / 2, area.bottom + q.dy * s);
    final B = map(pts[0]), C = map(pts[1]), A = map(pts[2]);

    final tri = Path()..addPolygon([A, B, C], true);
    canvas.drawPath(tri, fill(const Color(0xFFF7E7C6)));
    // Angle sectors at each corner.
    double dir(Offset from, Offset to) => math.atan2(to.dy - from.dy, to.dx - from.dx);
    void sector(Offset at, Offset p1, Offset p2, Color col, String text, double r) {
      final a1 = dir(at, p1), a2 = dir(at, p2);
      var sweep = a2 - a1;
      while (sweep <= -math.pi) {
        sweep += 2 * math.pi;
      }
      while (sweep > math.pi) {
        sweep -= 2 * math.pi;
      }
      canvas.drawArc(Rect.fromCircle(center: at, radius: r), a1, sweep, true, fill(col.withValues(alpha: 0.35)));
      canvas.drawArc(Rect.fromCircle(center: at, radius: r), a1, sweep, false, stroke(col, 2.5));
      final mid = a1 + sweep / 2;
      label(canvas, text, at + Offset(math.cos(mid), math.sin(mid)) * (r + 22), size: 16, bold: true, color: col, halo: LabInk.paper);
    }

    final r = math.min(46.0, s * 0.18);
    sector(A, B, C, colA, '${a.round()}°', r);
    sector(B, C, A, colB, '${b.round()}°', r);
    sector(C, A, B, colC, '${c.round()}°', r);
    canvas.drawPath(tri, stroke(LabInk.ink, 3));
    label(canvas, 'A', A + const Offset(0, -18), size: 18, bold: true);
    label(canvas, 'B', B + const Offset(-16, 12), size: 18, bold: true);
    label(canvas, 'C', C + const Offset(12, 14), size: 18, bold: true);

    if (ext) {
      final far = C + (C - B) / (C - B).distance * s * 0.4;
      canvas.drawLine(C, far, stroke(LabInk.ink, 2.5));
      label(canvas, 'D', far + const Offset(10, 12), size: 16, bold: true);
      canvas.drawArc(Rect.fromCircle(center: C, radius: r * 1.5), dir(C, A), dir(C, far) - dir(C, A), false, stroke(const Color(0xFF8E44AD), 3));
      final mid = (dir(C, A) + dir(C, far)) / 2;
      label(canvas, '${(180 - c).round()}° = ${a.round()}° + ${b.round()}°', C + Offset(math.cos(mid), math.sin(mid)) * (r * 1.5 + 44), size: 15, bold: true, color: const Color(0xFF8E44AD), halo: LabInk.paper);
    }

    if (tear) {
      // The three corners laid side by side on a straight line.
      final o = Offset(w * 0.78, h * 0.62);
      final rr = math.min(w * 0.16, h * 0.3);
      canvas.drawLine(o - Offset(rr * 1.3, 0), o + Offset(rr * 1.3, 0), stroke(LabInk.ink, 2.5));
      var start = math.pi; // from the left, going over the top
      for (final (deg, col, name) in [(b, colB, 'B'), (a, colA, 'A'), (c, colC, 'C')]) {
        final sweep = deg * math.pi / 180;
        canvas.drawArc(Rect.fromCircle(center: o, radius: rr), start, sweep, true, fill(col.withValues(alpha: 0.35)));
        canvas.drawArc(Rect.fromCircle(center: o, radius: rr), start, sweep, true, stroke(col, 2));
        final mid = start + sweep / 2;
        label(canvas, '$name ${deg.round()}°', o + Offset(math.cos(mid), math.sin(mid)) * rr * 0.62, size: 14, bold: true, color: col, halo: LabInk.paper);
        start += sweep;
      }
      label(canvas, '${a.round()}° + ${b.round()}° + ${c.round()}° = 180°', o + Offset(0, 30), size: 16, bold: true, halo: LabInk.paper);
    }
  }
}
