import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../lab_scaffold.dart';
import '../models/break_even.dart';

/// Break-even chart and marginal costing figures (BU BCom Cost Accounting).
class BreakEvenLab extends StatefulWidget {
  const BreakEvenLab({super.key});

  @override
  State<BreakEvenLab> createState() => _BreakEvenLabState();
}

class _BreakEvenLabState extends State<BreakEvenLab> {
  static const _initial = BreakEven(fixedCost: 200000, variableCostPerUnit: 60, sellingPrice: 100, salesUnits: 8000);
  BreakEven _b = _initial;

  @override
  Widget build(BuildContext context) {
    final b = _b;
    final pal = LabPalette(context);
    final ok = b.canBreakEven;
    String pct(double v) => '${v.toStringAsFixed(2)}%';
    return LabScaffold(
      title: 'Break-even analysis',
      subtitle: 'BCom Cost Accounting · Marginal costing and CVP analysis',
      formula: 'BEP (units) = Fixed cost ÷ Contribution per unit   ·   P/V ratio = Contribution ÷ Sales × 100',
      aim: 'To find the break-even point, the P/V ratio and the margin of safety, and to read them from a break-even chart.',
      observe: const [
        'At the break-even point total cost equals sales: no profit, no loss.',
        'Raising the selling price or cutting the variable cost raises the contribution and lowers the BEP.',
        'Higher fixed costs push the BEP to the right.',
        'The margin of safety is how far sales can fall before the business makes a loss.',
      ],
      onReset: () => setState(() => _b = _initial),
      simulation: CustomPaint(key: const ValueKey('bep-chart'), painter: _BreakEvenPainter(b, pal), size: Size.infinite),
      readouts: [
        Readout('Contribution per unit', formatInr(b.contributionPerUnit)),
        Readout('P/V ratio', ok ? pct(b.pvRatio * 100) : '–'),
        Readout('Break-even (units)', ok ? formatUnits(b.breakEvenUnits, decimals: 2) : 'Never', highlight: true, key: const ValueKey('readout-bep-units')),
        Readout('Break-even sales', ok ? formatInr(b.breakEvenSales) : '–', highlight: true, key: const ValueKey('readout-bep-sales')),
        Readout(b.profit >= 0 ? 'Profit at ${formatUnits(b.salesUnits)} units' : 'Loss at ${formatUnits(b.salesUnits)} units', formatInr(b.profit.abs())),
        Readout('Sales', formatInr(b.sales)),
        Readout('Margin of safety (units)', ok ? formatUnits(b.marginOfSafetyUnits, decimals: 2) : '–'),
        Readout('Margin of safety', ok ? '${formatInr(b.marginOfSafetySales)} (${pct(b.marginOfSafetyPercent)})' : '–', key: const ValueKey('readout-mos')),
      ],
      controls: [
        LabSlider(
          key: const ValueKey('slider-fixed'),
          label: 'Fixed cost (F)',
          value: b.fixedCost,
          min: 10000,
          max: 1000000,
          divisions: 198,
          format: (v) => formatInr(v, decimals: 0),
          onChanged: (v) => setState(() => _b = b.copyWith(fixedCost: v)),
        ),
        LabSlider(
          key: const ValueKey('slider-variable'),
          label: 'Variable cost per unit (V)',
          value: b.variableCostPerUnit,
          min: 5,
          max: 500,
          divisions: 99,
          format: (v) => formatInr(v, decimals: 0),
          onChanged: (v) => setState(() => _b = b.copyWith(variableCostPerUnit: v)),
        ),
        LabSlider(
          key: const ValueKey('slider-price'),
          label: 'Selling price per unit (S)',
          value: b.sellingPrice,
          min: 10,
          max: 1000,
          divisions: 198,
          format: (v) => formatInr(v, decimals: 0),
          onChanged: (v) => setState(() => _b = b.copyWith(sellingPrice: v)),
        ),
        LabSlider(
          key: const ValueKey('slider-sales'),
          label: 'Actual / budgeted sales',
          value: b.salesUnits,
          min: 0,
          max: 50000,
          divisions: 500,
          format: (v) => '${formatUnits(v)} units',
          onChanged: (v) => setState(() => _b = b.copyWith(salesUnits: v)),
        ),
      ],
    );
  }
}

class _BreakEvenPainter extends CustomPainter {
  _BreakEvenPainter(this.b, this.pal);
  final BreakEven b;
  final LabPalette pal;

