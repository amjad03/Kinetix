import 'dart:async';
import 'dart:collection';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

import 'board_background.dart';
import 'element_painting.dart';
import 'ink_controller.dart';
import 'ink_models.dart';
import 'math_layer.dart';
import 'serialization.dart';
import 'whiteboard_controller.dart';

/// Lesson recordings and the live view: the board as a timed event log, played back in sync
/// with the teacher's voice, or applied as it arrives. The format is what
/// `PUT /v1/recordings/:id/events` stores and what `live.frame` carries:
///
/// ```json
/// {"v": 2, "canvas": {"w": 1920, "h": 1080}, "background": "plain", "durationMs": 1234,
///  "events": [[t, "b", id, stroke], [t, "p", id, x, y, …], …]}
/// ```
///
/// Each event is `[milliseconds, kind, …]`:
///
/// | kind | arguments | meaning |
/// |---|---|---|
/// | `L` | pages, index | every page's elements (`[[[id, element], …], …]`) and the open page |
/// | `b` | id, stroke | a stroke started, with its first points |
/// | `p` | id, x, y, … | points added to a stroke being drawn |
/// | `u` | id, x, y, … | all points of a shape (or a ruler line) being dragged out |
/// | `e` | id | the stroke was finished |
/// | `a` | id, element, index? | a whole element appeared (added, undone, edited), at that position |
/// | `x` | id, … | elements removed (erased, undone, deleted, cleared) |
/// | `m` | dx, dy, id, … | elements moved |
/// | `g` | index | turned to another page |
/// | `n` | index | inserted a blank page there and opened it |
/// | `k` | background | the background changed |
/// | `v` | left, top, width, height | (v2) the part of the endless board the class sees |
/// | `z` | x, y, … | (v2) laser pointer points (a trail that fades in a second) |
///
/// Elements use the saved-board encoding ([encodeElement]): strokes as in version 1, other
/// kinds with their own `t`. A picture's bytes travel once per stream: the first time with
/// `d` (base64) and `ri` (a number for it), afterwards as `ref`. Coordinates are board units
/// to 0.1. Players skip kinds and elements they do not know, so version 1 players still show
/// a version 2 board's strokes, and version 1 logs play unchanged.

const int lessonFormatVersion = 2;

double _r1(double v) => (v * 10).roundToDouble() / 10;

List<double> _flat(Iterable<InkPoint> points) => [
  for (final p in points) ...[_r1(p.x), _r1(p.y)],
];

/// Records a board while the teacher teaches: the [WhiteboardController], or the older
/// [BoardPages].
///
/// It watches the board and writes down what changed after each update, so the board needs no
/// recording hooks of its own. Moves are recognised from [BoardElement.translated], so a dragged
/// selection streams as small moves rather than whole elements.
class LessonRecorder {
  LessonRecorder({RecordableBoard? board, BoardPages? pages, required BoardBackground background, required this.canvas, Stopwatch? stopwatch})
    : assert(board != null || pages != null),
      board = board ?? pages!,
      _background = background,
      _clock = stopwatch ?? Stopwatch();

  final RecordableBoard board;

  /// The screen size the board is drawn on.
  Size canvas;
  BoardBackground _background;
  final Stopwatch _clock;
  final List<List<Object?>> _events = [];

  final Expando<int> _ids = Expando('lessonElementId');
  int _nextId = 0;

  Listenable? _listening;
  Object? _page;
  final Set<Object> _seenPages = HashSet.identity();
  int _pageCount = 0;

  /// What the player knows about each finished element of the open page.
  final Map<int, _Known> _known = {};

  /// Strokes being drawn on the open page: points sent so far, and the shape points last sent.
  final Map<int, int> _sentPoints = {};
  final Map<int, int> _lastShapeUpdate = {};
  final Map<int, String> _shapeSig = {};

  // Pictures sent in this stream (by bytes identity), so each goes once.
  final Expando<int> _imageIds = Expando('lessonImageId');
  int _nextImage = 0;
  final Set<int> _sentImages = {};

  // The view and the laser.
  Rect? _sentView;
  int _lastViewAt = -1000;
  Timer? _viewTimer;
  int _lastLaser = 0;

  bool _recording = false;
  bool _paused = false;

  bool get isRecording => _recording;
  bool get isPaused => _paused;
  Duration get elapsed => _clock.elapsed;
  int get eventCount => _events.length;

