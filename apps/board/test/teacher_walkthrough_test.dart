import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/core/outbox_store.dart';
import 'package:kinetix_board/core/recording/recordings.dart';
import 'package:kinetix_board/demo/demo.dart';
import 'package:kinetix_board/demo/demo_server.dart';
import 'package:kinetix_board/features/board/board_autosave.dart';
import 'package:kinetix_board/features/insert/device_files.dart';
import 'package:kinetix_board/features/insert/document_import.dart';
import 'package:kinetix_board/main.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/recording_fakes.dart';
import 'support/wait.dart';

/// A teacher's school demo on the demo build (no server), driven as they would: pen strokes,
/// taps and drags on the real board, checking what ends up on it after each step.
void main() {
  late MemoryAutosaveStore autosave;

  setUp(() {
    Demo.enabled = true;
    SharedPreferences.setMockInitialValues({});
    autosave = MemoryAutosaveStore();
    BoardAutosave.defaultStore = autosave;
  });
  tearDown(() => Demo.enabled = false);

  Future<BoardController> pump(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1920, 1080);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final store = MemoryRecordingStore();
    final board = demoBoard(DemoBoardServer(claimDelay: const Duration(seconds: 2)), recordings: Recordings(store: store, voice: () => FakeVoiceRecorder(store: store)));
    await tester.pumpWidget(KinetixBoardApp(controller: board));
    await tester.pumpAndSettle();
    // The period's concept videos are offered first (concept_videos_test.dart).
    await tester.tap(find.byKey(const Key('conceptVideoSkip')));
    await tester.pumpAndSettle();
    return board;
  }

  /// The main board (not the second board in the drawer).
  WhiteboardController whiteboard(WidgetTester tester) =>
      tester.widget<WhiteboardCanvas>(find.byWidgetPredicate((w) => w is WhiteboardCanvas && w.key != const Key('second-board'))).controller;

  Future<void> tapKey(WidgetTester tester, String key) async {
    await tester.ensureVisible(find.byKey(Key(key)));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(Key(key)));
    await tester.pumpAndSettle();
  }

  /// Closes an open popover by tapping the board beside it (the barrier takes the tap).
  Future<void> closePopover(WidgetTester tester) async {
    if (find.byKey(const Key('popover-barrier')).evaluate().isEmpty) return;
    await tester.tapAt(const Offset(1300, 150));
    await tester.pumpAndSettle();
  }

  /// A finger stroke from [from], [by] long, in six moves.
  Future<void> stroke(WidgetTester tester, Offset from, {Offset by = const Offset(150, 50), int pointer = 9}) async {
    final g = await tester.startGesture(from, pointer: pointer, kind: PointerDeviceKind.touch);
    for (var i = 1; i <= 6; i++) {
      await g.moveTo(from + by * (i / 6));
    }
    await g.up();
    await tester.pump();
  }

  /// The end of a lesson: the app goes away and the board's timers with it.
  Future<void> finish(WidgetTester tester, BoardController board) async {
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 5));
    board.dispose();
  }

  /// Two fingers tapped together (undo).
  Future<void> twoFingerTap(WidgetTester tester, Duration at) async {
    final gestures = <TestGesture>[];
    for (var i = 0; i < 2; i++) {
      final g = await tester.createGesture(pointer: 40 + i, kind: PointerDeviceKind.touch);
      await g.down(Offset(1100 + i * 60.0, 700), timeStamp: at + Duration(milliseconds: 20 * i));
      gestures.add(g);
    }
    for (final g in gestures) {
      await g.up(timeStamp: at + const Duration(milliseconds: 150));
    }
    await tester.pump();
  }

  testWidgets('first launch with no server: Skip opens the practice board, which writes and says it is the practice board', (tester) async {
    Demo.enabled = false;
    tester.view.physicalSize = const Size(1920, 1080);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final store = MemoryRecordingStore();
    final board = BoardController(outboxStore: MemoryOutboxStore(), recordings: Recordings(store: store, voice: () => FakeVoiceRecorder(store: store)));
    await tester.pumpWidget(KinetixBoardApp(controller: board));
    await tester.runAsync(board.start);
    await tester.pumpAndSettle();
    expect(board.stage, BoardStage.needsEnrollment);
    expect(find.byKey(const Key('enroll-code')), findsOneWidget);
    await tester.tap(find.text('Skip for now and use the practice board'));
    await tester.pumpAndSettle();
    expect(board.stage, BoardStage.board);
    await stroke(tester, const Offset(400, 400));
    expect(whiteboard(tester).elements, hasLength(1));
    // The class bar says it is the practice board; sign-in waits for enrolment.
    final chip = tester.widget<ActionChip>(find.byKey(const Key('sign-in-chip')));
    expect(chip.onPressed, isNull);
    expect(find.descendant(of: find.byKey(const Key('sign-in-chip')), matching: find.text('Practice board')), findsOneWidget);
    await finish(tester, board);
  });

  testWidgets('pen types, colours and sizes; highlighter; the laser points and draws nothing', (tester) async {
    final board = await pump(tester);
    final wb = whiteboard(tester);
    await stroke(tester, const Offset(300, 300));
    expect((wb.elements.single as Stroke).style.tool, InkTool.pen);

    // The Pen again opens its options: a dashed red pen, thick.
    await tapKey(tester, 'tool-pen');
    expect(find.byKey(const Key('pen-popover')), findsOneWidget);
    await tapKey(tester, 'pen-type-dashed');
    await tapKey(tester, 'pen-colour-1');
    final thickness = find.byKey(const Key('pen-thickness'));
    await tester.ensureVisible(thickness);
    await tester.pumpAndSettle();
    await tester.tapAt(tester.getTopRight(thickness) + const Offset(-12, 20));
    await tester.pumpAndSettle();
    await closePopover(tester);
    expect(wb.elements, hasLength(1), reason: 'closing the popover drew nothing');
    await stroke(tester, const Offset(300, 420));
    final red = wb.elements.last as Stroke;
    expect(red.style.nib, PenNib.dashed);
    expect(red.style.color.withValues(alpha: 1), const Color(0xFFD93025));
    expect(red.style.width, greaterThan(18));

    // The highlighter: a wide see-through line.
    await tapKey(tester, 'tool-highlighter');
    await stroke(tester, const Offset(300, 560));
    expect((wb.elements.last as Stroke).style.tool, InkTool.highlighter);

    // The laser (a pen type) points and leaves nothing on the page.
    await tapKey(tester, 'tool-pen');
    if (find.byKey(const Key('pen-popover')).evaluate().isEmpty) await tapKey(tester, 'tool-pen');
    await tapKey(tester, 'pen-type-laser');
    await closePopover(tester);
    expect(wb.tool, BoardTool.laser);
    final count = wb.elements.length;
    await stroke(tester, const Offset(800, 300));
    expect(wb.elements, hasLength(count));
    expect(wb.laser.value, isNotEmpty);
    await finish(tester, board);
  });

  testWidgets('eraser: whole strokes, then just the part under it; undo by button and two fingers, redo', (tester) async {
    final board = await pump(tester);
    final wb = whiteboard(tester);
    await stroke(tester, const Offset(300, 300), by: const Offset(400, 0));
    await stroke(tester, const Offset(300, 500), by: const Offset(400, 0));
    expect(wb.elements, hasLength(2));

    await tapKey(tester, 'tool-erase');
    await stroke(tester, const Offset(500, 270), by: const Offset(0, 60));
    expect(wb.elements, hasLength(1), reason: 'the stroke eraser takes the whole line');
    await tapKey(tester, 'undo');
    expect(wb.elements, hasLength(2));

    // The Eraser again opens its options: Area rubs out only what is under it.
    await tapKey(tester, 'tool-erase');
    await tester.tap(find.byKey(const Key('eraser-mode-area')));
    await tester.pumpAndSettle();
    await closePopover(tester);
    expect(wb.tool, BoardTool.eraser);
    await stroke(tester, const Offset(500, 270), by: const Offset(0, 60));
    expect(wb.elements, hasLength(3), reason: 'the top line cut in two, the bottom one untouched');

    await twoFingerTap(tester, const Duration(seconds: 5));
    expect(wb.elements, hasLength(2), reason: 'two fingers undo');
    await tapKey(tester, 'redo');
    expect(wb.elements, hasLength(3));
    await finish(tester, board);
  });

  testWidgets('select, move and delete; a shape; typed text, a sticky note and an equation', (tester) async {
    final board = await pump(tester);
    final wb = whiteboard(tester);
    await stroke(tester, const Offset(400, 400));
    final before = wb.elements.single.bounds;

    // A tap with Select picks the line; dragging it moves it.
    await tapKey(tester, 'tool-select');
    await tester.tapAt(const Offset(475, 425));
    await tester.pumpAndSettle();
    expect(wb.selection, hasLength(1));
    final g = await tester.startGesture(const Offset(475, 425), kind: PointerDeviceKind.touch);
    for (var i = 0; i < 6; i++) {
      await g.moveBy(const Offset(20, 10));
    }
    await g.up();
    await tester.pumpAndSettle();
    expect(wb.elements.single.bounds.center.dx, closeTo(before.center.dx + 120, 2));
    await tapKey(tester, 'delete-selection');
    expect(wb.elements, isEmpty);
    await tapKey(tester, 'undo');
    expect(wb.elements, hasLength(1));

    // A rectangle from the Shapes menu.
    await tapKey(tester, 'tool-shapes');
    await tapKey(tester, 'shape-rectangle');
    await closePopover(tester);
    await stroke(tester, const Offset(900, 300), by: const Offset(200, 120));
    final rect = wb.elements.last as Stroke;
    expect(rect.shape, ShapeKind.rectangle);

    // Typed text: tap with the text tool, type, then pick another tool.
    await tapKey(tester, 'tool-insert');
    await tapKey(tester, 'insert-text');
    await tester.tapAt(const Offset(400, 700));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).last, 'Photosynthesis');
    await tapKey(tester, 'tool-pen');
    expect(wb.elements.whereType<TextElement>().single.text, 'Photosynthesis');

    // A sticky note.
    await tapKey(tester, 'tool-insert');
    await tapKey(tester, 'insert-note');
    await tester.tapAt(const Offset(1200, 600));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('note-text')), 'Homework: page 42');
    await tapKey(tester, 'note-done');
    expect(wb.elements.whereType<NoteElement>().single.text, 'Homework: page 42');

    // An equation: the editor opens at once and the equation is typeset in view.
    await tapKey(tester, 'tool-insert');
    await tapKey(tester, 'insert-equation');
    await tester.enterText(find.byKey(const Key('math-tex')), r'x^2 + y^2 = r^2');
    await tester.pumpAndSettle();
    await tapKey(tester, 'math-done');
    expect(wb.elements.whereType<MathElement>().single.latex, r'x^2 + y^2 = r^2');
    await finish(tester, board);
  });

  testWidgets('pages: add, switch, reorder and delete always show the right page; paper per page, dark paper turns ink white; zoom', (tester) async {
    final board = await pump(tester);
    final wb = whiteboard(tester);
    expect(find.byKey(const Key('add-page')), findsOneWidget);
    await stroke(tester, const Offset(300, 300));
    final first = wb.elements.single.id;
    await tapKey(tester, 'add-page');
    expect(find.text('2/2'), findsOneWidget);
    expect(wb.elements, isEmpty, reason: 'the new page is blank at once');
    await stroke(tester, const Offset(600, 600));
    final second = wb.elements.single.id;
    await tapKey(tester, 'add-page');
    await stroke(tester, const Offset(900, 300));
    final third = wb.elements.single.id;
    await tapKey(tester, 'previous-page');
    expect(wb.elements.single.id, second);
    await tapKey(tester, 'previous-page');
    expect(wb.elements.single.id, first);

    // Paper for this page only; a dark board draws black ink white.
    await tapKey(tester, 'board-menu');
    await tapKey(tester, 'tool-theme');
    await tapKey(tester, 'bg-chalkboard');
    await closePopover(tester);
    expect(wb.background, BoardBackground.chalkboard);
    await tapKey(tester, 'next-page');
    expect(wb.background.isDark, isFalse);
    await tapKey(tester, 'previous-page');

    // The overview: drag page 1 past page 2, then delete the open page.
    await tapKey(tester, 'page-overview');
    final step = (tester.getCenter(find.byKey(const Key('page-thumb-1'))) - tester.getCenter(find.byKey(const Key('page-thumb-0')))) / 12;
    final g = await tester.startGesture(tester.getCenter(find.byKey(const Key('page-thumb-0'))));
    await tester.pump(const Duration(milliseconds: 700));
    for (var i = 0; i < 12; i++) {
      await g.moveBy(step);
      await tester.pump(const Duration(milliseconds: 16));
    }
    await g.up();
    await tester.pumpAndSettle();
    expect([for (final p in wb.pages) p.elements.single.id], [second, first, third]);
    expect(wb.elements.single.id, first, reason: 'the open page stays open after a reorder');
    await tester.tap(find.byKey(const Key('page-thumb-2')));
    await tester.pumpAndSettle();
    expect(wb.elements.single.id, third);
    await tapKey(tester, 'overview-delete');
    expect(wb.pageCount, 2);
    expect(wb.elements.single.id, first, reason: 'the last page went; the one before it is open');
    await tapKey(tester, 'zoom-in');
    expect(wb.view.value.scale, closeTo(1.25, 0.01));
    await tapKey(tester, 'zoom-reset');
    expect(wb.view.value.scale, closeTo(1, 0.01));
    await tapKey(tester, 'overview-close');
    expect(find.text('2/2'), findsOneWidget);
    await finish(tester, board);
  });

  testWidgets('the drawer: a second board with the same pen; a PDF beside the board, its page added and moved as a picture', (tester) async {
    final files = _Files();
    DeviceFiles.instance = files;
    addTearDown(() {
      DeviceFiles.instance = PlatformFiles();
      PageRenderer.instance = const OnDeviceRenderer();
    });
    final board = await pump(tester);
    final wb = whiteboard(tester);

    // Second board from the tools drawer: it writes with the toolbar's pen and two fingers undo there.
    await tapKey(tester, 'tool-tools');
    await tapKey(tester, 'drawer-second-board');
    final second = find.byKey(const Key('second-board'));
    expect(second, findsOneWidget);
    final secondWb = tester.widget<WhiteboardCanvas>(second).controller;
    final box = tester.getRect(second);
    await stroke(tester, box.center - const Offset(80, 0));
    expect(secondWb.elements, hasLength(1));
    expect(wb.elements, isEmpty, reason: 'the main board is untouched');
    await tapKey(tester, 'panel-close');

    // A PDF opens in the drawer first; Add page puts the page on the (blank) board.
    PageRenderer.instance = _Pages(3);
    files.document = PickedFile('notes.pdf', Uint8List.fromList(utf8.encode('%PDF-1.4')));
    await tapKey(tester, 'tool-insert');
    await tester.tap(find.byKey(const Key('insert-cat-pdf')));
    await waitUntil(tester, () => find.byKey(const Key('presentation')).evaluate().isNotEmpty);
    await tapKey(tester, 'ppt-add-1');
    expect(wb.pageCount, 1, reason: 'the blank page took it; no empty page in front');
    final page = wb.elements.single as ImageElement;
    expect(page.backdrop, isTrue);
    await tapKey(tester, 'ppt-add-all');
    expect(wb.pageCount, 4);
    await tapKey(tester, 'ppt-close');

    // The added page is a picture: tap to select it and drag it.
    wb.goToPage(0);
    await tester.pumpAndSettle();
    await tapKey(tester, 'tool-select');
    final at = tester.getCenter(find.byWidgetPredicate((w) => w is WhiteboardCanvas && w.key != const Key('second-board')));
    await tester.tapAt(at);
    await tester.pumpAndSettle();
    expect(wb.selection, {page.id});
    final g = await tester.startGesture(at, kind: PointerDeviceKind.touch);
    for (var i = 0; i < 5; i++) {
      await g.moveBy(const Offset(20, 0));
    }
    await g.up();
    await tester.pumpAndSettle();
    expect((wb.elements.single as ImageElement).rect.left, closeTo(page.rect.left + 100, 2));
    await finish(tester, board);
  });

  testWidgets('a crash mid-lesson: the demo board comes back as it was', (tester) async {
    final first = await pump(tester);
    await stroke(tester, const Offset(300, 300));
    await tapKey(tester, 'add-page');
    await stroke(tester, const Offset(500, 500));
    await tester.pump(const Duration(seconds: 3));
    await tester.pump();
    expect(autosave.data, isNotNull);
    await finish(tester, first);

    final board = await pump(tester);
    final wb = whiteboard(tester);
    expect(wb.pageCount, 2);
    expect(wb.elementsOf(0), hasLength(1));
    expect(wb.elementsOf(1), hasLength(1));
    await finish(tester, board);
  });
}

/// Files the test hands in as if the teacher had picked them.
class _Files implements DeviceFiles {
  PickedFile? picture, document;

  @override
  bool get hasCamera => false;
  @override
  Future<PickedFile?> pickPicture({bool camera = false}) async => picture;
  @override
  Future<PickedFile?> pickDocument() async => document;
}

/// Draws each page as a plain picture, without PDFium.
class _Pages implements PageRenderer {
  _Pages(this.pages);
  final int pages;

  @override
  Future<List<ImportedPage>> render(Uint8List bytes, DocKind kind, {void Function(int done, int total)? onPage}) async {
    final rec = ui.PictureRecorder();
    ui.Canvas(rec).drawRect(const Rect.fromLTWH(0, 0, 32, 18), Paint()..color = const Color(0xFF1A73E8));
    final img = await rec.endRecording().toImage(32, 18);
    final data = await img.toByteData(format: ui.ImageByteFormat.png);
    img.dispose();
    return [for (var i = 0; i < pages; i++) ImportedPage(data!.buffer.asUint8List(), const Size(1600, 900))];
  }
}
