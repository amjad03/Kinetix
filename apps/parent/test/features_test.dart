import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kinetix_parent/core/api.dart';
import 'package:kinetix_parent/core/attachments.dart';
import 'package:kinetix_parent/core/models.dart';
import 'package:kinetix_parent/core/realtime.dart';
import 'package:kinetix_parent/features/calendar/calendar_screen.dart';
import 'package:kinetix_parent/features/home/home_tab.dart' show HomeTab;
import 'package:kinetix_parent/features/privacy/privacy.dart';
import 'package:kinetix_parent/features/profile/profile_tab.dart';
import 'package:kinetix_parent/features/syllabus/syllabus_screen.dart';
import 'package:kinetix_parent/l10n/l10n.dart';

import 'fake_api.dart';
import 'helpers.dart';

void main() {
  Finder home() => find.descendant(of: find.byType(HomeTab), matching: find.byType(Scrollable)).first;
  Finder profileList() => find.descendant(of: find.byType(ProfileTab), matching: find.byType(Scrollable)).first;
  Finder consentList() => find.descendant(of: find.byKey(const Key('consentList')), matching: find.byType(Scrollable)).first;
  final hi = lookupAppLocalizations(const Locale('hi'));

  Future<void> scrollTo(WidgetTester tester, Finder f, Finder scrollable) async {
    await tester.scrollUntilVisible(f, 200, scrollable: scrollable);
    await Scrollable.ensureVisible(tester.element(f), alignment: 0.5);
    await tester.pumpAndSettle();
  }

  /// Taps a bottom-bar destination by its label; Profile is More now, and Messages open from More.
  Future<void> openTab(WidgetTester tester, String label) async {
    final bar = find.byType(NavigationBar);
    for (var i = 0; i < 4 && bar.hitTestable().evaluate().isEmpty; i++) {
      tester.state<NavigatorState>(find.byType(Navigator).first).pop();
      await tester.pumpAndSettle();
    }
    final name = const {'Profile': 'More', 'Messages': 'More'}[label] ?? label;
    await tester.tap(find.descendant(of: bar, matching: find.text(name)));
    await tester.pumpAndSettle();
    if (label == 'Messages') {
      await tester.scrollUntilVisible(find.byKey(const Key('openMessages')), 200, scrollable: find.byType(Scrollable).first);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('openMessages')));
      await tester.pumpAndSettle();
    }
  }

  late FakeAttachmentPicker picker;
  setUp(() {
    picker = FakeAttachmentPicker();
    AttachmentPicker.instance = picker;
  });
  tearDown(() => AttachmentPicker.instance = const DeviceAttachmentPicker());

  group('calendar', () {
    testWidgets('Home shows what is coming up for the selected child\'s program', (tester) async {
      await pumpApp(tester, section: 'attendance');
      final card = find.byKey(const Key('calendarCard'));
      await scrollTo(tester, card, home());
      expect(find.descendant(of: card, matching: find.text('Mid-semester exams')), findsOneWidget);
      expect(find.text('BCA practicals'), findsNothing);

      await tester.drag(home(), const Offset(0, 5000));
      await tester.pumpAndSettle();
      await pickChild(tester, 'c2');
      await scrollTo(tester, card, home());
      expect(find.descendant(of: card, matching: find.text('Mid-semester exams')), findsNothing);
      expect(find.descendant(of: card, matching: find.text('College day')), findsOneWidget);

      await tester.tap(find.descendant(of: card, matching: find.byType(InkWell)).last);
      await tester.pumpAndSettle();
      expect(find.byType(CalendarScreen), findsOneWidget);
      expect(find.text('October 2026'), findsOneWidget);
      await tester.scrollUntilVisible(find.text('BCA practicals'), 200, scrollable: find.byType(Scrollable).first);
      expect(find.text('For BCA'), findsOneWidget);
    });

    testWidgets('a holiday tomorrow shows a banner on Home', (tester) async {
      await pumpApp(tester, setup: (api) => api.calendarEvents.insert(0, FakeParentApi.eventJson('e0', 'holiday', 'Gandhi Jayanti (observed)', '2026-10-05')));
      expect(find.text('Holiday tomorrow: Gandhi Jayanti (observed)'), findsOneWidget);
      await tester.tap(find.byKey(const Key('holidayBanner')));
      await tester.pumpAndSettle();
      expect(find.byType(CalendarScreen), findsOneWidget);
    });

    testWidgets('a calendar update opens the calendar', (tester) async {
      await pumpApp(
        tester,
        setup: (api) => api.inbox.insert(
          0,
          AppNotification(id: 'n9', kind: NotificationKind.calendar, title: 'Holiday: Dussehra', body: '', data: {'calendarEventId': 'e3'}, createdAt: DateTime.now()),
        ),
      );
      await openTab(tester, 'Updates');
      await tester.tap(find.text('Holiday: Dussehra'));
      await tester.pumpAndSettle();
      expect(find.byType(CalendarScreen), findsOneWidget);
      expect(tester.widget<Card>(find.byKey(const Key('calendar-e3'))).shape, isA<RoundedRectangleBorder>());
    });
  });

  group('homework hand-in', () {
    Future<void> openHomework(WidgetTester tester) async {
      final row = find.text('Exercise 4.2: Issue of shares');
      await scrollTo(tester, row, home());
      await tester.tap(row);
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(find.byKey(const Key('submissionPanel')), 200, scrollable: find.byType(Scrollable).first);
      await tester.pumpAndSettle();
    }

    testWidgets('a parent hands in for a child: text and a photo, with progress', (tester) async {
      final (api, _) = await pumpApp(tester, section: 'academics');
      api.submitGate = Completer<void>();
      await openHomework(tester);
      expect(find.text("Aarav's work"), findsOneWidget);
      expect(find.text('Not handed in yet'), findsOneWidget);
      await tester.ensureVisible(find.byKey(const Key('handIn')));
      await tester.tap(find.byKey(const Key('handIn')));
      await tester.pumpAndSettle();
      expect(find.text('Hand in for Aarav'), findsOneWidget);
      await tester.enterText(find.byKey(const Key('handInText')), 'Aarav did this on paper.');
      await tester.ensureVisible(find.byKey(const Key('addCamera')));
      await tester.tap(find.byKey(const Key('addCamera')));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const Key('sendHandIn')));
      await tester.tap(find.byKey(const Key('sendHandIn')));
      await tester.pump();
      expect(find.byKey(const Key('uploadProgress')), findsOneWidget);
      api.submitGate!.complete();
      await tester.pumpAndSettle();
      final r = api.submitRequests.single;
      expect((r.homeworkId, r.studentId, r.text), ('h1', 'c1', 'Aarav did this on paper.'));
      expect(r.files.single.name, 'page1.jpg');
      expect(find.text('Handed in'), findsOneWidget);
    });

    testWidgets('when the server refuses (the child hands in for themselves), its error is shown', (tester) async {
      final (api, _) = await pumpApp(tester, section: 'academics');
      api.submitError = ApiException(403, 'Forbidden', code: 'FORBIDDEN');
      await openHomework(tester);
      await tester.ensureVisible(find.byKey(const Key('handIn')));
      await tester.tap(find.byKey(const Key('handIn')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('handInText')), 'Answer');
      await tester.ensureVisible(find.byKey(const Key('sendHandIn')));
      await tester.tap(find.byKey(const Key('sendHandIn')));
      await tester.pumpAndSettle();
      expect(find.text(en.errForbidden), findsOneWidget);
    });

    testWidgets('a "returned to redo" update for a child opens that homework with the remark', (tester) async {
      await pumpApp(
        tester,
        setup: (api) {
          api.submissions['h1/c1'] = {
            'status': 'returned',
            'text': '',
            'files': [],
            'submittedAt': '2026-10-04T05:00:00Z',
            'late': false,
            'remark': 'Show the working for question 3.',
            'checkedBy': 'Anita Sharma',
            'checkedAt': '2026-10-05T05:00:00Z',
          };
          api.inbox.insert(
            0,
            AppNotification(
              id: 'n9',
              kind: NotificationKind.homework,
              title: 'To redo: Exercise 4.2',
              body: 'Show the working for question 3.',
              data: {'homeworkId': 'h1', 'studentId': 'c1'},
              createdAt: DateTime.now(),
            ),
          );
        },
      );
      await openTab(tester, 'Updates');
      await tester.tap(find.text('To redo: Exercise 4.2'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(find.byKey(const Key('submissionRemark')), 200, scrollable: find.byType(Scrollable).first);
      expect(find.text('Returned to redo'), findsOneWidget);
      expect(find.text('Show the working for question 3.'), findsOneWidget);
      expect(find.text('Hand in again'), findsOneWidget);
    });

    test('the upload is multipart: text and files, with the token, and reports progress', () async {
      late http.BaseRequest seen;
      late String body;
      final client = MockClient.streaming((request, stream) async {
        seen = request;
        body = latin1.decode(await stream.toBytes());
        return http.StreamedResponse(Stream.value(utf8.encode(jsonEncode({'status': 'submitted', 'files': []}))), 200);
      });
      final api = HttpParentApi(baseUrl: 'http://api.test', client: client)..token = 'tok';
      final progress = <int>[];
      await api.submitHomework(
        'h1',
        'c1',
        text: 'Done on paper',
        files: [UploadFile(name: 'page1.jpg', mime: 'image/jpeg', bytes: Uint8List.fromList([1, 2, 3]))],
        onProgress: (sent, _) => progress.add(sent),
      );
      expect(seen.url.toString(), 'http://api.test/v1/homework/h1/submissions/c1');
      expect(seen.headers['authorization'], 'Bearer tok');
      expect(seen.headers['content-type'], startsWith('multipart/form-data; boundary='));
      expect(body, contains('content-disposition: form-data; name="text"\r\n\r\nDone on paper\r\n'));
      expect(body, contains('content-disposition: form-data; name="files"; filename="page1.jpg"'));
      expect(body, contains('content-type: image/jpeg'));
      expect(progress.last, seen.contentLength);
    });
  });

  group('syllabus progress', () {
    testWidgets('Profile → a child\'s subjects with progress, and the taught topics ticked', (tester) async {
      final (api, _) = await pumpApp(tester);
      await openTab(tester, 'Profile');
      await scrollTo(tester, find.byKey(const Key('profile-syllabus-c1')), profileList());
      await tester.tap(find.byKey(const Key('profile-syllabus-c1')));
      await tester.pumpAndSettle();
      expect(api.calls, containsAll(['subjects c1', 'coverage sec1 sub1', 'coverage sec1 sub2']));
      expect(api.calls.where((c) => c.startsWith('homework ')), isEmpty);
      expect(find.descendant(of: find.byKey(const Key('subjectProgress-sub1')), matching: find.byType(CoverageBar)), findsOneWidget);
      // Sorted by name; a subject with no syllabus topics shows its code.
      expect(tester.getTopLeft(find.byKey(const Key('subjectProgress-sub1'))).dy, lessThan(tester.getTopLeft(find.byKey(const Key('subjectProgress-sub2'))).dy));
      expect(find.descendant(of: find.byKey(const Key('subjectProgress-sub2')), matching: find.text('BCOM-3.3')), findsOneWidget);
      await tester.tap(find.byKey(const Key('subjectProgress-sub1')));
      await tester.pumpAndSettle();
      expect(find.text('1 of 2 topics taught'), findsOneWidget);
      expect(find.byKey(const Key('taught-t1')), findsOneWidget);
      expect(find.byKey(const Key('taught-t2')), findsNothing);
      expect(find.text('Taught on Thu 1 Oct'), findsOneWidget);
    });

    Future<void> openProgress(WidgetTester tester) async {
      await openTab(tester, 'Profile');
      await scrollTo(tester, find.byKey(const Key('profile-syllabus-c1')), profileList());
      await tester.tap(find.byKey(const Key('profile-syllabus-c1')));
      await tester.pumpAndSettle();
    }

    testWidgets("the plan's status per subject, and this week's and next week's topics", (tester) async {
      final (api, _) = await pumpApp(tester);
      await openProgress(tester);
      expect(api.calls, containsAll(['year-plan sec1 sub1', 'year-plan sec1 sub2']));
      expect(find.descendant(of: find.byKey(const Key('subjectProgress-sub1')), matching: find.text('Class is on schedule')), findsOneWidget);
      // No plan for Cost Accounting: no status, just its code.
      expect(find.descendant(of: find.byKey(const Key('subjectProgress-sub2')), matching: find.byKey(const Key('planStatus'))), findsNothing);
      await tester.tap(find.byKey(const Key('subjectProgress-sub1')));
      await tester.pumpAndSettle();
      final week = find.byKey(const Key('weekPlan'));
      expect(find.descendant(of: week, matching: find.text('This week in class')), findsOneWidget);
      expect(find.descendant(of: week, matching: find.text('Class is on schedule')), findsOneWidget);
      expect(find.descendant(of: find.byKey(const Key('planned-t1')), matching: find.byIcon(Icons.check_circle)), findsOneWidget);
      expect(find.descendant(of: week, matching: find.text('Next week')), findsOneWidget);
      expect(find.descendant(of: find.byKey(const Key('planned-t2')), matching: find.text('Methods of valuing goodwill')), findsOneWidget);
    });

    testWidgets('behind the plan is said plainly; ahead too', (tester) async {
      final (api, _) = await pumpApp(
        tester,
        setup: (api) => api.yearPlanJson['sec1|sub1'] = FakeParentApi.planJson(
          status: 'behind',
          behindBy: 1,
          items: [FakeParentApi.planItemJson('t2', 'Methods of valuing goodwill', 'Valuation of Goodwill', '2026-09-21', late: true)],
        ),
      );
      await openProgress(tester);
      expect(find.text('Class is 1 topic behind the plan'), findsOneWidget);
      await tester.tap(find.byKey(const Key('subjectProgress-sub1')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('nothingThisWeek')), findsOneWidget);
      await tester.pageBack();
      await tester.pumpAndSettle();
      api.yearPlanJson['sec1|sub1'] = FakeParentApi.planJson(
        status: 'ahead',
        items: [FakeParentApi.planItemJson('t2', 'Methods of valuing goodwill', 'Valuation of Goodwill', '2026-10-12', coveredOn: '2026-10-01')],
      );
      await tester.fling(find.byType(Scrollable).first, const Offset(0, 400), 1000);
      await tester.pumpAndSettle();
      expect(find.text('Class is ahead of the plan'), findsOneWidget);
    });

    testWidgets('no plan: no status and no week', (tester) async {
      await pumpApp(tester, setup: (api) => api.yearPlanJson.clear());
      await openProgress(tester);
      expect(find.byKey(const Key('planStatus')), findsNothing);
      await tester.tap(find.byKey(const Key('subjectProgress-sub1')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('weekPlan')), findsNothing);
      expect(find.byKey(const Key('taught-t1')), findsOneWidget);
    });

    testWidgets('a child whose class has no subjects yet sees an empty state', (tester) async {
      await pumpApp(tester);
      await openTab(tester, 'Profile');
      await scrollTo(tester, find.byKey(const Key('profile-syllabus-c2')), profileList());
      await tester.tap(find.byKey(const Key('profile-syllabus-c2')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('noSubjects')), findsOneWidget);
    });
  });

  group('privacy and consent', () {
    Map<String, dynamic> undecided(String childId, {bool canDecide = true}) => {
      ...FakeParentApi.allDecided(childId, canDecide: canDecide),
      'purposes': {'data_processing': null, 'ai_features': null, 'class_recordings': null, 'photos': null},
    };

    testWidgets('asked per child after sign-in; only for children the parent decides for', (tester) async {
      final (api, _) = await pumpApp(
        tester,
        setup: (api) {
          api.consentJson['c1'] = undecided('c1');
          api.consentJson['c2'] = undecided('c2', canDecide: false);
        },
      );
      expect(find.text('Privacy choices for Aarav'), findsOneWidget);
      expect(tester.widget<SwitchListTile>(find.byKey(const Key('consent-ai_features'))).value, isFalse);
      await tester.tap(find.byKey(const Key('consent-data_processing')));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(find.byKey(const Key('consentSave')), 200, scrollable: consentList());
      await tester.tap(find.byKey(const Key('consentSave')));
      await tester.pumpAndSettle();
      expect(api.consentRequests, ['c1 data_processing true', 'c1 ai_features false', 'c1 class_recordings false', 'c1 photos false']);
      // Diya decides for herself (a college student with her own login).
      expect(find.byType(ConsentScreen), findsNothing);
      expect(find.byType(HomeTab), findsOneWidget);
    });

    testWidgets('two children: one screen after the other', (tester) async {
      final (api, _) = await pumpApp(
        tester,
        setup: (api) {
          api.consentJson['c1'] = undecided('c1');
          api.consentJson['c2'] = undecided('c2');
        },
      );
      await tester.scrollUntilVisible(find.byKey(const Key('consentAllowAll')), 200, scrollable: consentList());
      await tester.tap(find.byKey(const Key('consentAllowAll')));
      await tester.pumpAndSettle();
      expect(find.text('Privacy choices for Diya'), findsOneWidget);
      await tester.tap(find.byKey(const Key('consentLater')));
      await tester.pumpAndSettle();
      expect(api.consentRequests.where((r) => r.startsWith('c1 ')).length, 4);
      expect(api.consentRequests.where((r) => r.startsWith('c2 ')), isEmpty);
    });

    testWidgets('Profile → Privacy per child: change a decision, or see it read-only', (tester) async {
      final (api, _) = await pumpApp(tester, setup: (api) => api.consentJson['c2'] = FakeParentApi.allDecided('c2', canDecide: false));
      await openTab(tester, 'Profile');
      await scrollTo(tester, find.byKey(const Key('profile-privacy-c1')), profileList());
      await tester.tap(find.byKey(const Key('profile-privacy-c1')));
      await tester.pumpAndSettle();
      expect(find.text('Privacy: Aarav'), findsWidgets);
      expect(find.text('Allowed by Rajesh Patel on 1 Oct 2026'), findsWidgets);
      await tester.tap(find.byKey(const Key('privacy-ai_features')));
      await tester.pumpAndSettle();
      expect(api.consentRequests, ['c1 ai_features false']);
      await tester.pageBack();
      await tester.pumpAndSettle();

      await scrollTo(tester, find.byKey(const Key('profile-privacy-c2')), profileList());
      await tester.tap(find.byKey(const Key('profile-privacy-c2')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('consentReadOnly')), findsOneWidget);
      expect(find.textContaining('Diya manages this.'), findsOneWidget);
      expect(find.byType(Switch), findsNothing);
    });

    testWidgets('the grievance officer is named with their email and phone; without one, ask the office', (tester) async {
      await pumpApp(
        tester,
        setup: (api) => api.consentJson['c1'] = {
          ...FakeParentApi.allDecided('c1'),
          'grievanceOfficer': {'name': 'Meera Rao', 'email': 'dpo@demo.kinetix.in', 'phone': '+919800000009'},
        },
      );
      Finder privacyList() => find.descendant(of: find.byType(PrivacyScreen), matching: find.byType(Scrollable)).first;
      await openTab(tester, 'Profile');
      await scrollTo(tester, find.byKey(const Key('profile-privacy-c1')), profileList());
      await tester.tap(find.byKey(const Key('profile-privacy-c1')));
      await tester.pumpAndSettle();
      await scrollTo(tester, find.byKey(const Key('grievanceOfficer')), privacyList());
      expect(find.text('Meera Rao'), findsOneWidget);
      expect(find.widgetWithText(SelectableText, 'dpo@demo.kinetix.in'), findsOneWidget);
      expect(find.widgetWithText(SelectableText, '+919800000009'), findsOneWidget);
      expect(find.byKey(const Key('noGrievanceOfficer')), findsNothing);
      await scrollTo(tester, find.byKey(const Key('readNotice')), privacyList());
      await tester.tap(find.byKey(const Key('readNotice')));
      await tester.pumpAndSettle();
      await tester.drag(find.byKey(const Key('noticeList')), const Offset(0, -3000));
      await tester.pumpAndSettle();
      expect(find.textContaining('You can reach them here'), findsOneWidget);
      expect(find.textContaining("Ask the institution's office"), findsNothing);
      expect(find.descendant(of: find.byKey(const Key('grievanceOfficer')), matching: find.text('Meera Rao')), findsOneWidget);
      await tester.pageBack();
      await tester.pumpAndSettle();
      await tester.pageBack();
      await tester.pumpAndSettle();

      // Diya's institution has not named one.
      await scrollTo(tester, find.byKey(const Key('profile-privacy-c2')), profileList());
      await tester.tap(find.byKey(const Key('profile-privacy-c2')));
      await tester.pumpAndSettle();
      await scrollTo(tester, find.byKey(const Key('noGrievanceOfficer')), privacyList());
      expect(find.textContaining("Ask the institution's office"), findsOneWidget);
      expect(find.byKey(const Key('grievanceOfficer')), findsNothing);
    });
  });

  group('realtime messages', () {
    testWidgets('message.new refreshes the list and the open thread; a reconnect catches up', (tester) async {
      final server = FakeRealtimeServer();
      final (api, _) = await pumpApp(tester, realtime: server);
      final conn = server.connections.single;
      expect(conn.connected, isTrue);
      expect(conn.token, 'tok');

      await openTab(tester, 'Messages');
      await tester.tap(find.byKey(const Key('thread-cv1')));
      await tester.pumpAndSettle();
      api.chats['cv1']!.add(ChatMessage(id: 'm9', senderId: 't1', body: 'Aarav did well today.', createdAt: DateTime.now()));
      final before = api.calls.where((c) => c == 'conversations').length;
      conn.send(const RealtimeMessageNew(conversationId: 'cv1', messageId: 'm9', senderId: 't1'));
      await tester.pumpAndSettle();
      expect(find.text('Aarav did well today.'), findsOneWidget);
      expect(api.calls.where((c) => c == 'conversations').length, before + 1);

      conn.send(const RealtimeDisconnected());
      conn.send(const RealtimeReady());
      await tester.pumpAndSettle();
      expect(api.calls.where((c) => c == 'conversations').length, before + 2);
    });

    testWidgets('signing out closes the connection', (tester) async {
      final server = FakeRealtimeServer();
      final (_, state) = await pumpApp(tester, realtime: server);
      await state.signOut();
      await tester.pumpAndSettle();
      expect(server.connections.single.disposed, isTrue);
    });
  });

  group('error codes', () {
    test('codes are worded in the app\'s language; known messages without a code too; others as sent', () {
      expect(describeError(hi, ApiException(404, 'Homework not found', code: 'NOT_FOUND')), hi.errNotFound);
      expect(describeError(hi, ApiException(400, 'This homework has already been checked')), hi.errSubmissionChecked);
      expect(describeError(hi, ApiException(403, 'This student hands in their own homework', code: 'SUBMISSION_STUDENT_ONLY')), hi.errSubmissionStudentOnly);
      expect(describeError(en, ApiException(403, 'This student hands in their own homework')), en.errSubmissionStudentOnly);
      expect(describeError(en, ApiException(413, 'File too large', code: 'TOO_LARGE')), en.errTooLarge);
      expect(describeError(en, ApiException(403, "In a school, the student's parent or guardian decides", code: 'CONSENT_GUARDIAN_DECIDES')), en.errConsentGuardianDecides);
      expect(describeError(en, ApiException(401, 'Invalid or expired token', code: 'AUTH_EXPIRED')), en.errSignInAgain);
      expect(describeError(en, ApiException(400, 'Amount is more than the balance', code: 'BAD_REQUEST')), 'Amount is more than the balance');
    });

    test('the API client reads the code from the error body', () async {
      final client = MockClient((_) async => http.Response(jsonEncode({'statusCode': 400, 'message': 'x', 'code': 'SUBMISSION_EMPTY'}), 400));
      final api = HttpParentApi(baseUrl: 'http://api.test', client: client)..token = 'tok';
      await expectLater(api.consents('c1'), throwsA(isA<ApiException>().having((e) => e.code, 'code', 'SUBMISSION_EMPTY')));
    });
  });
}
