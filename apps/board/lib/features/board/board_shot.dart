import 'dart:async';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:share_plus/share_plus.dart';

import '../../l10n/l10n.dart';
import 'chrome.dart';
import 'panel/panel_host.dart';

/// Screenshot: a picture (PNG) of what the board shows, to save on the device or share.
abstract final class BoardShot {
  /// Saves [png] as [name] where the teacher picks (Android's Files, Windows' Save dialog);
  /// false when they cancel. Tests replace it.
  static Future<bool> Function(String name, Uint8List png) save = (name, png) async =>
      await FilePicker.saveFile(fileName: name, bytes: png, mimeType: 'image/png', type: FileType.image) != null;

  /// Opens the device's share sheet with [png]. Tests replace it.
  static Future<void> Function(String name, Uint8List png) share = (name, png) =>
      SharePlus.instance.share(ShareParams(files: [XFile.fromData(png, name: name, mimeType: 'image/png')], fileNameOverrides: [name]));

  /// The file name: the board and the time.
  static String fileName(DateTime at) => 'KINETIX board ${DateFormat('yyyy-MM-dd HH.mm').format(at)}.png';

  /// Renders the picture with [capture], then offers Save and Share over a preview.
  static Future<void> take(BuildContext context, Future<Uint8List> Function() capture) async {
    final l = context.l10n;
    final Uint8List png;
    try {
      png = await capture();
    } catch (e) {
      if (context.mounted) showBoardMessage(context, l.screenshotFailed('$e'));
      return;
    }
    if (!context.mounted) return;
    final name = fileName(DateTime.now());
    await showPanelDialog<void>(
      context: context,
      builder: (dialog) => BoardChromeTheme(
        child: AlertDialog(
          key: const Key('screenshot-dialog'),
          icon: const Icon(Icons.photo_camera_outlined),
          title: Text(l.toolScreenshot),
          content: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 560, maxHeight: 360),
            child: ClipRRect(borderRadius: Kx.radiusMd, child: Image.memory(png, key: const Key('screenshot-preview'), fit: BoxFit.contain)),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialog), child: Text(l.close)),
            OutlinedButton.icon(
              key: const Key('screenshot-share'),
              onPressed: () async {
                Navigator.pop(dialog);
                try {
                  await share(name, png);
                } catch (e) {
                  if (context.mounted) showBoardMessage(context, l.couldNotShare('$e'));
                }
              },
              icon: const Icon(Icons.share_outlined),
              label: Text(l.share),
            ),
            FilledButton.icon(
              key: const Key('screenshot-save'),
              onPressed: () async {
                Navigator.pop(dialog);
                try {
                  if (await save(name, png) && context.mounted) showBoardMessage(context, l.screenshotSaved);
                } catch (e) {
                  if (context.mounted) showBoardMessage(context, l.screenshotFailed('$e'));
                }
              },
              icon: const Icon(Icons.download_outlined),
              label: Text(l.save),
            ),
          ],
        ),
      ),
    );
  }
}
