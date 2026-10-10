import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_3d/kinetix_3d.dart';
import 'package:kinetix_board/features/board/side_panel.dart';
import 'package:kinetix_board/l10n/l10n.dart';
import 'package:kinetix_board/main.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../support/board_fonts.dart';
import '../support/fake_cloud.dart';

/// The universal search on a panel: the top bar's button and Ctrl+K open it; a result opens
/// its model, lab or tool, or puts its formula on the board.
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

  for (final lang in ['en', 'hi', 'kn']) {
    testWidgets('$lang on a 1920×1080 panel: Ctrl+K, the top bar, models, labs and formulas', (tester) async {
      screenSize(tester, const Size(1920, 1080));
      final l = lookupAppLocalizations(Locale(lang));
      final board = await enrolledBoard();
      board.setBoardLanguage(BoardLanguage.tryParse(lang)!);
      board.onPaired('session-token', sessionIn(lang));
      await tester.pumpWidget(KinetixBoardApp(controller: board));
      await tester.pumpAndSettle();
      await tester.tap(find.text(l.notNow));
      await tester.pumpAndSettle();
      final wb = tester.widget<WhiteboardCanvas>(find.byType(WhiteboardCanvas)).controller;

      // Ctrl+K opens it; a typo still finds the lab, which opens beside the board.
      await tester.sendKeyDownEvent(LogicalKeyboardKey.controlLeft);
      await tester.sendKeyEvent(LogicalKeyboardKey.keyK);
      await tester.sendKeyUpEvent(LogicalKeyboardKey.controlLeft);
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('universal-search')), findsOneWidget);
      await tester.enterText(find.byKey(const Key('universal-search-field')), 'glass slab refracton');
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('result-lab-glass-slab')));
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.byType(SplitPanel), findsOneWidget);
      expect(tester.widget<SplitPanel>(find.byType(SplitPanel)).itemId, 'glass-slab');

      // The top bar's button; a formula goes on the board.
      expect(tester.takeException(), isNull);
      // The split panel covers the top bar; close it first.
      await tester.tap(find.byKey(const Key('panel-close')).first);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('open-search')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('universal-search-field')), 'pythagoras');
      await tester.pumpAndSettle();
      final formula = find.byWidgetPredicate((w) => w is ListTile && '${w.key}'.contains('result-formula-'));
      expect(formula, findsWidgets);
      final before = wb.elements.length;
      await tester.tap(formula.first);
      await tester.pumpAndSettle();
      expect(wb.elements.length, before + 1);
      expect(wb.elements.last, isA<MathElement>());

      // A tool by its name in the board's language.
      await tester.tap(find.byKey(const Key('open-search')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('universal-search-field')), l.toolRuler);
      await tester.pumpAndSettle();
      await tester.tap(find.byWidgetPredicate((w) => w is ListTile && '${w.key}'.contains('result-tool-')).first);
      await tester.pumpAndSettle();
      expect(wb.geoTools.value.map((t) => t.kind), contains(GeoKind.ruler));
      expect(tester.takeException(), isNull);
      board.dispose();
    });
  }
}
