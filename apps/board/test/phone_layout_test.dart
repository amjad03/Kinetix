import 'package:kinetix_board/features/board/panel/split_panel.dart';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_3d/kinetix_3d.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/core/models.dart';
import 'package:kinetix_board/core/outbox_store.dart';
import 'package:kinetix_board/demo/demo.dart';
import 'package:kinetix_board/demo/demo_server.dart';
import 'package:kinetix_board/features/board/chrome.dart' show ChromeTile;
import 'package:kinetix_board/features/search/search_strings.dart';
import 'package:kinetix_board/features/search/solids3d.dart';
import 'package:kinetix_board/features/broadcast/broadcast_overlay.dart';
import 'package:kinetix_board/features/enrollment/enroll_screen.dart';
import 'package:kinetix_board/features/sims/sims.dart';
import 'package:kinetix_board/l10n/l10n.dart';
import 'package:kinetix_board/main.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/board_fonts.dart';
import 'support/fake_cloud.dart';

/// The board on phones (the demo APK on a teacher's phone): portrait and landscape, in
/// English, Hindi and Kannada (the longer strings). Every screen, popover, panel and dialog
/// must fit: any overflow or exception fails the test and names the step it happened in.
const phoneSizes = [Size(360, 640), Size(390, 844), Size(844, 390)];

/// Collects every Flutter error (overflows included) under the step it happened in.
class _Problems {
  _Problems(this.label);
  final String label;
  final found = <String>[];
  String step = 'start';
  FlutterExceptionHandler? _previous;

  void start() {
    _previous = FlutterError.onError;
    FlutterError.onError = (d) {
      // Where: the widget that overflowed, in the board's own code.
      final at = RegExp(r'(lib|packages)/[\w/]+\.dart:\d+').allMatches(d.toString()).map((m) => m[0]).toSet().take(2).join(', ');
      found.add('$label, $step: ${d.exceptionAsString().split('\n').first} ($at)');
    };
  }

