import 'dart:io';

import 'package:flutter/services.dart';

import 'board_fonts.dart';

/// Every font the board draws with, for screenshots that look like the device: the interface
/// fonts and Noto for Hindi and Kannada ([loadBoardFonts]), the board's own text fonts (Inter,
/// Andika, the maths and code fonts) and Material's icon font from the Flutter SDK (without it
/// every icon is a box).
Future<void> loadScreenFonts() async {
  await loadBoardFonts();
  if (_loaded) return;
  _loaded = true;
  for (final (family, weights) in [
    ('SansFlexDisplay', [400, 500]),
    ('Inter', [400, 500, 700]),
    ('Andika', [400, 700]),
    ('NotoSansMath', [400]),
    ('JetBrainsMono', [400, 700]),
  ]) {
    final loader = FontLoader('packages/kinetix_ui/$family');
    for (final weight in weights) {
      loader.addFont(rootBundle.load('packages/kinetix_ui/fonts/$family-$weight.ttf'));
    }
    await loader.load();
  }
  final sdk = _flutterRoot();
  if (sdk != null) {
    final icons = File('$sdk/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf');
    if (icons.existsSync()) {
      final bytes = icons.readAsBytesSync();
      await (FontLoader('MaterialIcons')..addFont(Future.value(ByteData.sublistView(bytes)))).load();
    }
    final roboto = File('$sdk/bin/cache/artifacts/material_fonts/Roboto-Regular.ttf');
    if (roboto.existsSync()) {
      final bytes = roboto.readAsBytesSync();
      await (FontLoader('Roboto')..addFont(Future.value(ByteData.sublistView(bytes)))).load();
    }
  }
}

var _loaded = false;

String? _flutterRoot() {
  final env = Platform.environment['FLUTTER_ROOT'];
  if (env != null && env.isNotEmpty) return env;
  // The test runs from the Flutter SDK's own Dart: <sdk>/bin/cache/dart-sdk/bin/dart.
  final exe = File(Platform.resolvedExecutable).absolute.path;
  final i = exe.indexOf('/bin/cache/');
  return i < 0 ? null : exe.substring(0, i);
}
