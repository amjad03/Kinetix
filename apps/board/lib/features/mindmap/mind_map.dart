import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui';

import 'package:flutter/material.dart' show Icons;
import 'package:flutter/painting.dart' show FontWeight, TextAlign, TextDirection, TextPainter, TextSpan, TextStyle, TextWidthBasis;
import 'package:flutter/widgets.dart' show IconData;
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart' show KxFonts;

/// The outline of an idea's box.
enum MindShape { rounded, pill, rectangle, ellipse }

/// A set of colours for a map: the centre topic's and one per first-level branch in turn.
class MindTheme {
  const MindTheme(this.key, this.root, this.branches);
  final String key;
  final Color root;
  final List<Color> branches;
}

/// The themes to pick from (all readable on white and on a dark board).
const mindThemes = <MindTheme>[
  MindTheme('classic', Color(0xFF37474F), [Color(0xFFE53935), Color(0xFF1E88E5), Color(0xFF43A047), Color(0xFFFB8C00), Color(0xFF8E24AA), Color(0xFF00ACC1), Color(0xFFD81B60), Color(0xFF6D4C41)]),
  MindTheme('ocean', Color(0xFF0D3B66), [Color(0xFF1565C0), Color(0xFF00838F), Color(0xFF2E7D9A), Color(0xFF3949AB), Color(0xFF00897B), Color(0xFF0277BD), Color(0xFF5C6BC0), Color(0xFF26A69A)]),
  MindTheme('sunset', Color(0xFF5D2A42), [Color(0xFFD84315), Color(0xFFEF6C00), Color(0xFFC62828), Color(0xFFAD1457), Color(0xFFF9A825), Color(0xFF6A1B9A), Color(0xFFBF360C), Color(0xFFE65100)]),
  MindTheme('forest', Color(0xFF1B5E20), [Color(0xFF2E7D32), Color(0xFF558B2F), Color(0xFF00695C), Color(0xFF827717), Color(0xFF4E342E), Color(0xFF33691E), Color(0xFF00796B), Color(0xFF9E9D24)]),
  MindTheme('mono', Color(0xFF212121), [Color(0xFF424242), Color(0xFF616161), Color(0xFF455A64), Color(0xFF546E7A), Color(0xFF5D4037), Color(0xFF757575), Color(0xFF37474F), Color(0xFF6D6D6D)]),
];

/// The branch colours of the first theme.
List<Color> get mindBranchColors => mindThemes.first.branches;

/// Colours offered in the picker besides the theme's.
const mindExtraColors = <Color>[
  Color(0xFFE53935), Color(0xFFD81B60), Color(0xFF8E24AA), Color(0xFF5E35B1), Color(0xFF3949AB), Color(0xFF1E88E5),
  Color(0xFF00ACC1), Color(0xFF00897B), Color(0xFF43A047), Color(0xFF7CB342), Color(0xFFFDD835), Color(0xFFFB8C00),
  Color(0xFF6D4C41), Color(0xFF757575), Color(0xFF37474F), Color(0xFF000000),
];

/// The icons an idea can carry (stored by position in this list).
const mindIcons = <IconData>[
  Icons.lightbulb_outline, Icons.star_border, Icons.favorite_border, Icons.school_outlined, Icons.science_outlined, Icons.public,
  Icons.menu_book_outlined, Icons.calculate_outlined, Icons.palette_outlined, Icons.music_note, Icons.sports_soccer, Icons.eco_outlined,
  Icons.water_drop_outlined, Icons.wb_sunny_outlined, Icons.home_outlined, Icons.people_outline, Icons.flag_outlined, Icons.help_outline,
  Icons.warning_amber, Icons.check_circle_outline,
];

/// One idea on a mind map.
class MindNode {
  MindNode(this.id, this.text, {List<MindNode>? children, this.collapsed = false}) : children = children ?? [];

  final String id;
  String text;
  final List<MindNode> children;
  bool collapsed;

  /// This idea's own colour (null: its branch's).
  Color? color;

