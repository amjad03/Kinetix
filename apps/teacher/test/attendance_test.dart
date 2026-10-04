import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_teacher/core/models.dart';
import 'package:kinetix_teacher/features/attendance/attendance_screen.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'fake_api.dart';

void main() {
  late FakeTeacherApi api;

  Future<void> pumpSheet(WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: KinetixTheme.light(),
        home: AttendanceScreen(api: api, period: api.period(), date: '2026-10-03'),
      ),
    );
    await tester.pumpAndSettle();
  }

  String summary(WidgetTester tester) => tester.widget<Text>(find.byKey(const Key('attendanceSummary'))).data!;

  setUp(() => api = FakeTeacherApi());

  testWidgets('everyone starts present; tap toggles absent, long-press picks late', (tester) async {
    await pumpSheet(tester);
    expect(find.text('Aarav Patel'), findsOneWidget);
    expect(summary(tester), '3 present · 0 absent');
    expect(find.text('Submit'), findsOneWidget);

    await tester.tap(find.text('Ananya Gowda'));
    await tester.pump();
    expect(summary(tester), '2 present · 1 absent');

    // Tapping again brings them back.
    await tester.tap(find.text('Ananya Gowda'));
    await tester.pump();
    expect(summary(tester), '3 present · 0 absent');

    await tester.tap(find.text('Ananya Gowda'));
    await tester.longPress(find.text('Bhavya Reddy'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ListTile, 'Late'));
    await tester.pumpAndSettle();
    expect(summary(tester), '1 present · 1 absent · 1 late');

    await tester.tap(find.byKey(const Key('markAllPresent')));
    await tester.pump();
    expect(summary(tester), '3 present · 0 absent');
  });

  testWidgets('submits every mark', (tester) async {
    await pumpSheet(tester);
    await tester.tap(find.text('Aarav Patel'));
    await tester.pump();
    await tester.tap(find.byKey(const Key('submitAttendance')));
    await tester.pumpAndSettle();
    expect(api.submitted, {'s1': AttendanceStatus.absent, 's2': AttendanceStatus.present, 's3': AttendanceStatus.present});
  });

  testWidgets('reloads marks that were already taken', (tester) async {
    api.existingMarks = {'s1': AttendanceStatus.present, 's2': AttendanceStatus.absent, 's3': AttendanceStatus.late};
    await pumpSheet(tester);
    expect(summary(tester), '1 present · 1 absent · 1 late');
    expect(find.text('Update'), findsOneWidget);
    expect(find.textContaining('Already taken'), findsOneWidget);
  });
}
