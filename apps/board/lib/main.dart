import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart' show kReleaseMode;
import 'package:flutter/material.dart';
import 'package:kinetix_3d/kinetix_3d.dart' show ModelCatalogue, RemoteModels;
import 'package:kinetix_ink/kinetix_ink.dart' show flowSuggestionsEnabled;
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:path_provider/path_provider.dart';

import 'classroom_edition/edition.dart';
import 'classroom_edition/lessons/lessons_panel.dart' show installLessonHooks;
import 'classroom_edition/l10n/ce_strings.dart';
import 'classroom_edition/local/sample_college.dart';
import 'classroom_edition/start/classroom_start.dart';
import 'classroom_edition/ui/phone_fit.dart';
import 'classroom_edition/ui/screen_fit.dart';
import 'core/api_client.dart';
import 'core/app_info.dart';
import 'core/board_controller.dart';
import 'core/crash/crash_guard.dart';
import 'core/handwriting/mlkit_handwriting.dart';
import 'core/outbox_store.dart';
import 'core/recording/recordings.dart';
import 'core/server_config.dart';
import 'demo/demo.dart';
import 'demo/demo_server.dart';
import 'features/board/board_autosave.dart';
import 'features/board/board_screen.dart';
import 'features/board/chrome.dart';
import 'features/board/model_server.dart';
import 'features/broadcast/broadcast_overlay.dart';
import 'features/comfort/eye_comfort.dart';
import 'features/concept_videos/concept_video_suggestions.dart';
import 'features/enrollment/enroll_screen.dart';
import 'features/fleet/device_lock.dart';
import 'features/insert/picture_library.dart';
import 'features/preview/panel_preview.dart';
import 'features/profiles/profiles_ui.dart';
import 'features/projector/projector_screen.dart';
import 'features/room_sync/room_sync_gate.dart';
import 'l10n/l10n.dart';

void main() {
  // Everything runs in a zone that catches what nothing else did (core/crash): the board's
  // autosave is written first, then the error goes into the board's own crash log.
  runZonedGuarded(_main, (error, stack) => unawaited(CrashGuard.onUncaught(error, stack)));
}

void _main() {
  // Plugins (saved settings, secure storage, the outbox) can only be used once Flutter's engine
  // binding exists; the controllers below start reading them before runApp.
  WidgetsFlutterBinding.ensureInitialized();
  installCrashGuard();
  // Downloaded 3D models are kept here so they work offline after the first use.
  unawaited(getApplicationSupportDirectory().then((d) => RemoteModels.cacheDir = Directory('${d.path}/models3d'), onError: (_) {}));
  // A release built without --dart-define=KINETIX_API_URL stops here with a clear message
  // (unless it is a demo build: --dart-define=KINETIX_DEMO=true, which needs no server).
  if (!checkServerConfig()) return;
  // The picture library's credits on the licence page.
  registerPictureLibraryLicence();
  // Classroom edition: the start screen's "Next lesson" line from the bundled lessons.
  if (Edition.classroom) installLessonHooks();
  final board = !Demo.enabled
      ? (BoardController()..start())
      // The Classroom edition's demo has no ERP demo server: a sample PU college on the board itself.
      : (Edition.classroom ? classroomDemoBoard() : demoBoard(DemoBoardServer()));
  // "Back to start" after a crash: the Classroom edition's start screen.
  CrashGuard.backToStart = () {
    if (Edition.classroom) board.showClassroomStart();
  };
  // 3D models download from this board's own server, the institution's or the KINETIX API first.
  unawaited(ModelServer.attach(board));
  // Back in front (from Android settings, or the user unpinned the screen): kiosk mode locks
  // again if it should be on (docs/hardware/kiosk-mode.md).
  AppLifecycleListener(onResume: () => unawaited(board.kiosk.refresh()));
  runApp(KinetixBoardApp(controller: board));
}

/// Crash handling (core/crash): Flutter's errors, uncaught errors and widgets that cannot build
/// write the board's autosave first, then the crash log; a release build shows a friendly card
/// instead of a red screen, and "Something went wrong – Back to start" when errors keep coming.
void installCrashGuard({bool releaseErrorWidget = kReleaseMode}) {
  CrashGuard.app = '${Edition.appName} $kBoardVersion';
  CrashGuard.beforeCrash = BoardAutosave.flushAll;
  if (Edition.classroom) CrashGuard.helpLine = 'If this keeps happening, College settings → Backup & restore keeps the board’s crash log for whoever looks after it.';
  CrashGuard.install(releaseErrorWidget: releaseErrorWidget);
}

