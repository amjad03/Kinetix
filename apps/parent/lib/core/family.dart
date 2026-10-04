import 'package:flutter/foundation.dart';
import 'package:kinetix_lesson/kinetix_lesson.dart' show RecordingInfo;
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';
import 'models.dart';

/// The parent's children, which one is selected (remembered), and each child's Home summary.
class FamilyController extends ChangeNotifier {
  FamilyController(this.api, this._prefs);

  final ParentApi api;
  final SharedPreferences _prefs;
  static const _kChild = 'selected_child';

  List<Child> children = [];
  bool loading = false;
  String? error;
  String? _selectedId;

  final _summaries = <String, ChildSummary>{};
  final _summaryErrors = <String, String>{};
  final _summaryLoading = <String>{};

  Child? get selected => children.where((c) => c.id == _selectedId).firstOrNull ?? children.firstOrNull;
  ChildSummary? summaryOf(String childId) => _summaries[childId];
  String? summaryErrorOf(String childId) => _summaryErrors[childId];
  bool summaryLoading(String childId) => _summaryLoading.contains(childId);
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
      error = e.message;
    } finally {
      loading = false;
      notifyListeners();
    }
    final c = selected;
    if (c != null) await loadSummary(c.id);
  }

  Future<void> select(String childId) async {
    if (childId == _selectedId) return;
    _selectedId = childId;
    await _prefs.setString(_kChild, childId);
    notifyListeners();
    if (!_summaries.containsKey(childId)) await loadSummary(childId);
  }

  Future<void> loadSummary(String childId) async {
    _summaryLoading.add(childId);
    _summaryErrors.remove(childId);
    notifyListeners();
    try {
      _summaries[childId] = await api.summary(childId);
    } on ApiException catch (e) {
      _summaryErrors[childId] = e.message;
    } finally {
      _summaryLoading.remove(childId);
      notifyListeners();
    }
  }

  /// Pull to refresh: the children list and the selected child's summary.
  Future<void> refresh() async {
    if (children.isEmpty) return load();
    final c = selected;
    if (c != null) await loadSummary(c.id);
  }

  /// Finds a homework by id among the children in [sectionId], loading summaries as needed.
  Future<(Child, Homework)?> findHomework(String homeworkId, {String? sectionId}) async {
    if (children.isEmpty) await load();
    final candidates = sectionId == null ? children : inSection(sectionId).toList();
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
      final child = inSection(found.sectionId).firstOrNull;
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
