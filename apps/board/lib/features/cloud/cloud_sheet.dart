import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:path_provider/path_provider.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../core/api_client.dart' show ApiException;
import '../../core/cloud/cloud_service.dart';
import '../../l10n/l10n.dart';
import '../board/chrome.dart' show showBoardMessage;
import '../board/share_whiteboard.dart' show openExternal;
import '../insert/device_files.dart' show boardPicture;
import '../insert/document_import.dart' show importDocumentBytes;
import '../insert/insert_actions.dart' show placePicture;

/// The service's name as the teacher knows it.
String cloudName(AppLocalizations l, CloudProvider p) => p == CloudProvider.google ? l.cloudGoogle : l.cloudMicrosoft;

/// What to say for a cloud error: not set up (ask the administrator), not connected, or the server's words.
String cloudError(AppLocalizations l, Object e, String service) {
  if (e is ApiException && (e.code == cloudNotConfigured || e.code == moodleNotConfigured)) return l.cloudNotConfigured(service);
  if (e is ApiException && e.code == cloudNotConnected) return l.shareConnectFirst(service);
  return l.cloudFailed('$e');
}

/// Brings a file from a drive onto the board: PDFs and slides as pages, pictures placed on the
/// page, videos saved on the board and opened in its player.
Future<void> importCloudFile(BuildContext context, WhiteboardController wb, CloudFileKind kind, String name, Uint8List bytes) async {
  switch (kind) {
    case CloudFileKind.pdf:
    case CloudFileKind.pptx:
      await importDocumentBytes(context, wb, name, bytes);
    case CloudFileKind.image:
      final pic = await boardPicture(bytes);
      if (!context.mounted) return;
      if (pic == null) {
        showBoardMessage(context, context.l10n.importNotSupported);
        return;
      }
      placePicture(wb, pic.$1, pic.$2);
    case CloudFileKind.video:
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/${name.replaceAll(RegExp(r'[\\/:*?"<>|]'), '_')}');
      await file.writeAsBytes(bytes, flush: true);
      await openExternal(Uri.file(file.path));
    case CloudFileKind.folder:
      break;
  }
}

/// Insert → Cloud drives: Google Drive and OneDrive. Each teacher connects their own account once
/// by scanning a QR; the institution sets the services up in the Zynetix dashboard → Integrations.
Future<void> showCloudDrives(BuildContext context, {required CloudService cloud, required Future<void> Function(CloudFile file, String name, Uint8List bytes) onImport}) => showDialog<void>(
  context: context,
  builder: (_) => CloudDrivesDialog(cloud: cloud, onImport: onImport),
);

class CloudDrivesDialog extends StatefulWidget {
  const CloudDrivesDialog({super.key, required this.cloud, required this.onImport, this.pollEvery = const Duration(seconds: 3)});

  final CloudService cloud;
  final Future<void> Function(CloudFile file, String name, Uint8List bytes) onImport;

  /// How often the board asks whether the teacher finished signing in on their phone.
  final Duration pollEvery;

  @override
  State<CloudDrivesDialog> createState() => _CloudDrivesDialogState();
}

class _CloudDrivesDialogState extends State<CloudDrivesDialog> {
  CloudProvider _provider = CloudProvider.google;
  CloudStatus? _status;
  Uri? _connectUrl;
  Timer? _poll;
  List<CloudFile>? _files;
  final _path = <CloudFile>[];
  String? _error;
  String? _busy;
  final _search = TextEditingController();

  @override
  void initState() {
    super.initState();
    unawaited(_refresh());
  }

  @override
  void dispose() {
    _poll?.cancel();
    _search.dispose();
    super.dispose();
  }

  CloudAccount get _account => _status?.of(_provider) ?? const CloudAccount();

  Future<void> _refresh() async {
    try {
      final st = await widget.cloud.status();
      if (!mounted) return;
      setState(() {
        _status = st;
        _error = null;
      });
      if (st.of(_provider).connected) {
        _poll?.cancel();
        _connectUrl = null;
        await _list();
      }
    } catch (e) {
      if (mounted) setState(() => _error = cloudError(context.l10n, e, cloudName(context.l10n, _provider)));
    }
  }

  Future<void> _list() async {
    final q = _search.text.trim();
    setState(() => _files = null);
    try {
      final files = await widget.cloud.list(_provider, folder: q.isEmpty && _path.isNotEmpty ? _path.last.id : null, query: q.isEmpty ? null : q);
      if (mounted) setState(() => _files = files);
    } catch (e) {
      if (mounted) setState(() => _error = cloudError(context.l10n, e, cloudName(context.l10n, _provider)));
    }
  }

  Future<void> _connect() async {
    try {
      final url = await widget.cloud.connectUrl(_provider);
      if (!mounted) return;
      setState(() => _connectUrl = url);
      _poll?.cancel();
      _poll = Timer.periodic(widget.pollEvery, (_) => unawaited(_refresh()));
    } catch (e) {
      if (mounted) setState(() => _error = cloudError(context.l10n, e, cloudName(context.l10n, _provider)));
    }
  }

  Future<void> _disconnect() async {
    await widget.cloud.disconnect(_provider);
    _path.clear();
    _files = null;
    await _refresh();
  }

