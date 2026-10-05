import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/kiosk/kiosk_controller.dart';
import '../../l10n/l10n.dart';

/// How long IT hold the clock (or the board name) to reach the kiosk exit. Long enough that
/// students do not find it by accident.
const kioskExitHold = Duration(seconds: 3);

String _time(BuildContext context, DateTime t) => DateFormat('h:mm a', dateLocaleFor(const Locale('en'))).format(t);

/// The discreet way out of kiosk mode: press and hold [child] for 3 seconds. Does nothing while
/// kiosk mode is off (except in demo builds, where the screens can be explored).
class KioskExitGesture extends StatelessWidget {
  const KioskExitGesture({super.key, required this.kiosk, required this.child});

  final KioskController kiosk;
  final Widget child;

  @override
  Widget build(BuildContext context) => RawGestureDetector(
    behavior: HitTestBehavior.opaque,
    gestures: {
      LongPressGestureRecognizer: GestureRecognizerFactoryWithHandlers<LongPressGestureRecognizer>(
        () => LongPressGestureRecognizer(duration: kioskExitHold),
        (r) => r.onLongPress = () {
          if (kiosk.demo || kiosk.enabled || kiosk.active) showKioskExitDialog(context, kiosk);
        },
      ),
    },
    child: child,
  );
}

Future<void> showKioskExitDialog(BuildContext context, KioskController kiosk) => showDialog<void>(
  context: context,
  builder: (_) => KioskExitDialog(kiosk: kiosk),
);

/// IT PIN → leave kiosk mode for 10 minutes, or open Android settings.
class KioskExitDialog extends StatefulWidget {
  const KioskExitDialog({super.key, required this.kiosk});

  final KioskController kiosk;

  @override
  State<KioskExitDialog> createState() => _KioskExitDialogState();
}

class _KioskExitDialogState extends State<KioskExitDialog> {
  final _pin = TextEditingController();
  bool _checking = false;
  bool _unlocked = false;
  String? _error;

  KioskController get kiosk => widget.kiosk;

  @override
  void dispose() {
    _pin.dispose();
    super.dispose();
  }

  Future<void> _check() async {
    if (_checking || _pin.text.isEmpty) return;
    setState(() {
      _checking = true;
      _error = null;
    });
    final r = await kiosk.checkPin(_pin.text);
    if (!mounted) return;
    final l = context.l10n;
    setState(() {
      _checking = false;
      _pin.clear();
      switch (r.check) {
        case PinCheck.ok:
          _unlocked = true;
        case PinCheck.wrong:
          _error = l.kioskWrongPin(r.attemptsLeft);
        case PinCheck.lockedOut:
          _error = l.kioskLockedOut(_time(context, r.lockedUntil!));
        case PinCheck.noPin:
          _error = l.kioskNoPin;
      }
    });
  }

  Future<void> _run(Future<void> Function() action) async {
    Navigator.pop(context);
    await action();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final hint = context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant);
    final close = TextButton(onPressed: () => Navigator.pop(context), child: Text(l.close));
    Widget body(String text, {Key? key}) => SizedBox(
      width: 460,
      child: Text(text, key: key, style: hint),
    );

