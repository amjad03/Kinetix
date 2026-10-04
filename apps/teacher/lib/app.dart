import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'core/app_state.dart';
import 'features/home/home_screen.dart';
import 'features/sign_in/sign_in_screen.dart';

class TeacherApp extends StatelessWidget {
  const TeacherApp({super.key, required this.state});

  final AppState state;

  static final navigatorKey = GlobalKey<NavigatorState>();

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'KINETIX Teacher',
      debugShowCheckedModeBanner: false,
      theme: KinetixTheme.light(),
      darkTheme: KinetixTheme.dark(),
      themeMode: ThemeMode.system,
      navigatorKey: navigatorKey,
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
