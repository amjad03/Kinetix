import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/foundation.dart' show defaultTargetPlatform, TargetPlatform;
import 'package:flutter/painting.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart' show MediaType;
import 'package:kinetix_lesson/kinetix_lesson.dart';

import '../l10n/l10n.dart';
import 'boarding.dart';
import 'campus.dart';
import 'conduct.dart';
import 'exam_models.dart';
import 'growth.dart';
import 'lms.dart';
import 'campus_extras.dart';
import 'models.dart';
import 'school_life.dart';

/// Problems the app words itself (in the app's language, see l10n/l10n.dart).
enum ApiProblem { timeout, unreachable, wrongLogin, notGuardian, teacherAccount }

class ApiException implements Exception {
  ApiException(this.status, this.message, {this.problem, this.code, this.retryAfterSeconds});

  /// HTTP status, or 0 when the server could not be reached.
  final int status;

  /// What the server said, or an English fallback; empty when the server said nothing useful.
  final String message;

  /// Set when the app knows what went wrong and words it itself.
  final ApiProblem? problem;

  /// The server's stable error code (`SUBMISSION_CHECKED`, `NOT_FOUND`…; services/api
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

/// Everything the Parent App asks of the KINETIX Cloud API. Tests use a fake.
abstract class ParentApi {
  String get baseUrl;
  set baseUrl(String value);

  /// Whether this phone is one I have trusted (`trusted`, `new`, or `none` when the app has no install id), and trusting it (`/v1/me/devices`).
  Future<String> deviceState();
  Future<void> trustDevice(String label);

  /// Extends a book I (or my child) have out by another loan period (`POST /v1/library/loans/:id/renew`).
  Future<void> renewLoan(String loanId);

  /// Rates a canteen meal 1 to 5; rating the same meal again replaces the earlier rating (`POST /v1/canteen/ops/feedback`).
  Future<void> rateMeal({required String mealDate, required String meal, required int rating, String comment = '', String? childId});

  /// Repairs raised from my own hostel complaints and where each stands (`GET /v1/hostel/work-orders/mine`).
  Future<List<RepairRequest>> repairRequests({String? childId});

  /// A fee's instalment schedule with due dates and status (`GET /v1/fees/invoices/:id/instalments`).
  Future<InstalmentSchedule> instalments(String invoiceId);

  /// Every instalment plan across all of a student's invoices (`GET /v1/fees/students/:id/instalments`).
  Future<List<InstalmentSchedule>> studentInstalments(String studentId);

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
  Future<List<Child>> children();

  /// Attendance, homework, class participation and shared boards over the last [days] days.
  Future<ChildSummary> summary(String childId, {int days = 30});

  /// A short written update about the child, from their marks, attendance and homework (KINETIX AI). [language] is en, hi or kn.
  Future<AiUpdate> aiUpdate(String childId, {required String language});

  /// Every period's mark over the last [days] days, newest day first.
  Future<List<ClassMark>> attendance(String childId, {int days = 30});
  Future<Inbox> notifications();
  Future<void> markRead(String notificationId);
  Future<void> markAllRead();
  Future<SharedBoard> whiteboard(String id);

  /// A lesson recording shared with the child's class, with transcript and summary.
  Future<RecordingInfo> recording(String id);

  /// The recording's board events, for [LessonPlayer].
  Future<Lesson> recordingLesson(String id);

  /// One homework (opened from a notification), with the class and subject it was set for.
  Future<({Homework homework, String sectionId, Subject subject})> homeworkById(String id);

  /// The child's fees, payments and whether online payment is available.
  Future<StudentFees> fees(String childId);

  /// Starts an online payment of [amountPaise] (the whole balance when null) against a fee.
  /// 503 when online payment is off; 400 when the fee is paid or the amount is more than the balance.
  Future<FeeCheckout> checkout(String invoiceId, {int? amountPaise});

  /// Reports the gateway's result; the server checks the signature (403 when it does not match).
  Future<FeeReceipt> confirmPayment(String paymentId, {required String providerPaymentId, required String signature});
  Future<FeeReceipt> receipt(String paymentId);

