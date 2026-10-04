import 'package:intl/intl.dart';

/// Date labels in the style Indian users expect: "Monday, 5 October", "Tue, 6 Oct".
abstract final class Fmt {
  static String longDay(DateTime d) => DateFormat('EEEE, d MMMM').format(d);
  static String shortDay(DateTime d) => DateFormat('EEE, d MMM').format(d);
  static String weekday(DateTime d) => DateFormat('EEEE').format(d);
  static String weekdayShort(DateTime d) => DateFormat('EEE').format(d);

  /// "Today", "Tomorrow", "Yesterday" or "Tue, 6 Oct".
  static String relativeDay(DateTime d, DateTime today) {
    final diff = DateTime(d.year, d.month, d.day).difference(DateTime(today.year, today.month, today.day)).inDays;
    return switch (diff) {
      0 => 'Today',
      1 => 'Tomorrow',
      -1 => 'Yesterday',
      _ => shortDay(d),
    };
  }

  static String greeting(DateTime now) => now.hour < 12
      ? 'Good morning'
      : now.hour < 17
      ? 'Good afternoon'
      : 'Good evening';
}
