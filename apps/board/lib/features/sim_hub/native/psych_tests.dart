import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

/// The Stroop test's colours: the word names one colour and is inked in another.
const stroopColors = <String, Color>{'RED': Color(0xFFD32F2F), 'GREEN': Color(0xFF388E3C), 'BLUE': Color(0xFF1976D2), 'YELLOW': Color(0xFFF9A825)};

/// One Stroop trial: [word] shown in the ink [ink]; [congruent] when they match.
class StroopTrial {
  const StroopTrial(this.word, this.ink);
  final String word, ink;
  bool get congruent => word == ink;
}

/// Makes [n] trials, about half of them incongruent (the word and the ink differ).
List<StroopTrial> stroopTrials(int n, [math.Random? rnd]) {
  final r = rnd ?? math.Random();
  final names = stroopColors.keys.toList();
  return [
    for (var i = 0; i < n; i++)
      () {
        final w = names[r.nextInt(names.length)];
        final ink = i.isEven ? w : names.where((c) => c != w).toList()[r.nextInt(names.length - 1)];
        return StroopTrial(w, ink);
      }(),
  ]..shuffle(r);
}

/// Mean of [ms] (0 when empty).
double meanMs(List<int> ms) => ms.isEmpty ? 0 : ms.reduce((a, b) => a + b) / ms.length;

/// The Stroop test (as in PEBL): name the ink colour, not the word. Shows accuracy and the mean
/// time for congruent and incongruent trials.
class StroopTest extends StatefulWidget {
  const StroopTest({super.key, this.trials = 20});
  final int trials;
  @override
  State<StroopTest> createState() => _StroopState();
}

class _StroopState extends State<StroopTest> {
  late List<StroopTrial> _trials = stroopTrials(widget.trials);
  int _i = 0, _correct = 0;
  final _congruent = <int>[], _incongruent = <int>[];
  final _watch = Stopwatch();

  @override
  void initState() {
    super.initState();
    _watch.start();
  }

  void _answer(String ink) {
    final t = _trials[_i];
    final ms = _watch.elapsedMilliseconds;
    if (ink == t.ink) {
      _correct++;
      (t.congruent ? _congruent : _incongruent).add(ms);
    }
    setState(() => _i++);
    _watch
      ..reset()
      ..start();
  }

  void _again() => setState(() {
    _trials = stroopTrials(widget.trials);
    _i = 0;
    _correct = 0;
    _congruent.clear();
    _incongruent.clear();
    _watch
      ..reset()
      ..start();
  });

  @override
  Widget build(BuildContext context) {
    if (_i >= _trials.length) {
      return _Result(
        lines: ['Correct: $_correct of ${_trials.length}', 'Same word and ink: ${meanMs(_congruent).round()} ms', 'Different word and ink: ${meanMs(_incongruent).round()} ms', 'The slower different-ink time is the Stroop effect.'],
        onAgain: _again,
      );
    }
    final t = _trials[_i];
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Text('Tap the colour of the ink, not the word  (${_i + 1}/${_trials.length})'),
        const SizedBox(height: 24),
        Text(t.word, key: const Key('stroop-word'), style: TextStyle(fontSize: 72, fontWeight: FontWeight.bold, color: stroopColors[t.ink])),
        const SizedBox(height: 24),
        Wrap(spacing: 12, children: [
          for (final e in stroopColors.entries) FilledButton(key: Key('stroop-${e.key}'), style: FilledButton.styleFrom(backgroundColor: e.value), onPressed: () => _answer(e.key), child: Text(e.key)),
        ]),
      ],
    );
  }
}

/// Reaction time: wait for the panel to turn green, then tap. Five rounds, mean shown.
class ReactionTest extends StatefulWidget {
  const ReactionTest({super.key, this.rounds = 5, this.minWait = const Duration(seconds: 1), this.maxWait = const Duration(seconds: 4)});
  final int rounds;
  final Duration minWait, maxWait;
  @override
  State<ReactionTest> createState() => _ReactionState();
}

enum _Phase { idle, waiting, go, early }

class _ReactionState extends State<ReactionTest> {
  _Phase _phase = _Phase.idle;
  final _times = <int>[];
  final _watch = Stopwatch();
  Timer? _timer;

  void _start() {
    final span = widget.maxWait.inMilliseconds - widget.minWait.inMilliseconds;
    final wait = widget.minWait.inMilliseconds + (span <= 0 ? 0 : math.Random().nextInt(span));
    setState(() => _phase = _Phase.waiting);
    _timer = Timer(Duration(milliseconds: wait), () {
      if (!mounted) return;
      _watch
        ..reset()
        ..start();
      setState(() => _phase = _Phase.go);
    });
  }

