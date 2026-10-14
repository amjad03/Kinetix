/// Self-service for the student, as the Cloud API sends it: online quizzes (`/v1/lms/my-quizzes`),
/// council elections (`/v1/campus-life/me/elections`), the library catalogue and reservations
/// (`/v1/library/opac`, `/v1/library/reservations`), hostel applications, requests and mess bills
/// (`/v1/hostel/...`), bus stop changes (`/v1/transport/...`) and attendance by subject with leave
/// and on duty (`/v1/attendance-desk/...`).
library;

int _int(Object? v) => (v as num?)?.round() ?? 0;
double? _dbl(Object? v) => v is num ? v.toDouble() : (v is String ? double.tryParse(v) : null);
String _s(Object? v) => v == null ? '' : '$v';
DateTime? _time(Object? v) => v == null ? null : DateTime.tryParse('$v')?.toLocal();

/// "2026-10-15" (or a timestamp) as a local date; null when missing.
DateTime? _day(Object? v) {
  if (v == null) return null;
  final d = DateTime.tryParse('$v'.length >= 10 ? '$v'.substring(0, 10) : '$v');
  return d == null ? null : DateTime(d.year, d.month, d.day);
}

List<Map<String, dynamic>> _maps(Object? v) => [for (final x in (v as List? ?? const [])) (x as Map).cast<String, dynamic>()];

/// "2026-10-15" for a date.
String isoDay(DateTime d) => '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

// ── Online quizzes ───────────────────────────────────────────────────────────────────────────────

/// A submitted attempt of a quiz: the score (null while a teacher still marks a coding answer).
class QuizAttemptRow {
  const QuizAttemptRow({required this.id, required this.attemptNo, this.score, this.maxScore, this.needsMarking = false, this.submittedAt});

  factory QuizAttemptRow.fromJson(Map<String, dynamic> j) => QuizAttemptRow(
    id: _s(j['id']),
    attemptNo: _int(j['attemptNo']),
    score: _dbl(j['score']),
    maxScore: _dbl(j['maxScore']),
    needsMarking: j['needsMarking'] == true,
    submittedAt: _time(j['submittedAt']),
  );

  final String id;
  final int attemptNo;
  final double? score;
  final double? maxScore;
  final bool needsMarking;
  final DateTime? submittedAt;
}

/// A published quiz of the student's class, with what the student may do now.
class QuizSummary {
  const QuizSummary({
    required this.id,
    required this.title,
    required this.subject,
    required this.opensAt,
    required this.closesAt,
    required this.durationMin,
    required this.maxAttempts,
    required this.status,
    required this.canStart,
    this.instructions = '',
    this.openAttemptId,
    this.attempts = const [],
  });

  factory QuizSummary.fromJson(Map<String, dynamic> j) => QuizSummary(
    id: _s(j['id']),
    title: _s(j['title']),
    subject: _s(j['subject']),
    instructions: _s(j['instructions']),
    opensAt: _time(j['opensAt']) ?? DateTime.now(),
    closesAt: _time(j['closesAt']) ?? DateTime.now(),
    durationMin: _int(j['durationMin']),
    maxAttempts: _int(j['maxAttempts']),
    status: _s(j['status']),
    canStart: j['canStart'] == true,
    openAttemptId: j['openAttemptId'] as String?,
    attempts: [for (final a in _maps(j['attempts'])) QuizAttemptRow.fromJson(a)],
  );

  final String id;
  final String title;
  final String subject;
  final String instructions;
  final DateTime opensAt;
  final DateTime closesAt;
  final int durationMin;
  final int maxAttempts;

  /// `published` or `closed`.
  final String status;
  final bool canStart;

  /// An attempt started and not yet submitted: the student resumes it.
  final String? openAttemptId;
  final List<QuizAttemptRow> attempts;

  int get attemptsLeft => (maxAttempts - attempts.length - (openAttemptId == null ? 0 : 1)).clamp(0, maxAttempts);

  /// The best score among submitted attempts, as a fraction of the most marks; null when none is marked.
  double? get bestFraction {
    double? best;
    for (final a in attempts) {
      if (a.score == null || a.maxScore == null || a.maxScore == 0) continue;
      final f = a.score! / a.maxScore!;
      if (best == null || f > best) best = f;
    }
    return best;
  }

