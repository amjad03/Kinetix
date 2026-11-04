import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:ui' show PlatformDispatcher;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;

/// What the phone apps share for staying signed in, the version gate, crash reports, notification settings,
/// offline reads and writes, and screenshot protection (docs/product/mobile-apps.md). The apps pass in their
/// own words ([KxMobileStrings], from their en / hi / kn arb files).

// ── Staying signed in ───────────────────────────────────────────────────────────────────────────

/// Sent on every request from the phone apps: the server gives such sign-ins a rotating refresh token.
const kMobileClientHeaders = {'x-zynetix-client': 'mobile'};

/// The rotating refresh token of an app sign-in (`POST /v1/auth/refresh`). One refresh at a time: requests that
/// fail together with 401 share it, and each is retried once with the new access token.
class KxTokenRefresher {
  KxTokenRefresher(this._http);

  final http.Client _http;
  String? refreshToken;
  DateTime? expiresAt;

  /// The new pair after a rotation, so the app can keep it in the key store.
  void Function(String accessToken, String refreshToken)? onRotated;

  Future<String?>? _inFlight;

  /// Takes `refreshToken` and `expiresAt` from a sign-in or refresh answer (absent from older servers).
  void take(Object? json) {
    if (json is! Map) return;
    final r = json['refreshToken'];
    if (r is String && r.isNotEmpty) refreshToken = r;
    final e = json['expiresAt'];
    if (e is String) expiresAt = DateTime.tryParse(e);
  }

  void clear() {
    refreshToken = null;
    expiresAt = null;
  }

  /// A new access token, or null when there is no refresh token or the server refused it (sign in again).
  Future<String?> refresh(String baseUrl) {
    if (refreshToken == null) return Future.value(null);
    return _inFlight ??= _refresh(baseUrl).whenComplete(() => _inFlight = null);
  }

  Future<String?> _refresh(String baseUrl) async {
    final old = refreshToken;
    try {
      final res = await _http
          .post(Uri.parse('$baseUrl/v1/auth/refresh'), headers: {'content-type': 'application/json', ...kMobileClientHeaders}, body: jsonEncode({'refreshToken': old}))
          .timeout(const Duration(seconds: 20));
      if (res.statusCode != 200) {
        // 409 REFRESH_RACE: another copy of this sign-in refreshed a moment ago; keep the token for a later try.
        if (res.statusCode != 409) clear();
        return null;
      }
      final j = jsonDecode(res.body) as Map;
      final access = j['accessToken'] as String;
      take(j);
      onRotated?.call(access, refreshToken!);
      return access;
    } catch (_) {
      return null;
    }
  }
}

/// Removes what an app kept on the phone for the signed-in person (read cache, queued writes, downloads,
/// offline lessons): every file under [dirs]. Missing folders are fine.
Future<void> kxWipeLocalFiles(Iterable<Directory> dirs) async {
  for (final d in dirs) {
    try {
      if (!await d.exists()) continue;
      await for (final e in d.list(followLinks: false)) {
        await e.delete(recursive: true);
      }
    } catch (e) {
      debugPrint('Local files not wiped in ${d.path}: $e');
    }
  }
}

// ── Version gate ────────────────────────────────────────────────────────────────────────────────

/// `GET /v1/public/app-versions/check`.
class KxVersionCheck {
  const KxVersionCheck({required this.status, this.minVersion = '', this.latestVersion = '', this.storeUrl = '', this.message = ''});

  factory KxVersionCheck.fromJson(Map<String, dynamic> j) => KxVersionCheck(
    status: '${j['status']}',
    minVersion: '${j['minVersion'] ?? ''}',
    latestVersion: '${j['latestVersion'] ?? ''}',
    storeUrl: '${j['storeUrl'] ?? ''}',
    message: '${j['message'] ?? ''}',
  );

  /// `ok`, `update_available` or `update_required`.
  final String status;
  final String minVersion, latestVersion, storeUrl, message;

  bool get required => status == 'update_required';
  bool get available => status == 'update_available';
}

