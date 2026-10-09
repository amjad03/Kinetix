import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/painting.dart';
import 'package:http/http.dart' as http;
import 'package:kinetix_lesson/kinetix_lesson.dart';

import 'course_file_models.dart';
import 'academics_models.dart';
import 'growth_models.dart';
import 'hr_models.dart';
import 'insights_models.dart';
import 'models.dart';
import 'work_models.dart';

/// Where an [ApiException] came from; the UI turns it into words with AppLocalizations.errorText.
enum ApiErrorKind {
  /// The server could not be reached.
  offline,
  timeout,

  /// Signed in, but the account has no teaching role.
  notTeacher,

  /// The server explained the problem in [ApiException.message] (in English).
  server,

  /// The server gave only an HTTP status.
  http,
}

class ApiException implements Exception {
  ApiException(this.status, this.message, {this.kind = ApiErrorKind.server, this.code});

  /// HTTP status, or 0 when the server could not be reached.
  final int status;

  /// English, for logs; show AppLocalizations.errorText instead.
  final String message;
  final ApiErrorKind kind;

  /// The server's stable error code (services/api/src/common/error-codes.ts), such as
  /// `NOT_YOUR_CLASS` or `NOT_FOUND`. Null from older servers and for network failures.
  final String? code;

  @override
  String toString() => message;
}

/// Everything the Teacher App asks of the KINETIX Cloud API. Tests use a fake.
abstract class TeacherApi {
  String get baseUrl;
  set baseUrl(String value);

  /// User access token after sign-in.
  String? get token;
  set token(String? value);

  /// Signs in and stores the token on this client.
  Future<void> login({required String tenant, required String login, required String password});
  /// Texts a 6-digit sign-in code to [phone] (E.164). The server answers the same whether or not
  /// the number has an account. Throws `RATE_LIMITED` (429) when asked too often.
  Future<OtpChallenge> requestOtp({required String tenant, required String phone});

  /// Signs in with the texted code and stores the token on this client. Throws `OTP_INVALID` (401).
  Future<void> verifyOtp({required String tenant, required String phone, required String code});
  Future<Me> me();

  /// Registers this phone's push token for the signed-in teacher (POST /v1/push/devices).
  Future<void> registerPushDevice({required String token, required String platform});

  /// Stops pushes to this phone's token (DELETE /v1/push/devices).
  Future<void> unregisterPushDevice(String token);

  /// The teacher's latest notifications, newest first.
  Future<List<AppNotification>> notifications();

  Future<void> markNotificationRead(String id);


  /// Staff leave, check-in and payslips (docs/architecture/hr-payroll.md).
  Future<List<LeaveTypeInfo>> leaveTypes();
  Future<List<LeaveBalanceInfo>> leaveBalances();
  Future<List<LeaveRequestInfo>> myLeaveRequests();

  /// Requests waiting for this person to decide (heads of department, HR, principal).
  Future<List<LeaveRequestInfo>> pendingLeaveRequests();
  Future<LeaveRequestInfo> applyLeave({required String leaveTypeId, required String fromDate, required String toDate, required bool halfDay, required String reason});
  Future<LeaveRequestInfo> cancelLeave(String id);
  Future<LeaveRequestInfo> decideLeave(String id, {required bool approve, String? note});
  Future<MyAttendance> myAttendance({String? month});
  Future<AttendanceDayInfo> checkIn();
  Future<AttendanceDayInfo> checkOut();
  Future<List<PayslipInfo>> myPayslips();
  Future<Uint8List> payslipPdf(String id);
  Future<List<CourseFileOption>> courseFileOptions();
  Future<List<CourseFileVersion>> courseFiles();
  Future<CourseFileVersion> buildCourseFile(String sectionId, String subjectId);
  Future<Uint8List> courseFilePdf(String id);

  // --- Work: tasks, requests, duties, evaluation, mentoring, rosters, surveys, clubs -------------

  /// Tasks given to me (`active` hides finished ones) and tasks I asked others to do.
  Future<List<TaskInfo>> myTasks({bool all = false});
  Future<List<TaskInfo>> tasksAssignedByMe({bool all = false});

  /// Moves a task along (POST /v1/tasks/:id/status); [version] guards against a stale screen.
  Future<void> setTaskStatus(String id, TaskStatus status, {int? version});

  /// Workflow: the routes I can start, requests waiting for me, my own requests and one request with its timeline.
  Future<List<WorkflowDefinition>> workflowDefinitions();
  Future<List<WorkflowRequestInfo>> workflowInbox();
  Future<List<WorkflowRequestInfo>> myWorkflowRequests();
  Future<WorkflowRequestInfo> workflowRequest(String id);
  Future<void> submitWorkflowRequest({required String requestType, required String title, required Map<String, dynamic> payload, double? amount});

  /// [decision] is approve, reject or return.
  Future<void> decideWorkflowRequest(String id, {required String decision, String comment = '', int? version});
  Future<void> cancelWorkflowRequest(String id);

  /// Periods I cover for colleagues (today and the next two weeks).
  Future<List<SubstitutionInfo>> mySubstitutions();

  /// My exam invigilation duties.
  Future<List<InvigilationDuty>> myInvigilation();

  /// On-screen evaluation: scripts allocated to me, one script, a scanned page, saving per-question marks and submitting.
  Future<List<EvalAllocation>> evaluationAllocations();
  Future<EvalScript> evaluationScript(String id);
  Future<Uint8List> evaluationPage(String id, int index);
  Future<List<EvalEntry>> saveEvaluationMarks(String id, List<EvalEntry> entries);

  /// Locks the valuation; `needsThird` is true when a second valuation differs too much from the first.
  Future<({double total, bool needsThird})> submitEvaluation(String id);

  /// Ticks, crosses and comments on a script's pages: mine, plus read-only marks of earlier rounds for a third valuer.
  Future<({List<EvalAnnotation> mine, List<EvalAnnotation> earlier})> evaluationAnnotations(String id);
  Future<EvalAnnotation> addEvaluationAnnotation(String id, {required int pageIndex, required String kind, required double x, required double y, String? text});
  Future<void> deleteEvaluationAnnotation(String id, String annotationId);

  /// Self-appraisal: the form's categories, the cycles, my form for a cycle (null until started) and saving or submitting it.
  Future<List<AppraisalCategory>> appraisalCategories();
  Future<List<AppraisalCycle>> appraisalCycles();
  Future<MyAppraisal?> myAppraisal(String cycleId);
  Future<MyAppraisal> saveSelfAppraisal(String cycleId, Map<String, ({double score, String evidence})> scores, {required bool submit});

  /// Houses ranked by points, one house with its members, and awarding (or deducting) points.
  Future<List<HouseRow>> houses();
  Future<List<HouseMember>> houseMembers(String houseId);
  Future<void> awardHousePoints(String houseId, {required int points, required String reason, required String category, String? studentId});

  /// The curriculum versions and one version's subjects with units and course outcomes.
  Future<List<CurriculumVersionRow>> curriculumVersions();
  Future<CurriculumDetail> curriculumVersion(String id);

  /// Mentoring: my mentees with risk flags, a mentee's sessions and plans, logging a session, intervention plans.
  Future<List<MenteeInfo>> myMentees();
  Future<List<MentoringSession>> mentoringSessions(String studentId);
  Future<void> logMentoringSession({required String studentId, required String heldOn, required String mode, required String summary, String? privateNotes, String? followUpOn});
  Future<List<InterventionPlan>> interventionPlans({String? studentId});
  Future<void> createInterventionPlan({required String studentId, required String goal, required List<String> actions, required String reviewOn});
  Future<void> updateInterventionPlan(String id, List<PlanAction> actions);
  Future<void> closeInterventionPlan(String id, {required String outcome, required String rating});

