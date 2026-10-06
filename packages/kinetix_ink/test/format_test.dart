import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import 'lesson_test.dart' show FakeStopwatch;

/// A board saved by the version 1 app (strokes only, no version number).
const _v1Board = {
  'background': 'ruled',
  'canvas': {'w': 1600, 'h': 900},
  'pages': [
    {
      'strokes': [
        {'t': 'pen', 'c': 4278190080, 'w': 4, 'p': [10, 20, 30, 40, 50, 45]},
        {'t': 'highlighter', 'c': 1728052992, 'w': 6, 'p': [0, 0, 100, 0]},
        {'t': 'shape', 'c': 4292423717, 'w': 3, 's': 'triangle', 'p': [0, 100, 50, 0, 100, 100, 0, 100]},
      ],
    },
    {'strokes': []},
  ],
};

/// A recording made by the version 1 board.
const _v1Lesson = {
  'v': 1,
  'canvas': {'w': 1280, 'h': 720},
  'background': 'plain',
  'durationMs': 900,
  'events': [
    [0, 'L', [[]], 0],
    [0, 'k', 'plain'],
    [100, 'b', 0, {'t': 'pen', 'c': 4278190080, 'w': 4, 'p': [10, 10]}],
    [150, 'p', 0, 20, 20, 30, 30],
    [200, 'e', 0],
    [300, 'b', 1, {'t': 'shape', 'c': 4278190080, 'w': 3, 's': 'circle', 'p': [100, 100]}],
    [350, 'u', 1, 150, 100, 100, 150, 50, 100, 100, 50, 150, 100],
    [400, 'e', 1],
    [500, 'm', 5.5, 0, 0, 1],
    [600, 'n', 1],
    [700, 'k', 'grid'],
    [800, 'g', 0],
    [900, 'x', 1],
  ],
};

final _png = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
);

