import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_3d/kinetix_3d.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/features/board/chrome.dart';
import 'package:kinetix_board/features/board/layout/tools_drawer.dart';
import 'package:kinetix_board/main.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/board_fonts.dart';
import 'support/fake_cloud.dart';

/// No dead buttons: every button of the layout (the phone's bar and its ⋯ sheet, the main
/// toolbar docked at the bottom or an edge, the corners) and every tile in the tools drawer
/// changes something when tapped (a tool, a popover, the panel, a dialog, a message, the view
/// or the page), on phones (390×844 upright, 844×390 on its side) and a panel (1920×1080).
void main() {
  setUpAll(loadBoardFonts);
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    Viewer3dEngine.debugOverride = FakeViewerEngine.new;
    ViewerManifest.debugLoad = (id) async =>
        ViewerManifest.fromJson(jsonDecode(File('../../packages/kinetix_3d/assets/viewer3d/models/$id.json').readAsStringSync()) as Map<String, dynamic>);
  });
  tearDown(() {
    Viewer3dEngine.debugOverride = null;
    ViewerManifest.debugLoad = null;
  });

  /// What the screen shows and the board holds, to tell a tap that did something.
  String signature(WidgetTester tester, WhiteboardController wb) {
    final keys = <String>{
      for (final e in find.byWidgetPredicate((w) => w.key is ValueKey<String>).evaluate()) (e.widget.key! as ValueKey<String>).value,
    }..removeWhere((k) => k.startsWith('page-indicator'));
    final texts = find.byType(SnackBar).evaluate().length;
    final look = Theme.of(tester.element(find.byType(WhiteboardCanvas).first)).colorScheme.surface;
    return '$look ${wb.tool} ${wb.view.value.scale} ${wb.view.value.offset} ${wb.pageCount} ${wb.elements.length} ${wb.ruler.value.visible} '
        '${wb.protractor.value.visible} $texts ${find.byType(Dialog).evaluate().length} ${find.byWidgetPredicate((w) => w is PopupMenuEntry).evaluate().length} ${(keys.toList()..sort()).join(',')}';
  }

  Future<void> settle(WidgetTester tester) async {
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 150)));
    for (var i = 0; i < 6; i++) {
      await tester.pump(const Duration(milliseconds: 250));
    }
  }

  const setups = [
    ('phone', Size(390, 844), ToolbarDock.bottom),
    ('phone landscape', Size(844, 390), ToolbarDock.bottom),
    ('panel', Size(1920, 1080), ToolbarDock.bottom),
    ('panel, toolbar at the left', Size(1920, 1080), ToolbarDock.left),
  ];

  for (final (name, size, layout) in setups) {
    testWidgets('$name: every tool and every Tools tile does something', (tester) async {
      screenSize(tester, size);
      final dead = <String>[];
      var boards = <BoardController>[];

      Future<WhiteboardController> fresh() async {
        await tester.pumpWidget(const SizedBox());
        for (final b in boards) {
          b.dispose();
        }
        final board = await enrolledBoard();
        boards = [board];
        board.setToolbarDock(layout);
        board.onPaired('session-token', sessionIn('en'));
        await tester.pumpWidget(KinetixBoardApp(controller: board));
        await tester.pumpAndSettle();
        if (find.text('Not now').evaluate().isNotEmpty) {
          await tester.tap(find.text('Not now'));
          await tester.pumpAndSettle();
        }
        return tester.widget<WhiteboardCanvas>(find.byType(WhiteboardCanvas)).controller;
      }

      var wb = await fresh();
      final phone = size.shortestSide < 600;
      // The buttons of this layout (the phone's More sheet holds the rest).
      Future<List<String>> buttons() async {
        final found = <String>{};
        void collect() {
          for (final e in find.byWidgetPredicate((w) => w.key is ValueKey<String> && (w is KxToolButton || w is ToolButton || w is ChromeTile || w is IconButton)).evaluate()) {
            found.add((e.widget.key! as ValueKey<String>).value);
          }
        }

        collect();
        if (phone) {
          await tester.tap(find.byKey(const Key('phone-more')));
          await tester.pumpAndSettle();
          collect();
          Navigator.of(tester.element(find.byKey(const Key('more-sheet')))).pop();
          await tester.pumpAndSettle();
        }
        // Undo, redo, Clear, Fit and the pages need something to act on (Add Page needs a page
        // with something on it); Switch only moves the bars: their own tests cover them.
        return (found..removeAll(['undo', 'redo', 'previous-page', 'next-page', 'clear-board', 'zoom-fit', 'phone-more', 'end-class', 'add-page', 'tbar-add-page', 'switch-sides', 'switch-sides-right'])).toList()..sort();
      }

      final keys = await buttons();
      expect(keys, containsAll(['tool-pen', 'tool-highlighter', 'tool-select', 'tool-erase', 'tool-shapes', 'tool-tools', 'tool-insert', 'panel-ai', 'page-overview']));
      for (final key in keys) {
        wb = await fresh();
        // From the More sheet too, compared with the board before the sheet opened.
        final before = signature(tester, wb);
        final f = find.byKey(Key(key));
        if (f.evaluate().isEmpty && phone) {
          await tester.tap(find.byKey(const Key('phone-more')));
          await tester.pumpAndSettle();
        }
        await tester.ensureVisible(f.first);
        await tester.pumpAndSettle();
        await tester.tap(f.first, warnIfMissed: false);
        await settle(tester);
        if (signature(tester, wb) == before) dead.add(key);
        final error = tester.takeException();
        if (error != null) dead.add('$key: $error');
      }

      // Every tile in Tools.
      wb = await fresh();
      Future<void> openTools() async {
        final t = find.byKey(const Key('tool-tools'));
        if (t.evaluate().isEmpty) {
          await tester.tap(find.byKey(const Key('phone-more')));
          await tester.pumpAndSettle();
        }
        await tester.ensureVisible(t);
        await tester.pumpAndSettle();
        await tester.tap(t);
        await tester.pumpAndSettle();
      }

      await openTools();
      final tiles = find.descendant(of: find.byType(ToolsDrawer), matching: find.byType(ChromeTile));
      final labels = [for (final e in tiles.evaluate()) (e.widget.key! as ValueKey<String>).value];
      expect(labels.length, greaterThan(40));
      // Calibrating keeps its scale for the device once read (a cache across tests): the canvas
      // tools' own tests cover it.
      labels.remove('drawer-calibrate');
      for (final label in labels) {
        wb = await fresh();
        final before = signature(tester, wb);
        await openTools();
        final tile = find.byKey(Key(label));
        await tester.ensureVisible(tile);
        await tester.pumpAndSettle();
        await tester.tap(tile);
        await settle(tester);
        if (signature(tester, wb) == before) dead.add('Tools: $label');
        final error = tester.takeException();
        if (error != null) dead.add('Tools: $label: $error');
      }
      expect(dead, isEmpty, reason: 'these did nothing or threw');
      await tester.pumpWidget(const SizedBox());
      for (final b in boards) {
        b.dispose();
      }
    });

    if (layout != ToolbarDock.bottom) continue;
    testWidgets('$name: every item of the menu and the profile menu does something', (tester) async {
      screenSize(tester, size);
      final dead = <String>[];
      var boards = <BoardController>[];
      Future<WhiteboardController> fresh() async {
        await tester.pumpWidget(const SizedBox());
        for (final b in boards) {
          b.dispose();
        }
        SharedPreferences.setMockInitialValues({});
        final board = await enrolledBoard();
        boards = [board];
        board.onPaired('session-token', sessionIn('en'));
        await tester.pumpWidget(KinetixBoardApp(controller: board));
        await tester.pumpAndSettle();
        final wb = tester.widget<WhiteboardCanvas>(find.byType(WhiteboardCanvas)).controller;
        // Something on the page, so Save, Share and Clear have something to act on.
        wb.insert([TextElement(id: 'sweep', position: const Offset(200, 200), text: 'x', color: WhiteboardController.inkBlack, fontSize: 40, size: const Size(30, 40))]);
        wb.clearSelection();
        await tester.pumpAndSettle();
        return wb;
      }

      final phone = size.shortestSide < 600;
      Future<void> openMenu(String menu) async {
        if (menu == 'profile' && phone) {
          await tester.tap(find.byKey(const Key('board-menu')));
          await tester.pumpAndSettle();
          await tester.ensureVisible(find.byKey(const Key('profile-button')));
          await tester.pumpAndSettle();
          await tester.tap(find.byKey(const Key('profile-button')));
        } else {
          await tester.tap(find.byKey(Key(menu == 'profile' ? 'profile-button' : 'board-menu')));
        }
        await tester.pumpAndSettle();
      }

      // The file picker is the platform's (the insert tests cover importing).
      const skip = {'menu-import', 'profile-button', 'kiosk-exit-version'};
      for (final menu in ['menu', 'profile']) {
        var wb = await fresh();
        await openMenu(menu);
        final items = [
          for (final e in find.byWidgetPredicate((w) => w is ListTile && w.key is ValueKey<String> && w.enabled).evaluate()) (e.widget.key! as ValueKey<String>).value,
        ]..removeWhere(skip.contains);
        expect(items, isNotEmpty, reason: menu);
        for (final key in items) {
          wb = await fresh();
          // Compared with the board before the menu opened: an item that only closes the menu
          // did nothing.
          final before = signature(tester, wb);
          await openMenu(menu);
          final f = find.byKey(Key(key));
          await tester.ensureVisible(f.first);
          await tester.pumpAndSettle();
          await tester.tap(f.first, warnIfMissed: false);
          await settle(tester);
          if (signature(tester, wb) == before) dead.add('$menu: $key');
          final error = tester.takeException();
          if (error != null) dead.add('$menu: $key: $error');
        }
      }
      expect(dead, isEmpty, reason: 'these did nothing or threw');
      await tester.pumpWidget(const SizedBox());
      for (final b in boards) {
        b.dispose();
      }
    });
  }
}
