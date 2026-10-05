import 'dart:async';

import 'package:flutter/material.dart' show DateUtils;
import 'package:kinetix_lesson/kinetix_lesson.dart' show RecordingInfo;

import '../core/api.dart';
import '../core/live.dart';
import '../core/models.dart';
import '../core/server_config.dart';
import 'fake_api.dart';

/// The demo backend: [FakeStudentApi] filled with KINETIX Demo College (as
/// services/api/src/db/seed.ts seeds it) around today's date, signed in as Aarav Patel
/// (BCom Sem 3 A). Hand-ins, messages and consent changes stay in memory until the app is closed;
/// KINETIX AI answers with labelled samples.
class DemoStudentApi extends FakeStudentApi {
  DemoStudentApi({DateTime Function()? clock}) : _clock = clock ?? DateTime.now {
    baseUrl = demoServerUrl;
    _seed();
  }

  static const demoTenant = 'demo-college';
  static const demoLogin = 'aarav@demo.kinetix.in';
  static const institution = 'KINETIX Demo College of Commerce & Science';

  final DateTime Function() _clock;
  DateTime get _today => DateUtils.dateOnly(_clock());
  DateTime _day(int offset) => _today.add(Duration(days: offset));
  String _iso(int offset) => isoDate(_day(offset));
  String _at(int days, int hour) => _day(days).add(Duration(hours: hour)).toUtc().toIso8601String();

  /// Whether the simulated reply has arrived (once per run).
  bool replied = false;

  /// Topic notes by id, for the Learn tab.
  final _topics = <String, TopicDetail>{};

  Homework _hw(String id, String title, String instructions, int dueIn, String subject) => Homework(
    id: id,
    title: title,
    instructions: instructions,
    dueOn: _day(dueIn),
    subject: subject,
    teacher: 'Anita Sharma',
    createdAt: _day(dueIn - 4),
  );

