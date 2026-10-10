import 'dart:async';

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/board_controller.dart';
import '../toolkit/toolkit_sounds.dart';
import 'plus_strings.dart';
import 'student_buzzers.dart';

/// Who buzzed first in a quiz round. Pure state, so the rules are easy to test.
class BuzzerRound {
  BuzzerRound({this.teams = 2});

  /// 2 to 4 teams.
  int teams;

  /// The team that buzzed first this round, or null while waiting.
  int? first;

  /// Team [team] presses its buzzer; true when it is the first this round.
  bool press(int team) {
    if (first != null || team < 0 || team >= teams) return false;
    first = team;
    return true;
  }

  void reset() => first = null;
}

/// The buzzer (split panel): a big button per team for quiz rounds. The first team to press
/// buzzes in with a bell, the others are locked until Next question.
class BuzzerPanel extends StatefulWidget {
  const BuzzerPanel({super.key, this.sounds, this.board});

  /// The signed-in board; with it the students' buzzers from the Student App show below.
  final BoardController? board;

  /// The bell; tests pass a silent one.
  final ToolkitSounds? sounds;

  @override
  State<BuzzerPanel> createState() => _BuzzerPanelState();
}

class _BuzzerPanelState extends State<BuzzerPanel> {
  final _round = BuzzerRound();
  static const _colours = [Color(0xFF4F8CFF), Color(0xFFFF5A5F), Color(0xFF3CB44B), Color(0xFFFFA64D)];

  void _press(int team) {
    if (!_round.press(team)) return;
    setState(() {});
    unawaited((widget.sounds ?? ToolkitSounds.instance).play('bell'));
  }

  @override
  Widget build(BuildContext context) {
    final s = plusStrings(context);
    final first = _round.first;
    return ListView(
      key: const Key('buzzer'),
      padding: const EdgeInsets.all(Kx.s16),
      children: [
        Text(s['buzzerHint'], style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant)),
        const SizedBox(height: Kx.s12),
        Row(
          children: [
            Text(s['buzzerTeams'], style: context.text.titleSmall),
            const SizedBox(width: Kx.s12),
            SegmentedButton<int>(
              key: const Key('buzzer-teams'),
              showSelectedIcon: false,
              segments: [for (final n in const [2, 3, 4]) ButtonSegment(value: n, label: Text('$n'))],
              selected: {_round.teams},
              onSelectionChanged: (v) => setState(() {
                _round
                  ..teams = v.first
                  ..reset();
              }),
            ),
          ],
        ),
        const SizedBox(height: Kx.s16),
        Text(
          first == null ? s['buzzerWaiting'] : s.n('buzzerFirst', s.n('team', first + 1)),
          key: const Key('buzzer-status'),
          style: context.text.headlineSmall?.copyWith(fontWeight: FontWeight.w700, color: first == null ? null : _colours[first]),
        ),
        const SizedBox(height: Kx.s16),
        Wrap(
          spacing: Kx.s12,
          runSpacing: Kx.s12,
          children: [
            for (var i = 0; i < _round.teams; i++)
              SizedBox(
                width: 160,
                height: 120,
                child: FilledButton(
                  key: Key('buzz-$i'),
                  style: FilledButton.styleFrom(
                    backgroundColor: _colours[i],
                    disabledBackgroundColor: first == i ? _colours[i] : _colours[i].withValues(alpha: 0.25),
                    disabledForegroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Kx.rLg)),
                  ),
                  onPressed: first == null ? () => _press(i) : null,
                  child: Text(s.n('team', i + 1), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
                ),
              ),
          ],
        ),
        const SizedBox(height: Kx.s16),
        Align(
          alignment: Alignment.centerLeft,
          child: FilledButton.tonalIcon(
            key: const Key('buzzer-reset'),
            onPressed: first == null ? null : () => setState(_round.reset),
            icon: const Icon(Icons.replay),
            label: Text(s['buzzerReset']),
          ),
        ),
        if (widget.board?.api != null && widget.board!.isSignedIn) ...[
          const Divider(height: Kx.s24),
          StudentBuzzers(board: widget.board!, sounds: widget.sounds),
        ],
      ],
    );
  }
}
