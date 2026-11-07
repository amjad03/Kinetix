import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/classroom_edition/edition.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/features/help/tour.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import '../support/board_fonts.dart';
import 'ce_support.dart';

/// Words that mean an AI feature on screen.
final _ai = RegExp(r'\bAI\b|KINETIX AI|Read with AI|AI pen|Text AI|Shape AI|Tidy shapes|Read the board|Solve|Live captions|Voice commands|Suggested next', caseSensitive: false);

/// Keys of AI controls.
const _aiKeys = ['panel-ai', 'tool-ai-pen', 'panel-tab-ai', 'sel-ai', 'sel-solve', 'sel-convert', 'pen-mode-textAi', 'pen-mode-shapeAi', 'snap-shapes', 'kit-ai-home', 'dictionary-ai', 'app-homework', 'app-class-prep', 'app-tests'];

/// Every text on screen now.
List<String> _texts() => [
  for (final e in find.byType(Text).evaluate()) ...[
    if ((e.widget as Text).data case final d?) d,
    if ((e.widget as Text).textSpan case final s?) s.toPlainText(),
  ],
  for (final e in find.byType(RichText).evaluate()) (e.widget as RichText).text.toPlainText(),
  for (final e in find.byType(Tooltip).evaluate()) ?(e.widget as Tooltip).message,
];

/// What on screen now is AI ([where] says which menu).
List<String> _aiOnScreen(String where) => [
  for (final t in _texts())
    if (_ai.hasMatch(t)) '$where: "$t"',
  for (final k in _aiKeys)
    if (find.byKey(Key(k)).evaluate().isNotEmpty) '$where: key $k',
];

/// Opens each main menu of the board in turn and collects any AI found in it.
Future<List<String>> _walkMenus(WidgetTester tester, BoardController board, {Set<String>? opened}) async {
  final found = <String>[];
  Future<void> look(String where) async {
    await settle(tester, 4);
    found.addAll(_aiOnScreen(where));
  }

  Future<void> close() async {
    await tester.tapAt(const Offset(1500, 400));
    await settle(tester, 4);
  }

  Future<void> open(String key, String where) async {
    final f = find.byKey(Key(key));
    if (f.evaluate().isEmpty) return;
    await tester.ensureVisible(f.first);
    await tester.tap(f.first, warnIfMissed: false);
    await look(where);
    opened?.add(where);
  }

  Future<void> dismissDialog() async {
    final close = find.byType(TextButton);
    if (find.byType(Dialog).evaluate().isEmpty && find.byType(AlertDialog).evaluate().isEmpty) return;
    await tester.tap(close.last, warnIfMissed: false);
    await settle(tester, 4);
  }

  await look('board');
  // The pen's options (Pen types, Text AI and Shape AI pen modes).
  await open('tool-pen', 'pen');
  await open('tool-pen', 'pen popover');
  await close();
  // Every tool (the full toolbar), Tools, Add (Insert) and More.
  if (Edition.classroom) await board.classroom.setShowAllTools(true);
  await settle(tester);
  await look('all tools');
  await open('tool-tools', 'tools drawer');
  await close();
  await open('tool-insert', 'insert');
  await close();
  await open('toolbar-more', 'more');
  await tester.tapAt(const Offset(40, 40));
  await settle(tester, 4);
  await close();
  // The menu, Board settings, the profile and help.
  await open('board-menu', 'menu');
  await close();
  await open('board-menu', 'menu');
  await open('menu-settings', 'board settings');
  final done = find.text('Done');
  if (done.evaluate().isNotEmpty) await tester.tap(done.last, warnIfMissed: false);
  await settle(tester, 4);
  await open('profile-button', 'profile');
  await open('menu-help', 'help');
  await dismissDialog();
  await close();
  // Classroom Apps, the split panel's tabs, and the subject kit.
  await open('board-menu', 'menu');
  await open('menu-apps', 'classroom apps');
  await dismissDialog();
  await open('tool-tools', 'tools drawer');
  await open('drawer-physics-formulas', 'kit');
  await look('split panel');
  // Select ink: the selection bar (no "Read with AI", solver or conversion).
  final wb = tester.widget<WhiteboardCanvas>(find.byType(WhiteboardCanvas).first).controller;
  wb.tool = BoardTool.pen;
  final g = await tester.startGesture(const Offset(300, 400), kind: PointerDeviceKind.touch);
  for (var i = 0; i < 6; i++) {
    await g.moveBy(const Offset(20, 8));
  }
  await g.up();
  await settle(tester, 4);
  wb.selectAll();
  await look('selection');
  return found;
}

void main() {
  setUpAll(loadBoardFonts);
  tearDown(() => Edition.classroom = Edition.built == 'classroom');

  testWidgets('the Classroom edition shows no AI in any main menu', (tester) async {
    final board = (await tester.runAsync(() => classroomBoard(seed: sampleCollege())))!;
    await pumpApp(tester, board);
    await tapKey(tester, 'ce-start-class');
    await settle(tester, 10);
    expect(Edition.ai, isFalse);
    final opened = <String>{};
    final found = await _walkMenus(tester, board, opened: opened);
    expect(found, isEmpty);
    // The walk really went through the menus.
    expect(opened, containsAll(['pen popover', 'tools drawer', 'insert', 'more', 'menu', 'board settings', 'profile', 'help', 'classroom apps', 'kit']));
    await closeBoard(tester, board);
  });

  testWidgets('the same walk finds KINETIX AI on the KINETIX Board (the check works)', (tester) async {
    Edition.classroom = false;
    BoardTour.autoStart = false;
    final board = BoardController()..skipEnrollment();
    await pumpApp(tester, board);
    await settle(tester, 6);
    final found = await _walkMenus(tester, board);
    expect(found.where((f) => f.contains('KINETIX AI') || f.contains('panel-ai')), isNotEmpty);
    await tester.pumpWidget(const SizedBox());
  });
}
