// Contract check against a running API with the Soundarya demo seed (skipped unless LIVE_API_URL is set):
//   LIVE_API_URL=http://localhost:4320 flutter test test/live_attendance_test.dart
// The Student App's HTTP client reads the attendance overview and sends a QR self-mark with the install id and the
// location; the answer (marked, held, or refused once the period is over) parses either way.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:zynetix_student/core/api.dart';

final _url = Platform.environment['LIVE_API_URL'];

Future<String> _token(String login) async {
  final r = await http.post(Uri.parse('$_url/v1/auth/login'), headers: {'content-type': 'application/json'}, body: jsonEncode({'tenant': 'soundarya', 'login': '$login@soundarya.demo.zynetix.in', 'password': 'zynetix123'}));
  return (jsonDecode(r.body) as Map)['accessToken'] as String;
}

Future<dynamic> _call(String token, String method, String path, [Object? body]) async {
  final req = http.Request(method, Uri.parse('$_url$path'))..headers.addAll({'authorization': 'Bearer $token', 'content-type': 'application/json'});
  if (body != null) req.body = jsonEncode(body);
  return jsonDecode(await (await req.send()).stream.bytesToString());
}

void main() {
  setUpAll(() => HttpOverrides.global = null);

  test('overview and a QR self-mark round trip through the real API', () async {
    final principal = await _token('principal');
    final found = await _call(principal, 'GET', '/v1/students?q=25BCM001');
    final rows = (found is Map ? found['rows'] : found) as List;
    final studentId = (rows.first as Map)['id'] as String;

    final api = HttpStudentApi(baseUrl: _url!)..deviceId = 'live-contract-test-install-0001';
    await api.login(tenant: 'soundarya', login: 'student.bcom@soundarya.demo.zynetix.in', password: 'zynetix123');
    final o = await api.attendanceOverview(studentId);
    expect(o.overall.held, greaterThan(0));
    expect(o.subjects, isNotEmpty);

    // The class's first period today: its teacher shows the code, the student types it.
    final teacher = await _token('anand.bangera');
    final day = await _call(teacher, 'GET', '/v1/teacher/timetable') as Map;
    final periods = day['periods'] as List;
    if (periods.isEmpty) return; // no classes today (holiday): nothing more to check
    final code = await _call(teacher, 'POST', '/v1/attendance/qr', {'slotId': (periods.first as Map)['slotId']}) as Map;
    try {
      final r = await api.scanAttendance(code['code'] as String, location: const ScanLocation(lat: 13.0573, lng: 77.5016, accuracyM: 15));
      expect(['accepted', 'flagged'], contains(r.outcome));
    } on ApiException catch (e) {
      // After the period, or a code from another class's period: refused with a readable reason.
      expect([400, 403], contains(e.status));
      expect(e.message, isNotEmpty);
    }
  }, skip: _url == null ? 'LIVE_API_URL not set' : false);
}
