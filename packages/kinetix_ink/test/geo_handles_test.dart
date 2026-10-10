import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

void main() {
  setUp(() => GeoCalibration.pxPerCm.value = 40);

  const view = ViewState();

  test('the body of every tool is locked: only the grip and turn dots take touches', () {
    for (final kind in [GeoKind.ruler, GeoKind.protractor, GeoKind.protractor360, GeoKind.setSquare45, GeoKind.setSquare3060]) {
      final t = GeoTool.create(kind, const Offset(500, 400));
      final painter = GeoToolPainter(t, view);
      final grip = t.toBoard(geoGripHandle(t)), turn = t.toBoard(geoRotateHandle(t));
      expect(geoPartAt(t, grip, 26), GeoPart.grip, reason: '${kind.name} grip');
      expect(geoPartAt(t, turn, 26), GeoPart.rotate, reason: '${kind.name} turn');
      expect(painter.hitTest(grip), isTrue);
      expect((grip - turn).distance, greaterThan(60), reason: '${kind.name} dots apart');
      // A point on the body that is not a dot lets the pen through.
      final onBody = t.toBoard(kind == GeoKind.ruler ? Offset.zero + Offset(0, GeoTool.rulerWidth / 2) : const Offset(40, -20));
      if (t.contains(onBody) && (onBody - grip).distance > 60 && (onBody - turn).distance > 60) {
        expect(painter.hitTest(onBody), isFalse, reason: '${kind.name} body passes touches');
      }
    }
  });

  testWidgets('dragging a ruler body does not move it; dragging its grip does', (tester) async {
    final b = WhiteboardController();
    addTearDown(b.dispose);
    final t = b.addGeoTool(GeoKind.ruler);
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: SizedBox(width: 1600, height: 1000, child: GeoToolsOverlay(controller: b)))));
    final start = b.geoTools.value.single.center;
    final body = t.toBoard(Offset(0, GeoTool.rulerWidth / 2));
    await tester.dragFrom(body, const Offset(120, 80));
    await tester.pump();
    expect(b.geoTools.value.single.center, start);
    final grip = t.toBoard(geoGripHandle(t));
    await tester.dragFrom(grip, const Offset(120, 80));
    await tester.pump();
    expect(b.geoTools.value.single.center.dx, closeTo(start.dx + 120, 8));
  });

  test('a pen stroke along a ruler edge is perfectly straight and leaves the tool in place', () {
    final b = WhiteboardController();
    addTearDown(b.dispose);
    final t = b.addGeoTool(GeoKind.setSquare45);
    final before = b.geoTools.value.single;
    final (a, c) = t.edges.first;
    final start = a + (c - a) * 0.2 + const Offset(0, 6), end = a + (c - a) * 0.8 + const Offset(0, -9);
    b.pointerDown(1, InkPoint(start.dx, start.dy));
    b.pointerMove(1, InkPoint((start.dx + end.dx) / 2, (start.dy + end.dy) / 2 + 5));
    b.pointerMove(1, InkPoint(end.dx, end.dy));
    b.pointerUp(1);
    final s = b.elements.whereType<Stroke>().single;
    expect(s.points.length, 2);
    final d = c - a;
    final cross = (s.points[1].offset - s.points[0].offset);
    expect((cross.dx * d.dy - cross.dy * d.dx).abs() / (cross.distance * d.distance), lessThan(1e-6));
    expect(b.geoTools.value.single.center, before.center);
  });

  test('the compass pencil sets the radius and swinging it draws an arc', () {
    var t = GeoTool.create(GeoKind.compass, const Offset(600, 400));
    expect(geoPartAt(t, t.pencil, 26), GeoPart.pencil);
    expect(geoPartAt(t, t.hinge, 26), GeoPart.grip);
    expect(geoPartAt(t, t.toBoard(geoRotateHandle(t)), 26), GeoPart.rotate);
    t = t.copyWith(size: 200);
    final arc = compassStroke(t.center, t.size, 0, math.pi / 2, color: Colors.black, width: 3);
    final first = arc.points.first.offset, last = arc.points.last.offset;
    expect((first - t.center).distance, closeTo(200, 0.5));
    expect((last - t.center).distance, closeTo(200, 0.5));
    expect((last - first).distance, closeTo(200 * math.sqrt2, 1));
  });
}
