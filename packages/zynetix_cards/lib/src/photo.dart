import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';

import 'scanner.dart';

/// Grey pixels of a photo, no longer than [maxSide] on its long side.
Future<GreyImage> greyFromPhoto(Uint8List bytes, {int maxSide = 3200}) async {
  // The decoder turns the photo upright from its camera data.
  final codec = await ui.instantiateImageCodec(bytes);
  var image = (await codec.getNextFrame()).image;
  final long = math.max(image.width, image.height);
  if (long > maxSide) {
    final k = maxSide / long;
    final w = (image.width * k).round(), h = (image.height * k).round();
    final rec = ui.PictureRecorder();
    ui.Canvas(rec).drawImageRect(image, ui.Rect.fromLTWH(0, 0, image.width.toDouble(), image.height.toDouble()), ui.Rect.fromLTWH(0, 0, w.toDouble(), h.toDouble()),
        ui.Paint()..filterQuality = ui.FilterQuality.medium);
    image = await rec.endRecording().toImage(w, h);
  }
  final data = await image.toByteData(format: ui.ImageByteFormat.rawRgba);
  return GreyImage.fromRgba(data!.buffer.asUint8List(), image.width, image.height);
}

/// [g] turned [quarterTurns] quarter turns clockwise (a photo saved on its
/// side).
GreyImage turnGrey(GreyImage g, int quarterTurns) {
  final t = quarterTurns % 4;
  if (t == 0) return g;
  final w = g.width, h = g.height;
  final nw = t.isOdd ? h : w, nh = t.isOdd ? w : h;
  final out = Uint8List(w * h);
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      final (nx, ny) = switch (t) {
        1 => (h - 1 - y, x),
        2 => (w - 1 - x, h - 1 - y),
        _ => (y, w - 1 - x),
      };
      out[ny * nw + nx] = g.pixels[y * w + x];
    }
  }
  return GreyImage(out, nw, nh);
}

List<CardSeen> _scan((GreyImage, int) job) => scanCards(turnGrey(job.$1, job.$2));

/// Every answer card in a photo, read away from the screen's thread.
Future<List<CardSeen>> readCardsInPhoto(GreyImage photo, {int quarterTurns = 0}) => compute(_scan, (photo, quarterTurns));
