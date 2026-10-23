import 'dart:async';
import 'dart:io' show Platform;

import 'package:battery_plus/battery_plus.dart';
import 'package:disk_space_plus/disk_space_plus.dart';
import 'package:flutter/foundation.dart';

import '../app_info.dart';
import 'system_stats.dart';

export 'system_stats.dart' show AiUsageMeter, SystemStats;

/// What the device itself can tell about its health (the rest comes from the app).
@immutable
class DeviceSnapshot {
  const DeviceSnapshot({required this.os, this.osVersion, this.storageFreeMb, this.storageTotalMb, this.batteryPercent, this.charging, this.stats = SystemStats.none});

  final String os;
  final String? osVersion;
  final int? storageFreeMb;
  final int? storageTotalMb;

  /// Null on a panel with no battery.
  final int? batteryPercent;
  final bool? charging;

  /// CPU/GPU/NPU/RAM load and temperatures, as far as the platform tells.
  final SystemStats stats;
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
      stats: await SystemStats.read(),
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
  FleetAgent({required this.send, required this.app, DeviceProbe? probe, this.interval = const Duration(minutes: 5), AiUsageMeter? ai, this.onAnswer})
    : probe = probe ?? PluginDeviceProbe(),
      ai = ai ?? AiUsageMeter.instance;

  /// Posts the report body and returns the server's answer. Throws when offline; the next tick tries again.
  final Future<Object?> Function(Map<String, Object?> body) send;

  /// The server's answer to a report: an app update to take and the panel home's apps (lib/core/panel).
  final void Function(Map<String, dynamic> answer)? onAnswer;
  final AppHealth Function() app;
  final DeviceProbe probe;
  final Duration interval;

  /// The AI answers since the last report (aiInferences, aiInferenceMs: their total time).
  final AiUsageMeter ai;

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
    final s = d.stats;
    final usage = ai.peek();
    final free = d.storageFreeMb, total = d.storageTotalMb;
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
      // Zynetix telemetry (docs/zynetix/PLAN.md: Boards/Edge devices): each only when known.
      if (s.cpuPercent != null) 'cpuPct': s.cpuPercent,
      if (s.gpuPercent != null) 'gpuPct': s.gpuPercent,
      if (s.npuPercent != null) 'npuPct': s.npuPercent,
      if (s.ramPercent != null) 'ramPct': s.ramPercent,
      if (s.cpuTempC != null) 'cpuTempC': s.cpuTempC,
      if (s.gpuTempC != null) 'gpuTempC': s.gpuTempC,
      if (free != null && total != null && total > 0) 'diskPct': ((total - free) * 100 / total).round().clamp(0, 100),
      'aiInferences': usage.inferences,
      'aiInferenceMs': usage.ms,
    };
  }

  Future<void> reportNow() async {
    if (_running) return;
    _running = true;
    try {
      final b = await body();
      final answer = await send(b);
      if (answer is Map) onAnswer?.call(answer.cast<String, dynamic>());
      ai.consume((inferences: b['aiInferences'] as int, ms: b['aiInferenceMs'] as int));
    } catch (e) {
      debugPrint('Health not reported: $e');
    } finally {
      _running = false;
    }
  }

  static String _clip(String s, int n) => s.length <= n ? s : s.substring(0, n);
}
