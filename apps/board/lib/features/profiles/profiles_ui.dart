import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api_client.dart';
import '../../core/board_controller.dart';
import '../../demo/demo.dart';
import '../../l10n/l10n.dart';
import '../board/chrome.dart';
import '../signin/sign_in_dialog.dart';
import 'profiles_controller.dart';

/// A number pad for PINs, big enough for a classroom panel: dots for the digits typed, 0–9,
/// delete and OK. [onSubmit] gets 4 to 6 digits; it may return an error to show.
class PinPad extends StatefulWidget {
  const PinPad({super.key, required this.title, required this.onSubmit, this.message});

  final String title;
  final Future<String?> Function(String pin) onSubmit;

  /// Shown under the dots before the first try (e.g. a hint).
  final String? message;

  @override
  State<PinPad> createState() => _PinPadState();
}

class _PinPadState extends State<PinPad> {
  String _pin = '';
  String? _error;
  bool _busy = false;

  void _type(String d) {
    if (_busy || _pin.length >= 6) return;
    setState(() {
      _pin += d;
      _error = null;
    });
  }

  void _delete() {
    if (_busy || _pin.isEmpty) return;
    setState(() => _pin = _pin.substring(0, _pin.length - 1));
  }

  Future<void> _submit() async {
    if (_busy || _pin.length < 4) return;
    setState(() => _busy = true);
    final error = await widget.onSubmit(_pin);
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = error;
      _pin = '';
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final l = context.l10n;
    Widget key(Widget child, VoidCallback? onTap, {Key? k}) => Padding(
      padding: const EdgeInsets.all(6),
      child: SizedBox(
        width: 84,
        height: 64,
        child: FilledButton.tonal(key: k, onPressed: onTap, style: FilledButton.styleFrom(shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Kx.rMd))), child: child),
      ),
    );
    Widget digit(String d) => key(Text(d, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w500)), () => _type(d), k: Key('pin-$d'));

    return Focus(
      autofocus: true,
      // Keyboards on Windows panels.
      onKeyEvent: (_, e) {
        if (e is! KeyDownEvent) return KeyEventResult.ignored;
        final ch = e.character;
        if (ch != null && RegExp(r'^\d$').hasMatch(ch)) {
          _type(ch);
        } else if (e.logicalKey == LogicalKeyboardKey.backspace) {
          _delete();
        } else if (e.logicalKey == LogicalKeyboardKey.enter || e.logicalKey == LogicalKeyboardKey.numpadEnter) {
          unawaited(_submit());
        } else {
          return KeyEventResult.ignored;
        }
        return KeyEventResult.handled;
      },
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(widget.title, style: context.text.titleLarge, textAlign: TextAlign.center),
          const SizedBox(height: Kx.s16),
          Row(
            key: const Key('pin-dots'),
            mainAxisSize: MainAxisSize.min,
            children: [
              for (var i = 0; i < 6; i++)
                Container(
                  margin: const EdgeInsets.symmetric(horizontal: 6),
                  width: 16,
                  height: 16,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: i < _pin.length ? c.primary : Colors.transparent,
                    border: Border.all(color: i < 4 || i < _pin.length ? c.outline : c.outlineVariant, width: 2),
                  ),
                ),
            ],
          ),
          SizedBox(
            height: 56,
            child: Center(
              child: _busy
                  ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 3))
                  : Text(
                      _error ?? widget.message ?? '',
                      key: const Key('pin-message'),
                      textAlign: TextAlign.center,
                      style: TextStyle(color: _error != null ? c.error : c.onSurfaceVariant),
                    ),
            ),
          ),
          for (final row in const [
            ['1', '2', '3'],
            ['4', '5', '6'],
            ['7', '8', '9'],
          ])
            Row(mainAxisSize: MainAxisSize.min, children: [for (final d in row) digit(d)]),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              key(const Icon(Icons.backspace_outlined), _pin.isEmpty ? null : _delete, k: const Key('pin-delete')),
              digit('0'),
              key(Text(l.ok, style: const TextStyle(fontSize: 18)), _pin.length >= 4 ? _submit : null, k: const Key('pin-ok')),
            ],
          ),
        ],
      ),
    );
  }
}

