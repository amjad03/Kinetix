/// Mirrors the parent-facing responses of services/api (src/parent, src/notifications, src/whiteboards,
/// src/recordings, src/fees, src/library, src/marks, src/messages).
library;

import 'dart:math' as math;
import 'dart:typed_data';

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

List<String> _strings(Object? v) => [for (final s in (v as List? ?? const [])) '$s'];

class Me {
  Me({
    required this.id,
    required this.fullName,
    required this.roles,
    required this.preferredLanguage,
    required this.institution,
    this.email,
    this.phone,
    this.photoUrl,
  });

  factory Me.fromJson(Map<String, dynamic> j) => Me(
    photoUrl: j['photoUrl'] as String?,
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

  /// The API path of the profile photo (load it with the API's `photo`); null shows initials.
  final String? photoUrl;

  Me copyWith({String? fullName, String? email, bool clearEmail = false, String? preferredLanguage, String? photoUrl, bool clearPhoto = false}) => Me(
    id: id,
    fullName: fullName ?? this.fullName,
    roles: roles,
    preferredLanguage: preferredLanguage ?? this.preferredLanguage,
    institution: institution,
    email: clearEmail ? null : email ?? this.email,
    phone: phone,
    photoUrl: clearPhoto ? null : photoUrl ?? this.photoUrl,
  );

  bool get isGuardian => roles.contains('guardian');

  String get firstName {
    final parts = fullName.split(' ').where((p) => p.isNotEmpty && !p.endsWith('.')).toList();
    return parts.isEmpty ? fullName : parts.first;
  }
}

/// A short update written by KINETIX AI for a parent about their own child (`POST /v1/ai/parent/children/:id/insight`).
class AiUpdate {
  const AiUpdate({required this.headline, required this.highlights, required this.risks, required this.suggestions, required this.preview});

  factory AiUpdate.fromJson(Map<String, dynamic> j) {
    final r = j['result'] as Map<String, dynamic>;
    List<String> strings(Object? v) => [for (final s in (v as List? ?? const [])) '$s'];
    return AiUpdate(
      headline: r['headline'] as String? ?? '',
      highlights: strings(r['highlights']),
      risks: strings(r['risks']),
      suggestions: strings(r['suggestions']),
      preview: ((j['meta'] as Map?)?['preview']) == true,
    );
  }

  final String headline;
  final List<String> highlights;
  final List<String> risks;
  final List<String> suggestions;
  final bool preview;
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

enum NotificationKind { absence, homework, boardShared, recording, fee, library, marks, message, broadcast, calendar, transport, hostel, other }

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
      'library' => NotificationKind.library,
      'marks' => NotificationKind.marks,
      'message' => NotificationKind.message,
      'broadcast' => NotificationKind.broadcast,
      'calendar' => NotificationKind.calendar,
      'transport' => NotificationKind.transport,
      'hostel' => NotificationKind.hostel,
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

  /// Marks were published for an assessment (opens its result).
  String? get assessmentId => data['assessmentId'] as String?;

  /// A teacher wrote (opens the conversation).
  String? get conversationId => data['conversationId'] as String?;

  /// A holiday, exam or event was announced (`calendar`).
  String? get calendarEventId => data['calendarEventId'] as String?;
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

// ── Library ─────────────────────────────────────────────────────────────────────────────────────

/// One book borrowed from the college library: "Corporate Accounting · due Fri 9 Oct".
class LibraryLoan {
  LibraryLoan({
    required this.id,
    required this.title,
    required this.author,
    required this.issuedAt,
    required this.dueOn,
    required this.finePaise,
    required this.overdue,
    this.fineSoFarPaise = 0,
    this.callNo,
    this.returnedAt,
  });

  factory LibraryLoan.fromJson(Map<String, dynamic> j) {
    final book = (j['book'] as Map).cast<String, dynamic>();
    return LibraryLoan(
      id: j['id'] as String,
      title: book['title'] as String,
      author: book['author'] as String? ?? '',
      callNo: book['callNo'] as String?,
      issuedAt: _instant(j['issuedAt']) ?? DateTime.now(),
      dueOn: parseIsoDate(j['dueOn'] as String),
      returnedAt: _instant(j['returnedAt']),
      finePaise: _paise(j['finePaise'] ?? 0),
      overdue: j['overdue'] as bool? ?? false,
      fineSoFarPaise: _paise(j['fineSoFarPaise'] ?? 0),
    );
  }

