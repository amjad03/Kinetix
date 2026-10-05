import 'dart:async';

import 'package:flutter/material.dart' show DateUtils;
import 'package:kinetix_lesson/kinetix_lesson.dart' show RecordingInfo;

import '../core/api.dart';
import '../core/models.dart';
import '../core/realtime.dart';
import '../core/server_config.dart';
import 'fake_api.dart';

/// The demo backend: [FakeParentApi] filled with KINETIX Demo College (as
/// services/api/src/db/seed.ts seeds it) around today's date. Rajesh Patel has two children,
/// Aarav (BCom Sem 3 A) and Diya (BCA Sem 1 A). Changes (hand-ins, messages, consent, fee
/// payments through the demo gateway) stay in memory until the app is closed.
class DemoParentApi extends FakeParentApi {
  DemoParentApi({DateTime Function()? clock}) : _clock = clock ?? DateTime.now {
    baseUrl = demoServerUrl;
    _seed();
  }

  static const demoTenant = 'demo-college';
  static const demoLogin = 'parent@demo.kinetix.in';
  static const institution = 'KINETIX Demo College of Commerce & Science';

  final DateTime Function() _clock;
  DateTime get _today => DateUtils.dateOnly(_clock());
  DateTime _day(int offset) => _today.add(Duration(days: offset));
  String _iso(int offset) => isoDate(_day(offset));

  Homework _hw(String id, String title, String instructions, int dueIn, String subject, String teacher) => Homework(
    id: id,
    title: title,
    instructions: instructions,
    dueOn: _day(dueIn),
    subject: subject,
    teacher: teacher,
    createdAt: _day(dueIn - 4),
  );

