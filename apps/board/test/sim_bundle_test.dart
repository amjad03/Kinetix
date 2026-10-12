import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/features/sim_hub/sim_entry.dart';
import 'package:kinetix_board/features/sim_hub/sim_hub_panel.dart';
import 'package:kinetix_board/features/sim_hub/sim_server.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/board_fonts.dart';

// The bundled web sims (docs/licensing/SIMULATIONS.md) are served by the loopback server and
// every file their start page names is served too, so they load with no internet.

const _bundledWeb = ['circuitverse', 'jupyterlite', 'circuitjs', 'timelinejs', 'mw-gas-pressure', 'mw-phase-change', 'mw-diffusion', 'mw-oil-water', 'jsxgraph-geometry', 'jsxgraph-graph'];

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
    }
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
