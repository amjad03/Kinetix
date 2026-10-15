// Examination applications (`GET /v1/students/:id/exam-applications`, `POST /v1/exam-sessions/:id/application`).

/// One subject the student may write in a session: this term's paper, a backlog or an improvement paper.
class ApplicationSubject {
  const ApplicationSubject({required this.subjectId, required this.code, required this.name, required this.kind, required this.eligible, required this.reasons, required this.feePaise, required this.chosen, this.examDate});

  factory ApplicationSubject.fromJson(Map<String, dynamic> j) => ApplicationSubject(
    subjectId: '${j['subjectId']}',
    code: '${j['code']}',
    name: '${j['name']}',
    kind: '${j['kind']}',
    eligible: j['eligible'] == true,
    reasons: [for (final r in (j['reasons'] as List? ?? const [])) '$r'],
    feePaise: (j['feePaise'] as num?)?.toInt() ?? 0,
    chosen: j['chosen'] == true,
    examDate: j['examDate'] as String?,
  );

  final String subjectId, code, name, kind;
  final bool eligible, chosen;
  final List<String> reasons;
  final int feePaise;
  final String? examDate;

  /// This term's papers are always written; backlog and improvement papers are chosen.
  bool get optional => kind != 'regular';
}

/// The application form of one session, with the student's application once it is submitted.
class ExamApplication {
  const ExamApplication({required this.sessionId, required this.sessionName, required this.windowState, required this.closesOn, required this.blockers, required this.subjects, required this.minimumPaise, required this.lateFeePaise, required this.canSubmit, this.applicationNo, this.status, this.feePaise, this.feeStatus, this.invoiceNo});

  factory ExamApplication.fromJson(Map<String, dynamic> j) {
    final session = (j['session'] as Map).cast<String, dynamic>();
    final window = (j['window'] as Map?)?.cast<String, dynamic>();
    final fee = (j['fee'] as Map).cast<String, dynamic>();
    final app = (j['application'] as Map?)?.cast<String, dynamic>();
    final appFee = (app?['fee'] as Map?)?.cast<String, dynamic>();
    return ExamApplication(
      sessionId: '${session['id']}',
      sessionName: '${session['name']}',
      windowState: '${window?['state'] ?? 'closed'}',
      closesOn: (window?['lateUntil'] ?? window?['closesOn']) as String?,
      blockers: [for (final b in (j['blockers'] as List? ?? const [])) '$b'],
      subjects: [for (final s in (j['subjects'] as List? ?? const [])) ApplicationSubject.fromJson((s as Map).cast<String, dynamic>())],
      minimumPaise: (fee['minimumPaise'] as num?)?.toInt() ?? 0,
      lateFeePaise: (fee['lateFeePaise'] as num?)?.toInt() ?? 0,
      canSubmit: j['canSubmit'] == true,
      applicationNo: app?['applicationNo'] as String?,
      status: app?['status'] as String?,
      feePaise: (appFee?['amountPaise'] as num?)?.toInt(),
      feeStatus: appFee?['status'] as String?,
      invoiceNo: appFee?['invoiceNo'] as String?,
    );
  }

  final String sessionId, sessionName, windowState;
  final String? closesOn, applicationNo, status, feeStatus, invoiceNo;
  final List<String> blockers;
  final List<ApplicationSubject> subjects;
  final int minimumPaise, lateFeePaise;
  final int? feePaise;
  final bool canSubmit;

  bool get submitted => status != null;

  /// The fee of a choice by the rule the exam office uses: eligible papers, at least the minimum, plus any late fee.
  int feeFor(Set<String> chosen) {
    final counted = subjects.where((s) => s.eligible && (!s.optional || chosen.contains(s.subjectId)));
    if (counted.isEmpty) return 0;
    final papers = counted.fold<int>(0, (a, s) => a + s.feePaise);
    return (papers > minimumPaise ? papers : minimumPaise) + lateFeePaise;
  }
}

/// Rupees from paise, with two decimals.
String rupeesOf(int paise) => (paise / 100).toStringAsFixed(2);
