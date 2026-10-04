import 'package:flutter/material.dart';

import 'core/board_controller.dart';
import 'features/broadcast/broadcast_overlay.dart';
import 'features/comfort/eye_comfort.dart';
import 'features/enrollment/enroll_screen.dart';
import 'features/pairing/pairing_screen.dart';
import 'features/workspace/workspace_screen.dart';

void main() {
  runApp(KinetixBoardApp(controller: BoardController()..start()));
}

class KinetixBoardApp extends StatelessWidget {
  const KinetixBoardApp({super.key, required this.controller});

  final BoardController controller;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) => MaterialApp(
        title: 'KINETIX Board',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(colorSchemeSeed: const Color(0xFF1D4ED8), useMaterial3: true),
        builder: (context, child) => EyeComfortFilter(
          settings: controller.eyeComfort,
          child: BroadcastOverlay(
            messages: controller.broadcasts,
            acknowledged: controller.acknowledgedEmergencies,
            onDismiss: controller.dismissBroadcast,
            child: child!,
          ),
        ),
        home: _home(),
      ),
    );
  }

  Widget _home() {
    switch (controller.stage) {
      case BoardStage.loading:
        return const Scaffold(body: Center(child: CircularProgressIndicator()));
      case BoardStage.needsEnrollment:
        return EnrollScreen(controller: controller);
      case BoardStage.pairing:
        return PairingScreen(api: controller.api!, deviceName: controller.deviceName, onPractice: controller.startPractice);
      case BoardStage.teaching:
        return WorkspaceScreen(
          key: ValueKey(controller.session!.sessionId),
          session: controller.session!,
          eyeComfort: controller.eyeComfort,
          onEyeComfortChanged: controller.setEyeComfort,
          onEndClass: controller.endClass,
        );
    }
  }
}
