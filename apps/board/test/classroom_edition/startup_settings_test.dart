// Settings → This board → When the board starts: "Open Zynetix when the board starts" without
// device owner, the "Display over other apps" step Android 10+ needs, and the home-app helper.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/classroom_edition/settings/startup_settings.dart';

void main() {
  Future<void> pump(WidgetTester tester, BoardStartup s) async {
    tester.view
      ..physicalSize = const Size(1920, 1080)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: Padding(padding: const EdgeInsets.all(24), child: StartupSection(startup: s)))));
    await tester.pumpAndSettle();
  }

  testWidgets('Android 10+: turning it on asks for "Display over other apps"', (tester) async {
    final s = FakeBoardStartup();
    await pump(tester, s);
    expect(tester.widget<SwitchListTile>(find.byKey(const Key('ce-open-on-boot'))).value, isFalse);
    await tester.tap(find.byKey(const Key('ce-open-on-boot')));
    await tester.pumpAndSettle();
    expect(s.calls, ['openOnBoot:true']);
    expect(find.byKey(const Key('ce-boot-overlay')), findsOneWidget);
    await tester.tap(find.byKey(const Key('ce-boot-overlay-open')));
    await tester.pumpAndSettle();
    expect(s.calls.last, 'overlay');
    // Still not allowed when the teacher comes back: the line says what is missing.
    expect(find.byKey(const Key('ce-boot-needs-overlay')), findsOneWidget);
    expect(tester.widget<SwitchListTile>(find.byKey(const Key('ce-open-on-boot'))).value, isTrue);
  });

  testWidgets('Android 9, or allowed already: no extra step', (tester) async {
    final s = FakeBoardStartup(const StartupStatus());
    await pump(tester, s);
    await tester.tap(find.byKey(const Key('ce-open-on-boot')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('ce-boot-overlay')), findsNothing);
    expect(find.byKey(const Key('ce-boot-needs-overlay')), findsNothing);
  });

  testWidgets('Make Zynetix the home app opens the system home settings; it can be undone', (tester) async {
    final s = FakeBoardStartup(const StartupStatus(needsOverlay: true, homeEntry: true, isHome: true));
    await pump(tester, s);
    expect(find.textContaining('is this board’s home app'), findsOneWidget);
    await tester.tap(find.byKey(const Key('ce-make-home')));
    await tester.pumpAndSettle();
    expect(s.calls, ['home:true']);
    await tester.tap(find.byKey(const Key('ce-unmake-home')));
    await tester.pumpAndSettle();
    expect(s.calls.last, 'home:false');
  });

  testWidgets('not an Android board: says so', (tester) async {
    await pump(tester, FakeBoardStartup(null));
    expect(find.text('Only on Android boards.'), findsOneWidget);
  });

  test('the boot receiver opens the board for either switch; the Classroom manifest asks for the overlay permission', () {
    final receiver = File('android/app/src/main/kotlin/app/kinetix/board/BootReceiver.kt').readAsStringSync();
    expect(receiver, contains('BoardStartup.openOnBoot(context)'));
    expect(receiver, contains('Kiosk.bootLaunch(context)'));
    final main = File('android/app/src/main/AndroidManifest.xml').readAsStringSync();
    expect(main, contains('android.intent.action.BOOT_COMPLETED'));
    expect(main, contains('android.permission.RECEIVE_BOOT_COMPLETED'));
    final classroom = File('android/app/src/classroom/AndroidManifest.xml').readAsStringSync();
    expect(classroom, contains('android.permission.SYSTEM_ALERT_WINDOW'));
    expect(main, isNot(contains('SYSTEM_ALERT_WINDOW')), reason: 'the KINETIX Board does not ask for it');
  });
}
