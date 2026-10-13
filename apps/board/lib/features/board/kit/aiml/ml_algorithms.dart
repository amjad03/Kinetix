import 'dart:math' as math;
import 'dart:ui' show Offset;

import 'package:kinetix_ink/kinetix_ink.dart' show MlPoint;

// The machine learning the playground runs, in plain Dart on the board (offline, no packages):
// linear regression (closed form and gradient descent), polynomial regression, logistic
// regression, the perceptron, k-nearest neighbours, a decision tree, k-means and a small neural
// network trained with backpropagation. Features are standardised inside each model so the same
// learning rates work for every dataset; what comes out is in the data's own units.

/// Mean and spread of a list, to standardise it.
class Scale {
  Scale(this.mean, this.sd);
  factory Scale.of(Iterable<double> v) {
    final l = v.toList();
    if (l.isEmpty) return Scale(0, 1);
    final m = l.fold(0.0, (a, b) => a + b) / l.length;
    final s = math.sqrt(l.fold(0.0, (a, b) => a + (b - m) * (b - m)) / l.length);
    return Scale(m, s > 1e-12 ? s : 1);
  }
  final double mean, sd;
  double to(double v) => (v - mean) / sd;
  double from(double u) => u * sd + mean;
}

// --- Metrics ------------------------------------------------------------------------------------

double meanSquaredError(List<double> y, List<double> p) {
  if (y.isEmpty) return double.nan;
  var s = 0.0;
  for (var i = 0; i < y.length; i++) {
    s += (y[i] - p[i]) * (y[i] - p[i]);
  }
  return s / y.length;
}

/// The coefficient of determination: 1 − SSres / SStot.
double rSquared(List<double> y, List<double> p) {
  if (y.isEmpty) return double.nan;
  final m = y.fold(0.0, (a, b) => a + b) / y.length;
  var res = 0.0, tot = 0.0;
  for (var i = 0; i < y.length; i++) {
    res += (y[i] - p[i]) * (y[i] - p[i]);
    tot += (y[i] - m) * (y[i] - m);
  }
  return tot == 0 ? (res == 0 ? 1 : 0) : 1 - res / tot;
}

/// Rows are the actual class, columns the predicted one.
List<List<int>> confusionMatrix(List<int> actual, List<int> predicted) {
  final m = [
    [0, 0],
    [0, 0],
  ];
  for (var i = 0; i < actual.length; i++) {
    final a = actual[i], p = predicted[i];
    if (a >= 0 && a <= 1 && p >= 0 && p <= 1) m[a][p]++;
  }
  return m;
}

double accuracyOf(List<int> actual, List<int> predicted) {
  if (actual.isEmpty) return double.nan;
  var ok = 0;
  for (var i = 0; i < actual.length; i++) {
    if (actual[i] == predicted[i]) ok++;
  }
  return ok / actual.length;
}

// --- Regression ---------------------------------------------------------------------------------

/// y = intercept + slope · x.
class LinearFit {
  const LinearFit(this.intercept, this.slope);
  final double intercept, slope;
  double predict(double x) => intercept + slope * x;
}

/// Least squares in closed form: slope = Σ(x−x̄)(y−ȳ) / Σ(x−x̄)², intercept = ȳ − slope·x̄.
LinearFit linearClosedForm(List<MlPoint> pts) {
  if (pts.isEmpty) return const LinearFit(0, 0);
  final n = pts.length;
  final mx = pts.fold(0.0, (a, p) => a + p.x) / n, my = pts.fold(0.0, (a, p) => a + p.y) / n;
  var sxy = 0.0, sxx = 0.0;
  for (final p in pts) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) * (p.x - mx);
  }
  final b = sxx == 0 ? 0.0 : sxy / sxx;
  return LinearFit(my - b * mx, b);
}

