import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/bench.dart';
import '../../core/i18n.dart';
import '../../engines/mechanics.dart';

double _r(double v, int k) => (v * k).round() / k;

/// A coiled spring drawn from [top] to [bottom].
void _spring(Canvas canvas, Offset top, Offset bottom, {double width = 18, int coils = 12}) {
  final path = Path()..moveTo(top.dx, top.dy);
  final len = bottom.dy - top.dy;
  for (var k = 0; k <= coils * 2; k++) {
    final y = top.dy + len * (0.08 + 0.84 * k / (coils * 2));
    path.lineTo(top.dx + (k == 0 || k == coils * 2 ? 0 : (k.isOdd ? width : -width)), y);
  }
  path.lineTo(bottom.dx, bottom.dy);
  canvas.drawPath(path, stroke(LabInk.ink, 2));
}

/// Slotted masses hanging from a hook at [top]: [grams] in 50 g discs.
double _masses(Canvas canvas, Offset top, double grams, double scale) {
  canvas.drawLine(top, top + Offset(0, 10 * scale), stroke(LabInk.ink, 2));
  var y = top.dy + 10 * scale;
  canvas.drawRect(Rect.fromCenter(center: Offset(top.dx, y + 3 * scale), width: 26 * scale, height: 6 * scale), fill(LabInk.muted));
  y += 6 * scale;
  for (var k = 0; k < (grams / 50).round(); k++) {
    canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(top.dx - 22 * scale, y, 44 * scale, 7 * scale), const Radius.circular(2)), fill(const Color(0xFF8D6E63)));
    canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(top.dx - 22 * scale, y, 44 * scale, 7 * scale), const Radius.circular(2)), stroke(LabInk.ink, 1));
    y += 7.5 * scale;
  }
  return y;
}

void _stopwatch(Canvas canvas, Offset at, double seconds, double r) {
  canvas.drawCircle(at, r, fill(Colors.white));
  canvas.drawCircle(at, r, stroke(LabInk.ink, 2.5));
  final a = -math.pi / 2 + 2 * math.pi * (seconds % 60) / 60;
  canvas.drawLine(at, at + Offset(math.cos(a), math.sin(a)) * r * 0.8, stroke(LabInk.red, 2));
  label(canvas, '${seconds.toStringAsFixed(2)} s', at + Offset(0, r + 14), size: 15, bold: true);
}

/// Hooke's law: the extension of a spring is proportional to the load.
class SpringBench extends LabBench {
  const SpringBench();

  static const springs = {'A': 20.0, 'B': 40.0, 'C': 60.0}; // N/m
  static const zero = 12.0; // cm, pointer reading with no load

  @override
  String get kind => 'spring';

  @override
  LabParams get defaults => {'spring': 'B', 'load': 0.0};

  @override
  LabParams get preview => {...defaults, 'load': 200.0};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('spring', tr('Spring'), [for (final k in springs.keys) (k, k)]),
        LabSlider('load', tr('Load'), 0, 400, divisions: 8, unit: ' g'),
      ];

  static double extensionCm(LabParams p) => Mechanics.springExtension(pNum(p, 'load') / 1000, springs[pStr(p, 'spring', 'B')]!) * 100;

  @override
  List<LabColumn> get columns => [LabColumn(tr('Load (g)'), 0), LabColumn('F (N)', 3), LabColumn(tr('Pointer (cm)'), 1), LabColumn(tr('Extension (cm)'), 1)];

  @override
  LabReading read(LabParams p) {
    final g = pNum(p, 'load'), e = _r(extensionCm(p), 10);
    return LabReading.row([g, _r(g / 1000 * Mechanics.g, 1000), zero + e, e]);
  }

  @override
  List<String> live(LabParams p) => [tr('Pointer {r} cm', {'r': (zero + extensionCm(p)).toStringAsFixed(1)})];

  @override
  LabGraph graph(LabParams p) => const LabGraph(1, 3, throughOrigin: true);

  @override
  String? result(List<List<Object>> rows) {
    final pts = [for (final r in rows) Offset((r[1] as num).toDouble(), (r[3] as num).toDouble())];
    final k = LabGraph.slope(pts);
    if (k == null || k == 0 || rows.length < 2) return null;
    return tr('Extension ÷ force stays the same: extension ∝ load (Hooke’s law). Slope {s} cm/N, so the spring constant k = {k} N/m.',
        {'s': k.toStringAsFixed(2), 'k': (100 / k).toStringAsFixed(1)});
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final s = h / 520;
    final top = Offset(w * 0.4, h * 0.08);
    canvas.drawRect(Rect.fromLTWH(w * 0.25, h * 0.05, w * 0.3, 10), fill(LabInk.wire));
    final e = extensionCm(p);
    final cmPx = h * 0.035;
    final bottom = top + Offset(0, h * 0.3 + e * cmPx);
    _spring(canvas, top, bottom, width: 16 * s);
    canvas.drawLine(bottom, bottom + Offset(w * 0.12, 0), stroke(LabInk.red, 2.5));
    _masses(canvas, bottom, pNum(p, 'load'), s);
    // Vertical scale.
    final sx = w * 0.54;
    canvas.drawRect(Rect.fromLTWH(sx, h * 0.08, 30, h * 0.86), fill(const Color(0xFFF3E3B5)));
    for (var cm = 0; cm <= 24; cm++) {
      final y = top.dy + h * 0.3 + (cm - zero) * cmPx;
      if (y < h * 0.08 || y > h * 0.94) continue;
      canvas.drawLine(Offset(sx, y), Offset(sx + (cm % 5 == 0 ? 16 : 9), y), stroke(LabInk.ink, 1));
      if (cm % 5 == 0) label(canvas, '$cm', Offset(sx + 24, y), size: 11);
    }
    label(canvas, '${(zero + e).toStringAsFixed(1)} cm', Offset(w * 0.78, bottom.dy), size: 18, bold: true, color: LabInk.red);
    label(canvas, '${pNum(p, 'load').toStringAsFixed(0)} g', Offset(w * 0.25, bottom.dy + h * 0.1), size: 16, bold: true);
  }
}

/// A loaded spring oscillating: T = 2π√(m/k), so T² against m is a straight line.
class SpringMassBench extends LabBench {
  const SpringMassBench();

  static const springMass = 0.02; // kg

