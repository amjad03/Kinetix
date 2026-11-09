import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Zynetix Classroom's updates without the Play Store.
///
/// The board reads a small manifest over HTTPS ([AppUpdates.manifestUrl], published beside the
/// APKs on the apk-builds branch), downloads the APK for its ABI with progress, checks its size
/// and SHA-256, and hands it to Android's installer, which asks the teacher to confirm. An APK
/// from a USB drive is checked the same way (package name, version, signing certificate) before
/// it is installed. Android itself refuses an APK signed with another certificate or older than
/// the installed one. Nothing is ever installed without the teacher tapping Install.
///
/// The manifest:
///
/// ```json
/// {"app": "in.zynetix.classroom", "versionCode": 2, "versionName": "1.1.0",
///  "notes": {"en": "…", "kn": "…"},
///  "apks": {"arm64-v8a": {"versionCode": 2002, "url": "https://…", "sha256": "…", "size": 123},
///           "armeabi-v7a": {"versionCode": 1002, "url": "https://…", "sha256": "…", "size": 123}}}
/// ```
///
/// `versionCode` at the top is the build number; each APK's is what Android compares (with
/// `--split-per-abi` Flutter adds 1000 × the ABI's number: armeabi-v7a 1, arm64-v8a 2, x86_64 4).
class UpdateManifest {
  UpdateManifest({required this.app, required this.versionCode, required this.versionName, required this.notes, required this.apks});

  final String? app;
  final int versionCode;
  final String versionName;
  final Map<String, String> notes;
  final Map<String, UpdateApk> apks;

  factory UpdateManifest.fromJson(Map<String, dynamic> j) {
    final code = (j['versionCode'] as num).toInt();
    final apks = <String, UpdateApk>{};
    for (final e in (j['apks'] as Map).entries) {
      final abi = e.key as String;
      final a = (e.value as Map).cast<String, dynamic>();
      apks[abi] = UpdateApk(
        abi: abi,
        versionCode: (a['versionCode'] as num?)?.toInt() ?? (abiCodes[abi] ?? 0) * 1000 + code,
        url: Uri.parse(a['url'] as String),
        sha256: (a['sha256'] as String).toLowerCase(),
        size: (a['size'] as num).toInt(),
      );
      if (apks[abi]!.url.scheme != 'https') throw const FormatException('update links must be https');
      if (!RegExp(r'^[0-9a-f]{64}$').hasMatch(apks[abi]!.sha256)) throw FormatException('bad sha256 for $abi');
    }
    return UpdateManifest(
      app: j['app'] as String?,
      versionCode: code,
      versionName: j['versionName'] as String,
      notes: {for (final e in ((j['notes'] as Map?) ?? const {}).entries) e.key as String: e.value as String},
      apks: apks,
    );
  }

  /// The release notes in [lang] ('kn' or 'en'), English when there are none in it.
  String notesIn(String lang) => notes[lang] ?? notes['en'] ?? '';

  /// The APK for [app]: the installed APK's own ABI (from its versionCode), else the first of
  /// the device's ABIs the manifest has.
  UpdateApk? apkFor(InstalledApp app) {
    final own = app.abi;
    if (own != null) return apks[own];
    for (final abi in app.abis) {
      if (apks[abi] case final a?) return a;
    }
    return null;
  }

  /// Flutter's split-per-abi numbers.
  static const abiCodes = {'armeabi-v7a': 1, 'arm64-v8a': 2, 'x86_64': 4};
}

class UpdateApk {
  const UpdateApk({required this.abi, required this.versionCode, required this.url, required this.sha256, required this.size});
  final String abi;
  final int versionCode;
  final Uri url;
  final String sha256;
  final int size;
}

/// The app as installed (or an APK file, from [UpdatePlatform.inspect]).
class InstalledApp {
  const InstalledApp({required this.packageName, required this.versionCode, required this.versionName, this.certificates = const [], this.abis = const []});

  factory InstalledApp.fromMap(Map<Object?, Object?> m) => InstalledApp(
    packageName: m['packageName'] as String? ?? '',
    versionCode: (m['versionCode'] as num?)?.toInt() ?? 0,
    versionName: m['versionName'] as String? ?? '',
    certificates: [for (final c in (m['certificates'] as List?) ?? const []) '$c'],
    abis: [for (final a in (m['abis'] as List?) ?? const []) '$a'],
  );

