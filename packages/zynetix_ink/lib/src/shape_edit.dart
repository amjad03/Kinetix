import 'dart:math' as math;
import 'dart:ui';

import 'ink_models.dart';
import 'tools/geo_tool.dart';
import 'whiteboard_controller.dart' show SelectionHandle;

// The geometry behind the Select tool's transform box and shape editing: pure functions, so
// they are tested without widgets. The controller applies them; the canvas draws the handles.

// --- Transform box ---------------------------------------------------------------------------

/// The point a handle of [box] scales about: the opposite corner or side.
Offset handleAnchor(SelectionHandle h, Rect box) => switch (h) {
  SelectionHandle.topLeft => box.bottomRight,
  SelectionHandle.topRight => box.bottomLeft,
  SelectionHandle.bottomLeft => box.topRight,
  SelectionHandle.bottomRight => box.topLeft,
  SelectionHandle.top => box.bottomCenter,
  SelectionHandle.bottom => box.topCenter,
  SelectionHandle.left => box.centerRight,
  SelectionHandle.right => box.centerLeft,
  SelectionHandle.rotate => box.center,
};

/// The scale a handle of [box] grabbed at [from] and dragged to [to] gives, about
/// [handleAnchor]. Corners keep the proportions unless [free]; sides stretch one way.
({Offset anchor, double sx, double sy}) handleScale(SelectionHandle h, Rect box, Offset from, Offset to, {bool free = false}) {
  final anchor = handleAnchor(h, box);
  // Measured from where the handle was grabbed, so the box does not jump when it is taken.
  double ratio(double now, double was, double at) => (was - at).abs() < 1e-9 ? 1 : ((now - at) / (was - at)).clamp(0.05, 50.0);
  var sx = 1.0, sy = 1.0;
  switch (h) {
    case SelectionHandle.left || SelectionHandle.right:
      sx = ratio(to.dx, from.dx, anchor.dx);
    case SelectionHandle.top || SelectionHandle.bottom:
      sy = ratio(to.dy, from.dy, anchor.dy);
    case SelectionHandle.rotate:
      break;
    default:
      if (free) {
        sx = ratio(to.dx, from.dx, anchor.dx);
        sy = ratio(to.dy, from.dy, anchor.dy);
      } else {
        // Along the diagonal, so the proportions stay.
        final d0 = from - anchor, d = to - anchor;
        sx = sy = d0.distanceSquared == 0 ? 1.0 : ((d.dx * d0.dx + d.dy * d0.dy) / d0.distanceSquared).clamp(0.05, 50.0);
      }
  }
  return (anchor: anchor, sx: sx, sy: sy);
}

/// [a] (radians) settled on the nearest 15° step when within [within] degrees of it, unless
/// [free].
double snapTurn(double a, {bool free = false, double within = 4}) {
  if (free) return a;
  final deg = a * 180 / math.pi;
  final step = (deg / 15).round() * 15.0;
  return (deg - step).abs() < within ? step * math.pi / 180 : a;
}

/// [e] mirrored about [c]: left to right when [horizontal], else top to bottom. A turned box
/// turns the other way, so it reads as a mirror image of itself.
BoardElement flipElement(BoardElement e, Offset c, {required bool horizontal}) {
  var out = horizontal ? e.scaled(c, -1, 1) : e.scaled(c, 1, -1);
  final r = e.rotation;
  if (r != 0) out = out.rotated(out.frame.center, -2 * r);
  return out;
}

// --- Measurements ----------------------------------------------------------------------------

/// Whether [e] can show measurements: a drawn shape or a straight-sided figure.
bool measurable(BoardElement e) => (e is Stroke && e.shape != null) || e is PolygonElement;

/// The measurements [e] shows itself (none for anything else).
ShapeMeasure measureOf(BoardElement e) => switch (e) {
  Stroke(:final measure) => measure,
  PolygonElement(:final measure) => measure,
  _ => ShapeMeasure.none,
};

/// [e] showing [m] (anything that cannot be measured is returned as it is).
BoardElement withMeasure(BoardElement e, ShapeMeasure m) => switch (e) {
  Stroke() when e.shape != null => e.copyWith(measure: m),
  PolygonElement() => e.copyWith(measure: m),
  _ => e,
};