/// Batch gradient descent on the mean squared error (on standardised x and y), from a flat line;
/// the loss is the MSE in the data's units after each epoch.
({LinearFit fit, List<double> loss}) linearGradientDescent(List<MlPoint> pts, {double lr = 0.1, int epochs = 100}) {
  if (pts.isEmpty) return (fit: const LinearFit(0, 0), loss: <double>[]);
  final sx = Scale.of(pts.map((p) => p.x)), sy = Scale.of(pts.map((p) => p.y));
  final u = [for (final p in pts) sx.to(p.x)], v = [for (final p in pts) sy.to(p.y)];
  var w0 = 0.0, w1 = 0.0;
  final loss = <double>[];
  LinearFit back() => LinearFit(sy.from(w0) - sy.sd * w1 * sx.mean / sx.sd, sy.sd * w1 / sx.sd);
  final ys = [for (final p in pts) p.y];
  for (var e = 0; e < epochs; e++) {
    var g0 = 0.0, g1 = 0.0;
    for (var i = 0; i < u.length; i++) {
      final err = w0 + w1 * u[i] - v[i];
      g0 += err;
      g1 += err * u[i];
    }
    w0 -= lr * 2 * g0 / u.length;
    w1 -= lr * 2 * g1 / u.length;
    final f = back();
    loss.add(meanSquaredError(ys, [for (final p in pts) f.predict(p.x)]));
  }
  return (fit: back(), loss: loss);
}

/// A polynomial in standardised x: Σ cᵢ·uⁱ with u = (x − mean) / sd.
class PolyFit {
  PolyFit(this.scale, this.coeffs);
  final Scale scale;
  final List<double> coeffs;
  double predict(double x) {
    final u = scale.to(x);
    var s = 0.0;
    for (var i = coeffs.length - 1; i >= 0; i--) {
      s = s * u + coeffs[i];
    }
    return s;
  }
}

/// Least squares polynomial of [degree] (normal equations, solved by Gaussian elimination).
PolyFit polyFit(List<MlPoint> pts, int degree) {
  final sx = Scale.of(pts.map((p) => p.x));
  final d = math.max(0, math.min(degree, math.max(0, pts.length - 1)));
  final n = d + 1;
  final a = List.generate(n, (_) => List.filled(n + 1, 0.0));
  for (final p in pts) {
    final u = sx.to(p.x);
    final pw = [for (var i = 0; i < 2 * n; i++) math.pow(u, i).toDouble()];
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        a[r][c] += pw[r + c];
      }
      a[r][n] += pw[r] * p.y;
    }
  }
  for (var r = 0; r < n; r++) {
    a[r][r] += 1e-9;
  }
  return PolyFit(sx, solveLinear(a));
}

/// Solves the augmented system [a] (n rows of n + 1) by Gaussian elimination with pivoting.
List<double> solveLinear(List<List<double>> a) {
  final n = a.length;
  for (var c = 0; c < n; c++) {
    var piv = c;
    for (var r = c + 1; r < n; r++) {
      if (a[r][c].abs() > a[piv][c].abs()) piv = r;
    }
    final t = a[c];
    a[c] = a[piv];
    a[piv] = t;
    if (a[c][c].abs() < 1e-14) continue;
    for (var r = 0; r < n; r++) {
      if (r == c) continue;
      final f = a[r][c] / a[c][c];
      if (f == 0) continue;
      for (var k = c; k <= n; k++) {
        a[r][k] -= f * a[c][k];
      }
    }
  }
  return [for (var r = 0; r < n; r++) a[r][r].abs() < 1e-14 ? 0.0 : a[r][n] / a[r][r]];
}

// --- Classification -----------------------------------------------------------------------------

/// A two-class model on 2D points: the probability of class 1 at a point.
abstract class Classifier {
  double prob1(double x, double y);
  int predict(double x, double y) => prob1(x, y) >= 0.5 ? 1 : 0;
}

/// Standardises both features from the training points.
class _Features {
  _Features(List<MlPoint> pts) : sx = Scale.of(pts.map((p) => p.x)), sy = Scale.of(pts.map((p) => p.y));
  final Scale sx, sy;
  (double, double) of(double x, double y) => (sx.to(x), sy.to(y));
}

double _sigmoid(double z) => z >= 0 ? 1 / (1 + math.exp(-z)) : math.exp(z) / (1 + math.exp(z));

/// Logistic regression by batch gradient descent on the cross-entropy; [loss] and [acc] after
/// each epoch.
class LogisticRegression extends Classifier {
  LogisticRegression._(this._f);
  factory LogisticRegression.train(List<MlPoint> pts, {double lr = 0.5, int epochs = 200}) {
    final m = LogisticRegression._(_Features(pts));
    final xs = [for (final p in pts) m._f.of(p.x, p.y)];
    final ys = [for (final p in pts) p.label.toDouble()];
    for (var e = 0; e < epochs && pts.isNotEmpty; e++) {
      var g0 = 0.0, g1 = 0.0, g2 = 0.0;
      for (var i = 0; i < xs.length; i++) {
        final err = _sigmoid(m.w0 + m.w1 * xs[i].$1 + m.w2 * xs[i].$2) - ys[i];
        g0 += err;
        g1 += err * xs[i].$1;
        g2 += err * xs[i].$2;
      }
      m
        ..w0 -= lr * g0 / xs.length
        ..w1 -= lr * g1 / xs.length
        ..w2 -= lr * g2 / xs.length;
      m.loss.add(m.crossEntropy(pts));
      m.acc.add(accuracyOf([for (final p in pts) p.label], [for (final p in pts) m.predict(p.x, p.y)]));
    }
    return m;
  }