  final String packageName;
  final int versionCode;
  final String versionName;

  /// SHA-256 of the signing certificates, lower-case hex.
  final List<String> certificates;

  /// The device's ABIs, preferred first (the installed app only).
  final List<String> abis;

  /// The ABI this split APK was built for, read from its versionCode (null for a universal APK).
  String? get abi {
    if (versionCode < 1000) return null;
    final n = versionCode ~/ 1000;
    for (final e in UpdateManifest.abiCodes.entries) {
      if (e.value == n) return e.key;
    }
    return null;
  }
}

/// What a check found.
sealed class UpdateCheck {
  const UpdateCheck();
}

class UpToDate extends UpdateCheck {
  const UpToDate(this.installed);
  final InstalledApp installed;
}

class UpdateAvailable extends UpdateCheck {
  const UpdateAvailable(this.manifest, this.apk, this.installed);
  final UpdateManifest manifest;
  final UpdateApk apk;
  final InstalledApp installed;
}

/// No APK for this board's ABI in the manifest, or a manifest for another app.
class UpdateNotForThisBoard extends UpdateCheck {
  const UpdateNotForThisBoard(this.manifest, this.installed);
  final UpdateManifest manifest;
  final InstalledApp installed;
}

/// Could not check (offline, the server, a bad manifest).
class UpdateCheckFailed extends UpdateCheck {
  const UpdateCheckFailed(this.error);
  final Object error;
}

/// A download that does not match the manifest (size or SHA-256): never installed.
class UpdateVerifyException implements Exception {
  const UpdateVerifyException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Why an APK from a USB drive cannot be installed over this app.
enum ApkProblem { notAnApk, otherApp, notNewer, otherSigner }

/// The Android side (android/…/Updater.kt); tests use [FakeUpdatePlatform].
abstract class UpdatePlatform {
  static UpdatePlatform instance = AndroidUpdatePlatform();

  Future<InstalledApp?> installed();
  Future<InstalledApp?> inspect(String path);
  Future<bool> canInstall();
  Future<void> openInstallPermission();
  Future<void> install(String path);

  /// Where downloads go (the app's cache, updates/: the folder the installer is shown).
  Future<Directory> updatesDir() async {
    final d = Directory('${(await getTemporaryDirectory()).path}${Platform.pathSeparator}updates');
    await d.create(recursive: true);
    return d;
  }
}

class AndroidUpdatePlatform extends UpdatePlatform {
  AndroidUpdatePlatform({MethodChannel? channel}) : _channel = channel ?? const MethodChannel('zynetix/update');
  final MethodChannel _channel;

  bool get _android => !kIsWeb && Platform.isAndroid;

  @override
  Future<InstalledApp?> installed() async {
    if (!_android) return null;
    final m = await _channel.invokeMapMethod<Object?, Object?>('installed');
    return m == null ? null : InstalledApp.fromMap(m);
  }

  @override
  Future<InstalledApp?> inspect(String path) async {
    if (!_android) return null;
    final m = await _channel.invokeMapMethod<Object?, Object?>('inspect', {'path': path});
    return m == null ? null : InstalledApp.fromMap(m);
  }

  @override
  Future<bool> canInstall() async => _android && (await _channel.invokeMethod<bool>('canInstall') ?? false);

  @override
  Future<void> openInstallPermission() => _channel.invokeMethod<void>('openInstallPermission');

  @override
  Future<void> install(String path) => _channel.invokeMethod<void>('install', {'path': path});
}

/// For tests (and builds with no Android).
class FakeUpdatePlatform extends UpdatePlatform {
  FakeUpdatePlatform({this.app, Map<String, InstalledApp>? files, this.allowed = true, this.dir}) : files = files ?? {};
  InstalledApp? app;
  final Map<String, InstalledApp> files;
  bool allowed;
  final installs = <String>[];
  int permissionAsked = 0;
  final Directory? dir;

