import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../realtime.dart';

/// The teacher's camera in a live or hybrid class: a preview tile on the board (so it is in the
/// lecture video too) and, while someone watches remotely, small JPEG pictures to them beside
/// the existing ink and class-audio stream (`live.camera`, a few a second).
///
/// - [on] is the teacher's choice; it starts off for every class and is turned off when the
///   class ends or goes off live. The server is told either way (`live.camera.state`) and audits it.
/// - Pictures go out only while [on], a tile is showing (it provides [grab]) and [viewers] > 0
///   (viewers allowed the class audio, from `live.viewers`); [sending] is true exactly then.
class TeacherCamera extends ChangeNotifier {
  TeacherCamera({required this.emit, this.interval = const Duration(milliseconds: 400)});

  /// Board → server, fire and forget.
  final void Function(String event, Object data) emit;
  final Duration interval;

  bool on = false;
  int viewers = 0;
  int sent = 0;

  Future<Uint8List?> Function()? _grab;
  Timer? _timer;
  int _seq = 0;
  bool _busy = false;
  bool _disposed = false;

  bool get sending => _timer != null;

  /// The tile's picture of the camera (JPEG), or null while there is no tile.
  set grab(Future<Uint8List?> Function()? g) {
    _grab = g;
    _sync();
  }

  void turnOn() {
    if (on) return;
    on = true;
    _seq = 0;
    emit(RealtimeEvents.liveCameraState, {'on': true});
    _sync();
    _notify();
  }

  void turnOff() {
    if (!on) return;
    on = false;
    emit(RealtimeEvents.liveCameraState, {'on': false});
    _sync();
    _notify();
  }

  /// The board reconnected: the camera state is told again.
  void reconnected() {
    if (on) emit(RealtimeEvents.liveCameraState, {'on': true});
  }

  void setViewers(int n) {
    if (n == viewers) return;
    viewers = n;
    _sync();
  }

  void _sync() {
    final want = on && viewers > 0 && _grab != null && !_disposed;
    if (want && _timer == null) {
      _timer = Timer.periodic(interval, (_) => unawaited(_tick()));
      _notify();
    } else if (!want && _timer != null) {
      _timer!.cancel();
      _timer = null;
      _notify();
    }
  }

  Future<void> _tick() async {
    final grab = _grab;
    if (_busy || grab == null || !sending) return;
    _busy = true;
    try {
      final jpeg = await grab();
      if (jpeg == null || jpeg.isEmpty || !sending) return;
      emit(RealtimeEvents.liveCamera, {'seq': _seq++, 'mime': 'image/jpeg', 'data': base64Encode(jpeg)});
      sent++;
    } catch (e) {
      debugPrint('Teacher camera: picture skipped: $e');
    } finally {
      _busy = false;
    }
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _timer?.cancel();
    _timer = null;
    super.dispose();
  }
}
