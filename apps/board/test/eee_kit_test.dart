import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_3d/kinetix_3d.dart' show ModelCatalogue;
import 'package:kinetix_board/features/board/kit/college/biz/kit_editors.dart';
import 'package:kinetix_board/features/board/kit/eee/eee_kit.dart';
import 'package:kinetix_board/features/board/kit/eee/eee_samples.dart';
import 'package:kinetix_board/features/board/kit/eee/eee_strings.dart';
import 'package:kinetix_board/features/board/kit/eee/eee_symbols.dart';
import 'package:kinetix_board/features/curriculum/curriculum_registry.dart';
import 'package:kinetix_board/l10n/l10n.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

const accent = Color(0xFF6D3FB5);

/// The electrical engineering kit: circuit symbols, RLC and phasors, three-phase, single-line
/// diagram with per unit and fault level, waveform generator, machine models, and where the
/// registry puts them.
void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('Hindi and Kannada have every English key; every symbol and sample is named', () {
    final en = eeeStringTable['en']!.keys.toSet();
    for (final lang in ['hi', 'kn']) {
      expect(eeeStringTable[lang]!.keys.toSet(), en, reason: lang);
      for (final v in eeeStringTable[lang]!.values) {
        expect(v.trim(), isNotEmpty);
      }
    }
    for (final s in EeeSymbol.values) {
      expect(en, contains('sym.${s.name}'));
      expect(eeeSymbol(s, Colors.black), isNotEmpty, reason: s.name);
    }
    for (final k in [...RlcSample.values.map((r) => 'rlc.${r.name}'), ...SldSample.values.map((d) => 'sld.${d.name}'), ...WaveSample.values.map((w) => 'wave.${w.name}'), ...eeeModels.keys]) {
      expect(en, contains(k));
    }
  });

  test('the samples work out: series RLC lags, resonance at 50 Hz, the radial fault level is 208.5 MVA', () {
    expect(sampleRlc(RlcSample.series).solve().lagging, isTrue);
    expect(sampleRlc(RlcSample.rc).solve().leading, isTrue);
    expect(sampleRlc(RlcSample.resonance).resonance, closeTo(50, 0.01));
    expect(sampleSld(SldSample.radial).fault()!.mva, closeTo(208.5, 0.1));
    expect(sampleSld(SldSample.parallelGenerators).fault(), isNotNull);
    expect(sampleSld(SldSample.blank).fault(), isNull);
    for (final w in WaveSample.values) {
      expect(sampleWave(w).stats().rms, greaterThan(0), reason: w.name);
    }
    for (final id in eeeModels.values) {
      expect(ModelCatalogue.byId(id), isNotNull, reason: id);
    }
    for (final k in eeeKinds) {
      expect(isEeeKit(k), isTrue);
    }
  });

  test('registry: the three kits are built (no "soon" left), EEE and M.Tech Power Systems use them, Class 12 physics gets phasors and waveforms', () {
    for (final id in ['phasor', 'single-line-diagram', 'waveform-gen']) {
      expect(CurriculumRegistry.upcoming, isNot(contains(id)));
    }
    final all = [for (final l in CurriculumRegistry.levels) for (final s in l.subjects) ...s.features];
    expect(all.where((f) => f == 'soon:phasor' || f == 'soon:single-line-diagram' || f == 'soon:waveform-gen'), isEmpty);
    List<String> f(String id) => CurriculumRegistry.choice(id)!.subject.features;
    final eee = CurriculumRegistry.level('be-eee')!.subjects.map((s) => s.id).toSet();
    expect(eee, containsAll(['circuit-analysis', 'network-analysis', 'electrical-machines-1', 'electrical-machines-2', 'power-systems', 'power-systems-2', 'power-electronics', 'measurements']));
    expect(f('be-eee/circuit-analysis'), containsAll(['tool:phasor', 'tool:circuit']));
    expect(f('be-eee/electrical-machines-1'), containsAll(['model:dc_machine', 'model:transformer_1ph', 'model:transformer_3ph']));
    expect(f('be-eee/electrical-machines-2'), containsAll(['model:induction_motor', 'model:alternator']));
    expect(f('be-eee/power-systems'), contains('tool:single-line-diagram'));
    expect(f('be-eee/power-electronics'), contains('tool:waveform-gen'));
    expect(f('be-eee/basic-electrical'), containsAll(['tool:phasor', 'tool:waveform-gen']));
    expect(f('mtech-power/power-system-analysis'), containsAll(['tool:single-line-diagram', 'tool:phasor']));
    expect(f('mtech-power/protection'), containsAll(['tool:single-line-diagram', 'tool:waveform-gen']));
    expect(f('class-12/physics'), containsAll(['tool:phasor', 'tool:waveform-gen']));
    expect(f('class-11/physics'), isNot(contains('tool:phasor')));
    // The physics toolbar stays as it was (formulas and circuits first).
    expect(CurriculumRegistry.choice('class-12/physics')!.toolbar, ['physics-formulas', 'circuit']);
  });

  group('on the board', () {
    Future<WhiteboardController> pumpKit(WidgetTester tester, {EeeSection first = EeeSection.rlc, ValueChanged<String>? onOpenModel}) async {
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
          home: Scaffold(
            body: Align(alignment: Alignment.topRight, child: SizedBox(width: 420, child: EeeKitPanel(wb: wb, accent: accent, ink: Colors.black, first: first, onOpenModel: onOpenModel))),
          ),
        ),
      );
      await tester.pump();
      return wb;
    }

    Future<void> tap(WidgetTester tester, Key key) async {
      await tester.scrollUntilVisible(find.byKey(key), 200, scrollable: find.descendant(of: find.byKey(const Key('eee-kit')), matching: find.byType(Scrollable)).first);
      await tester.tap(find.byKey(key));
      await tester.pumpAndSettle();
    }

    Future<void> done(WidgetTester tester) async {
      await tester.ensureVisible(find.byKey(const Key('eee-done')));
      await tester.tap(find.byKey(const Key('eee-done')));
      await tester.pumpAndSettle();
    }

    Future<void> pick(WidgetTester tester, Key dropdown, String item) async {
      await tester.ensureVisible(find.byKey(dropdown));
      await tester.tap(find.byKey(dropdown));
      await tester.pumpAndSettle();
      await tester.tap(find.text(item).last);
      await tester.pumpAndSettle();
    }

    testWidgets('circuit symbols go on the board as ordinary elements', (tester) async {
      final wb = await pumpKit(tester, first: EeeSection.symbols);
      Future<void> chip(String key) async {
        await tester.ensureVisible(find.byKey(Key(key)));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(Key(key)));
        await tester.pumpAndSettle();
      }

      await chip('eee-sym-transformer');
      expect(wb.elements, isNotEmpty);
      final n = wb.elements.length;
      await chip('eee-sym-circuitBreaker');
      await chip('eee-sym-resistor');
      expect(wb.elements.length, greaterThan(n));
      expect(wb.elements.whereType<KitElement>(), isEmpty);
    });

    testWidgets('RLC: values changed live, parallel, resonance, animated phasors; then on the board', (tester) async {
      final wb = await pumpKit(tester);
      await tap(tester, const Key('eee-rlc-series'));
      expect(find.byKey(const Key('eee-editor')), findsOneWidget);
      // R = 10 Ω: |Z| and pf follow the formula.
      await tester.enterText(find.byKey(const Key('rlc-r')), '10');
      await tester.pump();
      final w = 2 * math.pi * 50;
      final z = math.sqrt(100 + math.pow(w * 0.15 - 1 / (w * 100e-6), 2));
      expect(find.textContaining('|Z| = ${eeeNum(z)} Ω'), findsOneWidget);
      expect(find.textContaining('pf = ${(10 / z).toStringAsFixed(3)}'), findsOneWidget);
      // To resonance: unity power factor.
      await tester.ensureVisible(find.byKey(const Key('rlc-at-resonance')));
      await tester.tap(find.byKey(const Key('rlc-at-resonance')));
      await tester.pump();
      expect(find.textContaining('pf = 1.000'), findsOneWidget);
      // Animate: the phasors turn.
      await tester.ensureVisible(find.byKey(const Key('eee-animate')));
      await tester.tap(find.byKey(const Key('eee-animate')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pump(const Duration(milliseconds: 500));
      await tester.tap(find.byKey(const Key('eee-animate')));
      await tester.pump();
      await pick(tester, const Key('rlc-topology'), eeeStringTable['en']!['parallel']!);
      await done(tester);
      final k = wb.elements.whereType<KitElement>().single;
      expect(k.kind, KitKind.rlc);
      final c = RlcCircuit.fromJson(k.data);
      expect(c.topology, RlcTopology.parallel);
      expect(c.r, 10);
      expect(c.f, closeTo(41.09, 0.01));
      expect(c.wt, greaterThan(0));
      expect(tester.takeException(), isNull);
    });

    testWidgets('three-phase: delta, line current √3 × phase current', (tester) async {
      final wb = await pumpKit(tester, first: EeeSection.threePhase);
      await tap(tester, const Key('eee-three-star'));
      await pick(tester, const Key('three-conn'), eeeStringTable['en']!['delta']!);
      await tester.enterText(find.byKey(const Key('three-z')), '30');
      await tester.pump();
      expect(find.textContaining('I_L = ${eeeNum(math.sqrt(3) * 415 / 30)} A'), findsOneWidget);
      await done(tester);
      final m = ThreePhase.fromJson(wb.elements.whereType<KitElement>().single.data);
      expect(m.connection, ThreePhaseConnection.delta);
      expect(m.iLine, closeTo(math.sqrt(3) * 415 / 30, 1e-9));
    });

    testWidgets('single-line diagram: fault level, an element added, a breaker opened, per-unit calculator', (tester) async {
      final wb = await pumpKit(tester, first: EeeSection.singleLine);
      await tap(tester, const Key('eee-sld-radial'));
      expect(find.textContaining('${eeeNum(100 / (0.25 + 40 * 100 / (132 * 132)))} MVA'), findsWidgets);
      // A second generator on bus 1 raises the fault level.
      await tester.ensureVisible(find.byKey(const Key('sld-add-generator')));
      await tester.tap(find.byKey(const Key('sld-add-generator')));
      await tester.pump();
      final two = sampleSld(SldSample.radial).copyWith(elements: [...sampleSld(SldSample.radial).elements, const SldElement(SldKind.generator, 'G2', a: 0, mva: 100, kv: 11, x: 0.15)]);
      expect(find.textContaining('${eeeNum(two.fault()!.mva)} MVA'), findsWidgets);
      // Opening CB1 cuts bus 3 off.
      await tester.ensureVisible(find.byKey(const Key('sld-el-closed-1')));
      await tester.tap(find.byKey(const Key('sld-el-closed-1')));
      await tester.pump();
      expect(find.text(eeeStringTable['en']!['noFault']!), findsOneWidget);
      // Per unit: 0.2 pu on 50 MVA → 100 MVA: 0.4 pu.
      await tester.ensureVisible(find.byKey(const Key('pu-result')));
      String pu() => tester.widget<Text>(find.byKey(const Key('pu-result'))).data!;
      expect(pu(), endsWith('= 0.4000 pu'));
      await tester.enterText(find.byKey(const Key('pu-kv-new')), '22');
      await tester.pump();
      expect(pu(), endsWith('= 0.1000 pu'));
      await done(tester);
      final d = SingleLineDiagram.fromJson(wb.elements.whereType<KitElement>().single.data);
      expect(d.elements.where((e) => e.kind == SldKind.generator), hasLength(2));
      expect(d.elements[1].closed, isFalse);
      expect(tester.takeException(), isNull);
    });

    testWidgets('single-line diagram: a dragged load snaps to the nearest bus', (tester) async {
      final wb = await pumpKit(tester, first: EeeSection.singleLine);
      await tap(tester, const Key('eee-sld-radial'));
      final preview = find.byKey(const Key('eee-preview'));
      final box = tester.getRect(preview);
      final natural = KitElement.naturalSizeOf(KitKind.singleLine);
      final k = box.width / natural.width;
      final d = sampleSld(SldSample.radial);
      final f = SldFrame(natural);
      final load = d.elements.indexWhere((e) => e.kind == SldKind.load);
      final from = box.topLeft + f.centre(d, d.elements[load]) * k;
      // Drop it just left of bus 2.
      final to = box.topLeft + Offset(f.busX(d.buses[1].x) - 60, f.y(0.8)) * k;
      final g = await tester.startGesture(from);
      await g.moveTo(from + const Offset(-5, 0));
      await g.moveTo(to);
      await g.up();
      await tester.pump();
      await done(tester);
      final e = SingleLineDiagram.fromJson(wb.elements.whereType<KitElement>().single.data).elements[load];
      expect(e.a, 1);
      expect(e.side, -1);
      expect(e.y, closeTo(0.8, 0.05));
    });

    testWidgets('waveforms: PWM duty, superposition and harmonics', (tester) async {
      final wb = await pumpKit(tester, first: EeeSection.waveform);
      await tap(tester, const Key('eee-wave-square'));
      // Square of 10 V: RMS = average = peak = 10, form factor 1.
      expect(find.textContaining('RMS = 10 '), findsOneWidget);
      expect(find.textContaining('FF = 1.000'), findsOneWidget);
      await pick(tester, const Key('wave-a-kind'), eeeStringTable['en']!['pwm']!);
      await tester.enterText(find.byKey(const Key('wave-a-duty')), '25');
      await tester.pump();
      // PWM 0–10 V at 25 %: RMS = 10√0.25 = 5, form factor 2.
      expect(find.textContaining('RMS = 5 '), findsOneWidget);
      expect(find.textContaining('FF = 2.000'), findsOneWidget);
      await tester.ensureVisible(find.byKey(const Key('wave-harm')));
      await tester.tap(find.byKey(const Key('wave-harm')));
      await tester.pump();
      await tester.ensureVisible(find.byKey(const Key('wave-sum')));
      await tester.tap(find.byKey(const Key('wave-sum')));
      await tester.pump();
      expect(find.byKey(const Key('wave-b-kind')), findsOneWidget);
      await done(tester);
      final m = WaveformPanel.fromJson(wb.elements.whereType<KitElement>().single.data);
      expect(m.a.kind, WaveKind.pwm);
      expect(m.a.duty, 0.25);
      expect(m.harmonics, isTrue);
      expect(m.superpose, isTrue);
      expect(tester.takeException(), isNull);
    });

    testWidgets('an electrical panel on the board opens again in its editor (editKit)', (tester) async {
      tester.view.physicalSize = const Size(1920, 1400);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final e = eeePanel(KitKind.waveform, sampleWave(WaveSample.sine).toJson(), accent);
      KitElement? back;
      await tester.pumpWidget(
        MaterialApp(
          theme: KinetixTheme.light(),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: Scaffold(body: Builder(builder: (context) => TextButton(key: const Key('go'), onPressed: () async => back = await editKit(context, e), child: const Text('go')))),
        ),
      );
      await tester.tap(find.byKey(const Key('go')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('eee-editor')), findsOneWidget);
      await tester.enterText(find.byKey(const Key('wave-a-offset')), '5');
      await tester.pump();
      await done(tester);
      expect(back!.id, e.id);
      final s = WaveformPanel.fromJson(back!.data).stats();
      expect(s.mean, closeTo(5, 1e-3));
    });

    testWidgets('each machine model opens in the 3D viewer', (tester) async {
      final opened = <String>[];
      await pumpKit(tester, first: EeeSection.models, onOpenModel: opened.add);
      for (final m in eeeModels.keys) {
        await tap(tester, Key('eee-model-$m'));
      }
      expect(opened, eeeModels.values.toList());
    });
  });
}
