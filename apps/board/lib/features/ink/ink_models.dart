import 'dart:ui';

/// What a pointer does when it touches the board.
enum InkTool { pen, highlighter, eraser }

class InkPoint {
  const InkPoint(this.x, this.y, [this.pressure = 0.5]);

  final double x;
  final double y;

  /// 0..1. Fingers and mice report a constant; pens report real pressure.
  final double pressure;

  Offset get offset => Offset(x, y);
}

/// Pen settings for one pointer. Each finger or pen can have its own (multi-user zones).
class InkStyle {
  const InkStyle({required this.tool, required this.color, required this.width});

  final InkTool tool;
  final Color color;
  final double width;

  InkStyle copyWith({InkTool? tool, Color? color, double? width}) =>
      InkStyle(tool: tool ?? this.tool, color: color ?? this.color, width: width ?? this.width);
}

class Stroke {
  Stroke({required this.id, required this.style, List<InkPoint>? points}) : points = points ?? [];

  final String id;
  final InkStyle style;
  final List<InkPoint> points;

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
}

double _distanceToSegment(Offset p, Offset a, Offset b) {
  final ab = b - a;
  final len2 = ab.dx * ab.dx + ab.dy * ab.dy;
  if (len2 == 0) return (p - a).distance;
  var t = ((p - a).dx * ab.dx + (p - a).dy * ab.dy) / len2;
  t = t.clamp(0.0, 1.0);
  return (p - (a + ab * t)).distance;
}
