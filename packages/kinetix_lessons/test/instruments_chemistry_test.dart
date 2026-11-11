import 'dart:convert';
import 'dart:io';
import 'dart:ui' show ImageByteFormat;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_lessons/src/instruments/titration.dart';
import 'package:kinetix_lessons/src/instruments/chemistry/registry.dart';

/// Every chemistry instrument, pumped with every lesson preset in tool/instrument_map/chemistry.json
/// and with each view's own presets, at smartboard size (1920 × 1080). Set SHOTS to a directory to
/// save one PNG per instrument view.
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

Map<String, dynamic> step(String id, [Map<String, dynamic> preset = const {}]) => {'type': 'interactive', 'kind': 'instrument', 'instrument': id, 'preset': preset};

/// Builds the step's instrument the way buildInstrument does, from the chemistry registry alone
/// (so this test does not depend on the other domains compiling).
Widget _build(Map<String, dynamic> step) {
  final id = step['instrument'] as String;
  final preset = (step['preset'] as Map).cast<String, dynamic>();
  if (id == 'titration') return TitrationInstrument(preset: preset);
  return chemistryInstruments[id]!(preset, null);
}

Future<void> _pump(WidgetTester t, Map<String, dynamic> step, {String? shot}) async {
  t.view.physicalSize = const Size(1920, 1080);
  t.view.devicePixelRatio = 1;
  final key = GlobalKey();
  await t.pumpWidget(MaterialApp(debugShowCheckedModeBanner: false, home: RepaintBoundary(key: key, child: _build(step))));
  await t.pump();
  await t.pump(const Duration(milliseconds: 300));
  expect(t.takeException(), isNull, reason: jsonEncode(step));
  if (_out == null || shot == null) return;
  await t.runAsync(() async {
    final ro = key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
    final img = await ro.toImage();
    final bytes = await img.toByteData(format: ImageByteFormat.png);
    File('$_out/$shot.png').writeAsBytesSync(bytes!.buffer.asUint8List());
  });
  // Unmount between pumps so running clocks stop.
  await t.pumpWidget(const SizedBox());
}

void main() {
  setUpAll(() async {
    await _fonts();
    if (_out != null) Directory(_out!).createSync(recursive: true);
  });

  final map = (jsonDecode(File('tool/instrument_map/chemistry.json').readAsStringSync()) as List).cast<Map<String, dynamic>>();

  test('every mapped instrument and mode exists', () {
    for (final e in map) {
      final id = e['instrument'] as String;
      expect([...chemistryInstruments.keys, 'titration'], contains(id), reason: '${e['chapter']} ${e['step']}');
      final modes = chemistryModes[id];
      final mode = (e['preset'] as Map)['mode'];
      if (modes != null && mode != null) expect(modes.keys, contains(mode), reason: '${e['chapter']} ${e['step']}');
    }
  });

  for (final id in chemistryInstruments.keys) {
    testWidgets(id, (t) async {
      final shotted = <String>{};
      for (final e in map.where((e) => e['instrument'] == id)) {
        final preset = (e['preset'] as Map).cast<String, dynamic>();
        final name = '$id-${preset['mode'] ?? 'default'}';
        await _pump(t, step(id, preset), shot: shotted.add(name) ? name : null);
      }
      for (final m in (chemistryModes[id] ?? const {}).entries) {
        for (final p in m.value.presets.values) {
          await _pump(t, step(id, {'mode': m.key, ...p}));
        }
        final name = '$id-${m.key}';
        await _pump(t, step(id, {'mode': m.key}), shot: shotted.add(name) ? name : null);
      }
    });
  }

  testWidgets('titration', (t) async {
    for (final e in map.where((e) => e['instrument'] == 'titration')) {
      await _pump(t, step('titration', (e['preset'] as Map).cast<String, dynamic>()), shot: 'titration-${e['step'].toString().replaceAll('/', '-')}');
    }
  });
}