  /// Course registration rosters for the offerings I teach (the term and offering lists need a head-of-department role).
  Future<List<TermInfo>> courseTerms();
  Future<List<OfferingInfo>> courseOfferings(String termId);
  Future<List<RosterEntry>> offeringRoster(String offeringId);

  /// Open surveys addressed to me, and sending my answers.
  Future<List<SurveyInfo>> mySurveys();
  Future<void> submitSurvey(String id, List<SurveyAnswer> answers);

  /// Clubs (the staff list; the screen keeps those I coordinate) and a club's members.
  Future<List<ClubInfo>> clubs();
  Future<List<ClubMember>> clubMembers(String clubId);

  // --- Outcome-based education, research, project mentoring ---------------------------------------

  /// A subject's course-outcome versions, the CO x PO/PSO matrix of one version, the academic year to read attainment for
  /// (null when the school has no terms) and a programme's attainment per course outcome (heads of department and the quality office).
  Future<List<CoSet>> coSets(String subjectId);
  Future<CoMatrix> coMatrix(String coSetId);
  Future<String?> currentAcademicYearId();
  Future<List<CoAttainment>> coAttainment({required String programId, required String academicYearId});

  /// Research (faculty): projects, scholars I supervise, theses, publications and datasets.
  Future<List<ResearchProject>> researchProjects();
  Future<List<Scholar>> researchScholars();
  Future<List<ThesisRow>> researchTheses();
  Future<ThesisDetail> researchThesis(String id);

  /// Moves a thesis along (draft -> submitted for a supervisor).
  Future<void> moveThesisStage(String id, {required String to, String note = ''});

  /// Opens the thesis record of a scholar I supervise.
  Future<void> openThesis(String scholarId, {required String title, String abstract = ''});
  Future<List<Publication>> researchPublications({String? ownerUserId});
  Future<Publication> importPublicationDoi(String doi);
  Future<List<ResearchDataset>> researchDatasets();

  /// Project mentoring: my projects, a workspace, the discussion, rubric reviews, viva, showcase and recruiting hub, join requests and skill matches.
  Future<List<MyProject>> myProjects();
  Future<ProjectWorkspace> projectWorkspace(String id);
  Future<List<ProjectComment>> projectComments(String id);
  Future<void> addProjectComment(String id, {required String body, String? parentId});
  Future<List<ProjectReview>> projectReviews(String id);
  Future<void> addProjectReview(String id, {required Map<String, double> rubric, required int maxPerCriterion, String comment = ''});
  Future<void> scheduleProjectViva(String id, {required DateTime scheduledAt, required String venue, required List<String> panel});

  /// [outcome] is pass, revise or fail.
  Future<void> recordProjectViva(String vivaId, {required String outcome, double? score, String remarks = ''});
  Future<void> setProjectHub(String id, ProjectHub hub);
  Future<List<JoinRequest>> projectJoinRequests(String id);
  Future<void> decideJoinRequest(String requestId, {required bool accept});
  Future<List<ProjectMatch>> projectMatches(String id);
  Future<void> addProjectLink(String id, {required String title, required String url});

  /// Saves the teacher's language on the server (notifications and pushes use it).
  Future<Me> updatePreferredLanguage(String language);
  Future<DayTimetable> timetable({String? date});
  Future<List<TeacherClass>> classes();
  Future<List<Student>> roster(String sectionId);

  /// A class at a glance: attendance %, average mark % and risk flag per student (`GET /v1/mentoring/sections/:id/insights`).
  Future<SectionInsights> sectionInsights(String sectionId);

  /// Asks KINETIX AI for a draft (`POST /v1/ai/<task>`): [input] is the topic or question, [count] the questions
  /// for a quiz or homework, [minutes] the length of a lesson plan. The result is a draft for the teacher to check.
  Future<AiDraft> aiDraft(AiTask task, {required String input, int? count, int? minutes, String language = 'en', String? sectionId, String? subjectId});

  /// The class's answer cards (card number per student, by roll number), to print.
  Future<List<AnswerCard>> answerCards(String sectionId);
  Future<AttendanceSheet> attendance({required String slotId, required String date});
  Future<AttendanceSheet> submitAttendance({required String slotId, required String date, required Map<String, AttendanceStatus> marks});
  Future<BoardConnection?> activeSession();

  /// Claims a board's pairing code: [code] is the typed 6 digits, [qr] the scanned payload.
  Future<BoardConnection> claimBoard({String? code, String? qr});
  Future<void> endSession(String sessionId);
  Future<List<Homework>> myHomework();
  Future<Homework> createHomework({
    required String sectionId,
    required String subjectId,
    required String title,
    required String instructions,
    required String dueOn,
  });

  /// The lessons this teacher recorded on a board, newest first.
  Future<List<RecordingInfo>> myRecordings();

  /// One recording with its transcript and summary.
  Future<RecordingInfo> recording(String id);

  /// The recording's board events, for [LessonPlayer].
  Future<Lesson> recordingLesson(String id);

  /// Shares a finished recording with its class (families of absent students are notified).
  Future<RecordingInfo> shareRecording(String id);

  /// Keeps a recording past the end of its term ([keep]), or lets it be deleted with the term
  /// again. Returns the recording with its new `keep` and `expiresOn`.
  Future<RecordingInfo> keepRecording(String id, {required bool keep});

  /// A class's tests and assignments, latest first (no marks or stats).
  Future<List<Assessment>> assessments(String sectionId);

  /// One assessment with the class roster, saved marks and stats.
  Future<Assessment> assessment(String id);
  Future<Assessment> createAssessment({
    required String sectionId,
    required String subjectId,
    required String title,
    required AssessmentKind kind,
    required double maxMarks,
    required String heldOn,
  });

  /// Saves (or corrects) marks. Returns the assessment with fresh stats.
  Future<Assessment> saveMarks(String assessmentId, List<MarkInput> entries);

  /// Publishes to students and families (who are notified).
  Future<Assessment> publishAssessment(String id);

  /// The teacher's message threads, latest first.
  Future<List<Conversation>> conversations();

  /// Up to [ChatPage.pageSize] messages, oldest first; [before] pages back.
  Future<ChatPage> conversationMessages(String id, {DateTime? before});
  Future<ChatMessage> sendMessage(String conversationId, String body);
  Future<void> markConversationRead(String id);

  /// Students (with their guardians) in the classes this teacher teaches, or in one class.
  Future<List<StudentContacts>> familyContacts({String? sectionId});

  /// Opens (or returns) the thread with [guardianId] about [studentId].
  Future<Conversation> startConversation({required String studentId, required String guardianId});

  /// Holidays, exams and events from [from] (default: today) to [to] (default: 90 days on).
  Future<List<CalendarEvent>> calendar({String? from, String? to});

  /// Driver mode: the driver's routes with stops, and the trip under way (`GET /v1/transport/me`).
  Future<DriverHome> driverHome();

  /// Starts a trip on [routeId]; any trip of this driver already running is ended.
  Future<DriverTrip> startTrip({required String routeId, required TripDirection direction});

  /// Reports where the bus is (`POST /v1/transport/trips/:id/position`). 409 when the trip has ended.
  Future<void> sendPosition(String tripId, {required double lat, required double lng, double? speedKmh});

  Future<void> endTrip(String tripId);