  final _Features _f;
  double w0 = 0, w1 = 0, w2 = 0;
  final loss = <double>[], acc = <double>[];

  @override
  double prob1(double x, double y) {
    final (u, v) = _f.of(x, y);
    return _sigmoid(w0 + w1 * u + w2 * v);
  }

  double crossEntropy(List<MlPoint> pts) {
    if (pts.isEmpty) return double.nan;
    var s = 0.0;
    for (final p in pts) {
      final q = prob1(p.x, p.y).clamp(1e-9, 1 - 1e-9);
      s -= p.label == 1 ? math.log(q) : math.log(1 - q);
    }
    return s / pts.length;
  }

  /// The decision boundary w0 + w1·u + w2·v = 0 as two points in data units (null if flat).
  (Offset, Offset)? boundary(double xMin, double xMax) {
    if (w2.abs() < 1e-12) return null;
    Offset at(double x) {
      final u = _f.sx.to(x);
      return Offset(x, _f.sy.from(-(w0 + w1 * u) / w2));
    }

    return (at(xMin), at(xMax));
  }
}

/// Rosenblatt's perceptron: on each mistake w ← w + lr·(y − ŷ)·x; [loss] is the share of
/// points it got wrong in each epoch.
class Perceptron extends Classifier {
  Perceptron._(this._f);
  factory Perceptron.train(List<MlPoint> pts, {double lr = 0.1, int epochs = 50}) {
    final m = Perceptron._(_Features(pts));
    final xs = [for (final p in pts) m._f.of(p.x, p.y)];
    for (var e = 0; e < epochs && pts.isNotEmpty; e++) {
      var wrong = 0;
      for (var i = 0; i < xs.length; i++) {
        final out = m.w0 + m.w1 * xs[i].$1 + m.w2 * xs[i].$2 >= 0 ? 1 : 0;
        final d = pts[i].label - out;
        if (d != 0) {
          wrong++;
          m
            ..w0 += lr * d
            ..w1 += lr * d * xs[i].$1
            ..w2 += lr * d * xs[i].$2;
        }
      }
      m.loss.add(wrong / xs.length);
      m.acc.add(accuracyOf([for (final p in pts) p.label], [for (final p in pts) m.predict(p.x, p.y)]));
    }
    return m;
  }

  final _Features _f;
  double w0 = 0, w1 = 0, w2 = 0;
  final loss = <double>[], acc = <double>[];

  @override
  double prob1(double x, double y) {
    final (u, v) = _f.of(x, y);
    return w0 + w1 * u + w2 * v >= 0 ? 1 : 0;
  }
}

/// k-nearest neighbours (standardised distance): the share of class 1 among the k nearest.
class KNearest extends Classifier {
  KNearest(this.points, this.k) : _f = _Features(points);
  final List<MlPoint> points;
  final int k;
  final _Features _f;

  @override
  double prob1(double x, double y) {
    if (points.isEmpty) return 0.5;
    final (u, v) = _f.of(x, y);
    final d = [
      for (final p in points)
        () {
          final (a, b) = _f.of(p.x, p.y);
          return ((a - u) * (a - u) + (b - v) * (b - v), p.label);
        }(),
    ]..sort((a, b) => a.$1.compareTo(b.$1));
    final n = math.min(math.max(1, k), d.length);
    var ones = 0;
    for (var i = 0; i < n; i++) {
      if (d[i].$2 == 1) ones++;
    }
    return ones / n;
  }
}

/// A node of a [DecisionTree]: a split on x (feature 0) or y (feature 1) at [threshold], or a
/// leaf with its share of class 1.
class TreeNode {
  TreeNode.leaf(this.p1, this.count) : feature = -1, threshold = 0, left = null, right = null;
  TreeNode.split(this.feature, this.threshold, this.left, this.right, this.p1, this.count);
  final int feature;
  final double threshold, p1;
  final int count;
  final TreeNode? left, right;
  bool get isLeaf => feature < 0;
}

