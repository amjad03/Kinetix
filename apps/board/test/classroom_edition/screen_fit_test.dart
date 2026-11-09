import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/classroom_edition/edition.dart';
import 'package:kinetix_board/classroom_edition/local/classroom_store.dart';
import 'package:kinetix_board/classroom_edition/ui/screen_fit.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import '../support/board_fonts.dart';
import 'ce_support.dart';

/// A 4K panel that reports a pixel ratio of 1 shows the board laid out at 1920 across and scaled
/// up (P1 item 8); Screen size (Smaller / Normal / Larger) is saved on the board.
void main() {
  setUpAll(loadBoardFonts);
  tearDown(() => Edition.classroom = Edition.built == 'classroom');

  test('which screens are scaled', () {
    // 1080p at 1: as it is.
    expect(CeScreenFit.scaleFor(const Size(1920, 1080), 1), 1);
    // 4K at 1: laid out at 1920 across, twice the size.
    expect(CeScreenFit.scaleFor(const Size(3840, 2160), 1), 2);
    // 4K at 2 is already 1920 × 1080 logical: as it is.
    expect(CeScreenFit.scaleFor(const Size(1920, 1080), 2), 1);
    // 4K at 1.25 (3072 × 1728 logical): scaled to 1920 across.
    expect(CeScreenFit.scaleFor(const Size(3072, 1728), 1.25), closeTo(1.6, 1e-9));
    // A 1366 × 768 panel at 1 is not big: as it is.
    expect(CeScreenFit.scaleFor(const Size(1366, 768), 1), 1);
    // A phone is CePhoneFit's.
    expect(CeScreenFit.scaleFor(const Size(844, 390), 1, CeScreenSize.larger), 1);
    // Screen size on top.
    expect(CeScreenFit.scaleFor(const Size(1920, 1080), 1, CeScreenSize.larger), 1.2);
    expect(CeScreenFit.scaleFor(const Size(3840, 2160), 1, CeScreenSize.smaller), closeTo(1.7, 1e-9));
  });

  Future<void> drawAndCheck(WidgetTester tester, BoardController board, {required Size layout, required double scale}) async {
    await tapKey(tester, 'ce-start-class');
    await settle(tester, 10);
    final canvas = find.byType(WhiteboardCanvas).first;
    final box = tester.renderObject<RenderBox>(canvas);
    // Laid out at [layout] (less the side panel, when one is open) ...
    expect(tester.getSize(canvas).width, lessThanOrEqualTo(layout.width + 0.5));
    expect(tester.getSize(canvas).height, moreOrLessEquals(layout.height, epsilon: 0.5));
    // ... and drawn [scale] times bigger on the screen.
    expect(tester.getRect(canvas).height, moreOrLessEquals(layout.height * scale, epsilon: 0.5));
    // The Pen button is a real size on the screen: at least 48 physical px at 4K.
    expect(tester.getSize(find.byKey(const Key('tool-pen')).first).height * scale * tester.view.devicePixelRatio, greaterThanOrEqualTo(48));
    // Ink lands under the finger.
    final wb = tester.widget<WhiteboardCanvas>(canvas).controller;
    wb.tool = BoardTool.pen;
    final from = Offset(400 * scale, 300 * scale);
    final g = await tester.startGesture(from, kind: PointerDeviceKind.touch);
    for (var i = 0; i < 6; i++) {
      await g.moveBy(const Offset(14, 6));
    }
    await g.up();
    await settle(tester, 2);
    final stroke = wb.elements.whereType<Stroke>().single;
    Offset onScreen(InkPoint p) => box.localToGlobal(wb.view.value.toScreen(Offset(p.x, p.y)));
    expect((onScreen(stroke.points.first) - from).distance, lessThan(3));
    await tapKey(tester, 'undo');
    expect(wb.elements.whereType<Stroke>(), isEmpty);
  }

  Future<void> pumpAt(WidgetTester tester, BoardController board, Size physical, double dpr) async {
    tester.view
      ..physicalSize = physical
      ..devicePixelRatio = dpr;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(appFor(board));
    await settle(tester, 4);
  }

  testWidgets('1080p at a pixel ratio of 1: not scaled', (tester) async {
    final board = (await tester.runAsync(() => classroomBoard(seed: sampleCollege())))!;
    await pumpAt(tester, board, const Size(1920, 1080), 1);
    expect(find.byKey(const Key('ce-screen-fit')), findsNothing);
    await drawAndCheck(tester, board, layout: const Size(1920, 1080), scale: 1);
    await closeBoard(tester, board);
  });

  testWidgets('4K at a pixel ratio of 1: laid out at 1920 × 1080 and drawn twice the size', (tester) async {
    final board = (await tester.runAsync(() => classroomBoard(seed: sampleCollege())))!;
    await pumpAt(tester, board, const Size(3840, 2160), 1);
    expect(find.byKey(const Key('ce-screen-fit')), findsOneWidget);
    // The start screen's big button is twice as big on the screen as at 1080p.
    expect(tester.getSize(find.byKey(const Key('ce-start-class'))).height, moreOrLessEquals(96, epsilon: 0.5));
    expect(tester.getRect(find.byKey(const Key('ce-start-class'))).height, moreOrLessEquals(192, epsilon: 0.5));
    await drawAndCheck(tester, board, layout: const Size(1920, 1080), scale: 2);
    await closeBoard(tester, board);
  });

  testWidgets('4K at a pixel ratio of 2: already 1920 × 1080, not scaled again', (tester) async {
    final board = (await tester.runAsync(() => classroomBoard(seed: sampleCollege())))!;
    await pumpAt(tester, board, const Size(3840, 2160), 2);
    expect(find.byKey(const Key('ce-screen-fit')), findsNothing);
    await drawAndCheck(tester, board, layout: const Size(1920, 1080), scale: 1);
    await closeBoard(tester, board);
  });

  testWidgets('Settings → This board → Screen size: Larger is saved on the board and makes everything bigger', (tester) async {
    final board = (await tester.runAsync(() => classroomBoard(seed: sampleCollege())))!;
    await pumpAt(tester, board, const Size(1920, 1080), 1);
    await openCeSettings(tester);
    await tapKey(tester, 'ce-tab-board');
    await tapKey(tester, 'ce-screen-size-larger');
    expect(board.classroom.screenSize, CeScreenSize.larger);
    expect(find.byKey(const Key('ce-screen-fit')), findsOneWidget);
    expect(await board.classroom.deviceStore.setting(ClassroomStore.screenSizeKey), 'larger');
    // A fresh start reads it back.
    final again = ClassroomStore(store: board.classroom.deviceStore);
    await tester.runAsync(again.load);
    expect(again.screenSize, CeScreenSize.larger);
    await tapKey(tester, 'ce-screen-size-normal');
    expect(find.byKey(const Key('ce-screen-fit')), findsNothing);
    await closeBoard(tester, board);
  });
}
