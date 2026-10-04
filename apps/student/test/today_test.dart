import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_lesson/kinetix_lesson.dart';
import 'package:kinetix_student/core/api.dart';
import 'package:kinetix_student/core/models.dart';
import 'package:kinetix_student/features/today/today_tab.dart';

import 'helpers.dart';

void main() {
  testWidgets('greets the student with their class and roll number', (tester) async {
    await pumpApp(tester);
    expect(find.textContaining(', Aarav'), findsOneWidget);
    expect(find.text('BCom Sem 3 A · Roll no. U03BC001'), findsOneWidget);
  });

  testWidgets('the attendance card shows the rate, counts, a note and recent absences', (tester) async {
    await pumpApp(tester);
    final card = find.byKey(const Key('attendanceCard'));
    expect(find.descendant(of: card, matching: find.text('80%')), findsOneWidget);
    expect(find.descendant(of: card, matching: find.text('Attended 24 of 30 classes')), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('absentCount')), matching: find.text('6')), findsOneWidget);
    expect(find.text('You missed a few classes recently.'), findsOneWidget);
    expect(find.text('Absent · Corporate Accounting · Thu 1 Oct, 10:00'), findsOneWidget);
  });

  test('attendance notes in plain language', () {
    expect(AttendanceCard.note(92), 'Good attendance. Keep it up.');
    expect(AttendanceCard.note(80), 'You missed a few classes recently.');
    expect(AttendanceCard.note(60), 'Below 75%. Colleges usually need 75% for you to sit exams.');
  });

  testWidgets('works out the rate when the server has none; empty homework and boards explain themselves', (tester) async {
    await pumpApp(
      tester,
      setup: (api) => api.studentSummary = StudentSummary(
        today: DateTime(2026, 10, 4),
        days: 30,
        attendance: AttendanceSummary(periods: 4, present: 2, absent: 1, late: 0, excused: 1, rate: null, recentAbsences: []),
        upcoming: [],
        pastHomework: [],
        boards: [],
      ),
    );
    expect(find.text('75%'), findsOneWidget);
    expect(find.text('Nothing due right now. New homework from your teachers will show here.'), findsOneWidget);
    await scrollTo(tester, find.byKey(const Key('boardsCard')));
    expect(find.text('When a teacher shares the class board after a lesson, it appears here so you can revise.'), findsOneWidget);
    expect(find.text('When a teacher records a lesson on the board and shares it, you can watch it again here.'), findsOneWidget);
  });

  testWidgets('no attendance yet says so', (tester) async {
    await pumpApp(
      tester,
      setup: (api) => api.studentSummary = StudentSummary(
        today: DateTime(2026, 10, 4),
        days: 30,
        attendance: AttendanceSummary(periods: 0, present: 0, absent: 0, late: 0, excused: 0, rate: null, recentAbsences: []),
        upcoming: [],
        pastHomework: [],
        boards: [],
      ),
    );
    expect(find.text('No attendance has been taken for you in the last 30 days.'), findsOneWidget);
  });

  testWidgets('a failed load shows the error with Retry', (tester) async {
    final (api, _) = await pumpApp(tester, setup: (api) => api.summaryError = ApiException(0, "Can't reach KINETIX."));
    expect(find.text("Can't reach KINETIX."), findsOneWidget);
    api.summaryError = null;
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('attendanceCard')), findsOneWidget);
  });

  testWidgets('homework due soon in words, past collapsed, detail with instructions', (tester) async {
    await pumpApp(tester);
    await scrollTo(tester, find.text('Past homework (1)'));
    expect(find.text('Cost sheet practice'), findsOneWidget);
    expect(find.text('Due tomorrow'), findsOneWidget);
    expect(find.text('Due Fri 9 Oct'), findsOneWidget);
    expect(find.text('Past homework (1)'), findsOneWidget);
    expect(find.text('Forfeiture of shares: notes'), findsNothing);

    await tester.ensureVisible(find.byKey(const Key('homework-h1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('homework-h1')));
    await tester.pumpAndSettle();
    expect(find.text('Solve questions 1 to 5 from the textbook. Show journal entries for each.'), findsOneWidget);
    expect(find.text('Corporate Accounting · BCom Sem 3 A'), findsOneWidget);
    expect(find.text('Anita Sharma'), findsOneWidget);
  });

  testWidgets('attendance history groups marks by day and filters absences', (tester) async {
    final (api, _) = await pumpApp(tester);
    await tester.tap(find.text('See attendance history'));
    await tester.pumpAndSettle();
    expect(api.calls, contains('attendance s1'));
    expect(find.text('Your attendance'), findsOneWidget);
    expect(find.text('Saturday, 3 October'), findsOneWidget);
    expect(find.text('Attended 1 of 2'), findsOneWidget);
    await tester.tap(find.byKey(const Key('onlyMissed')));
    await tester.pumpAndSettle();
    expect(find.text('Saturday, 3 October'), findsNothing);
    expect(find.text('Thursday, 1 October'), findsOneWidget);
  });

  testWidgets('recordings: missed first, plays in the lesson player', (tester) async {
    final (api, _) = await pumpApp(tester);
    final card = find.byKey(const Key('recordingsCard'));
    await scrollTo(tester, card);
    expect(find.descendant(of: card, matching: find.text('1 missed')), findsOneWidget);
    final missed = tester.getTopLeft(find.byKey(const Key('recording-r2')));
    final other = tester.getTopLeft(find.byKey(const Key('recording-r1')));
    expect(missed.dy, lessThan(other.dy));
    expect(find.descendant(of: find.byKey(const Key('recording-r2')), matching: find.text('You missed this class')), findsOneWidget);

    await tester.tap(find.byKey(const Key('recording-r2')));
    await tester.pumpAndSettle();
    expect(api.calls, containsAll(['recording r2', 'lesson r2']));
    expect(find.byType(LessonView), findsOneWidget);
    expect(find.text('Shares can be issued at par or at a premium'), findsOneWidget);
    await tester.tap(find.byKey(const Key('lessonPlay')));
    await tester.pump();
    await tester.pump(const Duration(seconds: 2));
    await tester.pump(const Duration(milliseconds: 16));
    expect(tester.widget<LessonView>(find.byType(LessonView)).player.strokes, hasLength(1));
  });

  testWidgets('more than three recordings: see all', (tester) async {
    await pumpApp(
      tester,
      setup: (api) => api.recordings
        ..clear()
        ..addAll([for (var i = 0; i < 5; i++) RecordingInfo.fromJson(api.recordingJsonOf('x$i', missed: i == 4))]),
    );
    await scrollTo(tester, find.text('See all 5 recordings'));
    expect(find.byKey(const Key('recording-x3')), findsNothing);
    await tester.tap(find.text('See all 5 recordings'));
    await tester.pumpAndSettle();
    expect(find.text('Lesson recordings'), findsWidgets);
    expect(find.byKey(const Key('recording-x3')), findsOneWidget);
  });

  testWidgets('a shared board opens in the read-only viewer and pages', (tester) async {
    final (api, _) = await pumpApp(tester);
    await scrollTo(tester, find.byKey(const Key('board-wb1')));
    expect(find.text("Today's board: Corporate Accounting"), findsOneWidget);
    await tester.tap(find.byKey(const Key('board-wb1')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('board wb1'));
    expect(find.text('Page 1 of 2'), findsOneWidget);
    await tester.tap(find.byKey(const Key('nextPage')));
    await tester.pumpAndSettle();
    expect(find.text('Page 2 of 2'), findsOneWidget);
  });

  testWidgets('"Stuck on something?" opens Learn on Ask a doubt', (tester) async {
    await pumpApp(tester);
    await scrollTo(tester, find.byKey(const Key('askCard')));
    await tester.tap(find.byKey(const Key('askCard')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('question')), findsOneWidget);
    expect(find.text('Ask a doubt'), findsWidgets);
  });
}
