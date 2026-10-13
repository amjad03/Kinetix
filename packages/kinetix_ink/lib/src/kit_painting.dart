import 'dart:math' as math;
import 'dart:ui' show PointMode;

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'aiml_models.dart';
import 'aiml_painting.dart';
import 'biz_models.dart';
import 'chem_models.dart';
import 'chem_painting.dart';
import 'civil_models.dart';
import 'civil_painting.dart';
import 'cs_diagram_models.dart';
import 'cs_diagram_painting.dart';
import 'ece_models.dart';
import 'ece_painting.dart';
import 'ece_pins.dart';
import 'eee_models.dart';
import 'eee_painting.dart';
import 'ev_models.dart';
import 'ev_painting.dart';
import 'ink_models.dart';
import 'logic_models.dart';
import 'mech_models.dart';
import 'mech_painting.dart';
import 'sheet_formula.dart' show formatGeneral, formatInr, indianGrouping;
import 'sheet_painting.dart' show sheetChartColors;

// Drawing the live business panels (KitElement) on a white card, worked out: the BCG matrix's
// quadrants and bubbles, the decision tree's expected values and best path, the break-even
// chart and charts from data. Panel words are in English, as in the textbooks.

const _ink = Color(0xFF1B1F24);
const _muted = Color(0xFF6A7078);
const _line = Color(0x33000000);
const _good = Color(0xFF0F8A5F);
const _bad = Color(0xFFC62828);

void _text(Canvas canvas, String t, Offset at, {double size = 16, Color color = _ink, bool bold = false, TextAlign align = TextAlign.left, double maxWidth = 600, bool middle = true, int maxLines = 1}) {
  final tp = TextPainter(
    text: TextSpan(
      text: t,
      style: TextStyle(fontSize: size, color: color, fontWeight: bold ? FontWeight.w700 : FontWeight.w400, fontFamily: KxFonts.board, fontFamilyFallback: KxFonts.fallback),
    ),
    textDirection: TextDirection.ltr,
    maxLines: maxLines,
    ellipsis: '…',
  )..layout(maxWidth: math.max(0, maxWidth));
  final dx = switch (align) {
    TextAlign.right => at.dx - tp.width,
    TextAlign.center => at.dx - tp.width / 2,
    _ => at.dx,
  };
  tp.paint(canvas, Offset(dx, middle ? at.dy - tp.height / 2 : at.dy));
  tp.dispose();
}

Paint _stroke(Color c, double w) => Paint()
  ..color = c
  ..style = PaintingStyle.stroke
  ..strokeWidth = w
  ..strokeCap = StrokeCap.round
  ..strokeJoin = StrokeJoin.round;

void _dashed(Canvas canvas, Offset a, Offset b, Paint p, {double dash = 8, double gap = 6}) {
  final len = (b - a).distance;
  if (len == 0) return;
  final dir = (b - a) / len;
  for (var t = 0.0; t < len; t += dash + gap) {
    canvas.drawLine(a + dir * t, a + dir * math.min(len, t + dash), p);
  }
}

/// A short money figure: ₹1,23,456 (no paise when it is whole, lakh and crore past them).
String kitMoney(double v) {
  if (!v.isFinite) return '—';
  final a = v.abs();
  if (a >= 1e7) return '${v < 0 ? '-' : ''}₹${_trim(a / 1e7)} Cr';
  if (a >= 1e5) return '${v < 0 ? '-' : ''}₹${_trim(a / 1e5)} L';
  return formatInr(v, decimals: v == v.roundToDouble() ? 0 : 2);
}

String _trim(double v) => formatGeneral(double.parse(v.toStringAsFixed(2)));

String _num(double v) => !v.isFinite ? '—' : (v.abs() >= 1000 ? indianGrouping(v, decimals: v == v.roundToDouble() ? 0 : 2) : _trim(v));

/// About five round steps from [lo] to [hi].
List<double> chartTicks(double lo, double hi, {int count = 5}) {
  if (!(hi > lo)) return [lo];
  final step = niceCeil((hi - lo) / count);
  final out = <double>[];
  for (var v = (lo / step).ceil() * step; v <= hi + step * 1e-6; v += step) {
    out.add(double.parse(v.toStringAsFixed(6)));
  }
  return out;
}

