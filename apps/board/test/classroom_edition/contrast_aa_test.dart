import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/classroom_edition/ui/ce_style.dart';

/// WCAG 2.1 AA for the Classroom edition's colours (P1 item 22): 4.5:1 for text, 3:1 for large
/// text (24 px, or 19 px bold) and for icons and borders that carry meaning.
void main() {
  double contrast(Color a, Color b) {
    final la = a.computeLuminance(), lb = b.computeLuminance();
    return (math(la, lb) + 0.05) / (mathMin(la, lb) + 0.05);
  }

  Color over(Color fg, Color bg) => Color.alphaBlend(fg, bg);

  const backgrounds = {'white': Colors.white, 'page': CeC.page, 'lavender': CeC.lavender, 'peach': CeC.peach, 'mint': CeC.mint, 'blue': CeC.blue, 'butter': CeC.butter, 'pink': CeC.pink};

  test('body text: navy, muted and the dark tip text on every background', () {
    for (final (name, fg) in [('navy', CeC.navy), ('muted', CeC.muted), ('body', CeC.body), ('tip', CeC.tip)]) {
      for (final MapEntry(key: bgName, value: bg) in backgrounds.entries) {
        expect(contrast(fg, bg), greaterThanOrEqualTo(4.5), reason: '$name on $bgName');
      }
    }
  });

  test('status colours: right, wrong, warnings and links', () {
    final pairs = <(String, Color, Color, double)>[
      ('accent on white', CeC.accent, Colors.white, 4.5),
      ('accent on page', CeC.accent, CeC.page, 4.5),
      ('white on accent (big buttons)', Colors.white, CeC.accent, 4.5),
      ('white on navy (selected)', Colors.white, CeC.navy, 4.5),
      ('green on white', CeC.green, Colors.white, 4.5),
      ('green on mint (right)', CeC.green, CeC.mint, 4.5),
      ('red on white', CeC.red, Colors.white, 4.5),
      ('red on butter', CeC.red, CeC.butter, 4.5),
      ('red on page', CeC.red, CeC.page, 4.5),
      ('wrong on pink', CeC.wrong, CeC.pink, 4.5),
      ('wrong on white', CeC.wrong, Colors.white, 4.5),
      ('warning text on butter (clashes)', CeC.warningText, CeC.butter, 4.5),
      ('warning icon and border on butter', CeC.warning, CeC.butter, 3),
      ('absent roll number on grey', CeC.muted, CeC.absent, 4.5),
      ('later-today times (navy 75%) on peach', over(CeC.navy.withValues(alpha: 0.75), CeC.peach), CeC.peach, 4.5),
      ('later-today times (navy 75%) on butter', over(CeC.navy.withValues(alpha: 0.75), CeC.butter), CeC.butter, 4.5),
      ('later-today times (navy 75%) on blue', over(CeC.navy.withValues(alpha: 0.75), CeC.blue), CeC.blue, 4.5),
      ('right border on mint', CeC.green, CeC.mint, 3),
      ('wrong border on pink', CeC.wrong, CeC.pink, 3),
    ];
    for (final (what, fg, bg, min) in pairs) {
      expect(contrast(fg, bg), greaterThanOrEqualTo(min), reason: '$what: ${contrast(fg, bg).toStringAsFixed(2)}');
    }
  });
}

double math(double a, double b) => a > b ? a : b;
double mathMin(double a, double b) => a < b ? a : b;
