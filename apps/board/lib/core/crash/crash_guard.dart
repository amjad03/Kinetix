import 'dart:async';
import 'dart:ui';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import 'crash_log.dart';

/// What went wrong, for the "Something went wrong" screen.
@immutable
class CrashReport {
  const CrashReport({required this.error, required this.at, this.source = ''});

  final Object error;
  final DateTime at;
  final String source;
}

/// Catches what would otherwise end the app or leave a red screen: Flutter's own errors
/// ([FlutterError.onError]), errors nothing waited for ([PlatformDispatcher.onError] and the
/// zone `main` runs in), and widgets that cannot build ([ErrorWidget.builder] in a release
/// build). Each one first writes the open board's autosave ([beforeCrash]), then goes into the
/// [CrashLog]. A widget that cannot build shows a small "could not be shown" card instead of
/// the red screen; errors that keep coming ([fatalAfter] within [fatalWindow]) bring up the
/// friendly "Something went wrong" screen ([crashed], [CrashOverlay]) with "Back to start".
abstract final class CrashGuard {
  /// Set while the "Something went wrong" screen shows.
  static final crashed = ValueNotifier<CrashReport?>(null);

  /// Written before anything else when something goes wrong (the board's autosave).
  static Future<void> Function() beforeCrash = () async {};

  /// "Back to start": the Classroom edition goes back to its start screen.
  static VoidCallback backToStart = () {};

  /// The app's name and edition in each log entry.
  static String app = '';

  /// The last line of the "Something went wrong" screen.
  static String helpLine = 'If this keeps happening, tell whoever looks after the board.';

  /// Uncaught errors that bring up the friendly screen when they come this often.
  static int fatalAfter = 3;
  static Duration fatalWindow = const Duration(minutes: 1);

  static DateTime Function() now = DateTime.now;
  static final _recent = <DateTime>[];
  static bool _installed = false;

  /// Hooks the handlers in (once). [releaseErrorWidget]: the friendly card instead of Flutter's
  /// error widget (release builds; debug builds keep the red screen for developers).
  static void install({bool releaseErrorWidget = kReleaseMode}) {
    if (_installed) return;
    _installed = true;
    final previous = FlutterError.onError;
    FlutterError.onError = (details) {
      // Developers still see it in the console in debug builds.
      if (kDebugMode) (previous ?? FlutterError.presentError)(details);
      unawaited(onFlutterError(details));
    };
    PlatformDispatcher.instance.onError = (error, stack) {
      unawaited(onUncaught(error, stack, source: 'platform'));
      return true;
    };
    if (releaseErrorWidget) ErrorWidget.builder = friendlyErrorWidget;
  }

  /// A Flutter error (build, layout, paint, a gesture): the board is saved and it is logged.
  /// The screen goes on (a widget that failed shows [friendlyErrorWidget]).
  static Future<void> onFlutterError(FlutterErrorDetails d) => _handle(d.exception, d.stack, source: 'flutter${d.library == null ? '' : ' · ${d.library}'}', fatal: false);

  /// An error nothing caught (a future, a timer, a plugin): saved and logged; when they keep
  /// coming the friendly screen comes up.
  static Future<void> onUncaught(Object error, StackTrace? stack, {String source = 'zone'}) {
    final t = now();
    _recent
      ..removeWhere((x) => t.difference(x) > fatalWindow)
      ..add(t);
    return _handle(error, stack, source: source, fatal: _recent.length >= fatalAfter);
  }

  /// Something that must stop what the teacher is doing (the app cannot go on as it is).
  static Future<void> fatal(Object error, StackTrace? stack, {String source = 'fatal'}) => _handle(error, stack, source: source, fatal: true);

  static Future<void> _handle(Object error, StackTrace? stack, {required String source, required bool fatal}) async {
    // The teacher's writing first: the autosave is written before anything else happens.
    try {
      await beforeCrash().timeout(const Duration(seconds: 3));
    } catch (e) {
      debugPrint('Autosave before the crash failed: $e');
    }
    await CrashLog.instance.record(error, stack, source: source, fatal: fatal, app: app.isEmpty ? null : app);
    if (fatal) crashed.value = CrashReport(error: error, at: now(), source: source);
  }

