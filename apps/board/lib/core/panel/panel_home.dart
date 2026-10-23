import 'dart:convert';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import 'panel_models.dart';

/// The panel's apps (Android): what is installed, opening one, and letting the allow-listed ones
/// run while the board holds the panel in kiosk mode.
abstract class LauncherPlatform {
  bool get supported;
  Future<List<InstalledApp>> installed();
  Future<bool> launch(String package);

  /// As device owner in kiosk mode: only these apps (and the board) may run.
  Future<bool> setAllowed(List<String> packages);
}

/// Android: the `kinetix/panel` channel (PanelBridge.kt). Elsewhere nothing is supported.
class MethodChannelLauncherPlatform implements LauncherPlatform {
  MethodChannelLauncherPlatform({bool? android, MethodChannel? channel}) : _android = android ?? (!kIsWeb && Platform.isAndroid), _channel = channel ?? const MethodChannel('kinetix/panel');

  final bool _android;
  final MethodChannel _channel;

  @override
  bool get supported => _android;

  @override
  Future<List<InstalledApp>> installed() async {
    if (!_android) return const [];
    try {
      final list = await _channel.invokeListMethod<Object?>('installedApps') ?? const [];
      return [
        for (final m in list)
          if (m is Map && m['package'] is String) InstalledApp(package: m['package'] as String, label: (m['label'] as String?) ?? m['package'] as String, icon: m['icon'] as Uint8List?),
      ];
    } on MissingPluginException {
      return const [];
    }
  }

  @override
  Future<bool> launch(String package) async => _android && (await _channel.invokeMethod<bool>('launchApp', {'package': package}) ?? false);

  @override
  Future<bool> setAllowed(List<String> packages) async {
    if (!_android) return false;
    try {
      return await _channel.invokeMethod<bool>('setAllowedApps', {'packages': packages}) ?? false;
    } on MissingPluginException {
      return false;
    }
  }
}

/// The panel home: the Zynetix board as the main tile and the apps the admin allow-listed in the
/// dashboard (Panel home), for the institution or this board. In kiosk mode only those apps show
/// and only those may run; outside it IT also sees every installed app.
class PanelHome extends ChangeNotifier {
  PanelHome({required this.platform, this.save, List<LauncherApp> cached = const []}) : _allowed = cached;

  final LauncherPlatform platform;

  /// Keeps the list for offline starts (DeviceStore setting `panelHome`).
  final Future<void> Function(String json)? save;

  List<LauncherApp> _allowed;
  List<InstalledApp> _installed = const [];
  bool _kiosk = false;

  List<LauncherApp> get allowed => _allowed;
  List<InstalledApp> get installed => _installed;
  bool get kiosk => _kiosk;

  static List<LauncherApp> decode(String? json) {
    if (json == null) return const [];
    try {
      return LauncherApp.listFrom(jsonDecode(json));
    } catch (_) {
      return const [];
    }
  }

  /// The allow-listed apps that are installed, in the admin's order, with the system's label and
  /// icon when the admin gave none.
  List<({LauncherApp app, InstalledApp? installed})> get tiles {
    final byPackage = {for (final a in _installed) a.package: a};
    return [
      for (final a in _allowed)
        if (!platform.supported || byPackage.containsKey(a.package)) (app: a, installed: byPackage[a.package]),
    ];
  }

  /// Installed apps that are not on the list: shown to IT only outside kiosk mode.
  List<InstalledApp> get others => _kiosk ? const [] : [for (final a in _installed) if (!_allowed.any((x) => x.package == a.package)) a];

  Future<void> refreshInstalled() async {
    _installed = await platform.installed();
    notifyListeners();
  }

  /// The dashboard's list (from the board config or the health report's answer).
  Future<void> setAllowed(List<LauncherApp> apps) async {
    if (listEquals(apps, _allowed)) return;
    _allowed = apps;
    notifyListeners();
    await save?.call(jsonEncode([for (final a in apps) a.toJson()]));
    if (_kiosk) await platform.setAllowed([for (final a in apps) a.package]);
  }

  /// Kiosk mode turned on or off: the allow-list becomes the lock task packages.
  Future<void> setKiosk(bool on) async {
    if (on == _kiosk) return;
    _kiosk = on;
    notifyListeners();
    if (on) await platform.setAllowed([for (final a in _allowed) a.package]);
  }

  /// Opens an app; in kiosk mode only an allow-listed one.
  Future<bool> launch(String package) async {
    if (_kiosk && !_allowed.any((a) => a.package == package)) return false;
    return platform.launch(package);
  }
}

/// A panel for tests: [apps] are installed; [launched] and [allowedCalls] record what the board did.
class FakeLauncherPlatform implements LauncherPlatform {
  FakeLauncherPlatform({this.apps = const [], this.supported = true});

  List<InstalledApp> apps;
  @override
  bool supported;
  final launched = <String>[];
  final allowedCalls = <List<String>>[];

  @override
  Future<List<InstalledApp>> installed() async => apps;

  @override
  Future<bool> launch(String package) async {
    launched.add(package);
    return true;
  }

  @override
  Future<bool> setAllowed(List<String> packages) async {
    allowedCalls.add(packages);
    return true;
  }
}
