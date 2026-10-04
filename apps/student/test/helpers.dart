import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_lesson/kinetix_lesson.dart';
import 'package:kinetix_student/app.dart';
import 'package:kinetix_student/core/app_state.dart';
import 'package:kinetix_student/core/push.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fake_api.dart';
import 'fake_live.dart';

/// Pumps the app at phone size (or [size]). With [signedIn], a stored token restores the session.
Future<(FakeStudentApi, AppState)> pumpApp(
  WidgetTester tester, {
  bool signedIn = true,
  Map<String, Object> prefs = const {},
  void Function(FakeStudentApi)? setup,
  Size size = const Size(412, 892),
  double textScale = 1,
  PushTokenSource push = const NoPushTokenSource(),
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
  SharedPreferences.setMockInitialValues({if (signedIn) 'token': 'tok', ...prefs});
  final api = FakeStudentApi();
  setup?.call(api);
  final state = AppState(api, await SharedPreferences.getInstance(), push: push, live: (live ?? FakeLiveServer()).connect);
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
