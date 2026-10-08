import 'dart:convert';
import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

/// A stopwatch the test moves by hand.
class FakeStopwatch implements Stopwatch {
  int ms = 0;
  bool _running = false;

  void advance(int by) {
    if (_running) ms += by;
  }

  @override
  int get elapsedMilliseconds => ms;
  @override
  Duration get elapsed => Duration(milliseconds: ms);
  @override
  void start() => _running = true;
  @override
  void stop() => _running = false;
  @override
  void reset() => ms = 0;
  @override
  bool get isRunning => _running;
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  const pen = InkStyle(tool: InkTool.pen, color: Color(0xFF1A73E8), width: 4);
  late BoardPages pages;
  late FakeStopwatch clock;
  late LessonRecorder rec;

  setUp(() {
    pages = BoardPages();
    pages.current.style = pen;
    clock = FakeStopwatch();
    rec = LessonRecorder(pages: pages, background: BoardBackground.plain, canvas: const Size(1920, 1080), stopwatch: clock);
  });

  tearDown(() => pages.dispose());

  void draw(Offset from, Offset to, {int pointer = 1, int steps = 10}) {
    final ink = pages.current;
    ink.pointerDown(pointer, InkPoint(from.dx, from.dy));
    for (var i = 1; i <= steps; i++) {
      clock.advance(10);
      final o = Offset.lerp(from, to, i / steps)!;
      ink.pointerMove(pointer, InkPoint(o.dx, o.dy));
    }
    ink.pointerUp(pointer);
    clock.advance(100);
  }

  /// Round-trips through JSON, as the upload and download do.
  Lesson lesson() => Lesson.fromJson(jsonDecode(jsonEncode(rec.stop())) as Map<String, dynamic>);

  List<List<double>> shapeOf(List<Stroke> strokes) => [
        for (final s in strokes) [for (final p in s.points) ...[(p.x * 10).roundToDouble() / 10, (p.y * 10).roundToDouble() / 10]],
      ];

  void expectSameBoard(LessonPlayer player, List<Stroke> strokes) {
    expect(player.strokes, hasLength(strokes.length));
    final a = shapeOf(player.strokes), b = shapeOf(strokes);
    for (var i = 0; i < a.length; i++) {
      expect(a[i].length, b[i].length);
      for (var j = 0; j < a[i].length; j++) {
        expect(a[i][j], closeTo(b[i][j], 0.11));
      }
    }
  }

  test('plays strokes back as they were drawn, in time', () {
    rec.start();
    clock.advance(1000);
    draw(const Offset(100, 100), const Offset(300, 100));
    clock.advance(500);
    draw(const Offset(100, 200), const Offset(300, 250));
    final l = lesson();
    expect(l.duration, const Duration(milliseconds: 1000 + 200 + 500 + 200));

    final player = LessonPlayer(l);
    expect(player.strokes, isEmpty);
    player.seek(const Duration(milliseconds: 1050)); // halfway through the first line
    expect(player.strokes, hasLength(1));
    expect(player.strokes.single.points.length, inInclusiveRange(5, 7));
    expect(player.strokes.single.style.color, pen.color);

    player.seek(l.duration);
    expectSameBoard(player, pages.current.strokes);

    // Seeking back replays from the start.
    player.seek(const Duration(milliseconds: 1150));
    expect(player.strokes, hasLength(1));
  });

  test('follows erasing, undo, redo, clear and moving a selection', () {
    rec.start();
    draw(const Offset(100, 100), const Offset(400, 100));
    draw(const Offset(100, 300), const Offset(400, 300));
    final ink = pages.current;

    ink.undo();
    clock.advance(100);
    ink.redo();
    clock.advance(100);

    // Erase the first line.
    ink.style = pen.copyWith(tool: InkTool.eraser);
    ink.pointerDown(2, const InkPoint(250, 100));
    ink.pointerUp(2);
    final afterErase = clock.ms;
    clock.advance(100);
    ink.undo(); // brings it back
    clock.advance(100);

    // Box-select everything and drag it down by 50.3 px, in small steps.
    ink.style = pen.copyWith(tool: InkTool.select);
    ink.pointerDown(3, const InkPoint(50, 50));
    ink.pointerMove(3, const InkPoint(450, 350));
    ink.pointerUp(3);
    expect(ink.selection, hasLength(2));
    ink.pointerDown(3, const InkPoint(200, 200));
    for (var i = 1; i <= 7; i++) {
      clock.advance(16);
      ink.pointerMove(3, InkPoint(200, 200 + i * 50.3 / 7));
    }
    ink.pointerUp(3);
    clock.advance(100);

    final player = LessonPlayer(lesson());
    player.seek(Duration(milliseconds: afterErase));
    expect(player.strokes, hasLength(1));
    player.seek(player.lesson.duration);
    expectSameBoard(player, ink.strokes);

    ink.clear();
    rec.start();
    final cleared = LessonPlayer(lesson())..seek(const Duration(days: 1));
    expect(cleared.strokes, isEmpty);
  });

