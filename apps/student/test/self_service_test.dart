// Self-service: online quizzes, council elections, the library catalogue and self-checkout, the hostel,
// bus stop changes and the pass, attendance by subject with leave and on duty, hand-in rules and
// withheld results.
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zynetix_student/core/api.dart';
import 'package:zynetix_student/core/attachments.dart';
import 'package:zynetix_student/core/campus_services.dart';
import 'package:zynetix_student/core/models.dart';
import 'package:zynetix_student/core/self_service.dart';
import 'package:zynetix_student/features/attendance/attendance_overview_screen.dart';
import 'package:zynetix_student/features/campus/bus_screen.dart';
import 'package:zynetix_student/features/campus/elections_screen.dart';
import 'package:zynetix_student/features/campus/hostel_screen.dart';
import 'package:zynetix_student/features/exams/exams_tab.dart';
import 'package:zynetix_student/features/homework/submission_panel.dart';
import 'package:zynetix_student/features/library/catalogue_screen.dart';
import 'package:zynetix_student/features/quizzes/quizzes_screen.dart';
import 'package:zynetix_student/l10n/l10n.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import 'fake_api.dart';

Widget host(Widget child, {String language = 'en'}) => MaterialApp(
  theme: ZynetixTheme.light(),
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

void main() {
  late FakeStudentApi api;
  setUp(() => api = FakeStudentApi());

  group('Online quizzes', () {
    testWidgets('lists open, coming and closed quizzes with attempts and the best score', (tester) async {
      phone(tester);
      await tester.pumpWidget(host(QuizzesScreen(api: api)));
      await tester.pumpAndSettle();
      expect(find.text('Open now'), findsOneWidget);
      expect(find.text('Algebra check'), findsOneWidget);
      expect(find.text('2 attempts left'), findsOneWidget);
      expect(find.text('Coming up'), findsOneWidget);
      expect(find.text('Grammar quiz'), findsOneWidget);
      await tester.scrollUntilVisible(find.byKey(const Key('attempt-qa9')), 200);
      expect(find.text('Attempt 1: 8 of 10'), findsOneWidget);
      expect(find.text('Best 80%'), findsOneWidget);
      expect(find.byKey(const Key('startQuiz-qz3')), findsNothing);
    });

    testWidgets('takes a quiz: answers save as you go, submit asks first, and the result reviews each question', (tester) async {
      phone(tester);
      await tester.pumpWidget(host(QuizzesScreen(api: api)));
      await tester.pumpAndSettle();
      await tapOn(tester, find.byKey(const Key('startQuiz-qz1')));
      expect(find.textContaining('15 minutes'), findsOneWidget);
      await tapOn(tester, find.byKey(const Key('qzConfirmStart')));
      expect(api.calls, contains('startQuiz qz1'));
      expect(find.text('Question 1 of 3'), findsOneWidget);
      expect(find.byKey(const Key('qzTimer')), findsOneWidget);

      await tapOn(tester, find.byKey(const Key('opt-q1-1')));
      await tester.pump(const Duration(seconds: 9));
      await tester.pump();
      expect(api.calls, contains('saveQuiz att-qz1 1'));
      expect(find.text('Answers saved'), findsOneWidget);

      await tapOn(tester, find.byKey(const Key('qzNext')));
      await tapOn(tester, find.byKey(const Key('opt-q2-0')));
      await tapOn(tester, find.byKey(const Key('opt-q2-2')));
      await tapOn(tester, find.byKey(const Key('qzNext')));
      await tester.enterText(find.byKey(const Key('answer-q3')), ' 5 ');
      await tester.pump();

      await tapOn(tester, find.byKey(const Key('qzSubmit')));
      expect(find.text('Submit the quiz?'), findsOneWidget);
      await tapOn(tester, find.byKey(const Key('qzConfirmSubmit')));
      expect(api.calls, contains('submitQuiz att-qz1 3'));
      expect(find.byKey(const Key('qzScore')), findsOneWidget);
      expect(find.text('4 / 4'), findsOneWidget);
      expect(find.text('Correct · 2 of 2 marks'), findsOneWidget);

      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(find.text('Attempt 1: 4 of 4'), findsOneWidget);
      expect(find.text('1 attempt left'), findsOneWidget);
    });

    testWidgets('a failed save says so, unanswered questions are counted, and time running out submits', (tester) async {
      phone(tester);
      var clock = DateTime.now();
      api.quizSaveError = ApiException(0, '', problem: ApiProblem.unreachable);
      await tester.pumpWidget(host(QuizzesScreen(api: api, now: () => clock)));
      await tester.pumpAndSettle();
      await tapOn(tester, find.byKey(const Key('startQuiz-qz1')));
      await tapOn(tester, find.byKey(const Key('qzConfirmStart')));
      await tapOn(tester, find.byKey(const Key('opt-q1-0')));
      await tester.pump(const Duration(seconds: 9));
      await tester.pump();
      expect(find.text('Not saved yet. Trying again.'), findsOneWidget);

      await tapOn(tester, find.byKey(const Key('qzJump-2')));
      await tapOn(tester, find.byKey(const Key('qzSubmit')));
      expect(find.textContaining('2 questions are not answered'), findsOneWidget);
      await tapOn(tester, find.text('Keep going'));

      clock = clock.add(const Duration(minutes: 16));
      await tester.pump(const Duration(seconds: 1));
      await tester.pumpAndSettle();
      expect(api.calls.where((c) => c.startsWith('submitQuiz att-qz1')), hasLength(1));
      expect(find.byKey(const Key('qzScore')), findsOneWidget);
      expect((tester.widget<Text>(find.byKey(const Key('qzScore')))).data, '0 / 4');
    });

    testWidgets('empty and failing lists', (tester) async {
      phone(tester);
      api.quizRows = [];
      await tester.pumpWidget(host(QuizzesScreen(api: api)));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('qzEmpty')), findsOneWidget);
      api.quizError = ApiException(0, '', problem: ApiProblem.unreachable);
      await tester.pumpWidget(host(QuizzesScreen(key: UniqueKey(), api: api)));
      await tester.pumpAndSettle();
      expect(find.text('Retry'), findsOneWidget);
    });
  });

  group('Council elections', () {
    testWidgets('votes once in secret: seat limits hold, the ballot is confirmed, and the card says voted', (tester) async {
      phone(tester);
      await tester.pumpWidget(host(ElectionsScreen(api: api, studentId: 's1')));
      await tester.pumpAndSettle();
      expect(find.text('Student council 2026'), findsOneWidget);
      await tapOn(tester, find.byKey(const Key('vote-el1')));
      expect(find.textContaining('Your vote is secret'), findsOneWidget);
      await tapOn(tester, find.byKey(const Key('candidate-c2')));
      await tapOn(tester, find.byKey(const Key('candidate-c1')));
      await tapOn(tester, find.byKey(const Key('candidate-c3')));
      await tapOn(tester, find.byKey(const Key('candidate-c4')));
      await tapOn(tester, find.byKey(const Key('candidate-c5')));
      expect(find.text('You can choose at most 2 for this post.'), findsOneWidget);

      await tapOn(tester, find.byKey(const Key('elCastButton')));
      expect(find.text('Cast your vote?'), findsOneWidget);
      expect(find.textContaining('Asha Rao, Kiran Shetty', findRichText: true), findsOneWidget);
      await tapOn(tester, find.byKey(const Key('elConfirm')));
      expect(api.calls, contains('vote el1 p1:c1 p2:c3+c4'));
      expect(find.text('Your vote is cast.'), findsOneWidget);
      expect(find.byKey(const Key('voted-el1')), findsOneWidget);
      expect(find.byKey(const Key('vote-el1')), findsNothing);
    });

    testWidgets('published results show the votes and who was elected; a refusal is shown', (tester) async {
      phone(tester);
      api.voteError = ApiException(409, 'You have already voted');
      await tester.pumpWidget(host(ElectionsScreen(api: api, studentId: 's1')));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(find.byKey(const Key('result-c8')), 200);
      expect(find.text('212 votes'), findsOneWidget);
      expect(find.text('Elected'), findsOneWidget);

      await tester.scrollUntilVisible(find.byKey(const Key('vote-el1')), -200);
      await tapOn(tester, find.byKey(const Key('vote-el1')));
      await tapOn(tester, find.byKey(const Key('candidate-c1')));
      await tapOn(tester, find.byKey(const Key('elCastButton')));
      await tapOn(tester, find.byKey(const Key('elConfirm')));
      expect(find.text('You have already voted'), findsOneWidget);
      expect(find.byType(BallotScreen), findsOneWidget);
    });

    testWidgets('no elections says so', (tester) async {
      phone(tester);
      api.electionRows = [];
      await tester.pumpWidget(host(ElectionsScreen(api: api, studentId: 's1')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('elEmpty')), findsOneWidget);
    });
  });

  group('Library catalogue', () {
    testWidgets('searches, shows copies on the shelf, reserves a book that is out and cancels it', (tester) async {
      phone(tester);
      await tester.pumpWidget(host(CatalogueScreen(api: api)));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('catalogueSearch')), 'physics');
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pumpAndSettle();
      expect(api.calls, contains('searchCatalogue physics 1'));
      expect(find.text('Concepts of Physics'), findsOneWidget);
      expect(find.text('2 of 4 on the shelf'), findsOneWidget);
      expect(find.byKey(const Key('reserve-b1')), findsNothing);

      await tester.enterText(find.byKey(const Key('catalogueSearch')), 'accounting');
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pumpAndSettle();
      expect(find.text('All copies are out'), findsOneWidget);
      await tapOn(tester, find.byKey(const Key('reserve-b2')));
      expect(api.calls, contains('reserveBook b2'));
      expect(find.text('Number 2 in the queue'), findsOneWidget);
      expect(find.text('You are in the queue'), findsOneWidget);
      await tapOn(tester, find.byKey(const Key('cancelReservation-r1')));
      expect(api.calls, contains('cancelReservation r1'));
      expect(find.byKey(const Key('reservation-r1')), findsNothing);

      await tester.enterText(find.byKey(const Key('catalogueSearch')), 'zoology');
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('catalogueEmpty')), findsOneWidget);
    });

    testWidgets('self-checkout borrows by the book number, and a refusal says why', (tester) async {
      phone(tester);
      await tester.pumpWidget(host(CatalogueScreen(api: api)));
      await tester.pumpAndSettle();
      await tapOn(tester, find.byKey(const Key('openSelfCheckout')));
      expect(tester.widget<FilledButton>(find.byKey(const Key('borrow'))).onPressed, isNull);
      await tester.enterText(find.byKey(const Key('copyCode')), 'ACC-00017');
      await tester.pump();
      await tapOn(tester, find.byKey(const Key('borrow')));
      expect(api.calls, contains('selfCheckout ACC-00017'));
      expect(find.byKey(const Key('borrowed-l9')), findsOneWidget);
      expect(find.textContaining('Due back'), findsOneWidget);

      api.checkoutError = ApiException(409, 'This copy is already on loan');
      await tester.enterText(find.byKey(const Key('copyCode')), 'ACC-00018');
      await tester.pump();
      await tapOn(tester, find.byKey(const Key('borrow')));
      expect(find.text('This copy is already on loan'), findsOneWidget);
    });
  });

  group('Hostel', () {
    testWidgets('a resident sees the room and mess bills, and sends a room change and mess leave', (tester) async {
      phone(tester);
      await tester.pumpWidget(host(HostelScreen(api: api, studentId: 's1', now: () => DateTime(2026, 10, 5, 9))));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('hsRoom')), findsOneWidget);
      expect(find.text('Declined'), findsOneWidget);
      await tester.scrollUntilVisible(find.byKey(const Key('messBill-mb2')), 200);
      expect(find.textContaining('Rebate for 4 days away'), findsOneWidget);
      expect(find.text('Added to your fees'), findsNWidgets(2));

      await tester.scrollUntilVisible(find.byKey(const Key('hsChangeRoom')), -200);
      await tapOn(tester, find.byKey(const Key('hsChangeRoom')));
      await tapOn(tester, find.byKey(const Key('hsRequestSend')));
      expect(find.text('Say why, in a few words.'), findsOneWidget);
      await tester.enterText(find.byKey(const Key('hrReason')), 'Ground floor for a knee injury');
      await tapOn(tester, find.byKey(const Key('hsRequestSend')));
      expect(api.calls, contains('hostelRequest change 2026-10-12 Ground floor for a knee injury'));
      expect(find.text('Request sent to the warden.'), findsOneWidget);
      expect(find.text('Waiting'), findsWidgets);

      await tapOn(tester, find.byKey(const Key('hsChangeRoom')));
      expect(find.text('A request is already waiting for the warden.'), findsOneWidget);

      await tapOn(tester, find.byKey(const Key('hsMessLeave')));
      await tester.enterText(find.byKey(const Key('mlReason')), 'Sports meet');
      await tapOn(tester, find.byKey(const Key('hsMessLeaveSend')));
      expect(api.calls, contains('messLeave 2026-10-06 2026-10-06 Sports meet'));
    });

    testWidgets('a day scholar applies for a seat and sees the application', (tester) async {
      phone(tester);
      api.hostelView = const HostelView(resident: false);
      await tester.pumpWidget(host(HostelScreen(api: api, studentId: 's1')));
      await tester.pumpAndSettle();
      await tapOn(tester, find.byKey(const Key('hsApply')));
      await tapOn(tester, find.byKey(const Key('hsApplySend')));
      expect(find.text('Choose who the room is for.'), findsOneWidget);
      await tapOn(tester, find.byKey(const Key('gender-female')));
      await tester.enterText(find.byKey(const Key('hsDistance')), '120');
      await tapOn(tester, find.byKey(const Key('hsApplySend')));
      expect(api.calls, contains('applyForHostel female 120.0 '));
      expect(find.text('Your application HAP-0001 is with the warden.'), findsOneWidget);
      expect(find.byKey(const Key('hsApply')), findsNothing);
      expect(find.text('Applied'), findsOneWidget);
    });
  });

  group('Bus', () {
    testWidgets('asks to change stop and opens the bus pass', (tester) async {
      phone(tester);
      final opened = <String>[];
      await tester.pumpWidget(
        host(
          BusScreen(
            api: api,
            studentId: 's1',
            every: const Duration(hours: 1),
            openFile: (Uint8List b, String name, String mime) async {
              opened.add('$name $mime ${String.fromCharCodes(b.take(5))}');
              return true;
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tapOn(tester, find.byKey(const Key('busPass')));
      expect(opened, ['bus-pass.pdf application/pdf %PDF-']);

      await tapOn(tester, find.byKey(const Key('changeStop')));
      await tapOn(tester, find.byKey(const Key('sendStopChange')));
      expect(find.text('Choose the new stop.'), findsOneWidget);
      await tapOn(tester, find.byKey(const Key('stop-st3')));
      await tester.enterText(find.byKey(const Key('stopChangeReason')), 'We moved house');
      await tapOn(tester, find.byKey(const Key('sendStopChange')));
      expect(api.calls.where((c) => c.startsWith('requestStopChange st3 ') && c.endsWith('We moved house')), hasLength(1));
      expect(find.text('Request sent to the transport office.'), findsOneWidget);
      await tester.scrollUntilVisible(find.byKey(const Key('stopChange-tc1')), 200);
      expect(find.text('BDA Complex · Route 7 · Banashankari'), findsOneWidget);
      expect(tester.widget<FilledButton>(find.byKey(const Key('changeStop'))).onPressed, isNull);
    });
  });

  group('Attendance by subject', () {
    testWidgets('shows each subject against the university minimum, with the shortage and how to make it up', (tester) async {
      phone(tester);
      await tester.pumpWidget(host(AttendanceOverviewScreen(api: api, studentId: 's1')));
      await tester.pumpAndSettle();
      expect(find.text('79.2%'), findsOneWidget);
      expect(find.text('Short of attendance in Company Law.'), findsOneWidget);
      expect(find.textContaining('Bengaluru City University'), findsOneWidget);
      await tester.scrollUntilVisible(find.byKey(const Key('atNeed-sub3')), 200);
      expect(find.text('Attend the next 8 classes in a row to reach 75%.'), findsOneWidget);
      expect(find.text('28 of 40 classes attended'), findsOneWidget);
    });

    testWidgets('a student above the line is told so; a failed load offers a retry', (tester) async {
      phone(tester);
      api.attendanceOverviewJson = {...api.attendanceOverviewJson, 'status': 'eligible', 'subjects': <Object>[], 'overall': {'held': 10, 'attended': 10, 'pct': 100, 'effective': 100}};
      await tester.pumpWidget(host(AttendanceOverviewScreen(api: api, studentId: 's1')));
      await tester.pumpAndSettle();
      expect(find.text('Your attendance is above the minimum.'), findsOneWidget);
      api.overviewError = ApiException(0, '', problem: ApiProblem.unreachable);
      await tester.pumpWidget(host(AttendanceOverviewScreen(key: UniqueKey(), api: api, studentId: 's1')));
      await tester.pumpAndSettle();
      expect(find.text('Retry'), findsOneWidget);
    });

    testWidgets('applies for medical leave with the certificate and withdraws it', (tester) async {
      phone(tester);
      AttachmentPicker.instance = FakeAttachmentPicker();
      addTearDown(() => AttachmentPicker.instance = const DeviceAttachmentPicker());
      await tester.pumpWidget(host(AttendanceLeaveScreen(api: api)));
      await tester.pumpAndSettle();
      expect(find.text('On duty'), findsOneWidget);
      expect(find.text('Counts as present'), findsOneWidget);

      await tapOn(tester, find.byKey(const Key('applyAttendanceLeave')));
      await tapOn(tester, find.byKey(const Key('kind-medical')));
      await tester.enterText(find.byKey(const Key('atReason')), 'Fever');
      await tapOn(tester, find.byKey(const Key('atSend')));
      expect(find.text('Attach the medical certificate.'), findsOneWidget);
      await tapOn(tester, find.byKey(const Key('atDocPdf')));
      expect(find.text('answers.pdf'), findsOneWidget);
      await tapOn(tester, find.byKey(const Key('atSend')));
      expect(api.calls.where((c) => c.startsWith('applyAttendanceLeave medical ') && c.endsWith('Fever +answers.pdf')), hasLength(1));
      expect(find.text('Sent to your teachers for approval.'), findsOneWidget);
      expect(find.text('Awaiting decision'), findsOneWidget);
      await tapOn(tester, find.byKey(const Key('withdraw-al2')));
      expect(api.calls, contains('cancelAttendanceLeave al2'));
      expect(find.text('Withdrawn'), findsOneWidget);
    });

    testWidgets('on duty for part of a day needs the event', (tester) async {
      phone(tester);
      await tester.pumpWidget(host(ApplyAttendanceLeaveScreen(api: api, now: () => DateTime(2026, 10, 5))));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('atReason')), 'Representing the college');
      await tapOn(tester, find.byKey(const Key('partDay')));
      await tapOn(tester, find.byKey(const Key('atSend')));
      expect(find.text('Name the event or activity.'), findsOneWidget);
      await tester.enterText(find.byKey(const Key('atActivity')), 'Inter-college quiz');
      await tapOn(tester, find.byKey(const Key('atSend')));
      expect(api.calls, contains('applyAttendanceLeave on_duty 2026-10-05 2026-10-05 09:00 13:00 Representing the college / Inter-college quiz'));
    });
  });

  group('Hand-in rules', () {
    final hw = Homework(id: 'h9', title: 'Essay', instructions: '', dueOn: DateTime(2026, 10, 1), subject: 'English', teacher: 'Anita Sharma');

    testWidgets('shows the group, the attempts used and the late policy; a late hand-in shows the penalty', (tester) async {
      phone(tester);
      api.submissions['h9/s1'] = {
        'status': 'returned',
        'text': 'Draft',
        'files': <Object>[],
        'submittedAt': '2026-09-30T05:00:00Z',
        'late': true,
        'penaltyPct': 10,
        'attempts': 1,
        'remark': 'Add references',
        'rules': {
          'dueAt': '2036-10-01T18:30:00Z',
          'cutoffAt': null,
          'latePolicy': 'penalty',
          'latePenaltyPct': 10,
          'maxAttempts': 2,
          'group': {'name': 'Group 3', 'members': ['Asha Rao', 'Kiran Shetty']},
        },
      };
      await tester.pumpWidget(host(Scaffold(body: SingleChildScrollView(child: SubmissionPanel(api: api, homework: hw, studentId: 's1')))));
      await tester.pumpAndSettle();
      expect(find.textContaining('Group work (Group 3) with Asha Rao, Kiran Shetty'), findsOneWidget);
      expect(find.text('1 of 2 hand-ins used'), findsOneWidget);
      expect(find.text('Late work loses 10% of its marks.'), findsOneWidget);
      expect(find.text('Handed in late: 10% is taken off the marks.'), findsOneWidget);
      expect(find.byKey(const Key('handIn')), findsOneWidget);
    });

    testWidgets('past the due time with late work refused, no hand-in is offered', (tester) async {
      phone(tester);
      api.submissions['h9/s1'] = {
        'status': null,
        'rules': {'dueAt': '2020-10-01T18:30:00Z', 'cutoffAt': null, 'latePolicy': 'reject', 'latePenaltyPct': 0, 'maxAttempts': 1, 'group': null},
      };
      await tester.pumpWidget(host(Scaffold(body: SingleChildScrollView(child: SubmissionPanel(api: api, homework: hw, studentId: 's1')))));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('hwClosed')), findsOneWidget);
      expect(find.byKey(const Key('handIn')), findsNothing);
    });
  });

  testWidgets('a withheld result shows the reason (fee dues) and no figures', (tester) async {
    phone(tester);
    api.results = const ExamResults(
      cgpa: null,
      terms: [TermResult(sessionId: 'ex0', sessionName: 'Semester 2 end exam', term: 2, sgpa: 0, cgpa: 0, outcome: 'withheld', lines: [], withheld: true, withheldReason: 'The result is held for unpaid fees: ₹12,000 is overdue.')],
    );
    await tester.pumpWidget(host(ExamsTab(api: api, student: api.record!, openFile: (_, _, _) async => true)));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.byKey(const Key('withheldReason-ex0')), 200);
    expect(find.text('Reason: The result is held for unpaid fees: ₹12,000 is overdue.'), findsOneWidget);
    expect(find.byKey(const Key('sgpa-ex0')), findsNothing);
  });

  test('parses the server\'s quiz, election and attendance answers', () {
    final q = QuizAttempt.fromJson({
      'attemptId': 'a1',
      'title': 'T',
      'instructions': '',
      'dueAt': '2026-10-14T10:00:00.000Z',
      'answers': {'q1': [1], 'q2': 'x'},
      'questions': [
        {'id': 'q1', 'kind': 'mcq', 'text': 'Q', 'options': ['a', 'b'], 'marks': '2', 'language': null, 'sampleTests': <Object>[]},
      ],
    });
    expect(q.answers['q1'], [1]);
    expect(q.questions.single.marks, 2);
    final e = Election.fromJson({'id': 'e', 'title': 'E', 'description': '', 'status': 'open', 'votingStartsAt': '2026-10-14T10:00:00.000Z', 'votingEndsAt': '2026-10-15T10:00:00.000Z', 'canVote': true, 'voted': false, 'posts': [{'id': 'p', 'electionId': 'e', 'title': 'President', 'seats': 1, 'sortOrder': 0, 'candidates': [{'id': 'c', 'postId': 'p', 'studentId': 's', 'fullName': 'A', 'rollNo': '1', 'className': 'X', 'manifesto': '', 'status': 'approved'}]}]});
    expect(e.posts.single.candidates.single.votes, isNull);
    final t = AttendanceTally.fromJson({'held': 40, 'attended': 28, 'pct': 70, 'effective': 70});
    expect(t.classesToReach(75), 8);
    expect(const AttendanceTally(held: 10, attended: 9, pct: 90).classesToReach(75), 0);
  });

  testWidgets('Hindi and Kannada: the new screens read in their own words and fit a 360dp phone', (tester) async {
    phone(tester, width: 360);
    for (final lang in ['hi', 'kn']) {
      final s = lookupAppLocalizations(Locale(lang));
      final screens = <(Widget, String)>[
        (QuizzesScreen(key: UniqueKey(), api: FakeStudentApi()), s.qzTitle),
        (ElectionsScreen(key: UniqueKey(), api: FakeStudentApi(), studentId: 's1'), s.elTitle),
        (CatalogueScreen(key: UniqueKey(), api: FakeStudentApi()), s.libCatalogue),
        (HostelScreen(key: UniqueKey(), api: FakeStudentApi(), studentId: 's1'), s.hsTitle),
        (AttendanceOverviewScreen(key: UniqueKey(), api: FakeStudentApi(), studentId: 's1'), s.atBySubject),
        (AttendanceLeaveScreen(key: UniqueKey(), api: FakeStudentApi()), s.atLeaveOnDuty),
        (ApplyAttendanceLeaveScreen(key: UniqueKey(), api: FakeStudentApi()), s.atApplyTitle),
        (BusScreen(key: UniqueKey(), api: FakeStudentApi(), studentId: 's1', every: const Duration(hours: 1)), s.busTitle),
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
