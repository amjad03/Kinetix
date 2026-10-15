import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:zynetix_teacher/app.dart';
import 'package:zynetix_teacher/core/app_state.dart';
import 'package:zynetix_teacher/core/secure_store.dart';
import 'package:zynetix_teacher/demo/demo.dart';
import 'package:zynetix_teacher/demo/demo_api.dart';

import 'zz_rec.dart';

void main() {
  testWidgets('explore teacher', (t) async {
    Demo.enabled = true;
    await loadAllFonts();
    phoneView(t);
    final r = Rec(t, id: 'tx', title: 'x');
    SharedPreferences.setMockInitialValues({});
    final api = DemoTeacherApi();
    final state = AppState(api, await SharedPreferences.getInstance(), realtime: DemoRealtime(api), secure: MemorySecureStore());
    await t.pumpWidget(r.wrap(TeacherApp(state: state)));
    await state.restore();
    await t.pumpAndSettle();
    await dumpScreen(t, r, '00_signin');
    await t.tap(find.byKey(const Key('demoSignIn0')));
    await t.pumpAndSettle();
    await dumpScreen(t, r, '01_home');
    await t.drag(find.byType(Scrollable).first, const Offset(0, -500));
    await t.pumpAndSettle();
    await dumpScreen(t, r, '02_home_down');
    await t.tap(find.byKey(const Key('navClasses')));
    await t.pumpAndSettle();
    await dumpScreen(t, r, '03_classes');
    await t.tap(find.byKey(const Key('navStudents')));
    await t.pumpAndSettle();
    await dumpScreen(t, r, '04_students');
    await t.tap(find.byKey(const Key('navMore')));
    await t.pumpAndSettle();
    await dumpScreen(t, r, '05_more');
    await t.drag(find.byType(Scrollable).first, const Offset(0, -600));
    await t.pumpAndSettle();
    await dumpScreen(t, r, '06_more_down');
    await t.drag(find.byType(Scrollable).first, const Offset(0, -600));
    await t.pumpAndSettle();
    await dumpScreen(t, r, '07_more_down2');
    await t.pump(const Duration(seconds: 10));
    await t.pumpAndSettle();
    Demo.enabled = false;
  });
}
