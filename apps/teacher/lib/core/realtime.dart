import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

/// `message.new` (RealtimeEvents.MessageNew in packages/shared): a message was sent in one of
/// the teacher's threads. It carries ids only; the app fetches the message itself.
class MessageNew {
  const MessageNew({required this.conversationId, required this.messageId, required this.senderId});

  factory MessageNew.fromJson(Map<String, dynamic> j) =>
      MessageNew(conversationId: j['conversationId'] as String, messageId: j['messageId'] as String, senderId: j['senderId'] as String);

  final String conversationId;
  final String messageId;
  final String senderId;
}

/// The signed-in teacher's live connection to KINETIX Cloud (namespace `/realtime`).
///
/// Messages arrive here as they are sent instead of on the next refresh. When the connection
/// drops it comes back by itself with growing waits; [reconnected] then tells the app to catch
/// up on what it missed. Offline, the app falls back to refreshing on resume and tab changes.
abstract class TeacherRealtime {
  Stream<MessageNew> get messages;

  /// The connection came back after a drop; events in between were missed.
  Stream<void> get reconnected;

  void connect({required String baseUrl, required String token});
  void disconnect();
}

/// For tests and sign-in: never connects.
class NoRealtime implements TeacherRealtime {
  @override
  Stream<MessageNew> get messages => const Stream.empty();
  @override
  Stream<void> get reconnected => const Stream.empty();
  @override
  void connect({required String baseUrl, required String token}) {}
  @override
  void disconnect() {}
}

/// socket.io with reconnection backoff: 1 s, doubling up to 60 s, with jitter so a school's
/// phones do not all come back at once after a network blip.
class SocketRealtime implements TeacherRealtime {
  static const messageNew = 'message.new';

  final _messages = StreamController<MessageNew>.broadcast();
  final _reconnected = StreamController<void>.broadcast();
  io.Socket? _socket;
  bool _wasConnected = false;

  @override
  Stream<MessageNew> get messages => _messages.stream;
  @override
  Stream<void> get reconnected => _reconnected.stream;

  @override
  void connect({required String baseUrl, required String token}) {
    disconnect();
    final socket = io.io(
      '$baseUrl/realtime',
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .disableAutoConnect()
          .enableReconnection()
          .setReconnectionDelay(1000)
          .setReconnectionDelayMax(60000)
          .setRandomizationFactor(0.5)
          .build(),
    );
    socket
      ..on(messageNew, (d) {
        if (d is Map) {
          try {
            _messages.add(MessageNew.fromJson(Map<String, dynamic>.from(d)));
          } catch (_) {
            // A malformed event: the next refresh picks the message up.
          }
        }
      })
      ..onConnect((_) {
        if (_wasConnected) _reconnected.add(null);
        _wasConnected = true;
      })
      ..connect();
    _socket = socket;
  }

  @override
  void disconnect() {
    _socket?.dispose();
    _socket = null;
    _wasConnected = false;
  }
}
