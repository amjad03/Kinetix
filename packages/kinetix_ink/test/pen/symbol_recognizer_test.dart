import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ink/src/pen/symbol_glyphs.dart';
import 'package:kinetix_ink/src/pen/symbol_recognizer.dart';

/// The held-out set: samples of every way of writing every symbol, made with another seed than
/// the templates and with stronger distortion (more slant, wobble, squash and overshoot).
List<(String, List<GlyphStroke>)> heldOut({int perSymbol = 24, int seed = 20261005, double strength = 1.4}) {
  final r = SeededRandom(seed);
  final out = <(String, List<GlyphStroke>)>[];
  for (final symbol in glyphSymbols) {
    final variants = glyphVariants.where((v) => v.symbol == symbol).toList();
    for (var i = 0; i < perSymbol; i++) {
      // Written at a realistic size: 40 units for a line of writing.
      final ink = synthesize(variants[i % variants.length], r, strength: strength);
      out.add((
        symbol,
        [
          for (final s in ink) [for (final p in s) (x: p.x * 40 + 100, y: p.y * 40 + 200)],
        ],
      ));
    }
  }
  return out;
}

void main() {
  test('the committed templates are the generator\'s output', () {
    final committed = File('lib/src/pen/symbol_templates.g.dart').readAsStringSync();
    expect(committed, symbolTemplatesSource(generateSymbolTemplates()), reason: 'Run: dart run tool/generate_symbol_templates.dart');
  });

  test('every required symbol is known', () {
    const required = [
      ...['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
      ...['+', '-', 'x', '÷', '=', '<', '>', '(', ')', '[', ']'],
      ...['y', 'z', 'a', 'b', 'c', 'n'],
      ...['α', 'β', 'θ', 'π', 'λ', 'μ', 'σ', 'Δ'],
      ...['√', '∫', 'Σ', '.', '^', '!'],
    ];
    final known = {...SymbolRecognizer.instance.symbols, '.', '-', '÷', '=', '!'};
    expect(known.containsAll(required), isTrue, reason: '${required.where((s) => !known.contains(s))}');
  });

  test('accuracy on the held-out set', () {
    final rec = SymbolRecognizer.instance;
    final set = heldOut();
    var top1 = 0, top3 = 0;
    final misses = <String, Map<String, int>>{};
    for (final (symbol, ink) in set) {
      final guesses = rec.recognize(ink, lineHeight: 40, limit: 3);
      if (guesses.isNotEmpty && guesses.first.symbol == symbol) {
        top1++;
      } else {
        final got = guesses.isEmpty ? '∅' : guesses.first.symbol;
        misses.putIfAbsent(symbol, () => {}).update(got, (n) => n + 1, ifAbsent: () => 1);
      }
      if (guesses.any((g) => g.symbol == symbol)) top3++;
    }
    final a1 = top1 / set.length, a3 = top3 / set.length;
    // Printed so the figure can be quoted (and watched when the glyphs change).
    // ignore: avoid_print
    print(
      'Symbol recogniser, held-out set of ${set.length} samples (${glyphSymbols.length} symbols): '
      'top-1 ${(a1 * 100).toStringAsFixed(1)} %, top-3 ${(a3 * 100).toStringAsFixed(1)} %. Misread: $misses',
    );
    expect(a1, greaterThanOrEqualTo(0.90));
    expect(a3, greaterThanOrEqualTo(0.97));
  });

  test('a dot is told from a symbol by the size of the writing around it', () {
    final dot = [
      [(x: 100.0, y: 200.0), (x: 102.0, y: 201.0), (x: 101.0, y: 203.0)],
    ];
    expect(SymbolRecognizer.instance.read(dot, lineHeight: 40), '.');
    // A long bar is a minus (or, by its neighbours, a fraction bar).
    expect(
      SymbolRecognizer.instance.read([
        [for (var x = 0.0; x <= 120; x += 6) (x: x, y: 50 + (x % 12 == 0 ? 1.0 : 0.0))],
      ], lineHeight: 40),
      '-',
    );
  });
}
