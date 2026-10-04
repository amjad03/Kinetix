import 'dart:async';

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/models.dart';
import 'chrome.dart';

/// A countdown that floats over the board and can be dragged out of the way.
class CountdownCard extends StatefulWidget {
  const CountdownCard({super.key, required this.onClose});

  final VoidCallback onClose;

  @override
  State<CountdownCard> createState() => _CountdownCardState();
}

class _CountdownCardState extends State<CountdownCard> {
  Duration _total = const Duration(minutes: 5);
  Duration _left = const Duration(minutes: 5);
  Timer? _timer;

  bool get _running => _timer != null;
  bool get _done => _left == Duration.zero;

  void _start() {
    if (_done) _left = _total;
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      setState(() {
        _left -= const Duration(seconds: 1);
        if (_left <= Duration.zero) {
          _left = Duration.zero;
          _stop();
        }
      });
    });
    setState(() {});
  }

  void _stop() {
    _timer?.cancel();
    _timer = null;
    setState(() {});
  }

  void _preset(int minutes) {
    _stop();
    setState(() => _total = _left = Duration(minutes: minutes));
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final mm = _left.inMinutes.toString().padLeft(2, '0');
    final ss = (_left.inSeconds % 60).toString().padLeft(2, '0');
    return ChromeSurface(
      radius: Kx.rXl,
      padding: const EdgeInsets.fromLTRB(Kx.s20, Kx.s8, Kx.s8, Kx.s16),
      child: SizedBox(
        width: 300,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Icon(Icons.timer_outlined, color: c.onSurfaceVariant, size: 20),
                const SizedBox(width: Kx.s8),
                Expanded(child: Text(_done ? "Time's up" : 'Timer', style: context.text.titleSmall)),
                IconButton(tooltip: 'Close timer', onPressed: widget.onClose, icon: const Icon(Icons.close)),
              ],
            ),
            Text(
              '$mm:$ss',
              key: const Key('countdown-text'),
              style: context.text.displayLarge?.copyWith(
                fontWeight: FontWeight.w500,
                color: _done ? c.error : c.onSurface,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
            const SizedBox(height: Kx.s8),
            Wrap(
              spacing: Kx.s8,
              children: [
                for (final m in [1, 3, 5, 10])
                  ChoiceChip(label: Text('$m min'), selected: _total.inMinutes == m && !_running, onSelected: (_) => _preset(m)),
              ],
            ),
            const SizedBox(height: Kx.s12),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                IconButton.filledTonal(tooltip: 'Reset', onPressed: () => _preset(_total.inMinutes), icon: const Icon(Icons.replay)),
                const SizedBox(width: Kx.s12),
                FilledButton.icon(
                  key: const Key('countdown-toggle'),
                  onPressed: _running ? _stop : _start,
                  icon: Icon(_running ? Icons.pause : Icons.play_arrow),
                  label: Text(_running ? 'Pause' : (_done ? 'Restart' : 'Start')),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Picks a student at random from the class (absentees excluded) and records how they answered.
class RandomPickerDialog extends StatefulWidget {
  const RandomPickerDialog({super.key, required this.pick, required this.onAnswer, required this.classSize});

  final Student? Function({Student? avoid}) pick;
  final void Function(Student, AnswerOutcome) onAnswer;
  final int classSize;

  @override
  State<RandomPickerDialog> createState() => _RandomPickerDialogState();
}

class _RandomPickerDialogState extends State<RandomPickerDialog> {
  Student? _shown;
  Student? _picked;
  Timer? _shuffle;
  String? _recorded;

  @override
  void initState() {
    super.initState();
    _spin();
  }

  void _spin() {
    _shuffle?.cancel();
    _recorded = null;
    _picked = null;
    var ticks = 0;
    // Flick through names briefly so the class watches, then settle on one.
    _shuffle = Timer.periodic(const Duration(milliseconds: 80), (t) {
      ticks++;
      setState(() => _shown = widget.pick(avoid: _shown));
      if (ticks >= 14) {
        t.cancel();
        setState(() => _picked = _shown);
      }
    });
  }

  void _answer(AnswerOutcome o, String text) {
    final s = _picked;
    if (s == null) return;
    widget.onAnswer(s, o);
    setState(() => _recorded = text);
  }

  @override
  void dispose() {
    _shuffle?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    if (widget.classSize == 0) {
      return AlertDialog(
        icon: const Icon(Icons.group_off_outlined),
        title: const Text('No class list'),
        content: const Text('Sign in from the Teacher app during a timetabled class to pick from its students.'),
        actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('OK'))],
      );
    }
    final s = _shown;
    return AlertDialog(
      icon: const Icon(Icons.casino_outlined),
      title: const Text('Random pick'),
      content: SizedBox(
        width: 520,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: Kx.s8),
            if (s != null) ...[
              KxAvatar(name: s.fullName, size: 88),
              const SizedBox(height: Kx.s16),
              Text(s.fullName, key: const Key('picked-name'), style: context.text.displaySmall, textAlign: TextAlign.center),
              Text('Roll no. ${s.rollNo}', style: context.text.titleMedium?.copyWith(color: c.onSurfaceVariant)),
            ],
            const SizedBox(height: Kx.s24),
            if (_recorded != null)
              Chip(
                avatar: const Icon(Icons.check_circle, size: 18),
                label: Text('$_recorded · saved to ${_picked!.fullName.split(' ').first}\'s profile'),
              )
            else
              Wrap(
                alignment: WrapAlignment.center,
                spacing: Kx.s8,
                runSpacing: Kx.s8,
                children: [
                  FilledButton.icon(
                    onPressed: _picked == null ? null : () => _answer(AnswerOutcome.correct, 'Correct'),
                    style: FilledButton.styleFrom(backgroundColor: Kx.success, foregroundColor: Colors.white),
                    icon: const Icon(Icons.check),
                    label: const Text('Correct'),
                  ),
                  FilledButton.tonalIcon(
                    onPressed: _picked == null ? null : () => _answer(AnswerOutcome.partial, 'Partly correct'),
                    icon: const Icon(Icons.adjust),
                    label: const Text('Partly'),
                  ),
                  FilledButton.tonalIcon(
                    onPressed: _picked == null ? null : () => _answer(AnswerOutcome.incorrect, 'Not correct'),
                    icon: const Icon(Icons.close),
                    label: const Text('Not correct'),
                  ),
                  TextButton(
                    onPressed: _picked == null ? null : () => _answer(AnswerOutcome.skipped, 'Skipped'),
                    child: const Text('Skip'),
                  ),
                ],
              ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Done')),
        FilledButton.tonalIcon(onPressed: _spin, icon: const Icon(Icons.refresh), label: const Text('Pick again')),
      ],
    );
  }
}

/// One-tap attendance on the board: everyone starts present, tap to mark absent or late.
class AttendanceDialog extends StatefulWidget {
  const AttendanceDialog({super.key, required this.roster, required this.initial, required this.onSubmit});

  final List<Student> roster;
  final Map<String, AttendanceMark> initial;
  final ValueChanged<Map<String, AttendanceMark>> onSubmit;

  @override
  State<AttendanceDialog> createState() => _AttendanceDialogState();
}

class _AttendanceDialogState extends State<AttendanceDialog> {
  late final Map<String, AttendanceMark> _marks = {for (final s in widget.roster) s.id: widget.initial[s.id] ?? AttendanceMark.present};

  int _count(AttendanceMark m) => _marks.values.where((v) => v == m).length;

  void _cycle(String id) {
    setState(() {
      _marks[id] = switch (_marks[id]!) {
        AttendanceMark.present => AttendanceMark.absent,
        AttendanceMark.absent => AttendanceMark.late,
        AttendanceMark.late => AttendanceMark.present,
      };
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return AlertDialog(
      icon: const Icon(Icons.how_to_reg_outlined),
      title: const Text('Attendance'),
      content: SizedBox(
        width: 760,
        // Fit the class: about 64 px per row of four, within the screen.
        height: (((widget.roster.length + 3) ~/ 4) * 64 + 48).clamp(180, 520).toDouble(),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              '${_count(AttendanceMark.present)} present · ${_count(AttendanceMark.absent)} absent · ${_count(AttendanceMark.late)} late   —   tap a student to change',
              key: const Key('attendance-summary'),
              style: context.text.titleSmall?.copyWith(color: c.onSurfaceVariant),
            ),
            const SizedBox(height: Kx.s12),
            Expanded(
              child: GridView.extent(
                maxCrossAxisExtent: 240,
                mainAxisSpacing: Kx.s8,
                crossAxisSpacing: Kx.s8,
                childAspectRatio: 3.4,
                children: [for (final s in widget.roster) _AttendanceTile(student: s, mark: _marks[s.id]!, onTap: () => _cycle(s.id))],
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        FilledButton(
          key: const Key('attendance-submit'),
          onPressed: () {
            widget.onSubmit(Map.of(_marks));
            Navigator.pop(context);
          },
          child: const Text('Save attendance'),
        ),
      ],
    );
  }
}

class _AttendanceTile extends StatelessWidget {
  const _AttendanceTile({required this.student, required this.mark, required this.onTap});

  final Student student;
  final AttendanceMark mark;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final (bg, fg, label, icon, iconColor) = switch (mark) {
      AttendanceMark.present => (c.surfaceContainerHighest, c.onSurface, 'Present', Icons.check_circle, const Color(0xFF81C995)),
      AttendanceMark.absent => (c.errorContainer, c.onErrorContainer, 'Absent', Icons.cancel, c.onErrorContainer),
      AttendanceMark.late => (c.tertiaryContainer, c.onTertiaryContainer, 'Late', Icons.schedule, c.onTertiaryContainer),
    };
    return Material(
      color: bg,
      borderRadius: BorderRadius.circular(Kx.rMd),
      child: InkWell(
        borderRadius: BorderRadius.circular(Kx.rMd),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: Kx.s12),
          child: Row(
            children: [
              KxAvatar(name: student.fullName, size: 32),
              const SizedBox(width: Kx.s8),
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      student.fullName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: fg, fontWeight: FontWeight.w500),
                    ),
                    Text(student.rollNo, style: TextStyle(color: fg.withValues(alpha: 0.8), fontSize: 12)),
                    // The status reads from the colour and icon; the label is for screen readers.
                    Semantics(label: label, child: const SizedBox.shrink()),
                  ],
                ),
              ),
              Icon(icon, size: 20, color: iconColor),
            ],
          ),
        ),
      ),
    );
  }
}