  /// A colour handed down to this idea's sub-branches (null: they follow their branch).
  Color? branchColor;
  MindShape shape = MindShape.rounded;

  /// Position in [mindIcons], or null.
  int? icon;
  Uint8List? image;

  MindNode copy() => MindNode(id, text, children: [for (final c in children) c.copy()], collapsed: collapsed)
    ..color = color
    ..branchColor = branchColor
    ..shape = shape
    ..icon = icon
    ..image = image;
}

/// A cubic curve from a parent's border to a child's.
class MindConnector {
  const MindConnector(this.parent, this.child, this.p0, this.c1, this.c2, this.p3, this.color);
  final String parent, child;
  final Offset p0, c1, c2, p3;
  final Color color;

  Offset at(double t) {
    final u = 1 - t;
    return p0 * (u * u * u) + c1 * (3 * u * u * t) + c2 * (3 * u * t * t) + p3 * (t * t * t);
  }

  Path get path => Path()
    ..moveTo(p0.dx, p0.dy)
    ..cubicTo(c1.dx, c1.dy, c2.dx, c2.dy, p3.dx, p3.dy);
}

/// A radial mind map: a central topic, branches around it, sub-branches beyond, laid out
/// again on every edit so no two ideas touch and no branch runs through an idea.
class MindMap {
  MindMap(String topic, {this.themeIndex = 0}) : root = MindNode('n0', topic)..shape = MindShape.ellipse;

  final MindNode root;
  int themeIndex;
  int _next = 1;

  static const gap = 30.0;
  static const rootSize = Size(200, 80);
  static const imageSide = 64.0;

  /// The widest an idea's words get before they wrap.
  static const textMax = 190.0, rootTextMax = 240.0;

  MindTheme get theme => mindThemes[themeIndex % mindThemes.length];

  MindMap clone() {
    final m = MindMap('', themeIndex: themeIndex);
    m.root
      ..text = root.text
      ..collapsed = root.collapsed
      ..color = root.color
      ..branchColor = root.branchColor
      ..shape = root.shape
      ..icon = root.icon
      ..image = root.image
      ..children.addAll([for (final c in root.children) c.copy()]);
    m._next = _next;
    return m;
  }

  MindNode? find(String id) => _walk(root).where((n) => n.id == id).firstOrNull;

  Iterable<MindNode> _walk(MindNode n) sync* {
    yield n;
    for (final c in n.children) {
      yield* _walk(c);
    }
  }

  List<MindNode> get nodes => _walk(root).toList();

  /// Ideas that are shown (not under a folded one).
  List<MindNode> get visible {
    final out = <MindNode>[];
    void go(MindNode n) {
      out.add(n);
      if (!n.collapsed) n.children.forEach(go);
    }

    go(root);
    return out;
  }

  MindNode? parentOf(String id) => _walk(root).where((n) => n.children.any((c) => c.id == id)).firstOrNull;

  int depthOf(String id) {
    var d = 0;
    for (var p = parentOf(id); p != null; p = parentOf(p.id)) {
      d++;
    }
    return d;
  }

  bool isInside(String id, String ancestorId) {
    for (var p = parentOf(id); p != null; p = parentOf(p.id)) {
      if (p.id == ancestorId) return true;
    }
    return false;
  }

  MindNode? addChild(String parentId, String text) {
    final p = find(parentId);
    if (p == null) return null;
    final n = MindNode('n${_next++}', text);
    n.shape = p.shape == MindShape.ellipse ? MindShape.rounded : p.shape;
    p.children.add(n);
    p.collapsed = false;
    return n;
  }

  /// A sibling right after [id]; the centre topic has none, so it gets a new branch instead.
  MindNode? addSibling(String id, String text) {
    final p = parentOf(id);
    if (p == null) return id == root.id ? addChild(id, text) : null;
    final n = MindNode('n${_next++}', text)..shape = find(id)!.shape;
    p.children.insert(p.children.indexWhere((c) => c.id == id) + 1, n);
    return n;
  }

