import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_student/core/live.dart';
import 'package:kinetix_student/core/live_quiz.dart';
import 'package:kinetix_student/features/live/live_quiz_controller.dart';
import 'package:kinetix_student/features/live/live_quiz_screen.dart';
import 'package:kinetix_student/l10n/l10n.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'fake_api.dart';
import 'fake_live.dart';
import 'helpers.dart';

/// The Live Quiz from the Student App: the board runs the game, the phone shows coloured tiles,
/// takes one answer, then right or wrong, points and rank, and the final rank.
void main() {
  final t0 = DateTime.utc(2026, 10, 18, 10);

  QuizQuestion question({String game = 'g1', int index = 0, int count = 3, QuizKind kind = QuizKind.mcq, DateTime? serverNow, int seconds = 20}) {
    final now = serverNow ?? t0;
    return QuizQuestion(
      gameId: game,
      title: 'Fractions',
      index: index,
      count: count,
      kind: kind,
      question: 'Which is the biggest?',
      options: kind == QuizKind.tf ? const ['True', 'False'] : const ['1/2', '2/3', '3/4', '1/4'],
      seconds: seconds,
      closesAt: now.add(Duration(seconds: seconds)),
      serverNow: now,
    );
  }

  QuizReveal reveal({String game = 'g1', int index = 0, int? choice = 2, bool correct = true, int points = 950, int score = 950, int rank = 2, int streak = 1}) => QuizReveal(
    gameId: game,
    index: index,
    count: 3,
    correct: 2,
    leaderboard: const [
      QuizStanding(studentId: 's9', name: 'Asha Rao', score: 990, rank: 1),
      QuizStanding(studentId: 's1', name: 'Priya Nair', score: 950, rank: 2),
    ],
    me: QuizMyResult(answered: choice != null, choice: choice, correct: correct, points: points, score: score, rank: rank, streak: streak),
  );

  group('LiveQuizController', () {
    late FakeStudentApi api;
    late DateTime clock;
    late LiveQuizController quiz;

    setUp(() {
      api = FakeStudentApi();
      clock = t0;
      quiz = LiveQuizController(api, now: () => clock);
    });

    test('parses the server events', () {
      final q = QuizQuestion.fromJson({
        'gameId': 'g1',
        'title': '',
        'index': 1,
        'count': 4,
        'kind': 'tf',
        'question': 'Water boils at 100 °C',
        'options': ['True', 'False'],
        'seconds': 10,
        'openedAt': '2026-10-18T10:00:00.000Z',
        'closesAt': '2026-10-18T10:00:10.000Z',
        'serverNow': '2026-10-18T10:00:01.000Z',
      });
      expect((q.kind, q.index, q.options.length), (QuizKind.tf, 1, 2));
      final r = QuizReveal.fromJson({
        'gameId': 'g1',
        'index': 1,
        'count': 4,
        'correct': 0,
        'tally': [3, 1],
        'answered': 4,
        'classSize': 30,
        'leaderboard': [
          {'studentId': 's1', 'name': 'Priya', 'rollNo': null, 'score': 900, 'correct': 1, 'streak': 1, 'rank': 1},
        ],
        'me': {'answered': true, 'choice': 0, 'correct': true, 'points': 900, 'score': 900, 'rank': 1, 'streak': 1},
      });
      expect((r.correct, r.me!.points, r.leaderboard.single.name), (0, 900, 'Priya'));
      final e = QuizEnd.fromJson({
        'gameId': 'g1',
        'podium': [],
        'cancelled': false,
        'me': {'score': 900, 'rank': 3, 'correct': 1, 'count': 4},
      });
      expect((e.rank, e.correct, e.count), (3, 1, 4));
      final s = StudentQuizGame.fromJson({'game': null, 'status': 'lobby', 'myChoice': null, 'score': 0});
      expect((s.game, s.status), (null, QuizStatus.lobby));
    });

    test('a question takes one answer, then the reveal gives points and rank, and the end the final rank', () async {
      quiz.handle(question());
      expect((quiz.phase, quiz.canAnswer, quiz.remaining), (QuizPhase.question, true, const Duration(seconds: 20)));
      expect(quiz.takePrompt(), isTrue);
      expect(quiz.takePrompt(), isFalse, reason: 'one prompt per game');

      await quiz.answer(2);
      expect(api.calls, contains('quizAnswer g1 0 2'));
      expect((quiz.myChoice, quiz.canAnswer), (2, false));
      await quiz.answer(1);
      expect(api.calls.where((c) => c.startsWith('quizAnswer')), hasLength(1), reason: 'the first answer is final');

      // The same question again (a resent event) keeps the answer.
      quiz.handle(question());
      expect(quiz.myChoice, 2);

      quiz.handle(reveal());
      expect((quiz.phase, quiz.score, quiz.rank, quiz.reveal!.me!.points), (QuizPhase.revealed, 950, 2, 950));

      quiz.handle(question(index: 1));
      expect((quiz.phase, quiz.myChoice, quiz.reveal), (QuizPhase.question, null, null));
      expect(quiz.score, 950, reason: 'the score carries on');

      quiz.handle(const QuizEnd(gameId: 'g1', score: 1800, rank: 1, correct: 2, count: 3));
      expect((quiz.phase, quiz.score, quiz.rank, quiz.active), (QuizPhase.ended, 1800, 1, false));
      quiz.dismiss();
      expect(quiz.phase, QuizPhase.none);
    });

    test('counts down by the server clock, so a phone with a wrong clock is still right', () {
      // The phone is an hour ahead of the server.
      clock = t0.add(const Duration(hours: 1));
      quiz.handle(question(serverNow: t0.add(const Duration(seconds: 5))));
      expect(quiz.remaining, const Duration(seconds: 20));
      clock = clock.add(const Duration(seconds: 12));
      expect(quiz.remaining, const Duration(seconds: 8));
      clock = clock.add(const Duration(seconds: 9));
      expect((quiz.remaining, quiz.timeUp, quiz.canAnswer), (Duration.zero, true, false));
    });

    test('an answer the server refuses (time up) is taken back and says why', () async {
      quiz.handle(question());
      api.quizTimeUp = true;
      await quiz.answer(1);
      expect((quiz.myChoice, quiz.error?.status, quiz.sending), (null, 400, false));
    });

    test('a new game starts from nothing', () {
      quiz.handle(question());
      quiz.handle(reveal());
      quiz.handle(question(game: 'g2'));
      expect((quiz.gameId, quiz.score, quiz.rank), ('g2', 0, null));
      expect(quiz.takePrompt(), isTrue);
    });

    test('joining late or after a reconnect lands on the right screen', () async {
      // No game.
      await quiz.refresh();
      expect(quiz.phase, QuizPhase.none);

      // The teacher made one and has not started it.
      api.quiz = const StudentQuizGame(status: QuizStatus.lobby);
      await quiz.refresh();
      expect((quiz.phase, quiz.active), (QuizPhase.lobby, true));

      // A question open, already answered from this phone before the connection dropped.
      api.quiz = StudentQuizGame(game: question(index: 1), status: QuizStatus.question, myChoice: 3, score: 700);
      await quiz.refresh();
      expect((quiz.phase, quiz.myChoice, quiz.score, quiz.question!.index), (QuizPhase.question, 3, 700, 1));

      // Revealed while away: the score, and waiting for the next one.
      api.quiz = StudentQuizGame(game: question(index: 1), status: QuizStatus.reveal, myChoice: 3, score: 1500);
      await quiz.refresh();
      expect((quiz.phase, quiz.reveal, quiz.score), (QuizPhase.revealed, null, 1500));

      // Finished while away.
      api.quiz = const StudentQuizGame();
      await quiz.refresh();
      expect((quiz.phase, quiz.score), (QuizPhase.ended, 1500));
    });
  });

  group('LiveQuizScreen', () {
    Widget host(LiveQuizController quiz) => MaterialApp(
      theme: KinetixTheme.light(),
      locale: const Locale('en'),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: appLocalizationsDelegates,
      home: LiveQuizScreen(quiz: quiz),
    );

    testWidgets('waits in the lobby, then shows a tile per answer; True / False is two tiles', (tester) async {
      final quiz = LiveQuizController(FakeStudentApi(), now: () => t0);
      await tester.pumpWidget(host(quiz));
      expect(find.text('Waiting for your teacher to start the game'), findsOneWidget);

      quiz.handle(question());
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('liveQuizQuestion')), findsOneWidget);
      for (var i = 0; i < 4; i++) {
        expect(find.byKey(Key('quizTile-$i')), findsOneWidget);
      }
      expect(find.text('Question 1 of 3'), findsOneWidget);
      expect(find.text('20'), findsOneWidget);
      expect(find.text('Which is the biggest?'), findsNothing, reason: 'the question stays on the board');

      quiz.handle(question(index: 1, kind: QuizKind.tf));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('quizTile-1')), findsOneWidget);
      expect(find.byKey(const Key('quizTile-2')), findsNothing);
      expect(find.text('True'), findsOneWidget);
    });

    testWidgets('time up: the tiles stop taking answers', (tester) async {
      var clock = t0;
      final quiz = LiveQuizController(FakeStudentApi(), now: () => clock);
      quiz.handle(question());
      await tester.pumpWidget(host(quiz));
      clock = t0.add(const Duration(seconds: 21));
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('Time is up'), findsOneWidget);
      await tester.tap(find.byKey(const Key('quizTile-0')));
      await tester.pumpAndSettle();
      expect(quiz.myChoice, isNull);
    });

    testWidgets('right or wrong after the reveal, and the final rank', (tester) async {
      final quiz = LiveQuizController(FakeStudentApi(), now: () => t0);
      quiz.handle(question());
      await tester.pumpWidget(host(quiz));
      quiz.handle(reveal(choice: 1, correct: false, points: 0, score: 0, rank: 5));
      await tester.pumpAndSettle();
      expect(find.text('Not this time'), findsOneWidget);
      expect(find.text('+0 points'), findsOneWidget);
      expect(find.text('Score: 0 · You are number 5'), findsOneWidget);
      expect(find.text('Asha Rao'), findsOneWidget);

      quiz.handle(question(index: 1));
      quiz.handle(reveal(index: 1, choice: null, correct: false, points: 0, score: 0, rank: 6));
      await tester.pumpAndSettle();
      expect(find.text('You did not answer'), findsOneWidget);

      quiz.handle(const QuizEnd(gameId: 'g1', cancelled: true, score: 0, rank: 6, correct: 0, count: 3));
      await tester.pumpAndSettle();
      expect(find.text('Live Quiz over'), findsOneWidget);
      expect(find.text('Your teacher ended the game'), findsOneWidget);
      expect(find.text('You came number 6'), findsOneWidget);
      expect(find.text('0 of 3 right'), findsOneWidget);
    });
  });

  group('in the app', () {
    QuizQuestion liveQuestion({int index = 0}) {
      final now = DateTime.now();
      return QuizQuestion(
        gameId: 'g1',
        title: 'Fractions',
        index: index,
        count: 2,
        kind: QuizKind.mcq,
        question: 'Which is the biggest?',
        options: const ['1/2', '2/3', '3/4', '1/4'],
        seconds: 30,
        closesAt: now.add(const Duration(seconds: 30)),
        serverNow: now,
      );
    }

    testWidgets('a game starting asks to join; the student answers and sees the result and the final rank', (tester) async {
      final server = FakeLiveServer();
      final (api, _) = await pumpApp(tester, live: server);
      expect(find.byKey(const Key('liveQuizBanner')), findsNothing);

      server.last.send(LiveQuizSignal(liveQuestion()));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('liveQuizPrompt')), findsOneWidget);
      await tester.tap(find.byKey(const Key('liveQuizJoin')));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('quizTile-2')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('quizAnswer g1 0 2'));
      expect(find.text('Answer sent'), findsOneWidget);

      server.last.send(LiveQuizSignal(reveal()));
      await tester.pumpAndSettle();
      expect(find.text('Correct!'), findsOneWidget);
      expect(find.text('+950 points'), findsOneWidget);
      expect(find.text('Score: 950 · You are number 2'), findsOneWidget);

      // The next question does not ask again: the student is already playing.
      server.last.send(LiveQuizSignal(liveQuestion(index: 1)));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('liveQuizPrompt')), findsNothing);
      expect(find.byKey(const Key('liveQuizQuestion')), findsOneWidget);

      server.last.send(const LiveQuizSignal(QuizEnd(gameId: 'g1', score: 1900, rank: 1, correct: 2, count: 2)));
      await tester.pumpAndSettle();
      expect(find.text('You came number 1'), findsOneWidget);
      await tester.tap(find.byKey(const Key('liveQuizDone')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('liveQuizBanner')), findsNothing);
    });

    testWidgets('a student who joins late or says "Not now" plays from the banner; a reconnect catches up', (tester) async {
      final server = FakeLiveServer();
      final (api, _) = await pumpApp(tester, live: server, setup: (api) => api.quiz = StudentQuizGame(game: liveQuestion(), status: QuizStatus.question, score: 0));
      // The app opened mid-game: asked straight away.
      expect(find.byKey(const Key('liveQuizPrompt')), findsOneWidget);
      await tester.tap(find.text('Not now'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('liveQuizBanner')), findsOneWidget);
      expect(find.textContaining('Question 1 of 2'), findsOneWidget);

      // While the connection was down the question was revealed: the reconnect catches up.
      api.quiz = StudentQuizGame(game: liveQuestion(), status: QuizStatus.reveal, score: 800);
      server.last.send(const LiveDisconnected());
      server.last.send(const LiveReady());
      await tester.pumpAndSettle();
      expect(api.calls.where((c) => c == 'quizGame'), hasLength(2));
      expect(find.byKey(const Key('liveQuizPrompt')), findsNothing, reason: 'asked once per game');

      await tester.tap(find.byKey(const Key('liveQuizBanner')));
      await tester.pumpAndSettle();
      expect(find.text('Waiting for the next question'), findsOneWidget);
      expect(find.text('Score: 800'), findsOneWidget);
    });
  });
}
