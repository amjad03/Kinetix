import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../l10n/ce_strings.dart';
import '../ui/ce_style.dart';
import 'app_update.dart';

/// How the update screens pick an APK from a USB drive (tests replace it). Null when cancelled.
Future<String?> Function() pickUpdateApk = () async {
  final files = await FilePicker.pickFiles(type: FileType.custom, allowedExtensions: const ['apk'], dialogTitle: ceTr('Choose the Zynetix Classroom APK'));
  return files.isEmpty ? null : files.single.path;
};

String _mb(int bytes) => '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';

/// Settings → This board → App updates: the version on the board, Check for update and
/// Install from USB….
class UpdateSection extends StatefulWidget {
  const UpdateSection({super.key, this.updates});
  final AppUpdates? updates;

  @override
  State<UpdateSection> createState() => _UpdateSectionState();
}

class _UpdateSectionState extends State<UpdateSection> {
  AppUpdates get updates => widget.updates ?? AppUpdates.instance;
  InstalledApp? _app;

  @override
  void initState() {
    super.initState();
    unawaited(updates.platform.installed().then((a) {
      if (mounted) setState(() => _app = a);
    }, onError: (Object _) {}));
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: updates,
    builder: (context, _) => Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(context.ce('App updates'), style: ceHeading(20)),
        const SizedBox(height: Kx.s8),
        Text(
          _app == null ? context.ce('Zynetix Classroom on this board.') : context.ce('Zynetix Classroom {version} on this board.', {'version': _app!.versionName}),
          key: const Key('ce-update-version'),
          style: ceText(16),
        ),
        if (updates.availableVersion != null) ...[
          const SizedBox(height: Kx.s8),
          cePill(context.ce('Update available: {version}', {'version': updates.availableVersion}), icon: Icons.system_update_outlined, key: const Key('ce-update-available')),
        ],
        const SizedBox(height: Kx.s8),
        Text(context.ce('Updates come from the internet or from a USB drive. Nothing is installed until you tap Install, and Android only installs a newer Zynetix Classroom signed by Zynetix.'), style: ceText(15)),
        const SizedBox(height: Kx.s12),
        Wrap(
          spacing: Kx.s12,
          runSpacing: Kx.s12,
          children: [
            OutlinedButton.icon(key: const Key('ce-update-check'), style: ceSoftButton(), onPressed: () => unawaited(checkForUpdateFlow(context, updates)), icon: const Icon(Icons.system_update_outlined), label: Text(context.ce('Check for update'))),
            OutlinedButton.icon(key: const Key('ce-update-usb'), style: ceSoftButton(), onPressed: () => unawaited(installFromUsbFlow(context, updates)), icon: const Icon(Icons.usb), label: Text(context.ce('Install from USB…'))),
          ],
        ),
      ],
    ),
  );
}

/// The quiet badge for the start screen's Settings button: a small dot while a newer version
/// is waiting (from the daily check). Never installs anything.
class UpdateBadge extends StatelessWidget {
  const UpdateBadge({super.key, required this.child, this.updates});
  final Widget child;
  final AppUpdates? updates;

  @override
  Widget build(BuildContext context) {
    final u = updates ?? AppUpdates.instance;
    return ListenableBuilder(
      listenable: u,
      builder: (context, _) {
        final v = u.availableVersion;
        if (v == null) return child;
        return Semantics(
          label: context.ce('Update available: {version}', {'version': v}),
          child: Badge(key: const Key('ce-update-badge'), backgroundColor: CeC.accent, smallSize: 14, child: child),
        );
      },
    );
  }
}

void _snack(BuildContext context, String text) =>
    ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(text), duration: const Duration(seconds: 8), persist: false));

/// Check for update: reads the manifest, shows what is new, downloads with progress, checks the
/// SHA-256 and opens Android's installer.
Future<void> checkForUpdateFlow(BuildContext context, AppUpdates updates) async {
  await showDialog<void>(context: context, barrierDismissible: false, builder: (_) => _UpdateDialog(updates: updates));
}

enum _Step { checking, result, downloading, ready, failed }

