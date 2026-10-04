import 'evaluate.dart';
import 'numbers.dart';
import 'parser.dart';

/// A polynomial in one unknown: degree → coefficient, zero terms left out.
class Poly {
  Poly(Map<int, Num> terms) : terms = Map.unmodifiable({
    for (final e in terms.entries)
      if (!e.value.isZero) e.key: e.value,
  });

  Poly.constant(Num c) : this({0: c});

  final Map<int, Num> terms;

  int get degree => terms.isEmpty ? 0 : terms.keys.reduce((a, b) => a > b ? a : b);
  bool get isZero => terms.isEmpty;
  bool get isExact => terms.values.every((c) => c.isExact);

  Num operator [](int d) => terms[d] ?? Num.of(0);

  Poly operator +(Poly o) => Poly({
    for (final d in {...terms.keys, ...o.terms.keys}) d: this[d] + o[d],
  });

  Poly operator -(Poly o) => this + -o;
  Poly operator -() => Poly({for (final e in terms.entries) e.key: -e.value});

  Poly operator *(Poly o) {
    final out = <int, Num>{};
    for (final a in terms.entries) {
      for (final b in o.terms.entries) {
        out[a.key + b.key] = (out[a.key + b.key] ?? Num.of(0)) + a.value * b.value;
      }
    }
    return Poly(out);
  }

  Poly scale(Num k) => Poly({for (final e in terms.entries) e.key: e.value * k});

  /// Just the term of degree [d].
  Poly only(int d) => Poly({d: this[d]});

  /// "2x² − 5x + 3", "−x", "0".
  String show(String v, NumberFormat fmt) {
    if (terms.isEmpty) return '0';
    final degrees = terms.keys.toList()..sort((a, b) => b.compareTo(a));
    final buf = StringBuffer();
    for (final d in degrees) {
      final c = terms[d]!;
      final first = buf.isEmpty;
      if (first) {
        if (c.isNegative) buf.write(minus);
      } else {
        buf.write(c.isNegative ? ' $minus ' : ' + ');
      }
      buf.write(term(c.abs(), d, v, fmt));
    }
    return buf.toString();
  }

  /// One term with a non-negative coefficient: "x²", "3x", "(1/2)x", "7".
  static String term(Num c, int d, String v, NumberFormat fmt) {
    final power = d == 0 ? '' : (d == 1 ? v : '$v${superscript(d)}');
    if (d == 0) return fmt.num(c);
    if (c.isOne) return power;
    final n = fmt.num(c);
    return n.contains('/') ? '($n)$power' : '$n$power';
  }
}

/// Turns an expression in [v] into a polynomial. Throws [MathError] for things the solver
/// cannot treat as a polynomial (x in a denominator, √x, sin x …).
Poly toPoly(Node n, String v) {
  switch (n) {
    case NumLit(:final value):
      return Poly.constant(value);
    case Const(:final value):
      return Poly.constant(Num.approx(value));
    case Var():
      return Poly({1: Num.of(1)});
    case Neg(:final arg):
      return -toPoly(arg, v);
    case Func(:final name, :final arg):
      final p = toPoly(arg, v);
      if (p.degree > 0) {
        throw MathError('The unknown inside ${name == 'sqrt' ? '√' : name} is not supported yet.');
      }
      return Poly.constant(applyFunc(name, p[0]));
    case Bin(:final op, :final left, :final right):
      final l = toPoly(left, v);
      final r = toPoly(right, v);
      switch (op) {
        case '+':
          return l + r;
        case '-':
          return l - r;
        case '*':
          return l * r;
        case '/':
          if (r.degree > 0) throw MathError('The unknown in a denominator is not supported yet.');
          if (r.isZero) throw MathError('Division by zero is not defined.');
          return l.scale(Num.of(1) / r[0]);
        default:
          if (r.degree > 0) throw MathError('The unknown in a power is not supported yet.');
          final e = r[0];
          if (l.degree == 0) return Poly.constant(power(l[0], e));
          if (!e.isInteger || e.isNegative || e.exact!.num > BigInt.from(8)) {
            throw MathError('Powers of the unknown must be whole numbers like x² or x³.');
          }
          var out = Poly.constant(Num.of(1));
          for (var i = 0; i < e.exact!.num.toInt(); i++) {
            out = out * l;
          }
          return out;
      }
  }
}
