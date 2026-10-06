import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

void main() {
  test('each page keeps its own paper; new pages take the open page\'s', () {
    final wb = WhiteboardController();
    wb.background = BoardBackground.graph;
    wb.addPage();
    expect(wb.background, BoardBackground.graph);
    wb.background = BoardBackground.ledger;
    wb.previous();
    expect(wb.background, BoardBackground.graph);
    wb.next();
    expect(wb.background, BoardBackground.ledger);

    final saved = SavedBoard.fromJson(wb.toSaved(const Size(1920, 1080)).toJson());
    expect(saved.backgroundOf(0), BoardBackground.graph);
    expect(saved.backgroundOf(1), BoardBackground.ledger);
    final again = WhiteboardController()..load(saved);
    expect(again.background, BoardBackground.graph);
    again.next();
    expect(again.background, BoardBackground.ledger);
  });

  test('a dark paper turns black ink white on that page only', () {
    final wb = WhiteboardController();
    wb.background = BoardBackground.paperSlate;
    expect(wb.penColor, WhiteboardController.chalkWhite);
    wb.addPage();
    wb.background = BoardBackground.plain;
    expect(wb.penColor, WhiteboardController.inkBlack);
  });

  test('movePage reorders and keeps the open page open', () {
    final wb = WhiteboardController();
    wb.add(TextElement(id: 'a', position: Offset.zero, text: 'one', color: const Color(0xFF000000), fontSize: 20, size: const Size(40, 20)));
    wb.addPage();
    wb.addPage();
    final open = wb.page;
    wb.movePage(0, 2);
    expect(wb.page, same(open));
    expect(wb.pages.last.elements.single.id, 'a');
  });

  test('pen nibs, pressure and smoothing are kept', () {
    final wb = WhiteboardController()
      ..penNib = PenNib.dashed
      ..penPressure = true
      ..penSmoothing = 1;
    wb.pointerDown(1, const InkPoint(0, 0, 0.2));
    for (var i = 1; i <= 10; i++) {
      wb.pointerMove(1, InkPoint(i * 10.0, i.isEven ? 8 : -8, 0.9));
    }
    wb.pointerUp(1);
    final s = wb.elements.single as Stroke;
    expect(s.style.nib, PenNib.dashed);
    expect(s.points[5].y.abs(), lessThan(8)); // evened out
    final back = decodeStroke(encodeStroke(s), 'x')!;
    expect(back.style.nib, PenNib.dashed);
    expect(back.style.pressure, isTrue);
    expect(back.points.first.pressure, closeTo(0.2, 0.01));
  });

  test('3D models\' notes travel with the saved board', () {
    final saved = WhiteboardController().toSaved(const Size(1920, 1080)).withModel3dNotes({
      '/heart': {'pins': []},
    });
    expect(SavedBoard.fromJson(saved.toJson()).model3dNotes, contains('/heart'));
    expect(SavedBoard.fromJson(WhiteboardController().toSaved(Size.zero).toJson()).model3dNotes, isEmpty);
  });

  test('every paper paints', () async {
    for (final b in BoardBackground.values) {
      final r = PictureRecorder();
      paintBoardBackground(Canvas(r), const Rect.fromLTWH(-100, -100, 2200, 1300), b, scale: 0.5);
      r.endRecording().dispose();
    }
  });
}
