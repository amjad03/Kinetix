import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../device_store.dart';
import 'kiosk_pin.dart';
import 'kiosk_platform.dart';

export 'kiosk_pin.dart' show KioskPin;
export 'kiosk_platform.dart';

/// The institution's kiosk policy (KINETIX ERP → Settings → Board kiosk mode), from
/// GET /v1/devices/me/config. Kept on the board so it applies, and the PIN works, offline.
@immutable
class KioskPolicy {
  const KioskPolicy({required this.enabled, this.pin});

  final bool enabled;

  /// Null until the institution sets an IT PIN.
  final KioskPin? pin;

  /// The `kiosk` object of the board config.
  factory KioskPolicy.fromConfig(Map<String, dynamic> j) {
    final pin = j['pinHash'] is String && j['pinSalt'] is String
        ? KioskPin(
            algo: j['algo'] as String? ?? '',
            iterations: (j['iterations'] as num?)?.toInt() ?? 0,
            salt: j['pinSalt'] as String,
            hash: j['pinHash'] as String,
          )
        : null;
    return KioskPolicy(enabled: j['enabled'] as bool? ?? true, pin: pin);
  }

  Map<String, dynamic> toJson() => {'enabled': enabled, 'pin': pin?.toJson()};

  static KioskPolicy? decode(String? s) {
    if (s == null) return null;
    try {
      final j = jsonDecode(s) as Map<String, dynamic>;
      return KioskPolicy(enabled: j['enabled'] as bool? ?? true, pin: KioskPin.fromJson(j['pin']));
    } catch (_) {
      return null;
    }
  }
}

enum PinCheck { ok, wrong, lockedOut, noPin }

@immutable
class PinCheckResult {
  const PinCheckResult(this.check, {this.attemptsLeft = 0, this.lockedUntil});
  final PinCheck check;
  final int attemptsLeft;
  final DateTime? lockedUntil;
}

/// Kiosk mode: keeps students in the board app and brings it back after a power cut
/// (docs/hardware/kiosk-mode.md).
///
/// On at start when the institution's cached policy says so (never in demo builds), and again
/// whenever a new policy arrives. IT leave it with the IT PIN, for [leaveFor] at most: the board
/// locks itself again after that, or when it next starts. [maxAttempts] wrong PINs in a row lock
/// the PIN out for [lockoutFor], also across restarts.
class KioskController extends ChangeNotifier {
  KioskController({
    KioskPlatform? platform,
    DeviceStore? store,
    DateTime Function()? now,
    Future<bool> Function(String pin, KioskPin p)? verify,
    this.leaveFor = const Duration(minutes: 10),
    this.lockoutFor = const Duration(minutes: 5),
    this.maxAttempts = 5,
  }) : platform = platform ?? MethodChannelKioskPlatform(),
       _store = store ?? DeviceStore(),
       _now = now ?? DateTime.now,
       _verify = verify ?? verifyKioskPin;

  final KioskPlatform platform;
  final DeviceStore _store;
  final DateTime Function() _now;
  final Future<bool> Function(String, KioskPin) _verify;
  final Duration leaveFor;
  final Duration lockoutFor;
  final int maxAttempts;

  static const _policyKey = 'kioskPolicy';
  static const _lockoutKey = 'kioskLockout';

  /// Null until the board has heard from its institution (a board that was never enrolled is
  /// never locked: there would be no PIN to get out).
  KioskPolicy? policy;

  KioskStatus status = KioskStatus.none;

  /// Demo builds: never locked by policy; [tryPinning] shows what it is like.
  bool demo = false;

  /// A demo "Try kiosk" is on.
  bool trial = false;

  /// IT left kiosk mode with the PIN until then.
  DateTime? pausedUntil;

  int failures = 0;
  DateTime? lockedUntil;

  DateTime? _authorisedUntil;
  Timer? _resumeTimer;
  Future<void> _applying = Future.value();
  bool _disposed = false;

  /// The institution wants this board locked.
  bool get enabled => !demo && (policy?.enabled ?? false);
  bool get paused => pausedUntil != null;
  bool get pinSet => policy?.pin != null;
  bool get supported => status.lock != KioskLock.unsupported;
  bool get active => status.active;

  /// Whether the board should be locked now.
  bool get wanted => trial || (enabled && !paused);

  /// The PIN is locked out now (too many wrong attempts).
  bool get isLockedOut => lockedUntil != null && _now().isBefore(lockedUntil!);