  void _seed() {
    // A question open on the board in the demo class (the teacher's "Ask the class").
    question = ClassQuestion(
      id: 'demo-poll',
      numeric: false,
      question: 'Which shares can a company redeem?',
      options: const ['A', 'B', 'C', 'D'],
      teacher: 'Anita Sharma',
      subject: 'Corporate Accounting',
    );
    profile = Me(
      id: 'u1',
      fullName: 'Aarav Patel',
      roles: const ['student'],
      preferredLanguage: 'en',
      institution: institution,
      email: demoLogin,
    );
    final now = _clock();
    final ex42 = _hw(
      'h1',
      'Exercise 4.2: Issue of shares',
      'Solve questions 1 to 5 from the textbook. Show journal entries for each.',
      2,
      corpAcc.name,
    );
    final costSheet = _hw('h2', 'Cost sheet practice', 'Prepare a cost sheet for the case on page 112.', 5, costing.name);
    final forfeiture = _hw('h3', 'Forfeiture of shares: notes', 'Read chapter 4.3 and write a one-page summary.', -3, corpAcc.name);
    subjectOfHomework = {'h1': corpAcc, 'h2': costing, 'h3': corpAcc};

    recordings = [
      FakeStudentApi.recordingJson('r1', 'Forfeiture of shares', subject: corpAcc.name, startedAt: _at(-1, 10), keep: true),
      FakeStudentApi.recordingJson('r2', 'Issue at premium and discount', subject: corpAcc.name, startedAt: _at(-3, 10), missed: true, expiresOn: _iso(5)),
      FakeStudentApi.recordingJson('r3', 'Cost sheet: worked example', subject: costing.name, startedAt: _at(-8, 9), expiresOn: _iso(40)),
    ].map((j) => RecordingInfo.fromJson({...j, 'hasAudio': false})).toList();

    studentSummary = StudentSummary(
      today: _today,
      days: 30,
      attendance: AttendanceSummary(
        periods: 42,
        present: 37,
        absent: 4,
        late: 1,
        excused: 0,
        rate: 88,
        recentAbsences: [
          ClassMark(date: _day(-5), status: AttendanceStatus.absent, subject: corpAcc.name, startsAt: ClockTime.parse('10:00:00')),
          ClassMark(date: _day(-10), status: AttendanceStatus.absent, subject: costing.name, startsAt: ClockTime.parse('09:00:00')),
        ],
      ),
      upcoming: [ex42, costSheet],
      pastHomework: [forfeiture],
      boards: [board.summary],
      recordings: recordings,
    );
    attendanceMarks = [
      for (var back = 1; back <= 12; back++)
        if (_day(-back).weekday != DateTime.sunday) ...[
          ClassMark(
            date: _day(-back),
            status: back % 5 == 0 ? AttendanceStatus.absent : AttendanceStatus.present,
            subject: corpAcc.name,
            startsAt: ClockTime.parse('10:00:00'),
          ),
          ClassMark(date: _day(-back), status: AttendanceStatus.present, subject: costing.name, startsAt: ClockTime.parse('09:00:00')),
        ],
    ];
    submissions = {
      'h3/s1': {
        'status': 'checked',
        'text':
            'Forfeiture is the cancellation of shares when a shareholder fails to pay calls. Share capital is debited with the '
            'called-up amount, calls in arrears credited, and the amount received credited to Share Forfeiture account.',
        'files': [],
        'submittedAt': _at(-4, 19),
        'late': false,
        'remark': 'Clear and complete. Well done.',
        'checkedBy': 'Anita Sharma',
        'checkedAt': _at(-2, 11),
      },
    };

    inbox = [
      AppNotification(
        id: 'n1',
        kind: NotificationKind.homework,
        title: 'Homework: Corporate Accounting',
        body: 'Exercise 4.2: Issue of shares · due ${_iso(2)}',
        data: {'homeworkId': 'h1', 'sectionId': 'sec1'},
        createdAt: now.subtract(const Duration(hours: 2)),
      ),
      AppNotification(
        id: 'n2',
        kind: NotificationKind.recording,
        title: 'Missed Corporate Accounting? Watch the lesson',
        body: 'Issue at premium and discount',
        data: {'recordingId': 'r2', 'sectionId': 'sec1'},
        createdAt: now.subtract(const Duration(days: 3)),
      ),
      AppNotification(
        id: 'n3',
        kind: NotificationKind.broadcast,
        title: 'Annual sports day',
        body: 'Names for the inter-class events close on Friday. See the PE department.',
        data: {'broadcastId': 'b1'},
        createdAt: now.subtract(const Duration(days: 5)),
        readAt: now.subtract(const Duration(days: 4)),
      ),
    ];

    calendarEvents = [
      FakeStudentApi.eventJson('e1', 'holiday', 'Gandhi Jayanti', '2026-10-02'),
      FakeStudentApi.eventJson('e2', 'holiday', 'Dasara holidays', '2026-10-19', '2026-10-21'),
      FakeStudentApi.eventJson('e3', 'holiday', 'Kannada Rajyotsava', '2026-11-01'),
      FakeStudentApi.eventJson('e4', 'exam', 'Mid-semester exams', '2026-11-16', '2026-11-20', ['BCom']),
      FakeStudentApi.eventJson('e5', 'event', 'Annual sports day', '2026-12-12'),
      FakeStudentApi.eventJson('e6', 'holiday', 'Christmas', '2026-12-25'),
    ];

    const caTitle = 'Corporate Accounting, BCom Semester 3', costTitle = 'Cost Accounting, BCom Semester 3';
    final ca = [
      (
        'ch1',
        'Issue of Shares',
        [
          ('t1', 'Kinds of shares and share capital', 'Equity and preference shares; authorised, issued and called-up capital.'),
          ('t2', 'Issue at par, premium and discount', 'Journal entries for each kind of issue.'),
          ('t3', 'Over-subscription and pro-rata allotment', 'Refunds and adjusting excess application money.'),
        ],
      ),
      (
        'ch2',
        'Forfeiture and Re-issue of Shares',
        [
          ('t4', 'Forfeiture of shares', 'Cancelling shares when calls are not paid.'),
          ('t5', 'Re-issue of forfeited shares', 'Re-issue at a discount and the transfer to capital reserve.'),
        ],
      ),
      (
        'ch3',
        'Underwriting of Shares',
        [('t6', 'Underwriting and underwriting commission', 'What underwriting is, its kinds, and the commission allowed by law.')],
      ),
      ('ch4', 'Valuation of Goodwill', [('t7', 'Methods of valuing goodwill', 'Average profit, super profit and capitalisation.')]),
    ];
    final cost = [
      (
        'cc1',
        'Introduction to Cost Accounting',
        [
          ('k1', 'Cost concepts and classification', 'Direct and indirect costs; fixed and variable.'),
          ('k2', 'Cost sheet', 'Prime cost, works cost, cost of production and cost of sales.'),
        ],
      ),
    ];
    CourseOutline outline(String id, String title, List<(String, String, List<(String, String, String)>)> chapters) {
      for (final (_, chapter, topics) in chapters) {
        for (final (tid, t, summary) in topics) {
          _topics[tid] = TopicDetail(
            id: tid,
            title: t,
            summary: summary,
            notes: [summary, 'Sample notes (demo): read the textbook section and try the worked examples before class.'],
            outcomes: ['Explain $t in your own words', 'Solve a textbook problem on $t'],
            chapterTitle: chapter,
            courseTitle: title,
            reviewed: true,
          );
        }
      }
      return CourseOutline(
        id: id,
        title: title,
        reviewed: true,
        chapters: [
          for (final (cid, chapter, topics) in chapters)
            OutlineChapter(
              id: cid,
              title: chapter,
              topics: [for (final (tid, t, s) in topics) OutlineTopic(id: tid, title: t, summary: s)],
            ),
        ],
      );
    }

    syllabi = {'sub1': outline('co1', caTitle, ca), 'sub2': outline('co2', costTitle, cost)};
    underwriting = _topics['t6']!;
    // Sample concept videos, as the platform team links them. The ids are placeholders until the
    // KINETIX channel's own videos are linked (YouTube then shows "Video unavailable").
    conceptVideoList = {
      't5': const [
        ConceptVideo(id: 'cv1', youtubeVideoId: 'kxDemoRe01a', title: 'Re-issue of forfeited shares in 6 minutes', language: 'en', durationSeconds: 372),
        ConceptVideo(id: 'cv3', youtubeVideoId: 'kxDemoRe03h', title: 'ज़ब्त शेयरों का पुनः निर्गमन', language: 'hi', durationSeconds: 410),
      ],
      't6': const [ConceptVideo(id: 'cv5', youtubeVideoId: 'kxDemoUw01a', title: 'Underwriting commission explained', language: 'en', durationSeconds: 296)],
    };
    coverageJson = {
      'sub1': {
        'covered': 4,
        'total': 7,
        'percent': 57,
        'topics': [
          for (final (i, t) in ['t1', 't2', 't3', 't4'].indexed)
            {'topicId': t, 'coveredOn': _iso(-14 + i * 3), 'coveredBy': 'Anita Sharma'},
        ],
      },
      'sub2': {
        'covered': 1,
        'total': 2,
        'percent': 50,
        'topics': [
          {'topicId': 'k1', 'coveredOn': _iso(-8), 'coveredBy': 'Anita Sharma'},
        ],
      },
    };
    final week = _today.subtract(Duration(days: _today.weekday - DateTime.monday));
    String wk(int n) => isoDate(week.add(Duration(days: 7 * n)));
    yearPlanJson = {
      'sub1': {
        ...FakeStudentApi.planJson(
          status: 'behind',
          behindBy: 1,
          items: [
            FakeStudentApi.planItemJson('t1', 'Kinds of shares and share capital', 'Issue of Shares', wk(-3), coveredOn: _iso(-14)),
            FakeStudentApi.planItemJson('t2', 'Issue at par, premium and discount', 'Issue of Shares', wk(-3), coveredOn: _iso(-11)),
            FakeStudentApi.planItemJson('t3', 'Over-subscription and pro-rata allotment', 'Issue of Shares', wk(-2), coveredOn: _iso(-8)),
            FakeStudentApi.planItemJson('t4', 'Forfeiture of shares', 'Forfeiture and Re-issue of Shares', wk(-2), coveredOn: _iso(-5)),
            FakeStudentApi.planItemJson('t5', 'Re-issue of forfeited shares', 'Forfeiture and Re-issue of Shares', wk(-1), late: true),
            FakeStudentApi.planItemJson('t6', 'Underwriting and underwriting commission', 'Underwriting of Shares', wk(0)),
            FakeStudentApi.planItemJson('t7', 'Methods of valuing goodwill', 'Valuation of Goodwill', wk(1)),
          ],
        ),
        'startsOn': wk(-3),
        'endsOn': isoDate(week.add(const Duration(days: 7 * 13 - 1))),
      },
    };

    feeAccount = FeeAccount(
      duePaise: 3435000,
      onlinePayments: 'demo',
      invoices: [
        FeeInvoice(
          id: 'i1',
          title: 'Semester 3 tuition fee',
          amountPaise: 4250000,
          paidPaise: 1000000,
          dueOn: _day(10),
          status: InvoiceStatus.due,
        ),
        FeeInvoice(id: 'i2', title: 'Exam fee (Nov 2026)', amountPaise: 185000, paidPaise: 0, dueOn: _day(-2), status: InvoiceStatus.due),
      ],
      payments: [
        FeePayment(
          id: 'p1',
          invoiceId: 'i1',
          amountPaise: 1000000,
          method: 'cash',
          receiptNo: 'RCPT/2026-27/00002',
          paidAt: _day(-6).add(const Duration(hours: 11)),
        ),
      ],
    );

    libraryAccount = LibraryAccount.fromJson({
      'current': [FakeStudentApi.loanJson('l1', 'Corporate Accounting', author: 'S. N. Maheshwari', issuedAt: _at(-9, 10), dueOn: _iso(5))],
      'history': [
        FakeStudentApi.loanJson(
          'l2',
          'Wings of Fire',
          author: 'A. P. J. Abdul Kalam',
          issuedAt: _at(-40, 10),
          dueOn: _iso(-26),
          returnedAt: _at(-23, 11),
          finePaise: 600,
        ),
      ],
      'finesPaise': 600,
    });

    studentMarks = StudentMarks.fromJson({
      'assessments': [
        {
          'id': 'a1',
          'title': 'Unit test 1: Underwriting of shares',
          'kind': 'test',
          'maxMarks': 25,
          'heldOn': _iso(-6),
          'subject': corpAcc.name,
          'marks': 19,
          'absent': false,
          'remark': 'Good. Revise the journal entries for forfeiture.',
          'classAverage': 18.6,
          'classHighest': 24,
        },
        {
          'id': 'a2',
          'title': 'Cost sheet assignment',
          'kind': 'assignment',
          'maxMarks': 10,
          'heldOn': _iso(-13),
          'subject': costing.name,
          'marks': 8,
          'absent': false,
          'remark': null,
          'classAverage': 7.2,
          'classHighest': 10,
        },
      ],
      'subjects': [
        {'subject': corpAcc.name, 'percent': 76},
        {'subject': costing.name, 'percent': 80},
      ],
    });

    chats = {
      'cv1': [
        ChatMessage(
          id: 'm1',
          senderId: 'u1',
          body: 'Ma’am, I missed Tuesday’s class. Is Exercise 4.2 due on Wednesday?',
          createdAt: now.subtract(const Duration(hours: 26)),
        ),
        ChatMessage(
          id: 'm2',
          senderId: 't1',
          body: 'Yes. Watch the shared recording first; the board notes are in the app too.',
          createdAt: now.subtract(const Duration(hours: 20)),
        ),
      ],
    };
  }

