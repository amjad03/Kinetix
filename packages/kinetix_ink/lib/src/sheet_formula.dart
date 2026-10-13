import 'dart:math' as math;

import 'ink_models.dart';

// The spreadsheet's arithmetic: cell references, formulas and Indian number formats. Pure
// Dart, so the board, its tests and the saved-board writer share one evaluator.

/// A worked-out cell: a number, words, nothing, or an error such as `#DIV/0!`.
class SheetValue {
  const SheetValue.number(double this.number) : text = null, error = null;
  const SheetValue.text(String this.text) : number = null, error = null;
  const SheetValue.error(String this.error) : number = null, text = null;
  const SheetValue.empty() : number = null, text = null, error = null;

  final double? number;
  final String? text;
  final String? error;

  bool get isEmpty => number == null && text == null && error == null;

  @override
  String toString() => error ?? text ?? (number == null ? '' : formatGeneral(number!));
}

// --- Indian number formats --------------------------------------------------------------------

/// [v] grouped the Indian way (12,34,56,789.50) with [decimals] places.
String indianGrouping(double v, {int decimals = 2}) {
  if (!v.isFinite) return v.isNaN ? '—' : (v > 0 ? '∞' : '-∞');
  final neg = v < 0;
  final fixed = v.abs().toStringAsFixed(decimals);
  final dot = fixed.indexOf('.');
  final whole = dot < 0 ? fixed : fixed.substring(0, dot);
  final frac = dot < 0 ? '' : fixed.substring(dot);
  var out = whole;
  if (whole.length > 3) {
    final head = whole.substring(0, whole.length - 3);
    final groups = <String>[];
    for (var i = head.length; i > 0; i -= 2) {
      groups.insert(0, head.substring(math.max(0, i - 2), i));
    }
    out = '${groups.join(',')},${whole.substring(whole.length - 3)}';
  }
  return '${neg ? '-' : ''}$out$frac';
}

/// Rupees with Indian grouping: ₹1,23,456.00 (and -₹500.00).
String formatInr(double v, {int decimals = 2}) {
  final s = indianGrouping(v, decimals: decimals);
  return s.startsWith('-') ? '-₹${s.substring(1)}' : '₹$s';
}

/// Rupees in lakh (₹12.35 L) or crore (₹1.23 Cr).
String formatLakh(double v) => '${formatInr(v / 1e5)} L';
String formatCrore(double v) => '${formatInr(v / 1e7)} Cr';

/// A plain number: whole numbers as they are, others to at most four places.
String formatGeneral(double v) {
  if (!v.isFinite) return indianGrouping(v);
  if (v == v.roundToDouble() && v.abs() < 1e15) return v.round().toString();
  return v.toStringAsFixed(4).replaceFirst(RegExp(r'0+$'), '').replaceFirst(RegExp(r'\.$'), '');
}

/// [v] shown in format [f].
String formatSheetNumber(double v, SheetFormat f) => switch (f) {
  SheetFormat.general => formatGeneral(v),
  SheetFormat.number => indianGrouping(v),
  SheetFormat.inr => formatInr(v),
  SheetFormat.lakh => formatLakh(v),
  SheetFormat.crore => formatCrore(v),
  SheetFormat.percent => '${formatGeneral(double.parse((v * 100).toStringAsFixed(4)))}%',
};

/// A number as typed into a cell: `1,25,000`, `₹500`, `18%`, `(2,000)` for a negative, `-3.5`.
/// Null when it is not a number.
double? parseSheetNumber(String raw) {
  var s = raw.trim().replaceAll(RegExp(r'[₹,\s]'), '');
  if (s.isEmpty) return null;
  var sign = 1.0;
  if (s.startsWith('(') && s.endsWith(')')) {
    sign = -1;
    s = s.substring(1, s.length - 1);
  }
  var scale = 1.0;
  if (s.endsWith('%')) {
    scale = 0.01;
    s = s.substring(0, s.length - 1);
  }
  if (!RegExp(r'^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$').hasMatch(s)) return null;
  return double.parse(s) * sign * scale;
}

// --- References -------------------------------------------------------------------------------

