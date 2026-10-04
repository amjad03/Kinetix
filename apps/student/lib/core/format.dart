import 'package:intl/intl.dart';

/// Date and money labels in the style Indian students expect: "Thu 1 Oct", "₹42,500".
abstract final class Fmt {
  static String longDay(DateTime d) => DateFormat('EEEE, d MMMM').format(d);
  static String shortDay(DateTime d) => DateFormat('EEE d MMM').format(d);

  /// "1 Oct 2026"
  static String date(DateTime d) => DateFormat('d MMM y').format(d);

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

  static final _rupees = NumberFormat.decimalPattern('en_IN');

  /// Indian grouping, paise only when there are any: 4250000 → "₹42,500", 12350 → "₹123.50".
  static String rupees(int paise) {
    final whole = _rupees.format(paise ~/ 100);
    final rest = paise.abs() % 100;
    return rest == 0 ? '₹$whole' : '₹$whole.${rest.toString().padLeft(2, '0')}';
  }

  /// "online" → "Online", "bank_transfer" → "Bank transfer", "upi" → "UPI".
  static String paymentMethod(String m) => switch (m) {
    'upi' => 'UPI',
    'online' => 'Online',
    'cash' => 'Cash',
    'cheque' => 'Cheque',
    'bank_transfer' => 'Bank transfer',
    '' => 'Payment',
    _ => '${m[0].toUpperCase()}${m.substring(1).replaceAll('_', ' ')}',
  };
}
