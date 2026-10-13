import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:kinetix_board/core/api_client.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/core/models.dart';
import 'package:kinetix_board/core/outbox_store.dart';
import 'package:kinetix_board/core/realtime.dart';
import 'package:kinetix_board/features/assessment/assessment.dart';
import 'package:kinetix_board/features/class_check/class_check_panel.dart';
import 'package:kinetix_board/features/class_check/class_poll.dart' show AnswerSource;
import 'package:kinetix_board/features/live_quiz/live_quiz.dart';
import 'package:kinetix_board/l10n/l10n.dart';
import 'package:kinetix_cards/kinetix_cards.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/fake_cloud.dart' show NoRealtime, jsonResponse, localized, sessionIn;

/// The game-show Live Quiz: scoring (the same cases as services/api scoring.spec.ts), a game the
/// board runs alone with answer cards, a game the server runs with the Student App, and setup.
void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  final en = l10nFor(const Locale('en'));

  const questions = [
    GameQuestion(kind: QuizKind.mcq, question: 'Which share is redeemable?', options: ['Equity', 'Preference', 'Bonus', 'Rights'], correct: 1, seconds: 20),
    GameQuestion(kind: QuizKind.tf, question: 'Goodwill is an asset.', options: ['True', 'False'], correct: 0, seconds: 10),
  ];

  group('scoring', () {
    test('a right app answer earns 500 plus up to 500 for speed; a card earns 500; a wrong one nothing', () {
      int pts(bool c, AnswerSource s, int? ms) => quizAnswerPoints(correct: c, source: s, elapsedMs: ms, seconds: 20);
      expect(pts(true, AnswerSource.app, 0), 1000);
      expect(pts(true, AnswerSource.app, 5000), 875);
      expect(pts(true, AnswerSource.app, 20000), 500);
      expect(pts(true, AnswerSource.app, 25000), 500);
      expect(pts(true, AnswerSource.card, null), 500);
      expect(pts(true, AnswerSource.card, 0), 500);
      expect(pts(false, AnswerSource.app, 0), 0);
      expect([1, 2, 3, 6, 7, 20].map(quizStreakBonus), [0, 100, 200, 500, 500, 500]);
    });

    test('ranks by score, breaks streaks on a wrong or missed answer and shares ranks on ties', () {
      const app = AnswerSource.app, card = AnswerSource.card;
      final answers = <Map<String, QuizAnswer>>[
        {'a': const QuizAnswer(choice: 1, source: app, elapsedMs: 0), 'b': const QuizAnswer(choice: 1, source: card), 'e': const QuizAnswer(choice: 0, source: app, elapsedMs: 1000)},
        {'a': const QuizAnswer(choice: 1, source: app, elapsedMs: 0), 'c': const QuizAnswer(choice: 1, source: card), 'd': const QuizAnswer(choice: 1, source: card)},
        {'a': const QuizAnswer(choice: 1, source: app, elapsedMs: 5000), 'b': const QuizAnswer(choice: 1, source: card)},
      ];
      const names = {'a': 'Asha', 'b': 'Bala', 'c': 'Chitra', 'd': 'Dev', 'e': 'Esha'};
      final s = scoreQuiz(correct: [1, 1, 1], seconds: [10, 10, 20], revealed: 3, answers: answers, nameOf: (id) => names[id]!);
      expect([for (final r in s) (r.name, r.score, r.rank, r.streak, r.correct)], [
        ('Asha', 1000 + 1100 + 1075, 1, 3, 3),
        ('Bala', 1000, 2, 1, 2),
        ('Chitra', 500, 3, 0, 1),
        ('Dev', 500, 3, 0, 1),
        ('Esha', 0, 5, 0, 0),
      ]);
      final early = scoreQuiz(correct: [1, 1, 1], seconds: [10, 10, 20], revealed: 1, answers: answers, nameOf: (id) => names[id]!);
      expect([for (final r in early) r.name], ['Asha', 'Bala', 'Esha']);
    });
  });

  Future<void> pumpStage(WidgetTester tester, LiveQuizGame game) async {
    tester.view.physicalSize = const Size(1920, 1080);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(localized('en', LiveQuizStage(game: game)));
    await tester.pump();
  }

  /// Lets the board's calls to the (mock) server finish.
  Future<void> settle(WidgetTester tester) async {
    for (var i = 0; i < 5; i++) {
      await tester.pump();
    }
  }

  Future<void> tap(WidgetTester tester, String key) async {
    await tester.tap(find.byKey(Key(key)));
    await tester.pump();
    await tester.pump();
  }

  testWidgets('a guest board plays a card-only game on its own: countdown, cards, answer, leaderboard, podium', (tester) async {
    final board = BoardController(realtimeFactory: (_) => NoRealtime(), outboxStore: MemoryOutboxStore())..skipEnrollment();
    final game = LiveQuizGame(board: board, title: 'Shares', questions: questions, cards: true);
    await game.start();
    await pumpStage(tester, game);
    expect(find.text('Shares'), findsOneWidget);
    expect(find.text(en.quizJoinCards), findsOneWidget);
    expect(find.text(en.quizJoinApp), findsNothing);

    await tap(tester, 'quiz-begin');
    expect(find.text('Which share is redeemable?'), findsOneWidget);
    expect(find.byKey(const Key('quiz-option-3')), findsOneWidget);
    expect(find.text('Shares · ${en.quizQuestionOf(1, 2)}'), findsOneWidget);
    expect(find.text(en.quizNotSaved), findsOneWidget);

    // Card 1 holds up B (right), card 2 holds up A, card 3 holds up E (not an answer here).
    pickClassPhoto = () async => Uint8List(1);
    readClassPhoto = (_) async => const [CardSeen(1, 1, 0, []), CardSeen(2, 0, 0, [])];
    await tap(tester, 'quiz-scan');
    await settle(tester);
    expect(find.text(en.quizAnsweredCount(2)), findsOneWidget);
    expect(find.textContaining(en.pollCardsRead(2)), findsOneWidget);

    // The countdown runs out; with cards the board waits for the teacher.
    await tester.pump(const Duration(seconds: 21));
    expect(game.phase, GamePhase.question);
    expect(find.text(en.quizTimeUp), findsOneWidget);
    await tap(tester, 'quiz-reveal');
    expect(game.phase, GamePhase.reveal);
    expect(find.byKey(const Key('quiz-correct')), findsOneWidget);
    expect(tester.widget<Text>(find.byKey(const Key('quiz-count-1'))).data, '1');
    expect(tester.widget<Text>(find.byKey(const Key('quiz-count-0'))).data, '1');

    await tap(tester, 'quiz-next');
    expect(game.phase, GamePhase.leaderboard);
    expect(find.byKey(const Key('quiz-rank-0')), findsOneWidget);
    expect(find.text('#1'), findsOneWidget);
    expect(find.text(en.quizPoints(500)), findsOneWidget);

    // Question 2: card 1 right again (no speed bonus, but a streak bonus).
    await tap(tester, 'quiz-next');
    expect(find.text('Goodwill is an asset.'), findsOneWidget);
    readClassPhoto = (_) async => const [CardSeen(1, 0, 0, []), CardSeen(2, 1, 0, [])];
    await tap(tester, 'quiz-scan');
    await settle(tester);
    await tap(tester, 'quiz-reveal');
    expect(find.text(en.quizFinalResults), findsOneWidget);
    await tap(tester, 'quiz-next');
    expect(game.phase, GamePhase.podium);
    expect(find.text(en.quizWinners), findsOneWidget);
    expect(tester.widget<Text>(find.byKey(const Key('quiz-podium-1'))).data, '#1');
    expect(find.text(en.quizPoints(1100)), findsOneWidget);
    expect(find.byKey(const Key('quiz-podium-2')), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    game.dispose();
    board.dispose();
  });

  for (final size in const [Size(360, 640), Size(844, 390), Size(1280, 800)]) {
    testWidgets('every screen of the game fits a ${size.width.toInt()}×${size.height.toInt()} screen', (tester) async {
      final board = BoardController(realtimeFactory: (_) => NoRealtime(), outboxStore: MemoryOutboxStore())..skipEnrollment();
      final game = LiveQuizGame(board: board, title: 'Corporate accounting: shares and debentures', questions: questions, cards: true);
      await game.start();
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(localized('en', LiveQuizStage(game: game)));
      await tester.pump();
      expect(tester.takeException(), isNull, reason: 'lobby');
      await game.nextQuestion();
      await tester.pump();
      expect(tester.takeException(), isNull, reason: 'question');
      await game.addCards(const [CardSeen(1, 1, 0, []), CardSeen(2, 0, 0, [])]);
      await game.reveal();
      await tester.pump();
      expect(tester.takeException(), isNull, reason: 'reveal');
      await game.showLeaderboard();
      await tester.pump();
      expect(tester.takeException(), isNull, reason: 'leaderboard');
      await game.finish();
      await tester.pump();
      expect(tester.takeException(), isNull, reason: 'podium');
      await tester.pumpWidget(const SizedBox());
      game.dispose();
      board.dispose();
    });
  }

  group('in a class the server runs the game', () {
    late List<String> requests;
    late List<Map<String, dynamic>> bodies;
    // The next advance calls the server fails, and a call the server holds until the test lets it go.
    var failAdvances = 0;
    Completer<void>? hold;

    BoardController signedIn() {
      requests = [];
      bodies = [];
      failAdvances = 0;
      hold = null;
      final client = MockClient((req) async {
        requests.add('${req.method} ${req.url.path}');
        final body = req.body.isEmpty ? <String, dynamic>{} : jsonDecode(req.body) as Map<String, dynamic>;
        bodies.add(body);
        final path = req.url.path;
        if (hold != null && !path.endsWith('/finish')) await hold!.future;
        if (path.endsWith('/advance') && failAdvances > 0) {
          failAdvances--;
          return jsonResponse({'message': 'Server unavailable'}, 503);
        }
        if (path == '/v1/sessions/current') {
          return jsonResponse({
            'roster': [
              for (var i = 1; i <= 3; i++) {'id': 's$i', 'rollNo': 'R$i', 'fullName': 'Student $i'},
            ],
          });
        }
        if (path == '/v1/answer-cards/current') {
          return jsonResponse({
            'section': {'id': 'sec1', 'displayName': 'BCom Sem 3 A'},
            'cards': [
              for (var i = 1; i <= 3; i++) {'cardNo': i, 'studentId': 's$i', 'rollNo': 'R$i', 'fullName': 'Student $i'},
            ],
          });
        }
        if (path.endsWith('/cards')) return jsonResponse({'matched': [], 'unknown': [], 'answered': 2});
        final leaderboard = [
          {'studentId': 's3', 'name': 'Student 3', 'rollNo': 'R3', 'score': 875, 'correct': 1, 'streak': 1, 'rank': 1},
          {'studentId': 's1', 'name': 'Student 1', 'rollNo': 'R1', 'score': 500, 'correct': 1, 'streak': 1, 'rank': 2},
        ];
        if (path.endsWith('/advance') && body['phase'] == 'reveal') {
          return jsonResponse({
            'status': 'reveal',
            'questions': [
              {'tally': [0, 2, 0, 0]},
            ],
            'leaderboard': leaderboard,
          });
        }
        if (path.endsWith('/finish')) return jsonResponse({'status': 'finished', 'leaderboard': leaderboard});
        return jsonResponse({'status': 'ok'});
      });
      final board = BoardController(realtimeFactory: (_) => NoRealtime(), outboxStore: MemoryOutboxStore())..skipEnrollment();
      board.api = ApiClient(baseUrl: 'http://test', client: client);
      board.onPaired('session-token', sessionIn('en'));
      return board;
    }

    void answered(BoardController board, LiveQuizGame game, String studentId, int choice, {int answered = 1}) => board.classEvents.add((
      RealtimeEvents.gameAnswered,
      {'gameId': game.id, 'index': game.index, 'studentId': studentId, 'choice': choice, 'source': 'app', 'elapsedMs': 5000, 'answered': answered, 'classSize': 3},
    ));

    testWidgets('app answers arrive live; the reveal and podium show the server\'s scores', (tester) async {
      final board = signedIn();
      final game = LiveQuizGame(board: board, title: 'Shares', questions: questions, cards: true);
      await settle(tester);
      unawaited(game.start());
      await settle(tester);
      expect(game.saved, isTrue);
      expect(requests, contains('PUT /v1/quiz-games/${game.id}'));
      final created = bodies[requests.indexOf('PUT /v1/quiz-games/${game.id}')];
      expect(created['cards'], isTrue);
      expect((created['questions'] as List).first, {'kind': 'mcq', 'question': 'Which share is redeemable?', 'options': ['Equity', 'Preference', 'Bonus', 'Rights'], 'correct': 1, 'seconds': 20});

      await pumpStage(tester, game);
      expect(find.text(en.quizJoinApp), findsOneWidget);
      await tap(tester, 'quiz-begin');
      await settle(tester);
      expect(bodies.last, {'phase': 'question', 'index': 0});
      answered(board, game, 's3', 1);
      await settle(tester);
      expect(find.text(en.pollAnswered(1, 3)), findsOneWidget);
      expect(find.text(en.quizSaved), findsOneWidget);

      // A card read for the student who answered in the app does not replace the app answer.
      unawaited(game.addCards(const [CardSeen(1, 1, 0, []), CardSeen(3, 0, 0, [])]));
      await settle(tester);
      expect(game.answers[0]['s3']!.source, AnswerSource.app);
      expect(requests.last, 'POST /v1/quiz-games/${game.id}/cards');
      expect(find.text(en.pollAnswered(2, 3)), findsOneWidget);

      await tap(tester, 'quiz-reveal');
      await settle(tester);
      expect(bodies.last, {'phase': 'reveal', 'index': 0});
      expect(game.tally, [0, 2, 0, 0]);
      await tap(tester, 'quiz-next');
      expect(find.text('Student 3'), findsOneWidget);
      expect(find.text(en.quizPoints(875)), findsOneWidget);

      await tap(tester, 'quiz-end');
      await settle(tester);
      expect(requests.last, 'POST /v1/quiz-games/${game.id}/finish');
      expect(game.phase, GamePhase.podium);
      expect(tester.widget<Text>(find.byKey(const Key('quiz-podium-1'))).data, 'Student 3');
      await tester.pumpWidget(const SizedBox());
      game.dispose();
      board.dispose();
    });

    testWidgets('without cards the answer shows when everyone has answered, or when time is up', (tester) async {
      final board = signedIn();
      final game = LiveQuizGame(board: board, title: 'Shares', questions: questions);
      await settle(tester);
      unawaited(game.start());
      await settle(tester);
      await pumpStage(tester, game);
      await tap(tester, 'quiz-begin');
      await settle(tester);
      answered(board, game, 's1', 1, answered: 1);
      answered(board, game, 's2', 0, answered: 2);
      await settle(tester);
      expect(game.phase, GamePhase.question);
      answered(board, game, 's3', 1, answered: 3);
      await settle(tester);
      expect(game.phase, GamePhase.reveal);
      expect(bodies.last, {'phase': 'reveal', 'index': 0});

      // Question 2 (10 s): nobody answers; the countdown runs out and the answer shows on its own.
      await tap(tester, 'quiz-next');
      await tap(tester, 'quiz-next');
      await settle(tester);
      expect(find.text('Goodwill is an asset.'), findsOneWidget);
      await tester.pump(const Duration(seconds: 5));
      expect(game.phase, GamePhase.question);
      expect(game.secondsLeft, 5);
      await tester.pump(const Duration(seconds: 5));
      await settle(tester);
      // A moment more, for an app answer sent just before time was up.
      expect(game.phase, GamePhase.question);
      await tester.pump(quizAnswerGrace);
      await settle(tester);
      expect(game.phase, GamePhase.reveal);
      expect(bodies.last, {'phase': 'reveal', 'index': 1});
      await tester.pumpWidget(const SizedBox());
      game.dispose();
      board.dispose();
    });

    testWidgets('a step the server does not take leaves the board where it was until the teacher tries again', (tester) async {
      final board = signedIn();
      final game = LiveQuizGame(board: board, title: 'Shares', questions: questions, cards: true);
      await settle(tester);
      // The game cannot begin before the server has it.
      hold = Completer();
      unawaited(game.start());
      await pumpStage(tester, game);
      expect(game.busy, isTrue);
      expect(tester.widget<FilledButton>(find.byKey(const Key('quiz-begin'))).onPressed, isNull);
      hold!.complete();
      hold = null;
      await settle(tester);
      expect(game.saved, isTrue);
      expect(game.busy, isFalse);

      failAdvances = 1;
      await tap(tester, 'quiz-begin');
      await settle(tester);
      expect(game.phase, GamePhase.lobby);
      expect(game.index, -1);
      expect(game.saved, isTrue);
      await tap(tester, 'quiz-begin');
      await settle(tester);
      expect(game.phase, GamePhase.question);
      expect(game.index, 0);

      failAdvances = 1;
      await tap(tester, 'quiz-reveal');
      await settle(tester);
      expect(game.phase, GamePhase.question);
      expect(game.retry, isTrue);
      expect(find.text(en.quizServerRetry), findsOneWidget);
      await tap(tester, 'quiz-reveal');
      await settle(tester);
      expect(game.phase, GamePhase.reveal);
      expect(game.retry, isFalse);
      expect(find.text(en.quizSaved), findsOneWidget);
      expect([for (final b in bodies.where((b) => b.containsKey('phase'))) '${b['phase']} ${b['index']}'], ['question 0', 'question 0', 'reveal 0', 'reveal 0']);
      await tester.pumpWidget(const SizedBox());
      game.dispose();
      board.dispose();
    });

    testWidgets('closed while a call is under way, the game still ends on the server', (tester) async {
      final board = signedIn();
      final game = LiveQuizGame(board: board, title: 'Shares', questions: questions, cards: true);
      await settle(tester);
      unawaited(game.start());
      await settle(tester);
      await pumpStage(tester, game);
      hold = Completer();
      await tap(tester, 'quiz-begin');
      expect(game.busy, isTrue);
      var closed = false;
      unawaited(game.close().then((_) => closed = true));
      await tester.pump(const Duration(milliseconds: 200));
      expect(closed, isFalse);
      hold!.complete();
      hold = null;
      await tester.pump(const Duration(milliseconds: 100));
      await settle(tester);
      expect(closed, isTrue);
      expect(requests.last, 'POST /v1/quiz-games/${game.id}/finish');
      expect(game.phase, GamePhase.podium);
      await tester.pumpWidget(const SizedBox());
      game.dispose();
      board.dispose();
    });
  });

  testWidgets('setup: questions made on the topic, saved ones and one the teacher writes, then the time and cards', (tester) async {
    tester.view.physicalSize = const Size(1400, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final board = BoardController(realtimeFactory: (_) => NoRealtime(), outboxStore: MemoryOutboxStore())..skipEnrollment();
    LiveQuizSetup? got;
    final generator = AssessmentGenerator(
      bank: (topic) => [QuizQuestion(question: 'What is a debenture?', options: const ['A loan', 'A share', 'A tax', 'A fee'], answer: 0, explanation: '')],
    );
    await tester.pumpWidget(
      localized(
        'en',
        Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: FilledButton(
                onPressed: () async => got = await showDialog<LiveQuizSetup>(
                  context: context,
                  builder: (_) => LiveQuizSetupDialog(
                    board: board,
                    generator: generator,
                    initialTopic: 'Debentures',
                    suggestions: (topic) async => [const GameQuestion(kind: QuizKind.tf, question: 'Is goodwill intangible?', options: ['True', 'False'], correct: 0)],
                  ),
                ),
                child: const Text('open'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    expect(tester.widget<FilledButton>(find.byKey(const Key('quiz-start-game'))).onPressed, isNull);
    expect(find.text(en.quizNotSaved), findsOneWidget);
    // Answer cards are on when the board has no class on the server.
    expect(tester.widget<SwitchListTile>(find.byKey(const Key('quiz-cards'))).value, isTrue);

    await tester.tap(find.byKey(const Key('quiz-make')));
    await tester.pumpAndSettle();
    expect(find.text('What is a debenture?'), findsOneWidget);

    await tester.tap(find.byKey(const Key('quiz-saved')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('quiz-saved-0')));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('quiz-add')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('quiz-edit-question')), 'Debentures carry…');
    await tester.tap(find.text('A–C'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('quiz-edit-option-0')), 'Interest');
    await tester.enterText(find.byKey(const Key('quiz-edit-option-1')), 'Dividend');
    await tester.tap(find.byKey(const Key('quiz-edit-correct-0')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('quiz-edit-add')));
    await tester.tap(find.byKey(const Key('quiz-edit-add')));
    await tester.pumpAndSettle();
    expect(find.text(en.quizQuestionCount(3)), findsOneWidget);

    await tester.ensureVisible(find.byKey(const Key('quiz-seconds-10')));
    await tester.tap(find.byKey(const Key('quiz-seconds-10')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('quiz-start-game')));
    await tester.pumpAndSettle();
    expect(got!.title, 'Debentures');
    expect(got!.cards, isTrue);
    expect([for (final q in got!.questions) q.question], ['What is a debenture?', 'Is goodwill intangible?', 'Debentures carry…']);
    expect(got!.questions.every((q) => q.seconds == 10), isTrue);
    expect(got!.questions[1].kind, QuizKind.tf);
    expect(got!.questions[2].options, ['Interest', 'Dividend', 'C']);
    expect(got!.questions[2].correct, 0);
    board.dispose();
  });
}
