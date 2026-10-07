import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import '../../core/board_controller.dart';
import '../board/kit/subjects.dart' show KitTab;
import '../board/side_panel.dart' show SplitContent;
import '../class_check/ask_dialog.dart' show AskSetup;

/// What the board screen lends the classroom extras (demo classes, primary activities, the
/// document camera, the safe browser, captions, classroom management, assessment, the
/// language kit): the board, its whiteboard, and ways to open things in the split panel.
class ExtrasHooks {
  const ExtrasHooks({
    required this.board,
    required this.wb,
    required this.openPage,
    required this.openSplit,
    required this.openPhet,
    required this.openAnimations,
    required this.openKit,
    required this.openVideos,
    required this.openPlan,
    required this.openCamera,
    required this.openWeb,
    required this.askClass,
  });

  final BoardController board;
  final WhiteboardController wb;

  /// Shows [builder] in the split panel under [title].
  final void Function(String title, IconData icon, WidgetBuilder builder) openPage;
  final void Function(SplitContent content, String? id) openSplit;
  final void Function(String id) openPhet;

  /// The Animations tab, filtered to [topic] when given.
  final void Function(String? topic) openAnimations;
  final void Function(KitTab? tab) openKit;
  final VoidCallback openVideos, openPlan, openCamera, openWeb;

  /// Asks the class a question in the Student App (and with answer cards).
  final Future<void> Function(AskSetup setup) askClass;
}