  /// "Back to start": the screen goes and the app starts over from its first screen.
  static void recover() {
    _recent.clear();
    crashed.value = null;
    try {
      backToStart();
    } catch (e, s) {
      unawaited(CrashLog.instance.record(e, s, source: 'back to start'));
    }
  }

  @visibleForTesting
  static void reset() {
    _recent.clear();
    crashed.value = null;
    beforeCrash = () async {};
    backToStart = () {};
  }
}

/// A release build's card where a widget could not be built (no red screen): "This part could
/// not be shown", and Back to start. Needs nothing from above it (it may be the whole app).
Widget friendlyErrorWidget(FlutterErrorDetails details) => Directionality(
  textDirection: TextDirection.ltr,
  child: ColoredBox(
    key: const Key('crash-error-widget'),
    color: const Color(0xFFF3F6FB),
    child: Center(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.sentiment_dissatisfied_outlined, size: 40, color: Color(0xFF475569)),
            const SizedBox(height: 8),
            const Text(
              'This part could not be shown.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 18, color: Color(0xFF13165A), fontWeight: FontWeight.w600, decoration: TextDecoration.none),
            ),
            const SizedBox(height: 12),
            GestureDetector(
              key: const Key('crash-error-back'),
              onTap: CrashGuard.recover,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 12),
                decoration: BoxDecoration(color: const Color(0xFF1D4ED8), borderRadius: BorderRadius.circular(28)),
                child: const Text('Back to start', style: TextStyle(fontSize: 16, color: Color(0xFFFFFFFF), fontWeight: FontWeight.w600, decoration: TextDecoration.none)),
              ),
            ),
          ],
        ),
      ),
    ),
  ),
);

/// Puts the "Something went wrong" screen over the app while [CrashGuard.crashed] is set.
class CrashOverlay extends StatelessWidget {
  const CrashOverlay({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) => ValueListenableBuilder<CrashReport?>(
    valueListenable: CrashGuard.crashed,
    builder: (context, report, _) => Stack(
      children: [
        Positioned.fill(child: child),
        if (report != null) const Positioned.fill(child: CrashScreen()),
      ],
    ),
  );
}

/// "Something went wrong – Back to start": calm, for a teacher in front of a class. The board
/// was saved before this screen came up.
class CrashScreen extends StatelessWidget {
  const CrashScreen({super.key});

  @override
  Widget build(BuildContext context) => Material(
    key: const Key('crash-screen'),
    color: const Color(0xFFF3F6FB),
    child: Center(
      child: Container(
        constraints: const BoxConstraints(maxWidth: 760),
        margin: const EdgeInsets.all(24),
        padding: const EdgeInsets.fromLTRB(48, 44, 48, 40),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(32), boxShadow: const [BoxShadow(color: Color(0x1A13165A), blurRadius: 30, offset: Offset(0, 12))]),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 96,
              height: 96,
              decoration: const BoxDecoration(color: Color(0xFFFFF4CC), shape: BoxShape.circle),
              child: const Icon(Icons.sentiment_dissatisfied_outlined, size: 52, color: Color(0xFF13165A)),
            ),
            const SizedBox(height: 24),
            const Text('Something went wrong', textAlign: TextAlign.center, style: TextStyle(fontSize: 40, fontWeight: FontWeight.w500, color: Color(0xFF13165A))),
            const SizedBox(height: 12),
            const Text(
              'Sorry about that. Your writing on the board was saved first, and it comes back when the board opens again.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 20, color: Color(0xFF475569), height: 1.4),
            ),
            const SizedBox(height: 36),
            FilledButton.icon(
              key: const Key('crash-back-to-start'),
              onPressed: CrashGuard.recover,
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF1D4ED8),
                foregroundColor: Colors.white,
                minimumSize: const Size(360, 88),
                shape: const StadiumBorder(),
                textStyle: const TextStyle(fontSize: 26, fontWeight: FontWeight.w600),
              ),
              icon: const Icon(Icons.home_outlined, size: 34),
              label: const Text('Back to start'),
            ),
            const SizedBox(height: 16),
            Text(CrashGuard.helpLine, textAlign: TextAlign.center, style: const TextStyle(fontSize: 15, color: Color(0xFF475569))),
          ],
        ),
      ),
    ),
  );
}
