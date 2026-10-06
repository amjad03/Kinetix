import 'dart:convert';
import 'dart:io';

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_3d/kinetix_3d.dart';
import 'package:kinetix_board/main.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/board_fonts.dart';
import 'support/fake_cloud.dart';
import 'support/layout.dart';

/// The split panel on a phone: a sheet over the lower half upright (drag up for the whole
/// screen, down to close), beside the board on its side; the board still writes.
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

  for (final size in [const Size(360, 640), const Size(390, 844), const Size(844, 390)]) {
    final portrait = size.height > size.width;
    testWidgets('${size.width.toInt()}×${size.height.toInt()}: the split panel is a sheet upright and beside the board on its side; the board still writes', (tester) async {
      screenSize(tester, size);
      final board = await enrolledBoard();
      board.onPaired('session-token', sessionIn('en'));
      await tester.pumpWidget(KinetixBoardApp(controller: board));
      await tester.pumpAndSettle();
      if (find.text('Not now').evaluate().isNotEmpty) {
        await tester.tap(find.text('Not now'));
        await tester.pumpAndSettle();
      }
      await tapBoard(tester, 'panel-tab-model3d');
      final panel = tester.getRect(find.byKey(const Key('split-panel')));
      final canvas = tester.getRect(find.byType(WhiteboardCanvas));
      if (portrait) {
        // Over the lower half; the board keeps the screen, its top half visible.
        expect(panel.top, closeTo(size.height / 2, 1));
        expect(panel.width, size.width);
        expect(canvas.size, size);
      } else {
        expect(canvas.right, lessThanOrEqualTo(panel.left), reason: 'the board is at the left');
        expect(canvas.height, size.height);
      }

      // The board still writes where it shows.
      final wb = tester.widget<WhiteboardCanvas>(find.byType(WhiteboardCanvas)).controller;
      final at = portrait ? Offset(size.width / 2, size.height / 4) : Offset(canvas.center.dx, size.height / 3);
      final g = await tester.startGesture(at, kind: PointerDeviceKind.touch);
      for (var i = 1; i <= 5; i++) {
        await g.moveTo(at + Offset(i * 10.0, i * 4.0));
      }
      await g.up();
      await tester.pump();
      expect(wb.elements, hasLength(1));

      if (portrait) {
        // Drag up: the whole screen; down: closed.
        await tester.drag(find.byKey(const Key('panel-grabber')), const Offset(0, -2000));
        await tester.pumpAndSettle();
        expect(tester.getRect(find.byKey(const Key('split-panel'))).top, 0);
        await tester.drag(find.byKey(const Key('panel-grabber')), Offset(0, size.height * 0.9));
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('split-panel')), findsNothing);
      } else {
        await tester.tap(find.byKey(const Key('panel-close')));
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('split-panel')), findsNothing);
        expect(tester.getRect(find.byType(WhiteboardCanvas)).size, size);
      }
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      board.dispose();
    });
  }
}
