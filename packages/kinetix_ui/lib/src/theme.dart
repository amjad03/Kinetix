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
    final text = base.textTheme.apply(fontFamily: KxFonts.family, fontFamilyFallback: KxFonts.fallback);
    return base.copyWith(
      textTheme: text,
      scaffoldBackgroundColor: scheme.surface,
      appBarTheme: AppBarTheme(
        backgroundColor: scheme.surface,
        foregroundColor: scheme.onSurface,
        surfaceTintColor: Colors.transparent,
        centerTitle: false,
        titleTextStyle: text.titleLarge?.copyWith(color: scheme.onSurface, fontWeight: FontWeight.w500),
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
        border: const OutlineInputBorder(borderRadius: Kx.radiusMd, borderSide: BorderSide.none),
        enabledBorder: const OutlineInputBorder(borderRadius: Kx.radiusMd, borderSide: BorderSide.none),
        focusedBorder: OutlineInputBorder(borderRadius: Kx.radiusMd, borderSide: BorderSide(color: scheme.primary, width: 2)),
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
