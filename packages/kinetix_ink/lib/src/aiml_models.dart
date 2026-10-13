import 'dart:math' as math;
import 'dart:ui';

// The AI and machine learning panels (KitElement): a neural network diagram (layers, neuron
// counts, activations, shapes and parameter counts, with a forward pass worked out with numbers
// on a tiny net) and a snapshot of the ML playground (the points, the model's decision regions
// or fitted curve, its metrics, confusion matrix and loss curve). Both keep their figures in
// KitElement.data. Panel words are in English, as in the textbooks.

enum NnLayerType { input, dense, conv, pool, flatten, dropout, output }

enum NnActivation { none, relu, sigmoid, tanh, softmax, step }

const nnLayerNames = {
  NnLayerType.input: 'Input',
  NnLayerType.dense: 'Dense',
  NnLayerType.conv: 'Conv2D',
  NnLayerType.pool: 'MaxPool',
  NnLayerType.flatten: 'Flatten',
  NnLayerType.dropout: 'Dropout',
  NnLayerType.output: 'Output',
};

const nnActivationNames = {
  NnActivation.none: 'linear',
  NnActivation.relu: 'ReLU',
  NnActivation.sigmoid: 'sigmoid',
  NnActivation.tanh: 'tanh',
  NnActivation.softmax: 'softmax',
  NnActivation.step: 'step',
};

/// One layer. [units] is the neuron count of an input (flat), dense or output layer and the
/// filter count of a convolution; an input with [height] > 0 is an image of [height] × [width] ×
/// [channels]. [kernel] is a convolution's kernel and a pool's size; [rate] a dropout's rate.
class NnLayer {
  NnLayer(this.type, {this.units = 1, this.height = 0, this.width = 0, this.channels = 1, this.kernel = 3, this.stride = 1, this.rate = 0.5, this.activation = NnActivation.none, this.label = ''});

  factory NnLayer.fromJson(Map j) => NnLayer(
    NnLayerType.values.asNameMap()[j['t']] ?? NnLayerType.dense,
    units: _i(j['n'], 1),
    height: _i(j['h'], 0),
    width: _i(j['w'], 0),
    channels: _i(j['c'], 1),
    kernel: _i(j['k'], 3),
    stride: _i(j['s'], 1),
    rate: _d(j['r'], 0.5),
    activation: NnActivation.values.asNameMap()[j['a']] ?? NnActivation.none,
    label: j['l'] is String ? j['l'] as String : '',
  );

  NnLayerType type;
  int units, height, width, channels, kernel, stride;
  double rate;
  NnActivation activation;
  String label;

  bool get isImage => type == NnLayerType.input && height > 0;

  Map<String, Object?> toJson() => {
    't': type.name,
    'n': units,
    if (height > 0) 'h': height,
    if (width > 0) 'w': width,
    if (channels != 1) 'c': channels,
    if (type == NnLayerType.conv || type == NnLayerType.pool) 'k': kernel,
    if (stride != 1) 's': stride,
    if (type == NnLayerType.dropout) 'r': rate,
    if (activation != NnActivation.none) 'a': activation.name,
    if (label.isNotEmpty) 'l': label,
  };

  NnLayer copy() => NnLayer.fromJson(toJson());
}

/// What a layer gives out: its shape ([n] or [h, w, c]) and its trainable parameters; [error]
/// when it cannot follow the layer before it.
class NnShape {
  const NnShape(this.shape, this.params, [this.error]);
  final List<int> shape;
  final int params;
  final String? error;

  int get size => shape.fold(1, (a, b) => a * b);
  bool get isImage => shape.length == 3;

  String get text => shape.length == 3 ? '${shape[0]}×${shape[1]}×${shape[2]}' : '(${shape.join(', ')})';
}

enum NnPreset { perceptron, xorMlp, mnistMlp, lenet, autoencoder }

const nnPresetNames = {
  NnPreset.perceptron: 'Perceptron (AND gate)',
  NnPreset.xorMlp: 'XOR network (2-2-1)',
  NnPreset.mnistMlp: 'MNIST MLP (784-128-64-10)',
  NnPreset.lenet: 'Simple CNN (LeNet)',
  NnPreset.autoencoder: 'Autoencoder (784-64-16-64-784)',
};

/// Largest net worked out with numbers: every layer flat, at most this many neurons each.
const nnTinyUnits = 8;

