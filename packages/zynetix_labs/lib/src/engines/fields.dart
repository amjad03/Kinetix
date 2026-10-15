import 'dart:math' as math;

/// Electrons in fields, the photoelectric effect, the Hall effect and
/// magnetic hysteresis, for the degree-level physics benches. SI units.
abstract final class Fields {
  static const e = 1.602176634e-19, me = 9.1093837e-31, mu0 = 4e-7 * math.pi, h = 6.62607015e-34, c = 2.99792458e8;

  /// e/m of the electron (C/kg).
  static double get eOverM => e / me;

  /// Field at the centre of a Helmholtz pair of [turns] per coil and radius
  /// [radius] carrying [amps]: B = (4/5)^(3/2) μ₀NI/R.
  static double helmholtz(double amps, int turns, double radius) => math.pow(0.8, 1.5) * mu0 * turns * amps / radius;

  /// Radius of the circle an electron accelerated through [volts] follows
  /// in a field [b]: r = √(2V m/e) / B.
  static double beamRadius(double volts, double b) => math.sqrt(2 * volts / eOverM) / b;

  /// Stopping potential (V) for light of [lambda] m on a surface of work
  /// function [phiEv] eV; zero when the light cannot eject electrons.
  static double stoppingPotential(double lambda, double phiEv) => math.max(0, h * c / (lambda * e) - phiEv);

  /// Photocurrent (A) at anode potential [v] (negative = retarding): zero
  /// beyond the stopping potential, saturating at [saturation] for positive
  /// potentials.
  static double photocurrent(double v, double stopping, double saturation) {
    if (stopping <= 0 || v <= -stopping) return 0;
    return saturation * (1 - math.exp(-(v + stopping) / 0.35));
  }

  /// Hall voltage across a slab of thickness [t] with carrier density [n]
  /// (m⁻³) and charge sign [sign]: V = IB/(nqt).
  static double hallVoltage(double amps, double b, double n, double t, {int sign = -1}) => sign * amps * b / (n * e * t);

  /// Magnetic flux density in a soft-iron ring on the rising (+1) or falling
  /// (−1) branch of a simple hysteresis model: B = μ₀(H + Ms tanh((H ∓ Hc)/a)).
  static double hysteresis(double hField, int branch, {double ms = 1.1e6, double hc = 80, double a = 120}) =>
      mu0 * (hField + ms * _tanh((hField - branch * hc) / a));

  static double _tanh(double x) {
    final e2 = math.exp(2 * x.clamp(-40, 40));
    return (e2 - 1) / (e2 + 1);
  }
}
