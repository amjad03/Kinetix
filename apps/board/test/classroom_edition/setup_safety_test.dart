import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/classroom_edition/edition.dart';
import 'package:kinetix_board/classroom_edition/local/classroom_store.dart';
import 'package:kinetix_board/core/device_store.dart';
import 'package:kinetix_board/core/secret_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../support/board_fonts.dart';
import 'ce_support.dart';

/// A damaged college set-up is never silently replaced: the text is kept, the copy from before
/// the last change comes back, and the start screen asks what to do.
void main() {
  setUpAll(loadBoardFonts);
  tearDown(() => Edition.classroom = Edition.built == 'classroom');

  ClassroomStore fresh() => ClassroomStore(store: DeviceStore(secrets: MemorySecretStore()), now: () => ceMonday);
  const setupKey = 'setting.${ClassroomStore.setupKey}';
  const prevKey = 'setting.${ClassroomStore.prevKey}';

  test('each save keeps the copy before it', () async {
    SharedPreferences.setMockInitialValues({});
    final a = fresh();
    await a.load();
    await a.replace(sampleCollege());
    final p = await SharedPreferences.getInstance();
    expect(p.getString(prevKey), isNull, reason: 'nothing was saved before the first save');
    await a.addTeacher('Anil Kumar');
    expect(ClassroomStore.parseSetup(p.getString(prevKey))!.teachers, hasLength(6));
    expect(ClassroomStore.parseSetup(p.getString(setupKey))!.teachers, hasLength(7));
    expect(a.problem, isNull);
  });

  test('a damaged set-up is kept as it was and the copy before the last change comes back', () async {
    SharedPreferences.setMockInitialValues({});
    final a = fresh();
    await a.load();
    await a.replace(sampleCollege());
    await a.addTeacher('Anil Kumar');
    final p = await SharedPreferences.getInstance();
    const damaged = '{"v":1,"college":"Soundarya PU College","teachers":[{"id":"lr","na';
    await p.setString(setupKey, damaged);

    final b = fresh();
    await b.load();
    expect(b.problem, isNotNull);
    expect(b.problem!.usedPrevious, isTrue);
    expect(b.teachers, hasLength(6), reason: 'the copy from before the last change');
    expect(b.college, 'Soundarya PU College');
    expect(p.getString('setting.${b.problem!.badKey}'), damaged, reason: 'the damaged text is kept as it was');
    expect(b.problem!.badKey, startsWith(ClassroomStore.badPrefix));
    expect(await b.badCopies(), [b.problem!.badKey]);
    // Nothing is written until the college decides.
    expect(p.getString(setupKey), damaged);
    await b.acceptRecovered();
    expect(b.problem, isNull);
    expect(ClassroomStore.parseSetup(p.getString(setupKey))!.teachers, hasLength(6));
  });

  test('with no good copy the starter classes show, and the damaged text is still kept', () async {
    SharedPreferences.setMockInitialValues({setupKey: 'not json at all'});
    final a = fresh();
    await a.load();
    expect(a.problem!.usedPrevious, isFalse);
    expect(a.classes, hasLength(5));
    final p = await SharedPreferences.getInstance();
    expect(p.getString('setting.${a.problem!.badKey}'), 'not json at all');
    // Valid JSON that is not a set-up counts as damaged too.
    SharedPreferences.setMockInitialValues({setupKey: '[1,2,3]'});
    final b = fresh();
    await b.load();
    expect(b.problem, isNotNull);
  });

  testWidgets('the start screen asks what to do, and Keep this copy saves it', (tester) async {
    final board = (await tester.runAsync(() async {
      final b = await classroomBoard(seed: sampleCollege());
      await b.classroom.addTeacher('Anil Kumar');
      final p = await SharedPreferences.getInstance();
      await p.setString(setupKey, '{"broken');
      await b.classroom.load();
      return b;
    }))!;
    await pumpApp(tester, board);
    expect(find.byKey(const Key('ce-setup-problem')), findsOneWidget);
    expect(find.textContaining('copy saved just before the last change'), findsOneWidget);
    await tapKey(tester, 'ce-setup-keep');
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
    await settle(tester);
    expect(find.byKey(const Key('ce-setup-problem')), findsNothing);
    final p = (await tester.runAsync(SharedPreferences.getInstance))!;
    expect(ClassroomStore.parseSetup(p.getString(setupKey)), isNotNull);
    await closeBoard(tester, board);
  });
}
