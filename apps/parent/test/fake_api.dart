import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:kinetix_lesson/kinetix_lesson.dart';
import 'package:kinetix_parent/core/api.dart';
import 'package:kinetix_parent/core/models.dart';

/// In-memory [ParentApi] for widget tests.
class FakeParentApi implements ParentApi {
  @override
  String baseUrl = 'http://test';
  @override
  String? token;

  final calls = <String>[];

  Me profile = Me(
    id: 'u1',
    fullName: 'Rajesh Patel',
    roles: ['guardian'],
    preferredLanguage: 'en',
    institution: 'Demo College',
    email: 'parent@demo.kinetix.in',
    phone: '+919800000001',
  );

  final aarav = Child(
    id: 'c1',
    fullName: 'Aarav Patel',
    rollNo: 'U03BC001',
    sectionId: 'sec1',
    sectionName: 'BCom Sem 3 A',
    relation: 'father',
  );
  final diya = Child(
    id: 'c2',
    fullName: 'Diya Patel',
    rollNo: 'U01CA001',
    sectionId: 'sec2',
    sectionName: 'BCA Sem 1 A',
    relation: 'father',
  );
  late List<Child> kids = [aarav, diya];

  static final today = DateTime(2026, 10, 4);

  Homework homework({String id = 'h1', String title = 'Exercise 4.2: Issue of shares', int dueIn = 1}) => Homework(
    id: id,
    title: title,
    instructions: 'Solve questions 1 to 5 from the textbook. Show journal entries for each.',
    dueOn: today.add(Duration(days: dueIn)),
    subject: 'Corporate Accounting',
    teacher: 'Anita Sharma',
  );

  late Map<String, ChildSummary> summaries = {
    'c1': ChildSummary(
      today: today,
      days: 30,
      attendance: AttendanceSummary(
        periods: 30,
        present: 22,
        absent: 6,
        late: 2,
        excused: 0,
        rate: 80,
        recentAbsences: [
          ClassMark(
            date: DateTime(2026, 10, 1),
            status: AttendanceStatus.absent,
            subject: 'Corporate Accounting',
            startsAt: ClockTime.parse('10:00:00'),
          ),
        ],
      ),
      upcoming: [
        homework(),
        homework(id: 'h2', title: 'Cost sheet practice', dueIn: 5),
      ],
      pastHomework: [homework(id: 'h3', title: 'Forfeiture of shares: notes', dueIn: -3)],
      participation: [Participation(subject: 'Corporate Accounting', correct: 4, partial: 1, incorrect: 0, skipped: 0)],
      boards: [board.summary],
      recordings: recordings,
    ),
    'c2': ChildSummary(
      today: today,
      days: 30,
      attendance: AttendanceSummary(periods: 20, present: 20, absent: 0, late: 0, excused: 0, rate: 100, recentAbsences: []),
      upcoming: [],
      pastHomework: [],
      participation: [],
      boards: [],
    ),
  };

  List<ClassMark> attendanceMarks = [
    ClassMark(
      date: DateTime(2026, 10, 3),
      status: AttendanceStatus.present,
      subject: 'Cost Accounting',
      startsAt: ClockTime.parse('09:00:00'),
    ),
    ClassMark(
      date: DateTime(2026, 10, 1),
      status: AttendanceStatus.absent,
      subject: 'Corporate Accounting',
      startsAt: ClockTime.parse('10:00:00'),
    ),
    ClassMark(
      date: DateTime(2026, 10, 1),
      status: AttendanceStatus.late,
      subject: 'Cost Accounting',
      startsAt: ClockTime.parse('12:15:00'),
    ),
  ];

