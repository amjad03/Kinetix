import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Expressions. Lesson presets carry formulas as text ("a*x^2 + b", "if(x < 1, x^2, x + k)").
// This is a small, safe evaluator: numbers, variables, + − * / % ^, comparisons (1 or 0),
// && || !, and the functions the lesson catalogue uses. log is base 10, ln is natural.
// ─────────────────────────────────────────────────────────────────────────────

typedef Env = Map<String, double>;
typedef _F = double Function(Env);

class Expr {
  Expr._(this.source, this._f);
  final String source;
  final _F _f;

  static final _cache = <String, Expr>{};

  /// Parses [s]; throws [FormatException] on bad syntax.
  factory Expr(String s) => _cache.putIfAbsent(s, () => Expr._(s, _Parser(s).parse()));

  /// Parses [s], or returns a constant NaN expression when it cannot be read.
  static Expr safe(Object? s) {
    if (s is num) return Expr._('$s', (_) => s.toDouble());
    try {
      return Expr('$s');
    } on FormatException {
      return Expr._('$s', (_) => double.nan);
    }
  }

  double call(Env env) {
    try {
      return _f(env);
    } catch (_) {
      return double.nan;
    }
  }
}

double _b(bool v) => v ? 1 : 0;
bool _t(double v) => v != 0 && !v.isNaN;

double _rand(double seed) {
  // A fixed hash: the same seed always gives the same value in [0, 1).
  final x = math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - x.floorToDouble();
}

double _mod(double a, double b) => b == 0 ? double.nan : a - b * (a / b).floorToDouble();

final Map<String, double Function(List<double>)> _fns = {
  'sin': (a) => math.sin(a[0]),
  'cos': (a) => math.cos(a[0]),
  'tan': (a) => math.tan(a[0]),
  'asin': (a) => math.asin(a[0]),
  'acos': (a) => math.acos(a[0]),
  'atan': (a) => math.atan(a[0]),
  'atan2': (a) => math.atan2(a[0], a[1]),
  'sec': (a) => 1 / math.cos(a[0]),
  'csc': (a) => 1 / math.sin(a[0]),
  'cosec': (a) => 1 / math.sin(a[0]),
  'cot': (a) => math.cos(a[0]) / math.sin(a[0]),
  'sinh': (a) => (math.exp(a[0]) - math.exp(-a[0])) / 2,
  'cosh': (a) => (math.exp(a[0]) + math.exp(-a[0])) / 2,
  'sqrt': (a) => math.sqrt(a[0]),
  'cbrt': (a) => a[0] < 0 ? -math.pow(-a[0], 1 / 3).toDouble() : math.pow(a[0], 1 / 3).toDouble(),
  'abs': (a) => a[0].abs(),
  'exp': (a) => math.exp(a[0]),
  'ln': (a) => math.log(a[0]),
  'log': (a) => a.length > 1 ? math.log(a[1]) / math.log(a[0]) : math.log(a[0]) / math.ln10,
  'floor': (a) => a[0].floorToDouble(),
  'ceil': (a) => a[0].ceilToDouble(),
  'round': (a) => a[0].roundToDouble(),
  'sign': (a) => a[0].sign,
  'sgn': (a) => a[0].sign,
  'min': (a) => a.reduce(math.min),
  'max': (a) => a.reduce(math.max),
  'clamp': (a) => a[0].clamp(a[1], a[2]).toDouble(),
  'mod': (a) => _mod(a[0], a[1]),
  'hypot': (a) => math.sqrt(a.fold<double>(0, (s, v) => s + v * v)),
  'rad': (a) => a[0] * math.pi / 180,
  'deg': (a) => a[0] * 180 / math.pi,
  'pow': (a) => math.pow(a[0], a[1]).toDouble(),
  'step': (a) => a[1] < a[0] ? 0 : 1,
  'smoothstep': (a) {
    final t = ((a[2] - a[0]) / (a[1] - a[0])).clamp(0.0, 1.0);
    return t * t * (3 - 2 * t);
  },
  'rand': (a) => _rand(a.isEmpty ? 0 : a[0]),
  'fact': (a) => factorial(a[0].round()),
  'nCr': (a) => nCr(a[0].round(), a[1].round()),
  'nPr': (a) => nPr(a[0].round(), a[1].round()),
};

class _Parser {
  _Parser(this.s);
  final String s;
  int i = 0;

  _F parse() {
    final f = _or();
    _ws();
    if (i < s.length) throw FormatException('Unexpected "${s[i]}"', s, i);
    return f;
  }

  void _ws() {
    while (i < s.length && (s[i] == ' ' || s[i] == '\t' || s[i] == '\n')) {
      i++;
    }
  }

  bool _eat(String t) {
    _ws();
    if (s.startsWith(t, i)) {
      i += t.length;
      return true;
    }
    return false;
  }

