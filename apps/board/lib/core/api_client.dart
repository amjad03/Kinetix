import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

import 'package:kinetix_ink/kinetix_ink.dart';

import 'models.dart';
import 'recording/recordings.dart' show RecordingSummary;

class ApiException implements Exception {
  ApiException(this.status, this.message, {this.code, this.body = const {}});
  final int status;
  final String message;

  /// The API's stable error code (services/api/src/common/error-codes.ts), when it sent one.
  final String? code;

  /// The whole error body (e.g. `attemptsLeft` after a wrong PIN).
  final Map<String, dynamic> body;
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

  /// What the institution has set for its boards: kiosk mode and the IT PIN's hash (the `kiosk` object).
  Future<Map<String, dynamic>> boardConfig() async => await _send('GET', '/v1/devices/me/config', useDeviceToken: true) as Map<String, dynamic>;

  Future<void> endSession() async => _send('POST', '/v1/sessions/current/end');

  // --- Shared-board profiles (features/profiles; docs/architecture/board-profiles.md) -------

  /// The teachers who have signed in on this board, with each PIN's salt and hash for offline checks.
  Future<List<Map<String, dynamic>>> boardProfiles() async =>
      (await _send('GET', '/v1/devices/me/profiles', useDeviceToken: true) as List<dynamic>).cast<Map<String, dynamic>>();

  /// The signed-in teacher sets their PIN for this board. Answers with the new hash's parts.
  Future<Map<String, dynamic>> setProfilePin(String pin) async => await _send('PUT', '/v1/devices/me/profiles/me/pin', body: {'pin': pin}) as Map<String, dynamic>;

  /// Switches the board to [userId]'s profile: a new class session, as after pairing.
  Future<({String sessionToken, Map<String, dynamic> session})> unlockProfile(String userId, String pin) async {
    final j = await _send('POST', '/v1/devices/me/profiles/$userId/unlock', body: {'pin': pin}, useDeviceToken: true) as Map<String, dynamic>;
    return (sessionToken: j['sessionToken'] as String, session: j['session'] as Map<String, dynamic>);
  }

  /// The signed-in teacher takes their profile off this board.
  Future<void> removeMyProfile() async => _send('DELETE', '/v1/devices/me/profiles/me');

