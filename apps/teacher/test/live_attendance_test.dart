// Contract check against a running API with the Soundarya demo seed (skipped unless LIVE_API_URL is set):
//   LIVE_API_URL=http://localhost:4320 flutter test test/live_attendance_test.dart
// The Teacher App's own HTTP client reads today's timetable, a period's sheet (marks and the classroom reader
// taps or held QR scans), and the rotating self-mark code.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:zynetix_teacher/core/api.dart';

final _url = Platform.environment['LIVE_API_URL'];

void main() {
  setUpAll(() => HttpOverrides.global = null);

  test('timetable, sheet with hints and the self-mark code parse from the real API', () async {
    final api = HttpTeacherApi(baseUrl: _url!);
    await api.login(tenant: 'soundarya', login: 'anand.bangera@soundarya.demo.zynetix.in', password: 'zynetix123');
    final day = await api.timetable();
    expect(day.periods, isNotEmpty);
    final p = day.periods.first;
    final sheet = await api.attendance(slotId: p.slotId, date: day.date);
    expect(sheet.records, isA<Map<String, dynamic>>());
    for (final h in sheet.hints) {
      expect(['reader', 'qr'], contains(h.source));
    }
    final code = await api.attendanceCode(slotId: p.slotId, date: day.date);
    expect(code.code, matches(RegExp(r'^\d{8}$')));
    expect(code.expiresAt.isAfter(DateTime.now().subtract(const Duration(seconds: 1))), isTrue);
  }, skip: _url == null ? 'LIVE_API_URL not set' : false);
}
