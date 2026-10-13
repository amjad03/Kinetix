import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'chem_models.dart';
import 'panel_plot.dart';

// Drawing the chemical engineering panels on a white card: the process flow diagram (ISA/ISO-
// style symbols, numbered streams with arrows, signal lines dashed, the stream table) and the
// unit operations (McCabe–Thiele, heat exchanger profiles, CSTR vs PFR with the Levenspiel
// plot). Panel words are in English, as in the textbooks.

// --- PFD -----------------------------------------------------------------------------------------

/// Draws one PFD symbol in its rect; [highlight] rings it (the editor's selection).
void paintPfdUnit(Canvas canvas, PfdUnit u, {Color ink = panelInk, Color? highlight}) {
  final r = u.rect;
  final c = r.center;
  final p = panelStroke(ink, 2.2);
  final white = panelFill(Colors.white);
  void bowtie(double cy, {bool fillRight = false}) {
    final left = Path()
      ..moveTo(c.dx - 20, cy - 10)
      ..lineTo(c.dx - 20, cy + 10)
      ..lineTo(c.dx, cy)
      ..close();
    final right = Path()
      ..moveTo(c.dx + 20, cy - 10)
      ..lineTo(c.dx + 20, cy + 10)
      ..lineTo(c.dx, cy)
      ..close();
    canvas
      ..drawPath(left, white)
      ..drawPath(right, fillRight ? panelFill(ink) : white)
      ..drawPath(left, p)
      ..drawPath(right, p);
  }

  void capsule(Rect b) {
    final rr = RRect.fromRectAndRadius(b, Radius.circular(math.min(b.width, b.height) / 2));
    canvas
      ..drawRRect(rr, white)
      ..drawRRect(rr, p);
  }

  switch (u.type) {
    case PfdUnitType.pump:
      final rad = 20.0;
      canvas
        ..drawPath(
          Path()
            ..moveTo(c.dx - 13, c.dy + 14)
            ..lineTo(c.dx - 22, c.dy + 27)
            ..lineTo(c.dx + 22, c.dy + 27)
            ..lineTo(c.dx + 13, c.dy + 14),
          p,
        )
        ..drawCircle(c, rad, white)
        ..drawCircle(c, rad, p)
        ..drawLine(Offset(c.dx, c.dy - rad), Offset(c.dx + 26, c.dy - rad), p)
        ..drawLine(Offset(c.dx + 26, c.dy - rad - 6), Offset(c.dx + 26, c.dy - rad + 6), p);
    case PfdUnitType.compressor:
      final path = Path()
        ..moveTo(c.dx - 24, c.dy - 26)
        ..lineTo(c.dx + 24, c.dy - 12)
        ..lineTo(c.dx + 24, c.dy + 12)
        ..lineTo(c.dx - 24, c.dy + 26)
        ..close();
      canvas
        ..drawPath(path, white)
        ..drawPath(path, p);
    case PfdUnitType.gateValve:
      bowtie(c.dy);
    case PfdUnitType.globeValve:
      bowtie(c.dy);
      canvas.drawCircle(c, 5, panelFill(ink));
    case PfdUnitType.checkValve:
      bowtie(c.dy, fillRight: true);
    case PfdUnitType.controlValve:
      final cy = c.dy + 10;
      bowtie(cy);
      canvas
        ..drawLine(Offset(c.dx, cy), Offset(c.dx, cy - 18), p)
        ..drawArc(Rect.fromCircle(center: Offset(c.dx, cy - 18), radius: 13), math.pi, math.pi, true, white)
        ..drawArc(Rect.fromCircle(center: Offset(c.dx, cy - 18), radius: 13), math.pi, math.pi, true, p);
    case PfdUnitType.vessel:
      capsule(r);
    case PfdUnitType.reactor:
      capsule(r.deflate(2));
      // Agitator: motor, shaft and blades; a jacket line round the lower part.
      canvas
        ..drawRect(Rect.fromCenter(center: Offset(c.dx, r.top - 8), width: 18, height: 12), white)
        ..drawRect(Rect.fromCenter(center: Offset(c.dx, r.top - 8), width: 18, height: 12), p)
        ..drawLine(Offset(c.dx, r.top - 2), Offset(c.dx, r.bottom - 26), p)
        ..drawLine(Offset(c.dx - 14, r.bottom - 26), Offset(c.dx + 14, r.bottom - 26), panelStroke(ink, 4))
        ..drawLine(Offset(c.dx - 12, c.dy - 6), Offset(c.dx + 12, c.dy - 6), panelStroke(ink, 4));
      final jacket = panelStroke(ink, 1.4);
      panelDashed(canvas, Offset(r.left - 5, c.dy - 10), Offset(r.left - 5, r.bottom - 20), jacket, dash: 6, gap: 4);
      panelDashed(canvas, Offset(r.right + 5, c.dy - 10), Offset(r.right + 5, r.bottom - 20), jacket, dash: 6, gap: 4);
    case PfdUnitType.tank:
      final body = Rect.fromLTRB(r.left, r.top + 18, r.right, r.bottom);
      final roof = Path()
        ..moveTo(r.left, r.top + 18)
        ..lineTo(c.dx, r.top)
        ..lineTo(r.right, r.top + 18);
      canvas
        ..drawRect(body, white)
        ..drawRect(body, p)
        ..drawPath(roof, p);
    case PfdUnitType.heatExchanger:
      final rad = r.shortestSide / 2 - 2;
      canvas
        ..drawCircle(c, rad, white)
        ..drawCircle(c, rad, p);
      final zig = Path()..moveTo(c.dx - rad, c.dy);
      const n = 5;
      for (var i = 1; i <= n; i++) {
        final x = c.dx - rad * 0.7 + rad * 1.4 * (i - 0.5) / n;
        zig.lineTo(x, c.dy + (i.isOdd ? -rad * 0.45 : rad * 0.45));
      }
      zig.lineTo(c.dx + rad, c.dy);
      canvas.drawPath(zig, p);
    case PfdUnitType.column:
      capsule(r);
      final tray = panelStroke(ink, 1.4);
      for (var y = r.top + 34; y < r.bottom - 30; y += 18) {
        final left = ((y - r.top) ~/ 18).isEven;
        canvas.drawLine(Offset(left ? r.left : r.left + 14, y), Offset(left ? r.right - 14 : r.right, y), tray);
      }
    case PfdUnitType.separator:
      capsule(r);
      panelDashed(canvas, Offset(r.right - 30, r.top + 6), Offset(r.right - 30, r.bottom - 14), panelStroke(ink, 1.4), dash: 5, gap: 4);
      canvas.drawRect(Rect.fromLTWH(r.left + 24, r.top + 6, 22, 8), panelStroke(ink, 1.2));
    case PfdUnitType.mixer:
      canvas
        ..drawRect(r, white)
        ..drawRect(r, p)
        ..drawLine(r.topLeft, r.bottomRight, panelStroke(ink, 1.4))
        ..drawLine(r.bottomLeft, r.topRight, panelStroke(ink, 1.4));
    case PfdUnitType.filter:
      canvas
        ..drawRect(r, white)
        ..drawRect(r, p);
      panelDashed(canvas, r.bottomLeft + const Offset(4, -4), r.topRight + const Offset(-4, 4), panelStroke(ink, 1.6), dash: 6, gap: 4);
    case PfdUnitType.instrument:
      final rad = r.shortestSide / 2;
      canvas
        ..drawCircle(c, rad, white)
        ..drawCircle(c, rad, p)
        ..drawLine(Offset(c.dx - rad, c.dy), Offset(c.dx + rad, c.dy), panelStroke(ink, 1.4));
      panelText(canvas, u.label.isEmpty ? '?' : u.label, Offset(c.dx, c.dy - rad * 0.42), size: 14, bold: true, align: TextAlign.center, maxWidth: rad * 2 - 4);
      panelText(canvas, u.tag, Offset(c.dx, c.dy + rad * 0.45), size: 13, align: TextAlign.center, maxWidth: rad * 2 - 4);
  }
  if (u.type != PfdUnitType.instrument) {
    final below = r.bottom + (u.type == PfdUnitType.pump ? 16 : 6);
    panelText(canvas, u.tag, Offset(c.dx, below), size: 14, bold: true, align: TextAlign.center, middle: false, maxWidth: 160, background: Colors.white);
    if (u.label.isNotEmpty) panelText(canvas, u.label, Offset(c.dx, below + 18), size: 13, color: panelMuted, align: TextAlign.center, middle: false, maxWidth: 170, background: Colors.white);
  }
  if (highlight != null) canvas.drawRRect(RRect.fromRectAndRadius(r.inflate(8), const Radius.circular(8)), panelStroke(highlight, 2.5));
}

