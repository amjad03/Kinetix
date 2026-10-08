import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../../core/api_client.dart';
import '../../core/board_controller.dart';
import '../../core/device_store.dart';
import '../../core/kiosk/kiosk_pin.dart';
import '../../core/models.dart';
import '../../core/secret_store.dart';
import '../offline_ai/offline_ai.dart' show cloudUnreachable;

/// A teacher who has signed in on this board (GET /v1/devices/me/profiles).
@immutable
class BoardProfile {
  const BoardProfile({required this.userId, required this.name, required this.language, required this.pinSet, required this.locked, this.pin, this.lastUsedAt});

  factory BoardProfile.fromJson(Map<String, dynamic> j) {
    final p = j['pin'] as Map<String, dynamic>?;
    return BoardProfile(
      userId: j['userId'] as String,
      name: j['name'] as String,
      language: j['language'] as String? ?? 'en',
      pinSet: j['pinSet'] as bool? ?? false,
      locked: j['locked'] as bool? ?? false,
      // The API sends `algo, iterations, salt, hash`, as the kiosk PIN's parts.
      pin: p == null ? null : KioskPin.fromJson(p),
      lastUsedAt: DateTime.tryParse(j['lastUsedAt'] as String? ?? ''),
    );
  }

  final String userId;
  final String name;
  final String language;
  final bool pinSet;

  /// Five wrong PINs: only a full sign-in (or an admin) opens it again.
  final bool locked;

  /// The PIN's salt and hash, to check it offline; null when not set or locked.
  final KioskPin? pin;
  final DateTime? lastUsedAt;

  Map<String, dynamic> toJson() => {
    'userId': userId,
    'name': name,
    'language': language,
    'pinSet': pinSet,
    'locked': locked,
    'pin': pin?.toJson(),
    'lastUsedAt': lastUsedAt?.toIso8601String(),
  };

  BoardProfile copyWith({bool? pinSet, bool? locked, KioskPin? pin, bool clearPin = false}) => BoardProfile(
    userId: userId,
    name: name,
    language: language,
    pinSet: pinSet ?? this.pinSet,
    locked: locked ?? this.locked,
    pin: clearPin ? null : (pin ?? this.pin),
    lastUsedAt: lastUsedAt,
  );
}

enum UnlockOutcome {
  ok,
  wrong,

  /// Too many wrong PINs.
  lockedOut,

  /// The teacher has no PIN on this board (or an admin reset it): sign in with the Teacher app.
  noPin,

  /// Offline, and the board has nothing it could open for this teacher.
  needsNetwork,
}

@immutable
class UnlockResult {
  const UnlockResult(this.outcome, {this.attemptsLeft});
  final UnlockOutcome outcome;
  final int? attemptsLeft;
}

/// Shared-board profiles (docs/architecture/board-profiles.md): several teachers use one board,
/// each switching to their profile with a 4–6 digit PIN instead of a full sign-in.
///
/// * The board keeps the list of teachers who signed in on it, with each PIN's salt and hash,
///   so PINs can be checked offline (as the kiosk IT PIN is). The server checks PINs too and
///   locks a profile after five wrong ones; offline, the board counts wrong PINs itself.
/// * Each profile keeps its own class session token (in the [SecretStore]), so a teacher who
///   comes back to the board in the same period gets their class back, even offline; their own
///   settings (BoardController's teacher settings) and their own board ([onSwitch]).
/// * The board locks after [idleMinutes] without a touch (the session stays: the teacher's PIN
///   opens it again) and signs out when the period ends (BoardController).
class ProfilesController extends ChangeNotifier {
  ProfilesController({
    required this.board,
    DeviceStore? store,
    SecretStore? secrets,
    DateTime Function()? now,
    Future<bool> Function(String pin, KioskPin p)? verify,
    this.maxAttempts = 5,
  }) : _store = store ?? DeviceStore(),
       _secrets = secrets ?? OsSecretStore(),
       _now = now ?? DateTime.now,
       _verify = verify ?? verifyKioskPin;

  final BoardController board;
  final DeviceStore _store;
  final SecretStore _secrets;
  final DateTime Function() _now;
  final Future<bool> Function(String, KioskPin) _verify;
  final int maxAttempts;

  static const _cacheKey = 'profiles';
  static const _failuresKey = 'profileFailures';
  static const _idleKey = 'profileIdleMinutes';
  static String _sessionKey(String userId) => 'profile.session.$userId';

  /// Most recently used first.
  List<BoardProfile> profiles = [];

  /// The screen is locked: the teacher's class is still open behind it.
  bool locked = false;

  /// Minutes without a touch before the board locks (0: never). Only teachers with a PIN are
  /// locked out; anyone else would have no way back in.
  int idleMinutes = 10;

  /// Wrong PINs typed while offline, per teacher (the server counts the online ones).
  final Map<String, int> _failures = {};

