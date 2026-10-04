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

  /// A local session for the practice board: no teacher, nothing is synced.
  factory SessionContext.practice() => SessionContext(
        sessionId: 'practice',
        expiresAt: DateTime.now().add(const Duration(hours: 8)),
        teacherId: '',
        teacherName: 'Practice board',
        language: 'en',
      );

  final String sessionId;
  final DateTime expiresAt;
  final String teacherId;
  final String teacherName;
  final String language;
  final String? sectionName;
  final String? subjectName;
  final String? periodLabel;

  bool get isPractice => sessionId == 'practice';
}

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

  factory PairingCode.fromJson(Map<String, dynamic> j) => PairingCode(
        code: j['code'] as String,
        qrPayload: j['qrPayload'] as String,
        expiresAt: DateTime.parse(j['expiresAt'] as String),
      );

  final String code;
  final String qrPayload;
  final DateTime expiresAt;

  /// "482913" → "482 913", easier to read from the back of the room.
  String get display => '${code.substring(0, 3)} ${code.substring(3)}';
}
