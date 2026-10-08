import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_teacher/app.dart';
import 'package:kinetix_teacher/core/app_state.dart';
import 'package:kinetix_teacher/core/models.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fake_api.dart';

void main() {
  Future<FakeTeacherApi> pumpSignedIn(WidgetTester tester, void Function(FakeTeacherApi) setup) async {
    tester.view.physicalSize = const Size(412, 892);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    SharedPreferences.setMockInitialValues({'token': 'tok'});
    final api = FakeTeacherApi();
    setup(api);
    final state = AppState(api, await SharedPreferences.getInstance());
    await tester.pumpWidget(TeacherApp(state: state));
    await state.restore();
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('navClasses')));
    await tester.pumpAndSettle();
    return api;
  }

  testWidgets("on a Sunday it shows Monday's classes", (tester) async {
    await pumpSignedIn(tester, (api) {
      api.today = '2026-10-04';
      api.periodsByDate = {
        '2026-10-05': [api.period()],
      };
    });
    expect(find.text('No classes today'), findsOneWidget);
    expect(find.text("Monday's classes"), findsOneWidget);
    expect(find.text('Corporate Accounting'), findsOneWidget);
    // Monday is in the future, so attendance is not open yet.
    expect(find.byKey(const Key('takeAttendance-slot1')), findsNothing);
    expect(find.byKey(const Key('attendanceNotOpen')), findsOneWidget);
  });

  testWidgets('highlights the current period and shows the board connection', (tester) async {
    await pumpSignedIn(tester, (api) {
      api.today = '2026-10-05';
      api.periodsByDate = {
        '2026-10-05': [api.period(isNow: true)],
      };
      api.active = BoardConnection(
        sessionId: 's',
        boardName: 'Room 204 Board',
        sectionName: 'BCom Sem 3 A',
        subjectName: 'Corporate Accounting',
      );
    });
    expect(find.text("Today's classes"), findsOneWidget);
    expect(find.byKey(const Key('nowPill')), findsOneWidget);
    expect(find.byKey(const Key('takeAttendance-slot1')), findsOneWidget);
    expect(find.text('Connected'), findsOneWidget);
    expect(find.text('Room 204 Board'), findsOneWidget);
    expect(find.byKey(const Key('endClassCard')), findsOneWidget);
  });
}
