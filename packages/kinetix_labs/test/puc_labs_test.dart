import 'dart:convert';
import 'dart:io';
import 'dart:ui' show ImageByteFormat;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_labs/kinetix_labs.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

/// Every lab the Karnataka PUC practical map names (tool/lab_map.json in
/// kinetix_lessons) opens at smartboard size (1920 x 1080), walks its steps,
/// records readings, shows its result and viva, and renders its record page.
/// Set SHOTS to a directory to save one PNG per lab.
Future<void> _fonts() async {
  const dir = '../kinetix_ui/fonts';
  Future<void> load(String family, List<String> files) async {
    final loader = FontLoader(family);
    for (final f in files) {
      final file = File(f.startsWith('/') ? f : '$dir/$f');
      if (!file.existsSync()) continue;
      loader.addFont(Future.value(ByteData.sublistView(file.readAsBytesSync())));
    }
    await loader.load();
  }

  await load('packages/kinetix_ui/SansFlex', ['SansFlex-400.ttf', 'SansFlex-500.ttf', 'SansFlex-600.ttf', 'SansFlex-700.ttf']);
  await load('packages/kinetix_ui/Inter', ['Inter-400.ttf', 'Inter-500.ttf', 'Inter-700.ttf']);
  await load('packages/kinetix_ui/NotoSansMath', ['NotoSansMath-400.ttf']);
  await load('packages/kinetix_ui/NotoSansDevanagari', ['NotoSansDevanagari-400.ttf', 'NotoSansDevanagari-700.ttf']);
  await load('packages/kinetix_ui/NotoSansKannada', ['NotoSansKannada-400.ttf', 'NotoSansKannada-700.ttf']);
  await load('MaterialIcons', ['/home/user/sdk/flutter/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf']);
}

final _out = Platform.environment['SHOTS'];

/// The labs of the practical map, in map order.
List<String> _mappedLabs() {
  final f = File('../kinetix_lessons/tool/lab_map.json');
  final ids = <String>[];
  if (f.existsSync()) {
    final j = jsonDecode(f.readAsStringSync()) as Map<String, dynamic>;
    for (final p in j['practicals'] as List) {
      final id = (p as Map)['lab'];
      if (id is String && !ids.contains(id)) ids.add(id);
    }
  }
  return ids;
}

/// The readings to record in each lab: a list of settings, each recorded in
/// turn. Benches without a demo sweep their first slider and then every
/// option of their first choice.
List<LabParams> _plan(VirtualLab l, LabBench b) {
  final start = {...b.defaults, ...l.setup};
  final demo = b is LabDemo ? b.demo(start) : null;
  if (demo != null && demo.isNotEmpty) return demo;
  final preview = {...b.preview, ...l.setup};
  final controls = b.controls(start);
  final slider = controls.whereType<LabSlider>().firstOrNull;
  final choice = controls.whereType<LabChoice>().firstOrNull;
  return [
    if (slider != null)
      for (var k = 0; k < 6; k++) {...preview, slider.key: slider.min + (slider.max - slider.min) * (0.15 + 0.14 * k)},
    if (choice != null)
      for (final (v, _) in choice.options) {...b.act('set:${choice.key}', {...preview, choice.key: v}), if (slider != null) slider.key: slider.max},
    if (slider == null && choice == null) preview,
  ];
}

void main() {
  setUpAll(_fonts);
  final ids = _mappedLabs();

  test('the practical map names labs that exist', () {
    expect(ids, isNotEmpty);
    for (final id in ids) {
      expect(LabCatalogue.byId(id), isNotNull, reason: id);
    }
  });

  for (final id in ids) {
    testWidgets('$id: opens, walks its steps, records, shows result and viva', (t) async {
      t.view.physicalSize = const Size(1920, 1080);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.reset);
      currentLabLang = LabLang.en;
      final entry = LabCatalogue.byId(id)!;
      final key = GlobalKey();
      await t.pumpWidget(MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: KinetixTheme.light(),
        home: RepaintBoundary(key: key, child: Scaffold(body: LabView(id: id))),
      ));
      await t.pump();
      expect(t.takeException(), isNull);
      if (!entry.isBench) {
        await t.pump(const Duration(milliseconds: 500));
        await _save(t, key, id);
        return;
      }
      final state = t.state<LabScreenState>(find.byType(LabScreen));
      final l = state.lab!, b = state.bench!;
      // Walk the steps.
      await t.tap(find.byKey(const ValueKey('lab-tab-steps')));
      await t.pump();
      for (var i = 1; i < l.steps.length; i++) {
        await t.tap(find.byKey(const ValueKey('lab-step-next')));
        await t.pump();
      }
      expect(find.text('Step ${l.steps.length} of ${l.steps.length}'), findsOneWidget);
      // Viva: every answer opens.
      await t.tap(find.byKey(const ValueKey('lab-tab-viva')));
      await t.pump();
      expect(l.viva.length, greaterThanOrEqualTo(3));
      await t.tap(find.byKey(const ValueKey('lab-show-answer-0')));
      await t.pump();
      // Readings.
      for (final p in _plan(l, b)) {
        state.params = p;
        state.record();
        await t.pump();
      }
      state.params = _plan(l, b).last;
      await t.tap(find.byKey(const ValueKey('lab-tab-readings')));
      await t.pump(const Duration(milliseconds: 400));
      expect(t.takeException(), isNull);
      if (b is LabDemo) expect(state.rows, isNotEmpty, reason: '$id: the demo readings record');
      if (state.rows.isNotEmpty) expect(b.result(state.rows), isNotNull, reason: '$id: a result');
      // The record page renders.
      final png = await t.runAsync(() => state.report!.toPng(width: 900));
      expect(png!.sublist(0, 4), [0x89, 0x50, 0x4E, 0x47]);
      await _save(t, key, id);
      if (_out != null) await t.runAsync(() async => File('$_out/$id-record.png').writeAsBytesSync(png));
      await t.pump(const Duration(seconds: 5));
    });
  }
}

Future<void> _save(WidgetTester t, GlobalKey key, String name) async {
  final out = _out;
  if (out == null) return;
  Directory(out).createSync(recursive: true);
  await t.runAsync(() async {
    final ro = key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
    final img = await ro.toImage();
    final bytes = await img.toByteData(format: ImageByteFormat.png);
    File('$out/$name.png').writeAsBytesSync(bytes!.buffer.asUint8List());
  });
}
