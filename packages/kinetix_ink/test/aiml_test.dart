import 'dart:convert';
import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

/// The AI panels: neural network shapes, parameter counts and the forward pass, the ML
/// playground snapshot, saving and drawing.
void main() {
  group('neural network diagram', () {
    test('parameter counts of the ready networks match the textbook (Keras) figures', () {
      expect(NnModel.preset(NnPreset.perceptron).totalParams, 3);
      expect(NnModel.preset(NnPreset.xorMlp).totalParams, 9);
      final mnist = NnModel.preset(NnPreset.mnistMlp);
      expect([for (final s in mnist.shapes()) s.params], [0, 100480, 0, 8256, 650]);
      expect(mnist.totalParams, 109386);
      final lenet = NnModel.preset(NnPreset.lenet);
      expect([for (final s in lenet.shapes()) s.text], ['28×28×1', '24×24×6', '12×12×6', '8×8×16', '4×4×16', '(256)', '(120)', '(84)', '(10)']);
      expect([for (final s in lenet.shapes()) s.params], [0, 156, 0, 2416, 0, 0, 30840, 10164, 850]);
      expect(lenet.totalParams, 44426);
      expect(NnModel.preset(NnPreset.autoencoder).totalParams, 103328);
      expect(groupThousands(109386), '109,386');
    });

    test('impossible layers say why: a convolution after a flat layer, a kernel too big', () {
      final m = NnModel(layers: [NnLayer(NnLayerType.input, units: 10), NnLayer(NnLayerType.conv, units: 4)]);
      expect(m.shapes()[1].error, contains('image'));
      final big = NnModel(layers: [NnLayer(NnLayerType.input, height: 4, width: 4), NnLayer(NnLayerType.conv, units: 2, kernel: 5)]);
      expect(big.shapes()[1].error, contains('bigger'));
      final stride = NnModel(layers: [NnLayer(NnLayerType.input, height: 32, width: 32, channels: 3), NnLayer(NnLayerType.conv, units: 8, kernel: 3, stride: 2)]);
      expect(stride.shapes()[1].shape, [15, 15, 8]);
      expect(stride.shapes()[1].params, 3 * 3 * 3 * 8 + 8);
    });

    test('forward pass: the perceptron is an AND gate and the 2-2-1 network computes XOR', () {
      final and = NnModel.preset(NnPreset.perceptron);
      expect(and.tiny, isTrue);
      expect([for (final x in [[0.0, 0.0], [0.0, 1.0], [1.0, 0.0], [1.0, 1.0]]) and.forward(x)!.a.last.single], [0, 0, 0, 1]);
      final xor = NnModel.preset(NnPreset.xorMlp);
      final f = xor.forward([1, 0])!;
      expect(f.z[1], [10, 10]);
      expect(f.a[1][0], closeTo(0.9999546, 1e-6));
      expect(f.z[2].single, closeTo(20 * 0.9999546 * 2 - 30, 1e-3));
      expect(f.a[2].single, closeTo(0.99995, 1e-4));
      for (final (x, y) in [([0.0, 0.0], 0), ([0.0, 1.0], 1), ([1.0, 0.0], 1), ([1.0, 1.0], 0)]) {
        expect(xor.forward(x)!.a.last.single.round(), y, reason: '$x');
      }
      expect(NnModel.preset(NnPreset.mnistMlp).forward(), isNull, reason: 'too big for numbers');
    });

    test('softmax sums to 1; an edited tiny net gets fitting weights and inputs', () {
      final p = activate(NnActivation.softmax, [1, 2, 3]);
      expect(p.fold(0.0, (a, b) => a + b), closeTo(1, 1e-12));
      expect(p[2], closeTo(0.66524, 1e-4));
      final m = NnModel.preset(NnPreset.xorMlp);
      m.layers.insert(2, NnLayer(NnLayerType.dense, units: 3, activation: NnActivation.relu));
      m.weights.insert(2, null);
      expect(m.forward(), isNull);
      m.ensureWeights();
      expect(m.weights[2]!.length, 3);
      expect(m.weights[3]!.single.length, 4, reason: 'output re-fitted to 3 inputs + bias');
      expect(m.forward(), isNotNull);
      m.layers.first.units = 3;
      m.ensureWeights();
      expect(m.input.length, 3);
    });

    test('saves and loads with the board', () {
      final m = NnModel.preset(NnPreset.xorMlp)..step = 1;
      final k = KitElement.sized(kind: KitKind.nnDiagram, data: m.toJson(), color: const Color(0xFF4A5A9C));
      final back = decodeElement(jsonDecode(jsonEncode(encodeElement(k))) as Map<String, dynamic>, 'x')! as KitElement;
      expect(back.kind, KitKind.nnDiagram);
      final m2 = NnModel.fromJson(back.data);
      expect(m2.step, 1);
      expect(m2.weights[1], m.weights[1]);
      expect(m2.layers.map((l) => l.activation), m.layers.map((l) => l.activation));
      expect(m2.forward()!.a.last.single, closeTo(0.99995, 1e-4));
    });
  });

  group('ML snapshot', () {
    test('round-trips its points, grid, curves, metrics and settings', () {
      final s = MlSnapshot(
        title: 'Iris',
        model: 'Logistic regression',
        points: const [MlPoint(1, 2, 0), MlPoint(3, 4, 1)],
        gridW: 2,
        gridH: 1,
        grid: [0.1, 0.9],
        curve: const [Offset(0, 0), Offset(1, 1)],
        loss: [0.7, 0.5],
        metrics: {'accuracy': 1},
        confusion: [
          [1, 0],
          [0, 1],
        ],
        settings: {'model': 'logistic'},
      );
      final back = MlSnapshot.fromJson(jsonDecode(jsonEncode(s.toJson())) as Map<String, Object?>);
      expect(back.points.map((p) => p.label), [0, 1]);
      expect(back.grid, [0.1, 0.9]);
      expect(back.curve.last, const Offset(1, 1));
      expect(back.metrics['accuracy'], 1);
      expect(back.confusion, [
        [1, 0],
        [0, 1],
      ]);
      expect(back.settings['model'], 'logistic');
      final plot = mlPlotRect(const Size(1240, 820));
      final p = mlToPlot(back, plot, 0.25, -0.5);
      expect(mlFromPlot(back, plot, p).dx, closeTo(0.25, 1e-9));
    });
  });

  test('every AI panel draws without throwing', () {
    final recorder = PictureRecorder();
    final canvas = Canvas(recorder);
    for (final p in NnPreset.values) {
      // Straight to the painters (paintKit would hide a throw behind its placeholder).
      paintNnDiagram(canvas, NnModel.fromJson((NnModel.preset(p)..step = 1).toJson()), const Size(1240, 820), const Color(0xFF4A5A9C));
    }
    paintNnDiagram(canvas, NnModel(), const Size(1240, 820), const Color(0xFF4A5A9C));
    final snap = MlSnapshot(task: MlTask.cluster, points: const [MlPoint(0, 0)], centroids: const [Offset(0, 0)], gridW: 1, gridH: 1, grid: [0], loss: [3, 2, 1]);
    paintMlSnapshot(canvas, MlSnapshot.fromJson(snap.toJson()), const Size(1240, 820), const Color(0xFF4A5A9C));
    paintMlSnapshot(
      canvas,
      MlSnapshot(points: const [MlPoint(0, 0, 1)], gridW: 1, gridH: 1, grid: [0.7], acc: [0.5, 1], loss: [1, 0.2], metrics: {'accuracy': 1}, confusion: [[1, 0], [0, 1]], details: 'lr 0.3'),
      const Size(1240, 820),
      const Color(0xFF4A5A9C),
    );
    recorder.endRecording().dispose();
  });
}
