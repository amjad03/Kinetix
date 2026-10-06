import 'dart:math' as math;
import 'dart:ui';

import 'package:flutter/foundation.dart';

import '../ink_models.dart';

/// The geometry box as board objects: rulers, protractors, set squares and compasses that lie on
/// the board, several at once. Each is a [GeoTool] in board units; this file holds their shape
/// and maths (pure, so it is tested without widgets). The overlay that draws and moves them is
/// `geo_overlay.dart`.

enum GeoKind { ruler, protractor, protractor360, setSquare45, setSquare3060, compass }

/// How many board units make a real centimetre on this screen (at 100% zoom), and whether the
/// scales read in inches. Starts from the device's usual density (Flutter's logical pixel is
/// about 1/160 inch on phones and tablets, 1/96 inch on desktops) and is set exactly with the
/// calibrate dialog, which the app saves per device.
class GeoCalibration {
  GeoCalibration._();

  static double get deviceDefault => switch (defaultTargetPlatform) {
    TargetPlatform.android || TargetPlatform.iOS || TargetPlatform.fuchsia => 160 / 2.54,
    _ => 96 / 2.54,
  };

  static final ValueNotifier<double> pxPerCm = ValueNotifier(deviceDefault);
  static final ValueNotifier<bool> inches = ValueNotifier(false);

  /// Told after the teacher changes the calibration or the units (the app saves them).
  static VoidCallback? onChanged;

  /// Board units in one unit of the scale (cm or inch).
  static double get unit => inches.value ? pxPerCm.value * 2.54 : pxPerCm.value;
  static String get unitName => inches.value ? 'in' : 'cm';

  /// [boardLength] read on the scale, e.g. `7.5 cm`.
  static String format(double boardLength) => '${(boardLength / unit).toStringAsFixed(1)} $unitName';
}

const double _deg = math.pi / 180;

/// Rounds [a] to the nearest 15° unless [free]. For turning tools.
double snapAngle15(double a, {bool free = false}) {
  if (free) return a;
  const step = 15 * _deg;
  return (a / step).roundToDouble() * step;
}

/// [a] in degrees, 0 ≤ d < 360.
double degrees360(double a) {
  final d = (a / _deg) % 360;
  return d < 0 ? d + 360 : d;
}

/// A board edge, as its two ends.
typedef GeoEdge = (Offset, Offset);

/// The point of [edge]'s line nearest [p].
Offset projectOnEdge(Offset p, GeoEdge edge) {
  final (a, b) = edge;
  final d = b - a;
  final len2 = d.distanceSquared;
  if (len2 == 0) return a;
  final t = ((p - a).dx * d.dx + (p - a).dy * d.dy) / len2;
  return a + d * t;
}

class GeoTool {
  const GeoTool({
    required this.id,
    required this.kind,
    required this.center,
    this.angle = 0,
    required this.size,
    this.flipped = false,
    this.locked = false,
    this.arm = math.pi / 3,
  });

  /// A new tool of [kind] at [center], sized like the real one.
  factory GeoTool.create(GeoKind kind, Offset center, {String? id}) {
    final cm = GeoCalibration.pxPerCm.value;
    return GeoTool(
      id: id ?? newElementId(),
      kind: kind,
      center: center,
      size: switch (kind) {
        GeoKind.ruler => 20 * cm,
        GeoKind.protractor || GeoKind.protractor360 => 6 * cm,
        GeoKind.setSquare45 || GeoKind.setSquare3060 => 10 * cm,
        GeoKind.compass => 4 * cm,
      },
    );
  }

  final String id;
  final GeoKind kind;

  /// The tool's pivot in board units: the ruler's middle, the protractor's centre mark, the set
  /// square's right angle, the compass's needle.
  final Offset center;

  /// Turn in radians (clockwise on screen).
  final double angle;

  /// The ruler's length, the protractor's radius, the set square's longer leg, the compass's
  /// radius (board units).
  final double size;

  /// Mirrored: the ruler's scale on the other edge, the protractor and set square the other way up.
  final bool flipped;

  /// Locked tools stay where they are; their edges still guide the pen.
  final bool locked;

