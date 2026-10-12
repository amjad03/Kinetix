/// What the class is writing, so the AI pen can read symbols the way the lesson uses them.
///
/// A handwriting model reads "1" as "l", ";" as "j" or ":" when it has no idea what is being
/// written. The board knows (the class context: maths, chemistry, a language, computer science), so
/// it seeds the model's pre-context with a line typical of the subject and ranks the model's
/// readings by how well they fit the subject's characters.
enum InkDomain {
  /// No subject known: readings are kept as the model gave them.
  general,

  /// Digits, operators, variables.
  maths,

  /// Formulas, subscripts, reaction arrows.
  chemistry,

  /// Letters and punctuation.
  language,

  /// Code: every ASCII symbol.
  code,
}

abstract final class InkVocabulary {
  /// A short line of writing typical of [d], used as the model's pre-context when nothing has been
  /// written before (ML Kit reads at most 20 characters of it, the end of this).
  static String seed(InkDomain d) => switch (d) {
    InkDomain.maths => '3x + 7 = 12; 45 - 6',
    InkDomain.chemistry => 'H2O + CO2 -> C6H12O6',
    InkDomain.language => 'Hello, world. He said: "Yes!"',
    InkDomain.code => 'if (a[i] != 0) { x++; }',
    InkDomain.general => '',
  };

  /// The readings of one piece of writing, cleaned and ranked for [d]. Symbols are never dropped:
  /// look-alike marks become the plain character, and the order only changes to put a reading that
  /// fits the subject first.
  static List<String> refine(List<String> readings, InkDomain d) {
    final seen = <String>{};
    final out = <String>[];
    for (final r in readings) {
      var t = _plain(r.trim());
      if (d == InkDomain.maths) t = _digitsFix(t);
      if (t.isNotEmpty && seen.add(t)) out.add(t);
    }
    if (d == InkDomain.general || out.length < 2) return out;
    // Best fit first; ties keep the model's order. The model's own first choice stays unless
    // another reading fits and it does not.
    final first = fit(out.first, d);
    if (first >= 1) return out;
    final scored = [for (final (i, t) in out.indexed) (t, fit(t, d), i)]..sort((a, b) => b.$2 != a.$2 ? b.$2.compareTo(a.$2) : a.$3.compareTo(b.$3));
    return [for (final s in scored) s.$1];
  }

  /// 1 when every character of [text] is one [d] writes, else 0.
  static double fit(String text, InkDomain d) {
    final s = text.replaceAll(' ', '');
    if (s.isEmpty) return 0;
    final ok = switch (d) {
      InkDomain.maths => RegExp(r'^[0-9+\-=×÷^()\[\]{}.,/<>≤≥%!π√∞:;a-z]*$').hasMatch(s) && !RegExp(r'[a-zA-Z]{3,}').hasMatch(s),
      InkDomain.chemistry => RegExp(r'^([A-Z][a-z]?\d*|\d|[()\[\]+\-=→^.↑↓,:])+$').hasMatch(s),
      InkDomain.language => !RegExp(r'\d').hasMatch(s),
      InkDomain.code => RegExp(r'^[\x20-\x7E]+$').hasMatch(s),
      InkDomain.general => true,
    };
    return ok ? 1 : 0;
  }

  /// Typographic look-alikes as the plain characters people type.
  static String _plain(String s) => s
      .replaceAll(RegExp('[‘’ʼ＇´′]'), "'")
      .replaceAll(RegExp('[“”＂″]'), '"')
      .replaceAll(RegExp('[​‌‍﻿]'), '')
      .replaceAll('：', ':')
      .replaceAll('；', ';')
      .replaceAll('，', ',')
      .replaceAll('？', '?')
      .replaceAll('！', '!')
      .replaceAll('＝', '=');

  /// In maths a lone letter that looks like a digit is that digit ("l" is 1, "S" is 5); a longer
  /// reading is left to the maths layer (mathFix), which knows the neighbours.
  static String _digitsFix(String t) {
    if (t.runes.length != 1) return t;
    const map = {'O': '0', 'o': '0', 'D': '0', 'l': '1', 'I': '1', '|': '1', 'Z': '2', 'S': '5', 'G': '6', 'T': '7', 'B': '8'};
    return map[t] ?? t;
  }
}
