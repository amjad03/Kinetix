// Promo capture (temporary copy into apps/teacher/test/, deleted after):
//   flutter test --update-goldens test/promo_shots_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fake_api.dart';
import 'helpers.dart';

void main() {
  for (final tab in ['navHome', 'navClasses']) {
    testWidgets('promo teacher $tab', (tester) async {
      await loadAppFonts();
      final api = FakeTeacherApi();
      seed(api);
      phone(tester);
      tester.view.physicalSize = const Size(1170, 2532);
      tester.view.devicePixelRatio = 3;
      tester.view.padding = const FakeViewPadding(top: 141, bottom: 102);
      tester.view.viewPadding = const FakeViewPadding(top: 141, bottom: 102);
      tester.platformDispatcher.platformBrightnessTestValue = Brightness.light;
      addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
      await pumpApp(tester, api, prefs: {'token': 'tok'}, tab: tab == 'navHome' ? null : tab);
      await expectLater(find.byType(MaterialApp), matchesGoldenFile('../../../marketing/promo/shots/teacher-$tab.png'));
    });
  }
}