/// Draws a stream's route with its arrow head and its number in a diamond.
void paintPfdStream(Canvas canvas, PfdDiagram d, PfdStream s, {Color ink = panelInk, Color? highlight}) {
  final pts = d.path(s);
  if (pts.length < 2) return;
  final color = highlight ?? ink;
  final p = panelStroke(color, s.signal ? 1.6 : 2.4);
  for (var i = 1; i < pts.length; i++) {
    if (s.signal) {
      panelDashed(canvas, pts[i - 1], pts[i], p, dash: 7, gap: 5);
    } else {
      canvas.drawLine(pts[i - 1], pts[i], p);
    }
  }
  panelArrowHead(canvas, pts.last, pts.last - pts[pts.length - 2], color, size: s.signal ? 9 : 13);
  if (s.signal) return;
  // The number on the longest leg.
  var best = 1;
  for (var i = 2; i < pts.length; i++) {
    if ((pts[i] - pts[i - 1]).distance > (pts[best] - pts[best - 1]).distance) best = i;
  }
  final m = Offset.lerp(pts[best - 1], pts[best], 0.5)!;
  final dia = Path()
    ..moveTo(m.dx, m.dy - 13)
    ..lineTo(m.dx + 13, m.dy)
    ..lineTo(m.dx, m.dy + 13)
    ..lineTo(m.dx - 13, m.dy)
    ..close();
  canvas
    ..drawPath(dia, panelFill(Colors.white))
    ..drawPath(dia, panelStroke(color, 1.6));
  panelText(canvas, '${s.number}', m, size: 13, bold: true, color: color, align: TextAlign.center, maxWidth: 24);
}

