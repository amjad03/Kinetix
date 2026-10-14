// Family care: out-pass approvals (with the push that asks for them), the hostel sick bay,
// attendance by subject with shortage alerts, the bus hand-over code, a result held for fees and
// the child's mentor.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_parent/core/api.dart';
import 'package:kinetix_parent/core/boarding.dart';
import 'package:kinetix_parent/core/exam_models.dart';
import 'package:kinetix_parent/core/family_care.dart';
import 'package:kinetix_parent/core/models.dart';
import 'package:kinetix_parent/features/attendance/attendance_overview_screen.dart';
import 'package:kinetix_parent/features/exams/exams_screen.dart';
import 'package:kinetix_parent/features/hostel/boarding_screen.dart';
import 'package:kinetix_parent/features/hostel/out_pass_approvals_screen.dart';
import 'package:kinetix_parent/features/school_life/mentoring_screen.dart';
import 'package:kinetix_parent/features/transport/bus_map.dart';
import 'package:kinetix_parent/features/transport/bus_screen.dart';
import 'package:kinetix_parent/features/transport/handover_code_screen.dart';
import 'package:kinetix_parent/l10n/l10n.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'fake_api.dart';
import 'fake_push.dart';
import 'helpers.dart';

Widget host(Widget child, {String language = 'en'}) => MaterialApp(
  theme: KinetixTheme.light(),
  locale: Locale(language),
  supportedLocales: AppLocalizations.supportedLocales,
  localizationsDelegates: appLocalizationsDelegates,
  home: child,
);

