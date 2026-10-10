import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../l10n/feature_strings.dart';

/// A voice the device's text-to-speech has: its name and language ("en-IN").
class VoiceOption {
  const VoiceOption(this.name, this.locale);
  final String name, locale;
}

/// A reader voice that can offer other voices and a pitch (the device's text-to-speech does;
/// a test double need not).
abstract interface class VoiceChoices {
  /// The on-device voices for the language of [lang] ("hi-IN" lists the Hindi ones).
  Future<List<VoiceOption>> voices(String lang);

  /// The voice to use (null = the engine's own for the language) and the pitch (1 = normal).
  String? get voiceName;
  set voiceName(String? v);
  double get pitch;
  set pitch(double v);
}

/// How the reader looks: font, size, spacing and the aids for readers who find text hard.
class ReaderLook {
  ReaderLook({this.font = ReaderFont.standard, this.letterSpacing = 0.2, this.wordSpacing = 0, this.lineHeight = 1.45, this.syllables = false});

  ReaderFont font;

  /// In ems (0.02 = 2% of the text size).
  double letterSpacing, wordSpacing;
  double lineHeight;

  /// Colours the syllables of English words alternately.
  bool syllables;
}

enum ReaderFont { standard, easy, serif, mono }

/// English words as syllables, by a spelling rule of thumb (vowel groups, consonant pairs,
/// a silent final e, "-le"). Not a dictionary: it is right for most school words (ta·ble,
/// read·ing, tea·cher, ba·na·na) and is only used to colour the word. Other scripts and
/// short words come back whole.
List<String> syllabify(String word) {
  if (!RegExp(r'^[A-Za-z]+$').hasMatch(word) || word.length <= 3) return [word];
  final w = word.toLowerCase();
  bool vowel(int i) => 'aeiou'.contains(w[i]) || (w[i] == 'y' && i > 0);
  final groups = <(int, int)>[];
  for (var i = 0; i < w.length;) {
    if (!vowel(i)) {
      i++;
      continue;
    }
    var j = i;
    while (j < w.length && vowel(j)) {
      j++;
    }
    groups.add((i, j));
    i = j;
  }
  final last = w.length - 1;
  final leEnding = w.endsWith('le') && w.length > 3 && !vowel(last - 2);
  // A silent final e belongs to the syllable before it.
  if (groups.length > 1 && groups.last == (last, last + 1) && w[last] == 'e' && !leEnding) groups.removeLast();
  if (groups.length < 2) return [word];
  const digraphs = {'th', 'sh', 'ch', 'ph', 'wh', 'ck', 'ng'};
  final cuts = <int>[];
  for (var k = 0; k + 1 < groups.length; k++) {
    final a = groups[k], b = groups[k + 1];
    final between = b.$1 - a.$2;
    if (leEnding && k + 2 == groups.length) {
      cuts.add(b.$1 - 2);
    } else if (between == 1) {
      cuts.add(a.$2);
    } else if (between == 2 && digraphs.contains(w.substring(a.$2, a.$2 + 2))) {
      cuts.add(a.$2);
    } else {
      cuts.add(a.$2 + 1);
    }
  }
  final out = <String>[];
  var from = 0;
  for (final c in cuts) {
    if (c <= from || c >= word.length) continue;
    out.add(word.substring(from, c));
    from = c;
  }
  out.add(word.substring(from));
  return out;
}

/// The text of [p] as spans: the word being spoken marked, and (with [syllables]) the
/// syllables of English words in alternating colours. The text is unchanged, so the word
/// offsets the voice reports stay right.
TextSpan readerSpans(String p, {(int, int)? word, required Color mark, required Color onMark, bool syllables = false, Color? alt}) {
  if (word == null && !syllables) return TextSpan(text: p);
  final a = word == null ? -1 : word.$1.clamp(0, p.length);
  final b = word == null ? -1 : word.$2.clamp(0, p.length);
  final kids = <InlineSpan>[];
  var at = 0;
  void plain(int from, int to) {
    if (to > from) kids.add(TextSpan(text: p.substring(from, to)));
  }

  TextSpan piece(int from, int to) {
    final marked = b > a && from >= a && to <= b;
    final style = marked ? TextStyle(backgroundColor: mark, color: onMark) : null;
    if (!syllables) return TextSpan(text: p.substring(from, to), style: style);
    final parts = syllabify(p.substring(from, to));
    return TextSpan(
      style: style,
      children: [
        for (final (i, s) in parts.indexed)
          TextSpan(
            text: s,
            style: !marked && i.isOdd ? TextStyle(color: alt) : null,
          ),
      ],
    );
  }

  if (!syllables) {
    if (b <= a) return TextSpan(text: p);
    return TextSpan(children: [piece(0, a), piece(a, b), piece(b, p.length)].where((s) => (s.text ?? '').isNotEmpty || s.children != null).toList());
  }
  for (final m in RegExp(r"[A-Za-z]+").allMatches(p)) {
    // Split a word at the marked edges so the mark never cuts a syllable colour wrongly.
    plain(at, m.start);
    var s = m.start;
    for (final cut in [if (a > m.start && a < m.end) a, if (b > m.start && b < m.end) b, m.end]) {
      kids.add(piece(s, cut));
      s = cut;
    }
    at = m.end;
  }
  plain(at, p.length);
  return TextSpan(children: kids);
}