/// Solved beams by panel data, so a board repaint does not solve them again.
final _beams = Expando<BeamResult>();

/// Paints [e] laid out at its natural size and scaled to its rect.
void paintKit(Canvas canvas, KitElement e) {
  final n = e.naturalSize;
  canvas
    ..save()
    ..translate(e.rect.left, e.rect.top)
    ..scale(e.rect.width / n.width, e.rect.height / n.height);
  final card = RRect.fromRectAndRadius(Offset.zero & n, const Radius.circular(10));
  canvas.drawRRect(card, Paint()..color = const Color(0xFFFFFFFF));
  try {
    switch (e.kind) {
      case KitKind.bcg:
        paintBcg(canvas, BcgMatrix.fromJson(e.data), n, e.color);
      case KitKind.decisionTree:
        paintDecisionTree(canvas, DecisionTreeModel.fromJson(e.data), n, e.color);
      case KitKind.breakEven:
        paintBreakEven(canvas, BreakEvenModel.fromJson(e.data), n, e.color);
      case KitKind.chart:
        paintChart(canvas, ChartData.fromJson(e.data), Offset.zero & n, e.color);
      case KitKind.beam:
        paintBeam(canvas, BeamModel.fromJson(e.data), n, e.color, result: _beams[e.data] ??= BeamModel.fromJson(e.data).solve());
      case KitKind.truss:
        paintTruss(canvas, TrussModel.fromJson(e.data), n, e.color);
      case KitKind.levelBook:
        paintLevelBook(canvas, LevelBook.fromJson(e.data), n, e.color);
      case KitKind.traverse:
        paintTraverse(canvas, Traverse.fromJson(e.data), n, e.color);
      case KitKind.contour:
        paintContours(canvas, ContourGrid.fromJson(e.data), n, e.color);
      case KitKind.drawingSheet:
        paintDrawingSheet(canvas, DrawingSheet.fromJson(e.data), n, e.color);
      case KitKind.thermoCycle:
        paintThermoCycle(canvas, ThermoCycle.fromJson(e.data), n, e.color);
      case KitKind.fbd:
        paintFbd(canvas, FbdModel.fromJson(e.data), n, e.color);
      case KitKind.rlc:
        paintRlc(canvas, RlcCircuit.fromJson(e.data), n, e.color);
      case KitKind.threePhase:
        paintThreePhase(canvas, ThreePhase.fromJson(e.data), n, e.color);
      case KitKind.singleLine:
        paintSld(canvas, SingleLineDiagram.fromJson(e.data), n, e.color);
      case KitKind.waveform:
        paintWaveform(canvas, WaveformPanel.fromJson(e.data), n, e.color);
      case KitKind.logicCircuit:
        paintLogicCircuit(canvas, LogicCircuit.fromJson(e.data), n, e.color);
      case KitKind.timing:
        paintTiming(canvas, TimingDiagram.fromJson(e.data), n, e.color);
      case KitKind.signal:
        paintSignal(canvas, SignalPanel.fromJson(e.data), n, e.color);
      case KitKind.bode:
        paintBode(canvas, BodePanel.fromJson(e.data), n, e.color);
      case KitKind.pinout:
        paintPinout(canvas, McuPinout.fromJson(e.data), n, e.color);
      case KitKind.csDiagram:
        paintCsDiagram(canvas, CsDiagram.fromJson(e.data), n, e.color);
      case KitKind.nnDiagram:
        paintNnDiagram(canvas, NnModel.fromJson(e.data), n, e.color);
      case KitKind.mlPlot:
        paintMlSnapshot(canvas, MlSnapshot.fromJson(e.data), n, e.color);
      case KitKind.pfd:
        paintPfd(canvas, PfdDiagram.fromJson(e.data), n, e.color);
      case KitKind.unitOp:
        paintUnitOp(canvas, UnitOpPanel.fromJson(e.data), n, e.color);
      case KitKind.evCharging:
        paintEvCharging(canvas, EvChargingPanel.fromJson(e.data), n, e.color);
      case KitKind.evPowerFlow:
        paintEvPowerFlow(canvas, EvPowerFlow.fromJson(e.data), n, e.color);
    }
  } on Object {
    _text(canvas, '—', n.center(Offset.zero), align: TextAlign.center);
  }
  canvas
    ..drawRRect(card, _stroke(_line, 1.5))
    ..restore();
}

