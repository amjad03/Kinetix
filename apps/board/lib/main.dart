import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'core/board_controller.dart';
import 'core/server_config.dart';
import 'features/board/board_screen.dart';
import 'features/board/chrome.dart';
import 'features/broadcast/broadcast_overlay.dart';
import 'features/comfort/eye_comfort.dart';
import 'features/enrollment/enroll_screen.dart';
import 'l10n/l10n.dart';

void main() {
  // A release built without --dart-define=KINETIX_API_URL stops here with a clear message.
  if (!checkServerConfig()) return;
  runApp(KinetixBoardApp(controller: BoardController()..start()));
}

class KinetixBoardApp extends StatelessWidget {
  const KinetixBoardApp({super.key, required this.controller});

  final BoardController controller;

  @override
  Widget build(BuildContext context) {
    // The board's language: its own setting, or the signed-in teacher's while they teach.
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) => MaterialApp(
        title: 'KINETIX Board',
        debugShowCheckedModeBanner: false,
        theme: KinetixTheme.light(),
        locale: controller.language.locale,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        builder: (context, child) => ListenableBuilder(
          listenable: controller,
          builder: (context, _) => EyeComfortFilter(
            settings: controller.eyeComfort,
            child: BoardChromeTheme(
              child: BroadcastOverlay(
                messages: controller.broadcasts,
                acknowledged: controller.acknowledgedEmergencies,
                onDismiss: controller.dismissBroadcast,
                child: Theme(data: KinetixTheme.light(), child: child!),
              ),
            ),
          ),
        ),
        home: ListenableBuilder(
          listenable: controller,
          builder: (context, _) => switch (controller.stage) {
            BoardStage.loading => const Scaffold(body: Center(child: CircularProgressIndicator())),
            BoardStage.needsEnrollment => EnrollScreen(controller: controller),
            BoardStage.board => BoardScreen(board: controller),
          },
        ),
      ),
    );
  }
}
