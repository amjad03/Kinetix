import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/core/models.dart';
import 'package:kinetix_board/core/realtime.dart';
import 'package:kinetix_board/features/ai/voice_input.dart';
import 'package:kinetix_board/features/board/calculator.dart';
import 'package:kinetix_board/features/board/kit/key_dates_data.dart';
import 'package:kinetix_board/features/board/kit/key_dates_panel.dart';
import 'package:kinetix_board/features/board/layout/tool_palette.dart';
import 'package:kinetix_board/features/captions/live_captions.dart';
import 'package:kinetix_board/features/classroom/classroom_tools.dart';
import 'package:kinetix_board/features/classroom_plus/voice_commands.dart';
import 'package:kinetix_board/features/exit_ticket/exit_ticket.dart';
import 'package:kinetix_board/features/language_kit/dictionary_data.dart';
import 'package:kinetix_board/features/language_kit/language_kit.dart';
import 'package:kinetix_board/features/reader/read_aloud.dart';
import 'package:kinetix_board/features/reader/reader_settings.dart';
import 'package:kinetix_board/features/teaching_aids/teaching_aids.dart';
import 'package:kinetix_board/l10n/l10n.dart';
import 'package:kinetix_board/l10n/feature_strings.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/board_fonts.dart';
import 'support/captions_fakes.dart';
import 'support/panel_harness.dart';

/// A reader voice with voices, a pitch and a record of what it was asked.
class _Voice implements ReaderVoice, VoiceChoices {
  final spoken = <(String, String, double)>[];
  @override
  void Function(int start, int end)? onWord;
  @override
  VoidCallback? onDone;
  @override
  String? voiceName;
  @override
  double pitch = 1;
  final pitches = <double>[];
  final names = <String?>[];

  @override
  Future<List<VoiceOption>> voices(String lang) async => [const VoiceOption('en-in-x-a', 'en-IN'), const VoiceOption('en-in-x-b', 'en-IN')];

  @override
  Future<bool> speak(String text, String lang, double rate) async {
    spoken.add((text, lang, rate));
    pitches.add(pitch);
    names.add(voiceName);
    return true;
  }

  @override
  Future<void> stop() async {}
  @override
  void dispose() {}
}

const _wordnet =
    'apple\tnoun|fruit with red or green skin|she ate an apple|pome\n'
    'big\tadjective|large in size||large,great\tadjective|of great importance||\n'
    'read\tverb|look at words and understand them|I read every night|\n';
const _hiKn = 'apple\tसेब\tಸೇಬು\n';

