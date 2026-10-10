import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/features/language_kit/dictionary_data.dart';
import 'package:kinetix_board/features/language_kit/language_kit.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import 'support/board_fonts.dart';
import 'support/panel_harness.dart';

/// The dictionary as a device runs it: no override, the words come from the asset bundle that pubspec declares.
void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    await loadBoardFonts();
    OfflineDictionary.override(null);
    // The real rootBundle read and parse, as the panel does it on first open.
    final d = await OfflineDictionary.load();
    expect(d.entries.length, greaterThan(8000));
  });

  testWidgets('the bundled dictionary finds a real word and shows its meaning, Hindi and Kannada', (tester) async {
    await pumpPanel(tester, LanguageKitPanel(board: BoardController(), wb: WhiteboardController()), size: panelSize);
    expect(find.byKey(const Key('dictionary-load-failed')), findsNothing);
    await tester.enterText(find.byKey(const Key('dictionary-search')), 'teacher');
    await tester.pump();
    expect(find.byKey(const Key('dictionary-word-teacher')), findsOneWidget);
    expect(find.textContaining('(noun)'), findsWidgets);
    expect(find.byKey(const Key('dictionary-say-teacher')), findsOneWidget);
    await tester.enterText(find.byKey(const Key('dictionary-search')), 'apple');
    await tester.pump();
    expect(find.byKey(const Key('dictionary-hi-apple')), findsOneWidget);
  });

  testWidgets('an empty search offers words to try, and tapping one shows its meaning', (tester) async {
    await pumpPanel(tester, LanguageKitPanel(board: BoardController(), wb: WhiteboardController()), size: panelSize);
    await tester.tap(find.byKey(const Key('dictionary-try-planet')));
    await tester.pump();
    expect(find.byKey(const Key('dictionary-word-planet')), findsOneWidget);
  });
}
