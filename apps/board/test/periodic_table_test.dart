import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zynetix_ink/zynetix_ink.dart';
import 'package:zynetix_board/features/board/kit/periodic_data.dart';
import 'package:zynetix_board/features/board/kit/periodic_table.dart';
import 'package:zynetix_board/features/board/kit/subject_data.dart';

import 'support/fake_cloud.dart';

ChemElement el(String symbol) => elements.firstWhere((e) => e.symbol == symbol);

void main() {
  group('element facts', () {
    test('electron configurations follow Aufbau with the known exceptions, as NCERT gives them', () {
      const expected = {
        'H': '1s¹',
        'He': '1s²',
        'Na': '[Ne] 3s¹',
        'Ne': '[He] 2s² 2p⁶',
        'Fe': '[Ar] 3d⁶ 4s²',
        'Cr': '[Ar] 3d⁵ 4s¹',
        'Cu': '[Ar] 3d¹⁰ 4s¹',
        'Br': '[Ar] 3d¹⁰ 4s² 4p⁵',
        'Pd': '[Kr] 4d¹⁰',
        'Ag': '[Kr] 4d¹⁰ 5s¹',
        'La': '[Xe] 5d¹ 6s²',
        'Ce': '[Xe] 4f¹ 5d¹ 6s²',
        'Gd': '[Xe] 4f⁷ 5d¹ 6s²',
        'Lu': '[Xe] 4f¹⁴ 5d¹ 6s²',
        'Pt': '[Xe] 4f¹⁴ 5d⁹ 6s¹',
        'Au': '[Xe] 4f¹⁴ 5d¹⁰ 6s¹',
        'Pb': '[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p²',
        'Th': '[Rn] 6d² 7s²',
        'U': '[Rn] 5f³ 6d¹ 7s²',
        'Lr': '[Rn] 5f¹⁴ 6d¹ 7s²',
        'Og': '[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p⁶',
      };
      for (final e in expected.entries) {
        expect(el(e.key).configuration, e.value, reason: e.key);
      }
    });

    test('shells add up to the atomic number', () {
      expect(el('Fe').shells, [2, 8, 14, 2]);
      expect(el('Au').shells, [2, 8, 18, 32, 18, 1]);
      expect(el('K').shells, [2, 8, 8, 1]);
      for (final e in elements) {
        expect(e.shells.fold(0, (a, b) => a + b), e.z, reason: e.symbol);
      }
    });

    test('blocks: 14 s, 36 p, 40 d and 28 f, as the table is laid out', () {
      final count = <ElementBlock, int>{};
      for (final e in elements) {
        count[e.block] = (count[e.block] ?? 0) + 1;
      }
      expect(count, {ElementBlock.s: 14, ElementBlock.p: 36, ElementBlock.d: 40, ElementBlock.f: 28});
      expect([el('He').block, el('B').block, el('Fe').block, el('La').block, el('Ce').block, el('Lr').block], [ElementBlock.s, ElementBlock.p, ElementBlock.d, ElementBlock.d, ElementBlock.f, ElementBlock.f]);
    });

    test('electronegativity, state, discovery and uses', () {
      final known = elements.where((e) => e.electronegativity != null);
      expect(known.reduce((a, b) => a.electronegativity! > b.electronegativity! ? a : b).symbol, 'F');
      expect([el('He'), el('Ne'), el('Ar')].map((e) => e.electronegativity), everyElement(isNull));
      expect(el('Cs').electronegativity, 0.79);
      expect([for (final e in elements) if (e.state == MatterState.gas) e.symbol], ['H', 'He', 'N', 'O', 'F', 'Ne', 'Cl', 'Ar', 'Kr', 'Xe', 'Rn']);
      expect([for (final e in elements) if (e.state == MatterState.liquid) e.symbol], ['Br', 'Hg']);
      expect(el('Og').state, MatterState.unknown);
      expect([el('C'), el('Fe'), el('Au'), el('Zn')].map((e) => e.discovered), everyElement(0));
      expect(el('O').discovered, 1774);
      expect(el('Og').discovered, 2002);
      for (final e in elements.where((e) => e.discovered != 0)) {
        expect(e.discovered, inInclusiveRange(1250, 2010), reason: e.symbol);
      }
      for (final e in elements) {
        for (final lang in ['en', 'hi', 'kn']) {
          expect(e.usesIn(lang), isNotEmpty, reason: '${e.symbol} $lang');
        }
      }
      expect(el('Th').usesIn('en'), contains('thorium'));
    });

    test('every element is named in Hindi and Kannada, each name its own', () {
      final devanagari = RegExp(r'^[ऀ-ॿ ()]+$'), kannada = RegExp(r'^[ಀ-೿‌‍ ()]+$');
      for (final e in elements) {
        expect(e.nameIn('hi'), matches(devanagari), reason: e.symbol);
        expect(e.nameIn('kn'), matches(kannada), reason: e.symbol);
        expect(e.nameIn('en'), e.name);
      }
      expect({for (final e in elements) e.nameIn('hi')}.length, 118);
      expect({for (final e in elements) e.nameIn('kn')}.length, 118);
      expect(el('Fe').nameIn('hi'), 'आयरन (लोहा)');
      expect(el('O').nameIn('kn'), 'ಆಮ್ಲಜನಕ (ಆಕ್ಸಿಜನ್)');
      // Uses in Hindi and Kannada are in their own script (product names and symbols aside).
      for (final e in elements) {
        expect(e.usesIn('hi'), contains(RegExp(r'[ऀ-ॿ]')), reason: e.symbol);
        expect(e.usesIn('kn'), contains(RegExp(r'[ಀ-೿]')), reason: e.symbol);
        expect(e.usesIn('hi'), isNot(contains(RegExp(r'[ಀ-೿ঀ-৿਀-૿஀-௿ఀ-౿]'))), reason: e.symbol);
        expect(e.usesIn('kn'), isNot(contains(RegExp(r'[ऀ-ॿঀ-৿਀-૿஀-௿ఀ-౿]'))), reason: e.symbol);
      }
    });

    test('search finds an element by symbol, number or name in any language', () {
      List<String> find(String q) => [for (final e in elements) if (e.matches(q)) e.symbol];
      expect(find('Na'), contains('Na'));
      expect(find('26'), ['Fe']);
      expect(find('iron'), ['Fe']);
      expect(find('लोहा'), ['Fe']);
      expect(find('ಕಬ್ಬಿಣ'), ['Fe']);
      expect(find('ऑक्सीजन'), ['O']);
      expect(find('xyz'), isEmpty);
    });
  });

  group('the table', () {
    Future<List<List<BoardElement>>> pump(WidgetTester tester, String lang) async {
      screenSize(tester, const Size(1600, 1200));
      final inserted = <List<BoardElement>>[];
      await tester.pumpWidget(localized(lang, Scaffold(body: SizedBox(width: 1000, child: PeriodicTableView(onInsert: inserted.add, ink: Colors.black, accent: Colors.teal)))));
      await tester.pumpAndSettle();
      return inserted;
    }

    Color cellColour(WidgetTester tester, String symbol) =>
        (tester.widget<Container>(find.descendant(of: find.byKey(Key('element-$symbol')), matching: find.byType(Container)).first).decoration! as BoxDecoration).color!;

    testWidgets('group and period headers, family and block colours with their legends', (tester) async {
      await pump(tester, 'en');
      for (var g = 1; g <= 18; g++) {
        expect(find.byKey(Key('group-$g')), findsOneWidget, reason: 'group $g');
      }
      for (var p = 1; p <= 7; p++) {
        expect(find.byKey(Key('period-$p')), findsOneWidget, reason: 'period $p');
      }
      expect(find.byKey(const Key('periodic-lanthanoids')), findsOneWidget);
      expect(find.byKey(const Key('periodic-actinoids')), findsOneWidget);
      // The group number sits right above the column's first element.
      expect(tester.getCenter(find.byKey(const Key('group-8'))).dx, closeTo(tester.getCenter(find.byKey(const Key('element-Fe'))).dx, 1));
      expect(tester.getCenter(find.byKey(const Key('period-4'))).dy, closeTo(tester.getCenter(find.byKey(const Key('element-K'))).dy, 1));

      expect(cellColour(tester, 'Fe'), periodicFamilyColours[ElementCategory.transition]);
      expect(find.text('Halogen'), findsOneWidget);
      await tester.tap(find.byKey(const Key('periodic-colour-block')));
      await tester.pumpAndSettle();
      expect(cellColour(tester, 'Fe'), periodicBlockColours[ElementBlock.d]);
      expect(cellColour(tester, 'Na'), periodicBlockColours[ElementBlock.s]);
      expect(cellColour(tester, 'Cl'), periodicBlockColours[ElementBlock.p]);
      expect(cellColour(tester, 'U'), periodicBlockColours[ElementBlock.f]);
      for (final b in ['s', 'p', 'd', 'f']) {
        expect(find.text('$b-block'), findsOneWidget, reason: b);
      }
      expect(find.text('Halogen'), findsNothing);
    });

    testWidgets('search marks the matches, dims the rest, and says when nothing matches', (tester) async {
      await pump(tester, 'en');
      await tester.enterText(find.byKey(const Key('periodic-search')), 'iron');
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('periodic-hit-Fe')), findsOneWidget);
      double opacity(String s) => tester.widget<Opacity>(find.descendant(of: find.byKey(Key('element-$s')), matching: find.byType(Opacity))).opacity;
      expect(opacity('Fe'), 1);
      expect(opacity('Na'), lessThan(0.5));
      await tester.enterText(find.byKey(const Key('periodic-search')), 'unobtainium');
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('periodic-no-match')), findsOneWidget);
      await tester.enterText(find.byKey(const Key('periodic-search')), '');
      await tester.pumpAndSettle();
      expect(opacity('Na'), 1);
    });

    testWidgets("an element's sheet has its facts and puts its card and facts on the board", (tester) async {
      final inserted = await pump(tester, 'en');
      await tester.tap(find.byKey(const Key('element-Fe')));
      await tester.pumpAndSettle();
      for (final t in ['26  ·  Iron', '55.845', '8, 4', 'd-block', '[Ar] 3d⁶ 4s²', '2, 8, 14, 2', '1.83', 'Solid', 'Known since ancient times', 'Steel for buildings and machines, haemoglobin in blood']) {
        expect(find.text(t), findsOneWidget, reason: t);
      }
      await tester.tap(find.byKey(const Key('element-card')));
      await tester.pumpAndSettle();
      final card = inserted.single.whereType<TextElement>().map((t) => t.text).toList();
      expect(card, containsAll(['26', 'Fe', 'Iron', '55.845', '[Ar] 3d⁶ 4s²']));

      await tester.tap(find.byKey(const Key('element-O')));
      await tester.pumpAndSettle();
      expect(find.text('Gas'), findsOneWidget);
      expect(find.text('3.44'), findsOneWidget);
      expect(find.byKey(const Key('element-bohr')), findsOneWidget);
      await tester.tap(find.byKey(const Key('element-facts')));
      await tester.pumpAndSettle();
      final facts = (inserted.last.single as TextElement).text;
      expect(facts, contains('Electron configuration: [He] 2s² 2p⁴'));
      expect(facts, contains('Discovered: 1774'));
    });

    testWidgets('in Hindi and Kannada: names, facts and search in the board language', (tester) async {
      await pump(tester, 'hi');
      await tester.enterText(find.byKey(const Key('periodic-search')), 'लोहा');
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('periodic-hit-Fe')), findsOneWidget);
      await tester.tap(find.byKey(const Key('periodic-hit-Fe')));
      await tester.pumpAndSettle();
      expect(find.text('26  ·  आयरन (लोहा)'), findsOneWidget);
      expect(find.text('ठोस'), findsOneWidget);
      expect(find.text('इलेक्ट्रॉनिक विन्यास'), findsOneWidget);
      expect(find.text('प्राचीन काल से ज्ञात'), findsOneWidget);
      await tester.tapAt(const Offset(5, 5));
      await tester.pumpAndSettle();

      await pump(tester, 'kn');
      await tester.tap(find.byKey(const Key('element-O')));
      await tester.pumpAndSettle();
      expect(find.text('8  ·  ಆಮ್ಲಜನಕ (ಆಕ್ಸಿಜನ್)'), findsOneWidget);
      expect(find.text('ಅನಿಲ'), findsOneWidget);
      expect(find.text('ಇಲೆಕ್ಟ್ರಾನ್ ವಿನ್ಯಾಸ'), findsOneWidget);
    });
  });
}
