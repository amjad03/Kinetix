// Staff work screens (Profile → Staff tools): tasks, requests, substitutions, invigilation,
// evaluation, mentoring, course rosters, surveys and clubs.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_teacher/core/work_models.dart';
import 'package:kinetix_teacher/features/attendance/attendance_screen.dart';
import 'package:kinetix_teacher/features/work/duties_screens.dart';
import 'package:kinetix_teacher/features/work/evaluation_screens.dart';
import 'package:kinetix_teacher/features/work/mentoring_screens.dart';
import 'package:kinetix_teacher/features/work/requests_screen.dart';
import 'package:kinetix_teacher/features/work/roster_surveys_clubs.dart';
import 'package:kinetix_teacher/features/work/tasks_screen.dart';

import 'fake_api.dart';
import 'helpers.dart';

TaskInfo task(String id, {String title = 'Collect exam forms', TaskStatus status = TaskStatus.open, bool overdue = false}) => TaskInfo(
  id: id, title: title, description: '', ownerName: 'Principal', assigneeName: 'Anita Sharma', priority: 'high', status: status, overdue: overdue, version: 2,
);

WorkflowRequestInfo request(String id, {String title = 'Lab consumables', bool canDecide = false, bool canCancel = false}) => WorkflowRequestInfo(
  id: id, requestType: 'purchase', title: title, status: 'pending', requesterName: 'Ravi', stepName: 'Head of department', stepNumber: 1, stepCount: 2, version: 3,
  amount: 4500, payload: const {'item': 'Beakers'}, canDecide: canDecide, canCancel: canCancel,
  timeline: const [WorkflowAction(action: 'submitted', actorName: 'Ravi', comment: '')],
);

MenteeInfo mentee({String level = 'high'}) => MenteeInfo(
  studentId: 'st1', studentName: 'Aarav Patel', rollNo: 'U03BC001', section: 'BCom Sem 3 A', level: level, attendancePct: 62, failingMarks: 2, overdueFees: 1, openCases: 0,
);

