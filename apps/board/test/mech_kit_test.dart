import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_3d/kinetix_3d.dart' show ModelCatalogue;
import 'package:kinetix_board/features/board/kit/college/biz/kit_editors.dart';
import 'package:kinetix_board/features/board/kit/mech/mech_kit.dart';
import 'package:kinetix_board/features/board/kit/mech/mech_samples.dart';
import 'package:kinetix_board/features/board/kit/mech/mech_strings.dart';
import 'package:kinetix_board/l10n/l10n.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

const accent = Color(0xFF8C2F2F);

/// The mechanical engineering kit: drawing sheet, cycle charts, free-body diagrams, 3D models.
void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('Hindi and Kannada have every English key', () {
    final en = mechStringTable['en']!.keys.toSet();
    for (final lang in ['hi', 'kn']) {
      expect(mechStringTable[lang]!.keys.toSet(), en, reason: lang);
      for (final v in mechStringTable[lang]!.values) {
        expect(v.trim(), isNotEmpty);
      }
    }
  });

  test('the samples work out: every cycle solves, every diagram is balanced once solved', () {
    for (final k in CycleKind.values) {
      final r = sampleCycle(k).solve();
      expect(r.ok, isTrue, reason: k.name);
      expect(r.efficiency, inExclusiveRange(0.2, 0.8), reason: k.name);
    }
    for (final f in FbdSample.values.where((f) => f != FbdSample.blank)) {
      expect(sampleFbd(f).solve().balanced, isTrue, reason: f.name);
    }
    // The beam: R_B = 15 kN from ΣFy, and ΣM about the centre is zero too.
    expect(sampleFbd(FbdSample.beam).solve().forces[2].magnitude, closeTo(15000, 1e-6));
    for (final id in mechModels.values) {
      expect(ModelCatalogue.byId(id), isNotNull, reason: id);
    }
  });

  group('on the board', () {
    Future<WhiteboardController> pumpKit(WidgetTester tester, {MechSection first = MechSection.drawing, ValueChanged<String>? onOpenModel, ValueChanged<BoardBackground>? onPaper}) async {
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
            body: Align(alignment: Alignment.topRight, child: SizedBox(width: 420, child: MechKitPanel(wb: wb, accent: accent, first: first, onOpenModel: onOpenModel, onPaper: onPaper))),
          ),
        ),
      );
      await tester.pump();
      return wb;
    }

    Future<void> tap(WidgetTester tester, Key key) async {
      await tester.scrollUntilVisible(find.byKey(key), 200, scrollable: find.descendant(of: find.byKey(const Key('mech-kit')), matching: find.byType(Scrollable)).first);
      await tester.tap(find.byKey(key));
      await tester.pumpAndSettle();
    }

    Future<void> done(WidgetTester tester) async {
      await tester.ensureVisible(find.byKey(const Key('mech-done')));
      await tester.tap(find.byKey(const Key('mech-done')));
      await tester.pumpAndSettle();
    }

    Future<void> pick<T>(WidgetTester tester, Key dropdown, String item) async {
      await tester.ensureVisible(find.byKey(dropdown));
      await tester.tap(find.byKey(dropdown));
      await tester.pumpAndSettle();
      await tester.tap(find.text(item).last);
      await tester.pumpAndSettle();
    }

    testWidgets('drawing sheet: third angle, a point added, title block filled, then on the board', (tester) async {
      final wb = await pumpKit(tester);
      await tap(tester, const Key('mech-sheet-first'));
      expect(find.byKey(const Key('mech-editor')), findsOneWidget);
      await pick<DrawingProjection>(tester, const Key('sheet-proj'), mechStringTable['en']!['third']!);
      await pick<String>(tester, const Key('sheet-scale'), '1:2');
      await tester.ensureVisible(find.byKey(const Key('sheet-add-point')));
      await tester.tap(find.byKey(const Key('sheet-add-point')));
      await tester.pump();
      await tester.enterText(find.byKey(const Key('sheet-point-h-2')), '-15');
      await tester.enterText(find.byKey(const Key('sheet-name')), 'Asha 21ME042');
      await tester.pump();
      await done(tester);
      final k = wb.elements.whereType<KitElement>().single;
      expect(k.kind, KitKind.drawingSheet);
      final s = DrawingSheet.fromJson(k.data);
      expect(s.projection, DrawingProjection.third);
      expect(s.scale, '1:2');
      expect(s.points, hasLength(3));
      expect(s.points[2].label, 'C');
      expect(s.points[2].h, -15);
      expect(s.points[2].quadrant, 4);
      expect(s.name, 'Asha 21ME042');
      expect(isMechKit(k.kind), isTrue);
      expect(tester.takeException(), isNull);
    });

    testWidgets('paper: isometric or graph for the page', (tester) async {
      final papers = <BoardBackground>[];
      await pumpKit(tester, onPaper: papers.add);
      await tap(tester, const Key('mech-paper-iso'));
      await tap(tester, const Key('mech-paper-graph'));
      expect(papers, [BoardBackground.isometric, BoardBackground.graph]);
    });

    testWidgets('cycles: a Diesel cycle, compression ratio changed live, efficiency matches the formula', (tester) async {
      final wb = await pumpKit(tester, first: MechSection.thermo);
      await tap(tester, const Key('mech-cycle-diesel'));
      expect(find.byKey(const Key('mech-editor')), findsOneWidget);
      await tester.enterText(find.byKey(const Key('cycle-r')), '20');
      await tester.pump();
      final want = dieselEfficiency(20, 2, 1.4) * 100;
      expect(find.textContaining('η = ${mechNum(want, 2)} %'), findsOneWidget);
      // Switch to Otto: its fields change and the result follows.
      await pick<CycleKind>(tester, const Key('cycle-kind'), mechStringTable['en']!['otto']!);
      expect(find.byKey(const Key('cycle-rc')), findsNothing);
      expect(find.byKey(const Key('cycle-tmax')), findsOneWidget);
      expect(find.textContaining('η = ${mechNum(ottoEfficiency(20, 1.4) * 100, 2)} %'), findsOneWidget);
      await done(tester);
      final c = ThermoCycle.fromJson(wb.elements.whereType<KitElement>().single.data);
      expect(c.kind, CycleKind.otto);
      expect(c.r, 20);
      expect(c.solve().efficiency, closeTo(ottoEfficiency(20, 1.4), 1e-9));
      expect(tester.takeException(), isNull);
    });

    testWidgets('free-body diagram: a block on an incline, friction found; add a push and solve the force', (tester) async {
      final wb = await pumpKit(tester, first: MechSection.fbd);
      await tap(tester, const Key('mech-fbd-incline'));
      // Friction (the third force) is found: mg sin 30° = 49.05 N, and the block is balanced.
      expect(find.byKey(const Key('fbd-found-2')), findsOneWidget);
      expect(find.text('49.05'), findsOneWidget);
      expect(find.textContaining('✓'), findsOneWidget);
      // A push along +x unbalances it until the friction's line no longer works: mark it to find F and θ.
      await tester.ensureVisible(find.byKey(const Key('fbd-add-force')));
      await tester.tap(find.byKey(const Key('fbd-add-force')));
      await tester.pump();
      await tester.enterText(find.byKey(const Key('fbd-a-3')), '0');
      await tester.enterText(find.byKey(const Key('fbd-f-3')), '30');
      await tester.pump();
      expect(find.textContaining('✗'), findsOneWidget);
      await pick<FbdUnknown>(tester, const Key('fbd-u-2'), mechStringTable['en']!['findForce']!);
      expect(find.textContaining('✓'), findsOneWidget);
      await done(tester);
      final m = FbdModel.fromJson(wb.elements.whereType<KitElement>().single.data);
      expect(m.forces, hasLength(4));
      expect(m.forces[2].unknown, FbdUnknown.force);
      expect(m.solve().balanced, isTrue);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a mechanical panel on the board opens again in its editor', (tester) async {
      tester.view.physicalSize = const Size(1920, 1400);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final e = mechPanel(KitKind.fbd, sampleFbd(FbdSample.beam).toJson(), accent);
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
      expect(find.byKey(const Key('mech-editor')), findsOneWidget);
      await tester.enterText(find.byKey(const Key('fbd-x-0')), '0');
      await tester.pump();
      await done(tester);
      expect(back!.id, e.id);
      final r = FbdModel.fromJson(back!.data).solve();
      // The load moved to the centre: R_B is still found from ΣFy (15 kN), but ΣM is no longer zero.
      expect(r.forces[2].magnitude, closeTo(15000, 1e-6));
      expect(r.balanced, isFalse);
    });

    testWidgets('each machine model opens in the 3D viewer', (tester) async {
      final opened = <String>[];
      await pumpKit(tester, first: MechSection.models, onOpenModel: opened.add);
      for (final m in mechModels.keys) {
        await tap(tester, Key('mech-model-$m'));
      }
      expect(opened, mechModels.values.toList());
    });
  });
}
