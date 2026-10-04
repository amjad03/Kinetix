import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app.dart';
import 'core/api.dart';
import 'core/app_state.dart';
import 'core/firebase_push.dart';
import 'core/server_config.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // A release built without --dart-define=KINETIX_API_URL stops here with a clear message.
  if (!checkServerConfig()) return;
  final prefs = await SharedPreferences.getInstance();
  final api = HttpParentApi(baseUrl: defaultServerUrl);
  // Push only when this build was given Firebase options (docs/product/push-setup.md).
  final messaging = await initPushMessaging();
  final state = AppState(api, prefs, messaging: messaging);
  api.onUnauthorized = state.signOut;
  runApp(ParentApp(state: state));
  await state.restore();
}
