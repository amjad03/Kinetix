import 'dart:math' as math;

/// A small, repeatable "noise" for a reading: the same settings always give
/// the same scatter (so a lab can be repeated and tested), different settings
/// give different scatter. Returns a value in −1…1.
double labNoise(String key) {
  var h = 0x811C9DC5;
  for (final c in key.codeUnits) {
    h = ((h ^ c) * 0x01000193) & 0xFFFFFFFF;
  }
  // A second mix so neighbouring keys do not give neighbouring values.
  h ^= h >> 15;
  h = (h * 0x2C1B3C6D) & 0xFFFFFFFF;
  h ^= h >> 12;
  return (h % 20001) / 10000 - 1;
}

/// Mendelian crosses: gametes, expected ratios, sampled offspring and the
/// chi-square test.
abstract final class Genetics {
  /// The gametes of a genotype such as `AaBb` (one allele from each pair),
  /// each with its probability.
  static Map<String, double> gametes(String genotype) {
    var out = <String, double>{'': 1};
    for (var i = 0; i + 1 < genotype.length; i += 2) {
      final next = <String, double>{};
      for (final g in out.entries) {
        for (final a in [genotype[i], genotype[i + 1]]) {
          next.update(g.key + a, (v) => v + g.value * 0.5, ifAbsent: () => g.value * 0.5);
        }
      }
      out = next;
    }
    return out;
  }

  /// The phenotype of a genotype, one letter per gene: upper case when the
  /// dominant allele is present (`AaBb` → `AB`, `aaBb` → `aB`).
  static String phenotype(String genotype) {
    final b = StringBuffer();
    for (var i = 0; i + 1 < genotype.length; i += 2) {
      final dom = genotype[i].toUpperCase();
      b.write(genotype[i] == dom || genotype[i + 1] == dom ? dom : dom.toLowerCase());
    }
    return b.toString();
  }

  /// Joins two gametes into a genotype, writing each pair dominant first.
  static String zygote(String a, String b) {
    final s = StringBuffer();
    for (var i = 0; i < a.length; i++) {
      final x = a[i], y = b[i];
      s.write(x.compareTo(y) <= 0 ? '$x$y' : '$y$x');
    }
    return s.toString();
  }

  /// Expected phenotype proportions of a cross (Punnett square).
  static Map<String, double> expected(String p1, String p2) {
    final out = <String, double>{};
    for (final a in gametes(p1).entries) {
      for (final b in gametes(p2).entries) {
        out.update(phenotype(zygote(a.key, b.key)), (v) => v + a.value * b.value, ifAbsent: () => a.value * b.value);
      }
    }
    return Map.fromEntries(out.entries.toList()..sort((x, y) => y.value.compareTo(x.value) != 0 ? y.value.compareTo(x.value) : x.key.compareTo(y.key)));
  }

  /// [n] offspring of a cross, sampled with a fixed [seed]: counts by phenotype.
  static Map<String, int> sample(String p1, String p2, int n, int seed) {
    final rnd = math.Random(seed);
    final g1 = gametes(p1).keys.toList(), g2 = gametes(p2).keys.toList();
    final out = {for (final k in expected(p1, p2).keys) k: 0};
    for (var i = 0; i < n; i++) {
      // Every gamete of a genotype is equally likely (independent assortment).
      final z = zygote(g1[rnd.nextInt(g1.length)], g2[rnd.nextInt(g2.length)]);
      out[phenotype(z)] = out[phenotype(z)]! + 1;
    }
    return out;
  }

  /// Chi-square of observed counts against expected proportions.
  static double chiSquare(Map<String, int> observed, Map<String, double> expected) {
    final n = observed.values.fold<int>(0, (a, b) => a + b);
    var chi = 0.0;
    for (final e in expected.entries) {
      final want = e.value * n;
      if (want > 0) chi += math.pow((observed[e.key] ?? 0) - want, 2) / want;
    }
    return chi;
  }

  /// Critical chi-square at the 5 % level for 1–6 degrees of freedom.
  static const chi05 = [3.841, 5.991, 7.815, 9.488, 11.070, 12.592];
}

/// Population genetics: Hardy–Weinberg proportions and random drift.
abstract final class Population {
  /// Frequency p of allele A from genotype counts.
  static double p(int aa, int ab, int bb) => (2 * aa + ab) / (2 * (aa + ab + bb));

  /// Expected AA, Aa, aa counts at equilibrium.
  static (double, double, double) expected(int aa, int ab, int bb) {
    final n = aa + ab + bb;
    final f = p(aa, ab, bb), q = 1 - f;
    return (f * f * n, 2 * f * q * n, q * q * n);
  }

  /// Chi-square against Hardy–Weinberg (one degree of freedom).
  static double chiSquare(int aa, int ab, int bb) {
    final (e1, e2, e3) = expected(aa, ab, bb);
    double t(int o, double e) => e == 0 ? 0 : math.pow(o - e, 2) / e;
    return t(aa, e1) + t(ab, e2) + t(bb, e3);
  }

  /// Genotype counts of [n] individuals drawn from a population whose
  /// genotype frequencies are AA, Aa, aa = [f] (fixed [seed]).
  static (int, int, int) draw(int n, (double, double, double) f, int seed) {
    final rnd = math.Random(seed);
    var a = 0, b = 0, c = 0;
    for (var i = 0; i < n; i++) {
      final x = rnd.nextDouble();
      if (x < f.$1) {
        a++;
      } else if (x < f.$1 + f.$2) {
        b++;
      } else {
        c++;
      }
    }
    return (a, b, c);
  }