  int get _t => _clock.elapsedMilliseconds;

  /// Starts a new recording (an earlier one's events are discarded).
  void start() {
    assert(!_recording, 'Already recording');
    _recording = true;
    _paused = false;
    _events.clear();
    _clock
      ..reset()
      ..start();
    _listen();
    _snapshot();
  }

  void pause() {
    if (!_recording || _paused) return;
    _paused = true;
    _clock.stop();
  }

  /// Carries on; whatever changed during the pause appears at once.
  void resume() {
    if (!_recording || !_paused) return;
    _paused = false;
    _clock.start();
    _snapshot();
  }

  set background(BoardBackground b) {
    if (b == _background) return;
    _background = b;
    if (_recording && !_paused) _events.add([_t, 'k', b.name]);
  }

  /// A chapter marker at this moment (spec §56): `[t, 'c', title]`. Players that predate
  /// markers skip it.
  void mark(String title) {
    if (_recording) _events.add([_t, 'c', title.trim().isEmpty ? 'Chapter' : title.trim()]);
  }

  /// Stops and returns the event log, ready to upload.
  Map<String, Object?> stop() {
    if (_recording) {
      _sync();
      _clock.stop();
      _listening?.removeListener(_onChange);
      _listening = null;
      _viewTimer?.cancel();
      _page = null;
      _recording = false;
    }
    return toJson();
  }

  /// Live view: hands over the events written since the last call and forgets them, so a
  /// recorder used for streaming does not grow. Do not use on a recorder that is saving a
  /// lesson (its log would lose these events).
  List<List<Object?>> drain() {
    final out = List<List<Object?>>.of(_events);
    _events.clear();
    return out;
  }

  /// Writes a full snapshot of every page now (a new live viewer joined).
  void snapshotNow() {
    if (!_recording || _paused) return;
    _sync();
    _snapshot();
  }

  Map<String, Object?> toJson() => {
    'v': lessonFormatVersion,
    'canvas': {'w': canvas.width.round(), 'h': canvas.height.round()},
    'background': _background.name,
    'durationMs': _clock.elapsedMilliseconds,
    'events': _events,
  };

  void _listen() {
    final l = board.changes;
    if (identical(l, _listening)) return;
    _listening?.removeListener(_onChange);
    _listening = l..addListener(_onChange);
  }

  /// The stream id of [e]: its own, or (for a moved copy) the id of what it was moved from.
  int _id(BoardElement e, [Set<int>? taken]) {
    final own = _ids[e];
    if (own != null) return own;
    BoardElement? cur = e;
    for (var depth = 0; depth < 256 && cur != null; depth++) {
      final from = movedFromOf(cur)?.$1;
      if (from == null) break;
      final id = _ids[from];
      if (id != null && (taken == null || !taken.contains(id))) return _ids[e] = id;
      cur = from;
    }
    return _ids[e] = _nextId++;
  }

  /// How far [e] was moved from [known], when it was made from it only by moves.
  static Offset? _movedBy(BoardElement e, BoardElement known) {
    var d = Offset.zero;
    BoardElement? cur = e;
    for (var depth = 0; depth < 256 && cur != null; depth++) {
      if (identical(cur, known)) return d;
      final from = movedFromOf(cur);
      if (from == null) return null;
      d += from.$2;
      cur = from.$1;
    }
    return null;
  }

  /// [e] as JSON. A picture's bytes go once per stream: the first time with its number (`ri`),
  /// then by that number (`ref`).
  Map<String, dynamic> _encode(BoardElement e) {
    final j = encodeElement(
      e,
      imageRef: (bytes) {
        final id = _imageIds[bytes] ??= _nextImage++;
        return _sentImages.add(id) ? null : id;
      },
    );
    if (e is ImageElement && j.containsKey('d')) j['ri'] = _imageIds[e.bytes];
    return j;
  }

