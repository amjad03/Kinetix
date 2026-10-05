import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/core/models.dart';
import 'package:kinetix_board/features/board/board_screen.dart';
import 'package:kinetix_board/features/board/kit/subjects.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  Future<BoardController> pump(
    WidgetTester tester, {
    Size size = const Size(1920, 1080),
    BoardLayout layout = BoardLayout.rails,
    TouchProfile touch = TouchProfile.tablet,
  }) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final board = BoardController()
      ..skipEnrollment()
      ..layout = layout
      ..touchProfile = touch;
    await tester.pumpWidget(
      MaterialApp(
        theme: KinetixTheme.light(),
        home: BoardScreen(board: board),
      ),
    );
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

  group('rails layout (the default)', () {
    testWidgets('tools on the left, AI and the kit on the right, undo and pages at the bottom', (tester) async {
      final board = await pump(tester);
      expect(board.layout, BoardLayout.rails);
      for (final key in ['tool-select', 'tool-hand', 'tool-write', 'tool-highlighter', 'tool-erase', 'tool-text', 'tool-shapes', 'tool-insert', 'tool-tools', 'tool-theme']) {
        expect(find.byKey(Key(key)), findsOneWidget, reason: key);
      }
      for (final key in ['panel-ai', 'panel-quiz', 'panel-homework', 'panel-books', 'panel-kit', 'undo', 'redo', 'next-page', 'zoom-in', 'record', 'save-board']) {
        expect(find.byKey(Key(key)), findsOneWidget, reason: key);
      }
      // Icons only: the names are in tooltips.
      expect(find.byTooltip('Pen'), findsOneWidget);
      expect(find.text('Practice board'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a finger writes; two fingers on a tablet zoom instead', (tester) async {
      await pump(tester);
      await stroke(tester, const Offset(500, 400));
      final wb = whiteboard(tester);
      expect(wb.elements, hasLength(1));
      await tester.tap(find.byKey(const Key('undo')));
      await tester.pump();
      expect(wb.elements, isEmpty);
      await tester.tap(find.byKey(const Key('zoom-in')));
      await tester.pump();
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

    testWidgets('tapping the pen again opens its colours; the eraser its size and Clear page', (tester) async {
      await pump(tester);
      await tester.tap(find.byKey(const Key('tool-write')));
      await tester.pumpAndSettle();
      expect(find.text('Thickness'), findsOneWidget);
      await tester.tap(find.byKey(const Key('popover-barrier')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('tool-erase')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('tool-erase')));
      await tester.pumpAndSettle();
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
      await tester.tap(find.byKey(const Key('delete-selection')));
      await tester.pumpAndSettle();
      expect(wb.elements, hasLength(1));
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
      expect(wb.selection, hasLength(1));
      await tester.sendKeyEvent(LogicalKeyboardKey.delete);
      expect(wb.elements, isEmpty);
      await tester.sendKeyDownEvent(LogicalKeyboardKey.controlLeft);
      await tester.sendKeyEvent(LogicalKeyboardKey.keyZ);
      await tester.sendKeyUpEvent(LogicalKeyboardKey.controlLeft);
      expect(wb.elements, hasLength(1));
      await tester.sendKeyEvent(LogicalKeyboardKey.equal);
      expect(wb.view.value.scale, closeTo(1.25, 0.001));

      // Typing on the board: the letters go into the text, not to the tools.
      await tester.sendKeyEvent(LogicalKeyboardKey.keyT);
      await tester.pump();
      await tester.tapAt(const Offset(900, 600));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('board-text-editor')).last, 'Pe');
      await tester.sendKeyEvent(LogicalKeyboardKey.keyE);
      expect(wb.tool, BoardTool.text);
    });

    testWidgets('the subject reshapes the rails: maths brings equation, graph, geometry', (tester) async {
      final board = await pump(tester);
      board.onPaired('token', session(subject: 'Mathematics', section: 'Class 9 B', term: 9, level: 'k12'));
      await tester.pumpAndSettle();
      for (final t in [SubjectTool.equation, SubjectTool.graph, SubjectTool.geometry]) {
        expect(find.byKey(Key('subject-${t.name}')), findsOneWidget, reason: t.name);
      }
      final wb = whiteboard(tester);
      expect(wb.background, BoardBackground.grid); // a new class starts on its subject's paper
      await tester.tap(find.byKey(const Key('subject-geometry')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Ruler').last);
      await tester.pumpAndSettle();
      expect(wb.ruler.value.visible, isTrue);
      expect(find.byKey(const Key('ruler')), findsOneWidget);

      await tester.tap(find.byKey(const Key('panel-kit')));
      await tester.pumpAndSettle();
      expect(find.text('Maths kit'), findsOneWidget);
      await tester.tap(find.byKey(const Key('formula-Product rule')));
      await tester.pumpAndSettle();
      expect(wb.elements.whereType<MathElement>(), hasLength(1));
      expect(tester.takeException(), isNull);
      board.dispose();
    });

    testWidgets('pages: New page adds one and the indicator follows', (tester) async {
      await pump(tester);
      expect(find.text('1/1'), findsOneWidget);
      await tester.tap(find.byKey(const Key('next-page')));
      await tester.pumpAndSettle();
      expect(find.text('2/2'), findsOneWidget);
      await tester.tap(find.byKey(const Key('previous-page')));
      await tester.pumpAndSettle();
      expect(find.text('1/2'), findsOneWidget);
    });

    testWidgets('fits at 1280×720 with the AI panel open', (tester) async {
      await pump(tester, size: const Size(1280, 720));
      await tester.tap(find.byKey(const Key('panel-ai')));
      await tester.pumpAndSettle();
      expect(find.text('KINETIX AI'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('primary classes (LKG to Class 5)', () {
    testWidgets('the period\'s class turns on big labelled tools, Andika and class stars', (tester) async {
      final board = await pump(tester);
      expect(board.primaryMode, isFalse);
      board.onPaired('token', session(section: 'Class 3 A', subject: 'EVS', term: 3, level: 'k12'));
      await tester.pumpAndSettle();
      expect(board.primaryMode, isTrue);
      // Labelled, with fewer tools (no hand, no laser).
      expect(find.text('Pen'), findsOneWidget);
      expect(find.text('Erase'), findsWidgets);
      expect(find.byKey(const Key('tool-hand')), findsNothing);
      expect(whiteboard(tester).font, BoardFont.andika);
      await tester.tap(find.byKey(const Key('panel-kit')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('kit-stars')), findsOneWidget);
      expect(tester.takeException(), isNull);
      board.dispose();
    });

    testWidgets('the Simple board setting overrides the class', (tester) async {
      final board = await pump(tester);
      board.onPaired('token', session(section: 'Class 9 B', subject: 'Physics', term: 9, level: 'k12'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('tool-hand')), findsOneWidget);
      board.setSimpleBoard(SimpleBoard.on);
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('tool-hand')), findsNothing);
      expect(find.text('Pen'), findsOneWidget);
      board.setSimpleBoard(SimpleBoard.off);
      board.onPaired('token', session(section: 'UKG B', subject: 'English'));
      await tester.pumpAndSettle();
      expect(board.primaryMode, isFalse);
      board.dispose();
    });

    test('primary classes are told from the grade or the class name', () {
      expect(isPrimaryClass(session(section: 'BCom Sem 3 A', term: 3, level: 'ug')), isFalse);
      expect(isPrimaryClass(session(section: 'Grade 5 C', term: 5, level: 'k12')), isTrue);
      expect(isPrimaryClass(session(section: 'Grade 6 C', term: 6, level: 'k12')), isFalse);
      expect(isPrimaryClass(session(section: 'LKG Sunflower')), isTrue);
      expect(isPrimaryClass(session(section: 'Class 2 A')), isTrue);
      expect(isPrimaryClass(session(section: 'Class 10 A')), isFalse);
      expect(isPrimaryClass(null), isFalse);
    });
  });

  group('bottom toolbar layout', () {
    testWidgets('guest board: the toolbar has the Teachmint-style tools, labelled', (tester) async {
      await pump(tester, layout: BoardLayout.bottomBar);
      for (final label in ['Record', 'Theme', 'Write', 'Erase', 'Select', 'Shapes', 'Tools', 'Undo', 'Redo', 'AI', 'Books', 'Quiz', 'Homework', 'Hide', 'New page']) {
        expect(find.text(label), findsWidgets, reason: label);
      }
      expect(find.text('Practice board'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('the settings switch between the layouts', (tester) async {
      final board = await pump(tester, layout: BoardLayout.bottomBar);
      await tester.tap(find.byKey(const Key('profile-button')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('menu-settings')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('layout-rails')));
      await tester.pumpAndSettle();
      expect(board.layout, BoardLayout.rails);
      expect(find.byKey(const Key('tool-hand')), findsOneWidget);
    });

    testWidgets('shapes popover: pick a shape and turn on measurements', (tester) async {
      final board = await pump(tester, layout: BoardLayout.bottomBar);
      await tester.tap(find.byKey(const Key('tool-shapes')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('shape-triangle')));
      await tester.tap(find.text('Show lengths'));
      await tester.pumpAndSettle();
      final wb = whiteboard(tester);
      expect(wb.showLengths, isTrue);
      expect(wb.shapeKind.name, 'triangle');
      expect(wb.tool, BoardTool.shape);
      expect(board.isSignedIn, isFalse);
    });

    testWidgets('a signed-in session shows the class, attendance and End class', (tester) async {
      final board = await pump(tester, layout: BoardLayout.bottomBar);
      board.onPaired('token', session());
      await tester.pumpAndSettle();
      expect(find.textContaining('BCom Sem 3 A · Corporate Accounting'), findsWidgets);
      expect(find.byKey(const Key('end-class')), findsOneWidget);
      expect(find.byKey(const Key('attendance-chip')), findsOneWidget);
      expect(find.textContaining('Welcome, Anita'), findsOneWidget);
      board.dispose(); // cancels the end-of-period timer
    });

    testWidgets('pages: New page adds one and the indicator follows', (tester) async {
      await pump(tester, layout: BoardLayout.bottomBar);
      expect(find.text('1/1'), findsOneWidget);
      await tester.tap(find.byKey(const Key('next-page')));
      await tester.pumpAndSettle();
      expect(find.text('2/2'), findsOneWidget);
      await tester.tap(find.text('Previous'));
      await tester.pumpAndSettle();
      expect(find.text('1/2'), findsOneWidget);
    });

    testWidgets('AI panel opens beside the board and fits at 1080p and 720p', (tester) async {
      for (final size in [const Size(1920, 1080), const Size(1280, 720)]) {
        await pump(tester, size: size, layout: BoardLayout.bottomBar);
        await tester.tap(find.byKey(const Key('panel-ai')));
        await tester.pumpAndSettle();
        expect(find.text('KINETIX AI'), findsOneWidget);
        expect(tester.takeException(), isNull, reason: 'overflow at $size');
        await tester.tap(find.byKey(const Key('panel-close')));
        await tester.pumpAndSettle();
        expect(find.text('KINETIX AI'), findsNothing);
      }
    });

    testWidgets('Hide collapses the chrome and the button brings it back', (tester) async {
      await pump(tester, layout: BoardLayout.bottomBar);
      await tester.tap(find.text('Hide'));
      await tester.pumpAndSettle();
      expect(find.text('Shapes'), findsNothing);
      await tester.tap(find.byKey(const Key('show-tools')));
      await tester.pumpAndSettle();
      expect(find.text('Shapes'), findsOneWidget);
    });

    testWidgets('board settings: choosing IR touch frame turns off palm detection', (tester) async {
      final board = await pump(tester, layout: BoardLayout.bottomBar);
      await tester.tap(find.byKey(const Key('profile-button')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('menu-settings')));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const Key('touch-irFrame')));
      await tester.tap(find.byKey(const Key('touch-irFrame')));
      await tester.pumpAndSettle();
      expect(board.touchProfile, TouchProfile.irFrame);
      expect(whiteboard(tester).palmMode.name, 'off');
    });

    testWidgets('tools popover opens the timer', (tester) async {
      await pump(tester, layout: BoardLayout.bottomBar);
      await tester.tap(find.byKey(const Key('tool-tools')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Timer'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('countdown-text')), findsOneWidget);
      expect(find.text('05:00'), findsOneWidget);
    });
  });
}
