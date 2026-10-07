import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

import 'models.dart';

/// What arrives on the signed-in user's realtime connection (Socket.IO namespace `/realtime`,
/// the same connection the Student App uses for live classes).
sealed class RealtimeSignal {
  const RealtimeSignal();
}

/// Connected (or reconnected) and signed in.
class RealtimeReady extends RealtimeSignal {
  const RealtimeReady();
}

/// A new message in one of the parent's conversations (`message.new`).
class RealtimeMessageNew extends RealtimeSignal {
  const RealtimeMessageNew({required this.conversationId, required this.messageId, required this.senderId});

  final String conversationId;
  final String messageId;
  final String senderId;
}

/// The school bus moved (`transport.position`).
class RealtimeBusPosition extends RealtimeSignal {
  const RealtimeBusPosition(this.event);

  final BusPositionEvent event;
}

/// The connection dropped; the client keeps trying to reconnect on its own.
class RealtimeDisconnected extends RealtimeSignal {
  const RealtimeDisconnected();
}

/// The server refused the token (signed out or expired).
class RealtimeRejected extends RealtimeSignal {
  const RealtimeRejected();
}

/// A connection to `/realtime`. Tests use a fake.
abstract class RealtimeConnection {
  Stream<RealtimeSignal> get signals;

  /// Connects; [RealtimeReady] follows once the server accepts the token (and after every reconnect).
  void connect();
  void dispose();
}

typedef RealtimeConnector = RealtimeConnection Function({required String baseUrl, required String token});

/// The real connection: Socket.IO to `<api>/realtime`. Reconnects on its own, backing off from
/// 1 s to 30 s (with jitter) while the server cannot be reached.
class SocketRealtimeConnection implements RealtimeConnection {
  SocketRealtimeConnection({required this.baseUrl, required this.token});

  final String baseUrl;
  final String token;
  final _signals = StreamController<RealtimeSignal>.broadcast();
  io.Socket? _socket;

  @override
  Stream<RealtimeSignal> get signals => _signals.stream;

  void _add(RealtimeSignal s) {
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
          .setReconnectionDelay(1000)
          .setReconnectionDelayMax(30000)
          .setRandomizationFactor(0.5)
          .build(),
    );
    socket.on('ready', (_) => _add(const RealtimeReady()));
    socket.on('message.new', (d) {
      if (d is Map && d['conversationId'] is String) {
        _add(RealtimeMessageNew(conversationId: '${d['conversationId']}', messageId: '${d['messageId']}', senderId: '${d['senderId']}'));
      }
    });
    socket.on('transport.position', (d) {
      if (d is! Map) return;
      try {
        _add(RealtimeBusPosition(BusPositionEvent.fromJson(d.cast<String, dynamic>())));
      } catch (_) {
        // A malformed event is ignored; the next ping replaces it.
      }
    });
    socket.on('error', (d) {
      if (d is Map && d['message'] == 'unauthorized') _add(const RealtimeRejected());
    });
    socket.onDisconnect((_) => _add(const RealtimeDisconnected()));
    socket.onConnectError((_) => _add(const RealtimeDisconnected()));
    socket.connect();
    _socket = socket;
  }

  @override
  void dispose() {
    _socket?.dispose();
    _socket = null;
    _signals.close();
  }
}

/// New messages as they arrive: keeps the realtime connection open while signed in and reports
/// `message.new`; after a reconnect [onReconnected] catches up on anything missed.
class MessageFeed {
  MessageFeed({required this.connector, required this.baseUrl, required this.token, required this.onMessage, this.onReconnected, this.onBusPosition});

  final RealtimeConnector connector;
  final String baseUrl;
  final String token;
  final void Function(RealtimeMessageNew message) onMessage;
  final void Function()? onReconnected;
  final void Function(BusPositionEvent event)? onBusPosition;

  RealtimeConnection? _conn;
  StreamSubscription<RealtimeSignal>? _sub;
  bool _wasReady = false;
  bool _stopped = false;

  /// Connected and signed in now.
  bool connected = false;

  void start() {
    _sub?.cancel();
    _conn?.dispose();
    _stopped = false;
    final conn = _conn = connector(baseUrl: baseUrl, token: token);
    _sub = conn.signals.listen((s) {
      switch (s) {
        case RealtimeReady():
          connected = true;
          if (_wasReady) onReconnected?.call();
          _wasReady = true;
        case RealtimeMessageNew():
          onMessage(s);
        case RealtimeBusPosition():
          onBusPosition?.call(s.event);
        case RealtimeDisconnected():
          connected = false;
        case RealtimeRejected():
          // Signed out or the token expired: the app signs out on its next request.
          connected = false;
          _stopped = true;
      }
    });
    conn.connect();
  }

  /// Back in the app: reconnect straight away rather than wait for the next backoff step.
  void resume() {
    if (connected || _stopped || _conn == null) return;
    start();
  }

  void dispose() {
    _sub?.cancel();
    _conn?.dispose();
    _conn = null;
  }
}