  @override
  String get kind => 'spring-mass';

  @override
  bool get animated => true;

  @override
  LabParams get defaults => {'spring': 'B', 'load': 200.0, 'timing': false};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('spring', tr('Spring'), [for (final k in SpringBench.springs.keys) (k, k)]),
        LabSlider('load', tr('Load'), 50, 400, divisions: 7, unit: ' g'),
      ];

  static double period(LabParams p) => Mechanics.springPeriod(pNum(p, 'load', 200) / 1000, SpringBench.springs[pStr(p, 'spring', 'B')]!, springMass: springMass);

  @override
  List<LabColumn> get columns => [LabColumn('m (g)', 0), LabColumn(tr('Time for 20 (s)'), 2), LabColumn('T (s)', 3), LabColumn('T² (s²)', 3)];

  @override
  LabReading read(LabParams p) {
    final t20 = _r(20 * period(p), 100);
    return LabReading.row([pNum(p, 'load', 200), t20, _r(t20 / 20, 1000), _r(t20 * t20 / 400, 1000)]);
  }

  @override
  List<String> live(LabParams p) => ['T = ${period(p).toStringAsFixed(3)} s'];

  @override
  LabGraph graph(LabParams p) => const LabGraph(0, 3, line: true);

  @override
  String? result(List<List<Object>> rows) {
    final f = LinearFit.of([for (final r in rows) (r[0] as num) / 1000], [for (final r in rows) (r[3] as num).toDouble()]);
    if (f == null || rows.length < 3) return null;
    final k = 4 * math.pi * math.pi / f.slope;
    return tr('T² rises in a straight line with m (slope {s} s²/kg), so k = 4π² ÷ slope = {k} N/m. The line does not pass exactly through the origin because the spring’s own mass also moves.',
        {'s': pm(f.slope, f.slopeSe), 'k': pm(k, k * f.slopeSe / f.slope)});
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final s = h / 520;
    final top = Offset(w * 0.35, h * 0.08);
    canvas.drawRect(Rect.fromLTWH(w * 0.2, h * 0.05, w * 0.3, 10), fill(LabInk.wire));
    final per = period(p);
    final amp = h * 0.06;
    final y = h * 0.42 + amp * math.cos(2 * math.pi * t / per);
    _spring(canvas, top, Offset(top.dx, y), width: 16 * s);
    _masses(canvas, Offset(top.dx, y), pNum(p, 'load', 200), s);
    dashed(canvas, Offset(w * 0.2, h * 0.42 + h * 0.03), Offset(w * 0.5, h * 0.42 + h * 0.03), stroke(LabInk.muted, 1));
    _stopwatch(canvas, Offset(w * 0.75, h * 0.4), t % 60, math.min(w, h) * 0.12);
    label(canvas, tr('20 oscillations take {t} s', {'t': (20 * per).toStringAsFixed(2)}), Offset(w * 0.75, h * 0.72), size: 15, color: LabInk.muted);
  }
}

/// The force down a smooth incline on a roller is mg sin θ.
class InclineBench extends LabBench {
  const InclineBench();

  static const mass = 0.5; // kg

  @override
  String get kind => 'incline';

  @override
  LabParams get defaults => {'angle': 20.0};

  @override
  List<LabControl> controls(LabParams p) => [LabSlider('angle', tr('Angle θ'), 0, 60, divisions: 60, unit: '°')];

  static double force(LabParams p) => Mechanics.downSlope(mass, pNum(p, 'angle', 20));

  @override
  List<LabColumn> get columns => [LabColumn('θ (°)', 0), LabColumn('sin θ', 3), LabColumn(tr('Spring balance F (N)'), 2)];

  @override
  LabReading read(LabParams p) {
    final a = pNum(p, 'angle', 20);
    return LabReading.row([a, _r(math.sin(a * math.pi / 180), 1000), _r(force(p), 100)]);
  }

  @override
  List<String> live(LabParams p) => ['F = ${force(p).toStringAsFixed(2)} N'];

  @override
  LabGraph graph(LabParams p) => const LabGraph(1, 2, throughOrigin: true);

  @override
  String? result(List<List<Object>> rows) {
    final k = LabGraph.slope([for (final r in rows) Offset((r[1] as num).toDouble(), (r[2] as num).toDouble())]);
    if (k == null || rows.length < 2) return null;
    return tr('F against sin θ is a straight line through the origin: F = W sin θ with W = {w} N (the roller’s weight, mg = {mg} N).',
        {'w': k.toStringAsFixed(2), 'mg': (mass * Mechanics.g).toStringAsFixed(2)});
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final a = pNum(p, 'angle', 20) * math.pi / 180;
    final base = Offset(w * 0.12, h * 0.85), len = w * 0.62;
    final top = base + Offset(len * math.cos(a), -len * math.sin(a));
    final tri = Path()
      ..moveTo(base.dx, base.dy)
      ..lineTo(top.dx, top.dy)
      ..lineTo(top.dx, base.dy)
      ..close();
    canvas.drawPath(tri, fill(const Color(0xFFE6D3B3)));
    canvas.drawPath(tri, stroke(LabInk.ink, 2));
    final u = (top - base) / len, n = Offset(-u.dy, u.dx) * -1;
    final c = base + u * len * 0.55 + n * 26;
    canvas.drawCircle(c, 24, fill(LabInk.muted));
    canvas.drawCircle(c, 24, stroke(LabInk.ink, 2));
    // Spring balance up the slope holding it.
    final hold = top + n * 26;
    canvas.drawLine(c + u * 24, hold - u * 50, stroke(LabInk.ink, 2));
    canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: hold - u * 30, width: 20, height: 20), const Radius.circular(4)), fill(LabInk.accent));
    label(canvas, '${force(p).toStringAsFixed(2)} N', hold - u * 30 - Offset(0, 30), size: 16, bold: true, halo: LabInk.paper);
    label(canvas, 'θ = ${pNum(p, 'angle', 20).toStringAsFixed(0)}°', base + const Offset(70, -16), size: 15, bold: true);
    canvas.drawArc(Rect.fromCircle(center: base, radius: 50), -a, a, false, stroke(LabInk.blue, 2));
  }
}

/// Limiting friction is proportional to the normal reaction: F = μN.
class FrictionBench extends LabBench {
  const FrictionBench();