class _UpdateDialog extends StatefulWidget {
  const _UpdateDialog({required this.updates});
  final AppUpdates updates;
  @override
  State<_UpdateDialog> createState() => _UpdateDialogState();
}

class _UpdateDialogState extends State<_UpdateDialog> {
  _Step _step = _Step.checking;
  UpdateCheck? _check;
  double _progress = 0;
  Completer<void>? _cancel;
  String? _file;
  String? _error;

  @override
  void initState() {
    super.initState();
    unawaited(_run());
  }

  Future<void> _run() async {
    final c = await widget.updates.check();
    if (!mounted) return;
    setState(() {
      _check = c;
      _step = c is UpdateCheckFailed ? _Step.failed : _Step.result;
      if (c is UpdateCheckFailed) _error = context.ce('Could not check for an update. Is the board online? ({error})', {'error': c.error});
    });
  }

  Future<void> _download(UpdateAvailable u) async {
    setState(() {
      _step = _Step.downloading;
      _progress = 0;
      _cancel = Completer<void>();
    });
    try {
      final f = await widget.updates.download(u.apk, cancel: _cancel!.future, onProgress: (p) {
        if (mounted) setState(() => _progress = p);
      });
      if (!mounted) return;
      setState(() {
        _file = f.path;
        _step = _Step.ready;
      });
      await _install();
    } on UpdateCancelled {
      if (mounted) Navigator.of(context).pop();
    } on UpdateVerifyException catch (e) {
      if (mounted) {
        setState(() {
          _step = _Step.failed;
          _error = context.ce('The download was damaged and has been deleted: {error} Try again.', {'error': e.message});
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _step = _Step.failed;
          _error = context.ce('The download stopped: {error}', {'error': e});
        });
      }
    }
  }

  Future<void> _install() async {
    final f = _file;
    if (f == null) return;
    try {
      final started = await widget.updates.install(f);
      if (!mounted) return;
      if (!started) {
        _snack(context, context.ce('Allow “Install unknown apps” for Zynetix Classroom, then come back and tap Install.'));
      }
    } catch (e) {
      if (mounted) setState(() => _error = context.ce('Android could not open the installer: {error}', {'error': e}));
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = _check;
    final lang = context.ceKannada ? 'kn' : 'en';
    final (title, body, actions) = switch (_step) {
      _Step.checking => (context.ce('Checking for an update…'), const <Widget>[Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()))], <Widget>[]),
      _Step.result => switch (c) {
        UpdateAvailable(:final manifest, :final apk) => (
          context.ce('Zynetix Classroom {version} is ready', {'version': manifest.versionName}),
          <Widget>[
            Text(context.ce('This board has {current}. The update is {size}.', {'current': c.installed.versionName, 'size': _mb(apk.size)}), style: ceText(16)),
            if (manifest.notesIn(lang).isNotEmpty) ...[const SizedBox(height: 12), Text(manifest.notesIn(lang), key: const Key('ce-update-notes'), style: ceText(16, c: CeC.body))],
          ],
          <Widget>[
            TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(context.ce('Not now'))),
            FilledButton.icon(key: const Key('ce-update-download'), style: ceBigButton(), onPressed: () => unawaited(_download(c)), icon: const Icon(Icons.download), label: Text(context.ce('Download and install'))),
          ],
        ),
        UpToDate(:final installed) => (context.ce('Zynetix Classroom is up to date'), <Widget>[Text(context.ce('This board has the newest version, {version}.', {'version': installed.versionName}), style: ceText(16))], <Widget>[FilledButton(style: ceBigButton(), onPressed: () => Navigator.of(context).pop(), child: Text(context.ce('OK')))]),
        UpdateNotForThisBoard() || _ => (context.ce('No update for this board'), <Widget>[Text(context.ce('The published update has no APK for this board.'), style: ceText(16))], <Widget>[FilledButton(style: ceBigButton(), onPressed: () => Navigator.of(context).pop(), child: Text(context.ce('OK')))]),
      },
      _Step.downloading => (
        context.ce('Downloading the update…'),
        <Widget>[
          LinearProgressIndicator(key: const Key('ce-update-progress'), value: _progress, minHeight: 12),
          const SizedBox(height: 12),
          Text('${(_progress * 100).round()} %', style: ceText(16)),
        ],
        <Widget>[TextButton(key: const Key('ce-update-cancel'), onPressed: () => _cancel?.complete(), child: Text(context.ce('Cancel')))],
      ),
      _Step.ready => (
        context.ce('Ready to install'),
        <Widget>[
          Text(context.ce('The download is checked (SHA-256). Android asks you to confirm the update; your classes, marks and boards stay.'), style: ceText(16)),
          if (_error != null) ...[const SizedBox(height: 12), Text(_error!, style: ceText(16, c: CeC.red))],
        ],
        <Widget>[
          TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(context.ce('Later'))),
          FilledButton.icon(key: const Key('ce-update-install'), style: ceBigButton(), onPressed: () => unawaited(_install()), icon: const Icon(Icons.install_mobile), label: Text(context.ce('Install'))),
        ],
      ),
      _Step.failed => (context.ce('No update now'), <Widget>[Text(_error ?? '', style: ceText(16, c: CeC.red))], <Widget>[FilledButton(style: ceBigButton(), onPressed: () => Navigator.of(context).pop(), child: Text(context.ce('OK')))]),
    };
    return AlertDialog(
      key: const Key('ce-update-dialog'),
      title: Text(title, style: ceHeading(22)),
      content: SizedBox(width: 560, child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: body)),
      actions: actions,
    );
  }
}

