import 'dart:math' as math;

import 'package:kinetix_ink/kinetix_ink.dart' show formatGeneral, formatInr;
import 'package:kinetix_labs/kinetix_labs.dart' show BreakEven;

// Commerce calculators that show their working, as a B.Com / BBA answer would: each returns
// the steps in order and the answer. The working is in English, as in the textbooks (the
// maths solver's working is too).

/// A worked answer: a title, the steps, and the answer, plus a table when there is one
/// (header row first).
class Working {
  const Working(this.title, this.steps, this.answer, {this.table});
  final String title;
  final List<String> steps;
  final String answer;
  final List<List<String>>? table;

  /// Everything as text, for the board.
  String get text => [...steps, answer].join('\n');
}

String inr(double v) => formatInr(v);
String n2(double v) => formatGeneral(double.parse(v.toStringAsFixed(2)));
String n4(double v) => formatGeneral(double.parse(v.toStringAsFixed(4)));
String pct(double v) => '${n2(v)}%';

// --- Depreciation ---------------------------------------------------------------------------

/// Straight-line method: (cost − scrap) ÷ life every year.
Working depreciationSlm({required double cost, required double scrap, required double life, int? years}) {
  final dep = (cost - scrap) / life;
  final rows = <List<String>>[
    ['Year', 'Opening WDV', 'Depreciation', 'Closing WDV'],
  ];
  var book = cost;
  for (var y = 1; y <= (years ?? life.ceil()).clamp(1, 50); y++) {
    final d = math.min(dep, book - scrap);
    rows.add(['$y', n2(book), n2(d), n2(book - d)]);
    book -= d;
  }
  return Working(
    'Depreciation: straight-line method',
    [
      'Depreciation = (Cost − Scrap value) ÷ Useful life',
      '= (${inr(cost)} − ${inr(scrap)}) ÷ ${n2(life)}',
      'Rate = ${n2(dep)} ÷ ${n2(cost)} × 100 = ${pct(dep / cost * 100)} on cost',
    ],
    'Annual depreciation = ${inr(dep)}',
    table: rows,
  );
}

/// Written-down-value method at [rate] % a year on the opening balance.
Working depreciationWdv({required double cost, required double rate, required int years}) {
  final rows = <List<String>>[
    ['Year', 'Opening WDV', 'Depreciation @ ${n2(rate)}%', 'Closing WDV'],
  ];
  var book = cost;
  var total = 0.0;
  for (var y = 1; y <= years.clamp(1, 50); y++) {
    final d = book * rate / 100;
    rows.add(['$y', n2(book), n2(d), n2(book - d)]);
    total += d;
    book -= d;
  }
  return Working(
    'Depreciation: written-down-value method',
    [
      'Depreciation = Opening WDV × ${n2(rate)}%',
      'Year 1: ${inr(cost)} × ${n2(rate)}% = ${inr(cost * rate / 100)}',
      'Closing WDV after $years years = Cost × (1 − r)^n = ${inr(cost)} × ${n4(1 - rate / 100)}^$years',
      'Total depreciation = ${inr(total)}',
    ],
    'WDV after $years years = ${inr(book)}',
    table: rows,
  );
}

/// The WDV rate that brings [cost] down to [scrap] in [life] years: 1 − (S/C)^(1/n).
double wdvRateFor({required double cost, required double scrap, required double life}) => (1 - math.pow(scrap / cost, 1 / life)) * 100;

// --- Interest and EMI -----------------------------------------------------------------------

Working simpleInterest({required double principal, required double rate, required double years}) {
  final si = principal * rate * years / 100;
  return Working('Simple interest', [
    'SI = P × R × T ÷ 100',
    '= ${inr(principal)} × ${n2(rate)} × ${n2(years)} ÷ 100 = ${inr(si)}',
    'Amount = P + SI = ${inr(principal)} + ${inr(si)}',
  ], 'Amount = ${inr(principal + si)}');
}

/// Compound interest, compounded [perYear] times a year.
Working compoundInterest({required double principal, required double rate, required double years, int perYear = 1}) {
  final i = rate / 100 / perYear;
  final n = years * perYear;
  final amount = principal * math.pow(1 + i, n);
  return Working('Compound interest', [
    'A = P (1 + R/(100·m))^(m·n), m = $perYear',
    '= ${inr(principal)} × (1 + ${n4(i)})^${n2(n)}',
    '= ${inr(principal)} × ${n4(math.pow(1 + i, n).toDouble())} = ${inr(amount)}',
    'CI = A − P = ${inr(amount)} − ${inr(principal)}',
  ], 'CI = ${inr(amount - principal)}');
}

/// Equated monthly instalment on a loan of [principal] at [rate] % a year for [months].
double emiOf(double principal, double rate, int months) {
  final r = rate / 1200;
  if (r == 0) return principal / months;
  final f = math.pow(1 + r, months);
  return principal * r * f / (f - 1);
}

