/// The class buzzer as the student sees it: whether the teacher opened it, whether it is locked
/// and the student's place in this round (1 = first).
class BuzzerStatus {
  const BuzzerStatus({required this.active, required this.locked, required this.roundNo, this.myRank, this.firstName});

  factory BuzzerStatus.fromJson(Map<String, dynamic> j) => BuzzerStatus(
    active: j['active'] as bool? ?? false,
    locked: j['locked'] as bool? ?? true,
    roundNo: (j['roundNo'] as num?)?.toInt() ?? 0,
    myRank: (j['myRank'] as num?)?.toInt(),
    firstName: j['firstName'] as String?,
  );

  /// The teacher has opened the buzzer in the class that is on the board now.
  final bool active;
  final bool locked;
  final int roundNo;
  final int? myRank;
  final String? firstName;

  /// May press now: open, not locked, and not pressed yet this round.
  bool get canPress => active && !locked && myRank == null;
}

/// Notes the teacher published when ending a class.
class ClassNote {
  const ClassNote({required this.id, required this.title, required this.teacher, required this.notes, this.publishedAt});

  factory ClassNote.fromJson(Map<String, dynamic> j) => ClassNote(
    id: j['id'] as String,
    title: j['title'] as String? ?? '',
    teacher: j['teacher'] as String? ?? '',
    notes: j['notes'] as String? ?? '',
    publishedAt: DateTime.tryParse(j['publishedAt'] as String? ?? ''),
  );

  final String id;
  final String title;
  final String teacher;
  final String notes;
  final DateTime? publishedAt;
}
