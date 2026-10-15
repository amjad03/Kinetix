// My course outcomes (CO-wise attainment) and the course exit survey nudge.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zynetix_student/core/api.dart';
import 'package:zynetix_student/core/campus_life.dart';
import 'package:zynetix_student/core/outcomes.dart';
import 'package:zynetix_student/features/campus/outcomes_screen.dart';
import 'package:zynetix_student/l10n/l10n.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import 'fake_api.dart';

Widget host(Widget child, {Locale locale = const Locale('en')}) => MaterialApp(
  theme: ZynetixTheme.light(),
  locale: locale,
  supportedLocales: AppLocalizations.supportedLocales,
  localizationsDelegates: appLocalizationsDelegates,
  home: child,
);

void phone(WidgetTester tester) {
  tester.view.physicalSize = const Size(412, 1400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

const _exit = MySurvey(
  id: 'ex1',
  title: 'Course exit survey: Corporate Accounting',
  description: '',
  anonymous: true,
  answered: false,
  questions: [],
  obeKind: 'course_exit',
);

void main() {
  test('reads the outcomes and counts reached COs', () {
    final o = MyOutcomes.fromJson({
      'student': {'id': 's'},
      'courses': [
        {
          'subjectId': 'sub',
          'code': 'BC 1',
          'name': 'Accounts',
          'threshold': 60,
          'cos': [
            {
              'coId': 'a',
              'code': 'CO1',
              'statement': 'x',
              'cie': 70,
              'see': '65.5',
              'overall': 67.3,
              'attained': true,
              'classLevel': 2.4,
              'target': 2,
            },
            {
              'coId': 'b',
              'code': 'CO2',
              'statement': 'y',
              'cie': null,
              'see': null,
              'overall': null,
              'attained': null,
              'classLevel': null,
              'target': 2,
            },
          ],
        },
      ],
    });
    final c = o.courses.single;
    expect((c.attained, c.measured, c.cos.first.see, c.cos.last.overall), (1, 1, 65.5, null));
    expect((pctText(60), pctText(67.25), pctText(51.14)), ('60', '67.3', '51.1'));
    expect(MySurvey.fromJson({'id': 'x', 'title': 't', 'obeKind': 'programme_exit'}).isExitSurvey, isTrue);
    expect(MySurvey.fromJson({'id': 'x', 'title': 't'}).isExitSurvey, isFalse);
  });

  testWidgets('shows each CO reached, not reached or still unmeasured, with internal and end-semester parts', (tester) async {
    phone(tester);
    final api = FakeStudentApi();
    await tester.pumpWidget(host(OutcomesScreen(api: api)));
    await tester.pumpAndSettle();
    expect(find.text('BCOM-3.1 Corporate Accounting'), findsOneWidget);
    expect(find.text('1 of 2 COs reached · threshold 60%'), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('outcomeCo-co1')), matching: find.text('Reached')), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('outcomeCo-co2')), matching: find.text('Not yet reached')), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('outcomeCo-co3')), matching: find.text('No marks yet')), findsOneWidget);
    expect(find.text('Internal 78% · End-semester 70% · Class level 2.60 (target 2)'), findsOneWidget);
    expect(find.text('Internal 55% · End-semester 48.5% · Class level 1.80 (target 2)'), findsOneWidget);
    // No open exit survey: no nudge.
    expect(find.byKey(const Key('exitSurveyNudge')), findsNothing);
  });

  testWidgets('an open course exit survey is offered and opens the surveys', (tester) async {
    phone(tester);
    final api = FakeStudentApi()..surveyList = [_exit];
    await tester.pumpWidget(host(OutcomesScreen(api: api)));
    await tester.pumpAndSettle();
    expect(find.text('One course exit survey is open: tell us how well the course outcomes were met'), findsOneWidget);
    await tester.tap(find.byKey(const Key('exitSurveyNudge')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('surveyExit-ex1')), findsOneWidget);
    expect(find.text('Course exit survey'), findsOneWidget);
  });

  testWidgets('in Hindi, with nothing to show yet', (tester) async {
    phone(tester);
    final api = FakeStudentApi()..outcomes = const MyOutcomes(courses: []);
    await tester.pumpWidget(host(OutcomesScreen(api: api), locale: const Locale('hi')));
    await tester.pumpAndSettle();
    expect(find.text('इस वर्ष दिखाने के लिए अभी कोई कोर्स परिणाम नहीं है।'), findsOneWidget);
  });

  testWidgets('an error offers a retry', (tester) async {
    phone(tester);
    final api = FakeStudentApi()..outcomesError = ApiException(500, 'boom');
    await tester.pumpWidget(host(OutcomesScreen(api: api)));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('outcomeCourse-sub1')), findsNothing);
    api.outcomesError = null;
    await tester.tap(find.text(lookupAppLocalizations(const Locale('en')).retry));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('outcomeCourse-sub1')), findsOneWidget);
  });
}
