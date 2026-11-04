// A child's course grades.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zynetix_parent/features/courses/courses_screen.dart';
import 'package:zynetix_parent/l10n/l10n.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import 'fake_api.dart';

Widget host(Widget child) => MaterialApp(
  theme: ZynetixTheme.light(),
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

  testWidgets("shows the child's progress, activity, certificates and why a course needs attention", (tester) async {
    final api = FakeParentApi();
    await tester.pumpWidget(host(CoursesScreen(api: api, child: api.aarav)));
    await tester.pumpAndSettle();
    expect(api.calls, contains('lmsSummary ${api.aarav.id}'));
    expect(find.text('1 completion certificate earned'), findsOneWidget);
    expect(find.textContaining('4 of 10 done'), findsOneWidget);
    expect(find.textContaining('Live classes: 0 of 2'), findsOneWidget);
    expect(find.text('Needs attention: not active lately, homework overdue, missing live classes'), findsOneWidget);
  });

  testWidgets('shows the grade beside the progress and flags only the course that needs attention', (tester) async {
    final api = FakeParentApi();
    await tester.pumpWidget(host(CoursesScreen(api: api, child: api.aarav)));
    await tester.pumpAndSettle();
    expect(find.text('A · 82%'), findsOneWidget);
    expect(find.byKey(const Key('attention-c1')), findsOneWidget);
  });
}
