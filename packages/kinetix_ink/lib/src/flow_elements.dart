part of 'ink_models.dart';

/// Flowcharts and mind maps: blocks ([FlowNodeElement]) joined by arrows ([FlowLinkElement]).
/// A link names the blocks it joins and the sides it leaves and enters by; its [FlowLinkElement.points]
/// are worked out again whenever a block moves (see [reflowLinks]), and are saved too so viewers
/// without the routing still draw it.

/// The standard flowchart blocks, plus [topic] for mind maps.
enum FlowShape {
  process,
  decision,
  inputOutput,
  terminal,
  subprocess,
  document,
  database,
  loopLimit,
  connector,
  comment,
  manualInput,
  dataStore,
  display,
  merge,
  topic;

  /// The block's usual size when it is added, in board units.
  Size get defaultSize => switch (this) {
    FlowShape.decision => const Size(200, 120),
    FlowShape.connector => const Size(64, 64),
    FlowShape.merge => const Size(90, 70),
    FlowShape.terminal => const Size(190, 70),
    FlowShape.topic => const Size(180, 64),
    FlowShape.database || FlowShape.dataStore => const Size(170, 100),
    _ => const Size(200, 90),
  };
}

/// A side of a block, where links leave and arrive.
enum FlowSide {
  top,
  right,
  bottom,
  left;

  Offset get dir => switch (this) {
    FlowSide.top => const Offset(0, -1),
    FlowSide.right => const Offset(1, 0),
    FlowSide.bottom => const Offset(0, 1),
    FlowSide.left => const Offset(-1, 0),
  };

  FlowSide get opposite => FlowSide.values[(index + 2) % 4];

  /// A quarter turn clockwise (top → right).
  FlowSide get clockwise => FlowSide.values[(index + 1) % 4];

  bool get vertical => this == FlowSide.top || this == FlowSide.bottom;
}

/// The middle of side [s] of [r].
Offset flowAnchor(Rect r, FlowSide s) => switch (s) {
  FlowSide.top => r.topCenter,
  FlowSide.right => r.centerRight,
  FlowSide.bottom => r.bottomCenter,
  FlowSide.left => r.centerLeft,
};

/// The outline of block [s] drawn in [r].
Path flowShapePath(FlowShape s, Rect r) {
  final p = Path();
  final w = r.width, h = r.height, l = r.left, t = r.top;
  switch (s) {
    case FlowShape.process:
      p.addRect(r);
    case FlowShape.decision:
      p.addPolygon([r.topCenter, r.centerRight, r.bottomCenter, r.centerLeft], true);
    case FlowShape.inputOutput:
      final k = math.min(w * 0.18, h * 0.5);
      p.addPolygon([Offset(l + k, t), Offset(r.right, t), Offset(r.right - k, r.bottom), Offset(l, r.bottom)], true);
    case FlowShape.terminal:
      p.addRRect(RRect.fromRectAndRadius(r, Radius.circular(h / 2)));
    case FlowShape.subprocess:
      p.addRect(r);
      final k = math.min(14.0, w * 0.08);
      p
        ..moveTo(l + k, t)
        ..lineTo(l + k, r.bottom)
        ..moveTo(r.right - k, t)
        ..lineTo(r.right - k, r.bottom);
    case FlowShape.document:
      final wave = h * 0.12;
      p
        ..moveTo(l, t)
        ..lineTo(r.right, t)
        ..lineTo(r.right, r.bottom - wave)
        ..cubicTo(l + w * 0.75, r.bottom - wave * 3, l + w * 0.25, r.bottom + wave, l, r.bottom - wave)
        ..close();
    case FlowShape.database:
      final e = math.min(h * 0.18, 22.0);
      p
        ..moveTo(l, t + e)
        ..lineTo(l, r.bottom - e)
        ..arcTo(Rect.fromLTWH(l, r.bottom - 2 * e, w, 2 * e), math.pi, -math.pi, false)
        ..lineTo(r.right, t + e)
        ..addOval(Rect.fromLTWH(l, t, w, 2 * e));
    case FlowShape.loopLimit:
      final k = math.min(w * 0.12, h * 0.4);
      p.addPolygon([Offset(l + k, t), Offset(r.right - k, t), Offset(r.right, t + k), Offset(r.right, r.bottom), Offset(l, r.bottom), Offset(l, t + k)], true);
    case FlowShape.connector:
      p.addOval(Rect.fromCenter(center: r.center, width: math.min(w, h), height: math.min(w, h)));
    case FlowShape.comment:
      final k = math.min(16.0, w * 0.15);
      p
        ..moveTo(l + k, t)
        ..lineTo(l, t)
        ..lineTo(l, r.bottom)
        ..lineTo(l + k, r.bottom);
    case FlowShape.manualInput:
      p.addPolygon([Offset(l, t + h * 0.3), Offset(r.right, t), Offset(r.right, r.bottom), Offset(l, r.bottom)], true);
    case FlowShape.dataStore:
      final k = math.min(w * 0.12, 20.0);
      p
        ..moveTo(l + k, t)
        ..lineTo(r.right, t)
        ..arcToPoint(Offset(r.right, r.bottom), radius: Radius.elliptical(k, h / 2), clockwise: false)
        ..lineTo(l + k, r.bottom)
        ..arcToPoint(Offset(l + k, t), radius: Radius.elliptical(k, h / 2))
        ..close();
    case FlowShape.display:
      final k = math.min(w * 0.15, 26.0);
      p
        ..moveTo(l, r.center.dy)
        ..lineTo(l + k, t)
        ..lineTo(r.right - k, t)
        ..arcToPoint(Offset(r.right - k, r.bottom), radius: Radius.elliptical(k, h / 2))
        ..lineTo(l + k, r.bottom)
        ..close();
    case FlowShape.merge:
      p.addPolygon([r.topLeft, r.topRight, r.bottomCenter], true);
    case FlowShape.topic:
      p.addRRect(RRect.fromRectAndRadius(r, Radius.circular(math.min(18.0, h / 2))));
  }
  return p;
}