  Future<void> _open(CloudFile f) async {
    if (f.kind == CloudFileKind.folder) {
      _path.add(f);
      _search.clear();
      await _list();
      return;
    }
    setState(() => _busy = f.name);
    try {
      final got = await widget.cloud.download(_provider, f.id);
      if (!mounted) return;
      Navigator.of(context).pop();
      await widget.onImport(f, got.name, got.bytes);
    } catch (e) {
      if (mounted) setState(() => _error = cloudError(context.l10n, e, cloudName(context.l10n, _provider)));
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  void _switch(CloudProvider p) {
    _poll?.cancel();
    setState(() {
      _provider = p;
      _connectUrl = null;
      _files = null;
      _path.clear();
      _error = null;
    });
    unawaited(_refresh());
  }

  IconData _icon(CloudFileKind k) => switch (k) {
    CloudFileKind.folder => Icons.folder_outlined,
    CloudFileKind.pdf => Icons.picture_as_pdf_outlined,
    CloudFileKind.pptx => Icons.slideshow_outlined,
    CloudFileKind.image => Icons.image_outlined,
    CloudFileKind.video => Icons.movie_outlined,
  };

  Widget _body(AppLocalizations l) {
    final name = cloudName(l, _provider);
    final st = _status;
    if (_busy != null) {
      return Row(children: [const CircularProgressIndicator(), const SizedBox(width: Kx.s16), Expanded(child: Text(l.cloudOpening(_busy!)))]);
    }
    if (st == null && _error == null) return const Center(child: CircularProgressIndicator());
    if (st != null && !_account.configured) {
      return Row(
        children: [
          Icon(Icons.info_outline, color: context.colors.primary),
          const SizedBox(width: Kx.s12),
          Expanded(child: Text(l.cloudNotConfigured(name), key: const Key('cloud-not-configured'))),
        ],
      );
    }
    if (st != null && !_account.connected) {
      final url = _connectUrl;
      if (url == null) {
        return Center(
          child: FilledButton.icon(key: const Key('cloud-connect'), onPressed: () => unawaited(_connect()), icon: const Icon(Icons.qr_code_2), label: Text(l.cloudConnect(name))),
        );
      }
      return Row(
        key: const Key('cloud-connect-qr'),
        children: [
          Container(
            color: Colors.white,
            padding: const EdgeInsets.all(8),
            child: QrImageView(data: '$url', size: 180),
          ),
          const SizedBox(width: Kx.s16),
          Expanded(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(l.cloudConnectHow(name)),
                const SizedBox(height: Kx.s12),
                Row(
                  children: [
                    const SizedBox.square(dimension: 16, child: CircularProgressIndicator(strokeWidth: 2)),
                    const SizedBox(width: Kx.s8),
                    Expanded(child: Text(l.cloudWaiting)),
                  ],
                ),
              ],
            ),
          ),
        ],
      );
    }
    final files = _files;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(l.cloudConnectedAs(_account.account ?? name), key: const Key('cloud-account'), style: context.text.bodySmall),
            ),
            TextButton(key: const Key('cloud-disconnect'), onPressed: () => unawaited(_disconnect()), child: Text(l.cloudDisconnect)),
          ],
        ),
        TextField(
          key: const Key('cloud-search'),
          controller: _search,
          decoration: InputDecoration(prefixIcon: const Icon(Icons.search), hintText: l.cloudSearch, isDense: true),
          onSubmitted: (_) => unawaited(_list()),
        ),
        const SizedBox(height: Kx.s8),
        Wrap(
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            ActionChip(
              key: const Key('cloud-home'),
              label: Text(l.cloudHome),
              onPressed: () {
                _path.clear();
                _search.clear();
                unawaited(_list());
              },
            ),
            for (final (i, f) in _path.indexed) ...[
              const Icon(Icons.chevron_right, size: 18),
              ActionChip(
                label: Text(f.name),
                onPressed: () {
                  _path.removeRange(i + 1, _path.length);
                  unawaited(_list());
                },
              ),
            ],
          ],
        ),
        const SizedBox(height: Kx.s8),
        Flexible(
          child: files == null
              ? const Center(
                  child: Padding(padding: EdgeInsets.all(Kx.s16), child: CircularProgressIndicator()),
                )
              : files.isEmpty
              ? Padding(
                  padding: const EdgeInsets.all(Kx.s16),
                  child: Text(l.cloudEmpty, key: const Key('cloud-empty')),
                )
              : ListView(
                  shrinkWrap: true,
                  children: [
                    for (final f in files)
                      ListTile(
                        key: Key('cloud-file-${f.id}'),
                        leading: Icon(_icon(f.kind)),
                        title: Text(f.name),
                        trailing: f.kind == CloudFileKind.folder ? const Icon(Icons.chevron_right) : null,
                        onTap: () => unawaited(_open(f)),
                      ),
                  ],
                ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return AlertDialog(
      key: const Key('cloud-drives'),
      title: Text(l.cloudTitle),
      content: SizedBox(
        width: 620,
        height: 460,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SegmentedButton<CloudProvider>(
              segments: [for (final p in CloudProvider.values) ButtonSegment(value: p, label: Text(cloudName(l, p)), icon: const Icon(Icons.cloud_outlined))],
              selected: {_provider},
              onSelectionChanged: (s) => _switch(s.first),
            ),
            const SizedBox(height: Kx.s16),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: Kx.s8),
                child: Text(
                  _error!,
                  key: const Key('cloud-error'),
                  style: TextStyle(color: context.colors.error),
                ),
              ),
            Expanded(child: _body(l)),
          ],
        ),
      ),
      actions: [TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(MaterialLocalizations.of(context).closeButtonLabel))],
    );
  }
}
