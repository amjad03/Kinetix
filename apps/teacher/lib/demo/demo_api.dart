import 'dart:async';

import 'package:flutter/material.dart' show DateUtils;
import 'package:kinetix_lesson/kinetix_lesson.dart';

import '../core/api.dart';
import '../core/models.dart';
import '../core/realtime.dart';
import '../core/server_config.dart';
import 'fake_api.dart';

/// The demo backend: [FakeTeacherApi] filled with KINETIX Demo College (as
/// services/api/src/db/seed.ts seeds it) around today's date. Everything the teacher changes
/// stays in memory until the app is closed. Nothing touches the network.
class DemoTeacherApi extends FakeTeacherApi {
  DemoTeacherApi({DateTime Function()? clock}) : _clock = clock ?? DateTime.now {
    baseUrl = demoBaseUrl;
    _seed();
  }

  /// Never contacted; it only fills the "server" line on the sign-in screen.
  static const demoBaseUrl = demoServerUrl;
  static const demoTenant = 'demo-college';
  static const demoLogin = 'anita@demo.kinetix.in';
  static const demoOtp = '123456';
  static const institution = 'KINETIX Demo College of Commerce & Science';

  final DateTime Function() _clock;

  DateTime get _now => _clock();
  DateTime get _today => DateUtils.dateOnly(_now);
  String _day(int offset) => isoDate(_today.add(Duration(days: offset)));

  static const costing = Ref('sub2', 'Cost Accounting', 'BCOM-3.3');
  static const room = Ref('r1', 'Room 204');

  static const _names = [
    'Aarav Patel', 'Ananya Gowda', 'Bhavya Reddy', 'Chetan Naik', 'Deepika Hegde', 'Farhan Khan', //
    'Gauri Shetty', 'Harsh Jain', 'Ishita Rao', 'Karthik Murthy', 'Lakshmi Iyer', 'Manoj Bhat',
  ];

  /// Periods: Mon–Sat, five a day; Anita teaches BCom Sem 3 A when (period + weekday) is even.
  static const _times = [('09:00', '09:55'), ('10:00', '10:55'), ('11:15', '12:10'), ('12:15', '13:10'), ('14:00', '14:55')];

  /// Attendance saved in the demo, by "slotId date".
  final _sheets = <String, Map<String, AttendanceStatus>>{};

  /// Hand-ins by homework id.
  final _handIns = <String, List<Submission>>{};

  /// Taught topics by subject id.
  final _coverage = <String, Map<String, TopicCoverage>>{};

  /// Year plans by subject id.
  final _plans = <String, YearPlan>{};

  final _syllabi = <String, Syllabus>{};
  int _next = 100;

