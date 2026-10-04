import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import '../../core/live.dart';
import '../../core/live_audio_player.dart';
import '../../core/models.dart';

enum LivePhase {
  /// Opening the connection.
  connecting,

  /// Joined; waiting for the board's first snapshot.
  joining,

  /// The board is showing.
  live,

  /// The connection dropped; the last board stays on screen while it comes back.
  reconnecting,

  /// The class stopped streaming ([LiveClassController.endedReason] says why).
  ended,

  /// The server would not let the student join ([LiveClassController.error] says why).
  failed,
}

/// Watches one live class: connects, joins with `live.watch`, applies the board's frames to a
/// [LessonPlayer], rejoins after a reconnect (the board then sends a fresh snapshot), and stops
/// when the class ends.
///
/// Class audio: when the join answer says the student may listen and the teacher's mic is on,
/// the `live.audio` chunks are decoded and played through [LiveAudioPlayer] (unless muted).
/// Playback stops when the mic goes off, the class ends, or the student leaves.
class LiveClassController extends ChangeNotifier {
  LiveClassController({required this.connector, required this.baseUrl, required this.token, required this.live, this.audioPlayer});

  final LiveConnector connector;
  final String baseUrl;
  final String token;
  final LiveClass live;

  final player = LessonPlayer.live();

  LivePhase phase = LivePhase.connecting;

  /// `live_off`, `class_ended` or `offline` when [phase] is [LivePhase.ended].
  String? endedReason;
  String? error;

  /// From the join answer, else what `/v1/student/live` said.
  late String teacher = live.teacher;
  late String? subject = live.subject;

  /// This student may hear the class audio (from the join answer).
  bool audioAllowed = false;

  /// The teacher's microphone is on.
  bool audioOn = false;

  /// The student muted the class (unmuted each time the class is opened).
  bool muted = false;

  /// The class audio is being played now.
  bool get audioPlaying => _playing;

  /// Plays the class audio; made on first use when not given ([LiveAudioPlayer.create]).
  LiveAudioPlayer? audioPlayer;
  bool _playing = false;

  LiveConnection? _conn;
  StreamSubscription<LiveSignal>? _sub;
  bool _connected = false;
  bool _disposed = false;

  void start() {
    _conn?.dispose();
    _sub?.cancel();
    final conn = connector(baseUrl: baseUrl, token: token);
    _conn = conn;
    _sub = conn.signals.listen(_on);
    _set(LivePhase.connecting);
    conn.connect();
  }

  void _set(LivePhase p) {
    if (_disposed) return;
    phase = p;
    _syncAudio();
    notifyListeners();
  }

  void _on(LiveSignal s) {
    if (_disposed) return;
    switch (s) {
      case LiveReady():
        _connected = true;
        // A teacher who stopped the class stays stopped; anything else rejoins.
        if (phase != LivePhase.ended || endedReason == 'offline') _join();
      case LiveFrame(:final deviceId, :final events):
        if (deviceId != live.deviceId) return;
        player.applyLive(events);
        final snapshot = events.any((e) => e.length > 1 && e[1] == 'L');
        // A board that went offline keeps its viewers and sends a fresh snapshot when it is back.
        if (phase == LivePhase.ended && endedReason == 'offline' && snapshot) {
          endedReason = null;
          _set(LivePhase.live);
          return;
        }
        if (phase == LivePhase.joining || phase == LivePhase.reconnecting) {
          // Live once the board's snapshot is in (a frame without one only carries recent strokes).
          if (snapshot || phase == LivePhase.reconnecting) _set(LivePhase.live);
        }
      case LiveEnded(:final deviceId, :final reason):
        if (deviceId != live.deviceId) return;
        endedReason = reason;
        audioOn = false;
        _syncAudio();
        _set(LivePhase.ended);
      case LiveAudioState(:final deviceId, :final on):
        if (deviceId != live.deviceId) return;
        audioOn = on;
        _syncAudio();
        notifyListeners();
      case LiveAudioChunk(:final deviceId, :final data):
        if (deviceId != live.deviceId || !_playing) return;
        audioPlayer?.feed(LiveAudioCodec.decodeBase64(data));
      case LiveDisconnected():
        _connected = false;
        if (phase == LivePhase.live || phase == LivePhase.joining) _set(LivePhase.reconnecting);
      case LiveRejected(:final message):
        error = message;
        _set(LivePhase.failed);
    }
  }

  Future<void> _join() async {
    final conn = _conn;
    if (conn == null) return;
    if (phase != LivePhase.reconnecting) _set(LivePhase.joining);
    final ack = await conn.watch(live.deviceId);
    if (_disposed || conn != _conn) return;
    if (ack.ok) {
      teacher = ack.teacher ?? teacher;
      subject = ack.subject ?? subject;
      endedReason = null;
      error = null;
      audioAllowed = ack.audioAllowed;
      audioOn = ack.audioOn;
      _syncAudio();
      notifyListeners();
      return;
    }
    // Why the server said no, in the words the student sees.
    final message = ack.error ?? LiveErrors.couldNotJoin;
    if (message.contains('offline')) {
      endedReason = 'offline';
      _set(LivePhase.ended);
    } else if (message.contains('not started a live class')) {
      endedReason = 'live_off';
      _set(LivePhase.ended);
    } else if (message.contains('No class is being taught')) {
      endedReason = 'class_ended';
      _set(LivePhase.ended);
    } else {
      error = message;
      _set(LivePhase.failed);
    }
  }

  /// Mutes or unmutes the class audio.
  void toggleMute() {
    muted = !muted;
    _syncAudio();
    notifyListeners();
  }

  /// Plays while the student may listen, the mic is on, the class is on and not muted.
  void _syncAudio() {
    final want = !_disposed && audioAllowed && audioOn && !muted && phase != LivePhase.failed && phase != LivePhase.ended;
    if (want == _playing) return;
    _playing = want;
    final player = audioPlayer ??= LiveAudioPlayer.create();
    unawaited(want ? player.start() : player.stop());
  }

  /// "Try again" after the board went offline or joining failed.
  void retry() {
    endedReason = null;
    error = null;
    if (_connected) {
      _join();
    } else {
      start();
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _syncAudio();
    _conn?.unwatch(live.deviceId);
    _sub?.cancel();
    _conn?.dispose();
    player.dispose();
    super.dispose();
  }
}
