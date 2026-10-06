import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Taps a control of the board's layout wherever it is: on screen, in the phone's ⋯ sheet, in
/// the menu (bottom left; ⋮ on a phone), or (for `panel-tab-…`) on the split panel, which
/// KINETIX AI opens.
Future<void> tapBoard(WidgetTester tester, String key) async {
  final f = find.byKey(Key(key));
  if (f.evaluate().isEmpty && key.startsWith('panel-tab-') && find.byKey(const Key('split-panel')).evaluate().isEmpty) {
    await tapBoard(tester, 'panel-ai');
  }
  if (f.evaluate().isEmpty && find.byKey(const Key('phone-more')).evaluate().isNotEmpty) {
    await tester.tap(find.byKey(const Key('phone-more')));
    await tester.pumpAndSettle();
    if (f.evaluate().isEmpty) {
      Navigator.of(tester.element(find.byKey(const Key('more-sheet')))).pop();
      await tester.pumpAndSettle();
    }
  }
  if (f.evaluate().isEmpty) {
    await tester.tap(find.byKey(const Key('board-menu')));
    await tester.pumpAndSettle();
  }
  await tester.ensureVisible(f);
  await tester.pumpAndSettle();
  await tester.tap(f);
  await tester.pumpAndSettle();
}

/// Opens a tile of the tools drawer.
Future<void> openTool(WidgetTester tester, String id) async {
  await tapBoard(tester, 'tool-tools');
  await tapBoard(tester, 'drawer-$id');
}
