import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_3d/kinetix_3d.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/main.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/board_fonts.dart';
import 'support/fake_cloud.dart';

/// The App theme (Board settings): light by default, never changed by the device type or the
/// layout, and every screen renders in each theme on a phone and on a panel.
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

  Brightness chrome(WidgetTester tester) => Theme.of(tester.element(find.byKey(const Key('undo')))).brightness;

  Future<BoardController> start(WidgetTester tester, Size size) async {
    screenSize(tester, size);
    final board = await enrolledBoard();
    board.onPaired('session-token', sessionIn('en'));
    await tester.pumpWidget(KinetixBoardApp(controller: board));
    await tester.pumpAndSettle();
    if (find.text('Not now').evaluate().isNotEmpty) {
      await tester.tap(find.text('Not now'));
      await tester.pumpAndSettle();
    }
    return board;
  }

  for (final size in [const Size(390, 844), const Size(1920, 1080)]) {
    final name = size.width < 600 ? 'phone' : 'panel';

    testWidgets('$name: choosing Interactive panel or the bottom toolbar keeps the light theme', (tester) async {
      final board = await start(tester, size);
      expect(board.theme, BoardTheme.light);
      expect(chrome(tester), Brightness.light);
      await tap(tester, 'profile-button');
      await tap(tester, 'menu-settings');
      await tester.ensureVisible(find.byKey(const Key('touch-panel')));
      await tester.tap(find.byKey(const Key('touch-panel')));
      await tester.pumpAndSettle();
      expect(board.touchProfile, TouchProfile.panel);
      expect(Theme.of(tester.element(find.byKey(const Key('touch-panel')))).brightness, Brightness.light);
      tester.state<NavigatorState>(find.byType(Navigator).first).pop();
      await tester.pumpAndSettle();
      expect(chrome(tester), Brightness.light);
      board.setLayout(BoardLayout.bottomBar);
      await tester.pumpAndSettle();
      expect(chrome(tester), Brightness.light);
      await tester.pumpWidget(const SizedBox());
      board.dispose();
    });

    for (final theme in BoardTheme.values) {
      testWidgets('$name, ${theme.name}: the board, its sheets, panels and dialogs render', (tester) async {
        final board = await start(tester, size);

        await tap(tester, 'profile-button');
        await tap(tester, 'menu-settings');
        await tester.ensureVisible(find.byKey(Key('theme-${theme.name}')));
        await tester.tap(find.byKey(Key('theme-${theme.name}')));
        await tester.pumpAndSettle();
        expect(board.theme, theme);
        final want = theme == BoardTheme.light || theme == BoardTheme.system ? Brightness.light : Brightness.dark;
        // The open dialog follows at once.
        expect(Theme.of(tester.element(find.byKey(Key('theme-${theme.name}')))).brightness, want);
        tester.state<NavigatorState>(find.byType(Navigator).first).pop();
        await tester.pumpAndSettle();
        expect(chrome(tester), want);
        final wb = tester.widget<WhiteboardCanvas>(find.byType(WhiteboardCanvas)).controller;
        expect(wb.background == BoardBackground.chalkboard, theme == BoardTheme.chalkboard);

        for (final panel in ['panel-ai', 'panel-books', 'panel-kit', 'panel-quiz', 'panel-homework']) {
          await tap(tester, panel);
          expect(find.byKey(const Key('panel-close')), findsWidgets, reason: panel);
          expect(Theme.of(tester.element(find.byKey(const Key('panel-close')).first)).brightness, want, reason: panel);
          await tester.tap(find.byKey(const Key('panel-close')).first);
          await tester.pumpAndSettle();
        }
        for (final popover in ['tool-tools', 'tool-shapes', 'tool-insert', 'tool-theme']) {
          await tap(tester, popover);
          final barrier = find.byKey(const Key('popover-barrier'));
          if (barrier.evaluate().isNotEmpty) {
            final r = tester.getRect(barrier);
            await tester.tapAt(Offset(r.center.dx, r.top + 40));
            await tester.pumpAndSettle();
          }
        }

        // Back to light: the chalkboard goes back to plain paper.
        board.setTheme(BoardTheme.light);
        await tester.pumpAndSettle();
        expect(chrome(tester), Brightness.light);
        expect(wb.background, BoardBackground.plain);
        await tester.pumpWidget(const SizedBox());
        board.dispose();
      });
    }
  }
}
