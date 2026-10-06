import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import '../../l10n/l10n.dart';
import '../board/chrome.dart';
import 'device_files.dart';
import 'document_import.dart';
import 'insert_entries.dart';
import 'picture_library.dart';
import '../board/panel/panel_host.dart';

/// Puts a picture on the board in a free spot in view, at most [maxWidth] wide, with [credit]
/// (a library picture's source and licence) in small type under it, grouped with it.
void placePicture(WhiteboardController wb, Uint8List bytes, Size size, {String? credit, double maxWidth = 560}) {
  final w = math.min(maxWidth, size.width);
  final h = w * size.height / math.max(1, size.width);
  final ink = wb.background.isDark ? WhiteboardController.chalkWhite : WhiteboardController.inkBlack;
  wb.insert([
    ImageElement(id: newElementId(), rect: Rect.fromLTWH(0, 0, w, h), bytes: bytes),
    if (credit != null && credit.isNotEmpty)
      TextElement(id: newElementId(), position: Offset(0, h + 6), text: credit, color: ink, fontSize: 12, size: measureBoardText(credit, 12)),
  ]);
}

/// A picture from the gallery, the camera or the file dialog.
Future<void> insertDevicePicture(BuildContext context, WhiteboardController wb, {bool camera = false}) async {
  final l = context.l10n;
  PickedFile? file;
  try {
    file = await DeviceFiles.instance.pickPicture(camera: camera);
  } catch (e) {
    debugPrint('Picture picker: $e');
    if (context.mounted) showBoardMessage(context, l.pictureCouldNotOpen);
    return;
  }
  if (file == null) return;
  final picture = await boardPicture(file.bytes);
  if (!context.mounted) return;
  if (picture == null) {
    showBoardMessage(context, l.pictureCouldNotOpen);
    return;
  }
  placePicture(wb, picture.$1, picture.$2);
}

/// A picture from the bundled library, with its credit under it (stickers' credits are in
/// the licences).
Future<void> insertLibraryPicture(BuildContext context, WhiteboardController wb, {String? subject}) async {
  final lib = await PictureLibrary.load();
  if (!context.mounted) return;
  final p = await showPanelDialog<LibraryPicture>(
    context: context,
    builder: (_) => BoardChromeTheme(child: PictureLibraryDialog(library: lib, subject: subject)),
  );
  if (p == null) return;
  final picture = await boardPicture(await lib.bytes(p));
  if (picture == null || !context.mounted) return;
  placePicture(wb, picture.$1, picture.$2, credit: p.isSticker ? null : p.credit.line, maxWidth: p.isSticker ? 240 : 560);
}

/// The insert popover's entries for pictures, documents and simulations.
List<InsertExtra> insertExtras(
  BuildContext context, {
  required WhiteboardController wb,
  required String? subject,
  required VoidCallback onSimulation,
}) {
  final l = context.l10n;
  return [
    InsertExtra(
      key: const Key('insert-picture'),
      icon: Icons.add_photo_alternate_outlined,
      title: l.insertPicture,
      hint: DeviceFiles.instance.hasCamera ? l.insertPictureHintGallery : l.insertPictureHintFiles,
      onTap: () => insertDevicePicture(context, wb),
    ),
    if (DeviceFiles.instance.hasCamera)
      InsertExtra(
        key: const Key('insert-camera'),
        icon: Icons.photo_camera_outlined,
        title: l.insertPhoto,
        hint: l.insertPhotoHint,
        onTap: () => insertDevicePicture(context, wb, camera: true),
      ),
    InsertExtra(
      key: const Key('insert-library'),
      icon: Icons.photo_library_outlined,
      title: l.libTitle,
      hint: l.libHint,
      onTap: () => insertLibraryPicture(context, wb, subject: subject),
    ),
    InsertExtra(
      key: const Key('insert-document'),
      icon: Icons.slideshow_outlined,
      title: l.importTitle,
      hint: l.importHint,
      onTap: () => importDocument(context, wb),
    ),
    InsertExtra(key: const Key('insert-simulation'), icon: Icons.science, title: l.simTitle, hint: l.simHint, onTap: onSimulation),
  ];
}
