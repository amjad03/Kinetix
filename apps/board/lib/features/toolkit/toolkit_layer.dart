import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/models.dart';
import '../../l10n/l10n.dart';
import '../board/chrome.dart';
import '../board/layout/layout_strings.dart';
import 'noise_source.dart';
import 'toolkit_controller.dart';
import '../board/panel/panel_host.dart';

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
          // A phone is narrower than a card: the card takes the width.
          final cardWidth = math.min(_cardWidth, c.maxWidth - 16);
          final mini = k.isOpen(ToolkitItem.timer) && k.timerMini;
          final cards = k.open.where((t) => t != ToolkitItem.curtain && t != ToolkitItem.spotlight && !(mini && t == ToolkitItem.timer)).toList();
          final overlays = k.isOpen(ToolkitItem.curtain) || k.isOpen(ToolkitItem.spotlight);
          return Stack(
            children: [
              if (k.isOpen(ToolkitItem.curtain)) Positioned.fill(child: CurtainOverlay(kit: k)),
              if (k.isOpen(ToolkitItem.spotlight)) Positioned.fill(child: SpotlightOverlay(kit: k)),
              for (final (i, t) in cards.indexed)
                Builder(
                  builder: (context) {
                    // New cards open at the right, two columns, clear of the toolbars.
                    final p = _pos[t] ?? Offset(c.maxWidth - ins.right - cardWidth - 8 - (i % 2) * (cardWidth + 12), ins.top + 8 + (i ~/ 2) * 300.0);
                    final top = p.dy.clamp(0, math.max(0, c.maxHeight - 120)).toDouble();
                    return Positioned(
                      left: p.dx.clamp(0, math.max(0, c.maxWidth - cardWidth)),
                      top: top,
                      child: BoardChromeTheme(
                        child: ToolkitCard(
                          key: Key('toolkit-${t.name}'),
                          item: t,
                          width: cardWidth,
                          // On a short screen (a phone on its side) the card scrolls.
                          maxHeight: math.max(120, c.maxHeight - top - ins.bottom - 8),
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
              if (mini)
                Positioned(
                  right: ins.right + 12,
                  top: ins.top + 8,
                  child: BoardChromeTheme(child: TimerMiniChip(key: const Key('toolkit-timer-mini'), kit: k)),
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
  const ToolkitCard({super.key, required this.item, required this.child, required this.onDrag, required this.onClose, this.width = 340, this.maxHeight = double.infinity});

  final ToolkitItem item;
  final Widget child;
  final ValueChanged<Offset> onDrag;
  final VoidCallback onClose;
  final double width;
  final double maxHeight;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final l = context.l10n;
    return ChromeSurface(
      radius: Kx.rXl,
      padding: EdgeInsets.zero,
      child: ConstrainedBox(
        constraints: BoxConstraints.tightFor(width: width).copyWith(maxHeight: maxHeight),
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
            Flexible(
              child: SingleChildScrollView(padding: const EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, Kx.s16), child: child),
            ),
          ],
        ),
      ),
    );
  }
}

TextStyle? _bigNumber(BuildContext context, {Color? color, double size = 44}) =>
    context.text.displaySmall?.copyWith(fontSize: size, fontWeight: FontWeight.w600, color: color, fontFeatures: const [FontFeature.tabularFigures()]);

class TimerBody extends StatefulWidget {
  const TimerBody({super.key, required this.kit});
  final ToolkitController kit;

  @override
  State<TimerBody> createState() => _TimerBodyState();
}

class _TimerBodyState extends State<TimerBody> {
  /// Setting a time: null, or the keypad (true) or the wheels (false).
  bool? _keypad;

  @override
  void initState() {
    super.initState();
    unawaited(widget.kit.loadPresets());
  }

  @override
  Widget build(BuildContext context) {
    final k = widget.kit;
    final c = context.colors;
    final l = context.l10n;
    final s = LayoutStrings.of(context);
    final left = k.timerLeft;
    final total = k.timerTotal.inMilliseconds;
    final frac = total == 0 ? 0.0 : (left.inMilliseconds / total).clamp(0.0, 1.0);
    final low = left.inSeconds <= 10 && k.timerRunning && !k.timerCountUp;
    final alert = k.timerDone || low;
    final secs = timerSeconds(k);
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        SegmentedButton<bool>(
          key: const Key('timer-mode'),
          showSelectedIcon: false,
          segments: [ButtonSegment(value: false, label: Text(s.countDown)), ButtonSegment(value: true, label: Text(s.countUp))],
          selected: {k.timerCountUp},
          onSelectionChanged: k.timerRunning ? null : (v) => k.setTimerOptions(countUp: v.single),
        ),
        const SizedBox(height: Kx.s8),
        if (_keypad != null)
          _TimeSetter(
            key: const Key('timer-setter'),
            keypad: _keypad!,
            initial: k.timerTotal,
            onKeypad: (v) => setState(() => _keypad = v),
            onSet: (d) {
              k.setTimer(d);
              setState(() => _keypad = null);
            },
          )
        else
          Tooltip(
            message: s.setTime,
            child: InkWell(
              key: const Key('timer-set'),
              customBorder: const CircleBorder(),
              onTap: k.timerRunning ? null : () => setState(() => _keypad = false),
              child: Stack(
                alignment: Alignment.center,
                children: [
                  SizedBox(
                    width: 156,
                    height: 156,
                    child: CircularProgressIndicator(
                      value: k.timerCountUp ? 1 - frac : frac,
                      strokeWidth: 10,
                      color: alert ? c.error : c.primary,
                      backgroundColor: c.surfaceContainerHighest,
                    ),
                  ),
                  Text(
                    k.timerDone ? l.timesUp : clockText(Duration(seconds: secs)),
                    key: const Key('countdown-text'),
                    style: _bigNumber(context, color: alert ? c.error : c.onSurface, size: k.timerDone ? 26 : (secs >= 3600 ? 30 : 40)),
                  ),
                ],
              ),
            ),
          ),
        const SizedBox(height: Kx.s12),
        Wrap(
          spacing: Kx.s8,
          runSpacing: Kx.s8,
          alignment: WrapAlignment.center,
          children: [
            for (final m in const [1, 3, 5, 10, 15])
              ChoiceChip(
                key: Key('timer-$m'),
                label: Text(l.minutesShort(m)),
                selected: k.timerTotal == Duration(minutes: m) && !k.timerRunning,
                onSelected: (_) => k.setTimer(Duration(minutes: m)),
              ),
            for (final d in k.customPresets)
              InputChip(
                key: Key('timer-preset-${d.inSeconds}'),
                label: Text(clockText(d)),
                selected: k.timerTotal == d && !k.timerRunning,
                onPressed: () => k.setTimer(d),
                onDeleted: () => unawaited(k.removePreset(d)),
                deleteButtonTooltipMessage: s.removePreset,
              ),
            ActionChip(
              key: const Key('timer-save-preset'),
              avatar: const Icon(Icons.bookmark_add_outlined, size: 18),
              label: Text(s.savePreset),
              onPressed: () => unawaited(k.savePreset(k.timerTotal)),
            ),
          ],
        ),
        const SizedBox(height: Kx.s8),
        Wrap(
          alignment: WrapAlignment.center,
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: Kx.s8,
          runSpacing: Kx.s4,
          children: [
            DropdownButton<String>(
              key: const Key('timer-sound'),
              value: k.timerSound,
              underline: const SizedBox.shrink(),
              items: [
                for (final id in ToolkitController.timerSounds)
                  DropdownMenuItem(
                    value: id,
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(id == 'none' ? Icons.volume_off_outlined : Icons.notifications_active_outlined, size: 18),
                        const SizedBox(width: 6),
                        Text(s.soundName(id)),
                      ],
                    ),
                  ),
              ],
              onChanged: (v) => k.setTimerOptions(sound: v),
            ),
            TextButton.icon(
              key: const Key('timer-mini'),
              onPressed: () => k.setTimerOptions(mini: true),
              icon: const Icon(Icons.picture_in_picture_alt_outlined),
              label: Text(s.mini),
            ),
          ],
        ),
        const SizedBox(height: Kx.s8),
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
            IconButton.filledTonal(key: const Key('timer-reset'), tooltip: l.reset, onPressed: k.resetTimer, icon: const Icon(Icons.replay)),
          ],
        ),
      ],
    );
  }
}

