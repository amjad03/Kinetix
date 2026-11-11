import 'dart:convert';
import 'dart:io';
import 'dart:ui' show ImageByteFormat;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
// The physics registry is imported directly (it is what buildInstrument consults for these
// ids), so this suite does not depend on the other domains compiling.
import 'package:kinetix_lessons/src/instruments/efield.dart';
import 'package:kinetix_lessons/src/instruments/optics.dart';
import 'package:kinetix_lessons/src/instruments/physics/registry.dart';

final _builders = <String, Widget Function(Map<String, dynamic>, Key?)>{
  ...physicsInstruments,
  'efield': (p, k) => EFieldInstrument(key: k, preset: p),
  'optics': (p, k) => OpticsInstrument(key: k, preset: p),
};

/// Pumps every physics instrument with every preset in tool/instrument_map/physics.json at
/// smartboard size (1920 x 1080). Set SHOTS to a directory to save one PNG per instrument;
/// set SHOTS_ALL as well to save one per mapped step.
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
final _all = Platform.environment['SHOTS_ALL'] != null;
final _only = Platform.environment['ONLY'];

Future<void> _pump(WidgetTester t, String id, Map<String, dynamic> preset, String? name) async {
  t.view.physicalSize = const Size(1920, 1080);
  t.view.devicePixelRatio = 1;
  final key = GlobalKey();
  await t.pumpWidget(MaterialApp(debugShowCheckedModeBanner: false, home: RepaintBoundary(key: key, child: _builders[id]!(preset, ValueKey('instrument:$id')))));
  await t.pump();
  await t.pump(const Duration(milliseconds: 300));
  expect(t.takeException(), isNull, reason: '$id $preset');
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
  final map = (jsonDecode(File('tool/instrument_map/physics.json').readAsStringSync()) as List).cast<Map<String, dynamic>>();
  final byId = <String, List<Map<String, dynamic>>>{};
  for (final e in map) {
    (byId[e['instrument'] as String] ??= []).add(e);
  }
  final o = _out;
  if (o != null) Directory(o).createSync(recursive: true);

  test('every mapped instrument exists', () {
    for (final id in byId.keys) {
      expect(_builders.keys, contains(id));
    }
  });

  for (final MapEntry(key: id, value: entries) in byId.entries) {
    final only = _only;
    if (only != null && !only.split(',').contains(id)) continue;
    testWidgets('$id (${entries.length} steps)', (t) async {
      // Shot the first use of each mode so every apparatus gets looked at.
      final seenModes = <String>{};
      for (final (i, e) in entries.indexed) {
        final preset = (e['preset'] as Map).cast<String, dynamic>();
        final mode = preset['mode'] as String? ?? '';
        final first = seenModes.add(mode);
        final name = _all ? '$id-${i.toString().padLeft(2, '0')}' : (i == 0 ? id : (first ? '$id-$mode' : null));
        await _pump(t, id, preset, name);
      }
    });
  }
}
