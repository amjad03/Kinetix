/// Mirrors the student-facing responses of services/api (src/parent for the student's own
/// summary, src/notifications, src/whiteboards, src/recordings, src/ai, src/content, src/fees, src/library,
/// src/marks, src/messages, src/sessions for live classes).
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

List<String> _strings(Object? v) => [for (final s in (v as List? ?? const [])) '$s'];

/// The signed-in user (`GET /v1/me`).
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

  bool get isStudent => roles.contains('student');

  String get firstName {
    final parts = fullName.split(' ').where((p) => p.isNotEmpty && !p.endsWith('.')).toList();
    return parts.isEmpty ? fullName : parts.first;
  }
}

/// The student's own record (`GET /v1/student/me`): class, roll number and program.
class StudentProfile {
  StudentProfile({
    required this.id,
    required this.fullName,
    required this.rollNo,
    required this.sectionId,
    required this.sectionName,
    this.term,
    this.programName,
    this.programLevel,
  });

  factory StudentProfile.fromJson(Map<String, dynamic> j) => StudentProfile(
    id: j['id'] as String,
    fullName: j['fullName'] as String,
    rollNo: j['rollNo'] as String,
    sectionId: (j['section'] as Map)['id'] as String,
    sectionName: (j['section'] as Map)['displayName'] as String,
    term: (j['section'] as Map)['term'] as int?,
    programName: (j['program'] as Map?)?['name'] as String?,
    programLevel: (j['program'] as Map?)?['level'] as String?,
  );

  final String id;
  final String fullName;
  final String rollNo;
  final String sectionId;
  final String sectionName;
  final int? term;
  final String? programName;

  /// k12, ug or pg.
  final String? programLevel;

  String get firstName => fullName.split(' ').first;

  /// "BCom · UG" style program line, or null.
  String? get programLine {
    if (programName == null) return null;
    final level = switch (programLevel) {
      'ug' => 'Undergraduate',
      'pg' => 'Postgraduate',
      _ => null,
    };
    return [programName!, ?level].join(' · ');
  }
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

  /// The server's rate, or one worked out from the counts.
  double? get effectiveRate => rate ?? (periods == 0 ? null : attended * 100 / periods);
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

/// A subject taught in the student's class.
class Subject {
  const Subject({required this.id, required this.name, this.code});

  factory Subject.fromJson(Map<String, dynamic> j) => Subject(id: j['id'] as String, name: j['name'] as String, code: j['code'] as String?);

  final String id;
  final String name;
  final String? code;
}

/// `GET /v1/homework/:id`: the homework with the class and subject it was set for.
class HomeworkDetail {
  HomeworkDetail({required this.homework, required this.sectionId, required this.subject});

  factory HomeworkDetail.fromJson(Map<String, dynamic> j) => HomeworkDetail(
    homework: Homework.fromJson({
      ...j,
      'subject': (j['subject'] as Map<String, dynamic>)['name'],
      'teacher': (j['createdBy'] as Map<String, dynamic>)['fullName'],
    }),
    sectionId: (j['section'] as Map<String, dynamic>)['id'] as String,
    subject: Subject.fromJson(j['subject'] as Map<String, dynamic>),
  );

  final Homework homework;
  final String sectionId;
  final Subject subject;
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

/// Everything on Today, from `GET /v1/parent/children/:id/summary` for the student's own id.
class StudentSummary {
  StudentSummary({
    required this.today,
    required this.days,
    required this.attendance,
    required this.upcoming,
    required this.pastHomework,
    required this.boards,
    this.recordings = const [],
  });