  /// The hostel bed and the recent night roll calls (`GET /v1/hostel/students/:id`).
  Future<BoardingView> boarding(String childId);

  /// The canteen wallet, recent meals and whether online top-up is available (`GET /v1/canteen/students/:id`).
  Future<WalletView> wallet(String childId);

  /// Starts an online top-up of [amountPaise]; the result's `paymentId` is the top-up id. 503 when online payment is off.
  Future<FeeCheckout> walletCheckout(String childId, int amountPaise);

  /// Reports the gateway's result; returns the new balance (403 when the signature does not match).
  Future<int> confirmWalletTopUp(String topUpId, {required String providerPaymentId, required String signature});

  /// What the child sits and when, with hall tickets and revaluation requests (`GET /v1/results/students/:id/exams`).
  Future<List<ExamSession>> exams(String childId);

  /// Published term results with SGPA and CGPA (`GET /v1/results/students/:id`).
  Future<ExamResults> examResults(String childId);

  /// The child's hall ticket as a PDF; the server refuses (403) when the college withholds it.
  Future<Uint8List> hallTicketPdf(String sessionId, String childId);

  /// Asks for a paper to be re-checked while the results are published and open.
  Future<void> requestRevaluation(String childId, {required String sessionId, required String subjectId, required String reason});

  /// Books the child has out and has returned, with fines (`GET /v1/library/students/:id`).
  Future<LibraryAccount> library(String childId);

  /// The child's drives with eligibility, offers and internships (`GET /v1/placements/students/:id/overview`). Read only here.
  Future<CareerOverview> careerOverview(String childId);

  /// Grievances this guardian raised, newest first (`GET /v1/grievances/mine`).
  Future<List<GrievanceTicket>> myGrievances();
  Future<GrievanceTicket> raiseGrievance({required String category, required String subject, required String description, bool anonymous = false, String? studentId});
  Future<void> rateGrievance(String id, int rating);

  /// The child's class diary, newest first, each entry saying whether a guardian acknowledged it
  /// (`GET /v1/parent/children/:id/diary`).
  Future<List<DiaryEntry>> diary(String childId);

  /// Records that a guardian has read the entry (`POST /v1/parent/children/:id/diary/:entryId/acknowledge`).
  Future<void> acknowledgeDiary(String childId, String entryId);

  /// Which sections the school shows parents (`GET /v1/parent/visibility`); a hidden section answers 403 `PARENT_VISIBILITY_OFF`.
  Future<ParentVisibility> visibility();

  /// The child's clubs and posts, events, house, co-curricular grades and achievements (`GET /v1/parent/children/:id/activities`).
  Future<ChildActivities> activities(String childId);

  /// The child's behaviour grade, incidents with the actions taken, and house recognitions (`GET /v1/parent/children/:id/behaviour`).
  Future<ChildBehaviour> behaviour(String childId);

  /// Notes the school sent this parent about incidents (`GET /v1/discipline/my-notices`) and the acknowledgement of one
  /// (`POST /v1/discipline/parent-contacts/:id/acknowledge`).
  Future<List<SchoolNotice>> schoolNotices();
  Future<void> acknowledgeNotice(String noticeId);

  /// Parent-teacher meetings, newest first (`GET /v1/ptm/events`).
  Future<List<PtmEvent>> ptmEvents();

  /// Free slots of the child's teachers plus the child's own bookings (`GET /v1/ptm/events/:id/slots?studentId=`).
  Future<List<PtmSlot>> ptmSlots(String eventId, String childId);

  /// This guardian's bookings across their children (`GET /v1/ptm/my-bookings`).
  Future<List<PtmBooking>> ptmBookings();

  /// 409 when the slot was just taken or the child already has a slot with that teacher.
  Future<void> ptmBook(String slotId, String childId);
  Future<void> ptmCancel(String slotId);

