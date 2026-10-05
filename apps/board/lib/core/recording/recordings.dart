import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/painting.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import '../api_client.dart';
import '../models.dart';
import 'lesson_capture.dart';
import 'recording_store.dart';
import 'voice_recorder.dart';

/// A recording as `GET /v1/recordings` lists it.
class RecordingSummary {
  RecordingSummary({
    required this.id,
    required this.title,
    required this.startedAt,
    this.durationMs,
    this.hasAudio = false,
    this.sectionId,
    this.sectionName,
    this.subjectName,
    this.sharedAt,
    this.finishedAt,
  });

  factory RecordingSummary.fromJson(Map<String, dynamic> j) => RecordingSummary(
    id: j['id'] as String,
    title: j['title'] as String,
    startedAt: DateTime.parse(j['startedAt'] as String),
    durationMs: j['durationMs'] as int?,
    hasAudio: j['hasAudio'] as bool? ?? false,
    sectionId: j['sectionId'] as String?,
    sectionName: j['sectionName'] as String?,
    subjectName: j['subjectName'] as String?,
    sharedAt: j['sharedAt'] == null ? null : DateTime.parse(j['sharedAt'] as String),
    finishedAt: j['finishedAt'] == null ? null : DateTime.parse(j['finishedAt'] as String),
  );

  final String id;
  final String title;
  final DateTime startedAt;
  final int? durationMs;
  final bool hasAudio;
  final String? sectionId;
  final String? sectionName;
  final String? subjectName;
  final DateTime? sharedAt;
  final DateTime? finishedAt;
}

enum RecordingStatus { waiting, uploading, uploaded, shared, failed }

/// A recording saved on this board, and how far its upload got. Stored as `meta.json`.
class LocalRecording {
  LocalRecording({
    required this.id,
    required this.title,
    required this.startedAt,
    required this.durationMs,
    required this.language,
    required this.share,
    required this.teacherId,
    required this.teacherName,
    required this.hasAudio,
    required this.savedAt,
    this.sessionId,
    this.sectionName,
    this.created = false,
    this.eventsSent = false,
    this.audioSent = false,
    this.finishedAt,
    this.sharedAt,
    this.notShared,
    this.error,
    this.failed = false,
  });

  factory LocalRecording.fromJson(Map<String, dynamic> j) => LocalRecording(
    id: j['id'] as String,
    title: j['title'] as String,
    startedAt: DateTime.parse(j['startedAt'] as String),
    durationMs: j['durationMs'] as int,
    language: j['language'] as String? ?? 'en',
    share: j['share'] as bool? ?? false,
    teacherId: j['teacherId'] as String,
    teacherName: j['teacherName'] as String? ?? '',
    hasAudio: j['hasAudio'] as bool? ?? false,
    savedAt: DateTime.parse(j['savedAt'] as String),
    sessionId: j['sessionId'] as String?,
    sectionName: j['sectionName'] as String?,
    created: j['created'] as bool? ?? false,
    eventsSent: j['eventsSent'] as bool? ?? false,
    audioSent: j['audioSent'] as bool? ?? false,
    finishedAt: j['finishedAt'] == null ? null : DateTime.parse(j['finishedAt'] as String),
    sharedAt: j['sharedAt'] == null ? null : DateTime.parse(j['sharedAt'] as String),
    notShared: j['notShared'] as String?,
    error: j['error'] as String?,
    failed: j['failed'] as bool? ?? false,
  );

  final String id;
  String title;
  final DateTime startedAt;
  final int durationMs;
  final String language;

  /// Share with the class once uploaded.
  bool share;
  final String teacherId;
  final String teacherName;
  final bool hasAudio;
  final DateTime savedAt;
  final String? sessionId;
  String? sectionName;

  // Upload progress. Each step is idempotent on the server, so a step is simply redone if the
  // board stopped before writing it down.
  bool created;
  bool eventsSent;
  bool audioSent;
  DateTime? finishedAt;
  DateTime? sharedAt;

  /// Why the recording was uploaded without sharing it, although sharing was asked for.
  String? notShared;

  /// The last upload error, shown in the Recordings list.
  String? error;

  /// The server refused the recording; it is not retried until the teacher asks.
  bool failed;

  bool get uploaded => finishedAt != null;

