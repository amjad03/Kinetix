import 'dart:math' as math;

import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/models.dart';
import 'package:kinetix_board/demo/demo_strings.dart';
import 'package:kinetix_board/features/assessment/assessment.dart';
import 'package:kinetix_board/features/captions/live_captions.dart';
import 'package:kinetix_board/features/classroom/classroom_strings.dart';
import 'package:kinetix_board/features/classroom/classroom_tools.dart';
import 'package:kinetix_board/features/doc_camera/doc_camera.dart';
import 'package:kinetix_board/features/extras/board_extras.dart';
import 'package:kinetix_board/features/language_kit/language_kit.dart';
import 'package:kinetix_board/features/offline_ai/offline_ai.dart';
import 'package:kinetix_board/features/primary/primary_strings.dart';
import 'package:kinetix_board/features/primary/tracing.dart';
import 'package:kinetix_board/features/safe_web/safe_web.dart';
import 'package:kinetix_board/features/teaching_aids/teaching_aids.dart';
import 'package:kinetix_board/l10n/feature_strings.dart';
import 'package:flutter/painting.dart' show Color;

import 'support/captions_fakes.dart';

void main() {
  test('every feature string table has each English key in Hindi and Kannada, placeholders kept', () {
    final tables = {
      'demo': demoStringTable,
      'primary': primaryStringTable,
      'docCamera': docCameraStringTable,
      'safeWeb': safeWebStringTable,
      'captions': captionStringTable,
      'classroom': classroomStringTable,
      'assessment': assessmentStringTable,
      'language': languageStringTable,
      'aids': aidStringTable,
      'extras': extrasStringTable,
    };
    for (final MapEntry(key: name, value: t) in tables.entries) {
      final en = t['en']!;
      for (final lang in ['hi', 'kn']) {
        expect(t[lang]!.keys.toSet(), en.keys.toSet(), reason: '$name $lang');
        for (final k in en.keys) {
          expect(t[lang]![k]!.contains('{n}'), en[k]!.contains('{n}'), reason: '$name $lang $k');
          expect(t[lang]![k], isNotEmpty, reason: '$name $lang $k');
        }
      }
    }
    expect(const FeatureStrings('ta', primaryStringTable)['tracing'], 'Letter tracing', reason: 'other languages read English');
  });

  group('assessment generator', () {
    final s = const FeatureStrings('en', assessmentStringTable);
    QuizQuestion q(String text) => QuizQuestion(question: text, options: ['a', 'b', 'c', 'd'], answer: 1, explanation: '');
    AiResult<Quiz> quiz(List<String> qs, {bool offline = false}) => AiResult(Quiz(topic: 't', questions: [for (final x in qs) q(x)]), AiMeta(cached: false, preview: false, offline: offline));

    test('KINETIX AI first when it answers', () async {
      final g = AssessmentGenerator(online: (t, n) async => quiz(['AI 1', 'AI 2', 'AI 3']), offline: (t, n) => quiz(['notes']));
      final r = await g.generate(AssessmentKind.exitTicket, 'Refraction', s);
      expect(r.source, QuestionSource.ai);
      expect(r.questions.where((x) => x.isChoice).map((x) => x.text), ['AI 1', 'AI 2']);
      expect(r.questions.where((x) => x.section == 'R'), hasLength(2));
    });

    test('offline notes when KINETIX AI cannot be reached', () async {
      final g = AssessmentGenerator(online: (t, n) async => throw Exception('offline'), offline: (t, n) => quiz(['notes 1', 'notes 2', 'notes 3', 'notes 4', 'notes 5'], offline: true));
      final r = await g.generate(AssessmentKind.worksheet, 'Refraction', s);
      expect(r.source, QuestionSource.offline);
      expect(r.questions.where((x) => x.section == 'A'), hasLength(5));
      expect(r.questions.where((x) => x.section == 'B'), hasLength(3));
      expect(r.questions.where((x) => x.section == 'C'), hasLength(1));
      expect(r.totalMarks, 5 + 6 + 5);
      expect(r.lines(s), containsAll(['Worksheet: Refraction', s['sectionA'], s['sectionC']]));
    });

    test('a demo build uses the class bank before the demo server', () async {
      var asked = false;
      final g = AssessmentGenerator(
        demo: true,
        online: (t, n) async {
          asked = true;
          return quiz(['demo sample']);
        },
        bank: (t) => [q('bank 1'), q('bank 2'), q('bank 3')],
      );
      final r = await g.generate(AssessmentKind.exitTicket, 'Loops in C', s);
      expect(r.source, QuestionSource.bank);
      expect(asked, isFalse);
    });

    test('a template of open questions when nothing covers the topic', () async {
      final g = AssessmentGenerator(offline: (t, n) => null);
      final r = await g.generate(AssessmentKind.exitTicket, 'Gothic architecture', s);
      expect(r.source, QuestionSource.template);
      expect(r.questions.every((x) => !x.isChoice), isTrue);
      expect(r.questions.first.text, contains('Gothic architecture'));
    });

    test('the board\'s offline notes cover school topics', () async {
      const notes = OfflineAi();
      final g = AssessmentGenerator(offline: (t, n) => notes.quiz(t, count: n));
      final r = await g.generate(AssessmentKind.exitTicket, 'photosynthesis', s);
      expect(r.source, QuestionSource.offline);
    });
  });

  test('groups: everyone once, sizes within one', () {
    final names = [for (var i = 0; i < 23; i++) 'S$i'];
    final groups = makeGroups(names, 5, math.Random(1));
    expect(groups, hasLength(5));
    expect(groups.expand((g) => g).toSet(), names.toSet());
    final sizes = groups.map((g) => g.length);
    expect(sizes.reduce(math.max) - sizes.reduce(math.min), lessThanOrEqualTo(1));
    expect(makeGroups(['A', 'B'], 6), hasLength(2), reason: 'never more groups than students');
  });

  test('seating plan: fill, swap, resize and survive roster changes', () {
    final plan = SeatingPlan.fill(['a', 'b', 'c', 'd', 'e'], cols: 2);
    expect(plan.rows, 3);
    plan.swap(0, 4);
    expect(plan.seats.take(5), ['e', 'b', 'c', 'd', 'a']);
    final back = SeatingPlan.decode(plan.encode(), {'a', 'b', 'c', 'd', 'e', 'f'})!;
    expect(back.seats, contains('f'), reason: 'a new student gets a seat');
    expect(SeatingPlan.decode(plan.encode(), {'a', 'b'})!.seats.whereType<String>().toSet(), {'a', 'b'});
    plan.resize(1, 3);
    expect(plan.seats.whereType<String>(), hasLength(5));
  });

  group('safe web policy', () {
    test('allowed sites and their subdomains only', () {
      expect(SafeWebPolicy.allows('https://kn.wikipedia.org/wiki/ಬೆಂಗಳೂರು'), isTrue);
      expect(SafeWebPolicy.allows('https://ncert.nic.in/textbook.php'), isTrue);
      expect(SafeWebPolicy.allows('https://phet.colorado.edu/en/'), isTrue);
      expect(SafeWebPolicy.allows('https://www.youtube.com/'), isFalse);
      expect(SafeWebPolicy.allows('https://evilwikipedia.org/'), isFalse);
      expect(SafeWebPolicy.allows('file:///etc/passwd'), isFalse);
      expect(SafeWebPolicy.allows('javascript:alert(1)'), isFalse);
    });

    test('the address bar: addresses open, words search', () {
      expect(SafeWebPolicy.resolve('ncert.nic.in').toString(), 'https://ncert.nic.in');
      expect(SafeWebPolicy.resolve('Snell law', lang: 'kn').host, 'kn.wikipedia.org');
      expect(SafeWebPolicy.resolve('fractions', engine: 'khan').host, 'www.khanacademy.org');
      expect(SafeWebPolicy.normaliseHost('https://WWW.Diksha.gov.in/explore'), 'diksha.gov.in');
      expect(SafeWebPolicy.normaliseHost('hello'), isNull);
    });

    test("the institution's list comes from the board config", () async {
      await SafeWebPolicy.applyConfig({
        'allow': ['soundarya.edu.in', 'ncert.nic.in'],
      });
      expect(SafeWebPolicy.allow, ['soundarya.edu.in', 'ncert.nic.in']);
      expect(SafeWebPolicy.fromInstitution, isTrue);
      expect(SafeWebPolicy.allows('https://wikipedia.org'), isFalse);
      await SafeWebPolicy.save(SafeWebPolicy.defaults);
    });
  });

  test('captions: each sentence is a cue, listening again in between; WebVTT out', () async {
    final voice = FakeVoiceInput();
    var t = DateTime(2026, 10, 7, 10);
    final c = CaptionsController(voice: () => voice, now: () => t);
    await c.start();
    t = t.add(const Duration(seconds: 2));
    voice.say('Good morning');
    t = t.add(const Duration(seconds: 2));
    voice.say('Good morning class', done: true);
    await Future<void>.delayed(const Duration(milliseconds: 300));
    expect(voice.listens, 2);
    await c.setLanguage(AiLanguage.kn);
    expect(c.language, AiLanguage.kn);
    final vtt = c.toVtt();
    expect(vtt, startsWith('WEBVTT'));
    expect(vtt, contains('00:00:02.000 --> 00:00:04.000\nGood morning class'));
    await c.stop();
    expect(c.on, isFalse);
  });

  test('tracing: every capital and number has its strokes; other scripts have hints', () {
    for (final l in [...traceLetters[TraceScript.english]!, ...traceLetters[TraceScript.digits]!]) {
      final strokes = strokeOrder[l];
      expect(strokes, isNotNull, reason: l);
      for (final st in strokes!) {
        expect(st.length, greaterThanOrEqualTo(2), reason: l);
        for (final p in st) {
          expect(p.dx, inInclusiveRange(-0.1, 1.1), reason: l);
          expect(p.dy, inInclusiveRange(-0.1, 1.1), reason: l);
        }
      }
    }
    final en = primaryStringTable['en']!;
    expect(traceHint(TraceScript.hindi, en), contains('shirorekha'));
    expect(traceLetters[TraceScript.kannada], contains('ಅ'));
  });

  test('dictionary finds words in English, Hindi and Kannada', () {
    expect(lookUpWords('water').first.kn, 'ನೀರು');
    expect(lookUpWords('पानी').first.en, 'water');
    expect(lookUpWords('ಶಾಲೆ').first.en, 'school');
    expect(lookUpWords(''), isEmpty);
  });

  test('teaching clock and organisers', () {
    expect(clockText(0), '12:00');
    expect(clockText(13 * 60 + 5), '1:05');
    const s = FeatureStrings('en', aidStringTable);
    for (final o in Organiser.values) {
      expect(organiserElements(o, s, const Color(0xFF000000)), isNotEmpty, reason: o.name);
    }
  });
}
