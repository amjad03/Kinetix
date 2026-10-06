import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_animations/kinetix_animations.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

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
  for (final size in const [Size(360, 640), Size(960, 800)]) {
    testWidgets('dump the panel at ${size.width.toInt()}', (tester) async {
      if (out == null) return;
      await tester.runAsync(loadKxFonts);
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      const k = ValueKey('shot');
      await tester.pumpWidget(RepaintBoundary(key: k, child: MaterialApp(theme: KinetixTheme.board(), home: const Scaffold(body: AnimationsPanel()))));
      await tester.pump();
      Future<void> shot(String name) async {
        await tester.runAsync(() async {
          final img = await (tester.renderObject(find.byKey(k)) as RenderRepaintBoundary).toImage();
          final png = await img.toByteData(format: ui.ImageByteFormat.png);
          File('$out/panel_${size.width.toInt()}_$name.png').writeAsBytesSync(png!.buffer.asUint8List());
        });
      }

      await shot('browse');
      await tester.tap(find.byKey(const ValueKey('anim-tile-photosynthesis')));
      await tester.pump();
      await tester.pump(const Duration(seconds: 12));
      await shot('play');
    });
  }
}
