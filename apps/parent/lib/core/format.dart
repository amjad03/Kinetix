import 'package:intl/intl.dart';
import 'package:kinetix_lesson/kinetix_lesson.dart' show LessonFmt;

import '../l10n/app_localizations.dart';
import 'models.dart' show ClockTime;

/// Date and money labels in the style Indian families expect, in the app's language:
/// "Thu 1 Oct", "गुरु 1 अक्टू॰", "₹1,23,456". Digits stay Western and money uses Indian grouping
/// in every language (docs/i18n/glossary.md).
class Fmt {
  Fmt(this.l) : _locale = LessonFmt.dateLocale(intlLocale(l.localeName));

  final AppLocalizations l;
  final String? _locale;

  /// "en" → "en_IN", "hi" → "hi_IN", "kn" → "kn_IN".
  static String intlLocale(String language) => '${language.split(RegExp('[_-]')).first}_IN';

  String longDay(DateTime d) => DateFormat('EEEE, d MMMM', _locale).format(d);
  String shortDay(DateTime d) => DateFormat('EEE d MMM', _locale).format(d);

  /// "October 2026"
  String month(DateTime d) => DateFormat('MMMM y', _locale).format(d);

  /// "Fri 9 Oct", or "Mon 12 Oct – Fri 16 Oct" for several days.
  String dayRange(DateTime from, DateTime to) => daysBetween(from, to) == 0 ? shortDay(from) : '${shortDay(from)} – ${shortDay(to)}';

  /// "1.2 MB", "350 KB"
  static String fileSize(int bytes) =>
      bytes >= 1024 * 1024 ? '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB' : '${(bytes / 1024).ceil()} KB';

  /// "4 Oct 2026"
  String date(DateTime d) => DateFormat('d MMM y', _locale).format(d);

  /// "2:05 pm"
  String time(DateTime d) => LessonFmt.time(d, _locale);

  /// A timetable time: "10:00 AM".
  String clock(ClockTime t) => time(DateTime(2000, 1, 1, t.minutes ~/ 60, t.minutes % 60));

  static int daysBetween(DateTime from, DateTime to) =>
      DateTime(to.year, to.month, to.day).difference(DateTime(from.year, from.month, from.day)).inDays;

  /// "Today", "Yesterday", "Tomorrow" or "Thu 1 Oct".
  String relativeDay(DateTime d, DateTime today) => switch (daysBetween(today, d)) {
    0 => l.today,
    1 => l.tomorrow,
    -1 => l.yesterday,
    _ => shortDay(d),
  };

  /// "Due today", "Due tomorrow", "Due Fri 9 Oct", "Was due Thu 1 Oct".
  String due(DateTime dueOn, DateTime today) {
    final diff = daysBetween(today, dueOn);
    if (diff < 0) return l.wasDue(shortDay(dueOn));
    return switch (diff) {
      0 => l.dueToday,
      1 => l.dueTomorrow,
      _ => l.dueOn(shortDay(dueOn)),
    };
  }

  String greeting(DateTime now) => now.hour < 12
      ? l.greetingMorning
      : now.hour < 17
      ? l.greetingAfternoon
      : l.greetingEvening;

  /// 80.0 → "80%", 83.3 → "83%"
  static String percent(double v) => '${v.round()}%';

  /// Indian grouping: 12345600 paise → "₹1,23,456"; 4250050 → "₹42,500.50". Paise only when non-zero.
  static String rupees(int paise) {
    final negative = paise < 0;
    final p = paise.abs();
    final whole = (p ~/ 100).toString();
    final String grouped;
    if (whole.length <= 3) {
      grouped = whole;
    } else {
      // Last three digits, then groups of two (lakh, crore).
      final head = whole.substring(0, whole.length - 3);
      final parts = <String>[];
      for (var i = head.length; i > 0; i -= 2) {
        parts.insert(0, head.substring(i - 2 < 0 ? 0 : i - 2, i));
      }
      grouped = '${parts.join(',')},${whole.substring(whole.length - 3)}';
    }
    final rest = p % 100;
    return '${negative ? '-' : ''}₹$grouped${rest == 0 ? '' : '.${rest.toString().padLeft(2, '0')}'}';
  }

  /// What a parent typed ("2500", "2,500", "2500.5") in paise, or null when it is not an amount.
  static int? parseRupees(String input) {
    final t = input.replaceAll(',', '').replaceAll('₹', '').trim();
    final m = RegExp(r'^(\d{0,9})(?:\.(\d{0,2}))?$').firstMatch(t);
    if (m == null || (m[1]!.isEmpty && (m[2] ?? '').isEmpty)) return null;
    final whole = m[1]!.isEmpty ? 0 : int.parse(m[1]!);
    final frac = (m[2] ?? '').padRight(2, '0');
    return whole * 100 + int.parse(frac);
  }

  /// "4 Oct 2026, 2:05 pm"
  String dateTime(DateTime d) => l.dateTime(date(d), time(d));

  /// 19.0 → "19", 22.5 → "22.5", 18.75 → "18.8" (marks and averages).
  static String marks(double v) {
    final r = (v * 10).round() / 10;
    return r == r.roundToDouble() ? r.round().toString() : r.toStringAsFixed(1);
  }

  /// A library book's due date: "Due back today", "Due back Fri 9 Oct", or "Overdue by 4 days".
  String bookDue(DateTime dueOn, DateTime today) {
    final diff = daysBetween(today, dueOn);
    if (diff < 0) return l.overdueBy(-diff);
    return switch (diff) {
      0 => l.bookDueToday,
      1 => l.bookDueTomorrow,
      _ => l.bookDueOn(shortDay(dueOn)),
    };
  }

  /// "2:05 pm" today, "Yesterday", "Mon" this week, else "1 Oct" (message lists).
  String messageDay(DateTime d, DateTime now) {
    final diff = daysBetween(d, now);
    if (diff == 0) return time(d);
    if (diff == 1) return l.yesterday;
    if (diff < 7) return DateFormat('EEE', _locale).format(d);
    return DateFormat('d MMM', _locale).format(d);
  }

  /// "a, b and c" in the app's language.
  String list(List<String> items) => switch (items.length) {
    0 => '',
    1 => items.single,
    _ => l.listAnd(items.sublist(0, items.length - 1).join(l.listSeparator), items.last),
  };
}
