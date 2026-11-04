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
  ApiException? error;

  int count(AttendanceStatus s) => marks.values.where((m) => m == s).length;

  /// What the summary shows: present and absent always, late and excused when there are any.
  List<(AttendanceStatus, int)> get summary => [
    for (final s in AttendanceStatus.values)
      if (count(s) > 0 || s == AttendanceStatus.present || s == AttendanceStatus.absent) (s, count(s)),
  ];

  /// Classroom reader taps and QR scans held for review on this period.
  List<AttendanceHint> hints = const [];

  /// Students the classroom reader saw.
  Set<String> get tapped => {for (final h in hints) if (h.isReaderTap) h.studentId};

  /// Confirms the reader: tapped students present, everyone else absent (the teacher still saves).
  void useReaderTaps() {
    final seen = tapped;
    for (final s in students) {
      marks[s.id] = seen.contains(s.id) ? AttendanceStatus.present : AttendanceStatus.absent;
    }
    dirty = true;
    notifyListeners();
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
      hints = sheet.hints;
      marks
        ..clear()
        ..addEntries(students.map((s) => MapEntry(s.id, sheet.records[s.id] ?? AttendanceStatus.present)));
      dirty = false;
    } on ApiException catch (e) {
      error = e;
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

  /// The last [submit] was kept on the phone (offline) to be sent later.
  bool queued = false;

  /// Returns null on success (or queued offline, see [queued]), or the error to show.
  Future<ApiException?> submit() async {
    submitting = true;
    notifyListeners();
    try {
      queued = false;
      final sheet = await api.submitAttendance(slotId: slotId, date: date, marks: Map.of(marks));
      alreadyTaken = sheet.taken;
      dirty = false;
      return null;
    } on ApiException catch (e) {
      // Offline: keep the register on the phone and send it when the server answers again.
      if (e.status == 0 && await api.queueAttendance(slotId: slotId, date: date, marks: Map.of(marks))) {
        queued = true;
        dirty = false;
        return null;
      }
      return e;
    } finally {
      submitting = false;
      notifyListeners();
    }
  }
}
