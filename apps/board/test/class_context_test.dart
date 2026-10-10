import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/models.dart';
import 'package:kinetix_board/features/board/context/class_context.dart';
import 'package:kinetix_board/features/board/context/context_switcher.dart';
import 'package:kinetix_board/features/board/kit/subjects.dart';
import 'package:kinetix_board/features/board/layout/tools_drawer.dart';

import 'support/panel_harness.dart';

void main() {
  setUp(() => showAllToolsByDefault = false);
  tearDown(() => showAllToolsByDefault = true);

  ToolProfile p(Subject s, int grade) => toolProfileFor(s, gradeBandOf(grade: grade));

  test('grade bands from the class grade and the programme', () {
    expect(gradeBandOf(grade: 0), GradeBand.early);
    expect(gradeBandOf(grade: 3), GradeBand.primary);
    expect(gradeBandOf(grade: 7), GradeBand.middle);
    expect(gradeBandOf(grade: 10), GradeBand.secondary);
    expect(gradeBandOf(grade: 12), GradeBand.seniorSecondary);
    expect(gradeBandOf(grade: 3, level: 'ug'), GradeBand.college);
    expect(gradeBandOf(grade: 13), GradeBand.college);
  });

  test('Maths in Class 7 brings geometry tools, graphs and number work, not the periodic table or code', () {
    final t = p(Subject.maths, 7);
    for (final id in ['ruler', 'protractor', 'compass', 'set-square-45', 'graphs', 'number-line', 'equation', 'formulas']) {
      expect(toolRelevant(t, id), isTrue, reason: id);
    }
    for (final id in ['periodic-table', 'chem-equation', 'code-lab', 'accounts', 'circuit', 'timeline']) {
      expect(toolRelevant(t, id), isFalse, reason: id);
    }
    expect(insertRelevant(t, 'insert-graph'), isTrue);
    expect(insertRelevant(t, 'insert-lab'), isFalse);
    expect(insertRelevant(t, 'insert-text'), isTrue, reason: 'text, notes and pictures always show');
    expect(simRelevant(t, 'pythagoras'), isTrue);
    expect(simRelevant(t, 'pendulum'), isFalse);
  });

  test('little ones in Maths get counting and clocks, not graph plotters', () {
    final t = p(Subject.maths, 2);
    expect(toolRelevant(t, 'teaching-clock'), isTrue);
    expect(toolRelevant(t, 'number-line'), isTrue);
    expect(toolRelevant(t, 'counting'), isTrue);
    expect(toolRelevant(t, 'graph-plotter'), isFalse);
    expect(toolRelevant(t, 'equation'), isFalse);
    expect(insertRelevant(t, 'insert-equation'), isFalse);
  });

  test('Physics brings simulations and units; History brings timelines and key dates; languages bring the dictionary and reader', () {
    final phy = p(Subject.physics, 11);
    expect(toolRelevant(phy, 'sims'), isTrue);
    expect(toolRelevant(phy, 'physics-formulas'), isTrue);
    expect(toolRelevant(phy, 'constants'), isTrue);
    expect(toolRelevant(phy, 'logic-gates'), isTrue);
    expect(toolRelevant(phy, 'timeline'), isFalse);
    expect(simRelevant(phy, 'pendulum'), isTrue);
    final hist = p(Subject.history, 8);
    expect(toolRelevant(hist, 'timeline'), isTrue);
    expect(toolRelevant(hist, 'sims'), isFalse);
    expect(hist.keyDates, 'history');
    expect(toolRelevant(hist, 'ruler'), isFalse);
    final eng = p(Subject.english, 6);
    expect(eng.dictionaryFirst, isTrue);
    expect(toolRelevant(eng, 'dictionary'), isTrue);
    expect(toolRelevant(eng, 'language-kit'), isTrue);
    expect(toolRelevant(eng, 'read-aloud'), isTrue);
    expect(toolRelevant(eng, 'graph-plotter'), isFalse);
    expect(p(Subject.computer, 11).tools, containsAll(['logic-gates', 'flowchart', 'mindmap']));
  });

  test('every subject keeps the classroom tools, and an unknown subject hides nothing', () {
    for (final s in Subject.values.where((s) => s != Subject.general)) {
      for (final b in GradeBand.values) {
        final t = toolProfileFor(s, b);
        expect(t.tools, containsAll(['toolkit-timer', 'quick-quiz', 'attendance', 'mindmap']), reason: '$s $b');
        expect(t.tools.length, lessThan(80));
      }
    }
    final all = p(Subject.general, 7);
    expect(showsEverything(all), isTrue);
    expect(toolRelevant(all, 'anything'), isTrue);
  });

  test('the class context follows the timetable until the teacher picks', () {
    final session = SessionContext(
      sessionId: 's1',
      expiresAt: DateTime(2030),
      teacherId: 't',
      teacherName: 'T',
      language: 'en',
      sectionId: 'x',
      sectionName: 'Class 7 A',
      subjectName: 'Mathematics',
      classTerm: 7,
      programLevel: 'k12',
    );
    final pick = ContextOverride();
    var c = resolveClassContext(session, pick);
    expect((c.subject, c.band, c.grade), (Subject.maths, GradeBand.middle, 7));
    pick.set(subject: Subject.history);
    c = resolveClassContext(session, pick);
    expect((c.subject, c.grade, c.source), (Subject.history, 7, ContextSource.teacher));
    pick.set(grade: 11);
    expect(resolveClassContext(session, pick).band, GradeBand.seniorSecondary);
    pick.clear();
    expect(resolveClassContext(session, pick).subject, Subject.maths);
    expect(resolveClassContext(null, pick).subject, Subject.general);
  });

  test('Hindi and Kannada have every English key', () {
    for (final lang in ['hi', 'kn']) {
      expect(contextStringTable[lang]!.keys.toSet(), contextStringTable['en']!.keys.toSet());
    }
  });

  testWidgets('the tools drawer shows only the subject tools until "Show all tools"', (tester) async {
    final tools = [
      for (final id in ['ruler', 'periodic-table', 'timeline', 'quick-quiz']) DrawerTool(id, Icons.circle, id, const [ToolGroup.maths], Colors.blue, () {}),
    ];
    final t = p(Subject.maths, 7);
    await pumpPanel(tester, ToolsDrawer(tools: tools, order: const [ToolGroup.maths], relevant: (id) => toolRelevant(t, id), contextLabel: 'Maths · Class 7'));
    expect(find.byKey(const Key('drawer-ruler')), findsOneWidget);
    expect(find.byKey(const Key('drawer-quick-quiz')), findsOneWidget);
    expect(find.byKey(const Key('drawer-periodic-table')), findsNothing);
    expect(find.byKey(const Key('drawer-timeline')), findsNothing);
    expect(find.text('Showing tools for Maths · Class 7'), findsOneWidget);
    await tester.tap(find.byKey(const Key('drawer-show-all')));
    await tester.pump();
    expect(find.byKey(const Key('drawer-periodic-table')), findsOneWidget);
    expect(find.byKey(const Key('drawer-timeline')), findsOneWidget);
    // Search looks through everything even when narrowed.
    await tester.tap(find.byKey(const Key('drawer-show-all')));
    await tester.pump();
    await tester.enterText(find.byKey(const Key('tools-search')), 'periodic');
    await tester.pump();
    expect(find.byKey(const Key('drawer-periodic-table')), findsOneWidget);
  });

  testWidgets('the top bar switcher changes subject and class, and the timetable comes back', (tester) async {
    final pick = ContextOverride();
    ClassContext now() => resolveClassContext(null, pick);
    await pumpPanel(tester, Align(alignment: Alignment.topLeft, child: ContextChip(ctx: now, pick: pick)));
    await tester.tap(find.byKey(const Key('ctx-chip')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('ctx-subject-physics')));
    await tester.tap(find.byKey(const Key('ctx-grade-9')));
    await tester.pump();
    expect((now().subject, now().grade, now().band), (Subject.physics, 9, GradeBand.secondary));
    await tester.tap(find.byKey(const Key('ctx-reset')));
    await tester.pump();
    expect(now().subject, Subject.general);
    await tester.tap(find.byKey(const Key('ctx-done')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('ctx-picker')), findsNothing);
  });
}
