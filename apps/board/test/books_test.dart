import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kinetix_board/core/api_client.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/core/models.dart';
import 'package:kinetix_board/core/outbox_store.dart';
import 'package:kinetix_board/core/realtime.dart';
import 'package:kinetix_board/features/board/board_screen.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _NoRealtime extends Realtime {
  _NoRealtime() : super('http://test');
  @override
  void connect(String token) {}
  @override
  void dispose() {}
}

const _syllabus = {
  'id': 'c1',
  'title': 'Corporate Accounting, BCom Semester 3',
  'reviewed': false,
  'chapters': [
    {
      'id': 'ch1',
      'title': 'Valuation of Goodwill',
      'own': false,
      'topics': [
        {'id': 't1', 'title': 'Methods of valuing goodwill', 'summary': 'Average profit, super profit…', 'own': false},
      ],
    },
    {'id': 'ch2', 'title': 'Revision', 'own': true, 'topics': []},
  ],
};

void main() {
  late List<http.Request> requests;
  http.Response json(Object body) => http.Response.bytes(utf8.encode(jsonEncode(body)), 200, headers: {'content-type': 'application/json; charset=utf-8'});
  late bool linked;

  Future<BoardController> pump(WidgetTester tester, {bool signedIn = true}) async {
    SharedPreferences.setMockInitialValues({});
    tester.view.physicalSize = const Size(1920, 1080);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    requests = [];
    final client = MockClient((req) async {
      requests.add(req);
      final path = req.url.path;
      if (path == '/v1/devices/enroll') return http.Response(jsonEncode({'deviceToken': 'dev', 'device': {'name': 'Board'}}), 201);
      if (path == '/v1/content/syllabus') return linked ? json(_syllabus) : http.Response('', 200);
      if (path == '/v1/content/topics/t1') {
        return json({
            'id': 't1',
            'title': 'Methods of valuing goodwill',
            'summary': 'Average profit, super profit and capitalisation methods.',
            'notes': ['Goodwill = Super profit × Number of years’ purchase.'],
            'outcomes': ['Value goodwill by three methods'],
            'chapter': {'id': 'ch1', 'title': 'Valuation of Goodwill'},
            'course': {'id': 'c1', 'title': 'Corporate Accounting', 'reviewed': false},
          });
      }
      if (path == '/v1/ai/explain') {
        return http.Response(
          jsonEncode({
            'task': 'explain',
            'result': {'answer': 'Goodwill is valued from profits.', 'keyPoints': [], 'followUps': []},
            'meta': {'cached': false, 'preview': false, 'sources': [{'topicId': 't1', 'title': 'Methods of valuing goodwill'}]},
          }),
          200,
        );
      }
      return http.Response('[]', 200);
    });
    final board = BoardController(apiFactory: (url) => ApiClient(baseUrl: url, client: client), realtimeFactory: (_) => _NoRealtime(), outboxStore: MemoryOutboxStore());
    await board.enroll('http://test', 'KX-AAAA-BBBB');
    if (signedIn) {
      board.onPaired(
        'session-token',
        SessionContext(
          sessionId: 's1',
          expiresAt: DateTime.now().add(const Duration(hours: 1)),
          teacherId: 't1',
          teacherName: 'Anita Sharma',
          language: 'en',
          sectionName: 'BCom Sem 3 A',
          subjectName: 'Corporate Accounting',
        ),
      );
    }
    await tester.pumpWidget(MaterialApp(theme: KinetixTheme.light(), home: BoardScreen(board: board)));
    await tester.pumpAndSettle();
    return board;
  }

  setUp(() => linked = true);

  testWidgets('opens the class syllabus, a topic in large type, and explains it grounded in that topic', (tester) async {
    final board = await pump(tester);
    await tester.tap(find.byKey(const Key('panel-books')));
    await tester.pumpAndSettle();
    expect(find.text('Corporate Accounting, BCom Semester 3'), findsOneWidget);
    expect(find.textContaining('Draft content'), findsOneWidget);
    expect(find.text('Added by your institution · Notes coming soon'), findsOneWidget);

    await tester.tap(find.byKey(const Key('chapter-ch1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('topic-t1')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('books-topic')), findsOneWidget);
    expect(find.textContaining('Super profit × Number'), findsOneWidget);

    await tester.tap(find.byKey(const Key('topic-explain')));
    await tester.pumpAndSettle();
    final explain = requests.lastWhere((r) => r.url.path == '/v1/ai/explain');
    expect(jsonDecode(explain.body), containsPair('topicId', 't1'));
    expect(find.byKey(const Key('ai-explanation')), findsOneWidget);
    expect(find.text('Based on your syllabus: Methods of valuing goodwill'), findsOneWidget);
    board.dispose();
  });

  testWidgets('explains when the subject is not linked to a syllabus yet', (tester) async {
    linked = false;
    final board = await pump(tester);
    await tester.tap(find.byKey(const Key('panel-books')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('books-unlinked')), findsOneWidget);
    board.dispose();
  });

  testWidgets('a guest board is asked to sign in', (tester) async {
    await pump(tester, signedIn: false);
    await tester.tap(find.byKey(const Key('panel-books')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('books-signin')), findsOneWidget);
  });
}
