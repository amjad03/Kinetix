import 'dart:async';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' show Offset;

// A digit recogniser small enough to train on the board itself when the demo first opens: a
// neural network (256 pixels → 32 ReLU neurons → 10 softmax outputs) learns from digits drawn
// procedurally — each digit's strokes bent, slanted, stretched and thickened at random, like many
// hands writing it — so nothing is downloaded and no data leaves the board. A digit (the
// teacher's or a sample) is cropped to its ink, scaled into the middle of a 16 × 16 grid (as
// MNIST does) and read by the network.

/// The grid side the network reads.
const digitGrid = 16;
const digitPixels = digitGrid * digitGrid;

List<Offset> _pts(List<double> xy) => [for (var i = 0; i + 1 < xy.length; i += 2) Offset(xy[i], xy[i + 1])];

List<Offset> _ellipse(double cx, double cy, double rx, double ry, {double from = 0, double to = 2 * math.pi, int n = 22}) => [
  for (var i = 0; i <= n; i++) Offset(cx + rx * math.sin(from + (to - from) * i / n), cy - ry * math.cos(from + (to - from) * i / n)),
];

/// Each digit's ways of being written, as strokes in a unit square (y down).
final List<List<List<List<Offset>>>> digitTemplates = [
  // 0
  [
    [_ellipse(0.5, 0.5, 0.3, 0.45)],
    [_ellipse(0.5, 0.5, 0.36, 0.44, n: 20)],
  ],
  // 1
  [
    [_pts([0.34, 0.24, 0.56, 0.05, 0.56, 0.95])],
    [_pts([0.5, 0.05, 0.5, 0.95])],
    [_pts([0.34, 0.24, 0.56, 0.05, 0.56, 0.95]), _pts([0.36, 0.95, 0.76, 0.95])],
  ],
  // 2
  [
    [_pts([0.2, 0.26, 0.3, 0.09, 0.52, 0.03, 0.73, 0.12, 0.78, 0.32, 0.66, 0.52, 0.2, 0.95, 0.84, 0.95])],
    [_pts([0.22, 0.2, 0.45, 0.04, 0.72, 0.1, 0.74, 0.34, 0.24, 0.94, 0.82, 0.92])],
  ],
  // 3
  [
    [_pts([0.2, 0.12, 0.48, 0.03, 0.74, 0.14, 0.74, 0.34, 0.44, 0.48, 0.78, 0.6, 0.8, 0.82, 0.55, 0.97, 0.2, 0.88])],
    [_pts([0.22, 0.06, 0.78, 0.06, 0.46, 0.42, 0.74, 0.54, 0.78, 0.8, 0.5, 0.97, 0.2, 0.86])],
  ],
  // 4
  [
    [_pts([0.66, 0.95, 0.66, 0.05, 0.14, 0.68, 0.86, 0.68])],
    [_pts([0.3, 0.05, 0.18, 0.6, 0.84, 0.6]), _pts([0.66, 0.3, 0.66, 0.97])],
  ],
  // 5
  [
    [_pts([0.78, 0.05, 0.3, 0.05, 0.25, 0.45, 0.5, 0.38, 0.74, 0.5, 0.78, 0.74, 0.56, 0.95, 0.2, 0.88])],
    [_pts([0.3, 0.05, 0.25, 0.45, 0.5, 0.38, 0.74, 0.5, 0.78, 0.74, 0.56, 0.95, 0.2, 0.88]), _pts([0.3, 0.05, 0.8, 0.05])],
  ],
  // 6
  [
    [_pts([0.72, 0.06, 0.46, 0.12, 0.28, 0.36, 0.22, 0.68, 0.34, 0.92, 0.6, 0.96, 0.77, 0.78, 0.7, 0.57, 0.48, 0.51, 0.3, 0.6, 0.23, 0.72])],
  ],
  // 7
  [
    [_pts([0.16, 0.05, 0.84, 0.05, 0.42, 0.95])],
    [_pts([0.16, 0.05, 0.84, 0.05, 0.42, 0.95]), _pts([0.38, 0.5, 0.78, 0.5])],
  ],
  // 8
  [
    [_ellipse(0.5, 0.27, 0.22, 0.22), _ellipse(0.5, 0.72, 0.27, 0.24)],
    [_pts([0.7, 0.12, 0.5, 0.03, 0.3, 0.12, 0.32, 0.36, 0.7, 0.62, 0.74, 0.86, 0.5, 0.97, 0.26, 0.86, 0.3, 0.62, 0.68, 0.36, 0.7, 0.12])],
  ],
  // 9
  [
    [_ellipse(0.48, 0.3, 0.25, 0.24), _pts([0.73, 0.3, 0.72, 0.7, 0.56, 0.95, 0.3, 0.92])],
    [_ellipse(0.48, 0.28, 0.24, 0.23), _pts([0.72, 0.28, 0.68, 0.97])],
  ],
];

