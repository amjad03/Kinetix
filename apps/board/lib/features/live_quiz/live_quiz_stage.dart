import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_cards/kinetix_cards.dart' show answerLetters;
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../l10n/l10n.dart';
import '../board/chrome.dart' show showBoardMessage;
import '../class_check/class_check_panel.dart' show pickClassPhoto, readClassPhoto;
import 'live_quiz_game.dart';

/// The answers' colours and shapes, as in a game show: the class can say "the red triangle".
const quizOptionColors = [Color(0xFFE21B3C), Color(0xFF1368CE), Color(0xFFC88A00), Color(0xFF26890C)];
const quizOptionIcons = [Icons.change_history, Icons.diamond_outlined, Icons.circle_outlined, Icons.crop_square];

const _stageBg = Color(0xFF241A4A);
const _stageCard = Color(0xFF34296B);

/// The Live Quiz full screen on the board: the lobby, each question with its countdown and how
/// many have answered, the right answer with a bar chart, the top 5 between questions and the
/// podium at the end. Dark and large, to be read from the back of the room.
class LiveQuizStage extends StatefulWidget {
  const LiveQuizStage({super.key, required this.game});

  final LiveQuizGame game;

  @override
  State<LiveQuizStage> createState() => _LiveQuizStageState();
}

class _LiveQuizStageState extends State<LiveQuizStage> {
  bool _scanning = false;

  LiveQuizGame get game => widget.game;

  Future<void> _scan() async {
    final l = context.l10n;
    setState(() => _scanning = true);
    try {
      final photo = await pickClassPhoto();
      if (photo == null || !mounted) return;
      final seen = await readClassPhoto(photo);
      if (!mounted) return;
      if (seen.isEmpty) {
        showBoardMessage(context, l.pollNoCards);
        return;
      }
      final scan = await game.addCards(seen);
      if (!mounted) return;
      showBoardMessage(context, scan.unknown.isEmpty ? l.pollCardsRead(scan.read) : '${l.pollCardsRead(scan.read)} ${l.pollUnknownCards(scan.unknown.join(', '))}');
    } catch (_) {
      if (mounted) showBoardMessage(context, l.pollScanFailed);
    } finally {
      if (mounted) setState(() => _scanning = false);
    }
  }

