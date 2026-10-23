import 'dart:async';
import 'dart:math' as math;

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
  static const control = 'cast.control';
}

/// Most screens the board shows at once (the API enforces the same).
const maxCasts = 9;

/// How the screens share the panel: chosen by the teacher, or [auto] (the smallest grid that fits).
enum CastLayout {
  auto(0),
  one(1),
  two(2),
  four(4),
  six(6),
  nine(9);

  const CastLayout(this.capacity);

  /// Screens it shows at once (0: as many as there are).
  final int capacity;
}

/// The grid for [n] screens in [layout]: columns, rows and how many fit. Two sit side by side
/// when [wide], else one above the other.
({int cols, int rows, int capacity}) castGrid(CastLayout layout, int n, {bool wide = true}) {
  var cap = layout.capacity;
  if (cap == 0) cap = const [1, 2, 4, 6, 9].firstWhere((c) => c >= n, orElse: () => maxCasts);
  return switch (cap) {
    1 => (cols: 1, rows: 1, capacity: 1),
    2 => wide ? (cols: 2, rows: 1, capacity: 2) : (cols: 1, rows: 2, capacity: 2),
    4 => (cols: 2, rows: 2, capacity: 4),
    6 => wide ? (cols: 3, rows: 2, capacity: 6) : (cols: 2, rows: 3, capacity: 6),
    _ => (cols: 3, rows: 3, capacity: 9),
  };
}

/// The board's join code for guests, shown as text and as a QR of [url] (the browser /cast page).
class CastJoinInfo {
  const CastJoinInfo(this.code, this.url);
  final String code;
  final String url;
}

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
  CastTile({required this.id, required this.name, required this.teacher, this.guest = false, this.state = CastTileState.pending});

  final String id;
  final String name;

  /// A teacher (or leader) casting, rather than a student.
  final bool teacher;

  /// Joined from a browser with the board's code (no account).
  final bool guest;

  /// The teacher paused this screen: it stays connected but is not shown.
  bool muted = false;
  CastTileState state;
  CastReceiver? receiver;

  /// The receiver has started and can take signalling; earlier messages wait in [queued].
  bool ready = false;

  /// Offer and ICE candidates that arrived before the receiver was ready (the sender of a
  /// teacher's own screen sends its offer the moment it is approved, before this board has
  /// finished setting up WebRTC). Dropping them left the cast stuck on "Connecting".
  final queued = <Map<String, dynamic>>[];

  /// The teacher is drawing over this screen (marks stay on the board only).
  bool annotate = false;
  final strokes = <(Color, List<Offset>)>[];
}

/// Screens cast to the board (docs/architecture/screen-share-and-devices.md). A teacher's or
/// student's phone or laptop asks to cast; the class teacher approves on the board (their own
/// device needs no approval); the video comes straight from the sender over WebRTC, and the
/// API only relays the signalling. Guests join from any browser with the board's code (QR).
/// Up to [maxCasts] screens share the panel in a grid of 1, 2, 4, 6 or 9; one can fill it or
/// present (first and largest); the teacher can pause (mute) any, draw over it, add its picture
/// to the board, and stop (remove) it.
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

  /// The presenter: shown first (and largest in the automatic layout).
  String? presenterId;

  CastLayout layout = CastLayout.auto;

  /// The board's join code for guests (the API's `GET /v1/cast/join-code`); null when unavailable.
  Future<CastJoinInfo?> Function({bool fresh})? fetchJoinCode;

  /// Called when something needs the teacher: the panel should open.
  VoidCallback? onAttention;

  bool _disposed = false;

  /// Signals for a cast this board has not heard of yet (the offer overtook `cast.ice`).
  final _early = <String, List<Map<String, dynamic>>>{};

  Iterable<CastTile> get pending => tiles.where((t) => t.state == CastTileState.pending);
  bool get any => tiles.isNotEmpty;
  CastTile? tile(String id) => tiles.where((t) => t.id == id).firstOrNull;

  /// Every approved screen, the presenter first.
  List<CastTile> get approved {
    final live = tiles.where((t) => t.state != CastTileState.pending).toList();
    final p = live.indexWhere((t) => t.id == presenterId);
    if (p > 0) live.insert(0, live.removeAt(p));
    return live;
  }

  /// The tiles to lay out now: the focused one alone, or as many approved screens as the layout holds.
  List<CastTile> get shown {
    final live = approved;
    final f = live.where((t) => t.id == focusedId).firstOrNull;
    if (f != null) return [f];
    return live.take(castGrid(layout, live.length).capacity).toList();
  }

  /// Approved screens the chosen layout has no room for.
  int get hidden => focusedId != null && tile(focusedId!) != null ? 0 : math.max(0, approved.length - shown.length);

  // --- From the server -----------------------------------------------------------------------

  /// `cast.pending`: someone asks to cast; the teacher decides.
  void onPending(Map<String, dynamic> e) {
    final id = e['castId'] as String?;
    if (id == null || tile(id) != null) return;
    tiles.add(CastTile(id: id, name: e['name'] as String? ?? '?', teacher: e['role'] == 'teacher', guest: e['role'] == 'guest'));
    _changed();
    onAttention?.call();
  }

  /// `cast.ice`: approved (by the teacher, or automatically for their own device): get ready for the offer.
  Future<void> onIce(Map<String, dynamic> e) async {
    final id = e['castId'] as String?;
    if (id == null) return;
    var t = tile(id);
    if (t == null) {
      t = CastTile(id: id, name: e['name'] as String? ?? '?', teacher: e['role'] == 'teacher', guest: e['role'] == 'guest');
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
      t.queued.insertAll(0, _early.remove(id) ?? const []);
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
      // Replay what arrived while WebRTC was starting, in order, then take messages directly.
      while (t.queued.isNotEmpty && t.receiver == r) {
        await r.handleSignal(t.queued.removeAt(0));
      }
      t.ready = true;
    } catch (err) {
      debugPrint('Cast $id: $err');
      await stop(id);
    }
  }

  /// `cast.signal`: the sender's offer or an ICE candidate.
  Future<void> onSignal(Map<String, dynamic> e) async {
    final id = e['castId'] as String? ?? '';
    final data = e['data'];
    if (data is! Map) return;
    final msg = Map<String, dynamic>.from(data);
    final t = tile(id);
    if (t == null) {
      (_early[id] ??= []).add(msg);
    } else if (!t.ready) {
      t.queued.add(msg);
    } else {
      await t.receiver?.handleSignal(msg);
    }
  }

  /// `cast.ended`: the sender left, the teacher or the class ended it.
  void onEnded(Map<String, dynamic> e) {
    final id = e['castId'] as String? ?? '';
    _early.remove(id);
    final t = tile(id);
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

  void setLayout(CastLayout l) {
    layout = l;
    focusedId = null;
    _changed();
  }

  /// Makes a screen the presenter (first, and largest in the automatic layout), or stops presenting it.
  void promote(String id) {
    final t = tile(id);
    if (t == null) return;
    presenterId = presenterId == id ? null : id;
    if (presenterId == id) {
      t.muted = false;
      emit(CastEvents.control, {'castId': id, 'action': 'promote'});
    }
    _changed();
  }

  /// Pauses a screen on the board (it stays connected), or shows it again; the sender is told.
  void toggleMute(String id) {
    final t = tile(id);
    if (t == null) return;
    t.muted = !t.muted;
    emit(CastEvents.control, {'castId': id, 'action': t.muted ? 'mute' : 'unmute'});
    _changed();
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
    _early.remove(t.id);
    if (focusedId == t.id) focusedId = null;
    if (presenterId == t.id) presenterId = null;
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