  /// Wright–Fisher drift: the frequency of A in each generation of a
  /// population of [n] diploid individuals, with optional selection [s]
  /// against aa (fitness of aa = 1 − s).
  static List<double> drift(double p0, int n, int generations, int seed, {double s = 0}) {
    final rnd = math.Random(seed);
    final out = [p0];
    var p = p0;
    for (var g = 0; g < generations; g++) {
      final q = 1 - p;
      // Selection, then sampling 2N gene copies.
      final wbar = 1 - s * q * q;
      final ps = (p * p + p * q) / wbar;
      var k = 0;
      for (var i = 0; i < 2 * n; i++) {
        if (rnd.nextDouble() < ps) k++;
      }
      p = k / (2 * n);
      out.add(p);
    }
    return out;
  }
}

/// Enzymes: Michaelis–Menten kinetics with temperature and pH optima.
abstract final class Enzyme {
  static double rate(double s, double vmax, double km) => vmax * s / (km + s);

  /// Competitive inhibition raises the apparent Km; non-competitive lowers Vmax.
  static double inhibited(double s, double vmax, double km, String inhibitor, {double i = 1, double ki = 1}) => switch (inhibitor) {
        'competitive' => rate(s, vmax, km * (1 + i / ki)),
        'non-competitive' => rate(s, vmax / (1 + i / ki), km),
        _ => rate(s, vmax, km),
      };

  /// Relative activity with temperature: doubling every 10 °C (Q₁₀ = 2) until
  /// the enzyme starts to denature above about [denature] °C. Peaks near 37–40 °C.
  static double temperature(double c, {double denature = 45}) {
    final q10 = math.pow(2, (c - 37) / 10).toDouble();
    return q10 / (1 + math.exp((c - denature) / 3));
  }

  /// Relative activity with pH: a bell around the optimum.
  static double ph(double ph, {double optimum = 6.8, double width = 1.3}) => math.exp(-math.pow((ph - optimum) / width, 2));
}

/// Microbial growth in a batch culture: lag, exponential and stationary phases
/// (a logistic curve delayed by the lag).
abstract final class Growth {
  /// Optical density at [hours]: starting at [od0], growing at [mu] per hour
  /// after a lag of [lag] hours, levelling off at [odMax].
  static double od(double hours, {double od0 = 0.02, double mu = 0.9, double lag = 1.5, double odMax = 1.6}) {
    // A smooth lag: the effective growth time eases in over the lag.
    final te = hours <= 0 ? 0.0 : hours - lag * (1 - math.exp(-hours / lag));
    final e = math.exp(mu * te);
    return odMax * od0 * e / (odMax + od0 * (e - 1));
  }

  /// Specific growth rate with temperature for a mesophile (optimum 37 °C).
  static double mu(double celsius) {
    if (celsius <= 10 || celsius >= 47) return 0.02;
    return 0.95 * math.exp(-math.pow((celsius - 37) / 9, 2)) * (celsius > 37 ? 1 - (celsius - 37) / 12 : 1);
  }
}

/// DNA: gel electrophoresis and the polymerase chain reaction.
abstract final class Dna {
  /// Distance (mm) a fragment of [bp] base pairs travels: proportional to the
  /// run (volts × minutes) and falling with log(size); a denser gel slows the
  /// big fragments most.
  static double migration(double bp, {double agarose = 1.0, double volts = 100, double minutes = 45}) {
    final run = volts * minutes / 4500;
    final a = 122 - 8 * (agarose - 1), b = 30 + 9 * (agarose - 1);
    return math.max(0, run * (a - b * math.log(bp) / math.ln10));
  }

  /// Copies after each PCR cycle, starting from [n0] with efficiency [e]
  /// (1 = doubling) falling off as the primers and nucleotides run short near
  /// [nMax].
  static List<double> pcr(double n0, int cycles, {double e = 0.95, double nMax = 1e12}) {
    final out = [n0];
    var n = n0;
    for (var c = 0; c < cycles; c++) {
      n += n * e * (1 - n / nMax).clamp(0.0, 1.0);
      out.add(n);
    }
    return out;
  }

  /// The (fractional) cycle at which the copies first pass [threshold].
  static double? ct(double n0, {double e = 0.95, double threshold = 1e10, double nMax = 1e12, int cycles = 45}) {
    final c = pcr(n0, cycles, e: e, nMax: nMax);
    for (var i = 1; i < c.length; i++) {
      if (c[i] >= threshold) {
        final a = math.log(c[i - 1]), b = math.log(c[i]);
        return i - 1 + (math.log(threshold) - a) / (b - a);
      }
    }
    return null;
  }
}

/// Photosynthesis of a water plant: oxygen bubbles a minute, limited by light,
/// carbon dioxide and temperature.
abstract final class Photosynthesis {
  /// Light intensity (relative, 1 at 10 cm) from a lamp [cm] away (inverse square).
  static double light(double cm) => math.pow(10 / cm, 2).toDouble();

  /// Bubbles per minute.
  static double rate({required double cm, double bicarbonate = 1.0, double celsius = 25}) {
    final i = light(cm);
    final lightPart = i / (i + 0.25);
    final co2 = bicarbonate / (bicarbonate + 0.3);
    final t = Enzyme.temperature(celsius, denature: 40) / Enzyme.temperature(30, denature: 40);
    return math.max(0, 80 * lightPart * co2 * t - 2);
  }
}
