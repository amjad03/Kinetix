import 'dart:convert';
import 'dart:io';

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zynetix_board/core/board_controller.dart';
import 'package:zynetix_board/features/board/board_autosave.dart';
import 'package:zynetix_board/features/board/board_screen.dart';
import 'package:zynetix_ink/zynetix_ink.dart';
import 'package:zynetix_ui/zynetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Autosave: what is on the board survives a crash, a power cut or the app being closed.
void main() {
  late MemoryAutosaveStore store;

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    store = MemoryAutosaveStore();
    BoardAutosave.defaultStore = store;
  });

  Future<BoardController> pump(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1920, 1080);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final board = BoardController()..skipEnrollment();
    await tester.pumpWidget(MaterialApp(theme: ZynetixTheme.light(), home: BoardScreen(board: board)));
    await tester.pump();
    await tester.pump();
    return board;
  }

  WhiteboardController whiteboard(WidgetTester tester) => tester.widget<WhiteboardCanvas>(find.byType(WhiteboardCanvas).first).controller;

  Future<void> stroke(WidgetTester tester, Offset from) async {
    final g = await tester.startGesture(from, pointer: 7, kind: PointerDeviceKind.touch);
    for (var i = 0; i < 5; i++) {
      await g.moveBy(const Offset(30, 10));
    }
    await g.up();
    await tester.pump();
  }

  testWidgets('the board is kept a moment after each change and comes back on the next start; Start fresh clears it', (tester) async {
    await pump(tester);
    await stroke(tester, const Offset(500, 400));
    expect(store.data, isNull, reason: 'not on every point, a moment after the change');
    await tester.pump(const Duration(seconds: 3));
    await tester.pump();
    final kept = SavedBoard.fromJson(jsonDecode(store.data!) as Map<String, dynamic>);
    expect(kept.pages.single, hasLength(1));

    // A second page with paper of its own is kept too.
    final wb = whiteboard(tester);
    wb.addPage();
    wb.background = BoardBackground.graph;
    await stroke(tester, const Offset(600, 500));
    await tester.pump(const Duration(seconds: 3));
    await tester.pump();

    // The app goes (a crash, the power, the window closed) and starts again.
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
    await pump(tester);
    final again = whiteboard(tester);
    expect(again.pageCount, 2);
    expect(again.elementsOf(0), hasLength(1));
    expect(again.elementsOf(1), hasLength(1));
    expect(again.pages[1].background, BoardBackground.graph);
    // The message slides in.
    await tester.pump(const Duration(milliseconds: 600));
    expect(find.text('Your board from last time is back'), findsOneWidget);

    await tester.tap(find.byKey(const Key('message-action')));
    await tester.pump();
    expect(again.isBlank, isTrue);
    await tester.pump();
    expect(store.data, isNull, reason: 'a blank board clears the kept one at once');
    expect(tester.takeException(), isNull);
  });

  testWidgets('the blank board the app opens on never wipes the kept board before it is read', (tester) async {
    final wb = WhiteboardController()..add(TextElement(id: 't', position: const Offset(100, 100), text: 'Photosynthesis', color: const Color(0xFF000000), fontSize: 32, size: const Size(240, 40)));
    store.data = jsonEncode(wb.toSaved(const Size(1920, 1080)).toJson());
    final board = BoardController()
      ..skipEnrollment()
      ..theme = BoardTheme.dark;
    tester.view.physicalSize = const Size(1920, 1080);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    // The dark theme turns the paper over as the board opens, before the kept board is read.
    await tester.pumpWidget(MaterialApp(theme: ZynetixTheme.light(), home: BoardScreen(board: board)));
    await tester.pump();
    await tester.pump();
    final restored = whiteboard(tester);
    expect(restored.elements.single, isA<TextElement>());
    expect(restored.background.isDark, isTrue, reason: 'shown on this theme\'s paper');
  });

  testWidgets('a board written on before the kept one is read keeps what was written', (tester) async {
    final old = WhiteboardController()..add(TextElement(id: 'o', position: Offset.zero, text: 'old', color: const Color(0xFF000000), fontSize: 20, size: const Size(40, 20)));
    store.data = jsonEncode(old.toSaved(const Size(1920, 1080)).toJson());
    final wb = WhiteboardController()..add(TextElement(id: 'n', position: Offset.zero, text: 'new', color: const Color(0xFF000000), fontSize: 20, size: const Size(40, 20)));
    final autosave = BoardAutosave(wb: wb, snapshot: () => wb.toSaved(const Size(1920, 1080)), store: store, delay: Duration.zero);
    expect(await autosave.start(), isNotNull);
    await autosave.flush();
    expect((jsonDecode(store.data!) as Map)['pages'], isNotNull);
    expect(store.data, contains('new'));
    expect(store.data, isNot(contains('old')));
    await autosave.dispose();
    wb.dispose();
    old.dispose();
  });

  test('the file store writes beside itself and renames into place; clear removes it', () async {
    final dir = Directory.systemTemp.createTempSync('autosave');
    addTearDown(() => dir.deleteSync(recursive: true));
    final s = FileAutosaveStore(dir: () async => dir);
    expect(await s.read(), isNull);
    await s.write('{"a":1}');
    expect(await s.read(), '{"a":1}');
    await s.write('{"a":2}');
    expect(await s.read(), '{"a":2}');
    expect(dir.listSync().map((f) => f.uri.pathSegments.last), ['autosave_board.json'], reason: 'no temporary file left behind');
    await s.clear();
    expect(await s.read(), isNull);
  });
}
