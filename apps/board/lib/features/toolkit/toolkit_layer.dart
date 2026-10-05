import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/models.dart';
import '../../l10n/l10n.dart';
import '../board/chrome.dart';
import 'noise_source.dart';
import 'toolkit_controller.dart';

/// A toolkit item's name in the board's language.
String toolkitName(AppLocalizations l, ToolkitItem t) => switch (t) {
  ToolkitItem.timer => l.toolTimer,
  ToolkitItem.stopwatch => l.tkStopwatch,
  ToolkitItem.picker => l.toolRandomPick,
  ToolkitItem.dice => l.tkDice,
  ToolkitItem.spinner => l.tkSpinner,
  ToolkitItem.noise => l.tkNoiseMeter,
  ToolkitItem.curtain => l.toolScreenShade,
  ToolkitItem.spotlight => l.toolSpotlight,
};

IconData toolkitIcon(ToolkitItem t) => switch (t) {
  ToolkitItem.timer => Icons.timer_outlined,
  ToolkitItem.stopwatch => Icons.av_timer,
  ToolkitItem.picker => Icons.person_search_outlined,
  ToolkitItem.dice => Icons.casino_outlined,
  ToolkitItem.spinner => Icons.donut_large,
  ToolkitItem.noise => Icons.graphic_eq,
  ToolkitItem.curtain => Icons.vignette_outlined,
  ToolkitItem.spotlight => Icons.highlight_outlined,
};

/// A toolkit item's tile colour in the Tools popover.
Color toolkitColor(ToolkitItem t) => switch (t) {
  ToolkitItem.timer || ToolkitItem.stopwatch => const Color(0xFF8AB4F8),
  ToolkitItem.picker || ToolkitItem.dice || ToolkitItem.spinner => const Color(0xFFFDD663),
  ToolkitItem.noise => const Color(0xFF81C995),
  ToolkitItem.curtain => const Color(0xFFDADCE0),
  ToolkitItem.spotlight => const Color(0xFFFCAD70),
};

/// The open toolkit cards over the board, which the teacher can drag out of the way, and the
/// screen shade and spotlight over the whole board.
class ToolkitLayer extends StatefulWidget {
  const ToolkitLayer({super.key, required this.kit, this.insets = EdgeInsets.zero, this.onAnswer});

  final ToolkitController kit;

  /// Edges covered by the board's toolbars: cards open clear of them.
  final EdgeInsets insets;

  /// Records how a picked student answered (only for a real class).
  final void Function(Student student, AnswerOutcome outcome)? onAnswer;

  @override
  State<ToolkitLayer> createState() => _ToolkitLayerState();
}

class _ToolkitLayerState extends State<ToolkitLayer> {
  final _pos = <ToolkitItem, Offset>{};

  static const _cardWidth = 360.0;