  /// A subject's syllabus outline, or null when the subject is not linked to a course yet.
  Future<Syllabus?> syllabus(String subjectId);

  /// Which topics of [subjectId]'s syllabus a class has been taught.
  Future<Coverage> coverage({required String sectionId, required String subjectId});

  /// Marks a topic as taught on [coveredOn] (default: today); marking again changes the date.
  Future<void> markTopic({required String sectionId, required String subjectId, required String topicId, String? coveredOn});

  /// Undoes [markTopic].
  Future<void> unmarkTopic({required String sectionId, required String subjectId, required String topicId});

  /// The videos this teacher added to a topic for their classes.
  Future<List<TopicVideo>> topicVideos(String topicId);

  /// Adds a YouTube video to a topic for [sectionId]'s class; the server takes the title from YouTube (oEmbed).
  Future<TopicVideo> addTopicVideo({required String topicId, required String url, required String sectionId});

  /// Asks the principal to show the video to the whole institution.
  Future<TopicVideo> shareTopicVideo(String videoId);

  Future<void> removeTopicVideo(String videoId);

  /// The class list for a homework, with what each student handed in and the counts.
  Future<SubmissionList> submissions(String homeworkId);

  /// A class's year plan for a subject, or null when none has been made.
  Future<YearPlan?> yearPlan({required String sectionId, required String subjectId});

  /// Makes (or remakes, replacing the weeks) the year plan from the timetable and calendar.
  Future<YearPlan> generateYearPlan({required String sectionId, required String subjectId, String? startsOn, String? endsOn});

  /// Moves a topic to another week (snapped to its Monday) and/or changes its periods.
  Future<YearPlan> moveYearPlanItem(String planId, {required String topicId, required String weekOf, required int periods});

  /// The lesson plan for a period on [date], or the suggested topics when none is saved.
  Future<PeriodPlan> periodPlan({required String slotId, required String date});

  /// Saves the plan for a period (an edit clears the head's review).
  Future<PeriodPlan> saveLessonPlan({
    required String slotId,
    required String date,
    required List<String> topicIds,
    required LessonContent content,
    required bool aiDrafted,
  });

  /// A first draft from KINETIX AI (not saved).
  Future<LessonDraft> draftLessonPlan({required String slotId, required String date, List<String>? topicIds, String? language});

  /// A photo or PDF from a submission.
  Future<Uint8List> submissionFile(String homeworkId, String studentId, int index);

  /// Checks the work, or returns it to be redone (the student and family are told).
  Future<Submission> reviewSubmission(String homeworkId, Submission submission, {required SubmissionStatus status, String? remark});

  /// Notifies the students who have not handed in, and their families. Returns how many.
  Future<int> remindMissing(String homeworkId);

  /// Edits the profile (the phone number is the sign-in: only the office changes it).
  Future<Me> updateProfile({required String fullName, required String? email, List<String>? teachingSubjects});

  /// Replaces the profile photo with [jpeg] (already square and compressed).
  Future<Me> uploadPhoto(Uint8List jpeg);
  Future<Me> removePhoto();

  /// A user's photo from its API [path] (`photoUrl`), loaded with the token; null for none.
  ImageProvider? photo(String? path);

  /// Awards a badge (KxBadge.api) to a student of a class the teacher teaches; the family is told.
  Future<void> awardBadge({required String studentId, required String sectionId, required String badge, String? subjectId});
}

/// Lets the lesson player load recordings through a [TeacherApi].
class TeacherLessonSource implements LessonSource {
  TeacherLessonSource(this.api, {required this.notAvailable, required this.describe});

  final TeacherApi api;

  /// Shown by the player when the recording is not there yet (404).
  final String notAvailable;

  /// Turns any other failure into words.
  final String Function(ApiException) describe;

  Future<T> _guard<T>(Future<T> Function() f) async {
    try {
      return await f();
    } on ApiException catch (e) {
      throw LessonLoadException(e.status == 404 ? notAvailable : describe(e));
    }
  }

  @override
  Future<RecordingInfo> recording(String id) => _guard(() => api.recording(id));

  @override
  Future<Lesson> lesson(String id) => _guard(() => api.recordingLesson(id));

  @override
  LessonAudioLocation? audio(String id) => LessonAudioLocation(
    Uri.parse('${api.baseUrl}/v1/recordings/$id/audio'),
    headers: {if (api.token != null) 'authorization': 'Bearer ${api.token}'},
  );
}

class HttpTeacherApi implements TeacherApi {
  HttpTeacherApi({required this.baseUrl, http.Client? client}) : _http = client ?? http.Client();

  @override
  String baseUrl;
  @override
  String? token;
  final http.Client _http;

  /// Called when the server rejects the token (expired or revoked), so the app can sign out.
  void Function()? onUnauthorized;

  @override
  Future<void> login({required String tenant, required String login, required String password}) async {
    final j = await _send('POST', '/v1/auth/login', body: {'tenant': tenant, 'login': login, 'password': password}, auth: false);
    token = j['accessToken'] as String;
  }

  @override
  Future<OtpChallenge> requestOtp({required String tenant, required String phone}) async => OtpChallenge.fromJson(
    await _send('POST', '/v1/auth/otp/request', body: {'tenant': tenant, 'phone': phone}, auth: false) as Map<String, dynamic>,
  );

  @override
  Future<void> verifyOtp({required String tenant, required String phone, required String code}) async {
    final j = await _send('POST', '/v1/auth/otp/verify', body: {'tenant': tenant, 'phone': phone, 'code': code}, auth: false);
    token = j['accessToken'] as String;
  }

  @override
  Future<void> registerPushDevice({required String token, required String platform}) async =>
      _send('POST', '/v1/push/devices', body: {'token': token, 'platform': platform, 'app': 'teacher'});

  @override
  Future<void> unregisterPushDevice(String token) async => _send('DELETE', '/v1/push/devices', body: {'token': token});

  @override
  Future<List<AppNotification>> notifications() async {
    final j = await _send('GET', '/v1/notifications?limit=100') as Map;
    return (j['items'] as List).map((e) => AppNotification.fromJson(e as Map<String, dynamic>)).toList();
  }

  @override
  Future<void> markNotificationRead(String id) async => _send('POST', '/v1/notifications/$id/read');

  @override
  Future<Me> me() async => Me.fromJson(await _send('GET', '/v1/me'));

  @override
  Future<List<LeaveTypeInfo>> leaveTypes() async =>
      [for (final e in await _send('GET', '/v1/hr/leave-types') as List) LeaveTypeInfo.fromJson(e as Map<String, dynamic>)];

  @override
  Future<List<LeaveBalanceInfo>> leaveBalances() async =>
      [for (final e in await _send('GET', '/v1/hr/leave/balances/me') as List) LeaveBalanceInfo.fromJson(e as Map<String, dynamic>)];

  @override
  Future<List<LeaveRequestInfo>> myLeaveRequests() async =>
      [for (final e in await _send('GET', '/v1/hr/leave/requests/me') as List) LeaveRequestInfo.fromJson(e as Map<String, dynamic>)];

  @override
  Future<List<LeaveRequestInfo>> pendingLeaveRequests() async =>
      [for (final e in await _send('GET', '/v1/hr/leave/requests?status=pending') as List) LeaveRequestInfo.fromJson(e as Map<String, dynamic>)];

  @override
  Future<LeaveRequestInfo> applyLeave({required String leaveTypeId, required String fromDate, required String toDate, required bool halfDay, required String reason}) async =>
      LeaveRequestInfo.fromJson(await _send('POST', '/v1/hr/leave/requests', body: {'leaveTypeId': leaveTypeId, 'fromDate': fromDate, 'toDate': toDate, 'halfDay': halfDay, 'reason': reason}));

