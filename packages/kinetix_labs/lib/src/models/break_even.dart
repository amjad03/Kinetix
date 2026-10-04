/// Marginal costing: break-even point, P/V ratio and margin of safety.
class BreakEven {
  const BreakEven({required this.fixedCost, required this.variableCostPerUnit, required this.sellingPrice, required this.salesUnits});

  final double fixedCost, variableCostPerUnit, sellingPrice, salesUnits;

  /// Contribution per unit = selling price − variable cost.
  double get contributionPerUnit => sellingPrice - variableCostPerUnit;

  /// Selling price must exceed variable cost for the business ever to break even.
  bool get canBreakEven => contributionPerUnit > 0;

  /// P/V ratio = contribution ÷ sales, as a fraction (× 100 for %).
  double get pvRatio => contributionPerUnit / sellingPrice;

  /// BEP (units) = fixed cost ÷ contribution per unit.
  double get breakEvenUnits => fixedCost / contributionPerUnit;

  /// BEP (₹) = fixed cost ÷ P/V ratio.
  double get breakEvenSales => fixedCost / pvRatio;

  double get sales => salesUnits * sellingPrice;
  double totalCostAt(double units) => fixedCost + variableCostPerUnit * units;
  double revenueAt(double units) => sellingPrice * units;
  double profitAt(double units) => contributionPerUnit * units - fixedCost;
  double get profit => profitAt(salesUnits);

  /// Margin of safety = actual sales − break-even sales (negative means a loss).
  double get marginOfSafetyUnits => salesUnits - breakEvenUnits;
  double get marginOfSafetySales => sales - breakEvenSales;
  double get marginOfSafetyPercent => sales == 0 ? 0 : marginOfSafetySales / sales * 100;

  BreakEven copyWith({double? fixedCost, double? variableCostPerUnit, double? sellingPrice, double? salesUnits}) => BreakEven(
        fixedCost: fixedCost ?? this.fixedCost,
        variableCostPerUnit: variableCostPerUnit ?? this.variableCostPerUnit,
        sellingPrice: sellingPrice ?? this.sellingPrice,
        salesUnits: salesUnits ?? this.salesUnits,
      );
}

/// Groups digits the Indian way: 12,34,56,789.
String groupIndian(int n) {
  final s = n.abs().toString();
  if (s.length <= 3) return '${n < 0 ? '−' : ''}$s';
  final last3 = s.substring(s.length - 3);
  var rest = s.substring(0, s.length - 3);
  final parts = <String>[];
  while (rest.length > 2) {
    parts.insert(0, rest.substring(rest.length - 2));
    rest = rest.substring(0, rest.length - 2);
  }
  if (rest.isNotEmpty) parts.insert(0, rest);
  return '${n < 0 ? '−' : ''}${parts.join(',')},$last3';
}

/// ₹1,23,456.78 (a minus sign before the ₹ for losses).
String formatInr(double v, {int decimals = 2}) {
  final neg = v < 0 && v.abs().toStringAsFixed(decimals) != (0).toStringAsFixed(decimals);
  final a = v.abs();
  if (decimals == 0) return '${neg ? '−' : ''}₹${groupIndian(a.round())}';
  final f = a.toStringAsFixed(decimals);
  final dot = f.indexOf('.');
  return '${neg ? '−' : ''}₹${groupIndian(int.parse(f.substring(0, dot)))}${f.substring(dot)}';
}

/// Short labels for chart axes: ₹50,000 · ₹2.5 L · ₹1.2 Cr.
String formatInrCompact(double v) {
  final a = v.abs();
  final sign = v < 0 ? '−' : '';
  String trim(double x) => x.toStringAsFixed(x >= 10 ? 0 : 1).replaceAll(RegExp(r'\.0$'), '');
  if (a >= 1e7) return '$sign₹${trim(a / 1e7)} Cr';
  if (a >= 1e5) return '$sign₹${trim(a / 1e5)} L';
  return '$sign₹${groupIndian(a.round())}';
}

/// Units with Indian grouping and up to [decimals] places.
String formatUnits(double v, {int decimals = 0}) {
  if (decimals == 0) return groupIndian(v.round());
  final f = v.abs().toStringAsFixed(decimals);
  final dot = f.indexOf('.');
  return '${v < 0 ? '−' : ''}${groupIndian(int.parse(f.substring(0, dot)))}${f.substring(dot)}';
}