/// The letters of column [c] (0 → A, 26 → AA).
String columnName(int c) {
  var n = c + 1;
  var out = '';
  while (n > 0) {
    final m = (n - 1) % 26;
    out = String.fromCharCode(65 + m) + out;
    n = (n - 1) ~/ 26;
  }
  return out;
}

/// `B3` → (row 2, column 1); null when it is not a reference. `$` marks are allowed.
(int, int)? parseCellRef(String ref) {
  final m = RegExp(r'^\$?([A-Za-z]{1,2})\$?(\d{1,4})$').firstMatch(ref.trim());
  if (m == null) return null;
  var c = 0;
  for (final ch in m[1]!.toUpperCase().codeUnits) {
    c = c * 26 + (ch - 64);
  }
  final r = int.parse(m[2]!);
  if (r < 1) return null;
  return (r - 1, c - 1);
}

/// The cells of a range such as `A2:A6` (or a single cell), row by row; null when malformed.
List<(int, int)>? parseRange(String range) {
  final parts = range.split(':');
  final a = parseCellRef(parts.first);
  final b = parts.length == 2 ? parseCellRef(parts[1]) : (parts.length == 1 ? a : null);
  if (a == null || b == null) return null;
  return [
    for (var r = math.min(a.$1, b.$1); r <= math.max(a.$1, b.$1); r++)
      for (var c = math.min(a.$2, b.$2); c <= math.max(a.$2, b.$2); c++) (r, c),
  ];
}

// --- Finance functions ---------------------------------------------------------------------------

/// Net present value at [rate] a period of [values], the first at the end of period 1.
double sheetNpv(double rate, List<double> values) {
  var v = 0.0;
  for (var t = 0; t < values.length; t++) {
    v += values[t] / math.pow(1 + rate, t + 1);
  }
  return v;
}