  late List<AppNotification> inbox = [
    AppNotification(
      id: 'n1',
      kind: NotificationKind.homework,
      title: 'Homework: Corporate Accounting',
      body: 'Exercise 4.2: Issue of shares · due 2026-10-05',
      data: {'homeworkId': 'h1', 'sectionId': 'sec1'},
      createdAt: DateTime.now(),
    ),
    AppNotification(
      id: 'n2',
      kind: NotificationKind.absence,
      title: 'Aarav was marked absent',
      body: 'Aarav Patel was marked absent for Corporate Accounting (10:00–10:55) on Thu 1 Oct.',
      data: {'studentId': 'c1', 'date': '2026-10-01'},
      createdAt: DateTime.now().subtract(const Duration(days: 3)),
    ),
    AppNotification(
      id: 'n3',
      kind: NotificationKind.broadcast,
      title: 'Parent–teacher meeting',
      body: 'Saturday 10 October, 10:00 in the main hall.',
      data: {'broadcastId': 'b1'},
      createdAt: DateTime.now().subtract(const Duration(days: 5)),
      readAt: DateTime.now().subtract(const Duration(days: 4)),
    ),
  ];

  AppNotification boardNotice(String id, String whiteboardId) => AppNotification(
    id: id,
    kind: NotificationKind.boardShared,
    title: "Today's board: Corporate Accounting",
    body: 'Issue and forfeiture of shares. Open it to revise what was taught in class.',
    data: {'whiteboardId': whiteboardId, 'sectionId': 'sec1'},
    createdAt: DateTime.now(),
  );

  /// Shared with Aarav's class, newest first: he missed the older one.
  late List<RecordingInfo> recordings = [
    recordingJson('r1', 'Cost sheets', subject: 'Cost Accounting', startedAt: '2026-10-04T03:30:00Z'),
    recordingJson('r2', 'Issue of shares', subject: 'Corporate Accounting', startedAt: '2026-10-01T04:30:00Z', missed: true),
  ].map(RecordingInfo.fromJson).toList();

  static Map<String, dynamic> recordingJson(
    String id,
    String title, {
    required String subject,
    required String startedAt,
    bool missed = false,
  }) => {
    'id': id,
    'title': title,
    'startedAt': startedAt,
    'durationMs': 20000,
    'hasAudio': true,
    'sectionId': 'sec1',
    'sectionName': 'BCom Sem 3 A',
    'subjectName': subject,
    'teacherName': 'Anita Sharma',
    'transcriptState': 'done',
    'summaryState': 'done',
    'sharedAt': startedAt,
    'finishedAt': startedAt,
    'missed': missed,
  };

  Map<String, dynamic> recordingJsonFor(String id, {bool missed = false}) =>
      recordingJson(id, 'Lesson $id', subject: 'Subject $id', startedAt: '2026-10-0${1 + id.hashCode % 3}T04:30:00Z', missed: missed);

  static Map<String, dynamic> lessonJson = {
    'v': 1,
    'canvas': {'w': 1920, 'h': 1080},
    'background': 'plain',
    'durationMs': 20000,
    'events': [
      [
        0,
        'L',
        [<Object>[]],
        0,
      ],
      [
        1000,
        'b',
        1,
        {
          't': 'pen',
          'c': 4279966495,
          'w': 4,
          'p': [100, 100, 400, 400],
        },
      ],
      [1100, 'e', 1],
    ],
  };

  AppNotification recordingNotice(String id, String recordingId) => AppNotification(
    id: id,
    kind: NotificationKind.recording,
    title: 'Missed Corporate Accounting? Watch the lesson',
    body: 'Issue of shares',
    data: {'recordingId': recordingId, 'sectionId': 'sec1'},
    createdAt: DateTime.now(),
  );

  SharedBoard board = SharedBoard.fromJson({
    'id': 'wb1',
    'title': 'Issue and forfeiture of shares',
    'pageCount': 2,
    'sectionName': 'BCom Sem 3 A',
    'subjectName': 'Corporate Accounting',
    'teacherName': 'Anita Sharma',
    'sharedAt': '2026-10-04T06:30:00Z',
    'content': {
      'v': 1,
      'background': 'grid',
      'canvas': {'w': 1920, 'h': 1080},
      'pages': [
        {
          'strokes': [
            {
              't': 'pen',
              'c': 4279966495,
              'w': 4,
              'p': [100, 100, 400, 100, 400, 500],
            },
            {
              't': 'shape',
              's': 'triangle',
              'c': 4292423717,
              'w': 4,
              'p': [800, 200, 700, 400, 900, 400, 800, 200],
            },
          ],
        },
        {
          'strokes': [
            {
              't': 'shape',
              's': 'arrow',
              'c': 4292423717,
              'w': 5,
              'p': [100, 100, 600, 300],
            },
          ],
        },
      ],
    },
  });

