import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kinetix_board/core/api_client.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/core/outbox_store.dart';
import 'package:kinetix_board/core/realtime.dart';
import 'package:kinetix_board/features/board/panel/videos_tab.dart';
import 'package:kinetix_board/features/concept_videos/concept_videos.dart';
import 'package:kinetix_board/l10n/l10n.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _NoRealtime extends Realtime {
  _NoRealtime() : super('http://test');
  @override
  void connect(String token) {}
  @override
  void dispose() {}
}

http.Response _json(Object body, [int status = 200]) => http.Response.bytes(utf8.encode(jsonEncode(body)), status, headers: {'content-type': 'application/json; charset=utf-8'});

Map<String, dynamic> _video(String id, String title, String source) => {
  'id': id,
  'source': source,
  'topicId': 't1',
  'youtubeVideoId': 'abcdefghij${id.substring(id.length - 1)}',
  'title': title,
  'language': 'en',
  'durationSeconds': 245,
  'channelTitle': 'KINETIX',
  'position': 1,
  'topicTitle': 'Methods of valuing goodwill',
};

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('a video knows its source, defaulting to the platform team', () {
    expect(ConceptVideo.fromJson(_video('v1', 'x', 'teacher')).source, 'teacher');
    final legacy = _video('v2', 'y', 'platform')..remove('source');
    expect(ConceptVideo.fromJson(legacy).source, 'platform');
    expect(PeriodVideos.fromJson({'period': {'slotId': 's', 'date': '2026-10-05', 'startsAt': '10:00:00', 'endsAt': '10:55:00', 'section': {'id': 'sec1', 'displayName': 'A'}, 'subject': {'name': 'S'}}, 'topics': [], 'videos': []}).period!.sectionId, 'sec1');
  });

  testWidgets('the Videos tab shows each video\'s source and lets the teacher add one for the class', (tester) async {
    tester.view.physicalSize = const Size(1920, 1080);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    Map<String, dynamic>? posted;
    var videos = [_video('v1', 'KINETIX explainer', 'platform'), _video('v2', 'School explainer', 'institution')];
    final client = MockClient((req) async {
      if (req.url.path == '/v1/devices/enroll') return http.Response(jsonEncode({'deviceToken': 'dev', 'device': {'name': 'Board'}}), 201);
      if (req.url.path == '/v1/devices/me/concept-videos') {
        return _json({
          'period': {'slotId': 'slot1', 'date': '2026-10-05', 'startsAt': '10:00:00', 'endsAt': '10:55:00', 'isNow': true, 'section': {'id': 'sec1', 'displayName': 'BCom Sem 3 A'}, 'subject': {'id': 'sub1', 'name': 'Corporate Accounting'}},
          'source': 'year_plan',
          'topics': [
            {'id': 't1', 'title': 'Methods of valuing goodwill'},
          ],
          'language': 'en',
          'videos': videos,
        });
      }
      if (req.method == 'POST' && req.url.path == '/v1/content/topics/t1/videos') {
        posted = jsonDecode(req.body) as Map<String, dynamic>;
        videos = [...videos, _video('v3', 'My own explainer', 'teacher')];
        return _json(_video('v3', 'My own explainer', 'teacher'), 201);
      }
      return _json({});
    });
    final board = BoardController(apiFactory: (url) => ApiClient(baseUrl: url, client: client), realtimeFactory: (_) => _NoRealtime(), outboxStore: MemoryOutboxStore());
    await board.start();
    await board.enroll('http://test', 'CODE');
    await tester.pumpWidget(
      MaterialApp(
        theme: KinetixTheme.light(),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(body: ConceptVideosTab(board: board, onAddNote: (_) {})),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('KINETIX explainer'), findsOneWidget);
    expect(find.byKey(const Key('videoSource-v1')), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('videoSource-v1')), matching: find.text('KINETIX')), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('videoSource-v2')), matching: find.text('School')), findsOneWidget);

    await tester.tap(find.byKey(const Key('video-add')));
    await tester.pumpAndSettle();
    expect(tester.widget<FilledButton>(find.byKey(const Key('video-link-add'))).onPressed, isNull);
    await tester.enterText(find.byKey(const Key('video-link')), 'https://youtu.be/abcdefghij3');
    await tester.pump();
    await tester.tap(find.byKey(const Key('video-link-add')));
    await tester.pumpAndSettle();

    expect(posted, {'url': 'https://youtu.be/abcdefghij3', 'scope': 'teacher', 'sectionIds': ['sec1']});
    expect(find.text('Video added for this class'), findsOneWidget);
    expect(find.text('My own explainer'), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('videoSource-v3')), matching: find.text('Teacher')), findsOneWidget);
  });
}
