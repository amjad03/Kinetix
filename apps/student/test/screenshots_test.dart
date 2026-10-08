// Screenshots of Home in light and dark for docs/design/mobile, with the real fonts:
//   KINETIX_SCREENSHOTS=1 flutter test --update-goldens test/screenshots_test.dart
// Without the variable these are skipped, so the normal test run never compares pixels.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'helpers.dart';

Future<void> loadAppFonts() async {
  final dir = Directory('../../packages/kinetix_ui/fonts');
  for (final family in ['SansFlex', 'SansFlexDisplay', 'NotoSansDevanagari', 'NotoSansKannada']) {
    final loader = FontLoader('packages/kinetix_ui/$family');
    for (final f in dir.listSync().whereType<File>().where((f) => f.path.contains('$family-') && f.path.endsWith('.ttf'))) {
      loader.addFont(Future.value(ByteData.sublistView(f.readAsBytesSync())));
    }
    await loader.load();
  }
  final icons = File('${Platform.environment['FLUTTER_ROOT'] ?? '/opt/flutter'}/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf');
  if (icons.existsSync()) {
    await (FontLoader('MaterialIcons')..addFont(Future.value(ByteData.sublistView(icons.readAsBytesSync())))).load();
  }
}

void main() {
  final shots = Platform.environment.containsKey('KINETIX_SCREENSHOTS');
  for (final dark in [false, true]) {
    testWidgets('screenshot: Home ${dark ? 'dark' : 'light'}', (tester) async {
      await loadAppFonts();
      tester.platformDispatcher.platformBrightnessTestValue = dark ? Brightness.dark : Brightness.light;
      addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
      await pumpApp(tester, size: const Size(780, 1900));
      tester.view.devicePixelRatio = 2;
      await tester.pumpAndSettle();
      await expectLater(find.byType(MaterialApp), matchesGoldenFile('../../../docs/design/mobile/student-home-${dark ? 'dark' : 'light'}.png'));
    }, skip: !shots);
  }
}