  /// Moves a booking to another free slot of the same teacher.
  Future<void> ptmReschedule(String slotId, String toSlotId);

  /// Milestones and observations (`GET /v1/parent/children/:id/early-years`).
  Future<EarlyYearsView> earlyYears(String childId);

  /// The academic terms, for choosing a learning story (`GET /v1/terms`).
  Future<List<TermInfo>> terms();

  /// The learning story of a term as a PDF (`GET /v1/parent/children/:id/early-years/learning-story.pdf`).
  Future<Uint8List> learningStoryPdf(String childId, String termId);

  /// The child's health profile, nurse visits and vaccinations, read only (`GET /v1/parent/children/:id/health`).
  Future<HealthRecord> health(String childId);

  /// The child's outcome passport (`GET /v1/passport/me?studentId=`) and its PDF.
  Future<OutcomePassport> passport(String childId);
  Future<Uint8List> passportPdf(String childId);

  /// Data rights under the DPDP Act: the grievance officer, my data (and my children's) as a summary and as a PDF,
  /// my requests, and a new correction or erasure request (`/v1/dpdp`). [kind] is `correction` or `erasure`;
  /// a correction to my own details may name `fullName`, `email` or `phone` and its new value.
  Future<DpdpOfficer> dpdpOfficer();
  Future<DataExport> dpdpExport();
  Future<Uint8List> dpdpExportPdf();
  Future<List<DpdpRequest>> dpdpRequests();
  Future<DpdpRequest> dpdpRequest({required String kind, String details = '', String? field, String? value});

  /// A child's report cards, one full card and its PDF (`/v1/school/report-cards`). School mode; empty elsewhere.
  Future<List<ReportCardRow>> reportCards(String childId);
  Future<ReportCardDetail> reportCard(String id);
  Future<Uint8List> reportCardPdf(String id);

  /// Open surveys addressed to this guardian (`GET /v1/surveys/mine`) and the answers to one.
  Future<List<Survey>> surveys();
  Future<void> answerSurvey(String surveyId, List<SurveyAnswer> answers);

  /// Campus events the child can join, with the child's registration (`GET /v1/campus-life/me/events`).
  Future<List<CampusEvent>> campusEvents(String childId);
  Future<void> registerForEvent(String eventId, String childId);
  Future<void> cancelEventRegistration(String eventId, String childId);

  /// The child's event registrations with the QR token to show at the door (`GET /v1/campus-life/me/registrations`).
  Future<List<EventPass>> eventPasses(String childId);

  /// A 1-5 rating and comment for an event the child was checked in to (`POST /v1/campus-life/events/:id/feedback`).
  Future<void> giveEventFeedback(String eventId, String childId, {required int rating, String comment = ''});

  /// The child's school bus: route, stop, pickup time and the bus now (`GET /v1/transport/students/:id`).
  Future<StudentBus> bus(String childId);

  /// The child's published marks with class averages and per-subject percentages.
  Future<ChildMarks> marks(String childId);

  /// Each child with the teachers of their class, who the parent can write to.
  Future<List<ChildContacts>> contacts();

  /// The parent's conversations, latest first, with unread counts.
  Future<List<Conversation>> conversations();

  /// Opens the thread with [teacherId] about [childId], or returns the existing one.
  Future<Conversation> startConversation({required String childId, required String teacherId});

  /// Up to 50 messages, oldest first; [before] pages back from an earlier message's time.
  Future<MessagePage> messages(String conversationId, {DateTime? before});
  Future<ChatMessage> sendMessage(String conversationId, String body);
  Future<void> markConversationRead(String conversationId);

  /// The academic calendar for the children's classes between [from] and [to] (default: today
  /// and the next 90 days).
  Future<CalendarRange> calendar({DateTime? from, DateTime? to});

  /// The subjects of [childId]'s class (`GET /v1/parent/children/:id/subjects`).
  Future<List<Subject>> childSubjects(String childId);

  /// A subject's syllabus, or null when the subject is not linked to a library course yet.
  Future<CourseOutline?> syllabus(String subjectId);

