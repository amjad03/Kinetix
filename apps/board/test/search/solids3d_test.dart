import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_3d/kinetix_3d.dart';
import 'package:kinetix_board/features/search/solids3d.dart';

import '../support/fake_cloud.dart';

/// The Shapes popover's 3D solids: drawn by kinetix_3d's Dart renderer, turned with a finger,
/// put on the board as a picture.
void main() {
  Future<int> inkedPixels(Uint8List png) async {
    final codec = await ui.instantiateImageCodec(png);
    final image = (await codec.getNextFrame()).image;
    final rgba = (await image.toByteData(format: ui.ImageByteFormat.rawRgba))!;
    var n = 0;
    for (var i = 3; i < rgba.lengthInBytes; i += 4) {
      if (rgba.getUint8(i) > 0) n++;
    }
    image.dispose();
    return n;
  }

  testWidgets('every solid renders to a picture, differently from each angle', (tester) async {
    await tester.runAsync(() async {
      expect(boardSolids.toSet(), containsAll([SolidKind.cube, SolidKind.cuboid, SolidKind.cylinder, SolidKind.cone, SolidKind.sphere, SolidKind.triangularPrism, SolidKind.squarePyramid, SolidKind.hemisphere]));
      for (final k in boardSolids) {
        final png = await renderSolidPng(k, size: const Size(320, 260));
        expect(png.sublist(1, 4), 'PNG'.codeUnits, reason: k.name);
        final inked = await inkedPixels(png);
        expect(inked, greaterThan(320 * 260 ~/ 20), reason: '${k.name} draws something');
        expect(inked, lessThan(320 * 260), reason: '${k.name} leaves the background clear');
      }
      final front = await renderSolidPng(SolidKind.cuboid, yaw: 0, pitch: 0, labels: false, size: const Size(200, 200));
      final turned = await renderSolidPng(SolidKind.cuboid, yaw: 60, pitch: 30, labels: false, size: const Size(200, 200));
      expect(front, isNot(equals(turned)));
    });
  });

  for (final (name, size) in [('phone', const Size(360, 640)), ('phone landscape', const Size(844, 390)), ('panel', const Size(1920, 1080))]) {
    for (final lang in ['en', 'hi', 'kn']) {
      testWidgets('$name, $lang: pick a solid, turn it, put it on the board', (tester) async {
        screenSize(tester, size);
        Model3dSnapshot? put;
        String? viewer;
        await tester.pumpWidget(
          localized(
            lang,
            Scaffold(
              body: Model3dScope(
                onSnapshot: (s) => put = s,
                child: Builder(
                  builder: (context) => SingleChildScrollView(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Solids3dGrid(onOpen: (k) => Solid3dDialog.open(context, k, onOpenViewer: (id) => viewer = id)),
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        for (final k in boardSolids) {
          expect(find.byKey(Key('solid-${k.name}')), findsOneWidget);
        }
        await tester.tap(find.byKey(const Key('solid-cone')));
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('solid-dialog')), findsOneWidget);
        expect(find.byType(SolidExplorer), findsOneWidget);
        expect(tester.takeException(), isNull, reason: 'the dialog fits');

        // A drag turns it.
        final ctrl = tester.widget<ModelViewer>(find.byType(ModelViewer)).controller!;
        final yaw = ctrl.camera.yaw;
        await tester.drag(find.byType(ModelViewer), const Offset(80, 0));
        await tester.pumpAndSettle();
        expect(ctrl.camera.yaw, isNot(yaw));

        await tester.runAsync(() async {
          await tester.tap(find.byKey(const Key('solid-put')));
          for (var i = 0; i < 20 && put == null; i++) {
            await Future<void>.delayed(const Duration(milliseconds: 50));
            await tester.pump();
          }
        });
        await tester.pumpAndSettle();
        expect(put?.modelId, 'solid.cone');
        expect(put!.png.length, greaterThan(1000));
        expect(find.byKey(const Key('solid-dialog')), findsNothing);

        await tester.tap(find.byKey(const Key('solid-cube')));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const Key('solid-viewer')));
        await tester.pumpAndSettle();
        expect(viewer, 'solid.cube');
        expect(tester.takeException(), isNull);
      });
    }
  }
}
