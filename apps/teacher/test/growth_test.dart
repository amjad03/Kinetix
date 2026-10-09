// Annotations on scripts, the self-appraisal, house points and the curriculum view.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_teacher/core/growth_models.dart';
import 'package:kinetix_teacher/core/work_models.dart';
import 'package:kinetix_teacher/features/hr/appraisal_screen.dart';
import 'package:kinetix_teacher/features/work/evaluation_screens.dart';
import 'package:kinetix_teacher/features/work/houses_curriculum_screens.dart';

import 'fake_api.dart';
import 'helpers.dart';

void main() {
  late FakeTeacherApi api;
  setUp(() {
    api = FakeTeacherApi();
    seed(api);
  });

  testWidgets('evaluation: shows existing marks, adds a tick and a comment, removes a mark', (tester) async {
    phone(tester, size: const Size(412, 2400));
    api.evalScriptData = const EvalScript(
      id: 'al1', status: 'pending', dummyNo: 'D-104', pageCount: 1,
      questions: [EvalQuestion(id: 'q1', no: '1', maxMarks: 10)],
      entries: [],
    );
    api.evalMine = const [EvalAnnotation(id: 'old1', pageIndex: 0, kind: 'cross', x: 0.2, y: 0.3)];
    api.evalEarlier = const [EvalAnnotation(id: 'first1', pageIndex: 0, kind: 'tick', x: 0.5, y: 0.5, earlier: true)];
    await tester.pumpWidget(localizedApp(home: EvaluationScriptScreen(api: api, id: 'al1')));
    await tester.pumpAndSettle();
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('ann-old1')), findsOneWidget);
    expect(find.byKey(const Key('ann-first1')), findsOneWidget);
    expect(find.byKey(const Key('earlierNote')), findsOneWidget);
    expect(find.text('Marks on script: 1'), findsOneWidget);

    await tester.tapAt(tester.getTopLeft(find.byKey(const Key('pageTap-0'))) + const Offset(100, 150));
    await tester.pumpAndSettle();
    expect(api.calls.where((c) => c.startsWith('addAnnotation al1 0 tick')), hasLength(1));
    expect(find.text('Marks on script: 2'), findsOneWidget);

    await tapAndSettle(tester, find.byKey(const Key('tool-comment')));
    await tester.tapAt(tester.getTopLeft(find.byKey(const Key('pageTap-0'))) + const Offset(200, 250));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('annotationText')), 'Show working');
    await tapAndSettle(tester, find.byKey(const Key('confirmAnnotation')));
    expect(api.calls.last, contains('comment'));
    expect(api.calls.last, contains('"Show working"'));

    await tapAndSettle(tester, find.byKey(const Key('ann-old1')));
    expect(api.calls.last, 'deleteAnnotation al1 old1');
    expect(find.byKey(const Key('ann-old1')), findsNothing);
    // Marks from an earlier valuation are read only.
    await tester.tap(find.byKey(const Key('ann-first1')), warnIfMissed: false);
    await tester.pumpAndSettle();
    expect(api.calls.any((c) => c.contains('first1')), isFalse);
  });

  testWidgets('self-appraisal: checks the maximum, saves a draft and submits', (tester) async {
    phone(tester, size: const Size(412, 2000));
    await tester.pumpWidget(localizedApp(home: AppraisalScreen(api: api)));
    await tester.pumpAndSettle();
    expect(find.textContaining('2026-27'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('score-teaching_learning')), '120');
    await tapAndSettle(tester, find.byKey(const Key('saveAppraisal')));
    expect(find.textContaining('between 0 and 100'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('score-teaching_learning')), '80');
    await tester.enterText(find.byKey(const Key('evidence-teaching_learning')), '3 new labs');
    await tapAndSettle(tester, find.byKey(const Key('saveAppraisal')));
    expect(api.calls.last, 'saveAppraisal cy1 draft teaching_learning=80/3 new labs');
    expect(find.text('Draft saved.'), findsOneWidget);

    await tapAndSettle(tester, find.byKey(const Key('submitAppraisal')));
    expect(api.calls.last, startsWith('saveAppraisal cy1 submit'));
    expect(find.byKey(const Key('appraisalLocked')), findsOneWidget);
    expect(find.byKey(const Key('submitAppraisal')), findsNothing);
  });

  testWidgets('self-appraisal: a submitted form is locked; no open cycle says so', (tester) async {
    phone(tester, size: const Size(412, 2000));
    api.myAppraisalData = const MyAppraisal(status: 'self_submitted', scores: {'research': (score: 20, evidence: 'Two papers')}, selfPercent: 40);
    await tester.pumpWidget(localizedApp(home: AppraisalScreen(api: api)));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('appraisalLocked')), findsOneWidget);
    expect(find.text('Two papers'), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
    api.appraisalCycleList = const [AppraisalCycle(id: 'cy0', period: '2025-26', opensOn: '2025-04-01', closesOn: '2025-12-31', status: 'closed')];
    await tester.pumpWidget(localizedApp(home: AppraisalScreen(api: api)));
    await tester.pumpAndSettle();
    expect(find.text('No appraisal cycle is open right now.'), findsOneWidget);
  });

  testWidgets('houses: ranks the houses and awards points to a student', (tester) async {
    phone(tester, size: const Size(412, 1200));
    await tester.pumpWidget(localizedApp(home: HousesScreen(api: api)));
    await tester.pumpAndSettle();
    expect(find.text('Kaveri'), findsOneWidget);
    expect(find.text('140'), findsOneWidget);
    await tapAndSettle(tester, find.byKey(const Key('house-h1')));

    await tapAndSettle(tester, find.byKey(const Key('awardPoints')));
    expect(find.textContaining('not zero'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('housePoints')), '10');
    await tapAndSettle(tester, find.byKey(const Key('awardPoints')));
    expect(find.textContaining('at least 3'), findsOneWidget);

    await tapAndSettle(tester, find.byKey(const Key('houseStudent')));
    await tapAndSettle(tester, find.text('Asha Rao').last);
    await tester.enterText(find.byKey(const Key('houseReason')), 'Won the quiz');
    await tapAndSettle(tester, find.byKey(const Key('awardPoints')));
    expect(api.calls.last, 'awardPoints h1 10 general "Won the quiz" s1');
    expect(find.text('Points recorded.'), findsOneWidget);
  });

  testWidgets('curriculum: lists only active versions and opens units and outcomes', (tester) async {
    phone(tester, size: const Size(412, 1200));
    await tester.pumpWidget(localizedApp(home: CurriculumScreen(api: api)));
    await tester.pumpAndSettle();
    expect(find.text('BCom 2024 v2'), findsOneWidget);
    expect(find.text('BCom 2024 v1'), findsNothing);
    await tapAndSettle(tester, find.byKey(const Key('curriculum-cv1')));
    await tapAndSettle(tester, find.byKey(const Key('subject-ACC301')));
    expect(find.textContaining('Goodwill — Meaning, Valuation'), findsOneWidget);
    expect(find.text('CO1: Value goodwill by common methods'), findsOneWidget);
  });

  testWidgets('houses and appraisal read in Hindi and Kannada', (tester) async {
    phone(tester, size: const Size(412, 1200));
    for (final lang in ['hi', 'kn']) {
      final s = strings(lang);
      await tester.pumpWidget(localizedApp(home: HousesScreen(api: api), language: lang));
      await tester.pumpAndSettle();
      expect(find.text(s.housesTitle), findsOneWidget);
      await tester.pumpWidget(localizedApp(home: AppraisalScreen(api: api), language: lang));
      await tester.pumpAndSettle();
      expect(find.text(s.appraisalSaveDraft), findsOneWidget);
      expect(find.text('Save draft'), findsNothing);
    }
  });
}
