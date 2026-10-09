import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/painting.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart' show MediaType;
import 'package:kinetix_lesson/kinetix_lesson.dart';

import '../l10n/l10n.dart';
import 'campus.dart';
import 'campus_life.dart';
import 'campus_services.dart';
import 'growth.dart';
import 'lms.dart';
import 'models.dart';
import 'scholarships.dart';

/// Problems the app words itself (in the app's language, see l10n/l10n.dart).
enum ApiProblem { timeout, unreachable, wrongLogin, notStudent, guardianAccount, teacherAccount, notLinked }

class ApiException implements Exception {
  ApiException(this.status, this.message, {this.problem, this.code, this.retryAfterSeconds});

  /// HTTP status, or 0 when the server could not be reached.
  final int status;

  /// What the server said, or an English fallback; empty when the server said nothing useful.
  final String message;

  /// Set when the app knows what went wrong and words it itself.
  final ApiProblem? problem;

  /// The server's stable error code (`CONSENT_WITHDRAWN`, `NOT_FOUND`…; services/api
  /// common/error-codes.ts), which the app words in its own language. Null when the server
  /// was not reached or sent none.
  final String? code;

  /// For 429 `RATE_LIMITED`: how long until the server takes the request again.
  final int? retryAfterSeconds;

  @override
  String toString() => message.isEmpty ? 'HTTP $status' : message;
}

/// A sign-in code was sent: when another may be asked for, and how long this one works.
class OtpChallenge {
  const OtpChallenge({this.retryAfterSeconds = 30, this.expiresInSeconds = 300});

  factory OtpChallenge.fromJson(Map<String, dynamic>? j) => OtpChallenge(
    retryAfterSeconds: (j?['retryAfterSeconds'] as num?)?.toInt() ?? 30,
    expiresInSeconds: (j?['expiresInSeconds'] as num?)?.toInt() ?? 300,
  );

  final int retryAfterSeconds;
  final int expiresInSeconds;
}

/// Everything the Student App asks of the KINETIX Cloud API. Tests use a fake.
abstract class StudentApi {
  String get baseUrl;
  set baseUrl(String value);

  /// User access token after sign-in.
  String? get token;
  set token(String? value);

  /// Signs in and stores the token on this client.
  Future<void> login({required String tenant, required String login, required String password});

  /// Texts a 6-digit sign-in code to [phone] (E.164) (`POST /v1/auth/otp/request`). The server
  /// answers the same whether or not the number has an account; 429 `RATE_LIMITED` when asked too often.
  Future<OtpChallenge> requestOtp({required String tenant, required String phone});

  /// Signs in with the texted code and stores the token on this client (`POST /v1/auth/otp/verify`).
  /// 401 `OTP_INVALID` for a wrong or expired code.
  Future<void> verifyOtp({required String tenant, required String phone, required String code});
  Future<Me> me();

  /// Saves the language for the app and for notifications (`PATCH /v1/me`).
  Future<Me> setPreferredLanguage(String language);

  /// The signed-in student's own record (class, roll no., program).
  Future<StudentProfile> student();

  /// Attendance, homework, shared boards and recordings over the last [days] days.
  Future<StudentSummary> summary(String studentId, {int days = 30});

  /// Every period's mark over the last [days] days, newest day first.
  Future<List<ClassMark>> attendance(String studentId, {int days = 30});

  /// Marks the student present for the period whose code the teacher is showing. Returns true when a mark was already there.
  Future<bool> scanAttendance(String code);

  Future<Inbox> notifications();
  Future<void> markRead(String notificationId);
  Future<void> markAllRead();

  Future<SharedBoard> whiteboard(String id);

  /// A lesson recording shared with the class, with transcript and summary.
  Future<RecordingInfo> recording(String id);

  /// The recording's board events, for [LessonPlayer].
  Future<Lesson> recordingLesson(String id);

  /// One homework, with the class and subject it was set for.
  Future<HomeworkDetail> homeworkById(String id);

  /// The subjects of the student's class (`GET /v1/student/subjects`).
  Future<List<Subject>> subjects();

  /// KINETIX AI: explains a doubt in the chosen language, grounded in the class's syllabus.
  Future<Explanation> explain({
    required String question,
    required AiLanguage language,
    String? sectionId,
    String? subjectId,
    String? topicId,
  });

  Future<List<TopicHit>> searchTopics(String query);
  Future<TopicDetail> topic(String id);

  /// The topic's concept videos (KINETIX YouTube channel), the class's language first.
  Future<List<ConceptVideo>> conceptVideos(String topicId);

  /// The subject's syllabus, or null when the subject is not linked to a library course yet.
  Future<CourseOutline?> syllabus(String subjectId);

  Future<FeeAccount> fees(String studentId);
  Future<FeeReceipt> receipt(String paymentId);

  /// What the student sits and when, with hall tickets and revaluation requests (`GET /v1/results/students/:id/exams`).
  Future<List<ExamSession>> exams(String studentId);

  /// Published term results with SGPA and CGPA (`GET /v1/results/students/:id`).
  Future<ExamResults> examResults(String studentId);

  /// The hall ticket as a PDF; the server refuses (403) when the college withholds it.
  Future<Uint8List> hallTicketPdf(String sessionId, String studentId);

  /// Asks for a paper to be re-checked while the results are published and open.
  Future<void> requestRevaluation(String studentId, {required String sessionId, required String subjectId, required String reason});

  /// The student's leave applications, newest first.
  Future<List<LeaveRequest>> leaveRequests(String studentId);
  Future<LeaveRequest> applyLeave(String studentId, {required DateTime from, required DateTime to, required String reason});
  Future<LeaveRequest> cancelLeave(String id);

