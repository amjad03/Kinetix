import 'dart:async';
import 'dart:io' show Platform;
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:intl/intl.dart';

import '../features/comfort/eye_comfort.dart';
import '../l10n/l10n.dart';

import 'package:kinetix_ink/kinetix_ink.dart';

import 'api_client.dart';
import 'class_audio/class_audio.dart';
import 'class_audio/mic_capture.dart';
import 'device_store.dart';
import 'models.dart';
import 'outbox_store.dart';
import 'realtime.dart';
import 'recording/recordings.dart';

enum BoardStage { loading, needsEnrollment, board }

/// What kind of touch surface the board runs on. Decides how palms and large contacts behave.
/// (Names and descriptions are in the settings dialog, translated.)
enum TouchProfile {
  tablet(PalmMode.ignore),
  panel(PalmMode.erase),
  irFrame(PalmMode.off);

  const TouchProfile(this.palmMode);
  final PalmMode palmMode;
}

/// Top-level state of the board: enrolment, then the board itself, with or without a teacher.
class BoardController extends ChangeNotifier {
  BoardController({
    DeviceStore? store,
    ApiClient Function(String)? apiFactory,
    Realtime Function(String)? realtimeFactory,
    Recordings? recordings,
    OutboxStore? outboxStore,
    MicCapture Function()? micFactory,
  }) : _store = store ?? DeviceStore(),
      _outboxStore = outboxStore ?? FileOutboxStore(),
      _apiFactory = apiFactory ?? ((url) => ApiClient(baseUrl: url)),
      _realtimeFactory = realtimeFactory ?? Realtime.new,
      recordings = recordings ?? Recordings() {
    this.recordings.attach(api: () => api, session: () => session);
    classAudio = ClassAudio(
      mic: micFactory ?? RecordMicCapture.new,
      request: (event, data) => _realtime?.request(event, data) ?? Future.value(),
      emit: (event, data) => _realtime?.emit(event, data),
    )..addListener(notifyListeners);
  }

  /// Class audio: the teacher's microphone to the live class (off at the start of every class).
  late final ClassAudio classAudio;

  final DeviceStore _store;
  final OutboxStore _outboxStore;
  final ApiClient Function(String) _apiFactory;
  final Realtime Function(String) _realtimeFactory;

  /// Lesson recordings saved on this board and their upload queue.
  final Recordings recordings;

  BoardStage stage = BoardStage.loading;
  ApiClient? api;
  Realtime? _realtime;
  String? deviceName;
  bool online = false;

  /// The signed-in teacher's session. Null means the board is in guest mode.
  SessionContext? session;
  List<Student> roster = [];
  final Map<String, AttendanceMark> attendance = {};

  EyeComfortSettings eyeComfort = const EyeComfortSettings();
  TouchProfile touchProfile = TouchProfile.tablet;

  /// The board's own language for its buttons and messages (Board settings → Language).
  BoardLanguage boardLanguage = BoardLanguage.en;

  /// The signed-in teacher's preferred language, when the board has it. It wins over
  /// [boardLanguage] until the teacher signs out.
  BoardLanguage? _teacherLanguage;

  /// The language the board shows now.
  BoardLanguage get language => _teacherLanguage ?? boardLanguage;

  /// Messages from the principal waiting to be shown, newest first.
  final List<BroadcastMessage> broadcasts = [];

  /// Live view: how many school leaders are watching this board now, and whether the
  /// institution wants the board to show it.
  int liveViewers = 0;
  bool liveIndicator = true;

  /// Of [liveViewers]: school leaders looking in, and students at a live class.
  int liveLeaders = 0;
  int liveStudents = 0;

  /// The teacher opened this class to its students ("Go live").
  bool classLive = false;

  /// Opens or closes the live class. Throws [ApiException] (e.g. no timetabled class).
  Future<void> setClassLive(bool on) async {
    if (api == null || session == null) throw StateError('Sign in to go live');
    await api!.setClassLive(on);
    classLive = on;
    if (!on) unawaited(classAudio.turnOff());
    notifyListeners();
  }

  /// Called when a new viewer needs a full picture of the board.
  VoidCallback? onLiveSnapshotRequest;

