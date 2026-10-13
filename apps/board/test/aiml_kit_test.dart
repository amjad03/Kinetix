import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kinetix_board/features/board/kit/aiml/aiml_kit.dart';
import 'package:kinetix_board/features/board/kit/aiml/aiml_strings.dart';
import 'package:kinetix_board/features/board/kit/aiml/digit_demo.dart';
import 'package:kinetix_board/features/board/kit/aiml/digit_model.dart';
import 'package:kinetix_board/features/board/kit/aiml/inference_backend.dart';
import 'package:kinetix_board/features/board/kit/aiml/ml_algorithms.dart';
import 'package:kinetix_board/features/board/kit/aiml/ml_datasets.dart';
import 'package:kinetix_board/features/board/kit/college/biz/kit_editors.dart';
import 'package:kinetix_board/features/curriculum/curriculum_registry.dart';
import 'package:kinetix_board/l10n/l10n.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

const accent = Color(0xFF4A5A9C);

/// The AI and machine learning kit: the playground's algorithms against known answers, the
/// neural network that learns XOR, the digit recogniser trained on the board, the AI box seam,
/// the kit's panels on the board and where the registry puts them.
void main() {
  test('Hindi and Kannada have every English key', () {
    final en = aimlStringTable['en']!.keys.toSet();
    for (final lang in ['hi', 'kn']) {
      expect(aimlStringTable[lang]!.keys.toSet(), en, reason: lang);
      expect(aimlStringTable[lang]!.values.every((v) => v.trim().isNotEmpty), isTrue);
    }
    for (final d in MlDataset.values) {
      expect(en, contains('data.${d.name}'));
    }
    for (final m in MlModel.values) {
      expect(en, contains('model.${m.name}'));
    }
  });

  group('algorithms', () {
    test('linear regression: closed form is exact on a line, gradient descent converges to it, MSE and R²', () {
      final line = [for (var x = 0; x < 6; x++) MlPoint(x.toDouble(), 3 * x - 2)];
      final cf = linearClosedForm(line);
      expect(cf.slope, closeTo(3, 1e-12));
      expect(cf.intercept, closeTo(-2, 1e-12));
      // A textbook set: x = 1..5, y = 2, 4, 5, 4, 5 → y = 2.2 + 0.6x, R² = 0.6.
      final pts = [for (final (x, y) in [(1, 2), (2, 4), (3, 5), (4, 4), (5, 5)]) MlPoint(x.toDouble(), y.toDouble())];
      final f = linearClosedForm(pts);
      expect(f.slope, closeTo(0.6, 1e-12));
      expect(f.intercept, closeTo(2.2, 1e-12));
      final ys = [for (final p in pts) p.y], pred = [for (final p in pts) f.predict(p.x)];
      expect(rSquared(ys, pred), closeTo(0.6, 1e-12));
      expect(meanSquaredError(ys, pred), closeTo(0.48, 1e-12));
      final gd = linearGradientDescent(pts, lr: 0.1, epochs: 300);
      expect(gd.fit.slope, closeTo(0.6, 1e-6));
      expect(gd.fit.intercept, closeTo(2.2, 1e-5));
      expect(gd.loss.first, greaterThan(gd.loss.last));
      expect(gd.loss.last, closeTo(0.48, 1e-6));
    });

    test('polynomial regression recovers a cubic; Gaussian elimination solves a 3×3', () {
      final pts = [for (var i = -5; i <= 5; i++) MlPoint(i / 2, 0.5 * math.pow(i / 2, 3) - 2 * (i / 2) + 1)];
      final p = polyFit(pts, 3);
      for (final x in [-2.0, 0.3, 1.7]) {
        expect(p.predict(x), closeTo(0.5 * x * x * x - 2 * x + 1, 1e-6));
      }
      expect(solveLinear([
        [2, 1, -1, 8],
        [-3, -1, 2, -11],
        [-2, 1, 2, -3],
      ]), [closeTo(2, 1e-12), closeTo(3, 1e-12), closeTo(-1, 1e-12)]);
    });

    final blobs = datasetPoints(MlDataset.blobs);

    test('logistic regression and the perceptron separate two blobs; loss falls', () {
      final lr = LogisticRegression.train(blobs, lr: 0.5, epochs: 200);
      expect(lr.acc.last, greaterThanOrEqualTo(0.95));
      expect(lr.loss.last, lessThan(lr.loss.first));
      expect(lr.prob1(-1.2, -0.8), lessThan(0.2));
      expect(lr.prob1(1.1, 1.0), greaterThan(0.8));
      final sep = [const MlPoint(0, 0, 0), const MlPoint(1, 0, 0), const MlPoint(0, 1, 0), const MlPoint(3, 3, 1), const MlPoint(4, 3, 1), const MlPoint(3, 4, 1)];
      final pc = Perceptron.train(sep, epochs: 20);
      expect(pc.loss.last, 0, reason: 'a separable set ends with no mistakes');
      expect([for (final p in sep) pc.predict(p.x, p.y)], [0, 0, 0, 1, 1, 1]);
    });

    test('k-NN votes by its k nearest; a decision tree splits by Gini to its depth', () {
      final pts = [const MlPoint(0, 0, 0), const MlPoint(0, 1, 0), const MlPoint(1, 0, 0), const MlPoint(5, 5, 1), const MlPoint(5, 6, 1)];
      expect(KNearest(pts, 1).predict(0.2, 0.2), 0);
      expect(KNearest(pts, 1).predict(4.8, 5.1), 1);
      expect(KNearest(pts, 5).prob1(5, 5), closeTo(0.4, 1e-12));
      expect(DecisionTree.gini(1, 2), 0.5);
      final xor = datasetPoints(MlDataset.xor);
      final stump = DecisionTree.train(xor, maxDepth: 1), deep = DecisionTree.train(xor, maxDepth: 4);
      expect(stump.depth, 1);
      double acc(Classifier c) => accuracyOf([for (final p in xor) p.label], [for (final p in xor) c.predict(p.x, p.y)]);
      expect(acc(stump), lessThan(0.8), reason: 'one split cannot do XOR');
      expect(acc(deep), 1);
      expect(confusionMatrix([0, 0, 1, 1], [0, 1, 1, 1]), [
        [1, 1],
        [0, 2],
      ]);
    });

    test('k-means finds the three groups, each step no worse than the last', () {
      final pts = datasetPoints(MlDataset.groups);
      final steps = kMeans(pts, 3, seed: 3);
      expect(steps.length, greaterThan(1));
      for (var i = 1; i < steps.length; i++) {
        expect(steps[i].inertia, lessThanOrEqualTo(steps[i - 1].inertia + 1e-9));
      }
      final c = steps.last.centroids;
      for (final want in const [Offset(-1.6, -1.2), Offset(1.4, -1.0), Offset(0, 1.6)]) {
        expect(c.map((x) => (x - want).distance).reduce(math.min), lessThan(0.4), reason: '$want');
      }
      // Members of the same true group share a cluster.
      final a = steps.last.assign;
      for (var i = 3; i < pts.length; i++) {
        expect(a[i], a[i % 3]);
      }
    });

    test('a small neural network learns XOR by backpropagation (fixed seed): loss falls, 100% accuracy', () {
      final xor = [const MlPoint(0, 0, 0), const MlPoint(0, 1, 1), const MlPoint(1, 0, 1), const MlPoint(1, 1, 0)];
      final m = TinyMlp(xor, hidden: 4, seed: 1)..train(1500, lr: 0.3);
      expect(m.loss.last, lessThan(m.loss.first / 5));
      expect(m.acc.last, 1);
      expect([for (final p in xor) m.predict(p.x, p.y)], [0, 1, 1, 0]);
      final again = TinyMlp(xor, hidden: 4, seed: 1)..train(1500, lr: 0.3);
      expect(again.loss.last, m.loss.last, reason: 'same seed, same training');
      // And on two moons, which a straight line cannot split.
      final moons = datasetPoints(MlDataset.moons);
      final net = TinyMlp(moons, hidden: 8, seed: 2)..train(300, lr: 0.2);
      expect(net.acc.last, greaterThanOrEqualTo(0.95));
      expect(LogisticRegression.train(moons, epochs: 300).acc.last, lessThan(net.acc.last));
    });

    test('the playground runs every model on its data to a snapshot that saves', () {
      for (final d in MlDataset.values.where((d) => d != MlDataset.blank)) {
        for (final m in modelsFor(datasetTask(d))) {
          final s = MlSettings(dataset: d, model: m, epochs: 50);
          final snap = runPlayground(s, datasetPoints(d));
          final back = MlSnapshot.fromJson(jsonDecode(jsonEncode(snap.toJson())) as Map<String, Object?>);
          expect(back.model, mlModelNames[m]);
          expect(MlSettings.fromJson(back.settings).model, m);
          switch (back.task) {
            case MlTask.regress:
              expect(back.metrics.keys, containsAll(['mse', 'r2']), reason: '$d $m');
              expect(back.curve, isNotEmpty);
            case MlTask.classify:
              expect(back.metrics['accuracy'], isNotNull);
              expect(back.confusion!.expand((r) => r).fold(0, (a, b) => a + b), back.points.length);
              expect(back.grid.length, back.gridW * back.gridH);
            case MlTask.cluster:
              expect(back.centroids.length, s.clusters);
          }
        }
      }
      final house = runPlayground(MlSettings(dataset: MlDataset.house, model: MlModel.linear), datasetPoints(MlDataset.house));
      expect(house.metrics['r2'], greaterThan(0.8));
      expect(runPlayground(MlSettings(dataset: MlDataset.iris, model: MlModel.knn, k: 3), datasetPoints(MlDataset.iris)).metrics['accuracy'], greaterThanOrEqualTo(0.9));
      expect(runPlayground(MlSettings(dataset: MlDataset.blank), const []).metrics, isEmpty);
      final long = runPlayground(MlSettings(dataset: MlDataset.blobs, model: MlModel.logistic, epochs: 1000), datasetPoints(MlDataset.blobs));
      expect(long.loss.length, 200, reason: 'long curves are thinned for the board');
    });
  });

  group('digit recogniser', () {
    late DigitNet net;
    setUpAll(() async => net = await trainDigitNet());

    test('trained on the board, it reads its own sample digits and fresh hand-drawn ones', () {
      for (var d = 0; d < 10; d++) {
        final t = net.trace(rasterizeDigit(sampleDigitStrokes(d)));
        expect(t.best, d, reason: 'sample $d');
        expect(t.probs[d], greaterThan(0.6), reason: 'sample $d');
        expect(t.probs.fold(0.0, (a, b) => a + b), closeTo(1, 1e-9));
      }
      final r = math.Random(999);
      var ok = 0;
      for (var i = 0; i < 300; i++) {
        if (net.trace(augmentedDigit(i % 10, r)).best == i % 10) ok++;
      }
      expect(ok / 300, greaterThan(0.85), reason: 'held-out accuracy');
      expect(net.parameters, 256 * 32 + 32 + 32 * 10 + 10);
    });

    test('rasterising crops to the ink and centres it', () {
      final px = rasterizeDigit([
        [const Offset(500, 100), const Offset(500, 900)],
      ]);
      expect(px.length, digitPixels);
      expect(px[0], 0);
      expect(px[2 * digitGrid + 8], greaterThan(0.5), reason: 'the stroke runs down the middle');
      expect(rasterizeDigit(const []).every((v) => v == 0), isTrue);
    });

    test('the board backend runs it; the LAN AI box is written but not active', () async {
      final local = LocalDartBackend()..use(net);
      expect(local.onDevice, isTrue);
      final p = await local.classifyDigit(rasterizeDigit(sampleDigitStrokes(7)));
      expect(p.digit, 7);
      expect(p.trace, isNotNull);
      final off = LanAiBoxBackend();
      expect(off.available, isFalse);
      expect(await LanAiBoxBackend.discover(), isNull);
      await expectLater(off.classifyDigit(Float64List(digitPixels)), throwsStateError);
      // Switched on (later), it speaks Ollama's /api/generate.
      Map<String, Object?>? sent;
      final box = LanAiBoxBackend(
        baseUrl: Uri.parse('http://aibox.local:11434'),
        enabled: true,
        client: MockClient((req) async {
          expect(req.url.path, '/api/generate');
          sent = jsonDecode(req.body) as Map<String, Object?>;
          return http.Response(jsonEncode({'response': jsonEncode({'digit': 3, 'probabilities': List.generate(10, (i) => i == 3 ? 0.9 : 0.1 / 9)})}), 200);
        }),
      );
      final q = await box.classifyDigit(rasterizeDigit(sampleDigitStrokes(3)));
      expect(q.digit, 3);
      expect(q.confidence, 0.9);
      expect(sent!['model'], 'kinetix-digits');
      expect(sent!['stream'], false);
    });

    testWidgets('the demo: labelled as on this board, a sample digit is read, the answer goes on the board', (tester) async {
      final backend = LocalDartBackend()..use(net);
      await pumpWide(tester, Builder(builder: (context) => Center(child: FilledButton(onPressed: () => openDigitDemo(context, accent: accent, backend: backend).then((k) => last = k), child: const Text('open')))));
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      expect(find.text('Running on this board (demo)'), findsOneWidget);
      expect(find.byKey(const Key('digit-lan-box')), findsOneWidget);
      await tester.tap(find.byKey(const Key('digit-sample-4')));
      await tester.pumpAndSettle();
      expect(find.text('It looks like 4'), findsOneWidget);
      for (var i = 0; i < 6; i++) {
        await tester.ensureVisible(find.byKey(Key('digit-step-$i')));
        await tester.tap(find.byKey(Key('digit-step-$i')));
        await tester.pump();
      }
      await tester.tap(find.byKey(const Key('digit-to-board')));
      await tester.pumpAndSettle();
      expect(last!.kind, KitKind.chart);
      expect(ChartData.fromJson(last!.data).title, startsWith('Digit recogniser: 4'));
    });
  });

  group('kit on the board', () {
    testWidgets('a ready network: shapes and total, step the forward pass, edit a layer, it goes on the board and opens again', (tester) async {
      final wb = WhiteboardController();
      addTearDown(wb.dispose);
      await pumpWide(tester, AimlKitPanel(wb: wb, accent: accent));
      await tester.tap(find.byKey(const Key('aiml-preset-lenet')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('nn-editor')), findsOneWidget);
      expect(find.text('Total parameters: 44,426'), findsOneWidget);
      await tester.tap(find.byKey(const Key('nn-preset-xorMlp')));
      await tester.pumpAndSettle();
      expect(find.text('Total parameters: 9'), findsOneWidget);
      await tester.tap(find.byKey(const Key('nn-fwd-start')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('nn-fwd-next')));
      await tester.tap(find.byKey(const Key('nn-fwd-next')));
      await tester.pump();
      // Two hidden neurons → four.
      await tester.ensureVisible(find.byKey(const Key('nn-units-1')));
      await tester.enterText(find.byKey(const Key('nn-units-1')), '4');
      await tester.pumpAndSettle();
      expect(find.text('Total parameters: 17'), findsOneWidget);
      await tester.tap(find.byKey(const Key('nn-done')));
      await tester.pumpAndSettle();
      final k = wb.elements.whereType<KitElement>().single;
      expect(k.kind, KitKind.nnDiagram);
      final m = NnModel.fromJson(k.data);
      expect(m.layers[1].units, 4);
      expect(m.forward(), isNotNull, reason: 'the edited net got weights');
      // Opens again in the builder.
      await tester.pumpWidget(const SizedBox());
      await pumpWide(tester, Builder(builder: (context) => Center(child: FilledButton(onPressed: () => editKit(context, k).then((e) => last = e), child: const Text('edit')))));
      await tester.tap(find.text('edit'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('nn-editor')), findsOneWidget);
      await tester.tap(find.byKey(const Key('nn-add')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('nn-done')));
      await tester.pumpAndSettle();
      expect(NnModel.fromJson(last!.data).layers.length, 4);
      expect(last!.id, k.id);
    });

    testWidgets('the playground: pick data and a model, tap to add a point, put the snapshot on the board', (tester) async {
      final wb = WhiteboardController();
      addTearDown(wb.dispose);
      await pumpWide(tester, AimlKitPanel(wb: wb, accent: accent, first: AimlSection.playground));
      await tester.tap(find.byKey(const Key('aiml-data-iris')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('ml-playground')), findsOneWidget);
      await tester.tap(find.byKey(const Key('ml-model-tree')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('ml-depth')), findsOneWidget);
      await tester.tap(find.byKey(const Key('ml-class-1')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('ml-plot')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('ml-model-kmeans')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('ml-kstep')), findsOneWidget);
      await tester.tap(find.byKey(const Key('ml-model-mlp')));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const Key('ml-train')));
      await tester.tap(find.byKey(const Key('ml-train')));
      await tester.pump(const Duration(seconds: 5));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('ml-to-board')));
      await tester.pumpAndSettle();
      final k = wb.elements.whereType<KitElement>().single;
      expect(k.kind, KitKind.mlPlot);
      final snap = MlSnapshot.fromJson(k.data);
      expect(snap.points.length, irisPetals.length + 1);
      expect(snap.points.last.label, 1);
      expect(snap.model, 'Neural network (MLP)');
      expect(snap.loss.length, greaterThan(10));
      expect(isAimlKit(k.kind), isTrue);
    });

    testWidgets('the kit reads in Hindi and Kannada', (tester) async {
      for (final lang in ['hi', 'kn']) {
        await pumpWide(tester, AimlKitPanel(wb: WhiteboardController(), accent: accent), lang: lang);
        expect(find.text(aimlStringTable[lang]!['nnSection']!), findsOneWidget);
        expect(tester.takeException(), isNull);
      }
    });
  });

  test('registry: the network builder is built (no "soon"); AI & ML subjects, Class 11–12 CS and maths use the kit', () {
    List<String> f(String id) => CurriculumRegistry.choice(id)!.subject.features;
    expect(CurriculumRegistry.upcoming.keys, isNot(contains('nn-builder')));
    for (final l in CurriculumRegistry.levels) {
      for (final s in l.subjects) {
        expect(s.features, isNot(contains('soon:nn-builder')), reason: '${l.id}/${s.id}');
      }
    }
    expect(f('be-aiml/machine-learning'), containsAll(['tool:ml-playground', 'tool:nn-builder']));
    expect(f('be-aiml/deep-learning'), containsAll(['tool:nn-builder', 'tool:ai-box-demo']));
    expect(f('be-aiml/intro-ai'), contains('tool:ai-box-demo'));
    expect(f('be-aiml/data-science'), contains('tool:ml-playground'));
    expect(f('be-aiml/nlp'), contains('tool:nn-builder'));
    expect(f('be-aiml/computer-vision'), contains('tool:ai-box-demo'));
    expect(f('be-aiml/probability-statistics'), contains('tool:ml-playground'));
    for (final g in [11, 12]) {
      expect(f('class-$g/computer-science'), containsAll(['tool:ml-playground', 'tool:nn-builder', 'tool:ai-box-demo']));
      expect(f('class-$g/maths'), contains('tool:ml-playground'));
    }
    expect(f('class-10/computer'), isNot(contains('tool:ml-playground')));
  });
}

KitElement? last;

Future<void> pumpWide(WidgetTester tester, Widget child, {String lang = 'en'}) async {
  tester.view.physicalSize = const Size(1920, 1400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      theme: KinetixTheme.light(),
      locale: Locale(lang),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: Scaffold(body: Align(alignment: Alignment.topRight, child: SizedBox(width: 420, child: child))),
    ),
  );
  await tester.pump();
}