  final String id;
  final String title;
  final String author;
  final String? callNo;
  final DateTime issuedAt;
  final DateTime dueOn;
  final DateTime? returnedAt;

  /// Charged when a late book comes back.
  final int finePaise;

  /// For a book still out: the fine if it came back today (0 when not late).
  final int fineSoFarPaise;

  /// Still out and past its due date (the server decides, in the institution's time zone).
  final bool overdue;

  bool get returned => returnedAt != null;

  /// Returned after the due date.
  bool get returnedLate => returnedAt != null && DateTime(returnedAt!.year, returnedAt!.month, returnedAt!.day).isAfter(dueOn);
}

/// A child's library borrowing: books out now (with due dates) and returned books.
class LibraryAccount {
  LibraryAccount({required this.current, required this.history, required this.finesPaise});

  factory LibraryAccount.fromJson(Map<String, dynamic> j) => LibraryAccount(
    current: [for (final l in (j['current'] as List? ?? const [])) LibraryLoan.fromJson(l as Map<String, dynamic>)],
    history: [for (final l in (j['history'] as List? ?? const [])) LibraryLoan.fromJson(l as Map<String, dynamic>)],
    finesPaise: _paise(j['finesPaise'] ?? 0),
  );

  /// Books out now, latest borrowed first (as the server sends them).
  final List<LibraryLoan> current;

  /// Returned books, latest borrowed first.
  final List<LibraryLoan> history;

  /// Fines charged for late returns, in total.
  final int finesPaise;

  List<LibraryLoan> get overdue => current.where((l) => l.overdue).toList();

  /// Books out, overdue first, then the earliest due.
  List<LibraryLoan> get currentByDue => [...current]
    ..sort((a, b) {
      if (a.overdue != b.overdue) return a.overdue ? -1 : 1;
      return a.dueOn.compareTo(b.dueOn);
    });
}

// ── Marks ───────────────────────────────────────────────────────────────────────────────────────

enum AssessmentKind {
  test('Test'),
  assignment('Assignment'),
  internal('Internal assessment'),
  exam('Exam'),
  practical('Practical');

  const AssessmentKind(this.label);
  final String label;

  static AssessmentKind parse(Object? v) => values.asNameMap()[v] ?? test;
}

double? _double(Object? v) => (v as num?)?.toDouble();

/// One published assessment with the child's marks and how the class did.
class AssessmentResult {
  AssessmentResult({
    required this.id,
    required this.title,
    required this.kind,
    required this.maxMarks,
    required this.heldOn,
    required this.subject,
    required this.absent,
    this.marks,
    this.remark,
    this.classAverage,
    this.classHighest,
  });

  factory AssessmentResult.fromJson(Map<String, dynamic> j) => AssessmentResult(
    id: j['id'] as String,
    title: j['title'] as String,
    kind: AssessmentKind.parse(j['kind']),
    maxMarks: _double(j['maxMarks']) ?? 0,
    heldOn: parseIsoDate(j['heldOn'] as String),
    subject: j['subject'] as String,
    marks: _double(j['marks']),
    absent: j['absent'] as bool? ?? false,
    remark: (j['remark'] as String?)?.trim().isEmpty ?? true ? null : (j['remark'] as String).trim(),
    classAverage: _double(j['classAverage']),
    classHighest: _double(j['classHighest']),
  );

  final String id;
  final String title;
  final AssessmentKind kind;
  final double maxMarks;
  final DateTime heldOn;
  final String subject;

  /// Null when absent or not entered.
  final double? marks;
  final bool absent;
  final String? remark;
  final double? classAverage;
  final double? classHighest;

  /// 0..100, or null without marks.
  double? get percent => marks == null || maxMarks == 0 ? null : marks! * 100 / maxMarks;
  double? get averagePercent => classAverage == null || maxMarks == 0 ? null : classAverage! * 100 / maxMarks;

  /// Above, at or below the class average (null when either is missing).
  int? get vsAverage {
    if (marks == null || classAverage == null) return null;
    final d = marks! - classAverage!;
    return d.abs() < 0.05 ? 0 : d.sign.toInt();
  }
}

/// The child's percentage in one subject across its published assessments.
class SubjectResult {
  SubjectResult({required this.subject, required this.percent});

  factory SubjectResult.fromJson(Map<String, dynamic> j) =>
      SubjectResult(subject: j['subject'] as String, percent: _double(j['percent']) ?? 0);

