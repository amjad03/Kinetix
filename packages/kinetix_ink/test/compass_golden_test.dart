import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ink/src/tools/compass_painter.dart';

class _P extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = Colors.white);
    paintCompass(canvas, needle: const Offset(110, 830), pencil: const Offset(290, 830), hinge: const Offset(200, 190), k: 1);
  }

  @override
  bool shouldRepaint(_P old) => false;
}

void main() {
  testWidgets('compass golden', (tester) async {
    tester.view.physicalSize = const Size(400, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      RepaintBoundary(
        key: const Key('c'),
        child: CustomPaint(painter: _P(), size: const Size(400, 900)),
      ),
    );
    await expectLater(find.byKey(const Key('c')), matchesGoldenFile('goldens/compass.png'));
  });
}
