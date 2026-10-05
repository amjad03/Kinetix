import 'package:flutter/material.dart';

import '../../core/bench.dart';
import '../../core/i18n.dart';
import '../../engines/circuit.dart';
import 'schematic.dart';

/// Common-emitter characteristics of an NPN transistor: input (Ib against
/// Vbe at a fixed Vce) and output (Ic against Vce at a fixed Ib).
class TransistorBench extends LabBench {
  const TransistorBench();

  static const beta = 150.0, rc = 100.0;

  @override
  String get kind => 'transistor';

  @override
  LabParams get defaults => {'mode': 'output', 'ib': 20.0, 'vcc': 0.0, 'vbb': 0.0, 'vce': 5.0};

  @override
  LabParams get preview => {...defaults, 'vcc': 5.0};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('mode', tr('Characteristic'), [('input', tr('Input')), ('output', tr('Output'))]),
        if (pStr(p, 'mode') == 'input') ...[
          LabChoice('vce', 'Vce', [(1.0, '1 V'), (5.0, '5 V')]),
          LabSlider('vbb', 'Vbb', 0, 3, divisions: 300, unit: ' V', decimals: 2),
        ] else ...[
          LabChoice('ib', 'Ib', [(10.0, '10 µA'), (20.0, '20 µA'), (30.0, '30 µA'), (40.0, '40 µA')]),
          LabSlider('vcc', 'Vcc', 0, 10, divisions: 200, unit: ' V', decimals: 2),
        ],
      ];

  @override
  LabParams act(String action, LabParams p) => action == 'set:mode' ? {...p, 'vcc': 0.0, 'vbb': 0.0} : p;

  /// (Ib µA, Vbe V, Vce V, Ic mA) as the meters show them.
  static (double, double, double, double) measure(LabParams p) {
    final c = Circuit()..add(Npn('Q', 'c', 'b', '0', beta: beta));
    if (pStr(p, 'mode') == 'input') {
      c
        ..add(VSource('Vbb', 'bb', '0', pNum(p, 'vbb')))
        ..add(Resistor('Rb', 'bb', 'b', 10e3))
        ..add(VSource('Vcc', 'cc', '0', pNum(p, 'vce', 5)))
        ..add(Resistor('Rc', 'cc', 'c', 1));
    } else {
      c
        ..add(ISource('Ib', '0', 'b', pNum(p, 'ib', 20) * 1e-6))
        ..add(VSource('Vcc', 'cc', '0', pNum(p, 'vcc')))
        ..add(Resistor('Rc', 'cc', 'c', rc));
    }
    final s = c.dc();
    final ib = pStr(p, 'mode') == 'input' ? s.i('Rb') : pNum(p, 'ib', 20) * 1e-6;
    return (ib * 1e6, s.v('b'), s.v('c'), s.i('Rc') * 1e3);
  }

  @override
  List<LabColumn> get columns => [LabColumn('Ib (µA)', 1), LabColumn('Vbe (V)', 3), LabColumn('Vce (V)', 2), LabColumn('Ic (mA)', 2)];

  @override
  LabReading read(LabParams p) {
    final (ib, vbe, vce, ic) = measure(p);
    if (pStr(p, 'mode') == 'input' ? pNum(p, 'vbb') <= 0 : pNum(p, 'vcc') <= 0) return LabReading.not(tr('Turn up the supply first.'));
    return LabReading.row([(ib * 10).round() / 10, (vbe * 1000).round() / 1000, (vce * 100).round() / 100, (ic * 100).round() / 100]);
  }

  @override
  List<String> live(LabParams p) {
    final (ib, vbe, vce, ic) = measure(p);
    return ['Ib = ${ib.toStringAsFixed(1)} µA', 'Vbe = ${vbe.toStringAsFixed(3)} V', 'Vce = ${vce.toStringAsFixed(2)} V', 'Ic = ${ic.toStringAsFixed(2)} mA'];
  }

  @override
  LabGraph graph(LabParams p) {
    if (pStr(p, 'mode') == 'input') {
      final vce = pNum(p, 'vce', 5);
      return LabGraph(1, 0, curve: true, include: (r) => ((r[2] as num) - vce).abs() < 0.3);
    }
    final ib = pNum(p, 'ib', 20);
    return LabGraph(2, 3, curve: true, include: (r) => (r[0] as num) == ib && (r[2] as num) > 0.05);
  }

  @override
  String? result(List<List<Object>> rows) {
    // Current gain from output readings in the active region (Vce above 1 V).
    final active = [for (final r in rows) if ((r[2] as num) > 1 && (r[0] as num) > 0 && (r[3] as num) > 0.05) r];
    final out = <String>[];
    if (active.isNotEmpty) {
      final betas = [for (final r in active) (r[3] as num) * 1000 / (r[0] as num)];
      final m = meanSe(betas.map((b) => b.toDouble()).toList());
      out.add(tr('Current gain β = Ic ÷ Ib ≈ {b} in the active region (Vce above 1 V), where Ic hardly changes with Vce.', {'b': m.mean.toStringAsFixed(0)}));
      // ac gain from two different base currents at about the same Vce.
      final byIb = <num, List<List<Object>>>{};
      for (final r in active) {
        byIb.putIfAbsent(r[0] as num, () => []).add(r);
      }
      if (byIb.length >= 2) {
        final ks = byIb.keys.toList()..sort();
        double icAt(num ib) => byIb[ib]!.map((r) => (r[3] as num).toDouble()).reduce((a, b) => a + b) / byIb[ib]!.length;
        final ac = (icAt(ks.last) - icAt(ks.first)) * 1000 / (ks.last - ks.first);
        out.add(tr('From two base currents, ΔIc ÷ ΔIb ≈ {b}.', {'b': ac.toStringAsFixed(0)}));
      }
    }
    final input = [for (final r in rows) if ((r[0] as num) > 5) r]..sort((a, b) => (a[0] as num).compareTo(b[0] as num));
    if (input.length >= 2 && active.isEmpty) {
      final a = input[input.length - 2], b = input.last;
      final rin = ((b[1] as num) - (a[1] as num)) / (((b[0] as num) - (a[0] as num)) * 1e-6);
      out.add(tr('Input resistance ΔVbe ÷ ΔIb ≈ {r} Ω near the top of the curve; the base current starts only after Vbe ≈ 0.6 V.', {'r': rin.toStringAsFixed(0)}));
    }
    return out.isEmpty ? null : out.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final (ib, vbe, vce, ic) = measure(p);
    final input = pStr(p, 'mode') == 'input';
    final sch = Schematic(canvas, Rect.fromLTWH(w * 0.03, h * 0.05, w * 0.94, h * 0.9), cols: 14, rows: 8);
    final (col, base, em) = sch.npn(7, 4);
    // Base side.
    sch.wire([(base.$1, base.$2), (4.6, 4)]);
    sch.meterAt(4, 4, 'µA', ib, 50, '${ib.toStringAsFixed(1)} µA');
    sch.wire([(3.4, 4), (2.8, 4), (2.8, 3)]);
    if (input) {
      sch.resistor(2.8, 3, 2.8, 1.2, '10 kΩ');
      sch.wire([(2.8, 1.2), (1, 1.2), (1, 3)]);
      sch.cell(1, 3, 1, 5, 'Vbb');
    } else {
      sch.wire([(2.8, 3), (2.8, 1.2), (1, 1.2), (1, 3)]);
      sch.cell(1, 3, 1, 5, 'Ib');
    }
    sch.wire([(1, 5), (1, 7), (em.$1, 7), (em.$1, em.$2)]);
    sch.wire([(5.7, 4), (5.7, 5.2)]);
    sch.meterAt(5.7, 5.8, 'V', vbe, 1, '${vbe.toStringAsFixed(3)} V');
    sch.wire([(5.7, 6.4), (5.7, 7)]);
    sch.dot(5.7, 4);
    sch.dot(5.7, 7);
    // Collector side.
    sch.wire([(col.$1, col.$2), (col.$1, 1.2), (8.6, 1.2)]);
    sch.meterAt(9.2, 1.2, 'mA', ic, 10, '${ic.toStringAsFixed(2)} mA');
    sch.wire([(9.8, 1.2), (10.6, 1.2)]);
    sch.resistor(10.6, 1.2, 12.6, 1.2, input ? '1 Ω' : '100 Ω');
    sch.wire([(12.6, 1.2), (13.2, 1.2), (13.2, 3)]);
    sch.cell(13.2, 3, 13.2, 5, 'Vcc');
    sch.wire([(13.2, 5), (13.2, 7), (em.$1, 7)]);
    sch.wire([(col.$1, 2.4), (10.4, 2.4), (10.4, 3.4)]);
    sch.meterAt(10.4, 4, 'V', vce, 10, '${vce.toStringAsFixed(2)} V');
    sch.wire([(10.4, 4.6), (10.4, 7)]);
    sch.dot(col.$1, 2.4);
    sch.dot(10.4, 7);
    sch.text(input ? tr('Input characteristic') : tr('Output characteristic'), 7, 7.6, size: 0.34, bold: true);
  }
}

