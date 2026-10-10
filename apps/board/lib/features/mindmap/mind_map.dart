import 'dart:math' as math;
import 'dart:ui';

import 'package:kinetix_ink/kinetix_ink.dart';

/// One idea on a mind map. A branch's colour is its first-level ancestor's.
class MindNode {
  MindNode(this.id, this.text, {List<MindNode>? children, this.collapsed = false, this.nudge = Offset.zero}) : children = children ?? [];

  final String id;
  String text;
  final List<MindNode> children;
  bool collapsed;

  /// How far the teacher dragged this node from where the layout put it.
  Offset nudge;
}

/// The branch colours, one per first-level branch in turn (all readable on white and on a dark board).
const mindBranchColors = <Color>[
  Color(0xFFE53935),
  Color(0xFF1E88E5),
  Color(0xFF43A047),
  Color(0xFFFB8C00),
  Color(0xFF8E24AA),
  Color(0xFF00ACC1),
  Color(0xFFD81B60),
  Color(0xFF6D4C41),
];

/// A radial mind map: a central topic, branches around it, sub-branches beyond, laid out
/// automatically. Different from a flowchart: no shapes or connectors to place, only ideas.
class MindMap {
  MindMap(String topic) : root = MindNode('n0', topic);

  final MindNode root;
  int _next = 1;

  /// The ring distance between a node and its children.
  static const ring = 190.0;
  static const nodeSize = Size(150, 52);
  static const rootSize = Size(200, 80);

  MindNode? find(String id) => _walk(root).where((n) => n.id == id).firstOrNull;

  Iterable<MindNode> _walk(MindNode n) sync* {
    yield n;
    for (final c in n.children) {
      yield* _walk(c);
    }
  }

  List<MindNode> get nodes => _walk(root).toList();

  MindNode? parentOf(String id) => _walk(root).where((n) => n.children.any((c) => c.id == id)).firstOrNull;

  /// Adds a child under [parentId] (opening it if collapsed) and returns it.
  MindNode? addChild(String parentId, String text) {
    final p = find(parentId);
    if (p == null) return null;
    final n = MindNode('n${_next++}', text);
    p.children.add(n);
    p.collapsed = false;
    return n;
  }

  /// Adds a sibling right after [id]; the centre topic has none, so it gets a new branch instead.
  MindNode? addSibling(String id, String text) {
    final p = parentOf(id);
    if (p == null) return id == root.id ? addChild(id, text) : null;
    final n = MindNode('n${_next++}', text);
    p.children.insert(p.children.indexWhere((c) => c.id == id) + 1, n);
    return n;
  }

  /// Removes [id] and everything under it. The centre topic stays.
  bool remove(String id) {
    final p = parentOf(id);
    if (p == null) return false;
    p.children.removeWhere((c) => c.id == id);
    return true;
  }

  void toggle(String id) {
    final n = find(id);
    if (n != null && n.children.isNotEmpty) n.collapsed = !n.collapsed;
  }

  /// Forgets every drag.
  void autoLayout() {
    for (final n in nodes) {
      n.nudge = Offset.zero;
    }
  }

  /// The first-level branch [id] belongs to (-1 for the centre).
  int branchOf(String id) {
    if (id == root.id) return -1;
    for (final (i, c) in root.children.indexed) {
      if (_walk(c).any((n) => n.id == id)) return i;
    }
    return -1;
  }

  Color colorOf(String id) {
    final b = branchOf(id);
    return b < 0 ? const Color(0xFF37474F) : mindBranchColors[b % mindBranchColors.length];
  }

  /// Visible leaves under [n] (a collapsed node counts as one), the weight of its sector.
  int _weight(MindNode n) => n.collapsed || n.children.isEmpty ? 1 : n.children.fold(0, (a, c) => a + _weight(c));

  /// Where every visible node's centre is, round the origin: the centre topic at 0,0, the
  /// first level on a ring, each deeper level on a wider ring inside its parent's slice of the circle.
  Map<String, Offset> layout() {
    final out = <String, Offset>{root.id: root.nudge};
    void place(MindNode n, double a0, double a1, int depth) {
      if (n.collapsed) return;
      final total = n.children.fold(0, (a, c) => a + _weight(c));
      var a = a0;
      for (final c in n.children) {
        final span = (a1 - a0) * _weight(c) / total;
        final mid = a + span / 2;
        // A wider ring where a slice is crowded, so labels do not touch.
        final r = ring + (span < 0.5 ? 40 : 0);
        out[c.id] = Offset(math.cos(mid), math.sin(mid)) * (ring * depth + (r - ring)) + c.nudge;
        place(c, a, a + span, depth + 1);
        a += span;
      }
    }

    // Start at the top and go clockwise.
    place(root, -math.pi / 2, 3 * math.pi / 2, 1);
    return out;
  }

  /// The box of [n] at [centre].
  Rect rectOf(MindNode n, Offset centre) => Rect.fromCenter(center: centre, width: n == root ? rootSize.width : nodeSize.width, height: n == root ? rootSize.height : nodeSize.height);

  /// Board elements for the whole map: topic blocks and curved branches in each branch's colour,
  /// laid out round the origin (for [WhiteboardController.insert]).
  List<BoardElement> toElements() {
    final at = layout();
    final ids = <String, String>{};
    final nodesOut = <FlowNodeElement>[];
    final linksOut = <FlowLinkElement>[];
    for (final n in nodes) {
      final c = at[n.id];
      if (c == null) continue;
      final id = newElementId();
      ids[n.id] = id;
      final color = colorOf(n.id);
      nodesOut.add(FlowNodeElement(id: id, rect: rectOf(n, c), shape: FlowBlock.topic, text: n.text, color: color, fill: n == root ? null : color.withValues(alpha: 0.12), fontSize: n == root ? 28 : 20));
    }
    for (final n in nodes) {
      for (final ch in n.children) {
        if (!at.containsKey(ch.id) || n.collapsed) continue;
        final d = at[ch.id]! - at[n.id]!;
        final horizontal = d.dx.abs() >= d.dy.abs();
        final fromSide = horizontal ? (d.dx >= 0 ? FlowSide.right : FlowSide.left) : (d.dy >= 0 ? FlowSide.bottom : FlowSide.top);
        linksOut.add(FlowLinkElement(id: newElementId(), from: ids[n.id]!, to: ids[ch.id]!, fromSide: fromSide, toSide: fromSide.opposite, color: colorOf(ch.id), curved: true));
      }
    }
    return [...linksOut, ...nodesOut];
  }

  /// A starter map for a subject-agnostic lesson: the topic and nothing else.
  static MindMap starter(String topic, List<String> branches) {
    final m = MindMap(topic);
    for (final b in branches) {
      m.addChild(m.root.id, b);
    }
    return m;
  }
}
