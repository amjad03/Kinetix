import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/features/board/layout/backgrounds_popover.dart';
import 'package:kinetix_board/features/board/layout/layout_strings.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

/// The Teachmint theme-template list (docs/requirements/BOARD_TEACHMINT_PARITY.md): every
/// template is offered, spelled as the reference spells it, named in every board language, and
/// paints on a light and a dark board.
void main() {
  const spec = {
    BoardBackground.black: 'Black',
    BoardBackground.grid: 'Grid Lines',
    BoardBackground.ruled: 'Horizontal Lines',
    BoardBackground.fourLine: 'English Lines',
    BoardBackground.twoColumns: '2 Columns',
    BoardBackground.threeColumns: '3 Columns',
    BoardBackground.isometric: 'Isometric Grid',
    BoardBackground.graph: 'Graph',
    BoardBackground.hindiLines: 'Hindi Lines',
    BoardBackground.dots: 'Dotted',
    BoardBackground.checks: 'Checks',
    BoardBackground.musicStaff: 'Music Lines',
    BoardBackground.basketballCourt: 'Basketball Layout',
    BoardBackground.footballField: 'Football Layout',
    BoardBackground.worldMap: 'World Map',
  };

  test('all fifteen templates are offered, once each', () {
    expect(templateBackgrounds.toSet().containsAll(spec.keys), isTrue);
    expect(templateBackgrounds.toSet().length, templateBackgrounds.length);
  });

  test('English names are spelled as the reference spells them', () {
    final en = LayoutStrings('en');
    spec.forEach((b, name) => expect(en.bgName(b.name), name, reason: b.name));
  });

  test('every template has a name in English, Hindi and Kannada (no raw key)', () {
    for (final lang in ['en', 'hi', 'kn']) {
      final s = LayoutStrings(lang);
      // The chalkboard's name comes from the app's own localisation files (paperName falls back to them).
      for (final b in templateBackgrounds.where((b) => b != BoardBackground.chalkboard)) {
        expect(s.bgName(b.name), isNot('bg_${b.name}'), reason: '${b.name} in $lang');
      }
    }
  });

  test('each template paints a full sheet without error', () {
    for (final b in templateBackgrounds) {
      final rec = PictureRecorder();
      paintBoardBackground(Canvas(rec), Offset.zero & boardSheet, b);
      rec.endRecording().dispose();
    }
  });
}
