import 'package:intl/intl.dart';

import 'l10n.dart';

/// Labels for recordings.
abstract final class LessonFmt {
  /// 65 s → "1:05", 3725 s → "1:02:05".
  static String clock(Duration d) {
    final s = d.inSeconds;
    final h = s ~/ 3600, m = (s % 3600) ~/ 60, sec = s % 60;
    final ss = sec.toString().padLeft(2, '0');
    return h > 0 ? '$h:${m.toString().padLeft(2, '0')}:$ss' : '$m:$ss';
  }

  /// "24 min", "1 h 5 min", "Under a minute" (in [s]'s language; English by default).
  static String length(Duration d, [LessonStrings? s]) {
    final t = s ?? LessonStrings.forLocale(null);
    final m = (d.inSeconds / 60).round();
    if (m < 1) return t.underAMinute;
    if (m < 60) return t.minutes(m);
    return m % 60 == 0 ? t.hours(m ~/ 60) : t.hoursMinutes(m ~/ 60, m % 60);
  }

  /// "Sun 4 Oct, 10:02 am" (dates in [s]'s language; Western digits, am/pm everywhere).
  static String when(DateTime d, [LessonStrings? s]) {
    final locale = dateLocale((s ?? LessonStrings.forLocale(null)).intlLocale);
    return '${DateFormat('EEE d MMM', locale).format(d)}, ${time(d, locale)}';
  }

  /// "10:02 am". Kannada's CLDR marker is a bare "a"/"p", so the marker is always am/pm.
  static String time(DateTime d, [String? locale]) => '${DateFormat('h:mm', locale).format(d)} ${d.hour < 12 ? 'am' : 'pm'}';

  /// [locale] when intl has its date symbols loaded (Flutter's localization delegates load
  /// them), else null for intl's default.
  static String? dateLocale(String locale) {
    try {
      return Intl.verifiedLocale(locale, DateFormat.localeExists, onFailure: (_) => null);
    } catch (_) {
      return null;
    }
  }

  /// 1.5 → "1.5×", 2 → "2×"
  static String speed(double s) => '${s == s.roundToDouble() ? s.round() : s}×';
}
