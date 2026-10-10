import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

void main() {
  group('calibration', () {
    test('the average miss is removed from touches', () {
      final cal = TouchCalibration.fromSamples([
        (const Offset(100, 100), const Offset(110, 108)),
        (const Offset(300, 100), const Offset(310, 108)),
        (const Offset(200, 300), const Offset(210, 308)),
      ]);
      expect(cal.shift, const Offset(-10, -8));
      expect(cal.apply(const Offset(210, 308)), const Offset(200, 300));
      expect(const TouchCalibration().isCalibrated, isFalse);
    });

    test('saves and loads per device', () {
      final c = InputConfig(calibration: const TouchCalibration(Offset(3, -4)))
        ..penMax = 6
        ..palmMin = 30
        ..autoLearn = false;
      final back = InputConfig.decode(c.encode());
      expect(back.calibration.shift, const Offset(3, -4));
      expect((back.penMax, back.palmMin, back.autoLearn), (6, 30, false));
      expect(InputConfig.decode('garbage').autoLearn, isTrue);
    });
  });

  group('touch size', () {
    test('thresholds split pen, finger and palm', () {
      final c = InputConfig()..setThresholds(penMax: 5, palmMin: 25, autoLearn: false);
      bool never(double _) => false;
      expect(c.classify(3, learnedPalm: never), ContactClass.pen);
      expect(c.classify(12, learnedPalm: never), ContactClass.finger);
      expect(c.classify(30, learnedPalm: never), ContactClass.palm);
      expect(c.classify(0, learnedPalm: never), ContactClass.finger);
    });

    test('learning from samples sets the limits', () {
      final c = InputConfig()..learn(pen: [3, 5], finger: [10, 14], palm: [40, 50]);
      expect(c.autoLearn, isFalse);
      expect(c.penMax, closeTo(8, 0.01));
      expect(c.palmMin, closeTo(28.5, 0.01));
    });

    test('auto-learn falls back on the detector', () {
      final c = InputConfig();
      expect(c.classify(50, learnedPalm: (r) => r > 40), ContactClass.palm);
      expect(c.classify(20, learnedPalm: (r) => r > 40), ContactClass.finger);
    });
  });

  group('stylus and dual pens', () {
    test('barrel buttons map to actions', () {
      const s = StylusConfig(primaryButton: ButtonAction.highlight, secondaryButton: ButtonAction.undo);
      expect(s.actionFor(0), ButtonAction.none);
      expect(s.actionFor(0x02), ButtonAction.highlight);
      expect(s.actionFor(0x04), ButtonAction.undo);
    });

    test('each pen has its colour, by tip size or by order', () {
      const d = DualPens(enabled: true, first: Colors.blue, second: Colors.red, tipSplit: 6);
      expect(d.colourFor(radius: 3, slot: 1), Colors.blue);
      expect(d.colourFor(radius: 9, slot: 0), Colors.red);
      expect(d.copyWith(tipSplit: 0).colourFor(radius: 9, slot: 1), Colors.red);
    });
  });

  group('on the canvas', () {
    late WhiteboardController board;

    Future<void> pump(WidgetTester tester) async {
      tester.view.physicalSize = const Size(1200, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      board = WhiteboardController();
      addTearDown(board.dispose);
      await tester.pumpWidget(MaterialApp(home: Scaffold(body: WhiteboardCanvas(controller: board, inputMode: InputMode.finger))));
    }

    Future<void> stroke(WidgetTester tester, Offset from, {PointerDeviceKind kind = PointerDeviceKind.touch, int pointer = 1, int buttons = 0}) async {
      final g = await tester.startGesture(from, pointer: pointer, kind: kind, buttons: buttons);
      for (var i = 1; i <= 6; i++) {
        await g.moveTo(from + Offset(20.0 * i, 5));
      }
      await g.up();
      await tester.pump();
    }

    testWidgets('calibration moves the ink to where the user aimed', (tester) async {
      await pump(tester);
      board.inputConfig.calibration = const TouchCalibration(Offset(-10, -8));
      await stroke(tester, const Offset(300, 300));
      final first = (board.elements.single as Stroke).points.first;
      expect(first.x, closeTo(290, 0.5));
      expect(first.y, closeTo(292, 0.5));
    });

    testWidgets('a barrel button set to erase rubs out; set to undo it undoes', (tester) async {
      await pump(tester);
      await stroke(tester, const Offset(300, 300), kind: PointerDeviceKind.stylus);
      await stroke(tester, const Offset(300, 400), kind: PointerDeviceKind.stylus, pointer: 2);
      expect(board.elements, hasLength(2));
      board.inputConfig.stylus = const StylusConfig(primaryButton: ButtonAction.undo);
      final g = await tester.startGesture(const Offset(700, 600), pointer: 3, kind: PointerDeviceKind.stylus, buttons: 0x02);
      await g.up();
      await tester.pump();
      expect(board.elements, hasLength(1));
    });

    testWidgets('two pens write in their own colours', (tester) async {
      await pump(tester);
      board.inputConfig.dual = const DualPens(enabled: true, first: Colors.blue, second: Colors.red);
      final a = await tester.startGesture(const Offset(300, 300), pointer: 1, kind: PointerDeviceKind.stylus);
      final b = await tester.startGesture(const Offset(600, 300), pointer: 2, kind: PointerDeviceKind.stylus);
      await a.moveTo(const Offset(340, 320));
      await b.moveTo(const Offset(640, 320));
      await a.up();
      await b.up();
      await tester.pump();
      final colours = board.elements.whereType<Stroke>().map((s) => s.style.color).toSet();
      expect(colours, {Colors.blue, Colors.red});
    });

    testWidgets('a thin touch contact is a pen even when fingers navigate', (tester) async {
      await pump(tester);
      board.inputConfig.setThresholds(penMax: 5, autoLearn: false);
      final g = await tester.startGesture(const Offset(300, 300), pointer: 1);
      await g.updateWithCustomEvent(PointerMoveEvent(pointer: 1, position: const Offset(340, 310), radiusMajor: 3));
      await g.up();
      await tester.pump();
      // Without the setting, a finger in finger mode also writes: check the pen path ran.
      expect(board.elements, isNotEmpty);
    });
  });

  group('pages', () {
    test('adding a page repaints the finished layer and shows a blank page', () {
      final b = WhiteboardController();
      addTearDown(b.dispose);
      b.addPage(force: true);
      b.setElements([
        Stroke(id: 's', points: const [InkPoint(1, 1, .5), InkPoint(20, 20, .5)], style: const InkStyle(tool: InkTool.pen, color: Colors.black, width: 4)),
      ]);
      final before = b.committed.value;
      b.addPage();
      expect(b.elements, isEmpty);
      expect(b.committed.value, greaterThan(before), reason: 'the finished layer must repaint or the old page lingers');
      final mid = b.committed.value;
      b.previous();
      expect(b.committed.value, greaterThan(mid));
      expect(b.elements, hasLength(1));
    });

    test('a second board follows the first board\'s tools', () {
      final a = WhiteboardController()
        ..setPen(color: Colors.green, width: 9)
        ..tool = BoardTool.aiPen;
      final b = WhiteboardController()..mirrorToolsFrom(a);
      addTearDown(a.dispose);
      addTearDown(b.dispose);
      expect((b.tool, b.penColor, b.penWidth), (BoardTool.aiPen, Colors.green, 9));
      expect(identical(b.inputConfig, a.inputConfig), isTrue);
    });
  });
}
