import 'dart:convert';
import 'dart:io';
import 'dart:ui' show ImageByteFormat;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_lessons/kinetix_lessons.dart';

/// Every maths instrument with every preset in tool/instrument_map/maths.json, pumped at
/// smartboard size (1920 x 1080). Set SHOTS to save one PNG per instrument (SHOTS_ALL=1 saves
/// every mapped step).
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
final _all = Platform.environment['SHOTS_ALL'] == '1';
final _only = Platform.environment['ONLY'];

Map<String, dynamic> _step(String id, Map<String, dynamic> preset) => {'type': 'interactive', 'kind': 'instrument', 'instrument': id, 'preset': preset};

Future<void> _pump(WidgetTester t, Map<String, dynamic> step, String? name) async {
  t.view.physicalSize = const Size(1920, 1080);
  t.view.devicePixelRatio = 1;
  final key = GlobalKey();
  await t.pumpWidget(MaterialApp(debugShowCheckedModeBanner: false, home: RepaintBoundary(key: key, child: InstrumentBlockView(raw: step))));
  await t.pump(const Duration(milliseconds: 300));
  expect(t.takeException(), isNull, reason: name);
  expect(find.textContaining('not in this version'), findsNothing, reason: name);
  if (_out == null || name == null) return;
  await t.runAsync(() async {
    final ro = key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
    final img = await ro.toImage();
    final bytes = await img.toByteData(format: ImageByteFormat.png);
    File('$_out/$name.png').writeAsBytesSync(bytes!.buffer.asUint8List());
  });
}

void main() {
  setUpAll(_fonts);
  final entries = (jsonDecode(File('tool/instrument_map/maths.json').readAsStringSync()) as List).cast<Map<String, dynamic>>();

  test('every mapped instrument exists', () {
    for (final e in entries) {
      expect(instrumentIds, contains(e['instrument']), reason: '${e['chapter']} ${e['step']}');
    }
  });

  final byInstrument = <String, List<Map<String, dynamic>>>{};
  for (final e in entries) {
    byInstrument.putIfAbsent(e['instrument'] as String, () => []).add(e);
  }
  for (final id in byInstrument.keys) {
    if (_only != null && !_only!.split(',').contains(id)) continue;
    testWidgets(id, (t) async {
      final list = byInstrument[id]!;
      // The default (empty) preset must work too.
      await _pump(t, _step(id, const {}), null);
      final showcase = list.indexWhere((e) => e['showcase'] == true);
      for (final (i, e) in list.indexed) {
        final shot = _all ? '$id-${(e['chapter'] as String).split('-').take(3).join('-')}-${(e['step'] as String).replaceAll('/', '_')}' : (i == (showcase < 0 ? 0 : showcase) ? id : null);
        await _pump(t, _step(id, (e['preset'] as Map).cast<String, dynamic>()), shot);
      }
    });
  }
}
