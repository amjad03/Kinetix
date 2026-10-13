import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/live_quiz.dart';
import '../../l10n/l10n.dart';
import 'live_quiz_controller.dart';

/// The answers' colours and shapes, as on the board: the question stays on the board and the
/// phone only shows "the red triangle". True / False use the first two.
const quizOptionColors = [Color(0xFFE21B3C), Color(0xFF1368CE), Color(0xFFC88A00), Color(0xFF26890C)];
const quizOptionIcons = [Icons.change_history, Icons.diamond_outlined, Icons.circle_outlined, Icons.crop_square];
const _letters = ['A', 'B', 'C', 'D'];
const _bg = Color(0xFF241A4A);
const _card = Color(0xFF34296B);
const _right = Color(0xFF26890C);
const _wrong = Color(0xFFE21B3C);

/// "Live Quiz" on Today while a game runs in the class: tapping it opens [LiveQuizScreen]
/// (students who said "Not now" or came in late join here).
class LiveQuizBanner extends StatelessWidget {
  const LiveQuizBanner({super.key, required this.quiz, required this.onOpen});

  final LiveQuizController quiz;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final q = quiz.question;
    return Card(
      key: const Key('liveQuizBanner'),
      color: _card,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onOpen,
        child: Padding(
          padding: const EdgeInsets.all(Kx.s16),
          child: Row(
            children: [
              const CircleAvatar(radius: 24, backgroundColor: Color(0xFF7C4DFF), child: Icon(Icons.sports_esports_outlined, color: Colors.white)),
              const SizedBox(width: Kx.s16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(quiz.title.isEmpty ? l.liveQuiz : '${l.liveQuiz} · ${quiz.title}', style: context.text.titleMedium?.copyWith(color: Colors.white)),
                    Text(
                      q == null ? l.liveQuizTapToJoin : '${l.liveQuizQuestionOf(q.index + 1, q.count)} · ${l.liveQuizScore(quiz.score)}',
                      style: context.text.bodyMedium?.copyWith(color: Colors.white70),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: Colors.white70),
            ],
          ),
        ),
      ),
    );
  }
}

/// Asks once per game whether to join it; true when the student said Join.
Future<bool> askToJoinLiveQuiz(BuildContext context, LiveQuizController quiz) async {
  final l = context.l10n;
  final join = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      key: const Key('liveQuizPrompt'),
      icon: const Icon(Icons.sports_esports_outlined),
      title: Text(quiz.title.isEmpty ? l.liveQuiz : quiz.title),
      content: Text(l.liveQuizPromptBody),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: Text(l.liveQuizNotNow)),
        FilledButton(key: const Key('liveQuizJoin'), onPressed: () => Navigator.pop(context, true), child: Text(l.liveQuizJoin)),
      ],
    ),
  );
  return join == true;
}

/// The game on the phone: big coloured tiles to answer, then right or wrong with the points and
/// the student's place, and the final rank when the game ends.
class LiveQuizScreen extends StatefulWidget {
  const LiveQuizScreen({super.key, required this.quiz});

  final LiveQuizController quiz;

  static Future<void> open(BuildContext context, LiveQuizController quiz) =>
      Navigator.of(context).push(MaterialPageRoute<void>(fullscreenDialog: true, builder: (_) => LiveQuizScreen(quiz: quiz)));

  @override
  State<LiveQuizScreen> createState() => _LiveQuizScreenState();
}

class _LiveQuizScreenState extends State<LiveQuizScreen> {
  Timer? _tick;
  int _shownSeconds = -1;

  LiveQuizController get quiz => widget.quiz;

  @override
  void initState() {
    super.initState();
    // Redraws the countdown only when the second shown changes.
    _tick = Timer.periodic(const Duration(milliseconds: 250), (_) {
      if (!mounted || quiz.phase != QuizPhase.question) return;
      final s = _seconds;
      if (s != _shownSeconds) setState(() => _shownSeconds = s);
    });
  }

  int get _seconds => (quiz.remaining.inMilliseconds / 1000).ceil();

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  void _answer(int i) {
    unawaited(HapticFeedback.lightImpact());
    unawaited(quiz.answer(i));
  }

