// Promo capture (temporary copy into apps/parent/test/, deleted after).
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'helpers.dart';
import 'screenshots_test.dart' show loadAppFonts;

void main() {
  for (final tab in ['navHome', 'navFees']) {
    testWidgets('promo parent $tab', (tester) async {
      await loadAppFonts();
      tester.platformDispatcher.platformBrightnessTestValue = Brightness.light;
      addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
      await pumpApp(tester, size: const Size(1170, 2532));
      tester.view.devicePixelRatio = 3;
      tester.view.padding = const FakeViewPadding(top: 141, bottom: 102);
      tester.view.viewPadding = const FakeViewPadding(top: 141, bottom: 102);
      await tester.pumpAndSettle();
      if (tab != 'navHome') { await tester.tap(find.byKey(Key(tab))); await tester.pumpAndSettle(); }
      await expectLater(find.byType(MaterialApp), matchesGoldenFile('../../../marketing/promo/shots/parent-$tab.png'));
    });
  }
}