  /// The student's bus: the seat and the bus right now (`GET /v1/transport/students/:id`).
  Future<StudentBus> bus(String studentId);

  /// The hostel bed and gate passes (`GET /v1/hostel/students/:id`).
  Future<HostelView> hostel(String studentId);

  /// The canteen wallet and recent meals (`GET /v1/canteen/students/:id`).
  Future<WalletView> wallet(String studentId);

  /// Starts an online top-up (503 when the institution takes no online payments).
  Future<TopUpCheckout> walletCheckout(String studentId, int amountPaise);

  /// Reports the checkout result; returns the new balance (403 when the signature does not match).
  Future<int> confirmWalletTopUp(String topUpId, {required String providerPaymentId, required String signature});
  Future<GatePass> requestGatePass(String studentId, {required String reason, required String destination, required DateTime backAt});

  /// Certificates the student may ask for, and the ones already asked for.
  Future<List<CertificateTemplate>> certificateTemplates();
  Future<List<CertificateRequest>> myCertificates();
  Future<CertificateRequest> requestCertificate(String studentId, {required String templateId, required String purpose, required Map<String, String> fields});
  Future<Uint8List> certificatePdf(String id);

  /// Books the student has out and has returned, with fines.
  Future<LibraryAccount> library(String studentId);

  /// Open drives with eligibility, the student's registrations, offers and internships (`GET /v1/placements/students/:id/overview`).
  Future<CareerOverview> careerOverview(String studentId);

  /// Registers for a drive (the server re-checks eligibility and answers 409 with the reasons).
  Future<void> registerForDrive(String studentId, String driveId);
  Future<void> withdrawFromDrive(String studentId, String driveId);
  Future<void> respondToOffer(String offerId, {required bool accept});

  /// Grievances this person raised, newest first (`GET /v1/grievances/mine`).
  Future<List<GrievanceTicket>> myGrievances();
  Future<GrievanceTicket> raiseGrievance({required String category, required String subject, required String description, bool anonymous = false, String? studentId});
  Future<void> rateGrievance(String id, int rating);

  /// The student's published marks with class averages and per-subject percentages.
  Future<StudentMarks> marks(String studentId);

  /// Who the student may write to: empty at schools, where families write instead.
  Future<List<ContactGroup>> contacts();
  Future<List<Conversation>> conversations();

  /// Opens the thread with [teacherId] about [studentId] (the student themselves), or returns it.
  Future<Conversation> startConversation({required String studentId, required String teacherId});

  /// Up to 50 messages, oldest first; [before] pages back.
  Future<MessagePage> messages(String conversationId, {DateTime? before});
  Future<ChatMessage> sendMessage(String conversationId, String body);
  Future<void> markConversationRead(String conversationId);

  /// The class being taught live right now, or null.
  Future<LiveClass?> live();

  /// The question open in the student's class on the board now, or null.
  Future<ClassQuestion?> classQuestion();

  /// Answers it (MCQ: the option's index; numeric: the number). Returns the answer as stored.
  Future<String> answerQuestion(String id, String answer);

  /// The academic calendar for the student's class between [from] and [to] (default: today
  /// and the next 90 days).
  Future<CalendarRange> calendar({DateTime? from, DateTime? to});

  /// How much of [subjectId]'s syllabus the class [sectionId] has been taught.
  Future<Coverage> coverage({required String sectionId, required String subjectId});

  /// The class [sectionId]'s year plan for [subjectId] with its progress, or null when the
  /// teacher has not made one (`GET /v1/year-plans`).
  Future<YearPlan?> yearPlan({required String sectionId, required String subjectId});

  /// What [studentId] handed in for homework [homeworkId] (status null: nothing yet).
  Future<Submission> submission(String homeworkId, String studentId);

  /// Hands in [text] and up to five photos or PDFs (multipart), reporting bytes sent.
  Future<Submission> submitHomework(
    String homeworkId,
    String studentId, {
    required String text,
    List<UploadFile> files = const [],
    void Function(int sent, int total)? onProgress,
  });

  /// Where a handed-in file is served, with the headers to fetch it.
  ({Uri url, Map<String, String> headers}) submissionFile(String homeworkId, String studentId, int index);

  /// The student's privacy decisions (`GET /v1/consents?studentId=`).
  Future<Consents> consents(String studentId);

  /// Records one decision; returns them all.
  Future<Consents> setConsent(String studentId, ConsentPurpose purpose, {required bool granted});

  /// Registers this device for push notifications to the Student App.
  Future<void> registerPushDevice({required String token, required String platform});
  Future<void> removePushDevice(String token);

  /// Edits the profile (the phone number is the sign-in: only the office changes it).
  Future<Me> updateProfile({required String fullName, required String? email});

  /// Replaces the profile photo with [jpeg] (already square and compressed).
  Future<Me> uploadPhoto(Uint8List jpeg);
  Future<Me> removePhoto();

  /// A user's photo from its API [path] (`photoUrl`), loaded with the token; null for none.
  ImageProvider? photo(String? path);

  /// The badges teachers awarded a student, newest first.
  Future<List<BadgeAward>> badges(String studentId);

  /// The published LMS courses of a student with the running grade (`GET /v1/lms/my`).
  Future<List<LmsCourseSummary>> lmsCourses(String studentId);

  /// One course: modules, content, announcements and the grade breakdown (`GET /v1/lms/courses/:id`).
  Future<LmsCourseDetail> lmsCourse(String courseId, String studentId);

