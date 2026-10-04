import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app.dart';
import 'core/api.dart';
import 'core/app_state.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final prefs = await SharedPreferences.getInstance();
  final api = HttpTeacherApi(baseUrl: defaultServerUrl);
  final state = AppState(api, prefs);
  api.onUnauthorized = state.signOut;
  runApp(TeacherApp(state: state));
  await state.restore();
}
