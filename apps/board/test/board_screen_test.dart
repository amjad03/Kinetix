import 'dart:typed_data';

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/core/models.dart';
import 'package:kinetix_board/features/board/board_screen.dart';
import 'package:kinetix_board/features/board/kit/subjects.dart';
import 'package:kinetix_board/features/board/layout/board_chrome.dart';
import 'package:kinetix_board/features/board/layout/page_overview.dart';
import 'package:kinetix_board/features/toolkit/toolkit_layer.dart';
import 'package:kinetix_board/features/toolkit/toolkit_controller.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// The approved layout (docs/design/board-wireframes.html) on an interactive panel.
void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  Future<BoardController> pump(
    WidgetTester tester, {
    Size size = const Size(1920, 1080),
    ToolbarDock dock = ToolbarDock.bottom,
    TouchProfile touch = TouchProfile.tablet,
  }) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final board = BoardController()
      ..skipEnrollment()
      ..toolbarDock = dock
      ..touchProfile = touch;
    await tester.pumpWidget(MaterialApp(theme: KinetixTheme.light(), home: BoardScreen(board: board)));
    await tester.pump();
    return board;
  }

  WhiteboardController whiteboard(WidgetTester tester) => tester.widget<WhiteboardCanvas>(find.byType(WhiteboardCanvas)).controller;

  SessionContext session({String section = 'BCom Sem 3 A', String subject = 'Corporate Accounting', int? term, String? level}) => SessionContext(
    sessionId: 's1',
    expiresAt: DateTime.now().add(const Duration(hours: 1)),
    teacherId: 't1',
    teacherName: 'Anita Sharma',
    language: 'hi',
    sectionName: section,
    subjectName: subject,
    periodLabel: '10:00–10:55',
    classTerm: term,
    programLevel: level,
  );

  Future<void> stroke(WidgetTester tester, Offset from, {int pointer = 9}) async {
    final g = await tester.startGesture(from, pointer: pointer, kind: PointerDeviceKind.touch);
    for (var i = 0; i < 5; i++) {
      await g.moveBy(const Offset(30, 10));
    }
    await g.up();
    await tester.pump();
  }

  Future<void> tapKey(WidgetTester tester, String key) async {
    await tester.ensureVisible(find.byKey(Key(key)));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(Key(key)));
    await tester.pumpAndSettle();
  }

  group('the layout', () {
    testWidgets('class bar, search, clock and profile on top; toolbar in the order approved; menu, record and pages in the corners', (tester) async {
      final board = await pump(tester);
      expect(board.toolbarDock, ToolbarDock.bottom);
      const order = ['tool-pen', 'tool-highlighter', 'tool-erase', 'tool-select', 'tool-shapes', 'undo', 'redo', 'tool-tools', 'tool-insert', 'panel-ai'];
      final xs = [for (final k in order) tester.getCenter(find.byKey(Key(k))).dx];
      for (var i = 1; i < xs.length; i++) {
        expect(xs[i], greaterThan(xs[i - 1]), reason: order[i]);
      }
      expect(find.text('KINETIX AI'), findsOneWidget);
      for (final key in ['sign-in-chip', 'open-search', 'board-clock', 'profile-button', 'board-menu', 'record', 'previous-page', 'page-indicator', 'next-page', 'add-page', 'page-overview']) {
        expect(find.byKey(Key(key)), findsOneWidget, reason: key);
      }
      // Bottom centre, menu bottom left, pages bottom right.
      expect(tester.getCenter(find.byKey(const Key('main-toolbar'))).dx, closeTo(960, 120));
      expect(tester.getCenter(find.byKey(const Key('board-menu'))).dx, lessThan(300));
      expect(tester.getCenter(find.byKey(const Key('page-overview'))).dx, greaterThan(1700));
      expect(find.byKey(const Key('tool-hand')), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a signed-in class shows class and subject, Go live, attendance and time left', (tester) async {
      final board = await pump(tester);
      board.onPaired('token', session());
      await tester.pumpAndSettle();
      expect(find.textContaining('BCom Sem 3 A · Corporate Accounting'), findsWidgets);
      expect(find.byKey(const Key('go-live')), findsOneWidget);
      expect(find.byKey(const Key('attendance-chip')), findsOneWidget);
      await tapKey(tester, 'board-menu');
      expect(find.byKey(const Key('end-class')), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      board.dispose();
    });

    test('time left in the period', () {
      expect(minutesLeft('10:00–10:45', DateTime(2026, 1, 1, 10, 30)), 15);
      expect(minutesLeft('10:00–10:45', DateTime(2026, 1, 1, 11)), isNull);
    });

    testWidgets('the toolbar drags to the left edge, then folds away and back', (tester) async {
      final board = await pump(tester);
      final handle = find.byKey(const Key('toolbar-handle'));
      await tester.drag(handle, const Offset(-800, -300));
      await tester.pumpAndSettle();
      expect(board.toolbarDock, ToolbarDock.left);
      expect(tester.getCenter(find.byKey(const Key('tool-pen'))).dx, lessThan(150));
      // Vertical: Pen above Undo.
      expect(tester.getCenter(find.byKey(const Key('tool-pen'))).dy, lessThan(tester.getCenter(find.byKey(const Key('undo'))).dy));
      await tapKey(tester, 'toolbar-collapse');
      expect(find.byKey(const Key('undo')), findsNothing);
      await tapKey(tester, 'toolbar-expand');
      expect(find.byKey(const Key('undo')), findsOneWidget);
      await tester.drag(find.byKey(const Key('toolbar-handle')), const Offset(1700, 0));
      await tester.pumpAndSettle();
      expect(board.toolbarDock, ToolbarDock.right);
      expect(tester.takeException(), isNull);
    });
  });

  group('writing', () {
    testWidgets('a finger writes and Undo takes it back; zoom is in the page overview', (tester) async {
      await pump(tester);
      await stroke(tester, const Offset(500, 400));
      final wb = whiteboard(tester);
      expect(wb.elements, hasLength(1));
      await tester.tap(find.byKey(const Key('undo')));
      await tester.pump();
      expect(wb.elements, isEmpty);
      await tapKey(tester, 'page-overview');
      await tapKey(tester, 'zoom-in');
      expect(find.text('125%'), findsOneWidget);
    });

    testWidgets('on a panel three fingers write three strokes at once', (tester) async {
      await pump(tester, touch: TouchProfile.panel);
      final fingers = <TestGesture>[];
      for (var i = 0; i < 3; i++) {
        fingers.add(await tester.startGesture(Offset(500 + i * 200.0, 400), pointer: i + 1, kind: PointerDeviceKind.touch));
      }
      for (var step = 0; step < 4; step++) {
        for (final f in fingers) {
          await f.moveBy(const Offset(0, 20));
        }
      }
      for (final f in fingers) {
        await f.up();
      }
      await tester.pump();
      expect(whiteboard(tester).elements, hasLength(3));
    });

    testWidgets('the pen popover: type, thickness, opacity, colour, wheel, smoothing, pressure, palm, touch, and the AI pen options', (tester) async {
      final board = await pump(tester);
      final wb = whiteboard(tester);
      await tapKey(tester, 'tool-pen');
      expect(find.byKey(const Key('pen-popover')), findsOneWidget);
      await tapKey(tester, 'pen-type-dashed');
      expect(wb.penNib, PenNib.dashed);
      await tapKey(tester, 'pen-colour-1');
      expect(wb.penColor.withValues(alpha: 1), const Color(0xFFD93025));
      final thickness = find.byKey(const Key('pen-thickness'));
      await tester.ensureVisible(thickness);
      await tester.tapAt(tester.getTopRight(thickness) + const Offset(-12, 20));
      await tester.pumpAndSettle();
      expect(wb.penWidth, greaterThan(18));
      final opacity = find.byKey(const Key('pen-opacity'));
      await tester.tapAt(tester.getTopLeft(opacity) + const Offset(30, 20));
      await tester.pumpAndSettle();
      expect(wb.penColor.a, lessThan(0.5));
      await tapKey(tester, 'pen-colour-custom');
      await tapKey(tester, 'colour-wheel-disc');
      await tapKey(tester, 'pen-pressure');
      expect(wb.penPressure, isTrue);
      final smooth = find.byKey(const Key('pen-smoothing'));
      await tester.tapAt(tester.getTopRight(smooth) + const Offset(-12, 20));
      await tester.pumpAndSettle();
      expect(wb.penSmoothing, greaterThan(0.8));
      await tapKey(tester, 'pen-palm');
      expect(board.palmRejection, isFalse);
      expect(wb.palmMode, PalmMode.off);
      await tester.ensureVisible(find.text('Multi touch'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Multi touch'));
      await tester.pumpAndSettle();
      expect(board.multiWriter, isTrue);

      // The AI pen keeps every pen option, and adds what it converts and when.
      await tapKey(tester, 'pen-type-aiPen');
      expect(wb.tool, BoardTool.aiPen);
      expect(wb.penNib, PenNib.dashed);
      await tapKey(tester, 'ai-convert-text');
      expect(board.aiPenConvert.contains('text'), isFalse);
      await tapKey(tester, 'ai-pen-mode-tap');
      expect(board.aiPenMode, AiPenMode.tap);
      await tester.tapAt(const Offset(1300, 150));
      await tester.pumpAndSettle();
      await tapKey(tester, 'tool-highlighter');
      await tapKey(tester, 'tool-pen');
      expect(wb.tool, BoardTool.aiPen);
      // The last colours and thicknesses show as quick swatches.
      expect(find.byKey(const Key('toolbar-recent-0')), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('the eraser again opens its size and Clear page', (tester) async {
      await pump(tester);
      await tester.tap(find.byKey(const Key('tool-erase')));
      await tester.pump();
      await tapKey(tester, 'tool-erase');
      expect(find.byKey(const Key('clear-page')), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('select, then the actions under the selection', (tester) async {
      await pump(tester);
      await stroke(tester, const Offset(500, 400));
      final wb = whiteboard(tester);
      await tester.tap(find.byKey(const Key('tool-select')));
      await tester.pump();
      await tester.tapAt(const Offset(530, 410));
      await tester.pumpAndSettle();
      expect(wb.selection, hasLength(1));
      await tester.tap(find.byKey(const Key('sel-duplicate')));
      await tester.pumpAndSettle();
      expect(wb.elements, hasLength(2));
    });

    testWidgets('keyboard: tool letters, undo, delete, zoom, and none while typing', (tester) async {
      await pump(tester);
      final wb = whiteboard(tester);
      await tester.sendKeyEvent(LogicalKeyboardKey.keyE);
      expect(wb.tool, BoardTool.eraser);
      await tester.sendKeyEvent(LogicalKeyboardKey.keyP);
      expect(wb.tool, BoardTool.pen);
      await stroke(tester, const Offset(500, 400));
      await tester.sendKeyDownEvent(LogicalKeyboardKey.controlLeft);
      await tester.sendKeyEvent(LogicalKeyboardKey.keyA);
      await tester.sendKeyUpEvent(LogicalKeyboardKey.controlLeft);
      await tester.sendKeyEvent(LogicalKeyboardKey.delete);
      expect(wb.elements, isEmpty);
      await tester.sendKeyDownEvent(LogicalKeyboardKey.controlLeft);
      await tester.sendKeyEvent(LogicalKeyboardKey.keyZ);
      await tester.sendKeyUpEvent(LogicalKeyboardKey.controlLeft);
      expect(wb.elements, hasLength(1));
      await tester.sendKeyEvent(LogicalKeyboardKey.equal);
      expect(wb.view.value.scale, closeTo(1.25, 0.001));
    });
  });

  group('pages', () {
    testWidgets('add, previous and next, and the overview: reorder, duplicate, delete, export', (tester) async {
      await pump(tester);
      final wb = whiteboard(tester);
      await stroke(tester, const Offset(500, 400));
      await tapKey(tester, 'add-page');
      expect(find.text('2/2'), findsOneWidget);
      await tapKey(tester, 'previous-page');
      expect(find.text('1/2'), findsOneWidget);
      final first = wb.pages.first;
      await tapKey(tester, 'page-overview');
      expect(find.byKey(const Key('page-thumb-1')), findsOneWidget);
      // Long-press a thumbnail and drag it past the second.
      final g = await tester.startGesture(tester.getCenter(find.byKey(const Key('page-thumb-0'))));
      await tester.pump(const Duration(milliseconds: 700));
      for (var i = 0; i < 20; i++) {
        await g.moveBy(const Offset(16, 0));
        await tester.pump(const Duration(milliseconds: 16));
      }
      await g.up();
      await tester.pumpAndSettle();
      expect(wb.pages.last, same(first));
      await tapKey(tester, 'overview-duplicate');
      expect(wb.pageCount, 3);
      await tapKey(tester, 'overview-delete');
      expect(wb.pageCount, 2);
      Uint8List? pdf;
      final share = sharePdf;
      addTearDown(() => sharePdf = share);
      sharePdf = (name, bytes) async => pdf = bytes;
      await tester.runAsync(() async {
        await tester.tap(find.byKey(const Key('overview-export')));
        await Future<void>.delayed(const Duration(milliseconds: 500));
      });
      await tester.pumpAndSettle();
      expect(pdf, isNotNull);
      expect(String.fromCharCodes(pdf!.take(8)), startsWith('%PDF-1.4'));
      expect(tester.takeException(), isNull);
    });

    testWidgets('backgrounds per page from the menu', (tester) async {
      await pump(tester);
      final wb = whiteboard(tester);
      await tapKey(tester, 'board-menu');
      await tapKey(tester, 'tool-theme');
      await tapKey(tester, 'bg-ledger');
      expect(wb.background, BoardBackground.ledger);
      await tester.tapAt(const Offset(1300, 150));
      await tester.pumpAndSettle();
      await tapKey(tester, 'add-page');
      await tapKey(tester, 'board-menu');
      await tapKey(tester, 'tool-theme');
      await tester.tap(find.text('Colours'));
      await tester.pumpAndSettle();
      await tapKey(tester, 'bg-paperSky');
      wb.previous();
      expect(wb.background, BoardBackground.ledger);
      expect(tester.takeException(), isNull);
    });
  });

  group('the split panel', () {
    testWidgets('opens on the right at 42 %, the divider resizes it between 30 and 60 %, ⤢ and ✕', (tester) async {
      await pump(tester);
      await tapKey(tester, 'panel-ai');
      final panel = find.byKey(const Key('split-panel'));
      expect(tester.getSize(panel).width, closeTo(1920 * 0.42, 2));
      expect(tester.getTopRight(panel).dx, 1920);
      await tester.drag(find.byKey(const Key('panel-divider')), const Offset(-600, 0));
      await tester.pumpAndSettle();
      expect(tester.getSize(panel).width, closeTo(1920 * 0.60, 2));
      await tester.drag(find.byKey(const Key('panel-divider')), const Offset(900, 0));
      await tester.pumpAndSettle();
      expect(tester.getSize(panel).width, closeTo(1920 * 0.30, 2));
      // The board stays writable beside it.
      await stroke(tester, const Offset(300, 400));
      expect(whiteboard(tester).elements, hasLength(1));
      await tapKey(tester, 'panel-full');
      expect(tester.getSize(panel).width, 1920);
      await tapKey(tester, 'panel-full');
      for (final t in ['model3d', 'labs', 'videos', 'books', 'kit', 'animations', 'ai']) {
        await tapKey(tester, 'panel-tab-$t');
        expect(tester.takeException(), isNull, reason: t);
      }
      await tapKey(tester, 'panel-close');
      expect(panel, findsNothing);
    });

    testWidgets('dialogs open in the panel, not over the board: settings', (tester) async {
      await pump(tester);
      await tapKey(tester, 'board-menu');
      await tapKey(tester, 'menu-settings');
      expect(find.byKey(const Key('split-panel')), findsOneWidget);
      await tester.ensureVisible(find.byKey(const Key('finger-taps')));
      await tester.tap(find.byKey(const Key('finger-taps')));
      await tester.pumpAndSettle();
      // Writing still works with the settings open.
      await stroke(tester, const Offset(300, 400));
      expect(whiteboard(tester).elements, hasLength(1));
      await tapKey(tester, 'panel-close');
      expect(find.byKey(const Key('split-panel')), findsNothing);
    });

    testWidgets('write on the panel with the pen', (tester) async {
      await pump(tester);
      await tapKey(tester, 'panel-ai');
      await tapKey(tester, 'panel-write');
      final ink = find.byKey(const Key('panel-ink'));
      final g = await tester.startGesture(tester.getCenter(ink), kind: PointerDeviceKind.stylus);
      await g.moveBy(const Offset(40, 20));
      await g.up();
      await tester.pump();
      expect(whiteboard(tester).elements, isEmpty);
      expect(tester.takeException(), isNull);
    });
  });

  group('tools', () {
    testWidgets('the drawer: groups, filter and search; the timer floats on the board; formulas open in the panel', (tester) async {
      await pump(tester);
      await tapKey(tester, 'tool-tools');
      expect(find.byKey(const Key('tools-drawer')), findsOneWidget);
      await tapKey(tester, 'drawer-filter-commerce');
      expect(find.byKey(const Key('drawer-spreadsheet')), findsOneWidget);
      expect(find.byKey(const Key('drawer-toolkit-timer')), findsNothing);
      await tester.enterText(find.byKey(const Key('tools-search')).first, 'timer');
      await tester.pumpAndSettle();
      await tapKey(tester, 'drawer-toolkit-timer');
      expect(find.byKey(const Key('countdown-text')), findsOneWidget);
      await tapKey(tester, 'tool-tools');
      await tapKey(tester, 'drawer-periodic-table');
      expect(find.byKey(const Key('split-panel')), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('the timer: custom time by keypad and by wheels, count up, presets, sound, mini', (tester) async {
      await pump(tester);
      final kit = (tester.widget<ToolkitLayer>(find.byType(ToolkitLayer))).kit;
      kit.show(ToolkitItem.timer);
      await tester.pumpAndSettle();
      await tapKey(tester, 'timer-set');
      await tester.tap(find.text('Keypad'));
      await tester.pumpAndSettle();
      for (final d in ['1', '2', '3', '0']) {
        await tapKey(tester, 'timer-key-$d');
      }
      expect(find.text('00 : 12 : 30'), findsOneWidget);
      await tapKey(tester, 'timer-setter-done');
      expect(kit.timerTotal, const Duration(minutes: 12, seconds: 30));
      await tapKey(tester, 'timer-save-preset');
      expect(find.byKey(const Key('timer-preset-750')), findsOneWidget);
      await tapKey(tester, 'timer-3');
      expect(kit.timerTotal, const Duration(minutes: 3));
      await tapKey(tester, 'timer-set');
      await tester.drag(find.byKey(const Key('timer-wheel-h')), const Offset(0, -40));
      await tester.pumpAndSettle();
      await tapKey(tester, 'timer-setter-done');
      expect(kit.timerTotal, const Duration(hours: 1, minutes: 3));
      await tester.tap(find.text('Count up'));
      await tester.pumpAndSettle();
      expect(kit.timerCountUp, isTrue);
      expect(find.text('00:00'), findsOneWidget);
      await tapKey(tester, 'timer-mini');
      expect(find.byKey(const Key('toolkit-timer-mini')), findsOneWidget);
      await tapKey(tester, 'timer-big');
      expect(find.byKey(const Key('toolkit-timer')), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('primary classes (LKG to Class 5)', () {
    testWidgets('the period\'s class turns on big labelled tools, Andika and class stars', (tester) async {
      final board = await pump(tester);
      board.onPaired('token', session(section: 'Class 3 A', subject: 'EVS', term: 3, level: 'k12'));
      await tester.pumpAndSettle();
      expect(board.primaryMode, isTrue);
      expect(find.text('Pen'), findsOneWidget);
      expect(tester.getSize(find.byKey(const Key('tool-pen'))).height, 76);
      expect(whiteboard(tester).font, BoardFont.andika);
      await tapKey(tester, 'tool-pen');
      expect(find.byKey(const Key('pen-type-aiPen')), findsNothing);
      await tester.tapAt(const Offset(1300, 150));
      await tester.pumpAndSettle();
      await tapKey(tester, 'panel-ai');
      await tapKey(tester, 'panel-tab-kit');
      expect(find.byKey(const Key('kit-stars')), findsOneWidget);
      expect(tester.takeException(), isNull);
      board.dispose();
    });

    test('primary classes are told from the grade or the class name', () {
      expect(isPrimaryClass(session(section: 'BCom Sem 3 A', term: 3, level: 'ug')), isFalse);
      expect(isPrimaryClass(session(section: 'Grade 5 C', term: 5, level: 'k12')), isTrue);
      expect(isPrimaryClass(session(section: 'LKG Sunflower')), isTrue);
      expect(isPrimaryClass(session(section: 'Class 10 A')), isFalse);
      expect(isPrimaryClass(null), isFalse);
    });
  });

  group('finger taps', () {
    Future<void> tap(WidgetTester tester, int fingers, Duration at) async {
      final gestures = <TestGesture>[];
      for (var i = 0; i < fingers; i++) {
        final g = await tester.createGesture(pointer: 40 + i, kind: PointerDeviceKind.touch);
        await g.down(Offset(700 + i * 60.0, 500), timeStamp: at + Duration(milliseconds: 20 * i));
        gestures.add(g);
      }
      for (final g in gestures) {
        await g.up(timeStamp: at + const Duration(milliseconds: 150));
      }
      await tester.pump();
    }

    testWidgets('two fingers undo and three redo, until Board settings turns them off', (tester) async {
      final board = await pump(tester);
      await stroke(tester, const Offset(500, 400));
      final wb = whiteboard(tester);
      await tap(tester, 2, Duration.zero);
      expect(wb.elements, isEmpty);
      await tap(tester, 3, const Duration(seconds: 1));
      expect(wb.elements, hasLength(1));
      board.setFingerTaps(false);
      await tester.pump();
      await tap(tester, 2, const Duration(seconds: 2));
      expect(wb.elements, hasLength(1));
    });

    testWidgets('board settings: IR touch frame turns off palm detection', (tester) async {
      final board = await pump(tester);
      await tapKey(tester, 'board-menu');
      await tapKey(tester, 'menu-settings');
      await tapKey(tester, 'touch-irFrame');
      expect(board.touchProfile, TouchProfile.irFrame);
      expect(whiteboard(tester).palmMode.name, 'off');
    });
  });
}