  @override
  Future<void> login({required String tenant, required String login, required String password}) async {
    calls.add('login $tenant $login');
    if (password != 'kinetix123') throw ApiException(401, 'Wrong institution, login or password');
    token = 'tok';
  }

  @override
  Future<Me> me() async => profile;

  @override
  Future<List<Child>> children() async => kids;

  @override
  Future<ChildSummary> summary(String childId, {int days = 30}) async {
    calls.add('summary $childId');
    final s = summaries[childId];
    if (s == null) throw ApiException(404, 'Child not found');
    return s;
  }

  @override
  Future<List<ClassMark>> attendance(String childId, {int days = 30}) async => attendanceMarks;

  @override
  Future<Inbox> notifications() async => Inbox(unread: inbox.where((n) => n.unread).length, items: inbox);

  @override
  Future<void> markRead(String notificationId) async => calls.add('read $notificationId');

  @override
  Future<void> markAllRead() async => calls.add('read-all');

  @override
  Future<SharedBoard> whiteboard(String id) async {
    calls.add('board $id');
    if (id != board.summary.id) throw ApiException(404, 'Board not found');
    return board;
  }

  @override
  Future<({Homework homework, String sectionId})> homeworkById(String id) async {
    calls.add('homework $id');
    throw ApiException(404, 'Homework not found');
  }

  @override
  Future<RecordingInfo> recording(String id) async {
    calls.add('recording $id');
    final r = recordings.where((r) => r.id == id).firstOrNull;
    if (r == null) throw ApiException(404, 'Recording not found');
    return RecordingInfo.fromJson({
      ...recordingJson(r.id, r.title, subject: r.subjectName!, startedAt: r.startedAt.toUtc().toIso8601String()),
      'missed': null,
      'transcript': 'Today we look at how companies issue shares.',
      'summary': {
        'summary': 'How companies issue shares.',
        'keyPoints': ['Shares can be issued at par or at a premium'],
      },
    });
  }

  @override
  Future<Lesson> recordingLesson(String id) async {
    calls.add('lesson $id');
    return Lesson.fromJson(lessonJson);
  }

  // ── Fees ──────────────────────────────────────────────────────────────────────────────────

  /// 'demo', 'razorpay' or null (pay at the counter).
  String? onlinePayments = 'demo';

  /// Aarav: tuition part-paid (due in 11 days) and an overdue exam fee. Diya: all paid.
  late Map<String, List<FeeInvoice>> invoices = {
    'c1': [
      FeeInvoice(
        id: 'i1',
        title: 'Semester 3 tuition',
        amountPaise: 4250000,
        paidPaise: 1000000,
        dueOn: DateTime(2026, 10, 15),
        status: FeeStatus.due,
      ),
      FeeInvoice(id: 'i2', title: 'Exam fee', amountPaise: 250000, paidPaise: 0, dueOn: DateTime(2026, 10, 1), status: FeeStatus.due),
    ],
    'c2': [
      FeeInvoice(
        id: 'i3',
        title: 'Semester 1 tuition',
        amountPaise: 3800000,
        paidPaise: 3800000,
        dueOn: DateTime(2026, 9, 20),
        status: FeeStatus.paid,
      ),
    ],
  };

  late Map<String, List<FeePayment>> feePayments = {
    'c1': [
      FeePayment(
        id: 'p1',
        invoiceId: 'i1',
        amountPaise: 1000000,
        method: PaymentMethod.cash,
        receiptNo: 'RCPT/2026-27/00001',
        paidAt: DateTime(2026, 9, 28, 11, 5),
      ),
    ],
    'c2': [
      FeePayment(
        id: 'p2',
        invoiceId: 'i3',
        amountPaise: 3800000,
        method: PaymentMethod.online,
        receiptNo: 'RCPT/2026-27/00002',
        paidAt: DateTime(2026, 9, 18, 18, 40),
      ),
    ],
  };

  final _orders = <String, ({String invoiceId, String childId, int amountPaise, String orderId})>{};
  var _receiptNo = 2;

