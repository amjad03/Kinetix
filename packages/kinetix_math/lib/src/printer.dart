import 'numbers.dart';
import 'parser.dart';

/// Writes a syntax tree the way it is written in an exercise book: 2(x − 1), 3², √16, sin(30°).
class Printer {
  const Printer(this.fmt);
  final NumberFormat fmt;

  String call(Node n) => _p(n);

  String _p(Node n) {
    final s = _bare(n);
    return n.paren ? '($s)' : s;
  }

  String _bare(Node n) {
    switch (n) {
      case NumLit(:final value):
        return fmt.num(value);
      case Var(:final name):
        return name;
      case Const(:final name):
        return name == 'pi' ? 'π' : 'e';
      case Neg(:final arg):
        return '$minus${_wrapIf(arg, _prec(arg) < 4 || _isNegLit(arg))}';
      case Func(:final name, :final arg):
        final inner = _bare(arg);
        if (name == 'sqrt') {
          final simple = (arg is NumLit && !arg.value.isNegative && !fmt.showsAsFraction(arg.value)) || arg is Var || arg is Const;
          return simple ? '√$inner' : '√($inner)';
        }
        final deg = const {'sin', 'cos', 'tan'}.contains(name) && arg is NumLit ? '°' : '';
        return '$name($inner$deg)';
      case Bin(:final op, :final left, :final right, :final implicit):
        switch (op) {
          case '+':
            return '${_p(left)} + ${_wrapIf(right, _isNegLit(right) || right is Neg && !right.paren)}';
          case '-':
            return '${_p(left)} $minus ${_wrapIf(right, _prec(right) <= 1 || _isNegLit(right) || right is Neg && !right.paren)}';
          case '*':
            final l = _wrapIf(left, _prec(left) < 2 || _isFrac(left));
            final juxtapose = implicit && right is! NumLit && right is! Neg && !(right is Bin && right.op == '^' && right.left is NumLit && !right.left.paren);
            final r = _wrapIf(right, _prec(right) < 3 || _isNegLit(right) || _isFrac(right) || (juxtapose && right is Bin && right.op != '^'));
            return juxtapose ? '$l$r' : '$l × $r';
          case '/':
            // 1/3, x/2, x²/4: a fraction bar, as written in the book.
            if (_isWholeLit(right) && (_isWholeLit(left) || (_prec(left) >= 4 && left is! NumLit))) {
              return '${_p(left)}/${_p(right)}';
            }
            final l = _wrapIf(left, _prec(left) < 2 || _isFrac(left));
            final r = _wrapIf(right, _prec(right) < 3 || _isNegLit(right) || _isFrac(right));
            return '$l ÷ $r';
          default: // ^
            final base = _wrapIf(left, _prec(left) < 5 || _isNegLit(left) || _isFrac(left) || left is NumLit && !left.value.isExact);
            if (!right.paren && right is NumLit && right.value.isInteger && !right.value.isNegative && right.value.exact!.num.bitLength < 20) {
              return '$base${superscript(right.value.exact!.num.toInt())}';
            }
            return '$base^${_wrapIf(right, _prec(right) < 5 || _isNegLit(right) || _isFrac(right))}';
        }
    }
  }

  String _wrapIf(Node n, bool wrap) => wrap && !n.paren ? '(${_bare(n)})' : _p(n);

  bool _isWholeLit(Node n) => n is NumLit && !n.paren && n.value.isInteger && !n.value.isNegative;
  bool _isNegLit(Node n) => n is NumLit && n.value.isNegative && !n.paren;
  bool _isFrac(Node n) => n is NumLit && fmt.showsAsFraction(n.value) && !n.paren;

  /// Binding strength: 1 + −, 2 × ÷, 4 ^, 5 atoms. Brackets make anything an atom.
  int _prec(Node n) {
    if (n.paren) return 5;
    return switch (n) {
      Bin(op: '+' || '-') => 1,
      Bin(op: '*' || '/') => 2,
      Neg() => 3,
      Bin() => 4,
      _ => 5,
    };
  }
}
