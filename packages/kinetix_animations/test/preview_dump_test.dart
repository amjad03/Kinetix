import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/painting.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_animations/kinetix_animations.dart';

import 'render_util.dart';

/// Writes a contact sheet per animation (one frame per step) to PREVIEW_DIR, only when it is set,
/// to check the drawings by eye. PREVIEW_ONLY=id1,id2 limits it; PREVIEW_LANG=hi|kn picks the
/// language; PREVIEW_W sets each frame's width (default 600).
void main() {
  final out = Platform.environment['PREVIEW_DIR'];
  final only = Platform.environment['PREVIEW_ONLY'];
  final lang = AnimLang.fromCode(Platform.environment['PREVIEW_LANG']);
  final w = double.tryParse(Platform.environment['PREVIEW_W'] ?? '') ?? 600;
  test('dump previews', () async {
    if (out == null) return;
    await loadKxFonts();
    for (final a in animationCatalogue) {
      if (only != null && !only.split(',').contains(a.id)) continue;
      final cell = Size(w, w * 0.6);
      final rows = (a.steps.length / 2).ceil();
      final rec = ui.PictureRecorder();
      final canvas = Canvas(rec);
      for (var i = 0; i < a.steps.length; i++) {
        canvas.save();
        canvas.translate((i % 2) * cell.width, (i ~/ 2) * cell.height);
        canvas.clipRect(Offset.zero & cell);
        a.painter(AnimFrame(a.steps[i].at + 0.06, lang: lang)).paint(canvas, cell);
        canvas.drawRect((Offset.zero & cell).deflate(0.5), Paint()..style = PaintingStyle.stroke..color = const Color(0xFF000000));
        canvas.restore();
      }
      final img = await rec.endRecording().toImage(cell.width.round() * 2, (cell.height * rows).round());
      final png = await img.toByteData(format: ui.ImageByteFormat.png);
      File('$out/${a.id}.png').writeAsBytesSync(png!.buffer.asUint8List());
    }
  });
}
