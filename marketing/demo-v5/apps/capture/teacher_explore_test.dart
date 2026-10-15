import 'dart:io';
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
    r.startAt(11, 20);
    final api = DemoTeacherApi(clock: r.now);
    final state = AppState(api, await SharedPreferences.getInstance(), realtime: DemoRealtime(api), secure: MemorySecureStore());
    await t.pumpWidget(r.wrap(TeacherApp(state: state)));
    await state.restore();
    await t.pumpAndSettle();
    await dumpScreen(t, r, '00_signin');
    await t.tap(find.byKey(const Key('demoSignIn0')));
    await t.pumpAndSettle();
    Future<void> tapK(String k) async { await t.tap(find.byKey(Key(k)).hitTestable().first); await t.pumpAndSettle(); }
    Future<void> tapT(String k) async { await t.tap(find.text(k).hitTestable().first); await t.pumpAndSettle(); }
    Future<void> down([double d = 500]) async { await t.drag(find.byType(Scrollable).hitTestable().first, Offset(0, -d)); await t.pumpAndSettle(); }
    Future<void> back() async { await t.binding.handlePopRoute(); await t.pumpAndSettle(); }
    Future<void> step(String n, Future<void> Function() f) async {
      try { await f(); } catch (e) { File('${r.preview}/errors.txt').writeAsStringSync('$n: $e\n', mode: FileMode.append); }
      await dumpScreen(t, r, n);
    }
//STEPS
    Demo.enabled = false;
  });
}
