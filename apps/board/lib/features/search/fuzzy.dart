/// Typo-tolerant matching for the board's searches, in any script (English, Hindi, Kannada):
/// pure Dart, offline, fast enough to run on every keystroke over a few thousand items.
library;

final _separators = RegExp(r'[^\p{L}\p{M}\p{N}]+', unicode: true);

/// Lower case, joiners dropped, punctuation turned into spaces, spaces collapsed.
String normalizeSearch(String s) => s.toLowerCase().replaceAll('‌', '').replaceAll('‍', '').replaceAll(_separators, ' ').trim();

/// The words of [s], normalised.
List<String> searchWords(String s) {
  final n = normalizeSearch(s);
  return n.isEmpty ? const [] : n.split(' ');
}

/// Edit distance with adjacent swaps (optimal string alignment), giving up above [max].
int editDistance(String a, String b, {int max = 3}) {
  if ((a.length - b.length).abs() > max) return max + 1;
  if (a == b) return 0;
  final n = a.length, m = b.length;
  var prev2 = List<int>.filled(m + 1, 0);
  var prev = List<int>.generate(m + 1, (j) => j);
  var cur = List<int>.filled(m + 1, 0);
  for (var i = 1; i <= n; i++) {
    cur[0] = i;
    var rowMin = cur[0];
    for (var j = 1; j <= m; j++) {
      final cost = a.codeUnitAt(i - 1) == b.codeUnitAt(j - 1) ? 0 : 1;
      var v = prev[j - 1] + cost;
      if (prev[j] + 1 < v) v = prev[j] + 1;
      if (cur[j - 1] + 1 < v) v = cur[j - 1] + 1;
      if (i > 1 && j > 1 && a.codeUnitAt(i - 1) == b.codeUnitAt(j - 2) && a.codeUnitAt(i - 2) == b.codeUnitAt(j - 1) && prev2[j - 2] + 1 < v) {
        v = prev2[j - 2] + 1;
      }
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    final t = prev2;
    prev2 = prev;
    prev = cur;
    cur = t;
  }
  return prev[m];
}

/// How many typos a query word of this length may have.
int allowedTypos(String word) => word.length >= 8 ? 2 : (word.length >= 4 ? 1 : 0);

/// How well one query word matches one word of the text: 0 for not at all.
double wordScore(String q, String w) {
  if (q == w) return 100;
  if (w.startsWith(q)) return 70 + 20 * q.length / w.length;
  if (q.length >= 3 && w.contains(q)) return 50;
  final typos = allowedTypos(q);
  if (typos == 0) return 0;
  final d = editDistance(q, w, max: typos);
  if (d <= typos) return 60 - 12.0 * d;
  // A typo in a word not finished yet: "photosynt" for "photosynthesis".
  if (w.length > q.length) {
    final p = editDistance(q, w.substring(0, q.length), max: typos);
    if (p <= typos) return 40 - 8.0 * p;
  }
  return 0;
}

/// A piece of searchable text and how much it counts (a title more than a keyword).
class SearchField {
  const SearchField(this.text, [this.weight = 1]);
  final String text;
  final double weight;
}

/// Prepared fields for scoring many queries against one item.
class SearchTarget {
  SearchTarget(Iterable<SearchField> fields)
      : _fields = [
          for (final f in fields)
            if (normalizeSearch(f.text).isNotEmpty) (normalizeSearch(f.text), searchWords(f.text), f.weight),
        ];

  final List<(String, List<String>, double)> _fields;

  /// How well [query] matches: every word of it must match something, typos allowed. 0 means
  /// no match. A whole field equal to, or starting with, the query counts most.
  double score(String query) {
    final q = normalizeSearch(query);
    if (q.isEmpty) return 0;
    final words = q.split(' ');
    var total = 0.0;
    for (final qw in words) {
      var best = 0.0;
      for (final (_, ws, weight) in _fields) {
        for (final w in ws) {
          final s = wordScore(qw, w) * weight;
          if (s > best) best = s;
        }
      }
      if (best == 0) return 0;
      total += best;
    }
    var phrase = 0.0;
    for (final (whole, _, weight) in _fields) {
      final p = whole == q ? 120.0 : (whole.startsWith(q) ? 60.0 : (words.length > 1 && whole.contains(q) ? 40.0 : 0.0));
      if (p * weight > phrase) phrase = p * weight;
    }
    return total / words.length + phrase;
  }
}

/// [items] whose texts (the first counting most) match [query], best first; all of them, in
/// order, with no query.
List<T> matching<T>(List<T> items, List<String> Function(T) texts, String query) {
  if (normalizeSearch(query).isEmpty) return items;
  final scored = [
    for (final i in items) (i, SearchTarget([for (final (n, t) in texts(i).indexed) SearchField(t, n == 0 ? 1 : 0.7)]).score(query)),
  ].where((e) => e.$2 > 0).toList()..sort((a, b) => b.$2.compareTo(a.$2));
  return [for (final (i, _) in scored) i];
}

/// [items] whose label matches [query], best first.
List<T> matchingLabels<T>(List<T> items, String Function(T) label, String query) => matching(items, (i) => [label(i)], query);
