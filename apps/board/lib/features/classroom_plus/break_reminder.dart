import 'dart:async';

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'plus_strings.dart';

/// The 20-20-20 rule's clock: after [every] of continuous use, a break is due. A gap of more
/// than [idle] without use counts as a break already taken.
class BreakClock {
  BreakClock({this.every = const Duration(minutes: 20), this.idle = const Duration(minutes: 5), this.snooze = const Duration(minutes: 5)});

  final Duration every, idle, snooze;
  DateTime? _since, _last;

  /// Notes that the board was used at [now]; true when a break is due.
  bool use(DateTime now) {
    if (_last == null || now.difference(_last!) > idle) _since = now;
    _last = now;
    return due(now);
  }

  bool due(DateTime now) => _since != null && now.difference(_since!) >= every;

  /// When the next break is due, if the board keeps being used.
  DateTime? get nextDue => _since?.add(every);

  /// The break was taken: count from [now] again.
  void taken(DateTime now) => _since = now;

  /// Asked again in [snooze].
  void later(DateTime now) => _since = now.subtract(every).add(snooze);
}

/// The break reminder at the top of the board: shown after 20 minutes of continuous use when
/// [enabled], with a 20-second countdown for looking 20 feet away. [activity] fires whenever the
/// board is used (its changes).
class BreakReminderBanner extends StatefulWidget {
  const BreakReminderBanner({super.key, required this.activity, required this.enabled, this.clock, this.now});

  final Listenable activity;
  final bool Function() enabled;
  final BreakClock? clock;
  final DateTime Function()? now;

  @override
  State<BreakReminderBanner> createState() => _BreakReminderBannerState();
}

class _BreakReminderBannerState extends State<BreakReminderBanner> {
  late final BreakClock _clock = widget.clock ?? BreakClock();
  bool _showing = false;
  int _left = 20;
  Timer? _countdown;

  DateTime get _now => (widget.now ?? DateTime.now)();

  @override
  void initState() {
    super.initState();
    widget.activity.addListener(_used);
  }

  @override
  void didUpdateWidget(BreakReminderBanner old) {
    super.didUpdateWidget(old);
    if (old.activity != widget.activity) {
      old.activity.removeListener(_used);
      widget.activity.addListener(_used);
    }
  }

  void _used() {
    if (_showing || !widget.enabled()) return;
    if (_clock.use(_now)) setState(() => _showing = true);
  }

  void _startCountdown() {
    _countdown?.cancel();
    setState(() => _left = 20);
    _countdown = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return t.cancel();
      setState(() => _left--);
      if (_left <= 0) _done();
    });
  }

  void _done() {
    _countdown?.cancel();
    _countdown = null;
    _clock.taken(_now);
    setState(() => _showing = false);
  }

  void _later() {
    _countdown?.cancel();
    _countdown = null;
    _clock.later(_now);
    setState(() => _showing = false);
  }

  @override
  void dispose() {
    widget.activity.removeListener(_used);
    _countdown?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_showing) return const SizedBox.shrink();
    final s = plusStrings(context);
    final c = context.colors;
    return Material(
      key: const Key('break-reminder'),
      color: c.tertiaryContainer,
      elevation: 3,
      borderRadius: BorderRadius.circular(Kx.rLg),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s12, Kx.s8, Kx.s12),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.visibility_outlined, color: c.onTertiaryContainer),
            const SizedBox(width: Kx.s12),
            Flexible(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(s['breakTitle'], style: context.text.titleMedium?.copyWith(color: c.onTertiaryContainer)),
                  Text(s['breakBody'], style: context.text.bodyMedium?.copyWith(color: c.onTertiaryContainer)),
                ],
              ),
            ),
            const SizedBox(width: Kx.s12),
            if (_countdown != null)
              Text(s.n('breakLeft', _left), key: const Key('break-left'), style: context.text.titleLarge?.copyWith(color: c.onTertiaryContainer))
            else
              FilledButton(key: const Key('break-start'), onPressed: _startCountdown, child: Text(s.n('breakLeft', 20))),
            TextButton(key: const Key('break-done'), onPressed: _done, child: Text(s['breakDone'])),
            TextButton(key: const Key('break-later'), onPressed: _later, child: Text(s['breakLater'])),
          ],
        ),
      ),
    );
  }
}
