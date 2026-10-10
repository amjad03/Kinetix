/// Repair requests and fee instalment schedules, as the Cloud API sends them
/// (`GET /v1/hostel/work-orders/mine`, `GET /v1/fees/invoices/:id/instalments`).
library;

int _n(Object? v) => (v as num?)?.round() ?? 0;

/// A repair the person asked for (from a hostel complaint) and where it stands: open, assigned, in progress, done or verified.
class RepairRequest {
  const RepairRequest({required this.id, required this.title, required this.status, this.complaint = '', this.dueOn, this.completedAt});

  factory RepairRequest.fromJson(Map<String, dynamic> j) => RepairRequest(
    id: '${j['id']}',
    title: '${j['title'] ?? ''}',
    status: '${j['status'] ?? 'open'}',
    complaint: '${j['complaint'] ?? ''}',
    dueOn: j['dueOn'] == null ? null : DateTime.parse('${j['dueOn']}'),
    completedAt: j['completedAt'] == null ? null : DateTime.parse('${j['completedAt']}').toLocal(),
  );

  /// A hostel complaint about the child (`GET /v1/hostel/complaints?studentId=`), shown as a repair: resolved counts as done.
  factory RepairRequest.fromComplaint(Map<String, dynamic> j) => RepairRequest(
    id: '${j['id']}',
    title: '${j['description'] ?? ''}',
    status: switch ('${j['status']}') { 'resolved' => 'done', 'in_progress' => 'in_progress', _ => 'open' },
    completedAt: j['resolvedAt'] == null ? null : DateTime.parse('${j['resolvedAt']}').toLocal(),
  );

  final String id;
  final String title;

  /// `open`, `reopened`, `assigned`, `in_progress`, `done` or `verified`.
  final String status;
  final String complaint;
  final DateTime? dueOn;
  final DateTime? completedAt;

  bool get finished => status == 'done' || status == 'verified';
}

/// One part of a fee split into instalments.
class Instalment {
  const Instalment({required this.seq, required this.dueOn, required this.amountPaise, required this.paidPaise, required this.status});

  factory Instalment.fromJson(Map<String, dynamic> j) => Instalment(
    seq: _n(j['seq']),
    dueOn: DateTime.parse('${j['dueOn']}'),
    amountPaise: _n(j['amountPaise']),
    paidPaise: _n(j['paidPaise']),
    status: '${j['status'] ?? 'due'}',
  );

  final int seq;
  final DateTime dueOn;
  final int amountPaise;
  final int paidPaise;

  /// `paid`, `partial`, `due` or `overdue`.
  final String status;
}

/// A fee's instalment plan: the parts, their due dates and what is paid. Empty when the fee is not split.
class InstalmentSchedule {
  const InstalmentSchedule({required this.invoiceId, required this.title, required this.amountPaise, required this.paidPaise, required this.instalments});

  factory InstalmentSchedule.fromJson(Map<String, dynamic> j) => InstalmentSchedule(
    invoiceId: '${j['invoiceId']}',
    title: '${j['title'] ?? ''}',
    amountPaise: _n(j['amountPaise']),
    paidPaise: _n(j['paidPaise']),
    instalments: [for (final i in (j['instalments'] as List? ?? const [])) Instalment.fromJson((i as Map).cast<String, dynamic>())],
  );

  final String invoiceId;
  final String title;
  final int amountPaise;
  final int paidPaise;
  final List<Instalment> instalments;
}