  @override
  Widget build(BuildContext context) {
    final k = widget.kit;
    return ListenableBuilder(
      listenable: k,
      builder: (context, _) => LayoutBuilder(
        builder: (context, c) {
          final ins = widget.insets;
          final cards = k.open.where((t) => t != ToolkitItem.curtain && t != ToolkitItem.spotlight).toList();
          final overlays = k.isOpen(ToolkitItem.curtain) || k.isOpen(ToolkitItem.spotlight);
          return Stack(
            children: [
              if (k.isOpen(ToolkitItem.curtain)) Positioned.fill(child: CurtainOverlay(kit: k)),
              if (k.isOpen(ToolkitItem.spotlight)) Positioned.fill(child: SpotlightOverlay(kit: k)),
              for (final (i, t) in cards.indexed)
                Builder(
                  builder: (context) {
                    // New cards open at the right, two columns, clear of the toolbars.
                    final p = _pos[t] ?? Offset(c.maxWidth - ins.right - _cardWidth - 8 - (i % 2) * (_cardWidth + 12), ins.top + 8 + (i ~/ 2) * 300.0);
                    return Positioned(
                      left: p.dx.clamp(0, math.max(0, c.maxWidth - _cardWidth)),
                      top: p.dy.clamp(0, math.max(0, c.maxHeight - 120)),
                      child: BoardChromeTheme(
                        child: ToolkitCard(
                          key: Key('toolkit-${t.name}'),
                          item: t,
                          width: _cardWidth,
                          onDrag: (d) => setState(() => _pos[t] = (_pos[t] ?? p) + d),
                          onClose: () => k.close(t),
                          child: switch (t) {
                            ToolkitItem.timer => TimerBody(kit: k),
                            ToolkitItem.stopwatch => StopwatchBody(kit: k),
                            ToolkitItem.picker => PickerBody(kit: k, onAnswer: widget.onAnswer),
                            ToolkitItem.dice => DiceBody(kit: k),
                            ToolkitItem.spinner => SpinnerBody(kit: k),
                            ToolkitItem.noise => NoiseBody(kit: k),
                            _ => const SizedBox.shrink(),
                          },
                        ),
                      ),
                    );
                  },
                ),
              if (overlays)
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: ins.bottom + 8,
                  child: Center(child: BoardChromeTheme(child: _OverlayBar(kit: k))),
                ),
            ],
          );
        },
      ),
    );
  }
}

/// A floating toolkit card: drag it by its title.
class ToolkitCard extends StatelessWidget {
  const ToolkitCard({super.key, required this.item, required this.child, required this.onDrag, required this.onClose, this.width = 340});

  final ToolkitItem item;
  final Widget child;
  final ValueChanged<Offset> onDrag;
  final VoidCallback onClose;
  final double width;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final l = context.l10n;
    return ChromeSurface(
      radius: Kx.rXl,
      padding: EdgeInsets.zero,
      child: SizedBox(
        width: width,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            GestureDetector(
              behavior: HitTestBehavior.opaque,
              onPanUpdate: (d) => onDrag(d.delta),
              child: Tooltip(
                message: l.tkDragCard,
                waitDuration: const Duration(seconds: 1),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s4, Kx.s4, 0),
                  child: Row(
                    children: [
                      Icon(toolkitIcon(item), color: c.onSurfaceVariant, size: 20),
                      const SizedBox(width: Kx.s8),
                      Expanded(child: Text(toolkitName(l, item), style: context.text.titleSmall)),
                      IconButton(key: Key('toolkit-close-${item.name}'), tooltip: l.close, onPressed: onClose, icon: const Icon(Icons.close)),
                    ],
                  ),
                ),
              ),
            ),
            Padding(padding: const EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, Kx.s16), child: child),
          ],
        ),
      ),
    );
  }
}

TextStyle? _bigNumber(BuildContext context, {Color? color, double size = 44}) =>
    context.text.displaySmall?.copyWith(fontSize: size, fontWeight: FontWeight.w600, color: color, fontFeatures: const [FontFeature.tabularFigures()]);

class TimerBody extends StatelessWidget {
  const TimerBody({super.key, required this.kit});
  final ToolkitController kit;

