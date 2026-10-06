import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:kinetix_animations/kinetix_animations.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import '../insert/insert_actions.dart' show placePicture;
import 'chrome.dart';
import '../../l10n/l10n.dart';

/// The split panel's Animations tab (packages/kinetix_animations): the period's subject and
/// topic preselected; "Add to board" puts a still of the animation on the page, titled.
Widget animationsPanel(BuildContext context, {required WhiteboardController wb, String? subject, String? topic}) => AnimationsPanel(
  subject: subject,
  topic: topic,
  onAddToBoard: (png, title) {
    placePicture(wb, png, pngSize(png), credit: title);
    if (context.mounted) showBoardMessage(context, context.l10n.snapshotAdded);
  },
);

/// A PNG's size from its header (640 × 480 when it cannot be read).
Size pngSize(Uint8List png) {
  if (png.length < 24) return const Size(640, 480);
  final d = ByteData.sublistView(png);
  final w = d.getUint32(16), h = d.getUint32(20);
  return w == 0 || h == 0 ? const Size(640, 480) : Size(w.toDouble(), h.toDouble());
}