  /// The protractor's marking arm, measured from its zero line (radians); the compass's pencil
  /// direction.
  final double arm;

  static const double rulerWidth = 90;

  GeoTool copyWith({Offset? center, double? angle, double? size, bool? flipped, bool? locked, double? arm}) => GeoTool(
    id: id,
    kind: kind,
    center: center ?? this.center,
    angle: angle ?? this.angle,
    size: size ?? this.size,
    flipped: flipped ?? this.flipped,
    locked: locked ?? this.locked,
    arm: arm ?? this.arm,
  );

  /// The smallest and largest sizes a pinch may give the tool.
  (double, double) get sizeRange {
    final cm = GeoCalibration.pxPerCm.value;
    return switch (kind) {
      GeoKind.ruler => (5 * cm, 60 * cm),
      GeoKind.protractor || GeoKind.protractor360 => (2.5 * cm, 20 * cm),
      GeoKind.setSquare45 || GeoKind.setSquare3060 => (3 * cm, 30 * cm),
      GeoKind.compass => (0.3 * cm, 40 * cm),
    };
  }

  double clampSize(double s) {
    final (lo, hi) = sizeRange;
    return s.clamp(lo, hi);
  }

  // --- Frames ---------------------------------------------------------------------------------

  double get _fy => flipped ? -1 : 1;

  /// Board point of tool point [l] (tool units: x along the zero line, y down; mirrored when
  /// [flipped]).
  Offset toBoard(Offset l) {
    final p = Offset(l.dx, l.dy * _fy);
    final c = math.cos(angle), s = math.sin(angle);
    return center + Offset(p.dx * c - p.dy * s, p.dx * s + p.dy * c);
  }

  /// Tool point of board point [b].
  Offset toLocal(Offset b) {
    final d = b - center;
    final c = math.cos(-angle), s = math.sin(-angle);
    final p = Offset(d.dx * c - d.dy * s, d.dx * s + d.dy * c);
    return Offset(p.dx, p.dy * _fy);
  }

  /// The tool's straight-sided outline in tool units (ruler, set squares; a protractor's base).
  List<Offset> get outline {
    final s = size;
    switch (kind) {
      case GeoKind.ruler:
        return [Offset(-s / 2, 0), Offset(s / 2, 0), Offset(s / 2, rulerWidth), Offset(-s / 2, rulerWidth)];
      case GeoKind.setSquare45:
        return [Offset.zero, Offset(s, 0), Offset(0, -s)];
      case GeoKind.setSquare3060:
        // The long leg along the zero line; 30° at its far end, 60° at the top.
        return [Offset.zero, Offset(s, 0), Offset(0, -s * math.tan(30 * _deg))];
      case GeoKind.protractor:
        return [Offset(-s, 0), Offset(s, 0)];
      case GeoKind.protractor360 || GeoKind.compass:
        return const [];
    }
  }

  /// Straight edges the pen runs along, in board units.
  List<GeoEdge> get edges {
    final o = outline;
    if (o.length < 2) return const [];
    if (o.length == 2) return [(toBoard(o[0]), toBoard(o[1]))];
    return [for (var i = 0; i < o.length; i++) (toBoard(o[i]), toBoard(o[(i + 1) % o.length]))];
  }

  /// True when board point [p] is on the tool's body.
  bool contains(Offset p, {double slop = 0}) {
    final l = toLocal(p);
    switch (kind) {
      case GeoKind.ruler:
        return l.dx.abs() <= size / 2 + slop && l.dy >= -slop && l.dy <= rulerWidth + slop;
      case GeoKind.protractor:
        return (l.distance <= size + slop && l.dy <= slop) || (l.dx.abs() <= size + slop && l.dy >= 0 && l.dy <= 30 + slop);
      case GeoKind.protractor360:
        return l.distance <= size + slop;
      case GeoKind.setSquare45 || GeoKind.setSquare3060:
        final h = -outline[2].dy;
        // Inside the right triangle (0,0), (size,0), (0,-h).
        return l.dx >= -slop && l.dy <= slop && (l.dx / size + (-l.dy) / h) <= 1 + slop / math.min(size, h);
      case GeoKind.compass:
        // The needle, the pencil, and the leg between them.
        final pencil = Offset(size, 0);
        return l.distance <= 28 + slop || (l - pencil).distance <= 28 + slop || _distToSegment(l, Offset.zero, pencil) <= 14 + slop;
    }
  }

