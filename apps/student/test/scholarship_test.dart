// Scholarships: schemes open for applications, applying (income test) and earlier applications.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_student/core/api.dart';
import 'package:kinetix_student/features/fees/scholarship_screen.dart';
import 'package:kinetix_student/l10n/l10n.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'fake_api.dart';

Widget host(Widget child) => MaterialApp(
  theme: KinetixTheme.light(),
  locale: const Locale('en'),
  supportedLocales: AppLocalizations.supportedLocales,
  localizationsDelegates: appLocalizationsDelegates,
  home: child,
);

Future<void> tapAndSettleOn(WidgetTester tester, Finder f) async {
  await tester.tap(f);
  await tester.pumpAndSettle();
}

void main() {
  late FakeStudentApi api;
  setUp(() => api = FakeStudentApi());

  testWidgets('lists schemes, requires the income, applies and shows the pending application', (tester) async {
    await tester.pumpWidget(host(ScholarshipScreen(api: api, studentId: 's1')));
    await tester.pumpAndSettle();
    expect(find.text('Merit scholarship'), findsOneWidget);
    expect(find.text('25% off your fees'), findsOneWidget);
    expect(find.text('Needs at least 75% in published marks'), findsOneWidget);
    await tapAndSettleOn(tester, find.byKey(const Key('apply-sc1')));
    await tapAndSettleOn(tester, find.byKey(const Key('sendScholarship')));
    expect(find.text('Enter the family income as a number.'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('scholarshipIncome')), '300000');
    await tapAndSettleOn(tester, find.byKey(const Key('sendScholarship')));
    expect(api.calls, contains('applyScholarship sc1 30000000 '));
    expect(find.text('Application sent to the accounts office.'), findsOneWidget);
    expect(find.byKey(const Key('application-sa1')), findsOneWidget);
    expect(find.text('Waiting'), findsOneWidget);
  });

  testWidgets('shows the server reason when not eligible', (tester) async {
    api.scholarshipError = ApiException(400, 'This scholarship needs at least 75% in published marks');
    await tester.pumpWidget(host(ScholarshipScreen(api: api, studentId: 's1')));
    await tester.pumpAndSettle();
    expect(find.text('Retry'), findsOneWidget);
  });
}
