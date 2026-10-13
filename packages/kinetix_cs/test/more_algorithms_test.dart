import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_cs/kinetix_cs.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

/// The data-structure animations added for the B.E. CS / IS syllabus: circular queue, binary
/// heap, counting sort, Prim, Kruskal, topological sort; the counters, the pseudocode lines, the
/// editable graph; and the code lab's samples for every CS paper.
void main() {
  const graph = 'A-B 4, A-C 2, B-C 1, B-D 5, C-D 8, C-E 10, D-E 2, D-F 6, E-F 2';

  group('counters', () {
    test('sorting counts comparisons and swaps on every frame; the last agrees with the caption', () {
      final frames = sortSteps(SortAlgo.bubble, [5, 1, 4, 2, 8]);
      expect(frames.last.stats, {'stat_comparisons': 9, 'stat_swaps': 4});
      expect(frames.last.say.args, [9, 4]);
      for (var i = 1; i < frames.length; i++) {
        expect(frames[i].stats['stat_comparisons']!, greaterThanOrEqualTo(frames[i - 1].stats['stat_comparisons']!));
      }
      for (final a in SortAlgo.values) {
        final f = sortSteps(a, [9, 4, 7, 1, 3]);
        expect(f.last.stats['stat_comparisons'], f.last.say.args[0], reason: a.name);
        expect(f.last.stats['stat_swaps'], f.last.say.args[1], reason: a.name);
      }
    });

    test('searching counts the comparisons', () {
      expect(searchSteps(SearchAlgo.linear, [5, 1, 4, 2, 8], 2).last.stats['stat_comparisons'], 4);
      expect(searchSteps(SearchAlgo.binary, [1, 2, 3, 4, 5, 6, 7], 7).last.stats['stat_comparisons'], 3);
    });
  });

  group('circular queue', () {
    test('rear wraps round, full and empty are shown', () {
      final f = circularQueueSteps(Op.parseAll('enqueue 10; enqueue 20; enqueue 30; dequeue; dequeue; enqueue 40; enqueue 50; enqueue 60; enqueue 70; enqueue 80'), capacity: 5);
      final last = f.last.view as RingView;
      expect(last.slots, [60, 70, 30, 40, 50]);
      expect((last.front, last.rear, last.count), (2, 1, 5));
      expect(f.last.say.key, 'cqFull');
      expect(f.where((x) => x.say.key == 'cqEnqueue').map((x) => x.say.args[1]), [0, 1, 2, 3, 4, 0, 1]);
      final empty = circularQueueSteps(Op.parseAll('dequeue'), capacity: 3);
      expect(empty.last.say.key, 'underflow');
      expect(f, hasLength(1 + 3 + 2 * 2 + 4 + 1));
    });
  });

  group('binary heap', () {
    bool isHeap(List<int> a, {required bool min}) {
      for (var i = 1; i < a.length; i++) {
        final p = (i - 1) ~/ 2;
        if (min ? a[p] > a[i] : a[p] < a[i]) return false;
      }
      return true;
    }

    test('insert one by one, then insert and extract (max-heap)', () {
      final f = heapSteps([40, 20, 60, 10, 50, 30], ops: Op.parseAll('insert 70; extract; extract'));
      expect((f.last.view as HeapView).values, [50, 30, 40, 10, 20]);
      expect(f.where((x) => x.say.key == 'heapExtract').map((x) => x.say.args.first), [70, 60]);
      expect(f.last.say.args, ['50']);
      expect(f.last.stats['stat_swaps'], 6);
    });

    test('heapify and extract every item gives them in order (min and max)', () {
      final rnd = Random(3);
      for (var k = 0; k < 20; k++) {
        final v = [for (var i = 0; i < rnd.nextInt(12) + 1; i++) rnd.nextInt(90)];
        for (final min in [true, false]) {
          for (final heapify in [true, false]) {
            final built = heapSteps(v, min: min, heapify: heapify);
            expect(isHeap((built.last.view as HeapView).values, min: min), isTrue, reason: '$v min=$min heapify=$heapify');
            final all = heapSteps(v, min: min, heapify: heapify, ops: [for (final _ in v) const Op('extract')]);
            final out = [for (final x in all.where((x) => x.say.key == 'heapExtract')) x.say.args.first as int];
            expect(out, min ? ([...v]..sort()) : ([...v]..sort((a, b) => b - a)));
          }
        }
      }
    });
  });

  group('counting sort', () {
    test('sorts (negatives too) with n writes and no comparisons', () {
      final f = countingSortSteps([4, 2, 2, 8, 3, 3, 1]);
      expect(finalValues(f), [1, 2, 2, 3, 3, 4, 8]);
      expect(f.last.say.key, 'countDone');
      expect(f.last.stats, {'stat_writes': 7});
      expect((f[1].view as ArrayView).aux, [0, 0, 0, 1, 0, 0, 0, 0], reason: 'counting 4, values 1 to 8');
      expect(f, hasLength(1 + 7 + 7 + 1));
      expect(finalValues(countingSortSteps([-2, 3, -2, 0])), [-2, -2, 0, 3]);
      expect(countingSortSteps([]).last.say.key, 'countDone');
    });
  });

  group('spanning trees and topological sort', () {
    test("Prim and Kruskal find the same minimum weight; Kruskal skips the cycle", () {
      final g = TeachGraph.parse(graph);
      final prim = primSteps(g, 0), kruskal = kruskalSteps(g);
      expect(prim.last.say, isA<Say>().having((s) => s.key, 'key', 'mstDone').having((s) => s.args, 'args', [12]));
      expect(kruskal.last.say.args, [12]);
      expect(prim.last.view, isA<GraphView>().having((v) => v.output, 'order', [0, 2, 1, 3, 4, 5]));
      expect((kruskal.last.view as GraphView).edgeMarks.length, 5);
      expect(kruskal.where((f) => f.say.key == 'kruskalCycle').map((f) => f.say.args), [
        ['A', 'B'],
      ]);
      expect(primSteps(TeachGraph.parse('A-B 1, C-D 1'), 0).last.say.key, 'mstDisconnected');
      expect(kruskalSteps(TeachGraph.parse('A-B 1, C-D 1')).last.say.key, 'mstDisconnected');
    });

    test("Kahn's topological sort, and a cycle is found", () {
      final f = topoSortSteps(TeachGraph.parse('A->C, B->C, B->D, C->E, D->F, E->F, F->G', directed: true));
      expect(f.last.say.args.single, 'A → B → C → D → E → F → G');
      expect((f.first.view as GraphView).dist, [0, 0, 2, 1, 1, 2, 1]);
      final c = topoSortSteps(TeachGraph.parse('A->B, B->C, C->A, C->D', directed: true));
      expect(c.last.say.key, 'topoCycle');
    });

    test('a letter on its own adds a node; the graph tools take a directed option', () {
      expect(TeachGraph.parse('A-B 3, C').n, 3);
      final directed = algoFrames(AlgoKind.bfs, values: 'A->B, B->C, C->A', extra: 'B', option: 1);
      expect((directed.last.view as GraphView).directed, isTrue);
      expect(algoFrames(AlgoKind.prim, values: graph, extra: 'A').last.say.args, [12]);
    });
  });

  test('every algorithm has pseudocode and most of its steps light up a line', () {
    for (final k in AlgoKind.values) {
      final code = pseudocodeFor(k);
      expect(code.lines, isNotEmpty, reason: k.name);
      expect(code.lineOf.values.every((i) => i >= 0 && i < code.lines.length), isTrue, reason: k.name);
      final frames = algoFrames(k, values: _sample[k]!.$1, extra: _sample[k]!.$2);
      final lit = frames.where((f) => code.lineFor(f) != null).length;
      expect(lit / frames.length, greaterThan(0.5), reason: '${k.name}: ${frames.map((f) => f.say.key).toSet()}');
    }
  });

  group('player', () {
    Widget app(Widget child) => MaterialApp(
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      home: Scaffold(body: SizedBox(width: 1400, height: 900, child: child)),
    );
    setUp(() {
      final view = TestWidgetsFlutterBinding.instance.platformDispatcher.views.first;
      view.physicalSize = const Size(1400, 900);
      view.devicePixelRatio = 1;
    });

    testWidgets('pseudocode follows the step, counters show, the step and its code go on the board', (tester) async {
      final inserted = <List<BoardElement>>[];
      await tester.pumpWidget(app(AlgoPlayer(kind: AlgoKind.bubble, onInsert: inserted.add)));
      expect(find.byKey(const Key('algo-pseudocode')), findsOneWidget);
      await tester.tap(find.byKey(const Key('algo-next')));
      await tester.pump();
      final current = tester.widget<Container>(find.byKey(const Key('algo-line-current')));
      expect((current.child! as Text).data, '    if a[j+1] < a[j]');
      expect(find.text('Comparisons: 1   ·   Swaps: 0'), findsOneWidget);
      await tester.tap(find.byKey(const Key('algo-put')));
      expect(inserted.single.whereType<NoteElement>().single.text, contains('▶     if a[j+1] < a[j]'));
      await tester.tap(find.byKey(const Key('algo-code')));
      await tester.pump();
      expect(find.byKey(const Key('algo-pseudocode')), findsNothing);
      await tester.tap(find.byKey(const Key('algo-put')));
      expect(inserted.last.whereType<NoteElement>(), isEmpty);
    });

    testWidgets('the teacher adds nodes and weighted edges to the graph and takes the last away', (tester) async {
      await tester.pumpWidget(app(const AlgoPlayer(kind: AlgoKind.dijkstra, onInsert: _ignore)));
      await tester.enterText(find.byKey(const Key('algo-values')), 'A-B 4');
      await tester.tap(find.byKey(const Key('algo-add-node')));
      await tester.pump();
      expect(tester.widget<TextField>(find.byKey(const Key('algo-values'))).controller!.text, 'A-B 4, C');
      await tester.enterText(find.byKey(const Key('algo-from')), 'b');
      await tester.enterText(find.byKey(const Key('algo-to')), 'c');
      await tester.enterText(find.byKey(const Key('algo-weight')), '7');
      await tester.tap(find.byKey(const Key('algo-add-edge')));
      await tester.pump();
      expect(tester.widget<TextField>(find.byKey(const Key('algo-values'))).controller!.text, 'A-B 4, C, B-C 7');
      await tester.tap(find.byKey(const Key('algo-next')));
      await tester.pump();
      expect(find.textContaining('A is settled at distance 0'), findsOneWidget);
      await tester.tap(find.byKey(const Key('algo-remove-edge')));
      await tester.pump();
      expect(tester.widget<TextField>(find.byKey(const Key('algo-values'))).controller!.text, 'A-B 4, C');
    });
  });

  test('the code lab has C, Python, Java and SQL samples for each CS paper, all named', () {
    Set<CodeLanguage> langs(String subject) => {for (final s in subjectSamples[subject]!) s.language};
    expect(langs('data-structures'), containsAll([CodeLanguage.c, CodeLanguage.python]));
    expect(langs('oop-java'), {CodeLanguage.java});
    expect(langs('dbms'), {CodeLanguage.sql});
    expect(langs('operating-systems'), containsAll([CodeLanguage.c, CodeLanguage.python]));
    expect(langs('computer-networks'), containsAll([CodeLanguage.c, CodeLanguage.python]));
    expect(langs('theory-of-computation'), {CodeLanguage.python});
    expect(languageForSubject('oop-java'), CodeLanguage.java);
    for (final s in subjectSamples.values.expand((s) => s)) {
      expect(CsStrings.words, contains(s.key), reason: s.key);
      if (s.language == CodeLanguage.java) expect(s.code, contains('public class Main'));
    }
  });

  test('the SQL sample with keys runs on the device', () async {
    final sample = subjectSamples['dbms']!.firstWhere((s) => s.key == 'sampleKeys');
    final r = await SqlRunner().run(RunRequest(CodeLanguage.sql, sample.code, database: sample.database));
    expect(r.stdout, allOf(contains('Asha'), contains('DBMS'), contains('Ravi')));
  });
}

