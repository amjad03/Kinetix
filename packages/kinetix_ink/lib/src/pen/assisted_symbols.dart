import 'dart:math' as math;

import 'ink_model.dart' show TimedPoint;
import 'symbol_glyphs.dart';
import 'symbol_recognizer.dart';

/// The bundled symbol recogniser with a handwriting model's readings put first: laid-out maths
/// (a fraction, a power, a subscript) keeps the board's own layout, and each symbol in it is read
/// by the model, which reads handwriting far better than templates do.
///
/// [readMathInk] is synchronous and the model is not, so it takes two passes: the first records
/// the symbols it was [asked] about, the AI pen reads them with the model and gives the readings
/// as [hint]s, and the second pass lays the maths out with them.
class AssistedSymbols extends SymbolRecognizer {
  AssistedSymbols(this.base) : super(templates: const []);

  final SymbolRecognizer base;

  /// The symbols (their strokes) read so far that have no hint yet.
  final List<List<GlyphStroke>> asked = [];
  final Map<String, List<String>> _hints = {};

  static String _key(List<GlyphStroke> g) => [for (final s in g) '${s.length}:${s.first.x.toStringAsFixed(1)},${s.first.y.toStringAsFixed(1)}'].join('|');

  /// The model's readings of the symbol written with [strokes], best first.
  void hint(List<GlyphStroke> strokes, List<String> readings) => _hints[_key(strokes)] = readings;

  @override
  Set<String> get symbols => base.symbols;

  @override
  List<SymbolGuess> recognize(List<GlyphStroke> strokes, {double? lineHeight, int limit = 5}) {
    final own = base.recognize(strokes, lineHeight: lineHeight, limit: limit);
    if (strokes.isEmpty || strokes.any((s) => s.isEmpty)) return own;
    final readings = _hints[_key(strokes)];
    if (readings == null) {
      asked.add(strokes);
      return own;
    }
    // A dot, a bar, = and ÷ are told by their geometry for certain (score 1).
    if (own.isNotEmpty && own.first.score >= 1) return own;
    final symbols = <String>[];
    for (final r in readings) {
      final s = mathSymbolOf(r);
      if (s != null && !symbols.contains(s)) symbols.add(s);
    }
    if (symbols.isEmpty) return own;
    final top = math.min(0.99, math.max(0.9, own.isEmpty ? 0 : own.first.score + 0.05));
    return [
      for (final (i, s) in symbols.indexed) SymbolGuess(s, top - i * 0.05),
      for (final g in own)
        if (!symbols.contains(g.symbol)) SymbolGuess(g.symbol, math.min(g.score, top - symbols.length * 0.05)),
    ].take(limit).toList();
  }
}

/// A handwriting model's reading of one maths symbol as the symbol the maths layout uses, or
/// null when it is not one symbol.
String? mathSymbolOf(String reading) {
  final r = reading.trim();
  const map = {
    '−': '-',
    '–': '-',
    '—': '-',
    '_': '-',
    '*': '×',
    'X': 'x',
    'O': '0',
    '<=': '≤',
    '>=': '≥',
    '/': '÷',
    '{': '(',
    '}': ')',
  };
  final m = map[r] ?? r;
  if (m.runes.length != 1) return null;
  return m;
}

/// The strokes of one symbol as timed ink (a model needs times; a symbol is written quickly).
List<List<TimedPoint>> timedGlyph(List<GlyphStroke> strokes) {
  var t = 0;
  return [
    for (final s in strokes)
      [
        for (final (i, p) in s.indexed) (x: p.x, y: p.y, t: (t += i == 0 ? 120 : 8)),
      ],
  ];
}
