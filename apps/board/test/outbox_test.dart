import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kinetix_board/core/api_client.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/core/models.dart';
import 'package:kinetix_board/core/outbox_store.dart';
import 'package:kinetix_board/core/realtime.dart';
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

/// Lets the background flush that a change starts run to completion.
Future<void> settle(BoardController b) async {
  for (var i = 0; i < 20; i++) {
    await Future<void>.delayed(const Duration(milliseconds: 1));
  }
  await b.flushOutbox();
  await b.outboxSaved;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late List<http.Request> pushes;
  late bool serverUp;
  late int refuseWith;

  BoardController board(OutboxStore store) {
    final client = MockClient((req) async {
      if (req.url.path == '/v1/devices/enroll') {
        return http.Response(jsonEncode({'deviceToken': 'dev', 'device': {'name': 'Room 204 Board'}}), 201);
      }
      if (req.url.path == '/v1/sync/push') {
        if (!serverUp) throw http.ClientException('offline');
        pushes.add(req);
        if (refuseWith != 0) return http.Response('{"message":"too old"}', refuseWith);
        final ops = (jsonDecode(req.body) as Map)['ops'] as List;
        return http.Response(jsonEncode({'results': [for (final op in ops) {'opId': op['opId'], 'status': 'applied'}]}), 200);
      }
      return http.Response('[]', 200);
    });
    return BoardController(apiFactory: (url) => ApiClient(baseUrl: url, client: client), realtimeFactory: (_) => _NoRealtime(), outboxStore: store);
  }

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    pushes = [];
    serverUp = true;
    refuseWith = 0;
  });

  test('attendance marked offline survives a restart and goes up after the class ended', () async {
    final store = MemoryOutboxStore();
    final first = board(store);
    await first.start();
    await first.enroll('http://test', 'KX-AAAA-BBBB');
    first.onPaired('session-token', _session('s1'));
    serverUp = false;
    first.markAttendance({'stu-1': AttendanceMark.absent, 'stu-2': AttendanceMark.present});
    await settle(first);
    expect(first.pendingOps, 2);
    expect(store.ops.map((op) => op['sessionId']), ['s1', 's1']);
    first.dispose();

    // The board restarts; the class is over by now, so there is no session token.
    serverUp = true;
    final second = board(store);
    await second.start();
    expect(second.pendingOps, 2);
    await settle(second);
    expect(second.pendingOps, 0);
    expect(store.ops, isEmpty);
    final sent = pushes.single;
    expect(sent.headers['authorization'], 'Bearer dev');
    final body = jsonDecode(sent.body) as Map<String, dynamic>;
    expect(body['sessionId'], 's1');
    expect((body['ops'] as List).first, isNot(contains('sessionId')));
    second.dispose();
  });

  test('ops from the current class use the session token, and ops the server refuses for good are dropped', () async {
    final store = MemoryOutboxStore()
      ..ops = [
        {'opId': 'old-1', 'type': 'attendance.marked', 'occurredAt': '2026-09-01T04:00:00Z', 'payload': {}, 'sessionId': 'ancient'},
      ];
    final b = board(store);
    await b.start();
    await b.enroll('http://test', 'KX-AAAA-BBBB');
    refuseWith = 403;
    await settle(b);
    expect(b.pendingOps, 0);

    refuseWith = 0;
    b.onPaired('session-token', _session('s2'));
    b.markAttendance({'stu-1': AttendanceMark.late});
    await settle(b);
    expect(pushes.last.headers['authorization'], 'Bearer session-token');
    expect(b.pendingOps, 0);
    b.dispose();
  });
}
