import 'dart:math' as math;

import 'frames.dart';

enum Traversal { inorder, preorder, postorder, level }

/// A binary search tree kept as arrays (so each step is a cheap copy).
class Bst {
  final values = <int>[];
  final left = <int>[];
  final right = <int>[];
  int root = -1;

  /// Nodes deleted are unlinked, not removed, so indexes stay put.
  TreeView view([Map<int, Mark> marks = const {}, List<int> output = const []]) =>
      TreeView(values: List.of(values), left: List.of(left), right: List.of(right), root: root, marks: marks, output: output);

  int _node(int v) {
    values.add(v);
    left.add(-1);
    right.add(-1);
    return values.length - 1;
  }

  /// Inserts [v], adding a frame for each node passed; duplicates are not added.
  void insert(int v, List<AlgoFrame> out) {
    if (root < 0) {
      root = _node(v);
      out.add(AlgoFrame(view({root: Mark.active}), Say('bstRoot', [v])));
      return;
    }
    var cur = root;
    while (true) {
      out.add(AlgoFrame(view({cur: Mark.compare}), Say('compare', [v, values[cur]])));
      if (v == values[cur]) {
        out.add(AlgoFrame(view({cur: Mark.found}), Say('duplicate', [v])));
        return;
      }
      final goLeft = v < values[cur];
      final next = goLeft ? left[cur] : right[cur];
      if (next < 0) {
        final n = _node(v);
        if (goLeft) {
          left[cur] = n;
        } else {
          right[cur] = n;
        }
        out.add(AlgoFrame(view({n: Mark.active}), Say(goLeft ? 'bstLeftChild' : 'bstRightChild', [v, values[cur]])));
        return;
      }
      cur = next;
    }
  }

  /// Deletes [v]: a leaf goes, a node with one child is replaced by it, a node with two takes
  /// its in-order successor's value.
  void delete(int v, List<AlgoFrame> out) {
    var parent = -1, cur = root;
    while (cur >= 0 && values[cur] != v) {
      out.add(AlgoFrame(view({cur: Mark.compare}), Say('compare', [v, values[cur]])));
      parent = cur;
      cur = v < values[cur] ? left[cur] : right[cur];
    }
    if (cur < 0) {
      out.add(AlgoFrame(view(), Say('notFound', [v])));
      return;
    }
    if (left[cur] >= 0 && right[cur] >= 0) {
      var sp = cur, s = right[cur];
      while (left[s] >= 0) {
        sp = s;
        s = left[s];
      }
      out.add(AlgoFrame(view({cur: Mark.swap, s: Mark.pivot}), Say('successor', [values[s], v])));
      values[cur] = values[s];
      _replace(sp, s, right[s]);
      out.add(AlgoFrame(view({cur: Mark.active}), Say('deleted', [v])));
      return;
    }
    out.add(AlgoFrame(view({cur: Mark.swap}), Say(left[cur] < 0 && right[cur] < 0 ? 'deleteLeaf' : 'deleteOneChild', [v])));
    _replace(parent, cur, left[cur] >= 0 ? left[cur] : right[cur]);
    out.add(AlgoFrame(view(), Say('deleted', [v])));
  }

  void _replace(int parent, int node, int child) {
    if (parent < 0) {
      root = child;
    } else if (left[parent] == node) {
      left[parent] = child;
    } else {
      right[parent] = child;
    }
  }

  List<int> traverse(Traversal t) {
    final out = <int>[];
    void walk(int n) {
      if (n < 0) return;
      if (t == Traversal.preorder) out.add(n);
      walk(left[n]);
      if (t == Traversal.inorder) out.add(n);
      walk(right[n]);
      if (t == Traversal.postorder) out.add(n);
    }

    if (t == Traversal.level) {
      final q = [if (root >= 0) root];
      for (var i = 0; i < q.length; i++) {
        out.add(q[i]);
        if (left[q[i]] >= 0) q.add(left[q[i]]);
        if (right[q[i]] >= 0) q.add(right[q[i]]);
      }
    } else {
      walk(root);
    }
    return out;
  }
}