  /// Everything on every page, as it is now.
  void _snapshot() {
    _sentImages.clear();
    final all = <List<Object?>>[];
    final keys = board.pageKeys;
    for (var i = 0; i < keys.length; i++) {
      final taken = <int>{};
      final page = <List<Object?>>[];
      for (final e in board.elementsOf(i)) {
        final id = _id(e, taken);
        taken.add(id);
        page.add([id, _encode(e)]);
      }
      all.add(page);
    }
    _seenPages
      ..clear()
      ..addAll(keys);
    _pageCount = keys.length;
    _events.add([_t, 'L', all, board.pageIndex]);
    _background = board.background ?? _background;
    _events.add([_t, 'k', _background.name]); // a live viewer may join after a change
    _sentView = null;
    _lastViewAt = -1000;
    _lastLaser = board.laserPoints.isEmpty ? 0 : board.laserPoints.last.t;
    _attach(emit: false);
    _syncView();
  }

  void _onChange() {
    if (_paused || !_recording) return;
    final keys = board.pageKeys;
    final current = keys[board.pageIndex];
    if (!identical(current, _page) || keys.length != _pageCount) {
      _sync(); // what happened on the page we are leaving, while it still exists
      _flushOpenPage();
      if (_seenPages.contains(current) && keys.length == _pageCount) {
        _events.add([_t, 'g', board.pageIndex]);
        _attach(emit: false);
      } else if (!_seenPages.contains(current) && keys.length == _pageCount + 1 && board.elementsOf(board.pageIndex).isEmpty) {
        _events.add([_t, 'n', board.pageIndex]);
        _seenPages.add(current);
        _pageCount = keys.length;
        _attach(emit: false);
      } else {
        _snapshot(); // a saved board was opened, or pages were removed or reordered
      }
    }
    _listen();
    _sync();
  }

  void _attach({required bool emit}) {
    _page = board.pageKeys[board.pageIndex];
    _known.clear();
    final taken = <int>{};
    for (final e in board.elementsOf(board.pageIndex)) {
      final id = _id(e, taken);
      taken.add(id);
      _known[id] = _Known.of(e);
    }
    _sentPoints.clear();
    _lastShapeUpdate.clear();
    _shapeSig.clear();
    if (emit) _sync();
  }

  /// Sends what the player does not yet know of the page being left. The page index has
  /// already moved on, so this only finishes strokes; the next snapshot or page covers the rest.
  void _flushOpenPage() {
    _sentPoints.clear();
    _lastShapeUpdate.clear();
    _shapeSig.clear();
  }

  /// Compares the page the player has open with the board and writes the difference.
  void _sync() {
    if (_page == null || _paused || !_recording) return;
    final pageAt = board.pageKeys.indexWhere((k) => identical(k, _page));
    if (pageAt < 0) return; // the page was removed; a snapshot follows
    final open = pageAt == board.pageIndex;
    final t = _t;
    final out = <List<Object?>>[];

    // Strokes being drawn.
    final activeIds = <int>{};
    for (final s in open ? board.activeStrokes : const <Stroke>[]) {
      final id = _id(s);
      activeIds.add(id);
      final sent = _sentPoints[id];
      if (sent == null) {
        out.add([t, 'b', id, _encode(s)]);
        _sentPoints[id] = s.points.length;
        if (s.shape != null) {
          _lastShapeUpdate[id] = t;
          _shapeSig[id] = _sig(s);
        }
      } else if (s.shape != null) {
        // Shapes are re-computed on every move; send them at most ~30 times a second.
        if (t - (_lastShapeUpdate[id] ?? 0) >= 33 && _sig(s) != _shapeSig[id]) out.add(_shapeEvent(t, id, s));
      } else if (s.points.length > sent) {
        out.add([t, 'p', id, ..._flat(s.points.skip(sent))]);
        _sentPoints[id] = s.points.length;
      }
    }

    // Finished elements.
    final removed = <int>[];
    final moves = <String, (double, double, List<int>)>{};
    final present = <int>{};
    final elements = board.elementsOf(pageAt);
    for (var i = 0; i < elements.length; i++) {
      final e = elements[i];
      final id = _id(e, present);
      present.add(id);
      final known = _known[id];
      if (known != null) {
        if (identical(known.element, e)) {
          // The same object: only the older board changes strokes in place.
          if (e is! Stroke) continue;
          if (e.points.length != known.length) {
            // Changed in a way the player cannot follow: replace it.
            removed.add(id);
            out.add([t, 'a', id, _encode(e), i]);
            _known[id] = _Known.of(e);
          } else if (e.points.isNotEmpty) {
            _addMove(moves, id, known, Offset(e.points.first.x - known.x, e.points.first.y - known.y), absolute: true);
          }
        } else if (_movedBy(e, known.element) case final d?) {
          _addMove(moves, id, known, d);
          known.element = e;
        } else {
          removed.add(id);
          out.add([t, 'a', id, _encode(e), i]);
          _known[id] = _Known.of(e);
        }
      } else if (_sentPoints.containsKey(id) && !activeIds.contains(id) && e is Stroke) {
        // Just finished.
        if (e.shape != null) {
          if (_sig(e) != _shapeSig[id]) out.add(_shapeEvent(t, id, e));
        } else if (e.points.length > _sentPoints[id]!) {
          out.add([t, 'p', id, ..._flat(e.points.skip(_sentPoints[id]!))]);
        }
        out.add([t, 'e', id]);
        _forgetActive(id);
        _known[id] = _Known.of(e);
      } else {
        // New, or put back by undo: send its position too.
        out.add([t, 'a', id, _encode(e), i]);
        _known[id] = _Known.of(e);
      }
    }
    for (final id in _known.keys.toList()) {
      if (!present.contains(id)) {
        removed.add(id);
        _known.remove(id);
      }
    }
    // Strokes abandoned mid-draw (a cancelled pointer, a shape tap too small to keep).
    for (final id in _sentPoints.keys.toList()) {
      if (!activeIds.contains(id) && !present.contains(id)) {
        removed.add(id);
        _forgetActive(id);
      }
    }

    // Removals first, so a replaced element is removed before it is added back.
    if (removed.isNotEmpty) _events.add([t, 'x', ...removed]);
    _events.addAll(out);
    for (final (dx, dy, ids) in moves.values) {
      _events.add([t, 'm', dx, dy, ...ids]);
    }
    if (open) {
      _syncView();
      _syncLaser();
    }
    // A board that knows its paper: follow it without being told.
    final bg = board.background;
    if (bg != null && bg != _background) {
      _background = bg;
      _events.add([t, 'k', bg.name]);
    }
  }

