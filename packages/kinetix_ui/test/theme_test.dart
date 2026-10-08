import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

void main() {
  test('all themes are Material 3 in Google Sans Flex, headlines in its display cut', () {
    for (final t in [KinetixTheme.light(), KinetixTheme.dark(), KinetixTheme.board(), KinetixTheme.boardChrome()]) {
      expect(t.useMaterial3, isTrue);
      expect(t.textTheme.bodyMedium?.fontFamily, KxFonts.family);
      expect(t.textTheme.bodyMedium?.fontFamilyFallback, KxFonts.fallback);
      expect(t.textTheme.headlineMedium?.fontFamily, KxFonts.display);
      expect(t.textTheme.headlineMedium?.fontWeight, FontWeight.w400);
    }
    expect(KinetixTheme.boardChrome().colorScheme.brightness, Brightness.dark);
    expect(KinetixTheme.board().colorScheme.brightness, Brightness.light);
    // Component themes are built from text styles that carry real sizes.
    expect(KinetixTheme.light().textTheme.titleLarge?.fontSize, 22);
    expect(KinetixTheme.light().appBarTheme.titleTextStyle, isNull);
    expect(KinetixTheme.light().inputDecorationTheme.border, isA<UnderlineInputBorder>());
  });

  test('brand: deep blue, marigold for AI', () {
    final s = KinetixTheme.light().colorScheme;
    expect(s.primary, const Color(0xFF1D4ED8));
    expect(s.primary, KxColor.accent);
    expect(s.tertiary, const Color(0xFF8F5B00));
    expect(s.tertiary, KxColor.spark);
    expect(s.surfaceContainerLowest, const Color(0xFFFFFFFF));
    expect(KxFonts.boardFor(primaryClass: true), KxFonts.primary);
    expect(KxFonts.boardFor(primaryClass: false), KxFonts.board);
  });

  test('initials skip honorifics', () {
    expect(KxAvatar.initials('Anita Sharma'), 'AS');
    expect(KxAvatar.initials('Dr. Meera Rao'), 'MR');
    expect(KxAvatar.initials('Ravi'), 'R');
  });

  testWidgets('a labelled tool button shows its name; an icon-only one keeps it in the tooltip', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: KinetixTheme.board(),
        home: Scaffold(
          body: KxToolbar(
            children: [
              KxToolButton(icon: const Icon(Icons.edit), tooltip: 'Pen', label: 'Pen', badge: 'A', selected: true, onTap: () {}),
              const KxToolbarGap(),
              KxToolButton(icon: const Icon(Icons.title), tooltip: 'Text', onTap: () {}),
            ],
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Pen'), findsOneWidget);
    expect(find.text('A'), findsOneWidget);
    expect(find.text('Text'), findsNothing);
    expect(find.byTooltip('Text'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