/// The stream table's rect on a panel of [size].
Rect pfdTableRect(Size size) => Rect.fromLTRB(20, PfdDiagram.area.bottom + 22, size.width - 20, size.height - 16);

void paintPfd(Canvas canvas, PfdDiagram d, Size size, Color accent, {String? selectedUnit, int? selectedStream, String? pending}) {
  panelText(canvas, d.title, const Offset(24, 36), size: 26, bold: true, maxWidth: size.width - 300);
  panelText(canvas, 'Flow kg/h · T °C · P bar', Offset(size.width - 24, 36), size: 14, color: panelMuted, align: TextAlign.right);
  final area = PfdDiagram.area;
  canvas.drawRect(area, panelStroke(panelGrid, 1));
  for (final (i, s) in d.streams.indexed) {
    paintPfdStream(canvas, d, s, highlight: i == selectedStream ? accent : null);
  }
  for (final u in d.units) {
    paintPfdUnit(canvas, u, highlight: u.id == selectedUnit ? accent : (u.id == pending ? panelWarn : null));
  }
  if (!d.showTable) return;
  final rows = d.tableStreams;
  final t = pfdTableRect(size);
  const head = 150.0;
  final n = math.max(1, rows.length);
  final colW = (t.width - head) / n;
  final rowH = t.height / 5;
  final line = panelStroke(panelMuted, 1);
  canvas
    ..drawRect(Rect.fromLTWH(t.left, t.top, t.width, rowH), panelFill(accent.withValues(alpha: 0.12)))
    ..drawRect(t, line);
  const labels = ['Stream', 'Flow (kg/h)', 'Temperature (°C)', 'Pressure (bar)', 'Composition'];
  for (var r = 0; r < 5; r++) {
    final y = t.top + rowH * r;
    if (r > 0) canvas.drawLine(Offset(t.left, y), Offset(t.right, y), line);
    panelText(canvas, labels[r], Offset(t.left + 8, y + rowH / 2), size: 13, bold: r == 0, maxWidth: head - 12);
  }
  canvas.drawLine(Offset(t.left + head, t.top), Offset(t.left + head, t.bottom), line);
  for (final (i, s) in rows.indexed) {
    final x = t.left + head + colW * i;
    if (i > 0) canvas.drawLine(Offset(x, t.top), Offset(x, t.bottom), line);
    final cx = x + colW / 2;
    final small = colW < 90 ? 11.0 : 13.0;
    panelText(canvas, '${s.number}', Offset(cx, t.top + rowH / 2), size: 14, bold: true, align: TextAlign.center, maxWidth: colW - 4);
    panelText(canvas, panelNum(s.flow, digits: 4), Offset(cx, t.top + rowH * 1.5), size: small, align: TextAlign.center, maxWidth: colW - 4);
    panelText(canvas, panelNum(s.temp, digits: 4), Offset(cx, t.top + rowH * 2.5), size: small, align: TextAlign.center, maxWidth: colW - 4);
    panelText(canvas, panelNum(s.pressure, digits: 4), Offset(cx, t.top + rowH * 3.5), size: small, align: TextAlign.center, maxWidth: colW - 4);
    panelText(canvas, s.composition, Offset(cx, t.top + rowH * 4 + 3), size: colW < 90 ? 9.5 : 11, align: TextAlign.center, maxWidth: colW - 4, middle: false, maxLines: 3);
  }
}

