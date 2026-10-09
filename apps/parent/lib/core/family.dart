import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:kinetix_lesson/kinetix_lesson.dart' show RecordingInfo;
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';
import 'conduct.dart';
import 'models.dart';

/// The parent's children, which one is selected (remembered), and each child's Home summary, fees,
/// library books and marks.
class FamilyController extends ChangeNotifier {
  FamilyController(this.api, this._prefs);

  final ParentApi api;
  final SharedPreferences _prefs;
  static const _kChild = 'selected_child';

  List<Child> children = [];

  /// What the school shows parents; everything until the server says otherwise. Read once per session.
  ParentVisibility visibility = const ParentVisibility();
  bool _visibilityLoaded = false;
  bool loading = false;
  ApiException? error;
  String? _selectedId;

  final _summaries = <String, ChildSummary>{};
  final _summaryErrors = <String, ApiException>{};
  final _summaryLoading = <String>{};
  final _fees = <String, StudentFees>{};
  final _feesErrors = <String, ApiException>{};
  final _library = <String, LibraryAccount>{};
  final _libraryErrors = <String, ApiException>{};
  final _marks = <String, ChildMarks>{};
  final _marksErrors = <String, ApiException>{};
  final _badges = <String, List<BadgeAward>>{};

  final _busPositions = StreamController<BusPositionEvent>.broadcast();

  /// Live `transport.position` events, fed by the shell's realtime connection.
  Stream<BusPositionEvent> get busPositions => _busPositions.stream;
  void busMoved(BusPositionEvent e) {
    if (!_busPositions.isClosed) _busPositions.add(e);
  }

  @override
  void dispose() {
    _busPositions.close();
    super.dispose();
  }

  Child? get selected => children.where((c) => c.id == _selectedId).firstOrNull ?? children.firstOrNull;
  ChildSummary? summaryOf(String childId) => _summaries[childId];
  ApiException? summaryErrorOf(String childId) => _summaryErrors[childId];
  bool summaryLoading(String childId) => _summaryLoading.contains(childId);
  StudentFees? feesOf(String childId) => _fees[childId];
  ApiException? feesErrorOf(String childId) => _feesErrors[childId];
  LibraryAccount? libraryOf(String childId) => _library[childId];
  ApiException? libraryErrorOf(String childId) => _libraryErrors[childId];
  ChildMarks? marksOf(String childId) => _marks[childId];
  ApiException? marksErrorOf(String childId) => _marksErrors[childId];

  /// Badges teachers awarded the child, newest first (null until loaded).
  List<BadgeAward>? badgesOf(String childId) => _badges[childId];
  Child? byId(String? id) => children.where((c) => c.id == id).firstOrNull;
  Iterable<Child> inSection(String? sectionId) => children.where((c) => c.sectionId == sectionId);

