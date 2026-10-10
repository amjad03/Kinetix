import 'package:flutter/foundation.dart';

/// Rings when a board marks attendance (realtime `attendance.updated`); the attendance views listen and refetch.
class AttendanceLive {
  static final ValueNotifier<int> tick = ValueNotifier<int>(0);

  static void changed() => tick.value++;
}
