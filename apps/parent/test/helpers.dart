import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_lesson/kinetix_lesson.dart';
import 'package:kinetix_parent/app.dart';
import 'package:kinetix_parent/core/app_state.dart';
import 'package:kinetix_parent/l10n/app_localizations.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fake_api.dart';

/// The app's English words, for tests of helpers that take them.
final en = lookupAppLocalizations(const Locale('en'));

/// Pumps the app at phone size. With [signedIn], a stored token restores the session.
Future<(FakeParentApi, AppState)> pumpApp(
  WidgetTester tester, {
  bool signedIn = true,
  Map<String, Object> prefs = const {},
  void Function(FakeParentApi)? setup,
  Size size = const Size(412, 892),
  double textScale = 1,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  tester.platformDispatcher.textScaleFactorTestValue = textScale;
  addTearDown(tester.view.reset);
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
  // Lessons play on a silent clock in tests (there is no audio backend).
  LessonAudio.debugFactory = (_, _, length) async => SilentLessonAudio(length, audible: true);
  addTearDown(() => LessonAudio.debugFactory = null);
  SharedPreferences.setMockInitialValues({if (signedIn) 'token': 'tok', ...prefs});
  final api = FakeParentApi();
  setup?.call(api);
  final state = AppState(api, await SharedPreferences.getInstance());
  await tester.pumpWidget(ParentApp(state: state));
  await state.restore();
  await tester.pumpAndSettle();
  return (api, state);
}