/// Ink [strokes] (any units) as [digitPixels] intensities 0..1, cropped to the ink and scaled to
/// fit 12 of the 16 cells, centred. [thickness] is the pen's half-width in cells.
Float64List rasterizeDigit(List<List<Offset>> strokes, {double thickness = 1.0}) {
  final out = Float64List(digitPixels);
  final all = [for (final s in strokes) ...s];
  if (all.isEmpty) return out;
  var x0 = all.first.dx, x1 = x0, y0 = all.first.dy, y1 = y0;
  for (final p in all) {
    x0 = math.min(x0, p.dx);
    x1 = math.max(x1, p.dx);
    y0 = math.min(y0, p.dy);
    y1 = math.max(y1, p.dy);
  }
  final side = math.max(math.max(x1 - x0, y1 - y0), 1e-9);
  final k = 12 / side;
  final cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  final segs = <(Offset, Offset)>[];
  for (final s in strokes) {
    final m = [for (final p in s) Offset((p.dx - cx) * k + digitGrid / 2, (p.dy - cy) * k + digitGrid / 2)];
    if (m.length == 1) segs.add((m.first, m.first));
    for (var i = 1; i < m.length; i++) {
      segs.add((m[i - 1], m[i]));
    }
  }
  for (var r = 0; r < digitGrid; r++) {
    for (var c = 0; c < digitGrid; c++) {
      final p = Offset(c + 0.5, r + 0.5);
      var d = double.infinity;
      for (final (a, b) in segs) {
        d = math.min(d, _segDist(p, a, b));
      }
      out[r * digitGrid + c] = ((thickness - d) / 0.8 + 0.5).clamp(0.0, 1.0);
    }
  }
  return out;
}

double _segDist(Offset p, Offset a, Offset b) {
  final ab = b - a;
  final len2 = ab.distanceSquared;
  if (len2 == 0) return (p - a).distance;
  final t = (((p.dx - a.dx) * ab.dx + (p.dy - a.dy) * ab.dy) / len2).clamp(0.0, 1.0);
  return (p - (a + ab * t)).distance;
}

double _gauss(math.Random r) {
  final u = math.max(1e-12, r.nextDouble()), v = r.nextDouble();
  return math.sqrt(-2 * math.log(u)) * math.cos(2 * math.pi * v);
}

/// One way of writing [digit]: a template bent, slanted, stretched and thickened at random.
Float64List augmentedDigit(int digit, math.Random r) {
  final variants = digitTemplates[digit];
  final strokes = variants[r.nextInt(variants.length)];
  final rot = (r.nextDouble() * 2 - 1) * 0.22, shear = (r.nextDouble() * 2 - 1) * 0.3;
  final sx = 0.75 + r.nextDouble() * 0.45, sy = 0.85 + r.nextDouble() * 0.3;
  final cr = math.cos(rot), sr = math.sin(rot);
  final bent = [
    for (final s in strokes)
      [
        for (final p in s)
          () {
            final x = (p.dx - 0.5 + _gauss(r) * 0.018) * sx, y = (p.dy - 0.5 + _gauss(r) * 0.018) * sy;
            final xs = x + shear * y;
            return Offset(xs * cr - y * sr, xs * sr + y * cr);
          }(),
      ],
  ];
  return rasterizeDigit(bent, thickness: 0.75 + r.nextDouble() * 0.6);
}

/// The clean sample of [digit] (its first template), as the demo's sample buttons draw it.
List<List<Offset>> sampleDigitStrokes(int digit) => digitTemplates[digit].first;

