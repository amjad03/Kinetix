import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

/// The canvas-painted word card: every word fits, and the picture sits inside the card, in
/// both a light and a dark board.
const _text = 'EPHEMERAL\nlasting a very short time (thodi der / swalpa kaala)\n“The morning dew is ephemeral.”';

NoteElement _card({required String text, bool picture = true, Rect rect = const Rect.fromLTWH(20, 20, 520, 216)}) => NoteElement(
  id: 'c',
  rect: rect,
  text: text,
  color: const Color(0xFFFDD663),
  kind: NoteKind.card,
  language: picture ? 'icon:${Icons.wb_sunny_outlined.codePoint}' : null,
);

class _P extends CustomPainter {
  _P(this.bg, this.cards);
  final BoardBackground bg;
  final List<NoteElement> cards;
  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = bg.isDark ? const Color(0xFF1F2A24) : const Color(0xFFFFFFFF));
    for (final c in cards) {
      paintElement(canvas, c, bg);
    }
  }

  @override
  bool shouldRepaint(_P old) => false;
}

void main() {
  test('words and picture stay inside the card, apart, for short and long text, with and without a picture', () {
    for (final text in ['CAT', _text, 'A' * 40, List.filled(12, 'line of words').join('\n')]) {
      for (final pic in [true, false]) {
        for (final rect in const [Rect.fromLTWH(20, 20, 520, 216), Rect.fromLTWH(20, 20, 320, 160), Rect.fromLTWH(0, 0, 200, 90)]) {
          final card = _card(text: text, picture: pic, rect: rect);
          final lay = cardLayout(card);
          final name = '${text.length} chars, pic $pic, $rect';
          expect(card.rect.contains(lay.text.rect.topLeft) && card.rect.contains(lay.text.rect.bottomRight), isTrue, reason: 'text inside card: $name');
          expect(lay.text.painter.width, lessThanOrEqualTo(card.rect.width - 24 + 0.5), reason: 'text not wider than the card: $name');
          if (pic) {
            final ic = lay.icon!.rect;
            expect(card.rect.contains(ic.topLeft) && card.rect.contains(ic.bottomRight), isTrue, reason: 'picture inside card: $name');
            expect(ic.overlaps(lay.text.rect), isFalse, reason: 'picture clear of the text: $name');
          } else {
            expect(lay.icon, isNull);
          }
        }
      }
    }
  });

  for (final dark in [false, true]) {
    testWidgets('word card golden, ${dark ? 'dark' : 'light'} board', (tester) async {
      tester.view.physicalSize = const Size(560, 520);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final cards = [_card(text: _text), _card(text: 'CAT', picture: false, rect: const Rect.fromLTWH(20, 270, 320, 160))];
      await tester.pumpWidget(
        RepaintBoundary(
          key: const Key('c'),
          child: CustomPaint(painter: _P(dark ? BoardBackground.night : BoardBackground.plain, cards), size: const Size(560, 520)),
        ),
      );
      await expectLater(find.byKey(const Key('c')), matchesGoldenFile('goldens/word_card_${dark ? 'dark' : 'light'}.png'));
    });
  }
}
