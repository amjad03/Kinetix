import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_cs/kinetix_cs.dart';

void main() {
  group('sorting', () {
    final rnd = Random(7);
    final inputs = [
      <int>[],
      [5],
      [2, 1],
      [5, 1, 4, 2, 8],
      [3, 3, 1, 3, 2],
      [9, 8, 7, 6, 5, 4, 3, 2, 1],
      [1, 2, 3, 4, 5],
      for (var k = 0; k < 20; k++) [for (var i = 0; i < rnd.nextInt(14) + 2; i++) rnd.nextInt(50) - 10],
    ];
    for (final algo in SortAlgo.values) {
      test('${algo.name} sorts every input and ends with all items marked sorted', () {
        for (final input in inputs) {
          final frames = sortSteps(algo, input);
          expect(finalValues(frames), [...input]..sort(), reason: '$input');
          final last = frames.last.view as ArrayView;
          expect(last.marks.values.every((m) => m == Mark.sorted), isTrue);
          expect(last.marks.length, input.length);
          expect(frames.last.say.key, 'sortDone');
          // Every frame holds the same multiset of values (nothing lost mid-way).
          for (final f in frames) {
            expect(([...(f.view as ArrayView).values]..sort()), [...input]..sort());
          }
        }
      });
    }

    test('bubble sort stops early on sorted input and counts its work', () {
      final frames = sortSteps(SortAlgo.bubble, [1, 2, 3, 4]);
      expect(frames.any((f) => f.say.key == 'noSwaps'), isTrue);
      expect(frames.last.say.args, [3, 0]);
      expect(sortSteps(SortAlgo.bubble, [3, 2, 1]).last.say.args, [3, 3]);
    });

    test('quick sort shows its pivots; merge sort its splits', () {
      expect(sortSteps(SortAlgo.quick, [4, 1, 3]).where((f) => f.say.key == 'pivot').first.say.args, [3]);
      expect(sortSteps(SortAlgo.merge, [4, 1, 3, 2]).where((f) => (f.view as ArrayView).split != null), isNotEmpty);
    });
  });

  group('searching', () {
    test('linear search finds the first match or says it is not there', () {
      final f = searchSteps(SearchAlgo.linear, [7, 3, 9, 3], 3);
      expect(f.last.say.key, 'found');
      expect(f.last.say.args, [3, 1]);
      expect(searchSteps(SearchAlgo.linear, [7, 3], 5).last.say.key, 'notFound');
    });

    test('binary search sorts, halves and finds in log steps', () {
      final input = [for (var i = 0; i < 64; i++) i * 3];
      for (final target in [0, 3, 93, 189, 4, -1, 500]) {
        final f = searchSteps(SearchAlgo.binary, input.reversed.toList(), target);
        final compares = f.where((x) => x.say.key == 'compare').length;
        expect(compares, lessThanOrEqualTo(7));
        expect(f.last.say.key, input.contains(target) ? 'found' : 'notFound');
        if (input.contains(target)) expect(f.last.say.args[1], input.indexOf(target));
      }
    });
  });

  group('stack, queue, linked list, hashing', () {
    test('stack: LIFO, overflow and underflow', () {
      final f = stackSteps(Op.parseAll('push 1; push 2; push 3; pop; peek; pop; pop; pop'), capacity: 2);
      final keys = f.map((x) => x.say.key).toList();
      expect(keys, contains('overflow'));
      expect(keys.last, 'underflow');
      expect(f.firstWhere((x) => x.say.key == 'pop').say.args, [2]);
      expect(f.firstWhere((x) => x.say.key == 'peek').say.args, [1]);
    });

    test('queue: FIFO', () {
      final f = queueSteps(Op.parseAll('enqueue 1\nenqueue 2\ndequeue\nenqueue 3\ndequeue\ndequeue\ndequeue'));
      expect([for (final x in f) if (x.say.key == 'dequeue') x.say.args.first], [1, 2, 3]);
      expect(f.last.say.key, 'underflow');
      expect((f.last.view as LineView).values, isEmpty);
    });

    test('linked list: insert at head, tail and position; delete; search', () {
      final f = linkedListSteps([10, 20], Op.parseAll('insertHead 5; insertTail 30; insertAt 15 2; delete 20; search 30; delete 99'));
      final last = f.last.view as LineView;
      expect(last.values, [5, 10, 15, 30]);
      expect(f.firstWhere((x) => x.say.key == 'found').say.args, [30, 3]);
      expect(f.last.say.key, 'notFound');
    });

    test('hashing: k mod m with linear and quadratic probing, and chaining', () {
      HashView end(List<AlgoFrame> f) => f.last.view as HashView;
      final linear = end(hashSteps([10, 17, 24, 5], size: 7));
      // 10→3, 17→3 collides→4, 24→3→4→5, 5→5 collides→6.
      expect(linear.buckets, [[], [], [], [10], [17], [24], [5]]);
      final quad = end(hashSteps([10, 17, 24], size: 7, probing: Probing.quadratic));
      // 24: 3 (taken), 3+1=4 (taken), 3+4=0.
      expect(quad.buckets[0], [24]);
      final chain = end(hashSteps([10, 17, 24, 5], size: 7, probing: Probing.chaining));
      expect(chain.buckets[3], [10, 17, 24]);
      expect(hashSteps([1, 2, 3], size: 2).last.say.key, 'tableFull');
    });
  });

  group('binary search trees', () {
    test('insert, traversals and level order', () {
      final t = Bst();
      for (final v in [50, 30, 70, 20, 40, 60, 80]) {
        t.insert(v, []);
      }
      List<int> vals(Traversal x) => [for (final n in t.traverse(x)) t.values[n]];
      expect(vals(Traversal.inorder), [20, 30, 40, 50, 60, 70, 80]);
      expect(vals(Traversal.preorder), [50, 30, 20, 40, 70, 60, 80]);
      expect(vals(Traversal.postorder), [20, 40, 30, 60, 80, 70, 50]);
      expect(vals(Traversal.level), [50, 30, 70, 20, 40, 60, 80]);
    });

    test('delete a leaf, a node with one child, a node with two and the root', () {
      final f = bstSteps([50, 30, 70, 20, 40, 60, 80, 65], deletes: [20, 60, 30, 50, 99], traversal: Traversal.inorder);
      expect((f.last.view as TreeView).output, [40, 65, 70, 80]);
      final keys = f.map((x) => x.say.key).toList();
      expect(keys, containsAll(['deleteLeaf', 'deleteOneChild', 'successor', 'notFound']));
      // In-order stays sorted after random inserts and deletes.
      final rnd = Random(3);
      for (var k = 0; k < 30; k++) {
        final ins = [for (var i = 0; i < 12; i++) rnd.nextInt(40)];
        final del = [for (var i = 0; i < 5; i++) ins[rnd.nextInt(ins.length)]];
        final out = (bstSteps(ins, deletes: del, traversal: Traversal.inorder).last.view as TreeView).output;
        expect(out, ({...ins}.difference({...del}).toList()..sort()));
      }
    });
  });

  group('graphs', () {
    final g = TeachGraph.parse('A-B 4, A-C 2, B-C 1, B-D 5, C-D 8, C-E 10, D-E 2, D-F 6, E-F 2');

    test('parses edges and weights', () {
      expect(g.n, 6);
      expect(g.edges.first, (0, 1, 4));
      expect(g.labels.last, 'F');
    });

    test('BFS visits level by level, DFS goes deep first (neighbours in label order)', () {
      String order(List<AlgoFrame> f) => (f.last.say.args.first as String).replaceAll(' → ', '');
      expect(order(traverseGraphSteps(g, 0, bfs: true)), 'ABCDEF');
      expect(order(traverseGraphSteps(g, 0, bfs: false)), 'ABCDEF');
      final chain = TeachGraph.parse('A-B, A-C, B-D, C-E');
      expect(order(traverseGraphSteps(chain, 0, bfs: true)), 'ABCDE');
      expect(order(traverseGraphSteps(chain, 0, bfs: false)), 'ABDCE');
    });

    test("Dijkstra's distances", () {
      final f = dijkstraSteps(g, 0);
      expect((f.last.view as GraphView).dist, [0, 3, 2, 8, 10, 12]);
      // Unreachable nodes stay at infinity.
      final split = TeachGraph.parse('A-B 1, C-D 1');
      expect((dijkstraSteps(split, 0).last.view as GraphView).dist, [0, 1, null, null]);
      // Directed edges are one-way.
      final dir = TeachGraph.parse('A>B 1, B>C 1, C>A 1', directed: true);
      expect((dijkstraSteps(dir, 1).last.view as GraphView).dist, [2, 0, 1]);
    });
  });
}
