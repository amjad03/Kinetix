// The board's content in Hindi and Kannada: the Simulations hub (titles and descriptions of
// every sim), PhET's titles, the native sims' own words, the most-taught key dates and the
// dictionary's Hindi and Kannada words, each saying plainly when only English is there.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zynetix_board/features/board/kit/key_dates_data.dart';
import 'package:zynetix_board/features/board/kit/key_dates_panel.dart';
import 'package:zynetix_board/features/language_kit/dictionary_data.dart';
import 'package:zynetix_board/core/board_controller.dart';
import 'package:zynetix_board/features/language_kit/language_data.dart';
import 'package:zynetix_board/features/language_kit/language_kit.dart';
import 'package:zynetix_ink/zynetix_ink.dart' show WhiteboardController;
import 'package:zynetix_board/features/sim_hub/native/native_strings.dart';
import 'package:zynetix_board/features/sim_hub/native/other_sims.dart';
import 'package:zynetix_board/features/sim_hub/native/psych_tests.dart';
import 'package:zynetix_board/features/sim_hub/sim_entry.dart';
import 'package:zynetix_board/features/sim_hub/sim_hub_panel.dart';
import 'package:zynetix_board/features/sim_hub/sim_text.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/fake_cloud.dart';

final devanagari = RegExp(r'[ऀ-ॿ]'), kannada = RegExp(r'[ಀ-೿]');

/// Indian scripts other than the one a line should be in (a machine translation that slipped).
final otherScripts = {
  'hi': RegExp(r'[ঀ-෿]'),
  'kn': RegExp(r'[ऀ-౿ഀ-෿]'),
};

void expectScript(String text, String lang, String reason) {
  expect(text, contains(lang == 'hi' ? devanagari : kannada), reason: reason);
  expect(text, isNot(contains(otherScripts[lang]!)), reason: reason);
}

