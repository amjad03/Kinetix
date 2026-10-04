import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/rendering.dart';

import 'board_background.dart';
import 'ink_canvas.dart';
import 'ink_models.dart';

/// Draws one page off screen and encodes it as PNG: for reading handwriting with KINETIX AI,
/// and for thumbnails. The page is scaled to fit [maxWidth] (keeping its proportions).
Future<Uint8List> renderPagePng(List<Stroke> strokes, BoardBackground background, Size canvas, {double maxWidth = 1600}) async {
  final scale = canvas.width > maxWidth ? maxWidth / canvas.width : 1.0;
  final out = Size((canvas.width * scale).roundToDouble(), (canvas.height * scale).roundToDouble());
  final recorder = ui.PictureRecorder();
  final c = Canvas(recorder, Offset.zero & out)..scale(scale);
  BackgroundPainter(background).paint(c, canvas);
  for (final s in strokes) {
    paintStroke(c, s, background);
  }
  final image = await recorder.endRecording().toImage(out.width.toInt(), out.height.toInt());
  try {
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    return data!.buffer.asUint8List();
  } finally {
    image.dispose();
  }
}
