import 'dart:ui' as ui;

import 'package:flutter/painting.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_animations/kinetix_animations.dart';

/// Every painter paints without errors at many moments, at phone and panel sizes, with labels on
/// and off, in each language.
void main() {
  const sizes = [Size(360, 640), Size(1920, 1080), Size(640, 360), Size(120, 72)];
  const times = [0.0, 0.05, 0.13, 0.21, 0.37, 0.5, 0.63, 0.71, 0.84, 0.93, 0.9999];

  for (final a in animationCatalogue) {
    test('${a.id} paints', () {
      final ts = {...times, for (final s in a.steps) s.at, for (final s in a.steps) s.at + 0.01, a.thumbT};
      for (final size in sizes) {
        for (final t in ts) {
          for (final lang in AnimLang.values) {
            for (final labels in [true, false]) {
              if (!labels && lang != AnimLang.en) continue;
              final rec = ui.PictureRecorder();
              final p = a.painter(AnimFrame(t, labels: labels, lang: lang));
              p.paint(Canvas(rec), size);
              rec.endRecording().dispose();
              expect(p.shouldRepaint(a.painter(AnimFrame(t, labels: labels, lang: lang))), isFalse);
            }
          }
        }
      }
    });
  }

  test('a snapshot is a PNG', () async {
    final png = await renderAnimationPng(animationCatalogue.first, const AnimFrame(0.5), size: const Size(200, 120));
    expect(png.sublist(1, 4), [0x50, 0x4E, 0x47]); // "PNG"
  });
}
