import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

import 'package:kinetix_ink/kinetix_ink.dart';

import 'models.dart';
import 'recording/recordings.dart' show RecordingSummary;

class ApiException implements Exception {
  ApiException(this.status, this.message);
  final int status;
  final String message;
  @override
  String toString() => message;
}

/// KINETIX Cloud API, as seen by a board.
class ApiClient {
  ApiClient({required this.baseUrl, http.Client? client}) : _http = client ?? http.Client();

  final String baseUrl;
  final http.Client _http;

  /// Device token after enrolment.
  String? deviceToken;

  /// Board-session token while a teacher is paired. Takes precedence over [deviceToken].
  String? sessionToken;

  Future<({String deviceToken, String deviceName})> enroll(String code, String platform) async {
    final j = await _send('POST', '/v1/devices/enroll', body: {'code': code, 'platform': platform, 'appVersion': '0.1.0'}, auth: false);
    return (deviceToken: j['deviceToken'] as String, deviceName: (j['device'] as Map)['name'] as String);
  }

  Future<PairingCode> newPairingCode() async =>
      PairingCode.fromJson(await _send('POST', '/v1/devices/me/pairing-codes', useDeviceToken: true));

  Future<void> endSession() async => _send('POST', '/v1/sessions/current/end');

  Future<WhiteboardSummary> saveWhiteboard(String id, {required String title, required SavedBoard board, required bool share}) async {
    final j = await _send('PUT', '/v1/whiteboards/$id', body: {...board.toJson(), 'title': title, 'share': share});
    return WhiteboardSummary.fromJson(j as Map<String, dynamic>);
  }

