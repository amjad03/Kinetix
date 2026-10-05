import 'dart:math' as math;

import 'package:flutter/painting.dart';

/// One thing seen in a microscope field: where it is (0–1 across the field),
/// how big, which way it points and what kind it is.
class SpecimenItem {
  final Offset at;
  final double size;
  final double angle;
  final String kind;
  const SpecimenItem(this.at, this.size, this.angle, this.kind);
}

/// Microscope fields for counting labs. A field is a jittered grid of cells
/// (so they do not overlap) whose kinds are drawn with fixed proportions and a
/// fixed seed: the same slide and field always show the same cells.
abstract final class Specimen {
  /// [rows] × [cols] cells, each a kind drawn from [mix] (kind → weight).
  static List<SpecimenItem> field(int seed, int rows, int cols, Map<String, double> mix, {double jitter = 0.25}) {
    final rnd = math.Random(seed);
    final total = mix.values.fold<double>(0, (a, b) => a + b);
    final out = <SpecimenItem>[];
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var x = rnd.nextDouble() * total;
        var kind = mix.keys.last;
        for (final e in mix.entries) {
          if (x < e.value) {
            kind = e.key;
            break;
          }
          x -= e.value;
        }
        final at = Offset((c + 0.5 + (rnd.nextDouble() - 0.5) * jitter) / cols, (r + 0.5 + (rnd.nextDouble() - 0.5) * jitter) / rows);
        out.add(SpecimenItem(at, 0.85 + rnd.nextDouble() * 0.3, rnd.nextDouble() * math.pi, kind));
      }
    }
    return out;
  }

  /// How many of each kind a field holds.
  static Map<String, int> count(List<SpecimenItem> items) {
    final out = <String, int>{};
    for (final i in items) {
      out.update(i.kind, (v) => v + 1, ifAbsent: () => 1);
    }
    return out;
  }

  /// Whether a point (0–1) falls inside the round field of view.
  static bool inView(Offset at) => (at - const Offset(0.5, 0.5)).distance <= 0.5;
}
