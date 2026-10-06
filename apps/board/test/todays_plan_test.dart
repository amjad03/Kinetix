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
import 'support/layout.dart';

class _NoRealtime extends Realtime {
  _NoRealtime() : super('http://test');
  @override
  void connect(String token) {}
  @override
  void dispose() {}
}

Map<String, dynamic> _current({bool planned = true}) => {
  'slot': {'id': 'slot1', 'startsAt': '10:00:00', 'endsAt': '10:55:00', 'sectionId': 'sec1', 'section': 'BCom Sem 3 A', 'subjectId': 'sub1'},
  'subject': {'id': 'sub1', 'name': 'Corporate Accounting'},
  'date': '2026-10-05',
  'suggestedTopicIds': ['t1'],
  'plan': planned
      ? {
          'id': 'lp1',
          'date': '2026-10-05',
          'topicIds': ['t1'],
          'topics': [
            {'id': 't1', 'title': 'Methods of valuing goodwill'},
          ],
          'content': {
            'objectives': ['Value goodwill by the super profit method'],
            'steps': [
              {'minutes': 10, 'activity': 'Recap of average profit'},
              {'minutes': 30, 'activity': 'Worked example on the board'},
            ],
            'materials': ['Textbook', 'Calculator'],
            'assessment': 'Two quick questions at the end',
            'homework': 'Exercise 4.2',
          },
          'aiDrafted': true,
          'teacher': 'Anita Sharma',
          'reviewedAt': null,
          'reviewRemark': null,
        }
      : null,
};