// --- Unit operations ------------------------------------------------------------------------------

void paintUnitOp(Canvas canvas, UnitOpPanel m, Size size, Color accent) {
  panelText(canvas, m.heading, const Offset(24, 36), size: 26, bold: true, maxWidth: size.width - 48);
  switch (m.op) {
    case UnitOp.mccabeThiele:
      _paintMcCabe(canvas, m.mccabe, size, accent);
    case UnitOp.heatExchanger:
      _paintHx(canvas, m.hx, size, accent);
    case UnitOp.reactors:
      _paintReactors(canvas, m.reactors, size, accent);
  }
}

void _info(Canvas canvas, double x, double y, List<(String, Color)> lines, {double width = 420}) {
  for (final (i, (t, c)) in lines.indexed) {
    panelText(canvas, t, Offset(x, y + i * 30), size: 17, color: c, bold: c != panelInk && c != panelMuted, maxWidth: width);
  }
}

void _paintMcCabe(Canvas canvas, McCabeThiele m, Size size, Color accent) {
  final plot = PanelPlot(const Rect.fromLTWH(110, 80, 640, 640), 0, 1, 0, 1);
  plot.frame(canvas, xTitle: 'x, mole fraction of the light component in the liquid', yTitle: 'y, in the vapour', xFmt: (v) => v.toStringAsFixed(1), yFmt: (v) => v.toStringAsFixed(1));
  panelDashed(canvas, plot.at(0, 0), plot.at(1, 1), panelStroke(panelMuted, 1.4));
  plot.curve(canvas, m.yEq, 0, 1, panelStroke(accent, 3));
  final ok = m.feasible;
  final pi = m.intersection;
  if (ok) {
    canvas
      ..drawLine(plot.at(m.xD, m.xD), plot.at(pi.dx, pi.dy), panelStroke(panelHot, 2.4))
      ..drawLine(plot.at(pi.dx, pi.dy), plot.at(m.xW, m.xW), panelStroke(panelCold, 2.4))
      ..drawLine(plot.at(m.zF, m.zF), plot.at(pi.dx, pi.dy), panelStroke(panelGood, 2.4));
    final st = m.step();
    final path = Path();
    for (final (i, c) in st.corners.indexed) {
      final q = plot.at(c.dx.clamp(0, 1).toDouble(), c.dy.clamp(0, 1).toDouble());
      if (i == 0) {
        path.moveTo(q.dx, q.dy);
      } else {
        path.lineTo(q.dx, q.dy);
      }
    }
    canvas.drawPath(path, panelStroke(panelWarn, 2));
    // Stage numbers by each step's corner on the equilibrium curve.
    var n = 0;
    for (var i = 1; i < st.corners.length; i += 2) {
      n++;
      final q = plot.at(st.corners[i].dx.clamp(0, 1).toDouble(), st.corners[i].dy);
      panelText(canvas, '$n', q + const Offset(-6, -12), size: 12, color: panelWarn, bold: true, align: TextAlign.right);
    }
  }
  for (final (x, name) in [(m.xW, 'xW'), (m.zF, 'zF'), (m.xD, 'xD')]) {
    final q = plot.at(x, 0);
    canvas.drawLine(q, q + const Offset(0, -10), panelStroke(panelInk, 2));
    panelText(canvas, name, q + const Offset(0, -20), size: 13, bold: true, align: TextAlign.center);
  }
  final st = ok ? m.step() : null;
  final lines = <(String, Color)>[
    ('α = ${panelNum(m.alpha)}   q = ${panelNum(m.q)}', panelInk),
    ('zF = ${panelNum(m.zF)}   xD = ${panelNum(m.xD)}   xW = ${panelNum(m.xW)}', panelInk),
    ('Reflux ratio R = ${panelNum(m.reflux)}', panelInk),
    ('Rmin = ${panelNum(m.minReflux)}   R/Rmin = ${panelNum(m.reflux / m.minReflux)}', panelMuted),
    ('Nmin (Fenske, total reflux) = ${panelNum(m.minStages)}', panelMuted),
    if (st != null) ('Theoretical stages N = ${panelNum(st.stages - 1 + st.fraction)} (${st.stages} steps)', panelWarn),
    if (st != null) ('Feed on stage ${st.feedStage} from the top', panelGood),
    if (st != null) ('Including the reboiler as a stage', panelMuted),
    if (!ok) (m.reflux <= m.minReflux ? 'R is below Rmin: no number of stages is enough' : 'Check: xW < zF < xD and α > 1', panelHot),
  ];
  _info(canvas, 800, 110, lines);
  // Legend.
  final ly = 470.0;
  for (final (i, (name, c)) in [('Equilibrium curve', accent), ('Rectifying line', panelHot), ('Stripping line', panelCold), ('q-line', panelGood), ('Stages', panelWarn)].indexed) {
    final y = ly + i * 28;
    canvas.drawLine(Offset(800, y), Offset(836, y), panelStroke(c, 3));
    panelText(canvas, name, Offset(846, y), size: 15, color: panelInk);
  }
}

