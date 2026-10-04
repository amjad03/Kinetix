import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import '../realtime.dart';
import '../recording/voice_recorder.dart' show VoiceUnavailable;
import 'mic_capture.dart';

/// Class audio for a live class: the teacher turns the board's microphone on, and students
/// watching in the Student App hear it (leaders too when the institution allows).
///
/// - [enabled] is the teacher's choice. It starts off for every class and is turned off when the
///   class ends; the server is told either way (`live.audio.state`) and audits it.
/// - The microphone is only captured while [enabled] and someone may listen ([listeners] > 0, from
///   `live.viewers`); [sending] is true exactly then, and the board shows "Mic on".
/// - Audio goes out as `live.audio` chunks of 200 ms: mono 16 kHz IMA ADPCM, base64
///   (see `LiveAudioCodec`), with `seq` counting from 0 each time audio is turned on.
class ClassAudio extends ChangeNotifier {
  ClassAudio({required MicCapture Function() mic, required this.request, required this.emit}) : _micFactory = mic;

  final MicCapture Function() _micFactory;

  /// Board → server with an ack (null when offline or no answer).
  final Future<Object?> Function(String event, Object data) request;

  /// Board → server, fire and forget.
  final void Function(String event, Object data) emit;

  /// Called with an English reason (as [VoiceUnavailable]) when class audio could not start or
  /// stopped working; audio is off again by then. `offline` when the server refused it.
  void Function(String reason)? onUnavailable;

  /// The teacher has class audio on.
  bool enabled = false;

  /// Viewers who may hear the class audio now.
  int listeners = 0;

  /// The microphone is being captured and sent.
  bool get sending => _sub != null;

  MicCapture? _mic;
  StreamSubscription<Uint8List>? _sub;
  PcmChunker _chunker = PcmChunker();
  AdpcmState _state = AdpcmState();
  int _seq = 0;
  Future<void> _work = Future.value();
  bool _disposed = false;

  /// Turns class audio on. Returns false (after [onUnavailable]) when it could not be.
  Future<bool> turnOn() async {
    if (enabled) return true;
    final mic = _mic ??= _micFactory();
    try {
      await mic.check();
    } on VoiceUnavailable catch (e) {
      onUnavailable?.call(e.reason);
      return false;
    }
    enabled = true;
    _seq = 0;
    _notify();
    final reply = await request(RealtimeEvents.liveAudioState, {'on': true});
    if (!enabled) return false; // turned off meanwhile
    if (reply is Map && reply['ok'] == false) {
      enabled = false;
      _notify();
      _sync();
      onUnavailable?.call('offline');
      return false;
    }
    // No reply (offline): stays on and is sent again when the board reconnects.
    _sync();
    return true;
  }

  /// Turns class audio off and stops the microphone.
  Future<void> turnOff() async {
    if (!enabled) return;
    enabled = false;
    _notify();
    _sync();
    await request(RealtimeEvents.liveAudioState, {'on': false});
  }

  /// The board (re)connected: the server forgets class audio when a board goes offline, so
  /// tell it again.
  void reconnected() {
    if (enabled) unawaited(request(RealtimeEvents.liveAudioState, {'on': true}));
  }

  void setListeners(int n) {
    if (n == listeners) return;
    listeners = n;
    _sync();
  }

  /// Starts or stops the capture to match [enabled] and [listeners], one change at a time.
  void _sync() => _work = _work.then((_) => _apply());

  bool get _want => enabled && listeners > 0 && !_disposed;

  Future<void> _apply() async {
    if (_want && _sub == null) {
      await _start();
    } else if (!_want && _sub != null) {
      await _stop();
    }
  }

  Future<void> _start() async {
    final mic = _mic ??= _micFactory();
    final Stream<Uint8List> stream;
    try {
      stream = await mic.start();
    } on VoiceUnavailable catch (e) {
      return _fail(e.reason);
    } catch (_) {
      return _fail('the microphone could not be started');
    }
    if (!_want) {
      await mic.stop();
      return;
    }
    _chunker = PcmChunker();
    _state = AdpcmState();
    _sub = stream.listen(
      _onBytes,
      onError: (Object _) => _failSoon('the microphone could not be started'),
      onDone: () => _failSoon('the microphone could not be started'),
    );
    _notify();
  }

  Future<void> _stop() async {
    final sub = _sub;
    _sub = null;
    _notify();
    // Not awaited: the microphone's stop below ends the stream anyway.
    unawaited(sub?.cancel());
    await _mic?.stop();
    _chunker.clear();
  }

  void _onBytes(Uint8List bytes) {
    for (final chunk in _chunker.add(bytes)) {
      if (!_want) return;
      emit(RealtimeEvents.liveAudio, {
        'seq': _seq++,
        'rate': LiveAudioCodec.sampleRate,
        'codec': 'ima-adpcm',
        'data': LiveAudioCodec.encodeBase64(chunk, _state),
      });
    }
  }

  /// The microphone stream broke while sending.
  void _failSoon(String reason) {
    if (_sub == null) return; // we stopped it
    _work = _work.then((_) async {
      if (_sub == null) return;
      await _stop();
      await _fail(reason);
    });
  }

  Future<void> _fail(String reason) async {
    final wasOn = enabled;
    enabled = false;
    _notify();
    if (wasOn) unawaited(request(RealtimeEvents.liveAudioState, {'on': false}));
    if (!_disposed) onUnavailable?.call(reason);
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    final sub = _sub;
    _sub = null;
    unawaited(sub?.cancel());
    final mic = _mic;
    unawaited(_work.then((_) async {
      await mic?.stop();
      await mic?.dispose();
    }));
    super.dispose();
  }
}
