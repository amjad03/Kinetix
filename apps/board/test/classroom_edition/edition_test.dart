import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/classroom_edition/classroom_hooks.dart';
import 'package:kinetix_board/classroom_edition/edition.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/core/models.dart';
import 'package:kinetix_board/features/board/layout/toolbar_layout.dart';
import 'package:kinetix_board/features/board/panel/split_panel.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import '../support/board_fonts.dart';
import 'ce_support.dart';

void main() {
  setUpAll(loadBoardFonts);
  tearDown(() {
    Edition.classroom = Edition.built == 'classroom';
    flowSuggestionsEnabled = true;
  });

  group('the edition switch', () {
    test('KINETIX_EDITION=classroom picks the Classroom edition; the default build is the KINETIX Board', () {
      // `flutter test` runs without the define: the KINETIX Board, AI and all.
      expect(Edition.built, isNot('classroom'));
      expect(Edition.classroom, isFalse);
      expect(Edition.ai, isTrue);
      expect(Edition.appName, 'KINETIX Board');
      Edition.classroom = true;
      expect(Edition.ai, isFalse);
      expect(Edition.appName, 'Zynetix Classroom');
    });

    test('the panel tabs and toolbars follow the edition', () {
      expect([
        for (final t in PanelTab.values)
          if (t.shown) t,
      ], isNot(contains(PanelTab.lessons)));
      expect([
        for (final t in PanelTab.values)
          if (t.shown) t,
      ], contains(PanelTab.ai));
      Edition.classroom = true;
      final tabs = [
        for (final t in PanelTab.values)
          if (t.shown) t,
      ];
      expect(tabs.take(2), [PanelTab.lessons, PanelTab.classTools]);
      expect(tabs, isNot(contains(PanelTab.ai)));
      // Every other tab stays.
      expect(tabs, containsAll([PanelTab.model3d, PanelTab.labs, PanelTab.videos, PanelTab.books, PanelTab.kit, PanelTab.animations, PanelTab.sims, PanelTab.camera, PanelTab.web, PanelTab.cast]));
      expect(ToolbarLayouts.classroomDefaults(simple: true), ['pen', 'colours', 'eraser', 'undo', 'lessons', 'class-tools', 'show-all']);
      expect(ToolbarLayouts.classroomDefaults(simple: false).where((id) => id.contains('ai')), isEmpty);
      expect(ToolbarLayouts.classroomDefaults(simple: false).length, ToolbarLayouts.panelMax);
    });

    test('Android: the Classroom edition is its own app, installed next to the board', () {
      final gradle = File('android/app/build.gradle.kts').readAsStringSync();
      expect(gradle, contains('"in.zynetix.classroom" else "in.kinetix.board"'));
      expect(gradle, contains('"Zynetix Classroom" else "KINETIX Board"'));
      expect(gradle, contains('dartDefines["KINETIX_EDITION"]'));
      final manifest = File('android/app/src/main/AndroidManifest.xml').readAsStringSync();
      expect(manifest, contains(r'android:label="${appLabel}"'));
    });

    testWidgets('the KINETIX Board is unchanged: the enrolment screen, KINETIX AI and the AI pen', (tester) async {
      Edition.classroom = false;
      final board = BoardController()..skipEnrollment();
      await pumpApp(tester, board);
      await settle(tester, 4);
      expect(find.byKey(const Key('panel-ai')), findsOneWidget);
      expect(find.byKey(const Key('tool-ai-pen')), findsOneWidget);
      expect(find.byKey(const Key('ce-colours')), findsNothing);
      expect(find.byKey(const Key('ce-what-now')), findsNothing);
      expect(flowSuggestionsEnabled, isTrue);
      await tester.pumpWidget(const SizedBox());
    });
  });

  group('Put on board and the roster (the seams for Lessons and Class tools)', () {
    testWidgets('text, notes, pictures and widgets go on the page; the pen keeps writing', (tester) async {
      final board = (await tester.runAsync(() => classroomBoard(seed: sampleCollege())))!;
      await pumpApp(tester, board);
      await tapKey(tester, 'ce-start-class');
      await settle(tester, 10);
      expect(flowSuggestionsEnabled, isFalse);
      final wb = tester.widget<WhiteboardCanvas>(find.byType(WhiteboardCanvas).first).controller;
      wb.tool = BoardTool.pen;
      final host = ClassroomHost(board: board, wb: wb, closePanel: () {}, openLessons: () {}, openClassTools: () {}, showMessage: (_) {});

      // The roster: the open class's roll numbers, absentees left out.
      expect(host.currentClass!.name, '1st PUC A');
      expect(host.currentTeacher!.name, 'Lakshmi Rao');
      expect(host.subject, 'Physics');
      expect(host.rolls, hasLength(40));
      board.markAttendance({'roll-4': AttendanceMark.absent, 'roll-9': AttendanceMark.absent});
      expect(host.absentRolls, {4, 9});
      expect(host.presentRolls, hasLength(38));
      expect(host.store.classes, hasLength(5));

      host.putText('Coulomb’s law', fontSize: 48, bold: true);
      host.putNote('Double r → force becomes ¼');
      final png = (await tester.runAsync(() async {
        final rec = ui.PictureRecorder();
        Canvas(rec).drawRect(const Rect.fromLTWH(0, 0, 60, 30), Paint()..color = const Color(0xFFF97316));
        final img = await rec.endRecording().toImage(60, 30);
        return (await img.toByteData(format: ui.ImageByteFormat.png))!.buffer.asUint8List();
      }))!;
      await tester.runAsync(() => host.putImage(png, width: 600, title: 'Two charges'));
      await tester.runAsync(
        () => host.putWidget(
          const ColoredBox(
            color: Color(0xFFFFF4CC),
            child: Center(child: Text('F = k q₁q₂ / r²')),
          ),
          size: const Size(400, 120),
          pixelRatio: 1,
        ),
      );
      await settle(tester, 2);
      final els = wb.elements;
      expect(els.whereType<TextElement>().map((e) => e.text), containsAll(['Coulomb’s law', 'Two charges']));
      expect(els.whereType<NoteElement>().single.text, 'Double r → force becomes ¼');
      final images = els.whereType<ImageElement>().toList();
      expect(images, hasLength(2));
      expect(images.first.rect.size, const Size(600, 300));
      expect(images.last.rect.size, const Size(400, 120));
      expect(_pngSize(images.last.bytes), const Size(400, 120));
      // Nothing is left selected and the pen still writes.
      expect(wb.selection, isEmpty);
      expect(wb.tool, BoardTool.pen);
      // Undo takes back the last thing put on the board.
      wb.undo();
      expect(wb.elements.whereType<ImageElement>(), hasLength(1));
      await closeBoard(tester, board);
    });
  });
}

Size _pngSize(Uint8List png) {
  final d = ByteData.sublistView(png);
  return Size(d.getUint32(16).toDouble(), d.getUint32(20).toDouble());
}