  bool upcoming(DateTime now) => status == 'published' && now.isBefore(opensAt);
  bool closed(DateTime now) => status != 'published' || !now.isBefore(closesAt);
}

/// One question as the student sees it: no answers. [kind] is `mcq` (one option), `multi` (several),
/// `short` (a word or number) or `code`.
class QuizQuestion {
  const QuizQuestion({required this.id, required this.kind, required this.text, required this.marks, this.options = const [], this.language});

  factory QuizQuestion.fromJson(Map<String, dynamic> j) => QuizQuestion(
    id: _s(j['id']),
    kind: _s(j['kind']),
    text: _s(j['text']),
    options: [for (final o in (j['options'] as List? ?? const [])) '$o'],
    marks: _dbl(j['marks']) ?? 1,
    language: j['language'] as String?,
  );

  final String id;
  final String kind;
  final String text;
  final List<String> options;
  final double marks;
  final String? language;
}

/// An attempt in progress: the questions drawn for it, the answers saved so far and when time is up.
class QuizAttempt {
  const QuizAttempt({required this.attemptId, required this.title, required this.dueAt, required this.questions, this.instructions = '', this.answers = const {}});

  factory QuizAttempt.fromJson(Map<String, dynamic> j) => QuizAttempt(
    attemptId: _s(j['attemptId']),
    title: _s(j['title']),
    instructions: _s(j['instructions']),
    dueAt: _time(j['dueAt']) ?? DateTime.now(),
    questions: [for (final q in _maps(j['questions'])) QuizQuestion.fromJson(q)],
    answers: {
      for (final e in ((j['answers'] as Map?) ?? const {}).entries)
        '${e.key}': e.value is List ? [for (final x in e.value as List) _int(x)] : '${e.value}',
    },
  );

  final String attemptId;
  final String title;
  final String instructions;
  final DateTime dueAt;
  final List<QuizQuestion> questions;

  /// By question id: a [String] (short and code answers, or the option index of a single choice as
  /// the server stores it) or a list of option indexes.
  final Map<String, Object> answers;
}

/// How each question went once an attempt is submitted ([correct] is null while a teacher marks it).
class QuizQuestionResult {
  const QuizQuestionResult({required this.correct, required this.marks});

  final bool? correct;
  final double marks;
}

/// A submitted attempt's score and the result of each question.
class QuizOutcome {
  const QuizOutcome({required this.attemptId, required this.score, required this.maxScore, required this.needsMarking, required this.results});

  factory QuizOutcome.fromJson(Map<String, dynamic> j) => QuizOutcome(
    attemptId: _s(j['attemptId']),
    score: _dbl(j['score']) ?? 0,
    maxScore: _dbl(j['maxScore']) ?? 0,
    needsMarking: j['needsMarking'] == true,
    results: {
      for (final e in ((j['results'] as Map?) ?? const {}).entries)
        '${e.key}': QuizQuestionResult(correct: (e.value as Map)['correct'] as bool?, marks: _dbl((e.value as Map)['marks']) ?? 0),
    },
  );

  final String attemptId;
  final double score;
  final double maxScore;
  final bool needsMarking;
  final Map<String, QuizQuestionResult> results;
}

// ── Council elections ────────────────────────────────────────────────────────────────────────────

/// A student standing for a post; [votes] and [elected] only once the results are published.
class ElectionCandidate {
  const ElectionCandidate({required this.id, required this.fullName, this.className = '', this.manifesto = '', this.votes, this.elected = false});

  factory ElectionCandidate.fromJson(Map<String, dynamic> j) => ElectionCandidate(
    id: _s(j['id']),
    fullName: _s(j['fullName']),
    className: _s(j['className']),
    manifesto: _s(j['manifesto']),
    votes: j['votes'] == null ? null : _int(j['votes']),
    elected: j['elected'] == true,
  );

  final String id;
  final String fullName;
  final String className;
  final String manifesto;
  final int? votes;
  final bool elected;
}

/// A post (president, secretary…) with how many may be chosen and the candidates.
class ElectionPost {
  const ElectionPost({required this.id, required this.title, required this.seats, required this.candidates});

  factory ElectionPost.fromJson(Map<String, dynamic> j) => ElectionPost(
    id: _s(j['id']),
    title: _s(j['title']),
    seats: _int(j['seats']).clamp(1, 50),
    candidates: [for (final c in _maps(j['candidates'])) ElectionCandidate.fromJson(c)],
  );

