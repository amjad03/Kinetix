import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

void main() {
  late WhiteboardController board;

  Future<void> pump(WidgetTester tester, {InputMode mode = InputMode.auto, bool multiWriter = false, bool fingerTaps = true, Future<String?> Function(String?)? editMath}) async {
    tester.view.physicalSize = const Size(1200, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    board = WhiteboardController();
    addTearDown(board.dispose);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: WhiteboardCanvas(
            controller: board,
            inputMode: mode,
            multiWriter: multiWriter,
            fingerTaps: fingerTaps,
            editMath: editMath,
            selectionActions: (context, box) => Stack(
              children: [Positioned(left: box.left, top: box.bottom + 20, child: const Text('selection-actions'))],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> stroke(WidgetTester tester, Offset from, {PointerDeviceKind kind = PointerDeviceKind.touch, int pointer = 1, Offset by = const Offset(120, 30)}) async {
    final g = await tester.startGesture(from, pointer: pointer, kind: kind);
    for (var i = 1; i <= 6; i++) {
      await g.moveTo(from + by * (i / 6));
    }
    await g.up();
    await tester.pump();
  }

  testWidgets('a finger writes; two fingers zoom the board instead', (tester) async {
    await pump(tester);
    await stroke(tester, const Offset(200, 200));
    expect(board.elements, hasLength(1));

    final a = await tester.startGesture(const Offset(500, 400), pointer: 2, kind: PointerDeviceKind.touch);
    final b = await tester.startGesture(const Offset(600, 400), pointer: 3, kind: PointerDeviceKind.touch);
    await a.moveTo(const Offset(450, 400));
    await b.moveTo(const Offset(650, 400));
    await a.up();
    await b.up();
    await tester.pump();
    expect(board.elements, hasLength(1)); // the pinch drew nothing
    expect(board.view.value.scale, closeTo(2, 0.01));
  });

  testWidgets('on a panel every finger writes its own line', (tester) async {
    await pump(tester, multiWriter: true);
    final fingers = [
      for (var i = 0; i < 3; i++) await tester.startGesture(Offset(200 + i * 200.0, 300), pointer: i + 1, kind: PointerDeviceKind.touch),
    ];
    for (var step = 1; step <= 4; step++) {
      for (final f in fingers) {
        await f.moveBy(const Offset(0, 20));
      }
    }
    for (final f in fingers) {
      await f.up();
    }
    await tester.pump();
    expect(board.elements, hasLength(3));
    expect(board.view.value.scale, 1);
  });

  testWidgets('auto mode: once a pen has written, fingers move the board and only the pen writes', (tester) async {
    await pump(tester);
    await stroke(tester, const Offset(200, 200), kind: PointerDeviceKind.stylus);
    expect(board.elements, hasLength(1));
    await stroke(tester, const Offset(300, 300), pointer: 4, by: const Offset(-100, 0));
    expect(board.elements, hasLength(1));
    expect(board.view.value.offset.dx, closeTo(-100, 0.5));
  });

  testWidgets('the eraser end of a pen erases whatever tool is chosen', (tester) async {
    await pump(tester, mode: InputMode.pen);
    await stroke(tester, const Offset(200, 200), kind: PointerDeviceKind.stylus);
    await stroke(tester, const Offset(260, 160), kind: PointerDeviceKind.invertedStylus, by: const Offset(0, 120));
    expect(board.elements, isEmpty);
    expect(board.tool, BoardTool.pen);
  });

  testWidgets('a palm is learnt from the usual finger size and rubs out on a panel', (tester) async {
    await pump(tester, mode: InputMode.finger);
    board.palmMode = PalmMode.erase;
    await stroke(tester, const Offset(200, 200), by: const Offset(300, 0));
    expect(board.elements, hasLength(1));
    final palm = TestPointer(9, PointerDeviceKind.touch);
    await tester.sendEventToBinding(palm.down(const Offset(350, 200)).copyWith(radiusMajor: 60));
    await tester.sendEventToBinding(palm.up());
    await tester.pump();
    expect(board.elements, isEmpty);
    expect(PalmDetector().isPalm(0), isFalse); // screens that report no size never see palms
  });

  testWidgets('selection: handles resize, and the app shows its actions under it', (tester) async {
    await pump(tester);
    board.add(const NoteElement(id: 'n', rect: Rect.fromLTWH(300, 200, 200, 100), text: 'Hello', color: Colors.yellow));
    board.tool = BoardTool.select;
    await tester.tapAt(const Offset(400, 250));
    await tester.pump();
    expect(board.selection, {'n'});
    expect(find.text('selection-actions'), findsOneWidget);
    // Drag the bottom-right handle (8 px outside the box) out by 100.
    final g = await tester.startGesture(const Offset(508, 308), pointer: 7, kind: PointerDeviceKind.mouse);
    await g.moveTo(const Offset(558, 333));
    await g.moveTo(const Offset(608, 358));
    await tester.pump();
    expect(find.text('selection-actions'), findsNothing); // out of the way while resizing
    await g.up();
    await tester.pump();
    // The corner follows the pointer; the note keeps its proportions.
    final n = board.elements.single as NoteElement;
    expect(n.rect.topLeft, const Offset(300, 200));
    expect(n.rect.width, closeTo(295, 2));
    expect(n.rect.width / n.rect.height, closeTo(2, 0.01));
  });

  testWidgets('typing: tap with the text tool, type, and tap away', (tester) async {
    await pump(tester);
    board.tool = BoardTool.text;
    await tester.tapAt(const Offset(300, 300));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'Newton');
    board.tool = BoardTool.pen; // switching tools commits what was typed
    await tester.pump();
    final t = board.elements.single as TextElement;
    expect(t.text, 'Newton');
    expect(t.size.width, greaterThan(20));
    expect(find.byType(TextField), findsNothing);
  });

  testWidgets('equations come from the app’s editor and are typeset on the board', (tester) async {
    await pump(tester, editMath: (initial) async => r'\frac{a}{b}');
    board.tool = BoardTool.math;
    await tester.tapAt(const Offset(300, 300));
    await tester.pumpAndSettle();
    expect(board.elements.single, isA<MathElement>());
    expect(find.byType(BoardMath), findsOneWidget);
  });

  testWidgets('the ruler and protractor lie on the board and close', (tester) async {
    await pump(tester);
    board.toggleRuler();
    board.toggleProtractor();
    await tester.pump();
    expect(find.byKey(const Key('ruler')), findsOneWidget);
    expect(find.byKey(const Key('protractor')), findsOneWidget);
    await tester.tap(find.byKey(const Key('ruler-close')));
    await tester.pump();
    expect(find.byKey(const Key('ruler')), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('ctrl + wheel zooms, the wheel pans', (tester) async {
    await pump(tester);
    final pointer = TestPointer(1, PointerDeviceKind.mouse);
    await tester.sendEventToBinding(pointer.hover(const Offset(600, 400)));
    await tester.sendEventToBinding(pointer.scroll(const Offset(0, 100)));
    await tester.pump();
    expect(board.view.value.offset, const Offset(0, -100));
  });

  testWidgets('the laser draws nothing and its trail fades away', (tester) async {
    await pump(tester);
    var now = 0;
    board.now = () => now;
    board.tool = BoardTool.laser;
    await stroke(tester, const Offset(200, 200));
    expect(board.elements, isEmpty);
    expect(board.laser.value, isNotEmpty);
    now += 1200;
    await tester.pump(const Duration(milliseconds: 1200));
    await tester.pump(const Duration(milliseconds: 100));
    expect(board.laser.value, isEmpty);
  });

  group('finger taps', () {
    /// Fingers that land [gap] apart (the first after [start]), stay [hold] and lift together,
    /// each moving [move] on the way.
    Future<void> tap(WidgetTester tester, int fingers, {Duration gap = const Duration(milliseconds: 30), Duration hold = const Duration(milliseconds: 120), Offset move = Offset.zero, Duration start = Duration.zero}) async {
      final gestures = <TestGesture>[];
      var t = start;
      for (var i = 0; i < fingers; i++) {
        final g = await tester.createGesture(pointer: 20 + i, kind: PointerDeviceKind.touch);
        await g.down(Offset(400 + i * 60.0, 400), timeStamp: t);
        gestures.add(g);
        if (i < fingers - 1) t += gap;
      }
      t += hold;
      if (move != Offset.zero) {
        for (var i = 0; i < gestures.length; i++) {
          await gestures[i].moveTo(Offset(400 + i * 60.0, 400) + move, timeStamp: t);
        }
      }
      for (final g in gestures) {
        await g.up(timeStamp: t);
      }
      await tester.pump();
    }

    testWidgets('two fingers undo, three redo, and leave no dot behind', (tester) async {
      await pump(tester);
      await stroke(tester, const Offset(200, 200));
      await stroke(tester, const Offset(200, 300), pointer: 2);
      expect(board.elements, hasLength(2));
      await tap(tester, 2);
      expect(board.elements, hasLength(1));
      await tap(tester, 2, start: const Duration(seconds: 1));
      expect(board.elements, isEmpty);
      await tap(tester, 3, start: const Duration(seconds: 2));
      expect(board.elements, hasLength(1));
      expect(board.view.value.scale, 1);
    });

    testWidgets('slow, moving or held fingers are a pinch, not a tap', (tester) async {
      await pump(tester);
      await stroke(tester, const Offset(200, 200));
      // Held too long.
      await tap(tester, 2, hold: const Duration(milliseconds: 400));
      expect(board.elements, hasLength(1));
      // The second finger came too late.
      await tap(tester, 2, gap: const Duration(milliseconds: 300), start: const Duration(seconds: 1));
      expect(board.elements, hasLength(1));
      // Moved: a pan.
      await tap(tester, 2, move: const Offset(40, 0), start: const Duration(seconds: 2));
      expect(board.elements, hasLength(1));
      expect(board.view.value.offset.dx, closeTo(40, 0.01));
    });

    testWidgets('the setting turns them off; on a panel they do not undo', (tester) async {
      await pump(tester, fingerTaps: false);
      await stroke(tester, const Offset(200, 200));
      await tap(tester, 2);
      expect(board.elements, hasLength(1));

      await pump(tester, multiWriter: true);
      await tap(tester, 2);
      // On a panel two fingers together move the board: no undo, and no dots.
      expect(board.elements, isEmpty);
      expect(board.canUndo, isFalse);
    });

    testWidgets('a broad second finger is a finger, not a palm, so pinch works with palm rejection', (tester) async {
      await pump(tester);
      board.palmMode = PalmMode.ignore;
      final a = TestPointer(30, PointerDeviceKind.touch);
      final b = TestPointer(31, PointerDeviceKind.touch);
      await tester.sendEventToBinding(a.down(const Offset(500, 400)));
      await tester.sendEventToBinding(b.down(const Offset(600, 400), timeStamp: const Duration(milliseconds: 40)).copyWith(radiusMajor: 40));
      await tester.sendEventToBinding(a.move(const Offset(450, 400), timeStamp: const Duration(milliseconds: 300)));
      await tester.sendEventToBinding(b.move(const Offset(650, 400), timeStamp: const Duration(milliseconds: 300)));
      await tester.sendEventToBinding(a.up(timeStamp: const Duration(milliseconds: 400)));
      await tester.sendEventToBinding(b.up(timeStamp: const Duration(milliseconds: 400)));
      await tester.pump();
      expect(board.elements, isEmpty);
      expect(board.view.value.scale, closeTo(2, 0.01));
    });
  });

  group('broad fingers (Android reports a finger\'s tool size)', () {
    var t = const Duration(seconds: 5);
    var id = 60;

    Future<TestPointer> down(WidgetTester tester, Offset at, double radius) async {
      final p = TestPointer(id++, PointerDeviceKind.touch);
      t += const Duration(milliseconds: 16);
      await tester.sendEventToBinding(p.down(at, timeStamp: t).copyWith(radiusMajor: radius));
      return p;
    }

    Future<void> drag(WidgetTester tester, List<TestPointer> ps, List<Offset> by) async {
      final from = [for (final p in ps) p.location!];
      for (var i = 1; i <= 8; i++) {
        t += const Duration(milliseconds: 40);
        for (var k = 0; k < ps.length; k++) {
          await tester.sendEventToBinding(ps[k].move(from[k] + by[k] * (i / 8), timeStamp: t));
        }
      }
      for (final p in ps) {
        await tester.sendEventToBinding(p.up(timeStamp: t));
      }
      await tester.pump();
    }

    for (final mode in [PalmMode.ignore, PalmMode.erase]) {
      testWidgets('${mode.name}: the hand tool pans and two fingers pinch with broad contacts', (tester) async {
        await pump(tester);
        board.palmMode = mode;
        board.tool = BoardTool.hand;
        await drag(tester, [await down(tester, const Offset(500, 400), 40)], [const Offset(-80, -50)]);
        expect(board.view.value.offset, within(distance: 0.5, from: const Offset(-80, -50)));

        board.tool = BoardTool.pen;
        final a = await down(tester, const Offset(500, 400), 30);
        final b = await down(tester, const Offset(600, 400), 34);
        await drag(tester, [a, b], [const Offset(-50, 0), const Offset(50, 0)]);
        expect(board.elements, isEmpty);
        expect(board.view.value.scale, closeTo(2, 0.01));
      });

      testWidgets('${mode.name}: Select drags what is selected with a broad finger', (tester) async {
        await pump(tester);
        board.palmMode = mode;
        board.add(const NoteElement(id: 'n', rect: Rect.fromLTWH(300, 200, 200, 100), text: 'Hi', color: Colors.yellow));
        board.tool = BoardTool.select;
        board.select({'n'});
        await drag(tester, [await down(tester, const Offset(400, 250), 45)], [const Offset(60, 40)]);
        expect(board.elements.single.bounds.topLeft, within(distance: 0.5, from: const Offset(360, 240)));
      });
    }

    testWidgets('on a panel, two fingers landing together pinch; apart or one after another they write', (tester) async {
      await pump(tester, multiWriter: true);
      board.palmMode = PalmMode.erase;
      final a = await down(tester, const Offset(500, 400), 8);
      final b = await down(tester, const Offset(600, 400), 9);
      await drag(tester, [a, b], [const Offset(-50, 0), const Offset(50, 0)]);
      expect(board.elements, isEmpty);
      expect(board.view.value.scale, closeTo(2, 0.01));

      final c = await down(tester, const Offset(300, 300), 8);
      t += const Duration(milliseconds: 400);
      final d = await down(tester, const Offset(360, 300), 8);
      await drag(tester, [c, d], [const Offset(0, 60), const Offset(0, 60)]);
      expect(board.elements, hasLength(2));
    });

    test('the first contact sets the usual finger size', () {
      final d = PalmDetector();
      expect(d.isPalm(30), isFalse); // a thumb on a phone
      expect(d.isPalm(34), isFalse);
      expect(d.isPalm(120), isTrue); // a palm
      expect(PalmDetector().isPalm(60), isTrue); // far beyond any finger, even first
    });
  });
}
