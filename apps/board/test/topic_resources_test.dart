import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kinetix_board/core/api_client.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/core/outbox_store.dart';
import 'package:kinetix_board/core/realtime.dart';
import 'package:kinetix_board/features/concept_videos/concept_video_player.dart';
import 'package:kinetix_board/features/concept_videos/concept_video_suggestions.dart';
import 'package:kinetix_board/features/concept_videos/concept_videos.dart';
import 'package:kinetix_board/features/insert/document_import.dart';
import 'package:kinetix_board/features/insert/presentation_pane.dart';
import 'package:kinetix_board/features/topic_resources/board_topic_resources.dart';
import 'package:kinetix_board/l10n/l10n.dart';
import 'package:kinetix_resources/kinetix_resources.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _NoRealtime extends Realtime {
  _NoRealtime() : super('http://test');
  @override
  void connect(String token) {}
  @override
  void dispose() {}
}

http.Response _json(Object? body, [int status = 200]) => http.Response.bytes(utf8.encode(jsonEncode(body)), status, headers: {'content-type': 'application/json; charset=utf-8'});

const _t1 = {
  'videos': [
    {'id': 'v1', 'title': 'Kirchhoff explained', 'provider': 'youtube', 'youtubeId': 'abcdefghijk', 'durationSec': 300, 'source': 'platform'},
    {'id': 'v2', 'title': 'Campus lab recording', 'provider': 'upload', 'url': '/files/lab.mp4', 'source': 'institution'},
  ],
  'materials': [
    {'id': 'm1', 'kind': 'book', 'title': 'Circuit Analysis', 'url': '/files/book.pdf', 'chapter': '2', 'pages': '3-4'},
    {'id': 'm2', 'kind': 'link', 'title': 'NPTEL', 'url': 'https://nptel.ac.in/x'},
  ],
  'animations': [
    {'key': 'mitosis', 'title': 'Mitosis'},
  ],
};