  final String id;
  final String title;
  final int seats;
  final List<ElectionCandidate> candidates;
}

/// An election the student votes in (`open`) or whose results are out (`published`).
class Election {
  const Election({
    required this.id,
    required this.title,
    required this.status,
    required this.votingStartsAt,
    required this.votingEndsAt,
    required this.canVote,
    required this.voted,
    required this.posts,
    this.description = '',
  });

  factory Election.fromJson(Map<String, dynamic> j) => Election(
    id: _s(j['id']),
    title: _s(j['title']),
    description: _s(j['description']),
    status: _s(j['status']),
    votingStartsAt: _time(j['votingStartsAt']) ?? DateTime.now(),
    votingEndsAt: _time(j['votingEndsAt']) ?? DateTime.now(),
    canVote: j['canVote'] == true,
    voted: j['voted'] == true,
    posts: [for (final p in _maps(j['posts'])) ElectionPost.fromJson(p)],
  );

  final String id;
  final String title;
  final String description;
  final String status;
  final DateTime votingStartsAt;
  final DateTime votingEndsAt;
  final bool canVote;
  final bool voted;
  final List<ElectionPost> posts;

  bool get published => status == 'published';
}

// ── Library catalogue ────────────────────────────────────────────────────────────────────────────

/// Copies of a title at one branch.
class BranchCopies {
  const BranchCopies({required this.branch, required this.available, required this.copies});

  final String branch;
  final int available;
  final int copies;
}

/// A title in the catalogue with how many copies are on the shelf.
class CatalogueBook {
  const CatalogueBook({
    required this.id,
    required this.title,
    required this.author,
    required this.copies,
    required this.available,
    this.callNo = '',
    this.subject = '',
    this.publisher = '',
    this.edition = '',
    this.isbn = '',
    this.pubYear,
    this.reservable = false,
    this.branches = const [],
  });

  factory CatalogueBook.fromJson(Map<String, dynamic> j) => CatalogueBook(
    id: _s(j['id']),
    title: _s(j['title']),
    author: _s(j['author']),
    callNo: _s(j['callNo']),
    subject: _s(j['subject']),
    publisher: _s(j['publisher']),
    edition: _s(j['edition']),
    isbn: _s(j['isbn']),
    pubYear: j['pubYear'] == null ? null : _int(j['pubYear']),
    copies: _int(j['copies']),
    available: _int(j['available']),
    reservable: j['reservable'] == true,
    branches: [for (final b in _maps(j['branches'])) BranchCopies(branch: _s(b['branch']), available: _int(b['available']), copies: _int(b['copies']))],
  );

  final String id;
  final String title;
  final String author;
  final String callNo;
  final String subject;
  final String publisher;
  final String edition;
  final String isbn;
  final int? pubYear;
  final int copies;
  final int available;

  /// Every copy is out: the student can join the queue.
  final bool reservable;
  final List<BranchCopies> branches;
}

/// One page (20 titles) of a catalogue search.
class CataloguePage {
  const CataloguePage({required this.total, required this.page, required this.books});

  factory CataloguePage.fromJson(Map<String, dynamic> j) => CataloguePage(
    total: _int(j['total']),
    page: _int(j['page']).clamp(1, 1000),
    books: [for (final b in _maps(j['rows'])) CatalogueBook.fromJson(b)],
  );

  final int total;
  final int page;
  final List<CatalogueBook> books;

  bool get hasMore => page * 20 < total;
}

/// A place in the queue for a book: `waiting` (with the place) or `ready` (held at the desk until [expiresAt]).
class BookReservation {
  const BookReservation({required this.id, required this.bookId, required this.title, required this.status, this.position = 0, this.expiresAt});

  factory BookReservation.fromJson(Map<String, dynamic> j) => BookReservation(
    id: _s(j['id']),
    bookId: _s(j['bookId']),
    title: _s(j['title']),
    status: _s(j['status']),
    position: _int(j['position']),
    expiresAt: _time(j['expiresAt']),
  );

  final String id;
  final String bookId;
  final String title;
  final String status;
  final int position;
  final DateTime? expiresAt;

  bool get ready => status == 'ready';
}

/// A book borrowed at the self-checkout.
class SelfCheckout {
  const SelfCheckout({required this.loanId, required this.title, required this.dueOn});

