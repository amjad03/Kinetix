import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_3d/kinetix_3d.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/features/board/pen_config/pen_config_screen.dart';
import 'package:kinetix_board/features/classroom/seating.dart';
import 'package:kinetix_board/features/doc_camera/doc_camera.dart';
import 'package:kinetix_board/features/exit_ticket/exit_ticket.dart';
import 'package:kinetix_board/features/language_kit/language_kit.dart';
import 'package:kinetix_board/features/teaching_aids/organisers.dart';
import 'package:kinetix_board/l10n/l10n.dart';
import 'package:kinetix_board/main.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../screens/screens_test.dart' show Shot, sizes;
import '../support/fake_cloud.dart';
import '../support/screen_fonts.dart';
import 'contrast_test.dart' show lowContrast;

/// Every remaining panel and dialog of the board, in light and dark: no text or icon under 4.5:1.
final _full = <String, Future<void> Function(Shot s)>{
  'panel-3d': (s) => s.tab('model3d'),
  'panel-labs': (s) => s.tab('labs'),
  'panel-videos': (s) => s.tab('videos'),
  'panel-books': (s) => s.tab('books'),
  'panel-kit': (s) => s.tab('kit'),
  'panel-animations': (s) => s.tab('animations'),
  'panel-sims': (s) => s.tab('sims'),
  'panel-ai': (s) => s.tab('ai'),
  'sim-hub': (s) => s.tool('simhub'),
  'dictionary': (s) => s.tool('dictionary'),
  'mind-map': (s) => s.tool('mindmap'),
  'logic-gates': (s) => s.tool('logic-gates'),
  'settings': (s) => s.menu('menu-settings'),
  'profile': (s) => s.tap('profile-button'),
  'classrooms': (s) => s.profile('menu-classrooms'),
  'training': (s) => s.profile('menu-training'),
};

void main() {
  setUpAll(loadScreenFonts);
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
    Viewer3dEngine.debugOverride = FakeViewerEngine.new;
    ViewerManifest.debugLoad = (id) async =>
        ViewerManifest.fromJson(jsonDecode(File('../../packages/kinetix_3d/assets/viewer3d/models/$id.json').readAsStringSync()) as Map<String, dynamic>);
  });
  tearDown(() {
    Viewer3dEngine.debugOverride = null;
    ViewerManifest.debugLoad = null;
  });

  test('word card: ink on white', () {
    // Painted on the canvas (cards are white with dark ink in every theme).
    final l = const Color(0xFF1B1F24).computeLuminance();
    expect(1.05 / (l + 0.05), greaterThan(4.5));
  });

  for (final theme in [BoardTheme.light, BoardTheme.dark]) {
    testWidgets('full board panels: ${theme.name}', (tester) async {
      final screen = sizes.first;
      tester.view
        ..physicalSize = screen.size
        ..devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final bad = <String>[];
      for (final e in _full.entries) {
        await tester.pumpWidget(const SizedBox());
        SharedPreferences.setMockInitialValues({});
        FlutterSecureStorage.setMockInitialValues({});
        final board = await enrolledBoard();
        board.onPaired('session-token', sessionIn('en'));
        board.setTheme(theme);
        await tester.pumpWidget(KinetixBoardApp(controller: board));
        final s = Shot(tester, board, screen);
        await s.settle();
        final notNow = find.text(l10nFor(const Locale('en')).notNow);
        if (notNow.evaluate().isNotEmpty) {
          await tester.tap(notNow.first);
          await s.settle();
        }
        try {
          await e.value(s);
        } catch (err) {
          bad.add('${e.key}: open failed $err'.split('\n').first);
        }
        await s.settle(12);
        tester.takeException();
        if (s.missing.isNotEmpty) bad.add('${e.key}: control not found ${s.missing}');
        bad.addAll([for (final b in lowContrast()) '${e.key}: $b']);
        await tester.pumpWidget(const SizedBox());
        board.dispose();
      }
      expect(bad, isEmpty);
    }, timeout: const Timeout(Duration(minutes: 10)));
  }

  final direct = <String, Widget Function(BoardController b, WhiteboardController wb)>{
    'seat-plan': (b, wb) => SeatingChartPanel(board: b, wb: wb),
    'exit-ticket': (b, wb) => ExitTicketPanel(board: b, wb: wb),
    'organisers': (b, wb) => OrganisersPanel(wb: wb),
    'pen-config': (b, wb) => PenConfigScreen(board: b),
    'grammar': (b, wb) => LanguageKitPanel(board: b, wb: wb, initial: LanguageTab.grammar),
    'phonics': (b, wb) => LanguageKitPanel(board: b, wb: wb, initial: LanguageTab.phonics),
    'dictionary-panel': (b, wb) => LanguageKitPanel(board: b, wb: wb),
    'word-cards': (b, wb) => LanguageKitPanel(board: b, wb: wb, initial: LanguageTab.cards),
    'camera': (b, wb) => DocCameraPanel(wb: wb),
  };
  for (final dark in [false, true]) {
    testWidgets('direct panels: ${dark ? 'dark' : 'light'}', (tester) async {
      tester.view
        ..physicalSize = const Size(900, 1000)
        ..devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final board = await enrolledBoard();
      final wb = WhiteboardController();
      final bad = <String>[];
      for (final e in direct.entries) {
        await tester.pumpWidget(
          MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: dark ? KinetixTheme.boardChrome() : KinetixTheme.board(),
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            home: Scaffold(body: e.value(board, wb)),
          ),
        );
        await tester.pump(const Duration(milliseconds: 400));
        tester.takeException();
        bad.addAll([for (final b in lowContrast()) '${e.key}: $b']);
      }
      await tester.pumpWidget(const SizedBox());
      expect(bad, isEmpty);
    });
  }
}