// --- BCG ---------------------------------------------------------------------------------------

/// Where the BCG plot sits on a panel of [size] (the editor drags bubbles in the same frame).
Rect bcgPlot(Size size) => Rect.fromLTRB(110, 84, size.width - 30, size.height - 84);

const bcgQuadrantNames = {BcgQuadrant.star: '★ Stars', BcgQuadrant.questionMark: '? Question marks', BcgQuadrant.cashCow: '₹ Cash cows', BcgQuadrant.dog: '✕ Dogs'};

void paintBcg(Canvas canvas, BcgMatrix m, Size size, Color accent) {
  _text(canvas, m.title, const Offset(24, 40), size: 30, bold: true, color: accent, maxWidth: size.width - 48);
  final plot = bcgPlot(size);
  final split = m.splitAt(plot);
  final tints = {
    BcgQuadrant.star: const Color(0xFFFFF4C2),
    BcgQuadrant.questionMark: const Color(0xFFE3F0FF),
    BcgQuadrant.cashCow: const Color(0xFFE2F4E8),
    BcgQuadrant.dog: const Color(0xFFF3E5E5),
  };
  final boxes = {
    BcgQuadrant.star: Rect.fromLTRB(plot.left, plot.top, split.dx, split.dy),
    BcgQuadrant.questionMark: Rect.fromLTRB(split.dx, plot.top, plot.right, split.dy),
    BcgQuadrant.cashCow: Rect.fromLTRB(plot.left, split.dy, split.dx, plot.bottom),
    BcgQuadrant.dog: Rect.fromLTRB(split.dx, split.dy, plot.right, plot.bottom),
  };
  for (final q in BcgQuadrant.values) {
    final b = boxes[q]!;
    canvas.drawRect(b, Paint()..color = tints[q]!);
    final count = m.products.where((p) => m.quadrantOf(p) == q).length;
    _text(canvas, '${bcgQuadrantNames[q]}${count > 0 ? '  ($count)' : ''}', Offset(b.left + 12, b.top + 20), size: 18, bold: true, color: _muted, maxWidth: math.max(0, b.width - 20));
  }
  final axis = _stroke(const Color(0xFF3A4048), 1.6);
  canvas
    ..drawRect(plot, axis)
    ..drawLine(Offset(split.dx, plot.top), Offset(split.dx, plot.bottom), _stroke(_ink, 2.4))
    ..drawLine(Offset(plot.left, split.dy), Offset(plot.right, split.dy), _stroke(_ink, 2.4));
  for (final g in chartTicks(m.growthMin, m.growthMax)) {
    final y = m.placement(BcgProduct('', growth: g, share: m.shareMax, revenue: 0), plot).dy;
    canvas.drawLine(Offset(plot.left - 6, y), Offset(plot.left, y), axis);
    _text(canvas, '${_trim(g)}%', Offset(plot.left - 10, y), size: 14, color: _muted, align: TextAlign.right);
  }
  for (final s in const [20.0, 10.0, 5.0, 2.0, 1.0, 0.5, 0.2, 0.1, 0.05]) {
    if (s < m.shareMin - 1e-9 || s > m.shareMax + 1e-9) continue;
    final x = m.placement(BcgProduct('', growth: m.growthMin, share: s, revenue: 0), plot).dx;
    canvas.drawLine(Offset(x, plot.bottom), Offset(x, plot.bottom + 6), axis);
    _text(canvas, '${_trim(s)}×', Offset(x, plot.bottom + 18), size: 14, color: _muted, align: TextAlign.center);
  }
  _text(canvas, 'Relative market share (log scale)   high ←  → low', Offset(plot.center.dx, size.height - 30), size: 16, align: TextAlign.center);
  canvas
    ..save()
    ..translate(28, plot.center.dy)
    ..rotate(-math.pi / 2);
  _text(canvas, 'Market growth rate (% a year)', Offset.zero, size: 16, align: TextAlign.center);
  canvas.restore();
  final maxR = math.min(plot.width, plot.height) * 0.11;
  final order = [...m.products.indexed]..sort((a, b) => b.$2.revenue.compareTo(a.$2.revenue));
  for (final (i, p) in order) {
    final c = m.placement(p, plot);
    final r = m.radiusOf(p, maxR);
    final col = sheetChartColors[i % sheetChartColors.length];
    canvas
      ..drawCircle(c, r, Paint()..color = col.withValues(alpha: 0.55))
      ..drawCircle(c, r, _stroke(col, 2.5));
    _text(canvas, p.name, c, size: 16, bold: true, align: TextAlign.center, maxWidth: math.max(90, r * 2.4));
    _text(canvas, kitMoney(p.revenue), c + const Offset(0, 20), size: 13, color: _muted, align: TextAlign.center, maxWidth: 140);
  }
  _text(canvas, 'Bubble area = revenue · split at ${_trim(m.growthSplit)}% growth and ${_trim(m.shareSplit)}× share', const Offset(24, 70), size: 13, color: _muted, maxWidth: size.width - 48);
}

