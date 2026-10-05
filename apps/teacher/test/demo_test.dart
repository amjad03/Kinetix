import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_teacher/core/models.dart';
import 'package:kinetix_teacher/demo/demo.dart';
import 'package:kinetix_teacher/demo/demo_api.dart';

import 'helpers.dart';

/// The demo build (--dart-define=KINETIX_DEMO=true): sample data, no server.
void main() {
  setUp(() => Demo.enabled = true);
  tearDown(() => Demo.enabled = false);

  testWidgets('signs in as Anita in one tap and opens every tab with sample data', (tester) async {
    phone(tester);
    final api = DemoTeacherApi(clock: () => DateTime(2026, 10, 5, 10, 15));
    final state = await pumpApp(tester, api, prefs: {}, realtime: DemoRealtime(api));
    expect(find.byKey(const Key('demoBanner')), findsOneWidget);
    expect(find.byKey(const Key('demoChip')), findsOneWidget);

    await tapAndSettle(tester, find.byKey(const Key('demoSignIn0')));
    expect(state.me!.fullName, 'Anita Sharma');
    expect(find.byKey(const Key('demoChip')), findsOneWidget);
    expect(find.text('Corporate Accounting'), findsWidgets);

    await tapAndSettle(tester, find.byKey(const Key('navHomework')));
    expect(find.text('Exercise 4.2: Issue of shares'), findsOneWidget);
    await tapAndSettle(tester, find.byKey(const Key('navMarks')));
    expect(find.text('Unit test 1: Underwriting of shares'), findsOneWidget);
    await tapAndSettle(tester, find.byKey(const Key('navMessages')));
    expect(find.text('Rajesh Patel'), findsWidgets);
    await tapAndSettle(tester, find.byKey(const Key('navRecordings')));
    expect(find.text('Forfeiture of shares'), findsOneWidget);

    // A family reply arrives a few seconds after sign-in.
    await tester.pump(const Duration(seconds: 9));
    await tester.pumpAndSettle();
    expect(api.chat['c1']!.last.body, contains('Exercise 4.2'));
  });

  testWidgets('changes stay in memory for the session', (tester) async {
    final api = DemoTeacherApi(clock: () => DateTime(2026, 10, 5, 10, 15));
    await api.createHomework(sectionId: 'sec1', subjectId: 'sub1', title: 'Re-issue of shares', instructions: '', dueOn: '2026-10-08');
    expect((await api.myHomework()).first.title, 'Re-issue of shares');

    final day = await api.timetable(date: '2026-10-05');
    final p = day.periods.first;
    await api.submitAttendance(slotId: p.slotId, date: '2026-10-05', marks: {'s1': AttendanceStatus.absent});
    expect((await api.attendance(slotId: p.slotId, date: '2026-10-05')).taken, isTrue);

    await api.markTopic(sectionId: 'sec1', subjectId: 'sub1', topicId: 't5');
    expect((await api.coverage(sectionId: 'sec1', subjectId: 'sub1')).topics, contains('t5'));

    final hw = await api.submissions('h3');
    expect(hw.students.where((s) => s.status == SubmissionStatus.checked), isNotEmpty);

    // Dasara: no classes.
    expect((await api.timetable(date: '2026-10-20')).holiday, 'Dasara holidays');
  });

  testWidgets('phone sign-in accepts the demo code 123456', (tester) async {
    phone(tester);
    final state = await pumpApp(tester, DemoTeacherApi(), prefs: {});
    await tapAndSettle(tester, find.byKey(const Key('signInWithPhone')));
    expect(find.byKey(const Key('demoOtpHint')), findsOneWidget);
    await tester.enterText(find.byKey(const Key('tenant')), 'demo-college');
    await tester.enterText(find.byKey(const Key('phone')), '9800000011');
    await tapAndSettle(tester, find.byKey(const Key('sendCode')));
    await tester.enterText(find.byKey(const Key('otpCode')), '123456');
    await tester.pumpAndSettle();
    expect(state.me?.fullName, 'Anita Sharma');
    // Nothing waits on a timer: no realtime here.
    await tester.pump(const Duration(minutes: 1));
  });
}