  static const surfaces = {'wood': 0.40, 'glass': 0.25, 'sandpaper': 0.62};
  static const block = 0.25; // kg

  @override
  String get kind => 'friction';

  @override
  LabParams get defaults => {'surface': 'wood', 'extra': 0.0, 'pan': 50.0};

  static String surfaceName(String s) => switch (s) {
        'glass' => tr('Wood on glass'),
        'sandpaper' => tr('Wood on sandpaper'),
        _ => tr('Wood on wood'),
      };

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('surface', tr('Surface'), [for (final s in surfaces.keys) (s, surfaceName(s))]),
        LabSlider('extra', tr('Mass on block'), 0, 1000, divisions: 10, unit: ' g'),
        LabSlider('pan', tr('Load in pan'), 0, 600, divisions: 120, unit: ' g'),
      ];

  static double normal(LabParams p) => (block + pNum(p, 'extra') / 1000) * Mechanics.g;
  static double limiting(LabParams p) => Mechanics.limitingFriction(surfaces[pStr(p, 'surface', 'wood')]!, normal(p));

  /// The pan load (with its 10 g pan) pulls; the block slides when that beats limiting friction.
  static double pull(LabParams p) => (pNum(p, 'pan', 50) + 10) / 1000 * Mechanics.g;
  static bool moving(LabParams p) => pull(p) > limiting(p);

  @override
  List<LabColumn> get columns => [LabColumn(tr('Surface')), LabColumn('N (N)', 2), LabColumn(tr('Limiting friction F (N)'), 2)];

  @override
  LabReading read(LabParams p) {
    if (!moving(p)) return LabReading.not(tr('The block has not started to slide: add load to the pan.'));
    if (pull(p) - limiting(p) > 5 / 1000 * Mechanics.g) return LabReading.not(tr('Too much: the block shoots off. Find the least load that just starts it moving.'));
    return LabReading.row([surfaceName(pStr(p, 'surface', 'wood')), _r(normal(p), 100), _r(pull(p), 100)]);
  }

  @override
  List<String> live(LabParams p) => ['N = ${normal(p).toStringAsFixed(2)} N', moving(p) ? tr('Sliding') : tr('At rest')];

  @override
  LabGraph graph(LabParams p) => LabGraph(1, 2, throughOrigin: true, include: (r) => r[0] == surfaceName(pStr(p, 'surface', 'wood')));

  @override
  String? result(List<List<Object>> rows) {
    final out = <String>[];
    for (final s in surfaces.keys) {
      final mine = [for (final r in rows) if (r[0] == surfaceName(s)) r];
      if (mine.length < 2) continue;
      final mu = LabGraph.slope([for (final r in mine) Offset((r[1] as num).toDouble(), (r[2] as num).toDouble())])!;
      out.add(tr('{s}: F ∝ N, coefficient of static friction μ = F ÷ N = {m}.', {'s': surfaceName(s), 'm': mu.toStringAsFixed(2)}));
    }
    return out.isEmpty ? null : out.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final table = h * 0.5;
    canvas.drawRect(Rect.fromLTWH(w * 0.05, table, w * 0.7, 14), fill(const Color(0xFFB08860)));
    final slide = moving(p) ? 30.0 : 0.0;
    final b = Rect.fromLTWH(w * 0.3 + slide, table - 50, 90, 50);
    canvas.drawRect(b, fill(const Color(0xFFD7B98E)));
    canvas.drawRect(b, stroke(LabInk.ink, 2));
    final extra = pNum(p, 'extra');
    for (var k = 0; k < (extra / 200).ceil(); k++) {
      canvas.drawRect(Rect.fromLTWH(b.left + 10, b.top - 12.0 * (k + 1), 70, 11), fill(const Color(0xFF8D6E63)));
    }
    final pulley = Offset(w * 0.75, table - 25);
    canvas.drawCircle(pulley, 14, stroke(LabInk.ink, 2));
    canvas.drawLine(b.centerRight, pulley - const Offset(0, 0), stroke(LabInk.ink, 1.5));
    final panY = h * 0.75 + slide;
    canvas.drawLine(pulley + const Offset(14, 0), Offset(pulley.dx + 14, panY), stroke(LabInk.ink, 1.5));
    canvas.drawLine(Offset(pulley.dx - 10, panY), Offset(pulley.dx + 38, panY), stroke(LabInk.ink, 3));
    label(canvas, '${pNum(p, 'pan', 50).toStringAsFixed(0)} g', Offset(pulley.dx + 14, panY + 18), size: 15, bold: true);
    label(canvas, surfaceName(pStr(p, 'surface', 'wood')), Offset(w * 0.3, table + 30), size: 14, color: LabInk.muted);
    label(canvas, moving(p) ? tr('Sliding') : tr('At rest'), Offset(w * 0.4, h * 0.15), size: 18, bold: true, color: moving(p) ? LabInk.red : LabInk.green);
  }
}

/// Projectile motion: range, height and time for any launch speed and angle.
class ProjectileBench extends LabBench {
  const ProjectileBench();

  @override
  String get kind => 'projectile';

  @override
  bool get animated => true;

  @override
  LabParams get defaults => {'v': 15.0, 'angle': 45.0, 'h': 0.0, 'g': Mechanics.g};

  @override
  List<LabControl> controls(LabParams p) => [
        LabSlider('v', tr('Speed'), 5, 25, divisions: 40, unit: ' m/s', decimals: 1),
        LabSlider('angle', tr('Angle'), 5, 85, divisions: 80, unit: '°'),
        LabSlider('h', tr('Height'), 0, 20, divisions: 20, unit: ' m'),
        LabChoice('g', tr('Planet'), [(Mechanics.g, tr('Earth')), (1.62, tr('Moon')), (3.71, tr('Mars'))]),
      ];

  static ({double time, double range, double maxHeight}) flight(LabParams p) =>
      Mechanics.projectile(pNum(p, 'v', 15), pNum(p, 'angle', 45), height: pNum(p, 'h'), gravity: pNum(p, 'g', Mechanics.g));

  @override
  List<LabColumn> get columns => [LabColumn('θ (°)', 0), LabColumn('u (m/s)', 1), LabColumn('h₀ (m)', 0), LabColumn(tr('Range (m)'), 2), LabColumn(tr('Max height (m)'), 2), LabColumn(tr('Time (s)'), 2)];

