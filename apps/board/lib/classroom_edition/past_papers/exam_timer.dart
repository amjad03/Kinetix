import 'dart:async';

import 'package:flutter/material.dart';

import '../class_tools/tool_ui.dart';
import '../ui/ce_style.dart';
import 'exam_rules.dart';

/// How far along an exam countdown is (the timer's colour).
enum CountdownPhase { ready, running, lastTen, lastFive, paused, timeUp }

/// An exam's countdown: started, paused, reset, with minutes added or taken away. It reads the
/// time from [now] (tests move it by hand), so a busy board never makes it drift.
class ExamCountdown extends ChangeNotifier {
  ExamCountdown({required this.total, DateTime Function()? now}) : now = now ?? DateTime.now;

  final DateTime Function() now;
  Duration total;
  Duration _usedBefore = Duration.zero;
  DateTime? _since;

  bool get running => _since != null;
  bool get started => running || _usedBefore > Duration.zero;

  Duration get used => _usedBefore + (_since == null ? Duration.zero : now().difference(_since!));

  Duration get left {
    final l = total - used;
    return l.isNegative ? Duration.zero : l;
  }

  bool get timeUp => left == Duration.zero;

  /// When the time runs out at this pace (null while paused).
  DateTime? get endsAt => running ? now().add(left) : null;

  CountdownPhase get phase {
    if (timeUp) return CountdownPhase.timeUp;
    if (!started) return CountdownPhase.ready;
    if (!running) return CountdownPhase.paused;
    if (left <= const Duration(minutes: 5)) return CountdownPhase.lastFive;
    if (left <= const Duration(minutes: 10)) return CountdownPhase.lastTen;
    return CountdownPhase.running;
  }

  void start() {
    if (running || timeUp) return;
    _since = now();
    notifyListeners();
  }

  void pause() {
    if (!running) return;
    _usedBefore = used;
    _since = null;
    notifyListeners();
  }

  void toggle() => running ? pause() : start();

  /// Back to [to] (else the same total), stopped.
  void reset([Duration? to]) {
    total = to ?? total;
    _usedBefore = Duration.zero;
    _since = null;
    notifyListeners();
  }

  /// Adds (or with a negative [d], takes away) time; never below a minute.
  void add(Duration d) {
    final t = total + d;
    total = t < const Duration(minutes: 1) ? const Duration(minutes: 1) : t;
    notifyListeners();
  }
}

/// "3:20:00", "59:59"; with [minutesOnly] (a paper under two hours, KCET's 80 minutes) the
/// hours are counted as minutes: "80:00".
String clockText(Duration d, {bool minutesOnly = false}) {
  final s = d.inSeconds, h = s ~/ 3600, m = (s % 3600) ~/ 60, sec = s % 60;
  String two(int v) => v.toString().padLeft(2, '0');
  if (minutesOnly) return '${two(s ~/ 60)}:${two(sec)}';
  return h > 0 ? '$h:${two(m)}:${two(sec)}' : '${two(m)}:${two(sec)}';
}

/// The full-screen exam timer: a big countdown the class reads from the back row, the exam's
/// time from [examRules] to start with.
Future<void> openExamTimer(BuildContext context, {required Exam exam, String title = '', DateTime Function()? now}) => Navigator.of(context, rootNavigator: true).push(
  PageRouteBuilder<void>(
    opaque: true,
    pageBuilder: (_, _, _) => ExamTimerScreen(exam: exam, title: title, now: now),
  ),
);

class ExamTimerScreen extends StatefulWidget {
  const ExamTimerScreen({super.key, required this.exam, this.title = '', this.now});

  final Exam exam;
  final String title;
  final DateTime Function()? now;

  @override
  State<ExamTimerScreen> createState() => _ExamTimerScreenState();
}

