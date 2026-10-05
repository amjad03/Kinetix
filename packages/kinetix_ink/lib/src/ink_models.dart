import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui';

part 'elements.dart';
part 'sheet_element.dart';

/// What a pointer does when it touches the board.
enum InkTool { pen, highlighter, eraser, shape, select }

/// 2D shapes the Shapes tool can draw. Each becomes an ordinary stroke made of points, so it
/// erases, moves and undoes like handwriting, and remembers its kind for measurements.
enum ShapeKind {
  line,
  arrow,
  doubleArrow,
  circle,
  ellipse,
  triangle,
  rightTriangle,
  rectangle,
  parallelogram,
  trapezium,
  rhombus,
  pentagon,
  hexagon;

  /// Shapes whose corners get interior-angle labels.
  bool get isPolygon => index >= ShapeKind.triangle.index;
  bool get isRound => this == ShapeKind.circle || this == ShapeKind.ellipse;
}

/// How large contacts (a palm, a fist, a sleeve) are treated.
enum PalmMode {
  /// Ignore them: a hand resting on a tablet must not draw.
  ignore,

  /// Erase with them, like a duster: what teachers expect on interactive panels.
  erase,

  /// Treat every touch the same. IR touch frames do not report contact size reliably.
  off,
}

class InkPoint {
  const InkPoint(this.x, this.y, [this.pressure = 0.5]);

  final double x;
  final double y;

  /// 0..1. Fingers and mice report a constant; pens report real pressure.
  final double pressure;

  Offset get offset => Offset(x, y);

  InkPoint translate(Offset d) => InkPoint(x + d.dx, y + d.dy, pressure);
}

/// Pen settings for one pointer. Each finger or pen can have its own (multi-user zones).
class InkStyle {
  const InkStyle({required this.tool, required this.color, required this.width, this.shape = ShapeKind.rectangle});

  final InkTool tool;
  final Color color;
  final double width;
  final ShapeKind shape;

  InkStyle copyWith({InkTool? tool, Color? color, double? width, ShapeKind? shape}) =>
      InkStyle(tool: tool ?? this.tool, color: color ?? this.color, width: width ?? this.width, shape: shape ?? this.shape);
}

/// Pen, highlighter and shape ink: a line of points. Shapes drawn with the Shapes tool are
/// strokes too (with [shape] set), so they erase, move and undo like handwriting, keep their
/// kind for measurements, and show in every viewer, old or new.
///
/// While a stroke is being drawn its [points] grow in place; once it is on a page it is not
/// changed again (a move makes a new stroke with [translated]), except by the older
/// [InkController], which moves strokes in place with [translate].
class Stroke extends BoardElement {
  Stroke({required this.id, required this.style, List<InkPoint>? points, this.shape, this.fill}) : points = points ?? [];

  @override
  final String id;
  final InkStyle style;
  final List<InkPoint> points;

  /// Set when this stroke was drawn with the Shapes tool (or along the ruler, as a line).
  final ShapeKind? shape;

  /// Inside colour of a closed shape, or null for an outline.
  final Color? fill;

  @override
  Rect get bounds {
    if (points.isEmpty) return Rect.zero;
    var minX = points.first.x, maxX = minX, minY = points.first.y, maxY = minY;
    for (final p in points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return Rect.fromLTRB(minX, minY, maxX, maxY).inflate(style.width / 2);
  }

  /// Moves the points in place (the older [InkController]'s select tool).
  void translate(Offset d) {
    for (var i = 0; i < points.length; i++) {
      points[i] = points[i].translate(d);
    }
  }

  /// True if a circle at [c] with radius [r] touches any segment of this stroke (or, for a
  /// filled shape, lies inside it).
  bool hitBy(Offset c, double r) {
    final reach = r + style.width / 2;
    if (!bounds.inflate(r).contains(c)) return false;
    if (points.length == 1) return (points.first.offset - c).distance <= reach;
    for (var i = 1; i < points.length; i++) {
      if (_distanceToSegment(c, points[i - 1].offset, points[i].offset) <= reach) return true;
    }
    if (fill != null && points.length > 2) return _insidePolygon(c, [for (final p in points) p.offset]);
    return false;
  }

  @override
  bool hitTest(Offset p, double radius) => hitBy(p, radius);

  /// Corners of a polygon shape (without the closing repeat), or the two ends of a line.
  List<Offset> get vertices {
    if (shape == null || shape!.isRound) return const [];
    final pts = points.map((p) => p.offset).toList();
    if (pts.length > 1 && pts.first == pts.last) pts.removeLast();
    return pts;
  }

  Stroke copyWith({String? id, InkStyle? style, List<InkPoint>? points, Color? fill, bool clearFill = false}) => Stroke(
    id: id ?? this.id,
    style: style ?? this.style,
    points: points ?? List.of(this.points),
    shape: shape,
    fill: clearFill ? null : (fill ?? this.fill),
  );

  @override
  Stroke translated(Offset d) => _moved(this, d, copyWith(points: [for (final p in points) p.translate(d)]));

  @override
  Stroke scaled(Offset origin, double sx, double sy) {
    final pts = [for (final p in points) _scalePoint(p, origin, sx, sy)];
    // Handwriting keeps its look: the line grows with the even part of the scale. A circle
    // pulled out of round becomes an ellipse.
    final k = math.sqrt((sx * sy).abs());
    final kind = shape == ShapeKind.circle && (sx - sy).abs() > 0.01 ? ShapeKind.ellipse : shape;
    return Stroke(
      id: id,
      style: shape == null ? style.copyWith(width: (style.width * k).clamp(0.5, 120.0)) : style,
      points: pts,
      shape: kind,
      fill: fill,
    );
  }

  @override
  Stroke rotated(Offset center, double angle) => copyWith(points: [for (final p in points) _rotateInk(p, center, angle)]);

  @override
  Stroke recolored(Color c) => copyWith(
    style: style.copyWith(color: style.tool == InkTool.highlighter ? c.withValues(alpha: style.color.a) : c),
    fill: fill == null ? null : c.withValues(alpha: fill!.a),
  );

  @override
  Stroke withId(String id) => copyWith(id: id);
}

InkPoint _scalePoint(InkPoint p, Offset o, double sx, double sy) => InkPoint(o.dx + (p.x - o.dx) * sx, o.dy + (p.y - o.dy) * sy, p.pressure);

InkPoint _rotateInk(InkPoint p, Offset c, double a) {
  final r = rotatePoint(p.offset, c, a);
  return InkPoint(r.dx, r.dy, p.pressure);
}

bool _insidePolygon(Offset p, List<Offset> poly) {
  var inside = false;
  for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    final a = poly[i], c = poly[j];
    if ((a.dy > p.dy) != (c.dy > p.dy) && p.dx < (c.dx - a.dx) * (p.dy - a.dy) / (c.dy - a.dy) + a.dx) inside = !inside;
  }
  return inside;
}