  Map<String, dynamic> toJson() => {
    'id': id,
    'title': title,
    'startedAt': startedAt.toUtc().toIso8601String(),
    'durationMs': durationMs,
    'language': language,
    'share': share,
    'teacherId': teacherId,
    'teacherName': teacherName,
    'hasAudio': hasAudio,
    'savedAt': savedAt.toUtc().toIso8601String(),
    'sessionId': sessionId,
    'sectionName': sectionName,
    'created': created,
    'eventsSent': eventsSent,
    'audioSent': audioSent,
    'finishedAt': finishedAt?.toUtc().toIso8601String(),
    'sharedAt': sharedAt?.toUtc().toIso8601String(),
    'notShared': notShared,
    'error': error,
    'failed': failed,
  };
}

/// Lesson recordings on this board and the queue that uploads them to KINETIX Cloud.
///
/// Uploads need the board-session token of the teacher who recorded, which ends with the
/// class. So the queue uploads eagerly: as soon as a recording is saved, and again when the
/// teacher ends the class (before the session is closed). Whatever is still pending then (the
/// board was offline) waits on disk and uploads the next time the same teacher signs in on
/// this board, when the connection comes back, or on the next app start. Recordings are sent in
/// the order they were saved: create → events → audio → finish(share). Failures are retried with
/// backoff (5 s doubling to 5 min); a 4xx other than an ended session marks the recording
/// failed until the teacher taps Retry.
///
/// After a successful finish the event log and audio are deleted from the board (the cloud
/// keeps them, and the board's disk is shared by every class); the small metadata file stays
/// [keepUploaded] so the list can show what was uploaded.
class Recordings extends ChangeNotifier {
  Recordings({RecordingStore? store, VoiceRecorder Function()? voice, this.keepUploaded = const Duration(days: 7), DateTime Function()? clock})
    : _store = store ?? FileRecordingStore(),
      _voice = voice ?? MicVoiceRecorder.new,
      _now = clock ?? DateTime.now;

  final RecordingStore _store;
  final VoiceRecorder Function() _voice;
  final DateTime Function() _now;
  final Duration keepUploaded;

  ApiClient? Function() _api = () => null;
  SessionContext? Function() _session = () => null;

  /// Connects the queue to the board's API client and signed-in session.
  void attach({required ApiClient? Function() api, required SessionContext? Function() session}) {
    _api = api;
    _session = session;
  }

  final List<LocalRecording> _items = [];
  Future<void>? _loading;

  /// Saved recordings, newest first.
  List<LocalRecording> get items => List.unmodifiable(_items.reversed);

  /// Recordings not yet uploaded.
  int get pending => _items.where((r) => !r.uploaded && !r.failed).length;

  String? _uploadingId;
  int _sent = 0;
  int _total = 0;

  RecordingStatus statusOf(LocalRecording r) {
    if (r.uploaded) return r.sharedAt != null ? RecordingStatus.shared : RecordingStatus.uploaded;
    if (r.failed) return RecordingStatus.failed;
    if (_uploadingId == r.id) return RecordingStatus.uploading;
    return RecordingStatus.waiting;
  }

  /// 0..1 while [r] is uploading.
  double? progressOf(LocalRecording r) => _uploadingId == r.id && _total > 0 ? _sent / _total : null;

  /// Reads what is waiting on disk and starts uploading. Safe to call more than once.
  Future<void> load() => _loading ??= _load();

  Future<void> _load() async {
    try {
      final metas = await _store.loadAll();
      final cutoff = _now().subtract(keepUploaded);
      final loaded = <LocalRecording>[];
      for (final m in metas) {
        final r = LocalRecording.fromJson(m);
        if (r.uploaded && r.finishedAt!.isBefore(cutoff)) {
          await _store.delete(r.id);
        } else {
          loaded.add(r);
        }
      }
      loaded.sort((a, b) => a.savedAt.compareTo(b.savedAt));
      final known = _items.map((r) => r.id).toSet();
      _items.insertAll(0, loaded.where((r) => !known.contains(r.id)));
    } catch (e) {
      debugPrint('Recordings: could not read saved recordings: $e');
    }
    notifyListeners();
    unawaited(kick());
  }

  // --- Capturing ---------------------------------------------------------------------------