void _ignore(List<BoardElement> _) {}

const _sample = <AlgoKind, (String, String)>{
  AlgoKind.bubble: ('5 1 4 2 8', ''),
  AlgoKind.insertion: ('5 1 4 2 8', ''),
  AlgoKind.selection: ('5 1 4 2 8', ''),
  AlgoKind.merge: ('5 1 4 2 8', ''),
  AlgoKind.quick: ('5 1 4 2 8', ''),
  AlgoKind.heap: ('5 1 4 2 8', ''),
  AlgoKind.counting: ('4 2 2 8 3 3 1', ''),
  AlgoKind.linear: ('5 1 4 2 8', '2'),
  AlgoKind.binary: ('5 1 4 2 8', '9'),
  AlgoKind.stack: ('push 1; push 2; pop; pop; pop; peek', ''),
  AlgoKind.queue: ('enqueue 1; dequeue; dequeue', ''),
  AlgoKind.cqueue: ('enqueue 1; enqueue 2; dequeue; enqueue 3; peek', '3'),
  AlgoKind.list: ('1 2 3', 'insertHead 0; insertTail 4; insertAt 9 2; delete 2; delete 7; search 4'),
  AlgoKind.hash: ('10 17 24 3 4 5 6 7', '7'),
  AlgoKind.bst: ('50 30 70 20 40 60 80', '30 50 99'),
  AlgoKind.binheap: ('40 20 60 10 50 30', 'insert 70; extract'),
  AlgoKind.bfs: ('A-B, A-C, B-D', 'A'),
  AlgoKind.dfs: ('A-B, A-C, B-D', 'B'),
  AlgoKind.dijkstra: ('A-B 4, A-C 1, C-B 2', 'A'),
  AlgoKind.prim: ('A-B 4, A-C 1, C-B 2', 'A'),
  AlgoKind.kruskal: ('A-B 4, A-C 1, C-B 2', ''),
  AlgoKind.topo: ('A->B, A->C, C->B', ''),
};
