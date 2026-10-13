import 'frames.dart';
import 'structures.dart';
import 'trees_graphs.dart';

// More of the data-structures syllabus, step by step: the circular queue, binary heaps
// (insert, extract, heapify), counting sort, minimum spanning trees (Prim and Kruskal) and
// topological sort. Pure functions from the input to the frames, like the rest of the kit.

/// A circular queue of [capacity] slots: enqueue v, dequeue, peek. rear moves (rear + 1) mod n.
List<AlgoFrame> circularQueueSteps(List<Op> ops, {int capacity = 6}) {
  final slots = List<int?>.filled(capacity, null);
  var front = 0, rear = -1, count = 0;
  final out = <AlgoFrame>[];
  void add(Say s, [Map<int, Mark> m = const {}]) => out.add(AlgoFrame(RingView(List.of(slots), front: front, rear: rear < 0 ? capacity - 1 : rear, count: count, marks: m), s));
  add(Say('cqStart', [capacity]));
  for (final op in ops) {
    switch (op.name) {
      case 'enqueue' || 'enq' || 'push' when op.value != null:
        if (count == capacity) {
          add(Say('cqFull', [op.value!]));
        } else {
          rear = (rear + 1) % capacity;
          slots[rear] = op.value;
          count++;
          add(Say('cqEnqueue', [op.value!, rear, capacity]), {rear: Mark.active});
        }
      case 'dequeue' || 'deq' || 'pop':
        if (count == 0) {
          add(const Say('underflow'));
        } else {
          final v = slots[front]!;
          add(Say('dequeue', [v]), {front: Mark.swap});
          slots[front] = null;
          front = (front + 1) % capacity;
          count--;
          add(Say('cqFront', [front, count]));
        }
      case 'peek':
        add(count == 0 ? const Say('underflow') : Say('peek', [slots[front]!]), {if (count > 0) front: Mark.found});
    }
  }
  return out;
}

/// A binary heap (max-heap, or min-heap when [min]): build it by inserting [values] one by one
/// (sift up), or with bottom-up heapify when [heapify]; then the [ops] (`insert v`, `extract`).
List<AlgoFrame> heapSteps(List<int> values, {List<Op> ops = const [], bool min = false, bool heapify = false}) {
  final a = <int>[];
  final out = <AlgoFrame>[];
  var comparisons = 0, swaps = 0;
  bool before(int x, int y) => min ? x < y : x > y;
  void add(Say s, [Map<int, Mark> m = const {}]) =>
      out.add(AlgoFrame(HeapView(List.of(a), size: a.length, min: min, marks: m), s, stats: {'stat_comparisons': comparisons, 'stat_swaps': swaps}));
  void swap(int i, int j) {
    final t = a[i];
    a[i] = a[j];
    a[j] = t;
    swaps++;
  }

  void siftUp(int i) {
    while (i > 0) {
      final p = (i - 1) ~/ 2;
      comparisons++;
      add(Say('compare', [a[i], a[p]]), {i: Mark.compare, p: Mark.compare});
      if (!before(a[i], a[p])) break;
      swap(i, p);
      add(Say('heapSwapUp', [a[p], a[i]]), {p: Mark.swap, i: Mark.swap});
      i = p;
    }
  }

  void siftDown(int i) {
    while (true) {
      final l = 2 * i + 1, r = l + 1;
      var best = i;
      if (l < a.length) {
        comparisons++;
        if (before(a[l], a[best])) best = l;
      }
      if (r < a.length) {
        comparisons++;
        if (before(a[r], a[best])) best = r;
      }
      add(Say('heapChildren', [a[i]]), {i: Mark.active, if (l < a.length) l: Mark.compare, if (r < a.length) r: Mark.compare});
      if (best == i) return;
      swap(i, best);
      add(Say('heapSwapDown', [a[best], a[i]]), {i: Mark.swap, best: Mark.swap});
      i = best;
    }
  }

  add(Say(min ? 'minHeapStart' : 'maxHeapStart'));
  if (heapify) {
    a.addAll(values);
    add(const Say('heapifyStart'));
    for (var i = a.length ~/ 2 - 1; i >= 0; i--) {
      add(Say('heapifyAt', [a[i]]), {i: Mark.pivot});
      siftDown(i);
    }
  } else {
    for (final v in values) {
      a.add(v);
      add(Say('heapInsert', [v]), {a.length - 1: Mark.active});
      siftUp(a.length - 1);
    }
  }
  for (final op in ops) {
    switch (op.name) {
      case 'insert' || 'push' when op.value != null:
        a.add(op.value!);
        add(Say('heapInsert', [op.value!]), {a.length - 1: Mark.active});
        siftUp(a.length - 1);
      case 'extract' || 'pop' || 'delete':
        if (a.isEmpty) {
          add(const Say('underflow'));
          continue;
        }
        final top = a.first;
        add(Say('heapExtract', [top]), {0: Mark.found});
        final last = a.removeLast();
        if (a.isNotEmpty) {
          a[0] = last;
          add(Say('heapLastToRoot', [last]), {0: Mark.active});
          siftDown(0);
        }
    }
  }
  add(Say('heapDone', [a.isEmpty ? '—' : '${a.first}']));
  return out;
}

