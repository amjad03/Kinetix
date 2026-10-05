import 'package:flutter/widgets.dart';

import 'runner_page_stub.dart' if (dart.library.io) 'runner_page_io.dart' as platform;

/// The runner page (assets/runner/index.html) in a WebView: the system WebView on Android,
/// Edge WebView2 on Windows, fed by a server on 127.0.0.1. Null where there is none (tests,
/// Linux, the web): Python and JavaScript then say they cannot run here.
abstract class RunnerPage {
  /// Everything the page posts (JSON text, see RunnerSession).
  Stream<Object?> get messages;

  /// Loads the page.
  Future<void> open();

  /// Runs a line of JavaScript in the page.
  void eval(String js);

  /// The WebView, which must be in the widget tree (it can be tiny) for the page to run on
  /// Android.
  Widget view();

  void dispose();

  /// Tests replace the platform page with a fake.
  static RunnerPage? Function()? debugOverride;

  static RunnerPage? create() => debugOverride != null ? debugOverride!() : platform.createRunnerPage();
}
