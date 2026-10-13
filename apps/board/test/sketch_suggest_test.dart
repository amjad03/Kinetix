import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/features/sketch/sketch_bar.dart';
import 'package:kinetix_board/features/sketch/sketch_icons.dart';
import 'package:kinetix_board/features/sketch/sketch_recognizer.dart';
import 'package:kinetix_board/features/sketch/sketch_suggest.dart';
import 'package:kinetix_board/l10n/l10n.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

/// A sketch recogniser that reads every drawing as [labels], with its model in [state].
class FakeSketchRecognizer implements SketchRecognizer {
  FakeSketchRecognizer({this.labels = const ['cat', 'dog', 'tiger', 'squiggle', 'house', 'sun'], this.state = HandwritingModelState.ready, this.available = true});

  List<String> labels;
  HandwritingModelState state;
  @override
  final bool available;
  final read = <List<List<TimedPoint>>>[];

  @override
  Future<HandwritingModelState> modelState() async => state;
  @override
  Future<bool> download() async {
    state = HandwritingModelState.ready;
    return true;
  }

  @override
  Future<List<String>> recognize(List<List<TimedPoint>> ink, Size area) async {
    read.add(ink);
    return labels;
  }
}

final _png = Uint8List.fromList([0x89, 0x50, 0x4E, 0x47]);
Future<Uint8List> _stubRender(SketchIcon icon, Size size, Color color) async => _png;

int _n = 0;

/// A freehand pen stroke through [pts].
Stroke _stroke(List<Offset> pts) => Stroke(
  id: 'k${_n++}',
  style: const InkStyle(tool: InkTool.pen, color: Color(0xFF1F2937), width: 3),
  points: [for (final p in pts) InkPoint(p.dx, p.dy)],
);

/// A rough circle (a face, the sun) of [r] around [c].
Stroke _circle(Offset c, double r) => _stroke([for (var i = 0; i <= 24; i++) c + Offset.fromDirection(i * 6.2832 / 24, r)]);

/// Draws [s] on [wb] with [tool], as the pen would: stroke start, on the page, stroke end.
void _draw(WhiteboardController wb, Stroke s, {BoardTool tool = BoardTool.pen}) {
  wb.onStrokeStart?.call(tool, s.points.first.offset);
  wb.add(s);
  wb.onStrokeEnd?.call(tool, s);
}

