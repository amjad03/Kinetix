import 'dart:convert';
import 'dart:io';
import 'dart:ui' show ImageByteFormat;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_lessons/src/instruments/biology/registry.dart';

/// Every biology instrument (built straight from the biology registry, so the other domains'
/// work in progress cannot break this suite), pumped at smartboard size (1920 x 1080) with every preset the
/// instrument map assigns to it. Set SHOTS to a directory to save one PNG per instrument;
/// set SHOTS_ALL as well to save one per instrument and mode, or SHOTS_EVERY for every preset.
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
  final icons = File('/home/user/sdk/flutter/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf');
  if (icons.existsSync()) await load('MaterialIcons', [icons.path]);
}

final _out = Platform.environment['SHOTS'];
final _all = Platform.environment['SHOTS_ALL'] != null;
final _every = Platform.environment['SHOTS_EVERY'] != null;

Future<void> _pump(WidgetTester t, String id, Map<String, dynamic> preset, {String? shot}) async {
  t.view.physicalSize = const Size(1920, 1080);
  t.view.devicePixelRatio = 1;
  final key = GlobalKey();
  await t.pumpWidget(MaterialApp(
    debugShowCheckedModeBanner: false,
    home: RepaintBoundary(key: key, child: biologyInstruments[id]!(preset, ValueKey('instrument:$id:$preset'))),
  ));
  await t.pump(const Duration(milliseconds: 200));
  expect(t.takeException(), isNull, reason: '$id $preset');
  if (_out == null || shot == null) return;
  await t.runAsync(() async {
    final ro = key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
    final img = await ro.toImage();
    final bytes = await img.toByteData(format: ImageByteFormat.png);
    File('$_out/$shot.png').writeAsBytesSync(bytes!.buffer.asUint8List());
  });
}

void main() {
  setUpAll(_fonts);
  final map = (jsonDecode(File('tool/instrument_map/biology.json').readAsStringSync()) as List).cast<Map<String, dynamic>>();
  if (_out != null) Directory(_out!).createSync(recursive: true);

  test('every mapped instrument is registered', () {
    for (final e in map) {
      expect(biologyInstruments.containsKey(e['instrument']), isTrue, reason: '${e['chapter']} ${e['step']} → ${e['instrument']}');
    }
  });

  for (final id in biologyInstruments.keys) {
    testWidgets(id, (t) async {
      await _pump(t, id, const {}, shot: id);
      final seen = <String>{};
      var n = 0;
      for (final e in map.where((e) => e['instrument'] == id)) {
        n++;
        final preset = (e['preset'] as Map).cast<String, dynamic>();
        final mode = '${preset['mode']}';
        final first = seen.add(mode);
        await _pump(t, id, preset, shot: _every ? '$id-$n' : (_all && first ? '$id-$mode' : null));
      }
    });
  }
}
