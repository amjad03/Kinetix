import 'dart:math' as math;
import 'dart:ui';

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

class Stroke {
  Stroke({required this.id, required this.style, List<InkPoint>? points, this.shape}) : points = points ?? [];

  final String id;
  final InkStyle style;
  final List<InkPoint> points;

  /// Set when this stroke was drawn with the Shapes tool.
  final ShapeKind? shape;

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

  void translate(Offset d) {
    for (var i = 0; i < points.length; i++) {
      points[i] = points[i].translate(d);
    }
  }

  /// True if a circle at [c] with radius [r] touches any segment of this stroke.
  bool hitBy(Offset c, double r) {
    final reach = r + style.width / 2;
    if (!bounds.inflate(r).contains(c)) return false;
    if (points.length == 1) return (points.first.offset - c).distance <= reach;
    for (var i = 1; i < points.length; i++) {
      if (_distanceToSegment(c, points[i - 1].offset, points[i].offset) <= reach) return true;
    }
    return false;
  }

  /// Corners of a polygon shape (without the closing repeat), or the two ends of a line.
  List<Offset> get vertices {
    if (shape == null || shape!.isRound) return const [];
    final pts = points.map((p) => p.offset).toList();
    if (pts.length > 1 && pts.first == pts.last) pts.removeLast();
    return pts;
  }
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
