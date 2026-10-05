import 'package:flutter/material.dart';

import 'tokens.dart';

const _pkg = 'packages/kinetix_ui';

/// The bundled typefaces (fonts/NOTICE.md), so every app works offline.
abstract final class KxFonts {
  /// Google Sans Flex: interface text.
  static const family = '$_pkg/SansFlex';

  /// Google Sans Flex, display cut: headlines.
  static const display = '$_pkg/SansFlexDisplay';

  /// Text written on the board.
  static const board = '$_pkg/Inter';

  /// Board text for LKG to Class 5 (single-storey a and g).
  static const primary = '$_pkg/Andika';

  /// Code blocks.
  static const code = '$_pkg/JetBrainsMono';

  /// Hindi and Kannada letters, then Greek and symbols, then geometry signs, for text whose own
  /// font has none.
  static const fallback = ['$_pkg/NotoSansDevanagari', '$_pkg/NotoSansKannada', '$_pkg/Inter', '$_pkg/NotoSansMath'];

  /// The board text font for a class: Andika for the little ones, Inter for everyone else.
  static String boardFor({required bool primaryClass}) => primaryClass ? primary : board;
}

/// Material 3 themes for every KINETIX app: chalkboard green, quiet light surfaces, marigold
/// for AI (docs/design/design-system.md).
abstract final class KinetixTheme {
  /// The light scheme, tuned by hand around the brand green rather than generated, so surfaces
  /// stay nearly neutral.
  static const lightScheme = ColorScheme(
    brightness: Brightness.light,
    primary: KxColor.accent,
    onPrimary: KxColor.onAccent,
    primaryContainer: KxColor.accentContainer,
    onPrimaryContainer: KxColor.onAccentContainer,
    secondary: Color(0xFF4D6357),
    onSecondary: Color(0xFFFFFFFF),
    secondaryContainer: KxColor.secondaryContainer,
    onSecondaryContainer: KxColor.onSecondaryContainer,
    tertiary: KxColor.spark,
    onTertiary: Color(0xFFFFFFFF),
    tertiaryContainer: KxColor.sparkContainer,
    onTertiaryContainer: KxColor.onSparkContainer,
    error: KxColor.danger,
    onError: Color(0xFFFFFFFF),
    errorContainer: KxColor.dangerContainer,
    onErrorContainer: KxColor.onDangerContainer,
    surface: KxColor.bg,
    onSurface: KxColor.text,
    onSurfaceVariant: KxColor.muted,
    surfaceContainerLowest: KxColor.surface,
    surfaceContainerLow: Color(0xFFF0F4F0),
    surfaceContainer: KxColor.rail,
    surfaceContainerHigh: KxColor.surfaceHi,
    surfaceContainerHighest: Color(0xFFDEE4DE),
    outline: KxColor.outline,
    outlineVariant: KxColor.line,
    inverseSurface: KxColor.inverse,
    onInverseSurface: KxColor.onInverse,
    inversePrimary: Color(0xFF8DD7B1),
    shadow: Color(0xFF000000),
    scrim: Color(0xFF000000),
    surfaceTint: Color(0x00000000),
  );

  static ThemeData light() => _build(lightScheme);
  static ThemeData dark() => _build(ColorScheme.fromSeed(seedColor: Kx.seed, brightness: Brightness.dark).copyWith(tertiary: const Color(0xFFFFB95C)));

  /// The board's light floating chrome: white surfaces over the board, larger
  /// touch targets for a teacher standing at the panel.
  static ThemeData board() => _build(lightScheme, large: true);

  /// The board's dark chrome (the Dark app theme, split-screen 3D models and labs): reads
  /// clearly over a bright canvas from the back of a classroom.
  static ThemeData boardChrome() => _build(
    ColorScheme.fromSeed(seedColor: Kx.seed, brightness: Brightness.dark).copyWith(tertiary: const Color(0xFFFFB95C)),
    large: true,
  );

  /// Chalkboard green: dark green surfaces and chalk-coloured accents. [large] for the board's
  /// chrome (larger touch targets).
  static ThemeData chalkboard({bool large = false}) => _build(chalkboardScheme, large: large);

  static final chalkboardScheme = ColorScheme.fromSeed(seedColor: const Color(0xFF2F6B4F), brightness: Brightness.dark).copyWith(
    primary: const Color(0xFFA8E6C1),
    onPrimary: const Color(0xFF0B3520),
    tertiary: const Color(0xFFFFE08A),
    surface: const Color(0xFF1E3A2B),
    onSurface: const Color(0xFFEFF5EC),
    onSurfaceVariant: const Color(0xFFC3D3C5),
    surfaceContainerLowest: const Color(0xFF163022),
    surfaceContainerLow: const Color(0xFF213F2F),
    surfaceContainer: const Color(0xFF254634),
    surfaceContainerHigh: const Color(0xFF2B4F3B),
    surfaceContainerHighest: const Color(0xFF325843),
  );

