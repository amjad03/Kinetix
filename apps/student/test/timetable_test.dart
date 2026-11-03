import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zynetix_student/core/api.dart';
import 'package:zynetix_student/core/models.dart';
import 'package:zynetix_student/features/timetable/timetable_screen.dart';
import 'package:zynetix_student/l10n/app_localizations.dart';

import 'fake_api.dart';
import 'helpers.dart';

Future<FakeStudentApi> pumpScreen(WidgetTester tester, {Locale locale = const Locale('en'), void Function(FakeStudentApi)? setup}) async {
  final api = FakeStudentApi();
  setup?.call(api);
  final froms = <DateTime?>[];
  await tester.pumpWidget(
    MaterialApp(
      locale: locale,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: TimetableScreen(
        load: (from) {
          froms.add(from);
          return api.timetable('st1', from: from);
        },
        now: () => DateTime(2026, 10, 5, 9, 20),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return api;
}

void main() {
  testWidgets('opens on today with the period on now, a substitute, the lab batch', (tester) async {
    await pumpScreen(tester);
    expect(find.text('Corporate Accounting'), findsOneWidget);
    // 09:20 is inside the first period.
    expect(find.textContaining('Now'), findsOneWidget);
    expect(find.text('Dr. Meera Rao (for Prof. Anil Shetty) · Room 101'), findsOneWidget);
    expect(find.text('Ms. Kavya N · Computer lab 1 · Batch B1'), findsOneWidget);
  });

  testWidgets('shows the elective and extra class on another day, the holiday, and a day that follows Monday', (tester) async {
    await pumpScreen(tester);
    await tester.ensureVisible(find.byKey(const Key('ttDay2')));
    await tester.tap(find.byKey(const Key('ttDay2')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Elective'), findsOneWidget);
    expect(find.textContaining('Extra class'), findsOneWidget);
    await tester.ensureVisible(find.byKey(const Key('ttDay5')));
    await tester.tap(find.byKey(const Key('ttDay5')));
    await tester.pumpAndSettle();
    expect(find.text('Holiday: Dasara. There are no classes.'), findsOneWidget);
    await tester.ensureVisible(find.byKey(const Key('ttDay6')));
    await tester.tap(find.byKey(const Key('ttDay6')));
    await tester.pumpAndSettle();
    expect(find.text("This working day follows Monday's timetable."), findsOneWidget);
    await tester.ensureVisible(find.byKey(const Key('ttDay3')));
    await tester.tap(find.byKey(const Key('ttDay3')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('ttEmpty')), findsOneWidget);
  });

  testWidgets('reads the next week and says when the timetable cannot be loaded', (tester) async {
    final api = await pumpScreen(tester);
    api.timetableError = ApiException(0, 'offline');
    await tester.tap(find.byKey(const Key('ttNextWeek')));
    await tester.pumpAndSettle();
    expect(api.calls.where((c) => c == 'timetable'), hasLength(2));
    expect(find.byKey(const Key('ttPeriod09:00')), findsNothing);
  });

  testWidgets('speaks Kannada', (tester) async {
    await pumpScreen(tester, locale: const Locale('kn'));
    await tester.ensureVisible(find.byKey(const Key('ttDay5')));
    await tester.tap(find.byKey(const Key('ttDay5')));
    await tester.pumpAndSettle();
    expect(find.text('ರಜೆ: Dasara. ತರಗತಿಗಳು ಇರುವುದಿಲ್ಲ.'), findsOneWidget);
  });

  testWidgets('is reached from More', (tester) async {
    await pumpApp(tester);
    await openTab(tester, 'Profile');
    await scrollTo(tester, find.byKey(const Key('openTimetable')));
    await tester.tap(find.byKey(const Key('openTimetable')));
    await tester.pumpAndSettle();
    expect(find.byType(TimetableScreen), findsOneWidget);
  });

  test('parses a day of the API', () {
    final w = TimetableWeek.fromJson(FakeStudentApi().timetableJson);
    expect(w.days, hasLength(7));
    expect(w.days[5].follows, 1);
    expect(w.days[0].periods[1].usualTeacher, 'Prof. Anil Shetty');
    expect(w.days[1].periods[1].special, isTrue);
  });
}