/// Counting sort (values may be negative: counts start at the smallest value).
List<AlgoFrame> countingSortSteps(List<int> input) {
  final a = List.of(input);
  final out = <AlgoFrame>[];
  if (a.isEmpty) {
    return [AlgoFrame(ArrayView(a), const Say('sortStart')), AlgoFrame(ArrayView(a), const Say('countDone', [0]))];
  }
  final lo = a.reduce((x, y) => x < y ? x : y), hi = a.reduce((x, y) => x > y ? x : y);
  final count = List<int>.filled(hi - lo + 1, 0);
  var writes = 0;
  void add(Say s, {Map<int, Mark> m = const {}, Map<int, Mark> cm = const {}, Map<String, int> p = const {}}) =>
      out.add(AlgoFrame(ArrayView(List.of(a), marks: m, pointers: p, aux: List.of(count), auxBase: lo, auxMarks: cm), s, stats: {'stat_writes': writes}));
  add(Say('countStart', [lo, hi]));
  for (var i = 0; i < a.length; i++) {
    count[a[i] - lo]++;
    add(Say('countOne', [a[i], count[a[i] - lo]]), m: {i: Mark.active}, cm: {a[i] - lo: Mark.active}, p: {'i': i});
  }
  // Write each value back as many times as it was counted.
  final done = <int, Mark>{};
  var k = 0;
  for (var v = 0; v < count.length; v++) {
    while (count[v] > 0) {
      a[k] = v + lo;
      count[v]--;
      writes++;
      done[k] = Mark.sorted;
      add(Say('countWrite', [v + lo, k]), m: {...done, k: Mark.active}, cm: {v: Mark.compare}, p: {'k': k});
      k++;
    }
  }
  out.add(AlgoFrame(ArrayView(List.of(a), marks: {for (var i = 0; i < a.length; i++) i: Mark.sorted}, aux: List.of(count), auxBase: lo), Say('countDone', [writes]), stats: {'stat_writes': writes}));
  return out;
}

/// Prim's minimum spanning tree from [start] (undirected, weighted).
List<AlgoFrame> primSteps(TeachGraph g, int start) {
  final inTree = <int>{start};
  final tree = <int, Mark>{};
  final order = <int>[start];
  var total = 0;
  final out = <AlgoFrame>[AlgoFrame(g.view(marks: {start: Mark.active}, output: [start]), Say('primStart', [g.labels[start]]), stats: const {'stat_mstWeight': 0})];
  while (inTree.length < g.n) {
    (int, int, int)? best; // (edge, from, to)
    for (final u in inTree) {
      for (final (v, e) in g.next(u)) {
        if (inTree.contains(v)) continue;
        if (best == null || g.edges[e].$3 < g.edges[best.$1].$3 || (g.edges[e].$3 == g.edges[best.$1].$3 && e < best.$1)) best = (e, u, v);
      }
    }
    if (best == null) {
      out.add(AlgoFrame(g.view(marks: {for (final v in inTree) v: Mark.visited}, edgeMarks: Map.of(tree), output: List.of(order)), const Say('mstDisconnected'), stats: {'stat_mstWeight': total}));
      return out;
    }
    final (e, u, v) = best;
    // The cheapest edge across the cut, then it joins the tree.
    final cut = <int, Mark>{
      for (final x in inTree)
        for (final (y, f) in g.next(x))
          if (!inTree.contains(y)) f: Mark.compare,
    };
    out.add(AlgoFrame(g.view(marks: {for (final x in inTree) x: Mark.visited}, edgeMarks: {...cut, ...tree, e: Mark.pivot}, output: List.of(order)), Say('primCheapest', [g.labels[u], g.labels[v], g.edges[e].$3]), stats: {'stat_mstWeight': total}));
    inTree.add(v);
    order.add(v);
    tree[e] = Mark.active;
    total += g.edges[e].$3;
    out.add(AlgoFrame(g.view(marks: {for (final x in inTree) x: Mark.visited, v: Mark.active}, edgeMarks: Map.of(tree), output: List.of(order)), Say('mstAdd', [g.labels[u], g.labels[v], total]), stats: {'stat_mstWeight': total}));
  }
  out.add(AlgoFrame(g.view(marks: {for (final x in inTree) x: Mark.visited}, edgeMarks: Map.of(tree), output: List.of(order)), Say('mstDone', [total]), stats: {'stat_mstWeight': total}));
  return out;
}