  @override
  Widget build(BuildContext context) {
    final k = kit;
    final c = context.colors;
    final l = context.l10n;
    final left = k.timerLeft;
    final total = k.timerTotal.inMilliseconds;
    final frac = total == 0 ? 0.0 : (left.inMilliseconds / total).clamp(0.0, 1.0);
    final low = left.inSeconds <= 10 && k.timerRunning;
    final alert = k.timerDone || low;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const SizedBox(height: Kx.s8),
        Stack(
          alignment: Alignment.center,
          children: [
            SizedBox(
              width: 156,
              height: 156,
              child: CircularProgressIndicator(value: frac, strokeWidth: 10, color: alert ? c.error : c.primary, backgroundColor: c.surfaceContainerHighest),
            ),
            Text(k.timerDone ? l.timesUp : clockText(left), key: const Key('countdown-text'), style: _bigNumber(context, color: alert ? c.error : c.onSurface, size: k.timerDone ? 26 : 40)),
          ],
        ),
        const SizedBox(height: Kx.s12),
        Wrap(
          spacing: Kx.s8,
          runSpacing: Kx.s8,
          alignment: WrapAlignment.center,
          children: [
            for (final m in [1, 2, 3, 5, 10, 15])
              ChoiceChip(
                key: Key('timer-$m'),
                label: Text(l.minutesShort(m)),
                selected: k.timerTotal == Duration(minutes: m) && !k.timerRunning,
                onSelected: (_) => k.setTimer(Duration(minutes: m)),
              ),
          ],
        ),
        const SizedBox(height: Kx.s12),
        Wrap(
          alignment: WrapAlignment.center,
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: Kx.s8,
          runSpacing: Kx.s4,
          children: [
            OutlinedButton(key: const Key('timer-plus'), onPressed: () => k.addTime(const Duration(minutes: 1)), child: Text(l.tkPlusMinute)),
            FilledButton.icon(
              key: const Key('countdown-toggle'),
              onPressed: k.startPauseTimer,
              icon: Icon(k.timerRunning ? Icons.pause : Icons.play_arrow),
              label: Text(k.timerRunning ? l.pause : (k.timerDone ? l.restart : l.start)),
            ),
            IconButton.filledTonal(tooltip: l.reset, onPressed: k.resetTimer, icon: const Icon(Icons.replay)),
          ],
        ),
      ],
    );
  }
}

class StopwatchBody extends StatelessWidget {
  const StopwatchBody({super.key, required this.kit});
  final ToolkitController kit;

  static String _text(Duration d) => '${clockText(d)}.${(d.inMilliseconds % 1000) ~/ 100}';

  @override
  Widget build(BuildContext context) {
    final k = kit;
    final l = context.l10n;
    final laps = k.laps;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(_text(k.stopwatch), key: const Key('stopwatch-text'), style: _bigNumber(context)),
        const SizedBox(height: Kx.s8),
        Wrap(
          alignment: WrapAlignment.center,
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: Kx.s8,
          runSpacing: Kx.s4,
          children: [
            FilledButton.icon(
              key: const Key('stopwatch-toggle'),
              onPressed: k.startPauseStopwatch,
              icon: Icon(k.stopwatchRunning ? Icons.pause : Icons.play_arrow),
              label: Text(k.stopwatchRunning ? l.pause : l.start),
            ),
            OutlinedButton(key: const Key('stopwatch-lap'), onPressed: k.stopwatchRunning ? k.lap : null, child: Text(l.tkLap)),
            IconButton.filledTonal(tooltip: l.reset, onPressed: k.resetStopwatch, icon: const Icon(Icons.replay)),
          ],
        ),
        if (laps.isNotEmpty)
          SizedBox(
            height: math.min(120, laps.length * 26.0),
            child: ListView(
              children: [
                for (final (i, d) in laps.indexed)
                  Text(
                    l.tkLapN(laps.length - i, _text(d)),
                    style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant, fontFeatures: const [FontFeature.tabularFigures()]),
                  ),
              ],
            ),
          ),
      ],
    );
  }
}

class PickerBody extends StatefulWidget {
  const PickerBody({super.key, required this.kit, this.onAnswer});
  final ToolkitController kit;
  final void Function(Student student, AnswerOutcome outcome)? onAnswer;

  @override
  State<PickerBody> createState() => _PickerBodyState();
}

class _PickerBodyState extends State<PickerBody> {
  /// The answer recorded for the student on show, and who it was recorded for.
  String? _recorded;
  String? _recordedFor;

  void _answer(Student s, AnswerOutcome o, String text) {
    widget.onAnswer?.call(s, o);
    setState(() {
      _recorded = text;
      _recordedFor = s.id;
    });
  }