  _F _or() {
    var l = _and();
    while (_eat('||')) {
      final a = l, b = _and();
      l = (e) => _b(_t(a(e)) || _t(b(e)));
    }
    return l;
  }

  _F _and() {
    var l = _eq();
    while (_eat('&&')) {
      final a = l, b = _eq();
      l = (e) => _b(_t(a(e)) && _t(b(e)));
    }
    return l;
  }

  _F _eq() {
    var l = _cmp();
    while (true) {
      final a = l;
      if (_eat('==')) {
        final b = _cmp();
        l = (e) => _b((a(e) - b(e)).abs() < 1e-9);
      } else if (_eat('!=')) {
        final b = _cmp();
        l = (e) => _b((a(e) - b(e)).abs() >= 1e-9);
      } else {
        return l;
      }
    }
  }

  _F _cmp() {
    var l = _add();
    while (true) {
      final a = l;
      if (_eat('<=')) {
        final b = _add();
        l = (e) => _b(a(e) <= b(e));
      } else if (_eat('>=')) {
        final b = _add();
        l = (e) => _b(a(e) >= b(e));
      } else if (_eat('<')) {
        final b = _add();
        l = (e) => _b(a(e) < b(e));
      } else if (_eat('>')) {
        final b = _add();
        l = (e) => _b(a(e) > b(e));
      } else {
        return l;
      }
    }
  }

  _F _add() {
    var l = _mul();
    while (true) {
      final a = l;
      if (_eat('+')) {
        final b = _mul();
        l = (e) => a(e) + b(e);
      } else if (_eat('-') || _eat('−')) {
        final b = _mul();
        l = (e) => a(e) - b(e);
      } else {
        return l;
      }
    }
  }

  _F _mul() {
    var l = _unary();
    while (true) {
      final a = l;
      if (_eat('*') || _eat('×') || _eat('·')) {
        final b = _unary();
        l = (e) => a(e) * b(e);
      } else if (_eat('/')) {
        final b = _unary();
        l = (e) => a(e) / b(e);
      } else if (_eat('%')) {
        final b = _unary();
        l = (e) => _mod(a(e), b(e));
      } else {
        return l;
      }
    }
  }

  _F _unary() {
    if (_eat('-') || _eat('−')) {
      final a = _unary();
      return (e) => -a(e);
    }
    if (_eat('+')) return _unary();
    if (_eat('!')) {
      final a = _unary();
      return (e) => _b(!_t(a(e)));
    }
    return _pow();
  }

  _F _pow() {
    final base = _atom();
    if (_eat('^')) {
      final ex = _unary(); // right associative: 2^-x and a^b^c work
      return (e) => math.pow(base(e), ex(e)).toDouble();
    }
    return base;
  }

