import 'package:flutter/foundation.dart';

import '../../core/api.dart';
import '../../core/models.dart';

/// One period's attendance sheet. Everyone starts Present; existing marks are reloaded.
class AttendanceController extends ChangeNotifier {
  AttendanceController({required this.api, required this.slotId, required this.sectionId, required this.date});

  final TeacherApi api;
  final String slotId;
  final String sectionId;
  final String date;

  List<Student> students = [];
  final Map<String, AttendanceStatus> marks = {};
  bool loading = true;
  bool submitting = false;
  bool alreadyTaken = false;
  bool dirty = false;
  String? error;

  int count(AttendanceStatus s) => marks.values.where((m) => m == s).length;

  /// "10 present · 2 absent · 1 late"
  String get summary {
    final parts = [
      for (final s in AttendanceStatus.values)
        if (count(s) > 0 || s == AttendanceStatus.present || s == AttendanceStatus.absent) '${count(s)} ${s.label.toLowerCase()}',
    ];
    return parts.join(' · ');
  }

  Future<void> load() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      final results = await Future.wait([api.roster(sectionId), api.attendance(slotId: slotId, date: date)]);
      students = results[0] as List<Student>;
      final sheet = results[1] as AttendanceSheet;
      alreadyTaken = sheet.taken;
      marks
        ..clear()
        ..addEntries(students.map((s) => MapEntry(s.id, sheet.records[s.id] ?? AttendanceStatus.present)));
      dirty = false;
    } on ApiException catch (e) {
      error = e.message;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  /// Tap: Present ↔ Absent. Late or excused go back to Present.
  void toggle(String studentId) {
    final current = marks[studentId] ?? AttendanceStatus.present;
    set(studentId, current == AttendanceStatus.present ? AttendanceStatus.absent : AttendanceStatus.present);
  }

  void set(String studentId, AttendanceStatus status) {
    marks[studentId] = status;
    dirty = true;
    notifyListeners();
  }

  void markAllPresent() {
    for (final s in students) {
      marks[s.id] = AttendanceStatus.present;
    }
    dirty = true;
    notifyListeners();
  }

  /// Returns null on success, or a message to show.
  Future<String?> submit() async {
    submitting = true;
    notifyListeners();
    try {
      final sheet = await api.submitAttendance(slotId: slotId, date: date, marks: Map.of(marks));
      alreadyTaken = sheet.taken;
      dirty = false;
      return null;
    } on ApiException catch (e) {
      return e.message;
    } finally {
      submitting = false;
      notifyListeners();
    }
  }
}