  void stop() => FlutterError.onError = _previous;
}

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

  /// Runs [body] with every error collected, then fails listing them all.
  Future<void> collecting(WidgetTester tester, String label, Future<void> Function(_Problems p) body) async {
    final p = _Problems(label)..start();
    try {
      await body(p);
    } catch (e, st) {
      fail('$label, ${p.step}: $e\n${st.toString().split('\n').where((l) => l.contains('phone_layout_test')).join('\n')}\n${p.found.join('\n')}');
    } finally {
      p.stop();
    }
    expect(tester.takeException(), isNull, reason: '$label, ${p.step}');
    expect(p.found, isEmpty, reason: p.found.join('\n'));
  }

  Future<void> tap(WidgetTester tester, Finder f) async {
    await tester.ensureVisible(f);
    await tester.pumpAndSettle();
    // Reachable: on screen and not covered (a dialog that clips its content hides it).
    if (f.hitTestable().evaluate().isEmpty) {
      // A board message (a snackbar) passes in a few seconds.
      for (final m in find.byType(ScaffoldMessenger).evaluate()) {
        (m as StatefulElement).state is ScaffoldMessengerState ? (m.state as ScaffoldMessengerState).removeCurrentSnackBar() : null;
      }
      await tester.pumpAndSettle();
    }
    if (f.hitTestable().evaluate().isEmpty) {
      final at = tester.getCenter(f);
      final over = tester.hitTestOnBinding(at).path.take(40).map((e) => e.target.runtimeType).join(' | ');
      fail('not reachable: $f at $at, under: $over');
    }
    await tester.tap(f);
    await tester.pumpAndSettle();
  }

  /// Taps a control: on the phone's bar, in its ⋯ sheet, or in the ⋮ menu.
  Future<void> tapKey(WidgetTester tester, String key) async {
    final f = find.byKey(Key(key));
    if (f.evaluate().isEmpty) {
      await tap(tester, find.byKey(const Key('phone-more')));
      expect(find.byKey(const Key('more-sheet')), findsOneWidget);
      if (f.evaluate().isEmpty) {
        Navigator.of(tester.element(find.byKey(const Key('more-sheet')))).pop();
        await tester.pumpAndSettle();
        await tap(tester, find.byKey(const Key('board-menu')));
      }
    }
    await tap(tester, f);
  }

  /// Opens the split panel at [tab], pulled up to fill a phone held upright.
  Future<void> openTab(WidgetTester tester, String tab) async {
    if (find.byKey(const Key('split-panel')).evaluate().isEmpty) await tapKey(tester, 'panel-ai');
    final grabber = find.byKey(const Key('panel-grabber'));
    if (grabber.evaluate().isNotEmpty && tester.getTopLeft(find.byKey(const Key('split-panel'))).dy > 1) {
      await tester.drag(grabber, const Offset(0, -2000));
      await tester.pumpAndSettle();
    }
    // On its side the panel takes half the width; ⤢ gives the browsers the whole screen.
    final full = find.byKey(const Key('panel-full'));
    if (full.evaluate().isNotEmpty && tester.getSize(find.byKey(const Key('split-panel'))).width < tester.view.physicalSize.width / tester.view.devicePixelRatio) {
      await tap(tester, full);
    }
    await tap(tester, find.byKey(Key('panel-tab-$tab')));
  }

  /// Taps something in a full-screen panel, scrolling to it.
  Future<void> tapInPanel(WidgetTester tester, String key) async {
    final f = find.byKey(Key(key));
    if (f.evaluate().isEmpty) {
      final down = find.byWidgetPredicate((w) => w is Scrollable && w.axisDirection == AxisDirection.down);
      await tester.scrollUntilVisible(f, 200, scrollable: find.descendant(of: find.byType(SplitPanelFrame), matching: down).first);
    }
    await tap(tester, f);
  }

  /// [f] is wholly on the screen.
  void onScreen(WidgetTester tester, Finder f, Size size) {
    final r = tester.getRect(f);
    expect((Offset.zero & size).inflate(0.5).contains(r.topLeft) && (Offset.zero & size).inflate(0.5).contains(r.bottomRight), isTrue, reason: '$f at $r');
  }

  Future<void> closePopover(WidgetTester tester) async {
    // Gone already: a dialog that opened in the split panel put it away.
    if (find.byKey(const Key('popover-barrier')).evaluate().isEmpty) return;
    // Over the top bar: popovers on a phone open below it.
    final r = tester.getRect(find.byKey(const Key('popover-barrier')));
    await tester.tapAt(Offset(r.center.dx, r.top + 40));
    await tester.pumpAndSettle();
  }

  /// Closes the split panel (where dialogs open), or else the dialog or sheet on top.
  Future<void> closeDialog(WidgetTester tester) async {
    final close = find.byKey(const Key('panel-close'));
    if (close.hitTestable().evaluate().isNotEmpty) {
      await tester.tap(close);
    } else {
      tester.state<NavigatorState>(find.byType(Navigator).first).pop();
    }
    await tester.pumpAndSettle();
  }

  for (final lang in ['en', 'hi', 'kn']) {
    for (final size in phoneSizes) {
      final name = '$lang at ${size.width.toInt()}×${size.height.toInt()}';

      testWidgets('$name: the board, its bar, the More sheet, popovers, the toolkit and dialogs fit', (tester) async {
        screenSize(tester, size);
        final l = lookupAppLocalizations(Locale(lang));
        final board = await enrolledBoard();
        board.setBoardLanguage(BoardLanguage.tryParse(lang)!);
        board.onPaired('session-token', sessionIn(lang));
        await tester.pumpWidget(KinetixBoardApp(controller: board));
        await tester.pumpAndSettle();
        await collecting(tester, name, (p) async {
          p.step = 'board';
          // The toolbar is a bottom bar with ⋯; touch targets are at least 40 px.
          expect(find.byKey(const Key('phone-more')), findsOneWidget);
          for (final key in ['tool-pen', 'tool-highlighter', 'tool-erase', 'tool-select', 'tool-shapes', 'undo', 'phone-more', 'board-menu', 'open-search', 'page-overview']) {
            final r = tester.getRect(find.byKey(Key(key)));
            expect(r.width >= 40 && r.height >= 40, isTrue, reason: '$key is $r');
            expect(Offset.zero & size, isA<Rect>().having((s) => s.contains(r.center), 'on screen', isTrue), reason: key);
          }

          // The offer of a PIN fits over the board; "Not now" puts it away.
          p.step = 'PIN offer';
          expect(find.byKey(const Key('pin-offer')), findsOneWidget);
          await tap(tester, find.text(l.notNow));

          p.step = 'ink';
          final g = await tester.startGesture(Offset(size.width / 3, size.height / 2), pointer: 9, kind: PointerDeviceKind.touch);
          for (var i = 0; i < 5; i++) {
            await g.moveBy(const Offset(20, 10));
          }
          await g.up();
          await tester.pumpAndSettle();
          final wb = tester.widget<WhiteboardCanvas>(find.byType(WhiteboardCanvas)).controller;
          expect(wb.elements, hasLength(1));

          p.step = 'pen popover';
          await tapKey(tester, 'tool-pen');
          if (find.text(l.thickness).evaluate().isEmpty) await tapKey(tester, 'tool-pen');
          expect(find.text(l.thickness), findsOneWidget);
          await tap(tester, find.byKey(const Key('pen-colour-custom')));
          expect(find.byKey(const Key('colour-wheel')), findsOneWidget);
          await closePopover(tester);
          p.step = 'erase popover';
          await tapKey(tester, 'tool-erase');
          await tapKey(tester, 'tool-erase');
          expect(find.byKey(const Key('clear-page')), findsOneWidget);
          await closePopover(tester);
          await tapKey(tester, 'tool-pen');
          p.step = 'insert popover';
          await tapKey(tester, 'tool-insert');
          expect(find.byKey(const Key('insert-equation')), findsOneWidget);
          await closePopover(tester);

          p.step = 'pages';
          await tap(tester, find.byKey(const Key('add-page')));
          expect(find.text('2/2'), findsOneWidget);
          await tap(tester, find.byKey(const Key('previous-page')));
          await tap(tester, find.byKey(const Key('page-overview')));
          expect(find.byKey(const Key('page-thumb-1')), findsOneWidget);
          await closePopover(tester);

          p.step = '⋯ sheet';
          await tap(tester, find.byKey(const Key('phone-more')));
          expect(find.byKey(const Key('more-sheet')), findsOneWidget);
          Navigator.of(tester.element(find.byKey(const Key('more-sheet')))).pop();
          await tester.pumpAndSettle();

          for (final key in ['tool-shapes', 'tool-theme', 'tool-tools']) {
            p.step = key;
            await tapKey(tester, key);
            expect(find.byKey(const Key('popover-barrier')), findsOneWidget, reason: key);
            await closePopover(tester);
          }
          p.step = 'AI pen';
          await tapKey(tester, 'tool-pen');
          await tap(tester, find.byKey(const Key('pen-type-aiPen')));
          expect(find.byKey(const Key('ai-convert-maths')), findsOneWidget);
          await closePopover(tester);
          await tapKey(tester, 'tool-highlighter');
          await tapKey(tester, 'tool-highlighter');
          expect(find.text(l.thickness), findsOneWidget);
          await closePopover(tester);

          p.step = 'eye comfort';
          await tapKey(tester, 'tool-tools');
          await tap(tester, find.byKey(const Key('drawer-eye-comfort')));
          expect(find.text(l.adjustSchoolDay), findsOneWidget);
          await closePopover(tester);
          for (final key in ['timer', 'picker', 'stopwatch', 'dice', 'spinner', 'noise']) {
            p.step = 'toolkit $key';
            await tapKey(tester, 'tool-tools');
            await tap(tester, find.byKey(Key('drawer-toolkit-$key')));
            if (key == 'timer') {
              p.step = 'timer keypad';
              await tap(tester, find.byKey(const Key('timer-set')));
              await tap(tester, find.byKey(const Key('timer-setter-done')));
            }
            onScreen(tester, find.byKey(Key('toolkit-$key')), size);
            await tap(tester, find.byKey(Key('toolkit-close-$key')));
          }
          p.step = 'screen shade';
          await tapKey(tester, 'tool-tools');
          await tap(tester, find.byKey(const Key('drawer-toolkit-curtain')));
          expect(find.text(l.tkDragToReveal), findsOneWidget);
          await tap(tester, find.byKey(const Key('curtain-remove')));
          p.step = 'simulations';
          await tapKey(tester, 'tool-tools');
          await tap(tester, find.byKey(const Key('drawer-sims')));
          await tap(tester, find.byKey(const Key('open-sim-pythagoras')));
          p.step = 'pythagoras';
          onScreen(tester, find.byType(SimWindow), size);
          await tap(tester, find.byKey(const Key('sim-close')));

          p.step = 'equation editor';
          await tapKey(tester, 'tool-insert');
          await tap(tester, find.byKey(const Key('insert-equation')));
          expect(find.byKey(const Key('math-tex')), findsOneWidget);
          await tester.enterText(find.byKey(const Key('math-tex')), r'\frac{1}{2}');
          await tester.pumpAndSettle();
          await tap(tester, find.byKey(const Key('math-done')));

          p.step = 'backgrounds';
          await tapKey(tester, 'tool-theme');
          await tap(tester, find.byKey(const Key('bg-graph')));
          await closePopover(tester);

          p.step = 'profile menu';
          await tapKey(tester, 'profile-button');
          expect(find.text(l.yourWhiteboards), findsOneWidget);
          p.step = 'settings';
          await tap(tester, find.byKey(const Key('menu-settings')));
          expect(find.text(l.languageHint), findsOneWidget);
          await tester.ensureVisible(find.byKey(const Key('finger-taps')));
          await tester.pumpAndSettle();
          await closeDialog(tester);
          for (final key in ['menu-whiteboards', 'menu-recordings']) {
            p.step = key;
            await tapKey(tester, 'profile-button');
            await tap(tester, find.byKey(Key(key)));
            await closeDialog(tester);
          }
          p.step = 'help';
          await tapKey(tester, 'profile-button');
          await tap(tester, find.byKey(const Key('menu-help')));
          p.step = 'practice';
          await tap(tester, find.byKey(const Key('help-practice')));
          expect(find.text(l.practiceCount(0, 6)), findsOneWidget);
          await tap(tester, find.byKey(const Key('practice-end')));
          p.step = 'tour';
          await tapKey(tester, 'profile-button');
          await tap(tester, find.byKey(const Key('menu-tour')));
          for (var i = 0; i < 12 && find.byKey(const Key('coach-next')).evaluate().isNotEmpty; i++) {
            p.step = 'tour step ${i + 1}';
            final title = tester.widget<Text>(find.byKey(const Key('coach-title'))).data;
            if (find.byKey(const Key('coach-skip')).evaluate().isEmpty) {
              // The last step offers practice: skip it.
              await closeDialog(tester);
              break;
            }
            await tap(tester, find.byKey(const Key('coach-next')));
            expect(title, isNotNull);
          }
          if (find.byKey(const Key('practice-end')).evaluate().isNotEmpty) await tap(tester, find.byKey(const Key('practice-end')));

          p.step = 'save board';
          await tapKey(tester, 'save-board');
          expect(find.text(l.saveBoard), findsOneWidget);
          await closeDialog(tester);
          p.step = 'attendance';
          await tapKey(tester, 'attendance-chip');
          await closeDialog(tester);
          p.step = 'end class';
          await tapKey(tester, 'end-class');
          expect(find.text(l.endClassTitle), findsOneWidget);
          await closeDialog(tester);

          p.step = 'sign in';
          await board.endClass();
          await tester.pumpAndSettle();
          await tap(tester, find.byKey(const Key('sign-in-chip')));
          expect(find.text(l.signInStep3), findsOneWidget);
          await closeDialog(tester);
        });
        board.dispose();
      });

      testWidgets('$name: the split panel (a sheet on an upright phone) and its tabs fit', (tester) async {
        screenSize(tester, size);
        final l = lookupAppLocalizations(Locale(lang));
        final board = await enrolledBoard();
        board.setBoardLanguage(BoardLanguage.tryParse(lang)!);
        board.onPaired('session-token', sessionIn(lang));
        await tester.pumpWidget(KinetixBoardApp(controller: board));
        await tester.pumpAndSettle();
        await collecting(tester, name, (p) async {
          await tap(tester, find.text(l.notNow)); // the offer of a PIN
          p.step = 'AI home';
          await tapKey(tester, 'panel-ai');
          final panel = tester.getSize(find.byKey(const Key('split-panel')));
          if (size.height > size.width) {
            // A sheet over the lower half; dragged up it fills the screen.
            expect(panel, Size(size.width, size.height / 2));
            await tester.drag(find.byKey(const Key('panel-grabber')), const Offset(0, -2000));
            await tester.pumpAndSettle();
            expect(tester.getSize(find.byKey(const Key('split-panel'))), size);
          } else {
            expect(panel, Size(size.width / 2, size.height));
          }
          expect(find.text(l.aiGroupTeach), findsOneWidget);
          p.step = 'AI explanation';
          await tester.enterText(find.byKey(const Key('ai-ask')), 'Photosynthesis');
          await tester.testTextInput.receiveAction(TextInputAction.done);
          await tester.pumpAndSettle();
          expect(find.byKey(const Key('ai-explanation')), findsOneWidget);
          for (final (tool, generate) in [
            ('quiz', 'quiz-generate'),
            ('homework', 'homework-generate'),
            ('lessonPlan', 'lesson-generate'),
            ('math', null),
            ('readBoard', null),
          ]) {
            p.step = 'AI $tool';
            await tapInPanel(tester, 'ai-tool-$tool');
            if (generate != null) {
              p.step = 'AI $tool result';
              await tapInPanel(tester, generate);
            }
            if (tool == 'quiz') {
              p.step = 'quiz presenter';
              await tapInPanel(tester, 'quiz-present');
              await tap(tester, find.byKey(const Key('presenter-reveal')));
              await tap(tester, find.byKey(const Key('presenter-close')));
            }
            if (tool == 'math') {
              p.step = 'math solution';
              await tester.enterText(find.byKey(const Key('math-input')), 'x² − 5x + 6 = 0');
              // Typing keeps the field in view; put the keyboard away to reach Solve below it.
              FocusManager.instance.primaryFocus?.unfocus();
              await tester.pumpAndSettle();
              await tester.drag(find.byKey(const Key('math-input')), const Offset(0, -250));
              await tester.pumpAndSettle();
              await tap(tester, find.byKey(const Key('math-solve')));
            }
            await tap(tester, find.byKey(const Key('panel-back')));
          }
          await tap(tester, find.byKey(const Key('panel-close')));
          expect(find.byType(SplitPanelFrame), findsNothing);

          p.step = 'sheet drags down to close';
          if (size.height > size.width) {
            await tapKey(tester, 'panel-ai');
            await tester.drag(find.byKey(const Key('panel-grabber')), const Offset(0, 300));
            await tester.pumpAndSettle();
            expect(find.byType(SplitPanelFrame), findsNothing);
          }

          p.step = 'books';
          await openTab(tester, 'books');
          await tapInPanel(tester, 'chapter-ch1');
          p.step = 'books topic';
          await tapInPanel(tester, 'topic-t1');
          expect(find.text(l.booksExplain), findsOneWidget);
          await tap(tester, find.byKey(const Key('panel-close')));

          p.step = 'quick quiz';
          await tapKey(tester, 'tool-tools');
          await tap(tester, find.byKey(const Key('drawer-quick-quiz')));
          await tap(tester, find.byKey(const Key('panel-close')));
          for (final tab in ['videos', 'animations']) {
            p.step = 'tab $tab';
            await openTab(tester, tab);
            await tap(tester, find.byKey(const Key('panel-close')));
          }
          p.step = 'badges';
          await tapKey(tester, 'tool-tools');
          await tap(tester, find.byKey(const Key('drawer-badges')));
          if (board.pickable.isNotEmpty) {
            await tapInPanel(tester, 'badge-student-${board.pickable.first.id}');
            await tapInPanel(tester, 'badge-award');
          }
          await tap(tester, find.byKey(const Key('panel-close')));

          p.step = 'kit';
          await openTab(tester, 'kit');
          for (final chip in find.byWidgetPredicate((w) => w is ChoiceChip && (w.key as ValueKey<String>?)?.value.startsWith('kit-') == true).evaluate().toList()) {
            p.step = 'kit ${chip.widget.key}';
            await tap(tester, find.byKey(chip.widget.key!));
          }
          await tap(tester, find.byKey(const Key('panel-close')));

          p.step = "today's plan";
          await tapKey(tester, 'tool-tools');
          await tap(tester, find.byKey(const Key('drawer-todays-plan')));
          expect(find.byKey(const Key('plan-view')), findsOneWidget);
          await tapInPanel(tester, 'plan-timer');
          await tapInPanel(tester, 'plan-timer');
          await tap(tester, find.byKey(const Key('panel-close')));

          p.step = '3D viewer';
          await openTab(tester, 'model3d');
          final models = find.descendant(of: find.byKey(const Key('catalogue-model3d')), matching: find.byType(Scrollable)).first;
          await tester.scrollUntilVisible(find.byKey(const Key('pick-heart')), 300, scrollable: models);
          await tester.ensureVisible(find.byKey(const Key('pick-heart')));
          await tester.pumpAndSettle();
          await tester.tap(find.byKey(const Key('pick-heart')));
          await tester.pump(const Duration(milliseconds: 400));
          await tester.pump(const Duration(milliseconds: 400));
          expect(find.byType(Model3dViewer), findsOneWidget);
          await tester.tap(find.byKey(const Key('panel-close')));
          await tester.pump(const Duration(milliseconds: 400));

          p.step = 'lab';
          await openTab(tester, 'labs');
          final labs = find.descendant(of: find.byKey(const Key('catalogue-lab')), matching: find.byType(Scrollable)).first;
          await tester.scrollUntilVisible(find.byKey(const Key('pick-glass-slab')), 200, scrollable: labs);
          await tester.ensureVisible(find.byKey(const Key('pick-glass-slab')));
          await tester.pumpAndSettle();
          await tester.tap(find.byKey(const Key('pick-glass-slab')));
          await tester.pump(const Duration(milliseconds: 400));
          await tester.pump(const Duration(milliseconds: 400));
          await tester.tap(find.byKey(const Key('panel-close')));
          await tester.pump(const Duration(milliseconds: 400));
        });
        board.dispose();
      });

      testWidgets('$name: search, the browsers\' dropdowns and the 3D solids fit', (tester) async {
        screenSize(tester, size);
        final l = lookupAppLocalizations(Locale(lang));
        final s = SearchStrings(lang);
        final board = await enrolledBoard();
        board.setBoardLanguage(BoardLanguage.tryParse(lang)!);
        board.onPaired('session-token', sessionIn(lang));
        await tester.pumpWidget(KinetixBoardApp(controller: board));
        await tester.pumpAndSettle();
        await collecting(tester, name, (p) async {
          await tap(tester, find.text(l.notNow)); // the offer of a PIN
          p.step = 'search';
          await tapKey(tester, 'open-search');
          expect(find.byKey(const Key('universal-search')), findsOneWidget);
          await tester.enterText(find.byKey(const Key('universal-search-field')), s.solidName('cylinder'));
          await tester.pumpAndSettle();
          p.step = 'search results';
          expect(find.byKey(const Key('group-model3d')), findsOneWidget);
          await tap(tester, find.byKey(const Key('result-model3d-solid.cylinder')));
          // On a phone the model opens in the split panel: a sheet below the board, or beside it.
          expect(find.byKey(const Key('split-panel')), findsOneWidget);
          expect(size.height > size.width ? tester.getSize(find.byType(SplitPanelFrame)).width : tester.getSize(find.byType(SplitPanelFrame)).height, size.height > size.width ? size.width : size.height);
          expect(find.byType(SolidExplorer), findsOneWidget);
          await tap(tester, find.byKey(const Key('panel-close')));
          p.step = 'search again';
          await tapKey(tester, 'open-search');
          expect(find.byKey(Key('recent-${s.solidName('cylinder')}')), findsOneWidget);
          await tester.enterText(find.byKey(const Key('universal-search-field')), s.settings);
          await tester.pumpAndSettle();
          await tap(tester, find.byKey(const Key('universal-search-close')));

          p.step = '3D solids';
          await tapKey(tester, 'tool-shapes');
          await tap(tester, find.text('3D'));
          for (final k in boardSolids) {
            expect(find.byKey(Key('solid-${k.name}')), findsOneWidget);
          }
          await tap(tester, find.byKey(const Key('solid-cone')));
          p.step = '3D solid dialog';
          expect(find.byKey(const Key('solid-dialog')), findsOneWidget);
          await tester.ensureVisible(find.byKey(const Key('solid-put')));
          await tester.pumpAndSettle();
          onScreen(tester, find.byKey(const Key('solid-put')), size);
          await tap(tester, find.byKey(const Key('solid-close')));
          await closePopover(tester);

          p.step = 'tools search';
          await tapKey(tester, 'tool-tools');
          await tester.enterText(find.descendant(of: find.byKey(const Key('tools-search')), matching: find.byType(TextField)), l.toolTimer);
          await tester.pumpAndSettle();
          expect(find.text(l.toolScreenShade), findsNothing);
          await tap(tester, find.byKey(const Key('drawer-toolkit-timer')));
          await tap(tester, find.byKey(const Key('toolkit-close-timer')));

          p.step = 'lab dropdowns';
          await openTab(tester, 'labs');
          for (final (menu, value) in [('subject', 'physics'), ('category', 'optics'), ('level', '10')]) {
            p.step = 'lab $menu';
            await tap(tester, find.byKey(Key('filter-$menu')));
            await tap(tester, find.byKey(Key('filter-$menu-$value')).last);
          }
          await tap(tester, find.byKey(const Key('pick-glass-slab')));
          await tester.pump(const Duration(milliseconds: 400));
          await tester.tap(find.byKey(const Key('panel-close')));
          await tester.pump(const Duration(milliseconds: 400));

          p.step = 'books search';
          await openTab(tester, 'books');
          await tester.enterText(find.descendant(of: find.byKey(const Key('books-search')), matching: find.byType(TextField)), 'goodwil');
          await tester.pumpAndSettle();
          expect(find.byKey(const Key('topic-t1')), findsOneWidget, reason: 'found topics show without opening the chapter');
          await tap(tester, find.byKey(const Key('panel-close')));

          p.step = 'settings search';
          await tapKey(tester, 'menu-settings');
          await tester.enterText(find.descendant(of: find.byKey(const Key('settings-search')), matching: find.byType(TextField)), l.kioskTitle);
          await tester.pumpAndSettle();
          expect(find.byKey(const Key('board-language')), findsNothing);
          await closeDialog(tester);
        });
        board.dispose();
      });

      testWidgets('$name: the demo board starts ready to write, with its concept videos and Ask the class', (tester) async {
        screenSize(tester, size);
        Demo.enabled = true;
        addTearDown(() => Demo.enabled = false);
        final server = DemoBoardServer(claimDelay: const Duration(seconds: 2))..studentAnswerDelay = const Duration(seconds: 3);
        final board = demoBoard(server);
        board.setBoardLanguage(BoardLanguage.tryParse(lang)!);
        await tester.pumpWidget(KinetixBoardApp(controller: board));
        await tester.pumpAndSettle();
        // Picked in settings, the board's language wins over the demo teacher's own.
        board.setBoardLanguage(BoardLanguage.tryParse(lang)!);
        await tester.pumpAndSettle();
        await collecting(tester, name, (p) async {
          p.step = 'demo start';
          expect(board.stage, BoardStage.board);
          expect(find.byKey(const Key('demoChip')), findsOneWidget);
          expect(find.byKey(const Key('conceptVideoCard')), findsOneWidget);
          await tap(tester, find.byKey(const Key('conceptVideoSkip')));

          p.step = 'demo ink';
          final g = await tester.startGesture(Offset(size.width / 2, size.height / 2), pointer: 9, kind: PointerDeviceKind.touch);
          for (var i = 0; i < 5; i++) {
            await g.moveBy(const Offset(10, 10));
          }
          await g.up();
          await tester.pump();
          expect(tester.widget<WhiteboardCanvas>(find.byType(WhiteboardCanvas)).controller.elements, hasLength(1));

          p.step = 'ask the class';
          await tapKey(tester, 'tool-tools');
          await tap(tester, find.byKey(const Key('drawer-ask-class')));
          await tester.enterText(find.byKey(const Key('ask-question')), 'Which share is redeemable?');
          await tap(tester, find.byKey(const Key('ask-correct-1')));
          await tap(tester, find.byKey(const Key('ask-start')));
          p.step = 'class check live';
          await tester.pump(const Duration(seconds: 13));
          await tester.pumpAndSettle();
          await tap(tester, find.byKey(const Key('poll-reveal')));
          await tap(tester, find.byKey(const Key('poll-end')));
          await tap(tester, find.byKey(const Key('poll-dismiss')));

          p.step = 'demo settings';
          await tapKey(tester, 'menu-settings');
          await closeDialog(tester);
        });
        await tester.pumpWidget(const SizedBox());
        board.dispose();
      });
    }

    testWidgets('$lang: enrolment and the principal\'s messages fit a phone', (tester) async {
      final l = lookupAppLocalizations(Locale(lang));
      for (final size in phoneSizes) {
        screenSize(tester, size);
        final board = BoardController(realtimeFactory: (_) => NoRealtime(), outboxStore: MemoryOutboxStore());
        await tester.pumpWidget(localized(lang, EnrollScreen(controller: board)));
        await tester.pumpAndSettle();
        expect(find.text(l.enrollTitle), findsOneWidget);
        expect(tester.takeException(), isNull, reason: 'enrol $size');
        BroadcastMessage message(BroadcastPriority p) => BroadcastMessage(
          id: 'm',
          title: aiSample[lang]!,
          body: aiSample[lang]!,
          priority: p,
          requiresAck: true,
          senderName: 'Dr. Meera Rao',
          expiresAt: DateTime.now().add(const Duration(hours: 1)),
        );
        for (final p in BroadcastPriority.values) {
          await tester.pumpWidget(localized(lang, BroadcastOverlay(messages: [message(p)], onDismiss: (_, {required acknowledge}) {}, child: const Scaffold())));
          await tester.pump();
          expect(tester.takeException(), isNull, reason: 'broadcast ${p.name} $size');
          if (find.text(l.acknowledge).evaluate().isNotEmpty) {
            await tester.ensureVisible(find.text(l.acknowledge));
            await tester.pump();
            expect(find.text(l.acknowledge).hitTestable(), findsOneWidget, reason: 'broadcast ${p.name} $size');
          }
        }
        await tester.pump(const Duration(seconds: 16));
        board.dispose();
      }
    });

    testWidgets('$lang at 360×640: the Simple board fits too', (tester) async {
      const size = Size(360, 640);
      screenSize(tester, size);
      final board = await enrolledBoard();
      board.setBoardLanguage(BoardLanguage.tryParse(lang)!);
      board.setSimpleBoard(SimpleBoard.on);
      board.setToolbarDock(ToolbarDock.left);
      board.onPaired('session-token', sessionIn(lang));
      await tester.pumpWidget(KinetixBoardApp(controller: board));
      await tester.pumpAndSettle();
      await collecting(tester, '$lang simple', (p) async {
        expect(find.byKey(const Key('phone-more')), findsOneWidget);
        await tapKey(tester, 'tool-pen');
        if (find.byKey(const Key('pen-popover')).evaluate().isEmpty) await tapKey(tester, 'tool-pen');
        expect(find.byKey(const Key('pen-type-aiPen')), findsNothing);
        await closePopover(tester);
        for (final key in ['tool-shapes', 'tool-insert', 'tool-tools', 'tool-theme']) {
          p.step = 'simple $key';
          await tapKey(tester, key);
          await closePopover(tester);
        }
        p.step = 'simple kit';
        await openTab(tester, 'kit');
        await tap(tester, find.byKey(const Key('panel-close')));
        p.step = 'simple AI';
        await tapKey(tester, 'panel-ai');
        await tap(tester, find.byKey(const Key('panel-close')));
      });
      board.dispose();
    });
  }
}
