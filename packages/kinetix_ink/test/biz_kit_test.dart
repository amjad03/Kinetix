import 'dart:convert';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

SheetElement sheet(int rows, int cols, List<String> cells) => SheetElement.sized(rows: rows, cols: cols, cells: cells, color: const Color(0xFF7A4F00));

double? number(SheetElement s, int r, int c) => evaluateSheet(s)[r * s.cols + c].number;

void main() {
  group('finance formulas (checked against a spreadsheet)', () {
    test('NPV, IRR', () {
      // NPV(10%, -10000, 3000, 4200, 6800) = 1,188.44.
      final s = sheet(6, 2, ['10%', '', '-10000', '', '3000', '', '4200', '', '6800', '', '=NPV(A1, A2:A5)', '=IRR(B3:B6)']);
      expect(number(s, 5, 0), closeTo(1188.44, 0.01));
      expect(sheetNpv(0.1, [-10000, 3000, 4200, 6800]), closeTo(1188.44, 0.01));
      // IRR(-70000, 12000, 15000, 18000, 21000, 26000) = 8.66%; without the last year −2.12%.
      expect(sheetIrr([-70000, 12000, 15000, 18000, 21000, 26000]), closeTo(0.086631, 1e-5));
      expect(sheetIrr([-70000, 12000, 15000, 18000, 21000]), closeTo(-0.021245, 1e-5));
      final irr = sheet(6, 1, ['-70000', '12000', '15000', '18000', '21000', '26000']);
      expect(number(irr.withCell(0, 0, '-70000'), 0, 0), -70000);
      final withIrr = sheet(7, 1, ['-70000', '12000', '15000', '18000', '21000', '26000', '=ROUND(IRR(A1:A6)*100, 2)']);
      expect(number(withIrr, 6, 0), 8.66);
      expect(sheetIrr([100, 200]), isNull, reason: 'no outflow, no IRR');
      expect(evaluateSheet(sheet(2, 1, ['5', '=IRR(A1)']))[1].error, '#NUM!');
    });

    test('PMT, FV, PV', () {
      expect(sheetPmt(0.08 / 12, 10, 10000), closeTo(-1037.03, 0.01));
      expect(sheetFv(0.06 / 12, 10, -200, pv: -500, type: 1), closeTo(2581.40, 0.01));
      expect(sheetPv(0.08 / 12, 240, 500), closeTo(-59777.15, 0.01));
      expect(sheetPmt(0, 10, 1000), -100);
      final s = sheet(1, 3, ['=PMT(10%/12, 240, 1000000)', '=FV(0.1, 2, 0, -100)', '=PV(0.1, 2, 0, 121)']);
      expect(number(s, 0, 0), closeTo(-9650.22, 0.01), reason: 'the EMI on ₹10 lakh at 10% for 20 years');
      expect(number(s, 0, 1), closeTo(121, 1e-9));
      expect(number(s, 0, 2), closeTo(-100, 1e-9));
    });

    test('POWER, AND, OR, NOT, ^ and IF', () {
      final s = sheet(1, 5, ['=POWER(2, 10)', '=2^3^2', '=AND(1, 2>1)', '=OR(0, 0)', '=IF(NOT(0), 7, 9)']);
      expect([for (var c = 0; c < 5; c++) number(s, 0, c)], [1024, 512, 1, 0, 7]);
    });
  });

  group('copying formulas (fill handle)', () {
    test('relative references move, fixed ones stay', () {
      expect(shiftFormula(r'=A1+$B$2*B$3+$C4', 1, 0), r'=A2+$B$2*B$3+$C5');
      expect(shiftFormula(r'=A1+$B$2*B$3+$C4', 0, 1), r'=B1+$B$2*C$3+$C4');
      expect(shiftFormula('=SUM(A1:A3)', 1, 1), '=SUM(B2:B4)');
      expect(shiftFormula('=ROUND(A2, 2)', 2, 0), '=ROUND(A4, 2)');
      expect(shiftFormula('=A1', -1, 0), '=#REF!');
      expect(shiftFormula('Sales', 3, 0), 'Sales');
    });

    test('filling down a sheet', () {
      var s = sheet(4, 3, ['2', '3', '=A1*B1', '4', '5', '', '6', '7', '', '', '', '']);
      s = fillSheetCells(s, 0, 2, [(1, 2), (2, 2)]);
      expect(s.cell(2, 2), '=A3*B3');
      expect([number(s, 0, 2), number(s, 1, 2), number(s, 2, 2)], [6, 20, 42]);
    });

    test('a cell can have its own format; it moves with the grid and is saved', () {
      var s = sheet(2, 2, ['Rate', '0.12', 'Amount', '5000']).copyWith(formats: const [SheetFormat.general, SheetFormat.inr]).withCellFormat(0, 1, SheetFormat.percent);
      expect(displaySheetCell(s, 0, 1), '12%');
      expect(displaySheetCell(s, 1, 1), '₹5,000.00');
      s = s.resizedGrid(3, 3);
      expect(s.formatAt(0, 1), SheetFormat.percent);
      expect(s.formatAt(1, 1), SheetFormat.inr);
      final back = decodeElement(jsonDecode(jsonEncode(encodeElement(s))) as Map<String, dynamic>, s.id)! as SheetElement;
      expect(back.cellFormats, {1: SheetFormat.percent});
      expect(s.withCellFormat(0, 1, null).cellFormats, isEmpty);
    });

    test('scatter charts read the labels range as x', () {
      final s = SheetElement.sized(rows: 3, cols: 2, cells: ['1', '2', '2', '4', '3', '9'], color: Colors.teal, header: false, chart: const SheetChart(kind: SheetChartKind.scatter, labels: 'A1:A3', values: 'B1:B3'));
      expect(sheetChartData(s).values, [2, 4, 9]);
      final back = decodeElement(jsonDecode(jsonEncode(encodeElement(s))) as Map<String, dynamic>, s.id)! as SheetElement;
      expect(back.chart!.kind, SheetChartKind.scatter);
    });
  });

  group('decision tree', () {
    DtNode tree({double costA = 0}) => DtNode(DtKind.decision, label: 'Decide', children: [
      DtNode(DtKind.chance, label: 'Launch', cost: costA, children: [
        DtNode(DtKind.end, label: 'High demand', probability: 0.6, payoff: 100),
        DtNode(DtKind.end, label: 'Low demand', probability: 0.4, payoff: -20),
      ]),
      DtNode(DtKind.end, label: 'Do not launch', payoff: 40),
    ]);

    test('rolls back expected values and picks the best option', () {
      final root = tree();
      final r = DtRollback.of(root);
      expect(r.value[root.children[0]], closeTo(52, 1e-9));
      expect(r.value[root], closeTo(52, 1e-9));
      expect(r.best[root], same(root.children[0]));
      expect(r.onBestPath, containsAll([root, root.children[0], ...root.children[0].children]));
      expect(r.onBestPath.contains(root.children[1]), isFalse);
      expect(r.badProbabilities, isEmpty);
    });

    test('a branch cost can change the choice; bad probabilities are flagged', () {
      final root = tree(costA: 15);
      final r = DtRollback.of(root);
      expect(r.value[root], 40);
      expect(r.best[root]!.label, 'Do not launch');
      root.children[0].children[0].probability = 0.5;
      expect(DtRollback.of(root).badProbabilities, contains(root.children[0]));
    });

    test('two-stage tree, layout and JSON', () {
      final root = DtNode(DtKind.decision, children: [
        DtNode(DtKind.chance, label: 'Big plant', cost: 200, children: [
          DtNode(DtKind.end, probability: 0.7, payoff: 600),
          DtNode(DtKind.decision, probability: 0.3, children: [
            DtNode(DtKind.end, label: 'Sell', payoff: 150),
            DtNode(DtKind.end, label: 'Keep', payoff: 50),
          ]),
        ]),
        DtNode(DtKind.chance, label: 'Small plant', cost: 80, children: [
          DtNode(DtKind.end, probability: 0.7, payoff: 300),
          DtNode(DtKind.end, probability: 0.3, payoff: 100),
        ]),
      ]);
      final r = DtRollback.of(root);
      // Big: 0.7×600 + 0.3×150 − 200 = 265; small: 0.7×300 + 0.3×100 − 80 = 160.
      expect(r.value[root], closeTo(265, 1e-9));
      expect(r.best[root]!.label, 'Big plant');
      expect(r.best[root.children[0].children[1]]!.label, 'Sell');
      final pos = layoutDecisionTree(root);
      expect(pos[root]!.dx, 0);
      expect(root.leafCount, 5);
      expect(root.depth, 3);
      final back = DecisionTreeModel.fromJson(jsonDecode(jsonEncode(DecisionTreeModel(root: root).toJson())) as Map<String, Object?>);
      expect(DtRollback.of(back.root).value[back.root], closeTo(265, 1e-9));
    });
  });

  group('break-even', () {
    test('the textbook example', () {
      const m = BreakEvenModel(fixedCost: 60000, variableCost: 30, price: 50, units: 5000);
      expect(m.contribution, 20);
      expect(m.pvRatio, 0.4);
      expect(m.bepUnits, 3000);
      expect(m.bepSales, 150000);
      expect(m.marginOfSafetyUnits, 2000);
      expect(m.marginOfSafetyPercent, 40);
      expect(m.profit, 40000);
      expect(m.chartUnits, greaterThanOrEqualTo(5000 * 1.4));
      expect(m.costAt(3000), m.revenueAt(3000));
    });

    test('no break-even when price does not cover variable cost', () {
      const m = BreakEvenModel(fixedCost: 1000, variableCost: 60, price: 50, units: 100);
      expect(m.canBreakEven, isFalse);
      expect(m.bepUnits, double.infinity);
      expect(niceCeil(7300), 10000);
      expect(niceCeil(2100), 2500);
    });
  });

  group('BCG matrix', () {
    const m = BcgMatrix(products: [
      BcgProduct('Star', growth: 18, share: 2, revenue: 500),
      BcgProduct('Question', growth: 22, share: 0.4, revenue: 100),
      BcgProduct('Cow', growth: 4, share: 3, revenue: 900),
      BcgProduct('Dog', growth: 2, share: 0.3, revenue: 50),
    ]);
    const plot = Rect.fromLTWH(0, 0, 800, 600);

    test('quadrants', () {
      expect([for (final p in m.products) m.quadrantOf(p)], [BcgQuadrant.star, BcgQuadrant.questionMark, BcgQuadrant.cashCow, BcgQuadrant.dog]);
      expect(m.quadrantOf(const BcgProduct('Edge', growth: 10, share: 1, revenue: 1)), BcgQuadrant.star, reason: 'on the split counts as high');
    });

    test('placement: high share left, high growth up, on a log scale; dragging reads it back', () {
      final split = m.splitAt(plot);
      expect(split.dx, closeTo(400, 1e-9), reason: '1× is the middle of 0.1× to 10×');
      expect(split.dy, closeTo(300, 1e-9), reason: '10% is the middle of −10% to 30%');
      final star = m.placement(m.products[0], plot), dog = m.placement(m.products[3], plot);
      expect(star.dx, lessThan(split.dx));
      expect(star.dy, lessThan(split.dy));
      expect(dog.dx, greaterThan(split.dx));
      expect(dog.dy, greaterThan(split.dy));
      final back = m.valuesAt(star, plot);
      expect(back.growth, closeTo(18, 1e-9));
      expect(back.share, closeTo(2, 1e-9));
      expect(m.radiusOf(m.products[2], 60), 60);
      expect(m.radiusOf(m.products[1], 60), closeTo(60 * 0.3333, 0.01), reason: 'area in proportion to revenue');
    });
  });

  group('chart data', () {
    test('CSV with a heading, rupees and percentages', () {
      final d = ChartData.fromCsv('Year,Sales,Margin\n2022,"₹1,20,000",12%\n2023,150000,14.5%\n2024,,15%');
      expect(d.labels, ['2022', '2023', '2024']);
      expect(d.xLabel, 'Year');
      expect(d.series.map((s) => s.name), ['Sales', 'Margin']);
      expect(d.series[0].values.take(2), [120000, 150000]);
      expect(d.series[0].values[2].isNaN, isTrue);
      expect(d.series[1].values, [12, 14.5, 15]);
      final again = ChartData.fromCsv(d.toCsv());
      expect(again.series[1].values, [12, 14.5, 15]);
    });

    test('tabs, a single column, and JSON', () {
      expect(ChartData.fromCsv('A\t1\nB\t2').series.single.values, [1, 2]);
      expect(ChartData.fromCsv('5\n6\n7').labels, ['1', '2', '3']);
      final d = ChartData.fromCsv('x,y\n1,2', kind: KitChartKind.scatter, title: 'T', note: 'Sample');
      final back = ChartData.fromJson(jsonDecode(jsonEncode(d.toJson())) as Map<String, Object?>);
      expect(back.kind, KitChartKind.scatter);
      expect(back.note, 'Sample');
      expect(back.series.single.values, [2]);
    });
  });

  group('the panel element', () {
    test('saves, loads and paints every kind', () async {
      final data = {
        KitKind.bcg: const BcgMatrix(products: [BcgProduct('A', growth: 12, share: 1.5, revenue: 10)]).toJson(),
        KitKind.decisionTree: DecisionTreeModel(root: DtNode(DtKind.decision, children: [DtNode(DtKind.end, payoff: 5)])).toJson(),
        KitKind.breakEven: const BreakEvenModel(fixedCost: 100, variableCost: 1, price: 2, units: 150).toJson(),
        KitKind.chart: ChartData.fromCsv('a,1\nb,2', kind: KitChartKind.bar).toJson(),
      };
      for (final MapEntry(key: kind, value: d) in data.entries) {
        final e = KitElement.sized(kind: kind, data: d, color: Colors.purple).translated(const Offset(10, 20));
        final j = jsonDecode(jsonEncode(encodeElement(e))) as Map<String, dynamic>;
        final back = decodeElement(j, e.id)! as KitElement;
        expect(back.kind, kind);
        expect(back.rect, e.rect);
        expect(jsonEncode(back.data), jsonEncode(e.data));
        final rec = ui.PictureRecorder();
        paintElement(Canvas(rec), back, BoardBackground.plain);
        rec.endRecording().dispose();
      }
      expect(decodeElement({'t': 'kit', 'r': [0, 0, 1, 1], 'k': 'nope', 'd': {}}, 'x'), isNull);
    });
  });
}