  bool remove(String id) {
    final p = parentOf(id);
    if (p == null) return false;
    p.children.removeWhere((c) => c.id == id);
    return true;
  }

  bool canReparent(String id, String newParent) {
    final old = parentOf(id);
    return old != null && find(newParent) != null && id != newParent && !isInside(newParent, id) && old.id != newParent;
  }

  /// Moves [id] (with everything under it) to be the last child of [newParent]. False when that
  /// would make an idea its own descendant, or nothing changes.
  bool reparent(String id, String newParent) {
    if (!canReparent(id, newParent)) return false;
    final n = find(id)!, np = find(newParent)!, old = parentOf(id)!;
    old.children.remove(n);
    np.children.add(n);
    np.collapsed = false;
    return true;
  }

  void toggle(String id) {
    final n = find(id);
    if (n != null && n.children.isNotEmpty) n.collapsed = !n.collapsed;
  }

  /// The first-level branch [id] belongs to (-1 for the centre).
  int branchOf(String id) {
    if (id == root.id) return -1;
    for (final (i, c) in root.children.indexed) {
      if (_walk(c).any((n) => n.id == id)) return i;
    }
    return -1;
  }

  /// The colour [id]'s branch is drawn in: the nearest hand-me-down colour above it, else the theme's.
  Color branchColorOf(String id) {
    for (MindNode? n = find(id); n != null; n = parentOf(n.id)) {
      if (n.branchColor != null) return n.branchColor!;
    }
    final b = branchOf(id);
    return b < 0 ? theme.root : theme.branches[b % theme.branches.length];
  }

  Color colorOf(String id) => find(id)?.color ?? branchColorOf(id);

  /// Colours [id] alone, or with its whole branch (its sub-branches follow, any of their own are let go).
  void setColor(String id, Color? c, {bool branch = false}) {
    final n = find(id);
    if (n == null) return;
    if (!branch) {
      n.color = c;
      return;
    }
    for (final x in _walk(n)) {
      x.color = null;
      x.branchColor = null;
    }
    n.branchColor = c;
  }

  // ---- size -------------------------------------------------------------------------------

  double fontSizeOf(String id) {
    final d = depthOf(id);
    return d == 0 ? 24 : (d == 1 ? 18 : 16);
  }

  /// The words of [n] wrapped to fit (never cut short).
  TextPainter textOf(MindNode n) => TextPainter(
    text: TextSpan(text: n.text, style: TextStyle(fontFamily: KxFonts.board, fontFamilyFallback: KxFonts.fallback, fontSize: fontSizeOf(n.id), fontWeight: FontWeight.w700, height: 1.2)),
    textDirection: TextDirection.ltr,
    textAlign: TextAlign.center,
    textWidthBasis: TextWidthBasis.longestLine,
  )..layout(maxWidth: (n == root ? rootTextMax : textMax) - (n.icon != null ? 30 : 0));

  /// How big [n]'s box is: its wrapped words, its icon or picture, some padding.
  Size sizeOf(MindNode n) {
    final t = textOf(n);
    final isRoot = n == root;
    var w = t.width + (n.icon != null ? 30 : 0) + 28;
    var h = t.height + 20 + (n.image != null ? imageSide + 8 : 0);
    if (n.image != null) w = math.max(w, imageSide + 28);
    w = math.max(w, isRoot ? rootSize.width : 90);
    h = math.max(h, isRoot ? rootSize.height : 40);
    switch (n.shape) {
      case MindShape.ellipse:
        w *= 1.3;
        h *= 1.3;
      case MindShape.pill:
        w += 16;
      case MindShape.rounded || MindShape.rectangle:
        break;
    }
    return Size(w, h);
  }

  Rect rectOf(MindNode n, Offset centre) {
    final s = sizeOf(n);
    return Rect.fromCenter(center: centre, width: s.width, height: s.height);
  }

  // ---- layout -----------------------------------------------------------------------------