/// What the network made of a digit, layer by layer, for the "how inference works" steps.
class DigitTrace {
  const DigitTrace(this.input, this.hidden, this.logits, this.probs);
  final Float64List input;
  final List<double> hidden, logits, probs;

  int get best {
    var b = 0;
    for (var i = 1; i < probs.length; i++) {
      if (probs[i] > probs[b]) b = i;
    }
    return b;
  }
}

/// A dense network 256 → [hidden] ReLU → 10 softmax, trained with stochastic gradient descent
/// on the cross-entropy.
class DigitNet {
  DigitNet({this.hidden = 32, int seed = 11}) : w1 = Float64List(hidden * digitPixels), b1 = Float64List(hidden), w2 = Float64List(10 * hidden), b2 = Float64List(10) {
    final r = math.Random(seed);
    final s1 = math.sqrt(2 / digitPixels), s2 = math.sqrt(2 / hidden);
    for (var i = 0; i < w1.length; i++) {
      w1[i] = _gauss(r) * s1;
    }
    for (var i = 0; i < w2.length; i++) {
      w2[i] = _gauss(r) * s2;
    }
  }

  final int hidden;
  final Float64List w1, b1, w2, b2;

  int get parameters => w1.length + b1.length + w2.length + b2.length;

  DigitTrace trace(Float64List x) {
    final h = List<double>.filled(hidden, 0);
    for (var j = 0; j < hidden; j++) {
      var s = b1[j];
      final o = j * digitPixels;
      for (var i = 0; i < digitPixels; i++) {
        s += w1[o + i] * x[i];
      }
      h[j] = s > 0 ? s : 0;
    }
    final z = List<double>.filled(10, 0);
    for (var k = 0; k < 10; k++) {
      var s = b2[k];
      for (var j = 0; j < hidden; j++) {
        s += w2[k * hidden + j] * h[j];
      }
      z[k] = s;
    }
    final m = z.reduce(math.max);
    final e = [for (final v in z) math.exp(v - m)];
    final sum = e.fold(0.0, (a, b) => a + b);
    return DigitTrace(x, h, z, [for (final v in e) v / sum]);
  }

  /// One SGD step on example [x] of class [y]; returns its loss.
  double learn(Float64List x, int y, double lr) {
    final t = trace(x);
    final dz = [for (var k = 0; k < 10; k++) t.probs[k] - (k == y ? 1 : 0)];
    final dh = List<double>.filled(hidden, 0);
    for (var k = 0; k < 10; k++) {
      for (var j = 0; j < hidden; j++) {
        dh[j] += dz[k] * w2[k * hidden + j];
        w2[k * hidden + j] -= lr * dz[k] * t.hidden[j];
      }
      b2[k] -= lr * dz[k];
    }
    for (var j = 0; j < hidden; j++) {
      if (t.hidden[j] <= 0) continue;
      final g = dh[j];
      final o = j * digitPixels;
      for (var i = 0; i < digitPixels; i++) {
        if (x[i] != 0) w1[o + i] -= lr * g * x[i];
      }
      b1[j] -= lr * g;
    }
    return -math.log(math.max(1e-12, t.probs[y]));
  }
}

/// Trains a [DigitNet] on [perDigit] drawn examples of each digit for [epochs]; [onEpoch] hears
/// each epoch's mean loss. Between epochs it waits [pause] so the board stays responsive.
Future<DigitNet> trainDigitNet({int seed = 5, int perDigit = 90, int epochs = 10, double lr = 0.03, void Function(int epoch, double loss)? onEpoch, Future<void> Function()? pause}) async {
  final r = math.Random(seed);
  final data = <(Float64List, int)>[for (var i = 0; i < perDigit * 10; i++) (augmentedDigit(i % 10, r), i % 10)];
  final net = DigitNet(seed: seed + 1);
  for (var e = 0; e < epochs; e++) {
    data.shuffle(r);
    var loss = 0.0;
    final rate = lr / (1 + e * 0.15);
    for (final (x, y) in data) {
      loss += net.learn(x, y, rate);
    }
    onEpoch?.call(e + 1, loss / data.length);
    if (pause != null) await pause();
  }
  return net;
}
