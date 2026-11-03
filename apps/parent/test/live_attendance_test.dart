// Contract check against a running API with the Soundarya demo seed (skipped unless LIVE_API_URL is set):
//   LIVE_API_URL=http://localhost:4320 flutter test test/live_attendance_test.dart
// The Parent App's HTTP client lists the children and reads one child's attendance by subject and day by day.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:zynetix_parent/core/api.dart';

final _url = Platform.environment['LIVE_API_URL'];

void main() {
  setUpAll(() => HttpOverrides.global = null);

  test("a guardian reads their child's attendance from the real API", () async {
    final api = HttpParentApi(baseUrl: _url!);
    await api.login(tenant: 'soundarya', login: 'parent.bcom@soundarya.demo.zynetix.in', password: 'zynetix123');
    final kids = await api.children();
    expect(kids.map((c) => c.fullName), contains('Sahana Gowda'));
    final o = await api.attendanceOverview(kids.first.id);
    expect(o.overall.held, greaterThan(0));
    expect(o.subjects, isNotEmpty);
    final marks = await api.attendance(kids.first.id);
    expect(marks, isNotEmpty);
  }, skip: _url == null ? 'LIVE_API_URL not set' : false);
}