/// A neural network diagram: its layers, and for a tiny net its weights (one row per neuron,
/// the bias last), an input and how far the forward pass has gone ([step]: -1 none, else the
/// last layer worked out).
class NnModel {
  NnModel({this.title = 'Neural network', List<NnLayer>? layers, List<List<List<double>>?>? weights, List<double>? input, this.step = -1})
    : layers = layers ?? [],
      weights = weights ?? [],
      input = input ?? [];

  factory NnModel.fromJson(Map<String, Object?> j) => NnModel(
    title: j['title'] is String ? j['title'] as String : 'Neural network',
    layers: [for (final l in _list(j['layers'])) if (l is Map) NnLayer.fromJson(l)],
    weights: [
      for (final w in _list(j['w']))
        w is List ? [for (final row in w) if (row is List) [for (final v in row) v is num ? v.toDouble() : 0.0]] : null,
    ],
    input: [for (final v in _list(j['x'])) if (v is num) v.toDouble()],
    step: _i(j['step'], -1),
  );

  factory NnModel.preset(NnPreset p) => switch (p) {
    NnPreset.perceptron => NnModel(
      title: 'Perceptron: AND gate',
      layers: [NnLayer(NnLayerType.input, units: 2, label: 'x₁, x₂'), NnLayer(NnLayerType.output, units: 1, activation: NnActivation.step)],
      weights: [
        null,
        [
          [1, 1, -1.5],
        ],
      ],
      input: [1, 1],
    ),
    NnPreset.xorMlp => NnModel(
      title: 'XOR with one hidden layer',
      layers: [
        NnLayer(NnLayerType.input, units: 2, label: 'x₁, x₂'),
        NnLayer(NnLayerType.dense, units: 2, activation: NnActivation.sigmoid, label: 'OR, NAND'),
        NnLayer(NnLayerType.output, units: 1, activation: NnActivation.sigmoid, label: 'AND'),
      ],
      weights: [
        null,
        [
          [20, 20, -10],
          [-20, -20, 30],
        ],
        [
          [20, 20, -30],
        ],
      ],
      input: [1, 0],
    ),
    NnPreset.mnistMlp => NnModel(
      title: 'MNIST digits: a multilayer perceptron',
      layers: [
        NnLayer(NnLayerType.input, units: 784, label: '28×28 pixels'),
        NnLayer(NnLayerType.dense, units: 128, activation: NnActivation.relu),
        NnLayer(NnLayerType.dropout, rate: 0.2),
        NnLayer(NnLayerType.dense, units: 64, activation: NnActivation.relu),
        NnLayer(NnLayerType.output, units: 10, activation: NnActivation.softmax, label: 'digits 0–9'),
      ],
    ),
    NnPreset.lenet => NnModel(
      title: 'A simple CNN (LeNet-style)',
      layers: [
        NnLayer(NnLayerType.input, height: 28, width: 28, channels: 1, label: 'image'),
        NnLayer(NnLayerType.conv, units: 6, kernel: 5, activation: NnActivation.relu),
        NnLayer(NnLayerType.pool, kernel: 2),
        NnLayer(NnLayerType.conv, units: 16, kernel: 5, activation: NnActivation.relu),
        NnLayer(NnLayerType.pool, kernel: 2),
        NnLayer(NnLayerType.flatten),
        NnLayer(NnLayerType.dense, units: 120, activation: NnActivation.relu),
        NnLayer(NnLayerType.dense, units: 84, activation: NnActivation.relu),
        NnLayer(NnLayerType.output, units: 10, activation: NnActivation.softmax),
      ],
    ),
    NnPreset.autoencoder => NnModel(
      title: 'An autoencoder',
      layers: [
        NnLayer(NnLayerType.input, units: 784, label: 'image'),
        NnLayer(NnLayerType.dense, units: 64, activation: NnActivation.relu, label: 'encoder'),
        NnLayer(NnLayerType.dense, units: 16, activation: NnActivation.relu, label: 'code'),
        NnLayer(NnLayerType.dense, units: 64, activation: NnActivation.relu, label: 'decoder'),
        NnLayer(NnLayerType.output, units: 784, activation: NnActivation.sigmoid, label: 'rebuilt image'),
      ],
    ),
  };