  void _tap() {
    switch (_phase) {
      case _Phase.idle:
      case _Phase.early:
        _start();
      case _Phase.waiting:
        _timer?.cancel();
        setState(() => _phase = _Phase.early);
      case _Phase.go:
        _times.add(_watch.elapsedMilliseconds);
        if (_times.length >= widget.rounds) {
          setState(() => _phase = _Phase.idle);
        } else {
          _start();
        }
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_times.length >= widget.rounds) {
      return _Result(lines: ['Mean reaction time: ${meanMs(_times).round()} ms', 'Rounds: ${_times.join(', ')} ms'], onAgain: () => setState(_times.clear));
    }
    final (color, text) = switch (_phase) {
      _Phase.idle => (Colors.blueGrey, 'Tap to start. Round ${_times.length + 1} of ${widget.rounds}'),
      _Phase.waiting => (Colors.red, 'Wait for green...'),
      _Phase.go => (Colors.green, 'TAP NOW'),
      _Phase.early => (Colors.orange, 'Too early. Tap to try again'),
    };
    return GestureDetector(
      key: const Key('reaction-area'),
      onTap: _tap,
      child: Container(color: color, alignment: Alignment.center, child: Text(text, style: const TextStyle(color: Colors.white, fontSize: 32))),
    );
  }
}

/// A digit sequence of [n] digits.
List<int> spanSequence(int n, [math.Random? rnd]) {
  final r = rnd ?? math.Random();
  return [for (var i = 0; i < n; i++) r.nextInt(10)];
}

/// Memory span: digits flash one by one; type them back. The span grows after each success and
/// the test ends at the first miss.
class MemorySpanTest extends StatefulWidget {
  const MemorySpanTest({super.key, this.flash = const Duration(milliseconds: 800), this.start = 3});
  final Duration flash;
  final int start;
  @override
  State<MemorySpanTest> createState() => _SpanState();
}

class _SpanState extends State<MemorySpanTest> {
  late int _n = widget.start;
  late List<int> _seq;
  int _shown = -1;
  bool _asking = false, _over = false;
  int _best = 0;
  Timer? _timer;
  final _field = TextEditingController();

  @override
  void initState() {
    super.initState();
    _begin();
  }

  void _begin() {
    _seq = spanSequence(_n);
    _asking = false;
    _shown = -1;
    _field.clear();
    _timer?.cancel();
    _timer = Timer.periodic(widget.flash, (t) {
      if (!mounted) return t.cancel();
      setState(() {
        _shown++;
        if (_shown >= _seq.length) {
          _asking = true;
          t.cancel();
        }
      });
    });
  }

  void _submit() {
    final ok = _field.text.trim() == _seq.join();
    setState(() {
      if (ok) {
        _best = _n;
        _n++;
        _begin();
      } else {
        _over = true;
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _field.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_over) {
      return _Result(
        lines: ['Your memory span is $_best digits', 'The sequence was ${_seq.join(' ')}'],
        onAgain: () => setState(() {
          _over = false;
          _n = widget.start;
          _best = 0;
          _begin();
        }),
      );
    }
    return Column(mainAxisAlignment: MainAxisAlignment.center, children: [
      Text('Remember the digits ($_n)'),
      const SizedBox(height: 16),
      SizedBox(height: 90, child: Center(child: Text(!_asking && _shown >= 0 && _shown < _seq.length ? '${_seq[_shown]}' : (_asking ? '?' : ''), key: const Key('span-digit'), style: const TextStyle(fontSize: 72, fontWeight: FontWeight.bold)))),
      if (_asking) ...[
        SizedBox(width: 240, child: TextField(key: const Key('span-input'), controller: _field, keyboardType: TextInputType.number, autofocus: true, textAlign: TextAlign.center, onSubmitted: (_) => _submit())),
        const SizedBox(height: 8),
        FilledButton(key: const Key('span-submit'), onPressed: _submit, child: const Text('Check')),
      ],
    ]);
  }
}

class _Result extends StatelessWidget {
  const _Result({required this.lines, required this.onAgain});
  final List<String> lines;
  final VoidCallback onAgain;
  @override
  Widget build(BuildContext context) => Center(
    child: Column(mainAxisSize: MainAxisSize.min, children: [
      for (final l in lines) Padding(padding: const EdgeInsets.symmetric(vertical: 4), child: Text(l, style: const TextStyle(fontSize: 20))),
      const SizedBox(height: 12),
      FilledButton(key: const Key('psych-again'), onPressed: onAgain, child: const Text('Try again')),
    ]),
  );
}
