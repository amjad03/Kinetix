import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'core/app_state.dart';
import 'core/l10n.dart';
import 'demo/demo.dart';
import 'features/home/home_screen.dart';
import 'features/sign_in/sign_in_screen.dart';

class TeacherApp extends StatelessWidget {
  const TeacherApp({super.key, required this.state});

  final AppState state;

  static final navigatorKey = GlobalKey<NavigatorState>();

  /// Before sign-in (no [AppState.language]): Hindi or Kannada when the device asks for it, else English.
  static Locale resolveDeviceLocale(List<Locale>? device, Iterable<Locale> supported) {
    for (final l in device ?? const <Locale>[]) {
      if (supportedLanguages.contains(l.languageCode)) return Locale(l.languageCode);
    }
    return const Locale('en');
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(listenable: state, builder: (context, _) => _app(state.language));

  Widget _app(String? language) {
    return MaterialApp(
      onGenerateTitle: (context) => context.l10n.appTitle,
      locale: language == null ? null : Locale(language),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      localeListResolutionCallback: resolveDeviceLocale,
      debugShowCheckedModeBanner: false,
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
          // Keyed by user so signing out and in again starts from a clean home.
          return state.signedIn ? HomeScreen(key: ValueKey(state.me!.id), state: state) : SignInScreen(state: state);
        },
      ),
    );
  }
}