  /// Loads the children (and the selected child's summary).
  Future<void> load() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      children = await api.children();
      _selectedId = _prefs.getString(_kChild);
      if (byId(_selectedId) == null) _selectedId = children.firstOrNull?.id;
    } on ApiException catch (e) {
      error = e;
    } finally {
      loading = false;
      notifyListeners();
    }
    final c = selected;
    await Future.wait([if (c != null) _loadAll(c.id), loadCalendar(), loadVisibility()]);
  }

  /// Which sections the school shows parents. Asked once; when it cannot be read everything shows
  /// and the server still refuses what is switched off.
  Future<void> loadVisibility() async {
    if (_visibilityLoaded) return;
    try {
      visibility = await api.visibility();
      _visibilityLoaded = true;
    } on ApiException {
      // Keep the default and try again with the next load.
    } finally {
      notifyListeners();
    }
  }

  /// Everything Home shows for a child. Each part fails on its own, so one problem never hides the rest.
  Future<void> _loadAll(String childId) =>
      Future.wait([loadSummary(childId), loadFees(childId), loadLibrary(childId), loadMarks(childId), loadBadges(childId)]);

  Future<void> select(String childId) async {
    if (childId == _selectedId) return;
    _selectedId = childId;
    await _prefs.setString(_kChild, childId);
    notifyListeners();
    await Future.wait([
      if (!_summaries.containsKey(childId)) loadSummary(childId),
      if (!_fees.containsKey(childId)) loadFees(childId),
      if (!_library.containsKey(childId)) loadLibrary(childId),
      if (!_marks.containsKey(childId)) loadMarks(childId),
      if (!_badges.containsKey(childId)) loadBadges(childId),
    ]);
  }

  Future<void> loadSummary(String childId) async {
    _summaryLoading.add(childId);
    _summaryErrors.remove(childId);
    notifyListeners();
    try {
      _summaries[childId] = await api.summary(childId);
    } on ApiException catch (e) {
      _summaryErrors[childId] = e;
    } finally {
      _summaryLoading.remove(childId);
      notifyListeners();
    }
  }

  /// The child's fees for the Home card. Kept separate from the summary so a fees problem
  /// never hides attendance and homework.
  Future<StudentFees?> loadFees(String childId) async {
    _feesErrors.remove(childId);
    try {
      return _fees[childId] = await api.fees(childId);
    } on ApiException catch (e) {
      _feesErrors[childId] = e;
      return null;
    } finally {
      notifyListeners();
    }
  }

  Future<LibraryAccount?> loadLibrary(String childId) async {
    _libraryErrors.remove(childId);
    try {
      return _library[childId] = await api.library(childId);
    } on ApiException catch (e) {
      _libraryErrors[childId] = e;
      return null;
    } finally {
      notifyListeners();
    }
  }

  Future<void> loadBadges(String childId) async {
    try {
      _badges[childId] = await api.badges(childId);
    } on ApiException {
      // Badges are a nicety: Home works without them.
    } finally {
      notifyListeners();
    }
  }

  Future<ChildMarks?> loadMarks(String childId) async {
    _marksErrors.remove(childId);
    try {
      return _marks[childId] = await api.marks(childId);
    } on ApiException catch (e) {
      _marksErrors[childId] = e;
      return null;
    } finally {
      notifyListeners();
    }
  }

  /// Pull to refresh: the children list and the selected child's summary, fees, library and
  /// marks, and the calendar.
  Future<void> refresh() async {
    if (children.isEmpty) return load();
    final c = selected;
    await Future.wait([if (c != null) _loadAll(c.id), loadCalendar()]);
  }

  // -- Calendar ---------------------------------------------------------------------------------

  /// Holidays, exams and events for the children's classes, from today for the next 90 days.
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

  /// A holiday today or tomorrow for [child]'s program: (holiday, is today).
  (CalendarEvent, bool)? holidaySoon(Child child) => calendar?.holidaySoon(program: child.programName);

  // -- Subjects and syllabus progress -----------------------------------------------------------

  final _subjects = <String, List<Subject>>{};
  final _coverage = <String, Coverage>{};

  List<Subject>? subjectsOf(String childId) => _subjects[childId];
  Coverage? coverageOf(String childId, String subjectId) => _coverage['$childId|$subjectId'];

  /// The subjects of [child]'s class (`GET /v1/parent/children/:id/subjects`), by name.
  Future<List<Subject>> loadSubjects(Child child) async {
    final subjects = [...await api.childSubjects(child.id)]..sort((a, b) => a.name.compareTo(b.name));
    _subjects[child.id] = subjects;
    notifyListeners();
    return subjects;
  }

  /// How much of [subjectId] [child]'s class has been taught. A failure leaves it out.
  Future<Coverage?> loadCoverage(Child child, String subjectId) async {
    try {
      final c = _coverage['${child.id}|$subjectId'] = await api.coverage(sectionId: child.sectionId, subjectId: subjectId);
      notifyListeners();
      return c;
    } on ApiException {
      return _coverage['${child.id}|$subjectId'];
    }
  }

  final _plans = <String, YearPlan?>{};

  /// [childId]'s class's year plan for [subjectId], once loaded (null also when there is none).
  YearPlan? planOf(String childId, String subjectId) => _plans['$childId|$subjectId'];

  /// The class's year plan for [subjectId] (null: the teacher has not made one). A failure keeps
  /// what we had: the plan is extra information.
  Future<YearPlan?> loadPlan(Child child, String subjectId) async {
    final key = '${child.id}|$subjectId';
    try {
      final p = _plans[key] = await api.yearPlan(sectionId: child.sectionId, subjectId: subjectId);
      notifyListeners();
      return p;
    } on ApiException {
      return _plans[key];
    }
  }

  /// The institution's today for [child] (from their summary or the calendar), else the device's.
  DateTime todayFor(Child child) => summaryOf(child.id)?.today ?? calendar?.today ?? DateTime.now();

  /// The child (in [sectionId]) whose published marks include [assessmentId], with that result.
  /// Reloads their marks, since the notification means something new was published.
  Future<(Child, AssessmentResult?)?> findAssessment(String? assessmentId, {String? sectionId}) async {
    if (children.isEmpty) await load();
    final candidates = sectionId == null ? children : inSection(sectionId).toList();
    for (final child in candidates.isEmpty ? children : candidates) {
      final m = await loadMarks(child.id);
      final a = assessmentId == null ? null : m?.byId(assessmentId);
      if (a != null) return (child, a);
    }
    final first = candidates.firstOrNull;
    return first == null ? null : (first, null);
  }

  /// The child a new fee (titled [title]) is for. The notification names only the class's batch,
  /// so this reloads each child's fees (the selected child first) and matches the title.
  Future<Child?> findFeeChild({String? title}) async {
    if (children.isEmpty) await load();
    if (children.length <= 1) return children.firstOrNull;
    if (title != null) {
      final first = selected;
      for (final child in [?first, ...children.where((c) => c.id != first?.id)]) {
        final fees = await loadFees(child.id);
        if (fees != null && fees.invoices.any((i) => i.title == title)) return child;
      }
    }
    return selected;
  }

  /// Finds a homework by id for [studentId] (a checked or returned hand-in), else among the
  /// children in [sectionId], loading summaries as needed.
  Future<(Child, Homework)?> findHomework(String homeworkId, {String? sectionId, String? studentId}) async {
    if (children.isEmpty) await load();
    final named = byId(studentId);
    final candidates = named != null
        ? [named]
        : sectionId == null
        ? children
        : inSection(sectionId).toList();
    for (final child in candidates) {
      if (!_summaries.containsKey(child.id)) await loadSummary(child.id);
      final s = _summaries[child.id];
      if (s == null) continue;
      for (final hw in [...s.upcoming, ...s.pastHomework]) {
        if (hw.id == homeworkId) return (child, hw);
      }
    }
    // Older than the summary window: ask for it directly.
    try {
      final found = await api.homeworkById(homeworkId);
      final child = named ?? inSection(found.sectionId).firstOrNull;
      return child == null ? null : (child, found.homework);
    } on ApiException {
      return null;
    }
  }

  /// A recording as a child's summary lists it (with whether they missed that class), from
  /// summaries already loaded. Null when it is not among them.
  (Child, RecordingInfo)? findRecording(String recordingId, {String? sectionId}) {
    final candidates = sectionId == null ? children : inSection(sectionId);
    for (final child in candidates) {
      final r = _summaries[child.id]?.recordings.where((r) => r.id == recordingId).firstOrNull;
      if (r != null) return (child, r);
    }
    return null;
  }
}