/// Whole seconds to show: rounded up counting down (2:00 shows until a full second has gone),
/// down counting up.
int timerSeconds(ToolkitController k) {
  final ms = k.timerShown.inMilliseconds;
  return k.timerCountUp ? ms ~/ 1000 : (ms / 1000).ceil();
}

/// The timer in a corner: the time, start or pause, and back to the card.
class TimerMiniChip extends StatelessWidget {
  const TimerMiniChip({super.key, required this.kit});
  final ToolkitController kit;

  @override
  Widget build(BuildContext context) {
    final k = kit;
    final l = context.l10n;
    final c = context.colors;
    return ChromeSurface(
      radius: Kx.rFull,
      padding: const EdgeInsets.symmetric(horizontal: Kx.s8, vertical: 2),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.timer_outlined, color: k.timerDone ? c.error : c.primary),
          const SizedBox(width: Kx.s8),
          Text(
            k.timerDone ? l.timesUp : clockText(Duration(seconds: timerSeconds(k))),
            key: const Key('countdown-text'),
            style: _bigNumber(context, size: 22, color: k.timerDone ? c.error : c.onSurface),
          ),
          IconButton(
            key: const Key('countdown-toggle'),
            tooltip: k.timerRunning ? l.pause : l.start,
            onPressed: k.startPauseTimer,
            icon: Icon(k.timerRunning ? Icons.pause : Icons.play_arrow),
          ),
          IconButton(
            key: const Key('timer-big'),
            tooltip: LayoutStrings.of(context).showToClass,
            onPressed: () => k.setTimerOptions(mini: false),
            icon: const Icon(Icons.open_in_full),
          ),
        ],
      ),
    );
  }
}

