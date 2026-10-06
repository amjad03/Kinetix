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
    if (f.evaluate().isEmpty && find.byKey(const Key('phone-more')).evaluate().isNotEmpty) {
      await tester.tap(find.byKey(const Key('phone-more')));
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
    ('panel rails', Size(1920, 1080), ToolbarDock.bottom),
    ('panel bottom toolbar', Size(1920, 1080), ToolbarDock.left),
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

      await tester.pumpWidget(const SizedBox());
      board.dispose();
    });
  }
}
