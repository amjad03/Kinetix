import 'package:flutter/services.dart';

/// Loads the board's real fonts (Google Sans Flex, Noto Sans Devanagari and Kannada from
/// kinetix_ui) so widget tests measure Hindi and Kannada text as the board draws it, rather
/// than with the square test font.
Future<void> loadBoardFonts() async {
  if (_loaded) return;
  _loaded = true;
  for (final (family, weights) in [
    ('SansFlex', [400, 500, 600, 700]),
    ('NotoSansDevanagari', [400, 500, 700]),
    ('NotoSansKannada', [400, 500, 700]),
  ]) {
    final loader = FontLoader('packages/kinetix_ui/$family');
    for (final weight in weights) {
      loader.addFont(rootBundle.load('packages/kinetix_ui/fonts/$family-$weight.ttf'));
    }
    await loader.load();
  }
}

var _loaded = false;
