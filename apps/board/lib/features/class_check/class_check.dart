import 'dart:async';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../../core/board_controller.dart';
import '../board/chrome.dart';
import 'ask_dialog.dart';
import 'class_check_panel.dart';
import 'class_poll.dart';
import '../board/panel/panel_host.dart';

export 'class_poll.dart';

/// "Ask the class" on the board: the board screen keeps one of these, opens it from its tools
/// ([ask]) and shows [ClassCheckOverlay] over the board while a question is up.
class ClassCheck extends ChangeNotifier {
  ClassCheck(this.board);

  final BoardController board;

  /// The question on the board now (open or just ended), or null.
  ClassPoll? poll;

  Offset position = const Offset(80, 96);

  /// Sets up a question with the teacher and asks it.
  Future<void> ask(BuildContext context) async {
    // The subject's course outcomes, when a class is open and the board is online; the teacher may tag the question with them.
    var outcomes = <Map<String, dynamic>>[];
    try {
      if (board.isSignedIn && board.session?.sectionName != null) outcomes = await board.api?.courseOutcomes() ?? outcomes;
    } catch (_) {}
    if (!context.mounted) return;
    final setup = await showPanelDialog<AskSetup>(context: context, builder: (_) => BoardChromeTheme(child: AskClassDialog(outcomes: outcomes)));
    if (setup == null) return;
    await start(setup);
  }

  Future<void> start(AskSetup setup) async {
    final old = poll;
    if (old != null) {
      await old.close();
      old.dispose();
    }
    poll = ClassPoll(board: board, kind: setup.kind, question: setup.question, options: setup.options, correct: setup.correct, coIds: setup.coIds);
    notifyListeners();
    await poll!.start();
  }

  /// Closes the panel (ending the question first if it is still open).
  void dismiss() {
    final p = poll;
    if (p == null) return;
    poll = null;
    notifyListeners();
    unawaited(p.close().whenComplete(p.dispose));
  }

  void move(Offset d) {
    position += d;
    notifyListeners();
  }

  @override
  void dispose() {
    poll?.dispose();
    super.dispose();
  }
}

/// The question's panel, draggable, over the board.
class ClassCheckOverlay extends StatelessWidget {
  const ClassCheckOverlay({super.key, required this.check, required this.onPutOnBoard, this.insets = EdgeInsets.zero});

  final ClassCheck check;
  final void Function(Uint8List png) onPutOnBoard;

  /// Edges covered by the board's toolbars: the panel keeps clear of them.
  final EdgeInsets insets;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: check,
    builder: (context, _) {
      final poll = check.poll;
      if (poll == null) return const SizedBox.shrink();
      // Kept on screen, and on a phone as wide as the screen allows; it scrolls when short.
      return LayoutBuilder(
        builder: (context, box) {
          final width = math.min(428.0, box.maxWidth - 16);
          final left = check.position.dx.clamp(8.0, math.max(8.0, box.maxWidth - width - 8)).toDouble();
          final bottom = box.maxHeight - insets.bottom;
          final top = check.position.dy.clamp(8.0, math.max(8.0, bottom - 160)).toDouble();
          return Stack(
            children: [
              Positioned(
                left: left,
                top: top,
                width: width,
                child: GestureDetector(
                  onPanUpdate: (d) => check.move(d.delta),
                  child: BoardChromeTheme(
                    child: ConstrainedBox(
                      constraints: BoxConstraints(maxHeight: math.max(160, bottom - top - 8)),
                      child: SingleChildScrollView(
                        child: ClassCheckPanel(key: ValueKey(poll.id), poll: poll, onDismiss: check.dismiss, onPutOnBoard: onPutOnBoard),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      );
    },
  );
}
