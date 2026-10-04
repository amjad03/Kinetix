import 'dart:async';
import 'dart:collection';
import 'dart:io' show Platform;
import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:flutter_pcm_sound/flutter_pcm_sound.dart';
import 'package:kinetix_ink/kinetix_ink.dart' show LiveAudioCodec;

/// Plays the teacher's class audio during a live class: mono 16-bit PCM at 16 kHz, fed in
/// 200 ms pieces as they arrive. Kept behind this interface so tests can fake it.
abstract class LiveAudioPlayer {
  /// What [create] makes in tests (like `LessonAudio.debugFactory`).
  static LiveAudioPlayer Function()? debugFactory;

  /// The player for this platform: speakers on Android, iOS and macOS; silence elsewhere.
  static LiveAudioPlayer create() {
    final f = debugFactory;
    if (f != null) return f();
    if (!kIsWeb && (Platform.isAndroid || Platform.isIOS || Platform.isMacOS)) return PcmLiveAudioPlayer();
    return NoLiveAudioPlayer();
  }

  Future<void> start();

  /// Queues decoded samples. Ignored when not started.
  void feed(Int16List samples);

  Future<void> stop();
}

/// Platforms without a player (desktop, web): the class audio is not heard.
class NoLiveAudioPlayer implements LiveAudioPlayer {
  @override
  Future<void> start() async {}
  @override
  void feed(Int16List samples) {}
  @override
  Future<void> stop() async {}
}

/// Smooths out network jitter and keeps playback live.
///
/// Holds back [target] samples (about 400 ms) before playing, keeps the device's own buffer
/// topped up to [target], and when more than [maxBacklog] (about 1.5 s) has piled up — a
/// stalled connection that then delivers a burst — drops the oldest audio so the student hears
/// the teacher now rather than drifting behind. A lost chunk is just a short gap.
class LiveJitterBuffer {
  LiveJitterBuffer({this.target = LiveAudioCodec.sampleRate * 2 ~/ 5, this.maxBacklog = LiveAudioCodec.sampleRate * 3 ~/ 2});

  final int target;
  final int maxBacklog;
  final _queue = ListQueue<Int16List>();
  int _queued = 0;
  bool _primed = false;

  /// Samples waiting to go to the device.
  int get queued => _queued;

  /// Samples dropped to stay live (tests, diagnostics).
  int dropped = 0;

  void add(Int16List samples) {
    if (samples.isEmpty) return;
    _queue.add(samples);
    _queued += samples.length;
    if (_queued > maxBacklog) {
      while (_queued > target && _queue.length > 1) {
        final old = _queue.removeFirst();
        _queued -= old.length;
        dropped += old.length;
      }
    }
  }

  /// What to send to a device that still holds [remaining] samples (empty while priming).
  Int16List take(int remaining) {
    if (!_primed) {
      if (_queued < target) return Int16List(0);
      _primed = true;
    }
    final out = <Int16List>[];
    var n = 0;
    while (remaining + n < target && _queue.isNotEmpty) {
      final s = _queue.removeFirst();
      _queued -= s.length;
      out.add(s);
      n += s.length;
    }
    if (out.length == 1) return out.first;
    final joined = Int16List(n);
    var at = 0;
    for (final s in out) {
      joined.setAll(at, s);
      at += s.length;
    }
    return joined;
  }

  /// The device ran dry: build up [target] again before playing.
  void underrun() {
    if (_queue.isEmpty) _primed = false;
  }

  void clear() {
    _queue.clear();
    _queued = 0;
    _primed = false;
  }
}

/// Plays through `flutter_pcm_sound` (Android, iOS, macOS). The plugin asks for more samples
/// when its buffer runs low; [LiveJitterBuffer] decides how much to give it.
class PcmLiveAudioPlayer implements LiveAudioPlayer {
  final _buffer = LiveJitterBuffer();
  bool _running = false;

  /// The plugin is waiting for samples (its last request went unanswered).
  bool _hungry = true;

  @override
  Future<void> start() async {
    if (_running) return;
    _running = true;
    _hungry = true;
    try {
      await FlutterPcmSound.setLogLevel(LogLevel.none);
      await FlutterPcmSound.setup(sampleRate: LiveAudioCodec.sampleRate, channelCount: 1);
      await FlutterPcmSound.setFeedThreshold(LiveAudioCodec.chunkSamples);
      FlutterPcmSound.setFeedCallback(_onFeed);
    } catch (_) {
      _running = false; // no audio output: the class stays watchable, silently
    }
  }

  @override
  void feed(Int16List samples) {
    if (!_running) return;
    _buffer.add(samples);
    if (_hungry) _give(0);
  }

  void _onFeed(int remaining) {
    if (!_running) return;
    if (remaining == 0) _buffer.underrun();
    _give(remaining);
  }

  void _give(int remaining) {
    final samples = _buffer.take(remaining);
    _hungry = samples.isEmpty;
    if (samples.isEmpty) return;
    unawaited(FlutterPcmSound.feed(PcmArrayInt16(bytes: ByteData.sublistView(samples))).catchError((_) {}));
  }

  @override
  Future<void> stop() async {
    if (!_running) return;
    _running = false;
    _buffer.clear();
    FlutterPcmSound.setFeedCallback(null);
    try {
      await FlutterPcmSound.release();
    } catch (_) {}
  }
}