  @override
  LabReading read(LabParams p) {
    final f = flight(p);
    return LabReading.row([pNum(p, 'angle', 45), pNum(p, 'v', 15), pNum(p, 'h'), _r(f.range, 100), _r(f.maxHeight, 100), _r(f.time, 100)]);
  }

  @override
  List<String> live(LabParams p) {
    final f = flight(p);
    return ['R = ${f.range.toStringAsFixed(2)} m', 'H = ${f.maxHeight.toStringAsFixed(2)} m', 'T = ${f.time.toStringAsFixed(2)} s'];
  }

  @override
  LabGraph graph(LabParams p) => const LabGraph(0, 3, curve: true);

  @override
  String? result(List<List<Object>> rows) {
    final ground = [for (final r in rows) if ((r[2] as num) == 0) r];
    if (ground.length < 2) return null;
    final best = ground.reduce((a, b) => (a[3] as num) >= (b[3] as num) ? a : b);
    String deg(Object a) => (a as num).toStringAsFixed(0);
    final out = [tr('Of your launches from the ground, {a}° went farthest ({r} m): the range u² sin 2θ ÷ g is greatest at 45°.', {'a': deg(best[0]), 'r': best[3]})];
    for (final a in ground) {
      for (final b in ground) {
        if ((a[0] as num) < (b[0] as num) && (a[0] as num) + (b[0] as num) == 90 && a[1] == b[1]) {
          out.add(tr('{a}° and {b}° are complementary and gave the same range.', {'a': deg(a[0]), 'b': deg(b[0])}));
        }
      }
    }
    return out.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final f = flight(p);
    final v = pNum(p, 'v', 15), a = pNum(p, 'angle', 45), h0 = pNum(p, 'h'), g = pNum(p, 'g', Mechanics.g);
    // A fixed scale big enough for the largest launch on the Moon would be
    // tiny on Earth: fit the present flight instead.
    final span = math.max(f.range, 10.0), top = math.max(f.maxHeight, 5.0);
    final sx = w * 0.8 / span, sy = h * 0.7 / top, s = math.min(sx, sy);
    final o = Offset(w * 0.08, h * 0.86);
    Offset map(double x, double y) => o + Offset(x * s, -y * s);
    canvas.drawLine(o, Offset(w * 0.96, o.dy), stroke(LabInk.ink, 2));
    if (h0 > 0) canvas.drawRect(Rect.fromPoints(map(-1.5, 0), map(0, h0)), fill(const Color(0xFFB0A090)));
    final path = Path();
    for (var k = 0; k <= 80; k++) {
      final (x, y) = Mechanics.projectileAt(v, a, f.time * k / 80, height: h0, gravity: g);
      final q = map(x, y);
      k == 0 ? path.moveTo(q.dx, q.dy) : path.lineTo(q.dx, q.dy);
    }
    canvas.drawPath(path, stroke(LabInk.blue.withValues(alpha: 0.5), 2));
    final tt = (t % (f.time + 1)).clamp(0.0, f.time);
    final (bx, by) = Mechanics.projectileAt(v, a, tt, height: h0, gravity: g);
    canvas.drawCircle(map(bx, by), 9, fill(LabInk.red));
    final apexT = v * math.sin(a * math.pi / 180) / g;
    final (ax, ay) = Mechanics.projectileAt(v, a, apexT, height: h0, gravity: g);
    dashed(canvas, map(ax, 0), map(ax, ay), stroke(LabInk.muted, 1));
    label(canvas, 'H = ${f.maxHeight.toStringAsFixed(1)} m', map(ax, ay) + const Offset(0, -16), size: 14, bold: true);
    label(canvas, 'R = ${f.range.toStringAsFixed(1)} m', map(f.range, 0) + const Offset(0, 18), size: 14, bold: true);
    canvas.drawLine(map(0, h0), map(0, h0) + Offset(math.cos(a * math.pi / 180), -math.sin(a * math.pi / 180)) * 50, stroke(LabInk.green, 3));
  }
}

/// Collisions on an air track: momentum is conserved in every collision;
/// kinetic energy only in an elastic one.
class CollisionBench extends LabBench {
  const CollisionBench();

  @override
  String get kind => 'collision';

  @override
  bool get animated => true;