/// The reader's text style for [look] at [size].
TextStyle readerLookStyle(ReaderLook look, double size, Color colour) => TextStyle(
  fontFamily: switch (look.font) {
    ReaderFont.easy => KxFonts.primary,
    ReaderFont.serif => 'serif',
    ReaderFont.mono => 'monospace',
    ReaderFont.standard => null,
  },
  fontFamilyFallback: KxFonts.fallback,
  fontSize: size,
  height: look.lineHeight,
  color: colour,
  letterSpacing: size * look.letterSpacing,
  wordSpacing: size * look.wordSpacing,
);

FeatureStrings readerStrings(BuildContext context) => FeatureStrings(boardLang(context), readerStringTable);

const readerStringTable = <String, Map<String, String>>{
  'en': {
    'settings': 'Reader settings',
    'voice': 'Voice',
    'voiceAuto': 'Automatic',
    'speed': 'Speed',
    'pitch': 'Pitch',
    'font': 'Font',
    'fontStandard': 'Standard',
    'fontEasy': 'Easy read',
    'fontSerif': 'Serif',
    'fontMono': 'Mono',
    'letters': 'Letter spacing',
    'words': 'Word spacing',
    'lines': 'Line spacing',
    'syllables': 'Syllables',
    'language': 'Language',
    'langAuto': 'Automatic',
    'themeDark': 'Dark',
    'themeSepia': 'Sepia',
    'themeMint': 'Mint',
    'themeNight': 'Yellow on black',
    'test': 'Try the voice',
    'sample': 'This is how I will read to the class.',
  },
  'hi': {
    'settings': 'रीडर सेटिंग',
    'voice': 'आवाज़',
    'voiceAuto': 'अपने-आप',
    'speed': 'गति',
    'pitch': 'स्वर',
    'font': 'फ़ॉन्ट',
    'fontStandard': 'सामान्य',
    'fontEasy': 'आसान पढ़ाई',
    'fontSerif': 'सेरिफ़',
    'fontMono': 'मोनो',
    'letters': 'अक्षरों की दूरी',
    'words': 'शब्दों की दूरी',
    'lines': 'पंक्तियों की दूरी',
    'syllables': 'अक्षर-खंड',
    'language': 'भाषा',
    'langAuto': 'अपने-आप',
    'themeDark': 'गहरा',
    'themeSepia': 'सेपिया',
    'themeMint': 'पुदीना',
    'themeNight': 'काले पर पीला',
    'test': 'आवाज़ सुनें',
    'sample': 'मैं कक्षा को इसी तरह पढ़कर सुनाऊँगा।',
  },
  'kn': {
    'settings': 'ರೀಡರ್ ಸೆಟ್ಟಿಂಗ್',
    'voice': 'ಧ್ವನಿ',
    'voiceAuto': 'ಸ್ವಯಂಚಾಲಿತ',
    'speed': 'ವೇಗ',
    'pitch': 'ಸ್ವರ',
    'font': 'ಫಾಂಟ್',
    'fontStandard': 'ಸಾಮಾನ್ಯ',
    'fontEasy': 'ಸುಲಭ ಓದು',
    'fontSerif': 'ಸೆರಿಫ್',
    'fontMono': 'ಮೊನೊ',
    'letters': 'ಅಕ್ಷರ ಅಂತರ',
    'words': 'ಪದ ಅಂತರ',
    'lines': 'ಸಾಲು ಅಂತರ',
    'syllables': 'ಅಕ್ಷರ ಖಂಡ',
    'language': 'ಭಾಷೆ',
    'langAuto': 'ಸ್ವಯಂಚಾಲಿತ',
    'themeDark': 'ಗಾಢ',
    'themeSepia': 'ಸೆಪಿಯಾ',
    'themeMint': 'ಪುದೀನಾ',
    'themeNight': 'ಕಪ್ಪಿನ ಮೇಲೆ ಹಳದಿ',
    'test': 'ಧ್ವನಿ ಕೇಳಿ',
    'sample': 'ನಾನು ತರಗತಿಗೆ ಹೀಗೆ ಓದಿ ಹೇಳುತ್ತೇನೆ.',
  },
};
