import 'dart:convert';
import 'dart:io';

import 'package:archive/archive.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/features/sim_hub/sim_entry.dart';
import 'package:kinetix_board/features/sim_hub/sim_hub_panel.dart';
import 'package:kinetix_board/features/sim_hub/sim_server.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/board_fonts.dart';

// The bundled web sims (docs/licensing/SIMULATIONS.md) are served by the loopback server and
// every file their start page names is served too, so they load with no internet.

/// Every bundled sim that is more than one PhET page, straight from the catalogue.
final _bundledWeb = [for (final e in simCatalogue) if (e.kind == SimKindOf.bundled && e.source != 'PhET') e.id];

/// The folders pubspec.yaml puts in the app (Flutter takes the files of each listed folder, not
/// its subfolders), so a file the test server finds on disk is also in the installed app.
Set<String> _declaredAssetDirs() => {
  for (final l in File('pubspec.yaml').readAsLinesSync())
    if (RegExp(r'^\s+- assets/.*/$').hasMatch(l)) l.trim().substring(2),
};

Future<(int, List<int>, String?)> _get(String base, String path) async {
  final r = await (await HttpClient().getUrl(Uri.parse('$base/$path'))).close();
  final bytes = <int>[];
  await for (final c in r) {
    bytes.addAll(c);
  }
  return (r.statusCode, bytes, r.headers.contentType?.mimeType);
}