/// Asks the server about [version] of [app]; null when it cannot be reached (the app then carries on).
Future<KxVersionCheck?> kxCheckVersion(http.Client client, String baseUrl, {required String app, required String version, String? platform}) async {
  final p = platform ?? (defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android');
  try {
    final uri = Uri.parse('$baseUrl/v1/public/app-versions/check').replace(queryParameters: {'app': app, 'platform': p, 'version': version});
    final res = await client.get(uri).timeout(const Duration(seconds: 10));
    if (res.statusCode != 200) return null;
    return KxVersionCheck.fromJson((jsonDecode(res.body) as Map).cast<String, dynamic>());
  } catch (_) {
    return null;
  }
}

/// The app's words for the shared mobile screens, taken from its own arb files.
class KxMobileStrings {
  const KxMobileStrings({
    required this.updateRequiredTitle,
    required this.updateRequiredBody,
    required this.updateAvailable,
    required this.update,
    required this.later,
    required this.offlineBanner,
    required this.notificationSettings,
    required this.notificationSettingsHint,
    required this.quietHours,
    required this.quietHoursHint,
    required this.quietFrom,
    required this.quietTo,
    required this.save,
    required this.saved,
    required this.loadFailed,
    required this.retry,
    required this.kindLabel,
    this.pendingWrites,
  });

  final String updateRequiredTitle, updateRequiredBody, updateAvailable, update, later, offlineBanner;
  final String notificationSettings, notificationSettingsHint, quietHours, quietHoursHint, quietFrom, quietTo, save, saved, loadFailed, retry;

  /// The name of a notification kind (`absence`, `fee`, ...).
  final String Function(String kind) kindLabel;

  /// "3 changes waiting to be sent", when the app queues writes.
  final String Function(int n)? pendingWrites;
}

/// Checks the version once at start. Below the minimum only the update screen shows; a newer version shows a
/// banner that can be dismissed. Unreachable server: the app carries on (cached reads work offline).
class KxVersionGate extends StatefulWidget {
  const KxVersionGate({super.key, required this.check, required this.strings, required this.child, this.openStore});

  final Future<KxVersionCheck?> Function() check;
  final KxMobileStrings Function(BuildContext context) strings;
  final Widget child;
  final void Function(String url)? openStore;

  @override
  State<KxVersionGate> createState() => _KxVersionGateState();
}

class _KxVersionGateState extends State<KxVersionGate> {
  KxVersionCheck? _result;
  bool _dismissed = false;

  @override
  void initState() {
    super.initState();
    widget.check().then((r) {
      if (mounted) setState(() => _result = r);
    }, onError: (_) {});
  }

  @override
  Widget build(BuildContext context) {
    final r = _result;
    if (r == null || (!r.required && (!r.available || _dismissed))) return widget.child;
    final s = widget.strings(context);
    final open = r.storeUrl.isEmpty || widget.openStore == null ? null : () => widget.openStore!(r.storeUrl);
    if (r.required) {
      return Scaffold(
        key: const Key('forced-update'),
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.system_update, size: 64, semanticLabel: ''),
                  const SizedBox(height: 16),
                  Text(s.updateRequiredTitle, style: Theme.of(context).textTheme.headlineSmall, textAlign: TextAlign.center),
                  const SizedBox(height: 8),
                  Text(r.message.isNotEmpty ? r.message : s.updateRequiredBody, textAlign: TextAlign.center),
                  const SizedBox(height: 24),
                  FilledButton(onPressed: open, child: Text(s.update)),
                ],
              ),
            ),
          ),
        ),
      );
    }
    return Column(
      children: [
        Material(
          key: const Key('update-banner'),
          color: Theme.of(context).colorScheme.secondaryContainer,
          child: SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsetsDirectional.fromSTEB(16, 4, 4, 4),
              child: Row(
                children: [
                  Expanded(child: Text(r.message.isNotEmpty ? r.message : s.updateAvailable)),
                  if (open != null) TextButton(onPressed: open, child: Text(s.update)),
                  TextButton(onPressed: () => setState(() => _dismissed = true), child: Text(s.later)),
                ],
              ),
            ),
          ),
        ),
        Expanded(child: MediaQuery.removePadding(context: context, removeTop: true, child: widget.child)),
      ],
    );
  }
}

