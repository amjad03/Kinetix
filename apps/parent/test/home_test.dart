import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_parent/core/models.dart';
import 'package:kinetix_parent/features/home/home_tab.dart';

import 'helpers.dart';

void main() {
  testWidgets('the attendance card shows the rate, counts and recent absences', (tester) async {
    await pumpApp(tester);
    final card = find.byKey(const Key('attendanceCard'));
    expect(find.descendant(of: card, matching: find.text('80%')), findsOneWidget);
    // Attended = present + late + excused.
    expect(find.descendant(of: card, matching: find.text('Attended 24 of 30 classes')), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('presentCount')), matching: find.text('22')), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('absentCount')), matching: find.text('6')), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('lateCount')), matching: find.text('2')), findsOneWidget);
    expect(find.text('Absent · Corporate Accounting · Thu 1 Oct, 10:00'), findsOneWidget);
    expect(find.text('Missed a few classes recently.'), findsOneWidget);
  });

  testWidgets('computes the rate when the server has none, and handles no attendance', (tester) async {
    await pumpApp(
      tester,
      setup: (api) {
        final s = api.summaries['c1']!;
        api.summaries['c1'] = ChildSummary(
          today: s.today,
          days: 30,
          attendance: AttendanceSummary(periods: 4, present: 2, absent: 1, late: 0, excused: 1, rate: null, recentAbsences: []),
          upcoming: [],
          pastHomework: [],
          participation: [],
          boards: [],
        );
      },
    );
    expect(find.text('75%'), findsOneWidget);
    expect(find.text('Nothing due right now. New homework from teachers will show here.'), findsOneWidget);
  });

  testWidgets('switches between children and remembers the choice', (tester) async {
    final (api, state) = await pumpApp(tester);
    expect(find.text("Here's how Aarav is doing"), findsOneWidget);
    expect(find.text('Aarav Patel'), findsOneWidget);

    await tester.tap(find.byKey(const Key('child-c2')));
    await tester.pumpAndSettle();
    expect(find.text("Here's how Diya is doing"), findsOneWidget);
    expect(find.text('Diya Patel'), findsOneWidget);
    expect(find.text('BCA Sem 1 A'), findsOneWidget);
    expect(find.text('100%'), findsOneWidget);
    expect(api.calls, containsAllInOrder(['summary c1', 'summary c2']));
    expect(state.prefs.getString('selected_child'), 'c2');
  });

  testWidgets('opens on the remembered child; one child hides the switcher', (tester) async {
    await pumpApp(tester, prefs: {'selected_child': 'c2'});
    expect(find.text('Diya Patel'), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
    await pumpApp(tester, setup: (api) => api.kids = [api.aarav]);
    expect(find.byKey(const Key('child-c1')), findsNothing);
    expect(find.text('Aarav Patel'), findsOneWidget);
  });

  testWidgets('homework shows due dates in words and opens the instructions', (tester) async {
    await pumpApp(tester);
    await tester.scrollUntilVisible(find.text('Cost sheet practice'), 200, scrollable: find.byType(Scrollable).first);
    expect(find.text('Due tomorrow'), findsOneWidget);
    expect(find.text('Due Fri 9 Oct'), findsOneWidget);
    // Past homework is collapsed.
    expect(find.text('Past homework (1)'), findsOneWidget);
    expect(find.text('Forfeiture of shares: notes'), findsNothing);

    await tester.tap(find.text('Exercise 4.2: Issue of shares'));
    await tester.pumpAndSettle();
    expect(find.text('Solve questions 1 to 5 from the textbook. Show journal entries for each.'), findsOneWidget);
    expect(find.text('Anita Sharma'), findsOneWidget);
  });

  testWidgets('attendance history groups marks by day', (tester) async {
    await pumpApp(tester);
    await tester.tap(find.text('See attendance history'));
    await tester.pumpAndSettle();
    expect(find.text("Aarav's attendance"), findsOneWidget);
    expect(find.text('Saturday, 3 October'), findsOneWidget);
    expect(find.text('Thursday, 1 October'), findsOneWidget);
    expect(find.text('Attended 1 of 2'), findsOneWidget);
    expect(find.text('Absent'), findsOneWidget);
    expect(find.text('Late'), findsOneWidget);

    await tester.tap(find.byKey(const Key('onlyMissed')));
    await tester.pumpAndSettle();
    expect(find.text('Saturday, 3 October'), findsNothing);
    expect(find.text('Thursday, 1 October'), findsOneWidget);
  });

  test('participation in plain language', () {
    Participation p(int c, int pa, int i, [int s = 0]) =>
        Participation(subject: 'Accounts', correct: c, partial: pa, incorrect: i, skipped: s);
    expect(ParticipationRow.sentence(en, p(5, 0, 0)), 'Answered 5 questions in Accounts, all correct.');
    expect(ParticipationRow.sentence(en, p(1, 0, 0)), 'Answered 1 question in Accounts correctly.');
    expect(ParticipationRow.sentence(en, p(4, 1, 0)), 'Answered 5 questions in Accounts, 4 correct and 1 partly correct.');
    expect(ParticipationRow.sentence(en, p(3, 1, 1)), 'Answered 5 questions in Accounts, 3 correct, 1 partly correct and 1 not correct.');
    expect(ParticipationRow.sentence(en, p(0, 0, 2, 1)), 'Answered 2 questions in Accounts, 2 not correct. Did not answer 1.');
    expect(ParticipationRow.sentence(en, p(0, 0, 0, 2)), 'Was asked 2 questions in Accounts but did not answer.');
  });

  testWidgets('the in-class card shows a sentence and a stacked bar', (tester) async {
    await pumpApp(tester);
    await tester.scrollUntilVisible(find.byKey(const Key('inClassCard')), 200, scrollable: find.byType(Scrollable).first);
    expect(find.text('Answered 5 questions in Corporate Accounting, 4 correct and 1 partly correct.', findRichText: true), findsOneWidget);
    expect(find.text('Partly correct'), findsOneWidget);
  });
}
