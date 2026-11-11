import 'dart:io';
import 'dart:ui' show ImageByteFormat;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_lessons/kinetix_lessons.dart';

/// Screenshots of the instrument library at smartboard size (1920 x 1080), two or more states
/// each, rendered from lesson-step JSON the way a lesson references them. Set SHOTS to a
/// directory to save PNGs.
Future<void> _fonts() async {
  const dir = '../kinetix_ui/fonts';
  Future<void> load(String family, List<String> files) async {
    final loader = FontLoader(family);
    for (final f in files) {
      loader.addFont(Future.value(ByteData.sublistView(File(f.startsWith('/') ? f : '$dir/$f').readAsBytesSync())));
    }
    await loader.load();
  }

  await load('packages/kinetix_ui/SansFlex', ['SansFlex-400.ttf', 'SansFlex-500.ttf', 'SansFlex-600.ttf', 'SansFlex-700.ttf']);
  await load('packages/kinetix_ui/Inter', ['Inter-400.ttf', 'Inter-500.ttf', 'Inter-700.ttf']);
  await load('packages/kinetix_ui/NotoSansMath', ['NotoSansMath-400.ttf']);
  await load('MaterialIcons', ['/home/user/sdk/flutter/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf']);
}

final _out = Platform.environment['SHOTS'];

Future<void> _shot(WidgetTester t, Map<String, dynamic> step, String name, {Future<void> Function()? act}) async {
  t.view.physicalSize = const Size(1920, 1080);
  t.view.devicePixelRatio = 1;
  final key = GlobalKey();
  await t.pumpWidget(MaterialApp(
    debugShowCheckedModeBanner: false,
    home: RepaintBoundary(key: key, child: InstrumentBlockView(raw: step)),
  ));
  await t.pump();
  if (act != null) await act();
  await t.pump(const Duration(milliseconds: 300));
  expect(t.takeException(), isNull);
  if (_out == null) return;
  await t.runAsync(() async {
    final ro = key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
    final img = await ro.toImage();
    final bytes = await img.toByteData(format: ImageByteFormat.png);
    File('$_out/$name.png').writeAsBytesSync(bytes!.buffer.asUint8List());
  });
}

Map<String, dynamic> step(String id, [Map<String, dynamic> preset = const {}]) => {'type': 'interactive', 'kind': 'instrument', 'instrument': id, 'preset': preset};

void main() {
  setUpAll(_fonts);

  testWidgets('efield', (t) async {
    await _shot(t, step('efield'), 'efield-1-dipole');
    await _shot(t, step('efield', {'charges': [{'q': 4, 'x': -4, 'y': 1}, {'q': -1, 'x': 5, 'y': -1}], 'test': {'x': 9, 'y': 3}}), 'efield-2-unequal');
    await _shot(t, step('efield', {'charges': [{'q': 2, 'x': -5, 'y': 0}, {'q': 2, 'x': 5, 'y': 0}], 'test': {'x': 0, 'y': 4}, 'equipotentials': false}), 'efield-3-like');
  });

  testWidgets('optics', (t) async {
    await _shot(t, step('optics'), 'optics-1-convex');
    await _shot(t, step('optics', {'element': 'convexLens', 'f': 15, 'u': 9}), 'optics-2-magnifier');
    await _shot(t, step('optics', {'element': 'concaveMirror', 'f': 15, 'u': 25}), 'optics-3-concave-mirror');
    await _shot(t, step('optics', {'element': 'concaveLens', 'f': 15, 'u': 30}), 'optics-4-concave-lens');
  });

  testWidgets('titration', (t) async {
    await _shot(t, step('titration', {'acid': 'HCl', 'added': 18}), 'titration-1-before');
    await _shot(t, step('titration', {'acid': 'HCl', 'added': 25.4}), 'titration-2-endpoint');
    await _shot(t, step('titration', {'acid': 'CH3COOH', 'added': 12.5, 'indicator': 'methylOrange'}), 'titration-3-acetic');
  });

  testWidgets('graph', (t) async {
    await _shot(t, step('graph'), 'graph-1-parabola');
    await _shot(t, step('graph', {'family': 'sine', 'a': 2, 'b': 1, 'c': 0, 'x0': 1, 'from': 0, 'to': 3.14159}), 'graph-2-sine');
  });

  testWidgets('presets and unknown ids', (t) async {
    await _shot(t, step('graph'), 'graph-3-cubic-tapped', act: () async {
      await t.tap(find.text('Cubic').last);
      await t.pump();
    });
    await t.pumpWidget(MaterialApp(home: InstrumentBlockView(raw: step('nope'))));
    expect(find.textContaining('not in this version'), findsOneWidget);
  });

  test('an unknown instrument falls back to the step it replaced', () {
    final legacy = {'type': 'interactive', 'kind': 'scene', 'title': {'en': 'Old'}};
    final known = Block.fromJson({'id': 's', 'type': 'interactive', 'kind': 'instrument', 'instrument': 'graph', 'legacy': legacy})!;
    expect(known.s('kind'), 'instrument');
    final old = Block.fromJson({'id': 's', 'type': 'interactive', 'kind': 'instrument', 'instrument': 'nope', 'legacy': legacy})!;
    expect((old.s('kind'), old.id), ('scene', 's'));
    final none = Block.fromJson({'id': 's', 'type': 'interactive', 'kind': 'instrument', 'instrument': 'nope'})!;
    expect(none.s('kind'), 'instrument');
  });
}