  String? _childOfInvoice(String invoiceId) => invoices.entries.where((e) => e.value.any((i) => i.id == invoiceId)).firstOrNull?.key;

  @override
  Future<StudentFees> fees(String childId) async {
    calls.add('fees $childId');
    final list = [...?invoices[childId]]..sort((a, b) => b.dueOn.compareTo(a.dueOn));
    return StudentFees(
      duePaise: list.where((i) => !i.isPaid).fold(0, (s, i) => s + i.balancePaise),
      onlinePayments: switch (onlinePayments) {
        'demo' => OnlinePayments.demo,
        'razorpay' => OnlinePayments.razorpay,
        _ => null,
      },
      invoices: list,
      payments: [...?feePayments[childId]]..sort((a, b) => b.paidAt!.compareTo(a.paidAt!)),
    );
  }

  @override
  Future<FeeCheckout> checkout(String invoiceId, {int? amountPaise}) async {
    calls.add('checkout $invoiceId ${amountPaise ?? 'full'}');
    if (onlinePayments == null) throw ApiException(503, 'Online payment is not available yet. Please pay at the fees counter.');
    final childId = _childOfInvoice(invoiceId);
    if (childId == null) throw ApiException(404, 'Invoice not found');
    final inv = invoices[childId]!.firstWhere((i) => i.id == invoiceId);
    if (inv.isPaid) throw ApiException(400, 'This fee is already paid');
    final amount = amountPaise ?? inv.balancePaise;
    if (amount > inv.balancePaise) throw ApiException(400, 'That is more than the balance due');
    final paymentId = 'pay${_orders.length + 10}';
    final orderId = '${onlinePayments}_order_${_orders.length + 1}';
    _orders[paymentId] = (invoiceId: invoiceId, childId: childId, amountPaise: amount, orderId: orderId);
    return FeeCheckout(
      paymentId: paymentId,
      provider: onlinePayments!,
      keyId: onlinePayments == 'demo' ? 'demo' : 'rzp_test_key',
      orderId: orderId,
      amountPaise: amount,
      currency: 'INR',
      name: 'Demo College',
      description: inv.title,
      prefillName: profile.fullName,
      prefillEmail: profile.email!,
      prefillContact: profile.phone!,
    );
  }

  @override
  Future<FeeReceipt> confirmPayment(String paymentId, {required String providerPaymentId, required String signature}) async {
    calls.add('confirm $paymentId');
    final o = _orders[paymentId];
    if (o == null) throw ApiException(404, 'Payment not found');
    final expected = Hmac(sha256, utf8.encode('kinetix-demo-payments')).convert(utf8.encode('${o.orderId}|$providerPaymentId')).toString();
    if (signature != expected) throw ApiException(403, 'The payment could not be verified');
    final list = invoices[o.childId]!;
    final at = list.indexWhere((i) => i.id == o.invoiceId);
    final inv = list[at];
    final paid = inv.paidPaise + o.amountPaise;
    list[at] = FeeInvoice(
      id: inv.id,
      title: inv.title,
      amountPaise: inv.amountPaise,
      paidPaise: paid,
      dueOn: inv.dueOn,
      status: paid >= inv.amountPaise ? FeeStatus.paid : FeeStatus.due,
    );
    _receiptNo++;
    feePayments[o.childId]!.add(
      FeePayment(
        id: paymentId,
        invoiceId: o.invoiceId,
        amountPaise: o.amountPaise,
        method: PaymentMethod.online,
        receiptNo: 'RCPT/2026-27/${_receiptNo.toString().padLeft(5, '0')}',
        paidAt: DateTime.now(),
      ),
    );
    _references[paymentId] = providerPaymentId;
    return receipt(paymentId);
  }

  final _references = <String, String>{};