  void _seed() {
    profile = Me(
      id: 'u1',
      fullName: 'Anita Sharma',
      roles: const ['teacher'],
      preferredLanguage: 'en',
      institution: institution,
      email: demoLogin,
      phone: '+919800000011',
    );
    today = isoDate(_today);
    validCode = demoOtp;
    validOtp = demoOtp;
    students = [
      for (final (i, n) in _names.indexed) Student(id: 's${i + 1}', rollNo: 'U03BC${(i + 1).toString().padLeft(3, '0')}', fullName: n),
    ];

    calendarEvents = [
      CalendarEvent(
        id: 'e1',
        kind: CalendarKind.holiday,
        title: 'Gandhi Jayanti',
        startsOn: DateTime(2026, 10, 2),
        endsOn: DateTime(2026, 10, 2),
      ),
      CalendarEvent(
        id: 'e2',
        kind: CalendarKind.holiday,
        title: 'Dasara holidays',
        startsOn: DateTime(2026, 10, 19),
        endsOn: DateTime(2026, 10, 21),
      ),
      CalendarEvent(
        id: 'e3',
        kind: CalendarKind.holiday,
        title: 'Kannada Rajyotsava',
        startsOn: DateTime(2026, 11, 1),
        endsOn: DateTime(2026, 11, 1),
      ),
      CalendarEvent(
        id: 'e4',
        kind: CalendarKind.exam,
        title: 'Mid-semester exams',
        startsOn: DateTime(2026, 11, 16),
        endsOn: DateTime(2026, 11, 20),
        programs: const ['BCom'],
      ),
      CalendarEvent(
        id: 'e5',
        kind: CalendarKind.event,
        title: 'Annual sports day',
        startsOn: DateTime(2026, 12, 12),
        endsOn: DateTime(2026, 12, 12),
      ),
      CalendarEvent(
        id: 'e6',
        kind: CalendarKind.holiday,
        title: 'Christmas',
        startsOn: DateTime(2026, 12, 25),
        endsOn: DateTime(2026, 12, 25),
      ),
    ];
    holidays = {
      for (final e in calendarEvents.where((e) => e.kind == CalendarKind.holiday))
        for (var d = e.startsOn; !d.isAfter(e.endsOn); d = d.add(const Duration(days: 1))) isoDate(d): e.title,
    };

    homework = [
      Homework(
        id: 'h1',
        title: 'Exercise 4.2: Issue of shares',
        instructions: 'Solve questions 1 to 5 from the textbook. Show journal entries for each.',
        dueOn: _today.add(const Duration(days: 2)),
        section: section,
        subject: subject,
      ),
      Homework(
        id: 'h2',
        title: 'Cost sheet practice',
        instructions: 'Prepare a cost sheet for the case on page 112.',
        dueOn: _today.add(const Duration(days: 5)),
        section: section,
        subject: costing,
      ),
      Homework(
        id: 'h3',
        title: 'Forfeiture of shares: notes',
        instructions: 'Read chapter 4.3 and write a one-page summary.',
        dueOn: _today.subtract(const Duration(days: 3)),
        section: section,
        subject: subject,
      ),
    ];

    final at = _today.subtract(const Duration(days: 4)).add(const Duration(hours: 19, minutes: 30));
    _handIns['h3'] = [
      for (final (i, s) in students.indexed)
        switch (i) {
          0 => Submission(
            studentId: s.id,
            fullName: s.fullName,
            rollNo: s.rollNo,
            status: SubmissionStatus.checked,
            submittedAt: at,
            text:
                'Forfeiture is the cancellation of shares when a shareholder fails to pay calls. Share capital is debited with the '
                'called-up amount, calls in arrears credited, and the amount received credited to Share Forfeiture account.',
            remark: 'Clear and complete. Well done.',
          ),
          1 => Submission(
            studentId: s.id,
            fullName: s.fullName,
            rollNo: s.rollNo,
            status: SubmissionStatus.submitted,
            submittedAt: at.add(const Duration(hours: 1)),
            text: 'Summary attached.',
            files: const [SubmissionFile(index: 0, name: 'notes-page1.jpg', mime: 'image/jpeg', bytes: 182000)],
          ),
          2 => Submission(
            studentId: s.id,
            fullName: s.fullName,
            rollNo: s.rollNo,
            status: SubmissionStatus.submitted,
            submittedAt: at.add(const Duration(days: 2)),
            text: 'Sorry for the delay, ma’am.',
            late: true,
          ),
          3 || 5 || 8 => Submission(
            studentId: s.id,
            fullName: s.fullName,
            rollNo: s.rollNo,
            status: SubmissionStatus.checked,
            submittedAt: at.subtract(Duration(hours: i)),
            text: 'Done.',
          ),
          _ => Submission(studentId: s.id, fullName: s.fullName, rollNo: s.rollNo),
        },
    ];
    _handIns['h1'] = [
      for (final (i, s) in students.indexed)
        i == 0
            ? Submission(
                studentId: s.id,
                fullName: s.fullName,
                rollNo: s.rollNo,
                status: SubmissionStatus.submitted,
                submittedAt: _today.subtract(const Duration(hours: 3)),
                text: 'Q1. Bank A/c Dr 5,00,000 To Share Application A/c 5,00,000 …',
                files: const [
                  SubmissionFile(index: 0, name: 'page1.jpg', mime: 'image/jpeg', bytes: 120000),
                  SubmissionFile(index: 1, name: 'workings.pdf', mime: 'application/pdf', bytes: 300000),
                ],
              )
            : Submission(studentId: s.id, fullName: s.fullName, rollNo: s.rollNo),
    ];

    // Unit test 1 as seeded (Harsh absent), and an assignment still being marked.
    const unitMarks = [19, 22.5, 17, 24, 13, 20, 21.5, 0, 16, 23, 18, 11.5];
    final unit = addAssessment(
      title: 'Unit test 1: Underwriting of shares',
      published: true,
      marks: {
        for (final (i, s) in students.indexed)
          s.id: i == 7 ? MarkInput(studentId: s.id, absent: true) : MarkInput(studentId: s.id, marks: unitMarks[i].toDouble()),
      },
    );
    assessmentRows[unit]!['heldOn'] = _day(-6);
    final assignment = addAssessment(title: 'Assignment: Issue of shares', maxMarks: 10);
    assessmentRows[assignment]!
      ..['kind'] = 'assignment'
      ..['heldOn'] = _day(-1);

    final now = _now;
    threads = [
      Conversation(
        id: 'c1',
        student: const Ref('s1', 'Aarav Patel'),
        className: section.name,
        staff: const Ref('u1', 'Anita Sharma'),
        family: FakeTeacherApi.rajesh,
        lastMessageAt: now.subtract(const Duration(hours: 20)),
        lastMessage: 'Hope he is better now. The lesson recording and the board are shared in the app; please ask him to try Exercise 4.2.',
      ),
      Conversation(
        id: 'c2',
        student: const Ref('s2', 'Ananya Gowda'),
        className: section.name,
        staff: const Ref('u1', 'Anita Sharma'),
        family: const Ref('g2', 'Sunita Gowda'),
        lastMessageAt: now.subtract(const Duration(days: 3, hours: 2)),
        lastMessage: 'Thank you ma’am, the fee receipt came through.',
        unread: 1,
      ),
    ];
    chat = {
      'c1': [
        ChatMessage(
          id: 'm1',
          senderId: 'g1',
          body: 'Good morning ma’am. Aarav had fever on Tuesday, so he missed Corporate Accounting. Could you share what was covered?',
          createdAt: now.subtract(const Duration(hours: 26)),
        ),
        ChatMessage(
          id: 'm2',
          senderId: 'u1',
          body: 'Hope he is better now. The lesson recording and the board are shared in the app; please ask him to try Exercise 4.2.',
          createdAt: now.subtract(const Duration(hours: 20)),
        ),
      ],
      'c2': [
        ChatMessage(
          id: 'm3',
          senderId: 'g2',
          body: 'Thank you ma’am, the fee receipt came through.',
          createdAt: now.subtract(const Duration(days: 3, hours: 2)),
        ),
      ],
    };
    contacts = [
      for (final s in students)
        StudentContacts(
          student: s,
          className: section.name,
          guardians: switch (s.id) {
            's1' => const [Guardian(id: 'g1', fullName: 'Rajesh Patel', relation: 'father')],
            's2' => const [Guardian(id: 'g2', fullName: 'Sunita Gowda', relation: 'mother')],
            's4' => const [Guardian(id: 'g4', fullName: 'Suresh Naik', relation: 'father')],
            's5' => const [Guardian(id: 'g5', fullName: 'Kavitha Hegde', relation: 'mother')],
            _ => const [],
          },
        ),
    ];

    _syllabi[subject.id] = const Syllabus(
      title: 'Corporate Accounting, BCom Semester 3',
      chapters: [
        SyllabusChapter(
          id: 'ch1',
          title: 'Issue of Shares',
          topics: [
            SyllabusTopic(id: 't1', title: 'Kinds of shares and share capital'),
            SyllabusTopic(id: 't2', title: 'Issue at par, premium and discount'),
            SyllabusTopic(id: 't3', title: 'Over-subscription and pro-rata allotment'),
          ],
        ),
        SyllabusChapter(
          id: 'ch2',
          title: 'Forfeiture and Re-issue of Shares',
          topics: [
            SyllabusTopic(id: 't4', title: 'Forfeiture of shares issued at par and premium'),
            SyllabusTopic(id: 't5', title: 'Re-issue of forfeited shares'),
          ],
        ),
        SyllabusChapter(
          id: 'ch3',
          title: 'Underwriting of Shares',
          topics: [
            SyllabusTopic(id: 't6', title: 'Underwriting commission'),
            SyllabusTopic(id: 't7', title: 'Marked and unmarked applications'),
          ],
        ),
        SyllabusChapter(
          id: 'ch4',
          title: 'Valuation of Goodwill',
          topics: [
            SyllabusTopic(id: 't8', title: 'Meaning and need for valuation of goodwill'),
            SyllabusTopic(id: 't9', title: 'Methods: average profit, super profit and capitalisation'),
          ],
        ),
        SyllabusChapter(
          id: 'ch5',
          title: 'Valuation of Shares',
          topics: [
            SyllabusTopic(id: 't10', title: 'Intrinsic value method'),
            SyllabusTopic(id: 't11', title: 'Yield and fair value methods'),
          ],
        ),
      ],
    );
    _syllabi[costing.id] = const Syllabus(
      title: 'Cost Accounting, BCom Semester 3',
      chapters: [
        SyllabusChapter(
          id: 'cc1',
          title: 'Introduction to Cost Accounting',
          topics: [
            SyllabusTopic(id: 'k1', title: 'Cost concepts and classification'),
            SyllabusTopic(id: 'k2', title: 'Cost sheet'),
          ],
        ),
        SyllabusChapter(
          id: 'cc2',
          title: 'Materials',
          topics: [
            SyllabusTopic(id: 'k3', title: 'EOQ and stock levels'),
            SyllabusTopic(id: 'k4', title: 'Pricing of issues: FIFO and LIFO'),
          ],
        ),
      ],
    );
    // The first topics were taught over the last two weeks, as in the seed.
    _coverage[subject.id] = {
      for (final (i, t) in ['t1', 't2', 't3', 't4'].indexed)
        t: TopicCoverage(
          coveredOn: _today.subtract(Duration(days: 14 - i * 3)),
          coveredBy: 'Anita Sharma',
        ),
    };
    _coverage[costing.id] = {'k1': TopicCoverage(coveredOn: _today.subtract(const Duration(days: 8)), coveredBy: 'Anita Sharma')};
    _plans[subject.id] = _buildPlan(subject.id);

    // Retention: r1 is kept; r2 is deleted within a week with its term; the others later.
    recordings = [
      _recording('r1', 'Forfeiture of shares', daysAgo: 1, shared: true, transcript: 'done', keep: true),
      _recording('r2', 'Issue at premium and discount', daysAgo: 3, shared: true, transcript: 'done', expiresIn: 5),
      _recording('r3', 'Pro-rata allotment', daysAgo: 6, transcript: 'queued', expiresIn: 40),
      _recording('r4', 'Cost sheet: worked example', daysAgo: 8, subjectName: costing.name, expiresIn: 40),
    ];
    termExpiry = {
      'r1': _today.add(const Duration(days: 40)),
      'r2': _today.add(const Duration(days: 5)),
      'r3': _today.add(const Duration(days: 40)),
      'r4': _today.add(const Duration(days: 40)),
    };

    draft = const LessonDraft(
      topicIds: ['t5'],
      preview: true,
      content: LessonContent(
        objectives: [
          'Pass journal entries for re-issue of forfeited shares',
          'Transfer the balance of Share Forfeiture account to Capital Reserve',
        ],
        steps: [
          LessonStep(minutes: 5, activity: 'Recap: forfeiture entries from the last class'),
          LessonStep(minutes: 20, activity: 'Worked example on the board: 500 shares re-issued at ₹8 paid up as ₹10'),
          LessonStep(minutes: 20, activity: 'Pairs solve Exercise 4.3, Q1–2; walk around and check'),
          LessonStep(minutes: 10, activity: 'Exit ticket: one re-issue entry each'),
        ],
        materials: ['Textbook ch. 4.3', 'Board templates: journal format'],
        assessment: 'Exit ticket: pass the re-issue entry and the capital reserve transfer.',
        homework: 'Exercise 4.3, Q3–5.',
      ),
    );
  }