Widget host(String lang, Widget child) => localized(lang, Scaffold(body: SizedBox(width: 900, height: 700, child: child)));

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('Simulations hub', () {
    test('every sim has its title and a description in Hindi and Kannada', () {
      for (final e in simCatalogue) {
        expect(e.descriptionIn('en'), isNotEmpty, reason: e.id);
        for (final lang in ['hi', 'kn']) {
          expectScript(e.titleIn(lang), lang, '${e.id} title $lang');
          expectScript(e.descriptionIn(lang), lang, '${e.id} description $lang');
        }
      }
      expect(simTitles.keys.toSet(), containsAll(simCatalogue.map((e) => e.id)));
    });

    test('a Hindi or Kannada word finds the sim', () {
      final hi = simTitles['phet-projectile-motion']!['hi']!.replaceFirst('PhET: ', '');
      expect(filterSims(query: hi).map((e) => e.id), contains('phet-projectile-motion'));
      final kn = simDescriptions['pebl-reaction']!['kn']!.split(' ').first;
      expect(filterSims(query: kn).map((e) => e.id), contains('pebl-reaction'));
    });

    testWidgets('the list shows each sim in the board language with what it does', (tester) async {
      for (final lang in ['hi', 'kn']) {
        final c = SimHubController();
        await tester.pumpWidget(host(lang, SimHubPanel(key: ValueKey(lang), controller: c, page: () => 0)));
        await tester.pumpAndSettle();
        await tester.enterText(find.byKey(const Key('hub-search')), 'stroop');
        await tester.pumpAndSettle();
        final e = simById('pebl-stroop')!;
        expect(find.text(e.titleIn(lang)), findsOneWidget, reason: lang);
        expect(find.textContaining(e.descriptionIn(lang)), findsOneWidget, reason: lang);
        await tester.tap(find.byKey(const Key('sim-pebl-stroop')));
        await tester.pumpAndSettle();
        expect(tester.widget<Text>(find.byKey(const Key('hub-title'))).data, e.titleIn(lang));
      }
    });

    test("PhET's catalogue has every title in Hindi and Kannada", () {
      final cat = jsonDecode(File('assets/phet/catalogue.json').readAsStringSync()) as Map<String, dynamic>;
      for (final s in (cat['sims'] as List).cast<Map<String, dynamic>>()) {
        final title = (s['title'] as Map).cast<String, String>();
        expectScript(title['hi'] ?? '', 'hi', '${s['id']} hi');
        expectScript(title['kn'] ?? '', 'kn', '${s['id']} kn');
      }
    });
  });

  group('native sims', () {
    test('every string is in Hindi and Kannada with the same placeholders', () {
      Set<String> holes(String s) => RegExp(r'\{(\w+)\}').allMatches(s).map((m) => m[1]!).toSet();
      final en = nativeSimStringTable['en']!;
      for (final lang in ['hi', 'kn']) {
        final t = nativeSimStringTable[lang]!;
        expect(t.keys.toSet(), en.keys.toSet(), reason: lang);
        for (final k in en.keys) {
          expect(holes(t[k]!), holes(en[k]!), reason: '$lang $k');
          expectScript(t[k]!, lang, '$lang $k');
        }
      }
      expect(NativeSimStrings('kn').place('Bengaluru'), 'ಬೆಂಗಳೂರು');
      expect(NativeSimStrings('hi').place('New Delhi'), 'नई दिल्ली');
      expect(NativeSimStrings('en').f('quizWrong', {'a': 120, 'b': 'Pune'}), 'Not quite, 120 km away. The red pin is Pune');
    });

    testWidgets('Stroop asks in Hindi with Hindi colour words and scores in Hindi', (tester) async {
      await tester.pumpWidget(host('hi', const StroopTest(trials: 2)));
      for (var i = 0; i < 2; i++) {
        final word = tester.widget<Text>(find.byKey(const Key('stroop-word')));
        expect(['लाल', 'हरा', 'नीला', 'पीला'], contains(word.data));
        final ink = stroopColors.entries.firstWhere((e) => e.value == word.style!.color).key;
        await tester.tap(find.byKey(Key('stroop-$ink')));
        await tester.pump();
      }
      expect(find.text('सही: 2 में से 2'), findsOneWidget);
      expect(find.text('फिर से करें'), findsOneWidget);
    });

    testWidgets('reaction time, memory span and the money model in Kannada', (tester) async {
      await tester.pumpWidget(host('kn', const ReactionTest(rounds: 1, minWait: Duration(milliseconds: 10), maxWait: Duration(milliseconds: 11))));
      expect(find.text('ಆರಂಭಿಸಲು ಟ್ಯಾಪ್ ಮಾಡಿ. 1 ರಲ್ಲಿ 1ನೇ ಸುತ್ತು'), findsOneWidget);
      await tester.tap(find.byKey(const Key('reaction-area')));
      await tester.pump();
      expect(find.text('ಹಸಿರಿಗಾಗಿ ಕಾಯಿರಿ...'), findsOneWidget);
      await tester.pump(const Duration(milliseconds: 20));
      expect(find.text('ಈಗ ಟ್ಯಾಪ್ ಮಾಡಿ'), findsOneWidget);
      await tester.tap(find.byKey(const Key('reaction-area')));
      await tester.pump();
      expect(find.textContaining('ಸರಾಸರಿ ಪ್ರತಿಕ್ರಿಯಾ ಸಮಯ'), findsOneWidget);

      await tester.pumpWidget(host('kn', const MacroMoneySim()));
      expect(find.text('ಹಣ ಗುಣಕ: 10.0'), findsOneWidget);
      expect(find.text('ಠೇವಣಿ'), findsOneWidget);

      await tester.pumpWidget(host('kn', const MemorySpanTest(flash: Duration(milliseconds: 10), start: 1)));
      expect(find.text('ಅಂಕಿಗಳನ್ನು ನೆನಪಿಡಿ (1)'), findsOneWidget);
      await tester.pump(const Duration(milliseconds: 30));
      expect(find.text('ಪರಿಶೀಲಿಸಿ'), findsOneWidget);
    });

    testWidgets('grammar check says in Hindi that it needs internet', (tester) async {
      await tester.pumpWidget(host('hi', const GrammarCheck()));
      expect(find.textContaining('api.languagetool.org'), findsOneWidget);
      expect(find.text('जाँचें'), findsOneWidget);
    });
  });

  group('key dates', () {
    final data = KeyDatesData.parse(File('assets/history/key_dates.tsv').readAsStringSync(), File('assets/history/key_dates_hi_kn.tsv').readAsStringSync());

    test('the 300 most-taught events are in Hindi and Kannada; the rest stay in English', () {
      final translated = data.events.where((e) => e.hi != null && e.kn != null).toList();
      expect(translated.length, greaterThanOrEqualTo(300));
      for (final e in translated) {
        expectScript(e.hi!, 'hi', e.text);
        expectScript(e.kn!, 'kn', e.text);
      }
      // Every line of the translations belongs to an event.
      final texts = {for (final e in data.events) e.text};
      for (final line in File('assets/history/key_dates_hi_kn.tsv').readAsLinesSync().where((l) => l.trim().isNotEmpty)) {
        expect(texts, contains(line.split('\t').first));
      }
      final rest = data.events.firstWhere((e) => e.hi == null);
      expect(rest.textIn('hi'), rest.text);
      expect(rest.hasLanguage('hi'), isFalse);
    });

    test('dates in Hindi and Kannada; search in any language', () {
      final independence = data.events.firstWhere((e) => e.text.startsWith('India becomes independent'));
      expect(independence.whenIn('hi'), '15 अगस्त 1947');
      expect(independence.whenIn('kn'), '15 ಆಗಸ್ಟ್ 1947');
      expectScript(independence.textIn('hi'), 'hi', 'independence');
      final kalinga = data.events.firstWhere((e) => e.text.startsWith('Kalinga war'));
      expect(kalinga.whenIn('hi'), '261 ई.पू.');
      expect(kalinga.whenIn('kn'), 'ಕ್ರಿ.ಪೂ. 261');
      expect(data.search(query: kalinga.kn!.split(' ').first).map((e) => e.text), contains(kalinga.text));
      expect(data.search(query: 'ई.पू.').length, greaterThan(10));
    });

    testWidgets('the panel shows Hindi lines and says the others are in English', (tester) async {
      KeyDatesData.override(KeyDatesData([
        const HistoryEvent(year: 1947, month: 8, day: 15, region: 'india', topic: 'history', text: 'India becomes independent', hi: 'भारत स्वतंत्र हुआ', kn: 'ಭಾರತ ಸ್ವತಂತ್ರವಾಯಿತು'),
        const HistoryEvent(year: 1950, month: 1, day: 26, region: 'india', topic: 'history', text: 'A line with no translation'),
      ]));
      addTearDown(() => KeyDatesData.override(null));
      await tester.pumpWidget(host('hi', KeyDatesPanel(onDraw: (_) {})));
      await tester.pumpAndSettle();
      expect(find.text('भारत स्वतंत्र हुआ'), findsOneWidget);
      expect(find.text('15 अगस्त 1947'), findsOneWidget);
      expect(find.text('A line with no translation'), findsOneWidget);
      expect(find.byKey(const Key('dates-english-note')), findsOneWidget);
      await tester.pumpWidget(host('en', KeyDatesPanel(key: const ValueKey('en'), onDraw: (_) {})));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('dates-english-note')), findsNothing);
    });
  });

  group('dictionary', () {
    final dict = OfflineDictionary.parse(File('assets/dictionary/wordnet.tsv').readAsStringSync(), File('assets/dictionary/hi_kn.tsv').readAsStringSync());

    test('every word with Hindi and Kannada is in the dictionary with them, WordNet entries kept', () {
      final words = {
        for (final l in File('assets/dictionary/hi_kn.tsv').readAsLinesSync()) if (l.contains('\t')) l.split('\t').first,
        for (final w in basicWords) w.en,
      };
      expect(words.length, greaterThan(280));
      for (final w in words) {
        final e = dict.lookup(w);
        expect(e, isNotNull, reason: w);
        expectScript(e!.hi ?? '', 'hi', w);
        expectScript(e.kn ?? '', 'kn', w);
        expect(e.senses.first.gloss, isNotEmpty, reason: w);
      }
      expect(dict.lookup('mountain')!.senses.first.gloss, contains('higher than a hill'));
      expect(dict.lookup('abandon')!.senses.length, greaterThan(1), reason: 'WordNet entries stay');
      expect(dict.entries.length, greaterThan(9000));
    });

    testWidgets('a Hindi board shows the Hindi meaning first, and says when there is only English', (tester) async {
      OfflineDictionary.override(dict);
      addTearDown(() => OfflineDictionary.override(null));
      for (final lang in ['hi', 'kn', 'en']) {
        final wb = WhiteboardController();
        addTearDown(wb.dispose);
        await tester.pumpWidget(host(lang, LanguageKitPanel(key: ValueKey(lang), board: BoardController(), wb: wb)));
        await tester.pumpAndSettle();
        await tester.enterText(find.byKey(const Key('dictionary-search')), 'mountain');
        await tester.pumpAndSettle();
        final hi = find.byKey(const Key('dictionary-hi-mountain')), kn = find.byKey(const Key('dictionary-kn-mountain'));
        expect(hi, findsOneWidget, reason: lang);
        expect(kn, findsOneWidget, reason: lang);
        expect(find.byKey(const Key('dictionary-only-english-mountain')), findsNothing, reason: lang);
        // The board's own language comes first.
        if (lang == 'kn') expect(tester.getTopLeft(kn).dx, lessThan(tester.getTopLeft(hi).dx));
        if (lang == 'hi') {
          expect(tester.getTopLeft(hi).dx, lessThan(tester.getTopLeft(kn).dx));
          expect(find.textContaining('हिंदी में: पर्वत'), findsOneWidget);
        }
        // A WordNet word with no Hindi or Kannada says so in the board's language.
        await tester.enterText(find.byKey(const Key('dictionary-search')), 'abandonment');
        await tester.pumpAndSettle();
        final note = find.byKey(const Key('dictionary-only-english-abandonment'));
        expect(note, findsOneWidget, reason: lang);
        final text = tester.widget<Text>(note).data!;
        if (lang == 'en') expect(text, startsWith('English only'));
        if (lang != 'en') expectScript(text, lang, 'note $lang');
      }
    });
  });
}
