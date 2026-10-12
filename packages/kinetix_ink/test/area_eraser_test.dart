
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

void main() {
  late WhiteboardController board;

  void line(Offset a, Offset b) {
    board.tool = BoardTool.pen;
    board.pointerDown(1, InkPoint(a.dx, a.dy));
    for (var i = 1; i <= 10; i++) {
      final p = Offset.lerp(a, b, i / 10)!;
      board.pointerMove(1, InkPoint(p.dx, p.dy));
    }
    board.pointerUp(1);
  }

  void rub(Offset p) {
    board.tool = BoardTool.eraser;
    board.pointerDown(9, InkPoint(p.dx, p.dy));
    board.pointerUp(9);
  }

  setUp(() {
    board = WhiteboardController()..eraserRadius = 10;
    line(const Offset(0, 100), const Offset(200, 100));
  });
  tearDown(() => board.dispose());

  test('stroke eraser removes the whole stroke', () {
    rub(const Offset(100, 100));
    expect(board.elements, isEmpty);
  });

  test('area eraser cuts the stroke in two and keeps both sides; undo restores it', () {
    board.inputConfig.eraser = const EraserConfig(mode: EraserMode.area);
    rub(const Offset(100, 100));
    final pieces = board.elements.whereType<Stroke>().toList();
    expect(pieces, hasLength(2));
    final left = pieces.first.bounds, right = pieces.last.bounds;
    expect(left.right, lessThan(96));
    expect(right.left, greaterThan(104));
    expect(left.left, closeTo(0, 4));
    expect(right.right, closeTo(200, 4));
    board.undo();
    expect(board.elements.whereType<Stroke>(), hasLength(1));
    board.redo();
    expect(board.elements.whereType<Stroke>(), hasLength(2));
  });

  test('area eraser dragged over the end leaves the rest; over everything leaves nothing', () {
    board.inputConfig.eraser = const EraserConfig(mode: EraserMode.area);
    board.tool = BoardTool.eraser;
    board.pointerDown(9, const InkPoint(-5, 100));
    for (var x = 0.0; x <= 120; x += 4) {
      board.pointerMove(9, InkPoint(x, 100));
    }
    board.pointerUp(9);
    final rest = board.elements.single as Stroke;
    expect(rest.bounds.left, greaterThan(125));
    expect(rest.bounds.right, closeTo(200, 4));
    board.tool = BoardTool.eraser;
    board.pointerDown(9, const InkPoint(100, 100));
    for (var x = 100.0; x <= 215; x += 4) {
      board.pointerMove(9, InkPoint(x, 100));
    }
    board.pointerUp(9);
    expect(board.elements, isEmpty);
  });

  test('area eraser misses a stroke it does not touch', () {
    board.inputConfig.eraser = const EraserConfig(mode: EraserMode.area);
    rub(const Offset(100, 140));
    expect(board.elements, hasLength(1));
    expect((board.elements.single as Stroke).points.length, 11);
  });

  test('the offset moves the eraser away from the touch point', () {
    board.inputConfig.eraser = const EraserConfig(offset: Offset(0, -40));
    rub(const Offset(100, 140));
    expect(board.elements, isEmpty);
    // Touching right on the stroke now misses: the eraser sits 40 px above it.
    line(const Offset(0, 100), const Offset(200, 100));
    rub(const Offset(100, 100));
    expect(board.elements, hasLength(1));
  });

  test('eraser mode and offset are saved with the device input setup', () {
    final c = InputConfig()..eraser = const EraserConfig(mode: EraserMode.area, offset: Offset(12, -30));
    final back = InputConfig.decode(c.encode());
    expect(back.eraser.mode, EraserMode.area);
    expect(back.eraser.offset, const Offset(12, -30));
    expect(InputConfig.decode(null).eraser.mode, EraserMode.stroke);
    expect(InputConfig.decode('{"eraserOffset":[999,-999]}').eraser.offset, const Offset(120, -120));
  });
}