  @override
  Widget build(BuildContext context) {
    final k = widget.kit;
    final c = context.colors;
    final l = context.l10n;
    final list = k.classList;
    if (list.isEmpty) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.group_off_outlined, color: c.onSurfaceVariant, size: 32),
          const SizedBox(height: Kx.s8),
          Text(l.noClassList, style: context.text.titleSmall),
          const SizedBox(height: Kx.s4),
          Text(l.randomPickNoClass, textAlign: TextAlign.center, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
        ],
      );
    }
    final s = k.rolling ? null : k.currentStudent;
    final demoNames = list.first.$2 == null;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AnimatedContainer(
          duration: Kx.fast,
          height: 96,
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(horizontal: Kx.s12),
          decoration: BoxDecoration(
            color: k.rolling || k.current == null ? c.surfaceContainerHighest : c.primaryContainer,
            borderRadius: BorderRadius.circular(Kx.rLg),
          ),
          child: FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(
              k.current ?? l.tkReady,
              key: const Key('picked-name'),
              textAlign: TextAlign.center,
              style: context.text.headlineMedium?.copyWith(fontWeight: FontWeight.w600, color: k.rolling || k.current == null ? c.onSurface : c.onPrimaryContainer),
            ),
          ),
        ),
        if (s != null) Padding(padding: const EdgeInsets.only(top: Kx.s4), child: Text(l.rollNo(s.rollNo), textAlign: TextAlign.center, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant))),
        const SizedBox(height: Kx.s8),
        Text(
          demoNames ? '${l.tkDemoClass} · ${l.tkPickedOf(k.pickedCount, list.length)}' : l.tkPickedOf(k.pickedCount, list.length),
          textAlign: TextAlign.center,
          style: context.text.labelMedium?.copyWith(color: c.onSurfaceVariant),
        ),
        const SizedBox(height: Kx.s8),
        if (s != null && widget.onAnswer != null)
          _recordedFor == s.id
              ? Center(
                  child: Chip(avatar: const Icon(Icons.check_circle, size: 18), label: Text(l.answerSavedTo(_recorded!, s.fullName.split(' ').first))),
                )
              : Wrap(
                  alignment: WrapAlignment.center,
                  spacing: Kx.s4,
                  runSpacing: Kx.s4,
                  children: [
                    IconButton.filled(
                      key: const Key('pick-correct'),
                      tooltip: l.answerCorrect,
                      style: IconButton.styleFrom(backgroundColor: Kx.success, foregroundColor: Colors.white),
                      onPressed: () => _answer(s, AnswerOutcome.correct, l.answerCorrect),
                      icon: const Icon(Icons.check),
                    ),
                    IconButton.filledTonal(tooltip: l.answerPartlyCorrect, onPressed: () => _answer(s, AnswerOutcome.partial, l.answerPartlyCorrect), icon: const Icon(Icons.adjust)),
                    IconButton.filledTonal(tooltip: l.answerNotCorrect, onPressed: () => _answer(s, AnswerOutcome.incorrect, l.answerNotCorrect), icon: const Icon(Icons.close)),
                    TextButton(onPressed: () => _answer(s, AnswerOutcome.skipped, l.answerSkipped), child: Text(l.answerSkip)),
                  ],
                ),
        Wrap(
          alignment: WrapAlignment.center,
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: Kx.s8,
          runSpacing: Kx.s4,
          children: [
            FilledButton.icon(
              key: const Key('pick-student'),
              onPressed: k.rolling ? null : () => unawaited(k.pick()),
              icon: const Icon(Icons.casino_outlined),
              label: Text(k.current == null ? l.tkPick : l.pickAgain),
            ),
            IconButton.filledTonal(tooltip: l.tkStartOver, onPressed: k.pickedCount == 0 ? null : k.resetPicks, icon: const Icon(Icons.replay)),
          ],
        ),
        SwitchListTile(
          key: const Key('pick-no-repeat'),
          dense: true,
          contentPadding: EdgeInsets.zero,
          title: Text(l.tkNoRepeat),
          value: k.noRepeat,
          onChanged: k.setNoRepeat,
        ),
      ],
    );
  }
}

