import 'package:flutter/services.dart' show rootBundle;

import 'language_data.dart';

/// One meaning of a word: its part of speech, the definition, an example and synonyms.
class DictSense {
  const DictSense({required this.pos, required this.gloss, this.example = '', this.synonyms = const []});
  final String pos, gloss, example;
  final List<String> synonyms;
}

/// A dictionary word with its meanings and, where the list has them, Hindi and Kannada.
class DictEntry {
  const DictEntry({required this.word, required this.senses, this.hi, this.kn});
  final String word;
  final List<DictSense> senses;
  final String? hi, kn;
}

/// The board's offline dictionary: about nine thousand common English words with meanings,
/// examples and synonyms from Princeton WordNet 3.0 (assets/dictionary/wordnet.tsv, WordNet
/// licence, see assets/dictionary/LICENSE.txt), and Hindi and Kannada for the commonest words
/// (assets/dictionary/hi_kn.tsv plus the language kit's word list). Works with no network.
class OfflineDictionary {
  OfflineDictionary._(this.entries, this._byWord, this._native);

  final List<DictEntry> entries;
  final Map<String, DictEntry> _byWord;
  final Map<String, String> _native;

  static OfflineDictionary? _loaded;

  /// Tests put a small dictionary here.
  static void override(OfflineDictionary? d) => _loaded = d;

  static Future<OfflineDictionary> load() async {
    if (_loaded != null) return _loaded!;
    final wn = await rootBundle.loadString('assets/dictionary/wordnet.tsv');
    final tr = await rootBundle.loadString('assets/dictionary/hi_kn.tsv');
    return _loaded = parse(wn, tr);
  }

  /// Builds the dictionary from the two tab-separated files.
  static OfflineDictionary parse(String wordnet, String hiKn) {
    final tr = <String, (String, String)>{for (final w in basicWords) w.en: (w.hi, w.kn)};
    for (final line in hiKn.split('\n')) {
      final p = line.split('\t');
      if (p.length >= 3) tr[p[0].trim()] = (p[1].trim(), p[2].trim());
    }
    final entries = <DictEntry>[];
    final seen = <String>{};
    for (final line in wordnet.split('\n')) {
      final cols = line.split('\t');
      if (cols.length < 2) continue;
      final senses = <DictSense>[];
      for (final c in cols.skip(1)) {
        final f = c.split('|');
        if (f.length < 2) continue;
        senses.add(DictSense(pos: f[0], gloss: f[1].trim(), example: f.length > 2 ? _clean(f[2]) : '', synonyms: f.length > 3 && f[3].isNotEmpty ? f[3].split(',') : const []));
      }
      if (senses.isEmpty) continue;
      final w = cols[0];
      seen.add(w);
      entries.add(DictEntry(word: w, senses: senses, hi: tr[w]?.$1, kn: tr[w]?.$2));
    }
    // Words of the language kit's list that WordNet's list leaves out.
    for (final w in basicWords) {
      if (seen.contains(w.en)) continue;
      entries.add(
        DictEntry(
          word: w.en,
          senses: [DictSense(pos: w.pos, gloss: w.meaning, example: w.example)],
          hi: w.hi,
          kn: w.kn,
        ),
      );
    }
    entries.sort((a, b) => a.word.compareTo(b.word));
    final native = <String, String>{};
    for (final e in entries) {
      if (e.hi != null) native[e.hi!.toLowerCase()] = e.word;
      if (e.kn != null) native[e.kn!.toLowerCase()] = e.word;
    }
    return OfflineDictionary._(entries, {for (final e in entries) e.word: e}, native);
  }

  /// Quotes and attributions WordNet leaves on some examples ('... "- H.L.Menchken').
  static String _clean(String s) {
    final i = s.indexOf('"');
    return (i > 0 ? s.substring(0, i) : s).trim();
  }

  DictEntry? lookup(String word) => _byWord[word.trim().toLowerCase()];

  /// Words for [query] in English, Hindi or Kannada: the word itself, then words that start
  /// with it, then words whose meaning mentions it.
  List<DictEntry> search(String query, {int limit = 40}) {
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return const [];
    final out = <DictEntry>[];
    final seen = <String>{};
    void add(DictEntry? e) {
      if (e != null && out.length < limit && seen.add(e.word)) out.add(e);
    }

    add(_byWord[q]);
    add(_byWord[_native[q]]);
    for (final e in entries) {
      if (e.word.startsWith(q)) add(e);
    }
    for (final e in entries) {
      if ((e.hi?.contains(q) ?? false) || (e.kn?.contains(q) ?? false)) add(e);
    }
    if (q.length >= 3) {
      for (final e in entries) {
        if (e.word.contains(q) || e.senses.any((s) => s.synonyms.contains(q))) add(e);
      }
    }
    return out;
  }
}
