import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_3d/kinetix_3d.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

/// Scene mode: the commands that drive a narrated scene's timeline, the events that report
/// it, and the viewer's player against a fake page.
Future<FakeViewerEngine?> _open(WidgetTester tester, Widget child, {Size size = const Size(1600, 900), Locale locale = const Locale('en')}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(MaterialApp(
    theme: KinetixTheme.boardChrome(),
    locale: locale,
    supportedLocales: const [Locale('en'), Locale('hi'), Locale('kn')],
    localizationsDelegates: GlobalMaterialLocalizations.delegates,
    home: Scaffold(body: child),
  ));
  await tester.pump();
  await tester.pump();
  return FakeViewerEngine.last;
}

void main() {
  final ps = ProcessScene.byId('photosynthesis')!;

  group('commands', () {
    test('drive the timeline and the quality', () {
      for (final op in SceneOp.values) {
        expect(ViewerCommands.scene(op), {'cmd': 'scene', 'op': op.name});
      }
      expect(ViewerCommands.sceneStep(3), {'cmd': 'scene', 'op': 'step', 'step': 3});
      expect(ViewerCommands.sceneStep(-2)['step'], 0);
      expect(ViewerCommands.sceneSeek(12.3456), {'cmd': 'scene', 'op': 'seek', 'time': 12.35});
      expect(ViewerCommands.sceneSeek(-4)['time'], 0);
      expect(ViewerCommands.sceneSpeed(10)['speed'], 3);
      expect(ViewerCommands.sceneSpeed(0.1)['speed'], 0.25);
      expect(ViewerCommands.sceneCaptions(false), {'cmd': 'scene', 'op': 'captions', 'on': false});
      expect(ViewerCommands.quality(ViewerQuality.low), {'cmd': 'quality', 'level': 'low'});
      for (final c in [ViewerCommands.scene(SceneOp.play), ViewerCommands.quality(ViewerQuality.high)]) {
        expect(ViewerCommands.names, contains(c['cmd']));
        expect(jsonDecode(jsonEncode(c)), c);
      }
    });

    test('the page runs every scene op the app sends', () {
      final src = File('tool/models/src/scenes/runtime.js').readAsStringSync();
      final block = src.substring(src.indexOf('function command(c)'), src.indexOf('function touched()'));
      for (final op in [...SceneOp.values.map((o) => o.name), 'step', 'seek', 'speed', 'captions']) {
        expect(block, contains("case '$op':"), reason: 'scene op $op');
      }
      final viewer = File('tool/models/src/viewer.js').readAsStringSync();
      expect(viewer, contains("params.get('scene')"));
    });

    test('a scene opens as its own page', () {
      expect(Viewer3dEngine.sceneTarget('photosynthesis'), 'scene:photosynthesis');
      expect(Viewer3dEngine.sceneOf('scene:photosynthesis'), 'photosynthesis');
      expect(Viewer3dEngine.sceneOf('heart'), isNull);
    });

    test('scene events decode', () {
      final e = ViewerEvent.decode(jsonEncode({'event': 'scene', 'id': 'photosynthesis', 'step': 4, 'steps': 12, 'time': 50.5, 'total': 144, 'playing': true, 'speed': 1.5}))!;
      final p = e.scene!;
      expect(p.step, 4);
      expect(p.time, 50.5);
      expect(p.playing, isTrue);
      expect(p.speed, 1.5);
      expect(p.fraction, closeTo(50.5 / 144, 1e-9));
      expect(ViewerEvent({'event': 'pick', 'part': 'x'}).scene, isNull);
      expect(const SceneProgress(step: 0, time: 3, total: 0).fraction, 0);
    });
  });

  group('the player', () {
    setUp(() {
      FakeViewerEngine.last = null;
      Viewer3dEngine.debugOverride = FakeViewerEngine.new;
      ViewerManifest.debugLoad = (id) async => ViewerManifest.fromJson(jsonDecode(File('assets/viewer3d/models/$id.json').readAsStringSync()) as Map<String, dynamic>);
    });
    tearDown(() {
      Viewer3dEngine.debugOverride = null;
      ViewerManifest.debugLoad = null;
    });

    testWidgets('opens the scene, shows the step and its caption, and steps on', (tester) async {
      final e = (await _open(tester, const Model3dViewer(sceneId: 'photosynthesis')))!;
      expect(e.opened, ['scene:photosynthesis:en']);
      expect(find.byKey(const ValueKey('scene-player')), findsOneWidget);
      expect(find.text(ps.steps.first.caption.en), findsOneWidget);
      expect(find.text('Photosynthesis'), findsWidgets);
      // The Steps tab lists every step.
      expect(find.byKey(const ValueKey('scene-steps')), findsOneWidget);
      expect(find.byKey(ValueKey('scene-step-${ps.steps.length - 1}')), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('scene-next')));
      await tester.pump();
      await tester.pump();
      expect(e.lastOf('scene'), {'cmd': 'scene', 'op': 'next'});
      expect(find.text(ps.steps[1].caption.en), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('scene-play')));
      await tester.pump();
      expect(e.lastOf('scene'), {'cmd': 'scene', 'op': 'toggle'});
      expect(e.scenePlaying, isFalse);

      await tester.tap(find.byKey(const ValueKey('scene-step-4')));
      await tester.pump();
      await tester.pump();
      expect(e.lastOf('scene'), {'cmd': 'scene', 'op': 'step', 'step': 4});
      expect(find.text(ps.steps[4].caption.en), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('scene-prev')));
      await tester.pump();
      await tester.pump();
      expect(find.text(ps.steps[3].caption.en), findsOneWidget);
    });

    testWidgets('the timeline scrubs, the speed changes, quality lowers', (tester) async {
      final e = (await _open(tester, const Model3dViewer(sceneId: 'photosynthesis')))!;
      final slider = find.byKey(const ValueKey('scene-timeline'));
      final r = tester.getRect(slider);
      await tester.tapAt(Offset(r.left + 24 + (r.width - 48) * 0.75, r.center.dy));
      await tester.pump();
      await tester.pump();
      final seek = e.lastOf('scene')!;
      expect(seek['op'], 'seek');
      expect((seek['time'] as num).toDouble(), closeTo(ps.seconds * 0.75, ps.seconds * 0.05));
      final want = ps.stepAt((seek['time'] as num).toDouble());
      expect(find.text(ps.steps[want].caption.en), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('scene-speed')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('scene-speed-1.5')).last);
      await tester.pumpAndSettle();
      expect(e.lastOf('scene'), {'cmd': 'scene', 'op': 'speed', 'speed': 1.5});
      expect(find.text('1.5×'), findsOneWidget);

      await tester.scrollUntilVisible(find.byKey(const ValueKey('scene-quality')), 200, scrollable: find.descendant(of: find.byKey(const ValueKey('scene-steps')), matching: find.byType(Scrollable)));
      await tester.tap(find.byKey(const ValueKey('scene-quality')));
      await tester.pump();
      expect(e.lastOf('quality'), {'cmd': 'quality', 'level': 'low'});
    });

    testWidgets('captions in Hindi and Kannada; read aloud speaks each step in that language', (tester) async {
      final spoken = <(String, String)>[];
      await _open(tester, Model3dViewer(sceneId: 'photosynthesis', lang: 'hi', onReadAloud: (t, l) => spoken.add((t, l))));
      expect(find.text(ps.steps.first.caption.of('hi')), findsOneWidget);
      expect(find.text('चरण'), findsOneWidget); // the Steps tab
      await tester.tap(find.byKey(const ValueKey('scene-read')));
      await tester.pump();
      expect(spoken.single, (ps.steps.first.spoken('hi'), 'hi'));
      await tester.tap(find.byKey(const ValueKey('scene-next')));
      await tester.pump();
      await tester.pump();
      expect(spoken.last, (ps.steps[1].spoken('hi'), 'hi'));

      await tester.pumpWidget(const SizedBox());
      await _open(tester, const Model3dViewer(sceneId: 'photosynthesis', lang: 'kn'));
      expect(find.text(ps.steps.first.caption.of('kn')), findsOneWidget);
      // No voice given: no read-aloud button.
      expect(find.byKey(const ValueKey('scene-read')), findsNothing);
    });

    testWidgets('a Model3dScope gives the voice; the laser and notes work on a scene', (tester) async {
      final spoken = <String>[];
      final e = (await _open(tester, Model3dScope(readAloud: (t, l) => spoken.add(t), child: const Model3dViewer(sceneId: 'photosynthesis'))))!;
      expect(find.byKey(const ValueKey('scene-read')), findsOneWidget);
      e.partUnder = (_) => 'leaf';
      await tester.tap(find.byKey(const ValueKey('model3d-laser')));
      await tester.pump();
      final layer = tester.getRect(find.byKey(const ValueKey('model3d-laser-layer')));
      final g = await tester.startGesture(layer.center);
      await tester.pump(const Duration(milliseconds: 40));
      await g.moveBy(const Offset(20, 0));
      await tester.pump(const Duration(milliseconds: 40));
      expect(find.descendant(of: find.byKey(const ValueKey('laser-part')), matching: find.text('Leaf')), findsOneWidget);
      await g.up();
      await tester.pump(const Duration(seconds: 2));
      await tester.tap(find.byKey(const ValueKey('model3d-laser')));
      await tester.pump();

      await tester.tap(find.byKey(const ValueKey('tab-notes')));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('notes-pin')));
      await tester.pump();
      await tester.tapAt(layer.center);
      await tester.pump();
      await tester.pump();
      expect(e.lastOf('annotate')!['op'], 'pin');
      expect(find.byKey(const ValueKey('pin-editor')), findsOneWidget);
    });

    testWidgets('the cut tab cuts through the scene', (tester) async {
      final e = (await _open(tester, const Model3dViewer(sceneId: 'photosynthesis')))!;
      await tester.tap(find.byKey(const ValueKey('tab-cut')));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('cut-mode-half')));
      await tester.pump();
      expect(e.lastOf('cut')!['mode'], 'half');
      expect(find.byKey(const ValueKey('tab-apart')), findsNothing, reason: 'a scene does not come apart');
    });

    testWidgets('fits a phone', (tester) async {
      await _open(tester, const Model3dViewer(sceneId: 'photosynthesis'), size: const Size(360, 740));
      expect(find.byKey(const ValueKey('scene-player')), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('an unknown scene says so', (tester) async {
      await _open(tester, const Model3dViewer(sceneId: 'no-such-scene'));
      await tester.pump();
      expect(find.text('This model could not be opened.'), findsOneWidget);
    });
  });

  testWidgets('without a WebView the scene\'s steps and parts are listed', (tester) async {
    Viewer3dEngine.debugOverride = () => null;
    addTearDown(() => Viewer3dEngine.debugOverride = null);
    await _open(tester, const Model3dViewer(sceneId: 'photosynthesis'));
    expect(find.byKey(const ValueKey('model3d-parts-list')), findsOneWidget);
    expect(find.byKey(const ValueKey('scene-text-0')), findsOneWidget);
    expect(find.text(ps.steps.first.caption.en), findsOneWidget);
  });
}