  /// Notes a move for the player, carrying the rounding left over so positions never drift.
  void _addMove(Map<String, (double, double, List<int>)> moves, int id, _Known known, Offset d, {bool absolute = false}) {
    final want = absolute ? d : d + known.residual;
    final dx = _r1(want.dx), dy = _r1(want.dy);
    if (absolute) {
      known
        ..x = _r1(known.x + dx)
        ..y = _r1(known.y + dy);
    } else {
      known.residual = want - Offset(dx, dy);
    }
    if (dx == 0 && dy == 0) return;
    moves.putIfAbsent('$dx,$dy', () => (dx, dy, <int>[])).$3.add(id);
  }

  void _syncView() {
    final area = board.visibleArea;
    if (area == null || area.isEmpty || !area.isFinite) return;
    final r = Rect.fromLTWH(area.left.roundToDouble(), area.top.roundToDouble(), area.width.roundToDouble(), area.height.roundToDouble());
    if (r == _sentView) return;
    // At most ten times a second; the last position always goes.
    final wait = 100 - (_t - _lastViewAt);
    if (wait > 0 && _sentView != null) {
      _viewTimer ??= Timer(Duration(milliseconds: wait), () {
        _viewTimer = null;
        if (_recording && !_paused) _syncView();
      });
      return;
    }
    _sentView = r;
    _lastViewAt = _t;
    _events.add([_t, 'v', r.left, r.top, r.width, r.height]);
  }

  void _syncLaser() {
    final pts = board.laserPoints;
    if (pts.isEmpty || pts.last.t <= _lastLaser) return;
    final fresh = pts.where((p) => p.t > _lastLaser).toList();
    _lastLaser = pts.last.t;
    _events.add([
      _t,
      'z',
      for (final p in fresh) ...[_r1(p.at.dx), _r1(p.at.dy)],
    ]);
  }

  List<Object?> _shapeEvent(int t, int id, Stroke s) {
    _lastShapeUpdate[id] = t;
    _shapeSig[id] = _sig(s);
    return [t, 'u', id, ..._flat(s.points)];
  }

  void _forgetActive(int id) {
    _sentPoints.remove(id);
    _lastShapeUpdate.remove(id);
    _shapeSig.remove(id);
  }

  String _sig(Stroke s) => s.points.isEmpty
      ? ''
      : '${s.points.length}:${_r1(s.points.last.x)},${_r1(s.points.last.y)}:${_r1(s.points.first.x)},${_r1(s.points.first.y)}';
}

