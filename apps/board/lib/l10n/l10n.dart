import 'package:flutter/widgets.dart';
import 'package:intl/intl.dart';

import '../core/api_client.dart';
import 'gen/app_localizations.dart';

export 'gen/app_localizations.dart';

/// Languages the board's own buttons and messages can be shown in. The label is in the
/// language itself, so a teacher can always find their own.
enum BoardLanguage {
  en('English'),
  hi('हिन्दी'),
  kn('ಕನ್ನಡ');

  const BoardLanguage(this.label);
  final String label;

  Locale get locale => Locale(name);

  /// The language for a code such as "hi", or null when the board has no translation for it.
  static BoardLanguage? tryParse(String? code) => values.asNameMap()[code?.split(RegExp('[-_]')).first.toLowerCase()];
}

/// The strings for [locale], without a widget tree (controllers, text sent to students).
AppLocalizations l10nFor(Locale locale) =>
    lookupAppLocalizations(AppLocalizations.supportedLocales.contains(Locale(locale.languageCode)) ? Locale(locale.languageCode) : const Locale('en'));

extension BoardL10n on BuildContext {
  /// The board's strings. Falls back to English where no localizations are set up (some tests
  /// pump bare widgets).
  AppLocalizations get l10n => AppLocalizations.of(this) ?? lookupAppLocalizations(const Locale('en'));

  /// The intl locale for dates and numbers: en_IN, hi_IN or kn_IN.
  String get dateLocale => dateLocaleFor(Localizations.maybeLocaleOf(this) ?? const Locale('en'));
}

/// A server error for the board: the server's own message, or "Request failed (500)" in the
/// board's language when it sent none.
String apiErrorText(AppLocalizations l, ApiException e) => RegExp(r'^Request failed \(\d+\)$').hasMatch(e.message) ? l.requestFailed(e.status) : e.message;

/// Indian formats for [locale] (en_IN, hi_IN, kn_IN), falling back to what intl has loaded.
String dateLocaleFor(Locale locale) {
  for (final tag in ['${locale.languageCode}_IN', locale.languageCode]) {
    try {
      if (DateFormat.localeExists(tag)) return tag;
    } catch (_) {
      // Date data not loaded (no flutter_localizations in this tree): only en_US is there.
      break;
    }
  }
  return 'en_US';
}
