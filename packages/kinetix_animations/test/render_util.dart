import 'dart:io';

import 'package:flutter/services.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

/// Loads the KINETIX fonts so text renders as real glyphs in tests (for the preview dump).
Future<void> loadKxFonts() async {
  const dir = '../kinetix_ui/fonts';
  Future<void> load(String family, List<String> files) async {
    final loader = FontLoader(family);
    for (final f in files) {
      loader.addFont(Future.value(ByteData.sublistView(File('$dir/$f').readAsBytesSync())));
    }
    await loader.load();
  }

  await load(KxFonts.family, ['SansFlex-400.ttf', 'SansFlex-500.ttf', 'SansFlex-600.ttf', 'SansFlex-700.ttf']);
  await load(KxFonts.fallback[0], ['NotoSansDevanagari-400.ttf', 'NotoSansDevanagari-700.ttf']);
  await load(KxFonts.fallback[1], ['NotoSansKannada-400.ttf', 'NotoSansKannada-700.ttf']);
  await load(KxFonts.fallback[2], ['Inter-400.ttf', 'Inter-700.ttf']);
}
