import 'dart:math' as math;
import 'dart:ui';

import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import 'ai_pen_test.dart' show draw, drawAll;
import 'pen_helpers.dart';

/// ML Kit Digital Ink, faked: each model answers from [answer], and every call is kept.
class FakeModels implements HandwritingRecognizer, InkModelReader {
  FakeModels(this.answer, {this.ready = const {'en-US', 'hi-IN', 'zxx-Zsym-x-shapes'}});

  /// The readings for a call to [model] with [ink].
  final List<String> Function(String model, List<List<TimedPoint>> ink) answer;
  final Set<String> ready;
  final calls = <(String, List<List<TimedPoint>>)>[];
  final lineReads = <String>[];

  @override
  String get engine => 'fake';
  @override
  bool get available => true;
  @override
  Future<HandwritingModelState> modelState(String language) async =>
      ready.contains(InkModels.text(language)) ? HandwritingModelState.ready : HandwritingModelState.needsDownload;
  @override
  Future<bool> prepare(String language) async => true;
  @override
  Future<List<String>> recognize(List<Stroke> strokes, {required String language, String preContext = ''}) async {
    lineReads.add(language);
    return const ['untimed'];
  }

  @override
  Future<HandwritingModelState> modelStateOf(String model) async => ready.contains(model) ? HandwritingModelState.ready : HandwritingModelState.needsDownload;
  @override
  Future<bool> downloadModel(String model) async => true;
  @override
  final ValueListenable<Set<String>> downloadingModels = ValueNotifier(const {});
  @override
  Future<List<String>> readInk(List<List<TimedPoint>> ink, String model, {String preContext = '', Size? writingArea}) async {
    calls.add((model, ink));
    return answer(model, ink);
  }
}

double _height(List<List<TimedPoint>> ink) {
  var top = double.infinity, bottom = -double.infinity;
  for (final s in ink) {
    for (final p in s) {
      if (p.y < top) top = p.y;
      if (p.y > bottom) bottom = p.y;
    }
  }
  return bottom - top;
}

