import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import 'app.dart';
import 'core/api.dart';
import 'core/app_state.dart';
import 'core/device_id.dart';
import 'core/mobile.dart';
import 'core/push.dart';
import 'core/realtime.dart';
import 'core/secure_store.dart';
import 'core/server_config.dart';
import 'demo/demo.dart';
import 'demo/demo_api.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // A release built without --dart-define=ZYNETIX_API_URL stops here with a clear message
  // (unless it is a demo build: --dart-define=ZYNETIX_DEMO=true, which needs no server).
  if (!checkServerConfig()) return;
  final prefs = await SharedPreferences.getInstance();
  if (Demo.enabled) {
    // Offline sample data (docs/product/demo-builds.md): no network, no pushes, nothing kept.
    final api = DemoTeacherApi();
    final state = AppState(api, prefs, realtime: DemoRealtime(api), secure: MemorySecureStore());
    runApp(TeacherApp(state: state));
    await state.restore();
    return;
  }
  // Firebase only when the build was given its options (see FirebaseConfig).
  final push = await startPush();
  final client = http.Client();
  // Kept for this teacher only, wiped on sign-out: the core screens' last answers and writes made offline.
  Future<Directory> support() async => Directory('${(await getApplicationSupportDirectory()).path}/zynetix');
  final cache = KxReadCache(() async => Directory('${(await support()).path}/reads'));
  late final HttpTeacherApi api;
  final writes = KxWriteQueue(file: () async => File('${(await support()).path}/outbox.json'), send: (w) => api.sendQueued(w));
  api = HttpTeacherApi(baseUrl: defaultServerUrl, client: client, cache: cache, writes: writes)..deviceId = installId(prefs);
  late final AppState state;
  state = AppState(
    api,
    prefs,
    realtime: SocketRealtime(),
    secure: DeviceSecureStore(),
    push: push,
    refresher: api.refresher,
    wipeLocal: () async {
      await writes.clear();
      await kxWipeLocalFiles([await support(), await getTemporaryDirectory()]);
    },
  );
  api.onUnauthorized = () => state.signOut(expired: true);
  KxCrashReporter(app: kAppName, appVersion: kAppVersion, send: KxCrashReporter.httpSender(client, () => state.serverUrl))
    ..tenant = (() => state.signedIn ? state.rememberedTenant : null)
    ..install();
  runApp(
    TeacherApp(
      state: state,
      versionCheck: () => kxCheckVersion(client, state.serverUrl, app: kAppName, version: kAppVersion),
      openStore: (url) => launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication),
      offline: cache.offline,
      pendingWrites: writes.pending,
    ),
  );
  await state.restore();
  unawaited(writes.flush());
}
