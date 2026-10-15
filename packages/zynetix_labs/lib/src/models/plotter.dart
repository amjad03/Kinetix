import 'dart:math' as math;

/// A parsed expression in x.
abstract class Expr {
  double eval(double x);
}

class _Num extends Expr {
  _Num(this.v);
  final double v;
  @override
  double eval(double x) => v;
}

class _X extends Expr {
  @override
  double eval(double x) => x;
}

class _Bin extends Expr {
  _Bin(this.op, this.a, this.b);
  final String op;
  final Expr a, b;
  @override
  double eval(double x) {
    final p = a.eval(x), q = b.eval(x);
    return switch (op) {
      '+' => p + q,
      '-' => p - q,
      '*' => p * q,
      '/' => p / q,
      _ => math.pow(p, q).toDouble(),
    };
  }
}

class _Neg extends Expr {
  _Neg(this.a);
  final Expr a;
  @override
  double eval(double x) => -a.eval(x);
}

class _Fn extends Expr {
  _Fn(this.f, this.a);
  final double Function(double) f;
  final Expr a;
  @override
  double eval(double x) => f(a.eval(x));
}

/// A tiny recursive-descent parser for y = f(x): + − × ÷ ^, brackets, implicit
/// multiplication (2x, 3(x+1), x sin x), π, e, and sin cos tan (in degrees by default),
/// sqrt, abs, ln, log.
class ExpressionParser {
  ExpressionParser._(this._s, this.degrees);

  static Expr parse(String source, {bool degrees = true}) {
    var s = source.trim();
    // Accept "y = ..." and "f(x) = ...".
    final eq = s.indexOf('=');
    if (eq >= 0) s = s.substring(eq + 1);
    final p = ExpressionParser._(s.replaceAll('×', '*').replaceAll('÷', '/').replaceAll('−', '-').replaceAll('²', '^2').replaceAll('³', '^3'), degrees);
    final e = p._expr();
    p._skip();
    if (p._i < p._s.length) throw FormatException('Unexpected "${p._s[p._i]}"', source, p._i);
    return e;
  }

  final String _s;
  final bool degrees;
  int _i = 0;

  void _skip() {
    while (_i < _s.length && _s[_i] == ' ') {
      _i++;
    }
  }

  String? get _peek {
    _skip();
    return _i < _s.length ? _s[_i] : null;
  }

  Expr _expr() {
    var e = _term();
    while (true) {
      final c = _peek;
      if (c == '+' || c == '-') {
        _i++;
        e = _Bin(c!, e, _term());
      } else {
        return e;
      }
    }
  }

  bool _startsPrimary(String? c) => c != null && (RegExp(r'[0-9.a-zA-Zπ(]').hasMatch(c));

  Expr _term() {
    var e = _unary();
    while (true) {
      final c = _peek;
      if (c == '*' || c == '/') {
        _i++;
        e = _Bin(c!, e, _unary());
      } else if (_startsPrimary(c)) {
        e = _Bin('*', e, _power()); // implicit multiplication
      } else {
        return e;
      }
    }
  }

  Expr _unary() {
    final c = _peek;
    if (c == '-') {
      _i++;
      return _Neg(_unary());
    }
    if (c == '+') {
      _i++;
      return _unary();
    }
    return _power();
  }

  Expr _power() {
    final base = _primary();
    if (_peek == '^') {
      _i++;
      return _Bin('^', base, _unary()); // right-associative, binds tighter than unary minus on the left
    }
    return base;
  }

  Expr _primary() {
    final c = _peek;
    if (c == null) throw FormatException('Expression ends too soon', _s, _i);
    if (c == '(') {
      _i++;
      final e = _expr();
      if (_peek != ')') throw FormatException('Missing ")"', _s, _i);
      _i++;
      return e;
    }
    if (RegExp(r'[0-9.]').hasMatch(c)) {
      final m = RegExp(r'[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?').matchAsPrefix(_s, _i);
      if (m == null) throw FormatException('Bad number', _s, _i);
      _i = m.end;
      return _Num(double.parse(m.group(0)!));
    }
    if (c == 'π') {
      _i++;
      return _Num(math.pi);
    }
    final m = RegExp(r'[a-zA-Z]+').matchAsPrefix(_s, _i);
    if (m == null) throw FormatException('Unexpected "$c"', _s, _i);
    final word = m.group(0)!.toLowerCase();
    // Longest known function name first, so "sinx" reads as sin(x).
    for (final name in const ['sqrt', 'sin', 'cos', 'tan', 'abs', 'log', 'ln']) {
      if (word.startsWith(name)) {
        _i += name.length;
        final arg = _peek == '(' ? _primary() : _power();
        return _Fn(_function(name), arg);
      }
    }
    if (word.startsWith('pi')) {
      _i += 2;
      return _Num(math.pi);
    }
    if (word.startsWith('x')) {
      _i += 1;
      return _X();
    }
    if (word.startsWith('e')) {
      _i += 1;
      return _Num(math.e);
    }
    throw FormatException('Unknown name "${m.group(0)}"', _s, _i);
  }

