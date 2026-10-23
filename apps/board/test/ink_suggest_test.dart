import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/handwriting/cloud_handwriting.dart';
import 'package:kinetix_board/core/models.dart';
import 'package:kinetix_board/features/sketch/ai_draw.dart';
import 'package:kinetix_board/features/sketch/ink_asset_index.dart';
import 'package:kinetix_board/features/sketch/ink_assets_board.dart';
import 'package:kinetix_board/features/sketch/sketch_bar.dart';
import 'package:kinetix_board/features/sketch/sketch_recognizer.dart';
import 'package:kinetix_board/features/sketch/sketch_suggest.dart';
import 'package:kinetix_board/l10n/l10n.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

final _png = Uint8List.fromList([0x89, 0x50, 0x4E, 0x47]);
int _n = 0;

Stroke _stroke(List<Offset> pts) => Stroke(
  id: 'k${_n++}',
  style: const InkStyle(tool: InkTool.pen, color: Color(0xFF1F2937), width: 3),
  points: [for (final p in pts) InkPoint(p.dx, p.dy)],
);

Stroke _circle(Offset c, double r) => _stroke([for (var i = 0; i <= 24; i++) c + Offset.fromDirection(i * 6.2832 / 24, r)]);

void _draw(WhiteboardController wb, Stroke s, {BoardTool tool = BoardTool.aiPen}) {
  wb.onStrokeStart?.call(tool, s.points.first.offset);
  wb.add(s);
  wb.onStrokeEnd?.call(tool, s);
}

InkAsset _a(InkAssetKind k, String title, [List<String> words = const []]) => InkAsset(kind: k, id: title.toLowerCase(), title: title, keywords: words);

final _index = InkAssetIndex([
  _a(InkAssetKind.picture, 'Human heart', ['heart', 'organ']),
  _a(InkAssetKind.picture, 'Heart sticker', ['heart', 'love']),
  _a(InkAssetKind.picture, 'Heart diagram labelled', ['heart', 'cardiac']),
  _a(InkAssetKind.animation, 'Heart and circulation', ['circulation', 'blood']),
  _a(InkAssetKind.model3d, 'Heart', ['cardiac', 'anatomy']),
  _a(InkAssetKind.diagram, 'Series RLC circuit', ['rlc circuit', 'resistor', 'capacitor']),
  _a(InkAssetKind.diagram, 'AND gate', ['and gate', 'logic gate']),
  _a(InkAssetKind.picture, 'Cat', ['animal', 'pet']),
]);

class _NoSketch implements SketchRecognizer {
  @override
  bool get available => false;
  @override
  Future<HandwritingModelState> modelState() async => HandwritingModelState.unsupported;
  @override
  Future<bool> download() async => false;
  @override
  Future<List<String>> recognize(List<List<TimedPoint>> ink, Size area) async => const [];
}

