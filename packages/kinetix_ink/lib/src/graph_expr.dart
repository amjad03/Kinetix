import 'dart:math' as math;

/// y = f(x) for graphs on the board: a small, fast evaluator (graphs sample a function a few
/// hundred times per frame). Understands + − × ÷ ^, brackets, implicit multiplication (`2x`,
/// `3(x+1)`, `x sin x`), `pi`, `e`, and sin, cos, tan, asin, acos, atan, sqrt, abs, ln, log
/// (base 10), exp. Angles are radians, as graphs are drawn. The ERP has the same evaluator
/// (apps/erp/src/lib/live/graph.ts).
///
/// Returns null when the expression cannot be read.
double Function(double x)? compileGraph(String expression) {
  try {
    final p = _Parser(expression.replaceAll('×', '*').replaceAll('÷', '/').replaceAll('−', '-').replaceAll('π', 'pi').toLowerCase());
    final f = p.expression();
    p.skipSpace();
    if (!p.done) return null;
    return f;
  } on FormatException {
    return null;
  }
}

typedef _F = double Function(double x);

class _Parser {
  _Parser(this.s);

  final String s;
  int i = 0;

  bool get done => i >= s.length;

  void skipSpace() {
    while (i < s.length && s[i] == ' ') {
      i++;
    }
  }

  String? peek() {
    skipSpace();
    return done ? null : s[i];
  }

  // expression := term (('+' | '-') term)*
  _F expression() {
    var left = term();
    while (true) {
      final c = peek();
      if (c == '+' || c == '-') {
        i++;
        final right = term();
        final l = left;
        left = c == '+' ? (x) => l(x) + right(x) : (x) => l(x) - right(x);
      } else {
        return left;
      }
    }
  }

  // term := unary (('*' | '/' | implicit) unary)*
  _F term() {
    var left = unary();
    while (true) {
      final c = peek();
      if (c == '*' || c == '/') {
        i++;
        final right = unary();
        final l = left;
        left = c == '*' ? (x) => l(x) * right(x) : (x) => l(x) / right(x);
      } else if (c != null && (c == '(' || _isLetter(c) || _isDigit(c) || c == '.')) {
        // Implicit multiplication: 2x, 3(x + 1), x sin x.
        final right = unary();
        final l = left;
        left = (x) => l(x) * right(x);
      } else {
        return left;
      }
    }
  }

  // unary := '-' unary | power
  _F unary() {
    final c = peek();
    if (c == '-') {
      i++;
      final f = unary();
      return (x) => -f(x);
    }
    if (c == '+') {
      i++;
      return unary();
    }
    return power();
  }

  // power := atom ('^' unary)?   (right-associative: 2^3^2 = 2^9)
  _F power() {
    final base = atom();
    if (peek() == '^') {
      i++;
      final exp = unary();
      return (x) => math.pow(base(x), exp(x)).toDouble();
    }
    return base;
  }

  _F atom() {
    final c = peek();
    if (c == null) throw const FormatException('end');
    if (c == '(') {
      i++;
      final f = expression();
      if (peek() != ')') throw const FormatException(')');
      i++;
      return f;
    }
    if (_isDigit(c) || c == '.') {
      final start = i;
      while (i < s.length && (_isDigit(s[i]) || s[i] == '.')) {
        i++;
      }
      final v = double.parse(s.substring(start, i));
      return (_) => v;
    }
    if (_isLetter(c)) {
      // Letters may run together (sinx, 2pix): take the longest known word here.
      for (final word in _words) {
        if (!s.startsWith(word, i)) continue;
        i += word.length;
        if (word == 'x') return (x) => x;
        if (word == 'pi') return (_) => math.pi;
        if (word == 'e') return (_) => math.e;
        final fn = _functions[word]!;
        final arg = power(); // sin x and sin(x); write sin(2x) for the sine of 2x
        return (x) => fn(arg(x));
      }
      throw FormatException('unknown letter at $i');
    }
    throw FormatException('unexpected $c');
  }

  static final _words = [..._functions.keys.toList()..sort((a, b) => b.length.compareTo(a.length)), 'pi', 'x', 'e'];

  static bool _isDigit(String c) => c.codeUnitAt(0) >= 48 && c.codeUnitAt(0) <= 57;
  static bool _isLetter(String c) => c.codeUnitAt(0) >= 97 && c.codeUnitAt(0) <= 122;

  static final _functions = <String, double Function(double)>{
    'sin': math.sin,
    'cos': math.cos,
    'tan': math.tan,
    'asin': math.asin,
    'acos': math.acos,
    'atan': math.atan,
    'sqrt': math.sqrt,
    'abs': (v) => v.abs(),
    'ln': math.log,
    'log': (v) => math.log(v) / math.ln10,
    'exp': math.exp,
  };
}