  @override
  Future<LeaveRequestInfo> cancelLeave(String id) async => LeaveRequestInfo.fromJson(await _send('POST', '/v1/hr/leave/requests/$id/cancel'));

  @override
  Future<LeaveRequestInfo> decideLeave(String id, {required bool approve, String? note}) async =>
      LeaveRequestInfo.fromJson(await _send('POST', '/v1/hr/leave/requests/$id/${approve ? 'approve' : 'reject'}', body: {'note': ?note}));

  @override
  Future<MyAttendance> myAttendance({String? month}) async =>
      MyAttendance.fromJson(await _send('GET', '/v1/hr/attendance/me${month == null ? '' : '?month=$month'}') as Map<String, dynamic>);

  @override
  Future<AttendanceDayInfo> checkIn() async => AttendanceDayInfo.fromJson(await _send('POST', '/v1/hr/attendance/check-in'));

  @override
  Future<AttendanceDayInfo> checkOut() async => AttendanceDayInfo.fromJson(await _send('POST', '/v1/hr/attendance/check-out'));

  @override
  Future<List<PayslipInfo>> myPayslips() async =>
      [for (final e in await _send('GET', '/v1/payroll/payslips/me') as List) PayslipInfo.fromJson(e as Map<String, dynamic>)];

  @override
  Future<Uint8List> payslipPdf(String id) async => (await _request('GET', '/v1/payroll/payslips/$id/pdf', timeout: const Duration(seconds: 60))).bodyBytes;

  @override
  Future<List<CourseFileOption>> courseFileOptions() async =>
      [for (final e in await _send('GET', '/v1/course-files/options') as List) CourseFileOption.fromJson(e as Map<String, dynamic>)];

  @override
  Future<List<CourseFileVersion>> courseFiles() async =>
      [for (final e in await _send('GET', '/v1/course-files') as List) CourseFileVersion.fromJson(e as Map<String, dynamic>)];

  @override
  Future<CourseFileVersion> buildCourseFile(String sectionId, String subjectId) async =>
      CourseFileVersion.fromJson(await _send('POST', '/v1/course-files', body: {'sectionId': sectionId, 'subjectId': subjectId}, timeout: const Duration(seconds: 60)) as Map<String, dynamic>);

  @override
  Future<Uint8List> courseFilePdf(String id) async => (await _request('GET', '/v1/course-files/$id/download', timeout: const Duration(seconds: 60))).bodyBytes;

  // --- Work ---------------------------------------------------------------------------------

  List<T> _rows<T>(Object? j, T Function(Map<String, dynamic>) f) => [for (final e in j as List) f(e as Map<String, dynamic>)];

  @override
  Future<List<TaskInfo>> myTasks({bool all = false}) async => _rows(await _send('GET', '/v1/tasks/mine?status=${all ? 'all' : 'active'}'), TaskInfo.fromJson);

  @override
  Future<List<TaskInfo>> tasksAssignedByMe({bool all = false}) async =>
      _rows(await _send('GET', '/v1/tasks/assigned-by-me?status=${all ? 'all' : 'active'}'), TaskInfo.fromJson);

  @override
  Future<void> setTaskStatus(String id, TaskStatus status, {int? version}) async =>
      _send('POST', '/v1/tasks/$id/status', body: {'status': taskStatusCode(status), 'expectedVersion': ?version});

  @override
  Future<List<WorkflowDefinition>> workflowDefinitions() async => _rows(await _send('GET', '/v1/workflows/definitions'), WorkflowDefinition.fromJson);

  @override
  Future<List<WorkflowRequestInfo>> workflowInbox() async => _rows(await _send('GET', '/v1/workflows/requests/inbox'), WorkflowRequestInfo.fromJson);

  @override
  Future<List<WorkflowRequestInfo>> myWorkflowRequests() async => _rows(await _send('GET', '/v1/workflows/requests/mine'), WorkflowRequestInfo.fromJson);

  @override
  Future<WorkflowRequestInfo> workflowRequest(String id) async => WorkflowRequestInfo.fromJson(await _send('GET', '/v1/workflows/requests/$id') as Map<String, dynamic>);

  @override
  Future<void> submitWorkflowRequest({required String requestType, required String title, required Map<String, dynamic> payload, double? amount}) async =>
      _send('POST', '/v1/workflows/requests', body: {'requestType': requestType, 'title': title, 'payload': payload, 'amount': ?amount});

  @override
  Future<void> decideWorkflowRequest(String id, {required String decision, String comment = '', int? version}) async =>
      _send('POST', '/v1/workflows/requests/$id/decide', body: {'decision': decision, 'comment': comment, 'expectedVersion': ?version});

  @override
  Future<void> cancelWorkflowRequest(String id) async => _send('POST', '/v1/workflows/requests/$id/cancel', body: {'comment': ''});

  @override
  Future<List<SubstitutionInfo>> mySubstitutions() async => _rows(await _send('GET', '/v1/timetable/me/substitutions'), SubstitutionInfo.fromJson);

  @override
  Future<List<InvigilationDuty>> myInvigilation() async => _rows(await _send('GET', '/v1/invigilation/mine'), InvigilationDuty.fromJson);

  @override
  Future<List<EvalAllocation>> evaluationAllocations() async => _rows(await _send('GET', '/v1/evaluation/allocations/mine'), EvalAllocation.fromJson);

  @override
  Future<EvalScript> evaluationScript(String id) async => EvalScript.fromJson(await _send('GET', '/v1/evaluation/allocations/$id') as Map<String, dynamic>);

  @override
  Future<Uint8List> evaluationPage(String id, int index) async =>
      (await _request('GET', '/v1/evaluation/allocations/$id/pages/$index', timeout: const Duration(seconds: 60))).bodyBytes;

  @override
  Future<List<EvalEntry>> saveEvaluationMarks(String id, List<EvalEntry> entries) async {
    final j = await _send('PUT', '/v1/evaluation/allocations/$id/marks', body: {
      'entries': [for (final e in entries) {'questionId': e.questionId, 'marks': e.marks, if (e.comment != null && e.comment!.isNotEmpty) 'comment': e.comment}],
    }) as Map<String, dynamic>;
    return EvalScript.fromJson({'id': id, 'entries': j['entries']}).entries;
  }

  @override
  Future<({double total, bool needsThird})> submitEvaluation(String id) async {
    final j = await _send('POST', '/v1/evaluation/allocations/$id/submit') as Map<String, dynamic>;
    return (total: (j['total'] as num).toDouble(), needsThird: j['needsThird'] == true);
  }

  @override
  Future<({List<EvalAnnotation> mine, List<EvalAnnotation> earlier})> evaluationAnnotations(String id) async {
    final j = await _send('GET', '/v1/evaluation/allocations/$id/annotations') as Map<String, dynamic>;
    return (
      mine: _rows(j['mine'], EvalAnnotation.fromJson),
      earlier: _rows(j['earlier'], (e) => EvalAnnotation.fromJson(e, earlier: true)),
    );
  }

  @override
  Future<EvalAnnotation> addEvaluationAnnotation(String id, {required int pageIndex, required String kind, required double x, required double y, String? text}) async =>
      EvalAnnotation.fromJson(await _send('POST', '/v1/evaluation/allocations/$id/annotations', body: {'pageIndex': pageIndex, 'kind': kind, 'x': x, 'y': y, 'text': ?text}) as Map<String, dynamic>);

