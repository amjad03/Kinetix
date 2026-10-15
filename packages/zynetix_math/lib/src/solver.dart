import 'dart:math' as math;

import 'arithmetic.dart';
import 'evaluate.dart';
import 'numbers.dart';
import 'parser.dart';
import 'polynomial.dart';
import 'printer.dart';
import 'solution.dart';

/// The offline maths solver. Works without a network: arithmetic with BODMAS, linear and
/// quadratic equations in one unknown, with step-by-step working.
abstract final class MathSolver {
  /// Solves [input] such as "2 + 3 × 4", "3x + 5 = 20" or "x^2 − 5x + 6 = 0".
  /// Throws [MathError] with a message for the class when the input is not understood or
  /// not supported.
  static MathSolution solve(String input) => _Solve(input.trim()).run();
}

class _Solve {
  _Solve(this.input);

  final String input;
  late final NumberFormat fmt;
  late final Printer print;

  MathSolution run() {
    final parsed = parse(input);
    fmt = NumberFormat(preferDecimal: parsed.decimals);
    print = Printer(fmt);
    final vars = {...variablesOf(parsed.left), ...?(parsed.right == null ? null : variablesOf(parsed.right!))};
    if (vars.length > 1) {
      final list = (vars.toList()..sort()).join(', ');
      throw MathError('This has more than one unknown ($list). Use one unknown, like x.');
    }
    final right = parsed.right;
    if (right == null) {
      return vars.isEmpty ? _arithmetic(parsed.left) : _simplify(parsed.left, vars.single);
    }
    if (vars.isEmpty) return _statement(parsed.left, right);
    return _equation(parsed.left, right, vars.single);
  }

  // --- Arithmetic ---------------------------------------------------------------------------

  MathSolution _arithmetic(Node n) {
    final r = ArithmeticStepper(fmt).run(n);
    final steps = [MathStep('Start with the expression', print(n)), ...r.steps];
    final v = r.value;
    return MathSolution(
      input: input,
      kind: MathKind.arithmetic,
      answer: v.isExact ? fmt.num(v) : '≈ ${fmt.num(v)}',
      decimal: _decimalFor(v),
      steps: steps,
      values: [v.value],
    );
  }

  /// "3.5" for 7/2; null when the answer already is a whole number or a decimal.
  String? _decimalFor(Num v) {
    if (!v.isExact || v.isInteger) return null;
    final shown = fmt.num(v);
    if (!shown.contains('/')) return null;
    return v.exact!.exactDecimal() ?? fmt.approx(v);
  }

  MathSolution _statement(Node l, Node r) {
    final a = evaluate(l), b = evaluate(r);
    final ok = a.sameAs(b);
    return MathSolution(
      input: input,
      kind: MathKind.statement,
      answer: ok ? 'True' : 'False',
      steps: [
        MathStep('Start with the statement', '${print(l)} = ${print(r)}'),
        MathStep('Work out the left side', '${print(l)} = ${fmt.num(a)}'),
        MathStep('Work out the right side', '${print(r)} = ${fmt.num(b)}'),
        MathStep(ok ? 'Both sides are equal, so the statement is true' : 'The sides are different, so the statement is false',
            '${fmt.num(a)} ${ok ? '=' : '≠'} ${fmt.num(b)}'),
      ],
    );
  }

  // --- Simplify -----------------------------------------------------------------------------

  MathSolution _simplify(Node n, String v) {
    final p = toPoly(n, v);
    final shown = p.show(v, fmt);
    final steps = [MathStep('Start with the expression', print(n))];
    if (shown != print(n)) steps.add(MathStep('Expand the brackets and collect like terms', shown));
    steps.add(MathStep('To find $v, write an equation, e.g. $shown = 0', shown));
    return MathSolution(input: input, kind: MathKind.simplify, answer: shown, steps: steps, variable: v);
  }

  // --- Equations ----------------------------------------------------------------------------

  String _eq(Poly l, Poly r, String v) => '${l.show(v, fmt)} = ${r.show(v, fmt)}';