void main() {
  group('label → asset index', () {
    test('ranks exact titles first, mixes kinds (at most two of a kind), and leaves out what does not match', () {
      final hits = _index.rank(['heart']);
      expect([for (final h in hits) h.asset.title], ['Heart', 'Human heart', 'Heart sticker', 'Heart and circulation']);
      expect(hits.where((h) => h.asset.kind == InkAssetKind.picture), hasLength(2));
      expect(_index.rank(['zebra crossing']), isEmpty);
      expect(_index.rank(const []), isEmpty);
    });

    test('synonyms, engineering terms included, find what the label does not name', () {
      expect(inkSynonyms('Resistor'), containsAll(['resistance', 'rlc circuit']));
      expect(inkSynonyms('cardiac'), contains('heart'));
      expect(_index.rank(['resistance']).first.asset.title, 'Series RLC circuit');
      expect(_index.rank(['logic gate']).first.asset.title, 'AND gate');
      final viaSynonym = _index.rank(['cardiac']);
      expect(viaSynonym.map((h) => h.asset.title), contains('Human heart'));
    });

    test('a label further down the reading counts less than the first', () {
      final hits = _index.rank(['cat', 'heart'], max: 3, perKind: 3);
      expect(hits.first.asset.title, 'Cat');
      expect(hits.first.score, greaterThan(hits[1].score));
    });

    testWidgets('the board index holds pictures, diagram templates, models and animations', (tester) async {
      final index = (await tester.runAsync(boardInkAssets))!;
      final kinds = {for (final a in index.assets) a.kind};
      expect(kinds, InkAssetKind.values.toSet());
      expect(index.rank(['and gate']).first.asset.title, 'AND gate');
      expect(index.rank(['heart']).map((h) => h.asset.kind), containsAll([InkAssetKind.picture, InkAssetKind.animation]));
      expect(index.rank(['beam']).map((h) => h.asset.title), contains('Simply supported beam'));
    });

    test('every diagram template builds, and goes in the ink\'s place keeping its proportions', () async {
      for (final (title, _, build) in diagramTemplates) {
        expect(build(const Color(0xFF0D47A1)), isA<KitElement>(), reason: title);
      }
      final box = const Rect.fromLTWH(100, 100, 400, 200);
      final el = await inkAssetElement(InkAsset(kind: InkAssetKind.diagram, id: 'and', title: 'AND gate', payload: diagramTemplates.first.$3), box, const Color(0xFF000000));
      final r = (el! as KitElement).rect;
      expect(r.center, box.center);
      expect(r.width / r.height, closeTo(KitElement.naturalSizeOf(KitKind.logicCircuit).aspectRatio, 0.01));
      expect(fitInto(const Rect.fromLTWH(0, 0, 10, 10), const Size(200, 100)).width, 160, reason: 'a dot still makes a usable picture');
    });
  });

  group('AI pen suggestion row', () {
    late WhiteboardController wb;
    late AiPenController pen;
    late SketchSuggestController row;
    final reads = <String>[];
    SketchReading? reply;
    final opened = <InkAsset>[];

    setUp(() {
      reads.clear();
      opened.clear();
      reply = const SketchReading(labels: ['heart'], text: 'love');
      wb = WhiteboardController()..tool = BoardTool.aiPen;
      pen = AiPenController(wb)..mode = AiPenMode.tap;
      row = SketchSuggestController(
        wb,
        _NoSketch(),
        aiPen: pen,
        cloud: (png, mode) async {
          reads.add(mode);
          return reply;
        },
        assets: () async => _index,
        place: (a, box, color) async => ImageElement(id: 'placed-${a.id}', rect: box, bytes: _png),
        png: (ink) async => _png,
        onOpen: opened.add,
      );
    });

    tearDown(() {
      row.dispose();
      pen.dispose();
      wb.dispose();
    });

    testWidgets('ink the AI pen left as ink: the board\'s AI reads it; shapes, the reading and matching assets are offered', (tester) async {
      final ink = _circle(const Offset(300, 300), 80);
      _draw(wb, ink);
      await tester.pump(pen.pause);
      expect(row.suggestion, isNull, reason: 'it waits for the AI pen');
      await tester.pump(const Duration(milliseconds: 400));
      final s = row.suggestion!;
      expect(reads, ['auto']);
      expect(s.target, isNull);
      expect(s.choices.whereType<TextChoice>().single.text, 'love');
      expect(s.choices.whereType<ShapeChoice>().map((c) => c.kind), contains(FitKind.circle));
      expect(s.choices.whereType<AssetChoice>().first.asset.title, 'Heart');

      // A 3D model takes the ink's place (one undo step) and opens.
      final model = s.choices.whereType<AssetChoice>().firstWhere((c) => c.asset.kind == InkAssetKind.model3d);
      await tester.runAsync(() => row.choose(model));
      expect(wb.elements.single.id, 'placed-heart');
      expect((wb.elements.single as ImageElement).rect, contentBounds([ink]));
      expect(opened.single.title, 'Heart');
      expect(row.suggestion, isNull);
      wb.undo();
      expect(wb.elements.single.id, ink.id);
    });

    testWidgets('the reading from the board\'s AI becomes text the AI pen can take back', (tester) async {
      _draw(wb, _circle(const Offset(300, 300), 80));
      await tester.pump(const Duration(seconds: 2));
      await tester.runAsync(() => row.choose(row.suggestion!.choices.whereType<TextChoice>().single));
      final t = wb.elements.single as TextElement;
      expect(t.text, 'love');
      expect(pen.conversions[t.id]!.kind, ConversionKind.text);
    });

    testWidgets('what the AI pen converted: its other readings, other shapes and what the words name', (tester) async {
      final ink = _circle(const Offset(300, 300), 80);
      _draw(wb, ink);
      // The pen read it as "heart" (or "hearth"), before the row looks.
      pen.placeReading([ink], text: 'heart');
      final id = wb.elements.single.id;
      final c = pen.conversions[id]!;
      pen.conversions[id] = PenConversion(kind: c.kind, ink: c.ink, inkBox: c.inkBox, origin: c.origin, candidates: ['heart', 'hearth']);
      await tester.pump(const Duration(seconds: 2));
      final s = row.suggestion!;
      expect(reads, isEmpty, reason: 'nothing to ask the board\'s AI');
      expect(s.target, id);
      expect(s.choices.whereType<ReadingChoice>().single.label, 'hearth');
      expect(s.choices.whereType<ShapeChoice>(), isNotEmpty);
      expect(s.choices.whereType<AssetChoice>().map((a) => a.asset.title), contains('Human heart'));

      await tester.runAsync(() => row.choose(s.choices.whereType<ReadingChoice>().single));
      expect((wb.elements.single as TextElement).text, 'hearth');
    });

    testWidgets('a shape choice turns the ink into that clean shape; dismiss keeps the ink', (tester) async {
      final ink = _circle(const Offset(300, 300), 80);
      _draw(wb, ink);
      await tester.pump(const Duration(seconds: 2));
      row.dismiss();
      expect(row.suggestion, isNull);
      expect(wb.elements.single.id, ink.id);

      _draw(wb, _circle(const Offset(900, 300), 80));
      await tester.pump(const Duration(seconds: 2));
      expect(await row.choose(row.suggestion!.choices.whereType<ShapeChoice>().first), isTrue);
      expect(wb.elements.whereType<Stroke>().where((s) => s.shape != null), hasLength(1));
    });

    testWidgets('the bar shows the choices; tapping one takes it', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: KinetixTheme.light(),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: Scaffold(body: SketchSuggestOverlay(wb: wb, sketch: row)),
        ),
      );
      _draw(wb, _circle(const Offset(300, 300), 80));
      await tester.pump(const Duration(seconds: 2));
      await tester.pump();
      expect(find.byKey(const Key('sketch-suggest-bar')), findsOneWidget);
      final i = row.suggestion!.choices.indexWhere((c) => c is AssetChoice);
      expect(find.byKey(Key('sketch-choice-$i')), findsOneWidget);
      expect(find.text('Heart'), findsOneWidget);
      await tester.tap(find.byKey(Key('sketch-choice-$i')));
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 10)));
      await tester.pump();
      expect(find.byKey(const Key('sketch-suggest-bar')), findsNothing);
      expect(wb.elements.single.id, 'placed-heart');
    });
  });

  group('cloud fallback', () {
    test('handwriting: the board\'s own reader first, the board\'s AI where it has none, nothing offline', () async {
      var online = true;
      final modes = <String>[];
      final h = CloudHandwriting(
        const NoHandwritingRecognizer(),
        online: () => online,
        read: (png, mode) async {
          modes.add(mode);
          return const SketchReading(text: 'photosynthesis');
        },
        render: (ink) async => _png,
      );
      expect(h.available, isTrue);
      expect(h.engine, 'none+cloud');
      expect(await h.modelState('en'), HandwritingModelState.ready);
      expect(await h.recognize([_circle(Offset.zero, 20)], language: 'en'), ['photosynthesis']);
      expect(modes, ['handwriting']);
      online = false;
      expect(h.available, isFalse);
      expect(await h.modelState('en'), HandwritingModelState.unsupported);
      expect(await h.recognize([_circle(Offset.zero, 20)], language: 'en'), isEmpty);
    });

    testWidgets('AI draw: the SVG becomes a picture in the sketch\'s place', (tester) async {
      final wb = WhiteboardController();
      addTearDown(wb.dispose);
      final ink = _circle(const Offset(300, 300), 80);
      wb.add(ink);
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect x="10" y="10" width="180" height="80" fill="none" stroke="#000"/></svg>';
      final pic = (await tester.runAsync(() => svgToPng(svg, maxSide: 400)))!;
      expect(pic.$2, const Size(400, 200));
      expect(pic.$1.sublist(1, 4), 'PNG'.codeUnits);
      expect(await tester.runAsync(() => svgToPng('<svg')), isNull);
      final ok = await placeAiDrawing(wb, const AiDrawing(title: 'Box', svg: svg), ink: [ink], render: (_) async => pic);
      expect(ok, isTrue);
      final img = wb.elements.single as ImageElement;
      expect(img.rect.center, contentBounds([ink]).center);
      expect(img.rect.width / img.rect.height, closeTo(2, 0.01));
    });
  });
}
