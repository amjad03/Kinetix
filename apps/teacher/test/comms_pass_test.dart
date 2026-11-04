import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:zynetix_teacher/app.dart';
import 'package:zynetix_teacher/core/app_state.dart';

import 'fake_api.dart';
import 'helpers.dart';

/// Communication pass in the Teacher App: do-not-disturb for family chat, and a notice's poll.
void main() {
  late FakeTeacherApi api;
  final en = strings('en');

  setUp(() => api = FakeTeacherApi());

  Future<void> pumpApp(WidgetTester tester) async {
    phone(tester);
    SharedPreferences.setMockInitialValues({'token': 'tok'});
    final state = AppState(api, await SharedPreferences.getInstance());
    await tester.pumpWidget(TeacherApp(state: state));
    await state.restore();
    await tester.pumpAndSettle();
  }

  testWidgets('turns do-not-disturb on until tomorrow morning and off again', (tester) async {
    await pumpApp(tester);
    await openMore(tester, 'navMessages');
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('dndButton')));
    await tester.pumpAndSettle();
    expect(find.text(en.dndHelp), findsOneWidget);
    await tester.enterText(find.byType(TextField).last, 'On exam duty');
    await tester.tap(find.byKey(const Key('dndTomorrow')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('setAvailability true On exam duty'));
    expect(api.dnd.dndUntil?.hour, 8);
    await tester.tap(find.byKey(const Key('dndButton')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('dndOff')), findsOneWidget);
    await tester.tap(find.byKey(const Key('dndOff')));
    await tester.pumpAndSettle();
    expect(api.dnd.dndUntil, isNull);
    expect(find.text(en.dndOffDone), findsOneWidget);
  });

  testWidgets('answers the poll on a notice', (tester) async {
    await pumpApp(tester);
    await openMore(tester, 'navMessages');
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('openAnnouncements')));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.byKey(const Key('announcement-an-poll')), 200, scrollable: find.byType(Scrollable).last);
    await tester.tap(find.byKey(const Key('announcement-an-poll')));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.byKey(const Key('pollOption-2')), 200, scrollable: find.byType(Scrollable).last);
    await tester.tap(find.byKey(const Key('pollOption-2')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('announcementVote an-poll 2'));
    expect(find.text(en.pollChange), findsOneWidget);
  });
}
