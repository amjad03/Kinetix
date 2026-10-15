import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zynetix_board/features/teaching_aids/organisers.dart';
import 'package:zynetix_board/features/teaching_aids/teaching_aids.dart' show aidStringTable;
import 'package:zynetix_board/l10n/feature_strings.dart';
import 'package:zynetix_ink/zynetix_ink.dart';

import 'support/panel_harness.dart';

void main() {
  const ink = Color(0xFF000000);
  const s = FeatureStrings('en', aidStringTable);

  List<TextElement> texts(List<BoardElement> els) => els.whereType<TextElement>().toList();

  void expectNoLabelOverlap(Organiser o, List<BoardElement> els) {
    final t = texts(els);
    for (var i = 0; i < t.length; i++) {
      for (var j = i + 1; j < t.length; j++) {
        expect(t[i].bounds.deflate(1).overlaps(t[j].bounds.deflate(1)), isFalse, reason: '${o.name}: "${t[i].text}" / "${t[j].text}"');
      }
    }
  }

  test('every template builds at its smallest, default and largest size, with no labels on top of each other', () {
    for (final o in Organiser.values) {
      final r = organiserCount(o);
      final pg = organiserPerGroup(o);
      for (final c in r == null ? [null] : [r.$1, r.$2, r.$3]) {
        for (final p in pg == null ? [null] : [pg.$1, pg.$3]) {
          final els = organiserElements(o, s, ink, count: c, options: OrganiserOptions(perGroup: p));
          expect(els, isNotEmpty, reason: o.name);
          expectNoLabelOverlap(o, els);
        }
      }
      expect(organiserLabels(o, s), isNotEmpty, reason: o.name);
    }
  });

  test('themes change the fills; labels replace defaults', () {
    final a = organiserElements(Organiser.flow, s, ink, options: const OrganiserOptions(theme: 0)).whereType<Stroke>().first.fill;
    final b = organiserElements(Organiser.flow, s, ink, options: const OrganiserOptions(theme: 2)).whereType<Stroke>().first.fill;
    expect(a, isNot(b));
    final els = organiserElements(Organiser.flow, s, ink, labels: ['One', 'Two']);
    expect(texts(els).map((e) => e.text), containsAll(['One', 'Two']));
  });

  test('cause and effect: many to one and one to many, rows added and removed', () {
    int arrows(List<BoardElement> e) => e.whereType<Stroke>().where((x) => x.shape == ShapeKind.arrow).length;
    final many = organiserElements(Organiser.causeEffect, s, ink, count: 4);
    expect(arrows(many), 4);
    expect(texts(many).where((t) => t.text.startsWith('Cause')), hasLength(4));
    expect(texts(many).where((t) => t.text == 'Effect'), hasLength(1));
    final one = organiserElements(Organiser.causeEffect, s, ink, count: 3, options: const OrganiserOptions(oneToMany: true));
    expect(arrows(one), 3);
    expect(texts(one).where((t) => t.text.startsWith('Effect')), hasLength(3));
    expect(texts(one).where((t) => t.text == 'Cause'), hasLength(1));
    expect(arrows(organiserElements(Organiser.causeEffect, s, ink, count: 1)), 1);
  });

  test('cause or effect marks the chosen answers', () {
    final els = organiserElements(Organiser.causeOrEffect, s, ink, count: 3, options: const OrganiserOptions(picks: [1, 2, 0]));
    final circles = els.whereType<Stroke>().where((x) => x.shape == ShapeKind.circle).toList();
    expect(circles, hasLength(6));
    expect(circles.where((c) => c.fill != null), hasLength(2));
  });

  test('fishbone: categories and causes per category', () {
    final els = organiserElements(Organiser.fishbone, s, ink, count: 5, options: const OrganiserOptions(perGroup: 3));
    expect(texts(els).where((t) => t.text.startsWith('Category')), hasLength(5));
    expect(texts(els).where((t) => t.text.startsWith('Cause')), hasLength(15));
    final custom = organiserElements(Organiser.fishbone, s, ink, count: 2, labels: ['Result', 'People', 'a', 'b', 'Tools']);
    expect(texts(custom).map((t) => t.text), containsAll(['Result', 'People', 'Tools']));
  });

  test('timeline: direction, rows, spacing by date', () {
    final h = organiserElements(Organiser.timeline, s, ink, count: 4);
    final v = organiserElements(Organiser.timeline, s, ink, count: 4, options: const OrganiserOptions(vertical: true));
    final hy = texts(h).map((t) => t.position.dy.round()).toSet(), vy = texts(v).map((t) => t.position.dy.round()).toSet();
    expect(hy.length, lessThanOrEqualTo(2));
    expect(vy.length, greaterThan(3));
    expect(timelineSpacing(['1900', '1910', '2000'], scale: false), [0, 220, 440]);
    final sp = timelineSpacing(['1900', '1910', '2000'], scale: true, minGap: 50);
    expect(sp[1] - sp[0], lessThan(sp[2] - sp[1]));
    expect(sp.last, 440);
    expect(timelineSpacing(['1900', 'soon'], scale: true), [0, 220], reason: 'unreadable dates fall back to even spacing');
    expect(timelineSpacing(['1900', '1901', '2000'], scale: true, minGap: 160)[1], 160, reason: 'never closer than the minimum');
    expect(timelineValue('15/3/2024')! > timelineValue('2023-01-01')!, isTrue);
    for (final c in [2, 10]) {
      expectNoLabelOverlap(Organiser.timeline, organiserElements(Organiser.timeline, s, ink, count: c, options: const OrganiserOptions(vertical: true, scaleByDate: true)));
    }
  });

  group('Venn set notation', () {
    Set<int> shade(String e, {int sets = 3}) => parseVenn(e, sets: sets).shade;

    test('operators and complement', () {
      expect(shade('A'), {1, 3, 5, 7});
      expect(shade('A ∩ B'), {3, 7});
      expect(shade('A ∪ B'), {1, 2, 3, 5, 6, 7});
      expect(shade('A ∖ B'), {1, 5});
      expect(shade(r'A \ B'), {1, 5});
      expect(shade('A′'), {0, 2, 4, 6});
      expect(shade("A'"), {0, 2, 4, 6});
      expect(shade('A Δ B'), {1, 2, 5, 6});
      expect(shade('U'), {0, 1, 2, 3, 4, 5, 6, 7});
      expect(shade('∅'), isEmpty);
      expect(shade('(A ∪ B)′'), {0, 4});
      expect(shade('A ∩ B′'), {1, 5});
      expect(shade('A ∪ B ∩ C'), {1, 3, 5, 7, 6}.intersection({1, 3, 5, 7, 6, 4}), reason: '∩ binds tighter than ∪');
      expect(shade('A ∩ B', sets: 2), {3});
      expect(shade('U′ ∪ A', sets: 2), {1, 3});
    });

    test('relations and membership', () {
      final sub = parseVenn('A ⊆ B', sets: 2);
      expect(sub.ok, isTrue);
      expect(sub.empty, {1});
      expect(sub.relation, '⊆');
      expect(parseVenn('A ⊂ B', sets: 2).empty, {1});
      final sup = parseVenn('A ⊇ B', sets: 2);
      expect(sup.empty, {2});
      expect(parseVenn('A ⊃ B', sets: 2).empty, {2});
      expect(parseVenn('x ∈ A ∩ B', sets: 2).element, ('x', 3));
      expect(parseVenn('x ∉ A', sets: 2).element, ('x', 0));
      expect(parseVenn('x ∈ ∅').ok, isFalse);
    });

    test('bad input is reported, not thrown', () {
      for (final bad in ['A ∩', 'A ∪ ∪ B', '(A', 'D', 'C', 'A B', 'A ⊆']) {
        expect(parseVenn(bad, sets: 2).ok, isFalse, reason: bad);
      }
      expect(parseVenn('').ok, isTrue);
    });

    test('regions tile the universe and shading is drawn', () {
      for (final k in [2, 3]) {
        final g = VennGeometry(k);
        for (var m = 0; m < 1 << k; m++) {
          expect(g.regionPolygon(m).length, greaterThan(8), reason: 'region $m of $k');
        }
      }
      final o = k2('A ∩ B′');
      expect(o.whereType<PolygonElement>(), hasLength(1));
      final sym = k2('A ⊆ B');
      expect(sym.whereType<PolygonElement>(), hasLength(4));
      expect(texts(sym).map((t) => t.text), contains('∅'));
      expect(texts(k2('x ∈ A')).map((t) => t.text), contains('x'));
      expect(k2('').whereType<PolygonElement>(), isEmpty);
      expect(organiserElements(Organiser.venn3, s, ink, options: const OrganiserOptions(expression: '(A ∪ B) ∖ C', universe: false)).whereType<PolygonElement>(), isNotEmpty);
    });
  });

  test('Hindi and Kannada have every English organiser string', () {
    for (final lang in ['hi', 'kn']) {
      expect(organiserStringTable[lang]!.keys.toSet(), organiserStringTable['en']!.keys.toSet(), reason: lang);
    }
  });

  group('the panel', () {
    for (final size in [phoneSize, panelSize]) {
      testWidgets('every template opens and goes onto the board at $size', (tester) async {
        for (final o in Organiser.values) {
          final wb = WhiteboardController();
          await pumpPanel(tester, OrganisersPanel(key: UniqueKey(), wb: wb), size: size);
          await tester.scrollUntilVisible(find.byKey(Key('organiser-${o.name}')), 200);
          await tester.tap(find.byKey(Key('organiser-${o.name}')));
          await tester.pumpAndSettle();
          await tester.ensureVisible(find.byKey(const Key('organiser-add')));
          await tester.tap(find.byKey(const Key('organiser-add')));
          await tester.pump();
          expect(wb.elements, isNotEmpty, reason: o.name);
          expect(tester.takeException(), isNull, reason: o.name);
        }
      });
    }

    Future<void> tapKey(WidgetTester t, String k) async {
      await t.ensureVisible(find.byKey(Key(k)));
      await t.pumpAndSettle();
      await t.tap(find.byKey(Key(k)));
      await t.pumpAndSettle();
    }

    testWidgets('cause and effect rows, mode and colours', (tester) async {
      final wb = WhiteboardController();
      await pumpPanel(tester, OrganisersPanel(key: UniqueKey(), wb: wb));
      await tapKey(tester, 'organiser-causeEffect');
      await tapKey(tester, 'organiser-count-plus');
      await tapKey(tester, 'organiser-count-minus');
      await tapKey(tester, 'organiser-count-minus');
      await tapKey(tester, 'organiser-mode-one');
      await tapKey(tester, 'organiser-theme-ocean');
      await tapKey(tester, 'organiser-add');
      expect(wb.elements.whereType<Stroke>().where((x) => x.shape == ShapeKind.arrow), hasLength(2));
      expect(texts(wb.elements).where((t) => t.text.startsWith('Effect')), hasLength(2));
    });

    testWidgets('cause or effect chooser, timeline options, Venn symbols', (tester) async {
      final wb = WhiteboardController();
      await pumpPanel(tester, OrganisersPanel(key: UniqueKey(), wb: wb));
      await tapKey(tester, 'organiser-causeOrEffect');
      await tapKey(tester, 'organiser-pick-0-1');
      await tapKey(tester, 'organiser-add');
      expect(wb.elements.whereType<Stroke>().where((x) => x.shape == ShapeKind.circle && x.fill != null), hasLength(1));

      await pumpPanel(tester, OrganisersPanel(key: UniqueKey(), wb: wb));
      await tapKey(tester, 'organiser-timeline');
      await tapKey(tester, 'organiser-vertical');
      await tapKey(tester, 'organiser-scale');
      await tapKey(tester, 'organiser-count-minus');
      await tapKey(tester, 'organiser-add');

      await pumpPanel(tester, OrganisersPanel(key: UniqueKey(), wb: WhiteboardController()));
      await tapKey(tester, 'organiser-venn3');
      for (var i = 0; i < vennSymbols.length; i++) {
        await tapKey(tester, 'organiser-sym-$i');
      }
      expect(tester.widget<TextField>(find.byKey(const Key('organiser-expr'))).controller!.text, vennSymbols.join());
      await tester.enterText(find.byKey(const Key('organiser-expr')), 'A ∩ B′');
      await tester.pump();
      expect(find.text('The shaded regions follow the expression'), findsOneWidget);
      await tester.enterText(find.byKey(const Key('organiser-expr')), 'A ∩');
      await tester.pump();
      expect(find.text('This expression cannot be read'), findsOneWidget);
    });
  });
}

List<BoardElement> k2(String e) => organiserElements(Organiser.venn2, const FeatureStrings('en', aidStringTable), const Color(0xFF000000), options: OrganiserOptions(expression: e));