  String title;
  final List<NnLayer> layers;

  /// Per layer: for a dense or output layer of a tiny net, one row per neuron (weights, then the
  /// bias); null for the others.
  final List<List<List<double>>?> weights;
  final List<double> input;
  int step;

  Map<String, Object?> toJson() => {
    'title': title,
    'layers': [for (final l in layers) l.toJson()],
    if (weights.any((w) => w != null)) 'w': [for (final w in weights) w],
    if (input.isNotEmpty) 'x': input,
    if (step >= 0) 'step': step,
  };

  NnModel copy() => NnModel.fromJson(toJson());

  /// Each layer's output shape and parameters.
  List<NnShape> shapes() {
    final out = <NnShape>[];
    List<int>? prev;
    for (final l in layers) {
      final NnShape s;
      if (prev == null || l.type == NnLayerType.input) {
        s = l.isImage ? NnShape([l.height, math.max(1, l.width), math.max(1, l.channels)], 0) : NnShape([math.max(1, l.units)], 0);
      } else {
        final p = prev;
        final flat = p.fold(1, (a, b) => a * b);
        switch (l.type) {
          case NnLayerType.dense || NnLayerType.output:
            final n = math.max(1, l.units);
            s = NnShape([n], flat * n + n);
          case NnLayerType.conv:
            if (p.length != 3) {
              s = NnShape(p, 0, 'Conv2D needs an image (h×w×c) before it');
            } else {
              final k = math.max(1, l.kernel), st = math.max(1, l.stride), f = math.max(1, l.units);
              final h = (p[0] - k) ~/ st + 1, w = (p[1] - k) ~/ st + 1;
              s = h < 1 || w < 1 ? NnShape(p, 0, 'kernel $k is bigger than the ${p[0]}×${p[1]} input') : NnShape([h, w, f], k * k * p[2] * f + f);
            }
          case NnLayerType.pool:
            final k = math.max(1, l.kernel);
            if (p.length != 3) {
              s = NnShape(p, 0, 'MaxPool needs an image (h×w×c) before it');
            } else {
              final h = p[0] ~/ k, w = p[1] ~/ k;
              s = h < 1 || w < 1 ? NnShape(p, 0, 'pool $k is bigger than the input') : NnShape([h, w, p[2]], 0);
            }
          case NnLayerType.flatten:
            s = NnShape([flat], 0);
          case NnLayerType.dropout || NnLayerType.input:
            s = NnShape(p, 0);
        }
      }
      out.add(s);
      prev = s.shape;
    }
    return out;
  }

  int get totalParams => shapes().fold(0, (a, s) => a + s.params);

  /// Small enough to work out with numbers: flat layers of at most [nnTinyUnits] neurons.
  bool get tiny =>
      layers.length >= 2 &&
      layers.length <= 6 &&
      layers.first.type == NnLayerType.input &&
      !layers.first.isImage &&
      layers.every((l) => l.type == NnLayerType.input && l == layers.first || l.type == NnLayerType.dense || l.type == NnLayerType.output || l.type == NnLayerType.dropout) &&
      shapes().every((s) => s.shape.length == 1 && s.shape.first <= nnTinyUnits);

  bool _fits(int i) {
    final l = layers[i];
    if (l.type != NnLayerType.dense && l.type != NnLayerType.output) return true;
    final w = i < weights.length ? weights[i] : null;
    final inputs = shapes()[i - 1].size;
    return w != null && w.length == l.units && w.every((r) => r.length == inputs + 1);
  }

  /// Gives a tiny net weights where a layer has none or they no longer fit (after an edit):
  /// small seeded numbers, rounded to read on the board. Also fits [input] to the input layer.
  void ensureWeights({int seed = 7}) {
    if (!tiny) return;
    final rnd = math.Random(seed);
    while (weights.length < layers.length) {
      weights.add(null);
    }
    weights.length = layers.length;
    final sh = shapes();
    for (var i = 0; i < layers.length; i++) {
      final l = layers[i];
      if (l.type != NnLayerType.dense && l.type != NnLayerType.output) {
        weights[i] = null;
        continue;
      }
      if (_fits(i)) continue;
      final inputs = sh[i - 1].size;
      weights[i] = [
        for (var j = 0; j < l.units; j++) [for (var k = 0; k <= inputs; k++) ((rnd.nextDouble() * 2 - 1) * 10).roundToDouble() / 10],
      ];
    }
    final n = sh.first.size;
    if (input.length != n) {
      final old = [...input];
      input
        ..clear()
        ..addAll([for (var i = 0; i < n; i++) i < old.length ? old[i] : 1.0]);
    }
  }