  /// A new capture of [board], ready to [LessonCapture.start].
  Future<LessonCapture> newCapture({required String id, required RecordableBoard board, required BoardBackground background, required Size canvas}) async {
    final audioPath = await _store.prepare(id);
    return LessonCapture(
      id: id,
      board: board,
      background: background,
      canvas: canvas,
      voice: _voice(),
      audioPath: audioPath,
      sessionId: _session()?.sessionId,
    );
  }

  /// Saves a capture to disk and queues it for upload.
  Future<LocalRecording> save(CapturedLesson c, {required String title, required bool share, required SessionContext teacher}) async {
    if (!c.hasAudio) await _deleteAudio(c.id);
    await _store.writeEvents(c.id, Uint8List.fromList(utf8.encode(jsonEncode(c.events))));
    final r = LocalRecording(
      id: c.id,
      title: title,
      startedAt: c.startedAt,
      durationMs: c.durationMs,
      language: teacher.language,
      share: share,
      teacherId: teacher.teacherId,
      teacherName: teacher.teacherName,
      hasAudio: c.hasAudio,
      savedAt: _now(),
      sessionId: c.sessionId,
      sectionName: teacher.sectionName,
    );
    await _store.writeMeta(r.id, r.toJson());
    _items.add(r);
    notifyListeners();
    unawaited(kick());
    return r;
  }

  Future<void> discard(String id) async {
    try {
      await _store.delete(id);
    } catch (_) {}
  }

  Future<void> _deleteAudio(String id) async {
    // Only the audio: deleteMedia also removes the event log, which is not written yet.
    if (await _store.audioLength(id) != null) await _store.deleteMedia(id);
  }

  // --- Uploading ---------------------------------------------------------------------------

  bool _running = false;
  Completer<void>? _idle;
  Timer? _retry;
  int _failures = 0;

  /// Delay before the next try after [failures] failed tries in a row.
  static Duration backoff(int failures) => Duration(seconds: math.min(300, 5 * (1 << math.min(failures - 1, 6))));

  /// Whether [r] can be uploaded now: its teacher is signed in on this board.
  bool _canUpload(LocalRecording r) {
    final s = _session();
    return !r.uploaded && !r.failed && s != null && s.teacherId == r.teacherId && _api()?.sessionToken != null;
  }

  /// Uploads whatever the signed-in teacher has waiting. Returns when the queue is idle.
  Future<void> kick() {
    if (_running) return _idle!.future;
    if (!_items.any(_canUpload)) return Future.value();
    _retry?.cancel();
    _running = true;
    _idle = Completer<void>();
    unawaited(_run());
    return _idle!.future;
  }

  /// Uploads the signed-in teacher's recordings before the class ends, for up to [timeout].
  /// Returns whether everything of theirs got uploaded.
  Future<bool> uploadBeforeSignOut({Duration timeout = const Duration(minutes: 2)}) async {
    final teacher = _session()?.teacherId;
    _failures = 0;
    try {
      await kick().timeout(timeout);
    } on TimeoutException {
      // Still uploading; it carries on while the session lasts and resumes at the next sign-in.
    }
    return !_items.any((r) => r.teacherId == teacher && !r.uploaded);
  }

  Future<void> _run() async {
    try {
      while (true) {
        final next = _items.where(_canUpload).firstOrNull;
        if (next == null) break;
        try {
          await _upload(next);
          _failures = 0;
        } on _SessionGone {
          break;
        } on ApiException catch (e) {
          if (_session() == null || e.status == 401) break; // the class ended mid-upload
          next.error = e.message;
          if (e.status >= 400 && e.status < 500 && e.status != 408 && e.status != 429) {
            next.failed = true;
            await _persist(next);
            continue;
          }
          await _persist(next);
          _scheduleRetry();
          break;
        } catch (e) {
          if (_session() == null) break;
          next.error = 'Could not reach KINETIX Cloud';
          await _persist(next);
          _scheduleRetry();
          break;
        } finally {
          _uploadingId = null;
          notifyListeners();
        }
      }
    } finally {
      _running = false;
      _idle?.complete();
      _idle = null;
    }
  }

  void _scheduleRetry() {
    _failures++;
    _retry?.cancel();
    _retry = Timer(backoff(_failures), () => unawaited(kick()));
  }