void main() {
  late List<http.Request> requests;
  http.Response json(Object body) => http.Response.bytes(utf8.encode(jsonEncode(body)), 200, headers: {'content-type': 'application/json; charset=utf-8'});

  /// What GET /v1/lesson-plans/current returns (null: a free session, so an empty body).
  Map<String, dynamic>? current;

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
      if (path == '/v1/lesson-plans/current') return current == null ? http.Response('', 200) : json(current!);
      if (path == '/v1/content/syllabus') return http.Response('', 200);
      if (path == '/v1/coverage') {
        if (req.method == 'POST') return json({'topicId': 't1', 'coveredOn': '2026-10-05'});
        return json({'covered': 0, 'total': 1, 'percent': 0, 'topics': []});
      }
      if (path == '/v1/content/topics/t1') {
        return json({
          'id': 't1',
          'title': 'Methods of valuing goodwill',
          'summary': 'Average profit, super profit and capitalisation methods.',
          'notes': [],
          'outcomes': [],
          'chapter': {'id': 'ch1', 'title': 'Valuation of Goodwill'},
          'course': {'id': 'c1', 'title': 'Corporate Accounting', 'reviewed': true},
          'resources': [],
        });
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
          teacherId: 'u1',
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

  Future<void> open(WidgetTester tester) async {
    await tester.tap(find.byKey(const Key('tool-tools')));
    await tester.pumpAndSettle();
    await tapBoard(tester, 'drawer-todays-plan');
    await tester.pumpAndSettle();
  }

  setUp(() => current = _current());

  testWidgets("shows the open period's plan, read-only, with a step timer", (tester) async {
    final board = await pump(tester);
    await open(tester);
    expect(requests.where((r) => r.url.path == '/v1/lesson-plans/current'), hasLength(1));
    expect(find.byKey(const Key('plan-view')), findsOneWidget);
    expect(find.text('Value goodwill by the super profit method'), findsOneWidget);
    expect(find.text('STEPS · 40 OF 55 MIN'), findsOneWidget);
    expect(find.text('Worked example on the board'), findsOneWidget);
    expect(find.text('Calculator'), findsOneWidget);
    expect(find.text('Two quick questions at the end'), findsOneWidget);
    expect(find.text('Exercise 4.2'), findsOneWidget);
    expect(find.text('Drafted with KINETIX AI'), findsOneWidget);
    expect(find.byType(TextField), findsNothing);

    // The step timer counts down the current step and moves on.
    await tester.tap(find.byKey(const Key('plan-timer')));
    await tester.pump();
    expect(find.text('10:00'), findsOneWidget);
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('09:59'), findsOneWidget);
    await tester.pump(const Duration(minutes: 10));
    expect(find.descendant(of: find.byKey(const Key('plan-step-1')), matching: find.byKey(const Key('plan-step-left'))), findsOneWidget);
    await tester.tap(find.byKey(const Key('plan-timer'))); // pause
    await tester.pump();
    await tester.tap(find.byKey(const Key('plan-next')));
    await tester.pump();
    expect(find.byKey(const Key('plan-done')), findsOneWidget);
    board.dispose();
  });

  testWidgets('the step timer keeps running in other panels and when closed, and starts over for a new class', (tester) async {
    final board = await pump(tester);
    await open(tester);
    await tester.tap(find.byKey(const Key('plan-timer')));
    await tester.pump(const Duration(seconds: 5));
    expect(find.text('09:55'), findsOneWidget);

    // Books for a minute, then the panel closed for another.
    await tapBoard(tester, 'panel-tab-books');
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('plan-view')), findsNothing);
    await tester.pump(const Duration(minutes: 1));
    await tester.tap(find.byKey(const Key('panel-close')));
    await tester.pumpAndSettle();
    await tester.pump(const Duration(minutes: 1));

    // Reopened: still counting, from where it got to.
    await open(tester);
    // (Opening and closing panels takes a few animated moments of its own.)
    String left() => tester.widget<Text>(find.byKey(const Key('plan-step-left'))).data!;
    expect(left(), matches(RegExp(r'^07:5[0-5]$')));
    expect(find.text('Pause'), findsOneWidget);
    final before = left();
    await tester.pump(const Duration(seconds: 1));
    expect(left(), isNot(before));

    // Past the first step while away: the second step is current on return.
    await tester.tap(find.byKey(const Key('panel-close')));
    await tester.pumpAndSettle();
    await tester.pump(const Duration(minutes: 9));
    await open(tester);
    expect(find.descendant(of: find.byKey(const Key('plan-step-1')), matching: find.byKey(const Key('plan-step-left'))), findsOneWidget);

    // Another class session: the timer starts over.
    board.onPaired(
      'session-token-2',
      SessionContext(
        sessionId: 's2',
        expiresAt: DateTime.now().add(const Duration(hours: 1)),
        teacherId: 'u1',
        teacherName: 'Anita Sharma',
        language: 'en',
        sectionName: 'BCom Sem 3 A',
        subjectName: 'Corporate Accounting',
      ),
    );
    await tester.pumpAndSettle();
    await tester.pump(const Duration(seconds: 2));
    expect(find.byKey(const Key('plan-step-left')), findsNothing);
    expect(find.text('Start step timer'), findsOneWidget);
    board.dispose();
  });

  testWidgets('a topic opens in Books, where it can be marked as taught', (tester) async {
    final board = await pump(tester);
    await open(tester);
    await tester.tap(find.byKey(const Key('plan-topic-t1')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('books-topic')), findsOneWidget);
    expect(find.text('Average profit, super profit and capitalisation methods.'), findsOneWidget);
    await tester.tap(find.byKey(const Key('mark-t1')));
    await tester.pumpAndSettle();
    expect(requests.where((r) => r.url.path == '/v1/coverage' && r.method == 'POST'), hasLength(1));
    expect(find.text('Marked as taught'), findsOneWidget);

    // Books opened from the toolbar starts at the outline again.
    await tapBoard(tester, 'panel-tab-books');
    await tester.pumpAndSettle();
    await tapBoard(tester, 'panel-tab-books');
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('books-topic')), findsNothing);
    board.dispose();
  });

  testWidgets('says so when the period has no plan', (tester) async {
    current = _current(planned: false);
    final board = await pump(tester);
    await open(tester);
    expect(find.byKey(const Key('plan-none')), findsOneWidget);
    board.dispose();
  });

  testWidgets('a free session has no plan to show', (tester) async {
    current = null;
    final board = await pump(tester);
    await open(tester);
    expect(find.byKey(const Key('plan-no-class')), findsOneWidget);
    board.dispose();
  });

  testWidgets('a guest board is asked to sign in', (tester) async {
    await pump(tester, signedIn: false);
    await open(tester);
    expect(find.byKey(const Key('plan-signin')), findsOneWidget);
    expect(requests.where((r) => r.url.path == '/v1/lesson-plans/current'), isEmpty);
  });
}
