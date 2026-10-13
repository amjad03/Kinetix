import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/features/board/kit/college/biz/biz_samples.dart';
import 'package:kinetix_board/features/board/kit/college/biz/biz_strings.dart';
import 'package:kinetix_board/features/board/kit/college/biz/kit_editors.dart';
import 'package:kinetix_board/features/board/kit/college/biz/market_data.dart';
import 'package:kinetix_board/features/board/kit/college/college_builders.dart';
import 'package:kinetix_board/features/board/kit/college/college_kit.dart';
import 'package:kinetix_board/features/board/kit/college/sheet_editor.dart';
import 'package:kinetix_board/features/board/kit/kit_panel.dart';
import 'package:kinetix_board/features/board/kit/subjects.dart';
import 'package:kinetix_board/l10n/l10n.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

const ink = Color(0xFF1B1F24), accent = Color(0xFF7D3A8C);

double? valueAt(SheetElement s, String ref) {
  final (r, c) = parseCellRef(ref)!;
  return evaluateSheet(s)[r * s.cols + c].number;
}

/// The MBA kit: live business templates, the finance pad and the chart pad.
void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('words', () {
    test('Hindi and Kannada have every English key', () {
      final en = bizStringTable['en']!.keys.toSet();
      for (final lang in ['hi', 'kn']) {
        expect(bizStringTable[lang]!.keys.toSet(), en, reason: lang);
        for (final v in bizStringTable[lang]!.values) {
          expect(v.trim(), isNotEmpty);
        }
      }
    });
  });

  group('finance pad', () {
    test('NPV and IRR appraisal', () {
      final s = financeTemplate(FinanceTemplate.npv, accent);
      final npv = sheetNpv(0.12, [150000, 160000, 170000, 140000, 120000]) - 500000;
      expect(valueAt(s, 'B11'), closeTo(npv, 0.01));
      expect(valueAt(s, 'B8'), closeTo(npv, 20), reason: 'rounded discount factors');
      expect(valueAt(s, 'B9'), closeTo(sheetIrr([-500000, 150000, 160000, 170000, 140000, 120000])!, 1e-9));
      expect(displaySheetCell(s, 9, 1), '12%');
      expect(displaySheetCell(s, 7, 1), startsWith('₹'));
    });

    test('ratio analysis', () {
      final s = financeTemplate(FinanceTemplate.ratios, accent);
      expect(valueAt(s, 'B18'), 2, reason: 'current ratio');
      expect(valueAt(s, 'B19'), 1.36, reason: 'quick ratio');
      expect(valueAt(s, 'B21'), 0.5, reason: 'debt–equity');
      expect(valueAt(s, 'B24'), closeTo(0.35, 1e-12), reason: 'gross profit ratio');
      expect(displaySheetCell(s, 23, 1), '35%');
      expect(valueAt(s, 'B31'), 37, reason: 'collection period');
      for (final v in evaluateSheet(s)) {
        expect(v.error, isNull);
      }
    });

    test('break-even, depreciation and the loan schedule', () {
      final be = financeTemplate(FinanceTemplate.breakEven, accent);
      expect(valueAt(be, 'B8'), 3000);
      expect(valueAt(be, 'B9'), 150000);
      expect(valueAt(be, 'B11'), 0.4);
      expect(valueAt(be, 'B14'), 5500);
      final slm = financeTemplate(FinanceTemplate.slm, accent);
      expect(valueAt(slm, 'D3'), 18000);
      expect(valueAt(slm, 'D9'), closeTo(10000, 1e-6), reason: 'down to scrap after five years');
      final wdv = financeTemplate(FinanceTemplate.wdv, accent);
      expect(valueAt(wdv, 'C4'), 20000);
      expect(valueAt(wdv, 'D8'), closeTo(100000 * 0.8 * 0.8 * 0.8 * 0.8 * 0.8, 1e-6));
      final loan = financeTemplate(FinanceTemplate.loan, accent);
      expect(valueAt(loan, 'D3'), closeTo(8884.88, 0.01));
      expect(valueAt(loan, 'E16')!.abs(), lessThan(1), reason: 'paid off in 12 months');
      expect(valueAt(loan, 'D17'), closeTo(100000, 1));
      for (final s in [be, slm, wdv, loan]) {
        for (final v in evaluateSheet(s)) {
          expect(v.error, isNull);
        }
      }
    });

    test('a template survives saving', () {
      final s = financeTemplate(FinanceTemplate.loan, accent);
      final back = decodeElement(jsonDecode(jsonEncode(encodeElement(s))) as Map<String, dynamic>, s.id)! as SheetElement;
      expect(back.cellFormats, s.cellFormats);
      expect(displaySheetCell(back, 1, 3), '12%');
    });
  });

  group('frames', () {
    test('every example fills every note of its frame', () {
      for (final MapEntry(key: f, value: (title, texts)) in frameSamples.entries) {
        final notes = frame(f, ink, accent).whereType<NoteElement>().toList();
        expect(texts, hasLength(notes.length), reason: f.name);
        final filled = sampleFrame(f, ink, accent);
        expect(filled.whereType<TextElement>().first.text, title);
        final out = filled.whereType<NoteElement>().toList();
        for (var i = 0; i < notes.length; i++) {
          expect(out[i].text.split('\n').first, startsWith(notes[i].text.split('\n').first.split(':').first), reason: '${f.name} $i keeps its heading');
          expect(out[i].text, contains(texts[i].split('\n').first));
        }
      }
      expect(frame(Frame.businessModelCanvas, ink, accent).whereType<NoteElement>(), hasLength(9));
    });

    test('samples and datasets', () {
      final tree = DecisionTreeModel.fromJson(bizData(KitKind.decisionTree, sample: true));
      final r = DtRollback.of(tree.root);
      expect(r.best[tree.root]!.label, 'Open a second outlet');
      expect(r.value[tree.root], closeTo(920000, 1e-6));
      final bcg = BcgMatrix.fromJson(bizData(KitKind.bcg, sample: true));
      expect({for (final p in bcg.products) bcg.quadrantOf(p)}, BcgQuadrant.values.toSet());
      for (final d in marketDatasets) {
        final c = d.chart;
        expect(c.isEmpty, isFalse, reason: d.id);
        expect(c.note, contains('Sample'), reason: d.id);
        expect(c.series.every((s) => s.values.every((v) => v.isFinite)), isTrue, reason: d.id);
      }
    });
  });

  group('on the board', () {
    Future<WhiteboardController> pumpKit(WidgetTester tester, Subject subject) async {
      tester.view.physicalSize = const Size(1920, 1080);
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
            body: Align(
              alignment: Alignment.topRight,
              child: SizedBox(
                width: 420,
                child: SubjectKitPanel(
                  board: BoardController()..skipEnrollment(),
                  wb: wb,
                  style: subjectStyles[subject]!,
                  primary: false,
                  onAi: (_) {},
                  onPanel: (_) {},
                  onSplit: (_) {},
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pump();
      return wb;
    }

    Future<void> tap(WidgetTester tester, Key key) async {
      await tester.scrollUntilVisible(find.byKey(key), 200, scrollable: find.descendant(of: find.byType(CollegeKitTab), matching: find.byType(Scrollable)).first);
      await tester.tap(find.byKey(key));
      await tester.pumpAndSettle();
    }

    Future<void> openFinance(WidgetTester tester) async {
      await tester.ensureVisible(find.byKey(const Key('kit-finance')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('kit-finance')));
      await tester.pumpAndSettle();
    }

    testWidgets('a filled-in BCG example and SWOT go on the board; a blank decision tree is filled in the editor', (tester) async {
      final wb = await pumpKit(tester, Subject.management);
      await tap(tester, const Key('college-swot-sample'));
      expect(wb.elements.whereType<NoteElement>().first.text, contains('Trusted brand'));
      await tap(tester, const Key('college-live-bcg-sample'));
      final bcg = wb.elements.whereType<KitElement>().single;
      expect(bcg.kind, KitKind.bcg);
      expect(BcgMatrix.fromJson(bcg.data).products, hasLength(5));

      await tap(tester, const Key('college-live-decisionTree'));
      expect(find.byKey(const Key('kit-editor')), findsOneWidget);
      // Rows: 0 the decision, 1 option A, 2–3 its outcomes, 4 option B, 5–6 its outcomes.
      await tester.enterText(find.byKey(const Key('dt-payoff-2')), '1000');
      await tester.enterText(find.byKey(const Key('dt-payoff-3')), '200');
      await tester.enterText(find.byKey(const Key('dt-cost-1')), '100');
      await tester.enterText(find.byKey(const Key('dt-payoff-5')), '300');
      await tester.pump();
      await tester.tap(find.byKey(const Key('kit-done')));
      await tester.pumpAndSettle();
      final tree = wb.elements.whereType<KitElement>().firstWhere((e) => e.kind == KitKind.decisionTree);
      final m = DecisionTreeModel.fromJson(tree.data);
      final r = DtRollback.of(m.root);
      // A: 0.5 × 1000 + 0.5 × 200 − 100 = 500; B: 0.5 × 300 = 150.
      expect(r.value[m.root], 500);
      expect(r.best[m.root]!.label, 'Option A');
      expect(tester.takeException(), isNull);
    });

    testWidgets('dragging a BCG bubble moves the product to another quadrant', (tester) async {
      await tester.binding.setSurfaceSize(const Size(1600, 1200));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      KitElement? out;
      final start = KitElement.sized(
        kind: KitKind.bcg,
        data: const BcgMatrix(products: [BcgProduct('Chai', growth: 20, share: 0.3, revenue: 100)]).toJson(),
        color: accent,
      );
      await tester.pumpWidget(
        MaterialApp(
          theme: KinetixTheme.light(),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: FilledButton(onPressed: () async => out = await editKit(context, start), child: const Text('open')),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      final m = BcgMatrix.fromJson(start.data);
      final box = tester.getRect(find.byKey(const Key('kit-preview')));
      final natural = start.naturalSize;
      final k = box.width / natural.width;
      final plot = bcgPlot(natural);
      final from = box.topLeft + m.placement(m.products.single, plot) * k;
      final to = box.topLeft + m.placement(const BcgProduct('', growth: 3, share: 4, revenue: 0), plot) * k;
      final g = await tester.startGesture(from);
      await g.moveBy(const Offset(0, 1));
      await g.moveTo(to);
      await g.up();
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('kit-done')));
      await tester.pumpAndSettle();
      final moved = BcgMatrix.fromJson(out!.data);
      expect(moved.quadrantOf(moved.products.single), BcgQuadrant.cashCow);
      expect(moved.products.single.growth, closeTo(3, 0.5));
      expect(out!.id, start.id);
    });

    testWidgets('chart pad: pasted data, a bar chart, and sample market data', (tester) async {
      final wb = await pumpKit(tester, Subject.management);
      await openFinance(tester);
      await tap(tester, const Key('college-chart-pad'));
      await tester.enterText(find.byKey(const Key('chart-data')), 'Year,Sales\n2022,120\n2023,150\n2024,190');
      await tester.tap(find.byKey(const Key('chart-kind-bar')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('kit-done')));
      await tester.pumpAndSettle();
      final chart = ChartData.fromJson(wb.elements.whereType<KitElement>().single.data);
      expect(chart.kind, KitChartKind.bar);
      expect(chart.series.single.values, [120, 150, 190]);

      await tap(tester, const Key('college-chart-pad'));
      await tester.tap(find.byKey(const Key('chart-datasets')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('dataset-gdp-growth')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('kit-done')));
      await tester.pumpAndSettle();
      final gdp = ChartData.fromJson(wb.elements.whereType<KitElement>().last.data);
      expect(gdp.note, contains('Sample'));
      expect(gdp.labels.first, '2014-15');

      pickDataFile = () async => utf8.encode('Month,Visitors\nJan,10\nFeb,30');
      await tap(tester, const Key('college-chart-pad'));
      await tester.tap(find.byKey(const Key('chart-import')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('kit-done')));
      await tester.pumpAndSettle();
      expect(ChartData.fromJson(wb.elements.whereType<KitElement>().last.data).series.single.values, [10, 30]);
      expect(tester.takeException(), isNull);
    });

    testWidgets('finance pad templates and the live break-even chart', (tester) async {
      final wb = await pumpKit(tester, Subject.management);
      await openFinance(tester);
      for (final t in FinanceTemplate.values) {
        await tap(tester, Key('college-pad-${t.name}'));
      }
      expect(wb.elements.whereType<SheetElement>(), hasLength(FinanceTemplate.values.length));
      await tap(tester, const Key('college-live-breakEven'));
      await tester.enterText(find.byKey(const Key('be-fc-field')), '80000');
      await tester.pump();
      await tester.tap(find.byKey(const Key('kit-done')));
      await tester.pumpAndSettle();
      final be = BreakEvenModel.fromJson(wb.elements.whereType<KitElement>().single.data);
      expect(be.bepUnits, 4000);
      expect(tester.takeException(), isNull);
    });
  });

  testWidgets('sheet editor: fill down, then a chart from the selected cells', (tester) async {
    await tester.binding.setSurfaceSize(const Size(1600, 1200));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    SheetElement? out;
    KitElement? chart;
    final start = SheetElement.sized(rows: 4, cols: 3, cells: ['Item', 'Qty', 'Total', 'Pens', '2', '=B2*10', 'Books', '3', '', 'Bags', '5', ''], color: accent);
    await tester.pumpWidget(
      MaterialApp(
        theme: KinetixTheme.light(),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: FilledButton(onPressed: () async => out = await editSheet(context, start, onChart: (k) => chart = k), child: const Text('open')),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('sheet-cell-1-2')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('sheet-fill-down')));
    await tester.pump();
    expect(find.text('50'), findsOneWidget, reason: 'C4 = B4 × 10');
    await tester.tap(find.byKey(const Key('sheet-cell-0-0')));
    await tester.longPress(find.byKey(const Key('sheet-cell-3-1')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('sheet-chart-selection')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('chart-kind-pie')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('kit-done')));
    await tester.pumpAndSettle();
    final data = ChartData.fromJson(chart!.data);
    expect(data.kind, KitChartKind.pie);
    expect(data.labels, ['Pens', 'Books', 'Bags']);
    expect(data.series.single.values, [2, 3, 5]);
    await tester.tap(find.byKey(const Key('sheet-done')));
    await tester.pumpAndSettle();
    expect(out!.cell(3, 2), '=B4*10');
    expect(tester.takeException(), isNull);
  });
}
