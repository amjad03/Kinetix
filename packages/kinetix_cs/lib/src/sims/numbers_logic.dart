import 'package:kinetix_labs/kinetix_labs.dart' show Gate, GateKind;

// --- Number systems -----------------------------------------------------------------------

/// [text] in [base] (2, 8, 10, 16) as a number, or null. Accepts 0b/0o/0x prefixes, spaces and
/// underscores.
int? parseInBase(String text, int base) {
  var t = text.trim().replaceAll(RegExp(r'[\s_]'), '').toLowerCase();
  final neg = t.startsWith('-');
  if (neg) t = t.substring(1);
  final prefix = {2: '0b', 8: '0o', 16: '0x'}[base];
  if (prefix != null && t.startsWith(prefix)) t = t.substring(2);
  if (t.isEmpty) return null;
  final v = int.tryParse(t, radix: base);
  return v == null ? null : (neg ? -v : v);
}

/// The repeated-division working for [n] (≥ 0) into [base]: each line "n ÷ base = q, r".
List<(int n, int q, int r)> divisionSteps(int n, int base) {
  final out = <(int, int, int)>[];
  var x = n;
  do {
    out.add((x, x ~/ base, x % base));
    x ~/= base;
  } while (x > 0);
  return out;
}

/// The place-value expansion of [digits] in [base]: "1×2³ + 0×2² + …".
String placeValues(String digits, int base) {
  final d = digits.toUpperCase();
  return [for (var i = 0; i < d.length; i++) '${d[i]}×$base^${d.length - 1 - i}'].join(' + ');
}

/// [n] in two's complement on [bits] bits (n may be negative), or null when it does not fit.
String? twosComplement(int n, int bits) {
  final min = -(1 << (bits - 1)), max = (1 << (bits - 1)) - 1;
  if (n < min || n > max) return null;
  final v = n < 0 ? (1 << bits) + n : n;
  return v.toRadixString(2).padLeft(bits, '0');
}

/// The signed value of a two's complement bit string.
int fromTwosComplement(String bits) {
  final v = int.parse(bits, radix: 2);
  return bits.startsWith('1') ? v - (1 << bits.length) : v;
}

/// Groups bits in fours (nibbles) for reading: 1011 0010.
String nibbles(String bits) {
  final pad = bits.padLeft((bits.length + 3) ~/ 4 * 4, '0');
  return [for (var i = 0; i < pad.length; i += 4) pad.substring(i, i + 4)].join(' ');
}

enum BitOp { and, or, xor, not, shl, shr }

/// A bitwise operation on [bits]-bit unsigned values.
int bitOp(BitOp op, int a, int b, {int bits = 8}) {
  final mask = (1 << bits) - 1;
  return switch (op) {
        BitOp.and => a & b,
        BitOp.or => a | b,
        BitOp.xor => a ^ b,
        BitOp.not => ~a,
        BitOp.shl => a << b,
        BitOp.shr => (a & mask) >> b,
      } &
      mask;
}

// --- Logic --------------------------------------------------------------------------------

/// A Boolean expression over single-letter variables: AND (also . * & ·), OR (+ |), NOT (! ~ ¬
/// or a trailing '), XOR (^ ⊕), NAND, NOR, XNOR, brackets, 0 and 1. Gates are evaluated with
/// the virtual lab's own [Gate.eval].
class BoolExpr {
  BoolExpr._(this._root, this.variables);

  final _Node _root;

  /// The variables in alphabetical order.
  final List<String> variables;

  static BoolExpr parse(String text) {
    final p = _Parser(text);
    final root = p.parseOr();
    p.skip();
    if (p.i < p.s.length) throw FormatException('Unexpected "${p.s[p.i]}"', text, p.i);
    final vars = p.vars.toList()..sort();
    return BoolExpr._(root, vars);
  }

  bool eval(Map<String, bool> env) => _root.eval(env);

  /// Every row: the inputs (A first, as the most significant bit) and the output.
  List<(List<bool>, bool)> truthTable() {
    final n = variables.length;
    return [
      for (var row = 0; row < (1 << n); row++)
        () {
          final ins = [for (var k = 0; k < n; k++) (row >> (n - 1 - k)) & 1 == 1];
          return (ins, eval({for (var k = 0; k < n; k++) variables[k]: ins[k]}));
        }(),
    ];
  }

  /// The rows where the output is 1, as Σm(…).
  List<int> get minterms => [for (final (i, (_, out)) in truthTable().indexed) if (out) i];