  static ThemeData _build(ColorScheme scheme, {bool large = false}) {
    final base = ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      fontFamily: KxFonts.family,
      fontFamilyFallback: KxFonts.fallback,
      visualDensity: VisualDensity.standard,
    );
    // ThemeData.textTheme carries colours only; sizes are added later by Theme.of. Merge the
    // M3 geometry in here so styles stored in component themes have real font sizes. Big type
    // is regular (400) in the display cut; titles and labels are medium (500).
    var text = Typography.englishLike2021.merge(base.textTheme).apply(fontFamily: KxFonts.family, fontFamilyFallback: KxFonts.fallback);
    TextStyle? display(TextStyle? s) => s?.copyWith(fontFamily: KxFonts.display, fontWeight: FontWeight.w400);
    text = text.copyWith(
      displayLarge: display(text.displayLarge),
      displayMedium: display(text.displayMedium),
      displaySmall: display(text.displaySmall),
      headlineLarge: display(text.headlineLarge),
      headlineMedium: display(text.headlineMedium),
      headlineSmall: display(text.headlineSmall),
    );
    // Filled text fields: rounded box, no outline, an underline only when focused or invalid.
    // (A borderless OutlineInputBorder would float the label onto the top edge of the box.)
    UnderlineInputBorder field([Color? color, double width = 2]) => UnderlineInputBorder(
      borderRadius: Kx.radiusMd,
      borderSide: color == null ? BorderSide.none : BorderSide(color: color, width: width),
    );
    final light = scheme.brightness == Brightness.light;
    return base.copyWith(
      textTheme: text,
      scaffoldBackgroundColor: scheme.surface,
      appBarTheme: AppBarTheme(
        backgroundColor: scheme.surface,
        foregroundColor: scheme.onSurface,
        surfaceTintColor: Colors.transparent,
        centerTitle: false,
        // No titleTextStyle: Material 3 sizes collapsed and large (expanded) titles itself.
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        color: light ? scheme.surfaceContainerLowest : scheme.surfaceContainerLow,
        shape: const RoundedRectangleBorder(borderRadius: Kx.radiusLg),
        margin: EdgeInsets.zero,
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: Size(64, large ? Kx.boardTarget : Kx.target),
          shape: const StadiumBorder(),
          textStyle: text.labelLarge?.copyWith(fontWeight: FontWeight.w500, fontSize: large ? 16 : 14),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(minimumSize: Size(64, large ? Kx.boardTarget : Kx.target), shape: const StadiumBorder()),
      ),
      textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(shape: const StadiumBorder())),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: light ? scheme.surfaceContainer : scheme.surfaceContainerHighest,
        border: field(),
        enabledBorder: field(),
        disabledBorder: field(),
        focusedBorder: field(scheme.primary),
        errorBorder: field(scheme.error, 1),
        focusedErrorBorder: field(scheme.error),
      ),
      chipTheme: ChipThemeData(
        shape: const RoundedRectangleBorder(borderRadius: Kx.radiusMd),
        selectedColor: scheme.secondaryContainer,
        side: BorderSide(color: scheme.outlineVariant),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: light ? scheme.surfaceContainerLowest : scheme.surfaceContainerHigh,
        surfaceTintColor: Colors.transparent,
        shape: const RoundedRectangleBorder(borderRadius: Kx.radiusXl),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: light ? scheme.surfaceContainerLowest : scheme.surfaceContainerLow,
        surfaceTintColor: Colors.transparent,
        showDragHandle: true,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(Kx.rXl))),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: scheme.surfaceContainer,
        indicatorColor: light ? scheme.primaryContainer : scheme.secondaryContainer,
      ),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: scheme.primaryContainer,
        foregroundColor: scheme.onPrimaryContainer,
      ),
      snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
      tooltipTheme: TooltipThemeData(
        waitDuration: const Duration(milliseconds: 600),
        textStyle: text.bodySmall?.copyWith(color: scheme.onInverseSurface),
      ),
      dividerTheme: DividerThemeData(color: scheme.outlineVariant, space: 1),
      progressIndicatorTheme: ProgressIndicatorThemeData(color: scheme.primary),
    );
  }
}

/// Small helper: `context.colors.primary` etc.
extension KxContext on BuildContext {
  ColorScheme get colors => Theme.of(this).colorScheme;
  TextTheme get text => Theme.of(this).textTheme;
}