class DiceBody extends StatelessWidget {
  const DiceBody({super.key, required this.kit});
  final ToolkitController kit;

  @override
  Widget build(BuildContext context) {
    final k = kit;
    final l = context.l10n;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const SizedBox(height: Kx.s8),
        Wrap(
          spacing: Kx.s12,
          runSpacing: Kx.s12,
          alignment: WrapAlignment.center,
          children: [
            for (final (i, v) in k.dice.indexed)
              Semantics(
                label: '$v',
                child: SizedBox(key: Key('die-$i'), width: 68, height: 68, child: CustomPaint(painter: DiePainter(v))),
              ),
          ],
        ),
        const SizedBox(height: Kx.s8),
        if (k.dice.length > 1)
          Text(l.tkTotal(k.dice.fold<int>(0, (a, b) => a + b)), key: const Key('dice-total'), style: context.text.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: Kx.s8),
        Wrap(
          alignment: WrapAlignment.center,
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: Kx.s8,
          runSpacing: Kx.s4,
          children: [
            IconButton(key: const Key('dice-fewer'), tooltip: l.tkDiceCount(k.diceCount - 1), onPressed: k.diceCount > 1 ? () => k.setDiceCount(k.diceCount - 1) : null, icon: const Icon(Icons.remove_circle_outline)),
            Text(l.tkDiceCount(k.diceCount)),
            IconButton(key: const Key('dice-more'), tooltip: l.tkDiceCount(k.diceCount + 1), onPressed: k.diceCount < 4 ? () => k.setDiceCount(k.diceCount + 1) : null, icon: const Icon(Icons.add_circle_outline)),
            FilledButton.icon(key: const Key('dice-roll'), onPressed: k.rollingDice ? null : () => unawaited(k.roll()), icon: const Icon(Icons.casino_outlined), label: Text(l.tkRoll)),
          ],
        ),
      ],
    );
  }
}

/// A die face with its pips.
class DiePainter extends CustomPainter {
  DiePainter(this.value);
  final int value;

  static const _spots = {
    1: [(0.5, 0.5)],
    2: [(0.27, 0.27), (0.73, 0.73)],
    3: [(0.27, 0.27), (0.5, 0.5), (0.73, 0.73)],
    4: [(0.27, 0.27), (0.73, 0.27), (0.27, 0.73), (0.73, 0.73)],
    5: [(0.27, 0.27), (0.73, 0.27), (0.5, 0.5), (0.27, 0.73), (0.73, 0.73)],
    6: [(0.27, 0.25), (0.73, 0.25), (0.27, 0.5), (0.73, 0.5), (0.27, 0.75), (0.73, 0.75)],
  };

  @override
  void paint(Canvas canvas, Size size) {
    final r = RRect.fromRectAndRadius(Offset.zero & size, Radius.circular(size.width * 0.18));
    canvas.drawRRect(r, Paint()..color = Colors.white);
    canvas.drawRRect(
      r,
      Paint()
        ..color = const Color(0x33000000)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2,
    );
    final w = size.width;
    final pip = Paint()..color = const Color(0xFF1B1F24);
    for (final (x, y) in _spots[value] ?? const <(double, double)>[]) {
      canvas.drawCircle(Offset(x * w, y * w), w * 0.08, pip);
    }
  }

  @override
  bool shouldRepaint(DiePainter oldDelegate) => oldDelegate.value != value;
}

class SpinnerBody extends StatelessWidget {
  const SpinnerBody({super.key, required this.kit});
  final ToolkitController kit;

  /// The slices: the teacher's, or four groups.
  static List<String> optionsOf(ToolkitController k, AppLocalizations l) => k.spinnerOptions ?? [for (final g in ['A', 'B', 'C', 'D']) l.tkGroup(g)];