  /// Sends lesson events to the people watching (no-op when nobody is).
  void sendLiveFrame(List<List<Object?>> events) {
    if (liveViewers == 0 || events.isEmpty) return;
    _realtime?.emit(RealtimeEvents.liveFrame, {'events': events});
  }

  /// Emergencies the teacher acknowledged. They shrink to a strip but stay until the sender clears them.
  final Set<String> acknowledgedEmergencies = {};

  /// Operations waiting to reach the cloud, each tagged with the class session it belongs to.
  /// Saved to disk on every change, so they survive a crash or restart and still go up after
  /// the class has ended (with the device token; see [flushOutbox]).
  final List<Map<String, dynamic>> _outbox = [];
  Future<void> _outboxSaving = Future.value();
  int get pendingOps => _outbox.length;

  /// The id the current board is saved under. A new lesson gets a new id; opening a saved
  /// board continues it, so saving again updates the same board.
  String whiteboardId = '';

  Timer? _sessionTimer;
  final _random = Random();

  bool get isEnrolled => api != null;
  bool get isSignedIn => session != null;

  Future<void> start() async {
    _outbox.addAll(await _outboxStore.load());
    final saved = await _store.load();
    await _loadSettings();
    if (saved.server == null || saved.token == null) {
      stage = BoardStage.needsEnrollment;
    } else {
      _connect(saved.server!, saved.token!);
      deviceName = saved.name;
      stage = BoardStage.board;
    }
    notifyListeners();
    unawaited(recordings.load());
  }

  Future<void> _loadSettings() async {
    touchProfile = TouchProfile.values.asNameMap()[await _store.setting('touchProfile')] ?? TouchProfile.tablet;
    eyeComfort = EyeComfortSettings.decode(await _store.setting('eyeComfort'));
    boardLanguage = BoardLanguage.tryParse(await _store.setting('language')) ?? BoardLanguage.en;
  }

  /// Demo builds (docs/product/demo-builds.md): no enrolment. The board connects to the demo
  /// server at [serverUrl] (the API and realtime factories decide what that is) and opens in its
  /// class, signed in as [session]'s teacher.
  Future<void> startDemo({
    required String serverUrl,
    required String deviceToken,
    required String deviceName,
    required String sessionToken,
    required SessionContext session,
  }) async {
    await _loadSettings();
    _connect(serverUrl, deviceToken);
    this.deviceName = deviceName;
    stage = BoardStage.board;
    onPaired(sessionToken, session);
    unawaited(recordings.load());
  }

  Future<void> enroll(String serverUrl, String code) async {
    final url = serverUrl.trim().replaceAll(RegExp(r'/+$'), '');
    final client = _apiFactory(url);
    final res = await client.enroll(code.trim(), _platform());
    await _store.save(server: url, token: res.deviceToken, name: res.deviceName);
    deviceName = res.deviceName;
    _connect(url, res.deviceToken);
    stage = BoardStage.board;
    notifyListeners();
  }

  /// Use the board without registering it (practice, demos). Sign-in is unavailable.
  void skipEnrollment() {
    stage = BoardStage.board;
    notifyListeners();
  }

  Future<void> endClass() async {
    if (session != null) {
      await flushOutbox();
      // Uploads need this session's token, so lesson recordings go up before it ends.
      await recordings.uploadBeforeSignOut();
      try {
        await api?.endSession();
      } catch (_) {
        // Offline: the server ends the session itself when the period expires.
      }
    }
    _signOut();
  }

  void setEyeComfort(EyeComfortSettings s) {
    eyeComfort = s;
    unawaited(_store.setSetting('eyeComfort', s.encode()));
    notifyListeners();
  }

  /// Sets the board's language. A teacher who picks it while signed in sees it at once, in
  /// place of their own preferred language.
  void setBoardLanguage(BoardLanguage l) {
    boardLanguage = l;
    _teacherLanguage = null;
    unawaited(_store.setSetting('language', l.name));
    notifyListeners();
  }

  void setTouchProfile(TouchProfile p) {
    touchProfile = p;
    unawaited(_store.setSetting('touchProfile', p.name));
    notifyListeners();
  }

  void dismissBroadcast(BroadcastMessage m, {required bool acknowledge}) {
    if (m.priority == BroadcastPriority.emergency) {
      acknowledgedEmergencies.add(m.id);
    } else {
      broadcasts.removeWhere((b) => b.id == m.id);
    }
    notifyListeners();
    if (acknowledge) unawaited(api?.acknowledge(m.id).catchError((_) {}));
  }