/// The words for an unlock that did not open the board.
String? unlockMessage(AppLocalizations l, UnlockResult r) => switch (r.outcome) {
  UnlockOutcome.ok => null,
  UnlockOutcome.wrong => r.attemptsLeft == null ? l.pinWrongNoCount : l.pinWrong(r.attemptsLeft!),
  UnlockOutcome.lockedOut => l.pinLockedOut,
  UnlockOutcome.noPin => l.pinNoPin,
  UnlockOutcome.needsNetwork => l.pinNeedsNetwork,
};

/// "Who is teaching?": the board's teachers to pick from, then their PIN; or a full sign-in
/// with the Teacher app ([onFullSignIn]). Closes itself when a profile opens.
class ProfileSwitcher extends StatefulWidget {
  const ProfileSwitcher({super.key, required this.profiles, required this.onFullSignIn, this.onDone});

  final ProfilesController profiles;
  final VoidCallback onFullSignIn;
  final VoidCallback? onDone;

  @override
  State<ProfileSwitcher> createState() => _ProfileSwitcherState();
}

class _ProfileSwitcherState extends State<ProfileSwitcher> {
  BoardProfile? _picked;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final picked = _picked;
    if (picked != null) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: IconButton(key: const Key('pin-back'), tooltip: l.close, onPressed: () => setState(() => _picked = null), icon: const Icon(Icons.arrow_back)),
          ),
          KxAvatar(name: picked.name, size: 64),
          const SizedBox(height: Kx.s12),
          PinPad(
            title: l.pinEnterFor(picked.name),
            onSubmit: (pin) async {
              final r = await widget.profiles.unlock(picked, pin);
              if (r.outcome == UnlockOutcome.ok) {
                widget.onDone?.call();
                return null;
              }
              return context.mounted ? unlockMessage(context.l10n, r) : null;
            },
          ),
        ],
      );
    }
    final list = widget.profiles.profiles;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(l.profilesTitle, style: context.text.headlineSmall),
        const SizedBox(height: 4),
        Text(l.profilesHint, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
        const SizedBox(height: Kx.s16),
        Wrap(
          spacing: Kx.s12,
          runSpacing: Kx.s12,
          children: [
            for (final p in list)
              SizedBox(
                width: 180,
                child: Card.outlined(
                  key: Key('profile-${p.userId}'),
                  clipBehavior: Clip.antiAlias,
                  child: InkWell(
                    onTap: p.locked || !p.pinSet ? null : () => setState(() => _picked = p),
                    child: Padding(
                      padding: const EdgeInsets.all(Kx.s16),
                      child: Column(
                        children: [
                          KxAvatar(name: p.name, size: 56),
                          const SizedBox(height: Kx.s8),
                          Text(p.name, textAlign: TextAlign.center, maxLines: 2, overflow: TextOverflow.ellipsis, style: context.text.titleSmall),
                          if (p.locked || !p.pinSet)
                            Padding(
                              padding: const EdgeInsets.only(top: 4),
                              child: Text(
                                p.locked ? l.profilesLocked : l.profilesNoPin,
                                style: context.text.labelSmall?.copyWith(color: p.locked ? c.error : c.onSurfaceVariant),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: Kx.s24),
        Align(
          alignment: Alignment.centerLeft,
          child: OutlinedButton.icon(
            key: const Key('profiles-full-sign-in'),
            onPressed: widget.onFullSignIn,
            icon: const Icon(Icons.qr_code_2),
            label: Text(l.profilesSignInFull),
          ),
        ),
      ],
    );
  }
}

/// Opens "Who is teaching?" when the board has teachers with PINs; otherwise straight to the
/// Teacher app sign-in ([fullSignIn]). The board screen's sign-in button calls this.
Future<void> showSignInChoice(BuildContext context, BoardController board, Future<void> Function() fullSignIn) async {
  if (!board.profiles.profiles.any((p) => p.pinSet && !p.locked)) return fullSignIn();
  var full = false;
  await showDialog<void>(
    context: context,
    builder: (dialog) => BoardChromeTheme(
      child: Dialog(
        key: const Key('profile-switcher'),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 820),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(Kx.s32),
            child: ListenableBuilder(
              listenable: board.profiles,
              builder: (_, _) => ProfileSwitcher(
                profiles: board.profiles,
                onFullSignIn: () {
                  full = true;
                  Navigator.pop(dialog);
                },
                onDone: () => Navigator.pop(dialog),
              ),
            ),
          ),
        ),
      ),
    ),
  );
  if (full && context.mounted) await fullSignIn();
}

/// Set (or change) the signed-in teacher's PIN: typed twice.
Future<bool> showSetPinDialog(BuildContext context, ProfilesController profiles) async {
  final saved = await showDialog<bool>(
    context: context,
    builder: (dialog) => BoardChromeTheme(child: Dialog(key: const Key('set-pin'), child: _SetPin(profiles: profiles))),
  );
  if (saved == true && context.mounted) showBoardMessage(context, context.l10n.pinSaved);
  return saved == true;
}

class _SetPin extends StatefulWidget {
  const _SetPin({required this.profiles});
  final ProfilesController profiles;

  @override
  State<_SetPin> createState() => _SetPinState();
}

class _SetPinState extends State<_SetPin> {
  String? _first;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Padding(
      padding: const EdgeInsets.all(Kx.s32),
      child: PinPad(
        key: ValueKey(_first == null),
        title: _first == null ? l.pinSetTitle : l.pinConfirm,
        message: _first == null ? l.pinSetHint : null,
        onSubmit: (pin) async {
          if (_first == null) {
            setState(() => _first = pin);
            return null;
          }
          if (pin != _first) {
            setState(() => _first = null);
            return l.pinMismatch;
          }
          try {
            await widget.profiles.setPin(pin);
            if (context.mounted) Navigator.pop(context, true);
            return null;
          } on ApiException catch (e) {
            setState(() => _first = null);
            return e.code == 'PROFILE_PIN_WEAK' ? l.pinWeak : apiErrorText(l, e);
          } catch (_) {
            setState(() => _first = null);
            return l.cloudUnreachableCheckOnline;
          }
        },
      ),
    );
  }
}

/// Wraps the board screen: notes every touch for the idle lock, covers the board with the lock
/// screen when [ProfilesController.locked], and offers a PIN to a teacher who signed in with the
/// Teacher app and has none on this board yet.
class ProfileLock extends StatefulWidget {
  const ProfileLock({super.key, required this.board, required this.child});

  final BoardController board;
  final Widget child;

  @override
  State<ProfileLock> createState() => _ProfileLockState();
}

class _ProfileLockState extends State<ProfileLock> {
  /// Sessions whose PIN offer the teacher answered ("Not now" or set).
  final Set<String> _offered = {};
  bool _switching = false;

  ProfilesController get _profiles => widget.board.profiles;

  /// The Teacher app sign-in from the lock screen; closes when the new class arrives.
  Future<void> _fullSignIn() async {
    final api = widget.board.api;
    if (api == null) return;
    final before = widget.board.session?.sessionId;
    await showDialog<void>(
      context: context,
      builder: (dialog) => BoardChromeTheme(
        child: ListenableBuilder(
          listenable: widget.board,
          builder: (_, child) {
            if (widget.board.session?.sessionId != before) {
              WidgetsBinding.instance.addPostFrameCallback((_) {
                if (dialog.mounted) Navigator.pop(dialog);
              });
            }
            return child!;
          },
          child: SignInDialog(api: api, boardName: widget.board.deviceName),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Listener(
      behavior: HitTestBehavior.translucent,
      onPointerDown: (_) => _profiles.activity(),
      child: ListenableBuilder(
        listenable: Listenable.merge([widget.board, _profiles]),
        builder: (context, _) {
          final s = widget.board.session;
          final offer = s != null && !_profiles.locked && !Demo.enabled && _profiles.canSetPin && !_offered.contains(s.sessionId) && _profiles.current?.pinSet != true;
          return Stack(
            children: [
              widget.child,
              if (offer) Positioned(left: 0, right: 0, bottom: 104, child: Center(child: _pinOffer(context, s.sessionId))),
              if (_profiles.locked && s != null) Positioned.fill(child: _lockScreen(context)),
            ],
          );
        },
      ),
    );
  }

  Widget _pinOffer(BuildContext context, String sessionId) {
    final l = context.l10n;
    return BoardChromeTheme(
      child: Card(
        key: const Key('pin-offer'),
        elevation: 6,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s8, Kx.s8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.pin_outlined),
              const SizedBox(width: Kx.s12),
              ConstrainedBox(constraints: const BoxConstraints(maxWidth: 420), child: Text(l.pinBanner)),
              const SizedBox(width: Kx.s12),
              TextButton(onPressed: () => setState(() => _offered.add(sessionId)), child: Text(l.notNow)),
              FilledButton(
                key: const Key('pin-offer-set'),
                onPressed: () async {
                  setState(() => _offered.add(sessionId));
                  await showSetPinDialog(context, _profiles);
                },
                child: Text(l.pinSetAction),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _lockScreen(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final s = widget.board.session!;
    final me = _profiles.current;
    return BoardChromeTheme(
      child: Material(
        key: const Key('profile-lock'),
        color: c.surface,
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(Kx.s32),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 820),
              child: _switching
                  ? ProfileSwitcher(
                      profiles: _profiles,
                      onFullSignIn: () {
                        setState(() => _switching = false);
                        unawaited(_fullSignIn());
                      },
                      onDone: () => setState(() => _switching = false),
                    )
                  : Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.lock_outline, size: 40, color: c.primary),
                        const SizedBox(height: Kx.s8),
                        Text(l.lockTitle, style: context.text.headlineSmall),
                        const SizedBox(height: 4),
                        Text(l.lockHint(s.teacherName), style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant), textAlign: TextAlign.center),
                        const SizedBox(height: Kx.s24),
                        if (me != null && me.pin != null)
                          PinPad(
                            title: l.pinEnterFor(s.teacherName),
                            onSubmit: (pin) async {
                              final r = await _profiles.unlock(me, pin);
                              return context.mounted ? unlockMessage(context.l10n, r) : null;
                            },
                          ),
                        const SizedBox(height: Kx.s24),
                        Wrap(
                          spacing: Kx.s12,
                          children: [
                            OutlinedButton.icon(
                              key: const Key('lock-switch'),
                              onPressed: () => setState(() => _switching = true),
                              icon: const Icon(Icons.switch_account_outlined),
                              label: Text(l.switchTeacher),
                            ),
                            TextButton.icon(
                              key: const Key('lock-sign-out'),
                              onPressed: () => unawaited(_profiles.signOut()),
                              icon: const Icon(Icons.logout),
                              label: Text(l.signOut),
                            ),
                          ],
                        ),
                      ],
                    ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Board settings → Lock when idle, and the signed-in teacher's PIN.
class ProfileSettingsSection extends StatelessWidget {
  const ProfileSettingsSection({super.key, required this.board});

  final BoardController board;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final profiles = board.profiles;
    return ListenableBuilder(
      listenable: profiles,
      builder: (context, _) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(l.idleLockTitle, style: context.text.titleSmall),
          const SizedBox(height: Kx.s4),
          Text(l.idleLockHint, style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant)),
          const SizedBox(height: Kx.s12),
          SegmentedButton<int>(
            key: const Key('idle-lock'),
            showSelectedIcon: false,
            segments: [
              ButtonSegment(value: 0, label: Text(l.idleOff)),
              for (final m in const [5, 10, 15, 30]) ButtonSegment(value: m, label: Text(l.minutesShort(m), key: Key('idle-$m'))),
            ],
            selected: {profiles.idleMinutes},
            onSelectionChanged: (s) => profiles.setIdleMinutes(s.single),
          ),
          if (profiles.canSetPin && !Demo.enabled) ...[
            const SizedBox(height: Kx.s12),
            OutlinedButton.icon(
              key: const Key('settings-set-pin'),
              onPressed: () => unawaited(showSetPinDialog(context, profiles)),
              icon: const Icon(Icons.pin_outlined),
              label: Text(profiles.current?.pinSet == true ? l.pinChangeAction : l.pinSetAction),
            ),
          ],
        ],
      ),
    );
  }
}