class _Known {
  _Known(this.element, this.x, this.y, this.length);
  factory _Known.of(BoardElement e) => e is Stroke
      ? _Known(e, e.points.isEmpty ? 0 : _r1(e.points.first.x), e.points.isEmpty ? 0 : _r1(e.points.first.y), e.points.length)
      : _Known(e, 0, 0, 0);

  /// The element as the player has it (the newest version, after moves).
  BoardElement element;

  /// A stroke's first point as the player has it (rounded the same way), for strokes the older
  /// board moves in place.
  double x;
  double y;
  final int length;

  /// What rounding has left unsent of moves so far.
  Offset residual = Offset.zero;
}

/// A downloaded recording's event log.
class Lesson {
  Lesson({required this.canvas, required this.background, required this.duration, required this.events});

  factory Lesson.fromJson(Map<String, dynamic> j) {
    final c = j['canvas'] as Map<String, dynamic>?;
    final events = [for (final e in (j['events'] as List<dynamic>? ?? const [])) (e as List<dynamic>)];
    final last = events.isEmpty ? 0 : (events.last[0] as num).toInt();
    return Lesson(
      canvas: Size(((c?['w'] as num?) ?? 1920).toDouble(), ((c?['h'] as num?) ?? 1080).toDouble()),
      background: BoardBackground.values.asNameMap()[j['background']] ?? BoardBackground.plain,
      duration: Duration(milliseconds: math.max(((j['durationMs'] as num?) ?? 0).toInt(), last)),
      events: events,
    );
  }

  final Size canvas;

  /// The background when recording ended (events carry the changes).
  final BoardBackground background;
  final Duration duration;
  final List<List<dynamic>> events;
}

/// Rebuilds the board at any moment of a [Lesson]. The app moves [position] along with the
/// audio (or a ticker when there is none); seeking backwards replays from the start, which
/// takes a few milliseconds even for an hour-long lesson.
class LessonPlayer extends ChangeNotifier {
  LessonPlayer(this.lesson) : _live = false {
    _reset();
  }

  /// An empty player that live events are applied to with [applyLive].
  LessonPlayer.live({Size canvas = const Size(1920, 1080)})
    : lesson = Lesson(canvas: canvas, background: BoardBackground.plain, duration: Duration.zero, events: []),
      _live = true {
    _reset();
  }

  final Lesson lesson;
  final bool _live;

  late List<_Page> _pages;
  int _index = 0;
  late BoardBackground _background;
  int _cursor = 0;
  Duration _position = Duration.zero;
  Rect? _view;
  final Map<int, Uint8List> _images = {};
  final List<LaserPoint> _laser = [];

  /// Decoded pictures for painting this board (disposed with the player).
  final images = BoardImages();

  Duration get position => _position;
  int get pageIndex => _index;
  int get pageCount => _pages.length;
  BoardBackground get background => _background;

  /// The open page's strokes at [position], oldest first.
  List<Stroke> get strokes => List.unmodifiable(_pages[_index].elements.whereType<Stroke>());

  /// Everything on the open page at [position], bottom first.
  List<BoardElement> get elements => List.unmodifiable(_pages[_index].elements);

  /// The part of the board the class saw, or null when the board did not say (the canvas).
  Rect? get visibleArea => _view;

  /// The laser trail still glowing: points with the time they appeared (player time for
  /// recordings, wall-clock time for live).
  List<LaserPoint> get laser => List.unmodifiable(_laser);

  /// The time the laser fades against.
  int get laserNow => _live ? DateTime.now().millisecondsSinceEpoch : _position.inMilliseconds;

  /// Live view: applies events as they arrive from the board, straight away.
  void applyLive(Iterable<List<dynamic>> events) {
    for (final e in events) {
      _apply(e);
    }
    notifyListeners();
  }

  void seek(Duration to) {
    if (to < Duration.zero) to = Duration.zero;
    if (to > lesson.duration) to = lesson.duration;
    if (to < _position) _reset();
    final ms = to.inMilliseconds;
    final events = lesson.events;
    while (_cursor < events.length && (events[_cursor][0] as num) <= ms) {
      _apply(events[_cursor]);
      _cursor++;
    }
    _position = to;
    _laser.removeWhere((p) => ms - p.t > WhiteboardController.laserLife);
    notifyListeners();
  }

