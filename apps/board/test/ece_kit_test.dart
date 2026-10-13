import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/features/board/kit/college/biz/kit_editors.dart';
import 'package:kinetix_board/features/board/kit/ece/ece_kit.dart';
import 'package:kinetix_board/features/board/kit/ece/ece_samples.dart';
import 'package:kinetix_board/features/board/kit/ece/ece_strings.dart';
import 'package:kinetix_board/features/curriculum/curriculum_registry.dart';
import 'package:kinetix_board/features/logic_gates/logic_gates_lab.dart';
import 'package:kinetix_board/l10n/l10n.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/panel_harness.dart';

const accent = Color(0xFF00658E);

/// The electronics and communication kit: the logic builder's new parts (multi-input gates,
/// flip-flops, presets, expressions, K-map, timing), the kit's live panels and where the
/// registry puts them.
void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('Hindi and Kannada have every English key; every sample is named', () {
    for (final table in [eceStringTable, logicStringTable]) {
      final en = table['en']!.keys.toSet();
      for (final lang in ['hi', 'kn']) {
        expect(table[lang]!.keys.toSet(), en, reason: lang);
        for (final v in table[lang]!.values) {
          expect(v.trim(), isNotEmpty);
        }
      }
    }
    final en = eceStringTable['en']!.keys.toSet();
    for (final k in [...TimingSample.values.map((t) => 'timing.${t.name}'), ...SignalSample.values.map((x) => 'signal.${x.name}'), ...BodeSample.values.map((b) => 'bode.${b.name}')]) {
      expect(en, contains(k));
    }
    for (final k in eceKinds) {
      expect(isEceKit(k), isTrue);
    }
    for (final t in TimingSample.values) {
      final d = sampleTiming(t);
      expect(d.signals, isNotEmpty, reason: t.name);
      expect(d.signals.every((s) => s.values.length == d.steps), isTrue, reason: t.name);
    }
    expect(sampleSignal(SignalSample.alias).aliased, isNotEmpty);
    expect(sampleSignal(SignalSample.sine).aliased, isEmpty);
  });

  test('registry: signal plotter and MCU pins are built (no "soon" left); ECE, CS and Class 12 use the kit', () {
    for (final id in ['signal-plotter', 'mcu-pins']) {
      expect(CurriculumRegistry.upcoming, isNot(contains(id)));
    }
    final all = [for (final l in CurriculumRegistry.levels) for (final s in l.subjects) ...s.features];
    expect(all.where((f) => f == 'soon:signal-plotter' || f == 'soon:mcu-pins'), isEmpty);
    List<String> f(String id) => CurriculumRegistry.choice(id)!.subject.features;
    final ece = CurriculumRegistry.level('be-ece')!.subjects.map((s) => s.id).toSet();
    expect(ece, containsAll(['digital-electronics', 'signals-systems', 'analog-communication', 'digital-communication', 'dsp', 'control-systems', 'microcontrollers', 'embedded-systems', 'vlsi']));
    expect(f('be-ece/digital-electronics'), containsAll(['tool:logic-gates', 'tool:timing-diagram']));
    expect(f('be-ece/signals-systems'), containsAll(['tool:signal-plotter', 'tool:bode-plot']));
    expect(f('be-ece/dsp'), contains('tool:signal-plotter'));
    expect(f('be-ece/control-systems'), contains('tool:bode-plot'));
    expect(f('be-ece/microcontrollers'), contains('tool:mcu-pins'));
    expect(f('be-ece/vlsi'), containsAll(['tool:logic-gates', 'tool:timing-diagram']));
    expect(f('be-cse/digital-logic'), containsAll(['tool:logic-gates', 'tool:timing-diagram']));
    expect(f('be-eee/control-systems'), containsAll(['tool:bode-plot', 'tool:signal-plotter']));
    expect(f('class-12/physics'), contains('tool:logic-gates'));
    expect(CurriculumRegistry.choice('class-12/physics')!.toolbar, ['physics-formulas', 'circuit']);
  });

  group('logic builder', () {
    Future<void> tap(WidgetTester tester, String key) async {
      await tester.ensureVisible(find.byKey(Key(key)));
      await tester.tap(find.byKey(Key(key)));
      await tester.pumpAndSettle();
    }

    testWidgets('a ready full adder: truth table, minimal SOP and K-map; the circuit and timing go on the board', (tester) async {
      final c = LogicCircuit();
      final wb = WhiteboardController();
      addTearDown(wb.dispose);
      await pumpPanel(tester, LogicGatesLab(wb: wb, circuit: c));
      await tap(tester, 'lg-presets');
      await tap(tester, 'lg-preset-fullAdder');
      expect(c.inputs.map((p) => p.label), ['A', 'B', 'Cin']);
      await tap(tester, 'lg-algebra');
      expect(find.byKey(const Key('lg-kmap')), findsOneWidget);
      // S is odd parity: no groups bigger than one cell.
      final sop = tester.widget<Text>(find.byKey(const Key('lg-expr-sop'))).textSpan!.toPlainText();
      expect(sop, contains("A'·B'·Cin"));
      await tap(tester, 'lg-out-1');
      final cout = tester.widget<Text>(find.byKey(const Key('lg-expr-sop'))).textSpan!.toPlainText();
      expect(cout, 'Minimal SOP:  Cout = B·Cin + A·Cin + A·B');
      await tap(tester, 'lg-circuit-to-board');
      await tap(tester, 'lg-timing');
      expect(find.byKey(const Key('lg-timing-view')), findsOneWidget);
      await tap(tester, 'lg-timing-to-board');
      expect([for (final e in wb.elements.whereType<KitElement>()) e.kind], [KitKind.logicCircuit, KitKind.timing]);
    });

    testWidgets('type an expression to build it; grow a gate; add a flip-flop and clock it', (tester) async {
      final c = LogicCircuit();
      await pumpPanel(tester, LogicGatesLab(wb: WhiteboardController(), circuit: c));
      await tester.enterText(find.byKey(const Key('lg-expr')), "F = AB' + C");
      await tap(tester, 'lg-build');
      expect(c.leds.single.label, 'F');
      expect([for (final r in c.truthTable()) r.outs.single], [false, true, false, true, true, true, false, true]);
      await tester.enterText(find.byKey(const Key('lg-expr')), 'A + (');
      await tap(tester, 'lg-build');
      expect(c.leds.single.label, 'F', reason: 'a bad expression leaves the circuit');
      await tap(tester, 'lg-clear');
      await tap(tester, 'lg-add-and');
      final and = c.parts.single;
      await tap(tester, 'lg-in-plus');
      await tap(tester, 'lg-in-plus');
      expect(and.inputCount, 4);
      await tap(tester, 'lg-in-minus');
      expect(and.inputCount, 3);
      await tap(tester, 'lg-add-ff');
      await tap(tester, 'lg-add-ff-t');
      expect(c.flipFlops.single.flipFlop, FlipFlopType.t);
      await tap(tester, 'lg-add-clock');
      await tap(tester, 'lg-add-seg');
      final ff = c.flipFlops.single, clk = c.parts.firstWhere((p) => p.kind == PartKind.clock);
      final one = c.add(PartKind.gate, const Offset(20, 400), gate: GateType.not);
      expect(c.connect(one.id, ff.id, 0), isTrue);
      // Drag the clock's output to the flip-flop's clock pin.
      final origin = tester.getTopLeft(find.byKey(const Key('lg-canvas')));
      await tester.dragFrom(origin + clk.outPin, ff.inPin(1) - clk.outPin);
      await tester.pump();
      expect(c.wires.where((w) => w.to == ff.id && w.pin == 1), hasLength(1));
      await tap(tester, 'lg-step');
      expect(ff.state, isTrue);
      await tap(tester, 'lg-reset');
      expect(ff.state, isFalse);
    });
  });

  group('kit panels', () {
    Future<WhiteboardController> pumpKit(WidgetTester tester, EceSection first) async {
      tester.view.physicalSize = const Size(1920, 1400);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final wb = WhiteboardController();
      addTearDown(wb.dispose);
      await tester.pumpWidget(
        MaterialApp(
          theme: KinetixTheme.light(),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: Scaffold(body: Align(alignment: Alignment.topRight, child: SizedBox(width: 420, child: EceKitPanel(wb: wb, accent: accent, first: first)))),
        ),
      );
      await tester.pump();
      return wb;
    }

    Future<void> tap(WidgetTester tester, Key key) async {
      await tester.ensureVisible(find.byKey(key));
      await tester.tap(find.byKey(key));
      await tester.pumpAndSettle();
    }

    testWidgets('a Bode plot: switch to poles and zeros, type them, the readout follows; it goes on the board', (tester) async {
      final wb = await pumpKit(tester, EceSection.bode);
      await tap(tester, const Key('ece-bode-lp1'));
      expect(find.byKey(const Key('ece-editor')), findsOneWidget);
      expect(find.textContaining('-3.01 dB'), findsOneWidget);
      expect(find.textContaining('-45.0°'), findsOneWidget);
      await tap(tester, const Key('bode-mode'));
      await tester.tap(find.text('Poles and zeros'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('bode-poles')), '-2±3j');
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('bode-poles')), 'nonsense');
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('bode-bad')), findsOneWidget);
      await tester.enterText(find.byKey(const Key('bode-poles')), '-10, -100');
      await tester.pumpAndSettle();
      await tap(tester, const Key('ece-done'));
      final k = wb.elements.whereType<KitElement>().single;
      expect(k.kind, KitKind.bode);
      expect(BodePanel.fromJson(k.data).poles, [const Cplx(-10), const Cplx(-100)]);
      expect(BodePanel.fromJson(k.data).mode, BodeMode.polesZeros);
    });

    testWidgets('a pin diagram: search, filter by type, tap a pin; it opens again in its editor', (tester) async {
      final wb = await pumpKit(tester, EceSection.pins);
      await tap(tester, const Key('ece-pins-at89c51'));
      await tester.enterText(find.byKey(const Key('pin-search')), 'serial');
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('pin-10')), findsOneWidget);
      expect(find.byKey(const Key('pin-20')), findsNothing);
      await tap(tester, const Key('pin-11'));
      expect(tester.widget<Text>(find.byKey(const Key('pin-detail'))).data, contains('TXD'));
      await tester.enterText(find.byKey(const Key('pin-search')), '');
      await tester.pumpAndSettle();
      await tap(tester, const Key('pin-type-power'));
      expect(find.byKey(const Key('pin-40')), findsOneWidget);
      expect(find.byKey(const Key('pin-1')), findsNothing);
      await tap(tester, const Key('ece-done'));
      final k = wb.elements.whereType<KitElement>().single;
      final m = McuPinout.fromJson(k.data);
      expect((m.chip, m.selected, m.filter), ('at89c51', 11, PinType.power));
      // Opened again (as a tap on the board panel would), changed, saved in place.
      final ctx = tester.element(find.byKey(const Key('ece-kit')));
      final edited = editKit(ctx, k);
      await tester.pumpAndSettle();
      await tap(tester, const Key('pin-chip'));
      await tester.tap(find.text('PIC16F877A').last);
      await tester.pumpAndSettle();
      await tap(tester, const Key('ece-done'));
      final back = await edited;
      expect(back!.id, k.id);
      expect(McuPinout.fromJson(back.data).chip, 'pic16f877a');
    });

    testWidgets('a timing diagram drawn by hand: tap steps, add a bus with a value and a marker', (tester) async {
      final wb = await pumpKit(tester, EceSection.timing);
      await tap(tester, const Key('ece-timing-blank'));
      await tap(tester, const Key('timing-add-bus'));
      await tester.enterText(find.byKey(const Key('timing-bus-value')), '0xFF');
      await tester.pumpAndSettle();
      await tap(tester, const Key('timing-marker'));
      // Tap row A (the second row), step 0: it goes 0 → 1.
      final preview = find.byKey(const Key('ece-preview'));
      final box = tester.getRect(preview);
      final natural = KitElement.naturalSizeOf(KitKind.timing);
      final g = timingGeometry(sampleTiming(TimingSample.blank)..signals.add(TimingSignal(name: 'BUS', bus: true)), natural);
      final k = box.width / natural.width;
      await tester.tapAt(box.topLeft + Offset(g.left + g.stepW * 0.5, g.top + g.rowH * 1.5) * k);
      await tester.pumpAndSettle();
      await tap(tester, const Key('ece-done'));
      final d = TimingDiagram.fromJson(wb.elements.whereType<KitElement>().single.data);
      expect(d.signals.map((s) => s.name), ['CLK', 'A', 'B', 'BUS']);
      expect(d.signals[1].values.first, '1');
      expect(d.signals[3].values.toSet(), {'0xFF'});
      expect(d.markers.single.at, 0);
    });

    testWidgets('a signal: the aliasing sample warns; a ready circuit opens in the full builder', (tester) async {
      final wb = await pumpKit(tester, EceSection.signal);
      await tap(tester, const Key('ece-signal-alias'));
      final note = tester.widget<Text>(find.byKey(const Key('sig-alias-note')));
      expect(note.style?.color, isNotNull);
      await tap(tester, const Key('ece-done'));
      await tap(tester, const Key('ece-preset-halfAdder'));
      expect(find.byKey(const Key('logic-gates')), findsOneWidget);
      await tap(tester, const Key('ece-done'));
      expect([for (final e in wb.elements.whereType<KitElement>()) e.kind], [KitKind.signal, KitKind.logicCircuit]);
      expect(LogicCircuit.fromJson(wb.elements.whereType<KitElement>().last.data).leds.map((l) => l.label), ['S', 'C']);
    });
  });
}
