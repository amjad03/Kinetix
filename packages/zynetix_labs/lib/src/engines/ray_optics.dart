import 'dart:math' as math;

/// Geometrical and wave optics for the optics benches. Distances in the
/// unit the caller chooses (cm on an optical bench), angles in degrees
/// unless named otherwise, wavelengths in metres.
///
/// Thin lenses use the New Cartesian sign convention: 1/v − 1/u = 1/f, a
/// real object has u < 0 and a converging lens f > 0. Mirrors use distances
/// measured in front of the mirror as positive (1/v + 1/u = 1/f, f > 0 for
/// a concave mirror), the way an optical bench is read.
abstract final class RayOptics {
  static double rad(double deg) => deg * math.pi / 180;
  static double deg(double rad) => rad * 180 / math.pi;

  /// Thin lens, Cartesian: 1/v − 1/u = 1/f. [u] is signed (negative for a
  /// real object), [f] positive for a converging lens. Null when the image is
  /// at infinity.
  static double? lensImage(double u, double f) {
    final d = 1 / f + 1 / u;
    return d.abs() < 1e-12 ? null : 1 / d;
  }

  /// Two thin lenses in contact: 1/F = 1/f₁ + 1/f₂.
  static double combined(double f1, double f2) => 1 / (1 / f1 + 1 / f2);

  /// Spherical mirror with the object at distance [u] in front (positive
  /// magnitude) and focal length [f] (positive for concave, negative for
  /// convex). Returns the image distance in front of the mirror (positive:
  /// real, in front; negative: virtual, behind). Null at infinity.
  static double? mirrorImage(double u, double f) {
    final d = 1 / f - 1 / u;
    return d.abs() < 1e-12 ? null : 1 / d;
  }

  /// Snell's law: the angle of refraction (degrees) going from index [n1]
  /// to [n2], or null for total internal reflection.
  static double? refract(double iDeg, double n1, double n2) {
    final s = n1 / n2 * math.sin(rad(iDeg));
    return s.abs() > 1 ? null : deg(math.asin(s));
  }

  /// Critical angle (degrees) from a denser medium [n] into air.
  static double criticalAngle(double n) => deg(math.asin(1 / n));

  /// The path through a prism of angle [a] (degrees) and index [n] at
  /// incidence [i]: r₁, r₂, emergence e and deviation δ = i + e − A. Null when
  /// the ray cannot leave the second face.
  static ({double r1, double r2, double e, double d})? prism(double i, double a, double n) {
    final r1 = refract(i, 1, n);
    if (r1 == null) return null;
    final r2 = a - r1;
    final e = refract(r2, n, 1);
    if (e == null) return null;
    return (r1: r1, r2: r2, e: e, d: i + e - a);
  }

  /// Minimum deviation of a prism: δm = 2 asin(n sin(A/2)) − A.
  static double minDeviation(double a, double n) => 2 * deg(math.asin(n * math.sin(rad(a / 2)))) - a;

  /// Refractive index from the prism angle and minimum deviation.
  static double prismIndex(double a, double dm) => math.sin(rad((a + dm) / 2)) / math.sin(rad(a / 2));

  /// Sideways shift of a ray through a parallel slab of thickness [t].
  static double slabShift(double i, double n, double t) {
    final r = refract(i, 1, n)!;
    return t * math.sin(rad(i - r)) / math.cos(rad(r));
  }

  /// Apparent depth of something at real depth [t] under a medium of index
  /// [n], seen from straight above.
  static double apparentDepth(double t, double n) => t / n;

  /// Grating: the diffraction angle (degrees) of order [order] for a
  /// grating of [linesPerMm] and wavelength [lambda] (m); null if the order
  /// does not exist.
  static double? gratingAngle(int order, double lambda, double linesPerMm) {
    final d = 1e-3 / linesPerMm;
    final s = order * lambda / d;
    return s.abs() > 1 ? null : deg(math.asin(s));
  }

  /// Wavelength from a grating angle: λ = d sin θ / n.
  static double gratingWavelength(double thetaDeg, int order, double linesPerMm) => (1e-3 / linesPerMm) * math.sin(rad(thetaDeg)) / order;

  /// Newton's rings in reflected light: radius (m) of the [n]th dark ring
  /// for a lens of radius of curvature [r] (m): rₙ = √(nλR).
  static double newtonDarkRadius(int n, double lambda, double r) => math.sqrt(n * lambda * r);

  /// Intensity (0–1) of reflected light at radius [x] (m) under Newton's
  /// rings: dark at the centre, I ∝ sin²(π x²/(λR)).
  static double newtonIntensity(double x, double lambda, double r) => math.pow(math.sin(math.pi * x * x / (lambda * r)), 2).toDouble();

  /// Cauchy's formula for a crown glass: n(λ) = A + B/λ², λ in nm.
  static double cauchy(double nm, {double a = 1.5046, double b = 4200}) => a + b / (nm * nm);
}
