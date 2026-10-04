import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

/// Event names from packages/shared (RealtimeEvents).
abstract final class LiveEvents {
  static const watch = 'live.watch';
  static const unwatch = 'live.unwatch';
  static const frame = 'live.frame';
  static const ended = 'live.ended';
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

/// The connection dropped; the client keeps trying to reconnect on its own.
class LiveDisconnected extends LiveSignal {
  const LiveDisconnected();
}

/// The server refused the connection (signed out, or this account cannot watch classes).
class LiveRejected extends LiveSignal {
  const LiveRejected(this.message);

  final String message;
}

/// The answer to `live.watch`.
class LiveWatchAck {
  const LiveWatchAck({required this.ok, this.error, this.teacher, this.subject, this.section});

  factory LiveWatchAck.fromJson(Map<String, dynamic> j) {
    final s = (j['session'] as Map?)?.cast<String, dynamic>();
    return LiveWatchAck(
      ok: j['ok'] == true,
      error: j['error'] as String?,
      teacher: s?['teacher'] as String?,
      subject: s?['subject'] as String?,
      section: s?['section'] as String?,
    );
  }

  final bool ok;
  final String? error;
  final String? teacher;
  final String? subject;
  final String? section;
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
      final events = d['events'];
      if (events is! List) return;
      _add(LiveFrame('${d['deviceId']}', [for (final e in events) if (e is List) e]));
    });
    socket.on(LiveEvents.ended, (d) {
      if (d is Map) _add(LiveEnded('${d['deviceId']}', '${d['reason']}'));
    });
    socket.on('error', (d) {
      final message = d is Map ? '${d['message']}' : '$d';
      if (message == 'unauthorized') _add(const LiveRejected('Sign in again to watch the class.'));
    });
    socket.onDisconnect((_) => _add(const LiveDisconnected()));
    socket.onConnectError((_) => _add(const LiveDisconnected()));
    socket.connect();
    _socket = socket;
  }

  @override
  Future<LiveWatchAck> watch(String deviceId) {
    final socket = _socket;
    if (socket == null) return Future.value(const LiveWatchAck(ok: false, error: 'Not connected'));
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
      onTimeout: () => const LiveWatchAck(ok: false, error: 'The class is taking too long to answer. Try again.'),
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
