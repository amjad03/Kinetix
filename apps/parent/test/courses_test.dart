// A child's course grades.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_parent/features/courses/courses_screen.dart';
import 'package:kinetix_parent/l10n/l10n.dart';
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
  testWidgets("shows the child's courses with grade and the breakdown", (tester) async {
    final api = FakeParentApi();
    await tester.pumpWidget(host(CoursesScreen(api: api, child: api.aarav)));
    await tester.pumpAndSettle();
    expect(find.text('Grades: Aarav'), findsOneWidget);
    expect(find.text('A · 82%'), findsOneWidget);
    await tapAndSettleOn(tester, find.byKey(const Key('course-c1')));
    expect(api.calls, contains('lmsCourse c1'));
    expect(find.text('Homework (40%)'), findsOneWidget);
    expect(find.text('Decimals'), findsOneWidget);
  });
}
