import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kinetix_board/core/api_client.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/core/outbox_store.dart';
import 'package:kinetix_board/core/realtime.dart';
import 'package:kinetix_board/demo/demo.dart';
import 'package:kinetix_board/demo/demo_server.dart';
import 'package:kinetix_board/features/concept_videos/concept_video_player.dart';
import 'package:kinetix_board/features/concept_videos/concept_video_suggestions.dart';
import 'package:kinetix_board/features/concept_videos/concept_videos.dart';
import 'package:kinetix_board/l10n/l10n.dart';
import 'package:kinetix_board/main.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _NoRealtime extends Realtime {
  _NoRealtime() : super('http://test');
  @override
  void connect(String token) {}
  @override
  void dispose() {}
}

http.Response _json(Object body) => http.Response.bytes(utf8.encode(jsonEncode(body)), 200, headers: {'content-type': 'application/json; charset=utf-8'});

Map<String, dynamic> _video(String id, String title, {String language = 'en'}) => {
  'id': id,
  'topicId': 't1',
  'youtubeVideoId': 'abcdefghij${id.substring(id.length - 1)}',
  'title': title,
  'language': language,
  'durationSeconds': 245,
  'channelTitle': 'KINETIX',
  'position': 1,
  'topicTitle': 'Methods of valuing goodwill',
};