  _F _atom() {
    _ws();
    if (i >= s.length) throw FormatException('Unexpected end', s, i);
    final ch = s[i];
    if (_eat('(')) {
      final f = _or();
      if (!_eat(')')) throw FormatException('Missing )', s, i);
      return f;
    }
    if (RegExp(r'[0-9.]').hasMatch(ch)) {
      final m = RegExp(r'[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?|[0-9]+\.').matchAsPrefix(s, i)!;
      i = m.end;
      final v = double.parse(m.group(0)!);
      return (_) => v;
    }
    final m = RegExp(r'[A-Za-z_π][A-Za-z0-9_]*').matchAsPrefix(s, i);
    if (m == null) throw FormatException('Unexpected "$ch"', s, i);
    i = m.end;
    final name = m.group(0)!;
    if (_eat('(')) {
      final args = <_F>[];
      _ws();
      if (!_eat(')')) {
        do {
          args.add(_or());
        } while (_eat(','));
        if (!_eat(')')) throw FormatException('Missing ) after $name', s, i);
      }
      if (name == 'if') {
        if (args.length != 3) throw FormatException('if needs 3 arguments', s, i);
        final c = args[0], a = args[1], b = args[2];
        return (e) => _t(c(e)) ? a(e) : b(e);
      }
      final fn = _fns[name];
      if (fn == null) throw FormatException('Unknown function $name', s, i);
      return (e) => fn([for (final a in args) a(e)]);
    }
    if (name == 'pi' || name == 'π' || name == 'PI') return (_) => math.pi;
    return (e) => e[name] ?? (name == 'e' ? math.e : (name == 'true' ? 1 : (name == 'false' ? 0 : double.nan)));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Number theory used by the counting and probability instruments.
// ─────────────────────────────────────────────────────────────────────────────

double factorial(int n) {
  if (n < 0) return double.nan;
  var r = 1.0;
  for (var k = 2; k <= n; k++) {
    r *= k;
  }
  return r;
}

double nPr(int n, int r) {
  if (r < 0 || r > n) return 0;
  var v = 1.0;
  for (var k = 0; k < r; k++) {
    v *= n - k;
  }
  return v;
}

double nCr(int n, int r) {
  if (r < 0 || r > n) return 0;
  r = math.min(r, n - r);
  var v = 1.0;
  for (var k = 1; k <= r; k++) {
    v = v * (n - r + k) / k;
  }
  return v.roundToDouble();
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting for the board: a true minus sign, no "−0", sensible digits.
// ─────────────────────────────────────────────────────────────────────────────

String fmt(double v, [int digits = 2]) {
  if (v.isNaN) return '—';
  if (v.isInfinite) return v > 0 ? '∞' : '−∞';
  if (v.abs() >= 1e9 || (v != 0 && v.abs() < math.pow(10, -digits) / 2 && digits > 0 && v.abs() < 1e-4)) {
    final s = sci(v.abs(), sig: 3);
    return v < 0 ? '−$s' : s;
  }
  var s = v.toStringAsFixed(digits);
  if (RegExp(r'^-0(\.0*)?$').hasMatch(s)) s = s.substring(1);
  if (s.startsWith('-')) s = '−${s.substring(1)}';
  if (v.abs() >= 10000 && digits == 0) {
    final neg = s.startsWith('−');
    final body = neg ? s.substring(1) : s;
    final b = StringBuffer();
    for (var k = 0; k < body.length; k++) {
      if (k > 0 && (body.length - k) % 3 == 0) b.write(',');
      b.write(body[k]);
    }
    s = '${neg ? '−' : ''}$b';
  }
  return s;
}

/// Trims trailing zeros: 2.50 → 2.5, 3.00 → 3.
String fmtT(double v, [int digits = 2]) {
  var s = fmt(v, digits);
  if (s.contains('.') && !s.contains('×')) {
    s = s.replaceFirst(RegExp(r'0+$'), '');
    if (s.endsWith('.')) s = s.substring(0, s.length - 1);
  }
  return s == '−0' ? '0' : s;
}

/// "+ 3" / "− 3" for writing equations: y = 2x − 3.
String signed(double v, [int digits = 2]) => v < 0 ? '− ${fmtT(-v, digits)}' : '+ ${fmtT(v, digits)}';

/// Coefficient in front of a symbol: 1x → x, −1x → −x.
String coef(double v, String sym, {bool lead = false, int digits = 2}) {
  if (v.abs() < 1e-12) return '';
  final mag = (v.abs() - 1).abs() < 1e-12 ? sym : '${fmtT(v.abs(), digits)}$sym';
  if (lead) return v < 0 ? '−$mag' : mag;
  return v < 0 ? ' − $mag' : ' + $mag';
}

String superscript(int n) {
  const sup = {'-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹'};
  return n.toString().split('').map((c) => sup[c] ?? c).join();
}

String subscript(int n) {
  const sub = {'-': '₋', '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉'};
  return n.toString().split('').map((c) => sub[c] ?? c).join();
}

/// Angle in radians as a multiple of π where it is a simple fraction: π/6, 2π/3, −π/4.
String piFrac(double rad) {
  for (final den in [1, 2, 3, 4, 6, 12]) {
    final num = rad / math.pi * den;
    if ((num - num.round()).abs() < 1e-6) {
      final n = num.round();
      if (n == 0) return '0';
      final sign = n < 0 ? '−' : '';
      final a = n.abs();
      final top = a == 1 ? 'π' : '$aπ';
      return den == 1 ? '$sign$top' : '$sign$top/$den';
    }
  }
  return fmt(rad, 3);
}

// ─────────────────────────────────────────────────────────────────────────────
// Preset reading.
// ─────────────────────────────────────────────────────────────────────────────

double pd(Map<String, dynamic> m, String k, double f) {
  final v = m[k];
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v) ?? f;
  return f;
}

int pint(Map<String, dynamic> m, String k, int f) => (m[k] as num?)?.round() ?? f;
String ps(Map<String, dynamic> m, String k, String f) => m[k] is String ? m[k] as String : f;
bool pb(Map<String, dynamic> m, String k, bool f) => m[k] is bool ? m[k] as bool : f;

List<double> pl(Map<String, dynamic> m, String k, List<double> f) {
  final v = m[k];
  if (v is List && v.isNotEmpty && v.every((e) => e is num)) return [for (final e in v) (e as num).toDouble()];
  return f;
}

/// Text from a lesson field: a plain string, or {"en": …}.
String? tx(Object? v) {
  if (v is String) return v;
  if (v is Map) return v['en'] as String?;
  return null;
}

/// A slider the lesson defines: {name, label, min, max, step, value, unit}.
class SliderSpec {
  SliderSpec(this.name, this.label, this.min, this.max, this.step, this.value, this.unit);
  final String name, label, unit;
  final double min, max, value;
  final double? step;

  static SliderSpec? from(Object? o) {
    if (o is! Map) return null;
    final name = o['name'] as String?;
    if (name == null) return null;
    final min = (o['min'] as num?)?.toDouble() ?? 0, max = (o['max'] as num?)?.toDouble() ?? 1;
    return SliderSpec(name, tx(o['label']) ?? name, min, max, (o['step'] as num?)?.toDouble(), ((o['value'] as num?)?.toDouble() ?? min).clamp(math.min(min, max), math.max(min, max)).toDouble(), tx(o['unit']) ?? '');
  }

  static List<SliderSpec> list(Object? o) => [if (o is List) for (final e in o) ?SliderSpec.from(e)];

  int? get divisions {
    if (step == null || step! <= 0) return null;
    final n = ((max - min) / step!).round();
    return n > 0 && n <= 2000 ? n : null;
  }

  int get digits {
    final st = step ?? (max - min) / 100;
    if (st >= 1) return 0;
    if (st >= 0.1) return 1;
    if (st >= 0.01) return 2;
    return 3;
  }

  Widget build(double v, ValueChanged<double> on) => IxSlider(label: label, value: v, min: math.min(min, max), max: math.max(min, max), divisions: divisions, unit: unit, format: (x) => fmt(x, digits), onChanged: on);
}

/// A computed readout the lesson defines: {label, expr, digits, unit}.
class ReadoutSpec {
  ReadoutSpec(this.label, this.expr, this.digits, this.unit);
  final String label, unit;
  final Expr expr;
  final int digits;
  static List<ReadoutSpec> list(Object? o) => [
    if (o is List)
      for (final e in o)
        if (e is Map && e['expr'] != null) ReadoutSpec(tx(e['label']) ?? '', Expr.safe(e['expr']), (e['digits'] as num?)?.round() ?? 2, tx(e['unit']) ?? ''),
  ];
}

/// Named intermediate values: [{name, expr}], evaluated in order.
List<(String, Expr)> varList(Object? o) => [
  if (o is List)
    for (final e in o)
      if (e is Map && e['name'] is String && e['expr'] != null) (e['name'] as String, Expr.safe(e['expr'])),
];

void evalVars(Env env, List<(String, Expr)> vars) {
  for (final (n, e) in vars) {
    env[n] = e(env);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Colours for several curves on paper: restrained, distinguishable, never neon.
// ─────────────────────────────────────────────────────────────────────────────

abstract final class MX {
  static const red = Color(0xFFB91C1C);
  static const teal = Color(0xFF0E7490);
  static const violet = Color(0xFF6D3FA8);
  static const rose = Color(0xFFBE185D);
  static const series = [IX.accent, IX.positive, IX.green, violet, teal, IX.amber, rose];

  static Color named(Object? name, int i) => switch (name) {
    'yellow' || 'ink' || 'white' => i == 0 ? IX.accent : IX.ink,
    'blue' => IX.accent,
    'green' => IX.green,
    'orange' => IX.positive,
    'red' => red,
    'purple' || 'violet' => violet,
    'pink' => rose,
    'cyan' || 'teal' => teal,
    'amber' => IX.amber,
    'gray' || 'grey' => IX.steel,
    _ => series[i % series.length],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// A Cartesian plane mapped into a rectangle of the stage.
// ─────────────────────────────────────────────────────────────────────────────

double niceStep(double range, double target) {
  if (range <= 0 || range.isNaN) return 1;
  final raw = range / target;
  final p = math.pow(10, (math.log(raw) / math.ln10).floor()).toDouble();
  final m = raw / p;
  return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
}

class Plane {
  Plane(this.rect, double x0, double x1, double y0, double y1, {bool equal = false}) : xa = x0, xb = x1, ya = y0, yb = y1 {
    if (xb <= xa) xb = xa + 1;
    if (yb <= ya) yb = ya + 1;
    if (equal) {
      final sx = rect.width / (xb - xa), sy = rect.height / (yb - ya);
      if (sx > sy) {
        final w = rect.width / sy, cx = (xa + xb) / 2;
        xa = cx - w / 2;
        xb = cx + w / 2;
      } else {
        final h = rect.height / sx, cy = (ya + yb) / 2;
        ya = cy - h / 2;
        yb = cy + h / 2;
      }
    }
  }

  final Rect rect;
  double xa, xb, ya, yb;

  double get ux => rect.width / (xb - xa);
  double get uy => rect.height / (yb - ya);
  double sx(double x) => rect.left + (x - xa) * ux;
  double sy(double y) => rect.bottom - (y - ya) * uy;
  Offset p(double x, double y) => Offset(sx(x), sy(y));
  double wx(double px) => xa + (px - rect.left) / ux;
  double wy(double py) => ya + (rect.bottom - py) / uy;
  Offset w(Offset s) => Offset(wx(s.dx), wy(s.dy));

  /// Grid, axes and tick labels. Axes sit at 0 when 0 is in view, else on the edge.
  void paintGrid(Canvas c, {String xLabel = 'x', String yLabel = 'y', bool piTicks = false, double? xStep, double? yStep, bool grid = true, bool yTicks = true, String Function(double)? xTick, String Function(double)? yTick}) {
    final stx = xStep ?? (piTicks ? math.pi / 2 : niceStep(xb - xa, rect.width / 120));
    final sty = yStep ?? niceStep(yb - ya, rect.height / 90);
    final minor = Paint()..color = IX.grid..strokeWidth = 1;
    final major = Paint()..color = IX.rule..strokeWidth = 1.2;
    c.save();
    c.clipRect(rect);
    if (grid) {
      for (var k = (xa / stx * 2).ceil(); k <= (xb / stx * 2).floor(); k++) {
        final x = sx(k * stx / 2);
        c.drawLine(Offset(x, rect.top), Offset(x, rect.bottom), k.isEven ? major : minor);
      }
      for (var k = (ya / sty * 2).ceil(); k <= (yb / sty * 2).floor(); k++) {
        final y = sy(k * sty / 2);
        c.drawLine(Offset(rect.left, y), Offset(rect.right, y), k.isEven ? major : minor);
      }
    }
    c.restore();
    final ax = Paint()..color = IX.ink..strokeWidth = 2;
    final oy = (0 >= ya && 0 <= yb) ? sy(0) : rect.bottom;
    final ox = (0 >= xa && 0 <= xb) ? sx(0) : rect.left;
    c.drawLine(Offset(rect.left, oy), Offset(rect.right + 6, oy), ax);
    c.drawLine(Offset(ox, rect.bottom), Offset(ox, rect.top - 6), ax);
    _head(c, Offset(rect.right + 10, oy), 0);
    _head(c, Offset(ox, rect.top - 10), -math.pi / 2);
    for (var k = (xa / stx).ceil(); k <= (xb / stx).floor(); k++) {
      final v = k * stx;
      if (k == 0 && ox == sx(0)) continue;
      final x = sx(v);
      c.drawLine(Offset(x, oy - 5), Offset(x, oy + 5), ax..strokeWidth = 1.5);
      final s = xTick?.call(v) ?? (piTicks ? piFrac(v) : fmtT(v, _dp(stx)));
      IxPaint.label(c, s, Offset(x, oy + 8), size: 15, color: IX.inkSoft, align: Alignment.topCenter);
    }
    if (yTicks) {
      for (var k = (ya / sty).ceil(); k <= (yb / sty).floor(); k++) {
        final v = k * sty;
        if (k == 0 && oy == sy(0)) continue;
        final y = sy(v);
        c.drawLine(Offset(ox - 5, y), Offset(ox + 5, y), ax..strokeWidth = 1.5);
        IxPaint.label(c, yTick?.call(v) ?? fmtT(v, _dp(sty)), Offset(ox - 9, y), size: 15, color: IX.inkSoft, align: Alignment.centerRight);
      }
    }
    if (ox == sx(0) && oy == sy(0)) IxPaint.label(c, 'O', Offset(ox - 8, oy + 6), size: 15, color: IX.inkSoft, align: Alignment.topRight);
    IxPaint.label(c, xLabel, Offset(rect.right + 4, oy - 12), size: 20, color: IX.ink, w: FontWeight.w600, align: Alignment.bottomRight);
    IxPaint.label(c, yLabel, Offset(ox + 14, rect.top - 8), size: 20, color: IX.ink, w: FontWeight.w600, align: Alignment.centerLeft);
  }

  static int _dp(double st) => st >= 1 ? 0 : st >= 0.1 ? 1 : st >= 0.01 ? 2 : 3;

  void _head(Canvas c, Offset at, double ang) {
    final p = Path()
      ..moveTo(at.dx, at.dy)
      ..lineTo(at.dx - 12 * math.cos(ang) + 6 * math.sin(ang), at.dy - 12 * math.sin(ang) - 6 * math.cos(ang))
      ..lineTo(at.dx - 12 * math.cos(ang) - 6 * math.sin(ang), at.dy - 12 * math.sin(ang) + 6 * math.cos(ang))
      ..close();
    c.drawPath(p, Paint()..color = IX.ink);
  }

  /// The graph of [f], broken at gaps and vertical asymptotes.
  Path curvePath(double Function(double) f, {double? from, double? to, double stepPx = 1.5}) {
    final path = Path();
    final a = math.max(from ?? xa, xa), b = math.min(to ?? xb, xb);
    if (b <= a) return path;
    final lim = (yb - ya) * 4;
    var started = false;
    double? prev;
    final n = ((sx(b) - sx(a)) / stepPx).ceil().clamp(2, 4000);
    for (var k = 0; k <= n; k++) {
      final x = a + (b - a) * k / n;
      final y = f(x);
      if (y.isNaN || y.isInfinite || y < ya - lim || y > yb + lim || (prev != null && (y - prev).abs() > (yb - ya) * 1.5)) {
        started = false;
        prev = y.isFinite ? y : null;
        continue;
      }
      final q = p(x, y.clamp(ya - lim, yb + lim));
      started ? path.lineTo(q.dx, q.dy) : path.moveTo(q.dx, q.dy);
      started = true;
      prev = y;
    }
    return path;
  }

  void curve(Canvas c, double Function(double) f, Color color, {double width = 4, double? from, double? to, bool dashed = false}) {
    c.save();
    c.clipRect(rect.inflate(2));
    final paint = Paint()..color = color..style = PaintingStyle.stroke..strokeWidth = width..strokeJoin = StrokeJoin.round..strokeCap = StrokeCap.round;
    final path = curvePath(f, from: from, to: to);
    if (dashed) {
      for (final m in path.computeMetrics()) {
        for (var d = 0.0; d < m.length; d += 18) {
          c.drawPath(m.extractPath(d, math.min(d + 10, m.length)), paint);
        }
      }
    } else {
      c.drawPath(path, paint);
    }
    c.restore();
  }

  /// Fills between [f] and [g] (or the x-axis) from [a] to [b].
  void fillBetween(Canvas c, double Function(double) f, double Function(double)? g, double a, double b, Color color) {
    if (b < a) {
      final t = a;
      a = b;
      b = t;
    }
    a = math.max(a, xa - 1);
    b = math.min(b, xb + 1);
    if (b <= a) return;
    const n = 300;
    double clampY(double y) => y.isFinite ? y.clamp(ya - 2, yb + 2).toDouble() : 0.0;
    final path = Path();
    for (var k = 0; k <= n; k++) {
      final x = a + (b - a) * k / n;
      final q = p(x, clampY(f(x)));
      k == 0 ? path.moveTo(q.dx, q.dy) : path.lineTo(q.dx, q.dy);
    }
    for (var k = n; k >= 0; k--) {
      final x = a + (b - a) * k / n;
      final q = p(x, g == null ? 0 : clampY(g(x)));
      path.lineTo(q.dx, q.dy);
    }
    path.close();
    c.save();
    c.clipRect(rect);
    c.drawPath(path, Paint()..color = color);
    c.restore();
  }

  bool contains(double x, double y) => x >= xa && x <= xb && y >= ya && y <= yb;
}

// ─────────────────────────────────────────────────────────────────────────────
// Small painting helpers.
// ─────────────────────────────────────────────────────────────────────────────

abstract final class MPaint {
  /// A solid point with a white ring.
  static void dot(Canvas c, Offset at, Color color, {double r = 8}) {
    c.drawCircle(at, r + 2.5, Paint()..color = Colors.white);
    c.drawCircle(at, r, Paint()..color = color);
  }

  /// An open point: the value is excluded.
  static void hole(Canvas c, Offset at, Color color, {double r = 8}) {
    c.drawCircle(at, r, Paint()..color = Colors.white);
    c.drawCircle(at, r, Paint()..color = color..style = PaintingStyle.stroke..strokeWidth = 3);
  }

  static Paint stroke(Color color, [double w = 3]) => Paint()..color = color..style = PaintingStyle.stroke..strokeWidth = w..strokeCap = StrokeCap.round..strokeJoin = StrokeJoin.round;
  static Paint fill(Color color, [double a = 1]) => Paint()..color = color.withValues(alpha: a);

  static void dashedPath(Canvas c, Path path, Paint p, {double dash = 10, double gap = 8}) {
    for (final m in path.computeMetrics()) {
      for (var d = 0.0; d < m.length; d += dash + gap) {
        c.drawPath(m.extractPath(d, math.min(d + dash, m.length)), p);
      }
    }
  }

  /// An angle arc at [o] from angle [a0] sweeping [sweep] (radians, maths orientation: y up).
  static void arc(Canvas c, Offset o, double r, double a0, double sweep, Color color, {double w = 3}) {
    c.drawArc(Rect.fromCircle(center: o, radius: r), -a0, -sweep, false, stroke(color, w));
  }

  /// A legend row of colour swatches and labels, top-left of [at].
  static double legend(Canvas c, Offset at, List<(Color, String)> items, {double size = 18, bool dashedLast = false}) {
    var y = at.dy;
    var w = 0.0;
    final tps = [for (final (_, s) in items) TextPainter(text: TextSpan(text: s, style: IX.text(size, w: FontWeight.w500)), textDirection: TextDirection.ltr)..layout()];
    for (final tp in tps) {
      w = math.max(w, tp.width);
    }
    final h = items.length * (size + 14) + 14;
    c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(at.dx, at.dy, w + 70, h), const Radius.circular(12)), Paint()..color = const Color(0xF2FFFFFF));
    c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(at.dx, at.dy, w + 70, h), const Radius.circular(12)), stroke(IX.rule, 1.2));
    y += 14;
    for (var i = 0; i < items.length; i++) {
      final cy = y + (size + 4) / 2;
      c.drawLine(Offset(at.dx + 16, cy), Offset(at.dx + 46, cy), stroke(items[i].$1, 4.5));
      tps[i].paint(c, Offset(at.dx + 56, y + 1));
      y += size + 14;
    }
    return h;
  }

  /// A note block: wrapped text on a soft card, used for captions on the stage.
  static void note(Canvas c, String s, Rect box, {double size = 19, Color color = IX.inkSoft}) {
    final tp = TextPainter(text: TextSpan(text: s, style: IX.text(size, c: color, height: 1.3)), textDirection: TextDirection.ltr, maxLines: 3, ellipsis: '…')..layout(maxWidth: box.width - 36);
    final r = Rect.fromLTWH(box.left, box.bottom - tp.height - 24, tp.width + 36, tp.height + 24);
    c.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(12)), Paint()..color = const Color(0xF5F3F6FB));
    tp.paint(c, r.topLeft + const Offset(18, 12));
  }

