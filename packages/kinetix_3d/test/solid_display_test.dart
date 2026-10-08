import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_3d/kinetix_3d.dart';

void main() {
  test('Show lengths and Show angles (spec 20)', () {
    final cube = Solid(SolidKind.cube, null);
    expect(cube.toModel().labels.where((l) => l.text.endsWith('cm')), isNotEmpty);
    expect(cube.toModel(lengths: false).labels.where((l) => l.text.endsWith('cm')), isEmpty);
    expect(cube.toModel(angles: true).labels.map((l) => l.text), contains('90°'));
  });

  testWidgets('a tapped face takes the colour; the solid still turns', (tester) async {
    final ctrl = ModelViewController();
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: SizedBox(width: 1200, height: 800, child: SolidExplorer(kind: SolidKind.cube, controller: ctrl)))));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.byKey(const Key('face-colour-0')), 200, scrollable: find.byType(Scrollable).last);
    await tester.tap(find.byKey(const Key('face-colour-0')));
    await tester.pump();
    expect(ctrl.paintColor, isNotNull);
    final c = tester.getCenter(find.byKey(const ValueKey('kx3d-canvas')));
    for (final d in const [Offset.zero, Offset(-30, 30), Offset(30, 30), Offset(0, 60), Offset(-60, 0)]) {
      if (ctrl.faceColors.isNotEmpty) break;
      await tester.tapAt(c + d);
      await tester.pump(const Duration(milliseconds: 400));
    }
    expect(ctrl.faceColors, isNotEmpty);
    expect(ctrl.faceColors.length.isEven, isTrue, reason: 'a square face is two triangles');
    final yaw = ctrl.camera.yaw;
    ctrl.rotateBy(40, 0);
    expect(ctrl.camera.yaw, isNot(yaw));
    expect(ctrl.faceColors, isNotEmpty);
  });
}
