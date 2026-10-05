import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

/// The API address baked in at build time:
/// `flutter build … --dart-define=KINETIX_API_URL=https://api.example.in`.
/// The realtime (Socket.IO) connection uses the same address.
const kinetixApiUrlDefine = String.fromEnvironment('KINETIX_API_URL');

/// What debug builds use when no address was given: a local API (on the Android emulator the
/// host machine is 10.0.2.2). Profile and release builds never fall back to it.
const debugServerUrl = 'http://localhost:4000';

/// `--dart-define=KINETIX_DEMO=true`: an offline demo build with sample data and no server
/// (docs/product/demo-builds.md).
const kinetixDemoDefine = bool.fromEnvironment('KINETIX_DEMO');

/// The address a demo build shows. It is never contacted.
const demoServerUrl = 'https://demo.kinetix.invalid';

/// A build that cannot know its server (docs/operations/mobile-release.md).
class ServerConfigError extends Error {
  ServerConfigError(this.message);

  final String message;

  @override
  String toString() => 'ServerConfigError: $message';
}

/// The server address for this build: [defined] (`KINETIX_API_URL`) without trailing slashes, or
/// [debugServerUrl] in a debug build, or [demoServerUrl] in a [demo] build (which needs no
/// server). Throws [ServerConfigError] for a profile/release build without the define, or for a
/// value that is not an http(s) URL.
String resolveServerUrl({String defined = kinetixApiUrlDefine, bool debug = kDebugMode, bool demo = kinetixDemoDefine}) {
  if (demo) return demoServerUrl;
  final url = defined.trim().replaceAll(RegExp(r'/+$'), '');
  if (url.isEmpty) {
    if (debug) return debugServerUrl;
    throw ServerConfigError(
      'This build has no server address. Build it with '
      '--dart-define=KINETIX_API_URL=https://<api domain> (see docs/operations/mobile-release.md).',
    );
  }
  final uri = Uri.tryParse(url);
  if (uri == null || !(uri.isScheme('http') || uri.isScheme('https')) || uri.host.isEmpty) {
    throw ServerConfigError('KINETIX_API_URL must be an http(s) address like https://api.example.in, not "$defined".');
  }
  return url;
}

/// The server this build talks to until the user picks another one. main() reads it first, so a
/// misbuilt release stops at [ServerConfigErrorApp] instead of quietly using localhost.
final String defaultServerUrl = resolveServerUrl();

/// Shown instead of the app when [resolveServerUrl] failed.
class ServerConfigErrorApp extends StatelessWidget {
  const ServerConfigErrorApp({super.key, required this.error});

  final ServerConfigError error;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        body: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text('KINETIX cannot start: ${error.message}', textAlign: TextAlign.center),
            ),
          ),
        ),
      ),
    );
  }
}

/// Resolves [defaultServerUrl] at startup. On failure logs the reason, shows
/// [ServerConfigErrorApp] and returns false: the caller must not start the app.
bool checkServerConfig() {
  try {
    defaultServerUrl;
    return true;
  } on ServerConfigError catch (e) {
    debugPrint('$e');
    runApp(ServerConfigErrorApp(error: e));
    return false;
  }
}