  Future<void> _close() async {
    await game.close();
    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Theme(
      data: ThemeData(brightness: Brightness.dark, colorSchemeSeed: const Color(0xFF7C4DFF), useMaterial3: true),
      child: Builder(
        builder: (context) => Scaffold(
          backgroundColor: _stageBg,
          body: SafeArea(
            child: ListenableBuilder(
              listenable: game,
              builder: (context, _) => Padding(
                padding: const EdgeInsets.all(Kx.s16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.quiz_outlined, color: Colors.white70),
                        const SizedBox(width: Kx.s8),
                        Expanded(
                          child: Text(
                            switch (game.phase) {
                              GamePhase.lobby => l.topLiveQuiz,
                              GamePhase.podium => game.title,
                              _ => '${game.title} · ${l.quizQuestionOf(game.index + 1, game.questions.length)}',
                            },
                            key: const Key('quiz-heading'),
                            style: const TextStyle(color: Colors.white70, fontSize: 18, fontWeight: FontWeight.w600),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (game.phase != GamePhase.podium && game.phase != GamePhase.lobby)
                          TextButton.icon(key: const Key('quiz-end'), onPressed: game.busy ? null : () => unawaited(game.finish()), icon: const Icon(Icons.flag_outlined), label: Text(l.quizEndGame)),
                        IconButton(key: const Key('quiz-close'), tooltip: l.close, onPressed: _close, icon: const Icon(Icons.close, color: Colors.white)),
                      ],
                    ),
                    const SizedBox(height: Kx.s8),
                    Expanded(
                      child: switch (game.phase) {
                        GamePhase.lobby => _lobby(context),
                        GamePhase.question => _question(context),
                        GamePhase.reveal => _reveal(context),
                        GamePhase.leaderboard => _leaderboard(context),
                        GamePhase.podium => _podium(context),
                      },
                    ),
                    if (game.phase != GamePhase.lobby)
                      Padding(
                        padding: const EdgeInsets.only(top: Kx.s8),
                        child: Text(
                          game.retry ? l.quizServerRetry : (game.saved ? l.quizSaved : l.quizNotSaved),
                          key: const Key('quiz-saved-note'),
                          textAlign: TextAlign.center,
                          style: TextStyle(color: game.retry ? Colors.amberAccent : Colors.white54, fontSize: 13),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _big(String text, {double size = 40, Key? key}) => Text(
    text,
    key: key,
    textAlign: TextAlign.center,
    style: TextStyle(color: Colors.white, fontSize: size, fontWeight: FontWeight.w700, height: 1.2),
  );

  Widget _lobby(BuildContext context) {
    final l = context.l10n;
    return Center(
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _big(game.title, size: 56),
            const SizedBox(height: Kx.s12),
            Text(l.quizQuestionCount(game.questions.length), style: const TextStyle(color: Colors.white70, fontSize: 24)),
            const SizedBox(height: Kx.s24),
            if (game.saved) _hint(Icons.phone_android, l.quizJoinApp),
            if (game.cards || !game.saved) _hint(Icons.style_outlined, l.quizJoinCards),
            const SizedBox(height: Kx.s32),
            FilledButton.icon(
              key: const Key('quiz-begin'),
              style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 20), textStyle: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700)),
              onPressed: game.busy ? null : () => unawaited(game.nextQuestion()),
              icon: const Icon(Icons.play_arrow_rounded, size: 32),
              label: Text(l.quizBegin),
            ),
          ],
        ),
      ),
    );
  }

  Widget _hint(IconData icon, String text) => Padding(
    padding: const EdgeInsets.symmetric(vertical: Kx.s4),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, color: Colors.white70),
        const SizedBox(width: Kx.s8),
        Flexible(child: Text(text, style: const TextStyle(color: Colors.white, fontSize: 22))),
      ],
    ),
  );

