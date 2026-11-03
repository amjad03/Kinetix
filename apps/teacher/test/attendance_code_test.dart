// Self-mark code and the classroom reader: the teacher shows the rotating code, accepts or rejects scans the
// anti-proxy checks held, and applies the face terminal's taps before saving.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zynetix_teacher/core/models.dart';
import 'package:zynetix_teacher/features/attendance/attendance_code_screen.dart';
import 'package:zynetix_teacher/features/attendance/attendance_screen.dart';

import 'fake_api.dart';
import 'helpers.dart';

void main() {
  late FakeTeacherApi api;
  final at = DateTime.utc(2026, 10, 3, 4, 33);
  setUp(() => api = FakeTeacherApi());

  testWidgets('shows the code in two groups and lists held scans with their reasons', (tester) async {
    api.hints = [AttendanceHint(studentId: 's2', source: 'qr', at: at, scanId: 'scan-2', reasons: const ['outside_campus'])];
    await tester.pumpWidget(localizedApp(home: AttendanceCodeScreen(api: api, period: api.period(), date: '2026-10-03', students: api.students, tick: const Duration(hours: 1))));
    await tester.pumpAndSettle();
    expect(find.text('4051 7284'), findsOneWidget);
    expect(api.calls, contains(startsWith('code ')));
    expect(find.text('Held for you to check (1)'), findsOneWidget);
    expect(find.text('Ananya Gowda'), findsOneWidget);
    expect(find.text('U03BC002 · outside the campus'), findsOneWidget);

    await tester.tap(find.byKey(const Key('accept-s2')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('qr accept scan-2'));
    expect(api.existingMarks['s2'], AttendanceStatus.present);
    expect(find.text('No scans are waiting.'), findsOneWidget);
    expect(find.text('Marked present'), findsOneWidget);
  });

  testWidgets('rejecting leaves the mark alone (Hindi)', (tester) async {
    api.hints = [AttendanceHint(studentId: 's3', source: 'qr', at: at, scanId: 'scan-3', reasons: const ['new_device', 'late_scan'])];
    await tester.pumpWidget(localizedApp(language: 'hi', home: AttendanceCodeScreen(api: api, period: api.period(), date: '2026-10-03', students: api.students, tick: const Duration(hours: 1))));
    await tester.pumpAndSettle();
    expect(find.text('U03BC003 · दूसरा फ़ोन · देर से स्कैन'), findsOneWidget);
    await tester.tap(find.byKey(const Key('reject-s3')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('qr reject scan-3'));
    expect(api.existingMarks.containsKey('s3'), isFalse);
  });

  testWidgets('the reader taps become the marks: tapped present, the rest absent', (tester) async {
    api.hints = [
      AttendanceHint(studentId: 's1', source: 'reader', at: at, verify: 'face'),
      AttendanceHint(studentId: 's3', source: 'reader', at: at, verify: 'card'),
    ];
    await tester.pumpWidget(localizedApp(home: AttendanceScreen(api: api, period: api.period(), date: '2026-10-03')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('showCode')), findsOneWidget);
    await tester.tap(find.byKey(const Key('useReaderTaps')));
    await tester.pump();
    expect(tester.widget<Text>(find.byKey(const Key('attendanceSummary'))).data, '2 present · 1 absent');
  });
}