  // --- Classroom ---------------------------------------------------------------------------

  /// Students who can be picked: everyone not marked absent.
  List<Student> get pickable => roster.where((s) => attendance[s.id] != AttendanceMark.absent).toList();

  Student? pickStudent({Student? avoid}) {
    final pool = pickable.where((s) => s != avoid || pickable.length == 1).toList();
    if (pool.isEmpty) return null;
    return pool[_random.nextInt(pool.length)];
  }

  void recordAnswer(Student s, AnswerOutcome outcome) {
    _enqueue('participation.recorded', {'studentId': s.id, 'outcome': outcome.name});
  }

  void markAttendance(Map<String, AttendanceMark> marks) {
    attendance.addAll(marks);
    for (final e in marks.entries) {
      _enqueue('attendance.marked', {'studentId': e.key, 'status': e.value.name});
    }
    notifyListeners();
  }

  void _enqueue(String type, Map<String, dynamic> payload) {
    if (session == null) return; // guest boards do not record anything
    _outbox.add({
      'opId': _uuidV4(),
      'type': type,
      'occurredAt': DateTime.now().toUtc().toIso8601String(),
      'payload': payload,
      'sessionId': session!.sessionId,
    });
    _persistOutbox();
    notifyListeners();
    unawaited(flushOutbox());
  }

  /// Writes the outbox to disk, one write after another so an older list never wins.
  void _persistOutbox() {
    final snapshot = [for (final op in _outbox) Map<String, dynamic>.of(op)];
    _outboxSaving = _outboxSaving.then((_) => _outboxStore.save(snapshot)).catchError((_) {});
  }

  /// Waits until the outbox on disk matches memory (tests, shutdown).
  Future<void> get outboxSaved => _outboxSaving;

  bool _flushing = false;

  Future<void> flushOutbox() async {
    final api = this.api;
    if (_flushing || api == null) return;
    _flushing = true;
    var changed = false;
    try {
      // Keep going while there is work: operations queued during a request go in the next batch.
      while (_outbox.isNotEmpty) {
        // Oldest class first. The current class uses its session token; an earlier class's ops
        // (from before a restart, or after it ended) go with the device token.
        final sessionId = _outbox.first['sessionId'] as String?;
        final current = sessionId == null || sessionId == session?.sessionId;
        if (current && api.sessionToken == null) break;
        if (!current && api.deviceToken == null) break;
        final batch = _outbox.where((op) => op['sessionId'] == sessionId).take(200).toList();
        final res = await api.pushOps(
          [for (final op in batch) Map.of(op)..remove('sessionId')],
          sessionId: sessionId,
          useDeviceToken: !current,
        );
        final handled = batch.where((op) => res.done.contains(op['opId']) || res.rejected.containsKey(op['opId'])).toSet();
        _outbox.removeWhere(handled.contains);
        changed = changed || handled.isNotEmpty;
        online = true;
        if (handled.isEmpty) break; // the server answered but took nothing; retry later
      }
    } on ApiException catch (e) {
      // The server refuses this class's ops for good (too old, not this board): drop them so
      // they do not block newer ones.
      if (e.status == 403 && _outbox.isNotEmpty && _outbox.first['sessionId'] != session?.sessionId) {
        final stale = _outbox.first['sessionId'];
        _outbox.removeWhere((op) => op['sessionId'] == stale);
        changed = true;
      } else {
        online = false;
      }
    } catch (_) {
      online = false; // keep everything; retried on reconnect or the next change
    } finally {
      _flushing = false;
      if (changed) _persistOutbox();
      if (!_disposed) notifyListeners();
    }
  }

  // --- Connection --------------------------------------------------------------------------

