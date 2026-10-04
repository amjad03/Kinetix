/// Mirrors packages/shared/src/index.ts.
library;

class SessionContext {
  SessionContext({
    required this.sessionId,
    required this.expiresAt,
    required this.teacherId,
    required this.teacherName,
    required this.language,
    this.sectionName,
    this.subjectName,
    this.periodLabel,
  });

  factory SessionContext.fromJson(Map<String, dynamic> j) {
    final teacher = j['teacher'] as Map<String, dynamic>;
    final section = j['section'] as Map<String, dynamic>?;
    final subject = j['subject'] as Map<String, dynamic>?;
    final period = j['period'] as Map<String, dynamic>?;
    String hhmm(String t) => t.substring(0, 5);
    return SessionContext(
      sessionId: j['sessionId'] as String,
      expiresAt: DateTime.parse(j['expiresAt'] as String),
      teacherId: teacher['id'] as String,
      teacherName: teacher['fullName'] as String,
      language: teacher['preferredLanguage'] as String,
      sectionName: section?['displayName'] as String?,
      subjectName: subject?['name'] as String?,
      periodLabel: period == null ? null : '${hhmm(period['startsAt'] as String)}–${hhmm(period['endsAt'] as String)}',
    );
  }

  final String sessionId;
  final DateTime expiresAt;
  final String teacherId;
  final String teacherName;
  final String language;
  final String? sectionName;
  final String? subjectName;
  final String? periodLabel;

  /// "BCom Sem 3 A · Corporate Accounting", or null for a session with no timetabled class.
  String? get classLabel {
    final label = [sectionName, subjectName].whereType<String>().join(' · ');
    return label.isEmpty ? null : label;
  }
}

class Student {
  Student({required this.id, required this.rollNo, required this.fullName});

  factory Student.fromJson(Map<String, dynamic> j) =>
      Student(id: j['id'] as String, rollNo: j['rollNo'] as String, fullName: j['fullName'] as String);

  final String id;
  final String rollNo;
  final String fullName;
}

enum AttendanceMark { present, absent, late }

enum AnswerOutcome { correct, partial, incorrect, skipped }

enum BroadcastPriority { info, important, emergency }

class BroadcastMessage {
  BroadcastMessage({
    required this.id,
    required this.title,
    required this.body,
    required this.priority,
    required this.requiresAck,
    required this.senderName,
    required this.expiresAt,
  });

  factory BroadcastMessage.fromJson(Map<String, dynamic> j) => BroadcastMessage(
    id: j['id'] as String,
    title: j['title'] as String,
    body: j['body'] as String,
    priority: BroadcastPriority.values.byName(j['priority'] as String),
    requiresAck: j['requiresAck'] as bool,
    senderName: (j['sender'] as Map<String, dynamic>)['fullName'] as String,
    expiresAt: DateTime.parse(j['expiresAt'] as String),
  );

  final String id;
  final String title;
  final String body;
  final BroadcastPriority priority;
  final bool requiresAck;
  final String senderName;
  final DateTime expiresAt;
}

class PairingCode {
  PairingCode({required this.code, required this.qrPayload, required this.expiresAt});

  factory PairingCode.fromJson(Map<String, dynamic> j) =>
      PairingCode(code: j['code'] as String, qrPayload: j['qrPayload'] as String, expiresAt: DateTime.parse(j['expiresAt'] as String));

  final String code;
  final String qrPayload;
  final DateTime expiresAt;

  /// "482913" → "482 913", easier to read from the back of the room.
  String get display => '${code.substring(0, 3)} ${code.substring(3)}';
}

/// A saved board as listed by `GET /v1/whiteboards`.
class WhiteboardSummary {
  WhiteboardSummary({
    required this.id,
    required this.title,
    required this.pageCount,
    required this.updatedAt,
    this.sectionName,
    this.subjectName,
    this.sharedAt,
  });

  factory WhiteboardSummary.fromJson(Map<String, dynamic> j) => WhiteboardSummary(
    id: j['id'] as String,
    title: j['title'] as String,
    pageCount: j['pageCount'] as int,
    updatedAt: DateTime.parse(j['updatedAt'] as String),
    sectionName: j['sectionName'] as String?,
    subjectName: j['subjectName'] as String?,
    sharedAt: j['sharedAt'] == null ? null : DateTime.parse(j['sharedAt'] as String),
  );

  final String id;
  final String title;
  final int pageCount;
  final DateTime updatedAt;
  final String? sectionName;
  final String? subjectName;
  final DateTime? sharedAt;

  bool get shared => sharedAt != null;
}
