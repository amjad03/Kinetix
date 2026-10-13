import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import '../../civil/civil_samples.dart';

// Blank and filled-in starting points for the live business panels, and the finance pad's
// formula sheets. Words are in English, as in the textbooks; the filled examples are
// illustrative (generic Indian businesses), not company data.

/// A live panel, blank or filled in with an example.
KitElement bizPanel(KitKind kind, Color accent, {bool sample = false}) => KitElement.sized(kind: kind, data: bizData(kind, sample: sample), color: accent);

Map<String, Object?> bizData(KitKind kind, {bool sample = false}) => switch (kind) {
  KitKind.bcg => (sample ? sampleBcg : const BcgMatrix(title: 'BCG growth–share matrix')).toJson(),
  KitKind.decisionTree => (sample ? sampleDecisionTree() : blankDecisionTree()).toJson(),
  KitKind.breakEven => (sample ? sampleBreakEven : const BreakEvenModel(fixedCost: 60000, variableCost: 30, price: 50, units: 5000)).toJson(),
  KitKind.chart => const ChartData(title: 'Chart').toJson(),
  _ => civilData(kind),
};

const sampleBcg = BcgMatrix(
  title: 'BCG matrix: an FMCG portfolio (illustrative)',
  products: [
    BcgProduct('Packaged tea', growth: 4, share: 2.5, revenue: 9e10),
    BcgProduct('Instant noodles', growth: 14, share: 1.6, revenue: 4e10),
    BcgProduct('Millet snacks', growth: 24, share: 0.3, revenue: 6e9),
    BcgProduct('Cold coffee (RTD)', growth: 18, share: 0.6, revenue: 8e9),
    BcgProduct('Detergent bar', growth: 1, share: 0.4, revenue: 9e9),
  ],
);

DecisionTreeModel blankDecisionTree() => DecisionTreeModel(
  root: DtNode(DtKind.decision, label: 'Decide', children: [
    for (final o in ['Option A', 'Option B'])
      DtNode(DtKind.chance, label: o, children: [
        DtNode(DtKind.end, label: 'Good', probability: 0.5),
        DtNode(DtKind.end, label: 'Bad', probability: 0.5),
      ]),
  ]),
);

/// Should a bakery in Pune open a second outlet? Figures in rupees over three years.
DecisionTreeModel sampleDecisionTree() => DecisionTreeModel(
  title: 'Decision tree: a Pune bakery’s expansion (illustrative)',
  root: DtNode(DtKind.decision, label: 'Expand?', children: [
    DtNode(DtKind.chance, label: 'Open a second outlet', cost: 1200000, children: [
      DtNode(DtKind.end, label: 'High footfall', probability: 0.6, payoff: 3000000),
      DtNode(DtKind.end, label: 'Low footfall', probability: 0.4, payoff: 800000),
    ]),
    DtNode(DtKind.chance, label: 'Enlarge the present shop', cost: 500000, children: [
      DtNode(DtKind.end, label: 'High demand', probability: 0.6, payoff: 1500000),
      DtNode(DtKind.end, label: 'Low demand', probability: 0.4, payoff: 900000),
    ]),
    DtNode(DtKind.end, label: 'Do nothing', payoff: 0),
  ]),
);

const sampleBreakEven = BreakEvenModel(title: 'Break-even: a tiffin service in Bengaluru, per month (illustrative)', fixedCost: 60000, variableCost: 45, price: 80, units: 2500);

// --- Finance pad -------------------------------------------------------------------------------

enum FinanceTemplate { npv, ratios, breakEven, slm, wdv, loan }

const _g = SheetFormat.general, _inr = SheetFormat.inr, _pct = SheetFormat.percent, _num = SheetFormat.number;

/// [first] and the [count] − 1 rows after it, each a copy of the one above as a fill handle
/// copies it.
List<List<String>> _filled(List<String> first, int count) {
  final rows = [first];
  for (var i = 1; i < count; i++) {
    rows.add([for (final c in rows.last) shiftFormula(c, 1, 0)]);
  }
  return rows;
}