// --- Decision tree -----------------------------------------------------------------------------

/// Where each node is drawn on a panel of [size].
Map<DtNode, Offset> decisionTreePositions(DtNode root, Size size) {
  final slots = layoutDecisionTree(root);
  final depth = math.max(1, root.depth), leaves = math.max(1, root.leafCount);
  final colW = (size.width - 150 - 300) / depth;
  final rowH = (size.height - 170) / leaves;
  return {for (final e in slots.entries) e.key: Offset(100 + e.value.dx * colW, 96 + (e.value.dy + 0.5) * rowH)};
}

void paintDecisionTree(Canvas canvas, DecisionTreeModel m, Size size, Color accent) {
  _text(canvas, m.title, const Offset(24, 40), size: 30, bold: true, color: accent, maxWidth: size.width - 48);
  final roll = DtRollback.of(m.root);
  final pos = decisionTreePositions(m.root, size);
  const r = 18.0;
  for (final n in m.root.all) {
    final a = pos[n]!;
    for (final c in n.children) {
      final b = pos[c]!;
      final best = roll.onBestPath.contains(n) && roll.onBestPath.contains(c);
      final p = _stroke(best ? accent : const Color(0xFF9AA0A8), best ? 4.5 : 2);
      final knee = Offset(a.dx + 40, b.dy);
      canvas
        ..drawLine(a + const Offset(r, 0), knee, p)
        ..drawLine(knee, b - const Offset(r, 0), p);
      final mid = Offset((knee.dx + b.dx) / 2, b.dy);
      final w = math.max(60.0, b.dx - knee.dx - 2 * r);
      if (c.label.isNotEmpty) _text(canvas, c.label, mid - const Offset(0, 16), size: 15, bold: best, align: TextAlign.center, maxWidth: w);
      final under = [
        if (n.kind == DtKind.chance) 'p = ${_trim(c.probability)}',
        if (c.cost != 0) 'cost ${kitMoney(c.cost)}',
      ].join(' · ');
      if (under.isNotEmpty) _text(canvas, under, mid + const Offset(0, 15), size: 13, color: _muted, align: TextAlign.center, maxWidth: w);
      if (n.kind == DtKind.decision && !identical(roll.best[n], c)) {
        // A rejected option: two short strokes across its branch.
        final x = knee.dx + 18;
        final s = _stroke(_bad, 2.5);
        canvas
          ..drawLine(Offset(x - 4, b.dy - 9), Offset(x + 2, b.dy + 9), s)
          ..drawLine(Offset(x + 4, b.dy - 9), Offset(x + 10, b.dy + 9), s);
      }
    }
  }
  for (final n in m.root.all) {
    final c = pos[n]!;
    final on = roll.onBestPath.contains(n);
    final fill = Paint()..color = on ? accent.withValues(alpha: 0.2) : const Color(0xFFF2F3F5);
    final edge = _stroke(on ? accent : _ink, 2.5);
    switch (n.kind) {
      case DtKind.decision:
        final box = Rect.fromCenter(center: c, width: 2 * r, height: 2 * r);
        canvas
          ..drawRect(box, fill)
          ..drawRect(box, edge);
      case DtKind.chance:
        canvas
          ..drawCircle(c, r, fill)
          ..drawCircle(c, r, roll.badProbabilities.contains(n) ? _stroke(_bad, 3) : edge);
      case DtKind.end:
        final path = Path()
          ..moveTo(c.dx + r, c.dy - r * 0.9)
          ..lineTo(c.dx + r, c.dy + r * 0.9)
          ..lineTo(c.dx - r * 0.6, c.dy)
          ..close();
        canvas
          ..drawPath(path, fill)
          ..drawPath(path, edge);
        _text(canvas, kitMoney(n.payoff), c + const Offset(r + 10, 0), size: 16, bold: on, color: n.payoff < 0 ? _bad : _ink, maxWidth: 200);
    }
    if (n.kind != DtKind.end) {
      _text(canvas, 'EV ${kitMoney(roll.value[n] ?? 0)}', c - const Offset(0, r + 14), size: 14, bold: true, color: on ? accent : _muted, align: TextAlign.center, maxWidth: 200);
    }
  }
  final pick = roll.best[m.root];
  final summary = m.root.kind == DtKind.decision && pick != null
      ? 'Best: ${pick.label.isEmpty ? 'option ${m.root.children.indexOf(pick) + 1}' : pick.label}  ·  EMV ${kitMoney(roll.value[m.root] ?? 0)}'
      : 'EMV ${kitMoney(roll.value[m.root] ?? 0)}';
  _text(canvas, summary, Offset(24, size.height - 52), size: 20, bold: true, color: accent, maxWidth: size.width - 48);
  _text(
    canvas,
    roll.badProbabilities.isNotEmpty ? 'Check: the probabilities at a red chance node do not add up to 1' : '□ decision   ○ chance   ◁ outcome   ·   EV rolled back from the ends; // = option rejected',
    Offset(24, size.height - 22),
    size: 13,
    color: roll.badProbabilities.isNotEmpty ? _bad : _muted,
    maxWidth: size.width - 48,
  );
}

