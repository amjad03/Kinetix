import 'dart:math' as math;

import 'package:flutter/rendering.dart';

import 'protocol.dart';

/// One point of the laser trail: where, when, and which stroke (a lift starts a new one).
class LaserPoint {
  const LaserPoint(this.at, this.time, this.stroke);
  final Offset at;
  final Duration time;
  final int stroke;
}

/// A piece of the trail between two points, with how much of its life is left (1 just
/// drawn, 0 gone).
class LaserSegment {
  const LaserSegment(this.from, this.to, this.life);
  final Offset from, to;
  final double life;
}

/// The laser's fading red trail, like the board's laser: points drawn in the last [fade]
/// stay, older ones are dropped. Times are whatever clock the caller uses.
class LaserTrail {
  LaserTrail({this.fade = const Duration(milliseconds: 1200)});

  final Duration fade;
  final _points = <LaserPoint>[];
  int _stroke = 0;
  bool _down = false;

  List<LaserPoint> get points => List.unmodifiable(_points);
  bool get isEmpty => _points.isEmpty;

  /// Whether a finger is drawing.
  bool get drawing => _down;

  /// The point the finger is on, while drawing.
  Offset? get tip => _down && _points.isNotEmpty ? _points.last.at : null;

  void down(Offset at, Duration now) {
    _stroke++;
    _down = true;
    _points.add(LaserPoint(at, now, _stroke));
  }

  void move(Offset at, Duration now) {
    if (!_down) return down(at, now);
    // Points closer than a pixel add nothing but work.
    if ((_points.last.at - at).distanceSquared < 1) return;
    _points.add(LaserPoint(at, now, _stroke));
  }

  void up() => _down = false;

  void clear() {
    _points.clear();
    _down = false;
  }

  /// How much of [p]'s life is left at [now].
  double lifeOf(LaserPoint p, Duration now) => (1 - (now - p.time).inMicroseconds / fade.inMicroseconds).clamp(0.0, 1.0);

  /// Drops the points that have faded. The tip stays while the finger is down.
  void prune(Duration now) {
    final keepTip = _down && _points.isNotEmpty ? _points.last : null;
    _points.removeWhere((p) => !identical(p, keepTip) && now - p.time >= fade);
  }

  /// The visible pieces, oldest first; strokes are not joined to each other.
  List<LaserSegment> segments(Duration now) => [
    for (var i = 1; i < _points.length; i++)
      if (_points[i].stroke == _points[i - 1].stroke && lifeOf(_points[i], now) > 0) LaserSegment(_points[i - 1].at, _points[i].at, lifeOf(_points[i], now)),
  ];
}

/// Paints a [LaserTrail]: a soft red glow under a bright core, and a white tip.
class LaserPainter extends CustomPainter {
  LaserPainter(this.trail, this.now, {super.repaint});

  final LaserTrail trail;
  final Duration Function() now;

  @override
  void paint(Canvas canvas, Size size) {
    final t = now();
    final glow = Paint()
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4);
    final core = Paint()
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeWidth = 4;
    for (final s in trail.segments(t)) {
      glow
        ..color = Color.fromRGBO(255, 46, 46, 0.35 * s.life)
        ..strokeWidth = 14 * s.life + 2;
      canvas.drawLine(s.from, s.to, glow);
      core.color = Color.fromRGBO(255, 70, 60, s.life);
      canvas.drawLine(s.from, s.to, core);
    }
    final tip = trail.tip;
    if (tip != null) {
      canvas.drawCircle(tip, 9, Paint()..color = const Color(0x66FF2E2E));
      canvas.drawCircle(tip, 4, Paint()..color = const Color(0xFFFFFFFF));
    }
  }

  @override
  bool shouldRepaint(LaserPainter old) => true;
}

/// Sends the trail to the viewer in small batches (at most one command every [interval]),
/// so a fast finger does not flood the WebView: points are kept until [tick] or the next
/// [add] finds the interval has passed.
class LaserBatcher {
  LaserBatcher({required this.send, this.fade = const Duration(milliseconds: 1200), this.interval = const Duration(milliseconds: 33)});

  final void Function(Map<String, dynamic> command) send;
  final Duration fade;
  final Duration interval;
  final _pending = <Offset>[];
  Duration? _last;

  bool get hasPending => _pending.isNotEmpty;

  /// A new point, from 0 to 1 across the view.
  void add(Offset normalized, Duration now) {
    _pending.add(normalized);
    tick(now);
  }

  /// Sends what is waiting if it is time.
  void tick(Duration now) {
    if (_pending.isEmpty) return;
    if (_last != null && now - _last! < interval) return;
    _flush(now);
  }

  /// The finger lifted: send the rest now, marked as the end of a stroke.
  void up(Duration now) => _flush(now, up: true);

  /// The laser is put away.
  void off() {
    _pending.clear();
    send(ViewerCommands.laser(off: true));
  }

  void _flush(Duration now, {bool up = false}) {
    send(ViewerCommands.laser(points: List.of(_pending), up: up, fade: fade));
    _pending.clear();
    _last = now;
  }
}

/// Turning the model with two fingers while the laser is out: how far the fingers' middle
/// moved and how much they spread, as an `orbit` command. A drag across the whole height
/// of the view turns the model once round, as the viewer's own one-finger turn does.
Map<String, dynamic>? twoFingerOrbit({required Offset from, required Offset to, required double spreadFrom, required double spreadTo, required double height}) {
  if (height <= 0) return null;
  final d = to - from;
  final scale = spreadFrom > 0 && spreadTo > 0 ? spreadTo / spreadFrom : 1.0;
  if (d.distanceSquared < 0.25 && (scale - 1).abs() < 0.002) return null;
  return ViewerCommands.orbit(dx: 2 * math.pi * d.dx / height, dy: 2 * math.pi * d.dy / height, scale: scale);
}
