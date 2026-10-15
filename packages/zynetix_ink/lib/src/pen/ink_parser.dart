import 'dart:math' as math;
import 'dart:ui';

import '../ink_models.dart';
import 'shape_fit.dart';

/// Splits a batch of pen strokes into drawn shapes and handwriting.
///
/// A circle and the letter O (or 0) can be the very same ink; a square drawn in two strokes can
/// look like a D. So the decision uses, in order:
/// 1. geometry: does a clean shape explain all of the ink (see shape_fit.dart)?
/// 2. size on screen, compared with this teacher's own letter size, and
/// 3. context: is it sitting in a line of writing?

/// Ink that a clean shape explains.
class InkShape {
  const InkShape(this.strokes, this.fit, {this.arrow});

  final List<Stroke> strokes;
  final Fit fit;

  /// Tail and tip when the shape is an arrow.
  final (Offset, Offset)? arrow;
}

class InkReading {
  const InkReading(this.shapes, this.writing, [this.drawings = const []]);

  final List<InkShape> shapes;
  final List<Stroke> writing;

  /// Drawings that are no clean shape (a doodle, a sketch): left as ink, never read as letters.
  final List<Stroke> drawings;
}

class InkContext {
  const InkContext({this.scale = 1, this.letterPx = 46, this.textNear = const []});

  /// The board's zoom: board units × scale = screen pixels.
  final double scale;

  /// Typical height of this teacher's handwritten letters, in screen pixels.
  final double letterPx;

  /// Typed text and equations already on the board near the ink (board units).
  final List<Rect> textNear;
}

/// The ink's points, without pressure.
List<Offset> offsetsOf(Stroke s) => [for (final p in s.points) p.offset];

/// The box around [strokes]' ink (without the line width).
Rect inkBounds(Iterable<Stroke> strokes) => boundsOfPoints([for (final s in strokes) ...s.points.map((p) => p.offset)]);

/// Pen ink the AI pen may read: not highlighter, not shapes already.
bool isPenInk(BoardElement e) => e is Stroke && e.style.tool == InkTool.pen && e.shape == null && e.points.isNotEmpty;

double _strokeGap(Stroke a, Stroke b) {
  // The closest either stroke's ends come to the other stroke.
  var best = double.infinity;
  for (final (p, other) in [(a.points.first.offset, b), (a.points.last.offset, b), (b.points.first.offset, a), (b.points.last.offset, a)]) {
    final pts = other.points;
    for (var i = 1; i < pts.length; i++) {
      best = math.min(best, segmentDistance(p, pts[i - 1].offset, pts[i].offset));
    }
    if (pts.length == 1) best = math.min(best, (p - pts.first.offset).distance);
  }
  return best;
}

/// Groups of strokes that touch each other (a shape drawn in several strokes, or a joined-up
/// word).
List<List<Stroke>> touchingGroups(List<Stroke> strokes, double scale) {
  final parent = List.generate(strokes.length, (i) => i);
  int find(int i) => parent[i] == i ? i : parent[i] = find(parent[i]);
  final boxes = [
    for (final s in strokes) inkBounds([s]),
  ];
  for (var i = 0; i < strokes.length; i++) {
    for (var j = i + 1; j < strokes.length; j++) {
      final a = boxes[i], b = boxes[j];
      final big = math.max(a.longestSide, b.longestSide);
      final tol = math.max(10 / scale, big * 0.09);
      if (!a.inflate(tol).overlaps(b.inflate(0.5))) continue;
      if (_strokeGap(strokes[i], strokes[j]) <= tol) parent[find(i)] = find(j);
    }
  }
  final groups = <int, List<Stroke>>{};
  for (var i = 0; i < strokes.length; i++) {
    groups.putIfAbsent(find(i), () => []).add(strokes[i]);
  }
  return groups.values.toList();
}