  final String subject;
  final double percent;
}

/// A child's published marks (`GET /v1/marks/students/:id`).
class ChildMarks {
  ChildMarks({required this.assessments, required this.subjects});

  factory ChildMarks.fromJson(Map<String, dynamic> j) => ChildMarks(
    assessments: [for (final a in (j['assessments'] as List? ?? const [])) AssessmentResult.fromJson(a as Map<String, dynamic>)],
    subjects: [for (final s in (j['subjects'] as List? ?? const [])) SubjectResult.fromJson(s as Map<String, dynamic>)],
  );

  /// Latest first.
  final List<AssessmentResult> assessments;
  final List<SubjectResult> subjects;

  AssessmentResult? byId(String id) => assessments.where((a) => a.id == id).firstOrNull;
}

// ── Messages ────────────────────────────────────────────────────────────────────────────────────

class Person {
  Person({required this.id, required this.fullName});

  factory Person.fromJson(Map<String, dynamic> j) => Person(id: j['id'] as String, fullName: j['fullName'] as String);

  final String id;
  final String fullName;
}

/// A teacher the parent can write to about a child, with what they teach the class.
class StaffContact {
  StaffContact({required this.id, required this.fullName, required this.subjects});

  factory StaffContact.fromJson(Map<String, dynamic> j) => StaffContact(
    id: j['id'] as String,
    fullName: j['fullName'] as String,
    subjects: [for (final s in (j['subjects'] as List? ?? const [])) '$s'],
  );

  final String id;
  final String fullName;
  final List<String> subjects;
}

/// One child and the teachers of their class (`GET /v1/conversations/contacts`).
class ChildContacts {
  ChildContacts({required this.studentId, required this.studentName, required this.className, required this.staff});

  factory ChildContacts.fromJson(Map<String, dynamic> j) {
    final st = (j['student'] as Map).cast<String, dynamic>();
    return ChildContacts(
      studentId: st['id'] as String,
      studentName: st['fullName'] as String,
      className: st['className'] as String? ?? '',
      staff: [for (final s in (j['staff'] as List? ?? const [])) StaffContact.fromJson(s as Map<String, dynamic>)],
    );
  }

  final String studentId;
  final String studentName;
  final String className;
  final List<StaffContact> staff;
}

/// A thread between the parent and one teacher about one child.
class Conversation {
  Conversation({
    required this.id,
    required this.student,
    required this.className,
    required this.staff,
    required this.family,
    required this.unread,
    this.lastMessage,
    this.lastMessageAt,
  });

  factory Conversation.fromJson(Map<String, dynamic> j) => Conversation(
    id: j['id'] as String,
    student: Person.fromJson((j['student'] as Map).cast<String, dynamic>()),
    className: j['className'] as String? ?? '',
    staff: Person.fromJson((j['staff'] as Map).cast<String, dynamic>()),
    family: Person.fromJson((j['family'] as Map).cast<String, dynamic>()),
    lastMessage: j['lastMessage'] as String?,
    lastMessageAt: _instant(j['lastMessageAt']),
    unread: (j['unread'] as num?)?.toInt() ?? 0,
  );

  final String id;
  final Person student;
  final String className;
  final Person staff;
  final Person family;
  final String? lastMessage;
  final DateTime? lastMessageAt;
  int unread;
}

class ChatMessage {
  ChatMessage({required this.id, required this.senderId, required this.body, required this.createdAt});

  factory ChatMessage.fromJson(Map<String, dynamic> j) => ChatMessage(
    id: j['id'] as String,
    senderId: j['senderId'] as String,
    body: j['body'] as String,
    createdAt: _instant(j['createdAt']) ?? DateTime.now(),
  );

  final String id;
  final String senderId;
  final String body;
  final DateTime createdAt;
}

/// A page of a conversation, oldest first.
class MessagePage {
  MessagePage({required this.conversation, required this.messages});

  factory MessagePage.fromJson(Map<String, dynamic> j) => MessagePage(
    conversation: Conversation.fromJson((j['conversation'] as Map).cast<String, dynamic>()),
    messages: [for (final m in (j['messages'] as List? ?? const [])) ChatMessage.fromJson(m as Map<String, dynamic>)],
  );

  final Conversation conversation;
  final List<ChatMessage> messages;
}

// ---------------------------------------------------------------------------------------------
// Subjects and syllabus (`GET /v1/content/syllabus?subjectId=`)

/// A subject taught in a child's class.
class Subject {
  const Subject({required this.id, required this.name, this.code, this.courseId});

