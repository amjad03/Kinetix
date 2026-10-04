import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/core/models.dart';
import 'package:kinetix_board/features/board/board_screen.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  Future<BoardController> pump(WidgetTester tester, {Size size = const Size(1920, 1080)}) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final board = BoardController()..skipEnrollment();
    await tester.pumpWidget(
      MaterialApp(
        theme: KinetixTheme.light(),
        home: BoardScreen(board: board),
      ),
    );
    await tester.pump();
    return board;
  }

  SessionContext session() => SessionContext(
    sessionId: 's1',
    expiresAt: DateTime.now().add(const Duration(hours: 1)),
    teacherId: 't1',
    teacherName: 'Anita Sharma',
    language: 'hi',
    sectionName: 'BCom Sem 3 A',
    subjectName: 'Corporate Accounting',
    periodLabel: '10:00–10:55',
  );

  testWidgets('guest board: toolbar has the Teachmint-style tools, labelled', (tester) async {
    await pump(tester);
    for (final label in [
      'Record',
      'Theme',
      'Write',
      'Erase',
      'Select',
      'Shapes',
      'Tools',
      'Undo',
      'Redo',
      'AI',
      'Books',
      'Quiz',
      'Homework',
      'Hide',
      'New page',
    ]) {
      expect(find.text(label), findsWidgets, reason: label);
    }
    expect(find.text('Practice board'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('three fingers write three strokes on the canvas at once', (tester) async {
    await pump(tester);
    final canvas = find.byType(InkCanvas).first;
    final origin = tester.getCenter(canvas) - const Offset(400, 100);
    final fingers = <TestGesture>[];
    for (var i = 0; i < 3; i++) {
      fingers.add(await tester.startGesture(origin + Offset(i * 200.0, 0), pointer: i + 1, kind: PointerDeviceKind.touch));
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
    expect(find.text('Undo'), findsOneWidget);
    expect(tester.widget<InkCanvas>(canvas).controller.strokes, hasLength(3));
  });

  testWidgets('a signed-in session shows the class, attendance and End class', (tester) async {
    final board = await pump(tester);
    board.onPaired('token', session());
    await tester.pumpAndSettle();
    expect(find.textContaining('BCom Sem 3 A · Corporate Accounting'), findsWidgets);
    expect(find.byKey(const Key('end-class')), findsOneWidget);
    expect(find.byKey(const Key('attendance-chip')), findsOneWidget);
    expect(find.textContaining('Welcome, Anita'), findsOneWidget);
    board.dispose(); // cancels the end-of-period timer
  });

  testWidgets('shapes popover: pick a shape and turn on measurements', (tester) async {
    final board = await pump(tester);
    await tester.tap(find.byKey(const Key('tool-shapes')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('shape-triangle')));
    await tester.tap(find.text('Show lengths'));
    await tester.pumpAndSettle();
    final ink = tester.widget<InkCanvas>(find.byType(InkCanvas).first).controller;
    expect(ink.showLengths, isTrue);
    expect(ink.style.shape.name, 'triangle');
    expect(board.isSignedIn, isFalse);
  });

  testWidgets('pages: New page adds one and the indicator follows', (tester) async {
    await pump(tester);
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
      await pump(tester, size: size);
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
    await pump(tester);
    await tester.tap(find.text('Hide'));
    await tester.pumpAndSettle();
    expect(find.text('Shapes'), findsNothing);
    await tester.tap(find.byKey(const Key('show-tools')));
    await tester.pumpAndSettle();
    expect(find.text('Shapes'), findsOneWidget);
  });

  testWidgets('board settings: choosing IR touch frame turns off palm detection', (tester) async {
    final board = await pump(tester);
    await tester.tap(find.byKey(const Key('profile-button')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('menu-settings')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('touch-irFrame')));
    await tester.pumpAndSettle();
    expect(board.touchProfile, TouchProfile.irFrame);
    final ink = tester.widget<InkCanvas>(find.byType(InkCanvas).first).controller;
    expect(ink.palmMode.name, 'off');
  });

  testWidgets('tools popover opens the timer', (tester) async {
    await pump(tester);
    await tester.tap(find.byKey(const Key('tool-tools')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Timer'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('countdown-text')), findsOneWidget);
    expect(find.text('05:00'), findsOneWidget);
  });
}
