import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_teacher/core/hr_models.dart';
import 'package:kinetix_teacher/core/models.dart';

import 'fake_api.dart';
import 'helpers.dart';

LeaveRequestInfo leave(String id, {String who = 'Ravi Kumar'}) => LeaveRequestInfo(
  id: id,
  userId: 'u-$who',
  userName: who,
  type: const LeaveTypeInfo(id: 'lt-cl', code: 'CL', name: 'Casual leave', paid: true),
  fromDate: DateTime.utc(2026, 10, 12),
  toDate: DateTime.utc(2026, 10, 13),
  halfDay: false,
  days: 2,
  reason: 'Family',
  status: LeaveStatus.pending,
);

void main() {
  late FakeTeacherApi api;
  setUp(() {
    api = FakeTeacherApi();
    seed(api);
    api.pendingLeaves = [leave('p1'), leave('p2', who: 'Meena Rao')];
  });

  Future<void> start(WidgetTester tester) async {
    phone(tester);
    await pumpApp(tester, api, prefs: {'token': 'tok'}, tab: null);
  }

  testWidgets('Home greets, lists today with Start class, the quick actions and pending leave', (tester) async {
    await start(tester);
    expect(find.byKey(const Key('greeting')), findsOneWidget);
    expect(find.text("Today's classes"), findsOneWidget);
    expect(find.text('Corporate Accounting'), findsNWidgets(2));
    expect(find.text('Start class'), findsNWidgets(2));
    for (final k in ['qaAttendance', 'qaAssignment', 'qaQuiz', 'qaSmartboard', 'qaStudyMaterial', 'qaAi']) {
      expect(find.byKey(Key(k)), findsOneWidget, reason: k);
    }
    expect(find.text('Pending approvals'), findsOneWidget);
    expect(find.text('Ravi Kumar'), findsOneWidget);
    // Bottom navigation: Home, Classes, Students, More.
    expect(find.descendant(of: find.byType(NavigationBar), matching: find.text('Home')), findsOneWidget);
    expect(find.descendant(of: find.byType(NavigationBar), matching: find.text('Students')), findsOneWidget);
  });

  testWidgets('a leave request is approved or rejected in one tap from Home', (tester) async {
    await start(tester);
    await tester.ensureVisible(find.byKey(const Key('homeApprove-p1')));
    await tester.pumpAndSettle();
    await tapAndSettle(tester, find.byKey(const Key('homeApprove-p1')));
    expect(api.calls, contains('decideLeave p1 approve -'));
    expect(find.text('Ravi Kumar'), findsNothing);
    await clearSnackBars(tester);
    await tester.ensureVisible(find.byKey(const Key('homeReject-p2')));
    await tester.pumpAndSettle();
    await tapAndSettle(tester, find.byKey(const Key('homeReject-p2')));
    expect(api.calls, contains('decideLeave p2 reject -'));
    expect(find.text('Nothing waiting for you.'), findsOneWidget);
  });

  testWidgets('Quick actions: Attendance opens the sheet of the period running now; Assignment opens the form', (tester) async {
    await start(tester);
    await tapAndSettle(tester, find.byKey(const Key('qaAttendance')));
    expect(find.byKey(const Key('markAllPresent')), findsOneWidget);
    await pop(tester);
    await tapAndSettle(tester, find.byKey(const Key('qaAssignment')));
    expect(find.byKey(const Key('assignHomework')), findsOneWidget);
  });

  testWidgets('a teacher who cannot decide leave has no approvals section', (tester) async {
    api.profile = Me(id: api.profile.id, fullName: api.profile.fullName, roles: const ['teacher'], preferredLanguage: 'en', institution: api.profile.institution, email: api.profile.email);
    await start(tester);
    expect(find.text('Pending approvals'), findsNothing);
  });

  // Screenshots for docs/design/mobile: KINETIX_SCREENSHOTS=1 flutter test --update-goldens test/home_test.dart
  final shots = Platform.environment.containsKey('KINETIX_SCREENSHOTS');
  for (final dark in [false, true]) {
    testWidgets('screenshot: Home ${dark ? 'dark' : 'light'}', (tester) async {
      await loadAppFonts();
      phone(tester);
      tester.view.physicalSize = const Size(780, 1900);
      tester.view.devicePixelRatio = 2;
      tester.platformDispatcher.platformBrightnessTestValue = dark ? Brightness.dark : Brightness.light;
      addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
      await pumpApp(tester, api, prefs: {'token': 'tok'}, tab: null);
      await expectLater(find.byType(MaterialApp), matchesGoldenFile('../../../docs/design/mobile/teacher-home-${dark ? 'dark' : 'light'}.png'));
    }, skip: !shots);
  }
}
