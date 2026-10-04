import 'dart:async';

import 'package:clock/clock.dart';
import 'package:flutter/foundation.dart';
import 'package:just_audio/just_audio.dart' as ja;

import 'recording.dart';

/// The lesson's clock. The board follows [position], so playback stays in step with the
/// teacher's voice. Listeners hear about play, pause, seek, speed and end changes.
abstract class LessonAudio extends ChangeNotifier {
  /// Where playback is now. Read every frame while playing.
  Duration get position;

  /// The audio's own length, when known.
  Duration? get duration;
  bool get playing;

  /// Reached the end (playing is then false).
  bool get completed;
  double get speed;

  /// False when the lesson plays without sound (none was recorded, or this device can't play it).
  bool get audible;

  Future<void> play();
  Future<void> pause();
  Future<void> seek(Duration to);
  Future<void> setSpeed(double speed);

  /// Chooses how a recording plays. Tests (and platforms without an audio backend) set this to
  /// return [SilentLessonAudio].
  static LessonAudioFactory? debugFactory;
}

typedef LessonAudioFactory = Future<LessonAudio> Function(RecordingInfo recording, LessonAudioLocation? location, Duration length);

/// Whether just_audio has a backend here (it has none on Linux and Windows desktop).
bool get lessonAudioSupported =>
    kIsWeb || const {TargetPlatform.android, TargetPlatform.iOS, TargetPlatform.macOS}.contains(defaultTargetPlatform);

/// Streams the recording's audio when there is some and this device can play it; otherwise
/// plays the board on a silent clock.
Future<LessonAudio> createLessonAudio(RecordingInfo recording, LessonAudioLocation? location, Duration length) async {
  final override = LessonAudio.debugFactory;
  if (override != null) return override(recording, location, length);
  if (recording.hasAudio && location != null && lessonAudioSupported) {
    try {
      return await StreamedLessonAudio.open(location);
    } catch (e) {
      debugPrint('Lesson audio unavailable, playing without sound: $e');
    }
  }
  return SilentLessonAudio(length, audible: false);
}

/// The teacher's voice, streamed over HTTP (with Range requests, so seeking is quick).
class StreamedLessonAudio extends LessonAudio {
  StreamedLessonAudio._(this._player) {
    _subs.add(_player.playerStateStream.listen((_) => notifyListeners()));
    _subs.add(_player.durationStream.listen((_) => notifyListeners()));
  }

  static Future<StreamedLessonAudio> open(LessonAudioLocation location) async {
    final player = ja.AudioPlayer();
    try {
      await player.setAudioSource(ja.AudioSource.uri(location.uri, headers: location.headers), preload: true);
    } catch (_) {
      await player.dispose();
      rethrow;
    }
    return StreamedLessonAudio._(player);
  }

  final ja.AudioPlayer _player;
  final _subs = <StreamSubscription<Object?>>[];

  @override
  Duration get position => _player.position;
  @override
  Duration? get duration => _player.duration;
  @override
  bool get playing => _player.playing && !completed;
  @override
  bool get completed => _player.processingState == ja.ProcessingState.completed;
  @override
  double get speed => _player.speed;
  @override
  bool get audible => true;

  @override
  Future<void> play() async {
    if (completed) await _player.seek(Duration.zero);
    // just_audio's play() completes only when playback stops, so don't wait for it.
    unawaited(_player.play());
  }

  @override
  Future<void> pause() => _player.pause();
  @override
  Future<void> seek(Duration to) => _player.seek(to);
  @override
  Future<void> setSpeed(double speed) => _player.setSpeed(speed);

  @override
  void dispose() {
    for (final s in _subs) {
      s.cancel();
    }
    _player.dispose();
    super.dispose();
  }
}

/// A clock with no sound: used when the lesson has no audio, on desktops without an audio
/// backend, and in tests (it reads time through `package:clock`, which tests control).
class SilentLessonAudio extends LessonAudio {
  SilentLessonAudio(this.length, {this.audible = false, Stopwatch? stopwatch}) : _watch = stopwatch ?? clock.stopwatch();

  final Duration length;
  @override
  final bool audible;
  final Stopwatch _watch;
  Duration _base = Duration.zero;
  double _speed = 1;

  @override
  Duration get position {
    final p = _base + _watch.elapsed * _speed;
    return p > length ? length : p;
  }

  @override
  Duration? get duration => length;
  @override
  bool get playing => _watch.isRunning && !completed;
  @override
  bool get completed => position >= length;
  @override
  double get speed => _speed;

  void _rebase(Duration to) {
    final running = _watch.isRunning;
    _base = to < Duration.zero ? Duration.zero : (to > length ? length : to);
    _watch.reset();
    if (running) _watch.start();
  }

  @override
  Future<void> play() async {
    if (completed) _rebase(Duration.zero);
    _watch.start();
    notifyListeners();
  }

  @override
  Future<void> pause() async {
    _rebase(position);
    _watch.stop();
    notifyListeners();
  }

  @override
  Future<void> seek(Duration to) async {
    _rebase(to);
    notifyListeners();
  }

  @override
  Future<void> setSpeed(double speed) async {
    _rebase(position);
    _speed = speed;
    notifyListeners();
  }
}
