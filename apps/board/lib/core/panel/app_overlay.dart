import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';

/// How starting "Write over apps" went.
enum OverlayStart {
  /// The pen is over the other apps (Android) or the board's window is now the overlay (desktop).
  started,

  /// Android: the board may not draw over other apps yet; the system setting was opened.
  needsPermission,

  /// Not on this device.
  unsupported,
}

/// Android's "Write over apps": OverlayService.kt draws the ink over any app and comes back with a
/// screenshot plus the ink (`captured`), which the board puts on a new page. The home button while
/// the board is the home app also arrives here (`home`).
class AndroidAppOverlay {
  AndroidAppOverlay({bool? android, MethodChannel? channel, Future<Uint8List> Function(String path)? readFile})
    : supported = android ?? (!kIsWeb && Platform.isAndroid),
      _channel = channel ?? const MethodChannel('kinetix/overlay'),
      _read = readFile ?? _readAndDelete {
    if (supported) _channel.setMethodCallHandler(_onCall);
  }

  final bool supported;
  final MethodChannel _channel;
  final Future<Uint8List> Function(String path) _read;
  final _captures = StreamController<Uint8List>.broadcast();
  final _home = StreamController<void>.broadcast();

  /// Screenshots with the teacher's ink, as PNG.
  Stream<Uint8List> get captures => _captures.stream;

  /// The home button was pressed while the board is the home app.
  Stream<void> get homePressed => _home.stream;

  static Future<Uint8List> _readAndDelete(String path) async {
    final f = File(path);
    final bytes = await f.readAsBytes();
    unawaited(f.delete().then((_) {}, onError: (_) {}));
    return bytes;
  }

  Future<Object?> _onCall(MethodCall call) async {
    switch (call.method) {
      case 'captured':
        final path = call.arguments as String?;
        if (path != null) _captures.add(await _read(path));
      case 'home':
        _home.add(null);
    }
    return null;
  }

  /// Starts the pen over other apps; with [screenshot] Android first asks to capture the screen.
  Future<OverlayStart> start({bool screenshot = true}) async {
    if (!supported) return OverlayStart.unsupported;
    if (await _channel.invokeMethod<bool>('canDraw') != true) {
      await _channel.invokeMethod<void>('requestPermission');
      return OverlayStart.needsPermission;
    }
    await _channel.invokeMethod<bool>('start', {'screenshot': screenshot});
    return OverlayStart.started;
  }

  Future<void> stop() async {
    if (supported) await _channel.invokeMethod<void>('stop');
  }

  /// A capture saved while the board was not running (it is opened by it), taken once.
  Future<void> collectPending() async {
    if (!supported) return;
    try {
      final path = await _channel.invokeMethod<String>('takeCapture');
      if (path != null) _captures.add(await _read(path));
    } on MissingPluginException {
      // Older native side.
    }
  }

  void dispose() {
    unawaited(_captures.close());
    unawaited(_home.close());
  }
}

/// The board's own window as a transparent, always-on-top, full-screen layer over the desktop
/// (macOS MainFlutterWindow.swift, Windows overlay_window.cpp): `kinetix/desktop_overlay`.
class DesktopOverlayWindow {
  DesktopOverlayWindow({bool? desktop, MethodChannel? channel})
    : supported = desktop ?? (!kIsWeb && (Platform.isMacOS || Platform.isWindows)),
      _channel = channel ?? const MethodChannel('kinetix/desktop_overlay');

  final bool supported;
  final MethodChannel _channel;

  /// Turns the window into the overlay. False when the window could not be made see-through:
  /// the overlay then shows a still of the screen to write on.
  Future<bool> enter() async {
    if (!supported) return false;
    try {
      return await _channel.invokeMethod<bool>('enter') ?? false;
    } on MissingPluginException {
      return false;
    }
  }

  /// Pass-through: clicks and touches go to the apps underneath (the pen is put down).
  Future<void> passThrough(bool on) async {
    if (!supported) return;
    try {
      await _channel.invokeMethod<void>('passThrough', {'on': on});
    } on MissingPluginException {
      // Nothing to change.
    }
  }

  /// Back to the board's normal window.
  Future<void> exit() async {
    if (!supported) return;
    try {
      await _channel.invokeMethod<void>('exit');
    } on MissingPluginException {
      // Nothing to restore.
    }
  }
}

/// Runs a program (tests replace it).
typedef RunProcess = Future<ProcessResult> Function(String executable, List<String> args);

/// A screenshot of the whole screen on the desktop, with the system's own tools: `screencapture`
/// on macOS (Screen Recording permission), PowerShell and .NET on Windows.
class ScreenGrabber {
  ScreenGrabber({RunProcess? run, Future<Directory> Function()? temp, String? os})
    : _run = run ?? Process.run,
      _temp = temp ?? getTemporaryDirectory,
      _os = os ?? (kIsWeb ? 'web' : Platform.operatingSystem);

  final RunProcess _run;
  final Future<Directory> Function() _temp;
  final String _os;

  bool get supported => _os == 'macos' || _os == 'windows';

  static const _windowsScript =
      r"Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $b=[System.Windows.Forms.SystemInformation]::VirtualScreen; $i=New-Object System.Drawing.Bitmap $b.Width,$b.Height; $g=[System.Drawing.Graphics]::FromImage($i); $g.CopyFromScreen($b.Left,$b.Top,0,0,$i.Size); $i.Save($args[0],[System.Drawing.Imaging.ImageFormat]::Png)";

  /// PNG bytes of the screen, or null when it could not be taken.
  Future<Uint8List?> grab() async {
    if (!supported) return null;
    final file = File('${(await _temp()).path}/zynetix-screen-${DateTime.now().microsecondsSinceEpoch}.png');
    try {
      final r = _os == 'macos'
          ? await _run('screencapture', ['-x', '-t', 'png', file.path])
          : await _run('powershell', ['-NoProfile', '-NonInteractive', '-Command', '& {$_windowsScript}', file.path]);
      if (r.exitCode != 0 || !await file.exists()) return null;
      final bytes = await file.readAsBytes();
      return bytes.isEmpty ? null : bytes;
    } catch (e) {
      debugPrint('Screen not captured: $e');
      return null;
    } finally {
      if (await file.exists()) await file.delete();
    }
  }
}