/// The area inside [poly] (shoelace).
double polygonArea(List<Offset> poly) {
  var a = 0.0;
  for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += (poly[j].dx + poly[i].dx) * (poly[j].dy - poly[i].dy);
  }
  return a.abs() / 2;
}

/// The centre and semi-axes of a round shape's outline (equal for a circle): the furthest and
/// nearest outline points from its centre, so they stay right after it is turned.
({Offset center, double major, double minor}) roundAxes(Stroke s) {
  final pts = [for (final p in s.points) p.offset];
  if (pts.length > 1 && (pts.first - pts.last).distance < 0.01) pts.removeLast();
  if (pts.isEmpty) return (center: Offset.zero, major: 0, minor: 0);
  final c = pts.fold(Offset.zero, (a, b) => a + b) / pts.length.toDouble();
  var major = 0.0, minor = double.infinity;
  for (final p in pts) {
    final d = (p - c).distance;
    major = math.max(major, d);
    minor = math.min(minor, d);
  }
  return (center: c, major: major, minor: minor);
}

/// [px] board units as a length: on the calibrated scale (the geometry box's cm or inches), or
/// in board pixels.
String formatLength(double px, MeasureUnit unit) =>
    unit == MeasureUnit.px ? '${px.round()} px' : '${(px / GeoCalibration.unit).toStringAsFixed(1)} ${GeoCalibration.unitName}';

/// [px2] square board units as an area.
String formatArea(double px2, MeasureUnit unit) {
  if (unit == MeasureUnit.px) return '${px2.round()} px²';
  final u = GeoCalibration.unit;
  return '${(px2 / (u * u)).toStringAsFixed(1)} ${GeoCalibration.unitName}²';
}

// --- Shape handles ---------------------------------------------------------------------------

/// What a shape handle changes.
enum ShapeHandleKind {
  /// A corner of a figure, or an end of a line or arrow.
  vertex,

  /// A circle's radius.
  radius,

  /// How round a rectangle's corners are.
  corner,
}

/// One handle on a selected shape: its kind and, for a vertex, which one.
class ShapeHandle {
  const ShapeHandle(this.kind, [this.index = 0]);

  final ShapeHandleKind kind;
  final int index;

  @override
  bool operator ==(Object other) => other is ShapeHandle && other.kind == kind && other.index == index;
  @override
  int get hashCode => Object.hash(kind, index);

  @override
  String toString() => 'ShapeHandle(${kind.name}, $index)';
}

bool _isLine(ShapeKind? k) => k == ShapeKind.line || k == ShapeKind.arrow || k == ShapeKind.doubleArrow;

/// Lines and arrows are edited by their ends straight away; other shapes once "Edit points"
/// is on.
bool editsByEnds(BoardElement e) => e is Stroke && _isLine(e.shape) || (e is PolygonElement && !e.closed && e.points.length == 2);

/// Whether [e] has shape handles at all.
bool hasShapeHandles(BoardElement e) => switch (e) {
  Stroke(:final shape) => shape != null && shape != ShapeKind.ellipse,
  PolygonElement(:final points) => points.length >= 2,
  _ => false,
};

/// [e]'s corners (without a closing repeat).
List<Offset> _corners(BoardElement e) => switch (e) {
  Stroke() => e.vertices,
  PolygonElement(:final points) => points,
  _ => const [],
};

/// Where the corner handle of a rectangle-like shape with corner radius [corner] sits: inside
/// its first corner, along the line that halves it, [pad] further in so it clears the vertex.
Offset _cornerHandle(List<Offset> v, double corner, double pad) {
  final a = v[0], u1 = _unit(v[1] - a), u2 = _unit(v[v.length - 1] - a);
  final bis = _unit(u1 + u2);
  // Along the bisector of a right angle, an inset of r on each side is r·√2 away.
  return a + bis * ((corner + pad) * math.sqrt2);
}

Offset _unit(Offset d) => d.distance == 0 ? Offset.zero : d / d.distance;

