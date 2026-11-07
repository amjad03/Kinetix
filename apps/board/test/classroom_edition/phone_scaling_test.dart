import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/classroom_edition/edition.dart';
import 'package:kinetix_board/classroom_edition/ui/phone_fit.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import '../support/board_fonts.dart';
import 'ce_support.dart';

/// On a phone the Classroom edition shows the 1920 × 1080 board scaled to fit (screens 12, 13),
/// and ink still lands under the finger.
void main() {
  setUpAll(loadBoardFonts);
  tearDown(() => Edition.classroom = Edition.built == 'classroom');

  test('a phone is a screen whose shortest side is under 600', () {
    expect(CePhoneFit.isPhone(const Size(844, 390)), isTrue);
    expect(CePhoneFit.isPhone(const Size(390, 844)), isTrue);
    expect(CePhoneFit.isPhone(const Size(1280, 800)), isFalse);
    expect(CePhoneFit.isPhone(const Size(1920, 1080)), isFalse);
  });

  testWidgets('a phone on its side: the board laid out at 1920 × 1080, letterboxed, and the pen writes under the finger', (tester) async {
    final board = (await tester.runAsync(() => classroomBoard(seed: sampleCollege())))!;
    await pumpApp(tester, board, size: const Size(844, 390));
    expect(find.byKey(const Key('ce-phone-fit')), findsOneWidget);
    // The start screen is the board's own layout, scaled.
    expect(find.byKey(const Key('ce-start-class')), findsOneWidget);
    await tapKey(tester, 'ce-start-class');
    await settle(tester, 10);
    expect(board.localClass, isTrue);

    final canvas = find.byType(WhiteboardCanvas).first;
    // Laid out as on a panel ...
    expect(tester.getSize(canvas), const Size(1920, 1080));
    // ... and shown at 390 / 1080 of that, centred between two bands.
    final onScreen = tester.getRect(canvas);
    const scale = 390 / 1080;
    expect(onScreen.height, moreOrLessEquals(390, epsilon: 0.5));
    expect(onScreen.width, moreOrLessEquals(1920 * scale, epsilon: 0.5));
    expect(onScreen.left, moreOrLessEquals((844 - 1920 * scale) / 2, epsilon: 0.5));
    // The Simple board's big tools are all there, in the phone's screen.
    for (final k in ['tool-pen', 'ce-colours', 'tool-erase', 'undo', 'ce-lessons', 'ce-class-tools', 'ce-show-all', 'board-menu', 'add-page']) {
      final r = tester.getRect(find.byKey(Key(k)).first);
      expect(const Offset(0, 0) & const Size(844, 390), predicate<Rect>((s) => s.contains(r.center)), reason: k);
    }

    // A stroke drawn with a finger on the phone's screen ...
    final wb = tester.widget<WhiteboardCanvas>(canvas).controller;
    wb.tool = BoardTool.pen;
    const from = Offset(300, 150);
    final g = await tester.startGesture(from, kind: PointerDeviceKind.touch);
    for (var i = 0; i < 6; i++) {
      await g.moveBy(const Offset(12, 4));
    }
    await g.up();
    await settle(tester, 2);
    final stroke = wb.elements.whereType<Stroke>().single;
    // ... is on the board right under where the finger went down and where it lifted.
    final box = tester.renderObject<RenderBox>(canvas);
    Offset toPhone(InkPoint p) => box.localToGlobal(wb.view.value.toScreen(Offset(p.x, p.y)));
    expect((toPhone(stroke.points.first) - from).distance, lessThan(3));
    expect((toPhone(stroke.points.last) - (from + const Offset(72, 24))).distance, lessThan(3));
    // Taps land too: Undo takes the stroke away.
    await tapKey(tester, 'undo');
    expect(wb.elements.whereType<Stroke>(), isEmpty);
    await closeBoard(tester, board);
  });

  testWidgets('a panel, a tablet and the KINETIX Board are not scaled', (tester) async {
    final board = (await tester.runAsync(() => classroomBoard(seed: sampleCollege())))!;
    await pumpApp(tester, board, size: const Size(1280, 800));
    expect(find.byKey(const Key('ce-phone-fit')), findsNothing);
    await closeBoard(tester, board);

    Edition.classroom = false;
    await tester.pumpWidget(
      const MediaQuery(
        data: MediaQueryData(size: Size(844, 390)),
        child: CePhoneFit(enabled: false, child: SizedBox(key: Key('inside'))),
      ),
    );
    expect(find.byKey(const Key('ce-phone-fit')), findsNothing);
    expect(find.byKey(const Key('inside')), findsOneWidget);
  });
}
