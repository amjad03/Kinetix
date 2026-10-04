import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app.dart';
import 'core/api.dart';
import 'core/app_state.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final prefs = await SharedPreferences.getInstance();
  final api = HttpStudentApi(baseUrl: defaultServerUrl);
  // Push: pass a Firebase-backed PushTokenSource here once the SDK is added (see core/push.dart).
  final state = AppState(api, prefs);
  api.onUnauthorized = state.signOut;
  runApp(StudentApp(state: state));
  await state.restore();
}
