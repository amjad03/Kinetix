import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

void main() {
  test('all themes are Material 3 from the same seed', () {
    for (final t in [KinetixTheme.light(), KinetixTheme.dark(), KinetixTheme.boardChrome()]) {
      expect(t.useMaterial3, isTrue);
      expect(t.textTheme.bodyMedium?.fontFamily, KxFonts.family);
      expect(t.textTheme.bodyMedium?.fontFamilyFallback, KxFonts.fallback);
    }
    expect(KinetixTheme.boardChrome().colorScheme.brightness, Brightness.dark);
    // Component themes are built from text styles that carry real sizes.
    expect(KinetixTheme.light().textTheme.titleLarge?.fontSize, 22);
    expect(KinetixTheme.light().appBarTheme.titleTextStyle, isNull);
    expect(KinetixTheme.light().inputDecorationTheme.border, isA<UnderlineInputBorder>());
  });

  test('initials skip honorifics', () {
    expect(KxAvatar.initials('Anita Sharma'), 'AS');
    expect(KxAvatar.initials('Dr. Meera Rao'), 'MR');
    expect(KxAvatar.initials('Ravi'), 'R');
  });
}
