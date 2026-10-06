import 'dart:math' as math;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

Stroke shape(ShapeKind k, Offset a, Offset b, {String id = 's', ShapeMeasure measure = ShapeMeasure.none}) => Stroke(
  id: id,
  style: InkStyle(tool: InkTool.shape, color: Colors.black, width: 3, shape: k),
  shape: k,
  points: shapePoints(k, a, b),
  measure: measure,
);

void main() {
  group('transform geometry', () {
    test('a turned box is hit where it is drawn, not where it was', () {
      const t = TextElement(id: 't', position: Offset(0, 0), text: 'Wide', color: Colors.black, fontSize: 20, size: Size(200, 20));
      final turned = t.rotated(t.frame.center, math.pi / 2);
      // Upright, it reaches (190, 10); turned a quarter, it stands from (100, -90) to (100, 110).
      expect(t.hitTest(const Offset(190, 10), 0), isTrue);
      expect(turned.hitTest(const Offset(190, 10), 0), isFalse);
      expect(turned.hitTest(const Offset(100, -80), 0), isTrue);
      expect(turned.bounds.height, closeTo(200, 0.01));
    });

    test('a corner scales evenly about the opposite corner; Shift frees it; a side stretches', () {
      const box = Rect.fromLTWH(0, 0, 100, 50);
      final even = handleScale(SelectionHandle.bottomRight, box, const Offset(100, 50), const Offset(200, 60));
      expect(even.anchor, Offset.zero);
      expect(even.sx, even.sy);
      final free = handleScale(SelectionHandle.bottomRight, box, const Offset(100, 50), const Offset(200, 60), free: true);
      expect(free.sx, closeTo(2, 1e-9));
      expect(free.sy, closeTo(1.2, 1e-9));
      final side = handleScale(SelectionHandle.left, box, const Offset(0, 25), const Offset(-50, 40));
      expect(side.anchor, box.centerRight);
      expect(side.sx, closeTo(1.5, 1e-9));
      expect(side.sy, 1);
      // The anchor stays put.
      final r = shape(ShapeKind.rectangle, Offset.zero, const Offset(100, 50)).scaled(even.anchor, even.sx, even.sy);
      expect(r.vertices.first, Offset.zero);
    });

    test('turning settles on 15° steps when close, unless free', () {
      const deg = math.pi / 180;
      expect(snapTurn(43 * deg), closeTo(45 * deg, 1e-9));
      expect(snapTurn(52 * deg), closeTo(52 * deg, 1e-9));
      expect(snapTurn(43 * deg, free: true), closeTo(43 * deg, 1e-9));
    });

    test('a turned shape remembers its turn; a flip mirrors it and keeps a circle round', () {
      final r = shape(ShapeKind.rectangle, Offset.zero, const Offset(100, 50)).rotated(const Offset(50, 25), math.pi / 6);
      expect(r.turn, closeTo(math.pi / 6, 1e-9));
      final f = flipElement(r, const Offset(50, 25), horizontal: true) as Stroke;
      expect(f.turn, closeTo(-math.pi / 6, 1e-9));
      final c = flipElement(shape(ShapeKind.circle, const Offset(50, 50), const Offset(80, 50)), const Offset(0, 0), horizontal: false) as Stroke;
      expect(c.shape, ShapeKind.circle);
      expect(roundAxes(c).center.dy, closeTo(-50, 0.5));
    });
  });

  group('shape editing', () {
    test('dragging a triangle corner moves it and keeps the outline closed', () {
      final t = shape(ShapeKind.triangle, Offset.zero, const Offset(100, 100));
      final e = dragShapeHandle(t, const ShapeHandle(ShapeHandleKind.vertex, 0), const Offset(-20, 120)) as Stroke;
      expect(e.vertices.first, const Offset(-20, 120));
      expect(e.points.last.offset, const Offset(-20, 120));
      expect(e.vertices, hasLength(3));
    });

    test('a line is edited by its ends straight away; arrow heads can be changed', () {
      final l = shape(ShapeKind.line, Offset.zero, const Offset(100, 0));
      expect(editsByEnds(l), isTrue);
      final e = dragShapeHandle(l, const ShapeHandle(ShapeHandleKind.vertex, 1), const Offset(0, 80)) as Stroke;
      expect(e.points.last.offset, const Offset(0, 80));
      final back = withArrowEnds(e, ArrowEnds.start);
      expect(back.shape, ShapeKind.arrow);
      expect(back.points.first.offset, const Offset(0, 80));
      expect(arrowEndsOf(withArrowEnds(e, ArrowEnds.both)), ArrowEnds.both);
    });

    test('the radius handle resizes a circle about its centre', () {
      final c = shape(ShapeKind.circle, const Offset(100, 100), const Offset(150, 100));
      final h = shapeHandlesOf(c).single;
      expect(h.$1.kind, ShapeHandleKind.radius);
      expect(h.$2.dx, closeTo(150, 0.01));
      final e = dragShapeHandle(c, h.$1, const Offset(100, 180)) as Stroke;
      final ax = roundAxes(e);
      expect(ax.center.dx, closeTo(100, 0.5));
      expect(ax.major, closeTo(80, 0.5));
    });

    test('the corner handle rounds a rectangle, at most to half its short side', () {
      final r = shape(ShapeKind.rectangle, Offset.zero, const Offset(200, 100));
      final h = shapeHandlesOf(r, pad: 10).firstWhere((h) => h.$1.kind == ShapeHandleKind.corner);
      final e = dragShapeHandle(r, h.$1, const Offset(30, 30), pad: 10) as Stroke;
      expect(e.corner, closeTo(20, 0.01));
      final most = dragShapeHandle(r, h.$1, const Offset(400, 400), pad: 10) as Stroke;
      expect(most.corner, 50);
    });

    test('measurements are worked out from the shape as it is now', () {
      final sq = shape(ShapeKind.rectangle, Offset.zero, const Offset(100, 100));
      expect(polygonArea(sq.vertices), closeTo(10000, 0.01));
      final big = sq.scaled(Offset.zero, 2, 2);
      expect(polygonArea(big.vertices), closeTo(40000, 0.01));
      expect(formatLength(200, MeasureUnit.px), '200 px');
      expect(formatLength(GeoCalibration.unit * 3, MeasureUnit.cm), '3.0 ${GeoCalibration.unitName}');
      expect(formatArea(GeoCalibration.unit * GeoCalibration.unit * 2, MeasureUnit.cm), '2.0 ${GeoCalibration.unitName}²');
    });
  });

  group('controller', () {
    late WhiteboardController wb;
    setUp(() => wb = WhiteboardController());
    tearDown(() => wb.dispose());

    test('measurements are off on new shapes by default, on with the AI pen option, and per shape', () {
      expect(wb.measureNewShapes, isFalse);
      wb.tool = BoardTool.shape;
      wb.pointerDown(1, const InkPoint(0, 0));
      wb.pointerMove(1, const InkPoint(100, 80));
      wb.pointerUp(1);
      expect((wb.elements.single as Stroke).measure, ShapeMeasure.none);
      wb.measureNewShapes = true;
      wb.pointerDown(2, const InkPoint(200, 0));
      wb.pointerMove(2, const InkPoint(300, 80));
      wb.pointerUp(2);
      expect((wb.elements.last as Stroke).measure, ShapeMeasure.all);

      wb.tool = BoardTool.select;
      wb.select({wb.elements.first.id});
      expect(wb.selectionMeasurable, isTrue);
      wb.setSelectionMeasure(const ShapeMeasure(lengths: true));
      expect(measureOf(wb.elements.first).lengths, isTrue);
      expect(wb.isLabelled(wb.elements.first), isTrue);
      wb.undo();
      expect(measureOf(wb.elements.first).any, isFalse);
    });

    test('a resize, a turn and a reshape are each one undo step', () {
      wb.add(shape(ShapeKind.rectangle, Offset.zero, const Offset(100, 100)));
      wb.tool = BoardTool.select;
      wb.select({'s'});
      wb.beginTransform(SelectionHandle.rotate, const Offset(50, -40));
      wb.updateTransform(const Offset(150, 50)); // a quarter turn about the middle
      expect(wb.selectionTurn, closeTo(90, 0.01));
      wb.endTransform();
      expect((wb.elements.single as Stroke).turn, closeTo(math.pi / 2, 1e-6));

      wb.editingPoints = true;
      expect(wb.shapeHandles.where((h) => h.$1.kind == ShapeHandleKind.vertex), hasLength(4));
      final v0 = wb.shapeHandles.first;
      wb.beginShapeEdit(v0.$1, v0.$2);
      wb.updateTransform(v0.$2 + const Offset(-30, 0));
      wb.endTransform();
      expect((wb.elements.single as Stroke).vertices.first.dx, closeTo(v0.$2.dx - 30, 0.01));
      wb.undo();
      expect((wb.elements.single as Stroke).vertices.first.dx, closeTo(v0.$2.dx, 0.01));
      wb.undo();
      expect((wb.elements.single as Stroke).turn, 0);
    });

    test('two fingers on the selection move, scale and turn it', () {
      wb.add(const NoteElement(id: 'n', rect: Rect.fromLTWH(0, 0, 100, 100), text: 'x', color: Colors.yellow));
      wb.select({'n'});
      wb.beginSelectionPinch(const Offset(0, 50), const Offset(100, 50));
      expect(wb.isPinchingSelection, isTrue);
      // Twice as far apart, a quarter turn, about a middle moved by (10, 0).
      wb.updateSelectionPinch(const Offset(60, -50), const Offset(60, 150));
      wb.endTransform();
      final n = wb.elements.single as NoteElement;
      expect(n.rect.width, closeTo(200, 0.01));
      expect(n.rotation, closeTo(math.pi / 2, 1e-6));
      expect(n.rect.center, const Offset(60, 50));
    });

    test('locked elements stay put: no move, resize, delete or rubbing out', () {
      wb.add(shape(ShapeKind.rectangle, Offset.zero, const Offset(100, 100)));
      wb.select({'s'});
      wb.setSelectionLocked(true);
      expect(wb.selectionLocked, isTrue);
      final before = wb.elements.single;
      wb.deleteSelection();
      wb.flipSelection(horizontal: true);
      wb.beginTransform(SelectionHandle.bottomRight, const Offset(100, 100));
      expect(wb.isTransforming, isFalse);
      expect(wb.elements.single, same(before));
      wb.tool = BoardTool.eraser;
      wb.pointerDown(1, const InkPoint(0, 50));
      wb.pointerUp(1);
      expect(wb.elements, hasLength(1));
      wb.undo(); // the lock
      expect(wb.isLocked('s'), isFalse);
    });

    test('align, flip, width, line style and arrow heads apply to the selection', () {
      wb.add(shape(ShapeKind.rectangle, Offset.zero, const Offset(50, 50), id: 'a'));
      wb.add(shape(ShapeKind.arrow, const Offset(100, 100), const Offset(200, 120), id: 'b'));
      wb.select({'a', 'b'});
      wb.alignSelection(BoardAlign.right);
      expect(wb.byId('a')!.bounds.right, closeTo(wb.byId('b')!.bounds.right, 0.01));
      wb.setSelectionWidth(8);
      expect(wb.selectionWidth, 8);
      wb.setSelectionLineStyle(PenNib.dotted);
      expect(wb.selectionLineStyle, PenNib.dotted);
      wb.select({'b'});
      expect(wb.selectionArrowEnds, ArrowEnds.end);
      expect(wb.editingPoints, isTrue); // arrows are edited by their ends straight away
      wb.setSelectionArrowEnds(ArrowEnds.both);
      wb.setSelectionFilledHead(true);
      final b = wb.byId('b') as Stroke;
      expect(b.shape, ShapeKind.doubleArrow);
      expect(b.filledHead, isTrue);
    });
  });

  group('saving', () {
    test('turn, measurements, corners, heads and locks survive a round trip', () {
      final s = shape(
        ShapeKind.rectangle,
        Offset.zero,
        const Offset(100, 60),
        measure: const ShapeMeasure(lengths: true, area: true),
      ).rotated(const Offset(50, 30), 0.5).copyWith(corner: 12, filledHead: true);
      const p = PolygonElement(
        id: 'p',
        points: [Offset.zero, Offset(10, 0), Offset(0, 10)],
        color: Colors.red,
        width: 2,
        measure: ShapeMeasure.all,
        turn: 0.25,
      );
      final board = SavedBoard(
        background: BoardBackground.plain,
        canvas: const Size(800, 600),
        pages: [
          [s, p],
        ],
        locked: const [
          [1],
        ],
      );
      final back = SavedBoard.fromJson(board.toJson());
      final s2 = back.pages[0][0] as Stroke, p2 = back.pages[0][1] as PolygonElement;
      expect(s2.measure, const ShapeMeasure(lengths: true, area: true));
      expect(s2.turn, closeTo(0.5, 1e-3));
      expect(s2.corner, 12);
      expect(s2.filledHead, isTrue);
      expect(p2.measure, ShapeMeasure.all);
      expect(p2.turn, closeTo(0.25, 1e-3));
      expect(back.locked, [
        [1],
      ]);
      // Boards saved before these existed read as plain shapes.
      final old =
          decodeElement({
                't': 'shape',
                's': 'circle',
                'c': 0xff000000,
                'w': 3,
                'p': [0, 0, 10, 0, 10, 10],
              }, 'o')!
              as Stroke;
      expect(old.measure, ShapeMeasure.none);
      expect(old.turn, 0);
      // A loaded board keeps its locks.
      final wb = WhiteboardController()..load(back);
      addTearDown(wb.dispose);
      expect(wb.isLocked(wb.elements[1].id), isTrue);
      expect(wb.toSaved(const Size(800, 600)).locked, [
        [1],
      ]);
    });
  });

  group('dragging handles on screen', () {
    for (final (name, size) in [('panel', Size(1920, 1080)), ('phone', Size(390, 844))]) {
      testWidgets('$name: the corner handle scales, the knob turns, a corner point moves', (tester) async {
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        final wb = WhiteboardController();
        addTearDown(wb.dispose);
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(body: WhiteboardCanvas(controller: wb)),
          ),
        );
        wb.setView(const ViewState());
        wb.add(shape(ShapeKind.rectangle, const Offset(60, 200), const Offset(220, 300)));
        wb.tool = BoardTool.select;
        await tester.pump();
        await tester.tapAt(const Offset(60, 250));
        await tester.pump();
        expect(wb.selection, {'s'});

        // The bottom-right handle sits 8 px outside the box (the line is 3 wide); grab it
        // a little off centre, as a finger does.
        final box = wb.selectionBounds!.inflate(8);
        var g = await tester.startGesture(box.bottomRight + const Offset(-10, 8), kind: PointerDeviceKind.touch);
        await g.moveTo(box.bottomRight + const Offset(30, 30));
        await g.moveTo(box.bottomRight + const Offset(70, 52));
        await g.up();
        await tester.pump();
        var s = wb.elements.single as Stroke;
        expect((s.vertices.first - const Offset(60, 200)).distance, lessThan(1.5)); // about the opposite corner
        final b = Rect.fromPoints(s.vertices[0], s.vertices[2]);
        expect(b.width / b.height, closeTo(1.6, 0.01)); // proportions kept
        expect(b.width, greaterThan(200));

        // The knob above the box turns it a quarter, with the readout.
        final box2 = wb.selectionBounds!.inflate(8);
        final knob = box2.topCenter - const Offset(0, 56);
        final c = box2.center;
        g = await tester.startGesture(knob, kind: PointerDeviceKind.touch);
        await g.moveTo(knob + const Offset(20, 10));
        await g.moveTo(c + Offset(c.dy - knob.dy, 0));
        await tester.pump();
        expect(wb.selectionTurn, closeTo(90, 0.5));
        await g.up();
        await tester.pump();
        s = wb.elements.single as Stroke;
        expect(s.turn, closeTo(math.pi / 2, 1e-3));

        // A second tap shows its points; a corner drags on its own.
        await tester.tapAt(s.vertices[0] * 0.75 + s.vertices[1] * 0.25);
        await tester.pump();
        expect(wb.editingPoints, isTrue);
        final v = s.vertices[2];
        g = await tester.startGesture(v + const Offset(6, -6), kind: PointerDeviceKind.touch);
        await g.moveTo(v + const Offset(10, 20));
        await g.moveTo(v + const Offset(40, 40));
        await g.up();
        await tester.pump();
        s = wb.elements.single as Stroke;
        expect(s.vertices[2].dx, closeTo(v.dx + 34, 0.5));
        expect(s.vertices[0], isNot(v));
      });
    }
  });
}
