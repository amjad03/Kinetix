import 'dart:convert';
import 'dart:math' as math;
import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

/// The electronics and communication panels: the logic engine (gates, flip-flops, clocked
/// simulation, expressions, minimisation), timing diagrams, the FFT, Bode plots and pinouts.
void main() {
  group('logic', () {
    test('multi-input gates: AND/OR of 8, XOR is odd parity, missing inputs read 0', () {
      expect(gateOutput(GateType.and, List.filled(8, true)), isTrue);
      expect(gateOutput(GateType.and, [...List.filled(7, true), false]), isFalse);
      expect(gateOutput(GateType.nor, List.filled(5, false)), isTrue);
      expect(gateOutput(GateType.xor, [true, true, true]), isTrue);
      expect(gateOutput(GateType.xnor, [true, true, true]), isFalse);
      expect(gateOutput(GateType.and, [true]), isFalse);
      final c = LogicCircuit();
      final g = c.add(PartKind.gate, Offset.zero, gate: GateType.or, inputs: 4);
      expect(g.inputCount, 4);
      c.setInputs(g.id, 12);
      expect(g.inputCount, maxGateInputs);
      final a = c.add(PartKind.input, Offset.zero);
      c.connect(a.id, g.id, 7);
      c.setInputs(g.id, 3);
      expect(c.wires, isEmpty, reason: 'the wire to pin 7 went with the pin');
    });

    test('flip-flops follow their characteristic tables at the rising edge', () {
      expect([for (final q in [false, true]) for (final s in [false, true]) for (final r in [false, true]) flipFlopNext(FlipFlopType.sr, q, [s, true, r])], [false, false, true, false, true, false, true, true]);
      expect([for (final q in [false, true]) for (final j in [false, true]) for (final k in [false, true]) flipFlopNext(FlipFlopType.jk, q, [j, true, k])], [false, false, true, true, true, false, true, false]);
      expect([flipFlopNext(FlipFlopType.t, false, [true]), flipFlopNext(FlipFlopType.t, true, [false])], [true, true]);
      expect(flipFlopNext(FlipFlopType.d, true, [false, true]), isFalse);
    });

    test('a D flip-flop takes D only on the clock rising, and Q\' feeds back without a loop error', () {
      final c = logicPreset(LogicPreset.dFlipFlop);
      final d = c.inputs.firstWhere((p) => p.label == 'D');
      final ff = c.flipFlops.single;
      d.value = true;
      expect(ff.state, isFalse);
      c.tick(); // rises
      expect(ff.state, isTrue);
      d.value = false;
      c.tick(); // falls: holds
      expect(ff.state, isTrue);
      c.tick();
      expect(ff.state, isFalse);
      // A toggle: Q' back into D through a flip-flop is allowed; a loop of gates is not.
      final t = LogicCircuit();
      final f = t.add(PartKind.flipFlop, Offset.zero, flipFlop: FlipFlopType.d);
      expect(t.connect(f.id, f.id, 0, fromPin: 1), isTrue);
      final g1 = t.add(PartKind.gate, Offset.zero, gate: GateType.not), g2 = t.add(PartKind.gate, Offset.zero, gate: GateType.not);
      expect(t.connect(g1.id, g2.id, 0), isTrue);
      expect(t.connect(g2.id, g1.id, 0), isFalse);
    });

    test('the ripple and synchronous counters count 0 to 7 and round; the shift register shifts', () {
      for (final p in [LogicPreset.rippleCounter, LogicPreset.syncCounter]) {
        final c = logicPreset(p);
        final ffs = c.flipFlops;
        int count() => [for (final (i, f) in ffs.indexed) f.state ? 1 << i : 0].fold(0, (a, b) => a + b);
        final seen = <int>[];
        for (var i = 0; i < 9; i++) {
          seen.add(count());
          c
            ..tick()
            ..tick();
        }
        expect(seen, [0, 1, 2, 3, 4, 5, 6, 7, 0], reason: p.name);
        final disp = c.parts.firstWhere((x) => x.kind == PartKind.segment7);
        c
          ..tick()
          ..tick();
        expect(c.digitOf(disp, c.evaluate()), count());
      }
      final s = logicPreset(LogicPreset.shiftRegister);
      final din = s.inputs.firstWhere((p) => p.label == 'Din');
      din.value = true;
      s
        ..tick()
        ..tick();
      din.value = false;
      for (var i = 0; i < 2; i++) {
        s
          ..tick()
          ..tick();
      }
      expect([for (final f in s.flipFlops) f.state], [false, false, true, false]);
    });

    test('presets work: adders, MUX, DEMUX, decoder, encoder', () {
      List<List<bool>> outs(LogicPreset p) => [for (final r in logicPreset(p).truthTable(maxInputs: 6)) r.outs];
      // Half adder rows A B: S C.
      expect(outs(LogicPreset.halfAdder), [
        [false, false],
        [true, false],
        [true, false],
        [false, true],
      ]);
      final fa = logicPreset(LogicPreset.fullAdder).truthTable();
      for (final (m, r) in fa.indexed) {
        final sum = [for (final b in r.ins) b ? 1 : 0].fold(0, (a, b) => a + b);
        expect(r.outs, [sum.isOdd, sum >= 2], reason: 'row $m');
        expect(m.bitLength <= 3, isTrue);
      }
      final mux = logicPreset(LogicPreset.mux4);
      for (final r in mux.truthTable(maxInputs: 6)) {
        final sel = (r.ins[4] ? 2 : 0) + (r.ins[5] ? 1 : 0);
        expect(r.outs.single, r.ins[sel]);
      }
      for (final r in logicPreset(LogicPreset.decoder2to4).truthTable()) {
        final n = (r.ins[0] ? 2 : 0) + (r.ins[1] ? 1 : 0);
        expect(r.outs, [for (var i = 0; i < 4; i++) i == n]);
      }
      for (final r in logicPreset(LogicPreset.demux4).truthTable()) {
        final n = (r.ins[1] ? 2 : 0) + (r.ins[2] ? 1 : 0);
        expect(r.outs, [for (var i = 0; i < 4; i++) i == n && r.ins[0]]);
      }
      final enc = logicPreset(LogicPreset.encoder4to2);
      for (final r in enc.truthTable()) {
        final one = r.ins.indexWhere((b) => b);
        if (r.ins.where((b) => b).length == 1) expect(r.outs, [one >= 2, one.isOdd]);
      }
    });

    test('a circuit saves and loads with its wiring, states and gate sizes', () {
      final c = logicPreset(LogicPreset.syncCounter);
      c.tick();
      final back = LogicCircuit.fromJson(c.toJson());
      expect(back.parts.length, c.parts.length);
      expect(back.wires.length, c.wires.length);
      expect([for (final f in back.flipFlops) f.state], [for (final f in c.flipFlops) f.state]);
      final added = back.add(PartKind.input, Offset.zero);
      expect(c.part(added.id), isNull, reason: 'a new part never takes an old id');
      expect(LogicCircuit.fromJson(const {'parts': 'junk', 'wires': [1, 2]}).parts, isEmpty);
    });
  });

  group('Boolean algebra', () {
    test('K-map minimisation: textbook functions', () {
      // F(A,B,C,D) = Σm(0,1,2,5,8,9,10) = B'C' + B'D' + A'C'D
      final f = minimise(4, {0, 1, 2, 5, 8, 9, 10});
      expect(f.map((t) => t.term(['A', 'B', 'C', 'D'])).toSet(), {"B'C'", "B'D'", "A'C'D"});
      // Σm(1,3,7,11,15) + d(0,2,5) = A'B' + CD (or A'D + CD); two terms of two literals.
      final g = minimise(4, {1, 3, 7, 11, 15}, dontCares: {0, 2, 5});
      expect(g, hasLength(2));
      expect(g.every((t) => t.literals(4) == 2), isTrue);
      expect(sopText(minimise(2, {0, 1, 2, 3}), ['A', 'B']), '1');
      expect(sopText(minimise(3, {}), ['A', 'B', 'C']), '0');
      // XOR has no grouping: two minterms.
      expect(sopText(minimise(2, {1, 2}), ['A', 'B']), "A'B + AB'");
      expect(posText(2, {1, 2, 3}, ['A', 'B']), 'A + B');
    });

    test('minimised SOP always equals the function (every 3-variable function)', () {
      for (var f = 0; f < 256; f++) {
        final ms = {for (var m = 0; m < 8; m++) if ((f >> m) & 1 == 1) m};
        final terms = minimise(3, ms);
        for (var m = 0; m < 8; m++) {
          expect(terms.any((t) => t.covers(m)), ms.contains(m), reason: 'f=$f m=$m');
        }
        final pos = posText(3, ms, ['A', 'B', 'C']);
        final parsed = parseLogic(pos).expr;
        expect(exprTable(parsed, ['A', 'B', 'C']), [for (var m = 0; m < 8; m++) ms.contains(m)], reason: 'POS $pos');
      }
    });

    test('K-map cells are in Gray code order', () {
      expect(kmapShape(4), (4, 4));
      expect(kmapShape(3), (2, 4));
      expect([for (var c = 0; c < 4; c++) kmapMinterm(3, 1, c)], [4, 5, 7, 6]);
      expect([for (var r = 0; r < 4; r++) kmapMinterm(4, r, 0)], [0, 4, 12, 8]);
      expect(kmapLabels(2), ['00', '01', '11', '10']);
    });

    test('expression → circuit → truth table round trip', () {
      for (final text in ["F = AB + A'C", "(A + B)'C ⊕ D", '!A & (B | C)', "A'B'C' + ABC", 'A ^ B ^ C', 'A·1 + 0', "((A+B)(C+D))'", 'A1 B2 + C']) {
        final p = parseLogic(text);
        final vars = p.expr.variables..sort();
        final c = circuitFromExpr(p.expr, vars: vars, output: p.output ?? 'Q1');
        final table = c.truthTable(maxInputs: 6);
        expect([for (final r in table) r.outs.single], exprTable(p.expr, vars), reason: text);
        // The circuit's own expression reads back to the same function.
        final back = c.expressionOf(c.leds.single.id);
        expect(exprTable(parseLogic('$back').expr, vars), exprTable(p.expr, vars), reason: '$text -> $back');
        // And the minimised SOP of the table does too.
        final sop = sopText(minimise(vars.length, c.mintermsOf(c.leds.single)), vars, allOnes: c.mintermsOf(c.leds.single).length == 1 << vars.length);
        expect(exprTable(parseLogic(sop).expr, vars), exprTable(p.expr, vars), reason: 'SOP $sop');
      }
      expect(parseLogic('F = AB').output, 'F');
      expect(() => parseLogic('A + '), throwsFormatException);
      expect(() => parseLogic('A + (B'), throwsFormatException);
      expect(() => parseLogic('A # B'), throwsFormatException);
    });

    test('a 9-input AND is built from two gates', () {
      final e = parseLogic('ABCDEFGHI').expr;
      final c = circuitFromExpr(e);
      expect(c.parts.where((p) => p.kind == PartKind.gate), hasLength(2));
      final ins = c.inputs;
      for (final p in ins) {
        p.value = true;
      }
      expect(c.evaluate()[c.leds.single.id], isTrue);
      ins.first.value = false;
      expect(c.evaluate()[c.leds.single.id], isFalse);
    });
  });

  group('timing', () {
    test('a simulated counter gives a clock row, Q rows and a count bus; the circuit is left alone', () {
      final c = logicPreset(LogicPreset.rippleCounter);
      final d = simulateTiming(c, cycles: 8);
      expect(d.steps, 16);
      expect(d.signals.first.name, 'CLK');
      expect(d.signals.first.values.take(4), ['0', '1', '0', '1']);
      final q0 = d.signals.firstWhere((s) => s.name == 'FF0.Q');
      expect(q0.values.take(6), ['0', '1', '1', '0', '0', '1']);
      final count = d.signals.last;
      expect(count.bus, isTrue);
      expect([for (var i = 1; i < 16; i += 2) count.values[i]], ['1', '2', '3', '4', '5', '6', '7', '0']);
      expect(c.flipFlops.every((f) => !f.state), isTrue);
    });

    test('the manual diagram cycles levels, keeps rows the right length and saves', () {
      final d = TimingDiagram(steps: 4, signals: [TimingDiagram.clock('CLK', 4), TimingSignal(name: 'DATA', bus: true, values: ['A0'])]);
      expect(d.signals[1].values, ['A0', 'A0', 'A0', 'A0']);
      d.cycle(0, 0);
      expect(d.signals[0].values[0], '1');
      d
        ..cycle(0, 0)
        ..cycle(0, 0);
      expect(d.signals[0].values[0], 'z');
      d.setSteps(6);
      expect(d.signals.every((s) => s.values.length == 6), isTrue);
      d.markers.add((at: 2, label: 't1'));
      final back = TimingDiagram.fromJson(d.toJson());
      expect(back.toJson(), d.toJson());
      expect(TimingDiagram.runs(back.signals[1]), [(0, 6, 'A0')]);
    });
  });

  group('signals', () {
    test('the radix-2 FFT matches the DFT', () {
      final rnd = math.Random(7);
      for (final n in [2, 8, 64, 256]) {
        final re = [for (var i = 0; i < n; i++) rnd.nextDouble() * 2 - 1], im = [for (var i = 0; i < n; i++) rnd.nextDouble() * 2 - 1];
        final (dr, di) = dft(re, im);
        final fr = [...re], fi = [...im];
        fft(fr, fi);
        for (var k = 0; k < n; k++) {
          expect(fr[k], closeTo(dr[k], 1e-9), reason: 'n=$n k=$k');
          expect(fi[k], closeTo(di[k], 1e-9));
        }
      }
      expect(() => fft([1, 2, 3], [0, 0, 0]), throwsArgumentError);
    });

    test('a bin-centred sine shows its amplitude at its frequency; Hann leaks less than rectangular', () {
      const s = SignalPanel(f1: 8, a1: 2, fs: 128, n: 128);
      final spec = s.spectrum();
      final peak = spec.reduce((a, b) => a.mag > b.mag ? a : b);
      expect(peak.f, 8);
      expect(peak.mag, closeTo(2, 1e-9));
      expect(peak.phase, closeTo(-90, 1e-6), reason: 'a sine is a cosine 90° late');
      // Off-bin: leakage far from the tone.
      double far(WindowKind w) => s.copyWith(f1: 8.5, window: w).spectrum().where((b) => (b.f - 8.5).abs() > 10).map((b) => b.mag).reduce(math.max);
      expect(far(WindowKind.hann), lessThan(far(WindowKind.rectangular) / 10));
      for (final w in WindowKind.values) {
        expect(s.copyWith(window: w).spectrum().map((b) => b.mag).reduce(math.max), closeTo(2, 0.02), reason: w.name);
      }
    });

    test('sampling below Nyquist aliases: 90 Hz at 100 Hz shows at 10 Hz', () {
      const s = SignalPanel(f1: 90, fs: 100, n: 128);
      expect(s.aliased, [90]);
      expect(s.aliasOf(90), closeTo(10, 1e-9));
      expect(aliasFrequency(130, 100), closeTo(30, 1e-9));
      final spec = SignalPanel(f1: 90, fs: 128, n: 128).spectrum();
      expect(spec.reduce((a, b) => a.mag > b.mag ? a : b).f, closeTo(38, 1e-9));
      // AM has carrier and side bands; the round trip keeps every field.
      const am = SignalPanel(kind: SignalKind.am, fc: 32, fm: 4, m: 0.5, fs: 128, n: 128);
      final bins = {for (final b in am.spectrum()) if (b.mag > 0.1) b.f};
      expect(bins, {28.0, 32.0, 36.0});
      expect(SignalPanel.fromJson(am.toJson()).toJson(), am.toJson());
      expect(const SignalPanel(kind: SignalKind.noise, a1: 1).samples(), const SignalPanel(kind: SignalKind.noise, a1: 1).samples(), reason: 'the same seed, the same noise');
    });
  });

  group('Bode', () {
    test('first and second-order filters at the corner: −3 dB and −45° / −90°', () {
      const lp = BodePanel(filter: FilterKind.lowPass1, fc: 1000);
      final wc = 2 * math.pi * 1000;
      expect(lp.magDb(wc), closeTo(-3.0103, 1e-3));
      expect(lp.phaseDeg(wc), closeTo(-45, 1e-9));
      expect(lp.magDb(wc / 1000), closeTo(0, 1e-5));
      expect(lp.asymDb(wc * 10), closeTo(-20, 1e-9));
      expect(lp.asymPhase(wc), closeTo(-45, 1e-9));
      expect(lp.asymPhase(wc * 100), closeTo(-90, 1e-9));
      const hp = BodePanel(filter: FilterKind.highPass1, fc: 50);
      expect(hp.magDb(2 * math.pi * 50), closeTo(-3.0103, 1e-3));
      expect(hp.phaseDeg(2 * math.pi * 50), closeTo(45, 1e-9));
      const lp2 = BodePanel(filter: FilterKind.lowPass2, fc: 100, zeta: 1 / math.sqrt2);
      expect(lp2.magDb(2 * math.pi * 100), closeTo(-3.0103, 1e-3));
      expect(lp2.phaseDeg(2 * math.pi * 100), closeTo(-90, 1e-6));
      expect(lp2.asymDb(2 * math.pi * 1000), closeTo(-40, 1e-6));
      const bp = BodePanel(filter: FilterKind.bandPass2, fc: 100, zeta: 0.1, k: 2);
      expect(bp.magDb(2 * math.pi * 100), closeTo(20 * math.log(2) / math.ln10, 1e-6));
      expect(bp.phaseDeg(2 * math.pi * 100), closeTo(0, 1e-6));
      // ζ ≥ 1: two real poles.
      expect(const BodePanel(filter: FilterKind.lowPass2, zeta: 2).tf.poles.every((p) => p.im == 0), isTrue);
    });

    test('poles and zeros: K(s+10)/(s(s+100)) and roots as written', () {
      final b = BodePanel(mode: BodeMode.polesZeros, k: 100, zeros: parseRoots('-10'), poles: parseRoots('0, -100'));
      // Low frequency: an integrator, −20 dB/dec through 10 (K·10/100 = 10 → 20 dB at ω = 1).
      expect(b.asymDb(1), closeTo(20, 1e-9));
      expect(b.magDb(1), closeTo(20, 0.1));
      expect(b.phaseDeg(1e-3), closeTo(-90, 0.01));
      expect(b.corners, [10, 100]);
      final (lo, hi) = b.range;
      expect(lo, 1);
      expect(hi, 1000);
      expect(parseRoots('-2±3j'), [const Cplx(-2, 3), const Cplx(-2, -3)]);
      expect(parseRoots('-1+2j, -5'), [const Cplx(-1, 2), const Cplx(-1, -2), const Cplx(-5)]);
      expect(rootsText(parseRoots('-2±3j, -5')), '-2±3j, -5');
      expect(() => parseRoots('abc'), throwsFormatException);
      expect(BodePanel.fromJson(b.toJson()).toJson(), b.toJson());
      expect(b.sweep(points: 50), hasLength(50));
    });
  });

  group('pinouts', () {
    test('every chip has its pin count, unique numbers 1..n, names and types', () {
      const counts = {'at89c51': 40, 'atmega328p': 28, 'esp32-devkitc': 38, 'stm32-bluepill': 40, 'pic16f877a': 40};
      expect(mcuChips.map((c) => c.id).toSet(), counts.keys.toSet());
      for (final c in mcuChips) {
        expect(c.pins, hasLength(counts[c.id]), reason: c.id);
        expect(c.pins.map((p) => p.number).toList(), [for (var i = 1; i <= counts[c.id]!; i++) i], reason: c.id);
        for (final p in c.pins) {
          expect(p.name, isNotEmpty);
          expect(p.functions, isNotEmpty, reason: '${c.id} ${p.number}');
          expect(p.types, isNotEmpty);
        }
        expect(c.pins.any((p) => p.primary == PinType.ground), isTrue, reason: c.id);
        expect(c.pins.any((p) => p.types.contains(PinType.power)), isTrue, reason: c.id);
        expect(c.note, contains('datasheet'));
      }
      final m = mcuChip('at89c51')!;
      expect((m.pin(20)!.name, m.pin(40)!.name, m.pin(9)!.name, m.pin(31)!.name), ('GND', 'VCC', 'RST', "EA'/VPP"));
      expect(m.pin(10)!.types, contains(PinType.uart));
      final uno = mcuChip('atmega328p')!;
      expect(uno.pins.where((p) => p.types.contains(PinType.pwm)).map((p) => p.functions.first.split(' ').first).toSet(), {'D3', 'D5', 'D6', 'D9', 'D10', 'D11'});
      expect(uno.pins.where((p) => p.types.contains(PinType.adc)), hasLength(6));
      expect(mcuChip('pic16f877a')!.pins.where((p) => p.functions.any((f) => f.startsWith('AN'))), hasLength(8));
    });

    test('search and type filter; geometry puts a DIP\'s pin 1 top left and pin n top right', () {
      const p = McuPinout(chip: 'esp32-devkitc', query: 'uart');
      final chip = p.device;
      expect(chip.pins.where(p.shows).map((x) => x.name), containsAll(['GPIO1', 'GPIO3']));
      final f = p.copyWith(query: '', filter: () => PinType.i2c);
      expect(chip.pins.where(f.shows).map((x) => x.name).toSet(), {'GPIO21', 'GPIO22'});
      const size = Size(1240, 1100);
      final dip = mcuChip('at89c51')!;
      final g = pinoutGeometry(dip, size);
      expect(g.pins[1]!.top, g.pins[40]!.top);
      expect(g.pins[1]!.left, lessThan(g.body.left));
      expect(g.pins[20]!.top, g.pins[21]!.top);
      expect(pinoutHit(dip, size, g.pins[12]!.center), 12);
      expect(pinoutHit(dip, size, g.body.center), isNull);
      final board = pinoutGeometry(chip, size);
      expect(board.pins[1]!.top, board.pins[20]!.top, reason: 'a dev board header reads down both sides');
      expect(McuPinout.fromJson(f.copyWith(selected: () => 5).toJson()).selected, 5);
    });
  });

  test('every new panel paints, at its natural size, and round-trips through the page', () {
    final panels = {
      KitKind.logicCircuit: logicPreset(LogicPreset.fullAdder).toJson(),
      KitKind.timing: simulateTiming(logicPreset(LogicPreset.syncCounter)).toJson(),
      KitKind.signal: const SignalPanel(kind: SignalKind.fm, showPhase: true).toJson(),
      KitKind.bode: const BodePanel(filter: FilterKind.bandPass2, zeta: 0.2).toJson(),
      KitKind.pinout: const McuPinout(chip: 'stm32-bluepill', selected: 6, filter: PinType.uart).toJson(),
    };
    for (final MapEntry(key: k, value: data) in panels.entries) {
      final e = KitElement.sized(kind: k, data: data, color: const Color(0xFF00658E));
      final rec = PictureRecorder();
      paintKit(Canvas(rec), e);
      rec.endRecording().dispose();
      final back = decodeElement(jsonDecode(jsonEncode(encodeElement(e))) as Map<String, dynamic>, e.id);
      expect(back, isA<KitElement>(), reason: k.name);
      expect((back! as KitElement).kind, k);
    }
  });
}