  factory Subject.fromJson(Map<String, dynamic> j) =>
      Subject(id: j['id'] as String, name: j['name'] as String, code: j['code'] as String?, courseId: j['courseId'] as String?);

  final String id;
  final String name;
  final String? code;

  /// The library course the subject's syllabus comes from; null when not linked yet.
  final String? courseId;
}

class OutlineTopic {
  OutlineTopic({required this.id, required this.title, required this.summary});

  final String id;
  final String title;
  final String summary;
}

class OutlineChapter {
  OutlineChapter({required this.id, required this.title, required this.topics});

  final String id;
  final String title;
  final List<OutlineTopic> topics;
}

/// A subject's syllabus: `GET /v1/content/syllabus?subjectId=` (null when not linked).
class CourseOutline {
  CourseOutline({required this.id, required this.title, required this.reviewed, required this.chapters});

  factory CourseOutline.fromJson(Map<String, dynamic> j) => CourseOutline(
    id: j['id'] as String,
    title: j['title'] as String,
    reviewed: j['reviewed'] as bool? ?? false,
    chapters: [
      for (final c in (j['chapters'] as List? ?? const []))
        OutlineChapter(
          id: (c as Map)['id'] as String,
          title: c['title'] as String,
          topics: [
            for (final t in (c['topics'] as List? ?? const []))
              OutlineTopic(id: (t as Map)['id'] as String, title: t['title'] as String, summary: t['summary'] as String? ?? ''),
          ],
        ),
    ],
  );

  final String id;
  final String title;
  final bool reviewed;
  final List<OutlineChapter> chapters;

  int get topicCount => chapters.fold(0, (n, c) => n + c.topics.length);
}

// ---------------------------------------------------------------------------------------------
// Academic calendar (`GET /v1/calendar`)

enum CalendarKind { holiday, exam, event }

/// A holiday (no classes), exam days or an event, for one or more days.
class CalendarEvent {
  CalendarEvent({required this.id, required this.kind, required this.title, required this.startsOn, required this.endsOn, this.programs});

  factory CalendarEvent.fromJson(Map<String, dynamic> j) => CalendarEvent(
    id: j['id'] as String,
    kind: CalendarKind.values.asNameMap()[j['kind']] ?? CalendarKind.event,
    title: j['title'] as String,
    startsOn: parseIsoDate(j['startsOn'] as String),
    endsOn: parseIsoDate(j['endsOn'] as String),
    programs: j['programs'] == null ? null : _strings(j['programs']),
  );

  final String id;
  final CalendarKind kind;
  final String title;
  final DateTime startsOn;
  final DateTime endsOn;

  /// The programs it is for; null for the whole institution.
  final List<String>? programs;

  bool get multiDay => endsOn.isAfter(startsOn);

  /// Whether [day] falls on this entry.
  bool covers(DateTime day) {
    final d = DateTime(day.year, day.month, day.day);
    return !d.isBefore(startsOn) && !d.isAfter(endsOn);
  }

  /// Whether it applies to a student in [program] (null: unknown, so yes).
  bool appliesTo(String? program) => programs == null || program == null || programs!.contains(program);
}

class CalendarRange {
  CalendarRange({required this.from, required this.to, required this.today, required this.events});

  factory CalendarRange.fromJson(Map<String, dynamic> j) => CalendarRange(
    from: parseIsoDate(j['from'] as String),
    to: parseIsoDate(j['to'] as String),
    today: parseIsoDate(j['today'] as String),
    events: [for (final e in j['events'] as List) CalendarEvent.fromJson(e as Map<String, dynamic>)],
  );

  final DateTime from;
  final DateTime to;

  /// The institution's today.
  final DateTime today;
  final List<CalendarEvent> events;

  /// A holiday today, else one tomorrow, for a student in [program]: (holiday, is today).
  (CalendarEvent, bool)? holidaySoon({String? program}) {
    final holidays = events.where((e) => e.kind == CalendarKind.holiday && e.appliesTo(program));
    final now = holidays.where((e) => e.covers(today)).firstOrNull;
    if (now != null) return (now, true);
    final next = holidays.where((e) => e.covers(today.add(const Duration(days: 1)))).firstOrNull;
    return next == null ? null : (next, false);
  }
}

// ---------------------------------------------------------------------------------------------
// Syllabus coverage (`GET /v1/coverage?sectionId&subjectId`)

class TopicCoverage {
  TopicCoverage({required this.topicId, required this.coveredOn, this.coveredBy});