void main() {
  setUpAll(loadBoardFonts);
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('dictionary', () {
    test('finds words by English, Hindi, Kannada, prefix and synonym; has meanings and examples', () {
      final d = OfflineDictionary.parse(_wordnet, _hiKn);
      expect(d.lookup('apple')!.hi, 'सेब');
      expect(d.lookup('apple')!.senses.single.example, 'she ate an apple');
      expect(d.search('सेब').first.word, 'apple');
      expect(d.search('ಸೇಬು').first.word, 'apple');
      expect(d.search('ap').map((e) => e.word), contains('apple'));
      expect(d.search('large').map((e) => e.word), contains('big'), reason: 'by synonym');
      expect(d.lookup('big')!.senses, hasLength(2));
      expect(d.search('zzzz'), isEmpty);
    });

    test('the bundled list is large, offline, and has Hindi and Kannada for common words', () async {
      final tsv = File('assets/dictionary/wordnet.tsv').readAsStringSync();
      final d = OfflineDictionary.parse(tsv, File('assets/dictionary/hi_kn.tsv').readAsStringSync());
      expect(d.entries.length, greaterThan(8000));
      expect(File('assets/dictionary/wordnet.tsv').lengthSync(), lessThan(2 * 1024 * 1024), reason: 'size stays sane');
      for (final w in ['water', 'school', 'teacher', 'mountain', 'photosynthesis'.substring(0, 5)]) {
        expect(d.search(w), isNotEmpty, reason: w);
      }
      expect(d.lookup('water')!.hi, 'पानी');
      expect(d.lookup('water')!.kn, 'ನೀರು');
      expect(d.lookup('teacher')!.senses.first.gloss, isNotEmpty);
      expect(File('assets/dictionary/LICENSE.txt').existsSync(), isTrue);
    });

    testWidgets('the panel looks a word up, shows meaning, Hindi and Kannada, and a synonym opens its own entry', (tester) async {
      OfflineDictionary.override(OfflineDictionary.parse(_wordnet, _hiKn));
      addTearDown(() => OfflineDictionary.override(null));
      ReaderVoice.make = _Voice.new;
      await pumpPanel(
        tester,
        LanguageKitPanel(board: BoardController(), wb: WhiteboardController()),
        size: panelSize,
      );
      await tester.enterText(find.byKey(const Key('dictionary-search')), 'big');
      await tester.pump();
      expect(find.byKey(const Key('dictionary-word-big')), findsOneWidget);
      expect(find.textContaining('large in size'), findsOneWidget);
      await tester.tap(find.byKey(const Key('dictionary-syn-big-large')));
      await tester.pump();
      expect((tester.widget(find.byKey(const Key('dictionary-search'))) as TextField).controller!.text, 'large');
      await tester.enterText(find.byKey(const Key('dictionary-search')), 'apple');
      await tester.pump();
      expect(find.byKey(const Key('dictionary-hi-apple')), findsOneWidget);
      expect(find.text('ಸೇಬು'), findsOneWidget);
      await tester.tap(find.byKey(const Key('dictionary-say-apple')));
      await tester.pump();
      expect(tester.takeException(), isNull);
    });
  });

  group('key dates', () {
    test('the bundled history covers the whole of time, with a day for most and India and world', () {
      final d = KeyDatesData.parse(File('assets/history/key_dates.tsv').readAsStringSync());
      expect(d.events.length, greaterThan(4000));
      expect(d.events.first.year, lessThan(-2000));
      expect(d.events.last.year, greaterThan(2020));
      expect(d.search(region: 'india').length, greaterThan(150));
      expect(d.search(region: 'world', topic: 'science'), isNotEmpty);
      expect(d.search(query: 'plassey').any((e) => e.year == 1757), isTrue);
      expect(d.search(query: 'Plassey').first.era, HistoryEra.early);
      expect(d.onThisDay(8, 15).any((e) => e.year == 1947 && e.region == 'india'), isTrue, reason: 'independence is on 15 August');
      expect(d.onThisDay(1, 26).any((e) => e.year == 1950), isTrue);
      for (final era in HistoryEra.values) {
        expect(d.search(era: era), isNotEmpty, reason: era.name);
      }
      expect(const HistoryEvent(year: -261, month: 0, day: 0, region: 'india', topic: 'history', text: 'x').when, '261 BCE');
      expect(File('assets/history/CREDITS.txt').readAsStringSync(), contains('Attribution-ShareAlike'));
    });

    testWidgets('search, filters, on this day and the timeline', (tester) async {
      KeyDatesData.override(
        KeyDatesData.parse(
          '1947\t8\t15\tindia\thistory\tIndia becomes independent\n1789\t7\t14\tworld\thistory\tFrench Revolution begins\n1687\t7\t5\tworld\tscience\tNewton publishes the Principia\n',
        ),
      );
      addTearDown(() => KeyDatesData.override(null));
      List<(String, String)>? drawn;
      await pumpPanel(
        tester,
        KeyDatesPanel(onDraw: (e) => drawn = e, today: DateTime(2026, 8, 15)),
        size: panelSize,
      );
      expect(find.text('India becomes independent'), findsOneWidget);
      expect(find.text('French Revolution begins'), findsNothing, reason: 'India first');
      await tester.tap(find.byKey(const Key('dates-region-all')));
      await tester.pump();
      expect(find.byKey(const Key('dates-count')).evaluate().isNotEmpty, isTrue);
      await tester.enterText(find.byKey(const Key('dates-search')), 'newton');
      await tester.pump();
      expect(find.text('Newton publishes the Principia'), findsOneWidget);
      expect(find.text('India becomes independent'), findsNothing);
      await tester.enterText(find.byKey(const Key('dates-search')), '');
      await tester.tap(find.byKey(const Key('dates-today')));
      await tester.pump();
      expect(find.text('India becomes independent'), findsOneWidget);
      expect(find.text('Newton publishes the Principia'), findsNothing);
      await tester.tap(find.byType(CheckboxListTile).first);
      await tester.pump();
      await tester.tap(find.byKey(const Key('kit-timeline')));
      await tester.pump();
      expect(drawn, [('15 Aug 1947', 'India becomes independent')]);
    });
  });

  group('immersive reader', () {
    test('syllables: school words split sensibly and the text is unchanged', () {
      expect(syllabify('table'), ['ta', 'ble']);
      expect(syllabify('reading'), ['rea', 'ding']);
      expect(syllabify('teacher'), ['tea', 'cher']);
      expect(syllabify('banana'), ['ba', 'na', 'na']);
      expect(syllabify('cat'), ['cat']);
      expect(syllabify('नमस्ते'), ['नमस्ते']);
      for (final w in ['water', 'beautiful', 'photosynthesis', 'elephant', 'made']) {
        expect(syllabify(w).join(), w);
      }
      const p = 'The teacher is reading a table.';
      final span = readerSpans(p, word: (4, 11), mark: Colors.yellow, onMark: Colors.black, syllables: true, alt: Colors.red);
      expect(span.toPlainText(), p, reason: 'colouring never changes the text, so the voice offsets stay right');
    });

    test('speed, pitch and the chosen voice go to the voice; the language can be forced', () async {
      final v = _Voice();
      final r = ReaderController(['Hello class'], voice: v);
      await r.loadVoices();
      expect(r.voiceList.map((o) => o.name), ['en-in-x-a', 'en-in-x-b']);
      r
        ..setRate(0.7)
        ..setPitch(1.5)
        ..setVoiceName('en-in-x-b');
      await r.play();
      expect(v.spoken.single.$3, 0.7);
      expect(v.pitches.single, 1.5);
      expect(v.names.single, 'en-in-x-b');
      await r.setLanguage('hi-IN');
      await r.pause();
      await r.play();
      expect(v.spoken.last.$2, 'hi-IN');
      r.setSlow(true);
      await r.pause();
      await r.play();
      expect(v.spoken.last.$3, 0.32);
      r.dispose();
    });

    testWidgets('settings: voice, speed, pitch, font, spacing, syllables and extra colour themes', (tester) async {
      final v = _Voice();
      await pumpPanel(
        tester,
        ImmersiveReader(title: 'Read', paragraphs: const ['The teacher reads a table.'], autoplay: false, voice: v),
        size: panelSize,
      );
      expect(find.byKey(const Key('reader-settings-panel')), findsNothing);
      await tester.tap(find.byKey(const Key('reader-settings')));
      await tester.pumpAndSettle();
      for (final k in ['reader-voice', 'reader-rate', 'reader-pitch', 'reader-font', 'reader-letters', 'reader-words', 'reader-lines', 'reader-syllables', 'reader-language', 'reader-test-voice']) {
        expect(find.byKey(Key(k)), findsOneWidget, reason: k);
      }
      await tester.tap(find.byKey(const Key('reader-syllables')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('reader-test-voice')));
      await tester.pump();
      expect(v.spoken, isNotEmpty);
      await tester.tap(find.byKey(const Key('reader-theme')));
      await tester.pumpAndSettle();
      expect(find.text('Yellow on black').evaluate().isNotEmpty, isTrue);
      expect(tester.takeException(), isNull);
    });
  });

  group('live captions', () {
    test('carry on across sentences, silence and a change of language; save as VTT and text', () async {
      final voice = FakeVoiceInput();
      final c = CaptionsController(voice: () => voice, restartDelay: Duration.zero);
      await c.start();
      expect(voice.listens, 1);
      voice.say('Light bends', done: false);
      voice.say('Light bends in glass', done: true);
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(voice.listens, 2, reason: 'listens again after each sentence');
      expect(c.transcript.single.text, 'Light bends in glass');
      await c.setLanguage(AiLanguage.hi);
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(voice.language, AiLanguage.hi);
      expect(voice.listens, 3, reason: 'a new session in the new language');
      voice.say('दूसरा वाक्य', done: true);
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(c.transcript, hasLength(2));
      expect(c.toVtt(), contains('WEBVTT'));
      expect(c.toVtt(), contains('दूसरा वाक्य'));
      expect(c.toText(), contains('Light bends in glass'));
      expect(c.toText(), startsWith('[00:'));
      c.toggleTop();
      expect(c.atTop, isTrue);
      c.resize(100);
      expect(c.fontSize, 72);
      await c.stop();
      expect(c.on, isFalse);
      c.dispose();
    });

    test('silence is not an error: it listens again; a real problem stops it', () async {
      final calls = <void Function(VoiceProblem)>[];
      final c = CaptionsController(voice: () => _Quiet(calls), restartDelay: Duration.zero);
      await c.start();
      calls.last(VoiceProblem.noSpeech);
      await Future<void>.delayed(const Duration(milliseconds: 600));
      expect(calls, hasLength(2));
      expect(c.on, isTrue);
      calls.last(VoiceProblem.language);
      expect(c.on, isFalse);
      expect(c.problem, VoiceProblem.language);
      c.dispose();
    });
  });

  group('voice commands', () {
    test('pen colour, tools, eraser and stop are understood in three languages', () {
      expect(parseVoiceCommand('red pen'), const VoiceCommand(VoiceAction.penColor, color: 'red'));
      expect(parseVoiceCommand('change colour to blue'), const VoiceCommand(VoiceAction.penColor, color: 'blue'));
      expect(parseVoiceCommand('लाल पेन'), const VoiceCommand(VoiceAction.penColor, color: 'red'));
      expect(parseVoiceCommand('ಹಸಿರು ಬಣ್ಣ'), const VoiceCommand(VoiceAction.penColor, color: 'green'));
      expect(parseVoiceCommand('use the pen'), const VoiceCommand(VoiceAction.usePen));
      expect(parseVoiceCommand('eraser'), const VoiceCommand(VoiceAction.useEraser));
      expect(parseVoiceCommand('highlighter'), const VoiceCommand(VoiceAction.useHighlighter));
      expect(parseVoiceCommand('open calculator'), const VoiceCommand(VoiceAction.openTool, tool: 'calculator'));
      expect(parseVoiceCommand('open the dictionary'), const VoiceCommand(VoiceAction.openTool, tool: 'dictionary'));
      expect(parseVoiceCommand('show key dates'), const VoiceCommand(VoiceAction.openTool, tool: 'timeline'));
      expect(parseVoiceCommand('start exit ticket'), const VoiceCommand(VoiceAction.openTool, tool: 'exit-ticket'));
      expect(parseVoiceCommand('कैलकुलेटर खोलो'), const VoiceCommand(VoiceAction.openTool, tool: 'calculator'));
      expect(parseVoiceCommand('ನಿಘಂಟು ತೆರೆಯಿರಿ'), const VoiceCommand(VoiceAction.openTool, tool: 'dictionary'));
      expect(parseVoiceCommand('stop listening'), const VoiceCommand(VoiceAction.stopListening));
      expect(parseVoiceCommand('start a 5 minute timer'), const VoiceCommand(VoiceAction.startTimer, duration: Duration(minutes: 5)), reason: 'timer still wins');
      expect(parseVoiceCommand('what is a red pen made of?'), isNotNull, reason: 'colour + pen is a command; questions without them are not');
      expect(parseVoiceCommand('what is photosynthesis'), isNull);
      for (final (_, action) in voiceGuide) {
        expect(VoiceAction.values, contains(action));
      }
    });

    testWidgets('the dialog lists the commands, keeps listening after one and closes on "stop listening"', (tester) async {
      final voices = <_Capture>[];
      VoiceInput.create = () => _Capture(voices);
      addTearDown(() => VoiceInput.create = SpeechVoiceInput.new);
      final done = <VoiceCommand>[];
      await pumpPanel(
        tester,
        Builder(
          builder: (c) => FilledButton(
            key: const Key('open'),
            onPressed: () => VoiceCommandDialog.open(
              c,
              language: AiLanguage.en,
              run: (cmd) {
                done.add(cmd);
                return true;
              },
            ),
            child: const Text('go'),
          ),
        ),
        size: panelSize,
      );
      await tester.tap(find.byKey(const Key('open')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('voice-commands')), findsOneWidget);
      expect(find.byKey(const Key('voice-guide-guidePenColor')), findsOneWidget);
      voices.last.say('red pen', true);
      await tester.pump();
      expect(done.single, const VoiceCommand(VoiceAction.penColor, color: 'red'));
      expect(find.text('Done: Pen colour: red'), findsOneWidget);
      await tester.pump(const Duration(seconds: 1));
      expect(voices.last.listens, greaterThan(1), reason: 'still listening for the next command');
      voices.last.say('banana', true);
      await tester.pump();
      expect(find.textContaining('Not a command'), findsOneWidget);
      voices.last.say('stop listening', true);
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('voice-commands')), findsNothing);
    });
  });

  group('seating', () {
    test('layouts give every seat a place; U shape and groups have the shape asked for', () {
      for (final l in SeatLayout.values) {
        final slots = seatSlots(l, 24, 6);
        expect(slots, hasLength(24), reason: l.name);
        expect(slots.toSet(), hasLength(24), reason: '${l.name}: no two seats on one spot');
      }
      final pairs = seatSlots(SeatLayout.pairs, 8, 4);
      expect(pairs[2].dx - pairs[1].dx, greaterThan(pairs[1].dx - pairs[0].dx), reason: 'an aisle between pairs');
      final u = seatSlots(SeatLayout.ushape, 12, 4);
      expect(u.where((o) => o.dx == 0), hasLength(4), reason: 'left arm');
      expect(u.map((o) => o.dy).reduce(math.max), 3, reason: 'bottom row');
      final g = seatSlots(SeatLayout.groups, 8, 4);
      expect(g.take(4).map((o) => o.dx).toSet(), hasLength(2), reason: 'four seats around one table');
    });

    test('auto-arrange by random, boys and girls mixed, height and name; kept and restored with the layout', () {
      final names = {'a': 'Asha', 'b': 'Ravi', 'c': 'Meena', 'd': 'Kiran', 'e': 'Zoya', 'f': 'Imran'};
      final info = {
        'a': const SeatInfo(gender: 'f', heightCm: 150),
        'b': const SeatInfo(gender: 'm', heightCm: 160),
        'c': const SeatInfo(gender: 'f', heightCm: 140),
        'd': const SeatInfo(gender: 'm', heightCm: 170),
        'e': const SeatInfo(gender: 'f'),
        'f': const SeatInfo(gender: 'm', heightCm: 155),
      };
      final plan = SeatingPlan.fill(names.keys.toList(), cols: 3);
      plan.arrange(SeatArrange.genderMix, info, names);
      final order = plan.frontToBack.map((i) => plan.seats[i]).toList();
      final genders = [for (final id in order) info[id]!.gender];
      expect(genders, ['m', 'f', 'm', 'f', 'm', 'f']);
      plan.arrange(SeatArrange.heightFront, info, names);
      expect(plan.frontToBack.map((i) => plan.seats[i]).take(3), ['c', 'a', 'f'], reason: 'shortest at the front, no height last');
      expect(plan.seats[plan.frontToBack.last], 'e');
      plan.arrange(SeatArrange.alphabetical, info, names);
      expect(plan.seats.take(2), ['a', 'f']);
      plan.arrange(SeatArrange.random, info, names, math.Random(3));
      expect(plan.seats.whereType<String>().toSet(), names.keys.toSet(), reason: 'nobody lost');
      plan
        ..layout = SeatLayout.custom
        ..custom[1] = const Offset(4.5, 2.25);
      final back = SeatingPlan.decode(plan.encode(), names.keys.toSet())!;
      expect(back.layout, SeatLayout.custom);
      expect(back.custom[1], const Offset(4.5, 2.25));
      expect(back.seats, plan.seats);
      expect(SeatingPlan.decode('2|3|a,b,c,,,|rows', {'a', 'b', 'c'}), isNotNull, reason: 'old saves still load');
    });

    testWidgets('panel: layouts, rows and columns, auto-arrange, student details, save and put on the board', (tester) async {
      final wb = WhiteboardController();
      final shared = <String>[];
      SeatingShare.share = (name, bytes, mime) async => shared.add(name);
      await pumpPanel(
        tester,
        SeatingChartPanel(board: BoardController(), wb: wb, random: math.Random(1)),
        size: panelSize,
      );
      final state = tester.state<SeatingChartPanelState>(find.byType(SeatingChartPanel));
      for (final l in SeatLayout.values) {
        await tester.tap(find.byKey(Key('seating-layout-${l.name}')));
        await tester.pump();
        expect(state.plan.layout, l);
        expect(find.byKey(const Key('seat-0')), findsOneWidget, reason: l.name);
      }
      await tester.tap(find.byKey(const Key('seating-layout-ushape')));
      await tester.pump();
      final rows = state.plan.rows;
      await tester.tap(find.byKey(const Key('seating-rows-plus')));
      await tester.pump();
      expect(state.plan.rows, rows + 1);
      await tester.tap(find.byKey(const Key('seating-layout-rows')));
      await tester.pump();
      // A student's details, then boys and girls mixed.
      await tester.tap(find.byKey(const Key('seat-tap-0')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('seat-gender-f')));
      await tester.enterText(find.byKey(const Key('seat-height')), '142');
      await tester.tap(find.byKey(const Key('seat-info-done')));
      await tester.pumpAndSettle();
      final id = state.plan.seats[0]!;
      expect(state.info[id]!.gender, 'f');
      expect(state.info[id]!.heightCm, 142);
      await tester.tap(find.byKey(const Key('seating-auto')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('seating-auto-heightFront')));
      await tester.pumpAndSettle();
      expect(state.plan.seats.first, id, reason: 'the only student with a height sits at the front');
      await tester.tap(find.byKey(const Key('seating-to-board')));
      await tester.pump();
      expect(wb.elements.whereType<NoteElement>().length, greaterThan(5));
      await tester.runAsync(() async {
        await tester.tap(find.byKey(const Key('seating-save')));
        await Future<void>.delayed(const Duration(milliseconds: 300));
      });
      expect(shared, ['KINETIX seating plan.png']);
      expect(state.listing(), isNotEmpty);
      expect(tester.takeException(), isNull);
    });

    testWidgets('panel fits a phone', (tester) async {
      await pumpPanel(
        tester,
        SeatingChartPanel(board: BoardController(), random: math.Random(1)),
        size: phoneSize,
      );
      await tester.tap(find.byKey(const Key('seating-layout-groups')));
      await tester.pump();
      expect(tester.takeException(), isNull);
    });
  });

  group('graphic organisers', () {
    test('sixteen templates, counts of parts, and editable labels', () {
      const s = FeatureStrings('en', aidStringTable);
      expect(Organiser.values.length, greaterThanOrEqualTo(16));
      for (final o in Organiser.values) {
        expect(organiserElements(o, s, const Color(0xFF000000)), isNotEmpty, reason: o.name);
        final labels = organiserLabels(o, s);
        final range = organiserCount(o);
        if (range != null) {
          final more = organiserLabels(o, s, count: range.$3);
          final fewer = organiserLabels(o, s, count: range.$1);
          expect(more.length, greaterThan(fewer.length), reason: '${o.name} grows with its count');
        }
        // A changed label shows on the board; the others stay.
        final edited = [for (final (i, l) in labels.indexed) i == 0 ? 'EDITED' : l];
        final texts = organiserElements(o, s, const Color(0xFF000000), labels: edited).whereType<TextElement>().map((e) => e.text).toList();
        expect(texts, contains('EDITED'), reason: o.name);
      }
      expect(organiserLabels(Organiser.flow, s, count: 6).where((l) => l.startsWith('Step')), hasLength(6));
      expect(organiserLabels(Organiser.timeline, s, count: 3).where((l) => l == 'Date'), hasLength(3));
      for (final lang in ['hi', 'kn']) {
        expect(organiserLabels(Organiser.swot, FeatureStrings(lang, aidStringTable)), isNot(organiserLabels(Organiser.swot, s)));
      }
    });

    testWidgets('panel: pick, change parts and a label, add to the board', (tester) async {
      final wb = WhiteboardController();
      await pumpPanel(tester, OrganisersPanel(wb: wb), size: panelSize);
      for (final o in Organiser.values) {
        expect(find.byKey(Key('organiser-${o.name}')), findsOneWidget, reason: o.name);
      }
      await tester.tap(find.byKey(const Key('organiser-flow')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('organiser-count-plus')));
      await tester.pump();
      await tester.enterText(find.byKey(const Key('organiser-label-0')), 'Collect');
      await tester.tap(find.byKey(const Key('organiser-add')));
      await tester.pump();
      final texts = wb.elements.whereType<TextElement>().map((e) => e.text).toList();
      expect(texts, contains('Collect'));
      expect(texts.where((t) => t.startsWith('Step')), hasLength(4), reason: '5 steps, the first renamed');
      await tester.tap(find.byKey(const Key('organiser-back')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('organiser-fishbone')), findsOneWidget);
    });
  });

  group('exit ticket', () {
    testWidgets('write questions, run them, answers arrive live, results go on the board', (tester) async {
      final board = BoardController();
      final wb = WhiteboardController();
      await pumpPanel(
        tester,
        ExitTicketPanel(board: board, wb: wb),
        size: panelSize,
      );
      await tester.enterText(find.byKey(const Key('exit-text-0')), 'Which is a noun?');
      await tester.enterText(find.byKey(const Key('exit-option-0-0')), 'run');
      await tester.enterText(find.byKey(const Key('exit-option-0-1')), 'table');
      await tester.tap(find.byKey(const Key('exit-right-0-1')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('exit-add')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('exit-kind-number-1')));
      await tester.pump();
      await tester.enterText(find.byKey(const Key('exit-text-1')), '2 + 3 = ?');
      await tester.enterText(find.byKey(const Key('exit-number-1')), '5');
      await tester.ensureVisible(find.byKey(const Key('exit-start')));
      await tester.tap(find.byKey(const Key('exit-start')));
      await tester.pump();
      expect(find.byKey(const Key('exit-running')), findsOneWidget);
      expect(find.textContaining('Question 1 of 2'), findsOneWidget);
      final state = tester.state<ExitTicketPanelState>(find.byType(ExitTicketPanel));
      expect(state.polls.first.correct, '1');
      expect(state.polls.first.options, ['A', 'B']);
      board.classEvents.add((RealtimeEvents.pollAnswered, {'pollId': state.polls.first.id, 'studentId': 's1', 'answer': '1', 'source': 'app'}));
      board.classEvents.add((RealtimeEvents.pollAnswered, {'pollId': state.polls.first.id, 'studentId': 's2', 'answer': '0', 'source': 'app'}));
      await tester.pump();
      expect(find.byKey(const Key('exit-count-1')), findsOneWidget);
      expect(find.textContaining('2 of'), findsOneWidget);
      await tester.tap(find.byKey(const Key('exit-next')));
      await tester.pump();
      expect(find.textContaining('Question 2 of 2'), findsOneWidget);
      board.classEvents.add((RealtimeEvents.pollAnswered, {'pollId': state.polls.last.id, 'studentId': 's1', 'answer': '5', 'source': 'app'}));
      await tester.pump();
      await tester.tap(find.byKey(const Key('exit-next')));
      await tester.pump();
      expect(find.byKey(const Key('exit-done')), findsOneWidget);
      expect(find.textContaining('50%'), findsOneWidget);
      expect(find.byKey(const Key('exit-save-status')), findsOneWidget, reason: 'says whether the class record kept it');
      await tester.tap(find.byKey(const Key('exit-to-board')));
      await tester.pump();
      expect(wb.elements.whereType<TextElement>().any((e) => e.text.contains('50%')), isTrue);
      expect(tester.takeException(), isNull);
    });

    testWidgets('needs a question; phone fits', (tester) async {
      await pumpPanel(
        tester,
        ExitTicketPanel(board: BoardController(), wb: WhiteboardController()),
        size: phoneSize,
      );
      await tester.ensureVisible(find.byKey(const Key('exit-start')));
      await tester.tap(find.byKey(const Key('exit-start')));
      await tester.pump();
      expect(find.byKey(const Key('exit-error')), findsOneWidget);
    });
  });

  group('calculator', () {
    test('scientific sums: trig in degrees and radians, logs, powers and factorials', () {
      expect(evaluateSum('sin(30)', degrees: true), closeTo(0.5, 1e-9));
      expect(evaluateSum('cos(60)+sin(90)', degrees: true), closeTo(1.5, 1e-9));
      expect(evaluateSum('asin(0.5)', degrees: true), closeTo(30, 1e-9));
      expect(evaluateSum('sin(sin(90))', degrees: true), closeTo(math.sin(math.pi / 180), 1e-9));
      expect(evaluateSum('sin(0)', degrees: false), 0);
      expect(evaluateSum('5!'), 120);
      expect(evaluateSum('0!'), 1);
      expect(evaluateSum('log(1000)'), closeTo(3, 1e-9));
      expect(evaluateSum('ln(e)'), closeTo(1, 1e-9));
      expect(evaluateSum('2^10'), 1024);
      expect(evaluateSum('12+3×4'), 24, reason: 'basic sums unchanged');
      expect(evaluateSum('1÷0'), isNull);
      expect(calcSizeFor(360), CalcSize.phone);
      expect(calcSizeFor(600), CalcSize.tablet);
      expect(calcSizeFor(1500), CalcSize.wide);
    });

    for (final (name, size) in [('phone', const Size(360, 700)), ('tablet', const Size(800, 1000)), ('IFP', const Size(1920, 1080))]) {
      testWidgets('lays out on a $name without overflow, basic and scientific', (tester) async {
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        await tester.pumpWidget(
          MaterialApp(
            theme: ThemeData(useMaterial3: true),
            locale: const Locale('en'),
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            home: const Scaffold(body: BoardCalculator()),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('calc-7')), findsOneWidget);
        expect(find.byKey(const Key('calc-sin(')), findsNothing);
        await tester.tap(find.byKey(const Key('calc-scientific')));
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('calc-sin(')), findsOneWidget);
        for (final k in ['sin(', '3', '0', ')', '=']) {
          await tester.ensureVisible(find.byKey(Key('calc-$k')));
          await tester.tap(find.byKey(Key('calc-$k')));
          await tester.pump();
        }
        expect(find.text('= 0.5'), findsOneWidget, reason: 'sin(30) in degrees');
        // Every key is on screen (reachable) and no key is squeezed to nothing.
        final key = tester.getSize(find.byKey(const Key('calc-7')));
        expect(key.width, greaterThan(40), reason: name);
        expect(tester.takeException(), isNull, reason: name);
      });
    }
  });

  group('tool icon colours', () {
    test('one palette: the tools use only its colours', () {
      expect(ToolPalette.all.toSet(), hasLength(ToolPalette.all.length));
      for (final f in ['lib/features/board/board_screen.dart', 'lib/features/extras/board_extras.dart', 'lib/features/ai/ai_panel.dart']) {
        final lines = File(f).readAsLinesSync();
        for (final (i, l) in lines.indexed) {
          if ((l.contains('DrawerTool(') || l.contains('ChromeTile(')) && l.contains('Color(0x')) fail('$f:${i + 1} uses its own colour: ${l.trim()}');
        }
      }
      final ai = File('lib/features/ai/ai_panel.dart').readAsStringSync();
      expect(RegExp(r'tool\(Icons[^\n]*const Color\(0x').hasMatch(ai), isFalse);
      // The same tool has the same colour wherever it shows.
      expect(RegExp(r"smart-calculator[^\n]*ToolPalette\.maths").hasMatch(ai), isTrue);
      final screen = File('lib/features/board/board_screen.dart').readAsStringSync();
      expect(RegExp(r"DrawerTool\('calculator'[^\n]*\], maths,").hasMatch(screen), isTrue);
    });
  });
}

class _Quiet extends VoiceInput {
  _Quiet(this.problems);
  final List<void Function(VoiceProblem)> problems;

  @override
  Future<bool> listen(AiLanguage language, {required void Function(String words, bool done) onWords, required void Function(VoiceProblem p) onProblem}) async {
    problems.add(onProblem);
    return true;
  }

  @override
  Future<void> stop() async {}
}

class _Capture extends VoiceInput {
  _Capture(List<_Capture> all) {
    all.add(this);
  }
  int listens = 0;
  void Function(String, bool)? _words;

  @override
  Future<bool> listen(AiLanguage language, {required void Function(String words, bool done) onWords, required void Function(VoiceProblem p) onProblem}) async {
    listens++;
    _words = onWords;
    return true;
  }

  void say(String w, bool done) => _words?.call(w, done);

  @override
  Future<void> stop() async {}
}