/// A CART tree grown on Gini impurity to [maxDepth].
class DecisionTree extends Classifier {
  DecisionTree.train(List<MlPoint> pts, {this.maxDepth = 3}) {
    root = _grow(pts, 0);
  }
  final int maxDepth;
  late final TreeNode root;

  static double gini(int ones, int n) {
    if (n == 0) return 0;
    final p = ones / n;
    return 2 * p * (1 - p);
  }

  TreeNode _grow(List<MlPoint> pts, int depth) {
    final ones = pts.where((p) => p.label == 1).length;
    final p1 = pts.isEmpty ? 0.5 : ones / pts.length;
    if (depth >= maxDepth || ones == 0 || ones == pts.length || pts.length < 2) return TreeNode.leaf(p1, pts.length);
    var best = gini(ones, pts.length) - 1e-12;
    (int, double)? split;
    for (final f in [0, 1]) {
      double v(MlPoint p) => f == 0 ? p.x : p.y;
      final sorted = [...pts]..sort((a, b) => v(a).compareTo(v(b)));
      var leftOnes = 0;
      for (var i = 1; i < sorted.length; i++) {
        if (sorted[i - 1].label == 1) leftOnes++;
        if (v(sorted[i]) == v(sorted[i - 1])) continue;
        final nl = i, nr = sorted.length - i;
        final g = (nl * gini(leftOnes, nl) + nr * gini(ones - leftOnes, nr)) / sorted.length;
        if (g < best) {
          best = g;
          split = (f, (v(sorted[i]) + v(sorted[i - 1])) / 2);
        }
      }
    }
    if (split == null) return TreeNode.leaf(p1, pts.length);
    final (f, t) = split;
    final l = [for (final p in pts) if ((f == 0 ? p.x : p.y) < t) p];
    final r = [for (final p in pts) if ((f == 0 ? p.x : p.y) >= t) p];
    return TreeNode.split(f, t, _grow(l, depth + 1), _grow(r, depth + 1), p1, pts.length);
  }

  int get depth {
    int d(TreeNode n) => n.isLeaf ? 0 : 1 + math.max(d(n.left!), d(n.right!));
    return d(root);
  }

  @override
  double prob1(double x, double y) {
    var n = root;
    while (!n.isLeaf) {
      n = (n.feature == 0 ? x : y) < n.threshold ? n.left! : n.right!;
    }
    return n.p1;
  }
}

/// A small neural network for two classes: 2 inputs → [hidden] tanh neurons → 1 sigmoid output,
/// trained by backpropagation with stochastic gradient descent (points shuffled each epoch with a
/// seeded generator, so the same seed learns the same way).
class TinyMlp extends Classifier {
  TinyMlp(List<MlPoint> pts, {this.hidden = 6, int seed = 1}) : _f = _Features(pts), _pts = [...pts], _rnd = math.Random(seed) {
    final r = math.Random(seed * 7919 + 13);
    double init(int fanIn) => (r.nextDouble() * 2 - 1) * math.sqrt(6 / (fanIn + 1));
    w1 = [for (var j = 0; j < hidden; j++) [init(2), init(2)]];
    b1 = List.filled(hidden, 0.0);
    w2 = [for (var j = 0; j < hidden; j++) init(hidden)];
  }

  final int hidden;
  final _Features _f;
  final List<MlPoint> _pts;
  final math.Random _rnd;
  late List<List<double>> w1;
  late List<double> b1, w2;
  double b2 = 0;
  final loss = <double>[], acc = <double>[];
  int get epochs => loss.length;

  double _out(double u, double v, [List<double>? h]) {
    var z = b2;
    for (var j = 0; j < hidden; j++) {
      final a = _tanh(w1[j][0] * u + w1[j][1] * v + b1[j]);
      h?.add(a);
      z += w2[j] * a;
    }
    return _sigmoid(z);
  }

  @override
  double prob1(double x, double y) {
    final (u, v) = _f.of(x, y);
    return _out(u, v);
  }

