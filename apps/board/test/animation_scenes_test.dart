import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_3d/kinetix_3d.dart';
import 'package:kinetix_animations/kinetix_animations.dart';
import 'package:kinetix_board/features/board/animations_hook.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

/// The Animations tab opens the animations made as narrated 3D scenes in the 3D viewer, in the
/// panel (against a fake viewer page: there is no WebView under test).
void main() {
  setUp(() => Viewer3dEngine.debugOverride = FakeViewerEngine.new);
  tearDown(() => Viewer3dEngine.debugOverride = null);

  Future<void> pump(WidgetTester tester, {Size size = const Size(1280, 800), Locale locale = const Locale('en')}) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(
      theme: KinetixTheme.board(),
      locale: locale,
      supportedLocales: const [Locale('en'), Locale('hi'), Locale('kn')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      home: Scaffold(body: AnimationsPanel(sceneOpener: animationScenes, lang: AnimLang.fromCode(locale.languageCode))),
    ));
    await tester.pump();
  }

  test('every 3D animation names a scene the viewer has, with its picture', () {
    expect(scene3dIds, isNotEmpty);
    for (final MapEntry(key: animId, value: sceneId) in scene3dIds.entries) {
      final a = animationById(animId);
      expect(a, isNotNull, reason: animId);
      expect(a!.isScene3d, isTrue);
      expect(a.sceneId, sceneId);
      final scene = ProcessScene.byId(sceneId);
      expect(scene, isNotNull, reason: 'scene $sceneId');
      final file = File('../../packages/kinetix_3d/${scene!.thumbAsset.replaceFirst('packages/kinetix_3d/', '')}');
      expect(file.existsSync(), isTrue, reason: '${file.path}: make the scene pictures (tool/models)');
    }
  });

  testWidgets('a 3D animation opens in the viewer in the panel, and back returns to the list', (tester) async {
    await pump(tester);
    expect(find.byKey(const ValueKey('anim-3d-photosynthesis')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('anim-tile-photosynthesis')));
    await tester.pump();
    await tester.pump();
    expect(find.byType(AnimationScene), findsOneWidget);
    expect(find.byKey(const ValueKey('scene-player')), findsOneWidget);
    expect(FakeViewerEngine.last!.opened, ['scene:photosynthesis:en']);
    expect(find.text('Photosynthesis'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('anim-scene-back')));
    await tester.pump();
    expect(find.byType(AnimationScene), findsNothing);
    expect(find.byKey(const ValueKey('anim-tile-photosynthesis')), findsOneWidget);
  });

  for (final (lang, size) in const [('hi', Size(1920, 1080)), ('kn', Size(360, 740))]) {
    testWidgets('in $lang at ${size.width.toInt()}×${size.height.toInt()} the scene speaks the teacher\'s language', (tester) async {
      await pump(tester, size: size, locale: Locale(lang));
      await tester.tap(find.byKey(const ValueKey('anim-tile-photosynthesis')));
      await tester.pump();
      await tester.pump();
      expect(FakeViewerEngine.last!.opened, ['scene:photosynthesis:$lang']);
      expect(find.text(ProcessScene.byId('photosynthesis')!.steps.first.caption.of(lang)), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('the 2D animations still play in the panel', (tester) async {
    await pump(tester);
    final drawn = animationCatalogue.firstWhere((a) => !a.isScene3d);
    await tester.enterText(find.byKey(const ValueKey('anim-search')), drawn.title.en);
    await tester.pump();
    await tester.tap(find.byKey(ValueKey('anim-tile-${drawn.id}')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.byKey(const ValueKey('anim-canvas')), findsOneWidget);
    expect(find.byType(AnimationScene), findsNothing);
  });
}
