import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kinetix_board/features/board/kit/key_dates_data.dart';
import 'package:kinetix_board/features/sim_hub/native/map_sims.dart';
import 'package:kinetix_board/features/sim_hub/native/other_sims.dart';
import 'package:kinetix_board/features/sim_hub/native/psych_tests.dart';
import 'package:kinetix_board/features/sim_hub/sim_entry.dart';
import 'package:kinetix_board/features/sim_hub/sim_hub_panel.dart';
import 'package:kinetix_board/features/sim_hub/sim_server.dart';
import 'package:latlong2/latlong.dart';
import 'package:shared_preferences/shared_preferences.dart';

Widget _host(Widget child) => MaterialApp(home: Scaffold(body: SizedBox(width: 900, height: 700, child: child)));

void main() {
  group('catalogue', () {
    test('every entry is complete, unique and its bundled file exists', () {
      final ids = simCatalogue.map((e) => e.id).toList();
      expect(ids.toSet().length, ids.length);
      for (final e in simCatalogue) {
        expect(simSubjects, contains(e.subject), reason: e.id);
        expect(e.gradeMin, inInclusiveRange(1, 13), reason: e.id);
        expect(e.gradeMax, greaterThanOrEqualTo(e.gradeMin), reason: e.id);
        expect(e.tags, isNotEmpty, reason: e.id);
        expect(e.licence, isNotEmpty);
        if (e.kind == SimKindOf.bundled) {
          expect(File('assets/simhub/${e.asset}').existsSync(), isTrue, reason: e.id);
          expect(e.offline, isTrue);
        }
        if (e.kind == SimKindOf.online) {
          expect(e.url, startsWith('https://'), reason: e.id);
          expect(e.offline, isFalse);
        }
        expect(e.toJson().keys, containsAll(['subject', 'gradeMin', 'gradeMax', 'tags', 'offline']));
      }
      expect(simCatalogue.where((e) => e.id.startsWith('phet-') && e.kind == SimKindOf.bundled).length, greaterThanOrEqualTo(15));
      expect(simById('geogebra')!.note, contains('Commercial use needs a GeoGebra licence'));
      expect(simById('geogebra')!.kind, SimKindOf.online);
    });

    test('filtering by subject, class, search and offline', () {
      expect(filterSims(subject: 'chemistry').every((e) => e.subject == 'chemistry'), isTrue);
      final c7 = filterSims(grade: 7);
      expect(c7.every((e) => e.gradeMin <= 7 && e.gradeMax >= 7), isTrue);
      expect(c7.map((e) => e.id), contains('phet-density'));
      expect(c7.map((e) => e.id), isNot(contains('phet-molecule-polarity')));
      expect(filterSims(query: 'pendulum').map((e) => e.id), contains('phet-pendulum-lab'));
      expect(filterSims(query: 'stroop').single.id, 'pebl-stroop');
      final off = filterSims(offlineOnly: true);
      expect(off.every((e) => e.offline), isTrue);
      expect(off.map((e) => e.id), isNot(contains('geogebra')));
      expect(filterSims(subject: 'physics', grade: 10, offlineOnly: true), isNotEmpty);
    });
  });

  group('asset server', () {
    test('only allows safe paths', () {
      expect(SimAssetServer.allowed('phet/density.html'), isTrue);
      expect(SimAssetServer.allowed('blockly/media/click.mp3'), isTrue);
      expect(SimAssetServer.allowed('../pubspec.yaml'), isFalse);
      expect(SimAssetServer.allowed('phet/../x.html'), isFalse);
      expect(SimAssetServer.allowed('phet/evil.exe'), isFalse);
    });

    test('serves a bundled file over loopback and 404s the rest', () async {
      SimAssetServer.loader = (key) async => File(key).readAsBytes();
      final base = await SimAssetServer.start();
      expect(base, startsWith('http://127.0.0.1:'));
      HttpOverrides.global = null; // the test binding fakes HTTP; this needs the real loopback
      {
        Future<(int, String, String?)> get(String path) async {
          final r = await (await HttpClient().getUrl(Uri.parse('$base$path'))).close();
          final body = await r.transform(const SystemEncoding().decoder).join();
          return (r.statusCode, body, r.headers.contentType?.mimeType);
        }

        final ok = await get('/blockly/index.html');
        expect(ok.$1, 200);
        expect(ok.$3, 'text/html');
        expect(ok.$2, contains('Blockly'));
        expect((await get('/nothing.html')).$1, 404);
        expect((await get('/phet/density.exe')).$1, 404);
      }
    });
  });

  group('hub panel', () {
    setUp(() {
      SharedPreferences.setMockInitialValues({});
      simHubOnlineCheck = () async => false;
    });

    testWidgets('lists, filters and pins a sim to the page, then reopens it', (tester) async {
      final c = SimHubController();
      await tester.pumpWidget(_host(SimHubPanel(controller: c, page: () => 2)));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('hub-search')), 'pendulum');
      await tester.pump();
      expect(find.byKey(const Key('sim-phet-pendulum-lab')), findsOneWidget);
      expect(find.byKey(const Key('sim-phet-density')), findsNothing);
      await tester.tap(find.byKey(const Key('pin-phet-pendulum-lab')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('pinned-phet-pendulum-lab')), findsOneWidget);
      await tester.tap(find.byKey(const Key('pinned-phet-pendulum-lab')));
      await tester.pumpAndSettle();
      expect(c.openId, 'phet-pendulum-lab');
      expect(find.byKey(const Key('hub-credit')), findsOneWidget);
      expect(find.textContaining('CC BY 4.0'), findsWidgets);
      // A different page has no pins.
      c.close();
      await tester.pumpWidget(_host(SimHubPanel(controller: c, page: () => 3, key: UniqueKey())));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('pinned-phet-pendulum-lab')), findsNothing);
    });

    testWidgets('an online sim with no internet shows the offline message', (tester) async {
      final c = SimHubController()..openSim('geogebra');
      await tester.pumpWidget(_host(SimHubPanel(controller: c, page: () => 0)));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('hub-offline-msg')), findsOneWidget);
      expect(find.textContaining('GeoGebra licence'), findsOneWidget);
    });

    testWidgets('filter chips start from the session subject and class', (tester) async {
      await tester.pumpWidget(_host(SimHubPanel(controller: SimHubController(), page: () => 0, subject: 'chemistry', grade: 11)));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('sim-phet-ph-scale')), findsOneWidget);
      expect(find.byKey(const Key('sim-phet-density')), findsNothing);
    });

    testWidgets('a native sim opens in the panel', (tester) async {
      final c = SimHubController()..openSim('macro-money');
      await tester.pumpWidget(_host(SimHubPanel(controller: c, page: () => 0)));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('macro-mult')), findsOneWidget);
    });
  });

  group('native sims', () {
    test('money multiplier and rounds', () {
      expect(moneyMultiplier(0.1), closeTo(10, 1e-9));
      final r = moneyRounds(1000, 0.1, rounds: 3);
      expect(r[0].lent, closeTo(900, 1e-9));
      expect(r[1].deposit, closeTo(900, 1e-9));
      expect(r[1].reserve, closeTo(90, 1e-9));
      expect(r.map((x) => x.reserve).reduce((a, b) => a + b), lessThan(1000));
    });

    test('stroop trials mix congruent and incongruent', () {
      final t = stroopTrials(20);
      expect(t.length, 20);
      expect(t.where((x) => x.congruent), isNotEmpty);
      expect(t.where((x) => !x.congruent), isNotEmpty);
      expect(meanMs([100, 200]), 150);
      expect(spanSequence(5).length, 5);
    });

    testWidgets('stroop test scores answers', (tester) async {
      await tester.pumpWidget(_host(const StroopTest(trials: 2)));
      for (var i = 0; i < 2; i++) {
        final word = tester.widget<Text>(find.byKey(const Key('stroop-word')));
        final ink = stroopColors.entries.firstWhere((e) => e.value == word.style!.color).key;
        await tester.tap(find.byKey(Key('stroop-$ink')));
        await tester.pump();
      }
      expect(find.text('Correct: 2 of 2'), findsOneWidget);
    });

    testWidgets('reaction time measures a tap after go', (tester) async {
      await tester.pumpWidget(_host(const ReactionTest(rounds: 1, minWait: Duration(milliseconds: 10), maxWait: Duration(milliseconds: 20))));
      await tester.tap(find.byKey(const Key('reaction-area')));
      await tester.pump(const Duration(milliseconds: 50));
      expect(find.text('TAP NOW'), findsOneWidget);
      await tester.tap(find.byKey(const Key('reaction-area')));
      await tester.pump();
      expect(find.textContaining('Mean reaction time'), findsOneWidget);
    });

    testWidgets('reaction time rejects a tap that is too early', (tester) async {
      await tester.pumpWidget(_host(const ReactionTest(minWait: Duration(seconds: 2), maxWait: Duration(seconds: 3))));
      await tester.tap(find.byKey(const Key('reaction-area')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('reaction-area')));
      await tester.pump();
      expect(find.textContaining('Too early'), findsOneWidget);
    });

    testWidgets('memory span ends at the first wrong answer', (tester) async {
      await tester.pumpWidget(_host(const MemorySpanTest(flash: Duration(milliseconds: 10))));
      await tester.pump(const Duration(milliseconds: 200));
      await tester.enterText(find.byKey(const Key('span-input')), 'x');
      await tester.tap(find.byKey(const Key('span-submit')));
      await tester.pump();
      expect(find.textContaining('memory span is 0 digits'), findsOneWidget);
    });

    test('map distance and geography answers', () {
      expect(pathKm(const [LatLng(28.61, 77.21), LatLng(19.08, 72.88)]), closeTo(1150, 60));
      expect(pathKm(const [LatLng(0, 0)]), 0);
      final delhi = geoQuestions.first;
      expect(geoErrorKm(delhi, delhi.at), 0);
      expect(geoErrorKm(delhi, const LatLng(19.08, 72.88)), greaterThan(delhi.toleranceKm));
    });

    test('LanguageTool reply is parsed', () {
      final m = parseLanguageTool('{"matches":[{"message":"Possible typo","offset":0,"length":3,"replacements":[{"value":"The"},{"value":"Tea"}]}]}');
      expect(m.single.suggestions, ['The', 'Tea']);
    });

    testWidgets('grammar check shows matches, and a plain message when offline', (tester) async {
      final ok = MockClient((_) async => http.Response('{"matches":[{"message":"Possible typo","offset":0,"length":3,"replacements":[{"value":"The"}]}]}', 200));
      await tester.pumpWidget(_host(GrammarCheck(client: ok)));
      await tester.enterText(find.byKey(const Key('grammar-text')), 'Teh cat');
      await tester.tap(find.byKey(const Key('grammar-check')));
      await tester.pumpAndSettle();
      expect(find.text('Possible typo'), findsOneWidget);

      final down = MockClient((_) async => throw const SocketException('no network'));
      await tester.pumpWidget(_host(GrammarCheck(key: UniqueKey(), client: down)));
      await tester.enterText(find.byKey(const Key('grammar-text')), 'Teh cat');
      await tester.tap(find.byKey(const Key('grammar-check')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('grammar-error')), findsOneWidget);
    });

    testWidgets('timeline lists key dates and filters by search', (tester) async {
      final data = KeyDatesData.parse('1857\t5\t10\tindia\thistory\tThe Revolt of 1857 begins\n1947\t8\t15\tindia\thistory\tIndia becomes independent\n1969\t7\t20\tworld\tscience\tMoon landing');
      await tester.pumpWidget(_host(KeyDatesTimeline(data: data)));
      await tester.pumpAndSettle();
      expect(find.text('The Revolt of 1857 begins'), findsOneWidget);
      expect(find.text('Moon landing'), findsNothing);
      await tester.enterText(find.byKey(const Key('timeline-search')), '1947');
      await tester.pump();
      expect(find.text('The Revolt of 1857 begins'), findsNothing);
      expect(find.text('India becomes independent'), findsOneWidget);
    });
  });
}
