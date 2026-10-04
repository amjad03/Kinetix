import 'package:flutter/material.dart';

import 'tokens.dart';

const _pkg = 'packages/kinetix_ui';

/// Primary typeface plus fallbacks for Hindi and Kannada text, bundled so it works offline.
abstract final class KxFonts {
  static const family = '$_pkg/GoogleSans';
  static const fallback = ['$_pkg/NotoSansDevanagari', '$_pkg/NotoSansKannada'];
}

/// Material 3 themes for every KINETIX app.
abstract final class KinetixTheme {
  static ThemeData light() => _build(ColorScheme.fromSeed(seedColor: Kx.seed));
  static ThemeData dark() => _build(ColorScheme.fromSeed(seedColor: Kx.seed, brightness: Brightness.dark));

  /// The board's chrome (toolbars, panels, dialogs) sits on a bright canvas seen from across a
  /// classroom, so it uses the dark scheme for contrast while the canvas stays light.
  static ThemeData boardChrome() => _build(
        ColorScheme.fromSeed(seedColor: Kx.seed, brightness: Brightness.dark),
        large: true,
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
    // M3 geometry in here so styles stored in component themes have real font sizes.
    final text = Typography.englishLike2021.merge(base.textTheme).apply(fontFamily: KxFonts.family, fontFamilyFallback: KxFonts.fallback);
    // Filled text fields: rounded box, no outline, an underline only when focused or invalid.
    // (A borderless OutlineInputBorder would float the label onto the top edge of the box.)
    UnderlineInputBorder field([Color? color, double width = 2]) => UnderlineInputBorder(
          borderRadius: Kx.radiusMd,
          borderSide: color == null ? BorderSide.none : BorderSide(color: color, width: width),
        );
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
        color: scheme.surfaceContainerLow,
        shape: const RoundedRectangleBorder(borderRadius: Kx.radiusLg),
        margin: EdgeInsets.zero,
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: Size(64, large ? Kx.boardTarget : Kx.target),
          textStyle: text.labelLarge?.copyWith(fontWeight: FontWeight.w500, fontSize: large ? 16 : 14),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(minimumSize: Size(64, large ? Kx.boardTarget : Kx.target)),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: scheme.surfaceContainerHighest,
        border: field(),
        enabledBorder: field(),
        disabledBorder: field(),
        focusedBorder: field(scheme.primary),
        errorBorder: field(scheme.error, 1),
        focusedErrorBorder: field(scheme.error),
      ),
      chipTheme: ChipThemeData(shape: const RoundedRectangleBorder(borderRadius: Kx.radiusSm)),
      dialogTheme: DialogThemeData(
        backgroundColor: scheme.surfaceContainerHigh,
        shape: const RoundedRectangleBorder(borderRadius: Kx.radiusXl),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: scheme.surfaceContainerLow,
        showDragHandle: true,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(Kx.rXl))),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: scheme.surfaceContainer,
        indicatorColor: scheme.secondaryContainer,
      ),
      snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
      tooltipTheme: TooltipThemeData(waitDuration: const Duration(milliseconds: 600), textStyle: text.bodySmall?.copyWith(color: scheme.onInverseSurface)),
      dividerTheme: DividerThemeData(color: scheme.outlineVariant, space: 1),
    );
  }
}


/// Small helper: `context.kx.primary` etc.
extension KxContext on BuildContext {
  ColorScheme get colors => Theme.of(this).colorScheme;
  TextTheme get text => Theme.of(this).textTheme;
}
