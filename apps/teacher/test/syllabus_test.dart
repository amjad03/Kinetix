// Syllabus progress: chapters and topics, a progress bar, marking topics as taught.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_teacher/core/api.dart';
import 'package:kinetix_teacher/core/models.dart';

import 'fake_api.dart';
import 'helpers.dart';

void main() {
  late FakeTeacherApi api;

  setUp(() {
    api = FakeTeacherApi()..today = '2026-10-05';
    api.periodsByDate = {
      '2026-10-05': [api.period(isNow: true)],
    };
  });

  Future<void> openFromToday(WidgetTester tester) async {
    phone(tester);
    await pumpApp(tester, api, prefs: {'token': 'tok'});
    await tester.ensureVisible(find.byKey(const Key('syllabus-slot1')));
    await tapAndSettle(tester, find.byKey(const Key('syllabus-slot1')));
  }

  Finder inTopic(String id, Finder f) => find.descendant(of: find.byKey(Key('topic-$id')), matching: f);

  testWidgets("a class's syllabus shows chapters, topics, progress and who taught what", (tester) async {
    await openFromToday(tester);
    expect(api.calls, containsAll(['syllabus sub1', 'coverage sec1 sub1']));
    expect(find.text('BCom Sem 3 A · Corporate Accounting'), findsOneWidget);
    expect(find.text('Corporate Accounting, BCom Semester 3'), findsOneWidget);
    expect(find.text('1 of 3 topics taught'), findsOneWidget);
    expect(find.text('33%'), findsOneWidget);
    expect(tester.widget<LinearProgressIndicator>(find.byType(LinearProgressIndicator)).value, closeTo(1 / 3, 0.001));
    expect(find.descendant(of: find.byKey(const Key('chapter-ch1')), matching: find.text('1/2')), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('chapter-ch2')), matching: find.text('0/1')), findsOneWidget);
    expect(inTopic('t1', find.text('Taught Mon, 28 Sept · Anita Sharma')), findsOneWidget);
    expect(tester.widget<Checkbox>(find.byKey(const Key('taught-t1'))).value, isTrue);
    expect(tester.widget<Checkbox>(find.byKey(const Key('taught-t2'))).value, isFalse);
  });

  testWidgets('tapping a topic marks it as taught today; tapping again unmarks it', (tester) async {
    await openFromToday(tester);
    await tapAndSettle(tester, find.byKey(const Key('topic-t2')));
    expect(api.calls, contains('mark sec1 sub1 t2 today'));
    expect(find.text('Marked as taught'), findsOneWidget);
    expect(find.text('2 of 3 topics taught'), findsOneWidget);
    expect(tester.widget<Checkbox>(find.byKey(const Key('taught-t2'))).value, isTrue);
    expect(inTopic('t2', find.textContaining('Anita Sharma')), findsOneWidget);

    await tapAndSettle(tester, find.byKey(const Key('taught-t1')));
    expect(api.calls, contains('unmark t1'));
    expect(find.text('Marked as not taught'), findsOneWidget);
    expect(find.text('1 of 3 topics taught'), findsOneWidget);
    expect(api.covered.keys, ['t2']);
  });

  testWidgets('a topic taught on an earlier day: the date picker', (tester) async {
    await openFromToday(tester);
    await tapAndSettle(tester, find.byKey(const Key('pickDate-t3')));
    expect(find.text('Taught on which day?'), findsOneWidget);
    // Today is preselected; pick the 1st of this month.
    await tapAndSettle(tester, find.text('1').last);
    await tapAndSettle(tester, find.text('OK'));
    final now = DateTime.now();
    expect(api.calls, contains('mark sec1 sub1 t3 ${isoDate(DateTime(now.year, now.month, 1))}'));
    expect(tester.widget<Checkbox>(find.byKey(const Key('taught-t3'))).value, isTrue);
  });

  testWidgets('when the server refuses, the tick goes back and the reason is shown in words', (tester) async {
    await openFromToday(tester);
    api.markError = ApiException(403, 'You do not teach this class', code: 'NOT_YOUR_CLASS');
    await tapAndSettle(tester, find.byKey(const Key('topic-t2')));
    expect(find.text('You do not teach this class'), findsOneWidget);
    expect(tester.widget<Checkbox>(find.byKey(const Key('taught-t2'))).value, isFalse);
    expect(find.text('1 of 3 topics taught'), findsOneWidget);

    api.markError = ApiException(400, 'A topic cannot be marked as taught in the future', code: 'COVERAGE_FUTURE_DATE');
    await tapAndSettle(tester, find.byKey(const Key('taught-t1')));
    expect(find.text('A topic cannot be marked as taught in the future'), findsOneWidget);
    expect(tester.widget<Checkbox>(find.byKey(const Key('taught-t1'))).value, isTrue);
  });

  testWidgets('Profile → Syllabus progress lists the classes; an unlinked subject says so', (tester) async {
    api.syllabusOutline = null;
    phone(tester);
    await pumpApp(tester, api, prefs: {'token': 'tok'});
    await tapAndSettle(tester, find.byKey(const Key('profileButton')));
    await tester.scrollUntilVisible(find.byKey(const Key('openSyllabus')), 200, scrollable: find.byType(Scrollable).last);
    await tapAndSettle(tester, find.byKey(const Key('openSyllabus')));
    expect(find.text('Syllabus progress'), findsWidgets);
    await tapAndSettle(tester, find.byKey(const Key('syllabusClass-sec1-sub1')));
    expect(find.byKey(const Key('syllabusUnlinked')), findsOneWidget);
    expect(find.byType(LinearProgressIndicator), findsNothing);
  });

  testWidgets('in Kannada', (tester) async {
    api.useLanguage('kn');
    await openFromToday(tester);
    final s = strings('kn');
    expect(find.text(s.syllabus), findsWidgets);
    expect(find.text(s.topicsTaught(1, 3)), findsOneWidget);
    expect(inTopic('t1', find.textContaining('Anita Sharma')), findsOneWidget);
    expect(find.textContaining('Taught'), findsNothing);
  });
}
