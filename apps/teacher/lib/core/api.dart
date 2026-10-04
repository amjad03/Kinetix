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
}

/// Lets the lesson player load recordings through a [TeacherApi].
class TeacherLessonSource implements LessonSource {
  TeacherLessonSource(this.api);

  final TeacherApi api;

  Future<T> _guard<T>(Future<T> Function() f) async {
    try {
      return await f();
    } on ApiException catch (e) {
      throw LessonLoadException(
        e.status == 404 ? 'This recording is not available yet. It may still be uploading from the board.' : e.message,
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
      // Zod validation errors: { formErrors, fieldErrors }
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
