// Every screen in English, Hindi and Kannada at 360×640 and 412×892, text scale 1.0 and 1.3,
// with the real bundled fonts: no overflow anywhere (an overflow fails the test).
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_teacher/core/api.dart';
import 'package:kinetix_teacher/core/hr_models.dart';

import 'fake_api.dart';
import 'helpers.dart';

/// Scrolls the screen on top until [key] is built, then to the middle of the screen (clear of
/// pinned app bars and the bottom edge).
Future<void> reveal(WidgetTester tester, Key key) async {
  await tester.scrollUntilVisible(find.byKey(key), 200, scrollable: find.byType(Scrollable).last);
  await Scrollable.ensureVisible(tester.element(find.byKey(key)), alignment: 0.5);
  await tester.pumpAndSettle();
}

/// Scrolls the list keyed [list] until [key] is built, then to the middle of the screen (text
/// fields have scrollables of their own, so [reveal]'s last scrollable is not the list).
Future<void> revealIn(WidgetTester tester, Key list, Key key) async {
  final scrollable = find.descendant(of: find.byKey(list), matching: find.byType(Scrollable)).first;
  await tester.scrollUntilVisible(find.byKey(key), 200, scrollable: scrollable);
  await Scrollable.ensureVisible(tester.element(find.byKey(key)), alignment: 0.5);
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(loadAppFonts);

  const sizes = [Size(360, 640), Size(412, 892)];
  const scales = [1.0, 1.3];

  for (final lang in ['en', 'hi', 'kn']) {
    for (final size in sizes) {
      for (final scale in scales) {
        final name = '$lang ${size.width.toInt()}×${size.height.toInt()} ×$scale';

        testWidgets('$name: Home and More fit', (tester) async {
          phone(tester, size: size, textScale: scale);
          final api = FakeTeacherApi();
          seed(api, language: lang);
          api.pendingLeaves = [
            LeaveRequestInfo(
              id: 'p1',
              userId: 'u1',
              userName: 'Ravi Kumar',
              type: const LeaveTypeInfo(id: 'lt', code: 'CL', name: 'Casual leave', paid: true),
              fromDate: DateTime.utc(2026, 10, 12),
              toDate: DateTime.utc(2026, 10, 13),
              halfDay: false,
              days: 2,
              reason: 'Family',
              status: LeaveStatus.pending,
            ),
          ];
          await pumpApp(tester, api, prefs: {'token': 'tok'}, tab: null);
          await tester.drag(find.byType(CustomScrollView).hitTestable().first, const Offset(0, -2000));
          await tester.pumpAndSettle();
          await tapAndSettle(tester, find.byKey(const Key('navStudents')));
          await openProfile(tester);
        }, variant: TargetPlatformVariant.only(TargetPlatform.linux));

        testWidgets('$name: signed-in screens fit', (tester) async {
          phone(tester, size: size, textScale: scale);
          final api = FakeTeacherApi();
          seed(api, language: lang);
          api.holidays = {'2026-10-07': 'Mahatma Gandhi Jayanti and Swachh Bharat Diwas (observed)'};
          api.lessonPlans['slot2 2026-10-05'] = {
            'id': 'lp2',
            'date': '2026-10-05',
            'topicIds': ['t2'],
            'topics': [
              {'id': 't2', 'title': 'Methods: average profit, super profit and capitalisation'},
            ],
            'content': {
              'objectives': ['Compare the three methods of valuing goodwill'],
              'steps': [
                {'minutes': 15, 'activity': 'Recap of average profit with last week’s example'},
              ],
              'materials': ['Textbook'],
              'assessment': 'Two quick questions',
              'homework': '',
            },
            'aiDrafted': false,
            'teacher': 'Anita Sharma',
            'reviewedAt': '2026-10-04T06:00:00Z',
            'reviewedBy': 'Dr. Ravi Kumar Venkataramanan',
            'reviewRemark': 'Add a recap question at the end and give the class five minutes to try the super profit method themselves.',
          };
          api.periodsByDate['2026-10-05']![1].lessonPlanned = true;
          await pumpApp(tester, api, prefs: {'token': 'tok'});

          // Today, then connected to a board.
          await tester.drag(find.byType(CustomScrollView).first, const Offset(0, -400));
          await tester.pumpAndSettle();
          await tapAndSettle(tester, find.byKey(const Key('takeAttendance-slot1')));
          await tester.longPress(find.text('Bhavya Reddy'));
          await tester.pumpAndSettle();
          await tapAndSettle(tester, find.byKey(const Key('status-excused')));
          await tester.tap(find.text('Aarav Patel'));
          await tester.pump();
          await pop(tester);

          // A lesson plan: an AI draft, the topic picker, a step's menu, unsaved changes, saved.
          await tester.ensureVisible(find.byKey(const Key('plan-slot1')));
          await tester.pumpAndSettle();
          await tapAndSettle(tester, find.byKey(const Key('plan-slot1')));
          await tapAndSettle(tester, find.byKey(const Key('draftWithAi')));
          await tapAndSettle(tester, find.byKey(const Key('addTopic')));
          await pop(tester); // the topic picker
          await revealIn(tester, const Key('lessonPlanForm'), const Key('stepMenu-1'));
          await tapAndSettle(tester, find.byKey(const Key('stepMenu-1')));
          await pop(tester); // the menu
          await tester.enterText(find.byKey(const Key('stepMinutes-1')), '90');
          await tester.pump();
          await revealIn(tester, const Key('lessonPlanForm'), const Key('homeworkField'));
          await tester.enterText(find.byKey(const Key('homeworkField')), 'Exercise 4.2, questions 1 to 5, with all working shown');
          await tester.pump();
          await pop(tester);
          expect(find.byKey(const Key('discardChanges')), findsOneWidget);
          await pop(tester); // keep editing
          await tapAndSettle(tester, find.byKey(const Key('saveLessonPlan')));
          await pop(tester);
          await clearSnackBars(tester);
          // A plan the head of department reviewed, with a remark.
          await tester.ensureVisible(find.byKey(const Key('plan-slot2')));
          await tester.pumpAndSettle();
          await tapAndSettle(tester, find.byKey(const Key('plan-slot2')));
          expect(find.byKey(const Key('reviewCard')), findsOneWidget);
          await pop(tester);

          await tester.drag(find.byType(CustomScrollView).first, const Offset(0, 400));
          await tester.pumpAndSettle();
          await tapAndSettle(tester, find.byKey(const Key('connectBoard')));
          await tester.enterText(find.byKey(const Key('codeField')), '123');
          await tapAndSettle(tester, find.byKey(const Key('connectWithCode')));
          await tester.enterText(find.byKey(const Key('codeField')), '111111');
          await tester.pumpAndSettle();
          await tester.enterText(find.byKey(const Key('codeField')), '482913');
          await tester.pumpAndSettle();
          await clearSnackBars(tester);
          await tapAndSettle(tester, find.byKey(const Key('connectDone')));
          await tapAndSettle(tester, find.byKey(const Key('endClassCard')));
          await tapAndSettle(tester, find.byKey(const Key('confirmEndClass')));

          // A future day: a holiday.
          await tester.tap(find.text('7').hitTestable().first);
          await tester.pumpAndSettle();
          expect(find.byKey(const Key('holidayCard')), findsOneWidget);

          // A class's syllabus from today's class.
          await clearSnackBars(tester);
          await tester.tap(find.text('5').hitTestable().first);
          await tester.pumpAndSettle();
          await tester.ensureVisible(find.byKey(const Key('syllabus-slot1')));
          await tester.pumpAndSettle();
          await tapAndSettle(tester, find.byKey(const Key('syllabus-slot1')));

          // The year plan: none yet, made, a topic's week and periods, remaking.
          await tapAndSettle(tester, find.byKey(const Key('openYearPlan')));
          expect(find.byKey(const Key('yearPlanNone')), findsOneWidget);
          await tapAndSettle(tester, find.byKey(const Key('makeYearPlan')));
          await tapAndSettle(tester, find.byKey(const Key('planEnd')));
          await pop(tester); // the date picker
          await tapAndSettle(tester, find.byKey(const Key('generatePlan')));
          await clearSnackBars(tester);
          expect(find.byKey(const Key('planStatus')), findsOneWidget);
          await reveal(tester, const Key('editPlanItem-t3'));
          await tapAndSettle(tester, find.byKey(const Key('editPlanItem-t3')));
          await tapAndSettle(tester, find.byKey(const Key('weekPicker')));
          await pop(tester); // the week menu
          await pop(tester); // the dialog
          await tapAndSettle(tester, find.byKey(const Key('yearPlanMenu')));
          await tapAndSettle(tester, find.byKey(const Key('remakePlan')));
          expect(find.byKey(const Key('confirmRemake')), findsOneWidget);
          await pop(tester); // the confirmation
          await pop(tester); // the year plan

          await reveal(tester, const Key('topic-t2'));
          await tapAndSettle(tester, find.byKey(const Key('topic-t2')));
          await clearSnackBars(tester);
          await reveal(tester, const Key('pickDate-t3'));
          await tapAndSettle(tester, find.byKey(const Key('pickDate-t3')));
          await pop(tester); // the date picker
          await tester.drag(find.byType(CustomScrollView).last, const Offset(0, -600));
          await tester.pumpAndSettle();
          await pop(tester);
          await clearSnackBars(tester);

          // Homework and its form.
          await openMore(tester, 'navHomework');
          await tapAndSettle(tester, find.byKey(const Key('assignHomeworkFab')));
          await tapAndSettle(tester, find.byKey(const Key('assignHomework')));
          await pop(tester);

          // A homework's submissions, one student's work, a photo, and a failed review.
          await tapAndSettle(tester, find.byKey(const Key('homework-h1')));
          await tester.drag(find.byType(CustomScrollView).last, const Offset(0, -600));
          await tester.pumpAndSettle();
          await tapAndSettle(tester, find.byKey(const Key('submission-s1')));
          await tapAndSettle(tester, find.byKey(const Key('photo-0')));
          await pop(tester);
          await reveal(tester, const Key('reviewRemark'));
          await tester.enterText(find.byKey(const Key('reviewRemark')), 'Show the working for Q2 as well');
          api.reviewError = ApiException(404, 'Nothing has been handed in yet', code: 'SUBMISSION_MISSING');
          await reveal(tester, const Key('checkWork'));
          await tapAndSettle(tester, find.byKey(const Key('checkWork')));
          await clearSnackBars(tester);
          api.reviewError = null;
          await tapAndSettle(tester, find.byKey(const Key('returnWork')));
          await pop(tester);
          await clearSnackBars(tester);

          // Marks, the new-assessment form and marks entry with errors, stats and dialogs.
          await openMore(tester, 'navMarks');
          await tapAndSettle(tester, find.byKey(const Key('newAssessmentFab')));
          await tapAndSettle(tester, find.byKey(const Key('createAssessment')));
          await pop(tester);
          // Out from under the floating button.
          await tester.drag(find.byType(CustomScrollView).hitTestable().first, const Offset(0, -300));
          await tester.pumpAndSettle();
          await tapAndSettle(tester, find.byKey(const Key('assessment-a1')));
          await tester.enterText(find.byKey(const ValueKey('marks-s1')), '30');
          await tester.pump();
          await tapAndSettle(tester, find.byKey(const ValueKey('remark-s2')));
          await tester.enterText(find.byKey(const Key('remarkField')), 'Neat working');
          await tapAndSettle(tester, find.byKey(const Key('saveRemark')));
          await tapAndSettle(tester, find.byKey(const ValueKey('remark-s2')));
          await tapAndSettle(tester, find.byKey(const Key('saveRemark')));
          await tester.enterText(find.byKey(const ValueKey('marks-s1')), '20');
          await tester.pump();
          await tapAndSettle(tester, find.byKey(const Key('saveMarks')));
          await pop(tester);
          await clearSnackBars(tester);
          await tester.drag(find.byType(CustomScrollView).hitTestable().first, const Offset(0, -300));
          await tester.pumpAndSettle();
          await tapAndSettle(tester, find.byKey(const Key('assessment-a2')));
          await tester.enterText(find.byKey(const ValueKey('marks-s1')), '8');
          await tester.pump();
          await tapAndSettle(tester, find.byKey(const Key('saveMarks')));
          await tapAndSettle(tester, find.byKey(const Key('publishMarks')));
          await tapAndSettle(tester, find.byKey(const Key('confirmPublish')));
          await tester.enterText(find.byKey(const ValueKey('marks-s2')), '5');
          await tester.pump();
          await pop(tester);
          await tapAndSettle(tester, find.byKey(const Key('discardChanges')));

          // Messages, a chat with a failed message, and New message.
          await clearSnackBars(tester);
          await openMore(tester, 'navMessages');
          await tapAndSettle(tester, find.byKey(const Key('conversation-c1')));
          api.sendFails = true;
          await tester.enterText(find.byKey(const Key('messageField')), 'OK');
          await tester.pump();
          await tapAndSettle(tester, find.byKey(const Key('sendMessage')));
          await pop(tester);
          await tapAndSettle(tester, find.byKey(const Key('newMessageFab')));
          await tapAndSettle(tester, find.byKey(const Key('contact-s2')));
          await pop(tester); // the guardian sheet
          await tester.enterText(find.byKey(const Key('studentSearch')), 'bhav');
          await tester.pump();
          await tester.enterText(find.byKey(const Key('studentSearch')), 'nobody at all');
          await tester.pump();
          await pop(tester);

          // Recordings and the share dialog.
          await openMore(tester, 'navRecordings');
          await tapAndSettle(tester, find.byKey(const Key('share-r1')));
          await tapAndSettle(tester, find.byKey(const Key('confirmShare')));
          // Keep / Don't keep: kept, deleted on a date, and soon.
          await clearSnackBars(tester);
          for (final key in ['keep-r1', 'keep-r2']) {
            await Scrollable.ensureVisible(tester.element(find.byKey(Key(key))), alignment: 0.5);
            await tester.pumpAndSettle();
            await tapAndSettle(tester, find.byKey(Key(key)));
          }
          await tester.drag(find.byType(CustomScrollView).last, const Offset(0, -600));
          await tester.pumpAndSettle();

          // Profile, the language picker and the sign-out dialog.
          await clearSnackBars(tester);
          await openProfile(tester);
          await tapAndSettle(tester, find.byKey(const Key('languageSetting')));
          await pop(tester);
          await reveal(tester, const Key('openCalendar'));
          await tapAndSettle(tester, find.byKey(const Key('openCalendar')));
          await tester.drag(find.byType(CustomScrollView).last, const Offset(0, -600));
          await tester.pumpAndSettle();
          await pop(tester);
          await reveal(tester, const Key('openSyllabus'));
          await tapAndSettle(tester, find.byKey(const Key('openSyllabus')));
          await tapAndSettle(tester, find.byKey(const Key('syllabusClass-sec1-sub1')));
          await pop(tester);
          await pop(tester);
          await reveal(tester, const Key('signOut'));
          await tapAndSettle(tester, find.byKey(const Key('signOut')));
          await pop(tester);
        }, variant: TargetPlatformVariant.only(TargetPlatform.linux));

        testWidgets('$name: empty states and sign-in fit', (tester) async {
          phone(tester, size: size, textScale: scale);
          final api = FakeTeacherApi();
          seed(api, language: lang);
          api
            ..periodsByDate = {}
            ..homework = []
            ..recordings = []
            ..threads = [];
          api.assessmentRows.clear();
          await pumpApp(tester, api, prefs: {'token': 'tok'});
          api
            ..calendarEvents = []
            ..syllabusOutline = null;
          for (final tab in ['navHomework', 'navMarks', 'navMessages', 'navRecordings']) {
            await openMore(tester, tab);
          }
          await openMore(tester, 'navRecordings');
          await pop(tester);
          await openProfile(tester);
          await reveal(tester, const Key('openCalendar'));
          await tapAndSettle(tester, find.byKey(const Key('openCalendar')));
          expect(find.byKey(const Key('calendarEmpty')), findsOneWidget);
          await pop(tester);
          await reveal(tester, const Key('openSyllabus'));
          await tapAndSettle(tester, find.byKey(const Key('openSyllabus')));
          await tapAndSettle(tester, find.byKey(const Key('syllabusClass-sec1-sub1')));
          expect(find.byKey(const Key('syllabusUnlinked')), findsOneWidget);
          await pop(tester);
          await pop(tester);
          await pop(tester);

          // Signed out: the sign-in screen in the device language, with every error showing.
          tester.platformDispatcher.localesTestValue = [Locale(lang)];
          addTearDown(tester.platformDispatcher.clearLocalesTestValue);
          await pumpApp(tester, FakeTeacherApi(), prefs: {});
          await tapAndSettle(tester, find.byKey(const Key('signIn')));
          await tester.enterText(find.byKey(const Key('tenant')), 'demo college');
          await tester.enterText(find.byKey(const Key('login')), '98450');
          await tester.enterText(find.byKey(const Key('password')), 'wrong');
          await tester.ensureVisible(find.byKey(const Key('showServer')));
          await tapAndSettle(tester, find.byKey(const Key('showServer')));
          await tester.enterText(find.byKey(const Key('server')), 'nonsense');
          await tester.ensureVisible(find.byKey(const Key('signIn')));
          await tapAndSettle(tester, find.byKey(const Key('signIn')));
          await tester.enterText(find.byKey(const Key('tenant')), 'demo-college');
          await tester.enterText(find.byKey(const Key('login')), 'anita@demo.kinetix.in');
          await tester.enterText(find.byKey(const Key('server')), 'http://test');
          await tester.ensureVisible(find.byKey(const Key('signIn')));
          await tapAndSettle(tester, find.byKey(const Key('signIn')));
          expect(find.byKey(const Key('signInError')), findsOneWidget);

          // Sign in with phone: the number (with its errors), then the code, the countdown and a wrong code.
          await tester.ensureVisible(find.byKey(const Key('signInWithPhone')));
          await tapAndSettle(tester, find.byKey(const Key('signInWithPhone')));
          await tester.enterText(find.byKey(const Key('phone')), '12345');
          await tester.ensureVisible(find.byKey(const Key('sendCode')));
          await tapAndSettle(tester, find.byKey(const Key('sendCode')));
          expect(find.text(strings(lang).invalidMobileNumber), findsOneWidget);
          await tester.enterText(find.byKey(const Key('phone')), '9845012345');
          await tapAndSettle(tester, find.byKey(const Key('sendCode')));
          expect(find.byKey(const Key('otpSentTo')), findsOneWidget);
          await tester.ensureVisible(find.byKey(const Key('verifyCode')));
          await tapAndSettle(tester, find.byKey(const Key('verifyCode')));
          expect(find.text(strings(lang).enterOtp), findsOneWidget);
          await tester.enterText(find.byKey(const Key('otpCode')), '111111');
          await tester.pumpAndSettle();
          expect(find.byKey(const Key('signInError')), findsOneWidget);
          await tester.ensureVisible(find.byKey(const Key('changeNumber')));
          expect(find.byKey(const Key('resendCode')), findsOneWidget);
          await tester.pump(const Duration(seconds: 30));
          await tester.pumpAndSettle();
          await tapAndSettle(tester, find.byKey(const Key('resendCode')));
          await tester.pump(const Duration(seconds: 5));
        });
      }
    }
  }
}