/// [e]'s shape handles in board units. [pad] keeps the corner handle clear of the vertex
/// (board units, so the same on screen at any zoom).
List<(ShapeHandle, Offset)> shapeHandlesOf(BoardElement e, {double pad = 20}) {
  if (!hasShapeHandles(e)) return const [];
  if (e is Stroke && e.shape == ShapeKind.circle) {
    return [(const ShapeHandle(ShapeHandleKind.radius), e.points.first.offset)];
  }
  final v = _corners(e);
  return [
    for (var i = 0; i < v.length; i++) (ShapeHandle(ShapeHandleKind.vertex, i), v[i]),
    if (e is Stroke && e.shape == ShapeKind.rectangle && v.length == 4) (const ShapeHandle(ShapeHandleKind.corner), _cornerHandle(v, e.corner, pad)),
  ];
}

/// [e] with handle [h] dragged to board point [to]. Measurements follow, as they are worked
/// out from the shape when it is drawn.
BoardElement dragShapeHandle(BoardElement e, ShapeHandle h, Offset to, {double pad = 20}) {
  switch (h.kind) {
    case ShapeHandleKind.vertex:
      if (e is PolygonElement) {
        if (h.index >= e.points.length) return e;
        return e.copyWith(points: [...e.points]..[h.index] = to);
      }
      if (e is Stroke) {
        final pts = List.of(e.points);
        if (pts.isEmpty) return e;
        final closed = pts.length > 2 && (pts.first.offset - pts.last.offset).distance < 0.01;
        final i = _isLine(e.shape) && h.index > 0 ? pts.length - 1 : h.index;
        if (i >= pts.length) return e;
        pts[i] = InkPoint(to.dx, to.dy, pts[i].pressure);
        if (closed && i == 0) pts[pts.length - 1] = pts[0];
        return e.copyWith(points: pts);
      }
      return e;
    case ShapeHandleKind.radius:
      if (e is! Stroke) return e;
      final c = roundAxes(e).center;
      final r = math.max(2.0, (to - c).distance);
      final d0 = e.points.first.offset - c;
      final a0 = math.atan2(d0.dy, d0.dx);
      final n = math.max(8, e.points.length - 1);
      return e.copyWith(
        points: [for (var i = 0; i <= n; i++) InkPoint(c.dx + r * math.cos(a0 + 2 * math.pi * i / n), c.dy + r * math.sin(a0 + 2 * math.pi * i / n))],
      );
    case ShapeHandleKind.corner:
      if (e is! Stroke) return e;
      final v = e.vertices;
      if (v.length != 4) return e;
      final bis = _unit(_unit(v[1] - v[0]) + _unit(v[3] - v[0]));
      final along = (to - v[0]).dx * bis.dx + (to - v[0]).dy * bis.dy;
      final most = math.min((v[1] - v[0]).distance, (v[3] - v[0]).distance) / 2;
      return e.copyWith(corner: (along / math.sqrt2 - pad).clamp(0.0, most));
  }
}

/// A line or arrow's heads: none (a line), at the end, at the start, or both.
enum ArrowEnds { none, end, start, both }

/// Which ends of [s] have heads.
ArrowEnds arrowEndsOf(Stroke s) => switch (s.shape) {
  ShapeKind.arrow => ArrowEnds.end,
  ShapeKind.doubleArrow => ArrowEnds.both,
  _ => ArrowEnds.none,
};

/// [s] (a line or arrow) with heads at [ends]. A head at the start alone is an arrow drawn the
/// other way, so older readers show it too.
Stroke withArrowEnds(Stroke s, ArrowEnds ends) {
  if (!_isLine(s.shape)) return s;
  return switch (ends) {
    ArrowEnds.none => s.copyWith(shape: ShapeKind.line),
    ArrowEnds.end => s.copyWith(shape: ShapeKind.arrow),
    ArrowEnds.start => s.copyWith(shape: ShapeKind.arrow, points: s.points.reversed.toList()),
    ArrowEnds.both => s.copyWith(shape: ShapeKind.doubleArrow),
  };
}

/// Where Align lines the selected elements up: on the selection's left, centre or right, or
/// its top, middle or bottom.
enum BoardAlign { left, centre, right, top, middle, bottom }
