import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import 'core/app_state.dart';
import 'core/mobile.dart';
import 'demo/demo.dart';
import 'features/alumni/alumni_home.dart';
import 'features/shell/shell.dart';
import 'features/sign_in/sign_in_screen.dart';
import 'l10n/l10n.dart';

class StudentApp extends StatelessWidget {
  const StudentApp({super.key, required this.state, this.versionCheck, this.openStore, this.offline});

  final AppState state;

  /// The start-up version check (forced or recommended update); null skips it (tests, demo builds).
  final Future<KxVersionCheck?> Function()? versionCheck;
  final void Function(String url)? openStore;

  /// True while screens show saved answers because the server cannot be reached.
  final ValueListenable<bool>? offline;

  static final navigatorKey = GlobalKey<NavigatorState>();

  @override
  Widget build(BuildContext context) {
    // Rebuilds when the language changes (signing in, or the Profile setting).
    return ListenableBuilder(
      listenable: state,
      builder: (context, _) => MaterialApp(
      title: 'ZYNETIX Student',
      debugShowCheckedModeBanner: false,
      locale: state.locale,
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: appLocalizationsDelegates,
      localeListResolutionCallback: resolveDeviceLocale,
      theme: ZynetixTheme.light(),
      darkTheme: ZynetixTheme.dark(),
      themeMode: ThemeMode.system,
      navigatorKey: navigatorKey,
      builder: (context, child) {
        final app = demoAppBuilder(context, child);
        final off = offline;
        if (off == null) return app;
        return Column(
          children: [
            Expanded(child: app),
            SafeArea(top: false, child: KxOfflineBanner(offline: off, text: AppLocalizations.of(context).mobileOffline)),
          ],
        );
      },
      home: _gate(ListenableBuilder(
        listenable: state,
        builder: (context, _) {
          if (state.restoring) return const Scaffold(body: Center(child: CircularProgressIndicator()));
          if (!state.signedIn) {
            // Signed out (or the token expired) while deeper in the app: drop pushed screens.
            WidgetsBinding.instance.addPostFrameCallback((_) => navigatorKey.currentState?.popUntil((r) => r.isFirst));
          }
          // Keyed by user so signing out and in again starts from a clean Today.
          if (!state.signedIn) return SignInScreen(state: state);
          return state.alumniOnly ? AlumniHome(key: ValueKey(state.me!.id), api: state.api, state: state) : StudentShell(key: ValueKey(state.me!.id), state: state);
        },
      )),
    ),
    );
  }

  Widget _gate(Widget home) => versionCheck == null
      ? home
      : KxVersionGate(check: versionCheck!, strings: (c) => mobileStrings(AppLocalizations.of(c)), openStore: openStore, child: home);
}