  /// "Go live": opens (or closes) the board to the class's students in the Student App.
  Future<void> setClassLive(bool on) async => _send('POST', '/v1/sessions/current/live', body: {'on': on});

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
  /// Sends queued classroom operations. Ops from the current class go with the session token;
  /// ops from an earlier class on this board (after a restart, or once the class has ended) go
  /// with the device token and that class's [sessionId].
  Future<({Set<String> done, Map<String, String> rejected})> pushOps(List<Map<String, dynamic>> ops, {String? sessionId, bool useDeviceToken = false}) async {
    final j =
        await _send('POST', '/v1/sync/push', body: {'sessionId': ?sessionId, 'ops': ops}, useDeviceToken: useDeviceToken) as Map<String, dynamic>;
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

  /// Gives [studentId] a badge (one of the board's ten badge types, e.g. `star`) in the class
  /// [sectionId] (the open class when the server knows it from the session).
  Future<void> awardBadge(String studentId, String badgeType, {String? sectionId}) async =>
      _send('POST', '/v1/badges', body: {'studentId': studentId, 'sectionId': ?sectionId, 'badge': badgeType});

  Future<void> markDisplayed(String id) async => _send('POST', '/v1/broadcasts/$id/displayed');
  Future<void> acknowledge(String id) async => _send('POST', '/v1/broadcasts/$id/ack');

  // --- KINETIX AI (board-session token; the class and subject come from the session) --------

  Future<AiResult<Explanation>> explain(String question, AiLanguage language, {bool fresh = false, String? topicId}) =>
      _ai('explain', {'question': question, 'language': language.name, 'fresh': fresh, 'topicId': ?topicId}, Explanation.fromJson);

  Future<AiResult<Quiz>> quiz(
    String topic, {
    required int count,
    required AiDifficulty difficulty,
    required AiLanguage language,
    bool fresh = false,
    String? topicId,
  }) =>
      _ai(
        'quiz',
        {'topic': topic, 'count': count, 'difficulty': difficulty.name, 'language': language.name, 'fresh': fresh, 'topicId': ?topicId},
        (j) => Quiz.fromJson(topic, j),
      );

  // --- Content library ------------------------------------------------------------------------

  /// The syllabus of the class open on the board, or null when its subject is not linked yet.
  Future<Syllabus?> syllabus() async {
    final j = await _send('GET', '/v1/content/syllabus');
    return j is Map<String, dynamic> && j.isNotEmpty ? Syllabus.fromJson(j) : null;
  }

  /// Which topics the open class has been taught, or null in a free session (no class open).
  Future<Coverage?> coverage() async {
    try {
      final j = await _send('GET', '/v1/coverage');
      return j is Map<String, dynamic> ? Coverage.fromJson(j) : null;
    } on ApiException catch (e) {
      if (e.status == 400) return null;
      rethrow;
    }
  }

  /// Marks a topic as taught today to the open class (by the signed-in teacher).
  Future<void> markTopicTaught(String topicId) async => _send('POST', '/v1/coverage', body: {'topicId': topicId});

  /// Undoes [markTopicTaught].
  Future<void> unmarkTopicTaught(String topicId) async => _send('DELETE', '/v1/coverage', body: {'topicId': topicId});

  /// The lesson plan for the period open on the board, or null in a free session.
  Future<PeriodLessonPlan?> currentLessonPlan() async {
    final j = await _send('GET', '/v1/lesson-plans/current');
    return j is Map<String, dynamic> && j.isNotEmpty ? PeriodLessonPlan.fromJson(j) : null;
  }

  /// Concept videos (YouTube) for the board's current or next period today, as JSON
  /// (features/concept_videos parses it). Works with the device token too.
  Future<Map<String, dynamic>> conceptVideosNow() async => await _send('GET', '/v1/devices/me/concept-videos') as Map<String, dynamic>;

  /// A topic's concept videos, the class's language first, as JSON.
  Future<Map<String, dynamic>> topicConceptVideos(String topicId) async => await _send('GET', '/v1/content/topics/$topicId/videos') as Map<String, dynamic>;

  Future<TopicDetail> topic(String id) async => TopicDetail.fromJson(await _send('GET', '/v1/content/topics/$id') as Map<String, dynamic>);

  Future<AiResult<HomeworkDraft>> homeworkDraft(
    String topic, {
    required int count,
    required AiDifficulty difficulty,
    required AiLanguage language,
    bool fresh = false,
  }) => _ai('homework', {'topic': topic, 'count': count, 'difficulty': difficulty.name, 'language': language.name, 'fresh': fresh}, HomeworkDraft.fromJson);

  Future<AiResult<LessonPlan>> lessonPlan(String topic, {required int minutes, required AiLanguage language, bool fresh = false}) =>
      _ai('lesson-plan', {'topic': topic, 'minutes': minutes, 'language': language.name, 'fresh': fresh}, LessonPlan.fromJson);

  /// Reads the handwriting on a board page (PNG, base64).
  Future<AiResult<BoardReading>> readBoard(String pngBase64, AiLanguage language) =>
      _ai('read-board', {'image': pngBase64, 'language': language.name}, BoardReading.fromJson);

  Future<AiResult<T>> _ai<T>(String task, Map<String, dynamic> body, T Function(Map<String, dynamic>) parse) async {
    final j = await _send('POST', '/v1/ai/$task', body: body) as Map<String, dynamic>;
    return AiResult(parse(j['result'] as Map<String, dynamic>), AiMeta.fromJson(j['meta'] as Map<String, dynamic>));
  }

  /// Gives homework to the class open on the board; students and parents are notified.
  Future<void> homeworkFromBoard({required String title, String? instructions, required DateTime dueOn}) async {
    final due = '${dueOn.year}-${dueOn.month.toString().padLeft(2, '0')}-${dueOn.day.toString().padLeft(2, '0')}';
    await _send('POST', '/v1/homework/from-board', body: {'title': title, 'instructions': ?instructions, 'dueOn': due});
  }

  // --- Class questions and answer cards (features/class_check) -----------------------------

  /// Opens a question in the class on the board ([id] chosen here, so a retry asks once).
  Future<Map<String, dynamic>> openPoll(String id, Map<String, dynamic> body) async => await _send('PUT', '/v1/polls/$id', body: body) as Map<String, dynamic>;

  /// Answers read from answer cards: `{cardNo, choice}` each.
  Future<Map<String, dynamic>> pollCards(String id, List<Map<String, int>> answers) async =>
      await _send('POST', '/v1/polls/$id/cards', body: {'answers': answers}) as Map<String, dynamic>;

  Future<Map<String, dynamic>> closePoll(String id) async => await _send('POST', '/v1/polls/$id/close') as Map<String, dynamic>;

  /// The answer cards of the class open on the board (card number → student).
  Future<Map<String, dynamic>> answerCards() async => await _send('GET', '/v1/answer-cards/current') as Map<String, dynamic>;

  // --- Phone remote (features/remote) ---------------------------------------------------------

  /// A photo the teacher sent from the phone remote; fetched once.
  Future<Uint8List> remotePhoto(String id) async {
    final req = http.Request('GET', Uri.parse('$baseUrl/v1/remote/photos/$id'));
    final token = sessionToken ?? deviceToken;
    if (token != null) req.headers['authorization'] = 'Bearer $token';
    final res = await http.Response.fromStream(await _http.send(req));
    if (res.statusCode >= 400) _decode(res);
    return res.bodyBytes;
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
      var body = const <String, dynamic>{};
      try {
        body = (jsonDecode(res.body) as Map).cast<String, dynamic>();
        final m = body['message'];
        if (m is String) message = m;
      } catch (_) {}
      throw ApiException(res.statusCode, message, code: body['code'] as String?, body: body);
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
