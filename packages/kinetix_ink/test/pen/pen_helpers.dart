import 'dart:math' as math;
import 'dart:ui';

import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ink/src/pen/symbol_glyphs.dart';

final _rnd = math.Random(7);

Offset _jitter(Offset p, double amount) => p + Offset((_rnd.nextDouble() - 0.5) * amount, (_rnd.nextDouble() - 0.5) * amount);

Stroke ink(List<Offset> pts, {double width = 4, Color color = const Color(0xFF1B1B1F)}) => Stroke(
  id: newElementId(),
  style: InkStyle(tool: InkTool.pen, color: color, width: width),
  points: [for (final p in pts) InkPoint(p.dx, p.dy)],
);

/// A hand-like line through [corners]: wobbly, and (closed) not quite meeting its start.
List<Offset> sketch(List<Offset> corners, {bool close = true, double wobble = 6}) {
  final out = <Offset>[];
  final pts = close ? [...corners, corners.first] : corners;
  for (var i = 0; i + 1 < pts.length; i++) {
    for (var t = 0.0; t < 1; t += 0.05) {
      out.add(_jitter(Offset.lerp(pts[i], pts[i + 1], t)!, wobble));
    }
  }
  out.add(close ? corners.first + const Offset(9, 7) : pts.last);
  return out;
}

List<Offset> roughCircle(Offset c, double r, {double wobble = 7}) => [
  for (var a = 0.0; a < 2 * math.pi; a += 0.12) _jitter(Offset(c.dx + r * math.cos(a), c.dy + r * math.sin(a)), wobble),
];

List<Offset> line(Offset a, Offset b, {int n = 10}) => [for (var i = 0; i <= n; i++) Offset.lerp(a, b, i / n)!];

/// Symbol [s] written as cleanly as its outline, [h] units tall for the x-height, its cell's top
/// left at [at].
List<Stroke> write(String s, Offset at, {double h = 40, int variant = 0}) {
  final v = glyphVariants.where((g) => g.symbol == s).elementAt(variant);
  return [
    for (final stroke in v.strokes) ink([for (final p in stroke) Offset(at.dx + p.x * h, at.dy + p.y * h)], width: 3),
  ];
}
