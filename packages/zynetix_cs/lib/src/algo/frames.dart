/// One step of an algorithm, as the class sees it: a picture of the data ([AlgoView]) and a
/// sentence saying what just happened ([Say], translated by CsStrings). Every algorithm in
/// the kit is a pure function from its input to the list of its steps, so the animations are
/// tested like any other code and can be stepped back and forth.
library;

/// A sentence about a step: a key into CsStrings and the values it mentions.
class Say {
  const Say(this.key, [this.args = const []]);

  final String key;
  final List<Object> args;

  @override
  String toString() => args.isEmpty ? key : '$key(${args.join(', ')})';
}

/// How an item is marked in a step.
enum Mark { none, compare, swap, sorted, pivot, found, active, visited, dim }

class AlgoFrame {
  const AlgoFrame(this.view, this.say);

  final AlgoView view;
  final Say say;
}

sealed class AlgoView {
  const AlgoView();
}

/// An array as bars (sorting) or boxes (searching), with marks and named pointers (i, j, lo,
/// hi, mid).
class ArrayView extends AlgoView {
  const ArrayView(this.values, {this.marks = const {}, this.pointers = const {}, this.bars = true, this.split});

  final List<int> values;
  final Map<int, Mark> marks;
  final Map<String, int> pointers;
  final bool bars;

  /// Merge sort's sub-array [start, end) being worked on, shaded.
  final (int, int)? split;
}

enum LineKind { stack, queue, linkedList }

/// A stack (top on the right, drawn upright), a queue (front on the left) or a singly linked
/// list (arrows between nodes, then null).
class LineView extends AlgoView {
  const LineView(this.kind, this.values, {this.marks = const {}, this.pointers = const {}});

  final LineKind kind;
  final List<int> values;
  final Map<int, Mark> marks;
  final Map<String, int> pointers;
}

/// A binary tree: node i has [values][i], children [left][i] and [right][i] (-1 for none).
class TreeView extends AlgoView {
  const TreeView({required this.values, required this.left, required this.right, required this.root, this.marks = const {}, this.output = const []});

  final List<int> values;
  final List<int> left;
  final List<int> right;
  final int root;
  final Map<int, Mark> marks;

  /// The traversal so far.
  final List<int> output;
}

/// A graph on fixed positions (0..1 on both axes), with distances for Dijkstra.
class GraphView extends AlgoView {
  const GraphView({
    required this.labels,
    required this.positions,
    required this.edges,
    this.directed = false,
    this.marks = const {},
    this.edgeMarks = const {},
    this.dist = const [],
    this.frontier = const [],
    this.output = const [],
  });

  final List<String> labels;
  final List<(double, double)> positions;
  final List<(int, int, int)> edges;
  final bool directed;
  final Map<int, Mark> marks;

  /// Index into [edges] → mark.
  final Map<int, Mark> edgeMarks;

  /// Dijkstra's distances (null = ∞).
  final List<int?> dist;

  /// The queue (BFS), stack (DFS) or the open set (Dijkstra).
  final List<int> frontier;
  final List<int> output;
}

/// A hash table: [buckets] (chaining) or [slots] (open addressing).
class HashView extends AlgoView {
  const HashView({required this.buckets, this.marks = const {}, this.key, this.probe = const []});

  final List<List<int>> buckets;
  final Map<int, Mark> marks;

  /// The key being inserted or searched.
  final int? key;

  /// The slots looked at so far.
  final List<int> probe;
}
