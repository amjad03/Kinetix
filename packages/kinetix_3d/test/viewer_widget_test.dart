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

  testWidgets('kinds of cut: half, cake slice, slab, depth and peel', (tester) async {
    final e = (await _open(tester, const Model3dViewer(modelId: 'earth_layers')))!;
    await tester.tap(find.byKey(const ValueKey('tab-cut')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('cut-mode-wedge')));
    await tester.pump();
    expect(e.lastOf('cut'), {'cmd': 'cut', 'mode': 'wedge', 'axis': 'z', 'angle': 90.0, 'turn': 0.0});
    expect(e.lastOf('view'), isNotNull); // looks into the slice
    await tester.tap(find.byKey(const ValueKey('cut-axis-y')));
    await tester.pump();
    expect(e.lastOf('cut')!['axis'], 'y');
    await tester.drag(find.byKey(const ValueKey('cut-angle')), const Offset(120, 0));
    await tester.pump();
    expect(e.lastOf('cut')!['angle'], greaterThan(90));
    await tester.tap(find.byKey(const ValueKey('cut-turn')));
    await tester.pump();
    expect(e.lastOf('cut')!['turn'], 90.0);

    await tester.tap(find.byKey(const ValueKey('cut-mode-slab')));
    await tester.pump();
    expect(e.lastOf('cut'), containsPair('mode', 'slab'));
    await tester.drag(find.byKey(const ValueKey('cut-thickness')), const Offset(-60, 0));
    await tester.pump();
    expect(e.lastOf('cut')!['thickness'], lessThan(0.2));

    await tester.tap(find.byKey(const ValueKey('cut-mode-depth')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('cut-sweep')));
    await tester.pump();
    expect(e.lastOf('cut'), containsPair('play', true));
    e.receive('{"event":"cut","mode":"depth","depth":0.95,"done":true}');
    await tester.pump();
    expect(find.text('How deep: 95%'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('cut-mode-peel')));
    await tester.pump();
    await tester.pump();
    expect(e.lastOf('cut'), {'cmd': 'cut', 'mode': 'peel', 'peel': 1});
    expect(find.text('1 of 4 layers taken off'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('cut-mode-half')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('cut-flip')));
    await tester.pump();
    expect(e.lastOf('cut'), containsPair('flip', true));

    // A ready-made cut takes over; closing ends every kind.
    await tester.tap(find.byKey(const ValueKey('slice-wedge')));
    await tester.pump();
    expect(e.lastOf('slice')!['normal2'], isNotNull);
    expect(tester.widget<ChoiceChip>(find.byKey(const ValueKey('cut-mode-half'))).selected, isFalse);
    await tester.tap(find.byKey(const ValueKey('slice-off')));
    await tester.pump();
    expect(e.lastOf('slice'), {'cmd': 'slice'});
  });

  testWidgets('notes: pin one on the model, write it, draw, list and delete', (tester) async {
    final changes = <Model3dAnnotations>[];
    final saved = Model3dAnnotations(pins: [const Model3dPin(id: 'old', part: 'crust', at: [0, 0.1, 0], text: 'We live here')]);
    final e = (await _open(tester, Model3dViewer(modelId: 'earth_layers', annotations: saved, onAnnotationsChanged: changes.add)))!;
    e.partUnder = (_) => 'outer_core';
    // The saved notes go back on the model.
    expect(e.allOf('annotate').first, {'cmd': 'annotate', 'op': 'set', 'data': saved.toJson()});

    await tester.tap(find.byKey(const ValueKey('model3d-write')));
    await tester.pump();
    expect(find.byKey(const ValueKey('pen-palette')), findsOneWidget);
    expect(find.byKey(const ValueKey('model3d-pen-layer')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('swatch-#3d8bf2')));
    await tester.pump();
    final stage = tester.getCenter(find.byKey(const ValueKey('model3d-stage')));
    await tester.tapAt(stage + const Offset(0, 40));
    await tester.pump();
    await tester.pump();
    expect(e.lastOf('annotate'), containsPair('op', 'pin'));
    expect(e.lastOf('annotate'), containsPair('color', '#3d8bf2'));
    // The new pin's editor opens at once.
    expect(find.byKey(const ValueKey('pin-editor')), findsOneWidget);
    await tester.enterText(find.byKey(const ValueKey('pin-text')), 'Liquid iron, 4,500 °C');
    await tester.tap(find.byKey(const ValueKey('pin-save')));
    await tester.pumpAndSettle();
    expect(e.lastOf('annotate'), containsPair('op', 'update'));
    expect(changes.last.pins.map((p) => p.text), ['We live here', 'Liquid iron, 4,500 °C']);
    expect(changes.last.pins.last.part, 'outer_core');

    // Draw on the model, then over the view.
    await tester.tap(find.byKey(const ValueKey('pen-surface')));
    await tester.pump();
    await tester.dragFrom(stage, const Offset(80, 30));
    await tester.pump();
    expect(e.allOf('annotate').where((c) => c['op'] == 'stroke').last, containsPair('up', true));
    expect(changes.last.strokes, hasLength(1));
    await tester.tap(find.byKey(const ValueKey('pen-screen')));
    await tester.pump();
    await tester.dragFrom(stage, const Offset(-60, 20));
    await tester.pump();
    expect(changes.last.ink, hasLength(1));
    expect(e.allOf('annotate').where((c) => c['op'] == 'stroke').last['surface'], isFalse);
    await tester.tap(find.byKey(const ValueKey('pen-undo')));
    await tester.pump();
    expect(changes.last.ink, isEmpty);
    await tester.tap(find.byKey(const ValueKey('pen-done')));
    await tester.pump();
    expect(find.byKey(const ValueKey('model3d-pen-layer')), findsNothing);

    // The list.
    await tester.tap(find.byKey(const ValueKey('tab-notes')));
    await tester.pump();
    expect(find.text('We live here'), findsOneWidget);
    expect(find.text('Drawing on Outer core'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('note-delete-old')));
    await tester.pump();
    expect(changes.last.pins.map((p) => p.text), ['Liquid iron, 4,500 °C']);
    await tester.tap(find.byKey(const ValueKey('notes-show')));
    await tester.pump();
    expect(e.lastOf('annotate'), {'cmd': 'annotate', 'op': 'show', 'on': false});
    await tester.tap(find.byKey(const ValueKey('notes-clear')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('notes-clear-yes')));
    await tester.pumpAndSettle();
    expect(changes.last.isEmpty, isTrue);
  });

  testWidgets('a tap off the model pins nothing; the snapshot carries the notes', (tester) async {
    Model3dSnapshot? got;
    final e = (await _open(tester, Model3dViewer(modelId: 'earth_layers', onSnapshot: (s) => got = s)))!;
    await tester.tap(find.byKey(const ValueKey('model3d-write')));
    await tester.pump();
    await tester.tapAt(tester.getCenter(find.byKey(const ValueKey('model3d-stage'))));
    await tester.pump();
    await tester.pump();
    expect(find.text('Tap on the model to pin a note there.'), findsOneWidget);
    e.partUnder = (_) => 'inner_core';
    await tester.tapAt(tester.getCenter(find.byKey(const ValueKey('model3d-stage'))));
    await tester.pump();
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('pin-save')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('model3d-board')));
    await tester.pump();
    await tester.pump();
    expect(got!.annotations.pins.single.part, 'inner_core');
  });

  testWidgets('a scope\'s store keeps the notes for the lesson and gives them back', (tester) async {
    final store = Model3dAnnotationStore(lesson: 'geo-7');
    final e = (await _open(tester, Model3dScope(annotations: store, child: const Model3dViewer(modelId: 'earth_layers'))))!;
    expect(e.allOf('annotate'), isEmpty); // nothing saved yet
    e.receive(jsonEncode({'event': 'annotations', 'data': {'pins': [{'id': 'p1', 'part': 'crust', 'at': [0, 0, 0.1], 'text': 'Plates', 'color': '#f2b33d'}]}}));
    await tester.pump();
    expect(store.of('earth_layers').pins.single.text, 'Plates');
    await tester.pumpWidget(const SizedBox());
    final again = (await _open(tester, Model3dScope(annotations: store, child: const Model3dViewer(modelId: 'earth_layers'))))!;
    expect(again.lastOf('annotate')!['op'], 'set');
    expect(again.lastOf('annotate')!['data'], store.of('earth_layers').toJson());
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
