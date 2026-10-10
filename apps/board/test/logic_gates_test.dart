import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/features/logic_gates/logic_circuit.dart';
import 'package:kinetix_board/features/logic_gates/logic_gates_lab.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import 'support/panel_harness.dart';

Future<void> tapKey(WidgetTester tester, String key) async {
  await tester.ensureVisible(find.byKey(Key(key)));
  await tester.tap(find.byKey(Key(key)));
}

void main() {
  test('every gate follows its truth table', () {
    const t = [false, true];
    final expected = {
      GateType.and: [false, false, false, true],
      GateType.or: [false, true, true, true],
      GateType.nand: [true, true, true, false],
      GateType.nor: [true, false, false, false],
      GateType.xor: [false, true, true, false],
      GateType.xnor: [true, false, false, true],
    };
    for (final MapEntry(key: g, value: want) in expected.entries) {
      final got = [for (final a in t) for (final b in t) gateOutput(g, [a, b])];
      expect(got, want, reason: gateName(g));
    }
    expect([gateOutput(GateType.not, [false]), gateOutput(GateType.not, [true])], [true, false]);
    expect([gateOutput(GateType.buffer, [false]), gateOutput(GateType.buffer, [true])], [false, true]);
    expect(GateType.values, hasLength(8));
  });

  test('signals propagate through wires at once, the LED follows, and a clock ticks', () {
    final c = LogicCircuit();
    final a = c.add(PartKind.input, Offset.zero), b = c.add(PartKind.input, const Offset(0, 100));
    final nand = c.add(PartKind.gate, const Offset(200, 0), gate: GateType.nand);
    final led = c.add(PartKind.led, const Offset(400, 0));
    expect(c.connect(a.id, nand.id, 0), isTrue);
    expect(c.connect(b.id, nand.id, 1), isTrue);
    expect(c.connect(nand.id, led.id, 0), isTrue);
    expect(c.evaluate()[led.id], isTrue); // NAND of 0, 0
    a.value = b.value = true;
    expect(c.evaluate()[led.id], isFalse);
    // A wire back into an earlier part would loop.
    expect(c.connect(led.id, a.id, 0), isFalse);
    expect(c.connect(nand.id, nand.id, 0), isFalse);
    // A second wire into the same pin replaces the first.
    expect(c.connect(b.id, nand.id, 0), isTrue);
    expect(c.wires.where((w) => w.to == nand.id && w.pin == 0), hasLength(1));
    // The clock flips on each tick.
    final clk = c.add(PartKind.clock, const Offset(0, 200));
    expect(clk.value, isFalse);
    c.tick();
    expect(clk.value, isTrue);
    c.remove(nand.id);
    expect(c.wires, isEmpty, reason: 'wires go with their part');
  });

  test('the truth table lists every case of the switches and leaves them as they were', () {
    final c = LogicCircuit();
    final a = c.add(PartKind.input, Offset.zero), b = c.add(PartKind.input, const Offset(0, 100));
    final x = c.add(PartKind.gate, const Offset(200, 0), gate: GateType.xor);
    final led = c.add(PartKind.led, const Offset(400, 0));
    c.connect(a.id, x.id, 0);
    c.connect(b.id, x.id, 1);
    c.connect(x.id, led.id, 0);
    a.value = true;
    final rows = c.truthTable();
    expect(rows.map((r) => r.outs.single), [false, true, true, false]);
    expect(rows.map((r) => r.ins), [
      [false, false],
      [false, true],
      [true, false],
      [true, true],
    ]);
    expect((a.value, b.value), (true, false));
    expect(LogicCircuit().truthTable(), isEmpty);
  });

  testWidgets('wire two parts by dragging, flip the switch, the LED lights, and the truth table shows', (tester) async {
    final c = LogicCircuit();
    final wb = WhiteboardController();
    await pumpPanel(tester, LogicGatesLab(wb: wb, circuit: c));
    await tapKey(tester, 'lg-add-input');
    await tapKey(tester, 'lg-add-not');
    await tapKey(tester, 'lg-add-led');
    await tester.pump();
    expect(c.parts, hasLength(3));
    final origin = tester.getTopLeft(find.byKey(const Key('lg-canvas')));
    final sw = c.parts[0], not = c.parts[1], led = c.parts[2];
    // Switch -> NOT input pin, NOT output pin -> LED.
    await tester.dragFrom(origin + sw.outPin, (not.inPin(0) - sw.outPin));
    await tester.pump();
    await tester.dragFrom(origin + not.outPin, (led.inPin(0) - not.outPin));
    await tester.pump();
    expect(c.wires, hasLength(2));
    expect(c.evaluate()[led.id], isTrue, reason: 'NOT of 0');
    await tester.tapAt(origin + sw.rect.center);
    await tester.pump();
    expect(sw.value, isTrue);
    expect(c.evaluate()[led.id], isFalse);
    await tapKey(tester, 'lg-table');
    await tester.pump();
    expect(find.byKey(const Key('lg-table-view')), findsOneWidget);
    expect(find.byKey(const Key('lg-row-1')), findsOneWidget);
    // Dragging a part moves it; dragging from a wired input pin pulls the wire off.
    final before = not.pos;
    await tester.dragFrom(origin + not.rect.center, const Offset(30, 40));
    await tester.pump();
    expect(not.pos, before + const Offset(30, 40));
    await tester.dragFrom(origin + led.inPin(0), const Offset(0, 120));
    await tester.pump();
    expect(c.wires, hasLength(1));
    await tapKey(tester, 'lg-step');
    await tester.pump();
  });

  testWidgets('the truth table can go on the board', (tester) async {
    final c = LogicCircuit();
    final a = c.add(PartKind.input, Offset.zero), led = c.add(PartKind.led, const Offset(300, 0));
    c.connect(a.id, led.id, 0);
    final wb = WhiteboardController();
    await pumpPanel(tester, LogicGatesLab(wb: wb, circuit: c));
    await tapKey(tester, 'lg-to-board');
    await tester.pump();
    expect(wb.elements, isNotEmpty);
  });

  test('Hindi and Kannada have every English key', () {
    for (final lang in ['hi', 'kn']) {
      expect(logicStringTable[lang]!.keys.toSet(), logicStringTable['en']!.keys.toSet());
    }
  });
}
