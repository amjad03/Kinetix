import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Where one class is in one topic: the step it reached, and whether the topic was taught.
@immutable
class TopicProgress {
  const TopicProgress({required this.step, required this.total, this.taught = false, this.at});

  /// The step shown last (0-based) of [total].
  final int step, total;
  final bool taught;
  final DateTime? at;

  bool get started => taught || step > 0;

  Map<String, dynamic> toJson() => {'step': step, 'total': total, 'taught': taught, if (at != null) 'at': at!.toIso8601String()};
  static TopicProgress fromJson(Map<String, dynamic> j) => TopicProgress(
    step: (j['step'] as num?)?.toInt() ?? 0,
    total: (j['total'] as num?)?.toInt() ?? 1,
    taught: j['taught'] == true,
    at: DateTime.tryParse('${j['at'] ?? ''}'),
  );
}

/// The lessons each class has been taught on this board (shared preferences, one key per
/// class): the step each topic reached, topics marked taught, and the last topic opened, so
/// the panel continues where the class stopped and the start screen names the next lesson.
/// Loaded once ([load]); reads after that are synchronous.
class LessonProgress extends ChangeNotifier {
  LessonProgress({DateTime Function()? now}) : _now = now ?? DateTime.now;

  static LessonProgress instance = LessonProgress();

  /// The progress of a board with no class open (an ERP-paired board, a free period).
  static const noClass = '_board';
  static const _prefix = 'ce.lessons.';

  final DateTime Function() _now;
  final _byClass = <String, Map<String, TopicProgress>>{};
  final _last = <String, String>{};
  Future<void>? _loading;
  bool _loaded = false;
  bool get loaded => _loaded;

  Future<void> load() => _loading ??= () async {
    final p = await SharedPreferences.getInstance();
    for (final k in p.getKeys()) {
      if (!k.startsWith(_prefix)) continue;
      try {
        final j = jsonDecode(p.getString(k) ?? '{}') as Map<String, dynamic>;
        final cls = k.substring(_prefix.length);
        _byClass[cls] = {for (final e in ((j['topics'] as Map?) ?? const {}).entries) '${e.key}': TopicProgress.fromJson((e.value as Map).cast<String, dynamic>())};
        if (j['last'] is String) _last[cls] = j['last'] as String;
      } catch (_) {
        // A damaged entry starts that class afresh.
      }
    }
    _loaded = true;
    notifyListeners();
  }();

  Map<String, TopicProgress> topicsOf(String classId) => _byClass[classId] ?? const {};
  TopicProgress? of(String classId, String topicId) => _byClass[classId]?[topicId];

  /// The topic this class opened last.
  String? lastTopic(String classId) => _last[classId];

  /// The class reached [step] of [total] in [topicId] (it becomes the last topic).
  void setStep(String classId, String topicId, int step, int total) {
    final old = of(classId, topicId);
    _put(classId, topicId, TopicProgress(step: step, total: total, taught: (old?.taught ?? false) || step >= total - 1, at: _now()));
  }

  void markTaught(String classId, String topicId, {bool taught = true, int? total}) {
    final old = of(classId, topicId);
    final t = total ?? old?.total ?? 1;
    _put(classId, topicId, TopicProgress(step: taught ? t - 1 : 0, total: t, taught: taught, at: _now()));
  }

  void _put(String classId, String topicId, TopicProgress p) {
    (_byClass[classId] ??= {})[topicId] = p;
    _last[classId] = topicId;
    notifyListeners();
    unawaited(_save(classId));
  }

  Future<void> _save(String classId) async {
    final p = await SharedPreferences.getInstance();
    await p.setString('$_prefix$classId', jsonEncode({'topics': {for (final e in topicsOf(classId).entries) e.key: e.value.toJson()}, if (_last[classId] != null) 'last': _last[classId]}));
  }

  /// Forgets everything (tests).
  @visibleForTesting
  void reset() {
    _byClass.clear();
    _last.clear();
    _loading = null;
    _loaded = false;
  }
}
