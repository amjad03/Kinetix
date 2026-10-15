import 'numbers.dart';
import 'parser.dart';

/// LaTeX for the solver's syntax, and the solver's syntax back from LaTeX: so a line of
/// handwriting read as text ("2x+5=15") becomes a typeset equation on the board, and an
/// equation on the board can be sent to the solver. One maths model for both: the solver's own
/// parser reads the text.
abstract final class MathTex {
  /// LaTeX for [text] such as `2x+5=15`, `x^2-5x+6=0`, `(1)/(2)`, `√50`, `x ≤ 7`; null when it
  /// does not parse as maths. Relations (= < > ≤ ≥) may join several sides.
  static String? fromText(String text) {
    final s = text.trim();
    if (s.isEmpty) return null;
    // A word ("Photosynthesis") would parse as a product of letters: it is not maths.
    if (RegExp('[a-zA-Z]{3,}').hasMatch(s.replaceAll(RegExp('sqrt|sin|cos|tan|log|ln|abs|pi', caseSensitive: false), ''))) return null;
    final parts = <String>[];
    final relations = <String>[];
    final rel = RegExp(r'<=|>=|≤|≥|<|>|=');
    var last = 0;
    for (final m in rel.allMatches(s)) {
      parts.add(s.substring(last, m.start));
      relations.add(m[0]!);
      last = m.end;
    }
    parts.add(s.substring(last));
    // "12 ÷ 4" keeps its sign; "1/2" or "(x+1)/(x−1)" is a fraction.
    final divideSign = s.contains('÷') && !s.contains('/');
    final out = StringBuffer();
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].trim().isEmpty) return null;
      final Parsed p;
      try {
        p = parse(parts[i]);
      } on MathError {
        return null;
      }
      if (p.isEquation) return null;
      if (i > 0) {
        out.write(switch (relations[i - 1]) {
          '<=' || '≤' => r' \le ',
          '>=' || '≥' => r' \ge ',
          final r => ' $r ',
        });
      }
      out.write(_TexPrinter(NumberFormat(preferDecimal: p.decimals), divideSign: divideSign).tex(p.left));
    }
    return out.toString();
  }

  /// The solver's syntax for [latex] (what the equation editor and the AI pen write): fractions,
  /// roots, powers, × ÷ and π. Commands it does not know lose their backslash.
  static String toText(String latex) {
    var s = latex;
    // Innermost groups first, so nested fractions and roots come out right.
    final frac = RegExp(r'\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}');
    final sqrt = RegExp(r'\\sqrt\s*\{([^{}]*)\}');
    final power = RegExp(r'\^\s*\{([^{}]*)\}');
    for (var guard = 0; guard < 50; guard++) {
      final before = s;
      s = s.replaceAllMapped(frac, (m) => '(${m[1]})/(${m[2]})');
      s = s.replaceAllMapped(sqrt, (m) => '√(${m[1]})');
      s = s.replaceAllMapped(power, (m) => m[1]!.length == 1 ? '^${m[1]}' : '^(${m[1]})');
      if (s == before) break;
    }
    const words = {
      r'\times': '×',
      r'\cdot': '×',
      r'\div': '÷',
      r'\pi': 'π',
      r'\le': '≤',
      r'\leq': '≤',
      r'\ge': '≥',
      r'\geq': '≥',
      r'\left': '',
      r'\right': '',
      r'\,': ' ',
      r'\;': ' ',
      r'\!': '',
    };
    s = s.replaceAllMapped(RegExp(r'\\[a-zA-Z]+|\\[,;!]'), (m) => words[m[0]] ?? m[0]!.substring(1));
    s = s.replaceAll('{', '(').replaceAll('}', ')');
    return s.replaceAll(RegExp(r'\s+'), ' ').trim();
  }
}

/// Writes a syntax tree as LaTeX, keeping the brackets and the order it was written in.
class _TexPrinter {
  _TexPrinter(this.fmt, {required this.divideSign});

  final NumberFormat fmt;

  /// Divisions are shown with ÷ (as written) rather than as fractions.
  final bool divideSign;

  String tex(Node n) {
    final s = _bare(n);
    return n.paren ? '\\left($s\\right)' : s;
  }

  String _bare(Node n) {
    switch (n) {
      case NumLit(:final value):
        return fmt.num(value).replaceAll(minus, '-');
      case Var(:final name):
        return name;
      case Const(:final name):
        return name == 'pi' ? r'\pi' : 'e';
      case Neg(:final arg):
        return '-${_wrap(arg, _prec(arg) < 4)}';
      case Func(:final name, :final arg):
        return switch (name) {
          'sqrt' => '\\sqrt{${_bare(arg)}}',
          'abs' => '\\left|${_bare(arg)}\\right|',
          _ => '\\$name\\left(${_bare(arg)}\\right)',
        };
      case Bin(:final op, :final left, :final right, :final implicit):
        switch (op) {
          case '+':
            return '${tex(left)} + ${tex(right)}';
          case '-':
            return '${tex(left)} - ${_wrap(right, _prec(right) <= 1)}';
          case '*':
            final l = _wrap(left, _prec(left) < 2), r = _wrap(right, _prec(right) < 3);
            // A command before a letter needs a space (\\pi r, not \\pir).
            final gap = RegExp(r'\\[a-zA-Z]+$').hasMatch(l) && RegExp('^[a-zA-Z]').hasMatch(r) ? ' ' : '';
            return implicit ? '$l$gap$r' : '$l \\times $r';
          case '/':
            if (divideSign) return '${_wrap(left, _prec(left) < 2)} \\div ${_wrap(right, _prec(right) < 3)}';
            return '\\frac{${_bare(left)}}{${_bare(right)}}';
          default: // ^
            return '${_wrap(left, _prec(left) < 5)}^{${_bare(right)}}';
        }
    }
  }

  String _wrap(Node n, bool wrap) => wrap && !n.paren ? '\\left(${_bare(n)}\\right)' : tex(n);

  /// Binding strength: 1 + −, 2 × ÷, 3 unary minus, 4 ^, 5 atoms. Brackets make anything an atom.
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