void main() {
  late FakeTeacherApi api;
  setUp(() {
    api = FakeTeacherApi();
    seed(api);
  });

  test('parses the API shapes', () {
    final t = TaskInfo.fromJson({'id': 't', 'title': 'x', 'status': 'in_progress', 'overdue': true, 'version': 4, 'dueAt': '2026-10-12T04:30:00.000Z', 'ownerName': 'A', 'assigneeName': 'B', 'priority': 'urgent'});
    expect((t.status, t.overdue, t.version), (TaskStatus.inProgress, true, 4));
    expect(taskStatusCode(TaskStatus.inProgress), 'in_progress');
    final s = EvalScript.fromJson({
      'id': 'a', 'status': 'draft', 'dummyNo': 'D-1', 'total': null,
      'pages': [{'index': 0, 'name': 'p1', 'mime': 'image/png'}],
      'questions': [{'id': 'q1', 'no': '1a', 'maxMarks': 5}],
      'entries': [{'questionId': 'q1', 'marks': '3.50', 'comment': null}],
    });
    expect((s.pageCount, s.questions.single.maxMarks, s.entries.single.marks), (1, 5.0, 3.5));
    final p = InterventionPlan.fromJson({
      'plan': {'id': 'p', 'studentId': 's', 'goal': 'g', 'reviewOn': '2026-11-01', 'status': 'open', 'actions': [{'text': 'a', 'done': true}]},
      'studentName': 'Asha',
    });
    expect((p.studentName, p.actions.single.done), ('Asha', true));
    expect(numText(3), '3');
    expect(numText(3.5), '3.5');
  });

  testWidgets('tasks: lists mine and by me, starts and finishes a task', (tester) async {
    phone(tester);
    api.taskList = [task('k1'), task('k2', title: 'Update marks sheet', status: TaskStatus.inProgress, overdue: true)];
    api.assignedTaskList = [task('k3', title: 'Prepare notice')];
    await tester.pumpWidget(localizedApp(home: TasksScreen(api: api)));
    await tester.pumpAndSettle();
    expect(find.text('Collect exam forms'), findsOneWidget);
    expect(find.text('Overdue'), findsOneWidget);
    expect(find.text('From Principal'), findsNWidgets(2));

    await tapAndSettle(tester, find.byKey(const Key('start-k1')));
    expect(api.calls.last, 'setTaskStatus k1 in_progress 2');
    await tapAndSettle(tester, find.byKey(const Key('done-k2')));
    expect(api.calls.last, 'setTaskStatus k2 done 2');
    expect(find.byKey(const Key('done-k2')), findsNothing);

    await tapAndSettle(tester, find.byKey(const Key('tabByMe')));
    expect(find.text('Prepare notice'), findsOneWidget);
    expect(find.text('To Anita Sharma'), findsOneWidget);
    expect(find.byKey(const Key('start-k3')), findsNothing);
  });

  testWidgets('tasks: shows an empty state and works in Kannada', (tester) async {
    phone(tester);
    await tester.pumpWidget(localizedApp(home: TasksScreen(api: api), language: 'kn'));
    await tester.pumpAndSettle();
    expect(find.text(strings('kn').tasksEmpty), findsOneWidget);
    expect(strings('hi').tasksTitle, isNot(strings('en').tasksTitle));
  });

  testWidgets('requests: an approver decides with a comment', (tester) async {
    phone(tester);
    api.workflowInboxList = [request('r1', canDecide: true)];
    await tester.pumpWidget(localizedApp(home: RequestsScreen(api: api)));
    await tester.pumpAndSettle();
    expect(find.textContaining('By Ravi'), findsOneWidget);
    await tapAndSettle(tester, find.byKey(const Key('request-r1')));
    expect(find.text('Lab consumables'), findsOneWidget);
    expect(find.text('item: Beakers'), findsOneWidget);
    expect(find.textContaining('Submitted'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('decisionComment')), 'Go ahead');
    await tapAndSettle(tester, find.byKey(const Key('approveRequest')));
    expect(api.calls.single, 'decideWorkflow r1 approve Go ahead');
    expect(find.byKey(const Key('emptyState')), findsOneWidget);
  });

  testWidgets('requests: submits a custom request with its fields, then withdraws it', (tester) async {
    phone(tester);
    api.workflowRoutes = const [
      WorkflowDefinition(requestType: 'purchase', name: 'Purchase request', description: 'Buy equipment', fields: [
        WorkflowField(key: 'item', label: 'Item', type: 'text', required: true),
      ]),
    ];
    await tester.pumpWidget(localizedApp(home: RequestsScreen(api: api)));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('emptyState')), findsOneWidget);
    await tapAndSettle(tester, find.byKey(const Key('newRequest')));
    expect(find.text('Buy equipment'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('requestTitle')), 'Lab beakers');
    await tapAndSettle(tester, find.byKey(const Key('sendRequest')));
    expect(find.text('Fill in Item'), findsOneWidget);
    expect(api.calls, isEmpty);
    await tester.enterText(find.byKey(const Key('field-item')), 'Beakers');
    await tapAndSettle(tester, find.byKey(const Key('sendRequest')));
    expect(api.calls.single, 'submitWorkflow purchase Lab beakers {"item":"Beakers"}');

    await tapAndSettle(tester, find.byKey(const Key('tabMyRequests')));
    expect(find.text('Lab beakers'), findsOneWidget);
  });

  testWidgets('substitutions: lists covered periods and opens attendance', (tester) async {
    phone(tester);
    api.substitutionList = const [
      SubstitutionInfo(
        id: 'sb1', slotId: 'slot9', date: '2026-10-05', startsAt: '10:00:00', endsAt: '10:50:00', sectionId: 'sec1', section: 'BCom Sem 3 A',
        subjectId: 'sub1', subject: 'Corporate Accounting', originalTeacher: 'Ravi Kumar', reason: 'On leave', room: 'Room 204',
      ),
    ];
    await tester.pumpWidget(localizedApp(home: SubstitutionsScreen(api: api)));
    await tester.pumpAndSettle();
    expect(find.text('Covering for Ravi Kumar'), findsOneWidget);
    expect(find.textContaining('10:00–10:50'), findsOneWidget);
    expect(find.text('Room 204'), findsOneWidget);
    await tapAndSettle(tester, find.byKey(const Key('attendance-sb1')));
    expect(find.byType(AttendanceScreen), findsOneWidget);
  });

  testWidgets('invigilation duties: lists by date', (tester) async {
    phone(tester);
    api.dutyList = const [
      InvigilationDuty(id: 'd1', session: 'Semester 3 exams', room: 'Hall A', dutyDate: '2026-10-20', startsAt: '09:30:00', endsAt: '12:30:00', role: 'invigilator'),
    ];
    await tester.pumpWidget(localizedApp(home: DutiesScreen(api: api)));
    await tester.pumpAndSettle();
    expect(find.text('Semester 3 exams'), findsOneWidget);
    expect(find.textContaining('09:30–12:30'), findsOneWidget);
    expect(find.textContaining('Hall A · Invigilator'), findsOneWidget);
  });

  testWidgets('evaluation: values a script, saves, checks the maximum and submits', (tester) async {
    phone(tester, size: const Size(412, 2400));
    api.evalList = const [EvalAllocation(id: 'al1', subject: 'Corporate Accounting', session: 'Semester 3', dummyNo: 'D-104', round: 2, status: 'pending')];
    api.evalScriptData = const EvalScript(
      id: 'al1', status: 'pending', dummyNo: 'D-104', pageCount: 2,
      questions: [EvalQuestion(id: 'q1', no: '1', maxMarks: 10), EvalQuestion(id: 'q2', no: '2', maxMarks: 5)],
      entries: [],
    );
    api.evalNeedsThird = true;
    await tester.pumpWidget(localizedApp(home: EvaluationScreen(api: api)));
    await tester.pumpAndSettle();
    expect(find.text('Corporate Accounting · Script D-104'), findsOneWidget);
    await tapAndSettle(tester, find.byKey(const Key('script-al1')));
    expect(find.text('Page 1 of 2'), findsOneWidget);
    expect(api.calls, contains('evaluationPage al1 0'));
    expect(find.text('Question 1 (out of 10)'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('marks-q1')), '12');
    await tapAndSettle(tester, find.byKey(const Key('saveMarks')));
    expect(find.textContaining('At most 10'), findsOneWidget);
    expect(api.calls.where((c) => c.startsWith('saveEvaluation')), isEmpty);

    await tester.enterText(find.byKey(const Key('marks-q1')), '7.5');
    await tester.enterText(find.byKey(const Key('comment-q1')), 'Good working');
    await tapAndSettle(tester, find.byKey(const Key('saveMarks')));
    expect(api.calls.last, 'saveEvaluation al1 q1=7.5/Good working');

    // Submitting needs every question marked.
    await tapAndSettle(tester, find.byKey(const Key('submitEval')));
    await tapAndSettle(tester, find.byKey(const Key('confirmSubmitEval')));
    expect(find.text('Enter marks for every question (0 where nothing was written).'), findsOneWidget);
    expect(api.calls.any((c) => c.startsWith('submitEvaluation')), isFalse);

    await tester.enterText(find.byKey(const Key('marks-q2')), '0');
    await tapAndSettle(tester, find.byKey(const Key('submitEval')));
    await tapAndSettle(tester, find.byKey(const Key('confirmSubmitEval')));
    expect(api.calls.last, 'submitEvaluation al1');
    expect(find.textContaining('Valuation submitted. Total 7.5.'), findsOneWidget);
    expect(find.textContaining('third valuation'), findsOneWidget);
  });

  testWidgets('mentoring: mentees with risk flags, logs a session, makes and closes a plan', (tester) async {
    phone(tester, size: const Size(412, 2400));
    api.menteeList = [mentee()];
    api.planList = [
      const InterventionPlan(id: 'ip0', studentId: 'st1', studentName: 'Aarav Patel', goal: 'Attend 75%', reviewOn: '2026-11-01', status: 'open', actions: [PlanAction('Call parent', false)]),
    ];
    await tester.pumpWidget(localizedApp(home: MentoringScreen(api: api)));
    await tester.pumpAndSettle();
    expect(find.textContaining('High risk · Attendance 62% · 2 failed tests · 1 overdue fees'), findsOneWidget);
    await tapAndSettle(tester, find.byKey(const Key('mentee-st1')));
    expect(find.byKey(const Key('noSessions')), findsOneWidget);
    expect(find.text('Attend 75%'), findsOneWidget);

    await tapAndSettle(tester, find.byKey(const Key('logSession')));
    await tapAndSettle(tester, find.byKey(const Key('saveSession')));
    expect(find.text('Fill in Summary'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('sessionSummary')), 'Discussed attendance');
    await tester.enterText(find.byKey(const Key('sessionNotes')), 'Family issue');
    await tapAndSettle(tester, find.byKey(const Key('saveSession')));
    expect(api.calls.last, 'logSession st1 in_person Discussed attendance Family issue -');
    expect(find.textContaining('Discussed attendance'), findsOneWidget);

    await tapAndSettle(tester, find.byKey(const Key('newPlan')));
    await tester.enterText(find.byKey(const Key('planGoal')), 'Pass costing');
    await tester.enterText(find.byKey(const Key('planActions')), 'Extra class\nWeekly quiz');
    await tapAndSettle(tester, find.byKey(const Key('savePlan')));
    expect(api.calls.last, 'createPlan st1 Pass costing Extra class|Weekly quiz');
    expect(find.text('Pass costing'), findsOneWidget);

    await tapAndSettle(tester, find.byKey(const Key('action-ip0-0')));
    expect(api.calls.last, 'updatePlan ip0 x');
    await tapAndSettle(tester, find.byKey(const Key('closePlan-ip0')));
    await tester.enterText(find.byKey(const Key('planOutcome')), 'Attendance now 80%');
    await tapAndSettle(tester, find.byKey(const Key('rating-improved')));
    await tapAndSettle(tester, find.byKey(const Key('confirmClosePlan')));
    expect(api.calls.last, 'closePlan ip0 improved Attendance now 80%');
    expect(find.text('Closed'), findsOneWidget);
  });

  testWidgets('course rosters: my offerings of a term, then the registered and waitlisted', (tester) async {
    phone(tester);
    api.termList = const [TermInfo(id: 'tm1', name: 'Semester 3')];
    api.offeringList = const [
      OfferingInfo(id: 'of1', subjectCode: 'BCOM-3.1', subjectName: 'Corporate Accounting', facultyId: 'u1', registered: 40, waitlisted: 2),
      OfferingInfo(id: 'of2', subjectCode: 'BCOM-3.2', subjectName: 'Taxation', facultyId: 'other', registered: 30, waitlisted: 0),
    ];
    api.rosterList = const [
      RosterEntry(studentId: 'st1', fullName: 'Aarav Patel', rollNo: 'U03BC001', status: 'registered'),
      RosterEntry(studentId: 'st2', fullName: 'Ananya Gowda', rollNo: 'U03BC002', status: 'waitlisted', waitlistPos: 1),
    ];
    await tester.pumpWidget(localizedApp(home: CourseRosterScreen(api: api, userId: 'u1')));
    await tester.pumpAndSettle();
    expect(find.text('BCOM-3.1 · Corporate Accounting'), findsOneWidget);
    expect(find.text('BCOM-3.2 · Taxation'), findsNothing);
    expect(find.text('40 registered, 2 on the waitlist'), findsOneWidget);
    await tapAndSettle(tester, find.byKey(const Key('offering-of1')));
    expect(api.calls.single, 'offeringRoster of1');
    expect(find.text('Aarav Patel'), findsOneWidget);
    expect(find.text('Waitlist 1'), findsOneWidget);
  });

  testWidgets('surveys: answers rating, choice and text, then it shows as answered', (tester) async {
    phone(tester, size: const Size(412, 2400));
    api.surveyList = const [
      SurveyInfo(
        id: 'sv1', title: 'Staff feedback', description: 'Tell us how the term went', anonymous: true, answered: false,
        questions: [
          SurveyQuestion(id: 'a', kind: 'rating', prompt: 'Rate the timetable', options: [], required: true),
          SurveyQuestion(id: 'b', kind: 'single', prompt: 'Best day', options: ['Mon', 'Tue'], required: true),
          SurveyQuestion(id: 'c', kind: 'text', prompt: 'Anything else', options: [], required: false),
        ],
      ),
    ];
    await tester.pumpWidget(localizedApp(home: SurveysScreen(api: api)));
    await tester.pumpAndSettle();
    expect(find.text('Anonymous'), findsOneWidget);
    await tapAndSettle(tester, find.byKey(const Key('survey-sv1')));
    await tapAndSettle(tester, find.byKey(const Key('sendSurvey')));
    expect(find.text('Answer every required question.'), findsOneWidget);
    await tapAndSettle(tester, find.byKey(const Key('rate-a-4')));
    await tapAndSettle(tester, find.byKey(const Key('option-b-Tue')));
    await tester.enterText(find.byKey(const Key('answer-c')), 'Fine');
    await tapAndSettle(tester, find.byKey(const Key('sendSurvey')));
    expect(api.calls.single, 'submitSurvey sv1 [{"questionId":"a","rating":4},{"questionId":"b","choices":["Tue"]},{"questionId":"c","text":"Fine"}]');
    expect(find.text('Answered · Anonymous'), findsOneWidget);
  });

  testWidgets('clubs: only those I coordinate, with members and points', (tester) async {
    phone(tester, size: const Size(412, 2400));
    api.clubList = const [
      ClubInfo(id: 'c1', name: 'Robotics', category: 'technical', members: 12, pending: 3, coordinatorId: 'u1'),
      ClubInfo(id: 'c2', name: 'Drama', category: 'cultural', members: 8, pending: 0, coordinatorId: 'x'),
    ];
    api.clubMemberList = const [ClubMember(studentId: 'st1', fullName: 'Aarav Patel', rollNo: 'U03BC001', status: 'active', points: 40)];
    await tester.pumpWidget(localizedApp(home: ClubsScreen(api: api, userId: 'u1')));
    await tester.pumpAndSettle();
    expect(find.text('Robotics'), findsOneWidget);
    expect(find.text('Drama'), findsNothing);
    expect(find.text('12 members · 3 requests waiting'), findsOneWidget);
    await tapAndSettle(tester, find.byKey(const Key('club-c1')));
    expect(find.text('40 points'), findsOneWidget);
  });
}