// ── Crash reports ───────────────────────────────────────────────────────────────────────────────

/// Takes personal data out of a crash text before it leaves the phone (the server scrubs again): emails,
/// phone numbers, tokens, ids and query strings.
String kxScrubCrashText(String s, [int max = 4000]) {
  var t = s
      .replaceAll(RegExp(r'[\w.+-]+@[\w-]+\.[\w.-]+'), '<email>')
      .replaceAll(RegExp(r'eyJ[\w-]+\.[\w-]+\.[\w-]+'), '<jwt>')
      .replaceAll(RegExp(r'Bearer\s+\S+', caseSensitive: false), 'Bearer <token>')
      .replaceAll(RegExp(r'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'), '<id>')
      .replaceAll(RegExp(r'\?[^\s#)]*'), '?<query>')
      .replaceAll(RegExp(r'\+?\d[\d -]{8,}\d'), '<number>');
  if (t.length > max) t = t.substring(0, max);
  return t;
}

/// Sends uncaught errors to `POST /v1/public/client-errors`: Flutter framework errors and errors no zone caught.
/// The report names the app, its version and the platform, never the person.
class KxCrashReporter {
  KxCrashReporter({required this.app, required this.appVersion, required this.send, this.tenant, String? platform, String? osVersion})
    : platform = platform ?? defaultTargetPlatform.name,
      osVersion = osVersion ?? _os();

  final String app, appVersion, platform, osVersion;

  /// The institution's slug (not a person), when signed in.
  String? Function()? tenant;

  /// Posts the report body; tests pass a fake.
  final Future<void> Function(Map<String, Object?> body) send;

  static String _os() {
    try {
      return Platform.operatingSystemVersion;
    } catch (_) {
      return '';
    }
  }

  final _sent = <String>{};

  /// Reports through `http`, to [baseUrl].
  static Future<void> Function(Map<String, Object?>) httpSender(http.Client client, String Function() baseUrl) => (body) async {
    try {
      await client.post(Uri.parse('${baseUrl()}/v1/public/client-errors'), headers: {'content-type': 'application/json'}, body: jsonEncode(body)).timeout(const Duration(seconds: 10));
    } catch (_) {}
  };

  /// Installs the handlers, keeping the ones already set (the red screen in debug, logs).
  void install() {
    final previous = FlutterError.onError;
    FlutterError.onError = (details) {
      previous?.call(details);
      unawaited(report(details.exception, details.stack, kind: 'flutter', fatal: false));
    };
    final previousPlatform = PlatformDispatcher.instance.onError;
    PlatformDispatcher.instance.onError = (error, stack) {
      unawaited(report(error, stack, kind: 'platform', fatal: true));
      return previousPlatform?.call(error, stack) ?? true;
    };
  }

  /// Reports one error (the same message and stack once per run).
  Future<void> report(Object error, StackTrace? stack, {required String kind, bool fatal = false}) async {
    final message = kxScrubCrashText('$error', 1000);
    final trace = kxScrubCrashText(stack?.toString() ?? '', 8000);
    if (!_sent.add('$kind|$message|${trace.length > 200 ? trace.substring(0, 200) : trace}')) return;
    final slug = tenant?.call() ?? '';
    await send({
      'app': app,
      'platform': platform,
      'appVersion': appVersion,
      'osVersion': kxScrubCrashText(osVersion, 80),
      'kind': kind,
      'fatal': fatal,
      'message': message.isEmpty ? 'unknown' : message,
      'stack': trace,
      'tenant': RegExp(r'^[a-z0-9-]*$').hasMatch(slug) ? slug : '',
    });
  }
}

// ── Notification settings ───────────────────────────────────────────────────────────────────────

/// `GET/PUT /v1/me/notification-preferences`.
class KxNotificationPrefs {
  const KxNotificationPrefs({required this.kinds, required this.pushOff, this.quietStart, this.quietEnd});

