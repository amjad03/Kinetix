import 'package:flutter/foundation.dart';
import 'package:kinetix_lesson/kinetix_lesson.dart' show RecordingInfo;

import 'api.dart';
import 'models.dart';

/// The student's Today summary (attendance, homework, recordings, boards) and the subjects of
/// their class, shared by every tab.
class StudyController extends ChangeNotifier {
  StudyController(this.api, this.student);

  final StudentApi api;
  final StudentProfile student;

  StudentSummary? summary;
  bool loading = false;
  String? error;

  /// The institution's today once the summary is in, else the device's.
  DateTime get today => summary?.today ?? DateTime.now();

  Future<void> load() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      summary = await api.summary(student.id);
    } on ApiException catch (e) {
      error = e.message;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  // -- Subjects ---------------------------------------------------------------------------------
  //
  // API gap: there is no "subjects of my class" endpoint for students. Homework carries the
  // subject's id (GET /v1/homework/:id), so each subject that has had homework is looked up
  // once through one of its homework. Subjects without homework do not appear; the syllabus
  // search covers them.

  List<Subject>? subjects;
  bool subjectsLoading = false;
  String? subjectsError;
  Future<void>? _subjectsLoad;

  Future<void> loadSubjects() => _subjectsLoad ??= _loadSubjects().whenComplete(() => _subjectsLoad = null);

  Future<void> _loadSubjects() async {
    subjectsLoading = true;
    subjectsError = null;
    notifyListeners();
    try {
      if (summary == null) await load();
      final s = summary;
      if (s == null) {
        subjectsError = error;
        return;
      }
      final found = <Subject>[];
      for (final hwId in s.homeworkIdBySubject.values) {
        final d = await api.homeworkById(hwId);
        if (!found.any((x) => x.id == d.subject.id)) found.add(d.subject);
      }
      found.sort((a, b) => a.name.compareTo(b.name));
      subjects = found;
    } on ApiException catch (e) {
      subjectsError = e.message;
    } finally {
      subjectsLoading = false;
      notifyListeners();
    }
  }

  // -- Lookups for Updates ----------------------------------------------------------------------

  /// A homework by id: from the summary when it is there, else asked for directly.
  Future<Homework?> findHomework(String homeworkId) async {
    if (summary == null) await load();
    final s = summary;
    for (final hw in [...?s?.upcoming, ...?s?.pastHomework]) {
      if (hw.id == homeworkId) return hw;
    }
    try {
      return (await api.homeworkById(homeworkId)).homework;
    } on ApiException {
      return null;
    }
  }

  /// A recording as the summary lists it (with whether the student missed that class).
  RecordingInfo? findRecording(String recordingId) => summary?.recordings.where((r) => r.id == recordingId).firstOrNull;
}
