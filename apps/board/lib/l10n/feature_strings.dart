import 'package:flutter/widgets.dart';

/// A feature's own words in English, Hindi and Kannada, kept with the feature (like the
/// layout's and PhET's strings) so the board's ARB files stay as they are. Each table is
/// `{'en': {...}, 'hi': {...}, 'kn': {...}}`; Hindi and Kannada have every English key
/// (test/l10n_test.dart and test/features_strings_test.dart check).
class FeatureStrings {
  const FeatureStrings(this.lang, this.table);

  /// 'en', 'hi' or 'kn' (anything else reads as English).
  final String lang;
  final Map<String, Map<String, String>> table;

  String t(String key) => (table[lang] ?? table['en']!)[key] ?? table['en']![key] ?? key;

  /// [key] with `{n}` replaced by [n].
  String n(String key, Object n) => t(key).replaceAll('{n}', '$n');

  String operator [](String key) => t(key);
}

/// The board's language now: 'en', 'hi' or 'kn'.
String boardLang(BuildContext context) => Localizations.maybeLocaleOf(context)?.languageCode ?? 'en';