/// Building a BST from [inserts], then deleting [deletes], then a [traversal].
List<AlgoFrame> bstSteps(List<int> inserts, {List<int> deletes = const [], Traversal? traversal}) {
  final t = Bst();
  final out = <AlgoFrame>[AlgoFrame(t.view(), const Say('bstStart'))];
  for (final v in inserts) {
    t.insert(v, out);
  }
  for (final v in deletes) {
    t.delete(v, out);
  }
  if (traversal != null) {
    final order = t.traverse(traversal);
    final seen = <int>[];
    for (final n in order) {
      seen.add(t.values[n]);
      out.add(AlgoFrame(t.view({for (final m in order.take(seen.length)) m: Mark.visited, n: Mark.active}, List.of(seen)), Say('visit', [t.values[n]])));
    }
    out.add(AlgoFrame(t.view({for (final m in order) m: Mark.visited}, List.of(seen)), Say('traversal', [seen.join(', ')])));
  }
  return out;
}

/// A graph to teach on: labels A, B, …, nodes on a circle, weighted edges.
class TeachGraph {
  TeachGraph(this.n, this.edges, {this.directed = false});

  final int n;
  final List<(int, int, int)> edges;
  final bool directed;

  List<String> get labels => [for (var i = 0; i < n; i++) String.fromCharCode(65 + i)];
  List<(double, double)> get positions => [for (var i = 0; i < n; i++) (0.5 + 0.42 * math.cos(2 * math.pi * i / n - math.pi / 2), 0.5 + 0.42 * math.sin(2 * math.pi * i / n - math.pi / 2))];

  /// Neighbours in label order, with the edge's index.
  List<(int, int)> next(int u) {
    final out = <(int, int)>[];
    for (final (i, (a, b, _)) in edges.indexed) {
      if (a == u) out.add((b, i));
      if (!directed && b == u) out.add((a, i));
    }
    out.sort((x, y) => x.$1.compareTo(y.$1));
    return out;
  }

  /// "A-B 4, A-C 2, B-D 5" (weights optional, default 1).
  static TeachGraph parse(String s, {bool directed = false}) {
    final edges = <(int, int, int)>[];
    var n = 0;
    for (final m in RegExp(r'([A-Za-z])\s*-?>?\s*([A-Za-z])\s*(\d+)?').allMatches(s)) {
      final a = m[1]!.toUpperCase().codeUnitAt(0) - 65, b = m[2]!.toUpperCase().codeUnitAt(0) - 65;
      edges.add((a, b, int.tryParse(m[3] ?? '') ?? 1));
      n = math.max(n, math.max(a, b) + 1);
    }
    return TeachGraph(n, edges, directed: directed);
  }

  GraphView view({Map<int, Mark> marks = const {}, Map<int, Mark> edgeMarks = const {}, List<int?> dist = const [], List<int> frontier = const [], List<int> output = const []}) =>
      GraphView(
        labels: labels,
        positions: positions,
        edges: edges,
        directed: directed,
        marks: marks,
        edgeMarks: edgeMarks,
        dist: dist,
        frontier: frontier,
        output: output,
      );
}

