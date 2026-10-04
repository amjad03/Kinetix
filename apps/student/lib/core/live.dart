import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

/// Event names from packages/shared (RealtimeEvents).
abstract final class LiveEvents {
  static const watch = 'live.watch';
  static const unwatch = 'live.unwatch';
  static const frame = 'live.frame';
  static const ended = 'live.ended';
  static const audioState = 'live.audio.state';
  static const audio = 'live.audio';
}

/// What arrives on a live-class connection.
sealed class LiveSignal {
  const LiveSignal();
}

/// Connected (or reconnected) and signed in: time to (re)join the class.
class LiveReady extends LiveSignal {
  const LiveReady();
}

/// Board events for the class being watched (lesson-event format; the first frame after joining
/// carries an 'L' snapshot of every page).
class LiveFrame extends LiveSignal {
  const LiveFrame(this.deviceId, this.events);

  final String deviceId;
  final List<List<dynamic>> events;
}

/// The class stopped streaming: `live_off` (teacher turned live off), `class_ended` or `offline`
/// (the board lost its connection).
class LiveEnded extends LiveSignal {
  const LiveEnded(this.deviceId, this.reason);

  final String deviceId;
  final String reason;
}

/// The teacher turned class audio on or off.
class LiveAudioState extends LiveSignal {
  const LiveAudioState(this.deviceId, this.on);

  final String deviceId;
  final bool on;
}

/// About 200 ms of class audio: base64 IMA ADPCM, 16 kHz mono (`LiveAudioCodec`).
class LiveAudioChunk extends LiveSignal {
  const LiveAudioChunk(this.deviceId, this.seq, this.data);

  final String deviceId;
  final int seq;
  final String data;
}

/// The connection dropped; the client keeps trying to reconnect on its own.
class LiveDisconnected extends LiveSignal {
  const LiveDisconnected();
}

/// The server refused the connection (signed out, or this account cannot watch classes).
/// The app's own words for live-class problems (translated by the screen; see [LiveClassScreen]).
abstract final class LiveErrors {
  static const signInAgain = 'Sign in again to watch the class.';
  static const notConnected = 'Not connected';
  static const timeout = 'The class is taking too long to answer. Try again.';
  static const couldNotJoin = "Couldn't join the class.";
}

class LiveRejected extends LiveSignal {
  const LiveRejected(this.message);

  final String message;
}

/// The answer to `live.watch`.
class LiveWatchAck {
  const LiveWatchAck({
    required this.ok,
    this.error,
    this.teacher,
    this.subject,
    this.section,
    this.audioAllowed = false,
    this.audioOn = false,
  });

  factory LiveWatchAck.fromJson(Map<String, dynamic> j) {
    final s = (j['session'] as Map?)?.cast<String, dynamic>();
    final audio = j['audio'] is Map ? j['audio'] as Map : const {};
    return LiveWatchAck(
      ok: j['ok'] == true,
      error: j['error'] as String?,
      teacher: s?['teacher'] as String?,
      subject: s?['subject'] as String?,
      section: s?['section'] as String?,
      audioAllowed: audio['allowed'] == true,
      audioOn: audio['on'] == true,
    );
  }

  final bool ok;
  final String? error;
  final String? teacher;
  final String? subject;
  final String? section;

  /// Whether this student may hear the class audio, and whether the teacher has it on now.
  final bool audioAllowed;
  final bool audioOn;
}

/// A connection to the realtime namespace for watching a live class. Tests use a fake.
abstract class LiveConnection {
  Stream<LiveSignal> get signals;

  /// Connects; [LiveReady] follows once the server accepts the token (and after every reconnect).
  void connect();

  Future<LiveWatchAck> watch(String deviceId);
  void unwatch(String deviceId);
  void dispose();
}

typedef LiveConnector = LiveConnection Function({required String baseUrl, required String token});

/// The real connection: Socket.IO to `<api>/realtime`, as the board uses. Reconnects on its own.
class SocketLiveConnection implements LiveConnection {
  SocketLiveConnection({required this.baseUrl, required this.token});

  final String baseUrl;
  final String token;
  final _signals = StreamController<LiveSignal>.broadcast();
  io.Socket? _socket;

  @override
  Stream<LiveSignal> get signals => _signals.stream;

  void _add(LiveSignal s) {
    if (!_signals.isClosed) _signals.add(s);
  }

  @override
  void connect() {
    final socket = io.io(
      '$baseUrl/realtime',
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .disableAutoConnect()
          .enableForceNew()
          .enableReconnection()
          .build(),
    );
    socket.on('ready', (_) => _add(const LiveReady()));
    socket.on(LiveEvents.frame, (d) {
      if (d is! Map) return;
      // Boards put the snapshot ('L') first in `events`; a separate `snapshot` is honoured too.
      final snapshot = d['snapshot'] is Map ? (d['snapshot'] as Map)['events'] : null;
      final events = [...(snapshot is List ? snapshot : const []), ...(d['events'] is List ? d['events'] as List : const [])];
      _add(
        LiveFrame('${d['deviceId']}', [
          for (final e in events)
            if (e is List) e,
        ]),
      );
    });
    socket.on(LiveEvents.ended, (d) {
      if (d is Map) _add(LiveEnded('${d['deviceId']}', '${d['reason']}'));
    });
    socket.on(LiveEvents.audioState, (d) {
      if (d is Map) _add(LiveAudioState('${d['deviceId']}', d['on'] == true));
    });
    socket.on(LiveEvents.audio, (d) {
      if (d is Map && d['data'] is String && d['codec'] == 'ima-adpcm') {
        _add(LiveAudioChunk('${d['deviceId']}', (d['seq'] as num?)?.toInt() ?? 0, d['data'] as String));
      }
    });
    socket.on('error', (d) {
      final message = d is Map ? '${d['message']}' : '$d';
      if (message == 'unauthorized') _add(const LiveRejected(LiveErrors.signInAgain));
    });
    socket.onDisconnect((_) => _add(const LiveDisconnected()));
    socket.onConnectError((_) => _add(const LiveDisconnected()));
    socket.connect();
    _socket = socket;
  }

  @override
  Future<LiveWatchAck> watch(String deviceId) {
    final socket = _socket;
    if (socket == null) return Future.value(const LiveWatchAck(ok: false, error: LiveErrors.notConnected));
    final done = Completer<LiveWatchAck>();
    socket.emitWithAck(
      LiveEvents.watch,
      {'deviceId': deviceId},
      ack: (dynamic data) {
        if (done.isCompleted) return;
        done.complete(data is Map ? LiveWatchAck.fromJson(data.cast<String, dynamic>()) : const LiveWatchAck(ok: false));
      },
    );
    return done.future.timeout(
      const Duration(seconds: 15),
      onTimeout: () => const LiveWatchAck(ok: false, error: LiveErrors.timeout),
    );
  }

  @override
  void unwatch(String deviceId) => _socket?.emit(LiveEvents.unwatch, {'deviceId': deviceId});

  @override
  void dispose() {
    _socket?.dispose();
    _socket = null;
    _signals.close();
  }
}
