import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

void main() {
  setUp(() => GeoCalibration.pxPerCm.value = 40);

  group('stacked geometry tools', () {
    test('bring to front and send to back reorder the stack', () {
      final b = WhiteboardController();
      addTearDown(b.dispose);
      final a = b.addGeoTool(GeoKind.ruler), c = b.addGeoTool(GeoKind.compass), d = b.addGeoTool(GeoKind.protractor);
      expect(b.geoTools.value.map((t) => t.id), [a.id, c.id, d.id]);
      b.bringGeoToFront(a.id);
      expect(b.geoTools.value.last.id, a.id);
      b.sendGeoToBack(a.id);
      expect(b.geoTools.value.first.id, a.id);
      expect(b.geoTools.value.length, 3);
    });

    test('a set square cut-out is not opaque; its frame is', () {
      const t = GeoTool(id: 's', kind: GeoKind.setSquare45, center: Offset.zero, size: 300);
      final o = t.outline;
      final c = (o[0] + o[1] + o[2]) / 3;
      expect(t.contains(t.toBoard(c)), isTrue);
      expect(t.opaqueAt(t.toBoard(c)), isFalse);
      expect(t.opaqueAt(t.toBoard(const Offset(10, -6))), isTrue);
      expect(t.opaqueAt(const Offset(-200, 0)), isFalse);
    });

    test('a tool is shrunk to fit a phone view', () {
      final ruler = GeoTool.create(GeoKind.ruler, Offset.zero);
      expect(ruler.size, 20 * 40);
      expect(ruler.fitTo(const Size(360, 640)).size, lessThanOrEqualTo(360 * 0.8));
      expect(ruler.fitTo(const Size(3000, 2000)).size, ruler.size);
    });

    testWidgets('the stack chip lists tools and raises the one tapped', (tester) async {
      final b = WhiteboardController();
      addTearDown(b.dispose);
      final r = b.addGeoTool(GeoKind.ruler);
      b.addGeoTool(GeoKind.compass);
      await tester.pumpWidget(MaterialApp(home: Scaffold(body: GeoStackChip(controller: b))));
      await tester.tap(find.byKey(const Key('geo-stack-chip')));
      await tester.pump();
      await tester.tap(find.byKey(Key('geo-stack-item-${r.id}')));
      await tester.pump();
      expect(b.geoTools.value.last.id, r.id);
    });
  });

  group('calibration', () {
    test('screen diagonal gives the true pixels per cm', () {
      // A 1920x1080 panel 55 inches across: 2203 px / 139.7 cm.
      expect(pxPerCmForDiagonal(const Size(1920, 1080), 55), closeTo(15.77, 0.05));
      expect(pxPerCmForDiagonal(const Size(800, 600), 0), GeoCalibration.deviceDefault);
    });

    testWidgets('typing the diagonal sets the calibration', (tester) async {
      late BuildContext ctx;
      await tester.binding.setSurfaceSize(const Size(1000, 800));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (c) {
              ctx = c;
              return const SizedBox();
            },
          ),
        ),
      );
      unawaited(showGeoCalibrationDialog(ctx));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('geo-calibrate-diagonal')), '20');
      await tester.pump();
      await tester.tap(find.byKey(const Key('geo-calibrate-done')));
      await tester.pumpAndSettle();
      expect(GeoCalibration.pxPerCm.value, closeTo(pxPerCmForDiagonal(MediaQuery.sizeOf(ctx), 20), 0.01));
    });
  });

  group('colour one side or face', () {
    const square = PolygonElement(id: 'p', points: [Offset(0, 0), Offset(100, 0), Offset(100, 100), Offset(0, 100)], color: Colors.black, width: 3);

    test('a tap near a side colours only that side; inside colours the face', () {
      expect(polygonSideAt(square, const Offset(50, 3), 10), 0);
      expect(polygonSideAt(square, const Offset(97, 50), 10), 1);
      expect(polygonSideAt(square, const Offset(50, 50), 10), isNull);
      final side = paintAt(square, const Offset(50, 2), Colors.red, 10);
      expect(side.sideColors, {0: Colors.red});
      expect(side.fill, isNull);
      final face = paintAt(side, const Offset(50, 50), Colors.blue, 10);
      expect(face.fill, isNotNull);
      expect(face.sideColors, {0: Colors.red});
      expect(paintAt(square, const Offset(300, 300), Colors.red, 10), square);
    });

    test('recolouring the whole shape clears side colours', () {
      final s = withSideColor(square, 2, Colors.green);
      expect(s.recolored(Colors.red).sideColors, isEmpty);
      expect(withSideColor(s, 2, null).sideColors, isEmpty);
    });

    test('drawn shapes become polygons; lines do not', () {
      final tri = Stroke(
        id: 't',
        style: const InkStyle(tool: InkTool.shape, color: Colors.black, width: 3, shape: ShapeKind.triangle),
        points: const [InkPoint(0, 0), InkPoint(50, 0), InkPoint(25, 40), InkPoint(0, 0)],
        shape: ShapeKind.triangle,
      );
      expect(sidePaintable(tri)!.points, hasLength(3));
      final line = Stroke(
        id: 'l',
        style: const InkStyle(tool: InkTool.shape, color: Colors.black, width: 3, shape: ShapeKind.line),
        points: const [InkPoint(0, 0), InkPoint(50, 0)],
        shape: ShapeKind.line,
      );
      expect(sidePaintable(line), isNull);
    });

    test('side colours are saved and read back with the page', () {
      final s = withSideColor(withSideColor(square, 1, const Color(0xFF123456)), 3, Colors.orange);
      final back = decodeElement(encodeElement(s), 'p')! as PolygonElement;
      expect(back.sideColors.map((k, v) => MapEntry(k, v.toARGB32())), s.sideColors.map((k, v) => MapEntry(k, v.toARGB32())));
    });
  });
}
