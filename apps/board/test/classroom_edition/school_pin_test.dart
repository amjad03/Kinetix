import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/classroom_edition/edition.dart';
import 'package:kinetix_board/classroom_edition/local/classroom_store.dart';
import 'package:kinetix_board/core/device_store.dart';
import 'package:kinetix_board/core/secret_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../support/board_fonts.dart';
import 'ce_support.dart';

/// The school PIN: PBKDF2 (old SHA-256 hashes migrate), a forced change from 1234, the number
/// pad, 5 tries then a growing lockout, and a recovery code shown once.
void main() {
  setUpAll(() async {
    await loadBoardFonts();
    SchoolPin.iterations = 1000;
  });
  tearDown(() => Edition.classroom = Edition.built == 'classroom');

  var clock = ceMonday;
  ClassroomStore fresh() => ClassroomStore(store: DeviceStore(secrets: MemorySecretStore()), now: () => clock);
  const pinKey = 'setting.${ClassroomStore.pinKey}';

  setUp(() => clock = ceMonday);

  test('PBKDF2 hashes: salted, never the PIN, checked back', () async {
    final a = await SchoolPin.hash('2580');
    final b = await SchoolPin.hash('2580');
    expect(a, isNot(b), reason: 'a new salt every time');
    final j = jsonDecode(a) as Map;
    expect(j['algo'], 'pbkdf2-sha256');
    expect(j['iterations'], 1000);
    expect(a, isNot(contains('2580')));
    expect(await SchoolPin.verify('2580', a), isTrue);
    expect(await SchoolPin.verify('2581', a), isFalse);
    expect(await SchoolPin.verify('2580', 'rubbish'), isFalse);
    expect(SchoolPin.lockoutFor(1), const Duration(minutes: 1));
    expect(SchoolPin.lockoutFor(3), const Duration(minutes: 4));
    expect(SchoolPin.lockoutFor(20), const Duration(hours: 1));
  });

  test('a release 1.0.0 SHA-256 PIN still opens and is moved to PBKDF2', () async {
    SharedPreferences.setMockInitialValues({pinKey: SchoolPin.legacyHashOf('4321')});
    final s = fresh();
    await s.load();
    expect(s.pinIsDefault, isFalse);
    expect((await s.verifyPin('1234')).ok, isFalse);
    expect((await s.verifyPin('4321')).ok, isTrue);
    final p = await SharedPreferences.getInstance();
    final stored = p.getString(pinKey)!;
    expect(SchoolPin.isLegacy(stored), isFalse);
    expect((jsonDecode(stored) as Map)['algo'], 'pbkdf2-sha256');
    final again = fresh();
    await again.load();
    expect((await again.verifyPin('4321')).ok, isTrue);
  });

  test('5 wrong PINs lock for a minute, each one after that for twice as long; the lock survives a restart', () async {
    SharedPreferences.setMockInitialValues({});
    final s = fresh();
    await s.load();
    await s.setPin('2580');
    for (var i = 4; i >= 1; i--) {
      final r = await s.verifyPin('0000');
      expect((r.check, r.attemptsLeft), (PinCheck.wrong, i));
    }
    final fifth = await s.verifyPin('0000');
    expect(fifth.check, PinCheck.lockedOut);
    expect(fifth.lockedUntil, ceMonday.add(const Duration(minutes: 1)));
    expect((await s.verifyPin('2580')).check, PinCheck.lockedOut, reason: 'not even the right PIN while locked');

    final restarted = fresh();
    await restarted.load();
    expect(restarted.pinLocked, isTrue);
    clock = ceMonday.add(const Duration(seconds: 61));
    expect(restarted.pinLocked, isFalse);
    final again = await restarted.verifyPin('1111');
    expect(again.check, PinCheck.lockedOut, reason: 'one more wrong PIN locks again');
    expect(again.lockedUntil, clock.add(const Duration(minutes: 2)));
    clock = clock.add(const Duration(minutes: 3));
    expect((await restarted.verifyPin('2580')).ok, isTrue);
    expect((restarted.pinFailures, restarted.pinLockouts, restarted.pinLockedUntil), (0, 0, null));
    expect((await restarted.verifyPin('0000')).attemptsLeft, 4, reason: 'the right PIN starts the count again');
  });

  test('the recovery code is made with the PIN, kept only as a hash, and opens a new PIN', () async {
    SharedPreferences.setMockInitialValues({});
    final s = fresh();
    await s.load();
    expect(s.hasRecoveryCode, isFalse);
    final code = await s.setPin('2580');
    expect(code, matches(RegExp(r'^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$')));
    expect(s.hasRecoveryCode, isTrue);
    final p = await SharedPreferences.getInstance();
    for (final k in p.getKeys()) {
      expect('${p.get(k)}', isNot(contains(code.replaceAll('-', ''))), reason: k);
    }
    expect((await s.verifyRecoveryCode('AAAA-AAAA-AAAA')).check, PinCheck.wrong);
    expect((await s.verifyRecoveryCode(' ${code.toLowerCase().replaceAll('-', ' ')} ')).ok, isTrue);
    final next = await s.setPin('9753');
    expect(next, isNot(code));
    expect((await s.verifyRecoveryCode(code)).ok, isFalse, reason: 'a new PIN makes a new code');
  });

  testWidgets('first set-up: 1234 opens only the forced change, which refuses weak PINs and shows the recovery code once', (tester) async {
    final board = (await tester.runAsync(() => classroomBoard(seed: sampleCollege())))!;
    await pumpApp(tester, board);
    await tapKey(tester, 'ce-settings');
    expect(find.byKey(const Key('ce-pin-pad')), findsOneWidget);
    expect(find.byKey(const Key('ce-pin-forgot')), findsNothing, reason: 'no recovery code yet');
    await typePin(tester, '12');
    expect(find.text('Type 4 to 8 digits.'), findsOneWidget);
    await tapKey(tester, 'ce-pin-back');
    await tapKey(tester, 'ce-pin-back');
    await typePin(tester, '1234');
    expect(find.text('Choose the college’s own PIN'), findsOneWidget);
    for (final (weak, why) in const [('1234', 'other than 1234'), ('7777', 'one digit repeated'), ('3456', 'run of digits')]) {
      await typePin(tester, weak);
      expect(find.textContaining(why), findsOneWidget, reason: weak);
    }
    await typePin(tester, '2580');
    expect(find.text('Type the new PIN again'), findsOneWidget);
    await typePin(tester, '2581');
    expect(find.textContaining('were not the same'), findsOneWidget);
    await typePin(tester, '2580');
    await typePin(tester, '2580');
    expect(find.byKey(const Key('ce-recovery-dialog')), findsOneWidget);
    expect(find.byKey(const Key('ce-recovery-print')), findsOneWidget);
    expect(find.byKey(const Key('ce-recovery-save')), findsOneWidget);
    final code = tester.widget<SelectableText>(find.byKey(const Key('ce-recovery-code'))).data!;
    await tapKey(tester, 'ce-recovery-done');
    expect(find.byKey(const Key('ce-settings-page')), findsOneWidget);
    expect(board.classroom.pinIsDefault, isFalse);
    expect((await tester.runAsync(() => board.classroom.verifyRecoveryCode(code)))!.ok, isTrue);
    await closeBoard(tester, board);
  });

  testWidgets('the pad locks after 5 wrong PINs; Forgot the PIN? takes the recovery code', (tester) async {
    final board = (await tester.runAsync(() => classroomBoard(seed: sampleCollege())))!;
    final code = (await tester.runAsync(() => board.classroom.setPin('2580')))!;
    await pumpApp(tester, board);
    await tapKey(tester, 'ce-settings');
    for (var i = 0; i < 5; i++) {
      await typePin(tester, '0000');
    }
    expect(find.textContaining('Too many wrong PINs. Try again in'), findsOneWidget);
    await typePin(tester, '2580');
    expect(find.byKey(const Key('ce-settings-page')), findsNothing, reason: 'locked: the keys do nothing');
    await tapKey(tester, 'ce-pin-cancel');

    // The recovery code is refused while locked too, so the lock is lifted first.
    board.classroom.pinLockedUntil = null;
    board.classroom.pinLockouts = 0;
    await tapKey(tester, 'ce-settings');
    await tapKey(tester, 'ce-pin-forgot');
    await tester.enterText(find.byKey(const Key('ce-forgot-code')), code.toLowerCase());
    await tapKey(tester, 'ce-forgot-ok');
    await typePin(tester, '9630');
    await typePin(tester, '9630');
    await tapKey(tester, 'ce-recovery-done');
    expect(find.byKey(const Key('ce-settings-page')), findsOneWidget);
    expect((await tester.runAsync(() => board.classroom.verifyPin('9630')))!.ok, isTrue);
    await closeBoard(tester, board);
  });
}
