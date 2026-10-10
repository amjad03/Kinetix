import 'dart:math' as math;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

const _deg = math.pi / 180;

void main() {
  setUp(() {
    GeoCalibration.pxPerCm.value = 40;
    GeoCalibration.inches.value = false;
  });

  group('geometry box maths', () {
    test('turns snap to 15° unless free', () {
      expect(snapAngle15(17 * _deg), closeTo(15 * _deg, 1e-9));
      expect(snapAngle15(23 * _deg), closeTo(30 * _deg, 1e-9));
      expect(snapAngle15(-44 * _deg), closeTo(-45 * _deg, 1e-9));
      expect(snapAngle15(23 * _deg, free: true), closeTo(23 * _deg, 1e-9));
      expect(degrees360(-90 * _deg), closeTo(270, 1e-9));
    });

    test('tool and board points convert both ways, turned and flipped', () {
      for (final flipped in [false, true]) {
        final t = GeoTool(id: 'r', kind: GeoKind.ruler, center: const Offset(300, 200), angle: 0.7, size: 400, flipped: flipped);
        const l = Offset(120, 35);
        final back = t.toLocal(t.toBoard(l));
        expect(back.dx, closeTo(l.dx, 1e-9));
        expect(back.dy, closeTo(l.dy, 1e-9));
      }
    });

    test('a pen near a ruler edge snaps straight along it', () {
      final t = GeoTool(id: 'r', kind: GeoKind.ruler, center: const Offset(500, 300), angle: 30 * _deg, size: 400);
      // A point 10 units off the zero edge, inside its length.
      final on = t.toBoard(const Offset(50, 0));
      final near = on + Offset(-math.sin(30 * _deg), math.cos(30 * _deg)) * -10;
      final edge = t.snapEdge(near, 28)!;
      final p = projectOnEdge(near, edge);
      expect((p - on).distance, lessThan(1e-6));
      final d = edge.$2 - edge.$1;
      expect(degrees360(math.atan2(d.dy, d.dx)) % 180, closeTo(30, 1e-6));
      // Far away: no snap.
      expect(t.snapEdge(on + const Offset(0, -200), 28), isNull);
      expect(snapToTools([t], near, 28), isNotNull);
    });

    test('set squares have the right corners', () {
      double cornerAngle(List<Offset> o, int i) {
        final a = o[(i + 2) % 3] - o[i], b = o[(i + 1) % 3] - o[i];
        return math.acos((a.dx * b.dx + a.dy * b.dy) / (a.distance * b.distance)) / _deg;
      }

      final s45 = GeoTool(id: 'a', kind: GeoKind.setSquare45, center: Offset.zero, size: 300).outline;
      expect([for (var i = 0; i < 3; i++) cornerAngle(s45, i).round()], [90, 45, 45]);
      final s30 = GeoTool(id: 'b', kind: GeoKind.setSquare3060, center: Offset.zero, size: 300).outline;
      expect([for (var i = 0; i < 3; i++) cornerAngle(s30, i).round()], [90, 30, 60]);
      expect(GeoTool(id: 'b', kind: GeoKind.setSquare3060, center: Offset.zero, size: 300).edges, hasLength(3));
    });

    test('the protractor arm reads the angle and stays on a half protractor', () {
      final p = GeoTool(id: 'p', kind: GeoKind.protractor, center: const Offset(100, 100), size: 200);
      expect(p.armTowards(const Offset(100, 0)) / _deg, closeTo(90, 1e-9)); // straight up
      expect(p.armTowards(const Offset(200, 0)) / _deg, closeTo(45, 1e-9));
      expect(p.armTowards(const Offset(0, 150)) / _deg, closeTo(180, 1e-9)); // below the base, left
      expect(p.armTowards(const Offset(200, 150)) / _deg, closeTo(0, 1e-9));
      final full = GeoTool(id: 'q', kind: GeoKind.protractor360, center: const Offset(100, 100), size: 200);
      expect(full.armTowards(const Offset(100, 200)) / _deg, closeTo(270, 1e-9));
    });

    test('compass arcs keep their radius; a full turn closes', () {
      final arc = compassArc(const Offset(10, 20), 80, 0, math.pi / 2);
      for (final p in arc) {
        expect((p - const Offset(10, 20)).distance, closeTo(80, 1e-9));
      }
      expect(arc.first.dx, closeTo(90, 1e-9));
      expect(arc.last.dy, closeTo(100, 1e-9));
      final circle = compassArc(Offset.zero, 50, 0.3, 2 * math.pi);
      expect((circle.first - circle.last).distance, lessThan(1e-9));
      final s = compassStroke(Offset.zero, 50, 0, 2 * math.pi, color: Colors.black, width: 3);
      expect(s.shape, ShapeKind.circle);
      expect(compassStroke(Offset.zero, 50, 0, 1, color: Colors.black, width: 3).shape, isNull);
    });

    test('readings use the calibration and units', () {
      GeoCalibration.pxPerCm.value = 50;
      expect(GeoCalibration.format(125), '2.5 cm');
      GeoCalibration.inches.value = true;
      expect(GeoCalibration.format(127), '1.0 in');
    });

    test('pen lines drawn near a set square run along its edge', () {
      final b = WhiteboardController()..tool = BoardTool.pen;
      addTearDown(b.dispose);
      b.geoTools.value = [const GeoTool(id: 's', kind: GeoKind.setSquare45, center: Offset(100, 300), size: 300)];
      b.pointerDown(1, const InkPoint(150, 306));
      b.pointerMove(1, const InkPoint(260, 330));
      expect(b.edgeLine.value, isNotNull);
      b.pointerUp(1);
      final s = b.elements.single as Stroke;
      expect(s.shape, ShapeKind.line);
      expect(s.points.first.y, closeTo(300, 1e-6));
      expect(s.points.last.y, closeTo(300, 1e-6));
      expect(s.points.last.x, closeTo(260, 1e-6));
      expect(b.edgeLine.value, isNull);
    });
  });

  group('flowcharts', () {
    FlowNodeElement start() => const FlowNodeElement(id: 'a', rect: Rect.fromLTWH(0, 0, 200, 90), shape: FlowBlock.process, color: Colors.black);
    var n = 0;
    String id() => 'n${n++}';

    test('add next puts a joined block in line beyond the side', () {
      final r = addNextFlow([start()], 'a', FlowSide.bottom, shape: FlowBlock.inputOutput, newId: id)!;
      final node = r.elements.whereType<FlowNodeElement>().firstWhere((e) => e.id == r.focus);
      expect(node.shape, FlowBlock.inputOutput);
      expect(node.rect.center.dx, closeTo(100, 1e-9)); // lined up
      expect(node.rect.top, closeTo(90 + flowGap, 1e-9));
      final link = r.elements.whereType<FlowLinkElement>().single;
      expect((link.from, link.to, link.fromSide, link.toSide), ('a', node.id, FlowSide.bottom, FlowSide.top));
      expect(link.points.first, const Offset(100, 90));
      expect(link.points.last, node.rect.topCenter);
      // A second block on the same side steps past the first.
      final r2 = addNextFlow(r.elements, 'a', FlowSide.bottom, shape: FlowBlock.process, newId: id)!;
      final second = r2.elements.whereType<FlowNodeElement>().firstWhere((e) => e.id == r2.focus);
      expect(second.rect.overlaps(node.rect), isFalse);
    });

    test('if/else adds a decision with Yes and No arms', () {
      final r = addNextFlow([start()], 'a', FlowSide.bottom, pattern: FlowPattern.ifElse, newId: id)!;
      final d = r.elements.whereType<FlowNodeElement>().firstWhere((e) => e.id == r.focus);
      expect(d.shape, FlowBlock.decision);
      final arms = r.elements.whereType<FlowLinkElement>().where((l) => l.from == d.id).toList();
      expect({for (final l in arms) l.label}, {'Yes', 'No'});
      expect(arms.firstWhere((l) => l.label == 'Yes').fromSide, FlowSide.bottom);
      expect(arms.firstWhere((l) => l.label == 'No').fromSide, FlowSide.left);
    });

    test('switch adds three labelled arms; loops add a way back', () {
      final sw = addNextFlow([start()], 'a', FlowSide.bottom, pattern: FlowPattern.switch3, newId: id)!;
      final arms = sw.elements.whereType<FlowLinkElement>().where((l) => l.from == sw.focus).toList();
      expect([for (final l in arms) l.label]..sort(), ['Case 1', 'Case 2', 'Case 3']);

      for (final p in [FlowPattern.whileLoop, FlowPattern.forLoop]) {
        final r = addNextFlow([start()], 'a', FlowSide.bottom, pattern: p, newId: id)!;
        final head = r.elements.whereType<FlowNodeElement>().firstWhere((e) => e.id == r.focus);
        expect(head.shape, p == FlowPattern.whileLoop ? FlowBlock.decision : FlowBlock.loopLimit);
        final back = r.elements.whereType<FlowLinkElement>().where((l) => l.to == head.id && l.from != 'a').single;
        expect(back.fromSide, back.toSide); // round the outside, into the same side
        // The way back goes outside both blocks.
        final body = r.elements.whereType<FlowNodeElement>().firstWhere((e) => e.id == back.from);
        final outer = back.points.map((q) => q.dx).reduce(math.max);
        expect(outer, greaterThan(math.max(head.rect.right, body.rect.right)));
      }
    });

    test('links follow their blocks and go with them', () {
      final b = WhiteboardController();
      addTearDown(b.dispose);
      b.setElements([start()]);
      final r = addNextFlow(b.elements, 'a', FlowSide.right, newId: id)!;
      b.setElements(r.elements);
      final moved = b.byId(r.focus)!.translated(const Offset(0, 300));
      b.replace(moved);
      final link = b.elements.whereType<FlowLinkElement>().single;
      expect(link.points.last, (moved as FlowNodeElement).rect.centerLeft);
      b.undo();
      expect(b.elements.whereType<FlowLinkElement>().single.points.last, (b.byId(r.focus)! as FlowNodeElement).rect.centerLeft);
      b.removeIds({r.focus});
      expect(b.elements.whereType<FlowLinkElement>(), isEmpty);
      b.undo();
      b.undo();
      expect(b.elements.whereType<FlowNodeElement>(), hasLength(1));
    });

    test('words written in a block go into it', () {
      final b = WhiteboardController();
      addTearDown(b.dispose);
      b.setElements([start()]);
      b.add(const TextElement(id: 't', position: Offset(60, 30), text: 'x = x + 1', color: Colors.black, fontSize: 20, size: Size(80, 24)));
      expect(b.elements.whereType<TextElement>(), isEmpty);
      expect((b.byId('a')! as FlowNodeElement).text, 'x = x + 1');
    });

    test('mind maps add topics on curved branches', () {
      final root = starterNode(mindMap: true, color: Colors.teal);
      final r = addNextFlow([root], root.id, FlowSide.right, newId: id)!;
      final child = r.elements.whereType<FlowNodeElement>().firstWhere((e) => e.id == r.focus);
      expect(child.shape, FlowBlock.topic);
      expect(r.elements.whereType<FlowLinkElement>().single.curved, isTrue);
    });

    test('flowcharts survive saving, and older readers skip them', () {
      final r = addNextFlow([start()], 'a', FlowSide.bottom, pattern: FlowPattern.ifElse, newId: id)!;
      final saved = SavedBoard(background: BoardBackground.plain, canvas: const Size(1200, 800), pages: [r.elements]);
      final back = SavedBoard.fromJson(saved.toJson()).pages.single;
      expect(
        back.whereType<FlowNodeElement>().map((e) => (e.id, e.shape, e.text, e.rect)),
        r.elements.whereType<FlowNodeElement>().map((e) => (e.id, e.shape, e.text, e.rect)),
      );
      final links = back.whereType<FlowLinkElement>().toList();
      expect(
        links.map((l) => (l.from, l.to, l.label, l.fromSide, l.toSide)),
        r.elements.whereType<FlowLinkElement>().map((l) => (l.from, l.to, l.label, l.fromSide, l.toSide)),
      );
      expect(links.first.points, isNotEmpty);
      expect(
        decodeElement({
          't': 'flow',
          'r': [0, 0, 10, 10],
          'k': 'hexagon',
        }, 'x'),
        isNull,
      ); // a newer shape
    });

    test('every block has a closed outline in its box', () {
      for (final s in FlowBlock.values) {
        final r = Rect.fromLTWH(10, 10, 200, 100);
        final b = flowShapePath(s, r).getBounds();
        expect(
          r.inflate(30).contains(b.topLeft) && r.inflate(30).contains(b.bottomRight) && (s == FlowBlock.comment || b.contains(r.center)),
          isTrue,
          reason: s.name,
        );
      }
    });
  });

  group('graph templates', () {
    double at(GraphElement g, double x, [int curve = -1]) => compileGraph(curve < 0 ? g.resolvedExpression : g.resolvedCurves[curve])!(x);

    test('every template plots', () {
      for (final t in graphTemplates) {
        final g = t.build(color: Colors.blue);
        expect(compileGraph(g.resolvedExpression), isNotNull, reason: t.id);
        for (final c in g.resolvedCurves) {
          expect(compileGraph(c), isNotNull, reason: '${t.id}: $c');
        }
        expect(g.xMax, greaterThan(g.xMin));
      }
      expect({for (final t in graphTemplates) t.subject}, GraphSubject.values.toSet());
    });

    GraphElement build(String id) => graphTemplates.firstWhere((t) => t.id == id).build(color: Colors.blue);

    test('templates are the right curves', () {
      expect(at(build('linear'), 1), 3);
      expect(at(build('quadratic'), 2), 0);
      expect(at(build('circle'), 0), 4);
      expect(at(build('circle'), 0, 0), -4);
      expect(at(build('normal'), 0), closeTo(1 / math.sqrt(2 * math.pi), 1e-9));
      expect(at(build('titration'), 25), closeTo(7, 1e-9));
      expect(at(build('ohm'), 10), closeTo(2, 1e-9));
      expect(at(build('boyle'), 10) * 10, closeTo(100, 1e-9));
      expect(at(build('lorenz'), 1), 1);
      expect(at(build('lorenz'), 0.5), lessThan(at(build('lorenz'), 0.5, 0)));
      expect(at(build('projectile'), 0), closeTo(0, 1e-9));
      // Range of a 45° projectile at 20 m/s: u²/g.
      expect(at(build('projectile'), 400 / 9.8), closeTo(0, 1e-6));
      expect(at(build('enzymeTemp'), 37), closeTo(100, 1e-9));
      // The marked equilibrium and break-even points lie on both curves.
      for (final id in ['demandSupply', 'breakEven']) {
        final g = build(id);
        final p = g.points.single;
        expect(at(g, p.x), closeTo(p.y, 1e-9), reason: id);
        expect(at(g, p.x, 0), closeTo(p.y, 1e-9), reason: id);
      }
      final ppf = build('ppf');
      expect(at(ppf, 6), closeTo(8, 1e-9));
    });

    test('letters are put in as numbers, not inside words', () {
      final g = build('normal').copyWith(params: {'m': 1, 's': 0.5});
      expect(g.resolvedExpression, 'exp(-((x - (1))^2)/(2*(0.5)^2))/((0.5)*sqrt(2*pi))');
    });

    test('the period topic picks the template', () {
      expect(preselectGraphTemplate(subject: 'Economics', topic: 'Market equilibrium')?.id, 'demandSupply');
      expect(preselectGraphTemplate(subject: 'Physics', topic: "Ohm's law and resistance")?.id, 'ohm');
      expect(preselectGraphTemplate(subject: 'Science', topic: 'Enzymes and temperature')?.id, 'enzymeTemp');
      expect(preselectGraphTemplate(subject: 'Mathematics', topic: 'Quadratic equations')?.id, 'quadratic');
      expect(preselectGraphTemplate(subject: 'Chemistry', topic: 'Acid-base titration')?.id, 'titration');
      expect(preselectGraphTemplate(subject: 'History', topic: 'Mughals'), isNull);
      expect(matchGraphTemplates(subject: 'Commerce').every((t) => t.subject == GraphSubject.economics), isTrue);
      expect(matchGraphTemplates(query: 'lorenz').single.id, 'lorenz');
    });

    test('graphs keep their letters, points and shading when saved; old readers still plot', () {
      final g = build('breakEven');
      final j = encodeElement(g);
      expect(compileGraph(j['e'] as String), isNotNull); // what an older reader plots
      expect(j['e'], '(10)*x');
      final back = decodeElement(j, g.id)! as GraphElement;
      expect(back.expression, g.expression);
      expect(back.curves, g.curves);
      expect(back.params, g.params);
      expect(back.points, g.points);
      expect(back.shade, g.shade);
      expect((back.xLabel, back.yLabel, back.title), (g.xLabel, g.yLabel, g.title));
      // A graph from an older board still opens.
      final old =
          decodeElement({
                't': 'graph',
                'r': [0, 0, 400, 300],
                'e': 'x^2',
                'v': [-5, 5, 0, 25],
                'c': 0xff0000ff,
              }, 'o')!
              as GraphElement;
      expect((old.expression, old.params.isEmpty, old.curves.isEmpty), ('x^2', true, true));
    });

    test('every language has every word', () {
      for (final lang in ['hi', 'kn']) {
        expect(ToolStrings.requiredKeys.where((k) => !ToolStrings.keys(lang).contains(k)), isEmpty, reason: lang);
      }
    });
  });

  group('widgets', () {
    late WhiteboardController board;

    Future<void> pump(WidgetTester tester) async {
      tester.view.physicalSize = const Size(1400, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      board = WhiteboardController();
      addTearDown(board.dispose);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: WhiteboardCanvas(controller: board)),
        ),
      );
    }

    testWidgets('a ruler drags, locks, flips and is put away; several tools at once', (tester) async {
      await pump(tester);
      final r = board.addGeoTool(GeoKind.ruler);
      await tester.pump();
      expect(find.byKey(Key('geo-close-${r.id}')), findsOneWidget);

      // The body is locked (a pen can write along its edge); only the grip dot moves the tool.
      final body = board.view.value.toScreen(r.toBoard(const Offset(-100, 60)));
      await tester.dragFrom(body, const Offset(0, 120));
      await tester.pump();
      expect(board.geoTools.value.first.center, r.center);
      final on = board.view.value.toScreen(r.toBoard(geoGripHandle(r)));
      await tester.dragFrom(on, const Offset(0, 120));
      await tester.pump();
      final moved = board.geoTools.value.first;
      expect(moved.center.dy, greaterThan(r.center.dy + 50));

      await tester.tap(find.byKey(Key('geo-lock-${r.id}')));
      await tester.pump();
      await tester.dragFrom(board.view.value.toScreen(moved.toBoard(geoGripHandle(moved))), const Offset(0, 120));
      await tester.pump();
      expect(board.geoTools.value.first.center, moved.center);

      await tester.tap(find.byKey(Key('geo-flip-${r.id}')));
      await tester.pump();
      expect(board.geoTools.value.first.flipped, isTrue);

      board.addGeoTool(GeoKind.protractor);
      final last = board.addGeoTool(GeoKind.compass);
      await tester.pump();
      expect(board.geoTools.value, hasLength(3));
      await tester.tap(find.byKey(Key('geo-close-${last.id}')));
      await tester.pump();
      expect(board.geoTools.value, hasLength(2));
    });

    testWidgets('the compass draws a circle', (tester) async {
      await pump(tester);
      final c = board.addGeoTool(GeoKind.compass);
      await tester.pump();
      await tester.tap(find.byKey(Key('geo-bigger-${c.id}')));
      await tester.pump();
      expect(board.geoTools.value.single.size, closeTo(c.size * 1.25, 1e-9));
      await tester.tap(find.byKey(Key('geo-circle-${c.id}')));
      await tester.pump();
      final s = board.elements.single as Stroke;
      expect(s.shape, ShapeKind.circle);
      expect((s.points.first.offset - c.center).distance, closeTo(c.size * 1.25, 1e-6));
    });

    testWidgets('a selected block shows ＋; the palette shows the shapes and adds the choice', (tester) async {
      await pump(tester);
      board.insert([starterNode(mindMap: false, color: Colors.black)]);
      await tester.pump();
      expect(find.byKey(const Key('flow-plus-bottom')), findsOneWidget);
      await tester.tap(find.byKey(const Key('flow-plus-bottom')));
      await tester.pumpAndSettle();
      for (final s in FlowBlock.values.where((s) => s != FlowBlock.topic)) {
        expect(find.byKey(Key('flow-shape-${s.name}')), findsOneWidget);
      }
      expect(find.byKey(const Key('flow-pattern-ifElse')), findsOneWidget);
      // The palette scrolls: the conditions sit below the blocks on a short dialog.
      await tester.ensureVisible(find.byKey(const Key('flow-pattern-ifElse')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('flow-pattern-ifElse')));
      await tester.pumpAndSettle();
      expect(board.elements.whereType<FlowNodeElement>(), hasLength(4));
      expect(board.elements.whereType<FlowLinkElement>(), hasLength(3));
      expect((board.selectedElements.single as FlowNodeElement).shape, FlowBlock.decision);
      board.undo();
      expect(board.elements.whereType<FlowNodeElement>(), hasLength(1));
      board.redo();
      expect(board.elements.whereType<FlowNodeElement>(), hasLength(4));
    });

    testWidgets('a double tap edits a block', (tester) async {
      await pump(tester);
      board.insert([starterNode(mindMap: false, color: Colors.black)]);
      board.tool = BoardTool.select;
      await tester.pump();
      final at = board.view.value.toScreen((board.elements.single as FlowNodeElement).rect.center);
      await tester.tapAt(at, kind: PointerDeviceKind.mouse);
      await tester.pump(const Duration(milliseconds: 100));
      await tester.tapAt(at, kind: PointerDeviceKind.mouse);
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('flow-text-field')), 'Read n');
      await tester.tap(find.byKey(const Key('flow-text-done')));
      await tester.pumpAndSettle();
      expect((board.elements.single as FlowNodeElement).text, 'Read n');
    });

    testWidgets('the graph editor changes a letter and applies', (tester) async {
      await pump(tester);
      final g = graphTemplates.first.build(color: Colors.blue);
      board.insert([g]);
      await tester.pump();
      editGraph(tester.element(find.byType(WhiteboardCanvas)), board, board.elements.single as GraphElement);
      await tester.pumpAndSettle();
      await tester.drag(find.byKey(const Key('graph-param-m')), const Offset(60, 0));
      await tester.pump();
      await tester.tap(find.byKey(const Key('graph-apply')));
      await tester.pumpAndSettle();
      expect((board.elements.single as GraphElement).params['m'], isNot(2));
    });
  });
}