/// One straight shaft with a small head at one end: an arrow.
(Offset, Offset)? _arrowIn(List<Stroke> group) {
  if (group.length > 3) return null;
  final sorted = [...group]..sort((a, b) => inkBounds([b]).longestSide.compareTo(inkBounds([a]).longestSide));
  final shaft = sorted.first;
  if (group.length == 1) {
    // One stroke: the shaft, then a short back-and-forth head.
    final pts = offsetsOf(shaft);
    final size = inkBounds([shaft]).longestSide;
    if (size <= 0) return null;
    final simple = _rdp(resampleBy(pts, size / 40), size * 0.06);
    if (simple.length < 3 || simple.length > 7) return null;
    final segs = [for (var i = 1; i < simple.length; i++) (simple[i] - simple[i - 1]).distance];
    final len = segs.first;
    if (segs.skip(1).any((s) => s > len * 0.45)) return null;
    final tip = simple[1];
    if (simple.skip(2).any((p) => (p - tip).distance > len * 0.45)) return null;
    final dir = (tip - simple[0]) / len;
    final back = simple.skip(2).any((p) {
      final d = p - tip;
      return (d.dx * dir.dx + d.dy * dir.dy) < -d.distance * 0.3;
    });
    return back ? (simple[0], tip) : null;
  }
  final line = fitLine([offsetsOf(shaft)]);
  if (line == null) return null;
  final a = line.outline[0], b = line.outline[1];
  final len = (b - a).distance;
  for (final head in sorted.skip(1)) {
    if (inkBounds([head]).longestSide > len * 0.5) return null;
  }
  final headBox = inkBounds(sorted.skip(1));
  final atB = (headBox.center - b).distance < len * 0.25, atA = (headBox.center - a).distance < len * 0.25;
  if (atB == atA) return null;
  return atB ? (a, b) : (b, a);
}

List<Offset> _rdp(List<Offset> pts, double eps) {
  if (pts.length < 3) return List.of(pts);
  var maxD = 0.0;
  var idx = 0;
  for (var i = 1; i < pts.length - 1; i++) {
    final d = segmentDistance(pts[i], pts.first, pts.last);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD <= eps) return [pts.first, pts.last];
  final l = _rdp(pts.sublist(0, idx + 1), eps), r = _rdp(pts.sublist(idx), eps);
  return [...l.sublist(0, l.length - 1), ...r];
}

/// The shape (if any) that explains all of [group].
(Fit, (Offset, Offset)?)? shapeOfGroup(List<Stroke> group) {
  final arrow = _arrowIn(group);
  if (arrow != null) return (Fit(FitKind.line, [arrow.$1, arrow.$2], 0, 1), arrow);
  final pts = [for (final s in group) offsetsOf(s)];
  final closed = fitClosed(pts);
  if (closed != null) return (closed, null);
  final line = fitLine(pts);
  if (line != null) return (line, null);
  return null;
}

