import 'dart:math' as math;
import 'dart:ui' show Offset;

import 'package:kinetix_ink/kinetix_ink.dart';

import 'ml_algorithms.dart';

// The playground's bundled data (all on the board): two-class sets generated from a seed (blobs,
// two moons, circles, XOR), a real subset of Fisher's Iris data, points for regression (a line,
// a curve, house prices) and unlabelled groups for clustering; then running the chosen model
// on the points to a snapshot the board draws.

enum MlDataset { blobs, moons, circles, xor, iris, line, curve, house, groups, blank }

enum MlModel { linear, polynomial, logistic, perceptron, knn, tree, mlp, kmeans }

MlTask datasetTask(MlDataset d) => switch (d) {
  MlDataset.line || MlDataset.curve || MlDataset.house => MlTask.regress,
  MlDataset.groups => MlTask.cluster,
  _ => MlTask.classify,
};

/// The models a dataset's points suit (the first is the one it opens with).
List<MlModel> modelsFor(MlTask t) => switch (t) {
  MlTask.regress => const [MlModel.linear, MlModel.polynomial],
  MlTask.classify => const [MlModel.logistic, MlModel.perceptron, MlModel.knn, MlModel.tree, MlModel.mlp, MlModel.kmeans],
  MlTask.cluster => const [MlModel.kmeans],
};

const mlModelNames = {
  MlModel.linear: 'Linear regression',
  MlModel.polynomial: 'Polynomial regression',
  MlModel.logistic: 'Logistic regression',
  MlModel.perceptron: 'Perceptron',
  MlModel.knn: 'k-nearest neighbours',
  MlModel.tree: 'Decision tree',
  MlModel.mlp: 'Neural network (MLP)',
  MlModel.kmeans: 'k-means clustering',
};

/// A dataset's frame: the plot's box and axis names.
class MlFrame {
  const MlFrame(this.xMin, this.xMax, this.yMin, this.yMax, [this.xLabel = 'x₁', this.yLabel = 'x₂']);
  final double xMin, xMax, yMin, yMax;
  final String xLabel, yLabel;
}

MlFrame frameOf(MlDataset d) => switch (d) {
  MlDataset.iris => const MlFrame(3, 7, 0.8, 2.8, 'petal length (cm)', 'petal width (cm)'),
  MlDataset.line => const MlFrame(0, 10, 0, 25, 'x', 'y'),
  MlDataset.curve => const MlFrame(-3, 3, -6, 6, 'x', 'y'),
  MlDataset.house => const MlFrame(400, 2600, 0, 160, 'area (sq ft)', 'price (₹ lakh)'),
  _ => const MlFrame(-3, 3, -3, 3),
};

/// Fisher's Iris data (1936), petals of the first 15 Iris versicolor (class 0) and Iris
/// virginica (class 1) flowers.
const irisPetals = <(double, double, int)>[
  (4.7, 1.4, 0), (4.5, 1.5, 0), (4.9, 1.5, 0), (4.0, 1.3, 0), (4.6, 1.5, 0), (4.5, 1.3, 0), (4.7, 1.6, 0), (3.3, 1.0, 0), //
  (4.6, 1.3, 0), (3.9, 1.4, 0), (3.5, 1.0, 0), (4.2, 1.5, 0), (4.0, 1.0, 0), (4.7, 1.4, 0), (3.6, 1.3, 0),
  (6.0, 2.5, 1), (5.1, 1.9, 1), (5.9, 2.1, 1), (5.6, 1.8, 1), (5.8, 2.2, 1), (6.6, 2.1, 1), (4.5, 1.7, 1), (6.3, 1.8, 1),
  (5.8, 1.8, 1), (6.1, 2.5, 1), (5.1, 2.0, 1), (5.3, 1.9, 1), (5.5, 2.1, 1), (5.0, 2.0, 1), (5.1, 2.4, 1),
];

double _gauss(math.Random r) {
  final u = math.max(1e-12, r.nextDouble()), v = r.nextDouble();
  return math.sqrt(-2 * math.log(u)) * math.cos(2 * math.pi * v);
}