  Map<String, dynamic> _recording(
    String id,
    String title, {
    required int daysAgo,
    bool shared = false,
    String transcript = 'none',
    String? subjectName,
    bool keep = false,
    int? expiresIn,
  }) {
    final start = _today.subtract(Duration(days: daysAgo)).add(const Duration(hours: 10));
    return {
      'id': id,
      'title': title,
      'startedAt': start.toUtc().toIso8601String(),
      'durationMs': 48 * 60000,
      // Audio would stream from a server: none in the demo.
      'hasAudio': false,
      'sectionId': section.id,
      'sectionName': section.name,
      'subjectName': subjectName ?? subject.name,
      'teacherName': 'Anita Sharma',
      'transcriptState': transcript,
      'summaryState': 'none',
      'sharedAt': shared ? start.add(const Duration(hours: 1)).toUtc().toIso8601String() : null,
      'finishedAt': start.add(const Duration(minutes: 48)).toUtc().toIso8601String(),
      'keep': keep,
      'expiresOn': expiresIn == null ? null : isoDate(_today.add(Duration(days: expiresIn))),
    };
  }

  // --- Sign-in: any password; phone codes are always 123456 --------------------------------------

  @override
  Future<void> login({required String tenant, required String login, required String password}) async {
    calls.add('login $tenant $login');
    if (password.isEmpty) throw ApiException(401, 'Wrong institution, login or password');
    token = 'demo-token';
  }