  factory StudentSummary.fromJson(Map<String, dynamic> j) {
    final hw = j['homework'] as Map<String, dynamic>;
    List<Homework> list(Object? v) => [for (final h in (v as List? ?? const [])) Homework.fromJson(h as Map<String, dynamic>)];
    return StudentSummary(
      today: parseIsoDate((j['period'] as Map)['to'] as String),
      days: (j['period'] as Map)['days'] as int,
      attendance: AttendanceSummary.fromJson(j['attendance'] as Map<String, dynamic>),
      upcoming: list(hw['upcoming']),
      pastHomework: list(hw['recent']),
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
  final List<BoardSummary> boards;

  /// Lesson recordings shared with the class, newest first.
  final List<RecordingInfo> recordings;

  /// The ones the student was absent for first, then the rest; newest first within each.
  List<RecordingInfo> get recordingsMissedFirst => [...recordings.where((r) => r.missed), ...recordings.where((r) => !r.missed)];
}

enum NotificationKind { absence, homework, boardShared, recording, fee, library, marks, message, live, broadcast, other }

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
      'live' => NotificationKind.live,
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

  /// [body] with any raw "2026-09-29" turned into "Tue 29 Sep" (older rows carry ISO dates).
  String get displayBody => body.replaceAllMapped(RegExp(r'\b(\d{4})-(\d{2})-(\d{2})\b'), (m) {
    final d = DateTime(int.parse(m[1]!), int.parse(m[2]!), int.parse(m[3]!));
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${days[d.weekday - 1]} ${d.day} ${months[d.month - 1]}';
  });
  String? get sectionId => data['sectionId'] as String?;
  String? get homeworkId => data['homeworkId'] as String?;
  String? get whiteboardId => data['whiteboardId'] as String?;
  String? get recordingId => data['recordingId'] as String?;
  String? get paymentId => data['paymentId'] as String?;
  String? get assessmentId => data['assessmentId'] as String?;
  String? get conversationId => data['conversationId'] as String?;

  /// A live class started (`live`).
  String? get sessionId => data['sessionId'] as String?;
}

class Inbox {
  Inbox({required this.unread, required this.items});

  factory Inbox.fromJson(Map<String, dynamic> j) =>
      Inbox(unread: j['unread'] as int, items: [for (final n in j['items'] as List) AppNotification.fromJson(n as Map<String, dynamic>)]);

  final int unread;
  final List<AppNotification> items;
}

// ---------------------------------------------------------------------------------------------
// KINETIX AI

/// The languages KINETIX AI answers in. The fonts for all three are bundled in kinetix_ui.
enum AiLanguage {
  en('English', 'English'),
  hi('हिन्दी', 'Hindi'),
  kn('ಕನ್ನಡ', 'Kannada');

  const AiLanguage(this.label, this.englishName);

  /// The language's own name: "हिन्दी".
  final String label;
  final String englishName;

  static AiLanguage parse(String? code) => values.asNameMap()[code] ?? AiLanguage.en;
}

/// A library topic an answer was based on.
class TopicRef {
  const TopicRef({required this.id, required this.title});

  final String id;
  final String title;
}

/// What the student asked, with any class context sent along.
class AiQuestion {
  const AiQuestion({required this.question, required this.language, this.subject, this.topic});

  final String question;
  final AiLanguage language;
  final Subject? subject;

  /// Asked from a topic page: the answer is grounded in that topic's notes.
  final TopicRef? topic;
}

/// `POST /v1/ai/explain`: the answer, key points, follow-up questions and the library topics it
/// was grounded in. [preview] means the institution has no AI server connected yet.
class Explanation {
  Explanation({required this.answer, required this.keyPoints, required this.followUps, required this.preview, required this.sources});

  factory Explanation.fromJson(Map<String, dynamic> j) {
    final r = j['result'] as Map<String, dynamic>;
    final meta = (j['meta'] as Map?)?.cast<String, dynamic>() ?? const {};
    return Explanation(
      answer: r['answer'] as String? ?? '',
      keyPoints: _strings(r['keyPoints']),
      followUps: _strings(r['followUps']),
      preview: meta['preview'] == true,
      sources: [
        for (final s in (meta['sources'] as List? ?? const [])) TopicRef(id: (s as Map)['topicId'] as String, title: s['title'] as String),
      ],
    );
  }

  final String answer;
  final List<String> keyPoints;
  final List<String> followUps;
  final bool preview;
  final List<TopicRef> sources;
}

// ---------------------------------------------------------------------------------------------
// Content library

/// A search hit: `GET /v1/content/search?q=`.
class TopicHit {
  TopicHit({required this.id, required this.title, required this.summary, required this.chapterTitle, required this.courseTitle});

