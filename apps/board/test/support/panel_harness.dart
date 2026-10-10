import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/l10n/l10n.dart';
import 'package:kinetix_labs/kinetix_labs.dart' show LabSpeech;
import 'package:kinetix_ui/kinetix_ui.dart';

/// The two screens every new panel is checked at: a phone held upright and a 1920 × 1080 panel.
const phoneSize = Size(390, 844), panelSize = Size(1920, 1080);

/// Pumps [child] as the split panel would hold it (42 % of a wide screen, the whole width of a
/// phone), in [lang], at [size]; [spoken] collects what the board would say.
Future<void> pumpPanel(WidgetTester tester, Widget child, {Size size = panelSize, String lang = 'en', List<String>? spoken, bool settle = true}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final width = size.width < 600 ? size.width : size.width * 0.42;
  await tester.pumpWidget(
    MaterialApp(
      theme: KinetixTheme.light(),
      locale: Locale(lang),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: Scaffold(
        body: Align(
          alignment: Alignment.centerRight,
          child: SizedBox(
            width: width,
            height: size.height,
            child: LabSpeech(speak: (t) => spoken?.add(t), child: child),
          ),
        ),
      ),
    ),
  );
  if (settle) await tester.pumpAndSettle();
}
