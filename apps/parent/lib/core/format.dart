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
  static String dateTime(DateTime d) => '${DateFormat('d MMM yyyy').format(d)}, ${time(d)}';

  /// 19.0 → "19", 22.5 → "22.5", 18.75 → "18.8" (marks and averages).
  static String marks(double v) {
    final r = (v * 10).round() / 10;
    return r == r.roundToDouble() ? r.round().toString() : r.toStringAsFixed(1);
  }

  /// A library book's due date: "Due today", "Due Fri 9 Oct", or "Overdue by 4 days".
  static String bookDue(DateTime dueOn, DateTime today) {
    final diff = daysBetween(today, dueOn);
    if (diff < 0) return 'Overdue by ${plural(-diff, 'day')}';
    return due(dueOn, today);
  }

  /// "Today", "Yesterday", "Mon", "Thu 1 Oct" for message lists.
  static String messageDay(DateTime d, DateTime now) {
    final diff = daysBetween(d, now);
    if (diff == 0) return time(d);
    if (diff == 1) return 'Yesterday';
    if (diff < 7) return DateFormat('EEE').format(d);
    return DateFormat('d MMM').format(d);
  }
}
