import 'dart:math' as math;

import 'numbers.dart';
import 'parser.dart';

/// a ^ b, exact where the answer is a fraction (2³, 4^(1/2), 8^(−1/3)), otherwise a decimal.
Num power(Num a, Num b) {
  final ra = a.exact, rb = b.exact;
  if (ra != null && rb != null) {
    if (ra.isZero && (rb.isNegative || rb.isZero)) {
      throw MathError(rb.isZero ? '0⁰ is not defined.' : 'Division by zero is not defined.');
    }
    if (rb.isInteger && rb.num.abs() <= BigInt.from(1000)) {
      final e = rb.num.toInt();
      final bits = math.max(ra.num.bitLength, ra.den.bitLength) * e.abs();
      if (bits <= 4000) return Num.exact(ra.pow(e));
    }
    if (!rb.isInteger && rb.den <= BigInt.from(12)) {
      final q = rb.den.toInt();
      final neg = ra.isNegative;
      if (!neg || q.isOdd) {
        final n = exactRoot(ra.num.abs(), q), d = exactRoot(ra.den, q);
        if (n != null && d != null) {
          return power(Num.exact(Rational(neg ? -n : n, d)), Num.exact(Rational(rb.num)));
        }
      }
    }
  }
  if (a.value < 0 && !(b.isInteger)) {
    final r = b.exact;
    // An odd root of a negative number is real: (−8)^(1/3) = −2.
    if (r != null && r.den.isOdd) {
      final v = math.pow(-a.value, b.value).toDouble();
      return Num.approx(r.num.isOdd ? -v : v);
    }
    throw MathError('A negative number to a fractional power is not a real number.');
  }
  return Num.approx(math.pow(a.value, b.value).toDouble());
}

/// Sine/cosine/tangent of whole multiples of 30° and 45° that are fractions.
const _exactSin = {0: 0, 30: 1, 90: 2, 150: 1, 180: 0, 210: -1, 270: -2, 330: -1}; // in halves
const _exactCos = {0: 2, 60: 1, 90: 0, 120: -1, 180: -2, 240: -1, 270: 0, 300: 1};
const _exactTan = {0: 0, 45: 1, 135: -1, 180: 0, 225: 1, 315: -1};

/// Applies a function. Angles are in degrees, as in Indian school maths.
Num applyFunc(String name, Num x) {
  final r = x.exact;
  switch (name) {
    case 'sqrt':
      if (x.isNegative) throw MathError('The square root of a negative number is not a real number.');
      if (r != null) {
        final n = exactRoot(r.num, 2), d = exactRoot(r.den, 2);
        if (n != null && d != null) return Num.exact(Rational(n, d));
      }
      return Num.approx(math.sqrt(x.value));
    case 'abs':
      return x.abs();
    case 'sin' || 'cos' || 'tan':
      if (r != null && r.isInteger) {
        final deg = (r.num % BigInt.from(360)).toInt();
        if (name == 'tan' && (deg == 90 || deg == 270)) throw MathError('tan $deg° is not defined.');
        final table = name == 'sin' ? _exactSin : (name == 'cos' ? _exactCos : _exactTan);
        final v = table[deg];
        if (v != null) return Num.exact(name == 'tan' ? Rational.of(v) : Rational.of(v, 2));
      }
      final rad = x.value * math.pi / 180;
      final v = switch (name) {
        'sin' => math.sin(rad),
        'cos' => math.cos(rad),
        _ => math.tan(rad),
      };
      if (name == 'tan' && math.cos(rad).abs() < 1e-12) throw MathError('tan ${NumberFormat.decimal(x.value)}° is not defined.');
      return Num.approx(v.abs() < 1e-13 ? 0 : v);
    case 'log':
      if (x.isNegative || x.isZero) throw MathError('log is only defined for positive numbers.');
      if (r != null) {
        // log 1000 = 3, log 0.01 = −2.
        for (final (n, d, sign) in [(r.num, r.den, 1), (r.den, r.num, -1)]) {
          if (n == BigInt.one) continue;
          if (d != BigInt.one) continue;
          var k = 0;
          var m = n;
          while (m > BigInt.one && m % BigInt.from(10) == BigInt.zero) {
            m = m ~/ BigInt.from(10);
            k++;
          }
          if (m == BigInt.one) return Num.of(sign * k);
        }
        if (r.isOne) return Num.of(0);
      }
      return Num.approx(math.log(x.value) / math.ln10);
    case 'ln':
      if (x.isNegative || x.isZero) throw MathError('ln is only defined for positive numbers.');
      if (r != null && r.isOne) return Num.of(0);
      return Num.approx(math.log(x.value));
  }
  throw MathError('Unknown function $name.');
}

Num binary(String op, Num a, Num b) => switch (op) {
  '+' => a + b,
  '-' => a - b,
  '*' => a * b,
  '/' => b.isZero ? throw MathError('Division by zero is not defined.') : a / b,
  _ => power(a, b),
};

/// Evaluates [n] in one go. [vars] gives values for unknowns.
Num evaluate(Node n, [Map<String, Num> vars = const {}]) => switch (n) {
  NumLit(:final value) => value,
  Const(:final value) => Num.approx(value),
  Var(:final name) => vars[name] ?? (throw MathError('“$name” has no value.')),
  Neg(:final arg) => -evaluate(arg, vars),
  Func(:final name, :final arg) => applyFunc(name, evaluate(arg, vars)),
  Bin(:final op, :final left, :final right) => binary(op, evaluate(left, vars), evaluate(right, vars)),
};

/// Replaces each unknown with a number, e.g. for checking a solution.
Node substitute(Node n, String v, Num value) => switch (n) {
  Var(:final name) when name == v => NumLit(value, paren: n.paren),
  NumLit() || Const() || Var() => n,
  Neg(:final arg) => Neg(substitute(arg, v, value), paren: n.paren),
  Func(:final name, :final arg) => Func(name, substitute(arg, v, value), paren: n.paren),
  Bin(:final left, :final right) => n.withChildren(substitute(left, v, value), substitute(right, v, value)),
};
