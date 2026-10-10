import 'dart:async';

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/board_controller.dart';
import '../board/classroom_profile_strings.dart';
import '../toolkit/toolkit_sounds.dart';
import 'plus_strings.dart';

/// Buzzes from the Student App, in the order they arrived (pushed over the realtime connection).
/// The teacher opens or locks the buzzer for the class and moves to the next question.
class StudentBuzzers extends StatefulWidget {
  const StudentBuzzers({super.key, required this.board, this.sounds});

  final BoardController board;
  final ToolkitSounds? sounds;

  @override
  State<StudentBuzzers> createState() => _StudentBuzzersState();
}

class _StudentBuzzersState extends State<StudentBuzzers> {
  int _seen = 0;

  @override
  void initState() {
    super.initState();
    widget.board.buzzerState.addListener(_changed);
    unawaited(_load());
  }

  @override
  void dispose() {
    widget.board.buzzerState.removeListener(_changed);
    super.dispose();
  }

  Future<void> _load() async {
    try {
      widget.board.buzzerState.value = await widget.board.api!.buzzer();
    } catch (_) {
      // Offline: the panel waits for the next push.
    }
  }

  /// The bell rings for the first buzz of a round.
  void _changed() {
    final n = ((widget.board.buzzerState.value?['presses'] as List?) ?? const []).length;
    if (_seen == 0 && n > 0) unawaited((widget.sounds ?? ToolkitSounds.instance).play('bell'));
    _seen = n;
  }

  Future<void> _run(Future<Map<String, dynamic>> Function() call) async {
    try {
      widget.board.buzzerState.value = await call();
    } catch (_) {
      // Keeps the last state.
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = classroomStrings(context);
    return ValueListenableBuilder<Map<String, dynamic>?>(
      valueListenable: widget.board.buzzerState,
      builder: (context, st, _) {
        final open = st?['open'] == true;
        final locked = st?['locked'] != false;
        final presses = ((st?['presses'] as List?) ?? const []).cast<Map<String, dynamic>>();
        final api = widget.board.api!;
        return Column(
          key: const Key('student-buzzers'),
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(s.t('buzzerStudents'), style: context.text.titleMedium),
            const SizedBox(height: Kx.s8),
            Wrap(
              spacing: Kx.s8,
              runSpacing: Kx.s8,
              children: [
                FilledButton.icon(
                  key: const Key('student-buzzer-toggle'),
                  onPressed: () => unawaited(_run(() => api.lockBuzzer(open && !locked))),
                  icon: Icon(open && !locked ? Icons.lock_outline : Icons.lock_open),
                  label: Text(open && !locked ? s.t('buzzerLockStudents') : s.t('buzzerOpenStudents')),
                ),
                FilledButton.tonalIcon(
                  key: const Key('student-buzzer-reset'),
                  onPressed: open ? () => unawaited(_run(api.resetBuzzer)) : null,
                  icon: const Icon(Icons.replay),
                  label: Text(plusStrings(context)['buzzerReset']),
                ),
                if (open) Chip(label: Text(locked ? s.t('buzzerLocked') : s.t('buzzerOpenNow'))),
              ],
            ),
            const SizedBox(height: Kx.s8),
            if (presses.isEmpty)
              Text(s.t('buzzerNoBuzz'), key: const Key('student-buzzer-empty'))
            else
              for (final p in presses)
                ListTile(
                  key: Key('student-buzz-${p['rank']}'),
                  dense: true,
                  leading: CircleAvatar(radius: 14, child: Text('${p['rank']}')),
                  title: Text('${p['name']}', style: p['rank'] == 1 ? const TextStyle(fontWeight: FontWeight.w700) : null),
                ),
          ],
        );
      },
    );
  }
}
