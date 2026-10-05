import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

void main() {
  test('a board survives a save and load, including shapes and colours', () {
    final ink = InkController();
    ink.pointerDown(1, const InkPoint(10.04, 20.06));
    ink.pointerMove(1, const InkPoint(30, 40));
    ink.pointerUp(1);
    ink.style = const InkStyle(tool: InkTool.shape, color: Color(0xFFD93025), width: 6, shape: ShapeKind.triangle);
    ink.pointerDown(2, const InkPoint(100, 100));
    ink.pointerMove(2, const InkPoint(200, 180));
    ink.pointerUp(2);

    final saved = SavedBoard(background: BoardBackground.grid, canvas: const Size(1600, 900), pages: [ink.strokes, []]);
    final json = saved.toJson();
    expect(json['canvas'], {'w': 1600, 'h': 900});
    final pen = (json['pages'] as List)[0]['strokes'][0] as Map<String, dynamic>;
    expect(pen['p'], [10.0, 20.1, 30.0, 40.0]); // 0.1 px precision

    final back = SavedBoard.fromJson(json);
    expect(back.background, BoardBackground.grid);
    expect(back.canvas, const Size(1600, 900));
    expect(back.pageCount, 2);
    final triangle = back.pages[0][1] as Stroke;
    expect(triangle.shape, ShapeKind.triangle);
    expect(triangle.style.color, const Color(0xFFD93025));
    expect(triangle.vertices, hasLength(3));
  });

  test('unknown tools and shapes from a newer app are skipped, not fatal', () {
    final b = SavedBoard.fromJson({
      'background': 'hologram',
      'pages': [
        {
          'strokes': [
            {'t': 'laser', 'c': 0, 'w': 1, 'p': [0, 0, 1, 1]},
            {'t': 'shape', 's': 'dodecahedron', 'c': 0, 'w': 1, 'p': [0, 0, 1, 1]},
            {'t': 'pen', 'c': 4278190080, 'w': 3, 'p': [0, 0, 5, 5]},
          ],
        },
      ],
    });
    expect(b.background, BoardBackground.plain);
    expect(b.canvas, const Size(1920, 1080));
    expect(b.pages.single, hasLength(1));
  });

  testWidgets('the viewer scales a saved page into any box', (tester) async {
    final board = SavedBoard(background: BoardBackground.plain, canvas: const Size(1920, 1080), pages: [[]]);
    await tester.pumpWidget(MaterialApp(home: Center(child: SizedBox(width: 320, height: 400, child: WhiteboardView(board: board)))));
    final size = tester.getSize(find.byType(CustomPaint).last);
    expect(size, const Size(1920, 1080)); // painted at full size inside the FittedBox
    expect(tester.getSize(find.byType(FittedBox)).width, 320);
  });
}