  Widget _question(BuildContext context) {
    final l = context.l10n;
    final q = game.question!;
    return LayoutBuilder(
      builder: (context, box) {
        final compact = box.maxHeight < 420;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Flexible(
              flex: 2,
              child: Center(child: SingleChildScrollView(child: _big(q.question, size: compact ? 26 : 40, key: const Key('quiz-question')))),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: Kx.s8),
              child: Wrap(
                alignment: WrapAlignment.spaceBetween,
                crossAxisAlignment: WrapCrossAlignment.center,
                spacing: Kx.s16,
                runSpacing: Kx.s8,
                children: [
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      _Countdown(key: const Key('quiz-timer'), left: game.secondsLeft, total: q.seconds),
                      const SizedBox(width: Kx.s16),
                      Text(
                        game.timeUp ? l.quizTimeUp : (game.classSize > 0 ? l.pollAnswered(game.answered, game.classSize) : l.quizAnsweredCount(game.answered)),
                        key: const Key('quiz-answered'),
                        style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                  Wrap(
                    spacing: Kx.s8,
                    runSpacing: Kx.s8,
                    children: [
                      if (game.cards)
                        FilledButton.tonalIcon(
                          key: const Key('quiz-scan'),
                          onPressed: _scanning ? null : _scan,
                          icon: _scanning ? const SizedBox.square(dimension: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.photo_camera_outlined),
                          label: Text(l.pollScanCards),
                        ),
                      FilledButton.icon(key: const Key('quiz-reveal'), onPressed: game.busy ? null : () => unawaited(game.reveal()), icon: const Icon(Icons.visibility_outlined), label: Text(l.quizShowAnswer)),
                    ],
                  ),
                ],
              ),
            ),
            Flexible(flex: 3, child: _options(q, reveal: false)),
          ],
        );
      },
    );
  }

  /// The answers as coloured tiles; once revealed, each with its bar and the right one marked.
  Widget _options(GameQuestion q, {required bool reveal}) {
    final most = game.tally.fold<int>(1, math.max);
    // A phone: smaller type, so the right-answer mark and the count still fit.
    final narrow = MediaQuery.sizeOf(context).width < 600;
    final font = narrow ? 18.0 : 26.0;
    final tiles = [
      for (var i = 0; i < q.options.length; i++)
        Opacity(
          opacity: reveal && i != q.correct ? 0.45 : 1,
          child: Container(
            key: Key('quiz-option-$i'),
            margin: const EdgeInsets.all(6),
            padding: EdgeInsets.symmetric(horizontal: narrow ? Kx.s8 : Kx.s16, vertical: Kx.s8),
            decoration: BoxDecoration(color: quizOptionColors[i], borderRadius: BorderRadius.circular(Kx.rLg)),
            child: Row(
              children: [
                Icon(quizOptionIcons[i], color: Colors.white, size: narrow ? 22 : 32),
                SizedBox(width: narrow ? Kx.s4 : Kx.s12),
                Expanded(
                  child: Text(
                    q.kind == QuizKind.tf ? q.options[i] : '${answerLetters[i]}. ${q.options[i]}',
                    style: TextStyle(color: Colors.white, fontSize: font, fontWeight: FontWeight.w700),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (reveal && i == q.correct) Icon(Icons.check_circle, key: const Key('quiz-correct'), color: Colors.white, size: narrow ? 22 : 36),
                if (reveal)
                  SizedBox(
                    width: narrow ? 32 : 56,
                    child: Text('${game.tally.elementAtOrNull(i) ?? 0}', key: Key('quiz-count-$i'), textAlign: TextAlign.end, style: TextStyle(color: Colors.white, fontSize: font, fontWeight: FontWeight.w800)),
                  ),
              ],
            ),
          ),
        ),
    ];
    final grid = Column(
      children: [
        for (var r = 0; r < tiles.length; r += 2)
          Expanded(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [Expanded(child: tiles[r]), if (r + 1 < tiles.length) Expanded(child: tiles[r + 1])],
            ),
          ),
      ],
    );
    if (!reveal) return grid;
    // The bar chart above the tiles: one bar per answer, in its colour.
    return Column(
      children: [
        Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: Kx.s24),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                for (var i = 0; i < q.options.length; i++)
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: Kx.s12),
                      child: LayoutBuilder(
                        builder: (context, box) => Column(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            Container(
                              key: Key('quiz-bar-$i'),
                              height: math.max(6, box.maxHeight * (game.tally.elementAtOrNull(i) ?? 0) / most),
                              decoration: BoxDecoration(
                                color: quizOptionColors[i].withValues(alpha: i == q.correct ? 1 : 0.5),
                                borderRadius: const BorderRadius.vertical(top: Radius.circular(8)),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
        Expanded(child: grid),
      ],
    );
  }

  Widget _reveal(BuildContext context) {
    final l = context.l10n;
    final q = game.question!;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _big(q.question, size: 28),
        const SizedBox(height: Kx.s8),
        Expanded(child: _options(q, reveal: true)),
        Align(
          alignment: Alignment.centerRight,
          child: FilledButton.icon(
            key: const Key('quiz-next'),
            onPressed: game.busy ? null : () => unawaited(game.showLeaderboard()),
            icon: const Icon(Icons.arrow_forward),
            label: Text(game.isLast ? l.quizFinalResults : l.quizNext),
          ),
        ),
      ],
    );
  }

  Widget _leaderboard(BuildContext context) {
    final l = context.l10n;
    final rows = game.leaderboard;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _big(l.quizLeaderboard, size: 36),
        const SizedBox(height: Kx.s12),
        Expanded(
          child: rows.isEmpty
              ? Center(child: Text(l.quizNoAnswers, style: const TextStyle(color: Colors.white70, fontSize: 22)))
              : ListView(
                  padding: EdgeInsets.symmetric(horizontal: math.max(0, (MediaQuery.sizeOf(context).width - 960) / 2)),
                  children: [
                    for (final (i, s) in rows.indexed)
                      Container(
                        key: Key('quiz-rank-$i'),
                        margin: const EdgeInsets.symmetric(vertical: 4),
                        padding: const EdgeInsets.symmetric(horizontal: Kx.s20, vertical: Kx.s12),
                        decoration: BoxDecoration(color: i == 0 ? const Color(0xFF5B3FD1) : _stageCard, borderRadius: BorderRadius.circular(Kx.rLg)),
                        child: Row(
                          children: [
                            SizedBox(width: 44, child: Text('${s.rank}', style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w800))),
                            Expanded(child: Text(s.name, style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w600), overflow: TextOverflow.ellipsis)),
                            if (s.streak >= 2)
                              Tooltip(
                                message: l.quizStreak(s.streak),
                                child: Padding(
                                  padding: const EdgeInsets.only(right: Kx.s16),
                                  child: Row(
                                    children: [
                                      const Icon(Icons.local_fire_department, color: Color(0xFFFFA726)),
                                      Text('${s.streak}', style: const TextStyle(color: Color(0xFFFFCC80), fontSize: 18, fontWeight: FontWeight.w700)),
                                    ],
                                  ),
                                ),
                              ),
                            Text(l.quizPoints(s.score), style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w800)),
                          ],
                        ),
                      ),
                  ],
                ),
        ),
        Align(
          alignment: Alignment.centerRight,
          child: FilledButton.icon(key: const Key('quiz-next'), onPressed: game.busy ? null : () => unawaited(game.nextQuestion()), icon: const Icon(Icons.arrow_forward), label: Text(l.quizNextQuestion)),
        ),
      ],
    );
  }

  Widget _podium(BuildContext context) {
    final l = context.l10n;
    final top = game.standings.where((s) => s.rank <= 3).take(3).toList();
    // Second on the left, first in the middle, third on the right.
    final order = [if (top.length > 1) (top[1], 0.62), if (top.isNotEmpty) (top[0], 1.0), if (top.length > 2) (top[2], 0.45)];
    return Column(
      children: [
        _big(l.quizWinners, size: 40),
        Expanded(
          child: top.isEmpty
              ? Center(child: Text(l.quizNoAnswers, style: const TextStyle(color: Colors.white70, fontSize: 22)))
              : LayoutBuilder(
                  builder: (context, box) => Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      for (final (s, h) in order)
                        SizedBox(
                          width: math.min(240, box.maxWidth / 3 - 16),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: Kx.s8),
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.end,
                              children: [
                                Text(s.name, key: Key('quiz-podium-${s.rank}'), textAlign: TextAlign.center, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w700)),
                                Text(l.quizPoints(s.score), style: const TextStyle(color: Colors.white70, fontSize: 18)),
                                const SizedBox(height: Kx.s8),
                                Container(
                                  height: math.max(32, (box.maxHeight - 110) * h),
                                  alignment: Alignment.topCenter,
                                  padding: const EdgeInsets.only(top: Kx.s12),
                                  decoration: BoxDecoration(
                                    color: switch (s.rank) { 1 => const Color(0xFFFFC107), 2 => const Color(0xFFB0BEC5), _ => const Color(0xFFD7885B) },
                                    borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
                                  ),
                                  child: Text('${s.rank}', style: const TextStyle(color: Color(0xFF241A4A), fontSize: 40, fontWeight: FontWeight.w900)),
                                ),
                              ],
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
        ),
        const SizedBox(height: Kx.s8),
        FilledButton(key: const Key('quiz-done'), onPressed: () => Navigator.of(context).pop(), child: Text(l.close)),
      ],
    );
  }
}

/// The countdown: a ring that empties and the seconds left.
class _Countdown extends StatelessWidget {
  const _Countdown({super.key, required this.left, required this.total});

  final int left;
  final int total;

  @override
  Widget build(BuildContext context) => SizedBox.square(
    dimension: 72,
    child: Stack(
      fit: StackFit.expand,
      children: [
        CircularProgressIndicator(value: total == 0 ? 0 : left / total, strokeWidth: 7, backgroundColor: Colors.white24, color: left <= 5 ? const Color(0xFFFF5252) : Colors.white),
        Center(child: Text('$left', style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w800))),
      ],
    ),
  );
}
