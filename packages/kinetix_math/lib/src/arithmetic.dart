import 'evaluate.dart';
import 'numbers.dart';
import 'parser.dart';
import 'printer.dart';
import 'solution.dart';

/// Works out an expression one BODMAS stage at a time: Brackets, Orders (powers, roots,
/// functions), Division and Multiplication left to right, then Addition and Subtraction.
/// Operations of the same stage at the same bracket depth are done together in one step.
class ArithmeticStepper {
  ArithmeticStepper(this.fmt) : print = Printer(fmt);

  final NumberFormat fmt;
  final Printer print;

  static const maxSteps = 40;

  ({Num value, List<MathStep> steps}) run(Node root) {
    final steps = <MathStep>[];
    var node = root;
    while (_valueOf(node) == null) {
      if (steps.length >= maxSteps) {
        final v = evaluate(node);
        steps.add(MathStep('Work out the rest', '${print(node)} = ${fmt.num(v)}'));
        return (value: v, steps: steps);
      }
      final found = <_Candidate>[];
      _collect(node, 0, found);
      // Deepest brackets first, then the highest BODMAS stage. Ties are done together.
      final depth = found.map((c) => c.depth).reduce((a, b) => a > b ? a : b);
      final atDepth = found.where((c) => c.depth == depth);
      final stage = atDepth.map((c) => c.stage).reduce((a, b) => a > b ? a : b);
      final chosen = atDepth.where((c) => c.stage == stage).toList();
      final results = Map<Node, Num>.identity();
      final parts = <String>[];
      for (final c in chosen) {
        final v = _apply(c.node);
        results[c.node] = v;
        final exact = v.isExact && _allExact(c.node);
        parts.add('${print(c.node.withParen(false))} ${exact ? '=' : '≈'} ${fmt.num(v)}');
      }
      node = _replace(node, results);
      final label = depth > 0 ? 'Brackets first' : _stageLabel(stage);
      steps.add(MathStep('$label: ${parts.join(',  ')}', print(node)));
    }
    return (value: _valueOf(node)!, steps: steps);
  }

  static String _stageLabel(int stage) => switch (stage) {
    3 => 'Powers and roots',
    2 => 'Divide and multiply, left to right',
    _ => 'Add and subtract, left to right',
  };

  bool _allExact(Node n) => switch (n) {
    NumLit(:final value) => value.isExact,
    Const() || Var() => false,
    Neg(:final arg) || Func(:final arg) => _allExact(arg),
    Bin(:final left, :final right) => _allExact(left) && _allExact(right),
  };

  /// The number a node stands for when it needs no more work (5, −3, π, −π).
  Num? _valueOf(Node n) => switch (n) {
    NumLit(:final value) => value,
    Const(:final value) => Num.approx(value),
    Neg(arg: Const(:final value)) => Num.approx(-value),
    Neg(arg: NumLit(:final value)) => -value,
    // A fraction already in lowest terms, like 1/3, is a number, not a division to do.
    Bin(op: '/', left: NumLit(value: final a), right: NumLit(value: final b))
        when a.isInteger && b.isInteger && !b.isNegative && !b.isZero && !b.isOne && a.exact!.num.gcd(b.exact!.num) == BigInt.one =>
      a / b,
    _ => null,
  };

  Num _apply(Node n) => switch (n) {
    Bin(:final op, :final left, :final right) => binary(op, _valueOf(left)!, _valueOf(right)!),
    Func(:final name, :final arg) => applyFunc(name, _valueOf(arg)!),
    Neg(:final arg) => -_valueOf(arg)!,
    _ => _valueOf(n)!,
  };

  void _collect(Node n, int depth, List<_Candidate> out) {
    if (_valueOf(n) != null) return;
    final d = depth + (n.paren ? 1 : 0);
    switch (n) {
      case NumLit() || Const() || Var():
        return;
      case Neg(:final arg):
        if (_valueOf(arg) != null) {
          out.add(_Candidate(n, d, 3));
        } else {
          _collect(arg, d, out);
        }
      case Func(:final arg):
        if (_valueOf(arg) != null) {
          out.add(_Candidate(n, d, 3));
        } else {
          _collect(arg, d + 1, out);
        }
      case Bin(:final op, :final left, :final right):
        if (_valueOf(left) != null && _valueOf(right) != null) {
          out.add(_Candidate(n, d, op == '^' ? 3 : (op == '*' || op == '/' ? 2 : 1)));
        } else {
          _collect(left, d, out);
          _collect(right, d, out);
        }
    }
  }

  Node _replace(Node n, Map<Node, Num> results) {
    final v = results[n];
    if (v != null) return NumLit(v);
    return switch (n) {
      NumLit() || Const() || Var() => n,
      Neg(:final arg) => _neg(_replace(arg, results), n.paren),
      Func(:final name, :final arg) => Func(name, _replace(arg, results), paren: n.paren),
      Bin(:final left, :final right) => n.withChildren(_replace(left, results), _replace(right, results)),
    };
  }

  /// −(5) after the bracket is worked out is just −5.
  Node _neg(Node arg, bool paren) => arg is NumLit ? NumLit(-arg.value, paren: paren) : Neg(arg, paren: paren);
}

class _Candidate {
  _Candidate(this.node, this.depth, this.stage);
  final Node node;
  final int depth;
  final int stage;
}
