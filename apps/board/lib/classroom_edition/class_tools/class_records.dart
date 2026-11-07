import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../../core/device_store.dart';

/// One class-quiz question as marked: who was right and who was wrong, by roll number only.
@immutable
class QuizRecord {
  const QuizRecord({required this.at, required this.questionId, required this.chapterId, this.topic = '', this.topicTitle = '', this.right = const [], this.wrong = const []});

  final DateTime at;
  final String questionId;
  final String chapterId;
  final String topic;

  /// The topic's title when marked (the mastery map's row, even without the bank).
  final String topicTitle;
  final List<int> right;
  final List<int> wrong;

  Map<String, dynamic> toJson() => {'at': at.toIso8601String(), 'q': questionId, 'ch': chapterId, 'tp': topic, 'tt': topicTitle, 'r': right, 'w': wrong};

  static QuizRecord fromJson(Map<String, dynamic> j) => QuizRecord(
    at: DateTime.tryParse('${j['at']}') ?? DateTime(2000),
    questionId: '${j['q'] ?? ''}',
    chapterId: '${j['ch'] ?? ''}',
    topic: '${j['tp'] ?? ''}',
    topicTitle: '${j['tt'] ?? ''}',
    right: _ints(j['r']),
    wrong: _ints(j['w']),
  );
}

/// A mock test given to the class: what it covered and the marks per roll number.
@immutable
class MockRecord {
  const MockRecord({required this.id, required this.at, required this.title, required this.maxMarks, this.chapterIds = const [], this.topics = const {}, this.marks = const {}});

  final String id;
  final DateTime at;

  /// "Mock test 2".
  final String title;
  final double maxMarks;
  final List<String> chapterIds;

  /// The topics the paper asked about: "chapterId|t3" → topic title.
  final Map<String, String> topics;

  /// Marks by roll number (rolls not entered are absent from the map).
  final Map<int, double> marks;

  double? get average => marks.isEmpty ? null : marks.values.reduce((a, b) => a + b) / marks.length;

  MockRecord withMarks(Map<int, double> m) => MockRecord(id: id, at: at, title: title, maxMarks: maxMarks, chapterIds: chapterIds, topics: topics, marks: m);

  Map<String, dynamic> toJson() => {
    'id': id,
    'at': at.toIso8601String(),
    't': title,
    'max': maxMarks,
    'ch': chapterIds,
    'tp': topics,
    'm': {for (final e in marks.entries) '${e.key}': e.value},
  };

  static MockRecord fromJson(Map<String, dynamic> j) => MockRecord(
    id: '${j['id']}',
    at: DateTime.tryParse('${j['at']}') ?? DateTime(2000),
    title: '${j['t'] ?? 'Mock test'}',
    maxMarks: (j['max'] as num?)?.toDouble() ?? 0,
    chapterIds: [for (final c in (j['ch'] as List?) ?? const []) '$c'],
    topics: {for (final e in ((j['tp'] as Map?) ?? const {}).entries) '${e.key}': '${e.value}'},
    marks: {
      for (final e in ((j['m'] as Map?) ?? const {}).entries)
        if (int.tryParse('${e.key}') != null && e.value is num) int.parse('${e.key}'): (e.value as num).toDouble(),
    },
  );
}

/// A team: its name, roll numbers and points.
@immutable
class TeamRecord {
  const TeamRecord({required this.name, required this.rolls, this.points = 0});

  final String name;
  final List<int> rolls;
  final int points;

  TeamRecord withPoints(int p) => TeamRecord(name: name, rolls: rolls, points: p);

  Map<String, dynamic> toJson() => {'n': name, 'r': rolls, 'p': points};
  static TeamRecord fromJson(Map<String, dynamic> j) => TeamRecord(name: '${j['n'] ?? ''}', rolls: _ints(j['r']), points: (j['p'] as num?)?.toInt() ?? 0);
}

/// The class plan for one subject: the exam date and the chapters done.
@immutable
class PlanRecord {
  const PlanRecord({required this.examDate, this.done = const {}, this.revisionWeeks = 3});

  final DateTime examDate;
  final Set<String> done;
  final int revisionWeeks;

  PlanRecord copyWith({DateTime? examDate, Set<String>? done, int? revisionWeeks}) =>
      PlanRecord(examDate: examDate ?? this.examDate, done: done ?? this.done, revisionWeeks: revisionWeeks ?? this.revisionWeeks);

