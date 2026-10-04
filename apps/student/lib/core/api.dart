import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:kinetix_lesson/kinetix_lesson.dart';

import 'models.dart';

class ApiException implements Exception {
  ApiException(this.status, this.message);

  /// HTTP status, or 0 when the server could not be reached.
  final int status;
  final String message;

  @override
  String toString() => message;
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
  Future<Me> me();

  /// The signed-in student's own record (class, roll no., program).
  Future<StudentProfile> student();

  /// Attendance, homework, shared boards and recordings over the last [days] days.
  Future<StudentSummary> summary(String studentId, {int days = 30});

  /// Every period's mark over the last [days] days, newest day first.
  Future<List<ClassMark>> attendance(String studentId, {int days = 30});

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

  /// The subject's syllabus, or null when the subject is not linked to a library course yet.
  Future<CourseOutline?> syllabus(String subjectId);

  Future<FeeAccount> fees(String studentId);
  Future<FeeReceipt> receipt(String paymentId);

  /// Registers this device for push notifications to the Student App.
  Future<void> registerPushDevice({required String token, required String platform});
  Future<void> removePushDevice(String token);
}

/// Lets the lesson player load recordings through a [StudentApi].
class StudentLessonSource implements LessonSource {
  StudentLessonSource(this.api);

  final StudentApi api;

  Future<T> _guard<T>(Future<T> Function() f) async {
    try {
      return await f();
    } on ApiException catch (e) {
      throw LessonLoadException(e.status == 404 ? 'This recording is no longer shared with your class.' : e.message);
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
    final j = await _send('POST', '/v1/auth/login', body: {'tenant': tenant, 'login': login, 'password': password}, auth: false);
    token = j['accessToken'] as String;
  }

  @override
  Future<Me> me() async => Me.fromJson(await _send('GET', '/v1/me'));

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
  Future<CourseOutline?> syllabus(String subjectId) async {
    final j = await _send('GET', '/v1/content/syllabus?subjectId=$subjectId');
    return j == null ? null : CourseOutline.fromJson(j as Map<String, dynamic>);
  }

  @override
  Future<FeeAccount> fees(String studentId) async => FeeAccount.fromJson(await _send('GET', '/v1/fees/students/$studentId'));

  @override
  Future<FeeReceipt> receipt(String paymentId) async => FeeReceipt.fromJson(await _send('GET', '/v1/fees/payments/$paymentId/receipt'));

  @override
  Future<void> registerPushDevice({required String token, required String platform}) async =>
      _send('POST', '/v1/push/devices', body: {'token': token, 'platform': platform, 'app': 'student'});

  @override
  Future<void> removePushDevice(String token) async => _send('DELETE', '/v1/push/devices', body: {'token': token});

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

    final http.Response res;
    try {
      res = await http.Response.fromStream(await _http.send(req)).timeout(timeout);
    } on TimeoutException {
      throw ApiException(0, 'The server is taking too long to respond. Try again.');
    } catch (_) {
      throw ApiException(0, "Can't reach KINETIX. Check your internet connection and the server address.");
    }

    if (res.statusCode >= 400) {
      if (res.statusCode == 401 && auth) onUnauthorized?.call();
      throw ApiException(res.statusCode, _message(res));
    }
    return res.body.isEmpty ? null : jsonDecode(res.body);
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
    return switch (res.statusCode) {
      403 => "You don't have access to this.",
      404 => 'Not found.',
      429 => 'Too many attempts. Wait a minute and try again.',
      _ => 'Something went wrong (${res.statusCode}). Try again.',
    };
  }
}