  /// The sum of products from the minterms (canonical, not minimised): A'B + AB'.
  String get sumOfProducts {
    final terms = [
      for (final m in minterms) [for (var k = 0; k < variables.length; k++) (m >> (variables.length - 1 - k)) & 1 == 1 ? variables[k] : "${variables[k]}'"].join(),
    ];
    return terms.isEmpty ? '0' : terms.join(' + ');
  }
}

sealed class _Node {
  bool eval(Map<String, bool> env);
}

class _Var extends _Node {
  _Var(this.name);
  final String name;
  @override
  bool eval(Map<String, bool> env) => env[name] ?? false;
}

class _Const extends _Node {
  _Const(this.v);
  final bool v;
  @override
  bool eval(Map<String, bool> env) => v;
}

class _Gate extends _Node {
  _Gate(this.kind, this.args);
  final GateKind kind;
  final List<_Node> args;
  @override
  bool eval(Map<String, bool> env) => Gate.eval(kind, [for (final a in args) a.eval(env)]);
}

class _Parser {
  _Parser(this.s);
  final String s;
  int i = 0;
  final vars = <String>{};

  void skip() {
    while (i < s.length && s[i].trim().isEmpty) {
      i++;
    }
  }

  /// The word operator at i (AND, OR, …), consumed.
  String? word(List<String> ops) {
    skip();
    for (final o in ops) {
      final end = i + o.length;
      if (end <= s.length && s.substring(i, end).toUpperCase() == o && (end == s.length || !RegExp(r'[A-Za-z]').hasMatch(s[end]))) {
        i = end;
        return o;
      }
    }
    return null;
  }

  bool sym(String chars) {
    skip();
    if (i < s.length && chars.contains(s[i])) {
      i++;
      return true;
    }
    return false;
  }

  _Node parseOr() {
    var l = parseXor();
    while (true) {
      if (sym('+|')) {
        l = _Gate(GateKind.or, [l, parseXor()]);
      } else if (word(['NOR']) != null) {
        l = _Gate(GateKind.nor, [l, parseXor()]);
      } else if (word(['OR']) != null) {
        l = _Gate(GateKind.or, [l, parseXor()]);
      } else {
        return l;
      }
    }
  }

  _Node parseXor() {
    var l = parseAnd();
    while (true) {
      if (sym('^⊕')) {
        l = _Gate(GateKind.xor, [l, parseAnd()]);
      } else if (word(['XNOR']) != null) {
        l = _Gate(GateKind.xnor, [l, parseAnd()]);
      } else if (word(['XOR']) != null) {
        l = _Gate(GateKind.xor, [l, parseAnd()]);
      } else {
        return l;
      }
    }
  }

  _Node parseAnd() {
    var l = parseNot();
    while (true) {
      skip();
      if (sym('.*&·')) {
        l = _Gate(GateKind.and, [l, parseNot()]);
      } else if (word(['NAND']) != null) {
        l = _Gate(GateKind.nand, [l, parseNot()]);
      } else if (word(['AND']) != null) {
        l = _Gate(GateKind.and, [l, parseNot()]);
      } else if (i < s.length && (RegExp(r'[A-Za-z01(!~¬]').hasMatch(s[i])) && !_atWordOp()) {
        // Juxtaposition: AB means A AND B.
        l = _Gate(GateKind.and, [l, parseNot()]);
      } else {
        return l;
      }
    }
  }

  bool _atWordOp() {
    final rest = s.substring(i).toUpperCase();
    return RegExp(r'^(AND|OR|NOT|XOR|XNOR|NAND|NOR)(?![A-Z])').hasMatch(rest);
  }

  _Node parseNot() {
    if (sym('!~¬') || word(['NOT']) != null) return _Gate(GateKind.not, [parseNot()]);
    var n = parseAtom();
    while (i < s.length && s[i] == "'") {
      i++;
      n = _Gate(GateKind.not, [n]);
    }
    return n;
  }

  _Node parseAtom() {
    skip();
    if (i >= s.length) throw FormatException('Expression ends too soon', s, i);
    final c = s[i];
    if (c == '(') {
      i++;
      final n = parseOr();
      if (!sym(')')) throw FormatException('Missing )', s, i);
      return n;
    }
    if (c == '0' || c == '1') {
      i++;
      return _Const(c == '1');
    }
    if (RegExp(r'[A-Za-z]').hasMatch(c)) {
      i++;
      final v = c.toUpperCase();
      vars.add(v);
      return _Var(v);
    }
    throw FormatException('Unexpected "$c"', s, i);
  }
}
