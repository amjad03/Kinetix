import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

Widget _host(WhiteboardController c) => MaterialApp(
  home: Scaffold(
    body: SizedBox(width: 1000, height: 800, child: GeoToolsOverlay(controller: c)),
  ),
);

void main() {
  setUp(() => GeoCalibration.pxPerCm.value = 40);

  test('protractor arm is a straight edge from the centre to the scale edge', () {
    final t = GeoTool.create(GeoKind.protractor, const Offset(500, 400)).copyWith(arm: 50 * math.pi / 180);
    final (a, b) = t.armRay;
    expect(a, t.center);
    expect((b - a).distance, closeTo(t.size, 1e-6));
    expect(t.armDegrees.round(), 50);
    // A pen near the middle of the arm snaps onto it.
    final mid = (a + b) / 2 + const Offset(3, 3);
    expect(t.snapEdge(mid, 28), t.armRay);
  });

  test('set squares have three drawable sides and snap to the nearest', () {
    for (final k in [GeoKind.setSquare45, GeoKind.setSquare3060]) {
      final t = GeoTool.create(k, const Offset(300, 500));
      expect(t.sides.length, 3);
      for (final e in t.sides) {
        final mid = (e.$1 + e.$2) / 2;
        final snapped = t.snapEdge(mid + const Offset(1, 1), 12)!;
        expect((snapped.$1 - e.$1).distance, lessThan(1e-6), reason: k.name);
      }
      for (var i = 0; i < 3; i++) {
        expect(geoSideAt(t, t.toBoard(t.sideHandle(i)), 26), i);
      }
    }
  });

  testWidgets('protractor Draw adds a ray at the arm angle; a set-square side dot draws that side', (tester) async {
    final c = WhiteboardController();
    addTearDown(c.dispose);
    final p = c.addGeoTool(GeoKind.protractor);
    c.updateGeoTool(p.copyWith(arm: 30 * math.pi / 180));
    await tester.pumpWidget(_host(c));
    await tester.tap(find.byKey(Key('geo-draw-${p.id}')));
    await tester.pump();
    var s = c.page.elements.whereType<Stroke>().last;
    expect(s.points.length, 2);
    final tool = c.geoTools.value.first;
    expect(Offset(s.points[0].x, s.points[0].y), tool.center);
    expect((Offset(s.points[1].x, s.points[1].y) - tool.armTip).distance, lessThan(1e-6));

    c.removeGeoTool(p.id);
    final q = c.addGeoTool(GeoKind.setSquare3060);
    await tester.pumpWidget(_host(c));
    final before = c.page.elements.length;
    await tester.tapAt(c.view.value.toScreen(q.toBoard(q.sideHandle(1))));
    await tester.pump();
    expect(c.page.elements.length, before + 1);
    s = c.page.elements.whereType<Stroke>().last;
    final e = q.sides[1];
    expect((Offset(s.points[0].x, s.points[0].y) - e.$1).distance, lessThan(1e-6));
    expect((Offset(s.points[1].x, s.points[1].y) - e.$2).distance, lessThan(1e-6));
  });

  testWidgets('compass painter renders at phone, tablet and panel sizes without error', (tester) async {
    for (final r in [2.0, 6.0, 20.0]) {
      final t = GeoTool.create(GeoKind.compass, const Offset(500, 500)).copyWith(size: r * 40);
      await tester.pumpWidget(
        MaterialApp(
          home: SizedBox(
            width: 1000,
            height: 1000,
            child: CustomPaint(painter: GeoToolPainter(t, const ViewState()), size: const Size(1000, 1000)),
          ),
        ),
      );
      expect(tester.takeException(), isNull);
    }
  });

  test('new labels exist in en, hi and kn', () {
    for (final l in ['en', 'hi', 'kn']) {
      final s = ToolStrings(l);
      expect(s.t('drawArm'), isNot('drawArm'));
      expect(s.t('drawEdge'), isNot('drawEdge'));
    }
    expect(ToolStrings('hi').t('drawArm'), isNot(ToolStrings('en').t('drawArm')));
    expect(ToolStrings('kn').t('drawEdge'), isNot(ToolStrings('en').t('drawEdge')));
  });
}