  @override
  Future<void> deleteEvaluationAnnotation(String id, String annotationId) async => _send('DELETE', '/v1/evaluation/allocations/$id/annotations/$annotationId');

  @override
  Future<List<AppraisalCategory>> appraisalCategories() async => _rows((await _send('GET', '/v1/hr/appraisal-categories') as Map)['categories'], AppraisalCategory.fromJson);

  @override
  Future<List<AppraisalCycle>> appraisalCycles() async => _rows(await _send('GET', '/v1/hr/appraisal-cycles'), AppraisalCycle.fromJson);

  @override
  Future<MyAppraisal?> myAppraisal(String cycleId) async {
    final j = await _send('GET', '/v1/hr/appraisals/me?cycleId=$cycleId');
    return j == null ? null : MyAppraisal.fromJson(j as Map<String, dynamic>);
  }

  @override
  Future<MyAppraisal> saveSelfAppraisal(String cycleId, Map<String, ({double score, String evidence})> scores, {required bool submit}) async => MyAppraisal.fromJson(
    await _send('PUT', '/v1/hr/appraisals/me', body: {
      'cycleId': cycleId,
      'submit': submit,
      'scores': {for (final e in scores.entries) e.key: {'score': e.value.score, if (e.value.evidence.isNotEmpty) 'evidence': e.value.evidence}},
    }) as Map<String, dynamic>,
  );

  @override
  Future<List<HouseRow>> houses() async => _rows(await _send('GET', '/v1/houses/leaderboard'), HouseRow.fromJson);

  @override
  Future<List<HouseMember>> houseMembers(String houseId) async => _rows((await _send('GET', '/v1/houses/$houseId') as Map)['members'], HouseMember.fromJson);

  @override
  Future<void> awardHousePoints(String houseId, {required int points, required String reason, required String category, String? studentId}) async =>
      _send('POST', '/v1/houses/$houseId/points', body: {'points': points, 'reason': reason, 'category': category, 'studentId': ?studentId});

  @override
  Future<List<CurriculumVersionRow>> curriculumVersions() async => _rows(await _send('GET', '/v1/curriculum/versions'), CurriculumVersionRow.fromJson);

  @override
  Future<CurriculumDetail> curriculumVersion(String id) async => CurriculumDetail.fromJson(await _send('GET', '/v1/curriculum/versions/$id') as Map<String, dynamic>);

  @override
  Future<List<MenteeInfo>> myMentees() async => _rows(await _send('GET', '/v1/mentoring/risk?all=true'), MenteeInfo.fromJson);

  @override
  Future<List<MentoringSession>> mentoringSessions(String studentId) async =>
      _rows(await _send('GET', '/v1/mentoring/sessions?studentId=$studentId'), MentoringSession.fromJson);

  @override
  Future<void> logMentoringSession({required String studentId, required String heldOn, required String mode, required String summary, String? privateNotes, String? followUpOn}) async =>
      _send('POST', '/v1/mentoring/sessions', body: {'studentId': studentId, 'heldOn': heldOn, 'mode': mode, 'summary': summary, 'privateNotes': ?privateNotes, 'followUpOn': ?followUpOn});

  @override
  Future<List<InterventionPlan>> interventionPlans({String? studentId}) async =>
      _rows(await _send('GET', '/v1/mentoring/plans${studentId == null ? '' : '?studentId=$studentId'}'), InterventionPlan.fromJson);

  @override
  Future<void> createInterventionPlan({required String studentId, required String goal, required List<String> actions, required String reviewOn}) async =>
      _send('POST', '/v1/mentoring/plans', body: {'studentId': studentId, 'goal': goal, 'actions': actions, 'reviewOn': reviewOn});

  @override
  Future<void> updateInterventionPlan(String id, List<PlanAction> actions) async =>
      _send('PUT', '/v1/mentoring/plans/$id', body: {'actions': [for (final a in actions) {'text': a.text, 'done': a.done}]});

  @override
  Future<void> closeInterventionPlan(String id, {required String outcome, required String rating}) async =>
      _send('POST', '/v1/mentoring/plans/$id/close', body: {'outcome': outcome, 'outcomeRating': rating});

  @override
  Future<List<TermInfo>> courseTerms() async {
    // The terms this teacher teaches in (the all-terms list is for administrators).
    final seen = <String>{};
    return [
      for (final o in (await _send('GET', '/v1/course-registration/me/teaching') as List).cast<Map<String, dynamic>>())
        if (seen.add(o['termId'] as String)) TermInfo.fromJson({'id': o['termId'], 'name': o['term']}),
    ];
  }

  @override
  Future<List<OfferingInfo>> courseOfferings(String termId) async => [
    for (final o in (await _send('GET', '/v1/course-registration/me/teaching') as List).cast<Map<String, dynamic>>())
      if (o['termId'] == termId) OfferingInfo.fromJson({'id': o['id'], 'subjectCode': o['code'], 'subjectName': o['name'], 'facultyId': o['facultyId']}),
  ];

  @override
  Future<List<RosterEntry>> offeringRoster(String offeringId) async {
    final j = await _send('GET', '/v1/course-registration/offerings/$offeringId/roster') as Map<String, dynamic>;
    return _rows(j['students'], RosterEntry.fromJson);
  }

  @override
  Future<List<SurveyInfo>> mySurveys() async => _rows(await _send('GET', '/v1/surveys/mine'), SurveyInfo.fromJson);

  @override
  Future<void> submitSurvey(String id, List<SurveyAnswer> answers) async =>
      _send('POST', '/v1/surveys/$id/responses', body: {'answers': [for (final a in answers) a.toJson()]});

  @override
  Future<List<ClubInfo>> clubs() async => _rows(await _send('GET', '/v1/campus-life/clubs'), ClubInfo.fromJson);

  @override
  Future<List<ClubMember>> clubMembers(String clubId) async =>
      _rows(await _send('GET', '/v1/campus-life/clubs/$clubId/members?status=active'), ClubMember.fromJson);

  @override
  Future<List<CoSet>> coSets(String subjectId) async => _rows(await _send('GET', '/v1/obe/subjects/$subjectId/co-sets'), CoSet.fromJson);

  @override
  Future<CoMatrix> coMatrix(String coSetId) async => CoMatrix.fromJson(await _send('GET', '/v1/obe/co-sets/$coSetId/matrix') as Map<String, dynamic>);

  @override
  Future<String?> currentAcademicYearId() async {
    final terms = _rows(await _send('GET', '/v1/terms'), TermYear.fromJson);
    final n = DateTime.now();
    return TermYear.current(terms, '${n.year.toString().padLeft(4, '0')}-${n.month.toString().padLeft(2, '0')}-${n.day.toString().padLeft(2, '0')}');
  }

  @override
  Future<List<CoAttainment>> coAttainment({required String programId, required String academicYearId}) async {
    final j = await _send('GET', '/v1/obe/programs/$programId/attainment?academicYearId=$academicYearId') as Map<String, dynamic>;
    final max = (j['config'] as Map?)?['maxLevel'];
    return _rows(j['cos'], (m) => CoAttainment.fromJson({...m, 'maxLevel': max}));
  }

  @override
  Future<List<ResearchProject>> researchProjects() async => _rows(await _send('GET', '/v1/research/projects'), ResearchProject.fromJson);

  @override
  Future<List<Scholar>> researchScholars() async => _rows(await _send('GET', '/v1/research/scholars'), Scholar.fromJson);

  @override
  Future<List<ThesisRow>> researchTheses() async => _rows(await _send('GET', '/v1/research/theses'), ThesisRow.fromJson);