/// The rate a period at which [values] (the first at time 0) have a nil NPV: Newton's method
/// from [guess], then bisection between −99% and 1000%. Null when there is none (no change of
/// sign in the cash flows, or no root found).
double? sheetIrr(List<double> values, {double guess = 0.1}) {
  if (values.length < 2 || !values.any((v) => v > 0) || !values.any((v) => v < 0)) return null;
  double f(double r) {
    var s = 0.0;
    for (var t = 0; t < values.length; t++) {
      s += values[t] / math.pow(1 + r, t);
    }
    return s;
  }

  double df(double r) {
    var s = 0.0;
    for (var t = 1; t < values.length; t++) {
      s -= t * values[t] / math.pow(1 + r, t + 1);
    }
    return s;
  }

  var r = guess;
  for (var i = 0; i < 60; i++) {
    final d = df(r);
    if (d == 0 || !d.isFinite) break;
    final next = r - f(r) / d;
    if (!next.isFinite || next <= -1) break;
    if ((next - r).abs() < 1e-12) return next;
    r = next;
  }
  if (r > -1 && f(r).abs() < 1e-7) return r;
  var lo = -0.99, hi = 10.0;
  if (f(lo).sign == f(hi).sign) return null;
  for (var i = 0; i < 300; i++) {
    final mid = (lo + hi) / 2;
    if (f(lo).sign == f(mid).sign) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

/// The payment a period on a loan of [pv] over [nper] periods at [rate] (negative: paid out).
/// [type] 1 pays at the start of each period.
double sheetPmt(double rate, double nper, double pv, {double fv = 0, double type = 0}) {
  if (nper == 0) throw const _SheetError('#NUM!');
  if (rate == 0) return -(pv + fv) / nper;
  final f = math.pow(1 + rate, nper);
  return -(rate * (fv + pv * f)) / ((1 + rate * type) * (f - 1));
}

/// The future value after [nper] payments of [pmt] at [rate], starting from [pv].
double sheetFv(double rate, double nper, double pmt, {double pv = 0, double type = 0}) {
  if (rate == 0) return -(pv + pmt * nper);
  final f = math.pow(1 + rate, nper);
  return -(pv * f + pmt * (1 + rate * type) * (f - 1) / rate);
}

/// The present value of [nper] payments of [pmt] at [rate], plus [fv] at the end.
double sheetPv(double rate, double nper, double pmt, {double fv = 0, double type = 0}) {
  if (rate == 0) return -(fv + pmt * nper);
  final f = math.pow(1 + rate, nper);
  return -(fv + pmt * (1 + rate * type) * (f - 1) / rate) / f;
}

// --- Copying formulas ---------------------------------------------------------------------------

/// What was typed in a cell, moved [dr] rows and [dc] columns as a fill handle copies it:
/// relative references shift (B2 → B3), `$`-fixed parts stay; a reference pushed off the top
/// or left becomes #REF!. Words and numbers are copied as they are.
String shiftFormula(String raw, int dr, int dc) {
  if (!raw.trimLeft().startsWith('=')) return raw;
  return raw.replaceAllMapped(RegExp(r'(?<![A-Za-z0-9_$])(\$?)([A-Za-z]{1,2})(\$?)(\d{1,4})(?![A-Za-z0-9_(])'), (m) {
    final ref = parseCellRef(m[0]!);
    if (ref == null) return m[0]!;
    final r = m[3]!.isEmpty ? ref.$1 + dr : ref.$1, c = m[1]!.isEmpty ? ref.$2 + dc : ref.$2;
    if (r < 0 || c < 0) return '#REF!';
    return '${m[1]}${columnName(c)}${m[3]}${r + 1}';
  });
}

/// [s] with the cell [r], [c] copied (as [shiftFormula] moves it) into each of [targets].
SheetElement fillSheetCells(SheetElement s, int r, int c, Iterable<(int, int)> targets) {
  final src = s.cell(r, c);
  final own = s.cellFormats[r * s.cols + c];
  final next = List.of(s.cells);
  final fmts = Map.of(s.cellFormats);
  for (final (tr, tc) in targets) {
    if (tr < 0 || tc < 0 || tr >= s.rows || tc >= s.cols || (tr == r && tc == c)) continue;
    next[tr * s.cols + tc] = shiftFormula(src, tr - r, tc - c);
    own == null ? fmts.remove(tr * s.cols + tc) : fmts[tr * s.cols + tc] = own;
  }
  return s.copyWith(cells: next, cellFormats: fmts);
}

// --- Evaluation -------------------------------------------------------------------------------

final _cache = Expando<List<SheetValue>>('sheetValues');

/// Every cell of [s] worked out, row by row. Formulas start with `=` and may use + − × ÷ ^,
/// %, brackets, comparisons (= <> < > <= >=), cell references (B3, \$B\$3), ranges (B2:B6) and
/// SUM, AVERAGE, MIN, MAX, COUNT, ROUND, ABS, SQRT, IF, AND, OR, NOT, POWER and the finance
/// functions NPV, IRR, PMT, FV, PV (as a spreadsheet works them: rates per period, money paid
/// out negative). Errors: #NUM! (no IRR), #REF! (outside the sheet),
/// #DIV/0!, #CYCLE! (a formula that needs itself), #VALUE! (words in a sum), #ERR! (cannot read).
List<SheetValue> evaluateSheet(SheetElement s) => _cache[s] ??= _Evaluator(s).all();

/// The cell [r], [c] of [s] as shown on the board (formatted by its column).
String displaySheetCell(SheetElement s, int r, int c) {
  final v = evaluateSheet(s)[r * s.cols + c];
  if (v.number != null) return formatSheetNumber(v.number!, s.formatAt(r, c));
  return v.toString();
}

/// The labels and numbers of [s]'s chart (non-numbers are skipped).
({List<String> labels, List<double> values}) sheetChartData(SheetElement s) {
  final ch = s.chart;
  if (ch == null) return (labels: const [], values: const []);
  final vals = evaluateSheet(s);
  final lr = parseRange(ch.labels) ?? const [];
  final vr = parseRange(ch.values) ?? const [];
  final labels = <String>[], values = <double>[];
  for (var i = 0; i < vr.length; i++) {
    final (r, c) = vr[i];
    if (r >= s.rows || c >= s.cols) continue;
    final n = vals[r * s.cols + c].number;
    if (n == null) continue;
    final l = i < lr.length && lr[i].$1 < s.rows && lr[i].$2 < s.cols ? vals[lr[i].$1 * s.cols + lr[i].$2].toString() : '${i + 1}';
    labels.add(l);
    values.add(n);
  }
  return (labels: labels, values: values);
}

class _SheetError implements Exception {
  const _SheetError(this.code);
  final String code;
}

class _Evaluator {
  _Evaluator(this.s) : _done = List<SheetValue?>.filled(s.rows * s.cols, null);
  final SheetElement s;
  final List<SheetValue?> _done;
  final _busy = <int>{};

  List<SheetValue> all() => [for (var i = 0; i < _done.length; i++) value(i ~/ s.cols, i % s.cols)];

  SheetValue value(int r, int c) {
    if (r < 0 || c < 0 || r >= s.rows || c >= s.cols) return const SheetValue.error('#REF!');
    final i = r * s.cols + c;
    final known = _done[i];
    if (known != null) return known;
    if (_busy.contains(i)) return const SheetValue.error('#CYCLE!');
    _busy.add(i);
    final out = _work(s.cells[i]);
    _busy.remove(i);
    return _done[i] = out;
  }

  SheetValue _work(String raw) {
    final t = raw.trim();
    if (t.isEmpty) return const SheetValue.empty();
    if (!t.startsWith('=')) {
      final n = parseSheetNumber(t);
      return n == null ? SheetValue.text(raw) : SheetValue.number(n);
    }
    try {
      final p = _Parser(t.substring(1), this);
      final v = p.parse();
      return v.isFinite ? SheetValue.number(v) : const SheetValue.error('#DIV/0!');
    } on _SheetError catch (e) {
      return SheetValue.error(e.code);
    } on Object {
      return const SheetValue.error('#ERR!');
    }
  }
}

/// A recursive-descent reader that works the formula out as it reads.
class _Parser {
  _Parser(this.src, this.ev);
  final String src;
  final _Evaluator ev;
  int i = 0;

  double parse() {
    final v = _compare();
    _ws();
    if (i < src.length) throw const _SheetError('#ERR!');
    return v;
  }

  void _ws() {
    while (i < src.length && src[i] == ' ') {
      i++;
    }
  }

  bool _eat(String t) {
    _ws();
    if (src.startsWith(t, i)) {
      i += t.length;
      return true;
    }
    return false;
  }

  double _compare() {
    final a = _sum();
    for (final op in ['<=', '>=', '<>', '=', '<', '>']) {
      if (_eat(op)) {
        final b = _sum();
        final ok = switch (op) {
          '<=' => a <= b,
          '>=' => a >= b,
          '<>' => a != b,
          '=' => (a - b).abs() < 1e-9,
          '<' => a < b,
          _ => a > b,
        };
        return ok ? 1 : 0;
      }
    }
    return a;
  }

  double _sum() {
    var v = _product();
    while (true) {
      if (_eat('+')) {
        v += _product();
      } else if (_eat('-')) {
        v -= _product();
      } else {
        return v;
      }
    }
  }

  double _product() {
    var v = _power();
    while (true) {
      if (_eat('*') || _eat('×')) {
        v *= _power();
      } else if (_eat('/') || _eat('÷')) {
        final d = _power();
        if (d == 0) throw const _SheetError('#DIV/0!');
        v /= d;
      } else {
        return v;
      }
    }
  }

  double _power() {
    final b = _unary();
    if (_eat('^')) return math.pow(b, _power()).toDouble();
    return b;
  }

  double _unary() {
    if (_eat('-')) return -_unary();
    if (_eat('+')) return _unary();
    var v = _primary();
    while (_eat('%')) {
      v /= 100;
    }
    return v;
  }

  double _primary() {
    _ws();
    if (_eat('(')) {
      final v = _compare();
      if (!_eat(')')) throw const _SheetError('#ERR!');
      return v;
    }
    final num = RegExp(r'(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?').matchAsPrefix(src, i);
    if (num != null) {
      i = num.end;
      return double.parse(num[0]!);
    }
    final word = RegExp(r'\$?[A-Za-z]+\$?\d*').matchAsPrefix(src, i);
    if (word == null) throw const _SheetError('#ERR!');
    final w = word[0]!;
    i = word.end;
    if (_eat('(')) return _function(w.toUpperCase());
    final ref = parseCellRef(w);
    if (ref == null) throw const _SheetError('#ERR!');
    return _number(ev.value(ref.$1, ref.$2));
  }

  double _number(SheetValue v) {
    if (v.error != null) throw _SheetError(v.error!);
    if (v.text != null) throw const _SheetError('#VALUE!');
    return v.number ?? 0;
  }

  /// One argument: a range (its numbers) or a value.
  List<double> _arg() {
    _ws();
    final range = RegExp(r'\$?[A-Za-z]{1,2}\$?\d{1,4}\s*:\s*\$?[A-Za-z]{1,2}\$?\d{1,4}').matchAsPrefix(src, i);
    if (range != null) {
      i = range.end;
      final cells = parseRange(range[0]!.replaceAll(' ', ''));
      if (cells == null) throw const _SheetError('#REF!');
      final out = <double>[];
      for (final (r, c) in cells) {
        final v = ev.value(r, c);
        if (v.error != null) throw _SheetError(v.error!);
        if (v.number != null) out.add(v.number!);
      }
      return out;
    }
    return [_compare()];
  }

  double _function(String name) {
    final args = <List<double>>[];
    if (!_eat(')')) {
      do {
        args.add(_arg());
      } while (_eat(','));
      if (!_eat(')')) throw const _SheetError('#ERR!');
    }
    final all = [for (final a in args) ...a];
    double one(int k) => k < args.length && args[k].isNotEmpty ? args[k].first : throw const _SheetError('#ERR!');
    switch (name) {
      case 'SUM':
        return all.fold(0.0, (a, b) => a + b);
      case 'AVERAGE' || 'AVG' || 'MEAN':
        if (all.isEmpty) throw const _SheetError('#DIV/0!');
        return all.fold(0.0, (a, b) => a + b) / all.length;
      case 'MIN':
        return all.isEmpty ? 0 : all.reduce(math.min);
      case 'MAX':
        return all.isEmpty ? 0 : all.reduce(math.max);
      case 'COUNT':
        return all.length.toDouble();
      case 'ABS':
        return one(0).abs();
      case 'SQRT':
        final v = one(0);
        if (v < 0) throw const _SheetError('#VALUE!');
        return math.sqrt(v);
      case 'ROUND':
        final p = math.pow(10, args.length > 1 ? one(1).round() : 0);
        return (one(0) * p).roundToDouble() / p;
      case 'IF':
        return one(0) != 0 ? one(1) : (args.length > 2 ? one(2) : 0);
      case 'POWER':
        return math.pow(one(0), one(1)).toDouble();
      case 'AND':
        return all.isNotEmpty && all.every((v) => v != 0) ? 1 : 0;
      case 'OR':
        return all.any((v) => v != 0) ? 1 : 0;
      case 'NOT':
        return one(0) == 0 ? 1 : 0;
      case 'NPV':
        // NPV(rate, value1, …): every value a period later, the first at the end of period 1.
        return sheetNpv(one(0), [for (final a in args.skip(1)) ...a]);
      case 'IRR':
        final irr = sheetIrr(args.isEmpty ? const [] : args[0], guess: args.length > 1 ? one(1) : 0.1);
        if (irr == null) throw const _SheetError('#NUM!');
        return irr;
      case 'PMT':
        return sheetPmt(one(0), one(1), one(2), fv: args.length > 3 ? one(3) : 0, type: args.length > 4 ? one(4) : 0);
      case 'FV':
        return sheetFv(one(0), one(1), one(2), pv: args.length > 3 ? one(3) : 0, type: args.length > 4 ? one(4) : 0);
      case 'PV':
        return sheetPv(one(0), one(1), one(2), fv: args.length > 3 ? one(3) : 0, type: args.length > 4 ? one(4) : 0);
    }
    throw const _SheetError('#ERR!');
  }
}
