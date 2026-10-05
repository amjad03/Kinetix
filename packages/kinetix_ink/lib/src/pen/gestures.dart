import 'dart:math' as math;
import 'dart:ui';

import '../ink_models.dart';

/// True when [pts] is a back-and-forth scribble (the "cross it out" gesture): several reversals
/// along its long side and a path far longer than the area it covers.
bool isScribble(List<Offset> pts) {
  if (pts.length < 12) return false;
  var len = 0.0;
  var l = pts.first.dx, r = pts.first.dx, t = pts.first.dy, b = pts.first.dy;
  for (var i = 1; i < pts.length; i++) {
    len += (pts[i] - pts[i - 1]).distance;
    l = math.min(l, pts[i].dx);
    r = math.max(r, pts[i].dx);
    t = math.min(t, pts[i].dy);
    b = math.max(b, pts[i].dy);
  }
  final w = r - l, h = b - t;
  if (w < 30 && h < 30) return false;
  final span = math.max(w, h);
  if (len < span * 3.2) return false;
  // Reversals along the long side, ignoring jitter.
  final horizontal = w >= h;
  var reversals = 0;
  var dir = 0;
  var anchor = horizontal ? pts.first.dx : pts.first.dy;
  final minRun = span * 0.18;
  for (final p in pts) {
    final v = horizontal ? p.dx : p.dy;
    final d = v - anchor;
    if (d.abs() < minRun) continue;
    final s = d.sign.toInt();
    if (dir != 0 && s != dir) reversals++;
    dir = s;
    anchor = v;
  }
  return reversals >= 4;
}

/// Elements a scribble crosses out: those mostly covered by its box. Pictures, graphs and notes
/// are never scribbled away (as with the eraser, a hand resting on them must not wipe them).
Set<String> scribbledOver(List<Offset> scribble, List<BoardElement> els, String scribbleId) {
  var box = Rect.fromPoints(scribble.first, scribble.first);
  for (final p in scribble) {
    box = box.expandToInclude(Rect.fromPoints(p, p));
  }
  box = box.inflate(6);
  final out = <String>{};
  for (final e in els) {
    if (e.id == scribbleId) continue;
    if (e is! Stroke && e is! PolygonElement && e is! TextElement && e is! MathElement) continue;
    final b = e.bounds;
    final i = b.intersect(box);
    if (i.width <= 0 || i.height <= 0) continue;
    final covered = (i.width * i.height) / math.max(1, b.width * b.height);
    if (covered > 0.5 || box.contains(b.center)) out.add(e.id);
  }
  return out;
}
