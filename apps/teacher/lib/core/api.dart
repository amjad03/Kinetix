import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:kinetix_lesson/kinetix_lesson.dart';

import 'models.dart';

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
  ApiException(this.status, this.message, {this.kind = ApiErrorKind.server});

  /// HTTP status, or 0 when the server could not be reached.
  final int status;

  /// English, for logs; show AppLocalizations.errorText instead.
  final String message;
  final ApiErrorKind kind;

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
  Future<Me> me();

  /// Saves the teacher's language on the server (notifications and pushes use it).
  Future<Me> updatePreferredLanguage(String language);
  Future<DayTimetable> timetable({String? date});
  Future<List<TeacherClass>> classes();
  Future<List<Student>> roster(String sectionId);
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
  Future<Me> me() async => Me.fromJson(await _send('GET', '/v1/me'));

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
  Future<List<Student>> roster(String sectionId) async =>
      (await _send('GET', '/v1/sections/$sectionId/roster') as List).map((e) => Student.fromJson(e as Map<String, dynamic>)).toList();

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

  Future<dynamic> _send(String method, String path, {Object? body, bool auth = true}) async {
    final req = http.Request(method, Uri.parse('$baseUrl$path'))
      ..headers['content-type'] = 'application/json'
      ..headers['accept'] = 'application/json';
    if (auth && token != null) req.headers['authorization'] = 'Bearer $token';
    if (body != null) req.body = jsonEncode(body);

    final http.Response res;
    try {
      res = await http.Response.fromStream(await _http.send(req)).timeout(const Duration(seconds: 20));
    } on TimeoutException {
      throw ApiException(0, 'The server is taking too long to respond. Try again.', kind: ApiErrorKind.timeout);
    } catch (_) {
      throw ApiException(0, "Can't reach KINETIX. Check your internet connection and the server address.", kind: ApiErrorKind.offline);
    }

    if (res.statusCode >= 400) {
      if (res.statusCode == 401 && auth) onUnauthorized?.call();
      final m = _message(res);
      throw m == null ? ApiException(res.statusCode, 'HTTP ${res.statusCode}', kind: ApiErrorKind.http) : ApiException(res.statusCode, m);
    }
    return res.body.isEmpty ? null : jsonDecode(res.body);
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