  // ── Sign-in: any password; codes are always 123456 ───────────────────────────────────────────

  @override
  Future<void> login({required String tenant, required String login, required String password}) async {
    calls.add('login $tenant $login');
    if (password.isEmpty) throw ApiException(401, 'Wrong institution, login or password');
    token = 'demo-token';
  }

  @override
  Future<CalendarRange> calendar({DateTime? from, DateTime? to}) async => CalendarRange.fromJson({
    'from': isoDate(from ?? _today),
    'to': isoDate(to ?? _day(90)),
    'today': isoDate(_today),
    'events': calendarEvents,
  });

  // ── KINETIX AI and the content library: labelled samples ──────────────────────────────────────

  @override
  Future<Explanation> explain({
    required String question,
    required AiLanguage language,
    String? sectionId,
    String? subjectId,
    String? topicId,
  }) async {
    final topic = topicId == null ? null : _topics[topicId];
    return Explanation(
      answer: topic == null
          ? 'This is a sample answer from the KINETIX demo. With a server, KINETIX AI would answer "$question" from your syllabus notes.'
          : 'This is a sample answer from the KINETIX demo. ${topic.title}: ${topic.summary}',
      keyPoints: const ['Sample key point: write the journal entry first', 'Sample key point: check the totals agree'],
      followUps: const ['Can you show a worked example?', 'What are the common mistakes?'],
      preview: true,
      sources: [if (topic != null) TopicRef(id: topic.id, title: topic.title)],
    );
  }

