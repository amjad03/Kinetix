import 'package:flutter/widgets.dart';

import '../../l10n/feature_strings.dart' show boardLang;
import 'ce_kannada.dart';

/// The Classroom edition's own words in English and Kannada (ಕನ್ನಡ).
///
/// The English sentence is the key: code says `context.ce('Start my class')`, and
/// [ceKannada] holds `'Start my class': 'ನನ್ನ ತರಗತಿ ಆರಂಭಿಸಿ'`. Values go in `{name}`
/// placeholders: `context.ce('Remove {name}?', {'name': t.name})`. The board's ARB files are the
/// whole board's (they need Hindi too), so the edition keeps its own table beside its code, like
/// the layout's and PhET's (`l10n/feature_strings.dart`).
///
/// The board's language picks the table (the start screen's ಕನ್ನಡ / English switch, or Board
/// settings → Language); Hindi and anything else read as English. Subject terms PU teachers say
/// in English (Physics, PUC, Roll number, PIN, KCET, PDF) stay in English inside the Kannada.
///
/// test/classroom_edition/ce_strings_test.dart checks that every `ce('…')` and `ceTr('…')` in the
/// edition has a Kannada string with the same placeholders, and that no `Text('…')` is left bare.
abstract final class CeLang {
  /// The board's language for code with no [BuildContext] (PDFs, lists of tools): 'en' or 'kn'.
  /// Set by the app whenever it builds (`main.dart`).
  static String code = 'en';

  static bool get kannada => code == 'kn';
}

/// [english] in language [lang] ('kn' or anything else for English), with [args] put into its
/// `{name}` placeholders.
String ceIn(String lang, String english, [Map<String, Object?> args = const {}]) {
  var s = lang == 'kn' ? (ceKannada[english] ?? english) : english;
  for (final e in args.entries) {
    s = s.replaceAll('{${e.key}}', '${e.value ?? ''}');
  }
  return s;
}

/// [english] in the board's language now ([CeLang.code]), for code with no [BuildContext].
String ceTr(String english, [Map<String, Object?> args = const {}]) => ceIn(CeLang.code, english, args);

extension CeL10n on BuildContext {
  /// [english] in the board's language.
  ///
  /// It reads [CeLang.code] rather than looking the locale up from this context: dialogs build
  /// their words with the context that opened them, which may be gone by then. A change of
  /// language rebuilds the app from the top (`main.dart`), and the pages pushed over it call
  /// [ceDependOnLanguage] so they rebuild too.
  String ce(String english, [Map<String, Object?> args = const {}]) => ceIn(ceLang, english, args);

  /// 'kn' or 'en'.
  String get ceLang => CeLang.code == 'kn' ? 'kn' : 'en';

  /// Rebuilds the widget at this context when the board's language changes (a page pushed over
  /// the app, such as College settings).
  void ceDependOnLanguage() => boardLang(this);

  bool get ceKannada => ceLang == 'kn';
}

/// "1 student" / "40 students" in the board's language.
String ceStudents(BuildContext context, int n) => n == 1 ? context.ce('1 student') : context.ce('{n} students', {'n': n});

/// Monday … Sunday (1 … 7) in [lang]; [short]: Mon … Sun.
String ceDayIn(String lang, int weekday, {bool short = false}) => ceIn(lang, switch ((weekday - 1) % 7 + 1) {
  1 => short ? 'Mon' : 'Monday',
  2 => short ? 'Tue' : 'Tuesday',
  3 => short ? 'Wed' : 'Wednesday',
  4 => short ? 'Thu' : 'Thursday',
  5 => short ? 'Fri' : 'Friday',
  6 => short ? 'Sat' : 'Saturday',
  _ => short ? 'Sun' : 'Sunday',
});

/// Monday … Sunday (1 … 7) in the board's language.
String ceDay(BuildContext context, int weekday, {bool short = false}) => ceDayIn(context.ceLang, weekday, short: short);
