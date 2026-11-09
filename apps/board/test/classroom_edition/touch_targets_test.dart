import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/classroom_edition/edition.dart';
import 'package:kinetix_board/classroom_edition/ui/ce_more_text.dart';
import 'package:kinetix_board/classroom_edition/ui/ce_style.dart';

import '../support/board_fonts.dart';
import 'ce_support.dart';

/// Touch targets on a classroom board (P1 item 13): 64 px buttons, chips, tabs, top pills and
/// dialog actions; every icon-only button named; the side panel's tabs show there are more.
void main() {
  setUpAll(loadBoardFonts);
  tearDown(() => Edition.classroom = Edition.built == 'classroom');

  void atLeast64(WidgetTester tester, String key, {bool width = true}) {
    final f = find.byKey(Key(key));
    expect(f, findsWidgets, reason: key);
    final s = tester.getSize(f.first);
    expect(s.height, greaterThanOrEqualTo(ceTarget - 0.5), reason: '$key is ${s.height} tall');
    if (width) expect(s.width, greaterThanOrEqualTo(ceTarget - 0.5), reason: '$key is ${s.width} wide');
  }

  void everyIconButtonNamed(WidgetTester tester, String where) {
    for (final b in tester.widgetList<IconButton>(find.byType(IconButton))) {
      expect(b.tooltip, isNotNull, reason: '$where: an icon-only button ${b.key} has no name');
    }
  }

  testWidgets('start screen, settings and dialogs: 64 px targets, every icon button named', (tester) async {
    final board = (await tester.runAsync(() => classroomBoard(seed: sampleCollege())))!;
    await pumpApp(tester, board);
    for (final k in ['ce-start-class', 'ce-who', 'ce-practice', 'ce-settings', 'ce-lang-kn', 'ce-lang-en']) {
      atLeast64(tester, k);
    }
    everyIconButtonNamed(tester, 'start');
    await openCeSettings(tester);
    // Tabs: 64 tall; their width is the label's, with the tab's padding around it.
    for (final k in ['ce-tab-timetable', 'ce-tab-teachers', 'ce-tab-board']) {
      atLeast64(tester, k, width: false);
    }
    atLeast64(tester, 'ce-set-add-slot');
    await tapKey(tester, 'ce-tab-teachers');
    await tapKey(tester, 'ce-set-teacher-lr');
    for (final k in ['ce-teacher-save', 'ce-teacher-remove']) {
      atLeast64(tester, k);
    }
    everyIconButtonNamed(tester, 'settings');
    await closeBoard(tester, board);
  });

  testWidgets('the board: big Simple tools, labelled side clusters, 64 px top pills, panel tabs that show there are more', (tester) async {
    final board = (await tester.runAsync(() => classroomBoard(seed: sampleCollege())))!;
    await pumpApp(tester, board);
    await tapKey(tester, 'ce-start-class');
    await settle(tester, 10);
    for (final k in ['tool-pen', 'ce-colours', 'undo', 'ce-lessons', 'ce-class-tools', 'ce-show-all', 'board-menu', 'add-page', 'class-chip', 'attendance-chip', 'ctx-chip']) {
      atLeast64(tester, k);
    }
    // All tools: the side clusters keep their names under the icons.
    await tapKey(tester, 'ce-show-all');
    for (final k in ['quick-end-class', 'switch-sides', 'hide-ui']) {
      final f = find.byKey(Key(k));
      if (f.evaluate().isEmpty) continue;
      expect(find.descendant(of: f.first, matching: find.byType(Text)), findsOneWidget, reason: '$k has a visible label');
      atLeast64(tester, k);
    }
    everyIconButtonNamed(tester, 'board');
    // The side panel: tall tabs, and an arrow where more tabs are hidden.
    await tapKey(tester, 'ce-lessons');
    await settle(tester, 4);
    atLeast64(tester, 'panel-tab-lessons');
    expect(find.byKey(const Key('ce-scroll-more')), findsOneWidget);
    atLeast64(tester, 'ce-scroll-more');
    final last = find.byKey(const Key('panel-tab-kit'));
    final before = tester.getRect(last).left;
    await tapKey(tester, 'ce-scroll-more');
    await settle(tester, 4);
    expect(tester.getRect(last).left, lessThan(before), reason: 'the arrow scrolls the tabs');
    expect(find.byKey(const Key('ce-scroll-back')), findsOneWidget);
    everyIconButtonNamed(tester, 'panel');
    await closeBoard(tester, board);
  });

  testWidgets('a long lesson caption shows two lines and More, which shows all of it', (tester) async {
    final long = List.filled(30, 'The electric field lines start on positive charges and end on negative ones.').join(' ');
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: SizedBox(width: 700, child: CeMoreText(long, style: ceText(18), title: 'Step 3 of 8')))));
    expect(find.byKey(const Key('ce-more-text')), findsOneWidget);
    expect(tester.getSize(find.byKey(const Key('ce-more-text'))).height, greaterThanOrEqualTo(ceTarget));
    await tester.tap(find.byKey(const Key('ce-more-text')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('ce-more-text-dialog')), findsOneWidget);
    expect(find.text('Step 3 of 8'), findsOneWidget);
    // A short caption has no More.
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: SizedBox(width: 700, child: CeMoreText('Explain the picture.', style: ceText(18))))));
    expect(find.byKey(const Key('ce-more-text')), findsNothing);
  });
}
