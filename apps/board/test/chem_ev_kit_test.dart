import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_3d/kinetix_3d.dart';
import 'package:kinetix_board/features/board/kit/chem/chem_kit.dart';
import 'package:kinetix_board/features/board/kit/chem/chem_strings.dart';
import 'package:kinetix_board/features/board/kit/college/biz/kit_editors.dart';
import 'package:kinetix_board/features/board/kit/ev/ev_kit.dart';
import 'package:kinetix_board/features/board/kit/ev/ev_strings.dart';
import 'package:kinetix_board/features/curriculum/curriculum_registry.dart';
import 'package:kinetix_board/l10n/l10n.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

const accent = Color(0xFF006B58);

void main() {
  test('Hindi and Kannada have every English key', () {
    for (final table in [chemStringTable, evStringTable]) {
      final en = table['en']!.keys.toSet();
      for (final lang in ['hi', 'kn']) {
        expect(table[lang]!.keys.toSet(), en, reason: lang);
        expect(table[lang]!.values.every((v) => v.trim().isNotEmpty), isTrue);
      }
    }
    final en = chemStringTable['en']!;
    for (final t in PfdUnitType.values) {
      expect(en, contains('unit.${t.name}'));
    }
    for (final id in chemModels) {
      expect(en, contains('model.$id'));
    }
    for (final id in evModels) {
      expect(evStringTable['en'], contains('model.$id'));
    }
  });

  test('every model the kits open is in the 3D library', () {
    for (final id in [...chemModels, ...evModels]) {
      expect(ModelCatalogue.byId(id), isNotNull, reason: id);
    }
  });

  test('registry: the PFD kit and EV diagrams are built (no "soon"); Chemical and EV subjects use them', () {
    expect(CurriculumRegistry.upcoming, isEmpty);
    for (final l in CurriculumRegistry.levels) {
      for (final s in l.subjects) {
        expect(s.features.where((f) => f.startsWith('soon:')), isEmpty, reason: '${l.id}/${s.id}');
      }
    }
    List<String> f(String id) => CurriculumRegistry.choice(id)!.subject.features;
    expect(f('be-chem/process-calculations'), containsAll(['tool:pfd-kit', 'tool:unit-ops', 'model:molecules', 'model:organic_molecules']));
    expect(f('be-chem/chem-fluid-mechanics'), contains('tool:pfd-kit'));
    expect(f('be-chem/heat-transfer'), containsAll(['tool:unit-ops', 'model:shell_tube_hx']));
    expect(f('be-chem/mass-transfer'), containsAll(['tool:unit-ops', 'model:distillation_column']));
    expect(f('be-chem/reaction-engineering'), containsAll(['tool:unit-ops', 'model:cstr_reactor', 'model:pfr_reactor', 'model:packed_bed_reactor']));
    expect(f('be-chem/process-control'), contains('tool:pfd-kit'));
    expect(f('be-chem/plant-design'), containsAll(['tool:pfd-kit', 'model:distillation_column']));
    expect(f('mtech-ev/ev-architecture'), containsAll(['tool:ev-power-flow', 'tool:ev-charging', 'model:ev_drivetrain', 'model:ev_battery_pack', 'model:pmsm_motor']));
    expect(f('mtech-ev/bms'), containsAll(['tool:ev-charging', 'model:ev_battery_pack']));
    expect(f('mtech-ev/electric-drives'), containsAll(['tool:ev-power-flow', 'model:pmsm_motor']));
    expect(f('mtech-ev/charging'), contains('tool:ev-charging'));
  });

  testWidgets('PFD: a sample opens in the editor, a symbol is added and connected, it goes on the board and opens again', (tester) async {
    final wb = WhiteboardController();
    addTearDown(wb.dispose);
    await pumpWide(tester, ChemKitPanel(wb: wb, accent: accent));
    await tester.tap(find.byKey(const Key('chem-pfd-distillation')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('pfd-editor')), findsOneWidget);
    await tester.ensureVisible(find.byKey(const Key('pfd-add-filter')));
    await tester.tap(find.byKey(const Key('pfd-add-filter')));
    await tester.pumpAndSettle();
    // The new filter is selected: rename it.
    await tester.ensureVisible(find.byKey(const Key('pfd-tag-u12')));
    await tester.enterText(find.byKey(const Key('pfd-tag-u12')), 'F-201');
    await tester.pumpAndSettle();
    // Connect the feed tank to the filter: two taps on the diagram.
    await tester.tap(find.byKey(const Key('pfd-mode-connect')));
    await tester.pumpAndSettle();
    final preview = find.byKey(const Key('pfd-preview'));
    await tester.ensureVisible(preview);
    final box = tester.getRect(preview);
    final k = box.width / KitElement.naturalSizeOf(KitKind.pfd).width;
    Offset at(Offset p) => box.topLeft + p * k;
    const filter = Offset(560, 320);
    await tester.tapAt(at(const Offset(120, 420)));
    await tester.pump();
    await tester.tapAt(at(filter));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('pfd-done')));
    await tester.tap(find.byKey(const Key('pfd-done')));
    await tester.pumpAndSettle();
    final e = wb.elements.whereType<KitElement>().single;
    expect(e.kind, KitKind.pfd);
    final d = PfdDiagram.fromJson(e.data);
    expect(d.units.last.tag, 'F-201');
    expect(d.streams.last.from, 'tk');
    expect(d.streams.last.to, 'u12');
    expect(d.streams.last.number, 10);

    await tester.pumpWidget(const SizedBox());
    await pumpWide(tester, Builder(builder: (context) => Center(child: FilledButton(onPressed: () => editKit(context, e).then((x) => last = x), child: const Text('edit')))));
    await tester.tap(find.text('edit'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('pfd-editor')), findsOneWidget);
    await tester.tap(find.byKey(const Key('pfd-table')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('pfd-done')));
    await tester.tap(find.byKey(const Key('pfd-done')));
    await tester.pumpAndSettle();
    expect(last!.id, e.id);
    expect(PfdDiagram.fromJson(last!.data).showTable, isFalse);
  });

  testWidgets('unit operations: McCabe–Thiele at 1.5 Rmin, then the reactors; on the board', (tester) async {
    final wb = WhiteboardController();
    addTearDown(wb.dispose);
    await pumpWide(tester, ChemKitPanel(wb: wb, accent: accent, first: ChemSection.unitOps));
    await tester.tap(find.byKey(const Key('chem-op-mccabeThiele')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('unitop-editor')), findsOneWidget);
    await tester.ensureVisible(find.byKey(const Key('mt-rmin')));
    await tester.tap(find.byKey(const Key('mt-rmin')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('unitop-reactors')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('rx-n')));
    await tester.drag(find.byKey(const Key('rx-n')), const Offset(200, 0));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('unitop-done')));
    await tester.tap(find.byKey(const Key('unitop-done')));
    await tester.pumpAndSettle();
    final m = UnitOpPanel.fromJson(wb.elements.whereType<KitElement>().single.data);
    expect(m.op, UnitOp.reactors);
    expect(m.mccabe.reflux, closeTo(1.65, 1e-9));
    expect(m.reactors.tanks, greaterThan(1));
  });

  testWidgets('EV: DC fast charging and the power flow (animated, cruise torque) go on the board', (tester) async {
    final wb = WhiteboardController();
    addTearDown(wb.dispose);
    await pumpWide(tester, EvKitPanel(wb: wb, accent: accent));
    await tester.tap(find.byKey(const Key('ev-charge-dc60')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('ev-charging-editor')), findsOneWidget);
    await tester.tap(find.byKey(const Key('ev-done')));
    await tester.pumpAndSettle();
    final c = EvChargingPanel.fromJson(wb.elements.whereType<KitElement>().single.data);
    expect(c.view, EvChargeView.dc);
    expect(c.chargerKw, 60);

    await tester.pumpWidget(const SizedBox());
    await pumpWide(tester, EvKitPanel(wb: wb, accent: accent, first: EvSection.flow));
    await tester.tap(find.byKey(const Key('ev-flow-driving')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('ev-flow-editor')), findsOneWidget);
    await tester.tap(find.byKey(const Key('ev-animate')));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.byKey(const Key('ev-animate')));
    await tester.pump();
    await tester.ensureVisible(find.byKey(const Key('ev-cruise')));
    await tester.tap(find.byKey(const Key('ev-cruise')));
    await tester.pump();
    await tester.ensureVisible(find.byKey(const Key('ev-flow-done')));
    await tester.tap(find.byKey(const Key('ev-flow-done')));
    await tester.pumpAndSettle();
    final f = EvPowerFlow.fromJson(wb.elements.whereType<KitElement>().last.data);
    expect(f.mode, EvMode.driving);
    expect(f.torqueNm, closeTo(f.cruiseTorque, 0.1));
  });

  testWidgets('the kits read in Hindi and Kannada', (tester) async {
    for (final lang in ['hi', 'kn']) {
      await pumpWide(tester, ChemKitPanel(wb: WhiteboardController(), accent: accent), lang: lang);
      expect(find.text(chemStringTable[lang]!['pfdSection']!), findsOneWidget);
      await pumpWide(tester, EvKitPanel(wb: WhiteboardController(), accent: accent), lang: lang);
      expect(find.text(evStringTable[lang]!['chargeSection']!), findsOneWidget);
    }
  });
}

KitElement? last;

Future<void> pumpWide(WidgetTester tester, Widget child, {String lang = 'en'}) async {
  tester.view.physicalSize = const Size(1920, 1400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      theme: KinetixTheme.light(),
      locale: Locale(lang),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: Scaffold(body: Align(alignment: Alignment.topRight, child: SizedBox(width: 420, child: child))),
    ),
  );
  await tester.pump();
}
