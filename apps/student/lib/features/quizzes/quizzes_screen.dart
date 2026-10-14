import 'dart:async';

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/self_service.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import '../../widgets/load_view.dart';

/// "8" for 8.0, "7.5" for 7.5.
String _num(double v) => Fmt.marks(v);

/// The class's online quizzes: open now (start or resume), coming up, and done with the scores.
class QuizzesScreen extends StatefulWidget {
  const QuizzesScreen({super.key, required this.api, this.now});

  final StudentApi api;

  /// For tests; defaults to the device clock.
  final DateTime Function()? now;

  static Future<void> open(BuildContext context, StudentApi api) => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => QuizzesScreen(api: api)));

  @override
  State<QuizzesScreen> createState() => _QuizzesScreenState();
}

class _QuizzesScreenState extends State<QuizzesScreen> {
  List<QuizSummary>? _quizzes;
  ApiException? _error;
  String? _starting;

  DateTime get _now => (widget.now ?? DateTime.now)();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final q = await widget.api.myQuizzes();
      if (mounted) setState(() => _quizzes = q);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _start(QuizSummary q) async {
    final l = context.l10n;
    if (q.openAttemptId == null) {
      final go = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(q.title),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (q.instructions.isNotEmpty) ...[Text(q.instructions), const SizedBox(height: Kx.s12)],
              Text(l.qzStartRules(q.durationMin, q.attemptsLeft)),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: Text(l.cancel)),
            FilledButton(key: const Key('qzConfirmStart'), onPressed: () => Navigator.pop(context, true), child: Text(l.qzStart)),
          ],
        ),
      );
      if (go != true || !mounted) return;
    }
    setState(() => _starting = q.id);
    try {
      final attempt = await widget.api.startQuiz(q.id);
      if (!mounted) return;
      final outcome = await Navigator.of(context).push<QuizOutcome>(MaterialPageRoute(builder: (_) => QuizAttemptScreen(api: widget.api, attempt: attempt, now: widget.now)));
      if (outcome != null && mounted) {
        await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => QuizResultScreen(attempt: attempt, outcome: outcome)));
      }
    } on ApiException catch (e) {
      if (mounted) say(context, context.errorText(e));
    } finally {
      if (mounted) setState(() => _starting = null);
    }
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final qs = _quizzes;
    final now = _now;
    final open = qs?.where((q) => !q.closed(now) && !q.upcoming(now)).toList() ?? const [];
    final soon = qs?.where((q) => q.upcoming(now)).toList() ?? const [];
    final done = qs?.where((q) => q.closed(now)).toList() ?? const [];
    return Scaffold(
      appBar: AppBar(title: Text(l.qzTitle)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s32),
          children: [
            if (_error != null) ErrorBanner(_error!, onRetry: _load),
            if (qs == null && _error == null) const KxLoading(),
            if (qs != null && qs.isEmpty) KxEmptyState(key: const Key('qzEmpty'), icon: Icons.quiz_outlined, message: l.qzEmpty),
            if (open.isNotEmpty) ...[
              SectionTitle(l.qzOpenNow),
              for (final q in open) _QuizCard(quiz: q, now: now, busy: _starting == q.id, onStart: _starting == null ? () => _start(q) : null),
            ],
            if (soon.isNotEmpty) ...[
              SectionTitle(l.qzComingUp),
              for (final q in soon) _QuizCard(quiz: q, now: now),
            ],
            if (done.isNotEmpty) ...[
              SectionTitle(l.qzDone),
              for (final q in done) _QuizCard(quiz: q, now: now),
            ],
          ],
        ),
      ),
    );
  }
}

class _QuizCard extends StatelessWidget {
  const _QuizCard({required this.quiz, required this.now, this.onStart, this.busy = false});