  Future<void> _edit(BuildContext context, List<String> options) async {
    final edited = await showDialog<String>(
      context: context,
      builder: (_) => BoardChromeTheme(child: _OptionsDialog(initial: options.join('\n'))),
    );
    if (edited != null) kit.setSpinnerOptions(edited.split('\n'));
  }

  @override
  Widget build(BuildContext context) {
    final k = kit;
    final l = context.l10n;
    final options = optionsOf(k, l);
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(width: 220, height: 220, child: CustomPaint(painter: SpinnerPainter(options, k.spinnerAngle))),
        const SizedBox(height: Kx.s8),
        SizedBox(
          height: 36,
          child: Text(k.spinnerResult ?? '', key: const Key('spinner-result'), style: context.text.headlineSmall?.copyWith(fontWeight: FontWeight.w600)),
        ),
        Wrap(
          alignment: WrapAlignment.center,
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: Kx.s8,
          runSpacing: Kx.s4,
          children: [
            FilledButton.icon(key: const Key('spinner-spin'), onPressed: k.spinning ? null : () => unawaited(k.spin(options)), icon: const Icon(Icons.refresh), label: Text(l.tkSpin)),
            OutlinedButton.icon(key: const Key('spinner-edit'), onPressed: k.spinning ? null : () => _edit(context, options), icon: const Icon(Icons.edit_outlined), label: Text(l.edit)),
          ],
        ),
      ],
    );
  }
}

/// Edits the spinner's slices, one on each line.
class _OptionsDialog extends StatefulWidget {
  const _OptionsDialog({required this.initial});
  final String initial;

  @override
  State<_OptionsDialog> createState() => _OptionsDialogState();
}

class _OptionsDialogState extends State<_OptionsDialog> {
  late final _text = TextEditingController(text: widget.initial);

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return AlertDialog(
      title: Text(l.tkSpinnerOptions),
      content: SizedBox(
        width: 380,
        child: TextField(
          key: const Key('spinner-options'),
          controller: _text,
          maxLines: 10,
          minLines: 4,
          autofocus: true,
          decoration: InputDecoration(border: const OutlineInputBorder(), helperText: l.tkSpinnerHint),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(l.cancel)),
        FilledButton(key: const Key('spinner-save'), onPressed: () => Navigator.pop(context, _text.text), child: Text(l.save)),
      ],
    );
  }
}

/// The spinner wheel: slice i starts at [angle] + i·slice, clockwise from the top, under a
/// pointer at the top.
class SpinnerPainter extends CustomPainter {
  SpinnerPainter(this.options, this.angle);
  final List<String> options;
  final double angle;

  static const _colors = [Color(0xFF1A73E8), Color(0xFFE52592), Color(0xFF188038), Color(0xFFE8710A), Color(0xFF9334E6), Color(0xFF12B5CB)];

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    final r = size.shortestSide / 2 - 6;
    final n = math.max(1, options.length);
    final slice = 2 * math.pi / n;
    for (var i = 0; i < n; i++) {
      final start = angle + i * slice - math.pi / 2;
      // With an odd count, the last slice must not match the first.
      final color = _colors[(i == n - 1 && n % _colors.length == 1 && n > 1) ? 1 : i % _colors.length];
      canvas.drawArc(Rect.fromCircle(center: c, radius: r), start, slice, true, Paint()..color = color);
      if (i < options.length) {
        canvas.save();
        canvas.translate(c.dx, c.dy);
        canvas.rotate(start + slice / 2);
        final tp = TextPainter(
          text: TextSpan(text: options[i], style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600)),
          textDirection: TextDirection.ltr,
          maxLines: 1,
          ellipsis: '…',
        )..layout(maxWidth: r * 0.68);
        tp.paint(canvas, Offset(r * 0.26, -tp.height / 2));
        tp.dispose();
        canvas.restore();
      }
    }
    canvas.drawCircle(c, 12, Paint()..color = Colors.white);
    final pointer = Path()
      ..moveTo(c.dx - 12, c.dy - r - 4)
      ..lineTo(c.dx + 12, c.dy - r - 4)
      ..lineTo(c.dx, c.dy - r + 20)
      ..close();
    canvas.drawPath(pointer, Paint()..color = const Color(0xFF1B1F24));
  }

  @override
  bool shouldRepaint(SpinnerPainter oldDelegate) => oldDelegate.angle != angle || !_same(oldDelegate.options, options);

  static bool _same(List<String> a, List<String> b) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] != b[i]) return false;
    }
    return true;
  }
}

