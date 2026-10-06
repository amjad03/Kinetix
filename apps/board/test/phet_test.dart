import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kinetix_board/features/phet/phet_catalogue.dart';
import 'package:kinetix_board/features/phet/phet_downloads.dart';
import 'package:kinetix_board/features/phet/phet_panel.dart';
import 'package:kinetix_board/features/phet/phet_strings.dart';
import 'package:kinetix_board/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/board_fonts.dart';
import 'support/fake_cloud.dart';
import 'support/layout.dart';

final _json = jsonDecode(File('assets/phet/catalogue.json').readAsStringSync()) as Map<String, dynamic>;
final _catalogue = PhetCatalogue.fromJson(_json);

/// A sim's page as a server sends it, in [chunks] pieces.
List<List<int>> _page(int chunks, [int size = 4000]) => [for (var i = 0; i < chunks; i++) List.filled(size, 65 + i)];

PhetDownloads _downloads(Directory dir, http.Client client, {List<Uri>? asked}) => PhetDownloads(
  resolve: (id, locale) async {
    final u = Uri.parse('https://mirror.example.in/phet/$id/${id}_all.html?locale=$locale');
    asked?.add(u);
    return u;
  },
  directory: () async => dir,
  client: client,
);

void main() {
  group('catalogue', () {
    test('every sim is complete, classified for our classes, credited and named in en/hi/kn', () {
      expect(_json['attribution'], PhetStrings.attribution);
      expect(_catalogue.sims.length, greaterThanOrEqualTo(100));
      final ids = _catalogue.sims.map((s) => s.id).toList();
      expect(ids.toSet().length, ids.length, reason: 'ids are unique');
      for (final s in _catalogue.sims) {
        expect(s.id, matches(RegExp(r'^[a-z0-9]+(-[a-z0-9]+)*$')));
        expect(s.titles['en'], isNotEmpty, reason: s.id);
        expect(PhetCatalogue.subjectOrder, contains(s.subject), reason: s.id);
        expect(s.topics, isNotEmpty, reason: s.id);
        expect(s.levels, isNotEmpty, reason: s.id);
        for (final l in s.levels) {
          expect(PhetCatalogue.levelOrder, contains(l), reason: s.id);
        }
        expect(s.locales, contains('en'), reason: s.id);
        for (final l in ['hi', 'kn']) {
          if (s.titles.containsKey(l)) expect(s.locales, contains(l), reason: '${s.id} has a $l title');
        }
        expect(s.sizeBytes, greaterThan(0));
        if (s.thumb != null) expect(File(s.thumb!).existsSync(), isTrue, reason: s.thumb);
        for (final lang in ['en', 'hi', 'kn']) {
          final p = PhetStrings(lang);
          for (final t in s.topics) {
            expect(p.topicName(t), isNot('topic.$t'), reason: '$lang name of topic $t');
          }
          expect(p.subjectName(s.subject), isNot('subject.${s.subject}'));
        }
      }
      // Hindi and Kannada titles exist where PhET has them.
      expect(_catalogue.sims.where((s) => s.titles.containsKey('hi')).length, greaterThan(80));
      expect(_catalogue.sims.where((s) => s.titles.containsKey('kn')).length, greaterThan(40));
      // Every class has sims.
      for (final l in PhetCatalogue.levelOrder) {
        expect(_catalogue.filter(level: l), isNotEmpty, reason: 'class $l');
      }
    });

    test('the language follows the board where the sim has it', () {
      final s = _catalogue['forces-and-motion-basics']!;
      expect(s.localeFor('hi'), 'hi');
      expect(s.title('hi'), isNot(s.title('en')));
      final noKn = _catalogue.sims.firstWhere((x) => !x.locales.contains('kn'));
      expect(noKn.localeFor('kn'), 'en');
      expect(noKn.title('kn'), noKn.titles['en']);
    });

    test('filters by subject, topic and class', () {
      final physics = _catalogue.filter(subject: 'physics');
      expect(physics.every((s) => s.subject == 'physics'), isTrue);
      expect(_catalogue.topicsOf('chemistry'), containsAll(['acids-bases', 'states-of-matter']));
      final waves9 = _catalogue.filter(subject: 'physics', topic: 'waves', level: '9');
      expect(waves9.map((s) => s.id), contains('wave-on-a-string'));
      expect(waves9.every((s) => s.levels.contains('9')), isTrue);
    });

    test('syllabus topics and labs find their related sims by keyword', () {
      List<String> rel(String t) => _catalogue.related(t).map((s) => s.id).toList();
      expect(rel('Acids, Bases and Salts · Chemical reactions and equations'), containsAll(['ph-scale-basics', 'acid-base-solutions']));
      expect(rel("Electricity: Ohm's law and resistance"), contains('ohms-law'));
      expect(rel('Force and Laws of Motion'), contains('forces-and-motion-basics'));
      expect(rel('Simple pendulum: time period'), contains('pendulum-lab'));
      expect(rel('Refraction of light through a glass slab'), contains('bending-light'));
      expect(rel('Partnership accounts: goodwill'), isEmpty);
      expect(rel(''), isEmpty);
    });
  });

  group('downloads', () {
    late Directory dir;
    setUp(() => dir = Directory.systemTemp.createTempSync('phet-test'));
    tearDown(() => dir.deleteSync(recursive: true));
    final sim = _catalogue['ohms-law']!;

    test('reports progress, keeps the file, and never fetches a sim twice', () async {
      var requests = 0;
      final chunks = _page(4);
      final client = MockClient.streaming((req, _) async {
        requests++;
        return http.StreamedResponse(Stream.fromIterable(chunks), 200, contentLength: 16000);
      });
      final asked = <Uri>[];
      final d = _downloads(dir, client, asked: asked);
      final seen = <double>[];
      d.addListener(() {
        if (d.progress(sim.id) case final p?) seen.add(p);
      });
      expect(await d.download(sim, 'hi'), isTrue);
      expect(asked.single.query, 'locale=hi');
      expect(seen, isNotEmpty);
      expect(seen.last, 1.0);
      expect(seen, orderedEquals([...seen]..sort()));
      expect(d.isDownloaded(sim.id), isTrue);
      expect(d.sizeOf(sim.id), 16000);
      expect(d.usedBytes, 16000);
      expect(File('${dir.path}/ohms-law_all.html').lengthSync(), 16000);

      // Cache hit: on the board already, so nothing is fetched.
      expect(await d.download(sim, 'en'), isTrue);
      expect(requests, 1);

      // A fresh start (the app restarted) finds it too.
      final again = _downloads(dir, client);
      await again.ready;
      expect(again.isDownloaded(sim.id), isTrue);
      expect(await again.download(sim, 'en'), isTrue);
      expect(requests, 1);

      await again.delete(sim.id);
      expect(again.isDownloaded(sim.id), isFalse);
      expect(again.usedBytes, 0);
      expect(File('${dir.path}/ohms-law_all.html').existsSync(), isFalse);
    });

    test('cancel keeps what came; the next download resumes from there', () async {
      final chunks = _page(3);
      final full = chunks.expand((c) => c).toList();
      final ranges = <String?>[];
      late StreamController<List<int>> first;
      final client = MockClient.streaming((req, _) async {
        ranges.add(req.headers['range']);
        if (ranges.length == 1) {
          first = StreamController<List<int>>();
          first.add(chunks[0]);
          return http.StreamedResponse(first.stream, 200, contentLength: full.length);
        }
        final from = int.parse(RegExp(r'bytes=(\d+)-').firstMatch(req.headers['range']!)!.group(1)!);
        return http.StreamedResponse(Stream.value(full.sublist(from)), 206, contentLength: full.length - from);
      });
      final d = _downloads(dir, client);
      final running = d.download(sim, 'en');
      while (d.partialBytes(sim.id) == 0) {
        await Future<void>.delayed(const Duration(milliseconds: 5));
      }
      expect(d.isDownloading(sim.id), isTrue);
      d.cancel(sim.id);
      expect(await running, isFalse);
      expect(d.isDownloading(sim.id), isFalse);
      expect(d.isDownloaded(sim.id), isFalse);
      expect(d.failed(sim.id), isFalse, reason: 'cancelling is not failing');
      expect(d.partialBytes(sim.id), 4000);
      unawaited(first.close());

      expect(await d.download(sim, 'en'), isTrue);
      expect(ranges, [null, 'bytes=4000-']);
      expect(File('${dir.path}/ohms-law_all.html').readAsBytesSync(), full);
      expect(d.partialBytes(sim.id), 0);
    });

    test('a server that ignores the range starts again; a failure is reported', () async {
      File('${dir.path}/ohms-law_all.html.part').writeAsBytesSync(List.filled(100, 1));
      var fail = true;
      final client = MockClient.streaming((req, _) async {
        if (fail) return http.StreamedResponse(const Stream.empty(), 503);
        return http.StreamedResponse(Stream.value(List.filled(500, 2)), 200, contentLength: 500);
      });
      final d = _downloads(dir, client);
      await d.ready;
      expect(d.partialBytes(sim.id), 100);
      expect(await d.download(sim, 'en'), isFalse);
      expect(d.failed(sim.id), isTrue);
      fail = false;
      expect(await d.download(sim, 'en'), isTrue);
      expect(d.failed(sim.id), isFalse);
      expect(File('${dir.path}/ohms-law_all.html').readAsBytesSync(), List.filled(500, 2));
    });

    test('without the API (demo) links go to phet.colorado.edu', () {
      expect(phetOriginUrl('ohms-law', 'kn').toString(), 'https://phet.colorado.edu/sims/html/ohms-law/latest/ohms-law_all.html?locale=kn');
    });
  });

  group('the Sims tab', () {
    setUpAll(loadBoardFonts);
    setUp(() => SharedPreferences.setMockInitialValues({}));

    for (final (name, size) in [('panel', Size(806, 1000)), ('phone', Size(360, 640))]) {
      testWidgets('$name size: browse, filter, search, download, open offline, storage, delete', (tester) async {
        screenSize(tester, size);
        final dir = Directory.systemTemp.createTempSync('phet-widget');
        addTearDown(() => dir.deleteSync(recursive: true));
        final client = MockClient.streaming((req, _) async => http.StreamedResponse(Stream.fromIterable(_page(2)), 200, contentLength: 8000));
        final d = _downloads(dir, client);
        final c = PhetPanelController();
        await tester.runAsync(() => d.ready);
        await tester.pumpWidget(localized('en', Scaffold(body: PhetPanel(downloads: d, controller: c))));
        await tester.pumpAndSettle();

        expect(find.text(PhetStrings.attribution), findsOneWidget);
        expect(find.text('${_catalogue.sims.length} sims'), findsOneWidget);

        // Subject → Topic → Class.
        await tester.tap(find.byKey(const Key('filter-phet-subject')));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const Key('filter-phet-subject-physics')).last);
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const Key('filter-phet-topic')));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const Key('filter-phet-topic-electricity')).last);
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const Key('filter-phet-level')));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const Key('filter-phet-level-9')).last);
        await tester.pumpAndSettle();
        final n = _catalogue.filter(subject: 'physics', topic: 'electricity', level: '9').length;
        expect(find.text('$n sims'), findsOneWidget);

        // Search.
        await tester.enterText(find.descendant(of: find.byKey(const Key('phet-search')), matching: find.byType(TextField)), 'ohm');
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('phet-sim-ohms-law')), findsOneWidget);
        expect(find.byKey(const Key('phet-badge-size-ohms-law')), findsOneWidget);

        // Download: progress, then the downloaded badge.
        await tester.runAsync(() async {
          await tester.tap(find.byKey(const Key('phet-download-ohms-law')));
          while (!d.isDownloaded('ohms-law')) {
            await Future<void>.delayed(const Duration(milliseconds: 10));
          }
        });
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('phet-badge-downloaded-ohms-law')), findsOneWidget);

        // Opens offline in the panel (no WebView under test: the notice), credited.
        await tester.tap(find.byKey(const Key('phet-open-ohms-law')));
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('phet-page-ohms-law')), findsOneWidget);
        expect(find.byKey(const Key('phet-no-viewer')), findsOneWidget);
        expect(find.text(PhetStrings.attribution), findsOneWidget);
        expect(c.showing, isTrue);
        await tester.tap(find.byKey(const Key('phet-back')));
        await tester.pumpAndSettle();
        expect(c.openId, isNull);

        // Storage: what the board holds, and delete.
        await tester.tap(find.byKey(const Key('phet-storage')));
        await tester.pumpAndSettle();
        expect(find.text('8 KB used on this board'), findsOneWidget);
        await tester.runAsync(() async {
          await tester.tap(find.byKey(const Key('phet-delete-ohms-law')));
          while (d.isDownloaded('ohms-law')) {
            await Future<void>.delayed(const Duration(milliseconds: 10));
          }
        });
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('phet-stored-ohms-law')), findsNothing);
        expect(tester.takeException(), isNull);
      });
    }

    testWidgets('Hindi and Kannada: titles and words follow the board', (tester) async {
      screenSize(tester, const Size(806, 1000));
      final dir = Directory.systemTemp.createTempSync('phet-lang');
      addTearDown(() => dir.deleteSync(recursive: true));
      final d = _downloads(dir, MockClient((_) async => http.Response('', 404)));
      await tester.runAsync(() => d.ready);
      for (final lang in ['hi', 'kn']) {
        await tester.pumpWidget(localized(lang, Scaffold(body: PhetPanel(key: ValueKey(lang), downloads: d, controller: PhetPanelController()))));
        await tester.pumpAndSettle();
        expect(find.text(PhetStrings(lang).search), findsOneWidget);
        expect(find.text(_catalogue.sims.first.title(lang)), findsOneWidget);
      }
    });

    testWidgets('a topic shows related sims that open the sim', (tester) async {
      String? opened;
      await tester.pumpWidget(localized('en', Scaffold(body: RelatedPhetSims(text: "Ohm's law", onOpen: (id) => opened = id))));
      await tester.pumpAndSettle();
      expect(find.text('Related PhET sims'), findsOneWidget);
      await tester.tap(find.byKey(const Key('related-phet-ohms-law')));
      expect(opened, 'ohms-law');
    });
  });

  group('on the board', () {
    setUpAll(loadBoardFonts);
    late Directory dir;
    setUp(() {
      SharedPreferences.setMockInitialValues({});
      dir = Directory.systemTemp.createTempSync('phet-board');
      PhetDownloads.shared = _downloads(dir, MockClient((_) async => http.Response('', 404)));
    });
    tearDown(() {
      PhetDownloads.shared = null;
      dir.deleteSync(recursive: true);
    });

    for (final size in [const Size(1280, 800), const Size(390, 844)]) {
      testWidgets('${size.width.toInt()}×${size.height.toInt()}: the Sims tab and the drawer open the sims browser', (tester) async {
        screenSize(tester, size);
        final board = await enrolledBoard();
        board.onPaired('session-token', sessionIn('en'));
        await tester.pumpWidget(KinetixBoardApp(controller: board));
        await tester.pumpAndSettle();
        if (find.text('Not now').evaluate().isNotEmpty) {
          await tester.tap(find.text('Not now'));
          await tester.pumpAndSettle();
        }
        await tapBoard(tester, 'panel-tab-sims');
        expect(find.byKey(const Key('phet-browser')), findsOneWidget);
        expect(find.byKey(const Key('add-to-board')), findsNothing, reason: 'nothing to picture until a sim is open');
        await tapBoard(tester, 'panel-close');
        await openTool(tester, 'phet');
        expect(find.byKey(const Key('phet-browser')), findsOneWidget);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox());
        board.dispose();
      });
    }
  });
}
