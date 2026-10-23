import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';

import 'app_overlay.dart';
import 'panel_home.dart';
import 'panel_models.dart';
import 'updater.dart';

export 'app_overlay.dart';
export 'panel_home.dart';
export 'panel_models.dart';
export 'updater.dart';

/// The Zynetix panel platform on the board (docs/zynetix/BOARD_PLAN.md, W4): app updates rolled
/// out from the dashboard, the panel home's allow-listed apps, and writing over other apps.
class PanelController extends ChangeNotifier {
  PanelController({required this.updater, required this.home, AndroidAppOverlay? overlay, DesktopOverlayWindow? desktopWindow, ScreenGrabber? grabber})
    : overlay = overlay ?? AndroidAppOverlay(android: false),
      desktopWindow = desktopWindow ?? DesktopOverlayWindow(desktop: false),
      grabber = grabber ?? ScreenGrabber(os: 'none') {
    updater.addListener(notifyListeners);
    home.addListener(notifyListeners);
  }

  /// The platform's own pieces (Android or desktop) for the running app.
  factory PanelController.forPlatform({required OpenDownload open, required ReportUpdate report, Future<void> Function(String json)? saveHome, String? cachedHome}) {
    final android = !kIsWeb && Platform.isAndroid;
    return PanelController(
      updater: PanelUpdater(open: open, report: report, installer: android ? AndroidUpdateInstaller() : DesktopUpdateInstaller()),
      home: PanelHome(platform: MethodChannelLauncherPlatform(), save: saveHome, cached: PanelHome.decode(cachedHome)),
      overlay: AndroidAppOverlay(),
      desktopWindow: DesktopOverlayWindow(),
      grabber: ScreenGrabber(),
    );
  }

  final PanelUpdater updater;
  final PanelHome home;
  final AndroidAppOverlay overlay;
  final DesktopOverlayWindow desktopWindow;
  final ScreenGrabber grabber;

  /// "Write over apps" is offered here: Android panels and macOS/Windows boards.
  bool get canWriteOverApps => overlay.supported || desktopWindow.supported;

  /// The panel home (an app launcher) is offered on Android panels.
  bool get hasHome => home.platform.supported;

  /// The board config (`launcher`) or the health report's answer (`update`, `launcher`).
  Future<void> apply(Map<String, dynamic> config) async {
    if (config.containsKey('launcher')) await home.setAllowed(LauncherApp.listFrom(config['launcher']));
    if (config.containsKey('update')) await updater.onOffer(UpdateOffer.fromJson(config['update']));
  }

  @override
  void dispose() {
    updater.removeListener(notifyListeners);
    home.removeListener(notifyListeners);
    overlay.dispose();
    super.dispose();
  }
}