  @override
  LabParams get defaults => {'m1': 0.5, 'm2': 0.5, 'u1': 0.6, 'u2': 0.0, 'e': 1.0};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('m1', 'm₁', [(0.25, '0.25 kg'), (0.5, '0.5 kg'), (1.0, '1 kg')]),
        LabChoice('m2', 'm₂', [(0.25, '0.25 kg'), (0.5, '0.5 kg'), (1.0, '1 kg')]),
        LabSlider('u1', 'u₁', 0, 1, divisions: 20, unit: ' m/s', decimals: 2),
        LabSlider('u2', 'u₂', -1, 0.5, divisions: 30, unit: ' m/s', decimals: 2),
        LabChoice('e', tr('Collision'), [(1.0, tr('Elastic')), (0.5, tr('Partly elastic')), (0.0, tr('Sticky (inelastic)'))]),
      ];

  static (double, double) after(LabParams p) => Mechanics.collide(pNum(p, 'm1', 0.5), pNum(p, 'u1', 0.6), pNum(p, 'm2', 0.5), pNum(p, 'u2'), e: pNum(p, 'e', 1));

  @override
  List<LabColumn> get columns => [LabColumn('v₁ (m/s)', 3), LabColumn('v₂ (m/s)', 3), LabColumn(tr('p before (kg m/s)'), 3), LabColumn(tr('p after (kg m/s)'), 3), LabColumn(tr('KE before (J)'), 4), LabColumn(tr('KE after (J)'), 4)];

  @override
  LabReading read(LabParams p) {
    final m1 = pNum(p, 'm1', 0.5), m2 = pNum(p, 'm2', 0.5), u1 = pNum(p, 'u1', 0.6), u2 = pNum(p, 'u2');
    if (u1 <= u2) return LabReading.not(tr('Cart 1 must move faster than cart 2 to catch it.'));
    final (v1, v2) = after(p);
    return LabReading.row([_r(v1, 1000), _r(v2, 1000), _r(m1 * u1 + m2 * u2, 1000), _r(m1 * v1 + m2 * v2, 1000), _r(0.5 * m1 * u1 * u1 + 0.5 * m2 * u2 * u2, 10000), _r(0.5 * m1 * v1 * v1 + 0.5 * m2 * v2 * v2, 10000)]);
  }

  @override
  List<String> live(LabParams p) {
    final (v1, v2) = after(p);
    return ['v₁ = ${v1.toStringAsFixed(2)} m/s', 'v₂ = ${v2.toStringAsFixed(2)} m/s'];
  }

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final dp = rows.map((r) => ((r[2] as num) - (r[3] as num)).abs()).reduce(math.max);
    final lost = [for (final r in rows) if ((r[4] as num) > 0) 100 * (1 - (r[5] as num) / (r[4] as num))];
    return tr('Momentum before and after agree within {d} kg m/s in every collision. Kinetic energy lost: {k}% (none in an elastic collision, most when the carts stick).',
        {'d': dp.toStringAsFixed(3), 'k': lost.map((x) => x.toStringAsFixed(0)).join(', ')});
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final track = h * 0.6;
    canvas.drawRect(Rect.fromLTWH(w * 0.03, track, w * 0.94, 12), fill(LabInk.muted));
    final m1 = pNum(p, 'm1', 0.5), m2 = pNum(p, 'm2', 0.5), u1 = pNum(p, 'u1', 0.6), u2 = pNum(p, 'u2');
    final (v1, v2) = after(p);
    // A 6 s replay: approach, collide at the middle, separate.
    const cycle = 6.0;
    final tt = t % cycle - 3;
    final scale = w * 0.12;
    final w1 = 50 + 30 * m1, w2 = 50 + 30 * m2;
    final meet = w * 0.5;
    final x1 = tt < 0 || u1 <= u2 ? meet - w1 / 2 + (tt < 0 ? u1 * tt : v1 * tt) * scale : meet - w1 / 2 + v1 * tt * scale;
    final x2 = tt < 0 || u1 <= u2 ? meet + w2 / 2 + (tt < 0 ? u2 * tt : v2 * tt) * scale : meet + w2 / 2 + v2 * tt * scale;
    void cart(double cx, double width, Color c, String name) {
      final r = Rect.fromCenter(center: Offset(cx, track - 22), width: width, height: 36);
      canvas.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(6)), fill(c));
      canvas.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(6)), stroke(LabInk.ink, 2));
      label(canvas, name, r.center, size: 15, bold: true, color: Colors.white);
    }

    canvas.save();
    canvas.clipRect(Rect.fromLTWH(0, 0, w, h));
    cart(x1, w1, LabInk.blue, '1');
    cart(x2, w2, LabInk.red, '2');
    canvas.restore();
    label(canvas, 'u₁ = ${u1.toStringAsFixed(2)}, u₂ = ${u2.toStringAsFixed(2)} → v₁ = ${v1.toStringAsFixed(2)}, v₂ = ${v2.toStringAsFixed(2)} m/s', Offset(w / 2, h * 0.2), size: 16, bold: true);
    label(canvas, tt < 0 ? tr('Before') : tr('After'), Offset(w / 2, h * 0.3), size: 15, color: LabInk.muted);
  }
}

/// Young's modulus by Searle's method: the extension of a loaded wire,
/// Y = gL ÷ (πr² × slope of extension against load).
class SearleBench extends LabBench {
  const SearleBench();

  static const materials = {'steel': 2.0e11, 'brass': 1.0e11, 'copper': 1.2e11};
  static const length = 2.0, diameter = 0.5e-3;

  @override
  String get kind => 'searle';

  @override
  LabParams get defaults => {'material': 'steel', 'load': 0.0};

  @override
  LabParams get preview => {...defaults, 'load': 3.0};

  static String materialName(String m) => switch (m) {
        'brass' => tr('Brass'),
        'copper' => tr('Copper'),
        _ => tr('Steel'),
      };

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('material', tr('Wire'), [for (final m in materials.keys) (m, materialName(m))]),
        LabSlider('load', tr('Load'), 0, 5, divisions: 10, unit: ' kg', decimals: 1),
      ];

  /// The micrometer reads to 0.001 mm; a small, repeatable scatter stands in
  /// for the real experiment's.
  static double extensionMm(LabParams p) {
    final m = pNum(p, 'load');
    final e = Mechanics.wireExtension(m, length, diameter, materials[pStr(p, 'material', 'steel')]!) * 1000;
    final jitter = ((m * 7919).round() % 7 - 3) * 0.002;
    return m == 0 ? 0 : _r(e + jitter, 1000);
  }

  @override
  List<LabColumn> get columns => [LabColumn(tr('Wire')), LabColumn(tr('Load (kg)'), 1), LabColumn(tr('Extension (mm)'), 3)];

  @override
  LabReading read(LabParams p) => LabReading.row([materialName(pStr(p, 'material', 'steel')), pNum(p, 'load'), extensionMm(p)]);

  @override
  List<String> live(LabParams p) => [tr('Extension {e} mm', {'e': extensionMm(p).toStringAsFixed(3)})];

  @override
  LabGraph graph(LabParams p) => LabGraph(1, 2, line: true, include: (r) => r[0] == materialName(pStr(p, 'material', 'steel')));

  @override
  String? result(List<List<Object>> rows) {
    final out = <String>[];
    for (final m in materials.keys) {
      final mine = [for (final r in rows) if (r[0] == materialName(m)) r];
      final f = LinearFit.of([for (final r in mine) (r[1] as num).toDouble()], [for (final r in mine) (r[2] as num) / 1000]);
      if (f == null || mine.length < 3) continue;
      final area = math.pi * diameter * diameter / 4;
      final y = Mechanics.g * length / (area * f.slope);
      out.add(tr("{w}: slope {s} mm/kg, so Young's modulus Y = gL ÷ (πr² × slope) = {y} × 10¹¹ Pa.",
          {'w': materialName(m), 's': pm(f.slope * 1000, f.slopeSe * 1000), 'y': pm(y / 1e11, y * f.slopeSe / f.slope / 1e11)}));
    }
    return out.isEmpty ? null : out.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final s = h / 520;
    canvas.drawRect(Rect.fromLTWH(w * 0.2, h * 0.04, w * 0.4, 12), fill(LabInk.wire));
    final ref = Offset(w * 0.3, h * 0.07), test = Offset(w * 0.5, h * 0.07);
    final e = extensionMm(p);
    canvas.drawLine(ref, ref + Offset(0, h * 0.5), stroke(LabInk.muted, 1.5));
    canvas.drawLine(test, test + Offset(0, h * 0.5 + e * 6), stroke(LabInk.ink, 1.5));
    final frame = Rect.fromLTWH(ref.dx - 10, h * 0.57, test.dx - ref.dx + 20, 26);
    canvas.drawRect(frame.translate(0, e * 3), fill(const Color(0xFFDADDE1)));
    canvas.drawRect(frame.translate(0, e * 3), stroke(LabInk.ink, 1.5));
    _masses(canvas, Offset(ref.dx, frame.bottom + 10), 500, s * 0.8);
    label(canvas, tr('Reference'), Offset(ref.dx - 40, h * 0.3), size: 12, color: LabInk.muted);
    _masses(canvas, Offset(test.dx, frame.bottom + 10 + e * 3), pNum(p, 'load') * 100, s * 0.8);
    label(canvas, '${pNum(p, 'load').toStringAsFixed(1)} kg', Offset(test.dx + 70, h * 0.8), size: 15, bold: true);
    // Micrometer readout.
    final m = Rect.fromLTWH(w * 0.66, h * 0.3, w * 0.28, h * 0.2);
    canvas.drawRRect(RRect.fromRectAndRadius(m, const Radius.circular(10)), fill(const Color(0xFF2E343C)));
    label(canvas, '${e.toStringAsFixed(3)} mm', m.center, size: 22, bold: true, color: const Color(0xFF9FD8B9));
    label(canvas, tr('Micrometer'), Offset(m.center.dx, m.bottom + 14), size: 13, color: LabInk.muted);
  }
}

