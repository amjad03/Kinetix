import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/core/models.dart';
import 'package:kinetix_board/features/assessment/assessment.dart';
import 'package:kinetix_board/features/captions/live_captions.dart';
import 'package:kinetix_board/features/class_check/ask_dialog.dart';
import 'package:kinetix_board/features/classroom/classroom_tools.dart';
import 'package:kinetix_board/features/doc_camera/doc_camera.dart';
import 'package:kinetix_board/features/language_kit/language_kit.dart';
import 'package:kinetix_board/features/primary/matching.dart';
import 'package:kinetix_board/features/primary/primary_panel.dart';
import 'package:kinetix_board/features/safe_web/safe_web.dart';
import 'package:kinetix_board/features/teaching_aids/teaching_aids.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/board_fonts.dart';
import 'support/captions_fakes.dart';
import 'support/panel_harness.dart';

/// Every new panel at a phone's size and a 1920 × 1080 panel's (test/support/panel_harness.dart).
void main() {
  setUpAll(loadBoardFonts);
  setUp(() => SharedPreferences.setMockInitialValues({}));

  const sizes = [phoneSize, panelSize];
  tearDown(BoardMagnifier.hide);

  /// Taps [key], scrolling it into view first (tabs and buttons scroll on a phone).
  Future<void> tapKey(WidgetTester tester, String key) async {
    await tester.ensureVisible(find.byKey(Key(key)));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(Key(key)));
    await tester.pump();
  }
  String at(Size s) => '${s.width.toInt()}×${s.height.toInt()}';

  for (final size in sizes) {
    group('at ${at(size)}', () {
      testWidgets('primary activities: every tab fits; tracing, counting, shapes, rhymes and stars work', (tester) async {
        final board = BoardController();
        final wb = WhiteboardController();
        final spoken = <String>[];
        await pumpPanel(tester, PrimaryActivitiesPanel(board: board, wb: wb), size: size, spoken: spoken);

        // Tracing: draw on the pad, watch the stroke order, put the letter on the board.
        expect(find.byKey(const Key('trace-hint')), findsOneWidget);
        await tester.drag(find.byKey(const Key('trace-pad')), const Offset(40, 60));
        await tester.pump();
        await tapKey(tester, 'trace-watch');
        await tester.pump(const Duration(seconds: 4));
        await tester.ensureVisible(find.byKey(const Key('trace-board')));
        await tester.tap(find.byKey(const Key('trace-board')));
        await tester.pump();
        expect(wb.background, BoardBackground.fourLine);
        expect(wb.elements.whereType<TextElement>().single.text, 'A');
        await tapKey(tester, 'trace-script-kannada');
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('trace-letter-ಅ')), findsOneWidget);

        // Counting to three.
        await tapKey(tester, 'primary-tab-numbers');
        await tester.pumpAndSettle();
        for (var i = 0; i < 3; i++) {
          await tester.tap(find.byKey(Key('count-item-$i')));
          await tester.pump();
        }
        expect(spoken, containsAllInOrder(['1', '2', '3']));
        expect(find.byKey(const Key('count-done')), findsOneWidget);

        // Shapes and colours say their names.
        await tapKey(tester, 'primary-tab-shapes');
        await tester.pumpAndSettle();
        await tapKey(tester, 'shape-triangle');
        expect(spoken.last, 'Triangle');

        // Rhymes read aloud.
        await tapKey(tester, 'primary-tab-rhymes');
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('rhyme-heading')), findsOneWidget);
        await tapKey(tester, 'rhyme-read');
        expect(spoken.last, startsWith('Twinkle, twinkle'));

        // The star wall (the sample class with no class open).
        await tapKey(tester, 'primary-tab-stars');
        await tester.pumpAndSettle();
        await tapKey(tester, 'star-Aarav Sharma');
        await tester.pump();
        expect(find.textContaining('Aarav Sharma'), findsWidgets);
        expect(find.byKey(const Key('star-wall-top')), findsOneWidget);

        await tapKey(tester, 'primary-tab-matching');
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('match-target-0')), findsOneWidget);
        expect(tester.takeException(), isNull);
      });

      testWidgets('matching game: drag a word onto its picture; the builder adds pairs', (tester) async {
        final key = GlobalKey<MatchingGameState>();
        await pumpPanel(tester, MatchingGame(key: key, random: math.Random(1)), size: size);
        final game = key.currentState!;
        // A wrong drop is marked, a right one locks.
        game.drop(1, 0);
        await tester.pump();
        expect(game.matched, isEmpty);
        final word = find.byKey(const Key('match-word-chip-0'));
        await tester.ensureVisible(word);
        await tester.pumpAndSettle();
        final target = find.byKey(const Key('match-target-0'));
        final drag = await tester.startGesture(tester.getCenter(word));
        await tester.pump(const Duration(milliseconds: 50));
        await drag.moveTo(tester.getCenter(target));
        await tester.pump();
        await drag.up();
        await tester.pumpAndSettle();
        expect(game.matched, {0});
        for (var i = 1; i < game.pairs.length; i++) {
          game.drop(i, i);
        }
        await tester.pump();
        expect(find.byKey(const Key('match-done')), findsOneWidget);

        await tester.tap(find.byKey(const Key('match-edit')));
        await tester.pumpAndSettle();
        await tester.ensureVisible(find.byKey(const Key('match-add')));
        await tester.tap(find.byKey(const Key('match-add')));
        await tester.pumpAndSettle();
        expect(game.pairs, hasLength(6));
        expect(tester.takeException(), isNull);
      });

      testWidgets('document camera: freeze, rotate, zoom, annotate and add to the board', (tester) async {
        final camera = FakeDocCamera();
        DocCameraSource.create = () => camera;
        addTearDown(() => DocCameraSource.create = PluginDocCamera.new);
        final wb = WhiteboardController();
        await pumpPanel(tester, DocCameraPanel(wb: wb), size: size);
        expect(find.byKey(const Key('fake-camera')), findsOneWidget);

        await tapKey(tester, 'doccam-freeze');
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('doccam-frozen')), findsOneWidget);
        await tapKey(tester, 'doccam-rotate');
        await tapKey(tester, 'doccam-annotate');
        await tester.pump();
        await tester.drag(find.byKey(const Key('doccam-ink')), const Offset(60, 20));
        await tester.pump();
        final state = tester.state<DocCameraPanelState>(find.byType(DocCameraPanel));
        expect(state.quarterTurns, 1);
        expect(state.strokes, hasLength(1));
        await tester.drag(find.byKey(const Key('doccam-zoom')), const Offset(60, 0));
        await tester.pump();
        expect(state.zoom, greaterThan(1));

        await tester.runAsync(state.capture);
        await tester.pump();
        expect(wb.elements.whereType<ImageElement>(), hasLength(1));
        expect(tester.takeException(), isNull);
      });

      testWidgets('document camera without a camera says so', (tester) async {
        DocCameraSource.create = () => FakeDocCamera(available: false);
        addTearDown(() => DocCameraSource.create = PluginDocCamera.new);
        await pumpPanel(tester, DocCameraPanel(wb: WhiteboardController()), size: size);
        expect(find.byKey(const Key('doccam-none')), findsOneWidget);
      });

      testWidgets('safe browser: allowed sites, search, blocked sites and the link on the board', (tester) async {
        final wb = WhiteboardController();
        await pumpPanel(tester, SafeBrowserPanel(wb: wb), size: size);
        expect(find.byKey(const Key('safeweb-site-ncert.nic.in')), findsOneWidget);
        expect(find.byKey(const Key('safeweb-site-phet.colorado.edu')), findsOneWidget);

        await tester.enterText(find.byKey(const Key('safeweb-address')), 'facebook.com');
        await tapKey(tester, 'safeweb-go');
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('safeweb-blocked')), findsOneWidget);

        await tester.enterText(find.byKey(const Key('safeweb-address')), 'photosynthesis');
        await tapKey(tester, 'safeweb-go');
        await tester.pumpAndSettle();
        final state = tester.state<SafeBrowserPanelState>(find.byType(SafeBrowserPanel));
        expect(state.url, 'https://en.wikipedia.org/w/index.php?search=photosynthesis');
        // No web view in tests: the page's link goes on the board.
        await tapKey(tester, 'safeweb-add-to-board');
        await tester.pumpAndSettle();
        expect(wb.elements.whereType<NoteElement>().single.text, contains('wikipedia.org'));

        // The allowed sites can be changed (no IT PIN on this board).
        await tapKey(tester, 'safeweb-manage');
        await tester.pumpAndSettle();
        await tester.enterText(find.byKey(const Key('safeweb-add-site')), 'https://www.bangaloreuniversity.ac.in/');
        await tapKey(tester, 'safeweb-add-site-go');
        await tapKey(tester, 'safeweb-sites-done');
        await tester.pumpAndSettle();
        expect(SafeWebPolicy.allow, contains('bangaloreuniversity.ac.in'));
        await SafeWebPolicy.save(SafeWebPolicy.defaults);
        expect(tester.takeException(), isNull);
      });

      testWidgets('live captions show the teacher\'s words and save a transcript', (tester) async {
        final voice = FakeVoiceInput();
        LiveCaptions.controller = CaptionsController(voice: () => voice);
        Uint8List? saved;
        LiveCaptions.share = (name, bytes) async => saved = bytes;
        addTearDown(() => LiveCaptions.controller = null);
        await pumpPanel(
          tester,
          Builder(builder: (c) => Center(child: FilledButton(key: const Key('cc'), onPressed: () => LiveCaptions.toggle(c), child: const Text('CC')))),
          size: size,
        );
        await tester.tap(find.byKey(const Key('cc')));
        await tester.pump();
        expect(find.byKey(const Key('captions-overlay')), findsOneWidget);
        voice.say('Light bends towards the normal');
        await tester.pump();
        expect(find.text('Light bends towards the normal'), findsOneWidget);
        voice.say('Light bends towards the normal in glass', done: true);
        await tester.pump();
        expect(voice.listens, 2, reason: 'listens again after each sentence');
        await tapKey(tester, 'captions-lang-hi');
        await tester.pump();
        expect(LiveCaptions.controller!.language.name, 'hi');
        await tapKey(tester, 'captions-save');
        await tester.pump();
        expect(utf8.decode(saved!), contains('Light bends towards the normal in glass'));
        await tapKey(tester, 'captions-stop');
        await tester.pump();
        expect(find.byKey(const Key('captions-overlay')), findsNothing);
        expect(tester.takeException(), isNull);
      });

      testWidgets('seating chart: drag a student onto another desk to swap; kept for the class', (tester) async {
        final board = BoardController();
        await pumpPanel(tester, SeatingChartPanel(board: board, random: math.Random(2)), size: size);
        final state = tester.state<SeatingChartPanelState>(find.byType(SeatingChartPanel));
        final first = state.plan.seats[0], second = state.plan.seats[1];
        final drag = await tester.startGesture(tester.getCenter(find.byKey(const Key('seat-0'))));
        await tester.pump(const Duration(milliseconds: 400));
        await drag.moveTo(tester.getCenter(find.byKey(const Key('seat-1'))));
        await tester.pump();
        await drag.up();
        await tester.pumpAndSettle();
        expect(state.plan.seats.take(2), [second, first]);
        final prefs = await SharedPreferences.getInstance();
        expect(prefs.getString('kinetix.seating.guest'), state.plan.encode());
        await tapKey(tester, 'seating-cols-plus');
        await tester.pump();
        expect(tester.takeException(), isNull);
      });

      testWidgets('group maker, magnifier and teacher\'s notes', (tester) async {
        final board = BoardController();
        final wb = WhiteboardController();
        await pumpPanel(tester, GroupMakerPanel(board: board, wb: wb, random: math.Random(3)), size: size);
        await tapKey(tester, 'groups-make');
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('group-3')), findsOneWidget);
        await tapKey(tester, 'groups-board');
        expect(wb.elements.whereType<NoteElement>(), hasLength(4));

        await pumpPanel(tester, Builder(builder: (c) => Center(child: TextButton(key: const Key('mag'), onPressed: () => BoardMagnifier.toggle(c), child: const Text('M')))), size: size);
        await tester.tap(find.byKey(const Key('mag')));
        await tester.pump();
        expect(find.byKey(const Key('magnifier')), findsOneWidget);
        await tester.drag(find.byKey(const Key('magnifier')), const Offset(-40, 30));
        await tester.tap(find.byKey(const Key('magnifier-close')));
        await tester.pump();
        expect(find.byKey(const Key('magnifier')), findsNothing);

        await pumpPanel(tester, TeacherNotesPanel(board: board), size: size);
        expect(find.byKey(const Key('teacher-notes-private')), findsOneWidget);
        await tester.enterText(find.byKey(const Key('teacher-notes-text')), 'Check on Ishita: missed the last test');
        await tester.pump(const Duration(seconds: 1));
        final prefs = await SharedPreferences.getInstance();
        expect(prefs.getString('kinetix.teacherNotes.guest.guest'), 'Check on Ishita: missed the last test');
        expect(tester.takeException(), isNull);
      });

      testWidgets('exit ticket: made from the topic, on the board and asked in the Student App', (tester) async {
        final board = BoardController();
        final wb = WhiteboardController();
        final asked = <AskSetup>[];
        final gen = AssessmentGenerator(online: (t, n) async => throw Exception('offline'), offline: (t, n) => null);
        await pumpPanel(
          tester,
          AssessmentPanel(board: board, wb: wb, askClass: (s) async => asked.add(s), generator: gen, initialTopic: 'Photosynthesis'),
          size: size,
        );
        await tapKey(tester, 'assessment-generate');
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('assessment-source-template')), findsOneWidget);
        await tapKey(tester, 'assessment-to-board');
        await tester.pump();
        expect(wb.elements.whereType<TextElement>().first.text, contains('Photosynthesis'));

        // With KINETIX AI's questions, each can be asked as a poll.
        final ai = AssessmentGenerator(
          online: (t, n) async => AiResult(
            Quiz(topic: t, questions: [QuizQuestion(question: 'Where does photosynthesis happen?', options: ['Chloroplast', 'Nucleus', 'Root', 'Stem'], answer: 0, explanation: '')]),
            AiMeta(cached: false, preview: false),
          ),
        );
        await pumpPanel(tester, AssessmentPanel(board: board, wb: wb, askClass: (s) async => asked.add(s), generator: ai, initialTopic: 'Photosynthesis'), size: size);
        await tapKey(tester, 'assessment-generate');
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('assessment-source-ai')), findsOneWidget);
        await tester.ensureVisible(find.byKey(const Key('assessment-ask-0')));
        await tester.tap(find.byKey(const Key('assessment-ask-0')));
        await tester.pump();
        expect(asked.single.options, ['A', 'B', 'C', 'D']);
        expect(asked.single.correct, '0');
        expect(asked.single.question, contains('A) Chloroplast'));

        await tapKey(tester, 'assessment-kind-worksheet');
        await tester.pumpAndSettle();
        await tapKey(tester, 'assessment-generate');
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('assessment-q-4')), findsOneWidget);
        expect(tester.takeException(), isNull);
      });

      testWidgets('language kit: dictionary, card builder, phonics and grammar', (tester) async {
        final board = BoardController();
        final wb = WhiteboardController();
        await pumpPanel(tester, LanguageKitPanel(board: board, wb: wb), size: size);
        await tester.enterText(find.byKey(const Key('dictionary-search')), 'ನೀರು');
        await tester.pump();
        expect(find.byKey(const Key('dictionary-word-water')), findsOneWidget);
        // No class open: KINETIX AI falls back to the offline list.
        await tapKey(tester, 'dictionary-ai');
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('dictionary-ai-answer')), findsOneWidget);
        await tapKey(tester, 'dictionary-card-water');
        await tester.pumpAndSettle();
        expect(find.text('WATER'), findsOneWidget);
        await tester.ensureVisible(find.byKey(const Key('vocab-board')));
        await tester.tap(find.byKey(const Key('vocab-board')));
        await tester.pump();
        expect(wb.elements.whereType<NoteElement>().single.text, startsWith('WATER'));

        await tapKey(tester, 'language-tab-phonics');
        await tester.pumpAndSettle();
        await tapKey(tester, 'phonics-kn');
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('phonics-ಕ')), findsOneWidget);

        await tapKey(tester, 'language-tab-grammar');
        await tester.pumpAndSettle();
        await tapKey(tester, 'grammar-parts');
        await tester.pumpAndSettle();
        await tapKey(tester, 'grammar-board');
        await tester.pump();
        expect(wb.elements.whereType<TextElement>().map((e) => e.text), contains('Interjection'));
        expect(tester.takeException(), isNull);
      });

      testWidgets('teaching aids: organisers, clock, scoreboard and exam clock', (tester) async {
        final wb = WhiteboardController();
        await pumpPanel(tester, OrganisersPanel(wb: wb), size: size);
        await tapKey(tester, 'organiser-kwl');
        await tester.pump();
        expect(wb.elements.whereType<TextElement>().map((e) => e.text), contains('What I Know'));

        await pumpPanel(tester, TeachingClockPanel(random: math.Random(4)), size: size);
        await tapKey(tester, 'clock-random');
        await tester.pump();
        expect(find.text('?'), findsOneWidget);
        await tester.ensureVisible(find.byKey(const Key('clock-show')));
        await tester.tap(find.byKey(const Key('clock-show')));
        await tester.pump();
        expect(find.byKey(const Key('clock-text')), findsOneWidget);

        await pumpPanel(tester, const ScoreboardPanel(), size: size);
        await tapKey(tester, 'score-plus-1');
        await tester.pump();
        expect(find.text('Team 2 leads'), findsOneWidget);

        await pumpPanel(tester, const ExamClockPanel(), size: size);
        await tapKey(tester, 'exam-start');
        await tester.pump(const Duration(seconds: 2));
        expect(find.byKey(const Key('exam-left')), findsOneWidget);
        await tester.ensureVisible(find.byKey(const Key('exam-stop')));
        await tester.tap(find.byKey(const Key('exam-stop')));
        await tester.pump();
        expect(tester.takeException(), isNull);
      });
    });
  }

  testWidgets('primary activities read in Kannada and Hindi', (tester) async {
    await pumpPanel(tester, PrimaryActivitiesPanel(board: BoardController()), lang: 'kn');
    expect(find.text('ಅಕ್ಷರ ತಿದ್ದುವುದು'), findsOneWidget);
    await pumpPanel(tester, PrimaryActivitiesPanel(board: BoardController()), lang: 'hi');
    expect(find.text('अक्षर अनुरेखण'), findsOneWidget);
  });
}
