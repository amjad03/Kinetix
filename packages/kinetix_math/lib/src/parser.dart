import 'numbers.dart';

// --- Syntax tree ------------------------------------------------------------------------------

/// A node of a parsed expression. Nodes are immutable; [paren] records brackets the user wrote.
sealed class Node {
  const Node({this.paren = false});
  final bool paren;
  Node withParen(bool p);
}

class NumLit extends Node {
  const NumLit(this.value, {super.paren});
  final Num value;
  @override
  NumLit withParen(bool p) => NumLit(value, paren: p);
}

class Var extends Node {
  const Var(this.name, {super.paren});
  final String name;
  @override
  Var withParen(bool p) => Var(name, paren: p);
}

/// π or e.
class Const extends Node {
  const Const(this.name, {super.paren});
  final String name;
  double get value => name == 'pi' ? 3.141592653589793 : 2.718281828459045;
  @override
  Const withParen(bool p) => Const(name, paren: p);
}

class Neg extends Node {
  const Neg(this.arg, {super.paren});
  final Node arg;
  @override
  Neg withParen(bool p) => Neg(arg, paren: p);
}

/// + − × ÷ ^. [implicit] is a multiplication written without a sign, like 2x or 3(x + 1).
class Bin extends Node {
  const Bin(this.op, this.left, this.right, {this.implicit = false, super.paren});
  final String op;
  final Node left;
  final Node right;
  final bool implicit;
  @override
  Bin withParen(bool p) => Bin(op, left, right, implicit: implicit, paren: p);
  Bin withChildren(Node l, Node r) => Bin(op, l, r, implicit: implicit, paren: paren);
}

/// sqrt, sin, cos, tan (degrees), log (base 10), ln, abs.
class Func extends Node {
  const Func(this.name, this.arg, {super.paren});
  final String name;
  final Node arg;
  @override
  Func withParen(bool p) => Func(name, arg, paren: p);
}

/// A parsed input: an expression, or an equation when [right] is set.
class Parsed {
  Parsed(this.left, this.right, {required this.decimals});
  final Node left;
  final Node? right;

  /// The input used decimal numbers (show answers as decimals where exact).
  final bool decimals;

  bool get isEquation => right != null;
}

/// The unknowns used in [n], e.g. {x}.
Set<String> variablesOf(Node n) => switch (n) {
  NumLit() || Const() => {},
  Var(:final name) => {name},
  Neg(:final arg) || Func(:final arg) => variablesOf(arg),
  Bin(:final left, :final right) => {...variablesOf(left), ...variablesOf(right)},
};

// --- Tokens -----------------------------------------------------------------------------------

enum _T { number, name, op, lparen, rparen, equals }

class _Tok {
  _Tok(this.type, this.text, this.pos);
  final _T type;
  final String text;
  final int pos;
  @override
  String toString() => text;
}

const functions = {'sqrt', 'sin', 'cos', 'tan', 'log', 'ln', 'abs'};
const _names = ['sqrt', 'sin', 'cos', 'tan', 'log', 'abs', 'ln', 'pi'];

const _superDigits = '⁰¹²³⁴⁵⁶⁷⁸⁹';

List<_Tok> _tokenize(String input) {
  final src = input.toLowerCase();
  final hasEquals = src.contains('=');
  final out = <_Tok>[];
  var i = 0;
  bool isDigit(String c) => c.codeUnitAt(0) >= 48 && c.codeUnitAt(0) <= 57;
  bool isLetter(String c) => RegExp(r'[a-z]').hasMatch(c);
  while (i < src.length) {
    final c = src[i];
    if (c.trim().isEmpty) {
      i++;
      continue;
    }
    if (isDigit(c) || (c == '.' && i + 1 < src.length && isDigit(src[i + 1]))) {
      final start = i;
      var dots = 0;
      while (i < src.length && (isDigit(src[i]) || src[i] == '.')) {
        if (src[i] == '.') dots++;
        i++;
      }
      final text = src.substring(start, i);
      if (dots > 1 || text.endsWith('.')) throw MathError('“$text” is not a number.');
      out.add(_Tok(_T.number, text, start));
      continue;
    }
    if (isLetter(c)) {
      // "2 x 3" with no equation: x is a times sign, as students often write it.
      if (c == 'x' && !hasEquals && out.isNotEmpty && out.last.type == _T.number) {
        var j = i + 1;
        while (j < src.length && src[j] == ' ') {
          j++;
        }
        if (j < src.length && isDigit(src[j])) {
          out.add(_Tok(_T.op, '*', i));
          i++;
          continue;
        }
      }
      // A run of letters: known names first (sqrt, sin, pi …), otherwise one letter per unknown.
      final name = _names.firstWhere((n) => src.startsWith(n, i), orElse: () => '');
      if (name.isNotEmpty) {
        out.add(_Tok(_T.name, name, i));
        i += name.length;
      } else {
        out.add(_Tok(_T.name, c, i));
        i++;
      }
      continue;
    }
    final sup = _superDigits.indexOf(c);
    if (sup >= 0) {
      final start = i;
      final buf = StringBuffer();
      while (i < src.length && _superDigits.contains(src[i])) {
        buf.write(_superDigits.indexOf(src[i]));
        i++;
      }
      out
        ..add(_Tok(_T.op, '^', start))
        ..add(_Tok(_T.number, buf.toString(), start));
      continue;
    }
    final op = switch (c) {
      '+' => '+',
      '-' || '−' || '–' => '-',
      '*' || '×' || '·' || '⋅' => '*',
      '/' || '÷' => '/',
      '^' => '^',
      _ => null,
    };
    if (op != null) {
      out.add(_Tok(_T.op, op, i++));
    } else if ('([{'.contains(c)) {
      out.add(_Tok(_T.lparen, '(', i++));
    } else if (')]}'.contains(c)) {
      out.add(_Tok(_T.rparen, ')', i++));
    } else if (c == '=') {
      out.add(_Tok(_T.equals, '=', i++));
    } else if (c == '√') {
      out.add(_Tok(_T.name, 'sqrt', i++));
    } else if (c == 'π') {
      out.add(_Tok(_T.name, 'pi', i++));
    } else {
      throw MathError('I don’t understand “$c”. Use numbers, x, + − × ÷ ^, brackets, √, sin, cos, tan, log.');
    }
  }
  return out;
}