/// A flowchart block or mind-map topic with its words inside.
class FlowNodeElement extends BoardElement {
  const FlowNodeElement({required this.id, required this.rect, required this.shape, required this.color, this.text = '', this.fill, this.fontSize = 22});

  @override
  final String id;
  final Rect rect;
  final FlowShape shape;
  final String text;
  final Color color;

  /// Inside colour, or null for the board's paper.
  final Color? fill;
  final double fontSize;

  @override
  Rect get frame => rect;
  @override
  Rect get bounds => rect.inflate(2);

  Offset anchor(FlowSide s) => flowAnchor(rect, s);

  FlowNodeElement copyWith({String? id, Rect? rect, FlowShape? shape, String? text, Color? color, Color? fill, bool clearFill = false, double? fontSize}) =>
      FlowNodeElement(
        id: id ?? this.id,
        rect: rect ?? this.rect,
        shape: shape ?? this.shape,
        text: text ?? this.text,
        color: color ?? this.color,
        fill: clearFill ? null : (fill ?? this.fill),
        fontSize: fontSize ?? this.fontSize,
      );

  @override
  FlowNodeElement translated(Offset d) => _moved(this, d, copyWith(rect: rect.shift(d)));
  @override
  FlowNodeElement scaled(Offset origin, double sx, double sy) =>
      copyWith(rect: _scaleBox(rect, 0, origin, sx, sy), fontSize: (fontSize * _even(sx, sy)).clamp(8.0, 200.0));

  /// Blocks stay upright: turning moves the block's centre round [center].
  @override
  FlowNodeElement rotated(Offset center, double angle) => copyWith(rect: turnFrame(rect, center, angle));
  @override
  FlowNodeElement recolored(Color c) => copyWith(color: c, fill: fill == null ? null : c.withValues(alpha: fill!.a));
  @override
  FlowNodeElement withId(String id) => copyWith(id: id);
}

/// An arrow from block [from] (leaving by [fromSide]) to block [to] (arriving by [toSide]),
/// with an optional [label] (Yes, No, Case 1). [curved] links are drawn as smooth curves (mind
/// maps); [points] is the route, worked out by [routeFlow].
class FlowLinkElement extends BoardElement {
  const FlowLinkElement({
    required this.id,
    required this.from,
    required this.to,
    required this.color,
    this.fromSide = FlowSide.bottom,
    this.toSide = FlowSide.top,
    this.label = '',
    this.points = const [],
    this.curved = false,
  });

  @override
  final String id;
  final String from, to;
  final FlowSide fromSide, toSide;
  final String label;
  final Color color;
  final List<Offset> points;
  final bool curved;

  @override
  Rect get bounds {
    if (points.isEmpty) return Rect.zero;
    var r = Rect.fromPoints(points.first, points.first);
    for (final p in points) {
      r = r.expandToInclude(Rect.fromPoints(p, p));
    }
    return r.inflate(8);
  }

  @override
  bool hitTest(Offset p, double radius) {
    for (var i = 1; i < points.length; i++) {
      if (_distanceToSegment(p, points[i - 1], points[i]) <= radius + 4) return true;
    }
    return false;
  }

  /// Where the label sits: the middle of the route's longest leg.
  Offset get labelAt {
    if (points.length < 2) return points.isEmpty ? Offset.zero : points.first;
    var best = 1;
    for (var i = 2; i < points.length; i++) {
      if ((points[i] - points[i - 1]).distance > (points[best] - points[best - 1]).distance) best = i;
    }
    return (points[best] + points[best - 1]) / 2;
  }

  FlowLinkElement copyWith({String? id, String? from, String? to, FlowSide? fromSide, FlowSide? toSide, String? label, Color? color, List<Offset>? points, bool? curved}) =>
      FlowLinkElement(
        id: id ?? this.id,
        from: from ?? this.from,
        to: to ?? this.to,
        fromSide: fromSide ?? this.fromSide,
        toSide: toSide ?? this.toSide,
        label: label ?? this.label,
        color: color ?? this.color,
        points: points ?? this.points,
        curved: curved ?? this.curved,
      );

