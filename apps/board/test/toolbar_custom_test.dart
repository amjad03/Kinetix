import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/features/board/layout/toolbar_layout.dart';
import 'package:kinetix_board/main.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/board_fonts.dart';
import 'support/fake_cloud.dart';

/// The toolbar's Laser, Edit toolbar (in, out, in order, at most 12 on a panel and 7 on a phone,
/// Reset, saved for the teacher) and docking it (the editor's dock buttons, and a drag that
/// snaps to an edge), on a phone and a 1920 × 1080 panel.
void main() {
  setUpAll(loadBoardFonts);
  setUp(() => SharedPreferences.setMockInitialValues({}));

  Future<(BoardController, WhiteboardController)> open(WidgetTester tester, Size size) async {
    screenSize(tester, size);
    final board = await enrolledBoard();
    board.onPaired('session-token', sessionIn('en'));
    await tester.pumpWidget(KinetixBoardApp(controller: board));
    await tester.pumpAndSettle();
    if (find.text('Not now').evaluate().isNotEmpty) {
      await tester.tap(find.text('Not now'));
      await tester.pumpAndSettle();
    }
    return (board, tester.widget<WhiteboardCanvas>(find.byType(WhiteboardCanvas)).controller);
  }

  Future<void> close(WidgetTester tester, BoardController board) async {
    await tester.pumpWidget(const SizedBox());
    board.dispose();
  }

  Future<void> openEditorFromMenu(WidgetTester tester) async {
    await tester.tap(find.byKey(const Key('board-menu')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('menu-customise-toolbar')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('menu-customise-toolbar')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('toolbar-editor')), findsOneWidget);
  }

  Future<void> tapInEditor(WidgetTester tester, String key) async {
    await tester.ensureVisible(find.byKey(Key(key)));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(Key(key)));
    await tester.pumpAndSettle();
  }

  Finder onToolbar(String key) => find.descendant(of: find.byKey(const Key('main-toolbar')), matching: find.byKey(Key(key)));
  Finder onPhoneBar(String key) => find.descendant(of: find.byKey(const Key('phone-bar')), matching: find.byKey(Key(key)));

  testWidgets('1920×1080: the Laser is on the toolbar and points, then goes back to the pen', (tester) async {
    final (board, wb) = await open(tester, const Size(1920, 1080));
    expect(onToolbar('tool-laser'), findsOneWidget);
    await tester.tap(onToolbar('tool-laser'));
    await tester.pumpAndSettle();
    expect(wb.tool, BoardTool.laser);
    await tester.tap(onToolbar('tool-laser'));
    await tester.pumpAndSettle();
    expect(wb.tool, BoardTool.pen);
    await close(tester, board);
  });

  testWidgets('1920×1080: Edit toolbar takes tools off and on, keeps 12 at most, resets, and is saved for the teacher', (tester) async {
    final (board, _) = await open(tester, const Size(1920, 1080));
    final defaults = ToolbarLayouts.defaults(phone: false, primary: false);
    expect(defaults, hasLength(ToolbarLayouts.panelMax));
    await openEditorFromMenu(tester);

    // Full: a 13th tool does not go on.
    await tapInEditor(tester, 'tbar-add-timer');
    expect(find.text('The toolbar is full: take a tool off first.'), findsOneWidget);
    expect(board.toolbarPanel, isNull);

    // Off with ×, on with +.
    await tapInEditor(tester, 'tbar-remove-redo');
    await tapInEditor(tester, 'tbar-add-timer');
    expect(board.toolbarPanel, [...defaults.where((t) => t != 'redo'), 'timer']);
    await tapInEditor(tester, 'tbar-done');
    expect(onToolbar('redo'), findsNothing);
    expect(onToolbar('tbar-timer'), findsOneWidget);
    // Redo is still in ⋯.
    await tester.tap(onToolbar('toolbar-more'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('more-sheet')), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('more-sheet')), matching: find.byKey(const Key('redo'))), findsOneWidget);
    Navigator.of(tester.element(find.byKey(const Key('more-sheet')))).pop();
    await tester.pumpAndSettle();

    // Saved under the signed-in teacher's profile.
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('setting.profile.t1.toolbarPanel'), contains('timer'));

    // A long press on the grip opens it too; Reset to default puts it back.
    await tester.longPress(find.byKey(const Key('toolbar-handle')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('toolbar-editor')), findsOneWidget);
    await tapInEditor(tester, 'tbar-reset');
    await tapInEditor(tester, 'tbar-done');
    expect(board.toolbarPanel, isNull);
    expect(onToolbar('redo'), findsOneWidget);
    expect(onToolbar('tbar-timer'), findsNothing);
    await close(tester, board);
  });

  testWidgets('1920×1080: every Tools tile, the new ones too, can go on the toolbar', (tester) async {
    final (board, _) = await open(tester, const Size(1920, 1080));
    await openEditorFromMenu(tester);
    for (final id in ['doc-camera', 'safe-web', 'live-captions', 'seating-chart', 'group-maker', 'magnifier', 'teacher-notes', 'exit-ticket', 'organisers', 'teaching-clock', 'scoreboard', 'exam-clock']) {
      expect(find.byKey(Key('tbar-add-drawer:$id')), findsOneWidget, reason: id);
    }
    await tapInEditor(tester, 'tbar-remove-redo');
    await tapInEditor(tester, 'tbar-add-drawer:scoreboard');
    await tapInEditor(tester, 'tbar-done');
    expect(onToolbar('tbar-drawer-scoreboard'), findsOneWidget);
    await tester.tap(onToolbar('tbar-drawer-scoreboard'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await close(tester, board);
  });

  testWidgets('1920×1080: tools drag onto the bar, off it and into order', (tester) async {
    final (board, _) = await open(tester, const Size(1920, 1080));
    await openEditorFromMenu(tester);
    // Off: drag Redo from the bar into More.
    Future<void> dragTo(Finder from, Finder to) async {
      final g = await tester.startGesture(tester.getCenter(from));
      await tester.pump(const Duration(milliseconds: 50));
      final end = tester.getCenter(to);
      for (var i = 1; i <= 10; i++) {
        await g.moveTo(Offset.lerp(tester.getCenter(from), end, i / 10)!);
        await tester.pump(const Duration(milliseconds: 16));
      }
      await g.up();
      await tester.pumpAndSettle();
    }

    final redo = find.descendant(of: find.byKey(const ValueKey('tbar-item-redo')), matching: find.byType(Draggable<String>));
    await tester.ensureVisible(redo);
    await tester.pumpAndSettle();
    await dragTo(redo, find.byKey(const Key('tbar-add-ruler')));
    expect(board.toolbarPanel, isNot(contains('redo')));
    // On: drag Redo back onto the bar.
    await tester.ensureVisible(find.byKey(const ValueKey('tbar-item-pen')));
    await tester.pumpAndSettle();
    await dragTo(find.byKey(const Key('tbar-add-redo')), find.byKey(const ValueKey('tbar-item-pen')));
    expect(board.toolbarPanel, contains('redo'));
    // In order: the pen's grip down below the AI pen.
    final grip = find.descendant(of: find.byKey(const ValueKey('tbar-item-pen')), matching: find.byIcon(Icons.drag_indicator));
    await tester.ensureVisible(grip);
    await tester.pumpAndSettle();
    final g = await tester.startGesture(tester.getCenter(grip));
    await tester.pump(const Duration(milliseconds: 100));
    final step = tester.getSize(find.byKey(const ValueKey('tbar-item-pen'))).height;
    for (var i = 1; i <= 10; i++) {
      await g.moveBy(Offset(0, step * 1.6 / 10));
      await tester.pump(const Duration(milliseconds: 16));
    }
    await g.up();
    await tester.pumpAndSettle();
    expect(board.toolbarPanel!.first, 'ai-pen');
    expect(board.toolbarPanel!.indexOf('pen'), greaterThan(0));
    await tapInEditor(tester, 'tbar-done');
    expect(tester.getCenter(onToolbar('tool-ai-pen')).dx, lessThan(tester.getCenter(onToolbar('tool-pen')).dx));
    await close(tester, board);
  });

  testWidgets('1920×1080: dock from the editor, or drag the grip to an edge and it snaps there', (tester) async {
    final (board, _) = await open(tester, const Size(1920, 1080));
    await openEditorFromMenu(tester);
    await tapInEditor(tester, 'tbar-dock-left');
    expect(board.toolbarDock, ToolbarDock.left);
    await tapInEditor(tester, 'tbar-done');
    expect(tester.getCenter(find.byKey(const Key('main-toolbar'))).dx, lessThan(200));
    // Drag the grip to the right edge: it docks there.
    await tester.dragFrom(tester.getCenter(find.byKey(const Key('toolbar-handle'))), const Offset(1700, 0));
    await tester.pumpAndSettle();
    expect(board.toolbarDock, ToolbarDock.right);
    expect(tester.getCenter(find.byKey(const Key('main-toolbar'))).dx, greaterThan(1700));
    // And back to the bottom, let go in the middle.
    await tester.dragFrom(tester.getCenter(find.byKey(const Key('toolbar-handle'))), const Offset(-900, 300));
    await tester.pumpAndSettle();
    expect(board.toolbarDock, ToolbarDock.bottom);
    await close(tester, board);
  });

  for (final size in const [Size(390, 844), Size(844, 390)]) {
    testWidgets('${size.width.toInt()}×${size.height.toInt()}: the phone bar takes 7 at most; a long press edits it', (tester) async {
      final (board, _) = await open(tester, size);
      final defaults = ToolbarLayouts.defaults(phone: true, primary: false);
      expect(defaults, hasLength(ToolbarLayouts.phoneMax));
      for (final key in ['tool-pen', 'tool-ai-pen', 'tool-erase', 'undo', 'tool-tools', 'panel-ai']) {
        expect(onPhoneBar(key), findsOneWidget, reason: key);
      }
      // The Laser is in ⋯.
      await tester.tap(find.byKey(const Key('phone-more')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('tool-laser')), findsOneWidget);
      Navigator.of(tester.element(find.byKey(const Key('more-sheet')))).pop();
      await tester.pumpAndSettle();

      await tester.longPress(find.byKey(const Key('phone-bar')), warnIfMissed: false);
      await tester.pumpAndSettle();
      if (find.byKey(const Key('toolbar-editor')).evaluate().isEmpty) {
        // Every spot of a full bar is a button: the editor is in ⋯ too.
        await tester.tap(find.byKey(const Key('phone-more')));
        await tester.pumpAndSettle();
        await tester.ensureVisible(find.byKey(const Key('more-customise-toolbar')));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const Key('more-customise-toolbar')));
        await tester.pumpAndSettle();
      }
      expect(find.byKey(const Key('toolbar-editor')), findsOneWidget);
      expect(find.byKey(const Key('tbar-dock')), findsNothing, reason: "a phone's bar stays at the bottom");
      await tapInEditor(tester, 'tbar-add-laser');
      expect(board.toolbarPhone, isNull, reason: 'full at 7');
      await tapInEditor(tester, 'tbar-remove-select');
      await tapInEditor(tester, 'tbar-add-laser');
      await tapInEditor(tester, 'tbar-done');
      expect(board.toolbarPhone, hasLength(7));
      expect(board.toolbarPanel, isNull, reason: "the panel's toolbar is its own");
      expect(onPhoneBar('tool-laser'), findsOneWidget);
      expect(onPhoneBar('tool-select'), findsNothing);
      await close(tester, board);
    });
  }
}