  final QuizSummary quiz;
  final DateTime now;
  final VoidCallback? onStart;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final q = quiz;
    final best = q.bestFraction;
    final pending = q.attempts.any((a) => a.needsMarking);
    return Padding(
      padding: const EdgeInsets.only(bottom: Kx.s12),
      child: KxCard(
        key: Key('quiz-${q.id}'),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const KxIconBox(Icons.quiz_outlined),
                const SizedBox(width: Kx.s12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(q.title, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
                      Text(q.subject, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: Kx.s8),
            Wrap(
              spacing: Kx.s8,
              runSpacing: Kx.s4,
              children: [
                Pill(l.qzMinutes(q.durationMin), icon: Icons.timer_outlined, background: c.surfaceContainerHighest, foreground: c.onSurfaceVariant),
                if (q.maxAttempts > 1) Pill(l.qzAttemptsLeft(q.attemptsLeft), icon: Icons.repeat, background: c.surfaceContainerHighest, foreground: c.onSurfaceVariant),
                if (best != null) Pill(l.qzBest('${(best * 100).round()}%'), icon: Icons.emoji_events_outlined, background: Tone.goodContainer(context), foreground: Tone.good(context)),
                if (pending) Pill(l.qzBeingMarked, background: Tone.warnContainer(context), foreground: Tone.warn(context)),
              ],
            ),
            const SizedBox(height: Kx.s8),
            Text(
              q.upcoming(now) ? l.qzOpensAt(context.fmt.dateTime(q.opensAt)) : (q.closed(now) ? l.qzClosedAt(context.fmt.dateTime(q.closesAt)) : l.qzClosesAt(context.fmt.dateTime(q.closesAt))),
              style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant),
            ),
            for (final a in q.attempts)
              Padding(
                padding: const EdgeInsets.only(top: Kx.s4),
                child: Text(
                  a.score == null || a.maxScore == null ? l.qzAttemptMarking(a.attemptNo) : l.qzAttemptScore(a.attemptNo, _num(a.score!), _num(a.maxScore!)),
                  key: Key('attempt-${a.id}'),
                  style: context.text.bodyMedium,
                ),
              ),
            if (onStart != null || busy) ...[
              const SizedBox(height: Kx.s12),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  key: Key('startQuiz-${q.id}'),
                  onPressed: busy || !q.canStart ? null : onStart,
                  icon: busy ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)) : Icon(q.openAttemptId != null ? Icons.play_arrow_rounded : Icons.edit_note),
                  label: Text(q.openAttemptId != null ? l.qzResume : (q.canStart ? l.qzStart : l.qzNoAttemptsLeft)),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Saving state of the answers, shown under the timer.
enum _Save { saved, saving, failed }

/// Taking a quiz: one question at a time with a countdown. Answers are saved to the server every
/// few seconds and when the student moves on, and the attempt is submitted when time runs out.
class QuizAttemptScreen extends StatefulWidget {
  const QuizAttemptScreen({super.key, required this.api, required this.attempt, this.now, this.saveEvery = const Duration(seconds: 8)});

  final StudentApi api;
  final QuizAttempt attempt;
  final DateTime Function()? now;

  /// How often changed answers are saved.
  final Duration saveEvery;

  @override
  State<QuizAttemptScreen> createState() => _QuizAttemptScreenState();
}

class _QuizAttemptScreenState extends State<QuizAttemptScreen> with WidgetsBindingObserver {
  late final Map<String, Object> _answers = {
    for (final e in widget.attempt.answers.entries)
      e.key: _fromServer(widget.attempt.questions.where((q) => q.id == e.key).firstOrNull, e.value),
  };
  final _dirty = <String>{};
  final _text = <String, TextEditingController>{};
  int _index = 0;
  _Save _save = _Save.saved;
  bool _submitting = false;
  Timer? _tick;
  Timer? _autosave;

  DateTime get _now => (widget.now ?? DateTime.now)();
  Duration get _left {
    final d = widget.attempt.dueAt.difference(_now);
    return d.isNegative ? Duration.zero : d;
  }

  /// A single choice may come back from the server as "1" or [1].
  static Object _fromServer(QuizQuestion? q, Object v) {
    if (q != null && (q.kind == 'mcq' || q.kind == 'multi')) {
      if (v is List) return [for (final x in v) (x as num).toInt()];
      final i = int.tryParse('$v');
      return i == null ? <int>[] : [i];
    }
    return '$v';
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() {});
      if (_left == Duration.zero && !_submitting) _submit(timeUp: true);
    });
    _autosave = Timer.periodic(widget.saveEvery, (_) => _flush());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _tick?.cancel();
    _autosave?.cancel();
    for (final c in _text.values) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Leaving the app saves at once: the time keeps running on the server.
    if (state == AppLifecycleState.paused || state == AppLifecycleState.inactive) _flush();
  }

