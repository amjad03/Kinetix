import 'dart:math' as math;
import 'dart:ui' show Color;

/// An acid in the flask: concentration (mol/L), volume (mL), its acid
/// dissociation constants (empty for a strong monoprotic acid) and the
/// number of protons each molecule gives up.
class Acid {
  final String name;
  final double molar, ml;
  final List<double> ka;
  final int protons;
  const Acid(this.name, this.molar, this.ml, {this.ka = const [], this.protons = 1});

  bool get strong => ka.isEmpty;
}

/// Acid–base and other solution chemistry for the chemistry benches, at
/// 25 °C. Concentrations in mol/L, volumes in mL.
abstract final class Chem {
  static const kw = 1e-14;

  /// pH of [acid] after adding [vBase] mL of a strong monobasic base of
  /// concentration [cBase] (NaOH), from the exact charge balance
  /// [H⁺] + [Na⁺] = [OH⁻] + Σ n[Aⁿ⁻], solved by bisection on log [H⁺].
  static double ph(Acid acid, double cBase, double vBase) {
    final total = (acid.ml + vBase) / 1000;
    final ca = acid.molar * acid.ml / 1000 / total;
    final na = cBase * vBase / 1000 / total;
    double balance(double h) {
      double anions;
      if (acid.strong) {
        anions = acid.protons * ca;
      } else {
        // Fractions of each deprotonated form (polyprotic).
        final terms = <double>[1];
        var prod = 1.0;
        for (final k in acid.ka) {
          prod *= k;
          terms.add(prod / math.pow(h, terms.length));
        }
        final sum = terms.reduce((a, b) => a + b);
        anions = 0;
        for (var n = 1; n < terms.length; n++) {
          anions += n * ca * terms[n] / sum;
        }
      }
      return h + na - kw / h - anions;
    }

    var lo = -14.5, hi = 1.0; // log10 [H⁺]
    for (var k = 0; k < 100; k++) {
      final mid = (lo + hi) / 2;
      if (balance(math.pow(10, mid).toDouble()) > 0) {
        hi = mid;
      } else {
        lo = mid;
      }
    }
    return -(lo + hi) / 2;
  }

  /// Volume of base (mL) that exactly neutralises [acid].
  static double equivalence(Acid acid, double cBase) => acid.molar * acid.ml * acid.protons / cBase;

  // ------------------------------------------------------------ indicators

  /// The colour of an indicator at [ph], and its name for the colour.
  static (Color, String) indicator(String which, double ph) {
    Color mix(Color a, Color b, double t) => Color.lerp(a, b, t.clamp(0.0, 1.0))!;
    switch (which) {
      case 'phenolphthalein':
        if (ph < 8.2) return (const Color(0x22FFFFFF), 'colourless');
        final t = (ph - 8.2) / 1.8;
        return (mix(const Color(0xFFFFD6EC), const Color(0xFFD5168E), t), t < 0.45 ? 'light pink' : 'pink');
      case 'methyl-orange':
        if (ph < 3.1) return (const Color(0xFFE53935), 'red');
        if (ph > 4.4) return (const Color(0xFFFFC107), 'yellow');
        return (mix(const Color(0xFFE53935), const Color(0xFFFFC107), (ph - 3.1) / 1.3), 'orange');
      default: // universal indicator
        return (universal(ph), universalName(ph));
    }
  }

  /// Universal indicator colours from red (pH 1) through green (7) to violet (14).
  static Color universal(double ph) {
    const stops = [
      Color(0xFFD32F2F), Color(0xFFE64A19), Color(0xFFF57C00), Color(0xFFFFA000), Color(0xFFFBC02D), Color(0xFFFFEB3B), Color(0xFFC0CA33), //
      Color(0xFF43A047), Color(0xFF00897B), Color(0xFF1E88E5), Color(0xFF3949AB), Color(0xFF5E35B1), Color(0xFF7B1FA2), Color(0xFF6A1B9A),
    ];
    final x = (ph.clamp(1.0, 14.0) - 1);
    final i = x.floor().clamp(0, stops.length - 2);
    return Color.lerp(stops[i], stops[i + 1], x - i)!;
  }

  static String universalName(double ph) => ph < 3
      ? 'red'
      : ph < 5
          ? 'orange'
          : ph < 6.5
              ? 'yellow'
              : ph < 7.5
                  ? 'green'
                  : ph < 10
                      ? 'blue'
                      : 'violet';

  // ------------------------------------------------------- conductometry

  /// Limiting molar ionic conductivities (S cm² mol⁻¹) at 25 °C.
  static const lambda = {'H': 349.8, 'OH': 198.0, 'Na': 50.1, 'Cl': 76.3, 'Ac': 40.9};

  /// Conductance (mS, for a cell constant of 1 cm⁻¹) of an acid titrated
  /// with NaOH: κ = Σ λc for the ions present, with dilution. [weak] acid is
  /// acetic acid (Ka 1.8 × 10⁻⁵).
  static double conductance(double cAcid, double vAcid, double cBase, double vBase, {bool weak = false}) {
    final total = vAcid + vBase;
    final acid = Acid(weak ? 'acetic' : 'HCl', cAcid, vAcid, ka: weak ? const [1.8e-5] : const []);
    final h = math.pow(10, -ph(acid, cBase, vBase)).toDouble();
    final oh = kw / h;
    final na = cBase * vBase / total;
    final ca = cAcid * vAcid / total;
    final anion = weak ? ca * 1.8e-5 / (1.8e-5 + h) : ca;
    final kappa = (lambda['H']! * h + lambda['OH']! * oh + lambda['Na']! * na + lambda[weak ? 'Ac' : 'Cl']! * anion) / 1000; // S/cm
    return kappa * 1000;
  }

  // ------------------------------------------------------------- kinetics

  /// First-order progress: fraction left after [t] with rate constant [k].
  static double firstOrderLeft(double k, double t) => math.exp(-k * t);

  /// Arrhenius: the rate constant at [celsius] given [k25] at 25 °C and an
  /// activation energy [ea] J/mol.
  static double arrhenius(double k25, double celsius, {double ea = 50e3}) => k25 * math.exp(-ea / 8.314 * (1 / (celsius + 273.15) - 1 / 298.15));

  // ------------------------------------------------------------- photometry

  /// Absorbance A = εlc, and the transmittance it means.
  static double absorbance(double epsilon, double pathCm, double molar) => epsilon * pathCm * molar;
  static double transmittance(double a) => math.pow(10, -a).toDouble();

  // ----------------------------------------------------------- thermometry

  /// Temperature rise of a neutralisation: [moles] of water formed with
  /// enthalpy [dh] (J/mol, positive number) heating [massG] g of solution
  /// (c = 4.18 J/g K) and a calorimeter of [calJK].
  static double neutralisationRise(double moles, double massG, {double dh = 57.1e3, double calJK = 0}) => moles * dh / (massG * 4.18 + calJK);
}

/// Paper and thin-layer chromatography: the solvent front rises as √t and
/// each substance travels a fixed fraction of it (its Rf).
abstract final class Chromatography {
  /// Height of the solvent front (cm) after [minutes] on a strip [length] cm
  /// long that the front would climb in [fullMinutes].
  static double front(double minutes, {double length = 12, double fullMinutes = 30}) => length * math.sqrt((minutes / fullMinutes).clamp(0.0, 1.0));

  /// Spot position and its spread (cm) for a substance of [rf].
  static (double centre, double spread) spot(double rf, double front) => (rf * front, 0.25 + 0.05 * front);
}
