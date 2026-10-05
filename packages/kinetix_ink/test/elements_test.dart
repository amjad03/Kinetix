import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

void main() {
  const ink = Color(0xFF1B1F24);
  Stroke line(String id, Offset a, Offset b) => Stroke(
    id: id,
    style: const InkStyle(tool: InkTool.pen, color: ink, width: 4),
    points: [InkPoint(a.dx, a.dy), InkPoint(b.dx, b.dy)],
  );

  group('elements', () {
    test('moving makes a new element with the same id and remembers where it came from', () {
      final t = TextElement(id: 't1', position: const Offset(10, 10), text: 'Photosynthesis', color: ink, fontSize: 32, size: const Size(200, 40));
      final moved = t.translated(const Offset(5, -3));
      expect(moved.id, 't1');
      expect(moved.position, const Offset(15, 7));
      expect(t.position, const Offset(10, 10)); // the original is untouched
      final (from, d) = movedFromOf(moved)!;
      expect(identical(from, t), isTrue);
      expect(d, const Offset(5, -3));
      expect(movedFromOf(t.recolored(Colors.red)), isNull); // an edit is not a move
    });

    test('text and equations grow evenly; ink keeps its look; pictures stretch', () {
      final t = TextElement(id: 't', position: Offset.zero, text: 'x', color: ink, fontSize: 20, size: const Size(100, 25));
      final big = t.scaled(Offset.zero, 2, 2);
      expect(big.fontSize, 40);
      expect(big.size, const Size(200, 50));

      final s = line('s', Offset.zero, const Offset(100, 0)).scaled(Offset.zero, 2, 2);
      expect(s.points.last.offset, const Offset(200, 0));
      expect(s.style.width, 8);

      final img = ImageElement(id: 'i', rect: const Rect.fromLTWH(0, 0, 100, 50), bytes: Uint8List(0)).scaled(Offset.zero, 2, 1);
      expect(img.rect, const Rect.fromLTWH(0, 0, 200, 50));
    });

    test('a circle pulled out of round becomes an ellipse', () {
      final circle = Stroke(
        id: 'c',
        style: const InkStyle(tool: InkTool.shape, color: ink, width: 3, shape: ShapeKind.circle),
        shape: ShapeKind.circle,
        points: shapePoints(ShapeKind.circle, const Offset(100, 100), const Offset(150, 100)),
      );
      expect(circle.scaled(const Offset(100, 100), 2, 2).shape, ShapeKind.circle);
      expect(circle.scaled(const Offset(100, 100), 2, 1).shape, ShapeKind.ellipse);
    });

    test('turned boxes hit-test in their own axes', () {
      final note = NoteElement(id: 'n', rect: const Rect.fromLTWH(0, 0, 200, 20), text: 'Note', color: Colors.yellow);
      final turned = note.rotated(const Offset(100, 10), math.pi / 2);
      expect(turned.rotation, closeTo(math.pi / 2, 1e-9));
      // Turned upright: the long side now runs down through the centre.
      expect(turned.hitTest(const Offset(100, 90), 0), isTrue);
      expect(turned.hitTest(const Offset(190, 10), 0), isFalse);
      expect(turned.bounds.height, closeTo(200, 1e-6));
    });

    test('a filled shape is hit inside, an outline only at its edge', () {
      final square = Stroke(
        id: 'r',
        style: const InkStyle(tool: InkTool.shape, color: ink, width: 2, shape: ShapeKind.rectangle),
        shape: ShapeKind.rectangle,
        points: shapePoints(ShapeKind.rectangle, Offset.zero, const Offset(100, 100)),
      );
      expect(square.hitTest(const Offset(50, 50), 2), isFalse);
      expect(square.copyWith(fill: const Color(0x33000000)).hitTest(const Offset(50, 50), 2), isTrue);
    });

    test('a covered answer reveals as a note in the same place', () {
      const a = NoteElement(id: 'a', rect: Rect.fromLTWH(0, 0, 300, 80), text: '42', color: Colors.green, kind: NoteKind.answer);
      expect(a.hidden, isTrue);
      final shown = a.revealed();
      expect((shown.kind, shown.text, shown.rect), (NoteKind.note, '42', a.rect));
    });

    test('graphs evaluate common school functions', () {
      double f(String e, double x) => compileGraph(e)!(x);
      expect(f('2x^2 - 3', 2), 5);
      expect(f('3(x+1)', 1), 6);
      expect(f('sin(x)', math.pi / 2), closeTo(1, 1e-9));
      expect(f('sinx', 0), 0);
      expect(f('x^2^1', 3), 9);
      expect(f('-x^2', 3), -9);
      expect(f('sqrt(x) + abs(x - 10)', 4), 8);
      expect(f('2pi', 0), closeTo(2 * math.pi, 1e-9));
      expect(f('1/x', 0).isInfinite, isTrue);
      expect(f('log(100) + ln(e)', 0), closeTo(3, 1e-9));
      expect(compileGraph('x +'), isNull);
      expect(compileGraph('y = x'), isNull);
    });
  });

  group('whiteboard', () {
    late WhiteboardController board;
    setUp(() => board = WhiteboardController());
    tearDown(() => board.dispose());

    void draw(Offset from, Offset to, {int pointer = 1, int steps = 5}) {
      board.pointerDown(pointer, InkPoint(from.dx, from.dy));
      for (var i = 1; i <= steps; i++) {
        final o = Offset.lerp(from, to, i / steps)!;
        board.pointerMove(pointer, InkPoint(o.dx, o.dy));
      }
      board.pointerUp(pointer);
    }

    test('several pointers write at once, and each finished stroke is one undo step', () {
      board.pointerDown(1, const InkPoint(0, 0));
      board.pointerDown(2, const InkPoint(0, 100));
      board.pointerMove(1, const InkPoint(50, 0));
      board.pointerMove(2, const InkPoint(50, 100));
      expect(board.activeStrokes, hasLength(2));
      board.pointerUp(2);
      board.pointerUp(1);
      expect(board.elements, hasLength(2));
      board.undo();
      expect(board.elements, hasLength(1));
      board.undo();
      expect(board.elements, isEmpty);
      board.redo();
      expect(board.elements, hasLength(1));
      expect(board.canRedo, isTrue);
      draw(const Offset(0, 200), const Offset(40, 200));
      expect(board.canRedo, isFalse); // a new stroke clears redo
    });

    test('undo is kept per page', () {
      draw(Offset.zero, const Offset(50, 50));
      board.addPage();
      expect(board.canUndo, isFalse);
      draw(Offset.zero, const Offset(50, 50));
      draw(Offset.zero, const Offset(80, 50));
      board.previous();
      board.undo();
      expect(board.elements, isEmpty);
      board.next();
      expect(board.elements, hasLength(2)); // page 2 untouched by page 1's undo
    });

    test('the eraser removes ink and words but not pictures, and one pass undoes at once', () {
      draw(const Offset(0, 0), const Offset(100, 0));
      draw(const Offset(0, 50), const Offset(100, 50));
      board.add(TextElement(id: 't', position: const Offset(0, 90), text: 'Hi', color: ink, fontSize: 20, size: const Size(40, 25)));
      board.add(ImageElement(id: 'i', rect: const Rect.fromLTWH(0, 130, 100, 60), bytes: Uint8List(0)));
      board.tool = BoardTool.eraser;
      board.pointerDown(9, const InkPoint(50, -10));
      for (var y = 0.0; y <= 160; y += 10) {
        board.pointerMove(9, InkPoint(50, y));
      }
      board.pointerUp(9);
      expect(board.elements.single, isA<ImageElement>());
      board.undo();
      expect(board.elements, hasLength(4));
    });

    test('a palm on a panel rubs out; on a tablet it is ignored', () {
      draw(const Offset(0, 0), const Offset(100, 0));
      board.pointerDown(5, const InkPoint(50, 0), palm: true, contactRadius: 30);
      board.pointerUp(5);
      expect(board.elements, hasLength(1));
      board.palmMode = PalmMode.erase;
      board.pointerDown(5, const InkPoint(50, 0), palm: true, contactRadius: 30);
      board.pointerUp(5);
      expect(board.elements, isEmpty);
    });

    test('select: a loop picks, dragging moves live, and the move is one undo step', () {
      draw(const Offset(100, 100), const Offset(200, 100));
      draw(const Offset(100, 300), const Offset(200, 300));
      board.tool = BoardTool.select;
      // A box around the first line only.
      board.pointerDown(1, const InkPoint(50, 50));
      board.pointerMove(1, const InkPoint(250, 50));
      board.pointerMove(1, const InkPoint(250, 150));
      board.pointerUp(1);
      expect(board.selection, hasLength(1));
      final before = board.elements.first as Stroke;

      board.pointerDown(1, const InkPoint(150, 100));
      board.pointerMove(1, const InkPoint(150, 120));
      // Moved while dragging, so live viewers follow.
      expect((board.elements.first as Stroke).points.first.offset, const Offset(100, 120));
      board.pointerMove(1, const InkPoint(160, 140));
      board.pointerUp(1);
      final after = board.elements.first as Stroke;
      expect(after.points.first.offset, const Offset(110, 140));
      expect(after.id, before.id);
      board.undo();
      expect((board.elements.first as Stroke).points.first.offset, const Offset(100, 100));
    });

    test('a tap with select picks the top element; a tap on nothing clears', () {
      draw(const Offset(0, 0), const Offset(100, 0));
      board.tool = BoardTool.select;
      board.pointerDown(1, const InkPoint(50, 2));
      board.pointerUp(1);
      expect(board.selection, hasLength(1));
      board.pointerDown(1, const InkPoint(500, 500));
      board.pointerUp(1);
      expect(board.selection, isEmpty);
    });

    test('groups select together; copy, paste and duplicate make new ids', () {
      board.addAll([
        TextElement(id: 'a', position: Offset.zero, text: 'A', color: ink, fontSize: 20, size: const Size(20, 25)),
        TextElement(id: 'b', position: const Offset(100, 0), text: 'B', color: ink, fontSize: 20, size: const Size(20, 25)),
      ], group: true);
      board.select({'a'});
      expect(board.selection, {'a', 'b'});
      expect(board.selectionGrouped, isTrue);
      board.copySelection();
      board.paste();
      expect(board.elements, hasLength(4));
      expect(board.selection.intersection({'a', 'b'}), isEmpty);
      expect(board.selectionGrouped, isTrue); // pasted copies stay together
      board.duplicateSelection();
      expect(board.elements, hasLength(6));
      board.ungroupSelection();
      board.select({board.selection.first});
      expect(board.selection, hasLength(1));
    });

    test('resize and turn handles preview, then apply as one step', () {
      board.add(NoteElement(id: 'n', rect: const Rect.fromLTWH(0, 0, 100, 100), text: 'x', color: Colors.yellow));
      board.select({'n'});
      board.beginTransform(SelectionHandle.bottomRight, const Offset(100, 100));
      board.updateTransform(const Offset(200, 200));
      expect((board.transformPreview!(board.elements.single) as NoteElement).rect, const Rect.fromLTWH(0, 0, 200, 200));
      expect((board.elements.single as NoteElement).rect.width, 100); // not applied yet
      board.endTransform();
      expect((board.elements.single as NoteElement).rect, const Rect.fromLTWH(0, 0, 200, 200));

      board.beginTransform(SelectionHandle.rotate, const Offset(100, -40));
      board.updateTransform(const Offset(300, 100)); // a quarter turn, settling on 90°
      expect(board.transformAngle, closeTo(90, 1e-6));
      board.endTransform();
      expect(board.elements.single.rotation, closeTo(math.pi / 2, 1e-9));
      board.undo();
      expect(board.elements.single.rotation, 0);
    });

    test('pen lines started on the ruler run straight along its edge', () {
      board.ruler.value = const RulerState(visible: true, center: Offset(500, 500), angle: 0, length: 600);
      // The top edge is at y = 500 - 32 = 468.
      board.pointerDown(1, const InkPoint(300, 470));
      board.pointerMove(1, const InkPoint(400, 480));
      board.pointerMove(1, const InkPoint(600, 455));
      board.pointerUp(1);
      final s = board.elements.single as Stroke;
      expect(s.shape, ShapeKind.line);
      expect(s.points.map((p) => p.offset), [const Offset(300, 468), const Offset(600, 468)]);
    });

    test('the compass draws a circle about where it was pressed', () {
      board.tool = BoardTool.compass;
      draw(const Offset(200, 200), const Offset(260, 280));
      final c = board.elements.single as Stroke;
      expect(c.shape, ShapeKind.circle);
      expect(c.bounds.deflate(c.style.width / 2).width, closeTo(200, 0.5)); // radius 100
      expect(c.bounds.center.dx, closeTo(200, 0.5));
    });

    test('the laser leaves a trail that fades and draws nothing', () {
      var t = 1000;
      board.now = () => t;
      board.tool = BoardTool.laser;
      draw(Offset.zero, const Offset(100, 0));
      expect(board.elements, isEmpty);
      expect(board.laser.value, isNotEmpty);
      t += 2000;
      expect(board.pruneLaser(), isFalse);
      expect(board.laser.value, isEmpty);
    });

    test('shapes can be filled, recoloured and put in front or behind', () {
      board.setShape(ShapeKind.triangle);
      draw(const Offset(0, 0), const Offset(100, 100));
      expect(board.selection, hasLength(1)); // a new shape is selected
      expect(board.selectionFillable, isTrue);
      board.setSelectionFill(true);
      expect((board.elements.single as Stroke).fill, isNotNull);
      board.recolorSelection(Colors.red);
      expect((board.elements.single as Stroke).style.color, Colors.red);
      board.add(TextElement(id: 't', position: Offset.zero, text: 'A', color: ink, fontSize: 20, size: const Size(20, 25)));
      board.sendSelectionToBack();
      expect(board.elements.first, isA<Stroke>());
      board.bringSelectionToFront();
      expect(board.elements.last, isA<Stroke>());
    });

    test('answers stay covered until revealed, one at a time or all', () {
      board.addAll(const [
        NoteElement(id: 'a1', rect: Rect.fromLTWH(0, 100, 100, 50), text: '1', color: Colors.green, kind: NoteKind.answer),
        NoteElement(id: 'a2', rect: Rect.fromLTWH(0, 0, 100, 50), text: '2', color: Colors.green, kind: NoteKind.answer),
      ]);
      board.revealAnswers();
      expect(board.hiddenAnswers.single.id, 'a1'); // the higher one first
      board.revealAnswers(all: true);
      expect(board.hiddenAnswers, isEmpty);
    });

    test('the view zooms about a point, and insert places things in view', () {
      board.viewport = const Size(1000, 800);
      board.zoomBy(2, const Offset(500, 400));
      expect(board.view.value.scale, 2);
      expect(board.view.value.toBoard(const Offset(500, 400)), const Offset(500, 400));
      final placed = board.insert([
        TextElement(id: 't', position: Offset.zero, text: 'A', color: ink, fontSize: 20, size: const Size(40, 20)),
      ]);
      expect(board.visibleArea!.contains(placed.single.bounds.center), isTrue);
      expect(board.tool, BoardTool.select);
      expect(board.selection, {placed.single.id});
    });

    test('pages: add, duplicate, delete, and a board saves and loads with groups', () {
      board.addAll([
        TextElement(id: 'a', position: Offset.zero, text: 'A', color: ink, fontSize: 20, size: const Size(20, 25)),
        TextElement(id: 'b', position: const Offset(100, 0), text: 'B', color: ink, fontSize: 20, size: const Size(20, 25)),
      ], group: true);
      board.duplicatePage(0);
      expect((board.pageCount, board.pageIndex), (2, 1));
      expect(board.elements.map((e) => e.id).toSet().intersection({'a', 'b'}), isEmpty);
      board.addPage();
      board.deletePage(2);
      expect(board.pageCount, 2);

      final saved = SavedBoard.fromJson(board.toSaved(const Size(1280, 720)).toJson());
      expect(saved.groups[0], [
        [0, 1],
      ]);
      final again = WhiteboardController()..load(saved);
      addTearDown(again.dispose);
      expect(again.pageCount, 2);
      again.select({again.elements.first.id});
      expect(again.selection, hasLength(2));
    });
  });
}