  /// How much of [subjectId]'s syllabus the class [sectionId] has been taught.
  Future<Coverage> coverage({required String sectionId, required String subjectId});

  /// The class [sectionId]'s year plan for [subjectId] with its progress, or null when the
  /// teacher has not made one (`GET /v1/year-plans`).
  Future<YearPlan?> yearPlan({required String sectionId, required String subjectId});

  /// What [childId] handed in for homework [homeworkId] (status null: nothing yet).
  Future<Submission> submission(String homeworkId, String childId);

  /// Hands in [text] and up to five photos or PDFs for [childId] (multipart), reporting bytes
  /// sent. The server allows it for a child without their own login.
  Future<Submission> submitHomework(
    String homeworkId,
    String childId, {
    required String text,
    List<UploadFile> files = const [],
    void Function(int sent, int total)? onProgress,
  });

  /// Where a handed-in file is served, with the headers to fetch it.
  ({Uri url, Map<String, String> headers}) submissionFile(String homeworkId, String childId, int index);

  /// A child's privacy decisions (`GET /v1/consents?studentId=`).
  Future<Consents> consents(String childId);

  /// Records one decision for [childId]; returns them all.
  Future<Consents> setConsent(String childId, ConsentPurpose purpose, {required bool granted});

  /// Registers this device for push notifications to the Parent App (`POST /v1/push/devices`).
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
  Future<List<LmsCourseSummary>> lmsCourses(String childId);

  /// One course: modules, content, announcements and the grade breakdown (`GET /v1/lms/courses/:id`).
  Future<LmsCourseDetail> lmsCourse(String courseId, String childId);
}

/// Lets the lesson player load recordings through a [ParentApi].
class ParentLessonSource implements LessonSource {
  ParentLessonSource(this.api);

  final ParentApi api;

