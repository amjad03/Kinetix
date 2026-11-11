import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';

import '../classroom_hooks.dart';
import '../l10n/ce_strings.dart';
import '../local/classroom_store.dart';
import '../settings/pin_pad.dart' show askSchoolPin;
import '../ui/ce_style.dart';
import '../../features/phet/phet_strings.dart';
import 'content_library.dart';
import 'content_pack.dart';
import 'pack_video_player.dart';

/// Picks a pack from a USB stick: a zip (bytes) or a folder (path). Tests swap it.
Future<({Uint8List? zip, Directory? folder})?> Function() pickContentPack = () async {
  final files = await FilePicker.pickFiles(dialogTitle: ceTr('Pick a content pack'), type: FileType.custom, allowedExtensions: const ['zip']);
  if (files.isNotEmpty) return (zip: await files.first.xFile.readAsBytes(), folder: null);
  final dir = await FilePicker.getDirectoryPath(dialogTitle: ceTr('Pick a content pack'));
  return dir == null ? null : (zip: null, folder: Directory(dir));
};

/// Documents/Zynetix/Content: a pack folder copied there is found without the picker.
Future<Directory?> documentsContentFolder() async {
  try {
    final d = Directory('${(await getApplicationDocumentsDirectory()).path}/Zynetix/Content');
    return await File('${d.path}/manifest.json').exists() ? d : null;
  } catch (_) {
    return null;
  }
}

/// Settings → This board → Content: what is installed, sizes, Update and Remove (PIN).
class ContentSettingsSection extends StatefulWidget {
  const ContentSettingsSection({super.key, required this.store, this.library});
  final ClassroomStore store;
  final ContentLibrary? library;

  @override
  State<ContentSettingsSection> createState() => _ContentSettingsSectionState();
}

class _ContentSettingsSectionState extends State<ContentSettingsSection> {
  ContentLibrary? lib;
  bool busy = false;
  String? note;

  @override
  void initState() {
    super.initState();
    lib = widget.library;
    if (lib == null) {
      unawaited(ContentLibrary.shared().then((l) {
        if (mounted) setState(() => lib = l);
      }, onError: (Object e) => debugPrint('Content not opened: $e')));
    }
  }