  final String topicId;
  final DateTime coveredOn;
  final String? coveredBy;
}

/// How much of a subject's syllabus the class has been taught.
class Coverage {
  Coverage({required this.covered, required this.total, required this.percent, required this.topics});

  factory Coverage.fromJson(Map<String, dynamic> j) => Coverage(
    covered: (j['covered'] as num?)?.toInt() ?? 0,
    total: (j['total'] as num?)?.toInt() ?? 0,
    percent: (j['percent'] as num?)?.toInt(),
    topics: {
      for (final t in (j['topics'] as List? ?? const []))
        (t as Map)['topicId'] as String: TopicCoverage(
          topicId: t['topicId'] as String,
          coveredOn: parseIsoDate(t['coveredOn'] as String),
          coveredBy: t['coveredBy'] as String?,
        ),
    },
  );

  final int covered;
  final int total;

  /// Null when the subject has no syllabus topics.
  final int? percent;

  /// Taught topics by id.
  final Map<String, TopicCoverage> topics;
}

// ---------------------------------------------------------------------------------------------
// Year plan (`GET /v1/year-plans?sectionId&subjectId`): the class's syllabus spread over the term

/// Where the class is against its year plan (services/api plans/planner.ts `planProgress`).
enum PlanStatus {
  notStarted,
  onTrack,
  behind,
  ahead;

  static PlanStatus parse(String? s) => switch (s) {
    'on_track' => onTrack,
    'behind' => behind,
    'ahead' => ahead,
    _ => notStarted,
  };
}

class PlanProgress {
  PlanProgress({required this.total, required this.covered, required this.expected, required this.dueThisWeek, required this.behindBy, required this.status});

  factory PlanProgress.fromJson(Map<String, dynamic> j) => PlanProgress(
    total: (j['total'] as num?)?.toInt() ?? 0,
    covered: (j['covered'] as num?)?.toInt() ?? 0,
    expected: (j['expected'] as num?)?.toInt() ?? 0,
    dueThisWeek: (j['dueThisWeek'] as num?)?.toInt() ?? 0,
    behindBy: (j['behindBy'] as num?)?.toInt() ?? 0,
    status: PlanStatus.parse(j['status'] as String?),
  );

  final int total;
  final int covered;

  /// Topics planned before this week.
  final int expected;
  final int dueThisWeek;

  /// Topics planned before this week that have not been taught yet.
  final int behindBy;
  final PlanStatus status;
}

/// One topic in the plan, in the week (a Monday) it is planned for.
class PlanItem {
  PlanItem({required this.topicId, required this.title, required this.chapter, required this.weekOf, required this.periods, this.coveredOn, this.late = false});

  factory PlanItem.fromJson(Map<String, dynamic> j) => PlanItem(
    topicId: j['topicId'] as String,
    title: j['title'] as String? ?? '',
    chapter: j['chapter'] as String? ?? '',
    weekOf: parseIsoDate(j['weekOf'] as String),
    periods: (j['periods'] as num?)?.toInt() ?? 1,
    coveredOn: j['coveredOn'] == null ? null : parseIsoDate(j['coveredOn'] as String),
    late: j['late'] as bool? ?? false,
  );

  final String topicId;
  final String title;
  final String chapter;
  final DateTime weekOf;
  final int periods;
  final DateTime? coveredOn;
  final bool late;

  bool get taught => coveredOn != null;
}

class YearPlan {
  YearPlan({required this.startsOn, required this.endsOn, required this.progress, required this.items});

  factory YearPlan.fromJson(Map<String, dynamic> j) => YearPlan(
    startsOn: parseIsoDate(j['startsOn'] as String),
    endsOn: parseIsoDate(j['endsOn'] as String),
    progress: PlanProgress.fromJson((j['progress'] as Map).cast<String, dynamic>()),
    items: [for (final i in (j['items'] as List? ?? const [])) PlanItem.fromJson((i as Map).cast<String, dynamic>())],
  );

  final DateTime startsOn;
  final DateTime endsOn;
  final PlanProgress progress;
  final List<PlanItem> items;

  /// The Monday of [day]'s week (weeks run Monday to Sunday, as on the server).
  static DateTime mondayOf(DateTime day) => DateTime(day.year, day.month, day.day - (day.weekday - DateTime.monday));