  @override
  Future<FeeReceipt> receipt(String paymentId) async {
    calls.add('receipt $paymentId');
    for (final MapEntry(key: childId, value: list) in feePayments.entries) {
      final p = list.where((p) => p.id == paymentId).firstOrNull;
      if (p == null) continue;
      final child = kids.firstWhere((k) => k.id == childId);
      final inv = invoices[childId]!.firstWhere((i) => i.id == p.invoiceId);
      return FeeReceipt(
        receiptNo: p.receiptNo!,
        institution: 'Demo College',
        studentId: child.id,
        studentName: child.fullName,
        rollNo: child.rollNo,
        className: child.sectionName,
        feeTitle: inv.title,
        feeAmountPaise: inv.amountPaise,
        balancePaise: inv.balancePaise,
        amountPaise: p.amountPaise,
        method: p.method,
        reference: _references[paymentId],
        paidAt: p.paidAt!,
      );
    }
    throw ApiException(404, 'Receipt not found');
  }

  // ── Library ───────────────────────────────────────────────────────────────────────────────

  /// Aarav: one book due in 5 days and one returned late with a fine. Diya: one overdue.
  late Map<String, LibraryAccount> libraries = {
    'c1': LibraryAccount.fromJson({
      'current': [loanJson('l1', 'Corporate Accounting', author: 'S. N. Maheshwari', dueOn: '2026-10-09')],
      'history': [
        loanJson(
          'l2',
          'Wings of Fire',
          author: 'A. P. J. Abdul Kalam',
          issuedAt: '2026-09-05T05:00:00Z',
          dueOn: '2026-09-20',
          returnedAt: '2026-09-23T06:00:00Z',
          finePaise: 600,
        ),
      ],
      'finesPaise': 600,
    }),
    'c2': LibraryAccount.fromJson({
      'current': [
        loanJson('l3', 'Discrete Mathematics and Its Applications', author: 'Kenneth H. Rosen', dueOn: '2026-09-30', overdue: true),
      ],
      'history': [],
      'finesPaise': 0,
    }),
  };

  static Map<String, dynamic> loanJson(
    String id,
    String title, {
    required String author,
    required String dueOn,
    String issuedAt = '2026-09-25T05:00:00Z',
    String? returnedAt,
    int finePaise = 0,
    bool overdue = false,
  }) => {
    'id': id,
    'book': {'id': 'b-$id', 'title': title, 'author': author, 'callNo': '657.95 MAH'},
    'issuedAt': issuedAt,
    'dueOn': dueOn,
    'returnedAt': returnedAt,
    'finePaise': finePaise,
    'overdue': overdue,
  };

  @override
  Future<LibraryAccount> library(String childId) async {
    calls.add('library $childId');
    return libraries[childId] ?? LibraryAccount(current: [], history: [], finesPaise: 0);
  }

  // ── Marks ─────────────────────────────────────────────────────────────────────────────────

  late Map<String, ChildMarks> childMarks = {
    'c1': ChildMarks.fromJson({
      'assessments': [
        {
          'id': 'a1',
          'title': 'Unit test 1: Underwriting of shares',
          'kind': 'test',
          'maxMarks': 25,
          'heldOn': '2026-09-28',
          'subject': 'Corporate Accounting',
          'marks': 22.5,
          'absent': false,
          'remark': 'Neat journal entries.',
          'classAverage': 18.7,
          'classHighest': 24,
        },
        {
          'id': 'a2',
          'title': 'Cost sheet assignment',
          'kind': 'assignment',
          'maxMarks': 10,
          'heldOn': '2026-09-21',
          'subject': 'Cost Accounting',
          'marks': 5,
          'absent': false,
          'remark': null,
          'classAverage': 7.2,
          'classHighest': 10,
        },
      ],
      'subjects': [
        {'subject': 'Corporate Accounting', 'percent': 90},
        {'subject': 'Cost Accounting', 'percent': 50},
      ],
    }),
    'c2': ChildMarks(assessments: [], subjects: []),
  };

  @override
  Future<ChildMarks> marks(String childId) async {
    calls.add('marks $childId');
    return childMarks[childId] ?? ChildMarks(assessments: [], subjects: []);
  }

  // ── Messages ──────────────────────────────────────────────────────────────────────────────

  late List<ChildContacts> familyContacts = [
    ChildContacts(
      studentId: 'c1',
      studentName: 'Aarav Patel',
      className: 'BCom Sem 3 A',
      staff: [
        StaffContact(id: 't1', fullName: 'Anita Sharma', subjects: ['Corporate Accounting', 'Cost Accounting']),
      ],
    ),
    ChildContacts(
      studentId: 'c2',
      studentName: 'Diya Patel',
      className: 'BCA Sem 1 A',
      staff: [
        StaffContact(id: 't2', fullName: 'Ravi Kumar', subjects: ['Discrete Mathematics']),
      ],
    ),
  ];