  @override
  Future<ThesisDetail> researchThesis(String id) async => ThesisDetail.fromJson(await _send('GET', '/v1/research/theses/$id') as Map<String, dynamic>);

  @override
  Future<void> moveThesisStage(String id, {required String to, String note = ''}) async => _send('POST', '/v1/research/theses/$id/stage', body: {'to': to, 'note': note});

  @override
  Future<void> openThesis(String scholarId, {required String title, String abstract = ''}) async =>
      _send('POST', '/v1/research/scholars/$scholarId/thesis', body: {'title': title, 'abstract': abstract});

  @override
  Future<List<Publication>> researchPublications({String? ownerUserId}) async =>
      _rows(await _send('GET', '/v1/research/publications${ownerUserId == null ? '' : '?ownerUserId=$ownerUserId'}'), Publication.fromJson);

  @override
  Future<Publication> importPublicationDoi(String doi) async =>
      Publication.fromJson(await _send('POST', '/v1/research/publications/import-doi', body: {'doi': doi}, timeout: const Duration(seconds: 40)) as Map<String, dynamic>);

  @override
  Future<List<ResearchDataset>> researchDatasets() async => _rows(await _send('GET', '/v1/research/datasets'), ResearchDataset.fromJson);

  @override
  Future<List<MyProject>> myProjects() async => _rows(await _send('GET', '/v1/projects/mine'), MyProject.fromJson);

  @override
  Future<ProjectWorkspace> projectWorkspace(String id) async => ProjectWorkspace.fromJson(await _send('GET', '/v1/projects/$id/workspace') as Map<String, dynamic>);

  @override
  Future<List<ProjectComment>> projectComments(String id) async => _rows(await _send('GET', '/v1/projects/$id/comments'), ProjectComment.fromJson);

  @override
  Future<void> addProjectComment(String id, {required String body, String? parentId}) async =>
      _send('POST', '/v1/projects/$id/comments', body: {'body': body, 'parentId': ?parentId});

  @override
  Future<List<ProjectReview>> projectReviews(String id) async => _rows(await _send('GET', '/v1/projects/$id/reviews'), ProjectReview.fromJson);

  @override
  Future<void> addProjectReview(String id, {required Map<String, double> rubric, required int maxPerCriterion, String comment = ''}) async =>
      _send('POST', '/v1/projects/$id/reviews', body: {'kind': 'mentor', 'rubric': rubric, 'maxPerCriterion': maxPerCriterion, 'comment': comment});

  @override
  Future<void> scheduleProjectViva(String id, {required DateTime scheduledAt, required String venue, required List<String> panel}) async => _send(
    'POST',
    '/v1/projects/$id/viva',
    body: {'scheduledAt': scheduledAt.toUtc().toIso8601String(), 'venue': venue, 'panel': [for (final n in panel) {'name': n}]},
  );

  @override
  Future<void> recordProjectViva(String vivaId, {required String outcome, double? score, String remarks = ''}) async =>
      _send('POST', '/v1/projects/viva/$vivaId/result', body: {'outcome': outcome, 'score': ?score, 'remarks': remarks});

  @override
  Future<void> setProjectHub(String id, ProjectHub hub) async => _send(
    'PUT',
    '/v1/projects/$id/hub',
    body: {'showcase': hub.showcase, 'summary': hub.summary, 'recruiting': hub.recruiting, 'lookingFor': hub.lookingFor, 'openings': hub.openings},
  );

  @override
  Future<List<JoinRequest>> projectJoinRequests(String id) async => _rows(await _send('GET', '/v1/projects/$id/requests'), JoinRequest.fromJson);

  @override
  Future<void> decideJoinRequest(String requestId, {required bool accept}) async => _send('POST', '/v1/projects/requests/$requestId/decide', body: {'accept': accept});

  @override
  Future<List<ProjectMatch>> projectMatches(String id) async => _rows(await _send('GET', '/v1/projects/$id/matches'), ProjectMatch.fromJson);

  @override
  Future<void> addProjectLink(String id, {required String title, required String url}) async =>
      _send('POST', '/v1/projects/$id/files', body: {'title': title, 'kind': 'link', 'url': url});

  @override
  Future<Me> updatePreferredLanguage(String language) async =>
      Me.fromJson(await _send('PATCH', '/v1/me', body: {'preferredLanguage': language}));

  @override
  Future<DayTimetable> timetable({String? date}) async =>
      DayTimetable.fromJson(await _send('GET', '/v1/teacher/timetable${date == null ? '' : '?date=$date'}'));

  @override
  Future<List<TeacherClass>> classes() async =>
      (await _send('GET', '/v1/teacher/classes') as List).map((e) => TeacherClass.fromJson(e as Map<String, dynamic>)).toList();

  @override
  Future<SectionInsights> sectionInsights(String sectionId) async =>
      SectionInsights.fromJson(await _send('GET', '/v1/mentoring/sections/$sectionId/insights') as Map<String, dynamic>);

  @override
  Future<AiDraft> aiDraft(AiTask task, {required String input, int? count, int? minutes, String language = 'en', String? sectionId, String? subjectId}) async {
    final body = <String, Object?>{
      if (task == AiTask.explain) 'question': input else 'topic': input,
      'language': language,
      if (count != null && (task == AiTask.quiz || task == AiTask.homework)) 'count': count,
      if (minutes != null && task == AiTask.lessonPlan) 'minutes': minutes,
      'sectionId': ?sectionId,
      'subjectId': ?subjectId,
    };
    final res = await _send('POST', '/v1/ai/${task.path}', body: body, timeout: const Duration(seconds: 90));
    return AiDraft.fromJson(task, (res as Map).cast<String, dynamic>());
  }

  @override
  Future<List<Student>> roster(String sectionId) async =>
      (await _send('GET', '/v1/sections/$sectionId/roster') as List).map((e) => Student.fromJson(e as Map<String, dynamic>)).toList();

  @override
  Future<List<AnswerCard>> answerCards(String sectionId) async =>
      ((await _send('GET', '/v1/sections/$sectionId/answer-cards') as Map)['cards'] as List).map((e) => AnswerCard.fromJson(e as Map<String, dynamic>)).toList();

  @override
  Future<AttendanceSheet> attendance({required String slotId, required String date}) async =>
      AttendanceSheet.fromJson(await _send('GET', '/v1/attendance?slotId=$slotId&date=$date'));

  @override
  Future<AttendanceSheet> submitAttendance({
    required String slotId,
    required String date,
    required Map<String, AttendanceStatus> marks,
  }) async => AttendanceSheet.fromJson(
    await _send(
      'POST',
      '/v1/attendance',
      body: {
        'slotId': slotId,
        'date': date,
        'records': [
          for (final e in marks.entries) {'studentId': e.key, 'status': e.value.name},
        ],
      },
    ),
  );

  @override
  Future<BoardConnection?> activeSession() async {
    final active = (await _send('GET', '/v1/teacher/session') as Map)['active'];
    return active == null ? null : BoardConnection.fromJson(active as Map<String, dynamic>);
  }

  @override
  Future<BoardConnection> claimBoard({String? code, String? qr}) async =>
      BoardConnection.fromJson(await _send('POST', '/v1/pairing/claim', body: {'code': ?code, 'qr': ?qr}));

  @override
  Future<void> endSession(String sessionId) async => _send('POST', '/v1/sessions/$sessionId/end');

  @override
  Future<List<Homework>> myHomework() async =>
      (await _send('GET', '/v1/teacher/homework') as List).map((e) => Homework.fromJson(e as Map<String, dynamic>)).toList();

