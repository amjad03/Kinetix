import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_3d/kinetix_3d.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/features/board/chrome.dart';
import 'package:kinetix_board/features/board/kit/kit_panel.dart';
import 'package:kinetix_board/features/board/kit/subjects.dart';
import 'package:kinetix_board/features/board/layout/tools_drawer.dart';
import 'package:kinetix_board/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/board_fonts.dart';
import 'support/fake_cloud.dart';

/// Every tile of the tools drawer opens its own content: the kit tiles open their own tab of
/// the subject kit (whatever the period's subject: the fake session is a commerce class, which
/// used to open the commerce kit for the periodic table, logic gates, the dictionary ...), and
/// no other tile opens the kit.
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

  const kitTiles = {
    'drawer-formulas': KitTab.formulas,
    'drawer-stats': KitTab.stats,
    'drawer-periodic-table': KitTab.periodic,
    'drawer-physics-formulas': KitTab.physics,
    'drawer-constants': KitTab.constants,
    'drawer-accounts': KitTab.accounts,
    'drawer-finance': KitTab.finance,
    'drawer-algorithms': KitTab.algorithms,
    'drawer-cs-labs': KitTab.csLabs,
    'drawer-logic': KitTab.logic,
    'drawer-binary': KitTab.binary,
    'drawer-dictionary': KitTab.words,
    'drawer-timeline': KitTab.dates,
  };

  test('a requested tab joins the subject tabs straight after This lesson', () {
    final commerce = subjectStyles[Subject.commerce]!;
    final tabs = kitTabsWith(commerce, primary: false, requested: KitTab.periodic);
    expect(tabs.take(2), [KitTab.lesson, KitTab.periodic]);
    expect(kitTabsWith(commerce, primary: false, requested: KitTab.accounts), kitTabsFor(commerce, primary: false));
  });

  for (final size in const [Size(1920, 1080), Size(390, 844)]) {
    testWidgets('${size.width.toInt()}×${size.height.toInt()}: every Tools tile opens its own content', (tester) async {
      screenSize(tester, size);
      final wrong = <String>[];
      var boards = <BoardController>[];
      Future<void> fresh() async {
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
        if (find.text('Not now').evaluate().isNotEmpty) {
          await tester.tap(find.text('Not now'));
          await tester.pumpAndSettle();
        }
      }

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

      await fresh();
      await openTools();
      final tiles = [
        for (final e in find.descendant(of: find.byType(ToolsDrawer), matching: find.byType(ChromeTile)).evaluate()) (e.widget.key! as ValueKey<String>).value,
      ]..remove('drawer-calibrate');
      expect(tiles, containsAll(kitTiles.keys));
      for (final tile in tiles) {
        await fresh();
        await openTools();
        await tester.ensureVisible(find.byKey(Key(tile)));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(Key(tile)));
        for (var i = 0; i < 6; i++) {
          await tester.pump(const Duration(milliseconds: 200));
        }
        final kit = find.byType(SubjectKitPanel);
        final want = kitTiles[tile];
        if (want == null) {
          if (kit.evaluate().isNotEmpty) wrong.add('$tile opened the kit');
        } else {
          final chip = find.byKey(Key('kit-${want.name}'));
          if (kit.evaluate().isEmpty || chip.evaluate().isEmpty || !tester.widget<ChoiceChip>(chip).selected) {
            wrong.add('$tile did not open ${want.name} kit=${kit.evaluate().length} chip=${chip.evaluate().length}');
          }
        }
        tester.takeException();
      }
      expect(wrong, isEmpty);
      await tester.pumpWidget(const SizedBox());
      for (final b in boards) {
        b.dispose();
      }
    });
  }
}
