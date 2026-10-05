/// DBMS normalisation on a relation given as attributes and functional dependencies:
/// closures, candidate keys, the highest normal form, a minimal cover, and decompositions into
/// 3NF (synthesis) and BCNF. Attributes are single letters or words; sets are kept sorted.
library;

typedef Attrs = Set<String>;

class Fd {
  Fd(Iterable<String> lhs, Iterable<String> rhs) : lhs = {...lhs}, rhs = {...rhs};

  final Attrs lhs;
  final Attrs rhs;

  @override
  String toString() => '${show(lhs)} → ${show(rhs)}';

  @override
  bool operator ==(Object other) => other is Fd && _same(other.lhs, lhs) && _same(other.rhs, rhs);
  @override
  int get hashCode => Object.hash(show(lhs), show(rhs));
}

bool _same(Attrs a, Attrs b) => a.length == b.length && a.containsAll(b);

/// Attributes in a stable order: "AB" for single letters, "roll, name" for words.
String show(Iterable<String> a) {
  final l = a.toList()..sort();
  return l.every((x) => x.length == 1) ? l.join() : l.join(', ');
}

/// Splits "AB" into {A, B} and, with [words] (guessed: any lower-case word), "roll, name"
/// into {roll, name}.
Attrs attrsOf(String s, {bool? words}) {
  final t = s.trim();
  if (words ?? _wordy(t)) return {for (final w in t.split(RegExp(r'[,\s]+'))) if (w.isNotEmpty) w};
  return {for (final c in t.split('')) if (c.trim().isNotEmpty && c != ',') c};
}

bool _wordy(String s) => RegExp('[a-z]{2,}').hasMatch(s);

/// "A->B, BC->D", or one per line or separated by ';' (needed when attributes are words:
/// "roll -> name, city; course -> fee"); → and -> both work.
List<Fd> parseFds(String s) => [
  for (final part in s.split(s.contains(RegExp(r'[;\n]')) ? RegExp(r'[;\n]') : RegExp(r',(?=[^,>]*(->|→))')))
    if (part.contains('->') || part.contains('→'))
      () {
        final sides = part.split(RegExp(r'->|→'));
        return Fd(attrsOf(sides[0], words: _wordy(s)), attrsOf(sides[1], words: _wordy(s)));
      }(),
];

Attrs closure(Attrs x, List<Fd> fds) {
  final c = {...x};
  var grew = true;
  while (grew) {
    grew = false;
    for (final f in fds) {
      if (c.containsAll(f.lhs) && !c.containsAll(f.rhs)) {
        c.addAll(f.rhs);
        grew = true;
      }
    }
  }
  return c;
}

/// Every minimal set of attributes whose closure is the whole relation (smallest first).
List<Attrs> candidateKeys(Attrs r, List<Fd> fds) {
  final attrs = r.toList()..sort();
  // Attributes never on a right side are in every key.
  final rhs = {for (final f in fds) ...f.rhs.difference(f.lhs)};
  final core = {for (final a in attrs) if (!rhs.contains(a)) a};
  final rest = attrs.where((a) => !core.contains(a)).toList();
  final keys = <Attrs>[];
  for (var size = 0; size <= rest.length; size++) {
    for (final combo in _combinations(rest, size)) {
      final k = {...core, ...combo};
      if (keys.any((key) => k.containsAll(key))) continue;
      if (closure(k, fds).containsAll(r)) keys.add(k);
    }
  }
  return keys;
}

Iterable<List<String>> _combinations(List<String> items, int k, [int from = 0]) sync* {
  if (k == 0) {
    yield [];
    return;
  }
  for (var i = from; i <= items.length - k; i++) {
    for (final rest in _combinations(items, k - 1, i + 1)) {
      yield [items[i], ...rest];
    }
  }
}

