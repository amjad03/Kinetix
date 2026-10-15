// Question paper setting appointments (`GET /v1/qp-appointments/mine`) and marks unlock requests
// (`GET /v1/marks-unlock-requests`) for the teacher.

/// A setter or moderator appointment for one paper of an exam session.
class QpAppointment {
  const QpAppointment({required this.id, required this.role, required this.status, required this.setsRequired, required this.dueOn, required this.session, required this.code, required this.subject, required this.setsMade, required this.toModerate, required this.remunerationPaise, this.note});

  factory QpAppointment.fromJson(Map<String, dynamic> j) => QpAppointment(
    id: '${j['id']}',
    role: '${j['role']}',
    status: '${j['status']}',
    setsRequired: (j['setsRequired'] as num?)?.toInt() ?? 0,
    dueOn: '${j['dueOn']}',
    session: '${j['session']}',
    code: '${j['code']}',
    subject: '${j['subject']}',
    setsMade: (j['setsMade'] as num?)?.toInt() ?? 0,
    toModerate: (j['toModerate'] as num?)?.toInt() ?? 0,
    remunerationPaise: (j['remunerationPaise'] as num?)?.toInt() ?? 0,
    note: j['note'] as String?,
  );

  final String id, role, status, dueOn, session, code, subject;
  final int setsRequired, setsMade, toModerate, remunerationPaise;
  final String? note;

  bool get waiting => status == 'appointed';
  bool get setter => role == 'setter';
}

/// A request to reopen submitted or locked marks.
class UnlockRequest {
  const UnlockRequest({required this.id, required this.assessment, required this.section, required this.code, required this.reason, required this.status, required this.mine, this.decisionNote});

  factory UnlockRequest.fromJson(Map<String, dynamic> j) => UnlockRequest(
    id: '${j['id']}',
    assessment: '${j['assessment']}',
    section: '${j['section']}',
    code: '${j['code']}',
    reason: '${j['reason']}',
    status: '${j['status']}',
    mine: j['mine'] == true,
    decisionNote: j['decisionNote'] as String?,
  );

  final String id, assessment, section, code, reason, status;
  final bool mine;
  final String? decisionNote;
}
