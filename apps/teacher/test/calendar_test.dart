// Holidays on Today and the academic calendar (Profile → Calendar).
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fake_api.dart';
import 'helpers.dart';

void main() {
  late FakeTeacherApi api;

  setUp(() {
    api = FakeTeacherApi()
      ..today = '2026-10-02'
      ..holidays = {'2026-10-02': 'Gandhi Jayanti'};
    api.periodsByDate = {
      '2026-10-05': [api.period()],
    };
  });

  testWidgets('on a holiday Today says so and shows the next teaching day', (tester) async {
    phone(tester);
    await pumpApp(tester, api, prefs: {'token': 'tok'});
    expect(find.byKey(const Key('holidayCard')), findsOneWidget);
    expect(find.text('Holiday: Gandhi Jayanti. No classes.'), findsOneWidget);
    expect(find.text('No classes today'), findsNothing);
    // The next teaching day (holidays skipped) is shown below.
    expect(find.text("Monday's classes"), findsOneWidget);
    expect(find.text('Corporate Accounting'), findsOneWidget);
  });

  testWidgets('choosing a holiday shows the holiday card and a way to the next teaching day', (tester) async {
    api
      ..today = '2026-10-01'
      ..periodsByDate = {
        '2026-10-01': [api.period()],
        '2026-10-05': [api.period()],
      };
    phone(tester);
    await pumpApp(tester, api, prefs: {'token': 'tok'});
    expect(find.byKey(const Key('holidayCard')), findsNothing);
    await tester.tap(find.text('2').hitTestable().first);
    await tester.pumpAndSettle();
    expect(find.text('Holiday: Gandhi Jayanti. No classes.'), findsOneWidget);
    await tapAndSettle(tester, find.byKey(const Key('showNextTeachingDay')));
    expect(find.byKey(const Key('holidayCard')), findsNothing);
    expect(find.text('Corporate Accounting'), findsOneWidget);
  });

  testWidgets('Profile → Calendar lists holidays, exams and events by month', (tester) async {
    phone(tester);
    await pumpApp(tester, api, prefs: {'token': 'tok'});
    await openProfile(tester);
    await tester.scrollUntilVisible(find.byKey(const Key('openCalendar')), 200, scrollable: find.byType(Scrollable).last);
    await tapAndSettle(tester, find.byKey(const Key('openCalendar')));
    expect(api.calls, contains('calendar'));
    expect(find.text('October 2026'), findsOneWidget);
    expect(find.text('November 2026'), findsOneWidget);
    final exams = find.byKey(const Key('event-e2'));
    expect(find.descendant(of: exams, matching: find.text('Mid-semester exams')), findsOneWidget);
    expect(find.descendant(of: exams, matching: find.text('Exam')), findsOneWidget);
    expect(find.descendant(of: exams, matching: find.text('Mon, 12 Oct – Fri, 16 Oct')), findsOneWidget);
    expect(find.descendant(of: exams, matching: find.text('For BCom, BBA')), findsOneWidget);
    final holiday = find.byKey(const Key('event-e1'));
    expect(find.descendant(of: holiday, matching: find.text('Holiday')), findsOneWidget);
    expect(find.descendant(of: holiday, matching: find.text('Fri, 2 Oct')), findsOneWidget);
  });

  testWidgets('the calendar in Hindi', (tester) async {
    api.useLanguage('hi');
    phone(tester);
    await pumpApp(tester, api, prefs: {'token': 'tok'});
    final s = strings('hi');
    expect(find.text(s.holidayNoClasses('Gandhi Jayanti')), findsOneWidget);
    await openProfile(tester);
    await tester.scrollUntilVisible(find.byKey(const Key('openCalendar')), 200, scrollable: find.byType(Scrollable).last);
    await tapAndSettle(tester, find.byKey(const Key('openCalendar')));
    expect(find.text(s.calendarExam), findsOneWidget);
    expect(find.text(s.calendarHoliday), findsNWidgets(2));
    expect(find.textContaining('October'), findsNothing);
  });
}
