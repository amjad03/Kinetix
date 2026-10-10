import 'dart:async';

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
  static const liveAudioState = 'live.audio.state';
  static const liveAudio = 'live.audio';
  static const pollAnswered = 'poll.answered';
  static const remoteCommand = 'remote.command';
  static const remoteState = 'remote.state';
  static const castPending = 'cast.pending';
  static const castIce = 'cast.ice';
  static const castSignal = 'cast.signal';
  static const castEnded = 'cast.ended';
  static const buzzerUpdated = 'buzzer.updated';
  static const deviceAction = 'device.action';
  static const deviceActionAck = 'device.action.ack';
  static const deviceActionsPull = 'device.actions.pull';
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

  /// Board → server with an acknowledgement. Completes with the server's reply, or null when
  /// the board is not connected or the server does not answer within [timeout].
  Future<Object?> request(String event, Object data, {Duration timeout = const Duration(seconds: 5)}) {
    final socket = _socket;
    if (socket == null || !socket.connected) return Future.value();
    final done = Completer<Object?>();
    socket.emitWithAck(event, data, ack: (Object? reply) {
      if (!done.isCompleted) done.complete(reply);
    });
    return done.future.timeout(timeout, onTimeout: () => null);
  }

  void dispose() => _socket?.dispose();
}