  void _close() {
    quiz.dismiss();
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Theme(
      data: ThemeData(brightness: Brightness.dark, colorSchemeSeed: const Color(0xFF7C4DFF), useMaterial3: true),
      child: ListenableBuilder(
        listenable: quiz,
        builder: (context, _) {
          final q = quiz.question;
          _shownSeconds = _seconds;
          return Scaffold(
            backgroundColor: _bg,
            appBar: AppBar(
              backgroundColor: _bg,
              foregroundColor: Colors.white,
              leading: IconButton(key: const Key('liveQuizClose'), tooltip: MaterialLocalizations.of(context).closeButtonTooltip, icon: const Icon(Icons.close), onPressed: _close),
              title: Text(quiz.title.isEmpty ? l.liveQuiz : quiz.title, maxLines: 1, overflow: TextOverflow.ellipsis),
              actions: [
                if (q != null && quiz.phase != QuizPhase.ended)
                  Padding(
                    padding: const EdgeInsets.only(right: Kx.s16),
                    child: Center(child: Text(l.liveQuizQuestionOf(q.index + 1, q.count), style: const TextStyle(color: Colors.white70))),
                  ),
              ],
            ),
            body: SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(Kx.s16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Expanded(child: _body(context)),
                    if (quiz.phase != QuizPhase.ended && quiz.phase != QuizPhase.none) ...[
                      const SizedBox(height: Kx.s12),
                      Text(
                        [l.liveQuizScore(quiz.score), if (quiz.rank case final r?) l.liveQuizRank(r)].join(' · '),
                        key: const Key('liveQuizScore'),
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Colors.white70, fontSize: 16, fontWeight: FontWeight.w600),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _body(BuildContext context) {
    final l = context.l10n;
    final q = quiz.question;
    switch (quiz.phase) {
      case QuizPhase.none || QuizPhase.lobby:
        return _message(const CircularProgressIndicator(color: Colors.white), l.liveQuizWaitingStart, key: const Key('liveQuizLobby'));
      case QuizPhase.question when q != null && quiz.myChoice == null:
        final timeUp = quiz.timeUp;
        return Column(
          key: const Key('liveQuizQuestion'),
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(timeUp ? l.liveQuizTimeUp : l.liveQuizReadBoard, style: const TextStyle(color: Colors.white, fontSize: 16)),
                ),
                const SizedBox(width: Kx.s12),
                CircleAvatar(
                  key: const Key('liveQuizCountdown'),
                  radius: 24,
                  backgroundColor: timeUp ? _wrong : _card,
                  child: Text('$_shownSeconds', style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w700)),
                ),
              ],
            ),
            const SizedBox(height: Kx.s16),
            Expanded(child: _tiles(q, enabled: quiz.canAnswer)),
            if (quiz.error != null) ...[
              const SizedBox(height: Kx.s12),
              Text(
                quiz.error!.status == 400 ? l.liveQuizTimeUp : l.liveQuizNotSent,
                key: const Key('liveQuizError'),
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white, fontSize: 16),
              ),
            ],
          ],
        );
      case QuizPhase.question when q != null:
        final choice = quiz.myChoice!;
        return Column(
          key: const Key('liveQuizSent'),
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            SizedBox.square(dimension: 160, child: _tile(q, choice, enabled: false)),
            const SizedBox(height: Kx.s24),
            Text(l.liveQuizAnswerSent, style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w700)),
            const SizedBox(height: Kx.s8),
            Text(l.liveQuizWaitReveal, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white70, fontSize: 16)),
          ],
        );
      case QuizPhase.revealed when quiz.reveal != null:
        return _revealed(context, quiz.reveal!);
      case QuizPhase.ended:
        return _ended(context, quiz.end);
      default:
        return _message(const Icon(Icons.hourglass_top, color: Colors.white, size: 48), l.liveQuizWaitNext, key: const Key('liveQuizWaitNext'));
    }
  }

  Widget _message(Widget top, String text, {Key? key}) => Center(
    key: key,
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        top,
        const SizedBox(height: Kx.s24),
        Text(text, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w600)),
      ],
    ),
  );

  /// Two tiles side by side for True / False, a 2 × 2 grid for A–D.
  Widget _tiles(QuizQuestion q, {required bool enabled}) {
    final n = q.options.length.clamp(0, 4);
    Widget cell(int i) => Expanded(
      child: Padding(padding: const EdgeInsets.all(Kx.s4), child: i < n ? _tile(q, i, enabled: enabled) : const SizedBox()),
    );
    if (n <= 2) return Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [cell(0), cell(1)]);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Expanded(child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [cell(0), cell(1)])),
        Expanded(child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [cell(2), cell(3)])),
      ],
    );
  }

  Widget _tile(QuizQuestion q, int i, {required bool enabled}) {
    final l = context.l10n;
    final option = i < q.options.length ? q.options[i] : '';
    return Semantics(
      button: enabled,
      label: l.liveQuizOption(_letters[i], option),
      excludeSemantics: true,
      child: Material(
        key: Key('quizTile-$i'),
        color: enabled || quiz.phase != QuizPhase.question || quiz.myChoice == i ? quizOptionColors[i] : quizOptionColors[i].withValues(alpha: 0.35),
        borderRadius: BorderRadius.circular(16),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: enabled ? () => _answer(i) : null,
          child: Padding(
            padding: const EdgeInsets.all(Kx.s12),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Flexible(child: FittedBox(child: Icon(quizOptionIcons[i], color: Colors.white, size: 72))),
                const SizedBox(height: Kx.s8),
                Text(option, maxLines: 2, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600)),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _revealed(BuildContext context, QuizReveal r) {
    final l = context.l10n;
    final me = r.me;
    final q = quiz.question;
    final right = me?.correct == true;
    final answered = me?.answered ?? quiz.myChoice != null;
    return SingleChildScrollView(
      key: const Key('liveQuizReveal'),
      child: Column(
        children: [
          const SizedBox(height: Kx.s16),
          CircleAvatar(radius: 48, backgroundColor: right ? _right : _wrong, child: Icon(right ? Icons.check : Icons.close, color: Colors.white, size: 56)),
          const SizedBox(height: Kx.s16),
          Text(
            right ? l.liveQuizCorrect : (answered ? l.liveQuizWrong : l.liveQuizNoAnswer),
            style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w800),
          ),
          if (me != null) ...[
            const SizedBox(height: Kx.s8),
            Text(l.liveQuizPoints(me.points), key: const Key('liveQuizPoints'), style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w600)),
            if (me.streak >= 2) Text(l.liveQuizStreak(me.streak), style: const TextStyle(color: Color(0xFFFFC107), fontSize: 16)),
          ],
          if (q != null && r.correct < q.options.length) ...[
            const SizedBox(height: Kx.s24),
            SizedBox(height: 96, width: 140, child: _tile(q, r.correct, enabled: false)),
          ],
          if (r.leaderboard.isNotEmpty) ...[const SizedBox(height: Kx.s24), _standings(context, r.leaderboard)],
        ],
      ),
    );
  }

  Widget _ended(BuildContext context, QuizEnd? e) {
    final l = context.l10n;
    final rank = e?.rank ?? quiz.rank;
    return SingleChildScrollView(
      key: const Key('liveQuizEnded'),
      child: Column(
        children: [
          const SizedBox(height: Kx.s16),
          const Icon(Icons.emoji_events, color: Color(0xFFFFC107), size: 80),
          const SizedBox(height: Kx.s12),
          Text(l.liveQuizOver, style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w800)),
          if (e?.cancelled == true) Text(l.liveQuizCancelled, style: const TextStyle(color: Colors.white70, fontSize: 16)),
          if (rank != null) ...[
            const SizedBox(height: Kx.s16),
            Text(l.liveQuizFinalRank(rank), key: const Key('liveQuizFinalRank'), style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w700)),
          ],
          const SizedBox(height: Kx.s8),
          Text(l.liveQuizScore(quiz.score), style: const TextStyle(color: Colors.white, fontSize: 18)),
          if (e?.correct case final c? when e?.count != null) Text(l.liveQuizFinalCorrect(c, e!.count!), style: const TextStyle(color: Colors.white70, fontSize: 16)),
          if (e != null && e.podium.isNotEmpty) ...[const SizedBox(height: Kx.s24), _standings(context, e.podium)],
          const SizedBox(height: Kx.s24),
          FilledButton(key: const Key('liveQuizDone'), onPressed: _close, child: Text(l.liveQuizDone)),
        ],
      ),
    );
  }

  Widget _standings(BuildContext context, List<QuizStanding> rows) => Card(
    color: _card,
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: Kx.s8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: Kx.s16, vertical: Kx.s4),
            child: Text(context.l10n.liveQuizTopPlayers, style: const TextStyle(color: Colors.white70, fontWeight: FontWeight.w600)),
          ),
          for (final s in rows)
            ListTile(
              dense: true,
              leading: CircleAvatar(radius: 14, backgroundColor: Colors.white24, child: Text('${s.rank}', style: const TextStyle(color: Colors.white, fontSize: 13))),
              title: Text(s.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white)),
              trailing: Text('${s.score}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
            ),
        ],
      ),
    ),
  );
}