  @override
  Future<OtpChallenge> requestOtp({required String tenant, required String phone}) async =>
      const OtpChallenge(retryAfter: Duration(seconds: 30), expiresIn: Duration(minutes: 5));

  @override
  Future<void> verifyOtp({required String tenant, required String phone, required String code}) async {
    if (code != demoOtp) throw ApiException(401, 'Invalid or expired code', code: 'OTP_INVALID');
    token = 'demo-token';
  }

  @override
  Future<List<AppNotification>> notifications() async => const [
    AppNotification(id: 'n1', kind: 'message', data: {'conversationId': 'c2'}),
  ];

  // --- Timetable and attendance ----------------------------------------------------------------

  List<Period> _periods(DateTime day) {
    final d = day.weekday;
    if (d == DateTime.sunday || holidays.containsKey(isoDate(day))) return [];
    final date = isoDate(day);
    final now = _now;
    return [
      for (final (i, (start, end)) in _times.indexed)
        if ((i + d) % 2 == 0)
          () {
            final slotId = 'slot-$d-$i';
            final s = ClockTime.parse('$start:00'), e = ClockTime.parse('$end:00');
            final minute = now.hour * 60 + now.minute;
            return Period(
              slotId: slotId,
              startsAt: s,
              endsAt: e,
              section: section,
              subject: i % 3 == 0 ? costing : subject,
              room: room,
              isNow: date == isoDate(now) && minute >= s.minutes && minute < e.minutes,
              attendanceTaken: _sheet(slotId, date) != null,
              lessonPlanned: lessonPlans.containsKey('$slotId $date'),
            );
          }(),
    ];
  }