  factory SelfCheckout.fromJson(Map<String, dynamic> j) => SelfCheckout(loanId: _s(j['loanId']), title: _s(j['title']), dueOn: _day(j['dueOn']) ?? DateTime.now());

  final String loanId;
  final String title;
  final DateTime dueOn;
}

// ── Hostel ───────────────────────────────────────────────────────────────────────────────────────

/// An application for a hostel seat: `applied`, `approved`, `waitlisted`, `allotted`, `rejected` or `withdrawn`.
class HostelApplication {
  const HostelApplication({required this.id, required this.number, required this.status, this.decisionNote = '', this.createdAt});

  factory HostelApplication.fromJson(Map<String, dynamic> j) =>
      HostelApplication(id: _s(j['id']), number: _s(j['number']), status: _s(j['status']), decisionNote: _s(j['decisionNote']), createdAt: _time(j['createdAt']));

  final String id;
  final String number;
  final String status;
  final String decisionNote;
  final DateTime? createdAt;

  bool get open => status == 'applied' || status == 'approved' || status == 'waitlisted';
}

/// A room change or vacate request to the warden.
class HostelRequest {
  const HostelRequest({required this.id, required this.kind, required this.status, required this.reason, required this.effectiveOn, this.decisionNote = ''});

  factory HostelRequest.fromJson(Map<String, dynamic> j) => HostelRequest(
    id: _s(j['id']),
    kind: _s(j['kind']),
    status: _s(j['status']),
    reason: _s(j['reason']),
    effectiveOn: _day(j['effectiveOn']) ?? DateTime.now(),
    decisionNote: _s(j['decisionNote']),
  );

  final String id;

  /// `change` or `vacate`.
  final String kind;

  /// `pending`, `approved`, `rejected` or `cancelled`.
  final String status;
  final String reason;
  final DateTime effectiveOn;
  final String decisionNote;
}

/// Days away from the mess, told in advance (a rebate on the bill).
class MessLeave {
  const MessLeave({required this.id, required this.fromOn, required this.toOn, this.reason = '', this.status = 'pending'});

  factory MessLeave.fromJson(Map<String, dynamic> j) =>
      MessLeave(id: _s(j['id']), fromOn: _day(j['fromOn']) ?? DateTime.now(), toOn: _day(j['toOn']) ?? DateTime.now(), reason: _s(j['reason']), status: _s(j['status']));

  final String id;
  final DateTime fromOn;
  final DateTime toOn;
  final String reason;
  final String status;
}

/// A month's mess bill: days on the plan, leave rebates and what is charged.
class MessBill {
  const MessBill({required this.id, required this.month, required this.days, required this.grossPaise, required this.netPaise, this.leaveDays = 0, this.rebateDays = 0, this.rebatePaise = 0, this.status = 'draft'});

  factory MessBill.fromJson(Map<String, dynamic> j) => MessBill(
    id: _s(j['id']),
    month: _s(j['month']),
    days: _int(j['days']),
    leaveDays: _int(j['leaveDays']),
    rebateDays: _int(j['rebateDays']),
    grossPaise: _int(j['grossPaise']),
    rebatePaise: _int(j['rebatePaise']),
    netPaise: _int(j['netPaise']),
    status: _s(j['status']),
  );

  final String id;

  /// "2026-10".
  final String month;
  final int days;
  final int leaveDays;
  final int rebateDays;
  final int grossPaise;
  final int rebatePaise;
  final int netPaise;

  /// `draft` (still being worked out) or `charged` (on the fee account).
  final String status;

  DateTime get monthStart => DateTime.tryParse('$month-01') ?? DateTime.now();
}

/// The hostel's requests, mess leave and mess bills of one student.
class HostelAccount {
  const HostelAccount({this.requests = const [], this.messLeaves = const [], this.messBills = const []});

  factory HostelAccount.fromJson(Map<String, dynamic> j) => HostelAccount(
    requests: [for (final r in _maps(j['requests'])) HostelRequest.fromJson(r)],
    messLeaves: [for (final r in _maps(j['messLeaves'])) MessLeave.fromJson(r)],
    messBills: [for (final r in _maps(j['messBills'])) MessBill.fromJson(r)],
  );

  final List<HostelRequest> requests;
  final List<MessLeave> messLeaves;
  final List<MessBill> messBills;

