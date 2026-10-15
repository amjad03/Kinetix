import 'dart:math' as math;

/// Mechanics, heat and sound for the benches, in SI units unless a name says
/// otherwise. Pure functions: every bench reading is computed from these.
abstract final class Mechanics {
  static const g = 9.80665;

  // ------------------------------------------------------------ projectile

  /// A projectile launched at [speed] m/s, [angleDeg] above the horizontal,
  /// from [height] m: time of flight, range and greatest height (no air).
  static ({double time, double range, double maxHeight}) projectile(double speed, double angleDeg, {double height = 0, double gravity = g}) {
    final a = angleDeg * math.pi / 180;
    final vx = speed * math.cos(a), vy = speed * math.sin(a);
    final t = (vy + math.sqrt(vy * vy + 2 * gravity * height)) / gravity;
    return (time: t, range: vx * t, maxHeight: height + vy * vy / (2 * gravity));
  }

  /// Position at time [t] of the same projectile.
  static (double x, double y) projectileAt(double speed, double angleDeg, double t, {double height = 0, double gravity = g}) {
    final a = angleDeg * math.pi / 180;
    return (speed * math.cos(a) * t, height + speed * math.sin(a) * t - gravity * t * t / 2);
  }

  /// Fall of a horizontally fired bullet over [distance] m at [speed] m/s.
  static double bulletDrop(double distance, double speed, {double gravity = g}) => gravity * distance * distance / (2 * speed * speed);

  // ---------------------------------------------------------------- springs

  /// Extension (m) of a spring of constant [k] N/m under [massKg].
  static double springExtension(double massKg, double k) => massKg * g / k;

  /// Period of a mass on a spring, with a third of the spring's own mass.
  static double springPeriod(double massKg, double k, {double springMass = 0}) => 2 * math.pi * math.sqrt((massKg + springMass / 3) / k);

  /// Period of a simple pendulum for small swings.
  static double pendulumPeriod(double length, {double gravity = g}) => 2 * math.pi * math.sqrt(length / gravity);

  // -------------------------------------------------------- friction, slopes

  /// Component of a weight down a smooth incline.
  static double downSlope(double massKg, double angleDeg) => massKg * g * math.sin(angleDeg * math.pi / 180);

  /// Limiting friction F = μN.
  static double limitingFriction(double mu, double normal) => mu * normal;

  // ------------------------------------------------------------- collisions

  /// Velocities after a head-on collision with coefficient of restitution [e]
  /// (1 elastic, 0 perfectly inelastic).
  static (double v1, double v2) collide(double m1, double u1, double m2, double u2, {double e = 1}) {
    final p = m1 * u1 + m2 * u2, m = m1 + m2;
    return ((p + m2 * e * (u2 - u1)) / m, (p + m1 * e * (u1 - u2)) / m);
  }

  // ------------------------------------------------------------- elasticity

  /// Extension (m) of a wire of length [length], diameter [diameter] (m) and
  /// Young's modulus [y] (Pa) under a load of [massKg]: ΔL = FL/(AY).
  static double wireExtension(double massKg, double length, double diameter, double y) => massKg * g * length / (math.pi * diameter * diameter / 4 * y);

  // ---------------------------------------------------------------- fluids

  /// Terminal velocity of a sphere of radius [r] and density [rho] in a
  /// liquid of density [sigma] and viscosity [eta] (Stokes' law).
  static double terminalVelocity(double r, double rho, double sigma, double eta) => 2 * r * r * (rho - sigma) * g / (9 * eta);

  /// Rise of a liquid in a capillary of radius [r]: h = 2T cos θ / (rρg).
  static double capillaryRise(double r, double tension, double rho, {double contactDeg = 0}) => 2 * tension * math.cos(contactDeg * math.pi / 180) / (r * rho * g);

  // ------------------------------------------------------------------ heat

  /// Newton's law of cooling: temperature after [t] s from [t0] towards the
  /// surroundings [ts] with rate constant [k] (1/s).
  static double cooling(double t0, double ts, double k, double t) => ts + (t0 - ts) * math.exp(-k * t);

  /// Final temperature of a method-of-mixtures: hot mass and cold mass with
  /// specific heats, and a calorimeter of water equivalent [calJK] (J/K)
  /// starting with the cold part.
  static double mixture({required double m1, required double c1, required double t1, required double m2, required double c2, required double t2, double calJK = 0}) =>
      (m1 * c1 * t1 + (m2 * c2 + calJK) * t2) / (m1 * c1 + m2 * c2 + calJK);

  // ----------------------------------------------------------------- sound

  /// Speed of sound in air at [celsius].
  static double soundSpeed(double celsius) => 331.3 * math.sqrt(1 + celsius / 273.15);

  /// Resonant air-column lengths (m) of a tube closed at one end for a fork
  /// of [hz]: L = (2n − 1)λ/4 − e, e = 0.3 × diameter.
  static double closedPipeLength(int n, double hz, double celsius, double diameter) => (2 * n - 1) * soundSpeed(celsius) / hz / 4 - 0.3 * diameter;

  /// Frequency of a stretched string: f = (1/2L)√(T/μ).
  static double stringFrequency(double length, double tension, double massPerLength) => math.sqrt(tension / massPerLength) / (2 * length);
}