/// Stokes' law: the terminal velocity of small steel balls in glycerine, v ∝ r².
class StokesBench extends LabBench {
  const StokesBench();

  static const rho = 7800.0, sigma = 1260.0, eta = 1.41, marks = 0.20; // m between the marks

  @override
  String get kind => 'stokes';

  @override
  bool get animated => true;

  @override
  LabParams get defaults => {'r': 1.5};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('r', tr('Ball radius'), [for (final r in [1.0, 1.5, 2.0, 2.5, 3.0]) (r, '$r mm')]),
      ];

  static double velocity(LabParams p) => Mechanics.terminalVelocity(pNum(p, 'r', 1.5) / 1000, rho, sigma, eta);
  static double time(LabParams p) => _r(marks / velocity(p), 100);

  @override
  List<LabColumn> get columns => [LabColumn('r (mm)', 1), LabColumn('r² (mm²)', 2), LabColumn(tr('Time between marks (s)'), 2), LabColumn('v (cm/s)', 3)];

  @override
  LabReading read(LabParams p) {
    final r = pNum(p, 'r', 1.5), tt = time(p);
    return LabReading.row([r, r * r, tt, _r(marks * 100 / tt, 1000)]);
  }

  @override
  List<String> live(LabParams p) => ['v = ${(velocity(p) * 100).toStringAsFixed(2)} cm/s'];

  @override
  LabGraph graph(LabParams p) => const LabGraph(1, 3, throughOrigin: true);

  @override
  String? result(List<List<Object>> rows) {
    final k = LabGraph.slope([for (final r in rows) Offset((r[1] as num) * 1e-6, (r[3] as num) / 100)]);
    if (k == null || rows.length < 2) return null;
    final n = 2 * (rho - sigma) * Mechanics.g / (9 * k);
    return tr('v is proportional to r² (straight line through the origin). From the slope, the viscosity of glycerine η = 2(ρ − σ)g ÷ (9 × slope) = {n} Pa s.', {'n': n.toStringAsFixed(2)});
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final jar = Rect.fromLTWH(w * 0.3, h * 0.06, w * 0.18, h * 0.88);
    canvas.drawRect(jar, fill(const Color(0x33E8C26A)));
    canvas.drawRect(jar, stroke(LabInk.ink, 2));
    final m1 = h * 0.35, m2 = h * 0.75;
    for (final y in [m1, m2]) {
      canvas.drawLine(Offset(jar.left - 10, y), Offset(jar.right + 10, y), stroke(LabInk.red, 2));
    }
    label(canvas, '20 cm', Offset(jar.right + 40, (m1 + m2) / 2), size: 14, color: LabInk.muted);
    final tt = time(p), fall = (m2 - m1);
    final total = tt * 1.6 + 1.0;
    final phase = t % total;
    final y = m1 - fall * 0.3 + (phase / tt) * fall;
    final rPx = 2.0 + pNum(p, 'r', 1.5) * 2.5;
    if (y < jar.bottom - rPx) canvas.drawCircle(Offset(jar.center.dx, y), rPx, fill(const Color(0xFF7D8590)));
    final timing = y >= m1 && y <= m2;
    final shown = y < m1 ? 0.0 : (y > m2 ? tt : (y - m1) / fall * tt);
    _stopwatch(canvas, Offset(w * 0.72, h * 0.4), shown, math.min(w, h) * 0.12);
    label(canvas, timing ? tr('Timing…') : tr('Time between the marks'), Offset(w * 0.72, h * 0.7), size: 14, color: LabInk.muted);
  }
}

/// Capillary rise: h = 2T ÷ (rρg), so h × r is constant.
class CapillaryBench extends LabBench {
  const CapillaryBench();

  static const tension = 0.072, rho = 1000.0;

  @override
  String get kind => 'capillary';