Map<String, dynamic> _now({bool isNow = true, List<Map<String, dynamic>>? videos, String startsAt = '10:00:00'}) => {
  'period': {
    'slotId': 'slot1',
    'date': '2026-10-05',
    'startsAt': startsAt,
    'endsAt': '10:55:00',
    'isNow': isNow,
    'section': {'id': 'sec1', 'displayName': 'BCom Sem 3 A'},
    'subject': {'id': 'sub1', 'name': 'Corporate Accounting'},
  },
  'source': 'year_plan',
  'topics': [
    {'id': 't1', 'title': 'Methods of valuing goodwill'},
  ],
  'language': 'en',
  'videos': videos ?? [_video('v1', 'Super profit method'), _video('v2', 'साख का मूल्यांकन', language: 'hi')],
};

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  tearDown(() => ConceptVideoPlayer.surfaceOverride = null);

  group('concept videos', () {
    test('parse the period, its topic and videos', () {
      final p = PeriodVideos.fromJson(_now());
      expect(p.period!.subjectName, 'Corporate Accounting');
      expect(p.period!.startLabel, '10:00');
      expect(p.period!.end, DateTime(2026, 10, 5, 10, 55));
      expect(p.source, PeriodTopicSource.yearPlan);
      expect(p.key, 'slot1|2026-10-05');
      expect(p.videos.map((v) => v.language), ['en', 'hi']);
      expect(p.videos.first.thumbnailUrl, 'https://i.ytimg.com/vi/abcdefghij1/mqdefault.jpg');
      expect(p.videos.first.durationLabel, '4:05');
      expect(formatVideoDuration(3723), '1:02:03');
      expect(PeriodVideos.fromJson({'period': null, 'source': null, 'topics': [], 'videos': []}).key, isNull);
    });

    test("plays in YouTube's privacy-enhanced embed and stays on the player page", () {
      final html = playerHtml('abcdefghij1', language: 'kn');
      expect(html, contains("host: 'https://www.youtube-nocookie.com'"));
      expect(html, contains("videoId: 'abcdefghij1'"));
      expect(html, contains("hl: 'kn'"));
      expect(() => playerHtml("x'); alert(1); ('"), throwsArgumentError);
      expect(playerMayNavigate('$playerOrigin/', mainFrame: true), isTrue);
      expect(playerMayNavigate('https://www.youtube.com/watch?v=abcdefghij1', mainFrame: true), isFalse);
      expect(playerMayNavigate('https://www.youtube-nocookie.com/embed/abcdefghij1', mainFrame: false), isTrue);
    });
  });

  group('board', () {
    late Map<String, dynamic>? now;
    late int asked;

    Future<BoardController> pump(WidgetTester tester) async {
      tester.view.physicalSize = const Size(1920, 1080);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      asked = 0;
      final client = MockClient((req) async {
        if (req.url.path == '/v1/devices/enroll') return http.Response(jsonEncode({'deviceToken': 'dev', 'device': {'name': 'Board'}}), 201);
        if (req.url.path == '/v1/devices/me/concept-videos') {
          asked++;
          return now == null ? http.Response('{"message":"offline"}', 503) : _json(now!);
        }
        return _json({});
      });
      final board = BoardController(
        apiFactory: (url) => ApiClient(baseUrl: url, client: client),
        realtimeFactory: (_) => _NoRealtime(),
        outboxStore: MemoryOutboxStore(),
      );
      await board.start();
      await board.enroll('http://test', 'CODE');
      await tester.pumpWidget(
        MaterialApp(
          theme: KinetixTheme.light(),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: ConceptVideoSuggestions(board: board, clock: () => DateTime(2026, 10, 5, 10, 5), child: const Scaffold(body: SizedBox.expand())),
        ),
      );
      await tester.pumpAndSettle();
      return board;
    }

    testWidgets('suggests the period topic videos at its start; Skip hides them for that period', (tester) async {
      now = _now();
      final board = await pump(tester);
      expect(find.byKey(const Key('conceptVideoCard')), findsOneWidget);
      expect(find.text('Concept videos for this period'), findsOneWidget);
      expect(find.text('Corporate Accounting · Methods of valuing goodwill'), findsOneWidget);
      expect(find.text('Super profit method'), findsOneWidget);
      expect(find.text('4:05 · हिन्दी'), findsOneWidget);

      await tester.tap(find.byKey(const Key('conceptVideoSkip')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('conceptVideoCard')), findsNothing);

      // A teacher opening their class asks again; the same period stays skipped.
      board.onPaired('tok', DemoBoardServer().session());
      await tester.pumpAndSettle();
      expect(asked, 2);
      expect(find.byKey(const Key('conceptVideoCard')), findsNothing);
      board.dispose();
    });

    testWidgets('a tap plays the video full screen; Close returns to the board', (tester) async {
      now = _now();
      ConceptVideoPlayer.surfaceOverride = (v) => ColoredBox(key: Key('surface-${v.youtubeVideoId}'), color: Colors.black);
      final board = await pump(tester);
      await tester.tap(find.text('Super profit method'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('conceptVideoPlayer')), findsOneWidget);
      expect(find.byKey(const Key('surface-abcdefghij1')), findsOneWidget);
      await tester.tap(find.byKey(const Key('conceptVideoClose')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('conceptVideoPlayer')), findsNothing);
      board.dispose();
    });

    testWidgets('no card before the period, without videos, or offline', (tester) async {
      now = _now(isNow: false, startsAt: '11:00:00');
      var board = await pump(tester);
      expect(find.byKey(const Key('conceptVideoCard')), findsNothing);
      board.dispose();

      now = _now(videos: []);
      board = await pump(tester);
      expect(find.byKey(const Key('conceptVideoCard')), findsNothing);
      board.dispose();

      now = null;
      board = await pump(tester);
      expect(find.byKey(const Key('conceptVideoCard')), findsNothing);
      board.dispose();
    });

    testWidgets('the Concept videos tool shows the next period, or says there is none', (tester) async {
      now = _now(isNow: false, startsAt: '11:00:00');
      final board = await pump(tester);
      final context = tester.element(find.byType(Scaffold).first);
      ConceptVideosDialog.open(context, board);
      await tester.pumpAndSettle();
      expect(find.text('Next period at 11:00 · From the year plan · Plays from YouTube'), findsOneWidget);
      expect(find.text('Super profit method'), findsOneWidget);
      await tester.tap(find.text('Close'));
      await tester.pumpAndSettle();

      now = {'period': null, 'source': null, 'topics': [], 'language': 'en', 'videos': []};
      ConceptVideosDialog.open(context, board);
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('conceptVideosNoPeriod')), findsOneWidget);
      board.dispose();
    });
  });

  testWidgets('the demo board suggests its sample videos', (tester) async {
    Demo.enabled = true;
    addTearDown(() => Demo.enabled = false);
    tester.view.physicalSize = const Size(1920, 1080);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final server = DemoBoardServer(claimDelay: const Duration(seconds: 2));
    final board = demoBoard(server);
    await tester.pumpWidget(KinetixBoardApp(controller: board));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('conceptVideoCard')), findsOneWidget);
    expect(find.text('Re-issue of forfeited shares in 6 minutes'), findsOneWidget);
    await tester.tap(find.byKey(const Key('conceptVideoSkip')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('conceptVideoCard')), findsNothing);
    expect(server.requests, contains('GET /v1/devices/me/concept-videos'));
    await tester.pumpWidget(const SizedBox());
    board.dispose();
  });
}
