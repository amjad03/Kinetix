import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart' show MediaType;
import 'package:kinetix_lesson/kinetix_lesson.dart';

import '../l10n/l10n.dart';
import 'models.dart';

/// Problems the app words itself (in the app's language, see l10n/l10n.dart).
enum ApiProblem { timeout, unreachable, wrongLogin, notGuardian, teacherAccount }

class ApiException implements Exception {
  ApiException(this.status, this.message, {this.problem, this.code});

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

  @override
  String toString() => message.isEmpty ? 'HTTP $status' : message;
}

/// Everything the Parent App asks of the KINETIX Cloud API. Tests use a fake.
abstract class ParentApi {
  String get baseUrl;
  set baseUrl(String value);

  /// User access token after sign-in.
  String? get token;
  set token(String? value);

  /// Signs in and stores the token on this client.
  Future<void> login({required String tenant, required String login, required String password});
  Future<Me> me();

  /// Saves the language for the app and for notifications (`PATCH /v1/me`).
  Future<Me> setPreferredLanguage(String language);
  Future<List<Child>> children();

  /// Attendance, homework, class participation and shared boards over the last [days] days.
  Future<ChildSummary> summary(String childId, {int days = 30});

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

  /// Books the child has out and has returned, with fines (`GET /v1/library/students/:id`).
  Future<LibraryAccount> library(String childId);

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

  /// A subject's syllabus, or null when the subject is not linked to a library course yet.
  Future<CourseOutline?> syllabus(String subjectId);

  /// How much of [subjectId]'s syllabus the class [sectionId] has been taught.
  Future<Coverage> coverage({required String sectionId, required String subjectId});

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
  Future<ChildSummary> summary(String childId, {int days = 30}) async =>
      ChildSummary.fromJson(await _send('GET', '/v1/parent/children/$childId/summary?days=$days'));

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
  Future<LibraryAccount> library(String childId) async =>
      LibraryAccount.fromJson(await _send('GET', '/v1/library/students/$childId') as Map<String, dynamic>);

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
  Future<Consents> setConsent(String childId, ConsentPurpose purpose, {required bool granted}) async => Consents.fromJson(
    await _send('POST', '/v1/consents', body: {'studentId': childId, 'purpose': purpose.wire, 'granted': granted}) as Map<String, dynamic>,
  );

  Future<dynamic> _send(String method, String path, {Object? body, bool auth = true}) async {
    final req = http.Request(method, Uri.parse('$baseUrl$path'))
      ..headers['content-type'] = 'application/json'
      ..headers['accept'] = 'application/json';
    if (auth && token != null) req.headers['authorization'] = 'Bearer $token';
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
      throw ApiException(res.statusCode, _message(res), code: _code(res));
    }
    return res.body.isEmpty ? null : jsonDecode(res.body);
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
}