  @override
  LabParams get defaults => {'r': 0.5};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('r', tr('Tube radius'), [for (final r in [0.25, 0.5, 0.75, 1.0]) (r, '$r mm')]),
      ];

  static double riseCm(LabParams p) => Mechanics.capillaryRise(pNum(p, 'r', 0.5) / 1000, tension, rho) * 100;

  @override
  List<LabColumn> get columns => [LabColumn('r (mm)', 2), LabColumn('h (cm)', 2), LabColumn('h × r (cm mm)', 3)];

  @override
  LabReading read(LabParams p) {
    final h = _r(riseCm(p), 100), r = pNum(p, 'r', 0.5);
    return LabReading.row([r, h, _r(h * r, 1000)]);
  }

  @override
  List<String> live(LabParams p) => ['h = ${riseCm(p).toStringAsFixed(2)} cm'];

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final ts = [for (final r in rows) (r[1] as num) / 100 * (r[0] as num) / 1000 * rho * Mechanics.g / 2];
    final m = meanSe([for (final x in ts) x.toDouble()]);
    return tr('h × r stays the same: the narrower the tube, the higher the water. Surface tension T = hrρg ÷ 2 = {t} N/m (table: 0.072 N/m at 25 °C).', {'t': pm(m.mean, m.se)});
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final level = h * 0.72;
    canvas.drawRect(Rect.fromLTWH(w * 0.1, level, w * 0.6, h * 0.2), fill(LabInk.water));
    canvas.drawRect(Rect.fromLTWH(w * 0.1, h * 0.3, w * 0.6, h * 0.62), stroke(LabInk.ink, 2));
    final cmPx = h * 0.07;
    final tubes = [0.25, 0.5, 0.75, 1.0];
    for (var k = 0; k < tubes.length; k++) {
      final r = tubes[k];
      final x = w * (0.2 + 0.13 * k);
      final hh = Mechanics.capillaryRise(r / 1000, tension, rho) * 100 * cmPx;
      final tw = 4 + r * 10;
      final selected = r == pNum(p, 'r', 0.5);
      canvas.drawRect(Rect.fromLTWH(x - tw / 2, level - hh, tw, hh + h * 0.15), fill(LabInk.water));
      canvas.drawRect(Rect.fromLTWH(x - tw / 2, h * 0.1, tw, h * 0.8), stroke(selected ? LabInk.red : LabInk.ink, selected ? 2.5 : 1.5));
      if (selected) label(canvas, 'h = ${riseCm(p).toStringAsFixed(2)} cm', Offset(x, level - hh - 18), size: 14, bold: true, halo: LabInk.paper);
    }
  }
}

/// Newton's law of cooling: hot water cools at a rate proportional to its
/// excess temperature over the room.
class CoolingBench extends LabBench {
  const CoolingBench();

  static const room = 30.0, start = 80.0;
  static const k = {'bare': 0.045, 'lagged': 0.02}; // per minute

  @override
  String get kind => 'cooling';

  @override
  LabParams get defaults => {'cal': 'bare', 'min': 0.0};

  @override
  LabParams get preview => {...defaults, 'min': 8.0};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('cal', tr('Calorimeter'), [('bare', tr('Bare')), ('lagged', tr('Lagged with cotton'))]),
        LabSlider('min', tr('Time'), 0, 30, divisions: 60, unit: ' min', decimals: 1),
      ];

  static double temp(LabParams p) => Mechanics.cooling(start, room, k[pStr(p, 'cal', 'bare')]!, pNum(p, 'min'));

  @override
  List<LabColumn> get columns => [LabColumn('t (min)', 1), LabColumn('T (°C)', 1), LabColumn('T − T₀ (°C)', 1)];

  @override
  LabReading read(LabParams p) {
    // The thermometer reads to 0.5 °C.
    final tt = (temp(p) * 2).round() / 2;
    return LabReading.row([pNum(p, 'min'), tt, tt - room]);
  }

  @override
  List<String> live(LabParams p) => ['T = ${temp(p).toStringAsFixed(1)} °C', tr('Room {t} °C', {'t': room.toStringAsFixed(0)})];

  @override
  LabGraph graph(LabParams p) => const LabGraph(0, 1, curve: true, fromZero: false);

  @override
  String? result(List<List<Object>> rows) {
    final pts = [for (final r in rows) if ((r[2] as num) > 1) ((r[0] as num).toDouble(), math.log((r[2] as num).toDouble()))];
    if (pts.length < 3) return null;
    final f = LinearFit.of([for (final q in pts) q.$1], [for (final q in pts) q.$2])!;
    return tr('ln(T − T₀) falls in a straight line with time (slope {s} per min): the rate of cooling is proportional to the excess temperature, as Newton’s law says.',
        {'s': pm(f.slope, f.slopeSe)});
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final tt = temp(p);
    final cal = Rect.fromLTWH(w * 0.12, h * 0.4, w * 0.22, h * 0.45);
    if (pStr(p, 'cal', 'bare') == 'lagged') canvas.drawRect(cal.inflate(14), fill(const Color(0xFFF2F2F2)));
    canvas.drawRect(cal, fill(const Color(0xFFC77D4A)));
    canvas.drawRect(cal.deflate(6), fill(Color.lerp(LabInk.water, const Color(0x88E57373), ((tt - room) / 50).clamp(0.0, 1.0))!));
    // Thermometer.
    final tx = cal.center.dx + 20;
    canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(tx - 5, h * 0.08, 10, h * 0.7), const Radius.circular(5)), fill(Colors.white));
    canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(tx - 5, h * 0.08, 10, h * 0.7), const Radius.circular(5)), stroke(LabInk.ink, 1.5));
    final top = h * 0.78 - (tt / 100) * h * 0.66;
    canvas.drawRect(Rect.fromLTWH(tx - 2.5, top, 5, h * 0.78 - top), fill(LabInk.red));
    canvas.drawCircle(Offset(tx, h * 0.8), 9, fill(LabInk.red));
    label(canvas, '${tt.toStringAsFixed(1)} °C', Offset(tx + 50, top), size: 16, bold: true, halo: LabInk.paper);
    // The cooling curve with the present point.
    final r = Rect.fromLTWH(w * 0.5, h * 0.14, w * 0.45, h * 0.62);
    canvas.drawRect(r, fill(Colors.white));
    canvas.drawRect(r, stroke(LabInk.faint, 1));
    Offset map(double m, double c) => Offset(r.left + r.width * m / 30, r.bottom - r.height * (c - 20) / 70);
    final path = Path();
    for (var m = 0; m <= 60; m++) {
      final q = map(m / 2, Mechanics.cooling(start, room, k[pStr(p, 'cal', 'bare')]!, m / 2));
      m == 0 ? path.moveTo(q.dx, q.dy) : path.lineTo(q.dx, q.dy);
    }
    canvas.drawPath(path, stroke(LabInk.blue.withValues(alpha: 0.35), 2));
    dashed(canvas, map(0, room), map(30, room), stroke(LabInk.green, 1.5));
    canvas.drawCircle(map(pNum(p, 'min'), tt), 6, fill(LabInk.accent));
    label(canvas, '${pNum(p, 'min').toStringAsFixed(1)} min', Offset(r.center.dx, r.bottom + 16), size: 14, bold: true);
  }
}