void _paintHx(Canvas canvas, HeatExchanger m, Size size, Color accent) {
  // The exchanger drawn as two pipes, flows by arrows.
  const left = 60.0, right = 560.0, hotY = 140.0, coldY = 210.0;
  canvas
    ..drawRRect(RRect.fromLTRBR(left, hotY - 24, right, coldY + 24, const Radius.circular(12)), panelFill(const Color(0xFFF2F4F7)))
    ..drawRRect(RRect.fromLTRBR(left, hotY - 24, right, coldY + 24, const Radius.circular(12)), panelStroke(panelMuted, 1.4))
    ..drawLine(const Offset(left, hotY), const Offset(right, hotY), panelStroke(panelHot, 6))
    ..drawLine(const Offset(left, coldY), const Offset(right, coldY), panelStroke(panelCold, 6));
  panelArrowHead(canvas, const Offset(right + 26, hotY), const Offset(1, 0), panelHot, size: 20);
  canvas.drawLine(const Offset(right, hotY), const Offset(right + 10, hotY), panelStroke(panelHot, 6));
  if (m.counter) {
    panelArrowHead(canvas, const Offset(left - 26, coldY), const Offset(-1, 0), panelCold, size: 20);
    canvas.drawLine(const Offset(left - 10, coldY), const Offset(left, coldY), panelStroke(panelCold, 6));
  } else {
    panelArrowHead(canvas, const Offset(right + 26, coldY), const Offset(1, 0), panelCold, size: 20);
    canvas.drawLine(const Offset(right, coldY), const Offset(right + 10, coldY), panelStroke(panelCold, 6));
  }
  panelText(canvas, 'Hot in ${panelNum(m.thIn)} °C', const Offset(left, hotY - 40), size: 15, color: panelHot, bold: true);
  panelText(canvas, 'Hot out ${panelNum(m.thOut)} °C', const Offset(right, hotY - 40), size: 15, color: panelHot, bold: true, align: TextAlign.right);
  panelText(canvas, m.counter ? 'Cold out ${panelNum(m.tcOut)} °C' : 'Cold in ${panelNum(m.tcIn)} °C', const Offset(left, coldY + 40), size: 15, color: panelCold, bold: true);
  panelText(canvas, m.counter ? 'Cold in ${panelNum(m.tcIn)} °C' : 'Cold out ${panelNum(m.tcOut)} °C', const Offset(right, coldY + 40), size: 15, color: panelCold, bold: true, align: TextAlign.right);
  panelText(canvas, m.counter ? 'Counter-current' : 'Co-current (parallel flow)', const Offset((left + right) / 2, coldY + 72), size: 17, bold: true, align: TextAlign.center);

  // Temperature profiles along the length.
  final lo = math.min(m.tcIn, m.tcOut) - 10, hi = math.max(m.thIn, m.tcOut) + 10;
  final plot = PanelPlot(const Rect.fromLTWH(110, 340, 560, 380), 0, 1, lo, hi);
  plot.frame(canvas, xTitle: 'Position along the exchanger (from the hot inlet)', yTitle: 'Temperature (°C)', xFmt: (v) => v.toStringAsFixed(1));
  if (m.feasible) {
    plot
      ..curve(canvas, (s) => m.at(s).$1, 0, 1, panelStroke(panelHot, 3))
      ..curve(canvas, (s) => m.at(s).$2, 0, 1, panelStroke(panelCold, 3));
    final (a, b) = m.ends;
    for (final (s, dt, name) in [(0.0, a, 'ΔT₁'), (1.0, b, 'ΔT₂')]) {
      final top = plot.at(s, m.at(s).$1), bottom = plot.at(s, m.at(s).$2);
      final x = s == 0 ? top.dx + 16 : top.dx - 16;
      panelDashed(canvas, Offset(x, top.dy), Offset(x, bottom.dy), panelStroke(panelInk, 1.4), dash: 4, gap: 3);
      panelText(canvas, '$name = ${panelNum(dt)}', Offset(s == 0 ? x + 6 : x - 6, (top.dy + bottom.dy) / 2), size: 14, bold: true, align: s == 0 ? TextAlign.left : TextAlign.right);
    }
  }
  final (a, b) = m.ends;
  _info(canvas, 760, 120, [
    ('Q = Ch(Th,in − Th,out) = ${panelNum(m.duty)} kW', panelInk),
    ('Tc,out = Tc,in + Q/Cc = ${panelNum(m.tcOut)} °C', panelInk),
    ('Ch = ${panelNum(m.ch)} kW/K   Cc = ${panelNum(m.cc)} kW/K', panelMuted),
    ('ΔT₁ = ${panelNum(a)} K   ΔT₂ = ${panelNum(b)} K', panelInk),
    ('LMTD = (ΔT₁ − ΔT₂) / ln(ΔT₁/ΔT₂)', panelMuted),
    (m.feasible ? '      = ${panelNum(m.lmtdValue)} K' : 'Temperatures cross: not possible', m.feasible ? panelWarn : panelHot),
    ('U = ${panelNum(m.u)} W/m²K', panelMuted),
    (m.feasible ? 'A = Q / (U·LMTD) = ${panelNum(m.area)} m²' : '', panelGood),
  ]);
  if (m.feasible) {
    final other = m.copyWith(counter: !m.counter);
    panelText(
      canvas,
      other.feasible ? '${other.counter ? 'Counter' : 'Co'}-current would need ${panelNum(other.area)} m² (LMTD ${panelNum(other.lmtdValue)} K)' : '${other.counter ? 'Counter' : 'Co'}-current cannot reach these temperatures',
      const Offset(760, 400),
      size: 15,
      color: panelMuted,
      maxWidth: 460,
      maxLines: 2,
    );
  }
}

