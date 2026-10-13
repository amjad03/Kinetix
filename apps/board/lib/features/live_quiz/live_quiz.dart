import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/board_controller.dart';
import '../board/chrome.dart';
import '../board/panel/panel_host.dart';
import 'live_quiz_game.dart';
import 'live_quiz_setup.dart';
import 'live_quiz_stage.dart';

export 'live_quiz_game.dart';
export 'live_quiz_setup.dart' show LiveQuizSetup, LiveQuizSetupDialog;
export 'live_quiz_stage.dart' show LiveQuizStage;

/// Live Quiz from the top bar: the teacher sets the game up, then it plays full screen over the
/// board until the podium is closed. Returns when the game is over.
Future<void> openLiveQuizGame(BuildContext context, BoardController board) async {
  final setup = await showPanelDialog<LiveQuizSetup>(context: context, builder: (_) => BoardChromeTheme(child: LiveQuizSetupDialog(board: board)));
  if (setup == null || !context.mounted) return;
  final game = LiveQuizGame(board: board, title: setup.title, questions: setup.questions, cards: setup.cards);
  unawaited(game.start());
  try {
    await Navigator.of(context, rootNavigator: true).push(
      PageRouteBuilder<void>(
        opaque: true,
        pageBuilder: (_, _, _) => LiveQuizStage(game: game),
        transitionsBuilder: (_, animation, _, child) => FadeTransition(opacity: animation, child: child),
      ),
    );
  } finally {
    // Closed from the system back button too: the server still gets the end of the game, once a
    // call still under way has finished.
    await game.close();
    game.dispose();
  }
}