  /// The saved sheet; earlier days of the last two weeks were taken (Aarav missed a few).
  Map<String, AttendanceStatus>? _sheet(String slotId, String date) {
    final saved = _sheets['$slotId $date'];
    if (saved != null) return saved;
    final d = parseIsoDate(date);
    final back = _today.difference(d).inDays;
    if (back < 1 || back > 14) return null;
    return {
      for (final (i, s) in students.indexed)
        s.id: (i == 0 ? (back + i) % 5 == 0 : (back * 7 + i * 3) % 23 == 0) ? AttendanceStatus.absent : AttendanceStatus.present,
    };
  }

  @override
  Future<DayTimetable> timetable({String? date}) async {
    final d = parseIsoDate(date ?? isoDate(_today));
    String? next;
    for (var i = 1; i <= 30 && next == null; i++) {
      final c = d.add(Duration(days: i));
      if (_periods(c).isNotEmpty) next = isoDate(c);
    }
    return DayTimetable(
      date: isoDate(d),
      today: isoDate(_today),
      periods: _periods(d),
      nextTeachingDate: next,
      holiday: holidays[isoDate(d)],
    );
  }

  @override
  Future<List<TeacherClass>> classes() async => [TeacherClass(section, subject), TeacherClass(section, costing)];

  @override
  Future<AttendanceSheet> attendance({required String slotId, required String date}) async {
    final s = _sheet(slotId, date);
    return AttendanceSheet(taken: s != null, records: {...?s});
  }