  /// The edge nearest [p] if it is within [tolerance] of it (and level with it).
  GeoEdge? snapEdge(Offset p, double tolerance) {
    GeoEdge? best;
    var bestD = tolerance;
    for (final e in edges) {
      final (a, b) = e;
      final q = projectOnEdge(p, e);
      final len = (b - a).distance;
      if ((q - a).distance > len + tolerance || (q - b).distance > len + tolerance) continue;
      final d = (p - q).distance;
      if (d <= bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  // --- Readings -------------------------------------------------------------------------------

  /// The tool's turn as read on a protractor, 0–360°.
  double get angleDegrees => degrees360(angle);

  /// The protractor's arm reading, in degrees.
  double get armDegrees => arm / _deg;

  /// Board point at the end of the protractor's arm.
  Offset get armTip => toBoard(Offset(math.cos(arm), -math.sin(arm)) * size);

  /// The arm's angle (radians from the zero line, counter-clockwise as on the scale) pointing at
  /// board point [p]; within 0–180° on a half protractor.
  double armTowards(Offset p, {bool free = true}) {
    final l = toLocal(p);
    var a = math.atan2(-l.dy, l.dx);
    if (kind == GeoKind.protractor) {
      a = a < -math.pi / 2 ? math.pi : a.clamp(0.0, math.pi);
    } else if (a < 0) {
      a += 2 * math.pi;
    }
    return free ? a : (a / _deg).roundToDouble() * _deg;
  }

  /// The compass's pencil point.
  Offset get pencil => toBoard(Offset(size, 0));

  /// The compass's hinge, drawn above the middle of its legs.
  Offset get hinge => toBoard(Offset(size / 2, -math.max(60.0, size * 0.45)));
}

double _distToSegment(Offset p, Offset a, Offset b) {
  final q = projectOnEdge(p, (a, b));
  final d = b - a;
  final t = d.distanceSquared == 0 ? 0 : ((q - a).dx * d.dx + (q - a).dy * d.dy) / d.distanceSquared;
  return (p - (t < 0 ? a : (t > 1 ? b : q))).distance;
}

/// The edge of any of [tools] nearest [p] within [tolerance].
GeoEdge? snapToTools(Iterable<GeoTool> tools, Offset p, double tolerance) {
  GeoEdge? best;
  var bestD = tolerance;
  for (final t in tools) {
    final e = t.snapEdge(p, tolerance);
    if (e == null) continue;
    final d = (p - projectOnEdge(p, e)).distance;
    if (d <= bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/// Points of an arc about [center] of [radius] from angle [start] through [sweep] radians (a
/// full circle when |sweep| ≥ 2π), close enough together for a smooth line.
List<Offset> compassArc(Offset center, double radius, double start, double sweep) {
  final full = sweep.abs() >= 2 * math.pi - 1e-9;
  final s = full ? 2 * math.pi * sweep.sign : sweep;
  final n = math.max(2, (s.abs() * radius / 4).ceil().clamp(8, 720));
  return [for (var i = 0; i <= n; i++) center + Offset(math.cos(start + s * i / n), math.sin(start + s * i / n)) * radius];
}

/// A pen stroke along a compass arc.
Stroke compassStroke(Offset center, double radius, double start, double sweep, {required Color color, required double width}) {
  final pts = compassArc(center, radius, start, sweep);
  final full = sweep.abs() >= 2 * math.pi - 1e-9;
  return Stroke(
    id: newElementId(),
    // A full turn is a circle shape (measured like one); an arc is pen ink.
    style: InkStyle(tool: full ? InkTool.shape : InkTool.pen, color: color, width: width, shape: ShapeKind.circle),
    shape: full ? ShapeKind.circle : null,
    points: [for (final p in pts) InkPoint(p.dx, p.dy)],
  );
}