  factory TopicHit.fromJson(Map<String, dynamic> j) => TopicHit(
    id: j['id'] as String,
    title: j['title'] as String,
    summary: j['summary'] as String? ?? '',
    chapterTitle: j['chapterTitle'] as String? ?? '',
    courseTitle: j['courseTitle'] as String? ?? '',
  );

  final String id;
  final String title;
  final String summary;
  final String chapterTitle;
  final String courseTitle;
}

/// `GET /v1/content/topics/:id`: notes and learning outcomes.
class TopicDetail {
  TopicDetail({
    required this.id,
    required this.title,
    required this.summary,
    required this.notes,
    required this.outcomes,
    required this.chapterTitle,
    required this.courseTitle,
    required this.reviewed,
  });

  factory TopicDetail.fromJson(Map<String, dynamic> j) => TopicDetail(
    id: j['id'] as String,
    title: j['title'] as String,
    summary: j['summary'] as String? ?? '',
    notes: _strings(j['notes']),
    outcomes: _strings(j['outcomes']),
    chapterTitle: (j['chapter'] as Map?)?['title'] as String? ?? '',
    courseTitle: (j['course'] as Map?)?['title'] as String? ?? '',
    reviewed: (j['course'] as Map?)?['reviewed'] as bool? ?? false,
  );

  final String id;
  final String title;
  final String summary;
  final List<String> notes;
  final List<String> outcomes;
  final String chapterTitle;
  final String courseTitle;

  /// Whether the curriculum team has reviewed the course.
  final bool reviewed;

  TopicRef get ref => TopicRef(id: id, title: title);
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
// Fees (read-only for students)

enum InvoiceStatus { due, paid, cancelled }

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
    amountPaise: j['amountPaise'] as int,
    paidPaise: j['paidPaise'] as int? ?? 0,
    dueOn: parseIsoDate(j['dueOn'] as String),
    status: InvoiceStatus.values.asNameMap()[j['status']] ?? InvoiceStatus.due,
  );

  final String id;
  final String title;
  final int amountPaise;
  final int paidPaise;
  final DateTime dueOn;
  final InvoiceStatus status;

  int get balancePaise => status == InvoiceStatus.due ? (amountPaise - paidPaise).clamp(0, amountPaise) : 0;
}

class FeePayment {
  FeePayment({required this.id, required this.invoiceId, required this.amountPaise, required this.method, this.receiptNo, this.paidAt});

  factory FeePayment.fromJson(Map<String, dynamic> j) => FeePayment(
    id: j['id'] as String,
    invoiceId: j['invoiceId'] as String,
    amountPaise: j['amountPaise'] as int,
    method: j['method'] as String? ?? '',
    receiptNo: j['receiptNo'] as String?,
    paidAt: _instant(j['paidAt']),
  );

  final String id;
  final String invoiceId;
  final int amountPaise;

  /// online, cash, upi, card, cheque, bank_transfer…
  final String method;
  final String? receiptNo;
  final DateTime? paidAt;
}

/// `GET /v1/fees/students/:id`.
class FeeAccount {
  FeeAccount({required this.duePaise, required this.invoices, required this.payments, this.onlinePayments});

  factory FeeAccount.fromJson(Map<String, dynamic> j) => FeeAccount(
    duePaise: j['duePaise'] as int? ?? 0,
    onlinePayments: j['onlinePayments'] as String?,
    invoices: [for (final i in (j['invoices'] as List? ?? const [])) FeeInvoice.fromJson(i as Map<String, dynamic>)],
    payments: [for (final p in (j['payments'] as List? ?? const [])) FeePayment.fromJson(p as Map<String, dynamic>)],
  );

  final int duePaise;

  /// The online payment provider, or null when the college takes fees only at the counter.
  final String? onlinePayments;
  final List<FeeInvoice> invoices;
  final List<FeePayment> payments;

  FeeInvoice? invoiceOf(FeePayment p) => invoices.where((i) => i.id == p.invoiceId).firstOrNull;
}

/// `GET /v1/fees/payments/:id/receipt`.
class FeeReceipt {
  FeeReceipt({
    required this.receiptNo,
    required this.institution,
    required this.studentName,
    required this.rollNo,
    required this.className,
    required this.invoiceTitle,
    required this.invoiceAmountPaise,
    required this.balancePaise,
    required this.amountPaise,
    required this.method,
    this.reference,
    this.paidAt,
  });

