import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

void main() {
  InkPoint p(double x, double y) => InkPoint(x, y);

  void drag(InkController ink, int pointer, Offset from, Offset to) {
    ink.pointerDown(pointer, p(from.dx, from.dy));
    for (var i = 1; i <= 10; i++) {
      final o = Offset.lerp(from, to, i / 10)!;
      ink.pointerMove(pointer, p(o.dx, o.dy));
    }
    ink.pointerUp(pointer);
  }

  group('shapes', () {
    test('a dragged rectangle is a closed shape with four right angles', () {
      final ink = InkController()..style = const InkStyle(tool: InkTool.shape, color: Color(0xFF000000), width: 3, shape: ShapeKind.rectangle);
      drag(ink, 1, const Offset(100, 100), const Offset(100 + 4 * pxPerCm, 100 + 2 * pxPerCm));
      final s = ink.strokes.single;
      expect(s.shape, ShapeKind.rectangle);
      expect(s.vertices, hasLength(4));
      final v = s.vertices;
      for (var i = 0; i < 4; i++) {
        expect(angleAt(v[(i + 3) % 4], v[i], v[(i + 1) % 4]), closeTo(90, 1e-9));
      }
      expect(cm((v[1] - v[0]).distance), '4.0 cm');
      expect(cm((v[2] - v[1]).distance), '2.0 cm');
    });

    test('a circle is centred where the drag starts and the drag sets the radius', () {
      final ink = InkController()..style = const InkStyle(tool: InkTool.shape, color: Color(0xFF000000), width: 2, shape: ShapeKind.circle);
      drag(ink, 1, const Offset(300, 300), const Offset(300 + 3 * pxPerCm, 300));
      final b = ink.strokes.single.bounds.deflate(1);
      expect(b.center.dx, closeTo(300, 0.5));
      expect(b.width / 2, closeTo(3 * pxPerCm, 0.5));
    });

    test('a tap with the shape tool leaves nothing behind', () {
      final ink = InkController()..style = const InkStyle(tool: InkTool.shape, color: Color(0xFF000000), width: 2);
      ink.pointerDown(1, p(10, 10));
      ink.pointerUp(1);
      expect(ink.strokes, isEmpty);
    });

    test('the angles of a dragged triangle add up to 180', () {
      final pts = shapePoints(ShapeKind.triangle, const Offset(0, 0), const Offset(173, 150));
      final v = pts.map((e) => e.offset).toList()..removeLast();
      final sum = angleAt(v[2], v[0], v[1]) + angleAt(v[0], v[1], v[2]) + angleAt(v[1], v[2], v[0]);
      expect(sum, closeTo(180, 1e-6));
    });

    test('angle labels are whole when exact and one decimal otherwise', () {
      expect(degrees(90.0001), '90°');
      expect(degrees(59.6), '59.6°');
    });
  });

  group('select', () {
    InkController withTwoStrokes() {
      final ink = InkController();
      drag(ink, 1, const Offset(100, 100), const Offset(200, 100));
      drag(ink, 1, const Offset(500, 500), const Offset(600, 500));
      ink.style = ink.style.copyWith(tool: InkTool.select);
      return ink;
    }

    test('a marquee selects the strokes it touches', () {
      final ink = withTwoStrokes();
      drag(ink, 9, const Offset(50, 50), const Offset(250, 150));
      expect(ink.selection, {ink.strokes.first});
      expect(ink.marquee, isNull);
    });

    test('dragging the selection moves it, and undo puts it back', () {
      final ink = withTwoStrokes();
      drag(ink, 9, const Offset(50, 50), const Offset(250, 150));
      drag(ink, 9, const Offset(150, 100), const Offset(150, 300));
      expect(ink.strokes.first.points.first.offset, const Offset(100, 300));
      ink.undo();
      expect(ink.strokes.first.points.first.offset, const Offset(100, 100));
      ink.redo();
      expect(ink.strokes.first.points.first.offset, const Offset(100, 300));
    });

    test('delete removes the selection and is undoable', () {
      final ink = withTwoStrokes();
      drag(ink, 9, const Offset(0, 0), const Offset(1000, 1000));
      expect(ink.selection, hasLength(2));
      ink.deleteSelection();
      expect(ink.strokes, isEmpty);
      ink.undo();
      expect(ink.strokes, hasLength(2));
    });

    test('switching tools clears the selection', () {
      final ink = withTwoStrokes();
      drag(ink, 9, const Offset(0, 0), const Offset(1000, 1000));
      ink.style = ink.style.copyWith(tool: InkTool.pen);
      expect(ink.selection, isEmpty);
    });
  });

  group('palm modes (touch profiles)', () {
    InkController withLine(PalmMode mode) {
      final ink = InkController(palmMode: mode);
      drag(ink, 1, const Offset(0, 100), const Offset(400, 100));
      return ink;
    }

    test('tablet: a palm is ignored', () {
      final ink = withLine(PalmMode.ignore);
      ink.pointerDown(2, p(200, 100), contactRadius: 60);
      ink.pointerUp(2);
      expect(ink.strokes, hasLength(1));
    });

    test('interactive panel: a palm erases like a duster', () {
      final ink = withLine(PalmMode.erase);
      ink.pointerDown(2, p(200, 160), contactRadius: 60); // 60 px away: only a wide palm reaches
      ink.pointerUp(2);
      expect(ink.strokes, isEmpty);
      ink.undo();
      expect(ink.strokes, hasLength(1));
    });

    test('IR touch frame: large contacts write like any finger', () {
      final ink = withLine(PalmMode.off);
      drag(ink, 2, const Offset(0, 300), const Offset(100, 300));
      ink.pointerDown(3, p(10, 400), contactRadius: 60);
      ink.pointerMove(3, p(50, 400));
      ink.pointerUp(3);
      expect(ink.strokes, hasLength(3));
    });
  });

  group('pages', () {
    test('new pages are blank, keep the pen, and pages keep their own ink', () {
      final pages = BoardPages();
      pages.current.style = pages.current.style.copyWith(color: const Color(0xFFD93025), width: 7);
      drag(pages.current, 1, const Offset(0, 0), const Offset(50, 50));
      pages.addPage();
      expect(pages.count, 2);
      expect(pages.index, 1);
      expect(pages.current.strokes, isEmpty);
      expect(pages.current.style.color, const Color(0xFFD93025));
      pages.previous();
      expect(pages.current.strokes, hasLength(1));
      expect(pages.hasNext, isTrue);
    });

    test('changing the palm mode applies to every page', () {
      final pages = BoardPages()..addPage();
      pages.palmMode = PalmMode.off;
      pages.previous();
      expect(pages.current.palmMode, PalmMode.off);
    });
  });
}
