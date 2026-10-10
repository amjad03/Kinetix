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
import 'package:kinetix_board/features/room_sync/room_sync_gate.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _NoRealtime extends Realtime {
  _NoRealtime() : super('http://test');
  @override
  void connect(String token) {}
  @override
  void dispose() {}
}

SessionContext _session(String id) => SessionContext(
      sessionId: id,
      expiresAt: DateTime.now().add(const Duration(hours: 1)),
      teacherId: 't1',
      teacherName: 'Anita Sharma',
      language: 'en',
      sectionName: 'BCom Sem 3 A',
      subjectName: 'Corporate Accounting',
    );

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late bool up;
  late List<String> calls;

  BoardController board(MemoryOutboxStore store) {
    final client = MockClient((req) async {
      if (req.url.path == '/v1/devices/enroll') return http.Response(jsonEncode({'deviceToken': 'dev', 'device': {'name': 'Room 204'}}), 201);
      if (req.url.path == '/v1/sync/push') return http.Response(jsonEncode({'results': []}), 200);
      if (!up) throw http.ClientException('offline');
      calls.add('${req.method} ${req.url.path} ${req.body}');
      return http.Response('{}', 200);
    });
    return BoardController(apiFactory: (url) => ApiClient(baseUrl: url, client: client), realtimeFactory: (_) => _NoRealtime(), outboxStore: store);
  }

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    up = false;
    calls = [];
  });

  test('homework, a topic taught and a badge made offline are kept, survive a restart and replay in order', () async {
    final store = MemoryOutboxStore();
    final first = board(store);
    await first.start();
    await first.enroll('http://test', 'KX-AAAA-BBBB');
    first.onPaired('session-token', _session('s1'));
    await first.api!.markTopicTaught('t1');
    await first.api!.homeworkFromBoard(title: 'Exercise 4', dueOn: DateTime(2026, 10, 20));
    await first.api!.awardBadge('stu-1', 'star', sectionId: 'sec-1');
    expect(first.pendingOps, 3);
    expect(store.ops.every((op) => op['type'] == 'rest'), isTrue);
    await first.outboxSaved;
    await Future<void>.delayed(const Duration(milliseconds: 50)); // let the recordings list finish loading
    first.dispose();

    final second = board(store);
    await second.start();
    expect(second.pendingOps, 3);
    second.onPaired('session-token', _session('s1'));
    up = true;
    await second.flushOutbox();
    await second.outboxSaved;
    expect(second.pendingOps, 0);
    expect(calls.where((c) => !c.startsWith('GET')).map((c) => c.split(' ').take(2).join(' ')), ['POST /v1/coverage', 'POST /v1/homework/from-board', 'POST /v1/badges']);
  });

  test('a board saved offline is kept (the latest save only) and goes up when the board is back', () async {
    final store = MemoryOutboxStore();
    final b = board(store);
    await b.start();
    await b.enroll('http://test', 'KX-AAAA-BBBB');
    b.onPaired('session-token', _session('s1'));
    final saved = SavedBoard(background: BoardBackground.plain, canvas: const Size(1920, 1080), pages: const []);
    final first = await b.api!.saveWhiteboard('11111111-1111-4111-8111-111111111111', title: 'Shares', board: saved, share: true);
    expect(first.title, 'Shares');
    await b.api!.saveWhiteboard('11111111-1111-4111-8111-111111111111', title: 'Shares v2', board: saved, share: true);
    expect(b.pendingOps, 1);
    up = true;
    await b.flushOutbox();
    await b.outboxSaved;
    expect(b.pendingOps, 0);
    final puts = calls.where((c) => c.startsWith('PUT /v1/whiteboards/')).toList();
    expect(puts, hasLength(1));
    expect(puts.single, contains('Shares v2'));
  });

  test('a call the server refuses is not kept', () async {
    final client = MockClient((req) async => http.Response('{"message":"no"}', 400));
    final api = ApiClient(baseUrl: 'http://test', client: client)..defer = (m, p, b) async => fail('refused calls must not be deferred');
    await expectLater(api.markTopicTaught('t1'), throwsA(isA<ApiException>()));
  });

  testWidgets('exam room mode covers the board with the paper, the clock and the seated count', (tester) async {
    final exam = {
      'active': true,
      'room': 'Hall A',
      'paper': {'subject': 'Corporate Accounting', 'section': 'BCom Sem 3 A', 'startsAt': '10:00', 'endsAt': '13:00'},
      'seated': 42,
      'invigilators': [
        {'name': 'R. Nair', 'role': 'chief'},
      ],
      'started': true,
      'minutesLeft': 95,
      'startsInMinutes': 0,
    };
    await tester.pumpWidget(MaterialApp(home: ExamRoomScreen(exam: exam)));
    expect(find.byKey(const Key('exam-room')), findsOneWidget);
    expect(find.text('95 min left'), findsOneWidget);
    expect(find.text('42 candidates seated'), findsOneWidget);
    expect(find.textContaining('R. Nair'), findsOneWidget);
  });
}