  void _seed() {
    profile = Me(
      id: 'u1',
      fullName: 'Rajesh Patel',
      roles: const ['guardian'],
      preferredLanguage: 'en',
      institution: institution,
      email: demoLogin,
      phone: '+919800000001',
    );
    final dmaths = const Subject(id: 'sub3', name: 'Discrete Mathematics', code: 'BCA-1.2');
    subjectsOfChild = {
      'c1': [corpAcc, costing],
      'c2': [dmaths],
    };
    final ex42 = _hw(
      'h1',
      'Exercise 4.2: Issue of shares',
      'Solve questions 1 to 5 from the textbook. Show journal entries for each.',
      2,
      corpAcc.name,
      'Anita Sharma',
    );
    final costSheet = _hw('h2', 'Cost sheet practice', 'Prepare a cost sheet for the case on page 112.', 5, costing.name, 'Anita Sharma');
    final forfeiture = _hw(
      'h3',
      'Forfeiture of shares: notes',
      'Read chapter 4.3 and write a one-page summary.',
      -3,
      corpAcc.name,
      'Anita Sharma',
    );
    final sets = _hw(
      'h4',
      'Sets and relations: worksheet 3',
      'All questions. Draw Venn diagrams where needed.',
      3,
      dmaths.name,
      'Ravi Kumar',
    );
    subjectOfHomework = {'h1': corpAcc, 'h2': costing, 'h3': corpAcc, 'h4': dmaths};

    recordings = [
      FakeParentApi.recordingJson('r1', 'Forfeiture of shares', subject: corpAcc.name, startedAt: _at(-1, 10), keep: true),
      FakeParentApi.recordingJson('r2', 'Issue at premium and discount', subject: corpAcc.name, startedAt: _at(-3, 10), missed: true, expiresOn: _iso(5)),
      FakeParentApi.recordingJson('r3', 'Cost sheet: worked example', subject: costing.name, startedAt: _at(-8, 9), expiresOn: _iso(40)),
    ].map((j) => RecordingInfo.fromJson({...j, 'hasAudio': false, 'durationMs': 20000})).toList();

    summaries = {
      'c1': ChildSummary(
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
        participation: [Participation(subject: corpAcc.name, correct: 6, partial: 2, incorrect: 1, skipped: 0)],
        boards: [board.summary],
        recordings: recordings,
      ),
      'c2': ChildSummary(
        today: _today,
        days: 30,
        attendance: AttendanceSummary(periods: 40, present: 39, absent: 1, late: 0, excused: 0, rate: 98, recentAbsences: []),
        upcoming: [sets],
        pastHomework: [],
        participation: [],
        boards: [],
      ),
    };
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

    // Aarav's checked hand-in.
    submissions = {
      'h3/c1': {
        'status': 'checked',
        'text':
            'Forfeiture is the cancellation of shares when a shareholder fails to pay calls. Share capital is debited with the '
            'called-up amount, calls in arrears credited, and the amount received credited to Share Forfeiture account.',
        'files': [],
        'submittedAt': _day(-4).add(const Duration(hours: 19)).toUtc().toIso8601String(),
        'late': false,
        'remark': 'Clear and complete. Well done.',
        'checkedBy': 'Anita Sharma',
        'checkedAt': _day(-2).add(const Duration(hours: 11)).toUtc().toIso8601String(),
      },
    };

    final now = _clock();
    inbox = [
      AppNotification(
        id: 'n1',
        kind: NotificationKind.homework,
        title: 'Homework: Corporate Accounting',
        body: 'Exercise 4.2: Issue of shares · due ${_iso(2)}',
        data: {'homeworkId': 'h1', 'sectionId': 'sec1'},
        createdAt: now.subtract(const Duration(hours: 2)),
      ),
      boardNotice('n2', 'wb1'),
      AppNotification(
        id: 'n3',
        kind: NotificationKind.absence,
        title: 'Aarav was marked absent',
        body:
            'Aarav Patel was marked absent for Corporate Accounting (10:00–10:55) on ${_iso(-5)}. '
            'If this is wrong, please contact the class teacher.',
        data: {'studentId': 'c1', 'date': _iso(-5)},
        createdAt: now.subtract(const Duration(days: 5)),
      ),
      AppNotification(
        id: 'n4',
        kind: NotificationKind.recording,
        title: 'Missed Corporate Accounting? Watch the lesson',
        body: 'Issue at premium and discount',
        data: {'recordingId': 'r2', 'sectionId': 'sec1'},
        createdAt: now.subtract(const Duration(days: 3)),
        readAt: now.subtract(const Duration(days: 2)),
      ),
      AppNotification(
        id: 'n5',
        kind: NotificationKind.broadcast,
        title: 'Parent–teacher meeting',
        body: 'Saturday, 10:00 in the main hall. Please bring the fee receipt if you paid at the counter.',
        data: {'broadcastId': 'b1'},
        createdAt: now.subtract(const Duration(days: 6)),
        readAt: now.subtract(const Duration(days: 5)),
      ),
    ];

    calendarEvents = [
      FakeParentApi.eventJson('e1', 'holiday', 'Gandhi Jayanti', '2026-10-02'),
      FakeParentApi.eventJson('e2', 'holiday', 'Dasara holidays', '2026-10-19', '2026-10-21'),
      FakeParentApi.eventJson('e3', 'holiday', 'Kannada Rajyotsava', '2026-11-01'),
      FakeParentApi.eventJson('e4', 'exam', 'Mid-semester exams', '2026-11-16', '2026-11-20', ['BCom']),
      FakeParentApi.eventJson('e5', 'event', 'Annual sports day', '2026-12-12'),
      FakeParentApi.eventJson('e6', 'holiday', 'Christmas', '2026-12-25'),
    ];

    syllabi = {
      'sub1': CourseOutline(
        id: 'co1',
        title: 'Corporate Accounting, BCom Semester 3',
        reviewed: true,
        chapters: [
          OutlineChapter(
            id: 'ch1',
            title: 'Issue of Shares',
            topics: [
              OutlineTopic(
                id: 't1',
                title: 'Kinds of shares and share capital',
                summary: 'Equity and preference shares; authorised, issued and called-up capital.',
              ),
              OutlineTopic(id: 't2', title: 'Issue at par, premium and discount', summary: 'Journal entries for each kind of issue.'),
              OutlineTopic(
                id: 't3',
                title: 'Over-subscription and pro-rata allotment',
                summary: 'Refunds and adjusting excess application money.',
              ),
            ],
          ),
          OutlineChapter(
            id: 'ch2',
            title: 'Forfeiture and Re-issue of Shares',
            topics: [
              OutlineTopic(id: 't4', title: 'Forfeiture of shares', summary: 'Cancelling shares when calls are not paid.'),
              OutlineTopic(id: 't5', title: 'Re-issue of forfeited shares', summary: 'Re-issue at a discount and the capital reserve.'),
            ],
          ),
          OutlineChapter(
            id: 'ch3',
            title: 'Valuation of Goodwill',
            topics: [
              OutlineTopic(id: 't6', title: 'Methods of valuing goodwill', summary: 'Average profit, super profit and capitalisation.'),
            ],
          ),
        ],
      ),
      'sub2': CourseOutline(
        id: 'co2',
        title: 'Cost Accounting, BCom Semester 3',
        reviewed: true,
        chapters: [
          OutlineChapter(
            id: 'cc1',
            title: 'Introduction to Cost Accounting',
            topics: [
              OutlineTopic(id: 'k1', title: 'Cost concepts and classification', summary: 'Direct and indirect costs; fixed and variable.'),
              OutlineTopic(id: 'k2', title: 'Cost sheet', summary: 'Prime cost, works cost, cost of production and cost of sales.'),
            ],
          ),
        ],
      ),
    };
    coverageJson = {
      'sec1|sub1': {
        'covered': 4,
        'total': 6,
        'percent': 67,
        'topics': [
          for (final (i, t) in ['t1', 't2', 't3', 't4'].indexed)
            {'topicId': t, 'coveredOn': _iso(-14 + i * 3), 'coveredBy': 'Anita Sharma'},
        ],
      },
      'sec1|sub2': {
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
      'sec1|sub1': {
        ...FakeParentApi.planJson(
          status: 'behind',
          behindBy: 1,
          items: [
            FakeParentApi.planItemJson('t1', 'Kinds of shares and share capital', 'Issue of Shares', wk(-3), coveredOn: _iso(-14)),
            FakeParentApi.planItemJson('t2', 'Issue at par, premium and discount', 'Issue of Shares', wk(-3), coveredOn: _iso(-11)),
            FakeParentApi.planItemJson('t3', 'Over-subscription and pro-rata allotment', 'Issue of Shares', wk(-2), coveredOn: _iso(-8)),
            FakeParentApi.planItemJson('t4', 'Forfeiture of shares', 'Forfeiture and Re-issue of Shares', wk(-2), coveredOn: _iso(-5)),
            FakeParentApi.planItemJson('t5', 'Re-issue of forfeited shares', 'Forfeiture and Re-issue of Shares', wk(-1), late: true),
            FakeParentApi.planItemJson('t6', 'Methods of valuing goodwill', 'Valuation of Goodwill', wk(0)),
          ],
        ),
        'startsOn': wk(-3),
        'endsOn': isoDate(week.add(const Duration(days: 7 * 13 - 1))),
      },
    };

    invoices = {
      'c1': [
        FeeInvoice(
          id: 'i1',
          title: 'Semester 3 tuition fee',
          amountPaise: 4250000,
          paidPaise: 1000000,
          dueOn: _day(10),
          status: FeeStatus.due,
        ),
        FeeInvoice(id: 'i2', title: 'Exam fee (Nov 2026)', amountPaise: 185000, paidPaise: 0, dueOn: _day(-2), status: FeeStatus.due),
      ],
      'c2': [
        FeeInvoice(id: 'i3', title: 'Semester 1 tuition fee', amountPaise: 4800000, paidPaise: 0, dueOn: _day(10), status: FeeStatus.due),
      ],
    };
    feePayments = {
      'c1': [
        FeePayment(
          id: 'p1',
          invoiceId: 'i1',
          amountPaise: 1000000,
          method: PaymentMethod.cash,
          receiptNo: 'RCPT/2026-27/00002',
          paidAt: _day(-6).add(const Duration(hours: 11, minutes: 5)),
        ),
      ],
      'c2': [],
    };

    libraries = {
      'c1': LibraryAccount.fromJson({
        'current': [
          FakeParentApi.loanJson('l1', 'Corporate Accounting', author: 'S. N. Maheshwari', issuedAt: _at(-9, 10), dueOn: _iso(5)),
        ],
        'history': [
          FakeParentApi.loanJson(
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
      }),
      'c2': LibraryAccount.fromJson({
        'current': [
          FakeParentApi.loanJson(
            'l3',
            'Discrete Mathematics and Its Applications',
            author: 'Kenneth H. Rosen',
            issuedAt: _at(-18, 10),
            dueOn: _iso(-4),
            overdue: true,
            fineSoFarPaise: 800,
          ),
        ],
        'history': [],
        'finesPaise': 0,
      }),
    };

    childMarks = {
      'c1': ChildMarks.fromJson({
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
            'remark': 'Good journal entries; revise underwriting commission.',
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
      }),
      'c2': ChildMarks(assessments: [], subjects: []),
    };

    chats = {
      'cv1': [
        ChatMessage(
          id: 'm1',
          senderId: 'u1',
          body: 'Good morning ma’am. Aarav had fever on Tuesday, so he missed Corporate Accounting. Could you share what was covered?',
          createdAt: now.subtract(const Duration(hours: 26)),
        ),
        ChatMessage(
          id: 'm2',
          senderId: 't1',
          body: 'Hope he is better now. The lesson recording and the board are shared in the app; please ask him to try Exercise 4.2.',
          createdAt: now.subtract(const Duration(hours: 20)),
        ),
      ],
    };
    // Aarav decided for himself (he is an adult student); Rajesh decides for Diya.
    consentJson = {
      'c1': {...FakeParentApi.allDecided('c1', canDecide: false), 'purposes': _decided('Aarav Patel')},
      'c2': {...FakeParentApi.allDecided('c2'), 'purposes': _decided('Rajesh Patel')},
    };
  }

  static Map<String, dynamic> _decided(String by) => {
    for (final p in ['data_processing', 'ai_features', 'class_recordings', 'photos']) p: FakeParentApi.decided(p != 'photos', by: by),
  };

  String _at(int days, int hour) => _day(days).add(Duration(hours: hour)).toUtc().toIso8601String();

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

  // ── Recordings: the strokes replay; there is no audio without a server ────────────────────────

  @override
  Future<RecordingInfo> recording(String id) async {
    final r = await super.recording(id);
    return RecordingInfo.fromJson({
      ...FakeParentApi.recordingJson(r.id, r.title, subject: r.subjectName!, startedAt: r.startedAt.toUtc().toIso8601String()),
      'hasAudio': false,
      'durationMs': 20000,
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

  /// Whether the simulated reply has arrived (once per run).
  bool replied = false;

  /// A reply from Anita "arrives" (DemoRealtimeConnection calls this a few seconds after sign-in).
  RealtimeMessageNew receiveReply() {
    final m = ChatMessage(
      id: 'm${_clock().microsecondsSinceEpoch}',
      senderId: 't1',
      body: 'Aarav handed in Exercise 4.2 this morning. Thank you for following up!',
      createdAt: _clock(),
    );
    chats.putIfAbsent('cv1', () => []).add(m);
    return RealtimeMessageNew(conversationId: 'cv1', messageId: m.id, senderId: 't1');
  }
}

/// Realtime for the demo: ready at once, and a teacher's reply arrives [delay] after connecting.
class DemoRealtimeConnection implements RealtimeConnection {
  DemoRealtimeConnection(this.api, {this.delay = const Duration(seconds: 8)});

  final DemoParentApi api;
  final Duration delay;
  final _signals = StreamController<RealtimeSignal>.broadcast();
  Timer? _timer;

  /// A [RealtimeConnector] for AppState.
  static RealtimeConnector connector(DemoParentApi api, {Duration delay = const Duration(seconds: 8)}) =>
      ({required String baseUrl, required String token}) => DemoRealtimeConnection(api, delay: delay);

  @override
  Stream<RealtimeSignal> get signals => _signals.stream;

  @override
  void connect() {
    scheduleMicrotask(() {
      if (!_signals.isClosed) _signals.add(const RealtimeReady());
    });
    if (api.replied) return;
    _timer = Timer(delay, () {
      if (api.replied) return;
      api.replied = true;
      if (!_signals.isClosed) _signals.add(api.receiveReply());
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _signals.close();
  }
}