void main() {
  group('label map', () {
    test('labels are normalised: case, underscores, dashes, a leading "the"', () {
      expect(normaliseSketchLabel('The_Eiffel-Tower'), 'eiffel tower');
      expect(normaliseSketchLabel('  Teddy-bear '), 'teddy bear');
      expect(normaliseSketchLabel('t-shirt'), 't shirt');
      expect(normaliseSketchLabel('ALARM  CLOCK'), 'alarm clock');
    });

    test('a label maps to an emoji first, then a Material icon, else nothing', () {
      expect(sketchIconFor('cat'), const SketchIcon('cat', emoji: '🐱'));
      expect(sketchIconFor('The Mona Lisa')?.emoji, '🖼️');
      expect(sketchIconFor('triangle'), const SketchIcon('triangle', icon: Icons.change_history));
      expect(sketchIconFor('washing_machine')?.icon, Icons.local_laundry_service_outlined);
      expect(sketchIconFor('squiggle'), isNull);
      expect(sketchIconFor(''), isNull);
    });

    test('every key is already normalised, has a non-empty icon and is in one map only', () {
      for (final MapEntry(:key, :value) in sketchEmoji.entries) {
        expect(normaliseSketchLabel(key), key);
        expect(value.trim(), isNotEmpty, reason: key);
      }
      for (final key in sketchMaterialIcons.keys) {
        expect(normaliseSketchLabel(key), key);
        expect(sketchEmoji.containsKey(key), isFalse, reason: '$key is in both maps');
      }
      // Most of the Quick, Draw! classes the AutoDraw model knows have an icon.
      expect(sketchEmoji.length + sketchMaterialIcons.length, greaterThan(300));
    });

    test('icons for a reading: in order, one per icon, unknown labels skipped, at most 8', () {
      final icons = sketchIconsFor(['hockey stick', 'squiggle', 'hockey puck', 'cat', 'Cat', 'square']);
      expect([for (final i in icons) i.label], ['hockey stick', 'cat', 'square']);
      final many = sketchIconsFor(sketchEmoji.keys);
      expect(many, hasLength(8));
      expect(sketchIconsFor(sketchEmoji.keys, max: 5), hasLength(5));
    });

    testWidgets('an icon draws as a PNG the size of the sketch', (tester) async {
      final bytes = await tester.runAsync(() async => [
        await renderSketchIcon(const SketchIcon('cat', emoji: '🐱'), const Size(120, 80)),
        await renderSketchIcon(const SketchIcon('square', icon: Icons.crop_square), const Size(60, 60)),
      ]);
      for (final b in bytes!) {
        expect(b.sublist(0, 4), [0x89, 0x50, 0x4E, 0x47]);
      }
    });
  });

  group('grouping and trigger', () {
    test('a stroke on or near the drawing carries it on; one far away starts another', () {
      const g = Rect.fromLTWH(100, 100, 200, 200);
      expect(joinsSketch(g, const Offset(150, 150), 1), isTrue);
      expect(joinsSketch(g, const Offset(340, 200), 1), isTrue);
      expect(joinsSketch(g, const Offset(600, 200), 1), isFalse);
      // Zoomed out, "near" is further in board units.
      expect(joinsSketch(const Rect.fromLTWH(0, 0, 20, 20), const Offset(80, 10), 0.5), isTrue);
    });

    test('a drawing is big enough, freehand and not a line of writing', () {
      expect(looksLikeSketch([_circle(const Offset(200, 200), 60)], 1), isTrue);
      // Too small: a letter or a dot.
      expect(looksLikeSketch([_circle(const Offset(200, 200), 12)], 1), isFalse);
      // But big enough once zoomed in.
      expect(looksLikeSketch([_circle(const Offset(200, 200), 30)], 2), isTrue);
      // A straight line.
      expect(looksLikeSketch([_stroke([const Offset(0, 0), const Offset(300, 4)])], 1), isFalse);
      // A word: several strokes along a line.
      final word = [for (var i = 0; i < 5; i++) _stroke([Offset(i * 60.0, 0), Offset(i * 60.0 + 40, 40)])];
      expect(looksLikeSketch(word, 1), isFalse);
      // A shape from the Shapes tool is already clean.
      final shape = Stroke(id: 's', style: const InkStyle(tool: InkTool.shape, color: Color(0xFF000000), width: 3), shape: ShapeKind.rectangle, points: _circle(const Offset(200, 200), 60).points);
      expect(looksLikeSketch([shape], 1), isFalse);
      expect(looksLikeSketch(const [], 1), isFalse);
    });

    testWidgets('the bar comes after a pause, with the icons the reading maps to', (tester) async {
      final wb = WhiteboardController();
      addTearDown(wb.dispose);
      final rec = FakeSketchRecognizer();
      final sketch = SketchSuggestController(wb, rec, render: _stubRender);
      addTearDown(sketch.dispose);
      _draw(wb, _circle(const Offset(300, 300), 80));
      _draw(wb, _circle(const Offset(270, 280), 8));
      await tester.pump(const Duration(milliseconds: 650));
      expect(sketch.suggestion, isNull);
      await tester.pump(const Duration(milliseconds: 100));
      final s = sketch.suggestion!;
      expect([for (final i in s.icons) i.label], ['cat', 'dog', 'tiger', 'house', 'sun']);
      expect(s.strokeIds, hasLength(2));
      expect(rec.read.single, hasLength(2));
      // The ink is read relative to the drawing's top left.
      expect(rec.read.single.first.every((p) => p.x >= 0 && p.y >= 0), isTrue);
    });

    testWidgets('a stroke before the pause is over carries the drawing on; one far away starts afresh', (tester) async {
      final wb = WhiteboardController();
      addTearDown(wb.dispose);
      final sketch = SketchSuggestController(wb, FakeSketchRecognizer(), render: _stubRender);
      addTearDown(sketch.dispose);
      _draw(wb, _circle(const Offset(300, 300), 80));
      await tester.pump(const Duration(milliseconds: 400));
      _draw(wb, _circle(const Offset(300, 300), 20));
      await tester.pump(const Duration(milliseconds: 400));
      expect(sketch.suggestion, isNull);
      await tester.pump(const Duration(milliseconds: 400));
      expect(sketch.suggestion!.strokeIds, hasLength(2));
      // A new drawing elsewhere hides the bar and is offered on its own.
      _draw(wb, _circle(const Offset(900, 300), 80));
      expect(sketch.suggestion, isNull);
      await tester.pump(const Duration(milliseconds: 800));
      expect(sketch.suggestion!.strokeIds, hasLength(1));
    });

    testWidgets('no bar for writing, the AI pen, when switched off, or with no sketch model', (tester) async {
      final wb = WhiteboardController();
      addTearDown(wb.dispose);
      final sketch = SketchSuggestController(wb, FakeSketchRecognizer(), render: _stubRender);
      addTearDown(sketch.dispose);
      for (var i = 0; i < 5; i++) {
        _draw(wb, _stroke([Offset(100 + i * 50.0, 100), Offset(130 + i * 50.0, 140)]));
      }
      await tester.pump(const Duration(seconds: 1));
      expect(sketch.suggestion, isNull, reason: 'a word');

      _draw(wb, _circle(const Offset(300, 600), 80), tool: BoardTool.aiPen);
      await tester.pump(const Duration(seconds: 1));
      expect(sketch.suggestion, isNull, reason: 'the AI pen');

      sketch.enabled = false;
      _draw(wb, _circle(const Offset(900, 600), 80));
      await tester.pump(const Duration(seconds: 1));
      expect(sketch.suggestion, isNull, reason: 'switched off');

      final none = SketchSuggestController(WhiteboardController(), const NoSketchRecognizer());
      _draw(none.board, _circle(const Offset(300, 300), 80));
      await tester.pump(const Duration(seconds: 1));
      expect(none.suggestion, isNull, reason: 'no model on this platform');
      none.dispose();
    });

    testWidgets('before the model is on the device, the bar offers it once', (tester) async {
      final wb = WhiteboardController();
      addTearDown(wb.dispose);
      final rec = FakeSketchRecognizer(state: HandwritingModelState.needsDownload);
      final sketch = SketchSuggestController(wb, rec, render: _stubRender);
      addTearDown(sketch.dispose);
      _draw(wb, _circle(const Offset(300, 300), 80));
      await tester.pump(const Duration(seconds: 1));
      expect(sketch.suggestion!.needsModel, isTrue);
      expect(rec.read, isEmpty);
      // Downloaded: the same drawing is read.
      await rec.download();
      await sketch.modelReady();
      expect(sketch.suggestion!.icons, isNotEmpty);
      // Not offered again in this session.
      rec.state = HandwritingModelState.needsDownload;
      _draw(wb, _circle(const Offset(900, 300), 80));
      await tester.pump(const Duration(seconds: 1));
      expect(sketch.suggestion, isNull);
    });

    test('it listens alongside the AI pen and gives the callbacks back', () {
      final wb = WhiteboardController();
      final ends = <String>[];
      wb.onStrokeEnd = (tool, s) => ends.add(s.id);
      final sketch = SketchSuggestController(wb, FakeSketchRecognizer(), render: _stubRender);
      final s = _circle(const Offset(300, 300), 80);
      _draw(wb, s);
      expect(ends, [s.id]);
      sketch.dispose();
      expect(wb.onStrokeEnd, isNotNull);
      wb.onStrokeEnd!(BoardTool.pen, s);
      expect(ends, [s.id, s.id]);
      wb.dispose();
    });
  });

  group('bar', () {
    Future<(WhiteboardController, SketchSuggestController)> pumpBar(WidgetTester tester) async {
      final wb = WhiteboardController();
      addTearDown(wb.dispose);
      final sketch = SketchSuggestController(wb, FakeSketchRecognizer(), render: _stubRender);
      addTearDown(sketch.dispose);
      await tester.pumpWidget(
        MaterialApp(
          theme: KinetixTheme.light(),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: Scaffold(body: SketchSuggestOverlay(wb: wb, sketch: sketch, onDownload: () {})),
        ),
      );
      return (wb, sketch);
    }

    testWidgets('shows over the sketch; picking an icon puts it in the drawing\'s place, and undo brings the drawing back', (tester) async {
      final (wb, sketch) = await pumpBar(tester);
      expect(find.byKey(const Key('sketch-suggest-bar')), findsNothing);
      final a = _circle(const Offset(300, 300), 80), b = _circle(const Offset(280, 280), 10);
      _draw(wb, a);
      _draw(wb, b);
      await tester.pump(const Duration(seconds: 1));
      await tester.pump();
      expect(find.byKey(const Key('sketch-suggest-bar')), findsOneWidget);
      expect(find.text('Did you mean?'), findsOneWidget);
      expect(find.text('🐱'), findsOneWidget);
      expect(find.byKey(const Key('sketch-suggest-4')), findsOneWidget);
      expect(find.byKey(const Key('sketch-suggest-5')), findsNothing);
      // The bar sits above the drawing.
      expect(tester.getBottomLeft(find.byKey(const Key('sketch-suggest-bar'))).dy, lessThan(300 - 80));

      final box = contentBounds([a, b]);
      await tester.tap(find.byKey(const Key('sketch-suggest-0')));
      await tester.pump();
      expect(find.byKey(const Key('sketch-suggest-bar')), findsNothing);
      final image = wb.elements.whereType<ImageElement>().single;
      expect(image.rect, box);
      expect(image.bytes, _png);
      expect(wb.elements.whereType<Stroke>(), isEmpty);

      wb.undo();
      expect(wb.elements.whereType<ImageElement>(), isEmpty);
      expect({for (final e in wb.elements) e.id}, {a.id, b.id});
    });

    testWidgets('x dismisses it and the drawing stays; undoing the drawing hides it too', (tester) async {
      final (wb, sketch) = await pumpBar(tester);
      final a = _circle(const Offset(300, 300), 80);
      _draw(wb, a);
      await tester.pump(const Duration(seconds: 1));
      await tester.pump();
      await tester.tap(find.byKey(const Key('sketch-suggest-close')));
      await tester.pump();
      expect(find.byKey(const Key('sketch-suggest-bar')), findsNothing);
      expect(sketch.suggestion, isNull);
      expect(wb.elements.single.id, a.id);

      _draw(wb, _circle(const Offset(900, 300), 80));
      await tester.pump(const Duration(seconds: 1));
      await tester.pump();
      expect(find.byKey(const Key('sketch-suggest-bar')), findsOneWidget);
      wb.undo();
      await tester.pump();
      expect(find.byKey(const Key('sketch-suggest-bar')), findsNothing);
    });

    testWidgets('without the model it offers the download instead of icons', (tester) async {
      final wb = WhiteboardController();
      addTearDown(wb.dispose);
      final sketch = SketchSuggestController(wb, FakeSketchRecognizer(state: HandwritingModelState.needsDownload), render: _stubRender);
      addTearDown(sketch.dispose);
      var asked = 0;
      await tester.pumpWidget(
        MaterialApp(
          theme: KinetixTheme.light(),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: Scaffold(body: SketchSuggestOverlay(wb: wb, sketch: sketch, onDownload: () => asked++)),
        ),
      );
      _draw(wb, _circle(const Offset(300, 300), 80));
      await tester.pump(const Duration(seconds: 1));
      await tester.pump();
      expect(find.byKey(const Key('sketch-suggest-0')), findsNothing);
      await tester.tap(find.byKey(const Key('sketch-suggest-download')));
      expect(asked, 1);
    });
  });
}