  static DateTime _yesterday(int hour) {
    final y = DateTime.now().subtract(const Duration(days: 1));
    return DateTime(y.year, y.month, y.day, hour);
  }

  /// Conversation id → its messages, oldest first.
  late Map<String, List<ChatMessage>> chats = {
    'cv1': [
      ChatMessage(
        id: 'm1',
        senderId: 'u1',
        body: 'Good morning ma’am. Aarav had fever on Tuesday. Could you share what was covered?',
        createdAt: _yesterday(9),
      ),
      ChatMessage(id: 'm2', senderId: 't1', body: 'Hope he is better now. Please ask him to try Exercise 4.2.', createdAt: _yesterday(15)),
    ],
  };

  /// Conversation id → (child, teacher) and when the parent last read it.
  late Map<String, ({String childId, String teacherId})> threadInfo = {'cv1': (childId: 'c1', teacherId: 't1')};
  final _readAt = <String, DateTime>{};

  Conversation _summary(String id) {
    final info = threadInfo[id]!;
    final child = kids.firstWhere((k) => k.id == info.childId);
    final teacher = familyContacts.expand((c) => c.staff).firstWhere((s) => s.id == info.teacherId);
    final list = chats[id] ?? [];
    final read = _readAt[id];
    return Conversation(
      id: id,
      student: Person(id: child.id, fullName: child.fullName),
      className: child.sectionName,
      staff: Person(id: teacher.id, fullName: teacher.fullName),
      family: Person(id: profile.id, fullName: profile.fullName),
      lastMessage: list.lastOrNull?.body,
      lastMessageAt: list.lastOrNull?.createdAt,
      unread: list.where((m) => m.senderId != profile.id && (read == null || m.createdAt.isAfter(read))).length,
    );
  }

  @override
  Future<List<ChildContacts>> contacts() async {
    calls.add('contacts');
    return familyContacts;
  }

  @override
  Future<List<Conversation>> conversations() async {
    calls.add('conversations');
    final list = [for (final id in threadInfo.keys) _summary(id)];
    list.sort((a, b) => (b.lastMessageAt ?? DateTime(0)).compareTo(a.lastMessageAt ?? DateTime(0)));
    return list;
  }

  @override
  Future<Conversation> startConversation({required String childId, required String teacherId}) async {
    calls.add('start $childId $teacherId');
    final existing = threadInfo.entries.where((e) => e.value.childId == childId && e.value.teacherId == teacherId).firstOrNull;
    if (existing != null) return _summary(existing.key);
    final id = 'cv${threadInfo.length + 1}';
    threadInfo[id] = (childId: childId, teacherId: teacherId);
    chats[id] = [];
    return _summary(id);
  }

  /// Page size for [messages] (the server's is 50).
  int pageSize = 50;

  @override
  Future<MessagePage> messages(String conversationId, {DateTime? before}) async {
    calls.add('messages $conversationId${before == null ? '' : ' before'}');
    if (!threadInfo.containsKey(conversationId)) throw ApiException(404, 'Conversation not found');
    final all = (chats[conversationId] ?? []).where((m) => before == null || m.createdAt.isBefore(before)).toList();
    final page = all.length <= pageSize ? all : all.sublist(all.length - pageSize);
    return MessagePage(conversation: _summary(conversationId), messages: page);
  }

  @override
  Future<ChatMessage> sendMessage(String conversationId, String body) async {
    calls.add('send $conversationId $body');
    final m = ChatMessage(id: 'm${DateTime.now().microsecondsSinceEpoch}', senderId: profile.id, body: body, createdAt: DateTime.now());
    chats.putIfAbsent(conversationId, () => []).add(m);
    _readAt[conversationId] = m.createdAt;
    return m;
  }

  @override
  Future<void> markConversationRead(String conversationId) async {
    calls.add('chat-read $conversationId');
    _readAt[conversationId] = DateTime.now();
  }
}