  /// Scholarships open for applications (`GET /v1/finance/scholarship-schemes`).
  Future<List<ScholarshipScheme>> scholarshipSchemes();

  /// This student's applications (`GET /v1/finance/scholarships?studentId=`).
  Future<List<ScholarshipApplication>> scholarshipApplications(String studentId);

  /// Applies for a scheme; the server checks eligibility (400 with the reason when not eligible).
  Future<void> applyScholarship(String studentId, {required String schemeId, int? incomePaise, String note = ''});

  // ── Course registration, passport, surveys, clubs and events ───────────────────────────────

  /// Terms to register in (`GET /v1/course-registration/terms`).
  Future<List<RegTerm>> registrationTerms();

  /// Offerings of a term with seats left and my status (`GET /v1/course-registration/me/offerings`).
  Future<OfferingList> courseOfferings(String termId);

  /// My registrations in a term with credit totals (`GET /v1/course-registration/me/registrations`).
  Future<MyRegistrations> myRegistrations(String termId);

  /// Registers for an offering; 409 with the reason when a rule refuses (`POST …/me/register`).
  Future<void> registerCourse(String offeringId);

  /// Drops an offering (`POST …/me/drop`).
  Future<void> dropCourse(String offeringId);

  /// Ranks electives, most wanted first (`PUT …/me/preferences`).
  Future<void> setCoursePreferences(String termId, List<String> offeringIds);

  /// My Outcome Passport (`GET /v1/passport/me`).
  Future<OutcomePassport> passport(String studentId);

  /// The passport as a PDF (`GET /v1/passport/students/:id/pdf`).
  Future<Uint8List> passportPdf(String studentId);

  /// Data rights under the DPDP Act: the grievance officer, my data as a summary and as a PDF,
  /// my requests, and a new correction or erasure request (`/v1/dpdp`).
  Future<DpdpOfficer> dpdpOfficer();
  Future<DataExport> dpdpExport();
  Future<Uint8List> dpdpExportPdf();
  Future<List<DpdpRequest>> dpdpRequests();

  /// [kind] is `correction` or `erasure`; a correction may name one of `fullName`, `email`, `phone` and its new value.
  /// The answer for an erasure lists why it may be refused.
  Future<DpdpRequest> dpdpRequest({required String kind, String details = '', String? field, String? value});

  /// Houses ranked by points (`GET /v1/houses/leaderboard`) and one house with its members and points (`GET /v1/houses/:id`).
  Future<List<HouseRow>> houses();
  Future<HouseDetail> houseDetail(String id);

  /// Homework peer review: work I must review, feedback on mine, and saving a review (`/v1/homework/:id/peer-review`).
  Future<List<PeerReviewTask>> peerReviewTasks(String homeworkId);
  Future<PeerFeedback> peerFeedback(String homeworkId);
  Future<void> submitPeerReview(String homeworkId, String reviewId, {required int clarity, required int accuracy, required int effort, required String comment});

  /// Open surveys addressed to me (`GET /v1/surveys/mine`).
  Future<List<MySurvey>> mySurveys();

  /// Submits my answers; 409 if already answered (`POST /v1/surveys/:id/responses`).
  Future<void> submitSurvey(String surveyId, List<SurveyAnswer> answers);

  /// Active clubs with my membership (`GET /v1/campus-life/me/clubs`).
  Future<List<MyClub>> myClubs(String studentId);
  Future<void> joinClub(String studentId, String clubId);
  Future<void> leaveClub(String studentId, String clubId);

  /// Events I can register for (`GET /v1/campus-life/me/events`).
  Future<List<CampusEvent>> campusEvents(String studentId);
  Future<void> registerForEvent(String studentId, String eventId);
  Future<void> cancelEventRegistration(String studentId, String eventId);

  /// My event registrations with the QR token to show at the door.
  Future<List<MyEventRegistration>> myEventRegistrations(String studentId);
  Future<void> giveEventFeedback(String studentId, String eventId, {required int rating, String comment = ''});
}

/// Lets the lesson player load recordings through a [StudentApi].
class StudentLessonSource implements LessonSource {
  StudentLessonSource(this.api);

  final StudentApi api;

