import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/features/board/panel/split_panel.dart';
import 'package:kinetix_board/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/fake_cloud.dart';

/// The bar between the board and the split panel: a finger, a pen or the mouse drags it,
/// between 30 % and 60 % of the width, and it snaps when let go near 30, 40, 50 or 60 %.
void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('snapping', () {
    expect(snapPanelFraction(0.48), 0.5);
    expect(snapPanelFraction(0.45), 0.45);
    expect(snapPanelFraction(0.1), panelMin);
    expect(snapPanelFraction(0.9), panelMax);
  });

  Future<BoardController> open(WidgetTester tester, Size size) async {
    screenSize(tester, size);
    final board = await enrolledBoard();
    board.onPaired('t', sessionIn('en'));
    await tester.pumpWidget(KinetixBoardApp(controller: board));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('panel-ai')));
    await tester.pumpAndSettle();
    return board;
  }

  double share(WidgetTester tester, Size size) => tester.getSize(find.byKey(const Key('split-panel'))).width / size.width;

  for (final (name, size) in [('panel', Size(1920, 1080)), ('phone on its side', Size(844, 390))]) {
    for (final kind in [PointerDeviceKind.touch, PointerDeviceKind.mouse, PointerDeviceKind.stylus]) {
      testWidgets('$name: the divider drags with ${kind.name}', (tester) async {
        final board = await open(tester, size);
        final divider = find.byKey(const Key('panel-divider'));
        expect(tester.getSize(divider).width, greaterThanOrEqualTo(24));
        final start = share(tester, size);
        // Drag left by a fifth of the screen: the panel grows (and stops at 60 %).
        await tester.dragFrom(tester.getCenter(divider), Offset(-size.width / 5, 0), kind: kind);
        await tester.pumpAndSettle();
        expect(share(tester, size), greaterThan(start + 0.05));
        expect(share(tester, size), lessThanOrEqualTo(panelMax + 0.001));
        // All the way right: 30 %.
        await tester.dragFrom(tester.getCenter(divider), Offset(size.width, 0), kind: kind);
        await tester.pumpAndSettle();
        expect(share(tester, size), closeTo(panelMin, 0.001));
        // Near a half: snaps to it.
        final x = tester.getCenter(divider).dx;
        await tester.dragFrom(tester.getCenter(divider), Offset(size.width * 0.49 - panelDividerWidth / 2 - x, 0), kind: kind);
        await tester.pumpAndSettle();
        expect(share(tester, size), closeTo(0.5, 0.001));
        await tester.pumpWidget(const SizedBox());
        board.dispose();
      });
    }
  }
}
