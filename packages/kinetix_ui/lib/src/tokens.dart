import 'package:flutter/widgets.dart';

/// Spacing, radii and sizes. Use these instead of literal numbers so screens stay consistent.
abstract final class Kx {
  // Spacing (4-pt grid)
  static const double s4 = 4, s8 = 8, s12 = 12, s16 = 16, s20 = 20, s24 = 24, s32 = 32, s48 = 48;

  // Corner radii (Material 3 shape scale)
  static const double rXs = 4, rSm = 8, rMd = 12, rLg = 16, rXl = 28;
  static const BorderRadius radiusSm = BorderRadius.all(Radius.circular(rSm));
  static const BorderRadius radiusMd = BorderRadius.all(Radius.circular(rMd));
  static const BorderRadius radiusLg = BorderRadius.all(Radius.circular(rLg));
  static const BorderRadius radiusXl = BorderRadius.all(Radius.circular(rXl));

  /// Minimum touch target. Boards are used standing up with a pen, so the board uses [boardTarget].
  static const double target = 48;
  static const double boardTarget = 56;

  /// The brand seed colour. KINETIX brand colours are not final; change only this.
  static const Color seed = Color(0xFF0B57D0);

  /// Fixed semantic colours that must not shift with the theme.
  static const Color live = Color(0xFFE8710A); // "Go live" / recording-adjacent
  static const Color record = Color(0xFFD93025);
  static const Color success = Color(0xFF188038);
}
