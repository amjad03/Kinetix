import 'dart:math' as math;

/// The minus sign used in everything the solver shows (U+2212, not a hyphen).
const minus = '−';

/// Input the solver cannot handle. [message] is written for a teacher or student.
class MathError implements Exception {
  MathError(this.message);
  final String message;
  @override
  String toString() => message;
}

/// An exact fraction n/d with d > 0, always in lowest terms.
class Rational implements Comparable<Rational> {
  Rational._(this.num, this.den);

  factory Rational(BigInt n, [BigInt? d]) {
    d ??= BigInt.one;
    if (d == BigInt.zero) throw MathError('Division by zero is not defined.');
    if (d.isNegative) {
      n = -n;
      d = -d;
    }
    final g = n.gcd(d);
    if (g > BigInt.one) {
      n = n ~/ g;
      d = d ~/ g;
    }
    return Rational._(n, d);
  }

  factory Rational.of(int n, [int d = 1]) => Rational(BigInt.from(n), BigInt.from(d));

  /// Parses "12", "2.5" or ".75" exactly.
  factory Rational.parse(String s) {
    final dot = s.indexOf('.');
    if (dot < 0) return Rational(BigInt.parse(s));
    final whole = s.substring(0, dot);
    final frac = s.substring(dot + 1);
    final digits = '${whole.isEmpty ? '0' : whole}$frac';
    return Rational(BigInt.parse(digits), BigInt.from(10).pow(frac.length));
  }

  static final zero = Rational.of(0);
  static final one = Rational.of(1);

  final BigInt num;
  final BigInt den;

  bool get isInteger => den == BigInt.one;
  bool get isZero => num == BigInt.zero;
  bool get isNegative => num.isNegative;
  bool get isOne => num == BigInt.one && den == BigInt.one;

  Rational operator +(Rational o) => Rational(num * o.den + o.num * den, den * o.den);
  Rational operator -(Rational o) => Rational(num * o.den - o.num * den, den * o.den);
  Rational operator *(Rational o) => Rational(num * o.num, den * o.den);
  Rational operator /(Rational o) {
    if (o.isZero) throw MathError('Division by zero is not defined.');
    return Rational(num * o.den, den * o.num);
  }

  Rational operator -() => Rational._(-num, den);
  Rational abs() => isNegative ? -this : this;

  Rational pow(int e) {
    if (e == 0) return one;
    if (e < 0) {
      if (isZero) throw MathError('Division by zero is not defined.');
      return Rational(den.pow(-e), num.pow(-e));
    }
    return Rational(num.pow(e), den.pow(e));
  }

  double toDouble() => num.isValidInt && den.isValidInt ? num.toInt() / den.toInt() : _bigDiv(num, den);

  static double _bigDiv(BigInt n, BigInt d) {
    // Scale down both to keep the ratio inside double range.
    final shift = math.max(0, math.max(n.bitLength, d.bitLength) - 60);
    return (n >> shift).toDouble() / (d >> shift).toDouble();
  }

  /// True when the decimal form terminates (denominator is 2^a·5^b), e.g. 3/8 = 0.375.
  bool get terminates {
    var d = den;
    for (final p in [BigInt.two, BigInt.from(5)]) {
      while (d % p == BigInt.zero) {
        d = d ~/ p;
      }
    }
    return d == BigInt.one;
  }

  /// The exact decimal form, when it terminates in at most [maxDigits] places.
  String? exactDecimal({int maxDigits = 10}) {
    if (!terminates) return null;
    for (var k = 0; k <= maxDigits; k++) {
      final scale = BigInt.from(10).pow(k);
      if ((scale % den) == BigInt.zero) {
        final scaled = (num.abs() * (scale ~/ den)).toString().padLeft(k + 1, '0');
        final whole = scaled.substring(0, scaled.length - k);
        final frac = scaled.substring(scaled.length - k);
        return '${isNegative ? minus : ''}$whole${k == 0 ? '' : '.$frac'}';
      }
    }
    return null;
  }

  @override
  int compareTo(Rational o) => (num * o.den).compareTo(o.num * den);

  bool operator <(Rational o) => compareTo(o) < 0;
  bool operator >(Rational o) => compareTo(o) > 0;

  @override
  bool operator ==(Object other) => other is Rational && other.num == num && other.den == den;

  @override
  int get hashCode => Object.hash(num, den);

  /// "7/2", "−3", "0".
  @override
  String toString() {
    final s = isInteger ? num.abs().toString() : '${num.abs()}/$den';
    return isNegative ? '$minus$s' : s;
  }
}