/// Hours, minutes and seconds: on swipe wheels, or typed on a keypad (digits fill from the
/// right, as on a microwave: 5 0 0 is 5:00).
class _TimeSetter extends StatefulWidget {
  const _TimeSetter({super.key, required this.keypad, required this.initial, required this.onKeypad, required this.onSet});

  final bool keypad;
  final Duration initial;
  final ValueChanged<bool> onKeypad;
  final ValueChanged<Duration> onSet;

  @override
  State<_TimeSetter> createState() => _TimeSetterState();
}

class _TimeSetterState extends State<_TimeSetter> {
  late int _h = widget.initial.inHours.clamp(0, 23), _m = widget.initial.inMinutes % 60, _s = widget.initial.inSeconds % 60;
  String _digits = '';

  Duration get _value => widget.keypad ? _fromDigits() : Duration(hours: _h, minutes: _m, seconds: _s);

  Duration _fromDigits() {
    final d = _digits.padLeft(6, '0');
    return Duration(hours: int.parse(d.substring(0, 2)), minutes: int.parse(d.substring(2, 4)), seconds: int.parse(d.substring(4, 6)));
  }

  void _type(String d) => setState(() {
    var next = _digits + d;
    while (next.startsWith('0')) {
      next = next.substring(1);
    }
    _digits = next.length > 6 ? next.substring(next.length - 6) : next;
  });

  Widget _wheel(String id, int count, int value, ValueChanged<int> onChanged, String unit) => Column(
    children: [
      SizedBox(
        width: 64,
        height: 120,
        child: ListWheelScrollView.useDelegate(
          key: Key('timer-wheel-$id'),
          controller: FixedExtentScrollController(initialItem: value),
          itemExtent: 36,
          physics: const FixedExtentScrollPhysics(),
          onSelectedItemChanged: onChanged,
          childDelegate: ListWheelChildBuilderDelegate(
            childCount: count,
            builder: (context, i) => Center(child: Text(i.toString().padLeft(2, '0'), style: _bigNumber(context, size: 26))),
          ),
        ),
      ),
      Text(unit, style: context.text.labelMedium),
    ],
  );

  @override
  Widget build(BuildContext context) {
    final s = LayoutStrings.of(context);
    final shown = _value;
    String two(int n) => n.toString().padLeft(2, '0');
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        SegmentedButton<bool>(
          key: const Key('timer-setter-mode'),
          showSelectedIcon: false,
          segments: [ButtonSegment(value: false, label: Text(s.wheels)), ButtonSegment(value: true, label: Text(s.keypad))],
          selected: {widget.keypad},
          onSelectionChanged: (v) => widget.onKeypad(v.single),
        ),
        const SizedBox(height: Kx.s8),
        if (widget.keypad) ...[
          Text(
            '${two(shown.inHours)} : ${two(shown.inMinutes % 60)} : ${two(shown.inSeconds % 60)}',
            key: const Key('timer-keypad-display'),
            style: _bigNumber(context, size: 30),
          ),
          const SizedBox(height: Kx.s8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            alignment: WrapAlignment.center,
            children: [
              for (final d in const ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0'])
                SizedBox(
                  width: 64,
                  height: 44,
                  child: OutlinedButton(key: Key('timer-key-$d'), onPressed: () => _type(d), child: Text(d)),
                ),
              SizedBox(
                width: 64,
                height: 44,
                child: OutlinedButton(
                  key: const Key('timer-key-back'),
                  onPressed: _digits.isEmpty ? null : () => setState(() => _digits = _digits.substring(0, _digits.length - 1)),
                  child: const Icon(Icons.backspace_outlined, size: 18),
                ),
              ),
            ],
          ),
        ] else
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _wheel('h', 24, _h, (v) => setState(() => _h = v), s.hoursShort),
              _wheel('m', 60, _m, (v) => setState(() => _m = v), s.minutesShort),
              _wheel('s', 60, _s, (v) => setState(() => _s = v), s.secondsShort),
            ],
          ),
        const SizedBox(height: Kx.s8),
        FilledButton(key: const Key('timer-setter-done'), onPressed: shown > Duration.zero ? () => widget.onSet(shown) : null, child: Text(s.set)),
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
    final edited = await showPanelDialog<String>(
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
      scrollable: true,
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
