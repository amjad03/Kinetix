import 'package:flutter/widgets.dart';

/// Spacing, radii and sizes. Use these instead of literal numbers so screens stay consistent.
abstract final class Kx {
  // Spacing (4-pt grid)
  static const double s4 = 4, s8 = 8, s12 = 12, s16 = 16, s20 = 20, s24 = 24, s32 = 32, s48 = 48;

  // Corner radii (Material 3 shape scale). Inputs and small chips 12, cards 16–20, sheets,
  // dialogs and floating panels 24–28, buttons and toolbars full.
  static const double rXs = 4, rSm = 8, rMd = 12, rLg = 16, rXl = 28, rFull = 999;
  static const BorderRadius radiusSm = BorderRadius.all(Radius.circular(rSm));
  static const BorderRadius radiusMd = BorderRadius.all(Radius.circular(rMd));
  static const BorderRadius radiusLg = BorderRadius.all(Radius.circular(rLg));
  static const BorderRadius radiusXl = BorderRadius.all(Radius.circular(rXl));

  /// Minimum touch target. Boards are used standing up with a pen, so the board uses [boardTarget].
  static const double target = 48;
  static const double boardTarget = 56;

  /// The brand seed colour (chalkboard green). Schemes built from a seed use this; the light
  /// scheme is tuned by hand around [KxColor.accent].
  static const Color seed = Color(0xFF16805A);

  /// Fixed semantic colours that must not shift with the theme.
  static const Color live = Color(0xFFE8710A); // "Go live" / recording-adjacent
  static const Color record = Color(0xFFD93025);
  static const Color success = Color(0xFF188038);

  // Motion
  /// Material 3 emphasized easing: quick start, long gentle settle. For things that move into place.
  static const Curve emphasized = Cubic(0.2, 0, 0, 1);

  /// A spring with a small overshoot, for things that appear or change state.
  static const Curve spring = Cubic(0.34, 1.32, 0.64, 1);
  static const Duration fast = Duration(milliseconds: 200);
  static const Duration medium = Duration(milliseconds: 350);

  /// A floating surface over the board (toolbars, pills, popovers): white, rounded, with a soft
  /// two-layer shadow. Do not use Material elevation on the board.
  static BoxDecoration floating({double radius = rXl, Color color = KxColor.surface}) => BoxDecoration(
    color: color,
    borderRadius: BorderRadius.circular(radius),
    boxShadow: const [
      BoxShadow(color: Color(0x1A000000), blurRadius: 3, offset: Offset(0, 1)),
      BoxShadow(color: Color(0x14000000), blurRadius: 12, spreadRadius: 1, offset: Offset(0, 4)),
    ],
  );
}

/// KINETIX colour roles (docs/design/design-system.md): quiet, nearly neutral light surfaces,
/// one brand colour (chalkboard green) for the one strong action on a screen, and marigold
/// ("spark") for AI only. The ERP mirrors these as CSS variables (apps/erp/src/theme/tokens.css).
abstract final class KxColor {
  /// App background.
  static const Color bg = Color(0xFFF4F7F4);

  /// Quiet fills: inputs at rest, tile backgrounds, rails behind content.
  static const Color rail = Color(0xFFECF1EC);

  /// Cards, toolbars, sheets and dialogs.
  static const Color surface = Color(0xFFFFFFFF);

  /// Pressed, hovered and input fills.
  static const Color surfaceHi = Color(0xFFE4EAE4);

  /// Dividers and hairlines.
  static const Color line = Color(0xFFD7DED8);

  /// Borders that must be seen.
  static const Color outline = Color(0xFF707973);

  static const Color text = Color(0xFF171D19);

  /// Secondary text and resting icons.
  static const Color muted = Color(0xFF4E5852);

  /// Brand: chalkboard green.
  static const Color accent = Color(0xFF006545);
  static const Color onAccent = Color(0xFFFFFFFF);

  /// Selected tool, primary tonal.
  static const Color accentContainer = Color(0xFFB4F0D2);
  static const Color onAccentContainer = Color(0xFF002114);

  /// Selected list rows, chips, "Now".
  static const Color secondaryContainer = Color(0xFFD3E8DA);
  static const Color onSecondaryContainer = Color(0xFF0E1F16);

  /// AI: marigold. Only AI uses it.
  static const Color spark = Color(0xFF835400);
  static const Color sparkContainer = Color(0xFFFFDDB5);
  static const Color onSparkContainer = Color(0xFF2A1800);

  /// Tooltips and messages.
  static const Color inverse = Color(0xFF2C322E);
  static const Color onInverse = Color(0xFFEDF2EC);

  static const Color danger = Color(0xFFBA1A1A);
  static const Color dangerContainer = Color(0xFFFFDAD6);
  static const Color onDangerContainer = Color(0xFF410002);

  /// The board's paper and its ink.
  static const Color paper = Color(0xFFFBFAF6);
  static const Color ink = Color(0xFF1B1F24);

  /// The chalkboard: a deep version of the brand green.
  static const Color chalkboard = Color(0xFF1F3A30);
}