/// A number the solver works with: an exact fraction when possible, otherwise a decimal.
class Num {
  Num.exact(Rational r) : exact = r, _approx = 0;

  Num.approx(double v) : exact = null, _approx = v {
    if (v.isNaN || v.isInfinite) throw MathError('The answer is too large or not defined.');
  }

  Num.of(int n, [int d = 1]) : this.exact(Rational.of(n, d));

  final Rational? exact;
  final double _approx;

  bool get isExact => exact != null;
  double get value => exact?.toDouble() ?? _approx;

  bool get isZero => exact?.isZero ?? _approx.abs() < 1e-12;
  bool get isNegative => exact?.isNegative ?? _approx < -1e-12;
  bool get isOne => exact?.isOne ?? (_approx - 1).abs() < 1e-12;
  bool get isInteger => exact?.isInteger ?? false;

  Num operator +(Num o) => _both(o) ? Num.exact(exact! + o.exact!) : Num.approx(value + o.value);
  Num operator -(Num o) => _both(o) ? Num.exact(exact! - o.exact!) : Num.approx(value - o.value);
  Num operator *(Num o) => _both(o) ? Num.exact(exact! * o.exact!) : Num.approx(value * o.value);
  Num operator /(Num o) {
    if (o.isZero) throw MathError('Division by zero is not defined.');
    return _both(o) ? Num.exact(exact! / o.exact!) : Num.approx(value / o.value);
  }

  Num operator -() => isExact ? Num.exact(-exact!) : Num.approx(-_approx);
  Num abs() => isNegative ? -this : this;

  bool _both(Num o) => isExact && o.isExact;

  /// Equal within rounding for decimals.
  bool sameAs(Num o) => _both(o) ? exact == o.exact : (value - o.value).abs() <= 1e-9 * math.max(1, value.abs());
}

/// Integer k-th root of [n] (n ≥ 0) if it is exact.
BigInt? exactRoot(BigInt n, int k) {
  if (n.isNegative) return null;
  if (n < BigInt.two) return n;
  final guess = math.pow(n.toDouble(), 1 / k).round();
  for (final g in [guess - 1, guess, guess + 1]) {
    if (g < 0) continue;
    final b = BigInt.from(g);
    if (b.pow(k) == n) return b;
  }
  return null;
}

/// Writes √n as k√m with m square-free, e.g. 12 → (2, 3). Null when n is too large to factor.
({BigInt k, BigInt m})? simplifySurd(BigInt n) {
  if (n.isNegative || n.bitLength > 48) return null;
  var k = BigInt.one;
  var m = n;
  for (var f = BigInt.two; f * f <= m; f += BigInt.one) {
    final sq = f * f;
    while (m % sq == BigInt.zero) {
      m = m ~/ sq;
      k *= f;
    }
  }
  return (k: k, m: m);
}

/// Shows numbers the way a teacher writes them on the board.
class NumberFormat {
  const NumberFormat({this.preferDecimal = false});

  /// When the input used decimals, show terminating fractions as decimals (0.3 rather than 3/10).
  final bool preferDecimal;

  String num(Num n) {
    final r = n.exact;
    if (r == null) return decimal(n.value);
    if (preferDecimal && !r.isInteger) {
      final d = r.exactDecimal();
      if (d != null) return d;
    }
    return r.toString();
  }

  /// True when [n] is shown as a fraction (so it needs brackets next to × or ^).
  bool showsAsFraction(Num n) => num(n).contains('/');

  /// Up to 6 decimal places, trailing zeros removed.
  static String decimal(double v) {
    if (v.abs() < 5e-13) return '0';
    final a = v.abs();
    String s;
    if (a >= 1e12 || a < 1e-6) {
      final e = a.toStringAsExponential(5).split('e');
      final mant = _trim(e[0]);
      final exp = int.parse(e[1]);
      s = '$mant × 10${superscript(exp)}';
    } else {
      s = _trim(a.toStringAsFixed(6));
    }
    if (s == '0') return '0';
    return v < 0 ? '$minus$s' : s;
  }

  static String _trim(String s) => s.contains('.') ? s.replaceFirst(RegExp(r'0+$'), '').replaceFirst(RegExp(r'\.$'), '') : s;

  /// A shortened decimal for a value that is exact, e.g. 1/3 → "0.333333".
  String approx(Num n) => decimal(n.value);
}

const _sup = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];

/// 12 → "¹²", −3 → "⁻³".
String superscript(int n) => '${n < 0 ? '⁻' : ''}${n.abs().toString().split('').map((d) => _sup[int.parse(d)]).join()}';