  MathSolution _equation(Node lhs, Node rhs, String v) {
    var l = toPoly(lhs, v);
    var r = toPoly(rhs, v);
    final p = l - r;
    final written = '${print(lhs)} = ${print(rhs)}';
    final steps = [MathStep('Write the equation', written)];
    if (p.degree > 2) throw MathError('Equations with $v${superscript(p.degree)} or higher powers are not supported yet. Try a linear or quadratic equation.');
    if (p.degree == 2) return _quadratic(lhs, rhs, p, v, steps);

    if (_eq(l, r, v) != written) steps.add(MathStep('Expand the brackets and collect like terms on each side', _eq(l, r, v)));
    // x² terms that cancel (x² + x = x² + 3).
    if (l.degree == 2 || r.degree == 2) {
      final sq = l.only(2);
      l -= sq;
      r -= sq;
      steps.add(MathStep('Subtract ${Poly.term(sq[2].abs(), 2, v, fmt)} from both sides; the $v² terms cancel', _eq(l, r, v)));
    }
    if (p.degree == 0) {
      final identity = p.isZero;
      steps.add(MathStep(
        identity ? 'Both sides are always equal' : 'The two sides can never be equal',
        identity ? '${l.show(v, fmt)} = ${r.show(v, fmt)} for every $v' : '${_eq(l - l.only(1), r - r.only(1), v)} is false',
      ));
      return MathSolution(
        input: input,
        kind: MathKind.linear,
        answer: identity ? 'Every number is a solution' : 'No solution',
        steps: steps,
        variable: v,
      );
    }
    // Unknowns to the left.
    final a2 = r[1];
    if (!a2.isZero) {
      final t = Poly.term(a2.abs(), 1, v, fmt);
      l -= r.only(1);
      r -= r.only(1);
      steps.add(MathStep(a2.isNegative ? 'Add $t to both sides' : 'Subtract $t from both sides', _eq(l, r, v)));
    }
    // Numbers to the right.
    final b1 = l[0];
    if (!b1.isZero) {
      final t = fmt.num(b1.abs());
      l -= l.only(0);
      r -= Poly.constant(b1);
      steps.add(MathStep(b1.isNegative ? 'Add $t to both sides' : 'Subtract $t from both sides', _eq(l, r, v)));
    }
    final a = l[1];
    final x = r[0] / a;
    if (!a.isOne) {
      final inv = Num.of(1) / a;
      final how = (-a).isOne
          ? 'Multiply both sides by ${minus}1'
          : (inv.isInteger ? 'Multiply both sides by ${fmt.num(inv)}' : 'Divide both sides by ${fmt.num(a)}');
      steps.add(MathStep(how, '$v = ${fmt.num(x)}'));
    }
    final dec = _decimalFor(x);
    // Check by putting the answer back.
    final lv = evaluate(lhs, {v: x}), rv = evaluate(rhs, {v: x});
    final ls = print(substitute(lhs, v, x)), rs = print(substitute(rhs, v, x));
    final tick = lv.sameAs(rv) ? ' ✓' : '';
    final check = rs == fmt.num(rv)
        ? '$ls = ${fmt.num(lv)}$tick'
        : (ls == fmt.num(lv) ? '$rs = ${fmt.num(rv)}$tick' : '$ls = ${fmt.num(lv)}  and  $rs = ${fmt.num(rv)}$tick');
    steps.add(MathStep('Check: put $v = ${fmt.num(x)} back into the equation', check));
    return MathSolution(
      input: input,
      kind: MathKind.linear,
      answer: '$v = ${fmt.num(x)}',
      decimal: dec == null ? null : '$v ≈ $dec',
      steps: steps,
      variable: v,
      values: [x.value],
    );
  }

