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

/// The split screen on a phone: from the More sheet, the board above and the other half below
/// in portrait, side by side in landscape; the board still writes and the bar resizes.
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

  for (final size in [const Size(390, 844), const Size(844, 390)]) {
    final portrait = size.height > size.width;
    testWidgets('${portrait ? 'portrait' : 'landscape'}: the split screen opens from More and splits the phone', (tester) async {
      screenSize(tester, size);
      final board = await enrolledBoard();
      board.onPaired('session-token', sessionIn('en'));
      await tester.pumpWidget(KinetixBoardApp(controller: board));
      await tester.pumpAndSettle();
      if (find.text('Not now').evaluate().isNotEmpty) {
        await tester.tap(find.text('Not now'));
        await tester.pumpAndSettle();
      }
      await tester.tap(find.byKey(const Key('phone-more')));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const Key('more-split-screen')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('more-split-screen')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('phone-split')), findsOneWidget);
      final canvas = tester.getRect(find.byType(WhiteboardCanvas));
      final close = tester.getRect(find.byKey(const Key('panel-close')));
      if (portrait) {
        expect(canvas.bottom, lessThanOrEqualTo(close.top), reason: 'the board is above');
        expect(canvas.width, size.width);
      } else {
        expect(canvas.right, lessThanOrEqualTo(close.left), reason: 'the board is at the left');
        expect(canvas.height, size.height);
      }
      // The phone's bar stays on the board's half.
      expect(canvas.contains(tester.getCenter(find.byKey(const Key('tool-write')))), isTrue);

      // The board half still writes.
      final wb = tester.widget<WhiteboardCanvas>(find.byType(WhiteboardCanvas)).controller;
      final g = await tester.startGesture(canvas.center, kind: PointerDeviceKind.touch);
      for (var i = 1; i <= 5; i++) {
        await g.moveTo(canvas.center + Offset(i * 10.0, i * 4.0));
      }
      await g.up();
      await tester.pump();
      expect(wb.elements, hasLength(1));

      // The bar between the halves resizes them.
      final before = canvas;
      await tester.drag(find.byKey(const Key('phone-split-divider')), portrait ? const Offset(0, 120) : const Offset(120, 0));
      await tester.pumpAndSettle();
      final after = tester.getRect(find.byType(WhiteboardCanvas));
      expect(portrait ? after.height : after.width, greaterThan((portrait ? before.height : before.width) + 60));

      await tester.tap(find.byKey(const Key('panel-close')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('phone-split')), findsNothing);
      expect(tester.getRect(find.byType(WhiteboardCanvas)).size, size);
      await tester.pumpWidget(const SizedBox());
      board.dispose();
    });
  }
}