  /// A matrix with square brackets. Returns its size.
  static Size matrix(Canvas c, Offset topLeft, List<List<String>> rows, {double size = 24, Color color = IX.ink, List<List<Color?>>? cellColors, double cellW = 0}) {
    final tps = [for (final r in rows) [for (final s in r) TextPainter(text: TextSpan(text: s, style: IX.text(size, w: FontWeight.w600, c: color)), textDirection: TextDirection.ltr)..layout()]];
    final cols = rows.isEmpty ? 0 : rows.map((r) => r.length).reduce(math.max);
    final cw = List<double>.filled(cols, cellW);
    for (final r in tps) {
      for (var j = 0; j < r.length; j++) {
        cw[j] = math.max(cw[j], r[j].width);
      }
    }
    final rh = size * 1.55;
    const pad = 16.0, gap = 22.0;
    final w = cw.fold<double>(0, (s, v) => s + v) + gap * (cols - 1) + pad * 2;
    final h = rh * rows.length + 8;
    var y = topLeft.dy + 4;
    for (var i = 0; i < tps.length; i++) {
      var x = topLeft.dx + pad;
      for (var j = 0; j < tps[i].length; j++) {
        final cc = cellColors?[i][j];
        if (cc != null) c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(x - 8, y + 1, cw[j] + 16, rh - 2), const Radius.circular(8)), Paint()..color = cc);
        tps[i][j].paint(c, Offset(x + (cw[j] - tps[i][j].width) / 2, y + (rh - tps[i][j].height) / 2));
        x += cw[j] + gap;
      }
      y += rh;
    }
    final br = stroke(color, 2.5)..strokeCap = StrokeCap.square;
    final l = topLeft.dx, r = topLeft.dx + w, t = topLeft.dy, b = topLeft.dy + h;
    c.drawPath(Path()..moveTo(l + 9, t)..lineTo(l, t)..lineTo(l, b)..lineTo(l + 9, b), br);
    c.drawPath(Path()..moveTo(r - 9, t)..lineTo(r, t)..lineTo(r, b)..lineTo(r - 9, b), br);
    return Size(w, h);
  }

  static Size measure(String s, double size, {FontWeight w = FontWeight.w500}) {
    final tp = TextPainter(text: TextSpan(text: s, style: IX.text(size, w: w)), textDirection: TextDirection.ltr)..layout();
    return tp.size;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3D: a turntable view with z up, x towards the viewer's lower left, y to the right.
// ─────────────────────────────────────────────────────────────────────────────

class V3 {
  const V3(this.x, this.y, this.z);
  final double x, y, z;
  V3 operator +(V3 o) => V3(x + o.x, y + o.y, z + o.z);
  V3 operator -(V3 o) => V3(x - o.x, y - o.y, z - o.z);
  V3 operator *(double k) => V3(x * k, y * k, z * k);
  double dot(V3 o) => x * o.x + y * o.y + z * o.z;
  V3 cross(V3 o) => V3(y * o.z - z * o.y, z * o.x - x * o.z, x * o.y - y * o.x);
  double get len => math.sqrt(x * x + y * y + z * z);
  V3 get unit => len == 0 ? this : this * (1 / len);
  static V3 from(Object? o, [V3 f = const V3(0, 0, 0)]) {
    if (o is List && o.length >= 2) return V3((o[0] as num).toDouble(), (o[1] as num).toDouble(), o.length > 2 ? (o[2] as num).toDouble() : 0);
    return f;
  }

  String show([int d = 2]) => '(${fmtT(x, d)}, ${fmtT(y, d)}, ${fmtT(z, d)})';
}

class Proj3 {
  Proj3(this.center, this.scale, this.yaw, this.pitch);
  final Offset center;
  final double scale, yaw, pitch;

  Offset p(V3 v) {
    final r = V3(-math.sin(yaw), math.cos(yaw), 0);
    final up = V3(-math.sin(pitch) * math.cos(yaw), -math.sin(pitch) * math.sin(yaw), math.cos(pitch));
    return center + Offset(v.dot(r), -v.dot(up)) * scale;
  }

  /// Distance towards the viewer (larger is nearer).
  double depth(V3 v) => v.dot(V3(math.cos(pitch) * math.cos(yaw), math.cos(pitch) * math.sin(yaw), math.sin(pitch)));

  void axes(Canvas c, double len, {List<String> names = const ['x', 'y', 'z'], bool negative = true}) {
    final dirs = [const V3(1, 0, 0), const V3(0, 1, 0), const V3(0, 0, 1)];
    for (var i = 0; i < 3; i++) {
      if (negative) IxPaint.dashed(c, p(const V3(0, 0, 0)), p(dirs[i] * -len * 0.75), MPaint.stroke(IX.steel, 1.6), dash: 7, gap: 6);
      IxPaint.arrow(c, p(const V3(0, 0, 0)), p(dirs[i] * len), IX.ink, width: 2.4, head: 16);
      IxPaint.label(c, names[i], p(dirs[i] * (len + 0.45)), size: 22, color: IX.ink, w: FontWeight.w600);
      for (var t = 1; t < len; t++) {
        final a = p(dirs[i] * t.toDouble());
        c.drawCircle(a, 2.6, Paint()..color = IX.ink);
      }
    }
    IxPaint.label(c, 'O', p(const V3(0, 0, 0)) + const Offset(-14, 12), size: 17, color: IX.inkSoft);
  }

  void line(Canvas c, V3 a, V3 b, Color color, {double w = 3, bool dashed = false}) {
    final pa = MPaint.stroke(color, w);
    dashed ? IxPaint.dashed(c, p(a), p(b), pa, dash: 8, gap: 7) : c.drawLine(p(a), p(b), pa);
  }

  void poly(Canvas c, List<V3> pts, Color fill, {Color? edge}) {
    if (pts.length < 3) return;
    final path = Path()..moveTo(p(pts[0]).dx, p(pts[0]).dy);
    for (final q in pts.skip(1)) {
      path.lineTo(p(q).dx, p(q).dy);
    }
    path.close();
    c.drawPath(path, Paint()..color = fill);
    if (edge != null) c.drawPath(path, MPaint.stroke(edge, 1.6));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Controls beyond the shared slider and segments.
// ─────────────────────────────────────────────────────────────────────────────

class IxToggle extends StatelessWidget {
  const IxToggle({super.key, required this.label, required this.value, required this.onChanged});
  final String label;
  final bool value;
  final ValueChanged<bool> onChanged;
  @override
  Widget build(BuildContext context) => InkWell(
    onTap: () => onChanged(!value),
    borderRadius: BorderRadius.circular(12),
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(children: [
        Expanded(child: Text(label, style: IX.text(18, w: FontWeight.w500, c: IX.inkSoft))),
        AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          width: 58,
          height: 32,
          padding: const EdgeInsets.all(3),
          alignment: value ? Alignment.centerRight : Alignment.centerLeft,
          decoration: BoxDecoration(color: value ? IX.accent : IX.rule, borderRadius: BorderRadius.circular(16)),
          child: Container(width: 26, height: 26, decoration: BoxDecoration(color: Colors.white, shape: BoxShape.circle, boxShadow: IX.lift)),
        ),
      ]),
    ),
  );
}

/// A pill button for a one-shot action (Step, Reset, Swap).
class IxButton extends StatelessWidget {
  const IxButton(this.label, {super.key, required this.onTap, this.icon});
  final String label;
  final VoidCallback onTap;
  final IconData? icon;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 6, bottom: 6),
    child: Material(
      color: IX.accentSoft,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 13),
          child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            if (icon != null) ...[Icon(icon, color: IX.accent, size: 22), const SizedBox(width: 8)],
            Text(label, style: IX.text(18, w: FontWeight.w600, c: IX.accent)),
          ]),
        ),
      ),
    ),
  );
}

/// Segments that wrap onto a second row when there are many options.
Widget segs<T>(String label, Map<T, String> options, T value, ValueChanged<T> on) {
  if (options.length <= 4) return IxSegments<T>(label: label, options: options, value: value, onChanged: on);
  final keys = options.keys.toList();
  final half = (keys.length / 2).ceil();
  return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
    IxSegments<T>(label: label, options: {for (final k in keys.take(half)) k: options[k]!}, value: value, onChanged: on),
    Transform.translate(offset: const Offset(0, -6), child: IxSegments<T>(label: '', options: {for (final k in keys.skip(half)) k: options[k]!}, value: value, onChanged: on)),
  ]);
}

/// The standard subtitle prefix.
const kMaths = 'PUC Mathematics';
const kStats = 'PUC Statistics';
