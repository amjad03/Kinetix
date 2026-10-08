import 'dart:async';

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/board_controller.dart';
import '../../core/kiosk/kiosk_controller.dart' show PinCheck;
import '../../l10n/feature_strings.dart';

/// The lock screen's words.
FeatureStrings deviceLockStrings(String lang) => FeatureStrings(lang, deviceLockStringTable);

const deviceLockStringTable = <String, Map<String, String>>{
  'en': {
    'title': 'This board is locked',
    'body': 'IT locked this board. It unlocks from the KINETIX ERP device console, or with the IT PIN.',
    'pin': 'IT PIN',
    'unlock': 'Unlock',
    'wrong': 'That PIN is not right.',
    'lockedOut': 'Too many wrong PINs. Try again in a few minutes.',
  },
  'hi': {
    'title': 'यह बोर्ड लॉक है',
    'body': 'IT ने यह बोर्ड लॉक किया है। यह KINETIX ERP के डिवाइस कंसोल से, या IT PIN से अनलॉक होता है।',
    'pin': 'IT PIN',
    'unlock': 'अनलॉक करें',
    'wrong': 'PIN सही नहीं है।',
    'lockedOut': 'बहुत बार गलत PIN। कुछ मिनट बाद फिर कोशिश करें।',
  },
  'kn': {
    'title': 'ಈ ಬೋರ್ಡ್ ಲಾಕ್ ಆಗಿದೆ',
    'body': 'IT ಈ ಬೋರ್ಡ್ ಅನ್ನು ಲಾಕ್ ಮಾಡಿದೆ. KINETIX ERP ಸಾಧನ ಕನ್ಸೋಲ್‌ನಿಂದ ಅಥವಾ IT PIN ನಿಂದ ಅನ್‌ಲಾಕ್ ಮಾಡಬಹುದು.',
    'pin': 'IT PIN',
    'unlock': 'ಅನ್‌ಲಾಕ್ ಮಾಡಿ',
    'wrong': 'PIN ಸರಿಯಿಲ್ಲ.',
    'lockedOut': 'ತುಂಬಾ ತಪ್ಪು PIN ಗಳು. ಕೆಲವು ನಿಮಿಷಗಳ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
  },
};

/// Covers the whole board with a lock screen while IT has it locked (device console). Over the
/// board, under emergency announcements. Unlocks remotely, or with the IT PIN when one is set.
class DeviceLockGate extends StatelessWidget {
  const DeviceLockGate({super.key, required this.board, required this.child});

  final BoardController board;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (!board.deviceLocked) return child;
    return Stack(
      children: [
        ExcludeSemantics(child: AbsorbPointer(child: child)),
        Positioned.fill(child: _LockScreen(board: board)),
      ],
    );
  }
}

class _LockScreen extends StatefulWidget {
  const _LockScreen({required this.board});

  final BoardController board;

  @override
  State<_LockScreen> createState() => _LockScreenState();
}

class _LockScreenState extends State<_LockScreen> {
  final _pin = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _pin.dispose();
    super.dispose();
  }

  Future<void> _unlock(FeatureStrings s) async {
    final r = await widget.board.kiosk.checkPin(_pin.text);
    if (!mounted) return;
    if (r.check == PinCheck.ok) {
      await widget.board.setDeviceLocked(false);
      return;
    }
    _pin.clear();
    setState(() => _error = r.check == PinCheck.lockedOut ? s['lockedOut'] : s['wrong']);
  }

  @override
  Widget build(BuildContext context) {
    final s = deviceLockStrings(boardLang(context));
    final c = context.colors;
    return Material(
      key: const Key('device-lock'),
      color: c.surface,
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 440),
          child: Padding(
            padding: const EdgeInsets.all(Kx.s24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.lock_outline, size: 72, color: c.primary),
                const SizedBox(height: Kx.s16),
                Text(s['title'], style: context.text.headlineSmall, textAlign: TextAlign.center),
                const SizedBox(height: Kx.s8),
                Text(s['body'], textAlign: TextAlign.center),
                if (widget.board.kiosk.pinSet) ...[
                  const SizedBox(height: Kx.s24),
                  TextField(
                    key: const Key('device-lock-pin'),
                    controller: _pin,
                    obscureText: true,
                    keyboardType: TextInputType.number,
                    decoration: InputDecoration(labelText: s['pin'], errorText: _error, border: const OutlineInputBorder()),
                    onSubmitted: (_) => unawaited(_unlock(s)),
                  ),
                  const SizedBox(height: Kx.s12),
                  FilledButton(key: const Key('device-lock-unlock'), onPressed: () => unawaited(_unlock(s)), child: Text(s['unlock'])),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