/// Install from USB…: the teacher picks an APK; the board checks it is Zynetix Classroom, newer
/// than this one and signed by Zynetix, shows what it is, then opens Android's installer.
Future<void> installFromUsbFlow(BuildContext context, AppUpdates updates) async {
  final String? path;
  try {
    path = await pickUpdateApk();
  } catch (e) {
    if (context.mounted) _snack(context, context.ce('That file could not be read: {error}', {'error': e}));
    return;
  }
  if (path == null || !context.mounted) return;
  final r = await updates.checkApk(path);
  if (!context.mounted) return;
  final problem = switch (r.problem) {
    ApkProblem.notAnApk => context.ce('That file is not an app (APK) this board can read.'),
    ApkProblem.otherApp => context.ce('That APK is another app ({name}), not Zynetix Classroom.', {'name': r.apk?.packageName}),
    ApkProblem.notNewer => context.ce('That APK is version {apk}; this board already has {current}. Choose a newer one.', {'apk': r.apk?.versionName, 'current': r.installed?.versionName}),
    ApkProblem.otherSigner => context.ce('That APK is not signed by Zynetix, so Android would refuse it.'),
    null => null,
  };
  if (problem != null) {
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        key: const Key('ce-usb-problem'),
        title: Text(ctx.ce('This APK cannot be installed'), style: ceHeading(22)),
        content: Text(problem, style: ceText(16)),
        actions: [FilledButton(style: ceBigButton(), onPressed: () => Navigator.of(ctx).pop(), child: Text(ctx.ce('OK')))],
      ),
    );
    return;
  }
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      key: const Key('ce-usb-confirm'),
      title: Text(ctx.ce('Install Zynetix Classroom {version}?', {'version': r.apk!.versionName}), style: ceHeading(22)),
      content: Text(ctx.ce('This board has {current}. Android asks you to confirm the update; your classes, marks and boards stay.', {'current': r.installed!.versionName}), style: ceText(16)),
      actions: [
        TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: Text(ctx.ce('Cancel'))),
        FilledButton.icon(key: const Key('ce-usb-install'), style: ceBigButton(), onPressed: () => Navigator.of(ctx).pop(true), icon: const Icon(Icons.install_mobile), label: Text(ctx.ce('Install'))),
      ],
    ),
  );
  if (ok != true || !context.mounted) return;
  try {
    if (!await updates.install(path) && context.mounted) {
      _snack(context, context.ce('Allow “Install unknown apps” for Zynetix Classroom, then come back and tap Install.'));
    }
  } catch (e) {
    if (context.mounted) _snack(context, context.ce('Android could not open the installer: {error}', {'error': e}));
  }
}