  factory KxNotificationPrefs.fromJson(Map<String, dynamic> j) => KxNotificationPrefs(
    kinds: [for (final k in j['kinds'] as List? ?? const []) '$k'],
    pushOff: {for (final k in j['pushOff'] as List? ?? const []) '$k'},
    quietStart: j['quietStart'] as String?,
    quietEnd: j['quietEnd'] as String?,
  );

  final List<String> kinds;
  final Set<String> pushOff;

  /// "22:00" style, both or neither.
  final String? quietStart, quietEnd;

  Map<String, Object?> toJson() => {'pushOff': (pushOff.toList()..sort()), 'quietStart': quietStart, 'quietEnd': quietEnd};
}

/// Profile → Notifications: push on or off per kind, and personal quiet hours (pushes wait until they end;
/// the inbox still gets everything, emergencies always ring).
class KxNotificationSettingsScreen extends StatefulWidget {
  const KxNotificationSettingsScreen({super.key, required this.load, required this.save, required this.strings, this.kinds});

  final Future<KxNotificationPrefs> Function() load;
  final Future<KxNotificationPrefs> Function(KxNotificationPrefs prefs) save;
  final KxMobileStrings strings;

  /// The kinds this app's person receives (in this order); null shows all the server lists.
  final List<String>? kinds;

  @override
  State<KxNotificationSettingsScreen> createState() => _KxNotificationSettingsScreenState();
}

class _KxNotificationSettingsScreenState extends State<KxNotificationSettingsScreen> {
  KxNotificationPrefs? _prefs;
  Set<String> _off = {};
  bool _quiet = false;
  TimeOfDay _from = const TimeOfDay(hour: 21, minute: 0), _to = const TimeOfDay(hour: 7, minute: 0);
  bool _failed = false, _saving = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  static TimeOfDay _parse(String s) {
    final p = s.split(':');
    return TimeOfDay(hour: int.parse(p[0]), minute: int.parse(p[1]));
  }

  static String _fmt(TimeOfDay t) => '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  Future<void> _load() async {
    setState(() => _failed = false);
    try {
      final p = await widget.load();
      if (!mounted) return;
      setState(() {
        _prefs = p;
        _off = {...p.pushOff};
        _quiet = p.quietStart != null && p.quietEnd != null;
        if (_quiet) {
          _from = _parse(p.quietStart!);
          _to = _parse(p.quietEnd!);
        }
      });
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    }
  }

  Future<void> _save() async {
    final p = _prefs!;
    setState(() => _saving = true);
    final messenger = ScaffoldMessenger.maybeOf(context);
    try {
      final quietOk = _quiet && _fmt(_from) != _fmt(_to);
      final saved = await widget.save(KxNotificationPrefs(kinds: p.kinds, pushOff: _off, quietStart: quietOk ? _fmt(_from) : null, quietEnd: quietOk ? _fmt(_to) : null));
      if (!mounted) return;
      setState(() => _prefs = saved);
      messenger?.showSnackBar(SnackBar(content: Text(widget.strings.saved)));
    } catch (_) {
      messenger?.showSnackBar(SnackBar(content: Text(widget.strings.loadFailed)));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _pick(bool start) async {
    final t = await showTimePicker(context: context, initialTime: start ? _from : _to);
    if (t != null) setState(() => start ? _from = t : _to = t);
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.strings;
    final p = _prefs;
    return Scaffold(
      appBar: AppBar(
        title: Text(s.notificationSettings),
        actions: [if (p != null) TextButton(key: const Key('prefs-save'), onPressed: _saving ? null : _save, child: Text(s.save))],
      ),
      body: _failed
          ? Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [Text(s.loadFailed, textAlign: TextAlign.center), TextButton(onPressed: _load, child: Text(s.retry))],
              ),
            )
          : p == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              children: [
                Padding(padding: const EdgeInsets.all(16), child: Text(s.notificationSettingsHint)),
                SwitchListTile(key: const Key('quiet-hours'), title: Text(s.quietHours), subtitle: Text(s.quietHoursHint), value: _quiet, onChanged: (v) => setState(() => _quiet = v)),
                if (_quiet) ...[
                  ListTile(key: const Key('quiet-from'), title: Text(s.quietFrom), trailing: Text(_fmt(_from)), onTap: () => _pick(true)),
                  ListTile(key: const Key('quiet-to'), title: Text(s.quietTo), trailing: Text(_fmt(_to)), onTap: () => _pick(false)),
                ],
                const Divider(),
                for (final k in widget.kinds?.where(p.kinds.contains) ?? p.kinds)
                  SwitchListTile(
                    key: Key('kind-$k'),
                    title: Text(s.kindLabel(k)),
                    value: !_off.contains(k),
                    onChanged: (on) => setState(() => on ? _off.remove(k) : _off.add(k)),
                  ),
              ],
            ),
    );
  }
}

