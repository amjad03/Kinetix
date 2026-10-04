import 'package:intl/intl.dart';

/// Date labels in the style Indian families expect: "Thu 1 Oct", "Tuesday, 29 September".
abstract final class Fmt {
  static String longDay(DateTime d) => DateFormat('EEEE, d MMMM').format(d);
  static String shortDay(DateTime d) => DateFormat('EEE d MMM').format(d);

  /// "2:05 pm"
  static String time(DateTime d) => DateFormat('h:mm a').format(d).toLowerCase();

  static int daysBetween(DateTime from, DateTime to) =>
      DateTime(to.year, to.month, to.day).difference(DateTime(from.year, from.month, from.day)).inDays;

  /// "Today", "Yesterday", "Tomorrow" or "Thu 1 Oct".
  static String relativeDay(DateTime d, DateTime today) => switch (daysBetween(today, d)) {
    0 => 'Today',
    1 => 'Tomorrow',
    -1 => 'Yesterday',
    _ => shortDay(d),
  };

  /// "Due today", "Due tomorrow", "Due Fri 9 Oct", "Was due Thu 1 Oct".
  static String due(DateTime dueOn, DateTime today) {
    final diff = daysBetween(today, dueOn);
    if (diff < 0) return 'Was due ${shortDay(dueOn)}';
    return switch (diff) {
      0 => 'Due today',
      1 => 'Due tomorrow',
      _ => 'Due ${shortDay(dueOn)}',
    };
  }

  /// "3 questions", "1 question"
  static String plural(int n, String one, [String? many]) => '$n ${n == 1 ? one : (many ?? '${one}s')}';

  static String greeting(DateTime now) => now.hour < 12
      ? 'Good morning'
      : now.hour < 17
      ? 'Good afternoon'
      : 'Good evening';

  /// 80.0 → "80%", 83.3 → "83%"
  static String percent(double v) => '${v.round()}%';
}