SheetElement _sheet(List<List<String>> rows, Color accent, List<SheetFormat> formats, List<double> widths, {Map<(int, int), SheetFormat> cells = const {}}) {
  final cols = formats.length;
  return SheetElement.sized(
    rows: rows.length,
    cols: cols,
    cells: [for (final r in rows) for (var c = 0; c < cols; c++) c < r.length ? r[c] : ''],
    color: accent,
    formats: formats,
    widths: widths,
    cellFormats: {for (final e in cells.entries) e.key.$1 * cols + e.key.$2: e.value},
  );
}

/// A formula sheet to fill in: change the inputs and everything after them works itself out.
SheetElement financeTemplate(FinanceTemplate t, Color accent) {
  switch (t) {
    case FinanceTemplate.npv:
      // Rows 2–7: years 0–5; the rate in B10.
      final years = [
        ['0', '-500000'],
        ['1', '150000'],
        ['2', '160000'],
        ['3', '170000'],
        ['4', '140000'],
        ['5', '120000'],
      ];
      return _sheet(
        [
          ['Year', 'Cash flow', 'Discount factor', 'Present value'],
          for (final (i, y) in years.indexed) [y[0], y[1], '=ROUND(1/(1+\$B\$10)^A${i + 2}, 4)', '=B${i + 2}*C${i + 2}'],
          ['NPV', '=SUM(D2:D7)', 'Accept if NPV ≥ 0', ''],
          ['IRR', '=IRR(B2:B7)', 'Accept if IRR > rate', ''],
          ['Discount rate', '12%', '', ''],
          ['NPV (function)', '=B2+NPV(B10, B3:B7)', 'Profitability index', '=ROUND(SUM(D3:D7)/-D2, 2)'],
        ],
        accent,
        const [_g, _inr, _g, _inr],
        const [190, 170, 210, 170],
        cells: const {(8, 1): _pct, (9, 1): _pct, (10, 3): _g},
      );
    case FinanceTemplate.ratios:
      final inputs = [
        ('Current assets', '500000', ''),
        ('Inventory', '150000', ''),
        ('Prepaid expenses', '10000', ''),
        ('Current liabilities', '250000', ''),
        ('Long-term debt', '400000', ''),
        ('Shareholders’ funds', '800000', ''),
        ('Total assets', '1450000', ''),
        ('Revenue from operations', '2000000', ''),
        ('Cost of revenue from operations', '1300000', ''),
        ('Gross profit', '=B9-B10', 'Revenue − cost of revenue'),
        ('EBIT', '300000', ''),
        ('Interest', '40000', ''),
        ('Net profit after tax', '180000', ''),
        ('Trade receivables', '200000', ''),
        ('Average inventory', '140000', ''),
      ];
      final ratios = [
        ('LIQUIDITY', '', '', null),
        ('Current ratio (:1)', '=ROUND(B2/B5, 2)', 'Current assets ÷ current liabilities', _g),
        ('Quick ratio (:1)', '=ROUND((B2-B3-B4)/B5, 2)', '(CA − inventory − prepaid) ÷ CL', _g),
        ('LEVERAGE', '', '', null),
        ('Debt–equity ratio (:1)', '=ROUND(B6/B7, 2)', 'Long-term debt ÷ shareholders’ funds', _g),
        ('Interest coverage (times)', '=ROUND(B12/B13, 2)', 'EBIT ÷ interest', _g),
        ('PROFITABILITY', '', '', null),
        ('Gross profit ratio', '=B11/B9', 'Gross profit ÷ revenue', _pct),
        ('Net profit ratio', '=B14/B9', 'Net profit ÷ revenue', _pct),
        ('Return on equity', '=B14/B7', 'Net profit ÷ shareholders’ funds', _pct),
        ('Return on assets', '=B14/B8', 'Net profit ÷ total assets', _pct),
        ('EFFICIENCY', '', '', null),
        ('Inventory turnover (times)', '=ROUND(B10/B16, 2)', 'Cost of revenue ÷ average inventory', _g),
        ('Receivables turnover (times)', '=ROUND(B9/B15, 2)', 'Revenue ÷ trade receivables', _g),
        ('Collection period (days)', '=ROUND(365/B30, 0)', '365 ÷ receivables turnover', _g),
        ('Total assets turnover (times)', '=ROUND(B9/B8, 2)', 'Revenue ÷ total assets', _g),
      ];
      final rows = [
        ['Item', 'Amount', 'Formula'],
        for (final (a, b, c) in inputs) [a, b, c],
        for (final (a, b, c, _) in ratios) [a, b, c],
      ];
      return _sheet(rows, accent, const [_g, _inr, _g], const [300, 190, 360], cells: {
        for (final (i, r) in ratios.indexed)
          if (r.$4 != null) (inputs.length + 1 + i, 1): r.$4!,
      });
    case FinanceTemplate.breakEven:
      return _sheet(
        const [
          ['Item', 'Value', 'Formula'],
          ['Fixed cost', '60000', ''],
          ['Variable cost per unit', '30', ''],
          ['Selling price per unit', '50', ''],
          ['Planned sales (units)', '5000', ''],
          ['Contribution per unit', '=B4-B3', 'SP − VC'],
          ['P/V ratio', '=B6/B4', 'Contribution ÷ SP'],
          ['Break-even point (units)', '=ROUND(B2/B6, 0)', 'Fixed cost ÷ contribution per unit'],
          ['Break-even sales', '=B2/B7', 'Fixed cost ÷ P/V ratio'],
          ['Margin of safety (units)', '=B5-B8', 'Planned − BEP'],
          ['Margin of safety %', '=B10/B5', 'MoS ÷ planned sales'],
          ['Profit', '=B5*B6-B2', 'Units × contribution − fixed cost'],
          ['Units for a target profit of', '50000', ''],
          ['…needs sales of (units)', '=ROUND((B2+B13)/B6, 0)', '(FC + target) ÷ contribution'],
        ],
        accent,
        const [_g, _inr, _g],
        const [290, 180, 330],
        cells: const {(4, 1): _num, (6, 1): _pct, (7, 1): _num, (9, 1): _num, (10, 1): _pct, (13, 1): _num},
      );
    case FinanceTemplate.slm:
      return _sheet(
        [
          ['Item', 'Value', 'Item', 'Value'],
          ['Cost of asset', '100000', 'Scrap value', '10000'],
          ['Useful life (years)', '5', 'Depreciation a year', r'=(B2-D2)/B3'],
          ['Year', 'Opening WDV', 'Depreciation', 'Closing WDV'],
          ['1', '=B2', r'=$D$3', '=B5-C5'],
          ..._filled(['=A5+1', '=D5', r'=$D$3', '=B6-C6'], 4),
        ],
        accent,
        const [_g, _inr, _inr, _inr],
        const [200, 180, 200, 180],
        cells: const {(2, 1): _g, (3, 1): _g, (3, 2): _g, (3, 3): _g},
      );
    case FinanceTemplate.wdv:
      return _sheet(
        [
          ['Item', 'Value', 'Item', 'Value'],
          ['Cost of asset', '100000', 'Rate a year', '20%'],
          ['Year', 'Opening WDV', 'Depreciation', 'Closing WDV'],
          ['1', '=B2', r'=B4*$D$2', '=B4-C4'],
          ..._filled(['=A4+1', '=D4', r'=B5*$D$2', '=B5-C5'], 4),
        ],
        accent,
        const [_g, _inr, _inr, _inr],
        const [200, 180, 200, 180],
        cells: const {(1, 3): _pct, (2, 1): _g, (2, 2): _g, (2, 3): _g},
      );
    case FinanceTemplate.loan:
      return _sheet(
        [
          ['Item', 'Value', 'Item', 'Value', ''],
          ['Loan amount', '100000', 'Interest rate a year', '12%', ''],
          ['Months', '12', 'EMI', r'=-PMT(D2/12, B3, B2)', ''],
          ['Month', 'Opening balance', 'Interest', 'Principal', 'Closing balance'],
          ['1', '=B2', r'=ROUND(B5*$D$2/12, 2)', r'=$D$3-C5', '=B5-D5'],
          ..._filled(['=A5+1', '=E5', r'=ROUND(B6*$D$2/12, 2)', r'=$D$3-C6', '=B6-D6'], 11),
          ['Total', '', '=SUM(C5:C16)', '=SUM(D5:D16)', ''],
        ],
        accent,
        const [_g, _inr, _inr, _inr, _inr],
        const [150, 180, 190, 170, 180],
        cells: const {(1, 3): _pct, (2, 1): _g, (3, 1): _g, (3, 2): _g, (3, 3): _g, (3, 4): _g},
      );
  }
}
