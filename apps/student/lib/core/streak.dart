import 'package:shared_preferences/shared_preferences.dart';

import 'models.dart' show isoDate;

/// The learning streak: how many days in a row the student opened the app. It is kept on the
/// phone, per student, and counted once a day.
abstract final class LearningStreak {
  static String _days(String studentId) => 'streak_days_$studentId';
  static String _last(String studentId) => 'streak_last_$studentId';

  /// Counts [today] (once) and returns the streak, with today in it.
  static Future<int> touch(SharedPreferences prefs, String studentId, DateTime today) async {
    final key = isoDate(today);
    final last = prefs.getString(_last(studentId));
    final days = prefs.getInt(_days(studentId)) ?? 0;
    if (last == key) return days < 1 ? 1 : days;
    final yesterday = isoDate(DateTime(today.year, today.month, today.day).subtract(const Duration(days: 1)));
    final next = last == yesterday ? days + 1 : 1;
    await prefs.setString(_last(studentId), key);
    await prefs.setInt(_days(studentId), next);
    return next;
  }
}
