import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/features/search/board_search.dart';
import 'package:kinetix_board/features/search/catalogue_facets.dart';
import 'package:kinetix_board/features/search/formula_browser.dart';
import 'package:kinetix_board/features/search/fuzzy.dart';
import 'package:kinetix_board/features/search/search_index.dart';
import 'package:kinetix_board/features/search/search_strings.dart';

/// The search's ranking: typos forgiven, English, Hindi and Kannada titles, grouped by type.
void main() {
  group('fuzzy matching', () {
    test('normalises case, punctuation and joiners', () {
      expect(normalizeSearch("  Ohm's LAW! "), 'ohm s law');
      expect(normalizeSearch('ಓಮ್‌ನ ನಿಯಮ'), 'ಓಮ್ನ ನಿಯಮ');
      expect(searchWords('Light – Reflection'), ['light', 'reflection']);
    });

    test('edit distance counts swaps as one and gives up early', () {
      expect(editDistance('heart', 'heart'), 0);
      expect(editDistance('hart', 'heart'), 1);
      expect(editDistance('haert', 'heart'), 1);
      expect(editDistance('cylinder', 'cilynder'), 2);
      expect(editDistance('a', 'abcdefgh', max: 2), 3);
    });

    test('exact beats prefix beats typo; short words need to be exact', () {
      final exact = wordScore('lens', 'lens'), prefix = wordScore('len', 'lens'), typo = wordScore('lnes', 'lens');
      expect(exact, greaterThan(prefix));
      expect(prefix, greaterThan(typo));
      expect(typo, greaterThan(0));
      expect(wordScore('ab', 'ac'), 0);
      expect(wordScore('photosynt', 'photosynthesis'), greaterThan(0));
      expect(wordScore('photosinth', 'photosynthesis'), greaterThan(0), reason: 'a typo in an unfinished word');
    });

    test('every word of the query must match', () {
      final t = SearchTarget([const SearchField('Convex lens'), const SearchField('optics', 0.7)]);
      expect(t.score('convex lens'), greaterThan(t.score('lens')));
      expect(t.score('lens optics'), greaterThan(0));
      expect(t.score('lens heart'), 0);
    });
  });

  group('the board index', () {
    final index = SearchIndex([...catalogueSearchItems(), ...formulaSearchItems(), ...simSearchItems(), ...settingsSearchItems()]);

    SearchHit first(String q) => index.search(q).first;

    test('finds models, labs and formulas by name, best first', () {
      expect(first('heart').item.id, 'heart');
      expect(first('human heart').item.kind, SearchKind.model3d);
      expect(index.search("ohm's law").map((h) => h.item.id).take(3), contains('ohms-law'));
      expect(first('cube').item.id, 'solid.cube');
      expect(index.search('pythagoras').map((h) => h.item.kind), containsAll([SearchKind.sim]));
      expect(index.search('quadratic').where((h) => h.item.kind == SearchKind.formula), isNotEmpty);
    });

    test('forgives typos', () {
      expect(first('hart').item.id, 'heart');
      expect(first('cilinder').item.id, 'solid.cylinder');
      expect(index.search('photosynthsis').map((h) => h.item.kind), contains(SearchKind.lab));
      expect(index.search('electrik motor').first.item.id, 'electric_motor');
    });

    test('finds things by their Hindi and Kannada names', () {
      expect(first('हृदय').item.id, 'heart');
      expect(first('ಹೃದಯ').item.id, 'heart');
      expect(first('बेलन').item.id, 'solid.cylinder');
      expect(first('ಶಂಕು').item.id, 'solid.cone');
      // A simulation and a setting, by their names in the board's strings.
      expect(index.search('लोलक').map((h) => h.item.kind), contains(SearchKind.sim));
      expect(index.search('ಭಾಷೆ').map((h) => h.item.id), contains('language'));
    });

    test('groups results by type, the best group first', () {
      final groups = index.grouped('lens');
      expect(groups, isNotEmpty);
      expect({for (final (k, _) in groups) k}.length, groups.length, reason: 'one group per type');
      expect(groups.map((g) => g.$1), contains(SearchKind.lab));
      for (final (_, hits) in groups) {
        for (var i = 1; i < hits.length; i++) {
          expect(hits[i - 1].score, greaterThanOrEqualTo(hits[i].score));
        }
      }
      expect(index.grouped('zzqxv'), isEmpty);
      expect(index.grouped('   '), isEmpty);
    });

    test('subtitles follow the language', () {
      final heart = index.items.firstWhere((i) => i.kind == SearchKind.model3d && i.id == 'heart');
      expect(searchSubtitle(heart, 'en'), 'Biology · Human body');
      expect(searchSubtitle(heart, 'hi'), 'जीव विज्ञान · मानव शरीर');
      expect(heart.titleIn('kn'), 'ಮಾನವ ಹೃದಯ');
    });
  });

  group('formula sheets', () {
    test('chapters and the chapter dropdown', () {
      expect(chaptersOf(FormulaSet.maths), containsAll(['Trigonometry', 'Algebraic identities']));
      expect(chaptersOf(FormulaSet.constants), isEmpty);
      final trig = filterFormulas(FormulaSet.maths, chapter: 'Trigonometry');
      expect(trig, isNotEmpty);
      expect(trig.every((f) => f.chapter == 'Trigonometry'), isTrue);
    });

    test('search within a sheet, typos forgiven; the chapter taught first', () {
      expect(filterFormulas(FormulaSet.physics, query: 'acceleraton').first.name, 'Acceleration');
      expect(filterFormulas(FormulaSet.maths, query: 'qudratic').every((f) => f.chapter == 'Quadratic equations' || f.name.toLowerCase().contains('quadratic')), isTrue);
      expect(filterFormulas(FormulaSet.maths, prefer: 'Class 10 Trigonometry').first.chapter, 'Trigonometry');
      expect(filterFormulas(FormulaSet.maths, chapter: 'Trigonometry', query: 'product rule'), isEmpty);
    });
  });

  test('every search string is in Hindi and Kannada, placeholders kept', () {
    for (final key in SearchStrings.keys) {
      final en = SearchStrings.raw('en', key)!;
      for (final lang in ['hi', 'kn']) {
        final t = SearchStrings.raw(lang, key);
        expect(t, isNotNull, reason: '$lang $key');
        for (final p in RegExp(r'\{\w+\}').allMatches(en)) {
          expect(t, contains(p[0]), reason: '$lang $key');
        }
      }
    }
    for (final s in catalogueSubjects) {
      expect(SearchStrings('kn').subjectName(s), isNot(startsWith('subject_')));
      for (final (c, _) in catalogueCategories[s]!) {
        expect(SearchStrings('hi').categoryName(c), isNot(startsWith('cat_')));
      }
    }
  });
}
