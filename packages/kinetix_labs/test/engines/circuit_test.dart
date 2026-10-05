import 'dart:math' as math;

import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_labs/src/engines/circuit.dart';

/// The circuit engine against values worked out by hand.
void main() {
  test('series resistors: the current is E ÷ (R1 + R2 + R3) and the drops add up', () {
    final c = Circuit()
      ..add(VSource('E', 'a', '0', 12))
      ..add(Ammeter('A', 'a', 'b'))
      ..add(Resistor('R1', 'b', 'c', 100))
      ..add(Resistor('R2', 'c', 'd', 200))
      ..add(Resistor('R3', 'd', '0', 300));
    final s = c.dc();
    expect(s.i('A'), closeTo(0.02, 1e-12));
    expect(s.i('E'), closeTo(0.02, 1e-12));
    expect(s.vab('b', 'c') + s.vab('c', 'd') + s.vab('d', '0'), closeTo(12, 1e-9));
    expect(s.v('d'), closeTo(6, 1e-9));
  });

  test('parallel resistors: 6 Ω ∥ 3 Ω = 2 Ω; the currents split inversely', () {
    final c = Circuit()
      ..add(VSource('E', 'a', '0', 6))
      ..add(Resistor('R1', 'a', '0', 6))
      ..add(Resistor('R2', 'a', '0', 3));
    final s = c.dc();
    expect(6 / s.i('E'), closeTo(2, 1e-9));
    expect(s.i('R2') / s.i('R1'), closeTo(2, 1e-9));
  });

  test("Kirchhoff: two sources, three branches (textbook network)", () {
    // E1 = 10 V with R1 = 2 Ω, E2 = 5 V with R2 = 4 Ω, common R3 = 6 Ω.
    final c = Circuit()
      ..add(VSource('E1', 'a', '0', 10))
      ..add(Resistor('R1', 'a', 'm', 2))
      ..add(VSource('E2', 'b', '0', 5))
      ..add(Resistor('R2', 'b', 'm', 4))
      ..add(Resistor('R3', 'm', '0', 6));
    final s = c.dc();
    // Node equation: (10 − V)/2 + (5 − V)/4 = V/6 → V = 75/11.
    expect(s.v('m'), closeTo(75 / 11, 1e-9));
    // KCL at m.
    expect(s.i('R1') + s.i('R2'), closeTo(s.i('R3'), 1e-12));
  });

  test('Wheatstone bridge balances when P/Q = R/S', () {
    Circuit bridge(double s) => Circuit()
      ..add(VSource('E', 'top', '0', 2))
      ..add(Resistor('P', 'top', 'b', 10))
      ..add(Resistor('Q', 'b', '0', 20))
      ..add(Resistor('R', 'top', 'd', 5))
      ..add(Resistor('S', 'd', '0', s))
      ..add(Resistor('G', 'b', 'd', 50));
    expect(bridge(10).dc().i('G'), closeTo(0, 1e-12));
    expect(bridge(12).dc().i('G').abs(), greaterThan(1e-4));
  });

  test('a silicon diode drops about 0.6–0.75 V forward and blocks in reverse', () {
    double forward(double e) {
      final c = Circuit()
        ..add(VSource('E', 'a', '0', e))
        ..add(Resistor('R', 'a', 'd', 1000))
        ..add(Diode.silicon('D', 'd', '0'));
      return c.dc().v('d');
    }

    expect(forward(5), inInclusiveRange(0.6, 0.8));
    expect(forward(10), greaterThan(forward(5)));
    final rev = Circuit()
      ..add(VSource('E', 'a', '0', -5))
      ..add(Resistor('R', 'a', 'd', 1000))
      ..add(Diode.silicon('D', 'd', '0'));
    expect(rev.dc().i('D').abs(), lessThan(1e-6));
    // The germanium knee is lower.
    final ge = Circuit()
      ..add(VSource('E', 'a', '0', 5))
      ..add(Resistor('R', 'a', 'd', 1000))
      ..add(Diode.germanium('D', 'd', '0'));
    expect(ge.dc().v('d'), inInclusiveRange(0.15, 0.4));
  });

  test('a Zener holds its voltage as the supply rises', () {
    double vz(double e) {
      final c = Circuit()
        ..add(VSource('E', 'a', '0', e))
        ..add(Resistor('R', 'a', 'k', 220))
        ..add(Diode.zener('Z', '0', 'k', 5.1));
      return c.dc().v('k');
    }

    expect(vz(3), closeTo(3, 0.01)); // below breakdown: no current, full supply
    expect(vz(9), closeTo(5.1, 0.1));
    expect(vz(15) - vz(9), lessThan(0.05));
  });

  test('LED knee voltage follows the photon energy hc/λe', () {
    double knee(double nm) {
      final c = Circuit()
        ..add(VSource('E', 'a', '0', 9))
        ..add(Resistor('R', 'a', 'd', 7000))
        ..add(Diode.led('D', 'd', '0', nm));
      return c.dc().v('d');
    }

    expect(knee(470), greaterThan(knee(625)));
    expect(knee(625), closeTo(1239.84 / 625, 0.15));
  });

  test('RC charging: 63 % of E after one time constant', () {
    const r = 10e3, cap = 100e-6, e = 10.0; // τ = 1 s
    final c = Circuit()
      ..add(VSource('E', 'a', '0', e))
      ..add(Resistor('R', 'a', 'c', r))
      ..add(Capacitor('C', 'c', '0', cap));
    final steps = c.transient(duration: 5, dt: 0.002);
    double at(double t) => steps[(t / 0.002).round() - 1].v('c');
    expect(at(1), closeTo(e * (1 - math.exp(-1)), 0.02));
    expect(at(2), closeTo(e * (1 - math.exp(-2)), 0.02));
    expect(at(5), closeTo(e, 0.08));
  });

  test('series RLC: the current peaks at f₀ = 1/(2π√LC) where it is E/R', () {
    const l = 0.1, cap = 1e-6, r = 50.0;
    final f0 = 1 / (2 * math.pi * math.sqrt(l * cap));
    double current(double f) {
      final c = Circuit()
        ..add(VSource('E', 'a', '0', 0, ac: 1))
        ..add(Resistor('R', 'a', 'b', r))
        ..add(Inductor('L', 'b', 'c', l))
        ..add(Capacitor('C', 'c', '0', cap));
      return c.ac(f).i('E').abs;
    }

    expect(current(f0), closeTo(1 / r, 1e-6));
    expect(current(f0 * 0.8), lessThan(current(f0)));
    expect(current(f0 * 1.25), lessThan(current(f0)));
  });

  test('an inductor in a transient: i rises to E/R with τ = L/R', () {
    const l = 1.0, r = 10.0; // τ = 0.1 s
    final c = Circuit()
      ..add(VSource('E', 'a', '0', 5))
      ..add(Resistor('R', 'a', 'b', r))
      ..add(Inductor('L', 'b', '0', l));
    final s = c.transient(duration: 0.1, dt: 0.0002);
    expect(s.last.i('R'), closeTo(0.5 * (1 - math.exp(-1)), 0.005));
  });

  test('op-amp: inverting gain −Rf/Rin, non-inverting 1 + Rf/R1, saturation at the rails', () {
    double inverting(double vin, double rf, double rin) {
      final c = Circuit()
        ..add(VSource('Vin', 'in', '0', vin))
        ..add(Resistor('Rin', 'in', 'm', rin))
        ..add(Resistor('Rf', 'm', 'o', rf))
        ..add(OpAmp('U', '0', 'm', 'o'));
      return c.dc().v('o');
    }

    expect(inverting(0.5, 10e3, 1e3), closeTo(-5, 1e-6));
    expect(inverting(2, 10e3, 1e3), closeTo(-13.5, 1e-6));
    final ni = Circuit()
      ..add(VSource('Vin', 'p', '0', 0.4))
      ..add(Resistor('R1', 'm', '0', 1e3))
      ..add(Resistor('Rf', 'm', 'o', 4.7e3))
      ..add(OpAmp('U', 'p', 'm', 'o'));
    expect(ni.dc().v('o'), closeTo(0.4 * 5.7, 1e-6));
  });

  test('logic gates follow their truth tables, and gates chain', () {
    for (final k in GateKind.values) {
      for (var x = 0; x < 4; x++) {
        final a = x & 1 == 1, b = x & 2 == 2;
        final c = Circuit()
          ..add(VSource('A', 'a', '0', a ? 5 : 0))
          ..add(VSource('B', 'b', '0', b ? 5 : 0))
          ..add(Gate('G', k, k == GateKind.not ? ['a'] : ['a', 'b'], 'y'))
          ..add(Resistor('L', 'y', '0', 1e3));
        final want = Gate.eval(k, k == GateKind.not ? [a] : [a, b]);
        expect(c.dc().v('y'), want ? 5 : 0, reason: '$k $a $b');
      }
    }
    expect(Gate.eval(GateKind.xor, [true, false]), isTrue);
    expect(Gate.eval(GateKind.nand, [true, true]), isFalse);
    // NAND then NOT is AND.
    final chain = Circuit()
      ..add(VSource('A', 'a', '0', 5))
      ..add(VSource('B', 'b', '0', 5))
      ..add(Gate('G1', GateKind.nand, ['a', 'b'], 'n'))
      ..add(Gate('G2', GateKind.not, ['n'], 'y'));
    expect(chain.dc().v('y'), 5);
  });

  test('NPN transistor: in the active region Ic ≈ β·Ib; in cut-off nothing flows', () {
    Solution bias(double vbb) {
      final c = Circuit()
        ..add(VSource('Vbb', 'bb', '0', vbb))
        ..add(Resistor('Rb', 'bb', 'b', 100e3))
        ..add(VSource('Vcc', 'cc', '0', 10))
        ..add(Resistor('Rc', 'cc', 'c', 1e3))
        ..add(Npn('Q', 'c', 'b', '0', beta: 150));
      return c.dc();
    }

    final s = bias(2);
    final ib = s.i('Rb'), ic = s.i('Rc');
    expect(s.vab('b', '0'), inInclusiveRange(0.55, 0.8));
    expect(ic / ib, closeTo(150 * (1 + s.v('c') / 100), 8));
    expect(bias(0).i('Rc').abs(), lessThan(1e-6));
    // Driven hard, it saturates: Vce small.
    expect(bias(10).v('c'), lessThan(0.3));
  });

  test('half-wave and bridge rectifiers: peak output Vm − 0.7 V and Vm − 1.4 V', () {
    const vm = 10.0, f = 50.0;
    final hw = Circuit()
      ..add(VSource.sine('S', 'a', '0', vm, f))
      ..add(Diode.silicon('D', 'a', 'o'))
      ..add(Resistor('RL', 'o', '0', 1e3));
    final out = [for (final s in hw.transient(duration: 0.04, dt: 2e-5)) s.v('o')];
    expect(out.reduce(math.max), closeTo(vm - 0.7, 0.2));
    expect(out.reduce(math.min), greaterThan(-0.01));
    final br = Circuit()
      ..add(VSource.sine('S', 'a', 'b', vm, f))
      ..add(Diode.silicon('D1', 'a', 'p'))
      ..add(Diode.silicon('D2', 'b', 'p'))
      ..add(Diode.silicon('D3', '0', 'a'))
      ..add(Diode.silicon('D4', '0', 'b'))
      ..add(Resistor('RL', 'p', '0', 1e3));
    final bo = [for (final s in br.transient(duration: 0.04, dt: 2e-5)) s.v('p')];
    expect(bo.reduce(math.max), closeTo(vm - 1.4, 0.3));
    // Both half-cycles come through: the output is up in each 10 ms half.
    expect(bo.sublist(200, 300).reduce(math.max), greaterThan(7));
    expect(bo.sublist(700, 800).reduce(math.max), greaterThan(7));
  });

  test('555 astable: f = 1.44 / ((R1 + 2R2)·C)', () {
    const r1 = 1e3, r2 = 10e3, cap = 10e-6;
    final c = Circuit()
      ..add(VSource('Vcc', 'vcc', '0', 9))
      ..add(Resistor('R1', 'vcc', 'dis', r1))
      ..add(Resistor('R2', 'dis', 'th', r2))
      ..add(Capacitor('C', 'th', '0', cap))
      ..add(Timer555('U', vcc: 'vcc', trig: 'th', dis: 'dis', out: 'out'))
      ..add(Resistor('RL', 'out', '0', 10e3));
    final s = c.transient(duration: 1.5, dt: 1e-4);
    final rises = <double>[];
    for (var k = 1; k < s.length; k++) {
      if (s[k - 1].v('out') < 4.5 && s[k].v('out') > 4.5) rises.add(s[k].time);
    }
    expect(rises.length, greaterThanOrEqualTo(4));
    final period = (rises.last - rises[1]) / (rises.length - 2);
    expect(1 / period, closeTo(1.44 / ((r1 + 2 * r2) * cap), 0.5));
  });
}