  /// The topics planned for the week of [day].
  List<PlanItem> weekOf(DateTime day) {
    final monday = isoDate(mondayOf(day));
    return [for (final i in items) if (isoDate(i.weekOf) == monday) i];
  }

  /// The topics planned for the week after [day]'s.
  List<PlanItem> weekAfter(DateTime day) {
    final m = mondayOf(day);
    return weekOf(DateTime(m.year, m.month, m.day + 7));
  }
}

// ---------------------------------------------------------------------------------------------
// Homework submissions (`/v1/homework/:id/submissions/:studentId`)

enum SubmissionStatus { submitted, checked, returned }

class SubmissionFile {
  SubmissionFile({required this.index, required this.name, required this.mime, required this.bytes});

  factory SubmissionFile.fromJson(Map<String, dynamic> j) =>
      SubmissionFile(index: (j['index'] as num).toInt(), name: j['name'] as String, mime: j['mime'] as String, bytes: (j['bytes'] as num).toInt());

  final int index;
  final String name;
  final String mime;
  final int bytes;

  bool get isImage => mime.startsWith('image/');
}

/// What was handed in for one student, and the teacher's verdict. [status] null: nothing yet.
class Submission {
  Submission({
    this.status,
    this.text = '',
    this.files = const [],
    this.submittedAt,
    this.late = false,
    this.remark,
    this.checkedBy,
    this.checkedAt,
  });

  factory Submission.fromJson(Map<String, dynamic> j) => Submission(
    status: SubmissionStatus.values.asNameMap()[j['status']],
    text: j['text'] as String? ?? '',
    files: [for (final f in (j['files'] as List? ?? const [])) SubmissionFile.fromJson(f as Map<String, dynamic>)],
    submittedAt: _instant(j['submittedAt']),
    late: j['late'] == true,
    remark: j['remark'] as String?,
    checkedBy: j['checkedBy'] as String?,
    checkedAt: _instant(j['checkedAt']),
  );

  final SubmissionStatus? status;
  final String text;
  final List<SubmissionFile> files;
  final DateTime? submittedAt;
  final bool late;
  final String? remark;
  final String? checkedBy;
  final DateTime? checkedAt;

  /// Whether the work can be handed in (again): anything but checked work.
  bool get canHandIn => status != SubmissionStatus.checked;
}

/// A photo or PDF picked to hand in.
class UploadFile {
  const UploadFile({required this.name, required this.mime, required this.bytes});

  final String name;
  final String mime;
  final Uint8List bytes;

  bool get isImage => mime.startsWith('image/');

  /// The types the server takes, from the picker's type or the file name.
  static String? mimeFor(String name, [String? given]) {
    const ok = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
    if (given != null && ok.contains(given)) return given;
    final ext = name.contains('.') ? name.split('.').last.toLowerCase() : '';
    return switch (ext) {
      'jpg' || 'jpeg' => 'image/jpeg',
      'png' => 'image/png',
      'webp' => 'image/webp',
      'heic' || 'heif' => 'image/heic',
      'pdf' => 'application/pdf',
      _ => null,
    };
  }
}

// ---------------------------------------------------------------------------------------------
// Consent (`/v1/consents`)

/// What the privacy notice asks about (docs/product/privacy-notice.md).
enum ConsentPurpose {
  dataProcessing('data_processing'),
  aiFeatures('ai_features'),
  classRecordings('class_recordings'),
  photos('photos');

  const ConsentPurpose(this.wire);
  final String wire;
}

class ConsentDecision {
  ConsentDecision({required this.granted, required this.at, this.noticeVersion, this.givenBy});

  factory ConsentDecision.fromJson(Map<String, dynamic> j) => ConsentDecision(
    granted: j['granted'] == true,
    at: _instant(j['at']) ?? DateTime.now(),
    noticeVersion: j['noticeVersion'] as String?,
    givenBy: j['givenBy'] as String?,
  );

  final bool granted;
  final DateTime at;
  final String? noticeVersion;
  final String? givenBy;
}

/// Who answers privacy questions and data requests, as the principal set them.
class GrievanceOfficer {
  const GrievanceOfficer({required this.name, this.email, this.phone});

  static GrievanceOfficer? fromJson(Object? j) {
    if (j is! Map) return null;
    final name = (j['name'] as String? ?? '').trim();
    if (name.isEmpty) return null;
    String? opt(Object? v) => v is String && v.trim().isNotEmpty ? v.trim() : null;
    return GrievanceOfficer(name: name, email: opt(j['email']), phone: opt(j['phone']));
  }

