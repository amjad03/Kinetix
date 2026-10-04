// Year plans (from the syllabus) and lesson plans (from today's period card).
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_teacher/core/api.dart';
import 'package:kinetix_teacher/core/format.dart';
import 'package:kinetix_teacher/core/models.dart';

import 'fake_api.dart';
import 'helpers.dart';

void main() {
  late FakeTeacherApi api;

  setUp(() {
    api = FakeTeacherApi()..today = '2026-10-05';
    api.periodsByDate = {
      '2026-10-05': [api.period(isNow: true)],
    };
  });

  Future<void> start(WidgetTester tester) async {
    phone(tester);
    await pumpApp(tester, api, prefs: {'token': 'tok'});
  }

  Future<void> openYearPlan(WidgetTester tester) async {
    await start(tester);
    await tester.ensureVisible(find.byKey(const Key('syllabus-slot1')));
    await tapAndSettle(tester, find.byKey(const Key('syllabus-slot1')));
    await tapAndSettle(tester, find.byKey(const Key('openYearPlan')));
  }

  Future<void> openLessonPlan(WidgetTester tester) async {
    await start(tester);
    await tester.ensureVisible(find.byKey(const Key('plan-slot1')));
    await tapAndSettle(tester, find.byKey(const Key('plan-slot1')));
  }

  Finder form() => find.descendant(of: find.byKey(const Key('lessonPlanForm')), matching: find.byType(Scrollable)).first;

  /// Scrolls the lesson plan form until [key] is built and visible.
  Future<void> show(WidgetTester tester, String key) async {
    await tester.scrollUntilVisible(find.byKey(Key(key)), 200, scrollable: form());
    await tester.pumpAndSettle();
  }

  group('year plan', () {
    testWidgets('none yet: explains, and makes one with the default dates', (tester) async {
      await openYearPlan(tester);
      expect(api.calls, contains('yearPlan sec1 sub1'));
      expect(find.byKey(const Key('yearPlanNone')), findsOneWidget);
      expect(find.textContaining('skipping holidays and exams'), findsOneWidget);

      await tapAndSettle(tester, find.byKey(const Key('makeYearPlan')));
      expect(find.textContaining('16 weeks from today'), findsOneWidget);
      await tapAndSettle(tester, find.byKey(const Key('generatePlan')));
      expect(api.calls, contains('generate sec1 sub1 - -'));
      expect(find.text('Year plan made'), findsOneWidget);

      // Status, weeks (this week highlighted), taught ticks and late markers.
      expect(find.descendant(of: find.byKey(const Key('planStatus')), matching: find.text('Behind by 1 topic')), findsOneWidget);
      expect(find.text('1 of 3 topics taught'), findsOneWidget);
      expect(find.byKey(const Key('thisWeek')), findsOneWidget);
      expect(find.byKey(const Key('planTaught-t1')), findsOneWidget);
      expect(find.text('Taught Mon, 28 Sept'), findsOneWidget);
      expect(find.byKey(const Key('planLate-t2')), findsOneWidget);
      expect(find.byKey(const Key('planLate-t3')), findsNothing);
      expect(find.textContaining('2 periods'), findsOneWidget);
    });

    testWidgets('a chosen start date is sent; a refusal is shown in words', (tester) async {
      api.planError = ApiException(400, 'This subject has no periods in the timetable', code: 'BAD_REQUEST');
      await openYearPlan(tester);
      await tapAndSettle(tester, find.byKey(const Key('makeYearPlan')));
      await tapAndSettle(tester, find.byKey(const Key('planStart')));
      await tapAndSettle(tester, find.text('OK'));
      await tapAndSettle(tester, find.byKey(const Key('generatePlan')));
      expect(api.calls.last, startsWith('generate sec1 sub1 ${isoDate(DateTime.now())} -'));
      expect(find.text('This subject has no periods in the timetable for this class.'), findsOneWidget);
      expect(find.byKey(const Key('yearPlanNone')), findsOneWidget);
    });

    testWidgets('moves a topic to another week and changes its periods', (tester) async {
      api.plan = api.samplePlan();
      await openYearPlan(tester);
      await tester.ensureVisible(find.byKey(const Key('editPlanItem-t3')));
      await tapAndSettle(tester, find.byKey(const Key('editPlanItem-t3')));
      await tapAndSettle(tester, find.byKey(const Key('periodsMore')));
      expect(find.text('2'), findsWidgets);
      await tapAndSettle(tester, find.byKey(const Key('weekPicker')));
      final next = mondayOf(DateUtils.dateOnly(DateTime.now())).add(const Duration(days: 7));
      final label = 'Week of ${Fmt(strings('en'), 'en').shortDay(next)}';
      await tapAndSettle(tester, find.text(label).last);
      await tapAndSettle(tester, find.byKey(const Key('saveMove')));
      expect(api.calls, contains('move yp1 t3 ${isoDate(next)} 2'));
      expect(find.text('Plan updated'), findsOneWidget);
      expect(find.byKey(Key('week-${isoDate(next)}')), findsOneWidget);
    });

    testWidgets('remaking asks first', (tester) async {
      api.plan = api.samplePlan();
      await openYearPlan(tester);
      await tapAndSettle(tester, find.byKey(const Key('yearPlanMenu')));
      await tapAndSettle(tester, find.byKey(const Key('remakePlan')));
      expect(find.text('Remake the year plan?'), findsOneWidget);
      await tapAndSettle(tester, find.text('Cancel'));
      expect(api.calls.where((c) => c.startsWith('generate')), isEmpty);

      await tapAndSettle(tester, find.byKey(const Key('yearPlanMenu')));
      await tapAndSettle(tester, find.byKey(const Key('remakePlan')));
      await tapAndSettle(tester, find.byKey(const Key('confirmRemake')));
      await tapAndSettle(tester, find.byKey(const Key('generatePlan')));
      expect(api.calls, contains('generate sec1 sub1 - -'));
    });
  });

  group('lesson plan', () {
    testWidgets("plans today's period: suggested topic, objectives, steps against the period, save", (tester) async {
      await start(tester);
      expect(find.text('Plan'), findsOneWidget);
      await tester.ensureVisible(find.byKey(const Key('plan-slot1')));
      await tapAndSettle(tester, find.byKey(const Key('plan-slot1')));
      expect(api.calls, contains('periodPlan slot1 2026-10-05'));
      expect(find.byKey(const Key('lessonTopic-t3')), findsOneWidget);
      expect(find.text('Intrinsic value and yield methods'), findsOneWidget);

      await tapAndSettle(tester, find.byKey(const Key('objectiveAdd')));
      await tester.enterText(find.byKey(const Key('objective-0')), 'Value shares by two methods');
      await show(tester, 'addStep');
      await tapAndSettle(tester, find.byKey(const Key('addStep')));
      await tapAndSettle(tester, find.byKey(const Key('addStep')));
      await tester.enterText(find.byKey(const Key('stepActivity-0')), 'Recap');
      await tester.enterText(find.byKey(const Key('stepMinutes-1')), '60');
      await tester.enterText(find.byKey(const Key('stepActivity-1')), 'Worked example');
      await tester.pump();
      expect(find.text('65 min, period is 55'), findsOneWidget);
      await tester.enterText(find.byKey(const Key('stepMinutes-1')), '40');
      await tester.pump();
      expect(find.text('45 of 55 min'), findsOneWidget);

      // Reorder: the second step moves up.
      await tapAndSettle(tester, find.byKey(const Key('stepMenu-1')));
      await tapAndSettle(tester, find.byKey(const Key('stepUp')));
      await show(tester, 'homeworkField');
      await tester.enterText(find.byKey(const Key('homeworkField')), 'Ex 4.2');

      await tapAndSettle(tester, find.byKey(const Key('saveLessonPlan')));
      expect(api.calls, contains('saveLessonPlan slot1 2026-10-05'));
      final saved = api.lastSavedPlan!;
      expect(saved['topicIds'], ['t3']);
      expect(saved['aiDrafted'], isFalse);
      expect(saved['content'], {
        'objectives': ['Value shares by two methods'],
        'steps': [
          {'minutes': 40, 'activity': 'Worked example'},
          {'minutes': 5, 'activity': 'Recap'},
        ],
        'materials': <String>[],
        'assessment': '',
        'homework': 'Ex 4.2',
      });
      expect(find.text('Lesson plan saved'), findsOneWidget);

      await pop(tester);
      expect(find.text('Planned'), findsOneWidget);
    });

    testWidgets('topics from the syllabus picker', (tester) async {
      await openLessonPlan(tester);
      await tapAndSettle(tester, find.byKey(const Key('addTopic')));
      expect(find.text('In the year plan for this week'), findsOneWidget);
      await tapAndSettle(tester, find.byKey(const Key('pickTopic-t1')));
      await tapAndSettle(tester, find.byKey(const Key('pickTopic-t3')));
      await tapAndSettle(tester, find.byKey(const Key('topicsDone')));
      expect(find.byKey(const Key('lessonTopic-t1')), findsOneWidget);
      expect(find.byKey(const Key('lessonTopic-t3')), findsNothing);
    });

    testWidgets('KINETIX AI drafts the plan, labelled; replacing edits asks first', (tester) async {
      await openLessonPlan(tester);
      await tapAndSettle(tester, find.byKey(const Key('draftWithAi')));
      expect(api.calls, contains('draft slot1 2026-10-05 t3 en'));
      expect(find.text('AI draft — check before use'), findsOneWidget);
      expect(find.byKey(const Key('aiPreviewNote')), findsOneWidget);
      expect(find.text('Value shares by the intrinsic value method'), findsOneWidget);
      expect(find.text('40 of 55 min'), findsOneWidget);

      // Again, now that there is content: confirm first; the homework is kept.
      await show(tester, 'homeworkField');
      await tester.enterText(find.byKey(const Key('homeworkField')), 'Ex 4.2');
      await tester.scrollUntilVisible(find.byKey(const Key('draftWithAi')), -200, scrollable: form());
      await tapAndSettle(tester, find.byKey(const Key('draftWithAi')));
      expect(find.text('Replace with a KINETIX AI draft?'), findsOneWidget);
      await tapAndSettle(tester, find.byKey(const Key('confirmReplace')));
      expect(api.calls.where((c) => c.startsWith('draft')), hasLength(2));

      await tapAndSettle(tester, find.byKey(const Key('saveLessonPlan')));
      expect(api.lastSavedPlan!['aiDrafted'], isTrue);
      expect((api.lastSavedPlan!['content'] as Map)['homework'], 'Ex 4.2');
    });

    testWidgets("shows the head's review remark; leaving with changes asks first", (tester) async {
      api.lessonPlans['slot1 2026-10-05'] = {
        'id': 'lp1',
        'date': '2026-10-05',
        'topicIds': ['t2'],
        'topics': [
          {'id': 't2', 'title': 'Methods: average profit, super profit and capitalisation'},
        ],
        'content': {
          'objectives': ['Compare methods'],
          'steps': [
            {'minutes': 20, 'activity': 'Explain'},
          ],
          'materials': [],
          'assessment': '',
          'homework': '',
        },
        'aiDrafted': false,
        'teacher': 'Anita Sharma',
        'reviewedAt': '2026-10-04T06:00:00Z',
        'reviewRemark': 'Add a recap question',
      };
      api.periodsByDate['2026-10-05']!.first.lessonPlanned = true;
      await openLessonPlan(tester);
      expect(find.byKey(const Key('reviewCard')), findsOneWidget);
      expect(find.text('Add a recap question'), findsOneWidget);
      expect(find.textContaining('Reviewed on'), findsOneWidget);
      expect(find.text('Compare methods'), findsOneWidget);

      await tester.enterText(find.byKey(const Key('objective-0')), 'Compare the three methods');
      await tester.pump();
      await pop(tester);
      expect(find.text('Your lesson plan has changes that are not saved yet.'), findsOneWidget);
      await tapAndSettle(tester, find.text('Keep editing'));
      expect(find.byKey(const Key('lessonPlanForm')), findsOneWidget);
      await pop(tester);
      await tapAndSettle(tester, find.byKey(const Key('discardChanges')));
      expect(find.byKey(const Key('lessonPlanForm')), findsNothing);
    });

    testWidgets('in Hindi', (tester) async {
      api.useLanguage('hi');
      await openLessonPlan(tester);
      final s = strings('hi');
      expect(find.text(s.lessonPlan), findsOneWidget);
      expect(find.text(s.draftWithAi), findsOneWidget);
      await tapAndSettle(tester, find.byKey(const Key('draftWithAi')));
      expect(api.calls, contains('draft slot1 2026-10-05 t3 hi'));
      expect(find.text(s.aiDraftLabel), findsOneWidget);
      expect(find.text(s.stepsTotal(40, 55)), findsOneWidget);
    });
  });
}
