import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

void main() {
  void stroke(WhiteboardController wb, int pointer, double x) {
    wb.pointerDown(pointer, InkPoint(x, 100));
    for (var i = 1; i <= 8; i++) {
      wb.pointerMove(pointer, InkPoint(x + i * 5, 100 + i * 5));
    }
    wb.pointerUp(pointer);
  }

  test('multi-user zones give each part of the board its own pen colour', () {
    const red = Color(0xFFD93025), blue = Color(0xFF1A73E8);
    final wb = WhiteboardController()..zonePen = (at) => ZonePen(color: at.dx < 500 ? red : blue);
    stroke(wb, 1, 100);
    stroke(wb, 2, 700);
    final strokes = wb.elements.whereType<Stroke>().toList();
    expect(strokes, hasLength(2));
    expect(strokes[0].style.color, red);
    expect(strokes[1].style.color, blue);
  });

  test("a zone's eraser rubs out ink in that zone; no zone uses the board's tool", () {
    final wb = WhiteboardController();
    stroke(wb, 1, 100);
    expect(wb.elements, hasLength(1));
    wb.zonePen = (at) => at.dx < 500 ? const ZonePen(color: Color(0xFF000000), eraser: true) : null;
    // Over the stroke with the zone's eraser.
    wb.pointerDown(3, const InkPoint(120, 120));
    wb.pointerMove(3, const InkPoint(125, 125));
    wb.pointerUp(3);
    expect(wb.elements, isEmpty);
    stroke(wb, 4, 700);
    expect(wb.elements.whereType<Stroke>().single.style.color, wb.penColor);
  });
}
