import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app.dart';
import 'core/api.dart';
import 'core/app_state.dart';
import 'core/firebase_push.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final prefs = await SharedPreferences.getInstance();
  final api = HttpStudentApi(baseUrl: defaultServerUrl);
  // Push only when this build was given Firebase options (docs/product/push-setup.md).
  final messaging = await initPushMessaging();
  final state = AppState(api, prefs, messaging: messaging);
  api.onUnauthorized = state.signOut;
  runApp(StudentApp(state: state));
  await state.restore();
}