  @override
  Future<List<TopicHit>> searchTopics(String query) async {
    final q = query.toLowerCase();
    return [
      for (final t in _topics.values)
        if (t.title.toLowerCase().contains(q) || t.summary.toLowerCase().contains(q))
          TopicHit(id: t.id, title: t.title, summary: t.summary, chapterTitle: t.chapterTitle, courseTitle: t.courseTitle),
    ];
  }

  @override
  Future<TopicDetail> topic(String id) async => _topics[id] ?? (throw ApiException(404, 'Topic not found'));

  // ── Recordings: the strokes replay; there is no audio without a server ────────────────────────

  @override
  Future<RecordingInfo> recording(String id) async {
    final r = await super.recording(id);
    return RecordingInfo.fromJson({
      ...FakeStudentApi.recordingJson(r.id, r.title, subject: r.subjectName!, startedAt: r.startedAt.toUtc().toIso8601String()),
      'hasAudio': false,
      'keep': r.keep,
      'expiresOn': r.expiresOn == null ? null : isoDate(r.expiresOn!),
      'missed': null,
      'transcript': 'Sample transcript (demo): today we look at how companies forfeit and re-issue shares.',
      'summary': {
        'summary': 'Sample summary (demo): forfeiture cancels shares when calls are unpaid; forfeited shares can be re-issued.',
        'keyPoints': ['Share capital is debited with the called-up amount', 'The gain on re-issue goes to capital reserve'],
      },
    });
  }