  Future<T> _guard<T>(Future<T> Function() f) async {
    try {
      return await f();
    } on ApiException catch (e) {
      throw LessonLoadException(
        e.status == 404 ? 'This recording is no longer shared with the class.' : e.message,
        describe: (context) => e.status == 404 ? context.l10n.recordingNotShared : context.errorText(e),
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

class HttpParentApi implements ParentApi {
  HttpParentApi({required this.baseUrl, http.Client? client}) : _http = client ?? http.Client();

  @override
  String baseUrl;
  @override
  String? token;
  final http.Client _http;

  /// Called when the server rejects the token (expired or revoked), so the app can sign out.
  void Function()? onUnauthorized;

  /// A random id made once per install; the server keeps only a hash of it (device trust).
  String? deviceId;

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
  Future<List<Child>> children() async => [
    for (final c in await _send('GET', '/v1/parent/children') as List) Child.fromJson(c as Map<String, dynamic>),
  ];

  @override
  Future<({Homework homework, String sectionId, Subject subject})> homeworkById(String id) async {
    final j = await _send('GET', '/v1/homework/$id') as Map<String, dynamic>;
    return (
      homework: Homework.fromJson({
        ...j,
        'subject': (j['subject'] as Map<String, dynamic>)['name'],
        'teacher': (j['createdBy'] as Map<String, dynamic>)['fullName'],
      }),
      sectionId: (j['section'] as Map<String, dynamic>)['id'] as String,
      subject: Subject.fromJson(j['subject'] as Map<String, dynamic>),
    );
  }

  @override
  Future<List<Subject>> childSubjects(String childId) async => [
    for (final s in await _send('GET', '/v1/parent/children/$childId/subjects') as List) Subject.fromJson(s as Map<String, dynamic>),
  ];

  @override
  Future<ChildSummary> summary(String childId, {int days = 30}) async =>
      ChildSummary.fromJson(await _send('GET', '/v1/parent/children/$childId/summary?days=$days'));

  @override
  Future<AiUpdate> aiUpdate(String childId, {required String language}) async =>
      AiUpdate.fromJson(await _send('POST', '/v1/ai/parent/children/$childId/insight', body: {'language': language}) as Map<String, dynamic>);

  @override
  Future<List<ClassMark>> attendance(String childId, {int days = 30}) async => [
    for (final m in await _send('GET', '/v1/parent/children/$childId/attendance?days=$days') as List)
      ClassMark.fromJson(m as Map<String, dynamic>),
  ];

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
  Future<StudentFees> fees(String childId) async =>
      StudentFees.fromJson(await _send('GET', '/v1/fees/students/$childId') as Map<String, dynamic>);

  @override
  Future<BoardingView> boarding(String childId) async => BoardingView.fromJson(await _send('GET', '/v1/hostel/students/$childId') as Map<String, dynamic>);

  @override
  Future<WalletView> wallet(String childId) async => WalletView.fromJson(await _send('GET', '/v1/canteen/students/$childId') as Map<String, dynamic>);

  @override
  Future<FeeCheckout> walletCheckout(String childId, int amountPaise) async {
    final j = await _send('POST', '/v1/canteen/students/$childId/topup-checkout', body: {'amountPaise': amountPaise}) as Map<String, dynamic>;
    return FeeCheckout.fromJson({...j, 'paymentId': j['topupId']});
  }

  @override
  Future<int> confirmWalletTopUp(String topUpId, {required String providerPaymentId, required String signature}) async =>
      ((await _send('POST', '/v1/canteen/topups/$topUpId/confirm', body: {'providerPaymentId': providerPaymentId, 'signature': signature})
              as Map<String, dynamic>)['balancePaise']
          as num)
          .toInt();

  @override
  Future<FeeCheckout> checkout(String invoiceId, {int? amountPaise}) async => FeeCheckout.fromJson(
    await _send('POST', '/v1/fees/invoices/$invoiceId/checkout', body: {'amountPaise': ?amountPaise}) as Map<String, dynamic>,
  );

  @override
  Future<FeeReceipt> confirmPayment(String paymentId, {required String providerPaymentId, required String signature}) async =>
      FeeReceipt.fromJson(
        await _send('POST', '/v1/fees/payments/$paymentId/confirm', body: {'providerPaymentId': providerPaymentId, 'signature': signature})
            as Map<String, dynamic>,
      );

  @override
  Future<FeeReceipt> receipt(String paymentId) async =>
      FeeReceipt.fromJson(await _send('GET', '/v1/fees/payments/$paymentId/receipt') as Map<String, dynamic>);

  @override
  Future<List<ExamSession>> exams(String childId) async {
    final j = await _send('GET', '/v1/results/students/$childId/exams') as Map<String, dynamic>;
    return [for (final e in j['sessions'] as List) ExamSession.fromJson((e as Map).cast<String, dynamic>())];
  }

  @override
  Future<ExamResults> examResults(String childId) async => ExamResults.fromJson(await _send('GET', '/v1/results/students/$childId') as Map<String, dynamic>);

  @override
  Future<Uint8List> hallTicketPdf(String sessionId, String childId) => _download('/v1/exam-sessions/$sessionId/hall-tickets/$childId/pdf');

  @override
  Future<void> requestRevaluation(String childId, {required String sessionId, required String subjectId, required String reason}) =>
      _send('POST', '/v1/results/students/$childId/revaluations', body: {'sessionId': sessionId, 'subjectId': subjectId, 'reason': reason});

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
  Future<StudentBus> bus(String childId) async =>
      StudentBus.fromJson(await _send('GET', '/v1/transport/students/$childId') as Map<String, dynamic>);

  @override
  Future<LibraryAccount> library(String childId) async =>
      LibraryAccount.fromJson(await _send('GET', '/v1/library/students/$childId') as Map<String, dynamic>);

  @override
  Future<CareerOverview> careerOverview(String childId) async =>
      CareerOverview.fromJson(await _send('GET', '/v1/placements/students/$childId/overview') as Map<String, dynamic>);

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
  Future<List<DiaryEntry>> diary(String childId) async =>
      [for (final e in await _send('GET', '/v1/parent/children/$childId/diary') as List) DiaryEntry.fromJson((e as Map).cast<String, dynamic>())];

  @override
  Future<void> acknowledgeDiary(String childId, String entryId) async => _send('POST', '/v1/parent/children/$childId/diary/$entryId/acknowledge');

  @override
  Future<ParentVisibility> visibility() async => ParentVisibility.fromJson((await _send('GET', '/v1/parent/visibility') as Map).cast<String, dynamic>());

  @override
  Future<ChildActivities> activities(String childId) async => ChildActivities.fromJson((await _send('GET', '/v1/parent/children/$childId/activities') as Map).cast<String, dynamic>());

  @override
  Future<ChildBehaviour> behaviour(String childId) async => ChildBehaviour.fromJson((await _send('GET', '/v1/parent/children/$childId/behaviour') as Map).cast<String, dynamic>());

  @override
  Future<List<SchoolNotice>> schoolNotices() async => [for (final n in await _send('GET', '/v1/discipline/my-notices') as List) SchoolNotice.fromJson((n as Map).cast<String, dynamic>())];

  @override
  Future<void> acknowledgeNotice(String noticeId) async => _send('POST', '/v1/discipline/parent-contacts/$noticeId/acknowledge');

  @override
  Future<List<PtmEvent>> ptmEvents() async => [for (final e in await _send('GET', '/v1/ptm/events') as List) PtmEvent.fromJson((e as Map).cast<String, dynamic>())];

  @override
  Future<List<PtmSlot>> ptmSlots(String eventId, String childId) async =>
      [for (final s in await _send('GET', '/v1/ptm/events/$eventId/slots?studentId=$childId') as List) PtmSlot.fromJson((s as Map).cast<String, dynamic>())];

  @override
  Future<List<PtmBooking>> ptmBookings() async =>
      [for (final b in await _send('GET', '/v1/ptm/my-bookings') as List) PtmBooking.fromJson((b as Map).cast<String, dynamic>())];

  @override
  Future<void> ptmBook(String slotId, String childId) async => _send('POST', '/v1/ptm/slots/$slotId/book', body: {'studentId': childId});

  @override
  Future<void> ptmCancel(String slotId) async => _send('POST', '/v1/ptm/slots/$slotId/cancel');

  @override
  Future<void> ptmReschedule(String slotId, String toSlotId) async => _send('POST', '/v1/ptm/slots/$slotId/reschedule', body: {'toSlotId': toSlotId});

  @override
  Future<EarlyYearsView> earlyYears(String childId) async =>
      EarlyYearsView.fromJson(await _send('GET', '/v1/parent/children/$childId/early-years') as Map<String, dynamic>);

  @override
  Future<List<TermInfo>> terms() async => [for (final t in await _send('GET', '/v1/terms') as List) TermInfo.fromJson((t as Map).cast<String, dynamic>())];

  @override
  Future<Uint8List> learningStoryPdf(String childId, String termId) => _download('/v1/parent/children/$childId/early-years/learning-story.pdf?termId=$termId');

  @override
  Future<HealthRecord> health(String childId) async => HealthRecord.fromJson(await _send('GET', '/v1/parent/children/$childId/health') as Map<String, dynamic>);

  @override
  Future<OutcomePassport> passport(String childId) async => OutcomePassport.fromJson(await _send('GET', '/v1/passport/me?studentId=$childId') as Map<String, dynamic>);

  @override
  Future<Uint8List> passportPdf(String childId) => _download('/v1/passport/students/$childId/pdf');

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
  Future<List<ReportCardRow>> reportCards(String childId) async =>
      [for (final r in await _send('GET', '/v1/school/report-cards?studentId=$childId') as List) ReportCardRow.fromJson((r as Map).cast<String, dynamic>())];

  @override
  Future<ReportCardDetail> reportCard(String id) async => ReportCardDetail.fromJson(await _send('GET', '/v1/school/report-cards/$id') as Map<String, dynamic>);

  @override
  Future<Uint8List> reportCardPdf(String id) => _download('/v1/school/report-cards/$id/pdf');

  @override
  Future<List<Survey>> surveys() async => [for (final s in await _send('GET', '/v1/surveys/mine') as List) Survey.fromJson((s as Map).cast<String, dynamic>())];

  @override
  Future<void> answerSurvey(String surveyId, List<SurveyAnswer> answers) async =>
      _send('POST', '/v1/surveys/$surveyId/responses', body: {'answers': [for (final a in answers) a.toJson()]});

  @override
  Future<List<CampusEvent>> campusEvents(String childId) async =>
      [for (final e in await _send('GET', '/v1/campus-life/me/events?studentId=$childId') as List) CampusEvent.fromJson((e as Map).cast<String, dynamic>())];

  @override
  Future<void> registerForEvent(String eventId, String childId) async => _send('POST', '/v1/campus-life/events/$eventId/register', body: {'studentId': childId});

  @override
  Future<void> cancelEventRegistration(String eventId, String childId) async =>
      _send('POST', '/v1/campus-life/events/$eventId/cancel-registration', body: {'studentId': childId});

  @override
  Future<List<EventPass>> eventPasses(String childId) async =>
      [for (final r in await _send('GET', '/v1/campus-life/me/registrations?studentId=$childId') as List) EventPass.fromJson((r as Map).cast<String, dynamic>())];

  @override
  Future<void> giveEventFeedback(String eventId, String childId, {required int rating, String comment = ''}) async =>
      _send('POST', '/v1/campus-life/events/$eventId/feedback', body: {'studentId': childId, 'rating': rating, 'comment': comment});

  @override
  Future<ChildMarks> marks(String childId) async =>
      ChildMarks.fromJson(await _send('GET', '/v1/marks/students/$childId') as Map<String, dynamic>);

  @override
  Future<List<ChildContacts>> contacts() async {
    final j = await _send('GET', '/v1/conversations/contacts') as Map<String, dynamic>;
    return [for (final c in (j['asFamily'] as List? ?? const [])) ChildContacts.fromJson(c as Map<String, dynamic>)];
  }

  @override
  Future<List<Conversation>> conversations() async => [
    for (final c in await _send('GET', '/v1/conversations') as List) Conversation.fromJson(c as Map<String, dynamic>),
  ];

  @override
  Future<Conversation> startConversation({required String childId, required String teacherId}) async => Conversation.fromJson(
    await _send('POST', '/v1/conversations', body: {'studentId': childId, 'withUserId': teacherId}) as Map<String, dynamic>,
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
  Future<CalendarRange> calendar({DateTime? from, DateTime? to}) async {
    final q = [if (from != null) 'from=${isoDate(from)}', if (to != null) 'to=${isoDate(to)}'].join('&');
    return CalendarRange.fromJson(await _send('GET', '/v1/calendar${q.isEmpty ? '' : '?$q'}') as Map<String, dynamic>);
  }

  @override
  Future<CourseOutline?> syllabus(String subjectId) async {
    final j = await _send('GET', '/v1/content/syllabus?subjectId=$subjectId');
    return j == null ? null : CourseOutline.fromJson(j as Map<String, dynamic>);
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
  Future<Submission> submission(String homeworkId, String childId) async =>
      Submission.fromJson(await _send('GET', '/v1/homework/$homeworkId/submissions/$childId') as Map<String, dynamic>);

  @override
  Future<Submission> submitHomework(
    String homeworkId,
    String childId, {
    required String text,
    List<UploadFile> files = const [],
    void Function(int sent, int total)? onProgress,
  }) async {
    final form = http.MultipartRequest('POST', Uri.parse('$baseUrl/v1/homework/$homeworkId/submissions/$childId'))
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
  ({Uri url, Map<String, String> headers}) submissionFile(String homeworkId, String childId, int index) => (
    url: Uri.parse('$baseUrl/v1/homework/$homeworkId/submissions/$childId/files/$index'),
    headers: {if (token != null) 'authorization': 'Bearer $token'},
  );

  @override
  Future<Consents> consents(String childId) async => Consents.fromJson(await _send('GET', '/v1/consents?studentId=$childId') as Map<String, dynamic>);

  @override
  Future<void> registerPushDevice({required String token, required String platform}) async =>
      _send('POST', '/v1/push/devices', body: {'token': token, 'platform': platform, 'app': 'parent'});

  @override
  Future<void> removePushDevice(String token) async => _send('DELETE', '/v1/push/devices', body: {'token': token});

  @override
  Future<Consents> setConsent(String childId, ConsentPurpose purpose, {required bool granted}) async => Consents.fromJson(
    await _send('POST', '/v1/consents', body: {'studentId': childId, 'purpose': purpose.wire, 'granted': granted}) as Map<String, dynamic>,
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

  @override
  Future<void> renewLoan(String loanId) async => _send('POST', '/v1/library/loans/$loanId/renew');

  @override
  Future<void> rateMeal({required String mealDate, required String meal, required int rating, String comment = '', String? childId}) async =>
      _send('POST', '/v1/canteen/ops/feedback', body: {'mealDate': mealDate, 'meal': meal, 'rating': rating, 'comment': comment, 'studentId': ?childId});

  @override
  Future<List<RepairRequest>> repairRequests({String? childId}) async {
    final orders = [for (final r in await _send('GET', '/v1/hostel/work-orders/mine') as List) RepairRequest.fromJson((r as Map).cast<String, dynamic>())];
    if (childId == null) return orders;
    // The selected child's hostel complaints (whoever raised them) sit alongside the repairs raised from mine.
    final complaints = [for (final c in await _send('GET', '/v1/hostel/complaints?studentId=$childId') as List) RepairRequest.fromComplaint((c as Map).cast<String, dynamic>())];
    final seen = orders.map((o) => o.complaint).toSet();
    return [...orders, ...complaints.where((c) => !seen.contains(c.title))];
  }

  @override
  Future<List<InstalmentSchedule>> studentInstalments(String studentId) async =>
      [for (final p in await _send('GET', '/v1/fees/students/$studentId/instalments') as List) InstalmentSchedule.fromJson((p as Map).cast<String, dynamic>())];

  @override
  Future<InstalmentSchedule> instalments(String invoiceId) async =>
      InstalmentSchedule.fromJson(await _send('GET', '/v1/fees/invoices/$invoiceId/instalments') as Map<String, dynamic>);

  @override
  Future<String> deviceState() async {
    final id = deviceId;
    if (id == null) return 'none';
    final j = await _send('GET', '/v1/me/devices/status?deviceId=${Uri.encodeQueryComponent(id)}') as Map<String, dynamic>;
    return '${j['state']}';
  }

  @override
  Future<void> trustDevice(String label) async {
    final id = deviceId;
    if (id == null) return;
    await _send('POST', '/v1/me/devices/trust', body: {'deviceId': id, 'label': label, 'platform': defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android'});
  }

  Future<dynamic> _send(String method, String path, {Object? body, bool auth = true}) async {
    final req = http.Request(method, Uri.parse('$baseUrl$path'))
      ..headers['content-type'] = 'application/json'
      ..headers['accept'] = 'application/json';
    if (auth && token != null) req.headers['authorization'] = 'Bearer $token';
    if (deviceId != null) req.headers['x-device-id'] = deviceId!;
    if (body != null) req.body = jsonEncode(body);
    return _receive(req, auth: auth, timeout: const Duration(seconds: 20));
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
  Future<List<LmsCourseSummary>> lmsCourses(String childId) async =>
      [for (final c in await _send('GET', '/v1/lms/my?studentId=$childId') as List) LmsCourseSummary.fromJson((c as Map).cast<String, dynamic>())];

  @override
  Future<LmsCourseDetail> lmsCourse(String courseId, String childId) async =>
      LmsCourseDetail.fromJson(await _send('GET', '/v1/lms/courses/$courseId?studentId=$childId') as Map<String, dynamic>);
}
