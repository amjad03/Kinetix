import 'dart:typed_data';
import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

void main() {
  ImageElement backdrop() => ImageElement(id: newElementId(), rect: const Rect.fromLTWH(0, 0, 1600, 900), bytes: Uint8List.fromList([1, 2, 3]), backdrop: true);

  group('imported pages (backdrops)', () {
    test('addPages puts one page each after the open page and opens the first', () {
      final board = WhiteboardController()..addPage();
      board.goToPage(0);
      board.addPages([
        [backdrop()],
        [backdrop()],
      ]);
      expect(board.pageCount, 4);
      expect(board.pageIndex, 1);
      expect(board.elements.single, isA<ImageElement>());
      expect(board.elementsOf(2).single, isA<ImageElement>());
      expect(board.elementsOf(3), isEmpty, reason: 'the page that was after it moves along');
    });

    test('a tap, a loop and Select all pass over the backdrop; the ink on it is picked', () {
      final board = WhiteboardController()..addPages([[backdrop()]]);
      board.tool = BoardTool.pen;
      board.pointerDown(1, InkPoint(100, 100));
      board.pointerMove(1, InkPoint(160, 120));
      board.pointerMove(1, InkPoint(200, 140));
      board.pointerUp(1);
      final ink = board.elements.whereType<Stroke>().single;
      board.tool = BoardTool.select;
      board.pointerDown(2, InkPoint(800, 600));
      board.pointerUp(2);
      expect(board.selection, isEmpty);
      board.selectAll();
      expect(board.selection, {ink.id});
      board.clearSelection();
      // A loop around everything.
      board.pointerDown(3, InkPoint(-10, -10));
      for (final p in const [Offset(1700, -10), Offset(1700, 1000), Offset(-10, 1000), Offset(-10, -10)]) {
        board.pointerMove(3, InkPoint(p.dx, p.dy));
      }
      board.pointerUp(3);
      expect(board.selection, {ink.id});
    });

    test('Clear page keeps the backdrop; the eraser leaves it alone', () {
      final board = WhiteboardController()..addPages([[backdrop()]]);
      board.tool = BoardTool.eraser;
      board.pointerDown(1, InkPoint(400, 400));
      board.pointerMove(1, InkPoint(500, 450));
      board.pointerUp(1);
      expect(board.elements, hasLength(1));
      board.add(TextElement(id: newElementId(), position: const Offset(20, 20), text: 'Hi', color: const Color(0xFF000000), fontSize: 20, size: const Size(30, 24)));
      board.clearPage();
      expect(board.elements.single, isA<ImageElement>());
    });

    test('Clear all pages clears every page, keeps backdrops, and each page undoes its own', () {
      TextElement hi() => TextElement(id: newElementId(), position: const Offset(20, 20), text: 'Hi', color: const Color(0xFF000000), fontSize: 20, size: const Size(30, 24));
      final board = WhiteboardController()..add(hi());
      board.addPages([[backdrop()]]);
      board.add(hi());
      expect(board.canClearAllPages, isTrue);
      board.clearAllPages();
      expect(board.canClearAllPages, isFalse);
      expect(board.canClearPage, isFalse);
      expect(board.elements.single, isA<ImageElement>());
      board.undo();
      expect(board.elements, hasLength(2));
      board.goToPage(0);
      expect(board.elements, isEmpty);
      board.undo();
      expect(board.elements, hasLength(1));

      // The message's Undo puts every page back at once.
      final undoAll = board.clearAllPages();
      expect(board.elements, isEmpty);
      undoAll();
      expect(board.elements, hasLength(1));
      board.goToPage(1);
      expect(board.elements, hasLength(2));
    });

    test('a backdrop is saved as one', () {
      final saved = SavedBoard(background: BoardBackground.plain, canvas: const Size(1600, 900), pages: [
        [backdrop()],
      ]);
      final again = SavedBoard.fromJson(saved.toJson());
      expect((again.pages.single.single as ImageElement).backdrop, isTrue);
      final plain = ImageElement(id: 'x', rect: Rect.zero, bytes: Uint8List(1));
      expect(encodeElement(plain).containsKey('bg'), isFalse);
    });
  });
}