  /// Called before the board changes teacher on a PIN switch, so the board screen can keep
  /// [from]'s whiteboard and open [to]'s. Null ids: the guest board.
  Future<void> Function(String? from, String? to)? onSwitch;

  Timer? _idle;
  String? _seenSession;
  bool _disposed = false;

  BoardProfile? profileOf(String? userId) => profiles.where((p) => p.userId == userId).firstOrNull;

  /// The signed-in teacher's profile.
  BoardProfile? get current => profileOf(board.session?.teacherId);

  /// The signed-in teacher could set a PIN for this board.
  bool get canSetPin => board.isSignedIn && board.api?.sessionToken != null;

  Future<void> start() async {
    try {
      final cached = await _store.setting(_cacheKey);
      if (cached != null) profiles = [for (final j in jsonDecode(cached) as List<dynamic>) BoardProfile.fromJson(j as Map<String, dynamic>)];
      final f = await _store.setting(_failuresKey);
      if (f != null) _failures.addAll((jsonDecode(f) as Map<String, dynamic>).map((k, v) => MapEntry(k, (v as num).toInt())));
      idleMinutes = int.tryParse(await _store.setting(_idleKey) ?? '') ?? idleMinutes;
    } catch (e) {
      debugPrint('Board profiles unreadable: $e');
    }
    if (_disposed) return;
    board.addListener(_onBoard);
    _onBoard();
    _notify();
    unawaited(refresh());
  }

  /// IT cleared this board's cached teacher profiles (device console): the list, the offline PIN
  /// checks and the kept sign-ins go. Teachers set a new PIN the next time they sign in here.
  Future<void> clearCache() async {
    for (final p in profiles) {
      await _secrets.delete(_sessionKey(p.userId)).catchError((Object _) {});
    }
    profiles = [];
    _failures.clear();
    locked = false;
    await _save();
    await _saveFailures();
    _notify();
  }

  /// The list from the server; offline, the cached one stays.
  Future<void> refresh() async {
    final api = board.api;
    if (api == null || api.deviceToken == null) return;
    try {
      profiles = [for (final j in await api.boardProfiles()) BoardProfile.fromJson(j)];
      await _save();
      _notify();
    } catch (e) {
      debugPrint('Board profiles not fetched: $e');
    }
  }

  void setIdleMinutes(int m) {
    idleMinutes = m;
    unawaited(_store.setSetting(_idleKey, '$m').catchError((_) {}));
    activity();
    _notify();
  }

  /// A touch on the board: the idle timer starts again.
  void activity() {
    _idle?.cancel();
    if (idleMinutes <= 0 || locked || !board.isSignedIn) return;
    _idle = Timer(Duration(minutes: idleMinutes), () {
      if (current?.pin != null || current?.pinSet == true) lock();
    });
  }

  /// Hides the board behind the lock screen; the class stays open.
  void lock() {
    if (!board.isSignedIn || locked) return;
    _idle?.cancel();
    locked = true;
    _notify();
  }

  /// "Sign out" from the lock screen or the period ending: the lock screen goes too.
  Future<void> signOut() async {
    locked = false;
    _notify();
    await board.endClass();
  }

  /// The signed-in teacher sets their PIN on this board (4–6 digits). Throws [ApiException].
  Future<void> setPin(String pin) async {
    final api = board.api;
    if (api == null || !board.isSignedIn) throw StateError('Sign in first');
    final res = await api.setProfilePin(pin);
    final s = board.session!;
    final parts = KioskPin.fromJson(res['pin']);
    final existing = profileOf(s.teacherId);
    final updated = (existing ?? BoardProfile(userId: s.teacherId, name: s.teacherName, language: s.language, pinSet: true, locked: false, lastUsedAt: _now()))
        .copyWith(pinSet: true, locked: false, pin: parts);
    profiles = [updated, ...profiles.where((p) => p.userId != s.teacherId)];
    _failures.remove(s.teacherId);
    await _save();
    activity();
    _notify();
  }

