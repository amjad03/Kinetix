import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app.dart';
import 'core/api.dart';
import 'core/app_state.dart';
import 'core/push.dart';
import 'core/realtime.dart';
import 'core/secure_store.dart';
import 'core/server_config.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // A release built without --dart-define=KINETIX_API_URL stops here with a clear message.
  if (!checkServerConfig()) return;
  final prefs = await SharedPreferences.getInstance();
  // Firebase only when the build was given its options (see FirebaseConfig).
  final push = await startPush();
  final api = HttpTeacherApi(baseUrl: defaultServerUrl);
  final state = AppState(api, prefs, realtime: SocketRealtime(), secure: DeviceSecureStore(), push: push);
  api.onUnauthorized = () => state.signOut(expired: true);
  runApp(TeacherApp(state: state));
  await state.restore();
}
