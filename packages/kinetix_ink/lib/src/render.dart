import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/rendering.dart';

import 'board_background.dart';
import 'element_painting.dart';
import 'ink_models.dart';

/// Draws one page off screen and encodes it as PNG: for reading the board with KINETIX AI, and
/// for thumbnails. [area] is the part of the board to draw (by default the [canvas]-sized
/// screen from the origin); it is scaled to fit [maxWidth], keeping its proportions. Equations
/// are drawn as readable text.
Future<Uint8List> renderPagePng(List<BoardElement> elements, BoardBackground background, Size canvas, {double maxWidth = 1600, Rect? area}) async {
  final region = area ?? Offset.zero & canvas;
  final scale = region.width > maxWidth ? maxWidth / region.width : 1.0;
  final out = Size((region.width * scale).roundToDouble(), (region.height * scale).roundToDouble());
  final images = BoardImages();
  await images.preload(elements);
  final recorder = ui.PictureRecorder();
  final c = Canvas(recorder, Offset.zero & out)
    ..scale(scale)
    ..translate(-region.left, -region.top);
  paintBoardBackground(c, region, background);
  for (final e in elements) {
    paintElement(c, e, background, images: images, paintMath: true);
  }
  final image = await recorder.endRecording().toImage(out.width.toInt(), out.height.toInt());
  try {
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    return data!.buffer.asUint8List();
  } finally {
    image.dispose();
    images.dispose();
  }
}