  HostelRequest? get pendingRequest => requests.where((r) => r.status == 'pending').firstOrNull;
}

// ── Transport ────────────────────────────────────────────────────────────────────────────────────

/// A stop a family can move to, with its timings and monthly fee.
class RouteStop {
  const RouteStop({required this.id, required this.routeId, required this.name, this.landmark = '', this.pickupTime = '', this.dropTime = '', this.feePaise = 0});

  factory RouteStop.fromJson(Map<String, dynamic> j) => RouteStop(
    id: _s(j['id']),
    routeId: _s(j['routeId']),
    name: _s(j['name']),
    landmark: _s(j['landmark']),
    pickupTime: _s(j['pickupTime']).length >= 5 ? _s(j['pickupTime']).substring(0, 5) : _s(j['pickupTime']),
    dropTime: _s(j['dropTime']).length >= 5 ? _s(j['dropTime']).substring(0, 5) : _s(j['dropTime']),
    feePaise: _int(j['feePaise']),
  );

  final String id;
  final String routeId;
  final String name;
  final String landmark;

  /// "07:40", or empty.
  final String pickupTime;
  final String dropTime;
  final int feePaise;
}

/// A running route with its stops.
class PublicRoute {
  const PublicRoute({required this.id, required this.name, required this.stops, this.feePaise = 0});

  factory PublicRoute.fromJson(Map<String, dynamic> j) =>
      PublicRoute(id: _s(j['id']), name: _s(j['name']), feePaise: _int(j['feePaise']), stops: [for (final s in _maps(j['stops'])) RouteStop.fromJson(s)]);

  final String id;
  final String name;
  final int feePaise;
  final List<RouteStop> stops;
}

/// A request to move to another stop from a date, and where it stands.
class StopChangeRequest {
  const StopChangeRequest({required this.id, required this.toStopId, required this.toRouteId, required this.effectiveOn, required this.status, this.reason = '', this.decisionNote = '', this.feeDeltaPaise = 0});

  factory StopChangeRequest.fromJson(Map<String, dynamic> j) => StopChangeRequest(
    id: _s(j['id']),
    toStopId: _s(j['toStopId']),
    toRouteId: _s(j['toRouteId']),
    effectiveOn: _day(j['effectiveOn']) ?? DateTime.now(),
    status: _s(j['status']),
    reason: _s(j['reason']),
    decisionNote: _s(j['decisionNote']),
    feeDeltaPaise: _int(j['feeDeltaPaise']),
  );

  final String id;
  final String toStopId;
  final String toRouteId;
  final DateTime effectiveOn;

  /// `pending`, `approved`, `rejected` or `cancelled`.
  final String status;
  final String reason;
  final String decisionNote;
  final int feeDeltaPaise;
}

// ── Attendance by subject, leave and on duty ─────────────────────────────────────────────────────

/// Classes held and attended in a subject (or overall), the percentage, and after condonation.
class AttendanceTally {
  const AttendanceTally({required this.held, required this.attended, this.pct, this.effective, this.condoned = 0});

  factory AttendanceTally.fromJson(Map<String, dynamic>? j) => AttendanceTally(
    held: _int(j?['held']),
    attended: _int(j?['attended']),
    pct: _dbl(j?['pct']),
    effective: _dbl(j?['effective']),
    condoned: _int(j?['condoned']),
  );

  final int held;
  final int attended;
  final double? pct;

  /// The percentage counted for eligibility (condonation added).
  final double? effective;
  final int condoned;

  double? get counted => effective ?? pct;

  /// How many classes in a row must be attended to reach [threshold]% (0 when already there).
  int classesToReach(double threshold) {
    if (held == 0 || threshold >= 100) return 0;
    final need = ((threshold / 100) * held - attended) / (1 - threshold / 100);
    return need <= 0 ? 0 : need.ceil();
  }
}

class SubjectAttendance extends AttendanceTally {
  const SubjectAttendance({required this.subjectId, required this.subject, required this.code, required this.short, required super.held, required super.attended, super.pct, super.effective, super.condoned});

  factory SubjectAttendance.fromJson(Map<String, dynamic> j) {
    final t = AttendanceTally.fromJson(j);
    return SubjectAttendance(
      subjectId: _s(j['subjectId']),
      subject: _s(j['subject']),
      code: _s(j['code']),
      short: j['short'] == true,
      held: t.held,
      attended: t.attended,
      pct: t.pct,
      effective: t.effective,
      condoned: t.condoned,
    );
  }