// --- Break-even --------------------------------------------------------------------------------

/// The chart area of a break-even panel of [size].
Rect breakEvenPlot(Size size) => Rect.fromLTRB(110, 84, size.width - 330, size.height - 84);

void paintBreakEven(Canvas canvas, BreakEvenModel m, Size size, Color accent) {
  _text(canvas, m.title, const Offset(24, 40), size: 30, bold: true, color: accent, maxWidth: size.width - 48);
  final plot = breakEvenPlot(size);
  final qMax = m.chartUnits;
  final yMax = niceCeil(math.max(m.revenueAt(qMax), m.costAt(qMax)) * 1.05);
  Offset at(double q, double v) => Offset(plot.left + q / qMax * plot.width, plot.bottom - (v / yMax).clamp(0.0, 1.2) * plot.height);
  final axis = _stroke(const Color(0xFF3A4048), 1.6);
  final grid = _stroke(const Color(0x14000000), 1);
  for (final t in chartTicks(0, yMax)) {
    final y = at(0, t).dy;
    canvas.drawLine(Offset(plot.left, y), Offset(plot.right, y), grid);
    _text(canvas, kitMoney(t), Offset(plot.left - 8, y), size: 13, color: _muted, align: TextAlign.right, maxWidth: 100);
  }
  for (final t in chartTicks(0, qMax)) {
    final x = at(t, 0).dx;
    canvas.drawLine(Offset(x, plot.top), Offset(x, plot.bottom), grid);
    _text(canvas, _num(t), Offset(x, plot.bottom + 16), size: 13, color: _muted, align: TextAlign.center, maxWidth: 90);
  }
  if (m.canBreakEven) {
    // Loss to the left of the break-even point, profit to the right.
    final b = m.bepUnits.clamp(0.0, qMax);
    canvas
      ..drawPath(Path()..addPolygon([at(0, m.costAt(0)), at(b, m.costAt(b)), at(0, 0)], true), Paint()..color = _bad.withValues(alpha: 0.10))
      ..drawPath(Path()..addPolygon([at(b, m.costAt(b)), at(qMax, m.revenueAt(qMax)), at(qMax, m.costAt(qMax))], true), Paint()..color = _good.withValues(alpha: 0.12));
  }
  canvas
    ..drawLine(plot.bottomLeft, plot.bottomRight, axis)
    ..drawLine(plot.bottomLeft, plot.topLeft, axis);
  _dashed(canvas, at(0, m.fixedCost), at(qMax, m.fixedCost), _stroke(_muted, 2.5));
  canvas
    ..drawLine(at(0, m.costAt(0)), at(qMax, m.costAt(qMax)), _stroke(_bad, 3.5))
    ..drawLine(at(0, 0), at(qMax, m.revenueAt(qMax)), _stroke(_good, 3.5));
  _text(canvas, 'Fixed cost', at(qMax, m.fixedCost) + const Offset(-6, -14), size: 14, color: _muted, align: TextAlign.right);
  _text(canvas, 'Total cost', at(qMax, m.costAt(qMax)) + const Offset(-6, 16), size: 14, bold: true, color: _bad, align: TextAlign.right);
  _text(canvas, 'Sales revenue', at(qMax, m.revenueAt(qMax)) + const Offset(-6, -16), size: 14, bold: true, color: _good, align: TextAlign.right);
  if (m.units > 0 && m.units <= qMax) {
    final x = at(m.units, 0).dx;
    _dashed(canvas, Offset(x, plot.bottom), Offset(x, plot.top + 20), _stroke(accent, 2));
    _text(canvas, 'Planned ${_num(m.units)}', Offset(x, plot.top + 8), size: 13, color: accent, align: TextAlign.center, maxWidth: 160);
  }
  if (m.canBreakEven && m.bepUnits <= qMax) {
    final p = at(m.bepUnits, m.bepSales);
    final dash = _stroke(_ink.withValues(alpha: 0.6), 1.5);
    _dashed(canvas, p, Offset(p.dx, plot.bottom), dash);
    _dashed(canvas, p, Offset(plot.left, p.dy), dash);
    canvas
      ..drawCircle(p, 9, Paint()..color = accent)
      ..drawCircle(p, 9, _stroke(const Color(0xFFFFFFFF), 2.5));
    _text(canvas, 'BEP', p + const Offset(-14, -22), size: 16, bold: true, color: accent, align: TextAlign.right);
    if (m.units > m.bepUnits && m.units <= qMax) {
      // Margin of safety: from the break-even point to planned sales, along the units axis.
      final y = plot.bottom - 22;
      final a = Offset(p.dx, y), b = Offset(at(m.units, 0).dx, y);
      final s = _stroke(accent, 3);
      canvas
        ..drawLine(a, b, s)
        ..drawLine(a - const Offset(0, 7), a + const Offset(0, 7), s)
        ..drawLine(b - const Offset(0, 7), b + const Offset(0, 7), s);
      _text(canvas, 'Margin of safety', Offset((a.dx + b.dx) / 2, y - 14), size: 13, bold: true, color: accent, align: TextAlign.center, maxWidth: math.max(80, b.dx - a.dx + 40));
    }
  }
  _text(canvas, 'Units', Offset(plot.center.dx, size.height - 36), size: 15, align: TextAlign.center);
  // The working, on the right.
  final x = size.width - 300.0;
  var y = 100.0;
  void row(String k, String v, {Color color = _ink, bool bold = false}) {
    _text(canvas, k, Offset(x, y), size: 15, color: _muted, maxWidth: 280);
    _text(canvas, v, Offset(x, y + 24), size: 20, bold: true, color: bold ? accent : color, maxWidth: 280);
    y += 62;
  }

  row('Fixed cost', kitMoney(m.fixedCost));
  row('Variable cost / unit  ·  Price', '${kitMoney(m.variableCost)}  ·  ${kitMoney(m.price)}');
  row('Contribution / unit  ·  P/V ratio', '${kitMoney(m.contribution)}  ·  ${_trim(m.pvRatio * 100)}%', color: m.canBreakEven ? _ink : _bad);
  if (m.canBreakEven) {
    row('Break-even point', '${_num(m.bepUnits)} units', bold: true);
    row('Break-even sales', kitMoney(m.bepSales), bold: true);
    row('Margin of safety', '${_num(m.marginOfSafetyUnits)} units (${_trim(m.marginOfSafetyPercent)}%)', color: m.marginOfSafetyUnits >= 0 ? _good : _bad);
    row('Profit at ${_num(m.units)} units', kitMoney(m.profit), color: m.profit >= 0 ? _good : _bad);
  } else {
    row('Break-even point', 'None: price must exceed variable cost', color: _bad);
  }
}