  /// The forward pass of a tiny net: every layer's weighted sums (z, before the activation; the
  /// input's own values for the input layer) and outputs. Null when the net is not tiny or has no
  /// fitting weights.
  ({List<List<double>> z, List<List<double>> a})? forward([List<double>? x]) {
    if (!tiny) return null;
    for (var i = 1; i < layers.length; i++) {
      if (!_fits(i)) return null;
    }
    var a = [...(x ?? input)];
    if (a.length != shapes().first.size) return null;
    final zs = <List<double>>[a], as = <List<double>>[a];
    for (var i = 1; i < layers.length; i++) {
      final l = layers[i];
      if (l.type == NnLayerType.dropout) {
        zs.add(a);
        as.add(a); // at inference, dropout passes everything through
        continue;
      }
      final w = weights[i]!;
      final z = [
        for (final row in w)
          () {
            var s = row.last;
            for (var k = 0; k < a.length; k++) {
              s += row[k] * a[k];
            }
            return s;
          }(),
      ];
      a = activate(l.activation, z);
      zs.add(z);
      as.add(a);
    }
    return (z: zs, a: as);
  }
}

/// [f] applied to a layer's weighted sums.
List<double> activate(NnActivation f, List<double> z) {
  switch (f) {
    case NnActivation.softmax:
      final m = z.fold(double.negativeInfinity, math.max);
      final e = [for (final v in z) math.exp(v - m)];
      final s = e.fold(0.0, (a, b) => a + b);
      return [for (final v in e) v / s];
    case NnActivation.relu:
      return [for (final v in z) math.max(0, v)];
    case NnActivation.sigmoid:
      return [for (final v in z) 1 / (1 + math.exp(-v))];
    case NnActivation.tanh:
      return [for (final v in z) _tanh(v)];
    case NnActivation.step:
      return [for (final v in z) v >= 0 ? 1.0 : 0.0];
    case NnActivation.none:
      return [...z];
  }
}

double _tanh(double v) {
  if (v > 20) return 1;
  if (v < -20) return -1;
  final e = math.exp(2 * v);
  return (e - 1) / (e + 1);
}

/// 109386 → "109,386".
String groupThousands(int n) {
  final s = n.abs().toString();
  final b = StringBuffer(n < 0 ? '-' : '');
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) b.write(',');
    b.write(s[i]);
  }
  return b.toString();
}

// --- ML playground snapshot ---------------------------------------------------------------------

enum MlTask { classify, regress, cluster }

/// A point of the playground: [label] 0 or 1 for a class, -1 when it has none.
class MlPoint {
  const MlPoint(this.x, this.y, [this.label = -1]);
  final double x, y;
  final int label;

  List<num> toJson() => [x, y, label];
  static MlPoint fromJson(Object? j) {
    final l = j is List ? j : const [];
    double at(int i) => i < l.length && l[i] is num ? (l[i] as num).toDouble() : 0;
    return MlPoint(at(0), at(1), l.length > 2 && l[2] is num ? (l[2] as num).toInt() : -1);
  }
}

/// The playground as it was put on the board: the data, what the model made of it (a grid of
/// decision values over the plot, a fitted curve, centroids), its metrics and curves, and the
/// settings that reopen it in the playground ([settings]).
class MlSnapshot {
  MlSnapshot({
    this.title = 'Machine learning',
    this.task = MlTask.classify,
    this.model = '',
    this.details = '',
    this.xMin = -1,
    this.xMax = 1,
    this.yMin = -1,
    this.yMax = 1,
    this.xLabel = 'x',
    this.yLabel = 'y',
    List<MlPoint>? points,
    this.gridW = 0,
    this.gridH = 0,
    List<double>? grid,
    List<Offset>? curve,
    List<Offset>? curve2,
    List<Offset>? centroids,
    List<double>? loss,
    List<double>? acc,
    Map<String, double>? metrics,
    this.confusion,
    Map<String, Object?>? settings,
  }) : points = points ?? [],
       grid = grid ?? [],
       curve = curve ?? [],
       curve2 = curve2 ?? [],
       centroids = centroids ?? [],
       loss = loss ?? [],
       acc = acc ?? [],
       metrics = metrics ?? {},
       settings = settings ?? {};

