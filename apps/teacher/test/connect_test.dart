import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_teacher/features/board/connect_screen.dart';

import 'fake_api.dart';
import 'helpers.dart';

void main() {
  late FakeTeacherApi api;

  Future<void> pumpConnect(WidgetTester tester) async {
    await tester.pumpWidget(localizedApp(home: ConnectScreen(api: api, canScan: false)));
    await tester.pumpAndSettle();
  }

  String typed(WidgetTester tester) => tester.widget<TextField>(find.byKey(const Key('codeField'))).controller!.text;

  setUp(() => api = FakeTeacherApi());

  testWidgets('without a camera it opens straight on code entry', (tester) async {
    await pumpConnect(tester);
    expect(find.byKey(const Key('enterCodeTitle')), findsOneWidget);
    expect(find.byKey(const Key('scanInstead')), findsNothing);
  });

  testWidgets('asks for all 6 digits and ignores letters', (tester) async {
    await pumpConnect(tester);
    await tester.enterText(find.byKey(const Key('codeField')), '12a3');
    await tester.pump();
    expect(typed(tester), '123');
    expect(find.text('1'), findsOneWidget);
    expect(find.text('3'), findsOneWidget);

    await tester.tap(find.byKey(const Key('connectWithCode')));
    await tester.pump();
    expect(find.text('Enter all 6 digits shown on the board'), findsOneWidget);
    expect(api.calls, isEmpty);
  });

  testWidgets('shows the server error in plain language for a wrong code', (tester) async {
    await pumpConnect(tester);
    await tester.enterText(find.byKey(const Key('codeField')), '111111');
    await tester.pumpAndSettle();
    expect(api.calls, ['claim 111111']);
    expect(find.byKey(const Key('codeError')), findsOneWidget);
    expect(find.textContaining('invalid or has expired'), findsOneWidget);
    // The boxes clear so the new code can be typed straight away.
    expect(typed(tester), '');

    await tester.enterText(find.byKey(const Key('codeField')), '482913');
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('youreConnected')), findsOneWidget);
  });

  testWidgets('a right code connects and shows the class; End class ends the session', (tester) async {
    await pumpConnect(tester);
    await tester.enterText(find.byKey(const Key('codeField')), '482913');
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('youreConnected')), findsOneWidget);
    expect(find.text('BCom Sem 3 A'), findsOneWidget);
    expect(find.text('Corporate Accounting'), findsOneWidget);
    expect(find.text('10:00 AM – 10:55 AM'), findsOneWidget);

    await tester.tap(find.byKey(const Key('endClass')));
    await tester.pumpAndSettle();
    expect(api.calls.last, 'end sess1');
  });
}