/// Splits [strokes] into shapes, writing and sketches.
InkReading parseInk(List<Stroke> strokes, InkContext ctx) {
  final ink = strokes.where(isPenInk).toList();
  final groups = touchingGroups(ink, ctx.scale);
  final letter = ctx.letterPx;

  // First pass: what each group could be.
  final cands = <(List<Stroke>, Fit, (Offset, Offset)?)>[];
  final rest = <List<Stroke>>[];
  for (final g in groups) {
    var s = shapeOfGroup(g);
    var shapeStrokes = g;
    if (s == null && g.length >= 2) {
      // A label touching a shape: try the shape without the small strokes.
      final box = inkBounds(g);
      final big = g.where((x) => inkBounds([x]).longestSide >= box.longestSide * 0.35).toList();
      if (big.length < g.length && big.isNotEmpty) {
        final t = shapeOfGroup(big);
        if (t != null && (!t.$1.isOval || inkBounds(big).longestSide * ctx.scale >= 2 * letter)) {
          s = t;
          shapeStrokes = big;
          rest.add(g.where((x) => !big.contains(x)).toList());
        }
      }
    }
    if (s == null) {
      rest.add(g);
    } else {
      cands.add((shapeStrokes, s.$1, s.$2));
    }
  }

  // Writing neighbours: groups that are not shapes, and typed text.
  final writingBoxes = [for (final g in rest) inkBounds(g), ...ctx.textNear];
  bool inWritingLine(Rect r) {
    for (final w in writingBoxes) {
      if (w == r) continue;
      final h = math.max(r.height, w.height);
      final vOverlap = math.min(r.bottom, w.bottom) - math.max(r.top, w.top);
      final hGap = math.max(w.left - r.right, r.left - w.right);
      if (vOverlap > math.min(r.height, w.height) * 0.4 && hGap < h * 1.6 && w.height > r.height * 0.35 && w.height < r.height * 2.5) return true;
    }
    return false;
  }

  bool barOfFraction(Rect r) {
    for (final w in writingBoxes) {
      final inSpan = w.center.dx > r.left && w.center.dx < r.right;
      if (inSpan && (w.bottom < r.center.dy || w.top > r.center.dy) && (w.center.dy - r.center.dy).abs() < letter / ctx.scale * 1.5) return true;
    }
    return false;
  }

  final shapes = <InkShape>[];
  final writing = <Stroke>[];
  final drawings = <Stroke>[];
  for (final g in rest) {
    final box = inkBounds(g);
    // Much bigger than handwriting and not part of a line of it: a sketch.
    if (box.longestSide * ctx.scale >= math.max(3.2 * letter, 150) && box.height * ctx.scale >= 2.2 * letter && !inWritingLine(box)) {
      drawings.addAll(g);
    } else {
      writing.addAll(g);
    }
  }
  for (final (g, f, arrow) in cands) {
    final box = inkBounds(g);
    final px = box.longestSide * ctx.scale;
    bool keep;
    if (arrow != null) {
      keep = px >= math.max(1.8 * letter, 70);
    } else if (f.kind == FitKind.line) {
      keep = px >= math.max(3 * letter, 140) && !barOfFraction(box) && !inWritingLine(box);
    } else if (px >= math.max(2.2 * letter, 100)) {
      keep = true;
    } else if (px < 1.3 * letter) {
      keep = false;
    } else if (inWritingLine(box)) {
      keep = false;
    } else if (f.error > 0.03 || f.coverage < 0.92) {
      // Close to letter size: only a clean, complete shape counts.
      keep = false;
    } else if (f.isOval) {
      // O and 0 are taller than they are wide; a drawn circle is round.
      keep = box.height / math.max(1, box.width) < 1.25;
    } else {
      keep = true;
    }
    if (keep) {
      shapes.add(InkShape(g, f, arrow: arrow));
    } else {
      writing.addAll(g);
    }
  }
  // Keep the order the ink was written in (the handwriting recognisers rely on it).
  final order = {for (final (i, s) in ink.indexed) s.id: i};
  writing.sort((a, b) => order[a.id]!.compareTo(order[b.id]!));
  return InkReading(shapes, writing, drawings);
}

/// Typical letter height (screen pixels) of a cluster of handwriting.
double letterHeightPx(List<Stroke> writing, double scale) {
  final hs = <double>[];
  for (final s in writing) {
    final b = inkBounds([s]);
    if (b.height > b.width * 0.35) hs.add(b.height * scale);
  }
  hs.sort();
  return hs.isEmpty ? 0 : hs[hs.length ~/ 2];
}

// --- Board elements -------------------------------------------------------------------------

