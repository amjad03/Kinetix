import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_lesson/kinetix_lesson.dart';
import 'package:kinetix_parent/app.dart';
import 'package:kinetix_parent/core/app_state.dart';
import 'package:kinetix_parent/core/push.dart';
import 'package:kinetix_parent/core/token_store.dart';
import 'package:kinetix_parent/l10n/app_localizations.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fake_api.dart';

/// The app's English words, for tests of helpers that take them.
final en = lookupAppLocalizations(const Locale('en'));

/// Pumps the app at phone size. With [signedIn], a stored token restores the session
/// ([tokens] defaults to a secure store holding one).
Future<(FakeParentApi, AppState)> pumpApp(
  WidgetTester tester, {
  bool signedIn = true,
  Map<String, Object> prefs = const {},
  void Function(FakeParentApi)? setup,
  Size size = const Size(412, 892),
  double textScale = 1,
  TokenStore? tokens,
  PushMessaging messaging = const NoPushMessaging(),
  FakeRealtimeServer? realtime,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  tester.platformDispatcher.textScaleFactorTestValue = textScale;
  addTearDown(tester.view.reset);
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
  // Lessons play on a silent clock in tests (there is no audio backend).
  LessonAudio.debugFactory = (_, _, length) async => SilentLessonAudio(length, audible: true);
  addTearDown(() => LessonAudio.debugFactory = null);
  SharedPreferences.setMockInitialValues({...prefs});
  final api = FakeParentApi();
  setup?.call(api);
  final state = AppState(
    api,
    await SharedPreferences.getInstance(),
    tokens: tokens ?? MemoryTokenStore(signedIn ? 'tok' : null),
    messaging: messaging,
    realtime: (realtime ?? FakeRealtimeServer()).connect,
  );
  await tester.pumpWidget(ParentApp(state: state));
  await state.restore();
  await tester.pumpAndSettle();
  return (api, state);
}

/// The token the app keeps in its secure store.
String? storedToken(AppState state) => (state.tokens as MemoryTokenStore).token;

/// Switches the sign-in screen from a texted code to a password.
Future<void> usePassword(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key('usePassword')));
  await tester.pumpAndSettle();
}