  @override
  Future<Homework> createHomework({
    required String sectionId,
    required String subjectId,
    required String title,
    required String instructions,
    required String dueOn,
  }) async => Homework.fromJson(
    await _send(
      'POST',
      '/v1/homework',
      body: {'sectionId': sectionId, 'subjectId': subjectId, 'title': title, 'instructions': instructions, 'dueOn': dueOn},
    ),
  );

  @override
  Future<List<RecordingInfo>> myRecordings() async =>
      (await _send('GET', '/v1/recordings') as List).map((e) => RecordingInfo.fromJson(e as Map<String, dynamic>)).toList();

  @override
  Future<RecordingInfo> recording(String id) async =>
      RecordingInfo.fromJson(await _send('GET', '/v1/recordings/$id') as Map<String, dynamic>);

  @override
  Future<Lesson> recordingLesson(String id) async =>
      Lesson.fromJson(await _send('GET', '/v1/recordings/$id/events') as Map<String, dynamic>);

  @override
  Future<RecordingInfo> shareRecording(String id) async =>
      RecordingInfo.fromJson(await _send('POST', '/v1/recordings/$id/share') as Map<String, dynamic>);

  @override
  Future<RecordingInfo> keepRecording(String id, {required bool keep}) async =>
      RecordingInfo.fromJson(await _send('POST', '/v1/recordings/$id/keep', body: {'keep': keep}) as Map<String, dynamic>);

  @override
  Future<List<Assessment>> assessments(String sectionId) async => (await _send('GET', '/v1/assessments?sectionId=$sectionId') as List)
      .map((e) => Assessment.fromJson(e as Map<String, dynamic>))
      .toList();

  @override
  Future<Assessment> assessment(String id) async => Assessment.fromJson(await _send('GET', '/v1/assessments/$id') as Map<String, dynamic>);

  @override
  Future<Assessment> createAssessment({
    required String sectionId,
    required String subjectId,
    required String title,
    required AssessmentKind kind,
    required double maxMarks,
    required String heldOn,
  }) async => Assessment.fromJson(
    await _send(
      'POST',
      '/v1/assessments',
      body: {'sectionId': sectionId, 'subjectId': subjectId, 'title': title, 'kind': kind.name, 'maxMarks': maxMarks, 'heldOn': heldOn},
    ),
  );

  @override
  Future<Assessment> saveMarks(String assessmentId, List<MarkInput> entries) async => Assessment.fromJson(
    await _send(
      'PUT',
      '/v1/assessments/$assessmentId/marks',
      body: {
        'entries': [for (final e in entries) e.toJson()],
      },
    ),
  );

  @override
  Future<Assessment> publishAssessment(String id) async =>
      Assessment.fromJson(await _send('POST', '/v1/assessments/$id/publish') as Map<String, dynamic>);

  @override
  Future<List<Conversation>> conversations() async =>
      (await _send('GET', '/v1/conversations') as List).map((e) => Conversation.fromJson(e as Map<String, dynamic>)).toList();

  @override
  Future<ChatPage> conversationMessages(String id, {DateTime? before}) async => ChatPage.fromJson(
    await _send(
      'GET',
      '/v1/conversations/$id/messages${before == null ? '' : '?before=${Uri.encodeQueryComponent(before.toUtc().toIso8601String())}'}',
    ),
  );

  @override
  Future<ChatMessage> sendMessage(String conversationId, String body) async =>
      ChatMessage.fromJson(await _send('POST', '/v1/conversations/$conversationId/messages', body: {'body': body}));

  @override
  Future<void> markConversationRead(String id) async => _send('POST', '/v1/conversations/$id/read');

  @override
  Future<List<StudentContacts>> familyContacts({String? sectionId}) async {
    final j = await _send('GET', '/v1/conversations/contacts${sectionId == null ? '' : '?sectionId=$sectionId'}') as Map;
    return ((j['asStaff'] as List?) ?? const []).map((e) => StudentContacts.fromJson(e as Map<String, dynamic>)).toList();
  }

  @override
  Future<Conversation> startConversation({required String studentId, required String guardianId}) async =>
      Conversation.fromJson(await _send('POST', '/v1/conversations', body: {'studentId': studentId, 'withUserId': guardianId}));

  @override
  Future<DriverHome> driverHome() async => DriverHome.fromJson(await _send('GET', '/v1/transport/me') as Map<String, dynamic>);

  @override
  Future<DriverTrip> startTrip({required String routeId, required TripDirection direction}) async =>
      DriverTrip.fromJson(await _send('POST', '/v1/transport/trips', body: {'routeId': routeId, 'direction': direction.name}) as Map<String, dynamic>);

  @override
  Future<void> sendPosition(String tripId, {required double lat, required double lng, double? speedKmh}) async {
    await _send('POST', '/v1/transport/trips/$tripId/position', body: {'lat': lat, 'lng': lng, 'speedKmh': ?speedKmh});
  }

  @override
  Future<void> endTrip(String tripId) async {
    await _send('POST', '/v1/transport/trips/$tripId/end', body: <String, dynamic>{});
  }

  @override
  Future<List<CalendarEvent>> calendar({String? from, String? to}) async {
    final query = [if (from != null) 'from=$from', if (to != null) 'to=$to'].join('&');
    final j = await _send('GET', '/v1/calendar${query.isEmpty ? '' : '?$query'}') as Map;
    return (j['events'] as List).map((e) => CalendarEvent.fromJson(e as Map<String, dynamic>)).toList();
  }

  @override
  Future<Syllabus?> syllabus(String subjectId) async {
    final j = await _send('GET', '/v1/content/syllabus?subjectId=$subjectId');
    return j is Map<String, dynamic> ? Syllabus.fromJson(j) : null;
  }

  @override
  Future<Coverage> coverage({required String sectionId, required String subjectId}) async =>
      Coverage.fromJson(await _send('GET', '/v1/coverage?sectionId=$sectionId&subjectId=$subjectId') as Map<String, dynamic>);

  @override
  Future<void> markTopic({required String sectionId, required String subjectId, required String topicId, String? coveredOn}) async =>
      _send('POST', '/v1/coverage', body: {'sectionId': sectionId, 'subjectId': subjectId, 'topicId': topicId, 'coveredOn': ?coveredOn});

  @override
  Future<void> unmarkTopic({required String sectionId, required String subjectId, required String topicId}) async =>
      _send('DELETE', '/v1/coverage', body: {'sectionId': sectionId, 'subjectId': subjectId, 'topicId': topicId});

  @override
  Future<List<TopicVideo>> topicVideos(String topicId) async => [
    for (final v in await _send('GET', '/v1/content/topics/$topicId/videos/mine') as List) TopicVideo.fromJson(v as Map<String, dynamic>),
  ];

  @override
  Future<TopicVideo> addTopicVideo({required String topicId, required String url, required String sectionId}) async => TopicVideo.fromJson(
    await _send('POST', '/v1/content/topics/$topicId/videos', body: {'url': url, 'scope': 'teacher', 'sectionIds': [sectionId]}) as Map<String, dynamic>,
  );

  @override
  Future<TopicVideo> shareTopicVideo(String videoId) async => TopicVideo.fromJson(await _send('POST', '/v1/content/videos/$videoId/share') as Map<String, dynamic>);

  @override
  Future<void> removeTopicVideo(String videoId) async => _send('DELETE', '/v1/content/videos/$videoId');

  @override
  Future<SubmissionList> submissions(String homeworkId) async =>
      SubmissionList.fromJson(await _send('GET', '/v1/homework/$homeworkId/submissions') as Map<String, dynamic>);

