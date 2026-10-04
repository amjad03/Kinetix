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

  List<ClassMark> marks = [
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
  Future<List<ClassMark>> attendance(String childId, {int days = 30}) async => marks;

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
}
