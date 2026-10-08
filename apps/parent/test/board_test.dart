import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import 'helpers.dart';

void main() {
  testWidgets('opens a shared board from Home and swipes between pages', (tester) async {
    final (api, _) = await pumpApp(tester, section: 'academics');
    await tester.scrollUntilVisible(find.text("Today's board: Corporate Accounting"), 200, scrollable: find.byType(Scrollable).first);
    await tester.ensureVisible(find.text("Today's board: Corporate Accounting"));
    await tester.pumpAndSettle();
    await tester.tap(find.text("Today's board: Corporate Accounting"));
    await tester.pumpAndSettle();

    expect(api.calls, contains('board wb1'));
    expect(find.text('Issue and forfeiture of shares'), findsOneWidget);
    expect(find.text('Corporate Accounting · Anita Sharma · Sun 4 Oct'), findsOneWidget);
    expect(find.byType(WhiteboardView), findsOneWidget);
    expect(find.byType(InteractiveViewer), findsOneWidget);
    expect(find.text('Page 1 of 2'), findsOneWidget);
    expect(tester.widget<WhiteboardView>(find.byType(WhiteboardView)).board.pages.first, hasLength(2));

    await tester.drag(find.byKey(const Key('boardPages')), const Offset(-350, 0));
    await tester.pumpAndSettle();
    expect(find.text('Page 2 of 2'), findsOneWidget);
    expect(tester.widget<WhiteboardView>(find.byType(WhiteboardView)).page, 1);
  });

  testWidgets('a board shared notification opens the viewer; a missing board explains itself', (tester) async {
    final (api, _) = await pumpApp(
      section: 'academics',
      tester,
      setup: (api) {
        api.inbox.insert(0, api.boardNotice('nb', 'wb1'));
        api.inbox.insert(0, api.boardNotice('gone', 'wb-gone'));
      },
    );
    await tester.tap(find.text('Updates'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('notification-nb')));
    await tester.pumpAndSettle();
    expect(find.byType(WhiteboardView), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('notification-gone')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('board wb-gone'));
    expect(find.text('This board is no longer shared with the class.'), findsOneWidget);
  });
}
