import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zynetix_parent/features/timetable/timetable_screen.dart';
import 'package:zynetix_parent/l10n/app_localizations.dart';

import 'fake_api.dart';
import 'helpers.dart';

void main() {
  Future<FakeParentApi> pumpScreen(WidgetTester tester, {Locale locale = const Locale('en')}) async {
    final api = FakeParentApi();
    await tester.pumpWidget(
      MaterialApp(
        locale: locale,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: TimetableScreen(load: (from) => api.timetable('c1', from: from), title: "Aarav's timetable", now: () => DateTime(2026, 10, 5, 13, 40)),
      ),
    );
    await tester.pumpAndSettle();
    return api;
  }

  testWidgets("a parent sees the child's day: the lab on now for their batch, the substitute, then a holiday", (tester) async {
    await pumpScreen(tester);
    expect(find.text("Aarav's timetable"), findsOneWidget);
    expect(find.text('Ms. Kavya N · Computer lab 1 · Now · Batch B1'), findsOneWidget);
    expect(find.text('Dr. Meera Rao (for Prof. Anil Shetty) · Room 101'), findsOneWidget);
    await tester.ensureVisible(find.byKey(const Key('ttDay5')));
    await tester.tap(find.byKey(const Key('ttDay5')));
    await tester.pumpAndSettle();
    expect(find.text('Holiday: Dasara. There are no classes.'), findsOneWidget);
  });

  testWidgets('in Hindi', (tester) async {
    await pumpScreen(tester, locale: const Locale('hi'));
    await tester.ensureVisible(find.byKey(const Key('ttDay6')));
    await tester.tap(find.byKey(const Key('ttDay6')));
    await tester.pumpAndSettle();
    expect(find.textContaining('समय-सारिणी चलेगी'), findsOneWidget);
  });

  testWidgets('each child has a timetable entry under More', (tester) async {
    await pumpApp(tester);
    await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text('More')));
    await tester.pumpAndSettle();
    final list = find.byType(Scrollable).last;
    await tester.scrollUntilVisible(find.text("Aarav's timetable"), 200, scrollable: list);
    await tester.scrollUntilVisible(find.text("Diya's timetable"), 200, scrollable: list);
    await tester.scrollUntilVisible(find.text("Aarav's timetable"), -200, scrollable: list);
    await tester.tap(find.text("Aarav's timetable"));
    await tester.pumpAndSettle();
    expect(find.byType(TimetableScreen), findsOneWidget);
    expect(find.text('Corporate Accounting'), findsOneWidget);
  });
}
