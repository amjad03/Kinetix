import 'dart:collection';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'board_background.dart';
import 'ink_canvas.dart';
import 'ink_controller.dart';
import 'ink_models.dart';
import 'serialization.dart';

/// Lesson recordings: the board's ink as a timed event log, played back in sync with the
/// teacher's voice. The format is what `PUT /v1/recordings/:id/events` stores:
///
/// ```json
/// {"v": 1, "canvas": {"w": 1920, "h": 1080}, "background": "plain", "durationMs": 1234,
///  "events": [[t, "b", id, stroke], [t, "p", id, x, y, …], …]}
/// ```
///
/// Each event is `[milliseconds, kind, …]`:
///
/// | kind | arguments | meaning |
/// |---|---|---|
/// | `L` | pages, index | every page's strokes (`[[[id, stroke], …], …]`) and the open page |
/// | `b` | id, stroke | a stroke started, with its first points |
/// | `p` | id, x, y, … | points added to a stroke being drawn |
/// | `u` | id, x, y, … | all points of a shape being dragged out |
/// | `e` | id | the stroke was finished |
/// | `a` | id, stroke, index? | a whole stroke appeared (undo of an erase, redo), at that position |
/// | `x` | id, … | strokes removed (erased, undone, cleared) |
/// | `m` | dx, dy, id, … | strokes moved |
/// | `g` | index | turned to another page |
/// | `n` | index | inserted a blank page there and opened it |
/// | `k` | background | the background changed |
///
/// Strokes use the saved-board encoding ([encodeStroke]). Coordinates are canvas pixels to
/// 0.1 px.

const int lessonFormatVersion = 1;

double _r1(double v) => (v * 10).roundToDouble() / 10;

List<double> _flat(Iterable<InkPoint> points) => [for (final p in points) ...[_r1(p.x), _r1(p.y)]];

/// Records the pages of a board while the teacher teaches.
///
/// It watches [BoardPages] and the open page's [InkController] and writes down what changed
/// after each update, so the ink engine needs no recording hooks of its own.
class LessonRecorder {
  LessonRecorder({required this.pages, required BoardBackground background, required this.canvas, Stopwatch? stopwatch})
      : _background = background,
        _clock = stopwatch ?? Stopwatch();

  final BoardPages pages;

  /// The canvas size the strokes are drawn on.
  Size canvas;
  BoardBackground _background;
  final Stopwatch _clock;
  final List<List<Object?>> _events = [];

  final Expando<int> _ids = Expando('lessonStrokeId');
  int _nextId = 0;

  InkController? _page;
  final Set<InkController> _seenPages = HashSet.identity();
  int _pageCount = 0;

  /// What the player knows about each finished stroke of the open page.
  final Map<int, _Known> _known = {};

  /// Strokes being drawn on the open page: points sent so far, and the shape points last sent.
  final Map<int, int> _sentPoints = {};
  final Map<int, int> _lastShapeUpdate = {};
  final Map<int, String> _shapeSig = {};

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
    pages.addListener(_onPages);
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

