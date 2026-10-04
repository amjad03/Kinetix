import 'package:flutter/foundation.dart';

import '../../core/api.dart';
import '../../core/models.dart';

/// State for the Today tab: the selected day's periods and the active board connection.
class TodayController extends ChangeNotifier {
  TodayController(this.api);

  final TeacherApi api;

  /// Today in the institution's timezone, as reported by the server.
  String? today;
  String? selectedDate;
  DayTimetable? day;
  BoardConnection? connection;
  bool loading = false;
  ApiException? error;

  /// True when today has no classes and we are showing the next teaching day instead.
  bool showingNextDay = false;

  /// Today's holiday, when today is one (shown above the next teaching day).
  String? todayHoliday;

  bool get isSelectedPast => selectedDate != null && today != null && selectedDate!.compareTo(today!) < 0;
  bool get isSelectedFuture => selectedDate != null && today != null && selectedDate!.compareTo(today!) > 0;

  /// First load: today, or the next teaching day when today is empty (e.g. Sunday).
  Future<void> load() async {
    await _run(() async {
      var t = await api.timetable();
      today = t.date;
      todayHoliday = t.holiday;
      showingNextDay = false;
      if (t.periods.isEmpty && t.nextTeachingDate != null) {
        t = await api.timetable(date: t.nextTeachingDate);
        showingNextDay = true;
      }
      day = t;
      selectedDate = t.date;
    });
    await refreshConnection();
  }

  Future<void> select(String date) async {
    if (date == selectedDate && day != null) return;
    selectedDate = date;
    showingNextDay = false;
    await _run(() async {
      final t = await api.timetable(date: date);
      if (selectedDate == date) day = t;
    });
  }

  Future<void> reload() async {
    if (selectedDate == null) return load();
    await Future.wait([_run(() async => day = await api.timetable(date: selectedDate)), refreshConnection()]);
  }

  Future<void> refreshConnection() async {
    try {
      connection = await api.activeSession();
      notifyListeners();
    } on ApiException {
      // The card simply keeps its last state; the timetable error banner covers connectivity.
    }
  }

  void connected(BoardConnection c) {
    connection = c;
    notifyListeners();
  }

  /// Throws [ApiException] so the caller can show it.
  Future<void> endClass() async {
    final c = connection;
    if (c == null) return;
    await api.endSession(c.sessionId);
    connection = null;
    notifyListeners();
  }

  void markTaken(String slotId) {
    for (final p in day?.periods ?? const <Period>[]) {
      if (p.slotId == slotId) p.attendanceTaken = true;
    }
    notifyListeners();
  }

  Future<void> _run(Future<void> Function() body) async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      await body();
    } on ApiException catch (e) {
      error = e;
    } finally {
      loading = false;
      notifyListeners();
    }
  }
}