/// The board element for a fitted shape, in [color] and [width]: a shape stroke (so it measures,
/// fills and shows in every viewer like one drawn with the Shapes tool), or a [PolygonElement]
/// for figures the Shapes tool has no name for.
BoardElement shapeElement(InkShape s, Color color, double width) {
  final f = s.fit;
  final style = InkStyle(tool: InkTool.shape, color: color, width: width);
  Stroke shape(ShapeKind kind, List<Offset> pts, {bool close = true}) => Stroke(
    id: newElementId(),
    style: style.copyWith(shape: kind),
    shape: kind,
    points: [
      for (final p in [...pts, if (close) pts.first]) InkPoint(p.dx, p.dy),
    ],
  );
  if (s.arrow != null) return shape(ShapeKind.arrow, [s.arrow!.$1, s.arrow!.$2], close: false);
  switch (f.kind) {
    case FitKind.line:
      return shape(ShapeKind.line, f.outline, close: false);
    case FitKind.circle || FitKind.ellipse:
      final oval = f.oval;
      if (oval != null) {
        final kind = f.kind == FitKind.circle ? ShapeKind.circle : ShapeKind.ellipse;
        final pts = kind == ShapeKind.circle ? shapePoints(kind, oval.center, oval.centerRight) : shapePoints(kind, oval.topLeft, oval.bottomRight);
        return Stroke(
          id: newElementId(),
          style: style.copyWith(shape: kind),
          shape: kind,
          points: pts,
        );
      }
      return shape(ShapeKind.ellipse, f.outline);
    case FitKind.triangle:
      final t = f.outline;
      final right = [for (var i = 0; i < 3; i++) angleAt(t[(i + 2) % 3], t[i], t[(i + 1) % 3])].any((a) => (a - 90).abs() < 4);
      return shape(right ? ShapeKind.rightTriangle : ShapeKind.triangle, t);
    case FitKind.rectangle || FitKind.square:
      return shape(ShapeKind.rectangle, f.outline);
    case FitKind.quad:
      final kind = quadKind(f.outline);
      if (kind != null) return shape(kind, f.outline);
      return PolygonElement(id: newElementId(), points: f.outline, color: color, width: width);
    case FitKind.polygon:
      final regular = f.outline.length == 5 ? ShapeKind.pentagon : (f.outline.length == 6 ? ShapeKind.hexagon : null);
      if (regular != null && _isRegular(f.outline)) return shape(regular, f.outline);
      return PolygonElement(id: newElementId(), points: f.outline, color: color, width: width);
  }
}

bool _isRegular(List<Offset> p) {
  final c = p.reduce((a, b) => a + b) / p.length.toDouble();
  final r = [for (final v in p) (v - c).distance];
  final mean = r.reduce((a, b) => a + b) / r.length;
  return r.every((x) => (x - mean).abs() < mean * 0.05);
}

/// A rhombus, parallelogram or trapezium, by its sides; null for any other four-sided figure.
ShapeKind? quadKind(List<Offset> q) {
  if (q.length != 4) return null;
  bool parallel(Offset a, Offset b, Offset c, Offset d) {
    final u = b - a, v = d - c;
    final sin = (u.dx * v.dy - u.dy * v.dx).abs() / math.max(1e-9, u.distance * v.distance);
    return sin < 0.09; // within about 5°
  }

  final p1 = parallel(q[0], q[1], q[3], q[2]), p2 = parallel(q[1], q[2], q[0], q[3]);
  final sides = [for (var i = 0; i < 4; i++) (q[(i + 1) % 4] - q[i]).distance];
  final mean = sides.reduce((a, b) => a + b) / 4;
  if (p1 && p2) return sides.every((s) => (s - mean).abs() < mean * 0.08) ? ShapeKind.rhombus : ShapeKind.parallelogram;
  if (p1 || p2) return ShapeKind.trapezium;
  return null;
}

/// A short English name for a fitted shape (for the inspector and tests).
String fitName(Fit f) => switch (f.kind) {
  FitKind.circle => 'circle',
  FitKind.ellipse => 'ellipse',
  FitKind.rectangle => 'rectangle',
  FitKind.square => 'square',
  FitKind.triangle => 'triangle',
  FitKind.quad => 'quadrilateral',
  FitKind.polygon => 'polygon',
  FitKind.line => 'line',
};
