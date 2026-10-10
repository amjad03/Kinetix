import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/fake_cloud.dart';

/// Light/dark must restyle the whole app: chrome and the profile menu take their colours from the theme.
void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  for (final t in [BoardTheme.light, BoardTheme.dark]) {
    testWidgets('chrome and menu follow the ${t.name} theme', (tester) async {
      screenSize(tester, const Size(1920, 1080));
      final board = await enrolledBoard();
      board.onPaired('t', sessionIn('en'));
      board.setTheme(t);
      await tester.pumpWidget(KinetixBoardApp(controller: board));
      await tester.pumpAndSettle();
      final scheme = Theme.of(tester.element(find.byKey(const Key('board-menu')))).colorScheme;
      expect(scheme.brightness, t == BoardTheme.dark ? Brightness.dark : Brightness.light);
      await tester.tap(find.byKey(const Key('board-menu')));
      await tester.pumpAndSettle();
      final item = find.byKey(const Key('menu-theme-toggle'));
      expect(item, findsOneWidget);
      final ctx = tester.element(item);
      final resolved = DefaultTextStyle.of(ctx).style.color ?? Theme.of(ctx).textTheme.bodyMedium?.color;
      expect(resolved, isNot(t == BoardTheme.dark ? Colors.black : Colors.white));
      final bg = tester.widgetList<Scaffold>(find.byType(Scaffold)).map((w) => w.backgroundColor).whereType<Color>();
      for (final c in bg) {
        expect(c.computeLuminance() < 0.5, t == BoardTheme.dark || c.a < 1, reason: 'scaffold bg must follow theme');
      }
      await tester.pumpWidget(const SizedBox());
      board.dispose();
    });
  }
}