  @override
  Future<InstalledApp?> installed() async => app;
  @override
  Future<InstalledApp?> inspect(String path) async => files[path];
  @override
  Future<bool> canInstall() async => allowed;
  @override
  Future<void> openInstallPermission() async => permissionAsked++;
  @override
  Future<void> install(String path) async => installs.add(path);
  @override
  Future<Directory> updatesDir() async => dir ?? await super.updatesDir();
}

/// Checks, downloads and verifies updates; remembers the last daily check for the badge.
class AppUpdates extends ChangeNotifier {
  AppUpdates({UpdatePlatform? platform, http.Client Function()? client, Future<bool> Function()? online, DateTime Function()? now, Uri? manifestUrl})
    : platform = platform ?? UpdatePlatform.instance,
      _client = client ?? http.Client.new,
      _online = online ?? _defaultOnline,
      _now = now ?? DateTime.now,
      manifestUrl = manifestUrl ?? defaultManifestUrl;

  /// The board's one (the start screen's badge and Settings share it).
  static AppUpdates instance = AppUpdates();

  /// Published with every release beside the APKs (apk-builds branch).
  static final defaultManifestUrl = Uri.parse('https://raw.githubusercontent.com/amjad03/zynetix-smart-classroom/apk-builds/classroom-update.json');

  final UpdatePlatform platform;
  final http.Client Function() _client;
  final Future<bool> Function() _online;
  final DateTime Function() _now;
  final Uri manifestUrl;

  /// Shared preferences keys: when the board last checked, and what it found newer.
  static const lastCheckKey = 'ce.update.lastCheck';
  static const availableKey = 'ce.update.available';

  /// At most one quiet check a day.
  static const checkEvery = Duration(hours: 24);

  /// The newer version the last check found ("1.1.0"), for the quiet badge; null when none.
  String? get availableVersion => _available;
  String? _available;
  bool _loaded = false;

  static Future<bool> _defaultOnline() async {
    try {
      final r = await InternetAddress.lookup('raw.githubusercontent.com').timeout(const Duration(seconds: 3));
      return r.isNotEmpty;
    } catch (_) {
      return false;
    }
  }

  Future<void> _load() async {
    if (_loaded) return;
    _loaded = true;
    final p = await SharedPreferences.getInstance();
    final a = p.getString(availableKey);
    final installed = await _installedOrNull();
    if (a != null) {
      // Forget a badge for a version that is installed by now.
      final parts = a.split('|');
      final code = int.tryParse(parts.first) ?? 0;
      if (installed != null && installed.versionCode >= code) {
        await p.remove(availableKey);
      } else {
        _available = parts.length > 1 ? parts[1] : null;
      }
    }
  }

  Future<InstalledApp?> _installedOrNull() async {
    try {
      return await platform.installed();
    } catch (_) {
      return null;
    }
  }

  /// The quiet daily check behind the badge: at most once a [checkEvery], only when online,
  /// never installs anything. Answers whether it checked.
  Future<bool> checkDaily() async {
    // Only the Android app updates itself.
    if (await _installedOrNull() == null) return false;
    await _load();
    final p = await SharedPreferences.getInstance();
    final last = p.getInt(lastCheckKey);
    final now = _now();
    if (last != null && now.difference(DateTime.fromMillisecondsSinceEpoch(last)).abs() < checkEvery) {
      notifyListeners();
      return false;
    }
    if (!await _online()) return false;
    await check();
    return true;
  }

  /// Reads the manifest and compares it with what is installed. Never throws.
  Future<UpdateCheck> check() async {
    await _load();
    try {
      final installed = await platform.installed();
      if (installed == null) return const UpdateCheckFailed('Updates are only for the Android app.');
      final c = _client();
      final http.Response r;
      try {
        r = await c.get(manifestUrl, headers: const {'Cache-Control': 'no-cache'}).timeout(const Duration(seconds: 20));
      } finally {
        c.close();
      }
      if (r.statusCode != 200) return UpdateCheckFailed('HTTP ${r.statusCode}');
      final m = UpdateManifest.fromJson(jsonDecode(utf8.decode(r.bodyBytes)) as Map<String, dynamic>);
      final p = await SharedPreferences.getInstance();
      await p.setInt(lastCheckKey, _now().millisecondsSinceEpoch);
      final apk = m.apkFor(installed);
      UpdateCheck result;
      if ((m.app != null && m.app != installed.packageName) || apk == null) {
        result = UpdateNotForThisBoard(m, installed);
      } else if (apk.versionCode > installed.versionCode) {
        result = UpdateAvailable(m, apk, installed);
      } else {
        result = UpToDate(installed);
      }
      if (result is UpdateAvailable) {
        _available = m.versionName;
        await p.setString(availableKey, '${result.apk.versionCode}|${m.versionName}');
      } else {
        _available = null;
        await p.remove(availableKey);
      }
      notifyListeners();
      return result;
    } catch (e) {
      return UpdateCheckFailed(e);
    }
  }