  double Function(double) _function(String name) {
    final k = degrees ? math.pi / 180 : 1.0;
    return switch (name) {
      'sin' => (v) => math.sin(v * k),
      'cos' => (v) => math.cos(v * k),
      'tan' => (v) => math.tan(v * k),
      'sqrt' => (v) => math.sqrt(v),
      'abs' => (v) => v.abs(),
      'ln' => (v) => math.log(v),
      _ => (v) => math.log(v) / math.ln10,
    };
  }
}

/// The families the plotter offers with coefficient sliders.
enum PlotMode {
  linear('Linear', 'y = mx + c'),
  quadratic('Quadratic', 'y = ax² + bx + c'),
  sine('Sine', 'y = A sin(Bx + C) + D'),
  cosine('Cosine', 'y = A cos(Bx + C) + D'),
  custom('Custom', 'y = f(x)');

  const PlotMode(this.title, this.form);
  final String title, form;
  bool get isTrig => this == sine || this == cosine;
}

/// Real roots of ax² + bx + c = 0 from the discriminant (sorted; one entry for a repeated root).
List<double> quadraticRoots(double a, double b, double c) {
  if (a == 0) return b == 0 ? const [] : [-c / b];
  final d = b * b - 4 * a * c;
  if (d < -1e-12) return const [];
  if (d.abs() <= 1e-12) return [-b / (2 * a)];
  final s = math.sqrt(d);
  // Numerically stable form.
  final q = -0.5 * (b + (b >= 0 ? s : -s));
  final r = [q / a, c / q]..sort();
  return r;
}

/// Vertex (−b/2a, c − b²/4a) of a parabola.
(double, double) quadraticVertex(double a, double b, double c) => (-b / (2 * a), c - b * b / (4 * a));

/// Zeros of [f] in [lo, hi]: sign changes refined by bisection, plus touching zeros
/// (where |f| has a local minimum of almost zero).
List<double> findRoots(double Function(double) f, double lo, double hi, {int samples = 1200}) {
  final roots = <double>[];
  final dx = (hi - lo) / samples;
  final scale = () {
    var m = 0.0;
    for (var i = 0; i <= 50; i++) {
      final y = f(lo + (hi - lo) * i / 50);
      if (y.isFinite) m = math.max(m, y.abs());
    }
    return m == 0 ? 1.0 : m;
  }();
  void add(double r) {
    if (roots.every((q) => (q - r).abs() > dx * 1.5)) roots.add(r);
  }

  var x0 = lo, y0 = f(lo);
  for (var i = 1; i <= samples; i++) {
    final x1 = lo + dx * i, y1 = f(x1);
    if (y0.isFinite && y1.isFinite) {
      if (y0 == 0) {
        add(x0);
      } else if (y0 * y1 < 0 && (y1 - y0).abs() < scale * 2) {
        // (The size check skips jumps across asymptotes, e.g. tan at 90°.)
        var a = x0, b = x1, fa = y0;
        for (var k = 0; k < 60; k++) {
          final m = (a + b) / 2, fm = f(m);
          if (fa * fm <= 0) {
            b = m;
          } else {
            a = m;
            fa = fm;
          }
        }
        add((a + b) / 2);
      } else if (i >= 2) {
        // Touching zero: |f| dips to (almost) zero without changing sign.
        final xp = x0 - dx, yp = f(xp);
        if (yp.isFinite && y0.abs() < yp.abs() && y0.abs() <= y1.abs() && y0.abs() < scale * 1e-4 && yp * y0 > 0) {
          add(x0);
        }
      }
    }
    x0 = x1;
    y0 = y1;
  }
  if (y0 == 0) add(x0);
  roots.sort();
  return roots;
}

/// A plotted function: one of the families with coefficients, or a custom expression.
class PlotFunction {
  const PlotFunction({required this.mode, this.a = 1, this.b = 0, this.c = 0, this.d = 0, this.custom});

  final PlotMode mode;

  /// linear: m = a, c = b · quadratic: a, b, c · trig: A = a, B = b, C = c (degrees), D = d
  final double a, b, c, d;
  final Expr? custom;

  double eval(double x) => switch (mode) {
        PlotMode.linear => a * x + b,
        PlotMode.quadratic => a * x * x + b * x + c,
        PlotMode.sine => a * math.sin((b * x + c) * math.pi / 180) + d,
        PlotMode.cosine => a * math.cos((b * x + c) * math.pi / 180) + d,
        PlotMode.custom => custom?.eval(x) ?? double.nan,
      };

  /// Roots inside [lo, hi]: exact for linear and quadratic, numerical otherwise.
  List<double> roots(double lo, double hi) => switch (mode) {
        PlotMode.linear => a == 0 ? const [] : [-b / a].where((r) => r >= lo && r <= hi).toList(),
        PlotMode.quadratic => quadraticRoots(a, b, c).where((r) => r >= lo && r <= hi).toList(),
        _ => findRoots(eval, lo, hi),
      };

  (double, double)? get vertex => mode == PlotMode.quadratic && a != 0 ? quadraticVertex(a, b, c) : null;

  double? get discriminant => mode == PlotMode.quadratic ? b * b - 4 * a * c : null;

  PlotFunction copyWith({PlotMode? mode, double? a, double? b, double? c, double? d, Expr? custom}) =>
      PlotFunction(mode: mode ?? this.mode, a: a ?? this.a, b: b ?? this.b, c: c ?? this.c, d: d ?? this.d, custom: custom ?? this.custom);
}