void _paintReactors(Canvas canvas, ReactorCompare m, Size size, Color accent) {
  // Levenspiel plot: CA0/(−rA) = 1/(k(1 − X)) against X.
  final xMax = math.min(0.99, m.target + 0.1);
  final yMax = m.levenspiel(xMax) * 1.05;
  final lev = PanelPlot(const Rect.fromLTWH(110, 90, 500, 420), 0, xMax, 0, yMax);
  lev.frame(canvas, xTitle: 'Conversion X', yTitle: 'CA0 / (−rA)  (min)', xFmt: (v) => v.toStringAsFixed(1));
  // PFR: the area under the curve up to X.
  final under = Path()..moveTo(lev.at(0, 0).dx, lev.at(0, 0).dy);
  for (var i = 0; i <= 80; i++) {
    final x = m.target * i / 80;
    final q = lev.at(x, m.levenspiel(x));
    under.lineTo(q.dx, q.dy);
  }
  under
    ..lineTo(lev.at(m.target, 0).dx, lev.at(m.target, 0).dy)
    ..close();
  canvas.drawPath(under, panelFill(accent.withValues(alpha: 0.22)));
  // CSTRs: one rectangle per tank, each at its own exit conversion.
  final n = m.tanks;
  final tauEach = m.tauCstr / n;
  var xPrev = 0.0;
  for (var i = 1; i <= n; i++) {
    final x = cstrSeriesConversion(m.k, tauEach * i, i);
    final r = Rect.fromPoints(lev.at(xPrev, 0), lev.at(x, m.levenspiel(x)));
    canvas
      ..drawRect(r, panelFill(panelWarn.withValues(alpha: 0.10)))
      ..drawRect(r, panelStroke(panelWarn, 2));
    xPrev = x;
  }
  lev.curve(canvas, m.levenspiel, 0, xMax, panelStroke(panelInk, 3));
  panelText(canvas, 'Shaded: PFR τ  ·  Rectangle${n > 1 ? 's' : ''}: CSTR τ', Offset(lev.r.left, lev.r.top - 18), size: 14, color: panelMuted);

  // Conversion against kτ for both.
  const kMax = 6.0;
  final conv = PanelPlot(const Rect.fromLTWH(720, 90, 480, 300), 0, kMax, 0, 1);
  conv.frame(canvas, xTitle: 'Damköhler number kτ', yTitle: 'X', yFmt: (v) => v.toStringAsFixed(1));
  conv
    ..curve(canvas, (d) => pfrConversion(1, d), 0, kMax, panelStroke(accent, 3))
    ..curve(canvas, (d) => cstrSeriesConversion(1, d, n), 0, kMax, panelStroke(panelWarn, 3));
  final pAt = conv.at(math.min(kMax, m.k * m.tauPfr), m.target), cAt = conv.at(math.min(kMax, m.k * m.tauCstr), m.target);
  canvas
    ..drawCircle(pAt, 6, panelFill(accent))
    ..drawCircle(cAt, 6, panelFill(panelWarn));
  panelText(canvas, 'PFR: X = 1 − e^(−kτ)', Offset(conv.r.right - 10, conv.r.bottom - 50), size: 14, color: accent, bold: true, align: TextAlign.right, background: Colors.white);
  panelText(canvas, n == 1 ? 'CSTR: X = kτ / (1 + kτ)' : '$n CSTRs: X = 1 − (1 + kτ/$n)^−$n', Offset(conv.r.right - 10, conv.r.bottom - 26), size: 14, color: panelWarn, bold: true, align: TextAlign.right, background: Colors.white);

  _info(canvas, 720, 470, [
    ('k = ${panelNum(m.k)} /min   target X = ${panelNum(m.target)}', panelInk),
    ('τ PFR = −ln(1 − X)/k = ${panelNum(m.tauPfr)} min', accent),
    ('τ ${n == 1 ? 'CSTR = X / (k(1 − X))' : '$n CSTRs in series'} = ${panelNum(m.tauCstr)} min', panelWarn),
    ('V CSTR / V PFR = ${panelNum(m.tauCstr / m.tauPfr)}', panelInk),
    ('More tanks in series → closer to a PFR', panelMuted),
  ], width: 480);
}
