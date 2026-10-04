import 'package:flutter/material.dart' show BuildContext, DateUtils, Localizations;
import 'package:intl/intl.dart';

import 'l10n.dart';
import 'models.dart';

/// Dates, times and durations in the app's language, in the style Indian users expect:
/// "Monday, 5 October", "Tue, 6 Oct", "10:00 AM". Digits stay Western in every language.
class Fmt {
  Fmt(this.l, String language) : locale = intlLocaleFor(language);

  factory Fmt.of(BuildContext context) => Fmt(context.l10n, Localizations.localeOf(context).languageCode);

  final AppLocalizations l;

  /// The intl locale: en_IN, hi_IN or kn_IN.
  final String locale;

  String longDay(DateTime d) => DateFormat('EEEE, d MMMM', locale).format(d);
  String shortDay(DateTime d) => DateFormat('EEE, d MMM', locale).format(d);
  String weekday(DateTime d) => DateFormat('EEEE', locale).format(d);
  String weekdayShort(DateTime d) => DateFormat('EEE', locale).format(d);

  /// "Today", "Tomorrow", "Yesterday" or "Tue, 6 Oct".
  String relativeDay(DateTime d, DateTime today) => switch (_days(d, today)) {
    0 => l.today,
    1 => l.tomorrow,
    -1 => l.yesterday,
    _ => shortDay(d),
  };

  String greeting(DateTime now, String name) => now.hour < 12
      ? l.greetingMorning(name)
      : now.hour < 17
      ? l.greetingAfternoon(name)
      : l.greetingEvening(name);

  /// "10:24 AM" in every language, as on Indian timetables and phones (intl's Kannada short
  /// form is "10:24 a", which reads as ambiguous). To be confirmed by native reviewers.
  String time(DateTime d) => DateFormat('h:mm a', 'en_IN').format(d).toUpperCase();

  /// A timetable time: "10:00 AM".
  String clock(ClockTime t) => time(DateTime(2000, 1, 1, t.minutes ~/ 60, t.minutes % 60));

  /// "10:00 AM – 10:55 AM", or null outside a timetabled period.
  String? period(BoardConnection c) => c.startsAt == null ? null : '${clock(c.startsAt!)} – ${clock(c.endsAt!)}';

  /// For lists of threads: "10:24 AM" today, "Yesterday", "Tue" this week, else "6 Oct".
  String stamp(DateTime d, DateTime now) {
    final days = -_days(d, now);
    if (days <= 0) return time(d);
    if (days == 1) return l.yesterday;
    if (days < 7) return weekdayShort(d);
    return DateFormat('d MMM', locale).format(d);
  }

  /// Day separators in a chat: "Today", "Yesterday", "Tuesday, 6 October".
  String chatDay(DateTime d, DateTime now) => switch (-_days(d, now)) {
    0 => l.today,
    1 => l.yesterday,
    _ => longDay(d),
  };

  /// When a recording was made: "Sun, 4 Oct · 10:02 AM".
  String when(DateTime d) => '${shortDay(d)} · ${time(d)}';

  /// A recording's length: "24 min", "1 h 5 min", "Under a minute".
  String duration(Duration d) {
    final m = (d.inSeconds / 60).round();
    if (m < 1) return l.durationUnderMinute;
    if (m < 60) return l.durationMinutes(m);
    return m % 60 == 0 ? l.durationHours(m ~/ 60) : l.durationHoursMinutes(m ~/ 60, m % 60);
  }

  static int _days(DateTime d, DateTime from) => DateUtils.dateOnly(d).difference(DateUtils.dateOnly(from)).inDays;
}
