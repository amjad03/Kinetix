import 'package:flutter/widgets.dart';

/// Spacing, radii and sizes. Use these instead of literal numbers so screens stay consistent.
/// The ERP mirrors every value as a CSS variable (apps/erp/src/theme/tokens.css).
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

  /// The brand seed colour (deep blue). The light and dark schemes are tuned by hand around
  /// [KxColor.accent] and [KxColorDark.accent]; the seed is for anything generated.
  static const Color seed = Color(0xFF1D4ED8);

  /// Fixed semantic colours that must not shift with the theme.
  static const Color live = Color(0xFFE8710A); // "Go live" / recording-adjacent
  static const Color record = Color(0xFFD93025);
  static const Color success = Color(0xFF15803D);
  static const Color warning = Color(0xFFB45309);

  // Motion
  /// Material 3 emphasized easing: quick start, long gentle settle. For things that move into place.
  static const Curve emphasized = Cubic(0.2, 0, 0, 1);

  /// A spring with a small overshoot, for things that appear or change state.
  static const Curve spring = Cubic(0.34, 1.32, 0.64, 1);
  static const Duration fast = Duration(milliseconds: 200);
  static const Duration medium = Duration(milliseconds: 350);

  /// A card at rest: almost flat, a hairline of shadow. See also [floating].
  static const List<BoxShadow> elevCard = [BoxShadow(color: Color(0x0A0F172A), blurRadius: 2, offset: Offset(0, 1))];

  /// Menus, popovers and dialogs.
  static const List<BoxShadow> elevRaised = [
    BoxShadow(color: Color(0x1A0F172A), blurRadius: 3, offset: Offset(0, 1)),
    BoxShadow(color: Color(0x140F172A), blurRadius: 12, spreadRadius: 1, offset: Offset(0, 4)),
  ];

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

/// The type scale (size / line height / weight), shared with the ERP. Fonts are in `KxFonts`.
/// Headlines use the display cut at regular weight; titles and labels are medium.
abstract final class KxType {
  static const double display = 36, displayLine = 44;
  static const double headline = 24, headlineLine = 32;
  static const double title = 22, titleLine = 28;
  static const double subtitle = 16, subtitleLine = 24;
  static const double body = 14, bodyLine = 20;
  static const double caption = 12, captionLine = 16;

  /// Big numbers on KPI tiles.
  static const double stat = 32, statLine = 40;
}

/// KINETIX colour roles, light (docs/design/design-system.md): white cards on a soft cool-grey
/// ground, one brand colour (a deep, trustworthy blue) for the one strong action on a screen,
/// marigold ("spark") for AI only, and success / warning / danger for state. The ERP mirrors
/// these as CSS variables (apps/erp/src/theme/tokens.css). Chalkboard green is only a board theme.
abstract final class KxColor {
  /// App background: the ground behind the cards.
  static const Color bg = Color(0xFFF3F6FB);

  /// Quiet fills: inputs at rest, tile backgrounds, rails behind content.
  static const Color rail = Color(0xFFE8EDF5);

  /// Cards, toolbars, sheets and dialogs.
  static const Color surface = Color(0xFFFFFFFF);

  /// Pressed, hovered and input fills.
  static const Color surfaceHi = Color(0xFFE0E6F0);

  /// Dividers and hairlines.
  static const Color line = Color(0xFFD5DDE9);

  /// Borders that must be seen (3:1 on a card).
  static const Color outline = Color(0xFF64748B);

  static const Color text = Color(0xFF0F172A);

  /// Secondary text and resting icons.
  static const Color muted = Color(0xFF475569);

  /// Brand: deep blue.
  static const Color accent = Color(0xFF1D4ED8);
  static const Color onAccent = Color(0xFFFFFFFF);

  /// Selected tool, primary tonal.
  static const Color accentContainer = Color(0xFFDBE6FF);
  static const Color onAccentContainer = Color(0xFF0B2A7A);

