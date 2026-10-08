import 'dart:async';
import 'dart:io' show Platform;

import 'package:battery_plus/battery_plus.dart';
import 'package:disk_space_plus/disk_space_plus.dart';
import 'package:flutter/foundation.dart';

import '../app_info.dart';

/// What the device itself can tell about its health (the rest comes from the app).
@immutable
class DeviceSnapshot {
  const DeviceSnapshot({required this.os, this.osVersion, this.storageFreeMb, this.storageTotalMb, this.batteryPercent, this.charging});

  final String os;
  final String? osVersion;
  final int? storageFreeMb;
  final int? storageTotalMb;

  /// Null on a panel with no battery.
  final int? batteryPercent;
  final bool? charging;
}

/// Reads the device's storage and battery. Anything the platform cannot tell stays null.
abstract class DeviceProbe {
  Future<DeviceSnapshot> read();
}

/// battery_plus and disk_space_plus (Android panels, Windows panels and OPS PCs).
class PluginDeviceProbe implements DeviceProbe {
  @override
  Future<DeviceSnapshot> read() async {
    int? free, total, level;
    bool? charging;
    try {
      final f = await DiskSpacePlus().getFreeDiskSpace;
      final t = await DiskSpacePlus().getTotalDiskSpace;
      free = f?.round();
      total = t?.round();
    } catch (e) {
      debugPrint('Storage not read: $e');
    }
    try {
      final b = Battery();
      level = await b.batteryLevel;
      final state = await b.batteryState;
      charging = state == BatteryState.charging || state == BatteryState.full;
      // A panel or PC without a battery reports nothing sensible.
      if (state == BatteryState.unknown) {
        level = null;
        charging = null;
      }
    } catch (_) {
      level = null;
      charging = null;
    }
    return DeviceSnapshot(
      os: Platform.operatingSystem,
      osVersion: Platform.operatingSystemVersion,
      storageFreeMb: free,
      storageTotalMb: total,
      batteryPercent: level,
      charging: charging,
    );
  }
}

/// What the app knows about itself for the report.
@immutable
class AppHealth {
  const AppHealth({required this.kiosk, this.currentClass, this.locked = false});

  /// 'on', 'off' or 'unknown'.
  final String kiosk;
  final String? currentClass;
  final bool locked;
}

/// Reports the board's health to KINETIX Cloud over its device token (POST /v1/devices/me/health):
/// when it connects and every few minutes after, so the IT console shows whether it is online,
/// its app version, OS, kiosk state, class, storage and battery.
class FleetAgent {
  FleetAgent({required this.send, required this.app, DeviceProbe? probe, this.interval = const Duration(minutes: 5)}) : probe = probe ?? PluginDeviceProbe();

  /// Posts the report body. Throws when offline; the next tick tries again.
  final Future<void> Function(Map<String, Object?> body) send;
  final AppHealth Function() app;
  final DeviceProbe probe;
  final Duration interval;

  Timer? _timer;
  bool _running = false;

  void start() {
    _timer?.cancel();
    _timer = Timer.periodic(interval, (_) => unawaited(reportNow()));
    unawaited(reportNow());
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
  }

  /// The report body now (also what the tests look at).
  Future<Map<String, Object?>> body() async {
    final d = await probe.read();
    final a = app();
    return {
      'os': d.os,
      if (d.osVersion != null) 'osVersion': _clip(d.osVersion!, 60),
      'appVersion': kBoardVersion,
      'kiosk': a.kiosk,
      if (d.storageFreeMb != null) 'storageFreeMb': d.storageFreeMb,
      if (d.storageTotalMb != null) 'storageTotalMb': d.storageTotalMb,
      if (d.batteryPercent != null) 'battery': {'percent': d.batteryPercent!.clamp(0, 100), 'charging': d.charging ?? false},
      if (a.currentClass != null) 'currentClass': _clip(a.currentClass!, 120),
      'locked': a.locked,
    };
  }

  Future<void> reportNow() async {
    if (_running) return;
    _running = true;
    try {
      await send(await body());
    } catch (e) {
      debugPrint('Health not reported: $e');
    } finally {
      _running = false;
    }
  }

  static String _clip(String s, int n) => s.length <= n ? s : s.substring(0, n);
}
