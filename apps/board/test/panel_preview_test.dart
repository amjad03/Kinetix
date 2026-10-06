import 'package:flutter/material.dart';
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
}
