import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/core/recording/recordings.dart';
import 'package:kinetix_board/demo/demo.dart';
import 'package:kinetix_board/demo/demo_server.dart';
import 'package:kinetix_board/features/board/context/class_context.dart';
import 'package:kinetix_board/features/board/context/context_switcher.dart';
import 'package:kinetix_board/features/board/layout/tools_drawer.dart';
import 'package:kinetix_board/features/curriculum/curriculum_picker.dart';
import 'package:kinetix_board/features/curriculum/curriculum_registry.dart';
import 'package:kinetix_board/main.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'demo_classes_test.dart' show skipVideos;
import 'support/layout.dart';
import 'support/panel_harness.dart';
import 'support/recording_fakes.dart';

/// The class and subject picker (lib/features/curriculum) and how a pick reshapes the board.
void main() {
  group('the picker', () {
    for (final (name, size) in const [('phone', phoneSize), ('panel', panelSize)]) {
      testWidgets('$name: class, then subject; it reopens on the pick and goes back to the timetable', (tester) async {
        final pick = ContextOverride();
        ClassContext now() => resolveClassContext(null, pick);
        await pumpPanel(tester, Align(alignment: Alignment.topLeft, child: ContextChip(ctx: now, pick: pick)), size: size);
        await tester.tap(find.byKey(const Key('ctx-chip')));
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('curriculum-picker')), findsOneWidget);
        // School first, Class 1 to 12.
        for (var g = 1; g <= 12; g++) {
          expect(find.byKey(Key('cur-level-class-$g')), findsOneWidget);
        }
        await tester.tap(find.byKey(const Key('cur-stage-college')));
        await tester.pumpAndSettle();
        await tester.ensureVisible(find.byKey(const Key('cur-level-be-civil')));
        await tester.tap(find.byKey(const Key('cur-level-be-civil')));
        await tester.pumpAndSettle();
        // By semester, the first year too.
        expect(find.text('Sem 1'), findsOneWidget);
        expect(find.text('Sem 5'), findsOneWidget);
        final tile = find.byKey(const Key('cur-subject-structural-analysis'));
        await tester.ensureVisible(tile);
        await tester.pumpAndSettle();
        // Big enough to hit on a touch panel.
        expect(tester.getSize(tile).height, greaterThanOrEqualTo(64));
        await tester.tap(tile);
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('curriculum-picker')), findsNothing);
        expect(pick.curriculum, 'be-civil/structural-analysis');
        expect(find.text('B.E. Civil · Sem 5 · Structural Analysis'), findsOneWidget);

        // Again: it opens on B.E. Civil's subjects; back to the levels, then the timetable.
        await tester.tap(find.byKey(const Key('ctx-chip')));
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('cur-subject-structural-analysis')), findsOneWidget);
        await tester.tap(find.byKey(const Key('cur-back')));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const Key('cur-reset')));
        await tester.pumpAndSettle();
        expect(pick.active, isFalse);
        expect(tester.takeException(), isNull);
      });
    }

    testWidgets('in Hindi and Kannada, with the plain subject and grade chooser behind it', (tester) async {
      for (final lang in ['hi', 'kn']) {
        final pick = ContextOverride();
        await pumpPanel(tester, Align(alignment: Alignment.topLeft, child: ContextChip(ctx: () => resolveClassContext(null, pick), pick: pick)), lang: lang);
        await tester.tap(find.byKey(const Key('ctx-chip')));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const Key('cur-level-class-7')));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const Key('cur-subject-science')));
        await tester.pumpAndSettle();
        expect(find.text(lang == 'hi' ? 'कक्षा 7 · विज्ञान' : 'ತರಗತಿ 7 · ವಿಜ್ಞಾನ'), findsOneWidget, reason: lang);
        await tester.tap(find.byKey(const Key('ctx-chip')));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const Key('cur-back')));
        await tester.pumpAndSettle();
        await tester.ensureVisible(find.byKey(const Key('cur-other')));
        await tester.tap(find.byKey(const Key('cur-other')));
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('ctx-picker')), findsOneWidget);
        await tester.tap(find.byKey(const Key('ctx-done')));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      }
    });
  });

  group('on the board', () {
    setUp(() {
      Demo.enabled = true;
      SharedPreferences.setMockInitialValues({});
    });
    tearDown(() {
      Demo.enabled = false;
      curriculumPickerAtDemoStart = false;
    });

    Future<BoardController> pump(WidgetTester tester, Size size, {bool skip = true}) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final store = MemoryRecordingStore();
      final board = demoBoard(DemoBoardServer(claimDelay: const Duration(seconds: 2)), recordings: Recordings(store: store, voice: () => FakeVoiceRecorder(store: store)));
      await tester.pumpWidget(KinetixBoardApp(controller: board));
      await tester.pumpAndSettle();
      if (skip) await skipVideos(tester);
      return board;
    }

    WhiteboardController whiteboard(WidgetTester tester) => tester.widget<WhiteboardCanvas>(find.byType(WhiteboardCanvas).first).controller;

    Future<void> choose(WidgetTester tester, List<String> keys) async {
      await tapBoard(tester, 'ctx-chip');
      for (final k in keys) {
        await tester.ensureVisible(find.byKey(Key(k)));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(Key(k)));
        await tester.pumpAndSettle();
      }
    }

    List<String> drawerIds(WidgetTester tester) => [for (final t in tester.widget<ToolsDrawer>(find.byType(ToolsDrawer)).tools) t.id];

    testWidgets('Class 7 · Science, then B.E. Civil · Structural Analysis: toolbar, Tools, paper and kits follow', (tester) async {
      final board = await pump(tester, const Size(1920, 1080));
      final wb = whiteboard(tester);
      expect(find.byKey(const Key('tool-laser')), findsOneWidget);

      await choose(tester, ['cur-level-class-7', 'cur-subject-science']);
      expect(find.text('Class 7 · Science'), findsOneWidget);
      // Science's labs and 3D models join the toolbar in place of the laser and redo.
      expect(find.byKey(const Key('tbar-labs')), findsOneWidget);
      expect(find.byKey(const Key('tbar-models3d')), findsOneWidget);
      expect(find.byKey(const Key('tool-laser')), findsNothing);
      expect(wb.background, BoardBackground.plain);
      expect(board.curriculumPick, 'class-7/science');
      // Its tools lead the drawer, which has every registry tool.
      await tapBoard(tester, 'tool-tools');
      final drawer = tester.widget<ToolsDrawer>(find.byType(ToolsDrawer));
      expect(drawer.preferred.take(3), ['labs', 'models3d', 'circuit']);
      final ids = drawerIds(tester).toSet();
      for (final l in CurriculumRegistry.levels) {
        for (final s in l.subjects) {
          for (final t in CurriculumChoice(l, s).quickTools) {
            expect(ids, contains(t), reason: '${l.id}/${s.id}: tool:$t is a Tools tile');
          }
        }
      }
      await tapBoard(tester, 'drawer-subject-kits');
      expect(find.byKey(const Key('curriculum-kits')), findsOneWidget);
      expect(find.byKey(const Key('cur-kit-lab-magnets')), findsOneWidget);
      await tester.tap(find.byKey(const Key('panel-close')).first);
      await tester.pumpAndSettle();

      // Write something: the college pick opens a new page on its graph paper.
      wb.insert([TextElement(id: 'x', position: const Offset(300, 300), text: 'x', color: WhiteboardController.inkBlack, fontSize: 40, size: const Size(30, 40))]);
      await tester.pumpAndSettle();
      await choose(tester, ['cur-back', 'cur-stage-college', 'cur-level-be-civil', 'cur-subject-structural-analysis']);
      expect(find.text('B.E. Civil · Sem 5 · Structural Analysis'), findsOneWidget);
      expect(wb.pageCount, 2);
      expect(wb.background, BoardBackground.graph);
      expect(find.byKey(const Key('tbar-drawer-beam-solver')), findsOneWidget);
      expect(find.byKey(const Key('tbar-drawer-truss-solver')), findsOneWidget);
      // The free-body diagram tool (once a kit for a later update) opens the mechanical kit there.
      await openTool(tester, 'subject-kits');
      expect(find.byKey(const Key('cur-kit-soon-fbd')), findsNothing);
      await tester.ensureVisible(find.byKey(const Key('cur-kit-tool-fbd')));
      await tester.tap(find.byKey(const Key('cur-kit-tool-fbd')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('mech-fbd-incline')), findsOneWidget);
      expect(tester.takeException(), isNull);
      board.dispose();
    });

    testWidgets('a phone keeps its own bar and shows the picker full screen', (tester) async {
      final board = await pump(tester, const Size(390, 844));
      await choose(tester, ['cur-stage-postgrad', 'cur-level-mtech-ev', 'cur-subject-bms']);
      expect(board.curriculumPick, 'mtech-ev/bms');
      expect(find.byKey(const Key('tbar-drawer-spreadsheet')), findsNothing);
      expect(tester.takeException(), isNull);
      board.dispose();
    });

    testWidgets('demo: the picker opens at the start, opens a demo class, and the pick is remembered', (tester) async {
      curriculumPickerAtDemoStart = true;
      // The picker opens over the period's concept videos.
      var board = await pump(tester, const Size(1920, 1080), skip: false);
      expect(find.byKey(const Key('curriculum-picker')), findsOneWidget);
      // The demo day's classes are one tap away.
      await tester.ensureVisible(find.byKey(const Key('cur-demo-puc2')));
      await tester.tap(find.byKey(const Key('cur-demo-puc2')));
      await tester.pumpAndSettle();
      await skipVideos(tester);
      expect(board.session?.subjectName, 'Physics');
      // II PUC Physics is Class 12 Physics on the timetable.
      expect(find.text('Class 12 · Physics'), findsOneWidget);
      while (find.byKey(const Key('panel-close')).evaluate().isNotEmpty) {
        await tester.tap(find.byKey(const Key('panel-close')).first);
        await tester.pumpAndSettle();
      }

      // The DEMO chip's timetable leads to the picker too.
      await tapBoard(tester, 'demoChip');
      await tester.tap(find.byKey(const Key('demo-open-curriculum')));
      await tester.pumpAndSettle();
      // It opens on the timetable's Class 12, with the timetable offered on the levels.
      expect(find.byKey(const Key('cur-subject-physics')), findsOneWidget);
      await tester.tap(find.byKey(const Key('cur-back')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('cur-timetable')), findsOneWidget);
      await tester.tap(find.byKey(const Key('cur-stage-college')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('cur-level-mba')));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const Key('cur-subject-financial-management')));
      await tester.tap(find.byKey(const Key('cur-subject-financial-management')));
      await tester.pumpAndSettle();
      expect(find.text('MBA · Sem 2 · Financial Management'), findsOneWidget);
      expect((await SharedPreferences.getInstance()).getString('setting.curriculum'), 'mba/financial-management');

      // The next start opens on it.
      await tester.pumpWidget(const SizedBox());
      board.dispose();
      board = await pump(tester, const Size(1920, 1080), skip: false);
      expect(find.byKey(const Key('curriculum-picker')), findsOneWidget);
      expect(find.byKey(const Key('cur-subject-financial-management')), findsOneWidget);
      await tester.tap(find.byKey(const Key('cur-close')));
      await tester.pumpAndSettle();
      await skipVideos(tester);
      expect(find.text('MBA · Sem 2 · Financial Management'), findsOneWidget);
      expect(tester.takeException(), isNull);
      board.dispose();
    });
  });
}