class NoiseBody extends StatelessWidget {
  const NoiseBody({super.key, required this.kit});
  final ToolkitController kit;

  @override
  Widget build(BuildContext context) {
    final k = kit;
    final c = context.colors;
    final l = context.l10n;
    if (k.noiseProblem case final p?) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: Kx.s8),
        child: Row(
          children: [
            Icon(Icons.mic_off_outlined, color: c.onSurfaceVariant),
            const SizedBox(width: Kx.s12),
            Expanded(
              child: Text(switch (p) {
                NoiseProblem.permission => l.tkNoisePermission,
                NoiseProblem.noMicrophone => l.tkNoiseNoMic,
                NoiseProblem.unavailable => l.tkNoiseUnavailable,
              }, key: const Key('noise-problem')),
            ),
          ],
        ),
      );
    }
    final loud = k.tooLoud;
    final color = loud ? c.error : (k.noise > k.noiseLimit * 0.75 ? const Color(0xFFE8710A) : Kx.success);
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: Kx.s8),
        Text(loud ? l.tkTooLoud : l.tkCalm, key: const Key('noise-status'), textAlign: TextAlign.center, style: context.text.headlineSmall?.copyWith(fontWeight: FontWeight.w600, color: color)),
        const SizedBox(height: Kx.s12),
        ClipRRect(
          borderRadius: BorderRadius.circular(Kx.rMd),
          child: LinearProgressIndicator(value: k.noise, minHeight: 26, color: color, backgroundColor: c.surfaceContainerHighest),
        ),
        Row(
          children: [
            Text(l.tkLimit, style: context.text.labelLarge?.copyWith(color: c.onSurfaceVariant)),
            Expanded(child: Slider(key: const Key('noise-limit'), value: k.noiseLimit, min: 0.3, max: 0.95, onChanged: k.setNoiseLimit)),
          ],
        ),
        Text(l.tkNoiseLocal, style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
      ],
    );
  }
}

/// The spotlight's size and the buttons that end the shade and the spotlight.
class _OverlayBar extends StatelessWidget {
  const _OverlayBar({required this.kit});
  final ToolkitController kit;

  @override
  Widget build(BuildContext context) {
    final k = kit;
    final l = context.l10n;
    return ChromeSurface(
      radius: Kx.rFull,
      padding: const EdgeInsets.symmetric(horizontal: Kx.s8, vertical: 2),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (k.isOpen(ToolkitItem.spotlight)) ...[
            Icon(Icons.highlight_outlined, color: context.colors.onSurfaceVariant, size: 20),
            SizedBox(
              width: 180,
              child: Slider(key: const Key('spotlight-size'), label: l.tkSpotlightSize, value: k.spotlightRadius, min: 0.06, max: 0.5, onChanged: k.setSpotlightRadius),
            ),
            TextButton(key: const Key('spotlight-end'), onPressed: () => k.close(ToolkitItem.spotlight), child: Text(l.tkEndSpotlight)),
          ],
          if (k.isOpen(ToolkitItem.curtain)) ...[
            TextButton(key: const Key('curtain-reveal-all'), onPressed: () => k.setCurtain(1), child: Text(l.tkRevealAll)),
            TextButton(key: const Key('curtain-remove'), onPressed: () => k.close(ToolkitItem.curtain), child: Text(l.tkRemoveShade)),
          ],
        ],
      ),
    );
  }
}

