import 'package:socket_io_client/socket_io_client.dart' as io;

/// Event names from packages/shared (RealtimeEvents).
abstract final class RealtimeEvents {
  static const pairingClaimed = 'pairing.claimed';
  static const sessionEnded = 'session.ended';
  static const broadcastNew = 'broadcast.new';
  static const broadcastCleared = 'broadcast.cleared';
  static const liveViewers = 'live.viewers';
  static const liveSnapshotRequest = 'live.snapshot.request';
  static const liveFrame = 'live.frame';
}

/// The board's live connection to KINETIX Cloud. Reconnects on its own.
class Realtime {
  Realtime(this.baseUrl);

  final String baseUrl;
  io.Socket? _socket;
  final Map<String, void Function(Map<String, dynamic>)> _handlers = {};

  void on(String event, void Function(Map<String, dynamic>) handler) {
    _handlers[event] = handler;
    _socket?.on(event, (d) => handler(Map<String, dynamic>.from(d as Map)));
  }

  void Function()? onReady;

  void connect(String token) {
    _socket?.dispose();
    final socket = io.io(
      '$baseUrl/realtime',
      io.OptionBuilder().setTransports(['websocket']).setAuth({'token': token}).disableAutoConnect().enableReconnection().build(),
    );
    for (final e in _handlers.entries) {
      socket.on(e.key, (d) => e.value(Map<String, dynamic>.from(d as Map)));
    }
    socket.on('ready', (_) => onReady?.call());
    socket.connect();
    _socket = socket;
  }

  /// Board → server (live view frames).
  void emit(String event, Object data) => _socket?.emit(event, data);

  void dispose() => _socket?.dispose();
}
