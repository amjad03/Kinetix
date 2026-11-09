import 'package:flutter/widgets.dart';

import '../../l10n/feature_strings.dart' show boardLang;

/// The Classroom edition's own words, in English and Kannada (ಕನ್ನಡ), side by side so a
/// translation can never be missing. The board's language (the start screen's ಕನ್ನಡ / English
/// switch, or Board settings → Language) picks one; Hindi and anything else read as English.
///
/// Subject terms that PU teachers say in English (Physics, PUC, Roll number, PIN, Lessons' chapter
/// names) stay in English inside the Kannada too. test/classroom_edition/ce_strings_test.dart
/// checks that every Kannada string is Kannada, and that no screen of the edition has a bare
/// `Text('…')` left.
class CeS {
  const CeS._(this.kn);

  /// Whether this is the Kannada table.
  final bool kn;

  static const en = CeS._(false);
  static const kannada = CeS._(true);

  /// The table for the board's language now.
  static CeS of(BuildContext context) => forLang(boardLang(context));

  /// The table for a language code ('kn', 'en', …).
  static CeS forLang(String? code) => code == 'kn' ? kannada : en;

  String _t(String english, String kannada) => kn ? kannada : english;

  // --- Board chrome -------------------------------------------------------------------------

  String students(int n) => _t(n == 1 ? '1 student' : '$n students', '$n ವಿದ್ಯಾರ್ಥಿಗಳು');
}
