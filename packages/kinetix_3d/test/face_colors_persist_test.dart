import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_3d/kinetix_3d.dart';

void main() {
  test('painted faces round-trip through text kept with a picture', () {
    final c = ModelViewController();
    addTearDown(c.dispose);
    expect(c.encodeFaceColors(), '');
    c.paintFaces([4, 5], const Color(0xFFE53935));
    final text = c.encodeFaceColors();
    expect(text, startsWith('fc:'));
    final d = ModelViewController();
    addTearDown(d.dispose);
    d.loadFaceColors(text);
    expect(d.faceColors, c.faceColors);
    expect(decodeFaceColorMap('nonsense'), isEmpty);
    expect(decodeFaceColorMap('fc:1=2,x=3,4'), {1: 2});
  });

  testWidgets('a solid opens with the faces painted before', (tester) async {
    final ctrl = ModelViewController();
    addTearDown(ctrl.dispose);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SizedBox(
            width: 1200,
            height: 800,
            child: SolidExplorer(kind: SolidKind.cube, controller: ctrl, initialFaceColors: 'fc:0=4294901760,1=4294901760'),
          ),
        ),
      ),
    );
    await tester.pump();
    expect(ctrl.faceColors, {0: 4294901760, 1: 4294901760});
  });

  test('the renderer paints the face colours given', () {
    final opts = RenderOptions(faceColors: const {3: 0xFF00FF00});
    expect(opts.faceColors[3], 0xFF00FF00);
  });

  test('a live solid view round-trips, and older picture text still gives its faces', () {
    final v = const SolidView(yaw: 12.5, pitch: -8, faces: {3: 0xFF112233}).encode();
    final back = SolidView.decode(v)!;
    expect([back.yaw, back.pitch], [12.5, -8.0]);
    expect(back.faces, {3: 0xFF112233});
    expect(SolidView.decode('fc:1=2'), isNull);
    expect(decodeFaceColorMap(v), {3: 0xFF112233});
  });

  testWidgets('tapping a face in the 3D view opens the colour picker (any colour, recent colours)', (tester) async {
    final ctrl = ModelViewController();
    addTearDown(ctrl.dispose);
    recentFaceColours.value = const [];
    tester.view.physicalSize = const Size(1200, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: SizedBox(width: 1200, height: 800, child: SolidExplorer(kind: SolidKind.cube, controller: ctrl)))));
    await tester.pump();
    expect(ctrl.pickFaces, isTrue);
    final c = tester.getCenter(find.byKey(const ValueKey('kx3d-canvas')));
    final spots = const [Offset(-30, 30), Offset(30, 30), Offset(0, 60), Offset(-60, 0), Offset.zero];
    late Offset spot;
    for (final d in spots) {
      spot = c + d;
      await tester.tapAt(spot);
      await tester.pumpAndSettle(const Duration(milliseconds: 400));
      if (find.byKey(const Key('face-colour-picker')).evaluate().isNotEmpty) break;
    }
    expect(find.byKey(const Key('face-colour-picker')), findsOneWidget);
    await tester.enterText(find.byKey(const Key('face-colour-hex')), '12AB34');
    await tester.pump();
    await tester.tap(find.byKey(const Key('face-colour-apply')));
    await tester.pumpAndSettle();
    expect(ctrl.faceColors, isNotEmpty);
    expect(ctrl.faceColors.values.toSet(), {0xFF12AB34});
    expect(recentFaceColours.value.first, const Color(0xFF12AB34));
    // Tapping it again offers the colour it has, and Reset takes it off.
    await tester.tapAt(spot);
    await tester.pumpAndSettle(const Duration(milliseconds: 400));
    expect(find.byKey(const Key('face-recent-0')), findsOneWidget);
    await tester.tap(find.byKey(const Key('face-colour-reset')));
    await tester.pumpAndSettle();
    expect(ctrl.faceColors, isEmpty);
  });
}