  /// One pass over the points.
  void trainEpoch(double lr) {
    final order = [for (var i = 0; i < _pts.length; i++) i]..shuffle(_rnd);
    final h = <double>[];
    for (final i in order) {
      final p = _pts[i];
      final (u, v) = _f.of(p.x, p.y);
      h.clear();
      final o = _out(u, v, h);
      final dz = o - p.label; // cross-entropy through the sigmoid
      for (var j = 0; j < hidden; j++) {
        final dh = dz * w2[j] * (1 - h[j] * h[j]);
        w2[j] -= lr * dz * h[j];
        w1[j][0] -= lr * dh * u;
        w1[j][1] -= lr * dh * v;
        b1[j] -= lr * dh;
      }
      b2 -= lr * dz;
    }
    var s = 0.0;
    var ok = 0;
    for (final p in _pts) {
      final q = prob1(p.x, p.y).clamp(1e-9, 1 - 1e-9);
      s -= p.label == 1 ? math.log(q) : math.log(1 - q);
      if ((q >= 0.5 ? 1 : 0) == p.label) ok++;
    }
    loss.add(_pts.isEmpty ? double.nan : s / _pts.length);
    acc.add(_pts.isEmpty ? double.nan : ok / _pts.length);
  }

  void train(int epochs, {double lr = 0.3}) {
    for (var e = 0; e < epochs; e++) {
      trainEpoch(lr);
    }
  }
}

double _tanh(double v) {
  if (v > 20) return 1;
  if (v < -20) return -1;
  final e = math.exp(2 * v);
  return (e - 1) / (e + 1);
}

// --- Clustering ---------------------------------------------------------------------------------

/// One iteration of k-means: the centroids and which centroid each point belongs to.
class KMeansStep {
  const KMeansStep(this.centroids, this.assign, this.inertia);
  final List<Offset> centroids;
  final List<int> assign;
  final double inertia;
}

/// k-means (Lloyd's algorithm) from a seeded k-means++ start, each iteration kept (assign, then
/// move the centroids) until nothing changes or [maxIter]. Distances are in the data's units, as
/// drawn.
List<KMeansStep> kMeans(List<MlPoint> pts, int k, {int seed = 3, int maxIter = 20}) {
  if (pts.isEmpty) return const [];
  k = math.max(1, math.min(k, pts.length));
  final xs = [for (final p in pts) (p.x, p.y)];
  double d2((double, double) a, (double, double) b) => (a.$1 - b.$1) * (a.$1 - b.$1) + (a.$2 - b.$2) * (a.$2 - b.$2);
  final rnd = math.Random(seed);
  final c = <(double, double)>[xs[rnd.nextInt(xs.length)]];
  while (c.length < k) {
    final w = [for (final x in xs) c.map((q) => d2(x, q)).reduce(math.min)];
    final total = w.fold(0.0, (a, b) => a + b);
    if (total == 0) {
      c.add(xs[rnd.nextInt(xs.length)]);
      continue;
    }
    var t = rnd.nextDouble() * total;
    var i = 0;
    while (i < w.length - 1 && t > w[i]) {
      t -= w[i];
      i++;
    }
    c.add(xs[i]);
  }
  Offset back((double, double) q) => Offset(q.$1, q.$2);
  final steps = <KMeansStep>[];
  List<int>? last;
  for (var it = 0; it < maxIter; it++) {
    final assign = [
      for (final x in xs)
        () {
          var best = 0;
          for (var j = 1; j < c.length; j++) {
            if (d2(x, c[j]) < d2(x, c[best])) best = j;
          }
          return best;
        }(),
    ];
    var inertia = 0.0;
    for (var i = 0; i < xs.length; i++) {
      inertia += d2(xs[i], c[assign[i]]);
    }
    steps.add(KMeansStep([for (final q in c) back(q)], assign, inertia));
    if (last != null && _same(last, assign)) break;
    last = assign;
    for (var j = 0; j < c.length; j++) {
      var sx = 0.0, sy = 0.0, n = 0;
      for (var i = 0; i < xs.length; i++) {
        if (assign[i] == j) {
          sx += xs[i].$1;
          sy += xs[i].$2;
          n++;
        }
      }
      if (n > 0) c[j] = (sx / n, sy / n);
    }
  }
  return steps;
}

bool _same(List<int> a, List<int> b) {
  for (var i = 0; i < a.length; i++) {
    if (a[i] != b[i]) return false;
  }
  return true;
}

/// Evaluates [f] at the centres of a [w] × [h] grid over the box, row by row from the top.
List<double> sampleGrid(double Function(double x, double y) f, double xMin, double xMax, double yMin, double yMax, int w, int h) => [
  for (var r = 0; r < h; r++)
    for (var c = 0; c < w; c++) f(xMin + (c + 0.5) / w * (xMax - xMin), yMax - (r + 0.5) / h * (yMax - yMin)),
];
