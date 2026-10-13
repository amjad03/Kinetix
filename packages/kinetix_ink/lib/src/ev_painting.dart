import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'ev_models.dart';
import 'panel_plot.dart';

// Drawing the EV panels on a white card: the charging circuits (AC through the onboard charger,
// DC fast charging off board) with the CC-CV curve and the connector table; and the power flow
// between grid, battery, inverter, motor, gearbox and wheels, arrows as thick as the power,
// moving with [phase] in the editor. Panel words are in English, as in the textbooks.

void _block(Canvas canvas, Rect r, String title, String sub, Color c, {bool dim = false, bool dashed = false}) {
  final rr = RRect.fromRectAndRadius(r, const Radius.circular(10));
  canvas.drawRRect(rr, panelFill(dim ? const Color(0xFFF4F5F7) : c.withValues(alpha: 0.10)));
  if (dashed) {
    final p = panelStroke(dim ? panelMuted : c, 1.6);
    panelDashed(canvas, r.topLeft, r.topRight, p);
    panelDashed(canvas, r.topRight, r.bottomRight, p);
    panelDashed(canvas, r.bottomRight, r.bottomLeft, p);
    panelDashed(canvas, r.bottomLeft, r.topLeft, p);
  } else {
    canvas.drawRRect(rr, panelStroke(dim ? panelMuted : c, 2));
  }
  panelText(canvas, title, Offset(r.center.dx, r.top + 22), size: 16, bold: true, color: dim ? panelMuted : panelInk, align: TextAlign.center, maxWidth: r.width - 8);
  if (sub.isNotEmpty) panelText(canvas, sub, Offset(r.center.dx, r.top + 40), size: 12.5, color: panelMuted, align: TextAlign.center, maxWidth: r.width - 10, middle: false, maxLines: 3);
}

void _arrow(Canvas canvas, Offset a, Offset b, Color c, {double width = 3, String label = '', double phase = 0, bool flowing = false}) {
  final dir = b - a;
  final len = dir.distance;
  if (len == 0) return;
  final u = dir / len;
  final head = math.max(12.0, width * 2.4);
  final end = b - u * head;
  if (flowing) {
    canvas.drawLine(a, end, panelStroke(c.withValues(alpha: 0.25), width));
    panelDashed(canvas, a, end, panelStroke(c, width), dash: 14, gap: 10, phase: -phase * 48);
  } else {
    canvas.drawLine(a, end, panelStroke(c, width));
  }
  panelArrowHead(canvas, b, dir, c, size: head);
  if (label.isNotEmpty) panelText(canvas, label, Offset.lerp(a, b, 0.5)! + const Offset(0, -18), size: 14, bold: true, color: c, align: TextAlign.center, maxWidth: 200);
}

// --- Charging ------------------------------------------------------------------------------------