/// Breadth-first (queue) or depth-first (stack) search from [start].
List<AlgoFrame> traverseGraphSteps(TeachGraph g, int start, {required bool bfs}) {
  final out = <AlgoFrame>[];
  final visited = <int>{start};
  final order = <int>[];
  final tree = <int, Mark>{};
  final frontier = [start];
  Map<int, Mark> marks([int? cur]) => {for (final v in visited) v: Mark.visited, for (final v in frontier) v: Mark.compare, ?cur: Mark.active};
  out.add(AlgoFrame(g.view(marks: marks(), frontier: List.of(frontier)), Say(bfs ? 'bfsStart' : 'dfsStart', [g.labels[start]])));
  if (bfs) {
    while (frontier.isNotEmpty) {
      final u = frontier.removeAt(0);
      order.add(u);
      out.add(AlgoFrame(g.view(marks: marks(u), edgeMarks: Map.of(tree), frontier: List.of(frontier), output: List.of(order)), Say('visitNode', [g.labels[u]])));
      for (final (v, e) in g.next(u)) {
        if (visited.add(v)) {
          frontier.add(v);
          tree[e] = Mark.active;
          out.add(AlgoFrame(g.view(marks: marks(u), edgeMarks: Map.of(tree), frontier: List.of(frontier), output: List.of(order)), Say('discover', [g.labels[v]])));
        }
      }
    }
  } else {
    // Recursive DFS, shown with its stack.
    visited.clear();
    frontier.clear();
    void dfs(int u, int? via) {
      visited.add(u);
      frontier.add(u);
      if (via != null) tree[via] = Mark.active;
      order.add(u);
      out.add(AlgoFrame(g.view(marks: marks(u), edgeMarks: Map.of(tree), frontier: List.of(frontier), output: List.of(order)), Say('visitNode', [g.labels[u]])));
      for (final (v, e) in g.next(u)) {
        if (!visited.contains(v)) dfs(v, e);
      }
      frontier.removeLast();
      if (frontier.isNotEmpty) out.add(AlgoFrame(g.view(marks: marks(frontier.last), edgeMarks: Map.of(tree), frontier: List.of(frontier), output: List.of(order)), Say('backtrack', [g.labels[frontier.last]])));
    }

    dfs(start, null);
  }
  out.add(AlgoFrame(g.view(marks: {for (final v in order) v: Mark.visited}, edgeMarks: Map.of(tree), output: List.of(order)), Say('order', [order.map((v) => g.labels[v]).join(' → ')])));
  return out;
}

/// Dijkstra's shortest paths from [start] (non-negative weights).
List<AlgoFrame> dijkstraSteps(TeachGraph g, int start) {
  final dist = List<int?>.filled(g.n, null)..[start] = 0;
  final prev = List<int>.filled(g.n, -1);
  final via = List<int>.filled(g.n, -1);
  final done = <int>{};
  final out = <AlgoFrame>[];
  Map<int, Mark> tree() => {for (var v = 0; v < g.n; v++) if (via[v] >= 0) via[v]: Mark.active};
  List<int> open() => [for (var v = 0; v < g.n; v++) if (!done.contains(v) && dist[v] != null) v];
  out.add(AlgoFrame(g.view(marks: {start: Mark.active}, dist: List.of(dist), frontier: open()), Say('dijkstraStart', [g.labels[start]])));
  while (true) {
    int? u;
    for (final v in open()) {
      if (u == null || dist[v]! < dist[u]!) u = v;
    }
    if (u == null) break;
    done.add(u);
    out.add(AlgoFrame(
      g.view(marks: {for (final d in done) d: Mark.visited, u: Mark.active}, edgeMarks: tree(), dist: List.of(dist), frontier: open(), output: done.toList()),
      Say('settle', [g.labels[u], dist[u]!]),
    ));
    for (final (v, e) in g.next(u)) {
      if (done.contains(v)) continue;
      final nd = dist[u]! + g.edges[e].$3;
      if (dist[v] == null || nd < dist[v]!) {
        dist[v] = nd;
        prev[v] = u;
        via[v] = e;
        out.add(AlgoFrame(
          g.view(marks: {for (final d in done) d: Mark.visited, u: Mark.active, v: Mark.compare}, edgeMarks: {...tree(), e: Mark.compare}, dist: List.of(dist), frontier: open(), output: done.toList()),
          Say('relax', [g.labels[v], nd, g.labels[u]]),
        ));
      }
    }
  }
  out.add(AlgoFrame(g.view(marks: {for (final d in done) d: Mark.visited}, edgeMarks: tree(), dist: List.of(dist), output: done.toList()), const Say('dijkstraDone')));
  return out;
}
