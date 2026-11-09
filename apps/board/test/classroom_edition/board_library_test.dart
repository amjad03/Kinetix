import 'dart:io';

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/classroom_edition/boards/board_library.dart';
import 'package:kinetix_board/classroom_edition/boards/board_library_ui.dart';
import 'package:kinetix_board/classroom_edition/edition.dart';
import 'package:kinetix_board/features/board/board_autosave.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import '../support/board_fonts.dart';
import 'ce_support.dart';

SavedBoard _board(int strokes) => SavedBoard(
  background: BoardBackground.plain,
  canvas: const Size(1920, 1080),
  pages: [
    [
      for (var i = 0; i < strokes; i++)
        TextElement(id: 't$i', position: Offset(10.0 * i, 10), text: 'Line $i', color: const Color(0xFF000000), fontSize: 20, size: const Size(80, 24)),
    ],
  ],
);

/// Save and Open in a local class: the teacher's boards for each class kept on this board (a
/// grid with thumbnails, Recent, search, delete after asking), nothing shared, and an
/// autosave per teacher and class.
void main() {
  setUpAll(loadBoardFonts);
  tearDown(() => Edition.classroom = Edition.built == 'classroom');

  late Directory dir;
  var clock = ceMonday;
  setUp(() {
    dir = Directory.systemTemp.createTempSync('ce-boards');
    clock = ceMonday;
    LocalBoardLibrary.instance = LocalBoardLibrary(root: () async => dir, now: () => clock);
  });
  tearDown(() => dir.deleteSync(recursive: true));

  test('boards are kept per teacher and class, newest first; Recent follows what was opened', () async {
    final lib = LocalBoardLibrary.instance;
    final a = await lib.save(_board(2), title: 'Coulomb’s law', teacherId: 'lr', classId: 'c1a', className: '1st PUC A', subject: 'Physics');
    clock = clock.add(const Duration(hours: 1));
    final b = await lib.save(_board(1), title: 'Current electricity', teacherId: 'lr', classId: 'c2b', className: '2nd PUC B', subject: 'Physics');
    clock = clock.add(const Duration(hours: 1));
    await lib.save(_board(1), title: 'Moles', teacherId: 'mi', classId: 'c1a', className: '1st PUC A', subject: 'Chemistry');
    expect(File('${dir.path}/lr/c1a/${a.id}.board.json').existsSync(), isTrue);

    expect([for (final e in await lib.list(teacherId: 'lr')) e.title], ['Current electricity', 'Coulomb’s law']);
    expect([for (final e in await lib.list(teacherId: 'lr', classId: 'c1a')) e.title], ['Coulomb’s law']);
    expect((await lib.list()).length, 3);

    clock = clock.add(const Duration(hours: 1));
    final opened = await lib.open(a.id);
    expect(opened!.pages.single, hasLength(2));
    expect([for (final e in await lib.recent(teacherId: 'lr')) e.id], [a.id, b.id]);

    // Save over a board keeps its id; a new save makes another.
    final again = await lib.save(_board(3), title: 'Coulomb’s law (2)', teacherId: 'lr', classId: 'c1a', id: a.id);
    expect(again.id, a.id);
    expect(again.className, '1st PUC A', reason: 'kept from before');
    expect((await lib.open(a.id))!.pages.single, hasLength(3));
    expect((await lib.list(teacherId: 'lr')).length, 2);

    await lib.rename(b.id, 'Ohm’s law');
    expect((await lib.entry(b.id))!.title, 'Ohm’s law');
    await lib.delete(b.id);
    expect(await lib.entry(b.id), isNull);
    expect(Directory('${dir.path}/lr/c2b').listSync(), isEmpty);

    // A damaged entry is skipped, not lost.
    File('${dir.path}/lr/c1a/broken.meta.json').writeAsStringSync('{"id":');
    expect((await lib.list(teacherId: 'lr')).length, 1);
    expect(File('${dir.path}/lr/c1a/broken.meta.json').existsSync(), isTrue);
    expect(ceDefaultBoardTitle(className: '1st PUC A', subject: 'Physics', at: ceMonday), '1st PUC A · Physics · 9 Nov 2026');
  });

  Future<void> io(WidgetTester tester) async {
    for (var i = 0; i < 25; i++) {
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
      await tester.pump();
    }
    await settle(tester, 3);
  }

  Future<void> stroke(WidgetTester tester, Offset from) async {
    final g = await tester.startGesture(from, pointer: 7, kind: PointerDeviceKind.touch);
    for (var i = 0; i < 6; i++) {
      await g.moveBy(const Offset(30, 12));
    }
    await g.up();
    await tester.pump();
  }

  Future<void> menu(WidgetTester tester, String key) async {
    await tapKey(tester, 'board-menu');
    await tester.ensureVisible(find.byKey(Key(key)));
    await settle(tester);
    await tapKey(tester, key);
  }

  testWidgets('a local class saves on this board (class, subject and date as the name), opens from the grid, never shares', (tester) async {
    final autosave = MemoryAutosaveStore();
    BoardAutosave.defaultStore = autosave;
    final board = (await tester.runAsync(() => classroomBoard(seed: sampleCollege())))!;
    await pumpApp(tester, board);
    await tapKey(tester, 'ce-start-class');
    await settle(tester, 15);
    expect(board.localClass, isTrue);
    await stroke(tester, const Offset(700, 450));
    await tester.pump(const Duration(seconds: 3));
    expect(autosave.slots.keys, ['ce-lr-c1a'], reason: 'Lakshmi’s board for 1st PUC A has its own autosave');
    expect(autosave.slots['ce-lr-c1a']!.data, isNotNull);
    expect(autosave.data, isNull, reason: 'not the board-wide slot');

    await tapKey(tester, 'board-menu');
    expect(find.byKey(const Key('menu-share')), findsNothing, reason: 'nothing to share with in a local class');
    expect(find.byKey(const Key('menu-versions')), findsNothing);
    expect(find.byKey(const Key('quick-share')), findsNothing);
    await tester.tapAt(const Offset(1500, 300));
    await settle(tester);

    await menu(tester, 'save-board');
    expect(find.byKey(const Key('ce-save-dialog')), findsOneWidget);
    expect(find.text('1st PUC A · Physics · 9 Nov 2026'), findsOneWidget);
    expect(find.text('Share with the class'), findsNothing);
    await tester.enterText(find.byKey(const Key('ce-save-title')), 'Coulomb’s law');
    await tapKey(tester, 'ce-save-ok');
    await io(tester);
    final saved = (await tester.runAsync(() => LocalBoardLibrary.instance.list()))!;
    expect([for (final e in saved) (e.title, e.teacherId, e.classId, e.subject)], [('Coulomb’s law', 'lr', 'c1a', 'Physics')]);
    expect(File('${dir.path}/lr/c1a/${saved.single.id}.png').existsSync(), isTrue, reason: 'a thumbnail');

    // Save again: over the same board, or as a new one.
    await menu(tester, 'save-board');
    expect(find.byKey(const Key('ce-save-new')), findsOneWidget);
    await tapKey(tester, 'ce-save-new');
    await io(tester);
    expect((await tester.runAsync(() => LocalBoardLibrary.instance.list()))!, hasLength(2));

    // Open: the grid with Recent, search, and delete after asking.
    await menu(tester, 'menu-open');
    await io(tester);
    expect(find.byKey(const Key('ce-library')), findsOneWidget);
    expect(find.text('Recent'), findsOneWidget);
    expect(find.byKey(Key('ce-board-${saved.single.id}')), findsOneWidget);
    await tester.enterText(find.byKey(const Key('ce-library-search')), 'ohm');
    await settle(tester);
    expect(find.byKey(const Key('ce-library-empty')), findsOneWidget);
    await tester.enterText(find.byKey(const Key('ce-library-search')), 'coulomb');
    await settle(tester);
    expect(find.text('Recent'), findsNothing);
    await tapKey(tester, 'ce-board-delete-${saved.single.id}');
    expect(find.text('Delete “Coulomb’s law”?'), findsOneWidget);
    await tapKey(tester, 'ce-confirm-ok');
    await io(tester);
    expect((await tester.runAsync(() => LocalBoardLibrary.instance.list()))!, hasLength(1));

    // The other one opens over what is on the board, after asking.
    final left = (await tester.runAsync(() => LocalBoardLibrary.instance.list()))!.single;
    await tester.enterText(find.byKey(const Key('ce-library-search')), '');
    await settle(tester);
    await tester.tap(find.byKey(Key('ce-recent-${left.id}')));
    await settle(tester);
    expect(find.byKey(const Key('replace-board')), findsOneWidget);
    await tapKey(tester, 'replace-board-open');
    await io(tester);
    expect(find.textContaining('Coulomb’s law'), findsWidgets);
    expect((await tester.runAsync(() => LocalBoardLibrary.instance.entry(left.id)))!.openedAt, isNotNull);
    await closeBoard(tester, board);
  });
}