  factory FeeReceipt.fromJson(Map<String, dynamic> j) {
    final inv = j['invoice'] as Map<String, dynamic>;
    final st = j['student'] as Map<String, dynamic>;
    return FeeReceipt(
      receiptNo: j['receiptNo'] as String? ?? '',
      institution: j['institution'] as String? ?? '',
      studentName: st['fullName'] as String,
      rollNo: st['rollNo'] as String? ?? '',
      className: j['className'] as String? ?? '',
      invoiceTitle: inv['title'] as String,
      invoiceAmountPaise: inv['amountPaise'] as int,
      balancePaise: inv['balancePaise'] as int? ?? 0,
      amountPaise: j['amountPaise'] as int,
      method: j['method'] as String? ?? '',
      reference: j['reference'] as String?,
      paidAt: _instant(j['paidAt']),
    );
  }

  final String receiptNo;
  final String institution;
  final String studentName;
  final String rollNo;
  final String className;
  final String invoiceTitle;
  final int invoiceAmountPaise;
  final int balancePaise;
  final int amountPaise;
  final String method;
  final String? reference;
  final DateTime? paidAt;
}

int _studentPaise(Object? v) => (v as num).toInt();

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
      finePaise: _studentPaise(j['finePaise'] ?? 0),
      overdue: j['overdue'] as bool? ?? false,
      fineSoFarPaise: _studentPaise(j['fineSoFarPaise'] ?? 0),
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

/// The student's library borrowing: books out now (with due dates) and returned books.
class LibraryAccount {
  LibraryAccount({required this.current, required this.history, required this.finesPaise});

  factory LibraryAccount.fromJson(Map<String, dynamic> j) => LibraryAccount(
    current: [for (final l in (j['current'] as List? ?? const [])) LibraryLoan.fromJson(l as Map<String, dynamic>)],
    history: [for (final l in (j['history'] as List? ?? const [])) LibraryLoan.fromJson(l as Map<String, dynamic>)],
    finesPaise: _studentPaise(j['finesPaise'] ?? 0),
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

/// One published assessment with the student's marks and how the class did.
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

/// The student's percentage in one subject across its published assessments.
class SubjectResult {
  SubjectResult({required this.subject, required this.percent});

  factory SubjectResult.fromJson(Map<String, dynamic> j) =>
      SubjectResult(subject: j['subject'] as String, percent: _double(j['percent']) ?? 0);

  final String subject;
  final double percent;
}

/// The student's published marks (`GET /v1/marks/students/:id`).
class StudentMarks {
  StudentMarks({required this.assessments, required this.subjects});

  factory StudentMarks.fromJson(Map<String, dynamic> j) => StudentMarks(
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

/// A teacher the student can write to, with what they teach the class.
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

/// A student and the teachers of their class (`GET /v1/conversations/contacts`).
class ContactGroup {
  ContactGroup({required this.studentId, required this.studentName, required this.className, required this.staff});

  factory ContactGroup.fromJson(Map<String, dynamic> j) {
    final st = (j['student'] as Map).cast<String, dynamic>();
    return ContactGroup(
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

/// A thread between the student (or their family) and one teacher.
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

// ── Live class ──────────────────────────────────────────────────────────────────────────────────

/// The class the teacher is teaching live right now (`GET /v1/student/live`).
class LiveClass {
  LiveClass({required this.deviceId, required this.sessionId, required this.teacher, required this.startedAt, this.subject});

  factory LiveClass.fromJson(Map<String, dynamic> j) => LiveClass(
    deviceId: j['deviceId'] as String,
    sessionId: j['sessionId'] as String,
    teacher: j['teacher'] as String? ?? 'Your teacher',
    subject: j['subject'] as String?,
    startedAt: _instant(j['startedAt']) ?? DateTime.now(),
  );

  /// The board the class is on (what the realtime `live.watch` takes).
  final String deviceId;
  final String sessionId;
  final String teacher;
  final String? subject;
  final DateTime startedAt;
}
