import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/painting.dart';

import 'cast_receiver.dart';

/// Event names from packages/shared (RealtimeEvents).
abstract final class CastEvents {
  static const pending = 'cast.pending';
  static const decide = 'cast.decide';
  static const ice = 'cast.ice';
  static const signal = 'cast.signal';
  static const stop = 'cast.stop';
  static const ended = 'cast.ended';
}

/// Most screens the board shows at once (the API enforces the same).
const maxCasts = 4;

enum CastTileState {
  /// Asked to cast; the teacher has not answered.
  pending,

  /// Approved; the connection is coming up.
  connecting,

  /// Video is flowing.
  live,
}

/// One person's screen on the board.
class CastTile {
  CastTile({required this.id, required this.name, required this.teacher, this.state = CastTileState.pending});

  final String id;
  final String name;

  /// A teacher (or leader) casting, rather than a student.
  final bool teacher;
  CastTileState state;
  CastReceiver? receiver;

  /// The teacher is drawing over this screen (marks stay on the board only).
  bool annotate = false;
  final strokes = <(Color, List<Offset>)>[];
}

/// Screens cast to the board (docs/architecture/screen-share-and-devices.md). A teacher's or
/// student's phone or laptop asks to cast; the class teacher approves on the board (their own
/// device needs no approval); the video comes straight from the sender over WebRTC, and the
/// API only relays the signalling. Up to [maxCasts] screens share the panel, one can fill it,
/// the teacher can draw over any, add its picture to the board, and stop it.
class CastController extends ChangeNotifier {
  CastController({required this.emit, required this.request, CastReceiverFactory? receiverFactory}) : _receiverFactory = receiverFactory ?? WebRtcCastReceiver.new;

  /// Board → server, no answer wanted (signalling).
  final void Function(String event, Object data) emit;

  /// Board → server with the server's reply (the decision).
  final Future<Object?> Function(String event, Object data) request;
  final CastReceiverFactory _receiverFactory;

  final tiles = <CastTile>[];

  /// The screen filling the panel; null: all side by side.
  String? focusedId;

  /// Called when something needs the teacher: the panel should open.
  VoidCallback? onAttention;

  bool _disposed = false;

  Iterable<CastTile> get pending => tiles.where((t) => t.state == CastTileState.pending);
  bool get any => tiles.isNotEmpty;
  CastTile? tile(String id) => tiles.where((t) => t.id == id).firstOrNull;

  /// The tiles to lay out now: the focused one alone, or every approved screen.
  List<CastTile> get shown {
    final live = tiles.where((t) => t.state != CastTileState.pending).toList();
    final f = live.where((t) => t.id == focusedId).firstOrNull;
    return f != null ? [f] : live;
  }

  // --- From the server -----------------------------------------------------------------------

  /// `cast.pending`: someone asks to cast; the teacher decides.
  void onPending(Map<String, dynamic> e) {
    final id = e['castId'] as String?;
    if (id == null || tile(id) != null) return;
    tiles.add(CastTile(id: id, name: e['name'] as String? ?? '?', teacher: e['role'] == 'teacher'));
    _changed();
    onAttention?.call();
  }

  /// `cast.ice`: approved (by the teacher, or automatically for their own device): get ready for the offer.
  Future<void> onIce(Map<String, dynamic> e) async {
    final id = e['castId'] as String?;
    if (id == null) return;
    var t = tile(id);
    if (t == null) {
      t = CastTile(id: id, name: e['name'] as String? ?? '?', teacher: e['role'] == 'teacher');
      tiles.add(t);
    }
    if (t.receiver != null) return;
    t.state = CastTileState.connecting;
    final r = _receiverFactory();
    t.receiver = r;
    _changed();
    onAttention?.call();
    final servers = [
      for (final s in (e['iceServers'] as List<dynamic>? ?? const [])) Map<String, dynamic>.from(s as Map),
    ];
    try {
      await r.start(
        servers,
        sendSignal: (d) => emit(CastEvents.signal, {'castId': id, 'data': d}),
        onLive: (live) {
          if (_disposed) return;
          if (live) {
            t!.state = CastTileState.live;
            _changed();
          } else {
            unawaited(stop(id));
          }
        },
      );
    } catch (err) {
      debugPrint('Cast $id: $err');
      await stop(id);
    }
  }

  /// `cast.signal`: the sender's offer or an ICE candidate.
  Future<void> onSignal(Map<String, dynamic> e) async {
    final r = tile(e['castId'] as String? ?? '')?.receiver;
    final data = e['data'];
    if (r != null && data is Map) await r.handleSignal(Map<String, dynamic>.from(data));
  }

  /// `cast.ended`: the sender left, the teacher or the class ended it.
  void onEnded(Map<String, dynamic> e) {
    final t = tile(e['castId'] as String? ?? '');
    if (t != null) unawaited(_drop(t));
  }

  // --- From the teacher ----------------------------------------------------------------------

  Future<void> approve(String id) async {
    final t = tile(id);
    if (t == null) return;
    t.state = CastTileState.connecting;
    _changed();
    final ack = await request(CastEvents.decide, {'castId': id, 'approve': true});
    if (ack is Map && ack['ok'] == true) return;
    await _drop(t); // the request is gone (the sender left or the class ended)
  }

  Future<void> decline(String id) async {
    final t = tile(id);
    if (t == null) return;
    await _drop(t);
    await request(CastEvents.decide, {'castId': id, 'approve': false});
  }

  /// The teacher stops a screen.
  Future<void> stop(String id) async {
    final t = tile(id);
    if (t == null) return;
    emit(CastEvents.stop, {'castId': id});
    await _drop(t);
  }

  Future<void> stopAll() async {
    for (final t in [...tiles]) {
      await stop(t.id);
    }
  }

  void focus(String? id) {
    focusedId = focusedId == id ? null : id;
    _changed();
  }

  void toggleAnnotate(String id) {
    final t = tile(id);
    if (t == null) return;
    t.annotate = !t.annotate;
    _changed();
  }

  void addStroke(String id, Color color, Offset start) {
    tile(id)?.strokes.add((color, [start]));
    _changed();
  }

  void extendStroke(String id, Offset to) {
    final t = tile(id);
    if (t == null || t.strokes.isEmpty) return;
    t.strokes.last.$2.add(to);
    _changed();
  }

  void clearMarks(String id) {
    tile(id)?.strokes.clear();
    _changed();
  }

  /// The class ended or the board signed out: every screen goes (the server ends them too).
  Future<void> classEnded() async {
    for (final t in [...tiles]) {
      await _drop(t);
    }
  }

  Future<void> _drop(CastTile t) async {
    tiles.remove(t);
    if (focusedId == t.id) focusedId = null;
    _changed();
    final r = t.receiver;
    t.receiver = null;
    await r?.close();
  }

  void _changed() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    for (final t in tiles) {
      unawaited(t.receiver?.close());
    }
    super.dispose();
  }
}