  @override
  Future<AttendanceSheet> submitAttendance({
    required String slotId,
    required String date,
    required Map<String, AttendanceStatus> marks,
  }) async {
    _sheets['$slotId $date'] = {...marks};
    return super.submitAttendance(slotId: slotId, date: date, marks: marks);
  }

  // --- Board -------------------------------------------------------------------------------------

  @override
  Future<BoardConnection> claimBoard({String? code, String? qr}) async {
    calls.add('claim ${code ?? 'qr'}');
    if (code != null && !RegExp(r'^\d{6}$').hasMatch(code)) {
      throw ApiException(404, 'This code is invalid or has expired. Use the new code on the board.');
    }
    final now = _periods(_today).where((p) => p.isNow).firstOrNull;
    return active = BoardConnection(
      sessionId: 'demo-session',
      boardName: 'Room 204 Board',
      sectionName: section.name,
      subjectName: (now?.subject ?? subject).name,
      startsAt: now?.startsAt ?? ClockTime.parse('10:00:00'),
      endsAt: now?.endsAt ?? ClockTime.parse('10:55:00'),
    );
  }

  // --- Homework ----------------------------------------------------------------------------------

  @override
  Future<Homework> createHomework({
    required String sectionId,
    required String subjectId,
    required String title,
    required String instructions,
    required String dueOn,
  }) async {
    final h = Homework(
      id: 'h${++_next}',
      title: title,
      instructions: instructions,
      dueOn: parseIsoDate(dueOn),
      section: section,
      subject: subjectId == costing.id ? costing : subject,
    );
    homework = [h, ...homework];
    return h;
  }

  @override
  Future<SubmissionList> submissions(String homeworkId) {
    handedIn = _handIns[homeworkId] ??= [for (final s in students) Submission(studentId: s.id, fullName: s.fullName, rollNo: s.rollNo)];
    return super.submissions(homeworkId);
  }

  @override
  Future<Submission> reviewSubmission(String homeworkId, Submission submission, {required SubmissionStatus status, String? remark}) async {
    handedIn = _handIns[homeworkId] ?? handedIn;
    final done = await super.reviewSubmission(homeworkId, submission, status: status, remark: remark);
    _handIns[homeworkId] = handedIn;
    return done;
  }

  // --- Recordings: the list works, playback needs a server ---------------------------------------

  @override
  Future<Lesson> recordingLesson(String id) async => throw ApiException(404, 'Not available in the demo');

  // --- Messages ----------------------------------------------------------------------------------

  @override
  Future<ChatMessage> sendMessage(String conversationId, String body) async {
    final m = ChatMessage(id: 'm${++_next}', senderId: profile.id, body: body, createdAt: _now);
    chat[conversationId]!.add(m);
    threads = [
      for (final t in threads)
        t.id == conversationId
            ? Conversation(
                id: t.id,
                student: t.student,
                className: t.className,
                staff: t.staff,
                family: t.family,
                lastMessageAt: m.createdAt,
                lastMessage: body,
              )
            : t,
    ];
    return m;
  }