  test('records shapes as they are dragged out, and drops abandoned strokes', () {
    rec.start();
    final ink = pages.current..style = const InkStyle(tool: InkTool.shape, color: Color(0xFF000000), width: 3, shape: ShapeKind.circle);
    draw(const Offset(500, 500), const Offset(600, 500), steps: 20);
    // A tap with the shape tool leaves nothing.
    ink.pointerDown(4, const InkPoint(10, 10));
    ink.pointerUp(4);
    // A cancelled pen stroke leaves nothing either.
    ink.style = pen;
    ink.pointerDown(5, const InkPoint(10, 10));
    ink.pointerMove(5, const InkPoint(40, 40));
    ink.pointerCancel(5);

    final l = lesson();
    final shapeUpdates = l.events.where((e) => e[1] == 'u').length;
    expect(shapeUpdates, inInclusiveRange(2, 8)); // throttled, not one per move
    final player = LessonPlayer(l)..seek(l.duration);
    expect(player.strokes.single.shape, ShapeKind.circle);
    expectSameBoard(player, ink.strokes);
  });

  test('follows pages, the background and an opened saved board', () {
    draw(const Offset(10, 10), const Offset(50, 50)); // before recording
    rec.start();
    pages.addPage();
    pages.current.style = pen;
    draw(const Offset(100, 100), const Offset(200, 200));
    rec.background = BoardBackground.grid;
    final onPage2 = clock.ms;
    clock.advance(100);
    pages.previous();
    final backOnPage1 = clock.ms;
    clock.advance(100);
    pages.load([
      [Stroke(id: 'x', style: pen, points: [const InkPoint(1, 1), const InkPoint(9, 9)])],
    ]);
    clock.advance(100);

    final player = LessonPlayer(lesson());
    expect(player.strokes, hasLength(1)); // page 1 as it was when recording started
    player.seek(Duration(milliseconds: onPage2));
    expect((player.pageIndex, player.pageCount, player.background), (1, 2, BoardBackground.grid));
    expect(player.strokes, hasLength(1));
    player.seek(Duration(milliseconds: backOnPage1));
    expect(player.pageIndex, 0);
    player.seek(player.lesson.duration);
    expect(player.pageCount, 1);
    expect(player.strokes.single.points.last.x, 9);
  });

  test('pausing leaves a gap-free timeline and catches up on resume', () {
    rec.start();
    draw(const Offset(0, 0), const Offset(100, 0));
    rec.pause();
    clock.advance(60000); // paused: does not count
    draw(const Offset(0, 50), const Offset(100, 50));
    rec.resume();
    clock.advance(100);
    final l = lesson();
    expect(l.duration.inMilliseconds, lessThan(1000));
    final player = LessonPlayer(l)..seek(l.duration);
    expect(player.strokes, hasLength(2));
  });

  test('a newer format kind is ignored', () {
    final l = Lesson.fromJson({
      'v': 1,
      'canvas': {'w': 800, 'h': 600},
      'events': [
        [0, 'L', [[]], 0],
        [5, 'hologram', 1, 2],
        [10, 'a', 1, {'t': 'pen', 'c': 4278190080, 'w': 2, 'p': [0, 0, 5, 5]}],
      ],
    });
    final player = LessonPlayer(l)..seek(const Duration(milliseconds: 10));
    expect(player.strokes, hasLength(1));
    expect(l.canvas, const Size(800, 600));
  });

  test('streams live: drained batches rebuild the board, and a snapshot catches up a late viewer', () {
    rec.start();
    final early = LessonPlayer.live()..applyLive(rec.drain());
    draw(const Offset(0, 0), const Offset(100, 0));
    early.applyLive(rec.drain());
    expect(early.strokes, hasLength(1));
    expect(rec.drain(), isEmpty);

    draw(const Offset(0, 50), const Offset(100, 50));
    final batch = rec.drain();
    early.applyLive(batch);
    // A viewer joining now gets a snapshot rather than the history.
    rec.snapshotNow();
    final late = LessonPlayer.live()..applyLive(rec.drain());
    expectSameBoard(late, pages.current.strokes);
    expectSameBoard(early, pages.current.strokes);
  });

  test('chapter markers are recorded with their time and read back (spec 56)', () {
    rec.start();
    clock.advance(5000);
    rec.mark('Definitions');
    clock.advance(7000);
    rec.mark('');
    final log = rec.stop();
    expect(lessonChapters(log), [(5000, 'Definitions'), (12000, 'Chapter')]);
  });
}