void paintEvCharging(Canvas canvas, EvChargingPanel m, Size size, Color accent) {
  panelText(canvas, m.heading, const Offset(24, 36), size: 26, bold: true, maxWidth: size.width - 48);
  const top = 90.0, h = 120.0;
  Rect box(double x, double w) => Rect.fromLTWH(x, top + 40, w, h);
  final ac = m.view == EvChargeView.ac;
  const acColor = Color(0xFF8E44AD), dcColor = panelWarn;
  if (ac) {
    final grid = box(20, 140), evse = box(195, 150), rect = box(400, 140), pfc = box(570, 140), dcdc = box(740, 160), batt = box(950, 140);
    _block(canvas, grid, 'Grid AC', '230 V 1-phase (Level 1/2)\nor 415 V 3-phase', acColor);
    _block(canvas, evse, 'EVSE / wallbox', 'Type 2 or Bharat AC-001; safety, pilot signal', acColor);
    _block(canvas, rect, 'Rectifier', 'Diode bridge: AC → DC', accent);
    _block(canvas, pfc, 'PFC boost', 'Power factor ≈ 1; ~400 V DC link', accent);
    _block(canvas, dcdc, 'Isolated DC-DC', 'HF transformer; sets the charging current (CC) or voltage (CV)', accent);
    _block(canvas, batt, 'Battery + BMS', '${panelNum(m.packVolts)} V, ${panelNum(m.packKwh)} kWh', panelGood);
    _arrow(canvas, grid.centerRight, evse.centerLeft, acColor, label: 'AC');
    _arrow(canvas, evse.centerRight, rect.centerLeft, acColor, label: 'AC');
    _arrow(canvas, rect.centerRight, pfc.centerLeft, accent, label: 'DC');
    _arrow(canvas, pfc.centerRight, dcdc.centerLeft, accent, label: 'DC');
    _arrow(canvas, dcdc.centerRight, batt.centerLeft, panelGood, label: 'DC');
    final obc = Rect.fromLTRB(rect.left - 12, top + 12, dcdc.right + 12, top + h + 52);
    final p = panelStroke(accent, 1.6);
    panelDashed(canvas, obc.topLeft, obc.topRight, p);
    panelDashed(canvas, obc.topRight, obc.bottomRight, p);
    panelDashed(canvas, obc.bottomRight, obc.bottomLeft, p);
    panelDashed(canvas, obc.bottomLeft, obc.topLeft, p);
    panelText(canvas, 'Onboard charger (OBC), inside the car: ${panelNum(m.chargerKw)} kW', Offset(obc.left + 8, obc.top + 12), size: 13.5, bold: true, color: accent, maxWidth: obc.width - 16);
  } else {
    final grid = box(20, 150), station = box(210, 330), plug = box(580, 160), cont = box(780, 150), batt = box(970, 150);
    _block(canvas, grid, 'Grid', '415 V 3-phase or 11 kV via a transformer', acColor);
    _block(canvas, station, 'Off-board charger: ${panelNum(m.chargerKw)} kW', 'In the station: AC/DC rectifier with PFC → isolated DC-DC; talks to the BMS and supplies the exact DC current', dcColor);
    _block(canvas, plug, 'Connector', 'CCS2, CHAdeMO or Bharat DC-001', dcColor);
    _block(canvas, cont, 'DC contactors', 'Close after the handshake; OBC bypassed', panelHot);
    _block(canvas, batt, 'Battery + BMS', '${panelNum(m.packVolts)} V, ${panelNum(m.packKwh)} kWh', panelGood);
    _arrow(canvas, grid.centerRight, station.centerLeft, acColor, label: 'AC');
    _arrow(canvas, station.centerRight, plug.centerLeft, dcColor, label: 'DC', width: 5);
    _arrow(canvas, plug.centerRight, cont.centerLeft, dcColor, label: 'DC', width: 5);
    _arrow(canvas, cont.centerRight, batt.centerLeft, panelGood, label: 'DC', width: 5);
    final obc = Rect.fromLTWH(780, top - 4, 150, 34);
    _block(canvas, obc, 'OBC (not used)', '', panelMuted, dim: true, dashed: true);
  }

  // CC-CV curve.
  final curve = m.curve;
  final tMax = math.max(10.0, curve.isEmpty ? 60.0 : curve.last.minutes);
  final plot = PanelPlot(const Rect.fromLTWH(100, 320, 600, 420), 0, tMax, 0, 100);
  plot.frame(canvas, xTitle: 'Time (minutes)', yTitle: 'SOC and current (%)');
  // Right axis: cell voltage 3.0–4.3 V.
  double vy(double v) => (v - 3.0) / 1.3 * 100;
  for (final v in [3.0, 3.4, 3.8, 4.2]) {
    final q = plot.at(tMax, vy(v));
    panelText(canvas, '${v.toStringAsFixed(1)} V', Offset(q.dx + 8, q.dy), size: 13, color: panelHot);
  }
  if (curve.isNotEmpty) {
    final cc = curve.first.cRate;
    final soc = Path(), cur = Path(), volt = Path();
    for (final (i, p) in curve.indexed) {
      final a = plot.at(p.minutes, p.soc * 100), b = plot.at(p.minutes, cc == 0 ? 0 : p.cRate / cc * 100), c = plot.at(p.minutes, vy(p.volts));
      if (i == 0) {
        soc.moveTo(a.dx, a.dy);
        cur.moveTo(b.dx, b.dy);
        volt.moveTo(c.dx, c.dy);
      } else {
        soc.lineTo(a.dx, a.dy);
        cur.lineTo(b.dx, b.dy);
        volt.lineTo(c.dx, c.dy);
      }
    }
    canvas
      ..drawPath(soc, panelStroke(panelGood, 3))
      ..drawPath(cur, panelStroke(panelCold, 3))
      ..drawPath(volt, panelStroke(panelHot, 3));
    // Where CC ends and CV begins.
    final switchAt = curve.firstWhere((p) => p.cRate < cc - 1e-9, orElse: () => curve.last);
    final x = plot.at(switchAt.minutes, 0).dx;
    panelDashed(canvas, Offset(x, plot.r.top), Offset(x, plot.r.bottom), panelStroke(panelInk, 1.4), dash: 5, gap: 4);
    panelText(canvas, 'CC', Offset(x - 8, plot.r.top + 14), size: 14, bold: true, align: TextAlign.right);
    panelText(canvas, 'CV', Offset(x + 8, plot.r.top + 14), size: 14, bold: true);
  }
  for (final (i, (name, c)) in [('SOC', panelGood), ('Current', panelCold), ('Cell voltage', panelHot)].indexed) {
    final x = 110.0 + i * 160;
    canvas.drawLine(Offset(x, 808), Offset(x + 30, 808), panelStroke(c, 3));
    panelText(canvas, name, Offset(x + 38, 808), size: 14);
  }

  // Figures and connectors.
  final to80 = m.minutesTo(0.8), toFull = curve.isEmpty ? null : curve.last.minutes;
  String time(double? min) => min == null ? '—' : (min >= 90 ? '${(min / 60).toStringAsFixed(1)} h' : '${min.round()} min');
  final lines = <(String, Color)>[
    ('Charger ${panelNum(m.chargerKw)} kW → ${panelNum(m.cRate)}C (BMS limit ${panelNum(m.maxC)}C)', panelInk),
    ('Current at the start ≈ ${panelNum(m.startAmps)} A at ${panelNum(m.packVolts)} V', panelMuted),
    ('${(m.socStart * 100).round()}% → 80%: ${time(to80)}   → full: ${time(toFull)}', panelWarn),
  ];
  for (final (i, (t, c)) in lines.indexed) {
    panelText(canvas, t, Offset(760, 322 + i * 28), size: 15.5, color: c, bold: c == panelWarn, maxWidth: 460);
  }
  if (!m.connectors) return;
  const tx = 760.0, ty = 440.0, tw = 460.0, rowH = 54.0;
  panelText(canvas, 'Connectors', const Offset(tx, ty - 12), size: 16, bold: true);
  for (final (i, (name, kind, power, use)) in evConnectors.indexed) {
    final y = ty + i * rowH;
    canvas.drawLine(Offset(tx, y), Offset(tx + tw, y), panelStroke(panelGrid, 1));
    final c = kind == 'AC' ? acColor : (kind == 'DC' ? dcColor : accent);
    panelText(canvas, name, Offset(tx, y + 14), size: 14, bold: true, maxWidth: 210);
    panelText(canvas, '$kind · $power', Offset(tx + 215, y + 14), size: 13, color: c, bold: true, maxWidth: tw - 215);
    panelText(canvas, use, Offset(tx, y + 34), size: 12, color: panelMuted, maxWidth: tw);
  }
}