    if (kiosk.demo) {
      return AlertDialog(
        scrollable: true,
        key: const Key('kiosk-dialog'),
        icon: const Icon(Icons.lock_outline),
        title: Text(l.kioskExitTitle),
        content: body(l.kioskDemoBody),
        actions: [
          close,
          if (kiosk.trial)
            FilledButton(key: const Key('kiosk-stop-trial'), onPressed: () => _run(kiosk.stopTrial), child: Text(l.kioskStopTrial))
          else
            FilledButton(key: const Key('kiosk-try'), onPressed: () => _run(kiosk.tryPinning), child: Text(l.kioskTry)),
        ],
      );
    }
    if (kiosk.paused) {
      return AlertDialog(
        scrollable: true,
        key: const Key('kiosk-dialog'),
        icon: const Icon(Icons.lock_open_outlined),
        title: Text(l.kioskTitle),
        content: body(l.kioskPausedBody(_time(context, kiosk.pausedUntil!))),
        actions: [
          close,
          FilledButton(key: const Key('kiosk-lock-now'), onPressed: () => _run(kiosk.resume), child: Text(l.kioskLockNow)),
        ],
      );
    }
    if (!kiosk.pinSet) {
      return AlertDialog(
        scrollable: true,
        key: const Key('kiosk-dialog'),
        icon: const Icon(Icons.lock_outline),
        title: Text(l.kioskExitTitle),
        content: body(l.kioskNoPin, key: const Key('kiosk-no-pin')),
        actions: [close],
      );
    }
    if (_unlocked) {
      return AlertDialog(
        scrollable: true,
        key: const Key('kiosk-dialog'),
        icon: const Icon(Icons.lock_open_outlined),
        title: Text(l.kioskExitTitle),
        content: body(l.kioskLeaveHint),
        actions: [
          close,
          if (kiosk.supported)
            OutlinedButton(key: const Key('kiosk-open-settings'), onPressed: () => _run(kiosk.openSystemSettings), child: Text(l.kioskOpenSettings)),
          FilledButton(key: const Key('kiosk-leave'), onPressed: () => _run(kiosk.leave), child: Text(l.kioskLeave)),
        ],
      );
    }
    final lockedOut = kiosk.isLockedOut;
    return AlertDialog(
      scrollable: true,
      key: const Key('kiosk-dialog'),
      icon: const Icon(Icons.lock_outline),
      title: Text(l.kioskExitTitle),
      content: SizedBox(
        width: 460,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(l.kioskEnterPin, style: hint),
            const SizedBox(height: Kx.s16),
            TextField(
              key: const Key('kiosk-pin'),
              controller: _pin,
              autofocus: true,
              obscureText: true,
              enabled: !_checking && !lockedOut,
              keyboardType: TextInputType.number,
              maxLength: 8,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: InputDecoration(
                labelText: l.kioskPinLabel,
                errorText: _error ?? (lockedOut ? l.kioskLockedOut(_time(context, kiosk.lockedUntil!)) : null),
                errorMaxLines: 3,
              ),
              onSubmitted: (_) => _check(),
            ),
          ],
        ),
      ),
      actions: [
        close,
        FilledButton(
          key: const Key('kiosk-unlock'),
          onPressed: _checking || lockedOut ? null : _check,
          child: _checking ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)) : Text(l.kioskUnlock),
        ),
      ],
    );
  }
}

/// Board settings → Kiosk mode: how this device is held, and in demo builds a way to try it.
class KioskSettingsSection extends StatelessWidget {
  const KioskSettingsSection({super.key, required this.kiosk});

  final KioskController kiosk;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: kiosk,
    builder: (context, _) {
      final l = context.l10n;
      final hint = context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant);
      final state = switch (kiosk.status.lock) {
        KioskLock.unsupported => l.kioskStatusUnsupported,
        KioskLock.locked => l.kioskStatusLocked,
        KioskLock.pinned => l.kioskStatusPinned,
        KioskLock.none when kiosk.paused => l.kioskStatusPaused(_time(context, kiosk.pausedUntil!)),
        KioskLock.none => l.kioskStatusOff,
      };
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(l.kioskTitle, style: context.text.titleSmall),
          const SizedBox(height: Kx.s4),
          Text(kiosk.demo ? l.kioskDemoHint : l.kioskSettingsHint, style: hint),
          const SizedBox(height: Kx.s8),
          Text(state, key: const Key('kiosk-status'), style: context.text.bodyMedium),
          if (kiosk.demo && kiosk.supported) ...[
            const SizedBox(height: Kx.s12),
            kiosk.trial
                ? OutlinedButton.icon(
                    key: const Key('kiosk-stop-trial'),
                    onPressed: kiosk.stopTrial,
                    icon: const Icon(Icons.lock_open_outlined),
                    label: Text(l.kioskStopTrial),
                  )
                : OutlinedButton.icon(
                    key: const Key('kiosk-try'),
                    onPressed: kiosk.tryPinning,
                    icon: const Icon(Icons.push_pin_outlined),
                    label: Text(l.kioskTry),
                  ),
          ],
        ],
      );
    },
  );
}
