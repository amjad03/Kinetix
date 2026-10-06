import 'dart:io';

import 'package:flutter/painting.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_animations/kinetix_animations.dart';

import 'render_util.dart';

/// Writes PNGs of each animation to PREVIEW_DIR (only when it is set), to check them by eye.
/// PREVIEW_ONLY=id1,id2 limits it; PREVIEW_LANG=hi|kn picks the labels' language.
void main() {
  final out = Platform.environment['PREVIEW_DIR'];
  final only = Platform.environment['PREVIEW_ONLY'];
  final lang = AnimLang.fromCode(Platform.environment['PREVIEW_LANG']);
  test('dump previews', () async {
    if (out == null) return;
    await loadKxFonts();
    for (final a in animationCatalogue) {
      if (only != null && !only.split(',').contains(a.id)) continue;
      for (final s in a.steps) {
        final t = s.at + 0.06;
        final png = await renderAnimationPng(a, AnimFrame(t, lang: lang), size: const Size(1000, 600));
        File('$out/${a.id}_${(t * 100).round()}.png').writeAsBytesSync(png);
      }
    }
  });
}