/// Resonance tube: the first two resonating air columns for a tuning fork
/// give v = 2f(L₂ − L₁) and the end correction e = (L₂ − 3L₁) ÷ 2.
class ResonanceTubeBench extends LabBench {
  const ResonanceTubeBench();

  static const diameter = 0.05, room = 25.0;

  @override
  String get kind => 'resonance-tube';

  @override
  bool get animated => true;

  @override
  LabParams get defaults => {'f': 512.0, 'l': 10.0};

  @override
  LabParams get preview => {...defaults, 'l': 15.4};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('f', tr('Tuning fork'), [for (final f in [320.0, 384.0, 480.0, 512.0]) (f, '${f.toStringAsFixed(0)} Hz')]),
        LabSlider('l', tr('Air column'), 5, 90, divisions: 850, unit: ' cm', decimals: 1),
      ];

  static List<double> resonances(LabParams p) => [
        for (var n = 1; n <= 3; n++)
          if (Mechanics.closedPipeLength(n, pNum(p, 'f', 512), room, diameter) * 100 case final l when l <= 90) l,
      ];

  /// Loudness 0–1: sharp peaks at the resonant lengths.
  static double loudness(LabParams p) {
    final l = pNum(p, 'l', 10);
    var best = 0.0;
    for (final r in resonances(p)) {
      best = math.max(best, 1 / (1 + math.pow((l - r) / 0.6, 2)));
    }
    return best;
  }

  @override
  List<LabColumn> get columns => [LabColumn('f (Hz)', 0), LabColumn(tr('Resonance')), LabColumn('L (cm)', 1)];

  @override
  LabReading read(LabParams p) {
    if (loudness(p) < 0.8) return LabReading.not(tr('The sound is not loudest here: move the water level slowly to find the loudest point.'));
    final rs = resonances(p);
    final l = pNum(p, 'l', 10);
    final n = rs.indexOf(rs.reduce((a, b) => (a - l).abs() < (b - l).abs() ? a : b)) + 1;
    return LabReading.row([pNum(p, 'f', 512), n == 1 ? tr('First') : (n == 2 ? tr('Second') : tr('Third')), l]);
  }

  @override
  List<String> live(LabParams p) => ['L = ${pNum(p, 'l', 10).toStringAsFixed(1)} cm', tr('Loudness {n}%', {'n': (loudness(p) * 100).round()})];

  @override
  String? result(List<List<Object>> rows) {
    final out = <String>[];
    for (final f in {for (final r in rows) r[0] as num}) {
      double? l(String which) {
        final mine = [for (final r in rows) if (r[0] == f && r[1] == which) (r[2] as num).toDouble()];
        return mine.isEmpty ? null : mine.reduce((a, b) => a + b) / mine.length;
      }

      final l1 = l(tr('First')), l2 = l(tr('Second'));
      if (l1 == null || l2 == null) continue;
      out.add(tr('{f} Hz: L₁ = {a} cm, L₂ = {b} cm, so v = 2f(L₂ − L₁) = {v} m/s and the end correction e = (L₂ − 3L₁) ÷ 2 = {e} cm.', {
        'f': f.toStringAsFixed(0),
        'a': l1.toStringAsFixed(1),
        'b': l2.toStringAsFixed(1),
        'v': (2 * f * (l2 - l1) / 100).toStringAsFixed(0),
        'e': ((l2 - 3 * l1) / 2).toStringAsFixed(1),
      }));
    }
    return out.isEmpty ? (rows.isEmpty ? null : tr('Find both the first and the second resonance for a fork.')) : out.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final tube = Rect.fromLTWH(w * 0.35, h * 0.12, w * 0.08, h * 0.82);
    final cmPx = tube.height / 95;
    final water = tube.top + pNum(p, 'l', 10) * cmPx;
    canvas.drawRect(Rect.fromLTRB(tube.left, water, tube.right, tube.bottom), fill(LabInk.water));
    canvas.drawRect(tube, stroke(LabInk.ink, 2));
    for (var cm = 0; cm <= 90; cm += 10) {
      final y = tube.top + cm * cmPx;
      canvas.drawLine(Offset(tube.left - 10, y), Offset(tube.left, y), stroke(LabInk.ink, 1));
      label(canvas, '$cm', Offset(tube.left - 24, y), size: 11, color: LabInk.muted);
    }
    // The fork over the mouth, vibrating.
    final fx = tube.center.dx, fy = tube.top - 30;
    final buzz = math.sin(t * 60) * 2;
    canvas.drawLine(Offset(fx - 10 - buzz, fy - 50), Offset(fx - 10 - buzz, fy), stroke(LabInk.muted, 4));
    canvas.drawLine(Offset(fx + 10 + buzz, fy - 50), Offset(fx + 10 + buzz, fy), stroke(LabInk.muted, 4));
    canvas.drawLine(Offset(fx - 10, fy), Offset(fx + 10, fy), stroke(LabInk.muted, 4));
    label(canvas, '${pNum(p, 'f', 512).toStringAsFixed(0)} Hz', Offset(fx + 60, fy - 30), size: 15, bold: true);
    // Loudness meter.
    final loud = loudness(p);
    final m = Rect.fromLTWH(w * 0.6, h * 0.25, w * 0.08, h * 0.5);
    canvas.drawRect(m, stroke(LabInk.ink, 1.5));
    canvas.drawRect(Rect.fromLTRB(m.left, m.bottom - m.height * loud, m.right, m.bottom), fill(Color.lerp(LabInk.green, LabInk.red, loud)!));
    label(canvas, tr('Loudness'), Offset(m.center.dx, m.bottom + 16), size: 13, color: LabInk.muted);
    label(canvas, 'L = ${pNum(p, 'l', 10).toStringAsFixed(1)} cm', Offset(w * 0.82, water), size: 16, bold: true);
    canvas.drawLine(Offset(tube.right, water), Offset(w * 0.74, water), stroke(LabInk.blue, 1));
  }
}
