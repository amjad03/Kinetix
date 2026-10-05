import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../../core/board_controller.dart';
import '../board/chrome.dart';
import 'ask_dialog.dart';
import 'class_check_panel.dart';
import 'class_poll.dart';

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
    final setup = await showDialog<AskSetup>(context: context, builder: (_) => const BoardChromeTheme(child: AskClassDialog()));
    if (setup == null) return;
    await start(setup);
  }

  Future<void> start(AskSetup setup) async {
    final old = poll;
    if (old != null) {
      await old.close();
      old.dispose();
    }
    poll = ClassPoll(board: board, kind: setup.kind, question: setup.question, options: setup.options, correct: setup.correct);
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
  const ClassCheckOverlay({super.key, required this.check, required this.onPutOnBoard});

  final ClassCheck check;
  final void Function(Uint8List png) onPutOnBoard;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: check,
    builder: (context, _) {
      final poll = check.poll;
      if (poll == null) return const SizedBox.shrink();
      return Stack(
        children: [
          Positioned(
            left: check.position.dx,
            top: check.position.dy,
            child: GestureDetector(
              onPanUpdate: (d) => check.move(d.delta),
              child: BoardChromeTheme(
                child: ClassCheckPanel(key: ValueKey(poll.id), poll: poll, onDismiss: check.dismiss, onPutOnBoard: onPutOnBoard),
              ),
            ),
          ),
        ],
      );
    },
  );
}