  /// Where every visible idea's centre is, round the origin (the topic at 0,0). Rings grow and the
  /// circle is shared by weight until no two ideas touch and no branch crosses an idea.
  Map<String, Offset> layout() {
    final vis = visible;
    final out = <String, Offset>{root.id: Offset.zero};
    if (vis.length == 1) return out;
    final sizes = {for (final n in vis) n.id: sizeOf(n)};
    final depth = {for (final n in vis) n.id: depthOf(n.id)};
    final maxDepth = depth.values.reduce(math.max);
    double half(MindNode n) => sizes[n.id]!.bottomRight(Offset.zero).distance / 2;
    final levelHalf = List<double>.filled(maxDepth + 1, 0);
    for (final n in vis) {
      levelHalf[depth[n.id]!] = math.max(levelHalf[depth[n.id]!], half(n));
    }
    final base = List<double>.filled(maxDepth + 1, 0);
    for (var d = 1; d <= maxDepth; d++) {
      base[d] = base[d - 1] + levelHalf[d - 1] + levelHalf[d] + gap;
    }
    Map<String, Offset>? last;
    var k = 1.0;
    for (var i = 0; i < 90; i++, k *= 1.06) {
      final r = [for (final b in base) b * k];
      final need = <String, double>{};
      double needOf(MindNode n) {
        final kids = n.collapsed ? const <MindNode>[] : n.children;
        final own = (half(n) * 2 + gap) / r[depth[n.id]!];
        final sum = kids.fold(0.0, (a, c) => a + needOf(c));
        return need[n.id] = math.max(own, sum);
      }

      final total = root.children.fold(0.0, (a, c) => a + needOf(c));
      if (total > 2 * math.pi) continue;
      final at = <String, Offset>{root.id: Offset.zero};
      void place(MindNode n, double a0, double a1) {
        if (n.collapsed) return;
        final sum = n.children.fold(0.0, (a, c) => a + need[c.id]!);
        var a = a0;
        for (final c in n.children) {
          final span = (a1 - a0) * need[c.id]! / sum;
          final mid = a + span / 2;
          at[c.id] = Offset(math.cos(mid), math.sin(mid)) * r[depth[c.id]!];
          place(c, a, a + span);
          a += span;
        }
      }

      final start = root.children.length == 1 ? -math.pi : -math.pi / 2;
      place(root, start, start + 2 * math.pi);
      last = at;
      if (_clean(at)) return at;
    }
    return last ?? out;
  }

  /// True when no two visible ideas touch and no connector runs through an idea.
  bool _clean(Map<String, Offset> at) {
    final list = [for (final n in visible) rectOf(n, at[n.id]!)];
    for (var i = 0; i < list.length; i++) {
      for (var j = i + 1; j < list.length; j++) {
        if (list[i].inflate(gap / 2 - 2).overlaps(list[j].inflate(gap / 2 - 2))) return false;
      }
    }
    final shapes = [for (final (i, n) in visible.indexed) shapePath(list[i].deflate(1.5), n.shape)];
    return connectors(at).every((c) => !crossesNodes(c, shapes));
  }

  // ---- connectors -------------------------------------------------------------------------

  /// The outline of a box of shape [s] in [r].
  static Path shapePath(Rect r, MindShape s) => switch (s) {
    MindShape.ellipse => (Path()..addOval(r)),
    MindShape.pill => (Path()..addRRect(RRect.fromRectAndRadius(r, Radius.circular(r.height / 2)))),
    MindShape.rounded => (Path()..addRRect(RRect.fromRectAndRadius(r, const Radius.circular(14)))),
    MindShape.rectangle => (Path()..addRect(r)),
  };

  /// Where the line from the middle of [r] towards [to] leaves the shape.
  static Offset borderPoint(Rect r, MindShape s, Offset to) {
    final path = shapePath(r, s);
    var lo = 0.0, hi = 1.0;
    while (path.contains(Offset.lerp(r.center, to, hi)!) && hi < 64) {
      lo = hi;
      hi *= 2;
    }
    for (var i = 0; i < 24; i++) {
      final m = (lo + hi) / 2;
      if (path.contains(Offset.lerp(r.center, to, m)!)) {
        lo = m;
      } else {
        hi = m;
      }
    }
    return Offset.lerp(r.center, to, lo)!;
  }