/// The dataset's points, the same every time for the same [seed].
List<MlPoint> datasetPoints(MlDataset d, {int seed = 42}) {
  final r = math.Random(seed);
  double n(double s) => _gauss(r) * s;
  switch (d) {
    case MlDataset.blobs:
      return [for (var i = 0; i < 40; i++) i < 20 ? MlPoint(-1.2 + n(0.6), -0.8 + n(0.6), 0) : MlPoint(1.1 + n(0.6), 1.0 + n(0.6), 1)];
    case MlDataset.moons:
      return [
        for (var i = 0; i < 60; i++)
          () {
            final t = math.pi * (i % 30) / 29;
            return i < 30 ? MlPoint(math.cos(t) * 1.6 - 0.8 + n(0.15), math.sin(t) * 1.6 - 0.5 + n(0.15), 0) : MlPoint(0.8 - math.cos(t) * 1.6 + n(0.15), 0.5 - math.sin(t) * 1.6 + n(0.15), 1);
          }(),
      ];
    case MlDataset.circles:
      return [
        for (var i = 0; i < 60; i++)
          () {
            final t = 2 * math.pi * r.nextDouble();
            final rad = i < 30 ? 0.8 + n(0.15) : 2.1 + n(0.15);
            return MlPoint(rad * math.cos(t), rad * math.sin(t), i < 30 ? 0 : 1);
          }(),
      ];
    case MlDataset.xor:
      return [
        for (var i = 0; i < 48; i++)
          () {
            final sx = i % 2 == 0 ? 1.0 : -1.0, sy = (i ~/ 2) % 2 == 0 ? 1.0 : -1.0;
            return MlPoint(sx * (0.4 + r.nextDouble() * 2.2), sy * (0.4 + r.nextDouble() * 2.2), sx * sy > 0 ? 0 : 1);
          }(),
      ];
    case MlDataset.iris:
      return [for (final (x, y, c) in irisPetals) MlPoint(x, y, c)];
    case MlDataset.line:
      return [
        for (var i = 0; i < 20; i++)
          () {
            final x = 0.5 + i * 0.47;
            return MlPoint(x, 2 * x + 1 + n(1.6));
          }(),
      ];
    case MlDataset.curve:
      return [
        for (var i = 0; i < 24; i++)
          () {
            final x = -2.6 + i * 5.2 / 23;
            return MlPoint(x, 0.5 * x * x * x - 2 * x + n(0.5));
          }(),
      ];
    case MlDataset.house:
      return [
        for (var i = 0; i < 24; i++)
          () {
            final a = 550 + r.nextDouble() * 1850;
            return MlPoint(a.roundToDouble(), (12 + 0.055 * a + n(9)).clamp(5.0, 155.0));
          }(),
      ];
    case MlDataset.groups:
      const centres = [(-1.6, -1.2), (1.4, -1.0), (0.0, 1.6)];
      return [for (var i = 0; i < 45; i++) MlPoint(centres[i % 3].$1 + n(0.45), centres[i % 3].$2 + n(0.45))];
    case MlDataset.blank:
      return [];
  }
}

/// What the teacher set in the playground (saved with the snapshot to open it again).
class MlSettings {
  MlSettings({
    this.dataset = MlDataset.blobs,
    this.model = MlModel.logistic,
    this.lr = 0.3,
    this.epochs = 200,
    this.k = 5,
    this.depth = 3,
    this.hidden = 6,
    this.degree = 3,
    this.clusters = 3,
    this.seed = 1,
  });

  factory MlSettings.fromJson(Map<String, Object?> j) {
    int i(String k, int f) => j[k] is num ? (j[k] as num).toInt() : f;
    return MlSettings(
      dataset: MlDataset.values.asNameMap()[j['data']] ?? MlDataset.blobs,
      model: MlModel.values.asNameMap()[j['model']] ?? MlModel.logistic,
      lr: j['lr'] is num ? (j['lr'] as num).toDouble() : 0.3,
      epochs: i('epochs', 200),
      k: i('k', 5),
      depth: i('depth', 3),
      hidden: i('hidden', 6),
      degree: i('degree', 3),
      clusters: i('clusters', 3),
      seed: i('seed', 1),
    );
  }

  MlDataset dataset;
  MlModel model;
  double lr;
  int epochs, k, depth, hidden, degree, clusters, seed;

  Map<String, Object?> toJson() => {
    'data': dataset.name,
    'model': model.name,
    'lr': lr,
    'epochs': epochs,
    'k': k,
    'depth': depth,
    'hidden': hidden,
    'degree': degree,
    'clusters': clusters,
    'seed': seed,
  };

  String get details => switch (model) {
    MlModel.linear => 'closed form (line) vs gradient descent (dashed) · lr ${_n(lr)} · $epochs epochs',
    MlModel.polynomial => 'degree $degree · least squares',
    MlModel.logistic => 'gradient descent · lr ${_n(lr)} · $epochs epochs',
    MlModel.perceptron => 'perceptron rule · lr ${_n(lr)} · $epochs epochs',
    MlModel.knn => 'k = $k',
    MlModel.tree => 'Gini · max depth $depth',
    MlModel.mlp => '2 → $hidden tanh → 1 sigmoid · lr ${_n(lr)} · $epochs epochs',
    MlModel.kmeans => 'k = $clusters',
  };
}

String _n(double v) => double.parse(v.toStringAsPrecision(3)).toString();

const _gridW = 60, _gridH = 40;

