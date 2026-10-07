import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:kinetix_3d/kinetix_3d.dart' show ModelCatalogue;
import 'package:kinetix_animations/kinetix_animations.dart' show animationById;
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/core/recording/recordings.dart';
import 'package:kinetix_board/demo/demo.dart';
import 'package:kinetix_board/demo/demo_class_switcher.dart';
import 'package:kinetix_board/demo/demo_classes.dart';
import 'package:kinetix_board/demo/demo_server.dart';
import 'package:kinetix_board/features/board/kit/subjects.dart';
import 'package:kinetix_board/main.dart';
import 'package:kinetix_labs/kinetix_labs.dart' show LabCatalogue;
import 'package:shared_preferences/shared_preferences.dart';

import 'package:kinetix_board/features/doc_camera/doc_camera.dart';

import 'support/captions_fakes.dart';
import 'support/layout.dart';
import 'support/recording_fakes.dart';

/// The demo day (lib/demo/demo_classes.dart): UKG to a BSc, each class fully set up.
void main() {
  group('the demo timetable', () {
    test('covers every level, in time order, with a roster, plan, topic, videos and a bank', () {
      final ids = DemoClasses.all.map((c) => c.id).toList();
      expect(ids, containsAll(['bcom3a', 'bca1b', 'bba2a', 'bscfor3', 'cbse10', 'puc2', 'ukg']));
      final times = DemoClasses.all.map((c) => c.startsAt).toList();
      expect(times, [...times]..sort());
      for (final c in DemoClasses.all) {
        expect(c.roster.length, greaterThanOrEqualTo(10), reason: c.id);
        expect(c.steps, isNotEmpty, reason: c.id);
        expect(c.steps.fold(0, (a, s) => a + s.minutes), inInclusiveRange(25, 60), reason: c.id);
        expect(c.videos, isNotEmpty, reason: c.id);
        expect(c.quiz, hasLength(3), reason: c.id);
        for (final q in c.quiz) {
          expect(q.answer, inInclusiveRange(0, q.options.length - 1), reason: '${c.id}: ${q.q}');
        }
      }
    });

    test('every lab, 3D model and animation picked for a class exists', () {
      for (final c in DemoClasses.all) {
        for (final id in c.labs) {
          expect(LabCatalogue.byId(id), isNotNull, reason: '${c.id} lab $id');
        }
        for (final id in c.models) {
          expect(ModelCatalogue.byId(id), isNotNull, reason: '${c.id} model $id');
        }
        for (final id in c.animations) {
          expect(animationById(id), isNotNull, reason: '${c.id} animation $id');
        }
      }
    });

    test('each class opens the right subject kit; only UKG is a primary class', () {
      final subjects = {for (final c in DemoClasses.all) c.id: subjectOf(c.subject)};
      expect(subjects, {
        'cbse10': Subject.science,
        'bscfor3': Subject.chemistry,
        'bcom3a': Subject.commerce,
        'bca1b': Subject.computer,
        'bba2a': Subject.management,
        'puc2': Subject.physics,
        'ukg': Subject.english,
      });
      for (final c in DemoClasses.all) {
        final server = DemoBoardServer()..switchTo(c.id);
        expect(isPrimaryClass(server.session()), c.id == 'ukg', reason: c.id);
        if (c.kitTab != null && c.kitTab != KitTab.stars) {
          expect(styleOf(c.subject).tabs, contains(c.kitTab), reason: c.id);
        }
      }
    });

    test('the demo server answers for the class that is open', () async {
      final server = DemoBoardServer()..switchTo('puc2');
      Future<dynamic> get(String path) async {
        final r = await server.client.get(Uri.parse('$demoServerUrl$path'), headers: {'Authorization': 'Bearer ${DemoBoardServer.sessionToken}'});
        return jsonDecode(utf8.decode(r.bodyBytes));
      }

      expect((await get('/v1/sessions/current'))['roster'], hasLength(15));
      expect((await get('/v1/content/syllabus'))['chapters'][0]['title'], 'Current Electricity');
      expect((await get('/v1/lesson-plans/current'))['plan']['topics'][0]['title'], "Kirchhoff's laws and the metre bridge");
      expect((await get('/v1/devices/me/concept-videos'))['videos'], hasLength(2));
      final topic = await get('/v1/content/topics/puc2-kirchhoff');
      expect([for (final r in topic['resources']) r['id']], containsAll(['kirchhoff-laws', 'meter-bridge', 'electric_circuit']));
      // The default class answers as it always has.
      server.switchTo('bcom3a');
      expect((await get('/v1/content/syllabus'))['title'], 'Corporate Accounting, BCom Semester 3');
      expect(http.Client, isNotNull);
    });
  });

  group('the class switcher', () {
    setUp(() {
      Demo.enabled = true;
      SharedPreferences.setMockInitialValues({});
    });
    tearDown(() => Demo.enabled = false);

    Future<BoardController> pump(WidgetTester tester, Size size) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final server = DemoBoardServer(claimDelay: const Duration(seconds: 2));
      final store = MemoryRecordingStore();
      final board = demoBoard(server, recordings: Recordings(store: store, voice: () => FakeVoiceRecorder(store: store)));
      await tester.pumpWidget(KinetixBoardApp(controller: board));
      await tester.pumpAndSettle();
      await skipVideos(tester);
      return board;
    }

    Future<void> pickClass(WidgetTester tester, String id) async {
      final chip = find.byKey(const Key('demoChip'));
      await tester.ensureVisible(chip);
      await tester.pumpAndSettle();
      await tester.tap(chip);
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('demo-class-switcher')), findsOneWidget);
      final tile = find.byKey(Key('demo-class-$id'));
      await tester.scrollUntilVisible(tile, 80, scrollable: find.descendant(of: find.byKey(const Key('demo-class-switcher')), matching: find.byType(Scrollable)).first);
      await Scrollable.ensureVisible(tester.element(tile), alignment: 0.5);
      await tester.pumpAndSettle();
      await tester.tap(tile);
      await tester.pumpAndSettle();
      await skipVideos(tester);
    }

    for (final size in const [Size(1920, 1080), Size(390, 844)]) {
      testWidgets('switches between UKG and II PUC at ${size.width.toInt()}×${size.height.toInt()}', (tester) async {
        final board = await pump(tester, size);
        expect(board.primaryMode, isFalse);

        await pickClass(tester, 'ukg');
        expect(board.session?.sectionName, 'UKG A');
        expect(board.primaryMode, isTrue, reason: 'primary mode switches on for UKG');
        expect(board.roster, hasLength(12));
        expect(find.byKey(const Key('demo-class-panel')), findsOneWidget);
        expect(find.text('Letters and numbers › Letters A to E and numbers 1 to 5'), findsOneWidget);
        expect(DemoClassSwitcher.current?.id, 'ukg');

        // The panel's "Start with" opens letter tracing.
        await tester.ensureVisible(find.byKey(const Key('demo-class-primary')));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const Key('demo-class-primary')));
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('primary-panel')), findsOneWidget);
        expect(find.byKey(const Key('trace-pad')), findsOneWidget);
        expect(tester.takeException(), isNull);

        await pickClass(tester, 'puc2');
        expect(board.session?.subjectName, 'Physics');
        expect(board.primaryMode, isFalse);
        expect(board.roster, hasLength(15));
        // The labs, model, sims and animation picked for the lesson, one tap each.
        for (final key in ['demo-res-lab-kirchhoff-laws', 'demo-res-lab-meter-bridge', 'demo-res-model-electric_circuit', 'demo-res-phet-circuit-construction-kit-dc', 'demo-res-anim-electric-circuit']) {
          expect(find.byKey(Key(key)), findsOneWidget, reason: key);
        }
        expect(tester.takeException(), isNull);
        board.dispose();
      });
    }

    testWidgets('the tools drawer has the extras; Camera and Web are split panel tabs', (tester) async {
      DocCameraSource.create = () => FakeDocCamera();
      addTearDown(() => DocCameraSource.create = PluginDocCamera.new);
      final board = await pump(tester, const Size(1920, 1080));
      await tapBoard(tester, 'tool-tools');
      for (final id in ['demo-classes', 'tracing', 'language-kit', 'safe-web', 'live-captions', 'seating-chart', 'group-maker', 'magnifier', 'teacher-notes', 'exit-ticket', 'worksheet', 'organisers', 'exam-clock']) {
        expect(find.byKey(Key('drawer-$id')), findsOneWidget, reason: id);
      }
      await tapBoard(tester, 'drawer-doc-camera');
      expect(find.byKey(const Key('doccam-panel')), findsOneWidget);
      expect(tester.widget<ChoiceChip>(find.byKey(const Key('panel-tab-camera'))).selected, isTrue);
      await tapBoard(tester, 'panel-tab-web');
      expect(find.byKey(const Key('safeweb-panel')), findsOneWidget);
      await openTool(tester, 'teacher-notes');
      expect(find.byKey(const Key('teacher-notes')), findsOneWidget);
      board.dispose();
    });

    testWidgets('a resource chip opens it in the split panel', (tester) async {
      final board = await pump(tester, const Size(1920, 1080));
      await pickClass(tester, 'cbse10');
      await tester.ensureVisible(find.byKey(const Key('demo-res-lab-glass-slab')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('demo-res-lab-glass-slab')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('panel-tab-labs')), findsOneWidget);
      final chip = tester.widget<ChoiceChip>(find.byKey(const Key('panel-tab-labs')));
      expect(chip.selected, isTrue);
      board.dispose();
    });
  });
}

/// The period's concept videos are suggested when a class opens (concept_videos_test.dart).
Future<void> skipVideos(WidgetTester tester) async {
  final skip = find.byKey(const Key('conceptVideoSkip'));
  if (skip.evaluate().isNotEmpty) {
    await tester.tap(skip);
    await tester.pumpAndSettle();
  }
}
