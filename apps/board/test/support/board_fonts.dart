import 'package:flutter/services.dart';

/// Loads the board's real fonts (Google Sans, Noto Sans Devanagari and Kannada from
/// kinetix_ui) so widget tests measure Hindi and Kannada text as the board draws it, rather
/// than with the square test font.
Future<void> loadBoardFonts() async {
  if (_loaded) return;
  _loaded = true;
  for (final family in ['GoogleSans', 'NotoSansDevanagari', 'NotoSansKannada']) {
    final loader = FontLoader('packages/kinetix_ui/$family');
    for (final weight in [400, 500, 700]) {
      loader.addFont(rootBundle.load('packages/kinetix_ui/fonts/$family-$weight.ttf'));
    }
    await loader.load();
  }
}

var _loaded = false;