  void _connect(String url, String deviceToken) {
    api = _apiFactory(url)..deviceToken = deviceToken;
    _realtime?.dispose();
    final rt = _realtimeFactory(url);
    rt.on(
      RealtimeEvents.pairingClaimed,
      (e) => onPaired(e['sessionToken'] as String, SessionContext.fromJson(e['session'] as Map<String, dynamic>)),
    );
    rt.on(RealtimeEvents.sessionEnded, (e) {
      if (e['sessionId'] == session?.sessionId) _signOut();
    });
    rt.on(RealtimeEvents.broadcastNew, (e) => _showBroadcast(BroadcastMessage.fromJson(e)));
    rt.on(RealtimeEvents.broadcastCleared, (e) {
      broadcasts.removeWhere((b) => b.id == e['id']);
      notifyListeners();
    });
    rt.on(RealtimeEvents.liveViewers, (e) {
      liveViewers = (e['count'] as num?)?.toInt() ?? 0;
      liveLeaders = (e['leaders'] as num?)?.toInt() ?? liveViewers;
      liveStudents = (e['students'] as num?)?.toInt() ?? 0;
      liveIndicator = e['indicator'] as bool? ?? true;
      classAudio.setListeners((e['listeners'] as num?)?.toInt() ?? 0);
      notifyListeners();
    });
    rt.on(RealtimeEvents.liveSnapshotRequest, (_) => onLiveSnapshotRequest?.call());
    rt.onReady = () {
      online = true;
      classAudio.reconnected();
      notifyListeners();
      unawaited(_fetchPendingBroadcasts());
      unawaited(flushOutbox());
      unawaited(recordings.kick());
    };
    rt.connect(deviceToken);
    _realtime = rt;
  }

  @visibleForTesting
  void onPaired(String sessionToken, SessionContext ctx) {
    api?.sessionToken = sessionToken;
    session = ctx;
    _teacherLanguage = BoardLanguage.tryParse(ctx.language);
    whiteboardId = newId();
    roster = [];
    attendance.clear();
    _sessionTimer?.cancel();
    _sessionTimer = Timer(ctx.expiresAt.difference(DateTime.now()), _signOut);
    notifyListeners();
    unawaited(_loadRoster());
    unawaited(recordings.kick()); // recordings this teacher made earlier on this board
  }

  Future<void> _loadRoster() async {
    try {
      roster = await api!.roster();
      notifyListeners();
    } catch (_) {}
  }

  void _signOut() {
    _sessionTimer?.cancel();
    liveViewers = liveLeaders = liveStudents = 0;
    classLive = false;
    unawaited(classAudio.turnOff());
    classAudio.setListeners(0);
    api?.sessionToken = null;
    session = null;
    _teacherLanguage = null;
    roster = [];
    attendance.clear();
    notifyListeners();
  }

  void _showBroadcast(BroadcastMessage m) {
    if (broadcasts.any((b) => b.id == m.id)) return;
    broadcasts.insert(0, m);
    notifyListeners();
    unawaited(api?.markDisplayed(m.id).catchError((_) {}));
  }

  Future<void> _fetchPendingBroadcasts() async {
    try {
      final pending = await api!.pendingBroadcasts();
      for (final m in pending.reversed) {
        _showBroadcast(m);
      }
    } catch (_) {}
  }

  /// Saves the board to the cloud. Signed-in sessions only.
  Future<WhiteboardSummary> saveBoard(SavedBoard board, {required String title, required bool share}) async {
    final api = this.api;
    if (api == null || session == null) throw StateError('Sign in to save boards');
    if (whiteboardId.isEmpty) whiteboardId = newId();
    return api.saveWhiteboard(whiteboardId, title: title, board: board, share: share);
  }

  /// A title for a new save: "Corporate Accounting · 4 Oct" or "Board · 4 Oct" ([fallback]
  /// and the date in the board's language).
  String defaultBoardTitle(DateTime now, {String fallback = 'Board', String locale = 'en_US'}) =>
      '${session?.subjectName ?? fallback} · ${DateFormat('d MMM', locale).format(now)}';

  String newId() => _uuidV4();

  String _uuidV4() {
    final b = List<int>.generate(16, (_) => _random.nextInt(256));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    final h = b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
    return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
  }

  String _platform() {
    if (kIsWeb) return 'web';
    if (Platform.isAndroid) return 'android';
    if (Platform.isWindows) return 'windows';
    return 'linux';
  }

  bool _disposed = false;

  @override
  void dispose() {
    _disposed = true;
    _sessionTimer?.cancel();
    classAudio.removeListener(notifyListeners);
    classAudio.dispose();
    _realtime?.dispose();
    recordings.dispose();
    super.dispose();
  }
}