/// Covers the board below the part revealed; drag the handle to show more. With [forTeacher]
/// the teacher can just see through it; the class cannot.
class CurtainOverlay extends StatelessWidget {
  const CurtainOverlay({super.key, required this.kit, this.forTeacher = true});
  final ToolkitController kit;
  final bool forTeacher;

  static const _handle = Color(0xFFF2B33D);

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return LayoutBuilder(
      builder: (context, c) {
        final top = c.maxHeight * kit.curtain;
        return Stack(
          children: [
            Positioned(
              left: 0,
              right: 0,
              top: top,
              bottom: 0,
              child: IgnorePointer(
                ignoring: !forTeacher,
                child: Container(
                  key: const Key('curtain'),
                  decoration: BoxDecoration(
                    color: const Color(0xFF2A2F36).withValues(alpha: forTeacher ? 0.94 : 1),
                    border: const Border(top: BorderSide(color: _handle, width: 4)),
                  ),
                ),
              ),
            ),
            if (forTeacher)
              Positioned(
                left: 0,
                right: 0,
                top: math.max(0, top - 24),
                child: Center(
                  child: GestureDetector(
                    key: const Key('curtain-handle'),
                    onVerticalDragUpdate: (d) => kit.setCurtain((c.maxHeight * kit.curtain + d.delta.dy) / c.maxHeight),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: Kx.s20, vertical: Kx.s12),
                      decoration: BoxDecoration(color: _handle, borderRadius: BorderRadius.circular(Kx.rFull)),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.unfold_more, color: Color(0xFF1B1400)),
                          const SizedBox(width: Kx.s8),
                          Text(l.tkDragToReveal, style: const TextStyle(color: Color(0xFF1B1400), fontWeight: FontWeight.w600)),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}

/// Darkens everything but a circle the teacher drags around.
class SpotlightOverlay extends StatelessWidget {
  const SpotlightOverlay({super.key, required this.kit, this.forTeacher = true});
  final ToolkitController kit;
  final bool forTeacher;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, c) {
        final size = c.biggest;
        final center = Offset(kit.spotlight.dx * size.width, kit.spotlight.dy * size.height);
        final r = kit.spotlightRadius * size.shortestSide;
        final painter = CustomPaint(key: const Key('spotlight'), size: size, painter: SpotPainter(center, r, forTeacher ? 0.72 : 0.88));
        if (!forTeacher) return IgnorePointer(child: painter);
        return Stack(
          children: [
            IgnorePointer(child: painter),
            Positioned(
              left: center.dx - r,
              top: center.dy - r,
              width: 2 * r,
              height: 2 * r,
              child: GestureDetector(
                key: const Key('spotlight-drag'),
                behavior: HitTestBehavior.opaque,
                onPanUpdate: (d) {
                  final p = Offset(kit.spotlight.dx * size.width, kit.spotlight.dy * size.height) + d.delta;
                  kit.moveSpotlight(Offset(p.dx / size.width, p.dy / size.height));
                },
                child: const SizedBox.expand(),
              ),
            ),
          ],
        );
      },
    );
  }
}

class SpotPainter extends CustomPainter {
  SpotPainter(this.center, this.radius, this.darkness);
  final Offset center;
  final double radius;
  final double darkness;

  @override
  void paint(Canvas canvas, Size size) {
    final path = Path()
      ..fillType = PathFillType.evenOdd
      ..addRect(Offset.zero & size)
      ..addOval(Rect.fromCircle(center: center, radius: radius));
    canvas.drawPath(path, Paint()..color = Colors.black.withValues(alpha: darkness));
    canvas.drawCircle(
      center,
      radius,
      Paint()
        ..color = const Color(0x55FFFFFF)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3,
    );
  }

  @override
  bool shouldRepaint(SpotPainter old) => old.center != center || old.radius != radius || old.darkness != darkness;
}
