import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/features/board/board_screen.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/marks.dart';

/// Spec §10, §11.2, §61: the bottom toolbar's two groups, Switch, Hide/Restore, Screen Freeze
/// and the Add Page rule (the source document's developer acceptance summary).
void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  Future<BoardController> pump(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1920, 1080);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final board = BoardController()..skipEnrollment();
    await tester.pumpWidget(MaterialApp(theme: KinetixTheme.light(), home: BoardScreen(board: board)));
    await tester.pump();
    return board;
  }

  WhiteboardController wbOf(WidgetTester tester) => tester.widget<WhiteboardCanvas>(find.byType(WhiteboardCanvas)).controller;

  Future<void> tap(WidgetTester tester, String key) async {
    await tester.tap(find.byKey(Key(key)));
    await tester.pumpAndSettle();
  }

  testWidgets('left group: Switch, Profile/Guest, Share, WhatsApp, End class; right: Hide, pages, Switch', (tester) async {
    await pump(tester);
    for (final k in ['switch-sides', 'quick-profile', 'quick-share', 'quick-whatsapp', 'quick-end-class', 'hide-ui', 'previous-page', 'page-indicator', 'next-page', 'switch-sides-right']) {
      expect(find.byKey(Key(k)), findsOneWidget, reason: k);
    }
    expect(find.byTooltip('Guest'), findsWidgets, reason: 'no teacher signed in');
    expect(tester.getCenter(find.byKey(const Key('quick-share'))).dx, lessThan(400));
    expect(tester.getCenter(find.byKey(const Key('hide-ui'))).dx, greaterThan(1400));
  });

  testWidgets('Switch swaps the sides, keeps both groups working and is remembered', (tester) async {
    final board = await pump(tester);
    await tap(tester, 'switch-sides');
    expect(tester.getCenter(find.byKey(const Key('quick-share'))).dx, greaterThan(1400));
    expect(tester.getCenter(find.byKey(const Key('hide-ui'))).dx, lessThan(600));
    expect(board.sbPref('barsSwapped'), 'true');
    // Both still work after the swap.
    final wb = wbOf(tester);
    markPage(wb);
    await tester.pump();
    await tap(tester, 'add-page');
    expect(wb.pageCount, 2);
    await tap(tester, 'switch-sides-right');
    expect(tester.getCenter(find.byKey(const Key('quick-share'))).dx, lessThan(400));
    expect(board.sbPref('barsSwapped'), isNull);
  });

  testWidgets('Hide leaves the canvas and a restore button bottom left; Restore brings back the same page', (tester) async {
    await pump(tester);
    final wb = wbOf(tester);
    markPage(wb);
    await tester.pump();
    await tap(tester, 'add-page');
    await tap(tester, 'hide-ui');
    expect(find.byKey(const Key('main-toolbar')), findsNothing);
    expect(find.byKey(const Key('page-bar')), findsNothing);
    expect(find.byType(WhiteboardCanvas), findsOneWidget);
    final restore = tester.getCenter(find.byKey(const Key('restore-ui')));
    expect((restore.dx < 200, restore.dy > 900), (true, true));
    await tap(tester, 'restore-ui');
    expect(find.byKey(const Key('main-toolbar')), findsOneWidget);
    expect(find.text('2/2'), findsOneWidget);
  });

  testWidgets('Add Page is off on a blank page and on after a dot', (tester) async {
    await pump(tester);
    final wb = wbOf(tester);
    await tester.tap(find.byKey(const Key('add-page')), warnIfMissed: false);
    await tester.pumpAndSettle();
    expect(wb.pageCount, 1);
    markPage(wb);
    await tester.pump();
    await tap(tester, 'add-page');
    expect((wb.pageCount, wb.pageIndex), (2, 1));
  });

  testWidgets('Screen Freeze blocks pen and touch until Close, bottom left, then the board is as it was', (tester) async {
    await pump(tester);
    final wb = wbOf(tester);
    await tap(tester, 'board-menu');
    await tap(tester, 'menu-freeze');
    expect(find.byKey(const Key('screen-freeze')), findsOneWidget);
    final g = await tester.startGesture(const Offset(800, 400), kind: PointerDeviceKind.stylus);
    await g.moveBy(const Offset(120, 40));
    await g.up();
    await tester.pump();
    expect(wb.page.elements, isEmpty, reason: 'nothing drawn while frozen');
    final close = tester.getCenter(find.byKey(const Key('unfreeze')));
    expect((close.dx < 200, close.dy > 900), (true, true));
    await tap(tester, 'unfreeze');
    expect(find.byKey(const Key('screen-freeze')), findsNothing);
    final g2 = await tester.startGesture(const Offset(800, 400), kind: PointerDeviceKind.stylus);
    await g2.moveBy(const Offset(120, 40));
    await g2.up();
    await tester.pump();
    expect(wb.page.elements, isNotEmpty);
  });

  testWidgets('Share without an account still offers the PDF, and explains the link needs sign-in', (tester) async {
    await pump(tester);
    markPage(wbOf(tester));
    await tester.pump();
    await tester.tap(find.byKey(const Key('quick-share')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Share whiteboard'), findsOneWidget);
    // The PDF renders off the test clock.
    for (var i = 0; i < 20 && find.byKey(const Key('share-note')).evaluate().isEmpty; i++) {
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
      await tester.pump();
    }
    expect(find.byKey(const Key('share-note')), findsOneWidget);
    expect(tester.widget<OutlinedButton>(find.byKey(const Key('share-whatsapp'))).onPressed, isNull);
    expect(tester.widget<OutlinedButton>(find.byKey(const Key('share-other'))).onPressed, isNotNull);
  });
}
