import 'package:intl/intl.dart';

/// Labels for recordings.
abstract final class LessonFmt {
  /// 65 s → "1:05", 3725 s → "1:02:05".
  static String clock(Duration d) {
    final s = d.inSeconds;
    final h = s ~/ 3600, m = (s % 3600) ~/ 60, sec = s % 60;
    final ss = sec.toString().padLeft(2, '0');
    return h > 0 ? '$h:${m.toString().padLeft(2, '0')}:$ss' : '$m:$ss';
  }

  /// "24 min", "1 h 5 min", "Under a minute".
  static String length(Duration d) {
    final m = (d.inSeconds / 60).round();
    if (m < 1) return 'Under a minute';
    if (m < 60) return '$m min';
    return m % 60 == 0 ? '${m ~/ 60} h' : '${m ~/ 60} h ${m % 60} min';
  }

  /// "Sun 4 Oct, 10:02 am"
  static String when(DateTime d) => '${DateFormat('EEE d MMM').format(d)}, ${DateFormat('h:mm a').format(d).toLowerCase()}';

  /// 1.5 → "1.5×", 2 → "2×"
  static String speed(double s) => '${s == s.roundToDouble() ? s.round() : s}×';
}
