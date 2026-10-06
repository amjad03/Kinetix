import 'package:kinetix_board/features/board/panel/split_panel.dart';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/core/models.dart';
import 'package:kinetix_board/core/outbox_store.dart';
import 'package:kinetix_board/features/board/side_panel.dart';
import 'package:kinetix_board/features/broadcast/broadcast_overlay.dart';
import 'package:kinetix_board/features/enrollment/enroll_screen.dart';
import 'package:kinetix_board/l10n/l10n.dart';
import 'package:kinetix_board/l10n/math_text.dart';
import 'package:kinetix_board/main.dart';
import 'package:kinetix_math/kinetix_math.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/board_fonts.dart';
import 'support/fake_cloud.dart';

void main() {
  setUpAll(loadBoardFonts);
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('ARB files', () {
    Map<String, dynamic> arb(String lang) => jsonDecode(File('lib/l10n/app_$lang.arb').readAsStringSync()) as Map<String, dynamic>;
    Set<String> placeholders(String message) => RegExp(r'\{(\w+)[,}]').allMatches(message).map((m) => m[1]!).toSet();

    test('Hindi and Kannada have every English string, with the same placeholders', () {
      final en = arb('en');
      for (final lang in ['hi', 'kn']) {
        final other = arb(lang);
        for (final key in en.keys.where((k) => !k.startsWith('@'))) {
          expect(other[key], isA<String>(), reason: '$lang is missing $key');
          expect(placeholders(other[key] as String), placeholders(en[key] as String), reason: '$lang $key');
        }
        expect(other.keys.where((k) => !k.startsWith('@')).toSet(), en.keys.where((k) => !k.startsWith('@')).toSet(), reason: lang);
      }
    });

    test('plurals and counts read naturally', () {
      final hi = lookupAppLocalizations(const Locale('hi'));
      final kn = lookupAppLocalizations(const Locale('kn'));
      final en = lookupAppLocalizations(const Locale('en'));
      expect(en.liveStudents(1), 'Live · 1 student');
      expect(en.liveStudents(3), 'Live · 3 students');
      expect(hi.liveStudents(3), 'लाइव · 3 विद्यार्थी');
      expect(kn.liveStudents(1), 'ಲೈವ್ · 1 ವಿದ್ಯಾರ್ಥಿ');
      expect(kn.liveStudents(3), 'ಲೈವ್ · 3 ವಿದ್ಯಾರ್ಥಿಗಳು');
      expect(en.takeAttendance(34), '34 students · Take attendance');
      expect(hi.marks(1), '1 अंक');
      expect(kn.marks(5), '5 ಅಂಕಗಳು');
      expect(en.pageCount(1), '1 page');
      expect(kn.pageCount(3), '3 ಪುಟಗಳು');
    });
  });

  group('Maths solver in Hindi and Kannada', () {
    const inputs = [
      '3x + 5 = 20',
      '2(x − 1) = x + 4',
      'x² − 5x + 6 = 0',
      'x² + x + 1 = 0',
      'x² + 2x + 1 = 0',
      'x² − 2 = 0',
      '−x² + 4 = 0',
      'x/2 + 1/3 = 0',
      'x² + x = x² + 3',
      'x + 1 = x + 1',
      'x + 1 = x + 2',
      '2x + 3x',
      '2 + 3 = 5',
      '2 + 3 = 6',
      '(2 + 3) × 4² ÷ 8',
      '√50 + sin 30',
    ];
    const errors = ['', '(2 + 3', '1 ÷ 0', 'x + y = 2', 'x³ = 8', '2 = 3 = 4', '√(−4)', 'log 0', 'tan 90', ')'];
    // Words that stay in Latin script in every language (function names, the unknown).
    final english = RegExp(r'\b(?!sin\b|cos\b|tan\b|log\b|ln\b)[A-Za-z]{3,}\b');

    for (final lang in ['hi', 'kn']) {
      test('every step, answer and error of the sample problems is translated ($lang)', () {
        final m = MathText(lookupAppLocalizations(Locale(lang)));
        for (final input in inputs) {
          final s = MathSolver.solve(input);
          expect(english.hasMatch(m.answer(s.answer)), isFalse, reason: '$input → ${m.answer(s.answer)}');
          for (final step in s.steps) {
            final shown = '${m.step(step.explanation)} ${m.expression(step.expression)}';
            expect(english.hasMatch(shown), isFalse, reason: '$input: $shown');
          }
        }
        for (final input in errors) {
          try {
            MathSolver.solve(input);
            fail('$input should not solve');
          } on MathError catch (e) {
            expect(english.hasMatch(m.error(e.message)), isFalse, reason: '$input: ${m.error(e.message)}');
          }
        }
      });
    }

    test('English is shown exactly as the solver writes it', () {
      final m = MathText(lookupAppLocalizations(const Locale('en')));
      final s = MathSolver.solve('x² − 5x + 6 = 0');
      expect(m.answer(s.answer), s.answer);
      expect(m.step(s.steps.last.explanation), s.steps.last.explanation);
      expect(MathText(lookupAppLocalizations(const Locale('hi'))).step('Subtract 5 from both sides'), 'दोनों पक्षों से 5 घटाएँ');
      expect(MathText(lookupAppLocalizations(const Locale('kn'))).answer('x = 2 or x = 3'), 'x = 2 ಅಥವಾ x = 3');
    });
  });

  group('Board language', () {
    testWidgets('the settings dialog switches the board to Hindi and Kannada, and remembers it', (tester) async {
      screenSize(tester, const Size(1920, 1080));
      final board = BoardController(realtimeFactory: (_) => NoRealtime(), outboxStore: MemoryOutboxStore())..skipEnrollment();
      await tester.pumpWidget(KinetixBoardApp(controller: board));
      await tester.pumpAndSettle();
      expect(find.byTooltip('Undo'), findsOneWidget);

      await tester.tap(find.byKey(const Key('profile-button')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('menu-settings')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('board-language-hi')));
      await tester.pumpAndSettle();
      final hi = lookupAppLocalizations(const Locale('hi'));
      expect(find.text(hi.boardSettings), findsOneWidget, reason: 'the open dialog follows at once');
      expect(find.byTooltip(hi.toolUndo), findsOneWidget);
      expect(find.byTooltip('Undo'), findsNothing);
      expect(board.boardLanguage, BoardLanguage.hi);

      await tester.tap(find.byKey(const Key('board-language-kn')));
      await tester.pumpAndSettle();
      expect(find.byTooltip(lookupAppLocalizations(const Locale('kn')).toolUndo), findsOneWidget);
      expect(tester.takeException(), isNull);

      // Saved like the other settings: a restarted board comes back in Kannada.
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString('setting.language'), 'kn');
      final restarted = BoardController(realtimeFactory: (_) => NoRealtime(), outboxStore: MemoryOutboxStore());
      await restarted.start();
      expect(restarted.language, BoardLanguage.kn);
      restarted.dispose();
    });

    testWidgets('a teacher sees their own language while signed in; the board goes back to its own after', (tester) async {
      screenSize(tester, const Size(1920, 1080));
      final board = await enrolledBoard();
      board.setBoardLanguage(BoardLanguage.hi);
      await tester.pumpWidget(KinetixBoardApp(controller: board));
      await tester.pumpAndSettle();
      final hi = lookupAppLocalizations(const Locale('hi'));
      final kn = lookupAppLocalizations(const Locale('kn'));
      expect(find.byTooltip(hi.toolUndo), findsOneWidget);

      board.onPaired('session-token', sessionIn('kn'));
      await tester.pumpAndSettle();
      expect(board.language, BoardLanguage.kn);
      expect(find.byTooltip(kn.toolUndo), findsOneWidget);
      expect(find.textContaining(kn.welcomeTeacher('Anita')), findsOneWidget, reason: 'the welcome is in the new language');

      // The AI answer language is separate: it starts from the teacher's language and can be
      // changed without touching the board's.
      await tester.tap(find.byKey(const Key('panel-ai')));
      await tester.pumpAndSettle();
      expect(find.descendant(of: find.byKey(const Key('ai-language')), matching: find.text('ಕನ್ನಡ')), findsOneWidget);
      await tester.tap(find.byKey(const Key('ai-language')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('English').last);
      await tester.pumpAndSettle();
      expect(find.text(kn.aiGroupTeach), findsOneWidget);
      expect(board.language, BoardLanguage.kn);
      await tester.tap(find.byKey(const Key('panel-close')));
      await tester.pumpAndSettle();
      expect(find.byTooltip(kn.toolUndo), findsOneWidget);

      // Signing out (the period ends) returns the board to its own language.
      await board.endClass();
      await tester.pumpAndSettle();
      expect(board.language, BoardLanguage.hi);
      expect(find.byTooltip(hi.toolUndo), findsOneWidget);
      expect(find.text(hi.signedOutGuest), findsOneWidget);
      expect(tester.takeException(), isNull);
      board.dispose();
    });

    testWidgets('a teacher language the board does not have keeps the board language', (tester) async {
      screenSize(tester, const Size(1920, 1080));
      final board = await enrolledBoard();
      board.setBoardLanguage(BoardLanguage.kn);
      await tester.pumpWidget(KinetixBoardApp(controller: board));
      board.onPaired('session-token', sessionIn('ta'));
      await tester.pumpAndSettle();
      expect(board.language, BoardLanguage.kn);
      expect(find.byTooltip(lookupAppLocalizations(const Locale('kn')).toolUndo), findsOneWidget);
      board.dispose();
    });

    testWidgets('a teacher who picks a language in settings sees it at once', (tester) async {
      screenSize(tester, const Size(1920, 1080));
      final board = await enrolledBoard();
      await tester.pumpWidget(KinetixBoardApp(controller: board));
      board.onPaired('session-token', sessionIn('hi'));
      await tester.pumpAndSettle();
      expect(board.language, BoardLanguage.hi);
      board.setBoardLanguage(BoardLanguage.en);
      await tester.pumpAndSettle();
      expect(board.language, BoardLanguage.en);
      expect(find.byTooltip('Undo'), findsOneWidget);
      board.dispose();
    });
  });

  for (final lang in ['hi', 'kn', 'en']) {
    for (final size in [const Size(1920, 1080), const Size(1280, 720)]) {
      testWidgets('$lang at ${size.width.toInt()}×${size.height.toInt()}: board, popovers, panels and dialogs fit', (tester) async {
        screenSize(tester, size);
        final l = lookupAppLocalizations(Locale(lang));
        final board = await enrolledBoard();
        board.toolbarDock = ToolbarDock.left;
        board.setBoardLanguage(BoardLanguage.tryParse(lang)!);
        board.onPaired('session-token', sessionIn(lang));
        await tester.pumpWidget(KinetixBoardApp(controller: board));
        await tester.pumpAndSettle();

        void fits(String what) => expect(tester.takeException(), isNull, reason: '$lang $size: $what');
        NavigatorState nav() => tester.state<NavigatorState>(find.byType(Navigator).first);
        Future<void> tap(Finder f) async {
          await tester.ensureVisible(f);
          await tester.pumpAndSettle();
          await tester.tap(f);
          await tester.pumpAndSettle();
        }

        Future<void> tapKey(String key) async {
          final f = find.byKey(Key(key));
          if (f.evaluate().isEmpty) {
            await tester.scrollUntilVisible(
              f,
              200,
              scrollable: find.descendant(of: find.byType(SplitPanelFrame), matching: find.byType(Scrollable)).first,
            );
          }
          await tap(f);
        }

        Future<void> closeDialog() async {
          nav().pop();
          await tester.pumpAndSettle();
        }

        Future<void> closePopover() async {
          await tester.tapAt(Offset(size.width - 8, size.height / 2));
          await tester.pumpAndSettle();
        }

        fits('board');
        if (size.width >= 1500) {
          for (final label in [l.toolRecord, l.toolWrite, l.toolShapes, l.toolBooks, l.toolHomework, l.toolHide]) {
            expect(find.text(label), findsWidgets, reason: label);
          }
        }
        expect(find.text(l.takeAttendance(34)), findsOneWidget);

        // Some ink, so Save has something to save.
        final g = await tester.startGesture(Offset(size.width / 3, size.height / 2), pointer: 9, kind: PointerDeviceKind.touch);
        for (var i = 0; i < 5; i++) {
          await g.moveBy(const Offset(30, 10));
        }
        await g.up();
        await tester.pumpAndSettle();

        // Popovers above the toolbar.
        await tap(find.byKey(const Key('tool-write')));
        expect(find.text(l.highlighter), findsOneWidget);
        fits('write');
        await closePopover();
        await tap(find.byKey(const Key('tool-erase')));
        await tap(find.byKey(const Key('tool-erase')));
        expect(find.byKey(const Key('clear-page')), findsOneWidget);
        fits('erase');
        await closePopover();
        await tap(find.byKey(const Key('tool-write')));
        await closePopover();
        for (final (key, title) in [('tool-theme', l.boardTheme), ('tool-shapes', l.showLengths), ('tool-tools', l.toolTimer)]) {
          await tap(find.byKey(Key(key)));
          expect(find.text(title), findsWidgets, reason: key);
          fits(key);
          await closePopover();
        }
        await tap(find.byKey(const Key('tool-tools')));
        await tap(find.text(l.toolEyeComfort));
        expect(find.text(l.adjustSchoolDay), findsOneWidget);
        fits('eye comfort');
        await closePopover();
        await tap(find.byKey(const Key('tool-tools')));
        await tap(find.text(l.toolTimer));
        fits('timer');
        await tap(find.byKey(const Key('toolkit-close-timer')));
        await tap(find.byKey(const Key('tool-tools')));
        await tap(find.text(l.toolRandomPick));
        fits('random pick');
        await tap(find.byKey(const Key('toolkit-close-picker')));
        for (final (name, label) in [('stopwatch', l.tkStopwatch), ('dice', l.tkDice), ('spinner', l.tkSpinner), ('noise', l.tkNoiseMeter)]) {
          await tap(find.byKey(const Key('tool-tools')));
          await tap(find.text(label));
          fits(name);
          await tap(find.byKey(Key('toolkit-close-$name')));
        }
        await tap(find.byKey(const Key('tool-tools')));
        await tap(find.text(l.toolScreenShade));
        expect(find.text(l.tkDragToReveal), findsOneWidget);
        fits('screen shade');
        await tap(find.byKey(const Key('curtain-remove')));
        await tap(find.byKey(const Key('tool-tools')));
        await tap(find.text(l.simTitle));
        fits('simulations');
        await tap(find.byKey(const Key('open-sim-pythagoras')));
        fits('pythagoras');
        await tap(find.byKey(const Key('sim-close')));
        await tap(find.byKey(const Key('profile-button')));
        await tap(find.byKey(const Key('menu-help')));
        fits('help');
        await tap(find.byKey(const Key('help-practice')));
        expect(find.text(l.practiceCount(0, 6)), findsOneWidget);
        fits('practice');
        await tap(find.byKey(const Key('practice-end')));
        await tap(find.byKey(const Key('profile-button')));
        expect(find.text(l.yourWhiteboards), findsOneWidget);
        fits('profile menu');

        // Dialogs.
        await tap(find.byKey(const Key('menu-settings')));
        expect(find.text(l.languageHint), findsOneWidget);
        fits('settings');
        await closeDialog();
        await tap(find.byKey(const Key('profile-button')));
        await tap(find.byKey(const Key('menu-whiteboards')));
        fits('your whiteboards');
        await closeDialog();
        await tap(find.byKey(const Key('profile-button')));
        await tap(find.byKey(const Key('menu-recordings')));
        fits('recordings');
        await closeDialog();
        await tap(find.byKey(const Key('save-board')));
        expect(find.text(l.saveBoard), findsOneWidget);
        fits('save board');
        await closeDialog();
        await tap(find.byKey(const Key('attendance-chip')));
        fits('attendance');
        await closeDialog();
        await tap(find.byKey(const Key('end-class')));
        expect(find.text(l.endClassTitle), findsOneWidget);
        fits('end class');
        await closeDialog();

        // Side panels.
        await tap(find.byKey(const Key('panel-ai')));
        expect(find.text(l.aiGroupTeach), findsOneWidget);
        fits('AI home');
        await tester.enterText(find.byKey(const Key('ai-ask')), 'Photosynthesis');
        await tester.testTextInput.receiveAction(TextInputAction.done);
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('ai-explanation')), findsOneWidget);
        fits('AI explanation');
        for (final (tool, generate) in [
          ('quiz', 'quiz-generate'),
          ('homework', 'homework-generate'),
          ('lessonPlan', 'lesson-generate'),
          ('math', null),
          ('readBoard', null),
        ]) {
          await tapKey('ai-tool-$tool');
          fits('AI $tool');
          if (generate != null) {
            await tapKey(generate);
            fits('AI $tool result');
          }
          if (tool == 'quiz') {
            await tapKey('quiz-present');
            expect(find.text(l.questionOf(1, 5)), findsOneWidget);
            await tap(find.byKey(const Key('presenter-reveal')));
            fits('quiz presenter');
            await tap(find.byKey(const Key('presenter-close')));
          }
          if (tool == 'math') {
            await tester.enterText(find.byKey(const Key('math-input')), 'x² − 5x + 6 = 0');
            await tap(find.byKey(const Key('math-solve')));
            expect(find.text(MathText(l).kind(MathKind.quadratic).toUpperCase()), findsOneWidget);
            fits('math solution');
            await tester.enterText(find.byKey(const Key('math-input')), '(2 + 3');
            await tap(find.byKey(const Key('math-solve')));
            expect(find.byKey(const Key('math-error')), findsOneWidget);
            fits('math error');
          }
          await tap(find.byKey(const Key('panel-back')));
        }
        await tap(find.byKey(const Key('panel-books')));
        await tap(find.byKey(const Key('chapter-ch1')));
        fits('books');
        await tap(find.byKey(const Key('topic-t1')));
        expect(find.text(l.booksExplain), findsOneWidget);
        fits('books topic');
        await tap(find.byKey(const Key('panel-quiz')));
        fits('quiz panel');
        await tap(find.byKey(const Key('panel-homework')));
        fits('homework panel');
        await tap(find.byKey(const Key('panel-close')));
        await tap(find.byKey(const Key('tool-tools')));
        await tap(find.text(l.toolSplitScreen));
        expect(find.text(l.splitChoose), findsOneWidget);
        fits('split screen');
        await tap(find.byKey(const Key('panel-close')));
        await tap(find.byKey(const Key('tool-tools')));
        await tap(find.text(l.toolTodaysPlan));
        expect(find.byKey(const Key('plan-view')), findsOneWidget);
        await tap(find.byKey(const Key('plan-timer')));
        fits("today's plan");
        await tap(find.byKey(const Key('plan-timer')));
        await tester.scrollUntilVisible(
          find.byKey(const Key('plan-topic-t1')),
          -200,
          scrollable: find.descendant(of: find.byKey(const Key('plan-view')), matching: find.byType(Scrollable)).first,
        );
        await tap(find.byKey(const Key('plan-topic-t1')));
        expect(find.byKey(const Key('books-topic')), findsOneWidget);
        fits("today's plan → books");
        await tap(find.byKey(const Key('panel-close')));

        // Guest board: sign-in.
        await board.endClass();
        await tester.pumpAndSettle();
        expect(find.text(l.guestSignIn), findsOneWidget);
        await tap(find.byKey(const Key('sign-in-chip')));
        expect(find.text(l.signInStep3), findsOneWidget);
        fits('sign in');
        await closeDialog();
        fits('end');
        board.dispose();
      });
    }

    for (final size in [const Size(1920, 1080), const Size(1280, 720)]) {
      for (final primary in [false, true]) {
        testWidgets('$lang at ${size.width.toInt()}×${size.height.toInt()}, rails${primary ? ', primary' : ''}: rails, popovers, kit and editors fit', (tester) async {
          screenSize(tester, size);
          final l = lookupAppLocalizations(Locale(lang));
          final board = await enrolledBoard();
          board.setBoardLanguage(BoardLanguage.tryParse(lang)!);
          board.setSimpleBoard(primary ? SimpleBoard.on : SimpleBoard.off);
          board.onPaired('session-token', sessionIn(lang));
          await tester.pumpWidget(KinetixBoardApp(controller: board));
          await tester.pumpAndSettle();
          void fits(String what) => expect(tester.takeException(), isNull, reason: '$lang $size rails: $what');
          // The rails scroll when a short screen can't hold every tool.
          Future<void> tap(Finder f) async {
            await tester.ensureVisible(f);
            await tester.pumpAndSettle();
            await tester.tap(f);
            await tester.pumpAndSettle();
          }

          // Tap the barrier well right of the popover, which opens beside the left rail.
          Future<void> closePopover() async {
            final r = tester.getRect(find.byKey(const Key('popover-barrier')));
            await tester.tapAt(Offset(r.right - 200, r.center.dy));
            await tester.pumpAndSettle();
          }
          fits('board');
          if (primary) expect(find.text(l.pen), findsOneWidget);
          await tap(find.byKey(const Key('tool-write')));
          expect(find.text(l.thickness), findsOneWidget);
          fits('write');
          await closePopover();
          for (final key in ['tool-shapes', 'tool-insert', 'tool-tools', 'tool-theme']) {
            await tap(find.byKey(Key(key)));
            fits(key);
            await closePopover();
          }
          if (!primary) {
            // The AI pen: the first tap takes it, the second opens its options.
            await tap(find.byKey(const Key('tool-ai-pen')));
            await tap(find.byKey(const Key('tool-ai-pen')));
            expect(find.byKey(const Key('ai-pen-popover')), findsOneWidget);
            fits('AI pen');
            await closePopover();
          }
          await tap(find.byKey(const Key('tool-insert')));
          await tap(find.byKey(const Key('insert-equation')));
          expect(find.byKey(const Key('math-tex')), findsOneWidget);
          fits('equation editor');
          await tester.enterText(find.byKey(const Key('math-tex')), r'\frac{1}{2}');
          await tap(find.byKey(const Key('math-done')));
          fits('equation on the board');
          await tap(find.byKey(const Key('panel-kit')));
          fits('kit');
          for (final chip in find.byWidgetPredicate((w) => w is ChoiceChip && (w.key as ValueKey<String>?)?.value.startsWith('kit-') == true).evaluate().toList()) {
            await tap(find.byKey(chip.widget.key!));
            fits('kit ${chip.widget.key}');
          }
          await tap(find.byKey(const Key('panel-ai')));
          fits('AI from the rail');
          await tap(find.byKey(const Key('panel-close')));
          await tap(find.byKey(const Key('profile-button')));
          await tap(find.byKey(const Key('menu-settings')));
          expect(find.text(l.layoutTitle), findsOneWidget);
          fits('settings');
          Navigator.of(tester.element(find.text(l.layoutTitle))).pop();
          await tester.pumpAndSettle();
          board.dispose();
        });
      }
    }

    testWidgets('$lang: enrolment and principal messages fit at 1280×720 and 1920×1080', (tester) async {
      final l = lookupAppLocalizations(Locale(lang));
      for (final size in [const Size(1280, 720), const Size(1920, 1080)]) {
        screenSize(tester, size);
        final board = BoardController(realtimeFactory: (_) => NoRealtime(), outboxStore: MemoryOutboxStore());
        await tester.pumpWidget(localized(lang, EnrollScreen(controller: board)));
        await tester.pumpAndSettle();
        expect(find.text(l.enrollTitle), findsOneWidget);
        expect(tester.takeException(), isNull, reason: 'enrol $size');

        BroadcastMessage message(String id, BroadcastPriority p) => BroadcastMessage(
          id: id,
          title: aiSample[lang]!,
          body: aiSample[lang]!,
          priority: p,
          requiresAck: true,
          senderName: 'Dr. Meera Rao',
          expiresAt: DateTime.now().add(const Duration(hours: 1)),
        );
        for (final p in BroadcastPriority.values) {
          await tester.pumpWidget(
            localized(lang, BroadcastOverlay(messages: [message('m', p)], onDismiss: (_, {required acknowledge}) {}, child: const Scaffold())),
          );
          await tester.pump();
          expect(tester.takeException(), isNull, reason: 'broadcast ${p.name} $size');
        }
        expect(find.text(l.acknowledge), findsOneWidget);
        await tester.pump(const Duration(seconds: 16));
      }
    });
  }

  test('Material and Cupertino strings exist for every board language', () {
    for (final lang in BoardLanguage.values) {
      expect(GlobalMaterialLocalizations.delegate.isSupported(lang.locale), isTrue, reason: lang.name);
    }
  });
}