  /// A family reply "arrives" (DemoRealtime calls this a few seconds after sign-in).
  MessageNew receiveReply() {
    const conversationId = 'c1';
    final m = ChatMessage(
      id: 'm${++_next}',
      senderId: 'g1',
      body: 'Thank you ma’am. Aarav has finished Exercise 4.2 and handed it in.',
      createdAt: _now,
    );
    chat[conversationId]!.add(m);
    threads = [
      for (final t in threads)
        t.id == conversationId
            ? Conversation(
                id: t.id,
                student: t.student,
                className: t.className,
                staff: t.staff,
                family: t.family,
                lastMessageAt: m.createdAt,
                lastMessage: m.body,
                unread: t.unread + 1,
              )
            : t,
    ];
    return MessageNew(conversationId: conversationId, messageId: m.id, senderId: 'g1');
  }

  // --- Syllabus, coverage and plans --------------------------------------------------------------

  @override
  Future<Syllabus?> syllabus(String subjectId) async => _syllabi[subjectId];

  @override
  Future<Coverage> coverage({required String sectionId, required String subjectId}) async {
    final total = _syllabi[subjectId]?.chapters.fold<int>(0, (n, c) => n + c.topics.length) ?? 0;
    return Coverage(total: total, topics: {...?_coverage[subjectId]});
  }

  @override
  Future<void> markTopic({required String sectionId, required String subjectId, required String topicId, String? coveredOn}) async {
    (_coverage[subjectId] ??= {})[topicId] = TopicCoverage(
      coveredOn: coveredOn == null ? _today : parseIsoDate(coveredOn),
      coveredBy: profile.fullName,
    );
    if (_plans.containsKey(subjectId)) _plans[subjectId] = _buildPlan(subjectId, keep: _plans[subjectId]);
  }

  @override
  Future<void> unmarkTopic({required String sectionId, required String subjectId, required String topicId}) async {
    _coverage[subjectId]?.remove(topicId);
    if (_plans.containsKey(subjectId)) _plans[subjectId] = _buildPlan(subjectId, keep: _plans[subjectId]);
  }

  /// Two topics a week from three weeks ago (or the weeks of [keep]), with progress for today.
  YearPlan _buildPlan(String subjectId, {YearPlan? keep}) {
    final week = mondayOf(_today);
    final start = week.subtract(const Duration(days: 21));
    final topics = [
      for (final c in _syllabi[subjectId]!.chapters)
        for (final t in c.topics) (t, c.title),
    ];
    final kept = {for (final i in keep?.items ?? const <YearPlanItem>[]) i.topicId: i};
    final covered = _coverage[subjectId] ?? const {};
    final items = [
      for (final (i, (t, chapter)) in topics.indexed)
        () {
          final weekOf = kept[t.id]?.weekOf ?? start.add(Duration(days: 7 * (i ~/ 2)));
          return YearPlanItem(
            topicId: t.id,
            title: t.title,
            chapter: chapter,
            weekOf: weekOf,
            periods: kept[t.id]?.periods ?? 2,
            coveredOn: covered[t.id]?.coveredOn,
            late: covered[t.id] == null && weekOf.isBefore(week),
          );
        }(),
    ]..sort((a, b) => a.weekOf.compareTo(b.weekOf));
    final expected = items.where((i) => i.weekOf.isBefore(week)).length;
    final behind = items.where((i) => i.late).length;
    final done = items.where((i) => i.coveredOn != null).length;
    return YearPlan(
      id: keep?.id ?? 'yp-$subjectId',
      startsOn: start,
      endsOn: start.add(const Duration(days: 7 * 16 - 1)),
      thisWeek: week,
      progress: PlanProgress(
        total: items.length,
        covered: done,
        expected: expected,
        dueThisWeek: items.where((i) => i.weekOf == week).length,
        behindBy: behind,
        status: done == 0
            ? PlanStatus.notStarted
            : (behind > 0 ? PlanStatus.behind : (done > expected ? PlanStatus.ahead : PlanStatus.onTrack)),
      ),
      items: items,
    );
  }