void main() {
  late List<String> requests;
  late bool online;
  late MemoryResourceStore store;

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    requests = [];
    online = true;
    store = MemoryResourceStore();
    BoardTopicResources.filesDir = () async => null;
  });

  Future<BoardController> board() async {
    final client = MockClient((req) async {
      requests.add('${req.method} ${req.url.path}');
      if (req.url.path == '/v1/devices/enroll') return http.Response(jsonEncode({'deviceToken': 'dev', 'device': {'name': 'Board'}}), 201);
      if (!online) throw http.ClientException('offline');
      return switch (req.url.path) {
        '/v1/devices/me/concept-videos' => _json({
          'topics': [
            {'id': 't1', 'title': 'Kirchhoff\'s laws'},
          ],
          'videos': [],
        }),
        '/v1/content/syllabus' => _json({
          'chapters': [
            {'title': 'Unit 1', 'topics': [{'id': 't1', 'title': 'Kirchhoff\'s laws'}, {'id': 't2', 'title': 'Thevenin'}]},
          ],
        }),
        '/v1/topics/t1/resources' => _json(_t1),
        '/v1/topics/t2/resources' => _json({'videos': [], 'materials': [], 'animations': []}),
        // A server without the new endpoint: the topic's concept videos instead.
        '/v1/topics/t3/resources' => _json({'message': 'Not found'}, 404),
        '/v1/content/topics/t3/videos' => _json({'videos': [{'id': 'c1', 'youtubeVideoId': 'zzzzzzzzzzz', 'title': 'Legacy video', 'topicId': 't3'}]}),
        '/files/book.pdf' => http.Response.bytes(Uint8List.fromList([37, 80, 68, 70]), 200),
        _ => _json({}),
      };
    });
    final b = BoardController(apiFactory: (url) => ApiClient(baseUrl: url, client: client), realtimeFactory: (_) => _NoRealtime(), outboxStore: MemoryOutboxStore());
    await b.start();
    await b.enroll('http://test', 'CODE');
    return b;
  }

  Future<void> pump(WidgetTester tester, BoardController b) async {
    tester.view.physicalSize = const Size(1920, 1080);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      MaterialApp(
        theme: KinetixTheme.light(),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(body: BoardTopicResources(board: b, store: store)),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('the period topic\'s resources: videos play in the panel, a book opens at its pages', (tester) async {
    final b = await board();
    await pump(tester, b);
    expect(find.text('Kirchhoff explained'), findsOneWidget);
    expect(find.text('Circuit Analysis'), findsOneWidget);
    expect(find.text('Mitosis'), findsOneWidget);

    ConceptVideoPlayer.surfaceOverride = (v) => Text('playing ${v.youtubeVideoId}');
    addTearDown(() => ConceptVideoPlayer.surfaceOverride = null);
    await tester.tap(find.byKey(const Key('res-video-v1')));
    await tester.pumpAndSettle();
    expect(find.text('playing abcdefghijk'), findsOneWidget);
    await tester.tap(find.byKey(const Key('conceptVideoClose')));
    await tester.pumpAndSettle();

    (int, int?)? asked;
    Presentation? shown;
    BoardTopicResources.renderPdf = (bytes, first, last) async {
      asked = (first, last);
      return [ImportedPage(Uint8List(0), const Size(10, 10)), ImportedPage(Uint8List(0), const Size(10, 10))];
    };
    presentationHost = (p) => shown = p;
    addTearDown(() => presentationHost = null);
    await tester.tap(find.byKey(const Key('res-material-m1')));
    await tester.pumpAndSettle();
    expect(requests, contains('GET /files/book.pdf'));
    expect(asked, (3, 4));
    expect(shown?.isPdf, isTrue);
    expect(shown?.pages, hasLength(2));
    expect(shown?.name, contains('3–4'));

    Uri? launched;
    BoardTopicResources.launcher = (u) async {
      launched = u;
      return true;
    };
    await tester.tap(find.byKey(const Key('res-material-m2')));
    await tester.pumpAndSettle();
    expect(launched.toString(), 'https://nptel.ac.in/x');
  });

  testWidgets('the teacher picks another topic of the subject', (tester) async {
    final b = await board();
    await pump(tester, b);
    await tester.tap(find.byKey(const Key('board-res-topic')));
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('Thevenin').last);
    await tester.pumpAndSettle();
    expect(requests, contains('GET /v1/topics/t2/resources'));
    expect(find.byKey(const Key('res-none')), findsOneWidget);
  });

  testWidgets('offline: the saved list, with online-only videos marked', (tester) async {
    final b = await board();
    await pump(tester, b);
    online = false;
    await tester.pumpWidget(const SizedBox());
    await pump(tester, b);
    expect(find.byKey(const Key('res-offline')), findsOneWidget);
    expect(find.text('Kirchhoff explained'), findsOneWidget);
    expect(find.text('5:00 · Zynetix · Needs internet'), findsOneWidget);
    // The campus upload still plays.
    expect(find.text('Institution'), findsOneWidget);
  });

  testWidgets('the period card opens the topic\'s resources in one tap', (tester) async {
    final b = await board();
    tester.view.physicalSize = const Size(1920, 1080);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      MaterialApp(
        theme: KinetixTheme.light(),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: Builder(
            builder: (context) => ConceptVideoCard(
              videos: PeriodVideos.fromJson({
                'period': {'slotId': 's', 'date': '2026-10-21', 'startsAt': '10:00:00', 'endsAt': '10:55:00', 'isNow': true, 'section': {'id': 'x', 'displayName': 'A'}, 'subject': {'name': 'Circuits'}},
                'topics': [{'id': 't1', 'title': 'Kirchhoff\'s laws'}],
                'videos': [],
              }),
              onSkip: () {},
              onResources: () => openTopicResources(context, b),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.byKey(const Key('conceptVideoResources')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('topicResourcesPanel')), findsOneWidget);
    expect(find.text('Kirchhoff explained'), findsOneWidget);
  });

  test('falls back to concept videos on a server without the endpoint', () async {
    final b = await board();
    final repo = TopicResourcesRepository(store: store, fetch: (id) => fetchTopicResources(b.api!, id));
    final r = await repo.load('t3');
    expect(r.resources.videos.single.youtubeId, 'zzzzzzzzzzz');
  });

  test('file videos: only http(s), escaped', () {
    expect(fileVideoHtml('http://10.0.0.2:4000/files/a.mp4?x=1&y="2"'), contains('src="http://10.0.0.2:4000/files/a.mp4?x=1&amp;y=%222%22"'));
    expect(() => fileVideoHtml('javascript:alert(1)'), throwsArgumentError);
    expect(playerMayNavigate('http://10.0.0.2:4000/', mainFrame: true, origin: 'http://10.0.0.2:4000'), isTrue);
    expect(playerMayNavigate('https://youtube.com/', mainFrame: true, origin: 'http://10.0.0.2:4000'), isFalse);
  });
}
