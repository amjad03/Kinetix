// Writes lib/src/pen/symbol_templates.g.dart, the templates of the AI pen's maths symbol
// recogniser, from the glyph outlines in lib/src/pen/symbol_glyphs.dart.
//
//   cd packages/kinetix_ink && dart run tool/generate_symbol_templates.dart
//
// The output is the same on every run and machine (seeded, platform-independent random
// numbers); test/pen/symbol_recognizer_test.dart fails if the committed file is stale.
// ignore_for_file: avoid_relative_lib_imports
import 'dart:io';

import '../lib/src/pen/symbol_recognizer.dart';

void main() {
  final out = File('lib/src/pen/symbol_templates.g.dart');
  out.writeAsStringSync(symbolTemplatesSource(generateSymbolTemplates()));
  stdout.writeln('Wrote ${out.path}');
}