  /// Reads the cached policy and locks the board if it says so. [demo]: a demo build.
  Future<void> start({bool demo = false}) async {
    this.demo = demo;
    if (!demo) {
      try {
        final cached = KioskPolicy.decode(await _store.setting(_policyKey));
        policy ??= cached; // a fresher one may have arrived meanwhile
        final l = jsonDecode(await _store.setting(_lockoutKey) ?? '{}') as Map<String, dynamic>;
        failures = (l['failures'] as num?)?.toInt() ?? 0;
        lockedUntil = DateTime.tryParse(l['until'] as String? ?? '');
      } catch (e) {
        debugPrint('Kiosk settings unreadable: $e');
      }
    }
    await refresh();
  }

  /// A policy from the institution (on start, after enrolment, on every reconnect).
  Future<void> applyPolicy(KioskPolicy p) async {
    if (demo) return;
    policy = p;
    try {
      await _store.setSetting(_policyKey, jsonEncode(p.toJson()));
    } catch (e) {
      debugPrint('Kiosk policy not saved: $e');
    }
    await _apply();
  }

  /// Asks the system how the device is held (the app came back to the front, the user may
  /// have unpinned it) and locks it again if it should be.
  Future<void> refresh() async {
    try {
      status = await platform.status();
    } catch (e) {
      debugPrint('Kiosk status unavailable: $e');
    }
    await _apply();
  }

  /// Locks or unlocks to match [wanted]. Calls run one after another.
  Future<void> _apply() => _applying = _applying.then((_) async {
    if (_disposed || !supported) return;
    try {
      if (wanted && !active) {
        status = await platform.enter();
      } else if (!wanted && active) {
        // Paused (or the demo trial ended while the policy is on): still open by itself after a reboot.
        status = await platform.exit(keepBootLaunch: enabled);
      }
    } catch (e) {
      debugPrint('Kiosk mode not changed: $e');
    }
    if (!_disposed) notifyListeners();
  });

  /// Checks the IT PIN. A correct PIN allows [leave] and [openSystemSettings] for a minute.
  Future<PinCheckResult> checkPin(String pin) async {
    final p = policy?.pin;
    if (p == null) return const PinCheckResult(PinCheck.noPin);
    if (isLockedOut) return PinCheckResult(PinCheck.lockedOut, lockedUntil: lockedUntil);
    final ok = await _verify(pin, p);
    if (ok) {
      failures = 0;
      lockedUntil = null;
      _authorisedUntil = _now().add(const Duration(minutes: 1));
    } else if (++failures >= maxAttempts) {
      failures = 0;
      lockedUntil = _now().add(lockoutFor);
    }
    unawaited(_saveLockout());
    notifyListeners();
    if (ok) return const PinCheckResult(PinCheck.ok);
    if (lockedUntil != null) return PinCheckResult(PinCheck.lockedOut, lockedUntil: lockedUntil);
    return PinCheckResult(PinCheck.wrong, attemptsLeft: maxAttempts - failures);
  }

  Future<void> _saveLockout() async {
    try {
      await _store.setSetting(_lockoutKey, jsonEncode({'failures': failures, 'until': lockedUntil?.toIso8601String()}));
    } catch (_) {}
  }

  bool get _authorised => demo || (_authorisedUntil != null && _now().isBefore(_authorisedUntil!));

  /// Leaves kiosk mode for [leaveFor] (after a correct PIN). It locks again by itself.
  Future<void> leave() async {
    if (!_authorised) throw StateError('Enter the IT PIN first');
    _authorisedUntil = null;
    if (demo) {
      trial = false;
    } else {
      pausedUntil = _now().add(leaveFor);
      _resumeTimer?.cancel();
      _resumeTimer = Timer(leaveFor, () => unawaited(resume()));
    }
    await _apply();
  }

  /// Ends a pause early (or when its time is up).
  Future<void> resume() async {
    _resumeTimer?.cancel();
    pausedUntil = null;
    await _apply();
  }

  /// Leaves kiosk mode (as [leave]) and opens Android settings for IT.
  Future<void> openSystemSettings() async {
    await leave();
    await platform.openSystemSettings();
  }

  /// Demo builds: screen pinning, to show what kiosk mode is like on a tester's own device.
  Future<void> tryPinning() async {
    if (!demo) return;
    trial = true;
    await _apply();
  }

  Future<void> stopTrial() async {
    trial = false;
    await _apply();
  }

  @override
  void dispose() {
    _disposed = true;
    _resumeTimer?.cancel();
    super.dispose();
  }
}
