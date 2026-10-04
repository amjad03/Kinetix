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
      subjects = [...await api.subjects()]..sort((a, b) => a.name.compareTo(b.name));
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
