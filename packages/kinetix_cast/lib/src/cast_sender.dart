import 'dart:async';

import 'package:flutter/foundation.dart';

import 'cast_link.dart';
import 'cast_models.dart';
import 'cast_peer.dart';

enum CastPhase {
  idle,

  /// The system's "share your screen" consent is showing.
  capturing,

  /// Asking KINETIX Cloud to cast to the board.
  requesting,

  /// Waiting for the class teacher to approve on the board.
  waiting,

  /// Approved; the WebRTC connection is coming up.
  connecting,

  /// The screen is on the board.
  live,
}

/// Casting this device's screen to a board: ask, wait for the teacher's approval on the board,
/// connect, and stop. One cast at a time; the board shows up to four people side by side.
class CastSender extends ChangeNotifier {
  CastSender({required this.link, required this.peerFactory});

  final CastLink link;
  final CastPeerFactory peerFactory;

  CastPhase phase = CastPhase.idle;
  CastBoard? board;

  /// Why nothing is showing: an error message from the server, or how the last cast ended.
  String? error;
  CastEndReason? ended;
  bool declinedCapture = false;

  CastPeer? _peer;
  String? _castId;
  StreamSubscription<CastEvent>? _sub;

  bool get active => phase != CastPhase.idle;

  Future<void> start(CastBoard b) async {
    if (active) return;
    error = null;
    ended = null;
    declinedCapture = false;
    board = b;
    phase = CastPhase.capturing;
    notifyListeners();
    final peer = peerFactory();
    _peer = peer;
    if (!await peer.capture()) {
      declinedCapture = true;
      await _reset();
      return;
    }
    phase = CastPhase.requesting;
    notifyListeners();
    _sub = link.events.listen(_onEvent);
    final res = await link.request(b.deviceId);
    if (!res.ok || res.castId == null) {
      error = res.error ?? 'This board cannot be cast to right now';
      await _reset();
      return;
    }
    _castId = res.castId;
    if (res.approved) {
      await _connect(res.iceServers);
    } else {
      phase = CastPhase.waiting;
      notifyListeners();
    }
  }

  Future<void> stop() async {
    final id = _castId;
    if (id != null) link.stop(id);
    ended = CastEndReason.stopped;
    await _reset();
  }

  Future<void> _connect(List<IceServer> servers) async {
    final id = _castId, peer = _peer;
    if (id == null || peer == null) return;
    phase = CastPhase.connecting;
    notifyListeners();
    try {
      await peer.connect(
        servers,
        onSignal: (d) => link.signal(id, d),
        onLive: (live) {
          if (_castId != id) return;
          if (live) {
            phase = CastPhase.live;
            notifyListeners();
          } else {
            unawaited(stop());
          }
        },
      );
    } catch (e) {
      error = '$e';
      link.stop(id);
      await _reset();
    }
  }

  void _onEvent(CastEvent e) {
    if (e.castId != _castId) return;
    switch (e) {
      case CastApprovedEvent(:final iceServers):
        unawaited(_connect(iceServers));
      case CastSignalEvent(:final data):
        unawaited(_peer?.handleSignal(data));
      case CastEndedEvent(:final reason):
        ended = reason;
        unawaited(_reset());
    }
  }

  Future<void> _reset() async {
    await _sub?.cancel();
    _sub = null;
    final peer = _peer;
    _peer = null;
    _castId = null;
    phase = CastPhase.idle;
    notifyListeners();
    await peer?.close();
  }

  @override
  void dispose() {
    final id = _castId;
    if (id != null) link.stop(id);
    unawaited(_reset());
    link.close();
    super.dispose();
  }
}
