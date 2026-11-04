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
import 'core/firebase_push.dart';
import 'core/server_config.dart';
import 'core/token_store.dart';
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
    final api = DemoStudentApi();
    final state = AppState(api, prefs, tokens: MemoryTokenStore(), live: DemoLiveConnection.connector(api));
    runApp(StudentApp(state: state));
    await state.restore();
    return;
  }
  final client = http.Client();
  // Kept for this person only, wiped on sign-out: the core screens' last answers.
  Future<Directory> support() async => Directory('${(await getApplicationSupportDirectory()).path}/zynetix');
  final cache = KxReadCache(() async => Directory('${(await support()).path}/reads'));
  final api = HttpStudentApi(baseUrl: defaultServerUrl, client: client, cache: cache)..deviceId = installId(prefs);
  // Push only when this build was given Firebase options (docs/product/push-setup.md).
  final messaging = await initPushMessaging();
  final state = AppState(
    api,
    prefs,
    messaging: messaging,
    refresher: api.refresher,
    // Downloads and offline lessons live in the documents folder; the cache in support; previews in temp.
    wipeLocal: () async => kxWipeLocalFiles([await support(), await getApplicationDocumentsDirectory(), await getTemporaryDirectory()]),
  );
  api.onUnauthorized = state.signOut;
  KxCrashReporter(app: kAppName, appVersion: kAppVersion, send: KxCrashReporter.httpSender(client, () => state.serverUrl))
    ..tenant = (() => state.signedIn ? state.rememberedTenant : null)
    ..install();
  runApp(
    StudentApp(
      state: state,
      versionCheck: () => kxCheckVersion(client, state.serverUrl, app: kAppName, version: kAppVersion),
      openStore: (url) => launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication),
      offline: cache.offline,
    ),
  );
  await state.restore();
}
