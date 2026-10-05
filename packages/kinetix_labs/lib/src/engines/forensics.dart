import 'dart:math' as math;

import 'package:flutter/painting.dart';

/// A ridge characteristic on a fingerprint: a ridge ending or a bifurcation,
/// at a point of the print (0–1 across, 0–1 down).
class Minutia {
  final Offset at;
  final bool ending;
  const Minutia(this.at, this.ending);
}

/// A fingerprint: its pattern (arch, loop or whorl) and its minutiae.
class FingerPrint {
  /// 'arch', 'tented-arch', 'loop-left', 'loop-right' or 'whorl'.
  final String pattern;
  final List<Minutia> minutiae;
  const FingerPrint(this.pattern, this.minutiae);

  /// Pattern class as a fingerprint examiner names it.
  String get family => pattern.startsWith('loop') ? 'loop' : pattern.contains('arch') ? 'arch' : 'whorl';

  /// Deltas (triangular meeting points of ridges): none in an arch, one in a
  /// loop, two in a whorl.
  int get deltas => switch (family) { 'arch' => 0, 'loop' => 1, _ => 2 };
}

/// Fingerprints: making prints, lifting a partial print, and matching minutiae.
abstract final class Prints {
  /// A print with [n] minutiae, fixed by [seed].
  static FingerPrint make(String pattern, int seed, {int n = 34}) {
    final rnd = math.Random(seed);
    final out = <Minutia>[];
    while (out.length < n) {
      final p = Offset(0.12 + rnd.nextDouble() * 0.76, 0.1 + rnd.nextDouble() * 0.8);
      // Keep them inside the oval of the finger pad, and apart.
      if (math.pow((p.dx - 0.5) / 0.4, 2) + math.pow((p.dy - 0.5) / 0.44, 2) > 1) continue;
      if (out.any((m) => (m.at - p).distance < 0.07)) continue;
      out.add(Minutia(p, rnd.nextBool()));
    }
    return FingerPrint(pattern, out);
  }

  /// The part of [print] inside [window], as lifted from a surface: each point
  /// moved a little (smudging) with a fixed [seed].
  static FingerPrint lift(FingerPrint print, Rect window, int seed, {double smudge = 0.008}) {
    final rnd = math.Random(seed);
    return FingerPrint(print.pattern, [
      for (final m in print.minutiae)
        if (window.contains(m.at)) Minutia(m.at + Offset((rnd.nextDouble() - 0.5) * 2 * smudge, (rnd.nextDouble() - 0.5) * 2 * smudge), m.ending),
    ]);
  }

  /// Minutiae of [scene] that have a counterpart of the same type within
  /// [tolerance] in [candidate] (each counterpart used once).
  static int matches(FingerPrint scene, FingerPrint candidate, {double tolerance = 0.025}) {
    final used = <int>{};
    var n = 0;
    for (final m in scene.minutiae) {
      var best = -1;
      var bestD = tolerance;
      for (var i = 0; i < candidate.minutiae.length; i++) {
        final c = candidate.minutiae[i];
        if (used.contains(i) || c.ending != m.ending) continue;
        final d = (c.at - m.at).distance;
        if (d <= bestD) {
          best = i;
          bestD = d;
        }
      }
      if (best >= 0) {
        used.add(best);
        n++;
      }
    }
    return n;
  }
}

/// Glass evidence: density by weighing in air and water, refractive index by
/// the immersion (Becke line) method in a heated silicone oil.
abstract final class GlassEvidence {
  /// Refractive index of the immersion oil at [celsius] (dn/dT = −0.0004 /°C).
  static double oil(double celsius) => 1.5400 - 0.00040 * (celsius - 25);

  /// The temperature at which the oil matches [n].
  static double matchTemperature(double n) => 25 + (1.5400 - n) / 0.00040;

  /// Density from the mass in air and the apparent mass in water.
  static double density(double air, double water, {double rhoWater = 0.997}) => rhoWater * air / (air - water);
}

/// Footprints: stature is about 6.6 times the length of the bare foot.
abstract final class Footprint {
  static const ratio = 6.6;
}

/// Bullet trajectory through two holes, traced back in a straight line (the
/// drop over a few metres is millimetres).
abstract final class Trajectory {
  /// Height of the line at a distance [x] from the wall, given the holes at
  /// heights [hWall] (x = 0) and [hPane] (x = [d]).
  static double heightAt(double x, double hWall, double hPane, double d) => hWall + (hPane - hWall) * x / d;

  /// Angle of the line above the horizontal (degrees; positive when the bullet
  /// was travelling downwards to the wall).
  static double angle(double hWall, double hPane, double d) => math.atan2(hPane - hWall, d) * 180 / math.pi;

  /// Drop (m) of a bullet over [x] metres at [speed] m/s.
  static double drop(double x, double speed) => 9.81 * x * x / (2 * speed * speed);
}
