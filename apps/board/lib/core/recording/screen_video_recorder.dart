import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Why a lesson is recorded without a video (the ink and voice are still recorded).
class VideoUnavailable implements Exception {
  const VideoUnavailable(this.reason);
  final String reason;
  @override
  String toString() => reason;
}

/// The lecture as a real video: what the board shows, and (on Android and macOS) the
/// microphone, written to an MP4/MOV file the class can watch anywhere. Kept behind this
/// interface so tests can fake it and boards that cannot record video still record ink.
abstract class ScreenVideoRecorder {
  /// Whether the video already carries the microphone. When false the teacher's voice is
  /// recorded separately and given to [stop] to be mixed in.
  bool get capturesMic;

  /// The file name extension and type of what [start] writes.
  String get extension;
  String get mime;

  /// Starts writing to [path]. Throws [VideoUnavailable] when the board cannot (no permission,
  /// the teacher declined the screen-capture prompt, no encoder).
  Future<void> start(String path);

  Future<void> pause();

  Future<void> resume();

  /// Stops. [voicePath] is the separately recorded voice to mix in (when not [capturesMic]).
  /// Returns whether a usable video was written.
  Future<bool> stop({String? voicePath});

  Future<void> dispose();
}

/// A board that does not record video.
class NoVideoRecorder implements ScreenVideoRecorder {
  const NoVideoRecorder([this.reason = 'this board cannot record video']);
  final String reason;
  @override
  bool get capturesMic => false;
  @override
  String get extension => 'mp4';
  @override
  String get mime => 'video/mp4';
  @override
  Future<void> start(String path) async => throw VideoUnavailable(reason);
  @override
  Future<void> pause() async {}
  @override
  Future<void> resume() async {}
  @override
  Future<bool> stop({String? voicePath}) async => false;
  @override
  Future<void> dispose() async {}
}

/// Smaller files are a failed capture (a container header alone is under a kilobyte).
const _minVideoBytes = 1024;

/// The board's own screen recorder, over the `zynetix/screen_recorder` channel:
/// Android: MediaProjection into MediaRecorder (H.264 + AAC in MP4, a foreground service while
/// recording; ScreenRecorder.kt). macOS: AVCaptureScreenInput of the board window with the
/// microphone into a QuickTime movie (MainFlutterWindow.swift).
///
///   start {path, maxSize, fps, bitrate} -> null, or error code denied/unavailable
///   pause / resume                       -> null
///   stop                                 -> bool (a file was written)
class PlatformScreenRecorder implements ScreenVideoRecorder {
  PlatformScreenRecorder({MethodChannel? channel, bool? macOS}) : _channel = channel ?? const MethodChannel('zynetix/screen_recorder'), _mac = macOS ?? (!kIsWeb && Platform.isMacOS);

  final MethodChannel _channel;
  final bool _mac;
  String? _path;

  @override
  bool get capturesMic => true;
  @override
  String get extension => _mac ? 'mov' : 'mp4';
  @override
  String get mime => _mac ? 'video/quicktime' : 'video/mp4';

  @override
  Future<void> start(String path) async {
    try {
      await _channel.invokeMethod<void>('start', {'path': path, 'maxSize': 1920, 'fps': 15, 'bitrate': 2500000});
      _path = path;
    } on PlatformException catch (e) {
      throw VideoUnavailable(e.code == 'denied' ? 'screen recording was not allowed' : (e.message ?? 'the screen recorder could not start'));
    } on MissingPluginException {
      throw const VideoUnavailable('this board cannot record video');
    }
  }

  @override
  Future<void> pause() async {
    try {
      await _channel.invokeMethod<void>('pause');
    } catch (_) {}
  }

  @override
  Future<void> resume() async {
    try {
      await _channel.invokeMethod<void>('resume');
    } catch (_) {}
  }

  @override
  Future<bool> stop({String? voicePath}) async {
    final path = _path;
    _path = null;
    if (path == null) return false;
    var ok = false;
    try {
      ok = await _channel.invokeMethod<bool>('stop') ?? false;
    } catch (_) {}
    if (!ok) return false;
    final f = File(path);
    return f.existsSync() && f.lengthSync() >= _minVideoBytes;
  }

  @override
  Future<void> dispose() async {
    if (_path != null) await stop();
  }
}

/// One picture of the board for [FrameVideoRecorder], or null to repeat the last one.
typedef BoardFrameSource = Future<ui.Image?> Function();

/// Starts a process (tests fake it).
typedef ProcessStarter = Future<Process> Function(String exe, List<String> args);

/// Windows and Linux panels: pictures of the board several times a second, piped as raw RGBA
/// into `ffmpeg` (H.264 MP4), then the separately recorded voice is mixed in. Boards without
/// ffmpeg on the PATH record ink and voice only.
class FrameVideoRecorder implements ScreenVideoRecorder {
  FrameVideoRecorder({required this.frames, this.width = 1280, this.height = 720, this.fps = 8, ProcessStarter? start, this.ffmpeg = 'ffmpeg'})
    : _startProcess = start ?? ((exe, args) => Process.start(exe, args));

