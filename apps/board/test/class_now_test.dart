import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:zynetix_board/core/api_client.dart';
import 'package:zynetix_board/core/board_controller.dart';
import 'package:zynetix_board/core/models.dart';
import 'package:zynetix_board/core/outbox_store.dart';
import 'package:zynetix_board/features/room_sync/room_sync_gate.dart';
import 'package:zynetix_ui/zynetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/fake_cloud.dart';

/// Class start from the timetable: a teacher who signs in during their period gets that class
/// on the board at once; one already in another class is offered it.
void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  final requests = <String>[];

  /// The cloud: [onIt] when the session is already on the period, [attached] when the session
  /// already has a class of its own.
  Future<BoardController> board({bool onIt = false, bool attached = false}) async {
    requests.clear();
    http.Response json(Object body) => http.Response.bytes(utf8.encode(jsonEncode(body)), 200, headers: {'content-type': 'application/json'});
    final client = MockClient((req) async {
      requests.add('${req.method} ${req.url.path}');
      return switch (req.url.path) {
        '/v1/devices/enroll' => json({
          'deviceToken': 'dev',
          'device': {'name': 'Room 8B Board'},
        }),
        '/v1/devices/me/exam-room' => json({'active': false}),
        '/v1/classroom/now' => json({
          'slot': {'sectionName': 'Class 8 B', 'subjectName': 'Science'},
          'onIt': onIt,
          'sessionSectionId': attached ? 'sec-other' : null,
        }),
        '/v1/classroom/now/open' => json({
          'sessionId': 's1',
          'expiresAt': DateTime.now().add(const Duration(hours: 1)).toIso8601String(),
          'teacher': {'id': 't1', 'fullName': 'Meera Rao', 'preferredLanguage': 'en'},
          'section': {'id': 'sec-8b', 'displayName': 'Class 8 B', 'term': 8, 'level': 'k12'},
          'subject': {'name': 'Science'},
          'period': {'startsAt': '09:00:00', 'endsAt': '09:45:00'},
        }),
        _ => json(<Object>[]),
      };
    });
    final b = BoardController(apiFactory: (url) => ApiClient(baseUrl: url, client: client), realtimeFactory: (_) => NoRealtime(), outboxStore: MemoryOutboxStore());
    await b.enroll('http://test', 'KX-AAAA-BBBB');
    b.startRoomWatch();
    await pumpEventQueue();
    return b;
  }

  SessionContext signedIn({String? section}) => SessionContext(
    sessionId: 's1',
    expiresAt: DateTime.now().add(const Duration(hours: 1)),
    teacherId: 't1',
    teacherName: 'Meera Rao',
    language: 'en',
    sectionName: section,
  );

  test('signing in during the period opens its class straight away', () async {
    final b = await board();
    expect(requests.where((r) => r == 'GET /v1/classroom/now'), isEmpty, reason: 'nobody signed in yet');
    b.onPaired('token', signedIn());
    await pumpEventQueue();
    expect(requests, contains('POST /v1/classroom/now/open'));
    expect(b.session!.sectionName, 'Class 8 B');
    expect(b.session!.subjectName, 'Science');
    expect(b.suggestedClass, isNull);
    b.dispose();
  });

  testWidgets('a teacher in another class is offered the period, and Open moves the board to it', (tester) async {
    final b = (await tester.runAsync(() => board(attached: true)))!;
    // As in the app (main.dart), the gate is rebuilt when the board changes.
    await tester.pumpWidget(
      MaterialApp(
        theme: ZynetixTheme.light(),
        home: ListenableBuilder(listenable: b, builder: (context, _) => RoomSyncGate(board: b, child: const Scaffold(body: SizedBox.expand()))),
      ),
    );
    b.onPaired('token', signedIn(section: 'Class 9 A'));
    await tester.runAsync(pumpEventQueue);
    await tester.pump();
    expect(b.suggestedClass, isNotNull);
    expect(find.byKey(const Key('class-now-banner')), findsOneWidget);
    expect(find.textContaining('Class 8 B · Science'), findsOneWidget);
    await tester.tap(find.byKey(const Key('class-now-open')));
    await tester.runAsync(pumpEventQueue);
    await tester.pump();
    expect(b.session!.sectionName, 'Class 8 B');
    expect(find.byKey(const Key('class-now-banner')), findsNothing);
    await tester.pumpWidget(const SizedBox());
    b.dispose();
  });

  test('a teacher already on the period is not asked again', () async {
    final b = await board(onIt: true);
    b.onPaired('token', signedIn(section: 'Class 8 B'));
    await pumpEventQueue();
    expect(requests, contains('GET /v1/classroom/now'));
    expect(requests, isNot(contains('POST /v1/classroom/now/open')));
    expect(b.suggestedClass, isNull);
    b.dispose();
  });
}
