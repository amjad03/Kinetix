import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/main.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/board_fonts.dart';
import 'support/fake_cloud.dart';

/// Clear page and Clear all pages: on the phone's More sheet, the rails and the bottom toolbar;
/// they ask first, and undo.
void main() {
  setUpAll(loadBoardFonts);
  setUp(() => SharedPreferences.setMockInitialValues({}));

  Future<void> tap(WidgetTester tester, String key) async {
    final f = find.byKey(Key(key));
    if (f.evaluate().isEmpty) {
      // Clearing is in the menu (bottom left; ⋮ on a phone).
      await tester.tap(find.byKey(const Key('board-menu')));
      await tester.pumpAndSettle();
    }
    await tester.ensureVisible(f);
    await tester.pumpAndSettle();
    await tester.tap(f);
    await tester.pumpAndSettle();
  }

  Future<void> scribble(WidgetTester tester, Offset at) async {
    final g = await tester.startGesture(at, kind: PointerDeviceKind.touch);
    for (var i = 1; i <= 5; i++) {
      await g.moveTo(at + Offset(i * 15.0, i * 6.0));
    }
    await g.up();
    await tester.pump();
  }

  const setups = [
    ('phone', Size(390, 844), ToolbarDock.bottom),
    ('phone landscape', Size(844, 390), ToolbarDock.bottom),
    ('panel', Size(1920, 1080), ToolbarDock.bottom),
    ('panel, toolbar at the left', Size(1920, 1080), ToolbarDock.left),
  ];
  for (final (name, size, layout) in setups) {
    testWidgets('$name: Clear page and Clear all pages ask first and undo', (tester) async {
      screenSize(tester, size);
      final board = await enrolledBoard();
      board.setToolbarDock(layout);
      board.onPaired('session-token', sessionIn('en'));
      await tester.pumpWidget(KinetixBoardApp(controller: board));
      await tester.pumpAndSettle();
      if (find.text('Not now').evaluate().isNotEmpty) {
        await tester.tap(find.text('Not now'));
        await tester.pumpAndSettle();
      }
      final wb = tester.widget<WhiteboardCanvas>(find.byType(WhiteboardCanvas)).controller;
      final mid = Offset(size.width / 2, size.height / 2);
      await scribble(tester, mid);
      wb.addPage();
      await tester.pump();
      await scribble(tester, mid);
      await scribble(tester, mid + const Offset(0, 60));
      expect(wb.elements, hasLength(2));

      // Cancel leaves it all.
      await tap(tester, 'clear-board');
      expect(find.byKey(const Key('clear-dialog')), findsOneWidget);
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(wb.elements, hasLength(2));

      // This page only; Undo brings it back.
      await tap(tester, 'clear-board');
      await tester.tap(find.byKey(const Key('clear-this-page')));
      await tester.pumpAndSettle();
      expect(wb.elements, isEmpty);
      expect(wb.pages.first.elements, hasLength(1));
      await tester.tap(find.byKey(const Key('message-action')));
      await tester.pumpAndSettle();
      expect(wb.elements, hasLength(2));

      // Every page; the message's Undo brings every page back.
      await tap(tester, 'clear-board');
      await tester.tap(find.byKey(const Key('clear-all-pages')));
      await tester.pumpAndSettle();
      expect(wb.isBlank, isTrue);
      await tester.tap(find.byKey(const Key('message-action')));
      await tester.pumpAndSettle();
      expect(wb.pages.map((p) => p.elements.length), [1, 2]);

      // The menu's Clear all pages asks "Clear all 2 pages?"; Cancel keeps them.
      await tap(tester, 'menu-clear-all');
      expect(find.text('Clear all 2 pages?'), findsOneWidget);
      await tester.tap(find.byKey(const Key('clear-cancel')));
      await tester.pumpAndSettle();
      expect(wb.pages.map((p) => p.elements.length), [1, 2]);
      await tap(tester, 'menu-clear-all');
      await tester.tap(find.byKey(const Key('clear-all-pages')));
      await tester.pumpAndSettle();
      expect(wb.isBlank, isTrue);
      await tester.tap(find.byKey(const Key('message-action')));
      await tester.pumpAndSettle();
      expect(wb.pages.map((p) => p.elements.length), [1, 2]);

      // The eraser's card asks "Clear this page?" too.
      if (find.byKey(const Key('tool-erase')).evaluate().isNotEmpty) {
        await tester.tap(find.byKey(const Key('tool-erase')));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const Key('tool-erase')));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const Key('clear-page')));
        await tester.pumpAndSettle();
        expect(find.text('Clear this page?'), findsOneWidget);
        expect(wb.elements, hasLength(2));
        await tester.tap(find.byKey(const Key('clear-this-page')));
        await tester.pumpAndSettle();
        expect(wb.elements, isEmpty);
        await tester.tap(find.byKey(const Key('message-action')));
        await tester.pumpAndSettle();
        expect(wb.elements, hasLength(2));
      }

      // The page overview asks for both.
      await tap(tester, 'page-overview');
      await tester.tap(find.byKey(const Key('overview-clear')));
      await tester.pumpAndSettle();
      expect(find.text('Clear this page?'), findsOneWidget);
      await tester.tap(find.byKey(const Key('clear-cancel')));
      await tester.pumpAndSettle();
      expect(wb.elements, hasLength(2));
      await tap(tester, 'page-overview');
      await tester.tap(find.byKey(const Key('overview-clear-all')));
      await tester.pumpAndSettle();
      expect(find.text('Clear all 2 pages?'), findsOneWidget);
      await tester.tap(find.byKey(const Key('clear-all-pages')));
      await tester.pumpAndSettle();
      expect(wb.isBlank, isTrue);
      expect(wb.canUndo, isTrue, reason: 'Undo is still there');

      await tester.pumpWidget(const SizedBox());
      board.dispose();
    });
  }
}
