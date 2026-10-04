import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

void main() {
  InkPoint p(double x, double y) => InkPoint(x, y);

  test('several pointers draw separate strokes at the same time', () {
    final ink = InkController();
    // Three students touch the board together.
    ink.pointerDown(1, p(10, 10));
    ink.pointerDown(2, p(200, 10));
    ink.pointerDown(3, p(400, 10));
    expect(ink.activePointerCount, 3);

    // Their moves arrive interleaved.
    for (var i = 1; i <= 5; i++) {
      ink.pointerMove(1, p(10, 10.0 + i * 10));
      ink.pointerMove(3, p(400, 10.0 + i * 10));
      ink.pointerMove(2, p(200, 10.0 + i * 10));
    }
    ink.pointerUp(2);
    expect(ink.strokes, hasLength(1));
    expect(ink.activeStrokes, hasLength(2));
    ink.pointerUp(1);
    ink.pointerUp(3);

    expect(ink.strokes, hasLength(3));
    for (final s in ink.strokes) {
      expect(s.points, hasLength(6));
      // Each stroke stays in its own column: no points mixed up between pointers.
      expect(s.points.map((q) => q.x).toSet(), hasLength(1));
    }
  });

  test('palm-sized touches are ignored', () {
    final ink = InkController();
    ink.pointerDown(1, p(0, 0), contactRadius: 60);
    ink.pointerMove(1, p(50, 50));
    ink.pointerUp(1);
    expect(ink.strokes, isEmpty);
  });

  test('undo and redo follow the order strokes were finished', () {
    final ink = InkController();
    ink.pointerDown(1, p(0, 0));
    ink.pointerDown(2, p(100, 0));
    ink.pointerMove(1, p(0, 50));
    ink.pointerMove(2, p(100, 50));
    ink.pointerUp(2); // finished first
    ink.pointerUp(1);
    final first = ink.strokes[0], second = ink.strokes[1];

    ink.undo();
    expect(ink.strokes, [first]);
    ink.undo();
    expect(ink.strokes, isEmpty);
    expect(ink.canUndo, isFalse);
    ink.redo();
    ink.redo();
    expect(ink.strokes, [first, second]);
  });

  test('a new stroke clears the redo history', () {
    final ink = InkController();
    ink.pointerDown(1, p(0, 0));
    ink.pointerUp(1);
    ink.undo();
    ink.pointerDown(1, p(5, 5));
    ink.pointerUp(1);
    expect(ink.canRedo, isFalse);
  });

  test('the eraser removes strokes it touches, and erasing can be undone in place', () {
    final ink = InkController();
    for (final x in [0.0, 100.0, 200.0]) {
      ink.pointerDown(1, p(x, 0));
      ink.pointerMove(1, p(x, 100));
      ink.pointerUp(1);
    }
    final before = List.of(ink.strokes);

    ink.style = ink.style.copyWith(tool: InkTool.eraser);
    ink.pointerDown(9, p(100, 50));
    ink.pointerUp(9);
    expect(ink.strokes, [before[0], before[2]]);

    ink.undo();
    expect(ink.strokes, before);
  });

  test('the stylus eraser end erases even when the pen is selected', () {
    final ink = InkController();
    ink.pointerDown(1, p(0, 0));
    ink.pointerMove(1, p(0, 100));
    ink.pointerUp(1);
    ink.pointerDown(2, p(0, 50), forceEraser: true);
    ink.pointerUp(2);
    expect(ink.strokes, isEmpty);
    expect(ink.style.tool, InkTool.pen);
  });

  test('clear is undoable', () {
    final ink = InkController();
    ink.pointerDown(1, p(0, 0));
    ink.pointerUp(1);
    ink.clear();
    expect(ink.strokes, isEmpty);
    ink.undo();
    expect(ink.strokes, hasLength(1));
  });

  test('a cancelled pointer leaves no stroke', () {
    final ink = InkController();
    ink.pointerDown(1, p(0, 0));
    ink.pointerMove(1, p(0, 30));
    ink.pointerCancel(1);
    expect(ink.isEmpty, isTrue);
  });

  test('multi-user zones can give each pointer its own pen', () {
    final ink = InkController();
    const red = Color(0xFFFF0000), blue = Color(0xFF0000FF);
    ink.styleForPointer = (pointer, pos) => ink.style.copyWith(color: pos.dx < 500 ? red : blue);
    ink.pointerDown(1, p(100, 0));
    ink.pointerDown(2, p(900, 0));
    ink.pointerUp(1);
    ink.pointerUp(2);
    expect(ink.strokes.map((s) => s.style.color), [red, blue]);
  });

  test('finished-stroke listeners are not woken by every move', () {
    final ink = InkController();
    var commits = 0;
    ink.committed.addListener(() => commits++);
    ink.pointerDown(1, p(0, 0));
    for (var i = 1; i < 50; i++) {
      ink.pointerMove(1, p(0, i.toDouble()));
    }
    expect(commits, 0);
    ink.pointerUp(1);
    expect(commits, 1);
  });

  test('hit testing measures distance to segments, not only to points', () {
    final s = Stroke(id: 'a', style: const InkStyle(tool: InkTool.pen, color: Color(0xFF000000), width: 2), points: [p(0, 0), p(1000, 0)]);
    expect(s.hitBy(const Offset(500, 5), 5), isTrue);
    expect(s.hitBy(const Offset(500, 40), 5), isFalse);
  });
}