// ── Offline ─────────────────────────────────────────────────────────────────────────────────────

/// The last answer to each GET of the core screens, kept as files so the app opens offline. Wiped on sign-out.
class KxReadCache {
  KxReadCache(this.dir);

  /// Null: nothing kept (tests, demo builds).
  final Future<Directory?> Function() dir;

  /// True while answers come from the cache because the server cannot be reached.
  final offline = ValueNotifier<bool>(false);

  static String _name(String path) => base64Url.encode(utf8.encode(path)).replaceAll('=', '');

  Future<void> put(String path, String body) async {
    try {
      final d = await dir();
      if (d == null) return;
      await d.create(recursive: true);
      await File('${d.path}/${_name(path)}.json').writeAsString(body, flush: true);
    } catch (_) {}
  }

  Future<String?> get(String path) async {
    try {
      final d = await dir();
      if (d == null) return null;
      final f = File('${d.path}/${_name(path)}.json');
      return await f.exists() ? await f.readAsString() : null;
    } catch (_) {
      return null;
    }
  }
}

/// A write that could not be sent (offline), kept until it goes through.
class KxQueuedWrite {
  KxQueuedWrite({required this.id, required this.method, required this.path, required this.body, required this.label, this.attempts = 0});

  factory KxQueuedWrite.fromJson(Map<String, dynamic> j) =>
      KxQueuedWrite(id: '${j['id']}', method: '${j['method']}', path: '${j['path']}', body: j['body'], label: '${j['label'] ?? ''}', attempts: (j['attempts'] as num?)?.toInt() ?? 0);

  final String id, method, path, label;
  final Object? body;
  int attempts;

  Map<String, Object?> toJson() => {'id': id, 'method': method, 'path': path, 'body': body, 'label': label, 'attempts': attempts};
}

/// Writes queued offline, kept in a file and sent in order once the server answers again.
/// A write the server refuses (4xx) is dropped and reported through [onRejected]; network failures stay queued.
class KxWriteQueue {
  KxWriteQueue({required this.file, required this.send, this.onRejected});

  /// Null: kept in memory only (tests).
  final Future<File?> Function() file;

  /// Sends one write; throws [KxSendFailure] (offline when [KxSendFailure.offline]).
  final Future<void> Function(KxQueuedWrite w) send;
  final void Function(KxQueuedWrite w, Object error)? onRejected;

  final pending = ValueNotifier<List<KxQueuedWrite>>(const []);
  bool _loaded = false, _flushing = false;

  Future<void> _load() async {
    if (_loaded) return;
    _loaded = true;
    try {
      final f = await file();
      if (f != null && await f.exists()) {
        pending.value = [for (final e in jsonDecode(await f.readAsString()) as List) KxQueuedWrite.fromJson((e as Map).cast<String, dynamic>())];
      }
    } catch (_) {}
  }

  Future<void> _persist() async {
    try {
      final f = await file();
      if (f == null) return;
      await f.parent.create(recursive: true);
      await f.writeAsString(jsonEncode([for (final w in pending.value) w.toJson()]), flush: true);
    } catch (_) {}
  }