/// Logic gates and their truth tables: two switches, the gate and an LED.
class LogicBench extends LabBench {
  const LogicBench();

  static const gates = ['and', 'or', 'not', 'nand', 'nor', 'xor', 'xnor'];

  static GateKind kindOf(String g) => GateKind.values.firstWhere((k) => k.name == g, orElse: () => GateKind.and);

  @override
  String get kind => 'logic';

  @override
  LabParams get defaults => {'gate': 'and', 'a': false, 'b': false};

  @override
  LabParams get preview => {...defaults, 'a': true, 'b': true};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('gate', tr('Gate'), [for (final g in gates) (g, g.toUpperCase())]),
        LabToggle('a', tr('Input A')),
        if (pStr(p, 'gate') != 'not') LabToggle('b', tr('Input B')),
      ];

  static bool output(LabParams p) {
    final k = kindOf(pStr(p, 'gate', 'and'));
    // Through the circuit engine, as the board's logic trainer would.
    final c = Circuit()
      ..add(VSource('A', 'a', '0', pBool(p, 'a') ? 5 : 0))
      ..add(VSource('B', 'b', '0', pBool(p, 'b') ? 5 : 0))
      ..add(Gate('G', k, k == GateKind.not ? ['a'] : ['a', 'b'], 'y'))
      ..add(Resistor('LED', 'y', '0', 330));
    return c.dc().v('y') > 2.5;
  }

  @override
  List<LabColumn> get columns => [LabColumn(tr('Gate')), const LabColumn('A'), const LabColumn('B'), const LabColumn('Y')];

  @override
  LabReading read(LabParams p) {
    final g = pStr(p, 'gate', 'and');
    return LabReading.row([g.toUpperCase(), pBool(p, 'a') ? 1 : 0, g == 'not' ? '—' : (pBool(p, 'b') ? 1 : 0), output(p) ? 1 : 0]);
  }

  @override
  List<String> live(LabParams p) => ['A = ${pBool(p, 'a') ? 1 : 0}', if (pStr(p, 'gate') != 'not') 'B = ${pBool(p, 'b') ? 1 : 0}', 'Y = ${output(p) ? 1 : 0}'];

  static String expression(String g) => switch (g) {
        'or' => 'Y = A + B',
        'not' => 'Y = Ā',
        'nand' => 'Y = (A·B)‾',
        'nor' => 'Y = (A + B)‾',
        'xor' => 'Y = A ⊕ B',
        'xnor' => 'Y = (A ⊕ B)‾',
        _ => 'Y = A·B',
      };

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final out = <String>[];
    for (final g in gates) {
      final mine = rows.where((r) => r[0] == g.toUpperCase()).toList();
      if (mine.isEmpty) continue;
      final seen = {for (final r in mine) '${r[1]}${r[2]}'};
      final need = g == 'not' ? 2 : 4;
      if (seen.length < need) {
        out.add(tr('{g}: {n} of {m} input combinations recorded.', {'g': g.toUpperCase(), 'n': seen.length, 'm': need}));
        continue;
      }
      final ok = mine.every((r) {
        final a = r[1] == 1, b = r[2] == 1;
        return Gate.eval(kindOf(g), g == 'not' ? [a] : [a, b]) == (r[3] == 1);
      });
      out.add(ok
          ? tr('{g}: the truth table is complete and matches {e}.', {'g': g.toUpperCase(), 'e': expression(g)})
          : tr('{g}: some rows do not match {e}; check them again.', {'g': g.toUpperCase(), 'e': expression(g)}));
    }
    return out.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final g = pStr(p, 'gate', 'and');
    final k = kindOf(g);
    final y = output(p);
    final sch = Schematic(canvas, Rect.fromLTWH(w * 0.02, h * 0.05, w * 0.6, h * 0.8), cols: 10, rows: 7);
    final (ins, out) = sch.gate(k, 5.4, 3.5, lit: y);
    final a = pBool(p, 'a'), b = pBool(p, 'b');
    void input(String name, (double, double) at, bool on) {
      sch.wire([(at.$1, at.$2), (2.2, at.$2)]);
      sch.indicator(1.6, at.$2, on, color: LabInk.green);
      sch.text('$name = ${on ? 1 : 0}', 0.6, at.$2, size: 0.36, bold: true);
    }

    input('A', ins.first, a);
    if (k != GateKind.not) input('B', ins.last, b);
    sch.wire([out, (8.4, out.$2)]);
    sch.indicator(8.8, out.$2, y);
    sch.text('Y = ${y ? 1 : 0}', 8.8, out.$2 + 0.9, size: 0.4, bold: true, color: y ? LabInk.red : LabInk.muted);
    sch.text(g.toUpperCase(), 5.4, 5.3, size: 0.45, bold: true);
    sch.text(expression(g), 5.4, 6.1, size: 0.36, color: LabInk.muted);
    // The truth table, with the present row marked.
    final rows = k == GateKind.not ? [(false, false), (true, false)] : [(false, false), (false, true), (true, false), (true, true)];
    final x0 = w * 0.67, y0 = h * 0.18, cw = w * 0.09, rh = h * 0.1;
    final heads = k == GateKind.not ? ['A', 'Y'] : ['A', 'B', 'Y'];
    for (var c = 0; c < heads.length; c++) {
      label(canvas, heads[c], Offset(x0 + cw * (c + 0.5), y0), size: 18, bold: true);
    }
    for (var r = 0; r < rows.length; r++) {
      final (ra, rb) = rows[r];
      final now = ra == a && (k == GateKind.not || rb == b);
      final cy = y0 + rh * (r + 1);
      if (now) canvas.drawRect(Rect.fromLTWH(x0, cy - rh / 2, cw * heads.length, rh), fill(const Color(0xFFFFF1C9)));
      final cells = [ra ? 1 : 0, if (k != GateKind.not) rb ? 1 : 0, Gate.eval(k, k == GateKind.not ? [ra] : [ra, rb]) ? 1 : 0];
      for (var c = 0; c < cells.length; c++) {
        label(canvas, '${cells[c]}', Offset(x0 + cw * (c + 0.5), cy), size: 17);
      }
    }
    canvas.drawRect(Rect.fromLTWH(x0, y0 - rh / 2, cw * heads.length, rh * (rows.length + 1)), stroke(LabInk.faint, 1.5));
    canvas.drawLine(Offset(x0, y0 + rh / 2), Offset(x0 + cw * heads.length, y0 + rh / 2), stroke(LabInk.faint, 1.5));
  }
}
