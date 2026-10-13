import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_3d/kinetix_3d.dart' show ModelCatalogue;
import 'package:kinetix_board/features/board/kit/civil/civil_kit.dart';
import 'package:kinetix_board/features/board/kit/civil/civil_samples.dart';
import 'package:kinetix_board/features/board/kit/civil/civil_strings.dart';
import 'package:kinetix_board/features/board/kit/civil/is_codes.dart';
import 'package:kinetix_board/features/board/kit/college/biz/kit_editors.dart';
import 'package:kinetix_board/l10n/l10n.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

const accent = Color(0xFF8A4B00), ink = Color(0xFF1B1F24);

/// The civil engineering kit: beam and truss solvers, the survey pad and IS code tables.
void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('Hindi and Kannada have every English key', () {
    final en = civilStringTable['en']!.keys.toSet();
    for (final lang in ['hi', 'kn']) {
      expect(civilStringTable[lang]!.keys.toSet(), en, reason: lang);
      for (final v in civilStringTable[lang]!.values) {
        expect(v.trim(), isNotEmpty);
      }
    }
  });

  test('IS code tables: searchable, well formed, insert as a table with the teaching note', () {
    expect(isCodeTables.map((t) => t.id).toSet(), hasLength(isCodeTables.length));
    for (final t in isCodeTables) {
      for (final r in t.rows) {
        expect(r.length, t.rows.first.length, reason: '${t.id}: every row has every column');
      }
    }
    expect(isCodeTables.where((t) => t.matches('ismb 300')).map((t) => t.id), ['ismb']);
    expect(isCodeTables.where((t) => t.matches('zone')).map((t) => t.id), contains('is1893-zones'));
    expect(isCodeTables.where((t) => t.matches('cover')).map((t) => t.id), contains('is456-cover'));
    final els = isCodeElements(isCodeTables.firstWhere((t) => t.id == 'is456-wsm'), accent, ink);
    final sheet = els.whereType<SheetElement>().single;
    expect(sheet.rows, 10);
    expect(displaySheetCell(sheet, 3, 3), '13.33', reason: 'M20 modular ratio');
    expect(els.whereType<TextElement>().map((t) => t.text), contains(isCodeDisclaimer));
  });

  test('the samples solve: Pratt truss is determinate and symmetric, level books check', () {
    final r = prattTruss.solve();
    expect(r.status, TrussStatus.determinate);
    expect(r.reactions[0]!.ry, closeTo(15, 1e-9));
    expect(r.reactions[4]!.ry, closeTo(15, 1e-9));
    // Top chord FG in compression, bottom chord BC in tension.
    expect(r.forces[4], lessThan(0));
    expect(r.forces[1], greaterThan(0));
    expect(r.forces[0], closeTo(r.forces[3], 1e-9));
    for (final m in LevelMethod.values) {
      expect(sampleLevelBook(m).reduce().checks, isTrue, reason: m.name);
    }
    expect(sampleTraverse.closingError, lessThan(1));
    expect(sampleContours().contourValues, isNotEmpty);
    for (final t in BeamType.values) {
      expect(sampleBeam(t).solve().stable, isTrue, reason: t.name);
    }
  });

  group('on the board', () {
    Future<WhiteboardController> pumpKit(WidgetTester tester, {CivilSection first = CivilSection.beams, ValueChanged<String>? onOpenModel}) async {
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
            body: Align(alignment: Alignment.topRight, child: SizedBox(width: 420, child: CivilKitPanel(wb: wb, accent: accent, ink: ink, first: first, onOpenModel: onOpenModel))),
          ),
        ),
      );
      await tester.pump();
      return wb;
    }

    Future<void> tap(WidgetTester tester, Key key) async {
      await tester.scrollUntilVisible(find.byKey(key), 200, scrollable: find.descendant(of: find.byKey(const Key('civil-kit')), matching: find.byType(Scrollable)).first);
      await tester.tap(find.byKey(key));
      await tester.pumpAndSettle();
    }

    Future<void> done(WidgetTester tester) async {
      await tester.ensureVisible(find.byKey(const Key('civil-done')));
      await tester.tap(find.byKey(const Key('civil-done')));
      await tester.pumpAndSettle();
    }

    testWidgets('a simply supported beam: change the UDL, the reactions follow, and it goes on the board', (tester) async {
      final wb = await pumpKit(tester);
      await tap(tester, const Key('civil-beam-simplySupported'));
      expect(find.byKey(const Key('civil-editor')), findsOneWidget);
      await tester.enterText(find.byKey(const Key('beam-load-w-0')), '20');
      await tester.pump();
      await tester.tap(find.byKey(const Key('beam-add-point')));
      await tester.pump();
      await done(tester);
      final k = wb.elements.whereType<KitElement>().single;
      expect(k.kind, KitKind.beam);
      final b = BeamModel.fromJson(k.data);
      expect(b.loads, hasLength(2));
      final r = b.solve();
      // 20 kN/m over 6 m plus 10 kN at mid-span: 65 kN each side.
      expect(r.reactions.map((e) => e.force), [closeTo(65, 1e-6), closeTo(65, 1e-6)]);
      expect(tester.takeException(), isNull);
    });

    testWidgets('dragging a point load along the beam moves it and the reactions change', (tester) async {
      await tester.binding.setSurfaceSize(const Size(1600, 1400));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      KitElement? out;
      final start = civilPanel(
        KitKind.beam,
        BeamModel(length: 6, type: BeamType.simplySupported, supports: BeamModel.supportsFor(BeamType.simplySupported, 6), loads: const [BeamLoad(BeamLoadKind.point, x: 2, w: 30)]).toJson(),
        accent,
      );
      await tester.pumpWidget(
        MaterialApp(
          theme: KinetixTheme.light(),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: Builder(
            builder: (context) => Scaffold(body: Center(child: FilledButton(onPressed: () async => out = await editKit(context, start), child: const Text('open')))),
          ),
        ),
      );
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('civil-editor')), findsOneWidget, reason: 'editKit opens the civil editor for a beam');
      final box = tester.getRect(find.byKey(const Key('civil-preview')));
      final natural = start.naturalSize;
      final k = box.width / natural.width;
      final b = BeamModel.fromJson(start.data);
      final y = beamFrame(natural).y - 40;
      final from = box.topLeft + Offset(beamToPx(b, natural, 2), y) * k;
      final to = box.topLeft + Offset(beamToPx(b, natural, 4), y) * k;
      final g = await tester.startGesture(from);
      await g.moveBy(const Offset(1, 0));
      await g.moveTo(to);
      await g.up();
      await tester.pumpAndSettle();
      await done(tester);
      final moved = BeamModel.fromJson(out!.data);
      expect(moved.loads.single.x, closeTo(4, 0.11));
      final r = moved.solve();
      expect(r.reactions[1].force, closeTo(30 * moved.loads.single.x / 6, 1e-6));
      expect(r.reactions[1].force, greaterThan(15));
      expect(out!.id, start.id);
    });

    testWidgets('a Pratt truss and the survey pad go on the board as live panels', (tester) async {
      final wb = await pumpKit(tester, first: CivilSection.trusses);
      await tap(tester, const Key('civil-truss-pratt'));
      expect(find.byKey(const Key('civil-editor')), findsOneWidget);
      expect(find.byKey(const Key('truss-member-12')), findsOneWidget);
      await done(tester);
      expect(TrussModel.fromJson(wb.elements.whereType<KitElement>().single.data).solve().status, TrussStatus.determinate);

      await tap(tester, const Key('civil-level-rf'));
      // Book a wrong change-point reading: the levels follow and the check still agrees.
      await tester.enterText(find.byKey(const Key('level-fs-5')), '1.300');
      await tester.pump();
      await tester.tap(find.text(civilStringTable['en']!['hiMethod']!));
      await tester.pump();
      await done(tester);
      final book = LevelBook.fromJson(wb.elements.whereType<KitElement>().firstWhere((e) => e.kind == KitKind.levelBook).data);
      expect(book.method, LevelMethod.heightOfInstrument);
      expect(book.rows.last.fs, 1.3);
      final r = book.reduce();
      expect(r.rl.last, closeTo(100.475, 1e-9));
      expect(r.checks, isTrue);

      await tap(tester, const Key('civil-traverse'));
      await done(tester);
      await tap(tester, const Key('civil-contour'));
      await done(tester);
      expect(wb.elements.whereType<KitElement>().map((e) => e.kind).toSet(), {KitKind.truss, KitKind.levelBook, KitKind.traverse, KitKind.contour});
      expect(tester.takeException(), isNull);
    });

    testWidgets('IS code tables: search, then insert; the civil 3D models are listed', (tester) async {
      final wb = await pumpKit(tester, first: CivilSection.codes);
      await tap(tester, const Key('civil-is-codes'));
      expect(find.byKey(const Key('is-codes')), findsOneWidget);
      await tester.enterText(find.byKey(const Key('is-codes-search')), 'zone factor');
      await tester.pump();
      expect(find.byKey(const Key('is-code-is1893-zones')), findsOneWidget);
      expect(find.byKey(const Key('is-code-ismb')), findsNothing);
      await tester.tap(find.byKey(const Key('is-codes-insert')));
      await tester.pumpAndSettle();
      final sheet = wb.elements.whereType<SheetElement>().single;
      expect(displaySheetCell(sheet, 2, 4), '0.36');
      for (final m in civilModels.keys) {
        await tester.scrollUntilVisible(find.byKey(Key('civil-model-$m')), 200, scrollable: find.descendant(of: find.byKey(const Key('civil-kit')), matching: find.byType(Scrollable)).first);
        expect(find.byKey(Key('civil-model-$m')), findsOneWidget);
      }
      expect(tester.takeException(), isNull);
    });

    testWidgets('each civil 3D model opens the bundled model in the viewer', (tester) async {
      final opened = <String>[];
      await pumpKit(tester, first: CivilSection.models, onOpenModel: opened.add);
      for (final m in civilModels.keys) {
        await tester.scrollUntilVisible(find.byKey(Key('civil-model-$m')), 200, scrollable: find.descendant(of: find.byKey(const Key('civil-kit')), matching: find.byType(Scrollable)).first);
        await tester.tap(find.byKey(Key('civil-model-$m')));
        await tester.pump();
      }
      expect(opened, civilModels.values.toList());
      for (final id in opened) {
        expect(ModelCatalogue.byId(id), isNotNull, reason: '$id is in the 3D library');
      }
    });
  });
}