/// A minimal cover: single attributes on the right, no extra attributes on the left, no
/// redundant dependencies.
List<Fd> minimalCover(List<Fd> fds) {
  var g = <Fd>[
    for (final f in fds)
      for (final a in f.rhs.difference(f.lhs)) Fd(f.lhs, {a}),
  ];
  g = [
    for (final f in g)
      () {
        var lhs = {...f.lhs};
        for (final a in f.lhs.toList()..sort()) {
          if (lhs.length > 1) {
            final smaller = {...lhs}..remove(a);
            if (closure(smaller, g).containsAll(f.rhs)) lhs = smaller;
          }
        }
        return Fd(lhs, f.rhs);
      }(),
  ];
  final unique = <Fd>[];
  for (final f in g) {
    if (!unique.contains(f)) unique.add(f);
  }
  g = unique;
  for (var i = 0; i < g.length;) {
    final others = [...g]..removeAt(i);
    if (closure(g[i].lhs, others).containsAll(g[i].rhs)) {
      g = others;
    } else {
      i++;
    }
  }
  return g;
}

enum NormalForm { first, second, third, bcnf }

class NfViolation {
  const NfViolation(this.fd, this.breaks);

  final Fd fd;

  /// The first normal form this dependency breaks.
  final NormalForm breaks;
}

/// The highest normal form of r (1NF assumed: atomic values) and the dependencies that stop it
/// going higher.
(NormalForm, List<NfViolation>) normalForm(Attrs r, List<Fd> fds) {
  final keys = candidateKeys(r, fds);
  final prime = {for (final k in keys) ...k};
  final violations = <NfViolation>[];
  for (final f in minimalCover(fds)) {
    final superkey = closure(f.lhs, fds).containsAll(r);
    if (superkey) continue;
    final a = f.rhs.first;
    if (prime.contains(a)) {
      violations.add(NfViolation(f, NormalForm.bcnf));
    } else if (keys.any((k) => k.containsAll(f.lhs) && k.length > f.lhs.length)) {
      violations.add(NfViolation(f, NormalForm.second));
    } else {
      violations.add(NfViolation(f, NormalForm.third));
    }
  }
  final worst = violations.isEmpty ? null : violations.map((v) => v.breaks.index).reduce((a, b) => a < b ? a : b);
  final nf = worst == null ? NormalForm.bcnf : NormalForm.values[worst - 1];
  return (nf, violations);
}

/// 3NF synthesis: a relation per group of the minimal cover with the same left side, plus a
/// key if none holds one; relations inside others are dropped. Lossless and keeps every
/// dependency.
List<Attrs> decompose3nf(Attrs r, List<Fd> fds) {
  final cover = minimalCover(fds);
  final byLhs = <String, Attrs>{};
  for (final f in cover) {
    (byLhs[show(f.lhs)] ??= {...f.lhs}).addAll(f.rhs);
  }
  var out = byLhs.values.toList();
  final keys = candidateKeys(r, fds);
  if (!out.any((s) => keys.any((k) => s.containsAll(k)))) out.add(keys.first);
  out = [
    for (final (i, s) in out.indexed)
      if (!out.indexed.any((o) => o.$1 != i && o.$2.containsAll(s) && (o.$2.length > s.length || o.$1 < i))) s,
  ];
  final covered = {for (final s in out) ...s};
  if (!covered.containsAll(r)) out.add(r.difference(covered));
  return out;
}

/// BCNF by repeated splitting on a violating dependency X → Y into (X ∪ Y⁺) and (R − Y⁺ ∪ X).
/// Lossless; it may lose dependencies.
List<Attrs> decomposeBcnf(Attrs r, List<Fd> fds) {
  final out = <Attrs>[];
  final todo = [r];
  while (todo.isNotEmpty) {
    final s = todo.removeLast();
    Fd? bad;
    // Dependencies that hold on s: X ⊂ s, X⁺ ∩ s.
    final xs = [
      for (var size = 1; size < s.length; size++) ..._combinations(s.toList()..sort(), size),
    ];
    for (final x in xs) {
      final cx = closure(x.toSet(), fds).intersection(s);
      if (!cx.containsAll(s) && cx.length > x.length) {
        bad = Fd(x, cx.difference(x.toSet()));
        break;
      }
    }
    if (bad == null) {
      out.add(s);
    } else {
      todo
        ..add({...bad.lhs, ...bad.rhs})
        ..add(s.difference(bad.rhs));
    }
  }
  return out;
}
