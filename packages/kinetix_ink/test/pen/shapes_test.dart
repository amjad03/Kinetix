import 'dart:math' as math;
import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import 'pen_helpers.dart';

void main() {
  group('shape fitting', () {
    test('a rough triangle becomes a triangle with a level base', () {
      final f = fitClosed([
        sketch(const [Offset(200, 40), Offset(340, 260), Offset(60, 260)]),
      ])!;
      expect(f.kind, FitKind.triangle);
      final ys = f.outline.map((c) => c.dy.round()).toList()..sort();
      expect(ys[1], ys[2]);
    });

    test('a rough rectangle becomes an exact, level rectangle', () {
      final f = fitClosed([
        sketch(const [Offset(50, 50), Offset(300, 52), Offset(302, 200), Offset(48, 198)]),
      ])!;
      expect(f.kind, FitKind.rectangle);
      expect(f.outline.map((c) => c.dx.round()).toSet().length, 2);
      expect(f.outline.map((c) => c.dy.round()).toSet().length, 2);
    });

    test('a rough square is a square, a rough circle a circle, an egg an ellipse', () {
      expect(
        fitClosed([
          sketch(const [Offset(0, 0), Offset(200, 4), Offset(198, 202), Offset(2, 198)]),
        ])!.kind,
        FitKind.square,
      );
      final c = fitClosed([roughCircle(const Offset(200, 200), 100)])!;
      expect(c.kind, FitKind.circle);
      expect(c.oval!.width, closeTo(200, 20));
      final egg = [for (var a = 0.0; a < 2 * math.pi * 0.95; a += 0.1) Offset(200 + 160 * math.cos(a), 200 + 80 * math.sin(a))];
      expect(fitClosed([egg])!.kind, FitKind.ellipse);
    });

    test('a hexagon drawn by hand becomes a regular hexagon', () {
      final corners = [for (var i = 0; i < 6; i++) Offset(300 + 150 * math.cos(math.pi / 3 * i), 300 + 150 * math.sin(math.pi / 3 * i))];
      final f = fitClosed([sketch(corners, wobble: 4)])!;
      expect(f.outline.length, 6);
    });

    test('a wobbly straight stroke is a line; letters are no closed shape', () {
      final l = fitLine([
        sketch(const [Offset(0, 0), Offset(300, 90)], close: false, wobble: 5),
      ])!;
      expect(l.kind, FitKind.line);
      // The direction it was drawn in is kept (an arrow's head is where the pen stopped).
      expect(l.outline.first.dx, lessThan(l.outline.last.dx));
      // An A: two legs and a crossbar, with no base.
      final a = [
        line(const Offset(0, 200), const Offset(100, 0)),
        line(const Offset(100, 0), const Offset(200, 200)),
        line(const Offset(50, 100), const Offset(150, 100)),
      ];
      expect(fitClosed(a), isNull);
      // A C: a circle with an open side.
      final c = [for (var t = 0.6; t < 2 * math.pi - 0.6; t += 0.1) Offset(100 + 80 * math.cos(t), 100 + 80 * math.sin(t))];
      expect(fitClosed([c]), isNull);
    });

    test('a triangle drawn as three separate lines is one triangle', () {
      final strokes = [
        ink(sketch(const [Offset(100, 20), Offset(200, 200)], close: false, wobble: 3)),
        ink(sketch(const [Offset(204, 198), Offset(0, 200)], close: false, wobble: 3)),
        ink(sketch(const [Offset(3, 197), Offset(98, 24)], close: false, wobble: 3)),
      ];
      final r = parseInk(strokes, const InkContext());
      expect(r.shapes.single.fit.kind, FitKind.triangle);
      expect(r.shapes.single.strokes.length, 3);
    });

    test('arrows: one stroke, and a shaft with a separate head', () {
      final one = ink([
        ...sketch(const [Offset(0, 100), Offset(300, 100)], close: false, wobble: 3),
        ...sketch(const [Offset(300, 100), Offset(260, 70)], close: false, wobble: 2),
        ...sketch(const [Offset(260, 70), Offset(300, 100), Offset(262, 132)], close: false, wobble: 2),
      ]);
      expect(shapeOfGroup([one])!.$2, isNotNull);
      final r = parseInk([
        ink(sketch(const [Offset(0, 300), Offset(300, 300)], close: false, wobble: 3)),
        ink(sketch(const [Offset(262, 270), Offset(302, 300), Offset(262, 332)], close: false, wobble: 2)),
      ], const InkContext());
      final el = shapeElement(r.shapes.single, const Color(0xFF000000), 4) as Stroke;
      expect(el.shape, ShapeKind.arrow);
      expect(el.points.last.x, greaterThan(el.points.first.x)); // the head is on the right
    });

    test('fitted shapes become shape strokes (named) or figures', () {
      Stroke shape(List<Offset> pts) => shapeElement(InkShape([ink(pts)], fitClosed([pts])!), const Color(0xFF000000), 4) as Stroke;
      expect(shape(sketch(const [Offset(200, 40), Offset(340, 260), Offset(60, 260)])).shape, ShapeKind.triangle);
      expect(shape(sketch(const [Offset(0, 0), Offset(0, 200), Offset(260, 200)])).shape, ShapeKind.rightTriangle);
      expect(shape(sketch(const [Offset(50, 50), Offset(300, 52), Offset(302, 200), Offset(48, 198)])).shape, ShapeKind.rectangle);
      expect(shape(roughCircle(const Offset(200, 200), 100)).shape, ShapeKind.circle);
      expect(quadKind(const [Offset(50, 0), Offset(250, 0), Offset(200, 100), Offset(0, 100)]), ShapeKind.parallelogram);
      expect(quadKind(const [Offset(50, 0), Offset(150, 0), Offset(200, 100), Offset(0, 100)]), ShapeKind.trapezium);
      expect(quadKind(const [Offset(100, 0), Offset(200, 100), Offset(100, 200), Offset(0, 100)]), ShapeKind.rhombus);
      expect(quadKind(const [Offset(0, 0), Offset(200, 20), Offset(170, 150), Offset(10, 90)]), isNull);
    });
  });

  group('shape or writing', () {
    test('a big circle is a shape; a letter-sized O in a line of writing is writing', () {
      final big = ink(roughCircle(const Offset(300, 300), 120));
      expect(parseInk([big], const InkContext()).shapes, hasLength(1));
      // "Go" written at 40 px: the o is a clean circle, but it sits in a word.
      final g = ink([
        for (var a = 0.3; a < 2 * math.pi; a += 0.2) Offset(20 + 18 * math.cos(a), 20 + 20 * math.sin(a)),
        const Offset(38, 40),
        const Offset(36, 60),
        const Offset(16, 62),
      ]);
      final o = ink(roughCircle(const Offset(66, 26), 16, wobble: 2));
      final r = parseInk([g, o], const InkContext(letterPx: 40));
      expect(r.shapes, isEmpty);
      expect(r.writing, hasLength(2));
    });

    test('the learnt letter size decides: a circle twice letter height is a shape', () {
      final c = ink(roughCircle(const Offset(100, 100), 45, wobble: 2));
      expect(parseInk([c], const InkContext(letterPx: 40)).shapes, hasLength(1));
      expect(parseInk([c], const InkContext(letterPx: 120)).shapes, isEmpty);
    });

    test('a fraction bar under a number is writing, not a line', () {
      final num = ink(line(const Offset(60, 0), const Offset(60, 40)));
      final bar = ink(sketch(const [Offset(0, 60), Offset(160, 60)], close: false, wobble: 1));
      final den = ink([const Offset(50, 80), const Offset(70, 80), const Offset(50, 120), const Offset(72, 120)]);
      final r = parseInk([num, bar, den], const InkContext(letterPx: 40));
      expect(r.shapes, isEmpty);
    });

    test('a big sketch that is no clean shape stays as a drawing', () {
      final squiggle = ink([for (var i = 0; i < 80; i++) Offset(i * 5.0, 150 + 120 * math.sin(i / 6) * math.cos(i / 17))]);
      final r = parseInk([squiggle], const InkContext());
      expect(r.shapes, isEmpty);
      expect(r.drawings, hasLength(1));
    });

    test('a scribble is a scribble; a line or a circle is not', () {
      final zig = [for (var i = 0; i < 40; i++) Offset((i % 2 == 0 ? 0 : 120) + i * 1.0, 100 + i * 1.5)];
      expect(isScribble(zig), isTrue);
      expect(isScribble([for (var i = 0; i < 40; i++) Offset(i * 5.0, 100)]), isFalse);
      expect(isScribble([for (var a = 0.0; a < 2 * math.pi; a += 0.1) Offset(100 + 50 * math.cos(a), 100 + 50 * math.sin(a))]), isFalse);
    });

    test('writing keeps the order it was written in', () {
      final strokes = [
        for (var i = 0; i < 4; i++) ink([Offset(100.0 - i * 20, 0), Offset(110.0 - i * 20, 30)]),
      ];
      expect(parseInk(strokes, const InkContext()).writing.map((s) => s.id), strokes.map((s) => s.id));
    });
  });
}