  @override
  Future<YearPlan?> yearPlan({required String sectionId, required String subjectId}) async => _plans[subjectId];

  @override
  Future<YearPlan> generateYearPlan({required String sectionId, required String subjectId, String? startsOn, String? endsOn}) async =>
      _plans[subjectId] = _buildPlan(subjectId);

  @override
  Future<YearPlan> moveYearPlanItem(String planId, {required String topicId, required String weekOf, required int periods}) async {
    final entry = _plans.entries.firstWhere((e) => e.value.id == planId);
    plan = entry.value;
    final moved = await super.moveYearPlanItem(planId, topicId: topicId, weekOf: weekOf, periods: periods);
    return _plans[entry.key] = _buildPlan(entry.key, keep: moved);
  }

  @override
  Future<PeriodPlan> periodPlan({required String slotId, required String date}) async {
    final subjectId = _subjectOfSlot(slotId);
    final covered = _coverage[subjectId] ?? const {};
    suggestedTopicIds = [
      for (final c in _syllabi[subjectId]?.chapters ?? const <SyllabusChapter>[])
        for (final t in c.topics)
          if (!covered.containsKey(t.id)) t.id,
    ].take(1).toList();
    syllabusOutline = _syllabi[subjectId];
    return super.periodPlan(slotId: slotId, date: date);
  }

  @override
  Future<PeriodPlan> saveLessonPlan({
    required String slotId,
    required String date,
    required List<String> topicIds,
    required LessonContent content,
    required bool aiDrafted,
  }) {
    syllabusOutline = _syllabi[_subjectOfSlot(slotId)];
    return super.saveLessonPlan(slotId: slotId, date: date, topicIds: topicIds, content: content, aiDrafted: aiDrafted);
  }

  @override
  Future<LessonDraft> draftLessonPlan({required String slotId, required String date, List<String>? topicIds, String? language}) async {
    final subjectId = _subjectOfSlot(slotId);
    final ids = topicIds ?? (await periodPlan(slotId: slotId, date: date)).suggestedTopicIds;
    final titles = {
      for (final c in _syllabi[subjectId]?.chapters ?? const <SyllabusChapter>[])
        for (final t in c.topics) t.id: t.title,
    };
    final topic = ids.map((id) => titles[id]).nonNulls.firstOrNull ?? 'the topic';
    return LessonDraft(
      topicIds: ids,
      preview: true,
      content: LessonContent(
        objectives: ['Explain $topic in your own words', 'Solve a textbook problem on $topic'],
        steps: [
          const LessonStep(minutes: 5, activity: 'Recap of the last class with two quick questions'),
          LessonStep(minutes: 20, activity: 'Explain $topic with a worked example on the board'),
          const LessonStep(minutes: 20, activity: 'Students solve two problems in pairs; walk around and check'),
          const LessonStep(minutes: 10, activity: 'Exit ticket and homework'),
        ],
        materials: const ['Textbook', 'Board templates: journal format'],
        assessment: 'Exit ticket: one problem on $topic.',
        homework: 'Two textbook problems on $topic.',
      ),
    );
  }

  String _subjectOfSlot(String slotId) {
    final m = RegExp(r'^slot-(\d)-(\d)$').firstMatch(slotId);
    return m != null && int.parse(m[2]!) % 3 == 0 ? costing.id : subject.id;
  }
}

/// Realtime for the demo: a family reply "arrives" [delay] after the home screen connects.
class DemoRealtime extends FakeRealtime {
  DemoRealtime(this.api, {this.delay = const Duration(seconds: 8)});

  final DemoTeacherApi api;
  final Duration delay;
  Timer? _timer;
  bool _sent = false;

  @override
  void connect({required String baseUrl, required String token}) {
    super.connect(baseUrl: baseUrl, token: token);
    if (_sent) return;
    _timer?.cancel();
    _timer = Timer(delay, () {
      _sent = true;
      send(api.receiveReply());
    });
  }

  @override
  void disconnect() {
    _timer?.cancel();
    super.disconnect();
  }
}