  final BoardFrameSource frames;
  final int width;
  final int height;
  final int fps;
  final String ffmpeg;
  final ProcessStarter _startProcess;

  Process? _proc;
  Timer? _timer;
  String? _path;
  String? _silentPath;
  bool _paused = false;
  bool _busy = false;
  Uint8List? _last;
  int framesWritten = 0;

  @override
  bool get capturesMic => false;
  @override
  String get extension => 'mp4';
  @override
  String get mime => 'video/mp4';

  @override
  Future<void> start(String path) async {
    _path = path;
    _silentPath = '$path.video.mp4';
    try {
      _proc = await _startProcess(ffmpeg, [
        '-hide_banner', '-loglevel', 'error', '-y', //
        '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', '${width}x$height', '-r', '$fps', '-i', '-',
        '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-f', 'mp4', _silentPath!,
      ]);
    } on ProcessException {
      throw const VideoUnavailable('ffmpeg is not installed on this board');
    }
    unawaited(_proc!.stderr.drain<void>());
    unawaited(_proc!.stdout.drain<void>());
    unawaited(_capture());
    _timer = Timer.periodic(Duration(milliseconds: 1000 ~/ fps), (_) => _tick());
  }

  /// Writes a frame on every tick (the newest picture, or the last one again), so the video
  /// keeps real time even when taking a picture is slower than the frame rate.
  void _tick() {
    final proc = _proc;
    if (proc == null || _paused) return;
    final rgba = _last;
    if (rgba != null) {
      proc.stdin.add(rgba);
      framesWritten++;
    }
    if (!_busy) unawaited(_capture());
  }

  Future<void> _capture() async {
    _busy = true;
    try {
      final img = await frames();
      if (img != null) {
        _last = await _fit(img);
        img.dispose();
      }
    } catch (e) {
      debugPrint('Lecture video: frame skipped: $e');
    } finally {
      _busy = false;
    }
  }

  /// Draws [img] letterboxed into the video's fixed size (the board area can change).
  Future<Uint8List> _fit(ui.Image img) async {
    final rec = ui.PictureRecorder();
    final c = ui.Canvas(rec);
    c.drawRect(ui.Rect.fromLTWH(0, 0, width.toDouble(), height.toDouble()), ui.Paint()..color = const ui.Color(0xFF000000));
    final scale = (width / img.width) < (height / img.height) ? width / img.width : height / img.height;
    final w = img.width * scale, h = img.height * scale;
    c.drawImageRect(
      img,
      ui.Rect.fromLTWH(0, 0, img.width.toDouble(), img.height.toDouble()),
      ui.Rect.fromLTWH((width - w) / 2, (height - h) / 2, w, h),
      ui.Paint()..filterQuality = ui.FilterQuality.medium,
    );
    final out = await rec.endRecording().toImage(width, height);
    final bytes = await out.toByteData(format: ui.ImageByteFormat.rawRgba);
    out.dispose();
    return bytes!.buffer.asUint8List();
  }

  @override
  Future<void> pause() async => _paused = true;

  @override
  Future<void> resume() async => _paused = false;

  @override
  Future<bool> stop({String? voicePath}) async {
    _timer?.cancel();
    _timer = null;
    final proc = _proc, path = _path, silent = _silentPath;
    _proc = null;
    _path = null;
    if (proc == null || path == null || silent == null) return false;
    try {
      await proc.stdin.close();
      if (await proc.exitCode.timeout(const Duration(minutes: 2)) != 0) return false;
      if (voicePath != null && File(voicePath).existsSync()) {
        final mix = await _startProcess(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', silent, '-i', voicePath, '-c:v', 'copy', '-c:a', 'aac', '-shortest', '-movflags', '+faststart', '-f', 'mp4', path]);
        unawaited(mix.stderr.drain<void>());
        unawaited(mix.stdout.drain<void>());
        if (await mix.exitCode.timeout(const Duration(minutes: 5)) == 0) {
          _deleteQuietly(silent);
        } else {
          File(silent).renameSync(path);
        }
      } else {
        File(silent).renameSync(path);
      }
      final f = File(path);
      return f.existsSync() && f.lengthSync() >= _minVideoBytes;
    } catch (e) {
      debugPrint('Lecture video: could not finish: $e');
      return false;
    }
  }

  static void _deleteQuietly(String p) {
    try {
      File(p).deleteSync();
    } catch (_) {}
  }

  @override
  Future<void> dispose() async {
    _timer?.cancel();
    final proc = _proc;
    _proc = null;
    proc?.kill();
  }
}

/// The video recorder for this board: the native one on Android and macOS, frames into ffmpeg
/// on Windows and Linux (when [frames] can picture the board), else none.
ScreenVideoRecorder defaultScreenVideoRecorder({BoardFrameSource? frames}) {
  // Widget tests run on the host: never start a real screen recorder or ffmpeg there.
  if (kIsWeb || Platform.environment.containsKey('FLUTTER_TEST')) return const NoVideoRecorder();
  if (Platform.isAndroid || Platform.isMacOS) return PlatformScreenRecorder();
  if ((Platform.isWindows || Platform.isLinux) && frames != null) return FrameVideoRecorder(frames: frames);
  return const NoVideoRecorder();
}