  /// A reply from Anita "arrives" (DemoLiveConnection calls this a few seconds after sign-in).
  LiveMessageNew receiveReply() {
    final m = ChatMessage(
      id: 'm${_clock().microsecondsSinceEpoch}',
      senderId: 't1',
      body: 'Got your Exercise 4.2, Aarav. Well done on the journal entries!',
      createdAt: _clock(),
    );
    chats.putIfAbsent('cv1', () => []).add(m);
    return LiveMessageNew(conversationId: 'cv1', messageId: m.id, senderId: 't1');
  }
}

/// The realtime connection in the demo: ready at once, a teacher's reply arrives [delay] after
/// connecting, and live classes are not available.
class DemoLiveConnection implements LiveConnection {
  DemoLiveConnection(this.api, {this.delay = const Duration(seconds: 8)});

  final DemoStudentApi api;
  final Duration delay;
  final _signals = StreamController<LiveSignal>.broadcast();
  Timer? _timer;

  /// A [LiveConnector] for AppState.
  static LiveConnector connector(DemoStudentApi api, {Duration delay = const Duration(seconds: 8)}) =>
      ({required String baseUrl, required String token}) => DemoLiveConnection(api, delay: delay);

  @override
  Stream<LiveSignal> get signals => _signals.stream;

  @override
  void connect() {
    scheduleMicrotask(() {
      if (!_signals.isClosed) _signals.add(const LiveReady());
    });
    if (api.replied) return;
    _timer = Timer(delay, () {
      if (api.replied) return;
      api.replied = true;
      if (!_signals.isClosed) _signals.add(api.receiveReply());
    });
  }

  @override
  Future<LiveWatchAck> watch(String deviceId) async => const LiveWatchAck(ok: false, error: 'Not available in the demo.');

  @override
  void unwatch(String deviceId) {}

  @override
  void dispose() {
    _timer?.cancel();
    _signals.close();
  }
}
