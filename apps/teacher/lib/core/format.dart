import 'package:flutter/material.dart' show DateUtils;
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

  /// "10:24 AM"
  static String time(DateTime d) => DateFormat('h:mm a').format(d);

  /// For lists of threads: "10:24 AM" today, "Yesterday", "Tue" this week, else "6 Oct".
  static String stamp(DateTime d, DateTime now) {
    final days = DateUtils.dateOnly(now).difference(DateUtils.dateOnly(d)).inDays;
    if (days <= 0) return time(d);
    if (days == 1) return 'Yesterday';
    if (days < 7) return weekdayShort(d);
    return DateFormat('d MMM').format(d);
  }

  /// Day separators in a chat: "Today", "Yesterday", "Tuesday, 6 October".
  static String chatDay(DateTime d, DateTime now) {
    final days = DateUtils.dateOnly(now).difference(DateUtils.dateOnly(d)).inDays;
    return days == 0
        ? 'Today'
        : days == 1
        ? 'Yesterday'
        : longDay(d);
  }
}