// --- Power flow ----------------------------------------------------------------------------------

String _kw(double w) => '${panelNum(w / 1000)} kW';

/// Draws the power flow; [phase] (0..1, looping) moves the dashes along the arrows.
void paintEvPowerFlow(Canvas canvas, EvPowerFlow m, Size size, Color accent, {double phase = 0}) {
  panelText(canvas, m.heading, const Offset(24, 36), size: 26, bold: true, maxWidth: size.width - 300);
  final modeName = switch (m.mode) {
    EvMode.driving => 'Driving',
    EvMode.regen => 'Regenerative braking',
    EvMode.charging => 'Charging',
    EvMode.idle => 'Idle (parked, systems on)',
  };
  final modeColor = switch (m.mode) {
    EvMode.driving => panelGood,
    EvMode.regen => panelCold,
    EvMode.charging => const Color(0xFF8E44AD),
    EvMode.idle => panelMuted,
  };
  final chip = Rect.fromLTWH(size.width - 300, 18, 276, 36);
  canvas.drawRRect(RRect.fromRectAndRadius(chip, const Radius.circular(18)), panelFill(modeColor.withValues(alpha: 0.15)));
  panelText(canvas, modeName, chip.center, size: 16, bold: true, color: modeColor, align: TextAlign.center, maxWidth: chip.width - 12);

  final f = m.flow;
  const y = 300.0, h = 110.0;
  final batt = const Rect.fromLTWH(40, y - h / 2, 180, h);
  final inv = const Rect.fromLTWH(310, y - h / 2, 170, h);
  final mot = const Rect.fromLTWH(570, y - h / 2, 170, h);
  final gb = const Rect.fromLTWH(830, y - h / 2, 160, h);
  const wheelC = Offset(1130, y);
  final drive = m.mode == EvMode.driving || m.mode == EvMode.regen;
  final soc = '${panelNum(m.packKwh)} kWh';
  _block(canvas, batt, 'Battery', soc, panelGood);
  _block(canvas, inv, 'Inverter', 'η ${(m.effInverter * 100).round()}%', accent, dim: !drive);
  _block(canvas, mot, 'Motor', drive ? 'η ${(m.effMotor * 100).round()}%  ·  ${panelNum(m.motorRpm, digits: 4)} rpm' : 'η ${(m.effMotor * 100).round()}%', accent, dim: !drive);
  _block(canvas, gb, 'Gearbox', 'η ${(m.effGear * 100).round()}%  ·  ${panelNum(m.gear)} : 1', accent, dim: !drive);
  canvas
    ..drawCircle(wheelC, 52, panelFill(const Color(0xFF2B2B2B)))
    ..drawCircle(wheelC, 24, panelFill(const Color(0xFFB8BEC4)));
  // Spokes turn with the wheel in the editor.
  final spin = drive ? phase * 2 * math.pi : 0.0;
  for (var k = 0; k < 5; k++) {
    final a = spin + k * 2 * math.pi / 5;
    canvas.drawLine(wheelC, wheelC + Offset(math.cos(a), math.sin(a)) * 22, panelStroke(const Color(0xFF6A7078), 3));
  }
  panelText(canvas, drive ? 'Wheels  ${panelNum(m.speedKmh)} km/h' : 'Wheels (stopped)', Offset(wheelC.dx, y + 74), size: 15, bold: true, align: TextAlign.center, maxWidth: 220);

  double width(double w) => 2 + math.min(14, w.abs() / 4000);
  final stages = {for (final s in f.stages) s.name: s};
  if (drive) {
    final c = m.mode == EvMode.driving ? panelGood : panelCold;
    final fwd = m.mode == EvMode.driving;
    void link(Rect a, Rect b, double w) {
      final from = fwd ? a.centerRight : b.centerLeft, to = fwd ? b.centerLeft : a.centerRight;
      _arrow(canvas, from, to, c, width: width(w), label: _kw(w.abs()), phase: phase, flowing: true);
    }

    final inverter = stages['Inverter']!, motor = stages['Motor']!, gear = stages['Gearbox']!;
    // Battery side of the inverter is its DC side.
    link(batt, inv, fwd ? inverter.input : inverter.output);
    link(inv, mot, fwd ? inverter.output : inverter.input);
    link(mot, gb, fwd ? motor.output : motor.input);
    final wheelEdge = wheelC - const Offset(52, 0);
    final from = fwd ? gb.centerRight : wheelEdge, to = fwd ? wheelEdge : gb.centerRight;
    _arrow(canvas, from, to, c, width: width(f.wheels), label: _kw(f.wheels.abs()), phase: phase, flowing: true);
    for (final (r, s) in [(inv, inverter), (mot, motor), (gb, gear)]) {
      final loss = (s.input.abs() - s.output.abs()).abs();
      panelText(canvas, 'loss ${_kw(loss)}', Offset(r.center.dx, r.bottom + 16), size: 13.5, color: panelHot, bold: true, align: TextAlign.center, maxWidth: r.width);
    }
  }
  if (m.mode == EvMode.charging) {
    final charger = stages['Charger']!;
    const grid = Rect.fromLTWH(40, 92, 180, 70);
    _block(canvas, grid, 'Grid → charger', 'η ${(m.effCharger * 100).round()}%', const Color(0xFF8E44AD));
    _arrow(canvas, Offset(grid.center.dx, grid.bottom), Offset(batt.center.dx, batt.top), const Color(0xFF8E44AD), width: width(charger.input), phase: phase, flowing: true);
    panelText(canvas, '${_kw(charger.input)} in · ${_kw(charger.output)} out', Offset(grid.right + 14, (grid.bottom + batt.top) / 2), size: 14, bold: true, color: const Color(0xFF8E44AD));
    panelText(canvas, 'loss ${_kw(charger.input - charger.output)}', Offset(grid.right + 14, (grid.bottom + batt.top) / 2 + 20), size: 13.5, bold: true, color: panelHot);
  }
  // Auxiliaries, always on.
  const aux = Rect.fromLTWH(40, 450, 180, 70);
  _block(canvas, aux, 'Auxiliaries', '12 V, cooling, cabin', panelMuted);
  _arrow(canvas, Offset(batt.center.dx, batt.bottom), Offset(aux.center.dx, aux.top), panelMuted, width: width(f.aux), phase: phase, flowing: true);
  panelText(canvas, _kw(f.aux), Offset(aux.right + 12, (batt.bottom + aux.top) / 2), size: 14, bold: true, color: panelMuted);

  // The figures.
  final batteryW = f.battery;
  final out = switch (m.mode) {
    EvMode.driving => f.wheels,
    EvMode.regen => -f.wheels,
    _ => 0.0,
  };
  final lines = <(String, Color)>[
    ('Battery ${batteryW >= 0 ? 'gives' : 'takes in'} ${_kw(batteryW.abs())}', batteryW >= 0 ? panelGood : panelCold),
    if (drive) ('Torque ${panelNum(m.torque)} N·m at ${panelNum(m.motorRpm, digits: 4)} rpm → shaft ${_kw((m.torque * m.motorRadS).abs())}', panelInk),
    if (m.mode == EvMode.driving) ('Battery → wheels efficiency ${(out / batteryW * 100).clamp(0, 100).toStringAsFixed(1)}%', panelInk),
    if (m.mode == EvMode.regen) ('Recovered ${(-(batteryW - f.aux) / out * 100).clamp(0, 100).toStringAsFixed(1)}% of the braking power', panelInk),
    ('Losses ${_kw(m.losses)}', panelHot),
    ('Steady ${panelNum(m.speedKmh)} km/h on the level: ${panelNum(m.whPerKm(math.max(1, m.speedKmh)))} Wh/km, range ≈ ${panelNum(m.rangeKm(math.max(1, m.speedKmh)))} km', panelWarn),
    ('Road load needs ${panelNum(m.cruiseTorque)} N·m at the motor (${panelNum(m.massKg)} kg)', panelMuted),
  ];
  for (final (i, (t, c)) in lines.indexed) {
    panelText(canvas, t, Offset(300, 470 + i * 34), size: 17, color: c, bold: c == panelWarn || c == panelGood || c == panelCold, maxWidth: size.width - 330);
  }
}
