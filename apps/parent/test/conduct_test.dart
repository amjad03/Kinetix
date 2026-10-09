// Activities, behaviour and notices, the school's visibility switches, and the report card details.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_parent/core/api.dart';
import 'package:kinetix_parent/core/conduct.dart';
import 'package:kinetix_parent/core/growth.dart';
import 'package:kinetix_parent/core/models.dart';
import 'package:kinetix_parent/features/exams/report_card_screen.dart';
import 'package:kinetix_parent/features/school_life/conduct_screens.dart';
import 'package:kinetix_parent/features/school_life/school_life_screen.dart';
import 'package:kinetix_parent/l10n/l10n.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'fake_api.dart';
import 'helpers.dart';

Widget host(Widget child, {String lang = 'en'}) => MaterialApp(
  theme: KinetixTheme.light(),
  locale: Locale(lang),
  supportedLocales: AppLocalizations.supportedLocales,
  localizationsDelegates: appLocalizationsDelegates,
  home: child,
);

void main() {
  late FakeParentApi api;
  final aarav = Child(id: 'c1', fullName: 'Aarav Patel', rollNo: '12', sectionId: 's1', sectionName: 'BCom Sem 3 A');

  setUp(() => api = FakeParentApi());

  Future<void> show(WidgetTester tester, Widget screen, {String lang = 'en'}) async {
    tester.view.physicalSize = const Size(412, 3000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(host(screen, lang: lang));
    await tester.pumpAndSettle();
  }

  test('visibility: a section the server does not name is shown', () {
    final v = ParentVisibility.fromJson({'attendance': false, 'diary': true});
    expect(v.allows('attendance'), isFalse);
    expect(v.allows('diary'), isTrue);
    expect(v.allows('health'), isTrue);
    expect(const ParentVisibility().allows('behaviour'), isTrue);
  });

  test('activities and behaviour parse what the API sends', () {
    final a = ChildActivities.fromJson(api.activitiesJson);
    expect(a.clubs.single.posts, ['Secretary']);
    expect(a.houseName, 'Red House');
    expect(a.housePoints, 25);
    expect(a.grades.single.remark, 'Plays well');
    expect(a.achievements.single.position, 'Second');
    expect(a.isEmpty, isFalse);
    expect(ChildActivities.fromJson({'clubs': [], 'events': [], 'house': null, 'recognitions': [], 'coCurricular': {'term': null, 'grades': []}, 'achievements': []}).isEmpty, isTrue);
    final b = ChildBehaviour.fromJson(api.behaviourJson);
    expect(b.behaviourGrade, 'A');
    expect(b.incidents.single.actions.single.action, 'Warning');
    expect(SchoolNotice.fromJson(api.noticeJson.single).acknowledged, isFalse);
  });

  testWidgets('the activities screen shows clubs, house, grades and achievements', (tester) async {
    await show(tester, ActivitiesScreen(api: api, child: aarav));
    expect(api.calls, contains('activities c1'));
    expect(find.text("Aarav's activities"), findsOneWidget);
    expect(find.text('Red House'), findsOneWidget);
    expect(find.text('25 house points'), findsOneWidget);
    expect(find.text('Chess Club'), findsWidgets);
    expect(find.text('Secretary · 30 points, 4 activities'), findsOneWidget);
    expect(find.text('Annual Day'), findsOneWidget);
    expect(find.text('Co-curricular grades, Term 1'), findsOneWidget);
    expect(find.text('Plays well'), findsOneWidget);
    expect(find.text('Inter-school chess'), findsOneWidget);
    expect(find.text('Maths quiz winner'), findsOneWidget);
  });

  testWidgets('the behaviour screen shows the grade, incidents with actions, and acknowledges a notice', (tester) async {
    await show(tester, BehaviourScreen(api: api, child: aarav));
    expect(find.text('Behaviour grade: A'), findsOneWidget);
    expect(find.text('Late to class'), findsNWidgets(2));
    expect(find.text('Action: Warning · Spoken to by the class teacher'), findsOneWidget);
    expect(find.text('Helped organise the library'), findsOneWidget);
    expect(find.text('Meeting on Tue 15 Sept'), findsOneWidget);
    expect(find.byKey(const Key('ackNotice-nt1')), findsOneWidget);
    await tester.tap(find.byKey(const Key('ackNotice-nt1')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('acknowledgeNotice nt1'));
    expect(find.text('Thank you. The school has been told.'), findsOneWidget);
    expect(find.byKey(const Key('ackNotice-nt1')), findsNothing);
    expect(find.text('Acknowledged'), findsOneWidget);
  });

  testWidgets('a section the school switched off shows a friendly message, not an error', (tester) async {
    api.behaviourError = ApiException(403, 'The school has not made behaviour available to parents', code: 'PARENT_VISIBILITY_OFF');
    await show(tester, BehaviourScreen(api: api, child: aarav));
    expect(find.byKey(const Key('visibilityOff')), findsOneWidget);
    expect(find.text('Your school has not made this available to parents.'), findsOneWidget);
    expect(find.text('Retry'), findsNothing);
  });

  testWidgets('the school life hub leaves out switched-off sections and links the new ones', (tester) async {
    await show(tester, SchoolLifeScreen(api: api, child: aarav));
    for (final k in ['lifeDiary', 'lifeActivities', 'lifeBehaviour', 'lifeHealth']) {
      expect(find.byKey(Key(k)), findsOneWidget);
    }
    await tester.tap(find.byKey(const Key('lifeActivities')));
    await tester.pumpAndSettle();
    expect(find.text('Red House'), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
    await show(tester, SchoolLifeScreen(api: api, child: aarav, visibility: ParentVisibility.fromJson({'diary': false, 'health': false, 'behaviour': false})));
    expect(find.byKey(const Key('lifeDiary')), findsNothing);
    expect(find.byKey(const Key('lifeHealth')), findsNothing);
    expect(find.byKey(const Key('lifeBehaviour')), findsNothing);
    expect(find.byKey(const Key('lifeActivities')), findsOneWidget);
  });

  testWidgets('the app reads visibility once and hides attendance and report cards when switched off', (tester) async {
    final (api, _) = await pumpApp(tester, setup: (a) => a.visibilityData = ParentVisibility.fromJson({'attendance': false, 'report_card': false}));
    expect(api.calls.where((c) => c == 'visibility'), hasLength(1));
    expect(find.byKey(const Key('tileAttendance')), findsNothing);
    expect(find.byKey(const Key('homeTab-attendance')), findsNothing);
    expect(find.byKey(const Key('homeTab-academics')), findsOneWidget);
  });

  testWidgets('with everything shown, Home keeps the attendance tile and chip', (tester) async {
    final (api, _) = await pumpApp(tester);
    expect(api.calls, contains('visibility'));
    expect(find.byKey(const Key('tileAttendance')), findsOneWidget);
    expect(find.byKey(const Key('homeTab-attendance')), findsOneWidget);
  });

  testWidgets('the report card shows co-curricular grades with remarks, behaviour and attendance days', (tester) async {
    await show(tester, ReportCardScreen(api: api, id: 'rc2'));
    expect(find.byKey(const Key('coGrade-Football')), findsOneWidget);
    expect(find.text('Plays in the school team'), findsOneWidget);
    expect(find.text('Behaviour: A'), findsOneWidget);
    expect(find.text('Attendance: 94.5% · 170 of 180 days'), findsOneWidget);
    expect(ReportCardDetail.fromJson({'termLabel': 'T', 'attendance': {'present': 9, 'total': 10, 'percent': 90}}).attendanceTotal, 10);
  });

  testWidgets('the new screens render in Hindi and Kannada without overflow', (tester) async {
    for (final lang in ['hi', 'kn']) {
      await show(tester, BehaviourScreen(api: api, child: aarav), lang: lang);
      expect(tester.takeException(), isNull);
      expect(find.text('Behaviour grade: A'), findsNothing);
      await show(tester, ActivitiesScreen(api: api, child: aarav), lang: lang);
      expect(tester.takeException(), isNull);
      expect(find.textContaining('house points'), findsNothing);
      await tester.pumpWidget(const SizedBox());
    }
  });
}
