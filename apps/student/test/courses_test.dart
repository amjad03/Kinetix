// My Learning > Courses: published courses, modules and the running grade.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_student/core/api.dart';
import 'package:kinetix_student/features/learn/courses_view.dart';
import 'package:kinetix_student/l10n/l10n.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'fake_api.dart';

Widget host(Widget child) => MaterialApp(
  theme: KinetixTheme.light(),
  locale: const Locale('en'),
  supportedLocales: AppLocalizations.supportedLocales,
  localizationsDelegates: appLocalizationsDelegates,
  home: Scaffold(body: child),
);

Future<void> tapAndSettleOn(WidgetTester tester, Finder f) async {
  await tester.tap(f);
  await tester.pumpAndSettle();
}

void main() {
  late FakeStudentApi api;
  setUp(() => api = FakeStudentApi());

  testWidgets('lists courses with the grade and opens modules and the breakdown', (tester) async {
    await tester.pumpWidget(host(CoursesView(api: api, studentId: 's1')));
    await tester.pumpAndSettle();
    expect(find.text('Mathematics 7 B'), findsOneWidget);
    expect(find.text('2 modules'), findsOneWidget);
    expect(find.text('A · 82%'), findsOneWidget);
    await tapAndSettleOn(tester, find.byKey(const Key('course-c1')));
    expect(api.calls, contains('lmsCourse c1'));
    expect(find.text('Fractions'), findsOneWidget);
    expect(find.text('topic · Adding fractions'), findsOneWidget);
    expect(find.text('Tests (60%)'), findsOneWidget);
    expect(find.text('Unit test on Friday'), findsOneWidget);
  });

  testWidgets('empty and failing states', (tester) async {
    api.lmsCourseList = [];
    await tester.pumpWidget(host(CoursesView(api: api, studentId: 's1')));
    await tester.pumpAndSettle();
    expect(find.textContaining('No courses yet'), findsOneWidget);
    api.lmsError = ApiException(0, '', problem: ApiProblem.unreachable);
    await tester.drag(find.byType(ListView), const Offset(0, 400));
    await tester.pumpAndSettle();
    expect(find.text('Retry'), findsOneWidget);
  });
}
