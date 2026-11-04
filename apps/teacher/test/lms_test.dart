// The LMS on the teacher's phone (Profile → Courses): content, live classes with attendance from joins, students
// at risk, the moderation queue, and quizzes with flagged attempts, hand marking and the push to internal marks.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zynetix_teacher/core/lms_models.dart';
import 'package:zynetix_teacher/features/work/lms_screens.dart';

import 'fake_api.dart';
import 'helpers.dart';

void main() {
  late FakeTeacherApi api;
  setUp(() {
    api = FakeTeacherApi();
    seed(api);
  });

  test('parses the API shapes', () {
    final a = TeacherQuizAttempt.fromJson({'id': 'a1', 'fullName': 'Ravi', 'rollNo': 'R1', 'score': 3, 'maxScore': 10, 'violations': 6, 'flagged': true, 'results': {'q1': {'correct': true, 'marks': 2}, 'q2': {'correct': null, 'marks': 0}}});
    expect(a.unmarked, ['q2']);
    expect(a.flagged, isTrue);
    final q = ModerationRow.fromQueue({'threads': [{'id': 't1', 'title': 'Doubt', 'body': 'x', 'author': 'A', 'held': true, 'reports': 0}], 'posts': [{'id': 'p1', 'body': 'y', 'author': 'B', 'held': false, 'reports': 2}]});
    expect(q.map((r) => '${r.kind}:${r.held}:${r.reports}'), ['thread:true:0', 'post:false:2']);
  });

  testWidgets('adds a lesson page, takes attendance from joins and approves a held post', (tester) async {
    phone(tester);
    await tester.pumpWidget(localizedApp(home: LmsCoursesScreen(api: api)));
    await tester.pumpAndSettle();
    expect(find.text('Financial Accounting (BCom Sem 3 A)'), findsOneWidget);
    await tester.tap(find.byKey(const Key('lmsCourse-lc1')));
    await tester.pumpAndSettle();
    expect(find.text('Unit 1 summary'), findsOneWidget);
    await tester.tap(find.byKey(const Key('lmsAddPage-m1')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('lmsField0')), 'Depreciation methods');
    await tester.enterText(find.byKey(const Key('lmsField1')), 'Straight line and written down value.');
    await tester.tap(find.byKey(const Key('lmsSave')));
    await tester.pumpAndSettle();
    expect(api.lmsActions, contains('page m1 Depreciation methods'));
    // Live classes: the joins become attendance.
    await tester.tap(find.text('Live'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('lmsAttendance-lv1')));
    await tester.pumpAndSettle();
    expect(find.text('Absent'), findsOneWidget);
    await tester.tap(find.byKey(const Key('lmsSaveAttendance')));
    await tester.pumpAndSettle();
    expect(api.lmsActions.last, 'attendance lv1 s1:present,s9:absent');
    // At risk: only students with a reason are listed.
    await tester.tap(find.textContaining('At risk'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('lmsRisk-s9')), findsOneWidget);
    expect(find.byKey(const Key('lmsRisk-s1')), findsNothing);
    expect(find.textContaining('inactive, opens little, low quiz scores'), findsOneWidget);
    await tester.ensureVisible(find.byType(Tab).at(3));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(Tab).at(3));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('lmsApprove-fp1')));
    await tester.pumpAndSettle();
    expect(api.lmsActions.last, 'moderate post fp1 approve');
  });

  testWidgets('shows flagged quiz attempts, marks an answer and pushes marks', (tester) async {
    phone(tester);
    await tester.pumpWidget(localizedApp(home: LmsCoursesScreen(api: api)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Quizzes'));
    await tester.pumpAndSettle();
    expect(find.textContaining('1 to mark · 3 flagged'), findsOneWidget);
    await tester.tap(find.byKey(const Key('lmsQuiz-q1')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Left the quiz 6 times'), findsOneWidget);
    await tester.tap(find.byKey(const Key('lmsMark-qa2')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('lmsMarks')), '1.5');
    await tester.tap(find.byKey(const Key('lmsSaveMarks')));
    await tester.pumpAndSettle();
    expect(api.lmsActions, contains('mark qa2 qq5 1.5'));
    await tester.tap(find.byKey(const Key('lmsPush')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Sent for 60 students (8 absent)'), findsOneWidget);
  });

  testWidgets('fits a phone in Hindi and Kannada', (tester) async {
    phone(tester);
    for (final lang in ['hi', 'kn']) {
      await tester.pumpWidget(localizedApp(language: lang, home: LmsCourseScreen(key: Key(lang), api: api, course: api.lmsCourseList.first)));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    }
  });
}