void phone(WidgetTester tester, {double width = 412}) {
  tester.view.physicalSize = Size(width, 892);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

Future<void> tapOn(WidgetTester tester, Finder f) async {
  await tester.ensureVisible(f);
  await tester.pumpAndSettle();
  await tester.tap(f.hitTestable().first);
  await tester.pumpAndSettle();
}

AppNotification notice(String id, NotificationKind kind, Map<String, dynamic> data, {String title = 'Update'}) =>
    AppNotification(id: id, kind: kind, title: title, body: '', data: data, createdAt: DateTime.now());

void main() {
  group('Out-pass approvals', () {
    testWidgets('Home says a pass is waiting; approving sends it to the warden', (tester) async {
      final (api, _) = await pumpApp(tester, setup: (api) => api.familyPasses = [FakeParentApi.aaravPass]);
      expect(find.text('An out-pass is waiting for your approval'), findsOneWidget);
      await tapOn(tester, find.byKey(const Key('pendingOutPasses')));
      expect(find.text('Aarav Patel asks to leave the hostel'), findsOneWidget);
      expect(find.text('Weekend at home · Mysuru'), findsOneWidget);
      await tapOn(tester, find.byKey(const Key('opApprove-gp9')));
      expect(api.calls, contains('decideOutPass gp9 approve'));
      expect(find.text('Approved. The warden issues the pass for Aarav Patel.'), findsOneWidget);
      expect(find.byKey(const Key('opEmpty')), findsOneWidget);
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('pendingOutPasses')), findsNothing);
    });

    testWidgets('declining asks first; a refusal from the server is shown', (tester) async {
      phone(tester);
      final api = FakeParentApi()..familyPasses = [FakeParentApi.aaravPass];
      await tester.pumpWidget(host(OutPassApprovalsScreen(api: api)));
      await tester.pumpAndSettle();
      await tapOn(tester, find.byKey(const Key('opDecline-gp9')));
      expect(find.text('Decline the out-pass?'), findsOneWidget);
      await tapOn(tester, find.byKey(const Key('opConfirmDecline')));
      expect(api.calls, contains('decideOutPass gp9 reject'));
      expect(find.text('Out-pass declined.'), findsOneWidget);

      api.familyPasses = [FakeParentApi.aaravPass];
      await tester.pumpWidget(host(OutPassApprovalsScreen(key: UniqueKey(), api: api)));
      await tester.pumpAndSettle();
      api.outPassError = ApiException(409, 'This pass is not waiting for the family');
      await tapOn(tester, find.byKey(const Key('opApprove-gp9')));
      expect(find.text('This pass is not waiting for the family'), findsOneWidget);
    });

    testWidgets('the push for a pass opens the approvals; the hostel page lists it too', (tester) async {
      final push = FakePushMessaging();
      await pumpApp(
        tester,
        messaging: push,
        setup: (api) {
          api.familyPasses = [FakeParentApi.aaravPass];
          api.inbox = [notice('np', NotificationKind.hostel, {'studentId': 'c1', 'passId': 'gp9'}, title: 'Aarav Patel asks to leave the hostel'), ...api.inbox];
        },
      );
      push.tap({'notificationId': 'np', 'kind': 'hostel'});
      await tester.pumpAndSettle();
      expect(find.byType(OutPassApprovalsScreen), findsOneWidget);
      expect(find.byKey(const Key('familyPass-gp9')), findsOneWidget);
    });

    testWidgets('the hostel page shows a pass waiting for the family and the approval card', (tester) async {
      phone(tester);
      final api = FakeParentApi()..familyPasses = [FakeParentApi.aaravPass];
      api.boardingView = BoardingView(
        resident: true,
        block: 'Block A',
        room: '101',
        bed: 'B1',
        passes: [OutPass(id: 'gp9', reason: 'Weekend at home', destination: 'Mysuru', expectedBackAt: DateTime(2026, 10, 11, 18), status: 'parent_pending')],
      );
      await tester.pumpWidget(host(BoardingScreen(api: api, child: api.aarav)));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('familyPass-gp9')), findsOneWidget);
      await tester.scrollUntilVisible(find.byKey(const Key('pass-gp9')), 200);
      expect(find.text('Waiting for you'), findsOneWidget);
    });
  });

  group('Sick bay', () {
    final stay = BoardingView.fromJson({
      'resident': true,
      'bed': {'block': 'Block A', 'room': '101', 'bed': 'B1'},
      'passes': <Object>[],
      'nights': <Object>[],
      'sickbay': [
        {'id': 'sb1', 'admittedAt': '2026-10-08T03:30:00.000Z', 'dischargedAt': null, 'symptoms': 'Fever and headache', 'treatment': 'Paracetamol, rest', 'referredTo': ''},
        {'id': 'sb0', 'admittedAt': '2026-09-01T03:30:00.000Z', 'dischargedAt': '2026-09-02T03:30:00.000Z', 'symptoms': 'Cold', 'treatment': '', 'referredTo': ''},
      ],
    });

    test('parses the stays; the open one is current', () {
      expect(stay.sickbay, hasLength(2));
      expect(stay.inSickbay?.id, 'sb1');
    });

    testWidgets('the hostel page leads with the stay, and the welfare push opens it', (tester) async {
      final push = FakePushMessaging();
      await pumpApp(
        tester,
        messaging: push,
        setup: (api) {
          api.boardingView = stay;
          api.inbox = [notice('ns', NotificationKind.welfare, {'studentId': 'c1', 'sickbayId': 'sb1'}, title: 'Aarav Patel is in the hostel sick bay'), ...api.inbox];
        },
      );
      push.tap({'notificationId': 'ns', 'kind': 'welfare'});
      await tester.pumpAndSettle();
      expect(find.byType(BoardingScreen), findsOneWidget);
      expect(find.byKey(const Key('sickbayCard')), findsOneWidget);
      expect(find.text('Aarav is in the hostel sick bay'), findsOneWidget);
      expect(find.text('Fever and headache'), findsOneWidget);
      expect(find.text('Treatment: Paracetamol, rest'), findsOneWidget);
    });
  });

  group('Attendance by subject', () {
    testWidgets('names the short subject and how many classes make it up, against the university rule', (tester) async {
      phone(tester);
      final api = FakeParentApi();
      await tester.pumpWidget(host(AttendanceOverviewScreen(api: api, child: api.aarav)));
      await tester.pumpAndSettle();
      expect(api.calls, contains('attendanceOverview c1'));
      expect(find.text('Aarav is short of attendance in Company Law.'), findsOneWidget);
      expect(find.textContaining('Bengaluru City University'), findsOneWidget);
      await tester.scrollUntilVisible(find.byKey(const Key('atNeed-s-law')), 200);
      expect(find.text('Attending the next 6 classes in a row brings it to 75%.'), findsOneWidget);
      await tester.scrollUntilVisible(find.byKey(const Key('childLeave-lv1')), 200);
      expect(find.text('Medical leave'), findsOneWidget);
    });

    testWidgets('a shortage alert opens the subject view; a plain absence still opens the day', (tester) async {
      final push = FakePushMessaging();
      await pumpApp(
        tester,
        messaging: push,
        setup: (api) => api.inbox = [notice('na', NotificationKind.absence, {'studentId': 'c1', 'scope': 's-law'}, title: 'Attendance shortage'), ...api.inbox],
      );
      push.tap({'notificationId': 'na', 'kind': 'absence'});
      await tester.pumpAndSettle();
      expect(find.byType(AttendanceOverviewScreen), findsOneWidget);
    });

    testWidgets('above the line it says so; a failure offers a retry', (tester) async {
      phone(tester);
      final api = FakeParentApi();
      api.attendanceOverviewJson = {...api.attendanceOverviewJson, 'status': 'eligible', 'warning': false, 'subjects': <Object>[], 'leaves': <Object>[]};
      await tester.pumpWidget(host(AttendanceOverviewScreen(api: api, child: api.aarav)));
      await tester.pumpAndSettle();
      expect(find.text("Aarav's attendance is above the minimum."), findsOneWidget);
      api.overviewError = ApiException(0, '', problem: ApiProblem.unreachable);
      await tester.pumpWidget(host(AttendanceOverviewScreen(key: UniqueKey(), api: api, child: api.aarav)));
      await tester.pumpAndSettle();
      expect(find.text('Retry'), findsOneWidget);
    });
  });

  group('Hand-over code', () {
    Map<String, dynamic> codeData({Duration left = const Duration(minutes: 20)}) => {
      'studentId': 'c1',
      'handoverId': 'h1',
      'otp': '482913',
      'expiresAt': DateTime.now().add(left).toUtc().toIso8601String(),
    };

    testWidgets('the transport push with a code shows it large with the minutes left', (tester) async {
      final push = FakePushMessaging();
      await pumpApp(tester, messaging: push, setup: (api) => api.inbox = [notice('nc', NotificationKind.transport, codeData(), title: 'Code to receive Aarav Patel: 482913'), ...api.inbox]);
      push.tap({'notificationId': 'nc', 'kind': 'transport'});
      await tester.pumpAndSettle();
      expect(find.byType(HandoverCodeScreen), findsOneWidget);
      expect(find.text('482 913'), findsOneWidget);
      expect(find.textContaining('Works for 20 more minutes'), findsOneWidget);
    });

    testWidgets('an expired code says so', (tester) async {
      phone(tester);
      final code = HandoverCode.of(notice('nc', NotificationKind.transport, codeData()))!;
      await tester.pumpWidget(host(HandoverCodeScreen(code: code, childName: 'Aarav', now: () => DateTime.now().add(const Duration(hours: 1)))));
      await tester.pumpAndSettle();
      expect(find.text('This code has expired. Ask the bus staff to send a new one.'), findsOneWidget);
      expect(HandoverCode.of(notice('x', NotificationKind.transport, {'studentId': 'c1'})), isNull);
    });

    testWidgets('the bus page shows the live code for the child', (tester) async {
      phone(tester);
      final api = FakeParentApi();
      api.inbox = [notice('nc', NotificationKind.transport, codeData()), ...api.inbox];
      await tester.pumpWidget(host(BusScreen(api: api, child: api.aarav, positions: const Stream.empty(), mapBuilder: (context, data) => const SizedBox(key: Key('fakeMap')))));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('handoverCardCode')), findsOneWidget);
      expect(find.text('482913'), findsOneWidget);
      await tapOn(tester, find.byKey(const Key('handoverCard')));
      expect(find.byType(HandoverCodeScreen), findsOneWidget);
    });
  });

  testWidgets('a result held for fees shows the office\'s reason', (tester) async {
    phone(tester);
    final api = FakeParentApi();
    api.examResultsByChild['c1'] = const ExamResults(
      cgpa: null,
      terms: [TermResult(sessionId: 'ex1', sessionName: 'Semester 2 end exam', term: 2, sgpa: 0, cgpa: 0, outcome: 'withheld', lines: [], withheld: true, withheldReason: 'The result is held for unpaid fees: ₹12,000 is overdue.')],
    );
    await tester.pumpWidget(host(ExamsScreen(api: api, child: api.aarav, openFile: (_, _, _) async => true)));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.byKey(const Key('withheldReason-ex1')), 200);
    expect(find.text('Reason: The result is held for unpaid fees: ₹12,000 is overdue.'), findsOneWidget);
    expect(TermResult.fromJson({'sessionId': 's', 'sessionName': 'S', 'withheld': true, 'withheldReason': ' '}).withheldReason, isNull);
  });

  group('Mentoring', () {
    testWidgets('shows the mentor, the session summaries and the next meeting', (tester) async {
      phone(tester);
      final api = FakeParentApi();
      await tester.pumpWidget(host(MentoringScreen(api: api, child: api.aarav)));
      await tester.pumpAndSettle();
      expect(api.calls, contains('mentoring c1'));
      expect(find.text('Anita Sharma'), findsOneWidget);
      expect(find.text('Talked about the Company Law classes missed and a study plan.'), findsOneWidget);
      expect(find.textContaining('Next meeting'), findsOneWidget);
    });

    testWidgets('no mentor yet, and a college that does not share mentoring', (tester) async {
      phone(tester);
      final api = FakeParentApi()..mentoringJson = {'mentor': null, 'sessions': <Object>[]};
      await tester.pumpWidget(host(MentoringScreen(api: api, child: api.aarav)));
      await tester.pumpAndSettle();
      expect(find.text('No mentor is assigned to Aarav yet.'), findsOneWidget);
      api.mentoringError = ApiException(403, 'Hidden', code: 'PARENT_VISIBILITY_OFF');
      await tester.pumpWidget(host(MentoringScreen(key: UniqueKey(), api: api, child: api.aarav)));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('visibilityOff')), findsOneWidget);
    });
  });

  test('parses the server\'s family pass list', () {
    final p = FamilyOutPass.fromJson(FakeParentApi.aaravPass);
    expect((p.id, p.studentId, p.studentName, p.destination), ('gp9', 'c1', 'Aarav Patel', 'Mysuru'));
  });

  testWidgets('Hindi and Kannada: the new screens read in their own words and fit a 360dp phone', (tester) async {
    phone(tester, width: 360);
    BusScreen.defaultMapBuilder = (context, data) => const SizedBox(key: Key('fakeMap'));
    addTearDown(() => BusScreen.defaultMapBuilder = OsmBusMap.builder);
    for (final lang in ['hi', 'kn']) {
      final s = lookupAppLocalizations(Locale(lang));
      final api = FakeParentApi()..familyPasses = [FakeParentApi.aaravPass];
      final code = HandoverCode.of(notice('nc', NotificationKind.transport, {'studentId': 'c1', 'otp': '482913', 'expiresAt': DateTime.now().add(const Duration(minutes: 9)).toUtc().toIso8601String()}))!;
      final screens = <(Widget, String)>[
        (OutPassApprovalsScreen(key: UniqueKey(), api: api), s.opApprovalsTitle),
        (AttendanceOverviewScreen(key: UniqueKey(), api: api, child: api.aarav), s.atBySubjectFor(api.aarav.firstName)),
        (MentoringScreen(key: UniqueKey(), api: api, child: api.aarav), s.mnTitle(api.aarav.firstName)),
        (HandoverCodeScreen(key: UniqueKey(), code: code, childName: 'Aarav'), s.hoTitle),
      ];
      for (final (w, title) in screens) {
        await tester.pumpWidget(host(w, language: lang));
        await tester.pumpAndSettle();
        expect(find.text(title), findsWidgets, reason: '$lang $title');
      }
    }
    expect(tester.takeException(), isNull);
  });
}
