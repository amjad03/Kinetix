import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_lesson/kinetix_lesson.dart';
import 'package:kinetix_parent/app.dart';
import 'package:kinetix_parent/core/app_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fake_api.dart';

/// Pumps the app at phone size. With [signedIn], a stored token restores the session.
Future<(FakeParentApi, AppState)> pumpApp(
  WidgetTester tester, {
  bool signedIn = true,
  Map<String, Object> prefs = const {},
  void Function(FakeParentApi)? setup,
}) async {
  tester.view.physicalSize = const Size(412, 892);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
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