/// Projector mode's second screen (features/projector): Android's Presentation and the Windows
/// runner's projector window start a second Flutter engine here. It shows only what the board
/// sends it.
@pragma('vm:entry-point')
void projectorMain() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const ProjectorApp());
}

/// The Classroom edition's demo build (KINETIX_DEMO=true): no demo server and no ERP class (with
/// its named students), but the board as a college would have it: [sampleCollege] in the
/// board's own store the first time (teachers, classes of roll numbers, a timetable), then
/// whatever the demo user changed.
BoardController classroomDemoBoard({BoardController? board}) {
  final b = board ?? BoardController();
  b.classroom.seed = sampleCollege();
  unawaited(b.start());
  return b;
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
    // No AI in the Classroom edition, flowchart suggestions included (classroom_edition/).
    flowSuggestionsEnabled = Edition.ai;
    // Offline, no downloads: only the bundled 3D models (and ones downloaded before) are listed,
    // and no handwriting model is fetched.
    ModelCatalogue.downloads = Edition.onlineTools;
    MlKitHandwriting.downloadsAllowed = () => Edition.onlineTools;
    // The board's language: its own setting, or the signed-in teacher's while they teach.
    CeLang.code = controller.language.name;
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        // The Classroom edition's words for code with no context (PDFs, tool lists).
        CeLang.code = controller.language.name;
        return MaterialApp(
        title: Edition.appName,
        debugShowCheckedModeBanner: false,
        theme: KinetixTheme.light(),
        locale: controller.language.locale,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        builder: (context, child) => ListenableBuilder(
          listenable: Listenable.merge([controller, controller.classroom]),
          builder: (context, _) {
            // The teacher's App theme, whatever the device or the layout.
            final look = controller.theme.resolve(MediaQuery.platformBrightnessOf(context));
            // Preview as interactive panel: the whole app as a 1920 × 1080 panel shows it.
            // Classroom edition on a phone: the board's 1920 × 1080 layout, scaled to fit.
            return CrashOverlay(
              // Classroom edition on a 4K panel that reports a pixel ratio of 1: laid out as on a
              // 1080p panel and scaled up; and the college's Screen size (Smaller / Larger).
              child: CeScreenFit(
              enabled: Edition.classroom && !controller.panelPreview,
              size: controller.classroom.screenSize,
              child: CePhoneFit(
              enabled: Edition.classroom && !controller.panelPreview,
              child: PanelPreview(
              enabled: controller.panelPreview,
              onExit: () => controller.setPanelPreview(false),
              child: BoardLook(
                look: look,
                child: EyeComfortFilter(
                  settings: controller.eyeComfort,
                  child: BoardChromeTheme(
                    child: BroadcastOverlay(
                      messages: controller.broadcasts,
                      acknowledged: controller.acknowledgedEmergencies,
                      onDismiss: controller.dismissBroadcast,
                      child: Theme(data: boardAppTheme(look), child: DeviceLockGate(board: controller, child: RoomSyncGate(board: controller, child: child!))),
                    ),
                  ),
                ),
              ),
              ),
              ),
              ),
            );
          },
        ),
        home: ListenableBuilder(
          listenable: controller,
          builder: (context, _) => switch (controller.stage) {
            BoardStage.loading => const Scaffold(body: Center(child: CircularProgressIndicator())),
            // The Classroom edition starts offline, from the board's own timetable; pairing
            // with the ERP (the enrolment screen) is in its Settings → Advanced.
            BoardStage.needsEnrollment => Edition.classroom ? ClassroomStart(board: controller) : EnrollScreen(controller: controller),
            // Concept videos are suggested over the board when a period starts.
            // The lock screen and PIN offer of shared-board profiles go over it (features/profiles).
            // No YouTube suggestions in the Classroom edition (no online tools).
            BoardStage.board => Edition.onlineTools
                ? ConceptVideoSuggestions(
                    board: controller,
                    child: ProfileLock(board: controller, child: BoardScreen(board: controller)),
                  )
                : ProfileLock(board: controller, child: BoardScreen(board: controller)),
          },
        ),
      );
      },
    );
  }
}
