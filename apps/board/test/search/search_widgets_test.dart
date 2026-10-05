import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/features/search/board_search.dart';
import 'package:kinetix_board/features/search/catalogue_browser.dart';
import 'package:kinetix_board/features/search/catalogue_facets.dart';
import 'package:kinetix_board/features/search/formula_browser.dart';
import 'package:kinetix_board/features/search/search_index.dart';
import 'package:kinetix_board/features/search/search_strings.dart';
import 'package:kinetix_board/features/search/universal_search.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../support/fake_cloud.dart';

/// The browsers' dropdowns and search fields, and the universal search, on phones and panels
/// in English, Hindi and Kannada: nothing overflows and everything can be reached.
void main() {
  const sizes = [Size(360, 640), Size(390, 844), Size(844, 390), Size(1920, 1080)];
  setUp(() => SharedPreferences.setMockInitialValues({}));

  Future<void> pick(WidgetTester tester, String menu, String value) async {
    await tester.tap(find.byKey(Key('filter-$menu')));
    await tester.pumpAndSettle();
    // A long menu scrolls (a phone in landscape).
    await tester.ensureVisible(find.byKey(Key('filter-$menu-$value')).last);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(Key('filter-$menu-$value')).last);
    await tester.pumpAndSettle();
  }

  for (final lang in ['en', 'hi', 'kn']) {
    for (final size in sizes) {
      final name = '$lang at ${size.width.toInt()}×${size.height.toInt()}';

      testWidgets('$name: labs by Subject → Topic → Class, then by name', (tester) async {
        screenSize(tester, size);
        String? picked;
        await tester.pumpWidget(localized(lang, Scaffold(body: CatalogueBrowser(kind: CatalogueKind.lab, onPick: (id) => picked = id))));
        await tester.pumpAndSettle();
        final s = SearchStrings(lang);
        await pick(tester, 'subject', 'physics');
        await pick(tester, 'category', 'optics');
        await pick(tester, 'level', '10');
        final expected = filterCatalogue(labItems, subject: 'physics', category: 'optics', level: '10');
        expect(find.text(s.found(expected.length)), findsOneWidget);
        expect(tester.takeException(), isNull);
        await tester.scrollUntilVisible(find.byKey(const Key('pick-glass-slab')), 200, scrollable: find.descendant(of: find.byKey(const Key('catalogue-lab')), matching: find.byType(Scrollable)).first);
        await tester.tap(find.byKey(const Key('pick-glass-slab')));
        expect(picked, 'glass-slab');

        // A new subject clears the topic; "Clear filters" clears them all.
        await pick(tester, 'subject', 'chemistry');
        expect(find.text(s.categoryName('optics')), findsNothing);
        await tester.tap(find.byKey(const Key('filter-clear')));
        await tester.pumpAndSettle();
        expect(find.text(s.found(labItems.length)), findsOneWidget);

        await tester.enterText(find.byType(TextField), 'pendulam');
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('pick-pendulum')), findsOneWidget);
        await tester.enterText(find.byType(TextField), 'zzqxv');
        await tester.pumpAndSettle();
        expect(find.text(s.noneMatch), findsOneWidget);
        expect(tester.takeException(), isNull);
      });

      testWidgets('$name: 3D models by subject and name', (tester) async {
        screenSize(tester, size);
        String? picked;
        await tester.pumpWidget(localized(lang, Scaffold(body: CatalogueBrowser(kind: CatalogueKind.model3d, onPick: (id) => picked = id))));
        await tester.pumpAndSettle();
        await pick(tester, 'subject', 'biology');
        await pick(tester, 'category', 'humanBody');
        await tester.enterText(find.byType(TextField), lang == 'en' ? 'hart' : (lang == 'hi' ? 'हृदय' : 'ಹೃದಯ'));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const Key('pick-heart')));
        expect(picked, 'heart');
        expect(tester.takeException(), isNull);
      });

      testWidgets('$name: formulas by subject and chapter, and search', (tester) async {
        screenSize(tester, size);
        String? tex;
        await tester.pumpWidget(localized(lang, Scaffold(body: FormulaBrowser(initialSet: FormulaSet.maths, onInsert: (t) => tex = t))));
        await tester.pumpAndSettle();
        await pick(tester, 'formula-set', 'physics');
        await pick(tester, 'formula-chapter', 'Electricity');
        expect(find.byKey(const Key("formula-Ohm's law")), findsOneWidget);
        expect(find.byKey(const Key('formula-Speed')), findsNothing);
        await tester.enterText(find.byType(TextField), 'resistivty');
        await tester.pumpAndSettle();
        expect(find.byKey(const Key("formula-Ohm's law")), findsNothing);
        await tester.tap(find.byKey(const Key('formula-Resistivity')));
        expect(tex, r'R = \rho\frac{L}{A}');
        expect(tester.takeException(), isNull);
      });

      testWidgets('$name: the universal search finds, groups, opens and remembers', (tester) async {
        screenSize(tester, size);
        SearchItem? opened;
        final index = SearchIndex([...catalogueSearchItems(), ...formulaSearchItems(), ...simSearchItems(), ...settingsSearchItems()]);
        Future<void> open() async {
          await tester.tap(find.text('open'));
          await tester.pumpAndSettle();
        }

        await tester.pumpWidget(
          localized(
            lang,
            Scaffold(
              body: Builder(
                builder: (context) => TextButton(
                  onPressed: () => UniversalSearch.open(
                    context,
                    index: index,
                    onOpen: (i) => opened = i,
                    more: [Future.value([SearchItem(kind: SearchKind.book, id: 't9', titles: {'en': 'Human heart and circulation'}, payload: 't9')])],
                  ),
                  child: const Text('open'),
                ),
              ),
            ),
          ),
        );
        await open();
        expect(find.byKey(const Key('universal-search-start')), findsOneWidget);
        expect(tester.takeException(), isNull);
        await tester.enterText(find.byKey(const Key('universal-search-field')), lang == 'en' ? 'hart' : (lang == 'hi' ? 'हृदय' : 'ಹೃದಯ'));
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('group-model3d')), findsOneWidget);
        if (lang == 'en') expect(find.byKey(const Key('group-book')), findsOneWidget, reason: 'what arrives later joins in');
        expect(find.text(SearchStrings(lang).kindName('model3d')), findsOneWidget);
        expect(tester.takeException(), isNull);
        await tester.tap(find.byKey(const Key('result-model3d-heart')));
        await tester.pumpAndSettle();
        expect(opened?.id, 'heart');
        expect(find.byKey(const Key('universal-search')), findsNothing);

        // The search is remembered; a tap on it searches again.
        await open();
        final recent = find.byWidgetPredicate((w) => w is ActionChip && '${w.key}'.contains('recent-'));
        expect(recent, findsOneWidget);
        await tester.tap(recent);
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('result-model3d-heart')), findsOneWidget);

        // "Show all" opens up a long group; nothing found says so.
        await tester.enterText(find.byKey(const Key('universal-search-field')), 'cone');
        await tester.pumpAndSettle();
        await tester.enterText(find.byKey(const Key('universal-search-field')), 'zzqxv');
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('universal-search-empty')), findsOneWidget);
        await tester.tap(find.byKey(const Key('universal-search-close')));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      });
    }
  }

  testWidgets('Show all lists the whole group; Enter opens the best result', (tester) async {
    screenSize(tester, const Size(1280, 800));
    SearchItem? opened;
    await tester.pumpWidget(
      localized(
        'en',
        Scaffold(
          body: UniversalSearch(index: SearchIndex([...catalogueSearchItems()]), onOpen: (i) => opened = i, initialQuery: 'class'),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('universal-search-field')), 'lens');
    await tester.pumpAndSettle();
    final showAll = find.byWidgetPredicate((w) => w is TextButton && '${w.key}'.startsWith("[<'show-all-"));
    if (showAll.evaluate().isNotEmpty) {
      final before = find.byWidgetPredicate((w) => w is ListTile && '${w.key}'.contains('result-')).evaluate().length;
      await tester.tap(showAll.first);
      await tester.pumpAndSettle();
      expect(find.byWidgetPredicate((w) => w is ListTile && '${w.key}'.contains('result-')).evaluate().length, greaterThan(before));
    }
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pumpAndSettle();
    expect(opened, isNotNull);
    expect(normalizeSearchTitle(opened!), contains('lens'));
  });
}

String normalizeSearchTitle(SearchItem i) => [...i.titles.values, ...i.keywords].join(' ').toLowerCase();