void main() {
  const ink = Color(0xFF1B1F24);

  group('saved boards', () {
    test('a version 1 board still opens, every stroke in place', () {
      final b = SavedBoard.fromJson(jsonDecode(jsonEncode(_v1Board)) as Map<String, dynamic>);
      expect(b.background, BoardBackground.ruled);
      expect(b.canvas, const Size(1600, 900));
      expect(b.pageCount, 2);
      expect(b.pages[0].map((e) => (e as Stroke).style.tool), [InkTool.pen, InkTool.highlighter, InkTool.shape]);
      expect((b.pages[0][2] as Stroke).shape, ShapeKind.triangle);
      expect(b.groups, [[], []]);
      // Saving it again writes the same strokes.
      final again = b.toJson();
      expect(again['v'], 2);
      expect((again['pages'] as List)[0]['strokes'], (_v1Board['pages'] as List)[0]['strokes']);
    });

    test('every kind of element survives a save and load', () {
      final els = <BoardElement>[
        Stroke(
          id: 's',
          style: const InkStyle(tool: InkTool.shape, color: ink, width: 3, shape: ShapeKind.hexagon),
          shape: ShapeKind.hexagon,
          fill: const Color(0x2E1B1F24),
          points: shapePoints(ShapeKind.hexagon, Offset.zero, const Offset(80, 80)),
        ),
        const TextElement(
          id: 't',
          position: Offset(-120.04, 30),
          text: 'प्रकाश संश्लेषण\nPhotosynthesis',
          color: ink,
          fontSize: 32,
          size: Size(240, 80),
          bold: true,
          font: BoardFont.andika,
          rotation: 0.5,
        ),
        ImageElement(
          id: 'i',
          rect: const Rect.fromLTWH(10, 10, 160, 90),
          bytes: _png,
          link: const EmbedLink(kind: EmbedLink.model3d, id: 'heart', preset: 'cutaway'),
        ),
        const MathElement(id: 'm', position: Offset(5, 5), latex: r'\frac{a}{b}', color: ink, fontSize: 34, size: Size(60, 80)),
        const GraphElement(id: 'g', rect: Rect.fromLTWH(0, 0, 400, 300), expression: 'x^2 - 4', color: Colors.blue, xMin: -5, xMax: 5, yMin: -5, yMax: 20),
        const PolygonElement(id: 'p', points: [Offset(0, 0), Offset(10, 0), Offset(5, 8)], color: ink, width: 3, closed: false, fill: Color(0x33000000)),
        const NoteElement(id: 'n', rect: Rect.fromLTWH(0, 0, 260, 120), text: 'print(1)', color: Colors.yellow, kind: NoteKind.code, language: 'python'),
      ];
      final board = SavedBoard(background: BoardBackground.fourLine, canvas: const Size(1920, 1080), pages: [els], groups: [
        [
          [1, 2],
        ],
      ]);
      final back = SavedBoard.fromJson(jsonDecode(jsonEncode(board.toJson())) as Map<String, dynamic>);
      expect(back.background, BoardBackground.fourLine);
      expect(back.groups.single, [
        [1, 2],
      ]);
      final p = back.pages.single;
      expect(p.map((e) => e.runtimeType), els.map((e) => e.runtimeType));
      // Everything but ids round-trips exactly (to 0.1 board units).
      for (var i = 0; i < els.length; i++) {
        expect(jsonEncode(encodeElement(p[i])), jsonEncode(encodeElement(els[i])), reason: '${els[i].runtimeType}');
      }
      final t = p[1] as TextElement;
      expect((t.text, t.font, t.bold, t.position.dx), ('प्रकाश संश्लेषण\nPhotosynthesis', BoardFont.andika, true, -120.0));
      expect((p[2] as ImageElement).link, const EmbedLink(kind: EmbedLink.model3d, id: 'heart', preset: 'cutaway'));
      expect((p[2] as ImageElement).bytes, _png);
      expect((p[6] as NoteElement).language, 'python');
    });

    test('an older reader keeps the strokes of a new board, and group positions skip unknown kinds', () {
      final j = {
        'v': 3,
        'pages': [
          {
            'strokes': [
              {'t': 'hologram', 'z': 1},
              {'t': 'pen', 'c': 4278190080, 'w': 3, 'p': [0, 0, 5, 5]},
              {'t': 'text', 'x': 0, 'y': 0, 'tx': 'A', 'c': 4278190080, 'fs': 20, 'sw': 20, 'sh': 25},
              {'t': 'image', 'r': [0, 0, 10, 10]}, // no bytes: skipped
            ],
            'groups': [
              [0, 1, 2],
              [3],
            ],
          },
        ],
      };
      final b = SavedBoard.fromJson(j);
      expect(b.pages.single.map((e) => e.runtimeType), [Stroke, TextElement]);
      expect(b.groups.single, [
        [0, 1],
      ]);
      // What a version 1 reader does: keep what decodeStroke understands.
      final v1 = [for (final raw in (b.toJson()['pages'] as List).single['strokes'] as List) ?decodeStroke(raw as Map<String, dynamic>, 'x')];
      expect(v1, hasLength(1));
    });

    test('the saved board stays compact: pictures are the only big thing', () {
      final strokes = [
        for (var i = 0; i < 50; i++)
          Stroke(
            id: '$i',
            style: const InkStyle(tool: InkTool.pen, color: ink, width: 4),
            points: [for (var k = 0; k < 40; k++) InkPoint(k * 3.333, i * 10.0 + k * 0.17)],
          ),
      ];
      final bytes = utf8.encode(jsonEncode(SavedBoard(background: BoardBackground.plain, canvas: const Size(1920, 1080), pages: [strokes]).toJson()));
      expect(bytes.length, lessThan(50 * 40 * 13)); // about 12 bytes a point
    });
  });

  group('lesson stream, version 2', () {
    late WhiteboardController board;
    late FakeStopwatch clock;
    late LessonRecorder rec;

    setUp(() {
      board = WhiteboardController();
      clock = FakeStopwatch();
      rec = LessonRecorder(board: board, background: BoardBackground.plain, canvas: const Size(1280, 720), stopwatch: clock);
    });
    tearDown(() => board.dispose());

    void draw(Offset from, Offset to, {int pointer = 1, int steps = 8}) {
      board.pointerDown(pointer, InkPoint(from.dx, from.dy));
      for (var i = 1; i <= steps; i++) {
        clock.advance(10);
        final o = Offset.lerp(from, to, i / steps)!;
        board.pointerMove(pointer, InkPoint(o.dx, o.dy));
      }
      board.pointerUp(pointer);
      clock.advance(50);
    }

    List<String> snapshotOf(List<BoardElement> els) => [for (final e in els) jsonEncode(encodeElement(e))];

    void expectSameBoard(LessonPlayer player) {
      expect(player.pageIndex, board.pageIndex);
      expect(snapshotOf(player.elements), snapshotOf(board.elements));
    }

    Lesson lesson() => Lesson.fromJson(jsonDecode(jsonEncode(rec.stop())) as Map<String, dynamic>);

    test('records every kind of element, and moves stream as moves, not redraws', () {
      rec.start();
      draw(const Offset(10, 10), const Offset(200, 40));
      board.add(const TextElement(id: 'title', position: Offset(300, 50), text: 'Fractions', color: ink, fontSize: 40, size: Size(180, 50)));
      board.add(const MathElement(id: 'eq', position: Offset(300, 150), latex: r'\frac{1}{2}', color: ink, fontSize: 34, size: Size(40, 80)));
      board.add(const NoteElement(id: 'ans', rect: Rect.fromLTWH(300, 300, 200, 80), text: '1/2', color: Colors.green, kind: NoteKind.answer));
      clock.advance(100);

      board.tool = BoardTool.select;
      board.select({'title', 'eq'});
      final before = rec.eventCount;
      board.pointerDown(2, const InkPoint(320, 70));
      for (var i = 1; i <= 10; i++) {
        clock.advance(16);
        board.pointerMove(2, InkPoint(320 + i * 3.33, 70 + i * 1.07));
      }
      board.pointerUp(2);
      clock.advance(100);
      board.revealAnswers();
      clock.advance(100);

      final l = lesson();
      final during = l.events.skip(before).toList();
      expect(during.where((e) => e[1] == 'm'), isNotEmpty);
      expect(during.where((e) => e[1] == 'a' && (e[3] as Map)['t'] != 'note'), isEmpty, reason: 'moves must not resend elements');
      final player = LessonPlayer(l)..seek(l.duration);
      expectSameBoard(player);
      // The moves add up exactly, despite rounding each to 0.1.
      final title = player.elements.whereType<TextElement>().single;
      expect(title.position.dx, closeTo(333.3, 0.051));
    });

    test('a picture travels once, even when it is resized and moved', () {
      rec.start();
      board.add(ImageElement(id: 'img', rect: const Rect.fromLTWH(0, 0, 100, 100), bytes: _png, link: const EmbedLink(kind: EmbedLink.lab, id: 'ohms-law')));
      board.select({'img'});
      board.beginTransform(SelectionHandle.bottomRight, const Offset(100, 100));
      board.updateTransform(const Offset(150, 150));
      board.endTransform();
      board.transformSelection((e) => e.translated(const Offset(10, 0)));
      final events = rec.drain();
      final withBytes = events.where((e) => jsonEncode(e).contains('"d":'));
      expect(withBytes, hasLength(1));
      final player = LessonPlayer.live()..applyLive((jsonDecode(jsonEncode(events)) as List<dynamic>).cast<List<dynamic>>());
      final img = player.elements.single as ImageElement;
      expect(img.rect, const Rect.fromLTWH(10, 0, 150, 150));
      expect(img.bytes, _png);
      expect(img.link?.id, 'ohms-law');

      // A viewer who joins later gets the bytes again in the snapshot.
      rec.snapshotNow();
      final late = LessonPlayer.live()..applyLive(rec.drain());
      expect((late.elements.single as ImageElement).bytes, _png);
    });

    test('undo, redo, erase, delete, pages and paper all replay', () {
      rec.start();
      draw(const Offset(0, 0), const Offset(100, 0));
      draw(const Offset(0, 50), const Offset(100, 50));
      board.undo();
      clock.advance(10);
      board.redo();
      clock.advance(10);
      board.tool = BoardTool.eraser;
      draw(const Offset(50, -10), const Offset(50, 10), pointer: 3);
      board.undo();
      clock.advance(10);
      board.addPage();
      board.tool = BoardTool.pen;
      draw(const Offset(5, 5), const Offset(60, 60));
      board.background = BoardBackground.grid;
      clock.advance(10);
      board.previous();
      clock.advance(10);
      board.select({board.elements.first.id});
      board.deleteSelection();
      clock.advance(10);
      board.duplicatePage(0); // pages that move or copy go as a snapshot
      clock.advance(10);
      final l = lesson();
      final player = LessonPlayer(l)..seek(l.duration);
      expectSameBoard(player);
      expect(player.pageCount, 3);
      // Each page has its own paper: the copy of the first page is plain, as the first page is.
      expect(player.background, BoardBackground.plain);
    });

    test('the view and the laser stream for the live view', () {
      var now = 5000;
      board
        ..now = (() => now)
        ..viewport = const Size(1280, 720);
      rec.start();
      board.zoomBy(2, Offset.zero);
      clock.advance(200);
      board.panBy(const Offset(-100, 0));
      board.tool = BoardTool.laser;
      board.pointerDown(1, const InkPoint(10, 10));
      now += 16;
      board.pointerMove(1, const InkPoint(20, 10));
      board.pointerUp(1);
      final events = rec.drain();
      // The view at the start, then (the zoom being within a tenth of a second of it) the view
      // after the zoom and the pan.
      final views = [for (final e in events) if (e[1] == 'v') e.skip(2).toList()];
      expect(views, [
        [0, 0, 1280, 720],
        [50, 0, 640, 360],
      ]);
      final player = LessonPlayer.live()..applyLive(events);
      expect(player.laser.map((p) => p.at), [const Offset(10, 10), const Offset(20, 10)]);
      expect(player.elements, isEmpty);
      // The last view always arrives, even when the board moved within the throttle.
      clock.advance(10);
      board.panBy(const Offset(-50, 0));
      expect(rec.drain().where((e) => e[1] == 'v'), isEmpty);
      clock.advance(200);
      board.panBy(Offset.zero); // any later change flushes it
      expect(rec.drain().where((e) => e[1] == 'v').single.skip(2), [75, 0, 640, 360]);
    });

    test('an older player shows the strokes of a version 2 stream and skips the rest', () {
      rec.start();
      draw(const Offset(0, 0), const Offset(100, 0));
      board.add(const TextElement(id: 't', position: Offset(0, 50), text: 'A', color: ink, fontSize: 20, size: Size(20, 25)));
      board.tool = BoardTool.select;
      board.selectAll();
      board.transformSelection((e) => e.translated(const Offset(5, 5)));
      final events = rec.drain();
      // A version 1 player decodes elements with decodeStroke and ignores kinds it does not know.
      final strokes = <int, Stroke>{};
      for (final e in events) {
        switch (e[1]) {
          case 'b' || 'a':
            final s = decodeStroke(e[3] as Map<String, dynamic>, '${e[2]}');
            if (s != null) strokes[e[2] as int] = s;
          case 'p':
            strokes[e[2]]?.points.addAll([
              for (var i = 3; i + 1 < e.length; i += 2) InkPoint((e[i] as num).toDouble(), (e[i + 1] as num).toDouble()),
            ]);
          case 'm':
            for (final id in e.skip(4)) {
              strokes[id]?.translate(Offset((e[2] as num).toDouble(), (e[3] as num).toDouble()));
            }
        }
      }
      expect(strokes, hasLength(1));
      expect(strokes.values.single.points.first.offset, const Offset(5, 5));
    });
  });

  test('a version 1 recording plays exactly as before', () {
    final l = Lesson.fromJson(jsonDecode(jsonEncode(_v1Lesson)) as Map<String, dynamic>);
    final p = LessonPlayer(l);
    p.seek(const Duration(milliseconds: 450));
    expect(p.strokes, hasLength(2));
    expect(p.strokes.last.shape, ShapeKind.circle);
    p.seek(const Duration(milliseconds: 550));
    expect(p.strokes.last.points.first.x, 155.5);
    p.seek(const Duration(milliseconds: 650));
    expect((p.pageIndex, p.pageCount, p.strokes.length), (1, 2, 0));
    p.seek(l.duration);
    expect((p.pageIndex, p.background, p.strokes.length), (0, BoardBackground.grid, 1));
    expect(p.visibleArea, isNull); // shown at the recorded canvas size
    expect(p.elements, hasLength(1));
  });

  testWidgets('viewers show new elements, and equations typeset', (tester) async {
    final board = SavedBoard(
      background: BoardBackground.plain,
      canvas: const Size(1280, 720),
      pages: [
        [
          const MathElement(id: 'm', position: Offset(100, 100), latex: r'x^2', color: ink, fontSize: 34, size: Size(60, 50)),
          const TextElement(id: 't', position: Offset(1500, 900), text: 'far away', color: ink, fontSize: 20, size: Size(90, 25)),
        ],
      ],
    );
    await tester.pumpWidget(MaterialApp(home: Center(child: SizedBox(width: 640, height: 400, child: WhiteboardView(board: board)))));
    expect(find.byType(BoardMath), findsOneWidget);
    // The view grows to take in what was drawn beyond the screen.
    expect(WhiteboardView.areaFor(board.pages.single, board.canvas).right, greaterThan(1590));
    expect(tester.takeException(), isNull);
  });
}