  /// Selected list rows, chips, "Now".
  static const Color secondaryContainer = Color(0xFFE3EAFA);
  static const Color onSecondaryContainer = Color(0xFF0F2A5C);

  /// AI: marigold. Only AI uses it.
  static const Color spark = Color(0xFF8F5B00);
  static const Color sparkContainer = Color(0xFFFFE2A8);
  static const Color onSparkContainer = Color(0xFF2B1B00);

  /// Tooltips and messages.
  static const Color inverse = Color(0xFF1E293B);
  static const Color onInverse = Color(0xFFEEF2F8);

  static const Color danger = Color(0xFFB3261E);
  static const Color dangerContainer = Color(0xFFFDE3E1);
  static const Color onDangerContainer = Color(0xFF5C0A06);

  static const Color success = Kx.success;
  static const Color successContainer = Color(0xFFDCF3E4);
  static const Color onSuccessContainer = Color(0xFF0B4A22);

  static const Color warning = Kx.warning;
  static const Color warningContainer = Color(0xFFFEF0D4);
  static const Color onWarningContainer = Color(0xFF5A2A00);

  /// Categorical chart colours, each at least 3:1 on a card.
  static const List<Color> chart = [Color(0xFF1D4ED8), Color(0xFF0E7490), Color(0xFF7C3AED), Color(0xFFBE185D), Color(0xFF8F5B00)];

  /// The board's paper and its ink.
  static const Color paper = Color(0xFFFBFAF6);
  static const Color ink = Color(0xFF1B1F24);

  /// The chalkboard: a deep green. Only the board's chalkboard theme uses it.
  static const Color chalkboard = Color(0xFF1F3A30);
}

/// The dark counterparts of [KxColor]: a deep blue-black ground, lighter blue for action.
abstract final class KxColorDark {
  static const Color bg = Color(0xFF0B1220);
  static const Color surfaceLowest = Color(0xFF080D18);
  static const Color surface = Color(0xFF111A2C);
  static const Color rail = Color(0xFF162137);
  static const Color surfaceHi = Color(0xFF1D2940);
  static const Color surfaceHighest = Color(0xFF26334C);
  static const Color line = Color(0xFF2E3B55);
  static const Color outline = Color(0xFF7D8BA3);
  static const Color text = Color(0xFFE2E8F5);
  static const Color muted = Color(0xFFA9B5CA);

  static const Color accent = Color(0xFF9DB8FF);
  static const Color onAccent = Color(0xFF0A2463);
  static const Color accentContainer = Color(0xFF1F3E8F);
  static const Color onAccentContainer = Color(0xFFDBE6FF);
  static const Color secondary = Color(0xFFB7C4DD);
  static const Color secondaryContainer = Color(0xFF26385C);
  static const Color onSecondaryContainer = Color(0xFFDCE6FA);

  static const Color spark = Color(0xFFFFC25E);
  static const Color sparkContainer = Color(0xFF5E3F00);
  static const Color onSparkContainer = Color(0xFFFFE2A8);

  static const Color inverse = Color(0xFFE2E8F5);
  static const Color onInverse = Color(0xFF1E293B);

  static const Color danger = Color(0xFFFFB4AB);
  static const Color dangerContainer = Color(0xFF7A1A14);
  static const Color onDangerContainer = Color(0xFFFFDAD6);

  static const Color success = Color(0xFF86D9A0);
  static const Color successContainer = Color(0xFF0F3D1F);
  static const Color onSuccessContainer = Color(0xFFCDEED8);

  static const Color warning = Color(0xFFFBBF6A);
  static const Color warningContainer = Color(0xFF4A2C00);
  static const Color onWarningContainer = Color(0xFFFFE2B8);

  static const List<Color> chart = [Color(0xFF9DB8FF), Color(0xFF5EEAD4), Color(0xFFC4B5FD), Color(0xFFF9A8D4), Color(0xFFFFC25E)];
}