  /// Stops and returns the event log, ready to upload.
  Map<String, Object?> stop() {
    if (_recording) {
      _sync();
      _clock.stop();
      pages.removeListener(_onPages);
      _page?.removeListener(_sync);
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

  int _id(Stroke s) => _ids[s] ??= _nextId++;

  /// Everything on every page, as it is now.
  void _snapshot() {
    final all = <List<Object?>>[];
    final controllers = pages.controllers;
    for (final c in controllers) {
      all.add([
        for (final s in c.strokes) [_id(s), encodeStroke(s)],
      ]);
    }
    _seenPages
      ..clear()
      ..addAll(controllers);
    _pageCount = pages.count;
    _events.add([_t, 'L', all, pages.index]);
    _events.add([_t, 'k', _background.name]); // a live viewer may join after a change
    _attach(pages.current, emit: false);
  }

  void _onPages() {
    if (_paused) return;
    final current = pages.current;
    if (identical(current, _page) && pages.count == _pageCount) return;
    _sync(); // flush the page we are leaving
    if (_seenPages.contains(current) && pages.count == _pageCount) {
      _events.add([_t, 'g', pages.index]);
      _attach(current, emit: false);
    } else if (!_seenPages.contains(current) && pages.count == _pageCount + 1 && current.strokes.isEmpty) {
      _events.add([_t, 'n', pages.index]);
      _seenPages.add(current);
      _pageCount = pages.count;
      _attach(current, emit: false);
    } else {
      _snapshot(); // a saved board was opened
    }
  }

  void _attach(InkController page, {required bool emit}) {
    _page?.removeListener(_sync);
    _page = page;
    _known
      ..clear()
      ..addEntries(page.strokes.map((s) => MapEntry(_id(s), _Known.of(s))));
    _sentPoints.clear();
    _lastShapeUpdate.clear();
    _shapeSig.clear();
    page.addListener(_sync);
    if (emit) _sync();
  }

  /// Compares the open page with what the player knows and writes the difference.
  void _sync() {
    final page = _page;
    if (page == null || _paused || !_recording) return;
    final t = _t;
    final out = <List<Object?>>[];

    // Strokes being drawn.
    final activeIds = <int>{};
    for (final s in page.activeStrokes) {
      final id = _id(s);
      activeIds.add(id);
      final sent = _sentPoints[id];
      if (sent == null) {
        out.add([t, 'b', id, encodeStroke(s)]);
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

    // Finished strokes.
    final removed = <int>[];
    final moves = <String, (double, double, List<int>)>{};
    final present = <int>{};
    final strokes = page.strokes;
    for (var i = 0; i < strokes.length; i++) {
      final s = strokes[i];
      final id = _id(s);
      present.add(id);
      final known = _known[id];
      if (known != null) {
        if (s.points.length != known.length) {
          // Changed in a way the player cannot follow: replace it.
          removed.add(id);
          out.add([t, 'a', id, encodeStroke(s), i]);
          _known[id] = _Known.of(s);
        } else if (s.points.isNotEmpty) {
          final dx = _r1(s.points.first.x - known.x), dy = _r1(s.points.first.y - known.y);
          if (dx != 0 || dy != 0) {
            moves.putIfAbsent('$dx,$dy', () => (dx, dy, <int>[])).$3.add(id);
            known.x = _r1(known.x + dx);
            known.y = _r1(known.y + dy);
          }
        }
      } else if (_sentPoints.containsKey(id) && !activeIds.contains(id)) {
        // Just finished.
        if (s.shape != null) {
          if (_sig(s) != _shapeSig[id]) out.add(_shapeEvent(t, id, s));
        } else if (s.points.length > _sentPoints[id]!) {
          out.add([t, 'p', id, ..._flat(s.points.skip(_sentPoints[id]!))]);
        }
        out.add([t, 'e', id]);
        _forgetActive(id);
        _known[id] = _Known.of(s);
      } else {
        // Undo puts an erased stroke back where it was, so send its position too.
        out.add([t, 'a', id, encodeStroke(s), i]);
        _known[id] = _Known.of(s);
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

    // Removals first, so a replaced stroke is removed before it is added back.
    if (removed.isNotEmpty) _events.add([t, 'x', ...removed]);
    _events.addAll(out);
    for (final (dx, dy, ids) in moves.values) {
      _events.add([t, 'm', dx, dy, ...ids]);
    }
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

  String _sig(Stroke s) => s.points.isEmpty ? '' : '${s.points.length}:${_r1(s.points.last.x)},${_r1(s.points.last.y)}:${_r1(s.points.first.x)},${_r1(s.points.first.y)}';
}

class _Known {
  _Known(this.x, this.y, this.length);
  factory _Known.of(Stroke s) => _Known(s.points.isEmpty ? 0 : _r1(s.points.first.x), s.points.isEmpty ? 0 : _r1(s.points.first.y), s.points.length);

  /// The first point as the player has it (rounded the same way).
  double x;
  double y;
  final int length;
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
  LessonPlayer(this.lesson) {
    _reset();
  }

  /// An empty player that live events are applied to with [applyLive].
  LessonPlayer.live({Size canvas = const Size(1920, 1080)})
      : this(Lesson(canvas: canvas, background: BoardBackground.plain, duration: Duration.zero, events: []));

  final Lesson lesson;

  late List<_Page> _pages;
  int _index = 0;
  late BoardBackground _background;
  int _cursor = 0;
  Duration _position = Duration.zero;

  Duration get position => _position;
  int get pageIndex => _index;
  int get pageCount => _pages.length;
  BoardBackground get background => _background;

  /// The open page's strokes at [position], oldest first.
  List<Stroke> get strokes => List.unmodifiable(_pages[_index].strokes);

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
    notifyListeners();
  }

  void _reset() {
    _pages = [_Page()];
    _index = 0;
    _background = BoardBackground.plain;
    _cursor = 0;
    _position = Duration.zero;
    // The opening snapshot shows straight away.
    final events = lesson.events;
    while (_cursor < events.length && (events[_cursor][0] as num) <= 0) {
      _apply(events[_cursor]);
      _cursor++;
    }
  }

  void _apply(List<dynamic> e) {
    final page = _pages[_index];
    switch (e[1]) {
      case 'L':
        _pages = [
          for (final p in e[2] as List<dynamic>)
            _Page()..addAll([
              for (final entry in p as List<dynamic>)
                if (_decode(entry[1], (entry[0] as num).toInt()) case final s?) ((entry[0] as num).toInt(), s),
            ]),
        ];
        if (_pages.isEmpty) _pages.add(_Page());
        _index = ((e[3] as num?) ?? 0).toInt().clamp(0, _pages.length - 1);
      case 'b' || 'a':
        final id = (e[2] as num).toInt();
        final s = _decode(e[3], id);
        if (s != null) {
          page.remove(id);
          page.insert(id, s, e.length > 4 ? (e[4] as num).toInt() : null);
        }
      case 'p':
        page[(e[2] as num).toInt()]?.points.addAll(_points(e, 3));
      case 'u':
        page[(e[2] as num).toInt()]?.points
          ?..clear()
          ..addAll(_points(e, 3));
      case 'x':
        for (final id in e.skip(2)) {
          page.remove((id as num).toInt());
        }
      case 'm':
        final d = Offset((e[2] as num).toDouble(), (e[3] as num).toDouble());
        for (final id in e.skip(4)) {
          page[(id as num).toInt()]?.translate(d);
        }
      case 'g':
        _index = (e[2] as num).toInt().clamp(0, _pages.length - 1);
      case 'n':
        final at = (e[2] as num).toInt().clamp(0, _pages.length);
        _pages.insert(at, _Page());
        _index = at;
      case 'k':
        _background = BoardBackground.values.asNameMap()[e[2]] ?? _background;
      default:
        break; // 'e', and kinds added by newer boards
    }
  }

  static Stroke? _decode(dynamic raw, int id) => raw is Map<String, dynamic> ? decodeStroke(raw, 'r$id') : null;

  static Iterable<InkPoint> _points(List<dynamic> e, int from) sync* {
    for (var i = from; i + 1 < e.length; i += 2) {
      yield InkPoint((e[i] as num).toDouble(), (e[i + 1] as num).toDouble());
    }
  }
}

/// One page during playback: strokes in drawing order, found by id.
class _Page {
  final List<Stroke> strokes = [];
  final Map<int, Stroke> _byId = {};

  Stroke? operator [](int id) => _byId[id];

  void addAll(Iterable<(int, Stroke)> entries) {
    for (final (id, s) in entries) {
      insert(id, s, null);
    }
  }

  void insert(int id, Stroke s, int? at) {
    _byId[id] = s;
    if (at == null || at >= strokes.length) {
      strokes.add(s);
    } else {
      strokes.insert(at < 0 ? 0 : at, s);
    }
  }

  void remove(int id) {
    final s = _byId.remove(id);
    if (s != null) strokes.remove(s);
  }
}

/// Shows a [LessonPlayer]'s board, scaled to fit, read-only.
class LessonView extends StatelessWidget {
  const LessonView({super.key, required this.player});

  final LessonPlayer player;

  @override
  Widget build(BuildContext context) {
    final size = player.lesson.canvas;
    return FittedBox(
      fit: BoxFit.contain,
      child: SizedBox.fromSize(
        size: size,
        child: ClipRect(child: CustomPaint(painter: _LessonPainter(player), size: size)),
      ),
    );
  }
}

class _LessonPainter extends CustomPainter {
  _LessonPainter(this.player) : super(repaint: player);

  final LessonPlayer player;

  @override
  void paint(Canvas canvas, Size size) {
    BackgroundPainter(player.background).paint(canvas, size);
    for (final s in player.strokes) {
      paintStroke(canvas, s, player.background);
    }
  }

  @override
  bool shouldRepaint(_LessonPainter old) => old.player != player;
}
