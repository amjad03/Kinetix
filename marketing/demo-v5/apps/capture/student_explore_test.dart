import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:zynetix_lesson/zynetix_lesson.dart';
import 'package:zynetix_student/app.dart';
import 'package:zynetix_student/core/app_state.dart';
import 'package:zynetix_student/core/token_store.dart';
import 'package:zynetix_student/demo/demo.dart';
import 'package:zynetix_student/demo/demo_api.dart';

import 'zz_rec.dart';

void main() {
  testWidgets('explore student', (t) async {
    Demo.enabled = true;
    await loadAllFonts();
    phoneView(t);
    LessonAudio.debugFactory = (_, _, length) async => SilentLessonAudio(length, audible: true);
    final r = Rec(t, id: 'sx', title: 'x');
    SharedPreferences.setMockInitialValues({});
    r.startAt(11, 20);
    final api = DemoStudentApi(clock: r.now);
    final state = AppState(api, await SharedPreferences.getInstance(), tokens: MemoryTokenStore(), live: DemoLiveConnection.connector(api, delay: const Duration(hours: 2)));
    await t.pumpWidget(r.wrap(StudentApp(state: state)));
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
    final bar = find.byWidgetPredicate((w) => w is NavigationBar);
    Future<void> tab(String name) async { for (var i = 0; i < 4 && bar.hitTestable().evaluate().isEmpty; i++) { await back(); } await t.tap(find.descendant(of: bar, matching: find.text(name))); await t.pumpAndSettle(); }
//STEPS
    LessonAudio.debugFactory = null;
    Demo.enabled = false;
  });
}
