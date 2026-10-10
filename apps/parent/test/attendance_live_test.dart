import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_parent/core/attendance_live.dart';
import 'package:kinetix_parent/core/realtime.dart';

import 'fake_api.dart';
import 'helpers.dart';

void main() {
  testWidgets('attendance marked on the board reaches the app through the realtime feed', (tester) async {
    final server = FakeRealtimeServer();
    await pumpApp(tester, realtime: server);
    final before = AttendanceLive.tick.value;
    server.connections.first.send(const RealtimeAttendance(date: '2026-10-12', studentIds: ['c1']));
    await tester.pumpAndSettle();
    expect(AttendanceLive.tick.value, before + 1);
  });
}