  Map<String, dynamic> toJson() => {'exam': examDate.toIso8601String(), 'done': done.toList(), 'rev': revisionWeeks};
  static PlanRecord fromJson(Map<String, dynamic> j) =>
      PlanRecord(examDate: DateTime.tryParse('${j['exam']}') ?? DateTime(2027, 3, 1), done: {for (final d in (j['done'] as List?) ?? const []) '$d'}, revisionWeeks: (j['rev'] as num?)?.toInt() ?? 3);
}

/// What the Class tools keep for one class on this board (roll numbers only, never a name):
/// class-quiz marks, mock tests and their marks, teams and the class plan per subject.
@immutable
class ClassRecords {
  const ClassRecords({this.quizzes = const [], this.mocks = const [], this.teams = const [], this.plans = const {}});

  final List<QuizRecord> quizzes;
  final List<MockRecord> mocks;
  final List<TeamRecord> teams;

  /// By subject slug.
  final Map<String, PlanRecord> plans;

  /// Quiz records kept per class (the oldest go first).
  static const maxQuizzes = 2000;

  ClassRecords copyWith({List<QuizRecord>? quizzes, List<MockRecord>? mocks, List<TeamRecord>? teams, Map<String, PlanRecord>? plans}) =>
      ClassRecords(quizzes: quizzes ?? this.quizzes, mocks: mocks ?? this.mocks, teams: teams ?? this.teams, plans: plans ?? this.plans);

  Map<String, dynamic> toJson() => {
    'v': 1,
    'quizzes': [for (final q in quizzes) q.toJson()],
    'mocks': [for (final m in mocks) m.toJson()],
    'teams': [for (final t in teams) t.toJson()],
    'plans': {for (final e in plans.entries) e.key: e.value.toJson()},
  };

  static ClassRecords fromJson(Map<String, dynamic> j) {
    List<T> list<T>(String k, T Function(Map<String, dynamic>) f) => [
      for (final e in (j[k] as List?) ?? const [])
        if (e is Map) f(e.cast<String, dynamic>()),
    ];
    return ClassRecords(
      quizzes: list('quizzes', QuizRecord.fromJson),
      mocks: list('mocks', MockRecord.fromJson),
      teams: list('teams', TeamRecord.fromJson),
      plans: {
        for (final e in ((j['plans'] as Map?) ?? const {}).entries)
          if (e.value is Map) '${e.key}': PlanRecord.fromJson((e.value as Map).cast<String, dynamic>()),
      },
    );
  }
}

/// Keeps one class's [ClassRecords] in the board's settings ([DeviceStore], shared
/// preferences), under `classTools.<classId>`.
class ClassToolsStore extends ChangeNotifier {
  ClassToolsStore({required this.deviceStore, required this.classId});

  final DeviceStore deviceStore;
  final String classId;
  ClassRecords records = const ClassRecords();
  bool loaded = false;

  String get key => 'classTools.$classId';

  Future<void> load() async {
    try {
      final raw = await deviceStore.setting(key);
      if (raw != null) records = ClassRecords.fromJson((jsonDecode(raw) as Map).cast<String, dynamic>());
    } catch (e) {
      debugPrint('Class tools records unreadable, starting fresh: $e');
    }
    loaded = true;
    notifyListeners();
  }

  Future<void> _save(ClassRecords r) async {
    records = r;
    notifyListeners();
    try {
      await deviceStore.setSetting(key, jsonEncode(r.toJson()));
    } catch (e) {
      debugPrint('Class tools records not saved: $e');
    }
  }

  Future<void> addQuiz(QuizRecord q) {
    final all = [...records.quizzes, q];
    return _save(records.copyWith(quizzes: all.length > ClassRecords.maxQuizzes ? all.sublist(all.length - ClassRecords.maxQuizzes) : all));
  }

  /// Adds [m] or replaces the mock test with its id.
  Future<void> putMock(MockRecord m) {
    final i = records.mocks.indexWhere((x) => x.id == m.id);
    return _save(records.copyWith(mocks: i < 0 ? [...records.mocks, m] : [for (final x in records.mocks) x.id == m.id ? m : x]));
  }

  Future<void> setTeams(List<TeamRecord> t) => _save(records.copyWith(teams: t));

  Future<void> setPlan(String subject, PlanRecord p) => _save(records.copyWith(plans: {...records.plans, subject: p}));
}

List<int> _ints(Object? v) => [
  for (final e in (v as List?) ?? const [])
    if (e is num) e.toInt(),
];
