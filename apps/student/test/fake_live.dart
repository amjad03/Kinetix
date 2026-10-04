import 'dart:async';
import 'dart:typed_data';

import 'package:kinetix_student/core/live.dart';
import 'package:kinetix_student/core/live_audio_player.dart';

/// An in-memory realtime connection: tests play the server, sending ready, frames and ended.
class FakeLiveConnection implements LiveConnection {
  FakeLiveConnection({required this.baseUrl, required this.token});

  final String baseUrl;
  final String token;
  final _signals = StreamController<LiveSignal>.broadcast(sync: true);
  final watched = <String>[];
  final unwatched = <String>[];
  bool connected = false;
  bool disposed = false;

  /// The answer to the next `live.watch`.
  LiveWatchAck ack = const LiveWatchAck(ok: true, teacher: 'Anita Sharma', subject: 'Corporate Accounting', section: 'BCom Sem 3 A');

  /// Answers `ready` as soon as the app connects (as the server does for a good token).
  bool autoReady = true;

  @override
  Stream<LiveSignal> get signals => _signals.stream;

  @override
  void connect() {
    connected = true;
    if (autoReady) scheduleMicrotask(() => send(const LiveReady()));
  }

  @override
  Future<LiveWatchAck> watch(String deviceId) async {
    watched.add(deviceId);
    return ack;
  }

  @override
  void unwatch(String deviceId) => unwatched.add(deviceId);

  @override
  void dispose() {
    disposed = true;
    _signals.close();
  }

  void send(LiveSignal s) {
    if (!_signals.isClosed) _signals.add(s);
  }
}

/// Hands out [FakeLiveConnection]s and remembers them.
class FakeLiveServer {
  final connections = <FakeLiveConnection>[];

  /// What `live.watch` answers on new connections (joined, unless a test says otherwise).
  LiveWatchAck? ack;

  FakeLiveConnection get last => connections.last;

  LiveConnection connect({required String baseUrl, required String token}) {
    final c = FakeLiveConnection(baseUrl: baseUrl, token: token);
    if (ack != null) c.ack = ack!;
    connections.add(c);
    return c;
  }
}

/// Records what the live class would play.
class FakeLiveAudioPlayer implements LiveAudioPlayer {
  bool playing = false;
  int starts = 0, stops = 0;
  final fed = <Int16List>[];

  /// The most recent player made by the app.
  static FakeLiveAudioPlayer? last;

  @override
  Future<void> start() async {
    playing = true;
    starts++;
  }

  @override
  void feed(Int16List samples) {
    if (playing) fed.add(samples);
  }

  @override
  Future<void> stop() async {
    playing = false;
    stops++;
  }
}
