import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

/// The Classroom edition's colours (the Zynetix website's navy, blue and pastels).
abstract final class CeC {
  static const navy = Color(0xFF13165A);
  static const accent = Color(0xFF1D4ED8);
  static const page = Color(0xFFF3F6FB);
  static const lavender = Color(0xFFECE9FB);
  static const peach = Color(0xFFFDE8DC);
  static const mint = Color(0xFFDFF3E8);
  static const blue = Color(0xFFE1EDFB);
  static const butter = Color(0xFFFFF4CC);
  static const pink = Color(0xFFFBE3EC);
  static const pastels = [lavender, peach, mint, blue, butter, pink];
  static const muted = Color(0xFF475569);
  static const body = Color(0xFF1E293B);
  static const line = Color(0xFFD5DDE9);
  static const green = Color(0xFF15803D);
  static const red = Color(0xFFC2410C);

  static Color pastel(int i) => pastels[i.abs() % pastels.length];
}

/// A heading in the display face.
TextStyle ceHeading(double size, {FontWeight w = FontWeight.w500, Color c = CeC.navy, double? height}) =>
    TextStyle(fontFamily: KxFonts.display, fontFamilyFallback: KxFonts.fallback, fontSize: size, fontWeight: w, color: c, height: height);

/// Body text.
TextStyle ceText(double size, {FontWeight w = FontWeight.w400, Color c = CeC.muted, double? height}) =>
    TextStyle(fontFamily: KxFonts.family, fontFamilyFallback: KxFonts.fallback, fontSize: size, fontWeight: w, color: c, height: height);

BoxDecoration ceCard({Color color = Colors.white, double r = 24, bool shadow = true}) => BoxDecoration(color: color, borderRadius: BorderRadius.circular(r), boxShadow: shadow ? Kx.elevRaised : null);

Widget ceIconDot(IconData i, {Color bg = Colors.white, Color fg = CeC.navy, double size = 44}) => Container(
  width: size,
  height: size,
  decoration: BoxDecoration(color: bg, shape: BoxShape.circle),
  child: Icon(i, color: fg, size: size * 0.5),
);

Widget cePill(String label, {IconData? icon, Color bg = CeC.mint, Color fg = CeC.navy, Key? key}) => Container(
  key: key,
  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
  decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(99)),
  child: Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      if (icon != null) ...[Icon(icon, size: 18, color: fg), const SizedBox(width: 8)],
      Flexible(child: Text(label, overflow: TextOverflow.ellipsis, style: ceText(14, w: FontWeight.w600, c: fg))),
    ],
  ),
);

ButtonStyle ceBigButton({Color bg = CeC.accent}) => FilledButton.styleFrom(
  backgroundColor: bg,
  foregroundColor: Colors.white,
  minimumSize: const Size(0, 56),
  padding: const EdgeInsets.symmetric(horizontal: 28),
  shape: const StadiumBorder(),
  textStyle: ceText(17, w: FontWeight.w600),
);

ButtonStyle ceSoftButton() => OutlinedButton.styleFrom(
  minimumSize: const Size(0, 56),
  padding: const EdgeInsets.symmetric(horizontal: 24),
  shape: const StadiumBorder(),
  side: const BorderSide(color: CeC.line, width: 1.5),
  foregroundColor: CeC.navy,
  backgroundColor: Colors.white,
  textStyle: ceText(17, w: FontWeight.w600),
);

/// The brand mark: a rounded tile, the wordmark and "Classroom edition".
Widget ceBrand({double size = 40}) => Row(
  mainAxisSize: MainAxisSize.min,
  children: [
    Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [Color(0xFF1D4ED8), Color(0xFF13165A)], begin: Alignment.topLeft, end: Alignment.bottomRight),
        borderRadius: BorderRadius.circular(size * 0.3),
      ),
      child: Icon(Icons.draw_outlined, color: Colors.white, size: size * 0.55),
    ),
    const SizedBox(width: 12),
    Text('Zynetix Board', style: ceHeading(size * 0.6)),
    const SizedBox(width: 12),
    Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
      decoration: BoxDecoration(color: CeC.lavender, borderRadius: BorderRadius.circular(99)),
      child: Text('Classroom edition', style: ceText(14, w: FontWeight.w600, c: CeC.navy)),
    ),
  ],
);

/// A light Material theme for the Classroom edition's own screens (start, settings).
ThemeData ceTheme(BuildContext context) {
  final base = Theme.of(context);
  return base.copyWith(
    colorScheme: base.colorScheme.copyWith(primary: CeC.accent, onPrimary: Colors.white, surface: Colors.white, onSurface: CeC.navy),
    scaffoldBackgroundColor: CeC.page,
  );
}
