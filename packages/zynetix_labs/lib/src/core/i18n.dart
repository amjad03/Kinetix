import 'package:flutter/widgets.dart';

import 'strings_hi.dart';
import 'strings_kn.dart';

/// The languages a lab speaks: its interface and its content.
enum LabLang {
  en,
  hi,
  kn;

  /// Each language names itself, so anyone can find their own.
  String get nativeName => switch (this) {
        LabLang.en => 'English',
        LabLang.hi => 'हिन्दी',
        LabLang.kn => 'ಕನ್ನಡ',
      };

  static LabLang fromCode(String? code) => values.where((l) => l.name == code).firstOrNull ?? LabLang.en;

  /// The app's language, from the nearest [Localizations] (English when there is none).
  static LabLang of(BuildContext context) => fromCode(Localizations.maybeLocaleOf(context)?.languageCode);
}

/// The language [tr] and [Words.text] use right now. Lab widgets set it from
/// the app's locale (or their `lang`) as they build; benches are pure and
/// read it while they draw.
LabLang currentLabLang = LabLang.en;

const _tables = <LabLang, Map<String, String>>{
  LabLang.hi: labStringsHi,
  LabLang.kn: labStringsKn,
};

/// Interface text in the current language: `tr('Key in')`, with `{name}`
/// placeholders filled from [args]. Untranslated keys fall back to English.
String tr(String en, [Map<String, Object?> args = const {}]) {
  var s = _tables[currentLabLang]?[en] ?? en;
  for (final e in args.entries) {
    s = s.replaceAll('{${e.key}}', '${e.value}');
  }
  return s;
}

/// Count-dependent text: `trn(n, '{n} reading', '{n} readings')`.
String trn(int n, String one, String many, [Map<String, Object?> args = const {}]) => tr(n == 1 ? one : many, {'n': n, ...args});

/// One piece of lab content in the three languages.
class Words {
  final Map<String, String> byLang;
  const Words(this.byLang);

  factory Words.from(Object? j) => Words(j is Map ? j.map((k, v) => MapEntry('$k', '$v')) : const {});

  /// In the current language.
  String get text => of(currentLabLang);
  String of(LabLang lang) => byLang[lang.name] ?? byLang['en'] ?? '';

  Map<String, String> toJson() => byLang;
}
