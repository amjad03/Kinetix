import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zynetix_ink/zynetix_ink.dart';

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
    expect(geoPartAt(t, t.toBoard(geoGripHandle(t)), 26), GeoPart.grip);
    expect(geoPartAt(t, t.toBoard(geoRotateHandle(t)), 26), GeoPart.rotate);
    t = t.copyWith(size: 200);
    final arc = compassStroke(t.center, t.size, 0, math.pi / 2, color: Colors.black, width: 3);
    final first = arc.points.first.offset, last = arc.points.last.offset;
    expect((first - t.center).distance, closeTo(200, 0.5));
    expect((last - t.center).distance, closeTo(200, 0.5));
    expect((last - first).distance, closeTo(200 * math.sqrt2, 1));
  });

  testWidgets('set-square edge dot: long-press shows its label, a tap still draws', (tester) async {
    final b = WhiteboardController();
    addTearDown(b.dispose);
    final t = b.addGeoTool(GeoKind.setSquare45);
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: SizedBox(width: 1600, height: 1000, child: GeoToolsOverlay(controller: b)))));
    final dot = t.toBoard(t.sideHandle(0));
    await tester.tapAt(dot);
    await tester.pump(const Duration(milliseconds: 400));
    expect(b.elements.whereType<Stroke>().length, 1, reason: 'a tap draws along the edge');
    await tester.pump(const Duration(seconds: 2));
    await tester.longPressAt(dot);
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text(ToolStrings('en').t('drawEdge')), findsOneWidget, reason: 'long-press shows the label');
    expect(b.elements.whereType<Stroke>().length, 1, reason: 'a long-press only labels');
  });

  test('calibrating keeps the tools on the board true size: a 20 cm ruler still reads 20 cm', () {
    final b = WhiteboardController();
    addTearDown(b.dispose);
    b.addGeoTool(GeoKind.ruler);
    final compass = b.addGeoTool(GeoKind.compass);
    b.updateGeoTool(compass.copyWith(size: 5 * 40));
    expect(GeoCalibration.format(b.geoTools.value.first.size), '20.0 cm');
    // The saved calibration arrives (or the teacher calibrates): 50 px to the cm.
    GeoCalibration.pxPerCm.value = 50;
    expect(b.geoTools.value.first.size, closeTo(1000, 1e-9));
    expect(GeoCalibration.format(b.geoTools.value.first.size), '20.0 cm');
    expect(GeoCalibration.format(b.geoTools.value.last.size), '5.0 cm', reason: 'the compass keeps its radius in cm');
  });

  Widget host(WhiteboardController b) => MaterialApp(home: Scaffold(body: SizedBox(width: 1600, height: 1000, child: GeoToolsOverlay(controller: b))));

  testWidgets('the turn dot turns a ruler in 15° steps about its middle', (tester) async {
    final b = WhiteboardController();
    addTearDown(b.dispose);
    final t = b.addGeoTool(GeoKind.ruler);
    await tester.pumpWidget(host(b));
    final dot = t.toBoard(geoRotateHandle(t));
    // Swing the dot a quarter turn round the ruler's middle.
    final a = math.atan2((dot - t.center).dy, (dot - t.center).dx) + math.pi / 2;
    final to = t.center + Offset(math.cos(a), math.sin(a)) * (dot - t.center).distance;
    await tester.dragFrom(dot, to - dot);
    await tester.pump();
    final turned = b.geoTools.value.single;
    expect(turned.angleDegrees.round() % 15, 0, reason: 'snapped to 15°');
    expect(turned.angleDegrees, closeTo(90, 0.001));
    expect(turned.center, t.center, reason: 'turning does not move it');
  });

  testWidgets('the protractor arm reads whole degrees where it is dragged, and Draw rules that ray', (tester) async {
    final b = WhiteboardController();
    addTearDown(b.dispose);
    final t = b.addGeoTool(GeoKind.protractor);
    await tester.pumpWidget(host(b));
    const want = 135 * math.pi / 180;
    final to = t.center + Offset(math.cos(want), -math.sin(want)) * t.size * 0.85;
    await tester.dragFrom(t.armTip, to - t.armTip);
    await tester.pump();
    final p = b.geoTools.value.single;
    expect(p.armDegrees, closeTo(135, 1e-9));
    await tester.tap(find.byKey(Key('geo-draw-${p.id}')));
    await tester.pump();
    final ray = b.elements.whereType<Stroke>().single;
    final d = ray.points.last.offset - ray.points.first.offset;
    expect(degrees360(math.atan2(-d.dy, d.dx)), closeTo(135, 1e-6));
  });

  testWidgets('compass: pull the pencil out for the radius, swing it for an arc, Circle for a full turn', (tester) async {
    final b = WhiteboardController();
    addTearDown(b.dispose);
    final t = b.addGeoTool(GeoKind.compass);
    await tester.pumpWidget(host(b));
    // Along the leg: the radius grows to where the finger is.
    await tester.dragFrom(t.pencil, const Offset(80, 0));
    await tester.pump();
    var c = b.geoTools.value.single;
    expect(c.size, closeTo(t.size + 80, 2));
    expect(b.elements, isEmpty, reason: 'setting the radius draws nothing');
    // Round the needle: an arc at that radius.
    final from = c.pencil;
    final to = c.center + Offset(math.cos(math.pi / 3), math.sin(math.pi / 3)) * c.size;
    await tester.dragFrom(from, to - from);
    await tester.pump();
    final arc = b.elements.whereType<Stroke>().single;
    expect(arc.shape, isNull, reason: 'an arc is pen ink');
    for (final p in arc.points) {
      expect((p.offset - c.center).distance, closeTo(c.size, 0.5));
    }
    c = b.geoTools.value.single;
    await tester.tap(find.byKey(Key('geo-circle-${c.id}')));
    await tester.pump();
    final circle = b.elements.whereType<Stroke>().last;
    expect(circle.shape, ShapeKind.circle);
    expect((circle.points.first.offset - circle.points.last.offset).distance, lessThan(1e-6), reason: 'a closed circle');
  });
}
