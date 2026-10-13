import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_3d/kinetix_3d.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

/// Recenter beside Start again in the viewer's tool strip, against a fake viewer page.
Future<FakeViewerEngine> _open(WidgetTester tester, {Size size = const Size(1600, 900), Locale locale = const Locale('en')}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(MaterialApp(
    theme: KinetixTheme.boardChrome(),
    locale: locale,
    supportedLocales: const [Locale('en'), Locale('hi'), Locale('kn')],
    localizationsDelegates: GlobalMaterialLocalizations.delegates,
    home: const Scaffold(body: Model3dViewer(modelId: 'heart')),
  ));
  await tester.pump();
  await tester.pump();
  return FakeViewerEngine.last!;
}

void main() {
  setUp(() {
    FakeViewerEngine.last = null;
    Viewer3dEngine.debugOverride = FakeViewerEngine.new;
    ViewerManifest.debugLoad = (id) async => ViewerManifest.fromJson(jsonDecode(File('assets/viewer3d/models/$id.json').readAsStringSync()) as Map<String, dynamic>);
  });
  tearDown(() {
    Viewer3dEngine.debugOverride = null;
    ViewerManifest.debugLoad = null;
  });

  test('recenter is a command viewer.js runs, apart from reset', () {
    expect(ViewerCommands.recenter(), {'cmd': 'recenter'});
    expect(ViewerCommands.names, containsAll(['recenter', 'reset']));
    final source = File('tool/models/src/viewer.js').readAsStringSync();
    expect(source, contains('recenter: () => recenter()'));
    // It keeps what is hidden: no visibility, cut or take-apart change in it.
    final body = source.substring(source.indexOf('function recenter()'), source.indexOf('// ------------------------------------------------------------------ interaction'));
    expect(body, isNot(contains('state.hidden')));
    expect(body, isNot(contains('applyExplode')));
    expect(body, isNot(contains('setSlice')));
  });

  testWidgets('Recenter sits next to Start again and keeps hidden parts hidden', (tester) async {
    final e = await _open(tester);
    final recenter = find.byKey(const ValueKey('model3d-recenter'));
    expect(recenter, findsOneWidget);
    expect(tester.getTopLeft(recenter).dx, lessThan(tester.getTopLeft(find.byKey(const ValueKey('model3d-reset'))).dx));
    expect(find.byTooltip('Recenter: fit what is shown'), findsOneWidget);

    // Hide a part, then recenter: only `recenter` goes, no reset and no visibility change.
    final eye = find.byKey(const ValueKey('part-eye-aorta'));
    if (eye.evaluate().isEmpty) {
      await tester.tap(find.byKey(const ValueKey('tab-parts')));
      await tester.pump();
    }
    await tester.ensureVisible(find.byKey(const ValueKey('part-eye-aorta')));
    await tester.tap(find.byKey(const ValueKey('part-eye-aorta')));
    await tester.pump();
    final hidden = e.lastOf('hide');
    expect(hidden!['parts'], contains('aorta'));
    final before = e.sent.length;
    await tester.tap(recenter);
    await tester.pump();
    final after = e.sent.sublist(before);
    expect(after, [
      {'cmd': 'recenter'},
    ]);
    expect(e.lastOf('hide'), hidden);

    // Start again still clears everything.
    await tester.tap(find.byKey(const ValueKey('model3d-reset')));
    await tester.pump();
    expect(e.lastOf('reset'), isNotNull);
    expect(e.lastOf('hide')!['parts'], isEmpty);
  });

  testWidgets('an older viewer page without recenter frames the shown parts from the first view', (tester) async {
    final e = await _open(tester);
    e.receive(ViewerEvent({'event': 'error', 'message': 'unknown command recenter'}));
    await tester.pump();
    expect(e.lastOf('view'), isNotNull);
    expect(e.lastOf('reset'), isNull);
    final before = e.sent.length;
    await tester.tap(find.byKey(const ValueKey('model3d-recenter')));
    await tester.pump();
    expect(e.sent.sublist(before).single['cmd'], 'view');
  });

  testWidgets('the tool strip still fits a phone with Recenter in it', (tester) async {
    await _open(tester, size: const Size(360, 740));
    expect(tester.takeException(), isNull);
    expect(find.byKey(const ValueKey('model3d-recenter')), findsOneWidget);
  });

  testWidgets('the tooltip is in Hindi and Kannada', (tester) async {
    await _open(tester, locale: const Locale('hi'));
    expect(find.byTooltip(const Viewer3dStrings('hi').recenter), findsOneWidget);
    await _open(tester, locale: const Locale('kn'));
    expect(find.byTooltip(const Viewer3dStrings('kn').recenter), findsOneWidget);
  });
}