  factory MlSnapshot.fromJson(Map<String, Object?> j) {
    List<Offset> offsets(Object? v) => [
      for (final p in _list(v))
        if (p is List && p.length >= 2 && p[0] is num && p[1] is num) Offset((p[0] as num).toDouble(), (p[1] as num).toDouble()),
    ];
    List<double> doubles(Object? v) => [for (final x in _list(v)) x is num ? x.toDouble() : double.nan];
    final m = j['metrics'];
    final cm = j['cm'];
    return MlSnapshot(
      title: j['title'] is String ? j['title'] as String : 'Machine learning',
      task: MlTask.values.asNameMap()[j['task']] ?? MlTask.classify,
      model: j['model'] is String ? j['model'] as String : '',
      details: j['details'] is String ? j['details'] as String : '',
      xMin: _d(j['x0'], -1),
      xMax: _d(j['x1'], 1),
      yMin: _d(j['y0'], -1),
      yMax: _d(j['y1'], 1),
      xLabel: j['xl'] is String ? j['xl'] as String : 'x',
      yLabel: j['yl'] is String ? j['yl'] as String : 'y',
      points: [for (final p in _list(j['pts'])) MlPoint.fromJson(p)],
      gridW: _i(j['gw'], 0),
      gridH: _i(j['gh'], 0),
      grid: doubles(j['grid']),
      curve: offsets(j['curve']),
      curve2: offsets(j['curve2']),
      centroids: offsets(j['cent']),
      loss: doubles(j['loss']),
      acc: doubles(j['acc']),
      metrics: {if (m is Map) for (final e in m.entries) if (e.key is String && e.value is num) e.key as String: (e.value as num).toDouble()},
      confusion: cm is List ? [for (final r in cm) if (r is List) [for (final v in r) v is num ? v.toInt() : 0]] : null,
      settings: j['set'] is Map ? Map<String, Object?>.from(j['set'] as Map) : {},
    );
  }

  String title, model, details, xLabel, yLabel;
  MlTask task;
  double xMin, xMax, yMin, yMax;
  final List<MlPoint> points;
  int gridW, gridH;

  /// Row by row from the top: a class 1 probability (classify) or a cluster number (cluster).
  final List<double> grid;
  final List<Offset> curve, curve2, centroids;
  final List<double> loss, acc;
  final Map<String, double> metrics;
  List<List<int>>? confusion;
  final Map<String, Object?> settings;

  static double _r(double v) => double.parse(v.toStringAsPrecision(5));
  static List<double> _o(Offset o) => [_r(o.dx), _r(o.dy)];

  Map<String, Object?> toJson() => {
    'title': title,
    'task': task.name,
    'model': model,
    if (details.isNotEmpty) 'details': details,
    'x0': xMin,
    'x1': xMax,
    'y0': yMin,
    'y1': yMax,
    'xl': xLabel,
    'yl': yLabel,
    'pts': [for (final p in points) [_r(p.x), _r(p.y), p.label]],
    if (grid.isNotEmpty) ...{'gw': gridW, 'gh': gridH, 'grid': [for (final v in grid) double.parse(v.toStringAsFixed(3))]},
    if (curve.isNotEmpty) 'curve': [for (final o in curve) _o(o)],
    if (curve2.isNotEmpty) 'curve2': [for (final o in curve2) _o(o)],
    if (centroids.isNotEmpty) 'cent': [for (final o in centroids) _o(o)],
    if (loss.isNotEmpty) 'loss': [for (final v in loss) _r(v)],
    if (acc.isNotEmpty) 'acc': [for (final v in acc) _r(v)],
    if (metrics.isNotEmpty) 'metrics': {for (final e in metrics.entries) e.key: _r(e.value)},
    'cm': ?confusion,
    if (settings.isNotEmpty) 'set': settings,
  };
}

int _i(Object? v, int fallback) => v is num && v.isFinite ? v.toInt() : fallback;
double _d(Object? v, double fallback) => v is num && v.isFinite ? v.toDouble() : fallback;
List<Object?> _list(Object? v) => v is List ? v : const [];
