import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';
import 'lms.dart';

/// The courses kept on the phone for low-bandwidth and offline use: the last bundle from `GET /v1/lms/my/offline`
/// (lesson text included) and the progress recorded while offline, sent back with `POST /v1/lms/my/progress/sync`
/// when the connection returns. Repeating a sync changes nothing on the server.
class LmsOfflineStore {
  LmsOfflineStore(this.prefs, this.studentId);

  final SharedPreferences prefs;
  final String studentId;

  String get _bundleKey => 'lms.offline.$studentId';
  String get _queueKey => 'lms.queue.$studentId';

  /// Downloads the bundle and keeps it; returns false when there is no connection (the old copy stays).
  Future<bool> refresh(StudentApi api) async {
    try {
      final b = await api.lmsOfflineBundle(studentId);
      await prefs.setString(_bundleKey, jsonEncode(b));
      return true;
    } on ApiException {
      return false;
    }
  }

  /// When the copy on the phone was made, or null without one.
  DateTime? get savedAt {
    final b = _bundle();
    return b == null ? null : DateTime.tryParse('${b['generatedAt']}')?.toLocal();
  }

  Map<String, dynamic>? _bundle() {
    final raw = prefs.getString(_bundleKey);
    if (raw == null) return null;
    try {
      return (jsonDecode(raw) as Map).cast<String, dynamic>();
    } on FormatException {
      return null;
    }
  }

  /// The courses as summaries, from the copy on the phone.
  List<LmsCourseSummary> courses() => [
    for (final c in ((_bundle()?['courses'] as List?) ?? const []))
      () {
        final m = (c as Map).cast<String, dynamic>();
        final comp = (m['completion'] as Map?)?.cast<String, dynamic>() ?? const {};
        return LmsCourseSummary(courseId: m['id'] as String, title: m['title'] as String? ?? '', subject: m['subject'] as String? ?? '', moduleCount: (m['modules'] as List? ?? const []).length, completionPct: (comp['pct'] as num?)?.toInt() ?? 0, itemsDone: (comp['done'] as num?)?.toInt() ?? 0, itemsTotal: (comp['total'] as num?)?.toInt() ?? 0);
      }(),
  ];

  /// One course from the copy on the phone, with what was finished offline marked done.
  LmsCourseDetail? course(String courseId) {
    final c = ((_bundle()?['courses'] as List?) ?? const []).cast<Map>().where((m) => m['id'] == courseId).firstOrNull;
    if (c == null) return null;
    final detail = LmsCourseDetail.fromOffline(c.cast<String, dynamic>());
    final queued = {for (final e in pending()) if (e['completed'] == true || _ruleOf(detail, '${e['itemId']}') == 'view') '${e['itemId']}'};
    return LmsCourseDetail(
      title: detail.title,
      subject: detail.subject,
      description: '',
      modules: [for (final m in detail.modules) LmsModule(title: m.title, items: [for (final i in m.items) queued.contains(i.id) ? i.copyWith(completed: true) : i])],
      announcements: detail.announcements,
      parts: const [],
      completion: detail.completion,
      offlineCopy: true,
    );
  }

  String? _ruleOf(LmsCourseDetail d, String itemId) {
    for (final m in d.modules) {
      for (final i in m.items) {
        if (i.id == itemId) return i.completionRule;
      }
    }
    return null;
  }

  /// Progress waiting to be sent.
  List<Map<String, Object>> pending() {
    final raw = prefs.getString(_queueKey);
    if (raw == null) return [];
    return [for (final e in jsonDecode(raw) as List) (e as Map).cast<String, Object>()];
  }

  /// Records progress made without a connection (at most 200 kept, oldest dropped).
  Future<void> queue(String itemId, {bool completed = false, DateTime? at}) async {
    final list = [...pending(), {'itemId': itemId, 'at': (at ?? DateTime.now()).toUtc().toIso8601String(), 'completed': completed}];
    await prefs.setString(_queueKey, jsonEncode(list.length > 200 ? list.sublist(list.length - 200) : list));
  }

  /// Sends the queued progress; the queue is cleared once the server has it. Returns how many were applied.
  Future<int> sync(StudentApi api) async {
    final list = pending();
    if (list.isEmpty) return 0;
    try {
      final n = await api.syncLmsProgress(list);
      await prefs.remove(_queueKey);
      return n;
    } on ApiException catch (e) {
      // Refused for good (bad data, signed out of this class): drop it rather than retry forever.
      if (e.status >= 400 && e.status < 500 && e.status != 401 && e.status != 408 && e.status != 429) await prefs.remove(_queueKey);
      return 0;
    }
  }
}
