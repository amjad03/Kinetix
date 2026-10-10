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
}