/// A short "word" of three letters at [x], 30 units tall.
List<Stroke> letters(double x, double y, {int n = 3}) => [
  for (var k = 0; k < n; k++) ink([Offset(x + k * 18, y), Offset(x + k * 18 + 8, y + 30), Offset(x + k * 18 + 14, y)]),
];

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('segmenting writing', () {
    test('without timing, only a wide space splits a line', () {
      final a = letters(100, 100), b = letters(100 + 50 + 45, 100), c = letters(100 + 50 + 45 + 50 + 90, 100);
      // a–b: 45 apart (1.5 letters); b–c: 90 apart (3 letters).
      final chunks = clusterWriting([...a, ...b, ...c]);
      expect(chunks, hasLength(2));
      expect(chunks.first, hasLength(6));
    });

    test('with timing, a pause splits at a word space and writing in one go stays together', () {
      final a = letters(100, 100), b = letters(195, 100), c = letters(335, 100);
      final times = <String, StrokeTime>{};
      var t = 0;
      void timeAll(List<Stroke> ss, {int pauseBefore = 100}) {
        t += pauseBefore;
        for (final s in ss) {
          times[s.id] = (start: t, end: t + 150);
          t += 250;
        }
      }

      timeAll(a);
      timeAll(b, pauseBefore: 3000); // the teacher stopped, then wrote on
      timeAll(c, pauseBefore: 200); // straight on, across a wide space
      final chunks = clusterWriting([...a, ...b, ...c], times: times);
      expect(chunks.map((c) => c.length), [3, 6]);
      // Far apart always splits.
      final d = letters(335 + 50 + 160, 100);
      timeAll(d, pauseBefore: 100);
      expect(clusterWriting([...a, ...b, ...c, ...d], times: times).map((c) => c.length), [3, 6, 3]);
    });

    test('timed ink spreads each stroke over the time it took', () {
      final s = ink(const [Offset(10, 10), Offset(20, 10), Offset(30, 10)]);
      final t = timedInk([s], {s.id: (start: 1000, end: 1100)}, origin: const Offset(10, 10));
      expect(t.single.map((p) => p.t), [1000, 1050, 1100]);
      expect(t.single.first.x, 0);
    });
  });

  group('sizing', () {
    test('a line becomes one size from the median letter height, and keeps the size above', () {
      // Short letters, two tall ones and a descender: the median is the short letters'.
      final line = [
        ink(const [Offset(0, 20), Offset(10, 50), Offset(20, 20)]),
        ink(const [Offset(30, 20), Offset(40, 50), Offset(50, 20)]),
        ink(const [Offset(60, 20), Offset(70, 50), Offset(80, 20)]),
        ink(const [Offset(90, 0), Offset(92, 50)]),
        ink(const [Offset(100, 20), Offset(104, 75)]),
      ];
      expect(medianLetterHeight(line), 30);
      expect(typedFontSize(line), (30 / 0.62).roundToDouble());
      expect(typedFontSize(line, near: 52), 52, reason: 'close to the text above');
      expect(typedFontSize(line, near: 90), (30 / 0.62).roundToDouble(), reason: 'far from it');
    });
  });

  group('routing with the model', () {
    late WhiteboardController wb;
    late AiPenController pen;
    var now = 0;

    setUp(() {
      wb = WhiteboardController()..tool = BoardTool.aiPen;
      pen = AiPenController(wb, clock: () => now += 120)..mode = AiPenMode.tap;
    });
    tearDown(() {
      pen.dispose();
      wb.dispose();
    });

    test('words become text in one size, read as timed ink with the language model', () async {
      final models = FakeModels((m, ink) => m == 'en-US' ? ['hello world'] : const []);
      pen.handwriting = models;
      final line = [...letters(100, 100), ...letters(170, 100)];
      drawAll(wb, line);
      await pen.convertPending();
      final t = wb.elements.single as TextElement;
      expect(t.text, 'hello world');
      expect(t.fontSize, typedFontSize(line));
      final read = models.calls.where((c) => c.$1 == 'en-US').single.$2;
      expect(read, hasLength(6));
      // Real times, in the order written.
      expect(read[1].first.t, greaterThan(read[0].last.t));
      expect(models.lineReads, isEmpty, reason: 'the untimed reader is the fallback only');
      // The next line, a little different in size, takes the same size.
      drawAll(wb, [
        for (var k = 0; k < 3; k++) ink([Offset(100 + k * 20, 160), Offset(108 + k * 20, 194), Offset(116 + k * 20, 160)]),
      ]);
      await pen.convertPending();
      final second = wb.elements.whereType<TextElement>().last;
      expect(second.fontSize, t.fontSize);
    });

    test('a line the model reads as maths becomes an equation', () async {
      pen.handwriting = FakeModels((m, ink) => m == 'en-US' ? ['2x+5=15'] : const []);
      drawAll(wb, letters(100, 100, n: 5));
      await pen.convertPending();
      final m = wb.elements.single as MathElement;
      expect(m.latex, contains('='));
      expect(pen.solverText(m), '2x+5=15');
    });

    test('a fraction keeps its layout; each symbol in it is read by the model', () async {
      final models = FakeModels((m, ink) => m == 'en-US' ? (ink.length <= 2 && _height(ink) < 60 ? ['7'] : ['1-2']) : const []);
      pen.handwriting = models;
      drawAll(wb, [
        ...write('1', const Offset(120, 60)),
        ink(const [Offset(100, 120), Offset(130, 121), Offset(160, 120)]),
        ...write('2', const Offset(120, 130)),
      ]);
      await pen.convertPending();
      final m = wb.elements.single as MathElement;
      expect(m.latex, r'\frac{7}{7}', reason: "the model's readings, in the board's layout");
    });

    test('a subscript is laid out as one', () async {
      pen.handwriting = FakeModels((m, ink) => m == 'en-US' ? (ink.length > 2 ? ['x2'] : (_height(ink) > 24 ? ['x'] : ['2'])) : const []);
      drawAll(wb, [...write('x', const Offset(100, 100)), ...write('2', const Offset(138, 128), h: 20)]);
      await pen.convertPending();
      final m = wb.elements.single as MathElement;
      expect(m.latex, 'x_{2}');
    });

    test("a sketch too rough for the board's fitter becomes the shape the model names", () async {
      // A wavy loop, nothing like a clean figure.
      final rough = [
        for (var a = 0.0; a < 2 * math.pi; a += 0.05) Offset(400 + 160 * (1 + 0.3 * math.sin(5 * a)) * math.cos(a), 400 + 160 * (1 + 0.3 * math.sin(5 * a)) * math.sin(a)),
      ];
      final s = ink(rough);
      final reading = parseInk([s], const InkContext());
      expect(reading.shapes, isEmpty, reason: 'the precondition: the fitter alone keeps it as ink');
      final models = FakeModels((m, ink) => m == InkModels.shapes ? ['ELLIPSE'] : const []);
      pen.handwriting = models;
      draw(wb, rough);
      await pen.convertPending();
      final shape = wb.elements.single as Stroke;
      expect(shape.shape, anyOf(ShapeKind.ellipse, ShapeKind.circle));
      expect(models.calls.map((c) => c.$1), [InkModels.shapes]);
    });

    test('a shape the model names differently is fitted as what it names', () async {
      final models = FakeModels((m, ink) => m == InkModels.shapes ? ['RECTANGLE'] : const []);
      pen.handwriting = models;
      draw(wb, sketch(const [Offset(100, 100), Offset(400, 100), Offset(400, 300), Offset(100, 300)]));
      await pen.convertPending();
      expect((wb.elements.single as Stroke).shape, ShapeKind.rectangle);
      // And a triangle stays a triangle when the model agrees.
      wb.clearPage();
      final agree = FakeModels((m, ink) => m == InkModels.shapes ? ['TRIANGLE'] : const []);
      pen.handwriting = agree;
      draw(wb, sketch(const [Offset(200, 40), Offset(340, 260), Offset(60, 260)]));
      await pen.convertPending();
      expect((wb.elements.single as Stroke).shape, ShapeKind.triangle);
    });

    test('without the models, the pure-Dart readers and the untimed reader do it', () async {
      final models = FakeModels((m, ink) => fail('no model is downloaded'), ready: const {});
      pen.handwriting = models;
      draw(wb, sketch(const [Offset(200, 40), Offset(340, 260), Offset(60, 260)]));
      drawAll(wb, [...write('2', const Offset(500, 100)), ...write('+', const Offset(540, 104), h: 32), ...write('3', const Offset(586, 100))]);
      await pen.convertPending();
      expect(wb.elements.whereType<Stroke>().single.shape, ShapeKind.triangle);
      expect(models.calls, isEmpty);
    });
  });

  test('model labels name the board shapes', () {
    expect(shapeFromLabel('RECTANGLE')!.kind, FitKind.rectangle);
    expect(shapeFromLabel('ellipse')!.kind, FitKind.ellipse);
    expect(shapeFromLabel('ARROW')!.arrow, isTrue);
    expect(shapeFromLabel('hexagon')!.sides, 6);
    expect(shapeFromLabel('cloud'), isNull);
  });
}