  /// Downloads [apk] into the updates folder with [onProgress] (0…1), then checks its size and
  /// SHA-256 against the manifest; a file that does not match is deleted and
  /// [UpdateVerifyException] thrown. [cancel] completing stops the download.
  Future<File> download(UpdateApk apk, {void Function(double progress)? onProgress, Future<void>? cancel}) async {
    final dir = await platform.updatesDir();
    final file = File('${dir.path}${Platform.pathSeparator}zynetix-classroom-${apk.versionCode}.apk');
    final part = File('${file.path}.part');
    final c = _client();
    var cancelled = false;
    unawaited(cancel?.then((_) {
      cancelled = true;
      c.close();
    }));
    try {
      final res = await c.send(http.Request('GET', apk.url));
      if (res.statusCode != 200) throw HttpException('HTTP ${res.statusCode}', uri: apk.url);
      final sink = part.openWrite();
      final digest = _DigestSink();
      final hash = sha256.startChunkedConversion(digest);
      var got = 0;
      try {
        await for (final chunk in res.stream) {
          if (cancelled) break;
          got += chunk.length;
          if (got > apk.size) throw const UpdateVerifyException('The download is bigger than the update should be.');
          sink.add(chunk);
          hash.add(chunk);
          onProgress?.call(apk.size == 0 ? 0 : got / apk.size);
        }
      } finally {
        await sink.close();
      }
      if (cancelled) throw const UpdateCancelled();
      hash.close();
      if (got != apk.size) throw UpdateVerifyException('The download is $got bytes, not ${apk.size}.');
      if ('${digest.value}' != apk.sha256) throw const UpdateVerifyException('The download does not match the update (SHA-256).');
      if (file.existsSync()) file.deleteSync();
      return part.renameSync(file.path);
    } catch (e) {
      if (part.existsSync()) part.deleteSync();
      if (cancelled && e is! UpdateCancelled) throw const UpdateCancelled();
      rethrow;
    } finally {
      c.close();
    }
  }

  /// Whether the APK at [path] can be installed over this app: the same package, newer, signed
  /// with the same certificate. Null when it can (with what it is in [inspected]).
  Future<({ApkProblem? problem, InstalledApp? apk, InstalledApp? installed})> checkApk(String path) async {
    final installed = await platform.installed();
    final apk = await platform.inspect(path);
    if (apk == null || installed == null) return (problem: ApkProblem.notAnApk, apk: apk, installed: installed);
    if (apk.packageName != installed.packageName) return (problem: ApkProblem.otherApp, apk: apk, installed: installed);
    if (apk.versionCode <= installed.versionCode) return (problem: ApkProblem.notNewer, apk: apk, installed: installed);
    if (apk.certificates.isNotEmpty && installed.certificates.isNotEmpty && !apk.certificates.any(installed.certificates.contains)) {
      return (problem: ApkProblem.otherSigner, apk: apk, installed: installed);
    }
    return (problem: null, apk: apk, installed: installed);
  }

  /// Hands [file] to Android's installer, first asking for "Install unknown apps" when this
  /// app does not have it yet (answers false then: try again after allowing it).
  Future<bool> install(String path) async {
    if (!await platform.canInstall()) {
      await platform.openInstallPermission();
      return false;
    }
    await platform.install(path);
    return true;
  }
}

class UpdateCancelled implements Exception {
  const UpdateCancelled();
}

class _DigestSink implements Sink<Digest> {
  Digest? value;
  @override
  void add(Digest data) => value = data;
  @override
  void close() {}
}
