// End-to-end: the board's real ApiClient and Realtime against a running KINETIX API.
// Run with scripts/board-it.sh (it reseeds the database and starts the API).
@Tags(['integration'])
library;

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:kinetix_board/core/api_client.dart';
import 'package:kinetix_board/core/models.dart';
import 'package:kinetix_board/core/realtime.dart';

void main() {
  final api = Platform.environment['KINETIX_IT_API'];
  final enrollCode = Platform.environment['KINETIX_IT_ENROLL_CODE'];
  final skip = api == null || enrollCode == null ? 'set KINETIX_IT_API and KINETIX_IT_ENROLL_CODE' : null;

  Future<String> login(String email) async {
    final res = await http.post(
      Uri.parse('$api/v1/auth/login'),
      headers: {'content-type': 'application/json'},
      body: jsonEncode({'tenant': 'demo-college', 'login': email, 'password': 'kinetix123'}),
    );
    return (jsonDecode(res.body) as Map)['accessToken'] as String;
  }

  test('enrol, show a code, teacher claims it, principal circulates, class ends', () async {
    final client = ApiClient(baseUrl: api!);
    final enrolled = await client.enroll(enrollCode!, 'android');
    client.deviceToken = enrolled.deviceToken;
    expect(enrolled.deviceName, 'Room 204 Board');

    final realtime = Realtime(api);
    final ready = Completer<void>();
    final paired = Completer<Map<String, dynamic>>();
    final broadcast = Completer<Map<String, dynamic>>();
    realtime.onReady = () => ready.isCompleted ? null : ready.complete();
    realtime.on(RealtimeEvents.pairingClaimed, paired.complete);
    realtime.on(RealtimeEvents.broadcastNew, broadcast.complete);
    realtime.connect(enrolled.deviceToken);
    await ready.future.timeout(const Duration(seconds: 10));

    final code = await client.newPairingCode();
    expect(code.code, matches(RegExp(r'^\d{6}$')));

    final teacher = await login('anita@demo.kinetix.in');
    final claim = await http.post(
      Uri.parse('$api/v1/pairing/claim'),
      headers: {'content-type': 'application/json', 'authorization': 'Bearer $teacher'},
      body: jsonEncode({'qr': code.qrPayload}),
    );
    expect(claim.statusCode, 200, reason: claim.body);

    final event = await paired.future.timeout(const Duration(seconds: 10));
    final session = SessionContext.fromJson(event['session'] as Map<String, dynamic>);
    expect(session.teacherName, 'Anita Sharma');
    client.sessionToken = event['sessionToken'] as String;

    final principal = await login('principal@demo.kinetix.in');
    await http.post(
      Uri.parse('$api/v1/broadcasts'),
      headers: {'content-type': 'application/json', 'authorization': 'Bearer $principal'},
      body: jsonEncode({
        'title': 'Assembly',
        'body': 'Auditorium at 11:00',
        'priority': 'important',
        'audience': {'all': true},
      }),
    );
    final msg = BroadcastMessage.fromJson(await broadcast.future.timeout(const Duration(seconds: 10)));
    expect(msg.priority, BroadcastPriority.important);
    await client.markDisplayed(msg.id);
    await client.acknowledge(msg.id);

    await client.endSession();
    await expectLater(client.endSession(), throwsA(isA<ApiException>().having((e) => e.status, 'status', 401)));
    realtime.dispose();
  }, skip: skip);
}