  MathSolution _quadratic(Node lhs, Node rhs, Poly p, String v, List<MathStep> steps) {
    String eq0(Poly q) => '${q.show(v, fmt)} = 0';
    if (eq0(p) != steps.first.expression) steps.add(MathStep('Bring every term to the left side and simplify', eq0(p)));

    if (p.isExact) {
      // Whole-number coefficients with a positive x² term make the formula easier.
      final dens = [for (final c in p.terms.values) c.exact!.den];
      final lcm = dens.fold(BigInt.one, (a, b) => a * b ~/ a.gcd(b));
      if (lcm > BigInt.one) {
        p = p.scale(Num.exact(Rational(lcm)));
        steps.add(MathStep('Multiply both sides by $lcm to clear the fractions', eq0(p)));
      }
      if (p[2].isNegative) {
        p = -p;
        steps.add(MathStep('Multiply both sides by ${minus}1 so the $v² term is positive', eq0(p)));
      }
      final g = p.terms.values.map((c) => c.exact!.num.abs()).reduce((a, b) => a.gcd(b));
      if (g > BigInt.one) {
        p = p.scale(Num.exact(Rational(BigInt.one, g)));
        steps.add(MathStep('Divide both sides by $g', eq0(p)));
      }
    }
    final a = p[2], b = p[1], c = p[0];
    String paren(Num n) => n.isNegative || fmt.showsAsFraction(n) ? '(${fmt.num(n)})' : fmt.num(n);
    steps.add(MathStep('Compare with a$v² + b$v + c = 0', 'a = ${fmt.num(a)},  b = ${fmt.num(b)},  c = ${fmt.num(c)}'));

    final b2 = b * b, fourAc = Num.of(4) * a * c;
    final d = b2 - fourAc;
    final rel = d.isExact ? '=' : '≈';
    steps.add(MathStep(
      'Find the discriminant D = b² $minus 4ac',
      'D = ${paren(b)}² $minus 4 × ${paren(a)} × ${paren(c)} $rel ${fmt.num(b2)} $minus ${paren(fourAc)} $rel ${fmt.num(d)}',
    ));

    final twoA = Num.of(2) * a;
    final negB = -b;
    final formula = '$v = (${fmt.num(negB)} ± √${d.isNegative ? '(${fmt.num(d)})' : fmt.num(d)}) / ${fmt.num(twoA)}';

    if (d.isZero) {
      final root = negB / twoA;
      steps
        ..add(MathStep('D = 0, so the two roots are equal', 'D = 0'))
        ..add(MathStep('Use $v = ${minus}b / 2a', '$v = ${fmt.num(negB)} / ${fmt.num(twoA)} = ${fmt.num(root)}'));
      final f = _factorised(p, root, root, v);
      if (f != null) steps.add(f);
      final dec = _decimalFor(root);
      return MathSolution(
        input: input,
        kind: MathKind.quadratic,
        answer: '$v = ${fmt.num(root)} (repeated root)',
        decimal: dec == null ? null : '$v ≈ $dec',
        steps: steps,
        variable: v,
        values: [root.value],
      );
    }

    final complex = d.isNegative;
    steps.add(MathStep(
      complex
          ? 'D < 0, so there are no real roots. The roots are complex numbers'
          : 'D > 0, so there are two different real roots',
      'D = ${fmt.num(d)} ${complex ? '<' : '>'} 0',
    ));
    steps.add(MathStep('Use the quadratic formula $v = (${minus}b ± √D) / 2a', formula));

    // Exact working with whole-number coefficients.
    if (p.isExact && a.isInteger && b.isInteger && c.isInteger) {
      final dn = d.exact!.num;
      final s = exactRoot(dn.abs(), 2);
      final ai = a.exact!.num, bi = b.exact!.num;
      if (!complex && s != null) {
        final r1 = Rational(-bi - s, ai * BigInt.two), r2 = Rational(-bi + s, ai * BigInt.two);
        final lo = r1 < r2 ? r1 : r2, hi = r1 < r2 ? r2 : r1;
        final nb = fmt.num(negB), den = fmt.num(twoA);
        steps.add(MathStep(
          'Work out the two roots',
          '$v = ($nb + $s) / $den = ${fmt.num(Num.exact(r2))}   or   $v = ($nb $minus $s) / $den = ${fmt.num(Num.exact(r1))}',
        ));
        final f = _factorised(p, Num.exact(lo), Num.exact(hi), v);
        if (f != null) steps.add(f);
        final decs = [lo, hi].map((r) => Num.exact(r)).toList();
        final anyFrac = decs.any((n) => _decimalFor(n) != null);
        return MathSolution(
          input: input,
          kind: MathKind.quadratic,
          answer: '$v = ${fmt.num(Num.exact(lo))} or $v = ${fmt.num(Num.exact(hi))}',
          decimal: anyFrac ? decs.map((n) => '$v ≈ ${fmt.approx(n)}').join(' or ') : null,
          steps: steps,
          variable: v,
          values: [lo.toDouble(), hi.toDouble()],
        );
      }
      final surd = simplifySurd(dn.abs());
      if (surd != null) {
        final k = surd.k, m = surd.m;
        final rootD = complex ? _imag(k, m) : _real(k, m);
        if (complex || k > BigInt.one) {
          steps.add(MathStep('Simplify the square root', '√${complex ? '(${fmt.num(d)})' : fmt.num(d)} = $rootD'));
        }
        var g = (-bi).gcd(k).gcd(ai * BigInt.two);
        if (g == BigInt.zero) g = BigInt.one;
        final pn = -bi ~/ g, q = k ~/ g, den = ai * BigInt.two ~/ g;
        final exact = _pm(pn, complex ? _imag(q, m) : _real(q, m), den);
        if (g > BigInt.one) {
          steps.add(MathStep('Divide the top and bottom by $g', '$v = $exact'));
        } else if (complex || k > BigInt.one) {
          steps.add(MathStep('So the roots are', '$v = $exact'));
        }
        final re = -b.value / twoA.value, im = math.sqrt(d.value.abs()) / twoA.value;
        final values = complex ? <double>[] : [re - im, re + im];
        final decimal = complex
            ? _complexDecimal(v, re, im)
            : values.map((x) => '$v ≈ ${NumberFormat.decimal(x)}').join(' or ');
        steps.add(MathStep('In decimals', decimal));
        return MathSolution(
          input: input,
          kind: MathKind.quadratic,
          answer: complex ? 'No real roots: $v = $exact' : '$v = $exact',
          decimal: decimal,
          steps: steps,
          variable: v,
          values: values,
        );
      }
    }

    // Decimal working (coefficients with π, √2 …, or very large numbers).
    final re = negB.value / twoA.value, im = math.sqrt(d.value.abs()) / twoA.value.abs();
    if (complex) {
      final s = _complexDecimal(v, re, im);
      steps.add(MathStep('Work out the roots', s));
      return MathSolution(input: input, kind: MathKind.quadratic, answer: 'No real roots: $s', steps: steps, variable: v);
    }
    final roots = [re - im, re + im]..sort();
    final s = roots.map((x) => '$v ≈ ${NumberFormat.decimal(x)}').join(' or ');
    steps.add(MathStep('Work out the roots', s));
    return MathSolution(input: input, kind: MathKind.quadratic, answer: s, steps: steps, variable: v, values: roots);
  }