  void _reset() {
    _pages = [_Page()];
    _index = 0;
    _background = BoardBackground.plain;
    _cursor = 0;
    _position = Duration.zero;
    _view = null;
    _laser.clear();
    // The opening snapshot shows straight away.
    final events = lesson.events;
    while (_cursor < events.length && (events[_cursor][0] as num) <= 0) {
      _apply(events[_cursor]);
      _cursor++;
    }
  }

  void _apply(List<dynamic> e) {
    if (e.length < 2) return;
    final page = _pages[_index];
    try {
      switch (e[1]) {
        case 'L':
          _pages = [
            for (final p in e[2] as List<dynamic>)
              _Page()..addAll([
                for (final entry in p as List<dynamic>)
                  if (_decode(entry[1], (entry[0] as num).toInt()) case final el?) ((entry[0] as num).toInt(), el),
              ]),
          ];
          if (_pages.isEmpty) _pages.add(_Page());
          _index = ((e[3] as num?) ?? 0).toInt().clamp(0, _pages.length - 1);
        case 'b' || 'a':
          final id = (e[2] as num).toInt();
          final el = _decode(e[3], id);
          if (el != null) {
            page.remove(id);
            page.insert(id, el, e.length > 4 ? (e[4] as num).toInt() : null);
          }
        case 'p':
          final s = page[(e[2] as num).toInt()];
          if (s is Stroke) s.points.addAll(_points(e, 3));
        case 'u':
          final s = page[(e[2] as num).toInt()];
          if (s is Stroke) {
            s.points
              ..clear()
              ..addAll(_points(e, 3));
          }
        case 'x':
          for (final id in e.skip(2)) {
            page.remove((id as num).toInt());
          }
        case 'm':
          final d = Offset((e[2] as num).toDouble(), (e[3] as num).toDouble());
          for (final id in e.skip(4)) {
            page.move((id as num).toInt(), d);
          }
        case 'g':
          _index = (e[2] as num).toInt().clamp(0, _pages.length - 1);
        case 'n':
          final at = (e[2] as num).toInt().clamp(0, _pages.length);
          _pages.insert(at, _Page());
          _index = at;
        case 'k':
          _background = BoardBackground.values.asNameMap()[e[2]] ?? _background;
        case 'v':
          final r = Rect.fromLTWH((e[2] as num).toDouble(), (e[3] as num).toDouble(), (e[4] as num).toDouble(), (e[5] as num).toDouble());
          if (r.width > 0 && r.height > 0) _view = r;
        case 'z':
          final at = _live ? DateTime.now().millisecondsSinceEpoch : (e[0] as num).toInt();
          for (final p in _points(e, 2)) {
            _laser.add(LaserPoint(p.offset, at));
          }
          if (_laser.length > 400) _laser.removeRange(0, _laser.length - 400);
        default:
          break; // 'e', and kinds added by newer boards
      }
    } on Object {
      // A malformed event from a newer or broken board: skip it, keep playing.
    }
  }

  BoardElement? _decode(dynamic raw, int id) {
    if (raw is! Map<String, dynamic>) return null;
    final el = decodeElement(raw, 'r$id', image: (ref) => ref is num ? _images[ref.toInt()] : null);
    if (el is ImageElement && raw['ri'] is num) _images[(raw['ri'] as num).toInt()] = el.bytes;
    return el;
  }

  static Iterable<InkPoint> _points(List<dynamic> e, int from) sync* {
    for (var i = from; i + 1 < e.length; i += 2) {
      yield InkPoint((e[i] as num).toDouble(), (e[i + 1] as num).toDouble());
    }
  }

  @override
  void dispose() {
    images.dispose();
    super.dispose();
  }
}

/// One page during playback: elements in drawing order, found by id.
class _Page {
  final List<BoardElement> elements = [];
  final Map<int, BoardElement> _byId = {};

  BoardElement? operator [](int id) => _byId[id];

  void addAll(Iterable<(int, BoardElement)> entries) {
    for (final (id, s) in entries) {
      insert(id, s, null);
    }
  }

  void insert(int id, BoardElement s, int? at) {
    _byId[id] = s;
    if (at == null || at >= elements.length) {
      elements.add(s);
    } else {
      elements.insert(at < 0 ? 0 : at, s);
    }
  }

  void remove(int id) {
    final s = _byId.remove(id);
    if (s != null) elements.remove(s);
  }