/// Kruskal's minimum spanning tree: edges by weight, skipping those that make a cycle
/// (union-find).
List<AlgoFrame> kruskalSteps(TeachGraph g) {
  final parent = List.generate(g.n, (i) => i);
  int find(int x) => parent[x] == x ? x : (parent[x] = find(parent[x]));
  final order = [for (var i = 0; i < g.edges.length; i++) i]..sort((x, y) => g.edges[x].$3 != g.edges[y].$3 ? g.edges[x].$3.compareTo(g.edges[y].$3) : x.compareTo(y));
  final tree = <int, Mark>{};
  final rejected = <int, Mark>{};
  var total = 0, taken = 0;
  final out = <AlgoFrame>[
    AlgoFrame(g.view(), Say('kruskalStart', [order.map((e) => '${g.labels[g.edges[e].$1]}${g.labels[g.edges[e].$2]}(${g.edges[e].$3})').join(' ')]), stats: const {'stat_mstWeight': 0}),
  ];
  Map<int, Mark> nodes() => {
    for (final e in tree.keys) ...{g.edges[e].$1: Mark.visited, g.edges[e].$2: Mark.visited},
  };
  for (final e in order) {
    if (taken == g.n - 1) break;
    final (a, b, w) = g.edges[e];
    out.add(AlgoFrame(g.view(marks: {...nodes(), a: Mark.compare, b: Mark.compare}, edgeMarks: {...rejected, ...tree, e: Mark.compare}), Say('kruskalTry', [g.labels[a], g.labels[b], w]), stats: {'stat_mstWeight': total}));
    final ra = find(a), rb = find(b);
    if (ra == rb) {
      rejected[e] = Mark.dim;
      out.add(AlgoFrame(g.view(marks: nodes(), edgeMarks: {...rejected, ...tree, e: Mark.swap}), Say('kruskalCycle', [g.labels[a], g.labels[b]]), stats: {'stat_mstWeight': total}));
      continue;
    }
    parent[ra] = rb;
    tree[e] = Mark.active;
    total += w;
    taken++;
    out.add(AlgoFrame(g.view(marks: nodes(), edgeMarks: {...rejected, ...tree}), Say('mstAdd', [g.labels[a], g.labels[b], total]), stats: {'stat_mstWeight': total}));
  }
  out.add(AlgoFrame(
    g.view(marks: nodes(), edgeMarks: Map.of(tree)),
    taken == g.n - 1 || g.n == 0 ? Say('mstDone', [total]) : const Say('mstDisconnected'),
    stats: {'stat_mstWeight': total},
  ));
  return out;
}

/// Topological sort by Kahn's algorithm: in-degrees (shown beside the nodes), a queue of the
/// nodes with none, and a cycle reported when nodes are left over. [g] is treated as directed.
List<AlgoFrame> topoSortSteps(TeachGraph g) {
  final d = TeachGraph(g.n, g.edges, directed: true);
  final indeg = List<int>.filled(d.n, 0);
  for (final (_, b, _) in d.edges) {
    indeg[b]++;
  }
  final queue = [for (var v = 0; v < d.n; v++) if (indeg[v] == 0) v];
  final order = <int>[];
  final used = <int, Mark>{};
  final out = <AlgoFrame>[
    AlgoFrame(d.view(marks: {for (final v in queue) v: Mark.compare}, dist: List.of(indeg), frontier: List.of(queue)), Say('topoStart', [queue.map((v) => d.labels[v]).join(', ')])),
  ];
  Map<int, Mark> marks([int? cur]) => {for (final v in order) v: Mark.visited, for (final v in queue) v: Mark.compare, ?cur: Mark.active};
  while (queue.isNotEmpty) {
    final u = queue.removeAt(0);
    order.add(u);
    out.add(AlgoFrame(d.view(marks: marks(u), edgeMarks: Map.of(used), dist: List.of(indeg), frontier: List.of(queue), output: List.of(order)), Say('topoTake', [d.labels[u]])));
    for (final (v, e) in d.next(u)) {
      indeg[v]--;
      used[e] = Mark.active;
      if (indeg[v] == 0) queue.add(v);
      out.add(AlgoFrame(
        d.view(marks: {...marks(u), v: indeg[v] == 0 ? Mark.compare : Mark.pivot}, edgeMarks: Map.of(used), dist: List.of(indeg), frontier: List.of(queue), output: List.of(order)),
        Say(indeg[v] == 0 ? 'topoReady' : 'topoIndeg', [d.labels[v], indeg[v]]),
      ));
    }
  }
  final cyclic = order.length < d.n;
  out.add(AlgoFrame(
    d.view(marks: {for (final v in order) v: Mark.visited, if (cyclic) for (var v = 0; v < d.n; v++) if (!order.contains(v)) v: Mark.swap}, edgeMarks: Map.of(used), dist: List.of(indeg), output: List.of(order)),
    cyclic ? const Say('topoCycle') : Say('order', [order.map((v) => d.labels[v]).join(' → ')]),
  ));
  return out;
}
