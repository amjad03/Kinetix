import 'package:flutter/foundation.dart';
import 'package:kinetix_lesson/kinetix_lesson.dart' show RecordingInfo;

import 'api.dart';
import 'live.dart';
import 'models.dart';

/// The student's Today summary (attendance, homework, recordings, boards), the class being taught
/// live, results, library books and the subjects of their class, shared by every tab.
class StudyController extends ChangeNotifier {
  StudyController(this.api, this.student, {LiveConnector? liveConnector}) : liveConnector = liveConnector ?? SocketLiveConnection.new;

  final StudentApi api;
  final StudentProfile student;

  /// Opens the realtime connection for watching a live class.
  final LiveConnector liveConnector;

  StudentSummary? summary;
  bool loading = false;
  ApiException? error;

  /// The institution's today once the summary is in, else the device's.
  DateTime get today => summary?.today ?? DateTime.now();

  /// Everything on Today. Each part fails on its own, so one problem never hides the rest.
  Future<void> load() => Future.wait([loadSummary(), loadLive(), loadMarks(), loadLibrary(), loadCalendar()]);

  Future<void> loadSummary() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      summary = await api.summary(student.id);
    } on ApiException catch (e) {
      error = e;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  // -- Live class -------------------------------------------------------------------------------

  /// The class being taught live right now, if any.
  LiveClass? live;
  Future<LiveClass?>? _liveLoad;

  /// Asks whether a class is live (on open, pull to refresh, app resume and a "Live now" update).
  /// A failure keeps what we knew: the banner is a convenience.
  Future<LiveClass?> loadLive() => _liveLoad ??= _loadLive().whenComplete(() => _liveLoad = null);

  Future<LiveClass?> _loadLive() async {
    try {
      live = await api.live();
      notifyListeners();
    } on ApiException {
      // Offline: the next refresh tries again.
    }
    return live;
  }

  // -- Results and library ----------------------------------------------------------------------

  StudentMarks? marks;
  ApiException? marksError;
  LibraryAccount? library;
  ApiException? libraryError;

  Future<StudentMarks?> loadMarks() async {
    marksError = null;
    try {
      marks = await api.marks(student.id);
    } on ApiException catch (e) {
      marksError = e;
    } finally {
      notifyListeners();
    }
    return marks;
  }

  Future<LibraryAccount?> loadLibrary() async {
    libraryError = null;
    try {
      library = await api.library(student.id);
    } on ApiException catch (e) {
      libraryError = e;
    } finally {
      notifyListeners();
    }
    return library;
  }

  // -- Subjects ---------------------------------------------------------------------------------

  List<Subject>? subjects;
  bool subjectsLoading = false;
  ApiException? subjectsError;
  Future<void>? _subjectsLoad;

  Future<void> loadSubjects() => _subjectsLoad ??= _loadSubjects().whenComplete(() => _subjectsLoad = null);

  Future<void> _loadSubjects() async {
    subjectsLoading = true;
    subjectsError = null;
    notifyListeners();
    try {
      subjects = [...await api.subjects()]..sort((a, b) => a.name.compareTo(b.name));
    } on ApiException catch (e) {
      subjectsError = e;
    } finally {
      subjectsLoading = false;
      notifyListeners();
    }
  }

  // -- Calendar ---------------------------------------------------------------------------------

  /// Holidays, exams and events from today for the next 90 days (the server's default).
  CalendarRange? calendar;
  ApiException? calendarError;

  Future<CalendarRange?> loadCalendar() async {
    calendarError = null;
    try {
      calendar = await api.calendar();
    } on ApiException catch (e) {
      calendarError = e;
    } finally {
      notifyListeners();
    }
    return calendar;
  }

  /// A holiday today or tomorrow for the student's program: (holiday, is today).
  (CalendarEvent, bool)? get holidaySoon => calendar?.holidaySoon(program: student.programName);

  // -- Syllabus coverage ------------------------------------------------------------------------

  final _coverage = <String, Coverage>{};
  final _coverageLoads = <String, Future<Coverage?>>{};

  /// How much of [subjectId] the class has been taught, once loaded.
  Coverage? coverageOf(String subjectId) => _coverage[subjectId];

  /// Loads (or reloads with [fresh]) the class's progress in [subjectId]. A failure leaves the
  /// syllabus without ticks: progress is extra information.
  Future<Coverage?> loadCoverage(String subjectId, {bool fresh = false}) {
    if (!fresh && _coverage.containsKey(subjectId)) return Future.value(_coverage[subjectId]);
    return _coverageLoads[subjectId] ??= () async {
      try {
        final c = await api.coverage(sectionId: student.sectionId, subjectId: subjectId);
        _coverage[subjectId] = c;
        notifyListeners();
        return c;
      } on ApiException {
        return _coverage[subjectId];
      } finally {
        _coverageLoads.remove(subjectId);
      }
    }();
  }

  // -- Lookups for Updates ----------------------------------------------------------------------

  /// A homework by id: from the summary when it is there, else asked for directly.
  Future<Homework?> findHomework(String homeworkId) async {
    if (summary == null) await loadSummary();
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