  @override
  FlowLinkElement translated(Offset d) => _moved(this, d, copyWith(points: [for (final p in points) p + d]));
  @override
  FlowLinkElement scaled(Offset origin, double sx, double sy) => copyWith(points: [for (final p in points) scalePoint(p, origin, sx, sy)]);
  @override
  FlowLinkElement rotated(Offset center, double angle) => copyWith(points: [for (final p in points) rotatePoint(p, center, angle)]);
  @override
  FlowLinkElement recolored(Color c) => copyWith(color: c);
  @override
  FlowLinkElement withId(String id) => copyWith(id: id);
}

/// How far a link runs straight out of a block before it turns.
const double flowStub = 24;

/// An elbow route from side [sa] of [a] to side [sb] of [b]: straight out of each block, then
/// across in at most three legs. Two links out of the same side (a loop's way back) go round
/// the outside of both blocks.
List<Offset> routeFlow(Rect a, FlowSide sa, Rect b, FlowSide sb) {
  final start = flowAnchor(a, sa), end = flowAnchor(b, sb);
  final s1 = start + sa.dir * flowStub, e1 = end + sb.dir * flowStub;
  final mid = <Offset>[];
  if (sa == sb) {
    // Out and back in by the same side: round the outside.
    if (sa.vertical) {
      final y = sa == FlowSide.top ? math.min(s1.dy, e1.dy) : math.max(s1.dy, e1.dy);
      mid.addAll([Offset(s1.dx, y), Offset(e1.dx, y)]);
    } else {
      final x = sa == FlowSide.left ? math.min(s1.dx, e1.dx) : math.max(s1.dx, e1.dx);
      mid.addAll([Offset(x, s1.dy), Offset(x, e1.dy)]);
    }
  } else if (sa.vertical && sb.vertical) {
    final y = (s1.dy + e1.dy) / 2;
    mid.addAll([Offset(s1.dx, y), Offset(e1.dx, y)]);
  } else if (!sa.vertical && !sb.vertical) {
    final x = (s1.dx + e1.dx) / 2;
    mid.addAll([Offset(x, s1.dy), Offset(x, e1.dy)]);
  } else if (sa.vertical) {
    mid.add(Offset(s1.dx, e1.dy));
  } else {
    mid.add(Offset(e1.dx, s1.dy));
  }
  final raw = [start, s1, ...mid, e1, end];
  // Drop repeated points and points in the middle of a straight run.
  final out = <Offset>[];
  for (final p in raw) {
    if (out.isNotEmpty && (out.last - p).distance < 0.01) continue;
    if (out.length >= 2) {
      final a0 = out[out.length - 2], a1 = out.last;
      final cross = (a1.dx - a0.dx) * (p.dy - a1.dy) - (a1.dy - a0.dy) * (p.dx - a1.dx);
      final dot = (a1.dx - a0.dx) * (p.dx - a1.dx) + (a1.dy - a0.dy) * (p.dy - a1.dy);
      if (cross.abs() < 0.01 && dot >= 0) out.removeLast();
    }
    out.add(p);
  }
  return out;
}

/// A mind-map branch: a smooth S from the parent's side to the child's.
List<Offset> routeCurve(Rect a, FlowSide sa, Rect b, FlowSide sb) {
  final start = flowAnchor(a, sa), end = flowAnchor(b, sb);
  final d = (end - start).distance / 2;
  final c1 = start + sa.dir * d, c2 = end + sb.dir * d;
  return [
    for (var i = 0; i <= 16; i++)
      () {
        final t = i / 16, u = 1 - t;
        return start * (u * u * u) + c1 * (3 * u * u * t) + c2 * (3 * u * t * t) + end * (t * t * t);
      }(),
  ];
}

/// [elements] with every link routed again from where its blocks are now, and links whose
/// block is gone dropped. Returns [elements] itself when nothing changed.
List<BoardElement> reflowLinks(List<BoardElement> elements) {
  if (!elements.any((e) => e is FlowLinkElement)) return elements;
  final nodes = {for (final e in elements) if (e is FlowNodeElement) e.id: e};
  var changed = false;
  final out = <BoardElement>[];
  for (final e in elements) {
    if (e is! FlowLinkElement) {
      out.add(e);
      continue;
    }
    final a = nodes[e.from], b = nodes[e.to];
    if (a == null || b == null) {
      changed = true;
      continue;
    }
    final route = e.curved ? routeCurve(a.rect, e.fromSide, b.rect, e.toSide) : routeFlow(a.rect, e.fromSide, b.rect, e.toSide);
    if (_samePoints(route, e.points)) {
      out.add(e);
    } else {
      changed = true;
      out.add(e.copyWith(points: route));
    }
  }
  return changed ? out : elements;
}

bool _samePoints(List<Offset> a, List<Offset> b) {
  if (a.length != b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if ((a[i] - b[i]).distanceSquared > 0.01) return false;
  }
  return true;
}
