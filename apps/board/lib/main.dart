import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'core/api_client.dart';
import 'core/board_controller.dart';
import 'core/outbox_store.dart';
import 'core/recording/recordings.dart';
import 'core/server_config.dart';
import 'demo/demo.dart';
import 'demo/demo_server.dart';
import 'features/board/board_screen.dart';
import 'features/board/chrome.dart';
import 'features/broadcast/broadcast_overlay.dart';
import 'features/comfort/eye_comfort.dart';
import 'features/enrollment/enroll_screen.dart';
import 'l10n/l10n.dart';

void main() {
  // Plugins (saved settings, secure storage, the outbox) can only be used once Flutter's engine
  // binding exists; the controllers below start reading them before runApp.
  WidgetsFlutterBinding.ensureInitialized();
  // A release built without --dart-define=KINETIX_API_URL stops here with a clear message
  // (unless it is a demo build: --dart-define=KINETIX_DEMO=true, which needs no server).
  if (!checkServerConfig()) return;
  if (Demo.enabled) {
    runApp(KinetixBoardApp(controller: demoBoard(DemoBoardServer())));
    return;
  }
  runApp(KinetixBoardApp(controller: BoardController()..start()));
}

/// A board on the in-memory demo server, open in its class (docs/product/demo-builds.md).
BoardController demoBoard(DemoBoardServer server, {Recordings? recordings}) {
  final board = BoardController(
    apiFactory: (url) => ApiClient(baseUrl: url, client: server.client),
    realtimeFactory: (_) => server.realtime,
    outboxStore: MemoryOutboxStore(),
    recordings: recordings,
  );
  board.startDemo(
    serverUrl: demoServerUrl,
    deviceToken: DemoBoardServer.deviceToken,
    deviceName: DemoBoardServer.deviceName,
    sessionToken: DemoBoardServer.sessionToken,
    session: server.session(),
  );
  return board;
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