/// Runs [s]'s model on [pts] and gives the snapshot to draw: for a neural network, [mlp] (already
/// trained, as far as the live training has got) when given, else one trained to [MlSettings.epochs]
/// here; for k-means, iteration [kmeansStep] (the last when null).
MlSnapshot runPlayground(MlSettings s, List<MlPoint> pts, {String title = 'Machine learning', TinyMlp? mlp, int? kmeansStep}) {
  final f = frameOf(s.dataset);
  final task = s.model == MlModel.kmeans ? MlTask.cluster : (s.model == MlModel.linear || s.model == MlModel.polynomial ? MlTask.regress : MlTask.classify);
  final snap = MlSnapshot(
    title: title,
    task: task,
    model: mlModelNames[s.model]!,
    details: s.details,
    xMin: f.xMin,
    xMax: f.xMax,
    yMin: f.yMin,
    yMax: f.yMax,
    xLabel: f.xLabel,
    yLabel: f.yLabel,
    points: pts,
    settings: s.toJson(),
  );
  List<Offset> sampleCurve(double Function(double) g) => [for (var i = 0; i <= 120; i++) Offset(f.xMin + (f.xMax - f.xMin) * i / 120, g(f.xMin + (f.xMax - f.xMin) * i / 120))];
  final ys = [for (final p in pts) p.y];
  switch (s.model) {
    case MlModel.linear:
      if (pts.length < 2) break;
      final cf = linearClosedForm(pts);
      final gd = linearGradientDescent(pts, lr: s.lr, epochs: s.epochs);
      snap
        ..curve.addAll(sampleCurve(cf.predict))
        ..curve2.addAll(sampleCurve(gd.fit.predict))
        ..loss.addAll(_thin(gd.loss))
        ..metrics.addAll({'mse': meanSquaredError(ys, [for (final p in pts) cf.predict(p.x)]), 'r2': rSquared(ys, [for (final p in pts) cf.predict(p.x)])})
        ..details = 'y = ${_n(cf.intercept)} + ${_n(cf.slope)}·x  ·  ${s.details}';
    case MlModel.polynomial:
      if (pts.length < 2) break;
      final pf = polyFit(pts, s.degree);
      final pred = [for (final p in pts) pf.predict(p.x)];
      snap
        ..curve.addAll(sampleCurve(pf.predict))
        ..metrics.addAll({'mse': meanSquaredError(ys, pred), 'r2': rSquared(ys, pred)});
    case MlModel.kmeans:
      final steps = kMeans(pts, s.clusters, seed: s.seed);
      if (steps.isEmpty) break;
      final st = steps[(kmeansStep ?? steps.length - 1).clamp(0, steps.length - 1)];
      snap
        ..centroids.addAll(st.centroids)
        ..gridW = _gridW
        ..gridH = _gridH
        ..grid.addAll(sampleGrid((x, y) {
          var best = 0;
          for (var j = 1; j < st.centroids.length; j++) {
            if ((st.centroids[j] - Offset(x, y)).distanceSquared < (st.centroids[best] - Offset(x, y)).distanceSquared) best = j;
          }
          return best.toDouble();
        }, f.xMin, f.xMax, f.yMin, f.yMax, _gridW, _gridH))
        ..loss.addAll([for (final x in steps.take((kmeansStep ?? steps.length - 1) + 1)) x.inertia])
        ..metrics['inertia'] = st.inertia
        ..details = 'k = ${s.clusters} · iteration ${steps.indexOf(st) + 1} of ${steps.length}';
    case MlModel.logistic || MlModel.perceptron || MlModel.knn || MlModel.tree || MlModel.mlp:
      final labelled = [for (final p in pts) if (p.label >= 0) p];
      if (labelled.isEmpty) break;
      final Classifier c;
      List<double> loss = const [], acc = const [];
      switch (s.model) {
        case MlModel.logistic:
          final m = LogisticRegression.train(labelled, lr: s.lr, epochs: s.epochs);
          (c, loss, acc) = (m, m.loss, m.acc);
          if (m.boundary(f.xMin, f.xMax) case (final a, final b)) snap.curve.addAll([a, b]);
        case MlModel.perceptron:
          final m = Perceptron.train(labelled, lr: s.lr, epochs: s.epochs);
          (c, loss, acc) = (m, m.loss, m.acc);
        case MlModel.knn:
          c = KNearest(labelled, s.k);
        case MlModel.tree:
          c = DecisionTree.train(labelled, maxDepth: s.depth);
        default:
          final m = mlp ?? (TinyMlp(labelled, hidden: s.hidden, seed: s.seed)..train(s.epochs, lr: s.lr));
          (c, loss, acc) = (m, m.loss, m.acc);
      }
      final actual = [for (final p in labelled) p.label], predicted = [for (final p in labelled) c.predict(p.x, p.y)];
      snap
        ..gridW = _gridW
        ..gridH = _gridH
        ..grid.addAll(sampleGrid(c.prob1, f.xMin, f.xMax, f.yMin, f.yMax, _gridW, _gridH))
        ..loss.addAll(_thin(loss))
        ..acc.addAll(_thin(acc))
        ..metrics['accuracy'] = accuracyOf(actual, predicted)
        ..confusion = confusionMatrix(actual, predicted);
  }
  return snap;
}

/// At most [n] values of a long curve, evenly picked (the last kept), for the snapshot.
List<double> _thin(List<double> v, [int n = 200]) {
  if (v.length <= n) return v;
  return [for (var i = 0; i < n; i++) v[((v.length - 1) * i / (n - 1)).round()]];
}