// --- Parser -----------------------------------------------------------------------------------

/// Parses an expression or an equation. Throws [MathError] with a friendly message.
Parsed parse(String input) {
  final toks = _tokenize(input);
  if (toks.isEmpty) throw MathError('Type a sum or an equation, like 3x + 5 = 20.');
  final p = _Parser(toks);
  final left = p.expr();
  Node? right;
  if (p.peek?.type == _T.equals) {
    p.next();
    if (p.peek == null) throw MathError('Write something after “=”.');
    right = p.expr();
    if (p.peek?.type == _T.equals) throw MathError('Use only one “=” sign.');
  }
  final rest = p.peek;
  if (rest != null) {
    if (rest.type == _T.rparen) throw MathError('There is a “)” without a matching “(”.');
    throw MathError('I don’t understand “${rest.text}” here.');
  }
  return Parsed(left, right, decimals: toks.any((t) => t.type == _T.number && t.text.contains('.')));
}

class _Parser {
  _Parser(this.toks);
  final List<_Tok> toks;
  var i = 0;

  _Tok? get peek => i < toks.length ? toks[i] : null;
  _Tok next() {
    if (i >= toks.length) throw MathError('The expression ends too early. Is something missing?');
    return toks[i++];
  }

  bool _isOp(String op) => peek?.type == _T.op && peek!.text == op;

  Node expr() {
    var left = term();
    while (_isOp('+') || _isOp('-')) {
      final op = next().text;
      left = Bin(op, left, term());
    }
    return left;
  }

  /// Can the next token start a factor written straight after the previous one (2x, 3(x+1))?
  bool _startsImplicit(Node prev) {
    final t = peek;
    if (t == null) return false;
    if (t.type == _T.name || t.type == _T.lparen) return true;
    // "(x + 1)2" or "x2": a number after a bracket or a letter. "2 3" stays an error.
    return t.type == _T.number && prev is! NumLit;
  }

  Node term() {
    var left = unary();
    while (true) {
      if (_isOp('*') || _isOp('/')) {
        final op = next().text;
        left = Bin(op, left, unary());
      } else if (_startsImplicit(_lastFactor(left))) {
        left = Bin('*', left, power(), implicit: true);
      } else {
        if (peek?.type == _T.number) throw MathError('Put an operator (+ − × ÷) between the numbers.');
        return left;
      }
    }
  }

  Node _lastFactor(Node n) => n is Bin && (n.op == '*' || n.op == '/') && !n.paren ? _lastFactor(n.right) : n;

  Node unary() {
    if (_isOp('-')) {
      next();
      return _negate(unary());
    }
    if (_isOp('+')) {
      next();
      return unary();
    }
    return power();
  }

  Node power() {
    final base = primary();
    if (_isOp('^')) {
      next();
      if (peek == null) throw MathError('Write the power after “^”.');
      return Bin('^', base, unary());
    }
    return base;
  }

  Node primary() {
    final t = next();
    switch (t.type) {
      case _T.number:
        return NumLit(Num.exact(Rational.parse(t.text)));
      case _T.lparen:
        if (peek?.type == _T.rparen) throw MathError('There is nothing inside the brackets “()”.');
        final inner = expr();
        if (peek?.type != _T.rparen) throw MathError('A bracket is not closed. Add “)”.');
        next();
        return inner.withParen(true);
      case _T.name:
        if (t.text == 'pi') return const Const('pi');
        if (t.text == 'e') return const Const('e');
        if (functions.contains(t.text)) {
          if (peek == null) throw MathError('Write a number after ${t.text == 'sqrt' ? '√' : t.text}.');
          // sqrt(…) or sqrt 16 / sin 30.
          final arg = peek!.type == _T.lparen ? primary().withParen(false) : power();
          return Func(t.text, arg);
        }
        return Var(t.text);
      case _T.op:
        throw MathError(t.text == '=' ? 'Write something before “=”.' : 'Something is missing before “${_show(t.text)}”.');
      case _T.rparen:
        throw MathError('There is a “)” without a matching “(”.');
      case _T.equals:
        throw MathError('Write something on both sides of “=”.');
    }
  }

  String _show(String op) => switch (op) {
    '*' => '×',
    '/' => '÷',
    '-' => minus,
    _ => op,
  };
}

/// −(number) folds into the number so "−3" is one value.
Node _negate(Node n) => n is NumLit && !n.paren ? NumLit(-n.value) : Neg(n);
