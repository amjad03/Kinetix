import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// How the device is held in the board app (docs/hardware/kiosk-mode.md).
enum KioskLock {
  /// Not locked.
  none,

  /// Android screen pinning: the user confirmed a system prompt and can unpin with a key
  /// combination. What a board gets when it is not the device owner (or allowed by an MDM).
  pinned,

  /// Android lock task mode as device owner (or allowed by an MDM): no way out but the IT PIN.
  locked,

  /// No kiosk API here (Windows: Assigned Access does it; Linux, web, tests).
  unsupported,
}

@immutable
class KioskStatus {
  const KioskStatus({required this.deviceOwner, required this.lock});

  static const unsupported = KioskStatus(deviceOwner: false, lock: KioskLock.unsupported);
  static const none = KioskStatus(deviceOwner: false, lock: KioskLock.none);

  /// The board app is this device's owner (provisioned by adb or as DPC).
  final bool deviceOwner;
  final KioskLock lock;

  bool get active => lock == KioskLock.pinned || lock == KioskLock.locked;

  static KioskStatus fromMap(Map<Object?, Object?>? m) =>
      KioskStatus(deviceOwner: m?['deviceOwner'] == true, lock: KioskLock.values.asNameMap()[m?['lockTask']] ?? KioskLock.none);

  @override
  bool operator ==(Object other) => other is KioskStatus && other.deviceOwner == deviceOwner && other.lock == lock;

  @override
  int get hashCode => Object.hash(deviceOwner, lock);

  @override
  String toString() => 'KioskStatus(deviceOwner: $deviceOwner, lock: ${lock.name})';
}

/// The operating system's side of kiosk mode.
abstract class KioskPlatform {
  Future<KioskStatus> status();

  /// Locks the device to the board (screen pinning when not allowed to lock fully).
  Future<KioskStatus> enter();

  /// Unlocks. [keepBootLaunch]: kiosk mode is only paused, so the board still opens by itself
  /// after a reboot.
  Future<KioskStatus> exit({required bool keepBootLaunch});

  /// Android's Settings app, for IT (only after the IT PIN, with kiosk mode paused).
  Future<void> openSystemSettings();
}

/// Android: the `kinetix/kiosk` channel in MainActivity.kt. Elsewhere: [KioskStatus.unsupported]
/// (Windows boards use Assigned Access, see docs/hardware/kiosk-mode.md).
class MethodChannelKioskPlatform implements KioskPlatform {
  MethodChannelKioskPlatform({bool? android, MethodChannel? channel, Future<void> Function(bool on)? immersive})
    : _android = android ?? (!kIsWeb && Platform.isAndroid),
      _channel = channel ?? const MethodChannel('kinetix/kiosk'),
      _immersive = immersive ?? _systemImmersive;

  final bool _android;
  final MethodChannel _channel;
  final Future<void> Function(bool on) _immersive;

  /// Full screen while locked: the system bars come back only for a moment after a swipe.
  static Future<void> _systemImmersive(bool on) => SystemChrome.setEnabledSystemUIMode(on ? SystemUiMode.immersiveSticky : SystemUiMode.edgeToEdge);

  Future<KioskStatus> _call(String method, [Map<String, Object?>? args]) async {
    if (!_android) return KioskStatus.unsupported;
    try {
      return KioskStatus.fromMap(await _channel.invokeMapMethod<Object?, Object?>(method, args));
    } on MissingPluginException {
      return KioskStatus.unsupported;
    }
  }

  @override
  Future<KioskStatus> status() => _call('status');

  @override
  Future<KioskStatus> enter() async {
    final s = await _call('enter');
    if (s.active) await _immersive(true);
    return s;
  }

  @override
  Future<KioskStatus> exit({required bool keepBootLaunch}) async {
    final s = await _call('exit', {'keepBootLaunch': keepBootLaunch});
    if (_android) await _immersive(false);
    return s;
  }

  @override
  Future<void> openSystemSettings() async {
    if (_android) await _channel.invokeMethod<void>('openSystemSettings');
  }
}

/// A device for tests and screenshots: [enter] locks fully when [deviceOwner], else pins.
class FakeKioskPlatform implements KioskPlatform {
  FakeKioskPlatform({this.deviceOwner = false, this.supported = true});

  bool deviceOwner;
  bool supported;
  KioskLock lock = KioskLock.none;
  bool bootLaunch = false;
  final List<String> calls = [];

  KioskStatus get _status => supported ? KioskStatus(deviceOwner: deviceOwner, lock: lock) : KioskStatus.unsupported;

  @override
  Future<KioskStatus> status() async {
    calls.add('status');
    return _status;
  }

  @override
  Future<KioskStatus> enter() async {
    calls.add('enter');
    if (supported) {
      lock = deviceOwner ? KioskLock.locked : KioskLock.pinned;
      bootLaunch = true;
    }
    return _status;
  }

  @override
  Future<KioskStatus> exit({required bool keepBootLaunch}) async {
    calls.add('exit');
    if (supported) {
      lock = KioskLock.none;
      bootLaunch = keepBootLaunch;
    }
    return _status;
  }

  @override
  Future<void> openSystemSettings() async => calls.add('openSystemSettings');
}
