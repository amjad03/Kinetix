import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kinetix_student/core/api.dart';
import 'package:kinetix_student/core/attachments.dart';
import 'package:kinetix_student/core/live.dart';
import 'package:kinetix_student/core/models.dart';
import 'package:kinetix_student/features/calendar/calendar_screen.dart';
import 'package:kinetix_student/features/learn/syllabus_view.dart';
import 'package:kinetix_student/features/privacy/privacy.dart';
import 'package:kinetix_student/features/profile/profile_tab.dart';
import 'package:kinetix_student/features/today/today_tab.dart';
import 'package:kinetix_student/l10n/l10n.dart';

import 'fake_api.dart';
import 'fake_live.dart';
import 'helpers.dart';

void main() {
  Finder today() => find.descendant(of: find.byType(TodayTab), matching: find.byType(Scrollable)).first;
  Finder profileList() => find.descendant(of: find.byType(ProfileTab), matching: find.byType(Scrollable)).first;
  Finder consentList() => find.descendant(of: find.byKey(const Key('consentList')), matching: find.byType(Scrollable)).first;
  Finder privacyList() => find.descendant(of: find.byType(PrivacyScreen), matching: find.byType(Scrollable)).first;
  final hi = lookupAppLocalizations(const Locale('hi'));

  late FakeAttachmentPicker picker;
  setUp(() {
    picker = FakeAttachmentPicker();
    AttachmentPicker.instance = picker;
  });
  tearDown(() => AttachmentPicker.instance = const DeviceAttachmentPicker());

  group('calendar', () {
    testWidgets('Today lists what is coming up for the student\'s program; the calendar groups by month', (tester) async {
      await pumpApp(tester);
      final card = find.byKey(const Key('calendarCard'));
      await scrollTo(tester, card, scrollable: today());
      expect(find.descendant(of: card, matching: find.text('College day')), findsOneWidget);
      expect(find.descendant(of: card, matching: find.text('Mid-semester exams')), findsOneWidget);
      // For another program.
      expect(find.text('BCA practicals'), findsNothing);
      expect(find.byKey(const Key('holidayBanner')), findsNothing);

      await tester.tap(find.descendant(of: card, matching: find.byType(InkWell)).last);
      await tester.pumpAndSettle();
      expect(find.byType(CalendarScreen), findsOneWidget);
      expect(find.text('October 2026'), findsOneWidget);
      expect(find.text('Mon 12 Oct – Fri 16 Oct'), findsOneWidget);
      expect(find.text('For BCom'), findsOneWidget);
      expect(find.text('In 6 days'), findsOneWidget);
      expect(find.text('Dussehra'), findsOneWidget);
      expect(find.text('BCA practicals'), findsNothing);
    });

    testWidgets('a holiday tomorrow (or today) shows a banner that opens the calendar', (tester) async {
      final (api, _) = await pumpApp(
        tester,
        setup: (api) => api.calendarEvents.insert(0, FakeStudentApi.eventJson('e0', 'holiday', 'Gandhi Jayanti (observed)', '2026-10-05')),
      );
      expect(find.text('Holiday tomorrow: Gandhi Jayanti (observed)'), findsOneWidget);
      expect(find.text('No classes.'), findsOneWidget);

      api.calendarEvents[0] = FakeStudentApi.eventJson('e0', 'holiday', 'Dussehra break', '2026-10-03', '2026-10-06');
      await tester.drag(today(), const Offset(0, 400));
      await tester.pumpAndSettle();
      expect(find.text('Holiday today: Dussehra break'), findsOneWidget);
      expect(find.text('No classes until Tue 6 Oct.'), findsOneWidget);
      await tester.tap(find.byKey(const Key('holidayBanner')));
      await tester.pumpAndSettle();
      expect(find.byType(CalendarScreen), findsOneWidget);
    });

    testWidgets('a calendar update opens the calendar with that entry marked', (tester) async {
      await pumpApp(
        tester,
        setup: (api) => api.inbox.insert(0, api.notice('n9', NotificationKind.calendar, {'calendarEventId': 'e3', 'startsOn': '2026-10-20'}, title: 'Holiday: Dussehra')),
      );
      await openTab(tester, 'Updates');
      await tester.tap(find.byKey(const Key('notification-n9')));
      await tester.pumpAndSettle();
      expect(find.byType(CalendarScreen), findsOneWidget);
      final card = tester.widget<Card>(find.byKey(const Key('calendar-e3')));
      expect(card.shape, isA<RoundedRectangleBorder>());
    });
  });

  group('homework hand-in', () {
    Future<void> openHomework(WidgetTester tester) async {
      await scrollTo(tester, find.byKey(const Key('homework-h1')), scrollable: today());
      await tester.tap(find.byKey(const Key('homework-h1')));
      await tester.pumpAndSettle();
      await scrollTo(tester, find.byKey(const Key('submissionPanel')));
    }

    testWidgets('text, a photo and a PDF go up with progress; then it shows as handed in', (tester) async {
      final (api, _) = await pumpApp(tester);
      api.submitGate = Completer<void>();
      await openHomework(tester);
      expect(find.text('Not handed in yet'), findsOneWidget);
      await tester.tap(find.byKey(const Key('handIn')));
      await tester.pumpAndSettle();

      // Nothing yet: the student is told what is needed.
      await tester.ensureVisible(find.byKey(const Key('sendHandIn')));
      await tester.tap(find.byKey(const Key('sendHandIn')));
      await tester.pumpAndSettle();
      expect(find.text('Write an answer or add a photo.'), findsOneWidget);
      expect(api.submitRequests, isEmpty);

      await tester.enterText(find.byKey(const Key('handInText')), 'Journal entries are in the photo.');
      await tester.ensureVisible(find.byKey(const Key('addCamera')));
      await tester.tap(find.byKey(const Key('addCamera')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('addPdf')));
      await tester.pumpAndSettle();
      expect(picker.picked, [AttachmentSource.camera, AttachmentSource.pdf]);
      expect(find.text('page1.jpg'), findsOneWidget);
      expect(find.text('answers.pdf'), findsOneWidget);
      expect(find.text('Photos and PDFs: 2 of 5'), findsOneWidget);

      await tester.ensureVisible(find.byKey(const Key('sendHandIn')));
      await tester.tap(find.byKey(const Key('sendHandIn')));
      await tester.pump();
      expect(find.byKey(const Key('uploadProgress')), findsOneWidget);
      expect(find.text('Sending… 50%'), findsOneWidget);
      api.submitGate!.complete();
      await tester.pumpAndSettle();

      final r = api.submitRequests.single;
      expect((r.homeworkId, r.studentId, r.text), ('h1', 's1', 'Journal entries are in the photo.'));
      expect([for (final f in r.files) '${f.name} ${f.mime} ${f.bytes.length}'], ['page1.jpg image/jpeg 1200', 'answers.pdf application/pdf 3000']);
      expect(find.text('Handed in'), findsOneWidget);
      expect(find.text('Handed in.'), findsOneWidget);
      expect(find.byKey(const Key('submittedFile-0')), findsOneWidget);
      expect(find.text('Hand in again'), findsOneWidget);
    });

    testWidgets('at most five files; a gallery pick fills the rest', (tester) async {
      await pumpApp(tester);
      picker.files[AttachmentSource.gallery] = [
        for (var i = 0; i < 6; i++) UploadFile(name: 'p$i.jpg', mime: 'image/jpeg', bytes: Uint8List(10)),
      ];
      await openHomework(tester);
      await tester.tap(find.byKey(const Key('handIn')));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const Key('addGallery')));
      await tester.tap(find.byKey(const Key('addGallery')));
      await tester.pumpAndSettle();
      expect(find.text('Photos and PDFs: 5 of 5'), findsOneWidget);
      expect(tester.widget<OutlinedButton>(find.byKey(const Key('addPdf'))).onPressed, isNull);
    });

    testWidgets('a returned piece shows the remark and can be handed in again; late is marked', (tester) async {
      await pumpApp(
        tester,
        setup: (api) => api.submissions['h1/s1'] = {
          'status': 'returned',
          'text': 'My answer',
          'files': [
            {'index': 0, 'name': 'page1.jpg', 'mime': 'image/jpeg', 'bytes': 245000},
          ],
          'submittedAt': '2026-10-06T05:00:00Z',
          'late': true,
          'remark': 'Show the working for question 3.',
          'checkedBy': 'Anita Sharma',
          'checkedAt': '2026-10-07T05:00:00Z',
        },
      );
      await openHomework(tester);
      expect(find.text('Returned to redo'), findsOneWidget);
      expect(find.byKey(const Key('submissionLate')), findsOneWidget);
      expect(find.text('Show the working for question 3.'), findsOneWidget);
      expect(find.text('Returned by Anita Sharma on Wed 7 Oct'), findsOneWidget);
      expect(find.text('240 KB'), findsOneWidget);
      expect(find.text('Hand in again'), findsOneWidget);
    });

    testWidgets('checked work cannot be handed in again; the server\'s refusal is worded by code', (tester) async {
      final (api, _) = await pumpApp(
        tester,
        setup: (api) => api.submissions['h1/s1'] = {
          'status': 'checked',
          'text': 'My answer',
          'files': [],
          'submittedAt': '2026-10-04T05:00:00Z',
          'late': false,
          'remark': null,
          'checkedBy': 'Anita Sharma',
          'checkedAt': '2026-10-05T05:00:00Z',
        },
      );
      await openHomework(tester);
      expect(find.text('Checked'), findsOneWidget);
      expect(find.text('Checked by Anita Sharma on Mon 5 Oct'), findsOneWidget);
      expect(find.byKey(const Key('handIn')), findsNothing);

      // Checked on another phone while this one was handing in.
      api.submissions.remove('h1/s1');
      api.submitError = ApiException(400, 'This homework has already been checked', code: 'SUBMISSION_CHECKED');
      await tester.pageBack();
      await tester.pumpAndSettle();
      await openHomework(tester);
      await tester.tap(find.byKey(const Key('handIn')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('handInText')), 'Answer');
      await tester.ensureVisible(find.byKey(const Key('sendHandIn')));
      await tester.tap(find.byKey(const Key('sendHandIn')));
      await tester.pumpAndSettle();
      expect(find.text('This homework has already been checked.'), findsOneWidget);
      expect(find.byKey(const Key('sendHandIn')), findsOneWidget);
    });

    test('the upload is multipart: text and files, with the token, and reports progress', () async {
      late http.BaseRequest seen;
      late String body;
      final client = MockClient.streaming((request, stream) async {
        seen = request;
        body = latin1.decode(await stream.toBytes());
        return http.StreamedResponse(
          Stream.value(utf8.encode(jsonEncode({'status': 'submitted', 'text': 'Answer', 'files': [], 'late': false}))),
          200,
          headers: {'content-type': 'application/json'},
        );
      });
      final api = HttpStudentApi(baseUrl: 'http://api.test', client: client)..token = 'tok';
      final progress = <(int, int)>[];
      final s = await api.submitHomework(
        'h1',
        's1',
        text: 'Answer',
        files: [
          UploadFile(name: 'page1.jpg', mime: 'image/jpeg', bytes: Uint8List.fromList([1, 2, 3])),
          UploadFile(name: 'answers.pdf', mime: 'application/pdf', bytes: Uint8List.fromList([4, 5])),
        ],
        onProgress: (sent, total) => progress.add((sent, total)),
      );
      expect(s.status, SubmissionStatus.submitted);
      expect(seen.method, 'POST');
      expect(seen.url.toString(), 'http://api.test/v1/homework/h1/submissions/s1');
      expect(seen.headers['authorization'], 'Bearer tok');
      expect(seen.headers['content-type'], startsWith('multipart/form-data; boundary='));
      expect(body, contains('content-disposition: form-data; name="text"\r\n\r\nAnswer\r\n'));
      expect(body, contains('content-disposition: form-data; name="files"; filename="page1.jpg"'));
      expect(body, contains('content-type: image/jpeg'));
      expect(body, contains('content-disposition: form-data; name="files"; filename="answers.pdf"'));
      expect(body, contains('content-type: application/pdf'));
      expect(RegExp('name="files"').allMatches(body).length, 2);
      expect(progress.last.$1, progress.last.$2);
      expect(progress.last.$2, seen.contentLength);
    });
  });

  group('syllabus progress', () {
    testWidgets('subjects show progress; a subject ticks the topics taught', (tester) async {
      final (api, _) = await pumpApp(tester);
      await openTab(tester, 'Learn');
      await tester.tap(find.byKey(const Key('tabSyllabus')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('coverage sec1 sub1'));
      expect(find.descendant(of: find.byKey(const Key('subjectTile-sub1')), matching: find.byType(CoverageBar)), findsOneWidget);
      // No syllabus topics: no bar.
      expect(find.descendant(of: find.byKey(const Key('subjectTile-sub2')), matching: find.byType(CoverageBar)), findsNothing);

      await tester.tap(find.byKey(const Key('subjectTile-sub1')));
      await tester.pumpAndSettle();
      expect(find.text('1 of 2 topics taught'), findsOneWidget);
      expect(find.text('50%'), findsOneWidget);
      expect(find.byKey(const Key('taught-t1')), findsOneWidget);
      expect(find.byKey(const Key('taught-t2')), findsNothing);
      expect(find.text('Taught on Thu 1 Oct'), findsOneWidget);
    });
  });

  group('privacy and consent', () {
    void undecided(FakeStudentApi api, {bool canDecide = true}) => api.consentJson = {
      'studentId': 's1',
      'noticeVersion': '2026-10',
      'canDecide': canDecide,
      'purposes': {'data_processing': FakeStudentApi.decided(true), 'ai_features': null, 'class_recordings': null, 'photos': null},
    };

    testWidgets('asked after sign-in while undecided: nothing pre-ticked, choices saved per purpose', (tester) async {
      final (api, _) = await pumpApp(tester, setup: undecided);
      expect(find.byType(ConsentScreen), findsOneWidget);
      expect(find.text('Your privacy choices'), findsOneWidget);
      // Already allowed stays on; the rest start off.
      expect(tester.widget<SwitchListTile>(find.byKey(const Key('consent-data_processing'))).value, isTrue);
      expect(tester.widget<SwitchListTile>(find.byKey(const Key('consent-ai_features'))).value, isFalse);

      await tester.tap(find.byKey(const Key('consent-ai_features')));
      await tester.pumpAndSettle();
      await scrollTo(tester, find.byKey(const Key('readNotice')), scrollable: consentList());
      await tester.tap(find.byKey(const Key('readNotice')));
      await tester.pumpAndSettle();
      expect(find.text('Privacy notice'), findsOneWidget);
      expect(find.text('Version 2026-10'), findsOneWidget);
      await tester.drag(find.byKey(const Key('noticeList')), const Offset(0, -3000));
      await tester.pumpAndSettle();
      expect(find.text('Questions and requests'), findsOneWidget);
      await tester.pageBack();
      await tester.pumpAndSettle();

      await scrollTo(tester, find.byKey(const Key('consentSave')), scrollable: consentList());
      await tester.tap(find.byKey(const Key('consentSave')));
      await tester.pumpAndSettle();
      expect(api.consentRequests, ['s1 data_processing true', 's1 ai_features true', 's1 class_recordings false', 's1 photos false']);
      expect(find.byType(ConsentScreen), findsNothing);
      expect(find.byType(TodayTab), findsOneWidget);
    });

    testWidgets('"Allow all" records every purpose; "Not now" records nothing', (tester) async {
      final (api, _) = await pumpApp(tester, setup: undecided);
      await tester.tap(find.byKey(const Key('consentLater')));
      await tester.pumpAndSettle();
      expect(find.byType(ConsentScreen), findsNothing);
      expect(api.consentRequests, isEmpty);

      await tester.pumpWidget(const SizedBox());
      final (api2, _) = await pumpApp(tester, setup: undecided);
      expect(find.byType(ConsentScreen), findsOneWidget);
      await scrollTo(tester, find.byKey(const Key('consentAllowAll')), scrollable: consentList());
      await tester.tap(find.byKey(const Key('consentAllowAll')));
      await tester.pumpAndSettle();
      expect(api2.consentRequests, ['s1 data_processing true', 's1 ai_features true', 's1 class_recordings true', 's1 photos true']);
    });

    testWidgets('a decision made on an older notice is asked again', (tester) async {
      await pumpApp(
        tester,
        setup: (api) => (api.consentJson['purposes'] as Map)['photos'] = FakeStudentApi.decided(true, version: '2025-06'),
      );
      expect(find.byType(ConsentScreen), findsOneWidget);
    });

    testWidgets('Profile → Privacy shows who decided and when, and changes a decision', (tester) async {
      final (api, _) = await pumpApp(tester);
      await openTab(tester, 'Profile');
      await scrollTo(tester, find.byKey(const Key('openPrivacy')), scrollable: profileList());
      await tester.tap(find.byKey(const Key('openPrivacy')));
      await tester.pumpAndSettle();
      expect(find.text('Allowed by Aarav Patel on 1 Oct 2026'), findsWidgets);
      await tester.tap(find.byKey(const Key('privacy-ai_features')));
      await tester.pumpAndSettle();
      expect(api.consentRequests, ['s1 ai_features false']);
      expect(find.text('Not allowed by Aarav Patel on 1 Oct 2026'), findsOneWidget);
      expect(find.text('Saved.'), findsOneWidget);
    });

    testWidgets('at a school the parent decides: read-only, and never asked', (tester) async {
      final (api, _) = await pumpApp(tester, setup: (api) => undecided(api, canDecide: false));
      expect(find.byType(ConsentScreen), findsNothing);
      await openTab(tester, 'Profile');
      await scrollTo(tester, find.byKey(const Key('openPrivacy')), scrollable: profileList());
      await tester.tap(find.byKey(const Key('openPrivacy')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('consentReadOnly')), findsOneWidget);
      expect(find.textContaining('Your parent manages this.'), findsOneWidget);
      expect(find.byType(Switch), findsNothing);
      await scrollTo(tester, find.byKey(const Key('decided-photos')), scrollable: privacyList());
      expect(find.descendant(of: find.byKey(const Key('privacy-photos')), matching: find.text('Not decided yet')), findsOneWidget);
      expect(api.consentRequests, isEmpty);
    });

    testWidgets('KINETIX AI turned off by withdrawn consent says so and points to Privacy', (tester) async {
      await pumpApp(
        tester,
        setup: (api) => api.explainError = ApiException(403, 'KINETIX AI is turned off for this student (consent was withdrawn)', code: 'CONSENT_WITHDRAWN'),
      );
      await openTab(tester, 'Learn');
      await tester.enterText(find.byKey(const Key('question')), 'What is goodwill?');
      await tester.pump();
      await tester.ensureVisible(find.byKey(const Key('askButton')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('askButton')));
      await tester.pumpAndSettle();
      expect(find.text('KINETIX AI is turned off'), findsOneWidget);
      expect(find.byKey(const Key('aiRetry')), findsNothing);
      await tester.ensureVisible(find.byKey(const Key('aiOpenPrivacy')));
      await tester.tap(find.byKey(const Key('aiOpenPrivacy')));
      await tester.pumpAndSettle();
      expect(find.byType(PrivacyScreen), findsOneWidget);
    });
  });

  group('realtime messages', () {
    testWidgets('message.new refreshes the list and the open thread; a reconnect catches up', (tester) async {
      final server = FakeLiveServer();
      final (api, _) = await pumpApp(
        tester,
        live: server,
        setup: (api) => api.chats['cv1'] = [ChatMessage(id: 'm1', senderId: 't1', body: 'Read section 4.3.', createdAt: DateTime.now())],
      );
      final feed = server.connections.single;
      expect(feed.connected, isTrue);
      expect(feed.token, 'tok');

      await openTab(tester, 'Profile');
      await scrollTo(tester, find.byKey(const Key('openMessages')), scrollable: profileList());
      await tester.tap(find.byKey(const Key('openMessages')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('thread-cv1')));
      await tester.pumpAndSettle();
      expect(find.text('Read section 4.3.'), findsOneWidget);

      api.chats['cv1']!.add(ChatMessage(id: 'm2', senderId: 't1', body: 'And bring your calculator.', createdAt: DateTime.now()));
      final before = api.calls.where((c) => c == 'conversations').length;
      feed.send(const LiveMessageNew(conversationId: 'cv1', messageId: 'm2', senderId: 't1'));
      await tester.pumpAndSettle();
      expect(find.text('And bring your calculator.'), findsOneWidget);
      expect(api.calls.where((c) => c == 'conversations').length, before + 1);

      // Dropped and back: anything missed is fetched.
      feed.send(const LiveDisconnected());
      feed.send(const LiveReady());
      await tester.pumpAndSettle();
      expect(api.calls.where((c) => c == 'conversations').length, before + 2);
    });

    testWidgets('at a school (no messages) no realtime connection is opened', (tester) async {
      final server = FakeLiveServer();
      await pumpApp(tester, live: server, setup: (api) => api.contactGroups = []);
      expect(server.connections, isEmpty);
    });
  });

  group('error codes', () {
    test('codes are worded in the app\'s language; known messages without a code too; others as sent', () {
      expect(describeError(hi, ApiException(404, 'Homework not found', code: 'NOT_FOUND')), hi.errNotFound);
      expect(describeError(hi, ApiException(400, 'This homework has already been checked')), hi.errSubmissionChecked);
      expect(describeError(en, ApiException(400, 'Write an answer or add a photo', code: 'SUBMISSION_EMPTY')), 'Write an answer or add a photo.');
      expect(describeError(en, ApiException(413, 'File too large', code: 'TOO_LARGE')), en.errTooLarge);
      expect(describeError(en, ApiException(429, '', code: 'RATE_LIMITED')), en.errTooMany);
      expect(describeError(en, ApiException(401, 'Invalid or expired token', code: 'AUTH_EXPIRED')), en.errSignInAgain);
      expect(describeError(en, ApiException(403, "In a school, the student's parent or guardian decides", code: 'CONSENT_GUARDIAN_DECIDES')), en.errConsentGuardianDecides);
      expect(describeError(en, ApiException(400, 'text: Too long', code: 'VALIDATION')), 'text: Too long');
      expect(describeError(en, ApiException(500, '', code: 'SERVER_ERROR')), en.errGeneric(500));
    });

    test('the API client reads the code from the error body', () async {
      final client = MockClient((_) async => http.Response(jsonEncode({'statusCode': 403, 'message': 'x', 'code': 'CONSENT_WITHDRAWN'}), 403));
      final api = HttpStudentApi(baseUrl: 'http://api.test', client: client)..token = 'tok';
      await expectLater(
        api.consents('s1'),
        throwsA(isA<ApiException>().having((e) => e.code, 'code', 'CONSENT_WITHDRAWN').having((e) => e.status, 'status', 403)),
      );
    });

    testWidgets('a refused live class (message only, no code) is explained in the app\'s language', (tester) async {
      final server = FakeLiveServer()..ack = const LiveWatchAck(ok: false, error: 'Only school leaders and students can watch classes');
      await pumpApp(tester, live: server, prefs: {'language': 'hi'}, setup: (api) => api.liveClass = FakeStudentApi.corporateLive());
      await tester.tap(find.byKey(const Key('watchLive')));
      for (var i = 0; i < 8; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      expect(find.text(hi.errLiveNotAllowed), findsOneWidget);
    });
  });
}