// --- Charts ------------------------------------------------------------------------------------

void paintChart(Canvas canvas, ChartData d, Rect area, Color accent) {
  var top = area.top + 20;
  if (d.title.isNotEmpty) {
    _text(canvas, d.title, Offset(area.left + 24, area.top + 36), size: 26, bold: true, color: accent, maxWidth: area.width - 48);
    top += 40;
  }
  final bottomNote = d.note.isNotEmpty ? 26.0 : 0.0;
  if (d.note.isNotEmpty) _text(canvas, d.note, Offset(area.left + 24, area.bottom - 16), size: 12, color: _muted, maxWidth: area.width - 48);
  final legend = d.series.length > 1 || d.kind == KitChartKind.pie;
  final body = Rect.fromLTRB(area.left + 24, top + 20, area.right - 24 - (legend ? 200 : 0), area.bottom - 20 - bottomNote);
  if (legend) {
    final names = d.kind == KitChartKind.pie ? d.labels : [for (final s in d.series) s.name];
    final rowH = math.min(26.0, (body.height) / math.max(1, names.length));
    final vals = d.kind == KitChartKind.pie && d.series.isNotEmpty ? d.series.first.values : const <double>[];
    final total = vals.where((v) => v.isFinite && v > 0).fold(0.0, (a, b) => a + b);
    for (var i = 0; i < names.length; i++) {
      final y = body.top + i * rowH + rowH / 2;
      canvas.drawRect(Rect.fromLTWH(body.right + 20, y - 6, 12, 12), Paint()..color = sheetChartColors[i % sheetChartColors.length]);
      final pct = d.kind == KitChartKind.pie && i < vals.length && vals[i].isFinite && total > 0 ? '  ${(vals[i] / total * 100).toStringAsFixed(1)}%' : '';
      _text(canvas, '${names[i]}$pct', Offset(body.right + 38, y), size: 14, maxWidth: 160);
    }
  }
  if (d.isEmpty) {
    _text(canvas, 'No numbers yet', body.center, color: _muted, align: TextAlign.center);
    return;
  }
  if (d.kind == KitChartKind.pie) {
    final vals = d.series.first.values;
    final total = vals.where((v) => v.isFinite && v > 0).fold(0.0, (a, b) => a + b);
    if (total <= 0) return;
    final r = math.min(body.width, body.height) / 2 - 8;
    final c = body.center;
    var a = -math.pi / 2;
    for (var i = 0; i < vals.length; i++) {
      if (!vals[i].isFinite || vals[i] <= 0) continue;
      final sweep = vals[i] / total * 2 * math.pi;
      canvas
        ..drawArc(Rect.fromCircle(center: c, radius: r), a, sweep, true, Paint()..color = sheetChartColors[i % sheetChartColors.length])
        ..drawArc(Rect.fromCircle(center: c, radius: r), a, sweep, true, _stroke(const Color(0xFFFFFFFF), 2));
      a += sweep;
    }
    return;
  }
  final scatter = d.kind == KitChartKind.scatter;
  final xs = scatter ? [for (final l in d.labels) parseChartNumber(l) ?? double.nan] : const <double>[];
  final all = [for (final s in d.series) ...s.values.where((v) => v.isFinite)];
  var lo = all.reduce(math.min), hi = all.reduce(math.max);
  if (d.kind == KitChartKind.bar) {
    lo = math.min(0.0, lo);
    hi = math.max(0.0, hi);
  }
  if (hi == lo) {
    hi += 1;
    lo -= 1;
  }
  final pad = (hi - lo) * 0.06;
  final base = d.kind == KitChartKind.bar && lo == 0 ? 0.0 : lo - pad;
  final ticks = chartTicks(base, hi + pad);
  final yLo = math.min(ticks.first, base), yHi = math.max(ticks.last, hi + pad);
  final plot = Rect.fromLTRB(body.left + 80, body.top + 8, body.right - 8, body.bottom - (d.xLabel.isNotEmpty ? 52 : 30));
  double yOf(double v) => plot.bottom - (v - yLo) / (yHi - yLo) * plot.height;
  final grid = _stroke(const Color(0x14000000), 1), axis = _stroke(const Color(0xFF3A4048), 1.6);
  for (final t in ticks) {
    if (t < yLo || t > yHi) continue;
    canvas.drawLine(Offset(plot.left, yOf(t)), Offset(plot.right, yOf(t)), grid);
    _text(canvas, _num(t), Offset(plot.left - 8, yOf(t)), size: 13, color: _muted, align: TextAlign.right, maxWidth: 76);
  }
  canvas
    ..drawLine(plot.bottomLeft, plot.topLeft, axis)
    ..drawLine(Offset(plot.left, yOf(yLo <= 0 && yHi >= 0 ? 0.0 : yLo)), Offset(plot.right, yOf(yLo <= 0 && yHi >= 0 ? 0.0 : yLo)), axis);
  if (d.yLabel.isNotEmpty) _text(canvas, d.yLabel, Offset(plot.left, plot.top - 14), size: 13, color: _muted, maxWidth: 400);
  if (d.xLabel.isNotEmpty) _text(canvas, d.xLabel, Offset(plot.center.dx, body.bottom - 12), size: 14, align: TextAlign.center);
  final n = d.labels.length;
  if (scatter) {
    final fx = xs.where((v) => v.isFinite).toList();
    var x0 = fx.isEmpty ? 0.0 : fx.reduce(math.min), x1 = fx.isEmpty ? 1.0 : fx.reduce(math.max);
    if (x1 == x0) {
      x1 += 1;
      x0 -= 1;
    }
    final xt = chartTicks(x0, x1);
    double xOf(double v) => plot.left + (v - x0) / (x1 - x0) * plot.width;
    for (final t in xt) {
      if (t < x0 || t > x1) continue;
      _text(canvas, _num(t), Offset(xOf(t), plot.bottom + 14), size: 13, color: _muted, align: TextAlign.center, maxWidth: 80);
    }
    for (final (si, s) in d.series.indexed) {
      final col = sheetChartColors[si % sheetChartColors.length];
      for (var i = 0; i < math.min(n, s.values.length); i++) {
        if (!xs[i].isFinite || !s.values[i].isFinite) continue;
        final p = Offset(xOf(xs[i]), yOf(s.values[i]));
        canvas
          ..drawCircle(p, 7, Paint()..color = col.withValues(alpha: 0.7))
          ..drawCircle(p, 7, _stroke(col, 1.5));
      }
    }
    return;
  }
  if (n == 0) return;
  final step = plot.width / n;
  final every = math.max(1, (n / 12).ceil());
  for (var i = 0; i < n; i += every) {
    _text(canvas, d.labels[i], Offset(plot.left + step * (i + 0.5), plot.bottom + 14), size: 12, align: TextAlign.center, maxWidth: step * every);
  }
  final k = d.series.length;
  for (final (si, s) in d.series.indexed) {
    final col = k == 1 ? accent : sheetChartColors[si % sheetChartColors.length];
    if (d.kind == KitChartKind.bar) {
      final bw = step * 0.7 / k;
      for (var i = 0; i < math.min(n, s.values.length); i++) {
        if (!s.values[i].isFinite) continue;
        final x = plot.left + step * i + step * 0.15 + bw * si;
        final y0 = yOf(math.max(yLo, math.min(0.0, yHi))), y1 = yOf(s.values[i]);
        canvas.drawRect(Rect.fromLTRB(x, math.min(y0, y1), x + bw * 0.92, math.max(y0, y1)), Paint()..color = col.withValues(alpha: 0.85));
        if (n * k <= 16) _text(canvas, _num(s.values[i]), Offset(x + bw / 2, y1 - 12), size: 12, color: _muted, align: TextAlign.center, maxWidth: math.max(40, bw * 1.4));
      }
    } else {
      final pts = <Offset>[];
      void flush() {
        if (pts.length > 1) canvas.drawPoints(PointMode.polygon, pts, _stroke(col, 3));
        pts.clear();
      }

      for (var i = 0; i < math.min(n, s.values.length); i++) {
        if (!s.values[i].isFinite) {
          flush();
          continue;
        }
        final p = Offset(plot.left + step * (i + 0.5), yOf(s.values[i]));
        pts.add(p);
        if (n <= 40) canvas.drawCircle(p, 4, Paint()..color = col);
      }
      flush();
    }
  }
}