Working emi({required double principal, required double rate, required int months}) {
  final r = rate / 1200;
  final e = emiOf(principal, rate, months);
  final rows = <List<String>>[
    ['Month', 'EMI', 'Interest', 'Principal', 'Balance'],
  ];
  var bal = principal;
  for (var m = 1; m <= math.min(months, 12); m++) {
    final interest = bal * r;
    bal -= e - interest;
    rows.add(['$m', n2(e), n2(interest), n2(e - interest), n2(bal.abs() < 0.005 ? 0 : bal)]);
  }
  return Working(
    'EMI',
    [
      'EMI = P × r × (1 + r)^n ÷ ((1 + r)^n − 1), r = ${n2(rate)} ÷ 12 ÷ 100 = ${n4(r)}, n = $months',
      '= ${inr(principal)} × ${n4(r)} × ${n4(math.pow(1 + r, months).toDouble())} ÷ ${n4(math.pow(1 + r, months) - 1)}',
      'Total paid = ${inr(e * months)}; total interest = ${inr(e * months - principal)}',
    ],
    'EMI = ${inr(e)} a month',
    table: rows,
  );
}

// --- GST ------------------------------------------------------------------------------------

/// GST on [amount] at [rate] %: CGST + SGST within a state, IGST between states. With
/// [inclusive], [amount] already includes the tax.
Working gst({required double amount, required double rate, required bool interState, bool inclusive = false}) {
  final base = inclusive ? amount * 100 / (100 + rate) : amount;
  final tax = base * rate / 100;
  return Working(
    inclusive ? 'GST (price includes tax)' : 'GST',
    [
      if (inclusive) 'Taxable value = ${inr(amount)} × 100 ÷ (100 + ${n2(rate)}) = ${inr(base)}' else 'Taxable value = ${inr(base)}',
      'GST @ ${n2(rate)}% = ${inr(base)} × ${n2(rate)} ÷ 100 = ${inr(tax)}',
      if (interState)
        'Inter-state supply: IGST @ ${n2(rate)}% = ${inr(tax)}'
      else ...[
        'Intra-state supply: CGST @ ${n2(rate / 2)}% = ${inr(tax / 2)}',
        'SGST @ ${n2(rate / 2)}% = ${inr(tax / 2)}',
      ],
    ],
    'Invoice value = ${inr(base + tax)}',
  );
}

// --- Capital budgeting ----------------------------------------------------------------------

double npvOf(double rate, double outlay, List<double> flows) {
  var v = -outlay;
  for (var t = 0; t < flows.length; t++) {
    v += flows[t] / math.pow(1 + rate / 100, t + 1);
  }
  return v;
}