  final String subjectId;
  final String subject;
  final String code;

  /// Below the threshold in this subject.
  final bool short;
}

/// A leave or on-duty request for attendance: `on_duty`, `medical` or `personal`.
class AttendanceLeave {
  const AttendanceLeave({
    required this.id,
    required this.kind,
    required this.fromDate,
    required this.toDate,
    required this.reason,
    required this.status,
    this.fromTime,
    this.toTime,
    this.activity = '',
    this.decisionNote = '',
    this.hasDocument = false,
    this.countsAs,
  });

  factory AttendanceLeave.fromJson(Map<String, dynamic> j) => AttendanceLeave(
    id: _s(j['id']),
    kind: _s(j['kind']),
    fromDate: _day(j['fromDate']) ?? DateTime.now(),
    toDate: _day(j['toDate']) ?? DateTime.now(),
    fromTime: (j['fromTime'] as String?)?.let((t) => t.length >= 5 ? t.substring(0, 5) : t),
    toTime: (j['toTime'] as String?)?.let((t) => t.length >= 5 ? t.substring(0, 5) : t),
    reason: _s(j['reason']),
    activity: _s(j['activity']),
    status: _s(j['status']),
    decisionNote: _s(j['decisionNote']),
    hasDocument: j['hasDocument'] == true,
    countsAs: j['countsAs'] as String?,
  );

  final String id;
  final String kind;
  final DateTime fromDate;
  final DateTime toDate;
  final String? fromTime;
  final String? toTime;
  final String reason;
  final String activity;

  /// `pending`, `approved`, `rejected`, `cancelled` or `revoked`.
  final String status;
  final String decisionNote;
  final bool hasDocument;

  /// How the approved leave counts: `present`, `excused` or `absent`.
  final String? countsAs;
}

/// The attendance rules for the student's class: the minimum (from the university or board the college is affiliated to,
/// or the institution), and the warning level above it.
class AttendancePolicyView {
  const AttendancePolicyView({required this.thresholdPct, required this.warnPct, required this.basis, this.profile});

  factory AttendancePolicyView.fromJson(Map<String, dynamic>? j) => AttendancePolicyView(
    thresholdPct: _dbl(j?['thresholdPct']) ?? 75,
    warnPct: _dbl(j?['warnPct']) ?? 80,
    basis: _s(j?['basis'] ?? 'overall'),
    profile: j?['profile'] is String ? j!['profile'] as String : (j?['profile'] is Map ? _s((j!['profile'] as Map)['name'] ?? (j['profile'] as Map)['label']) : null),
  );

  final double thresholdPct;
  final double warnPct;

  /// `overall` or `per_subject`.
  final String basis;

  /// The affiliating body's rules in force, by name; null for the institution's own.
  final String? profile;

  bool get perSubject => basis == 'per_subject';
}

/// One student's attendance by subject and overall under the rules, with their leave.
class AttendanceOverview {
  const AttendanceOverview({required this.policy, required this.overall, required this.subjects, required this.status, required this.warning, this.windowLabel = '', this.leaves = const []});

  factory AttendanceOverview.fromJson(Map<String, dynamic> j) => AttendanceOverview(
    policy: AttendancePolicyView.fromJson((j['policy'] as Map?)?.cast<String, dynamic>()),
    windowLabel: _s((j['window'] as Map?)?['label']),
    overall: AttendanceTally.fromJson((j['overall'] as Map?)?.cast<String, dynamic>()),
    subjects: [for (final s in _maps(j['subjects'])) SubjectAttendance.fromJson(s)],
    status: _s(j['status']),
    warning: j['warning'] == true,
    leaves: [for (final l in _maps(j['leaves'])) AttendanceLeave.fromJson(l)],
  );

  final AttendancePolicyView policy;

  /// The term's or year's name the figures cover.
  final String windowLabel;
  final AttendanceTally overall;
  final List<SubjectAttendance> subjects;

  /// `eligible`, `condonable` or `detained`.
  final String status;

  /// Below the warning level but not short.
  final bool warning;
  final List<AttendanceLeave> leaves;

  bool get short => status != 'eligible';
}

extension _Let<T> on T {
  R let<R>(R Function(T) f) => f(this);
}
