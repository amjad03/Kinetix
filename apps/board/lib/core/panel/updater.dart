import 'dart:async';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'package:url_launcher/url_launcher.dart';

import 'panel_models.dart';

/// What happened when the board handed the downloaded file to the system.
enum InstallOutcome {
  /// Android installs it (silently as device owner, else after the system's prompt).
  started,

  /// Android: "install unknown apps" is not allowed for the board yet; Settings is opened.
  needsPermission,

  /// Desktop: the installer or zip was opened for the teacher or IT to finish.
  opened,
}

/// The operating system's side of an update.
abstract class UpdateInstaller {
  /// Whether the update installs without asking anyone (Android as device owner): then the board
  /// downloads and installs as soon as it is offered.
  Future<bool> silent();

  Future<InstallOutcome> install(File file);

  /// A failure the system reported after the last install attempt (Android), once.
  Future<String?> lastError() async => null;

  /// Where downloads go.
  Future<Directory> directory();
}

/// Android: PackageInstaller through the `kinetix/panel` channel (PanelBridge.kt).
class AndroidUpdateInstaller extends UpdateInstaller {
  AndroidUpdateInstaller({MethodChannel? channel}) : _channel = channel ?? const MethodChannel('kinetix/panel');

  final MethodChannel _channel;

  Future<Map<Object?, Object?>> _info() async => await _channel.invokeMapMethod<Object?, Object?>('installInfo') ?? const {};

  @override
  Future<bool> silent() async {
    try {
      return (await _info())['deviceOwner'] == true;
    } on MissingPluginException {
      return false;
    }
  }

  @override
  Future<String?> lastError() async {
    try {
      return (await _info())['lastError'] as String?;
    } on MissingPluginException {
      return null;
    }
  }

  @override
  Future<InstallOutcome> install(File file) async {
    final r = await _channel.invokeMethod<String>('installApk', {'path': file.path});
    if (r == 'needsPermission') {
      await _channel.invokeMethod<void>('openInstallSettings');
      return InstallOutcome.needsPermission;
    }
    return InstallOutcome.started;
  }

  @override
  Future<Directory> directory() async => Directory('${(await getTemporaryDirectory()).path}/updates').create(recursive: true);
}

/// Windows, macOS and Linux: the file is saved to Downloads and opened (installer, dmg or zip).
class DesktopUpdateInstaller extends UpdateInstaller {
  DesktopUpdateInstaller({Future<bool> Function(Uri uri)? open}) : _open = open ?? launchUrl;

  final Future<bool> Function(Uri uri) _open;

  @override
  Future<bool> silent() async => false;

  @override
  Future<InstallOutcome> install(File file) async {
    if (!await _open(Uri.file(file.path))) throw Exception('Could not open ${file.path}');
    return InstallOutcome.opened;
  }

  @override
  Future<Directory> directory() async => (await getDownloadsDirectory()) ?? await getTemporaryDirectory();
}

enum UpdatePhase { idle, available, downloading, installing, waitingPermission, opened, failed }

typedef OpenDownload = Future<({Stream<List<int>> body, int? length})> Function(String url);
typedef ReportUpdate = Future<void> Function(String releaseId, String state, {String? error});

/// Takes the updates the dashboard rolls out: told about one by the health report's answer, it
/// downloads the file (checking its SHA-256), installs it (Android) or opens it (desktop), and
/// reports each step so the dashboard shows where every board is.
class PanelUpdater extends ChangeNotifier {
  PanelUpdater({required this.open, required this.report, required this.installer});

  final OpenDownload open;
  final ReportUpdate report;
  final UpdateInstaller installer;

  UpdateOffer? offer;
  UpdatePhase phase = UpdatePhase.idle;

  /// 0..1 while downloading, when the size is known.
  double? progress;
  String? error;

  /// The teacher chose "Later" for this release: no prompt until another one is offered.
  String? _postponed;

  bool get prompt => offer != null && (phase == UpdatePhase.available || phase == UpdatePhase.failed || phase == UpdatePhase.opened || phase == UpdatePhase.waitingPermission);

  bool get busy => phase == UpdatePhase.downloading || phase == UpdatePhase.installing;

  /// After a restart: a failure the system reported for the last install.
  Future<void> checkLastInstall() async {
    final e = await installer.lastError();
    if (e != null && offer != null) await _report('failed', error: e);
  }

  /// The server's answer about updates (null: nothing to take).
  Future<void> onOffer(UpdateOffer? o) async {
    if (o == null) {
      if (!busy) {
        offer = null;
        phase = UpdatePhase.idle;
        notifyListeners();
      }
      return;
    }
    if (o == offer && phase != UpdatePhase.idle) return;
    if (busy) return;
    offer = o;
    error = null;
    phase = o.releaseId == _postponed ? UpdatePhase.idle : UpdatePhase.available;
    notifyListeners();
    if (await installer.silent()) await apply();
  }

  void postpone() {
    final o = offer;
    if (o == null) return;
    _postponed = o.releaseId;
    phase = UpdatePhase.idle;
    notifyListeners();
    unawaited(_report('declined'));
  }

  Future<void> _report(String state, {String? error}) async {
    final o = offer;
    if (o == null) return;
    try {
      await report(o.releaseId, state, error: error);
    } catch (e) {
      debugPrint('Update status not reported: $e');
    }
  }

  /// Downloads, checks and installs (or opens) the offered update.
  Future<void> apply() async {
    final o = offer;
    if (o == null || busy) return;
    phase = UpdatePhase.downloading;
    progress = 0;
    error = null;
    notifyListeners();
    await _report('downloading');
    File? file;
    try {
      file = await _download(o);
      await _report('downloaded');
      phase = UpdatePhase.installing;
      notifyListeners();
      final outcome = await installer.install(file);
      switch (outcome) {
        case InstallOutcome.started:
          await _report('installing');
        case InstallOutcome.needsPermission:
          phase = UpdatePhase.waitingPermission;
        case InstallOutcome.opened:
          phase = UpdatePhase.opened;
      }
    } catch (e) {
      phase = UpdatePhase.failed;
      error = '$e';
      await _report('failed', error: error);
    }
    progress = null;
    notifyListeners();
  }

  Future<File> _download(UpdateOffer o) async {
    final dir = await installer.directory();
    final name = (o.fileName ?? 'zynetix-board-${o.version}').replaceAll(RegExp(r'[\\/:*?"<>|]'), '_');
    final file = File('${dir.path}/$name');
    final res = await open(o.url);
    final total = res.length ?? o.bytes;
    final sink = file.openWrite();
    final hashOut = _DigestSink();
    final hasher = sha256.startChunkedConversion(hashOut);
    var got = 0;
    try {
      await for (final chunk in res.body) {
        sink.add(chunk);
        hasher.add(chunk);
        got += chunk.length;
        if (total != null && total > 0) {
          progress = (got / total).clamp(0, 1).toDouble();
          notifyListeners();
        }
      }
    } finally {
      await sink.close();
      hasher.close();
    }
    if (o.sha256 != null && hashOut.value.toString() != o.sha256!.toLowerCase()) {
      await file.delete();
      throw Exception('The download is damaged (checksum mismatch)');
    }
    return file;
  }
}

class _DigestSink implements Sink<Digest> {
  late Digest value;

  @override
  void add(Digest data) => value = data;

  @override
  void close() {}
}