  /// Queues a write; a later write to the same [path] replaces an earlier one still waiting (the newest marks win).
  Future<void> add(String method, String path, Object? body, {String label = ''}) async {
    await _load();
    final id = '${DateTime.now().microsecondsSinceEpoch}';
    pending.value = [...pending.value.where((w) => w.path != path || w.method != method), KxQueuedWrite(id: id, method: method, path: path, body: body, label: label)];
    await _persist();
  }

  /// Sends what is waiting, oldest first; stops at the first network failure. Returns how many went through.
  Future<int> flush() async {
    await _load();
    if (_flushing) return 0;
    _flushing = true;
    var sent = 0;
    try {
      while (pending.value.isNotEmpty) {
        final w = pending.value.first;
        try {
          await send(w);
          sent++;
        } on KxSendFailure catch (e) {
          if (e.offline) {
            w.attempts++;
            await _persist();
            break;
          }
          onRejected?.call(w, e);
        }
        pending.value = pending.value.skip(1).toList();
        await _persist();
      }
    } finally {
      _flushing = false;
    }
    return sent;
  }

  Future<void> clear() async {
    await _load();
    pending.value = const [];
    await _persist();
  }
}

/// Why a queued write did not go through.
class KxSendFailure implements Exception {
  const KxSendFailure({required this.offline, this.status = 0});
  final bool offline;
  final int status;
}

/// "You are offline: showing what was saved", above a screen's content.
class KxOfflineBanner extends StatelessWidget {
  const KxOfflineBanner({super.key, required this.offline, required this.text, this.pending, this.pendingText});

  final ValueListenable<bool> offline;
  final String text;
  final ValueListenable<List<KxQueuedWrite>>? pending;
  final String Function(int n)? pendingText;

  @override
  Widget build(BuildContext context) => ValueListenableBuilder<bool>(
    valueListenable: offline,
    builder: (context, off, _) {
      final waiting = pending == null ? null : ValueListenableBuilder<List<KxQueuedWrite>>(
        valueListenable: pending!,
        builder: (context, p, _) => p.isEmpty || pendingText == null ? const SizedBox.shrink() : _bar(context, pendingText!(p.length), Icons.cloud_upload_outlined, const Key('pending-writes')),
      );
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [if (off) _bar(context, text, Icons.cloud_off, const Key('offline-banner')), ?waiting],
      );
    },
  );

  Widget _bar(BuildContext context, String t, IconData icon, Key key) => Semantics(
    liveRegion: true,
    child: Material(
      key: key,
      color: Theme.of(context).colorScheme.tertiaryContainer,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        child: Row(
          children: [
            Icon(icon, size: 18),
            const SizedBox(width: 8),
            Expanded(child: Text(t, style: TextStyle(color: Theme.of(context).colorScheme.onTertiaryContainer))),
          ],
        ),
      ),
    ),
  );
}

// ── Screenshot protection ───────────────────────────────────────────────────────────────────────

/// Android `FLAG_SECURE` through `MainActivity` (screenshots, screen recording and the app switcher show black).
const kSecureScreenChannel = MethodChannel('in.zynetix/secure_screen');

/// Keeps screenshots off while this screen is open (payslips, marks, fees, sign-in codes). Nested ones count.
class KxSecureScreen extends StatefulWidget {
  const KxSecureScreen({super.key, required this.child});

  final Widget child;

  static int _depth = 0;

  /// How many protected screens are open (tests).
  static int get depth => _depth;

  static Future<void> _set(bool on) async {
    try {
      await kSecureScreenChannel.invokeMethod<void>('setSecure', on);
    } catch (_) {
      // Not Android, or an older shell without the channel.
    }
  }

  @override
  State<KxSecureScreen> createState() => _KxSecureScreenState();
}

class _KxSecureScreenState extends State<KxSecureScreen> {
  @override
  void initState() {
    super.initState();
    if (KxSecureScreen._depth++ == 0) KxSecureScreen._set(true);
  }

  @override
  void dispose() {
    if (--KxSecureScreen._depth == 0) KxSecureScreen._set(false);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