class _ExamTimerScreenState extends State<ExamTimerScreen> {
  late Exam exam = widget.exam;
  late final countdown = ExamCountdown(total: Duration(minutes: exam.rule.minutes), now: widget.now);
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    countdown.addListener(_changed);
    _tick = Timer.periodic(const Duration(milliseconds: 500), (_) {
      if (countdown.running) {
        if (countdown.timeUp) countdown.pause();
        setState(() {});
      }
    });
  }

  void _changed() => setState(() {});

  @override
  void dispose() {
    _tick?.cancel();
    countdown.dispose();
    super.dispose();
  }

  void _exam(Exam e) {
    exam = e;
    countdown.reset(Duration(minutes: e.rule.minutes));
  }

  @override
  Widget build(BuildContext context) {
    final c = countdown;
    final (bg, line) = switch (c.phase) {
      CountdownPhase.ready => (CeC.mint, 'Tap Start when the class is ready.'),
      CountdownPhase.running => (CeC.mint, 'Time left'),
      CountdownPhase.lastTen => (CeC.butter, 'Last 10 minutes. Check your answers.'),
      CountdownPhase.lastFive => (CeC.peach, 'Last 5 minutes.'),
      CountdownPhase.paused => (CeC.lavender, 'Paused'),
      CountdownPhase.timeUp => (CeC.pink, 'Time is up. Pens down.'),
    };
    final ends = c.endsAt;
    return Theme(
      data: ceTheme(context),
      child: Scaffold(
        key: const Key('ce-papers-timer'),
        backgroundColor: CeC.page,
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(28, 20, 28, 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    toolButton('Close', icon: Icons.close_rounded, key: const Key('ce-timer-close'), onPressed: () => Navigator.of(context).pop()),
                    const SizedBox(width: 20),
                    Expanded(
                      child: Text(
                        [if (widget.title.isNotEmpty) widget.title else exam.label, exam.rule.timeLine].join(' · '),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: ceHeading(32),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    for (final e in Exam.values)
                      choiceChip('${e.label}  ${formatMinutes(e.rule.minutes)}', on: e == exam, offIcon: null, tick: false, key: Key('ce-timer-exam-${e.id}'), onTap: () => _exam(e)),
                  ],
                ),
                const SizedBox(height: 18),
                Expanded(
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 400),
                    decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(36)),
                    child: Column(
                      children: [
                        const SizedBox(height: 24),
                        Text(line, key: const Key('ce-timer-phase'), style: ceHeading(34)),
                        Expanded(
                          child: FittedBox(
                            child: Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 40),
                              child: Text(
                                clockText(c.left, minutesOnly: c.total < const Duration(hours: 2)),
                                key: const Key('ce-papers-timer-left'),
                                style: ceHeading(300, w: FontWeight.w500).copyWith(fontFeatures: const [FontFeature.tabularFigures()]),
                              ),
                            ),
                          ),
                        ),
                        Text(
                          ends == null ? 'Total ${formatMinutes(c.total.inMinutes)}' : 'Ends at ${TimeOfDay.fromDateTime(ends).format(context)}',
                          style: ceText(24, w: FontWeight.w600, c: CeC.navy),
                        ),
                        const SizedBox(height: 24),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 18),
                Row(
                  children: [
                    toolButton('− 5 min', key: const Key('ce-timer-less'), onPressed: () => c.add(const Duration(minutes: -5))),
                    const SizedBox(width: 12),
                    toolButton('+ 5 min', key: const Key('ce-timer-more'), onPressed: () => c.add(const Duration(minutes: 5))),
                    const Spacer(),
                    toolButton('Reset', icon: Icons.restart_alt_rounded, key: const Key('ce-timer-reset'), onPressed: () => c.reset()),
                    const SizedBox(width: 12),
                    toolButton(
                      c.running ? 'Pause' : (c.started && !c.timeUp ? 'Go on' : 'Start'),
                      icon: c.running ? Icons.pause_rounded : Icons.play_arrow_rounded,
                      filled: true,
                      key: const Key('ce-timer-start'),
                      onPressed: c.timeUp ? null : c.toggle,
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