  ApiClient _apiOrThrow(LocalRecording r) {
    final api = _api();
    if (api == null || api.sessionToken == null || _session()?.teacherId != r.teacherId) throw _SessionGone();
    return api;
  }

  static bool _alreadyFinished(ApiException e) => e.status == 400 && e.message.contains('already finished');

  Future<void> _upload(LocalRecording r) async {
    _uploadingId = r.id;
    final audioBytes = r.hasAudio && !r.audioSent ? await _store.audioLength(r.id) ?? 0 : 0;
    final events = r.eventsSent ? null : await _store.readEvents(r.id);
    _total = (events?.length ?? 0) + audioBytes;
    _sent = 0;
    notifyListeners();

    // A recording created in a later class than it was made in would be filed under that
    // class, so it is not shared automatically; the teacher can share it from the list.
    final sameSession = r.sessionId != null && r.sessionId == _session()?.sessionId;
    if (!r.created) {
      final s = await _apiOrThrow(r).createRecording(r.id, title: r.title, startedAt: r.startedAt, language: r.language);
      r.created = true;
      r.sectionName = s.sectionName;
      if (r.share && !sameSession) {
        r.share = false;
        r.notShared = 'Uploaded in a later class. Share it from here if it is for ${s.sectionName ?? 'this class'}.';
      }
      await _persist(r);
    }

    var finished = false;
    if (events != null) {
      try {
        await _apiOrThrow(r).uploadRecordingEvents(r.id, events);
      } on ApiException catch (e) {
        if (!_alreadyFinished(e)) rethrow;
        finished = true;
      }
      r.eventsSent = true;
      _sent = events.length;
      notifyListeners();
      await _persist(r);
    }

    if (r.hasAudio && !r.audioSent && !finished) {
      final base = _sent;
      try {
        await _apiOrThrow(r).uploadRecordingAudio(
          r.id,
          _store.readAudio(r.id),
          audioBytes,
          onProgress: (n) {
            _sent = base + n;
            notifyListeners();
          },
        );
      } on ApiException catch (e) {
        if (!_alreadyFinished(e)) rethrow;
      }
      r.audioSent = true;
      await _persist(r);
    }

    RecordingSummary done;
    try {
      done = await _apiOrThrow(r).finishRecording(r.id, durationMs: r.durationMs, share: r.share);
    } on ApiException catch (e) {
      // 403: made without a timetabled class, so there is no one to share it with.
      if (!(r.share && e.status == 403)) rethrow;
      done = await _apiOrThrow(r).finishRecording(r.id, durationMs: r.durationMs, share: false);
      r.notShared = e.message;
    }
    r
      ..finishedAt = done.finishedAt ?? _now()
      ..sharedAt = done.sharedAt
      ..sectionName = done.sectionName ?? r.sectionName
      ..error = null;
    await _persist(r);
    try {
      await _store.deleteMedia(r.id);
    } catch (_) {}
  }

  Future<void> _persist(LocalRecording r) async {
    try {
      await _store.writeMeta(r.id, r.toJson());
    } catch (e) {
      debugPrint('Recordings: could not write ${r.id}: $e');
    }
    notifyListeners();
  }

  /// Tries a failed recording again.
  Future<void> retry(String id) {
    final r = _items.where((r) => r.id == id).firstOrNull;
    if (r == null) return Future.value();
    r
      ..failed = false
      ..error = null;
    _failures = 0;
    unawaited(_persist(r));
    return kick();
  }

  /// The signed-in teacher's recordings in the cloud.
  Future<List<RecordingSummary>> cloudList() async {
    final api = _api();
    if (api == null || api.sessionToken == null) return [];
    return api.recordings();
  }

  /// Shares an uploaded recording with its class.
  Future<RecordingSummary> share(String id) async {
    final api = _api();
    if (api == null || api.sessionToken == null) throw StateError('Sign in to share recordings');
    final s = await api.shareRecording(id);
    final r = _items.where((r) => r.id == id).firstOrNull;
    if (r != null) {
      r
        ..sharedAt = s.sharedAt
        ..notShared = null;
      await _persist(r);
    }
    return s;
  }

  @override
  void dispose() {
    _retry?.cancel();
    super.dispose();
  }
}

class _SessionGone implements Exception {}