  @override
  Future<Uint8List> submissionFile(String homeworkId, String studentId, int index) async => (await _request(
    'GET',
    '/v1/homework/$homeworkId/submissions/$studentId/files/$index',
    timeout: const Duration(seconds: 60),
  )).bodyBytes;

  @override
  Future<Submission> reviewSubmission(String homeworkId, Submission submission, {required SubmissionStatus status, String? remark}) async =>
      submission.reviewed(
        await _send(
          'POST',
          '/v1/homework/$homeworkId/submissions/${submission.studentId}/review',
          body: {'status': status.name, if (remark != null && remark.isNotEmpty) 'remark': remark},
        ) as Map<String, dynamic>,
      );

  @override
  Future<YearPlan?> yearPlan({required String sectionId, required String subjectId}) async {
    final j = await _send('GET', '/v1/year-plans?sectionId=$sectionId&subjectId=$subjectId');
    return j is Map<String, dynamic> ? YearPlan.fromJson(j) : null;
  }

  @override
  Future<YearPlan> generateYearPlan({required String sectionId, required String subjectId, String? startsOn, String? endsOn}) async =>
      YearPlan.fromJson(
        await _send(
          'POST',
          '/v1/year-plans/generate',
          body: {'sectionId': sectionId, 'subjectId': subjectId, 'startsOn': ?startsOn, 'endsOn': ?endsOn},
        ) as Map<String, dynamic>,
      );

  @override
  Future<YearPlan> moveYearPlanItem(String planId, {required String topicId, required String weekOf, required int periods}) async =>
      YearPlan.fromJson(
        await _send(
          'PUT',
          '/v1/year-plans/$planId/items',
          body: {
            'items': [
              {'topicId': topicId, 'weekOf': weekOf, 'periods': periods},
            ],
          },
        ) as Map<String, dynamic>,
      );

  @override
  Future<PeriodPlan> periodPlan({required String slotId, required String date}) async =>
      PeriodPlan.fromJson(await _send('GET', '/v1/lesson-plans/period?slotId=$slotId&date=$date') as Map<String, dynamic>);

  @override
  Future<PeriodPlan> saveLessonPlan({
    required String slotId,
    required String date,
    required List<String> topicIds,
    required LessonContent content,
    required bool aiDrafted,
  }) async => PeriodPlan.fromJson(
    await _send(
      'PUT',
      '/v1/lesson-plans',
      body: {'slotId': slotId, 'date': date, 'topicIds': topicIds, 'content': content.toJson(), 'aiDrafted': aiDrafted},
    ) as Map<String, dynamic>,
  );

  @override
  Future<LessonDraft> draftLessonPlan({required String slotId, required String date, List<String>? topicIds, String? language}) async =>
      LessonDraft.fromJson(
        await _send(
          'POST',
          '/v1/lesson-plans/draft',
          body: {'slotId': slotId, 'date': date, 'topicIds': ?topicIds, 'language': ?language},
          timeout: const Duration(seconds: 60),
        ) as Map<String, dynamic>,
      );

  @override
  Future<int> remindMissing(String homeworkId) async =>
      ((await _send('POST', '/v1/homework/$homeworkId/submissions/remind')) as Map)['reminded'] as int;

  @override
  Future<Me> updateProfile({required String fullName, required String? email, List<String>? teachingSubjects}) async => Me.fromJson(
    await _send('PATCH', '/v1/me', body: {'fullName': fullName, 'email': email, 'teachingSubjects': ?teachingSubjects}) as Map<String, dynamic>,
  );

  @override
  Future<Me> uploadPhoto(Uint8List jpeg) async {
    final req = http.MultipartRequest('POST', Uri.parse('$baseUrl/v1/me/photo'))
      ..files.add(http.MultipartFile.fromBytes('photo', jpeg, filename: 'photo.jpg'));
    if (token != null) req.headers['authorization'] = 'Bearer $token';
    final http.Response res;
    try {
      res = await http.Response.fromStream(await _http.send(req)).timeout(const Duration(seconds: 60));
    } on TimeoutException {
      throw ApiException(0, 'The server is taking too long to respond. Try again.', kind: ApiErrorKind.timeout);
    } catch (_) {
      throw ApiException(0, "Can't reach KINETIX. Check your internet connection and the server address.", kind: ApiErrorKind.offline);
    }
    if (res.statusCode >= 400) throw ApiException(res.statusCode, _message(res) ?? 'HTTP ${res.statusCode}', code: _code(res));
    return Me.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  @override
  Future<Me> removePhoto() async => Me.fromJson(await _send('DELETE', '/v1/me/photo') as Map<String, dynamic>);

  @override
  ImageProvider? photo(String? path) =>
      path == null ? null : NetworkImage('$baseUrl$path', headers: {if (token != null) 'authorization': 'Bearer $token'});

  @override
  Future<void> awardBadge({required String studentId, required String sectionId, required String badge, String? subjectId}) async =>
      _send('POST', '/v1/badges', body: {'studentId': studentId, 'sectionId': sectionId, 'badge': badge, 'subjectId': ?subjectId});

  Future<dynamic> _send(String method, String path, {Object? body, bool auth = true, Duration timeout = const Duration(seconds: 20)}) async {
    final res = await _request(method, path, body: body, auth: auth, timeout: timeout);
    return res.body.isEmpty ? null : jsonDecode(res.body);
  }

  /// Sends a request; throws [ApiException] for network failures and error statuses.
  Future<http.Response> _request(
    String method,
    String path, {
    Object? body,
    bool auth = true,
    Duration timeout = const Duration(seconds: 20),
  }) async {
    final req = http.Request(method, Uri.parse('$baseUrl$path'))
      ..headers['content-type'] = 'application/json'
      ..headers['accept'] = 'application/json';
    if (auth && token != null) req.headers['authorization'] = 'Bearer $token';
    if (body != null) req.body = jsonEncode(body);

    final http.Response res;
    try {
      res = await http.Response.fromStream(await _http.send(req)).timeout(timeout);
    } on TimeoutException {
      throw ApiException(0, 'The server is taking too long to respond. Try again.', kind: ApiErrorKind.timeout);
    } catch (_) {
      throw ApiException(0, "Can't reach KINETIX. Check your internet connection and the server address.", kind: ApiErrorKind.offline);
    }

    if (res.statusCode >= 400) {
      if (res.statusCode == 401 && auth) onUnauthorized?.call();
      final m = _message(res);
      final code = _code(res);
      throw m == null
          ? ApiException(res.statusCode, 'HTTP ${res.statusCode}', kind: ApiErrorKind.http, code: code)
          : ApiException(res.statusCode, m, code: code);
    }
    return res;
  }

  /// The stable error code the server adds to every error body, if it is new enough to send one.
  static String? _code(http.Response res) {
    try {
      final c = (jsonDecode(res.body) as Map)['code'];
      return c is String ? c : null;
    } catch (_) {
      return null;
    }
  }

  /// The server's explanation, or null when it only sent a status.
  static String? _message(http.Response res) {
    try {
      final m = (jsonDecode(res.body) as Map)['message'];
      if (m is String) return m;
      if (m is Map && m['message'] is String) return m['message'] as String;
      // Zod validation errors: { formErrors, fieldErrors }
      if (m is Map && m['fieldErrors'] is Map) {
        final first = (m['fieldErrors'] as Map).entries.firstOrNull;
        if (first != null) return '${first.key}: ${(first.value as List).first}';
      }
    } catch (_) {}
    return null;
  }
}
