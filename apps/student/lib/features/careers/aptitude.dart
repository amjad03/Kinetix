import 'dart:async';

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/pathways.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import '../../widgets/load_view.dart';

String testCategoryLabel(AppLocalizations l, String c) => switch (c) {
  'quant' => l.testCat_quant,
  'logical' => l.testCat_logical,
  'verbal' => l.testCat_verbal,
  'technical' => l.testCat_technical,
  _ => l.testCat_mixed,
};

/// Aptitude tests the placement cell published, with my attempts; tap one to take it.
class AptitudeTestsScreen extends StatefulWidget {
  const AptitudeTestsScreen({super.key, required this.api});

  final StudentApi api;

  @override
  State<AptitudeTestsScreen> createState() => _AptitudeTestsScreenState();
}

class _AptitudeTestsScreenState extends State<AptitudeTestsScreen> {
  final _body = GlobalKey<LoadBodyState<List<AptitudeTest>>>();

  Future<void> _take(AptitudeTest t) async {
    final l = context.l10n;
    final go = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(t.title),
        content: Text(l.testIntro(t.questionCount, t.durationMin, t.passPercent)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(l.cancel)),
          FilledButton(key: const Key('startTest'), onPressed: () => Navigator.pop(ctx, true), child: Text(l.testStart)),
        ],
      ),
    );
    if (go != true || !mounted) return;
    AptitudeAttempt? attemptStarted;
    final ok = await attempt(context, () async => attemptStarted = await widget.api.startAptitudeTest(t.id));
    if (!ok || !mounted) return;
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => AptitudeTakeScreen(api: widget.api, test: t, attempt: attemptStarted!)));
    await _body.currentState?.reload();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l.prepTests)),
      body: LoadBody<List<AptitudeTest>>(
        key: _body,
        load: widget.api.aptitudeTests,
        builder: (context, tests, reload) => [
          if (tests.isEmpty) EmptyNote(l.testsNone),
          for (final t in tests)
            KxCard(
              key: Key('test-${t.id}'),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(child: Text(t.title, style: context.text.titleSmall)),
                      if (t.passed) Pill(l.testPassed, icon: Icons.check_circle_outline, background: kxTone(context, KxTone.success).bg, foreground: kxTone(context, KxTone.success).fg),
                    ],
                  ),
                  Text('${testCategoryLabel(l, t.category)} · ${l.testQuestions(t.questionCount)} · ${l.testMinutes(t.durationMin)}', style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant)),
                  Text(t.attempts == 0 ? l.testNoAttempts : l.testAttempts(t.attempts, t.best.round())),
                  if (!t.passed) Align(alignment: Alignment.centerRight, child: FilledButton.tonal(key: Key('take-${t.id}'), onPressed: () => _take(t), child: Text(t.attempts == 0 ? l.testTake : l.testRetake))),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// Taking a test: the questions with a countdown from the time the server started the attempt;
/// when it runs out the answers so far are sent. Then the result, with the score per topic.
class AptitudeTakeScreen extends StatefulWidget {
  const AptitudeTakeScreen({super.key, required this.api, required this.test, required this.attempt});

  final StudentApi api;
  final AptitudeTest test;
  final AptitudeAttempt attempt;

  @override
  State<AptitudeTakeScreen> createState() => _AptitudeTakeScreenState();
}

class _AptitudeTakeScreenState extends State<AptitudeTakeScreen> {
  late final List<int?> _answers = List.filled(widget.attempt.questions.length, null);
  late Duration _left = _remaining();
  Timer? _timer;
  bool _sending = false;
  AptitudeResult? _result;

  Duration _remaining() {
    final d = widget.attempt.endsAt.difference(DateTime.now());
    return d.isNegative ? Duration.zero : d;
  }

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted || _result != null) return;
      setState(() => _left = _remaining());
      if (_left == Duration.zero) _submit();
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_sending || _result != null) return;
    setState(() => _sending = true);
    AptitudeResult? r;
    final ok = await attempt(context, () async => r = await widget.api.submitAptitudeAttempt(widget.attempt.attemptId, _answers));
    if (!mounted) return;
    setState(() {
      _sending = false;
      if (ok) {
        _result = r;
        _timer?.cancel();
      }
    });
  }

  String _clock(Duration d) => '${d.inMinutes.toString().padLeft(2, '0')}:${(d.inSeconds % 60).toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final result = _result;
    if (result != null) return _ResultView(test: widget.test, result: result);
    final qs = widget.attempt.questions;
    final answered = _answers.where((a) => a != null).length;
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        final leave = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            content: Text(l.testLeave),
            actions: [TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(l.testStay)), FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(l.testLeaveAnyway))],
          ),
        );
        if (leave == true && context.mounted) Navigator.pop(context);
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text(widget.test.title),
          actions: [Center(child: Padding(padding: const EdgeInsets.only(right: Kx.s16), child: Text(_clock(_left), key: const Key('testClock'), style: context.text.titleMedium)))],
        ),
        body: ListView(
          padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s32),
          children: [
            LinearProgressIndicator(value: widget.attempt.durationMin == 0 ? 0 : (_left.inSeconds / (widget.attempt.durationMin * 60)).clamp(0, 1)),
            const SizedBox(height: Kx.s8),
            Text(l.testAnswered(answered, qs.length)),
            for (var i = 0; i < qs.length; i++)
              KxCard(
                key: Key('question-$i'),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${i + 1}. ${qs[i].prompt}', style: context.text.titleSmall),
                    RadioGroup<int>(
                      groupValue: _answers[i],
                      onChanged: (v) => setState(() => _answers[i] = v),
                      child: Column(children: [for (var o = 0; o < qs[i].options.length; o++) RadioListTile<int>(key: Key('option-$i-$o'), contentPadding: EdgeInsets.zero, dense: true, value: o, title: Text(qs[i].options[o]))]),
                    ),
                  ],
                ),
              ),
            const SizedBox(height: Kx.s8),
            FilledButton(key: const Key('submitTest'), onPressed: _sending ? null : _submit, child: Text(l.testSubmit)),
          ],
        ),
      ),
    );
  }
}

class _ResultView extends StatelessWidget {
  const _ResultView({required this.test, required this.result});

  final AptitudeTest test;
  final AptitudeResult result;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final tone = kxTone(context, result.passed ? KxTone.success : KxTone.warning);
    return Scaffold(
      appBar: AppBar(title: Text(test.title)),
      body: ListView(
        padding: const EdgeInsets.all(Kx.s16),
        children: [
          Text(l.testScore(result.score, result.total), key: const Key('testScore'), style: context.text.headlineMedium),
          Text('${result.percent.round()}%', style: context.text.titleLarge),
          const SizedBox(height: Kx.s8),
          Pill(result.passed ? l.testPassed : l.testNotPassed(result.passPercent), key: const Key('testVerdict'), background: tone.bg, foreground: tone.fg),
          Heading(l.testByTopic),
          for (final t in result.topics)
            ListTile(
              key: Key('topic-${t.topic}'),
              contentPadding: EdgeInsets.zero,
              title: Text(t.topic),
              subtitle: LinearProgressIndicator(value: t.total == 0 ? 0 : t.right / t.total),
              trailing: Text('${t.right}/${t.total}'),
            ),
          const SizedBox(height: Kx.s16),
          OutlinedButton(key: const Key('backToTests'), onPressed: () => Navigator.pop(context), child: Text(l.testBack)),
        ],
      ),
    );
  }
}
