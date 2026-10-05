import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'core/app_state.dart';
import 'demo/demo.dart';
import 'features/shell/shell.dart';
import 'features/sign_in/sign_in_screen.dart';
import 'l10n/l10n.dart';

class StudentApp extends StatelessWidget {
  const StudentApp({super.key, required this.state});

  final AppState state;

  static final navigatorKey = GlobalKey<NavigatorState>();

  @override
  Widget build(BuildContext context) {
    // Rebuilds when the language changes (signing in, or the Profile setting).
    return ListenableBuilder(
      listenable: state,
      builder: (context, _) => MaterialApp(
      title: 'KINETIX Student',
      debugShowCheckedModeBanner: false,
      locale: state.locale,
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: appLocalizationsDelegates,
      localeListResolutionCallback: resolveDeviceLocale,
      theme: KinetixTheme.light(),
      darkTheme: KinetixTheme.dark(),
      themeMode: ThemeMode.system,
      navigatorKey: navigatorKey,
      builder: demoAppBuilder,
      home: ListenableBuilder(
        listenable: state,
        builder: (context, _) {
          if (state.restoring) return const Scaffold(body: Center(child: CircularProgressIndicator()));
          if (!state.signedIn) {
            // Signed out (or the token expired) while deeper in the app: drop pushed screens.
            WidgetsBinding.instance.addPostFrameCallback((_) => navigatorKey.currentState?.popUntil((r) => r.isFirst));
          }
          // Keyed by user so signing out and in again starts from a clean Today.
          return state.signedIn ? StudentShell(key: ValueKey(state.me!.id), state: state) : SignInScreen(state: state);
        },
      ),
    ),
    );
  }
}