  void _set(String id, Object value) {
    setState(() {
      _answers[id] = value;
      _dirty.add(id);
    });
  }

  /// Saves the answers changed since the last save.
  Future<void> _flush() async {
    if (_dirty.isEmpty || _submitting || _save == _Save.saving) return;
    final ids = {..._dirty};
    setState(() => _save = _Save.saving);
    try {
      await widget.api.saveQuizAnswers(widget.attempt.attemptId, {for (final id in ids) id: _answers[id]!});
      _dirty.removeAll(ids);
      if (mounted) setState(() => _save = _dirty.isEmpty ? _Save.saved : _Save.saving);
    } on ApiException {
      if (mounted) setState(() => _save = _Save.failed);
    }
  }

  bool _answered(QuizQuestion q) {
    final a = _answers[q.id];
    if (a == null) return false;
    if (a is List) return a.isNotEmpty;
    return '$a'.trim().isNotEmpty;
  }

  Future<void> _submit({bool timeUp = false}) async {
    final l = context.l10n;
    if (!timeUp) {
      final missing = widget.attempt.questions.where((q) => !_answered(q)).length;
      final ok = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(l.qzSubmitTitle),
          content: Text(missing == 0 ? l.qzSubmitAll : l.qzSubmitMissing(missing)),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: Text(l.qzKeepGoing)),
            FilledButton(key: const Key('qzConfirmSubmit'), onPressed: () => Navigator.pop(context, true), child: Text(l.qzSubmit)),
          ],
        ),
      );
      if (ok != true || !mounted) return;
    }
    setState(() => _submitting = true);
    _tick?.cancel();
    _autosave?.cancel();
    try {
      final outcome = await widget.api.submitQuiz(widget.attempt.attemptId, Map.of(_answers));
      if (!mounted) return;
      if (timeUp) say(context, l.qzTimeUpSubmitted);
      Navigator.of(context).pop(outcome);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _submitting = false);
      say(context, context.errorText(e));
      if (!timeUp) {
        _tick = Timer.periodic(const Duration(seconds: 1), (_) => mounted ? setState(() {}) : null);
        _autosave = Timer.periodic(widget.saveEvery, (_) => _flush());
      }
    }
  }

  Future<bool> _confirmLeave() async {
    await _flush();
    if (!mounted) return false;
    final l = context.l10n;
    final leave = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l.qzLeaveTitle),
        content: Text(l.qzLeaveBody),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(l.qzKeepGoing)),
          TextButton(key: const Key('qzLeave'), onPressed: () => Navigator.pop(context, true), child: Text(l.qzLeave)),
        ],
      ),
    );
    return leave == true;
  }

  String _clock(Duration d) {
    final m = d.inMinutes;
    final s = d.inSeconds % 60;
    return '${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final qs = widget.attempt.questions;
    final left = _left;
    final hurry = left.inSeconds <= 60;
    final q = qs.isEmpty ? null : qs[_index.clamp(0, qs.length - 1)];
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop || _submitting) return;
        final nav = Navigator.of(context);
        if (await _confirmLeave()) nav.pop();
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text(widget.attempt.title),
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(4),
            child: LinearProgressIndicator(value: qs.isEmpty ? 0 : qs.where(_answered).length / qs.length, minHeight: 4),
          ),
        ),
        body: SafeArea(
          child: Column(
            children: [
              Container(
                color: hurry ? c.errorContainer : c.surfaceContainerHigh,
                padding: const EdgeInsets.symmetric(horizontal: Kx.s16, vertical: Kx.s8),
                child: Row(
                  children: [
                    Icon(Icons.timer_outlined, color: hurry ? c.onErrorContainer : c.onSurfaceVariant),
                    const SizedBox(width: Kx.s8),
                    Text(_clock(left), key: const Key('qzTimer'), style: context.text.titleMedium?.copyWith(fontFeatures: const [FontFeature.tabularFigures()], color: hurry ? c.onErrorContainer : null, fontWeight: FontWeight.w600)),
                    const SizedBox(width: Kx.s12),
                    Expanded(
                      child: Text(
                        switch (_save) {
                          _Save.saved => l.qzSaved,
                          _Save.saving => l.qzSaving,
                          _Save.failed => l.qzSaveFailed,
                        },
                        key: const Key('qzSaveState'),
                        textAlign: TextAlign.end,
                        style: context.text.bodySmall?.copyWith(color: _save == _Save.failed ? c.error : c.onSurfaceVariant),
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: q == null
                    ? KxEmptyState(icon: Icons.quiz_outlined, message: l.qzNoQuestions)
                    : ListView(
                        padding: const EdgeInsets.all(Kx.s16),
                        children: [
                          Text(l.qzQuestionOf(_index + 1, qs.length), style: context.text.labelLarge?.copyWith(color: c.primary)),
                          const SizedBox(height: Kx.s4),
                          Text(q.text, key: Key('qText-${q.id}'), style: context.text.titleMedium),
                          const SizedBox(height: Kx.s4),
                          Text(
                            [l.qzMarks(_num(q.marks)), if (q.kind == 'multi') l.qzPickAll].join(' · '),
                            style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant),
                          ),
                          const SizedBox(height: Kx.s12),
                          ..._answerWidgets(q),
                        ],
                      ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, Kx.s12),
                child: Row(
                  children: [
                    OutlinedButton.icon(
                      key: const Key('qzPrev'),
                      onPressed: _index == 0 ? null : () => setState(() => _index--),
                      icon: const Icon(Icons.chevron_left),
                      label: Text(l.qzPrevious),
                    ),
                    const Spacer(),
                    if (_index < qs.length - 1)
                      FilledButton.tonalIcon(
                        key: const Key('qzNext'),
                        onPressed: () {
                          _flush();
                          setState(() => _index++);
                        },
                        icon: const Icon(Icons.chevron_right),
                        label: Text(l.qzNext),
                      )
                    else
                      FilledButton.icon(
                        key: const Key('qzSubmit'),
                        onPressed: _submitting ? null : _submit,
                        icon: _submitting ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.send),
                        label: Text(l.qzSubmit),
                      ),
                  ],
                ),
              ),
              if (qs.length > 1)
                SizedBox(
                  height: 48,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(horizontal: Kx.s16),
                    itemCount: qs.length,
                    separatorBuilder: (_, _) => const SizedBox(width: Kx.s8),
                    itemBuilder: (context, i) => ChoiceChip(
                      key: Key('qzJump-$i'),
                      label: Text('${i + 1}'),
                      selected: i == _index,
                      avatar: _answered(qs[i]) ? const Icon(Icons.check, size: 16) : null,
                      onSelected: (_) {
                        _flush();
                        setState(() => _index = i);
                      },
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _answerWidgets(QuizQuestion q) {
    final l = context.l10n;
    switch (q.kind) {
      case 'mcq':
        final picked = (_answers[q.id] as List?)?.cast<int>() ?? const <int>[];
        return [
          RadioGroup<int>(
            groupValue: picked.isEmpty ? null : picked.first,
            onChanged: (v) => v == null ? null : _set(q.id, [v]),
            child: Column(
              children: [
                for (final (i, o) in q.options.indexed)
                  Card(
                    margin: const EdgeInsets.only(bottom: Kx.s8),
                    child: RadioListTile<int>(key: Key('opt-${q.id}-$i'), value: i, title: Text(o)),
                  ),
              ],
            ),
          ),
        ];
      case 'multi':
        final picked = (_answers[q.id] as List?)?.cast<int>() ?? const <int>[];
        return [
          for (final (i, o) in q.options.indexed)
            Card(
              margin: const EdgeInsets.only(bottom: Kx.s8),
              child: CheckboxListTile(
                key: Key('opt-${q.id}-$i'),
                value: picked.contains(i),
                title: Text(o),
                controlAffinity: ListTileControlAffinity.leading,
                onChanged: (on) => _set(q.id, on == true ? ([...picked, i]..sort()) : [for (final x in picked) if (x != i) x]),
              ),
            ),
        ];
      default:
        final ctl = _text.putIfAbsent(q.id, () => TextEditingController(text: (_answers[q.id] as String?) ?? ''));
        final code = q.kind == 'code';
        return [
          TextField(
            key: Key('answer-${q.id}'),
            controller: ctl,
            minLines: code ? 8 : 1,
            maxLines: code ? 20 : 3,
            style: code ? const TextStyle(fontFamily: KxFonts.code) : null,
            decoration: InputDecoration(labelText: code ? l.qzYourCode(q.language ?? '') : l.qzYourAnswer, border: const OutlineInputBorder(), alignLabelWithHint: true),
            onChanged: (v) => _set(q.id, v),
          ),
          if (code) Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(l.qzCodeNote, style: context.text.bodySmall)),
        ];
    }
  }
}

/// The score of a submitted attempt and how each question went.
class QuizResultScreen extends StatelessWidget {
  const QuizResultScreen({super.key, required this.attempt, required this.outcome});

  final QuizAttempt attempt;
  final QuizOutcome outcome;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final o = outcome;
    final frac = o.maxScore == 0 ? 0.0 : o.score / o.maxScore;
    return Scaffold(
      appBar: AppBar(title: Text(l.qzResultTitle)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s32),
        children: [
          KxCard(
            color: c.primaryContainer,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(attempt.title, style: context.text.titleMedium?.copyWith(color: c.onPrimaryContainer)),
                const SizedBox(height: Kx.s8),
                Text(l.qzScoreOf(_num(o.score), _num(o.maxScore)), key: const Key('qzScore'), style: context.text.headlineMedium?.copyWith(color: c.onPrimaryContainer, fontWeight: FontWeight.w700)),
                const SizedBox(height: Kx.s8),
                KxProgressBar(value: frac),
                if (o.needsMarking) ...[const SizedBox(height: Kx.s8), Text(l.qzNeedsMarking, style: context.text.bodyMedium?.copyWith(color: c.onPrimaryContainer))],
              ],
            ),
          ),
          SectionTitle(l.qzReview),
          for (final (i, q) in attempt.questions.indexed) _ReviewRow(index: i, question: q, result: o.results[q.id]),
        ],
      ),
    );
  }
}

class _ReviewRow extends StatelessWidget {
  const _ReviewRow({required this.index, required this.question, required this.result});

  final int index;
  final QuizQuestion question;
  final QuizQuestionResult? result;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final r = result;
    final (icon, color, label) = r == null || r.correct == null
        ? (Icons.hourglass_top, Tone.warn(context), l.qzToBeMarked)
        : r.correct!
        ? (Icons.check_circle, Tone.good(context), l.qzCorrect)
        : (Icons.cancel, c.error, l.qzWrong);
    return Card(
      key: Key('review-${question.id}'),
      child: ListTile(
        leading: Icon(icon, color: color),
        title: Text('${index + 1}. ${question.text}', maxLines: 3, overflow: TextOverflow.ellipsis),
        subtitle: Text('$label · ${l.qzMarksOf(_num(r?.marks ?? 0), _num(question.marks))}'),
      ),
    );
  }
}