  @override
  void paint(Canvas canvas, Size size) {
    final s = (math.min(size.width / 700, size.height / 400)).clamp(0.85, 1.5);
    final small = pal.textStyle.copyWith(fontSize: 12 * s, color: pal.muted);
    final label = pal.textStyle.copyWith(fontSize: 13.5 * s, color: pal.ink, fontWeight: FontWeight.w700);
    final l = 78.0 * s, r = 20.0 * s, t = 40.0 * s, bt = 46.0 * s;
    final plot = Rect.fromLTRB(l, t, size.width - r, size.height - bt);
    if (plot.width < 60 || plot.height < 60) return;

    final bep = b.canBreakEven ? b.breakEvenUnits : 0.0;
    final xMax = _nice(math.max(1000, math.max(b.salesUnits, bep) * 1.35));
    final yMax = _nice(math.max(b.revenueAt(xMax), b.totalCostAt(xMax)) * 1.05);
    Offset at(double x, double y) => Offset(plot.left + x / xMax * plot.width, plot.bottom - y / yMax * plot.height);

    // Grid and axes.
    final grid = Paint()
      ..color = pal.grid
      ..strokeWidth = 1;
    for (var k = 0; k <= 5; k++) {
      final x = xMax * k / 5, y = yMax * k / 5;
      canvas.drawLine(at(x, 0), at(x, yMax), grid);
      canvas.drawLine(at(0, y), at(xMax, y), grid);
      paintLabel(canvas, formatUnits(x), at(x, 0) + Offset(0, 6 * s), small, align: Alignment.topCenter);
      paintLabel(canvas, formatInrCompact(y), at(0, y) - Offset(6 * s, 0), small, align: Alignment.centerRight);
    }
    final axis = Paint()
      ..color = pal.ink
      ..strokeWidth = 1.8 * s;
    canvas.drawLine(plot.bottomLeft, plot.bottomRight, axis);
    canvas.drawLine(plot.bottomLeft, plot.topLeft, axis);
    paintLabel(canvas, 'Units →', Offset(plot.right, plot.bottom + 26 * s), small, align: Alignment.topRight);
    paintLabel(canvas, '₹ cost / sales', Offset(plot.left - 8 * s, t - 12 * s), small, align: Alignment.bottomLeft);

    // Profit and loss wedges between the sales and total cost lines.
    if (b.canBreakEven && bep < xMax) {
      final loss = Path()
        ..moveTo(at(0, 0).dx, at(0, 0).dy)
        ..lineTo(at(bep, b.revenueAt(bep)).dx, at(bep, b.revenueAt(bep)).dy)
        ..lineTo(at(0, b.fixedCost).dx, at(0, b.fixedCost).dy)
        ..close();
      canvas.drawPath(loss, Paint()..color = pal.red.withValues(alpha: 0.16));
      final profit = Path()
        ..moveTo(at(bep, b.revenueAt(bep)).dx, at(bep, b.revenueAt(bep)).dy)
        ..lineTo(at(xMax, b.revenueAt(xMax)).dx, at(xMax, b.revenueAt(xMax)).dy)
        ..lineTo(at(xMax, b.totalCostAt(xMax)).dx, at(xMax, b.totalCostAt(xMax)).dy)
        ..close();
      canvas.drawPath(profit, Paint()..color = pal.green.withValues(alpha: 0.16));
      paintLabel(canvas, 'Loss', at(bep / 3, (b.revenueAt(bep) + b.fixedCost) / 3), label.copyWith(color: pal.red));
      paintLabel(canvas, 'Profit', at((bep + 2 * xMax) / 3, (b.revenueAt(bep) + b.revenueAt(xMax) + b.totalCostAt(xMax)) / 3), label.copyWith(color: pal.green));
    }

    Paint line(Color c, {double w = 3}) => Paint()
      ..color = c
      ..strokeWidth = w * s
      ..strokeCap = StrokeCap.round;
    // Fixed cost (dashed), total cost, sales.
    final fc = line(pal.muted, w: 2);
    for (var x = 0.0; x < xMax; x += xMax / 40) {
      canvas.drawLine(at(x, b.fixedCost), at(math.min(x + xMax / 80, xMax), b.fixedCost), fc);
    }
    canvas.drawLine(at(0, b.fixedCost), at(xMax, b.totalCostAt(xMax)), line(pal.red));
    canvas.drawLine(at(0, 0), at(xMax, b.revenueAt(xMax)), line(pal.blue));
    final salesAbove = b.revenueAt(xMax) >= b.totalCostAt(xMax);
    _endLabel(canvas, 'Sales', at(xMax, b.revenueAt(xMax)), pal.blue, label, plot, above: salesAbove);
    _endLabel(canvas, 'Total cost', at(xMax, b.totalCostAt(xMax)), pal.red, label, plot, above: !salesAbove);
    paintLabel(canvas, 'Fixed cost', at(xMax, b.fixedCost) + Offset(-4 * s, -6 * s), label.copyWith(color: pal.muted), align: Alignment.bottomRight);

    // Actual sales and margin of safety.
    if (b.salesUnits > 0 && b.salesUnits <= xMax) {
      final top = at(b.salesUnits, math.max(b.sales, b.totalCostAt(b.salesUnits)));
      final base = at(b.salesUnits, 0);
      final p = line(pal.amber, w: 2);
      for (var y = base.dy; y > top.dy; y -= 10 * s) {
        canvas.drawLine(Offset(base.dx, y), Offset(base.dx, math.max(top.dy, y - 5 * s)), p);
      }
      paintLabel(canvas, 'Actual sales', top - Offset(0, 6 * s), label.copyWith(color: pal.amber), align: Alignment.bottomCenter);
      if (b.canBreakEven && b.marginOfSafetyUnits > 0) {
        final y = plot.bottom - 14 * s;
        final a = Offset(at(bep, 0).dx, y), c = Offset(base.dx, y);
        canvas.drawLine(a, c, line(pal.amber, w: 2.4));
        canvas.drawLine(a - Offset(0, 6 * s), a + Offset(0, 6 * s), p);
        canvas.drawLine(c - Offset(0, 6 * s), c + Offset(0, 6 * s), p);
        paintLabel(canvas, 'Margin of safety', Offset((a.dx + c.dx) / 2, y - 6 * s), small.copyWith(color: pal.amber, fontWeight: FontWeight.w700), align: Alignment.bottomCenter, background: pal.surface.withValues(alpha: 0.8));
      }
    }

    // Break-even point.
    if (b.canBreakEven && bep <= xMax) {
      final p = at(bep, b.breakEvenSales);
      canvas.drawLine(p, at(bep, 0), line(pal.ink.withValues(alpha: 0.5), w: 1.4));
      canvas.drawCircle(p, 7 * s, Paint()..color = pal.ink);
      canvas.drawCircle(p, 4 * s, Paint()..color = pal.amber);
      final txt = 'BEP: ${formatUnits(bep)} units · ${formatInrCompact(b.breakEvenSales)}';
      final leftSide = p.dx > plot.center.dx;
      paintLabel(canvas, txt, p + Offset(leftSide ? -12 * s : 12 * s, -10 * s), label, align: leftSide ? Alignment.bottomRight : Alignment.bottomLeft, background: pal.surface.withValues(alpha: 0.85));
    } else if (!b.canBreakEven) {
      paintLabel(canvas, 'Selling price ≤ variable cost: no break-even point', Offset(plot.center.dx, plot.top + 10 * s), label.copyWith(color: pal.red), align: Alignment.topCenter, background: pal.surface);
    } else {
      paintLabel(canvas, 'BEP beyond the chart', Offset(plot.center.dx, plot.top + 10 * s), label, align: Alignment.topCenter, background: pal.surface);
    }
  }

  void _endLabel(Canvas canvas, String text, Offset p, Color c, TextStyle style, Rect plot, {required bool above}) {
    // Sit just above (or below) the end of the line, clear of it.
    final y = above ? math.max(plot.top + 24, p.dy - 14) : math.min(plot.bottom - 4, p.dy + 18);
    paintLabel(canvas, text, Offset(p.dx - 8, y), style.copyWith(color: c), align: above ? Alignment.bottomRight : Alignment.topRight);
  }

  static double _nice(double v) {
    final e = math.pow(10, (math.log(v) / math.ln10).floor()).toDouble();
    for (final m in [1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 6.0, 8.0, 10.0]) {
      if (v <= m * e) return m * e;
    }
    return 10 * e;
  }

  @override
  bool shouldRepaint(_BreakEvenPainter old) => true;
}
