import 'dart:convert';
import 'dart:io';

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_3d/kinetix_3d.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/main.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/board_fonts.dart';
import 'support/fake_cloud.dart';

/// Moving the board and what is on it, with the touches a real screen sends: Android reports a
/// finger's size (its tool major, in pixels), so a broad thumb looks big. Phones and panels, the
/// rails and the bottom toolbar, the Simple board too, with every touch profile.
void main() {
  setUpAll(loadBoardFonts);
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    Viewer3dEngine.debugOverride = FakeViewerEngine.new;
    ViewerManifest.debugLoad = (id) async =>
        ViewerManifest.fromJson(jsonDecode(File('../../packages/kinetix_3d/assets/viewer3d/models/$id.json').readAsStringSync()) as Map<String, dynamic>);
  });
  tearDown(() {
    Viewer3dEngine.debugOverride = null;
    ViewerManifest.debugLoad = null;
  });

  var clock = const Duration(seconds: 1);
  var nextPointer = 100;

  /// One finger of [radius] logical pixels (the size the screen reports for it).
  Future<TestPointer> down(WidgetTester tester, Offset at, {double radius = 30}) async {
    final p = TestPointer(nextPointer++, PointerDeviceKind.touch);
    clock += const Duration(milliseconds: 16);
    await tester.sendEventToBinding(p.down(at, timeStamp: clock).copyWith(radiusMajor: radius, radiusMinor: radius));
    return p;
  }

  Future<void> moveAll(WidgetTester tester, List<TestPointer> ps, List<Offset> by, {int steps = 8}) async {
    final start = [for (final p in ps) p.location!];
    for (var i = 1; i <= steps; i++) {
      clock += const Duration(milliseconds: 40);
      for (var k = 0; k < ps.length; k++) {
        await tester.sendEventToBinding(ps[k].move(start[k] + by[k] * (i / steps), timeStamp: clock));
      }
    }
  }

  Future<void> upAll(WidgetTester tester, List<TestPointer> ps) async {
    for (final p in ps) {
      clock += const Duration(milliseconds: 16);
      await tester.sendEventToBinding(p.up(timeStamp: clock));
    }
    await tester.pump();
  }

  Future<void> tap(WidgetTester tester, String key) async {
    final f = find.byKey(Key(key));
    if (f.evaluate().isEmpty) {
      await tester.tap(find.byKey(const Key('phone-more')));
      await tester.pumpAndSettle();
    }
    await tester.ensureVisible(f);
    await tester.pumpAndSettle();
    await tester.tap(f);
    await tester.pumpAndSettle();
  }

  Future<void> closePopovers(WidgetTester tester) async {
    final barrier = find.byKey(const Key('popover-barrier'));
    if (barrier.evaluate().isNotEmpty) {
      final r = tester.getRect(barrier);
      await tester.tapAt(Offset(r.center.dx, r.top + 40));
      await tester.pumpAndSettle();
    }
  }

  const setups = [
    ('phone', Size(390, 844), ToolbarDock.bottom, false),
    ('phone landscape', Size(844, 390), ToolbarDock.bottom, false),
    ('phone simple', Size(390, 844), ToolbarDock.bottom, true),
    ('panel rails', Size(1920, 1080), ToolbarDock.bottom, false),
    ('panel bottom toolbar', Size(1920, 1080), ToolbarDock.left, false),
    ('panel simple', Size(1920, 1080), ToolbarDock.left, true),
  ];
  for (final (name, size, layout, simple) in setups) {
    for (final profile in TouchProfile.values) {
      testWidgets('$name, ${profile.name}: the Move tool, two fingers and Select move the board and what is on it', (tester) async {
        screenSize(tester, size);
        final board = await enrolledBoard();
        board.setToolbarDock(layout);
        board.setSimpleBoard(simple ? SimpleBoard.on : SimpleBoard.off);
        board.setTouchProfile(profile);
        board.onPaired('session-token', sessionIn('en'));
        await tester.pumpWidget(KinetixBoardApp(controller: board));
        await tester.pumpAndSettle();
        if (find.text('Not now').evaluate().isNotEmpty) {
          await tester.tap(find.text('Not now'));
          await tester.pumpAndSettle();
        }
        final wb = tester.widget<WhiteboardCanvas>(find.byType(WhiteboardCanvas)).controller;
        final mid = Offset(size.width / 2, size.height / 2);

        // The Move tool: one broad finger drags the board (the Simple board has none: two fingers move it).
        var before = wb.view.value;
        if (!simple) {
          await tap(tester, 'tool-tools');
          await tap(tester, 'drawer-move');
          expect(wb.tool, BoardTool.hand);
          final f = await down(tester, mid);
          await moveAll(tester, [f], [const Offset(-90, -60)]);
          await upAll(tester, [f]);
          expect(wb.view.value.offset - before.offset, within(distance: 1, from: const Offset(-90, -60)), reason: 'Move tool pans');
        }

        // The pen: two fingers pinch and pan, and draw nothing.
        await tap(tester, 'tool-pen');
        await closePopovers(tester);
        expect(wb.tool, BoardTool.pen);
        before = wb.view.value;
        final a = await down(tester, mid - const Offset(40, 0));
        final b = await down(tester, mid + const Offset(40, 0), radius: 34);
        await moveAll(tester, [a, b], [const Offset(-60, 30), const Offset(60, 30)]);
        await upAll(tester, [a, b]);
        expect(wb.elements, isEmpty, reason: 'a pinch draws nothing');
        expect(wb.view.value.scale / before.scale, closeTo(2.5, 0.05), reason: 'two fingers zoom');

        // One finger still writes.
        final w = await down(tester, mid + const Offset(0, 40), radius: 12);
        await moveAll(tester, [w], [const Offset(80, 20)]);
        await upAll(tester, [w]);
        expect(wb.elements, hasLength(1), reason: 'one finger writes');

        // Select: a broad finger drags what is selected.
        await tap(tester, 'tool-select');
        expect(wb.tool, BoardTool.select);
        wb.select({wb.elements.single.id});
        await tester.pump();
        final at = wb.elements.single.bounds.center;
        final s = await down(tester, wb.view.value.toScreen(at));
        await moveAll(tester, [s], [const Offset(50, 70)]);
        await upAll(tester, [s]);
        final moved = (wb.elements.single.bounds.center - at) * wb.view.value.scale;
        expect(moved, within(distance: 2, from: const Offset(50, 70)), reason: 'Select drags');

        await tester.pumpWidget(const SizedBox());
        board.dispose();
      });
    }
  }
}