  Future<List<WhiteboardSummary>> whiteboards() async {
    final list = await _send('GET', '/v1/whiteboards') as List<dynamic>;
    return list.map((e) => WhiteboardSummary.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<SavedBoard> whiteboard(String id) async {
    final j = await _send('GET', '/v1/whiteboards/$id') as Map<String, dynamic>;
    return SavedBoard.fromJson(j['content'] as Map<String, dynamic>);
  }

  Future<WhiteboardSummary> shareWhiteboard(String id) async =>
      WhiteboardSummary.fromJson(await _send('POST', '/v1/whiteboards/$id/share') as Map<String, dynamic>);

  Future<List<Student>> roster() async {
    final j = await _send('GET', '/v1/sessions/current') as Map<String, dynamic>;
    return (j['roster'] as List<dynamic>).map((e) => Student.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// Sends outbox operations. Returns the opIds the server has (applied or duplicate) and
  /// the ones it rejected; anything else should be retried.
  Future<({Set<String> done, Map<String, String> rejected})> pushOps(List<Map<String, dynamic>> ops) async {
    final j = await _send('POST', '/v1/sync/push', body: {'ops': ops}) as Map<String, dynamic>;
    final done = <String>{};
    final rejected = <String, String>{};
    for (final r in (j['results'] as List<dynamic>).cast<Map<String, dynamic>>()) {
      if (r['status'] == 'rejected') {
        rejected[r['opId'] as String] = r['reason'] as String? ?? 'rejected';
      } else {
        done.add(r['opId'] as String);
      }
    }
    return (done: done, rejected: rejected);
  }

  Future<List<BroadcastMessage>> pendingBroadcasts() async {
    final list = await _send('GET', '/v1/broadcasts/pending') as List<dynamic>;
    return list.map((e) => BroadcastMessage.fromJson(e as Map<String, dynamic>)).toList();
  }

  // --- Lesson recordings: PUT /:id → PUT /:id/events → PUT /:id/audio → POST /:id/finish ----

  /// Creates the recording (or renames it while it is unfinished). Idempotent.
  Future<RecordingSummary> createRecording(String id, {required String title, required DateTime startedAt, required String language}) async {
    final j = await _send('PUT', '/v1/recordings/$id', body: {'title': title, 'startedAt': startedAt.toUtc().toIso8601String(), 'language': language});
    return RecordingSummary.fromJson(j as Map<String, dynamic>);
  }

  /// The ink event log, sent as raw bytes (it can be larger than the API's JSON body limit).
  Future<void> uploadRecordingEvents(String id, Uint8List json) =>
      _sendRaw('PUT', '/v1/recordings/$id/events', 'application/octet-stream', json.length, Stream.value(json));

  /// The teacher's voice. [onProgress] gets the bytes sent so far.
  Future<void> uploadRecordingAudio(String id, Stream<List<int>> bytes, int length, {String mime = 'audio/mp4', void Function(int sent)? onProgress}) {
    var sent = 0;
    final counted = bytes.map((chunk) {
      sent += chunk.length;
      onProgress?.call(sent);
      return chunk;
    });
    return _sendRaw('PUT', '/v1/recordings/$id/audio', mime, length, counted);
  }

  Future<RecordingSummary> finishRecording(String id, {required int durationMs, required bool share}) async =>
      RecordingSummary.fromJson(await _send('POST', '/v1/recordings/$id/finish', body: {'durationMs': durationMs, 'share': share}) as Map<String, dynamic>);

  Future<RecordingSummary> shareRecording(String id) async =>
      RecordingSummary.fromJson(await _send('POST', '/v1/recordings/$id/share') as Map<String, dynamic>);

  /// The signed-in teacher's recordings, newest first.
  Future<List<RecordingSummary>> recordings() async {
    final list = await _send('GET', '/v1/recordings') as List<dynamic>;
    return list.map((e) => RecordingSummary.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> markDisplayed(String id) async => _send('POST', '/v1/broadcasts/$id/displayed');
  Future<void> acknowledge(String id) async => _send('POST', '/v1/broadcasts/$id/ack');

  // --- KINETIX AI (board-session token; the class and subject come from the session) --------

  Future<AiResult<Explanation>> explain(String question, AiLanguage language, {bool fresh = false}) =>
      _ai('explain', {'question': question, 'language': language.name, 'fresh': fresh}, Explanation.fromJson);

  Future<AiResult<Quiz>> quiz(String topic, {required int count, required AiDifficulty difficulty, required AiLanguage language, bool fresh = false}) =>
      _ai('quiz', {'topic': topic, 'count': count, 'difficulty': difficulty.name, 'language': language.name, 'fresh': fresh}, (j) => Quiz.fromJson(topic, j));

  Future<AiResult<HomeworkDraft>> homeworkDraft(
    String topic, {
    required int count,
    required AiDifficulty difficulty,
    required AiLanguage language,
    bool fresh = false,
  }) => _ai('homework', {'topic': topic, 'count': count, 'difficulty': difficulty.name, 'language': language.name, 'fresh': fresh}, HomeworkDraft.fromJson);

  Future<AiResult<LessonPlan>> lessonPlan(String topic, {required int minutes, required AiLanguage language, bool fresh = false}) =>
      _ai('lesson-plan', {'topic': topic, 'minutes': minutes, 'language': language.name, 'fresh': fresh}, LessonPlan.fromJson);

  Future<AiResult<T>> _ai<T>(String task, Map<String, dynamic> body, T Function(Map<String, dynamic>) parse) async {
    final j = await _send('POST', '/v1/ai/$task', body: body) as Map<String, dynamic>;
    return AiResult(parse(j['result'] as Map<String, dynamic>), AiMeta.fromJson(j['meta'] as Map<String, dynamic>));
  }

  /// Gives homework to the class open on the board; students and parents are notified.
  Future<void> homeworkFromBoard({required String title, String? instructions, required DateTime dueOn}) async {
    final due = '${dueOn.year}-${dueOn.month.toString().padLeft(2, '0')}-${dueOn.day.toString().padLeft(2, '0')}';
    await _send('POST', '/v1/homework/from-board', body: {'title': title, 'instructions': ?instructions, 'dueOn': due});
  }

  Future<dynamic> _send(String method, String path, {Object? body, bool auth = true, bool useDeviceToken = false}) async {
    final token = useDeviceToken ? deviceToken : (sessionToken ?? deviceToken);
    final req = http.Request(method, Uri.parse('$baseUrl$path'))
      ..headers['content-type'] = 'application/json'
      ..headers['accept'] = 'application/json';
    if (auth && token != null) req.headers['authorization'] = 'Bearer $token';
    if (body != null) req.body = jsonEncode(body);
    return _decode(await http.Response.fromStream(await _http.send(req)));
  }

  /// Sends a raw body (uploads), streamed so a long recording is never held in memory.
  Future<void> _sendRaw(String method, String path, String contentType, int length, Stream<List<int>> body) async {
    final req = _UploadRequest(method, Uri.parse('$baseUrl$path'), body)
      ..headers['content-type'] = contentType
      ..headers['accept'] = 'application/json'
      ..contentLength = length;
    final token = sessionToken ?? deviceToken;
    if (token != null) req.headers['authorization'] = 'Bearer $token';
    _decode(await http.Response.fromStream(await _http.send(req)));
  }

  dynamic _decode(http.Response res) {
    if (res.statusCode >= 400) {
      String message = 'Request failed (${res.statusCode})';
      try {
        final m = (jsonDecode(res.body) as Map)['message'];
        if (m is String) message = m;
      } catch (_) {}
      throw ApiException(res.statusCode, message);
    }
    return res.body.isEmpty ? null : jsonDecode(res.body);
  }
}

/// A request whose body is read from [body] as the connection takes it, so a long recording
/// is streamed from disk rather than held in memory.
class _UploadRequest extends http.BaseRequest {
  _UploadRequest(super.method, super.url, this.body);

  final Stream<List<int>> body;

  @override
  http.ByteStream finalize() {
    super.finalize();
    return http.ByteStream(body);
  }
}
