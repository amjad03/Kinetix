import 'dart:typed_data';
import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:zynetix_ink/zynetix_ink.dart';

void main() {
  ImageElement backdrop() => ImageElement(id: newElementId(), rect: const Rect.fromLTWH(0, 0, 1600, 900), bytes: Uint8List.fromList([1, 2, 3]), backdrop: true);

  group('imported pages (backdrops)', () {
    test('addPages puts one page each after the open page and opens the first', () {
      final board = WhiteboardController()..add(TextElement(id: 't', position: Offset.zero, text: 'notes', color: const Color(0xFF000000), fontSize: 20, size: const Size(60, 20)));
      board.addPage(force: true);
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

    test('a blank open page takes the first imported page, so no empty page is left in front; undo gives it back', () {
      final board = WhiteboardController();
      board.addPages([
        [backdrop()],
        [backdrop()],
        [backdrop()],
      ]);
      expect(board.pageCount, 3);
      expect(board.pageIndex, 0);
      for (var i = 0; i < 3; i++) {
        expect(board.elementsOf(i).single, isA<ImageElement>(), reason: 'page ${i + 1}');
      }
      board.undo();
      expect(board.elements, isEmpty, reason: 'the import on the blank page is one undo step');
    });

    test('a tap picks the page like any picture; a loop round some ink or Select all leaves it', () {
      final board = WhiteboardController()..addPages([[backdrop()]]);
      board.tool = BoardTool.pen;
      board.pointerDown(1, InkPoint(100, 100));
      board.pointerMove(1, InkPoint(160, 120));
      board.pointerMove(1, InkPoint(200, 140));
      board.pointerUp(1);
      final ink = board.elements.whereType<Stroke>().single;
      final page = board.elements.whereType<ImageElement>().single;
      board.tool = BoardTool.select;
      board.pointerDown(2, InkPoint(800, 600));
      board.pointerUp(2);
      expect(board.selection, {page.id});
      board.clearSelection();
      board.selectAll();
      expect(board.selection, {ink.id});
      board.clearSelection();
      // A loop round the ink only.
      board.pointerDown(3, InkPoint(60, 60));
      for (final p in const [Offset(260, 60), Offset(260, 200), Offset(60, 200), Offset(60, 60)]) {
        board.pointerMove(3, InkPoint(p.dx, p.dy));
      }
      board.pointerUp(3);
      expect(board.selection, {ink.id});
      board.clearSelection();
      // A loop round everything takes the page too.
      board.pointerDown(3, InkPoint(-10, -10));
      for (final p in const [Offset(1700, -10), Offset(1700, 1000), Offset(-10, 1000), Offset(-10, -10)]) {
        board.pointerMove(3, InkPoint(p.dx, p.dy));
      }
      board.pointerUp(3);
      expect(board.selection, {ink.id, page.id});
    });

    test('an imported page can be moved, scaled, turned and deleted, and each undoes', () {
      final board = WhiteboardController()..addPages([[backdrop()]]);
      final id = board.elements.single.id;
      board.select({id});
      board.transformSelection((e) => e.translated(const Offset(40, 30)));
      expect((board.elements.single as ImageElement).rect.topLeft, const Offset(40, 30));
      board.transformSelection((e) => e.scaled(const Offset(40, 30), 0.5, 0.5));
      expect((board.elements.single as ImageElement).rect.width, closeTo(800, 0.5));
      board.transformSelection((e) => e.rotated(const Offset(440, 255), 0.5));
      expect((board.elements.single as ImageElement).rotation, closeTo(0.5, 0.01));
      board.deleteSelection();
      expect(board.elements, isEmpty);
      board.undo();
      expect(board.elements.single, isA<ImageElement>());
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
