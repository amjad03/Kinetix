import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_lesson/kinetix_lesson.dart';
import 'package:kinetix_student/app.dart';
import 'package:kinetix_student/core/app_state.dart';
import 'package:kinetix_student/core/push.dart';
import 'package:kinetix_student/core/token_store.dart';
import 'package:kinetix_student/core/live_audio_player.dart';
import 'package:kinetix_student/l10n/app_localizations.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fake_api.dart';
import 'fake_live.dart';

/// The app's English words, for tests of helpers that take them.
final en = lookupAppLocalizations(const Locale('en'));

/// Pumps the app at phone size (or [size]). With [signedIn], a stored token restores the session
/// ([tokens] defaults to a secure store holding one).
Future<(FakeStudentApi, AppState)> pumpApp(
  WidgetTester tester, {
  bool signedIn = true,
  Map<String, Object> prefs = const {},
  void Function(FakeStudentApi)? setup,
  Size size = const Size(412, 892),
  double textScale = 1,
  TokenStore? tokens,
  PushMessaging messaging = const NoPushMessaging(),
  FakeLiveServer? live,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  tester.platformDispatcher.textScaleFactorTestValue = textScale;
  addTearDown(tester.view.reset);
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
  // Lessons play on a silent clock in tests (there is no audio backend).
  LessonAudio.debugFactory = (_, _, length) async => SilentLessonAudio(length, audible: true);
  addTearDown(() => LessonAudio.debugFactory = null);
  // Class audio in live classes plays into a recorder.
  LiveAudioPlayer.debugFactory = () => FakeLiveAudioPlayer.last = FakeLiveAudioPlayer();
  addTearDown(() => LiveAudioPlayer.debugFactory = null);
  SharedPreferences.setMockInitialValues({...prefs});
  final api = FakeStudentApi();
  setup?.call(api);
  final state = AppState(
    api,
    await SharedPreferences.getInstance(),
    tokens: tokens ?? MemoryTokenStore(signedIn ? 'tok' : null),
    messaging: messaging,
    live: (live ?? FakeLiveServer()).connect,
  );
  await tester.pumpWidget(StudentApp(state: state));
  await state.restore();
  await tester.pumpAndSettle();
  return (api, state);
}

/// Taps a bottom-bar (or rail) destination by its label.
Future<void> openTab(WidgetTester tester, String label) async {
  await tester.tap(
    find.descendant(of: find.byWidgetPredicate((w) => w is NavigationBar || w is NavigationRail), matching: find.text(label)),
  );
  await tester.pumpAndSettle();
}

/// Scrolls the first scrollable on screen until [f] is visible.
Future<void> scrollTo(WidgetTester tester, Finder f, {Finder? scrollable}) async {
  await tester.scrollUntilVisible(f, 200, scrollable: scrollable ?? find.byType(Scrollable).first);
  await tester.pumpAndSettle();
}

/// The token the app keeps in its secure store.
String? storedToken(AppState state) => (state.tokens as MemoryTokenStore).token;

/// Switches the sign-in screen from a texted code to a password.
Future<void> usePassword(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key('usePassword')));
  await tester.pumpAndSettle();
}