  final String name;
  final String? email;
  final String? phone;
}

/// A student's consent decisions and whether the signed-in user makes them.
class Consents {
  Consents({required this.studentId, required this.noticeVersion, required this.canDecide, required this.purposes, this.grievanceOfficer});

  factory Consents.fromJson(Map<String, dynamic> j) {
    final p = (j['purposes'] as Map?)?.cast<String, dynamic>() ?? const {};
    return Consents(
      studentId: j['studentId'] as String? ?? '',
      noticeVersion: j['noticeVersion'] as String? ?? '',
      canDecide: j['canDecide'] == true,
      grievanceOfficer: GrievanceOfficer.fromJson(j['grievanceOfficer']),
      purposes: {
        for (final purpose in ConsentPurpose.values)
          purpose: p[purpose.wire] is Map ? ConsentDecision.fromJson((p[purpose.wire] as Map).cast<String, dynamic>()) : null,
      },
    );
  }

  final String studentId;
  final String noticeVersion;
  final bool canDecide;
  final Map<ConsentPurpose, ConsentDecision?> purposes;

  /// The institution's grievance officer; null when the principal has not named one.
  final GrievanceOfficer? grievanceOfficer;

  /// Something is not decided yet, or was decided on an older notice: ask (when allowed to decide).
  bool get needsAnswer => canDecide && purposes.values.any((d) => d == null || (d.noticeVersion != null && d.noticeVersion != noticeVersion));
}

/// A badge a teacher awarded (GET /v1/badges/students/:id).
class BadgeAward {
  BadgeAward({required this.id, required this.badge, required this.awardedAt, required this.teacherName, this.subjectName});

  factory BadgeAward.fromJson(Map<String, dynamic> j) => BadgeAward(
    id: j['id'] as String,
    badge: j['badge'] as String,
    awardedAt: DateTime.parse(j['awardedAt'] as String).toLocal(),
    teacherName: (j['awardedBy'] as Map)['fullName'] as String,
    subjectName: (j['subject'] as Map?)?['name'] as String?,
  );

  final String id;

  /// The API value (see KxBadge.fromApi).
  final String badge;
  final DateTime awardedAt;
  final String teacherName;
  final String? subjectName;
}

// ── Transport (GET /v1/transport/students/:id, realtime `transport.position`) ─────────────────

/// A stop on the child's bus route.
class BusStop {
  const BusStop({required this.id, required this.name, required this.seq, required this.lat, required this.lng});

  factory BusStop.fromJson(Map<String, dynamic> j) => BusStop(
        id: j['id'] as String,
        name: j['name'] as String,
        seq: (j['seq'] as num).toInt(),
        lat: (j['lat'] as num).toDouble(),
        lng: (j['lng'] as num).toDouble(),
      );

  final String id;
  final String name;
  final int seq;
  final double lat;
  final double lng;
}

/// Where the bus is right now, and how far from the child's stop.
class BusPosition {
  const BusPosition(
      {required this.tripId, required this.lat, required this.lng, this.speedKmh, this.at, this.etaMinutes, this.stopsAway = 0});

  factory BusPosition.fromJson(Map<String, dynamic> j) => BusPosition(
        tripId: j['tripId'] as String,
        lat: (j['lat'] as num).toDouble(),
        lng: (j['lng'] as num).toDouble(),
        speedKmh: (j['speedKmh'] as num?)?.toDouble(),
        at: _instant(j['at']),
        etaMinutes: (j['etaMinutes'] as num?)?.toInt(),
        stopsAway: (j['stopsAway'] as num?)?.toInt() ?? 0,
      );

  final String tripId;
  final double lat;
  final double lng;
  final double? speedKmh;
  final DateTime? at;

  /// Minutes to the child's stop; null once the bus has passed it.
  final int? etaMinutes;
  final int stopsAway;
}

/// A `transport.position` event (TransportPositionEvent in packages/shared).
class BusPositionEvent {
  const BusPositionEvent({
    required this.tripId,
    required this.routeId,
    required this.lat,
    required this.lng,
    this.speedKmh,
    this.nextStopId,
    this.nextStopSeq,
    this.etaMinutes,
    this.at,
  });

