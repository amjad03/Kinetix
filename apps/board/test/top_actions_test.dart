import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/features/board/board_screen.dart';
import 'package:kinetix_board/features/board/layout/top_actions.dart';
import 'package:kinetix_board/features/cast/cast_panel.dart';
import 'package:kinetix_board/features/live_quiz/live_quiz.dart' show LiveQuizSetupDialog;
import 'package:kinetix_board/l10n/l10n.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'contrast/contrast_test.dart' show lowContrast;
import 'support/fake_cloud.dart' show sessionIn;

/// The top bar from the competitor photos: Live Quiz, Live Class, Share and Record, with the zoom.
void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  final en = l10nFor(const Locale('en'));

  /// A board with a teacher signed in; disposed at the end so its session timer stops.
  BoardController signedIn(WidgetTester tester) {
    final board = BoardController()..skipEnrollment();
    board.onPaired('session-token', sessionIn('en'));
    return board;
  }

  Future<void> done(WidgetTester tester, BoardController board) async {
    await tester.pumpWidget(const SizedBox());
    board.dispose();
  }

  group('TopActionBar', () {
    late List<String> calls;

    Future<(BoardController, WhiteboardController)> pump(
      WidgetTester tester, {
      BoardController? board,
      WhiteboardController? wb,
      bool recording = false,
      bool labels = true,
      bool dark = false,
      String lang = 'en',
    }) async {
      tester.view.physicalSize = const Size(1400, 400);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      calls = [];
      final b = board ?? (BoardController()..skipEnrollment());
      final w = wb ?? WhiteboardController();
      await tester.pumpWidget(
        MaterialApp(
          theme: dark ? KinetixTheme.boardChrome() : KinetixTheme.board(),
          locale: Locale(lang),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: Scaffold(
            body: Center(
              child: TopActionBar(
                board: b,
                wb: w,
                recording: recording,
                labels: labels,
                onLiveQuiz: () => calls.add('quiz'),
                onLiveClass: () => calls.add('live'),
                onShareBoard: () => calls.add('share-board'),
                onCast: () => calls.add('cast'),
                onRecord: () => calls.add('record'),
              ),
            ),
          ),
        ),
      );
      await tester.pump();
      return (b, w);
    }

    testWidgets('each button runs its feature; Share offers the board notes and casting', (tester) async {
      final board = signedIn(tester);
      await pump(tester, board: board);
      for (final t in [en.topLiveQuiz, en.topLiveClass, en.topShare, en.toolRecord, '100%']) {
        expect(find.text(t), findsOneWidget, reason: t);
      }
      await tester.tap(find.byKey(const Key('top-live-quiz')));
      await tester.tap(find.byKey(const Key('top-live-class')));
      await tester.tap(find.byKey(const Key('top-record')));
      expect(calls, ['quiz', 'live', 'record']);

      await tester.tap(find.byKey(const Key('top-share')));
      await tester.pumpAndSettle();
      expect(find.text(en.topShareBoard), findsOneWidget);
      expect(find.text(en.topCastScreen), findsOneWidget);
      await tester.tap(find.byKey(const Key('top-share-board')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('top-share')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('top-share-cast')));
      await tester.pumpAndSettle();
      expect(calls, ['quiz', 'live', 'record', 'share-board', 'cast']);
      await done(tester, board);
    });

    testWidgets('Live Class needs a teacher signed in', (tester) async {
      await pump(tester);
      await tester.tap(find.byKey(const Key('top-live-class')));
      expect(calls, isEmpty);
      expect(find.byTooltip(en.topLiveNeedsSignIn), findsOneWidget);
    });

    testWidgets('shows live and recording on the buttons', (tester) async {
      final board = signedIn(tester)
        ..classLive = true
        ..liveStudents = 0;
      await pump(tester, board: board, recording: true);
      expect(find.text(en.topLiveNow), findsOneWidget);
      expect(find.text(en.topRecording), findsOneWidget);
      expect(find.byTooltip(en.stopLiveTooltip), findsOneWidget);
      expect(find.byTooltip(en.topStopRecordingTooltip), findsOneWidget);
      expect(tester.getSemantics(find.descendant(of: find.byKey(const Key('top-record')), matching: find.byType(InkWell))), isSemantics(isSelected: true, isButton: true));

      // The count stays on Go live in the class bar.
      board.liveStudents = 12;
      await pump(tester, board: board, recording: true);
      expect(find.text(en.topLiveNow), findsOneWidget);
      await done(tester, board);
    });

    testWidgets('the zoom shows the board scale and goes back to 100% on a tap', (tester) async {
      final (_, wb) = await pump(tester);
      expect(tester.widget<TextButton>(find.byKey(const Key('top-zoom'))).onPressed, isNull);
      wb.zoomBy(1.25);
      await tester.pump();
      expect(find.text('125%'), findsOneWidget);
      await tester.tap(find.byKey(const Key('top-zoom')));
      await tester.pump();
      expect(find.text('100%'), findsOneWidget);
    });

    testWidgets('collapsed (a phone): a menu with every action and a dot while recording', (tester) async {
      final board = signedIn(tester);
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      calls = [];
      Future<void> show({required bool recording}) => tester.pumpWidget(
        MaterialApp(
          theme: KinetixTheme.board(),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: Scaffold(
            body: Center(
              child: TopActionBar(
                board: board,
                wb: WhiteboardController(),
                recording: recording,
                collapsed: true,
                onLiveQuiz: () => calls.add('quiz'),
                onLiveClass: () => calls.add('live'),
                onShareBoard: () => calls.add('share-board'),
                onCast: () => calls.add('cast'),
                onRecord: () => calls.add('record'),
              ),
            ),
          ),
        ),
      );
      await show(recording: false);
      expect(tester.widget<Badge>(find.byType(Badge)).isLabelVisible, isFalse);
      for (final k in ['top-live-quiz', 'top-live-class', 'top-share-board', 'top-share-cast', 'top-record']) {
        await tester.tap(find.byKey(const Key('top-actions-menu')));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(Key(k)));
        await tester.pumpAndSettle();
      }
      expect(calls, ['quiz', 'live', 'share-board', 'cast', 'record']);
      await show(recording: true);
      expect(tester.widget<Badge>(find.byType(Badge)).isLabelVisible, isTrue);
      await tester.tap(find.byKey(const Key('top-actions-menu')));
      await tester.pumpAndSettle();
      expect(find.text(en.topStopRecordingTooltip), findsOneWidget);
      await done(tester, board);
    });

    testWidgets('icons only when there is no room for labels, with the names as tooltips', (tester) async {
      await pump(tester, labels: false);
      expect(find.text(en.topLiveQuiz), findsNothing);
      expect(find.byTooltip(en.topLiveQuizTooltip), findsOneWidget);
      expect(find.byTooltip(en.topRecordTooltip), findsOneWidget);
    });

    for (final dark in [false, true]) {
      testWidgets('readable in the ${dark ? 'dark' : 'light'} chrome, idle and active', (tester) async {
        final board = signedIn(tester);
        await pump(tester, board: board, dark: dark);
        expect(lowContrast(), isEmpty);
        board.classLive = true;
        await pump(tester, board: board, dark: dark, recording: true);
        expect(lowContrast(), isEmpty);
        await done(tester, board);
      });
    }

    for (final lang in ['hi', 'kn']) {
      testWidgets('in $lang', (tester) async {
        await pump(tester, lang: lang);
        final l = l10nFor(Locale(lang));
        expect(find.text(l.topLiveQuiz), findsOneWidget);
        expect(l.topLiveQuiz, isNot(en.topLiveQuiz));
        expect(tester.takeException(), isNull);
      });
    }
  });

  group('on the board', () {
    Future<BoardController> board(WidgetTester tester, Size size) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final b = BoardController()..skipEnrollment();
      await tester.pumpWidget(MaterialApp(theme: KinetixTheme.light(), home: BoardScreen(board: b)));
      await tester.pump();
      return b;
    }

    Rect rect(WidgetTester tester, String key) => tester.getRect(find.byKey(Key(key)));

    for (final (name, size, labels) in [('a 75-inch panel', const Size(1920, 1080), true), ('a tablet', const Size(1024, 768), false)]) {
      testWidgets('$name: the top bar fits beside the class bar and search', (tester) async {
        await board(tester, size);
        expect(tester.takeException(), isNull);
        final bar = rect(tester, 'top-actions');
        expect(bar.left, greaterThanOrEqualTo(0));
        expect(bar.right, lessThanOrEqualTo(size.width));
        expect(find.text(en.topLiveQuiz), labels ? findsOneWidget : findsNothing);
        for (final k in ['top-live-quiz', 'top-live-class', 'top-share', 'top-record']) {
          final r = rect(tester, k);
          expect(r.height, greaterThanOrEqualTo(44), reason: k);
          expect(r.width, greaterThanOrEqualTo(44), reason: k);
        }
        // Nothing of the top row sits under it.
        for (final k in ['open-search', 'class-bar']) {
          final other = find.byKey(Key(k));
          if (other.evaluate().isEmpty) continue;
          if (k == 'class-bar') {
            expect(tester.getRect(other).overlaps(bar) && tester.getRect(other).right > bar.left + 1, isFalse, reason: k);
          } else {
            expect(tester.getRect(other).overlaps(bar), isFalse, reason: k);
          }
        }
      });
    }

    for (final size in const [Size(360, 640), Size(390, 844), Size(844, 390)]) {
      testWidgets('a ${size.width.toInt()}×${size.height.toInt()} phone: one button in the top row opens the four', (tester) async {
        await board(tester, size);
        expect(tester.takeException(), isNull);
        final bar = rect(tester, 'top-actions');
        expect(bar.top, lessThan(80));
        expect(bar.overlaps(rect(tester, 'open-search')), isFalse);
        expect(find.byKey(const Key('top-live-quiz')), findsNothing);
        await tester.tap(find.byKey(const Key('top-actions-menu')));
        await tester.pumpAndSettle();
        for (final k in ['top-live-quiz', 'top-live-class', 'top-share-board', 'top-share-cast', 'top-record']) {
          expect(find.byKey(Key(k)).hitTestable(), findsOneWidget, reason: k);
        }
        await tester.tap(find.byKey(const Key('top-live-quiz')));
        await tester.pumpAndSettle();
        expect(find.byType(LiveQuizSetupDialog), findsOneWidget);
      });
    }

    testWidgets('a 75-inch panel with a class: icons only, so the class bar keeps its room', (tester) async {
      final b = await board(tester, const Size(1920, 1080));
      b.onPaired('session-token', sessionIn('en'));
      await tester.pump();
      expect(find.text(en.topLiveQuiz), findsNothing);
      expect(find.byKey(const Key('class-audio')).hitTestable(), findsOneWidget);
      expect(find.byKey(const Key('go-live')).hitTestable(), findsOneWidget);
      expect(find.byKey(const Key('top-live-class')).hitTestable(), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      b.dispose();
    });

    testWidgets('Live Quiz opens the game-show quiz setup', (tester) async {
      await board(tester, const Size(1920, 1080));
      await tester.tap(find.byKey(const Key('top-live-quiz')));
      await tester.pumpAndSettle();
      expect(find.byType(LiveQuizSetupDialog), findsOneWidget);
    });

    testWidgets('Record asks a guest to sign in; Share → Cast a screen opens the Cast panel', (tester) async {
      await board(tester, const Size(1920, 1080));
      await tester.tap(find.byKey(const Key('top-record')));
      await tester.pump();
      expect(find.text(en.recordNeedsSignIn), findsOneWidget);

      await tester.tap(find.byKey(const Key('top-share')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('top-share-cast')));
      await tester.pumpAndSettle();
      expect(find.byType(CastPanel), findsOneWidget);
    });
  });
}