/// The rate (%) at which NPV is nil, by bisection; null when there is none between −99% and
/// 1000%.
double? irrOf(double outlay, List<double> flows) {
  double f(double r) => npvOf(r, outlay, flows);
  var lo = -99.0, hi = 1000.0;
  if (f(lo).sign == f(hi).sign) return null;
  for (var i = 0; i < 200; i++) {
    final mid = (lo + hi) / 2;
    if (f(lo).sign == f(mid).sign) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

/// Years until the cash flows pay back [outlay] (within a year by straight interpolation).
double? paybackOf(double outlay, List<double> flows) {
  var left = outlay;
  for (var t = 0; t < flows.length; t++) {
    if (flows[t] >= left) return t + left / flows[t];
    left -= flows[t];
  }
  return null;
}

Working npv({required double outlay, required List<double> flows, required double rate}) {
  final rows = <List<String>>[
    ['Year', 'Cash inflow', 'PV factor @ ${n2(rate)}%', 'Present value'],
  ];
  var total = 0.0;
  for (var t = 0; t < flows.length; t++) {
    final f = 1 / math.pow(1 + rate / 100, t + 1);
    total += flows[t] * f;
    rows.add(['${t + 1}', n2(flows[t]), n4(f), n2(flows[t] * f)]);
  }
  final v = total - outlay;
  final irr = irrOf(outlay, flows);
  final pb = paybackOf(outlay, flows);
  final discounted = [for (var t = 0; t < flows.length; t++) flows[t] / math.pow(1 + rate / 100, t + 1)];
  final dpb = paybackOf(outlay, discounted);
  return Working(
    'NPV, IRR and payback',
    [
      'PV of inflows = Σ CF_t ÷ (1 + k)^t = ${inr(total)}',
      'NPV = PV of inflows − Initial outlay = ${inr(total)} − ${inr(outlay)} = ${inr(v)}',
      'Decision: ${v >= 0 ? 'NPV ≥ 0, accept' : 'NPV < 0, reject'}',
      'Profitability index = ${n4(total / outlay)}',
      irr == null ? 'IRR: none (cash flows never pay back)' : 'IRR (NPV = 0) = ${pct(irr)}',
      pb == null ? 'Payback: not within ${flows.length} years' : 'Payback period = ${n2(pb)} years',
      dpb == null ? 'Discounted payback: not within ${flows.length} years' : 'Discounted payback = ${n2(dpb)} years',
    ],
    'NPV = ${inr(v)}',
    table: rows,
  );
}

// --- Break-even (marginal costing) ----------------------------------------------------------

/// The break-even working, from the break-even lab's model.
Working breakEven({required double fixedCost, required double variableCost, required double price, required double units}) {
  final b = BreakEven(fixedCost: fixedCost, variableCostPerUnit: variableCost, sellingPrice: price, salesUnits: units);
  if (!b.canBreakEven) {
    return Working('Break-even analysis', ['Contribution per unit = ${inr(price)} − ${inr(variableCost)} = ${inr(b.contributionPerUnit)}'], 'No break-even: price must exceed variable cost');
  }
  return Working('Break-even analysis', [
    'Contribution per unit = SP − VC = ${inr(price)} − ${inr(variableCost)} = ${inr(b.contributionPerUnit)}',
    'P/V ratio = Contribution ÷ Sales × 100 = ${pct(b.pvRatio * 100)}',
    'BEP (units) = Fixed cost ÷ Contribution per unit = ${inr(fixedCost)} ÷ ${inr(b.contributionPerUnit)} = ${n2(b.breakEvenUnits)} units',
    'BEP (₹) = Fixed cost ÷ P/V ratio = ${inr(b.breakEvenSales)}',
    'Margin of safety = ${inr(b.sales)} − ${inr(b.breakEvenSales)} = ${inr(b.marginOfSafetySales)} (${pct(b.marginOfSafetyPercent)})',
    'Profit at ${n2(units)} units = ${inr(b.profit)}',
  ], 'BEP = ${n2(b.breakEvenUnits)} units = ${inr(b.breakEvenSales)}');
}

// --- Ratios ---------------------------------------------------------------------------------

/// The figures a ratio sheet needs; leave out what is not given.
class RatioInputs {
  const RatioInputs({
    this.currentAssets,
    this.currentLiabilities,
    this.inventory,
    this.prepaid,
    this.debt,
    this.equity,
    this.revenue,
    this.grossProfit,
    this.netProfit,
    this.cogs,
    this.averageInventory,
    this.receivables,
    this.ebit,
    this.interest,
    this.totalAssets,
  });

  final double? currentAssets, currentLiabilities, inventory, prepaid, debt, equity, revenue, grossProfit, netProfit, cogs, averageInventory, receivables, ebit, interest, totalAssets;
}

/// The usual liquidity, solvency, activity and profitability ratios for what is given.
Working ratios(RatioInputs i) {
  final steps = <String>[];
  void add(String name, String formula, double? a, double? b, {bool percent = false, String unit = ':1', double k = 1}) {
    if (a == null || b == null || b == 0) return;
    final v = a / b * k;
    steps.add('$name = $formula = ${n2(a)} ÷ ${n2(b)}${k != 1 ? ' × ${n2(k)}' : ''} = ${percent ? pct(v * 100) : '${n2(v)}$unit'}');
  }

  final quick = i.currentAssets == null ? null : i.currentAssets! - (i.inventory ?? 0) - (i.prepaid ?? 0);
  add('Current ratio', 'Current assets ÷ Current liabilities', i.currentAssets, i.currentLiabilities);
  add('Quick ratio', 'Quick assets ÷ Current liabilities', quick, i.currentLiabilities);
  add('Debt–equity ratio', 'Long-term debt ÷ Shareholders’ funds', i.debt, i.equity);
  add('Gross profit ratio', 'Gross profit ÷ Revenue from operations', i.grossProfit, i.revenue, percent: true);
  add('Net profit ratio', 'Net profit ÷ Revenue from operations', i.netProfit, i.revenue, percent: true);
  add('Return on equity', 'Net profit ÷ Shareholders’ funds', i.netProfit, i.equity, percent: true);
  add('Return on assets', 'Net profit ÷ Total assets', i.netProfit, i.totalAssets, percent: true);
  add('Inventory turnover', 'Cost of revenue from operations ÷ Average inventory', i.cogs, i.averageInventory, unit: ' times');
  add('Trade receivables turnover', 'Revenue from operations ÷ Trade receivables', i.revenue, i.receivables, unit: ' times');
  add('Interest coverage', 'EBIT ÷ Interest', i.ebit, i.interest, unit: ' times');
  add('Total assets turnover', 'Revenue from operations ÷ Total assets', i.revenue, i.totalAssets, unit: ' times');
  return Working('Accounting ratios', steps, steps.isEmpty ? 'Enter the figures you have' : '${steps.length} ratios');
}