  factory BusPositionEvent.fromJson(Map<String, dynamic> j) {
    final next = j['nextStop'] as Map?;
    return BusPositionEvent(
      tripId: j['tripId'] as String,
      routeId: j['routeId'] as String,
      lat: (j['lat'] as num).toDouble(),
      lng: (j['lng'] as num).toDouble(),
      speedKmh: (j['speedKmh'] as num?)?.toDouble(),
      nextStopId: next?['id'] as String?,
      nextStopSeq: (next?['seq'] as num?)?.toInt(),
      etaMinutes: (j['etaMinutes'] as num?)?.toInt(),
      at: _instant(j['at']),
    );
  }

  final String tripId;
  final String routeId;
  final double lat;
  final double lng;
  final double? speedKmh;

  /// The stop the bus is heading to (null after the last stop).
  final String? nextStopId;
  final int? nextStopSeq;

  /// Minutes to that next stop.
  final int? etaMinutes;
  final DateTime? at;
}

/// Great-circle distance in metres.
double distanceMetres(double lat1, double lng1, double lat2, double lng2) {
  const r = 6371000.0;
  double rad(double d) => d * math.pi / 180;
  final dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  final a = math.pow(math.sin(dLat / 2), 2) + math.cos(rad(lat1)) * math.cos(rad(lat2)) * math.pow(math.sin(dLng / 2), 2);
  return 2 * r * math.asin(math.min(1, math.sqrt(a)));
}

/// Minutes to cover [metres] at [speedKmh]; a stopped or unknown bus counts as 20 km/h
/// (the same rule as the server's etaMinutes).
int etaMinutesFor(double metres, double? speedKmh) {
  final v = speedKmh != null && speedKmh >= 5 ? speedKmh : 20.0;
  return math.max(1, (metres / 1000 / v * 60).ceil());
}

/// A child's bus: the seat (route, stop, pickup time) and the bus right now.
class StudentBus {
  const StudentBus({
    required this.assigned,
    this.routeId,
    this.routeName,
    this.regNo,
    this.stopId,
    this.stopName,
    this.stopLat,
    this.stopLng,
    this.pickupTime,
    this.stops = const [],
    this.bus,
  });

  factory StudentBus.fromJson(Map<String, dynamic> j) {
    if (j['assigned'] != true) return const StudentBus(assigned: false);
    return StudentBus(
      assigned: true,
      routeId: j['routeId'] as String,
      routeName: j['routeName'] as String,
      regNo: j['regNo'] as String?,
      stopId: j['stopId'] as String,
      stopName: j['stopName'] as String,
      stopLat: (j['stopLat'] as num).toDouble(),
      stopLng: (j['stopLng'] as num).toDouble(),
      pickupTime: _clock(j['pickupTime']),
      stops: [for (final s in (j['stops'] as List? ?? const [])) BusStop.fromJson((s as Map).cast<String, dynamic>())],
      bus: j['bus'] == null ? null : BusPosition.fromJson((j['bus'] as Map).cast<String, dynamic>()),
    );
  }

  final bool assigned;
  final String? routeId;
  final String? routeName;
  final String? regNo;
  final String? stopId;
  final String? stopName;
  final double? stopLat;
  final double? stopLng;
  final ClockTime? pickupTime;
  final List<BusStop> stops;

  /// Null when no trip is running (or the bus has not reported a position yet).
  final BusPosition? bus;

  /// This bus after a live position: the ETA to the child's stop and how many stops away.
  /// Events for another route leave it as it is.
  StudentBus withEvent(BusPositionEvent e) {
    if (!assigned || e.routeId != routeId) return this;
    final next = e.nextStopId;
    int? eta;
    var away = 0;
    if (next == null) {
      eta = null; // past the last stop
    } else if (next == stopId) {
      eta = e.etaMinutes;
    } else {
      eta = etaMinutesFor(distanceMetres(e.lat, e.lng, stopLat!, stopLng!), e.speedKmh);
      final mine = stops.where((s) => s.id == stopId).firstOrNull;
      if (mine != null && e.nextStopSeq != null) away = (mine.seq - e.nextStopSeq!).abs();
    }
    return StudentBus(
      assigned: true,
      routeId: routeId,
      routeName: routeName,
      regNo: regNo,
      stopId: stopId,
      stopName: stopName,
      stopLat: stopLat,
      stopLng: stopLng,
      pickupTime: pickupTime,
      stops: stops,
      bus: BusPosition(tripId: e.tripId, lat: e.lat, lng: e.lng, speedKmh: e.speedKmh, at: e.at, etaMinutes: eta, stopsAway: away),
    );
  }
}
