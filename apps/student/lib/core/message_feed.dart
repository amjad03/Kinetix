import 'dart:async';

import 'live.dart';

/// New messages as they arrive: keeps the signed-in user's realtime socket open (`/realtime`,
/// the connection live classes use) and reports `message.new`. Socket.IO reconnects with
/// backoff (1 s → 30 s); after a reconnect [onReconnected] catches up on anything missed.
class MessageFeed {
  MessageFeed({required this.connector, required this.baseUrl, required this.token, required this.onMessage, this.onReconnected, this.onPoll});

  final LiveConnector connector;
  final String baseUrl;
  final String token;
  final void Function(LiveMessageNew message) onMessage;
  final void Function()? onReconnected;

  /// The teacher asked (or closed) a question on the board.
  final void Function()? onPoll;

  LiveConnection? _conn;
  StreamSubscription<LiveSignal>? _sub;
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
        case LiveReady():
          connected = true;
          if (_wasReady) onReconnected?.call();
          _wasReady = true;
        case LiveMessageNew():
          onMessage(s);
        case LivePollChanged():
          onPoll?.call();
        case LiveDisconnected():
          connected = false;
        case LiveRejected():
          // Signed out or the token expired: the app signs out on its next request.
          connected = false;
          _stopped = true;
        default:
          break;
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