  Future<T> _guard<T>(Future<T> Function() f) async {
    try {
      return await f();
    } on ApiException catch (e) {
      throw LessonLoadException(
        e.status == 404 ? 'This recording is no longer shared with your class.' : e.message,
        describe: (context) => e.status == 404 ? context.l10n.recordingNotSharedYours : context.errorText(e),
      );
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

class HttpStudentApi implements StudentApi {
  HttpStudentApi({required this.baseUrl, http.Client? client}) : _http = client ?? http.Client();

  @override
  String baseUrl;
  @override
  String? token;
  final http.Client _http;

  /// Called when the server rejects the token (expired or revoked), so the app can sign out.
  void Function()? onUnauthorized;

  @override
  Future<void> login({required String tenant, required String login, required String password}) async {
    final dynamic j;
    try {
      j = await _send('POST', '/v1/auth/login', body: {'tenant': tenant, 'login': login, 'password': password}, auth: false);
    } on ApiException catch (e) {
      if (e.status == 401) throw ApiException(401, e.message, problem: ApiProblem.wrongLogin);
      rethrow;
    }
    token = j['accessToken'] as String;
  }

  @override
  Future<OtpChallenge> requestOtp({required String tenant, required String phone}) async =>
      OtpChallenge.fromJson(await _send('POST', '/v1/auth/otp/request', body: {'tenant': tenant, 'phone': phone}, auth: false) as Map<String, dynamic>);

  @override
  Future<void> verifyOtp({required String tenant, required String phone, required String code}) async {
    final dynamic j;
    try {
      j = await _send('POST', '/v1/auth/otp/verify', body: {'tenant': tenant, 'phone': phone, 'code': code}, auth: false);
    } on ApiException catch (e) {
      if (e.status == 401) throw ApiException(401, e.message, code: e.code ?? 'OTP_INVALID');
      rethrow;
    }
    token = j['accessToken'] as String;
  }

  @override
  Future<Me> me() async => Me.fromJson(await _send('GET', '/v1/me'));

  @override
  Future<Me> setPreferredLanguage(String language) async =>
      Me.fromJson(await _send('PATCH', '/v1/me', body: {'preferredLanguage': language}));

  @override
  Future<StudentProfile> student() async => StudentProfile.fromJson(await _send('GET', '/v1/student/me'));

  @override
  Future<StudentSummary> summary(String studentId, {int days = 30}) async =>
      StudentSummary.fromJson(await _send('GET', '/v1/parent/children/$studentId/summary?days=$days'));

  @override
  Future<List<ClassMark>> attendance(String studentId, {int days = 30}) async => [
    for (final m in await _send('GET', '/v1/parent/children/$studentId/attendance?days=$days') as List)
      ClassMark.fromJson(m as Map<String, dynamic>),
  ];

  @override
  Future<bool> scanAttendance(String code) async =>
      ((await _send('POST', '/v1/student/attendance/scan', body: {'code': code.trim()})) as Map<String, dynamic>)['alreadyMarked'] == true;

  @override
  Future<Inbox> notifications() async => Inbox.fromJson(await _send('GET', '/v1/notifications'));

  @override
  Future<void> markRead(String notificationId) async => _send('POST', '/v1/notifications/$notificationId/read');

  @override
  Future<void> markAllRead() async => _send('POST', '/v1/notifications/read-all');

  @override
  Future<SharedBoard> whiteboard(String id) async => SharedBoard.fromJson(await _send('GET', '/v1/whiteboards/$id'));

  @override
  Future<RecordingInfo> recording(String id) async =>
      RecordingInfo.fromJson(await _send('GET', '/v1/recordings/$id') as Map<String, dynamic>);

  @override
  Future<Lesson> recordingLesson(String id) async =>
      Lesson.fromJson(await _send('GET', '/v1/recordings/$id/events') as Map<String, dynamic>);

  @override
  Future<HomeworkDetail> homeworkById(String id) async =>
      HomeworkDetail.fromJson(await _send('GET', '/v1/homework/$id') as Map<String, dynamic>);

  @override
  Future<List<Subject>> subjects() async => [
    for (final s in await _send('GET', '/v1/student/subjects') as List<dynamic>) Subject.fromJson(s as Map<String, dynamic>),
  ];

  @override
  Future<Explanation> explain({
    required String question,
    required AiLanguage language,
    String? sectionId,
    String? subjectId,
    String? topicId,
  }) async => Explanation.fromJson(
    await _send(
      'POST',
      '/v1/ai/explain',
      body: {'question': question, 'language': language.name, 'sectionId': ?sectionId, 'subjectId': ?subjectId, 'topicId': ?topicId},
      // A model can take a while to write a full answer.
      timeout: const Duration(seconds: 60),
    ),
  );

  @override
  Future<List<TopicHit>> searchTopics(String query) async => [
    for (final t in await _send('GET', '/v1/content/search?q=${Uri.encodeQueryComponent(query)}') as List)
      TopicHit.fromJson(t as Map<String, dynamic>),
  ];

  @override
  Future<TopicDetail> topic(String id) async => TopicDetail.fromJson(await _send('GET', '/v1/content/topics/$id'));

  @override
  Future<List<ConceptVideo>> conceptVideos(String topicId) async {
    final j = await _send('GET', '/v1/content/topics/$topicId/videos') as Map<String, dynamic>;
    return [for (final v in j['videos'] as List<dynamic>) ConceptVideo.fromJson(v as Map<String, dynamic>)];
  }

  @override
  Future<CourseOutline?> syllabus(String subjectId) async {
    final j = await _send('GET', '/v1/content/syllabus?subjectId=$subjectId');
    return j == null ? null : CourseOutline.fromJson(j as Map<String, dynamic>);
  }

  @override
  Future<FeeAccount> fees(String studentId) async => FeeAccount.fromJson(await _send('GET', '/v1/fees/students/$studentId'));

  @override
  Future<FeeReceipt> receipt(String paymentId) async => FeeReceipt.fromJson(await _send('GET', '/v1/fees/payments/$paymentId/receipt'));

  @override
  Future<List<ExamSession>> exams(String studentId) async {
    final j = await _send('GET', '/v1/results/students/$studentId/exams') as Map<String, dynamic>;
    return [for (final e in j['sessions'] as List) ExamSession.fromJson((e as Map).cast<String, dynamic>())];
  }

  @override
  Future<ExamResults> examResults(String studentId) async => ExamResults.fromJson(await _send('GET', '/v1/results/students/$studentId') as Map<String, dynamic>);

  @override
  Future<Uint8List> hallTicketPdf(String sessionId, String studentId) => _download('/v1/exam-sessions/$sessionId/hall-tickets/$studentId/pdf');

  @override
  Future<void> requestRevaluation(String studentId, {required String sessionId, required String subjectId, required String reason}) =>
      _send('POST', '/v1/results/students/$studentId/revaluations', body: {'sessionId': sessionId, 'subjectId': subjectId, 'reason': reason});

  @override
  Future<List<LeaveRequest>> leaveRequests(String studentId) async =>
      [for (final r in await _send('GET', '/v1/student-leave?studentId=$studentId') as List) LeaveRequest.fromJson((r as Map).cast<String, dynamic>())];

  @override
  Future<LeaveRequest> applyLeave(String studentId, {required DateTime from, required DateTime to, required String reason}) async =>
      LeaveRequest.fromJson(await _send('POST', '/v1/student-leave', body: {'studentId': studentId, 'fromDate': isoDate(from), 'toDate': isoDate(to), 'reason': reason}) as Map<String, dynamic>);

  @override
  Future<LeaveRequest> cancelLeave(String id) async => LeaveRequest.fromJson(await _send('POST', '/v1/student-leave/$id/cancel') as Map<String, dynamic>);

  @override
  Future<StudentBus> bus(String studentId) async => StudentBus.fromJson(await _send('GET', '/v1/transport/students/$studentId') as Map<String, dynamic>);

  @override
  Future<WalletView> wallet(String studentId) async => WalletView.fromJson(await _send('GET', '/v1/canteen/students/$studentId') as Map<String, dynamic>);

  @override
  Future<TopUpCheckout> walletCheckout(String studentId, int amountPaise) async =>
      TopUpCheckout.fromJson(await _send('POST', '/v1/canteen/students/$studentId/topup-checkout', body: {'amountPaise': amountPaise}) as Map<String, dynamic>);

  @override
  Future<int> confirmWalletTopUp(String topUpId, {required String providerPaymentId, required String signature}) async =>
      ((await _send('POST', '/v1/canteen/topups/$topUpId/confirm', body: {'providerPaymentId': providerPaymentId, 'signature': signature}) as Map<String, dynamic>)['balancePaise'] as num).toInt();

  @override
  Future<HostelView> hostel(String studentId) async => HostelView.fromJson(await _send('GET', '/v1/hostel/students/$studentId') as Map<String, dynamic>);

  @override
  Future<GatePass> requestGatePass(String studentId, {required String reason, required String destination, required DateTime backAt}) async => GatePass.fromJson(
    await _send('POST', '/v1/hostel/gate-passes/requests', body: {'studentId': studentId, 'reason': reason, 'destination': destination, 'expectedBackAt': backAt.toUtc().toIso8601String()}) as Map<String, dynamic>,
  );

  @override
  Future<List<CertificateTemplate>> certificateTemplates() async =>
      [for (final t in await _send('GET', '/v1/documents/templates/available') as List) CertificateTemplate.fromJson((t as Map).cast<String, dynamic>())];

  @override
  Future<List<CertificateRequest>> myCertificates() async =>
      [for (final c in await _send('GET', '/v1/documents/requests/mine') as List) CertificateRequest.fromJson((c as Map).cast<String, dynamic>())];

  @override
  Future<CertificateRequest> requestCertificate(String studentId, {required String templateId, required String purpose, required Map<String, String> fields}) async =>
      CertificateRequest.fromJson(await _send('POST', '/v1/documents/requests', body: {'templateId': templateId, 'studentId': studentId, 'purpose': purpose, 'fields': fields}) as Map<String, dynamic>);

  @override
  Future<Uint8List> certificatePdf(String id) => _download('/v1/documents/requests/$id/pdf');

  /// A binary file (a PDF) the signed-in user may read.
  Future<Uint8List> _download(String path) async {
    final req = http.Request('GET', Uri.parse('$baseUrl$path'));
    if (token != null) req.headers['authorization'] = 'Bearer $token';
    final http.Response res;
    try {
      res = await http.Response.fromStream(await _http.send(req)).timeout(const Duration(seconds: 60));
    } on TimeoutException {
      throw ApiException(0, 'The server is taking too long to respond. Try again.', problem: ApiProblem.timeout);
    } catch (_) {
      throw ApiException(0, "Can't reach KINETIX. Check your internet connection and the server address.", problem: ApiProblem.unreachable);
    }
    if (res.statusCode >= 400) {
      if (res.statusCode == 401) onUnauthorized?.call();
      throw ApiException(res.statusCode, _message(res), code: _code(res));
    }
    return res.bodyBytes;
  }

  @override
  Future<void> registerPushDevice({required String token, required String platform}) async =>
      _send('POST', '/v1/push/devices', body: {'token': token, 'platform': platform, 'app': 'student'});

  @override
  Future<void> removePushDevice(String token) async => _send('DELETE', '/v1/push/devices', body: {'token': token});

  @override
  Future<LibraryAccount> library(String studentId) async =>
      LibraryAccount.fromJson(await _send('GET', '/v1/library/students/$studentId') as Map<String, dynamic>);

  @override
  Future<CareerOverview> careerOverview(String studentId) async =>
      CareerOverview.fromJson(await _send('GET', '/v1/placements/students/$studentId/overview') as Map<String, dynamic>);

  @override
  Future<void> registerForDrive(String studentId, String driveId) async => _send('POST', '/v1/placements/students/$studentId/drives/$driveId/registration');

  @override
  Future<void> withdrawFromDrive(String studentId, String driveId) async => _send('POST', '/v1/placements/students/$studentId/drives/$driveId/withdraw');

  @override
  Future<void> respondToOffer(String offerId, {required bool accept}) async =>
      _send('POST', '/v1/placements/offers/$offerId/respond', body: {'response': accept ? 'accepted' : 'declined'});

  @override
  Future<List<GrievanceTicket>> myGrievances() async => [
    for (final t in await _send('GET', '/v1/grievances/mine') as List) GrievanceTicket.fromJson((t as Map).cast<String, dynamic>()),
  ];

  @override
  Future<GrievanceTicket> raiseGrievance({required String category, required String subject, required String description, bool anonymous = false, String? studentId}) async =>
      GrievanceTicket.fromJson(
        await _send('POST', '/v1/grievances', body: {'category': category, 'subject': subject, 'description': description, 'anonymous': anonymous, 'studentId': ?studentId}) as Map<String, dynamic>,
      );

  @override
  Future<void> rateGrievance(String id, int rating) async => _send('POST', '/v1/grievances/$id/rating', body: {'rating': rating});

  @override
  Future<StudentMarks> marks(String studentId) async =>
      StudentMarks.fromJson(await _send('GET', '/v1/marks/students/$studentId') as Map<String, dynamic>);

  @override
  Future<List<ContactGroup>> contacts() async {
    final j = await _send('GET', '/v1/conversations/contacts') as Map<String, dynamic>;
    return [for (final c in (j['asFamily'] as List? ?? const [])) ContactGroup.fromJson(c as Map<String, dynamic>)];
  }

  @override
  Future<List<Conversation>> conversations() async => [
    for (final c in await _send('GET', '/v1/conversations') as List) Conversation.fromJson(c as Map<String, dynamic>),
  ];

  @override
  Future<Conversation> startConversation({required String studentId, required String teacherId}) async => Conversation.fromJson(
    await _send('POST', '/v1/conversations', body: {'studentId': studentId, 'withUserId': teacherId}) as Map<String, dynamic>,
  );

  @override
  Future<MessagePage> messages(String conversationId, {DateTime? before}) async {
    final q = before == null ? '' : '?before=${Uri.encodeQueryComponent(before.toUtc().toIso8601String())}';
    return MessagePage.fromJson(await _send('GET', '/v1/conversations/$conversationId/messages$q') as Map<String, dynamic>);
  }

  @override
  Future<ChatMessage> sendMessage(String conversationId, String body) async =>
      ChatMessage.fromJson(await _send('POST', '/v1/conversations/$conversationId/messages', body: {'body': body}) as Map<String, dynamic>);

  @override
  Future<void> markConversationRead(String conversationId) async => _send('POST', '/v1/conversations/$conversationId/read');

  @override
  Future<LiveClass?> live() async {
    final j = await _send('GET', '/v1/student/live') as Map<String, dynamic>;
    final live = j['live'];
    return live == null ? null : LiveClass.fromJson((live as Map).cast<String, dynamic>());
  }

  @override
  Future<ClassQuestion?> classQuestion() async {
    final q = (await _send('GET', '/v1/student/poll') as Map<String, dynamic>)['poll'];
    return q == null ? null : ClassQuestion.fromJson((q as Map).cast<String, dynamic>());
  }

  @override
  Future<String> answerQuestion(String id, String answer) async =>
      (await _send('POST', '/v1/polls/$id/answer', body: {'answer': answer}) as Map<String, dynamic>)['answer'] as String;

  @override
  Future<CalendarRange> calendar({DateTime? from, DateTime? to}) async {
    final q = [if (from != null) 'from=${isoDate(from)}', if (to != null) 'to=${isoDate(to)}'].join('&');
    return CalendarRange.fromJson(await _send('GET', '/v1/calendar${q.isEmpty ? '' : '?$q'}') as Map<String, dynamic>);
  }

  @override
  Future<Coverage> coverage({required String sectionId, required String subjectId}) async =>
      Coverage.fromJson(await _send('GET', '/v1/coverage?sectionId=$sectionId&subjectId=$subjectId') as Map<String, dynamic>);

  @override
  Future<YearPlan?> yearPlan({required String sectionId, required String subjectId}) async {
    final j = await _send('GET', '/v1/year-plans?sectionId=$sectionId&subjectId=$subjectId');
    return j == null ? null : YearPlan.fromJson((j as Map).cast<String, dynamic>());
  }

  @override
  Future<Submission> submission(String homeworkId, String studentId) async =>
      Submission.fromJson(await _send('GET', '/v1/homework/$homeworkId/submissions/$studentId') as Map<String, dynamic>);

  @override
  Future<Submission> submitHomework(
    String homeworkId,
    String studentId, {
    required String text,
    List<UploadFile> files = const [],
    void Function(int sent, int total)? onProgress,
  }) async {
    final form = http.MultipartRequest('POST', Uri.parse('$baseUrl/v1/homework/$homeworkId/submissions/$studentId'))
      ..fields['text'] = text
      ..files.addAll([
        for (final f in files) http.MultipartFile.fromBytes('files', f.bytes, filename: f.name, contentType: MediaType.parse(f.mime)),
      ]);
    // Copied into a streamed request so the bytes can be counted as they go.
    final body = form.finalize();
    final total = form.contentLength;
    final req = http.StreamedRequest('POST', form.url)
      ..contentLength = total
      ..headers.addAll(form.headers)
      ..headers['accept'] = 'application/json';
    if (token != null) req.headers['authorization'] = 'Bearer $token';
    var sent = 0;
    onProgress?.call(0, total);
    body.listen(
      (chunk) {
        req.sink.add(chunk);
        sent += chunk.length;
        onProgress?.call(sent, total);
      },
      onDone: req.sink.close,
      onError: req.sink.addError,
    );
    return Submission.fromJson(await _receive(req, auth: true, timeout: const Duration(minutes: 3)) as Map<String, dynamic>);
  }

  @override
  ({Uri url, Map<String, String> headers}) submissionFile(String homeworkId, String studentId, int index) => (
    url: Uri.parse('$baseUrl/v1/homework/$homeworkId/submissions/$studentId/files/$index'),
    headers: {if (token != null) 'authorization': 'Bearer $token'},
  );

  @override
  Future<Consents> consents(String studentId) async => Consents.fromJson(await _send('GET', '/v1/consents?studentId=$studentId') as Map<String, dynamic>);

  @override
  Future<Consents> setConsent(String studentId, ConsentPurpose purpose, {required bool granted}) async => Consents.fromJson(
    await _send('POST', '/v1/consents', body: {'studentId': studentId, 'purpose': purpose.wire, 'granted': granted}) as Map<String, dynamic>,
  );

  @override
  Future<Me> updateProfile({required String fullName, required String? email}) async =>
      Me.fromJson(await _send('PATCH', '/v1/me', body: {'fullName': fullName, 'email': email}) as Map<String, dynamic>);

  @override
  Future<Me> uploadPhoto(Uint8List jpeg) async {
    final req = http.MultipartRequest('POST', Uri.parse('$baseUrl/v1/me/photo'))
      ..files.add(http.MultipartFile.fromBytes('photo', jpeg, filename: 'photo.jpg', contentType: MediaType('image', 'jpeg')))
      ..headers['accept'] = 'application/json';
    if (token != null) req.headers['authorization'] = 'Bearer $token';
    return Me.fromJson(await _receive(req, auth: true, timeout: const Duration(minutes: 1)) as Map<String, dynamic>);
  }

  @override
  Future<Me> removePhoto() async => Me.fromJson(await _send('DELETE', '/v1/me/photo') as Map<String, dynamic>);

  @override
  ImageProvider? photo(String? path) =>
      path == null ? null : NetworkImage('$baseUrl$path', headers: {if (token != null) 'authorization': 'Bearer $token'});

  @override
  Future<List<BadgeAward>> badges(String studentId) async {
    final j = await _send('GET', '/v1/badges/students/$studentId') as Map<String, dynamic>;
    return [for (final b in j['badges'] as List) BadgeAward.fromJson(b as Map<String, dynamic>)];
  }

  Future<dynamic> _send(
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
    return _receive(req, auth: auth, timeout: timeout);
  }

  Future<dynamic> _receive(http.BaseRequest req, {required bool auth, required Duration timeout}) async {
    final http.Response res;
    try {
      res = await http.Response.fromStream(await _http.send(req)).timeout(timeout);
    } on TimeoutException {
      throw ApiException(0, 'The server is taking too long to respond. Try again.', problem: ApiProblem.timeout);
    } catch (_) {
      throw ApiException(0, "Can't reach KINETIX. Check your internet connection and the server address.", problem: ApiProblem.unreachable);
    }

    if (res.statusCode >= 400) {
      if (res.statusCode == 401 && auth) onUnauthorized?.call();
      throw ApiException(res.statusCode, _message(res), code: _code(res), retryAfterSeconds: _retryAfter(res));
    }
    return res.body.isEmpty ? null : jsonDecode(res.body);
  }

  static int? _retryAfter(http.Response res) {
    try {
      final r = (jsonDecode(res.body) as Map)['retryAfterSeconds'];
      return r is num ? r.toInt() : null;
    } catch (_) {
      return null;
    }
  }

  static String? _code(http.Response res) {
    try {
      final c = (jsonDecode(res.body) as Map)['code'];
      return c is String ? c : null;
    } catch (_) {
      return null;
    }
  }

  static String _message(http.Response res) {
    try {
      final m = (jsonDecode(res.body) as Map)['message'];
      if (m is String) return m;
      if (m is Map && m['message'] is String) return m['message'] as String;
      if (m is Map && m['fieldErrors'] is Map) {
        final first = (m['fieldErrors'] as Map).entries.firstOrNull;
        if (first != null) return '${first.key}: ${(first.value as List).first}';
      }
    } catch (_) {}
    // Nothing useful from the server: the app words it from the status (l10n/l10n.dart).
    return '';
  }

  @override
  Future<List<LmsCourseSummary>> lmsCourses(String studentId) async =>
      [for (final c in await _send('GET', '/v1/lms/my?studentId=$studentId') as List) LmsCourseSummary.fromJson((c as Map).cast<String, dynamic>())];

  @override
  Future<LmsCourseDetail> lmsCourse(String courseId, String studentId) async =>
      LmsCourseDetail.fromJson(await _send('GET', '/v1/lms/courses/$courseId?studentId=$studentId') as Map<String, dynamic>);

  @override
  Future<List<ScholarshipScheme>> scholarshipSchemes() async =>
      [for (final c in await _send('GET', '/v1/finance/scholarship-schemes') as List) ScholarshipScheme.fromJson((c as Map).cast<String, dynamic>())];

  @override
  Future<List<ScholarshipApplication>> scholarshipApplications(String studentId) async =>
      [for (final c in await _send('GET', '/v1/finance/scholarships?studentId=$studentId') as List) ScholarshipApplication.fromJson((c as Map).cast<String, dynamic>())];

  @override
  Future<void> applyScholarship(String studentId, {required String schemeId, int? incomePaise, String note = ''}) =>
      _send('POST', '/v1/finance/scholarships/apply', body: {'studentId': studentId, 'schemeId': schemeId, 'incomePaise': ?incomePaise, 'note': note});

  @override
  Future<List<RegTerm>> registrationTerms() async => [for (final t in await _send('GET', '/v1/course-registration/terms') as List) RegTerm.fromJson((t as Map).cast<String, dynamic>())];

  @override
  Future<OfferingList> courseOfferings(String termId) async => OfferingList.fromJson(await _send('GET', '/v1/course-registration/me/offerings?termId=$termId') as Map<String, dynamic>);

  @override
  Future<MyRegistrations> myRegistrations(String termId) async => MyRegistrations.fromJson(await _send('GET', '/v1/course-registration/me/registrations?termId=$termId') as Map<String, dynamic>);

  @override
  Future<void> registerCourse(String offeringId) => _send('POST', '/v1/course-registration/me/register', body: {'offeringId': offeringId});

  @override
  Future<void> dropCourse(String offeringId) => _send('POST', '/v1/course-registration/me/drop', body: {'offeringId': offeringId});

  @override
  Future<void> setCoursePreferences(String termId, List<String> offeringIds) => _send('PUT', '/v1/course-registration/me/preferences', body: {'termId': termId, 'offeringIds': offeringIds});

  @override
  Future<OutcomePassport> passport(String studentId) async => OutcomePassport.fromJson(await _send('GET', '/v1/passport/me?studentId=$studentId') as Map<String, dynamic>);

  @override
  Future<Uint8List> passportPdf(String studentId) => _download('/v1/passport/students/$studentId/pdf');

  @override
  Future<DpdpOfficer> dpdpOfficer() async => DpdpOfficer.fromJson(await _send('GET', '/v1/dpdp/grievance-officer') as Map<String, dynamic>);

  @override
  Future<DataExport> dpdpExport() async => DataExport.fromJson(await _send('GET', '/v1/dpdp/me/export') as Map<String, dynamic>);

  @override
  Future<Uint8List> dpdpExportPdf() => _download('/v1/dpdp/me/export.pdf');

  @override
  Future<List<DpdpRequest>> dpdpRequests() async => [for (final r in await _send('GET', '/v1/dpdp/me/requests') as List) DpdpRequest.fromJson((r as Map).cast<String, dynamic>())];

  @override
  Future<DpdpRequest> dpdpRequest({required String kind, String details = '', String? field, String? value}) async => DpdpRequest.fromJson(
    await _send('POST', '/v1/dpdp/me/requests', body: {'kind': kind, 'details': details, if (field != null && value != null) 'correction': {'field': field, 'value': value}}) as Map<String, dynamic>,
  );

  @override
  Future<List<HouseRow>> houses() async => [for (final h in await _send('GET', '/v1/houses/leaderboard') as List) HouseRow.fromJson((h as Map).cast<String, dynamic>())];

  @override
  Future<HouseDetail> houseDetail(String id) async => HouseDetail.fromJson(await _send('GET', '/v1/houses/$id') as Map<String, dynamic>);

  @override
  Future<List<PeerReviewTask>> peerReviewTasks(String homeworkId) async =>
      [for (final r in await _send('GET', '/v1/homework/$homeworkId/peer-review/mine') as List) PeerReviewTask.fromJson((r as Map).cast<String, dynamic>())];

  @override
  Future<PeerFeedback> peerFeedback(String homeworkId) async => PeerFeedback.fromJson(await _send('GET', '/v1/homework/$homeworkId/peer-review/received') as Map<String, dynamic>);

  @override
  Future<void> submitPeerReview(String homeworkId, String reviewId, {required int clarity, required int accuracy, required int effort, required String comment}) =>
      _send('PUT', '/v1/homework/$homeworkId/peer-review/$reviewId', body: {'clarity': clarity, 'accuracy': accuracy, 'effort': effort, 'comment': comment});

  @override
  Future<List<MySurvey>> mySurveys() async => [for (final s in await _send('GET', '/v1/surveys/mine') as List) MySurvey.fromJson((s as Map).cast<String, dynamic>())];

  @override
  Future<void> submitSurvey(String surveyId, List<SurveyAnswer> answers) => _send('POST', '/v1/surveys/$surveyId/responses', body: {'answers': [for (final a in answers) a.toJson()]});

  @override
  Future<List<MyClub>> myClubs(String studentId) async => [for (final c in await _send('GET', '/v1/campus-life/me/clubs?studentId=$studentId') as List) MyClub.fromJson((c as Map).cast<String, dynamic>())];

  @override
  Future<void> joinClub(String studentId, String clubId) => _send('POST', '/v1/campus-life/clubs/$clubId/join', body: {'studentId': studentId});

  @override
  Future<void> leaveClub(String studentId, String clubId) => _send('POST', '/v1/campus-life/clubs/$clubId/leave', body: {'studentId': studentId});

  @override
  Future<List<CampusEvent>> campusEvents(String studentId) async => [for (final e in await _send('GET', '/v1/campus-life/me/events?studentId=$studentId') as List) CampusEvent.fromJson((e as Map).cast<String, dynamic>())];

  @override
  Future<void> registerForEvent(String studentId, String eventId) => _send('POST', '/v1/campus-life/events/$eventId/register', body: {'studentId': studentId});

  @override
  Future<void> cancelEventRegistration(String studentId, String eventId) => _send('POST', '/v1/campus-life/events/$eventId/cancel-registration', body: {'studentId': studentId});

  @override
  Future<List<MyEventRegistration>> myEventRegistrations(String studentId) async =>
      [for (final r in await _send('GET', '/v1/campus-life/me/registrations?studentId=$studentId') as List) MyEventRegistration.fromJson((r as Map).cast<String, dynamic>())];

  @override
  Future<void> giveEventFeedback(String studentId, String eventId, {required int rating, String comment = ''}) =>
      _send('POST', '/v1/campus-life/events/$eventId/feedback', body: {'studentId': studentId, 'rating': rating, 'comment': comment});
}