  /// Switches to [p]'s profile with their [pin] (or opens the lock screen for the teacher who
  /// locked it). Online the server checks the PIN and opens a class; offline the board checks
  /// it against the cached hash and reopens the teacher's class if it is still on.
  Future<UnlockResult> unlock(BoardProfile p, String pin) async {
    final sameTeacher = board.session?.teacherId == p.userId;
    if (p.locked) return const UnlockResult(UnlockOutcome.lockedOut);

    // The teacher who is signed in, back at a locked board: their class is open, a local check will do.
    if (sameTeacher && locked && p.pin != null) {
      return _checkLocally(p, pin, () async {
        locked = false;
        activity();
        _notify();
      });
    }

    final api = board.api;
    if (api != null && api.deviceToken != null) {
      try {
        final res = await api.unlockProfile(p.userId, pin);
        _failures.remove(p.userId);
        await _saveFailures();
        await _switchTo(res.sessionToken, SessionContext.fromJson(res.session));
        unawaited(refresh());
        return const UnlockResult(UnlockOutcome.ok);
      } on ApiException catch (e) {
        if (e.code == 'PROFILE_PIN_WRONG' || e.status == 401) {
          return UnlockResult(UnlockOutcome.wrong, attemptsLeft: (e.body['attemptsLeft'] as num?)?.toInt());
        }
        if (e.code == 'PROFILE_LOCKED') {
          _replace(p.copyWith(locked: true, clearPin: true));
          await _save();
          _notify();
          return const UnlockResult(UnlockOutcome.lockedOut);
        }
        if (e.code == 'PROFILE_NO_PIN' || e.status == 404) {
          _replace(p.copyWith(pinSet: false, clearPin: true));
          await _save();
          _notify();
          return const UnlockResult(UnlockOutcome.noPin);
        }
        if (!cloudUnreachable(e)) rethrow;
      } catch (e) {
        if (!cloudUnreachable(e)) rethrow;
      }
    }

    // Offline: the cached hash, and the teacher's class if it is still on.
    if (p.pin == null) return const UnlockResult(UnlockOutcome.needsNetwork);
    final saved = await _savedSession(p.userId);
    return _checkLocally(p, pin, () async {
      if (sameTeacher) {
        locked = false;
        activity();
        _notify();
        return;
      }
      if (saved == null) throw const _NeedsNetwork();
      await _switchTo(saved.token, saved.session);
    });
  }

  Future<UnlockResult> _checkLocally(BoardProfile p, String pin, Future<void> Function() open) async {
    final failures = _failures[p.userId] ?? 0;
    if (failures >= maxAttempts) return const UnlockResult(UnlockOutcome.lockedOut);
    if (!await _verify(pin, p.pin!)) {
      _failures[p.userId] = failures + 1;
      await _saveFailures();
      final left = maxAttempts - failures - 1;
      return left <= 0 ? const UnlockResult(UnlockOutcome.lockedOut) : UnlockResult(UnlockOutcome.wrong, attemptsLeft: left);
    }
    try {
      await open();
    } on _NeedsNetwork {
      return const UnlockResult(UnlockOutcome.needsNetwork);
    }
    _failures.remove(p.userId);
    await _saveFailures();
    return const UnlockResult(UnlockOutcome.ok);
  }

  Future<void> _switchTo(String token, SessionContext session) async {
    final from = board.session?.teacherId;
    if (from != session.teacherId) await onSwitch?.call(from, session.teacherId);
    board.openSession(token, session);
    locked = false;
    activity();
    _notify();
  }

  /// Keeps each class session the board gets (pairing or PIN) under its teacher, for coming back.
  void _onBoard() {
    final s = board.session;
    final token = board.api?.sessionToken;
    if (s == null) {
      _seenSession = null;
      _idle?.cancel();
      if (locked) {
        locked = false;
        _notify();
      }
      return;
    }
    if (s.sessionId == _seenSession || token == null) return;
    _seenSession = s.sessionId;
    // A new class (a full sign-in from the lock screen, say) opens the board.
    locked = false;
    unawaited(_secrets.write(_sessionKey(s.teacherId), jsonEncode({'token': token, 'session': s.toJson()})).catchError((Object e) => debugPrint('Session not kept: $e')));
    // A new teacher on the board joins the list at once (the server has them already).
    if (profileOf(s.teacherId) == null) {
      profiles = [BoardProfile(userId: s.teacherId, name: s.teacherName, language: s.language, pinSet: false, locked: false, lastUsedAt: _now()), ...profiles];
      unawaited(_save());
      unawaited(refresh());
    }
    activity();
    _notify();
  }

  Future<({String token, SessionContext session})?> _savedSession(String userId) async {
    try {
      final raw = await _secrets.read(_sessionKey(userId));
      if (raw == null) return null;
      final j = jsonDecode(raw) as Map<String, dynamic>;
      final session = SessionContext.fromJson(j['session'] as Map<String, dynamic>);
      if (!session.expiresAt.isAfter(_now())) return null;
      return (token: j['token'] as String, session: session);
    } catch (_) {
      return null;
    }
  }

  void _replace(BoardProfile p) => profiles = [for (final x in profiles) x.userId == p.userId ? p : x];

  Future<void> _save() async {
    try {
      await _store.setSetting(_cacheKey, jsonEncode([for (final p in profiles) p.toJson()]));
    } catch (e) {
      debugPrint('Board profiles not saved: $e');
    }
  }

  Future<void> _saveFailures() async {
    try {
      await _store.setSetting(_failuresKey, jsonEncode(_failures));
    } catch (_) {}
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _idle?.cancel();
    board.removeListener(_onBoard);
    super.dispose();
  }
}

class _NeedsNetwork implements Exception {
  const _NeedsNetwork();
}
