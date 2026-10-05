import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/features/board/kit/college/college_builders.dart';
import 'package:kinetix_board/features/board/kit/college/college_kit.dart';
import 'package:kinetix_board/features/board/kit/college/law_reader.dart';
import 'package:kinetix_board/features/board/kit/college/pert.dart';
import 'package:kinetix_board/features/board/kit/college/sheet_editor.dart';
import 'package:kinetix_board/features/board/kit/college/stats.dart';
import 'package:kinetix_board/features/board/kit/kit_panel.dart';
import 'package:kinetix_board/features/board/kit/subjects.dart';
import 'package:kinetix_board/l10n/l10n.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

const phone = Size(390, 844), panel = Size(1920, 1080);
const ink = Color(0xFF1B1F24), accent = Color(0xFF7A4F00);

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  Future<WhiteboardController> pumpKit(WidgetTester tester, Subject subject, Size size) async {
    tester.view.physicalSize = size;
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
              width: size.width < 600 ? size.width : 420,
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

  Future<void> openTab(WidgetTester tester, KitTab tab) async {
    await tester.ensureVisible(find.byKey(Key('kit-${tab.name}')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(Key('kit-${tab.name}')));
    await tester.pumpAndSettle();
  }

  Future<void> tapItem(WidgetTester tester, String key) async {
    await tester.scrollUntilVisible(find.byKey(Key('college-$key')), 200, scrollable: find.descendant(of: find.byType(CollegeKitTab), matching: find.byType(Scrollable)).first);
    await tester.tap(find.byKey(Key('college-$key')));
    await tester.pumpAndSettle();
  }

  Future<void> choose(WidgetTester tester, String label) async {
    await tester.ensureVisible(find.text(label));
    await tester.pumpAndSettle();
    await tester.tap(find.text(label));
    await tester.pumpAndSettle();
  }

  group('subjects', () {
    test('college subject names find their kits', () {
      expect(subjectOf('Business Statistics'), Subject.statistics);
      expect(subjectOf('Biostatistics'), Subject.statistics);
      expect(subjectOf('Law of Contracts'), Subject.law);
      expect(subjectOf('Business Law'), Subject.law);
      expect(subjectOf('Constitutional Law'), Subject.law);
      expect(subjectOf('Management Accounting'), Subject.commerce);
      expect(subjectOf('Financial Management'), Subject.commerce);
      expect(subjectOf('Principles of Management'), Subject.management);
      expect(subjectOf('Marketing Management'), Subject.management);
      expect(subjectOf('Corporate Accounting'), Subject.commerce);
      expect(subjectOf('Income Tax'), Subject.commerce);
      expect(styleOf('Corporate Accounting').tabs, contains(KitTab.accounts));
      expect(styleOf('Jurisprudence').tools, contains(SubjectTool.reader));
    });
  });

  for (final (name, size) in [('phone', phone), ('panel', panel)]) {
    group('on a $name', () {
      testWidgets('accounts: every format goes on the board as an editable sheet', (tester) async {
        final wb = await pumpKit(tester, Subject.commerce, size);
        expect(find.byKey(const Key('kit-accounts')), findsOneWidget);
        for (final t in AccountsTemplate.values) {
          await tapItem(tester, t.name);
        }
        expect(wb.elements.whereType<SheetElement>(), hasLength(AccountsTemplate.values.length));
        expect(tester.takeException(), isNull);
      });

      testWidgets('calculators: GST works out and goes on the board', (tester) async {
        final wb = await pumpKit(tester, Subject.commerce, size);
        await openTab(tester, KitTab.finance);
        await tapItem(tester, 'gst');
        expect(find.byKey(const Key('calc-dialog')), findsOneWidget);
        await tester.tap(find.byKey(const Key('calc-run')));
        await tester.pumpAndSettle();
        expect(find.text('Invoice value = ₹1,180.00'), findsOneWidget);
        await tester.tap(find.byKey(const Key('calc-insert')));
        await tester.pumpAndSettle();
        expect(wb.elements.whereType<TextElement>().any((t) => t.text.contains('CGST @ 9% = ₹90.00')), isTrue);
        expect(tester.takeException(), isNull);
      });

      testWidgets('calculators: depreciation by WDV puts a schedule sheet on the board; bad input is caught', (tester) async {
        final wb = await pumpKit(tester, Subject.commerce, size);
        await openTab(tester, KitTab.finance);
        await tapItem(tester, 'depreciation');
        await choose(tester, 'Written-down value');
        await tester.enterText(find.byKey(const Key('calc-years')), 'x');
        await tester.tap(find.byKey(const Key('calc-run')));
        await tester.pumpAndSettle();
        expect(find.text('Check the numbers'), findsOneWidget);
        await tester.enterText(find.byKey(const Key('calc-years')), '3');
        await tester.tap(find.byKey(const Key('calc-insert')));
        await tester.pumpAndSettle();
        final sheet = wb.elements.whereType<SheetElement>().single;
        expect(sheet.cell(3, 3), '72900');
        expect(tester.takeException(), isNull);
      });

      testWidgets('management: frameworks and a PERT network', (tester) async {
        final wb = await pumpKit(tester, Subject.management, size);
        await tapItem(tester, 'swot');
        expect(wb.elements.whereType<NoteElement>(), hasLength(4));
        await tapItem(tester, 'pert');
        await tester.tap(find.byKey(const Key('calc-insert')));
        await tester.pumpAndSettle();
        expect(wb.elements.whereType<TextElement>().any((t) => t.text.contains('Critical path: A → D → F')), isTrue);
        expect(tester.takeException(), isNull);
      });

      testWidgets('statistics: descriptive measures with a box plot, and a test of hypothesis', (tester) async {
        final wb = await pumpKit(tester, Subject.statistics, size);
        await tapItem(tester, 'descriptive');
        await tester.tap(find.byKey(const Key('calc-insert')));
        await tester.pumpAndSettle();
        expect(wb.elements.whereType<TextElement>().any((t) => t.text == 'Box plot'), isTrue);
        await tapItem(tester, 'tests');
        await choose(tester, 'One-way ANOVA');
        await tester.tap(find.byKey(const Key('calc-run')));
        await tester.pumpAndSettle();
        expect(find.textContaining('Reject H₀'), findsOneWidget);
        expect(tester.takeException(), isNull);
      });

      testWidgets('law: frames, and the reader highlights paragraphs and notes onto the board', (tester) async {
        final wb = await pumpKit(tester, Subject.law, size);
        await tapItem(tester, 'caseBrief');
        expect(wb.elements.whereType<NoteElement>().length, 9);
        await tester.tap(find.byKey(const Key('college-reader')));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const Key('law-samples')));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Constitution of India, Article 21'));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const Key('law-para-0')));
        await tester.tap(find.byKey(const Key('law-note-0')));
        await tester.pumpAndSettle();
        await tester.enterText(find.byKey(const Key('law-note-text')), 'Maneka Gandhi widened this');
        await tester.tap(find.byKey(const Key('law-note-save')));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const Key('law-send')));
        await tester.pumpAndSettle();
        final notes = wb.elements.whereType<NoteElement>().toList();
        expect(notes.any((n) => n.text.contains('procedure established by law')), isTrue);
        expect(notes.any((n) => n.text.contains('Maneka Gandhi')), isTrue);
        expect(tester.takeException(), isNull);
      });

      testWidgets('the spreadsheet editor: formulas, formats and a chart', (tester) async {
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        SheetElement? out;
        await tester.pumpWidget(
          MaterialApp(
            theme: KinetixTheme.light(),
            home: Builder(
              builder: (context) => TextButton(
                onPressed: () async => out = await editSheet(context, blankSheet(accent, rows: 3, cols: 2)),
                child: const Text('open'),
              ),
            ),
          ),
        );
        await tester.tap(find.text('open'));
        await tester.pumpAndSettle();
        Future<void> type(int r, int c, String t) async {
          await tester.tap(find.byKey(Key('sheet-cell-$r-$c')));
          await tester.pump();
          await tester.enterText(find.byKey(const Key('sheet-input')), t);
          await tester.pump();
        }

        await type(1, 1, '1,50,000');
        await type(2, 1, '=B2*2');
        expect(find.text('300000'), findsOneWidget);
        await tester.tap(find.byKey(const Key('sheet-add-row')));
        await tester.pump();
        await tester.tap(find.byKey(const Key('sheet-format')));
        await tester.pumpAndSettle();
        await tester.tap(find.text('B: ₹ lakh').last);
        await tester.pumpAndSettle();
        expect(find.text('₹3.00 L'), findsOneWidget);
        await tester.tap(find.byKey(const Key('sheet-chart')));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Bars').last);
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const Key('sheet-done')));
        await tester.pumpAndSettle();
        expect(out!.rows, 4);
        expect(out!.chart?.kind, SheetChartKind.bar);
        expect(sheetChartData(out!).values, [150000, 300000]);
        expect(out!.rect.size.height, closeTo(out!.naturalSize.height, 0.01));
        expect(tester.takeException(), isNull);
      });
    });
  }

  group('builders', () {
    test('every frame and format is made of board elements that save and load', () {
      final all = <BoardElement>[
        for (final f in Frame.values) ...frame(f, ink, accent),
        for (final t in AccountsTemplate.values) ...accountsTemplate(t, ink, accent),
      ];
      final back = SavedBoard.fromJson(SavedBoard(background: BoardBackground.plain, canvas: const Size(1920, 1080), pages: [all]).toJson());
      expect(back.pages.single, hasLength(all.length));
    });

    test('the Schedule III balance sheet totals both sides', () {
      final s = accountsTemplate(AccountsTemplate.balanceSheet, ink, accent).whereType<SheetElement>().single;
      final total1 = s.cells.indexOf('TOTAL') ~/ s.cols, total2 = s.cells.lastIndexOf('TOTAL') ~/ s.cols;
      var filled = s.withCell(3, 2, '500000').withCell(14, 2, '200000');
      final ppe = s.cells.indexOf('        (i) Property, plant and equipment') ~/ s.cols;
      filled = filled.withCell(ppe, 2, '700000');
      expect(displaySheetCell(filled, total1, 2), '₹7,00,000.00');
      expect(displaySheetCell(filled, total2, 2), '₹7,00,000.00');
    });

    test('trading and P&L account works out gross and net profit', () {
      var s = accountsTemplate(AccountsTemplate.finalAccounts, ink, accent).whereType<SheetElement>().single;
      for (final (r, c, v) in [(1, 1, '20000'), (2, 1, '100000'), (3, 1, '10000'), (1, 3, '160000'), (2, 3, '30000'), (7, 1, '25000'), (8, 1, '12000')]) {
        s = s.withCell(r, c, v);
      }
      final v = evaluateSheet(s);
      expect(v[5 * 4 + 1].number, 60000); // gross profit
      expect(v[10 * 4 + 1].number, 23000); // net profit
      expect(v[6 * 4 + 1].number, v[6 * 4 + 3].number); // both sides agree
    });

    test('charts for statistics and projects', () {
      final d = Descriptive([2, 4, 4, 4, 5, 5, 7, 9]);
      expect(boxPlot(d, ink, accent), isNotEmpty);
      expect(histogramChart(d, ink, accent), isNotEmpty);
      for (final dist in Dist.values) {
        expect(distributionChart(dist, p1: dist == Dist.binomial ? 10 : 2, p2: 0.5, a: 0, b: 2, ink: ink, accent: accent), isNotEmpty);
      }
      expect(scatterChart(Regression([1, 2, 3], [2, 4, 7]), ink, accent), isNotEmpty);
      expect(seriesChart([1, 2, 3, 4], movingAverage([1, 2, 3, 4], 3), 3, ink, accent), isNotEmpty);
      final s = Schedule.of([const Activity('A', 2), const Activity('B', 3, predecessors: ['A'])])!;
      expect(ganttChart(s, ink, accent), isNotEmpty);
      expect(pertNetwork(s, ink, accent).whereType<TextElement>().last.text, contains('A → B'));
      expect(niceTicks(0, 10), [0, 2, 4, 6, 8, 10]);
    });

    test('reader paragraphs', () {
      expect(paragraphsOf('a\nb\n\nc'), ['a b', 'c']);
      expect(paragraphsOf('one\ntwo'), ['one', 'two']);
      final els = readerNotes('Act', ['p0', 'p1'], {1: 0}, {1: 'mine'}, accent);
      expect(els, hasLength(3));
    });
  });
}