  /// Every connector of the visible map at the given centres: parent border to child border.
  List<MindConnector> connectors(Map<String, Offset> at) {
    final out = <MindConnector>[];
    for (final n in visible) {
      for (final c in n.collapsed ? const <MindNode>[] : n.children) {
        final ra = rectOf(n, at[n.id]!), rb = rectOf(c, at[c.id]!);
        final p0 = borderPoint(ra, n.shape, rb.center), p3 = borderPoint(rb, c.shape, ra.center);
        final d = p3 - p0;
        final len = d.distance;
        final u = len == 0 ? const Offset(1, 0) : d / len;
        final perp = Offset(-u.dy, u.dx);
        out.add(MindConnector(n.id, c.id, p0, p0 + u * len * 0.4 + perp * len * 0.07, p3 - u * len * 0.4 - perp * len * 0.07, p3, branchColorOf(c.id)));
      }
    }
    return out;
  }

  /// Whether the stretch of [c] between its ends is inside any of the node outlines [shapes].
  bool crossesNodes(MindConnector c, Iterable<Path> shapes) {
    for (var i = 1; i < 24; i++) {
      final p = c.at(i / 24);
      for (final s in shapes) {
        if (s.contains(p)) return true;
      }
    }
    return false;
  }

  // ---- board ------------------------------------------------------------------------------

  /// The bounds of the whole visible map.
  Rect boundsOf(Map<String, Offset> at) => visible.map((n) => rectOf(n, at[n.id]!)).reduce((a, b) => a.expandToInclude(b));

  FlowBlock _block(MindShape s) => switch (s) {
    MindShape.rectangle => FlowBlock.process,
    MindShape.pill => FlowBlock.terminal,
    _ => FlowBlock.topic,
  };

  /// Board elements for the whole map: editable topic blocks and curved branches in each
  /// branch's colour, with pictures over their blocks (for [WhiteboardController.insert]).
  List<BoardElement> toElements() {
    final at = layout();
    final ids = <String, String>{};
    final nodesOut = <BoardElement>[], linksOut = <FlowLinkElement>[];
    for (final n in visible) {
      final id = newElementId();
      ids[n.id] = id;
      final color = colorOf(n.id);
      final r = rectOf(n, at[n.id]!);
      nodesOut.add(FlowNodeElement(id: id, rect: r, shape: _block(n.shape), text: n.text, color: color, fill: color.withValues(alpha: n == root ? 0.25 : 0.12), fontSize: fontSizeOf(n.id), icon: n.icon == null ? null : mindIcons[n.icon!].codePoint, iconFamily: n.icon == null ? null : mindIcons[n.icon!].fontFamily));
      if (n.image != null) {
        nodesOut.add(ImageElement(id: newElementId(), rect: Rect.fromCenter(center: Offset(r.center.dx, r.top + 8 + imageSide / 2), width: imageSide, height: imageSide), bytes: n.image!));
      }
    }
    for (final n in visible) {
      for (final ch in n.collapsed ? const <MindNode>[] : n.children) {
        final d = at[ch.id]! - at[n.id]!;
        final horizontal = d.dx.abs() >= d.dy.abs();
        final fromSide = horizontal ? (d.dx >= 0 ? FlowSide.right : FlowSide.left) : (d.dy >= 0 ? FlowSide.bottom : FlowSide.top);
        linksOut.add(FlowLinkElement(id: newElementId(), from: ids[n.id]!, to: ids[ch.id]!, fromSide: fromSide, toSide: fromSide.opposite, color: branchColorOf(ch.id), curved: true));
      }
    }
    return [...linksOut, ...nodesOut];
  }

  static MindMap starter(String topic, List<String> branches) {
    final m = MindMap(topic);
    for (final b in branches) {
      m.addChild(m.root.id, b);
    }
    return m;
  }
}
