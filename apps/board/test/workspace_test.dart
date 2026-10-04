import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/models.dart';
import 'package:kinetix_board/features/comfort/eye_comfort.dart';
import 'package:kinetix_board/features/ink/ink_canvas.dart';
import 'package:kinetix_board/features/ink/ink_controller.dart';
import 'package:kinetix_board/features/workspace/split_layout.dart';
import 'package:kinetix_board/features/workspace/workspace_screen.dart';

void main() {
  testWidgets('three fingers write three strokes on the canvas at once', (tester) async {
    final ink = InkController();
    await tester.pumpWidget(MaterialApp(home: InkCanvas(controller: ink)));

    final fingers = <TestGesture>[];
    for (var i = 0; i < 3; i++) {
      fingers.add(await tester.startGesture(Offset(100.0 + i * 200, 100), pointer: i + 1, kind: PointerDeviceKind.touch));
    }
    for (var step = 1; step <= 4; step++) {
      for (final f in fingers) {
        await f.moveBy(const Offset(0, 20));
      }
    }
    expect(ink.activePointerCount, 3);
    for (final f in fingers) {
      await f.up();
    }
    await tester.pump();
    expect(ink.strokes, hasLength(3));
    expect(ink.strokes.every((s) => s.points.length == 5), isTrue);
  });

  Future<void> pumpWorkspace(WidgetTester tester, {VoidCallback? onEnd, Size size = const Size(1920, 1080)}) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(
      home: WorkspaceScreen(
        session: SessionContext(
          sessionId: 's1',
          expiresAt: DateTime.now().add(const Duration(hours: 1)),
          teacherId: 't1',
          teacherName: 'Anita Sharma',
          language: 'hi',
          sectionName: 'BCom Sem 3 A',
          subjectName: 'Corporate Accounting',
          periodLabel: '10:00–10:55',
        ),
        eyeComfort: const EyeComfortSettings(),
        onEyeComfortChanged: (_) {},
        onEndClass: onEnd ?? () {},
      ),
    ));
  }

  testWidgets('shows who is teaching which class', (tester) async {
    await pumpWorkspace(tester);
    expect(find.textContaining('Anita Sharma'), findsOneWidget);
    expect(find.textContaining('BCom Sem 3 A · Corporate Accounting · 10:00–10:55'), findsOneWidget);
  });

  testWidgets('split screen puts the board on one side and can swap sides', (tester) async {
    await pumpWorkspace(tester);
    expect(find.byType(InkCanvas), findsOneWidget);

    await tester.tap(find.byKey(const Key('split-menu')));
    await tester.pumpAndSettle();
    await tester.tap(find.text(SplitMode.half.label));
    await tester.pumpAndSettle();

    final canvasLeft = tester.getTopLeft(find.byType(InkCanvas)).dx;
    expect(canvasLeft, 0);
    expect(tester.getSize(find.byType(InkCanvas)).width, closeTo(957, 2));
    expect(find.text('PDF / PPT'), findsOneWidget);

    await tester.tap(find.byKey(const Key('swap-sides')));
    await tester.pumpAndSettle();
    expect(tester.getTopLeft(find.byType(InkCanvas)).dx, greaterThan(900));
  });

  testWidgets('eye comfort settings fit on a 720p screen and the chalkboard switch updates', (tester) async {
    await pumpWorkspace(tester, size: const Size(1280, 720));
    await tester.tap(find.byKey(const Key('eye-comfort')));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull); // no RenderFlex overflow

    final chalk = find.widgetWithText(SwitchListTile, 'Chalkboard (dark board)');
    await tester.scrollUntilVisible(chalk, 50, scrollable: find.byType(Scrollable).last);
    await tester.tap(chalk);
    await tester.pumpAndSettle();
    expect(tester.widget<SwitchListTile>(chalk).value, isTrue);
  });

  testWidgets('End class calls back', (tester) async {
    var ended = false;
    await pumpWorkspace(tester, onEnd: () => ended = true);
    await tester.tap(find.byKey(const Key('end-class')));
    expect(ended, isTrue);
  });
}
