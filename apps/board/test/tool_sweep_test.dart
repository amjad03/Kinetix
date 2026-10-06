import 'package:kinetix_board/features/board/layout/tools_drawer.dart';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_3d/kinetix_3d.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/features/board/chrome.dart';
import 'package:kinetix_board/features/board/popovers.dart';
import 'package:kinetix_board/main.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/board_fonts.dart';
import 'support/fake_cloud.dart';

/// No dead buttons: every tool on the phone's bar and More sheet, the rails and the bottom
/// toolbar, and every tile in Tools, changes something when tapped (a tool, a popover, a
/// panel, a dialog, a message, the view or the page), at phone (390×844) and panel
/// (1920×1080) sizes.
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
    return '${wb.tool} ${wb.view.value.scale} ${wb.view.value.offset} ${wb.pageCount} ${wb.elements.length} ${wb.ruler.value.visible} '
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
    ('panel rails', Size(1920, 1080), ToolbarDock.bottom),
    ('panel bottom toolbar', Size(1920, 1080), ToolbarDock.left),
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
      final phone = size.width < 600;
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
        // Undo, redo, Clear, Fit and the pages need something to act on: their own tests cover them.
        return (found..removeAll(['undo', 'redo', 'previous-page', 'clear-board', 'zoom-fit', 'phone-more', 'end-class', 'show-tools'])).toList()..sort();
      }

      final keys = await buttons();
      expect(keys, containsAll(['tool-hand', 'tool-select', 'tool-write', 'tool-erase', 'tool-tools', 'panel-ai']));
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
      final labels = [for (final e in tiles.evaluate()) (e.widget as ChromeTile).label];
      expect(labels.length, greaterThan(15));
      for (final label in labels) {
        wb = await fresh();
        final before = signature(tester, wb);
        await openTools();
        final tile = find.descendant(of: find.byType(ToolsDrawer), matching: find.widgetWithText(ChromeTile, label));
        await tester.ensureVisible(tile);
        await tester.pumpAndSettle();
        await tester.tap(tile);
        await settle(tester);
        if (signature(tester, wb) == before) dead.add('Tools: $label');
      }
      expect(dead, isEmpty, reason: 'these did nothing');
      await tester.pumpWidget(const SizedBox());
      for (final b in boards) {
        b.dispose();
      }
    });
  }
}