  Future<void> _run(Future<ContentReport> Function() job) async {
    setState(() {
      busy = true;
      note = null;
    });
    try {
      final r = await job();
      note = ceTr('{added} added, {updated} updated, {same} already up to date.', {'added': r.added.length, 'updated': r.updated.length, 'same': r.unchanged}) + (r.problems.isEmpty ? '' : '\n${r.problems.join('\n')}');
    } on FormatException catch (e) {
      note = e.message;
    } catch (e) {
      note = '$e';
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _fromUsb(ContentLibrary l) async {
    final docs = await documentsContentFolder();
    if (docs != null) return _run(() => l.installFolder(docs));
    final picked = await pickContentPack();
    if (picked == null) return;
    final zip = picked.zip, folder = picked.folder;
    if (zip != null) return _run(() => l.installZip(zip));
    if (folder != null) return _run(() => l.installFolder(folder));
  }

  Future<void> _address(ContentLibrary l) async {
    final c = TextEditingController(text: l.baseUrl);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(ceTr('Content address')),
        content: SizedBox(width: 560, child: TextField(key: const Key('ce-content-url'), controller: c, decoration: const InputDecoration(hintText: _urlHint))),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(ceTr('Cancel'))),
          FilledButton(key: const Key('ce-content-url-save'), onPressed: () => Navigator.pop(ctx, true), child: Text(ceTr('Save'))),
        ],
      ),
    );
    if (ok == true) await l.setBaseUrl(c.text);
  }

  Future<void> _remove(ContentLibrary l, ContentItem? i) async {
    final ok = await askSchoolPin(context, widget.store, reason: ceTr('Removing content changes the lessons for everyone who uses this board.'));
    if (!ok) return;
    i == null ? await l.removeAll() : await l.remove(i.id);
  }

  @override
  Widget build(BuildContext context) {
    final l = lib;
    return Column(
      key: const Key('ce-settings-content'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(context.ce('Content'), style: ceHeading(20)),
        const SizedBox(height: 8),
        if (l == null)
          Text(ceTr('Opening the library…'), style: ceText(16))
        else
          ListenableBuilder(
            listenable: l,
            builder: (context, _) => Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  l.isEmpty
                      ? ceTr('No content pack on this board yet. Lessons show their videos once a pack is installed.')
                      : ceTr('{title} {rev}: {n} items, {size}.', {'title': l.packTitle, 'rev': l.revision, 'n': l.items.length, 'size': contentSize(l.totalBytes)}),
                  key: const Key('ce-content-summary'),
                  style: ceText(16),
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: [
                    OutlinedButton.icon(key: const Key('ce-content-usb'), style: ceSoftButton(), onPressed: busy ? null : () => unawaited(_fromUsb(l)), icon: const Icon(Icons.usb_rounded), label: Text(context.ce('Install from USB'))),
                    OutlinedButton.icon(
                      key: const Key('ce-content-update'),
                      style: ceSoftButton(),
                      onPressed: busy || l.baseUrl.isEmpty ? null : () => unawaited(_run(l.updateFromUrl)),
                      icon: const Icon(Icons.wifi_rounded),
                      label: Text(context.ce('Update over Wi-Fi')),
                    ),
                    OutlinedButton.icon(key: const Key('ce-content-address'), style: ceSoftButton(), onPressed: busy ? null : () => unawaited(_address(l)), icon: const Icon(Icons.link_rounded), label: Text(context.ce('Content address'))),
                    if (!l.isEmpty)
                      OutlinedButton.icon(key: const Key('ce-content-remove-all'), style: ceSoftButton(), onPressed: busy ? null : () => unawaited(_remove(l, null)), icon: const Icon(Icons.delete_outline), label: Text(context.ce('Remove all'))),
                  ],
                ),
                if (busy) const Padding(padding: EdgeInsets.only(top: 12), child: LinearProgressIndicator()),
                if (note != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(note!, key: const Key('ce-content-note'), style: ceText(15, c: CeC.navy))),
                const SizedBox(height: 12),
                for (final i in l.items)
                  Card(
                    key: Key('ce-content-item-${i.id}'),
                    child: ListTile(
                      leading: Icon(_icon(i.kind), color: CeC.navy, size: 32),
                      title: Text(i.title, style: ceHeading(17)),
                      subtitle: Text('${i.kind.wire} · ${i.chapterId} · v${i.version} · ${contentSize(i.size)}${i.kind == ContentKind.phet ? '\n${PhetStrings.attribution}' : ''}', style: ceText(14)),
                      trailing: IconButton(key: Key('ce-content-remove-${i.id}'), tooltip: ceTr('Remove'), onPressed: busy ? null : () => unawaited(_remove(l, i)), icon: const Icon(Icons.delete_outline)),
                    ),
                  ),
              ],
            ),
          ),
      ],
    );
  }
}

const _urlHint = 'https://…/content/';

IconData _icon(ContentKind k) => switch (k) {
  ContentKind.video => Icons.movie_outlined,
  ContentKind.phet => Icons.science_outlined,
  ContentKind.lab => Icons.biotech_outlined,
  ContentKind.interactiveAsset => Icons.touch_app_outlined,
};

/// A topic's pack video in a lesson step or the Lessons panel: a "Watch the video" button, or
/// nothing when the pack has none (Classroom never streams).
class TopicVideoButton extends StatelessWidget {
  const TopicVideoButton({super.key, required this.topicId, this.step, this.host, this.library, this.compact = false});
  final String topicId;
  final String? step;
  final ClassroomHost? host;
  final ContentLibrary? library;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final l = library ?? ContentLibrary.sharedIfOpen;
    if (l == null) return const SizedBox.shrink();
    return ListenableBuilder(
      listenable: l,
      builder: (context, _) {
        final v = l.videoFor(topicId, step: step);
        if (v == null) return const SizedBox.shrink();
        void open() => unawaited(openPackVideo(context, lib: l, item: v, host: host));
        return compact
            ? IconButton(key: Key('topic-video-$topicId'), tooltip: ceTr('Watch the video'), onPressed: open, icon: const Icon(Icons.play_circle_fill, color: CeC.accent, size: 36))
            : FilledButton.icon(key: Key('topic-video-$topicId'), style: ceBigButton(), onPressed: open, icon: const Icon(Icons.play_circle_fill), label: Text(ceTr('Watch the video')));
      },
    );
  }
}