void main() {
  test('every bundled web sim is in the catalogue, offline, with its licence text shipped', () {
    expect(_bundledWeb, containsAll(['circuitverse', 'jupyterlite', 'circuitjs', 'timelinejs', 'blockly', 'jsxgraph-geometry', 'jsxgraph-graph']));
    expect(_bundledWeb.where((id) => id.startsWith('mw-')), hasLength(6));
    for (final id in _bundledWeb) {
      final e = simById(id)!;
      expect(e.kind, SimKindOf.bundled, reason: id);
      expect(e.offline, isTrue);
      expect(File('assets/simhub/${e.asset!.split(RegExp('[?#]')).first}').existsSync(), isTrue, reason: id);
    }
    expect(File('assets/simhub/circuitjs/COPYING.txt').existsSync(), isTrue);
    expect(File('assets/simhub/circuitverse/LICENSE.txt').existsSync(), isTrue);
    expect(simById('circuitjs')!.note, contains('github.com/pfalstad/circuitjs1'));
    // Not bundled: licence does not allow it.
    for (final id in ['geogebra', 'wokwi', 'polypad', 'labxchange', 'chemcollective', 'osp']) {
      expect(simById(id)!.kind, SimKindOf.online, reason: id);
    }
  });

  test('each bundled web sim loads over loopback with the files its page names', () async {
    SimAssetServer.loader = (key) async => File(key).readAsBytes();
    final base = await SimAssetServer.start();
    HttpOverrides.global = null;
    for (final id in _bundledWeb) {
      final asset = simById(id)!.asset!;
      final page = asset.split(RegExp('[?#]')).first;
      final res = await _get(base, page);
      expect(res.$1, 200, reason: id);
      expect(res.$3, 'text/html', reason: id);
      final html = String.fromCharCodes(res.$2);
      final dir = page.contains('/') ? page.substring(0, page.lastIndexOf('/') + 1) : '';
      final refs = RegExp(r'''(?:src|href)=["']([^"']+)["']''').allMatches(html).map((m) => m.group(1)!).where((u) => !u.startsWith(RegExp(r'(https?:|data:|#|javascript:|//)'))).toSet();
      expect(refs, isNotEmpty, reason: id);
      for (final u in refs) {
        final rel = Uri.parse('/$dir').resolve(u.split(RegExp('[?#]')).first).path.substring(1);
        if (rel.endsWith('/') || rel.endsWith('.html') && rel == page) continue;
        expect((await _get(base, rel)).$1, 200, reason: '$id: $rel');
      }
      // Molecular Workbench: the activity named after # and the models and pictures it loads.
      final hash = asset.contains('#') ? asset.substring(asset.indexOf('#') + 1) : '';
      if (hash.endsWith('.json')) {
        final interactive = await _get(base, '$dir$hash');
        expect(interactive.$1, 200, reason: '$id: $hash');
        final models = (jsonDecode(utf8.decode(interactive.$2))['models'] as List).cast<Map<String, dynamic>>();
        expect(models, isNotEmpty, reason: id);
        for (final m in models) {
          final url = '$dir${m['url']}';
          final model = await _get(base, Uri.encodeFull(url).replaceAll(r'$', '%24'));
          expect(model.$1, 200, reason: '$id: $url');
          final mapping = ((m['viewOptions'] as Map?)?['imageMapping'] as Map?) ?? const {};
          final images = ((jsonDecode(utf8.decode(model.$2)) as Map)['viewOptions'] as Map?)?['images'] as List? ?? const [];
          for (final img in images.cast<Map<String, dynamic>>()) {
            final name = mapping[img['imageUri']] ?? img['imageUri'] as String;
            final at = '${url.substring(0, url.lastIndexOf('/') + 1)}$name';
            expect((await _get(base, at)).$1, 200, reason: '$id: picture $at');
          }
        }
      }
    }
  });

  test('JupyterLite starts Python with no internet: Pyodide and every package the kernel installs are in the bundle', () async {
    SimAssetServer.loader = (key) async => File(key).readAsBytes();
    final base = await SimAssetServer.start();
    HttpOverrides.global = null;
    const root = 'jupyterlite';
    final config = jsonDecode(File('assets/simhub/$root/jupyter-lite.json').readAsStringSync())['jupyter-config-data'] as Map<String, dynamic>;
    // Where the kernel loads Pyodide from, as the REPL page resolves it.
    final pyodideUrl = (config['litePluginSettings'] as Map)['@jupyterlite/pyodide-kernel-extension:kernel']['pyodideUrl'] as String;
    final pyodide = Uri.parse('/$root/repl/').resolve(pyodideUrl).path.substring(1);
    expect(pyodide, '$root/pyodide/pyodide.mjs');
    final pyDir = pyodide.substring(0, pyodide.lastIndexOf('/') + 1);
    for (final f in ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json']) {
      expect((await _get(base, '$pyDir$f')).$1, 200, reason: f);
    }
    final lock = (jsonDecode(File('assets/simhub/${pyDir}pyodide-lock.json').readAsStringSync())['packages'] as Map).cast<String, Map<String, dynamic>>();
    String norm(String n) => n.toLowerCase().replaceAll(RegExp('[-_.]+'), '-');
    final locked = {for (final e in lock.entries) norm(e.key): e.value};
    // piplite's own index, next to the kernel extension.
    const pypi = '$root/extensions/@jupyterlite/pyodide-kernel-extension/static/pypi/';
    final index = (jsonDecode(File('assets/simhub/${pypi}all.json').readAsStringSync()) as Map).cast<String, Map<String, dynamic>>();
    final indexed = {for (final e in index.entries) norm(e.key): e.value};

    // The packages the kernel's worker installs at start (initKernel), read from the worker itself.
    final worker = Directory('assets/simhub/${pypi.replaceFirst('pypi/', '')}').listSync().whereType<File>().map((f) => f.readAsStringSync()).firstWhere((js) => js.contains('initKernel'));
    final start = RegExp(r'for\(let \w+ of\[([^\]]+)\]\)\w+\.includes').firstMatch(worker)!.group(1)!;
    final wanted = [for (final m in RegExp(r'"([^"]+)"').allMatches(start)) m.group(1)!];
    expect(wanted, containsAll(['comm', 'pyodide-kernel', 'ipython']));

    final seen = <String>{};
    Future<void> needs(String name, String why) async {
      final n = norm(name);
      if (!seen.add(n)) return;
      final fromIndex = indexed[n];
      if (fromIndex != null) {
        final release = (fromIndex['releases'] as Map).values.last as List;
        final file = (release.first as Map)['url'] as String;
        final got = await _get(base, '$pypi${file.replaceFirst('./', '')}');
        expect(got.$1, 200, reason: '$name ($why) is in the piplite index but its wheel is missing');
        // Its own requirements come from the wheel.
        final wheel = ZipDecoder().decodeBytes(got.$2);
        final meta = wheel.files.firstWhere((f) => f.name.endsWith('.dist-info/METADATA')).content;
        for (final l in utf8.decode(meta).split('\n')) {
          final m = RegExp(r'^Requires-Dist: ([A-Za-z0-9_.\-]+)\s*(?:\(|[<>=!~;]|$)').firstMatch(l.trim());
          if (m != null && !l.contains('extra ==') && !l.contains('sys_platform')) await needs(m.group(1)!, name);
        }
        return;
      }
      final fromLock = locked[n];
      expect(fromLock, isNotNull, reason: '$name ($why) is neither in the bundle nor in Pyodide: the kernel would fetch it from PyPI');
      expect((await _get(base, '$pyDir${fromLock!['file_name']}')).$1, 200, reason: '$name ($why): ${fromLock['file_name']} is not bundled');
      for (final d in (fromLock['depends'] as List).cast<String>()) {
        await needs(d, name);
      }
    }

    for (final w in ['micropip', 'piplite', ...wanted]) {
      await needs(w, 'kernel start');
    }
  });

  test('every file of the bundled sims is in the app and served with a type', () {
    final dirs = _declaredAssetDirs();
    final missing = <String>{}, refused = <String>[];
    for (final f in Directory('assets/simhub').listSync(recursive: true).whereType<File>()) {
      final rel = f.path.substring('assets/simhub/'.length);
      if (rel.split('/').last.startsWith('.')) continue;
      if (!dirs.contains('${f.parent.path}/')) missing.add('${f.parent.path}/');
      if (!SimAssetServer.allowed(rel)) refused.add(rel);
    }
    expect(missing, isEmpty, reason: 'folders to list in pubspec.yaml');
    expect(refused, isEmpty, reason: 'names or types the loopback server refuses');
    expect(SimAssetServer.contentType('blockly/media/handopen.cur'), 'image/x-icon');
  });

  test('files with dollar signs in their names, wasm and fonts are served with the right type', () async {
    SimAssetServer.loader = (key) async => File(key).readAsBytes();
    final base = await SimAssetServer.start();
    HttpOverrides.global = null;
    final model = Directory('assets/simhub/mw/models-converted').listSync(recursive: true).whereType<File>().firstWhere((f) => f.path.contains(r'$'));
    final rel = model.path.substring('assets/simhub/'.length);
    expect((await _get(base, Uri.encodeFull(rel).replaceAll(r'$', '%24'))).$1, 200);
    expect((await _get(base, 'jupyterlite/pyodide/pyodide.asm.wasm')).$3, 'application/wasm');
    expect((await _get(base, 'jupyterlite/pyodide/micropip-0.11.1-py3-none-any.whl')).$1, 200);
    expect((await _get(base, 'timelinejs/css/icons/tl-icons.woff2')).$3, 'font/woff2');
    expect((await _get(base, '../pubspec.yaml')).$1, 404);
  });

  test('every open-licence catalogue entry is bundled and its files are served', () async {
    SimAssetServer.loader = (key) async => File(key).readAsBytes();
    final base = await SimAssetServer.start();
    HttpOverrides.global = null;
    const notRedistributable = {'osp', 'geogebra', 'polypad', 'wokwi', 'labxchange', 'chemcollective', 'phet-all', 'molstar', 'econgraphs', 'pavlovia', 'learningapps'};
    var phet = 0;
    for (final e in simCatalogue) {
      if (e.kind != SimKindOf.online) continue;
      expect(notRedistributable, contains(e.id), reason: '${e.id} is open-licence or unlisted: bundle it or add it here with a reason');
      expect(e.title, matches(RegExp(r'\[online|PhET: all|Mol\*|3D molecules|EconGraphs|PsychoJS|LearningApps')), reason: e.id);
    }
    for (final e in simCatalogue.where((e) => e.source == 'PhET' && e.asset != null)) {
      phet++;
      final res = await _get(base, e.asset!);
      expect(res.$1, 200, reason: e.id);
      final html = String.fromCharCodes(res.$2.take(400000));
      expect(html, contains('<html'), reason: e.id);
      expect(e.thumb != null && File(e.thumb!).existsSync(), isTrue, reason: '${e.id} thumbnail');
    }
    expect(phet, greaterThanOrEqualTo(40));
    for (final id in ['jsxgraph-geometry', 'jsxgraph-graph']) {
      final e = simById(id)!;
      expect(e.kind, SimKindOf.bundled);
      final res = await _get(base, e.asset!.split('#').first);
      expect(res.$1, 200, reason: id);
    }
    expect((await _get(base, 'jsxgraph/jsxgraphcore.js')).$1, 200);
    expect((await _get(base, 'jsxgraph/jsxgraph.css')).$1, 200);
    expect(File('assets/simhub/jsxgraph/LICENSE.txt').existsSync(), isTrue);
  });

  test('the bundled web sims stay lean', () {
    var total = 0;
    for (final d in ['circuitverse', 'jupyterlite', 'circuitjs', 'mw', 'timelinejs']) {
      for (final f in Directory('assets/simhub/$d').listSync(recursive: true).whereType<File>()) {
        total += f.lengthSync();
      }
    }
    expect(total, lessThan(60 * 1024 * 1024));
  });

  group('online sims keep working offline once seen', () {
    setUp(() => simHubOnlineCheck = () async => false);

    test('SimVisited remembers when a sim was opened online', () async {
      SharedPreferences.setMockInitialValues({});
      final v = await SimVisited.load();
      expect(v.has('osp'), isFalse);
      await v.mark('osp', DateTime(2026, 10, 1));
      expect(v.when('osp'), DateTime(2026, 10, 1));
    });

    testWidgets('a sim never opened online says so; one opened before shows the saved-copy note', (tester) async {
      await loadBoardFonts();
      SharedPreferences.setMockInitialValues({});
      final c = SimHubController()..openSim('osp');
      Widget host() => MaterialApp(home: Scaffold(body: SimHubPanel(controller: c, page: () => 0)));
      await tester.pumpWidget(host());
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('hub-offline-msg')), findsOneWidget);
      expect(find.textContaining('Open it once while connected'), findsOneWidget);

      SharedPreferences.setMockInitialValues({
        'simhub.visited': ['osp=${DateTime(2026, 10, 1).millisecondsSinceEpoch}'],
      });
      c.close();
      await tester.pumpWidget(const SizedBox());
      c.openSim('osp');
      await tester.pumpWidget(host());
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('hub-offline-msg')), findsNothing);
      expect(find.byKey(const Key('hub-cache-note')), findsOneWidget);
    });

    test('the viewer notices are written in English, Hindi and Kannada', () {
      for (final lang in ['en', 'hi', 'kn']) {
        for (final k in simHubStringTable['en']!.keys) {
          expect(simHubStringTable[lang]![k], isNotEmpty, reason: '$lang $k');
        }
      }
      expect(simHubStringTable['hi']!['saved'], matches(RegExp(r'[ऀ-ॿ]')));
      expect(simHubStringTable['kn']!['saved'], matches(RegExp(r'[ಀ-೿]')));
    });
  });
}
