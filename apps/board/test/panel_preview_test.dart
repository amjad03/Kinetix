import 'package:flutter/material.dart';
import 'package:kinetix_board/features/board/chrome.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/features/preview/panel_preview.dart';
import 'package:kinetix_board/main.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/fake_cloud.dart';

/// Preview as interactive panel: on a phone the board is laid out as on a 1920 × 1080 panel,
/// scaled to fit, and still works: buttons and the pen land where they are drawn.
void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  Future<BoardController> pump(WidgetTester tester) async {
    screenSize(tester, const Size(844, 390));
    final board = await enrolledBoard();
    board.onPaired('t', sessionIn('en'));
    await tester.pumpWidget(KinetixBoardApp(controller: board));
    await tester.pumpAndSettle();
    return board;
  }

  testWidgets('the phone shows the panel layout, scaled, and it works', (tester) async {
    final board = await pump(tester);
    // A phone's bar first.
    expect(find.byKey(const Key('phone-bar')), findsOneWidget);
    board.setPanelPreview(true);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('phone-bar')), findsNothing);
    expect(find.byKey(const Key('main-toolbar')), findsOneWidget);
    final canvas = find.byType(WhiteboardCanvas);
    expect(tester.getSize(canvas), PanelPreview.panel);
    // On screen it is scaled down to the phone's height.
    final shown = tester.getRect(canvas);
    expect(shown.height, closeTo(390, 0.5));
    expect(shown.width, closeTo(390 * 16 / 9, 0.5));

    // A button in the scaled panel.
    final wb = tester.widget<WhiteboardCanvas>(canvas).controller;
    await tester.tap(find.byKey(const Key('tool-highlighter')));
    await tester.pumpAndSettle();
    expect(wb.tool, BoardTool.highlighter);

    // The pen writes where the finger is, in the panel's own coordinates.
    await tester.tap(find.byKey(const Key('tool-pen')));
    await tester.pumpAndSettle();
    final k = shown.width / PanelPreview.panel.width;
    final start = shown.topLeft + const Offset(800, 500) * k;
    await tester.dragFrom(start, const Offset(200, 0) * k);
    await tester.pumpAndSettle();
    final stroke = wb.elements.whereType<Stroke>().single;
    expect(stroke.points.first.offset.dx, closeTo(800, 30));
    expect(stroke.points.first.offset.dy, closeTo(500, 30));
    expect(stroke.points.last.offset.dx, closeTo(1000, 30));

    // The way out, beside the panel.
    await tester.tap(find.byKey(const Key('exit-panel-preview')));
    await tester.pumpAndSettle();
    expect(board.panelPreview, isFalse);
    expect(find.byKey(const Key('phone-bar')), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    board.dispose();
  });

  testWidgets('the menu turns it on', (tester) async {
    final board = await pump(tester);
    await tester.tap(find.byKey(const Key('board-menu')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('menu-preview')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('menu-preview')));
    await tester.pumpAndSettle();
    expect(board.panelPreview, isTrue);
    await tester.pumpWidget(const SizedBox());
    board.dispose();
  });

  // A phone on its side with a notch on the left, the status bar and a 3-button navigation bar
  // on the right, and the same phone upright (before it turns).
  const phones = [
    ('landscape, notch and nav bar', Size(915, 412), FakeViewPadding(left: 32, top: 24, right: 48)),
    ('upright', Size(412, 915), FakeViewPadding(top: 24, bottom: 48)),
    ('16:9 tablet', Size(1280, 720), FakeViewPadding(top: 24, bottom: 48)),
  ];
  for (final (name, size, pad) in phones) {
    testWidgets('$name: every button of the panel layout is on screen and can be tapped, and the way out too', (tester) async {
      screenSize(tester, size);
      tester.view.padding = pad;
      tester.view.viewPadding = pad;
      addTearDown(tester.view.resetPadding);
      addTearDown(tester.view.resetViewPadding);
      final board = await enrolledBoard();
      board.onPaired('t', sessionIn('en'));
      board.setPanelPreview(true);
      await tester.pumpWidget(KinetixBoardApp(controller: board));
      await tester.pumpAndSettle();
      if (find.text('Not now').evaluate().isNotEmpty) {
        await tester.tap(find.text('Not now'));
        await tester.pumpAndSettle();
      }
      final safe = Rect.fromLTRB(pad.left, pad.top, size.width - pad.right, size.height - pad.bottom);
      final exit = tester.getRect(find.byKey(const Key('exit-panel-preview')));
      final panel = tester.getRect(find.byType(WhiteboardCanvas));
      expect(safe.inflate(0.5).contains(exit.topLeft) && safe.inflate(0.5).contains(exit.bottomRight), isTrue, reason: 'exit $exit in $safe');
      expect(exit.overlaps(panel), isFalse, reason: 'the exit button leaves the panel clear');
      expect(safe.inflate(0.5).contains(panel.topLeft) && safe.inflate(0.5).contains(panel.bottomRight), isTrue, reason: 'panel $panel in $safe');

      // Every button of the layout: inside the safe area, and the top one where it is drawn.
      final buttons = find.byWidgetPredicate((w) => w.key is ValueKey<String> && (w is KxToolButton || w is ToolButton || w is ChromeTile || w is IconButton));
      final keys = [for (final e in buttons.evaluate()) (e.widget.key! as ValueKey<String>).value];
      expect(keys, containsAll(['board-menu', 'tool-pen', 'tool-highlighter', 'tool-erase', 'tool-tools', 'page-overview', 'add-page']));
      for (final k in keys) {
        final f = find.byKey(Key(k)).first;
        final r = tester.getRect(f);
        expect(safe.inflate(0.5).contains(r.center), isTrue, reason: '$k at $r is outside $safe');
        final hit = tester.hitTestOnBinding(r.center);
        final target = tester.renderObject(f);
        expect(hit.path.any((e) => e.target == target || (e.target is RenderObject && _isDescendant(e.target as RenderObject, target))), isTrue, reason: '$k is covered');
      }

      // Taps on the toolbar and the top bar work.
      final wb = tester.widget<WhiteboardCanvas>(find.byType(WhiteboardCanvas)).controller;
      await tester.tap(find.byKey(const Key('tool-highlighter')));
      await tester.pumpAndSettle();
      expect(wb.tool, BoardTool.highlighter);
      final pages = wb.pageCount;
      await tester.tap(find.byKey(const Key('add-page')));
      await tester.pumpAndSettle();
      expect(wb.pageCount, pages + 1);
      await tester.tap(find.byKey(const Key('board-menu')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('menu-preview')), findsOneWidget);
      await tester.tapAt(panel.center);
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('exit-panel-preview')));
      await tester.pumpAndSettle();
      expect(board.panelPreview, isFalse);
      await tester.pumpWidget(const SizedBox());
      board.dispose();
    });
  }
}

bool _isDescendant(RenderObject node, RenderObject ancestor) {
  RenderObject? n = node;
  while (n != null) {
    if (n == ancestor) return true;
    n = n.parent;
  }
  return false;
}
