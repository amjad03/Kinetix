/// Mirrors the parent-facing responses of services/api (src/parent, src/notifications, src/whiteboards,
/// src/recordings, src/fees).
library;

import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_lesson/kinetix_lesson.dart' show RecordingInfo;

/// "10:00:00" → a wall-clock time from the timetable (local to the institution).
class ClockTime implements Comparable<ClockTime> {
  const ClockTime(this.minutes);
  factory ClockTime.parse(String hhmmss) {
    final p = hhmmss.split(':');
    return ClockTime(int.parse(p[0]) * 60 + int.parse(p[1]));
  }

  final int minutes;

  /// "10:00", "14:00"
  String get label => '${(minutes ~/ 60).toString().padLeft(2, '0')}:${(minutes % 60).toString().padLeft(2, '0')}';

  @override
  int compareTo(ClockTime other) => minutes.compareTo(other.minutes);
}

ClockTime? _clock(Object? v) => v == null ? null : ClockTime.parse(v as String);

/// A calendar date without a time zone ("2026-10-05").
String isoDate(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

DateTime parseIsoDate(String s) {
  final p = s.substring(0, 10).split('-').map(int.parse).toList();
  return DateTime(p[0], p[1], p[2]);
}

DateTime? _instant(Object? v) => v == null ? null : DateTime.parse(v as String).toLocal();

class Me {
  Me({
    required this.id,
    required this.fullName,
    required this.roles,
    required this.preferredLanguage,
    required this.institution,
    this.email,
    this.phone,
  });

  factory Me.fromJson(Map<String, dynamic> j) => Me(
    id: j['id'] as String,
    fullName: j['fullName'] as String,
    email: j['email'] as String?,
    phone: j['phone'] as String?,
    preferredLanguage: j['preferredLanguage'] as String? ?? 'en',
    roles: (j['roles'] as List).cast<String>(),
    institution: (j['tenant'] as Map)['name'] as String,
  );

  final String id;
  final String fullName;
  final String? email;
  final String? phone;
  final String preferredLanguage;
  final List<String> roles;
  final String institution;

  bool get isGuardian => roles.contains('guardian');

  String get firstName {
    final parts = fullName.split(' ').where((p) => p.isNotEmpty && !p.endsWith('.')).toList();
    return parts.isEmpty ? fullName : parts.first;
  }
}

class Child {
  Child({
    required this.id,
    required this.fullName,
    required this.rollNo,
    required this.sectionId,
    required this.sectionName,
    this.relation,
    this.programName,
  });

  factory Child.fromJson(Map<String, dynamic> j) => Child(
    id: j['id'] as String,
    fullName: j['fullName'] as String,
    rollNo: j['rollNo'] as String,
    relation: j['relation'] as String?,
    sectionId: (j['section'] as Map)['id'] as String,
    sectionName: (j['section'] as Map)['displayName'] as String,
    programName: (j['program'] as Map?)?['name'] as String?,
  );

  final String id;
  final String fullName;
  final String rollNo;
  final String? relation;
  final String sectionId;
  final String sectionName;
  final String? programName;

  String get firstName => fullName.split(' ').first;
}

enum AttendanceStatus {
  present('Present'),
  absent('Absent'),
  late('Late'),
  excused('Excused');

  const AttendanceStatus(this.label);
  final String label;
}

/// One period's mark: "Absent · Corporate Accounting · Thu 1 Oct, 10:00".
class ClassMark {
  ClassMark({required this.date, required this.status, this.subject, this.startsAt, this.endsAt});

  factory ClassMark.fromJson(Map<String, dynamic> j) => ClassMark(
    date: parseIsoDate(j['date'] as String),
    status: AttendanceStatus.values.asNameMap()[j['status']] ?? AttendanceStatus.absent,
    subject: j['subject'] as String?,
    startsAt: _clock(j['startsAt']),
    endsAt: _clock(j['endsAt']),
  );

  final DateTime date;
  final AttendanceStatus status;
  final String? subject;
  final ClockTime? startsAt;
  final ClockTime? endsAt;
}

class AttendanceSummary {
  AttendanceSummary({
    required this.periods,
    required this.present,
    required this.absent,
    required this.late,
    required this.excused,
    required this.rate,
    required this.recentAbsences,
  });

  factory AttendanceSummary.fromJson(Map<String, dynamic> j) => AttendanceSummary(
    periods: j['periods'] as int,
    present: j['present'] as int,
    absent: j['absent'] as int,
    late: j['late'] as int,
    excused: j['excused'] as int,
    rate: (j['rate'] as num?)?.toDouble(),
    recentAbsences: [
      for (final a in (j['recentAbsences'] as List? ?? const [])) ClassMark.fromJson({...a as Map<String, dynamic>, 'status': 'absent'}),
    ],
  );

  final int periods;
  final int present;
  final int absent;
  final int late;
  final int excused;

  /// Percentage attended (present + late + excused), or null when nothing was recorded.
  final double? rate;
  final List<ClassMark> recentAbsences;

  int get attended => present + late + excused;
}

class Homework {
  Homework({
    required this.id,
    required this.title,
    required this.instructions,
    required this.dueOn,
    required this.subject,
    required this.teacher,
    this.createdAt,
  });

  factory Homework.fromJson(Map<String, dynamic> j) => Homework(
    id: j['id'] as String,
    title: j['title'] as String,
    instructions: j['instructions'] as String? ?? '',
    dueOn: parseIsoDate(j['dueOn'] as String),
    createdAt: _instant(j['createdAt']),
    subject: j['subject'] as String,
    teacher: j['teacher'] as String,
  );

  final String id;
  final String title;
  final String instructions;
  final DateTime dueOn;
  final DateTime? createdAt;
  final String subject;
  final String teacher;
}

/// Answers given when the teacher picked the child in class, for one subject.
class Participation {
  Participation({required this.subject, required this.correct, required this.partial, required this.incorrect, required this.skipped});

  factory Participation.fromJson(Map<String, dynamic> j) => Participation(
    subject: j['subject'] as String,
    correct: j['correct'] as int,
    partial: j['partial'] as int,
    incorrect: j['incorrect'] as int,
    skipped: j['skipped'] as int,
  );

  final String subject;
  final int correct;
  final int partial;
  final int incorrect;
  final int skipped;

  int get answered => correct + partial + incorrect;
  int get total => answered + skipped;
}

/// A board the teacher shared with the class (no content).
class BoardSummary {
  BoardSummary({
    required this.id,
    required this.title,
    required this.pageCount,
    this.subjectName,
    this.teacherName,
    this.sectionName,
    this.sharedAt,
  });

  factory BoardSummary.fromJson(Map<String, dynamic> j) => BoardSummary(
    id: j['id'] as String,
    title: j['title'] as String,
    pageCount: j['pageCount'] as int? ?? 1,
    subjectName: j['subjectName'] as String?,
    teacherName: j['teacherName'] as String?,
    sectionName: j['sectionName'] as String?,
    sharedAt: _instant(j['sharedAt']) ?? _instant(j['updatedAt']),
  );

  final String id;
  final String title;
  final int pageCount;
  final String? subjectName;
  final String? teacherName;
  final String? sectionName;
  final DateTime? sharedAt;
}

/// A shared board with its pages, ready for [WhiteboardView].
class SharedBoard {
  SharedBoard(this.summary, this.board);

  factory SharedBoard.fromJson(Map<String, dynamic> j) =>
      SharedBoard(BoardSummary.fromJson(j), SavedBoard.fromJson((j['content'] as Map).cast<String, dynamic>()));

  final BoardSummary summary;
  final SavedBoard board;
}

/// Everything on Home for one child.
class ChildSummary {
  ChildSummary({
    required this.today,
    required this.days,
    required this.attendance,
    required this.upcoming,
    required this.pastHomework,
    required this.participation,
    required this.boards,
    this.recordings = const [],
  });

  factory ChildSummary.fromJson(Map<String, dynamic> j) {
    final hw = j['homework'] as Map<String, dynamic>;
    List<Homework> list(Object? v) => [for (final h in (v as List? ?? const [])) Homework.fromJson(h as Map<String, dynamic>)];
    return ChildSummary(
      today: parseIsoDate((j['period'] as Map)['to'] as String),
      days: (j['period'] as Map)['days'] as int,
      attendance: AttendanceSummary.fromJson(j['attendance'] as Map<String, dynamic>),
      upcoming: list(hw['upcoming']),
      pastHomework: list(hw['recent']),
      participation: [for (final p in (j['participation'] as List? ?? const [])) Participation.fromJson(p as Map<String, dynamic>)],
      boards: [for (final b in (j['sharedBoards'] as List? ?? const [])) BoardSummary.fromJson(b as Map<String, dynamic>)],
      recordings: [for (final r in (j['recordings'] as List? ?? const [])) RecordingInfo.fromJson(r as Map<String, dynamic>)],
    );
  }

  /// The institution's today, as the server sees it. Due dates are relative to this.
  final DateTime today;
  final int days;
  final AttendanceSummary attendance;
  final List<Homework> upcoming;
  final List<Homework> pastHomework;
  final List<Participation> participation;
  final List<BoardSummary> boards;

  /// Lesson recordings shared with the class, newest first.
  final List<RecordingInfo> recordings;

  /// The ones the child was absent for first, then the rest; newest first within each.
  List<RecordingInfo> get recordingsMissedFirst => [...recordings.where((r) => r.missed), ...recordings.where((r) => !r.missed)];
}

enum NotificationKind { absence, homework, boardShared, recording, fee, broadcast, other }

class AppNotification {
  AppNotification({
    required this.id,
    required this.kind,
    required this.title,
    required this.body,
    required this.data,
    required this.createdAt,
    this.readAt,
  });

  factory AppNotification.fromJson(Map<String, dynamic> j) => AppNotification(
    id: j['id'] as String,
    kind: switch (j['kind']) {
      'absence' => NotificationKind.absence,
      'homework' => NotificationKind.homework,
      'board_shared' => NotificationKind.boardShared,
      'recording' => NotificationKind.recording,
      'fee' => NotificationKind.fee,
      'broadcast' => NotificationKind.broadcast,
      _ => NotificationKind.other,
    },
    title: j['title'] as String,
    body: j['body'] as String? ?? '',
    data: (j['data'] as Map?)?.cast<String, dynamic>() ?? const {},
    createdAt: _instant(j['createdAt'])!,
    readAt: _instant(j['readAt']),
  );

  final String id;
  final NotificationKind kind;
  final String title;
  final String body;
  final Map<String, dynamic> data;
  final DateTime createdAt;
  DateTime? readAt;

  bool get unread => readAt == null;

  /// [body] with any raw "2026-09-29" turned into "Tue 29 Sep" (older rows and the demo seed
  /// carry ISO dates; the live server already writes them this way).
  String get displayBody => body.replaceAllMapped(RegExp(r'\b(\d{4})-(\d{2})-(\d{2})\b'), (m) {
    final d = DateTime(int.parse(m[1]!), int.parse(m[2]!), int.parse(m[3]!));
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${days[d.weekday - 1]} ${d.day} ${months[d.month - 1]}';
  });
  String? get studentId => data['studentId'] as String?;
  String? get sectionId => data['sectionId'] as String?;
  String? get homeworkId => data['homeworkId'] as String?;
  String? get whiteboardId => data['whiteboardId'] as String?;
  String? get recordingId => data['recordingId'] as String?;

  /// A fee payment went through (opens its receipt).
  String? get paymentId => data['paymentId'] as String?;

  /// A new fee was issued to a class (opens that child's fees).
  String? get feeBatchId => data['batchId'] as String?;
}

class Inbox {
  Inbox({required this.unread, required this.items});

  factory Inbox.fromJson(Map<String, dynamic> j) =>
      Inbox(unread: j['unread'] as int, items: [for (final n in j['items'] as List) AppNotification.fromJson(n as Map<String, dynamic>)]);

  final int unread;
  final List<AppNotification> items;
}

int _paise(Object? v) => (v as num).toInt();

enum FeeStatus { due, paid }

/// One fee issued to the child: "Semester 3 tuition · ₹42,500 · due Thu 15 Oct". Part payments add
/// up in [paidPaise].
class FeeInvoice {
  FeeInvoice({
    required this.id,
    required this.title,
    required this.amountPaise,
    required this.paidPaise,
    required this.dueOn,
    required this.status,
  });

  factory FeeInvoice.fromJson(Map<String, dynamic> j) => FeeInvoice(
    id: j['id'] as String,
    title: j['title'] as String,
    amountPaise: _paise(j['amountPaise']),
    paidPaise: _paise(j['paidPaise'] ?? 0),
    dueOn: parseIsoDate(j['dueOn'] as String),
    status: j['status'] == 'paid' ? FeeStatus.paid : FeeStatus.due,
  );

  final String id;
  final String title;
  final int amountPaise;
  final int paidPaise;
  final DateTime dueOn;
  final FeeStatus status;

  bool get isPaid => status == FeeStatus.paid;
  int get balancePaise => isPaid ? 0 : (amountPaise - paidPaise).clamp(0, amountPaise);

  /// 0..1 of the fee paid so far.
  double get progress => amountPaise == 0 ? 1 : (paidPaise / amountPaise).clamp(0, 1).toDouble();

  /// Unpaid and past its due date (the institution's [today]).
  bool isOverdue(DateTime today) => !isPaid && dueOn.isBefore(DateTime(today.year, today.month, today.day));
}

/// How a fee was paid.
enum PaymentMethod {
  online('Online'),
  cash('Cash'),
  cheque('Cheque'),
  bankTransfer('Bank transfer'),
  upi('UPI');

  const PaymentMethod(this.label);
  final String label;

  static PaymentMethod parse(Object? v) => switch (v) {
    'cash' => cash,
    'cheque' => cheque,
    'bank_transfer' => bankTransfer,
    'upi' => upi,
    _ => online,
  };
}

/// A payment that went through, with its receipt number.
class FeePayment {
  FeePayment({required this.id, required this.invoiceId, required this.amountPaise, required this.method, this.receiptNo, this.paidAt});

  factory FeePayment.fromJson(Map<String, dynamic> j) => FeePayment(
    id: j['id'] as String,
    invoiceId: j['invoiceId'] as String,
    amountPaise: _paise(j['amountPaise']),
    method: PaymentMethod.parse(j['method']),
    receiptNo: j['receiptNo'] as String?,
    paidAt: _instant(j['paidAt']),
  );

  final String id;
  final String invoiceId;
  final int amountPaise;
  final PaymentMethod method;
  final String? receiptNo;
  final DateTime? paidAt;
}

/// How the institution takes online payments.
enum OnlinePayments { razorpay, demo }

/// A child's fees: what is due, and what has been paid.
class StudentFees {
  StudentFees({required this.duePaise, required this.onlinePayments, required this.invoices, required this.payments});

  factory StudentFees.fromJson(Map<String, dynamic> j) => StudentFees(
    duePaise: _paise(j['duePaise'] ?? 0),
    onlinePayments: switch (j['onlinePayments']) {
      'razorpay' => OnlinePayments.razorpay,
      'demo' => OnlinePayments.demo,
      _ => null,
    },
    invoices: [for (final i in (j['invoices'] as List? ?? const [])) FeeInvoice.fromJson(i as Map<String, dynamic>)],
    payments: [for (final p in (j['payments'] as List? ?? const [])) FeePayment.fromJson(p as Map<String, dynamic>)],
  );

  final int duePaise;

  /// Null when the institution only takes payments at the fees counter.
  final OnlinePayments? onlinePayments;

  /// Newest due date first (as the server sends them).
  final List<FeeInvoice> invoices;

  /// Newest first.
  final List<FeePayment> payments;

  /// Unpaid fees, the earliest due first.
  List<FeeInvoice> get open => invoices.where((i) => !i.isPaid).toList()..sort((a, b) => a.dueOn.compareTo(b.dueOn));
  List<FeeInvoice> get paid => invoices.where((i) => i.isPaid).toList();

  /// The fee to pay next: the earliest due.
  FeeInvoice? get next => open.firstOrNull;
  FeeInvoice? invoice(String id) => invoices.where((i) => i.id == id).firstOrNull;
}

/// What the payment gateway's checkout needs, from `POST /v1/fees/invoices/:id/checkout`.
class FeeCheckout {
  FeeCheckout({
    required this.paymentId,
    required this.provider,
    required this.keyId,
    required this.orderId,
    required this.amountPaise,
    required this.currency,
    required this.name,
    required this.description,
    this.prefillName = '',
    this.prefillEmail = '',
    this.prefillContact = '',
  });

  factory FeeCheckout.fromJson(Map<String, dynamic> j) {
    final prefill = (j['prefill'] as Map?)?.cast<String, dynamic>() ?? const {};
    return FeeCheckout(
      paymentId: j['paymentId'] as String,
      provider: j['provider'] as String,
      keyId: j['keyId'] as String? ?? '',
      orderId: j['orderId'] as String,
      amountPaise: _paise(j['amountPaise']),
      currency: j['currency'] as String? ?? 'INR',
      name: j['name'] as String? ?? 'KINETIX',
      description: j['description'] as String? ?? '',
      prefillName: prefill['name'] as String? ?? '',
      prefillEmail: prefill['email'] as String? ?? '',
      prefillContact: prefill['contact'] as String? ?? '',
    );
  }

  final String paymentId;

  /// 'razorpay' or 'demo'.
  final String provider;
  final String keyId;
  final String orderId;
  final int amountPaise;
  final String currency;

  /// The institution.
  final String name;

  /// The fee's title.
  final String description;
  final String prefillName;
  final String prefillEmail;
  final String prefillContact;
}

/// A numbered receipt for one payment.
class FeeReceipt {
  FeeReceipt({
    required this.receiptNo,
    required this.institution,
    required this.studentName,
    required this.rollNo,
    required this.className,
    required this.feeTitle,
    required this.feeAmountPaise,
    required this.balancePaise,
    required this.amountPaise,
    required this.method,
    required this.paidAt,
    this.studentId,
    this.reference,
  });

  factory FeeReceipt.fromJson(Map<String, dynamic> j) {
    final student = (j['student'] as Map).cast<String, dynamic>();
    final invoice = (j['invoice'] as Map).cast<String, dynamic>();
    return FeeReceipt(
      receiptNo: j['receiptNo'] as String? ?? '',
      institution: j['institution'] as String? ?? '',
      studentId: student['id'] as String?,
      studentName: student['fullName'] as String? ?? '',
      rollNo: student['rollNo'] as String? ?? '',
      className: j['className'] as String? ?? '',
      feeTitle: invoice['title'] as String? ?? '',
      feeAmountPaise: _paise(invoice['amountPaise'] ?? 0),
      balancePaise: _paise(invoice['balancePaise'] ?? 0),
      amountPaise: _paise(j['amountPaise']),
      method: PaymentMethod.parse(j['method']),
      reference: j['reference'] as String?,
      paidAt: _instant(j['paidAt']) ?? DateTime.now(),
    );
  }

  final String receiptNo;
  final String institution;
  final String? studentId;
  final String studentName;
  final String rollNo;
  final String className;
  final String feeTitle;
  final int feeAmountPaise;

  /// What is still due on the fee after this payment (and any since).
  final int balancePaise;
  final int amountPaise;
  final PaymentMethod method;

  /// The gateway's payment id, or the cheque / bank / UPI reference.
  final String? reference;
  final DateTime paidAt;
}