double _distanceToSegment(Offset p, Offset a, Offset b) {
  final ab = b - a;
  final len2 = ab.dx * ab.dx + ab.dy * ab.dy;
  if (len2 == 0) return (p - a).distance;
  var t = ((p - a).dx * ab.dx + (p - a).dy * ab.dy) / len2;
  t = t.clamp(0.0, 1.0);
  return (p - (a + ab * t)).distance;
}

/// Logical pixels per centimetre at the standard 96 dpi. Board grids use 1 cm squares, and
/// shape measurements are given in the same units so they agree with the grid.
const double pxPerCm = 96 / 2.54;

/// Points for a shape dragged from [a] to [b].
List<InkPoint> shapePoints(ShapeKind kind, Offset a, Offset b) {
  final r = Rect.fromPoints(a, b);
  final c = r.center;
  List<InkPoint> poly(List<Offset> v) => [...v, v.first].map((o) => InkPoint(o.dx, o.dy)).toList();
  List<InkPoint> regular(int n) {
    final radius = math.min(r.width, r.height) / 2;
    return poly([
      for (var i = 0; i < n; i++)
        c + Offset(math.cos(-math.pi / 2 + 2 * math.pi * i / n), math.sin(-math.pi / 2 + 2 * math.pi * i / n)) * radius,
    ]);
  }

  switch (kind) {
    case ShapeKind.line:
    case ShapeKind.arrow:
    case ShapeKind.doubleArrow:
      return [InkPoint(a.dx, a.dy), InkPoint(b.dx, b.dy)];
    case ShapeKind.circle:
      // Centre where the drag started; the drag sets the radius.
      final radius = (b - a).distance;
      return [
        for (var i = 0; i <= 72; i++)
          InkPoint(a.dx + radius * math.cos(2 * math.pi * i / 72), a.dy + radius * math.sin(2 * math.pi * i / 72)),
      ];
    case ShapeKind.ellipse:
      return [
        for (var i = 0; i <= 72; i++)
          InkPoint(c.dx + r.width / 2 * math.cos(2 * math.pi * i / 72), c.dy + r.height / 2 * math.sin(2 * math.pi * i / 72)),
      ];
    case ShapeKind.triangle:
      return poly([r.bottomLeft, r.topCenter, r.bottomRight]);
    case ShapeKind.rightTriangle:
      return poly([r.topLeft, r.bottomLeft, r.bottomRight]);
    case ShapeKind.rectangle:
      return poly([r.topLeft, r.topRight, r.bottomRight, r.bottomLeft]);
    case ShapeKind.parallelogram:
      final s = r.width * 0.25;
      return poly([r.topLeft + Offset(s, 0), r.topRight, r.bottomRight - Offset(s, 0), r.bottomLeft]);
    case ShapeKind.trapezium:
      final s = r.width * 0.25;
      return poly([r.topLeft + Offset(s, 0), r.topRight - Offset(s, 0), r.bottomRight, r.bottomLeft]);
    case ShapeKind.rhombus:
      return poly([r.topCenter, r.centerRight, r.bottomCenter, r.centerLeft]);
    case ShapeKind.pentagon:
      return regular(5);
    case ShapeKind.hexagon:
      return regular(6);
  }
}

/// Interior angle at [b] in degrees, for the corner a-b-c.
double angleAt(Offset a, Offset b, Offset c) {
  final v1 = a - b, v2 = c - b;
  final cos = (v1.dx * v2.dx + v1.dy * v2.dy) / (v1.distance * v2.distance);
  return math.acos(cos.clamp(-1.0, 1.0)) * 180 / math.pi;
}
