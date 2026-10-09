import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app.dart';
import 'core/api.dart';
import 'core/app_state.dart';
import 'core/device_id.dart';
import 'core/firebase_push.dart';
import 'core/server_config.dart';
import 'core/token_store.dart';
import 'demo/demo.dart';
import 'demo/demo_api.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // A release built without --dart-define=KINETIX_API_URL stops here with a clear message
  // (unless it is a demo build: --dart-define=KINETIX_DEMO=true, which needs no server).
  if (!checkServerConfig()) return;
  final prefs = await SharedPreferences.getInstance();
  if (Demo.enabled) {
    // Offline sample data (docs/product/demo-builds.md): no network, no pushes, nothing kept.
    final api = DemoParentApi();
    final state = AppState(api, prefs, tokens: MemoryTokenStore(), realtime: DemoRealtimeConnection.connector(api));
    runApp(ParentApp(state: state));
    await state.restore();
    return;
  }
  final api = HttpParentApi(baseUrl: defaultServerUrl)..deviceId = installId(prefs);
  // Push only when this build was given Firebase options (docs/product/push-setup.md).
  final messaging = await initPushMessaging();
  final state = AppState(api, prefs, messaging: messaging);
  api.onUnauthorized = state.signOut;
  runApp(ParentApp(state: state));
  await state.restore();
}
