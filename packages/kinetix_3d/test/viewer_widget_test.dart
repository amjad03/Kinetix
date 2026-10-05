import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_3d/kinetix_3d.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

/// The viewer's controls against a fake viewer page ([FakeViewerEngine]): what the
/// teacher does becomes the right commands, and what the page says shows up.
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
  setUp(() {
    FakeViewerEngine.last = null;
    Viewer3dEngine.debugOverride = FakeViewerEngine.new;
    // Manifests straight from the package's assets.
    ViewerManifest.debugLoad = (id) async => ViewerManifest.fromJson(jsonDecode(File('assets/viewer3d/models/$id.json').readAsStringSync()) as Map<String, dynamic>);
  });
  tearDown(() {
    Viewer3dEngine.debugOverride = null;
    ViewerManifest.debugLoad = null;
  });

  testWidgets('opens the model in the teacher\'s language and labels what is tapped', (tester) async {
    final e = (await _open(tester, const Model3dViewer(modelId: 'heart')))!;
    expect(e.opened, ['heart:en']);
    expect(e.lastOf('labels'), {'cmd': 'labels', 'mode': 'picked'});
    expect(find.text('Human heart'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('labels-all')));
    await tester.pump();
    expect(e.lastOf('labels')!['mode'], 'all');

    await tester.tap(find.byKey(const ValueKey('part-left_ventricle')));
    await tester.pump();
    expect(e.lastOf('pick'), {'cmd': 'pick', 'part': 'left_ventricle'});
    expect(find.byKey(const ValueKey('part-card')), findsOneWidget);
    expect(find.text('Left ventricle'), findsWidgets);
  });

  testWidgets('Hindi and Kannada names come from the manifest', (tester) async {
    await _open(tester, const Model3dViewer(modelId: 'heart'), locale: const Locale('hi'));
    expect(find.text('मानव हृदय'), findsOneWidget);
    expect(find.text('भाग'), findsOneWidget); // the Parts tab
    await tester.pumpWidget(const SizedBox());
    await _open(tester, const Model3dViewer(modelId: 'heart', lang: 'kn'));
    expect(find.text('ಮಾನವ ಹೃದಯ'), findsOneWidget);
    expect(FakeViewerEngine.last!.opened.last, 'heart:kn');
  });

  testWidgets('the laser draws a trail, names the part under it, and two fingers turn the model', (tester) async {
    final e = (await _open(tester, const Model3dViewer(modelId: 'heart')))!;
    e.partUnder = (at) => at.dx < 0.5 ? 'left_ventricle' : 'aorta';
    await tester.tap(find.byKey(const ValueKey('model3d-laser')));
    await tester.pump();
    final layer = find.byKey(const ValueKey('model3d-laser-layer'));
    expect(layer, findsOneWidget);
    expect(find.text('Point with one finger; turn the model with two.'), findsOneWidget);

    final box = tester.getRect(layer);
    final g = await tester.startGesture(box.center - Offset(box.width * 0.2, 0));
    await tester.pump(const Duration(milliseconds: 40));
    await g.moveBy(const Offset(30, 10));
    await tester.pump(const Duration(milliseconds: 40));
    await g.moveBy(const Offset(30, 10));
    await tester.pump(const Duration(milliseconds: 40));
    final lasers = e.allOf('laser');
    expect(lasers, isNotEmpty);
    expect(lasers.first['pts'], isNotEmpty);
    expect(lasers.first['fade'], 1200);
    // The page found the left ventricle under the tip: its name is on screen.
    expect(find.byKey(const ValueKey('laser-part')), findsOneWidget);
    expect(find.descendant(of: find.byKey(const ValueKey('laser-part')), matching: find.text('Left ventricle')), findsOneWidget);

    // A second finger stops drawing and turns the model instead.
    final g2 = await tester.startGesture(box.center + Offset(box.width * 0.1, 0));
    await tester.pump();
    expect(e.lastOf('laser')!['up'], isTrue);
    final before = e.allOf('laser').length;
    await g.moveBy(const Offset(60, 0));
    await g2.moveBy(const Offset(60, 0));
    await tester.pump();
    expect(e.lastOf('orbit'), isNotNull);
    expect(e.lastOf('orbit')!['dx'], greaterThan(0));
    expect(e.allOf('laser').length, before, reason: 'turning does not draw');
    await g.up();
    await g2.up();
    await tester.pump(const Duration(seconds: 2));

    // Putting the laser away tells the page.
    await tester.tap(find.byKey(const ValueKey('model3d-laser')));
    await tester.pump();
    expect(e.lastOf('laser'), {'cmd': 'laser', 'off': true});
    expect(find.byKey(const ValueKey('model3d-laser-layer')), findsNothing);
    expect(find.byKey(const ValueKey('laser-part')), findsNothing);
  });

  testWidgets('"Put on board" hands the board a PNG of the view', (tester) async {
    Model3dSnapshot? got;
    final e = (await _open(tester, Model3dViewer(modelId: 'heart', onSnapshot: (s) => got = s)))!;
    await tester.tap(find.byKey(const ValueKey('model3d-board')));
    await tester.pump();
    await tester.pump();
    expect(e.lastOf('snapshot'), isNotNull);
    expect(got, isNotNull);
    expect(got!.modelId, 'heart');
    expect(got!.title, 'Human heart');
    expect(got!.png.sublist(1, 4), utf8.encode('PNG'));
    expect(got!.credit, contains('BodyParts3D'));
    expect(find.text('On the board'), findsOneWidget);
    await tester.pump(const Duration(seconds: 3));
    expect(find.text('Put on board'), findsOneWidget);
  });

  testWidgets('a controller can take the snapshot; a Model3dScope can receive it', (tester) async {
    final ctrl = Model3dViewerController();
    Model3dSnapshot? scoped;
    await _open(tester, Model3dScope(onSnapshot: (s) => scoped = s, child: Model3dViewer(modelId: 'eye', controller: ctrl)));
    expect(ctrl.loaded, isTrue);
    final shot = ctrl.snapshot();
    await tester.pump();
    expect((await shot)!.modelId, 'eye');
    // The scope gives the toolbar its "Put on board".
    await tester.tap(find.byKey(const ValueKey('model3d-board')));
    await tester.pump();
    await tester.pump();
    expect(scoped?.modelId, 'eye');
    ctrl.laser = true;
    await tester.pump();
    expect(find.byKey(const ValueKey('model3d-laser-layer')), findsOneWidget);
  });

  testWidgets('cuts, take apart, animations and views send their commands', (tester) async {
    final e = (await _open(tester, const Model3dViewer(modelId: 'heart')))!;
    await tester.tap(find.byKey(const ValueKey('tab-cut')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('slice-four_chambers')));
    await tester.pump();
    expect(e.lastOf('slice')!['id'], 'four_chambers');
    await tester.tap(find.byKey(const ValueKey('slice-off')));
    await tester.pump();
    expect(e.lastOf('slice'), {'cmd': 'slice'});

    await tester.tap(find.byKey(const ValueKey('tab-apart')));
    await tester.pump();
    await tester.drag(find.byKey(const ValueKey('explode-slider')), const Offset(100, 0));
    await tester.pump();
    expect(e.lastOf('explode')!['amount'], greaterThan(0));

    await tester.tap(find.byKey(const ValueKey('tab-animate')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('anim-beat')));
    await tester.pump();
    expect(e.lastOf('animate'), {'cmd': 'animate', 'id': 'beat', 'step': 0});

    await tester.tap(find.byKey(const ValueKey('tab-views')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('view-front')));
    await tester.pump();
    expect(e.lastOf('view')!['dir'], [0, 0, 1]);

    await tester.tap(find.byKey(const ValueKey('model3d-reset')));
    await tester.pump();
    expect(e.lastOf('reset'), isNotNull);
  });

  testWidgets('flow animations step through their cards', (tester) async {
    final e = (await _open(tester, const Model3dViewer(modelId: 'nephron')))!;
    await tester.tap(find.byKey(const ValueKey('tab-animate')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('anim-urine')));
    await tester.pump();
    expect(find.byKey(const ValueKey('flow-card')), findsOneWidget);
    expect(find.textContaining('step 1 of 6'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('flow-next')));
    await tester.pump();
    expect(e.lastOf('step'), {'cmd': 'step', 'step': 1});
    await tester.tap(find.byKey(const ValueKey('flow-stop')));
    await tester.pump();
    expect(find.byKey(const ValueKey('flow-card')), findsNothing);
  });

  testWidgets('versions: chips for a few, a menu for many, and the first version asked for', (tester) async {
    final e = (await _open(tester, const Model3dViewer(modelId: 'crystal_lattices')))!;
    expect(find.byKey(const ValueKey('variant-fcc')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('variant-fcc')));
    await tester.pump();
    expect(e.lastOf('variant'), {'cmd': 'variant', 'id': 'fcc'});
    expect(find.byKey(const ValueKey('part-fcc_faces')), findsOneWidget);
    expect(find.byKey(const ValueKey('part-bcc_centre')), findsNothing);

    await tester.pumpWidget(const SizedBox());
    final m = (await _open(tester, const Model3dViewer(modelId: 'molecules', variant: 'ch4')))!;
    expect(find.byKey(const ValueKey('variant-menu')), findsOneWidget);
    expect(m.lastOf('variant'), {'cmd': 'variant', 'id': 'ch4'});
  });

  testWidgets('the old catalogue ids open the viewer at the right version', (tester) async {
    final e = (await _open(tester, const ModelView(id: 'chem.water')))!;
    expect(e.opened, ['molecules:en']);
    expect(e.lastOf('variant'), {'cmd': 'variant', 'id': 'h2o'});
    await tester.pumpWidget(const SizedBox());
    // Solids keep the measuring explorer.
    await _open(tester, const ModelView(id: 'solid.cone'));
    expect(find.byType(SolidExplorer), findsOneWidget);
  });

  testWidgets('credits: the model\'s maker and three.js, BodyParts3D for anatomy', (tester) async {
    await _open(tester, const Model3dViewer(modelId: 'brain'));
    expect(find.textContaining('BodyParts3D'), findsOneWidget); // the credit line
    await tester.tap(find.byKey(const ValueKey('model3d-about')));
    await tester.pumpAndSettle();
    final dialog = find.byKey(const ValueKey('model3d-credits'));
    expect(find.descendant(of: dialog, matching: find.textContaining('three.js (MIT License)')), findsOneWidget);
    expect(find.descendant(of: dialog, matching: find.textContaining('CC BY 4.0')), findsWidgets);
  });

  testWidgets('pictures for the students\' screen while someone watches', (tester) async {
    final frames = <Uint8List?>[];
    final e = (await _open(tester, Model3dViewer(modelId: 'heart', mirror: Model3dMirror(wanted: () => true, send: frames.add))))!;
    expect(e.lastOf('mirror'), {'cmd': 'mirror', 'on': true, 'maxWidth': 960});
    await tester.pump();
    expect(frames, isNotEmpty);
    expect(frames.first, isNotNull);
    await tester.pumpWidget(const SizedBox());
    expect(frames.last, isNull, reason: 'closing the model clears the students\' screen');
  });

  testWidgets('narrow panes put the controls under the model', (tester) async {
    await _open(tester, const Model3dViewer(modelId: 'heart'), size: const Size(420, 800));
    expect(tester.takeException(), isNull);
    await tester.tap(find.byKey(const ValueKey('tab-parts')));
    await tester.pump();
    expect(find.byKey(const ValueKey('tab-parts')), findsOneWidget);
  });

  testWidgets('without a WebView it lists the parts instead', (tester) async {
    Viewer3dEngine.debugOverride = null;
    await _open(tester, const Model3dViewer(modelId: 'ear'));
    expect(find.byKey(const ValueKey('model3d-parts-list')), findsOneWidget);
    expect(find.text('Pinna (outer ear)'), findsOneWidget);
    expect(find.textContaining('cannot show this 3D model'), findsOneWidget);
  });

  testWidgets('the library finds models by name in any language and opens one', (tester) async {
    String? picked;
    await _open(tester, Model3dLibrary(onPick: (id) => picked = id, lang: 'hi'));
    expect(find.text('3D मॉडल'), findsOneWidget);
    await tester.enterText(find.byKey(const ValueKey('model3d-search')), 'कक्षक');
    await tester.pump();
    expect(find.byKey(const ValueKey('model3d-pick-orbitals')), findsOneWidget);
    expect(find.byKey(const ValueKey('model3d-pick-heart')), findsNothing);
    await tester.tap(find.byKey(const ValueKey('model3d-pick-orbitals')));
    expect(picked, 'orbitals');
  });
}
