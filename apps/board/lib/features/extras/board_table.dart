import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

/// A ruled line on the board.
Stroke boardLine(Offset a, Offset b, Color c, {double w = 2}) => Stroke(
  id: newElementId(),
  style: InkStyle(tool: InkTool.shape, color: c, width: w, shape: ShapeKind.line),
  shape: ShapeKind.line,
  points: shapePoints(ShapeKind.line, a, b),
);

/// A shape (rectangle, circle…) from [a] to [b] on the board, optionally filled.
Stroke boardShape(ShapeKind kind, Offset a, Offset b, Color c, {double w = 3, Color? fill}) => Stroke(
  id: newElementId(),
  style: InkStyle(tool: InkTool.shape, color: c, width: w, shape: kind),
  shape: kind,
  fill: fill,
  points: shapePoints(kind, a, b),
);

TextElement boardLabel(String text, Offset at, Color c, {double size = 22, bool bold = false, bool center = false}) {
  final s = measureBoardText(text, size, bold: bold);
  return TextElement(id: newElementId(), position: center ? at - Offset(s.width / 2, s.height / 2) : at, text: text, color: c, fontSize: size, size: s, bold: bold);
}

/// [rows] as a ruled table of board elements (the first row bold, as the header), each column as
/// wide as its longest cell.
List<BoardElement> boardTable(List<List<String>> rows, Color ink, {double size = 22, Color? header}) {
  if (rows.isEmpty) return const [];
  final cols = rows.map((r) => r.length).reduce(math.max);
  const pad = 12.0;
  final widths = List<double>.filled(cols, 60);
  final heights = <double>[];
  for (final (ri, r) in rows.indexed) {
    var h = size * 1.4;
    for (var c = 0; c < r.length; c++) {
      final m = measureBoardText(r[c], size, bold: ri == 0);
      widths[c] = math.max(widths[c], m.width + pad * 2);
      h = math.max(h, m.height);
    }
    heights.add(h + pad);
  }
  final total = widths.fold(0.0, (a, b) => a + b), totalH = heights.fold(0.0, (a, b) => a + b);
  final out = <BoardElement>[
    if (header != null) boardShape(ShapeKind.rectangle, Offset.zero, Offset(total, heights.first), header, w: 1, fill: header),
  ];
  var y = 0.0;
  for (final (ri, r) in rows.indexed) {
    var x = 0.0;
    for (var c = 0; c < cols; c++) {
      if (c < r.length && r[c].isNotEmpty) out.add(boardLabel(r[c], Offset(x + pad, y + pad / 2), ink, size: size, bold: ri == 0));
      x += widths[c];
    }
    y += heights[ri];
  }
  // The rules.
  y = 0;
  for (var i = 0; i <= rows.length; i++) {
    out.add(boardLine(Offset(0, y), Offset(total, y), ink, w: i == 0 || i == rows.length ? 2.5 : 1.5));
    if (i < rows.length) y += heights[i];
  }
  var x = 0.0;
  for (var c = 0; c <= cols; c++) {
    out.add(boardLine(Offset(x, 0), Offset(x, totalH), ink, w: 1.5));
    if (c < cols) x += widths[c];
  }
  return out;
}