  void move(int id, Offset d) {
    final s = _byId[id];
    if (s == null) return;
    if (s is Stroke) {
      s.translate(d); // strokes being drawn keep growing in place
      return;
    }
    final moved = s.translated(d);
    _byId[id] = moved;
    final i = elements.indexOf(s);
    if (i >= 0) elements[i] = moved;
  }
}

/// Shows a [LessonPlayer]'s board, read-only: the part the class saw (or the canvas, for older
/// recordings), scaled to fit.
class LessonView extends StatefulWidget {
  const LessonView({super.key, required this.player});

  final LessonPlayer player;

  @override
  State<LessonView> createState() => _LessonViewState();
}

class _LessonViewState extends State<LessonView> with SingleTickerProviderStateMixin {
  late final Ticker _ticker = createTicker((_) {
    // The laser fades by itself; keep repainting while it glows.
    if (widget.player.laser.isEmpty || widget.player.laserNow - widget.player.laser.last.t > WhiteboardController.laserLife) {
      _ticker.stop();
    }
    setState(() {});
  });

  @override
  void initState() {
    super.initState();
    widget.player.addListener(_onPlayer);
  }

  @override
  void didUpdateWidget(LessonView old) {
    super.didUpdateWidget(old);
    if (old.player != widget.player) {
      old.player.removeListener(_onPlayer);
      widget.player.addListener(_onPlayer);
    }
  }

  void _onPlayer() {
    if (widget.player.laser.isNotEmpty && !_ticker.isActive) _ticker.start();
    setState(() {});
  }

  @override
  void dispose() {
    widget.player.removeListener(_onPlayer);
    _ticker.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.player;
    final area = p.visibleArea ?? Offset.zero & p.lesson.canvas;
    return FittedBox(
      fit: BoxFit.contain,
      child: SizedBox.fromSize(
        size: area.size,
        child: ClipRect(
          child: Stack(
            children: [
              CustomPaint(painter: _LessonPainter(p, area), size: area.size),
              Positioned.fill(
                child: MathLayer(elements: p.elements, origin: area.topLeft, background: p.background),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _LessonPainter extends CustomPainter {
  _LessonPainter(this.player, this.area) : super(repaint: player.images);

  final LessonPlayer player;
  final Rect area;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.translate(-area.left, -area.top);
    paintBoardBackground(canvas, area, player.background);
    for (final e in player.elements) {
      if (e.bounds.overlaps(area.inflate(40))) paintElement(canvas, e, player.background, images: player.images);
    }
    paintLaser(canvas, player.laser, player.laserNow);
  }

  @override
  bool shouldRepaint(_LessonPainter old) => true;
}

/// The laser trail: a soft red glow with a bright core, fading over a second. Points are in the
/// canvas's units; [now] is the time the points' ages are measured against.
void paintLaser(Canvas canvas, List<LaserPoint> pts, int now, {double scale = 1}) {
  if (pts.isEmpty) return;
  for (var i = 1; i < pts.length; i++) {
    final age = now - pts[i].t;
    if (age > 900 || pts[i].t - pts[i - 1].t > 120) continue;
    final a = (1 - age / 900).clamp(0.0, 1.0);
    canvas.drawLine(
      pts[i - 1].at,
      pts[i].at,
      Paint()
        ..color = const Color(0xFFFF3B30).withValues(alpha: a * 0.35)
        ..strokeWidth = 14 / scale
        ..strokeCap = StrokeCap.round
        ..maskFilter = MaskFilter.blur(BlurStyle.normal, 6 / scale),
    );
    canvas.drawLine(
      pts[i - 1].at,
      pts[i].at,
      Paint()
        ..color = const Color(0xFFFF453A).withValues(alpha: a)
        ..strokeWidth = 4 / scale
        ..strokeCap = StrokeCap.round,
    );
  }
  final last = pts.last;
  if (now - last.t < 300) canvas.drawCircle(last.at, 7 / scale, Paint()..color = const Color(0xFFFF453A));
}

/// The chapter markers in a recorded lesson's event log: (milliseconds from the start, title).
List<(int, String)> lessonChapters(Map<String, Object?> log) => [
  for (final e in (log['events'] as List<dynamic>? ?? const []))
    if (e is List && e.length > 2 && e[1] == 'c') ((e[0] as num).toInt(), '${e[2]}'),
];