  String _complexDecimal(String v, double re, double im) {
    final i = '${NumberFormat.decimal(im)}i';
    return NumberFormat.decimal(re) == '0' ? '$v ≈ ±$i' : '$v ≈ ${NumberFormat.decimal(re)} ± $i';
  }

  /// k√m, or k when m = 1.
  String _real(BigInt k, BigInt m) => m == BigInt.one ? '$k' : '${k == BigInt.one ? '' : '$k'}√$m';

  /// ki√m: "i√3", "2i", "3i√2".
  String _imag(BigInt k, BigInt m) => '${k == BigInt.one ? '' : '$k'}i${m == BigInt.one ? '' : '√$m'}';

  /// (p ± s)/den, simplified: "2 ± √3", "(5 ± √13)/2", "±√2/2".
  String _pm(BigInt p, String s, BigInt den) {
    final ps = p.isNegative ? '$minus${p.abs()}' : '$p';
    if (p == BigInt.zero) return den == BigInt.one ? '±$s' : '±$s/$den';
    return den == BigInt.one ? '$ps ± $s' : '($ps ± $s)/$den';
  }

  /// "So x² − 5x + 6 = (x − 2)(x − 3)" for rational roots.
  MathStep? _factorised(Poly p, Num r1, Num r2, String v) {
    if (!p.isExact || !r1.isExact || !r2.isExact) return null;
    final a = p[2].exact!;
    final d1 = r1.exact!.den, d2 = r2.exact!.den;
    final k = a / Rational(d1 * d2);
    if (!k.isInteger) return null;
    String factor(Rational r) {
      final coef = r.den == BigInt.one ? v : '${r.den}$v';
      if (r.isZero) return coef;
      return '($coef ${r.isNegative ? '+' : minus} ${r.num.abs()})';
    }
    final f1 = factor(r1.exact!), f2 = factor(r2.exact!);
    var body = r1.exact == r2.exact ? (r1.isZero ? '$v²' : '$f1²') : (r2.isZero ? '$f2$f1' : '$f1$f2');
    if (!k.isOne) body = '${k == -Rational.one ? minus : k.toString()}$body';
    return MathStep('Factorised form', '${p.show(v, fmt)} = $body');
  }
}
