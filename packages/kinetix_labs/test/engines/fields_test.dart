import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_labs/kinetix_labs.dart';
import 'package:kinetix_labs/src/benches/mechanics/modern_benches.dart';
import 'package:kinetix_labs/src/engines/fields.dart';

List<Object> row(LabBench b, LabParams p) {
  final r = b.read(p);
  expect(r.row, isNotNull, reason: 'no reading: ${r.why}');
  return r.row!;
}

double num1(String text, String pattern) => double.parse(RegExp(pattern).firstMatch(text)!.group(1)!.replaceAll(RegExp(r'\.$'), ''));

void main() {
  test('Helmholtz field, beam radius and e/m round trip', () {
    final b = Fields.helmholtz(1.5, 130, 0.15);
    expect(b, closeTo(1.169e-3, 0.002e-3));
    final r = Fields.beamRadius(200, b);
    expect(2 * 200 / (b * b * r * r), closeTo(Fields.eOverM, 1));
  });

  test('photoelectric: no emission below threshold; V0 = hc/λe − φ', () {
    expect(Fields.stoppingPotential(800e-9, 1.9), 0);
    expect(Fields.stoppingPotential(400e-9, 1.9), closeTo(1239.84 / 400 - 1.9, 0.01));
    expect(Fields.photocurrent(-2, 1.0, 1e-8), 0);
    expect(Fields.photocurrent(5, 1.0, 1e-8), closeTo(1e-8, 1e-10));
  });

  test('Hall voltage and hysteresis signs', () {
    expect(Fields.hallVoltage(2e-3, 0.2, 1e21, 0.5e-3), closeTo(-5e-3, 1e-5));
    expect(Fields.hysteresis(0, -1), greaterThan(0.5)); // retentivity on the way down
    expect(Fields.hysteresis(0, 1), lessThan(-0.5));
    expect(Fields.hysteresis(-80, -1).abs(), lessThan(0.01)); // coercivity
  });

  test('e/m bench gives 1.76 × 10¹¹ C/kg within reading error', () {
    const b = EmBench();
    final rows = [
      for (final v in [150.0, 200.0, 250.0, 300.0])
        for (final i in [1.5, 2.0]) ?b.read({'v': v, 'i': i}).row,
    ];
    expect(rows.length, greaterThanOrEqualTo(5));
    expect(num1(b.result(rows)!, r'e/m = ([0-9.]+) ±'), closeTo(1.759, 0.06));
  });

  test('photoelectric bench: h and φ from stopping potentials', () {
    const b = PhotoelectricBench();
    final rows = <List<Object>>[];
    for (final nm in PhotoelectricBench.lines.keys) {
      // Walk the retarding potential down until the current vanishes.
      for (var v = 0.0; v >= -2.5; v -= 0.01) {
        final p = {'nm': nm, 'intensity': 1.0, 'v': (v * 100).round() / 100};
        if (PhotoelectricBench.current(p) == 0) {
          rows.add(row(b, p));
          break;
        }
        if (v == 0.0) rows.add(row(b, p));
      }
    }
    final res = b.result(rows)!;
    expect(num1(res, r'h = ([0-9.]+) ±'), closeTo(6.63, 0.4));
    expect(num1(res, r'φ = ([0-9.]+) eV'), closeTo(1.9, 0.15));
  });

  test('Hall bench: carrier type and density', () {
    const b = HallBench();
    final rows = [for (final i in [2.0, 4.0, 6.0]) row(b, {'sample': 'n-Ge', 'i': i, 'b': 0.3})];
    final res = b.result(rows)!;
    expect(res, contains(tr('electrons (n-type)')));
    expect(num1(res, r'n = 1 ÷ \(\|R_H\| e\) = ([0-9.]+)'), closeTo(1.0, 0.05));
  });

  test('B–H bench traces the loop and reads retentivity and coercivity', () {
    const b = HysteresisBench();
    var p = b.defaults;
    final rows = <List<Object>>[];
    for (var k = 0; k < 24; k++) {
      rows.add(row(b, p));
      p = b.act('down', p);
    }
    final res = b.result(rows)!;
    expect(num1(res, r'≈ ([0-9.]+) T'), closeTo(Fields.hysteresis(0, -1), 0.03));
    expect(num1(res, r'≈ ([0-9]+) A/m'), closeTo(80, 8));
  });
}
